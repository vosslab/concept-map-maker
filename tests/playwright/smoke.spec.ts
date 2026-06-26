// smoke.spec.ts - basic page-load and structural sanity for the pseudo-code
// flowchart editor.
//
// Verifies that the page loads with the expected layout:
//   - The editor pane (left) with the "Update Flowchart" button is visible.
//   - The empty-state panel is shown when no pseudo-code has been submitted.
//   - Submitting valid pseudo-code hides the panel and renders flow nodes.
//   - Dragging the first rendered node moves it in the SVG canvas.
//
// Run:
//   bash build_github_pages.sh
//   npx playwright test tests/playwright/smoke.spec.ts

import { test, expect } from "@playwright/test";
import { clear_autosave, type_pseudo, click_update } from "./helpers";

// Minimal valid pseudo-code: start + one process step + end.
const SIMPLE_SOURCE = "start\noutput hello\nend";

test("editor pane and Update Flowchart button are visible on load", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  // The left editor pane section should be present.
  await expect(page.locator(".editor-pane")).toBeVisible({ timeout: 5000 });

  // The submit button drives the source -> graph pipeline.
  await expect(page.getByRole("button", { name: "Update Flowchart" })).toBeVisible({
    timeout: 5000,
  });
});

test("empty-state panel visible before submit; nodes appear after submit", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  // Before any source is submitted the panel teaches the pseudo-code model.
  const panel = page.locator(".empty-state-panel");
  await expect(panel).toBeVisible({ timeout: 5000 });

  // No flow nodes should exist before submission.
  const nodes = page.locator("g.flow-node");
  expect(await nodes.count()).toBe(0);

  // Type valid source and submit.
  await type_pseudo(page, SIMPLE_SOURCE);
  await click_update(page);

  // The panel disappears once the graph has nodes.
  await expect(panel).not.toBeVisible({ timeout: 5000 });

  // At least one flow node should appear in the SVG canvas.
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });
  expect(await nodes.count()).toBeGreaterThanOrEqual(1);
});

test("rendered node can be dragged to a new position", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  // Use the first example button to populate the chart quickly.
  const first_btn = page.locator(".empty-state-template-btn").first();
  await expect(first_btn).toBeVisible({ timeout: 5000 });
  await first_btn.click();

  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });

  // Read the first node's bounding box before the drag.
  const first_node = nodes.first();
  const before = await first_node.boundingBox();
  expect(before).not.toBeNull();

  if (before !== null) {
    const start_x = before.x + before.width / 2;
    const start_y = before.y + before.height / 2;
    // Drag by a large enough amount to be unambiguous.
    await page.mouse.move(start_x, start_y);
    await page.mouse.down();
    await page.mouse.move(start_x + 120, start_y + 80, { steps: 8 });
    await page.mouse.up();

    const after = await first_node.boundingBox();
    expect(after).not.toBeNull();
    if (after !== null) {
      // The node must have moved a meaningful distance in at least one axis.
      const moved = Math.abs(after.x - before.x) + Math.abs(after.y - before.y);
      expect(moved).toBeGreaterThan(5);
    }
  }
});
