// Unit tests for label_wrap.ts -- shared label-size source of truth.
// Run: node --import tsx --test tests/test_label_wrap.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  wrap_verb_label,
  label_box,
  LABEL_CHAR_W_PX,
  LABEL_LINE_H_PX,
  LABEL_MAX_LINE_PX,
  LABEL_MAX_LINES,
} from "../src/label_wrap.ts";

//============================================
// wrap_verb_label
//============================================

test("short verb produces a single line", () => {
  const lines = wrap_verb_label("is");
  assert.equal(lines.length, 1);
  assert.equal(lines[0], "is");
});

test("multi-word long verb wraps to more than one line", () => {
  // "is responsible for" is 18 chars including spaces; well over LABEL_MAX_LINE_PX / LABEL_CHAR_W_PX chars
  const lines = wrap_verb_label("is responsible for");
  assert.ok(lines.length > 1, "expected multiple lines for a long verb");
  // Each line except possibly the capped last line should fit within the max width.
  // (The last line may exceed max if it is the overflow accumulator.)
  for (let i = 0; i < lines.length - 1; i++) {
    const line_width = lines[i].length * LABEL_CHAR_W_PX;
    assert.ok(
      line_width <= LABEL_MAX_LINE_PX,
      `line ${i} width ${line_width} exceeds LABEL_MAX_LINE_PX ${LABEL_MAX_LINE_PX}`,
    );
  }
});

test("a single over-long word stays on one line without mid-word splitting", () => {
  const long_word = "supercalifragilistic";
  const lines = wrap_verb_label(long_word);
  assert.equal(lines.length, 1);
  assert.equal(lines[0], long_word);
});

test("overflow beyond LABEL_MAX_LINES produces exactly LABEL_MAX_LINES lines with no words dropped", () => {
  // Build a verb with enough short words to force more than LABEL_MAX_LINES lines.
  // Each word is 10 chars; LABEL_MAX_LINE_PX / LABEL_CHAR_W_PX ~ 12.7 chars so each line holds 1 word.
  const word = "abcdefghij"; // 10 chars
  const word_count = LABEL_MAX_LINES + 3; // always exceeds the cap
  const verb = Array(word_count).fill(word).join(" ");
  const lines = wrap_verb_label(verb);

  // Must cap at LABEL_MAX_LINES.
  assert.equal(lines.length, LABEL_MAX_LINES);

  // No words must be dropped: re-joining all lines by space must contain all original words.
  const all_words_in_output = lines.join(" ").split(/\s+/);
  assert.equal(
    all_words_in_output.length,
    word_count,
    "no words should be dropped when capping at LABEL_MAX_LINES",
  );
});

test("empty string returns empty array", () => {
  const lines = wrap_verb_label("");
  assert.deepEqual(lines, []);
});

test("whitespace-only string returns empty array", () => {
  const lines = wrap_verb_label("   ");
  assert.deepEqual(lines, []);
});

//============================================
// label_box
//============================================

test("label_box for empty input returns zero width and height", () => {
  const box = label_box([]);
  assert.equal(box.width, 0);
  assert.equal(box.height, 0);
});

test("label_box width is positive and monotonic with line length for a single-line label", () => {
  // Exact formula (len * LABEL_CHAR_W_PX) is an internal implementation detail.
  // The behavioral contract: width must be positive, and a longer line must
  // produce a strictly wider box than a shorter line.
  const lines_short = wrap_verb_label("is");
  const lines_long = wrap_verb_label("is related to");
  const box_short = label_box(lines_short);
  const box_long = label_box(lines_long);
  assert.ok(box_short.width > 0, "single-line box must have positive width");
  assert.ok(
    box_long.width > box_short.width,
    `longer line (${box_long.width}) should produce a wider box than shorter line (${box_short.width})`,
  );
  assert.equal(box_short.height, LABEL_LINE_H_PX);
});

test("label_box height equals lines.length * LABEL_LINE_H_PX", () => {
  // Use wrap_verb_label to produce multiple lines, then verify height.
  const lines = wrap_verb_label("is responsible for");
  const box = label_box(lines);
  assert.equal(box.height, lines.length * LABEL_LINE_H_PX);
  assert.ok(box.width > 0);
});
