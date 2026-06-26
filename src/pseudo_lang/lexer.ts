// Pure lexer for the pseudo-code flowchart language.
//
// Converts source text into a flat list of line tokens. One logical token per
// non-blank source line. The lexer classifies each line by its leading keyword
// and records the indentation and colon information the parser needs to handle
// both indentation blocks and end-keyword blocks. No Solid or DOM imports.

// The kind of a single source line after classification.
export type TokenKind =
  | "start"
  | "end"
  | "end_if"
  | "end_while"
  | "end_for"
  | "else"
  | "if"
  | "while"
  | "for"
  | "comment"
  | "statement"
  | "reserved";

// One classified source line.
export interface LineToken {
  kind: TokenKind;
  line: number;
  indent: number;
  // Payload text. For "if" this is the condition; for "while"/"for" this is the
  // loop header without the keyword; for "comment" this is the comment body; for
  // "statement" this is the statement text with any inline comment stripped.
  text: string;
  // True when a header line ended with a trailing colon (indentation block).
  colon: boolean;
  // For comment lines: the original marker ("#" or "//").
  marker?: string;
}

//============================================
// collapse_ws
//============================================
// Trim the ends and collapse every run of internal whitespace to one space.
export function collapse_ws(text: string): string {
  const trimmed = text.trim();
  const collapsed = trimmed.replace(/\s+/g, " ");
  return collapsed;
}

//============================================
// slugify
//============================================
// Build a deterministic id slug from arbitrary statement text. Lowercase, then
// replace every run of non-alphanumeric characters with a single hyphen, and
// trim leading and trailing hyphens.
export function slugify(text: string): string {
  const lowered = text.toLowerCase();
  const hyphenated = lowered.replace(/[^a-z0-9]+/g, "-");
  const slug = hyphenated.replace(/^-+|-+$/g, "");
  return slug;
}

//============================================
// leading_indent
//============================================
// Count the leading whitespace characters of a raw source line. Tabs and
// spaces each count as one unit, so deeper bodies always compare greater than
// their header when the source indents consistently.
function leading_indent(raw_line: string): number {
  const match = raw_line.match(/^[\t ]*/);
  const indent = match ? match[0].length : 0;
  return indent;
}

//============================================
// strip_inline_comment
//============================================
// Remove a trailing inline comment ("# ..." or "// ...") from statement text,
// respecting single and double quoted strings so a marker inside a string is
// not treated as a comment. The returned text is right-trimmed.
export function strip_inline_comment(content: string): string {
  let in_single = false;
  let in_double = false;
  // walk each character tracking quote state to find an unquoted marker
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "'" && !in_double) {
      in_single = !in_single;
      continue;
    }
    if (ch === '"' && !in_single) {
      in_double = !in_double;
      continue;
    }
    if (in_single || in_double) {
      continue;
    }
    // a bare hash starts an inline comment
    if (ch === "#") {
      return content.slice(0, i).trimEnd();
    }
    // two slashes start an inline comment
    if (ch === "/" && content[i + 1] === "/") {
      return content.slice(0, i).trimEnd();
    }
  }
  return content;
}

//============================================
// classify_line
//============================================
// Classify a single trimmed, non-empty content line into a LineToken. The
// indent and line number are supplied by the caller.
function classify_line(content: string, line: number, indent: number): LineToken {
  // full-line comments are detected before any keyword handling
  if (content.startsWith("//")) {
    return {
      kind: "comment",
      line,
      indent,
      text: content.slice(2).trim(),
      colon: false,
      marker: "//",
    };
  }
  if (content.startsWith("#")) {
    return {
      kind: "comment",
      line,
      indent,
      text: content.slice(1).trim(),
      colon: false,
      marker: "#",
    };
  }

  // detect a trailing colon (indentation-block header marker) before splitting
  const has_colon = content.endsWith(":");
  // strip a single trailing colon for keyword and payload analysis
  const without_colon = has_colon ? content.slice(0, -1).trimEnd() : content;
  const lowered = without_colon.toLowerCase();

  // structural terminals and block closers
  if (lowered === "start") {
    return { kind: "start", line, indent, text: "", colon: has_colon };
  }
  if (lowered === "end") {
    return { kind: "end", line, indent, text: "", colon: has_colon };
  }
  if (/^end\s+if$/.test(lowered)) {
    return { kind: "end_if", line, indent, text: "", colon: has_colon };
  }
  if (/^end\s+while$/.test(lowered)) {
    return { kind: "end_while", line, indent, text: "", colon: has_colon };
  }
  if (/^end\s+for$/.test(lowered)) {
    return { kind: "end_for", line, indent, text: "", colon: has_colon };
  }
  if (lowered === "else") {
    return { kind: "else", line, indent, text: "", colon: has_colon };
  }

  // first word drives header and reserved-word classification
  const first_word = lowered.split(/\s+/)[0] ?? "";
  const remainder = collapse_ws(without_colon.slice(first_word.length));

  if (first_word === "repeat" || first_word === "until") {
    return { kind: "reserved", line, indent, text: collapse_ws(without_colon), colon: has_colon };
  }
  if (first_word === "if") {
    return { kind: "if", line, indent, text: remainder, colon: has_colon };
  }
  if (first_word === "while") {
    return { kind: "while", line, indent, text: remainder, colon: has_colon };
  }
  if (first_word === "for") {
    return { kind: "for", line, indent, text: remainder, colon: has_colon };
  }

  // everything else is an ordinary statement; strip any inline comment text
  const statement_text = collapse_ws(strip_inline_comment(content));
  return { kind: "statement", line, indent, text: statement_text, colon: false };
}

//============================================
// tokenize
//============================================
// Split source text into classified line tokens, skipping blank lines. Line
// numbers are 1-based against the original source so error messages line up.
export function tokenize(source: string): LineToken[] {
  const raw_lines = source.split("\n");
  const tokens: LineToken[] = [];
  for (let i = 0; i < raw_lines.length; i++) {
    const raw_line = raw_lines[i] ?? "";
    const content = raw_line.trim();
    // blank lines carry no token
    if (content.length === 0) {
      continue;
    }
    const indent = leading_indent(raw_line);
    const token = classify_line(content, i + 1, indent);
    tokens.push(token);
  }
  return tokens;
}
