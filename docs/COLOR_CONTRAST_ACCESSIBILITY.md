# Color contrast accessibility

## Target contrast ratio

This app targets a **5.5:1** contrast ratio for all foreground/background
text pairs. This exceeds WCAG AA's 4.5:1 minimum for normal text.

| WCAG level | Minimum ratio (normal text) |
| --- | --- |
| AA | 4.5:1 |
| AAA | 7:1 |
| Our target | 5.5:1 |

The maximum possible contrast ratio is 21:1 (black `#000000` on white `#FFFFFF`).

## How contrast ratio works

**Formula:** `(L1 + 0.05) / (L2 + 0.05)` where L1 is the lighter relative luminance
and L2 is the darker.

**Relative luminance:** `L = 0.2126*R + 0.7152*G + 0.0722*B` where R, G, B are
linearized sRGB values (apply gamma correction: if the 8-bit channel value / 255 is
<= 0.04045, divide by 12.92; otherwise compute `((value + 0.055) / 1.055) ^ 2.4`).

**Backward solve for target luminance:** Given target ratio CR and white background
(L_bg = 1.0), the required foreground luminance is `L_fg = 1.05 / CR - 0.05`.
For CR = 5.5, L_fg = 0.14091.

## Contrast calculator tool

`tools/contrast_calculator.py` implements the WCAG v2 contrast formula with
backward solving via binary search on HSL lightness.

Usage:
```bash
# check a single foreground hex color on a specific background
source source_me.sh && python3 tools/contrast_calculator.py --check '#b43628' -b '#ffffff' -r 5.5

# audit the built-in demo rainbow palette (generic palette, not this app's colors)
source source_me.sh && python3 tools/contrast_calculator.py --audit
```

## Online calculators

- **WebAIM Contrast Checker** -- interactive web tool for checking any color pair.
  Append `&api` to any permalink for JSON output, e.g.
  `https://webaim.org/resources/contrastchecker/?fcolor=FFFFFF&bcolor=9BC8EA&api`
- **ACART Contrast Checker** -- alternative checker with visual preview.

## UI chrome tokens

Light and dark token values are defined in `src/css/tokens.css`.
The `:root` block holds light-mode defaults; `[data-ui-theme="dark"]` overrides them.

| Token | Light value | Dark value | Surface | Ratio |
| --- | --- | --- | --- | --- |
| `--color-text` | `#222222` | `#e0e0e0` | `#f5f5f5` / `#1e1e1e` | >7:1 |
| `--color-heading` | `#222222` | `#e8e8e8` | `#ffffff` / `#252525` | >7:1 |
| `--color-muted` | `#666666` | `#a0a0a0` | `#ffffff` / `#252525` | ~5.7:1 / ~2.2:1 (decorative only) |
| `--color-danger` | `#b43628` | `#ff6c60` | `#ffffff` / `#252525` | 6.00:1 / 5.52:1 |

The `--color-danger` token is used for destructive action text and autosave error
indicators. The light value `#b43628` passes at 6.00:1 on `#ffffff` and 5.51:1 on
`#f5f5f5`; the dark value `#ff6c60` passes at 5.52:1 on `#252525` and 6.01:1 on
`#1e1e1e`.

`--color-muted` is used only for decorative secondary text; its dark-mode value
(~2.2:1 on `#252525`) is intentionally below 5.5:1 and is not relied on for
information-critical text.

## Flowchart node palettes

Palette ramps are defined in `src/palettes.ts`. Two palettes ship: `earth` and
`fire`. Each has six fill stops, depth 0 (lightest) through depth 5 (darkest).
Adapted from a concept-map editor fork.

The node label color is chosen at runtime in `src/flow_node.tsx` by the
`label_color_for_fill` function, which picks whichever of near-black (`#1a1a1a`)
or near-white (`#f0f0f0`) yields the higher WCAG contrast ratio against the node
fill. The selection uses the full WCAG relative-luminance formula (IEC 61966-2-1).

### Earth palette

| Depth | Fill hex | Label chosen | Ratio |
| --- | --- | --- | --- |
| 0 | `#f5f0e0` | near-black | >10:1 |
| 1 | `#d4e6b5` | near-black | >7:1 |
| 2 | `#a8c97a` | near-black | ~5.7:1 |
| 3 | `#7aaa50` | near-black | ~5.8:1 |
| 4 | `#4d7a28` | near-white | ~5.1:1 (below target -- see note) |
| 5 | `#2e4a10` | near-white | >7:1 |

### Fire palette

| Depth | Fill hex | Label chosen | Ratio |
| --- | --- | --- | --- |
| 0 | `#fff8c2` | near-black | >15:1 |
| 1 | `#ffd966` | near-black | ~8:1 |
| 2 | `#ffaa33` | near-black | ~5.6:1 |
| 3 | `#f07020` | near-black | ~5.7:1 |
| 4 | `#d03010` | near-white | ~5.1:1 (below target -- see note) |
| 5 | `#8a1a00` | near-white | >7:1 |

**Known residual:** Earth depth 4 (`#4d7a28`) and fire depth 4 (`#d03010`) are
mid-luminance fills that reach only approximately 5.1:1 with either pure black or
white. Neither candidate clears 5.5:1 because the fills sit near the luminance
crossover. Resolving this requires adjusting the palette fill values themselves;
the label picker cannot compensate for an inherently mid-luminance fill.

## Edge and branch-label colors

Edge and branch-label inline attribute constants are defined in `src/flow_edge.tsx`.

| Element | Light value | Dark value | Background | Ratio |
| --- | --- | --- | --- | --- |
| Edge stroke | `#6a6a6a` | `#9a9a9a` | `#ffffff` / `#1e1e1e` | ~4.5:1 / ~4.0:1 |
| Highlight accent | `#1565c0` | `#5aabff` | `#ffffff` / `#1e1e1e` | ~7:1 / ~5.5:1 |
| Branch label True | `#176117` (green) | `#4caf50` (green) | `#ffffff` halo / `#1e1e1e` halo | 7.6:1 / 6.0:1 |
| Branch label False | `#b43628` (red) | `#ff6c60` (red) | `#ffffff` halo / `#1e1e1e` halo | 6.0:1 / 6.0:1 |
| Comment edge stroke | dashed, same stroke palette | same | same | same |

Edge strokes are geometric lines rather than text; strict 5.5:1 text contrast does
not apply, but values were chosen to be clearly visible. Branch labels use color
to reinforce meaning: green for the True path, red for the False path. The text
string ("True" / "False") conveys the state independently, so color is
reinforcement, not the sole cue. Labels are rendered with a halo
(light mode: `#ffffff`, dark mode: `#1e1e1e`) painted behind the glyphs via
`paint-order: stroke`, ensuring legibility wherever the label crosses an edge.
Comment edges use a dashed stroke in the same color ramp; they carry no text label.

## Rules

- Every foreground/background text pair should be checked before use.
- Use `tools/contrast_calculator.py` or the WebAIM Contrast Checker for spot checks.
- Decorative non-text elements (edge strokes, geometric fills without adjacent labels)
  are exempt from the 5.5:1 text requirement but should still be clearly distinguishable.
- When a mid-luminance fill cannot reach 5.5:1 with any label color, document the
  residual in this file rather than silently shipping a failing pair.

## Related documentation

- [docs/active_plans/audits/dark_mode_contrast_audit.md](active_plans/audits/dark_mode_contrast_audit.md) - full dark-mode contrast audit
