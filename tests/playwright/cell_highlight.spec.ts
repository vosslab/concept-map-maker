// cell_highlight.spec.ts - three-color per-cell active-concept highlighting.
//
// Worked example from the plan: two triples that chain through "castes":
//   honeybees -> have -> castes
//   castes    -> include -> workers
// Clicking the row-1 "to" cell (value "castes", already committed) makes
// "castes" the active concept. The expected per-cell classes are:
//   - every cell whose value is "castes"  -> cell-same  (row1 to, row2 from)
//   - row1 from cell (honeybees)          -> cell-from  (points INTO castes)
//   - row2 to cell (workers)              -> cell-to    (castes points OUT to it)
// Blurring the cell clears every per-cell class.
//
// The classes live on the outer .triple-cell-from / .triple-cell-to spans, which
// wrap the ConceptAutocomplete input. We assert directly on those span locators.

import { test, expect } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";
import { enter_triple } from "./helpers";

// Precise role-class matchers. A bare /cell-from/ substring also matches the
// static structural class "triple-cell-from", so anchor with a negative
// lookbehind for word characters and hyphens to match ONLY the standalone
// role class added by the per-cell highlighting feature.
const CELL_FROM = /(?<![\w-])cell-from(?![\w-])/;
const CELL_TO = /(?<![\w-])cell-to(?![\w-])/;
const CELL_SAME = /(?<![\w-])cell-same(?![\w-])/;

// Locate the from-cell span of a 1-based row.
function from_cell(page: Page, row_num: number): Locator {
  return page
    .locator(".triple-row")
    .nth(row_num - 1)
    .locator(".triple-cell-from");
}

// Locate the to-cell span of a 1-based row.
function to_cell(page: Page, row_num: number): Locator {
  return page
    .locator(".triple-row")
    .nth(row_num - 1)
    .locator(".triple-cell-to");
}

test("clicking a committed cell lights related cells in three colors; blur clears", async ({
  page,
}) => {
  await page.goto("/");

  // Add the first row, then enter the two chained triples.
  await page.getByRole("button", { name: "+ Add row" }).click();
  await page.waitForTimeout(100);

  // Triple 1: honeybees -> have -> castes
  await enter_triple(page, 1, "honeybees", "have", "castes");
  // Triple 2: castes -> include -> workers
  await enter_triple(page, 2, "castes", "include", "workers");

  // Click the row-1 "to" cell (value "castes", already committed via Tab) to
  // focus it. Focus-in sets the active concept to the committed value "castes".
  const row1_to_input = page.getByLabel("Row 1 to concept");
  await row1_to_input.click();
  // Wait for focus-driven highlight to propagate: cell-same on the to-cell is the signal.
  await expect(to_cell(page, 1)).toHaveClass(CELL_SAME);

  // Both "castes" cells (row1 to, row2 from) carry cell-same.
  await expect(to_cell(page, 1)).toHaveClass(CELL_SAME);
  await expect(from_cell(page, 2)).toHaveClass(CELL_SAME);

  // Row 1 from cell (honeybees) points INTO castes -> cell-from.
  await expect(from_cell(page, 1)).toHaveClass(CELL_FROM);

  // Row 2 to cell (workers): castes points OUT to it -> cell-to.
  await expect(to_cell(page, 2)).toHaveClass(CELL_TO);

  // Sanity: the from-cell partner is not mistagged as a "to" partner.
  await expect(from_cell(page, 1)).not.toHaveClass(CELL_TO);
  await expect(to_cell(page, 2)).not.toHaveClass(CELL_FROM);

  // Blur the focused cell so focus leaves with no hover target. Active concept
  // clears, so every per-cell role class is removed. Blur the active element and
  // move the mouse off any cell to also clear the hover channel.
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  });
  await page.mouse.move(0, 0);

  // not.toHaveClass expectations auto-retry; no explicit sleep needed.
  await expect(to_cell(page, 1)).not.toHaveClass(CELL_SAME);
  await expect(from_cell(page, 2)).not.toHaveClass(CELL_SAME);
  await expect(from_cell(page, 1)).not.toHaveClass(CELL_FROM);
  await expect(to_cell(page, 2)).not.toHaveClass(CELL_TO);
});
