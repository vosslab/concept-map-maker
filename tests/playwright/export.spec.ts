/// <reference types="node" />
// export.spec.ts - SVG and PNG export coverage for the pseudo-code flowchart editor.
//
// Verifies:
//   1. "Export SVG" triggers a download with valid SVG XML.
//   2. The exported SVG contains non-rectangular SVG geometry (<ellipse> for
//      terminal nodes), confirming the 8-shape renderer survives serialization.
//   3. The exported SVG contains True/False branch-label text, confirming
//      decision-node edges survive SVG export.
//   4. "Export PNG" triggers a download with non-empty PNG binary data.
//
// Tests 2 and 3 guard against regressions where all nodes collapse to <rect>
// elements or branch labels are stripped during SVG serialization.

import { test, expect } from "@playwright/test";
import { clear_autosave, type_pseudo, click_update } from "./helpers";

// Shared helper: load the password-check example (has terminal + io + decision
// shapes and True/False branch labels) and wait for nodes to appear.
async function load_password_check(page: import("@playwright/test").Page): Promise<void> {
  await clear_autosave(page);
  await page.goto("/");
  const first_btn = page.locator(".empty-state-template-btn").first();
  await expect(first_btn).toBeVisible({ timeout: 5000 });
  await first_btn.click();
  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });
  // Wait for the export button to become enabled (svg_el is set after mount).
  await expect(page.getByRole("button", { name: "Export flowchart as SVG" })).toBeEnabled({
    timeout: 5000,
  });
}

// Shared helper: download SVG and return its text content.
async function download_svg_content(page: import("@playwright/test").Page): Promise<string> {
  const download_promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export flowchart as SVG" }).click();
  const download = await download_promise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return Buffer.concat(chunks).toString("utf8");
}

test("Export SVG button downloads well-formed SVG", async ({ page }) => {
  await load_password_check(page);
  const content = await download_svg_content(page);

  // Must be non-empty and parse as valid SVG/XML.
  expect(content.length).toBeGreaterThan(50);
  expect(content).toContain("<svg");
  expect(content).toContain("</svg>");
  expect(content.toLowerCase()).toContain("xmlns");
});

test("exported SVG contains non-rectangular geometry (ellipse for terminal nodes)", async ({
  page,
}) => {
  await load_password_check(page);
  const content = await download_svg_content(page);

  // Terminal (Start/End) nodes render as <ellipse> elements. A renderer that
  // falls back to all-rect would omit this element entirely.
  expect(content).toContain("<ellipse");
});

test("exported SVG contains True/False branch labels", async ({ page }) => {
  await load_password_check(page);
  const content = await download_svg_content(page);

  // The password-check if/else decision emits True and False edge labels.
  // These must survive the SVG serialization and appear in the exported file.
  expect(content).toContain("True");
  expect(content).toContain("False");
});

test("exported SVG preserves dashed comment edges (stroke-dasharray present)", async ({ page }) => {
  // Load a source that contains a full-line comment so a comment node and its
  // dashed edge are rendered, then verify the SVG export includes stroke-dasharray.
  await clear_autosave(page);
  await page.goto("/");
  // Type source with a full-line comment using the CodeMirror editor helper.
  await type_pseudo(page, "start\n# note\noutput result\nend\n");
  await click_update(page);
  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("button", { name: "Export flowchart as SVG" })).toBeEnabled({
    timeout: 5000,
  });
  const content = await download_svg_content(page);
  // Comment edges render dashed; stroke-dasharray must survive SVG export.
  expect(content).toContain("stroke-dasharray");
});

test("Export PNG button downloads non-empty PNG", async ({ page }) => {
  await load_password_check(page);

  const download_promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export flowchart as PNG" }).click();
  const download = await download_promise;

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  const buffer = Buffer.concat(chunks);

  // A minimal real PNG is orders of magnitude larger than this lower bound.
  expect(buffer.length).toBeGreaterThan(100);

  // Verify PNG magic bytes at the start of the file.
  expect(buffer[0]).toBe(0x89);
  expect(buffer[1]).toBe(0x50); // 'P'
  expect(buffer[2]).toBe(0x4e); // 'N'
  expect(buffer[3]).toBe(0x47); // 'G'
});
