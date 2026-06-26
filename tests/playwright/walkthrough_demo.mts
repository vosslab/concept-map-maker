// walkthrough_demo.mts - standalone Playwright walkthrough demo player.
//
// Drives the Concept Map Maker UI like a human player: reads a triples JSON
// dataset and enters each row with per-keystroke delay so the map visibly grows.
// Uses the chain button when a triple's "from" matches the previous triple's "to".
//
// Usage (via shell wrapper):
//   bash run_walkthrough_demo.sh [--data <path>] [--speed <ms>] [--headed] [--build]
//
// Direct usage (dist/ must already exist):
//   npx tsx tests/playwright/walkthrough_demo.mts [args]
//
// Outputs:
//   output_smoke/walkthrough/row_NN.png   - screenshot after each row commit
//   output_smoke/walkthrough/final_map.png - screenshot of completed map
//   output_smoke/walkthrough/            - Playwright video recording (if --video)

import { chromium } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";
import * as http from "node:http";
import * as net from "node:net";

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

interface Triple {
  from: string;
  verb: string;
  to: string;
}

interface DemoArgs {
  data_path: string;
  speed_ms: number;
  headed: boolean;
  video: boolean;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

// Default data path relative to repo root (resolved at runtime)
const DEFAULT_DATA_RELATIVE = "tests/playwright/walkthrough_data/honeybees_triples.json";
const DEFAULT_SPEED_MS = 60;

function parse_args(argv: string[]): DemoArgs {
  // Determine repo root via the script's own location.
  const script_dir = path.dirname(new URL(import.meta.url).pathname);
  const repo_root = path.resolve(script_dir, "..", "..");
  const default_data = path.join(repo_root, DEFAULT_DATA_RELATIVE);

  let data_path = default_data;
  let speed_ms = DEFAULT_SPEED_MS;
  let headed = false;
  let video = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--data") {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new Error("--data requires a path argument");
      }
      data_path = next;
      i++;
    } else if (arg === "--speed") {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new Error("--speed requires a millisecond value");
      }
      speed_ms = parseInt(next, 10);
      if (isNaN(speed_ms) || speed_ms < 0) {
        throw new Error(`--speed must be a non-negative integer, got: ${next}`);
      }
      i++;
    } else if (arg === "--headed") {
      headed = true;
    } else if (arg === "--no-video") {
      video = false;
    } else if (arg === "--video") {
      video = true;
    }
  }

  return { data_path, speed_ms, headed, video };
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function load_triples(data_path: string): Triple[] {
  const raw = fs.readFileSync(data_path, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected a JSON array in ${data_path}`);
  }
  const triples: Triple[] = [];
  for (const item of parsed) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>)["from"] !== "string" ||
      typeof (item as Record<string, unknown>)["verb"] !== "string" ||
      typeof (item as Record<string, unknown>)["to"] !== "string"
    ) {
      throw new Error(`Invalid triple entry: ${JSON.stringify(item)}`);
    }
    const entry = item as { from: string; verb: string; to: string };
    triples.push({ from: entry.from, verb: entry.verb, to: entry.to });
  }
  return triples;
}

// ---------------------------------------------------------------------------
// Free port detection
// ---------------------------------------------------------------------------

async function find_free_port(start: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(start, () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") {
        server.close(() => reject(new Error("Could not determine port")));
        return;
      }
      const port = addr.port;
      server.close(() => resolve(port));
    });
    server.on("error", () => {
      // Port in use; try next
      find_free_port(start + 1)
        .then(resolve)
        .catch(reject);
    });
  });
}

// ---------------------------------------------------------------------------
// HTTP server (serve dist/)
// ---------------------------------------------------------------------------

function start_http_server(dist_dir: string, port: number): http.Server {
  const server = http.createServer((req, res) => {
    let url_path = req.url ?? "/";
    if (url_path === "/" || url_path === "") {
      url_path = "/index.html";
    }
    // Strip query strings
    const clean_path = url_path.split("?")[0] ?? "/index.html";
    const file_path = path.join(dist_dir, clean_path);

    fs.readFile(file_path, (err, data) => {
      if (err) {
        // Fallback to index.html for SPA routing
        const index_path = path.join(dist_dir, "index.html");
        fs.readFile(index_path, (err2, index_data) => {
          if (err2) {
            res.writeHead(404);
            res.end("Not found");
            return;
          }
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(index_data);
        });
        return;
      }

      // Simple MIME type detection
      const ext = path.extname(file_path).toLowerCase();
      const mime_map: Record<string, string> = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
        ".ttf": "font/ttf",
        ".ico": "image/x-icon",
      };
      const content_type = mime_map[ext] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": content_type });
      res.end(data);
    });
  });

  server.listen(port);
  return server;
}

// ---------------------------------------------------------------------------
// Wait for server to be ready
// ---------------------------------------------------------------------------

async function wait_for_server(url: string, timeout_ms: number): Promise<void> {
  const deadline = Date.now() + timeout_ms;
  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          if (res.statusCode !== undefined && res.statusCode < 500) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode ?? "unknown"}`));
          }
        });
        req.on("error", reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error("timeout"));
        });
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`Server at ${url} did not start within ${timeout_ms}ms`);
}

// ---------------------------------------------------------------------------
// Main demo runner
// ---------------------------------------------------------------------------

async function run_demo(args: DemoArgs): Promise<void> {
  // Determine repo root
  const script_dir = path.dirname(new URL(import.meta.url).pathname);
  const repo_root = path.resolve(script_dir, "..", "..");

  const dist_dir = path.join(repo_root, "dist");
  if (!fs.existsSync(path.join(dist_dir, "index.html"))) {
    throw new Error(
      `dist/index.html not found. Run 'bash build_github_pages.sh' first, or pass --build to run_walkthrough_demo.sh.`,
    );
  }

  const output_dir = path.join(repo_root, "output_smoke", "walkthrough");
  fs.mkdirSync(output_dir, { recursive: true });

  const triples = load_triples(args.data_path);
  process.stdout.write(`Loaded ${triples.length} triples from ${args.data_path}\n`);

  // Start HTTP server
  const port = await find_free_port(18080);
  const base_url = `http://localhost:${port}`;
  const server = start_http_server(dist_dir, port);

  // Ensure server is killed on exit
  let browser_closed = false;
  const cleanup = (): void => {
    if (!browser_closed) {
      server.close();
    }
  };
  process.on("exit", cleanup);

  try {
    await wait_for_server(base_url, 15_000);
    process.stdout.write(`Server ready at ${base_url}\n`);

    // Launch browser
    const browser = await chromium.launch({ headless: !args.headed });

    const context_options: Parameters<typeof browser.newContext>[0] = {
      viewport: { width: 1400, height: 900 },
    };
    if (args.video) {
      context_options.recordVideo = {
        dir: output_dir,
        size: { width: 1400, height: 900 },
      };
    }

    const context = await browser.newContext(context_options);
    const page = await context.newPage();

    // Navigate to app
    await page.goto(base_url);
    await page.waitForLoadState("networkidle");
    process.stdout.write("App loaded.\n");

    // Set document title via toolbar title input
    const title_input = page.getByLabel("Document title");
    await title_input.click();
    await title_input.fill("");
    await title_input.pressSequentially("Honeybee castes walkthrough", {
      delay: args.speed_ms,
    });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    process.stdout.write("Title set.\n");

    // Click + Add row to create the first row
    await page.getByRole("button", { name: "+ Add row" }).click();
    await page.waitForTimeout(150);

    let prev_to: string | null = null;
    let row_num = 1;
    const screenshot_paths: string[] = [];

    for (let i = 0; i < triples.length; i++) {
      const triple = triples[i];
      if (triple === undefined) continue;

      const use_chain = prev_to !== null && triple.from === prev_to;

      if (use_chain && prev_to !== null) {
        // Use chain button from previous row to insert new row below.
        // Primary: class selector (.triple-chain-btn nth) -- stable across aria-label wording changes.
        // Fallback: aria-label selector used when the class-based count is unexpectedly low.
        const prev_row = row_num - 1;
        const chain_btns = page.locator(".triple-chain-btn");
        const count = await chain_btns.count();
        if (count >= prev_row) {
          await chain_btns.nth(prev_row - 1).click();
        } else {
          // Fallback: aria-label selector
          await page.getByLabel(`Chain new row from row ${prev_row}`).click();
        }
        await page.waitForTimeout(200);
        process.stdout.write(
          `Row ${row_num}: chaining from "${prev_to}" -> verb: "${triple.verb}", to: "${triple.to}"\n`,
        );

        // After chain click, verb input of new row should be focused
        const verb_input = page.getByLabel(`Row ${row_num} verb phrase`);
        await verb_input.click();
        await verb_input.pressSequentially(triple.verb, { delay: args.speed_ms });
        await verb_input.press("Enter");
        await page.waitForTimeout(200);

        const to_input = page.getByLabel(`Row ${row_num} to concept`);
        await to_input.click();
        await to_input.pressSequentially(triple.to, { delay: args.speed_ms });
        await page.keyboard.press("Escape");
        await to_input.press("Tab");
        await page.waitForTimeout(300);
      } else {
        // Add new row if not the first row
        if (i > 0) {
          await page.getByRole("button", { name: "+ Add row" }).click();
          await page.waitForTimeout(150);
        }

        process.stdout.write(
          `Row ${row_num}: from: "${triple.from}", verb: "${triple.verb}", to: "${triple.to}"\n`,
        );

        const from_input = page.getByLabel(`Row ${row_num} from concept`);
        await from_input.click();
        await from_input.pressSequentially(triple.from, { delay: args.speed_ms });
        await page.keyboard.press("Escape");
        await from_input.press("Tab");
        await page.waitForTimeout(200);

        const verb_input = page.getByLabel(`Row ${row_num} verb phrase`);
        await verb_input.pressSequentially(triple.verb, { delay: args.speed_ms });
        await verb_input.press("Enter");
        await page.waitForTimeout(200);

        const to_input = page.getByLabel(`Row ${row_num} to concept`);
        await to_input.click();
        await to_input.pressSequentially(triple.to, { delay: args.speed_ms });
        await page.keyboard.press("Escape");
        await to_input.press("Tab");
        await page.waitForTimeout(300);
      }

      // Screenshot after each row commit
      const row_screenshot = path.join(output_dir, `row_${String(row_num).padStart(2, "0")}.png`);
      await page.screenshot({ path: row_screenshot, fullPage: false });
      screenshot_paths.push(row_screenshot);
      process.stdout.write(`  Screenshot: ${row_screenshot}\n`);

      prev_to = triple.to;
      row_num++;
    }

    // Final screenshot
    await page.waitForTimeout(500);
    const final_screenshot = path.join(output_dir, "final_map.png");
    await page.screenshot({ path: final_screenshot, fullPage: false });
    process.stdout.write(`Final screenshot: ${final_screenshot}\n`);

    // Close context (finalizes video)
    await context.close();
    browser_closed = true;
    await browser.close();

    server.close();

    // Print summary
    process.stdout.write("\n--- Walkthrough demo summary ---\n");
    process.stdout.write(`Rows entered:  ${row_num - 1}\n`);
    process.stdout.write(`Screenshots:   ${screenshot_paths.length + 1} (rows + final)\n`);
    process.stdout.write(`Output dir:    ${output_dir}\n`);
    if (args.video) {
      process.stdout.write(`Video:         ${output_dir}/ (Playwright recording)\n`);
    }
    process.stdout.write("PASS: walkthrough demo complete.\n");
  } catch (err) {
    server.close();
    process.stderr.write(`ERROR: ${String(err)}\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Detect if running via tsx or node (not imported as a module)
// ---------------------------------------------------------------------------

const args = parse_args(process.argv.slice(2));
run_demo(args).catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
