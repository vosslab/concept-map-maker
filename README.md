# Concept Map Maker

Browser-only tool for students building concept maps: enter triples in a spreadsheet table, get an auto-laid-out SVG map with live rubric validation, drag-to-adjust layout, and one-click PNG/SVG/JSON/CSV export.

## Overview

Students in life-science courses build concept maps where bubbles hold a 1-3 word concept (noun)
and directed arrows carry verb phrases ("concept maps --organize--> ideas"). This app runs entirely
in the browser with no install, no account, and no backend. Students enter rows in a
spreadsheet-like triples table (This concept | verb phrase | points to this concept); the app
auto-generates an SVG map using dagre auto-layout, colors bubbles by graph distance from origin
bubbles, validates the assignment rubric live (30+ unique concepts, a verb phrase on every arrow),
and saves work automatically in localStorage. Exports include PNG, SVG, JSON, CSV, and print.

The UI includes a two-state light/dark theme toggle; the on-screen concept map adapts to the
selected theme while SVG/PNG exports remain light. The app is deployed on GitHub Pages and runs
with no server.

## Screenshots

<!-- screenshots:begin (managed by screenshot-docs) -->
![Dark-mode empty state with example template buttons](docs/screenshots/dark_empty_state.png)

![Dark-mode concept map of the Honeybees example with the triples table](docs/screenshots/dark_concept_map.png)
<!-- screenshots:end -->

## Documentation

Getting started:

- [docs/INSTALL.md](docs/INSTALL.md) - setup steps, dependencies, and install verification
- [docs/USAGE.md](docs/USAGE.md) - how to run the app, build maps, save work, and run dev checks

Reference:

- [docs/CODE_ARCHITECTURE.md](docs/CODE_ARCHITECTURE.md) - components, data flow, and build pipeline
- [docs/FILE_STRUCTURE.md](docs/FILE_STRUCTURE.md) - directory map and where new work goes
- [docs/FILE_FORMATS.md](docs/FILE_FORMATS.md) - project JSON, triples CSV, paste, and export formats
- [docs/CHANGELOG.md](docs/CHANGELOG.md) - chronological record of changes grouped by date

Style and testing:

- [docs/REPO_STYLE.md](docs/REPO_STYLE.md) - repo-wide conventions and core principles
- [docs/TYPESCRIPT_STYLE.md](docs/TYPESCRIPT_STYLE.md) - TypeScript formatting and conventions
- [docs/PLAYWRIGHT_USAGE.md](docs/PLAYWRIGHT_USAGE.md) - browser-driven Playwright test guide
- [docs/PYTEST_STYLE.md](docs/PYTEST_STYLE.md) - pytest test-writing rules and failure triage
- [docs/MARKDOWN_STYLE.md](docs/MARKDOWN_STYLE.md) - Markdown writing rules for this repo

## Quick start

```bash
npm install
bash build_github_pages.sh
bash run_web_server.sh
```

## Testing

Run the full codebase check (TypeScript, ESLint, node unit tests):

```bash
bash check_codebase.sh
```

Run browser-driven Playwright tests:

```bash
bash run_playwright_tests.sh
```

Run Python hygiene tests (linting, link checks, shebang checks):

```bash
pytest tests/
```

## License

Source code is licensed under the MIT License; see
[LICENSE.MIT.md](LICENSE.MIT.md). Non-code content (text, figures) is licensed
under CC BY 4.0; see [LICENSE.CC-BY-4.0.md](LICENSE.CC-BY-4.0.md).
