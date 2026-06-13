// measure_text.ts - pixel-accurate text width measurement via canvas.
//
// Used by the triples table to size each text column to its widest COMMITTED
// value at commit time (not per keystroke). Canvas measureText resolves the
// exact pixel width of any token, including unbreakable acronyms, so column
// sizing never truncates a committed value below the visible content.
//
// A single offscreen canvas context is reused across calls. The caller supplies
// the resolved CSS font shorthand (e.g. "13px ...") that matches the cell font,
// so measurements stay consistent with rendered text.

// Lazily created, reused 2D context. Kept module-local so repeated measurements
// do not allocate a new canvas each call. Treated as read-only after creation.
let SHARED_CTX: CanvasRenderingContext2D | null = null;

// Return the shared measuring context, creating it on first use. Returns null
// only when canvas/2d is unavailable (non-browser test env); callers fall back.
function get_context(): CanvasRenderingContext2D | null {
  if (SHARED_CTX !== null) {
    return SHARED_CTX;
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return null;
  }
  SHARED_CTX = ctx;
  return ctx;
}

//============================================
// measure_text_width
//============================================

// Measure the rendered pixel width of one text string in the given CSS font.
// font is a CSS font shorthand such as "13px system-ui". Returns 0 for empty
// text or when no measuring context is available.
function measure_text_width(text: string, font: string): number {
  if (text === "") {
    return 0;
  }
  const ctx = get_context();
  if (ctx === null) {
    return 0;
  }
  ctx.font = font;
  const metrics = ctx.measureText(text);
  return metrics.width;
}

//============================================
// measure_widest
//============================================

// Measure the widest pixel width across a list of strings in the given font.
// Returns 0 for an empty list. Used to find the widest committed value in a
// triples-table column.
export function measure_widest(values: string[], font: string): number {
  let widest = 0;
  for (const value of values) {
    const width = measure_text_width(value, font);
    if (width > widest) {
      widest = width;
    }
  }
  return widest;
}

//============================================
// resolve_cell_font
//============================================

// Resolve the CSS font shorthand of a cell element so measurements match the
// rendered font exactly. Reads computed font-style/weight/size/family. Falls
// back to a sensible default when no element or computed style is available.
export function resolve_cell_font(element: Element | null): string {
  const fallback = "13px system-ui, sans-serif";
  if (element === null) {
    return fallback;
  }
  const computed = window.getComputedStyle(element);
  const size = computed.fontSize;
  const family = computed.fontFamily;
  if (size === "" || family === "") {
    return fallback;
  }
  const style = computed.fontStyle;
  const weight = computed.fontWeight;
  const font = `${style} ${weight} ${size} ${family}`;
  return font;
}
