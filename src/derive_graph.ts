// Pure derivation module: maps pseudo-code source text to a FlowGraph.
//
// The graph is derived from the source string: source text -> parse ->
// FlowGraph. A small one-entry memo avoids re-parsing identical source on
// repeated calls. No Solid or DOM imports.

import type { FlowGraph } from "./types";
import { parse_source } from "./pseudo_lang/parser";

// One-entry memo of the last source parsed and its resulting graph.
let cached_source: string | undefined;
let cached_graph: FlowGraph | undefined;

//============================================
// derive_graph
//============================================
// Parse pseudo-code source text into a FlowGraph. Returns the memoized graph
// when called again with the identical source string. Parsing failures raise a
// line-referenced error from the parser.
export function derive_graph(source: string): FlowGraph {
  if (cached_graph !== undefined && cached_source === source) {
    return cached_graph;
  }
  const graph = parse_source(source);
  cached_source = source;
  cached_graph = graph;
  return graph;
}
