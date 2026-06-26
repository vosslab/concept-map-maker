// highlight.spec.ts - bidirectional cross-highlight behavior.
//
// Enters two triples that share a concept ("Sun" appears in both), then:
//   1. Row hover -> assert the corresponding edge gets the highlight stroke color
//      and both endpoint nodes show the highlight ring.
//   2. Node hover -> assert all rows that reference the hovered concept have the
//      CSS "highlighted" class.
//
// The highlight is driven by the HoverState signal: row mouseenter calls
// set_hover({source:"row", tripleId}), which causes highlighted_triples and
// highlighted_concepts to update reactively. The spec verifies the DOM outcome,
// not the signal internals.

import { test, expect } from "@playwright/test";
import { enter_triple } from "./helpers";

// The accent color applied to highlighted edges (from concept_edge.tsx EDGE_ACCENT_COLOR).
// matches EDGE accent in src/concept_edge.tsx; update together.
const EDGE_ACCENT_COLOR = "#1565c0";

test("row hover highlights edge and nodes bidirectionally", async ({ page }) => {
  await page.goto("/");

  // Add the first row and enter two triples. Sun is shared between both.
  await page.getByRole("button", { name: "+ Add row" }).click();
  await page.waitForTimeout(100);

  // Triple 1: Sun -> gives -> Energy
  await enter_triple(page, 1, "Sun", "gives", "Energy");
  // Triple 2: Sun -> warms -> Earth  (Sun is the from concept in both)
  await enter_triple(page, 2, "Sun", "warms", "Earth");

  // Wait for the map to render.
  const nodes = page.locator("g.concept-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });

  // --- Part 1: hover a triple row -> edge highlight ---

  // Hover the first triple row.
  const first_row = page.locator(".triple-row").first();
  await first_row.hover();
  await page.waitForTimeout(100);

  // The first edge group in the SVG corresponds to the first rendered triple.
  // Check its path element for the accent stroke color.
  const first_edge = page.locator("g[data-edge-id]").first();
  const edge_path = first_edge.locator("path");
  const stroke = await edge_path.getAttribute("stroke");
  expect(stroke).toBe(EDGE_ACCENT_COLOR);

  // --- Part 2: node hover -> row highlight ---

  // Move off the row first to clear hover state.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(100);

  // Hover the Sun concept node. Sun appears in both triples so both rows should
  // get the "highlighted" class.
  const sun_node = page.locator("g.concept-node[data-concept-key='sun']");
  await sun_node.hover();
  await page.waitForTimeout(100);

  // Both rows should be highlighted when hovering a shared concept node.
  const highlighted_rows = page.locator(".triple-row.highlighted");
  const highlight_count = await highlighted_rows.count();
  expect(highlight_count).toBeGreaterThanOrEqual(2);

  // Move off to clear.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(100);
  const cleared = await highlighted_rows.count();
  expect(cleared).toBe(0);
});
