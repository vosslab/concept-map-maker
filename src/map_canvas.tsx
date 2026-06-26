// map_canvas.tsx - the SVG flowchart canvas root.
//
// This component owns the <svg> root, the marker <defs>, the pan/zoom viewport
// group, and the edge rendering. Nodes are rendered through an optional slot so
// the canvas works standalone (a simple placeholder per node) or with the themed
// flow node injected via the slot. The SVG export consumes the same DOM, so all
// PRESENTATION is expressed as inline SVG attributes, never CSS classes; only
// interaction state uses data-* attributes and inline cursor styling.
//
// Published canvas contract:
//   - props.state: AppState (the single shared reactive state instance).
//   - props.node_slot?(id, box): render a node; omitted -> default placeholder.
//   - props.svg_ref?(el): receive the live <svg> element (stable across renders).
//   - The pan/zoom transform lives on EXACTLY ONE inner <g data-viewport>; export
//     strips that transform to recover untransformed map coordinates.
//
// Pan/zoom/reset (ephemeral, never saved): wheel zooms around the cursor,
// dragging the background pans, double-click resets to the identity view.

import type { JSX } from "solid-js";
import { For, createMemo, createSignal } from "solid-js";

import type { AppState } from "./app_state";
import type { FlowNodeId, FlowEdge as FlowEdgeModel, NodeShape } from "./types";
import type { NodeBox } from "./edge_geometry";
import { flow_edge_path } from "./edge_geometry";
import { compute_back_edge_geometry } from "./edge_routing";
import { effective_extent } from "./map_bounds";
import { FlowEdge, ARROW_MARKER_ID, ARROW_BACK_MARKER_ID } from "./flow_edge";
import { map_is_dark } from "./ui_theme";

// Padding (in map units) added around the laid-out content when computing the
// initial viewBox, so nodes and arrowheads near the edge are not clipped.
const VIEWBOX_PADDING = 48;

// Zoom limits and the multiplicative step applied per wheel notch.
const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const ZOOM_STEP = 1.0015;

// Marker geometry. The arrowhead is a small triangle drawn in marker space and
// oriented along the path direction. These match the edge stroke colors in
// flow_edge.tsx so the arrowhead and its path read as one. Dark-mode screen
// variants keep them light enough on a dark pane; export forces light.
const ARROW_COLOR = "#6a6a6a";
const ARROW_COLOR_DARK = "#9a9a9a";
// Back-edge arrowhead color: must match BACK_COLOR in flow_edge.tsx.
const ARROW_BACK_COLOR = "#5a5a9a";
const ARROW_BACK_COLOR_DARK = "#9090d0";

// Flow edges are drawn straight (curvature 0). Dagre's top-down layered layout
// places branch children at distinct x positions, so straight segments read
// cleanly; the only routed edge is the loop back-edge (handled separately).
const FLOW_EDGE_CURVATURE = 0;

// The ephemeral pan/zoom viewport transform. scale is uniform; tx/ty are the
// translation in screen-space applied after scaling. Render state only; never
// written to the document or autosave.
interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

// Props are the published canvas contract. node_slot and svg_ref are optional so
// the canvas renders standalone and exposes its element only when a caller asks.
export interface MapCanvasProps {
  state: AppState;
  node_slot?: (id: FlowNodeId, box: () => NodeBox) => JSX.Element;
  svg_ref?: (el: SVGSVGElement) => void;
}

// One rendered edge with its pre-computed geometry.
interface RenderEdge {
  edge: FlowEdgeModel;
  d: string;
  label_x: number;
  label_y: number;
}

//============================================
// build_node_boxes
//============================================
// Resolve every laid-out flow node to a render-positioned NodeBox: the rendered
// center comes from node_position (drag override or layout center) and width and
// height come from the layout node. Nodes without a resolved position are skipped.
function build_node_boxes(state: AppState): Map<FlowNodeId, NodeBox> {
  const boxes = new Map<FlowNodeId, NodeBox>();
  for (const [id, node] of state.layout().nodes) {
    const position = state.node_position(id);
    if (position === null) {
      continue;
    }
    boxes.set(id, { x: position.x, y: position.y, w: node.w, h: node.h });
  }
  return boxes;
}

//============================================
// shape_of
//============================================
// The flowchart shape of a node id, read from the layout result (which carries
// each node's shape). Falls back to "process" if the id is somehow absent.
function shape_of(state: AppState, id: FlowNodeId): NodeShape {
  const node = state.layout().nodes.get(id);
  return node === undefined ? "process" : node.shape;
}

//============================================
// build_render_edges
//============================================
// Build the rendered geometry for every graph edge whose endpoints both have a
// resolved box. Flow and comment edges use flow_edge_path (clipped to each node's
// shape); back edges are routed orthogonally around the body via
// compute_back_edge_geometry, with all other node boxes as obstacles.
function build_render_edges(state: AppState, boxes: Map<FlowNodeId, NodeBox>): RenderEdge[] {
  const result: RenderEdge[] = [];
  // every node box, used as the obstacle set for back-edge routing
  const all_boxes = Array.from(boxes.values());
  for (const edge of state.graph().edges) {
    const from_box = boxes.get(edge.from);
    const to_box = boxes.get(edge.to);
    // skip any edge whose endpoints are not both placed
    if (from_box === undefined || to_box === undefined) {
      continue;
    }
    if (edge.kind === "back") {
      // obstacles are every node box except the edge's own endpoints
      const obstacles = all_boxes.filter((box) => box !== from_box && box !== to_box);
      const geometry = compute_back_edge_geometry(from_box, to_box, obstacles);
      result.push({ edge, d: geometry.d, label_x: geometry.label_x, label_y: geometry.label_y });
      continue;
    }
    // flow and comment edges: a clipped cubic between the two shaped boxes
    const from_shape = shape_of(state, edge.from);
    const to_shape = shape_of(state, edge.to);
    const geometry = flow_edge_path(from_box, to_box, from_shape, to_shape, FLOW_EDGE_CURVATURE);
    result.push({ edge, d: geometry.d, label_x: geometry.label_x, label_y: geometry.label_y });
  }
  return result;
}

//============================================
// default_node
//============================================
// The fallback node rendering used when no node_slot is provided: a simple rect
// with a centered id label. Inline-attribute presentation only.
function default_node(id: FlowNodeId, box: () => NodeBox): JSX.Element {
  return (
    <g data-node-id={id}>
      <rect
        x={box().x - box().w / 2}
        y={box().y - box().h / 2}
        width={box().w}
        height={box().h}
        rx={8}
        ry={8}
        fill="#f5f0e0"
        stroke="#2a2a2a"
        stroke-width={1.5}
      />
      <text
        x={box().x}
        y={box().y}
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Helvetica, Arial, sans-serif"
        font-size="14"
        fill="#2a2a2a"
      >
        {id}
      </text>
    </g>
  );
}

//============================================
// MapCanvas
//============================================
// The SVG canvas root. Renders defs, the pan/zoom viewport group, all edges, and
// one node per flow node (default placeholder or the injected slot).
export function MapCanvas(props: MapCanvasProps): JSX.Element {
  // ephemeral pan/zoom state: identity view until the user interacts
  const [viewport, set_viewport] = createSignal<Viewport>({ scale: 1, tx: 0, ty: 0 });

  // the live svg element, captured for cursor->map coordinate math and exposed to
  // the caller via the optional svg_ref callback
  let svg_el: SVGSVGElement | undefined;

  // background-pan drag state
  let pan_pointer_id: number | null = null;
  let last_client_x = 0;
  let last_client_y = 0;

  // resolved render boxes for every placed node (override or layout center). A memo
  // so the SAME map object is reused while inputs are unchanged and one fresh map
  // is produced per drag move; this keeps node_ids() stable so <For> patches each
  // node <g> in place instead of recreating it.
  const node_boxes = createMemo(() => build_node_boxes(props.state));
  // the box map's keyset, used to key the nodes <For> by stable FlowNode id
  const node_ids = (): FlowNodeId[] => Array.from(node_boxes().keys());

  // arrowhead marker fills, switched on the resolved map theme. Export forces
  // light via map_is_dark() returning false.
  const arrow_fill = (): string => (map_is_dark() ? ARROW_COLOR_DARK : ARROW_COLOR);
  const arrow_back_fill = (): string => (map_is_dark() ? ARROW_BACK_COLOR_DARK : ARROW_BACK_COLOR);

  // the initial (untransformed) viewBox from the rendered extent plus padding; the
  // viewport <g> transform pans/zooms within this fixed coordinate space
  const view_box = (): string => {
    const extent = effective_extent(node_boxes(), props.state.doc.overrides, VIEWBOX_PADDING);
    return `${extent.min_x} ${extent.min_y} ${extent.width} ${extent.height}`;
  };

  // the SVG transform string for the viewport group; translate THEN scale so tx
  // and ty are screen-space pixels independent of the current zoom level
  const viewport_transform = (): string => {
    const v = viewport();
    return `translate(${v.tx} ${v.ty}) scale(${v.scale})`;
  };

  // rendered edges with pre-computed geometry, recomputed when the graph or any
  // node box changes (so a drag re-routes back edges and re-clips flow edges)
  const edges = (): RenderEdge[] => build_render_edges(props.state, node_boxes());

  //--------------------------------------------
  // interaction handlers (ephemeral viewport)
  //--------------------------------------------

  // wheel: zoom about the cursor.
  const on_wheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (svg_el === undefined) {
      return;
    }
    const rect = svg_el.getBoundingClientRect();
    const cursor_x = event.clientX - rect.left;
    const cursor_y = event.clientY - rect.top;
    const current = viewport();
    // exponential zoom keeps the feel uniform across fast and slow wheels
    const factor = Math.pow(ZOOM_STEP, -event.deltaY);
    const next_scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
    const ratio = next_scale / current.scale;
    // translate so the viewport point under the cursor does not move
    const next_tx = cursor_x - (cursor_x - current.tx) * ratio;
    const next_ty = cursor_y - (cursor_y - current.ty) * ratio;
    set_viewport({ scale: next_scale, tx: next_tx, ty: next_ty });
  };

  // pointerdown on the background starts a pan (a node slot stops propagation for
  // its own drags, so reaching here means the background was grabbed)
  const on_pointer_down = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    pan_pointer_id = event.pointerId;
    last_client_x = event.clientX;
    last_client_y = event.clientY;
    const target = event.currentTarget as SVGSVGElement;
    target.setPointerCapture(event.pointerId);
  };

  // pointermove: while panning, accumulate the client-space delta into tx/ty
  const on_pointer_move = (event: PointerEvent): void => {
    if (pan_pointer_id === null || event.pointerId !== pan_pointer_id) {
      return;
    }
    const dx = event.clientX - last_client_x;
    const dy = event.clientY - last_client_y;
    last_client_x = event.clientX;
    last_client_y = event.clientY;
    const current = viewport();
    set_viewport({ scale: current.scale, tx: current.tx + dx, ty: current.ty + dy });
  };

  // end the pan on pointerup or lost capture; release the captured pointer
  const end_pan = (event: PointerEvent): void => {
    if (pan_pointer_id === null || event.pointerId !== pan_pointer_id) {
      return;
    }
    pan_pointer_id = null;
    const target = event.currentTarget as SVGSVGElement;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  };

  // double-click resets the view to the identity transform
  const on_double_click = (): void => {
    set_viewport({ scale: 1, tx: 0, ty: 0 });
  };

  // capture the svg element and forward it to the caller's ref callback once
  const set_svg = (el: SVGSVGElement): void => {
    svg_el = el;
    if (props.svg_ref !== undefined) {
      props.svg_ref(el);
    }
  };

  return (
    <svg
      ref={set_svg}
      width="100%"
      height="100%"
      viewBox={view_box()}
      preserveAspectRatio="xMidYMid meet"
      // touch-action none lets pointer panning work without browser scrolling
      style={{ "touch-action": "none", "user-select": "none" }}
      onWheel={on_wheel}
      onPointerDown={on_pointer_down}
      onPointerMove={on_pointer_move}
      onPointerUp={end_pan}
      onPointerCancel={end_pan}
      onDblClick={on_double_click}
    >
      {/* Arrowhead markers: flow and back-edge. Both auto-orient along the path
          so the head points at the target. */}
      <defs>
        <marker
          id={ARROW_MARKER_ID}
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={7}
          markerHeight={7}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={arrow_fill()} />
        </marker>
        {/* Distinct arrowhead for back (loop return) edges; fill matches
            BACK_COLOR in flow_edge.tsx via the arrow_back_fill accessor. */}
        <marker
          id={ARROW_BACK_MARKER_ID}
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={7}
          markerHeight={7}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={arrow_back_fill()} />
        </marker>
      </defs>

      {/* The single pan/zoom viewport group. Export strips this transform to
          recover untransformed map coordinates; keep all content inside it. */}
      <g data-viewport transform={viewport_transform()}>
        {/* Edges first so nodes paint on top of arrowhead tails. */}
        <For each={edges()}>
          {(item) => (
            <FlowEdge
              edge_id={item.edge.id}
              kind={item.edge.kind}
              branch={item.edge.branch}
              d={item.d}
              label_x={item.label_x}
              label_y={item.label_y}
            />
          )}
        </For>

        {/* Nodes: the injected slot when provided, else the default placeholder. */}
        <For each={node_ids()}>
          {(id) => {
            // node_ids is the boxes map's own keyset; the entry is present for this
            // row's lifetime (non-null asserted, repo-idiomatic)
            const box = (): NodeBox => node_boxes().get(id)!;
            const slot = props.node_slot;
            if (slot !== undefined) {
              return slot(id, box);
            }
            return default_node(id, box);
          }}
        </For>
      </g>
    </svg>
  );
}

//============================================
// clamp
//============================================
// Bound a value to the inclusive [low, high] range.
function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}
