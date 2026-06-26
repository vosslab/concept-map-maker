// concept_edge.tsx - one rendered concept-map edge (SVG).
//
// Renders a single directed triple as a cubic-bezier <path> with an arrowhead
// marker and a verb label. Geometry comes entirely from the pure edge_geometry
// module: node boxes are built from the resolved render position (drag override
// or layout center) plus the laid-out width/height, curvature is assigned across
// the complete triple set, and self-loops use self_loop_path. Same-key endpoints
// draw a self-loop instead of a straight edge.
//
// Presentation is expressed as INLINE SVG attributes (stroke, fill, font-family,
// font-size), never CSS classes, because the SVG export serializes this DOM and
// must carry its own styling. Hover is the one interaction concern: a pointer on
// the path sets edge hover state, and membership in highlighted_triples() swaps
// the stroke to the accent color and switches to the highlight arrowhead marker.

import type { JSX } from "solid-js";
import { For, Show } from "solid-js";

import type { AppState } from "./app_state";
import type { Triple, ThemeShape } from "./types";
import { concept_key } from "./types";
import type { NodeBox, EdgeGeometry, Point } from "./edge_geometry";
import { edge_path, self_loop_path } from "./edge_geometry";
import { map_is_dark } from "./ui_theme";
import { wrap_verb_label, LABEL_LINE_H_PX, LABEL_FONT_SIZE_PX } from "./label_wrap";

// Marker ids defined once in the canvas <defs>; referenced by concept edges via
// marker-end. Exported so map_canvas owns the matching <marker> elements and the
// two files cannot drift on the id strings.
export const ARROW_MARKER_ID = "cmap-arrow";
export const ARROW_HIGHLIGHT_MARKER_ID = "cmap-arrow-highlight";

// Base edge color (medium gray) and the accent used when an edge is highlighted.
// Kept here as inline-attribute constants rather than CSS so the exported SVG is
// self-contained.
const EDGE_COLOR = "#6a6a6a";
const EDGE_ACCENT_COLOR = "#1565c0";

// Dark-mode screen variants. These apply ONLY to the on-screen map when the
// resolved UI theme is dark; export always forces light (map_is_dark() returns
// false during export), so the exported SVG/PNG uses the light constants above.
// Edge stroke is lightened so it reads against a dark pane; the highlight accent
// is brightened for the same reason.
const EDGE_COLOR_DARK = "#9a9a9a";
const EDGE_ACCENT_COLOR_DARK = "#5aabff";

// Stroke widths: edges are thin normally and thicken slightly when highlighted.
const EDGE_WIDTH = 1.5;
const EDGE_HIGHLIGHT_WIDTH = 2.5;

// Verb label typography. The web-safe stack matches the layout width estimate
// and the node renderer so labels measure consistently across modules.
const LABEL_FONT_FAMILY = "Helvetica, Arial, sans-serif";
// Rendered font-size string, taken from the shared label-sizing module so the
// drawn font and the wrap/placement math cannot drift on a literal.
const LABEL_FONT_SIZE = String(LABEL_FONT_SIZE_PX);
const LABEL_COLOR = "#2a2a2a";

// Dark-mode screen variants for the verb label. The light halo ("#ffffff") is
// the white box behind the verb text; on a dark pane it looks broken, so in dark
// mode the halo becomes the dark surface color and the text becomes light.
const LABEL_COLOR_DARK = "#e0e0e0";
const LABEL_HALO_COLOR = "#ffffff";
const LABEL_HALO_COLOR_DARK = "#1e1e1e";

// Width of the halo painted behind label glyphs (via paint-order: stroke) so
// verb text stays legible where it crosses an edge or a bubble.
const LABEL_HALO_WIDTH = 4;

// Props for one edge. The canvas passes the shared AppState plus the triple, the
// precomputed curvature for this triple, and the boxes already resolved for both
// endpoints (the canvas resolves positions once per render and skips triples with
// a missing endpoint, so boxes are always present here).
export interface ConceptEdgeProps {
  state: AppState;
  triple: Triple;
  curvature: number;
  from_box: NodeBox;
  to_box: NodeBox;
  // The resolved label anchor for this edge, computed by the centralized label
  // placement pass (src/label_layout.ts) over the whole edge set so labels avoid
  // both node bubbles AND each other. The canvas recomputes the pass from its
  // live node_boxes memo, so a dragged bubble re-places every label (override-
  // aware). Empty-verb edges render no label; their value here is unused.
  label_pos: Point;
}

//============================================
// ConceptEdge
//============================================
// Render the path + arrowhead + verb label for a single triple. Self-loops
// (from and to normalize to the same key) use self_loop_path; everything else
// uses edge_path with the assigned curvature.
export function ConceptEdge(props: ConceptEdgeProps): JSX.Element {
  // map-wide bubble shape drives boundary clipping in the geometry helpers
  const shape = (): ThemeShape => props.state.doc.theme.shape;

  // a self-loop when both endpoints share one normalized concept key
  const is_self_loop = (): boolean =>
    concept_key(props.triple.from) === concept_key(props.triple.to);

  // resolve the SVG geometry: self-loop arc or a clipped cubic with curvature
  const geometry = (): EdgeGeometry => {
    if (is_self_loop()) {
      return self_loop_path(props.from_box, shape());
    }
    return edge_path(props.from_box, props.to_box, shape(), props.curvature);
  };

  // label anchor: resolved by the centralized placement pass and handed in as a
  // prop. The pass scores every label against node bubbles AND already-placed
  // labels, so this anchor already avoids label-vs-label overprint.
  const label_pos = (): Point => props.label_pos;

  // highlight membership: this triple is emphasized when the hover-derived set
  // contains its id (row hover, edge hover, or node hover on an endpoint)
  const is_highlighted = (): boolean => props.state.highlighted_triples().has(props.triple.id);

  // inline stroke and width switch on highlight; the highlight marker recolors
  // the arrowhead to match the accented path. Colors switch on the resolved
  // map theme: dark mode uses lighter variants, light mode is unchanged.
  const base_color = (): string => (map_is_dark() ? EDGE_COLOR_DARK : EDGE_COLOR);
  const accent_color = (): string => (map_is_dark() ? EDGE_ACCENT_COLOR_DARK : EDGE_ACCENT_COLOR);
  const label_text_color = (): string => (map_is_dark() ? LABEL_COLOR_DARK : LABEL_COLOR);
  const label_halo_color = (): string => (map_is_dark() ? LABEL_HALO_COLOR_DARK : LABEL_HALO_COLOR);
  const stroke_color = (): string => (is_highlighted() ? accent_color() : base_color());
  const stroke_width = (): number => (is_highlighted() ? EDGE_HIGHLIGHT_WIDTH : EDGE_WIDTH);
  const marker = (): string =>
    is_highlighted() ? `url(#${ARROW_HIGHLIGHT_MARKER_ID})` : `url(#${ARROW_MARKER_ID})`;

  // pointer enter on the edge announces an edge hover for cross-highlighting;
  // pointer leave clears it. tripleId carries the highlight; conceptKey is null
  // because an edge hover targets the relationship, not a single bubble.
  const on_enter = (): void => {
    props.state.set_hover({ source: "edge", tripleId: props.triple.id, conceptKey: null });
  };
  const on_leave = (): void => {
    props.state.set_hover({ source: null, tripleId: null, conceptKey: null });
  };

  // Reactive accessor: wrap the verb into an array of display lines.
  // Returns [] for empty/whitespace verbs (Show guard below handles that case).
  const lines = (): string[] => wrap_verb_label(props.triple.verb);

  return (
    <g data-edge-id={props.triple.id}>
      {/* The visible curved path with an arrowhead marker at its target end. */}
      <path
        d={geometry().d}
        fill="none"
        stroke={stroke_color()}
        stroke-width={stroke_width()}
        marker-end={marker()}
        // a transparent, wider hit area would be ideal, but a single path keeps
        // the exported SVG minimal; pointer-events on the stroke is enough for a
        // 1.5-2.5px line plus the visible arrowhead
        pointer-events="stroke"
        style={{ cursor: "pointer" }}
        onPointerEnter={on_enter}
        onPointerLeave={on_leave}
      />
      {/* Verb label at the maximum-clearance point along the curve, with a white
          stroke halo painted behind the fill via paint-order so it stays
          readable over edges. Multi-line: one <tspan> per wrapped line,
          vertically centered on the placed y. The <text> anchor and stroke
          attributes are inherited by each tspan so the halo renders per-line via
          paint-order="stroke".
          The anchor comes from the centralized label placement pass
          (src/label_layout.ts), which treats node boxes AND already-placed
          labels as obstacles, so sibling and parallel labels avoid each other by
          construction rather than overprinting. */}
      <Show when={props.triple.verb.trim().length > 0}>
        <text
          x={label_pos().x}
          y={label_pos().y}
          text-anchor="middle"
          dominant-baseline="middle"
          font-family={LABEL_FONT_FAMILY}
          font-size={LABEL_FONT_SIZE}
          fill={is_highlighted() ? accent_color() : label_text_color()}
          stroke={label_halo_color()}
          stroke-width={LABEL_HALO_WIDTH}
          paint-order="stroke"
          pointer-events="none"
        >
          {/* Each line gets a <tspan> with an explicit x to re-center it.
              dy positions the block: the first line shifts up by half the total
              block height above label_y so the block is centered; each subsequent
              line advances one LABEL_LINE_H_PX below the previous. */}
          <For each={lines()}>
            {(line, index) => {
              // First line: shift up so the whole block is vertically centered.
              // Subsequent lines: advance one line-height down.
              const dy =
                index() === 0
                  ? `${(-(lines().length - 1) / 2) * LABEL_LINE_H_PX}`
                  : `${LABEL_LINE_H_PX}`;
              return (
                <tspan x={label_pos().x} dy={dy}>
                  {line}
                </tspan>
              );
            }}
          </For>
        </text>
      </Show>
    </g>
  );
}
