// map_canvas.tsx - the SVG concept-map canvas root.
//
// This component owns the <svg> root, the marker <defs>, the pan/zoom viewport
// group, and the edge rendering. Nodes are rendered through an optional slot so
// the canvas works standalone (a simple placeholder group per concept) or with
// the themed ConceptNode injected via the slot. The SVG export consumes the same
// DOM, so all PRESENTATION is expressed as inline SVG attributes, never CSS
// classes; only interaction state uses data-* attributes and inline cursor styling.
//
// Published canvas contract:
//   - props.state: AppState (the single shared reactive state instance).
//   - props.node_slot?(key, box): render a node; omitted -> default placeholder.
//   - props.svg_ref?(el): receive the live <svg> element (stable across renders).
//   - The pan/zoom transform lives on EXACTLY ONE inner <g data-viewport>; export
//     strips that transform to recover untransformed map coordinates.
//
// Pan/zoom/reset (ephemeral, never saved): wheel zooms around the cursor,
// dragging the background pans, double-click resets to the identity view.

import type { JSX } from "solid-js";
import { For, createMemo, createSignal } from "solid-js";

import type { AppState } from "./app_state";
import type { ConceptKey, Triple } from "./types";
import { concept_key } from "./types";
import type { NodeBox, EdgeTriple, Point } from "./edge_geometry";
import { assign_curvatures } from "./edge_geometry";
import type { RouteEdge } from "./edge_routing";
import { compute_route_curvatures } from "./edge_routing";
import type { LabelEdgeInput } from "./label_layout";
import { compute_label_positions } from "./label_layout";
import { effective_extent } from "./map_bounds";
import { ConceptEdge, ARROW_MARKER_ID, ARROW_HIGHLIGHT_MARKER_ID } from "./concept_edge";
import { map_is_dark } from "./ui_theme";

// Padding (in map units) added around the laid-out content when computing the
// initial viewBox, so bubbles and arrowheads near the edge are not clipped.
const VIEWBOX_PADDING = 48;

// Zoom limits and the multiplicative step applied per wheel notch.
const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const ZOOM_STEP = 1.0015;

// Marker geometry. The arrowhead is a small triangle drawn in marker space and
// oriented along the path direction; the two ids differ only in fill color.
// These match the edge stroke colors in concept_edge.tsx so the arrowhead and
// its path read as one. Dark-mode screen variants keep them light enough to see
// on a dark pane; export forces light (map_is_dark() returns false on export).
const ARROW_COLOR = "#6a6a6a";
const ARROW_HIGHLIGHT_COLOR = "#1565c0";
const ARROW_COLOR_DARK = "#9a9a9a";
const ARROW_HIGHLIGHT_COLOR_DARK = "#5aabff";

// The ephemeral pan/zoom viewport transform. scale is uniform; tx/ty are the
// translation in screen-space applied after scaling. This is render state only;
// it is never written to the document or autosave.
interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

// Props are the published canvas contract. node_slot and svg_ref are optional so
// the canvas renders standalone and exposes its element only when a caller asks.
export interface MapCanvasProps {
  state: AppState;
  node_slot?: (key: ConceptKey, box: () => NodeBox) => JSX.Element;
  svg_ref?: (el: SVGSVGElement) => void;
}

//============================================
// build_node_boxes
//============================================
// Resolve every laid-out concept to a render-positioned NodeBox: the rendered
// center comes from node_position (drag override or layout center) and width and
// height come from the layout node. Concepts without a resolved position are
// skipped so partial rows never produce NaN geometry.
function build_node_boxes(state: AppState): Map<ConceptKey, NodeBox> {
  const boxes = new Map<ConceptKey, NodeBox>();
  for (const [key, node] of state.layout().nodes) {
    const position = state.node_position(key);
    // a concept with no override and no layout slot has nowhere to draw
    if (position === null) {
      continue;
    }
    boxes.set(key, { x: position.x, y: position.y, w: node.w, h: node.h });
  }
  return boxes;
}

//============================================
// renderable_edges
//============================================
// Filter the document triples to the complete ones whose BOTH endpoints have a
// resolved box, and attach the from/to boxes. Partial rows (missing field) and
// triples touching an unplaced concept are dropped here, matching the layout's
// complete-row rule. Returns rows plus their endpoint keys so curvature can be
// assigned over exactly the rendered set.
interface RenderableEdge {
  triple: Triple;
  from_key: ConceptKey;
  to_key: ConceptKey;
  from_box: NodeBox;
  to_box: NodeBox;
}

function renderable_edges(triples: Triple[], boxes: Map<ConceptKey, NodeBox>): RenderableEdge[] {
  const result: RenderableEdge[] = [];
  for (const triple of triples) {
    // a row contributes only when from, verb, and to are all non-blank
    const has_from = triple.from.trim().length > 0;
    const has_verb = triple.verb.trim().length > 0;
    const has_to = triple.to.trim().length > 0;
    if (!has_from || !has_verb || !has_to) {
      continue;
    }
    const from_key = concept_key(triple.from);
    const to_key = concept_key(triple.to);
    const from_box = boxes.get(from_key);
    const to_box = boxes.get(to_key);
    // skip any triple whose endpoints are not both placed
    if (from_box === undefined || to_box === undefined) {
      continue;
    }
    result.push({ triple, from_key, to_key, from_box, to_box });
  }
  return result;
}

//============================================
// default_node
//============================================
// The fallback node rendering used when no node_slot is provided: a simple rect
// with a centered text label. Inline-attribute presentation only. When node_slot
// is provided (as in app.tsx), ConceptNode is used instead of this placeholder.
function default_node(key: ConceptKey, box: () => NodeBox): JSX.Element {
  return (
    <g data-concept-key={key}>
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
        {key}
      </text>
    </g>
  );
}

//============================================
// MapCanvas
//============================================
// The SVG canvas root. Renders defs, the pan/zoom viewport group, all edges, and
// one node per concept (default placeholder or the injected slot).
export function MapCanvas(props: MapCanvasProps): JSX.Element {
  // ephemeral pan/zoom state: identity view until the user interacts
  const [viewport, set_viewport] = createSignal<Viewport>({ scale: 1, tx: 0, ty: 0 });

  // the live svg element, captured for cursor->map coordinate math and exposed
  // to the caller via the optional svg_ref callback
  let svg_el: SVGSVGElement | undefined;

  // background-pan drag state: the pointer id we captured and the last client
  // position, so pointermove can accumulate a translation delta
  let pan_pointer_id: number | null = null;
  let last_client_x = 0;
  let last_client_y = 0;

  // resolved render boxes for every placed concept (override or layout center).
  // A memo so the SAME map object is reused while inputs are unchanged and a
  // single fresh map is produced per drag move; this keeps node_keys() stable
  // (===) so <For> patches each node <g> in place instead of recreating it.
  const node_boxes = createMemo(() => build_node_boxes(props.state));
  // the box map's keyset, used to key the nodes <For> by stable ConceptKey
  const node_keys = (): ConceptKey[] => Array.from(node_boxes().keys());
  // every rendered node box, fed to the centralized label placement pass as the
  // base obstacle set. Reactive: reads the same live node_boxes memo, so during a
  // drag the pass re-runs and every label re-places in step with the moving
  // bubble (override-aware).
  const node_box_list = (): NodeBox[] => Array.from(node_boxes().values());

  // arrowhead marker fills, switched on the resolved map theme so they match the
  // edge stroke colors. Export forces light via map_is_dark() returning false.
  const arrow_fill = (): string => (map_is_dark() ? ARROW_COLOR_DARK : ARROW_COLOR);
  const arrow_highlight_fill = (): string =>
    map_is_dark() ? ARROW_HIGHLIGHT_COLOR_DARK : ARROW_HIGHLIGHT_COLOR;

  // the initial (untransformed) viewBox from the rendered extent plus padding;
  // the viewport <g> transform pans/zooms within this fixed coordinate space
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

  // curvature per rendered triple, assigned over exactly the drawn edge set so
  // bidirectional pairs bow apart and duplicates fan out
  const edges = (): RenderableEdge[] => renderable_edges(props.state.doc.triples, node_boxes());
  // base curvature per rendered edge: assign_curvatures encodes the
  // bidirectional/duplicate fanning relationship over exactly the drawn set
  const base_curvatures = (): Map<string, number> => {
    const rows: EdgeTriple[] = edges().map((edge) => ({
      id: edge.triple.id,
      from_key: edge.from_key,
      to_key: edge.to_key,
    }));
    return assign_curvatures(rows);
  };
  // per-edge inputs for the post-dagre routing pass, built from the rendered
  // edge set in stable order; is_self_loop drives the router's skip rule
  const route_inputs = (): RouteEdge[] =>
    edges().map((edge) => ({
      id: edge.triple.id,
      from_key: edge.from_key,
      to_key: edge.to_key,
      from_box: edge.from_box,
      to_box: edge.to_box,
      is_self_loop: edge.from_key === edge.to_key,
    }));
  // effective curvature per edge: the routing layer takes the base curvatures and
  // bulges any bypass edge AROUND an intervening node. This single map feeds BOTH
  // the drawn edge curvature and the label placement pass, so a routed edge bows
  // and its label sits on the bowed curve. Reactive: reads live node_boxes, so a
  // drag re-runs routing and re-places labels in step (override-aware).
  const curvatures = (): Map<string, number> =>
    compute_route_curvatures(
      route_inputs(),
      node_boxes(),
      props.state.doc.theme.shape,
      base_curvatures(),
    );

  // minimal per-edge inputs for the centralized label placement pass, built from
  // the rendered edge set in stable array order (the placement priority order).
  const edge_inputs = (): LabelEdgeInput[] =>
    edges().map((edge) => ({
      id: edge.triple.id,
      from_box: edge.from_box,
      to_box: edge.to_box,
      verb: edge.triple.verb,
      is_self_loop: edge.from_key === edge.to_key,
      from_key: edge.from_key,
      to_key: edge.to_key,
    }));

  // resolved label anchor per edge id, computed in ONE pass over the whole edge
  // set so labels avoid both node bubbles and each other. Reactive: reads the
  // live node_boxes (via node_box_list) and curvatures, so a drag re-runs the
  // pass and every label re-places (override-aware).
  const label_positions = (): Map<string, Point> =>
    compute_label_positions(
      edge_inputs(),
      node_box_list(),
      props.state.doc.theme.shape,
      curvatures(),
    );

  //--------------------------------------------
  // interaction handlers (ephemeral viewport)
  //--------------------------------------------

  // wheel: zoom about the cursor. Convert the cursor to viewport-local space,
  // apply the multiplicative scale, then adjust the translation so the point
  // under the cursor stays fixed (zoom-to-cursor).
  const on_wheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (svg_el === undefined) {
      return;
    }
    const rect = svg_el.getBoundingClientRect();
    // cursor position in the svg's own pixel box
    const cursor_x = event.clientX - rect.left;
    const cursor_y = event.clientY - rect.top;
    const current = viewport();
    // exponential zoom keeps the feel uniform across fast and slow wheels
    const factor = Math.pow(ZOOM_STEP, -event.deltaY);
    const next_scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
    // the actual applied ratio after clamping; keeps the math exact at limits
    const ratio = next_scale / current.scale;
    // translate so the viewport point under the cursor does not move
    const next_tx = cursor_x - (cursor_x - current.tx) * ratio;
    const next_ty = cursor_y - (cursor_y - current.ty) * ratio;
    set_viewport({ scale: next_scale, tx: next_tx, ty: next_ty });
  };

  // pointerdown on the background starts a pan. A node slot stops propagation
  // for its own drags (C2b), so reaching here means the background was grabbed.
  const on_pointer_down = (event: PointerEvent): void => {
    // only the primary (left) button pans
    if (event.button !== 0) {
      return;
    }
    pan_pointer_id = event.pointerId;
    last_client_x = event.clientX;
    last_client_y = event.clientY;
    // capture so the pan continues even if the pointer leaves the svg
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
      {/* Arrowhead markers: a normal gray triangle and a highlight-colored one.
          Both auto-orient along the path so the head points at the target. */}
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
        <marker
          id={ARROW_HIGHLIGHT_MARKER_ID}
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={7}
          markerHeight={7}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={arrow_highlight_fill()} />
        </marker>
      </defs>

      {/* The single pan/zoom viewport group. Export strips this transform to
          recover untransformed map coordinates; keep all content inside it. */}
      <g data-viewport transform={viewport_transform()}>
        {/* Edges first so bubbles paint on top of arrowhead tails. */}
        <For each={edges()}>
          {(edge) => (
            <ConceptEdge
              state={props.state}
              triple={edge.triple}
              curvature={curvatures().get(edge.triple.id) ?? 0}
              from_box={edge.from_box}
              to_box={edge.to_box}
              // the pass contains every non-empty-verb edge; an empty-verb edge
              // has no entry, and ConceptEdge renders no label for it (Show
              // guard), so the endpoint-midpoint fallback is never drawn
              label_pos={
                label_positions().get(edge.triple.id) ?? edge_midpoint(edge.from_box, edge.to_box)
              }
            />
          )}
        </For>

        {/* Nodes: the injected slot when provided, else the default placeholder. */}
        <For each={node_keys()}>
          {(key) => {
            // node_keys is the boxes map's own keyset; the entry is present for
            // this row's lifetime (non-null asserted, repo-idiomatic)
            const box = (): NodeBox => node_boxes().get(key)!;
            const slot = props.node_slot;
            if (slot !== undefined) {
              return slot(key, box);
            }
            return default_node(key, box);
          }}
        </For>
      </g>
    </svg>
  );
}

//============================================
// edge_midpoint
//============================================
// The midpoint between two node-box centers. Used only as the label_pos fallback
// for an empty-verb edge (which renders no label), so it never affects a drawn
// label; it keeps the prop well-typed without an Optional.
function edge_midpoint(from_box: NodeBox, to_box: NodeBox): Point {
  return { x: (from_box.x + to_box.x) / 2, y: (from_box.y + to_box.y) / 2 };
}

//============================================
// clamp
//============================================
// Bound a value to the inclusive [low, high] range.
function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}
