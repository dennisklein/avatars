#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Mouth-open statistics of a voice line, to tune an avatar's lipKernel and
// lipGain: a median opening of about 0.3 reads well.
//
//   node cli/tools/mouth-stats.mjs <line.json> [--bundle avatars.js] [--avatar ID] [--look L] [--project DIR] [--fps 30]
//
// The presenter comes from a vendor bundle: --bundle, else the vendor/ of the
// episode the line belongs to, else one built for --avatar (default: the
// project's host) as for an avatar sheet.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { launch } from "../lib/browser.mjs";
import { findProjectRoot, loadProject } from "../lib/project.mjs";
import { buildSheet } from "../lib/sheet.mjs";

const usage = "usage: mouth-stats.mjs <line.json> [--bundle avatars.js] [--avatar ID] [--look L] [--project DIR] [--fps 30]";
let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: { bundle: { type: "string" }, avatar: { type: "string" }, look: { type: "string" }, project: { type: "string" }, fps: { type: "string", default: "30" } },
  });
} catch (e) {
  console.error(`mouth-stats: ${e.message}\n${usage}`);
  process.exit(2);
}
const { values: opt, positionals } = args;
if (positionals.length !== 1) {
  console.error(usage);
  process.exit(2);
}

// The vendor bundle of the episode a line file lives in (episodes/<id>/assets/voice/<line>.json).
function episodeBundle(file) {
  let dir = path.dirname(path.resolve(file));
  for (let i = 0; i < 4; i++, dir = path.dirname(dir)) {
    const f = path.join(dir, "vendor", "avatars.js");
    if (existsSync(f)) return f;
  }
  return null;
}

async function main() {
  const line = JSON.parse(readFileSync(positionals[0], "utf8"));
  let bundle = opt.bundle ? path.resolve(opt.bundle) : opt.avatar ? null : episodeBundle(positionals[0]);
  let sheet = null;
  if (!bundle) {
    const project = (opt.project || findProjectRoot(process.cwd())) ? loadProject(opt.project) : null;
    const avatar = opt.avatar || (project && project.config.cast.host.avatar);
    if (!avatar) throw new Error("no bundle: pass --bundle, --avatar or --project");
    sheet = buildSheet(project, { avatar, look: opt.look });
    bundle = path.join(sheet.dir, "vendor", "avatars.js");
  }
  const fps = Number(opt.fps);
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent("<div id=a style='width:300px;height:400px'></div>");
    await page.addScriptTag({ path: bundle });
    const out = await page.evaluate(
      (line, fps) => {
        const el = document.getElementById("a");
        const host = window.Avatars.createPresenter("host", el, { speech: { offset: 0, visemes: line.visemes, envelope: line.envelope } });
        const vals = [];
        for (let t = 0; t < line.duration; t += 1 / fps) vals.push(host.mouthAt(t).open);
        return vals;
      },
      line,
      fps
    );
    const sorted = [...out].sort((a, b) => a - b);
    const q = (p) => sorted[Math.floor(p * (sorted.length - 1))].toFixed(2);
    console.log(`frames ${out.length}  p10 ${q(0.1)}  p50 ${q(0.5)}  p75 ${q(0.75)}  p90 ${q(0.9)}  max ${q(1)}`);
    console.log(out.slice(0, 60).map((v) => "▁▂▃▄▅▆▇█"[Math.max(0, Math.min(7, Math.floor(v * 8)))]).join(""));
  } finally {
    await browser.close();
    if (sheet) sheet.remove();
  }
}

main().catch((e) => {
  console.error(`mouth-stats: ${e.message}`);
  process.exit(1);
});
