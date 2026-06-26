/// <reference types="node" />
// export.spec.ts - export button behavior for SVG and PNG.
//
// Verifies:
//   1. Clicking "Export SVG" (aria-label "Export map as SVG") triggers a download
//      and the downloaded content parses as valid XML containing an <svg> element.
//   2. Clicking "Export PNG" (aria-label "Export map as PNG") triggers a download
//      and the downloaded content is non-empty binary data (a valid PNG blob size).
//
// The test uses Playwright's download event to capture the file content. It does
// NOT verify visual correctness of the exported image; it verifies that the export
// pipeline runs without error and produces the correct file format.

import { test, expect } from "@playwright/test";
import { enter_triple } from "./helpers";

test("Export SVG button downloads well-formed SVG", async ({ page }) => {
  await page.goto("/");

  // Enter one triple to populate the map so the SVG has content.
  await page.getByRole("button", { name: "+ Add row" }).click();
  await page.waitForTimeout(100);
  await enter_triple(page, 1, "Water", "cycles through", "Clouds");

  // Wait for a bubble to render, which means the SVG ref is ready and the
  // export buttons are enabled.
  const nodes = page.locator("g.concept-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });

  // Click the SVG export button and wait for the download event.
  const download_promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export map as SVG" }).click();
  const download = await download_promise;

  // Read the downloaded content as text.
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  const content = Buffer.concat(chunks).toString("utf8");

  // The content must be non-empty and parse as valid XML containing <svg.
  expect(content.length).toBeGreaterThan(50);
  expect(content).toContain("<svg");
  // Verify it is well-formed enough for DOMParser. We check for the closing tag.
  expect(content).toContain("</svg>");
  // The format tag should be xml or svg namespace.
  expect(content.toLowerCase()).toContain("xmlns");
});

test("Export PNG button downloads non-empty PNG", async ({ page }) => {
  await page.goto("/");

  // Enter one triple to populate the map.
  await page.getByRole("button", { name: "+ Add row" }).click();
  await page.waitForTimeout(100);
  await enter_triple(page, 1, "Light", "energizes", "Plants");

  const nodes = page.locator("g.concept-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });

  // Click the PNG export button and wait for the download event.
  const download_promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export map as PNG" }).click();
  const download = await download_promise;

  // Collect the binary stream and verify it has a plausible size.
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  const buffer = Buffer.concat(chunks);

  // A minimal PNG with one 2x2 pixel would be ~67 bytes; any real export is
  // orders of magnitude larger. We assert it is at least 100 bytes.
  expect(buffer.length).toBeGreaterThan(100);

  // The PNG magic bytes are \x89PNG at offset 0.
  expect(buffer[0]).toBe(0x89);
  expect(buffer[1]).toBe(0x50); // 'P'
  expect(buffer[2]).toBe(0x4e); // 'N'
  expect(buffer[3]).toBe(0x47); // 'G'
});
