// label_wrap.ts - pure text-wrapping helpers for flow-node labels.
//
// No DOM or Solid imports: both the layout sizer (layout_graph.ts) and the
// renderer (flow_node.tsx) import this module so they agree on exactly how a
// label breaks into lines. If the two disagreed on line breaks, the reserved
// node size and the rendered text block would drift apart.
//
// Today only the decision diamond wraps its condition; the helper itself is
// generic so other shapes can opt in later by calling wrap_label with their own
// max-character budget.

// Maximum characters per wrapped line for a decision condition. Chosen so a
// typical condition like "password == stored_password" breaks into two balanced
// lines instead of one long line that would stretch the diamond into a flat
// lozenge.
export const DECISION_WRAP_MAX_CHARS = 16;

// Vertical advance (in user units) between wrapped label lines. Comfortably
// larger than the 14px label font so stacked lines do not touch. Shared so the
// diamond sizer and the tspan renderer reserve and draw the same block height.
export const DECISION_LINE_HEIGHT_PX = 18;

//============================================
// wrap_label
//============================================
// Greedy word wrap: accumulate words onto the current line until adding the next
// word would exceed max_chars, then start a new line. A single word longer than
// max_chars stands alone on its own line; identifiers are never split mid-word,
// since breaking "stored_password" would hurt readability more than overflowing.
// Returns at least one line so callers can always index line zero.
export function wrap_label(text: string, max_chars: number): string[] {
  // split on any run of whitespace and drop empties so leading/trailing or
  // doubled spaces do not create blank words
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  // a label with no words (empty or whitespace-only) still returns one line
  if (words.length === 0) {
    return [text];
  }
  const lines: string[] = [];
  // the line currently being assembled; flushed into lines when it would overflow
  let current = "";
  for (const word of words) {
    // first word on a fresh line always starts the line, even if it overflows
    if (current === "") {
      current = word;
      continue;
    }
    // would-be line if this word were appended to the current line
    const candidate = current + " " + word;
    if (candidate.length > max_chars) {
      // appending would overflow: flush the current line and start a new one
      lines.push(current);
      current = word;
    } else {
      // still fits: keep the word on the current line
      current = candidate;
    }
  }
  // flush the final in-progress line
  if (current !== "") {
    lines.push(current);
  }
  return lines;
}

//============================================
// longest_line_length
//============================================
// Character count of the widest wrapped line. The diamond sizer uses this to
// estimate the wrapped text block width.
export function longest_line_length(lines: string[]): number {
  let longest = 0;
  for (const line of lines) {
    if (line.length > longest) {
      longest = line.length;
    }
  }
  return longest;
}
