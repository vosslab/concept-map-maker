// Dagre layout adapter for the concept map.
//
// Pure TypeScript with no Solid or DOM imports. Turns the document triples
// into a deterministic, top-down (rankdir "TB") layered layout, the classic
// concept-map shape. The layout depends only on the triples, never on drag
// overrides, so a render-time merge (overrides[key] ?? layout[key]) can layer
// student adjustments on top without re-running layout.
//
// Students can create cycles. Dagre would otherwise loop forever ranking a
// cyclic graph, so we set acyclicer "greedy": dagre temporarily reverses a
// minimal feedback arc set, lays out the now-acyclic graph, then restores the
// original edge direction. The reversal is internal; our output coordinates are
// unaffected and the function never throws on a cycle.

import dagre from "@dagrejs/dagre";
import type { GraphLabel } from "@dagrejs/dagre";
import type { Graph } from "@dagrejs/graphlib";

// Shape of the label object attached to each node in the dagre graph.
// dagre mutates this with computed x/y/width/height after layout.
// The index signature is required by graphlib's NodeLabel constraint.
interface DagreNodeLabel {
  label: string;
  width: number;
  height: number;
  [key: string]: unknown;
}

// Shape of the label size object attached to each edge in the dagre graph.
// dagre uses width/height to reserve rank and sibling separation around the
// label; labelpos tells dagre where the label sits on the arc ("c" = center).
// The index signature satisfies graphlib's EdgeLabel constraint.
// Verb labels are rendered at bezier midpoints by concept_edge.tsx; dagre does
// not render them, but uses these dimensions to spread bubbles so labels no
// longer overlap a bubble.
interface DagreEdgeLabel {
  width?: number;
  height?: number;
  // dagre accepts "c" (center), "l" (left), or "r" (right) for label placement
  labelpos?: "c" | "l" | "r";
  [key: string]: unknown;
}

// Structured entry stored in edge_labels during the two-pass edge dedup.
// Keeps from_key and to_key as structured fields so pass 2 never needs to
// reconstruct them by splitting a composite string on whitespace -- which
// breaks when concept keys contain internal spaces (e.g. "new york").
interface EdgeLabelEntry {
  from_key: ConceptKey;
  to_key: ConceptKey;
  label: DagreEdgeLabel;
}

// Typed shapes for dagre return values whose public types are `any`-flavored.
// dagre's g.node() and g.graph() return plain objects with numeric layout fields;
// these interfaces capture the subset we actually read.
interface DagreNodeResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DagreGraphLabel {
  width?: number;
  height?: number;
}

// Boundary adapter: validates that an unknown dagre return value has the
// required numeric fields and returns a narrowly typed shape. Throws if
// the structure does not match so misuse is caught early rather than
// silently producing NaN coordinates.
function as_dagre_node(raw: unknown): DagreNodeResult {
  if (
    typeof raw !== "object" ||
    raw === null ||
    typeof (raw as Record<string, unknown>)["x"] !== "number" ||
    typeof (raw as Record<string, unknown>)["y"] !== "number" ||
    typeof (raw as Record<string, unknown>)["width"] !== "number" ||
    typeof (raw as Record<string, unknown>)["height"] !== "number"
  ) {
    throw new Error(`dagre node result missing expected numeric fields: ${JSON.stringify(raw)}`);
  }
  return raw as unknown as DagreNodeResult;
}

function as_dagre_graph_label(raw: unknown): DagreGraphLabel {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`dagre graph label is not an object: ${JSON.stringify(raw)}`);
  }
  const rec = raw as Record<string, unknown>;
  // width and height are optional in DagreGraphLabel; validate types only when present
  if (rec["width"] !== undefined && typeof rec["width"] !== "number") {
    throw new Error(`dagre graph label.width is not a number: ${JSON.stringify(rec["width"])}`);
  }
  if (rec["height"] !== undefined && typeof rec["height"] !== "number") {
    throw new Error(`dagre graph label.height is not a number: ${JSON.stringify(rec["height"])}`);
  }
  // rec has been narrowed to object with optional numeric width/height fields
  const label: DagreGraphLabel = {
    width: rec["width"],
    height: rec["height"],
  };
  return label;
}

import type { Triple, ConceptKey } from "./types";
import { concept_key } from "./types";
import { wrap_verb_label, label_box } from "./label_wrap";

// One laid-out bubble. x and y are the CENTER of the bubble (dagre's
// convention); w and h are its full width and height. label is the display
// casing of the concept (first-seen casing wins, matching derive_concepts).
export interface LayoutNode {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

// The full layout result: one node per unique concept key, plus the overall
// canvas extent dagre computed (used as a starting viewBox before drag
// overrides and label bounds are folded in by map_bounds.effective_extent).
export interface LayoutResult {
  nodes: Map<ConceptKey, LayoutNode>;
  width: number;
  height: number;
}

//============================================
// layout constants
//============================================
// These are chosen for legibility of 30-80 node student maps and documented
// here so the values are reviewable in one place.

// Approximate advance width of one character at the 14px web-safe font stack
// used in the map. 8px is a deliberate slight over-estimate so bubbles never
// clip their label text; exact metrics are a browser concern, not a pure-module
// concern, so we estimate from label length here.
const CHAR_WIDTH_PX = 8;

// Horizontal breathing room added to each side of the estimated text width, so
// the label does not touch the bubble border.
const NODE_PADDING_X_PX = 24;

// Lower bound on bubble width so very short labels (1-2 characters) still read
// as pills rather than dots.
const MIN_NODE_WIDTH_PX = 56;

// Fixed pill height. Concept labels are 1-3 words on a single line, so the
// height is constant; only the width varies with label length.
const NODE_HEIGHT_PX = 36;

// Base vertical gap between adjacent rank layers (TB direction). Dagre adds each
// edge's reserved label height (from label_box) on top of this value, so
// multi-line verb labels still get the room they need while short-verb edges
// become much tighter than the old 60 px base allowed. Keep this small so
// vertical line lengths stay short -- vertical spacing is a user-comfort concern.
const RANK_SEP_PX = 30;

// Base horizontal gap between sibling nodes within the same rank. Larger values
// widen the gap between same-rank items, but interact non-monotonically with
// dagre's ordering pass -- increasing it can pull intermediate nodes closer to
// bypass center lines rather than further away. The durable lever for clearing
// intermediate nodes off bypass lines is EDGE_LABEL_WIDTH_MARGIN_PX (and the
// post-dagre edge_routing layer), not this constant.
const NODE_SEP_PX = 55;

// Extra horizontal margin added to each edge label's width before handing it to
// dagre. Widening the reserved label lane pushes an intermediate node further
// off the bypass center line; this is the primary separation lever for keeping
// intermediate bubbles clear of labelled bypass edges.
const EDGE_LABEL_WIDTH_MARGIN_PX = 48;

//============================================
// estimate_node_width
//============================================
// Estimate bubble width from label length using a fixed per-character advance
// plus horizontal padding, clamped to a minimum so short labels stay pill-like.
function estimate_node_width(label: string): number {
  // estimate the text run width from character count
  const text_width = label.length * CHAR_WIDTH_PX;
  // add padding on both sides
  const padded = text_width + NODE_PADDING_X_PX * 2;
  // never go below the minimum pill width
  const width = Math.max(padded, MIN_NODE_WIDTH_PX);
  return width;
}

//============================================
// collect_concepts
//============================================
// Walk the triples and build a stable, deduplicated map from concept key to its
// display label. Only complete rows (from, verb, and to all non-blank after
// trimming) contribute, matching the graph-derivation rule used elsewhere.
// First-seen casing wins, so a concept keeps the casing of its earliest
// appearance regardless of later spelling drift.
function collect_concepts(triples: Triple[]): Map<ConceptKey, string> {
  // insertion order is preserved by Map, giving deterministic node ordering
  const labels = new Map<ConceptKey, string>();
  // record the first display casing seen for a concept key
  const remember = (raw_label: string): void => {
    const key = concept_key(raw_label);
    const display = raw_label.trim();
    // keep the earliest casing; do not overwrite on later sightings
    if (!labels.has(key)) {
      labels.set(key, display);
    }
  };
  for (const triple of triples) {
    // skip any row that is not fully filled in
    if (!is_complete_row(triple)) {
      continue;
    }
    remember(triple.from);
    remember(triple.to);
  }
  return labels;
}

//============================================
// is_complete_row
//============================================
// A row contributes to the graph only when from, verb, and to are all non-blank
// after trimming. Blank and partially filled rows are excluded here (they are
// surfaced as validation warnings elsewhere, not laid out).
function is_complete_row(triple: Triple): boolean {
  const has_from = triple.from.trim().length > 0;
  const has_verb = triple.verb.trim().length > 0;
  const has_to = triple.to.trim().length > 0;
  const complete = has_from && has_verb && has_to;
  return complete;
}

//============================================
// build_graph
//============================================
// Assemble a dagre graph from the concept map. Nodes are sized by label length;
// edges carry the wrapped verb label size so dagre reserves rank and sibling
// separation around them. Verb labels are rendered at bezier midpoints by
// concept_edge.tsx; dagre does not render them, but uses width/height to spread
// bubbles so labels no longer overlap a bubble. Self-loops and duplicate edges
// are deduplicated by (from, to) key so dagre sees one edge per ordered pair.
function build_graph(
  triples: Triple[],
  labels: Map<ConceptKey, string>,
): Graph<GraphLabel, DagreNodeLabel, DagreEdgeLabel> {
  const graph = new dagre.graphlib.Graph<GraphLabel, DagreNodeLabel, DagreEdgeLabel>();
  // top-down layered layout with greedy cycle breaking; constants documented above
  graph.setGraph({
    rankdir: "TB",
    acyclicer: "greedy",
    ranksep: RANK_SEP_PX,
    nodesep: NODE_SEP_PX,
  });
  // dagre requires a default edge label; empty object is fine as a fallback
  graph.setDefaultEdgeLabel((): DagreEdgeLabel => ({}));
  // add every concept as a sized node, keyed by its normalized concept key
  for (const [key, label] of labels) {
    graph.setNode(key, {
      label,
      width: estimate_node_width(label),
      height: NODE_HEIGHT_PX,
    });
  }
  // For each unique ordered concept pair, find the widest verb label across all
  // complete rows that share that pair. We take the label with the greatest
  // width; tie-break on height. This gives dagre the worst-case label size so
  // it reserves enough rank/sibling space regardless of which verb is rendered.
  //
  // edge_id is still used as a dedup key (stable string per ordered pair), but
  // from_key and to_key are stored as structured fields so pass 2 never needs to
  // reconstruct them by splitting on whitespace -- which breaks when a concept
  // key contains internal spaces (e.g. "new york").
  const edge_labels = new Map<string, EdgeLabelEntry>();
  for (const triple of triples) {
    if (!is_complete_row(triple)) {
      continue;
    }
    const from_key = concept_key(triple.from);
    const to_key = concept_key(triple.to);
    // self-loops are drawn by edge_geometry.self_loop_path; skip for dagre ranking
    if (from_key === to_key) {
      continue;
    }
    const edge_id = from_key + "\0" + to_key;
    // compute the bounding box for this row's wrapped verb
    const lines = wrap_verb_label(triple.verb);
    const box = label_box(lines);
    const current = edge_labels.get(edge_id);
    const current_label = current?.label;
    // keep the label whose box is widest; tie-break on height for vertical safety
    if (
      current === undefined ||
      box.width > (current_label?.width ?? 0) ||
      (box.width === (current_label?.width ?? 0) && box.height > (current_label?.height ?? 0))
    ) {
      // add horizontal margin so dagre's reserved lane is wide enough that an
      // intermediate node at the same rank clears the bypass edge center line
      edge_labels.set(edge_id, {
        from_key,
        to_key,
        label: {
          width: box.width + EDGE_LABEL_WIDTH_MARGIN_PX,
          height: box.height,
          labelpos: "c",
        },
      });
    }
  }
  // add one edge per unique ordered concept pair, carrying its wrapped label size
  // from_key and to_key are read directly from the structured entry -- no string
  // splitting needed, so multi-word concept keys are safe.
  for (const entry of edge_labels.values()) {
    graph.setEdge(entry.from_key, entry.to_key, entry.label);
  }
  return graph;
}

//============================================
// compute_layout
//============================================
// Lay out the concept map and return one positioned node per unique concept
// plus the overall canvas extent. Deterministic: identical triples always
// produce identical coordinates. Never throws on a cyclic graph (greedy
// acyclicer handles cycles internally).
export function compute_layout(triples: Triple[]): LayoutResult {
  // gather unique concepts with their display labels
  const labels = collect_concepts(triples);
  // assemble and run the dagre layout
  const graph = build_graph(triples, labels);
  dagre.layout(graph);
  // read back the laid-out center coordinates and sizes for each concept
  const nodes = new Map<ConceptKey, LayoutNode>();
  for (const [key, label] of labels) {
    const laid = as_dagre_node(graph.node(key));
    nodes.set(key, {
      x: laid.x,
      y: laid.y,
      w: laid.width,
      h: laid.height,
      label,
    });
  }
  // overall canvas extent dagre computed for the laid-out graph
  const graph_label = as_dagre_graph_label(graph.graph());
  const width = graph_label.width ?? 0;
  const height = graph_label.height ?? 0;
  const result: LayoutResult = { nodes, width, height };
  return result;
}
