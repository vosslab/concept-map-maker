# Code architecture

## Overview

Concept Map Maker is a browser-only SolidJS + TypeScript app. Students enter
subject-verb-object triples in a spreadsheet-style table; the app derives concepts,
auto-lays them out with dagre, renders an SVG map, validates the assignment rubric live,
and autosaves to localStorage. There is no backend; the production build is a static
`dist/` folder served on GitHub Pages.

## Major components

### UI shell and panels (SolidJS components)

- [src/main.tsx](../src/main.tsx) - entry point; mounts the app into `#app`.
- [src/app.tsx](../src/app.tsx) - top-level layout: toolbar, editor pane, map pane,
  rubric panel; captures the live SVG element ref for exports. Includes the
  `<div class="pane-resizer">` divider: pointer-capture drag updates `--editor-ratio`
  on `.main-area` (clamped 25%-65%); double-click resets to 40%; ArrowLeft/ArrowRight
  nudge by 2%; ratio persists to `localStorage["concept-map-maker:editor-ratio"]`. Also
  owns the corner-style preset: loads `localStorage["concept-map-maker:corner-style"]`
  on mount, applies `data-corners` attribute to `<html>`, and handles preset changes
  via a dropdown in the Layout toolbar group (four presets: Capsule, Oval, Rounded rect, Corner rect).
- [src/toolbar.tsx](../src/toolbar.tsx) - ribbon toolbar with four labeled groups (File,
  CSV, Image & Print, Layout). Each button carries a Font Awesome solid glyph
  (`aria-hidden="true"`) plus a text label. Icons are served from the vendored
  `vendor/fontawesome/` assets (fa-solid.min.css + fa-solid-900.woff2); no CDN
  dependency. `build_github_pages.sh` copies `vendor/fontawesome/` into `dist/` and
  asserts `dist/vendor/fontawesome/fa-solid-900.woff2` exists before reporting success.
- [src/triples_table.tsx](../src/triples_table.tsx) and
  [src/triple_row.tsx](../src/triple_row.tsx) - spreadsheet UI for triples, including
  paste-from-Excel handling.
- [src/rubric_panel.tsx](../src/rubric_panel.tsx) - live rubric checklist; clicking a row
  flashes the first offending element.
- [src/concept_autocomplete.tsx](../src/concept_autocomplete.tsx) - concept-label
  autocomplete for from/to inputs.
- [src/theme_picker.tsx](../src/theme_picker.tsx) - bubble shape and palette selector.

### Map rendering (SVG)

- [src/map_canvas.tsx](../src/map_canvas.tsx) - SVG root with pan/zoom viewport; renders
  edges and nodes.
- [src/concept_node.tsx](../src/concept_node.tsx) - draggable themed bubble; drag end
  stores a position override.
- [src/concept_edge.tsx](../src/concept_edge.tsx) - curved edge with arrowhead and hover
  highlight.

### State

- [src/app_state.ts](../src/app_state.ts) - central reactive store. Holds the
  `CmapDocument` store (title, triples, drag overrides, theme), an ephemeral
  hover signal, derivation memos, mutation actions, and a debounced (500 ms) autosave
  effect that writes to localStorage. Also exposes the per-cell active-concept
  highlighting API: `active_concept` (focus wins over hover), `cell_classification`
  (one `Map<ConceptKey, CellRole>` per active-concept change), `set_cell_focus` /
  `set_cell_hover`, `focused_concept`, and the `CellRole` type ("same" / "from" / "to").
- [src/types.ts](../src/types.ts) - shared type contracts (`Triple`, `CmapDocument`,
  `ConceptKey` normalizer, `ValidationItem`, themes).

### Pure derivation modules (no Solid imports, node-testable)

- [src/derive_concepts.ts](../src/derive_concepts.ts) - triples to unique concepts with
  adjacency lists.
- [src/layout_graph.ts](../src/layout_graph.ts) - dagre layout (top-down, cycle-tolerant
  via greedy feedback-arc removal).
- [src/graph_depth.ts](../src/graph_depth.ts) - BFS depth from origin concepts (drives
  bubble coloring).
- [src/validate_document.ts](../src/validate_document.ts) - rubric checks (complete
  triples, isolated concepts, typo hints).
- [src/edge_geometry.ts](../src/edge_geometry.ts) - curved edge paths and arrowhead geometry.
- [src/map_bounds.ts](../src/map_bounds.ts) - bounding box for viewBox and export sizing.
- [src/themes.ts](../src/themes.ts) - theme color palettes and shapes.
- [src/measure_text.ts](../src/measure_text.ts) - pixel-accurate text width measurement
  via a shared offscreen canvas context. Used by the triples table to autosize each column
  to the widest committed value at commit time (not per keystroke).

### Codecs and export

- [src/document_codec.ts](../src/document_codec.ts) - versioned JSON
  serialize/parse for the whole document; prunes stale overrides on load.
- [src/csv_codec.ts](../src/csv_codec.ts) - RFC 4180 CSV/TSV parse and serialize for
  triples (Excel paste, CSV import/export).
- [src/export_svg.ts](../src/export_svg.ts) - SVG text export and SVG/PNG download from
  the live SVG element.

## Data flow

1. User edits the triples table; mutation actions in
   [src/app_state.ts](../src/app_state.ts) update the `CmapDocument` store.
2. Memos derive concepts, depths, validation items, and the dagre layout. Derivations
   read only `triples`, never drag overrides or hover state, so dragging never re-runs
   layout.
3. [src/map_canvas.tsx](../src/map_canvas.tsx) renders each concept at
   `override ?? layout` position and each triple as a curved edge.
4. Hover (table row, bubble, or edge) sets the ephemeral hover signal, which drives
   cross-highlight memos in both directions.
5. A debounced effect serializes the document via
   [src/document_codec.ts](../src/document_codec.ts) into
   `localStorage["concept-map-maker:document"]`; boot reads the same slot.

## Build pipeline

- [build_github_pages.sh](../build_github_pages.sh) - canonical production build: wipes
  `dist/`, type-checks, runs [pipeline/build.mjs](../pipeline/build.mjs), copies
  `src/index.html` and `src/style.css` into `dist/`, writes `dist/.nojekyll`.
- [pipeline/build.mjs](../pipeline/build.mjs) - esbuild bundler (entry `src/main.tsx`,
  ESM, minified, sourcemap, esbuild-plugin-solid for JSX); also provides a watch/serve
  mode.
- [run_web_server.sh](../run_web_server.sh) - builds, then serves `dist/` with
  `python3 -m http.server` on a random port.

## Testing and verification

- [check_codebase.sh](../check_codebase.sh) - the gate: tsc typecheck (app + lint
  configs), ESLint (zero warnings), Prettier check, and node unit tests
  (`node --import tsx --test tests/test_*.mjs`).
- `tests/test_*.mjs` - node unit tests for the pure modules (codecs, layout, depth,
  validation, bounds, themes).
- `tests/playwright/*.spec.ts` - browser E2E run via
  [run_playwright_tests.sh](../run_playwright_tests.sh), which auto-builds `dist/` and
  serves it during the run.
- `tests/test_*.py` - Python hygiene pytest suite (whitespace, ASCII, markdown links,
  shebangs, bandit); run with `pytest tests/`.

## Extension points

- New derived view of the map: add a pure module in `src/` plus a memo in
  [src/app_state.ts](../src/app_state.ts), with a node test in `tests/`.
- New rubric rule: extend [src/validate_document.ts](../src/validate_document.ts) and its
  test.
- New export format: follow the pattern in [src/export_svg.ts](../src/export_svg.ts) and
  wire a button in [src/toolbar.tsx](../src/toolbar.tsx).
- New theme: add to [src/themes.ts](../src/themes.ts).

## Known gaps

- Reactive memos and effects in `app_state.ts` are proven indirectly through pure helper
  tests and Playwright runs; no direct node-level memo tests exist.
