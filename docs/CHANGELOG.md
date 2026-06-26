# Changelog

## 2026-06-26

### Fixes and Maintenance

- `src/css/map.css`: fixed unreadable template buttons in dark mode. The empty-state
  template buttons use the fixed light-blue `--from-tint` background (shared by table
  columns and map highlights, no dark override), while their label/desc use theme-aware
  text tokens that turn light in dark mode, so a light label landed on a light-blue button
  and disappeared. Added a `[data-ui-theme="dark"]` override giving the button a dark
  blue-tinted surface (`#22344a`) with the accent border, plus a lighten-on-hover so the
  hover cue works on the dark surface.

## 2026-06-25

### Additions and New Features

- `src/templates.ts`: new template data module exporting `TemplateEntry` interface and `TEMPLATES`
  array with three inline `CmapDocument` objects (Honeybees 8 triples, Water cycle 9 triples,
  Photosynthesis 9 triples); pure data module, no Solid or DOM imports.
- `src/template_actions.ts`: shared `load_template` action with overwrite guard
  (`window.confirm` on non-empty maps) and codec round-trip clone; injectable confirm parameter
  for testability.
- `src/empty_state.tsx` + `src/app.tsx` + `src/css/map.css`: inviting overlay panel in the map
  pane shown when the document has no triples; explanatory heading/subheading teaching the
  concept -> relationship -> concept model, three template buttons as primary actions, and a
  secondary "Start blank" button that adds a row and focuses the from-cell input; wired into
  `app.tsx` behind `<Show when={state.doc.triples.length === 0}>`; not a blocking modal.
- `src/toolbar.tsx`: new Examples toolbar group rendering TEMPLATES as native buttons via `<For>`,
  each calling `load_template`; keyboard operable; non-empty overwrite confirm delegated to
  `load_template`.

### Behavior or Interface Changes

- Loading a template (from the empty-state panel or the toolbar Examples group) over a map that
  already has triples now prompts `Replace the current concept map?` before replacing; canceling
  leaves the existing map unchanged. Loading into an empty map replaces silently.

### Fixes and Maintenance

- `package.json`: fixed dependency version ranges that broke `npm install` with an `ERESOLVE`
  peer-dependency conflict. The `>=` floors floated to majors the Solid toolchain cannot use:
  `@babel/core`/`@babel/preset-typescript` `>=8.0.0` (but `babel-preset-solid@1.9.12` peers
  `@babel/core ^7`) and `eslint`/`@eslint/js` `>=10.x` (but `eslint-plugin-solid@0.14.5` peers
  `eslint <=^9`). Switched all ranges from unbounded `>=` floors to explicit
  `>=lower <next-major` bounds so a major cannot float past a peer constraint: babel
  `>=7.29.7 <8.0.0`, eslint and `@eslint/js` `>=9.39.4 <10.0.0`, `typescript`
  `>=6.0.3 <6.1.0` (`typescript-eslint@8.62` peers `typescript <6.1.0`); all other deps bumped
  to their newest published version with the same bounded style (`@types/node >=26.0.1 <27.0.0`,
  `typescript-eslint >=8.62.0 <9.0.0`, etc.). `npm install` resolves clean (0 vulnerabilities)
  and `check_codebase.sh` passes all 5 checks.

- `.github/workflows/deploy-pages.yml`: bumped GitHub Actions to their latest majors --
  `actions/checkout@v7`, `actions/setup-node@v6`, `actions/configure-pages@v6`,
  `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`. Kept the existing job structure
  (`npm ci`, npm cache, `path: dist`).

### Developer Tests and Notes

- `tests/test_templates.mjs`: Node tests validating template data (round-trip through
  serialize/parse, non-empty triples, unique triple ids, concept_key dedup > 1 concept,
  unique TEMPLATES entry ids) plus three `load_template` overwrite-guard tests exercising the
  injectable `confirm_fn` (empty map replaces without prompting; non-empty map cancel preserves;
  non-empty map accept replaces).
- `tests/playwright/empty_state.spec.ts`: six browser tests covering empty-state panel
  visibility, template loading via panel and toolbar, "Start blank" row-add and from-cell focus,
  toolbar Clear reset, and toolbar overwrite cancel/accept flows (Playwright/Chromium).
  Positive transitions use auto-retrying `expect()` waits instead of fixed sleeps.

## 2026-06-13

### Fixes and Maintenance

- `tests/test_label_layout.mjs`: replaced two near-identical single-edge exact-pin tests with
  one merged relational test ("a single edge with clear space is placed at its curve midpoint")
  that asserts the label x lies between the clipped endpoints and near their midpoint, and y is
  near the chord axis (within 1 px tolerance). Also replaced exact pins in "empty-verb edges"
  test with the same relational form.
- `tests/test_label_layout.mjs`: added new test "laned label overlapping a node box is nudged
  clear of it" covering the node-clearance nudge branch in `place_laned_label`. Two reciprocal
  edges between close nodes (w=60, gap=100) force a lane anchor onto a node box; the test
  asserts every placed label AABB clears both node boxes and the two lanes do not collapse.
- `tests/test_edge_geometry.mjs`: replaced `place_edge_label` exact-pixel pins (`point.x === 150`,
  `point.y === 0`) with relational assertions (point on curve range, near midpoint within 1 px,
  y equals `cubic.y0`). Replaced inlined char-width literal `6.6` and line-height literal `14`
  with imports of `LABEL_CHAR_W_PX`, `LABEL_LINE_H_PX`, `LABEL_CLEAR_MARGIN_PX` from
  `../src/label_wrap.ts` so test sizing tracks the production constant automatically.
- `tests/test_layout_graph.mjs`: rewrote the comment on "multi-word concept key in edge is
  registered and ranked by dagre" to accurately describe the B1 regression: edges between
  multi-word keys were dropped when edge identity was derived by string-splitting on a delimiter
  that could appear inside the key, producing phantom from/to keys that dagre never saw. No
  assertion changes.

### Additions and New Features

- `src/label_wrap.ts` added as a shared pure module (no DOM or Solid imports).
  Exports font constants (`LABEL_CHAR_W_PX`, `LABEL_LINE_H_PX`, `LABEL_MAX_LINE_PX`,
  `LABEL_MAX_LINES`), `wrap_verb_label` (word-wraps a verb phrase into lines that fit
  within `LABEL_MAX_LINE_PX`, capping at `LABEL_MAX_LINES`), and `label_box` (returns
  `{width, height}` for a wrapped-line array). Imported by `layout_graph.ts` for dagre
  edge sizing and by `concept_edge.tsx` for multi-line verb rendering.
- `src/label_layout.ts` added as a pure module (no DOM or Solid imports). Exports
  `compute_label_positions(edges, node_boxes, shape, curvatures)`, the centralized
  verb-label placement pass. The pass lays out all labels deterministically in input
  order: each label is placed at its maximum-clearance point via `place_edge_label`,
  then its AABB (sized by `label_box`/`wrap_verb_label`) is appended as an obstacle so
  later labels avoid it. Empty-verb edges are skipped (no position, no obstacle).
  Same-pair indexed lanes: edges connecting the same UNORDERED concept pair (A->B,
  B->A, and duplicates) are grouped and laid out along a shared perpendicular lane axis
  (`LANE_SPACING_PX = 24`; N=2 -> [-12, 12], N=3 -> [-24, 0, 24],
  N=4 -> [-36, -12, 12, 36]). A laned anchor that lands on a node box steps further
  out along the same axis side (`LANE_CLEARANCE_STEP_PX = 6`, up to
  `LANE_CLEARANCE_MAX_STEPS = 12`). Groups of size one keep the original max-clearance
  placement. Pure and deterministic (sort by id; no random/time).
- `src/edge_routing.ts` added as a post-dagre routing layer. Detects bypass edges
  (edges that skip over intermediate node ranks) and bulges them around any intermediate
  node box whose AABB they would otherwise clip. Shipped parameters:
  `NODE_CLEARANCE_PX = 20`, `CANDIDATE_OFFSETS_PX = [24,36,48,64,80,96]`,
  `MAX_CURVATURE = 1.0`.
- `src/edge_geometry.ts`: added and exported `label_min_clearance` (the
  per-point worst-clearance scorer `place_edge_label` uses internally), so the
  lane layout in `label_layout.ts` can reuse the same AABB clearance rule
  instead of re-deriving it. `place_edge_label` now calls `label_min_clearance`
  (no behavior change). `cubic_normal` remains internal to `edge_geometry.ts`.
- `src/map_canvas.tsx`: `edge_inputs()` now passes `from_key`/`to_key` so the
  label-layout pass can group edges by unordered pair.
- `src/layout_graph.ts` attaches wrapped verb label dimensions (`width`, `height`,
  `labelpos: "c"`) to each dagre edge so dagre reserves rank and sibling separation
  proportional to the actual verb text. Per unique (from, to) pair, the widest verb box
  across all matching rows is used. Self-loops are unchanged.
- `tests/test_label_wrap.mjs` added: node unit tests covering `wrap_verb_label` (single
  line, multi-line wrap, over-long single word, LABEL_MAX_LINES cap, empty/whitespace
  inputs) and `label_box` (empty array, height contract, positive width).
- `tests/test_label_layout.mjs` added: node unit tests for both the centralized
  placement pass (two parallel edges do not overprint, a clear single edge keeps its
  midpoint, determinism across two runs, empty-verb edges produce no position/obstacle)
  and the lane logic (four same-pair edges -> four distinct strictly-ordered
  non-overlapping lanes; two same-pair edges -> two straddling lanes; single edge
  unchanged at its midpoint).
- `tests/test_edge_routing.mjs` added: node unit tests for bypass-edge routing
  (clear corridor preserves nonzero base curvature; colliding intermediate node causes
  visible bulge).
- `tests/test_layout_graph.mjs`: added `multi-word concept key in edge is registered
  and ranked by dagre` regression test (chain "new york" -> "big apple" -> "tourism"
  produces TB-ordered y coordinates). Also added test that a long multi-word verb
  produces a wider overall layout width (>= 10 units margin) than a single-character
  verb on the same graph shape.

### Behavior or Interface Changes

- `src/layout_graph.ts`: layout spacing tuned to shipped values. `RANK_SEP_PX = 30`
  (compact vertical separation; dagre adds each edge's reserved label height on top,
  so multi-line verb labels still get the room they need). `NODE_SEP_PX = 55`
  (horizontal separation; allows intermediate nodes such as "people" in a
  bees->people->honey map to clear the center line of bypass edges).
  `EDGE_LABEL_WIDTH_MARGIN_PX = 48` added: each edge label's width is widened by this
  margin before passing to dagre, reserving a broader horizontal lane for labelled
  bypass edges. Comments on all three constants document the additive relationship with
  dagre's own spacing logic.
- `src/edge_routing.ts`: bypass-edge routing clearance tuned to shipped values.
  `NODE_CLEARANCE_PX = 20` (minimum clear gap around each intermediate node box);
  `MAX_CURVATURE = 1.0` (allows visible bulge around intermediate bubbles rather than
  just grazing their labels).

### Fixes and Maintenance

- `src/layout_graph.ts` (B1): fixed edge-label two-pass split bug. Pass 1 stored
  widest-label entries in `edge_labels: Map<string, DagreEdgeLabel>` and pass 2
  reconstructed `from_key`/`to_key` by splitting the composite key string on the first
  space. Multi-word concept keys (e.g. "new york") caused phantom split results so the
  edge was never registered in dagre and those concept pairs were not ranked. Fix:
  introduced `EdgeLabelEntry { from_key, to_key, label }` and changed the map to
  `Map<string, EdgeLabelEntry>`. The dedup key is now `"\0"`-joined (NUL character,
  never present in concept keys) for safety; pass 2 reads `entry.from_key` /
  `entry.to_key` directly.
- `src/edge_routing.ts` (H1): removed `export` from `CANDIDATE_OFFSETS_PX`;
  the constant is only used internally. `NODE_CLEARANCE_PX`, `MAX_CURVATURE`,
  and `CURVE_SAMPLES` remain exported as the test file imports them.
- `src/edge_routing.ts`: removed unused exported constant `LABEL_CLEARANCE_PX`
  (dead config -- the current pass routes around node boxes only, not label boxes;
  no callers existed in src/ or tests/).
- Concept-map bubble drag lost focus after ~one pointer step; root cause: nodes
  rendered with a fresh-tuple `<For each={Array.from(node_boxes().entries())}>` were
  recreated on every drag override, dropping pointer capture. Fixed by keying nodes
  by stable ConceptKey with a reactive box accessor.
- Verb edge labels could overlap node bubbles; fixed by (1) reserving space for each
  edge's wrapped verb label in the dagre layout so bubbles spread, (2) wrapping long
  verb phrases onto multiple lines, (3) placing each verb label at the clearest point
  along its edge via the centralized `compute_label_positions` pass (with same-pair
  indexed lanes so reciprocal edges do not pile up), and (4) routing bypass edges
  around intermediate node boxes via `src/edge_routing.ts`.
- `pipeline/build.mjs` `copy_assets()` now copies `vendor/fontawesome/` ->
  `dist/vendor/fontawesome/` on every build path. Previously only
  `build_github_pages.sh` copied vendor files; a bare `node pipeline/build.mjs`
  produced a `dist/` with no Font Awesome, causing toolbar icon 404s (tofu).
  The vendor directory is treated as a required input: missing source throws a
  clear `Error` rather than silently skipping.
- `build_github_pages.sh`: removed the now-redundant `mkdir -p dist/vendor/fontawesome`
  and three `cp vendor/fontawesome/...` lines (build.mjs owns the copy). The three
  hard assertions (`test -f dist/vendor/fontawesome/fa-solid-900.woff2`,
  `test -f dist/vendor/fontawesome/fa-solid.min.css`, and the corrupt
  `format(\"woff2\")` grep check) are retained so the shell still fails loudly if
  build.mjs did not produce them.

### Decisions and Failures

- Labels-vs-bubbles approach evolved: a label-slide approach (sliding labels along the
  edge curve to avoid nodes) was tried and reverted. The shipped solution instead routes
  bypass edges around intermediate node boxes (`src/edge_routing.ts`) and places labels
  via the centralized pass (`src/label_layout.ts`) that avoids both node boxes and
  already-placed labels as obstacles.
- Verb-label placement moved from per-edge (in `concept_edge.tsx`, blind to other
  labels) to the centralized pass. `concept_edge.tsx` now takes a resolved `label_pos`
  prop instead of an `obstacles` list; `map_canvas.tsx` runs `compute_label_positions`
  reactively over the live node-box memo so dragging a bubble re-runs the whole pass.
  Self-loops are included in the pass.
- Layout spacing tuned iteratively; shipped values are `RANK_SEP_PX = 30`,
  `NODE_SEP_PX = 55`, `EDGE_LABEL_WIDTH_MARGIN_PX = 48`. Intermediate trial of
  `NODE_SEP_PX = 80` caused dagre to re-order the layout non-monotonically and was
  reverted.
- Known limit: extremely dense same-pair clusters (many reciprocal/duplicate edges)
  use indexed lanes. A wider reroute strategy for very-dense clusters is future work.
  A very dense small map may leave a label tight against a node when no clear point
  exists along its short edge; the pass returns the least-bad (maximum-clearance)
  point deterministically.

### Developer Tests and Notes

- `tests/playwright/drag.spec.ts` full-distance tracking tolerance widened from 25px
  to 35px. The canvas `view_box()` calls `effective_extent()` on every drag move, so
  dragging a node outward grows the SVG viewBox and the whole map re-centers under
  `preserveAspectRatio="xMidYMid meet"`, shifting the dragged node's absolute screen
  position by a small global amount beyond the raw (80, 60) input delta. The dagre
  label-spacing enlarged maps, nudging that shift from ~25px to ~25.2px, exceeding
  the old 25px tolerance. The new 35px tolerance absorbs future layout-driven viewBox
  shifts while retaining clear separation from a broken drag: pre-fix tracking error
  was ~89px; post-fix ~25px. The existing `> 5px` moved check and the
  persist-after-edit (`drift < 2px`) assertions are retained.
- `tests/test_edge_routing.mjs`: base-curvature preservation test confirmed present
  and passing, protecting bidirectional/duplicate fanning behavior.
- `tests/test_layout_graph.mjs` "long multi-word verb widens overall layout" assertion
  made robust: now requires a clear margin (>= 10 units) instead of a bare `>`, and a
  comment explains why exact-width comparison is avoided.
- `tests/test_label_wrap.mjs` formula-pinning assert (`box.width == len*LABEL_CHAR_W_PX`)
  replaced with behavioral checks: positive width and monotonic-with-line-length. Height
  contract (`height == lines * LABEL_LINE_H_PX`) retained unchanged.
- `docs/CODE_ARCHITECTURE.md` and `docs/FILE_STRUCTURE.md` updated to list
  `src/label_wrap.ts`, `src/label_layout.ts`, and `src/edge_routing.ts` in their
  pure-module sections.
- Changelog 2026-06-13 entries reconciled: duplicate section headings merged, stale
  intermediate-state bullets (NODE_SEP journey, label-slide approach) rephrased to
  final shipped state. Each canonical subsection now appears exactly once.

## 2026-06-12

### Additions and New Features

- Light/Dark appearance toggle added to the far right of the toolbar (sun/moon icon with
  text label). Clicking flips between light and dark; the choice persists across page reloads
  via localStorage. On first-ever load with no stored preference the OS
  `matchMedia("(prefers-color-scheme: dark)")` result is consulted once and stored as a
  concrete value; the OS preference is not tracked live afterward. The toggle restyles both
  the UI chrome (toolbar, panels, backgrounds) and the on-screen concept map.

- On-screen concept map adapts to the active dark/light theme. Edges, verb labels, arrowhead
  markers, and node borders/label text switch to dark-suitable values when dark mode is active;
  light-mode values are unchanged. Bubble fill palettes (earth/fire) are left authored in both
  themes. The map-theme accessor reads the same `data-ui-theme` attribute the toggle writes,
  so the map stays in sync without extra wiring.

- SVG export, PNG export, and Print always render in light/authored colors regardless of the
  current screen theme. Export sets a flag before snapshot and resets it in a `finally` block;
  Print registers `beforeprint`/`afterprint` listeners that flip the same flag.

- CSS refactored: monolithic `src/style.css` (889 lines) split into seven focused modules
  under `src/css/`: `tokens.css`, `base.css`, `toolbar.css`, `editor.css`, `map.css`,
  `rubric.css`, `print.css`. `src/style.css` is now a 10-line barrel of `@import` statements.
  Bubble palette data extracted from `src/themes.ts` into a new `src/palettes.ts` module;
  `src/themes.ts` re-exports both symbols so existing importers are unaffected.

- Font Awesome Free 6.7.2 vendored into `vendor/fontawesome/` (local stylesheet reference,
  no CDN). Toolbar restyled as a ribbon: each semantic group (File, CSV, Image & Print) is
  a raised panel with a caption label and icon + text per button. All icons are
  `aria-hidden="true"`; button text labels and `aria-label` attributes are preserved.

- Commit-time column autosize for the triples table: the three text columns (from, verb, to)
  size to the widest committed value measured via canvas `measureText`. Draft keystrokes never
  resize a column; width changes animate over 150ms; header and body columns stay aligned.

- Three-color per-cell triple-table highlighting. Focusing or hovering a from/to cell sets
  an "active concept"; cells that share the same concept, point to it, or are pointed to by
  it receive distinct tint-and-border role cues. Focus always wins over hover; empty cells
  never activate.

- Bidirectional cross-highlight wiring: hovering a map bubble or edge highlights every
  referencing row in the triples table, and hovering a row highlights the corresponding
  bubble and edge on the map.

- Draggable pane resizer between the editor and map panes. Drag ratio persists to localStorage;
  ArrowLeft/ArrowRight adjust by 2%; double-click resets to 40%.

- Walkthrough demo player (`tests/playwright/walkthrough_demo.mts` + `run_walkthrough_demo.sh`)
  drives the UI like a human from a JSON dataset, records Playwright video, and saves
  per-row and final-map screenshots to `output_smoke/walkthrough/`.

- Capsule map bubble shape added to the Shape picker. Capsule is a stadium shape
  (rect with rx = ry = node height / 2) that produces fully rounded short ends.

- Triples table UX: stable row height (proposition preview in a fixed slot below rows),
  synchronous add-row commit, and a chain button that inserts a new row with `from`
  pre-filled from the committed `to` value of the current row.

- GitHub Pages deploy workflow (`.github/workflows/deploy-pages.yml`): triggers on push to
  `main` and `workflow_dispatch`; builds `dist/` with `npm ci && npm run build`, uploads as
  a Pages artifact, and publishes via `actions/deploy-pages`. Live URL:
  `https://vosslab.github.io/concept-map-maker/`.

- Docset additions: `docs/CODE_ARCHITECTURE.md`, `docs/FILE_STRUCTURE.md`, `docs/INSTALL.md`,
  `docs/FILE_FORMATS.md`, `docs/USAGE.md`, `docs/NEWS.md`, `docs/ROADMAP.md`, `docs/TODO.md`,
  `docs/TROUBLESHOOTING.md`, `docs/RELATED_PROJECTS.md`, `docs/RELEASE_HISTORY.md`, and
  `docs/COLOR_CONTRAST_ACCESSIBILITY.md`. `README.md` and `AGENTS.md` refreshed.
  Audit reports filed under `docs/active_plans/audits/`.

- `run_playwright_tests.sh` added as the canonical Playwright entry point. Handles preflight
  checks, auto-builds `dist/` when needed, and forwards remaining arguments to
  `npx playwright test`. Updated `package.json` `test:playwright` alias accordingly.

- CSV import/export: "Export triples CSV" and "Import triples CSV" toolbar buttons.
  Export downloads `<title>-triples.csv`; import appends parsed rows without wiping the
  document. `src/csv_codec.ts` provides RFC4180/TSV parsing with fuzzy header detection.

- SVG/PNG export and Print toolbar buttons. SVG and PNG buttons are disabled while the
  canvas element is unavailable. Filename derived from the document title.

- Rubric panel (`src/rubric_panel.tsx`) renders a live PASS/WARN/FAIL checklist from
  `state.validation()`. Clicking a rubric row briefly highlights the first offending
  node or edge on the map for 1.5s.

- Concept autocomplete (`src/concept_autocomplete.tsx`) in the triples table from/to cells:
  filters existing concepts by substring, commits on Enter/Tab/blur, snaps to canonical
  casing for known concepts.

- Dagre layout adapter (`src/layout_graph.ts`): deterministic top-down layered layout from
  complete triples rows; self-loops and duplicate edges dropped before ranking; cycles never
  throw.

- Edge geometry (`src/edge_geometry.ts`): clipped cubic bezier paths with bidirectional
  bowing and fan curvature; self-loop paths; `effective_extent` for viewBox/PNG/print sizing.

- App state module (`src/app_state.ts`): `create_app_state` returns the full component-facing
  API including autosaved document store, highlight memos, drag overrides, and validation.
  Pure helper functions extracted for headless unit testing.

- Core TypeScript modules added: `src/types.ts` (shared types and `concept_key` normalizer),
  `src/document_codec.ts` (versioned JSON codec), `src/themes.ts` (palettes, depth fill,
  shape registry), `src/graph_depth.ts` (multi-source BFS depth), `src/derive_concepts.ts`
  (concept extraction), `src/validate_document.ts` (rubric rules), `src/map_canvas.tsx`
  (SVG canvas root with pan/zoom), `src/concept_node.tsx` (draggable bubble renderer),
  `src/concept_edge.tsx` (cubic edge renderer), `src/export_svg.ts` (SVG/PNG export),
  `src/toolbar.tsx` (toolbar component), `src/triples_table.tsx` / `src/triple_row.tsx`
  (triples editor), `src/app.tsx` (app shell).

- Test fixtures added: `tests/fixtures/honeybees_triples.tsv`,
  `tests/fixtures/honeybees_document.json`, `tests/fixtures/stress_80_nodes.json`.

### Behavior or Interface Changes

- Appearance toggle simplified to two states (Light / Dark) with the OS preference consulted
  only on first load. The earlier three-state Light/Dark/Auto cycle and live OS tracking were
  removed. The toggle shows a sun or moon icon with a text label.

- Dark mode WCAG compliance: `--color-danger` token added for danger-red elements meeting
  the repo 5.5:1 contrast standard on both light and dark surfaces. Rubric chip colors
  (warn, hint) corrected to meet the standard. Theme-picker select and triples-table action
  buttons (add, delete, chain) now use theme tokens so they flip correctly in dark mode.
  Concept-map node labels pick black or white text based on fill luminance; depth-4 earth/fire
  fills reach approximately 5.1:1, a known residual below the full 5.5:1 target.

- Toolbar ribbon buttons wrap multi-word labels to two lines for a more compact ribbon.

- Triples table no longer overflows at 1024px or 768px window widths; columns compress
  via `minmax` CSS with responsive media queries at 900px and 768px.

- Corner-style dropdown removed. UI chrome corners are permanently fixed at classic Mac
  rounded rects (5px); no user-facing option and no localStorage persistence.

- Build pipeline scripts moved from `tools/` to `pipeline/`; `tools/` now holds standalone
  utilities only. `AGENTS.md` rewritten as a minimal pointer file referencing `docs/*.md`.

- Triples-table grid track superseded from static `minmax(9em, 1fr)` verb column to
  commit-time autosize tracks. Even column rhythm applied: three text columns share leftover
  width via `1fr`; arrow tracks fixed at `1.5em`; delete/chain buttons share a fixed width.

### Fixes and Maintenance

- Fixed Font Awesome icons rendering as empty tofu boxes: corrupt `format(\"woff2\")` hint
  in the vendored `fa-solid.min.css` (backslash-escaped quotes) replaced with valid
  `format("woff2")`. Build script gains assertions that the fixed CSS exists and is clean.

- Fixed triples-table action button visibility in dark mode: add button now uses theme-token
  background/color; delete button hover uses `color-mix` against the surface token instead of
  a hardcoded light color pair.

- Fixed `map_is_dark` in `src/ui_theme.ts`: replaced module-scope `createMemo` (which
  requires a Solid reactive owner) with a plain arrow function.

- Fixed `to_commit_fns` map in `TriplesTable` re-keyed from render index to stable
  `triple.id` so deleted-row stale closures are not returned after a row is removed.

- Fixed `pipeline/build.mjs` to copy `src/css/` into `dist/css/` so CSS `@import`
  references resolve correctly when served by the Playwright test server.

- Fixed Rounded bubble shape rendering identically to Capsule: `rounded` corner_radius
  lowered from 18 to 8, restoring a clearly distinct classic rounded rectangle.

- Fixed triples table still clipping at 768px: a second `@media (max-width: 768px)` block
  reduces arrow tracks to `1em`, fixes button tracks to `1.6em`, and lowers text-column
  clamp floors to `2.5em`, so the grid fits within the available pane width at that breakpoint.

- Accessibility fixes: non-color border cues on per-cell highlight roles (WCAG 1.4.1);
  `outline` on `.pane-resizer:focus-visible` (WCAG 2.4.11); toolbar ribbon groups given
  `role="group"` + `aria-labelledby` (WCAG 1.3.1); `:focus-visible` outlines on toolbar
  and add-row buttons (WCAG 2.4.7); chain button `aria-label` includes row number;
  resizer `aria-valuetext` and ARIA range attributes added; autocomplete listbox capped
  at `max-height: 240px`.

- Ribbon toolbar layout: each group panel lays buttons in a single horizontal row with
  a caption; new rhythm tokens `--ribbon-btn-gap`, `--ribbon-group-gap`, `--ribbon-btn-radius`
  give even, consistent spacing. Title input left, groups center-left, autosave right.

- TypeScript audit cleanups (7 items): replaced unchecked `as string` cast in `src/palettes.ts`
  with non-null assertion `ramp[idx]!`; removed `PALETTES`/`depth_fill` re-export shim from
  `src/themes.ts` and updated `src/concept_node.tsx` and `src/theme_picker.tsx` to import
  directly from `src/palettes`; removed `browser_storage` re-export from `src/ui_theme.ts`
  and updated `src/ui_theme_toggle.tsx` to import from `src/app_state` directly; converted
  `map_is_dark` from a typed arrow-const to a named function declaration; fixed misleading
  comment on `set_exporting_light` (now accurately describes true/false semantics); merged
  duplicate same-module imports in `src/ui_theme.ts` and `src/ui_theme_toggle.tsx`; changed
  `var t` to `let t` in `src/index.html` inline script and added a comment that the storage
  key must match `UI_THEME_STORAGE_KEY` in `src/ui_theme.ts`. `tests/test_themes.mjs` updated
  to import `PALETTES`/`depth_fill` from `src/palettes.js` directly.

- Post-audit code cleanup: removed dead `EditorTab` type, `active_tab` signal, tab-bar CSS,
  `--color-tab-active` variable; removed dead "hint" severity from rubric union; removed
  orphaned DOM ids and stale comments; removed workstream planning tags from production code
  and CSS; removed defensive fallbacks from `src/measure_text.ts`; merged duplicate
  `.main-area` CSS block; added missing `-> None` return annotation to `main()` in
  `tools/check_css_content_policy.py`; removed unused `packaging` from `pip_requirements-dev.txt`;
  added `output_smoke/` to `.gitignore`.

- Multiple rounds of Playwright and unit test cleanup: fragile exact-count and wall-clock
  assertions relaxed or removed; `waitForTimeout` calls replaced with auto-retrying expects
  or `waitForFunction` polling; planning-tag comments stripped from spec files; stale
  fixture-ID and hardcoded-size asserts converted to behavioral `>= N` forms.

- Formatted `src/ui_theme_toggle.tsx` with `npx prettier --write` to pass `check_codebase.sh`
  format check. Removed stale `fa-diagram-project` entry from toolbar icon test after Layout
  group removal.

### Removals and Deprecations

- Removed the "Re-layout" toolbar button and its Layout group. The button reset all bubble
  positions to auto-layout; it is removed along with the internal `clear_overrides` handler.
  Dragged bubble positions can still be cleared by renaming the concept in the Triples table.

- Removed the definitions feature entirely: `Definition` type, `definitions` document field,
  `DefinitionsTable` component, all definition state actions, the definitions tab and panel,
  definition rubric rules, and definition-related CSS. Fixtures and docs updated to match.
  The codec silently ignores a `definitions` field in older saved files.

- Corner-style dropdown (Capsule / Oval / Rounded / Corner) removed. The feature was
  misidentified as the intended deliverable for "Mac rounded rects" (which referred to node
  shapes, not chrome). All supporting code, CSS, localStorage key, and Playwright spec removed.

### Decisions and Failures

- Definitions removed by user decision: out of scope (students complete definitions separately).
  The app was unshipped, so no migration path is required. Old local files with a `definitions`
  key will open without error; the field is silently ignored.

- Corner-style dropdown was added and removed on the same day. The "Mac rounded rects" request
  referred to concept map node shapes, not UI chrome. The correct deliverable is the Capsule
  map shape option; UI chrome corners are permanently fixed at 5px.

### Developer Tests and Notes

- GitHub Pages live-asset verification: confirmed all five assets return HTTP 200
  (`/`, `/main.js`, `/style.css`, `/vendor/fontawesome/fa-solid.min.css`,
  `/vendor/fontawesome/fa-solid-900.woff2`). Deploy workflow ran green on the triggering push.

- Full Playwright test suite built under `tests/playwright/` (28 specs passing at close of day):
  smoke, paste, highlight, drag, export, autosave, print, stress, autocomplete, column autosize,
  cell highlight, add row and chain, toolbar icons, ui theme, and others.
  Helpers in `tests/playwright/helpers.ts`.

- Node unit tests added for all pure TypeScript modules: `test_concept_key.mjs`,
  `test_document_codec.mjs` (21 tests), `test_csv_codec.mjs` (29 tests),
  `test_derive_concepts.mjs` (12 tests), `test_graph_depth.mjs` (15 tests),
  `test_validate_document.mjs` (28 tests), `test_themes.mjs` (17 tests),
  `test_edge_geometry.mjs` (12 tests), `test_map_bounds.mjs` (6 tests),
  `test_layout_graph.mjs` (10 tests), `test_app_state.mjs` (23 tests). All pass.

- `bash check_codebase.sh` exits "PASS: 6 checks passed." All 530+ pytest tests pass.
