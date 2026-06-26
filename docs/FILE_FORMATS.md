# File formats

Input and output file formats the app reads and writes. All formats are produced and
consumed entirely in the browser; nothing is uploaded.

## Project JSON (full save)

Written by the toolbar "Save project" button and read by "Open project". Implemented in
[../src/document_codec.ts](../src/document_codec.ts).

- Format tag: `"format": "concept-map-maker"`; foreign JSON files are rejected loudly.
- Schema version: `"version": 1` (the only supported version; unknown versions are rejected).
- Contents: title, triples, drag position overrides, and theme.
- Stale position overrides (concepts no longer in the triples) are pruned on load.
- The same JSON shape is the localStorage autosave payload
  (`concept-map-maker:document` slot).
- Old files that contain a `"definitions"` key are silently accepted; the field is
  ignored and not round-tripped.

## Triples CSV (import and export)

Written by "Export triples CSV" and read by "Import triples CSV". Implemented in
[../src/csv_codec.ts](../src/csv_codec.ts).

- Export header: `this concept,verb phrase,points to this concept`.
- RFC 4180 quoting; BOM and CRLF input are accepted.
- Import uses fuzzy header detection; a headerless file is read as columns
  from, verb, to in order.
- CSV carries triples only. Positions, title, and theme are not included;
  use the project JSON for a full save.
- Import appends rows to the current document; it does not wipe existing work.

## Spreadsheet paste (TSV)

Pasting into the triples table reads the clipboard as tab-separated values (the default
copy format of Excel and Google Sheets).

- Triples tab: 3-column rows (from concept, verb phrase, to concept).

## Image and print outputs

Implemented in [../src/export_svg.ts](../src/export_svg.ts).

- SVG: vector export of the current map with the pan/zoom transform stripped.
- PNG: rasterized from the SVG (output capped at 8000 px on the long side).
- Print: browser print dialog; prints the map.
