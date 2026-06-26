// Tests for src/csv_codec.ts
//
// Run with: node --import tsx --test tests/test_csv_codec.mjs
// All tests use node:test + node:assert and are self-contained.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parse_table_text, serialize_triples_csv, parse_triples_csv } from "../src/csv_codec.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

//============================================
// parse_table_text: TSV (tab-delimited)
//============================================

test("parse_table_text: TSV - basic three-column row", () => {
  const input = "a\tb\tc\n";
  const result = parse_table_text(input);
  assert.deepEqual(result, [["a", "b", "c"]]);
});

test("parse_table_text: TSV - multiple rows CRLF", () => {
  const input = "a\tb\tc\r\nd\te\tf\r\n";
  const result = parse_table_text(input);
  assert.deepEqual(result, [
    ["a", "b", "c"],
    ["d", "e", "f"],
  ]);
});

test("parse_table_text: TSV - BOM stripped", () => {
  // UTF-8 BOM is U+FEFF
  const input = "﻿first\tsecond\n";
  const result = parse_table_text(input);
  assert.deepEqual(result, [["first", "second"]]);
});

test("parse_table_text: TSV - honeybees fixture round-trip", () => {
  const text = readFileSync(join(FIXTURES, "honeybees_triples.tsv"), "utf8");
  const rows = parse_table_text(text);
  // first row is the header
  assert.deepEqual(rows[0], ["this concept", "verb phrase", "points to this concept"]);
  // check a known data row
  assert.deepEqual(rows[1], ["Honeybees", "are socially divided into", "Castes"]);
});

test("parse_table_text: TSV - quoted field with embedded tab", () => {
  // A cell that literally contains a tab must be double-quoted for TSV
  const input = '"a\tb"\tc\n';
  const result = parse_table_text(input);
  // "a\tb" should be unquoted to one cell
  assert.equal(result[0][0], "a\tb");
  assert.equal(result[0][1], "c");
});

test("parse_table_text: TSV - quoted field with embedded newline", () => {
  // Quoted cell spanning two visual lines
  const input = '"line1\nline2"\tb\n';
  const result = parse_table_text(input);
  assert.equal(result[0][0], "line1\nline2");
  assert.equal(result[0][1], "b");
});

test("parse_table_text: TSV - doubled quotes inside quoted field", () => {
  const input = '"say ""hi"""\tb\n';
  const result = parse_table_text(input);
  assert.equal(result[0][0], 'say "hi"');
});

//============================================
// parse_table_text: CSV (comma-delimited)
//============================================

test("parse_table_text: CSV - basic row (no tabs)", () => {
  const input = "a,b,c\n";
  const result = parse_table_text(input);
  assert.deepEqual(result, [["a", "b", "c"]]);
});

test("parse_table_text: CSV - quoted field with embedded comma", () => {
  const input = '"hello, world",two,three\n';
  const result = parse_table_text(input);
  assert.deepEqual(result, [["hello, world", "two", "three"]]);
});

test("parse_table_text: CSV - CRLF line endings", () => {
  const input = "a,b\r\nc,d\r\n";
  const result = parse_table_text(input);
  assert.deepEqual(result, [
    ["a", "b"],
    ["c", "d"],
  ]);
});

test("parse_table_text: CSV - quoted field spanning lines (Excel style)", () => {
  // Excel wraps cells with CRLF inside double quotes
  const input = '"first\r\nsecond",b\r\n';
  const result = parse_table_text(input);
  assert.equal(result[0][0], "first\nsecond");
  assert.equal(result[0][1], "b");
});

test("parse_table_text: CSV - BOM stripped on CSV input", () => {
  const input = "﻿x,y\n";
  const result = parse_table_text(input);
  assert.deepEqual(result, [["x", "y"]]);
});

test("parse_table_text: empty string returns empty array", () => {
  const result = parse_table_text("");
  assert.deepEqual(result, []);
});

test("parse_table_text: rows padded to same width", () => {
  // row 1 has 3 cols, row 2 has 2 cols
  const input = "a,b,c\nd,e\n";
  const result = parse_table_text(input);
  assert.equal(result[1].length, 3);
  assert.equal(result[1][2], "");
});

//============================================
// serialize_triples_csv
//============================================

test("serialize_triples_csv: header row present", () => {
  const csv = serialize_triples_csv([]);
  const first_line = csv.split("\r\n")[0];
  assert.equal(first_line, "this concept,verb phrase,points to this concept");
});

test("serialize_triples_csv: simple triple serialized correctly", () => {
  const triples = [{ id: "1", from: "Bees", verb: "pollinate", to: "Flowers" }];
  const csv = serialize_triples_csv(triples);
  const lines = csv.split("\r\n").filter((l) => l !== "");
  assert.equal(lines[1], "Bees,pollinate,Flowers");
});

test("serialize_triples_csv: field with comma is quoted", () => {
  const triples = [{ id: "1", from: "A, B", verb: "goes to", to: "C" }];
  const csv = serialize_triples_csv(triples);
  const data_line = csv.split("\r\n")[1];
  assert.equal(data_line, '"A, B",goes to,C');
});

test("serialize_triples_csv: field with double quote is escaped", () => {
  const triples = [{ id: "1", from: 'say "hi"', verb: "to", to: "C" }];
  const csv = serialize_triples_csv(triples);
  const data_line = csv.split("\r\n")[1];
  assert.equal(data_line, '"say ""hi""",to,C');
});

test("serialize_triples_csv: CRLF line endings throughout", () => {
  const triples = [{ id: "1", from: "A", verb: "B", to: "C" }];
  const csv = serialize_triples_csv(triples);
  // every line ending must be CRLF
  assert.ok(csv.includes("\r\n"));
  // no bare LF (only \n not preceded by \r)
  const bare_lf = csv.replace(/\r\n/g, "").includes("\n");
  assert.equal(bare_lf, false);
});

test("serialize_triples_csv: trailing CRLF present", () => {
  const triples = [{ id: "1", from: "A", verb: "B", to: "C" }];
  const csv = serialize_triples_csv(triples);
  assert.ok(csv.endsWith("\r\n"));
});

//============================================
// parse_triples_csv: round-trip
//============================================

test("parse_triples_csv: round-trip with serialize_triples_csv", () => {
  const original = [
    { id: "1", from: "Bees", verb: "pollinate", to: "Flowers" },
    { id: "2", from: "Flowers", verb: "produce", to: "Nectar" },
  ];
  const csv = serialize_triples_csv(original);
  const { rows } = parse_triples_csv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].from, "Bees");
  assert.equal(rows[0].verb, "pollinate");
  assert.equal(rows[0].to, "Flowers");
  assert.equal(rows[1].from, "Flowers");
  assert.equal(rows[1].to, "Nectar");
});

test("parse_triples_csv: round-trip preserves fields with commas and quotes", () => {
  const original = [{ id: "1", from: 'A, "B"', verb: "maps, to", to: "C" }];
  const csv = serialize_triples_csv(original);
  const { rows } = parse_triples_csv(csv);
  assert.equal(rows[0].from, 'A, "B"');
  assert.equal(rows[0].verb, "maps, to");
  assert.equal(rows[0].to, "C");
});

test("parse_triples_csv: fuzzy header - 'from' and 'to' columns detected", () => {
  const csv = "from,verb phrase,to\r\nA,goes,B\r\n";
  const { rows } = parse_triples_csv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].from, "A");
  assert.equal(rows[0].to, "B");
});

test("parse_triples_csv: fuzzy header - case-insensitive detection", () => {
  const csv = "FROM,VERB PHRASE,POINTS TO THIS CONCEPT\r\nX,Y,Z\r\n";
  const { rows } = parse_triples_csv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].from, "X");
});

test("parse_triples_csv: no header - first row treated as data", () => {
  // No recognizable header tokens - first row should be a data row
  const csv = "Bees,pollinate,Flowers\r\nFlowers,produce,Nectar\r\n";
  const { rows } = parse_triples_csv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].from, "Bees");
});

test("parse_triples_csv: blank rows are skipped", () => {
  const csv = "this concept,verb phrase,points to this concept\r\nA,B,C\r\n,,\r\nD,E,F\r\n";
  const { rows } = parse_triples_csv(csv);
  assert.equal(rows.length, 2);
});

test("parse_triples_csv: empty input returns empty rows", () => {
  const { rows } = parse_triples_csv("");
  assert.deepEqual(rows, []);
});

test("parse_triples_csv: BOM stripped before parsing", () => {
  const csv = "﻿this concept,verb phrase,points to this concept\r\nA,B,C\r\n";
  const { rows } = parse_triples_csv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].from, "A");
});

//============================================
// End-to-end: honeybees TSV via parse_table_text -> parse_triples_csv
//============================================

test("honeybees TSV: parse_table_text produces correct triples data", () => {
  const text = readFileSync(join(FIXTURES, "honeybees_triples.tsv"), "utf8");
  // parse_table_text detects TSV (tabs present)
  const rows = parse_table_text(text);
  // skip header row, map to triple-like objects
  const data = rows.slice(1).filter((r) => r.some((c) => c !== ""));
  const triples = data.map((r) => ({ from: r[0], verb: r[1], to: r[2] }));
  // Female appears as "to" in multiple rows (multi-input sink concept)
  const to_female = triples.filter((t) => t.to === "Female");
  assert.ok(to_female.length > 0, "Female should appear as destination in at least one triple");
});
