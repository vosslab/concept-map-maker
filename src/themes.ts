// Theme tokens for the pseudo-code flowchart app.
//
// Pure data module -- no Solid, no DOM imports.
// Keeps document-wide palette concerns. Per-node geometry comes from
// FlowNode.shape. Palette ramps and depth fill logic live in palettes.ts.

import type { FlowTheme, ThemePalette } from "./types.js";

export const DEFAULT_THEME: FlowTheme = {
  palette: "earth",
};

export const THEME_PALETTES: readonly ThemePalette[] = ["earth", "fire"];

//============================================
// ORIGIN_EMPHASIS
//============================================
// Extra stroke applied to origin bubbles (in-degree 0, out-degree > 0).
// The thicker, saturated border visually distinguishes origin nodes
// from interior nodes without requiring color-only cues.
export const ORIGIN_EMPHASIS: { stroke_width: number; stroke: string } = {
  stroke_width: 3,
  stroke: "#2a2a2a",
};
