// template_actions.ts - shared action for loading a pseudo-code example.
//
// Owns the overwrite guard (window.confirm on a non-empty chart). Called by both
// the empty-state panel (empty_state.tsx) and the toolbar Examples group
// (toolbar.tsx).

import type { AppState } from "./app_state";
import type { ExampleEntry } from "./templates";

//============================================
// load_example
//============================================
// Load a pseudo-code example into the app state.
//
// If the current chart already has source content, prompt the user to confirm
// the overwrite. On cancel the existing source is left untouched.
//
// On confirm the example source (canonical pseudo-code) is loaded and submitted,
// so the flowchart updates and the editor shows the canonical text.
//
// The optional confirm_fn parameter accepts an injectable confirm function;
// defaults to window.confirm so browser tests can inject a stub without stubbing
// window globals in a Node test runner.
export function load_example(
  state: AppState,
  entry: ExampleEntry,
  confirm_fn: (message: string) => boolean = window.confirm.bind(window),
): void {
  // only prompt when the chart already has content
  if (state.doc.source.trim() !== "") {
    const confirmed = confirm_fn("Replace the current flowchart? This cannot be undone.");
    if (!confirmed) {
      return;
    }
  }
  // load_source sets the editor draft then submits, canonicalizing and rendering
  state.load_source(entry.source);
}
