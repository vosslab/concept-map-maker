// Validation rules for a CmapDocument.
//
// Pure TypeScript - no Solid/DOM imports. Called from the reactive derivation
// chain (validation memo in app_state) and exposed to the rubric panel via the
// ValidationItem list.

import type { CmapDocument, ValidationItem, ConceptKey } from "./types.js";
import { concept_key } from "./types.js";

//============================================
// levenshtein_distance_at_most_1
//============================================
// Returns true when the edit distance between two strings is exactly 1.
// Uses a specialized O(n) check rather than a full DP table.
function levenshtein_distance_at_most_1(a: string, b: string): boolean {
  const la = a.length;
  const lb = b.length;
  const diff = la - lb;
  // length difference > 1 means distance > 1
  if (diff > 1 || diff < -1) return false;

  if (diff === 0) {
    // same length: exactly one substitution allowed
    let mismatches = 0;
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i]) {
        mismatches++;
        if (mismatches > 1) return false;
      }
    }
    return mismatches === 1;
  }

  // one string is longer by 1: check single insertion/deletion
  const [shorter, longer] = la < lb ? [a, b] : [b, a];
  const ls = shorter.length;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < ls && j < ls + 1) {
    if (shorter[i] !== longer[j]) {
      if (skipped) return false;
      skipped = true;
      // skip one character in the longer string
      j++;
    } else {
      i++;
      j++;
    }
  }
  return true;
}

//============================================
// validate_document
//============================================
// Runs all validation rules against a CmapDocument and returns an ordered list
// of ValidationItems. Rubric rules emit "pass"/"fail". Quality rules emit "warn".
export function validate_document(doc: CmapDocument): ValidationItem[] {
  const results: ValidationItem[] = [];

  // Collect complete and partial rows
  // A row is "blank" if from, verb, and to are all empty after trim.
  // A row is "complete" if all three are non-empty after trim.
  // A row is "partial" if not blank and not complete.
  const complete_triples = doc.triples.filter(
    (t) => t.from.trim() !== "" && t.verb.trim() !== "" && t.to.trim() !== "",
  );
  const partial_triples = doc.triples.filter((t) => {
    const has_from = t.from.trim() !== "";
    const has_verb = t.verb.trim() !== "";
    const has_to = t.to.trim() !== "";
    const all_blank = !has_from && !has_verb && !has_to;
    const all_filled = has_from && has_verb && has_to;
    return !all_blank && !all_filled;
  });

  //--------------------------------------------------
  // Build concept key set from complete rows
  //--------------------------------------------------
  const concept_keys_set = new Set<ConceptKey>();
  for (const t of complete_triples) {
    concept_keys_set.add(concept_key(t.from));
    concept_keys_set.add(concept_key(t.to));
  }
  const concept_keys_list = Array.from(concept_keys_set);

  //--------------------------------------------------
  // RUBRIC: at least 30 unique concepts (fail/pass)
  //--------------------------------------------------
  const unique_concept_count = concept_keys_set.size;
  results.push({
    rule: "min_30_concepts",
    level: unique_concept_count >= 30 ? "pass" : "fail",
    message:
      unique_concept_count >= 30
        ? `${unique_concept_count} unique concepts (meets minimum of 30)`
        : `Only ${unique_concept_count} unique concept${unique_concept_count === 1 ? "" : "s"} - need at least 30`,
    conceptKeys: unique_concept_count < 30 ? concept_keys_list : undefined,
  });

  //--------------------------------------------------
  // RUBRIC: every arrow has a verb label (fail/pass)
  //--------------------------------------------------
  // Check ALL non-blank rows against the verb requirement (not just complete rows,
  // because a row with from + to but no verb must still be flagged)
  const non_blank_triples = doc.triples.filter(
    (t) => t.from.trim() !== "" || t.verb.trim() !== "" || t.to.trim() !== "",
  );
  const no_verb_rows = non_blank_triples.filter((t) => t.verb.trim() === "");
  results.push({
    rule: "verbs_required",
    level: no_verb_rows.length === 0 ? "pass" : "fail",
    message:
      no_verb_rows.length === 0
        ? "Every arrow has a verb label"
        : `${no_verb_rows.length} arrow${no_verb_rows.length === 1 ? "" : "s"} missing a verb label`,
    tripleIds: no_verb_rows.length > 0 ? no_verb_rows.map((t) => t.id) : undefined,
  });

  //--------------------------------------------------
  // QUALITY WARN: verb label longer than 3 words
  //--------------------------------------------------
  const long_verb_rows = complete_triples.filter((t) => t.verb.trim().split(/\s+/).length > 3);
  if (long_verb_rows.length > 0) {
    results.push({
      rule: "long_verb_label",
      level: "warn",
      message: `${long_verb_rows.length} arrow${long_verb_rows.length === 1 ? "" : "s"} have a verb label longer than 3 words`,
      tripleIds: long_verb_rows.map((t) => t.id),
    });
  }

  //--------------------------------------------------
  // QUALITY WARN: orphan concepts (degree 0 - no edges at all)
  //--------------------------------------------------
  // An orphan is a concept that appears in no complete triple as either from or to.
  // Because concept_keys_set only holds keys from complete triples, a degree-0
  // concept only arises if it was added through partial rows. We compute degree
  // from complete_triples directly.
  const from_keys = new Set<ConceptKey>(complete_triples.map((t) => concept_key(t.from)));
  const to_keys = new Set<ConceptKey>(complete_triples.map((t) => concept_key(t.to)));
  // A concept key is orphaned when it has neither outgoing nor incoming edges
  // (i.e., not in from_keys AND not in to_keys). Since concept_keys_set is built
  // from complete triples, every key appears in at least one side. An orphan can
  // only appear if a concept is exclusively the "from" with no outgoing edges
  // because its only partner rows are partial. Re-derive: consider all keys that
  // appear in non-blank rows (including partial).
  const all_seen_keys = new Set<ConceptKey>();
  for (const t of non_blank_triples) {
    if (t.from.trim() !== "") all_seen_keys.add(concept_key(t.from));
    if (t.to.trim() !== "") all_seen_keys.add(concept_key(t.to));
  }
  const orphan_keys: ConceptKey[] = [];
  for (const k of all_seen_keys) {
    if (!from_keys.has(k) && !to_keys.has(k)) {
      orphan_keys.push(k);
    }
  }
  if (orphan_keys.length > 0) {
    results.push({
      rule: "orphan_concept",
      level: "warn",
      message: `${orphan_keys.length} isolated concept${orphan_keys.length === 1 ? "" : "s"} with no edges`,
      conceptKeys: orphan_keys,
    });
  }

  //--------------------------------------------------
  // QUALITY WARN: partial rows (missing from/verb/to)
  //--------------------------------------------------
  if (partial_triples.length > 0) {
    results.push({
      rule: "partial_row",
      level: "warn",
      message: `${partial_triples.length} incomplete row${partial_triples.length === 1 ? "" : "s"} (missing from, verb, or to)`,
      tripleIds: partial_triples.map((t) => t.id),
    });
  }

  //--------------------------------------------------
  // QUALITY WARN: duplicate triples (same from/verb/to keys)
  //--------------------------------------------------
  const seen_triple_keys = new Set<string>();
  const duplicate_triple_ids: string[] = [];
  for (const t of complete_triples) {
    const triple_key =
      concept_key(t.from) + "\x00" + concept_key(t.verb) + "\x00" + concept_key(t.to);
    if (seen_triple_keys.has(triple_key)) {
      duplicate_triple_ids.push(t.id);
    } else {
      seen_triple_keys.add(triple_key);
    }
  }
  if (duplicate_triple_ids.length > 0) {
    results.push({
      rule: "duplicate_triple",
      level: "warn",
      message: `${duplicate_triple_ids.length} duplicate arrow${duplicate_triple_ids.length === 1 ? "" : "s"} (same from/verb/to)`,
      tripleIds: duplicate_triple_ids,
    });
  }

  //--------------------------------------------------
  // QUALITY WARN: self-loops (from and to normalize to same key)
  //--------------------------------------------------
  const self_loop_ids = complete_triples
    .filter((t) => concept_key(t.from) === concept_key(t.to))
    .map((t) => t.id);
  if (self_loop_ids.length > 0) {
    results.push({
      rule: "self_loop",
      level: "warn",
      message: `${self_loop_ids.length} self-loop${self_loop_ids.length === 1 ? "" : "s"} (from and to are the same concept)`,
      tripleIds: self_loop_ids,
    });
  }

  //--------------------------------------------------
  // QUALITY WARN: near-miss concept pairs (Levenshtein distance 1)
  //--------------------------------------------------
  const near_miss_pairs: [ConceptKey, ConceptKey][] = [];
  for (let i = 0; i < concept_keys_list.length; i++) {
    for (let j = i + 1; j < concept_keys_list.length; j++) {
      const ka = concept_keys_list[i] as ConceptKey;
      const kb = concept_keys_list[j] as ConceptKey;
      if (levenshtein_distance_at_most_1(ka, kb)) {
        near_miss_pairs.push([ka, kb]);
      }
    }
  }
  if (near_miss_pairs.length > 0) {
    const near_miss_keys = Array.from(new Set(near_miss_pairs.flatMap((pair) => pair)));
    results.push({
      rule: "near_miss_spelling",
      level: "warn",
      message: `${near_miss_pairs.length} near-miss concept pair${near_miss_pairs.length === 1 ? "" : "s"} (spelling differs by 1 edit)`,
      conceptKeys: near_miss_keys,
    });
  }

  return results;
}
