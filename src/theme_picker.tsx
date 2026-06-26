// theme_picker.tsx - small labeled control for the map color palette.
//
// A labeled <select> calls state.set_theme so every node restyles at once:
// the palette swaps the depth-ramp fill colors. Node geometry is per-node
// (FlowNode.shape), so there is no global shape control here.

import { For } from "solid-js";
import type { JSX } from "solid-js";

import { PALETTES } from "./palettes";
import type { AppState } from "./app_state";
import type { ThemePalette } from "./types";

//============================================
// ThemePickerProps
//============================================
export interface ThemePickerProps {
  // The shared reactive app state (reads doc.theme, calls set_theme).
  state: AppState;
}

// Human-facing labels for each palette option; keys mirror PALETTES.
const PALETTE_LABELS: Record<ThemePalette, string> = {
  earth: "Earth",
  fire: "Fire",
};

//============================================
// ThemePicker
//============================================
export function ThemePicker(props: ThemePickerProps): JSX.Element {
  // The option list comes straight from the registry so adding a palette in
  // palettes.ts surfaces here automatically.
  const palette_options = Object.keys(PALETTES) as ThemePalette[];

  // Commit a palette change to the document theme.
  function on_palette_change(e: Event): void {
    const value = (e.currentTarget as HTMLSelectElement).value as ThemePalette;
    props.state.set_theme({ palette: value });
  }

  return (
    <div class="theme-picker" role="group" aria-label="Map palette">
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
