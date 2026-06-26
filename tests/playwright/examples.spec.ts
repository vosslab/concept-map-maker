// examples.spec.ts - example loading and screenshot capture.
//
// Verifies that each bundled example (from src/templates.ts EXAMPLES) renders
// flow nodes correctly and saves visual evidence screenshots to
// tests/playwright/__screenshots__/ for human review.
//
// Screenshots saved:
//   - password_check.png  (Password check example)
//   - for_loop_sum.png    (For loop sum example)
//
// These screenshots serve as visual evidence for the manual review gate in the
// migration plan and are committed alongside the test run artifacts.

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Resolve screenshots directory under the Playwright test tree.
// path.resolve without a base uses process.cwd(), which Playwright sets to the
// repo root, so this is equivalent to <repo_root>/tests/playwright/__screenshots__/.
const SCREENSHOTS_DIR = path.resolve("tests/playwright/__screenshots__");

// Ensure the screenshots directory exists before any test writes to it.
function ensure_screenshots_dir(): void {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

// Autosave key: clear before each test so autosave cannot restore a prior doc.
const AUTOSAVE_KEY = "pseudo-code-flowchart:document";

async function clear_autosave(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript((key: string) => {
    window.localStorage.removeItem(key);
  }, AUTOSAVE_KEY);
}

test("password-check example renders and screenshot saved", async ({ page }) => {
  ensure_screenshots_dir();
  await clear_autosave(page);
  await page.goto("/");

  // Load "Password check" via the first empty-state button.
  const first_btn = page.locator(".empty-state-template-btn").first();
  await expect(first_btn).toBeVisible({ timeout: 5000 });
  await first_btn.click();

  // Wait for flow nodes to appear in the canvas.
  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });
  expect(await nodes.count()).toBeGreaterThanOrEqual(1);

  // The empty-state panel must be hidden.
  await expect(page.locator(".empty-state-panel")).not.toBeVisible({ timeout: 3000 });

  // Move pointer to neutral corner so no node shows a hover-highlight ring.
  await page.mouse.move(0, 0);

  // Save a screenshot of the full page as visual evidence.
  const screenshot_path = path.join(SCREENSHOTS_DIR, "password_check.png");
  await page.screenshot({ path: screenshot_path, fullPage: false });
});

test("for-loop-sum example renders and screenshot saved", async ({ page }) => {
  ensure_screenshots_dir();
  await clear_autosave(page);
  await page.goto("/");

  // Load "For loop sum" (EXAMPLES[1]) from the toolbar Examples group.
  await page.getByRole("button", { name: "Load example: For loop sum" }).click();

  // Wait for flow nodes to appear.
  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });
  expect(await nodes.count()).toBeGreaterThanOrEqual(1);

  // The empty-state panel must be hidden.
  await expect(page.locator(".empty-state-panel")).not.toBeVisible({ timeout: 3000 });

  // Move pointer to neutral corner so no node shows a hover-highlight ring.
  await page.mouse.move(0, 0);

  // Save a screenshot of the full page as visual evidence.
  const screenshot_path = path.join(SCREENSHOTS_DIR, "for_loop_sum.png");
  await page.screenshot({ path: screenshot_path, fullPage: false });
});

test("all four EXAMPLES load and render flow nodes", async ({ page }) => {
  // Verify all four examples from src/templates.ts render nodes when loaded.
  // This catches a broken template (empty source or parse error on load).
  const example_titles = ["Password check", "For loop sum", "While loop", "If / else"];

  for (const title of example_titles) {
    await clear_autosave(page);
    await page.goto("/");

    await page.getByRole("button", { name: `Load example: ${title}` }).click();

    const nodes = page.locator("g.flow-node");
    await expect(nodes.first()).toBeVisible({ timeout: 5000 });
    expect(await nodes.count()).toBeGreaterThanOrEqual(2);
  }
});
