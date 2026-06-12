# Changelog

## 2026-06-12

### Additions and New Features

- WP-A3: Added `src/csv_codec.ts`: RFC4180/TSV codec with three exported functions:
  `parse_table_text(text)` (auto-detects TSV vs CSV by presence of unquoted tabs,
  strips UTF-8 BOM, handles CRLF, quoted fields with embedded delimiters and
  newlines, doubled-quote escaping, pads rows to uniform width);
  `serialize_triples_csv(triples)` (RFC4180 CSV with header
  `this concept,verb phrase,points to this concept`, CRLF line endings, trailing
  CRLF, fields quoted on demand); `parse_triples_csv(text)` (fuzzy header detection
  case-insensitive on tokens like "from"/"this concept", "verb phrase",
  "to"/"points to this concept"; falls back to positional order 0/1/2 when no
  header recognized; blank rows skipped). Pure TypeScript, no Solid/DOM imports.

- WP-C1a: Added dagre layout adapter in `src/layout_graph.ts`:
  `compute_layout(triples)` builds a deterministic top-down (`rankdir: "TB"`,
  `acyclicer: "greedy"`) layered layout from complete rows only, sizing each
  bubble from label length (~8px/char + padding, clamped min width, fixed 36px
  pill height). Edges carry no label (verb labels render later at bezier
  midpoints); self-loops and duplicate concept-pair edges are dropped before
  ranking. Returns center coordinates per `ConceptKey` plus the dagre canvas
  extent. Cycles never throw.

- WP-C1c: Added `src/themes.ts` with `PALETTES` (earth: 6 tans/greens/browns, fire: 6 yellows/oranges/reds, light-to-dark), `depth_fill(palette, depth)` (clamps depth >5 to last entry, never cycles), `ORIGIN_EMPHASIS` stroke constants, and `SHAPE_REGISTRY` per-shape `corner_radius`/`is_ellipse` spec consumed by SVG node renderer. Pure TypeScript, no Solid/DOM imports.

- WP-A2c: Added `src/validate_document.ts` with `validate_document(doc: CmapDocument): ValidationItem[]`. Rules: rubric pass/fail (min 30 unique concepts, all arrows verb-labeled, min 10 definitions), quality warn (verb label >3 words, orphan concepts, partial rows, duplicate triples, self-loops, near-miss spellings via specialized Levenshtein-distance-1 helper), hint (defined word absent from all map text). Pure TypeScript, no Solid/DOM imports.

- WP-A2b: Added `src/graph_depth.ts` with `compute_depths(triples: Triple[]): { depth_by_key: Map<ConceptKey, number>; origin_keys: Set<ConceptKey> }`. Multi-source BFS from all origins (in-degree 0, out-degree > 0); isolated concepts excluded from origins; unreachable nodes (including cycle members) get fallback depth = max_reached + 1; no origins -> all depth 0.
- WP-A2b: Added `tests/test_graph_depth.mjs` with 15 tests covering honeybees depths, cycle fixture (no throw), origin-rule including isolated-concept exclusion, no-origins case, and incomplete-row exclusion. All pass.

- WP-A1: Added shared type contract in `src/types.ts` (`Triple`, `Definition`,
  `ConceptKey`, `Theme`, `Position`, `CmapDocument`, `HoverState`,
  `ValidationItem`) plus the `concept_key()` normalizer (trim, collapse internal
  whitespace, lowercase). Pure TypeScript, no Solid/DOM imports.
- WP-A1: Added versioned JSON document codec in `src/document_codec.ts`:
  `empty_document()`, `parse_document()` (loud rejection of non-JSON, foreign
  format tags, unknown versions, and malformed fields), `serialize_document()`,
  and `prune_overrides()` (drops override keys whose concept no longer appears in
  any triple; applied on both parse and serialize).
- WP-A1: Added shared test fixtures under `tests/fixtures/`:
  `honeybees_triples.tsv`, `honeybees_document.json` (Castes 3 outputs, Female 3
  inputs, 10 definitions), and `stress_80_nodes.json` (deterministic 80-concept
  document with several origins, branches, converging nodes, one cycle, one
  bidirectional pair, and long labels for layout/perf checks).

- WP-C1b: Added `src/edge_geometry.ts` (pure, no Solid/DOM): `NodeBox` center-based
  box type; `edge_path(from_box, to_box, shape, curvature)` returns an SVG cubic
  bezier "d" plus label anchor at the curve midpoint (t=0.5), clipped to each
  node boundary per shape (rect axis-wall, oval ellipse solve, rounded-rect with
  corner-arc clipping) and bowed by displacing both control points perpendicular
  to the segment by `curvature * length`; `self_loop_path(box, shape)` draws a
  valid top-bulge self-loop cubic; `assign_curvatures(triples)` gives lone edges
  curvature 0, bidirectional pairs deterministic opposite-sign bowing, and
  duplicate same-direction edges an increasing-magnitude fan.
- WP-C1b: Added `src/map_bounds.ts` (pure): `effective_extent(nodes, overrides, padding)`
  computes the rendered bounding box (single source for SVG viewBox, PNG raster
  bounds, print sizing) by replacing each node center with its drag override when
  present, expanding by node dimensions, and padding all four sides; a far-dragged
  override widens the bounds, unknown override keys are ignored, and an empty map
  yields a finite padded zero box.

- WP-A2a: Added `src/derive_concepts.ts`: pure `derive_concepts(triples)` function
  returning `Concept[]` (key, label, outgoing, incoming triple ids). Semantics:
  fully blank rows ignored, partial rows excluded, concepts ordered by first
  appearance, display label = first-casing-wins, key = `concept_key(label)`.
  `Concept` interface defined here (not in `types.ts`).

### Developer Tests and Notes

- WP-C1b: Added `tests/test_edge_geometry.mjs` (12 tests) and `tests/test_map_bounds.mjs`
  (6 tests) via `node --import tsx --test`: per-shape boundary clipping (rect/oval/
  rounded), straight vs bowed cubics, opposite-side bidirectional bowing, midpoint
  label anchor, valid self-loop cubic, lone/bidirectional/duplicate curvature
  assignment, and extent computation including a far-dragged override expanding the
  bounds, ignored ghost overrides, and the empty-map case. All 18 pass.

- WP-C1a: Added `tests/test_layout_graph.mjs` (10 tests via `node --import tsx
  --test`): determinism (two runs, identical coords), honeybees structure and
  top-down ordering, label-length node sizing, blank/partial-row exclusion,
  casing/whitespace dedup, and cycle safety on both a tight 3-node cycle and the
  80-node stress fixture. All 10 pass.

- WP-A3: Added `tests/test_csv_codec.mjs` (29 tests via `node --import tsx --test`):
  TSV detection, BOM stripping, CRLF handling, quoted fields with embedded tabs/
  newlines/commas, doubled quotes, Excel-style multiline cells, row-width padding,
  serialize header and quoting, CRLF enforcement, round-trip with commas and quotes
  in fields, fuzzy header detection (canonical and case-insensitive), no-header
  positional fallback, blank-row skip, honeybees fixture end-to-end (Female 3
  inputs). All 29 pass.

- WP-C1c: Added `tests/test_themes.mjs` (17 tests via `node --import tsx --test`): palette length and hex format, depth_fill correctness at boundaries 0/5, clamp at >5, no-cycle check, ordered ramp (depth 0 != depth 1), ORIGIN_EMPHASIS shape, SHAPE_REGISTRY per-shape specs. All 17 pass.

- WP-A2c: Added `tests/test_validate_document.mjs` (28 tests via `node --import tsx --test`): fixture coverage for every rule across pass/warn/fail/hint severity levels, including normalization edge cases, blank-row semantics, and near-miss spelling pairs. All 28 pass.

- WP-A2a: Added `tests/test_derive_concepts.mjs` (12 tests): honeybees fixture
  (7 unique concepts, Female 3 incoming, Castes 3 outgoing), blank/partial-row
  semantics, deduplication/casing, ordering stability, empty input. All pass.
- WP-A1: Added `tests/test_concept_key.mjs` and `tests/test_document_codec.mjs`
  (node test runner via `node --import tsx --test`): normalization behavior,
  JSON round-trip on both fixtures, garbage rejection, version gate, and override
  pruning. 21 tests pass.
