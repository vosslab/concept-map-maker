// triple_row.tsx - one editable row in the triples table.
// Renders: from-cell (ConceptAutocomplete), arrow glyph, verb input, arrow glyph,
// to-cell (ConceptAutocomplete), delete button, chain button.
// The proposition preview line is rendered in a fixed-height slot OUTSIDE the row
// by TriplesTable so row height never changes on focus/blur.

import { createMemo, createSignal, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import type { Triple } from "./types";
import { concept_key } from "./types";
import type { AppState, CellRole } from "./app_state";
import { ConceptAutocomplete } from "./concept_autocomplete";

//============================================
// TripleRowProps
//============================================

export interface TripleRowProps {
  triple: Triple;
  row_index: number;
  state: AppState;
  // Callback: the Enter key pressed in this row (to move focus down / add row)
  on_enter: (row_index: number) => void;
  // Called when this row gains focus (passes row_index) or loses focus
  // (passes null). The parent uses this to display the preview sentence in a
  // fixed-height slot outside the rows list.
  on_focus_change: (row_index: number | null) => void;
  // Called to expose the to-cell's synchronous commit function to the parent.
  // The parent stores this and calls it in onPointerDown on "+ Add row" and the
  // chain button so drafts are committed before new rows are inserted.
  expose_to_commit: (fn: () => void) => void;
  // Called on unmount so the parent can remove the stale entry from its
  // to_commit_fns map. Prevents the map from growing unboundedly as rows are
  // deleted and re-added.
  remove_to_commit: () => void;
  // Called when the chain button is clicked (row's "to" concept is the seed).
  on_chain: (row_index: number) => void;
  // Called when the verb input commits (blur). The parent refreshes its
  // commit-time verb-width snapshot so the verb column resizes on commit only,
  // never per keystroke.
  on_verb_commit: () => void;
}

//============================================
// TripleRow
//============================================

export function TripleRow(props: TripleRowProps): JSX.Element {
  // Tracks the current draft text in the to-cell so chain_enabled reacts to
  // typed text even before the blur timer commits it to the store.
  const [to_draft, set_to_draft] = createSignal(props.triple.to);

  // Remove this row's entry from the parent's to_commit_fns map on unmount.
  // Keeps the map tidy and prevents a deleted row's closure from being called
  // if focus bookkeeping briefly returns a stale index.
  // Delete-while-focused guard: if this row was focused when deleted, clear the
  // focus channel -- but only when the focused concept belongs to this row
  // (matches from or to committed value). This prevents a bulk re-render from
  // stomping focus that legitimately belongs to a surviving row.
  onCleanup(() => {
    props.remove_to_commit();
    // Use focused_concept (not active_concept) so we only clear the focus
    // channel -- never accidentally clear when hover alone matches this row.
    const current_focus = props.state.focused_concept();
    const from_key = concept_key(props.triple.from);
    const to_key = concept_key(props.triple.to);
    const focused_here =
      current_focus !== null && (current_focus === from_key || current_focus === to_key);
    if (focused_here) {
      props.state.set_cell_focus(null);
    }
  });

  // Whether the chain button should be enabled: "to" must be non-empty.
  // Uses draft text so the button enables as soon as the user starts typing.
  const chain_enabled = createMemo(
    (): boolean => to_draft().trim().length > 0 || props.triple.to.trim().length > 0,
  );

  // Handle keydown for Tab (native) and Enter (custom: move down / add row).
  function handle_keydown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      // Enter is a verb commit point: refresh the autosize snapshot before
      // focus moves to the next row.
      props.on_verb_commit();
      props.on_enter(props.row_index);
    }
    // Tab is handled natively by the browser; no override needed.
  }

  // Hover handlers wire into app_state cross-highlight signal.
  function handle_mouse_enter(): void {
    props.state.set_hover({ source: "row", tripleId: props.triple.id, conceptKey: null });
  }

  function handle_mouse_leave(): void {
    props.state.set_hover({ source: null, tripleId: null, conceptKey: null });
  }

  // Verb input change handler: commits a field update immediately (fine-grained)
  // so the live preview reflects typing. Column autosize does NOT key off this;
  // it refreshes only on a verb commit (blur / Enter) via on_verb_commit.
  function on_verb_input(e: InputEvent): void {
    const value = (e.currentTarget as HTMLInputElement).value;
    props.state.update_triple(props.triple.id, { verb: value });
  }

  // Verb commit: blur is the commit point for column autosize. Notify the parent
  // so it refreshes its verb-width snapshot at commit time, not per keystroke.
  function on_verb_blur(): void {
    props.on_verb_commit();
  }

  // on_commit handlers for ConceptAutocomplete from/to cells.
  function on_from_commit(value: string): void {
    props.state.update_triple(props.triple.id, { from: value });
  }

  function on_to_commit(value: string): void {
    props.state.update_triple(props.triple.id, { to: value });
  }

  const row_num = (): number => props.row_index + 1;

  //--------------------------------------------
  // per-cell active-concept highlighting
  //--------------------------------------------

  // Focus/hover wiring drives the app-wide active_concept. Focus passes the
  // cell's COMMITTED value (props.triple.from / .to), so highlighting reflects
  // the committed concept, not in-progress keystrokes. Hover only takes effect
  // when no cell is focused (resolved inside app_state).
  function on_from_focus_in(): void {
    props.state.set_cell_focus(props.triple.from);
  }
  function on_to_focus_in(): void {
    props.state.set_cell_focus(props.triple.to);
  }
  // Focus-clear is on the outer row div (see onFocusOut below).
  // Per-span focusout handlers are not used so intra-row transitions (from-cell
  // -> verb -> to-cell) do NOT pass through a null gap.
  // Row-level clear: fires only when focus truly leaves the row by checking that
  // relatedTarget (the element gaining focus) is outside this row element.
  function on_row_focus_out(e: FocusEvent): void {
    const row_el = e.currentTarget as HTMLElement;
    // relatedTarget is null when focus leaves the document entirely;
    // only clear when focus moves outside this row (not between spans within it)
    if (e.relatedTarget === null || !row_el.contains(e.relatedTarget as Node)) {
      props.state.set_cell_focus(null);
      props.on_focus_change(null);
    }
  }
  function on_from_mouse_enter(): void {
    props.state.set_cell_hover(props.triple.from);
  }
  function on_to_mouse_enter(): void {
    props.state.set_cell_hover(props.triple.to);
  }
  function on_cell_mouse_leave(): void {
    props.state.set_cell_hover(null);
  }

  // Look up this cell's role for the current active concept. An empty cell value
  // never matches (compute_cell_classification stores no empty key), so blank
  // cells carry no role. Returns null when the cell has no highlight role.
  function cell_role(value: string): CellRole | null {
    const key = concept_key(value);
    if (key === "") {
      return null;
    }
    const role = props.state.cell_classification().get(key);
    return role ?? null;
  }
  // Memoize so classList re-evaluates only when cell_classification or this
  // cell's own committed value actually changes, not on every render tick.
  const from_role = createMemo((): CellRole | null => cell_role(props.triple.from));
  const to_role = createMemo((): CellRole | null => cell_role(props.triple.to));

  // Cross-highlight: this row is emphasized when the hover-derived triple set
  // contains its id. This is the node/edge -> row direction (hovering a bubble
  // or an edge lights up every row that references it).
  const is_highlighted = (): boolean => props.state.highlighted_triples().has(props.triple.id);

  return (
    <div
      class="triple-row"
      classList={{ highlighted: is_highlighted() }}
      onMouseEnter={handle_mouse_enter}
      onMouseLeave={handle_mouse_leave}
      onFocusIn={() => {
        // Notify parent so it can show this row's preview in the fixed slot.
        props.on_focus_change(props.row_index);
      }}
      onFocusOut={on_row_focus_out}
    >
      {/* From cell - ConceptAutocomplete with from tint */}
      <span
        class="triple-cell triple-cell-from"
        classList={{
          "cell-from": from_role() === "from",
          "cell-to": from_role() === "to",
          "cell-same": from_role() === "same",
        }}
        onFocusIn={on_from_focus_in}
        onMouseEnter={on_from_mouse_enter}
        onMouseLeave={on_cell_mouse_leave}
      >
        <ConceptAutocomplete
          value={props.triple.from}
          concepts={props.state.concepts}
          on_commit={on_from_commit}
          aria_label={`Row ${row_num()} from concept`}
          tint_var="var(--from-tint)"
          title={props.triple.from}
        />
      </span>

      {/* Arrow glyph between from and verb */}
      <span class="triple-arrow" aria-hidden="true">
        &#8594;
      </span>

      {/* Verb phrase cell */}
      <input
        class="triple-cell triple-cell-verb"
        type="text"
        aria-label={`Row ${row_num()} verb phrase`}
        title={props.triple.verb}
        value={props.triple.verb}
        onInput={on_verb_input}
        onKeyDown={handle_keydown}
        onBlur={on_verb_blur}
      />

      {/* Arrow glyph between verb and to */}
      <span class="triple-arrow" aria-hidden="true">
        &#8594;
      </span>

      {/* To cell - ConceptAutocomplete with to tint */}
      <span
        class="triple-cell triple-cell-to"
        classList={{
          "cell-from": to_role() === "from",
          "cell-to": to_role() === "to",
          "cell-same": to_role() === "same",
        }}
        onFocusIn={on_to_focus_in}
        onMouseEnter={on_to_mouse_enter}
        onMouseLeave={on_cell_mouse_leave}
      >
        <ConceptAutocomplete
          value={props.triple.to}
          concepts={props.state.concepts}
          on_commit={on_to_commit}
          aria_label={`Row ${row_num()} to concept`}
          tint_var="var(--to-tint)"
          expose_commit={props.expose_to_commit}
          on_draft_change={set_to_draft}
          title={props.triple.to}
        />
      </span>

      {/* Delete row button */}
      <button
        class="triple-delete-btn"
        type="button"
        aria-label={`Delete row ${row_num()}`}
        onClick={() => props.state.remove_triple(props.triple.id)}
      >
        &#10005;
      </button>

      {/* Chain button: insert a new row below with from = this row's to */}
      <button
        class="triple-chain-btn"
        type="button"
        aria-label={`Chain new row from row ${row_num()}`}
        title={
          chain_enabled()
            ? "Chain: add row starting from this concept"
            : "Add a points-to concept first."
        }
        disabled={!chain_enabled()}
        onClick={() => props.on_chain(props.row_index)}
      >
        &#8627;
      </button>
    </div>
  );
}
