#!/usr/bin/env node
// tools/build.mjs - esbuild JS API bundler for the Concept Map Maker app.
//
// Uses esbuild-plugin-solid (Babel transform) to compile SolidJS JSX.
// The esbuild CLI does not support plugins, so the JS API is required.
//
// Usage:
//   node tools/build.mjs           # one-shot production build (minified)
//   node tools/build.mjs --watch   # watch + serve mode (no minify, port 3000)
//
// Outputs: dist/main.js, dist/main.js.map, dist/index.html, dist/style.css,
//          dist/.nojekyll

import * as esbuild from "esbuild";
import { solidPlugin } from "esbuild-plugin-solid";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const watch = process.argv.includes("--watch");

// Copy static assets into dist/ and write .nojekyll.
function copy_assets() {
  fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "src", "index.html"), path.join(ROOT, "dist", "index.html"));
  fs.copyFileSync(path.join(ROOT, "src", "style.css"), path.join(ROOT, "dist", "style.css"));
  // .nojekyll ensures GitHub Pages serves files whose names start with _.
  fs.writeFileSync(path.join(ROOT, "dist", ".nojekyll"), "");
}

/** @type {import("esbuild").BuildOptions} */
const shared_options = {
  entryPoints: [path.join(ROOT, "src", "main.tsx")],
  bundle: true,
  format: "esm",
  target: "es2020",
  platform: "browser",
  outfile: path.join(ROOT, "dist", "main.js"),
  sourcemap: true,
  plugins: [solidPlugin()],
};

if (watch) {
  // Watch + serve mode: no minification, live rebuild on file changes.
  const ctx = await esbuild.context({
    ...shared_options,
    minify: false,
  });
  await ctx.watch();
  const { host, port } = await ctx.serve({ servedir: path.join(ROOT, "dist") });
  copy_assets();
  console.log(`Serving http://${host}:${port}/`);
} else {
  // One-shot production build.
  await esbuild.build({
    ...shared_options,
    minify: true,
  });
  copy_assets();
}
