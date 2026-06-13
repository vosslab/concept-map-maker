// rubric_panel.tsx - Live rubric checklist from the validation memo.
// Each row shows the rule status (OK / WARN / FAIL / HINT) plus a message.
// Clicking a row with offender ids briefly hovers the first offender for ~1.5s.

import { For } from "solid-js";
import type { JSX } from "solid-js";

import type { AppState } from "./app_state";
import type { ValidationItem } from "./types";

// Props for RubricPanel.
interface RubricPanelProps {
  state: AppState;
}

// Map a validation level to a short text marker shown before the message.
function level_marker(level: ValidationItem["level"]): string {
  if (level === "pass") return "OK";
  if (level === "warn") return "WARN";
  return "FAIL";
}

// ============================================
// RubricPanel
// ============================================
// Renders a live checklist from state.validation(). Rows with offenders are
// clickable and briefly flash the first offender in the canvas via HoverState.
export function RubricPanel(props: RubricPanelProps): JSX.Element {
  const { state } = props;

  // Pending timeout handle; per-instance so multiple panels do not share state.
  // Cleared on each new click so rapid clicks do not leave stale timeouts piling up.
  let hover_timeout: ReturnType<typeof setTimeout> | null = null;

  // Handle a click on a rubric item. Sets hover briefly on the first offender
  // (conceptKeys[0] -> node hover, tripleIds[0] -> edge/row hover) for 1.5 s,
  // then clears. Cancels any pending timeout from a prior click first.
  function handle_item_click(item: ValidationItem): void {
    // cancel any prior pending clear
    if (hover_timeout !== null) {
      clearTimeout(hover_timeout);
      hover_timeout = null;
    }

    // determine first offender and hover source
    if (item.conceptKeys !== undefined && item.conceptKeys.length > 0) {
      // node hover on the first offending concept; the length guard above ensures
      // the element exists, but TypeScript sees the array index as possibly undefined
      const key: string = item.conceptKeys[0] as string;
      state.set_hover({ source: "node", tripleId: null, conceptKey: key });
    } else if (item.tripleIds !== undefined && item.tripleIds.length > 0) {
      // edge/row hover on the first offending triple
      const id: string = item.tripleIds[0] as string;
      state.set_hover({ source: "edge", tripleId: id, conceptKey: null });
    } else {
      // no offenders to flash; nothing to do
      return;
    }

    // clear the hover after 1.5 s
    hover_timeout = setTimeout(() => {
      hover_timeout = null;
      state.set_hover({ source: null, tripleId: null, conceptKey: null });
    }, 1500);
  }

  return (
    <ul class="rubric-list" aria-label="Rubric checklist" role="list">
      <For each={state.validation()}>
        {(item) => {
          // rows with offenders are interactive; others are decorative
          const has_offenders =
            (item.conceptKeys !== undefined && item.conceptKeys.length > 0) ||
            (item.tripleIds !== undefined && item.tripleIds.length > 0);

          return (
            <li
              class={`rubric-item rubric-item--${item.level}${has_offenders ? " rubric-item--clickable" : ""}`}
              title={has_offenders ? "Click to highlight offender in the map" : undefined}
              role={has_offenders ? "button" : undefined}
              tabIndex={has_offenders ? 0 : -1}
              onClick={has_offenders ? (): void => handle_item_click(item) : undefined}
              onKeyDown={
                has_offenders
                  ? (e: KeyboardEvent): void => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handle_item_click(item);
                      }
                    }
                  : undefined
              }
            >
              <span class="rubric-marker" aria-hidden="true">
                {level_marker(item.level)}
              </span>
              <span class="rubric-message">{item.message}</span>
            </li>
          );
        }}
      </For>
    </ul>
  );
}
