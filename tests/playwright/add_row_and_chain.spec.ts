// add_row_and_chain.spec.ts - acceptance tests for add-row draft preservation and chain button.
//
// Test A: Add row preserves uncommitted draft.
//   Focus a to-cell, type a value, trigger "+ Add row" via pointer event
//   BEFORE the 150 ms blur commit timer fires, assert the typed value is
//   preserved in the original cell AND that the row count increased by one.
//
// Test B: Chain button behavior.
//   - Chain button is disabled when "to" is blank.
//   - Chain button is enabled after typing a value.
//   - Clicking chain inserts a new row directly below and the new row's "from"
//     equals the previous row's "to" value.

import { test, expect } from "@playwright/test";

// Helper: count the number of triple rows currently visible.
async function count_rows(page: import("@playwright/test").Page): Promise<number> {
  return page.locator(".triple-row").count();
}

test("Add row preserves to-cell draft committed before 150ms blur timer", async ({ page }) => {
  await page.goto("/");

  // Start with one row.
  await page.getByRole("button", { name: "+ Add row" }).click();

  const to1 = page.getByLabel("Row 1 to concept");
  await to1.click();
  // Type a concept name - do NOT press Enter or Tab, so the blur timer has
  // not fired and the draft is still uncommitted.
  await to1.pressSequentially("Nucleus");

  // Capture the row count before clicking Add row.
  const before_count = await count_rows(page);

  // Trigger the Add row button via pointerdown + click but immediately -
  // the onPointerDown handler commits the draft synchronously before the
  // 150 ms blur timer would fire.
  const add_btn = page.getByRole("button", { name: "+ Add row" });
  await add_btn.dispatchEvent("pointerdown");
  await add_btn.click();

  // Wait for the new row to appear; toHaveCount auto-retries until row count grows.
  await expect(page.locator(".triple-row")).toHaveCount(before_count + 1);

  // The original to-cell should contain the typed value (committed synchronously).
  const committed = await to1.inputValue();
  expect(committed).toBe("Nucleus");
});

test("Chain button disabled on blank to, enabled after typing, chained row from equals previous to", async ({
  page,
}) => {
  await page.goto("/");

  // Add the first row.
  await page.getByRole("button", { name: "+ Add row" }).click();

  // Fill in "from" and "verb" for row 1 to make the chain button contextually useful.
  const from1 = page.getByLabel("Row 1 from concept");
  await from1.click();
  await from1.pressSequentially("Cell");
  await from1.press("Tab");
  // Wait for Tab-driven blur commit to propagate before checking chain button state.
  await expect(page.getByLabel("Row 1 from concept")).toHaveValue("Cell");

  const verb1 = page.getByLabel("Row 1 verb phrase");
  await verb1.pressSequentially("contains");

  // Chain button should be disabled while to is blank.
  const chain1 = page.locator(".triple-chain-btn").first();
  await expect(chain1).toBeDisabled();

  // Type a value in the "to" cell without committing via blur.
  const to1 = page.getByLabel("Row 1 to concept");
  await to1.click();
  await to1.pressSequentially("Mitochondria");

  // Chain button should now be enabled (to is non-empty).
  await expect(chain1).toBeEnabled();

  // Click the chain button - it commits the "to" draft synchronously and
  // inserts a new row directly below with from = "Mitochondria".
  // Capture row count before chain click, then assert exactly one row was added.
  const rows_before = await count_rows(page);
  await chain1.click();

  // Wait for the new chained row to appear; toHaveCount auto-retries.
  await expect(page.locator(".triple-row")).toHaveCount(rows_before + 1);

  // The new row's "from" value should equal the previous row's committed "to".
  const from2 = page.getByLabel("Row 2 from concept");
  const from2_value = await from2.inputValue();
  expect(from2_value).toBe("Mitochondria");
});
