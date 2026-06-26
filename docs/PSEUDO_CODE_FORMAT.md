# Pseudo-code format

This document defines the pseudo-code source format for the flowchart editor. The
source text is the user-facing contract: parser, renderer, templates, save/load,
and tests should all agree with this syntax.

## Core rules

- Write one statement per line.
- Blank lines are ignored.
- Leading indentation is meaningful inside blocks.
- Tabs are the canonical indentation unit after normalization.
- Keywords are case-insensitive on input.
- Branch labels render as `True` and `False`.
- Use branch labels only on decision and loop edges.
- A missing `start` or `end` terminal is auto-added to the graph.

## Shape syntax

| Shape | Flowchart meaning | Syntax |
| --- | --- | --- |
| `terminal` | Oval start/end node | `start`, `end` |
| `io` | Parallelogram input/output node | `input X`, `read X`, `prompt X`, `output X`, `print X`, `display X` |
| `process` | Rectangle process node | `X = expr`, `set X to expr`, or any unmatched statement |
| `decision` | Diamond branch node | `if CONDITION` or `if CONDITION:` |
| `loop` | Hexagon loop node | `while CONDITION` or `for ...`, with optional `:` |
| `subroutine` | Double-rectangle call node | `call NAME`, `do NAME` |
| `comment` | Open rectangle note node | `# text`, `// text` |
| `connector` | Circle join node | Generated at branch rejoins and loop exits |

The parser assigns the shape from the first matching rule in the table. A statement
that is not a known keyword form becomes a `process` rectangle.

Reserved loop words:

- The pseudo-code language supports `while` and `for` loops.
- `repeat` and `until` are unsupported reserved loop words.
- Parser-facing error text: `repeat/until loops are not supported. Use while or for.`
- The error includes the source line number.

## Block styles

The editor accepts both indentation blocks and end-keyword blocks on input.

| Opener form | Opens | Closes on |
| --- | --- | --- |
| `if x > 0:` | Indented decision body | Dedent to the header indentation |
| `if x > 0` | End-keyword decision body | `end if` |
| `while x < 5:` | Indented loop body | Dedent to the header indentation |
| `while x < 5` | End-keyword loop body | `end while` |
| `for i from 1 to 3:` | Indented loop body | Dedent to the header indentation |
| `for i from 1 to 3` | End-keyword loop body | `end for` |

The editor preserves source text exactly while the user types. Mixed input is
accepted when it is structurally unambiguous. After a successful
`Update Flowchart` submit, the normalize pass rewrites the editor text to the
canonical style:

- headers end with `:`;
- bodies are indented with one tab per block level;
- decisions close with `end if`;
- `while` loops close with `end while`;
- `for` loops close with `end for`;
- normalizing canonical source is a no-op.

Canonicalization runs only after a successful parse. The triggers are a
successful `Update Flowchart` submit, the `Format` action, Save Source, and Save
Project. Saving a mixed `.pseudo` file therefore rewrites it to the canonical
style on disk. Invalid input is never normalized: malformed input raises a
line-referenced error, and the editor keeps the draft text unchanged and the
graph unchanged when parsing fails.

## Submit behavior

The editor uses a submit-based parsing model.

- The editor preserves source text while the user types.
- The graph updates only when the user clicks `Update Flowchart`.
- On submit, the app parses the source.
- If parsing succeeds, the graph updates and the editor source is rewritten into
  canonical style.
- If parsing fails, the graph remains unchanged, the source remains unchanged, and
  a line-referenced error appears.
- `draftSource` stores the text currently visible in the editor.
- `submittedSource` stores the last source text that successfully updated the graph.
- `lastValidGraph` stores the graph derived from `submittedSource`.
- `parseError` stores the current line-referenced error, when a submit fails.
- Typing changes `draftSource` only.
- Clicking `Update Flowchart` parses `draftSource`.
- On success, the editor updates `lastValidGraph`, rewrites `draftSource` and
  `submittedSource` to canonical style, and clears `parseError`.
- On failure, the editor keeps `draftSource`, `submittedSource`, and
  `lastValidGraph` unchanged, then sets `parseError`.

## Decision semantics

An `if` statement creates a `decision` diamond.

- The edge from the decision to the then-body is labeled `True`.
- The edge from the decision to the else-body is labeled `False`.
- If there is no `else`, the `False` edge goes to the branch rejoin connector.
- `else` closes the current then-body and opens the nearest decision's false-body.
- Both branch tails connect to one generated `connector` circle before the next
  sequential statement.

Canonical form:

```text
if password == stored_password:
	output "Access granted"
else:
	output "Access denied"
end if
```

## Loop semantics

The pseudo-code language supports `while` and `for` loop statements. Each creates
a `loop` hexagon.

- The edge from the loop header into the body is labeled `True`.
- The body tail connects back to the loop header with edge kind `back`.
- The exit edge is labeled `False`.
- A generated `connector` circle represents the loop exit before the next
  sequential statement.
- The loop connector is generated only for the exit path, not for each body line.

`repeat`/`until` is not part of this grammar because it tests the condition after
the body, which reverses the usual branch-label meaning. To keep the flowchart
model simple and consistent, all supported loops use the same visual contract:
`True` enters or continues the loop body, and `False` exits the loop.

Parser-facing unsupported-loop error:

```text
repeat/until loops are not supported. Use while or for.
```

The error is line-referenced.

Canonical `while` and `for` loops:

```text
while attempts < 3:
	input password
	attempts = attempts + 1
end while

for i from 1 to 3:
	output i
end for
```

## Comment semantics

Full-line comments create `comment` nodes. The parser attaches a comment to the
next executable node by an edge with kind `comment`, which renders dashed. The
main sequential flow continues through executable nodes only.

Comment edge cases:

- Inline comments, such as `input password # typed by user`, stay on the same
  source line. The parser ignores the inline comment text for statement
  classification and does not create a separate comment node.
- Multiple consecutive full-line comments each create a `comment` node. Each
  comment node attaches by its own dashed edge to the same next executable node.
- A trailing comment, a full-line comment with no executable statement after it,
  attaches to the `End` terminal. This holds when the `end` terminal is
  auto-added, so a comment on the last line of the document attaches to `End`.
- A full-line comment immediately before an auto-added `end` terminal attaches to
  the `End` terminal.
- A full-line comment immediately before `end if`, `end while`, or `end for`
  attaches to the generated connector for that block. If the block has no
  connector, it attaches to the next executable node after the block.

```text
# Ask before checking the password
input password
```

This creates a dashed edge from the comment node to the input node. The regular
control-flow edge still goes through the input node.

## Connector rules

The parser generates connector nodes from control-flow structure.

- Insert a connector where an `if` or `if`/`else` rejoins the main flow.
- Insert a connector where a loop exits to the following statement.
- Use direct flow edges between ordinary sequential statements.
- Use direct flow or comment edges for comments, subroutines, `start`, and `end`.
- Connector IDs are deterministic structural keys. Build each connector ID from
  the connector kind, the enclosing block path, and the normalized construct
  header text. Do not use source line numbers in connector IDs. Examples:
  `conn:if:root:if-password-stored-password` or
  `conn:for:root:for-i-from-1-to-3`.

## Node identity

Node IDs are deterministic and stable across unrelated edits. A node ID is built
from:

- the enclosing normalized block path;
- the normalized statement text, with whitespace collapsed and case lowered;
- an ordinal only when the same statement appears more than once in the same
  block.

Editing one statement should not change IDs for unrelated statements, so existing
drag-position overrides can survive ordinary edits.

## File formats

The editor uses two named formats:

- `.pseudo`: plain pseudo-code source text only.
- `.json`: serialized project document with `format`, `version`, `title`, `source`,
  `overrides`, and `theme`.

The `.pseudo` form is used by "Save source" and "Open source". The `.json` form is
used by project save/load and autosave.

## Password example

Source:

```text
start
input password
if password == stored_password:
	output "Access granted"
else:
	output "Access denied"
end if
end
```

Node list:

| ID | Shape | Text |
| --- | --- | --- |
| `start` | `terminal` | `Start` |
| `n:input-password` | `io` | `input password` |
| `n:if-password-stored-password` | `decision` | `password == stored_password` |
| `n:output-access-granted` | `io` | `output "Access granted"` |
| `n:output-access-denied` | `io` | `output "Access denied"` |
| `conn:if:root:if-password-stored-password` | `connector` | branch join |
| `end` | `terminal` | `End` |

Edge list:

| ID | From | To | Kind | Branch |
| --- | --- | --- | --- | --- |
| `e1` | `start` | `n:input-password` | `flow` |  |
| `e2` | `n:input-password` | `n:if-password-stored-password` | `flow` |  |
| `e3` | `n:if-password-stored-password` | `n:output-access-granted` | `flow` | `True` |
| `e4` | `n:if-password-stored-password` | `n:output-access-denied` | `flow` | `False` |
| `e5` | `n:output-access-granted` | `conn:if:root:if-password-stored-password` | `flow` |  |
| `e6` | `n:output-access-denied` | `conn:if:root:if-password-stored-password` | `flow` |  |
| `e7` | `conn:if:root:if-password-stored-password` | `end` | `flow` |  |

## FOR-loop example

Source:

```text
start
set total to 0
for i from 1 to 3:
	call add_item
	set total to total + i
end for
output total
end
```

Node list:

| ID | Shape | Text |
| --- | --- | --- |
| `start` | `terminal` | `Start` |
| `n:set-total-to-0` | `process` | `set total to 0` |
| `n:for-i-from-1-to-3` | `loop` | `for i from 1 to 3` |
| `n:call-add-item` | `subroutine` | `call add_item` |
| `n:set-total-to-total-i` | `process` | `set total to total + i` |
| `conn:for:root:for-i-from-1-to-3` | `connector` | loop exit |
| `n:output-total` | `io` | `output total` |
| `end` | `terminal` | `End` |

Edge list:

| ID | From | To | Kind | Branch |
| --- | --- | --- | --- | --- |
| `e1` | `start` | `n:set-total-to-0` | `flow` |  |
| `e2` | `n:set-total-to-0` | `n:for-i-from-1-to-3` | `flow` |  |
| `e3` | `n:for-i-from-1-to-3` | `n:call-add-item` | `flow` | `True` |
| `e4` | `n:call-add-item` | `n:set-total-to-total-i` | `flow` |  |
| `e5` | `n:set-total-to-total-i` | `n:for-i-from-1-to-3` | `back` |  |
| `e6` | `n:for-i-from-1-to-3` | `conn:for:root:for-i-from-1-to-3` | `flow` | `False` |
| `e7` | `conn:for:root:for-i-from-1-to-3` | `n:output-total` | `flow` |  |
| `e8` | `n:output-total` | `end` | `flow` |  |
