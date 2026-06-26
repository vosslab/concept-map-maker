// Graph depth computation for the Concept Map Maker app.
//
// Computes BFS depth from origin concepts, where origin = in-degree 0 AND
// out-degree > 0. Isolated concepts (in-degree 0, out-degree 0) are excluded
// from the origin set and are assigned a fallback depth.
//
// Pure TypeScript, no Solid/DOM imports.

import { concept_key } from "./types.js";
import type { Triple, ConceptKey } from "./types.js";

//============================================
// DepthResult
//============================================
// Return type for compute_depths.
export interface DepthResult {
  // BFS depth from the nearest origin, or fallback depth for unreachable nodes.
  depth_by_key: Map<ConceptKey, number>;
  // Set of origin concept keys (in-degree 0, out-degree > 0).
  origin_keys: Set<ConceptKey>;
}

//============================================
// compute_depths
//============================================
// Compute BFS depth from all origin nodes in the directed graph formed by
// the given triples.
//
// Only complete rows are used (from, verb, and to all non-blank after trim).
// Multi-source BFS from all origins simultaneously. Nodes unreachable from
// any origin (including cycle members not fed by an origin) receive a
// fallback depth of (max reached depth + 1). When no origins exist, all
// nodes get depth 0.
export function compute_depths(triples: Triple[]): DepthResult {
  // Filter to complete rows only: from, verb, to all non-blank after trim
  const complete = triples.filter(
    (t) => t.from.trim() !== "" && t.verb.trim() !== "" && t.to.trim() !== "",
  );

  // Build adjacency: out-edges and in-degree per concept key
  const out_edges = new Map<ConceptKey, Set<ConceptKey>>();
  const in_degree = new Map<ConceptKey, number>();

  // Collect all concept keys from complete rows
  for (const t of complete) {
    const from_key = concept_key(t.from);
    const to_key = concept_key(t.to);

    // Ensure both nodes appear in both maps
    if (!out_edges.has(from_key)) out_edges.set(from_key, new Set());
    if (!out_edges.has(to_key)) out_edges.set(to_key, new Set());
    if (!in_degree.has(from_key)) in_degree.set(from_key, 0);
    if (!in_degree.has(to_key)) in_degree.set(to_key, 0);

    // Add the directed edge from_key -> to_key.
    // The ! assertions are safe: both keys were inserted into out_edges and in_degree above.
    out_edges.get(from_key)!.add(to_key);
    // Increment in-degree of the target.
    in_degree.set(to_key, in_degree.get(to_key)! + 1);
  }

  // Identify all concept keys present in the graph
  const all_keys = new Set<ConceptKey>(out_edges.keys());

  // Find origins: in-degree 0 AND out-degree > 0 (excludes isolated nodes)
  const origin_keys = new Set<ConceptKey>();
  for (const key of all_keys) {
    const ind = in_degree.get(key) ?? 0;
    const outd = out_edges.get(key)?.size ?? 0;
    if (ind === 0 && outd > 0) {
      origin_keys.add(key);
    }
  }

  const depth_by_key = new Map<ConceptKey, number>();

  // When no origins exist, assign depth 0 to all nodes and return early
  if (origin_keys.size === 0) {
    for (const key of all_keys) {
      depth_by_key.set(key, 0);
    }
    return { depth_by_key, origin_keys };
  }

  // Multi-source BFS from all origins simultaneously
  const queue: Array<{ key: ConceptKey; depth: number }> = [];
  for (const key of origin_keys) {
    depth_by_key.set(key, 0);
    queue.push({ key, depth: 0 });
  }

  let head = 0;
  // Track the maximum depth reached during BFS
  let max_reached_depth = 0;

  while (head < queue.length) {
    const { key, depth } = queue[head++]!;
    if (depth > max_reached_depth) max_reached_depth = depth;

    for (const neighbor of out_edges.get(key) ?? []) {
      // Only visit each node once (first visit gives minimum BFS distance)
      if (!depth_by_key.has(neighbor)) {
        const neighbor_depth = depth + 1;
        depth_by_key.set(neighbor, neighbor_depth);
        if (neighbor_depth > max_reached_depth) max_reached_depth = neighbor_depth;
        queue.push({ key: neighbor, depth: neighbor_depth });
      }
    }
  }

  // Assign fallback depth to nodes unreachable from any origin
  // (e.g. isolated concepts, cycle members not fed by an origin)
  const fallback_depth = max_reached_depth + 1;
  for (const key of all_keys) {
    if (!depth_by_key.has(key)) {
      depth_by_key.set(key, fallback_depth);
    }
  }

  return { depth_by_key, origin_keys };
}
