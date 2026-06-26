// autocomplete.spec.ts - keyboard navigation in ConceptAutocomplete.
//
// Covers the keyboard behaviors for concept autocomplete dropdown navigation:
//   1. ArrowDown then Enter selects a suggestion from the dropdown and commits
//      that suggestion's exact label as the cell value.
//   2. Escape closes the dropdown and keeps the currently-typed text without
//      committing to any suggestion.
//
// The autocomplete is wired into both from and to cells of every triple row.
// This spec types into the "from" cell of a row that already has a concept
// defined in another row, so there is at least one suggestion to navigate.

import { test, expect } from "@playwright/test";
import { enter_triple } from "./helpers";

test("ArrowDown and Enter select existing concept from dropdown", async ({ page }) => {
  await page.goto("/");

  // Add the first row and enter a triple to seed the concept "Mitochondria".
  await page.getByRole("button", { name: "+ Add row" }).click();
  // Guard the 150ms blur timer so the row is fully committed before enter_triple.
  await page.waitForTimeout(100);
  await enter_triple(page, 1, "Mitochondria", "produce", "ATP");

  // Add a second row. We will type in the from cell to trigger autocomplete.
  // "mito" should match "mitochondria" (concept_key normalizes to lowercase).
  const from2 = page.getByLabel("Row 2 from concept");
  await from2.click();
  await from2.pressSequentially("mito");

  // The dropdown listbox should be visible with at least one option.
  const listbox = page.locator('[role="listbox"]');
  await expect(listbox).toBeVisible({ timeout: 3000 });

  // Press ArrowDown to move highlight to the first option.
  await page.keyboard.press("ArrowDown");
  // getAttribute does not auto-retry; wait for ArrowDown state to settle.
  await page.waitForTimeout(50);

  // The first option should now be aria-selected=true.
  const first_option = page.locator('[role="option"]').first();
  const selected = await first_option.getAttribute("aria-selected");
  expect(selected).toBe("true");

  // Press Enter to commit the highlighted suggestion.
  await page.keyboard.press("Enter");
  // inputValue does not auto-retry; guard the commit propagation.
  await page.waitForTimeout(200);

  // The input value should now be the canonical casing of the existing concept.
  // concept_key("Mitochondria") == "mitochondria"; the label is "Mitochondria".
  const committed_value = await from2.inputValue();
  expect(committed_value.toLowerCase()).toBe("mitochondria");
  // The dropdown should be closed after Enter.
  await expect(listbox).not.toBeVisible();
});

test("Escape closes dropdown and keeps typed text", async ({ page }) => {
  await page.goto("/");

  // Seed a concept to ensure the dropdown opens.
  await page.getByRole("button", { name: "+ Add row" }).click();
  // Guard the 150ms blur timer so the row is fully committed before enter_triple.
  await page.waitForTimeout(100);
  await enter_triple(page, 1, "Chloroplast", "absorbs", "Light");

  // Open the second row from cell and type a prefix that matches "Chloroplast".
  const from2 = page.getByLabel("Row 2 from concept");
  await from2.click();
  await from2.pressSequentially("Chlor");

  // Dropdown should be open.
  const listbox = page.locator('[role="listbox"]');
  await expect(listbox).toBeVisible({ timeout: 3000 });

  // Press Escape: closes the dropdown, keeps the typed text "Chlor".
  await page.keyboard.press("Escape");

  // Dropdown should be closed.
  await expect(listbox).not.toBeVisible();

  // The typed text should be preserved exactly.
  const value_after_escape = await from2.inputValue();
  expect(value_after_escape).toBe("Chlor");
});
