// toolbar_icons.spec.ts - verify Font Awesome ribbon toolbar icons load correctly.
//
// Checks:
//   1. Each icon element renders with nonzero offsetWidth.
//   2. Computed font-family on one icon resolves to Font Awesome 6 Free.
//   3. The vendor woff2 font file is served with HTTP 200.
//   4. Pixel paint check: the rendered icon glyph differs from the browser's
//      tofu fallback box. A corrupt @font-face src leaves offsetWidth, computed
//      font-family, and document.fonts.check() reporting success while every
//      icon paints as an empty box. Only a pixel comparison catches that.
//
// Run:
//   bash build_github_pages.sh
//   npx playwright test tests/playwright/toolbar_icons.spec.ts

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// Font Awesome class names for toolbar icons present in the current app.
const ICON_CLASSES = [
  "fa-floppy-disk",
  "fa-folder-open",
  "fa-trash-can",
  "fa-file-arrow-down",
  "fa-file-arrow-up",
  "fa-vector-square",
  "fa-image",
  "fa-print",
];

test("FA icons render with nonzero width", async ({ page }) => {
  await page.goto("/");

  for (const icon_class of ICON_CLASSES) {
    const icon = page.locator(`.fa-solid.${icon_class}`).first();
    await expect(icon).toBeVisible();
    // offsetWidth must be nonzero for the icon glyph to actually render.
    const width = await icon.evaluate((el: Element) => (el as HTMLElement).offsetWidth);
    expect(width, `icon ${icon_class} has zero width`).toBeGreaterThan(0);
  }
});

test("FA icon font-family resolves to Font Awesome 6 Free", async ({ page }) => {
  await page.goto("/");

  // Use fa-floppy-disk as the representative icon for font-family check.
  const icon = page.locator(".fa-solid.fa-floppy-disk").first();
  await expect(icon).toBeVisible({ timeout: 10_000 });
  const font_family = await icon.evaluate((el: Element) => window.getComputedStyle(el).fontFamily);
  expect(font_family).toContain("Font Awesome 6 Free");
});

test("vendor woff2 font file returns HTTP 200", async ({ page, baseURL }) => {
  // Make a direct GET request to confirm the file is served correctly.
  const woff2_url = `${baseURL}/vendor/fontawesome/fa-solid-900.woff2`;
  const response = await page.request.get(woff2_url);
  expect(response.status()).toBe(200);
});

// Decode a PNG screenshot in-page and report the fraction of "ink" pixels in
// its central region. "Ink" = not transparent and not near-white.
// A real Font Awesome glyph inks the center of its box. The browser notdef
// "tofu" fallback is a hollow rectangle with an empty center.
const TOFU_INK_THRESHOLD = 0.05;

async function center_ink_ratio(page: Page, png: Buffer): Promise<number> {
  const ratio = await page.evaluate(async (png_bytes: number[]) => {
    const blob = new Blob([new Uint8Array(png_bytes)], { type: "image/png" });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (ctx === null || canvas.width === 0 || canvas.height === 0) {
      return 0;
    }
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    // Central 30% box avoids the hollow tofu perimeter.
    const x0 = Math.floor(canvas.width * 0.35);
    const x1 = Math.ceil(canvas.width * 0.65);
    const y0 = Math.floor(canvas.height * 0.35);
    const y1 = Math.ceil(canvas.height * 0.65);
    let inked = 0;
    let total = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * canvas.width + x) * 4;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const a = data[i + 3] ?? 0;
        total += 1;
        const is_white = r > 240 && g > 240 && b > 240;
        if (a > 32 && !is_white) {
          inked += 1;
        }
      }
    }
    return total === 0 ? 0 : inked / total;
  }, Array.from(png));
  return ratio;
}

// Pixel-ink test: the only assertion that actually catches a corrupt @font-face
// src. DOM metrics and document.fonts.check() all report success even when every
// glyph paints as an empty box. Working glyph inks ~0.52; tofu box inks 0.0.
test("FA icon paints a filled glyph, not a hollow tofu box", async ({ page }) => {
  await page.goto("/");

  const icon = page.locator(".fa-solid.fa-floppy-disk").first();
  await expect(icon).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);

  // Enlarge the icon so the hollow-center signal is unambiguous at the pixel level.
  await icon.evaluate((el: Element) => {
    const style = (el as HTMLElement).style;
    style.setProperty("font-size", "64px", "important");
    style.setProperty("width", "auto", "important");
    style.setProperty("line-height", "1", "important");
  });
  await page.evaluate(() => document.fonts.ready);

  const icon_png = await icon.screenshot();
  const center_ink = await center_ink_ratio(page, icon_png);

  expect(
    center_ink,
    "icon center is empty -- Font Awesome glyph did not paint (tofu box)",
  ).toBeGreaterThan(TOFU_INK_THRESHOLD);
});
