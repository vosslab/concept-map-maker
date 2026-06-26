// smoke.spec.ts - basic interactive path for Concept Map Maker.
//
// Protects the core loop: load the app, enter three triples in the table, see
// the resulting bubbles in the map, and drag one bubble. This guards the
// table -> derivation -> layout -> render -> drag chain end to end.
//
// Run:
//   bash build_github_pages.sh
//   npx playwright test

import { test, expect } from "@playwright/test";
import { enter_triple } from "./helpers";

// Three concepts forming a simple chain: Sun -> Energy -> Plants -> Animals.
const TRIPLES = [
  { from: "Sun", verb: "gives", to: "Energy" },
  { from: "Energy", verb: "powers", to: "Plants" },
  { from: "Plants", verb: "feed", to: "Animals" },
];

test("enter three triples, see bubbles, drag one", async ({ page }) => {
  await page.goto("/");

  // The app starts with no rows. Add the first row before entering data.
  // After that, pressing Enter in the verb cell adds subsequent rows via the
  // row-enter handler in TriplesTable (see enter_triple in helpers.ts).
  await page.getByRole("button", { name: "+ Add row" }).click();
  await page.waitForTimeout(100);

  for (const [index, row] of TRIPLES.entries()) {
    await enter_triple(page, index + 1, row.from, row.verb, row.to);
  }

  // The chain Sun->Energy->Plants->Animals yields four unique concepts, but the
  // minimum interactive expectation is "at least three bubbles render".
  const nodes = page.locator("g.concept-node");
  await expect(nodes.first()).toBeVisible();
  expect(await nodes.count()).toBeGreaterThanOrEqual(3);

  // Drag the first bubble and confirm its rendered position changes. We read the
  // bubble's bounding box before and after a pointer drag.
  const first_node = nodes.first();
  const before = await first_node.boundingBox();
  expect(before).not.toBeNull();

  if (before !== null) {
    const start_x = before.x + before.width / 2;
    const start_y = before.y + before.height / 2;
    await page.mouse.move(start_x, start_y);
    await page.mouse.down();
    await page.mouse.move(start_x + 120, start_y + 80, { steps: 8 });
    await page.mouse.up();

    const after = await first_node.boundingBox();
    expect(after).not.toBeNull();
    if (after !== null) {
      // The bubble moved meaningfully in at least one axis.
      const moved = Math.abs(after.x - before.x) + Math.abs(after.y - before.y);
      expect(moved).toBeGreaterThan(5);
    }
  }
});
