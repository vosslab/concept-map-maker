// flow_node.tsx - one flowchart node in the SVG map canvas.
//
// Purely presentational leaf renderer: callers supply shape and label directly
// via props; this component only converts those values into SVG geometry.
//
// Per-shape SVG geometry:
//   terminal   -> ellipse (oval start/end symbol)
//   io         -> parallelogram polygon (input/output)
//   process    -> rectangle (plain process box; also the fallback)
//   decision   -> diamond polygon (if/branch)
//   loop       -> hexagon polygon (while/for header)
//   subroutine -> rect with inner vertical divider lines (predefined process)
//   comment    -> dashed three-sided open rect (annotation)
//   connector  -> circle (branch-rejoin / loop-exit join)
//
// Each rendered node carries data-shape="<kind>" and an accessible aria-label
// so Playwright tests can assert per-node shape type and screen readers have a
// meaningful label.
//
// Drag coordinate handling: the canvas applies the pan/zoom transform on an
// inner <g data-viewport> and a viewBox on the <svg>. This component converts
// pointer client coordinates into its own local user space via
// getScreenCTM().inverse(). That CTM folds in the viewBox AND the viewport
// transform, so drag math stays correct under any pan/zoom.

import { createMemo } from "solid-js";
import type { JSX } from "solid-js";

import { ORIGIN_EMPHASIS } from "./themes";
import { depth_fill } from "./palettes";
import { DECISION_WRAP_MAX_CHARS, DECISION_LINE_HEIGHT_PX, wrap_label } from "./label_wrap";
import type { AppState } from "./app_state";
import type { FlowNodeId, NodeShape } from "./types";
import type { NodeBox } from "./edge_geometry";
import { map_is_dark } from "./ui_theme";

//============================================
// Highlight ring colors
//============================================
// Role -> stroke color for the hover cross-highlight ring. "both" uses a purple
// blend so a node-hover ring reads distinctly from the directional roles. Inline
// colors (not CSS vars) keep the SVG self-contained for static export.
const HIGHLIGHT_RING: Record<"from" | "to" | "both", string> = {
  from: "#5aabff", // soft blue
  to: "#e8990a", // amber
  both: "#9b59b6", // purple blend (node hover)
};

// Label typography. Helvetica/Arial keeps text identical across browsers and in
// the static SVG export, where no app CSS is present.
const LABEL_FONT = "Helvetica, Arial, sans-serif";
const LABEL_FONT_SIZE = "14";

// Base (non-origin) border color and width.
const BASE_STROKE = "#555555";
const BASE_STROKE_WIDTH = 1;

// Dark-mode screen variant. The bubble FILL palette stays authored/unchanged;
// only the border color shifts for contrast on a dark pane. Export forces light,
// so the exported SVG/PNG uses the light values above (map_is_dark() = false).
const BASE_STROKE_DARK = "#9a9a9a";

// io (parallelogram): horizontal skew applied to both the top and bottom edges.
// Both edges shift by IO_SKEW in the same direction, giving the slanted sides.
const IO_SKEW = 10;

// loop (hexagon): the horizontal corner cutaway expressed as a ratio of node
// height. A value of 0.35 gives clean proportions for the fixed 36px node height.
const HEX_CORNER_RATIO = 0.35;

// subroutine: distance from the outer border to the inner vertical divider lines,
// producing the "predefined process" double-border appearance.
const SUBROUTINE_INSET = 6;

// comment: SVG stroke-dasharray for the dashed open-rect border.
const COMMENT_DASH = "6 3";

// Outer halo padding (map units) and stroke width for the hover highlight ring.
const RING_PAD = 4;
const RING_WIDTH = 3;

//============================================
// label_color_for_fill
//============================================
// Choose a near-black or near-white label color that maximises contrast against
// the given hex fill using the WCAG relative-luminance formula (IEC 61966-2-1).
// White wins only when it yields strictly higher contrast; otherwise black wins.
// The selected color works in live SVG and in static exports where no CSS loads.
function srgb_linearize(channel_255: number): number {
  // Convert an 8-bit sRGB channel value [0-255] to linear light [0-1].
  const c = channel_255 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relative_luminance(hex: string): number {
  // WCAG 2.x relative luminance: L = 0.2126R + 0.7152G + 0.0722B (linear).
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * srgb_linearize(r) + 0.7152 * srgb_linearize(g) + 0.0722 * srgb_linearize(b);
}

function contrast_ratio(L1: number, L2: number): number {
  // WCAG contrast ratio given two relative luminances.
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Black and white label luminances (pre-computed constants).
const BLACK_LABEL = "#000000";
const WHITE_LABEL = "#ffffff";
const L_BLACK = 0; // relative luminance of #000000
const L_WHITE = 1; // relative luminance of #ffffff

function label_color_for_fill(fill_hex: string): string {
  // Return the label color (black or white) that maximises contrast against
  // the given fill. White wins only when it yields strictly higher contrast.
  const L_fill = relative_luminance(fill_hex);
  const ratio_black = contrast_ratio(L_fill, L_BLACK);
  const ratio_white = contrast_ratio(L_fill, L_WHITE);
  return ratio_white > ratio_black ? WHITE_LABEL : BLACK_LABEL;
}

//============================================
// FlowNodeProps
//============================================
export interface FlowNodeProps {
  // The FlowNode.id for this node. Used as the drag/hover key so overrides
  // and cross-highlights resolve to the correct node.
  node_id: FlowNodeId;
  // Center-based geometry from the canvas layout slot, passed as a reactive
  // accessor so attributes patch in place across drag moves (the <g> persists).
  box: () => NodeBox;
  // The shared reactive app state (theme, depths, hover, overrides).
  state: AppState;
  // The flowchart shape for this node, supplied by the render loop.
  // Determines the SVG geometry emitted and the data-shape attribute value.
  shape: NodeShape;
  // The visible label text (FlowNode.text), supplied by the render loop.
  // Rendered inside the node and used as the accessible aria-label.
  label: string;
}

//============================================
// client_to_local
//============================================
// Convert a screen-space pointer position into the group's local user space
// using the live SVG CTM. The element's getScreenCTM() folds in the <svg>
// viewBox and the <g data-viewport> pan/zoom transform, so the result is in the
// same coordinate space as box.x / box.y. Returns null when no CTM is available
// (element not yet mounted), so the caller can skip the update safely.
function client_to_local(
  el: SVGGraphicsElement,
  client_x: number,
  client_y: number,
): { x: number; y: number } | null {
  const ctm = el.getScreenCTM();
  if (ctm === null) {
    return null;
  }
  const point = new DOMPoint(client_x, client_y);
  const local = point.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

//============================================
// FlowNode
//============================================
export function FlowNode(props: FlowNodeProps): JSX.Element {
  // Drag bookkeeping. grab_offset is the vector from the bubble center to the
  // pointer at pointerdown, so the bubble does not jump to the cursor on grab.
  let dragging = false;
  let grab_offset = { x: 0, y: 0 };

  // pointerdown: capture the pointer so we keep receiving moves even if the
  // cursor leaves the bubble, and record the grab offset from the center. The
  // stopPropagation keeps the canvas background-pan handler from also firing.
  function handle_pointer_down(e: PointerEvent): void {
    // only react to the primary button
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as SVGGElement;
    const local = client_to_local(target, e.clientX, e.clientY);
    if (local === null) {
      return;
    }
    target.setPointerCapture(e.pointerId);
    dragging = true;
    grab_offset = { x: local.x - props.box().x, y: local.y - props.box().y };
  }

  // pointermove: while dragging, write the new center (pointer minus grab offset)
  // into the override store. Layout never reads overrides, so this does not
  // re-run dagre.
  function handle_pointer_move(e: PointerEvent): void {
    if (!dragging) {
      return;
    }
    e.preventDefault();
    const target = e.currentTarget as SVGGElement;
    const local = client_to_local(target, e.clientX, e.clientY);
    if (local === null) {
      return;
    }
    const next_x = local.x - grab_offset.x;
    const next_y = local.y - grab_offset.y;
    props.state.set_override(props.node_id, { x: next_x, y: next_y });
  }

  // pointerup / lostpointercapture: end the drag. Routing both events here means
  // an interrupted drag (capture stolen by an alert, focus loss) ends safely
  // instead of sticking in the dragging state.
  function end_drag(e: PointerEvent): void {
    if (!dragging) {
      return;
    }
    dragging = false;
    const target = e.currentTarget as SVGGElement;
    // release only if we still hold capture; lostpointercapture already lost it
    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }
  }

  // Hover wiring: a node hover lights up every edge touching this node.
  function handle_pointer_enter(): void {
    props.state.set_hover({ source: "node", nodeId: props.node_id });
  }
  function handle_pointer_leave(): void {
    // do not clear hover mid-drag; the drag owns interaction until pointerup
    if (dragging) {
      return;
    }
    props.state.set_hover({ source: null, nodeId: null });
  }

  //--------------------------------------------
  // Visual properties
  //--------------------------------------------

  // Reactive fill from the palette + this node's BFS depth. A node absent from
  // the depth map (not yet laid out, or unreachable from any origin) falls back
  // to depth 0, which yields the first palette color.
  const fill = createMemo(() => {
    const depth = props.state.depths().depth_by_key.get(props.node_id) ?? 0;
    return depth_fill(props.state.doc.theme.palette, depth);
  });

  // Origin emphasis: thicker saturated border when this node is a graph origin.
  const is_origin = createMemo(() => props.state.depths().origin_keys.has(props.node_id));

  // Hover highlight role for this node, or undefined when not highlighted.
  const highlight_role = createMemo(() => props.state.highlighted_nodes().get(props.node_id));

  // Base vs. origin-emphasis border. The non-origin base border lightens in dark
  // mode for contrast; the origin emphasis stroke stays as authored in both modes.
  const base_stroke = (): string => (map_is_dark() ? BASE_STROKE_DARK : BASE_STROKE);
  // Derive label color from fill to maximise contrast regardless of display mode.
  const label_fill = (): string => label_color_for_fill(fill());
  const stroke_color = createMemo(() => (is_origin() ? ORIGIN_EMPHASIS.stroke : base_stroke()));
  const stroke_width = createMemo(() =>
    is_origin() ? ORIGIN_EMPHASIS.stroke_width : BASE_STROKE_WIDTH,
  );

  //--------------------------------------------
  // Shape rendering
  //--------------------------------------------
  // render_shape: dispatch props.shape to its matching SVG geometry element.
  // Render the primary SVG shape for props.shape. All shapes use box().x /
  // box().y as the center and box().w / box().h as the full bounding extent.
  function render_shape(): JSX.Element {
    const x = props.box().x;
    const y = props.box().y;
    const w = props.box().w;
    const h = props.box().h;
    const f = fill();
    const sc = stroke_color();
    const sw = stroke_width();

    if (props.shape === "terminal") {
      // oval / ellipse: the standard flowchart start/end symbol
      return <ellipse cx={x} cy={y} rx={w / 2} ry={h / 2} fill={f} stroke={sc} stroke-width={sw} />;
    }

    if (props.shape === "connector") {
      // small circle: branch-rejoin and loop-exit connector node
      const r = Math.min(w, h) / 2;
      return <circle cx={x} cy={y} r={r} fill={f} stroke={sc} stroke-width={sw} />;
    }

    if (props.shape === "io") {
      // parallelogram: both top and bottom edges shift in the same direction by
      // IO_SKEW, producing the standard input/output slanted-sides symbol.
      const skew = IO_SKEW;
      const pts = [
        `${x - w / 2 + skew},${y - h / 2}`,
        `${x + w / 2 + skew},${y - h / 2}`,
        `${x + w / 2 - skew},${y + h / 2}`,
        `${x - w / 2 - skew},${y + h / 2}`,
      ].join(" ");
      return <polygon points={pts} fill={f} stroke={sc} stroke-width={sw} />;
    }

    if (props.shape === "decision") {
      // diamond: midpoints of the bounding box sides become the four vertices
      const pts = [
        `${x},${y - h / 2}`,
        `${x + w / 2},${y}`,
        `${x},${y + h / 2}`,
        `${x - w / 2},${y}`,
      ].join(" ");
      return <polygon points={pts} fill={f} stroke={sc} stroke-width={sw} />;
    }

    if (props.shape === "loop") {
      // hexagon (preparation symbol): pointed left/right ends, flat top/bottom.
      // Corner cutaway is HEX_CORNER_RATIO * h so it scales with node height.
      const skew = h * HEX_CORNER_RATIO;
      const pts = [
        `${x - w / 2},${y}`,
        `${x - w / 2 + skew},${y - h / 2}`,
        `${x + w / 2 - skew},${y - h / 2}`,
        `${x + w / 2},${y}`,
        `${x + w / 2 - skew},${y + h / 2}`,
        `${x - w / 2 + skew},${y + h / 2}`,
      ].join(" ");
      return <polygon points={pts} fill={f} stroke={sc} stroke-width={sw} />;
    }

    if (props.shape === "subroutine") {
      // predefined-process / call node: filled outer rect with two inner vertical
      // divider lines SUBROUTINE_INSET px from each side (double-border effect).
      const lx = x - w / 2;
      const ty = y - h / 2;
      return (
        <g>
          {/* filled outer rectangle */}
          <rect x={lx} y={ty} width={w} height={h} fill={f} stroke={sc} stroke-width={sw} />
          {/* left inner vertical line */}
          <line
            x1={lx + SUBROUTINE_INSET}
            y1={ty}
            x2={lx + SUBROUTINE_INSET}
            y2={ty + h}
            stroke={sc}
            stroke-width={sw}
          />
          {/* right inner vertical line */}
          <line
            x1={lx + w - SUBROUTINE_INSET}
            y1={ty}
            x2={lx + w - SUBROUTINE_INSET}
            y2={ty + h}
            stroke={sc}
            stroke-width={sw}
          />
        </g>
      );
    }

    if (props.shape === "comment") {
      // open-ended dashed rect: three sides only, right side open.
      // A filled background rect keeps the label readable; the dashed path draws
      // the visible border and deliberately omits the right-side closing segment.
      const lx = x - w / 2;
      const rx = x + w / 2;
      const ty = y - h / 2;
      const by = y + h / 2;
      // path travels: top-right -> top-left -> bottom-left -> bottom-right (open)
      const d = `M ${rx},${ty} L ${lx},${ty} L ${lx},${by} L ${rx},${by}`;
      return (
        <g>
          {/* background fill so the text label remains readable */}
          <rect x={lx} y={ty} width={w} height={h} fill={f} stroke="none" />
          {/* dashed three-sided open border */}
          <path d={d} fill="none" stroke={sc} stroke-width={sw} stroke-dasharray={COMMENT_DASH} />
        </g>
      );
    }

    // process (and unknown-shape fallback): plain rectangle
    return (
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        fill={f}
        stroke={sc}
        stroke-width={sw}
      />
    );
  }

  // render_highlight_ring: dispatch props.shape to its expanded outline ring.
  // Render the hover highlight ring only when this node is highlighted. Drawn as
  // an outer outline with no fill so the depth fill remains visible underneath.
  // Ring geometry mirrors each shape's outline class for visual fidelity.
  function render_highlight_ring(): JSX.Element {
    const role = highlight_role();
    if (role === undefined) {
      return null;
    }
    const color = HIGHLIGHT_RING[role];
    const x = props.box().x;
    const y = props.box().y;
    const w = props.box().w;
    const h = props.box().h;

    if (props.shape === "terminal") {
      // expanded ellipse ring matching the oval shape
      return (
        <ellipse
          cx={x}
          cy={y}
          rx={w / 2 + RING_PAD}
          ry={h / 2 + RING_PAD}
          fill="none"
          stroke={color}
          stroke-width={RING_WIDTH}
        />
      );
    }

    if (props.shape === "connector") {
      // expanded circle ring matching the small connector circle
      const r = Math.min(w, h) / 2 + RING_PAD;
      return <circle cx={x} cy={y} r={r} fill="none" stroke={color} stroke-width={RING_WIDTH} />;
    }

    if (props.shape === "decision") {
      // expanded diamond ring: vertices pushed RING_PAD outward from center
      const pts = [
        `${x},${y - h / 2 - RING_PAD}`,
        `${x + w / 2 + RING_PAD},${y}`,
        `${x},${y + h / 2 + RING_PAD}`,
        `${x - w / 2 - RING_PAD},${y}`,
      ].join(" ");
      return <polygon points={pts} fill="none" stroke={color} stroke-width={RING_WIDTH} />;
    }

    if (props.shape === "comment") {
      // expanded open-rect ring mirroring the three-sided comment border
      const lx = x - w / 2 - RING_PAD;
      const rx = x + w / 2 + RING_PAD;
      const ty = y - h / 2 - RING_PAD;
      const by = y + h / 2 + RING_PAD;
      const d = `M ${rx},${ty} L ${lx},${ty} L ${lx},${by} L ${rx},${by}`;
      return <path d={d} fill="none" stroke={color} stroke-width={RING_WIDTH} />;
    }

    // io, process, loop, subroutine: simple expanded bounding-box rect ring.
    // A rect ring works cleanly as a hover indicator for these shapes.
    return (
      <rect
        x={x - w / 2 - RING_PAD}
        y={y - h / 2 - RING_PAD}
        width={w + RING_PAD * 2}
        height={h + RING_PAD * 2}
        fill="none"
        stroke={color}
        stroke-width={RING_WIDTH}
      />
    );
  }

  // render_label: draw the node's label text centered on the node.
  // Decisions wrap their condition onto multiple centered lines so the diamond
  // can be a balanced rhombus instead of a flat lozenge; every other shape stays
  // a single line. The full single-line text remains the <g> aria-label above,
  // so wrapping never changes the accessible name. Inline font attributes keep
  // the export self-contained; pointer-events none lets pointers fall through to
  // the shape below.
  function render_label(): JSX.Element {
    const cx = props.box().x;
    const cy = props.box().y;
    // decisions wrap; all other shapes render as a single line
    const lines =
      props.shape === "decision" ? wrap_label(props.label, DECISION_WRAP_MAX_CHARS) : [props.label];
    // offset the first line up so the stacked block is vertically centered on cy
    const first_dy = (-(lines.length - 1) / 2) * DECISION_LINE_HEIGHT_PX;
    return (
      <text
        x={cx}
        y={cy}
        fill={label_fill()}
        font-family={LABEL_FONT}
        font-size={LABEL_FONT_SIZE}
        text-anchor="middle"
        dominant-baseline="central"
        style={{ "pointer-events": "none", "user-select": "none" }}
      >
        {lines.map((line, index) => (
          // first tspan lifts the block to center; the rest step down one line
          <tspan x={cx} dy={index === 0 ? first_dy : DECISION_LINE_HEIGHT_PX}>
            {line}
          </tspan>
        ))}
      </text>
    );
  }

  return (
    <g
      class="flow-node"
      data-node-id={props.node_id}
      data-shape={props.shape}
      role="img"
      aria-label={props.label}
      style={{ cursor: "grab" }}
      onPointerDown={handle_pointer_down}
      onPointerMove={handle_pointer_move}
      onPointerUp={end_drag}
      onLostPointerCapture={end_drag}
      onPointerEnter={handle_pointer_enter}
      onPointerLeave={handle_pointer_leave}
    >
      {render_highlight_ring()}
      {render_shape()}
      {render_label()}
    </g>
  );
}
