# News

Release highlights and announcements for the pseudo-code flowchart editor.
For the full change history, see [docs/CHANGELOG.md](CHANGELOG.md).

## Current development (post 26.06)

- Fork rebrand: converting from a SolidJS concept-map editor to a pseudo-code
  flowchart editor with an eight-shape grammar, True/False branch labels, loop
  back-edges, and a CodeMirror source pane.
- App deployed on GitHub Pages: https://vosslab.github.io/pseudo-code-mapper/ (live project page).

## 26.06 (2026-06-12)

Shipped as the concept-map editor (pre-rebrand baseline):

- Two-state light/dark theme toggle replaces three-state auto/light/dark cycle.
- CSS split: monolithic `src/style.css` decomposed into focused modules under `src/css/`.
- Toolbar ribbon icons via vendored Font Awesome Free 6.7.2 (no CDN dependency).
- Commit-time column autosize in the triples table (canvas `measureText`).
- Three-color per-cell highlight (same / from / to) in the triples table.
- Draggable pane resizer between editor and map panes, persisted to localStorage.
- Print forces light-mode rendering so dark-ink waste is avoided.

## Earlier releases

Release highlights before 26.06 are not recorded here.
The complete change history for earlier work is in [docs/CHANGELOG.md](CHANGELOG.md).
