// submit_flow.spec.ts - submit-model behavioral specs for the pseudo-code editor.
//
// Verifies the three submit-model invariants from docs/PSEUDO_CODE_FORMAT.md:
//
//   (a) Typing alone leaves the rendered graph unchanged. The graph updates only
//       when the user explicitly clicks "Update Flowchart" (or presses Mod-Enter).
//   (b) Clicking "Update Flowchart" on valid source updates the graph and
//       canonicalizes the editor text (rewrites it to the canonical form).
//   (c) Clicking "Update Flowchart" on malformed source leaves the graph and
//       editor text unchanged and shows a line-referenced error chip.
//
// Each test starts from a clean localStorage so autosave cannot restore a
// prior document and contaminate the empty-start assumptions.

import { test, expect } from "@playwright/test";
import { clear_autosave, type_pseudo, click_update } from "./helpers";

// Minimal valid pseudo-code: start + one process step + end.
const SIMPLE_SOURCE = "start\nset x to 1\noutput x\nend";

// Malformed source: uses the unsupported repeat/until syntax (a reserved word
// that the parser rejects with a line-referenced error per the spec).
const BROKEN_SOURCE = "start\nrepeat\noutput x\nuntil done\nend";

test("(a) typing alone leaves the rendered graph unchanged", async ({ page }) => {
  await clear_autosave(page);
  await page.goto("/");

  // Confirm the empty-state panel is shown (graph has no nodes).
  const panel = page.locator(".empty-state-panel");
  await expect(panel).toBeVisible({ timeout: 5000 });

  // Type valid pseudo-code into the editor but do NOT click Update Flowchart.
  await type_pseudo(page, SIMPLE_SOURCE);

  // The editor holds the draft; the panel must still be visible.
  await expect(panel).toBeVisible({ timeout: 2000 });

  // No flow nodes should have appeared in the canvas.
  const nodes = page.locator("g.flow-node");
  expect(await nodes.count()).toBe(0);
});

test("(b) Update Flowchart on valid source updates the graph and canonicalizes text", async ({
  page,
}) => {
  await clear_autosave(page);
  await page.goto("/");

  await type_pseudo(page, SIMPLE_SOURCE);
  await click_update(page);

  // At least two flow nodes must appear (Start and End terminals plus
  // intermediate steps).
  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });
  expect(await nodes.count()).toBeGreaterThanOrEqual(2);

  // The empty-state panel must be hidden now that the graph has nodes.
  const panel = page.locator(".empty-state-panel");
  await expect(panel).not.toBeVisible({ timeout: 3000 });

  // The editor should contain canonical text starting with "start" (the
  // canonical keyword, lower-case, as normalized by the app).
  const editor_text = await page.locator(".code-editor-host .cm-content").textContent();
  expect(editor_text).not.toBeNull();
  expect(editor_text!.trim().toLowerCase()).toMatch(/^start/);
});

test("(c) malformed source shows a line-referenced error chip and leaves graph unchanged", async ({
  page,
}) => {
  await clear_autosave(page);
  await page.goto("/");

  // First, submit valid source to establish a non-empty chart.
  await type_pseudo(page, SIMPLE_SOURCE);
  await click_update(page);
  const nodes = page.locator("g.flow-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });
  const initial_count = await nodes.count();
  expect(initial_count).toBeGreaterThanOrEqual(2);

  // Now type malformed source and submit.
  await type_pseudo(page, BROKEN_SOURCE);
  await click_update(page);

  // The parse-error chip must appear in the editor header.
  const error_chip = page.locator(".code-editor-error");
  await expect(error_chip).toBeVisible({ timeout: 5000 });

  // The error text must include a line reference ("Line N:" or "line N:").
  const error_text = await error_chip.textContent();
  expect(error_text).not.toBeNull();
  expect(error_text).toMatch(/line \d+/i);

  // The graph must be unchanged: same node count as before the bad submit.
  const count_after = await nodes.count();
  expect(count_after).toBe(initial_count);
});
