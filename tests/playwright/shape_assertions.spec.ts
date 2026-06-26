// shape_assertions.spec.ts - per-node shape assertions for the flowchart renderer.
//
// Each flow node rendered by FlowNode (src/flow_node.tsx) carries a stable
// data-shape="<kind>" attribute. These tests assert the expected shapes for the
// password-check example so a regression that renders every node as a rectangle
// (the default "process" shape) fails deterministically rather than passing
// as a silent visual degradation.
//
// Shapes asserted for the password-check example:
//   terminal   - oval: Start and End nodes.
//   io         - parallelogram: input/output statements.
//   decision   - diamond: the if/else branch node.
//
// Run:
//   bash build_github_pages.sh
//   npx playwright test tests/playwright/shape_assertions.spec.ts

import { test, expect } from "@playwright/test";
import { clear_autosave } from "./helpers";

test("password-check example renders terminal, io, and decision shapes", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  // Load the password-check example via the first empty-state button.
  // EXAMPLES[0] is "Password check" from src/templates.ts.
  const first_btn = page.locator(".empty-state-template-btn").first();
  await expect(first_btn).toBeVisible({ timeout: 5000 });
  await first_btn.click();

  // Wait for the chart to render nodes.
  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });

  // Terminal (oval) nodes must exist for the Start and End statements.
  const terminal_nodes = page.locator("g.flow-node[data-shape='terminal']");
  await expect(terminal_nodes.first()).toBeVisible({ timeout: 3000 });
  expect(await terminal_nodes.count()).toBeGreaterThanOrEqual(2);

  // io (parallelogram) nodes for input/output statements.
  const io_nodes = page.locator("g.flow-node[data-shape='io']");
  await expect(io_nodes.first()).toBeVisible({ timeout: 3000 });
  expect(await io_nodes.count()).toBeGreaterThanOrEqual(1);

  // decision (diamond) node for the if/else branch.
  const decision_nodes = page.locator("g.flow-node[data-shape='decision']");
  await expect(decision_nodes.first()).toBeVisible({ timeout: 3000 });
  expect(await decision_nodes.count()).toBeGreaterThanOrEqual(1);
});

test("not all rendered nodes are process rectangles (regression guard)", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  // Load the password-check example (has terminal, io, and decision shapes).
  const first_btn = page.locator(".empty-state-template-btn").first();
  await expect(first_btn).toBeVisible({ timeout: 5000 });
  await first_btn.click();

  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });
  const total = await nodes.count();
  expect(total).toBeGreaterThan(0);

  // Count non-process, non-connector nodes.
  // A renderer that falls back to all rectangles would produce zero here.
  const shaped_nodes = page.locator(
    "g.flow-node:not([data-shape='process']):not([data-shape='connector'])",
  );
  const shaped_count = await shaped_nodes.count();

  // The password-check example must yield at least three non-process nodes
  // (terminal Start, terminal End, and one io or decision node).
  expect(shaped_count).toBeGreaterThanOrEqual(3);
});

test("for-loop example renders loop (hexagon) nodes", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  // Load the for-loop example from the toolbar. EXAMPLES[1] is "For loop sum".
  await page.getByRole("button", { name: "Load example: For loop sum" }).click();

  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });

  // At least one loop (hexagon) node must render for the for statement.
  const loop_nodes = page.locator("g.flow-node[data-shape='loop']");
  await expect(loop_nodes.first()).toBeVisible({ timeout: 3000 });
  expect(await loop_nodes.count()).toBeGreaterThanOrEqual(1);
});
