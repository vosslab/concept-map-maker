#!/usr/bin/env bash
# run_walkthrough_demo.sh - run the Concept Map Maker walkthrough demo player.
#
# Records a human-like playthrough of entering triples into the concept map UI,
# saving per-row screenshots and a video to output_smoke/walkthrough/.
#
# Preflights:
#   - node and npx must be on PATH.
#   - node_modules must be installed (npm install).
#   - dist/index.html must exist unless --build is passed.
#
# Flags:
#   -h, --help         Print usage and exit 0.
#   --build            Force a dist/ rebuild before running the demo.
#   --data <path>      Path to triples JSON (default: honeybees_triples.json).
#   --speed <ms>       Per-keystroke delay in ms (default: 60).
#   --headed           Run with a visible browser window (default: headless).
#   --no-video         Disable Playwright video recording (default: on).
#
# Examples:
#   bash run_walkthrough_demo.sh
#   bash run_walkthrough_demo.sh --build --headed
#   bash run_walkthrough_demo.sh --data my_triples.json --speed 80

set -euo pipefail

usage() {
	printf 'Usage: run_walkthrough_demo.sh [-h|--help] [--build] [--data <path>]\n'
	printf '                               [--speed <ms>] [--headed] [--no-video]\n'
	printf '\n'
	printf '  -h, --help         Print this help and exit 0.\n'
	printf '  --build            Force a dist/ rebuild before running.\n'
	printf '  --data <path>      Path to triples JSON dataset.\n'
	printf '  --speed <ms>       Per-keystroke delay in milliseconds.\n'
	printf '  --headed           Show the browser window during playback.\n'
	printf '  --no-video         Disable video recording.\n'
}

FORCE_BUILD=0
DEMO_ARGS=()

while [ "$#" -gt 0 ]; do
	case "$1" in
		-h|--help)
			usage
			exit 0
			;;
		--build)
			FORCE_BUILD=1
			shift
			;;
		*)
			DEMO_ARGS+=("$1")
			shift
			;;
	esac
done

# Move to repo root
cd "$(git rev-parse --show-toplevel)"

# Preflight: node
if ! command -v node >/dev/null 2>&1; then
	printf 'ERROR: node not found on PATH.\n' >&2
	exit 1
fi

# Preflight: npx
if ! command -v npx >/dev/null 2>&1; then
	printf 'ERROR: npx not found on PATH.\n' >&2
	exit 1
fi

# Preflight: node_modules
if [ ! -d node_modules ]; then
	printf 'ERROR: node_modules missing. Run npm install first.\n' >&2
	exit 1
fi

# Build dist/ if needed or forced
if [ "$FORCE_BUILD" -eq 1 ]; then
	printf '==> --build flag set: rebuilding dist/...\n'
	bash build_github_pages.sh
elif [ ! -f dist/index.html ]; then
	printf '==> dist/index.html missing: running build_github_pages.sh...\n'
	bash build_github_pages.sh
fi

# Create output dir
mkdir -p output_smoke/walkthrough

# Run the demo
printf '==> Starting walkthrough demo...\n'
EXIT_CODE=0
set +e
npx tsx tests/playwright/walkthrough_demo.mts "${DEMO_ARGS[@]+"${DEMO_ARGS[@]}"}"
EXIT_CODE=$?
set -e

if [ "$EXIT_CODE" -eq 0 ]; then
	printf 'PASS: run_walkthrough_demo.sh complete.\n'
else
	printf 'FAIL: walkthrough demo exited with code %d.\n' "$EXIT_CODE"
fi

exit "$EXIT_CODE"
