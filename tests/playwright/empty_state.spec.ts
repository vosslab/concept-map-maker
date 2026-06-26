// empty_state.spec.ts - empty-state panel and example-loading flows.
//
// Covers:
//   1. Empty start: the empty-state panel is visible and the canvas has no nodes.
//   2. Load via empty-state panel: click an example button; the panel disappears
//      and the canvas shows flow nodes.
//   3. Start blank: clicking focuses the CodeMirror editor content element.
//   4. Toolbar Examples: clicking a toolbar example button loads the flowchart.
//   5. Toolbar Clear: clearing the document brings the panel back.
//
// The autosave key is "pseudo-code-flowchart:document"; localStorage is cleared
// before each test so autosave cannot restore a prior document.

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const AUTOSAVE_KEY = "pseudo-code-flowchart:document";

// Fixed wait used to confirm a no-op: give any erroneous async render time
// before asserting the map is unchanged.
const NO_CHANGE_SETTLE_MS = 800;

//============================================
// clear_autosave
//============================================
async function clear_autosave(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    window.localStorage.removeItem(key);
  }, AUTOSAVE_KEY);
}

//============================================
// Tests
//============================================

test("empty-state panel is visible on start and canvas has no nodes", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  const panel = page.locator(".empty-state-panel");
  await expect(panel).toBeVisible({ timeout: 5000 });

  // No flow nodes should be rendered before any source is submitted.
  const nodes = page.locator("g.flow-node");
  expect(await nodes.count()).toBe(0);
});

test("clicking an empty-state example button loads the chart and hides the panel", async ({
  page,
}) => {
  await clear_autosave(page);
  await page.goto("/");

  const panel = page.locator(".empty-state-panel");
  await expect(panel).toBeVisible({ timeout: 5000 });

  // Click the first example button (Password check, EXAMPLES[0]).
  const first_btn = page.locator(".empty-state-template-btn").first();
  await first_btn.click();

  // The panel should disappear once the graph has nodes.
  await expect(panel).not.toBeVisible({ timeout: 5000 });

  // At least one flow node should be visible on the canvas.
  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });
  expect(await nodes.count()).toBeGreaterThanOrEqual(1);
});

test("Start blank focuses the CodeMirror editor", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  const panel = page.locator(".empty-state-panel");
  await expect(panel).toBeVisible({ timeout: 5000 });

  await page.getByRole("button", { name: "Start blank" }).click();

  // After "Start blank", the active element should be inside the editor host.
  const editor_focused = await page.evaluate(() => {
    const focused = document.activeElement;
    if (focused === null) {
      return false;
    }
    const host = document.querySelector(".code-editor-host");
    return host !== null && host.contains(focused);
  });
  expect(editor_focused).toBe(true);
});

test("toolbar Examples button loads the corresponding flowchart", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  // Load "Password check" from the toolbar Examples group.
  await page.getByRole("button", { name: "Load example: Password check" }).click();

  // The chart should render flow nodes.
  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });
  expect(await nodes.count()).toBeGreaterThanOrEqual(1);

  // The empty-state panel should be hidden.
  const panel = page.locator(".empty-state-panel");
  await expect(panel).not.toBeVisible({ timeout: 3000 });
});

test("toolbar Clear returns to empty state after example loaded", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  // Load an example.
  const first_btn = page.locator(".empty-state-template-btn").first();
  await expect(first_btn).toBeVisible({ timeout: 5000 });
  await first_btn.click();

  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });

  // Click Clear and accept the confirm dialog.
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Clear document" }).click();

  // The empty-state panel must reappear.
  const panel = page.locator(".empty-state-panel");
  await expect(panel).toBeVisible({ timeout: 5000 });

  // No flow nodes should remain.
  expect(await nodes.count()).toBe(0);
});

test("toolbar Examples with existing chart: cancel preserves the current chart", async ({
  page,
}) => {
  await clear_autosave(page);
  await page.goto("/");

  // Load the first example to make the chart non-empty.
  const first_btn = page.locator(".empty-state-template-btn").first();
  await expect(first_btn).toBeVisible({ timeout: 5000 });
  await first_btn.click();

  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });
  const count_before = await nodes.count();
  const title_before = await page.locator(".toolbar-title-input").inputValue();

  // Attempt to load a second example from the toolbar; dismiss the confirm.
  let dialog_message = "";
  page.once("dialog", (dialog) => {
    dialog_message = dialog.message();
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Load example: For loop sum" }).click();

  // Wait a fixed beat so any erroneous replace would have rendered.
  await page.waitForTimeout(NO_CHANGE_SETTLE_MS);

  // The dialog must have appeared with an overwrite warning.
  expect(dialog_message).toContain("Replace");

  // The chart is unchanged: same title and same node count.
  const title_after = await page.locator(".toolbar-title-input").inputValue();
  expect(title_after).toBe(title_before);
  const count_after = await nodes.count();
  expect(count_after).toBe(count_before);
});
