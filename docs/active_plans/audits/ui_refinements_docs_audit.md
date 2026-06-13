# UI refinements docs audit

Status: NEEDS_FIXES
Artifact: docs/active_plans/audits/ui_refinements_docs_audit.md
Findings count by file: see table below.
Audit date: 2026-06-12

## Summary table

| File | Stale claims | Missing mentions | Contradictions | Total |
| --- | --- | --- | --- | --- |
| README.md | 1 | 1 | 0 | 2 |
| docs/USAGE.md | 0 | 2 | 0 | 2 |
| docs/CODE_ARCHITECTURE.md | 0 | 2 | 0 | 2 |
| docs/FILE_STRUCTURE.md | 0 | 0 | 0 | 0 |
| docs/FILE_FORMATS.md | 0 | 0 | 0 | 0 |
| docs/INSTALL.md | 0 | 0 | 0 | 0 |
| docs/CHANGELOG.md | 1 | 0 | 0 | 1 |
| docs/active_plans/active/concept_map_maker_plan.md | 5 | 4 | 2 | 11 |

---

## README.md

### Stale claims

- Line 12: "validates the assignment rubric live (30+ bubbles, 10 definitions of difficult
  words)". The definitions feature has been removed from the app. The rubric check for
  10 definitions no longer runs. This claim misleads instructors and students.

### Missing mentions

- No mention of the ribbon toolbar with Font Awesome icons or the vendored
  `vendor/fontawesome/` assets, which are now part of the app's visual design and
  deployment artifact. A brief reference helps contributors understand the toolbar
  appearance changed.

---

## docs/USAGE.md

### Missing mentions

- No mention of the draggable pane resizer (WP-C1). The resizer is a user-facing
  interactive control: drag to resize, double-click resets, ArrowLeft/ArrowRight adjusts,
  and the ratio persists to localStorage. Users who want to see more of the table or
  more of the map will discover this by accident. It belongs in the Map interactions
  section.
- No mention of the chain button on triple rows. Each row has a chain button
  (aria-label "Chain new row from this concept") that commits the current `to` draft and
  inserts a new row with `from` pre-filled. This is a core authoring shortcut and belongs
  in the Building a map / Triples table section.

---

## docs/CODE_ARCHITECTURE.md

### Missing mentions

- No mention of the pane resizer in the description of `src/app.tsx` (line 16-17).
  The resizer is a `<div class="pane-resizer">` with pointer capture, localStorage
  persistence, and keyboard handling, all implemented in `app.tsx`. The component
  description is incomplete without it.
- No mention of Font Awesome vendored assets or the ribbon toolbar layout in
  `src/toolbar.tsx` description (line 18-19). The toolbar now uses Font Awesome
  glyphs, grouped panels, and `toolbar-group-caption` labels. The build step copies
  `vendor/fontawesome/` into `dist/`. Neither the icon dependency nor the build side
  effect is documented under Major components or Build pipeline.

---

## docs/FILE_STRUCTURE.md

No stale claims, missing mentions, or contradictions found. The `vendor/fontawesome/`
subtree and the `dist/vendor/fontawesome/` generated artifact are already documented
at lines 63-78. The build assertion for `dist/vendor/fontawesome/fa-solid-900.woff2`
is noted. The `vendor/` exclusion from pytest hygiene is noted. This file is current.

---

## docs/FILE_FORMATS.md

No stale claims or contradictions found. The note at line 17 ("Old files that contain
a `"definitions"` key are silently accepted; the field is ignored and not round-tripped")
is an accurate forward-compatibility note, not a stale claim about the current UI.
This file is current.

---

## docs/INSTALL.md

No stale claims or contradictions found. The Known gaps section at line 40 references
`pip_requirements-dev.txt` as existing, which is accurate. This file is current.

---

## docs/CHANGELOG.md (today's entries only: 2026-06-12)

### Category ordering inconsistency

The 2026-06-12 block opens with `### Fixes and Maintenance` (line 5) before
`### Additions and New Features` (line 21). Per REPO_STYLE.md the required section
order within a day block is: Additions, Behavior or Interface Changes, Fixes and
Maintenance, Removals, Decisions, Developer Tests. The first `### Fixes and
Maintenance` block (WP-A1 spec-review fix, lines 5-19) appears before the Additions
block. Fixes should follow Additions, not precede them.

No duplicate entries detected. The second `### Fixes and Maintenance` block (starting
around line 118) is a separate section rather than a duplicate of the first; both
contain distinct, non-overlapping entries. No apparent duplication.

---

## docs/active_plans/active/concept_map_maker_plan.md

### Stale claims (definitions-related)

- Line 8: "Assignment rubric: minimum 30 bubbles and 10 definitions of difficult words."
  The definitions feature has been removed. The rubric no longer requires 10 definitions.
- Line 31: "Students produce a rubric-compliant concept map (30+ bubbles, 10 definitions)
  entirely in the browser with no install and no account." Same stale rubric claim.
- Line 47 (Scope): "triples editor, definitions editor, SVG map canvas..." -- definitions
  editor is listed as a scope item. The feature is gone; `src/definitions_table.tsx` does
  not exist in the current tree.
- Lines 78-83 (Architecture / Data model): `CmapDocument` interface includes
  `definitions: Definition[]` and the `Definition` interface is shown. The actual
  `src/types.ts` no longer carries these; the plan's data model block is stale.
- Line 109 (Resolved semantics): "Definitions linkage: definitions are independent of the
  graph in v1..." This is a resolved decision about a removed feature and now misleads
  future contributors about the current design.

### Missing mentions of new features

- Pane resizer (WP-C1): no reference anywhere in the plan. The resizer and its
  localStorage persistence are now shipped; they do not appear in any milestone, work
  package, or scope list.
- Ribbon toolbar with Font Awesome (WP-E1): not in the plan. The vendor/ subtree,
  build-script vendor-copy step, and toolbar ribbon restyling are all shipped but absent
  from the work package list and milestone scope.
- Chain button on triple rows (WP-A1 feature 4): the plan's WP-B2a description (line 349)
  only mentions "add/delete rows"; the chain-insert interaction is not reflected.
- Per-cell triple-table highlighting with `active_concept` / `CellRole` (WP-B1): the
  plan's cross-highlight section (WP-B3, lines 401-407) describes row-level hover
  highlighting driven by `HoverState`. The finer-grained `active_concept` signal, cell
  classification memo, and `CellRole` type exported from `app_state.ts` are not in the
  plan.

### Contradictions

- Line 137-138 (Solid components list): `definitions_table.tsx` is listed as a Solid
  component alongside the others. The file does not exist in `src/`. The plan's component
  list contradicts the current source tree.
- Lines 466-469 (WP-D2c print stylesheet): "hide editor/toolbar" in `@media print` rules.
  The WP-D2c entry describes printing "map + definitions", which no longer applies because
  the definitions panel has been removed.

---

## Top 5 most important fixes (do not apply)

1. **README.md line 12: remove the "10 definitions" rubric claim.** This is user-facing
   text that will actively mislead students and instructors. It is the most visible
   stale claim in the repo. Replace with the current rubric (30+ unique concepts, verb
   phrase on every arrow, no blank triples).

2. **concept_map_maker_plan.md: purge all definitions references.** Five separate stale
   claims across the plan's Context, Objectives, Scope, Architecture/data model, and
   Resolved semantics sections describe a removed feature as if it is still present.
   The data model block (lines 78-83) is especially harmful: it shows `definitions:
   Definition[]` in the `CmapDocument` interface, which contradicts the actual `types.ts`.
   A future contributor reading the plan would implement the wrong schema.

3. **docs/CHANGELOG.md 2026-06-12: fix section order.** The first `### Fixes and
   Maintenance` block appears before `### Additions and New Features`, inverting the
   required order from REPO_STYLE.md. This is low-effort to fix (move the fixes block
   after the additions block) and keeps the log consistent for tooling that parses it
   by section heading.

4. **docs/USAGE.md: add resizer and chain button.** Both are user-facing interactive
   features that a student or instructor would discover only by accident. The resizer
   belongs in the Map interactions section; the chain button belongs in the Triples
   table section. These are the two most practically useful authoring shortcuts added
   in this batch.

5. **docs/CODE_ARCHITECTURE.md: update app.tsx and toolbar.tsx descriptions.** The
   resizer (pointer capture, localStorage, keyboard control) is non-trivial logic in
   `app.tsx` and should be mentioned. The Font Awesome vendor dependency and the
   build-script vendor-copy assertion belong under either Major components / toolbar
   or Build pipeline. A contributor looking at the architecture doc would not know
   the build has a hard assertion on a woff2 file.
