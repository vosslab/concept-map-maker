// pseudo_language.ts - CodeMirror 6 syntax highlighting for the pseudo-code
// flowchart language. Provides a StreamLanguage that classifies keywords,
// comments, strings, and numbers, plus a HighlightStyle that colors them.
//
// The classification here is intentionally line-oriented and lightweight: it is
// only for editor highlighting, not for parsing. The authoritative grammar lives
// in src/pseudo_lang/ (lexer + parser). Keep the keyword set in sync with the
// lexer's keyword handling so highlighting matches what actually parses.
//
// Reserved loop words (repeat/until) highlight as invalid so the user sees that
// they are recognized but unsupported, matching the parser's line-referenced
// "repeat/until loops are not supported" error.

import { StreamLanguage, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { StreamParser, StringStream } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import type { Tag } from "@lezer/highlight";

//============================================
// Keyword sets
//============================================

// Supported keywords. Lowercased for case-insensitive matching, mirroring the
// lexer which lowercases before classification. Multi-word forms such as
// "end if" highlight word-by-word because both "end" and "if" are keywords.
const KEYWORDS = new Set<string>([
  "start",
  "end",
  "if",
  "else",
  "while",
  "for",
  "call",
  "do",
  "input",
  "read",
  "prompt",
  "output",
  "print",
  "display",
  "set",
  "to",
  "from",
]);

// Reserved loop words that the grammar rejects. Highlighted as invalid.
const RESERVED = new Set<string>(["repeat", "until"]);

//============================================
// Token classifier
//============================================

// Classify the next token at the stream cursor. Returns a token name that the
// tokenTable maps to a highlight tag, or null for unstyled text. The stream is
// always advanced so the tokenizer cannot stall.
function pseudo_token(stream: StringStream): string | null {
  // skip a run of whitespace without emitting a token
  if (stream.eatSpace()) {
    return null;
  }
  // line comments: "//" or "#" run to the end of the line
  if (stream.match(/^\/\//)) {
    stream.skipToEnd();
    return "comment";
  }
  if (stream.match("#")) {
    stream.skipToEnd();
    return "comment";
  }
  // quoted strings; the trailing quote is optional so an unterminated string at
  // end of line still highlights rather than swallowing the next line
  if (stream.match(/^"([^"\\]|\\.)*"?/)) {
    return "string";
  }
  if (stream.match(/^'([^'\\]|\\.)*'?/)) {
    return "string";
  }
  // numeric literals (integer or decimal)
  if (stream.match(/^[0-9]+(\.[0-9]+)?/)) {
    return "number";
  }
  // identifiers and keywords. stream.match with a regex returns the match array
  // (or false/null when it does not match); narrow away the boolean form so the
  // match group can be indexed safely.
  const word_match = stream.match(/^[A-Za-z_][A-Za-z0-9_]*/);
  if (word_match && typeof word_match !== "boolean") {
    const matched = word_match[0] ?? "";
    const word = matched.toLowerCase();
    if (RESERVED.has(word)) {
      return "reserved";
    }
    if (KEYWORDS.has(word)) {
      return "keyword";
    }
    return null;
  }
  // any other single character (operators, punctuation) is unstyled
  stream.next();
  return null;
}

//============================================
// Token table and language
//============================================

// Map the token names returned by pseudo_token to lezer highlight tags. The
// "reserved" name maps to tags.invalid so reserved words read as errors.
const pseudo_token_table: Record<string, Tag> = {
  keyword: tags.keyword,
  comment: tags.comment,
  string: tags.string,
  number: tags.number,
  reserved: tags.invalid,
};

const pseudo_stream_parser: StreamParser<unknown> = {
  name: "pseudocode",
  token: pseudo_token,
  tokenTable: pseudo_token_table,
};

// The StreamLanguage instance for the pseudo-code source editor.
export const pseudo_language: StreamLanguage<unknown> = StreamLanguage.define(pseudo_stream_parser);

//============================================
// Highlight style
//============================================

// Colors are CSS custom properties with literal fallbacks, so a future theme can
// override them from stylesheet without changing this module, while the editor
// still renders sensible colors when no variables are defined.
const pseudo_highlight_style = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--cm-keyword, #1c6dd0)", fontWeight: "600" },
  { tag: tags.comment, color: "var(--cm-comment, #6a737d)", fontStyle: "italic" },
  { tag: tags.string, color: "var(--cm-string, #0a7d33)" },
  { tag: tags.number, color: "var(--cm-number, #b5690a)" },
  {
    tag: tags.invalid,
    color: "var(--cm-invalid, #d11)",
    textDecoration: "underline wavy",
  },
]);

//============================================
// pseudo_highlight
//============================================

// Combined extension: the pseudo-code language plus its highlight style. Pass
// this to an EditorState to enable line-oriented keyword highlighting.
export function pseudo_highlight(): Extension {
  const extension: Extension = [pseudo_language, syntaxHighlighting(pseudo_highlight_style)];
  return extension;
}
