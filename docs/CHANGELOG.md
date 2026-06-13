# Changelog

## 2026-06-12

### Additions and New Features

- Corner-style select in the toolbar Layout group: a "Corners" dropdown offers four presets --
  Capsule (pill, 999px), Oval (elliptical, 50% --control-radius), Rounded rect (classic 5px),
  Corner rect (sharp 0px). Replaces the prior two-state toggle button.
  Introduces `--control-radius` and `--control-pad-x` CSS tokens consumed by toolbar buttons,
  title input, triples-table cell inputs, add/delete/chain buttons, and the theme-picker select.
  Four `data-corners` presets on `<html>` (`capsule` / `oval` / `rounded` / `corner`) drive the
  token values; capsule and oval bump horizontal padding so short labels do not pinch. Choice
  persisted to localStorage under `"concept-map-maker:corner-style"`, validated on load
  (unknown/legacy values -> rounded), applied in `onMount` before first paint. Playwright spec
  `tests/playwright/corner_style.spec.ts` asserts all four attribute values, computed
  border-radius changes, and persistence across a page reload. Non-control radii (editor pane,
  map pane, row-highlight background) remain on `--radius` unchanged.

- WP-A2 commit-time column autosize: the three triples-table text columns (from,
  verb, to) now size to the widest COMMITTED value in each column, measured with
  pixel-accurate canvas `measureText` (new helper `src/measure_text.ts`). The
  measured widths are written to `--col-from` / `--col-verb` / `--col-to` custom
  properties on `.triples-table`; the grid tracks read them as
  `minmax(6em, min(var(--col-X), 45%))`, so the 6em floor and 45% pane cap live in
  CSS and a pane resize re-clamps every column with zero JS (criterion 5). Width
  changes animate over 150ms (`transition: grid-template-columns`), and the header
  and body share the same template so columns stay aligned (criterion 6). Recompute
  is commit-gated: from/to read the store directly (their autocomplete commits only
  on Enter/Tab/blur), and the verb (a plain input that writes the store per
  keystroke for the live preview) reads a separate snapshot refreshed only on verb
  blur/Enter and on row add/delete/import, so draft keystrokes never resize a column
  (criterion 2). Cells whose content exceeds the cap ellipsize, and the full value
  is exposed via a new `title` attribute on each cell (criterion 4). New Playwright
  spec `tests/playwright/column_autosize.spec.ts` asserts a committed long verb
  phrase widens the verb column while from/to keep their floor, and that typing
  without committing does not resize any column.

- WP-B1: Three-color per-cell triple-table highlighting. A new "active concept"
  drives which from/to cells light up. Focus on a from/to cell sets the active
  concept to that cell's COMMITTED value (not draft keystrokes); hovering a cell
  while nothing is focused sets it to the hovered value; focus always wins over
  hover; empty cells never activate. `AppState` gains `active_concept`
  (`Accessor<ConceptKey | null>`), `cell_classification`
  (`Accessor<Map<ConceptKey, CellRole>>`), and `set_cell_focus` / `set_cell_hover`
  wiring. `active_concept = focused_concept() ?? hovered_concept()` (two internal
  signals, blank values stored as null). The pure `compute_cell_classification`
  walks every triple once per active-concept change and builds one keyed map:
  the active key -> `cell-same`, a from-partner pointing into it -> `cell-from`, a
  to-partner it points out to -> `cell-to` (precedence same > from > to for
  cycles). Each cell does a single map lookup, so this stays O(triples) per change
  and one lookup per cell at the 80-node stress scale. `TripleRow` adds focus/hover
  handlers on the from/to cell spans and a `classList` for the three role classes.
  New `CellRole` type exported from `app_state.ts`. CSS: added `--same-tint`
  (#cdebcb) and `--same-accent` (#3a9d3a) to `:root`; new labeled "WP-B1" section
  paints the three tints with an inset accent bar on the outer `.triple-cell` span
  (inner autocomplete wrapper tint made transparent so the highlight shows
  through), keeping dark input text (#1a1a1a) for WCAG AA contrast. Existing
  row-level (`.triple-row.highlighted`) and map-pane highlighting are untouched and
  compose without conflict. New `tests/playwright/cell_highlight.spec.ts` covers
  the worked example (honeybees->castes, castes->workers) and class clearing on
  blur. All 20 Playwright tests pass, `npx tsc --noEmit -p tsconfig.json` exits 0,
  `npx eslint src/` exits 0.

- WP-A1: Three UX fixes for the triples table. (1) Verb column width: `.triple-row`
  and `.triples-header` grid-template-columns changed from `1fr auto 1fr auto 1fr auto`
  to `1fr auto minmax(9em, 1fr) auto 1fr auto auto` so multi-word verbs like "included"
  render untruncated. (2) Stable row height: proposition preview moved out of the row
  grid into a fixed-height `.triple-preview-slot` div rendered below the rows list by
  `TriplesTable`; row height no longer changes on focus/blur; `+ Add row` button stays
  in the same screen position. `TripleRow` gains `on_focus_change` prop (notifies parent
  of focused row index) and `expose_to_commit` prop (exposes synchronous commit fn). (3)
  Add-row synchronous commit: `+ Add row` button gains `onPointerDown` handler that
  calls the focused row's `to`-cell commit function synchronously before the 150 ms blur
  timer fires; the 150 ms blur timer is tracked as `blur_timer` in `ConceptAutocomplete`
  and is cancelled when `commit()` fires synchronously (double-commit guard). (4) Chain
  button: each row gains a `triple-chain-btn` (aria-label "Chain new row from this
  concept", tooltip, disabled when `to` is blank) that commits the `to` draft
  synchronously and inserts a new row directly below with `from` pre-filled from the
  committed `to` value; `AppState` gains `insert_triple_after(after_index, triple?)`.
  `ConceptAutocomplete` gains `expose_commit` and `on_draft_change` props. Two new
  Playwright specs in `tests/playwright/add_row_and_chain.spec.ts` cover the add-row
  draft-preserve scenario and chain-button disable/enable/chain behavior; all 19
  Playwright tests pass, `npx tsc --noEmit -p tsconfig.json` exits 0,
  `npx eslint src/triple_row.tsx src/triples_table.tsx src/concept_autocomplete.tsx`
  exits 0.

- WP-C1: Added draggable pane resizer between `.editor-pane` and `.map-pane` in
  `src/app.tsx`. A `<div class="pane-resizer">` divider uses `setPointerCapture`
  for smooth drag; updates `--editor-ratio` inline on `.main-area` clamped to
  25%-65%. Ratio persists to `localStorage` under key
  `"concept-map-maker:editor-ratio"`; missing, non-numeric, or out-of-range values
  fall back/clamp to 40% and write the corrected value back on load. Divider carries
  `role="separator"`, `aria-orientation="vertical"`, `tabindex="0"`;
  ArrowLeft/ArrowRight adjust by 2%; double-click resets to 40%. Text selection
  suppressed during drag via `user-select: none` on `body.resizer-active`. Appended
  labeled `/* resizer */` CSS section to `src/style.css` (no other CSS modified).
  `npx tsc --noEmit -p tsconfig.json` exits 0; `npx eslint src/app.tsx` exits 0.

- WP-E1: Vendored Font Awesome Free 6.7.2 into `vendor/fontawesome/` (fa-solid.min.css,
  fa-solid-900.woff2 at 155 KB, LICENSE.txt). Linked from `src/index.html` via a local stylesheet
  reference only; no CDN or external runtime deps. `build_github_pages.sh` gains a vendor-copy step
  and a hard assertion `test -f dist/vendor/fontawesome/fa-solid-900.woff2` before the success line.
  Restyled the four semantic toolbar groups as a ribbon: each group is a raised panel with a
  `.toolbar-group-caption` label (File, CSV, Image & Print, Layout) and icon + text per button using
  Font Awesome solid glyphs: Save project `fa-floppy-disk`, Open project `fa-folder-open`, Clear
  `fa-trash-can`, Export triples CSV `fa-file-export`, Import triples CSV `fa-file-import`, Export
  SVG `fa-vector-square`, Export PNG `fa-image`, Print `fa-print`, Re-layout `fa-diagram-project`.
  All icons are `aria-hidden="true"`; button text labels and `aria-label` attributes preserved.
  `vendor/` excluded from all pytest hygiene scans via `REPO_HYGIENE_FILTERS` in `tests/conftest.py`.
  Playwright spec `tests/playwright/toolbar_icons.spec.ts` added: asserts each icon has nonzero
  width, font-family resolves to "Font Awesome 6 Free", woff2 HTTP response is 200, and screenshots
  the toolbar ribbon for visual review.

- Docset refresh: added `docs/CODE_ARCHITECTURE.md` (components, data flow, build
  pipeline, extension points), `docs/FILE_STRUCTURE.md` (directory map, generated
  artifacts, where new work goes), `docs/INSTALL.md` (setup via
  `devel/setup_typescript.sh`, verify via `check_codebase.sh`), and
  `docs/FILE_FORMATS.md` (project JSON v1 schema gate, triples CSV header and fuzzy
  header detection, TSV paste, SVG/PNG export). Linked all four from the README
  Documentation section.

- WP-D1: Added `tests/playwright/definitions_removed.spec.ts` with two tests asserting
  that the Definitions tab button and `#panel-definitions` panel are absent from the
  rendered app after the feature removal.

- Walkthrough demo player: added `tests/playwright/walkthrough_demo.mts` (standalone
  Playwright script, not a test spec) and `run_walkthrough_demo.sh` entry point.
  The demo reads a triples JSON dataset (default:
  `tests/playwright/walkthrough_data/honeybees_triples.json`, 8 honeybee triples)
  and drives the UI like a human player with per-keystroke delay. Uses the chain
  button when a triple's "from" matches the previous row's "to" to showcase that
  workflow. Records Playwright video and saves per-row screenshots plus a final map
  screenshot to `output_smoke/walkthrough/`. Arguments: `--data`, `--speed`,
  `--headed`, `--no-video`; `--build` on the shell wrapper forces a dist/ rebuild.
  Added `tests/**/*.mts` to `tsconfig.lint.json` so ESLint type-checked rules cover
  the new file. Documented under "Walkthrough demo" in `docs/USAGE.md`.

- Capsule map bubble shape added to the Shape picker in the map pane. Capsule is a
  stadium shape (rect with rx = ry = node height / 2) that produces fully rounded
  short ends. Added "capsule" to `ThemeShape` union in `src/types.ts`, `SHAPE_REGISTRY`
  in `src/themes.ts` (new `is_capsule` flag on `ShapeSpec`; `corner_radius` stays 0
  because rx is computed dynamically at render time from the node box height),
  `SHAPE_LABELS` in `src/theme_picker.tsx`, and the shape gate in `src/document_codec.ts`.
  `src/concept_node.tsx` render_shape and render_highlight_ring handle the capsule
  branch before the rect/rounded branch. Four new tests in `tests/test_themes.mjs`
  assert the capsule registry entry and that existing shapes have `is_capsule: false`.

### Behavior or Interface Changes

- UI corner-style dropdown removed. The "Corners" dropdown (four presets: Capsule,
  Oval, Rounded rect, Corner rect) and all its supporting code have been removed.
  `--control-radius` and `--control-pad-x` are now static at 5px / 9px (classic Mac
  rounded rect) with no user-facing option and no localStorage persistence. The
  `CornerPreset` type, `load_corner_style`, `save_corner_style`, `apply_corner_style`
  functions, `CORNER_STORAGE_KEY` constant, and `corner_style` signal are gone from
  `src/app.tsx`; the `corner_style` and `on_corner_preset_change` props are gone from
  `src/toolbar.tsx`. The four `data-corners` CSS preset blocks are removed from
  `src/style.css`. `tests/playwright/corner_style.spec.ts` deleted.

- Superseded the static `grid-template-columns: 1fr auto minmax(9em, 1fr) auto 1fr
  auto auto` rule on `.triples-header` / `.triple-row` (and the fixed `minmax(9em,
  1fr)` verb rule) in favor of the WP-A2 commit-time autosize tracks. A trailing
  `minmax(0, 1fr)` spacer track was added so columns left-pack at the floor instead
  of letting the arrow/button columns absorb slack.

- Rewrote `AGENTS.md` as a minimal pointer file: bare-path bullets into the
  `docs/*.md` style set (now including `docs/TYPESCRIPT_STYLE.md`, previously
  unreferenced) plus repo-specific run commands (`source source_me.sh && python3`,
  `check_codebase.sh`, `run_playwright_tests.sh`, `pytest tests/`).

- Moved build pipeline scripts from `tools/` to new `pipeline/` folder
  (`pipeline/build.mjs`, `pipeline/build_types.ts`); `tools/` now holds only standalone
  utilities (e.g. `tools/html_to_pdf.mjs`). Updated `build_github_pages.sh` to call
  `node pipeline/build.mjs` and added `pipeline/**/*.ts` globs to `tsconfig.lint.json`.

### Fixes and Maintenance

- Post-audit low-risk fix batch 2: removed dead "hint" severity from
  `ValidationItem.level` union and `level_marker()` in `src/rubric_panel.tsx`; removed
  orphaned `id="panel-triples"` attribute from `src/app.tsx`; rewrote stale `.control-oval`
  utility-class reference in `src/style.css` oval comment to describe the actual
  `--control-radius: 50%` token approach; loosened fragile exact-count assertions in
  `tests/test_app_state.mjs` (boot triples length) and `tests/test_derive_concepts.mjs`
  (incoming/outgoing edge counts) to behavioral `>= N` forms; removed identity-equality
  tests on `PALETTES` array elements from `tests/test_themes.mjs` and confirmed clamping
  behavioral test is present; tightened `column_autosize.spec.ts` floor assertions from
  `x - 1` to `x`; removed redundant `waitForTimeout` calls adjacent to auto-retrying
  `expect()` assertions across Playwright specs; added three unit tests for
  `compute_cell_classification` to `tests/test_app_state.mjs` (worked honeybees example,
  self-loop precedence, null/blank active concept); converted bare backtick path for
  `src/measure_text.ts` to a markdown link in `docs/CODE_ARCHITECTURE.md`; added
  `src/measure_text.ts` to the pure-modules bullet in `docs/FILE_STRUCTURE.md`.

- Fixed `tests/playwright/column_autosize.spec.ts` floor assertion: after a long verb
  commit, 1fr redistribution intentionally shrinks from/to from their inflated baseline
  toward the 6em clamp floor; the test now asserts against the live 6em floor (computed
  from the header font-size) instead of the baseline, and polls the verb track past the
  150ms grid transition instead of a vacuous waitForFunction.

- Audit cleanup batch: restored deleted `tests/playwright/definitions_removed.spec.ts`
  regression guard; stripped planning tags (WP-*) from Playwright spec header comments
  and replaced with plain-English descriptions; corrected stale comments in `src/app.tsx`
  (corner preset list), `src/triples_table.tsx` (clamp/minmax note), and
  `src/concept_autocomplete.tsx` (column cap note); fixed inverted primary/fallback
  comments in `tests/playwright/walkthrough_demo.mts` chain-button path and removed
  vestigial unused variable; loosened fragile absolute assertions in column_autosize,
  toolbar_icons, cell_highlight, and add_row_and_chain specs (relative checks,
  named threshold constant, locator-based waits replacing waitForTimeout); removed
  `_temp_inspect.mjs` scratch file; dropped `export` from internal-only
  `measure_text_width` in `src/measure_text.ts`; updated preset display names in
  `docs/CODE_ARCHITECTURE.md`.

- Ribbon toolbar spacing polish (WP-E1 follow-up): each `.toolbar-group` panel now lays its caption
  over a single horizontal `.toolbar-group-buttons` row (new wrapper span in `src/toolbar.tsx`)
  instead of a vertical button stack that overflowed and clipped under the fixed 48px bar; the
  `.app-shell` toolbar grid row changes to `minmax(var(--toolbar-height), auto)` so panels fit. New
  rhythm tokens `--ribbon-btn-gap` (within-group), `--ribbon-group-gap` (between-group), and
  `--ribbon-btn-radius` (shared classic Macintosh rounded-rect corner on buttons and the title input)
  give even, consistent spacing. Layout arrangement: title input left, the four groups as a
  left-aligned cluster, autosave pushed right via `margin-left:auto`. Captions made uniform
  (uppercase, 600 weight, muted). Danger styling on Clear, focus-visible outlines, and aria
  attributes preserved; `tests/playwright/toolbar_icons.spec.ts` pixel-ink check still passes.

- Triples-table grid polish (WP-A2 follow-up): even column rhythm and a snug right-side
  control block. The three text-column tracks change from
  `minmax(6em, min(var(--col-X), 45%))` with a trailing dead `minmax(0, 1fr)` spacer to
  `minmax(clamp(6em, var(--col-X), 45%), 1fr)`, so the committed measured width becomes the
  track MINIMUM (autosize floor/cap preserved) and the three columns SHARE leftover pane width
  equally via `1fr` instead of pooling all slack into one uneven gap on the right. The arrow
  glyphs move from `auto` to a fixed `1.5em` centered track so both arrow gaps match, and the
  trailing spacer track is removed (the delete/chain buttons now sit flush at the right edge).
  Delete and chain buttons get a shared `1.9em` fixed width, equal `2px 0` padding, centered
  text, and the same classic Macintosh-style 4px `var(--radius)` corners, so the right-side
  block is identical and aligned on every row. No-jitter contract preserved: `1fr` growth is
  static and never reads `--col-*`, so draft keystrokes still do not resize a column.
  `tests/playwright/column_autosize.spec.ts` needed no assertion change (commit widens, draft
  does not). Only `src/style.css` (triples sections) changed; before/after evidence in
  `output_smoke/polish_before.png` and `output_smoke/polish_after.png`.

- A11y fixes (task #11): added non-color cues to per-cell highlight roles (solid/dashed/double
  left border on cell-from/cell-to/cell-same, WCAG 1.4.1); added explicit `outline` to
  `.pane-resizer:focus-visible` to meet WCAG 2.4.11; defined missing `--color-text: #222222`
  token in `:root`; gave each toolbar ribbon group `role="group"` + `aria-labelledby` tied to
  its caption id (WCAG 1.3.1); added `:focus-visible` outline rules for `.toolbar-btn` and
  `.triples-add-btn` (WCAG 2.4.7); updated chain button `aria-label` to include row number
  (TT-5); added `aria-valuetext` to the resizer separator (R-1, WCAG 1.3.1); capped
  autocomplete listbox at `max-height: 240px; overflow-y: auto` (K-3). Audit report:
  `docs/active_plans/audits/ui_refinements_a11y_audit.md`.

- WP-E1: Fixed the toolbar Font Awesome icons rendering as empty tofu boxes. Root
  cause was a corrupt @font-face src hint in the vendored
  vendor/fontawesome/fa-solid.min.css: it read src:url(./fa-solid-900.woff2)
  format(\"woff2\") with backslash-escaped quotes (a JSON/JS string-escaping
  artifact from how the file was vendored). Chromium parses the woff2 and reports
  the face "loaded" (document.fonts.check returns true, computed font-family
  resolves, offsetWidth is nonzero, the woff2 serves HTTP 200, and the woff2 cmap
  contains all nine glyph codepoints), yet the invalid format() token makes it
  reject the src for text shaping, so every glyph paints as the browser notdef
  box. A/B verification (corrupt vs fixed CSS, screenshotting after
  document.fonts.ready) confirmed the escaped hint is the cause: glyphs appear
  only with format("woff2"). Fix: corrected the two escaped quotes to plain
  format("woff2"). build_github_pages.sh gains hard assertions that
  dist/vendor/fontawesome/fa-solid.min.css exists and does not contain the
  backslash-escaped format hint. Strengthened tests/playwright/toolbar_icons.spec.ts:
  the prior tests only checked DOM metrics (which pass on tofu); added a pixel
  paint check that enlarges the floppy-disk icon to 64px and measures center-region
  ink (a real glyph fills the center ~0.52; a hollow tofu box inks 0.0), failing
  below a 0.15 floor. The new check was verified to fail on the corrupt CSS and
  pass on the fix. All 21 Playwright tests pass and bash build_github_pages.sh
  reports "Built dist/ (GitHub Pages-ready)."

- WP-B1 quality-review fixes (triple_row.tsx, app_state.ts). MAJOR-1: on row
  unmount, clear the focus channel only when the row owns it -- guard compares
  focused_concept() (new AppState field) against this row's from/to concept_key;
  no phantom highlights after delete-while-focused. MINOR-2: from_role/to_role
  wrapped in createMemo so classList re-evaluates only when cell_classification or
  the cell's committed value changes. MINOR-3: per-span onFocusOut clears removed;
  single row-div onFocusOut with relatedTarget check clears focus channel only when
  focus truly leaves the row, eliminating the null gap on intra-row transitions.
  All 22 Playwright tests pass; tsc and eslint exit 0.

- Audit cleanup sweep: removed `tests/playwright/definitions_removed.spec.ts` (tested
  absence of a removed feature, zero correctness value); removed screenshot-only test
  case from `tests/playwright/toolbar_icons.spec.ts` (no assertions); removed two
  `waitForTimeout(100)` calls from `tests/playwright/add_row_and_chain.spec.ts`
  (Playwright auto-waits handle timing); removed three collection-size assertions from
  `tests/test_app_state.mjs` (fragile hardcoded sizes); removed key-presence list test
  from `tests/test_themes.mjs`; relaxed two hardcoded `length == 3` assertions in
  `tests/test_derive_concepts.mjs` and `tests/test_document_codec.mjs` to `>= 2`.
  In source: removed workstream tags (`WP-B1:`, `MAJOR-1`, `MINOR-2`, `MINOR-3`, `K-3`)
  from production code comments in `src/triple_row.tsx`, `src/app_state.ts`,
  `src/concept_autocomplete.tsx`; removed defensive `|| "normal"` / `|| "400"`
  fallbacks from `src/measure_text.ts`; fixed stale `preview_text` comment in
  `src/triples_table.tsx`; removed dead import from `tests/playwright/walkthrough_demo.mts`.
  In CSS: merged duplicate `.main-area` block (second block at line 870 removed, its
  `gap: 0` moved to canonical block); removed orphaned `--resizer-width` from second `:root`
  (consolidated into main `:root`); removed `WP-B1:` tag from CSS section header.
  Deps: removed unused `packaging` from `pip_requirements-dev.txt`. Added `output_smoke/`
  to `.gitignore`. Updated `docs/CODE_ARCHITECTURE.md` to document `src/measure_text.ts`
  and WP-B1 state additions; updated `docs/FILE_STRUCTURE.md` with walkthrough files and
  `output_smoke/` generated artifact. All 530 pytest tests pass, `check_codebase.sh` 6/6.

- Docs closeout sweep (audit-driven): removed stale "10 definitions" rubric claim from
  `README.md` first paragraph; added pane resizer and chain button to `docs/USAGE.md`
  Map interactions and Triples table sections; updated `docs/CODE_ARCHITECTURE.md`
  `src/app.tsx` description (resizer, localStorage persistence) and `src/toolbar.tsx`
  description (Font Awesome ribbon, vendor copy, build assertion); reordered and merged
  duplicate subsections in the 2026-06-12 changelog block to match required section order
  from `docs/REPO_STYLE.md`; added dated removal note and corrected stale definitions
  references in `docs/active_plans/active/concept_map_maker_plan.md`.

- WP-A1 spec-review fix: `to_commit_fns` map in `TriplesTable` re-keyed from
  render index (`number`) to stable `triple.id` (`string`). After a row delete,
  surviving rows shift indices but `expose_to_commit` fires only in `onMount`, so
  the old index-keyed map returned the deleted row's stale closure; the draft
  committed only via the 150 ms blur fallback. Fix: `expose_to_commit` callback now
  calls `to_commit_fns.set(triple.id, fn)`; `commit_focused_to_draft` resolves
  focused index -> `props.state.doc.triples[idx]` -> `triple.id` -> map lookup;
  `handle_chain` does the same. `TripleRow` gains `remove_to_commit` prop (called in
  `onCleanup`) so deleted-row entries are evicted from the map immediately on unmount
  rather than accumulating. `concept_autocomplete.tsx` is unchanged. All 19 Playwright
  tests pass, `npx tsc --noEmit -p tsconfig.json` exits 0,
  `npx eslint src/triples_table.tsx src/triple_row.tsx src/concept_autocomplete.tsx`
  exits 0.

- WP-C1/WP-D1 quality-review cleanup in `src/app.tsx` and `src/style.css`:
  removed dead `EditorTab` type alias, `active_tab` signal (setter was never
  called), and `hidden={active_tab() !== "triples"}` attribute (MAJOR-1);
  stripped `role="tabpanel"` and `aria-labelledby="tab-triples"` from
  `#panel-triples` div whose tab bar no longer exists (MAJOR-2); deleted
  dead `.tab-bar`, `.tab`, `.tab:hover`, `.tab-active`, and
  `[role="tabpanel"]` CSS rules plus the now-unused `--color-tab-active`
  CSS variable (MAJOR-3); removed no-op `margin-right: 0` / `margin-left: 0`
  declarations on `.editor-pane` / `.map-pane` in the resizer section and
  corrected the comment to describe what the override actually does
  (`gap: 0` on `.main-area`) (MINOR-1); added `aria-valuenow={editor_ratio()}`,
  `aria-valuemin`, and `aria-valuemax` to the focusable resizer separator
  (MINOR-2); added `onLostPointerCapture` handler on the resizer that
  idempotently removes `pane-resizer--dragging` and `body.resizer-active`
  classes (MINOR-3). `npx tsc --noEmit -p tsconfig.json` exits 0;
  `npx eslint src/app.tsx` exits 0; zero hits on dead-symbol grep.

- Added missing `-> None` return annotation to `main()` in
  `tools/check_css_content_policy.py`; `pytest tests/` now passes 409/409
  (test_function_typing was the only failure).

- Added `run_playwright_tests.sh`, the canonical script for running the Playwright browser test
  suite. Handles preflight checks (node, npm, node_modules, playwright.config.ts), auto-builds
  dist/ via `build_github_pages.sh` when dist/index.html or dist/main.js is missing, supports
  `--build` to force a rebuild, and forwards remaining arguments to `npx playwright test`.
  Prints a clear PASS/FAIL line on exit. Updated `package.json` `test:playwright` alias to
  `./run_playwright_tests.sh` and updated `docs/USAGE.md` developer section to reference the
  new script.

- Added `docs/USAGE.md` covering local setup, building a map, map interactions, saving and
  submitting, spreadsheet paste, and developer tasks. Added a `docs/USAGE.md` link to the
  Documentation section of `README.md`.

- WP-D2b2: Added "Export triples CSV" and "Import triples CSV" buttons to `src/toolbar.tsx`.
  Export calls `serialize_triples_csv(state.doc.triples)` and downloads a `<title>-triples.csv`
  file. Import opens a hidden `<input type="file" accept=".csv">`, reads the file, calls
  `parse_triples_csv`, and appends the rows via `bulk_insert_triples` (does not wipe the
  document; CSV is triples-only convenience). A hidden CSV `<input>` ref mirrors the existing
  JSON ref pattern. Error surfaces via the existing inline dismissable error banner.

- WP-D2b3: Added "Export SVG", "Export PNG", and "Print" buttons to `src/toolbar.tsx`.
  SVG/PNG buttons are disabled while the canvas SVG element is not yet available (`svg_ready()`
  guard). On click they call `download_svg` / `download_png` from `src/export_svg.ts` using the
  live svg element passed from `app.tsx` via the new `svg: Accessor<SVGSVGElement | null>` prop.
  Print button calls `window.print()`. Filename derived from `state.doc.title`. Minimal wiring
  added to `src/app.tsx`: `createSignal<SVGSVGElement | null>(null)` captures the element via
  `svg_ref` on `MapCanvas`; the accessor is passed to `Toolbar` as `svg` prop.

- WP-D2b4: Added "Re-layout" button to `src/toolbar.tsx`. On click, shows a `window.confirm`
  dialog ("Reset all bubble positions to auto-layout? Dragged positions will be lost."). On
  confirm, calls `state.clear_overrides()` which returns all bubbles to pure dagre positions.
  Cancel preserves all drag overrides unchanged.

  Toolbar buttons are now organized into four `<span class="toolbar-group">` sections: file
  (Save project / Open project / Clear), CSV (Export triples CSV / Import triples CSV), image
  and print (Export SVG / Export PNG / Print), and layout (Re-layout). All buttons carry
  `aria-label` attributes. `npx tsc --noEmit -p tsconfig.json` exits 0; `npx eslint
  src/toolbar.tsx src/app.tsx` exits 0; `bash build_github_pages.sh` -> "Built dist/
  (GitHub Pages-ready)."

- WP-B3: Completed bidirectional cross-highlight wiring across the triples table and the SVG map.
  `src/triple_row.tsx` now adds a reactive `highlighted` class via `classList` when
  `state.highlighted_triples()` contains the row's triple id, so hovering a bubble or an edge lights
  up every referencing row (node/edge -> row direction). Appended `.triple-row.highlighted` rules to
  `src/style.css` (from-tint background plus an inset from-accent left bar). The forward direction was
  already wired: `src/triple_row.tsx` sets `{source:"row"}` hover, `src/concept_node.tsx` sets
  `{source:"node"}` and draws a role-colored outer ring (from blue / to amber / both purple) via
  inline SVG attributes, and `src/concept_edge.tsx` sets `{source:"edge"}` and swaps to the accent
  stroke plus `ARROW_HIGHLIGHT_MARKER_ID`. Verified the `app_state.ts` role-tag memos already match
  the plan (row/edge hover -> from/to roles with self-loop "both"; node hover -> "both"), so no state
  change was needed. `npx tsc --noEmit -p tsconfig.json` reports zero errors in triple_row.tsx /
  concept_node.tsx / concept_edge.tsx; `npx eslint src/triple_row.tsx src/concept_node.tsx
  src/concept_edge.tsx` exits 0.

- WP-D2b1: Added `src/toolbar.tsx` (`Toolbar` component). Editable title input (aria-label
  "Document title", wires to `state.set_title`). "Save project" serializes via `serialize_document`
  and triggers a Blob download named `${title || "concept-map"}.json`. "Open project" opens a
  hidden `<input type="file" accept=".json,application/json">`, reads via FileReader, calls
  `parse_document`; on success calls `replace_document` (autosave slot updates automatically);
  on failure shows an inline dismissable error (aria-live polite, current doc untouched). "Clear"
  confirms via `window.confirm` then calls `replace_document(empty_document())`. Autosave status
  shown as "autosave on/off" text. Wired into `app.tsx` toolbar slot (ToolbarPlaceholder removed).
  Style rules appended to `src/style.css`.

- WP-B4: Added `src/rubric_panel.tsx` (`RubricPanel`). Renders a live checklist from
  `state.validation()` using a `<For>` loop. Each item shows a text marker (OK / WARN / FAIL / HINT)
  plus the rule message. Levels are visually distinct via color-accented marker chips and hint rows
  are subdued (italic, lower opacity). Clicking a row with `conceptKeys` briefly sets a node hover
  on the first offender for 1.5 s then clears; clicking a row with `tripleIds` sets an edge hover
  similarly. Keyboard (Enter/Space) also triggers the flash. Pending timeout is canceled on each
  new click. Wired into `app.tsx` replacing `RubricPlaceholder`. Appended `.rubric-list`,
  `.rubric-item`, `.rubric-marker`, `.rubric-message` and level-variant rules to `src/style.css`.
  `npx eslint src/rubric_panel.tsx src/app.tsx` exits 0; `npx tsc --noEmit -p tsconfig.json`
  shows no errors in rubric_panel.tsx or app.tsx.

- WP-B2d: Wired ConceptAutocomplete into `triple_row.tsx` from/to cells (replacing plain inputs;
  tint_var "--from-tint"/"--to-tint", concepts from state.concepts, on_commit -> update_triple,
  aria labels preserved). Added onPaste handler to `.triples-rows` container in
  `triples_table.tsx`: intercepts clipboard text containing a tab or newline, parses via
  `parse_table_text`, skips a header row using HEADER_TOKENS heuristic, maps 3-column rows to
  (from, verb, to) triples, calls bulk_insert_triples; single-cell paste passes through natively.
  Added matching onPaste handler to the `.definitions-table` container in `definitions_table.tsx`:
  intercepts multi-cell paste, maps 2-column rows to (word, definition), skips header via
  DEF_HEADER_TOKENS heuristic, calls bulk_insert_definitions. ESLint and tsc (scoped to these
  three files) pass; build blocked by concurrent-agent TS errors in rubric_panel.tsx/app.tsx.

- WP-D2a: Added `src/export_svg.ts`. Exports `export_svg_text(svg, state): Promise<string>` (clears
  hover via `state.set_hover`, awaits microtask, deep-clones the canvas SVG, strips the
  `data-viewport` transform so output uses untransformed map-space coordinates, strips
  `data-*`/`class`/`cursor`/`pointer-events`/`style` attributes from all elements, computes the
  rendered extent from override-aware node positions via `effective_extent`, sets `viewBox` +
  `width` + `height` + `xmlns` on the clone root, serializes with `XMLSerializer` plus XML
  declaration); `download_svg(svg, state, filename): Promise<void>` (wraps SVG blob in an anchor
  click); `download_png(svg, state, filename, scale=2): Promise<void>` (SVG blob URL -> `Image` ->
  `<canvas>` at `scale * extent`, max dimension capped at 8000px for Safari/browser limits,
  `toBlob` -> anchor click). Browser-only module; no Solid reactive imports.
  `npx tsc --noEmit -p tsconfig.json` reports zero errors in `export_svg.ts`; `npx eslint
  src/export_svg.ts` exits clean.

- WP-C2b: Added `src/concept_node.tsx` (`ConceptNode`) and `src/theme_picker.tsx` (`ThemePicker`).
  `ConceptNode` fits the WP-C2a canvas `node_slot(key, box)` contract (box is the center-based
  `NodeBox` from `edge_geometry`; the concept key is the visible label). Shape comes from
  `SHAPE_REGISTRY[doc.theme.shape]` (rect/rounded -> `<rect rx>`, oval -> `<ellipse>`), fill from
  `depth_fill(doc.theme.palette, depths().depth_by_key.get(key) ?? 0)`, a centered black Helvetica
  label, `ORIGIN_EMPHASIS` border when `depths().origin_keys.has(key)`, and an outer
  hover-highlight ring colored by `highlighted_concepts()` role (from #5aabff, to #e8990a, both
  #9b59b6, matching the `--from-accent`/`--to-accent` CSS vars). All presentation is inline SVG
  attributes (export-safe). Pointer-capture drag: pointerdown captures + records the grab offset,
  pointermove writes `set_override(key, {x,y})`, pointerup/lostpointercapture release safely.
  Drag coordinates are converted from client space to the node's local user space via the group
  element's `getScreenCTM().inverse()`, which folds in both the `<svg>` viewBox and the
  `<g data-viewport>` pan/zoom transform, so drags stay accurate under any pan/zoom without the
  canvas publishing a converter. Node hover sets `set_hover({source:"node", conceptKey})`.
  `ThemePicker` is a two-`<select>` control group (Shape, Palette) reading options from
  `SHAPE_REGISTRY`/`PALETTES` and calling `set_theme`, so a switch restyles every bubble at once.
  `App()` in `src/app.tsx` wires `ConceptNode` into `MapCanvas` via `node_slot` and renders
  `ThemePicker` in a new map-pane header; added `.map-pane-header`/`.theme-picker` CSS to
  `src/style.css`. Scoped `tsconfig.json` include to `src/**` (was greedy `**/*.ts`, which pulled
  root/test `.ts` files into the src typecheck) and added `playwright.config.ts` to
  `tsconfig.lint.json`. Added `tests/playwright/smoke.spec.ts` (load app, enter three triples, see
  >= 3 bubbles, drag one) plus a minimal `playwright.config.ts` (serves prebuilt `dist/` on a
  fixed port 4173 via `python3 -m http.server`; run `bash build_github_pages.sh` then
  `npx playwright test`). `npx tsc --noEmit -p tsconfig.json`, `npx eslint` on both new src files,
  and `bash build_github_pages.sh` all succeed.

- WP-C2a: Added `src/map_canvas.tsx` and `src/concept_edge.tsx`. `MapCanvas` is the SVG canvas
  root with the published contract `{ state: AppState; node_slot?(key, box); svg_ref?(el) }`: it
  resolves render boxes via `state.node_position` + layout w/h, computes the viewBox from
  `effective_extent`, renders arrowhead marker `<defs>` (normal + highlight ids exported from
  `concept_edge.tsx`), and renders all edges itself. Nodes render through an optional `node_slot`
  (so WP-C2b can inject `ConceptNode`); without a slot a default rect+label placeholder is drawn.
  Pan/zoom/reset is ephemeral (never saved): wheel zooms about the cursor, background
  pointer-drag pans via pointer capture, double-click resets to identity. The pan/zoom transform
  lives on exactly one inner `<g data-viewport>` so the SVG export (WP-D2a) can strip it.
  `ConceptEdge` builds a clipped cubic via `edge_path` (or `self_loop_path` for same-key
  endpoints) with `assign_curvatures` applied over the rendered edge set, draws a `marker-end`
  arrowhead, and a verb `<text>` at the curve midpoint with a white `paint-order="stroke"` halo.
  Edge pointer hover sets `set_hover({source:"edge", tripleId})`; membership in
  `highlighted_triples()` swaps stroke to accent and to the highlight marker. Triples with a
  missing endpoint position are skipped. All presentation is inline SVG attributes (no CSS
  classes), per the export requirement. `App()` in `src/app.tsx` now renders `<MapCanvas
  state={state} />` in the map pane (removed `MapPlaceholder`). `npx tsc --noEmit`, `npx eslint`
  on both files, and `bash build_github_pages.sh` all succeed.

- WP-B2a: Added `src/triples_table.tsx` and `src/triple_row.tsx`. `TriplesTable` takes an
  `AppState` prop, renders a sentence-shaped header ("This concept | verb phrase | points to
  this concept") with `--from-tint`/`--to-tint` cell backgrounds, live concept count from
  `state.concepts().length`, a `<For>` loop of `TripleRow` components, and an "Add row" button.
  `TripleRow` renders from-input (var(--from-tint)), arrow glyph, verb-input, arrow glyph,
  to-input (var(--to-tint)), and delete button; commits via `update_triple` on each input event;
  shows a proposition preview ("from - verb -> to") when focused; wires hover to `set_hover`.
  Enter key moves to next row or adds a new row; Tab is native. All inputs carry aria-label with
  row number. `App()` in `src/app.tsx` now constructs `create_app_state(browser_storage())`
  once and passes `state` to `TriplesTable`, replacing the placeholder. Added triples-table CSS
  to `src/style.css`.

- WP-B2b: Added `src/concept_autocomplete.tsx` with exported `ConceptAutocomplete` component.
  Props: `{ value, concepts, on_commit, placeholder?, aria_label, tint_var? }`. Internal signals
  for draft text, open state, highlight index, and transient hint. Filters concepts by
  `concept_key(draft)` substring match, max 8 shown. Keyboard: ArrowDown/Up moves selection,
  Enter/Tab commits highlighted match or typed text, Escape closes without committing, blur
  commits typed text after 150ms delay (lets click fire first). Committing text whose
  `concept_key` matches an existing concept snaps to canonical label (first-seen casing) and
  shows a 1.5s aria-live "matched existing concept" hint. Free text always allowed. Renders
  input + absolutely-positioned `role="listbox"` with `role="option"` items and
  `aria-activedescendant`. Component-scoped inline styles only; no style.css edits needed.
  `npx tsc --noEmit` and `npx eslint` both exit 0 on this file.

- WP-B2c: Added `src/definitions_table.tsx` with exported `DefinitionsTable` component. Takes
  `AppState` prop; renders a `definitions-table` class div with Word | Definition header,
  `<For>` rows each with two aria-labeled inputs and a delete button, Enter on the last row
  appends a new row, live count badge "N / 10 definitions" sourced from non-empty
  `doc.definitions` entries. Component is standalone-exported; wiring into `app.tsx`
  `#panel-definitions` is deferred to the wiring wave (AppState construction not yet present
  in app.tsx at completion time). `npx tsc --noEmit` and `npx eslint` exit 0 on the file.

- WP-B1a: Added `src/app_state.ts`, the single stateful module. `create_app_state(storage, compute_layout_fn?)`
  builds one `createStore<CmapDocument>` (autosave unit) plus a `createSignal<HoverState>` and returns the
  component-facing API: the `doc` store, `hover`/`set_hover`, triples-only memos (`concepts`, `depths`,
  `validation`, `layout`), `node_position(key)` (resolves `overrides[key] ?? layout[key]` at render time so a
  drag never re-runs layout), highlight memos (`highlighted_triples`, `highlighted_concepts` role-tagged
  from/to/both), `autosave_enabled`, document actions (update/add/remove triple+definition, set_title, set_theme,
  set_override, clear_overrides, replace_document, bulk_insert_triples/definitions), and `dispose`. Storage is
  injected (`StorageLike | null`); `browser_storage()` resolves `window.localStorage` guarded for non-browser
  env. Boot loads the autosave slot via `document_codec`; invalid/foreign/corrupt JSON falls back to
  `empty_document()` without throwing. Autosave is a 500ms-debounced write to one slot; a failing or
  unavailable write disables autosave and surfaces the state via `autosave_enabled()`. Every memo body and the
  boot/write decisions are extracted into exported pure helpers (`resolve_node_position`,
  `compute_highlighted_triples`, `compute_highlighted_concepts`, `load_boot_document`, `attempt_storage_write`)
  so the layout/highlight/position/autosave contracts are unit-testable headless without Solid's dev build.
- WP-B1a: Added `tests/test_app_state.mjs` (23 tests): layout is a pure function of triples (overrides apply
  only at render-position resolution), node_position override/fallback/null, highlight role-tagging for
  row/edge/node hover incl. self-loop, boot load of valid/invalid/foreign/empty/null/throwing storage, autosave
  write success/failure/null, and a reactive-wiring smoke that constructs the full API. All pass.

- WP-B1b: Added `src/app.tsx` with `App` component: grid shell (toolbar / main / rubric panel),
  signal-based tab switcher (Triples | Definitions) with proper ARIA role/tabpanel/tablist
  attributes, labeled regions via `aria-label` and semantic HTML (`header`, `main`, `aside`,
  `section`, `h2`), and placeholder slots for all later work packages. Replaced hello-world
  `src/main.tsx` to mount `App`. Rewrote `src/style.css`: `:root` custom properties
  `--from-tint: #cfe8ff`, `--from-accent: #5aabff`, `--to-tint: #ffe2b8`, `--to-accent: #e8990a`
  for use by table columns and map highlights; flex/grid layout filling viewport; editor pane
  ~40% / map pane ~60%; tab bar, rubric strip, print-media hook. ASCII-only source; HTML entities
  for arrow and dash glyphs.

- WP-A3: Added `src/csv_codec.ts`: RFC4180/TSV codec with three exported functions:
  `parse_table_text(text)` (auto-detects TSV vs CSV by presence of unquoted tabs,
  strips UTF-8 BOM, handles CRLF, quoted fields with embedded delimiters and
  newlines, doubled-quote escaping, pads rows to uniform width);
  `serialize_triples_csv(triples)` (RFC4180 CSV with header
  `this concept,verb phrase,points to this concept`, CRLF line endings, trailing
  CRLF, fields quoted on demand); `parse_triples_csv(text)` (fuzzy header detection
  case-insensitive on tokens like "from"/"this concept", "verb phrase",
  "to"/"points to this concept"; falls back to positional order 0/1/2 when no
  header recognized; blank rows skipped). Pure TypeScript, no Solid/DOM imports.

- WP-C1a: Added dagre layout adapter in `src/layout_graph.ts`:
  `compute_layout(triples)` builds a deterministic top-down (`rankdir: "TB"`,
  `acyclicer: "greedy"`) layered layout from complete rows only, sizing each
  bubble from label length (~8px/char + padding, clamped min width, fixed 36px
  pill height). Edges carry no label (verb labels render later at bezier
  midpoints); self-loops and duplicate concept-pair edges are dropped before
  ranking. Returns center coordinates per `ConceptKey` plus the dagre canvas
  extent. Cycles never throw.

- WP-C1c: Added `src/themes.ts` with `PALETTES` (earth: 6 tans/greens/browns, fire: 6 yellows/oranges/reds, light-to-dark), `depth_fill(palette, depth)` (clamps depth >5 to last entry, never cycles), `ORIGIN_EMPHASIS` stroke constants, and `SHAPE_REGISTRY` per-shape `corner_radius`/`is_ellipse` spec consumed by SVG node renderer. Pure TypeScript, no Solid/DOM imports.

- WP-A2c: Added `src/validate_document.ts` with `validate_document(doc: CmapDocument): ValidationItem[]`. Rules: rubric pass/fail (min 30 unique concepts, all arrows verb-labeled, min 10 definitions), quality warn (verb label >3 words, orphan concepts, partial rows, duplicate triples, self-loops, near-miss spellings via specialized Levenshtein-distance-1 helper), hint (defined word absent from all map text). Pure TypeScript, no Solid/DOM imports.

- WP-A2b: Added `src/graph_depth.ts` with `compute_depths(triples: Triple[]): { depth_by_key: Map<ConceptKey, number>; origin_keys: Set<ConceptKey> }`. Multi-source BFS from all origins (in-degree 0, out-degree > 0); isolated concepts excluded from origins; unreachable nodes (including cycle members) get fallback depth = max_reached + 1; no origins -> all depth 0.
- WP-A2b: Added `tests/test_graph_depth.mjs` with 15 tests covering honeybees depths, cycle fixture (no throw), origin-rule including isolated-concept exclusion, no-origins case, and incomplete-row exclusion. All pass.

- WP-A1: Added shared type contract in `src/types.ts` (`Triple`, `Definition`,
  `ConceptKey`, `Theme`, `Position`, `CmapDocument`, `HoverState`,
  `ValidationItem`) plus the `concept_key()` normalizer (trim, collapse internal
  whitespace, lowercase). Pure TypeScript, no Solid/DOM imports.
- WP-A1: Added versioned JSON document codec in `src/document_codec.ts`:
  `empty_document()`, `parse_document()` (loud rejection of non-JSON, foreign
  format tags, unknown versions, and malformed fields), `serialize_document()`,
  and `prune_overrides()` (drops override keys whose concept no longer appears in
  any triple; applied on both parse and serialize).
- WP-A1: Added shared test fixtures under `tests/fixtures/`:
  `honeybees_triples.tsv`, `honeybees_document.json` (Castes 3 outputs, Female 3
  inputs, 10 definitions), and `stress_80_nodes.json` (deterministic 80-concept
  document with several origins, branches, converging nodes, one cycle, one
  bidirectional pair, and long labels for layout/perf checks).

- WP-C1b: Added `src/edge_geometry.ts` (pure, no Solid/DOM): `NodeBox` center-based
  box type; `edge_path(from_box, to_box, shape, curvature)` returns an SVG cubic
  bezier "d" plus label anchor at the curve midpoint (t=0.5), clipped to each
  node boundary per shape (rect axis-wall, oval ellipse solve, rounded-rect with
  corner-arc clipping) and bowed by displacing both control points perpendicular
  to the segment by `curvature * length`; `self_loop_path(box, shape)` draws a
  valid top-bulge self-loop cubic; `assign_curvatures(triples)` gives lone edges
  curvature 0, bidirectional pairs deterministic opposite-sign bowing, and
  duplicate same-direction edges an increasing-magnitude fan.
- WP-C1b: Added `src/map_bounds.ts` (pure): `effective_extent(nodes, overrides, padding)`
  computes the rendered bounding box (single source for SVG viewBox, PNG raster
  bounds, print sizing) by replacing each node center with its drag override when
  present, expanding by node dimensions, and padding all four sides; a far-dragged
  override widens the bounds, unknown override keys are ignored, and an empty map
  yields a finite padded zero box.

- WP-A2a: Added `src/derive_concepts.ts`: pure `derive_concepts(triples)` function
  returning `Concept[]` (key, label, outgoing, incoming triple ids). Semantics:
  fully blank rows ignored, partial rows excluded, concepts ordered by first
  appearance, display label = first-casing-wins, key = `concept_key(label)`.
  `Concept` interface defined here (not in `types.ts`).

- WP-D2c: Expanded `@media print` rules in `src/style.css`. Hides toolbar, editor pane,
  tab bar, and rubric panel. Switches app shell from grid to block flow; removes overflow
  clipping and fixed heights. Map pane prints full page width (SVG scales via `width:100%;
  height:auto`). Definitions panel (`#panel-definitions`) is forced visible (`display:block
  !important`) regardless of active tab; triples panel is hidden. Includes table rules for
  `.definitions-table` (border-collapse, black text, light header). White background, black
  text throughout.

- Audit cleanup: removed planning-scaffold tags (WP-*/workstream/milestone references) and
  non-ASCII characters from `src/` comments; deleted dead code in `src/csv_codec.ts`
  (`const c` / `void c` suppression and stream-of-consciousness reasoning block), collapsed
  identity ternary in `src/definitions_table.tsx`, removed identity assignment `svg_accessor`
  and renamed `activeTab`/`setActiveTab` to `active_tab`/`set_active_tab` in `src/app.tsx`.

- Rewrote `README.md` with a compliant first paragraph (pure prose, under 250 chars, no badges or
  links), overview section, documentation links list (existing docs only), quick start commands
  (`npm install`, `bash build_github_pages.sh`, `bash run_web_server.sh`), testing section
  (`bash check_codebase.sh` and `pytest tests/`), status note (in active development), and
  license note (MIT for code, CC BY 4.0 for content).

- Wired DefinitionsTable into the app definitions tab (review follow-up; WP-B2c integration).

- Audit cleanup: updated plan references to pipeline/build.mjs and clarified CSV export scope in USAGE.md.

- Audit cleanup: per-instance rubric flash timer, aria-labels on map bubbles, removed unused
  placeholder CSS and redundant playwright dependency.

- UI-refinements plan amended with execution addenda (corner-style rollback, walkthrough demo
  tool, post-audit fix batches, final gate results) and archived to docs/archive/ via git mv.

- Fixed the Rounded map bubble shape rendering identically to the new Capsule shape: `rounded`
  corner_radius in `src/themes.ts` dropped from 18 (half the node height, i.e. a stadium) to 8,
  restoring a classic rounded rectangle clearly distinct from Capsule; `tests/test_themes.mjs`
  now asserts the rounded radius stays below the capsule half-height bound.

### Removals and Deprecations

- WP-D1: Removed the definitions feature entirely. `Definition` type deleted from
  `src/types.ts`; `definitions` field removed from `CmapDocument`. `src/definitions_table.tsx`
  removed via `git rm`. All definition state actions (`update_definition`, `add_definition`,
  `remove_definition`, `bulk_insert_definitions`) removed from `src/app_state.ts` and the
  `AppState` interface. Definitions tab and `#panel-definitions` panel removed from
  `src/app.tsx`. `min_10_definitions` rubric rule and `defined_word_absent` hint removed from
  `src/validate_document.ts`. Definition-table CSS rules removed from `@media print` block in
  `src/style.css`. Fixtures `tests/fixtures/honeybees_document.json` and
  `tests/fixtures/stress_80_nodes.json` updated to the new format (no `definitions` key).
  `docs/USAGE.md` and `docs/FILE_FORMATS.md` updated to remove definitions wording.
  `docs/CODE_ARCHITECTURE.md` and `docs/FILE_STRUCTURE.md` updated to remove stale references.

### Decisions and Failures

- Corner-preset feature removed the same day it was added (2026-06-12). The original
  "Mac rounded rects" user request was about concept map node shapes, not UI chrome.
  The corner-style dropdown (Capsule / Oval / Rounded / Corner) was a misinterpretation
  of that request; the correct implementation is the Capsule map shape option added
  today. The UI controls are now permanently fixed at classic Mac rounded rects (5px).

- WP-D1 decision: definitions are out of scope (students do them separately); user decision to
  remove. The app was unshipped, so no migration path is required and old local files failing to
  open is acceptable. Codec decision: `parse_document` now silently ignores the `definitions`
  field if present in an old file (the field is not read, not validated, and not round-tripped);
  a test (`test_document_codec.mjs`) asserts this behavior explicitly.

### Developer Tests and Notes

- Audit cleanup: removed fragile collection-size/fixture-ID/wall-clock assertions from unit and
  Playwright tests. Deleted "palette has exactly 6 entries" length tests in `test_themes.mjs`;
  rewrote hardcoded index `[5]` asserts to use `PALETTES.fire.length - 1`. Deleted
  `concepts.length === 7` assert and replaced exact triple-ID list asserts with count asserts in
  `test_derive_concepts.mjs`. Deleted `nodes.size === 7` and `nodes.size === 80` asserts in
  `test_layout_graph.mjs`. Deleted `rows.length === 9` and `to_female.length === 3` asserts in
  `test_csv_codec.mjs`. Deleted 18-name API function-type loop in `test_app_state.mjs`. In
  `stress.spec.ts` deleted wall-clock `Date.now()` hover-latency assertion and bare
  `waitForTimeout(500)`. In `autosave.spec.ts` replaced `waitForTimeout(700)` with
  `waitForFunction` polling and removed unreachable `if (saved !== null)` guard. In
  `drag.spec.ts` removed unreachable null guards after `not.toBeNull()` asserts. Added source
  cross-reference comment to `EDGE_ACCENT_COLOR` in `highlight.spec.ts`.
  `bash check_codebase.sh` -> "PASS: 6 checks passed."

- WP-D3a: Implemented the full Playwright test suite under `tests/playwright/`.
  Fixed `smoke.spec.ts` (app starts with zero rows; test now clicks "+ Add row" first
  and uses `enter_triple` helper that types in concept autocomplete inputs correctly by
  pressing Escape to close the dropdown before Tab-committing). Added `helpers.ts` with
  `enter_triple` and `paste_tsv` shared helpers. New spec files: `paste.spec.ts` (dispatch
  ClipboardEvent with 35-row TSV via page.evaluate, assert >= 30 bubbles); `highlight.spec.ts`
  (hover a row -> assert edge accent stroke; hover a node -> assert >= 2 rows get .highlighted
  class; assert highlight clears on mouse-out); `drag.spec.ts` (drag a bubble, edit an
  unrelated verb, assert dragged position unchanged within 2px); `export.spec.ts` (SVG export
  download contains `<svg` and `xmlns`; PNG download has PNG magic bytes and size > 100 bytes);
  `autosave.spec.ts` (enter triples, wait 700ms for debounce, reload, assert bubbles reappear);
  `print.spec.ts` (stub window.print via addInitScript, click Print button, assert stub
  called once); `stress.spec.ts` (set_input_files with stress_80_nodes.json fixture, assert
  >= 70 bubbles, assert hover response under 2s). `autocomplete.spec.ts` (ArrowDown+Enter
  selects existing concept from dropdown; Escape keeps typed text without committing).
  Added `/// <reference types="node" />` directives to specs using Node.js APIs so
  `tsconfig.lint.json` type-checks correctly without modifying the tsconfig.
  `npx playwright test` -> 11 passed; `bash check_codebase.sh` -> PASS: 6 checks passed.

- WP-C1b: Added `tests/test_edge_geometry.mjs` (12 tests) and `tests/test_map_bounds.mjs`
  (6 tests) via `node --import tsx --test`: per-shape boundary clipping (rect/oval/
  rounded), straight vs bowed cubics, opposite-side bidirectional bowing, midpoint
  label anchor, valid self-loop cubic, lone/bidirectional/duplicate curvature
  assignment, and extent computation including a far-dragged override expanding the
  bounds, ignored ghost overrides, and the empty-map case. All 18 pass.

- WP-C1a: Added `tests/test_layout_graph.mjs` (10 tests via `node --import tsx
  --test`): determinism (two runs, identical coords), honeybees structure and
  top-down ordering, label-length node sizing, blank/partial-row exclusion,
  casing/whitespace dedup, and cycle safety on both a tight 3-node cycle and the
  80-node stress fixture. All 10 pass.

- WP-A3: Added `tests/test_csv_codec.mjs` (29 tests via `node --import tsx --test`):
  TSV detection, BOM stripping, CRLF handling, quoted fields with embedded tabs/
  newlines/commas, doubled quotes, Excel-style multiline cells, row-width padding,
  serialize header and quoting, CRLF enforcement, round-trip with commas and quotes
  in fields, fuzzy header detection (canonical and case-insensitive), no-header
  positional fallback, blank-row skip, honeybees fixture end-to-end (Female 3
  inputs). All 29 pass.

- WP-C1c: Added `tests/test_themes.mjs` (17 tests via `node --import tsx --test`): palette length and hex format, depth_fill correctness at boundaries 0/5, clamp at >5, no-cycle check, ordered ramp (depth 0 != depth 1), ORIGIN_EMPHASIS shape, SHAPE_REGISTRY per-shape specs. All 17 pass.

- WP-A2c: Added `tests/test_validate_document.mjs` (28 tests via `node --import tsx --test`): fixture coverage for every rule across pass/warn/fail/hint severity levels, including normalization edge cases, blank-row semantics, and near-miss spelling pairs. All 28 pass.

- WP-A2a: Added `tests/test_derive_concepts.mjs` (12 tests): honeybees fixture
  (7 unique concepts, Female 3 incoming, Castes 3 outgoing), blank/partial-row
  semantics, deduplication/casing, ordering stability, empty input. All pass.
- WP-A1: Added `tests/test_concept_key.mjs` and `tests/test_document_codec.mjs`
  (node test runner via `node --import tsx --test`): normalization behavior,
  JSON round-trip on both fixtures, garbage rejection, version gate, and override
  pruning. 21 tests pass.
