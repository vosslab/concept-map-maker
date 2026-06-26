# Pseudo-code Flowchart Editor

Browser-only flowchart editor for developers and students: write pseudo-code in the left pane, click Update Flowchart, and get an auto-laid-out SVG diagram with eight node shapes, True/False branch labels, and correct loop back-edges.

## Documentation

Getting started:

- [docs/INSTALL.md](docs/INSTALL.md) - setup steps, dependencies, and install verification
- [docs/USAGE.md](docs/USAGE.md) - how to run the app, edit pseudo-code, and save work
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) - known issues, fixes, and debugging steps

Reference:

- [docs/CODE_ARCHITECTURE.md](docs/CODE_ARCHITECTURE.md) - components, data flow, and build pipeline
- [docs/FILE_STRUCTURE.md](docs/FILE_STRUCTURE.md) - directory map and where new work goes
- [docs/FILE_FORMATS.md](docs/FILE_FORMATS.md) - .pseudo source and FlowDocument JSON formats
- [docs/PSEUDO_CODE_FORMAT.md](docs/PSEUDO_CODE_FORMAT.md) - pseudo-code grammar and flowchart shape mapping
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
bash run_web_server.sh
```

## Screenshots

![Password check: if-else flowchart with red False and green True branches](docs/screenshots/password_check.png)

![For loop sum: loop hexagon with a back-edge](docs/screenshots/for_loop_sum.png)

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
