// Pure parser for the pseudo-code flowchart language.
//
// Two stages:
//   1. parse_blocks: line tokens -> a block AST that supports both indentation
//      blocks (colon headers, closed by dedent) and end-keyword blocks (closed
//      by "end if" / "end while" / "end for").
//   2. build_graph: block AST -> a FlowGraph with shaped nodes, branch-labeled
//      decision and loop edges, loop back-edges, dashed comment edges, and the
//      structural connector nodes required at branch rejoins and loop exits.
//
// No Solid or DOM imports.

import type { FlowGraph, FlowNode, FlowEdge, NodeShape, FlowEdgeBranch } from "../types";
import { tokenize, slugify } from "./lexer";
import type { LineToken } from "./lexer";

//============================================
// Block AST
//============================================

// A leaf statement (io, process, subroutine, or terminal).
export interface StatementNode {
  kind: "statement";
  shape: NodeShape;
  text: string;
  line: number;
}

// A full-line comment node.
export interface CommentNode {
  kind: "comment";
  text: string;
  line: number;
}

// A start or end terminal line written explicitly in the source.
export interface TerminalNode {
  kind: "terminal";
  which: "start" | "end";
  line: number;
}

// An if / else decision block.
export interface IfNode {
  kind: "if";
  condition: string;
  line: number;
  then_body: BlockNode[];
  else_body?: BlockNode[];
}

// A while or for loop block.
export interface LoopNode {
  kind: "loop";
  loop_kind: "while" | "for";
  header: string;
  line: number;
  body: BlockNode[];
}

export type BlockNode = StatementNode | CommentNode | TerminalNode | IfNode | LoopNode;

//============================================
// classify_statement_shape
//============================================
// Assign the flowchart shape to a plain statement line using the first matching
// rule. Block headers and comments are handled by the parser, not here.
function classify_statement_shape(text: string): NodeShape {
  const first_word = text.toLowerCase().split(/\s+/)[0];
  // subroutine calls
  if (first_word === "call" || first_word === "do") {
    return "subroutine";
  }
  // input/output statements render as parallelograms
  const io_words = ["input", "read", "prompt", "output", "print", "display"];
  if (io_words.includes(first_word ?? "")) {
    return "io";
  }
  // anything else is a process rectangle
  return "process";
}

//============================================
// parse error helper
//============================================
// Build a line-referenced Error so every failure points at a source line.
function parse_error(line: number, message: string): Error {
  const error = new Error(`Line ${line}: ${message}`);
  return error;
}

//============================================
// is_closer
//============================================
// True when a token closes or splits an open block (a block-terminating token).
function is_closer(token: LineToken): boolean {
  const closing =
    token.kind === "end_if" ||
    token.kind === "end_while" ||
    token.kind === "end_for" ||
    token.kind === "else";
  return closing;
}

//============================================
// Block parser
//============================================
// Recursive-descent parser over the flat token list. A small cursor object
// carries the shared position so helper functions can advance it.

interface Cursor {
  tokens: LineToken[];
  pos: number;
}

// Parse a run of sibling block nodes. Termination depends on block style:
//   - colon_mode blocks stop on a dedent to header_indent or any closer token;
//   - end-keyword blocks ignore indentation and stop only on a closer token.
// Top-level parsing passes colon_mode = false and header_indent = -1 so the
// sequence runs until a stray closer or the end of input.
function parse_block_body(cursor: Cursor, header_indent: number, colon_mode: boolean): BlockNode[] {
  const nodes: BlockNode[] = [];
  while (cursor.pos < cursor.tokens.length) {
    const token = cursor.tokens[cursor.pos];
    if (token === undefined) {
      throw new Error("internal: cursor out of bounds");
    }
    // a closer always ends the current body; the caller validates the match
    if (is_closer(token)) {
      break;
    }
    // indentation blocks end when a line dedents to or below the header
    if (colon_mode && token.indent <= header_indent) {
      break;
    }
    const node = parse_node(cursor);
    nodes.push(node);
  }
  return nodes;
}

// Parse a single block node starting at the cursor.
function parse_node(cursor: Cursor): BlockNode {
  const token = cursor.tokens[cursor.pos];
  if (token === undefined) {
    throw new Error("internal: cursor out of bounds");
  }
  if (token.kind === "reserved") {
    throw parse_error(token.line, "repeat/until loops are not supported. Use while or for.");
  }
  if (token.kind === "if") {
    return parse_if(cursor);
  }
  if (token.kind === "while" || token.kind === "for") {
    return parse_loop(cursor);
  }
  if (token.kind === "comment") {
    cursor.pos++;
    return { kind: "comment", text: token.text, line: token.line };
  }
  if (token.kind === "start" || token.kind === "end") {
    cursor.pos++;
    return { kind: "terminal", which: token.kind, line: token.line };
  }
  // ordinary statement line
  cursor.pos++;
  const shape = classify_statement_shape(token.text);
  return { kind: "statement", shape, text: token.text, line: token.line };
}

// Parse an if block. Handles colon (indentation) and end-keyword styles, plus
// an optional else branch.
function parse_if(cursor: Cursor): IfNode {
  const header = cursor.tokens[cursor.pos];
  if (header === undefined) {
    throw new Error("internal: cursor out of bounds");
  }
  cursor.pos++;
  const colon_mode = header.colon;
  // parse the then-body
  const then_body = parse_block_body(cursor, header.indent, colon_mode);
  // colon headers require an actual indented body
  if (colon_mode && then_body.length === 0) {
    throw parse_error(header.line, "expected an indented block after 'if ...:'");
  }
  let else_body: BlockNode[] | undefined;
  // an else token splits the decision into a false-body
  const after_then = cursor.tokens[cursor.pos];
  if (after_then && after_then.kind === "else") {
    cursor.pos++;
    else_body = parse_block_body(cursor, header.indent, colon_mode);
    if (colon_mode && else_body.length === 0) {
      throw parse_error(after_then.line, "expected an indented block after 'else'");
    }
  }
  // consume the closing keyword: required for end-keyword style, optional for
  // colon style (already closed by dedent or end of input)
  const closer = cursor.tokens[cursor.pos];
  if (closer && closer.kind === "end_if") {
    cursor.pos++;
  } else if (!colon_mode) {
    throw parse_error(header.line, "missing 'end if'");
  } else if (closer && is_closer(closer) && closer.kind !== "end_if") {
    throw parse_error(closer.line, `unexpected '${closer_label(closer)}'`);
  }
  const node: IfNode = { kind: "if", condition: header.text, line: header.line, then_body };
  if (else_body !== undefined) {
    node.else_body = else_body;
  }
  return node;
}

// Parse a while or for loop block.
function parse_loop(cursor: Cursor): LoopNode {
  const header = cursor.tokens[cursor.pos];
  if (header === undefined) {
    throw new Error("internal: cursor out of bounds");
  }
  cursor.pos++;
  const loop_kind = header.kind === "while" ? "while" : "for";
  const colon_mode = header.colon;
  const body = parse_block_body(cursor, header.indent, colon_mode);
  if (colon_mode && body.length === 0) {
    throw parse_error(header.line, `expected an indented block after '${loop_kind} ...:'`);
  }
  const expected_end = loop_kind === "while" ? "end_while" : "end_for";
  const closer = cursor.tokens[cursor.pos];
  if (closer && closer.kind === expected_end) {
    cursor.pos++;
  } else if (!colon_mode) {
    throw parse_error(header.line, `missing 'end ${loop_kind}'`);
  } else if (closer && is_closer(closer) && closer.kind !== expected_end) {
    throw parse_error(closer.line, `unexpected '${closer_label(closer)}'`);
  }
  const node: LoopNode = { kind: "loop", loop_kind, header: header.text, line: header.line, body };
  return node;
}

// Human-readable label for a closer token, used in error messages.
function closer_label(token: LineToken): string {
  if (token.kind === "end_if") {
    return "end if";
  }
  if (token.kind === "end_while") {
    return "end while";
  }
  if (token.kind === "end_for") {
    return "end for";
  }
  return "else";
}

//============================================
// parse_blocks
//============================================
// Parse source text into the block AST. Raises a line-referenced error on any
// structural problem (missing end keyword, dedent below a colon header, stray
// else or end keyword, reserved repeat/until).
export function parse_blocks(source: string): BlockNode[] {
  const tokens = tokenize(source);
  const cursor: Cursor = { tokens, pos: 0 };
  // top-level sequence: indentation never terminates it, only a stray closer
  const nodes = parse_block_body(cursor, -1, false);
  if (cursor.pos < tokens.length) {
    const stray = tokens[cursor.pos]!;
    throw parse_error(stray.line, `unexpected '${closer_label(stray)}'`);
  }
  return nodes;
}

//============================================
// Graph builder
//============================================
// Walk the block AST and emit a FlowGraph. The builder threads two pieces of
// state through the recursion: outgoing tails (predecessor node ids that need a
// flow edge into the next executable node) and pending comments (comment node
// ids awaiting a dashed edge to the next executable node).

// One incoming edge request into the next executable node.
interface EdgeSpec {
  from: string;
  branch?: FlowEdgeBranch;
}

// Result of emitting a sequence of block nodes.
interface SequenceResult {
  tails: string[];
  pending: string[];
}

// Mutable accumulator shared across the recursive emit functions.
interface GraphBuilder {
  nodes: FlowNode[];
  edges: FlowEdge[];
  id_counts: Map<string, number>;
  edge_seq: number;
}

// Reserve a unique node id, appending an ordinal only when the same base id
// already exists (the same statement repeated within the document).
function reserve_id(builder: GraphBuilder, base: string): string {
  const count = builder.id_counts.get(base) ?? 0;
  builder.id_counts.set(base, count + 1);
  if (count === 0) {
    return base;
  }
  const ordinal_id = `${base}-${count + 1}`;
  return ordinal_id;
}

// Append a node to the graph.
function add_node(
  builder: GraphBuilder,
  id: string,
  shape: NodeShape,
  text: string,
  line: number,
): void {
  builder.nodes.push({ id, shape, text, line });
}

// Append an edge to the graph with a sequential id.
function add_edge(
  builder: GraphBuilder,
  from: string,
  to: string,
  kind: FlowEdge["kind"],
  branch?: FlowEdgeBranch,
): void {
  builder.edge_seq += 1;
  const edge: FlowEdge = { id: `e${builder.edge_seq}`, from, to, kind };
  if (branch !== undefined) {
    edge.branch = branch;
  }
  builder.edges.push(edge);
}

// Connect every incoming spec to a freshly created entry node.
function connect_incoming(builder: GraphBuilder, incoming: EdgeSpec[], entry_id: string): void {
  for (const spec of incoming) {
    add_edge(builder, spec.from, entry_id, "flow", spec.branch);
  }
}

// Attach each pending comment to a target node with a dashed comment edge.
function attach_comments(builder: GraphBuilder, pending: string[], target_id: string): void {
  for (const comment_id of pending) {
    add_edge(builder, comment_id, target_id, "comment");
  }
}

// Build the structural header key for a decision or loop, e.g. the key that
// "if password == stored_password" and "for i from 1 to 3" share with their
// connector ids.
function header_key(keyword: string, header_text: string): string {
  const key = slugify(`${keyword} ${header_text}`);
  return key;
}

// Emit a sequence of sibling block nodes. The incoming specs connect to the
// first executable node; pending comments seed the comment queue.
function emit_sequence(
  builder: GraphBuilder,
  list: BlockNode[],
  path: string,
  incoming: EdgeSpec[],
  pending: string[],
): SequenceResult {
  // tails are the predecessor ids feeding the next executable node
  let tails: EdgeSpec[] = incoming;
  let comment_queue = pending;
  for (const node of list) {
    if (node.kind === "terminal") {
      // explicit start/end lines are dropped; the builder synthesizes terminals
      continue;
    }
    if (node.kind === "comment") {
      const comment_id = reserve_id(builder, `c:${slugify(node.text)}`);
      add_node(builder, comment_id, "comment", node.text, node.line);
      comment_queue = [...comment_queue, comment_id];
      continue;
    }
    // executable node: emit it, wiring incoming tails and pending comments
    const result = emit_executable(builder, node, path, tails, comment_queue);
    tails = result.tails.map((id) => ({ from: id }));
    comment_queue = [];
  }
  const plain_tails = tails.map((spec) => spec.from);
  const sequence_result: SequenceResult = { tails: plain_tails, pending: comment_queue };
  return sequence_result;
}

// Emit one executable block node (statement, if, or loop). Returns the tail ids
// that should flow into the next sequential node.
function emit_executable(
  builder: GraphBuilder,
  node: StatementNode | IfNode | LoopNode,
  path: string,
  incoming: EdgeSpec[],
  pending: string[],
): { tails: string[] } {
  if (node.kind === "statement") {
    const id = reserve_id(builder, `n:${slugify(node.text)}`);
    add_node(builder, id, node.shape, node.text, node.line);
    connect_incoming(builder, incoming, id);
    attach_comments(builder, pending, id);
    return { tails: [id] };
  }
  if (node.kind === "if") {
    return emit_if(builder, node, path, incoming, pending);
  }
  return emit_loop(builder, node, path, incoming, pending);
}

// Emit a decision diamond, its branch bodies, and the rejoin connector.
function emit_if(
  builder: GraphBuilder,
  node: IfNode,
  path: string,
  incoming: EdgeSpec[],
  pending: string[],
): { tails: string[] } {
  const key = header_key("if", node.condition);
  const decision_id = reserve_id(builder, `n:${key}`);
  add_node(builder, decision_id, "decision", node.condition, node.line);
  connect_incoming(builder, incoming, decision_id);
  attach_comments(builder, pending, decision_id);

  const child_path = `${path}/${key}`;
  // the then-body enters from the decision on the True branch
  const then_result = emit_sequence(
    builder,
    node.then_body,
    child_path,
    [{ from: decision_id, branch: "true" }],
    [],
  );
  const connector_id = `conn:if:${path}:${key}`;

  if (node.else_body !== undefined) {
    // the else-body enters from the decision on the False branch
    const else_result = emit_sequence(
      builder,
      node.else_body,
      child_path,
      [{ from: decision_id, branch: "false" }],
      [],
    );
    add_node(builder, connector_id, "connector", "", node.line);
    for (const tail of then_result.tails) {
      add_edge(builder, tail, connector_id, "flow");
    }
    attach_comments(builder, then_result.pending, connector_id);
    for (const tail of else_result.tails) {
      add_edge(builder, tail, connector_id, "flow");
    }
    attach_comments(builder, else_result.pending, connector_id);
  } else {
    add_node(builder, connector_id, "connector", "", node.line);
    for (const tail of then_result.tails) {
      add_edge(builder, tail, connector_id, "flow");
    }
    attach_comments(builder, then_result.pending, connector_id);
    // with no else, the False branch flows straight to the rejoin connector
    add_edge(builder, decision_id, connector_id, "flow", "false");
  }
  return { tails: [connector_id] };
}

// Emit a loop hexagon, its body, the back-edge, and the exit connector.
function emit_loop(
  builder: GraphBuilder,
  node: LoopNode,
  path: string,
  incoming: EdgeSpec[],
  pending: string[],
): { tails: string[] } {
  const key = header_key(node.loop_kind, node.header);
  const loop_id = reserve_id(builder, `n:${key}`);
  add_node(builder, loop_id, "loop", `${node.loop_kind} ${node.header}`, node.line);
  connect_incoming(builder, incoming, loop_id);
  attach_comments(builder, pending, loop_id);

  const child_path = `${path}/${key}`;
  // the body enters from the loop header on the True branch
  const body_result = emit_sequence(
    builder,
    node.body,
    child_path,
    [{ from: loop_id, branch: "true" }],
    [],
  );
  // the body tail returns to the loop header along a back-edge
  for (const tail of body_result.tails) {
    add_edge(builder, tail, loop_id, "back");
  }
  const connector_id = `conn:${node.loop_kind}:${path}:${key}`;
  add_node(builder, connector_id, "connector", "", node.line);
  // the loop exits to the connector on the False branch
  add_edge(builder, loop_id, connector_id, "flow", "false");
  attach_comments(builder, body_result.pending, connector_id);
  return { tails: [connector_id] };
}

// Find an explicit terminal line of a given kind anywhere in the AST top level.
function find_terminal(list: BlockNode[], which: "start" | "end"): TerminalNode | undefined {
  for (const node of list) {
    if (node.kind === "terminal" && node.which === which) {
      return node;
    }
  }
  return undefined;
}

//============================================
// build_graph
//============================================
// Build a FlowGraph from a block AST. A single Start terminal is synthesized at
// the front and a single End terminal at the back; explicit start/end lines in
// the source are absorbed into these synthesized terminals.
export function build_graph(blocks: BlockNode[]): FlowGraph {
  const builder: GraphBuilder = { nodes: [], edges: [], id_counts: new Map(), edge_seq: 0 };

  // synthesize the Start terminal, reusing an explicit start line number if any
  const explicit_start = find_terminal(blocks, "start");
  const start_line = explicit_start ? explicit_start.line : 0;
  add_node(builder, "start", "terminal", "Start", start_line);

  // emit the body, flowing out of Start and into the synthesized End
  const result = emit_sequence(builder, blocks, "root", [{ from: "start" }], []);

  const explicit_end = find_terminal(blocks, "end");
  const end_line = explicit_end ? explicit_end.line : 0;
  add_node(builder, "end", "terminal", "End", end_line);
  for (const tail of result.tails) {
    add_edge(builder, tail, "end", "flow");
  }
  // trailing comments attach to the End terminal
  attach_comments(builder, result.pending, "end");

  const graph: FlowGraph = { nodes: builder.nodes, edges: builder.edges };
  return graph;
}

//============================================
// parse_source
//============================================
// Convenience: parse source text straight to a FlowGraph.
export function parse_source(source: string): FlowGraph {
  const blocks = parse_blocks(source);
  const graph = build_graph(blocks);
  return graph;
}
