// autosave.spec.ts - localStorage autosave and reload persistence.
//
// Verifies that a submitted flowchart is autosaved to localStorage and survives
// a full page reload. The autosave is a 500ms-debounced write to the
// "pseudo-code-flowchart:document" localStorage key. After reload, create_app_state
// reads from that slot and restores the document.
//
// Steps:
//   1. Load an example (password-check); nodes appear in the canvas.
//   2. Wait for the autosave debounce (> 500ms) to flush.
//   3. Confirm the autosave slot was written with expected source text.
//   4. Reload the page.
//   5. Assert flow nodes are still visible without any user action.

import { test, expect } from "@playwright/test";

// Matches AUTOSAVE_KEY in src/app_state.ts.
const AUTOSAVE_KEY = "pseudo-code-flowchart:document";

test("flowchart persists across page reload via autosave", async ({ page }) => {
  // Navigate first (blank page), then clear the autosave slot via evaluate so the
  // clear runs only ONCE. addInitScript would re-run on page.reload() and wipe the
  // slot that the autosave just wrote -- that is exactly the race we are testing against.
  await page.goto("/");
  await page.evaluate((key: string) => {
    window.localStorage.removeItem(key);
  }, AUTOSAVE_KEY);

  // Reload after clearing so the page boots with no stored document.
  await page.reload();
  await page.waitForLoadState("domcontentloaded");

  // Load the password-check example. load_example calls load_source which
  // submits the source, rendering the chart and triggering autosave.
  const first_btn = page.locator(".empty-state-template-btn").first();
  await expect(first_btn).toBeVisible({ timeout: 5000 });
  await first_btn.click();

  // Wait for the SVG to render (confirms the state is live).
  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });

  // Wait for the autosave debounce to flush by polling the localStorage key.
  await page.waitForFunction(
    (key: string) => window.localStorage.getItem(key) !== null,
    AUTOSAVE_KEY,
    { timeout: 3000 },
  );

  // Verify the autosave slot was written and contains the source text.
  const saved = await page.evaluate(
    (key: string) => window.localStorage.getItem(key),
    AUTOSAVE_KEY,
  );
  expect(saved).not.toBeNull();

  // The saved JSON must include the document source field.
  const doc = JSON.parse(saved as string) as { source?: string };
  expect(typeof doc.source).toBe("string");
  // The password-check source contains "input password".
  expect((doc.source ?? "").toLowerCase()).toContain("input");

  // Reload the page.
  await page.reload();
  await page.waitForLoadState("domcontentloaded");

  // After reload the app reads the autosaved document and re-derives the graph.
  // Flow nodes should reappear without any user action.
  const nodes_after = page.locator("g.flow-node");
  await expect(nodes_after.first()).toBeVisible({ timeout: 5000 });

  // At least one node must survive the reload round-trip.
  const count_after = await nodes_after.count();
  expect(count_after).toBeGreaterThanOrEqual(1);
});

test("autosave slot uses the pseudo-code-flowchart:document key", async ({ page }) => {
  // Clear the slot first so the test is independent.
  await page.addInitScript((key: string) => {
    window.localStorage.removeItem(key);
  }, AUTOSAVE_KEY);

  await page.goto("/");

  // Load an example to trigger an autosave write.
  const first_btn = page.locator(".empty-state-template-btn").first();
  await expect(first_btn).toBeVisible({ timeout: 5000 });
  await first_btn.click();

  await page.locator("g.flow-node").first().waitFor({ timeout: 5000 });

  // Poll until the key is written.
  await page.waitForFunction(
    (key: string) => window.localStorage.getItem(key) !== null,
    AUTOSAVE_KEY,
    { timeout: 3000 },
  );

  // The old concept-map-maker key must NOT have been written.
  const old_key_value = await page.evaluate(() =>
    window.localStorage.getItem("concept-map-maker:document"),
  );
  expect(old_key_value).toBeNull();

  // The new pseudo-code key must be present.
  const new_key_value = await page.evaluate(
    (key: string) => window.localStorage.getItem(key),
    AUTOSAVE_KEY,
  );
  expect(new_key_value).not.toBeNull();
});
