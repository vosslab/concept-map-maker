// pipeline/build.mjs - esbuild JS API bundler for the Concept Map Maker app.
//
// Uses esbuild-plugin-solid (Babel transform) to compile SolidJS JSX.
// The esbuild CLI does not support plugins, so the JS API is required.
//
// Usage:
//   node pipeline/build.mjs           # one-shot production build (minified)
//   node pipeline/build.mjs --watch   # watch + serve mode (no minify, port 3000)
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

// Recursively copy a source directory into a destination directory.
function copy_dir(src_dir, dest_dir) {
  fs.mkdirSync(dest_dir, { recursive: true });
  for (const entry of fs.readdirSync(src_dir, { withFileTypes: true })) {
    const src_path = path.join(src_dir, entry.name);
    const dest_path = path.join(dest_dir, entry.name);
    if (entry.isDirectory()) {
      copy_dir(src_path, dest_path);
    } else {
      fs.copyFileSync(src_path, dest_path);
    }
  }
}

// Copy static assets into dist/ and write .nojekyll.
function copy_assets() {
  fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "src", "index.html"), path.join(ROOT, "dist", "index.html"));
  fs.copyFileSync(path.join(ROOT, "src", "style.css"), path.join(ROOT, "dist", "style.css"));
  // Copy the CSS submodule directory so @import refs in style.css resolve.
  // src/css/ is a required input; if it is missing the build fails loudly.
  const css_src = path.join(ROOT, "src", "css");
  if (!fs.existsSync(css_src)) {
    throw new Error(`Required directory missing: ${css_src}. Add src/css/ before building.`);
  }
  copy_dir(css_src, path.join(ROOT, "dist", "css"));
  // Copy vendored Font Awesome so toolbar icons resolve on every build path.
  // vendor/fontawesome/ is the source of truth (repo root); if missing the
  // build fails loudly rather than producing a dist/ with broken icons.
  const vendor_src = path.join(ROOT, "vendor", "fontawesome");
  if (!fs.existsSync(vendor_src)) {
    throw new Error(
      `Required directory missing: ${vendor_src}. Add vendor/fontawesome/ before building.`,
    );
  }
  copy_dir(vendor_src, path.join(ROOT, "dist", "vendor", "fontawesome"));
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
