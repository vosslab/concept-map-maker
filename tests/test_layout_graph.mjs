// Unit tests for the dagre layout adapter (src/layout_graph.ts).
// Run: node --import tsx --test tests/test_layout_graph.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compute_layout } from "../src/layout_graph.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "fixtures");

function read_triples(name) {
  const text = fs.readFileSync(path.join(fixtures, name), "utf8");
  const doc = JSON.parse(text);
  return doc.triples;
}

//============================================
// determinism
//============================================

test("identical triples produce identical coordinates", () => {
  const triples = read_triples("honeybees_document.json");
  const first = compute_layout(triples);
  const second = compute_layout(triples);
  assert.equal(first.width, second.width);
  assert.equal(first.height, second.height);
  assert.equal(first.nodes.size, second.nodes.size);
  // every node lands at the exact same place on a second run
  for (const [key, node] of first.nodes) {
    const other = second.nodes.get(key);
    assert.ok(other, `key ${key} missing on second run`);
    assert.equal(other.x, node.x);
    assert.equal(other.y, node.y);
    assert.equal(other.w, node.w);
    assert.equal(other.h, node.h);
  }
});

//============================================
// honeybees fixture structure
//============================================

test("honeybees converging concept (Female) lays out once", () => {
  const triples = read_triples("honeybees_document.json");
  const layout = compute_layout(triples);
  const female = layout.nodes.get("female");
  assert.ok(female, "Female should be present exactly once");
  // display casing comes from first sighting in the triples
  assert.equal(female.label, "Female");
});

test("top-down layout puts an origin above its descendants", () => {
  const triples = read_triples("honeybees_document.json");
  const layout = compute_layout(triples);
  const honeybees = layout.nodes.get("honeybees");
  const castes = layout.nodes.get("castes");
  const female = layout.nodes.get("female");
  assert.ok(honeybees && castes && female);
  // rankdir TB: y increases downward from the origin
  assert.ok(honeybees.y < castes.y, "Honeybees should sit above Castes");
  assert.ok(castes.y < female.y, "Castes should sit above Female");
});

test("every laid-out node has finite center and positive size", () => {
  const triples = read_triples("honeybees_document.json");
  const layout = compute_layout(triples);
  for (const [key, node] of layout.nodes) {
    assert.ok(Number.isFinite(node.x), `${key} x not finite`);
    assert.ok(Number.isFinite(node.y), `${key} y not finite`);
    assert.ok(node.w > 0, `${key} width not positive`);
    assert.ok(node.h > 0, `${key} height not positive`);
  }
  assert.ok(layout.width > 0);
  assert.ok(layout.height > 0);
});

//============================================
// node sizing from label length
//============================================

test("longer labels get wider nodes", () => {
  const triples = [
    { id: "a", from: "Ox", verb: "leads to", to: "End" },
    {
      id: "b",
      from: "A very long concept label that should be wide",
      verb: "relates to",
      to: "End",
    },
  ];
  const layout = compute_layout(triples);
  const short = layout.nodes.get("ox");
  const long = layout.nodes.get("a very long concept label that should be wide");
  assert.ok(short && long);
  assert.ok(long.w > short.w, "longer label should produce wider node");
});

//============================================
// cycles do not crash (acyclicer greedy)
//============================================

test("stress fixture with a cycle lays out without throwing", () => {
  const triples = read_triples("stress_80_nodes.json");
  const layout = compute_layout(triples);
  for (const [key, node] of layout.nodes) {
    assert.ok(Number.isFinite(node.x), `${key} x not finite`);
    assert.ok(Number.isFinite(node.y), `${key} y not finite`);
  }
});

test("a tight three-node cycle does not throw and lays out all nodes", () => {
  const triples = [
    { id: "1", from: "Alpha", verb: "feeds", to: "Beta" },
    { id: "2", from: "Beta", verb: "feeds", to: "Gamma" },
    { id: "3", from: "Gamma", verb: "feeds", to: "Alpha" },
  ];
  const layout = compute_layout(triples);
  assert.equal(layout.nodes.size, 3);
  assert.ok(layout.nodes.get("alpha"));
  assert.ok(layout.nodes.get("beta"));
  assert.ok(layout.nodes.get("gamma"));
});

//============================================
// row completeness and normalization
//============================================

test("blank and partial rows are excluded from the layout", () => {
  const triples = [
    { id: "1", from: "Real", verb: "links", to: "Target" },
    { id: "2", from: "", verb: "", to: "" },
    { id: "3", from: "Lonely", verb: "", to: "" },
    { id: "4", from: "Half", verb: "links", to: "" },
  ];
  const layout = compute_layout(triples);
  // only Real and Target come from the one complete row
  assert.equal(layout.nodes.size, 2);
  assert.ok(layout.nodes.get("real"));
  assert.ok(layout.nodes.get("target"));
});

//============================================
// edge label sizing widens layout
//============================================

test("long multi-word verb widens overall layout vs single-char verb", () => {
  // A single-char verb produces a tiny edge label; dagre reserves very little
  // space. A long multi-word verb wraps and its label_box width is larger, so
  // dagre must push sibling nodes further apart to fit the label.
  // Exact pixel widths depend on dagre internals and label constants, so we
  // avoid comparing against a hardcoded number. Instead we assert the invariant
  // the feature protects: the long-verb layout must be strictly wider by a
  // meaningful margin (at least 10 units), not merely by floating-point noise.
  const triples_short = [
    { id: "1", from: "Alpha", verb: "x", to: "Beta" },
    { id: "2", from: "Alpha", verb: "x", to: "Gamma" },
  ];
  const triples_long = [
    { id: "1", from: "Alpha", verb: "has a very long relationship with", to: "Beta" },
    { id: "2", from: "Alpha", verb: "has a very long relationship with", to: "Gamma" },
  ];
  const layout_short = compute_layout(triples_short);
  const layout_long = compute_layout(triples_long);
  const margin = 10;
  assert.ok(
    layout_long.width >= layout_short.width + margin,
    `long-verb layout width (${layout_long.width}) should exceed short-verb (${layout_short.width}) by at least ${margin} units`,
  );
});

//============================================
// multi-word concept keys in edges (B1 regression)
//============================================

test("multi-word concept key in edge is registered and ranked by dagre", () => {
  // Guards that edges between multi-word concept keys are registered with dagre
  // and cause dagre to apply top-down (TB) ranking to their endpoints.
  //
  // The B1 regression: edge identity was derived by string-splitting on a
  // delimiter that could occur inside a multi-word key (e.g. splitting
  // "new york leads to big apple" on the first space produced phantom keys
  // "new" and "york leads to big apple"). The phantom keys did not match any
  // node, so dagre never saw the edge, treated all nodes as unranked peers,
  // and the child node's y was not strictly below the parent's.
  //
  // After the fix, from_key and to_key are stored as structured fields on each
  // triple, so edges with multi-word concept keys are always registered and
  // dagre applies the expected top-down ordering. The assertion below (strict
  // y inequality) would fail on the pre-fix code when any concept key contains
  // an internal space.
  const triples = [
    { id: "1", from: "new york", verb: "leads to", to: "big apple" },
    { id: "2", from: "big apple", verb: "leads to", to: "tourism" },
  ];
  const layout = compute_layout(triples);
  // all three multi-word nodes must be present
  assert.equal(layout.nodes.size, 3, "expected 3 nodes");
  const new_york = layout.nodes.get("new york");
  const big_apple = layout.nodes.get("big apple");
  const tourism = layout.nodes.get("tourism");
  assert.ok(new_york, "new york node missing");
  assert.ok(big_apple, "big apple node missing");
  assert.ok(tourism, "tourism node missing");
  // TB layout: y increases downward. If the multi-word edges were dropped, dagre
  // treats all nodes as isolated and may assign them the same y rank, so the
  // strict inequality below would fail on the pre-fix code.
  assert.ok(
    new_york.y < big_apple.y,
    `new york (y=${new_york.y}) should be above big apple (y=${big_apple.y}) -- edge registration required`,
  );
  assert.ok(
    big_apple.y < tourism.y,
    `big apple (y=${big_apple.y}) should be above tourism (y=${tourism.y}) -- edge registration required`,
  );
});

test("concepts differing only in casing or whitespace share one node", () => {
  const triples = [
    { id: "1", from: "Cell", verb: "is", to: "Unit" },
    { id: "2", from: "  cell ", verb: "divides into", to: "Daughter" },
  ];
  const layout = compute_layout(triples);
  // "Cell" and "  cell " normalize to one concept
  assert.equal(layout.nodes.size, 3);
  const cell = layout.nodes.get("cell");
  assert.ok(cell);
  // first-seen casing wins
  assert.equal(cell.label, "Cell");
});
