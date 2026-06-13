// toolbar.tsx - document toolbar: editable title, Save/Open/Clear JSON buttons,
// autosave status indicator, CSV import/export, SVG/PNG/print export,
// and re-layout button.

import { createSignal, Show } from "solid-js";
import type { Accessor, JSX } from "solid-js";

import type { AppState } from "./app_state";
import { serialize_document, parse_document, empty_document } from "./document_codec";
import { serialize_triples_csv, parse_triples_csv } from "./csv_codec";
import { download_svg, download_png } from "./export_svg";

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

  // Hidden <input type="file"> refs; programmatically clicked on button press.
  const [json_input_ref, set_json_input_ref] = createSignal<HTMLInputElement | null>(null);
  const [csv_input_ref, set_csv_input_ref] = createSignal<HTMLInputElement | null>(null);

  //--------------------------------------------
  // --- FILE GROUP: Save / Open / Clear ---
  //--------------------------------------------

  // Save project: serialize -> Blob -> anchor download
  function handle_save(): void {
    const json_text = serialize_document(state.doc);
    const blob = new Blob([json_text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    // use the document title as the filename; fall back when blank
    const safe_title = state.doc.title.trim() || "concept-map";
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
    const confirmed = window.confirm("Clear the current concept map? This cannot be undone.");
    if (confirmed) {
      state.replace_document(empty_document());
    }
  }

  // Dismiss the inline open error
  function dismiss_error(): void {
    set_open_error(null);
  }

  //--------------------------------------------
  // --- CSV GROUP: Export triples CSV / Import triples CSV ---
  //--------------------------------------------

  // Export triples CSV: serialize triples only -> Blob -> anchor download.
  // CSV is triples-only; it is NOT a full project save.
  function handle_export_csv(): void {
    const csv_text = serialize_triples_csv(state.doc.triples);
    const blob = new Blob([csv_text], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safe_title = state.doc.title.trim() || "concept-map";
    anchor.href = url;
    // filename makes clear this is triples only
    anchor.download = `${safe_title}-triples.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // Import triples CSV: trigger hidden file input
  function handle_import_csv_click(): void {
    const input = csv_input_ref();
    if (input !== null) {
      input.click();
    }
  }

  function handle_csv_file_change(
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
      let result;
      try {
        result = parse_triples_csv(text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        set_open_error(`CSV import failed: ${msg}`);
        input.value = "";
        return;
      }
      // APPEND triples (do not wipe document -- CSV is triples-only convenience)
      state.bulk_insert_triples(result.rows);
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
    const safe_title = state.doc.title.trim() || "concept-map";
    // download_svg returns a Promise; errors surface in the console (no blocking UI needed)
    void download_svg(svg, state, `${safe_title}.svg`);
  }

  // Export PNG: download a rasterized PNG at 2x scale.
  function handle_export_png(): void {
    const svg = props.svg();
    if (svg === null) {
      return;
    }
    const safe_title = state.doc.title.trim() || "concept-map";
    void download_png(svg, state, `${safe_title}.png`);
  }

  // Print: open the browser print dialog. Print CSS already hides editor/toolbar.
  function handle_print(): void {
    window.print();
  }

  //--------------------------------------------
  // --- LAYOUT GROUP: Re-layout ---
  //--------------------------------------------

  // Re-layout: confirm, then clear all overrides so bubbles return to auto-layout.
  function handle_relayout(): void {
    const confirmed = window.confirm(
      "Reset all bubble positions to auto-layout? Dragged positions will be lost.",
    );
    if (confirmed) {
      state.clear_overrides();
    }
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

      {/* --- CSV GROUP --- */}
      <span class="toolbar-group" role="group" aria-labelledby="tg-caption-csv">
        <span class="toolbar-group-caption" id="tg-caption-csv">
          CSV
        </span>
        <span class="toolbar-group-buttons">
          <button
            class="toolbar-btn"
            aria-label="Export triples as CSV"
            onClick={handle_export_csv}
          >
            <i class="fa-solid fa-file-export" aria-hidden="true" />
            Export triples CSV
          </button>

          <button
            class="toolbar-btn"
            aria-label="Import triples from CSV"
            onClick={handle_import_csv_click}
          >
            <i class="fa-solid fa-file-import" aria-hidden="true" />
            Import triples CSV
          </button>

          {/* Hidden CSV file picker */}
          <input
            ref={set_csv_input_ref}
            type="file"
            accept=".csv,text/csv"
            style="display:none"
            onChange={handle_csv_file_change}
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
            aria-label="Export map as SVG"
            disabled={!svg_ready()}
            onClick={handle_export_svg}
          >
            <i class="fa-solid fa-vector-square" aria-hidden="true" />
            Export SVG
          </button>

          <button
            class="toolbar-btn"
            aria-label="Export map as PNG"
            disabled={!svg_ready()}
            onClick={handle_export_png}
          >
            <i class="fa-solid fa-image" aria-hidden="true" />
            Export PNG
          </button>

          <button class="toolbar-btn" aria-label="Print concept map" onClick={handle_print}>
            <i class="fa-solid fa-print" aria-hidden="true" />
            Print
          </button>
        </span>
      </span>

      {/* --- LAYOUT GROUP --- */}
      <span class="toolbar-group" role="group" aria-labelledby="tg-caption-layout">
        <span class="toolbar-group-caption" id="tg-caption-layout">
          Layout
        </span>
        <span class="toolbar-group-buttons">
          <button
            class="toolbar-btn"
            aria-label="Reset bubble positions to auto-layout"
            onClick={handle_relayout}
          >
            <i class="fa-solid fa-diagram-project" aria-hidden="true" />
            Re-layout
          </button>
        </span>
      </span>

      {/* Autosave status indicator */}
      <span class="toolbar-autosave-status" aria-live="polite">
        {state.autosave_enabled() ? "autosave on" : "autosave off"}
      </span>

      {/* Inline error for open/import failures; dismissable, aria-live polite */}
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
