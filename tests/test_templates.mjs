// Unit tests for template data validity (src/templates.ts).
// Run: node --import tsx --test tests/test_templates.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { parse_document, serialize_document } from "../src/document_codec.ts";
import { TEMPLATES } from "../src/templates.ts";
import { load_template } from "../src/template_actions.ts";
import { concept_key } from "../src/types.ts";

//============================================
// load_template overwrite guard
//============================================
// Exercise the injectable confirm_fn seam so the guard is covered without a
// browser. A minimal stub state stands in for AppState: load_template only reads
// doc.triples and calls replace_document.

test("load_template replaces without prompting when the map is empty", () => {
  let replaced = null;
  let confirm_calls = 0;
  const state = { doc: { triples: [] }, replace_document: (next) => (replaced = next) };
  load_template(state, TEMPLATES[0], () => {
    confirm_calls += 1;
    return false;
  });
  // Empty map: no confirm prompt, document is replaced.
  assert.equal(confirm_calls, 0);
  assert.ok(replaced !== null);
});

test("load_template leaves a non-empty map unchanged when confirm is canceled", () => {
  let replaced = null;
  const state = {
    doc: { triples: [{ id: "x", from: "A", verb: "v", to: "B" }] },
    replace_document: (next) => (replaced = next),
  };
  load_template(state, TEMPLATES[0], () => false);
  assert.equal(replaced, null);
});

test("load_template replaces a non-empty map when confirm is accepted", () => {
  let replaced = null;
  const state = {
    doc: { triples: [{ id: "x", from: "A", verb: "v", to: "B" }] },
    replace_document: (next) => (replaced = next),
  };
  load_template(state, TEMPLATES[0], () => true);
  assert.ok(replaced !== null);
  // The replaced document is a codec clone carrying the template title.
  assert.equal(replaced.title, TEMPLATES[0].doc.title);
});

//============================================
// TEMPLATES list integrity
//============================================

test("TEMPLATES is non-empty", () => {
  assert.ok(TEMPLATES.length > 0);
});

test("TEMPLATES entry ids are unique", () => {
  const ids = TEMPLATES.map((entry) => entry.id);
  const unique_ids = new Set(ids);
  assert.equal(unique_ids.size, ids.length);
});

//============================================
// Per-template data validity
//============================================

for (const entry of TEMPLATES) {
  test(`${entry.id}: round-trips through serialize/parse without throwing`, () => {
    // parse_document(serialize_document(doc)) must not throw
    const restored = parse_document(serialize_document(entry.doc));
    // restored doc retains the same title as the original
    assert.equal(restored.title, entry.doc.title);
  });

  test(`${entry.id}: triples is non-empty`, () => {
    assert.ok(entry.doc.triples.length > 0);
  });

  test(`${entry.id}: all triple ids are unique`, () => {
    const triple_ids = entry.doc.triples.map((t) => t.id);
    const unique_triple_ids = new Set(triple_ids);
    assert.equal(unique_triple_ids.size, triple_ids.length);
  });

  test(`${entry.id}: concept_key dedup yields more than one concept`, () => {
    // collect all concept keys from from/to across all triples
    const concept_keys = new Set();
    for (const t of entry.doc.triples) {
      concept_keys.add(concept_key(t.from));
      concept_keys.add(concept_key(t.to));
    }
    assert.ok(concept_keys.size > 1);
  });
}
