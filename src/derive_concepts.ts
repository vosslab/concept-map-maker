// Pure derivation module: maps a list of Triples to unique Concepts with
// adjacency lists. No Solid or DOM imports.

import { concept_key } from "./types.js";
import type { Triple, ConceptKey } from "./types.js";

// A derived concept bubble, keyed by its normalized identity.
// outgoing and incoming hold Triple ids (not concept keys).
export interface Concept {
  key: ConceptKey;
  label: string;
  outgoing: string[];
  incoming: string[];
}

//============================================
// is_complete_row
//============================================
// A row is complete when from, verb, and to are all non-blank after trim.
function is_complete_row(triple: Triple): boolean {
  // all three fields must be non-empty after trimming whitespace
  const from_ok = triple.from.trim().length > 0;
  const verb_ok = triple.verb.trim().length > 0;
  const to_ok = triple.to.trim().length > 0;
  return from_ok && verb_ok && to_ok;
}

//============================================
// derive_concepts
//============================================
// Derive unique Concepts from a list of Triples.
//
// Semantics:
//   - Fully blank rows (all three fields empty/whitespace) are ignored.
//   - Partial rows (some fields non-blank but at least one blank) are excluded
//     from derivation (not counted as complete propositions).
//   - Concepts are ordered by first appearance across from/to fields in
//     document order of complete rows.
//   - Display label = first-seen casing; key = concept_key(label).
//   - outgoing = ids of complete triples where this concept is the "from".
//   - incoming = ids of complete triples where this concept is the "to".
export function derive_concepts(triples: Triple[]): Concept[] {
  // filter to only complete rows (skip blank rows implicitly, skip partial rows explicitly)
  const complete = triples.filter((t) => is_complete_row(t));

  // track insertion order of concept keys for stable ordering
  const key_order: ConceptKey[] = [];
  // map from key to first-seen label (display casing)
  const label_by_key = new Map<ConceptKey, string>();

  // helper: register a label if not yet seen, preserving first-casing-wins
  function register_label(label: string): void {
    const k = concept_key(label);
    if (!label_by_key.has(k)) {
      // first time we see this concept key: record insertion order and casing
      key_order.push(k);
      label_by_key.set(k, label.trim());
    }
  }

  // walk complete triples in document order to build the ordered key list
  for (const triple of complete) {
    register_label(triple.from);
    register_label(triple.to);
  }

  // build adjacency accumulators for each key
  const outgoing_by_key = new Map<ConceptKey, string[]>();
  const incoming_by_key = new Map<ConceptKey, string[]>();

  // initialize empty arrays for all known keys
  for (const k of key_order) {
    outgoing_by_key.set(k, []);
    incoming_by_key.set(k, []);
  }

  // populate adjacency by scanning complete triples
  for (const triple of complete) {
    const from_key = concept_key(triple.from);
    const to_key = concept_key(triple.to);
    // record this triple id as an outgoing edge for the from-concept
    outgoing_by_key.get(from_key)!.push(triple.id);
    // record this triple id as an incoming edge for the to-concept
    incoming_by_key.get(to_key)!.push(triple.id);
  }

  // assemble Concept objects in first-appearance order
  const concepts: Concept[] = key_order.map((k) => {
    const concept: Concept = {
      key: k,
      label: label_by_key.get(k)!,
      outgoing: outgoing_by_key.get(k)!,
      incoming: incoming_by_key.get(k)!,
    };
    return concept;
  });

  return concepts;
}
