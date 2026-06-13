# Concept Map Maker

Browser-only tool for students building concept maps: enter triples in a spreadsheet table, get an auto-laid-out SVG map with live rubric validation, drag-to-adjust layout, and one-click PNG/SVG/JSON/CSV export.

## Overview

Students in life-science courses build concept maps where bubbles hold a 1-3 word concept (noun)
and directed arrows carry verb phrases ("concept maps --organize--> ideas"). This app runs entirely
in the browser with no install, no account, and no backend. Students enter rows in a
spreadsheet-like triples table (This concept | verb phrase | points to this concept); the app
auto-generates an SVG map using dagre auto-layout, colors bubbles by graph distance from origin
bubbles, validates the assignment rubric live (30+ unique concepts, a verb phrase on every arrow), and
saves work automatically in localStorage. Exports include PNG, SVG, JSON, CSV, and print. The app
is in active development.

## Documentation

- [docs/INSTALL.md](docs/INSTALL.md) - setup steps, dependencies, and install verification
- [docs/USAGE.md](docs/USAGE.md) - how to run the app, build maps, save work, and run dev checks
- [docs/CODE_ARCHITECTURE.md](docs/CODE_ARCHITECTURE.md) - components, data flow, and build pipeline
- [docs/FILE_STRUCTURE.md](docs/FILE_STRUCTURE.md) - directory map and where new work goes
- [docs/FILE_FORMATS.md](docs/FILE_FORMATS.md) - project JSON, triples CSV, paste, and export formats
- [docs/CHANGELOG.md](docs/CHANGELOG.md) - chronological record of changes grouped by date
- [docs/REPO_STYLE.md](docs/REPO_STYLE.md) - repo-wide conventions and core principles
- [docs/PYTHON_STYLE.md](docs/PYTHON_STYLE.md) - Python formatting, linting, and conventions
- [docs/PYTEST_STYLE.md](docs/PYTEST_STYLE.md) - pytest test-writing rules and failure triage
- [docs/MARKDOWN_STYLE.md](docs/MARKDOWN_STYLE.md) - Markdown writing rules for this repo
- [docs/E2E_TESTS.md](docs/E2E_TESTS.md) - end-to-end testing conventions

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

Run the Python hygiene tests (linting, link checks, shebang checks):

```bash
pytest tests/
```

## License

Source code is licensed under the MIT License; see
[LICENSE.MIT.md](LICENSE.MIT.md). Non-code content (text, figures) is licensed
under CC BY 4.0; see [LICENSE.CC-BY-4.0.md](LICENSE.CC-BY-4.0.md).
