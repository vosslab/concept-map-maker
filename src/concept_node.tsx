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

import { SHAPE_REGISTRY, depth_fill, ORIGIN_EMPHASIS } from "./themes";
import type { AppState } from "./app_state";
import type { ConceptKey } from "./types";
import type { NodeBox } from "./edge_geometry";

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

// Outer halo padding (map units) and width for the hover highlight ring.
const RING_PAD = 4;
const RING_WIDTH = 3;

//============================================
// ConceptNodeProps
//============================================
export interface ConceptNodeProps {
  // The concept identity this bubble renders (also used as the visible label).
  conceptKey: ConceptKey;
  // Center-based geometry from the canvas layout slot.
  box: NodeBox;
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
    grab_offset = { x: local.x - props.box.x, y: local.y - props.box.y };
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
  // outer shape so it composes with either border.
  const stroke_color = createMemo(() => (is_origin() ? ORIGIN_EMPHASIS.stroke : BASE_STROKE));
  const stroke_width = createMemo(() =>
    is_origin() ? ORIGIN_EMPHASIS.stroke_width : BASE_STROKE_WIDTH,
  );

  // Render the primary shape with inline presentation attributes (export-safe).
  function render_shape(): JSX.Element {
    if (shape_spec().is_ellipse) {
      return (
        <ellipse
          cx={props.box.x}
          cy={props.box.y}
          rx={props.box.w / 2}
          ry={props.box.h / 2}
          fill={fill()}
          stroke={stroke_color()}
          stroke-width={stroke_width()}
        />
      );
    }
    // capsule: stadium shape with rx = ry = half the node height (fully rounded ends)
    if (shape_spec().is_capsule) {
      const cap_r = props.box.h / 2;
      return (
        <rect
          x={props.box.x - props.box.w / 2}
          y={props.box.y - props.box.h / 2}
          width={props.box.w}
          height={props.box.h}
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
        x={props.box.x - props.box.w / 2}
        y={props.box.y - props.box.h / 2}
        width={props.box.w}
        height={props.box.h}
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
          cx={props.box.x}
          cy={props.box.y}
          rx={props.box.w / 2 + RING_PAD}
          ry={props.box.h / 2 + RING_PAD}
          fill="none"
          stroke={color}
          stroke-width={RING_WIDTH}
        />
      );
    }
    // capsule highlight ring: match the capsule rx = ry = half height, plus RING_PAD
    if (shape_spec().is_capsule) {
      const cap_r = props.box.h / 2 + RING_PAD;
      return (
        <rect
          x={props.box.x - props.box.w / 2 - RING_PAD}
          y={props.box.y - props.box.h / 2 - RING_PAD}
          width={props.box.w + RING_PAD * 2}
          height={props.box.h + RING_PAD * 2}
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
        x={props.box.x - props.box.w / 2 - RING_PAD}
        y={props.box.y - props.box.h / 2 - RING_PAD}
        width={props.box.w + RING_PAD * 2}
        height={props.box.h + RING_PAD * 2}
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
        x={props.box.x}
        y={props.box.y}
        fill="#000000"
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
