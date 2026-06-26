# Install

Installed means the npm dev dependencies are present in `node_modules/` so the pseudo-code
flowchart editor can be built into `dist/` and served locally. The app itself is browser-only;
end users need no install, only a browser pointed at the built page.

## Requirements

- Node.js with `npm` (for example `brew install node`).
- Python 3.12 for the local web server and developer hygiene tests
  (`run_web_server.sh` uses `python3 -m http.server`).
- Python dev tools for the pytest suite are listed in
  [../pip_requirements-dev.txt](../pip_requirements-dev.txt) (bandit, pyflakes,
  pytest, rich).

## Install steps

```bash
bash devel/setup_typescript.sh
```

This runs `npm install` against [../package.json](../package.json) (TypeScript, esbuild,
SolidJS, ESLint, Prettier, tsx, Playwright).

For a clean reproducible install (CI / GitHub Pages uses this form):

```bash
npm ci
```

Optional, only for browser tests:

```bash
bash devel/setup_playwright.sh
```

## Build

```bash
bash build_github_pages.sh
```

Produces the production bundle in `dist/`. Run once after install before serving.

## Serve locally

```bash
bash run_web_server.sh
```

Builds `dist/` and serves it via Python's `http.server` on a random port in the
8000-8999 range. Open the URL printed in the terminal. On macOS a browser tab
opens automatically.

## Verify install

```bash
bash check_codebase.sh
```

Exits 0 with a PASS summary (typecheck, lint, format check, node unit tests).

Browser tests (requires Playwright install step above):

```bash
bash run_playwright_tests.sh
```

## Python dev tools

Install the pytest suite dependencies:

```bash
source source_me.sh && pip install -r pip_requirements-dev.txt
```
