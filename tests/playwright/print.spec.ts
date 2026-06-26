// print.spec.ts - smoke test that the Print button calls window.print.
//
// Stubs window.print via page.addInitScript so the stub is in place before any
// app code runs. The stub records how many times print was called. After clicking
// the "Print" button, we assert the stub was called exactly once.
//
// This is a smoke test: it does not verify the print stylesheet or the printed
// content; it verifies that the toolbar's Print button invokes window.print
// without throwing. Browser print preview cannot be inspected programmatically.

import { test, expect } from "@playwright/test";

test("Print button calls window.print once", async ({ page }) => {
  // Stub window.print BEFORE the app initializes. addInitScript runs on every
  // new document, so it fires before any script in the page.
  await page.addInitScript(() => {
    let call_count = 0;
    // Override print and expose a counter the test can read.
    window.print = (): void => {
      call_count += 1;
    };
    // Expose the count via a property the test can read via evaluate.
    Object.defineProperty(window, "__print_call_count__", {
      get: () => call_count,
    });
  });

  await page.goto("/");

  // Verify the stub is in place and starts at zero.
  const initial_count = await page.evaluate(() => {
    return (window as unknown as { __print_call_count__: number }).__print_call_count__;
  });
  expect(initial_count).toBe(0);

  // Click the Print button (aria-label from toolbar.tsx: "Print concept map").
  await page.getByRole("button", { name: "Print concept map" }).click();
  await page.waitForTimeout(100);

  // The stub should have been called exactly once.
  const after_count = await page.evaluate(() => {
    return (window as unknown as { __print_call_count__: number }).__print_call_count__;
  });
  expect(after_count).toBe(1);
});
