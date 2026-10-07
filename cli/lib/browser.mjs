// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Launch the Chrome that HyperFrames renders with, through puppeteer-core, so
// tools need no second browser. HYPERFRAMES_BROWSER_PATH overrides the binary.
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { hyperframesOutput } from "./run.mjs";

export function browserPath() {
  const env = process.env.HYPERFRAMES_BROWSER_PATH;
  if (env && existsSync(env)) return env;
  // `browser path` finds or downloads chrome-headless-shell and prints its path last.
  const out = hyperframesOutput(["browser", "path"]);
  const found = out.trim().split("\n").pop().trim();
  if (!found || !existsSync(found)) {
    throw new Error(`no browser: "hyperframes browser path" printed "${found}"; run: npx hyperframes browser ensure, or set HYPERFRAMES_BROWSER_PATH`);
  }
  return found;
}

// Flags that make two screenshots of the same frame identical: no GPU, one
// colour profile, no partial raster reuse (it leaves seams at tile edges).
export const STABLE_ARGS = ["--force-color-profile=srgb", "--disable-gpu", "--font-render-hinting=none", "--disable-partial-raster", "--num-raster-threads=1"];

export function launch(opts = {}) {
  return puppeteer.launch({
    executablePath: browserPath(),
    headless: true,
    args: ["--no-sandbox", "--allow-file-access-from-files", ...(opts.args || [])],
  });
}

// Open an episode page outside the render runtime and record what it does:
// console warnings and errors, page errors, requests for files that do not
// exist and requests to the network. HyperFrames defines window.__timelines;
// a plain page does not, so it is defined before the page's scripts run.
// opts: { width, height, file, query, init: [functions run before the page's scripts] }.
export async function openEpisode(browser, dir, opts = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: opts.width || 1920, height: opts.height || 1080, deviceScaleFactor: 1 });
  const log = { warnings: [], errors: [], missing: [], network: [] };
  await page.evaluateOnNewDocument(() => {
    window.__timelines = {};
  });
  for (const init of opts.init || []) await page.evaluateOnNewDocument(init);
  page.on("console", (m) => {
    if (!["warn", "warning", "error"].includes(m.type())) return;
    // Missing local files are reported below, by name.
    const at = (m.location() || {}).url || "";
    if (/^Failed to load resource/.test(m.text()) && at.startsWith("file:")) return;
    log.warnings.push(m.text());
  });
  page.on("pageerror", (e) => log.errors.push(e.message));
  page.on("request", (r) => {
    let u;
    try {
      u = new URL(r.url());
    } catch {
      return;
    }
    if (u.protocol === "file:") {
      const file = decodeURIComponent(u.pathname);
      if (!existsSync(file)) log.missing.push(file);
    } else if (u.protocol === "http:" || u.protocol === "https:") {
      log.network.push(r.url());
    }
  });
  await page.goto(pathToFileURL(path.join(dir, opts.file || "index.html")).href + (opts.query ? `?${opts.query}` : ""));
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return { page, log };
}
