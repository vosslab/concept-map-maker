// Behavior tests for the reactive state module (src/app_state.ts).
// Run: node --import tsx --test tests/test_app_state.mjs
//
// Reactive primitives (createStore/createMemo/createEffect) require Solid's
// development build, which node only resolves under an export-condition flag the
// test harness does not pass. So the testable contract is proven at the function
// level: app_state extracts every memo body and the boot/autosave decisions into
// exported pure helpers (compute_flow_depths, compute_flow_highlighted_nodes,
// resolve_node_position, load_boot_document, attempt_storage_write). The reactive
// memos in app_state are thin wrappers over these helpers, so testing the helpers
// proves the depth/highlight/position/autosave contracts directly, independent of
// which Solid build is loaded.

import test from "node:test";
import assert from "node:assert/strict";

import {
  compute_flow_depths,
  compute_flow_highlighted_nodes,
  resolve_node_position,
  load_boot_document,
  attempt_storage_write,
} from "../src/app_state.ts";
import { empty_document, serialize_document } from "../src/document_codec.ts";

//============================================
// test helpers
//============================================

// A minimal in-memory localStorage stand-in. set_throw_on_set forces setItem to
// throw so the over-quota / blocked-storage path can be exercised.
function make_fake_storage(initial) {
  const store = new Map();
  if (initial !== undefined) {
    for (const [k, v] of Object.entries(initial)) {
      store.set(k, v);
    }
  }
  let throw_on_set = false;
  let throw_on_get = false;
  return {
    getItem(key) {
      if (throw_on_get) {
        throw new Error("storage blocked");
      }
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      if (throw_on_set) {
        throw new Error("quota exceeded");
      }
      store.set(key, value);
    },
    set_throw_on_set(flag) {
      throw_on_set = flag;
    },
    set_throw_on_get(flag) {
      throw_on_get = flag;
    },
  };
}

// A small linear flow graph: start -> a -> b -> end.
function linear_graph() {
  return {
    nodes: [
      { id: "start", shape: "terminal", text: "start", line: 1 },
      { id: "a", shape: "process", text: "set x to 1", line: 2 },
      { id: "b", shape: "io", text: "output x", line: 3 },
      { id: "end", shape: "terminal", text: "end", line: 4 },
    ],
    edges: [
      { id: "e1", from: "start", to: "a", kind: "flow" },
      { id: "e2", from: "a", to: "b", kind: "flow" },
      { id: "e3", from: "b", to: "end", kind: "flow" },
    ],
  };
}

//============================================
// compute_flow_depths
//============================================

test("compute_flow_depths ranks a linear chain from the start origin", () => {
  const { depth_by_key, origin_keys } = compute_flow_depths(linear_graph());
  assert.equal(depth_by_key.get("start"), 0);
  assert.equal(depth_by_key.get("a"), 1);
  assert.equal(depth_by_key.get("b"), 2);
  assert.equal(depth_by_key.get("end"), 3);
  assert.ok(origin_keys.has("start"));
});

test("compute_flow_depths excludes back edges from depth ranking", () => {
  const graph = linear_graph();
  // a loop return from b up to a must not make a appear deeper or non-origin
  graph.edges.push({ id: "e_back", from: "b", to: "a", kind: "back" });
  const { depth_by_key, origin_keys } = compute_flow_depths(graph);
  assert.equal(depth_by_key.get("a"), 1);
  assert.ok(origin_keys.has("start"));
});

//============================================
// compute_flow_highlighted_nodes
//============================================

test("node hover tags the hovered node both", () => {
  const roles = compute_flow_highlighted_nodes({ source: "node", nodeId: "a" });
  assert.equal(roles.get("a"), "both");
});

test("null hover highlights nothing", () => {
  const roles = compute_flow_highlighted_nodes({ source: null, nodeId: null });
  assert.equal(roles.size, 0);
});

//============================================
// resolve_node_position
//============================================

// A layout result placing node "a" at (10, 20).
function layout_with_a() {
  return {
    nodes: new Map([["a", { x: 10, y: 20, w: 90, h: 48, shape: "process" }]]),
    width: 100,
    height: 100,
  };
}

test("resolve_node_position returns the layout center with no override", () => {
  const pos = resolve_node_position("a", {}, layout_with_a());
  assert.deepEqual(pos, { x: 10, y: 20 });
});

test("resolve_node_position lets a drag override win", () => {
  const pos = resolve_node_position("a", { a: { x: 99, y: 88 } }, layout_with_a());
  assert.deepEqual(pos, { x: 99, y: 88 });
});

test("resolve_node_position returns null for an unplaced node with no override", () => {
  const pos = resolve_node_position("missing", {}, layout_with_a());
  assert.equal(pos, null);
});

//============================================
// load_boot_document
//============================================

test("load_boot_document with null storage yields an empty doc and read_ok false", () => {
  const { doc, read_ok } = load_boot_document(null);
  assert.equal(read_ok, false);
  assert.equal(doc.source, "");
});

test("load_boot_document reads a stored document", () => {
  const stored = serialize_document({ ...empty_document(), source: "start\nend\n" });
  const storage = make_fake_storage({ "pseudo-code-flowchart:document": stored });
  const { doc, read_ok } = load_boot_document(storage);
  assert.equal(read_ok, true);
  assert.equal(doc.source, "start\nend\n");
});

test("load_boot_document falls back to empty on a corrupt slot without throwing", () => {
  const storage = make_fake_storage({ "pseudo-code-flowchart:document": "{ not json" });
  const { doc, read_ok } = load_boot_document(storage);
  assert.equal(read_ok, true);
  assert.equal(doc.source, "");
});

//============================================
// attempt_storage_write
//============================================

test("attempt_storage_write returns false for null storage", () => {
  assert.equal(attempt_storage_write(null, "{}"), false);
});

test("attempt_storage_write returns true on a successful write", () => {
  const storage = make_fake_storage();
  assert.equal(attempt_storage_write(storage, "{}"), true);
});

test("attempt_storage_write returns false when the write throws", () => {
  const storage = make_fake_storage();
  storage.set_throw_on_set(true);
  assert.equal(attempt_storage_write(storage, "{}"), false);
});
