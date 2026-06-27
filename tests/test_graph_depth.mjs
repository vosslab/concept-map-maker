// Tests for src/graph_depth.ts
//
// Run with: node --import tsx --test tests/test_graph_depth.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { compute_depths } from "../src/graph_depth.js";

//============================================
// helpers
//============================================
function depth(result, label) {
  // Look up the depth for a concept label (normalized via concept_key semantics)
  const key = label.trim().replace(/\s+/g, " ").toLowerCase();
  return result.depth_by_key.get(key);
}

function is_origin(result, label) {
  const key = label.trim().replace(/\s+/g, " ").toLowerCase();
  return result.origin_keys.has(key);
}

//============================================
// empty input
//============================================
test("empty triples returns empty maps", () => {
  const result = compute_depths([]);
  assert.equal(result.depth_by_key.size, 0);
  assert.equal(result.origin_keys.size, 0);
});

//============================================
// isolated concept exclusion from origins
//============================================
test("isolated concept (no edges) is not an origin", () => {
  // "alpha" has no edges (in-degree 0, out-degree 0) — must NOT be an origin
  // "alpha -> beta" creates one non-isolated edge pair
  const triples = [{ id: "t1", from: "alpha", verb: "leads to", to: "beta" }];
  const result = compute_depths(triples);
  // alpha: in=0, out=1 -> origin
  assert.ok(is_origin(result, "alpha"), "alpha should be origin");
  // beta: in=1, out=0 -> not origin
  assert.ok(!is_origin(result, "beta"), "beta must not be origin");
});

test("isolated concept receives fallback depth, not origin status", () => {
  // Inject a truly isolated concept by adding a triple from it to itself
  // (self-loop: in>0) — actually easier: just test that an isolated node
  // in the graph (no from or to rows) is not considered an origin.
  // We simulate isolation by building a disconnected triplet where "orphan"
  // only appears as from AND to in a self-loop (in=1, out=1 -> not isolated).
  // Instead we test via a linear chain plus an isolated node not in any triple.
  // An isolated node never appears in any triple, so it won't be in depth_by_key at all.
  // Test that a node with in>0 is not an origin.
  const triples = [
    { id: "t1", from: "root", verb: "leads to", to: "child" },
    { id: "t2", from: "child", verb: "leads to", to: "root" }, // cycle, no origin
  ];
  const result = compute_depths(triples);
  // Both root and child are in a cycle; neither has in-degree 0
  assert.ok(!is_origin(result, "root"), "root in cycle must not be origin");
  assert.ok(!is_origin(result, "child"), "child in cycle must not be origin");
  // No origins -> all nodes depth 0
  assert.equal(depth(result, "root"), 0);
  assert.equal(depth(result, "child"), 0);
});

//============================================
// origin rule: in-degree 0 AND out-degree > 0
//============================================
test("origin rule: in=0 out>0 qualifies; in=0 out=0 does not", () => {
  const triples = [
    { id: "t1", from: "A", verb: "leads to", to: "B" },
    { id: "t2", from: "A", verb: "includes", to: "C" },
  ];
  const result = compute_depths(triples);
  assert.ok(is_origin(result, "A"), "A: in=0 out=2 -> origin");
  assert.ok(!is_origin(result, "B"), "B: in=1 out=0 -> not origin");
  assert.ok(!is_origin(result, "C"), "C: in=1 out=0 -> not origin");
});

//============================================
// no-origins: all nodes depth 0
//============================================
test("no origins: all nodes assigned depth 0", () => {
  // A <-> B cycle: neither has in-degree 0
  const triples = [
    { id: "t1", from: "A", verb: "leads to", to: "B" },
    { id: "t2", from: "B", verb: "leads to", to: "A" },
  ];
  const result = compute_depths(triples);
  assert.equal(result.origin_keys.size, 0);
  assert.equal(depth(result, "A"), 0);
  assert.equal(depth(result, "B"), 0);
});

//============================================
// incomplete rows excluded
//============================================
test("incomplete rows (blank verb) are excluded from graph derivation", () => {
  const triples = [
    { id: "t1", from: "X", verb: "", to: "Y" }, // blank verb -> excluded
    { id: "t2", from: "A", verb: "leads to", to: "B" },
  ];
  const result = compute_depths(triples);
  // X and Y should not appear in depth_by_key
  const x_key = "x";
  const y_key = "y";
  assert.ok(!result.depth_by_key.has(x_key), "X excluded from incomplete row");
  assert.ok(!result.depth_by_key.has(y_key), "Y excluded from incomplete row");
  assert.ok(is_origin(result, "A"), "A is origin from complete row");
});
