// concept_node.tsx - one concept bubble in the SVG map canvas.
//
// Renders a single node as an SVG group: a shape (rect / rounded-rect / ellipse)
// filled by BFS depth, with a centered black label. Origin concepts get a
// thicker emphasis border; hover-highlighted concepts get a role-colored ring.
// The whole group is pointer-draggable: dragging writes a position override into
// app_state so the bubble persists across unrelated edits without re-running
// layout.
//
// This component is injected into the map canvas node_slot:
//   node_slot?(key, box) => JSX.Element
// where box is the center-based NodeBox from edge_geometry ({x,y} is the bubble
// center, w/h are full size). The concept key is used as the visible label, the
// same convention as the canvas default placeholder node.
//
// Drag coordinate handling: the canvas applies the pan/zoom transform on an
// inner <g data-viewport> and a viewBox on the <svg>. This component does NOT
// receive a screen_to_map converter (the canvas does not publish one), so it
// converts pointer client coordinates into its own local user space via the
// group element's getScreenCTM().inverse(). That CTM already folds in the
// viewBox AND the viewport transform, so drag math stays correct under any
// pan/zoom without coupling to the canvas internals.

import { createMemo } from "solid-js";
import type { JSX } from "solid-js";

import { SHAPE_REGISTRY, ORIGIN_EMPHASIS } from "./themes";
import { depth_fill } from "./palettes";
import type { AppState } from "./app_state";
import type { ConceptKey } from "./types";
import type { NodeBox } from "./edge_geometry";
import { map_is_dark } from "./ui_theme";

//============================================
// Highlight ring colors
//============================================
// Role -> stroke color for the hover cross-highlight ring. Values mirror the
// --from-accent / --to-accent CSS custom properties in style.css; "both" uses a
// purple blend so a self-referenced concept reads distinctly from either role.
// Inline colors (not CSS vars) keep the SVG self-contained for static export.
const HIGHLIGHT_RING: Record<"from" | "to" | "both", string> = {
  from: "#5aabff", // --from-accent (soft blue)
  to: "#e8990a", // --to-accent (amber)
  both: "#9b59b6", // purple blend (concept on both ends / node hover)
};

// Label typography. Helvetica/Arial keeps text identical across browsers and in
// the static SVG export, where no app CSS is present.
const LABEL_FONT = "Helvetica, Arial, sans-serif";
const LABEL_FONT_SIZE = "14";

// Base (non-origin) border color and width.
const BASE_STROKE = "#555555";
const BASE_STROKE_WIDTH = 1;

// Dark-mode screen variants. The bubble FILL palette (earth/fire from the doc
// theme) stays authored/unchanged; only the border color shifts for contrast
// against the depth fills on a dark pane. Export forces light, so the
// exported SVG/PNG uses the light values above (map_is_dark() returns false).
const BASE_STROKE_DARK = "#9a9a9a";

//============================================
// label_color_for_fill
//============================================
// Choose a near-black or near-white label that maximises contrast against the
// given hex fill, using the WCAG relative-luminance formula (IEC 61966-2-1).
// Picks whichever of the two candidates yields the higher ratio; when both are
// equal (near-neutral fill) black wins as the default. The selected color is
// inline-safe: it works in live SVG and in static exports where no CSS is
// loaded. Note: fills near mid-gray (luminance ~0.18) may not reach the 5.5:1
// repo target with either pure black or white; this is an inherent property of
// those fill hues and is flagged in the palette audit, not patched here.
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

// Outer halo padding (map units) and width for the hover highlight ring.
const RING_PAD = 4;
const RING_WIDTH = 3;

//============================================
// ConceptNodeProps
//============================================
export interface ConceptNodeProps {
  // The concept identity this bubble renders (also used as the visible label).
  conceptKey: ConceptKey;
  // Center-based geometry from the canvas layout slot, passed as a reactive
  // accessor so attributes patch in place across drag moves (the <g> persists).
  box: () => NodeBox;
  // The shared reactive app state (theme, depths, hover, overrides).
  state: AppState;
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
// ConceptNode
//============================================
export function ConceptNode(props: ConceptNodeProps): JSX.Element {
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
    props.state.set_override(props.conceptKey, { x: next_x, y: next_y });
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

  // Hover wiring: a node hover lights up every triple touching this concept.
  function handle_pointer_enter(): void {
    props.state.set_hover({ source: "node", tripleId: null, conceptKey: props.conceptKey });
  }
  function handle_pointer_leave(): void {
    // do not clear hover mid-drag; the drag owns interaction until pointerup
    if (dragging) {
      return;
    }
    props.state.set_hover({ source: null, tripleId: null, conceptKey: null });
  }

  // Reactive shape spec from the current theme.
  const shape_spec = createMemo(() => SHAPE_REGISTRY[props.state.doc.theme.shape]);

  // Reactive fill from palette + this concept's BFS depth (depth 0 fallback).
  const fill = createMemo(() => {
    const depth = props.state.depths().depth_by_key.get(props.conceptKey) ?? 0;
    return depth_fill(props.state.doc.theme.palette, depth);
  });

  // Origin emphasis: thicker saturated border when this concept is a graph origin.
  const is_origin = createMemo(() => props.state.depths().origin_keys.has(props.conceptKey));

  // Hover highlight role for this concept, or undefined when not highlighted.
  const highlight_role = createMemo(() => props.state.highlighted_concepts().get(props.conceptKey));

  // Base vs. origin-emphasis border. The hover highlight ring is a separate
  // outer shape so it composes with either border. The non-origin base border
  // lightens in dark mode for contrast; the origin emphasis stroke (a saturated
  // accent) is kept as authored in both themes.
  const base_stroke = (): string => (map_is_dark() ? BASE_STROKE_DARK : BASE_STROKE);
  // Derive label color from the bubble fill so contrast is always maximised,
  // regardless of light/dark mode. Because fill comes from the authored palette
  // (not a CSS variable), this is also correct in the static SVG/PNG export.
  const label_fill = (): string => label_color_for_fill(fill());
  const stroke_color = createMemo(() => (is_origin() ? ORIGIN_EMPHASIS.stroke : base_stroke()));
  const stroke_width = createMemo(() =>
    is_origin() ? ORIGIN_EMPHASIS.stroke_width : BASE_STROKE_WIDTH,
  );

  // Render the primary shape with inline presentation attributes (export-safe).
  function render_shape(): JSX.Element {
    if (shape_spec().is_ellipse) {
      return (
        <ellipse
          cx={props.box().x}
          cy={props.box().y}
          rx={props.box().w / 2}
          ry={props.box().h / 2}
          fill={fill()}
          stroke={stroke_color()}
          stroke-width={stroke_width()}
        />
      );
    }
    // capsule: stadium shape with rx = ry = half the node height (fully rounded ends)
    if (shape_spec().is_capsule) {
      const cap_r = props.box().h / 2;
      return (
        <rect
          x={props.box().x - props.box().w / 2}
          y={props.box().y - props.box().h / 2}
          width={props.box().w}
          height={props.box().h}
          rx={cap_r}
          ry={cap_r}
          fill={fill()}
          stroke={stroke_color()}
          stroke-width={stroke_width()}
        />
      );
    }
    // rect / rounded-rect: convert center-based box to top-left origin
    return (
      <rect
        x={props.box().x - props.box().w / 2}
        y={props.box().y - props.box().h / 2}
        width={props.box().w}
        height={props.box().h}
        rx={shape_spec().corner_radius}
        ry={shape_spec().corner_radius}
        fill={fill()}
        stroke={stroke_color()}
        stroke-width={stroke_width()}
      />
    );
  }

  // Render the hover highlight ring (only when highlighted). Drawn as an outer
  // outline with no fill so the depth fill stays visible underneath.
  function render_highlight_ring(): JSX.Element {
    const role = highlight_role();
    if (role === undefined) {
      return null;
    }
    const color = HIGHLIGHT_RING[role];
    if (shape_spec().is_ellipse) {
      return (
        <ellipse
          cx={props.box().x}
          cy={props.box().y}
          rx={props.box().w / 2 + RING_PAD}
          ry={props.box().h / 2 + RING_PAD}
          fill="none"
          stroke={color}
          stroke-width={RING_WIDTH}
        />
      );
    }
    // capsule highlight ring: match the capsule rx = ry = half height, plus RING_PAD
    if (shape_spec().is_capsule) {
      const cap_r = props.box().h / 2 + RING_PAD;
      return (
        <rect
          x={props.box().x - props.box().w / 2 - RING_PAD}
          y={props.box().y - props.box().h / 2 - RING_PAD}
          width={props.box().w + RING_PAD * 2}
          height={props.box().h + RING_PAD * 2}
          rx={cap_r}
          ry={cap_r}
          fill="none"
          stroke={color}
          stroke-width={RING_WIDTH}
        />
      );
    }
    return (
      <rect
        x={props.box().x - props.box().w / 2 - RING_PAD}
        y={props.box().y - props.box().h / 2 - RING_PAD}
        width={props.box().w + RING_PAD * 2}
        height={props.box().h + RING_PAD * 2}
        rx={shape_spec().corner_radius + RING_PAD}
        ry={shape_spec().corner_radius + RING_PAD}
        fill="none"
        stroke={color}
        stroke-width={RING_WIDTH}
      />
    );
  }

  return (
    <g
      class="concept-node"
      data-concept-key={props.conceptKey}
      role="img"
      aria-label={props.conceptKey}
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
      {/* Centered black label (the concept key). Inline font attributes keep the
          export self-contained; pointer-events none lets drags target the shape. */}
      <text
        x={props.box().x}
        y={props.box().y}
        fill={label_fill()}
        font-family={LABEL_FONT}
        font-size={LABEL_FONT_SIZE}
        text-anchor="middle"
        dominant-baseline="central"
        style={{ "pointer-events": "none", "user-select": "none" }}
      >
        {props.conceptKey}
      </text>
    </g>
  );
}
