// CSV/TSV codec for the Concept Map Maker app.
//
// This module is pure TypeScript with zero imports from Solid or the DOM.
// It handles:
//   - Paste from Excel/Google Sheets (TSV or CSV, with UTF-8 BOM, CRLF, quoted fields)
//   - Serializing triples to RFC4180 CSV for download
//   - Parsing a triples CSV back to row objects with fuzzy header detection

import type { Triple } from "./types.js";

//============================================
// Internal RFC4180 parser
//============================================

// Strip a leading UTF-8 BOM (U+FEFF) if present.
function strip_bom(text: string): string {
  // BOM is the first character when present
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

// Detect whether text is TSV: any tab character that is NOT inside a
// double-quoted field counts as a TSV delimiter signal.  We do a simple
// scan that tracks quote state.
function has_unquoted_tab(text: string): boolean {
  let in_quotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      // doubled quote inside a quoted field is an escaped quote, not a toggle
      if (in_quotes && text[i + 1] === '"') {
        // skip the second quote
        i++;
      } else {
        in_quotes = !in_quotes;
      }
    } else if (ch === "\t" && !in_quotes) {
      return true;
    }
  }
  return false;
}

// Parse a single RFC4180 field starting at position pos in text using sep as
// the field delimiter.  Returns [field_value, next_pos].
// next_pos points to the character AFTER the trailing delimiter (or end of string).
function parse_field(text: string, pos: number, sep: string): [string, number] {
  if (pos >= text.length) {
    return ["", pos];
  }

  if (text[pos] !== '"') {
    // unquoted field: read until sep, CR, or LF
    const sep_code = sep.charCodeAt(0);
    let end = pos;
    while (end < text.length) {
      const c = text.charCodeAt(end);
      if (c === sep_code || c === 13 /* CR */ || c === 10 /* LF */) {
        break;
      }
      end++;
    }
    const value = text.slice(pos, end);
    // advance past the delimiter if present
    let next = end;
    if (next < text.length && text.charCodeAt(next) === sep_code) {
      next++;
    }
    return [value, next];
  }

  // quoted field: read until closing unescaped double quote
  let i = pos + 1; // skip opening quote
  let value = "";
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      if (i + 1 < text.length && text[i + 1] === '"') {
        // doubled quote = literal quote
        value += '"';
        i += 2;
      } else {
        // closing quote
        i++;
        break;
      }
    } else {
      // normalize CRLF inside quoted fields to LF
      if (c === "\r" && i + 1 < text.length && text[i + 1] === "\n") {
        value += "\n";
        i += 2;
      } else {
        value += c;
        i++;
      }
    }
  }
  // skip the field separator after the closing quote (if present)
  const sep_code = sep.charCodeAt(0);
  if (i < text.length && text.charCodeAt(i) === sep_code) {
    i++;
  }
  return [value, i];
}

// Parse a full RFC4180 / TSV text into a 2-D array of strings.
// Handles BOM, CRLF, quoted fields with embedded delimiters and newlines,
// and doubled-quote escaping.
function parse_delimited(text: string, sep: string): string[][] {
  const clean = strip_bom(text);
  const rows: string[][] = [];
  let pos = 0;
  const len = clean.length;

  while (pos <= len) {
    // start of a new row
    const row: string[] = [];
    // parse fields until we hit a row terminator or end of string
    while (pos <= len) {
      const [field, next] = parse_field(clean, pos, sep);
      row.push(field);
      pos = next;
      // check what terminated this field
      if (pos > len) {
        // end of string
        break;
      }
      // parse_field does not consume the trailing newline; check charCodeAt(pos) for row end.
      // If pos points to CR or LF the row is done; otherwise the sep was consumed and the row continues.
      if (pos < len) {
        const next_c = clean.charCodeAt(pos);
        if (next_c === 13 /* CR */ || next_c === 10 /* LF */) {
          // end of row - advance past the newline(s)
          if (next_c === 13 && pos + 1 < len && clean.charCodeAt(pos + 1) === 10) {
            pos += 2; // CRLF
          } else {
            pos += 1; // bare CR or LF
          }
          break;
        }
        // otherwise the sep was consumed and we continue reading fields in this row
      } else {
        // end of string - done with both row and outer loop
        break;
      }
    }
    // skip entirely empty trailing row (happens when text ends with a newline)
    if (rows.length > 0 || row.some((f) => f !== "")) {
      rows.push(row);
    }
    if (pos >= len) {
      break;
    }
  }

  // drop a trailing row that is all empty strings (artifact of trailing newline)
  const last_row = rows[rows.length - 1];
  if (rows.length > 0 && last_row !== undefined && last_row.every((f) => f === "")) {
    rows.pop();
  }

  return rows;
}

//============================================
// parse_table_text
//============================================

/**
 * Parse pasted spreadsheet text (from Excel or Google Sheets clipboard) into
 * a 2-D array of cell strings.
 *
 * Detection rule: if any tab character appears outside a quoted field the
 * input is treated as TSV; otherwise it is parsed as RFC4180 CSV.
 *
 * Handles: UTF-8 BOM, CRLF line endings, quoted fields with embedded
 * delimiters and newlines, doubled-quote escaping.
 *
 * Args:
 *   text: raw clipboard string
 *
 * Returns:
 *   2-D array, outer = rows, inner = cell strings (never ragged: shorter rows
 *   padded to the width of the widest row with empty strings)
 */
export function parse_table_text(text: string): string[][] {
  const sep = has_unquoted_tab(text) ? "\t" : ",";
  const rows = parse_delimited(text, sep);
  if (rows.length === 0) {
    return rows;
  }
  // normalize to rectangular: pad shorter rows
  const width = Math.max(...rows.map((r) => r.length));
  for (const row of rows) {
    while (row.length < width) {
      row.push("");
    }
  }
  return rows;
}

//============================================
// serialize_triples_csv
//============================================

// RFC4180 quote a single field value if it contains comma, double quote, CR, or LF.
function quote_field(value: string): string {
  // fields requiring quoting: contain comma, double-quote, CR, or LF
  if (value.includes(",") || value.includes('"') || value.includes("\r") || value.includes("\n")) {
    // escape internal double quotes by doubling them
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  return value;
}

/**
 * Serialize an array of Triple objects to a RFC4180 CSV string suitable for
 * download and opening in Excel or Google Sheets.
 *
 * Header row: "this concept,verb phrase,points to this concept"
 * Line ending: CRLF (RFC4180 compliant, Excel-compatible).
 * Fields are quoted only when they contain commas, double quotes, or newlines.
 *
 * Args:
 *   triples: array of Triple objects
 *
 * Returns:
 *   RFC4180 CSV string ending with a trailing CRLF.
 */
export function serialize_triples_csv(triples: Triple[]): string {
  const CRLF = "\r\n";
  // header column names match the fuzzy token sets in parse_triples_csv
  const header = "this concept,verb phrase,points to this concept";
  const lines: string[] = [header];
  for (const t of triples) {
    const row = quote_field(t.from) + "," + quote_field(t.verb) + "," + quote_field(t.to);
    lines.push(row);
  }
  // join with CRLF and add trailing CRLF
  return lines.join(CRLF) + CRLF;
}

//============================================
// parse_triples_csv
//============================================

// Token sets for fuzzy header detection (lowercase).
const FROM_TOKENS = new Set(["from", "this concept", "concept", "source"]);
const VERB_TOKENS = new Set(["verb", "verb phrase", "relation", "label", "predicate"]);
const TO_TOKENS = new Set(["to", "points to this concept", "points to", "target", "destination"]);

// Return the column index in a header row that best matches the given token
// set, or -1 if no match is found.  Match is case-insensitive on the trimmed
// header cell value.
function find_col(header_row: string[], tokens: Set<string>): number {
  for (let i = 0; i < header_row.length; i++) {
    const cell = header_row[i];
    if (cell !== undefined && tokens.has(cell.trim().toLowerCase())) {
      return i;
    }
  }
  return -1;
}

/**
 * Parse a RFC4180 CSV string (exported triples) back into row objects.
 *
 * Header detection: the first row is checked case-insensitively against known
 * tokens for "from"/"this concept", "verb phrase", and "to"/"points to this
 * concept".  If all three columns are identified the first row is treated as a
 * header and skipped; otherwise the first row is treated as data and columns
 * are assumed to be in order: from, verb, to.
 *
 * Args:
 *   text: RFC4180 CSV string (may include BOM, CRLF)
 *
 * Returns:
 *   Object with a `rows` array of { from, verb, to } objects.  Blank rows
 *   (all three fields empty after trimming) are excluded.
 */
export function parse_triples_csv(text: string): {
  rows: { from: string; verb: string; to: string }[];
} {
  const raw = parse_delimited(text, ",");
  if (raw.length === 0) {
    return { rows: [] };
  }

  // attempt fuzzy header detection on the first row
  // raw.length > 0 is checked above, so raw[0] is safe; use a fallback to satisfy noUncheckedIndexedAccess
  const first = raw[0] ?? [];
  const from_col = find_col(first, FROM_TOKENS);
  const verb_col = find_col(first, VERB_TOKENS);
  const to_col = find_col(first, TO_TOKENS);

  let data_rows: string[][];
  let col_from: number;
  let col_verb: number;
  let col_to: number;

  if (from_col !== -1 && verb_col !== -1 && to_col !== -1) {
    // header detected: skip first row, use detected column indices
    data_rows = raw.slice(1);
    col_from = from_col;
    col_verb = verb_col;
    col_to = to_col;
  } else {
    // no header: assume order from, verb, to (columns 0, 1, 2)
    data_rows = raw;
    col_from = 0;
    col_verb = 1;
    col_to = 2;
  }

  const rows: { from: string; verb: string; to: string }[] = [];
  for (const row of data_rows) {
    // read fields using detected (or default) column indices
    // use nullish coalescing to satisfy noUncheckedIndexedAccess
    const from = col_from < row.length ? (row[col_from] ?? "").trim() : "";
    const verb = col_verb < row.length ? (row[col_verb] ?? "").trim() : "";
    const to = col_to < row.length ? (row[col_to] ?? "").trim() : "";
    // skip entirely blank rows
    if (from === "" && verb === "" && to === "") {
      continue;
    }
    rows.push({ from, verb, to });
  }

  return { rows };
}
