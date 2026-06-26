// UI theme model and helpers for the pseudo-code flowchart appearance switch.
//
// Drives a two-state light / dark UI appearance switch. The chosen theme is
// persisted in localStorage under UI_THEME_STORAGE_KEY. CSS custom properties
// keyed off data-ui-theme on <html> do the actual re-coloring, so TypeScript
// only manages the string attribute -- no runtime theme object.
//
// On first-ever load (no stored choice), the initial theme is resolved once
// from the OS preference via matchMedia("(prefers-color-scheme: dark)") and
// stored as a concrete "light" or "dark" value. The OS preference is NOT
// tracked live afterward -- toggling is the only way to change the theme.
//
// Reuses StorageLike and browser_storage from app_state.ts (the established
// storage pattern for this repo). If the import ever causes a circular
// dependency, extract a shared src/storage.ts; there is no circular dependency
// currently, so the import stays here.

import { createSignal, onCleanup } from "solid-js";

import type { StorageLike } from "./app_state";

//============================================
// UiTheme type
//============================================
// Allowed values as a const tuple so the union can be derived from a single
// source. No enum -- an as-const tuple keeps the values as string literals and
// makes validation against the tuple trivial.
export const UI_THEME_VALUES = ["light", "dark"] as const;

// The union type derived from the tuple above. Other modules import this type.
export type UiTheme = (typeof UI_THEME_VALUES)[number];

//============================================
// UI_THEME_STORAGE_KEY
//============================================
// The localStorage key for the persisted theme choice. Must exactly match the
// inline early-set script in index.html (which duplicates this string to run
// before the bundle loads). The Playwright spec's reload assertion guards drift.
export const UI_THEME_STORAGE_KEY = "pseudo-code-flowchart:ui-theme";

//============================================
// is_valid_ui_theme
//============================================
// Type guard: return true when the given value is one of the two allowed
// theme strings. Used by load_ui_theme to reject unknown or missing values.
function is_valid_ui_theme(value: string): value is UiTheme {
  // cast through unknown so the includes check satisfies the strict compiler
  return (UI_THEME_VALUES as readonly string[]).includes(value);
}

//============================================
// os_default_theme
//============================================
// Read the OS preference once and return "dark" or "light". Guards for
// undefined matchMedia (non-browser, older JSDOM) and returns "light" there.
function os_default_theme(): UiTheme {
  // matchMedia is absent in non-browser contexts; default to light
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

//============================================
// load_ui_theme
//============================================
// Read the persisted theme from storage and validate it. If the stored value
// is "light" or "dark", return it as-is. If missing, unknown, or a legacy
// "auto" value, resolve the OS preference ONCE and return a concrete value.
// The OS is only consulted as a one-time default, not tracked live afterward.
// Passing null (storage unavailable) is a valid call and resolves from OS.
export function load_ui_theme(storage: StorageLike | null): UiTheme {
  // read can throw in restricted contexts (privacy mode, blocked storage)
  let stored: string | null = null;
  if (storage !== null) {
    try {
      stored = storage.getItem(UI_THEME_STORAGE_KEY);
    } catch {
      // storage read error: fall through to OS default below
    }
  }
  // validate against the two-state tuple; accept only "light" or "dark"
  if (stored !== null && is_valid_ui_theme(stored)) {
    return stored;
  }
  // missing, unknown, or legacy "auto": resolve OS preference once
  return os_default_theme();
}

//============================================
// save_ui_theme
//============================================
// Persist the chosen theme to storage. Silently no-ops when storage is null or
// when the write throws (over quota, blocked storage). Callers do not need to
// handle a failure return because the in-memory signal is already updated.
export function save_ui_theme(storage: StorageLike | null, theme: UiTheme): void {
  if (storage === null) {
    return;
  }
  try {
    storage.setItem(UI_THEME_STORAGE_KEY, theme);
  } catch {
    // write failure is a silent no-op; the in-memory state remains correct
  }
}

//============================================
// apply_ui_theme
//============================================
// Set the data-ui-theme attribute on <html>. CSS custom-property overrides
// keyed off this attribute handle all visual re-coloring -- TypeScript sets one
// attribute string and CSS does the rest.
export function apply_ui_theme(theme: UiTheme): void {
  document.documentElement.setAttribute("data-ui-theme", theme);
}

//============================================
// next_ui_theme
//============================================
// Two-state toggle: light -> dark -> light.
// Pure function; the toggle button calls this on each click.
export function next_ui_theme(current: UiTheme): UiTheme {
  // flip between the two states
  return current === "light" ? "dark" : "light";
}

//============================================
// Resolved map theme (screen colors react to dark mode)
//============================================
// The map's edges, labels, and nodes use INLINE SVG attributes (not CSS), so
// they cannot react to data-ui-theme via CSS custom properties. This section
// exposes a single resolved boolean signal -- map_is_dark() -- that the map
// components read to pick light or dark color values on screen.
//
// Source of truth: the data-ui-theme attribute on <html>. The appearance
// toggle (ui_theme_toggle.tsx) already writes that attribute via
// apply_ui_theme. We OBSERVE the attribute with a MutationObserver instead of
// sharing a Solid signal with the toggle, so the toggle stays in sync without
// any change to the toggle module.
//
// The OS matchMedia change listener is intentionally NOT installed: the theme
// is now a concrete two-state ("light"/"dark") value that only changes when
// the user clicks the toggle.
//
// Export override: while an SVG/PNG export snapshot is being taken, the export
// must stay LIGHT and self-contained regardless of the on-screen theme.
// set_exporting_light(true) forces map_is_dark() to return false for the
// duration of the clone; export_svg.ts sets it before the flush and resets it
// in a finally.

//--------------------------------------------
// read_ui_theme_attribute
//--------------------------------------------
// Read the current data-ui-theme attribute off <html> and validate it. Falls
// back to "light" when missing or unrecognized. Returns "light" in any
// non-browser context so this module is safe to import headless.
function read_ui_theme_attribute(): UiTheme {
  // non-browser (node/test setup) has no document; default to light
  if (typeof document === "undefined") {
    return "light";
  }
  const value = document.documentElement.getAttribute("data-ui-theme");
  // a missing attribute means the early-set script has not run yet; treat as light
  if (value === null) {
    return "light";
  }
  if (is_valid_ui_theme(value)) {
    return value;
  }
  return "light";
}

// The current UI theme string, mirrored from the data-ui-theme attribute. A
// MutationObserver pushes attribute changes into this signal so the map reacts
// the instant the toggle flips the attribute.
const [current_ui_theme, set_current_ui_theme] = createSignal<UiTheme>(read_ui_theme_attribute());

// Export-light override flag. When true, map_is_dark() returns false so the
// export snapshot is rendered in authored light colors.
const [exporting_light, set_exporting_light_signal] = createSignal<boolean>(false);

// install the attribute observer exactly once, the first time the resolved
// theme is wired in a browser. Module-level singleton because data-ui-theme
// is app-global, not per-component.
let resolved_theme_wired = false;

//--------------------------------------------
// wire_resolved_theme
//--------------------------------------------
// Lazily attach the MutationObserver (data-ui-theme changes). Idempotent and
// browser-guarded. Called from setup_map_theme so any owner that needs the
// signal registers cleanup. No matchMedia listener -- theme is two-state only.
function wire_resolved_theme(): void {
  if (resolved_theme_wired) {
    return;
  }
  // no DOM means nothing to observe; leave the static initial values in place
  if (typeof document === "undefined") {
    return;
  }
  resolved_theme_wired = true;

  // observe data-ui-theme on <html>; the toggle writes it via apply_ui_theme,
  // so this keeps current_ui_theme in sync without the toggle sharing a signal
  const observer = new MutationObserver(() => {
    set_current_ui_theme(read_ui_theme_attribute());
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-ui-theme"],
  });

  onCleanup(() => {
    observer.disconnect();
  });
}

//--------------------------------------------
// map_is_dark
//--------------------------------------------
// The resolved boolean the map components read. Two-state: dark -> true,
// light -> false. Always false while an export snapshot is in flight.
//
// Implemented as a plain function (not createMemo) so it can live at module
// scope without requiring a Solid reactive owner. The function reads two
// module-level signals (exporting_light and current_ui_theme); callers inside
// component render functions or createEffect bodies track those signals
// automatically because Solid's tracking is based on signal reads inside the
// currently active computation, not on where the enclosing function was defined.
export function map_is_dark(): boolean {
  // export override wins outright: the snapshot must be authored-light
  if (exporting_light()) {
    return false;
  }
  return current_ui_theme() === "dark";
}

//--------------------------------------------
// setup_map_theme
//--------------------------------------------
// Register the resolved-theme listeners under the calling component's owner so
// onCleanup runs on unmount. Call this once from a long-lived component (the app
// shell) before the map reads map_is_dark(). Reading map_is_dark() without
// calling this still works, but it will not react to live attribute or OS
// changes until the listeners are wired.
export function setup_map_theme(): void {
  wire_resolved_theme();
}

//--------------------------------------------
// set_exporting_light
//--------------------------------------------
// Setting true forces map_is_dark() to return false (light); false releases the override.
// export_svg.ts sets true before cloning the live DOM and false in a finally so
// the on-screen theme is restored afterward.
export function set_exporting_light(value: boolean): void {
  set_exporting_light_signal(value);
}
