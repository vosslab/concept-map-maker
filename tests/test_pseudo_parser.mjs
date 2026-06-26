// Unit tests for the pseudo-code lexer, parser, normalizer, and graph builder.
// Run: node --import tsx --test tests/test_pseudo_parser.mjs
// All fixture data is inlined as JS constants -- no filesystem reads required.

import test from "node:test";
import assert from "node:assert/strict";

import { parse_source } from "../src/pseudo_lang/parser.ts";
import { normalize } from "../src/pseudo_lang/normalize.ts";

//============================================
// inlined fixture sources (pseudo-code text)
//============================================

const SOURCES = {
  if: "start\ninput x\nif x > 0:\n\toutput x\nend if\nend\n",

  if_else: "start\ninput x\nif x > 0:\n\toutput x\nelse:\n\toutput 0\nend if\nend\n",

  nested_if:
    "start\ninput x\nif x > 0:\n\tif x > 10:\n\t\toutput big\n\tend if\n\toutput positive\nend if\nend\n",

  while:
    "start\nset count to 0\nwhile count < 3:\n\tset count to count + 1\nend while\noutput count\nend\n",

  for_loop:
    "start\nset total to 0\nfor i from 1 to 3:\n\tcall add_item\n\tset total to total + i\nend for\noutput total\nend\n",

  password:
    'start\ninput password\nif password == stored_password:\n\toutput "Access granted"\nelse:\n\toutput "Access denied"\nend if\nend\n',

  // block-style variants of if_else: indent-only, end-keyword-only, mixed
  indent_if_else: "start\ninput x\nif x > 0:\n\toutput x\nelse:\n\toutput 0\nend\n",

  endkw_if_else: "start\ninput x\nif x > 0\noutput x\nelse\noutput 0\nend if\nend\n",

  mixed_if_else: "start\ninput x\nif x > 0\n\toutput x\nelse\n\toutput 0\nend if\nend\n",

  repeat_unsupported: "start\nrepeat\n\toutput x\nuntil x > 3\nend\n",
};

//============================================
// inlined graph snapshots (projected shape)
//============================================

const SNAPSHOTS = {
  if: {
    nodes: [
      { id: "start", shape: "terminal" },
      { id: "n:input-x", shape: "io" },
      { id: "n:if-x-0", shape: "decision" },
      { id: "n:output-x", shape: "io" },
      { id: "conn:if:root:if-x-0", shape: "connector" },
      { id: "end", shape: "terminal" },
    ],
    edges: [
      { from: "start", to: "n:input-x", kind: "flow" },
      { from: "n:input-x", to: "n:if-x-0", kind: "flow" },
      { from: "n:if-x-0", to: "n:output-x", kind: "flow", branch: "true" },
      { from: "n:output-x", to: "conn:if:root:if-x-0", kind: "flow" },
      { from: "n:if-x-0", to: "conn:if:root:if-x-0", kind: "flow", branch: "false" },
      { from: "conn:if:root:if-x-0", to: "end", kind: "flow" },
    ],
  },

  if_else: {
    nodes: [
      { id: "start", shape: "terminal" },
      { id: "n:input-x", shape: "io" },
      { id: "n:if-x-0", shape: "decision" },
      { id: "n:output-x", shape: "io" },
      { id: "n:output-0", shape: "io" },
      { id: "conn:if:root:if-x-0", shape: "connector" },
      { id: "end", shape: "terminal" },
    ],
    edges: [
      { from: "start", to: "n:input-x", kind: "flow" },
      { from: "n:input-x", to: "n:if-x-0", kind: "flow" },
      { from: "n:if-x-0", to: "n:output-x", kind: "flow", branch: "true" },
      { from: "n:if-x-0", to: "n:output-0", kind: "flow", branch: "false" },
      { from: "n:output-x", to: "conn:if:root:if-x-0", kind: "flow" },
      { from: "n:output-0", to: "conn:if:root:if-x-0", kind: "flow" },
      { from: "conn:if:root:if-x-0", to: "end", kind: "flow" },
    ],
  },

  nested_if: {
    nodes: [
      { id: "start", shape: "terminal" },
      { id: "n:input-x", shape: "io" },
      { id: "n:if-x-0", shape: "decision" },
      { id: "n:if-x-10", shape: "decision" },
      { id: "n:output-big", shape: "io" },
      { id: "conn:if:root/if-x-0:if-x-10", shape: "connector" },
      { id: "n:output-positive", shape: "io" },
      { id: "conn:if:root:if-x-0", shape: "connector" },
      { id: "end", shape: "terminal" },
    ],
    edges: [
      { from: "start", to: "n:input-x", kind: "flow" },
      { from: "n:input-x", to: "n:if-x-0", kind: "flow" },
      { from: "n:if-x-0", to: "n:if-x-10", kind: "flow", branch: "true" },
      { from: "n:if-x-10", to: "n:output-big", kind: "flow", branch: "true" },
      { from: "n:output-big", to: "conn:if:root/if-x-0:if-x-10", kind: "flow" },
      { from: "n:if-x-10", to: "conn:if:root/if-x-0:if-x-10", kind: "flow", branch: "false" },
      { from: "conn:if:root/if-x-0:if-x-10", to: "n:output-positive", kind: "flow" },
      { from: "n:output-positive", to: "conn:if:root:if-x-0", kind: "flow" },
      { from: "n:if-x-0", to: "conn:if:root:if-x-0", kind: "flow", branch: "false" },
      { from: "conn:if:root:if-x-0", to: "end", kind: "flow" },
    ],
  },

  while: {
    nodes: [
      { id: "start", shape: "terminal" },
      { id: "n:set-count-to-0", shape: "process" },
      { id: "n:while-count-3", shape: "loop" },
      { id: "n:set-count-to-count-1", shape: "process" },
      { id: "conn:while:root:while-count-3", shape: "connector" },
      { id: "n:output-count", shape: "io" },
      { id: "end", shape: "terminal" },
    ],
    edges: [
      { from: "start", to: "n:set-count-to-0", kind: "flow" },
      { from: "n:set-count-to-0", to: "n:while-count-3", kind: "flow" },
      { from: "n:while-count-3", to: "n:set-count-to-count-1", kind: "flow", branch: "true" },
      // back-edge closes the loop -- kind must be "back"
      { from: "n:set-count-to-count-1", to: "n:while-count-3", kind: "back" },
      {
        from: "n:while-count-3",
        to: "conn:while:root:while-count-3",
        kind: "flow",
        branch: "false",
      },
      { from: "conn:while:root:while-count-3", to: "n:output-count", kind: "flow" },
      { from: "n:output-count", to: "end", kind: "flow" },
    ],
  },

  for_loop: {
    nodes: [
      { id: "start", shape: "terminal" },
      { id: "n:set-total-to-0", shape: "process" },
      { id: "n:for-i-from-1-to-3", shape: "loop" },
      { id: "n:call-add-item", shape: "subroutine" },
      { id: "n:set-total-to-total-i", shape: "process" },
      { id: "conn:for:root:for-i-from-1-to-3", shape: "connector" },
      { id: "n:output-total", shape: "io" },
      { id: "end", shape: "terminal" },
    ],
    edges: [
      { from: "start", to: "n:set-total-to-0", kind: "flow" },
      { from: "n:set-total-to-0", to: "n:for-i-from-1-to-3", kind: "flow" },
      { from: "n:for-i-from-1-to-3", to: "n:call-add-item", kind: "flow", branch: "true" },
      { from: "n:call-add-item", to: "n:set-total-to-total-i", kind: "flow" },
      // back-edge closes the loop -- kind must be "back"
      { from: "n:set-total-to-total-i", to: "n:for-i-from-1-to-3", kind: "back" },
      {
        from: "n:for-i-from-1-to-3",
        to: "conn:for:root:for-i-from-1-to-3",
        kind: "flow",
        branch: "false",
      },
      { from: "conn:for:root:for-i-from-1-to-3", to: "n:output-total", kind: "flow" },
      { from: "n:output-total", to: "end", kind: "flow" },
    ],
  },

  password: {
    nodes: [
      { id: "start", shape: "terminal" },
      { id: "n:input-password", shape: "io" },
      { id: "n:if-password-stored-password", shape: "decision" },
      { id: "n:output-access-granted", shape: "io" },
      { id: "n:output-access-denied", shape: "io" },
      { id: "conn:if:root:if-password-stored-password", shape: "connector" },
      { id: "end", shape: "terminal" },
    ],
    edges: [
      { from: "start", to: "n:input-password", kind: "flow" },
      { from: "n:input-password", to: "n:if-password-stored-password", kind: "flow" },
      {
        from: "n:if-password-stored-password",
        to: "n:output-access-granted",
        kind: "flow",
        branch: "true",
      },
      {
        from: "n:if-password-stored-password",
        to: "n:output-access-denied",
        kind: "flow",
        branch: "false",
      },
      {
        from: "n:output-access-granted",
        to: "conn:if:root:if-password-stored-password",
        kind: "flow",
      },
      {
        from: "n:output-access-denied",
        to: "conn:if:root:if-password-stored-password",
        kind: "flow",
      },
      { from: "conn:if:root:if-password-stored-password", to: "end", kind: "flow" },
    ],
  },
};

//============================================
// helpers
//============================================

// Project a FlowGraph down to the snapshot shape: nodes carry id and shape,
// edges carry from, to, kind, and an optional branch.
function project_graph(graph) {
  const nodes = graph.nodes.map((node) => ({ id: node.id, shape: node.shape }));
  const edges = graph.edges.map((edge) => {
    const projected = { from: edge.from, to: edge.to, kind: edge.kind };
    if (edge.branch !== undefined) {
      projected.branch = edge.branch;
    }
    return projected;
  });
  return { nodes, edges };
}

//============================================
// representative fixtures vs their snapshots
//============================================

const representative = ["if", "if_else", "nested_if", "while", "for_loop", "password"];

for (const name of representative) {
  test(`${name}: parses to its graph snapshot exactly`, () => {
    const graph = parse_source(SOURCES[name]);
    const projected = project_graph(graph);
    assert.deepEqual(projected, SNAPSHOTS[name]);
  });
}

//============================================
// reserved repeat/until
//============================================

test("repeat/until throws a line-referenced unsupported-loop error", () => {
  assert.throws(
    () => parse_source(SOURCES.repeat_unsupported),
    /Line 2: repeat\/until loops are not supported\. Use while or for\./,
  );
});

//============================================
// block-style variants produce one snapshot
//============================================

const if_else_variants = ["indent_if_else", "endkw_if_else", "mixed_if_else"];

for (const name of if_else_variants) {
  test(`${name}: parses to the canonical if_else snapshot`, () => {
    const graph = parse_source(SOURCES[name]);
    const projected = project_graph(graph);
    assert.deepEqual(projected, SNAPSHOTS.if_else);
  });
}

//============================================
// normalize idempotence
//============================================

const all_valid = [
  "if",
  "if_else",
  "nested_if",
  "while",
  "for_loop",
  "password",
  "indent_if_else",
  "endkw_if_else",
  "mixed_if_else",
];

for (const name of all_valid) {
  test(`${name}: normalize is idempotent`, () => {
    const once = normalize(SOURCES[name]);
    const twice = normalize(once);
    assert.equal(twice, once);
  });
}

test("the three if_else variants normalize to the same canonical text", () => {
  const indent_text = normalize(SOURCES.indent_if_else);
  const endkw_text = normalize(SOURCES.endkw_if_else);
  const mixed_text = normalize(SOURCES.mixed_if_else);
  assert.equal(endkw_text, indent_text);
  assert.equal(mixed_text, indent_text);
});

//============================================
// malformed input throws with a line number
//============================================

test("missing end keyword throws with a line number", () => {
  const source = "if x > 0\noutput x\n";
  assert.throws(() => parse_source(source), /Line 1: missing 'end if'/);
});

test("dedent below a colon header throws with a line number", () => {
  const source = "if x > 0:\noutput x\n";
  assert.throws(() => parse_source(source), /Line 1: expected an indented block/);
});

test("a stray else throws with a line number", () => {
  const source = "output x\nelse\noutput y\n";
  assert.throws(() => parse_source(source), /Line 2: unexpected 'else'/);
});

test("a stray end if throws with a line number", () => {
  const source = "output x\nend if\n";
  assert.throws(() => parse_source(source), /Line 2: unexpected 'end if'/);
});

//============================================
// node id stability across an unrelated edit
//============================================

test("editing one line leaves the other node ids unchanged", () => {
  const before = parse_source(SOURCES.password);
  // edit only the then-branch output text; every other line is untouched
  const edited_source = SOURCES.password.replace('output "Access granted"', 'output "Welcome"');
  const after = parse_source(edited_source);

  const before_ids = new Set(before.nodes.map((node) => node.id));
  const after_ids = new Set(after.nodes.map((node) => node.id));

  // the edited node id changes; confirm the new id appeared and old one left
  assert.ok(before_ids.has("n:output-access-granted"));
  assert.ok(after_ids.has("n:output-welcome"));

  // every unrelated node id must survive the edit unchanged
  const unrelated = [
    "start",
    "n:input-password",
    "n:if-password-stored-password",
    "n:output-access-denied",
    "conn:if:root:if-password-stored-password",
    "end",
  ];
  for (const id of unrelated) {
    assert.ok(before_ids.has(id), `expected ${id} before edit`);
    assert.ok(after_ids.has(id), `expected ${id} after edit`);
  }
});

//============================================
// comment edge behavioral tests
//============================================

test("trailing full-line comment attaches by a comment edge to the End terminal", () => {
  // A comment after the last executable statement must attach to the End node.
  const source = "start\noutput x\n# final note\nend\n";
  const graph = parse_source(source);
  // find the comment node created for "# final note"
  const comment_node = graph.nodes.find((n) => n.shape === "comment");
  assert.ok(comment_node !== undefined, "expected a comment node");
  // a comment edge must run from the comment node to the End terminal
  const comment_edge = graph.edges.find(
    (e) => e.from === comment_node.id && e.to === "end" && e.kind === "comment",
  );
  assert.ok(comment_edge !== undefined, "expected comment -> end edge with kind:comment");
});

test("two consecutive full-line comments each attach by comment edge to the same target", () => {
  // Multiple consecutive comments all attach to the same next executable node.
  const source = "start\n# first note\n# second note\noutput x\nend\n";
  const graph = parse_source(source);
  // collect comment nodes (two expected)
  const comment_nodes = graph.nodes.filter((n) => n.shape === "comment");
  assert.equal(comment_nodes.length, 2);
  // find "output x" node
  const output_node = graph.nodes.find((n) => n.shape === "io");
  assert.ok(output_node !== undefined, "expected an io output node");
  // both comments must attach to the same output node via comment edges
  for (const cn of comment_nodes) {
    const edge = graph.edges.find(
      (e) => e.from === cn.id && e.to === output_node.id && e.kind === "comment",
    );
    assert.ok(edge !== undefined, `expected comment edge from ${cn.id} to output node`);
  }
});

test("full-line comment before end if attaches to the if-block connector", () => {
  // A comment immediately before end if must attach to the generated connector.
  const source = "start\nif x > 0:\n\toutput x\n\t# done with if\nend if\nend\n";
  const graph = parse_source(source);
  // find the comment node
  const comment_node = graph.nodes.find((n) => n.shape === "comment");
  assert.ok(comment_node !== undefined, "expected a comment node");
  // the connector node for this if block
  const connector_node = graph.nodes.find((n) => n.shape === "connector");
  assert.ok(connector_node !== undefined, "expected a connector node for the if block");
  // the comment must attach to the connector via a comment edge
  const comment_edge = graph.edges.find(
    (e) => e.from === comment_node.id && e.to === connector_node.id && e.kind === "comment",
  );
  assert.ok(comment_edge !== undefined, "expected comment -> connector edge with kind:comment");
});
