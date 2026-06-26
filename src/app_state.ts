// Central reactive state for the Concept Map Maker app.
//
// This is the ONLY stateful module. Every component wires to the API returned
// by create_app_state(); every pure module (derive_concepts, graph_depth,
// validate_document, layout_graph, document_codec) is consumed here behind
// memos. The design contract this module enforces:
//
//   - One createStore<CmapDocument> is the autosave unit and the single source
//     of document truth.
//   - One createSignal<HoverState> drives cross-highlighting; it is NOT part of
//     the document and never triggers layout, autosave, or derivation.
//   - The derivation chain (concepts -> depths -> validation) and the layout
//     memo depend ONLY on triples. Drag overrides change render positions, but
//     layout_by_key is computed from triples alone; render position is resolved
//     as overrides[key] ?? layout_by_key[key]. This "fix the design, not the
//     symptom" choice prevents the drag feedback loop that re-runs layout.
//   - Autosave is a 500ms-debounced write of the serialized document to a single
//     localStorage slot. When storage is unavailable or throws, autosave is
//     disabled and a non-blocking notice is surfaced via autosave_enabled().
//
// Storage is injected (a Pick<Storage, "getItem" | "setItem"> or null) so the
// whole module is testable headless in node via createRoot.

import { createStore, produce, reconcile } from "solid-js/store";
import { createSignal, createMemo, createRoot, createEffect } from "solid-js";
import type { Accessor, Setter } from "solid-js";

import { empty_document, parse_document, serialize_document } from "./document_codec";
import { derive_concepts } from "./derive_concepts";
import type { Concept } from "./derive_concepts";
import { compute_depths } from "./graph_depth";
import type { DepthResult } from "./graph_depth";
import { validate_document } from "./validate_document";
import { compute_layout } from "./layout_graph";
import type { LayoutResult, LayoutNode } from "./layout_graph";
import { concept_key } from "./types";
import type {
  CmapDocument,
  Triple,
  Theme,
  ThemeShape,
  ThemePalette,
  Position,
  HoverState,
  ConceptKey,
  ValidationItem,
} from "./types";

// The single localStorage slot key for autosave. One document, one slot.
const AUTOSAVE_KEY = "concept-map-maker:document";

// Debounce window for autosave writes, in milliseconds.
const AUTOSAVE_DEBOUNCE_MS = 500;

// Minimal storage surface this module needs. Injecting this (rather than
// reaching for window.localStorage directly) keeps the module node-testable and
// lets callers pass null to run with autosave disabled.
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

// The role a concept plays in the currently highlighted relationship. "from" is
// the source endpoint, "to" is the target endpoint, "both" is a concept that is
// itself hovered (a node hover lights up every triple touching it).
export type HighlightRole = "from" | "to" | "both";

// The role a concept-table cell plays relative to the single "active concept"
// (the concept whose cell is focused, or hovered while nothing is focused).
//   - "same": this cell's value IS the active concept (every matching cell).
//   - "from": this cell is the FROM endpoint of a triple whose TO is the active
//     concept (it points INTO the active concept).
//   - "to": this cell is the TO endpoint of a triple whose FROM is the active
//     concept (the active concept points OUT to it).
// Precedence when a concept qualifies for more than one (a cycle): same > from
// > to. The active concept itself is always "same".
export type CellRole = "from" | "to" | "same";

// Injection seam for the layout function so behavior tests can count how often
// layout runs (and assert a drag override never invokes it). Defaults to the
// real dagre adapter.
export type ComputeLayoutFn = (triples: Triple[]) => LayoutResult;

// The full reactive API every component consumes. Signatures here are the
// stable contract for the component lanes.
export interface AppState {
  // The reactive document store (read-only view for components; mutate via the
  // action methods below so pruning and autosave stay centralized).
  doc: CmapDocument;

  // Hover signal accessor and setter for cross-highlighting.
  hover: Accessor<HoverState>;
  set_hover: Setter<HoverState>;

  // Derivation chain memos (triples-only dependencies).
  concepts: Accessor<Concept[]>;
  depths: Accessor<DepthResult>;
  validation: Accessor<ValidationItem[]>;
  layout: Accessor<LayoutResult>;

  // Render-position resolution: override if present, else laid-out center.
  node_position: (key: ConceptKey) => Position | null;

  // Highlight memos derived from hover + the graph.
  highlighted_triples: Accessor<Set<string>>;
  highlighted_concepts: Accessor<Map<ConceptKey, HighlightRole>>;

  // The raw focused-cell channel value (the committed concept of the currently
  // focused cell, or null). Exposed so row unmount can guard its cleanup against
  // only the rows it actually owns (prevents a bulk re-render from stomping focus
  // that legitimately belongs to a surviving row).
  focused_concept: Accessor<ConceptKey | null>;

  // The single concept currently driving per-cell triple-table highlighting.
  // Focus wins over hover: it is the focused cell's committed value when a cell
  // is focused, else the hovered cell's value, else null. Empty cells never set
  // it. See set_cell_focus / set_cell_hover for the transition wiring.
  active_concept: Accessor<ConceptKey | null>;

  // One keyed map rebuilt per active_concept change. Each table cell does a
  // single lookup by its own concept key to find its CellRole (or no entry,
  // meaning "no highlight"). Empty when active_concept is null.
  cell_classification: Accessor<Map<ConceptKey, CellRole>>;

  // Cell focus/hover wiring for active_concept. Callers pass a cell's COMMITTED
  // value (or null to clear). An empty/blank value clears that channel so blank
  // cells never activate highlighting.
  set_cell_focus: (value: string | null) => void;
  set_cell_hover: (value: string | null) => void;

  // True when autosave is active; false when storage was unavailable/threw.
  autosave_enabled: Accessor<boolean>;

  // Document mutation actions.
  update_triple: (id: string, patch: Partial<Omit<Triple, "id">>) => void;
  add_triple: (triple?: Partial<Triple>) => string;
  remove_triple: (id: string) => void;
  set_title: (title: string) => void;
  set_theme: (patch: Partial<Theme>) => void;
  set_override: (key: ConceptKey, position: Position) => void;
  replace_document: (next: CmapDocument) => void;
  bulk_insert_triples: (rows: Array<Partial<Triple>>) => string[];
  insert_triple_after: (after_index: number, triple?: Partial<Triple>) => string;

  // Dispose the reactive root (tests and teardown).
  dispose: () => void;
}

//============================================
// next_id
//============================================
// Generate a short, collision-resistant id for new triples. Not
// cryptographic; just needs to be unique within one document session.
let id_counter = 0;
function next_id(prefix: string): string {
  // monotonic counter plus a random suffix avoids collisions across paste bursts
  id_counter += 1;
  const random_suffix = Math.random().toString(36).slice(2, 8);
  const id = `${prefix}_${id_counter}_${random_suffix}`;
  return id;
}

//============================================
// resolve_node_position
//============================================
// The pure render-position rule: a drag override wins, otherwise the laid-out
// center is used. Returns null when the concept is not in the layout and has no
// override. Layout itself is computed from triples only; this is the single
// place overrides re-enter, so dragging never perturbs layout. Exported so the
// rule is unit-testable without any reactive context.
export function resolve_node_position(
  key: ConceptKey,
  overrides: Record<ConceptKey, Position>,
  layout: LayoutResult,
): Position | null {
  // a drag override replaces the rendered position outright
  const override = overrides[key];
  if (override !== undefined) {
    return { x: override.x, y: override.y };
  }
  // otherwise fall back to the laid-out center
  const laid: LayoutNode | undefined = layout.nodes.get(key);
  if (laid === undefined) {
    return null;
  }
  return { x: laid.x, y: laid.y };
}

//============================================
// compute_highlighted_triples
//============================================
// Pure: the set of triple ids to emphasize for a given hover state.
//   - row/edge hover -> just that triple id.
//   - node hover -> every triple where the hovered concept is an endpoint.
// Exported for direct unit testing of the highlight contract.
export function compute_highlighted_triples(hover: HoverState, triples: Triple[]): Set<string> {
  const result = new Set<string>();
  if (hover.source === null) {
    return result;
  }
  // row or edge hover targets one specific triple by id
  if (hover.source === "row" || hover.source === "edge") {
    if (hover.tripleId !== null) {
      result.add(hover.tripleId);
    }
    return result;
  }
  // node hover: every triple where the hovered concept is an endpoint
  if (hover.source === "node" && hover.conceptKey !== null) {
    const target = hover.conceptKey;
    for (const triple of triples) {
      if (concept_key(triple.from) === target || concept_key(triple.to) === target) {
        result.add(triple.id);
      }
    }
  }
  return result;
}

//============================================
// compute_highlighted_concepts
//============================================
// Pure: role-tagged map of concept keys to emphasize for a given hover state.
//   - row/edge hover -> from-concept "from", to-concept "to"; a self-loop tags
//     the single concept "both".
//   - node hover -> the hovered concept tagged "both".
// Exported for direct unit testing of the role-tagging contract.
export function compute_highlighted_concepts(
  hover: HoverState,
  triple_by_id: Map<string, Triple>,
): Map<ConceptKey, HighlightRole> {
  const result = new Map<ConceptKey, HighlightRole>();
  if (hover.source === null) {
    return result;
  }
  // node hover: the hovered concept itself is the focus, tagged "both"
  if (hover.source === "node") {
    if (hover.conceptKey !== null) {
      result.set(hover.conceptKey, "both");
    }
    return result;
  }
  // row/edge hover: tag the triple's endpoints with their direction roles
  if ((hover.source === "row" || hover.source === "edge") && hover.tripleId !== null) {
    const triple = triple_by_id.get(hover.tripleId);
    if (triple !== undefined) {
      const from_key = concept_key(triple.from);
      const to_key = concept_key(triple.to);
      // a self-loop (from and to share a key) is tagged "both"
      if (from_key !== "" && from_key === to_key) {
        result.set(from_key, "both");
      } else {
        if (from_key !== "") {
          result.set(from_key, "from");
        }
        if (to_key !== "") {
          result.set(to_key, "to");
        }
      }
    }
  }
  return result;
}

//============================================
// compute_cell_classification
//============================================
// Pure: build the per-concept-key CellRole map for one active concept.
//
// Walks every triple exactly once and tags partner concepts relative to the
// active concept:
//   - the active concept key itself -> "same".
//   - a triple's FROM whose TO is the active concept -> "from" (points in).
//   - a triple's TO whose FROM is the active concept -> "to" (points out).
// Precedence when a concept qualifies for more than one role (a cycle through
// the active concept): same > from > to. We never downgrade an existing entry,
// and "same" is written last so it always wins.
//
// Returns an empty map when active is null or empty, so blank cells never
// activate highlighting. Exported for direct unit testing of the contract.
export function compute_cell_classification(
  active: ConceptKey | null,
  triples: Triple[],
): Map<ConceptKey, CellRole> {
  const result = new Map<ConceptKey, CellRole>();
  // null or empty active concept yields no highlighting at all
  if (active === null || active === "") {
    return result;
  }
  // walk every triple once, tagging the partner endpoint of any triple that
  // touches the active concept
  for (const triple of triples) {
    const from_key = concept_key(triple.from);
    const to_key = concept_key(triple.to);
    // active is this triple's TO: its FROM partner points INTO the active concept
    if (to_key === active && from_key !== "" && from_key !== active) {
      // do not downgrade a concept already tagged "from"; "from" beats "to"
      if (!result.has(from_key)) {
        result.set(from_key, "from");
      }
    }
    // active is this triple's FROM: its TO partner is pointed OUT to by active
    if (from_key === active && to_key !== "" && to_key !== active) {
      // only set "to" when no stronger role ("from") was already assigned
      if (!result.has(to_key)) {
        result.set(to_key, "to");
      }
    }
  }
  // the active concept itself is always "same"; written last so it overrides any
  // "from"/"to" a self-touching triple may have tried to assign to it
  result.set(active, "same");
  return result;
}

//============================================
// load_boot_document
//============================================
// Read the autosave slot and parse it. Invalid or absent stored JSON falls back
// to an empty document WITHOUT throwing: a corrupt slot must never brick boot.
// Returns the parsed (or empty) document plus whether the read path worked, so
// the caller can decide on the autosave-enabled state.
// Result of the boot read: the document to start from plus whether the storage
// read path is usable (drives the initial autosave-enabled state).
export interface BootResult {
  doc: CmapDocument;
  read_ok: boolean;
}

export function load_boot_document(storage: StorageLike | null): BootResult {
  // no storage injected: run with a fresh document, read path is not available
  if (storage === null) {
    return { doc: empty_document(), read_ok: false };
  }
  // reading can throw (e.g. localStorage blocked by privacy settings); treat any
  // failure as "no usable storage" and fall back to an empty document
  let stored: string | null;
  try {
    stored = storage.getItem(AUTOSAVE_KEY);
  } catch {
    return { doc: empty_document(), read_ok: false };
  }
  // nothing saved yet: empty document, but the read path itself works
  if (stored === null) {
    return { doc: empty_document(), read_ok: true };
  }
  // parse loudly inside a guard: a malformed slot falls back to empty rather
  // than crashing the app on boot
  try {
    const parsed = parse_document(stored);
    return { doc: parsed, read_ok: true };
  } catch {
    return { doc: empty_document(), read_ok: true };
  }
}

//============================================
// attempt_storage_write
//============================================
// Try to persist a serialized document to the autosave slot. Returns true on
// success, false when the write throws (over quota, blocked storage) or when no
// storage is available. A false result is what disables autosave and surfaces
// the non-blocking notice. Exported so the write-resilience contract is testable
// without the reactive effect.
export function attempt_storage_write(storage: StorageLike | null, json_text: string): boolean {
  if (storage === null) {
    return false;
  }
  try {
    storage.setItem(AUTOSAVE_KEY, json_text);
    return true;
  } catch {
    // write failed: caller flips autosave_enabled to false
    return false;
  }
}

//============================================
// create_app_state
//============================================
// Construct the reactive state graph and return the component-facing API.
// storage is the injected localStorage-like slot (or null to disable autosave);
// compute_layout_fn is an injection seam used by behavior tests to observe how
// often layout runs.
export function create_app_state(
  storage: StorageLike | null,
  compute_layout_fn: ComputeLayoutFn = compute_layout,
): AppState {
  // boot: load and validate the autosave slot before any reactive wiring
  const boot = load_boot_document(storage);

  // dispose handle captured from createRoot so tests and teardown can clean up
  let dispose_root: () => void = () => {};

  // build the entire reactive graph inside a root so memos/effects have an owner
  // even in a non-component (node test) context
  const api = build_state(boot.doc, storage, boot.read_ok, compute_layout_fn, (d) => {
    dispose_root = d;
  });

  // splice the captured disposer into the returned API
  api.dispose = (): void => {
    dispose_root();
  };
  return api;
}

//============================================
// build_state
//============================================
// The reactive body. Separated from create_app_state so the createRoot owner
// wraps exactly the signal/store/memo/effect graph and nothing else.
function build_state(
  initial_doc: CmapDocument,
  storage: StorageLike | null,
  read_ok: boolean,
  compute_layout_fn: ComputeLayoutFn,
  capture_dispose: (dispose: () => void) => void,
): AppState {
  // the document store: the autosave unit and single source of truth
  const [doc, set_doc] = createStore<CmapDocument>(initial_doc);

  // hover signal: ephemeral, not part of the document, never autosaved
  const [hover, set_hover] = createSignal<HoverState>({
    source: null,
    tripleId: null,
    conceptKey: null,
  });

  // autosave-enabled flag. Starts true only when a real read path exists; a
  // failed write later flips it to false and surfaces the non-blocking notice.
  const [autosave_enabled, set_autosave_enabled] = createSignal<boolean>(
    storage !== null && read_ok,
  );

  //--------------------------------------------
  // derivation chain (triples-only dependencies)
  //--------------------------------------------

  // concepts: unique bubbles with adjacency. Reads doc.triples only, so override
  // or hover changes never recompute it.
  const concepts = createMemo<Concept[]>(() => derive_concepts(doc.triples));

  // depths: BFS depth from origins. Triples-only.
  const depths = createMemo<DepthResult>(() => compute_depths(doc.triples));

  // validation: rubric/quality/hint items. Depends on triples only.
  const validation = createMemo<ValidationItem[]>(() => validate_document(doc));

  // layout: dagre positions keyed by concept. CRITICAL CONTRACT: reads ONLY
  // doc.triples, never doc.overrides. A drag override changes overrides and must
  // not re-run this memo. The injected compute_layout_fn lets tests assert that.
  const layout = createMemo<LayoutResult>(() => compute_layout_fn(doc.triples));

  //--------------------------------------------
  // render-position resolution
  //--------------------------------------------

  // node_position: the rendered center for a concept = drag override if present,
  // else the laid-out center. Delegates to the pure resolve_node_position rule;
  // reading doc.overrides and layout() here keeps it reactive.
  const node_position = (key: ConceptKey): Position | null => {
    return resolve_node_position(key, doc.overrides, layout());
  };

  //--------------------------------------------
  // highlight memos (hover-driven)
  //--------------------------------------------

  // index triples by id once per triples change so hover lookups are O(1)
  const triple_by_id = createMemo<Map<string, Triple>>(() => {
    const index = new Map<string, Triple>();
    for (const triple of doc.triples) {
      index.set(triple.id, triple);
    }
    return index;
  });

  // highlighted_triples: the set of triple ids to emphasize for the current
  // hover. Delegates to the pure compute_highlighted_triples helper; reads hover
  // and doc.triples to stay reactive.
  const highlighted_triples = createMemo<Set<string>>(() =>
    compute_highlighted_triples(hover(), doc.triples),
  );

  // highlighted_concepts: role-tagged map of concept keys to emphasize.
  // Delegates to the pure compute_highlighted_concepts helper, fed the id index.
  const highlighted_concepts = createMemo<Map<ConceptKey, HighlightRole>>(() =>
    compute_highlighted_concepts(hover(), triple_by_id()),
  );

  //--------------------------------------------
  // active-concept (per-cell triple-table highlighting)
  //--------------------------------------------

  // Two independent channels: the focused cell's concept and the hovered cell's
  // concept. Each holds a normalized ConceptKey or null. Empty values are stored
  // as null so a blank cell never activates highlighting. These are separate
  // from the map-pane hover signal above and never feed the map.
  const [focused_concept, set_focused_concept] = createSignal<ConceptKey | null>(null);
  const [hovered_concept, set_hovered_concept] = createSignal<ConceptKey | null>(null);

  // Normalize a caller-provided cell value into a stored channel value: blank or
  // null becomes null (no activation), otherwise the normalized concept key.
  const normalize_cell_value = (value: string | null): ConceptKey | null => {
    if (value === null) {
      return null;
    }
    const key = concept_key(value);
    return key === "" ? null : key;
  };

  // set_cell_focus: a from/to cell gained or lost focus. Pass the cell's
  // COMMITTED value on focus-in, null on focus-out. Focus always wins over hover
  // while set (see active_concept below).
  const set_cell_focus = (value: string | null): void => {
    set_focused_concept(normalize_cell_value(value));
  };

  // set_cell_hover: a from/to cell was hovered or unhovered. Pass the cell's
  // value on enter, null on leave. Only takes effect when no cell is focused.
  const set_cell_hover = (value: string | null): void => {
    set_hovered_concept(normalize_cell_value(value));
  };

  // active_concept: focus wins over hover. When a cell is focused, the focused
  // concept is active; otherwise the hovered concept; otherwise null. Focus
  // leaving (focused -> null) falls back to the current hover target or clears.
  const active_concept = createMemo<ConceptKey | null>(() => {
    const focused = focused_concept();
    if (focused !== null) {
      return focused;
    }
    return hovered_concept();
  });

  // cell_classification: one keyed map rebuilt only when active_concept changes
  // (or the triple set changes). Each table cell does a single lookup by its own
  // concept key. Delegates to the pure compute_cell_classification helper.
  const cell_classification = createMemo<Map<ConceptKey, CellRole>>(() =>
    compute_cell_classification(active_concept(), doc.triples),
  );

  //--------------------------------------------
  // mutation actions
  //--------------------------------------------

  // update_triple: patch one or more fields of a triple by id.
  const update_triple = (id: string, patch: Partial<Omit<Triple, "id">>): void => {
    set_doc(
      "triples",
      (t) => t.id === id,
      produce((triple: Triple) => {
        // apply only the provided fields, leaving id and others intact
        if (patch.from !== undefined) triple.from = patch.from;
        if (patch.verb !== undefined) triple.verb = patch.verb;
        if (patch.to !== undefined) triple.to = patch.to;
      }),
    );
  };

  // add_triple: append a triple (optionally pre-filled) and return its id.
  const add_triple = (triple?: Partial<Triple>): string => {
    const id = triple?.id ?? next_id("t");
    const row: Triple = {
      id,
      from: triple?.from ?? "",
      verb: triple?.verb ?? "",
      to: triple?.to ?? "",
    };
    set_doc("triples", doc.triples.length, row);
    return id;
  };

  // remove_triple: drop a triple by id.
  const remove_triple = (id: string): void => {
    set_doc(
      "triples",
      doc.triples.filter((t) => t.id !== id),
    );
  };

  // set_title: rename the document.
  const set_title = (title: string): void => {
    set_doc("title", title);
  };

  // set_theme: patch shape and/or palette.
  const set_theme = (patch: Partial<Theme>): void => {
    if (patch.shape !== undefined) {
      const shape: ThemeShape = patch.shape;
      set_doc("theme", "shape", shape);
    }
    if (patch.palette !== undefined) {
      const palette: ThemePalette = patch.palette;
      set_doc("theme", "palette", palette);
    }
  };

  // set_override: record a drag-adjusted position for a concept key. This writes
  // to overrides only; it must never disturb the triples reference, so layout
  // does not recompute.
  const set_override = (key: ConceptKey, position: Position): void => {
    set_doc("overrides", key, { x: position.x, y: position.y });
  };

  // replace_document: swap the entire working document (open-file / new-doc).
  // reconcile keeps fine-grained reactivity stable across the swap.
  const replace_document = (next: CmapDocument): void => {
    set_doc(reconcile(next));
  };

  // insert_triple_after: insert a single triple directly after the given row
  // index and return its id. Used by the chain button to insert a row with a
  // pre-filled "from" directly below the source row.
  const insert_triple_after = (after_index: number, triple?: Partial<Triple>): string => {
    const id = triple?.id ?? next_id("t");
    const row: Triple = {
      id,
      from: triple?.from ?? "",
      verb: triple?.verb ?? "",
      to: triple?.to ?? "",
    };
    set_doc("triples", (current) => {
      // Insert at after_index + 1; clamp to end if out of range.
      const insert_at = Math.min(after_index + 1, current.length);
      const next = [...current];
      next.splice(insert_at, 0, row);
      return next;
    });
    return id;
  };

  // bulk_insert_triples: append many rows at once (spreadsheet paste). Returns
  // the new ids in order. Single store write so layout/derivation recompute once.
  const bulk_insert_triples = (rows: Array<Partial<Triple>>): string[] => {
    const new_rows: Triple[] = rows.map((r) => ({
      id: r.id ?? next_id("t"),
      from: r.from ?? "",
      verb: r.verb ?? "",
      to: r.to ?? "",
    }));
    set_doc("triples", (current) => [...current, ...new_rows]);
    return new_rows.map((r) => r.id);
  };

  //--------------------------------------------
  // autosave (500ms debounced, single slot)
  //--------------------------------------------

  // pending debounce timer handle; null when no write is queued
  let autosave_timer: ReturnType<typeof setTimeout> | null = null;
  // the most recent serialized payload waiting to be flushed
  let pending_payload: string | null = null;

  // perform the actual write of the queued payload. A failing write (quota,
  // blocked storage) disables autosave and surfaces the notice via the flag
  // instead of throwing.
  const flush_autosave = (): void => {
    autosave_timer = null;
    if (storage === null || pending_payload === null) {
      return;
    }
    const json_text = pending_payload;
    pending_payload = null;
    // a failed write disables autosave so the UI can show a non-blocking notice
    const ok = attempt_storage_write(storage, json_text);
    if (!ok) {
      set_autosave_enabled(false);
    }
  };

  // schedule_autosave: queue a serialized payload and debounce the write so a
  // burst of edits collapses to one save. Serialization happens in the tracking
  // context (the effect), so the document is read deeply and every field change
  // schedules a save.
  const schedule_autosave = (json_text: string): void => {
    if (storage === null) {
      return;
    }
    pending_payload = json_text;
    if (autosave_timer !== null) {
      clearTimeout(autosave_timer);
    }
    autosave_timer = setTimeout(flush_autosave, AUTOSAVE_DEBOUNCE_MS);
  };

  // assemble the API object; dispose is spliced in by create_app_state
  const api: AppState = {
    doc,
    hover,
    set_hover,
    concepts,
    depths,
    validation,
    layout,
    node_position,
    highlighted_triples,
    highlighted_concepts,
    focused_concept,
    active_concept,
    cell_classification,
    set_cell_focus,
    set_cell_hover,
    autosave_enabled,
    update_triple,
    add_triple,
    remove_triple,
    set_title,
    set_theme,
    set_override,
    replace_document,
    bulk_insert_triples,
    insert_triple_after,
    dispose: () => {},
  };

  // wire the document-change autosave effect inside a createRoot so it has an
  // owner outside of any component. Reading every autosaved field below makes
  // this effect re-run on any document mutation; hover and layout are NOT read
  // here, so they never schedule a save. The effect skips its very first run so
  // boot-loading the document does not immediately re-save it.
  createRoot((dispose) => {
    capture_dispose(dispose);
    let first_run = true;
    createEffect(() => {
      // serialize inside the tracking context so every document field (title,
      // triples, overrides, theme) is read deeply: any mutation to the autosaved
      // document re-runs this effect. Hover and layout are NOT read here, so
      // they never schedule a save.
      const json_text = serialize_document(doc);
      // skip the initial run: a freshly booted document does not need re-saving
      if (first_run) {
        first_run = false;
        return;
      }
      schedule_autosave(json_text);
    });
  });

  return api;
}

//============================================
// browser_storage
//============================================
// Resolve the browser localStorage slot when running in a real browser, or null
// in a non-browser (node/test) context. Reaching for localStorage is guarded so
// importing this module never throws server-side or under SSR. main.tsx calls
// create_app_state(browser_storage()) once and passes the result down via
// context; tests call create_app_state(...) directly with an injected fake.
export function browser_storage(): StorageLike | null {
  // only a browser exposes a window with localStorage; everything else is null
  if (typeof window === "undefined") {
    return null;
  }
  // localStorage access itself can throw (privacy mode, disabled storage); a
  // null result means "run with autosave disabled"
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
