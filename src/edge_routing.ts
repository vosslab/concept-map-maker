// edge_routing.ts -- post-dagre bypass-edge clearance layer.
//
// WHY THIS LAYER EXISTS
// dagre owns the hierarchy: it assigns ranks and node positions. It does NOT
// model the RENDERED geometry of an edge -- the curved bezier, the arrowhead, or
// the label/bubble rectangles. So dagre can place node B directly on the straight
// line between A and C, and the A->C edge, drawn straight, would pass right
// through B. This module is the post-dagre stage that detects that case and bends
// the A->C edge so it bulges AROUND the intervening node.
//
// REALIZATION: CURVATURE BULGE (not orthogonal routing)
// The map's aesthetic is curved edges, and edge_path already turns a signed
// curvature into a perpendicular bow. So a bypass is realized by CHOOSING a
// curvature large enough to clear the obstacle, reusing the existing bezier +
// curvature machinery rather than introducing a separate orthogonal router.
// Nodes are NEVER moved here -- only the edge curvature changes.
//
// GENERAL, NOT SPECIAL-CASED
// This is general bypass-edge clearance geometry. Every edge is tested against
// every non-endpoint node box. There is no per-edge or per-fixture special case.
//
// COLLISION TEST IS ON THE ACTUAL ROUTED CURVE
// Curvature only displaces the control points; the rendered curve is the bezier,
// which lies between the chord and the control polygon. So clearance is tested by
// SAMPLING the cubic at CURVE_SAMPLES points and checking the sampled polyline
// against each obstacle, not by testing only the midpoint or a control point.
//
// DETERMINISTIC: stable input-order iteration, deterministic tie-breaks, and no
// Math.random / Date. The same input always yields the same map.
//
// PURE: zero DOM or Solid imports. Imports only the geometry module.

import type { ThemeShape } from "./types.ts";
import type { NodeBox, Point } from "./edge_geometry";
import { edge_path, cubic_point } from "./edge_geometry";

// Extra space, in pixels, an obstacle node must keep between itself and any
// routed edge that is not attached to it. Obstacle rects are inflated by this
// amount, and a routed curve must clear an inflated rect by this same margin.
// 20px gives a visually clear gap so bypass edges bulge noticeably around
// intermediate bubbles rather than just grazing their labels.
export const NODE_CLEARANCE_PX = 20;

// Ascending bulge offsets, in pixels, tried in order when an edge collides. Each
// offset is the approximate perpendicular displacement of the curve midpoint the
// candidate curvature should produce. The search prefers the SMALLEST offset
// that clears, so an edge bows just enough. 96 is the cap: the wider range
// lets the search find a sufficient bulge when the larger clearance demands it.
const CANDIDATE_OFFSETS_PX = [24, 36, 48, 64, 80, 96];

// Number of points sampled along the cubic when testing clearance. The sampled
// polyline approximates the rendered curve; 24 segments is fine for the smooth
// low-curvature arcs this layer produces.
export const CURVE_SAMPLES = 24;

// Hard cap on curvature magnitude. edge_path multiplies curvature by segment
// length, so a fixed cap keeps a very short edge from bowing absurdly far.
// 1.0 allows the larger offsets from CANDIDATE_OFFSETS_PX to be realized on
// longer bypass spans without being clamped.
export const MAX_CURVATURE = 1.0;

// edge_path displaces both control points by curvature*length perpendicular to
// the chord. The rendered curve midpoint moves about three quarters of that
// control displacement, so to make the midpoint bulge ~offset pixels the needed
// curvature is offset / (0.75 * length). This factor inverts that relationship.
const MIDPOINT_DISPLACEMENT_FACTOR = 0.75;

// The minimal per-edge input the routing pass needs. id keys the returned map;
// from_box/to_box drive edge_path; is_self_loop edges keep their base curvature.
export interface RouteEdge {
  id: string;
  from_key: string;
  to_key: string;
  from_box: NodeBox;
  to_box: NodeBox;
  is_self_loop: boolean;
}

//============================================
// inflate_box
//============================================
// Return an obstacle rect grown by `clearance` on every side. Inflating the
// obstacle (rather than fattening the curve) is the standard way to enforce a
// minimum gap: a point outside the inflated rect is at least `clearance` away
// from the original rect on the dominant axis.
function inflate_box(box: NodeBox, clearance: number): NodeBox {
  const inflated: NodeBox = {
    x: box.x,
    y: box.y,
    w: box.w + 2 * clearance,
    h: box.h + 2 * clearance,
  };
  return inflated;
}

//============================================
// point_in_box
//============================================
// True when a point lies inside (or on the boundary of) an axis-aligned box.
function point_in_box(point: Point, box: NodeBox): boolean {
  const half_w = box.w / 2;
  const half_h = box.h / 2;
  const inside_x = Math.abs(point.x - box.x) <= half_w;
  const inside_y = Math.abs(point.y - box.y) <= half_h;
  return inside_x && inside_y;
}

//============================================
// segment_box_overlap
//============================================
// True when the line segment p0->p1 intersects the axis-aligned box. Uses the
// slab (Liang-Barsky style) clip: the segment is parameterized as p0 + t*(p1-p0)
// for t in [0,1], and the entry/exit t-values against the box's x and y slabs
// are intersected. An overlapping interval means the segment crosses the box.
function segment_box_overlap(p0: Point, p1: Point, box: NodeBox): boolean {
  // either endpoint inside the box is an immediate hit
  if (point_in_box(p0, box) || point_in_box(p1, box)) {
    return true;
  }
  const min_x = box.x - box.w / 2;
  const max_x = box.x + box.w / 2;
  const min_y = box.y - box.h / 2;
  const max_y = box.y + box.h / 2;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  // running entry/exit parameters along the segment
  let t_enter = 0;
  let t_exit = 1;
  // clip the segment against the x slab then the y slab; each pass narrows the
  // [t_enter, t_exit] window and an empty window means no crossing
  const slabs = [
    { origin: p0.x, delta: dx, low: min_x, high: max_x },
    { origin: p0.y, delta: dy, low: min_y, high: max_y },
  ];
  for (const slab of slabs) {
    if (slab.delta === 0) {
      // segment is parallel to this slab: a miss only if it starts outside it
      if (slab.origin < slab.low || slab.origin > slab.high) {
        return false;
      }
      continue;
    }
    // parameter values where the segment crosses the two slab walls
    let t0 = (slab.low - slab.origin) / slab.delta;
    let t1 = (slab.high - slab.origin) / slab.delta;
    // order so t0 is the entry and t1 the exit for this slab
    if (t0 > t1) {
      const swap = t0;
      t0 = t1;
      t1 = swap;
    }
    // intersect this slab's window with the running window
    if (t0 > t_enter) {
      t_enter = t0;
    }
    if (t1 < t_exit) {
      t_exit = t1;
    }
    // empty window means the segment never spans both slabs at once -> no hit
    if (t_enter > t_exit) {
      return false;
    }
  }
  return true;
}

//============================================
// segment_or_polyline_clears
//============================================
// True when EVERY segment of the polyline `points` stays out of `rect`, where
// `rect` is the ORIGINAL (uninflated) obstacle and `clearance` is the required
// gap. The rect is inflated here, so "clears" means clears by `clearance`. A
// single point (length 1) is a degenerate polyline tested as point-in-box.
// Exported so tests assert clearance on the same geometry the pass uses.
export function segment_or_polyline_clears(
  points: Point[],
  rect: NodeBox,
  clearance: number,
): boolean {
  const inflated = inflate_box(rect, clearance);
  // a lone point: clear iff it sits outside the inflated rect
  if (points.length === 1) {
    const only = points[0];
    if (only === undefined) {
      return true;
    }
    return !point_in_box(only, inflated);
  }
  // every consecutive segment must miss the inflated rect
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (a === undefined || b === undefined) {
      continue;
    }
    if (segment_box_overlap(a, b, inflated)) {
      return false;
    }
  }
  return true;
}

//============================================
// sample_curve
//============================================
// Sample a candidate edge curve into a polyline of CURVE_SAMPLES+1 points by
// evaluating the cubic at evenly spaced t in [0, 1]. This polyline is the
// corridor tested for clearance -- the actual routed curve, not the chord.
function sample_curve(
  from_box: NodeBox,
  to_box: NodeBox,
  shape: ThemeShape,
  curvature: number,
): Point[] {
  const geometry = edge_path(from_box, to_box, shape, curvature);
  const cubic = geometry.cubic;
  const points: Point[] = [];
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

//============================================
// chord_length
//============================================
// The straight-line distance between two node-box centers. Used to convert a
// pixel bulge offset into a curvature magnitude (edge_path scales curvature by
// the clipped segment length, and the center distance is a close, stable proxy).
function chord_length(from_box: NodeBox, to_box: NodeBox): number {
  const dx = to_box.x - from_box.x;
  const dy = to_box.y - from_box.y;
  const length = Math.hypot(dx, dy);
  return length;
}

//============================================
// curvature_for_offset
//============================================
// Convert a desired pixel bulge into a signed curvature, clamped to MAX_CURVATURE.
// magnitude ~= offset / (0.75 * length) inverts edge_path's midpoint displacement.
function curvature_for_offset(offset: number, length: number, sign: number): number {
  // a degenerate zero-length chord cannot bow; return zero so it stays straight
  if (length <= 0) {
    return 0;
  }
  const raw = offset / (MIDPOINT_DISPLACEMENT_FACTOR * length);
  const clamped = Math.min(raw, MAX_CURVATURE);
  return sign * clamped;
}

//============================================
// obstacles_for_edge
//============================================
// Every node box the edge must avoid: all boxes EXCEPT the edge's own from and
// to. Endpoints are allowed to touch the edge (it attaches to them); only
// intermediate nodes are obstacles. Iterated in the map's stable insertion order
// so the pass is deterministic.
function obstacles_for_edge(edge: RouteEdge, node_boxes_by_key: Map<string, NodeBox>): NodeBox[] {
  const obstacles: NodeBox[] = [];
  for (const [key, box] of node_boxes_by_key) {
    if (key === edge.from_key || key === edge.to_key) {
      continue;
    }
    obstacles.push(box);
  }
  return obstacles;
}

//============================================
// curve_clears_all
//============================================
// True when the sampled polyline clears every obstacle by NODE_CLEARANCE_PX.
function curve_clears_all(curve: Point[], obstacles: NodeBox[]): boolean {
  for (const obstacle of obstacles) {
    if (!segment_or_polyline_clears(curve, obstacle, NODE_CLEARANCE_PX)) {
      return false;
    }
  }
  return true;
}

//============================================
// total_violation
//============================================
// Sum, over all obstacles, of how many sample points fall inside the inflated
// obstacle rect. Used only by the density fallback to pick the least-bad
// candidate when nothing fully clears. Lower is better; zero means clear.
function total_violation(curve: Point[], obstacles: NodeBox[]): number {
  let count = 0;
  for (const obstacle of obstacles) {
    const inflated = inflate_box(obstacle, NODE_CLEARANCE_PX);
    for (const point of curve) {
      if (point_in_box(point, inflated)) {
        count += 1;
      }
    }
  }
  return count;
}

//============================================
// sign_search_order
//============================================
// The order of bulge signs to try. When the base curvature is nonzero its sign
// is tried first, preserving the bidirectional/duplicate fanning that
// assign_curvatures established. A straight base edge tries + then -. The order
// is deterministic for a given base.
function sign_search_order(base_curvature: number): number[] {
  if (base_curvature > 0) {
    return [1, -1];
  }
  if (base_curvature < 0) {
    return [-1, 1];
  }
  return [1, -1];
}

//============================================
// route_one_edge
//============================================
// Decide the effective curvature for a single colliding edge. Searches sign
// (base sign first) crossed with ascending bulge offsets, and returns the FIRST
// (smallest-offset) candidate whose sampled curve clears every obstacle.
//
// COMPLEXITY / DENSITY FALLBACK: if neither side clears within the offset cap,
// no node is moved and no unbounded search runs. The candidate with the smallest
// total violation is returned as a clamped (<= MAX_CURVATURE) best-effort value.
// This is the density seam: a node packed so tightly that no bounded bulge clears
// it would need a wider reroute or local node expansion, which is future work.
function route_one_edge(
  edge: RouteEdge,
  obstacles: NodeBox[],
  base_curvature: number,
  shape: ThemeShape,
): number {
  const length = chord_length(edge.from_box, edge.to_box);
  const signs = sign_search_order(base_curvature);
  // track the least-bad candidate for the density fallback; tie-break by smaller
  // magnitude so the fallback stays as gentle as possible
  let best_curvature = base_curvature;
  let best_violation = Infinity;
  for (const sign of signs) {
    for (const offset of CANDIDATE_OFFSETS_PX) {
      const candidate = curvature_for_offset(offset, length, sign);
      const curve = sample_curve(edge.from_box, edge.to_box, shape, candidate);
      // first clearing candidate wins: ascending offsets => smallest bulge
      if (curve_clears_all(curve, obstacles)) {
        return candidate;
      }
      // otherwise remember it if it is the least-bad seen so far
      const violation = total_violation(curve, obstacles);
      if (violation < best_violation) {
        best_violation = violation;
        best_curvature = candidate;
      }
    }
  }
  // density seam: nothing cleared within the cap; return the least-bad bulge
  return best_curvature;
}

//============================================
// compute_route_curvatures
//============================================
// The routing pass. For every edge:
//   - self-loops keep their base curvature (no straight corridor to bypass);
//   - an edge whose curve hits no non-endpoint obstacle keeps its base curvature
//     (lone straight edges and clear fans are untouched);
//   - a colliding edge is routed to the smallest bulge that clears, base sign
//     first, with the documented density fallback if nothing clears.
//
// Returns a fresh map from edge id to effective curvature. Edges are iterated in
// input order and the obstacle set is read in the node map's insertion order, so
// the result is deterministic.
export function compute_route_curvatures(
  edges: RouteEdge[],
  node_boxes_by_key: Map<string, NodeBox>,
  shape: ThemeShape,
  base_curvatures: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const edge of edges) {
    // presence in base_curvatures is guaranteed by the caller building both maps
    // from the same edge set, so a missing key is a bug, not a missing default
    const base = base_curvatures.get(edge.id);
    if (base === undefined) {
      throw new Error(`compute_route_curvatures: missing base curvature for edge ${edge.id}`);
    }
    // self-loop: no chord to bypass, keep the base loop curvature
    if (edge.is_self_loop) {
      result.set(edge.id, base);
      continue;
    }
    const obstacles = obstacles_for_edge(edge, node_boxes_by_key);
    // build the straight corridor (sample the actual base curve so an already-
    // bowed fan is tested as drawn) and keep base if it already clears every
    // obstacle
    const base_curve = sample_curve(edge.from_box, edge.to_box, shape, base);
    if (curve_clears_all(base_curve, obstacles)) {
      result.set(edge.id, base);
      continue;
    }
    // collision: search for a clearing bulge, base sign first
    const routed = route_one_edge(edge, obstacles, base, shape);
    result.set(edge.id, routed);
  }
  return result;
}
