// Theme tokens for Concept Map Maker.
//
// Pure data module -- no Solid, no DOM imports.
// Provides shape registry and origin emphasis constants consumed by the SVG
// node renderer. Palette ramps and depth fill logic live in palettes.ts.

import type { ThemeShape } from "./types.js";

//============================================
// ORIGIN_EMPHASIS
//============================================
// Extra stroke applied to origin bubbles (in-degree 0, out-degree > 0).
// The thicker, saturated border visually distinguishes entry-point concepts
// from interior nodes without requiring color-only cues.
export const ORIGIN_EMPHASIS: { stroke_width: number; stroke: string } = {
  stroke_width: 3,
  stroke: "#2a2a2a",
};

//============================================
// SHAPE_REGISTRY
//============================================
// Per-shape rendering parameters consumed by the SVG node renderer.
//
// corner_radius: border-radius for rect/rounded (0 = sharp rect, ignored for capsule/ellipse).
// is_ellipse: when true, render as <ellipse> rather than <rect>.
// is_capsule: when true, render as a rect with rx = ry = height / 2 (stadium shape).
export interface ShapeSpec {
  corner_radius: number;
  is_ellipse: boolean;
  is_capsule: boolean;
}

export const SHAPE_REGISTRY: Record<ThemeShape, ShapeSpec> = {
  // classic rounded rectangle (modest corners, clearly distinct from capsule)
  rounded: { corner_radius: 8, is_ellipse: false, is_capsule: false },
  // sharp rectangle
  rect: { corner_radius: 0, is_ellipse: false, is_capsule: false },
  // ellipse / oval rendered as SVG <ellipse>
  oval: { corner_radius: 0, is_ellipse: true, is_capsule: false },
  // capsule: rect with fully rounded short ends (rx = ry = height / 2)
  capsule: { corner_radius: 0, is_ellipse: false, is_capsule: true },
};
