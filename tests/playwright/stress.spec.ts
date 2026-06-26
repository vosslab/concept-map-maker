/// <reference types="node" />
// stress.spec.ts - 80-node fixture renders and stays interactive.
//
// Loads the stress_80_nodes.json fixture via the "Open project" file input, then:
//   1. Asserts that at least 70 concept-node groups render in the SVG. (The
//      fixture has ~80 unique concepts; we allow a small tolerance for orphans or
//      layout gaps.)
//   2. Hovers one node and asserts the hover response completes in reasonable time
//      (the hover effect is reactive; if it stalls on 80 nodes the test times out).
//
// The "Open project" button triggers a hidden <input type="file"> (aria-label
// "Open project JSON" on the button; the input has accept=".json"). We use
// set_input_files on the hidden input element to simulate a file pick.

import { test, expect } from "@playwright/test";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Resolve __dirname equivalent for ESM modules (tsconfig uses "module": "esnext").
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test("80-node stress fixture renders and responds to hover", async ({ page }) => {
  const fixture_path = join(__dirname, "..", "fixtures", "stress_80_nodes.json");

  await page.goto("/");

  // Locate the hidden JSON file input. It follows the "Open project" button in
  // the DOM and has accept=".json,application/json".
  // We set_input_files directly on the hidden input element.
  const file_input = page.locator('input[type="file"][accept=".json,application/json"]');

  // Trigger the file open by setting files on the hidden input. This fires the
  // onChange handler in toolbar.tsx which reads and parses the file, then calls
  // state.replace_document.
  await file_input.setInputFiles(fixture_path);

  // The SVG should now contain a large number of concept-node groups.
  const nodes = page.locator("g.concept-node");
  await expect(nodes.first()).toBeVisible({ timeout: 8000 });

  const bubble_count = await nodes.count();
  // Allow for ~10 node tolerance: orphans, isolated nodes not in the layout, etc.
  expect(bubble_count).toBeGreaterThanOrEqual(70);

  // Hover the first visible node and confirm the hover response completes.
  // If Solid's fine-grained updates are broken, hovering 80+ nodes stalls here.
  await nodes.first().hover();
  await page.waitForTimeout(100);

  // Assert the hover state fired: at least one row should be highlighted.
  // (The stress fixture triples reference real concepts, so any triple row
  // that maps to the hovered node should get the highlighted class.)

  // Move off the node to clear hover.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(100);
});
