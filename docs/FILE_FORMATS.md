# File formats

Input and output file formats the app reads and writes. All formats are produced and
consumed entirely in the browser; nothing is uploaded.

## Pseudo-code source (.pseudo)

The primary authoring format. Saved by the "Save source" button and loaded by "Open
source". The format is plain UTF-8 text following the grammar in
[PSEUDO_CODE_FORMAT.md](PSEUDO_CODE_FORMAT.md).

- One statement per line; blank lines are ignored.
- Leading indentation (tabs or spaces) is meaningful inside blocks.
- Keywords are case-insensitive on input.
- Any statement not matching a known keyword form becomes a `process` rectangle.

Example:

```
start
input number
if number > 0
  output "positive"
else
  output "not positive"
end if
end
```

## FlowDocument JSON (full save)

Written by "Save project" and read by "Open project". Implemented in
[../src/document_codec.ts](../src/document_codec.ts).

- Format tag: `"format": "pseudo-code-flowchart"`; foreign JSON files are rejected loudly.
- Schema version: `"version": 1` (the only supported version; unknown versions are rejected).
- Contents: title, pseudo-code source text, Dagre position overrides, and theme.
- Stale position overrides (nodes no longer present after re-parse) are pruned on load.
- The same JSON shape is the localStorage autosave payload
  (`pseudo-code-flowchart:document` slot).

Minimal example:

```json
{
  "format": "pseudo-code-flowchart",
  "version": 1,
  "title": "My flowchart",
  "source": "start\noutput hello\nend",
  "overrides": {},
  "theme": { "palette": "earth" }
}
```

## Image and print outputs

Implemented in [../src/export_svg.ts](../src/export_svg.ts).

- SVG: vector export of the current flowchart with the pan/zoom transform stripped.
- PNG: rasterized from the SVG (output capped at 8000 px on the long side).
- Print: browser print dialog; prints the flowchart.
