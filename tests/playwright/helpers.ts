// helpers.ts - shared Playwright helpers for concept-map-maker specs.
//
// Provides a reusable enter_triple function and a paste_tsv helper used across
// multiple spec files so each spec stays focused on the behavior it verifies.
//
// Interactions:
//   - from/to cells: ConceptAutocomplete inputs (blur commits after 150ms).
//   - verb cells: plain inputs (Enter calls on_enter which adds the next row).
//   - The app starts empty; callers must add at least the first row before
//     calling enter_triple for row 1.

import type { Page } from "@playwright/test";

// Settle time after pressing Enter in the verb cell. The enter handler calls
// requestAnimationFrame for focus; add a small buffer for the frame to resolve.
const ENTER_SETTLE_MS = 200;

// Settle time for the ConceptAutocomplete blur timer (150ms) plus render frame.
const BLUR_SETTLE_MS = 250;

//============================================
// enter_triple
//============================================
// Type from, verb, and to into an existing row (row_num is 1-based).
// Pressing Enter in the verb cell triggers the row enter handler: if the row is
// last, the handler adds a new blank row, so the caller does NOT need to click
// "+ Add row" before calling enter_triple for the next row number.
export async function enter_triple(
  page: Page,
  row_num: number,
  from_text: string,
  verb_text: string,
  to_text: string,
): Promise<void> {
  const from_input = page.getByLabel(`Row ${row_num} from concept`);
  const verb_input = page.getByLabel(`Row ${row_num} verb phrase`);
  const to_input = page.getByLabel(`Row ${row_num} to concept`);

  // From cell: type, Escape to close the dropdown, Tab to advance.
  await from_input.click();
  await from_input.pressSequentially(from_text);
  // Escape closes autocomplete without committing; Tab triggers blur->commit.
  await page.keyboard.press("Escape");
  await from_input.press("Tab");

  // Verb cell: plain input (no autocomplete). Enter fires the row enter handler.
  await verb_input.pressSequentially(verb_text);
  // Enter on the last row adds a new blank row and moves focus.
  await verb_input.press("Enter");
  // Wait for requestAnimationFrame + render to settle.
  await page.waitForTimeout(ENTER_SETTLE_MS);

  // To cell: type then Escape to close dropdown, Tab to commit via blur.
  await to_input.click();
  await to_input.pressSequentially(to_text);
  await page.keyboard.press("Escape");
  await to_input.press("Tab");
  // Wait for the 150ms blur timer in ConceptAutocomplete to fire.
  await page.waitForTimeout(BLUR_SETTLE_MS);
}

//============================================
// paste_tsv
//============================================
// Dispatch a synthetic paste event carrying TSV text to the triples-rows
// container. The triples table intercepts multi-cell paste (text with tabs/newlines)
// and calls bulk_insert_triples. Returns after waiting for the bulk insert to
// complete (one animation frame).
export async function paste_tsv(page: Page, tsv_text: string): Promise<void> {
  // Dispatch the paste event directly via evaluate. The triples-rows onPaste
  // handler fires on any paste event that bubbles up to it, regardless of focus.
  // We dispatch on the triples table wrapper so the event reaches the handler.
  await page.evaluate((text) => {
    // Try triples-rows first; fall back to triples-table.
    const target =
      document.querySelector(".triples-rows") ?? document.querySelector(".triples-table");
    if (target === null) {
      throw new Error("triples container not found");
    }
    // Build a DataTransfer with the TSV text and dispatch a paste event.
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    const event = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
  }, tsv_text);

  // Wait for Solid's reactive updates to settle (reactive store update + layout).
  await page.waitForTimeout(300);
}
