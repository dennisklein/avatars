// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// `avatars check`: load an episode's composition outside the render runtime
// and report what an author cannot see in a still: the timeline, console
// warnings, page errors, missing files and network fetches, narration that
// is never said or changed since it was voiced, dead air, clipped diagram
// text, terminal and code content that is not grounded in the episode's
// pages, the project's own checks, then lint and two stills per chapter as
// contact sheets. Before loading it validates the project's and the
// episode's manifests, rebuilds a stale vendor/, and compares the page's
// @font-face rules with the theme's fonts; it also checks the theme's
// contrast pairs and gestures the presenter's base cannot perform.
// Errors fail the command; warnings do not.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launch, openEpisode } from "./browser.mjs";
import { groundingPages, ungrounded } from "./grounding.mjs";
import { fontFaceCss, readJson, resolveEpisode } from "./project.mjs";
import { hyperframes } from "./run.mjs";
import { snapshot, stillTimes } from "./stills.mjs";
import { contrast } from "./tokens.mjs";
import { validateItems } from "./validate.mjs";
import { refreshVendor } from "./vendor.mjs";

// m:ss.s, rounded first so that 59.96 s prints as 1:00.0, not 0:60.0.
export const clock = (t) => {
  const d = Math.round(t * 10) / 10;
  return `${Math.floor(d / 60)}:${(d % 60).toFixed(1).padStart(4, "0")}`;
};
// Longest pause between two lines before it counts as dead air (s).
const DEAD_AIR = 2.5;

// The @font-face rules of a page's inline styles, as "family|weight|url".
export function pageFontFaces(html) {
  const out = [];
  for (const [, css] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const [, body] of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
      const prop = (name) => {
        const m = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i").exec(body);
        return m ? m[1].trim() : "";
      };
      const family = prop("font-family").replace(/^["']|["']$/g, "");
      const weight = prop("font-weight").replace(/\s+/g, " ");
      const url = /url\(\s*["']?([^"')]+?)["']?\s*\)/i.exec(prop("src"));
      out.push(`${family}|${weight}|${url ? url[1] : ""}`);
    }
  }
  return out;
}

export const themeFontFaces = (fonts) => fonts.map((f) => `${f.family}|${String(f.weight).replace(/\s+/g, " ")}|vendor/fonts/${f.file}`);

// Problems with a page head's @font-face rules: it must declare exactly the
// theme's fonts, because HyperFrames' lint reads only inline styles.
export function fontFaceProblems(html, fonts, themeId) {
  const have = pageFontFaces(html);
  const want = themeFontFaces(fonts);
  const label = (k) => {
    const [family, weight, url] = k.split("|");
    return `${family} ${weight || "(no weight)"} (${url || "no url"})`;
  };
  return [
    ...want.filter((k) => !have.includes(k)).map((k) => `the page head lacks the @font-face rule of theme ${themeId} for ${label(k)}`),
    ...have.filter((k) => !want.includes(k)).map((k) => `the page head declares @font-face ${label(k)}, which theme ${themeId} does not have`),
  ];
}

// Contrast of the theme's text pairs with this episode's tokens; semi-
// transparent backgrounds are composited over color.bg.
export function contrastProblems(theme, tokens) {
  const out = [];
  for (const [fg, bg, min] of theme.contrast || []) {
    const a = tokens[fg];
    const b = tokens[bg];
    if (a == null || b == null) {
      out.push(`contrast pair ${fg} on ${bg}: ${a == null ? fg : bg} is not a token`);
      continue;
    }
    let ratio;
    try {
      ratio = contrast(a, b, tokens["color.bg"]);
    } catch (e) {
      out.push(`contrast pair ${fg} on ${bg}: ${e.message}`);
      continue;
    }
    if (ratio + 1e-9 < min) out.push(`${fg} (${a}) on ${bg} (${b}) has contrast ${ratio.toFixed(2)}, below ${min}`);
  }
  return out;
}

// Runs in the page before its scripts: records the role and gesture names
// of every presenter the page creates, by wrapping Avatars.createPresenter
// when the runtime defines it. The namespace object itself is unchanged.
function recordPresenters() {
  const calls = (window.__avatarsPresenters = []);
  const wrapped = new WeakSet();
  const wrap = (A) => {
    if (!A || typeof A !== "object" || wrapped.has(A)) return;
    wrapped.add(A);
    let fn;
    Object.defineProperty(A, "createPresenter", {
      configurable: true,
      enumerable: true,
      get: () => fn,
      set: (f) => {
        fn =
          typeof f !== "function"
            ? f
            : function (role, container, tracks) {
                calls.push({ role, gestures: ((tracks && tracks.gestures) || []).map((g) => g && g.name) });
                return f.apply(this, arguments);
              };
      },
    });
  };
  let ns;
  Object.defineProperty(window, "Avatars", {
    configurable: true,
    enumerable: true,
    get: () => ns,
    set: (v) => {
      ns = v;
      wrap(v);
    },
  });
}

// Gestures a presenter asks for that its base does not animate (the rig ignores them).
export function gestureProblems(calls, data) {
  const out = [];
  for (const c of calls || []) {
    const member = ((data && data.cast) || {})[c.role];
    if (!member) continue;
    const supported = (((data.bases || {})[member.base] || {}).gestures || []);
    for (const g of [...new Set(c.gestures)]) {
      if (g && !supported.includes(g)) out.push(`gesture "${g}" of the ${c.role} is ignored: base ${member.base} of ${member.avatar} animates ${supported.length ? supported.join(", ") : "no gestures"}`);
    }
  }
  return out;
}

function printTimeline(id, ep) {
  console.log(`\n${id}: ${clock(ep.duration)} (${ep.duration.toFixed(1)} s), ${ep.chapters.length} chapters, ${ep.lines.length} lines`);
  ep.chapters.forEach((c, i) => {
    const end = i + 1 < ep.chapters.length ? ep.chapters[i + 1].start : ep.duration;
    console.log(`  ${clock(c.start).padStart(6)}  ${(end - c.start).toFixed(1).padStart(5)} s  ${c.title}`);
    for (const l of ep.lines.filter((l) => l.start >= c.start && l.start < end)) {
      console.log(`  ${clock(l.start).padStart(14)}  ${l.id.padEnd(12)} ${l.text.length > 64 ? l.text.slice(0, 63) + "…" : l.text}`);
    }
  });
}

// Check one episode; prints a report and returns true when it has no errors.
export async function checkEpisode(project, id, opts = {}) {
  const dir = path.join(project.episodesDir, id);
  const errors = [];
  const warnings = [];
  const notes = [];
  const rel = (p) => path.relative(project.root, p) || ".";
  const report = () => {
    warnings.forEach((w) => console.log(`  warning: ${w}`));
    errors.forEach((e) => console.error(`  error: ${e}`));
    notes.forEach((n) => console.error(n));
    const n = (k, word) => `${k} ${word}${k === 1 ? "" : "s"}`;
    console.log(`${id}: ${n(errors.length, "error")}, ${n(warnings.length, "warning")}`);
    return errors.length === 0;
  };

  // Manifests first: a schema error explains most failures that follow.
  const items = [{ kind: "project", file: project.file }];
  if (typeof project.config.brand === "string") items.push({ kind: "brand", file: path.resolve(project.root, project.config.brand) });
  for (const [kind, f] of [["episode", "episode.json"], ["script", "script.json"]]) {
    if (existsSync(path.join(dir, f))) items.push({ kind, file: path.join(dir, f) });
  }
  for (const p of validateItems(items)) errors.push(`${rel(p.file)}: ${p.message}`);

  let r;
  try {
    r = resolveEpisode(project, id);
  } catch (e) {
    console.log(`\n${id}:`);
    errors.push(e.message);
    return report();
  }
  if (refreshVendor(r)) console.log(`${id}: vendor/ was out of date; rebuilt`);
  if (!existsSync(path.join(dir, "assets/voice/lines.js"))) {
    console.log(`\n${id}:`);
    errors.push(`no narration, run: avatars voice ${id} (or avatars fixture-voice ${id} for layout work)`);
    return report();
  }

  const fontProblems = fontFaceProblems(readFileSync(path.join(dir, "index.html"), "utf8"), r.fonts, r.config.theme);
  errors.push(...fontProblems);
  if (fontProblems.length) notes.push(`  the page head declares the theme's fonts with:\n  <style>\n${fontFaceCss(r.fonts, "    ")}\n  </style>`);
  warnings.push(...r.warnings);
  warnings.push(...contrastProblems(r.theme, r.tokens));

  // The composition, loaded as a browser would.
  let ep = null;
  const browser = await launch();
  try {
    const { page, log } = await openEpisode(browser, dir, { width: r.format.width, height: r.format.height, init: [recordPresenters] });
    ep = await page.evaluate(() => window.__episode || null);
    const presenters = await page.evaluate(() => window.__avatarsPresenters || []);
    warnings.push(...gestureProblems(presenters, r));
    // Text that does not fit its box is cut off with an ellipsis.
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll(".dnode .t1, .dnode .t2")].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent)
    );
    for (const text of clipped) warnings.push(`text cut off in a diagram node: "${text}"; widen the node (width) or shorten the text`);
    // Fixture narration (fixture-voice) has timings but no audio files.
    const fixture = new Set(await page.evaluate(() => Object.keys(window.AVATAR_LINES || {}).filter((k) => window.AVATAR_LINES[k] && window.AVATAR_LINES[k].fixture)));
    const silent = (f) => {
      const m = /^assets\/voice\/(.+)\.wav$/.exec(path.relative(dir, f).split(path.sep).join("/"));
      return m && fixture.has(m[1]);
    };
    if (fixture.size) warnings.push(`${fixture.size} lines have fixture narration without audio; run: avatars voice ${id} before rendering`);
    for (const w of log.warnings) warnings.push(`console: ${w}`);
    for (const e of log.errors) errors.push(`page error: ${e}`);
    for (const f of log.missing) if (!silent(f)) errors.push(`missing file: ${path.relative(dir, f)}`);
    for (const u of log.network) errors.push(`fetches from the network (renders must not): ${u}`);
  } finally {
    await browser.close();
  }
  if (!ep) {
    console.log(`\n${id}:`);
    errors.push("no window.__episode: the page must end with Episode.create(...)...done()");
    return report();
  }
  printTimeline(id, ep);
  if (ep.id && ep.id !== id) warnings.push(`window.__episode.id is "${ep.id}", but the episode directory is "${id}"; publish uses "${id}"`);

  // Narration: every script line voiced, up to date and used.
  const scriptFile = path.join(dir, "script.json");
  if (!existsSync(scriptFile)) errors.push("no script.json: the narration has no source");
  const script = existsSync(scriptFile) ? readJson(scriptFile) : { lines: [] };
  for (const line of script.lines || []) {
    const said = ep.lines.find((l) => l.id === line.id);
    if (!said) warnings.push(`line "${line.id}" is in script.json but never said`);
    else if (said.text !== line.text) errors.push(`line "${line.id}" changed since it was voiced, run: avatars voice ${id}`);
  }
  for (let i = 1; i < ep.lines.length; i++) {
    const gap = ep.lines[i].start - ep.lines[i - 1].end;
    if (gap > DEAD_AIR) warnings.push(`${gap.toFixed(1)} s without narration before "${ep.lines[i].id}" at ${clock(ep.lines[i].start)}`);
  }

  // Terminal and code content must come from the pages that embed the episode.
  const grounding = project.config.grounding;
  if (grounding && (!Array.isArray(grounding.sources) || typeof grounding.embed !== "string")) {
    errors.push('grounding needs { "sources": [directories], "embed": "snippet with {id}" }');
  } else if (grounding) {
    const pages = groundingPages(project.root, grounding, id);
    if (!pages.length) warnings.push(`no page under ${grounding.sources.join(", ")} embeds ${grounding.embed.split("{id}").join(id)}`);
    else warnings.push(...ungrounded(ep.terminal, pages, clock));
  }

  // The project's own checks.
  for (const mod of project.config.checks || []) {
    const file = path.resolve(project.root, mod);
    try {
      const m = await import(pathToFileURL(file).href);
      if (typeof m.default !== "function") throw new Error("has no default export function");
      await m.default({
        id,
        dir,
        episode: ep,
        project,
        warn: (msg) => warnings.push(`${mod}: ${msg}`),
        error: (msg) => errors.push(`${mod}: ${msg}`),
      });
    } catch (e) {
      errors.push(`check ${mod}: ${e.message}`);
    }
  }

  if (!opts.quick) {
    try {
      hyperframes(["lint"], dir);
    } catch {
      errors.push("hyperframes lint failed");
    }
    // Two stills per chapter: mid-way and fully built just before the next one.
    const out = path.join(dir, "snapshots");
    try {
      const sheets = snapshot(dir, stillTimes(ep), out);
      console.log(`stills, two per chapter (middle, end): ${sheets.map((f) => rel(path.join(out, f))).join(", ")}`);
    } catch (e) {
      errors.push(`hyperframes snapshot failed: ${e.message}`);
    }
  }
  return report();
}
