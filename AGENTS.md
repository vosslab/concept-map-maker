## Coding style
- Repo conventions: docs/REPO_STYLE.md
- TypeScript: docs/TYPESCRIPT_STYLE.md
- Python: docs/PYTHON_STYLE.md
- Markdown: docs/MARKDOWN_STYLE.md
- Tests: docs/PYTEST_STYLE.md, docs/E2E_TESTS.md, docs/PLAYWRIGHT_USAGE.md
- Document every edit in docs/CHANGELOG.md.

## Running code
- Python: `source source_me.sh && python3` (Python 3.12 only).
- macOS Homebrew Python 3.12 modules live in /opt/homebrew/lib/python3.12/site-packages/.
- Full TypeScript gate: `bash check_codebase.sh`. Browser tests: `bash run_playwright_tests.sh`.
- Fast Python hygiene tests: `pytest tests/`.
