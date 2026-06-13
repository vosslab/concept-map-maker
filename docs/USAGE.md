# Usage

How to run, build, and use the Concept Map Maker. See [../README.md](../README.md) for an
overview and quick start.

## Running locally

```bash
npm install
bash build_github_pages.sh
bash run_web_server.sh
```

`run_web_server.sh` serves the built `dist/` folder. Open the URL printed in
the terminal (usually `http://localhost:8080`).

## Building a map

### Triples table

The Triples tab is a spreadsheet-style table with three columns:

| Column | Meaning |
| --- | --- |
| This concept | the source bubble (noun phrase, 1-3 words) |
| verb phrase | the arrow label (a relationship verb) |
| points to this concept | the destination bubble |

Each row reads as a sentence: "photosynthesis --produces--> glucose". The map
auto-updates as you type. Autocomplete in the concept columns reuses existing
bubble names so you do not create duplicate concepts by accident.

Column widths adjust to fit the widest committed value in each column after each
Enter/Tab/blur commit. Draft keystrokes do not resize columns.

The **chain button** (arrow icon at the right of each row, aria-label "Chain new row
from this concept") lets you extend a chain quickly: it commits the current `to` draft
and inserts a new row directly below with `from` pre-filled from that value. The button
is disabled when the `to` cell is blank.

### Live rubric panel

The rubric panel at the bottom of the page updates in real time. Watch for
items such as:

- 30 unique concepts (bubbles) in the map.
- A verb phrase on every arrow (no blank labels).

Items are marked OK, WARN, FAIL, or HINT.

## Map interactions

- **Auto layout** - dagre places bubbles automatically when you add or edit triples.
- **Drag bubbles** - drag a bubble to reposition it. Dragged positions persist until
  you use Re-layout.
- **Re-layout button** - resets all bubbles to auto-layout positions (confirms before
  clearing dragged positions).
- **Renaming a concept** - editing a concept name in the Triples table resets that
  bubble's dragged position back to auto-layout.
- **Pane resizer** - drag the divider between the triples table and the map to widen
  either pane. Double-click the divider to reset to the default 40/60 split.
  ArrowLeft and ArrowRight (when the divider is focused) nudge the split by 2%. The
  ratio persists across page reloads via localStorage.
- **Corner style** - the "Corners" dropdown in the Layout toolbar group selects from
  four presets: Capsule (pill-shaped), Oval (elliptical), Rounded rect (classic 5px),
  Corner rect (sharp 0px). The choice persists across page reloads via localStorage.
- **Pan and zoom** - scroll or pinch to zoom, drag the background to pan. Double-click
  the background to reset the view.
- **Themes** - the theme picker in the map pane header changes bubble shape and color
  palette (earth and fire palettes available).
- **Bubble color** - color reflects distance from origin bubbles. An origin bubble has
  only outgoing arrows (no incoming arrows).

## Saving and submitting

| Action | Button | Notes |
| --- | --- | --- |
| Save project | Save project | Downloads a `.json` file (full save: triples, positions, title, theme) |
| Open project | Open project | Replaces the current map; also overwrites the autosave slot |
| Clear map | Clear | Confirms before wiping the document |
| Export triples CSV | Export triples CSV | Downloads a `.csv` with triples only (positions and title are not included; use Save project for a full save); opens in Excel or Google Sheets |
| Import triples CSV | Import triples CSV | Appends triples from a CSV file; does not wipe existing work |
| Export map image | Export SVG / Export PNG | Downloads the current map as a vector or raster image |
| Print | Print | Opens the browser print dialog; prints the map |
| Autosave | (automatic) | One browser localStorage slot; shown as "autosave on" in the toolbar |

**Opening a project file replaces the current autosave slot.** Always save a
`.json` project file before switching to a different student's work.

## Pasting from a spreadsheet

You can copy rows directly from Excel or Google Sheets and paste them into the
triples table:

- Copy 3-column rows (From concept | verb phrase | To concept) and paste into any
  cell in the Triples tab.

The paste handler reads the clipboard as tab-separated values, matching the default
copy format of most spreadsheet apps.

## Deploy to GitHub Pages

The CI workflow `.github/workflows/deploy_pages.yml` builds `dist/` and publishes
it to GitHub Pages on every push to `main` and on manual dispatch.

Live URL: `https://vosslab.github.io/concept-map-maker/`

### How it works

- Triggers: push to `main` and `workflow_dispatch` (manual run from the Actions tab).
- CI runs `npm ci` then `npm run build` (Node 20 LTS) -- the same build command used locally.
- Two jobs: `build` uploads `dist/` as a Pages artifact; `deploy` publishes it via
  `actions/deploy-pages`.
- Assets stay relative (no absolute `/` paths, no `<base href>`), so the app serves
  correctly from the `/concept-map-maker/` subpath without any code changes.

### One-time setup (exact order)

1. (operator action) Merge the workflow to `main`. The workflow must be on the default
   branch before it can run or be dispatched.
2. (operator action) In the GitHub repo: Settings -> Pages -> Source = "GitHub Actions".
   This can be set before any run; it does not require an existing deployment.
3. (operator action) Trigger a run. The merge in step 1 already fires a `push` to `main`.
   If Pages source was not yet set when that run started, re-run via the Actions tab ->
   Run workflow after step 2.
4. Verify: once both jobs are green and `deploy-pages` reports a URL, the app is live.

Note: if the first auto-run executes before step 2, the `deploy` job may fail because
Pages is not yet enabled. That is expected -- re-run after enabling Pages. Do not treat
the first red run as a code defect.

### Subpath-safety invariant

All asset references in `src/index.html` (`style.css`, `main.js`,
`vendor/fontawesome/fa-solid.min.css`, `vendor/fontawesome/fa-solid-900.woff2`) are
relative paths with no leading `/` and no `<base href>`. The vendored font CSS also
uses a relative `url()`. Do not introduce absolute `/` asset paths or a `<base href>`;
doing so breaks the subpath deploy.

## Developer tasks

Run all checks (TypeScript type-check, ESLint, node unit tests):

```bash
bash check_codebase.sh
```

Run node unit tests directly:

```bash
node --import tsx --test tests/test_*.mjs
```

Run Playwright browser tests:

```bash
bash run_playwright_tests.sh
```

Pass `--build` to force a dist/ rebuild before running, or forward any
extra arguments to Playwright (for example a spec file path or `--headed`).

Run Python hygiene tests (linting, link checks, shebang checks):

```bash
source source_me.sh && python3 -m pytest tests/
```

### Walkthrough demo

The walkthrough demo plays through a dataset of triples like a human user,
committing each row with per-keystroke delay so the map visibly grows. It uses
the chain button when a triple's "from" matches the previous triple's "to",
showcasing that workflow. Screenshots are saved per row and a video recording
captures the full session under `output_smoke/walkthrough/`.

```bash
bash run_walkthrough_demo.sh
```

Pass `--build` to force a `dist/` rebuild first, `--headed` to watch in a
browser window, `--data <path>` for a custom triples JSON, and `--speed <ms>`
to tune keystroke delay.
