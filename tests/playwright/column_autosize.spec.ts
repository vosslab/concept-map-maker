// column_autosize.spec.ts - acceptance tests for commit-time column autosize.
//
// Commit-time column autosize: the three text columns (from, verb, to) size to
// the widest COMMITTED value in that column, clamped between a 6em floor and a
// 45% pane cap. Recompute fires only on commit, never on a draft keystroke.
//
// Test A: committing a long verb phrase widens the verb column; the from/to
//   columns stay at or above their 6em floor (never truncate below it).
// Test B: typing into a cell WITHOUT committing does not change column widths.

import { test, expect } from "@playwright/test";

// Resolve the computed grid track widths (in px) of the triples header. The
// header and body rows share the same grid template, so the header is a stable
// proxy for the body column widths. Track order:
//   from | arrow | verb | arrow | to | delete | chain
async function track_widths(page: import("@playwright/test").Page): Promise<number[]> {
  const template = await page.locator(".triples-header").evaluate((el) => {
    return window.getComputedStyle(el).gridTemplateColumns;
  });
  // gridTemplateColumns resolves the minmax() tracks to pixel values like
  // "66px 11px 240px 11px 66px 12px 12px 208px". Parse each px number in order;
  // a NaN (unexpected token) becomes 0 so callers always get a number.
  const widths = template.split(/\s+/).map((token) => {
    const n = parseFloat(token);
    return Number.isNaN(n) ? 0 : n;
  });
  return widths;
}

// Safe indexed read: the parsed track list always has at least the 8 expected
// tracks, but the strict test config forbids unchecked indexing, so default to 0.
function track(widths: number[], index: number): number {
  return widths[index] ?? 0;
}

test("committing a long verb phrase widens the verb column, from/to keep their floor", async ({
  page,
}) => {
  await page.goto("/");

  // Start with one row.
  await page.getByRole("button", { name: "+ Add row" }).click();

  // Capture baseline track widths before any long text is committed.
  const before = await track_widths(page);
  // Track 2 (index 2) is the verb column; tracks 0 and 4 are from and to.
  const verb_before = track(before, 2);

  // The from/to floor is the 6em clamp minimum, in px of the grid container's
  // font. Compute it from the live computed font-size so the assertion tracks
  // the stylesheet instead of hardcoding pixels.
  const floor_px = await page.locator(".triples-header").evaluate((el) => {
    return parseFloat(window.getComputedStyle(el).fontSize) * 6;
  });

  // Type a long verb phrase and COMMIT it (blur via Tab so the commit fires).
  const verb1 = page.getByLabel("Row 1 verb phrase");
  await verb1.click();
  await verb1.pressSequentially("is a longer member of the group");
  await verb1.press("Tab");
  // Commit sets --col-verb and the grid animates over 150ms; poll until the
  // verb track has grown past its baseline (transition settled).
  await expect
    .poll(async () => track(await track_widths(page), 2), { timeout: 5000 })
    .toBeGreaterThan(verb_before);

  const after = await track_widths(page);
  const from_after = track(after, 0);
  const to_after = track(after, 4);

  // Widening the verb column redistributes 1fr leftover, so from/to may shrink
  // from their inflated baseline - but never below the 6em clamp floor.
  // Compare whole pixels to tolerate sub-pixel track rounding.
  expect(Math.floor(from_after)).toBeGreaterThanOrEqual(Math.floor(floor_px));
  expect(Math.floor(to_after)).toBeGreaterThanOrEqual(Math.floor(floor_px));
});

test("typing without committing does not change column widths", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "+ Add row" }).click();

  // Capture column widths before typing.
  const before = await track_widths(page);

  // Type a long value into the verb cell but DO NOT commit (no Tab/Enter/blur).
  const verb1 = page.getByLabel("Row 1 verb phrase");
  await verb1.click();
  await verb1.pressSequentially("this draft text is intentionally very long");
  // No commit happened, so there is no DOM signal to await; allow one full
  // transition window (150ms) to elapse before asserting nothing moved.
  await page.waitForTimeout(300);

  const after = await track_widths(page);

  // Draft keystrokes never resize columns: the text tracks are unchanged.
  expect(track(after, 2)).toBeCloseTo(track(before, 2), 0);
  expect(track(after, 0)).toBeCloseTo(track(before, 0), 0);
  expect(track(after, 4)).toBeCloseTo(track(before, 4), 0);
});
