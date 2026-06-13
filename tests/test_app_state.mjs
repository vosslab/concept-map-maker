// Behavior tests for the reactive state module (src/app_state.ts).
// Run: node --import tsx --test tests/test_app_state.mjs
//
// Reactive primitives (createStore/createMemo/createEffect) require Solid's
// development build, which node only resolves under an export-condition flag the
// test harness does not pass. So the testable contract is proven at the function
// level: app_state extracts every memo body and the boot/autosave decisions into
// exported pure helpers (resolve_node_position, compute_highlighted_triples,
// compute_highlighted_concepts, load_boot_document, attempt_storage_write). The
// reactive memos in app_state are thin wrappers over these helpers, so testing
// the helpers proves the layout/highlight/position/autosave contracts directly,
// independent of which Solid build is loaded.

import test from "node:test";
import assert from "node:assert/strict";

import { createRoot } from "solid-js";

import {
  create_app_state,
  resolve_node_position,
  compute_highlighted_triples,
  compute_highlighted_concepts,
  compute_cell_classification,
  load_boot_document,
  attempt_storage_write,
} from "../src/app_state.ts";
import { compute_layout } from "../src/layout_graph.ts";

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

const SLOT_KEY = "concept-map-maker:document";

function valid_stored_json() {
  const doc = {
    format: "concept-map-maker",
    version: 1,
    title: "Stored map",
    triples: [{ id: "t1", from: "Bee", verb: "makes", to: "Honey" }],
    overrides: {},
    theme: { shape: "rounded", palette: "earth" },
  };
  return JSON.stringify(doc);
}

const honeybee_triples = [
  { id: "t1", from: "Bee", verb: "makes", to: "Honey" },
  { id: "t2", from: "Flower", verb: "feeds", to: "Bee" },
];

//============================================
// layout contract: depends ONLY on triples
//============================================

test("layout is a pure function of triples, never of overrides", () => {
  // the layout memo body is compute_layout(doc.triples). The render position
  // rule re-introduces overrides AFTER layout. So changing an override cannot
  // reach layout: same triples -> identical layout coordinates regardless of
  // any override values.
  const a = compute_layout(honeybee_triples);
  const b = compute_layout(honeybee_triples);
  // determinism: identical triples produce identical coordinates
  for (const key of a.nodes.keys()) {
    assert.deepEqual(a.nodes.get(key), b.nodes.get(key));
  }
  // resolve_node_position merges an override on top of the SAME layout object,
  // proving overrides are applied at render-position resolution, not in layout
  const dragged = resolve_node_position("bee", { bee: { x: 1000, y: 2000 } }, a);
  assert.deepEqual(dragged, { x: 1000, y: 2000 });
  // the layout object itself is untouched by that override
  const laid = a.nodes.get("bee");
  assert.ok(laid !== undefined);
  assert.notEqual(laid.x, 1000);
});

//============================================
// render-position resolution
//============================================

test("resolve_node_position returns the override when present", () => {
  const layout = compute_layout(honeybee_triples);
  const pos = resolve_node_position("bee", { bee: { x: 12, y: 34 } }, layout);
  assert.deepEqual(pos, { x: 12, y: 34 });
});

test("resolve_node_position falls back to the laid-out center", () => {
  const layout = compute_layout(honeybee_triples);
  const pos = resolve_node_position("bee", {}, layout);
  assert.ok(pos !== null);
  const laid = layout.nodes.get("bee");
  assert.deepEqual(pos, { x: laid.x, y: laid.y });
});

test("resolve_node_position returns null for an unknown concept", () => {
  const layout = compute_layout(honeybee_triples);
  assert.equal(resolve_node_position("nonexistent", {}, layout), null);
});

//============================================
// highlight: triples
//============================================

test("row hover highlights exactly that triple", () => {
  const hover = { source: "row", tripleId: "t1", conceptKey: null };
  const result = compute_highlighted_triples(hover, honeybee_triples);
  assert.deepEqual([...result], ["t1"]);
});

test("edge hover highlights exactly that triple", () => {
  const hover = { source: "edge", tripleId: "t2", conceptKey: null };
  const result = compute_highlighted_triples(hover, honeybee_triples);
  assert.deepEqual([...result], ["t2"]);
});

test("node hover highlights every triple touching the concept", () => {
  const hover = { source: "node", tripleId: null, conceptKey: "bee" };
  const result = compute_highlighted_triples(hover, honeybee_triples);
  // bee is the "from" of t1 and the "to" of t2
  assert.deepEqual([...result].sort(), ["t1", "t2"]);
});

test("no hover highlights no triples", () => {
  const hover = { source: null, tripleId: null, conceptKey: null };
  assert.equal(compute_highlighted_triples(hover, honeybee_triples).size, 0);
});

//============================================
// highlight: role-tagged concepts
//============================================

function index_triples(triples) {
  const m = new Map();
  for (const t of triples) {
    m.set(t.id, t);
  }
  return m;
}

test("row hover tags from-concept 'from' and to-concept 'to'", () => {
  const hover = { source: "row", tripleId: "t1", conceptKey: null };
  const result = compute_highlighted_concepts(hover, index_triples(honeybee_triples));
  assert.equal(result.get("bee"), "from");
  assert.equal(result.get("honey"), "to");
});

test("node hover tags the hovered concept 'both'", () => {
  const hover = { source: "node", tripleId: null, conceptKey: "bee" };
  const result = compute_highlighted_concepts(hover, index_triples(honeybee_triples));
  assert.equal(result.get("bee"), "both");
});

test("a self-loop row hover tags its single concept 'both'", () => {
  const loop = [{ id: "s1", from: "Cell", verb: "divides into", to: "cell" }];
  const hover = { source: "row", tripleId: "s1", conceptKey: null };
  const result = compute_highlighted_concepts(hover, index_triples(loop));
  assert.equal(result.get("cell"), "both");
});

test("no hover tags no concepts", () => {
  const hover = { source: null, tripleId: null, conceptKey: null };
  assert.equal(compute_highlighted_concepts(hover, new Map()).size, 0);
});

//============================================
// autosave: boot load
//============================================

test("boot loads a valid stored document and keeps the read path enabled", () => {
  const storage = make_fake_storage({ [SLOT_KEY]: valid_stored_json() });
  const boot = load_boot_document(storage);
  assert.equal(boot.doc.title, "Stored map");
  assert.ok(boot.doc.triples.length > 0);
  assert.equal(boot.doc.triples[0].from, "Bee");
  assert.equal(boot.read_ok, true);
});

test("boot rejects invalid stored JSON and falls back to empty without throwing", () => {
  const storage = make_fake_storage({ [SLOT_KEY]: "{ not valid json" });
  const boot = load_boot_document(storage);
  // empty fallback, not the corrupt content
  assert.equal(boot.doc.triples.length, 0);
  // the read path itself still works, so autosave stays enabled
  assert.equal(boot.read_ok, true);
});

test("boot rejects a foreign-format document and falls back to empty", () => {
  const foreign = JSON.stringify({ format: "some-other-app", version: 1 });
  const storage = make_fake_storage({ [SLOT_KEY]: foreign });
  const boot = load_boot_document(storage);
  assert.equal(boot.doc.triples.length, 0);
  assert.equal(boot.doc.title, "Untitled concept map");
});

test("boot with an empty slot returns an empty document and an enabled read path", () => {
  const storage = make_fake_storage();
  const boot = load_boot_document(storage);
  assert.equal(boot.doc.triples.length, 0);
  assert.equal(boot.read_ok, true);
});

//============================================
// autosave: storage unavailable / throwing
//============================================

test("a null storage boots empty with the read path disabled", () => {
  const boot = load_boot_document(null);
  assert.equal(boot.doc.triples.length, 0);
  assert.equal(boot.read_ok, false);
});

test("a storage whose getItem throws boots empty with the read path disabled", () => {
  const storage = make_fake_storage();
  storage.set_throw_on_get(true);
  const boot = load_boot_document(storage);
  assert.equal(boot.doc.triples.length, 0);
  assert.equal(boot.read_ok, false);
});

//============================================
// autosave: write resilience
//============================================

test("attempt_storage_write persists the payload and reports success", () => {
  const storage = make_fake_storage();
  const ok = attempt_storage_write(storage, valid_stored_json());
  assert.equal(ok, true);
  assert.equal(storage.getItem(SLOT_KEY), valid_stored_json());
});

test("attempt_storage_write reports failure when setItem throws", () => {
  const storage = make_fake_storage();
  storage.set_throw_on_set(true);
  // a throwing write returns false (which flips autosave_enabled off) and never
  // propagates the exception
  const ok = attempt_storage_write(storage, valid_stored_json());
  assert.equal(ok, false);
});

test("attempt_storage_write reports failure for a null storage", () => {
  assert.equal(attempt_storage_write(null, valid_stored_json()), false);
});

//============================================
// reactive wiring smoke
//============================================

test("create_app_state wires the full API without throwing and exposes boot state", () => {
  // construct the whole reactive graph (store + signal + memos + autosave effect)
  // inside a root and confirm the API surface is present and the booted document
  // flowed through. This guards against a wiring crash at construction time.
  createRoot((dispose) => {
    const api = create_app_state(make_fake_storage({ [SLOT_KEY]: valid_stored_json() }));
    // the booted document is on the store
    assert.equal(api.doc.title, "Stored map");
    // a valid read path leaves autosave enabled
    assert.equal(api.autosave_enabled(), true);
    api.dispose();
    dispose();
  });
});

test("a null-storage app boots with autosave disabled but a usable API", () => {
  createRoot((dispose) => {
    const api = create_app_state(null);
    assert.equal(api.autosave_enabled(), false);
    // derived surface is callable on the empty boot document
    assert.equal(api.concepts().length, 0);
    api.dispose();
    dispose();
  });
});

//============================================
// compute_cell_classification
//============================================

test("compute_cell_classification: honeybees->castes, castes->workers gives correct roles for active castes", () => {
  // Worked example: active concept is "castes".
  // Row 1: honeybees -> have -> castes  (honeybees points INTO castes -> cell-from)
  // Row 2: castes -> include -> workers (castes points OUT to workers -> cell-to)
  // "castes" itself -> cell-same
  const triples = [
    { id: "t1", from: "Honeybees", verb: "have", to: "Castes" },
    { id: "t2", from: "Castes", verb: "include", to: "Workers" },
  ];
  const map = compute_cell_classification("castes", triples);
  assert.equal(map.get("castes"), "same");
  assert.equal(map.get("honeybees"), "from");
  assert.equal(map.get("workers"), "to");
});

test("compute_cell_classification: self-loop concept gets same (same > from > to precedence)", () => {
  // A self-loop triple: "castes" -> "includes" -> "castes".
  // The active concept also appears as both from and to partner of the same triple.
  // Precedence rule: same always wins; written last it overrides any from/to assignment.
  const triples = [{ id: "t1", from: "Castes", verb: "includes", to: "Castes" }];
  const map = compute_cell_classification("castes", triples);
  // castes is the active concept, so it must be "same" regardless of from/to roles
  assert.equal(map.get("castes"), "same");
});

test("compute_cell_classification: null active concept yields empty map", () => {
  const triples = [{ id: "t1", from: "Bee", verb: "makes", to: "Honey" }];
  const map_null = compute_cell_classification(null, triples);
  assert.equal(map_null.size, 0);
  // blank string active concept also yields empty map
  const map_blank = compute_cell_classification("", triples);
  assert.equal(map_blank.size, 0);
});
