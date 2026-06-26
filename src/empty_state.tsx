// empty_state.tsx - inviting panel shown in the map pane when the rendered graph
// has zero nodes. Teaches the pseudo-code model and offers one-click example
// buttons plus a "Start blank" affordance that focuses the editor.
//
// The panel is a centered overlay inside the map pane, not a blocking modal: no
// full-screen backdrop, no focus trap, and the user can still reach the toolbar
// and editor. It disappears automatically when the graph has nodes.

import { For } from "solid-js";
import type { JSX } from "solid-js";
import type { AppState } from "./app_state";
import { EXAMPLES } from "./templates";
import { load_example } from "./template_actions";

//============================================
// EmptyStateProps
//============================================

interface EmptyStateProps {
  state: AppState;
}

//============================================
// EmptyState
//============================================

// Inviting empty-state panel rendered inside the map pane when the flowchart has
// no nodes. Shows example buttons as the primary action and a secondary "Start
// blank" button that focuses the editor so the user can start typing.
export function EmptyState(props: EmptyStateProps): JSX.Element {
  // Handle "Start blank": focus the CodeMirror editor content so the user can
  // begin typing pseudo-code immediately. The editor mounts its content in the
  // ".code-editor-host .cm-content" element.
  function handle_start_blank(): void {
    const content = document.querySelector<HTMLElement>(".code-editor-host .cm-content");
    if (content !== null) {
      content.focus();
    }
  }

  return (
    <div class="empty-state-panel" aria-label="Start a flowchart">
      {/* Explanatory heading and subheading that teach the pseudo-code model */}
      <h3 class="empty-state-heading">Start with an example flowchart</h3>
      <p class="empty-state-subheading">
        Write pseudo-code on the left and click Update Flowchart to render it:
        <br />
        <span class="empty-state-model">if / while / for / input / output / call</span>
      </p>

      {/* Example buttons: primary actions */}
      <div class="empty-state-templates" role="list">
        <For each={EXAMPLES}>
          {(entry) => (
            <button
              class="empty-state-template-btn"
              type="button"
              role="listitem"
              onClick={() => load_example(props.state, entry)}
            >
              <span class="empty-state-template-label">{entry.title}</span>
            </button>
          )}
        </For>
      </div>

      {/* Start blank: visually secondary so example buttons read as the main action */}
      <div class="empty-state-blank-row">
        <button class="empty-state-blank-btn" type="button" onClick={handle_start_blank}>
          Start blank
        </button>
      </div>
    </div>
  );
}
