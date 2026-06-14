// Pure edge geometry for the concept map SVG canvas and image export.
//
// This module is plain TypeScript with zero imports from Solid or the DOM. It
// turns a pair of node boxes into an SVG cubic bezier path clipped to each
// node's boundary, places the verb label by the uniform maximum-clearance rule
// along the curve, draws valid self-loop arcs, and assigns curvature so
// bidirectional pairs bow apart and duplicate same-direction edges fan out.

import type { ThemeShape } from "./types.ts";
import { wrap_verb_label, label_box, LABEL_CLEAR_MARGIN_PX, LABEL_LINE_H_PX } from "./label_wrap";

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

// A directed edge identity used only for curvature assignment.
export interface EdgeTriple {
  id: string;
  from_key: string;
  to_key: string;
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

// Intersect a ray (origin ox,oy, direction dx,dy) with a circle (center cx,cy,
// radius r). Returns the far intersection point in the ray direction, or null
// if there is none.
function ray_circle_hit(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  r: number,
): Point | null {
  // vector from circle center to ray origin
  const fx = ox - cx;
  const fy = oy - cy;
  // quadratic coefficients for |origin + t*dir - center|^2 = r^2
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0 || a === 0) {
    return null;
  }
  const root = Math.sqrt(discriminant);
  // take the larger root so we land on the outward-facing side of the arc
  const t = (-b + root) / (2 * a);
  if (t < 0) {
    return null;
  }
  const x = ox + dx * t;
  const y = oy + dy * t;
  return { x, y };
}

// Clip a ray to a rounded rectangle. The exit point is the rect clip pulled
// inward at the corners by the corner radius. A simple and robust approach:
// clip to the rect, then if the exit point lands in a corner quadrant, pull it
// onto the corner arc. corner radius is clamped to half the smaller side so it
// never inverts the box.
function clip_rounded(box: NodeBox, dir_x: number, dir_y: number): Point {
  const rect_point = clip_rect(box, dir_x, dir_y);
  const half_w = box.w / 2;
  const half_h = box.h / 2;
  // corner radius: a fixed size, clamped so it never exceeds either half-extent
  const radius = Math.min(12, half_w, half_h);
  // local coordinates of the rect exit point relative to the box center
  const local_x = rect_point.x - box.x;
  const local_y = rect_point.y - box.y;
  // the corner region begins beyond (half - radius) on both axes
  const inner_x = half_w - radius;
  const inner_y = half_h - radius;
  // only adjust when the exit point sits in a rounded corner quadrant
  if (Math.abs(local_x) <= inner_x || Math.abs(local_y) <= inner_y) {
    return rect_point;
  }
  // center of the relevant corner arc, in world coordinates
  const corner_cx = box.x + Math.sign(local_x) * inner_x;
  const corner_cy = box.y + Math.sign(local_y) * inner_y;
  // re-clip the original direction ray to the corner circle of the arc
  const hit = ray_circle_hit(box.x, box.y, dir_x, dir_y, corner_cx, corner_cy, radius);
  // if the ray misses the corner circle, keep the rect clip as a safe fallback
  if (hit === null) {
    return rect_point;
  }
  return hit;
}

// Dispatch to the correct boundary clipper for a shape.
function clip_boundary(box: NodeBox, dir_x: number, dir_y: number, shape: ThemeShape): Point {
  if (shape === "oval") {
    return clip_oval(box, dir_x, dir_y);
  }
  if (shape === "rounded") {
    return clip_rounded(box, dir_x, dir_y);
  }
  return clip_rect(box, dir_x, dir_y);
}

//============================================
// edge_path
//============================================
// Build the SVG cubic bezier path for a directed edge between two node boxes.
//
// The straight segment runs from from_box center to to_box center; each end is
// clipped to its box boundary so the path starts and ends on the bubble edges.
// Control points are placed at the one-third and two-thirds points of the
// clipped segment, then displaced perpendicular to the segment by `curvature`
// (a signed fraction of the segment length) so the curve bows. A curvature of 0
// produces a straight cubic. The label anchor is the cubic's midpoint (t=0.5).
export function edge_path(
  from_box: NodeBox,
  to_box: NodeBox,
  shape: ThemeShape,
  curvature: number,
): EdgeGeometry {
  // direction from source center to target center
  const dir_x = to_box.x - from_box.x;
  const dir_y = to_box.y - from_box.y;
  // clip each endpoint to its own box boundary (rays point at each other)
  const start = clip_boundary(from_box, dir_x, dir_y, shape);
  const end = clip_boundary(to_box, -dir_x, -dir_y, shape);
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
  // perpendicular displacement scales with both curvature and segment length so
  // long edges bow proportionally and a curvature of 0 stays straight
  const offset = curvature * length;
  // control points at one-third and two-thirds along the segment, displaced
  const c1_x = start.x + seg_x / 3 + perp_x * offset;
  const c1_y = start.y + seg_y / 3 + perp_y * offset;
  const c2_x = start.x + (seg_x * 2) / 3 + perp_x * offset;
  const c2_y = start.y + (seg_y * 2) / 3 + perp_y * offset;
  // label anchor: evaluate the cubic at t = 0.5
  const mid = cubic_point(start.x, start.y, c1_x, c1_y, c2_x, c2_y, end.x, end.y, 0.5);
  // assemble the SVG path; round coordinates to keep output compact and stable
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
// self_loop_path
//============================================
// Build a self-loop arc for an edge whose source and target are the same node.
// The loop leaves the top of the box, bulges up and to the side, and returns to
// the top, forming a closed-looking cubic. The label sits at the top of the
// bulge (curve midpoint, t = 0.5).
export function self_loop_path(box: NodeBox, shape: ThemeShape): EdgeGeometry {
  const half_w = box.w / 2;
  const half_h = box.h / 2;
  // loop size relative to the box so it stays visible on small and large nodes
  const loop = Math.max(half_h, 24);
  // two attachment points on the top edge, offset left and right of center;
  // clip each so oval/rounded shapes attach on the curved boundary
  const start = clip_boundary(box, -half_w * 0.5, -half_h, shape);
  const end = clip_boundary(box, half_w * 0.5, -half_h, shape);
  // control points pushed up and outward to form the loop bulge
  const c1_x = box.x - half_w - loop;
  const c1_y = box.y - half_h - loop * 2;
  const c2_x = box.x + half_w + loop;
  const c2_y = box.y - half_h - loop * 2;
  // label anchor at the top of the bulge (cubic midpoint)
  const mid = cubic_point(start.x, start.y, c1_x, c1_y, c2_x, c2_y, end.x, end.y, 0.5);
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
// place_edge_label
//============================================
// The fixed parameter samples along the curve, center-first then symmetric
// outward. Center-first ordering plus a strict-greater comparison in the search
// makes t = 0.5 the natural winner whenever it is clear, and ties resolve toward
// the center. The list is the placement contract: callers must not reorder it.
const LABEL_SAMPLE_TS: number[] = [
  0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8,
];

// The perpendicular degree of freedom for label placement, in pixels measured
// along the curve's unit normal at each sampled t. Zero (no sideways shift) is
// first so a centered, on-curve point wins any clearance tie; the symmetric
// offsets step the label modestly to either side so near-parallel sibling labels
// can separate into clear space while staying visually attached to their edge.
// Magnitudes are small multiples of the label line height to keep that
// attachment. This list is the placement contract alongside LABEL_SAMPLE_TS:
// callers must not reorder it (zero-first preserves the no-offset preference).
const LABEL_NORMAL_OFFSETS_PX: number[] = [
  0,
  LABEL_LINE_H_PX,
  -LABEL_LINE_H_PX,
  1.6 * LABEL_LINE_H_PX,
  -1.6 * LABEL_LINE_H_PX,
];

// Signed clearance between two axis-aligned boxes centered at (ax, ay) and
// (bx, by) with the given half extents. Positive means the boxes are fully
// clear by that many pixels (separated on at least one axis); negative means
// they overlap, and the magnitude is how deep the overlap is. Two AABBs are
// disjoint exactly when they are separated on either axis, so the signed
// clearance is the larger of the two per-axis gaps.
function box_clearance(
  ax: number,
  ay: number,
  a_half_w: number,
  a_half_h: number,
  bx: number,
  by: number,
  b_half_w: number,
  b_half_h: number,
): number {
  // per-axis gap between the box edges: positive = a wall-to-wall gap exists
  const gap_x = Math.abs(ax - bx) - (a_half_w + b_half_w);
  const gap_y = Math.abs(ay - by) - (a_half_h + b_half_h);
  // boxes clear when separated on either axis, so the wider gap governs
  const clearance = Math.max(gap_x, gap_y);
  return clearance;
}

// Worst (minimum) clearance of a label AABB, centered at (px, py) with the given
// half extents, against every obstacle box. An empty obstacle set is fully clear
// (+Infinity). This is the same per-point scoring place_edge_label uses for its
// candidate search, exposed so the lane-aware layout can reuse one clearance rule
// rather than re-deriving the AABB math. Pure: no DOM or Solid imports.
export function label_min_clearance(
  px: number,
  py: number,
  label_half_w: number,
  label_half_h: number,
  obstacles: NodeBox[],
): number {
  let worst_clearance = Infinity;
  for (const box of obstacles) {
    const clearance = box_clearance(
      px,
      py,
      label_half_w,
      label_half_h,
      box.x,
      box.y,
      box.w / 2,
      box.h / 2,
    );
    if (clearance < worst_clearance) {
      worst_clearance = clearance;
    }
  }
  return worst_clearance;
}

// Place a verb label near its edge curve by one uniform rule: choose the point
// with the maximum clearance from all obstacles, tie-broken toward the centered,
// on-curve anchor (t = 0.5, no sideways shift). This is a single placement rule
// applied to every label, not a midpoint with a conditional escape: the label
// AABB is scored at each candidate point, and the point whose worst (minimum)
// clearance against all obstacles is largest wins.
//
// The candidate set has two degrees of freedom: an ALONG-curve parameter t (the
// LABEL_SAMPLE_TS list) crossed with a PERPENDICULAR offset (LABEL_NORMAL_OFFSETS_PX)
// measured along the curve's unit normal at that t. The along-curve freedom alone
// cannot separate near-parallel sibling edges, because every on-curve sample of
// both edges lands in the same narrow zone; the perpendicular freedom lets a
// crowded label step sideways into clear space while staying attached to its edge.
// Both lists are iterated centered-first (t = 0.5 and offset 0 first) with a
// strict-greater comparison, so the centered, on-curve point wins whenever it is
// clear and ties resolve toward it -- one uniform max-clearance rule over a small
// 2D candidate set. dagre's edge-label sizing spreads the bubbles to create the
// clear room; this rule places the label into it.
//
// Override-aware: obstacles are the live rendered node boxes, so a dragged
// bubble shifts the obstacle set and the label re-places on the next render.
//
// Pure: no DOM or Solid imports. The label size comes from the shared
// label_wrap module so the wrap math and the placement math cannot drift.
export function place_edge_label(
  cubic: CubicControlPoints,
  verb: string,
  obstacles: NodeBox[],
): Point {
  // wrapped label dimensions plus a small clearance margin form the label AABB
  const lines = wrap_verb_label(verb);
  const size = label_box(lines);
  const label_half_w = size.width / 2 + LABEL_CLEAR_MARGIN_PX;
  const label_half_h = size.height / 2 + LABEL_CLEAR_MARGIN_PX;
  // track the best point seen: center-first iteration plus strict-greater means
  // the most central maximum-clearance point wins any tie
  let best_point = cubic_point(
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
  let best_score = -Infinity;
  // iterate the 2D candidate set: each along-curve sample t crossed with each
  // perpendicular offset. t-first then offset-inner keeps the centered, no-offset
  // anchor (t = 0.5, offset 0) the first candidate evaluated.
  for (const t of LABEL_SAMPLE_TS) {
    // base point on the curve at this parameter
    const base = cubic_point(
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
    // unit normal at this t gives the sideways direction for the perpendicular
    // offsets; a degenerate tangent yields a zero normal, collapsing every offset
    // at this t to the base point (no spurious sideways jump)
    const normal = cubic_normal(
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
    for (const offset of LABEL_NORMAL_OFFSETS_PX) {
      // candidate point = on-curve base shifted sideways along the unit normal
      const point = {
        x: base.x + normal.x * offset,
        y: base.y + normal.y * offset,
      };
      // the candidate's score is its worst (minimum) clearance over all obstacles;
      // an empty obstacle set leaves the score fully clear (+Infinity)
      const worst_clearance = label_min_clearance(
        point.x,
        point.y,
        label_half_w,
        label_half_h,
        obstacles,
      );
      // strict greater keeps the earlier (more central, less offset) point on a tie
      if (worst_clearance > best_score) {
        best_score = worst_clearance;
        best_point = point;
      }
    }
  }
  return best_point;
}

//============================================
// assign_curvatures
//============================================
// Decide a signed curvature for every edge so the rendered map stays readable:
//
// - A lone edge between two concepts gets curvature 0 (straight).
// - A bidirectional pair (A->B and B->A) gets opposite-sign curvature so the
//   two arrows bow to opposite sides and never overlap.
// - Duplicate same-direction edges (multiple A->B) fan out with progressively
//   larger curvature so each is distinguishable.
//
// Returns a map from edge id to curvature.
export function assign_curvatures(triples: EdgeTriple[]): Map<string, number> {
  // base step between fanned duplicates / bidirectional separation
  const step = 0.2;
  const result = new Map<string, number>();
  // group edges by their directed (from -> to) identity so duplicates cluster
  const by_direction = new Map<string, EdgeTriple[]>();
  for (const triple of triples) {
    const dir_key = triple.from_key + " " + triple.to_key;
    const bucket = by_direction.get(dir_key);
    if (bucket === undefined) {
      by_direction.set(dir_key, [triple]);
    } else {
      bucket.push(triple);
    }
  }
  for (const bucket of by_direction.values()) {
    // every edge in a bucket shares one direction, so read the keys off the
    // first edge rather than splitting the composite key (keys may contain
    // spaces, so a space separator would be ambiguous)
    const first = bucket[0];
    if (first === undefined) {
      continue;
    }
    const from_key = first.from_key;
    const to_key = first.to_key;
    // a reverse edge exists when the opposite direction is also present
    const reverse_key = to_key + " " + from_key;
    const has_reverse = by_direction.has(reverse_key);
    // sign separates the two halves of a bidirectional pair deterministically:
    // the direction whose from_key sorts first bows positive, the other negative
    let base_sign = 1;
    if (has_reverse) {
      base_sign = from_key < to_key ? 1 : -1;
    }
    // single edge with no reverse and no duplicates -> perfectly straight
    if (!has_reverse && bucket.length === 1) {
      result.set(first.id, 0);
      continue;
    }
    // fan the bucket: first edge sits at the base offset, each duplicate adds a
    // step, all sharing the same sign so a bidirectional pair stays on its side
    for (let index = 0; index < bucket.length; index += 1) {
      const edge = bucket[index];
      if (edge === undefined) {
        continue;
      }
      const magnitude = step * (index + 1);
      result.set(edge.id, base_sign * magnitude);
    }
  }
  return result;
}

//============================================
// helpers
//============================================
// Evaluate a cubic bezier at parameter t, returning the point on the curve.
// Exported so the post-dagre routing layer can sample any edge's curve without
// duplicating the Bernstein evaluation; edge_path behavior is unchanged.
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

// Evaluate the cubic bezier derivative (dP/dt) at parameter t, returning the
// tangent vector. This is the analytic derivative of the Bernstein form, so it
// points along the curve in the direction of increasing t. The vector is NOT
// normalized; callers that need a unit direction divide by its length.
function cubic_tangent(
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
  // complementary parameter
  const mt = 1 - t;
  // derivative weights: dP/dt = 3*(mt^2*(P1-P0) + 2*mt*t*(P2-P1) + t^2*(P3-P2))
  const w0 = 3 * mt * mt;
  const w1 = 6 * mt * t;
  const w2 = 3 * t * t;
  const x = w0 * (x1 - x0) + w1 * (x2 - x1) + w2 * (x3 - x2);
  const y = w0 * (y1 - y0) + w1 * (y2 - y1) + w2 * (y3 - y2);
  return { x, y };
}

// Unit normal of the cubic at parameter t: rotate the unit tangent 90 degrees,
// (tx, ty) -> (-ty, tx). This is the perpendicular (sideways) direction the
// label placement uses for its perpendicular degree of freedom. A zero-length
// tangent (degenerate curve at this t) has no defined perpendicular, so the
// helper returns a zero vector and the caller's offset collapses to no shift.
function cubic_normal(
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
  const tangent = cubic_tangent(x0, y0, x1, y1, x2, y2, x3, y3, t);
  const length = Math.hypot(tangent.x, tangent.y);
  // guard a degenerate tangent: no perpendicular is defined, so emit zero
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  // unit perpendicular: rotate the unit tangent by 90 degrees
  const x = -tangent.y / length;
  const y = tangent.x / length;
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
