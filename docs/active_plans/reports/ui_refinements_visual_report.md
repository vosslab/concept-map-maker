# UI refinements visual report

Visual acceptance review of smoke screenshots in
`/Users/vosslab/nsh/concept-map-maker/output_smoke/` against the
UI refinement acceptance criteria.

- Status: complete
- Date: 2026-06-12
- Reviewer: evaluation agent (direct image inspection)

## Critical answer on toolbar icons

NO. The Font Awesome toolbar icons do NOT render as recognizable glyphs.

Every toolbar button shows an empty square box (tofu) in the icon slot.
Headless Chromium normally paints woff2 fonts fine, so this is a real
font-loading bug, not a headless artifact. The Font Awesome web font is
not being applied to the button icons.

The one exception is the per-row chain button (see screenshot 05), which
renders an actual curved-arrow glyph. That glyph appears to come from a
different source (text arrow or a different font) than the toolbar
Font Awesome set, so the toolbar font specifically is the failing piece.

## Per-screenshot verdicts

### 01 toolbar ribbon and fullpage

- Files: `01_toolbar_ribbon.png`, `01_toolbar_fullpage.png`
- Verdict: FAIL

Findings:

- Nine icon slots are visible, one per labeled button: Save project,
  Open project, Clear, Export triples CSV, Import triples CSV,
  Export SVG, Export PNG, Print, Re-layout.
- Every one of these nine slots shows an empty square box (tofu). None of
  the floppy-disk, folder, trash, file-export, file-import, vector-square,
  image, print, or diagram glyphs render.
- Group captions: only the "Layout" caption is fully visible. The other
  three captions (File, CSV, Image and print) sit on the top caption row,
  which is cropped off the top edge in both supplied images, so they could
  not be confirmed. INCONCLUSIVE on the three top-row captions; the report
  recommends a taller capture to verify them.
- Ribbon look: distinct bordered group sections are visible (File, CSV,
  Image-and-print, Layout each in its own bordered box), with an
  "autosave on" status label to the right. Section grouping is present and
  reads as a ribbon.

The FAIL is driven entirely by the tofu icons, which is the critical
criterion.

### 02 no definitions tab

- File: `02_no_definitions_tab.png`
- Verdict: PASS

The page shows only TRIPLES, CONCEPT MAP, and RUBRIC sections. No
Definitions tab appears anywhere.

### 03 verb width

- File: `03_verb_width.png`
- Verdict: PASS

The verb "included" renders fully and is untruncated in the middle
(VERB PHRASE) cell. The middle column is wide enough to show the whole
word with margin to spare.

### 04 add row stable

- File: `04_add_row_stable.png`
- Verdict: PASS (with capture caveat)

The preview sentence ("... -> Energy", italic) sits in its own slot below
the two editable rows, not inside a row. This matches the criterion. The
editor pane in this capture is scrolled to the right, so the left edge
(including the start of the preview and the "+ Add row" button) is clipped
out of frame. The same layout is fully visible and confirmed in
screenshots 06 and 06b, where "+ Add row" appears in a slot below the
rows. Verdict is PASS based on the cross-confirmed layout; recommend a
non-scrolled capture for this specific shot.

### 05 chain button

- File: `05_chain_button.png`
- Verdict: PASS

At the end of the first (filled) row there are two trailing controls: an
X delete button (blue outline) and an orange-highlighted chain button
showing a curved-arrow glyph. The chain button is visible and has an
enabled (orange, active) appearance. The empty second row shows a greyed,
disabled chain button, which is the expected state for an empty row.

### 06 and 06b resizer drag and persist

- Files: `06_resizer_drag.png`, `06b_resizer_persist.png`
- Verdict: PASS

The TRIPLES editor pane is visibly narrower than the default 40%. The
split divider sits at roughly x=400 of a 1280 px viewport (about 31%),
clearly narrower than 40%. The two images are pixel-identical splits, so
the narrowed width persisted across the second capture. Persistence
confirmed.

## General aesthetics

- Spacing and alignment in the editor rows and ribbon read clean; columns
  align, the THIS CONCEPT / VERB PHRASE / POINTS TO THIS CONCEPT headers
  line up with their input columns.
- The concept-map canvas renders nodes and labeled arrows cleanly
  (sun -> energy, honeybees -> castes) with readable node text and palette
  colors.
- The only broken-looking element is the toolbar icon set (tofu boxes),
  which makes the ribbon look incomplete and unprofessional until the font
  loads.

## Limitations

- Pixel measurements are visual estimates from the rendered images, not
  from a DOM or computed-style probe; no measurement tool was run against
  the live page.
- The top caption row of the ribbon is cropped in both 01 images, so three
  of the four group captions (File, CSV, Image and print) could not be
  confirmed.
- Screenshot 04 is horizontally scrolled, clipping the left edge of the
  preview slot and the "+ Add row" button.

## Recommendations

1. Fix the Font Awesome toolbar font loading. Verify the woff2 is served,
   the @font-face src resolves, and the icon class names map to the loaded
   family. This is the blocking failure for screenshot 01.
2. Recapture 01 with extra top margin so all four group captions are in
   frame.
3. Recapture 04 without horizontal scroll so the preview slot and
   "+ Add row" button are fully visible in their own shot.
