// drag.spec.ts - drag full-distance tracking for flow nodes.
//
// Why map-space measurement (not screen-space):
//   src/map_canvas.tsx view_box() recomputes effective_extent() on every drag
//   move, so as the dragged node moves outward the <svg> viewBox grows and the
//   whole map re-centers AND re-scales under preserveAspectRatio="xMidYMid meet".
//   A node's SCREEN position therefore mixes the real drag with a global refit
//   (a scale change, not just a translation), and subtracting a reference node
//   does not cancel it.
//
//   The fix: measure the dragged node in MAP/user units via getBBox(). Each flow
//   node renders as <g class="flow-node" data-node-id="..." data-shape="..."> ...
//   inside <g data-viewport transform="translate scale">. The node <g> carries
//   NO transform of its own; the drag writes the new center directly into the
//   child shape's attributes in the viewBox coordinate space. So getBBox() on the
//   node <g> returns the node center in MAP units, immune to the viewBox refit.
//
// Invariants verified:
//   1. Full-distance tracking (identity viewport): map-space displacement of the
//      dragged node is at least 60% of screen_delta / final_scale.
//   2. Full-distance tracking under a non-identity zoom viewport.

import { test, expect } from "@playwright/test";
import { clear_autosave } from "./helpers";

// Fraction of the expected full map-space delta the drag must achieve to pass.
// A working drag lands ~100% (minus sub-pixel noise); a broken drag (capture lost
// after step 1 of 6) lands ~17%. 60% sits well between the two regimes.
const MIN_TRACKING_FRACTION = 0.6;

// Generous ceiling: only guards against a NaN or runaway override. The mid-gesture
// viewBox refit makes the true map delta exceed the single-snapshot estimate
// (~2.1x observed), so the ceiling is loose.
const SANITY_CEILING_FRACTION = 5;

//============================================
// map_space_metrics
//============================================
// Read the first flow-node's MAP-space center from its <g> bounding box plus
// the screen->map scale from its live CTM. Both are immune to the viewBox refit.
async function map_space_metrics(
  page: import("@playwright/test").Page,
): Promise<{ cx: number; cy: number; scale: number } | null> {
  return page.evaluate(() => {
    const node = document.querySelector<SVGGraphicsElement>("g.flow-node");
    if (node === null) {
      return null;
    }
    const ctm = node.getScreenCTM();
    if (ctm === null) {
      return null;
    }
    const bbox = node.getBBox();
    // Uniform scale: geometric mean of the CTM's a (x-scale) and d (y-scale).
    const scale = Math.sqrt(ctm.a * ctm.d);
    return { cx: bbox.x + bbox.width / 2, cy: bbox.y + bbox.height / 2, scale };
  });
}

test("dragged node tracks full distance in map space (identity viewport)", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  // Load the first example to populate the canvas quickly.
  const first_btn = page.locator(".empty-state-template-btn").first();
  await expect(first_btn).toBeVisible({ timeout: 5000 });
  await first_btn.click();

  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });
  expect(await nodes.count()).toBeGreaterThanOrEqual(2);

  // Read the first node's screen bounding box for the grab point.
  const target = nodes.first();
  const before_box = await target.boundingBox();
  expect(before_box).not.toBeNull();
  const cx = before_box!.x + before_box!.width / 2;
  const cy = before_box!.y + before_box!.height / 2;

  // Map-space center + screen->map scale BEFORE the drag.
  const before = await map_space_metrics(page);
  expect(before).not.toBeNull();

  // Drag by (80, 60) screen pixels in 6 steps.
  const drag_dx = 80;
  const drag_dy = 60;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + drag_dx, cy + drag_dy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(100);

  // Map-space center AFTER the drag.
  const after = await map_space_metrics(page);
  expect(after).not.toBeNull();

  // The node must have moved in screen space (sanity check).
  const screen_after = await target.boundingBox();
  expect(screen_after).not.toBeNull();
  const screen_delta =
    Math.abs(screen_after!.x - before_box!.x) + Math.abs(screen_after!.y - before_box!.y);
  expect(screen_delta).toBeGreaterThan(5);

  // Expected MAP-space delta = screen delta / post-drag scale.
  const expected_map_dx = drag_dx / after!.scale;
  const expected_map_dy = drag_dy / after!.scale;
  const expected_map_dist = Math.sqrt(expected_map_dx ** 2 + expected_map_dy ** 2);

  // Actual MAP-space displacement.
  const actual_map_dx = after!.cx - before!.cx;
  const actual_map_dy = after!.cy - before!.cy;
  const actual_map_dist = Math.sqrt(actual_map_dx ** 2 + actual_map_dy ** 2);

  // Primary guard: the drag tracked the full gesture in map space.
  expect(actual_map_dist).toBeGreaterThanOrEqual(expected_map_dist * MIN_TRACKING_FRACTION);
  expect(actual_map_dist).toBeLessThanOrEqual(expected_map_dist * SANITY_CEILING_FRACTION);
});

test("dragged node tracks full distance in map space under non-identity zoom", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  // Load an example to get nodes on the canvas.
  const first_btn = page.locator(".empty-state-template-btn").first();
  await expect(first_btn).toBeVisible({ timeout: 5000 });
  await first_btn.click();

  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });

  // Wheel-zoom the canvas to a non-identity scale.
  const target = nodes.first();
  await expect(target).toBeVisible({ timeout: 2000 });
  const pre_zoom = await target.boundingBox();
  expect(pre_zoom).not.toBeNull();
  const node_cx = pre_zoom!.x + pre_zoom!.width / 2;
  const node_cy = pre_zoom!.y + pre_zoom!.height / 2;

  await page.mouse.move(node_cx, node_cy);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(200);

  // Re-read the post-zoom bounding box and map metrics.
  await expect(target).toBeVisible({ timeout: 2000 });
  const before_box = await target.boundingBox();
  expect(before_box).not.toBeNull();
  const cx = before_box!.x + before_box!.width / 2;
  const cy = before_box!.y + before_box!.height / 2;

  const before = await map_space_metrics(page);
  expect(before).not.toBeNull();

  // Drag by (80, 60) screen pixels in 6 steps.
  const drag_dx = 80;
  const drag_dy = 60;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + drag_dx, cy + drag_dy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(100);

  const after = await map_space_metrics(page);
  expect(after).not.toBeNull();

  const expected_map_dx = drag_dx / after!.scale;
  const expected_map_dy = drag_dy / after!.scale;
  const expected_map_dist = Math.sqrt(expected_map_dx ** 2 + expected_map_dy ** 2);

  const actual_map_dx = after!.cx - before!.cx;
  const actual_map_dy = after!.cy - before!.cy;
  const actual_map_dist = Math.sqrt(actual_map_dx ** 2 + actual_map_dy ** 2);

  expect(actual_map_dist).toBeGreaterThanOrEqual(expected_map_dist * MIN_TRACKING_FRACTION);
  expect(actual_map_dist).toBeLessThanOrEqual(expected_map_dist * SANITY_CEILING_FRACTION);
});
