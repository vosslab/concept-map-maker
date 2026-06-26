// code_editor.tsx - Solid wrapper around a CodeMirror 6 editor for the
// pseudo-code source pane. Renders a header with an "Update Flowchart" button
// and a "Format" button, an optional line-referenced error chip, and the
// CodeMirror editor itself with line numbers and keyword highlighting.
//
// Editing model (see docs/PSEUDO_CODE_FORMAT.md): typing only updates the draft
// source via onChange; the graph updates when the user clicks Update Flowchart
// (or presses Mod-Enter). This component owns no parse logic: it surfaces the
// current text through onChange and reports button presses through onSubmit and
// onFormat. The parent (app_state wiring) holds draftSource and decides what to
// do on submit/format, then feeds the canonical text back via value.

import { onMount, onCleanup, createEffect, Show } from "solid-js";
import type { JSX } from "solid-js";
import { EditorView, lineNumbers, keymap } from "@codemirror/view";
import type { ViewUpdate, KeyBinding } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { pseudo_highlight } from "./pseudo_language";

//============================================
// CodeEditorProps
//============================================

// Prop contract consumed by the app_state wiring.
//
// - value: the source text to display. Treated as controlled input: when the
//   parent changes it (for example after canonicalizing on a successful submit),
//   the editor document is replaced to match.
// - onChange: called on every user edit with the full editor text. The parent
//   stores this as the draft source; the graph is not reparsed here.
// - onSubmit: called when the user clicks "Update Flowchart" or presses
//   Mod-Enter. The parent reads the latest draft (delivered via onChange) and
//   decides whether to reparse.
// - onFormat: called when the user clicks "Format". The parent canonicalizes
//   the source and feeds the result back through value.
// - error: optional line-referenced parse error to show in the header. When
//   undefined, no error chip renders.
export interface CodeEditorProps {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onFormat: () => void;
  error?: string;
}

//============================================
// Editor theme
//============================================

// Minimal layout theme so the editor fills its pane and scrolls. Colors for
// syntax come from pseudo_highlight; this only handles sizing and font.
const editor_theme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    overflow: "auto",
  },
  ".cm-content": {
    paddingBottom: "40vh",
  },
});

//============================================
// CodeEditor
//============================================

export function CodeEditor(props: CodeEditorProps): JSX.Element {
  // Host element the CodeMirror view mounts into. Assigned by the ref below.
  let host: HTMLDivElement | undefined;
  // The live CodeMirror view, created on mount.
  let view: EditorView | undefined;
  // True while we are replacing the document programmatically (value sync) so the
  // update listener does not echo that change back out through onChange.
  let syncing = false;

  // Forward user edits to the parent. Ignore changes we made ourselves during a
  // value sync, and ignore transactions that did not change the document.
  function handle_view_update(update: ViewUpdate): void {
    if (!update.docChanged) {
      return;
    }
    if (syncing) {
      return;
    }
    const text = update.state.doc.toString();
    props.onChange(text);
  }

  // Mod-Enter submits, matching the Update Flowchart button.
  const submit_binding: KeyBinding = {
    key: "Mod-Enter",
    run: (): boolean => {
      props.onSubmit();
      return true;
    },
  };

  onMount(() => {
    if (host === undefined) {
      return;
    }
    const state = EditorState.create({
      doc: props.value,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([submit_binding, ...defaultKeymap, ...historyKeymap]),
        pseudo_highlight(),
        EditorView.lineWrapping,
        EditorView.updateListener.of(handle_view_update),
        editor_theme,
      ],
    });
    view = new EditorView({ state, parent: host });
  });

  onCleanup(() => {
    view?.destroy();
  });

  // Keep the editor document in sync with the controlled value. This fires when
  // the parent rewrites the source (canonicalization on submit/format). The
  // equality guard skips the common case where value just echoes a user edit, so
  // typing does not trigger a redundant document replacement.
  createEffect(() => {
    const next = props.value;
    if (view === undefined) {
      return;
    }
    const current = view.state.doc.toString();
    if (next === current) {
      return;
    }
    syncing = true;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: next },
    });
    syncing = false;
  });

  return (
    <div class="code-editor">
      {/* Header: action buttons and an optional parse-error chip */}
      <div class="code-editor-header">
        <button type="button" class="code-editor-update" onClick={() => props.onSubmit()}>
          Update Flowchart
        </button>
        <button type="button" class="code-editor-format" onClick={() => props.onFormat()}>
          Format
        </button>
        <Show when={props.error}>
          <span class="code-editor-error" role="alert">
            {props.error}
          </span>
        </Show>
      </div>

      {/* CodeMirror mounts here */}
      <div class="code-editor-host" ref={host}></div>
    </div>
  );
}
