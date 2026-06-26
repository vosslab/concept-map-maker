// flow_edge.tsx - one rendered flowchart edge (SVG).
//
// Renders a single flowchart edge from pre-computed geometry: a path "d" string,
// a branch-label anchor, the edge kind, and an optional branch value. No
// AppState is referenced; this component is purely presentational and reads no
// global state.
//
// Style by kind:
//   "flow"    - solid gray stroke, standard arrowhead
//   "comment" - dashed gray stroke, standard arrowhead
//   "back"    - solid slate-blue stroke, distinct back-edge arrowhead
//
// Branch labels ("True" / "False") appear only when edge.branch is set. Edges
// carry no free-text labels.
//
// Presentation is expressed as inline SVG attributes (stroke, fill,
// font-family, font-size) so the exported SVG carries its own styling.
//
// map_canvas.tsx owns the matching <marker> defs referenced here;
// marker id constants are exported so the two files cannot drift.

import type { JSX } from "solid-js";
import { Show } from "solid-js";

import type { FlowEdgeBranch, FlowEdgeKind } from "./types";
import { map_is_dark } from "./ui_theme";

// Marker ids defined once in the canvas <defs>; referenced by flow edges via
// marker-end. Exported so map_canvas owns the matching <marker> elements and
// the two files cannot drift on the id strings.
export const ARROW_MARKER_ID = "pseudo-flow-arrow";
// Distinct arrowhead for back (loop return) edges, colored to match BACK_COLOR.
// map_canvas must add a <marker id={ARROW_BACK_MARKER_ID}> with that fill.
export const ARROW_BACK_MARKER_ID = "pseudo-flow-arrow-back";

// Stroke color for flow and comment edges (medium gray).
const FLOW_COLOR = "#6a6a6a";

// Stroke color for back (loop return) edges: a muted slate-blue so back edges
// read as a deliberate loop-return path rather than a plain forward edge.
// This value must match ARROW_BACK_COLOR in map_canvas.tsx.
const BACK_COLOR = "#5a5a9a";

// Stroke width for all flow edges.
const EDGE_WIDTH = 1.5;

// Stroke-dasharray applied to comment edges so they render as dashed lines.
const COMMENT_DASH = "6 4";

// Branch label typography. Web-safe stack matches the node renderer.
const LABEL_FONT_FAMILY = "Helvetica, Arial, sans-serif";
const LABEL_FONT_SIZE = "13";
// Branch label fill colors. "True" renders in green; "False" renders in red.
// Each has a light-mode and dark-mode shade chosen for >= 5.5:1 contrast
// against the halo that backs the label (white in light mode, near-black in
// dark mode). Color reinforces the label text; the text string ("True" /
// "False") conveys the meaning independently of color.
const LABEL_TRUE_COLOR = "#176117"; // deep green, ~7.6:1 on #ffffff
const LABEL_TRUE_COLOR_DARK = "#4caf50"; // bright green, ~6.0:1 on #1e1e1e
const LABEL_FALSE_COLOR = "#b43628"; // deep red, ~6.0:1 on #ffffff
const LABEL_FALSE_COLOR_DARK = "#ff6c60"; // bright red, ~6.0:1 on #1e1e1e
// Halo behind the label glyph so text stays legible when it overlaps an edge.
// Light mode uses white; dark mode uses near-black to blend with the canvas.
const LABEL_HALO_COLOR = "#ffffff";
const LABEL_HALO_COLOR_DARK = "#1e1e1e";
const LABEL_HALO_WIDTH = 3;
// Vertical offset applied above the geometry anchor so the branch label reads
// away from the edge path rather than sitting directly on it.
const LABEL_OFFSET_Y = -8;

//============================================
// FlowEdgeProps
//============================================
// Presentational props for one rendered flowchart edge. All geometry is
// pre-computed by the caller (map_canvas calls flow_edge_path or
// compute_back_edge_geometry and passes the results here).
//
// Prop contract:
//   edge_id  string           FlowEdge.id; written to data-edge-id
//   kind     FlowEdgeKind     "flow" | "comment" | "back" - drives style
//   branch   FlowEdgeBranch?  "true" -> "True", "false" -> "False";
//                             undefined = no label
//   d        string           SVG path "d" from geometry.d
//   label_x  number           branch-label anchor x from geometry.label_x
//   label_y  number           branch-label anchor y from geometry.label_y
export interface FlowEdgeProps {
  edge_id: string;
  kind: FlowEdgeKind;
  branch?: FlowEdgeBranch;
  d: string;
  label_x: number;
  label_y: number;
}

//============================================
// branch_label_text
//============================================
// Map a branch value to its display string.
// "true" renders as "True"; "false" renders as "False".
function branch_label_text(branch: FlowEdgeBranch): string {
  if (branch === "true") {
    return "True";
  }
  return "False";
}

//============================================
// branch_label_fill
//============================================
// Return the fill color for a branch label. True branch renders in green;
// False branch renders in red. Both shades are chosen per-theme so contrast
// against the label halo clears 5.5:1 in light and dark mode.
// Color reinforces the text; the text string carries the semantic meaning.
function branch_label_fill(branch: FlowEdgeBranch): string {
  if (branch === "true") {
    return map_is_dark() ? LABEL_TRUE_COLOR_DARK : LABEL_TRUE_COLOR;
  }
  return map_is_dark() ? LABEL_FALSE_COLOR_DARK : LABEL_FALSE_COLOR;
}

//============================================
// FlowEdge
//============================================
// Render the SVG path and optional branch label for one flowchart edge.
// Self-loops are not used in flowchart mode (the parser emits only forward,
// dashed comment, or orthogonal back edges); no self-loop path is drawn.
export function FlowEdge(props: FlowEdgeProps): JSX.Element {
  // Stroke color: back edges use a distinct slate-blue to signal loop-return.
  const stroke_color = (): string => {
    if (props.kind === "back") {
      return BACK_COLOR;
    }
    return FLOW_COLOR;
  };

  // Arrowhead marker: back edges use the distinct back-edge marker.
  const marker_end = (): string => {
    if (props.kind === "back") {
      return `url(#${ARROW_BACK_MARKER_ID})`;
    }
    return `url(#${ARROW_MARKER_ID})`;
  };

  // Stroke-dasharray: comment edges are dashed; flow and back edges are solid.
  const stroke_dash = (): string | undefined => {
    if (props.kind === "comment") {
      return COMMENT_DASH;
    }
    return undefined;
  };

  return (
    <g data-edge-id={props.edge_id} data-kind={props.kind}>
      {/* Visible edge path with an arrowhead marker at the target end. */}
      <path
        d={props.d}
        fill="none"
        stroke={stroke_color()}
        stroke-width={EDGE_WIDTH}
        stroke-dasharray={stroke_dash()}
        marker-end={marker_end()}
        pointer-events="stroke"
        style={{ cursor: "pointer" }}
      />
      {/* Branch label ("True" or "False") at the geometry midpoint anchor,
          offset slightly above the path. Rendered only for branch edges;
          plain flow and back edges carry no label. A white halo via
          paint-order makes the text legible when it overlaps the path. */}
      <Show when={props.branch}>
        {(branch) => (
          <text
            x={props.label_x}
            y={props.label_y + LABEL_OFFSET_Y}
            text-anchor="middle"
            dominant-baseline="middle"
            font-family={LABEL_FONT_FAMILY}
            font-size={LABEL_FONT_SIZE}
            fill={branch_label_fill(branch())}
            stroke={map_is_dark() ? LABEL_HALO_COLOR_DARK : LABEL_HALO_COLOR}
            stroke-width={LABEL_HALO_WIDTH}
            paint-order="stroke"
            pointer-events="none"
          >
            {branch_label_text(branch())}
          </text>
        )}
      </Show>
    </g>
  );
}
