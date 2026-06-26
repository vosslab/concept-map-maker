# News

Release highlights and announcements for Concept Map Maker.
For the full change history, see [docs/CHANGELOG.md](CHANGELOG.md).

## 26.06 (2026-06-12)

- Two-state light/dark theme toggle replaces three-state auto/light/dark cycle.
- CSS split: monolithic `src/style.css` decomposed into seven focused modules under `src/css/`.
- Toolbar ribbon icons via vendored Font Awesome Free 6.7.2 (no CDN dependency).
- Commit-time column autosize in the triples table (canvas `measureText`).
- Three-color per-cell highlight (same / from / to) in the triples table.
- Draggable pane resizer between editor and map panes, persisted to localStorage.
- Print forces light-mode rendering so dark-ink waste is avoided.
- App deployed on GitHub Pages: https://vosslab.github.io/concept-map-maker/

## Known gaps

- Earlier release highlights before 26.06 have not been curated here.
  Task: extract release summaries from [docs/CHANGELOG.md](CHANGELOG.md) for
  earlier milestones and add them above.
