// Pure normalize pass for the pseudo-code flowchart language.
//
// Rewrites any accepted block style (indentation, end-keyword, or a mix) into
// one canonical style: colon headers, one tab of indentation per block level,
// and explicit closing keywords (end if / end while / end for). Normalizing
// canonical source is a no-op, so normalize(normalize(x)) === normalize(x).
//
// No Solid or DOM imports.

import { parse_blocks } from "./parser";
import type { BlockNode } from "./parser";

//============================================
// serialize_block
//============================================
// Emit one block node as canonical source lines at the given depth, appending
// to the output buffer. Depth controls one tab of indentation per level.
function serialize_block(node: BlockNode, depth: number, out: string[]): void {
  const indent = "\t".repeat(depth);
  if (node.kind === "terminal") {
    out.push(`${indent}${node.which}`);
    return;
  }
  if (node.kind === "comment") {
    out.push(`${indent}# ${node.text}`);
    return;
  }
  if (node.kind === "statement") {
    out.push(`${indent}${node.text}`);
    return;
  }
  if (node.kind === "if") {
    // colon header, then the True body, optional else body, closing keyword
    out.push(`${indent}if ${node.condition}:`);
    serialize_body(node.then_body, depth + 1, out);
    if (node.else_body !== undefined) {
      out.push(`${indent}else:`);
      serialize_body(node.else_body, depth + 1, out);
    }
    out.push(`${indent}end if`);
    return;
  }
  // loop: colon header, body, matching closing keyword
  out.push(`${indent}${node.loop_kind} ${node.header}:`);
  serialize_body(node.body, depth + 1, out);
  out.push(`${indent}end ${node.loop_kind}`);
}

//============================================
// serialize_body
//============================================
// Emit a sequence of sibling block nodes at the given depth.
function serialize_body(list: BlockNode[], depth: number, out: string[]): void {
  for (const node of list) {
    serialize_block(node, depth, out);
  }
}

//============================================
// normalize
//============================================
// Parse the source into the block AST and re-serialize it into canonical style.
// Invalid input raises a line-referenced error from parse_blocks and is never
// rewritten.
export function normalize(source: string): string {
  const blocks = parse_blocks(source);
  const out: string[] = [];
  serialize_body(blocks, 0, out);
  const canonical = out.join("\n");
  return canonical;
}
