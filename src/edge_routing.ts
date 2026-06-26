// edge_routing.ts -- loop back-edge routing for the flowchart.
//
// A loop back-edge (kind:"back") returns from the body's last node UP to the
// loop header. Drawn straight it would cut back through every body node between
// them -- exactly the failure the reference flowchart shows. Instead the back
// edge is routed orthogonally out to a vertical LANE beside the loop body, up
// the lane clear of the body, and back in to the header. This module decides
// which side to use and how far out the lane sits so it clears the body;
// edge_geometry.back_edge_path draws the rounded path. Nodes are never moved.
//
// DETERMINISTIC: stable input-order iteration and deterministic tie-breaks (ties
// resolve to the left). The same input always yields the same routing.
//
// PURE: zero DOM or Solid imports. Imports only the geometry module.

import type { NodeBox, RoutedEdgeGeometry } from "./edge_geometry";
import { back_edge_path } from "./edge_geometry";

// Gap, in pixels, between the back-edge lane and the nearest node edge it must
// clear, so a loop's return reads as deliberately routed around the body.
export const BACK_EDGE_LANE_MARGIN_PX = 28;

// The side and lane position for a routed back edge. `side` is which side of the
// loop body the lane runs along; `lane_x` is the x coordinate of that vertical
// lane (already offset by BACK_EDGE_LANE_MARGIN_PX past the cleared content).
export interface BackEdgeRoute {
  side: "left" | "right";
  lane_x: number;
}

//============================================
// route_back_edge
//============================================
// Decide the side and lane x for a back edge from `from_box` (body, lower) up to
// `to_box` (header, higher), given the other node boxes as obstacles. Only
// obstacles whose vertical span overlaps the back edge's vertical band can be hit
// by the lane, so the lane is placed just past the widest such obstacle (and past
// the two endpoints themselves) on whichever side gives the shorter detour from
// the body node. The lane therefore clears the whole body by construction; the
// side choice only trims the horizontal travel. Ties resolve to the left so the
// result is deterministic and back edges bow consistently.
export function route_back_edge(
  from_box: NodeBox,
  to_box: NodeBox,
  obstacles: NodeBox[],
): BackEdgeRoute {
  // vertical band the back edge spans, from the higher node's top to the lower
  // node's bottom; only obstacles overlapping this band can sit beside the lane
  const band_top = Math.min(from_box.y - from_box.h / 2, to_box.y - to_box.h / 2);
  const band_bottom = Math.max(from_box.y + from_box.h / 2, to_box.y + to_box.h / 2);
  // start the extents at the endpoints so the lane always clears them too
  let left_extent = Math.min(from_box.x - from_box.w / 2, to_box.x - to_box.w / 2);
  let right_extent = Math.max(from_box.x + from_box.w / 2, to_box.x + to_box.w / 2);
  // widen the extents to include every obstacle overlapping the vertical band
  for (const obstacle of obstacles) {
    const obstacle_top = obstacle.y - obstacle.h / 2;
    const obstacle_bottom = obstacle.y + obstacle.h / 2;
    // skip obstacles entirely above or below the band: the lane never meets them
    if (obstacle_bottom < band_top || obstacle_top > band_bottom) {
      continue;
    }
    left_extent = Math.min(left_extent, obstacle.x - obstacle.w / 2);
    right_extent = Math.max(right_extent, obstacle.x + obstacle.w / 2);
  }
  // candidate lanes sit one margin past the cleared content on each side
  const lane_left = left_extent - BACK_EDGE_LANE_MARGIN_PX;
  const lane_right = right_extent + BACK_EDGE_LANE_MARGIN_PX;
  // pick the side with the shorter horizontal travel from the body node; both
  // sides clear the body, so this only shortens the detour. Tie -> left.
  const detour_left = Math.abs(from_box.x - lane_left);
  const detour_right = Math.abs(from_box.x - lane_right);
  if (detour_right < detour_left) {
    return { side: "right", lane_x: lane_right };
  }
  return { side: "left", lane_x: lane_left };
}

//============================================
// compute_back_edge_geometry
//============================================
// Convenience for the edge renderer: route a back edge (choose side + lane) and
// build its rounded orthogonal path in one call. `obstacles` is every node box
// the edge must clear -- typically all flow nodes except the edge's own from and
// to. Returns the routed geometry (path "d" + lane-midpoint label anchor).
export function compute_back_edge_geometry(
  from_box: NodeBox,
  to_box: NodeBox,
  obstacles: NodeBox[],
): RoutedEdgeGeometry {
  const route = route_back_edge(from_box, to_box, obstacles);
  const geometry = back_edge_path(from_box, to_box, route.side, route.lane_x);
  return geometry;
}
