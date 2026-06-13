// Standalone autocomplete input for concept labels.
//
// Renders an <input> with an absolutely-positioned dropdown listbox.
// Filters existing concepts by substring match on their normalized key.
// Committing a value whose concept_key matches an existing concept snaps to
// that concept's canonical label (first-seen casing) and shows a transient hint.
// Free text is always allowed - unmatched text commits as-is.
//
// expose_commit: optional prop - when provided, called once on mount with the
// synchronous commit function. Callers can store that function and invoke it to
// commit any typed draft before the 150 ms blur timer fires. The blur timer is
// cancelled automatically when commit() is called synchronously, so calling
// expose_commit's fn and later receiving the blur callback is safe (idempotent).

import { createSignal, createMemo, Show, For, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import type { Concept } from "./derive_concepts.js";
import { concept_key } from "./types.js";

// Maximum number of dropdown suggestions to show at once.
const MAX_SUGGESTIONS = 8;

// Duration in milliseconds for the "matched existing concept" transient hint.
const HINT_DURATION_MS = 1500;

//============================================
// ConceptAutocompleteProps
//============================================
export interface ConceptAutocompleteProps {
  // Current input value (controlled).
  value: string;
  // Reactive accessor returning the full concept list to filter against.
  concepts: () => Concept[];
  // Called when the user commits a value (Enter, Tab, blur, or click).
  on_commit: (value: string) => void;
  // Placeholder text for the input element.
  placeholder?: string;
  // Accessible label for the input (required for screen readers).
  aria_label: string;
  // Optional CSS custom-property value for tinting the input background,
  // e.g. "var(--from-tint)". Applied as inline style on the wrapper.
  tint_var?: string;
  // Optional: called once on mount with this cell's synchronous commit
  // function. Callers can invoke it before the 150 ms blur timer fires.
  expose_commit?: (fn: () => void) => void;
  // Optional: called on every input event with the current draft text so
  // the parent can track whether the field has uncommitted content.
  on_draft_change?: (text: string) => void;
  // Optional native title (tooltip) for the input. The triples table passes the
  // committed value so a cell clipped by the column's clamped width still exposes its
  // full text on hover.
  title?: string;
}

//============================================
// ConceptAutocomplete
//============================================
// Autocomplete input component. Wired to concept list via props.
export function ConceptAutocomplete(props: ConceptAutocompleteProps): JSX.Element {
  // Internal draft text signal - starts from the controlled value.
  const [draft, set_draft] = createSignal(props.value);
  // Whether the dropdown listbox is open.
  const [open, set_open] = createSignal(false);
  // Index of the highlighted suggestion (-1 = none).
  const [highlight_index, set_highlight_index] = createSignal(-1);
  // Transient hint visibility flag.
  const [show_hint, set_show_hint] = createSignal(false);

  // Timer handle for auto-hiding the hint.
  let hint_timer: ReturnType<typeof setTimeout> | null = null;
  // Pending blur-commit timer handle. Cancelled when commit() fires synchronously
  // so the delayed blur callback does not double-apply the same value.
  let blur_timer: ReturnType<typeof setTimeout> | null = null;

  // Clean up timers when the component unmounts.
  onCleanup(() => {
    if (hint_timer !== null) {
      clearTimeout(hint_timer);
    }
    if (blur_timer !== null) {
      clearTimeout(blur_timer);
    }
  });

  // Filtered suggestion list: concepts whose label or key contains the
  // normalized draft as a substring, capped at MAX_SUGGESTIONS.
  const suggestions = createMemo(() => {
    const query = concept_key(draft());
    if (query.length === 0) {
      return [];
    }
    const all = props.concepts();
    const matched: Concept[] = [];
    for (const c of all) {
      if (matched.length >= MAX_SUGGESTIONS) break;
      // match against the normalized key (handles case/whitespace variants)
      if (c.key.includes(query)) {
        matched.push(c);
      }
    }
    return matched;
  });

  //============================================
  // show_transient_hint
  //============================================
  // Show the "matched existing concept" hint and auto-hide after HINT_DURATION_MS.
  function show_transient_hint(): void {
    // cancel any running timer before starting a fresh one
    if (hint_timer !== null) {
      clearTimeout(hint_timer);
    }
    set_show_hint(true);
    hint_timer = setTimeout(() => {
      set_show_hint(false);
      hint_timer = null;
    }, HINT_DURATION_MS);
  }

  //============================================
  // commit
  //============================================
  // Commit a value: if the normalized key matches an existing concept, snap to
  // canonical casing and show the hint. Always calls on_commit.
  // Cancels any pending blur timer so a prior handle_blur scheduled call does
  // not re-fire after this synchronous commit (double-commit guard).
  function commit(text: string): void {
    // Cancel any pending blur-commit timer - this call supersedes it.
    if (blur_timer !== null) {
      clearTimeout(blur_timer);
      blur_timer = null;
    }
    const key = concept_key(text);
    // search for an exact key match among known concepts
    const existing = props.concepts().find((c) => c.key === key);
    const final_value = existing !== undefined ? existing.label : text;
    set_open(false);
    set_highlight_index(-1);
    if (existing !== undefined) {
      // update draft to canonical casing so input reflects the snap
      set_draft(existing.label);
      show_transient_hint();
    }
    props.on_commit(final_value);
  }

  //============================================
  // commit_draft
  //============================================
  // Zero-argument wrapper that commits the current draft value.
  // Exposed to parent via expose_commit prop so the parent can call it
  // synchronously (e.g. before inserting a new row) without holding a
  // reference to draft() directly.
  function commit_draft(): void {
    commit(draft());
  }

  // Expose commit_draft to the parent when requested.
  onMount(() => {
    if (props.expose_commit !== undefined) {
      props.expose_commit(commit_draft);
    }
  });

  //============================================
  // handle_input
  //============================================
  // Update draft and open the dropdown as the user types.
  function handle_input(e: InputEvent): void {
    const value = (e.currentTarget as HTMLInputElement).value;
    set_draft(value);
    set_highlight_index(-1);
    // open only when there is text
    set_open(value.trim().length > 0);
    // notify parent of draft change so it can react without waiting for commit
    if (props.on_draft_change !== undefined) {
      props.on_draft_change(value);
    }
  }

  //============================================
  // handle_keydown
  //============================================
  // Keyboard navigation: ArrowDown/Up move highlight, Enter/Tab commit,
  // Escape closes without committing.
  function handle_keydown(e: KeyboardEvent): void {
    const list = suggestions();

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open()) {
        set_open(true);
      }
      // move highlight down, wrapping at list end
      set_highlight_index((i) => (i + 1) % Math.max(list.length, 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open()) {
        set_open(true);
      }
      // move highlight up, wrapping to end of list
      const len = Math.max(list.length, 1);
      set_highlight_index((i) => (i - 1 + len) % len);
      return;
    }

    if (e.key === "Enter" || e.key === "Tab") {
      const idx = highlight_index();
      if (open() && idx >= 0 && idx < list.length) {
        // commit the highlighted suggestion
        e.preventDefault();
        commit(list[idx]!.label);
      } else {
        // commit whatever is typed
        commit(draft());
      }
      return;
    }

    if (e.key === "Escape") {
      // close dropdown, keep typed text, do not commit
      set_open(false);
      set_highlight_index(-1);
      return;
    }
  }

  //============================================
  // handle_blur
  //============================================
  // Commit typed text on blur (user clicked away or tabbed out without
  // pressing Enter). The slight delay lets a suggestion click fire first.
  // Stores the timer handle so commit() can cancel it if called synchronously
  // before the 150 ms elapses (double-commit guard).
  function handle_blur(): void {
    blur_timer = setTimeout(() => {
      blur_timer = null;
      commit(draft());
    }, 150);
  }

  //============================================
  // handle_suggestion_click
  //============================================
  // Commit the clicked suggestion label immediately.
  function handle_suggestion_click(label: string): void {
    commit(label);
  }

  // Unique id prefix for aria-activedescendant linking.
  const uid = `ca-${Math.random().toString(36).slice(2, 9)}`;
  const listbox_id = `${uid}-listbox`;

  // Active descendant id for the highlighted option (empty string = none).
  const active_descendant = createMemo(() => {
    const idx = highlight_index();
    const list = suggestions();
    if (!open() || idx < 0 || idx >= list.length) return "";
    return `${uid}-opt-${idx}`;
  });

  // Wrapper inline style for optional tint.
  const wrapper_style = (): JSX.CSSProperties => {
    const tint = props.tint_var;
    if (tint !== undefined && tint.length > 0) {
      return { background: tint, position: "relative" as const };
    }
    return { position: "relative" as const };
  };

  return (
    <span style={wrapper_style()}>
      <input
        type="text"
        value={draft()}
        title={props.title ?? ""}
        placeholder={props.placeholder ?? ""}
        aria-label={props.aria_label}
        aria-autocomplete="list"
        aria-expanded={open() ? "true" : "false"}
        aria-controls={listbox_id}
        aria-activedescendant={active_descendant()}
        autocomplete="off"
        onInput={handle_input}
        onKeyDown={handle_keydown}
        onBlur={handle_blur}
      />
      <Show when={show_hint()}>
        <span
          aria-live="polite"
          style={{
            position: "absolute",
            bottom: "100%",
            left: "0",
            "font-size": "0.75em",
            "white-space": "nowrap",
            background: "#fffbcc",
            border: "1px solid #ccc",
            padding: "2px 6px",
            "border-radius": "3px",
            "pointer-events": "none",
            "z-index": "10",
          }}
        >
          matched existing concept
        </span>
      </Show>
      <Show when={open() && suggestions().length > 0}>
        <ul
          id={listbox_id}
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: "0",
            margin: "0",
            padding: "0",
            "list-style": "none",
            border: "1px solid #ccc",
            background: "#fff",
            "z-index": "20",
            "min-width": "100%",
            "box-shadow": "0 2px 6px rgba(0,0,0,0.15)",
            /* prevent overflow viewport on long concept lists */
            "max-height": "240px",
            "overflow-y": "auto",
          }}
        >
          <For each={suggestions()}>
            {(concept, index) => (
              <li
                id={`${uid}-opt-${index()}`}
                role="option"
                aria-selected={index() === highlight_index() ? "true" : "false"}
                onMouseDown={() => handle_suggestion_click(concept.label)}
                style={{
                  padding: "4px 8px",
                  cursor: "pointer",
                  background: index() === highlight_index() ? "#e0eeff" : "transparent",
                }}
              >
                {concept.label}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </span>
  );
}
