# File structure

## Top-level layout

```text
concept-map-maker/
+- src/                    # SolidJS + TypeScript app source
+- pipeline/               # esbuild build scripts
+- tests/                  # node unit tests, Playwright specs, Python hygiene tests
+- tools/                  # standalone helper scripts (html_to_pdf.mjs)
+- devel/                  # developer maintenance scripts (changelog, setup, version)
+- vendor/                 # vendored third-party assets (Font Awesome)
+- docs/                   # project documentation
+- build_github_pages.sh   # canonical production build into dist/
+- run_web_server.sh       # build then serve dist/ locally
+- run_playwright_tests.sh # build (if needed) and run Playwright suite
+- check_codebase.sh       # typecheck + lint + format + node test gate
+- run_walkthrough_demo.sh # build then play a scripted walkthrough demo
+- source_me.sh            # Python environment bootstrap
+- package.json            # npm scripts and dependencies
+- playwright.config.ts    # Playwright configuration
+- tsconfig.json           # app typecheck config
+- tsconfig.lint.json      # wider typecheck config (tests, tools, pipeline)
+- eslint.config.js        # ESLint flat config
+- Brewfile, pip_requirements*.txt  # system and Python dependency manifests
+- README.md, AGENTS.md, CLAUDE.md, VERSION, REPO_TYPE
+- LICENSE.MIT.md, LICENSE.CC-BY-4.0.md
```

## Key subtrees

### src/

SolidJS + TypeScript application source. Vite (via esbuild) bundles `src/main.tsx` as the
entry point. All CSS is imported from `src/style.css` (a barrel of `@import` lines).

Components (`.tsx`):
- [src/app.tsx](../src/app.tsx), [src/toolbar.tsx](../src/toolbar.tsx)
- [src/map_canvas.tsx](../src/map_canvas.tsx), [src/concept_node.tsx](../src/concept_node.tsx),
  [src/concept_edge.tsx](../src/concept_edge.tsx)
- [src/triples_table.tsx](../src/triples_table.tsx), [src/triple_row.tsx](../src/triple_row.tsx)
- [src/rubric_panel.tsx](../src/rubric_panel.tsx), [src/theme_picker.tsx](../src/theme_picker.tsx),
  [src/concept_autocomplete.tsx](../src/concept_autocomplete.tsx)
- [src/ui_theme_toggle.tsx](../src/ui_theme_toggle.tsx) - toolbar light/dark switch
- [src/empty_state.tsx](../src/empty_state.tsx) - empty-map overlay with template buttons

Shared actions:
- [src/template_actions.ts](../src/template_actions.ts) - `load_template` (overwrite guard +
  codec-clone), shared by the empty-state panel and the toolbar Examples group

State and types:
- [src/app_state.ts](../src/app_state.ts), [src/types.ts](../src/types.ts)

UI theme:
- [src/ui_theme.ts](../src/ui_theme.ts) - two-state light/dark model, `map_is_dark()` accessor,
  `set_exporting_light()` flag, `setup_map_theme()` observer wiring

Pure modules (no Solid imports, node-testable):
- [src/derive_concepts.ts](../src/derive_concepts.ts),
  [src/layout_graph.ts](../src/layout_graph.ts),
  [src/graph_depth.ts](../src/graph_depth.ts),
  [src/validate_document.ts](../src/validate_document.ts),
  [src/edge_geometry.ts](../src/edge_geometry.ts),
  [src/map_bounds.ts](../src/map_bounds.ts),
  [src/measure_text.ts](../src/measure_text.ts)
- [src/themes.ts](../src/themes.ts) - shape registry; re-exports palettes from `palettes.ts`
- [src/palettes.ts](../src/palettes.ts) - bubble color `PALETTES` registry and `depth_fill` helper
- [src/templates.ts](../src/templates.ts) - prefilled example maps (`TEMPLATES`); pure data, no DOM/Solid
- [src/label_wrap.ts](../src/label_wrap.ts) - shared verb/edge label-size source of truth
  (constants + `wrap_verb_label` + `label_box`; no DOM/Solid); imported by
  `layout_graph.ts` (dagre sizing) and `concept_edge.tsx` (wrapping)

Codecs and export:
- [src/document_codec.ts](../src/document_codec.ts),
  [src/csv_codec.ts](../src/csv_codec.ts),
  [src/export_svg.ts](../src/export_svg.ts)

Static assets:
- [src/index.html](../src/index.html) - HTML shell; includes an inline script that sets
  `data-ui-theme` on `<html>` before paint to prevent theme flash
- [src/style.css](../src/style.css) - barrel of `@import` statements (not processed by Vite
  directly; copied verbatim into `dist/` by the build script)

CSS modules under [src/css/](../src/css/):
- `tokens.css` - `:root` design tokens + `[data-ui-theme="dark"]` override block
- `base.css` - global resets and body layout
- `toolbar.css` - ribbon toolbar styles
- `editor.css` - triples table and editor pane styles
- `map.css` - SVG map pane styles
- `rubric.css` - rubric panel styles
- `print.css` - print media query overrides

See [CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md) for how these fit together.

### tests/

- `tests/test_*.mjs` - node unit tests for pure src modules; run via
  `node --import tsx --test` inside [check_codebase.sh](../check_codebase.sh).
- `tests/playwright/*.spec.ts` - browser E2E specs plus
  [tests/playwright/helpers.ts](../tests/playwright/helpers.ts); run via
  [run_playwright_tests.sh](../run_playwright_tests.sh).
- `tests/playwright/walkthrough_demo.mts` - standalone scripted walkthrough demo
  (not a Playwright spec); invoked via `run_walkthrough_demo.sh`.
- `tests/playwright/walkthrough_data/` - data fixtures for the walkthrough demo
  (for example `honeybees_triples.json`, the default dataset).
- `tests/test_*.py` - Python hygiene pytest suite (whitespace, indentation, ASCII,
  markdown links, shebangs, imports, bandit); run with `pytest tests/`.
- [tests/conftest.py](../tests/conftest.py) excludes `e2e/` and `playwright/` from
  pytest collection.

### vendor/

Third-party assets vendored locally so the app deploys to GitHub Pages with zero external
runtime dependencies.

- `vendor/fontawesome/fa-solid.min.css` - combined Font Awesome base + solid CSS with
  `url(./fa-solid-900.woff2)` font path (relative within the folder).
- `vendor/fontawesome/fa-solid-900.woff2` - Font Awesome 6 Free solid icon font (~155 KB).
- `vendor/fontawesome/LICENSE.txt` - Font Awesome Free license (SIL OFL for fonts,
  CC BY 4.0 for icons, MIT for CSS).

The build script copies `vendor/fontawesome/` verbatim into `dist/vendor/fontawesome/` and
asserts the woff2 file is present before printing "Built dist/ (GitHub Pages-ready).".
The stylesheet is linked from `src/index.html` as `vendor/fontawesome/fa-solid.min.css`.
All `vendor/` paths are excluded from pytest hygiene scans via `tests/conftest.py`
`REPO_HYGIENE_FILTERS`.

### devel/

- Changelog tooling: [devel/rotate_changelog.py](../devel/rotate_changelog.py),
  [devel/query_changelog.py](../devel/query_changelog.py),
  [devel/commit_changelog.py](../devel/commit_changelog.py),
  [devel/changelog_lib.py](../devel/changelog_lib.py)
- Setup: [devel/setup_typescript.sh](../devel/setup_typescript.sh),
  [devel/setup_playwright.sh](../devel/setup_playwright.sh)
- Misc: [devel/bump_version.py](../devel/bump_version.py),
  [devel/dist_clean.sh](../devel/dist_clean.sh)

## Generated artifacts (gitignored)

- `dist/` - production build output (`main.js`, `main.js.map`, `index.html`,
  `style.css`, `.nojekyll`, `vendor/fontawesome/`)
- `output_smoke/` - smoke-test screenshots and video artifacts (stable folder name
  reused across runs)
- `node_modules/`, `package-lock.json` - npm dependencies
- `test-results/`, `playwright-report/`, `blob-report/`, `coverage/` - test outputs
- `*.tsbuildinfo`, `.eslintcache`, `.prettiercache` - tool caches
- `_temp*` files and `report_*.txt` - scratch and hygiene-report files

## Documentation map

- Root docs: [README.md](../README.md), [AGENTS.md](../AGENTS.md)
- Project docs: [USAGE.md](USAGE.md), [CHANGELOG.md](CHANGELOG.md),
  [CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md), [FILE_STRUCTURE.md](FILE_STRUCTURE.md)
- Style and convention docs (centrally maintained): [REPO_STYLE.md](REPO_STYLE.md),
  [PYTHON_STYLE.md](PYTHON_STYLE.md), [TYPESCRIPT_STYLE.md](TYPESCRIPT_STYLE.md),
  [PYTEST_STYLE.md](PYTEST_STYLE.md), [MARKDOWN_STYLE.md](MARKDOWN_STYLE.md),
  [E2E_TESTS.md](E2E_TESTS.md), [PLAYWRIGHT_USAGE.md](PLAYWRIGHT_USAGE.md),
  [CLAUDE_HOOK_USAGE_GUIDE.md](CLAUDE_HOOK_USAGE_GUIDE.md)
- Working plans: `docs/active_plans/` (filed by kind per
  [REPO_STYLE.md](REPO_STYLE.md))

## Where to add new work

- App code: `src/` (pure logic in a Solid-free `.ts` module when possible)
- CSS: add a file under `src/css/` and add its `@import` to `src/style.css`
- Unit tests: `tests/test_<module>.mjs` mirroring the src module name
- Browser tests: `tests/playwright/<feature>.spec.ts`
- Docs: `docs/` with SCREAMING_SNAKE_CASE filenames
- Developer scripts: `devel/`; user-facing entry points stay as repo-root `*.sh`
