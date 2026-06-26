/// <reference types="node" />
// paste.spec.ts - verifies that pasting a multi-row TSV into the triples table
// bulk-inserts rows and produces the expected number of concept bubbles in the SVG.
//
// Scope: focus the triples-rows container, dispatch a synthetic paste event
// carrying the 30-row TSV built from the honeybees fixture, then assert:
//   - at least 30 concept-node groups appear in the SVG
//   - the "Unique concepts" count text reflects the inserted data
//
// The paste is dispatched via page.evaluate so the clipboard DataTransfer is
// constructed inside the browser context, which is the most reliable way to
// supply arbitrary text to a ClipboardEvent without requiring real clipboard
// permissions.

import { test, expect } from "@playwright/test";
import { paste_tsv } from "./helpers";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Resolve __dirname equivalent for ESM modules (tsconfig uses "module": "esnext").
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the honeybees TSV fixture. The file has a header row that the triples
// table's looks_like_header heuristic will skip, and 8 data rows. To reach
// >= 30 bubbles, we replicate the data section into a larger TSV.
function build_30_row_tsv(): string {
  // Read the fixture file. Use __dirname equivalent via import.meta resolution.
  // The fixture lives at tests/fixtures/honeybees_triples.tsv.
  const fixture_path = join(__dirname, "..", "fixtures", "honeybees_triples.tsv");
  const raw = readFileSync(fixture_path, "utf8");
  const lines = raw.trim().split("\n");
  // line 0 is the header row; lines 1+ are data rows
  const header = lines[0];
  const data_lines = lines.slice(1);

  // Build rows by cycling through the data with unique concept labels so each
  // row produces a distinct concept (avoiding deduplication collisions).
  // We need >= 30 unique concepts (normalized duplicates count once).
  const rows: string[] = [header ?? ""];
  let counter = 0;
  while (rows.length - 1 < 35) {
    for (const line of data_lines) {
      if (rows.length - 1 >= 35) {
        break;
      }
      counter += 1;
      // Append a numeric suffix to the first column to keep concepts unique.
      const parts = line.split("\t");
      const from_cell = (parts[0] ?? "A") + String(counter);
      const verb_cell = parts[1] ?? "links";
      const to_cell = (parts[2] ?? "B") + String(counter + 100);
      rows.push(`${from_cell}\t${verb_cell}\t${to_cell}`);
    }
  }
  return rows.join("\n");
}

test("paste 30-row TSV creates >= 30 bubbles", async ({ page }) => {
  await page.goto("/");

  const tsv = build_30_row_tsv();
  await paste_tsv(page, tsv);

  // Wait for SolidJS to render the concept nodes into the SVG.
  const nodes = page.locator("g.concept-node");
  await expect(nodes.first()).toBeVisible({ timeout: 5000 });

  // Pasting 35 rows with unique concepts should produce at least 30 bubbles.
  const bubble_count = await nodes.count();
  expect(bubble_count).toBeGreaterThanOrEqual(30);

  // The concept count text in the triples meta area should show a large number.
  const meta_text = await page.locator(".triples-meta").textContent();
  // Extract the number from "Unique concepts: N"
  const match = meta_text?.match(/(\d+)/);
  expect(match).not.toBeNull();
  const concept_count = parseInt(match?.[1] ?? "0", 10);
  expect(concept_count).toBeGreaterThanOrEqual(30);
});
