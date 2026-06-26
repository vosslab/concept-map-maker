// autosave.spec.ts - localStorage autosave and reload persistence.
//
// Verifies that triples entered by the user are autosaved to localStorage and
// survive a full page reload. The autosave is a 500ms-debounced write to the
// "concept-map-maker:document" localStorage key. After reload, create_app_state
// reads from that slot and restores the document.
//
// Steps:
//   1. Enter two triples.
//   2. Wait for the autosave debounce (>500ms) to flush.
//   3. Reload the page.
//   4. Assert the concept nodes are still visible and the concept count matches.

import { test, expect } from "@playwright/test";
import { enter_triple } from "./helpers";

// Match the AUTOSAVE_KEY from app_state.ts so the test can assert on the slot.
const AUTOSAVE_KEY = "concept-map-maker:document";

test("triples persist across page reload via autosave", async ({ page }) => {
  await page.goto("/");

  // Enter two triples.
  await page.getByRole("button", { name: "+ Add row" }).click();
  await page.waitForTimeout(100);

  await enter_triple(page, 1, "Bees", "pollinate", "Flowers");
  await enter_triple(page, 2, "Flowers", "produce", "Honey");

  // Wait for the SVG to render (confirms the state is live).
  const nodes = page.locator("g.concept-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });

  // Wait for the autosave debounce to flush by polling the localStorage key.
  await page.waitForFunction(
    (key: string) => window.localStorage.getItem(key) !== null,
    AUTOSAVE_KEY,
    { timeout: 3000 },
  );

  // Verify the autosave slot was written.
  const saved = await page.evaluate((key: string) => {
    return window.localStorage.getItem(key);
  }, AUTOSAVE_KEY);
  expect(saved).not.toBeNull();

  // Confirm the saved JSON contains our concepts.
  const doc = JSON.parse(saved as string) as { triples: Array<{ from: string; to: string }> };
  const froms = doc.triples.map((t) => t.from.toLowerCase());
  expect(froms.some((f) => f.includes("bee"))).toBe(true);

  // Reload the page.
  await page.reload();
  await page.waitForLoadState("domcontentloaded");

  // After reload, the app should restore the autosaved triples.
  // The SVG nodes should reappear without any user action.
  const nodes_after = page.locator("g.concept-node");
  await expect(nodes_after.first()).toBeVisible({ timeout: 5000 });

  // The concept count should be >= 3 (Bees, Flowers, Honey).
  const count_after = await nodes_after.count();
  expect(count_after).toBeGreaterThanOrEqual(3);
});
