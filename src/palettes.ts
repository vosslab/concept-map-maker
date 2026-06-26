// Palette registry for the pseudo-code flowchart app.
//
// Pure data module -- no Solid, no DOM imports.
// Provides the PALETTES color-ramp registry and the depth_fill helper.
// Shape logic lives in themes.ts; this module owns palette-only concerns.

import type { ThemePalette } from "./types.js";

//============================================
// PALETTES
//============================================
// Six hex colors per palette, ordered light-to-dark (depth 0 = lightest,
// depth 5 = darkest). All fills pass WCAG AA contrast with a black label
// (#000000) at the lightest level.
//
// earth: tans, warm greens, and browns -- nature / ecology feel.
// fire: pale yellows through deep reds -- heat / energy feel.
export const PALETTES: Record<ThemePalette, string[]> = {
  earth: [
    "#f5f0e0", // depth 0 -- warm cream (tan)
    "#d4e6b5", // depth 1 -- light sage green
    "#a8c97a", // depth 2 -- medium sage
    "#7aaa50", // depth 3 -- medium green
    "#4d7a28", // depth 4 -- deep forest green
    "#2e4a10", // depth 5 -- dark brown-green
  ],
  fire: [
    "#fff8c2", // depth 0 -- pale yellow
    "#ffd966", // depth 1 -- golden yellow
    "#ffaa33", // depth 2 -- amber orange
    "#f07020", // depth 3 -- warm orange
    "#d03010", // depth 4 -- deep red-orange
    "#8a1a00", // depth 5 -- dark red
  ],
};

//============================================
// depth_fill
//============================================
// Return the fill hex color for a bubble at the given BFS depth.
// Depth is clamped to [0, 5]: values below 0 are treated as 0, values
// above 5 use the darkest ramp entry (no cycling).
export function depth_fill(palette: ThemePalette, depth: number): string {
  const ramp = PALETTES[palette];
  // clamp depth to valid ramp indices
  const idx = Math.max(0, Math.min(depth, ramp.length - 1));
  // safe: idx is always in [0, ramp.length - 1]
  return ramp[idx]!;
}
