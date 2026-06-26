# Roadmap

Planned work and intentional non-goals for the Pseudo-code Flowchart Editor.

## Intentional non-goals (locked)

These are out of scope and will not be added without a design change:

- Backend, accounts, or server-side storage (browser-only by design).
- Undo/redo (single-store design leaves the hook open, but not planned).
- Multi-document management or collaboration (one autosave slot per session).
- Converting pseudo-code to a runnable language (flowchart rendering only).
- Touch-first UX (desktop/laptop pointer use is the target).

## Possible future work

Items raised in planning but not yet scheduled:

- Undo/redo stack (the `createStore` design supports it; no owner yet).
- Accessibility pass: keyboard-navigable flowchart canvas (drag handles, node focus).
- Multiple saved documents in one session.
- Share view: read-only share link via JSON query-param or hash.

## Milestone approach

The roadmap tracks intended direction.
Dated milestones with owners are recorded here when a release is scheduled.
