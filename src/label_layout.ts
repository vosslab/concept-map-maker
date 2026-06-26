// label_layout.ts -- centralized verb-label placement pass.
//
// Verb labels were placed per-edge: each edge chose its own maximum-clearance
// point against the node bubbles but was blind to OTHER labels, so sibling and
// parallel edges put their labels in the same zone and overprinted. This module
// is the durable fix: a SINGLE pass lays out every label together, treating node
// boxes AND already-placed label boxes as obstacles, so labels avoid each other
// by construction rather than by a per-edge guess.
//
// The pass reuses place_edge_label (the uniform maximum-clearance scorer) and
// label_box (the shared label sizing) so the clearance math is never duplicated.
//
// Override-aware: callers feed the live node boxes, so a dragged bubble shifts
// the obstacle set and the whole pass re-runs, keeping labels on their edges.
//
// Deterministic: labels are placed in input (edges array) order. That order is
// the placement priority -- an earlier edge gets first pick of clear space, and
// each placed label becomes an obstacle for every later edge. Same input twice
// yields the same map.
//
// Pure: zero DOM or Solid imports. Imports only from the geometry and label
// sizing modules.

import type { ThemeShape } from "./types.ts";
import type { NodeBox, Point, EdgeGeometry } from "./edge_geometry";
import { edge_path, self_loop_path, place_edge_label, label_min_clearance } from "./edge_geometry";
import { wrap_verb_label, label_box, LABEL_CLEAR_MARGIN_PX } from "./label_wrap";

// The minimal per-edge input the pass needs to compute geometry and a label.
// id keys the returned position map; from_box/to_box drive edge_path (self-loops
// use from_box only); verb is wrapped and sized; is_self_loop selects the arc.
// from_key/to_key identify the endpoint concepts so edges that connect the same
// unordered pair (including reciprocals and duplicates) group into one lane set.
export interface LabelEdgeInput {
  id: string;
  from_box: NodeBox;
  to_box: NodeBox;
  verb: string;
  is_self_loop: boolean;
  from_key: string;
  to_key: string;
}

// Perpendicular spacing (px) between adjacent lanes in a co-located group. A
// group of N labels is spread into N parallel lanes centered on the curve, so
// for N labels the lane offsets are [-(N-1)/2 ... +(N-1)/2] * LANE_SPACING_PX
// (for example N=4 -> [-36, -12, 12, 36] at spacing 24). Sized as a small
// multiple of the label line box so lanes are visually distinct yet stay
// attached to their edges.
const LANE_SPACING_PX = 24;

// Outward step (px) used when nudging a laned label off a node box. Node
// clearance takes priority over exact lane spacing, so a blocked lane label is
// pushed further along its own normal direction in these increments until it
// clears, preserving the lane's side (sign) and therefore the lane order.
const LANE_CLEARANCE_STEP_PX = 6;

// Maximum number of outward clearance steps before giving up and keeping the
// least-bad laned point. Bounds the deterministic search so it always halts.
const LANE_CLEARANCE_MAX_STEPS = 12;

//============================================
// compute_label_positions
//============================================
// Lay out every verb label in one pass. Starting from a COPY of the node boxes,
// place each edge's label at its maximum-clearance point against the accumulated
// obstacle set (node boxes plus all earlier labels), then append this label's
// AABB to the obstacle set so later labels avoid it. Empty-verb edges render no
// label, so they are skipped and contribute no obstacle.
//
// Known limit: a very dense small map may leave a label tight against a node when
// no clear point exists along its short edge; the pass returns the least-bad
// (maximum-clearance) point deterministically rather than failing.
export function compute_label_positions(
  edges: LabelEdgeInput[],
  node_boxes: NodeBox[],
  shape: ThemeShape,
  curvatures: Map<string, number>,
): Map<string, Point> {
  const positions = new Map<string, Point>();
  // start with a copy so the caller's node-box list is never mutated; labels are
  // appended as new obstacles as the pass proceeds
  const obstacles: NodeBox[] = node_boxes.slice();
  // group edges that connect the same unordered concept pair so reciprocals and
  // duplicates share one lane set; lone pairs stay groups of size one
  const groups = group_by_unordered_pair(edges);
  for (const group of groups) {
    // drop empty-verb members up front: they draw no label, take no lane, and
    // add no obstacle, so they never widen a group's lane spread
    const drawn = group.filter((edge) => edge.verb.trim().length > 0);
    if (drawn.length === 0) {
      continue;
    }
    // deterministic lane order: sort the drawn members by edge id so the same
    // input always assigns the same lane index to the same edge
    const ordered = drawn.slice().sort(compare_edge_id);
    // a lone label (group size one) keeps the original maximum-clearance
    // placement; there is no co-located sibling to lane against
    if (ordered.length === 1) {
      const edge = ordered[0];
      if (edge !== undefined) {
        const geometry = edge_geometry_for(edge, shape, curvatures);
        const pos = place_edge_label(geometry.cubic, edge.verb, obstacles);
        positions.set(edge.id, pos);
        add_label_obstacle(obstacles, pos, edge.verb);
      }
      continue;
    }
    // co-located group: lay every member along ONE shared lane axis so the labels
    // form distinct parallel lanes regardless of each edge's own curvature. The
    // shared axis is the chord between the pair's two node centers; lanes step
    // perpendicular to it. Using a single axis (not each edge's own normal) is
    // what makes reciprocal edges, which bow to the same physical side, separate.
    const axis = group_lane_axis(ordered);
    const lane_offsets = symmetric_lane_offsets(ordered.length);
    for (let lane = 0; lane < ordered.length; lane += 1) {
      const edge = ordered[lane];
      const lane_offset = lane_offsets[lane];
      if (edge === undefined || lane_offset === undefined) {
        continue;
      }
      const pos = place_laned_label(axis, lane_offset, edge.verb, obstacles);
      positions.set(edge.id, pos);
      // append this label's AABB so every later edge (and later group) treats it
      // as an obstacle, preserving cross-group avoidance and determinism
      add_label_obstacle(obstacles, pos, edge.verb);
    }
  }
  return positions;
}

// Append a placed label's AABB to the obstacle set so later labels avoid it.
function add_label_obstacle(obstacles: NodeBox[], pos: Point, verb: string): void {
  const size = label_box(wrap_verb_label(verb));
  obstacles.push({ x: pos.x, y: pos.y, w: size.width, h: size.height });
}

//============================================
// shared lane axis for a co-located group
//============================================
// The lane axis is the chord between the two endpoint node centers: base is the
// chord midpoint, dir is the perpendicular UNIT vector that lanes step along. All
// members of the group share this one axis, so their lanes are truly parallel and
// evenly spaced no matter how each individual edge bows. A degenerate (zero
// length) chord, as in a self-pair, falls back to a vertical lane direction.
interface LaneAxis {
  base: Point;
  dir: Point;
}

function group_lane_axis(group: LabelEdgeInput[]): LaneAxis {
  // every member shares the same unordered pair, so read endpoints off the first
  const first = group[0];
  if (first === undefined) {
    return { base: { x: 0, y: 0 }, dir: { x: 0, y: 1 } };
  }
  const a = first.from_box;
  const b = first.to_box;
  // chord midpoint between the two node centers is the lane axis base
  const base = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // chord vector and its length; lanes step perpendicular to this chord
  const chord_x = b.x - a.x;
  const chord_y = b.y - a.y;
  const length = Math.hypot(chord_x, chord_y);
  // degenerate chord (same center, e.g. self-pair): use a vertical lane direction
  if (length === 0) {
    return { base, dir: { x: 0, y: 1 } };
  }
  // perpendicular unit vector: rotate the chord 90 degrees, then normalize
  const dir = { x: -chord_y / length, y: chord_x / length };
  return { base, dir };
}

//============================================
// grouping by unordered concept pair
//============================================
// Bucket edges so that A->B and B->A (and duplicate A->B) land together. The key
// sorts the two endpoint concept keys, making it order-independent. Buckets are
// returned in first-seen order so the pass stays deterministic and the overall
// placement priority still follows the input edge order.
function group_by_unordered_pair(edges: LabelEdgeInput[]): LabelEdgeInput[][] {
  const by_pair = new Map<string, LabelEdgeInput[]>();
  const order: string[] = [];
  for (const edge of edges) {
    // sort the endpoint keys so the unordered pair maps to one stable bucket key;
    // a newline separator avoids collisions when a key itself contains spaces
    const ends = [edge.from_key, edge.to_key].sort();
    const pair_key = ends[0] + "\n" + ends[1];
    const bucket = by_pair.get(pair_key);
    if (bucket === undefined) {
      by_pair.set(pair_key, [edge]);
      order.push(pair_key);
    } else {
      bucket.push(edge);
    }
  }
  const groups: LabelEdgeInput[][] = [];
  for (const pair_key of order) {
    const bucket = by_pair.get(pair_key);
    if (bucket !== undefined) {
      groups.push(bucket);
    }
  }
  return groups;
}

// Stable ascending edge-id comparator for deterministic lane assignment.
function compare_edge_id(a: LabelEdgeInput, b: LabelEdgeInput): number {
  if (a.id < b.id) {
    return -1;
  }
  if (a.id > b.id) {
    return 1;
  }
  return 0;
}

//============================================
// symmetric lane offsets
//============================================
// Symmetric perpendicular offsets for a group of N labels, centered on 0 with
// LANE_SPACING_PX between adjacent lanes. The result is
// [-(N-1)/2 ... +(N-1)/2] * LANE_SPACING_PX, so N=1 -> [0] (no shift, unchanged
// placement), N=2 -> [-12, 12], N=3 -> [-24, 0, 24], N=4 -> [-36, -12, 12, 36].
function symmetric_lane_offsets(count: number): number[] {
  const offsets: number[] = [];
  // center index so the offsets are symmetric about zero
  const center = (count - 1) / 2;
  for (let index = 0; index < count; index += 1) {
    offsets.push((index - center) * LANE_SPACING_PX);
  }
  return offsets;
}

//============================================
// edge geometry
//============================================
// Build the rendered geometry for one edge. Self-loops use the loop arc; all
// other edges use the routed cubic at the curvature the caller assigned. A
// missing curvature is a caller bug because both maps come from the same edge set.
function edge_geometry_for(
  edge: LabelEdgeInput,
  shape: ThemeShape,
  curvatures: Map<string, number>,
): EdgeGeometry {
  const curvature = curvatures.get(edge.id);
  if (curvature === undefined) {
    throw new Error(`compute_label_positions: missing curvature for edge ${edge.id}`);
  }
  const geometry = edge.is_self_loop
    ? self_loop_path(edge.from_box, shape)
    : edge_path(edge.from_box, edge.to_box, shape, curvature);
  return geometry;
}

//============================================
// place_laned_label
//============================================
// Place one label into its assigned lane along the group's shared axis. The lane
// anchor is the axis base shifted perpendicular by lane_offset along the axis
// direction, giving each group member a distinct parallel lane.
//
// Node clearance takes priority over exact lane spacing: if the laned anchor
// lands on a node box, the label is nudged further outward along the SAME axis
// direction (preserving the lane's side, and therefore lane order) until it
// clears or the bounded search ends. Lanes stay distinct because each starts at a
// different offset and a blocked lane only ever moves further out on its own side.
function place_laned_label(
  axis: LaneAxis,
  lane_offset: number,
  verb: string,
  obstacles: NodeBox[],
): Point {
  // label AABB half extents including the shared clearance margin, matching the
  // sizing place_edge_label uses so the lane clearance test agrees with it
  const size = label_box(wrap_verb_label(verb));
  const label_half_w = size.width / 2 + LABEL_CLEAR_MARGIN_PX;
  const label_half_h = size.height / 2 + LABEL_CLEAR_MARGIN_PX;
  // outward direction for clearance nudges: the lane's own side. A center lane
  // (offset 0 in an odd group) has no side, so it steps in the positive direction.
  const lane_sign = lane_offset < 0 ? -1 : 1;
  // lane anchor: axis base shifted perpendicular by the lane offset
  let best_point = {
    x: axis.base.x + axis.dir.x * lane_offset,
    y: axis.base.y + axis.dir.y * lane_offset,
  };
  // already clear at the exact lane offset: keep it, lane spacing is preserved
  let best_clearance = label_min_clearance(
    best_point.x,
    best_point.y,
    label_half_w,
    label_half_h,
    obstacles,
  );
  if (best_clearance >= 0) {
    return best_point;
  }
  // node clearance wins over exact spacing: step further out along the same axis
  // direction in fixed increments, keeping the best (max-clearance) point seen
  for (let step = 1; step <= LANE_CLEARANCE_MAX_STEPS; step += 1) {
    const extra = lane_sign * step * LANE_CLEARANCE_STEP_PX;
    const candidate = {
      x: axis.base.x + axis.dir.x * (lane_offset + extra),
      y: axis.base.y + axis.dir.y * (lane_offset + extra),
    };
    const clearance = label_min_clearance(
      candidate.x,
      candidate.y,
      label_half_w,
      label_half_h,
      obstacles,
    );
    if (clearance > best_clearance) {
      best_clearance = clearance;
      best_point = candidate;
    }
    // stop as soon as a stepped lane is fully clear of every obstacle
    if (clearance >= 0) {
      break;
    }
  }
  return best_point;
}
