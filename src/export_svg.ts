// export_svg.ts - SVG and PNG export for the concept map canvas.
//
// Browser-only module. All three exported functions operate on a live
// SVGSVGElement (the ref exposed by MapCanvas via props.svg_ref) and an
// AppState. They are imported by the toolbar package; do NOT import Solid
// reactive primitives here -- this module runs after reactivity has settled.
//
// Exported for the toolbar SVG/PNG download buttons:
//   export_svg_text(svg, state): Promise<string>
//   download_svg(svg, state, filename): Promise<void>
//   download_png(svg, state, filename, scale?): Promise<void>

import type { AppState } from "./app_state";
import type { ConceptKey } from "./types";
import type { NodeBox } from "./edge_geometry";
import { effective_extent } from "./map_bounds";
import { set_exporting_light } from "./ui_theme";

// Padding added around the rendered extent in the exported viewBox so labels
// and arrowheads near the edge are not clipped.
const EXPORT_PADDING = 48;

// Maximum pixel dimension for PNG raster output on either axis. Images larger
// than this are scaled down to stay within the cap on both dimensions.
const PNG_MAX_DIM = 8000;

//============================================
// build_export_node_boxes
//============================================
// Convert the layout nodes map (LayoutNode has x, y, w, h keyed by
// ConceptKey) to a NodeBox map that effective_extent can consume. Applies
// drag overrides: the rendered center is the override when present, else the
// layout center.
function build_export_node_boxes(state: AppState): Map<ConceptKey, NodeBox> {
  const boxes = new Map<ConceptKey, NodeBox>();
  for (const [key, node] of state.layout().nodes) {
    const position = state.node_position(key);
    // concepts without a resolved position are skipped (no override, no layout)
    if (position === null) {
      continue;
    }
    boxes.set(key, { x: position.x, y: position.y, w: node.w, h: node.h });
  }
  return boxes;
}

//============================================
// strip_interactive_attrs
//============================================
// Walk the cloned SVG tree and remove all attributes that are irrelevant or
// harmful in a static exported file: data-* attributes, class, cursor, and
// pointer-events. This is a pure DOM mutation on the clone, never on the live
// canvas tree.
function strip_interactive_attrs(root: Element): void {
  // collect attributes to remove first to avoid mutating while iterating
  const attrs_to_remove: string[] = [];
  for (let i = 0; i < root.attributes.length; i++) {
    const attr = root.attributes[i];
    if (attr === undefined) {
      continue;
    }
    const name = attr.name;
    // remove data-* attributes, class, cursor, pointer-events, style
    if (
      name.startsWith("data-") ||
      name === "class" ||
      name === "cursor" ||
      name === "pointer-events" ||
      name === "style"
    ) {
      attrs_to_remove.push(name);
    }
  }
  for (const name of attrs_to_remove) {
    root.removeAttribute(name);
  }
  // recurse into children
  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i];
    if (child !== undefined) {
      strip_interactive_attrs(child);
    }
  }
}

//============================================
// export_svg_text
//============================================
// Produce a standalone SVG string from the live canvas.
//
// Steps:
//   1. Clear hover state so the clone captures neutral (non-hover) styling.
//   2. Await a microtask so Solid reactivity can flush the hover change.
//   3. Clone the canvas SVG via deep cloneNode.
//   4. Find the <g data-viewport> in the clone and remove its transform
//      attribute so the exported coordinates are untransformed map coords.
//   5. Strip interactive data-*/class/cursor/style attributes from the tree.
//   6. Compute the rendered extent via effective_extent and set viewBox,
//      width, and height on the clone's root element.
//   7. Serialize with XMLSerializer and prepend the XML declaration + xmlns.
export async function export_svg_text(svg: SVGSVGElement, state: AppState): Promise<string> {
  // clear hover so the export captures neutral styling
  state.set_hover({ source: null, tripleId: null, conceptKey: null });
  // force the map color accessors to resolve LIGHT for the duration of the
  // snapshot so the exported file stays self-contained and authored-light even
  // when the on-screen theme is dark. Reset in the finally below so the live map
  // returns to its current theme afterward.
  set_exporting_light(true);

  // clone inside a try so the force-light flag is always released, even if the
  // clone or any DOM read throws
  let clone: SVGSVGElement;
  try {
    // let Solid reactivity flush both the hover clear and the force-light flag
    // into the live DOM before we snapshot it
    await Promise.resolve();

    // deep-clone the live SVG; this snapshot is what we mutate and export. The
    // live DOM now carries light inline colors because the flush above repainted
    // the reactive color accessors under exporting_light = true.
    clone = svg.cloneNode(true) as SVGSVGElement;
  } finally {
    // release the override so the on-screen map repaints back to its theme
    set_exporting_light(false);
  }

  // find the single <g data-viewport> in the clone and strip its transform
  // so the exported SVG uses untransformed (map-space) coordinates
  const viewport_group = clone.querySelector("[data-viewport]");
  if (viewport_group !== null) {
    viewport_group.removeAttribute("transform");
  }

  // remove all interactive / presentation-mode attributes from every element
  strip_interactive_attrs(clone);

  // compute the rendered extent using override-aware node positions
  const boxes = build_export_node_boxes(state);
  const extent = effective_extent(boxes, state.doc.overrides, EXPORT_PADDING);

  // set viewBox, width, and height on the clone root so it opens standalone
  const view_box = `${extent.min_x} ${extent.min_y} ${extent.width} ${extent.height}`;
  clone.setAttribute("viewBox", view_box);
  clone.setAttribute("width", String(extent.width));
  clone.setAttribute("height", String(extent.height));

  // ensure the SVG namespace is declared so standalone viewers accept it
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  // serialize to a string and prepend the XML declaration
  const serializer = new XMLSerializer();
  const svg_body = serializer.serializeToString(clone);
  const xml_decl = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const svg_text = xml_decl + svg_body;
  return svg_text;
}

//============================================
// trigger_download
//============================================
// Create a temporary <a> element, assign a blob URL, and programmatically
// click it to trigger the browser's Save-As dialog. Revokes the blob URL
// after a short delay to release memory.
function trigger_download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // revoke after the browser has had time to initiate the download
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

//============================================
// download_svg
//============================================
// Export the map as an SVG file and trigger a browser download.
export async function download_svg(
  svg: SVGSVGElement,
  state: AppState,
  filename: string,
): Promise<void> {
  const svg_text = await export_svg_text(svg, state);
  const blob = new Blob([svg_text], { type: "image/svg+xml;charset=utf-8" });
  trigger_download(blob, filename);
}

//============================================
// download_png
//============================================
// Export the map as a PNG raster and trigger a browser download.
//
// The SVG is rendered onto an HTML <canvas> at `scale` x the map's natural
// pixel size (default 2 for a crisp 2x render). The maximum dimension on
// either axis is capped at PNG_MAX_DIM (8000px) before the canvas is created
// so we stay within browser canvas limits.
//
// Explicit width/height attributes on the SVG element are required for Safari
// to render the image correctly; export_svg_text already sets them.
export async function download_png(
  svg: SVGSVGElement,
  state: AppState,
  filename: string,
  scale: number = 2,
): Promise<void> {
  const svg_text = await export_svg_text(svg, state);

  // parse the extent so we know the natural pixel dimensions
  const boxes = build_export_node_boxes(state);
  const extent = effective_extent(boxes, state.doc.overrides, EXPORT_PADDING);

  // apply scale and cap to the maximum raster dimension on either axis
  const raw_w = extent.width * scale;
  const raw_h = extent.height * scale;
  const cap_ratio = Math.min(1, PNG_MAX_DIM / Math.max(raw_w, raw_h, 1));
  const canvas_w = Math.round(raw_w * cap_ratio);
  const canvas_h = Math.round(raw_h * cap_ratio);

  // create a Blob URL for the SVG so Image can load it cross-origin-safely
  const svg_blob = new Blob([svg_text], { type: "image/svg+xml;charset=utf-8" });
  const svg_url = URL.createObjectURL(svg_blob);

  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.width = canvas_w;
    img.height = canvas_h;

    img.onload = (): void => {
      URL.revokeObjectURL(svg_url);

      const canvas = document.createElement("canvas");
      canvas.width = canvas_w;
      canvas.height = canvas_h;

      const ctx = canvas.getContext("2d");
      if (ctx === null) {
        reject(new Error("Could not acquire 2d canvas context"));
        return;
      }

      // draw the SVG image onto the canvas at full canvas dimensions
      ctx.drawImage(img, 0, 0, canvas_w, canvas_h);

      canvas.toBlob((png_blob) => {
        if (png_blob === null) {
          reject(new Error("canvas.toBlob produced null"));
          return;
        }
        trigger_download(png_blob, filename);
        resolve();
      }, "image/png");
    };

    img.onerror = (): void => {
      URL.revokeObjectURL(svg_url);
      reject(new Error("Failed to load SVG into Image element"));
    };

    img.src = svg_url;
  });
}
