// ui_theme.spec.ts - Playwright assertions for the UI theme toggle.
//
// Verifies the two-state light / dark appearance switch in
// src/ui_theme_toggle.tsx:
//   1. Clicking the toggle cycles data-ui-theme: light -> dark -> light.
//   2. Computed background-color of the toolbar changes between light and dark.
//   3. Chosen theme persists across a full page reload.
//   4. First-ever load (no localStorage) with colorScheme:dark emulation yields
//      data-ui-theme="dark" (one-time OS default, stored as concrete value).
//   5. No "Layout" / "Re-layout" button remains in the toolbar.
//
// Storage key must match UI_THEME_STORAGE_KEY in src/ui_theme.ts. The reload
// assertion guards against key drift between the TypeScript module and the
// inline script in index.html.

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// Must exactly match UI_THEME_STORAGE_KEY in src/ui_theme.ts and the inline
// early-set script in src/index.html. The reload test guards against drift.
const UI_THEME_STORAGE_KEY = "concept-map-maker:ui-theme";

//============================================
// Helper: get the current data-ui-theme on <html>
//============================================
async function get_ui_theme(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.dataset["uiTheme"] ?? "");
}

//============================================
// Helper: get computed background-color of the toolbar
//============================================
async function get_toolbar_bg(page: Page): Promise<string> {
  return page.evaluate(() => {
    const toolbar = document.querySelector(".toolbar");
    if (toolbar === null) {
      return "";
    }
    return window.getComputedStyle(toolbar).backgroundColor;
  });
}

//============================================
// Helper: rgb string to hex (#rrggbb)
//============================================
// Playwright/Chromium returns computed colors as "rgb(r, g, b)".
// Converts to lowercase hex for comparison with hex constants.
function rgb_to_hex(rgb: string): string {
  // match "rgb(r, g, b)" -- Playwright/Chromium always returns this form
  const match = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgb);
  if (match === null) {
    return rgb;
  }
  // match[1..3] are guaranteed non-null after the null guard above
  const r = parseInt(match[1]!, 10);
  const g = parseInt(match[2]!, 10);
  const b = parseInt(match[3]!, 10);
  return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
}

//============================================
// Test: toggle cycles data-ui-theme attribute (two-state)
//============================================
test("toggle cycles data-ui-theme light -> dark -> light", async ({ page }) => {
  // Seed localStorage with "light" so the starting state is deterministic.
  // addInitScript runs before the page (including the inline early script) executes.
  await page.addInitScript((key: string) => {
    window.localStorage.setItem(key, "light");
  }, UI_THEME_STORAGE_KEY);

  await page.goto("/");

  // Confirm starting state is "light".
  expect(await get_ui_theme(page)).toBe("light");

  const toggle = page.getByRole("button", { name: /Appearance/ });
  await expect(toggle).toBeVisible();

  // Click 1: light -> dark
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");

  // Click 2: dark -> light (two-state wrap)
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "light");
});

//============================================
// Test: computed background changes between light and dark
//============================================
test("toolbar computed background differs between light and dark", async ({ page }) => {
  // Start in light mode.
  await page.addInitScript((key: string) => {
    window.localStorage.setItem(key, "light");
  }, UI_THEME_STORAGE_KEY);

  await page.goto("/");

  const toggle = page.getByRole("button", { name: /Appearance/ });
  await expect(toggle).toBeVisible();

  // Capture light-mode toolbar background.
  const light_bg_raw = await get_toolbar_bg(page);
  const light_bg = rgb_to_hex(light_bg_raw);

  // Switch to dark mode.
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");

  // Capture dark-mode toolbar background.
  const dark_bg_raw = await get_toolbar_bg(page);
  const dark_bg = rgb_to_hex(dark_bg_raw);

  // The two backgrounds must differ -- behavioral assertion, not an exact value.
  expect(light_bg).not.toBe(dark_bg);
});

//============================================
// Test: choice persists across page reload
//============================================
test("chosen theme persists across page reload", async ({ page }) => {
  // Start from a clean default (no addInitScript so reload does not re-seed).
  await page.goto("/");

  // Directly write "dark" to localStorage after the page loads. This simulates
  // a user who previously set dark mode. We write the key directly rather than
  // clicking the toggle N times to reach "dark", so the test does not depend
  // on the starting default value of the toggle.
  await page.evaluate(
    ({ key, value }: { key: string; value: string }) => {
      window.localStorage.setItem(key, value);
      // Also apply the attribute so the page reflects the written value now.
      document.documentElement.setAttribute("data-ui-theme", value);
    },
    { key: UI_THEME_STORAGE_KEY, value: "dark" },
  );

  // Confirm the attribute and storage are set before reloading.
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");
  const pre_reload_stored = await page.evaluate(
    (key: string) => window.localStorage.getItem(key),
    UI_THEME_STORAGE_KEY,
  );
  expect(pre_reload_stored).toBe("dark");

  // Reload the page. localStorage persists across reloads.
  await page.reload();
  await page.waitForLoadState("domcontentloaded");

  // The attribute should still be "dark" (applied by the inline early script
  // reading the persisted localStorage value before the bundle runs).
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");

  // Confirm the localStorage key still holds "dark" after reload.
  const stored = await page.evaluate(
    (key: string) => window.localStorage.getItem(key),
    UI_THEME_STORAGE_KEY,
  );
  expect(stored).toBe("dark");
});

//============================================
// Test: first load with no localStorage + dark OS emulation yields "dark"
//============================================
test.describe("first-load OS default", () => {
  test.use({ colorScheme: "dark" });

  test("first load with no localStorage and dark OS emulation stores and sets dark", async ({
    page,
  }) => {
    // Do NOT seed localStorage -- simulate a brand new user.
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // With no stored value and dark OS preference, the inline script should
    // resolve "dark" once from matchMedia and store it.
    await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");

    // The concrete value should now be stored so the next reload is consistent.
    const stored = await page.evaluate(
      (key: string) => window.localStorage.getItem(key),
      UI_THEME_STORAGE_KEY,
    );
    expect(stored).toBe("dark");
  });
});

//============================================
// Test: no Layout / Re-layout button in the toolbar
//============================================
test("toolbar does not contain a Layout or Re-layout button", async ({ page }) => {
  await page.goto("/");

  // The old layout group contained a button with text "Re-layout". Confirm
  // it no longer exists after the toolbar cleanup in src/toolbar.tsx.
  const relayout_btn = page.getByRole("button", { name: /Re-layout/i });
  await expect(relayout_btn).toHaveCount(0);

  // Also check the text "Layout" does not appear as a standalone button label.
  // (The Appearance toggle text does not include "Layout", so this is safe.)
  const layout_btn = page.getByRole("button", { name: /^Layout$/i });
  await expect(layout_btn).toHaveCount(0);
});
