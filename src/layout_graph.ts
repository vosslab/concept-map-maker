// Dagre layout adapter for the pseudo-code flowchart.
//
// Pure TypeScript with no Solid or DOM imports. Turns a derived FlowGraph into a
// deterministic, top-down (rankdir "TB") layered layout. The layout depends only
// on the graph, never on drag overrides, so a render-time merge
// (overrides[id] ?? layout[id]) can layer user adjustments on top without
// re-running layout.
//
// Loops introduce a back edge, which would make the graph cyclic. Dagre would
// otherwise loop forever ranking a cyclic graph, so we set acyclicer "greedy"
// as a safety net; back edges are also excluded from ranking (see
// build_flow_graph), leaving a forward DAG that ranks cleanly top-down.

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
// The index signature satisfies graphlib's EdgeLabel constraint. Flow edges
// carry no width/height here (branch labels are placed at render time), so an
// empty object is the default edge label.
interface DagreEdgeLabel {
  width?: number;
  height?: number;
  // dagre accepts "c" (center), "l" (left), or "r" (right) for label placement
  labelpos?: "c" | "l" | "r";
  [key: string]: unknown;
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
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`dagre node result is not an object: ${JSON.stringify(raw)}`);
  }
  const rec = raw as Record<string, unknown>;
  // every coordinate field is required and must be numeric
  if (
    typeof rec["x"] !== "number" ||
    typeof rec["y"] !== "number" ||
    typeof rec["width"] !== "number" ||
    typeof rec["height"] !== "number"
  ) {
    throw new Error(`dagre node result missing expected numeric fields: ${JSON.stringify(raw)}`);
  }
  // construct a typed result from the validated numeric fields
  const node: DagreNodeResult = {
    x: rec["x"],
    y: rec["y"],
    width: rec["width"],
    height: rec["height"],
  };
  return node;
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
  // extract typed locals so the narrowing from the throw guards above is explicit
  const width: number | undefined = typeof rec["width"] === "number" ? rec["width"] : undefined;
  const height: number | undefined = typeof rec["height"] === "number" ? rec["height"] : undefined;
  const label: DagreGraphLabel = { width, height };
  return label;
}

// Flow-graph model types. The pseudo-code pipeline (derive_graph -> this layout)
// consumes these directly.
import type { FlowGraph, FlowNode, FlowNodeId, NodeShape } from "./types";
import {
  DECISION_WRAP_MAX_CHARS,
  DECISION_LINE_HEIGHT_PX,
  wrap_label,
  longest_line_length,
} from "./label_wrap";

//============================================
// flowchart layout (pseudo-code pipeline)
//============================================
// A derived FlowGraph (one node per statement, carrying its NodeShape) is laid
// out top-down by dagre, with node sizes estimated PER SHAPE so diamonds and
// hexagons reserve the extra width their geometry needs and short connector
// circles stay compact. Drag overrides are keyed by FlowNode.id and merged at
// render time, so this pass depends only on the graph (deterministic).
//
// Loops introduce a kind:"back" edge from the body's last node up to the loop
// header, which would make the graph cyclic. acyclicer "greedy" lets dagre rank
// the graph without looping forever; the back edge's rendered geometry (bowed to
// one side, clear of the body) is computed later by edge_routing/edge_geometry,
// not here.

// Approximate advance width of one character at the flowchart label font. A
// slight over-estimate so shaped nodes never clip their statement text.
const FLOW_CHAR_WIDTH_PX = 8;

// Horizontal breathing room added to each side of the estimated text width so
// the label does not touch the node border.
const FLOW_NODE_PADDING_X_PX = 28;

// Lower bound on node width so very short statements still read as boxes rather
// than slivers.
const FLOW_MIN_NODE_WIDTH_PX = 90;

// Base node height for single-line statements. Decisions scale this up; the
// connector overrides it with a fixed circle diameter.
const FLOW_NODE_HEIGHT_PX = 48;

// Fixed diameter for connector circles. Connectors carry no statement text (they
// are pure branch rejoins / loop exits), so they stay small regardless of any id.
const FLOW_CONNECTOR_DIAMETER_PX = 36;

// Base vertical gap between rank layers (TB). A little larger than the concept
// map's gap so arrowheads and True/False branch labels have room to read.
const FLOW_RANK_SEP_PX = 54;

// Base horizontal gap between sibling nodes within a rank. Gives decision
// branches (the True and False children) clear horizontal separation.
const FLOW_NODE_SEP_PX = 60;

// Per-shape size adjustments. A hexagon's angled ends eat horizontal room, so
// it widens. A parallelogram's slant, a subroutine's inner bars, and a
// terminal's rounded ends each cost a little horizontal padding. The decision
// diamond is sized separately (see the decision constants below) because it
// wraps its condition and is shaped around the resulting text block.
const LOOP_WIDTH_FACTOR = 1.5;
const IO_SLANT_PAD_PX = 24;
const SUBROUTINE_BAR_PAD_PX = 16;
const TERMINAL_END_PAD_PX = 16;

// Decision diamond sizing. A diamond holds text only in its central rhombus: a
// text rectangle of width tw and height th fits when tw/W + th/H equals 1 (its
// corners touch the diamond's edges). We size the diamond around the WRAPPED
// text block so a long condition becomes a balanced rhombus rather than a flat
// lozenge:
//   - DECISION_TARGET_ASPECT fixes the width-to-height ratio (a rotated square
//     reads near 1:1; 1.3 keeps it comfortably inside the 1:1..1.5:1 band).
//   - DECISION_FILL_FACTOR (< 1) is the fraction of the inscribe budget the text
//     block uses, leaving margin between the text and the diamond edges.
// Solving tw/(aspect*H) + th/H = fill for H gives H = (tw/aspect + th)/fill,
// then W = aspect*H.
const DECISION_TARGET_ASPECT = 1.3;
const DECISION_FILL_FACTOR = 0.82;
// Approximate rendered width of one wrapped-label character at the label font.
// Slightly under FLOW_CHAR_WIDTH_PX since the wrapped block is centered with
// margin to spare; used only to estimate the inscribed text-block width.
const DECISION_CHAR_WIDTH_PX = 8;

// One laid-out flow node. x and y are the CENTER (dagre's convention); w and h
// are the full width and height the layout reserved for the node's shape. shape
// is carried through so the renderer can clip edges to the right boundary
// without a second lookup.
export interface FlowLayoutNode {
  x: number;
  y: number;
  w: number;
  h: number;
  shape: NodeShape;
}

// The full flow layout: one positioned node per FlowNode id, plus the overall
// canvas extent dagre computed (a starting viewBox before drag overrides and
// bowed back-edges are folded in by the bounds layer).
export interface FlowLayoutResult {
  nodes: Map<FlowNodeId, FlowLayoutNode>;
  width: number;
  height: number;
}

//============================================
// estimate_flow_text_width
//============================================
// Estimate the text-box width of a statement from its character count, padded
// on both sides and clamped to a minimum. Shape-specific widening is layered on
// top of this base by estimate_flow_node_size.
function estimate_flow_text_width(text: string): number {
  // estimate the text run width from character count
  const text_width = text.length * FLOW_CHAR_WIDTH_PX;
  // add padding on both sides
  const padded = text_width + FLOW_NODE_PADDING_X_PX * 2;
  // never go below the minimum box width
  const width = Math.max(padded, FLOW_MIN_NODE_WIDTH_PX);
  return width;
}

//============================================
// estimate_flow_node_size
//============================================
// Estimate the width and height dagre should reserve for a node, by shape.
// Connectors are a fixed circle; every other shape starts from the padded text
// box and is widened (and, for decisions, heightened) so the shape's geometry
// never clips the statement text.
function estimate_flow_node_size(node: FlowNode): { width: number; height: number } {
  // connector circles carry no text; reserve a fixed square so dagre centers them
  if (node.shape === "connector") {
    return { width: FLOW_CONNECTOR_DIAMETER_PX, height: FLOW_CONNECTOR_DIAMETER_PX };
  }
  // base text box shared by all text-bearing shapes
  const base_width = estimate_flow_text_width(node.text);
  let width = base_width;
  let height = FLOW_NODE_HEIGHT_PX;
  // widen (and heighten) per shape so angled or inset geometry keeps text clear
  switch (node.shape) {
    case "decision": {
      // wrap the condition into balanced lines, then size the diamond to inscribe
      // the resulting compact text block as a near-square rhombus
      const lines = wrap_label(node.text, DECISION_WRAP_MAX_CHARS);
      // text block extent: widest line drives width, line count drives height
      const text_w = longest_line_length(lines) * DECISION_CHAR_WIDTH_PX;
      const text_h = lines.length * DECISION_LINE_HEIGHT_PX;
      // solve the inscribe constraint for the height that holds the block at the
      // target aspect with fill-factor margin, then derive width from the aspect
      const diamond_h = (text_w / DECISION_TARGET_ASPECT + text_h) / DECISION_FILL_FACTOR;
      // floor the height so a very short condition still reads as a real diamond
      height = Math.max(diamond_h, FLOW_NODE_HEIGHT_PX);
      width = DECISION_TARGET_ASPECT * height;
      break;
    }
    case "loop":
      // a hexagon's angled ends cut into usable width
      width = base_width * LOOP_WIDTH_FACTOR;
      break;
    case "io":
      // a parallelogram's slant shifts the top and bottom edges sideways
      width = base_width + IO_SLANT_PAD_PX * 2;
      break;
    case "subroutine":
      // a double-struck rectangle reserves room for its inner vertical bars
      width = base_width + SUBROUTINE_BAR_PAD_PX * 2;
      break;
    case "terminal":
      // a stadium/oval terminal needs room for its rounded ends
      width = base_width + TERMINAL_END_PAD_PX * 2;
      break;
    case "process":
    case "comment":
      // plain rectangles use the base text box unchanged (connector returned
      // its fixed circle above, so it cannot reach this switch)
      break;
  }
  // round so the reserved geometry and the rendered geometry agree on integers
  const result = { width: Math.round(width), height: Math.round(height) };
  return result;
}

//============================================
// build_flow_graph
//============================================
// Assemble a dagre graph from a FlowGraph: every node sized by its shape, every
// FORWARD edge added by its (from, to) ids.
//
// Back edges (kind:"back") are deliberately EXCLUDED from the dagre graph. A back
// edge is a loop's return path from the body up to the header; feeding it to
// dagre makes the graph cyclic, and the greedy acyclicer then reverses an
// arbitrary edge in the cycle, which can rank the loop header BELOW its own body
// and tangle the whole chart (the exact failure the reference flowchart shows).
// Excluding back edges leaves a forward DAG that dagre ranks cleanly top-down,
// keeping each loop header above its body. The back edge's geometry is then
// routed around the laid-out body by edge_routing.route_back_edge -- it never
// participates in ranking. acyclicer "greedy" is kept only as a safety net for
// any unexpected forward cycle.
function build_flow_graph(graph: FlowGraph): Graph<GraphLabel, DagreNodeLabel, DagreEdgeLabel> {
  const dagre_graph = new dagre.graphlib.Graph<GraphLabel, DagreNodeLabel, DagreEdgeLabel>();
  // top-down layered layout; greedy acyclicer is a safety net only (the forward
  // graph is already a DAG once back edges are excluded). Constants documented above.
  dagre_graph.setGraph({
    rankdir: "TB",
    acyclicer: "greedy",
    ranksep: FLOW_RANK_SEP_PX,
    nodesep: FLOW_NODE_SEP_PX,
  });
  // dagre requires a default edge label; an empty object is a fine fallback
  dagre_graph.setDefaultEdgeLabel((): DagreEdgeLabel => ({}));
  // add every flow node as a shape-sized box keyed by its stable id
  for (const node of graph.nodes) {
    const size = estimate_flow_node_size(node);
    dagre_graph.setNode(node.id, {
      label: node.text,
      width: size.width,
      height: size.height,
    });
  }
  // add only the forward edges; back edges are routed at render time, not ranked
  for (const edge of graph.edges) {
    if (edge.kind === "back") {
      continue;
    }
    dagre_graph.setEdge(edge.from, edge.to, {});
  }
  return dagre_graph;
}

//============================================
// compute_flow_layout
//============================================
// Lay out a derived FlowGraph and return one positioned node per FlowNode id
// plus the overall canvas extent. Deterministic: identical graphs always produce
// identical coordinates. Loop back edges are excluded from ranking (see
// build_flow_graph), so a loop header is always positioned above its body.
export function compute_flow_layout(graph: FlowGraph): FlowLayoutResult {
  // assemble and run the dagre layout over the shape-sized nodes
  const dagre_graph = build_flow_graph(graph);
  dagre.layout(dagre_graph);
  // read back the laid-out center coordinates and sizes, carrying each shape
  const nodes = new Map<FlowNodeId, FlowLayoutNode>();
  for (const node of graph.nodes) {
    const laid = as_dagre_node(dagre_graph.node(node.id));
    nodes.set(node.id, {
      x: laid.x,
      y: laid.y,
      w: laid.width,
      h: laid.height,
      shape: node.shape,
    });
  }
  // overall canvas extent dagre computed for the laid-out graph
  const graph_label = as_dagre_graph_label(dagre_graph.graph());
  const width = graph_label.width ?? 0;
  const height = graph_label.height ?? 0;
  const result: FlowLayoutResult = { nodes, width, height };
  return result;
}
