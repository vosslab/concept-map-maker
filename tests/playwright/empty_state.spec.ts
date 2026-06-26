// empty_state.spec.ts - empty-state panel and template-loading user flows.
//
// Covers:
//   1. Empty start: the empty-state panel is visible and the canvas has no nodes.
//   2. Load via empty-state panel: click the first template button; the panel
//      disappears and the canvas shows nodes.
//   3. Return to empty: click the toolbar Clear button; the panel reappears.
//   4. Toolbar overwrite - cancel: with a non-empty map, open the toolbar Examples
//      control and pick a different template; the confirm dialog appears; cancel
//      preserves the current map unchanged.
//   5. Toolbar overwrite - accept: repeat and accept; the map is replaced.
//
// Implementation notes:
//   - Clear localStorage before each test so autosave cannot restore a previous
//     document. The autosave key is "concept-map-maker:document" (matches
//     AUTOSAVE_KEY in autosave.spec.ts and the autosave implementation).
//   - Use the toolbar Clear button (not page reload) to return to the empty state
//     deterministically, so the result is independent of any autosaved state.
//   - Confirm dialogs are handled by registering a page.on("dialog") listener
//     before the action that triggers them.
//   - Node selector: "g.concept-node" -- established by smoke.spec.ts, drag.spec.ts,
//     and highlight.spec.ts (all read live canvas nodes from the SVG).

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// Autosave slot: clear this before each test for a deterministic empty start.
const AUTOSAVE_KEY = "concept-map-maker:document";

// Fixed wait used only to confirm a CANCELED load is a no-op: give any erroneous
// async replace (Solid update + dagre layout) time to render before asserting the
// map is unchanged. Positive transitions use auto-retrying expect() instead.
const NO_CHANGE_SETTLE_MS = 800;

//============================================
// clear_autosave
//============================================
// Remove the autosave slot from localStorage before the app boots so the
// page always starts with an empty document, regardless of prior test runs.
async function clear_autosave(page: Page): Promise<void> {
  // addInitScript runs before the page's own scripts, so the slot is clear
  // before create_app_state reads it during startup.
  await page.addInitScript((key: string) => {
    window.localStorage.removeItem(key);
  }, AUTOSAVE_KEY);
}

//============================================
// click_clear_confirm
//============================================
// Click the toolbar Clear button and accept the confirm dialog.
// Registers the dialog handler before the click so it is always in place.
async function click_clear_confirm(page: Page): Promise<void> {
  // Register the accept handler before triggering the dialog.
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Clear document" }).click();
}

//============================================
// Tests
//============================================

test("empty-state panel is visible on start and canvas has no nodes", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  // The empty-state panel should be present and visible.
  const panel = page.locator(".empty-state-panel");
  await expect(panel).toBeVisible({ timeout: 5000 });

  // No concept nodes should be rendered on the canvas.
  const nodes = page.locator("g.concept-node");
  expect(await nodes.count()).toBe(0);
});

test("clicking an empty-state template button loads the map and hides the panel", async ({
  page,
}) => {
  await clear_autosave(page);
  await page.goto("/");

  // Confirm the panel is visible before loading.
  const panel = page.locator(".empty-state-panel");
  await expect(panel).toBeVisible({ timeout: 5000 });

  // Click the first template button (Honeybees -- first entry in TEMPLATES).
  // No confirm dialog for an empty map; load_template skips the prompt when
  // triples.length === 0.
  const first_template_btn = page.locator(".empty-state-template-btn").first();
  await first_template_btn.click();

  // The panel should be hidden now that the map has triples.
  await expect(panel).not.toBeVisible();

  // At least one concept node should be visible on the canvas.
  const nodes = page.locator("g.concept-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });
  expect(await nodes.count()).toBeGreaterThanOrEqual(1);
});

test("toolbar Clear returns to the empty state after a template is loaded", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  // Load a template from the empty-state panel.
  const panel = page.locator(".empty-state-panel");
  await expect(panel).toBeVisible({ timeout: 5000 });

  const first_template_btn = page.locator(".empty-state-template-btn").first();
  await first_template_btn.click();

  // Confirm the map is non-empty and the panel is gone.
  const nodes = page.locator("g.concept-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });
  await expect(panel).not.toBeVisible();

  // Click Clear and accept the confirm dialog.
  await click_clear_confirm(page);

  // The empty-state panel should reappear.
  await expect(panel).toBeVisible({ timeout: 5000 });

  // No concept nodes should remain.
  expect(await nodes.count()).toBe(0);
});

test("toolbar Examples cancel preserves the current map unchanged", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  // Start with the Honeybees template loaded from the empty-state panel.
  const panel = page.locator(".empty-state-panel");
  await expect(panel).toBeVisible({ timeout: 5000 });

  const first_template_btn = page.locator(".empty-state-template-btn").first();
  await first_template_btn.click();

  // Record the node count for the first template (Honeybees).
  const nodes = page.locator("g.concept-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });
  const count_before = await nodes.count();
  expect(count_before).toBeGreaterThanOrEqual(1);

  // Record the document title to verify the map is unchanged after cancel.
  const title_before = await page.locator(".toolbar-title-input").inputValue();

  // Attempt to load a DIFFERENT template via the toolbar Examples group.
  // The second entry in TEMPLATES is "Water cycle". Register a dialog handler
  // to DISMISS (cancel) the confirm prompt.
  let dialog_message = "";
  page.once("dialog", (dialog) => {
    dialog_message = dialog.message();
    void dialog.dismiss();
  });

  await page.getByRole("button", { name: "Load example: Water cycle" }).click();
  // Canceled load is a no-op; wait a fixed beat so any erroneous replace would
  // have rendered, then assert the map is unchanged.
  await page.waitForTimeout(NO_CHANGE_SETTLE_MS);

  // Verify the dialog carried the expected overwrite warning.
  expect(dialog_message).toContain("Replace the current concept map");

  // The map should be unchanged: same title and same node count.
  const title_after_cancel = await page.locator(".toolbar-title-input").inputValue();
  expect(title_after_cancel).toBe(title_before);

  const count_after_cancel = await nodes.count();
  expect(count_after_cancel).toBe(count_before);

  // The panel must still be hidden (the map is non-empty).
  await expect(panel).not.toBeVisible();
});

test("toolbar Examples accept replaces the current map", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  // Load the Honeybees template from the empty-state panel.
  const panel = page.locator(".empty-state-panel");
  await expect(panel).toBeVisible({ timeout: 5000 });

  const first_template_btn = page.locator(".empty-state-template-btn").first();
  await first_template_btn.click();

  const nodes = page.locator("g.concept-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });

  // Confirm the first template title (Honeybees).
  const title_before = await page.locator(".toolbar-title-input").inputValue();
  expect(title_before.toLowerCase()).toContain("honeybee");

  // Load a different template via the toolbar Examples group and ACCEPT.
  // The second entry in TEMPLATES is "Water cycle".
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });

  await page.getByRole("button", { name: "Load example: Water cycle" }).click();

  // Wait deterministically for the title to become the Water cycle template
  // rather than sleeping a fixed time.
  const title_input = page.locator(".toolbar-title-input");
  await expect(title_input).toHaveValue(/water cycle/i);

  // The canvas should still show nodes (Water cycle has triples).
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });
  expect(await nodes.count()).toBeGreaterThanOrEqual(1);

  // The panel must be hidden (the new map is non-empty).
  await expect(panel).not.toBeVisible();
});

test("Start blank adds a row and focuses the first table input", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  const panel = page.locator(".empty-state-panel");
  await expect(panel).toBeVisible({ timeout: 5000 });

  // Click the secondary "Start blank" button.
  await page.getByRole("button", { name: "Start blank" }).click();

  // The panel hides once the first (empty) row is added.
  await expect(panel).not.toBeVisible();

  // Focus must land on the first triples-table input (the from-cell) so the user
  // has an obvious next action. toBeFocused auto-retries until the rAF focus lands.
  const first_input = page.locator(".triple-row input").first();
  await expect(first_input).toBeFocused();
});
