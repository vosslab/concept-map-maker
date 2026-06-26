// app.tsx - top-level app shell: toolbar strip, editor pane (Triples tab),
// map pane, and rubric panel.

import { createSignal, onMount, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js";

import { create_app_state, browser_storage } from "./app_state";
import type { AppState, StorageLike } from "./app_state";
import { TriplesTable } from "./triples_table";
import { MapCanvas } from "./map_canvas";
import { ConceptNode } from "./concept_node";
import { ThemePicker } from "./theme_picker";
import { RubricPanel } from "./rubric_panel";
import { Toolbar } from "./toolbar";
import { setup_map_theme, set_exporting_light } from "./ui_theme";
import { EmptyState } from "./empty_state";

// ============================================
// Resizer constants
// ============================================

// localStorage key for persisting the editor/map split ratio.
const RESIZER_STORAGE_KEY = "concept-map-maker:editor-ratio";

// Default ratio (percent) when nothing is stored or value is invalid.
const RATIO_DEFAULT = 40;

// Minimum and maximum allowed ratio (percent).
const RATIO_MIN = 25;
const RATIO_MAX = 65;

// Keyboard step size (percent).
const RATIO_KEYBOARD_STEP = 2;

// ============================================
// Resizer helpers
// ============================================

// load_ratio reads from localStorage and applies the fallback/clamp rules:
//   - missing, non-numeric, or malformed -> RATIO_DEFAULT
//   - numeric but out of range -> clamp to [RATIO_MIN, RATIO_MAX]
// Returns the corrected numeric value (not a CSS string).
function load_ratio(storage: StorageLike | null): number {
  if (storage === null) {
    return RATIO_DEFAULT;
  }
  const raw = storage.getItem(RESIZER_STORAGE_KEY);
  if (raw === null) {
    return RATIO_DEFAULT;
  }
  const parsed = parseFloat(raw);
  if (!isFinite(parsed)) {
    return RATIO_DEFAULT;
  }
  // Clamp to allowed bounds.
  if (parsed < RATIO_MIN) {
    return RATIO_MIN;
  }
  if (parsed > RATIO_MAX) {
    return RATIO_MAX;
  }
  return parsed;
}

// save_ratio writes the numeric ratio to localStorage (if available).
function save_ratio(storage: StorageLike | null, ratio: number): void {
  if (storage === null) {
    return;
  }
  storage.setItem(RESIZER_STORAGE_KEY, String(ratio));
}

// apply_ratio writes the CSS custom property onto a .main-area element.
function apply_ratio(main_el: HTMLElement, ratio: number): void {
  main_el.style.setProperty("--editor-ratio", `${ratio}%`);
}

// ============================================
// App shell
// ============================================

export function App(): JSX.Element {
  // Construct the single reactive state root for the entire app.
  // browser_storage() resolves window.localStorage safely for non-browser envs.
  const storage = browser_storage();
  const state: AppState = create_app_state(storage);

  // Wire the resolved map-theme MutationObserver (data-ui-theme attribute)
  // under this component's owner so onCleanup runs if the shell unmounts. The
  // map color accessors read map_is_dark() from ui_theme.ts to switch on-screen
  // colors for dark mode. No matchMedia live listener -- the theme is two-state
  // only and only changes when the user clicks the toggle.
  setup_map_theme();

  // svg_el: capture the live <svg> element from MapCanvas so Toolbar can pass
  // it to export_svg functions. Null until MapCanvas mounts.
  const [svg_el, set_svg_el] = createSignal<SVGSVGElement | null>(null);

  // editor_ratio: the current split ratio (number, percent without '%').
  // Loaded from localStorage on mount; written back whenever it changes.
  const [editor_ratio, set_editor_ratio] = createSignal<number>(RATIO_DEFAULT);

  // Ref to the .main-area element so we can apply the CSS custom property inline
  // and measure its width during drag.
  let main_el: HTMLElement | null = null;

  // Ref to the resizer divider element, used for pointer capture and keyboard.
  let resizer_el: HTMLDivElement | null = null;

  // Callback ref setters: SolidJS calls these with the live DOM node when the
  // element mounts, assigning the mutable variables above.
  const set_main_el = (el: HTMLElement): void => {
    main_el = el;
  };
  const set_resizer_el = (el: HTMLDivElement): void => {
    resizer_el = el;
  };

  // Print force-light handlers: before printing, force the map to render in
  // light colors so inline SVG attributes resolve light (same flag used by
  // export). After printing, release the override so the on-screen theme is
  // restored. This covers both the toolbar Print button (which calls
  // window.print(), triggering beforeprint) and the browser's native Cmd/Ctrl+P.
  function on_before_print(): void {
    set_exporting_light(true);
  }
  function on_after_print(): void {
    set_exporting_light(false);
  }

  // on mount: load persisted ratio and apply.
  onMount(() => {
    // Resizer ratio: load, persist corrected value, apply CSS property.
    const ratio = load_ratio(storage);
    // Write corrected value back so a clamped or defaulted value is stored.
    save_ratio(storage, ratio);
    set_editor_ratio(ratio);
    if (main_el !== null) {
      apply_ratio(main_el, ratio);
    }

    // Register print force-light listeners under this component's owner so they
    // are cleaned up on unmount. Guard for non-browser (JSDOM / SSR).
    if (typeof window !== "undefined") {
      window.addEventListener("beforeprint", on_before_print);
      window.addEventListener("afterprint", on_after_print);
    }
  });

  // ============================================
  // Drag handlers (pointer events, setPointerCapture)
  // ============================================

  // Commit a new ratio: clamp, update signal, persist, apply CSS.
  function commit_ratio(ratio: number): void {
    // Clamp to allowed range.
    const clamped = Math.min(RATIO_MAX, Math.max(RATIO_MIN, ratio));
    set_editor_ratio(clamped);
    save_ratio(storage, clamped);
    if (main_el !== null) {
      apply_ratio(main_el, clamped);
    }
  }

  function on_pointer_down(event: PointerEvent): void {
    if (resizer_el === null || main_el === null) {
      return;
    }
    // Only respond to primary pointer button.
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    // Capture pointer so pointermove fires even outside the element.
    resizer_el.setPointerCapture(event.pointerId);
    resizer_el.classList.add("pane-resizer--dragging");
    document.body.classList.add("resizer-active");
  }

  function on_pointer_move(event: PointerEvent): void {
    if (resizer_el === null || main_el === null) {
      return;
    }
    // Only process moves while we hold the pointer capture.
    if (!resizer_el.hasPointerCapture(event.pointerId)) {
      return;
    }
    const rect = main_el.getBoundingClientRect();
    // Compute what fraction of the main-area width the cursor is at.
    const offset_x = event.clientX - rect.left;
    const new_ratio = (offset_x / rect.width) * 100;
    commit_ratio(new_ratio);
  }

  function on_pointer_up(event: PointerEvent): void {
    if (resizer_el === null) {
      return;
    }
    resizer_el.classList.remove("pane-resizer--dragging");
    document.body.classList.remove("resizer-active");
    // Release capture if we still hold it.
    if (resizer_el.hasPointerCapture(event.pointerId)) {
      resizer_el.releasePointerCapture(event.pointerId);
    }
  }

  // on_lost_pointer_capture: idempotent cleanup in case the browser cancels
  // pointer capture without firing pointerup (e.g. window blur, touch cancel).
  function on_lost_pointer_capture(): void {
    if (resizer_el !== null) {
      resizer_el.classList.remove("pane-resizer--dragging");
    }
    document.body.classList.remove("resizer-active");
  }

  // ============================================
  // Keyboard handler (arrow keys: 2% step)
  // ============================================

  function on_key_down(event: KeyboardEvent): void {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      commit_ratio(editor_ratio() - RATIO_KEYBOARD_STEP);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      commit_ratio(editor_ratio() + RATIO_KEYBOARD_STEP);
    }
  }

  // ============================================
  // Double-click: reset to default
  // ============================================

  function on_double_click(): void {
    commit_ratio(RATIO_DEFAULT);
  }

  // Clean up body class and print listeners if the component ever unmounts.
  onCleanup(() => {
    document.body.classList.remove("resizer-active");
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeprint", on_before_print);
      window.removeEventListener("afterprint", on_after_print);
    }
  });

  return (
    <div class="app-shell">
      {/* Top toolbar strip */}
      <header class="toolbar" id="toolbar" role="banner">
        <Toolbar state={state} svg={svg_el} />
      </header>

      {/* Main content area: editor pane (left) + map pane (right) */}
      <main class="main-area" role="main" ref={set_main_el}>
        {/* Left: editor pane with tab switcher */}
        <section class="editor-pane" aria-label="Editor pane">
          <div>
            <h2 class="pane-heading">Triples</h2>
            <TriplesTable state={state} />
          </div>
        </section>

        {/* Draggable divider between editor pane and map pane */}
        <div
          ref={set_resizer_el}
          class="pane-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize editor and map panes"
          aria-valuenow={editor_ratio()}
          aria-valuemin={RATIO_MIN}
          aria-valuemax={RATIO_MAX}
          aria-valuetext={`${editor_ratio()}% editor width`}
          tabindex="0"
          onPointerDown={on_pointer_down}
          onPointerMove={on_pointer_move}
          onPointerUp={on_pointer_up}
          onPointerCancel={on_pointer_up}
          onLostPointerCapture={on_lost_pointer_capture}
          onKeyDown={on_key_down}
          onDblClick={on_double_click}
        />

        {/* Right: concept map canvas */}
        <section class="map-pane" aria-label="Concept map">
          <div class="map-pane-header">
            <h2 class="pane-heading">Concept Map</h2>
            {/* Theme picker in the map pane corner; restyles every bubble. */}
            <ThemePicker state={state} />
          </div>
          {/* Inject the themed, draggable ConceptNode into the canvas node slot. */}
          <MapCanvas
            state={state}
            node_slot={(key, box) => <ConceptNode conceptKey={key} box={box} state={state} />}
            svg_ref={(el) => set_svg_el(el)}
          />
          {/* Empty-state panel: shown only when the document has no triples.
              Hides automatically once the first triple is added. */}
          <Show when={state.doc.triples.length === 0}>
            <EmptyState state={state} />
          </Show>
        </section>
      </main>

      {/* Bottom: rubric panel */}
      <aside class="rubric-panel" aria-label="Rubric">
        <h2 class="pane-heading">Rubric</h2>
        <RubricPanel state={state} />
      </aside>
    </div>
  );
}
