// Unit tests for the centralized label placement pass (src/label_layout.ts).
// Run: node --import tsx --test tests/test_label_layout.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { assign_curvatures } from "../src/edge_geometry.ts";
import { wrap_verb_label, label_box, LABEL_CLEAR_MARGIN_PX } from "../src/label_wrap.ts";
import { compute_label_positions } from "../src/label_layout.ts";

// Build the curvature map the pass expects from a list of edge inputs.
function curvatures_for(edges) {
  const rows = edges.map((edge) => ({
    id: edge.id,
    from_key: edge.from_key,
    to_key: edge.to_key,
  }));
  return assign_curvatures(rows);
}

// True when two placed label AABBs (centered at the returned points, sized by the
// wrapped verb plus the clearance margin) overlap on BOTH axes.
function labels_overlap(pos_a, verb_a, pos_b, verb_b) {
  const size_a = label_box(wrap_verb_label(verb_a));
  const size_b = label_box(wrap_verb_label(verb_b));
  const a_half_w = size_a.width / 2 + LABEL_CLEAR_MARGIN_PX;
  const a_half_h = size_a.height / 2 + LABEL_CLEAR_MARGIN_PX;
  const b_half_w = size_b.width / 2 + LABEL_CLEAR_MARGIN_PX;
  const b_half_h = size_b.height / 2 + LABEL_CLEAR_MARGIN_PX;
  const gap_x = Math.abs(pos_a.x - pos_b.x) - (a_half_w + b_half_w);
  const gap_y = Math.abs(pos_a.y - pos_b.y) - (a_half_h + b_half_h);
  // disjoint when separated on either axis; overlap when both gaps are negative
  return gap_x < 0 && gap_y < 0;
}

//============================================
// label-vs-label avoidance
//============================================

test("two parallel edges between the same nodes do not overprint each other", () => {
  // two far-apart nodes with two edges between them; assign_curvatures fans the
  // duplicate same-direction pair, but per-edge placement would still drop both
  // labels at their own max-clearance point near the center and collide.
  const from_box = { x: 0, y: 0, w: 80, h: 40 };
  const to_box = { x: 600, y: 0, w: 80, h: 40 };
  const edges = [
    {
      id: "e1",
      from_box,
      to_box,
      verb: "leads to",
      is_self_loop: false,
      from_key: "a",
      to_key: "b",
    },
    {
      id: "e2",
      from_box,
      to_box,
      verb: "is also linked to",
      is_self_loop: false,
      from_key: "a",
      to_key: "b",
    },
  ];
  const node_boxes = [from_box, to_box];
  const positions = compute_label_positions(edges, node_boxes, "rect", curvatures_for(edges));
  const p1 = positions.get("e1");
  const p2 = positions.get("e2");
  assert.ok(p1 !== undefined && p2 !== undefined);
  assert.equal(
    labels_overlap(p1, "leads to", p2, "is also linked to"),
    false,
    "the two placed labels must not overlap on both axes",
  );
});

test("near-parallel sibling edges separate via the perpendicular freedom", () => {
  // one shared source node with two edges leaving it to two NEARBY targets, so
  // the two curves run nearly parallel and their along-curve label zones overlap.
  // Without a perpendicular degree of freedom both labels land in the same narrow
  // band; with it the second label steps sideways into clear space.
  const source = { x: 0, y: 0, w: 80, h: 40 };
  const target_a = { x: 500, y: -20, w: 80, h: 40 };
  const target_b = { x: 500, y: 20, w: 80, h: 40 };
  const edges = [
    {
      id: "e1",
      from_box: source,
      to_box: target_a,
      verb: "sting",
      is_self_loop: false,
      from_key: "src",
      to_key: "a",
    },
    {
      id: "e2",
      from_box: source,
      to_box: target_b,
      verb: "make",
      is_self_loop: false,
      from_key: "src",
      to_key: "b",
    },
  ];
  const node_boxes = [source, target_a, target_b];
  const positions = compute_label_positions(edges, node_boxes, "rect", curvatures_for(edges));
  const p1 = positions.get("e1");
  const p2 = positions.get("e2");
  assert.ok(p1 !== undefined && p2 !== undefined);
  // the two placed labels must not overlap on both axes
  assert.equal(
    labels_overlap(p1, "sting", p2, "make"),
    false,
    "near-parallel sibling labels must not overlap",
  );
  // and they are meaningfully separated (more than a few pixels apart), which the
  // along-curve-only placement could not guarantee for near-parallel siblings
  const separation = Math.hypot(p1.x - p2.x, p1.y - p2.y);
  assert.ok(separation > 14, `expected separation > 14px, got ${separation}`);
});

//============================================
// deterministic indexed lanes for same-pair edges
//============================================

// Signed perpendicular offset of a placed label from the straight-edge midpoint.
// For a horizontal edge the lane shift is purely vertical, so the y delta is the
// lane offset and its sign is the lane side.
function perp_offset_horizontal(pos, mid_y) {
  return pos.y - mid_y;
}

test("four same-pair edges split into four distinct non-overlapping lanes", () => {
  // four edges between the same unordered pair: two each direction. Greedy
  // perpendicular nudging alone piles these in one narrow band; deterministic
  // lanes must spread them into four parallel, distinct, non-overlapping lanes.
  const air = { x: 0, y: 0, w: 80, h: 40 };
  const water = { x: 700, y: 0, w: 80, h: 40 };
  const edges = [
    {
      id: "e1",
      from_box: air,
      to_box: water,
      verb: "warms",
      is_self_loop: false,
      from_key: "air",
      to_key: "water",
    },
    {
      id: "e2",
      from_box: air,
      to_box: water,
      verb: "carries",
      is_self_loop: false,
      from_key: "air",
      to_key: "water",
    },
    {
      id: "e3",
      from_box: water,
      to_box: air,
      verb: "cools",
      is_self_loop: false,
      from_key: "water",
      to_key: "air",
    },
    {
      id: "e4",
      from_box: water,
      to_box: air,
      verb: "feeds",
      is_self_loop: false,
      from_key: "water",
      to_key: "air",
    },
  ];
  const node_boxes = [air, water];
  const positions = compute_label_positions(edges, node_boxes, "rect", curvatures_for(edges));
  const ids = ["e1", "e2", "e3", "e4"];
  const verbs = { e1: "warms", e2: "carries", e3: "cools", e4: "feeds" };
  const pts = ids.map((id) => positions.get(id));
  for (const p of pts) {
    assert.ok(p !== undefined);
  }
  // pairwise AABB non-overlap across all four labels
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i];
      const b = ids[j];
      assert.equal(
        labels_overlap(positions.get(a), verbs[a], positions.get(b), verbs[b]),
        false,
        `labels ${a} and ${b} must not overlap`,
      );
    }
  }
  // the perpendicular offsets (lane index order by edge id) must be distinct and
  // strictly increasing, i.e. four ordered lanes
  const offsets = ids.map((id) => perp_offset_horizontal(positions.get(id), 0));
  for (let i = 1; i < offsets.length; i += 1) {
    assert.ok(
      offsets[i] > offsets[i - 1],
      `lane offsets must be strictly increasing, got ${JSON.stringify(offsets)}`,
    );
  }
  // and symmetric about zero (centered lanes): first and last are opposite signs
  assert.ok(offsets[0] < 0 && offsets[offsets.length - 1] > 0);
});

test("two same-pair edges split into two distinct non-overlapping lanes", () => {
  const air = { x: 0, y: 0, w: 80, h: 40 };
  const water = { x: 700, y: 0, w: 80, h: 40 };
  const edges = [
    {
      id: "e1",
      from_box: air,
      to_box: water,
      verb: "warms",
      is_self_loop: false,
      from_key: "air",
      to_key: "water",
    },
    {
      id: "e2",
      from_box: water,
      to_box: air,
      verb: "cools",
      is_self_loop: false,
      from_key: "water",
      to_key: "air",
    },
  ];
  const node_boxes = [air, water];
  const positions = compute_label_positions(edges, node_boxes, "rect", curvatures_for(edges));
  const p1 = positions.get("e1");
  const p2 = positions.get("e2");
  assert.ok(p1 !== undefined && p2 !== undefined);
  assert.equal(labels_overlap(p1, "warms", p2, "cools"), false, "two lanes must not overlap");
  const o1 = perp_offset_horizontal(p1, 0);
  const o2 = perp_offset_horizontal(p2, 0);
  // two distinct lanes on opposite sides of the edge center
  assert.ok(o1 !== o2, "two lanes must be at distinct offsets");
  assert.ok(o1 < 0 && o2 > 0, `two lanes must straddle center, got ${o1}, ${o2}`);
});

//============================================
// laned label vs node box: node-clearance nudge
//============================================

test("laned label overlapping a node box is nudged clear of it", () => {
  // two edges between the same pair (a->b and b->a) form a co-located group of
  // size 2. Both lanes are placed along the shared chord axis. One of the lanes'
  // default offsets may land ON one of the node boxes if the chord midpoint is
  // close to that box. This test places the pair so that the outer node box
  // straddles the natural lane anchor, forcing the node-clearance nudge path in
  // place_laned_label. After nudging, the label AABB must not overlap that node.
  //
  // Layout: from_box centered at (0,0), to_box centered at (100,0) -- close
  // enough that the lane offset of -12 px would land near x=-6, which overlaps
  // the large from_box (w=60). The nudge must push the lane label clear.
  const from_box = { x: 0, y: 0, w: 60, h: 60 };
  const to_box = { x: 100, y: 0, w: 60, h: 60 };
  const edges = [
    {
      id: "e1",
      from_box,
      to_box,
      verb: "warms",
      is_self_loop: false,
      from_key: "src",
      to_key: "dst",
    },
    {
      id: "e2",
      from_box: to_box,
      to_box: from_box,
      verb: "cools",
      is_self_loop: false,
      from_key: "dst",
      to_key: "src",
    },
  ];
  const node_boxes = [from_box, to_box];
  const positions = compute_label_positions(edges, node_boxes, "rect", curvatures_for(edges));
  const p1 = positions.get("e1");
  const p2 = positions.get("e2");
  assert.ok(p1 !== undefined && p2 !== undefined);
  // compute each label's AABB half extents (matching production sizing)
  function label_half_extents(verb) {
    const size = label_box(wrap_verb_label(verb));
    return {
      half_w: size.width / 2 + LABEL_CLEAR_MARGIN_PX,
      half_h: size.height / 2 + LABEL_CLEAR_MARGIN_PX,
    };
  }
  function aabb_clears_box(pos, half_w, half_h, box) {
    // AABB disjoint when gap on at least one axis is non-negative
    const gap_x = Math.abs(pos.x - box.x) - (half_w + box.w / 2);
    const gap_y = Math.abs(pos.y - box.y) - (half_h + box.h / 2);
    return gap_x >= 0 || gap_y >= 0;
  }
  const e1_ext = label_half_extents("warms");
  const e2_ext = label_half_extents("cools");
  // neither placed label AABB may overlap either node box
  for (const node_box of node_boxes) {
    assert.ok(
      aabb_clears_box(p1, e1_ext.half_w, e1_ext.half_h, node_box),
      `e1 label at (${p1.x},${p1.y}) overlaps node box centered at (${node_box.x},${node_box.y})`,
    );
    assert.ok(
      aabb_clears_box(p2, e2_ext.half_w, e2_ext.half_h, node_box),
      `e2 label at (${p2.x},${p2.y}) overlaps node box centered at (${node_box.x},${node_box.y})`,
    );
  }
  // the two lanes must still be on opposite sides (distinct, non-collapsed)
  assert.ok(
    labels_overlap(p1, "warms", p2, "cools") === false,
    "nudged lanes must not collapse onto each other",
  );
});

//============================================
// clear single edge keeps the midpoint (no lane shift)
//============================================

test("a single edge with clear space is placed at its curve midpoint", () => {
  // a lone edge has group size 1: no lane shifting is applied and the label
  // lands at the maximum-clearance point, which for a clear straight horizontal
  // edge is the geometric midpoint between the two clipped endpoints.
  const from_box = { x: 0, y: 0, w: 80, h: 40 };
  const to_box = { x: 600, y: 0, w: 80, h: 40 };
  const edges = [
    { id: "solo", from_box, to_box, verb: "uses", is_self_loop: false, from_key: "a", to_key: "b" },
  ];
  const node_boxes = [from_box, to_box];
  const positions = compute_label_positions(edges, node_boxes, "rect", curvatures_for(edges));
  const pos = positions.get("solo");
  assert.ok(pos !== undefined);
  // for a horizontal edge the clipped start is at from_box.x + from_box.w/2 = 40
  // and the clipped end is at to_box.x - to_box.w/2 = 560; the midpoint x is 300.
  // Use relational assertions: label x sits between the two clipped endpoints and
  // near their midpoint; label y is near the edge axis (within a small tolerance).
  const clip_start_x = from_box.x + from_box.w / 2;
  const clip_end_x = to_box.x - to_box.w / 2;
  const mid_x = (clip_start_x + clip_end_x) / 2;
  assert.ok(
    pos.x > clip_start_x && pos.x < clip_end_x,
    `label x (${pos.x}) should lie between clipped endpoints (${clip_start_x}, ${clip_end_x})`,
  );
  // label should be near the midpoint (within 5% of edge span)
  const span = clip_end_x - clip_start_x;
  assert.ok(
    Math.abs(pos.x - mid_x) <= span * 0.05,
    `label x (${pos.x}) should be near midpoint ${mid_x}`,
  );
  // straight horizontal edge: y stays on the chord axis (within 1px tolerance)
  assert.ok(
    Math.abs(pos.y - from_box.y) <= 1,
    `label y (${pos.y}) should be near edge y-axis (${from_box.y})`,
  );
});

//============================================
// determinism
//============================================

test("same input twice yields identical positions", () => {
  const from_box = { x: 0, y: 0, w: 80, h: 40 };
  const to_box = { x: 600, y: 120, w: 80, h: 40 };
  const edges = [
    { id: "e1", from_box, to_box, verb: "binds", is_self_loop: false, from_key: "a", to_key: "b" },
    { id: "e2", from_box, to_box, verb: "blocks", is_self_loop: false, from_key: "a", to_key: "b" },
    {
      id: "e3",
      from_box,
      to_box: from_box,
      verb: "self regulates",
      is_self_loop: true,
      from_key: "a",
      to_key: "a",
    },
  ];
  const node_boxes = [from_box, to_box];
  const first = compute_label_positions(edges, node_boxes, "rect", curvatures_for(edges));
  const second = compute_label_positions(edges, node_boxes, "rect", curvatures_for(edges));
  assert.deepEqual(Array.from(first.entries()), Array.from(second.entries()));
});

//============================================
// empty-verb edges are skipped
//============================================

test("empty-verb edges produce no position and no obstacle", () => {
  const from_box = { x: 0, y: 0, w: 80, h: 40 };
  const to_box = { x: 600, y: 0, w: 80, h: 40 };
  const edges = [
    {
      id: "blank",
      from_box,
      to_box: from_box,
      verb: "   ",
      is_self_loop: true,
      from_key: "a",
      to_key: "a",
    },
    {
      id: "real",
      from_box,
      to_box,
      verb: "uses",
      is_self_loop: false,
      from_key: "a",
      to_key: "b",
    },
  ];
  const node_boxes = [from_box, to_box];
  const positions = compute_label_positions(edges, node_boxes, "rect", curvatures_for(edges));
  assert.equal(positions.has("blank"), false);
  const real = positions.get("real");
  assert.ok(real !== undefined);
  // with the blank skipped (no obstacle), the real edge keeps its clear midpoint:
  // label x between the clipped endpoints and near mid; y on the chord axis
  const clip_start_x_ev = from_box.x + from_box.w / 2;
  const clip_end_x_ev = to_box.x - to_box.w / 2;
  const mid_x_ev = (clip_start_x_ev + clip_end_x_ev) / 2;
  assert.ok(
    real.x > clip_start_x_ev && real.x < clip_end_x_ev,
    `label x (${real.x}) should lie between clipped endpoints`,
  );
  assert.ok(
    Math.abs(real.x - mid_x_ev) <= (clip_end_x_ev - clip_start_x_ev) * 0.05,
    `label x (${real.x}) should be near midpoint ${mid_x_ev}`,
  );
  assert.ok(Math.abs(real.y - from_box.y) <= 1, `label y (${real.y}) should be near edge axis`);
});
