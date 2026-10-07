#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Determinism check: render an episode's frames at the same times in order,
// in reverse order and in order again, and report every frame that differs.
// Every frame must be a pure function of timeline time, because HyperFrames
// seeks a paused timeline on parallel workers. Each frame is compared twice:
// its DOM (attributes, inline styles, text, scroll offsets) and its pixels.
// A DOM that depends on the seek order is a determinism bug ("state"); pixels
// that differ over an identical DOM are the browser's raster and anti-
// aliasing noise ("raster"), reported but not failed.
//
//   node cli/tools/frame-diff.mjs <id> [--project DIR] [--at 1,2.5,...] [--step 1] [--out DIR]
//
// It seeks as HyperFrames' renderer does (pause, then totalTime(t), after a
// totalTime(0, true) on load) at frame times: every --step seconds from the
// first frame after 0 (the renderer reaches frame 0 only on a fresh page) and
// the start of every chapter, snapped to the composition's frame rate
// (data-fps, default 30). --at gives exact times instead. --out writes both
// versions of each differing frame as PNG files. Exit code 1 when the DOM of
// a frame depends on the seek order.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { STABLE_ARGS, launch, openEpisode } from "../lib/browser.mjs";
import { loadProject, resolveEpisode } from "../lib/project.mjs";
import { refreshVendor } from "../lib/vendor.mjs";

const usage = "usage: frame-diff.mjs <id> [--project DIR] [--at 1,2.5,...] [--step 1] [--out DIR]";
let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: { project: { type: "string" }, at: { type: "string" }, step: { type: "string", default: "1" }, out: { type: "string" } },
  });
} catch (e) {
  console.error(`frame-diff: ${e.message}\n${usage}`);
  process.exit(2);
}
const { values: opt, positionals } = args;
const step = Number(opt.step);
if (positionals.length !== 1 || !(step > 0)) {
  console.error(usage);
  process.exit(2);
}
const id = positionals[0];
const r3 = (t) => Math.round(t * 1000) / 1000;

// Differing pixels of two PNG screenshots and their bounding box, decoded in
// a blank page so this tool needs no image library.
async function pixelDiff(browser, a, b) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(
      async (a, b) => {
        const load = (b64) =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = `data:image/png;base64,${b64}`;
          });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const data = (img) => {
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext("2d");
          g.drawImage(img, 0, 0);
          return g.getImageData(0, 0, img.width, img.height).data;
        };
        const da = data(ia);
        const db = data(ib);
        const w = ia.width;
        let n = 0;
        let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
        for (let i = 0; i < da.length; i += 4) {
          if (da[i] === db[i] && da[i + 1] === db[i + 1] && da[i + 2] === db[i + 2]) continue;
          const x = (i / 4) % w;
          const y = Math.floor(i / 4 / w);
          n++;
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
        return { pixels: n, bbox: n ? [x0, y0, x1, y1] : null };
      },
      a.toString("base64"),
      b.toString("base64")
    );
  } finally {
    await page.close();
  }
}

// What renders of the DOM below <body>, as text: one line per visible node
// with its attributes except style, its inline custom properties, and the
// computed values of the properties that animations change. Nothing below
// display: none or opacity: 0 renders, and an element with visibility other
// than visible does not render itself, so their state cannot reach a frame
// and is left out (a hidden scene keeps whatever its next tween parked it
// at). Inline style text is left out too: GSAP orders its declarations by
// which tween touched the element first.
function domState() {
  const PROPS = ["display", "visibility", "opacity", "transform", "transform-origin", "clip-path", "filter", "left", "top", "right", "bottom", "width", "height",
    "color", "background-color", "background-position", "border-color", "box-shadow", "font-size", "letter-spacing", "z-index", "stroke-dashoffset", "stroke-dasharray"];
  const IDENTITY = new Set(["none", "matrix(1, 0, 0, 1, 0, 0)"]);
  const out = [];
  const walk = (n, path, shown) => {
    if (n.nodeType === 3) {
      if (shown && n.nodeValue.trim()) out.push(`${path} #text ${n.nodeValue}`);
      return;
    }
    if (n.nodeType !== 1 || n.tagName === "SCRIPT" || n.tagName === "STYLE") return;
    const cs = getComputedStyle(n);
    if (cs.display === "none" || cs.opacity === "0") return;
    const visible = cs.visibility === "visible";
    let line = `${path} <${n.tagName.toLowerCase()}`;
    for (const a of n.attributes) if (a.name !== "style") line += ` ${a.name}="${a.value}"`;
    const custom = [];
    for (let i = 0; i < n.style.length; i++) if (n.style[i].startsWith("--")) custom.push(`${n.style[i]}:${n.style.getPropertyValue(n.style[i]).trim()}`);
    if (custom.length) line += ` vars{${custom.sort().join(";")}}`;
    line += " {";
    for (const p of PROPS) {
      const v = cs.getPropertyValue(p);
      line += `${p}:${p === "transform" && IDENTITY.has(v) ? "none" : v};`;
    }
    line += "}";
    if (n.scrollTop || n.scrollLeft) line += ` scroll=${n.scrollTop},${n.scrollLeft}`;
    if (visible) out.push(line + ">");
    let i = 0;
    for (const c of n.childNodes) walk(c, `${path}/${i++}`, visible);
  };
  walk(document.body, "body", true);
  return out.join("\n");
}

// The first line where two DOM states differ, shortened.
function firstDifference(a, b) {
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] === lb[i]) continue;
    const cut = (s) => (s == null ? "(none)" : s.length > 160 ? `${s.slice(0, 159)}…` : s);
    return `${cut(la[i])}  ≠  ${cut(lb[i])}`;
  }
  return "";
}

async function main() {
  const project = loadProject(opt.project);
  const r = resolveEpisode(project, id);
  refreshVendor(r);
  if (!existsSync(path.join(r.dir, "assets/voice/lines.js"))) throw new Error(`${id}: no narration, run: avatars voice ${id} (or fixture-voice)`);
  const browser = await launch({ args: STABLE_ARGS });
  try {
    const { page, log } = await openEpisode(browser, r.dir, { width: r.format.width, height: r.format.height });
    if (log.errors.length) throw new Error(`page errors: ${log.errors.join("; ")}`);
    const info = await page.evaluate(() => {
      const root = document.querySelector("[data-composition-id]");
      const keys = Object.keys(window.__timelines || {});
      const key = root && keys.includes(root.getAttribute("data-composition-id")) ? root.getAttribute("data-composition-id") : keys[0];
      const ep = window.__episode;
      const fps = Number(root && root.getAttribute("data-fps")) || 30;
      // The renderer's first step after loading.
      if (key) window.__timelines[key].totalTime(0, true);
      return { key, fps, duration: ep ? ep.duration : key ? window.__timelines[key].duration() : 0, chapters: ep ? ep.chapters.map((c) => c.start) : [] };
    });
    if (!info.key) throw new Error("the page registers no timeline on window.__timelines");
    const frame = (t) => r3(Math.round(t * info.fps) / info.fps);
    let times;
    if (opt.at) {
      times = opt.at.split(",").map(Number);
      if (times.some((t) => !Number.isFinite(t) || t < 0)) throw new Error(`--at "${opt.at}" is not a list of seconds`);
    } else {
      const set = new Set();
      for (let t = 1 / info.fps; t < info.duration; t += step) set.add(frame(t));
      for (const c of info.chapters) if (c > 0 && c < info.duration) set.add(frame(c));
      times = [...set];
    }
    times = [...new Set(times.map(r3))].sort((a, b) => a - b);

    const shoot = async (t) => {
      // A background tab can leave stale tiles; keep the page in front.
      await page.bringToFront();
      // Returns nothing: the timeline itself is too big to send back.
      await page.evaluate(
        (key, t) => {
          const tl = window.__timelines[key];
          tl.pause();
          tl.totalTime(t, false);
        },
        info.key,
        t
      );
      const png = Buffer.from(await page.screenshot({ type: "png" }));
      return { png, dom: await page.evaluate(domState) };
    };
    const pass = async (order) => {
      const shots = new Map();
      for (const t of order) shots.set(t, await shoot(t));
      return shots;
    };
    const forward = await pass(times);
    const reverse = await pass([...times].reverse());
    const again = await pass(times);
    if (log.errors.length) throw new Error(`page errors while seeking: ${log.errors.join("; ")}`);

    const found = [];
    for (const t of times) {
      const a = forward.get(t);
      const others = [["reverse", reverse.get(t)], ["again", again.get(t)]];
      const domOff = others.find(([, o]) => o.dom !== a.dom);
      const pngOff = others.find(([, o]) => !o.png.equals(a.png));
      if (!domOff && !pngOff) continue;
      const [name, other] = domOff || pngOff;
      const d = await pixelDiff(browser, a.png, other.png);
      found.push({ t, kind: domOff ? "state" : "raster", pass: name, element: domOff ? firstDifference(a.dom, other.dom) : "", ...d });
      if (opt.out) {
        mkdirSync(opt.out, { recursive: true });
        writeFileSync(path.join(opt.out, `${id}-${t.toFixed(3)}-forward.png`), a.png);
        writeFileSync(path.join(opt.out, `${id}-${t.toFixed(3)}-${name}.png`), other.png);
      }
    }
    const state = found.filter((f) => f.kind === "state").length;
    if (!found.length) {
      console.log(`${id}: ${times.length} frames, identical in order, in reverse order and in order again`);
      return 0;
    }
    console.log(`${id}: ${times.length} frames; ${state} with a DOM that depends on the seek order, ${found.length - state} with raster noise only`);
    for (const f of found) {
      const box = f.bbox ? `[${f.bbox[0]},${f.bbox[1]} ${f.bbox[2]},${f.bbox[3]}]` : "";
      console.log(`  ${`${f.t.toFixed(3)} s`.padStart(10)}  ${f.kind.padEnd(6)} vs ${f.pass.padEnd(7)}  ${String(f.pixels).padStart(8)} px  ${box}`);
      if (f.element) console.log(`              first difference: ${f.element}`);
    }
    return state ? 1 : 0;
  } finally {
    await browser.close();
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`frame-diff: ${e.message}`);
    process.exit(1);
  }
);
