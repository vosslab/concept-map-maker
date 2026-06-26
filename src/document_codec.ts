// Versioned JSON codec for CmapDocument.
//
// Pure TypeScript, no Solid/DOM imports. Responsible for creating empty
// documents, validating and parsing JSON loudly (no silent fallbacks), pruning
// stale position overrides, and serializing back to JSON. Future schema
// migrations live here behind the version gate.

import type { CmapDocument, Triple, Position, Theme } from "./types";
import { concept_key } from "./types";

// The only document format tag this app understands.
const FORMAT_TAG = "concept-map-maker";

// The current (and only) supported schema version.
const CURRENT_VERSION = 1;

// Default theme applied to brand-new documents.
const DEFAULT_THEME: Theme = { shape: "rounded", palette: "earth" };

//============================================
// empty_document
//============================================
// Build a fresh, valid, empty document with default theme and no content.
export function empty_document(): CmapDocument {
  const doc: CmapDocument = {
    format: FORMAT_TAG,
    version: CURRENT_VERSION,
    title: "Untitled concept map",
    triples: [],
    overrides: {},
    theme: { shape: DEFAULT_THEME.shape, palette: DEFAULT_THEME.palette },
  };
  return doc;
}

//============================================
// validation helpers
//============================================
// Each helper throws an Error with a clear, specific message when the shape is
// wrong. Loud failure is intentional: garbage input must never be papered over.

function require_object(value: unknown, label: string): Record<string, unknown> {
  // reject null, arrays, and non-objects
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid document: ${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function require_string(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid document: ${label} must be a string.`);
  }
  return value;
}

function require_number(value: unknown, label: string): number {
  // reject non-numbers and NaN/Infinity so positions stay finite
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid document: ${label} must be a finite number.`);
  }
  return value;
}

function require_array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid document: ${label} must be an array.`);
  }
  return value;
}

function validate_triple(raw: unknown, index: number): Triple {
  const obj = require_object(raw, `triples[${index}]`);
  const triple: Triple = {
    id: require_string(obj.id, `triples[${index}].id`),
    from: require_string(obj.from, `triples[${index}].from`),
    verb: require_string(obj.verb, `triples[${index}].verb`),
    to: require_string(obj.to, `triples[${index}].to`),
  };
  return triple;
}

function validate_theme(raw: unknown): Theme {
  const obj = require_object(raw, "theme");
  const shape = require_string(obj.shape, "theme.shape");
  const palette = require_string(obj.palette, "theme.palette");
  // gate shape against the known set
  if (shape !== "rounded" && shape !== "rect" && shape !== "oval" && shape !== "capsule") {
    throw new Error(`Invalid document: theme.shape "${shape}" is not a known shape.`);
  }
  // gate palette against the known set
  if (palette !== "earth" && palette !== "fire") {
    throw new Error(`Invalid document: theme.palette "${palette}" is not a known palette.`);
  }
  const theme: Theme = { shape, palette };
  return theme;
}

function validate_overrides(raw: unknown): Record<string, Position> {
  const obj = require_object(raw, "overrides");
  const overrides: Record<string, Position> = {};
  // validate each override entry; keys are concept keys, values are positions
  for (const key of Object.keys(obj)) {
    const entry = require_object(obj[key], `overrides[${key}]`);
    const position: Position = {
      x: require_number(entry.x, `overrides[${key}].x`),
      y: require_number(entry.y, `overrides[${key}].y`),
    };
    overrides[key] = position;
  }
  return overrides;
}

//============================================
// prune_overrides
//============================================
// Drop override keys whose concept no longer appears as a from/to in any triple.
// Renaming a concept changes its key, so its old override becomes orphaned; this
// resets that bubble to auto-layout (an intentional, documented behavior).
export function prune_overrides(
  overrides: Record<string, Position>,
  triples: Triple[],
): Record<string, Position> {
  // collect the set of live concept keys present in the triples
  const live_keys = new Set<string>();
  for (const triple of triples) {
    // blank endpoints normalize to "" and are simply never added as live keys
    const from_key = concept_key(triple.from);
    const to_key = concept_key(triple.to);
    if (from_key !== "") {
      live_keys.add(from_key);
    }
    if (to_key !== "") {
      live_keys.add(to_key);
    }
  }
  // keep only overrides whose key is still referenced by a triple
  const pruned: Record<string, Position> = {};
  for (const [key, position] of Object.entries(overrides)) {
    if (live_keys.has(key)) {
      pruned[key] = position;
    }
  }
  return pruned;
}

//============================================
// parse_document
//============================================
// Parse JSON text into a validated CmapDocument. Throws Error with a clear
// message on malformed JSON, a wrong format tag, an unknown/unsupported version,
// or any structurally invalid field. No silent recovery.
export function parse_document(json_text: string): CmapDocument {
  // step 1: JSON syntax. JSON.parse throws SyntaxError on garbage; rewrap with
  // a clearer message so callers can surface it to the student.
  let raw: unknown;
  try {
    raw = JSON.parse(json_text);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Invalid document: not valid JSON (${detail}).`, { cause });
  }

  // step 2: top-level must be an object
  const obj = require_object(raw, "document");

  // step 3: format gate. A foreign JSON file must be rejected loudly.
  const format = require_string(obj.format, "format");
  if (format !== FORMAT_TAG) {
    throw new Error(`Invalid document: format "${format}" is not a Concept Map Maker file.`);
  }

  // step 4: version gate. Unknown versions are rejected (future migrations are
  // added here as new supported versions before this gate).
  const version = require_number(obj.version, "version");
  if (version !== CURRENT_VERSION) {
    throw new Error(
      `Unsupported document version ${version}; this app supports version ${CURRENT_VERSION}.`,
    );
  }

  // step 5: validate each field structurally
  const title = require_string(obj.title, "title");
  const raw_triples = require_array(obj.triples, "triples");
  const triples = raw_triples.map(validate_triple);
  // definitions field is intentionally ignored: the feature was removed.
  // Old files that contain a "definitions" key are silently accepted; the
  // field is not read or round-tripped.
  const overrides = validate_overrides(obj.overrides);
  const theme = validate_theme(obj.theme);

  // step 6: prune overrides on load so a hand-edited or stale file is clean
  const pruned_overrides = prune_overrides(overrides, triples);

  const document: CmapDocument = {
    format: FORMAT_TAG,
    version: CURRENT_VERSION,
    title,
    triples,
    overrides: pruned_overrides,
    theme,
  };
  return document;
}

//============================================
// serialize_document
//============================================
// Serialize a document to pretty-printed JSON. Override pruning is applied here
// so a saved file never carries dead override keys.
export function serialize_document(doc: CmapDocument): string {
  // prune stale overrides against the current triples before writing
  const pruned_overrides = prune_overrides(doc.overrides, doc.triples);
  const clean: CmapDocument = {
    format: FORMAT_TAG,
    version: CURRENT_VERSION,
    title: doc.title,
    triples: doc.triples,
    overrides: pruned_overrides,
    theme: doc.theme,
  };
  // two-space indent keeps saved files human-readable and diff-friendly
  const json_text = JSON.stringify(clean, null, 2);
  return json_text;
}
