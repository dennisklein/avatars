#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Screenshot a local HTML page with the browser HyperFrames renders with:
//
//   node cli/tools/shot.mjs <file.html> <out.png> [query] [width] [height]
//
// The whole page is captured once its fonts have loaded; console messages and
// page errors are printed.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "../lib/browser.mjs";

const [file, out, query = "", w = "1300", h = "900"] = process.argv.slice(2);
if (!file || !out) {
  console.error("usage: shot.mjs <file.html> <out.png> [query] [width] [height]");
  process.exit(2);
}
const browser = await launch();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: +w, height: +h });
  page.on("console", (m) => console.log("console:", m.text()));
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  // Episode pages register their timeline on HyperFrames' window.__timelines.
  await page.evaluateOnNewDocument(() => {
    window.__timelines = window.__timelines || {};
  });
  await page.goto(pathToFileURL(path.resolve(file)).href + (query ? "?" + query : ""));
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({ path: out, fullPage: true });
} finally {
  await browser.close();
}
