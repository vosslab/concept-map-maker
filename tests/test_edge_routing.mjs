// Unit tests for the post-dagre edge-routing layer (src/edge_routing.ts).
// Run: node --import tsx --test tests/test_edge_routing.mjs
//
// These tests assert clearance on the ACTUAL routed curve: they rebuild each
// edge's bezier with the curvature the router returned, sample it the same way
// the router does, and check the sampled polyline against the obstacle box. They
// never assert on the midpoint or a control point alone.

import test from "node:test";
import assert from "node:assert/strict";

import { edge_path, cubic_point } from "../src/edge_geometry.ts";
import {
  compute_route_curvatures,
  segment_or_polyline_clears,
  NODE_CLEARANCE_PX,
  MAX_CURVATURE,
  CURVE_SAMPLES,
} from "../src/edge_routing.ts";

// Sample a routed edge's curve into a polyline, mirroring the router's own
// sampling (edge_path -> cubic at CURVE_SAMPLES+1 evenly spaced t).
function sample_routed_curve(from_box, to_box, shape, curvature) {
  const cubic = edge_path(from_box, to_box, shape, curvature).cubic;
  const points = [];
  for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
    const t = i / CURVE_SAMPLES;
    const p = cubic_point(
      cubic.x0,
      cubic.y0,
      cubic.x1,
      cubic.y1,
      cubic.x2,
      cubic.y2,
      cubic.x3,
      cubic.y3,
      t,
    );
    points.push(p);
  }
  return points;
}

// Build a keyed node-box map in a stable insertion order.
function boxes_of(entries) {
  const map = new Map();
  for (const [key, box] of entries) {
    map.set(key, box);
  }
  return map;
}

//============================================
// bypass collision: A top, C bottom, B centered between on the A->C line
//============================================
test("bypass: A->C bulges around an intervening centered node B (sampled curve)", () => {
  // A directly above C; B sits exactly on the straight A->C line, between them
  const a = { x: 0, y: 0, w: 80, h: 40 };
  const c = { x: 0, y: 300, w: 80, h: 40 };
  const b = { x: 0, y: 150, w: 80, h: 40 };
  const node_boxes = boxes_of([
    ["A", a],
    ["B", b],
    ["C", c],
  ]);
  const edge = {
    id: "e_ac",
    from_key: "A",
    to_key: "C",
    from_box: a,
    to_box: c,
    is_self_loop: false,
  };
  // base is straight (lone edge) so the router must discover a clearing bulge
  const base = new Map([["e_ac", 0]]);
  const routed = compute_route_curvatures([edge], node_boxes, "rect", base);
  const curvature = routed.get("e_ac");
  // a nonzero curvature was chosen to bypass B
  assert.notEqual(curvature, 0);
  // rebuild and sample the routed curve, then assert it clears B's inflated box
  const curve = sample_routed_curve(a, c, "rect", curvature);
  assert.ok(
    segment_or_polyline_clears(curve, b, NODE_CLEARANCE_PX),
    "routed A->C curve must clear B by NODE_CLEARANCE_PX",
  );
  // the bulge must move the curve apex sideways AWAY from B's center (x = 0):
  // sample the apex (t = 0.5) and confirm it sits clearly to one side
  const cubic = edge_path(a, c, "rect", curvature).cubic;
  const apex = cubic_point(
    cubic.x0,
    cubic.y0,
    cubic.x1,
    cubic.y1,
    cubic.x2,
    cubic.y2,
    cubic.x3,
    cubic.y3,
    0.5,
  );
  // B's half width plus clearance is the minimum sideways distance the apex needs
  const needed = b.w / 2 + NODE_CLEARANCE_PX;
  assert.ok(Math.abs(apex.x) >= needed, `apex must clear B sideways: |${apex.x}| >= ${needed}`);
});

//============================================
// clear corridor: no intervening node keeps the base curvature
//============================================
test("clear corridor: A->C with no obstacle keeps its base curvature", () => {
  const a = { x: 0, y: 0, w: 80, h: 40 };
  const c = { x: 0, y: 300, w: 80, h: 40 };
  // an unrelated node far off to the side, nowhere near the corridor
  const d = { x: 500, y: 150, w: 80, h: 40 };
  const node_boxes = boxes_of([
    ["A", a],
    ["C", c],
    ["D", d],
  ]);
  const edge = {
    id: "e_ac",
    from_key: "A",
    to_key: "C",
    from_box: a,
    to_box: c,
    is_self_loop: false,
  };
  const base = new Map([["e_ac", 0]]);
  const routed = compute_route_curvatures([edge], node_boxes, "rect", base);
  assert.equal(routed.get("e_ac"), 0, "clear corridor must keep base curvature 0");
});

test("clear corridor: nonzero base curvature is preserved when nothing collides", () => {
  const a = { x: 0, y: 0, w: 80, h: 40 };
  const c = { x: 0, y: 300, w: 80, h: 40 };
  const node_boxes = boxes_of([
    ["A", a],
    ["C", c],
  ]);
  const edge = {
    id: "e_ac",
    from_key: "A",
    to_key: "C",
    from_box: a,
    to_box: c,
    is_self_loop: false,
  };
  // a small base bow (as a bidirectional pair would carry) must survive untouched
  const base = new Map([["e_ac", 0.2]]);
  const routed = compute_route_curvatures([edge], node_boxes, "rect", base);
  assert.equal(routed.get("e_ac"), 0.2, "clear corridor preserves nonzero base");
});

//============================================
// freer side: B offset to the left -> bulge clears to the right (smaller side)
//============================================
test("freer side: B offset left of the A->C line -> chosen bulge clears it", () => {
  const a = { x: 0, y: 0, w: 80, h: 40 };
  const c = { x: 0, y: 300, w: 80, h: 40 };
  // B straddles the corridor but its center is shifted LEFT of the A->C line, so
  // the right side is the freer (smaller-offset) escape
  const b = { x: -20, y: 150, w: 80, h: 40 };
  const node_boxes = boxes_of([
    ["A", a],
    ["B", b],
    ["C", c],
  ]);
  const edge = {
    id: "e_ac",
    from_key: "A",
    to_key: "C",
    from_box: a,
    to_box: c,
    is_self_loop: false,
  };
  const base = new Map([["e_ac", 0]]);
  const routed = compute_route_curvatures([edge], node_boxes, "rect", base);
  const curvature = routed.get("e_ac");
  assert.notEqual(curvature, 0);
  // sampled routed curve clears B
  const curve = sample_routed_curve(a, c, "rect", curvature);
  assert.ok(
    segment_or_polyline_clears(curve, b, NODE_CLEARANCE_PX),
    "routed curve must clear the left-shifted B",
  );
  // the apex must bow to the RIGHT (positive x), the freer side away from B
  const cubic = edge_path(a, c, "rect", curvature).cubic;
  const apex = cubic_point(
    cubic.x0,
    cubic.y0,
    cubic.x1,
    cubic.y1,
    cubic.x2,
    cubic.y2,
    cubic.x3,
    cubic.y3,
    0.5,
  );
  assert.ok(apex.x > 0, `apex must bow to the freer right side, got x=${apex.x}`);
});

//============================================
// determinism: identical input twice -> identical map
//============================================
test("determinism: identical input yields identical routing maps", () => {
  const a = { x: 0, y: 0, w: 80, h: 40 };
  const c = { x: 0, y: 300, w: 80, h: 40 };
  const b = { x: 0, y: 150, w: 80, h: 40 };
  const make_inputs = () => {
    const node_boxes = boxes_of([
      ["A", a],
      ["B", b],
      ["C", c],
    ]);
    const edge = {
      id: "e_ac",
      from_key: "A",
      to_key: "C",
      from_box: a,
      to_box: c,
      is_self_loop: false,
    };
    const base = new Map([["e_ac", 0]]);
    return { node_boxes, edge, base };
  };
  const first = make_inputs();
  const second = make_inputs();
  const r1 = compute_route_curvatures([first.edge], first.node_boxes, "rect", first.base);
  const r2 = compute_route_curvatures([second.edge], second.node_boxes, "rect", second.base);
  assert.deepEqual(Array.from(r1.entries()), Array.from(r2.entries()));
});

//============================================
// density cap: an oversized B blocking both sides -> clamped best-effort, no hang
//============================================
test("density cap: oversized B blocking both sides returns a clamped best-effort", () => {
  const a = { x: 0, y: 0, w: 80, h: 40 };
  const c = { x: 0, y: 300, w: 80, h: 40 };
  // B is enormous and centered: no bounded bulge within the offset cap can clear
  // it, so the router returns a best-effort clamped value rather than looping
  const b = { x: 0, y: 150, w: 2000, h: 200 };
  const node_boxes = boxes_of([
    ["A", a],
    ["B", b],
    ["C", c],
  ]);
  const edge = {
    id: "e_ac",
    from_key: "A",
    to_key: "C",
    from_box: a,
    to_box: c,
    is_self_loop: false,
  };
  const base = new Map([["e_ac", 0]]);
  const routed = compute_route_curvatures([edge], node_boxes, "rect", base);
  const curvature = routed.get("e_ac");
  assert.ok(curvature !== undefined, "density case must still return a value");
  // the best-effort value stays within the readability ceiling
  assert.ok(
    Math.abs(curvature) <= MAX_CURVATURE,
    `density best-effort must be clamped: |${curvature}| <= ${MAX_CURVATURE}`,
  );
});

//============================================
// self-loop: base curvature passes through untouched
//============================================
test("self-loop: base curvature is passed through unchanged", () => {
  const a = { x: 0, y: 0, w: 80, h: 40 };
  const node_boxes = boxes_of([["A", a]]);
  const edge = {
    id: "e_aa",
    from_key: "A",
    to_key: "A",
    from_box: a,
    to_box: a,
    is_self_loop: true,
  };
  const base = new Map([["e_aa", 0.4]]);
  const routed = compute_route_curvatures([edge], node_boxes, "rect", base);
  assert.equal(routed.get("e_aa"), 0.4, "self-loop keeps base curvature");
});
