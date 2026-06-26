// Example data module for the Pseudo-code Flowchart Editor.
//
// Exports EXAMPLES: the pseudo-code example library for the flowchart editor.
// Each source is canonical pseudo-code per docs/PSEUDO_CODE_FORMAT.md, so
// loading + Format is a no-op (normalize(source) === source).
//
// Source strings use colon headers, one-tab indented bodies, and end-keyword
// block closers (end if / end while / end for).

//============================================
// ExampleEntry (pseudo-code examples)
//============================================

// One entry in the pseudo-code example library.
export interface ExampleEntry {
  id: string;
  title: string;
  source: string;
}

//============================================
// Pseudo-code example sources
//============================================

// Password check: if/else decision with a simple authentication flow.
const password_check_source =
  "start\n" +
  "input password\n" +
  "if password == stored_password:\n" +
  '\toutput "Access granted"\n' +
  "else:\n" +
  '\toutput "Access denied"\n' +
  "end if\n" +
  "end";

// For loop sum: counted loop with a subroutine call and an accumulator.
const for_loop_sum_source =
  "start\n" +
  "set total to 0\n" +
  "for i from 1 to 3:\n" +
  "\tcall add_item\n" +
  "\tset total to total + i\n" +
  "end for\n" +
  "output total\n" +
  "end";

// While loop: count up until a limit then output the result.
const while_loop_source =
  "start\n" +
  "set count to 0\n" +
  "while count < 3:\n" +
  "\tset count to count + 1\n" +
  "end while\n" +
  "output count\n" +
  "end";

// If / else: branch on a numeric input and output the chosen value.
const if_else_source =
  "start\n" +
  "input x\n" +
  "if x > 0:\n" +
  "\toutput x\n" +
  "else:\n" +
  "\toutput 0\n" +
  "end if\n" +
  "end";

//============================================
// Exported example list (EXAMPLES)
//============================================

// All pseudo-code examples in display order. Ids are stable kebab-case.
export const EXAMPLES: readonly ExampleEntry[] = [
  {
    id: "password-check",
    title: "Password check",
    source: password_check_source,
  },
  {
    id: "for-loop-sum",
    title: "For loop sum",
    source: for_loop_sum_source,
  },
  {
    id: "while-loop",
    title: "While loop",
    source: while_loop_source,
  },
  {
    id: "if-else",
    title: "If / else",
    source: if_else_source,
  },
];
