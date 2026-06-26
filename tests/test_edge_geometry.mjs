// Unit tests for edge geometry (src/edge_geometry.ts).
// Run: node --import tsx --test tests/test_edge_geometry.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  edge_path,
  self_loop_path,
  assign_curvatures,
  place_edge_label,
} from "../src/edge_geometry.ts";
import { LABEL_CHAR_W_PX, LABEL_LINE_H_PX, LABEL_CLEAR_MARGIN_PX } from "../src/label_wrap.ts";

// Parse the four "C" control/end coordinate pairs out of a path "d" string.
// Returns { start, c1, c2, end } as {x,y} points.
function parse_path(d) {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  return {
    start: { x: numbers[0], y: numbers[1] },
    c1: { x: numbers[2], y: numbers[3] },
    c2: { x: numbers[4], y: numbers[5] },
    end: { x: numbers[6], y: numbers[7] },
  };
}

//============================================
// boundary clipping per shape
//============================================

test("rect clip starts/ends on the box edges, not the centers", () => {
  const from = { x: 0, y: 0, w: 100, h: 40 };
  const to = { x: 300, y: 0, w: 100, h: 40 };
  const geo = edge_path(from, to, "rect", 0);
  const p = parse_path(geo.d);
  // horizontal edge: start exits the right wall of `from` at x = +half_w = 50
  assert.equal(p.start.x, 50);
  assert.equal(p.start.y, 0);
  // end enters the left wall of `to` at x = 300 - 50 = 250
  assert.equal(p.end.x, 250);
  assert.equal(p.end.y, 0);
});

test("oval clip lands on the ellipse boundary along the axis", () => {
  const from = { x: 0, y: 0, w: 100, h: 40 };
  const to = { x: 300, y: 0, w: 100, h: 40 };
  const geo = edge_path(from, to, "oval", 0);
  const p = parse_path(geo.d);
  // along the horizontal axis the ellipse boundary is at half_w just like a rect
  assert.equal(p.start.x, 50);
  assert.equal(p.end.x, 250);
});

test("oval clip differs from rect clip on a diagonal", () => {
  const from = { x: 0, y: 0, w: 100, h: 100 };
  const to = { x: 200, y: 200, w: 100, h: 100 };
  const oval = parse_path(edge_path(from, to, "oval", 0).d);
  const rect = parse_path(edge_path(from, to, "rect", 0).d);
  // rect exits at a corner-ish point; oval exits closer to the center along the
  // ray, so the two start points must not coincide on a 45-degree edge
  assert.notDeepEqual(oval.start, rect.start);
  // oval start is still outside the center and inside the rect corner radius
  const dist = Math.hypot(oval.start.x, oval.start.y);
  assert.ok(dist > 0);
});

test("rounded clip stays within the box half-extents", () => {
  const from = { x: 0, y: 0, w: 100, h: 100 };
  const to = { x: 200, y: 200, w: 100, h: 100 };
  const geo = edge_path(from, to, "rounded", 0);
  const p = parse_path(geo.d);
  // the rounded exit point must not exceed the box boundary on either axis
  assert.ok(Math.abs(p.start.x) <= 50 + 1e-9);
  assert.ok(Math.abs(p.start.y) <= 50 + 1e-9);
});

//============================================
// curvature / bowing
//============================================

test("curvature 0 produces a straight cubic (control points on the line)", () => {
  const from = { x: 0, y: 0, w: 100, h: 40 };
  const to = { x: 300, y: 0, w: 100, h: 40 };
  const p = parse_path(edge_path(from, to, "rect", 0).d);
  // a straight horizontal edge keeps every control point on y = 0
  assert.equal(p.c1.y, 0);
  assert.equal(p.c2.y, 0);
});

test("positive and negative curvature bow to opposite sides", () => {
  const from = { x: 0, y: 0, w: 100, h: 40 };
  const to = { x: 300, y: 0, w: 100, h: 40 };
  const pos = edge_path(from, to, "rect", 0.3);
  const neg = edge_path(from, to, "rect", -0.3);
  // label midpoints sit on opposite sides of the y = 0 axis
  assert.ok(pos.label_y > 0);
  assert.ok(neg.label_y < 0);
  assert.equal(Math.sign(pos.label_y), -Math.sign(neg.label_y));
});

test("label anchor is the curve midpoint t=0.5", () => {
  const from = { x: 0, y: 0, w: 100, h: 40 };
  const to = { x: 300, y: 0, w: 100, h: 40 };
  const geo = edge_path(from, to, "rect", 0);
  // on a straight horizontal edge the midpoint x is halfway between the clipped
  // endpoints (50 and 250) and y stays on the axis
  assert.equal(geo.label_x, 150);
  assert.equal(geo.label_y, 0);
});

test("edge_path exposes the cubic control points (additive field)", () => {
  const from = { x: 0, y: 0, w: 100, h: 40 };
  const to = { x: 300, y: 0, w: 100, h: 40 };
  const geo = edge_path(from, to, "rect", 0);
  // the cubic mirrors the path geometry (unrounded), so callers can sample it.
  // endpoints are exact; controls match the parsed "d" within rounding tolerance.
  const p = parse_path(geo.d);
  assert.equal(geo.cubic.x0, 50);
  assert.equal(geo.cubic.y0, 0);
  assert.equal(geo.cubic.x3, 250);
  assert.equal(geo.cubic.y3, 0);
  assert.ok(Math.abs(geo.cubic.x1 - p.c1.x) < 0.01);
  assert.ok(Math.abs(geo.cubic.x2 - p.c2.x) < 0.01);
});

test("self_loop_path exposes the cubic control points (additive field)", () => {
  const box = { x: 100, y: 100, w: 80, h: 40 };
  const geo = self_loop_path(box, "rect");
  const p = parse_path(geo.d);
  // the cubic mirrors the path (unrounded) so a caller could evaluate any point
  // on the loop; it matches the parsed "d" within rounding tolerance
  assert.ok(Math.abs(geo.cubic.x0 - p.start.x) < 0.01);
  assert.ok(Math.abs(geo.cubic.y0 - p.start.y) < 0.01);
  assert.ok(Math.abs(geo.cubic.x3 - p.end.x) < 0.01);
  assert.ok(Math.abs(geo.cubic.y3 - p.end.y) < 0.01);
});

//============================================
// place_edge_label (uniform maximum-clearance rule)
//============================================

// Build a straight horizontal edge's cubic for placement tests: the curve runs
// along y = 0 from x = 50 to x = 250, midpoint at (150, 0).
function straight_cubic() {
  const from = { x: 0, y: 0, w: 100, h: 40 };
  const to = { x: 300, y: 0, w: 100, h: 40 };
  const geo = edge_path(from, to, "rect", 0);
  return geo.cubic;
}

// Axis-aligned overlap test between a label AABB centered at point with the
// given half extents and a node box (center x/y, full w/h).
function aabb_overlaps(point, half_w, half_h, box) {
  const gap_x = Math.abs(point.x - box.x) - (half_w + box.w / 2);
  const gap_y = Math.abs(point.y - box.y) - (half_h + box.h / 2);
  return gap_x < 0 && gap_y < 0;
}

test("place_edge_label returns the midpoint when the midpoint is clear", () => {
  const cubic = straight_cubic();
  // no obstacles: the center-first sample with strict-greater keeps t = 0.5.
  // straight_cubic() runs from x=50 to x=250 along y=0; midpoint is at (150, 0).
  // Use relational assertions: point lies in the midpoint region of the curve and
  // on the chord axis (y == 0 for a horizontal straight edge).
  const point = place_edge_label(cubic, "make", []);
  // midpoint x is halfway between clipped endpoints 50 and 250
  assert.ok(
    point.x >= cubic.x0 && point.x <= cubic.x3,
    `point x (${point.x}) should lie on the curve between ${cubic.x0} and ${cubic.x3}`,
  );
  // for a clear straight edge the best point is the exact midpoint
  const expected_mid_x = (cubic.x0 + cubic.x3) / 2;
  assert.ok(
    Math.abs(point.x - expected_mid_x) <= 1,
    `point x (${point.x}) should equal midpoint ${expected_mid_x}`,
  );
  // horizontal straight edge: y stays on the chord axis
  assert.equal(point.y, cubic.y0);
});

test("place_edge_label slides off an obstacle straddling the midpoint", () => {
  const cubic = straight_cubic();
  // a small bubble centered on the midpoint blocks t = 0.5; an outward sample on
  // the curve has room to clear it, so the rule must pick a clearing point.
  const obstacle = { x: 150, y: 0, w: 30, h: 30 };
  const point = place_edge_label(cubic, "x", [obstacle]);
  // the chosen point's label AABB clears the obstacle (no overlap). "x" wraps to
  // one short line; use the production constants so the test tracks any sizing change.
  const half_w = (LABEL_CHAR_W_PX * "x".length) / 2 + LABEL_CLEAR_MARGIN_PX;
  const half_h = LABEL_LINE_H_PX / 2 + LABEL_CLEAR_MARGIN_PX;
  const overlaps = aabb_overlaps(point, half_w, half_h, obstacle);
  assert.equal(overlaps, false);
  // and it moved away from the blocked midpoint (relational: x is not the midpoint)
  const mid_x = (cubic.x0 + cubic.x3) / 2;
  assert.notEqual(point.x, mid_x);
});

test("place_edge_label returns the maximum-clearance point when every candidate overlaps", () => {
  const cubic = straight_cubic();
  // a wall covering the entire sampled span both along and just below the curve:
  // every candidate overlaps it, so the rule returns the maximum-clearance (least
  // negative) point deterministically. With the perpendicular freedom the best
  // candidate steps UP, away from the wall below, reducing the overlap depth.
  const wall = { x: 150, y: 200, w: 4000, h: 420 };
  const point = place_edge_label(cubic, "make", [wall]);
  // verify the returned point is in fact the maximum-clearance candidate by
  // re-scoring it against the wall: stepping up gives a larger (less negative)
  // vertical clearance than the on-curve anchor at y = 0.
  const label_half_w = (LABEL_CHAR_W_PX * "make".length) / 2 + LABEL_CLEAR_MARGIN_PX;
  const label_half_h = LABEL_LINE_H_PX / 2 + LABEL_CLEAR_MARGIN_PX;
  function clearance_at(y) {
    const gap_x = Math.abs(150 - wall.x) - (label_half_w + wall.w / 2);
    const gap_y = Math.abs(y - wall.y) - (label_half_h + wall.h / 2);
    return Math.max(gap_x, gap_y);
  }
  // the returned point clears the wall better than the on-curve anchor would
  assert.ok(clearance_at(point.y) >= clearance_at(0));
  // it stayed centered along the curve (x unchanged) and stepped away vertically
  assert.equal(point.x, 150);
  assert.ok(point.y < 0);
});

test("place_edge_label steps perpendicular when the whole curve is blocked along it", () => {
  const cubic = straight_cubic();
  // a thin wall lying ALONG the curve (centered on y = 0, tall enough to cover the
  // small label) blocks every on-curve sample regardless of t, but it is narrow
  // vertically so clear space exists directly above and below. The perpendicular
  // degree of freedom must step the label sideways (off y = 0) into that space.
  const wall = { x: 150, y: 0, w: 4000, h: 8 };
  const point = place_edge_label(cubic, "x", [wall]);
  // "x" wraps to one short line; use production constants so sizing tracks any change
  const half_w = (LABEL_CHAR_W_PX * "x".length) / 2 + LABEL_CLEAR_MARGIN_PX;
  const half_h = LABEL_LINE_H_PX / 2 + LABEL_CLEAR_MARGIN_PX;
  const overlaps = aabb_overlaps(point, half_w, half_h, wall);
  // a sideways (perpendicular) candidate clears the wall: positive clearance
  assert.equal(overlaps, false);
  // the clearing point moved OFF the curve axis (the perpendicular freedom acted)
  assert.notEqual(point.y, 0);
});

test("place_edge_label keeps the on-curve midpoint (no offset) when it is clear", () => {
  const cubic = straight_cubic();
  // clear space everywhere: the centered, no-offset anchor must win, so no
  // gratuitous perpendicular shift is applied.
  // Relational: point is at the curve midpoint and y is on the chord axis.
  const point = place_edge_label(cubic, "make", []);
  const expected_mid_x = (cubic.x0 + cubic.x3) / 2;
  assert.ok(
    Math.abs(point.x - expected_mid_x) <= 1,
    `point x (${point.x}) should equal midpoint ${expected_mid_x}`,
  );
  assert.equal(point.y, cubic.y0);
});

test("place_edge_label prefers the center on a clearance tie", () => {
  const cubic = straight_cubic();
  // two mirror-image obstacles equidistant from the midpoint create a tie
  // between symmetric samples; center-first iteration keeps the midpoint.
  const left = { x: 90, y: 0, w: 20, h: 20 };
  const right = { x: 210, y: 0, w: 20, h: 20 };
  const point = place_edge_label(cubic, "x", [left, right]);
  const expected_mid_x = (cubic.x0 + cubic.x3) / 2;
  assert.ok(
    Math.abs(point.x - expected_mid_x) <= 1,
    `point x (${point.x}) should equal midpoint ${expected_mid_x} on a tie`,
  );
  assert.equal(point.y, cubic.y0);
});

//============================================
// self loop
//============================================

test("self loop path is a valid cubic starting and ending on the node", () => {
  const box = { x: 100, y: 100, w: 80, h: 40 };
  const geo = self_loop_path(box, "rect");
  const p = parse_path(geo.d);
  // path must be a well-formed cubic with all four coordinate pairs present
  assert.match(geo.d, /^M [-\d.]+ [-\d.]+ C /);
  // start and end attach on the top edge (above the center)
  assert.ok(p.start.y <= box.y);
  assert.ok(p.end.y <= box.y);
  // the loop bulges above the box (control points well above the top edge)
  assert.ok(p.c1.y < box.y - box.h / 2);
  assert.ok(p.c2.y < box.y - box.h / 2);
  // label sits up in the bulge, above the node
  assert.ok(geo.label_y < box.y);
});

//============================================
// assign_curvatures
//============================================

test("a lone edge gets curvature 0", () => {
  const curvatures = assign_curvatures([{ id: "e1", from_key: "a", to_key: "b" }]);
  assert.equal(curvatures.get("e1"), 0);
});

test("bidirectional pair bows apart (opposite signs)", () => {
  const curvatures = assign_curvatures([
    { id: "e1", from_key: "a", to_key: "b" },
    { id: "e2", from_key: "b", to_key: "a" },
  ]);
  const a_to_b = curvatures.get("e1");
  const b_to_a = curvatures.get("e2");
  // both are non-zero and have opposite sign so the arrows separate
  assert.notEqual(a_to_b, 0);
  assert.notEqual(b_to_a, 0);
  assert.equal(Math.sign(a_to_b), -Math.sign(b_to_a));
});

test("duplicate same-direction edges fan with increasing magnitude", () => {
  const curvatures = assign_curvatures([
    { id: "e1", from_key: "a", to_key: "b" },
    { id: "e2", from_key: "a", to_key: "b" },
    { id: "e3", from_key: "a", to_key: "b" },
  ]);
  const m1 = Math.abs(curvatures.get("e1"));
  const m2 = Math.abs(curvatures.get("e2"));
  const m3 = Math.abs(curvatures.get("e3"));
  // every duplicate is distinguishable and curvature grows with each one
  assert.ok(m1 > 0);
  assert.ok(m2 > m1);
  assert.ok(m3 > m2);
});

test("duplicates within a bidirectional direction share one sign", () => {
  const curvatures = assign_curvatures([
    { id: "e1", from_key: "a", to_key: "b" },
    { id: "e2", from_key: "a", to_key: "b" },
    { id: "e3", from_key: "b", to_key: "a" },
  ]);
  // both a->b duplicates bow the same way, opposite the b->a edge
  assert.equal(Math.sign(curvatures.get("e1")), Math.sign(curvatures.get("e2")));
  assert.equal(Math.sign(curvatures.get("e1")), -Math.sign(curvatures.get("e3")));
});
