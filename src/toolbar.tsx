// toolbar.tsx - document toolbar: editable title, Save/Open/Clear project JSON
// buttons, autosave status indicator, SVG/PNG/print export, examples, and the
// UI theme toggle.
//
// Note: this migration removed the concept-era CSV triples group. Plain-text
// ".pseudo" source Save/Open is owned by the toolbar file-ops work package
// (task #10); project JSON (FlowDocument) save/open is wired here.

import { createSignal, For, Show } from "solid-js";
import type { Accessor, JSX } from "solid-js";

import type { AppState } from "./app_state";
import { serialize_document, parse_document, empty_document } from "./document_codec";
import { download_svg, download_png } from "./export_svg";
import { UiThemeToggle } from "./ui_theme_toggle";
import { EXAMPLES } from "./templates";
import { load_example } from "./template_actions";

//============================================
// Toolbar
//============================================
// Props: a stable AppState reference and an accessor for the live SVG element
// (needed for SVG/PNG export; null until MapCanvas has mounted).
export interface ToolbarProps {
  state: AppState;
  svg: Accessor<SVGSVGElement | null>;
}

export function Toolbar(props: ToolbarProps): JSX.Element {
  const state = props.state;

  // Inline error message when a file open fails; null means no error shown.
  const [open_error, set_open_error] = createSignal<string | null>(null);

  // Hidden <input type="file"> ref; programmatically clicked on button press.
  const [json_input_ref, set_json_input_ref] = createSignal<HTMLInputElement | null>(null);

  // Hidden <input type="file"> ref for .pseudo source file open.
  const [pseudo_input_ref, set_pseudo_input_ref] = createSignal<HTMLInputElement | null>(null);

  //--------------------------------------------
  // --- FILE GROUP: Save / Open / Clear project ---
  //--------------------------------------------

  // Save project: serialize -> Blob -> anchor download
  function handle_save(): void {
    const json_text = serialize_document(state.doc);
    const blob = new Blob([json_text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    // use the document title as the filename; fall back when blank
    const safe_title = state.doc.title.trim() || "flowchart";
    anchor.href = url;
    anchor.download = `${safe_title}.json`;
    anchor.click();
    // release the object URL so the browser can reclaim memory
    URL.revokeObjectURL(url);
  }

  // Open project: trigger hidden file input
  function handle_open_click(): void {
    // clear any prior error before the user picks a new file
    set_open_error(null);
    const input = json_input_ref();
    if (input !== null) {
      input.click();
    }
  }

  function handle_json_file_change(
    event: Event & { currentTarget: HTMLInputElement; target: HTMLInputElement },
  ): void {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file === undefined) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (): void => {
      const text = reader.result as string;
      let parsed;
      try {
        parsed = parse_document(text);
      } catch (err) {
        // show the codec's message inline; leave the current doc untouched
        const msg = err instanceof Error ? err.message : String(err);
        set_open_error(msg);
        // reset the input so the same file can be retried
        input.value = "";
        return;
      }
      // clear any lingering error and swap the document
      set_open_error(null);
      state.replace_document(parsed);
      // reset the input so re-opening the same filename triggers change again
      input.value = "";
    };
    reader.readAsText(file);
  }

  // Clear document: confirm then replace with empty
  function handle_clear(): void {
    const confirmed = window.confirm("Clear the current flowchart? This cannot be undone.");
    if (confirmed) {
      state.replace_document(empty_document());
    }
  }

  // Dismiss the inline open error
  function dismiss_error(): void {
    set_open_error(null);
  }

  //--------------------------------------------
  // --- SOURCE GROUP: Save source / Open source ---
  //--------------------------------------------

  // Save source: write doc.source as a plain .pseudo text file
  function handle_save_source(): void {
    const source = state.doc.source;
    const blob = new Blob([source], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    // use the document title as the filename base; fall back when blank
    const safe_title = state.doc.title.trim() || "flowchart";
    anchor.href = url;
    anchor.download = `${safe_title}.pseudo`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // Open source: trigger hidden .pseudo file input
  function handle_open_source_click(): void {
    // clear any prior error before the user picks a new file
    set_open_error(null);
    const input = pseudo_input_ref();
    if (input !== null) {
      input.click();
    }
  }

  function handle_pseudo_file_change(
    event: Event & { currentTarget: HTMLInputElement; target: HTMLInputElement },
  ): void {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file === undefined) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (): void => {
      const text = reader.result as string;
      // load and normalize the source on submit, matching the example-load flow
      set_open_error(null);
      state.load_source(text);
      // reset so re-opening the same filename triggers change again
      input.value = "";
    };
    reader.readAsText(file);
  }

  //--------------------------------------------
  // --- IMAGE/PRINT GROUP: Export SVG / Export PNG / Print ---
  //--------------------------------------------

  // Export SVG: download a self-contained SVG file.
  function handle_export_svg(): void {
    const svg = props.svg();
    if (svg === null) {
      return;
    }
    const safe_title = state.doc.title.trim() || "flowchart";
    // download_svg returns a Promise; errors surface in the console (no blocking UI needed)
    void download_svg(svg, state, `${safe_title}.svg`);
  }

  // Export PNG: download a rasterized PNG at 2x scale.
  function handle_export_png(): void {
    const svg = props.svg();
    if (svg === null) {
      return;
    }
    const safe_title = state.doc.title.trim() || "flowchart";
    void download_png(svg, state, `${safe_title}.png`);
  }

  // Print: open the browser print dialog. Print CSS already hides editor/toolbar.
  function handle_print(): void {
    window.print();
  }

  // Disable export buttons until the canvas SVG element is available.
  const svg_ready = (): boolean => props.svg() !== null;

  return (
    <div class="toolbar-content">
      {/* Editable document title */}
      <input
        class="toolbar-title-input"
        type="text"
        aria-label="Document title"
        value={state.doc.title}
        onInput={(e) => state.set_title(e.currentTarget.value)}
      />

      {/* --- FILE GROUP --- */}
      <span class="toolbar-group" role="group" aria-labelledby="tg-caption-file">
        <span class="toolbar-group-caption" id="tg-caption-file">
          File
        </span>
        <span class="toolbar-group-buttons">
          <button class="toolbar-btn" aria-label="Save project as JSON" onClick={handle_save}>
            <i class="fa-solid fa-floppy-disk" aria-hidden="true" />
            Save project
          </button>

          <button class="toolbar-btn" aria-label="Open project JSON" onClick={handle_open_click}>
            <i class="fa-solid fa-folder-open" aria-hidden="true" />
            Open project
          </button>

          {/* Hidden JSON file picker */}
          <input
            ref={set_json_input_ref}
            type="file"
            accept=".json,application/json"
            style="display:none"
            onChange={handle_json_file_change}
          />

          <button
            class="toolbar-btn toolbar-btn-danger"
            aria-label="Clear document"
            onClick={handle_clear}
          >
            <i class="fa-solid fa-trash-can" aria-hidden="true" />
            Clear
          </button>
        </span>
      </span>

      {/* --- SOURCE GROUP --- */}
      <span class="toolbar-group" role="group" aria-labelledby="tg-caption-source">
        <span class="toolbar-group-caption" id="tg-caption-source">
          Source
        </span>
        <span class="toolbar-group-buttons">
          <button
            class="toolbar-btn"
            aria-label="Save source as .pseudo file"
            onClick={handle_save_source}
          >
            <i class="fa-solid fa-file-arrow-down" aria-hidden="true" />
            Save source
          </button>

          <button
            class="toolbar-btn"
            aria-label="Open .pseudo source file"
            onClick={handle_open_source_click}
          >
            <i class="fa-solid fa-file-arrow-up" aria-hidden="true" />
            Open source
          </button>

          {/* Hidden .pseudo file picker */}
          <input
            ref={set_pseudo_input_ref}
            type="file"
            accept=".pseudo,text/plain"
            style="display:none"
            onChange={handle_pseudo_file_change}
          />
        </span>
      </span>

      {/* --- IMAGE / PRINT GROUP --- */}
      <span class="toolbar-group" role="group" aria-labelledby="tg-caption-imgprint">
        <span class="toolbar-group-caption" id="tg-caption-imgprint">
          Image and print
        </span>
        <span class="toolbar-group-buttons">
          <button
            class="toolbar-btn"
            aria-label="Export flowchart as SVG"
            disabled={!svg_ready()}
            onClick={handle_export_svg}
          >
            <i class="fa-solid fa-vector-square" aria-hidden="true" />
            Export SVG
          </button>

          <button
            class="toolbar-btn"
            aria-label="Export flowchart as PNG"
            disabled={!svg_ready()}
            onClick={handle_export_png}
          >
            <i class="fa-solid fa-image" aria-hidden="true" />
            Export PNG
          </button>

          <button class="toolbar-btn" aria-label="Print flowchart" onClick={handle_print}>
            <i class="fa-solid fa-print" aria-hidden="true" />
            Print
          </button>
        </span>
      </span>

      {/* --- EXAMPLES GROUP --- */}
      <span class="toolbar-group" role="group" aria-labelledby="tg-caption-examples">
        <span class="toolbar-group-caption" id="tg-caption-examples">
          Examples
        </span>
        <span class="toolbar-group-buttons">
          <For each={EXAMPLES}>
            {(entry) => (
              <button
                class="toolbar-btn"
                aria-label={`Load example: ${entry.title}`}
                onClick={() => load_example(state, entry)}
              >
                <i class="fa-solid fa-diagram-project" aria-hidden="true" />
                {entry.title}
              </button>
            )}
          </For>
        </span>
      </span>

      {/* UI theme toggle - last interactive control before the autosave status */}
      <UiThemeToggle />

      {/* Autosave status indicator */}
      <span class="toolbar-autosave-status" aria-live="polite">
        {state.autosave_enabled() ? "autosave on" : "autosave off"}
      </span>

      {/* Inline error for open failures; dismissable, aria-live polite */}
      <Show when={open_error() !== null}>
        <span class="toolbar-open-error" role="alert" aria-live="polite">
          {open_error()}
          <button class="toolbar-btn-dismiss" aria-label="Dismiss error" onClick={dismiss_error}>
            x
          </button>
        </span>
      </Show>
    </div>
  );
}
