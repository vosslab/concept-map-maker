# A11y audit: UI refinements (2026-06-12)

Read-only accessibility audit of the UI refinements work (WP-A1 through WP-E1).
Ten findings across HIGH / MED / LOW severity tiers, covering WCAG 2.1 AA gaps
and best-practice omissions.

## Summary table

| ID | Severity | Area | WCAG criterion | Short description |
| --- | --- | --- | --- | --- |
| C-1 | HIGH | Cell color coding | 1.4.1 Use of Color | Cell roles communicated by tint only |
| R-3 | HIGH | Resizer | 2.4.11 Focus Not Obscured | Focus outline has insufficient contrast |
| TT-1 | HIGH | Style token | - | `--color-text` token undefined |
| T-1 | MED | Toolbar | 1.3.1 Info and Relationships | Group captions not programmatically associated |
| TT-4 | MED | Triples table | 2.4.7 Focus Visible | `.triples-add-btn` has no `:focus-visible` rule |
| TT-5 | MED | Triples table | - | Chain button `aria-label` lacks row number |
| R-1 | LOW | Resizer | 1.3.1 Info and Relationships | `aria-valuetext` absent from separator |
| K-3 | MED | Autocomplete | 1.3.1 Info and Relationships | Listbox has no max-height; can overflow viewport |
| T-2 | LOW | Toolbar | 2.4.7 Focus Visible | `.toolbar-btn` has no `:focus-visible` rule |
| R-2 | LOW | Resizer | - | Keyboard adjust/double-click-reset not documented |

---

## HIGH findings

### C-1 Color-only highlight roles (WCAG 1.4.1)

Three cell states (`cell-same`, `cell-from`, `cell-to`) are distinguished
exclusively by background tint. Users who cannot perceive color differences have
no other cue to tell roles apart.

Fix: add a distinct left-edge border style to each role class (solid / double /
dashed) so the shape cue persists without color.

Contrast values for input text (#1a1a1a) against each tint:

| Token | Hex | Contrast vs #1a1a1a | AA pass? |
| --- | --- | --- | --- |
| `--from-tint` | #cfe8ff | 13.5:1 | YES |
| `--to-tint` | #ffe2b8 | 13.9:1 | YES |
| `--same-tint` | #cdebcb | 13.7:1 | YES |

All three tints pass WCAG AA large-text (3:1) and normal-text (4.5:1) by a wide
margin. The gap is the non-color cue, not the contrast ratio.

### R-3 Resizer focus hairline fails 2.4.11

The `:focus-visible` state currently changes only the `::before` hairline color
from `--color-border` (#d0d0d0) to `--from-accent` (#5aabff). No outer outline
is added to the resizer element. WCAG 2.4.11 requires that the focus indicator
have an area of at least the perimeter of the component multiplied by 2px and
a contrast of at least 3:1. A 2px hairline at ~2.26:1 contrast against the
white surface pane fails this criterion.

Fix: add `outline: 2px solid var(--from-accent); outline-offset: 0;` on
`.pane-resizer:focus-visible`.

### TT-1 Undefined `--color-text` token (src/style.css ~101, ~117)

`--color-text` is referenced in `.toolbar-title-input` and `.toolbar-btn` but
is never declared in `:root`. Browsers fall back to `inherit` (black), which
works visually, but the intent is unspecified and the token will silently break
if the fallback chain ever changes.

Fix: add `--color-text: #222222;` to `:root`.

---

## MED findings

### T-1 Toolbar group captions not programmatically associated (WCAG 1.3.1)

Each `.toolbar-group` carries `aria-label` directly on the wrapper span.
Meanwhile the `.toolbar-group-caption` span renders visible text that is
identical to that label. Screen readers encounter two separate label sources
and may announce them redundantly. The correct pattern is to give the caption
an `id` and let the wrapper use `role="group"` + `aria-labelledby`.

Fix: add an `id` to each `.toolbar-group-caption`; add `role="group"` and
`aria-labelledby={caption_id}` to each wrapper; remove the redundant `aria-label`.

### TT-4 `.triples-add-btn` no `:focus-visible` rule (WCAG 2.4.7)

The add-row button does not have an explicit `:focus-visible` style. Browsers
that suppress the default focus ring for pointer interactions will leave
keyboard users with no visible indicator after tabbing to the button.

Fix: add a `:focus-visible` outline rule matching the toolbar button pattern.

### TT-5 Chain button `aria-label` lacks row number

All chain buttons share the label "Chain new row from this concept". Screen
reader users who navigate by button list cannot distinguish which row each
button belongs to without surrounding context.

Fix: change to `aria-label={`Chain new row from row ${row_num()}`}`.
The Playwright test in `tests/playwright/add_row_and_chain.spec.ts` selects
the chain button by `.triple-chain-btn` class, not by aria-label, so no
selector update is needed.

### K-3 Autocomplete listbox has no max-height (WCAG 1.3.1)

The suggestions dropdown has no `max-height` constraint. On a document with
many concepts the listbox can grow taller than the viewport, making lower
suggestions unreachable without scrolling the whole page.

Fix: add `max-height: 240px; overflow-y: auto;` to the listbox CSS rule.

---

## LOW findings

### R-1 Resizer `aria-valuetext` absent (WCAG 1.3.1)

The `.pane-resizer` exposes `aria-valuenow` as a raw number (e.g. `40`).
Screen readers announce "40" with no unit. Adding `aria-valuetext` such as
"40% editor width" gives the number meaning.

Fix: add `aria-valuetext={`${editor_ratio()}% editor width`}` to the resizer
element in `src/app.tsx`.

### T-2 `.toolbar-btn` no `:focus-visible` rule (WCAG 2.4.7)

Same gap as TT-4. Toolbar buttons carry no explicit `:focus-visible` rule and
rely on the browser default, which is suppressed in some browsers when the
last interaction was a pointer click.

Fix: add a `:focus-visible` outline rule for `.toolbar-btn`.

### R-2 Resizer keyboard ops undocumented

Arrow-key adjustment (2% step) and double-click reset (40%) are implemented
but not surfaced to assistive technology users via `aria-keyshortcuts` or a
tooltip. Low priority as the control is fully keyboard-operable; the gap is
discoverability only.

No code fix in this patch; note in `docs/USAGE.md` if that doc is updated.
