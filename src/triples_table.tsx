// triples_table.tsx - spreadsheet-like table for entering concept-map triples.
// Renders a header row ("This concept | verb phrase | points to this concept"),
// a TripleRow for each triple in the document, a live concept count, and an
// "Add row" button.
//
// Paste behavior: onPaste on the rows container intercepts when clipboard text
// contains a newline or tab (multi-cell paste). Rows of 3 columns are mapped to
// triples (from, verb, to). A first row that looks like a header (any cell
// matches known header tokens) is skipped. Single-cell paste passes through natively.

import { For, createSignal, createMemo, createEffect, onMount } from "solid-js";
import type { JSX } from "solid-js";
import type { AppState } from "./app_state";
import { TripleRow } from "./triple_row";
import { parse_table_text } from "./csv_codec";
import { measure_widest, resolve_cell_font } from "./measure_text";

//============================================
// Commit-time column autosize constants
//============================================

// Horizontal chrome added to the measured text width: .triple-cell uses
// padding 6px each side (12px) plus a 1px border each side (2px). A small
// buffer (8px) keeps the caret and a trailing space comfortable so committed
// text never visually clips at the column's right edge.
const CELL_CHROME_PX = 22;

//============================================
// Header detection tokens (lowercase)
//============================================

// Tokens that indicate a header row in the from, verb, or to columns.
const HEADER_TOKENS = new Set([
  "from",
  "this concept",
  "concept",
  "source",
  "verb",
  "verb phrase",
  "relation",
  "label",
  "predicate",
  "to",
  "points to this concept",
  "points to",
  "target",
  "destination",
]);

// Returns true when the row looks like a header row.
// Heuristic: at least one cell (trimmed, lowercased) matches a known token.
function looks_like_header(row: string[]): boolean {
  for (const cell of row) {
    if (HEADER_TOKENS.has(cell.trim().toLowerCase())) {
      return true;
    }
  }
  return false;
}

//============================================
// TriplesTableProps
//============================================

export interface TriplesTableProps {
  state: AppState;
}

//============================================
// TriplesTable
//============================================

export function TriplesTable(props: TriplesTableProps): JSX.Element {
  // Index of the currently focused triple row, or null when no row is focused.
  const [focused_row_index, set_focused_row_index] = createSignal<number | null>(null);

  // Element ref for commit-time column autosize. table_el receives the three
  // --col-* custom properties; the grid template reads them. A cell element is
  // used once to resolve the rendered cell font for pixel-accurate measurement.
  // Assigned via the set_table_el callback ref (matches the repo ref pattern).
  let table_el: HTMLElement | null = null;
  const set_table_el = (el: HTMLElement): void => {
    table_el = el;
  };

  // The resolved CSS font shorthand of a triples cell, captured after mount so
  // measureText matches what the browser actually renders. Empty until mount.
  const [cell_font, set_cell_font] = createSignal("");

  // Resolve the cell font once after first paint by reading a real cell's
  // computed style. Until this resolves, the autosize memo uses the helper's
  // own fallback font (still close enough; refined once cell_font is set).
  onMount(() => {
    const sample = table_el?.querySelector(".triple-cell") ?? table_el;
    set_cell_font(resolve_cell_font(sample));
  });

  // Verb widths use a committed SNAPSHOT, not live doc.triples. The verb is a
  // plain input that writes the store on every keystroke (so the live preview
  // updates), so reading doc.triples for the verb width would resize the column
  // per keystroke - violating criterion 2 (draft keystrokes never resize). The
  // snapshot only refreshes on a verb commit (blur via on_verb_commit) and on
  // row add/delete/import (count change), giving verb the same commit-time
  // behavior the from/to autocompletes already have.
  //
  // from/to autocompletes write the store ONLY on commit (Enter/Tab/blur), so
  // reading doc.triples directly for those columns is already commit-gated.
  const [verb_snapshot, set_verb_snapshot] = createSignal<string[]>([]);

  // Capture the current committed verb values into the snapshot. Called on a
  // verb commit and whenever the row set changes (add/delete/import).
  function refresh_verb_snapshot(): void {
    set_verb_snapshot(props.state.doc.triples.map((t) => t.verb));
  }

  // Refresh the verb snapshot when the ROW COUNT changes (add/delete/import).
  // A per-keystroke verb edit mutates a field in place (produce) without
  // changing length, but reading .length inside an effect can still re-run on
  // any triples mutation. Routing through a createMemo dedupes: the downstream
  // effect fires only when the numeric count actually changes, so draft verb
  // keystrokes never refresh the snapshot (criterion 2).
  const row_count = createMemo((): number => props.state.doc.triples.length);
  createEffect((prev: number | undefined): number => {
    const count = row_count();
    // Only refresh when the count actually changed (or on first run). This guard
    // is belt-and-suspenders over the memo dedupe: a draft verb keystroke never
    // changes count, so it never refreshes the snapshot (criterion 2).
    if (prev === undefined || count !== prev) {
      refresh_verb_snapshot();
    }
    return count;
  });

  // Commit-time column widths. from/to read doc.triples (commit-gated by the
  // autocomplete), verb reads the commit-gated snapshot. Each width is the
  // widest committed value plus cell chrome. The 45% pane cap and 6em floor are
  // applied in CSS (clamp/minmax) so a pane resize re-clamps natively with no JS;
  // the 1fr max distributes any leftover pane space equally across columns.
  const column_widths = createMemo((): { from: number; verb: number; to: number } => {
    const font = cell_font();
    const triples = props.state.doc.triples;
    const from_values = triples.map((t) => t.from);
    const to_values = triples.map((t) => t.to);
    const from = measure_widest(from_values, font) + CELL_CHROME_PX;
    const verb = measure_widest(verb_snapshot(), font) + CELL_CHROME_PX;
    const to = measure_widest(to_values, font) + CELL_CHROME_PX;
    return { from, verb, to };
  });

  // Write the measured widths to CSS custom properties only when a column's
  // pixel value actually changes. Skipping unchanged writes keeps the 150ms
  // grid transition from re-triggering on unrelated re-renders (criterion 2:
  // a column updates only when its max changed).
  let last_from = -1;
  let last_verb = -1;
  let last_to = -1;
  createEffect(() => {
    const widths = column_widths();
    if (table_el === null) {
      return;
    }
    if (widths.from !== last_from) {
      table_el.style.setProperty("--col-from", `${Math.round(widths.from)}px`);
      last_from = widths.from;
    }
    if (widths.verb !== last_verb) {
      table_el.style.setProperty("--col-verb", `${Math.round(widths.verb)}px`);
      last_verb = widths.verb;
    }
    if (widths.to !== last_to) {
      table_el.style.setProperty("--col-to", `${Math.round(widths.to)}px`);
      last_to = widths.to;
    }
  });

  // Map from triple.id to that row's to-cell synchronous commit function.
  // Keyed by stable triple id (not render index) so the entry remains valid
  // after a row delete shifts surviving rows to different indices.
  const to_commit_fns = new Map<string, () => void>();

  // Preview sentence for the currently focused row. Derived from committed triple
  // fields (not draft text), so the preview reflects the last committed state.
  // Draft keystrokes in autocomplete cells are not reflected until blur/Enter fires.
  // This is intentional: the preview shows what is actually stored, and avoids
  // reaching into child internals for in-progress text.
  const preview_text = createMemo((): string => {
    const idx = focused_row_index();
    if (idx === null) {
      return "";
    }
    const triple = props.state.doc.triples[idx];
    if (triple === undefined) {
      return "";
    }
    const f = triple.from.trim();
    const v = triple.verb.trim();
    const t = triple.to.trim();
    if (f === "" && v === "" && t === "") {
      return "";
    }
    return `${f || "..."} - ${v || "..."} -> ${t || "..."}`;
  });

  // Synchronously commit the focused row's to-cell draft before inserting rows.
  // Called in onPointerDown so the commit fires before the click blurs the input.
  function commit_focused_to_draft(): void {
    const idx = focused_row_index();
    if (idx === null) {
      return;
    }
    // Resolve render index -> triple -> stable id so the lookup is never stale.
    const triple = props.state.doc.triples[idx];
    if (triple === undefined) {
      return;
    }
    const fn = to_commit_fns.get(triple.id);
    if (fn !== undefined) {
      fn();
    }
  }

  // When Enter is pressed in a row, focus the first input of the next row; if
  // this is the last row, add a new row first.
  function handle_row_enter(row_index: number): void {
    const triples = props.state.doc.triples;
    const is_last = row_index === triples.length - 1;
    if (is_last) {
      // Add a blank row, then move focus there on the next frame.
      props.state.add_triple();
    }
    // Focus the first cell of row_index + 1.
    // Use requestAnimationFrame so the new row has been rendered.
    requestAnimationFrame(() => {
      const next_index = row_index + 1;
      // Find the first input in the next row by querying the row container.
      const rows = document.querySelectorAll(".triple-row");
      const next_row = rows[next_index] as HTMLElement | undefined;
      if (next_row !== undefined) {
        const first_input = next_row.querySelector<HTMLInputElement>("input");
        if (first_input !== null) {
          first_input.focus();
        }
      }
    });
  }

  // Handle paste on the rows container. Multi-cell paste (text containing a
  // tab or newline) is intercepted and parsed into bulk-inserted triples. A
  // single-cell paste (no tab or newline) falls through to the focused input.
  function handle_paste(e: ClipboardEvent): void {
    const text = e.clipboardData?.getData("text") ?? "";
    // single-cell paste: let the focused input receive it natively
    if (!text.includes("\t") && !text.includes("\n")) {
      return;
    }
    // multi-cell paste: consume the event and parse
    e.preventDefault();
    const grid = parse_table_text(text);
    if (grid.length === 0) {
      return;
    }
    // determine start index: skip header row if detected
    let start = 0;
    const first_row = grid[0];
    if (first_row !== undefined && looks_like_header(first_row)) {
      start = 1;
    }
    // build triples from data rows; require at least 3 columns (from, verb, to)
    const rows: Array<{ from: string; verb: string; to: string }> = [];
    for (let i = start; i < grid.length; i++) {
      const row = grid[i];
      if (row === undefined) continue;
      // pad to at least 3 columns with empty strings
      const from = (row[0] ?? "").trim();
      const verb = (row[1] ?? "").trim();
      const to = (row[2] ?? "").trim();
      // skip entirely blank rows
      if (from === "" && verb === "" && to === "") continue;
      rows.push({ from, verb, to });
    }
    if (rows.length > 0) {
      props.state.bulk_insert_triples(rows);
    }
  }

  // Chain: commit the "to" draft synchronously, insert a new row directly below
  // with from = that concept, then focus its verb input.
  function handle_chain(row_index: number): void {
    // Commit the to-cell draft synchronously before reading the committed value.
    // Use triple.id for a stable lookup that survives prior row deletes.
    const triple_for_chain = props.state.doc.triples[row_index];
    if (triple_for_chain !== undefined) {
      const fn = to_commit_fns.get(triple_for_chain.id);
      if (fn !== undefined) {
        fn();
      }
    }
    // After synchronous commit, read the now-committed "to" value.
    const triple = props.state.doc.triples[row_index];
    if (triple === undefined) {
      return;
    }
    const seed_from = triple.to;
    // Insert a new row at row_index + 1 with from = seed_from.
    props.state.insert_triple_after(row_index, { from: seed_from, verb: "", to: "" });
    // Focus the verb input of the new row.
    requestAnimationFrame(() => {
      const rows = document.querySelectorAll(".triple-row");
      const new_row = rows[row_index + 1] as HTMLElement | undefined;
      if (new_row !== undefined) {
        // The verb input is the first plain <input> (not inside an autocomplete span).
        const verb_input = new_row.querySelector<HTMLInputElement>("input.triple-cell-verb");
        if (verb_input !== null) {
          verb_input.focus();
        }
      }
    });
  }

  return (
    <div class="triples-table" aria-label="Triples table" ref={set_table_el}>
      {/* Table header - sentence-shaped labels reinforce direction */}
      <div class="triples-header" aria-hidden="true">
        <span class="header-cell header-cell-from" style={{ background: "var(--from-tint)" }}>
          This concept
        </span>
        <span class="header-arrow">&#8594;</span>
        <span class="header-cell header-cell-verb">verb phrase</span>
        <span class="header-arrow">&#8594;</span>
        <span class="header-cell header-cell-to" style={{ background: "var(--to-tint)" }}>
          points to this concept
        </span>
        {/* Empty spacers align with delete-button and chain-button columns */}
        <span class="header-cell header-cell-delete" aria-hidden="true"></span>
        <span class="header-cell header-cell-chain" aria-hidden="true"></span>
      </div>

      {/* Live concept count displayed near the header */}
      <div class="triples-meta" aria-live="polite">
        <span>Unique concepts: {props.state.concepts().length}</span>
      </div>

      {/* Rows - onPaste intercepts multi-cell spreadsheet paste */}
      <div class="triples-rows" onPaste={handle_paste}>
        <For each={props.state.doc.triples}>
          {(triple, index) => (
            <TripleRow
              triple={triple}
              row_index={index()}
              state={props.state}
              on_enter={handle_row_enter}
              on_focus_change={set_focused_row_index}
              expose_to_commit={(fn) => to_commit_fns.set(triple.id, fn)}
              remove_to_commit={() => to_commit_fns.delete(triple.id)}
              on_chain={handle_chain}
              on_verb_commit={refresh_verb_snapshot}
            />
          )}
        </For>
      </div>

      {/* Fixed-height preview slot: always occupies its height; shows the
          focused row's proposition sentence, empty string otherwise.
          This keeps the rows list height stable regardless of focus state. */}
      <div class="triple-preview-slot" aria-live="polite">
        {preview_text()}
      </div>

      {/* Add row button: onPointerDown commits any typed-but-uncommitted draft
          synchronously BEFORE the blur timer fires, then inserts the new row. */}
      <button
        class="triples-add-btn"
        type="button"
        onPointerDown={commit_focused_to_draft}
        onClick={() => {
          props.state.add_triple();
          // Focus the first input of the newly added row.
          requestAnimationFrame(() => {
            const rows = document.querySelectorAll(".triple-row");
            const new_row = rows[rows.length - 1] as HTMLElement | undefined;
            if (new_row !== undefined) {
              const first_input = new_row.querySelector<HTMLInputElement>("input");
              if (first_input !== null) {
                first_input.focus();
              }
            }
          });
        }}
      >
        + Add row
      </button>
    </div>
  );
}
