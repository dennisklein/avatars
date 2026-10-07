// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// `avatars gallery --out DIR`: the catalogue of the library. For every avatar
// and look of this package and of the project's library it writes avatar
// sheets (moods and mouth shapes); if the package has a demo project
// (examples/demo), it adds two stills per chapter of each demo episode in
// every theme and, with --videos, the published video of each voiced demo
// episode in every theme. gallery/index.html is the page it fills.
//
//   DIR/index.html
//   DIR/avatars/<avatar>-<look>-expr.png, -visemes.png
//   DIR/episodes/<theme>/<episode>/contact-sheet-*.jpg
//   DIR/episodes/<theme>/<episode>/<episode>.webm, .jpg, .vtt   (--videos)
//
// Avatar sheets must succeed; demo stills and videos are best effort and
// reported. A run replaces DIR/avatars and DIR/episodes, and refuses to when
// they hold files it did not write. With --store, videos are kept in a store
// directory, one entry per theme, episode and render, so a run renders only
// what changed and removes the entries it did not use.
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { launch, openEpisode } from "./browser.mjs";
import { bundleFiles, writeVendor } from "./bundle.mjs";
import { writeFixtureVoice } from "./fixture-voice.mjs";
import { episodeFiles, renderHash } from "./hash.mjs";
import { PKG, episodeIds, fontFaceCss, loadProject, locate, readJson, resolveEpisode } from "./project.mjs";
import { MEDIA, VIDEO_TYPE, publishEpisode } from "./publish.mjs";
import { buildSheet, shootSheet } from "./sheet.mjs";
import { snapshot, stillTimes } from "./stills.mjs";
import { narrationProblem } from "./voice.mjs";

export const INDEX_PAGE = path.join(PKG, "gallery", "index.html");
export const DEMO = path.join(PKG, "examples", "demo");
const SHEETS = ["expr", "visemes"];
const MODE_TITLE = { expr: "moods", visemes: "mouth shapes" };

const dirsIn = (d) =>
  existsSync(d)
    ? readdirSync(d, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : [];
const jsonIn = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".json")).sort() : []);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Every avatar and look in the package and the project library; an avatar
// of the project library shadows a package avatar of the same id.
export function avatarLooks(project) {
  // Without a project, ids resolve in this package alone.
  const lookup = project || { lib: path.join(PKG, ".no-library"), config: { library: "library" } };
  const roots = project ? [project.lib, PKG] : [PKG];
  const ids = [...new Set(roots.flatMap((r) => dirsIn(path.join(r, "avatars"))))].sort();
  const out = [];
  for (const id of ids) {
    const hit = locate(lookup, `avatars/${id}/avatar.json`);
    if (!hit) continue;
    const avatar = readJson(hit.path);
    const looks = [...new Set(roots.flatMap((r) => jsonIn(path.join(r, "avatars", id, "looks"))))].sort();
    for (const f of looks) {
      const look = readJson(locate(lookup, `avatars/${id}/looks/${f}`).path);
      out.push({ avatar: id, look: f.replace(/\.json$/, ""), name: avatar.name || id, title: look.title || look.id, from: hit.label.startsWith("project:") ? "project" : "package" });
    }
  }
  return out;
}

// Every theme of the package and of a project's library.
function themeIds(project) {
  const roots = project ? [project.lib, PKG] : [PKG];
  return [...new Set(roots.flatMap((r) => dirsIn(path.join(r, "themes")).filter((t) => existsSync(path.join(r, "themes", t, "theme.json")))))].sort();
}

// An episode page whose head declares the given fonts instead of its own.
export function withFonts(html, fonts) {
  const rules = fontFaceCss(fonts);
  let placed = false;
  const out = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, open, css, close) => {
    let body = css.replace(/^[ \t]*@font-face\s*\{[^}]*\}[ \t]*\r?\n/gm, "").replace(/@font-face\s*\{[^}]*\}/g, "");
    if (!placed) {
      body = `\n${rules}${body.startsWith("\n") ? "" : "\n"}${body}`;
      placed = true;
    }
    return open + body + close;
  });
  return placed ? out : out.replace(/<\/head>/i, `<style>\n${rules}\n</style>\n</head>`);
}

const GENERATED = new Set(["vendor", "snapshots", "renders", ".hyperframes", "node_modules"]);

// Store entries a gallery run writes; a run uses them or removes them.
const STORE_ENTRY = /^gallery-/;

// The store entry of an episode's video in a theme: the render hash (which
// covers the theme through the vendor bundle) and the narration's files,
// which the render hash covers only through their cache keys.
function videoKey(r, id, theme) {
  const h = createHash("sha256");
  h.update(renderHash(r));
  const voice = path.join(r.dir, "assets", "voice");
  for (const rel of episodeFiles(voice)) {
    h.update(`\0${rel}\0`);
    h.update(readFileSync(path.join(voice, rel)));
  }
  return `gallery-${theme}-${id}-${h.digest("hex").slice(0, 16)}`;
}

// The published video of the episode in `dir` into outDir, from the store
// when it has the entry; returns the manifest and the store key.
async function themedVideo(r, id, theme, outDir, store) {
  let from;
  let key = null;
  if (store) {
    key = videoKey(r, id, theme);
    from = path.join(store, key);
    // An entry without its manifest is a leftover of an interrupted run.
    if (!existsSync(path.join(from, `${id}.json`))) {
      const tmp = `${from}.tmp`;
      rmSync(tmp, { recursive: true, force: true });
      await publishEpisode(r.dir, id, { static: tmp, data: tmp });
      rmSync(from, { recursive: true, force: true });
      renameSync(tmp, from);
    } else {
      console.log(`video: ${id} in ${theme}: from the store`);
    }
  } else {
    from = path.join(r.dir, "publish");
    await publishEpisode(r.dir, id, { static: from, data: from });
  }
  mkdirSync(outDir, { recursive: true });
  for (const ext of MEDIA) cpSync(path.join(from, `${id}.${ext}`), path.join(outDir, `${id}.${ext}`));
  return { manifest: readJson(path.join(from, `${id}.json`)), key };
}

// Stills of a demo episode in a theme into outDir, and with opts.videos its
// video; returns { sheets, format, video } with video { manifest, key }, or
// { error } when only the video failed.
async function themedEpisode(browser, demo, id, theme, outDir, opts) {
  const tmp = mkdtempSync(path.join(tmpdir(), "avatars-gallery-"));
  try {
    const src = path.join(demo.episodesDir, id);
    const dir = path.join(tmp, id);
    cpSync(src, dir, { recursive: true, filter: (p) => !GENERATED.has(path.basename(p)) });
    // The gallery's theme applies; an episode's own theme would win over it.
    const epFile = path.join(dir, "episode.json");
    if (existsSync(epFile)) {
      const ep = readJson(epFile);
      delete ep.theme;
      writeFileSync(epFile, JSON.stringify(ep, null, 2) + "\n");
    }
    if (!existsSync(path.join(dir, "assets/voice/lines.js"))) writeFixtureVoice(path.join(dir, "script.json"), path.join(dir, "assets/voice"));
    const r = resolveEpisode(Object.assign({}, demo, { config: Object.assign({}, demo.config, { theme }), episodesDir: tmp }), id);
    writeVendor(dir, bundleFiles(r));
    const page = path.join(dir, "index.html");
    writeFileSync(page, withFonts(readFileSync(page, "utf8"), r.fonts));
    const { page: tab, log } = await openEpisode(browser, dir, { width: r.format.width, height: r.format.height });
    const ep = await tab.evaluate(() => window.__episode || null);
    await tab.close();
    if (!ep) throw new Error(`no window.__episode${log.errors.length ? `: ${log.errors.join("; ")}` : ""}`);
    const sheets = snapshot(dir, stillTimes(ep), path.join(dir, "snapshots"));
    mkdirSync(outDir, { recursive: true });
    for (const f of sheets) cpSync(path.join(dir, "snapshots", f), path.join(outDir, f));
    const out = { sheets, format: r.format, video: null };
    if (opts.videos) {
      try {
        out.video = await themedVideo(r, id, theme, outDir, opts.store);
      } catch (e) {
        out.video = { error: e.message };
      }
    }
    return out;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Remove the store entries a gallery run writes that this run did not use.
export function pruneStore(store, used) {
  for (const name of readdirSync(store)) {
    if (!STORE_ENTRY.test(name) || used.has(name)) continue;
    rmSync(path.join(store, name), { recursive: true, force: true });
    console.log(`store: removed ${name}`);
  }
}

// What a gallery run writes under DIR, which the next run clears: anything
// else there is someone's work (`--out` at a project root would otherwise
// clear its episodes/, at this package's root its avatars/).
const OWN_DIR = /^episodes\/[^/]+(\/[^/]+)?$/;
const OWN_FILE = new RegExp(`^(avatars/[^/]+-(${SHEETS.join("|")})\\.png|episodes/[^/]+/[^/]+/(contact-sheet[^/]*|[^/]+\\.(${MEDIA.join("|")})))$`);

// The first entry under outDir/rel that no gallery run writes, or null.
function strayEntry(outDir, rel) {
  for (const e of readdirSync(path.join(outDir, rel), { withFileTypes: true })) {
    const p = `${rel}/${e.name}`;
    if (e.isDirectory() && OWN_DIR.test(p)) {
      const inner = strayEntry(outDir, p);
      if (inner) return inner;
    } else if (!e.isFile() || !OWN_FILE.test(p)) {
      return p;
    }
  }
  return null;
}

// Clear DIR/avatars and DIR/episodes of an earlier run; refuse to clear
// either when it holds anything a run does not write.
export function clearOutput(outDir) {
  const dirs = ["avatars", "episodes"].filter((d) => existsSync(path.join(outDir, d)));
  for (const d of dirs) {
    const dir = path.join(outDir, d);
    const stray = lstatSync(dir).isDirectory() ? strayEntry(outDir, d) : d;
    if (stray) throw new Error(`${dir} holds files avatars gallery did not write (${stray}); choose an empty or gallery output directory`);
  }
  for (const d of dirs) rmSync(path.join(outDir, d), { recursive: true, force: true });
}

function fillPage(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

export async function buildGallery(project, out, opts = {}) {
  const outDir = path.resolve(out);
  if (!existsSync(INDEX_PAGE)) throw new Error(`${INDEX_PAGE} is missing`);
  mkdirSync(outDir, { recursive: true });
  clearOutput(outDir);
  const theme = opts.theme || (project && project.config.theme) || "midnight";
  const failures = [];
  const notes = [];
  const cards = [];
  const browser = await launch();
  try {
    // Avatar sheets.
    for (const al of avatarLooks(project)) {
      const files = {};
      let sheet = null;
      try {
        sheet = buildSheet(project, { avatar: al.avatar, look: al.look, theme });
        for (const mode of SHEETS) {
          const f = `avatars/${al.avatar}-${al.look}-${mode}.png`;
          await shootSheet(browser, sheet.dir, mode, path.join(outDir, f));
          files[mode] = f;
        }
        console.log(`sheet: ${al.avatar}/${al.look}`);
      } catch (e) {
        failures.push(`${al.avatar}/${al.look}: ${e.message}`);
      } finally {
        if (sheet) sheet.remove();
      }
      const imgs = SHEETS.filter((m) => files[m])
        .map((m) => `<a href="${esc(files[m])}"><img src="${esc(files[m])}" alt="${esc(`${al.name}, ${al.title}: ${MODE_TITLE[m]}`)}" loading="lazy" /></a>`)
        .join("\n      ");
      cards.push(
        `<article class="card">\n      <h3>${esc(al.name)} <span>${esc(al.title)}</span></h3>\n      <p class="ids">${esc(`${al.avatar} / ${al.look}`)} · ${al.from}</p>\n      ${imgs || '<p class="empty">no sheet, see the notes below</p>'}\n    </article>`
      );
    }

    // Demo episodes in every theme.
    const sections = [];
    let stills = 0;
    let videos = 0;
    if (existsSync(path.join(DEMO, "avatars.json"))) {
      const demo = loadProject(DEMO);
      const ids = episodeIds(demo).filter((id) => existsSync(path.join(demo.episodesDir, id, "index.html")));
      if (!ids.length) notes.push("examples/demo has no episodes");
      const store = opts.videos && opts.store ? path.resolve(opts.store) : null;
      if (store) mkdirSync(store, { recursive: true });
      const unvoiced = opts.videos ? ids.filter((id) => narrationProblem(path.join(demo.episodesDir, id), id)) : [];
      if (unvoiced.length) notes.push(`no videos of ${unvoiced.join(", ")}: the narration is not voiced (run: avatars voice --all --project examples/demo)`);
      const used = new Set();
      let complete = !unvoiced.length;
      for (const t of ids.length ? themeIds(demo) : []) {
        const blocks = [];
        for (const id of ids) {
          const rel = `episodes/${t}/${id}`;
          const figures = [];
          try {
            const got = await themedEpisode(browser, demo, id, t, path.join(outDir, rel), { videos: opts.videos && !unvoiced.includes(id), store });
            stills += got.sheets.length;
            console.log(`stills: ${id} in ${t}`);
            const v = got.video;
            if (v && v.error) {
              complete = false;
              notes.push(`video of ${id} in theme ${t}: ${v.error}`);
            } else if (v) {
              videos++;
              if (v.key) used.add(v.key);
              const f = `${rel}/${id}`;
              figures.push(
                `<figure class="video"><video controls preload="none" poster="${esc(f)}.jpg" width="${got.format.width}" height="${got.format.height}"><source src="${esc(f)}.webm" type="${esc(VIDEO_TYPE)}" /><track kind="captions" label="Captions" src="${esc(f)}.vtt" default /></video><p class="unsupported" hidden>This browser cannot play AV1 video, which Chrome, Edge and Firefox can. <a href="${esc(f)}.webm" download>Download the video</a> to watch it in another player.</p><figcaption>${esc(id)} · ${esc(v.manifest.length)}</figcaption></figure>`
              );
            }
            for (const f of got.sheets) figures.push(`<figure><a href="${esc(`${rel}/${f}`)}"><img src="${esc(`${rel}/${f}`)}" alt="${esc(`${id} in ${t}`)}" loading="lazy" /></a><figcaption>${esc(id)}</figcaption></figure>`);
          } catch (e) {
            complete = false;
            notes.push(`stills of ${id} in theme ${t}: ${e.message}`);
          }
          if (figures.length) blocks.push(`<div class="episode">\n      ${figures.join("\n      ")}\n    </div>`);
        }
        const title = (() => {
          const hit = locate(demo, `themes/${t}/theme.json`);
          return (hit && readJson(hit.path).title) || t;
        })();
        sections.push(`<section class="theme">\n    <h3>${esc(title)} <span>${esc(t)}</span></h3>\n    ${blocks.join("\n    ") || '<p class="empty">no stills</p>'}\n  </section>`);
      }
      // A run that left out a video does not know which entries are stale.
      if (store && complete) pruneStore(store, used);
    } else {
      notes.push("no demo project (examples/demo), so no episode stills");
    }

    const all = [...failures, ...notes];
    const page = fillPage(readFileSync(INDEX_PAGE, "utf8"), {
      title: "Avatar and scene gallery",
      summary: esc(
        `${cards.length} avatar ${cards.length === 1 ? "look" : "looks"} in theme ${theme}; demo episodes in ${sections.length} ${sections.length === 1 ? "theme" : "themes"}` +
          (opts.videos ? `, ${videos} ${videos === 1 ? "video" : "videos"}.` : ".")
      ),
      avatars: cards.join("\n    ") || '<p class="empty">no avatars</p>',
      episodes: sections.join("\n  ") || '<p class="empty">no demo episodes</p>',
      notes: all.length ? `<ul>\n    ${all.map((n) => `<li>${esc(n)}</li>`).join("\n    ")}\n  </ul>` : "",
    });
    writeFileSync(path.join(outDir, "index.html"), page);
    for (const n of notes) console.log(`note: ${n}`);
    for (const f of failures) console.error(`error: ${f}`);
    console.log(`gallery: ${cards.length - failures.length} of ${cards.length} avatar looks, ${stills} contact sheets${opts.videos ? `, ${videos} videos` : ""}: ${path.join(outDir, "index.html")}`);
    return { failures, notes };
  } finally {
    await browser.close();
  }
}
