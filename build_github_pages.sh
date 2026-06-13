#!/usr/bin/env bash
# build_github_pages.sh - canonical production build for GitHub Pages.
#
# Contract:
#   - Wipes dist/ from scratch.
#   - Type-checks via 'tsc --noEmit -p tsconfig.json'.
#   - Resolves the entry: src/main.tsx preferred, src/main.ts fallback,
#     src/init.ts legacy fallback. Aborts with an actionable error if
#     none exists.
#   - Verifies src/index.html and src/style.css exist before copying;
#     aborts with an actionable error if missing.
#   - Verifies src/index.html references dist/main.js with a module script
#     tag (warns if missing -- the page will load but main.js is dead).
#   - Bundles the entry into dist/main.js via 'node pipeline/build.mjs'
#     (esbuild JS API + esbuild-plugin-solid; minified, sourcemap, ESM).
#   - Copies src/index.html and src/style.css into dist/.
#   - Writes dist/.nojekyll so GitHub Pages serves files starting with _.
#   - Asserts dist/index.html and dist/main.js exist before exiting.
#
# Hard rule: never produces single-file output. ESM only.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Resolve entry point.
if [ -f "src/main.tsx" ]; then
  ENTRY="src/main.tsx"
elif [ -f "src/main.ts" ]; then
  ENTRY="src/main.ts"
elif [ -f "src/init.ts" ]; then
  ENTRY="src/init.ts"
  echo "WARNING: using legacy src/init.ts. Rename to src/main.tsx." >&2
else
  echo "ERROR: no entry point. Create src/main.tsx (preferred) or src/main.ts." >&2
  exit 1
fi

# Verify required static assets before any destructive step.
for required in src/index.html src/style.css; do
  if [ ! -f "$required" ]; then
    echo "ERROR: required source file missing: $required" >&2
    case "$required" in
      src/index.html)
        echo "  Create src/index.html with a <script type=\"module\" src=\"main.js\"></script> tag." >&2 ;;
      src/style.css)
        echo "  Create src/style.css (empty file is fine)." >&2 ;;
    esac
    exit 1
  fi
done

# Soft-warn if index.html does not reference main.js as an ES module.
if ! grep -Eq '<script[^>]+type="module"[^>]+src="(\./)?main\.js"' src/index.html; then
  echo "WARNING: src/index.html does not appear to load main.js as an ES module." >&2
  echo "  Expected tag: <script type=\"module\" src=\"main.js\"></script>" >&2
  echo "  Build will proceed; the page may render but main.js will not run." >&2
fi

rm -rf dist
mkdir -p dist

npx tsc --noEmit -p tsconfig.json

# Bundle via esbuild JS API (supports esbuild-plugin-solid).
node pipeline/build.mjs

test -f dist/index.html
test -f dist/main.js

# Copy vendored Font Awesome assets so the ribbon toolbar icons load offline.
mkdir -p dist/vendor/fontawesome
cp vendor/fontawesome/fa-solid.min.css dist/vendor/fontawesome/
cp vendor/fontawesome/fa-solid-900.woff2 dist/vendor/fontawesome/
cp vendor/fontawesome/LICENSE.txt dist/vendor/fontawesome/

# Hard assertion: build fails if the font file is missing from dist/.
test -f dist/vendor/fontawesome/fa-solid-900.woff2 || {
  echo "ERROR: dist/vendor/fontawesome/fa-solid-900.woff2 missing after copy." >&2
  exit 1
}

# Hard assertion: build fails if the icon CSS is missing from dist/.
test -f dist/vendor/fontawesome/fa-solid.min.css || {
  echo "ERROR: dist/vendor/fontawesome/fa-solid.min.css missing after copy." >&2
  exit 1
}

# Hard assertion: the vendored @font-face src must use a valid CSS format()
# hint. A backslash-escaped variant (format(\"woff2\")) is a JSON/JS
# string-escaping artifact that makes the whole @font-face rule a parse
# error, so the font never loads and every toolbar glyph renders as tofu.
if grep -q 'format(\\"woff2\\")' dist/vendor/fontawesome/fa-solid.min.css; then
  echo "ERROR: fa-solid.min.css has a corrupt @font-face format() hint" >&2
  echo "  (backslash-escaped quotes). Re-vendor the file without escaping." >&2
  exit 1
fi

echo "Built dist/ (GitHub Pages-ready)."
