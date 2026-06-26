// Pure edge geometry for the flowchart SVG canvas and image export.
//
// This module is plain TypeScript with zero imports from Solid or the DOM. It
// turns a pair of flow-node boxes into an SVG cubic bezier path clipped to each
// node's shape boundary (flow_edge_path), and routes a loop back-edge as a
// rounded orthogonal path beside the body (back_edge_path).

import type { NodeShape } from "./types.ts";

// A node bounding box. x and y are the CENTER of the box; w and h are full
// width and height. This center-based convention matches how the layout
// adapter and canvas position bubbles.
export interface NodeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// The cubic bezier control points for one edge, in draw order: start (0),
// first control (1), second control (2), end (3). Callers evaluate any point
// along the curve from these so label placement can sample the whole arc.
export interface CubicControlPoints {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
}

// The rendered geometry for one edge: an SVG path "d" string, the curve
// midpoint (t = 0.5) used by self-loops and as the placement tie-break center,
// and the cubic control points so callers can evaluate any point on the curve.
export interface EdgeGeometry {
  d: string;
  label_x: number;
  label_y: number;
  cubic: CubicControlPoints;
}

// A point on the plane, used for clip, midpoint, and label-placement results.
export interface Point {
  x: number;
  y: number;
}

//============================================
// boundary clipping per shape
//============================================
// Find where a ray leaving a box center toward (dir_x, dir_y) crosses the box
// boundary, for a rect shape. Returns the offset point on the boundary. The
// direction vector need not be normalized.
function clip_rect(box: NodeBox, dir_x: number, dir_y: number): Point {
  // half extents of the box
  const half_w = box.w / 2;
  const half_h = box.h / 2;
  // a zero-length direction cannot be clipped; fall back to the center
  if (dir_x === 0 && dir_y === 0) {
    return { x: box.x, y: box.y };
  }
  // scale factor to reach each axis wall; the smaller magnitude wins because
  // the ray exits whichever wall it reaches first
  const scale_x = dir_x === 0 ? Infinity : half_w / Math.abs(dir_x);
  const scale_y = dir_y === 0 ? Infinity : half_h / Math.abs(dir_y);
  const scale = Math.min(scale_x, scale_y);
  // point on the rectangle boundary along the direction ray
  const x = box.x + dir_x * scale;
  const y = box.y + dir_y * scale;
  return { x, y };
}

// Clip a ray to an axis-aligned ellipse (oval shape) inscribed in the box.
// Solving the ellipse equation along the parametric ray gives the scale.
function clip_oval(box: NodeBox, dir_x: number, dir_y: number): Point {
  const half_w = box.w / 2;
  const half_h = box.h / 2;
  if (dir_x === 0 && dir_y === 0) {
    return { x: box.x, y: box.y };
  }
  // normalize the direction onto the unit-circle space of the ellipse, then
  // the scale that satisfies (dx*s/half_w)^2 + (dy*s/half_h)^2 = 1
  const norm_x = dir_x / half_w;
  const norm_y = dir_y / half_h;
  const scale = 1 / Math.sqrt(norm_x * norm_x + norm_y * norm_y);
  const x = box.x + dir_x * scale;
  const y = box.y + dir_y * scale;
  return { x, y };
}

//============================================
// clip_diamond
//============================================
// Clip a ray leaving the box center toward (dir_x, dir_y) to the diamond
// (rotated square / rhombus) inscribed in the box, used by the decision shape.
// The diamond boundary is |x|/half_w + |y|/half_h = 1 in box-local coordinates,
// so the scale that lands the ray on the boundary is the reciprocal of the
// local-space L1 norm of the direction.
function clip_diamond(box: NodeBox, dir_x: number, dir_y: number): Point {
  const half_w = box.w / 2;
  const half_h = box.h / 2;
  // a zero-length direction cannot be clipped; fall back to the center
  if (dir_x === 0 && dir_y === 0) {
    return { x: box.x, y: box.y };
  }
  // L1 norm of the direction in the diamond's normalized space
  const norm = Math.abs(dir_x) / half_w + Math.abs(dir_y) / half_h;
  // guard a degenerate zero norm (cannot happen given the guard above, but keeps
  // the division safe)
  if (norm === 0) {
    return { x: box.x, y: box.y };
  }
  const scale = 1 / norm;
  const x = box.x + dir_x * scale;
  const y = box.y + dir_y * scale;
  return { x, y };
}

//============================================
// clip_flow_boundary
//============================================
// Dispatch to the correct boundary clipper for a flowchart NodeShape, so a flow
// edge attaches on the actual rendered outline rather than the bounding box.
// Terminals (stadium/oval) and connectors (circle) clip to the inscribed
// ellipse; decisions clip to the diamond; every remaining shape (process,
// io/parallelogram, loop/hexagon, subroutine, comment) clips to its bounding
// rectangle, which is exact for rectangles and a close, stable approximation for
// the slanted/angled outlines.
function clip_flow_boundary(box: NodeBox, dir_x: number, dir_y: number, shape: NodeShape): Point {
  if (shape === "terminal" || shape === "connector") {
    return clip_oval(box, dir_x, dir_y);
  }
  if (shape === "decision") {
    return clip_diamond(box, dir_x, dir_y);
  }
  return clip_rect(box, dir_x, dir_y);
}

//============================================
// flow_edge_path
//============================================
// Build the SVG cubic bezier path for a directed FLOW edge between two flow
// nodes that may have DIFFERENT shapes. This is the flowchart analogue of
// edge_path: the straight segment runs center-to-center, but each end is clipped
// to ITS OWN NodeShape boundary (a diamond tail, an oval head, etc.) so the path
// touches each node's real outline. Control points are placed at the one-third
// and two-thirds points and displaced perpendicular by `curvature` (a signed
// fraction of the segment length); a curvature of 0 yields a straight cubic. The
// returned label anchor is the cubic midpoint (t = 0.5); the renderer places any
// True/False branch label relative to it.
export function flow_edge_path(
  from_box: NodeBox,
  to_box: NodeBox,
  from_shape: NodeShape,
  to_shape: NodeShape,
  curvature: number,
): EdgeGeometry {
  // direction from source center to target center
  const dir_x = to_box.x - from_box.x;
  const dir_y = to_box.y - from_box.y;
  // clip each endpoint to its OWN shape boundary (rays point at each other)
  const start = clip_flow_boundary(from_box, dir_x, dir_y, from_shape);
  const end = clip_flow_boundary(to_box, -dir_x, -dir_y, to_shape);
  // segment vector between the two clipped endpoints
  const seg_x = end.x - start.x;
  const seg_y = end.y - start.y;
  const length = Math.hypot(seg_x, seg_y);
  // perpendicular unit vector (rotate segment 90 degrees); guard zero length
  let perp_x = 0;
  let perp_y = 0;
  if (length > 0) {
    perp_x = -seg_y / length;
    perp_y = seg_x / length;
  }
  // perpendicular displacement scales with curvature and segment length so long
  // edges bow proportionally and a curvature of 0 stays straight
  const offset = curvature * length;
  // control points at one-third and two-thirds along the segment, displaced
  const c1_x = start.x + seg_x / 3 + perp_x * offset;
  const c1_y = start.y + seg_y / 3 + perp_y * offset;
  const c2_x = start.x + (seg_x * 2) / 3 + perp_x * offset;
  const c2_y = start.y + (seg_y * 2) / 3 + perp_y * offset;
  // label anchor: evaluate the cubic at t = 0.5
  const mid = cubic_point(start.x, start.y, c1_x, c1_y, c2_x, c2_y, end.x, end.y, 0.5);
  // assemble the SVG path; coordinates are rounded for compact, stable output
  const d = build_cubic_d(start.x, start.y, c1_x, c1_y, c2_x, c2_y, end.x, end.y);
  // control points exposed so callers can evaluate any point along the curve
  const cubic: CubicControlPoints = {
    x0: start.x,
    y0: start.y,
    x1: c1_x,
    y1: c1_y,
    x2: c2_x,
    y2: c2_y,
    x3: end.x,
    y3: end.y,
  };
  return { d, label_x: mid.x, label_y: mid.y, cubic };
}

//============================================
// back-edge routed geometry
//============================================
// A back edge is an orthogonal routed path, not a single cubic, so it returns a
// lighter geometry: just the SVG "d" string plus a label anchor (the midpoint of
// its vertical lane). Back edges carry no branch label, so callers typically use
// only `d`; the anchor is provided for symmetry and any debugging overlay.
export interface RoutedEdgeGeometry {
  d: string;
  label_x: number;
  label_y: number;
}

// Corner radius, in pixels, for the two right-angle turns of a back edge. Small
// enough to stay crisp on short loops, large enough to read as a deliberate
// rounded routing rather than a hard L.
const BACK_EDGE_CORNER_RADIUS_PX = 12;

//============================================
// back_edge_path
//============================================
// Build the routed path for a loop back-edge from the body's last node
// (`from_box`, lower on the page) up to the loop header (`to_box`, higher). The
// path leaves the from-node on the chosen `side`, runs horizontally out to the
// vertical lane at `lane_x`, travels straight up the lane clear of the loop body,
// then turns back in to enter the header on the same side. The two turns are
// rounded by BACK_EDGE_CORNER_RADIUS_PX. The caller (edge_routing.route_back_edge)
// chooses `side` and `lane_x` so the lane clears every body node; this function
// only realizes that decision as an SVG path.
//
// Attachment is at each node's side midpoint, which is exactly the left/right
// vertex of a diamond or hexagon and the side-center of a rectangle, so the path
// meets every loop-relevant shape on its true outline without needing the shape.
export function back_edge_path(
  from_box: NodeBox,
  to_box: NodeBox,
  side: "left" | "right",
  lane_x: number,
): RoutedEdgeGeometry {
  // -1 routes out the left side, +1 out the right side
  const sign = side === "left" ? -1 : 1;
  // exit the body node at its side midpoint
  const exit_point: Point = { x: from_box.x + (sign * from_box.w) / 2, y: from_box.y };
  // enter the header at its side midpoint on the same side
  const entry_point: Point = { x: to_box.x + (sign * to_box.w) / 2, y: to_box.y };
  // the two lane corners: out at the body's height, then up at the header's height
  const lane_bottom: Point = { x: lane_x, y: exit_point.y };
  const lane_top: Point = { x: lane_x, y: entry_point.y };
  // round the two right-angle turns into a smooth routed path
  const d = rounded_orthogonal_d(
    exit_point,
    lane_bottom,
    lane_top,
    entry_point,
    BACK_EDGE_CORNER_RADIUS_PX,
  );
  // label anchor: the midpoint of the vertical lane segment
  const label_x = lane_x;
  const label_y = (exit_point.y + entry_point.y) / 2;
  return { d, label_x, label_y };
}

//============================================
// helpers
//============================================
// Evaluate a cubic bezier at parameter t, returning the point on the curve.
// Exported so the post-dagre routing layer can sample any edge's curve without
// duplicating the Bernstein evaluation.
export function cubic_point(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  t: number,
): Point {
  // complementary parameter and the Bernstein weights
  const mt = 1 - t;
  const w0 = mt * mt * mt;
  const w1 = 3 * mt * mt * t;
  const w2 = 3 * mt * t * t;
  const w3 = t * t * t;
  const x = w0 * x0 + w1 * x1 + w2 * x2 + w3 * x3;
  const y = w0 * y0 + w1 * y1 + w2 * y2 + w3 * y3;
  return { x, y };
}

//============================================
// rounded_orthogonal_d
//============================================
// Assemble an SVG path "d" string for a 4-point orthogonal polyline
// (p0 -> c1 -> c2 -> p3) whose two interior corners (c1, c2) are rounded by up
// to `radius`. Each corner is replaced by a straight run that stops `r` short of
// the corner, a quadratic curve through the corner, and a straight run leaving
// `r` past it. The radius is clamped per corner to half the shorter adjacent
// segment so it never overshoots a short leg. Used by back_edge_path; kept here
// with the other path assembly helpers.
function rounded_orthogonal_d(p0: Point, c1: Point, c2: Point, p3: Point, radius: number): string {
  // first corner (c1): clamp radius to half its two adjacent legs
  const r1 = Math.min(radius, distance(p0, c1) / 2, distance(c1, c2) / 2);
  const c1_before = point_toward(c1, p0, r1);
  const c1_after = point_toward(c1, c2, r1);
  // second corner (c2): same clamp against its adjacent legs
  const r2 = Math.min(radius, distance(c1, c2) / 2, distance(c2, p3) / 2);
  const c2_before = point_toward(c2, c1, r2);
  const c2_after = point_toward(c2, p3, r2);
  const parts = [
    "M",
    fmt(p0.x),
    fmt(p0.y),
    "L",
    fmt(c1_before.x),
    fmt(c1_before.y),
    "Q",
    fmt(c1.x),
    fmt(c1.y),
    fmt(c1_after.x),
    fmt(c1_after.y),
    "L",
    fmt(c2_before.x),
    fmt(c2_before.y),
    "Q",
    fmt(c2.x),
    fmt(c2.y),
    fmt(c2_after.x),
    fmt(c2_after.y),
    "L",
    fmt(p3.x),
    fmt(p3.y),
  ];
  const d = parts.join(" ");
  return d;
}

//============================================
// point_toward / distance
//============================================
// The straight-line distance between two points.
function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// A point `dist` pixels from `from` along the direction toward `to`. A zero-length
// segment has no direction, so the origin is returned unchanged.
function point_toward(from: Point, to: Point, dist: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return { x: from.x, y: from.y };
  }
  const x = from.x + (dx / length) * dist;
  const y = from.y + (dy / length) * dist;
  return { x, y };
}

// Assemble an SVG cubic path "d" string from start, two control points, and end.
function build_cubic_d(
  sx: number,
  sy: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  ex: number,
  ey: number,
): string {
  const parts = [
    "M",
    fmt(sx),
    fmt(sy),
    "C",
    fmt(c1x),
    fmt(c1y),
    fmt(c2x),
    fmt(c2y),
    fmt(ex),
    fmt(ey),
  ];
  const d = parts.join(" ");
  return d;
}

// Format a coordinate for an SVG path: round to two decimals and drop a
// trailing ".00" so integer coordinates print cleanly and output is stable.
function fmt(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}
