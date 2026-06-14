// label_wrap.ts -- shared VERB/EDGE label sizing source of truth.
// This module owns the size and wrapping of edge verb labels only; it does not
// size node bubbles. The dagre layout module (src/layout_graph.ts), the edge
// renderer (src/concept_edge.tsx), and the label placement helper
// (src/edge_geometry.ts) all import from here so the wrapped text dimensions
// used to reserve graph space, render tspans, and place labels cannot drift.
// Zero DOM or Solid imports; this module is pure TypeScript.

// Verb/edge label font size in pixels. The single source of truth for the
// rendered font-size and the char-advance estimate below, so the rendered font
// and the wrap/size math stay linked.
export const LABEL_FONT_SIZE_PX = 12;

// Estimated character advance width at the 12px web-safe label font.
export const LABEL_CHAR_W_PX = 6.6;

// Extra clearance padding (px) added around the label AABB when placing it, so
// a placed label keeps a small visual gap from a bubble rather than touching it.
export const LABEL_CLEAR_MARGIN_PX = 4;

// Line-box height for a 12px label.
export const LABEL_LINE_H_PX = 14;

// Wrap target: approximately 12-13 chars before starting a new line.
export const LABEL_MAX_LINE_PX = 84;

// Maximum number of wrapped lines; overflow words are appended to the last line.
export const LABEL_MAX_LINES = 3;

//============================================

// wrap_verb_label -- greedy word-wrap a verb string into an array of line strings.
//
// Rules:
//   - Trims the verb; returns [] for empty/whitespace input.
//   - Accumulates words onto the current line while estimated width fits.
//   - A single word wider than LABEL_MAX_LINE_PX stays on its own line (no mid-word split).
//   - Stops wrapping after LABEL_MAX_LINES; remaining words are appended to the last line.
//   - Never drops words.
export function wrap_verb_label(verb: string): string[] {
  const trimmed = verb.trim();
  // Return empty array for empty/whitespace input.
  if (trimmed.length === 0) {
    return [];
  }

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current_line = "";

  for (const word of words) {
    // If we have already filled the max lines, append remaining words to the last line.
    if (lines.length >= LABEL_MAX_LINES) {
      const last = lines[lines.length - 1];
      lines[lines.length - 1] = last + " " + word;
      continue;
    }

    if (current_line.length === 0) {
      // Start the first word of a new line unconditionally (no mid-word splitting).
      current_line = word;
    } else {
      // Check if appending this word keeps us within the max line width.
      const candidate = current_line + " " + word;
      const candidate_width = candidate.length * LABEL_CHAR_W_PX;
      if (candidate_width <= LABEL_MAX_LINE_PX) {
        current_line = candidate;
      } else {
        // Flush the current line and begin a new one with this word.
        lines.push(current_line);
        if (lines.length >= LABEL_MAX_LINES) {
          // Cap reached while flushing; append remaining word to the last pushed line.
          const last = lines[lines.length - 1];
          lines[lines.length - 1] = last + " " + word;
          current_line = "";
        } else {
          current_line = word;
        }
      }
    }
  }

  // Push the last in-progress line if it has content.
  if (current_line.length > 0) {
    if (lines.length >= LABEL_MAX_LINES) {
      const last = lines[lines.length - 1];
      lines[lines.length - 1] = last + " " + current_line;
    } else {
      lines.push(current_line);
    }
  }

  return lines;
}

//============================================

// label_box -- compute the bounding box dimensions for a wrapped label.
//
// width  = max estimated pixel width across all lines (0 for empty input).
// height = total height for the given number of lines (0 for empty input).
export function label_box(lines: string[]): { width: number; height: number } {
  if (lines.length === 0) {
    return { width: 0, height: 0 };
  }

  // Find the longest line width in pixels.
  let max_width = 0;
  for (const line of lines) {
    const line_width = line.length * LABEL_CHAR_W_PX;
    if (line_width > max_width) {
      max_width = line_width;
    }
  }

  const height = lines.length * LABEL_LINE_H_PX;
  return { width: max_width, height };
}
