# Plan: Concept Map Maker web app (SolidJS + TypeScript)

> **Note (2026-06-12):** The definitions feature was removed per user decision. All
> references to definitions below reflect the original plan scope and are now stale.
> The current data model (`src/types.ts`) contains only triples and layout; no
> `Definition` type or `definitions` field exists. `src/definitions_table.tsx` was
> deleted. The rubric no longer requires 10 definitions.

## Context

Students in life-science courses must build concept maps: bubbles holding a single 1-3 word
concept (noun), connected by directed arrows labeled with verb phrases (proposition pedagogy:
"concept maps --organize--> ideas"). Assignment rubric: minimum 30 bubbles. [Definitions requirement removed 2026-06-12.] Today there is no tool; this repo (freshly reset starter-template scaffold,
`REPO_TYPE=typescript`) will become a static browser-only web app deployed to GitHub Pages.
Students enter data in a spreadsheet-like triples table; the app auto-generates the SVG map.
A confirmed pain point: students struggle with From/To direction, so the editor must make
direction unmistakable (sentence-shaped rows, color-coded columns, cross-highlighting,
concept autocomplete so a bubble with many inputs/outputs reuses one exact spelling - see the
honeybees example where "Female" receives three "Gender" arrows).

Student-facing failure trace (what coders are fixing): students currently reverse From and To,
create duplicate bubbles through inconsistent spelling ("cell" vs "Cells"), and have no clean
way to submit. Correct behavior: a table row reads like a sentence, concept spelling is reused
via autocomplete and normalized keys, direction is visually reinforced in table and map, and
output exports as an image/file a grader can open.

User decisions already locked: triples-table input; auto-layout (dagre) plus drag-to-adjust;
exports = PNG/SVG image, JSON/CSV save-load, localStorage autosave, print page; bundler =
esbuild + esbuild-plugin-solid (not Vite); themes (bubble shape: rounded rect / sharp rect /
oval; color palettes: earth / fire) applied map-wide; bubbles colored by graph distance from
origin bubbles (origin = no incoming edges, only outgoing), origins visually emphasized.

## Objectives

- Students produce a rubric-compliant concept map (30+ bubbles) entirely in the browser with no install and no account. [Definitions requirement removed 2026-06-12.]
- Direction errors are rare: every affordance (headers, tints, preview sentence, hover highlight) reinforces From -> verb -> To.
- Work is portable and submittable: JSON/CSV file round-trip, PNG/SVG export, print, autosave.
- Repo gates stay green: `npx tsc --noEmit`, `check_codebase.sh`, node unit tests on all pure modules.

## Design philosophy

Pure-logic core, thin Solid shell: parsing, derivation, validation, layout, depth coloring, and
geometry are plain TypeScript modules with no Solid/DOM imports, unit-tested from node `.mjs`
tests; components only wire stores to SVG/HTML. This trades a little indirection for testability
and parallel build lanes (rejected alternative: components owning logic inline - faster day one,
untestable without a browser). Layout memo depends only on triples, never on drag overrides -
fixes the feedback-loop design rather than patching render glitches ("fix the design, not the
symptom").

## Scope

- Build the SolidJS app under `src/` (snake_case files): triples editor, SVG map canvas with drag, rubric panel, toolbar. [Definitions editor removed 2026-06-12.]
- Implement themes (3 bubble shapes, 2+ palettes) and depth-from-origin bubble coloring with origin emphasis.
- Implement exports: SVG, PNG, versioned JSON save/load, CSV import/export, localStorage autosave, print CSS.
- Stand up build tooling: `pipeline/build.mjs` (esbuild JS API + solid plugin + watch/serve), adapted `build_github_pages.sh`, tsconfig/eslint Solid deltas, package.json instantiation.
- Node unit tests for every pure module; Playwright tests for drag, paste, export, cross-highlight.

## Non-goals

- Use static browser storage and downloaded files only (backend, accounts, server storage are out).
- Ship v1 without undo/redo (single-store design leaves the hook open for later).
- Ship v1 as a single-document app: one autosave slot, one map per JSON file (collaboration and multi-map management are out).
- Keep grading limited to the live rubric checklist (no scoring or LMS integration).
- Target desktop/laptop pointer use with basic pointer-event correctness (touch-first UX is out).

## Current state summary

Repo is Neil's starter-template scaffold after `reset repo`: no `src/`, no `package.json` at
root. `templates/typescript/noexist/` holds canonical `package.json`, `tsconfig.json`,
`tsconfig.lint.json`, `build_github_pages.sh`, `run_web_server.sh`; `templates/typescript/`
holds `check_codebase.sh`, `eslint.config.js`, `.prettierrc`. These get instantiated at repo
root with Solid deltas. `docs/CHANGELOG.md` is empty. Python hygiene tests under `tests/`
already pass and stay untouched.

## Architecture boundaries and ownership

Data model (shared contract, `src/types.ts`):

```ts
interface Triple { id: string; from: string; verb: string; to: string }
// Definition interface removed 2026-06-12; definitions feature was removed.
type ConceptKey = string  // normalized: trim, collapse ws, lowercase; display = first casing
interface CmapDocument {
  format: "concept-map-maker"; version: 1; title: string;
  triples: Triple[];
  // definitions field removed 2026-06-12.
  overrides: Record<ConceptKey, {x: number; y: number}>;
  theme: { shape: "rounded" | "rect" | "oval"; palette: "earth" | "fire" };
}
```

Reactive design: one `createStore<CmapDocument>` (autosave unit) + `createSignal<HoverState>`.
Derivation chain of memos: `concepts` (derive from triples, first-casing-wins, adjacency) ->
`depths` -> `validation`. Layout contract (operative instruction): compute `layout_by_key`
from triples only (dagre, `acyclicer: "greedy"`); compute render position as
`position_by_key(key) = overrides[key] ?? layout_by_key[key]` at render-position resolution;
harness-test that a drag-override change does not invoke the layout function. Bubble fill =
palette ramp indexed by depth; origin bubbles get emphasis (thicker border / saturated ramp
start). Cross-highlight derived from HoverState in both directions with role-tagged colors
(From tint / To tint shared between table columns and map highlight).

Resolved semantics (source-of-truth decisions, settled before dispatch; design choices, not user
requirements unless noted):

- Origin rule: origin = concept with in-degree 0 AND out-degree > 0. Isolated concepts
  (degree 0) are orphans (validation warning), never origin-emphasized. Encoded in
  `graph_depth.ts` tests.
- Empty rows: fully blank rows ignored everywhere; partially filled rows (missing from/verb/to)
  excluded from graph derivation and flagged as a validation warning.
- CSV scope: CSV import/export covers the triples table only (header
  `this concept,verb phrase,points to this concept`). JSON is the full project save format
  (triples + overrides + theme + title).
- Definitions linkage: [removed 2026-06-12; definitions feature was removed entirely.]
- Autosave: single localStorage slot. Opening a JSON file replaces the working document and the
  autosave slot immediately; toolbar shows current document title so the active document is
  visible.
- Override rename edge: overrides keyed by normalized concept key; renaming a concept resets
  that bubble position (intentional, tested, noted in usage docs). Orphaned keys pruned on save.
- Export extent: `effective_extent()` in pure module `src/map_bounds.ts` computes bounds from
  rendered positions (layout merged with drag overrides) plus node dimensions and label bounds;
  it is the single source for SVG viewBox, PNG raster bounds, and print sizing.
- Rubric unit: the 30-bubble rule is "at least 30 unique concepts" - normalized duplicates
  count once.
- Definitions-word check: [removed 2026-06-12; definitions feature was removed entirely.]
- Palette ramps clamp at 6 depth levels (no cycling - distant nodes must not look shallow);
  encoded in `themes.ts` tests.
- Accessibility: From/To direction cues never rely on color alone - headers, arrow glyphs, and
  the proposition preview carry the same information as the tints. Toolbar buttons, form
  controls, and SVG nodes carry usable labels (text or aria-label); no unlabeled icon buttons.
- Storage resilience: when localStorage is unavailable or over quota, the app runs normally
  with autosave disabled and shows a non-blocking notice.

Pure modules (no Solid, node-testable): `types.ts`, `derive_concepts.ts`, `graph_depth.ts`,
`validate_document.ts`, `csv_codec.ts` (hand-rolled RFC4180 + TSV paste), `document_codec.ts`
(versioned JSON), `layout_graph.ts` (dagre adapter, char-width node sizing), `edge_geometry.ts`
(boundary clipping per shape: rounded rect / rect / ellipse; bezier control points;
bidirectional-pair bowing; self-loop arcs; label anchor).

Solid components: `app_state.ts` (only stateful module), `main.tsx`, `app.tsx`, `toolbar.tsx`,
`triples_table.tsx`, `triple_row.tsx`, `concept_autocomplete.tsx`,
`map_canvas.tsx`, `concept_node.tsx`, `concept_edge.tsx`, `rubric_panel.tsx`,
`theme_picker.tsx`. [`definitions_table.tsx` removed 2026-06-12.] Dependency direction: components -> app_state -> pure modules -> types.

Export pipeline: all SVG presentation inline (attributes, web-safe font stack), so export =
clear hover, clone `<svg>`, strip interaction attrs and pan/zoom transform, set viewBox from
`effective_extent()` (pure `src/map_bounds.ts` helper: layout merged with drag overrides +
node dimensions + label bounds), serialize; PNG = SVG blob -> Image -> canvas at 2x -> toBlob
(explicit width/height attrs for Safari; raster cap ~8000px).

### Mapping (milestones / workstreams -> components / patches)

| Milestone / Workstream | Component | Expected patches |
| --- | --- | --- |
| M1 / WS-D tooling | pipeline/build.mjs, build_github_pages.sh, package.json, tsconfig, eslint | 1 |
| M1 / WS-A core | types + document_codec; derive_concepts; graph_depth; validate_document; csv_codec (each + tests) | 5 |
| M1 / WS-C pure | layout_graph; edge_geometry; themes/palettes (each + tests) | 3 |
| M2 / WS-B editor | app_state; app shell; triples_table/triple_row; autocomplete; definitions_table; paste wiring | 5 |
| M2 / WS-C canvas | map_canvas + concept_edge; concept_node + drag + depth fill + theme_picker | 2 |
| M3 / WS-B polish | cross-highlight; rubric_panel | 2 |
| M3 / WS-D export | export_svg + PNG; toolbar (JSON, CSV, export/print, re-layout); print CSS; Playwright; deploy + docs | 8 |

## Milestone plan

| M | Title | Summary | Goal |
| --- | --- | --- | --- |
| M1 | Skeleton and data core | Build tooling compiles a hello-world Solid app; all pure data modules written and unit-tested | Proven foundation both lanes build on |
| M2 | Editor and map | Triples/definitions editing works; map renders with dagre layout, themes, depth colors, drag | Student can build and see a map |
| M3 | Direction aids, export, verify | Cross-highlight, rubric panel, all exports, print, Playwright, Pages deploy | Assignment-ready, submittable output |

### Milestone: M1 skeleton and data core

- Depends on: none
- Workstreams: WS-D (tooling), WS-A (pure core)
- Entry criteria: none
- Exit criteria: `bash build_github_pages.sh` produces working dist/; `check_codebase.sh` green; node tests pass for codec/derive/depth/validate modules. Obvious follow-ons: fix any eslint/tsc fallout from Solid deltas; record `docs/CHANGELOG.md` entry; verify esbuild-plugin-solid peer range against pinned esbuild (fallback: 30-line inline babel plugin).
- Parallel-plan ready: yes (D1 and A1 start concurrently; A2/A3 fan out after A1)

### Milestone: M2 editor and map

- Depends on: M1 exit (WP-D1, WP-A1..A3) - shared types and build loop required
- Workstreams: WS-B (editor UI), WS-C (canvas)
- Entry criteria: M1 exit criteria met
- Exit criteria: type 3 triples -> bubbles appear, auto-layout, drag persists across unrelated edits; theme switch restyles all bubbles; depth coloring visible; paste 30-row TSV from a real spreadsheet works. Obvious follow-ons: tune dagre ranksep/nodesep for 30+ nodes; changelog entry.
- Parallel-plan ready: yes (WS-B and WS-C are independent lanes; C1 is pure and can even start during M1)

### Milestone: M3 direction aids, export, verify

- Depends on: M2 exit - highlight and export need live canvas + editor
- Workstreams: WS-B (polish), WS-D (export + verification)
- Entry criteria: M2 exit criteria met
- Exit criteria: row hover highlights edge + both bubbles in From/To colors and vice versa; rubric panel live-updates all rules; SVG/PNG/JSON/CSV/print all produce correct artifacts; Playwright suite green; deployed to GitHub Pages and loads. Obvious follow-ons: README first paragraph (About text), `docs/USAGE.md`, changelog, archive plan.
- Parallel-plan ready: yes (B3/B4 vs D2/D3 independent until D3 integration)

## Workstream breakdown

Two concurrency styles:

- Pure-core phase (waves 0-1): aggressive parallel dispatch. Packages are file-disjoint with
  isolated tests.
- UI/integration phase (waves 2-5): narrower sequencing around shared files with explicit
  ownership. WP-B1b owns `style.css` (tints, layout, print hooks); WP-B2a owns wiring the
  autocomplete component into rows (WP-B2b builds it standalone); WP-C2a owns the SVG canvas
  contract (stable svg ref + node/edge render slots) that WP-C2b and export consume. WP-B3 and
  the WP-D2b* toolbar packages are integration patches that edit already-built files and run
  only after their owners finish.

Dispatch a package in parallel only when all three are yes: (1) it edits files no concurrent
package edits; (2) it consumes a stable interface that already exists (types.ts, app_state
actions, themes tokens, canvas contract, fixtures); (3) it has an independent verification step.
Otherwise wait, split, or assign to the integration owner. Maximum useful concurrency: 2 at
start, 7 in wave 1, 3-5 through the UI waves.

### Workstream: WS-A pure core

- Owner: coder (one coder per package; packages are independent after A1)
- Needs: nothing (greenfield)
- Provides: types contract, codecs, derivation, depth, validation - everything testable headless
- Expected patches: 5 (one per package)

### Workstream: WS-B editor UI

- Owner: coder per package
- Needs: WS-A contracts, WS-D build loop, app_state (B1a)
- Provides: stores, app shell, spreadsheet editing UX, rubric panel, cross-highlight
- Expected patches: 8 (B1a, B1b, B2a, B2b, B2c, B2d, B3, B4)

### Workstream: WS-C map canvas

- Owner: expert_coder (geometry + drag + reactivity interplay is design-sensitive); C1c may be coder
- Needs: WS-A types; app_state (B1a) for the component packages
- Provides: layout adapter, edge geometry, themes/palettes, SVG canvas, nodes/edges, drag
- Expected patches: 5

### Workstream: WS-D tooling and export

- Owner: coder per package
- Needs: nothing for D1; canvas packages for D2a
- Provides: build pipeline, exports, print, Playwright verification
- Expected patches: 9 (D1, D2a, D2b1, D2b2, D2b3, D2b4, D2c, D3a, D3b)

## Work packages

Wave 0 (ready at start, zero dependencies, run concurrently): D1, A1.
Wave 1 (after A1 only; file-disjoint, fully parallel): A2a, A2b, A2c, A3, C1a, C1b, C1c.
Wave 2: B1a, B1b (B1b needs only D1 and may start during wave 1).
Wave 3 (parallel with explicit owners): B2a, B2b, B2c, C2a, C2b.
Wave 4 (parallel, file ownership clarified): B2d, B4, D2a, D2b1, D2c.
Wave 5 (integration): B3, D2b2, D2b3, D2b4, then D3a, D3b.

### Work package: WP-D1 build tooling bootstrap

- Owner: coder
- Touch points: `pipeline/build.mjs` (esbuild JS API + solidPlugin + `--watch` context/serve mode + asset copy + `.nojekyll`), root `package.json`/`tsconfig.json`/`tsconfig.lint.json`/`eslint.config.js`/`.prettierrc` instantiated from `templates/typescript/` with deltas (`jsx: "preserve"`, `jsxImportSource: "solid-js"`, tsx globs, eslint-plugin-solid), `build_github_pages.sh` adapted (accept `src/main.tsx`, call `node pipeline/build.mjs`), hello-world `src/main.tsx` + `src/index.html` + `src/style.css`. Deps: solid-js, @dagrejs/dagre, esbuild-plugin-solid, @babel/core, babel-preset-solid, @babel/preset-typescript, eslint-plugin-solid.
- Depends on: none
- Acceptance criteria: dist/ builds, hello-world renders, `check_codebase.sh` green.
- Verification commands: `bash build_github_pages.sh && bash check_codebase.sh`
- Obvious follow-ons: run the full gate after Solid config changes and update configs until tsc, eslint, prettier, and node tests all pass; stage package-lock.json; changelog; record esbuild-plugin-solid peer-range compatibility result (or switch to the inline babel plugin fallback).

### Work package: WP-A1 shared contract and document codec

- Owner: expert_coder (contract everything depends on)
- Touch points: `src/types.ts` (all types incl. theme + `concept_key()`), `src/document_codec.ts` (versioned JSON validate/migrate, `empty_document()`, override pruning), `tests/test_concept_key.mjs`, `tests/test_document_codec.mjs`
- Depends on: none
- Acceptance criteria: round-trip JSON, garbage input rejected loudly, version gate works. Also ships shared fixtures used by every later package: `tests/fixtures/honeybees_triples.tsv`, `tests/fixtures/honeybees_document.json` (from the honeybees example: Castes 3 outputs, Female 3 inputs), and `tests/fixtures/stress_80_nodes.json` (deterministic mixed-shape 80-node document: several origins, branches, converging nodes, one cycle, one bidirectional pair, several long labels - for layout/perf checks).
- Verification commands: `node --import tsx --test tests/test_concept_key.mjs tests/test_document_codec.mjs`
- Obvious follow-ons: announce contract frozen to all lanes; changelog.

### Work package: WP-A2a concept derivation

- Owner: coder
- Touch points: `src/derive_concepts.ts` (unique keys, first-casing-wins, adjacency, ordering stability; blank rows ignored, partial rows excluded), `tests/test_derive_concepts.mjs`
- Depends on: WP-A1
- Acceptance criteria: honeybees fixture derives correctly (Female 3 incoming); blank/partial-row semantics covered by tests.
- Verification commands: `node --import tsx --test tests/test_derive_concepts.mjs`
- Obvious follow-ons: changelog.

### Work package: WP-A2b graph depth

- Owner: coder
- Touch points: `src/graph_depth.ts` (origin = in-degree 0 AND out-degree > 0; isolated concepts excluded from origins; BFS depth; cycles/unreachable -> fallback depth; no origins -> all depth 0; flags origin set), `tests/test_graph_depth.mjs`
- Depends on: WP-A1
- Acceptance criteria: honeybees depths correct; cycle fixture does not throw; origin rule incl. isolated-concept exclusion tested.
- Verification commands: `node --import tsx --test tests/test_graph_depth.mjs`
- Obvious follow-ons: changelog.

### Work package: WP-A2c validation rules

- Owner: coder
- Touch points: `src/validate_document.ts` (rule "at least 30 unique concepts" - normalized duplicates count once; every arrow has verb; <=3-word labels warn; orphans; partial rows; duplicate triples; self-loops; near-miss spellings edit-distance 1), `tests/test_validate_document.mjs`
  [Definitions-related rules (min 10 definitions, defined word absent hint) removed 2026-06-12.]
- Depends on: WP-A1
- Acceptance criteria: each rule has fixture coverage across its severity levels (pass/warn/fail/hint).
- Verification commands: `node --import tsx --test tests/test_validate_document.mjs`
- Obvious follow-ons: changelog.

### Work package: WP-A3 CSV/TSV codec

- Owner: coder
- Touch points: `src/csv_codec.ts` (RFC4180 parse/serialize, quoted fields, CRLF, BOM, TSV-first paste detection, fuzzy header match), `tests/test_csv_codec.mjs`
- Depends on: WP-A1
- Acceptance criteria: Excel/Sheets paste fixtures (incl. quoted newlines) round-trip.
- Verification commands: `node --import tsx --test tests/test_csv_codec.mjs`
- Obvious follow-ons: changelog.

### Work package: WP-C1a dagre layout adapter

- Owner: expert_coder
- Touch points: `src/layout_graph.ts` (dagre top-down, `acyclicer: "greedy"`, char-width node sizing, deterministic, canvas extent), `tests/test_layout_graph.mjs`
- Depends on: WP-A1
- Acceptance criteria: deterministic coords; 80-node and cycle fixtures pass.
- Verification commands: `node --import tsx --test tests/test_layout_graph.mjs`
- Obvious follow-ons: changelog.

### Work package: WP-C1b edge geometry

- Owner: expert_coder
- Touch points: `src/edge_geometry.ts` (boundary clipping for rounded/rect/oval shapes, cubic bezier, bidirectional bowing, duplicate fan, self-loops, label anchor t=0.5), `src/map_bounds.ts` (`effective_extent()` pure helper: layout + overrides + node dims + label bounds), `tests/test_edge_geometry.mjs`, `tests/test_map_bounds.mjs`
- Depends on: WP-A1
- Acceptance criteria: clipping correct per shape; bidirectional pairs bow apart; self-loop path valid; effective_extent includes a far-dragged override in bounds.
- Verification commands: `node --import tsx --test tests/test_edge_geometry.mjs tests/test_map_bounds.mjs`
- Obvious follow-ons: changelog.

### Work package: WP-C1c themes and palettes

- Owner: coder
- Touch points: `src/themes.ts` (shape registry, earth/fire depth ramps clamped at 6 levels, origin-emphasis style constants), `tests/test_themes.mjs`
- Depends on: WP-A1
- Acceptance criteria: ramp lookup total (any depth -> color); both palettes ship ordered ramps.
- Verification commands: `node --import tsx --test tests/test_themes.mjs`
- Obvious follow-ons: changelog.

### Work package: WP-B1a reactive state

- Owner: expert_coder (memo chain + override model is the design heart)
- Touch points: `src/app_state.ts` (createStore doc + HoverState signal + memos: concepts, depths, validation, layout (triples-only dep), highlight maps; 500ms-debounced localStorage autosave + boot load)
- Depends on: WP-A1, WP-A2a, WP-A2b, WP-A2c, WP-C1a
- Acceptance criteria: behavior tests (node `.mjs` where headless-testable, else a small demo harness) prove: layout recomputes after a triple change, does NOT recompute after a drag override or hover change, autosave loads valid stored JSON and safely rejects invalid stored JSON (falls back to empty document); when localStorage is unavailable or throws on write, the app runs with autosave disabled and surfaces a non-blocking notice.
- Verification commands: `node --import tsx --test tests/test_app_state.mjs` (extract memo logic into testable functions where DOM-free); `bash check_codebase.sh`
- Obvious follow-ons: announce state API to component lanes; changelog.

### Work package: WP-B1b app shell

- Owner: coder
- Touch points: `src/main.tsx` (replace hello-world), `src/app.tsx` (toolbar / editor pane with tabs / map pane / rubric panel layout, placeholder slots), `src/style.css` base layout + From/To tint custom properties
- Depends on: WP-D1
- Acceptance criteria: shell renders all panes with placeholders; tints defined once in CSS vars.
- Verification commands: `bash check_codebase.sh`; visual via `node pipeline/build.mjs --watch`.
- Obvious follow-ons: changelog.

### Work package: WP-B2a triples table

- Owner: coder
- Touch points: `src/triples_table.tsx`, `src/triple_row.tsx` (sentence headers "This concept | verb phrase | points to this concept", From/To tinted cells, arrow glyphs, focused-row proposition preview, tab/enter nav, add/delete rows)
- Depends on: WP-B1a, WP-B1b
- Acceptance criteria: editing triples updates derived concept count live.
- Verification commands: `bash check_codebase.sh`; manual edit check.
- Obvious follow-ons: changelog.

### Work package: WP-B2b concept autocomplete

- Owner: coder
- Touch points: `src/concept_autocomplete.tsx` (standalone component: filter dropdown over concepts(); ArrowUp/Down moves selection, Enter/Tab commits highlighted match, Escape closes and keeps typed text, blur commits typed text as-is; committing text whose normalized key matches an existing concept snaps to canonical casing with transient "matched existing concept" hint; free text always allowed)
- Depends on: WP-B1a (WP-B2a owns wiring it into triple_row cells)
- Acceptance criteria: keyboard behavior above works; typing existing concept reuses bubble (same normalized key); new text creates concept.
- Verification commands: `bash check_codebase.sh`; keyboard cases (arrow/enter/tab/escape/blur) are explicit specs in WP-D3a Playwright.
- Obvious follow-ons: wire into triple_row cells; changelog.

### Work package: WP-B2c definitions table [removed 2026-06-12]

- **This work package is obsolete.** `src/definitions_table.tsx` was deleted; the
  definitions feature was removed per user decision on 2026-06-12.
- Original owner: coder
- Original touch points: `src/definitions_table.tsx` (word/definition grid, paste support)

### Work package: WP-B2d spreadsheet paste import

- Owner: coder
- Touch points: paste handler in `src/triples_table.tsx` wiring `csv_codec.parse_table_text` into bulk row insert at focus.
  [`src/definitions_table.tsx` paste handler removed 2026-06-12 with the definitions feature.]
- Depends on: WP-A3, WP-B2a
- Acceptance criteria: pasting 30-row TSV from real spreadsheet creates 30 rows.
- Verification commands: `bash check_codebase.sh`; manual paste from Google Sheets.
- Obvious follow-ons: changelog.

### Work package: WP-C2a canvas and edges

- Owner: expert_coder
- Touch points: `src/map_canvas.tsx` (SVG root exposing a stable svg ref and node/edge render slots - the canvas contract C2b and export consume; wheel-zoom + drag-pan on background, double-click resets view, pan/zoom state is ephemeral and not saved; marker defs incl. highlight marker), `src/concept_edge.tsx` (bezier path, arrowhead, verb label with `paint-order: stroke` halo)
- Depends on: WP-C1a, WP-C1b, WP-B1a
- Acceptance criteria: edges render from layout + geometry; labels legible; pan/zoom/reset behave as specified; presentation inline-attribute.
- Verification commands: `bash check_codebase.sh`; visual check.
- Obvious follow-ons: changelog.

### Work package: WP-C2b nodes, drag, theme picker

- Owner: expert_coder
- Touch points: `src/concept_node.tsx` (shape per theme, depth-ramp fill, origin emphasis, pointer-capture drag writing overrides), `src/theme_picker.tsx`
- Depends on: WP-C1c, WP-B1a (renders inside C2a canvas; file-disjoint, integrates via For slot)
- Acceptance criteria: drag persists across unrelated row edits; theme switch restyles all bubbles; origins emphasized. Drag pointer contract: pointerdown captures the pointer, pointermove updates the override, pointerup releases capture, loss of pointer capture ends the drag safely.
- Verification commands: `bash check_codebase.sh`; manual drag/theme check with honeybees fixture; write `tests/playwright/smoke.spec.ts` (load app, enter three triples, see three bubbles, drag one) so the basic interactive path is protected before export and toolbar waves.
- Obvious follow-ons: tune dagre ranksep/nodesep against honeybees and stress_80_nodes fixtures and record chosen constants in layout_graph.ts tests or comments; changelog.

### Work package: WP-B3 cross-highlight wiring (integration patch)

- Owner: expert_coder (touches row, node, edge, state, and CSS behavior across five files)
- Touch points: highlight class bindings in `src/triple_row.tsx`, `src/concept_node.tsx`, `src/concept_edge.tsx` consuming app_state highlight memos; role-tagged From/To colors via the B1b CSS custom properties
- Depends on: WP-B2a, WP-C2a, WP-C2b (sequenced after - edits files those packages own; runs alone in its wave for these files)
- Acceptance criteria: row hover -> edge + both bubbles tinted in column colors; bubble hover -> all referencing rows highlighted.
- Verification commands: `bash check_codebase.sh`; Playwright covers in WP-D3.
- Obvious follow-ons: changelog.

### Work package: WP-B4 rubric panel

- Owner: coder
- Touch points: `src/rubric_panel.tsx` (live checklist from validation memo, click item flashes offenders via HoverState)
- Depends on: WP-A2c, WP-B1a, WP-B1b
- Acceptance criteria: all rubric rules update live; pass/warn/fail visually distinct.
- Verification commands: `bash check_codebase.sh`
- Obvious follow-ons: changelog.

### Work package: WP-D2a image export

- Owner: coder
- Touch points: `src/export_svg.ts`. Steps to implement: (1) clear hover state and let reactivity settle; (2) clone the canvas svg via the C2a ref; (3) remove interactive classes, data-* attributes, and pointer handlers from the clone; (4) set viewBox/width/height from `map_bounds.effective_extent()` (built and tested in WP-C1b); (5) serialize with xmlns headers. PNG: SVG blob -> Image -> canvas at 2x devicePixelRatio -> toBlob (explicit width/height attrs for Safari, 8000px raster cap).
- Depends on: WP-C2a, WP-C2b, WP-C1b
- Acceptance criteria: exported SVG of a map with dragged bubbles opens standalone with all bubbles inside bounds and neutral (non-hover) styling; PNG non-empty at 2x.
- Verification commands: `bash check_codebase.sh`; manual export of honeybees fixture after dragging one bubble far out.
- Obvious follow-ons: changelog.

### Work package: WP-D2b1 JSON open/save and clear

- Owner: coder (owns `src/toolbar.tsx` from this package onward; D2b2-D2b4 extend it sequentially)
- Touch points: `src/toolbar.tsx` (document title display, "Save project"/"Open project" JSON buttons via document_codec, clear-document with confirm; opening a file replaces working document and autosave slot immediately)
- Depends on: WP-B1a, WP-B1b
- Acceptance criteria: save then open round-trips a document; title updates; invalid JSON shows clear error and leaves current document intact.
- Verification commands: `bash check_codebase.sh`; manual round-trip with honeybees fixture.
- Obvious follow-ons: changelog.

### Work package: WP-D2b2 CSV import/export

- Owner: coder
- Touch points: `src/toolbar.tsx` (buttons labeled "Export triples CSV" / "Import triples CSV" via csv_codec - labels must not imply CSV is a full project save)
- Depends on: WP-A3, WP-D2b1
- Acceptance criteria: exported CSV re-imports to identical triples; opens in Excel/Sheets.
- Verification commands: `bash check_codebase.sh`; manual CSV round-trip.
- Obvious follow-ons: changelog.

### Work package: WP-D2b3 export and print buttons

- Owner: coder
- Touch points: `src/toolbar.tsx` (SVG/PNG buttons calling export_svg.ts, print button)
- Depends on: WP-D2a, WP-D2b1, WP-D2c
- Acceptance criteria: each button produces the expected file type (verify SVG well-formed, PNG non-empty, print preview opens).
- Verification commands: `bash check_codebase.sh`; manual one export per button.
- Obvious follow-ons: changelog.

### Work package: WP-D2b4 re-layout button

- Owner: coder
- Touch points: `src/toolbar.tsx` (re-layout button: confirm dialog, then clear all overrides so positions return to pure dagre layout)
- Depends on: WP-D2b1, WP-C2b
- Acceptance criteria: after confirm, all dragged bubbles snap back to auto-layout; cancel preserves overrides.
- Verification commands: `bash check_codebase.sh`; manual drag-then-relayout check.
- Obvious follow-ons: changelog.

### Work package: WP-D2c print stylesheet

- Owner: coder
- Touch points: `@media print` rules in `src/style.css` (map only, hide editor/toolbar)
  [Definitions table removed from print scope 2026-06-12.]
- Depends on: WP-B1b
- Acceptance criteria: browser print preview shows the map cleanly.
- Verification commands: manual print preview; `bash check_codebase.sh`
- Obvious follow-ons: changelog.

### Work package: WP-D3a Playwright suite

- Owner: tester
- Touch points: `tests/playwright/*.spec.ts` (paste 30-row TSV -> 30 bubbles; bidirectional hover highlight; drag persistence across unrelated edit; export downloads well-formed; autosave reload; print smoke; 80-node stress fixture renders and stays interactive)
- Depends on: WP-B2d, WP-B3, WP-B4, WP-D2a, WP-D2b3, WP-D2c
- Acceptance criteria: Playwright green locally against the local server.
- Verification commands: `bash run_web_server.sh` + `npm run test:playwright`; `bash check_codebase.sh`
- Obvious follow-ons: changelog.

### Work package: WP-D3b deploy verification and docs close-out

- Owner: coder (GitHub Pages settings may need the human; report if blocked)
- Touch points: GitHub Pages deploy verification, README first paragraph (About text), `docs/USAGE.md`
- Depends on: WP-D3a
- Acceptance criteria: code is ready for Pages deployment (dist/ builds, .nojekyll present); when Pages settings allow, deployed page loads cold and round-trips a saved JSON. If user-controlled settings block verification, report the exact setting or permission needed - deployment verification is not a blocker for code completion. Docs written.
- Verification commands: open deployed URL, load honeybees JSON, export PNG (or report blocked setting).
- Obvious follow-ons: changelog; archive plan via `git mv` to `docs/archive/`.

## Acceptance criteria and gates

- Per-patch gate: `bash check_codebase.sh` (tsc, tsc lint config, eslint --max-warnings 0, prettier, node tests) green; new pure modules ship with their `.mjs` tests in the same patch.
- Integration gate (per milestone exit): criteria listed in each milestone; M2 manual smoke = build honeybees map (10 bubbles) end-to-end.
- Manual review gate: human reviews staged work and commits (agents never `git commit`); `docs/CHANGELOG.md` updated per patch.

## Test and verification strategy

- Unit (node `.mjs` via `node --import tsx --test`): concept_key normalization, derive/adjacency, BFS depth (origins, cycles, no-origin fallback), every validation rule, CSV/TSV round-trip incl. Excel quirks, layout determinism, edge clipping per shape.
- Integration: `check_codebase.sh` full gate per patch.
- System (Playwright): paste, drag-persist, bidirectional highlight, exports, autosave, print smoke.
- Failure semantics: red gate blocks the patch; M3 cannot start with M2 manual smoke failing.

## Migration and compatibility policy

- Additive rollout: greenfield; `CmapDocument.version: 1` from day one, loader rejects unknown versions with a clear message (future migrations live in `document_codec.ts`).
- Backward compatibility: saved v1 JSON files must load in all future versions.
- Legacy deletion criteria: none (nothing legacy exists).
- Rollback strategy: static site; rolling back = redeploying previous dist/. Student data lives in their files/localStorage, unaffected.

## Risk register

| Risk | Impact | Trigger | Owner | Mitigation |
| --- | --- | --- | --- | --- |
| esbuild-plugin-solid lags template esbuild >=0.28 | Build blocked | WP-D1 install | WS-D | Verify day one; fallback 30-line inline babel-preset-solid esbuild plugin |
| dagre misbehaves on student-made cycles | Bad/crashed layout | Cycle fixture | WS-C | `acyclicer: "greedy"` set explicitly; cycle test in WP-C1; elkjs fallback |
| 30-80 node maps illegible | Pedagogy fails | M2 smoke | WS-C | ranksep/nodesep tuning, pan/zoom, drag overrides, re-layout button |
| Excel paste edge cases (quoted newlines, BOM) | Data loss on import | WP-A3 fixtures | WS-A | RFC4180 parser with fixture suite, TSV-first detection |
| PNG export browser quirks (Safari sizing, canvas limits) | Submission blocked | WP-D2 testing | WS-D | Explicit width/height attrs, 8000px cap, SVG export as fallback path |
| Near-miss concept spellings split bubbles | Confusing maps | Student use | WS-A | Normalized keys + autocomplete + edit-distance-1 validation warning |
| Color-only direction cues fail colorblind students | Pain point unsolved for some | Accessibility check | WS-B | Headers, arrow glyphs, and proposition preview carry direction without color |
| SVG perf degrades at 80 nodes (hover, drag, labels) | Sluggish UX on large maps | stress_80_nodes fixture | WS-C | Fine-grained Solid updates (per-node memos); Playwright stress check in WP-D3a before M3 exit |

## Rollout and release checklist

- [ ] M1 exit: build + gate green, core tests pass
- [ ] M2 exit: honeybees fixture builds interactively; themes + depth colors work
- [ ] M3 exit: Playwright green; all exports verified by hand once
- [ ] GitHub Pages serves dist/; page loads cold and round-trips a saved JSON
- [ ] README first paragraph + docs/USAGE.md written; CHANGELOG current
- [ ] Human commits and pushes (agents stage only)

## Documentation close-out requirements

- Active plan / progress tracker: copy this plan to `docs/active_plans/active/concept_map_maker_plan.md`; check off work packages as patches land.
- docs/CHANGELOG.md entry: one bullet per patch under the day block, categorized per REPO_STYLE.
- Archive / closure notes: on M3 exit, `git mv` the active plan to `docs/archive/`.

## Patch plan and reporting format

One patch per work package, labeled by package ID. Wave order (concurrent within a wave, per
the ownership rules in Workstream breakdown):

- Wave 0: Patch 1 [tooling] WP-D1; Patch 2 [core contract + fixtures] WP-A1
- Wave 1 (7 parallel): Patches 3-9 [pure core] WP-A2a, WP-A2b, WP-A2c, WP-A3, WP-C1a, WP-C1b, WP-C1c
- Wave 2: Patch 10 [state] WP-B1a; Patch 11 [shell] WP-B1b
- Wave 3 (parallel, owned files): Patches 12-16 WP-B2a, WP-B2b, WP-B2c, WP-C2a, WP-C2b
- Wave 4 (parallel): Patches 17-21 WP-B2d, WP-B4, WP-D2a, WP-D2b1, WP-D2c
- Wave 5 (integration): Patches 22-25 WP-B3, WP-D2b2, WP-D2b3, WP-D2b4
- Patch N: tests, deploy, docs (WP-D3a Playwright; WP-D3b deploy + docs close-out)

## Resolved decisions

- Palette ramps clamp at 6 depth levels, no cycling (encoded in themes.ts tests, WP-C1c).
- Definitions stay independent of the graph in v1; validation warns when a defined word appears nowhere in map text; auto-highlight of defined words is out of v1.
- Origin rule, empty-row semantics, CSV scope, autosave replacement, override-rename reset, and export extent: see Resolved semantics under Architecture boundaries and ownership.

## Open questions and decisions needed

- GitHub Pages publishing settings (branch/folder) are user-controlled; WP-D3b reports if blocked and the human enables Pages.
