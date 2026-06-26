// Shared contract for the pseudo-code flowchart app.
//
// This module is pure TypeScript with zero imports from Solid or the DOM.
// Every other package imports its model types and normalizers from
// here, so it is the frozen contract for the whole codebase.

export type NodeShape =
  | "terminal"
  | "io"
  | "process"
  | "decision"
  | "loop"
  | "subroutine"
  | "comment"
  | "connector";

export type FlowEdgeBranch = "true" | "false";

export type FlowEdgeKind = "flow" | "comment" | "back";

export type FlowNodeId = string;

export interface FlowNode {
  id: FlowNodeId;
  shape: NodeShape;
  text: string;
  line: number;
}

export interface FlowEdge {
  id: string;
  from: FlowNodeId;
  to: FlowNodeId;
  branch?: FlowEdgeBranch;
  kind: FlowEdgeKind;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// Color palette applied document-wide. Node shapes are part of FlowNode, not
// the theme.
export type ThemePalette = "earth" | "fire";

export interface FlowTheme {
  palette: ThemePalette;
}

// A drag-adjusted node position, keyed by FlowNode.id in FlowDocument.overrides.
export interface Position {
  x: number;
  y: number;
}

export interface FlowDocument {
  format: "pseudo-code-flowchart";
  version: 1;
  title: string;
  source: string;
  overrides: Record<FlowNodeId, Position>;
  theme: FlowTheme;
}

// Hover/focus state for flowchart nodes so cross-highlighting stays in sync. A
// null source means nothing is hovered. nodeId carries the hovered FlowNode.id.
export interface HoverState {
  source: "node" | null;
  nodeId: FlowNodeId | null;
}
