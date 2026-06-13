// Shared contract for the Concept Map Maker app.
//
// This module is pure TypeScript with zero imports from Solid or the DOM.
// Every other package imports its types and the concept_key normalizer from
// here, so it is the frozen contract for the whole codebase.

// A single directed proposition: from -verb-> to.
// "from" and "to" hold raw concept labels (display casing); normalization to a
// ConceptKey happens via concept_key().
export interface Triple {
  id: string;
  from: string;
  verb: string;
  to: string;
}

// A normalized concept identity. Produced by concept_key(): trimmed, internal
// whitespace collapsed to single spaces, lowercased. Two labels that differ
// only in casing or whitespace share one ConceptKey (and therefore one bubble).
export type ConceptKey = string;

// Bubble shape applied map-wide.
export type ThemeShape = "rounded" | "rect" | "oval" | "capsule";

// Color palette applied map-wide.
export type ThemePalette = "earth" | "fire";

export interface Theme {
  shape: ThemeShape;
  palette: ThemePalette;
}

// A drag-adjusted bubble position, keyed by ConceptKey in CmapDocument.overrides.
export interface Position {
  x: number;
  y: number;
}

// The full project document. This is the autosave unit and the JSON save format.
export interface CmapDocument {
  format: "concept-map-maker";
  version: 1;
  title: string;
  triples: Triple[];
  overrides: Record<ConceptKey, Position>;
  theme: Theme;
}

// Hover/focus state shared between table rows, map nodes, and map edges so
// cross-highlighting stays in sync. A null source means nothing is hovered.
export interface HoverState {
  source: "row" | "node" | "edge" | null;
  tripleId: string | null;
  conceptKey: ConceptKey | null;
}

// One result from a validation rule. Severity is split three ways: pass/warn/fail
// for rubric rules.
export interface ValidationItem {
  rule: string;
  level: "pass" | "warn" | "fail";
  message: string;
  tripleIds?: string[];
  conceptKeys?: ConceptKey[];
}

//============================================
// concept_key
//============================================
// Normalize a concept label into its canonical identity key.
//
// Steps: trim leading/trailing whitespace, collapse every run of internal
// whitespace (spaces, tabs, newlines) to a single space, then lowercase. The
// display casing is preserved elsewhere (first-casing-wins in derive_concepts);
// this function only produces the identity used for deduplication and override
// keying.
export function concept_key(label: string): ConceptKey {
  // trim ends, then collapse internal whitespace runs to one space
  const collapsed = label.trim().replace(/\s+/g, " ");
  // lowercase for case-insensitive identity
  const key = collapsed.toLowerCase();
  return key;
}
