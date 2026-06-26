# Code architecture

## Overview

The pseudo-code flowchart editor is a browser-only SolidJS + TypeScript app. The
user writes pseudo-code in a CodeMirror editor pane; clicking Update Flowchart
parses the source, derives a FlowGraph, lays it out with Dagre, and renders an
SVG diagram. There is no backend; the production build is a static `dist/` folder
served on GitHub Pages.

## Major components

### UI shell and panels (SolidJS components)

- [src/main.tsx](../src/main.tsx) - entry point; mounts the app into `#app`.
- [src/app.tsx](../src/app.tsx) - top-level layout: toolbar strip, editor pane,
  map pane; owns the pane-resizer divider (drag, double-click reset, keyboard
  nudge; ratio persists to `pseudo-code-flowchart:editor-ratio`).
- [src/toolbar.tsx](../src/toolbar.tsx) - ribbon toolbar with file/save/load
  buttons, theme controls, and the Update Flowchart trigger. Icons are served
  from vendored `vendor/fontawesome/` assets; no CDN dependency.
- [src/code_editor.tsx](../src/code_editor.tsx) - CodeMirror 6 editor component
  with pseudo-language syntax highlighting and line-error decorations.
- [src/pseudo_language.ts](../src/pseudo_language.ts) - CodeMirror 6 `StreamLanguage`
  extension that provides keyword, comment, and number highlighting for the editor.
  Intentionally lightweight; authoritative parsing lives in `src/pseudo_lang/`.
- [src/empty_state.tsx](../src/empty_state.tsx) - overlay panel shown when the
  document source is empty; offers one-click template buttons.
- [src/template_actions.ts](../src/template_actions.ts) - shared `load_template`
  action for the empty-state panel and the toolbar; owns the overwrite guard and
  codec round-trip before replacing the document.
- [src/theme_picker.tsx](../src/theme_picker.tsx) - color palette selector dropdown
  in the toolbar; lets the user switch between named `ThemePalette` entries.
- [src/ui_theme_toggle.tsx](../src/ui_theme_toggle.tsx) - toolbar button cycling
  the UI appearance between Light and Dark.

### UI theme

- [src/ui_theme.ts](../src/ui_theme.ts) - two-state (light / dark) appearance
  model. Exports the `UiTheme` type, load/save/apply/next helpers, and the
  `map_is_dark()` resolved accessor (a `createMemo`). The `set_exporting_light()`
  flag ensures SVG/PNG exports always snapshot light-mode colors.
- [src/index.html](../src/index.html) - inline script that reads
  `pseudo-code-flowchart:ui-theme` from localStorage and sets `data-ui-theme` on
  `<html>` before any CSS or JS loads, preventing a theme flash.

### Pseudo-code parser (pure TypeScript, node-testable)

The three modules under `src/pseudo_lang/` implement the parsing pipeline:

- `src/pseudo_lang/lexer.ts` - tokenizes source text into keyword, identifier,
  and punctuation tokens with line numbers.
- `src/pseudo_lang/normalize.ts` - normalizes indentation (tabs/spaces) and
  end-keyword blocks into a uniform form for the parser.
- `src/pseudo_lang/parser.ts` - produces a list of `ParsedNode` records from
  normalized token lines; assigns one of eight `NodeShape` values per statement.

### Graph derivation (pure, node-testable)

- [src/derive_graph.ts](../src/derive_graph.ts) - converts parsed nodes to a
  `FlowGraph` (nodes + edges), wires True/False branches for decisions, back-edges
  for loops, and auto-adds missing `start`/`end` terminals. Includes a one-entry
  memo to skip re-parsing identical source.

### Map rendering (SVG)

All map rendering uses inline SVG attributes (never CSS classes) so the export
DOM is self-contained. `map_is_dark()` is called at render time to resolve
light/dark colors for edges, arrowheads, and node borders.

- [src/map_canvas.tsx](../src/map_canvas.tsx) - SVG root with pan/zoom viewport;
  renders edges first, then nodes.
- [src/flow_node.tsx](../src/flow_node.tsx) - draws each of the eight flowchart
  shapes (oval, parallelogram, rectangle, diamond, hexagon, double-rectangle,
  dashed rectangle, circle) with the node text centered inside.
- [src/flow_edge.tsx](../src/flow_edge.tsx) - draws curved edges with arrowheads,
  True/False branch labels, and back-edge arcs for loop return paths.

### Layout

- [src/layout_graph.ts](../src/layout_graph.ts) - Dagre auto-layout (top-down);
  routes back-edges so loop return arrows do not cross node bodies.
- [src/edge_routing.ts](../src/edge_routing.ts) - geometry helpers for back-edge
  arc paths and connector placement.

### State

- [src/app_state.ts](../src/app_state.ts) - central reactive store. Holds the
  `FlowDocument` store (title, source, overrides, theme), an ephemeral hover
  signal, derivation memos (parse -> graph -> layout), mutation actions, and a
  debounced autosave effect to `localStorage` (`pseudo-code-flowchart:document` slot).
- [src/types.ts](../src/types.ts) - shared type contracts (`FlowNode`, `FlowEdge`,
  `FlowGraph`, `FlowDocument`, `NodeShape`, `FlowTheme`). Zero imports; the frozen
  contract for the whole codebase.

### Pure derivation modules (no Solid imports, node-testable)

- [src/edge_geometry.ts](../src/edge_geometry.ts) - curved edge paths and
  arrowhead geometry.
- [src/map_bounds.ts](../src/map_bounds.ts) - bounding box for viewBox and export
  sizing.
- [src/themes.ts](../src/themes.ts) - exports `DEFAULT_THEME`, `THEME_PALETTES`, and
  `ORIGIN_EMPHASIS` (default theme, palette list, origin-emphasis stroke constants).
- [src/palettes.ts](../src/palettes.ts) - node color palette data. Pure data module.
- [src/templates.ts](../src/templates.ts) - prefilled example flowcharts
  (`TEMPLATES`) as inline `FlowDocument` objects. Pure data module.
### Codecs and export

- [src/document_codec.ts](../src/document_codec.ts) - versioned JSON
  serialize/parse for `FlowDocument`; prunes stale position overrides on load.
- [src/export_svg.ts](../src/export_svg.ts) - SVG text export and SVG/PNG
  download from the live SVG element; sets `set_exporting_light(true)` before
  the microtask flush so exports always use light-mode colors.

### Styles

- [src/style.css](../src/style.css) - barrel file of `@import` statements; all
  CSS modules are bundled in cascade order.
- CSS modules under `src/css/`: `tokens.css` (design tokens + dark override),
  `base.css`, `toolbar.css`, `editor.css`, `map.css`, `print.css`.

## Data flow

1. User edits pseudo-code in the CodeMirror editor pane.
2. Clicking Update Flowchart triggers `derive_graph` via the state memo. The
   parser in `src/pseudo_lang/` produces `ParsedNode` records; `derive_graph.ts`
   assembles the `FlowGraph`.
3. `layout_graph.ts` runs Dagre on the `FlowGraph`, producing `(x, y)` positions
   for each node and edge control points.
4. `map_canvas.tsx` renders the positioned graph as SVG. Node positions use
   `override ?? layout` so manually dragged nodes hold their position.
5. A debounced effect serializes the `FlowDocument` via `document_codec.ts` into
   `localStorage` (`pseudo-code-flowchart:document`); boot reads the same slot.
6. SVG/PNG export sets `set_exporting_light(true)`, clones the DOM, then resets
   the flag so the exported file always uses light-mode colors.

## Build pipeline

- [build_github_pages.sh](../build_github_pages.sh) - canonical production build:
  wipes `dist/`, type-checks, runs [pipeline/build.mjs](../pipeline/build.mjs),
  copies `src/index.html` and `src/style.css` into `dist/`, writes
  `dist/.nojekyll`.
- [pipeline/build.mjs](../pipeline/build.mjs) - esbuild bundler (entry
  `src/main.tsx`, ESM, minified, sourcemap, esbuild-plugin-solid for JSX); also
  provides a watch/serve mode.
- [run_web_server.sh](../run_web_server.sh) - builds, then serves `dist/` with
  `python3 -m http.server` on a random port.

## Testing and verification

- [check_codebase.sh](../check_codebase.sh) - the gate: tsc typecheck (app + lint
  configs), ESLint (zero warnings), Prettier check, and node unit tests
  (`node --import tsx --test tests/test_*.mjs`).
- `tests/test_*.mjs` - node unit tests for pure modules (parser, codec, layout,
  geometry, templates).
- `tests/playwright/*.spec.ts` - browser E2E run via
  [run_playwright_tests.sh](../run_playwright_tests.sh), which auto-builds `dist/`
  and serves it during the run.
- `tests/test_*.py` - Python hygiene pytest suite (whitespace, ASCII, markdown
  links, shebangs, imports, bandit); run with `pytest tests/`.

## Extension points

- New node shape: add to `src/pseudo_lang/parser.ts` (token recognition), extend
  the `NodeShape` union in [src/types.ts](../src/types.ts), add a draw path in the
  node renderer.
- New parse rule: extend `src/pseudo_lang/parser.ts` and add fixtures in
  `tests/test_pseudo_parser.mjs`.
- New export format: follow the pattern in [src/export_svg.ts](../src/export_svg.ts)
  and wire a button in [src/toolbar.tsx](../src/toolbar.tsx).
- New color palette: add to [src/palettes.ts](../src/palettes.ts) and extend
  `ThemePalette` in [src/types.ts](../src/types.ts).
- New CSS section: add a file under `src/css/` and add its `@import` to
  [src/style.css](../src/style.css).

## Known gaps

- Reactive memos and effects in `app_state.ts` are proven indirectly through pure
  helper tests and Playwright runs; no direct node-level memo tests exist.
