# Related projects

Sibling repos, shared libraries, and integration touchpoints for the pseudo-code
flowchart editor. Adapted from a SolidJS concept-map editor fork.

## Runtime dependencies

- **solid-js** (>=1.9.13) - reactive UI framework. https://www.solidjs.com/
- **@dagrejs/dagre** (>=3.0.0) - directed graph auto-layout used for flowchart
  SVG rendering. https://github.com/dagrejs/dagre
- **Font Awesome Free 6.7.2** - vendored into `vendor/fontawesome/` (no CDN).
  https://fontawesome.com/

## Toolchain

- **esbuild** - JavaScript bundler used in `pipeline/build.mjs`.
- **esbuild-plugin-solid** - JSX transform for SolidJS.
- **TypeScript** - type checking via `npx tsc --noEmit`.
- **ESLint** - linting via `npx eslint src/`.
- **Prettier** - formatting via `npx prettier`.
- **Playwright** - browser-driven tests via `run_playwright_tests.sh`.

## Deployment

- **GitHub Pages** - static site host at https://vosslab.github.io/pseudo-code-mapper/
  (URL valid after the GitHub repo is renamed to pseudo-code-mapper).
  Deploy workflow: `.github/workflows/deploy_pages.yml`.

## Known gaps

- No sibling repos or shared internal libraries have been identified yet.
  Task: update this file if a shared utility library or companion repo is created.
