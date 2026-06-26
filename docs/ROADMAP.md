# Roadmap

Planned work and intentional non-goals for Concept Map Maker.

## Intentional non-goals (locked)

These are out of scope and will not be added without a design change:

- Backend, accounts, or server-side storage (browser-only by design).
- Undo/redo (single-store design leaves the hook open, but not planned).
- Multi-map management or collaboration (one autosave slot per session).
- LMS integration or automated scoring (live rubric checklist only).
- Touch-first UX (desktop/laptop pointer use is the target).

## Possible future work

Items raised in planning but not yet scheduled:

- Undo/redo stack (the `createStore` design supports it; no owner yet).
- Accessibility pass: keyboard-navigable concept map canvas (drag handles, node focus).
- Multiple saved maps in one session.
- Teacher/grader view: read-only share link via JSON query-param or hash.

## Known gaps

- This roadmap does not have a dated milestone list with owners.
  Task: promote items from `docs/active_plans/active/concept_map_maker_plan.md`
  non-goals and notes into a dated milestone structure once planning resumes.
