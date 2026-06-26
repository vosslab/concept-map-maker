// print.spec.ts - smoke test that the Print button calls window.print.
//
// Stubs window.print via page.addInitScript so the stub is in place before any
// app code runs. The stub records how many times print was called. After clicking
// the "Print" button, we assert the stub was called exactly once.
//
// This is a smoke test: it does not verify the print stylesheet or the printed
// content; it verifies that the toolbar Print button invokes window.print
// without throwing.

import { test, expect } from "@playwright/test";

test("Print button calls window.print once", async ({ page }) => {
  // Stub window.print BEFORE the app initializes.
  await page.addInitScript(() => {
    let call_count = 0;
    window.print = (): void => {
      call_count += 1;
    };
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

  // Click the Print button (aria-label from toolbar.tsx: "Print flowchart").
  await page.getByRole("button", { name: "Print flowchart" }).click();
  await page.waitForTimeout(100);

  // The stub should have been called exactly once.
  const after_count = await page.evaluate(() => {
    return (window as unknown as { __print_call_count__: number }).__print_call_count__;
  });
  expect(after_count).toBe(1);
});
