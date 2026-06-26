# File structure

## Top-level layout

```text
pseudo-code-mapper/
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
- [src/app.tsx](../src/app.tsx) - top-level shell (toolbar, editor pane, map pane, resizer)
- [src/toolbar.tsx](../src/toolbar.tsx) - ribbon toolbar with file ops and Update Flowchart
- [src/code_editor.tsx](../src/code_editor.tsx) - CodeMirror 6 pseudo-code editor
- [src/map_canvas.tsx](../src/map_canvas.tsx) - SVG root with pan/zoom viewport
- [src/flow_node.tsx](../src/flow_node.tsx) - draws eight flowchart node shapes
- [src/flow_edge.tsx](../src/flow_edge.tsx) - draws edges with branch labels and back-arcs
- [src/empty_state.tsx](../src/empty_state.tsx) - empty-map overlay with template buttons
- [src/theme_picker.tsx](../src/theme_picker.tsx) - color palette selector
- [src/ui_theme_toggle.tsx](../src/ui_theme_toggle.tsx) - toolbar light/dark switch

Shared actions:
- [src/template_actions.ts](../src/template_actions.ts) - `load_template` (overwrite guard +
  codec-clone), shared by the empty-state panel and the toolbar

State and types:
- [src/app_state.ts](../src/app_state.ts) - central reactive store with derivation memos
- [src/types.ts](../src/types.ts) - shared contracts (`FlowNode`, `FlowEdge`, `FlowGraph`,
  `FlowDocument`, `NodeShape`)

UI theme:
- [src/ui_theme.ts](../src/ui_theme.ts) - two-state light/dark model, `map_is_dark()` accessor,
  `set_exporting_light()` flag, `setup_map_theme()` observer wiring

Editor language extension:
- [src/pseudo_language.ts](../src/pseudo_language.ts) - CodeMirror 6 `StreamLanguage`
  highlighting for the editor (keywords, comments, numbers); keeps highlight set in sync
  with the lexer keywords. Authoritative parsing lives in `src/pseudo_lang/`.

Pseudo-code parser (no Solid imports, node-testable):
- `src/pseudo_lang/lexer.ts` - tokenizes source text with line numbers
- `src/pseudo_lang/normalize.ts` - normalizes indentation and end-keyword blocks
- `src/pseudo_lang/parser.ts` - maps token lines to `ParsedNode` records with `NodeShape`

Pure derivation modules (no Solid imports, node-testable):
- [src/derive_graph.ts](../src/derive_graph.ts) - parsed nodes to `FlowGraph` with edges and
  branch wiring; one-entry memo skips re-parsing identical source
- [src/layout_graph.ts](../src/layout_graph.ts) - Dagre layout (top-down)
- [src/edge_routing.ts](../src/edge_routing.ts) - back-edge arc geometry and connector placement
- [src/edge_geometry.ts](../src/edge_geometry.ts) - curved edge paths and arrowhead geometry
- [src/map_bounds.ts](../src/map_bounds.ts) - bounding box for viewBox and export sizing
- [src/themes.ts](../src/themes.ts) - theme palette defaults and origin emphasis tokens
- [src/palettes.ts](../src/palettes.ts) - node color `PALETTES` registry and `depth_fill` helper
- [src/templates.ts](../src/templates.ts) - prefilled example flowcharts (`TEMPLATES`); pure data
Codecs and export:
- [src/document_codec.ts](../src/document_codec.ts) - versioned JSON serialize/parse for
  `FlowDocument`
- [src/export_svg.ts](../src/export_svg.ts) - SVG text export and SVG/PNG download

Static assets:
- [src/index.html](../src/index.html) - HTML shell; inline script sets `data-ui-theme` on
  `<html>` before paint to prevent theme flash
- [src/style.css](../src/style.css) - barrel of `@import` statements (copied verbatim into
  `dist/` by the build script)

CSS modules under [src/css/](../src/css/):
- `tokens.css` - `:root` design tokens + `[data-ui-theme="dark"]` override block
- `base.css` - global resets and body layout
- `toolbar.css` - ribbon toolbar styles
- `editor.css` - editor pane styles
- `map.css` - SVG map pane styles
- `print.css` - print media query overrides

See [CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md) for how these fit together.

### tests/

- `tests/test_*.mjs` - node unit tests for pure src modules; run via
  `node --import tsx --test` inside [check_codebase.sh](../check_codebase.sh).
- `tests/playwright/*.spec.ts` - browser E2E specs plus
  [tests/playwright/helpers.ts](../tests/playwright/helpers.ts); run via
  [run_playwright_tests.sh](../run_playwright_tests.sh).
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
  [CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md), [FILE_STRUCTURE.md](FILE_STRUCTURE.md),
  [FILE_FORMATS.md](FILE_FORMATS.md)
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
- Parser rules: `src/pseudo_lang/parser.ts` and a test in `tests/test_pseudo_parser.mjs`
- Unit tests: `tests/test_<module>.mjs` mirroring the src module name
- Browser tests: `tests/playwright/<feature>.spec.ts`
- Docs: `docs/` with SCREAMING_SNAKE_CASE filenames
- Developer scripts: `devel/`; user-facing entry points stay as repo-root `*.sh`
