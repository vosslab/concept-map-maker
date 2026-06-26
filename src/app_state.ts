// Central reactive state for the pseudo-code flowchart editor.
//
// This is the ONLY stateful module. Every component wires to the API returned by
// create_app_state(); every pure module (derive_graph, normalize, layout_graph,
// document_codec) is consumed here behind memos. The design contract:
//
//   - One createStore<FlowDocument> is the autosave unit and the single source of
//     document truth. The document carries the canonical pseudo-code `source`
//     (submittedSource), plus title, overrides, and theme.
//   - draftSource is a separate signal holding the live editor text. Typing only
//     updates draftSource; it never touches the document or the rendered graph.
//   - The rendered graph derives ONLY from doc.source (the last valid submitted
//     source), never from draftSource. So typing alone cannot change the chart.
//   - update_flowchart() is the single commit point: it parses draftSource, and
//     on success rewrites doc.source (and the editor) to canonical text, prunes
//     stale overrides by live node id, and clears the parse error. On failure it
//     leaves document, draft, and graph untouched and surfaces a line-referenced
//     parse error.
//   - The flow layout depends only on the graph; drag overrides change render
//     positions but never re-run layout (render position is resolved as
//     overrides[id] ?? layout center). This prevents a drag feedback loop.
//   - Autosave is a 500ms-debounced write of the serialized document to a single
//     localStorage slot; a failed write disables autosave and surfaces a notice.
//
// Storage is injected (a Pick<Storage, "getItem" | "setItem"> or null) so the
// whole module is testable headless in node via createRoot.

import { createStore, reconcile } from "solid-js/store";
import { createSignal, createMemo, createRoot, createEffect, batch } from "solid-js";
import type { Accessor, Setter } from "solid-js";

import {
  empty_document,
  parse_document,
  serialize_document,
  prune_overrides,
} from "./document_codec";
import { derive_graph } from "./derive_graph";
import { normalize } from "./pseudo_lang/normalize";
import { compute_flow_layout } from "./layout_graph";
import type { FlowLayoutResult } from "./layout_graph";
import type { FlowDocument, FlowGraph, FlowNodeId, FlowTheme, Position, HoverState } from "./types";

//============================================
// DepthResult
//============================================
// Return type for compute_flow_depths: the BFS depth of each node from the graph
// origins, keyed by FlowNode.id, plus the set of origin node ids.
export interface DepthResult {
  // BFS depth from the nearest origin, or a fallback depth for unreachable nodes.
  depth_by_key: Map<FlowNodeId, number>;
  // Node ids that are graph origins (in-degree 0 over forward edges).
  origin_keys: Set<FlowNodeId>;
}

// The single localStorage slot key for autosave. One document, one slot.
const AUTOSAVE_KEY = "pseudo-code-flowchart:document";

// Debounce window for autosave writes, in milliseconds.
const AUTOSAVE_DEBOUNCE_MS = 500;

// A graph with no nodes or edges, used for empty source and for the loaded-file
// degrade path (see the graph memo). Frozen so it is never mutated by accident.
const EMPTY_GRAPH: FlowGraph = { nodes: [], edges: [] };

// Minimal storage surface this module needs. Injecting this (rather than reaching
// for window.localStorage directly) keeps the module node-testable and lets
// callers pass null to run with autosave disabled.
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

// The role a node plays in the currently highlighted relationship. "both" is a
// hovered node itself; "from"/"to" tag the endpoints of a hovered edge.
export type HighlightRole = "from" | "to" | "both";

// Injection seam for the layout function so behavior tests can count how often
// layout runs. Defaults to the real dagre flow adapter.
export type ComputeFlowLayoutFn = (graph: FlowGraph) => FlowLayoutResult;

// The full reactive API every component consumes. Signatures here are the stable
// contract for the component lanes.
export interface AppState {
  // The reactive document store (read-only view for components; mutate via the
  // action methods below so pruning and autosave stay centralized).
  doc: FlowDocument;

  // The live editor text. Typing sets this only; the graph is unaffected.
  draft_source: Accessor<string>;
  set_draft_source: (text: string) => void;

  // The current line-referenced parse error, or undefined when the last submit
  // (or format) succeeded.
  parse_error: Accessor<string | undefined>;

  // The rendered flow graph, derived from doc.source (the last valid submitted
  // source). Never derived from draft_source.
  graph: Accessor<FlowGraph>;

  // Dagre flow layout for the current graph (positions keyed by FlowNode.id).
  layout: Accessor<FlowLayoutResult>;

  // BFS depth from the graph origins, keyed by FlowNode.id; drives node fill.
  depths: Accessor<DepthResult>;

  // Hover-driven highlight roles, keyed by FlowNode.id.
  highlighted_nodes: Accessor<Map<FlowNodeId, HighlightRole>>;

  // Render-position resolution: override if present, else laid-out center.
  node_position: (id: FlowNodeId) => Position | null;

  // Hover signal accessor and setter for cross-highlighting.
  hover: Accessor<HoverState>;
  set_hover: Setter<HoverState>;

  // True when autosave is active; false when storage was unavailable/threw.
  autosave_enabled: Accessor<boolean>;

  // The submit commit point: parse draft_source, canonicalize, update graph.
  update_flowchart: () => void;

  // Canonicalize draft_source in place (the Format action); graph unchanged.
  format_source: () => void;

  // Load a source string (example/open-source): set the draft then submit it.
  load_source: (source: string) => void;

  // Document mutation actions.
  set_title: (title: string) => void;
  set_theme: (patch: Partial<FlowTheme>) => void;
  set_override: (id: FlowNodeId, position: Position) => void;
  replace_document: (next: FlowDocument) => void;

  // Dispose the reactive root (tests and teardown).
  dispose: () => void;
}

//============================================
// error_message
//============================================
// Extract a human-readable message from an unknown thrown value. Parser errors
// are Error instances carrying a "Line N: ..." message; anything else stringifies.
function error_message(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message;
}

//============================================
// compute_flow_depths
//============================================
// BFS depth of every flow node from the graph origins, keyed by FlowNode.id.
//
// Origins are nodes with in-degree 0 over FORWARD edges (kind !== "back"); for a
// well-formed chart this is the Start terminal. Back edges are excluded so a loop
// return never makes its header look unreachable. Nodes not reached from any
// origin (comment annotations, disconnected fragments) get a fallback depth one
// past the deepest reached node. With no origins, every node is depth 0.
//
// Exported so the depth contract is unit-testable without a reactive context.
export function compute_flow_depths(graph: FlowGraph): DepthResult {
  // adjacency and in-degree over forward edges only
  const out_edges = new Map<FlowNodeId, FlowNodeId[]>();
  const in_degree = new Map<FlowNodeId, number>();
  // seed every node so isolated nodes still appear in the maps
  for (const node of graph.nodes) {
    out_edges.set(node.id, []);
    in_degree.set(node.id, 0);
  }
  for (const edge of graph.edges) {
    // a loop return path must not affect ranking depth
    if (edge.kind === "back") {
      continue;
    }
    // ignore edges that reference a node not in the graph (defensive)
    const from_list = out_edges.get(edge.from);
    if (from_list === undefined || !in_degree.has(edge.to)) {
      continue;
    }
    from_list.push(edge.to);
    in_degree.set(edge.to, (in_degree.get(edge.to) ?? 0) + 1);
  }

  // origins: in-degree 0 over forward edges
  const origin_keys = new Set<FlowNodeId>();
  for (const node of graph.nodes) {
    if ((in_degree.get(node.id) ?? 0) === 0) {
      origin_keys.add(node.id);
    }
  }

  const depth_by_key = new Map<FlowNodeId, number>();
  // no origins (every node in a cycle): assign depth 0 to all and return
  if (origin_keys.size === 0) {
    for (const node of graph.nodes) {
      depth_by_key.set(node.id, 0);
    }
    return { depth_by_key, origin_keys };
  }

  // multi-source BFS from all origins simultaneously
  const queue: Array<{ id: FlowNodeId; depth: number }> = [];
  for (const id of origin_keys) {
    depth_by_key.set(id, 0);
    queue.push({ id, depth: 0 });
  }
  let head = 0;
  let max_depth = 0;
  while (head < queue.length) {
    const item = queue[head];
    head += 1;
    if (item === undefined) {
      continue;
    }
    if (item.depth > max_depth) {
      max_depth = item.depth;
    }
    for (const next_id of out_edges.get(item.id) ?? []) {
      // first visit gives the minimum BFS distance
      if (!depth_by_key.has(next_id)) {
        const next_depth = item.depth + 1;
        depth_by_key.set(next_id, next_depth);
        if (next_depth > max_depth) {
          max_depth = next_depth;
        }
        queue.push({ id: next_id, depth: next_depth });
      }
    }
  }

  // fallback depth for nodes unreachable from any origin
  const fallback_depth = max_depth + 1;
  for (const node of graph.nodes) {
    if (!depth_by_key.has(node.id)) {
      depth_by_key.set(node.id, fallback_depth);
    }
  }
  return { depth_by_key, origin_keys };
}

//============================================
// compute_flow_highlighted_nodes
//============================================
// Pure: role-tagged map of node ids to emphasize for a given hover state. A node
// hover tags the hovered node "both"; a null source highlights nothing.
// Exported for direct unit testing of the highlight contract.
export function compute_flow_highlighted_nodes(hover: HoverState): Map<FlowNodeId, HighlightRole> {
  const result = new Map<FlowNodeId, HighlightRole>();
  // node hover: the hovered node itself is the focus, tagged "both"
  if (hover.source === "node" && hover.nodeId !== null) {
    result.set(hover.nodeId, "both");
  }
  return result;
}

//============================================
// resolve_node_position
//============================================
// The pure render-position rule: a drag override wins, otherwise the laid-out
// center is used. Returns null when the node is not in the layout and has no
// override. Exported so the rule is unit-testable without a reactive context.
export function resolve_node_position(
  id: FlowNodeId,
  overrides: Record<FlowNodeId, Position>,
  layout: FlowLayoutResult,
): Position | null {
  // a drag override replaces the rendered position outright
  const override = overrides[id];
  if (override !== undefined) {
    return { x: override.x, y: override.y };
  }
  // otherwise fall back to the laid-out center
  const laid = layout.nodes.get(id);
  if (laid === undefined) {
    return null;
  }
  return { x: laid.x, y: laid.y };
}

//============================================
// load_boot_document
//============================================
// Result of the boot read: the document to start from plus whether the storage
// read path is usable (drives the initial autosave-enabled state).
export interface BootResult {
  doc: FlowDocument;
  read_ok: boolean;
}

// Read the autosave slot and parse it. Invalid or absent stored JSON falls back
// to an empty document WITHOUT throwing: a corrupt slot must never brick boot.
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
  // parse loudly inside a guard: a malformed slot falls back to empty rather than
  // crashing the app on boot
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
// storage is available. A false result disables autosave and surfaces the notice.
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
// compute_flow_layout_fn is an injection seam used by behavior tests to observe
// how often layout runs.
export function create_app_state(
  storage: StorageLike | null,
  compute_flow_layout_fn: ComputeFlowLayoutFn = compute_flow_layout,
): AppState {
  // boot: load and validate the autosave slot before any reactive wiring
  const boot = load_boot_document(storage);

  // dispose handle captured from createRoot so tests and teardown can clean up
  let dispose_root: () => void = () => {};

  // build the entire reactive graph inside a root so memos/effects have an owner
  // even in a non-component (node test) context
  const api = build_state(boot.doc, storage, boot.read_ok, compute_flow_layout_fn, (d) => {
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
  initial_doc: FlowDocument,
  storage: StorageLike | null,
  read_ok: boolean,
  compute_flow_layout_fn: ComputeFlowLayoutFn,
  capture_dispose: (dispose: () => void) => void,
): AppState {
  // the document store: the autosave unit and single source of truth
  const [doc, set_doc] = createStore<FlowDocument>(initial_doc);

  // the live editor text. Initialized to the booted source so the editor opens
  // showing the last saved (canonical) source.
  const [draft_source, set_draft_source] = createSignal<string>(initial_doc.source);

  // the current line-referenced parse error; undefined while the last submit/format
  // succeeded
  const [parse_error, set_parse_error] = createSignal<string | undefined>(undefined);

  // hover signal: ephemeral, not part of the document, never autosaved
  const [hover, set_hover] = createSignal<HoverState>({
    source: null,
    nodeId: null,
  });

  // autosave-enabled flag. Starts true only when a real read path exists; a failed
  // write later flips it to false and surfaces the non-blocking notice.
  const [autosave_enabled, set_autosave_enabled] = createSignal<boolean>(
    storage !== null && read_ok,
  );

  //--------------------------------------------
  // derivation chain (graph derived from doc.source only)
  //--------------------------------------------

  // graph: the rendered flow graph. Derived ONLY from doc.source (the last valid
  // submitted source), so typing into draft_source never changes the chart.
  // doc.source is normally canonical and parses cleanly; the try/catch guards the
  // one boundary case of a hand-edited project file whose source is malformed, so
  // a bad file degrades to an empty chart instead of crashing the render.
  const graph = createMemo<FlowGraph>(() => {
    const src = doc.source;
    if (src.trim() === "") {
      return EMPTY_GRAPH;
    }
    try {
      return derive_graph(src);
    } catch (err) {
      // a hand-edited project file can carry malformed source; warn and degrade
      // to an empty chart instead of crashing the render on boot
      // eslint-disable-next-line no-console -- intentional boot-robustness diagnostic
      console.warn(`flowchart source failed to parse: ${error_message(err)}`);
      return EMPTY_GRAPH;
    }
  });

  // layout: dagre flow positions keyed by node id. Reads ONLY the graph, never the
  // overrides, so a drag does not re-run layout. The injected fn lets tests count.
  const layout = createMemo<FlowLayoutResult>(() => compute_flow_layout_fn(graph()));

  // depths: BFS depth from the graph origins, keyed by node id.
  const depths = createMemo<DepthResult>(() => compute_flow_depths(graph()));

  // highlight roles for the current hover, keyed by node id
  const highlighted_nodes = createMemo<Map<FlowNodeId, HighlightRole>>(() =>
    compute_flow_highlighted_nodes(hover()),
  );

  //--------------------------------------------
  // render-position resolution
  //--------------------------------------------

  // node_position: the rendered center for a node = drag override if present, else
  // the laid-out center. Reading doc.overrides and layout() here keeps it reactive.
  const node_position = (id: FlowNodeId): Position | null => {
    return resolve_node_position(id, doc.overrides, layout());
  };

  //--------------------------------------------
  // submit / format actions
  //--------------------------------------------

  // update_flowchart: the single commit point. Parse draft_source; on success
  // canonicalize it, rewrite doc.source and the editor to the canonical text,
  // prune stale overrides by live node id, and clear the error. On failure leave
  // the document, draft, and graph untouched and surface the line-referenced error.
  const update_flowchart = (): void => {
    const src = draft_source();
    let next_graph: FlowGraph;
    let canonical: string;
    try {
      // derive_graph throws a line-referenced Error on invalid source; normalize
      // re-parses the same source, so it succeeds whenever derive_graph did
      next_graph = derive_graph(src);
      canonical = normalize(src);
    } catch (err) {
      set_parse_error(error_message(err));
      return;
    }
    // drop overrides whose node id no longer exists in the new graph
    const live_ids = next_graph.nodes.map((node) => node.id);
    const pruned = prune_overrides(doc.overrides, live_ids);
    // commit atomically so layout/depth recompute once
    batch(() => {
      set_parse_error(undefined);
      set_doc("source", canonical);
      set_doc("overrides", pruned);
      set_draft_source(canonical);
    });
  };

  // format_source: canonicalize draft_source in place if it parses; otherwise set
  // the parse error and leave the text. The graph is NOT changed (no commit).
  const format_source = (): void => {
    const src = draft_source();
    let canonical: string;
    try {
      canonical = normalize(src);
    } catch (err) {
      set_parse_error(error_message(err));
      return;
    }
    batch(() => {
      set_parse_error(undefined);
      set_draft_source(canonical);
    });
  };

  // load_source: set the draft then submit it. Used by example buttons and the
  // open-source flow; the supplied source is expected to be valid.
  const load_source = (source: string): void => {
    set_draft_source(source);
    update_flowchart();
  };

  //--------------------------------------------
  // document mutation actions
  //--------------------------------------------

  // set_title: rename the document.
  const set_title = (title: string): void => {
    set_doc("title", title);
  };

  // set_theme: patch the palette (the only theme field in flowchart mode).
  const set_theme = (patch: Partial<FlowTheme>): void => {
    if (patch.palette !== undefined) {
      set_doc("theme", "palette", patch.palette);
    }
  };

  // set_override: record a drag-adjusted position for a node id. Writes overrides
  // only; it never disturbs the source, so layout does not recompute.
  const set_override = (id: FlowNodeId, position: Position): void => {
    set_doc("overrides", id, { x: position.x, y: position.y });
  };

  // replace_document: swap the entire working document (open-file / new-doc) and
  // reset the editor draft to the new source. reconcile keeps fine-grained
  // reactivity stable across the swap.
  const replace_document = (next: FlowDocument): void => {
    batch(() => {
      set_doc(reconcile(next));
      set_draft_source(next.source);
      set_parse_error(undefined);
    });
  };

  // assemble the API object; dispose is spliced in by create_app_state
  const api: AppState = {
    doc,
    draft_source,
    set_draft_source,
    parse_error,
    graph,
    layout,
    depths,
    highlighted_nodes,
    node_position,
    hover,
    set_hover,
    autosave_enabled,
    update_flowchart,
    format_source,
    load_source,
    set_title,
    set_theme,
    set_override,
    replace_document,
    dispose: () => {},
  };

  //--------------------------------------------
  // autosave (500ms debounced, single slot)
  //--------------------------------------------

  // pending debounce timer handle; null when no write is queued
  let autosave_timer: ReturnType<typeof setTimeout> | null = null;
  // the most recent serialized payload waiting to be flushed
  let pending_payload: string | null = null;

  // perform the actual write of the queued payload. A failing write (quota,
  // blocked storage) disables autosave and surfaces the notice via the flag.
  const flush_autosave = (): void => {
    autosave_timer = null;
    if (storage === null || pending_payload === null) {
      return;
    }
    const json_text = pending_payload;
    pending_payload = null;
    const ok = attempt_storage_write(storage, json_text);
    if (!ok) {
      set_autosave_enabled(false);
    }
  };

  // schedule_autosave: queue a serialized payload and debounce the write so a burst
  // of edits collapses to one save.
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

  // wire the document-change autosave effect inside a createRoot so it has an owner
  // outside of any component. Reading the serialized document below makes this
  // effect re-run on any document mutation (source, title, overrides, theme); the
  // draft, hover, and layout are NOT read here, so they never schedule a save. The
  // effect skips its very first run so boot-loading does not immediately re-save.
  createRoot((dispose) => {
    capture_dispose(dispose);
    let first_run = true;
    createEffect(() => {
      // serialize inside the tracking context so every autosaved field is read
      const json_text = serialize_document(doc);
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
// importing this module never throws server-side or under SSR.
export function browser_storage(): StorageLike | null {
  // only a browser exposes a window with localStorage; everything else is null
  if (typeof window === "undefined") {
    return null;
  }
  // localStorage access itself can throw (privacy mode, disabled storage); a null
  // result means "run with autosave disabled"
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
