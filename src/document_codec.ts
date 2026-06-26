// Versioned JSON codec for FlowDocument.
//
// Pure TypeScript, no Solid/DOM imports. Responsible for creating empty
// documents, validating and parsing JSON loudly (no silent fallbacks), pruning
// stale position overrides, and serializing back to JSON. Future schema
// migrations live here behind the version gate.

import type { FlowDocument, FlowTheme, Position } from "./types.js";
import { DEFAULT_THEME } from "./themes.js";

// The only document format tag this app understands.
const FORMAT_TAG = "pseudo-code-flowchart";

// The current (and only) supported schema version.
const CURRENT_VERSION = 1;

//============================================
// empty_document
//============================================
// Build a fresh, valid, empty document with default theme and no source content.
export function empty_document(): FlowDocument {
  const doc: FlowDocument = {
    format: FORMAT_TAG,
    version: CURRENT_VERSION,
    title: "Untitled flowchart",
    source: "",
    overrides: {},
    theme: { palette: DEFAULT_THEME.palette },
  };
  return doc;
}

//============================================
// from_pseudo_source
//============================================
// Build a FlowDocument from a plain .pseudo source string.
//
// Used by "Open source" / "Load .pseudo" flows where the user opens a source-
// only file (no JSON wrapper). The document gets default title, empty overrides,
// and the default theme -- callers may patch title or theme afterward.
export function from_pseudo_source(source: string): FlowDocument {
  const doc: FlowDocument = {
    format: FORMAT_TAG,
    version: CURRENT_VERSION,
    title: "Untitled flowchart",
    source,
    overrides: {},
    theme: { palette: DEFAULT_THEME.palette },
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

function validate_theme(raw: unknown): FlowTheme {
  const obj = require_object(raw, "theme");
  const palette = require_string(obj["palette"], "theme.palette");
  // gate palette against the known set
  if (palette !== "earth" && palette !== "fire") {
    throw new Error(`Invalid document: theme.palette "${palette}" is not a known palette.`);
  }
  const theme: FlowTheme = { palette };
  return theme;
}

function validate_overrides(raw: unknown): Record<string, Position> {
  const obj = require_object(raw, "overrides");
  const overrides: Record<string, Position> = {};
  // validate each override entry; keys are node ids, values are positions
  for (const key of Object.keys(obj)) {
    const entry = require_object(obj[key], `overrides[${key}]`);
    const position: Position = {
      x: require_number(entry["x"], `overrides[${key}].x`),
      y: require_number(entry["y"], `overrides[${key}].y`),
    };
    overrides[key] = position;
  }
  return overrides;
}

//============================================
// prune_overrides
//============================================
// Drop override keys whose node id is not in the live_node_ids set.
//
// Called by the app state after a successful parse, passing the set of node
// ids produced by the parser. Overrides for nodes that no longer exist (because
// the user renamed or deleted a statement) are silently dropped so the saved
// file never carries dead override keys.
//
// Takes an explicit live_node_ids parameter rather than importing the parser
// so the codec stays decoupled from the parser work package.
export function prune_overrides(
  overrides: Record<string, Position>,
  live_node_ids: string[],
): Record<string, Position> {
  // build a set for O(1) membership tests
  const live_set = new Set<string>(live_node_ids);
  // keep only overrides whose key is still a live node
  const pruned: Record<string, Position> = {};
  for (const [key, position] of Object.entries(overrides)) {
    if (live_set.has(key)) {
      pruned[key] = position;
    }
  }
  return pruned;
}

//============================================
// parse_document
//============================================
// Parse JSON text into a validated FlowDocument. Throws Error with a clear
// message on malformed JSON, a wrong format tag, an unknown/unsupported version,
// or any structurally invalid field. No silent recovery.
//
// Override pruning is NOT performed here because parse_document does not have
// access to live node ids (that requires the parser). Callers that have node
// ids should call prune_overrides separately.
export function parse_document(json_text: string): FlowDocument {
  // step 1: JSON syntax. JSON.parse throws SyntaxError on garbage; rewrap with
  // a clearer message so callers can surface it to the user.
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
  const format = require_string(obj["format"], "format");
  if (format !== FORMAT_TAG) {
    throw new Error(`Invalid document: format "${format}" is not a pseudo-code-flowchart file.`);
  }

  // step 4: version gate. Unknown versions are rejected (future migrations are
  // added here as new supported versions before this gate).
  const version = require_number(obj["version"], "version");
  if (version !== CURRENT_VERSION) {
    throw new Error(
      `Unsupported document version ${version}; this app supports version ${CURRENT_VERSION}.`,
    );
  }

  // step 5: validate each field structurally
  const title = require_string(obj["title"], "title");
  const source = require_string(obj["source"], "source");
  const overrides = validate_overrides(obj["overrides"]);
  const theme = validate_theme(obj["theme"]);

  const document: FlowDocument = {
    format: FORMAT_TAG,
    version: CURRENT_VERSION,
    title,
    source,
    overrides,
    theme,
  };
  return document;
}

//============================================
// serialize_document
//============================================
// Serialize a document to pretty-printed JSON.
//
// Override pruning is NOT performed automatically here. Callers that have live
// node ids should call prune_overrides before serializing so saved files never
// carry dead override keys.
export function serialize_document(doc: FlowDocument): string {
  const clean: FlowDocument = {
    format: FORMAT_TAG,
    version: CURRENT_VERSION,
    title: doc.title,
    source: doc.source,
    overrides: doc.overrides,
    theme: doc.theme,
  };
  // two-space indent keeps saved files human-readable and diff-friendly
  const json_text = JSON.stringify(clean, null, 2);
  return json_text;
}
