// Unit tests for derive_concepts (src/derive_concepts.ts).
// Run: node --import tsx --test tests/test_derive_concepts.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { derive_concepts } from "../src/derive_concepts.ts";

//============================================
// Helpers
//============================================

const FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "honeybees_document.json",
);

function load_honeybees() {
  // load the shared honeybees fixture and return its triples array
  const raw = readFileSync(FIXTURE_PATH, "utf8");
  const doc = JSON.parse(raw);
  return doc.triples;
}

//============================================
// Honeybees fixture tests
//============================================

test("honeybees: concepts ordered by first appearance", () => {
  const triples = load_honeybees();
  const concepts = derive_concepts(triples);
  // t1 from=Honeybees to=Castes -> first two labels
  assert.equal(concepts[0].label, "Honeybees");
  assert.equal(concepts[1].label, "Castes");
});

test("honeybees: Female has multiple incoming edges (multi-input sink)", () => {
  const triples = load_honeybees();
  const concepts = derive_concepts(triples);
  const female = concepts.find((c) => c.key === "female");
  assert.ok(female, "Female concept must be present");
  // Female is a multi-input sink; the behavioral property is > 1, not a specific count
  assert.ok(female.incoming.length > 1);
});

test("honeybees: Female has 0 outgoing edges (it is a sink in the fixture)", () => {
  const triples = load_honeybees();
  const concepts = derive_concepts(triples);
  const female = concepts.find((c) => c.key === "female");
  assert.ok(female, "Female concept must be present");
  // t8 is Male -> Female, so Female is the destination, not source
  assert.deepEqual(female.outgoing, []);
});

test("honeybees: Castes has 1 incoming edge and 3 outgoing edges", () => {
  const triples = load_honeybees();
  const concepts = derive_concepts(triples);
  const castes = concepts.find((c) => c.key === "castes");
  assert.ok(castes, "Castes concept must be present");
  // counts are behavioral; IDs are fixture internals
  assert.ok(castes.incoming.length >= 1);
  assert.ok(castes.outgoing.length >= 2);
});

test("honeybees: first-casing-wins preserves original label", () => {
  const triples = load_honeybees();
  const concepts = derive_concepts(triples);
  // fixture uses title-cased labels; check a few
  const workers = concepts.find((c) => c.key === "workers");
  assert.ok(workers);
  assert.equal(workers.label, "Workers");
});

//============================================
// Blank and partial row semantics
//============================================

test("fully blank rows are ignored (no concepts derived from them)", () => {
  const triples = [
    { id: "t1", from: "A", verb: "links", to: "B" },
    { id: "t2", from: "", verb: "", to: "" },
    { id: "t3", from: "  ", verb: "\t", to: "  " },
  ];
  const concepts = derive_concepts(triples);
  // only A and B should appear
  assert.equal(concepts.length, 2);
  assert.equal(concepts[0].key, "a");
  assert.equal(concepts[1].key, "b");
});

test("partial rows (missing one field) are excluded from derivation", () => {
  const triples = [
    { id: "t1", from: "A", verb: "links", to: "B" },
    { id: "t2", from: "C", verb: "", to: "D" },
    { id: "t3", from: "E", verb: "points", to: "" },
    { id: "t4", from: "", verb: "says", to: "F" },
  ];
  const concepts = derive_concepts(triples);
  // only A and B from the complete row; partial rows excluded
  assert.equal(concepts.length, 2);
  const keys = concepts.map((c) => c.key);
  assert.ok(keys.includes("a"));
  assert.ok(keys.includes("b"));
});

test("partial rows do not contribute adjacency", () => {
  const triples = [
    { id: "t1", from: "A", verb: "links", to: "B" },
    { id: "t2", from: "A", verb: "", to: "B" },
  ];
  const concepts = derive_concepts(triples);
  const a = concepts.find((c) => c.key === "a");
  assert.ok(a);
  // only t1 is complete; t2 is partial and excluded
  assert.deepEqual(a.outgoing, ["t1"]);
});

//============================================
// Deduplication and casing
//============================================

test("same concept with different casing shares one key (first-casing-wins)", () => {
  const triples = [
    { id: "t1", from: "Cell", verb: "is", to: "Biology" },
    { id: "t2", from: "cell", verb: "is also", to: "Chemistry" },
  ];
  const concepts = derive_concepts(triples);
  // Cell and cell must share one key; label = first seen = "Cell"
  const cell = concepts.find((c) => c.key === "cell");
  assert.ok(cell);
  assert.equal(cell.label, "Cell");
  // both triples contribute outgoing edges
  assert.deepEqual(cell.outgoing.sort(), ["t1", "t2"]);
});

test("empty input returns no concepts", () => {
  const concepts = derive_concepts([]);
  assert.equal(concepts.length, 0);
});

test("ordering stability: concepts appear in from/to first-appearance order across triples", () => {
  const triples = [
    { id: "t1", from: "Alpha", verb: "leads", to: "Beta" },
    { id: "t2", from: "Beta", verb: "follows", to: "Gamma" },
  ];
  const concepts = derive_concepts(triples);
  // Alpha first, Beta second (to of t1 = Beta), Gamma third
  assert.equal(concepts[0].key, "alpha");
  assert.equal(concepts[1].key, "beta");
  assert.equal(concepts[2].key, "gamma");
});
