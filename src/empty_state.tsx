// empty_state.tsx - inviting panel shown in the map pane when the document has
// zero triples. Offers one-click template buttons plus a "Start blank" affordance.
//
// The panel is a centered overlay inside the map pane, not a blocking modal:
// no full-screen backdrop, no focus trap, and the user can still reach the
// toolbar and table. It disappears automatically when triples.length > 0.

import { For } from "solid-js";
import type { JSX } from "solid-js";
import type { AppState } from "./app_state";
import { TEMPLATES } from "./templates";
import { load_template } from "./template_actions";

//============================================
// EmptyStateProps
//============================================

interface EmptyStateProps {
  state: AppState;
}

//============================================
// EmptyState
//============================================

// Inviting empty-state panel rendered inside the map pane when the concept map
// has no triples. Shows template buttons as the primary action and a secondary
// "Start blank" button that adds a new row and focuses the from-cell input.
export function EmptyState(props: EmptyStateProps): JSX.Element {
  // Handle "Start blank": add a new empty row then focus its first input.
  //
  // At zero triples there is no .triple-row to focus, so add a row (like the
  // Add Row button in triples_table.tsx) and focus its first input on the next
  // tick once SolidJS has rendered it. ".triple-row input" is the from-cell
  // ConceptAutocomplete input rendered first by triple_row.tsx.
  function handle_start_blank(): void {
    props.state.add_triple();
    requestAnimationFrame(() => {
      const first_input = document.querySelector<HTMLInputElement>(".triple-row input");
      if (first_input !== null) {
        first_input.focus();
      }
    });
  }

  return (
    <div class="empty-state-panel" aria-label="Start a concept map">
      {/* Explanatory heading and subheading that teach the from/verb/to model */}
      <h3 class="empty-state-heading">Start with an example concept map</h3>
      <p class="empty-state-subheading">
        A concept map is built from simple statements:
        <br />
        <span class="empty-state-model">concept &rarr; relationship &rarr; concept</span>
      </p>

      {/* Template buttons: primary actions */}
      <div class="empty-state-templates" role="list">
        <For each={TEMPLATES}>
          {(entry) => (
            <button
              class="empty-state-template-btn"
              type="button"
              role="listitem"
              onClick={() => load_template(props.state, entry)}
            >
              <span class="empty-state-template-label">{entry.label}</span>
              <span class="empty-state-template-desc">{entry.description}</span>
            </button>
          )}
        </For>
      </div>

      {/* Start blank: visually secondary so template buttons read as the main action */}
      <div class="empty-state-blank-row">
        <button class="empty-state-blank-btn" type="button" onClick={handle_start_blank}>
          Start blank
        </button>
      </div>
    </div>
  );
}
