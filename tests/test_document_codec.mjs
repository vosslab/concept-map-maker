// Unit tests for the versioned FlowDocument codec (src/document_codec.ts).
// Run: node --import tsx --test tests/test_document_codec.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  empty_document,
  from_pseudo_source,
  parse_document,
  serialize_document,
  prune_overrides,
} from "../src/document_codec.ts";

//============================================
// empty_document
//============================================

test("empty_document returns a valid FlowDocument with format and version", () => {
  const doc = empty_document();
  assert.equal(doc.format, "pseudo-code-flowchart");
  assert.equal(doc.version, 1);
});

test("empty_document has empty source and no overrides", () => {
  const doc = empty_document();
  assert.equal(doc.source, "");
  assert.deepEqual(doc.overrides, {});
});

test("empty_document round-trips through serialize/parse", () => {
  const doc = empty_document();
  const restored = parse_document(serialize_document(doc));
  assert.deepEqual(restored, doc);
});

//============================================
// from_pseudo_source
//============================================

test("from_pseudo_source builds a FlowDocument with the given source", () => {
  const source = "start\nend\n";
  const doc = from_pseudo_source(source);
  assert.equal(doc.source, source);
  assert.equal(doc.format, "pseudo-code-flowchart");
});

test("from_pseudo_source returns a document with no overrides", () => {
  const doc = from_pseudo_source("start\nend\n");
  assert.deepEqual(doc.overrides, {});
});

//============================================
// round-trip: identity on source, title, overrides, theme
//============================================

test("round-trip preserves source exactly", () => {
  const json_text = JSON.stringify({
    format: "pseudo-code-flowchart",
    version: 1,
    title: "Password check",
    source: 'start\nif password == stored_password:\n\toutput "Access granted"\nend if\nend\n',
    overrides: {},
    theme: { palette: "earth" },
  });
  const doc = parse_document(json_text);
  const restored = parse_document(serialize_document(doc));
  assert.equal(restored.source, doc.source);
});

test("round-trip preserves title", () => {
  const json_text = JSON.stringify({
    format: "pseudo-code-flowchart",
    version: 1,
    title: "My Custom Title",
    source: "",
    overrides: {},
    theme: { palette: "earth" },
  });
  const doc = parse_document(json_text);
  const restored = parse_document(serialize_document(doc));
  assert.equal(restored.title, "My Custom Title");
});

test("round-trip preserves overrides", () => {
  const json_text = JSON.stringify({
    format: "pseudo-code-flowchart",
    version: 1,
    title: "t",
    source: "start\nend\n",
    overrides: {
      "n:output-x": { x: 100, y: 200 },
      "conn:if:root:if-x": { x: 50, y: 75 },
    },
    theme: { palette: "earth" },
  });
  const doc = parse_document(json_text);
  const restored = parse_document(serialize_document(doc));
  assert.deepEqual(restored.overrides, doc.overrides);
});

test("round-trip preserves theme palette", () => {
  const json_text = JSON.stringify({
    format: "pseudo-code-flowchart",
    version: 1,
    title: "t",
    source: "",
    overrides: {},
    theme: { palette: "fire" },
  });
  const doc = parse_document(json_text);
  const restored = parse_document(serialize_document(doc));
  assert.deepEqual(restored.theme, { palette: "fire" });
});

//============================================
// format/version gate (loud rejection)
//============================================

test("wrong format tag is rejected loudly", () => {
  const foreign = JSON.stringify({
    format: "some-other-app",
    version: 1,
    title: "t",
    source: "",
    overrides: {},
    theme: { palette: "earth" },
  });
  assert.throws(() => parse_document(foreign), /pseudo-code-flowchart/);
});

test("unknown version is rejected with a version message", () => {
  const future = JSON.stringify({
    format: "pseudo-code-flowchart",
    version: 2,
    title: "t",
    source: "",
    overrides: {},
    theme: { palette: "earth" },
  });
  assert.throws(() => parse_document(future), /Unsupported document version 2/);
});

test("non-JSON text is rejected with a clear error", () => {
  assert.throws(() => parse_document("this is not json {"), /not valid JSON/);
});

test("a JSON array is rejected (not an object)", () => {
  assert.throws(() => parse_document("[]"), /must be an object/);
});

test("a missing format field is rejected", () => {
  const noformat = JSON.stringify({ version: 1, title: "t" });
  assert.throws(() => parse_document(noformat), /format must be a string/);
});

test("an unknown theme palette is rejected", () => {
  const bad = JSON.stringify({
    format: "pseudo-code-flowchart",
    version: 1,
    title: "t",
    source: "",
    overrides: {},
    theme: { palette: "neon" },
  });
  assert.throws(() => parse_document(bad), /not a known palette/);
});

test("a missing source field is rejected", () => {
  const nosource = JSON.stringify({
    format: "pseudo-code-flowchart",
    version: 1,
    title: "t",
    overrides: {},
    theme: { palette: "earth" },
  });
  assert.throws(() => parse_document(nosource), /source must be a string/);
});

//============================================
// override pruning
//============================================

test("prune_overrides keeps keys present in live_node_ids", () => {
  const overrides = {
    "n:start": { x: 1, y: 2 },
    "n:end": { x: 3, y: 4 },
    "n:stale": { x: 5, y: 6 },
  };
  const pruned = prune_overrides(overrides, ["n:start", "n:end"]);
  assert.deepEqual(pruned, { "n:start": { x: 1, y: 2 }, "n:end": { x: 3, y: 4 } });
});

test("prune_overrides drops all overrides when no live_node_ids match", () => {
  const overrides = { "n:old": { x: 1, y: 2 } };
  const pruned = prune_overrides(overrides, []);
  assert.deepEqual(pruned, {});
});

test("prune_overrides with all live ids keeps all overrides intact", () => {
  const overrides = { "n:a": { x: 0, y: 0 }, "n:b": { x: 1, y: 1 } };
  const pruned = prune_overrides(overrides, ["n:a", "n:b"]);
  assert.deepEqual(pruned, overrides);
});

test("prune_overrides with empty overrides returns empty object", () => {
  const pruned = prune_overrides({}, ["n:a", "n:b"]);
  assert.deepEqual(pruned, {});
});
