// Pure map-bounds helper: the single source of truth for the rendered extent of
// the flowchart. It is consumed by the SVG viewBox, PNG raster sizing, and print
// sizing. Plain TypeScript with zero imports from Solid or the DOM.

import type { FlowNodeId, Position } from "./types.ts";
import type { NodeBox } from "./edge_geometry.ts";

// The bounding rectangle that should contain every rendered node plus padding.
// min_x / min_y are the top-left corner; width / height are the full size.
export interface MapExtent {
  min_x: number;
  min_y: number;
  width: number;
  height: number;
}

//============================================
// effective_extent
//============================================
// Compute the rendered extent of a map. For each node, the rendered center is
// the drag override when one exists, otherwise the layout center; node width and
// height come from the NodeBox. A far-dragged override therefore expands the
// bounds to include that bubble. `padding` is added on all four sides so labels
// and arrowheads near the edge are not clipped by the viewBox.
//
// An empty node map yields a zero-origin, zero-size extent (only the padding on
// each side), which keeps downstream viewBox math finite.
export function effective_extent(
  nodes: Map<FlowNodeId, NodeBox>,
  overrides: Record<FlowNodeId, Position>,
  padding: number,
): MapExtent {
  // running min/max of every node's outer edges in rendered position
  let min_x = Infinity;
  let min_y = Infinity;
  let max_x = -Infinity;
  let max_y = -Infinity;
  for (const [key, box] of nodes) {
    // rendered center: override replaces the layout center when present
    const override = overrides[key];
    const center_x = override === undefined ? box.x : override.x;
    const center_y = override === undefined ? box.y : override.y;
    // half extents from the node dimensions
    const half_w = box.w / 2;
    const half_h = box.h / 2;
    // expand the running bounds by this node's four outer edges
    min_x = Math.min(min_x, center_x - half_w);
    min_y = Math.min(min_y, center_y - half_h);
    max_x = Math.max(max_x, center_x + half_w);
    max_y = Math.max(max_y, center_y + half_h);
  }
  // no nodes: collapse to an empty padded box at the origin
  if (!Number.isFinite(min_x)) {
    const empty = { min_x: 0, min_y: 0, width: padding * 2, height: padding * 2 };
    return empty;
  }
  // apply uniform padding on all sides
  const extent = {
    min_x: min_x - padding,
    min_y: min_y - padding,
    width: max_x - min_x + padding * 2,
    height: max_y - min_y + padding * 2,
  };
  return extent;
}
