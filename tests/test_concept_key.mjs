// Unit tests for concept_key normalization (src/types.ts).
// Run: node --import tsx --test tests/test_concept_key.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { concept_key } from "../src/types.ts";

test("trims surrounding whitespace", () => {
  assert.equal(concept_key("  Castes  "), "castes");
});

test("collapses internal whitespace runs to a single space", () => {
  assert.equal(concept_key("worker   bee"), "worker bee");
  assert.equal(concept_key("worker\t\nbee"), "worker bee");
});

test("lowercases for case-insensitive identity", () => {
  assert.equal(concept_key("Female"), "female");
  assert.equal(concept_key("FEMALE"), "female");
});

test("casing-only and spacing-only variants share one key", () => {
  const a = concept_key(" Honey  Bees ");
  const b = concept_key("honey bees");
  assert.equal(a, b);
});

test("differently spelled concepts keep distinct keys", () => {
  assert.notEqual(concept_key("cell"), concept_key("cells"));
});

test("a blank or whitespace-only label normalizes to empty string", () => {
  assert.equal(concept_key("   "), "");
  assert.equal(concept_key("\t\n "), "");
});
