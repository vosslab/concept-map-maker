# Troubleshooting

Known issues, fixes, and debugging steps for Concept Map Maker.

## Build and tooling

### `npx tsc --noEmit` fails with missing type declarations

Run `npm install` to restore node_modules, then retry. If the problem persists,
check that `tsconfig.json` includes the file being flagged.

### `check_codebase.sh` fails on format check

Run `npm run format:write` to auto-format all TypeScript/JS files, then recheck
with `bash check_codebase.sh`.

### Playwright tests fail with "browser not installed"

Run `./devel/setup_playwright.sh` (or `npm run setup:playwright`) to install the
Playwright browser binaries. See [docs/INSTALL.md](INSTALL.md).

### `dist/` is missing after build

Run `bash build_github_pages.sh` (or `npm run build`) to produce `dist/`. Verify
`dist/vendor/fontawesome/fa-solid-900.woff2` is present; the build script asserts
this file exists before printing success.

## Runtime issues

### Map is blank after import

Check that the JSON file has `format: "concept-map-maker"` and `version: 1`.
Unknown or missing version fields are rejected by the document codec. See
[docs/FILE_FORMATS.md](FILE_FORMATS.md) for the schema.

### Dark mode: dropdown text is dark-on-dark

This was fixed in the 26.06 release. Hard-reload the page (`Cmd+Shift+R` / `Ctrl+Shift+R`)
to clear any cached stylesheet. If self-hosting, ensure `dist/` was rebuilt.

### Toolbar icons are missing (blank buttons)

Font Awesome is vendored locally in `vendor/fontawesome/`. If you see blank icon
boxes, the font file is not being served. When using `run_web_server.sh`, the
server must serve from the repo root so `vendor/` is reachable. For GitHub Pages,
`build_github_pages.sh` copies `vendor/` into `dist/vendor/`.

## Accessibility known issues (as of 26.06)

The following WCAG 2.1 AA gaps were identified in the 2026-06-12 audit and have
not yet been fixed:

- Cell highlight roles (`cell-same`, `cell-from`, `cell-to`) are communicated by
  tint only (WCAG 1.4.1). Fix: add a non-color indicator (icon or pattern).
- Pane resizer focus outline has insufficient contrast (WCAG 2.4.11).
- `--color-text` CSS token is undefined in some contexts.
- Toolbar group captions are not programmatically associated with their buttons
  (WCAG 1.3.1).

See `docs/active_plans/audits/ui_refinements_a11y_audit.md` for the full audit.
