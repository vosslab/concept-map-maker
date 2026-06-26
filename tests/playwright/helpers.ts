// helpers.ts - shared Playwright helpers for pseudo-code flowchart editor specs.
//
// Provides:
//   AUTOSAVE_KEY   - matches AUTOSAVE_KEY in src/app_state.ts.
//   clear_autosave - removes the autosave slot before the page boots.
//   type_pseudo    - drives the CodeMirror source editor with supplied text.
//   click_update   - clicks the "Update Flowchart" button in the editor header.
//
// The CodeMirror editor mounts inside .code-editor-host .cm-content. We drive
// it via keyboard input so CodeMirror's reactive update pipeline fires normally
// and the onChange -> set_draft_source -> state chain is exercised end to end.

import type { Page } from "@playwright/test";

//============================================
// AUTOSAVE_KEY
//============================================
// Matches AUTOSAVE_KEY in src/app_state.ts. Referenced by specs that need to
// clear localStorage before loading so autosave cannot restore a prior document.
export const AUTOSAVE_KEY = "pseudo-code-flowchart:document";

//============================================
// clear_autosave
//============================================
// Remove the autosave slot before the page boots. Callers pass this via
// page.addInitScript so the slot is gone before create_app_state reads it.
export async function clear_autosave(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    window.localStorage.removeItem(key);
  }, AUTOSAVE_KEY);
}

//============================================
// type_pseudo
//============================================
// Replace all text in the CodeMirror editor with the supplied source string.
// Clicks the editor to focus it, selects all existing text, then types the
// replacement via keyboard.type so CodeMirror's input pipeline fires normally.
export async function type_pseudo(page: Page, source: string): Promise<void> {
  const editor = page.locator(".code-editor-host .cm-content");
  // Click ensures the editor has focus before we issue keyboard commands.
  await editor.click();
  // ControlOrMeta+a selects the entire editor document regardless of platform.
  await page.keyboard.press("ControlOrMeta+a");
  // keyboard.type sends each character through the browser's input event stream;
  // CodeMirror processes every character so the onChange -> set_draft_source
  // chain fires exactly as it would for a real user typing in the pane.
  await page.keyboard.type(source);
}

//============================================
// click_update
//============================================
// Click the "Update Flowchart" button in the code editor header. Callers
// are responsible for waiting for any resulting graph render afterward.
export async function click_update(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Update Flowchart" }).click();
}
