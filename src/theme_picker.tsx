// theme_picker.tsx - small labeled control group for map theme (shape + palette).
//
// Two labeled <select> controls call state.set_theme so every bubble restyles
// at once: shape changes the SVG node geometry, palette swaps the depth-ramp
// fill colors. Reads the available options from the theme registries so the
// control stays in sync with whatever shapes/palettes exist.

import { For } from "solid-js";
import type { JSX } from "solid-js";

import { SHAPE_REGISTRY, PALETTES } from "./themes";
import type { AppState } from "./app_state";
import type { ThemeShape, ThemePalette } from "./types";

//============================================
// ThemePickerProps
//============================================
export interface ThemePickerProps {
  // The shared reactive app state (reads doc.theme, calls set_theme).
  state: AppState;
}

// Human-facing labels for each shape option; keys mirror SHAPE_REGISTRY.
const SHAPE_LABELS: Record<ThemeShape, string> = {
  rounded: "Rounded",
  rect: "Rectangle",
  oval: "Oval",
  capsule: "Capsule",
};

// Human-facing labels for each palette option; keys mirror PALETTES.
const PALETTE_LABELS: Record<ThemePalette, string> = {
  earth: "Earth",
  fire: "Fire",
};

//============================================
// ThemePicker
//============================================
export function ThemePicker(props: ThemePickerProps): JSX.Element {
  // The option lists come straight from the registries so adding a shape or
  // palette in themes.ts surfaces here automatically.
  const shape_options = Object.keys(SHAPE_REGISTRY) as ThemeShape[];
  const palette_options = Object.keys(PALETTES) as ThemePalette[];

  // Commit a shape change to the document theme.
  function on_shape_change(e: Event): void {
    const value = (e.currentTarget as HTMLSelectElement).value as ThemeShape;
    props.state.set_theme({ shape: value });
  }

  // Commit a palette change to the document theme.
  function on_palette_change(e: Event): void {
    const value = (e.currentTarget as HTMLSelectElement).value as ThemePalette;
    props.state.set_theme({ palette: value });
  }

  return (
    <div class="theme-picker" role="group" aria-label="Map theme">
      <label class="theme-picker-field">
        <span class="theme-picker-label">Shape</span>
        <select
          class="theme-picker-select"
          aria-label="Bubble shape"
          value={props.state.doc.theme.shape}
          onChange={on_shape_change}
        >
          <For each={shape_options}>
            {(shape) => <option value={shape}>{SHAPE_LABELS[shape]}</option>}
          </For>
        </select>
      </label>

      <label class="theme-picker-field">
        <span class="theme-picker-label">Palette</span>
        <select
          class="theme-picker-select"
          aria-label="Color palette"
          value={props.state.doc.theme.palette}
          onChange={on_palette_change}
        >
          <For each={palette_options}>
            {(palette) => <option value={palette}>{PALETTE_LABELS[palette]}</option>}
          </For>
        </select>
      </label>
    </div>
  );
}
