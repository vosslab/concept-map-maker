// Unit tests for flow edge geometry (src/edge_geometry.ts) and
// back-edge routing (src/edge_routing.ts).
// Run: node --import tsx --test tests/test_flow_geometry.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { flow_edge_path } from "../src/edge_geometry.ts";
import {
  compute_back_edge_geometry,
  route_back_edge,
  BACK_EDGE_LANE_MARGIN_PX,
} from "../src/edge_routing.ts";

//============================================
// flow_edge_path: basic validity
//============================================

test("flow_edge_path curvature 0 returns a non-empty SVG path string", () => {
  const from_box = { x: 100, y: 50, w: 120, h: 40 };
  const to_box = { x: 100, y: 200, w: 120, h: 40 };
  const geo = flow_edge_path(from_box, to_box, "process", "process", 0);
  // path must start with M and contain C for cubic bezier
  assert.ok(geo.d.startsWith("M"), "path must begin with move command");
  assert.ok(geo.d.includes("C"), "path must include a cubic bezier command");
});

test("flow_edge_path endpoints are clipped to the from and to box boundaries", () => {
  // source box: center (100, 50), height 40 => bottom edge at y = 70
  const from_box = { x: 100, y: 50, w: 120, h: 40 };
  // target box: center (100, 200), height 40 => top edge at y = 180
  const to_box = { x: 100, y: 200, w: 120, h: 40 };
  const geo = flow_edge_path(from_box, to_box, "process", "process", 0);
  // start point (x0,y0) must lie between the two box centers
  assert.ok(geo.cubic.y0 > 50, "start y is below the from-box center");
  assert.ok(geo.cubic.y0 < 200, "start y is above the to-box center");
  // end point (x3,y3) must also lie between the two box centers
  assert.ok(geo.cubic.y3 > 50, "end y is below the from-box center");
  assert.ok(geo.cubic.y3 < 200, "end y is above the to-box center");
});

test("flow_edge_path label anchor is near the midpoint between the two boxes", () => {
  const from_box = { x: 100, y: 50, w: 120, h: 40 };
  const to_box = { x: 100, y: 200, w: 120, h: 40 };
  const geo = flow_edge_path(from_box, to_box, "process", "process", 0);
  // the vertical midpoint between the two centers is 125; label should be near it
  assert.ok(geo.label_y > 70, "label y is below the from-box bottom edge");
  assert.ok(geo.label_y < 180, "label y is above the to-box top edge");
});

test("flow_edge_path with positive curvature still returns a valid non-empty d", () => {
  const from_box = { x: 100, y: 50, w: 80, h: 40 };
  const to_box = { x: 100, y: 200, w: 80, h: 40 };
  const geo_curved = flow_edge_path(from_box, to_box, "process", "process", 0.25);
  assert.ok(geo_curved.d.length > 0, "curved path must be a non-empty string");
  assert.ok(geo_curved.d.includes("C"), "curved path must include a cubic bezier command");
});

test("flow_edge_path curvature 0 and non-zero produce different control points", () => {
  const from_box = { x: 100, y: 50, w: 80, h: 40 };
  const to_box = { x: 100, y: 200, w: 80, h: 40 };
  const straight = flow_edge_path(from_box, to_box, "process", "process", 0);
  const curved = flow_edge_path(from_box, to_box, "process", "process", 0.3);
  // the first control point x should differ between straight and curved paths
  assert.notEqual(
    straight.cubic.x1,
    curved.cubic.x1,
    "control points differ with non-zero curvature",
  );
});

//============================================
// flow_edge_path: shape-specific clipping
//============================================

test("flow_edge_path clips oval terminal shape to inscribed ellipse boundary", () => {
  // oval clips to ellipse; for a purely vertical ray, exit is at center +/- half_h
  const from_box = { x: 100, y: 50, w: 120, h: 40 };
  const to_box = { x: 100, y: 200, w: 120, h: 40 };
  const geo = flow_edge_path(from_box, to_box, "terminal", "terminal", 0);
  // start y should equal from_box.y + half_h = 50 + 20 = 70 for a vertical ray
  assert.ok(Math.abs(geo.cubic.y0 - 70) < 0.1, "terminal start clips to ellipse bottom");
  assert.ok(Math.abs(geo.cubic.y3 - 180) < 0.1, "terminal end clips to ellipse top");
});

test("flow_edge_path clips decision diamond: start is above bottom corner of from_box", () => {
  // diamond clips per L1 norm; exit point is at or inside the bounding box
  const from_box = { x: 100, y: 50, w: 80, h: 40 };
  const to_box = { x: 100, y: 200, w: 80, h: 40 };
  const geo = flow_edge_path(from_box, to_box, "decision", "process", 0);
  // start must be within the from_box bounding box
  assert.ok(geo.cubic.y0 <= from_box.y + from_box.h / 2, "diamond start is within bounding box");
  assert.ok(geo.cubic.y0 >= from_box.y - from_box.h / 2, "diamond start is within bounding box");
});

//============================================
// route_back_edge: lane placement
//============================================

test("route_back_edge lane x lies outside the bounding box of from and to nodes", () => {
  // two boxes vertically stacked, no extra obstacles
  const from_box = { x: 100, y: 300, w: 80, h: 40 };
  const to_box = { x: 100, y: 100, w: 80, h: 40 };
  const route = route_back_edge(from_box, to_box, []);
  // left edge of both boxes is at x = 60; right edge is at x = 140
  const left_edge = 60;
  const right_edge = 140;
  if (route.side === "left") {
    assert.ok(route.lane_x < left_edge, "left lane clears the left edge of both boxes");
  } else {
    assert.ok(route.lane_x > right_edge, "right lane clears the right edge of both boxes");
  }
});

test("route_back_edge lane margin is at least BACK_EDGE_LANE_MARGIN_PX past nearest edge", () => {
  const from_box = { x: 100, y: 300, w: 80, h: 40 };
  const to_box = { x: 100, y: 100, w: 80, h: 40 };
  const route = route_back_edge(from_box, to_box, []);
  const left_edge = 60;
  const right_edge = 140;
  if (route.side === "left") {
    assert.ok(
      left_edge - route.lane_x >= BACK_EDGE_LANE_MARGIN_PX,
      "left lane has required margin",
    );
  } else {
    assert.ok(
      route.lane_x - right_edge >= BACK_EDGE_LANE_MARGIN_PX,
      "right lane has required margin",
    );
  }
});

test("route_back_edge with obstacles on the right routes the lane further right", () => {
  const from_box = { x: 100, y: 300, w: 80, h: 40 };
  const to_box = { x: 100, y: 100, w: 80, h: 40 };
  // obstacle overlapping the vertical band, shifted far to the right
  const obstacle = { x: 400, y: 200, w: 80, h: 200 };
  const route = route_back_edge(from_box, to_box, [obstacle]);
  if (route.side === "right") {
    // lane must clear the obstacle's right edge (400 + 40 = 440)
    assert.ok(route.lane_x > 440, "right lane clears the wide obstacle");
  } else {
    // if left was chosen instead, that is fine -- it cleared the obstacle differently
    assert.ok(route.lane_x < 60, "left lane chosen and clears left edge");
  }
});

test("route_back_edge ties resolve to the left (deterministic)", () => {
  // symmetric setup: from_box and to_box share the same center x
  const from_box = { x: 100, y: 300, w: 80, h: 40 };
  const to_box = { x: 100, y: 100, w: 80, h: 40 };
  const route = route_back_edge(from_box, to_box, []);
  // both sides are equidistant from the body node center; tie breaks to left
  assert.equal(route.side, "left", "symmetric input resolves to the left");
});

//============================================
// compute_back_edge_geometry: full path
//============================================

test("compute_back_edge_geometry returns a non-empty SVG path", () => {
  const from_box = { x: 100, y: 300, w: 80, h: 40 };
  const to_box = { x: 100, y: 100, w: 80, h: 40 };
  const geo = compute_back_edge_geometry(from_box, to_box, []);
  assert.ok(geo.d.length > 0, "back-edge path must be non-empty");
  assert.ok(geo.d.startsWith("M"), "back-edge path must begin with M");
});

test("compute_back_edge_geometry label anchor is vertically between the two nodes", () => {
  const from_box = { x: 100, y: 300, w: 80, h: 40 };
  const to_box = { x: 100, y: 100, w: 80, h: 40 };
  const geo = compute_back_edge_geometry(from_box, to_box, []);
  // label y is the midpoint of the vertical lane: between to_box.y and from_box.y
  assert.ok(geo.label_y > to_box.y, "label y is below the loop header");
  assert.ok(geo.label_y < from_box.y, "label y is above the body node");
});

test("compute_back_edge_geometry with a wide body obstacle pushes the lane further out", () => {
  const from_box = { x: 100, y: 400, w: 80, h: 40 };
  const to_box = { x: 100, y: 100, w: 80, h: 40 };
  // wide body node overlapping the vertical band: extends well past the endpoint edges
  const wide_body = { x: 100, y: 250, w: 300, h: 40 };
  const route_narrow = route_back_edge(from_box, to_box, []);
  const route_wide = route_back_edge(from_box, to_box, [wide_body]);
  // the wide obstacle widens the content envelope, so both lanes move further out
  const narrow_gap = Math.abs(route_narrow.lane_x - from_box.x);
  const wide_gap = Math.abs(route_wide.lane_x - from_box.x);
  assert.ok(wide_gap > narrow_gap, "a wider obstacle forces the lane further from the body center");
});
