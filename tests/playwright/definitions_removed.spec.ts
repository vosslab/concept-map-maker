// definitions_removed.spec.ts - Regression guard: the Definitions feature was removed.
//
// Asserts that neither the Definitions tab button nor the definitions panel
// is present in the rendered app after page load.

import { test, expect } from "@playwright/test";

test("Definitions tab button is absent from the rendered app", async ({ page }) => {
  await page.goto("/");

  const tab_count = await page.getByRole("tab", { name: "Definitions" }).count();
  expect(tab_count).toBe(0);
});

test("definitions panel element is absent from the rendered app", async ({ page }) => {
  await page.goto("/");

  const panel_count = await page.locator("#panel-definitions").count();
  expect(panel_count).toBe(0);
});
