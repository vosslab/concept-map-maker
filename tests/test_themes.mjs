// Tests for src/themes.ts
// Run with: node --import tsx --test tests/test_themes.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { PALETTES, depth_fill } from "../src/palettes.js";
import { ORIGIN_EMPHASIS, SHAPE_REGISTRY } from "../src/themes.js";

//============================================
// PALETTES
//============================================
describe("PALETTES", () => {
  it("earth entries are hex color strings", () => {
    for (const color of PALETTES.earth) {
      assert.match(color, /^#[0-9a-fA-F]{6}$/);
    }
  });

  it("fire entries are hex color strings", () => {
    for (const color of PALETTES.fire) {
      assert.match(color, /^#[0-9a-fA-F]{6}$/);
    }
  });
});

//============================================
// depth_fill
//============================================
describe("depth_fill", () => {
  it("returns a hex color for every depth 0-5 in earth", () => {
    for (let d = 0; d <= 5; d++) {
      const color = depth_fill("earth", d);
      assert.match(color, /^#[0-9a-fA-F]{6}$/);
    }
  });

  it("returns a hex color for every depth 0-5 in fire", () => {
    for (let d = 0; d <= 5; d++) {
      const color = depth_fill("fire", d);
      assert.match(color, /^#[0-9a-fA-F]{6}$/);
    }
  });

  it("depth > last index clamps to last entry, not cycling", () => {
    // depth beyond the last index should always return the same darkest color
    const last_earth = PALETTES.earth[PALETTES.earth.length - 1];
    assert.equal(depth_fill("earth", PALETTES.earth.length), last_earth);
    assert.equal(depth_fill("earth", 100), last_earth);
  });

  it("depth 6 and depth 5 return the same color (no cycling)", () => {
    assert.equal(depth_fill("fire", 6), depth_fill("fire", 5));
  });

  it("depth 0 and depth 1 return different colors (ordered ramp)", () => {
    assert.notEqual(depth_fill("earth", 0), depth_fill("earth", 1));
    assert.notEqual(depth_fill("fire", 0), depth_fill("fire", 1));
  });
});

//============================================
// ORIGIN_EMPHASIS
//============================================
describe("ORIGIN_EMPHASIS", () => {
  it("stroke_width is a positive number", () => {
    assert.ok(typeof ORIGIN_EMPHASIS.stroke_width === "number");
    assert.ok(ORIGIN_EMPHASIS.stroke_width > 0);
  });

  it("stroke is a hex color string", () => {
    assert.match(ORIGIN_EMPHASIS.stroke, /^#[0-9a-fA-F]{3,6}$/);
  });
});

//============================================
// SHAPE_REGISTRY
//============================================
describe("SHAPE_REGISTRY", () => {
  it("rounded has modest corner_radius (below capsule threshold) and is not ellipse", () => {
    assert.ok(SHAPE_REGISTRY.rounded.corner_radius > 0);
    assert.ok(SHAPE_REGISTRY.rounded.corner_radius < 18);
    assert.equal(SHAPE_REGISTRY.rounded.is_ellipse, false);
  });

  it("rect has corner_radius 0 and is not ellipse", () => {
    assert.equal(SHAPE_REGISTRY.rect.corner_radius, 0);
    assert.equal(SHAPE_REGISTRY.rect.is_ellipse, false);
  });

  it("oval is_ellipse is true", () => {
    assert.equal(SHAPE_REGISTRY.oval.is_ellipse, true);
  });

  it("capsule is_capsule is true and is not ellipse", () => {
    assert.equal(SHAPE_REGISTRY.capsule.is_capsule, true);
    assert.equal(SHAPE_REGISTRY.capsule.is_ellipse, false);
  });

  it("capsule corner_radius is 0 (rx is computed dynamically from node height)", () => {
    // capsule rx = height / 2 is computed in the renderer, not stored in the registry
    assert.equal(SHAPE_REGISTRY.capsule.corner_radius, 0);
  });

  it("non-capsule shapes have is_capsule false", () => {
    assert.equal(SHAPE_REGISTRY.rounded.is_capsule, false);
    assert.equal(SHAPE_REGISTRY.rect.is_capsule, false);
    assert.equal(SHAPE_REGISTRY.oval.is_capsule, false);
  });
});
