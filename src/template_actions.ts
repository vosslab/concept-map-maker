// template_actions.ts - shared action for loading a template into the app.
//
// Owns the overwrite guard (window.confirm on non-empty maps) and the codec
// round-trip clone. Called by both the empty-state panel (empty_state.tsx) and
// the toolbar Examples control (toolbar.tsx).

import type { AppState } from "./app_state";
import type { TemplateEntry } from "./templates";
import { parse_document, serialize_document } from "./document_codec";

//============================================
// load_template
//============================================
// Load a template entry into the app state.
//
// If the current document is non-empty, prompt the user to confirm overwrite.
// On cancel the existing document is left untouched.
//
// The doc is deep-cloned via a codec round-trip so the module-level constant
// in templates.ts is never mutated by downstream edits.
//
// The optional confirm_fn parameter accepts an injectable confirm function;
// defaults to window.confirm so browser tests can inject a stub without
// stubbing window globals in a Node test runner.
export function load_template(
  state: AppState,
  entry: TemplateEntry,
  confirm_fn: (message: string) => boolean = window.confirm.bind(window),
): void {
  // Only prompt when the map already has content
  if (state.doc.triples.length > 0) {
    const confirmed = confirm_fn("Replace the current concept map? This cannot be undone.");
    if (!confirmed) {
      return;
    }
  }
  // Deep-clone via codec round-trip; never hand the module constant directly
  // to replace_document because downstream edits would mutate shared data
  const serialized = serialize_document(entry.doc);
  const clone = parse_document(serialized);
  state.replace_document(clone);
}
