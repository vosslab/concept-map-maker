# Plan: UI/UX refinements - triples table ergonomics, cell color coding, resizer, definitions removal, ribbon toolbar

## Context

User testing of the concept-map editor surfaced seven friction points: (1) the verb-phrase
input truncates short words ("included" shows as "nclude"); (2) clicking "+ Add row" while a
cell is focused only blurs the field - the focused row's preview line collapses on blur, the
button jumps up, and the second click lands elsewhere; (3) chaining triples
(honeybees->castes, castes->workers) requires retyping the previous "points to" concept;
(4) the table feels disconnected - no visual link between cells sharing a concept; (5) the
40/60 pane split is fixed and cramps the editor; (6) the definitions tab is out of scope for
a concept-map tool; (7) the toolbar is a flat row of text buttons.

User decisions (explicit, not inferred): vendor Font Awesome locally (no CDN); highlight on
both hover and focus; draggable resizer persisted to localStorage; the app has NOT shipped,
so definitions are deleted with zero migration, warning, or round-trip support - if old local
files fail to open after the change, that is acceptable.

## Objectives

- Verb-phrase input wide enough to read typical verbs without truncation.
- "+ Add row" adds one row on a single pointer action even when a cell has focus, with any
  typed-but-uncommitted autocomplete text preserved; the button never moves on focus/blur.
- Per-row "chain" button creates a new row with this row's "points to" as the new "this concept".
- Three-color cell highlighting: same-concept cells, from-cells, to-cells, on hover and focus.
- Draggable center divider with persisted, validated ratio.
- Definitions feature fully deleted (UI, state, types, codec, validation, tests, fixtures, docs).
- Ribbon-style toolbar with vendored Font Awesome icons, grouped with captions.

## Design philosophy

Fix the design, not the symptom: the Add-row miss is caused by layout instability (per-row
preview line appearing/disappearing on focus), so the preview moves to a fixed slot below the
table instead of patching the button with click-retry hacks. Definitions are deleted outright
rather than hidden, since nothing has shipped - long-term over short-term. Font Awesome is
vendored, not CDN-linked, to keep the zero-external-runtime-dependency property of the
GitHub Pages build.

## Scope

- `src/triple_row.tsx`, `src/triples_table.tsx`, `src/concept_autocomplete.tsx`,
  `src/style.css` - items 1, 2, 3, 4
- `src/app_state.ts` - active-concept highlight state (item 4), definitions removal (item 6)
- `src/app.tsx`, `src/style.css` - resizer (item 5), definitions tab removal (item 6)
- `src/types.ts`, `src/document_codec.ts`, `src/validate_document.ts`,
  `src/definitions_table.tsx` (delete), `tests/test_app_state.mjs`,
  `tests/test_document_codec.mjs`, `tests/test_validate_document.mjs`,
  `tests/fixtures/honeybees_document.json`, `tests/fixtures/stress_80_nodes.json`,
  `docs/USAGE.md`, `docs/FILE_FORMATS.md` - item 6
- `src/toolbar.tsx`, `src/index.html`, `build_github_pages.sh`, new `vendor/fontawesome/` - item 7

## Non-goals

- Definitions migration, load warning, or round-trip of old files (user decision: unshipped).
- Mobile/touch layout polish. The resizer uses pointer events (which cover mouse, pen, touch);
  mouse dragging must work, touch is untested and out of scope.
- Map-pane (SVG) visual changes; node/edge highlight visuals there stay as-is.
- Autocomplete behavior changes beyond exposing a synchronous commit path.

## Current state summary

### Evidence (verified in repo)

- Row grid: `src/style.css:334` `grid-template-columns: 1fr auto 1fr auto 1fr auto`; verb is
  a plain input (`src/triple_row.tsx:110-117`) squeezed by the 40% editor pane.
- Preview line renders inside the focused row as a full-width grid item
  (`src/triple_row.tsx:146-150`, `.triple-preview` `src/style.css:384-390`) - this is the
  layout shift that moves the Add-row button on blur.
- Autocomplete commits drafts via `commit(draft())` inside a 150 ms `setTimeout` on blur
  (`src/concept_autocomplete.tsx:185-189`); `commit()` is an ordinary function callable
  synchronously; Enter and suggestion-click already call it directly. Add-row uses `onClick`
  (`src/triples_table.tsx:164-166`).
- Highlight state exists: `HighlightRole = "from" | "to" | "both"` (`src/app_state.ts:64`),
  `highlighted_triples` / `highlighted_concepts` memos (`src/app_state.ts:164-231`), row-level
  `.triple-row.highlighted` CSS only (`src/style.css:603-607`). No per-cell highlighting.
- Pane split: `--editor-ratio: 40%` (`src/style.css:18`),
  `.editor-pane { flex: 0 0 var(--editor-ratio) }` (`src/style.css:166-174`), no resizer.
- Definitions: 193 case-insensitive "definition" hits across `src/app.tsx`,
  `src/definitions_table.tsx`, `src/document_codec.ts`, `src/app_state.ts`, `src/types.ts`,
  `src/style.css`, `src/validate_document.ts`, `tests/test_app_state.mjs`,
  `tests/test_validate_document.mjs`, `tests/test_document_codec.mjs`,
  `tests/fixtures/honeybees_document.json`, `tests/fixtures/stress_80_nodes.json`.
- Toolbar: text-only `.toolbar-btn` buttons in four semantic `<span class="toolbar-group">`
  wrappers (`src/toolbar.tsx:207-320`); no icon library in `package.json` (deps: solid-js,
  @dagrejs/dagre only).
- Build: `build_github_pages.sh` wipes `dist/`, bundles `dist/main.js` via esbuild, copies
  ONLY `src/index.html` and `src/style.css` into `dist/` - a vendor-copy step must be added.
- ASCII checks live in `tests/check_ascii_compliance.py` / `tests/fix_ascii_compliance.py`;
  the repo-wide gate's exclusion mechanism must be confirmed in WS-E preflight.

### Assumptions (each owned by a preflight check below)

- Preview reflow is the primary cause of the Add-row miss (preflight A: confirm no other
  focus-driven layout change).
- Map resize already handles container width changes (preflight C: name the code path).
- Full FA solid woff2 (~150 KB) is acceptable bundle weight (preflight E: confirm with user
  only if it exceeds ~300 KB).
- localStorage is not already used for layout state that would collide (preflight C: grep).

## Architecture boundaries and ownership

### Mapping (workstreams -> components / patches)

| Workstream | Component | Expected patches |
| --- | --- | --- |
| WS-A table ergonomics (1,2,3) | triples table (`triple_row.tsx`, `triples_table.tsx`, `concept_autocomplete.tsx`, `style.css`) | 1 (incl. its Playwright test) |
| WS-B cell color coding (4) | highlight state (`app_state.ts`) + table cells + CSS | 1 (incl. its Playwright test) |
| WS-C resizer (5) | layout shell (`app.tsx`, `style.css`) | 1 |
| WS-D definitions removal (6) | types/state/codec/validation/app tabs + Node tests + fixtures + docs | 1 (incl. test/fixture updates) |
| WS-E ribbon toolbar (7) | `toolbar.tsx`, `index.html`, build script, `vendor/fontawesome/` | 1-2 |

## Milestone plan

| M | Title | Summary | Goal |
| --- | --- | --- | --- |
| M1 | Independent refinements | Resizer, definitions removal, ribbon toolbar | Three behaviorally independent improvements land without touching the triples table |
| M2 | Triples table rework | Ergonomics fixes then cell color coding | Table is stable, chainable, and visually connected |

### Milestone: M1 independent refinements

- Depends on: none
- Workstreams: WS-C, WS-D, WS-E - behaviorally independent but NOT file-independent: all
  three touch `src/style.css`. Each lane edits only its own labeled CSS section (WS-C: new
  `/* resizer */` block; WS-D: deletes definition-table rules; WS-E: new `/* ribbon toolbar */`
  block replacing `.toolbar*` rules). Merge order is manager's choice; conflicts are
  section-local.
- Entry criteria: plan approved
- Exit criteria: each workstream's acceptance criteria met; `npx tsc --noEmit` exit 0;
  `npx eslint src/` exit 0; `bash check_codebase.sh` passes; `docs/CHANGELOG.md` updated per
  patch; behavior tests included in the same patch as the behavior
- Parallel-plan ready: yes (WS-C, WS-D, WS-E concurrently; max 3 doers; CSS sections disjoint)

### Milestone: M2 triples table rework

- Depends on: M1 merged (only to serialize `style.css` edits; no behavioral dependency)
- Workstreams: WS-A then WS-B (both rewrite `triple_row.tsx` internals; serial within
  milestone - documented exception to parallel default)
- Entry criteria: M1 merged
- Exit criteria: WS-A and WS-B acceptance criteria met; same gates as M1; full Playwright
  suite passes
- Parallel-plan ready: no - WS-A and WS-B both rewrite `triple_row.tsx`; serial by design

## Workstream breakdown

### Workstream: WS-A table ergonomics

- Owner: coder
- Needs: nothing
- Preflight (output: one note in the patch description): trace the autocomplete commit path;
  confirm `commit()` can be invoked synchronously from outside. Design constraint: prefer
  passing an explicit commit callback through existing component boundaries (props) over
  exported global state or reaching into child internals. Confirm the preview line is the
  only focus-driven layout change.
- Provides: stable row layout + synchronous commit API (precondition for WS-B and chain button)
- Expected patches: 1

### Workstream: WS-B cell color coding

- Owner: expert_coder (reactive state design across table + existing map highlight system)
- Needs: WS-A merged (stable `triple_row.tsx` markup)
- Preflight (output: note): confirm how `highlighted_concepts` roles compose with the new
  per-cell classes; confirm map-pane behavior is untouched by adding a new signal.
- Provides: per-cell highlight API
- Expected patches: 1

### Workstream: WS-C resizer

- Owner: coder
- Needs: nothing
- Preflight (output: note): name the existing map resize/redraw path (resize observer or
  CSS-driven) and confirm it reacts to `.map-pane` width change; `grep -rn localStorage src/`
  to confirm no key collision.
- Provides: `--editor-ratio` driven by pointer drag + validated localStorage persistence
- Expected patches: 1

### Workstream: WS-D definitions removal

- Owner: coder
- Needs: nothing
- Preflight (output: note): run `grep -rni definition src/ tests/ docs/` and enumerate every
  hit (193 known at plan time, incl. plural/capitalized forms and `min_10_definitions`);
  check Playwright specs and `docs/USAGE.md` / `docs/FILE_FORMATS.md` for definitions wording.
- Provides: slimmer `CmapDocument` schema (triples + layout only)
- Expected patches: 1

### Workstream: WS-E ribbon toolbar

- Owner: coder
- Needs: nothing
- Preflight (output: note): confirm the repo-wide ASCII/lint gates' exclusion mechanism and
  whether `vendor/` needs an allowlist entry; confirm esbuild/dev-server serves `vendor/`
  paths in dev as well as in `dist/`.
- Provides: vendored Font Awesome assets + ribbon CSS pattern
- Expected patches: 1-2 (vendoring may be its own patch)

## Work packages

### Work package: WP-A1 verb width, stable add-row, chain button

- Owner: coder
- Touch points: `src/triple_row.tsx`, `src/triples_table.tsx`, `src/concept_autocomplete.tsx`,
  `src/style.css`
- Depends on: none
- Required behavior statement (give to coder verbatim):
  - Rows keep a constant height whether focused or blurred.
  - A single pointer action on "+ Add row" adds exactly one row.
  - Commit any typed-but-uncommitted autocomplete text synchronously BEFORE inserting the
    new row - call the exposed commit path directly; treat the 150 ms blur timeout as a
    fallback that may fire later, never as the mechanism this feature depends on.
  - The button stays in the same screen position while focus changes.
- Acceptance criteria:
  1. Verb column uses `minmax(~9em, ...)` (or equivalent) so "included" renders untruncated at
     the default pane width; from/to keep autocomplete behavior.
  2. Preview line moves out of the row into one fixed-height slot rendered below the rows list
     (always occupying its height; shows the focused row's sentence, empty otherwise). Rows
     never change height on focus/blur.
  3. Add-row sequence on `onPointerDown`: (a) synchronously commit the currently focused
     autocomplete draft via the exposed commit path, (b) insert the new row, (c) focus the new
     row's first input. Exactly one row per action.
  4. Chain button per row (after the delete x), `aria-label="Chain new row from this concept"`
     plus tooltip. Behavior:
     - `to` has a committed concept: insert a new row directly below with `from` = that
       concept; focus the verb input.
     - `to` has an uncommitted draft: commit the draft synchronously first, then chain.
     - `to` is blank: button disabled, tooltip "Add a points-to concept first."
- Verification commands: `npx tsc --noEmit -p tsconfig.json` (exit 0),
  `npx eslint src/triple_row.tsx src/triples_table.tsx src/concept_autocomplete.tsx` (exit 0),
  `bash run_playwright_tests.sh` (PASS)
- Playwright test (same patch): focus a to-cell, type a value, trigger Add row via pointer
  event BEFORE the 150 ms blur commit would fire, assert (a) typed value preserved in its
  cell, (b) row count +1. Second test: chain button disabled on blank `to`, enabled after
  typing, chained row's `from` equals previous `to`.
- Obvious follow-ons: update `docs/CHANGELOG.md`; adjust any Playwright selector that targeted
  `.triple-preview` inside rows

### Work package: WP-B1 three-color cell highlighting

- Owner: expert_coder
- Touch points: `src/app_state.ts`, `src/triple_row.tsx`, `src/concept_autocomplete.tsx`
  (focus/hover hooks only), `src/style.css`
- Depends on: WP-A1 (stable row markup, commit API)
- Active-concept transition rules (give to coder verbatim):
  - Focus enters a from/to cell: active concept = that cell's COMMITTED value (not draft
    keystrokes; updates when the value commits).
  - Hover enters a from/to cell while NO cell is focused: active concept = hovered cell's value.
  - Hover leaves while no cell is focused: active concept clears.
  - Focus leaves: active concept returns to the current hover target, else clears.
  - Focus always wins over hover while a cell is focused.
  - Empty cells never activate highlighting (blank value -> active concept stays/clears).
- Worked example (rows: honeybees->castes, castes->workers; active concept = "castes"):
  - All cells whose value is "castes" get `cell-same`.
  - In honeybees->castes (castes is the TO of that row), the honeybees cell gets `cell-from`.
  - In castes->workers (castes is the FROM of that row), the workers cell gets `cell-to`.
- Acceptance criteria:
  1. New state: `active_concept: Accessor<ConceptKey | null>` per the transition rules above.
  2. Per-cell classification memo implementing the worked example: build one keyed map per
     active-concept change in a single `createMemo`, and have each cell do one map lookup.
  3. Three distinct tints in CSS (reuse `--from-tint`/`--from-accent` family; add `--to-tint`,
     `--same-tint`); WCAG AA contrast for input text preserved.
  4. Existing row-level and map-pane highlighting keeps working (hovering map node still lights
     rows; new cell classes compose with `.triple-row.highlighted`).
- Verification commands: `npx tsc --noEmit -p tsconfig.json` (exit 0), `npx eslint src/`
  (exit 0), `bash run_playwright_tests.sh` (PASS)
- Playwright test (same patch): click a "castes" cell whose value is already committed;
  assert other castes cells carry `cell-same`, the partner cells carry `cell-from`/`cell-to`
  per the worked example; blur and assert classes clear. (Accepted UX caveat: while editing
  a cell, highlight reflects the old committed value until commit - matches stability goal.)
- Obvious follow-ons: `docs/CHANGELOG.md`; profile with `tests/fixtures/stress_80_nodes.json`
  (post-WS-D equivalent) for input lag

### Work package: WP-C1 draggable persisted pane resizer

- Owner: coder
- Touch points: `src/app.tsx`, `src/style.css` (own labeled section)
- Depends on: none
- Acceptance criteria:
  1. Vertical divider between `.editor-pane` and `.map-pane` drags with pointer events
     (`setPointerCapture`), updating `--editor-ratio` inline on `.main-area`; clamped 25%-65%;
     no text selection during drag (`user-select: none` while dragging).
  2. Ratio persists to localStorage (single namespaced key) and restores on load. Exact
     fallback rules: missing, non-numeric, or malformed values reset to 40%; numeric values
     below 25 or above 65 clamp to that bound; the corrected value is written back to
     localStorage immediately on load. Keyboard adjustment and double-click reset also write
     localStorage.
  3. Divider has `role="separator"`, `aria-orientation="vertical"`, `tabindex="0"`; arrow keys
     adjust by 2%; double-click resets to 40%.
  4. Map SVG re-renders correctly after resize via the existing resize path named in preflight.
- Verification commands: `npx tsc --noEmit -p tsconfig.json` (exit 0),
  `npx eslint src/app.tsx` (exit 0)
- Manual validation list (coder pastes per-item results into the patch description so the
  gate is auditable): drag left/right; reload persistence; double-click reset; arrow-key
  adjustment; text stays unselected during drag; map redraws after resize; corrupted
  localStorage value (hand-edited) falls back to 40%.
- Obvious follow-ons: `docs/CHANGELOG.md`

### Work package: WP-D1 remove definitions feature

- Owner: coder
- Touch points: `git rm src/definitions_table.tsx`; edit `src/types.ts`, `src/app_state.ts`,
  `src/document_codec.ts`, `src/validate_document.ts`, `src/app.tsx`, `src/style.css`
  (delete definition-table rules), `tests/test_app_state.mjs`, `tests/test_document_codec.mjs`,
  `tests/test_validate_document.mjs`, `tests/fixtures/honeybees_document.json`,
  `tests/fixtures/stress_80_nodes.json`, `docs/USAGE.md`, `docs/FILE_FORMATS.md`
- Depends on: none
- File-format decision (explicit): the document format consists of triples + layout only.
  Write and read exactly the new format. Match the stated decision to actual codec behavior:
  if the codec rejects unknown fields, add a Node test asserting a document containing
  `definitions` is rejected; if it ignores unknown fields, state in the changelog that old
  definitions are ignored and never round-tripped, and test that. Old local files failing to
  open is acceptable (unshipped). Update fixtures to the new format.
- Acceptance criteria:
  1. `Definition` type, `CmapDocument.definitions`, all definition state actions
     (`update_definition`, `add_definition`, `remove_definition`, `bulk_insert_definitions`),
     the definitions tab/panel, codec read/write of `definitions`, and the
     `min_10_definitions` rubric rule are gone.
  2. Reference sweep clean: `grep -rni definition src/ tests/ docs/` returns zero
     feature-related hits (covers Definition/definitions/Definitions/min_10_definitions and
     UI label text).
  3. Node tests and both fixtures updated to the new format; saving then reopening a project
     round-trips cleanly without a definitions field.
- Verification commands: `npx tsc --noEmit -p tsconfig.json` (exit 0), `npx eslint src/`
  (exit 0), `grep -rni definition src/ tests/ docs/` (zero feature hits),
  `node --test tests/test_document_codec.mjs tests/test_app_state.mjs tests/test_validate_document.mjs`
  (pass), `bash run_playwright_tests.sh` (PASS - incl. new test asserting definitions tab absent)
- Playwright test (same patch): assert the Definitions tab/button no longer exists in the app.
- Obvious follow-ons: `docs/CHANGELOG.md`; remove definitions wording from `docs/USAGE.md` and
  `docs/FILE_FORMATS.md` in this same patch

### Work package: WP-E1 vendor Font Awesome + ribbon toolbar

- Owner: coder
- Touch points: new `vendor/fontawesome/` (CSS + `fa-solid-900.woff2` + LICENSE),
  `src/index.html`, `build_github_pages.sh`, `src/toolbar.tsx`, `src/style.css` (own section)
- Depends on: none
- Asset strategy (explicit):
  1. Vendor the FULL Font Awesome Free solid woff2 (~150 KB) - no hand subsetting (avoids
     blank-glyph risk). Include Font Awesome's license file (`LICENSE.txt`: SIL OFL for fonts,
     CC BY 4.0 for icons, MIT for CSS) inside `vendor/fontawesome/`.
  2. `build_github_pages.sh` gains a vendor-copy step (it currently copies ONLY index.html and
     style.css) and a hard assertion: `test -f dist/vendor/fontawesome/fa-solid-900.woff2`
     before the success line - build fails if the font is missing.
  3. CSS `url(...)` font path must resolve in BOTH dev serving and `dist/` (relative path from
     the vendored CSS file).
  4. Add `vendor/` to ASCII/lint gate exclusions per WS-E preflight findings - handled in this
     patch, not discovered after CI fails.
- Button -> group -> icon mapping (use exactly these four existing semantic groups):
  | Group caption | Buttons | Icons |
  | --- | --- | --- |
  | File | Save project, Open project, Clear | `fa-floppy-disk`, `fa-folder-open`, `fa-trash-can` |
  | CSV | Export triples CSV, Import triples CSV | `fa-file-export`, `fa-file-import` |
  | Image and print | Export SVG, Export PNG, Print | `fa-vector-square`, `fa-image`, `fa-print` |
  | Layout | Re-layout | `fa-diagram-project` |
- Acceptance criteria:
  1. All icon assets load exclusively from `vendor/fontawesome/` (CSS, woff2, LICENSE),
     linked from `src/index.html`; build assertion passes;
     `grep -rni "cdn\|https://\|http://" src/ vendor/ build_github_pages.sh` returns only
     comment/license-text hits (docs/ excluded - public links allowed there).
  2. Toolbar restyled as a ribbon: the four existing groups become visible sections with
     separators and small group captions per the mapping table; icon + text per button.
  3. Every button keeps its text label and existing `aria-label`; icons are `aria-hidden="true"`.
  4. Clear stays visually danger-coded; autosave indicator and error banner untouched.
- Verification commands: `npx tsc --noEmit -p tsconfig.json` (exit 0),
  `npx eslint src/toolbar.tsx` (exit 0), `bash build_github_pages.sh` ("Built dist/" + vendor
  assertion), `bash run_playwright_tests.sh` (PASS), `pytest tests/` (pass - ASCII gate green
  with vendor exclusion)
- Playwright check (same patch): screenshot toolbar; assert each icon element renders with
  nonzero width; assert computed `font-family` on one icon resolves to Font Awesome; assert
  the network response for `vendor/fontawesome/fa-solid-900.woff2` is 200 (catches wrong CSS
  paths that the build assertion misses). Coder records actual woff2 file size in the patch
  description (escalate only if above ~300 KB).
- Obvious follow-ons: `docs/CHANGELOG.md`; update `docs/FILE_STRUCTURE.md` with `vendor/`

### Work package: WP-A2 commit-time column autosize (added 2026-06-12 after user design discussion)

- Owner: coder
- Touch points: `src/triples_table.tsx`, `src/triple_row.tsx` (only if cell markup needs a CSS var hook),
  `src/style.css` (triples grid section), optional small helper in `src/app_state.ts` or a local module
- Depends on: WP-B1 fixes + icon fix merged (file collisions)
- Context: verb phrases ("is a member of") rival concept lengths; concepts are <= 4 words but can
  contain long unbreakable acronyms. No static fraction scheme fits all documents, and live
  content-based sizing jitters during typing. User decision: content-based sizing applied at
  commit (blur/Enter), not per keystroke.
- Acceptance criteria:
  1. Each of the three text columns sizes to `clamp(6em, widest COMMITTED value in that column
     + cell padding, 45% of editor pane width)`. Measurement is pixel-based (hidden ruler span
     or canvas measureText using the cell font), so acronyms and any token length measure exactly.
  2. Recompute fires only on commit (and on row add/delete/import), and only updates a column's
     width when its max actually changed. Draft keystrokes never resize columns.
  3. Width changes animate with a ~150 ms transition; `+ Add row`, chain, and delete buttons
     remain clickable through a transition (no pointer-target jumps beyond the animated shift).
  4. A cell whose content exceeds the 45% cap ellipsizes visually (input scrolls on focus;
     full value in title attribute).
  5. Column widths always sum to <= pane width minus the fixed arrow/button columns; the pane
     resizer continues to work (columns re-clamp when pane width changes).
  6. Header columns track the same widths as body columns.
- Verification commands: `npx tsc --noEmit -p tsconfig.json` (exit 0), `npx eslint src/` (exit 0),
  `bash run_playwright_tests.sh` (PASS incl. one new test: commit a long verb phrase, assert the
  verb column widened and the from/to columns did not truncate below their floor)
- Obvious follow-ons: `docs/CHANGELOG.md`; remove the now-superseded static `minmax(9em, 1fr)`
  verb rule

## Acceptance criteria and gates

- Per-patch gate: `npx tsc --noEmit -p tsconfig.json` exit 0; `npx eslint src/` exit 0;
  behavior tests for the patch's feature included in the same patch; `docs/CHANGELOG.md`
  entry added.
- Integration gate: `bash check_codebase.sh` passes; `bash run_playwright_tests.sh` prints
  PASS; `pytest tests/` passes.
- Visual acceptance gate (agent-driven, before human review): a `playwright_operator`
  subagent drives the running app through the seven manual scenarios - verb readable,
  single-click add-row while focused (typed text preserved), chain button, three-color
  highlight, drag resizer (+ reload persistence), definitions tab absent, ribbon toolbar -
  capturing a screenshot per scenario into `output_smoke/`. An `image_evaluator` subagent
  then writes an assessment report per screenshot against the scenario's acceptance
  criteria (report filed under `docs/active_plans/reports/`).
- Manual review gate: human spot-check of the same seven scenarios using the
  `image_evaluator` report + screenshots as the starting point.

## Test and verification strategy

- TypeScript + eslint per patch (commands above).
- Behavior tests ship WITH the behavior: WP-A1, WP-B1, WP-D1, WP-E1 each include their
  Playwright additions in the same patch (listed per work package above). No deferred
  test-sweep patch for these. WP-C1 is manual-validated (drag interactions are brittle in CI);
  its manual list is part of the patch description.
- Node tests (`node --test tests/test_*.mjs`) updated inside WP-D1.
- `pytest tests/` (Python hygiene suite) must stay green; vendor exclusion handled in WP-E1.
- Per-milestone visual check: after M1 and after M2, dispatch `playwright_operator` to
  exercise the just-landed scenarios and screenshot them to `output_smoke/`, then
  `image_evaluator` to grade the screenshots against the work-package acceptance criteria.
  WP-C1's drag/persistence validation runs through `playwright_operator` (drag divider,
  reload, screenshot) instead of relying solely on human manual checks.

## Migration and compatibility policy

- Additive rollout: none needed; app unshipped.
- Backward compatibility: none promised; definitions field no longer read or written; old
  files containing it may fail to open - accepted by user decision.
- Legacy deletion criteria: definitions code, tests, fixtures, and docs wording deleted in
  WP-D1, same patch.
- Rollback strategy: each work package is one revertable patch.

## Risk register

| Risk | Impact | Trigger | Owner | Mitigation |
| --- | --- | --- | --- | --- |
| `style.css` merge conflicts across M1 lanes | rework | three lanes editing same file | manager | each lane edits only its own labeled CSS section; M2 runs after M1 merged |
| Pointer-down add-row races autocomplete commit, losing typed text | data loss | WP-A1 | coder | synchronous commit is acceptance criterion 3 + dedicated Playwright test |
| FA glyph missing at runtime | visual bug | WP-E1 | coder | vendor full solid woff2; Playwright nonzero-width icon assertion |
| Cell-highlight memo recomputes per keystroke across all rows | input lag | WP-B1 | expert_coder | active concept tracks committed values only; keyed-map memo; profile with 80-node fixture |
| ASCII/lint gate flags vendored CSS | CI red | WP-E1 | coder | preflight identifies exclusion mechanism; exclusion lands in same patch |
| Codec rejects old sample/fixture files post-removal | broken tests | WP-D1 | coder | fixtures updated in same patch; no external old files supported (user decision) |

## Rollout and release checklist

- [ ] M1 patches merged (WS-C, WS-D, WS-E), gates green
- [ ] M2 patches merged (WS-A then WS-B), gates green
- [ ] `bash check_codebase.sh`, `bash run_playwright_tests.sh`, `pytest tests/` pass on main
- [ ] `bash build_github_pages.sh` output verified incl. vendor font assertion
- [ ] Human visual acceptance of the seven manual scenarios

## Documentation close-out requirements

- Active plan / progress tracker: copy this plan to
  `docs/active_plans/active/ui_refinements_plan.md` at execution start; move to
  `docs/archive/` via `git mv` when closed
- docs/CHANGELOG.md entry: one bullet per patch (Patch 1..5/6), categorized; note the
  definitions-removal decision under Decisions and Failures
- Archive / closure notes: record that definitions were removed as out-of-scope by user
  decision with no migration (unshipped)

## Patch plan and reporting format

- Patch 1: WP-C1 resizer (+ manual validation list in description)
- Patch 2: WP-D1 definitions removal (+ Node test/fixture updates + docs wording + Playwright)
- Patch 3: WP-E1 Font Awesome vendoring + ribbon toolbar. If split: Patch 3a = vendored
  assets + LICENSE + build copy/assertion + ASCII exclusion; Patch 3b = toolbar markup + CSS
  + Playwright visual/runtime checks. Each half carries its own gates.
- Patch 4: WP-A1 table ergonomics (+ Playwright add-row/chain tests)
- Patch 5: WP-B1 cell color coding (+ Playwright highlight test)

## Open questions and decisions needed

- No user-decision blockers remain; all implementation clarifications from review are
  incorporated into the work-package acceptance criteria above. Icon glyphs fixed by the
  mapping table in WP-E1. If the vendored FA payload exceeds ~300 KB, WS-E owner reports back
  before committing assets.

## Execution addenda (2026-06-12)

Changes approved by the user after the plan was written but before close-out.

- WP-A2 (commit-time column autosize): already documented in the plan body under the
  WP-A2 work-package section added 2026-06-12 after user design discussion. No further
  addendum needed here.

- Corner-style presets built and removed same day. A four-preset "Corners" toolbar
  dropdown (Capsule/Oval/Rounded rect/Corner rect) was implemented with CSS tokens
  `--control-radius` and `--control-pad-x`, a `data-corners` attribute on `<html>`, and
  localStorage persistence. The user then clarified that the "Mac rounded rects" request
  targeted map node shapes, not UI chrome. The feature was removed in the same session:
  the dropdown, its supporting functions (`load_corner_style`, `save_corner_style`,
  `apply_corner_style`, `CORNER_STORAGE_KEY`, `corner_style` signal), and the
  Playwright spec `tests/playwright/corner_style.spec.ts` were all deleted. End state:
  UI controls are fixed at 5px rounded rects (`--control-radius: 5px`); the map-theme
  Shape picker gained a Capsule bubble shape (Rounded/Rectangle/Oval/Capsule) in
  `src/themes.ts` `SHAPE_REGISTRY` and `src/types.ts` `ThemeShape` union.

- Playwright walkthrough demo tool added at user request. New files:
  `tests/playwright/walkthrough_demo.mts`, `run_walkthrough_demo.sh`, and
  `tests/playwright/walkthrough_data/honeybees_triples.json` (8 honeybee triples).
  The demo reads a triples JSON dataset and drives the UI per-keystroke, using the
  chain button when consecutive triples share a concept. Records video and saves
  per-row and final-map screenshots to `output_smoke/walkthrough/`. Not a test spec;
  excluded from Playwright test collection.

- Two post-audit fix batches applied after a six-reviewer audit-code-reviewer run.
  Batch 1: dead "hint" severity removed from `ValidationItem.level` union and
  `level_marker()`; orphaned `id="panel-triples"` attribute removed; stale CSS comment
  corrected; fragile exact-count assertions in `tests/test_app_state.mjs` and
  `tests/test_derive_concepts.mjs` loosened to `>= N` behavioral forms; identity-equality
  tests on `PALETTES` array elements removed; `column_autosize.spec.ts` floor assertions
  tightened. Batch 2: three unit tests for `compute_cell_classification` added to
  `tests/test_app_state.mjs`; `column_autosize.spec.ts` floor assertion rewritten to
  compute the live 6em floor from header font-size and poll past the 150ms grid
  transition; redundant `waitForTimeout` calls removed across Playwright specs; bare
  backtick path for `src/measure_text.ts` converted to a Markdown link in
  `docs/CODE_ARCHITECTURE.md`.

- Final gate results at close-out: `check_codebase.sh` 6/6, Playwright 22/22,
  Node tests 165 passing, pytest 563 passing.
