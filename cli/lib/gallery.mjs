// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// `avatars gallery --out DIR`: the catalogue of the library. For every avatar
// and look of this package and of the project's library it writes avatar
// sheets (moods and mouth shapes); if the package has a demo project
// (examples/demo), it adds two stills per chapter of each demo episode in
// every theme. gallery/index.html is the page it fills.
//
//   DIR/index.html
//   DIR/avatars/<avatar>-<look>-expr.png, -visemes.png
//   DIR/episodes/<theme>/<episode>/contact-sheet-*.jpg
//
// Avatar sheets must succeed; demo stills are best effort and reported.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { launch, openEpisode } from "./browser.mjs";
import { bundleFiles, writeVendor } from "./bundle.mjs";
import { writeFixtureVoice } from "./fixture-voice.mjs";
import { PKG, episodeIds, fontFaceCss, loadProject, locate, readJson, resolveEpisode } from "./project.mjs";
import { buildSheet, shootSheet } from "./sheet.mjs";
import { snapshot, stillTimes } from "./stills.mjs";

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

// Stills of a demo episode in a theme, into outDir; returns the file names.
async function themedStills(browser, demo, id, theme, outDir) {
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
    return sheets;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function fillPage(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

export async function buildGallery(project, out, opts = {}) {
  const outDir = path.resolve(out);
  if (!existsSync(INDEX_PAGE)) throw new Error(`${INDEX_PAGE} is missing`);
  mkdirSync(outDir, { recursive: true });
  for (const d of ["avatars", "episodes"]) rmSync(path.join(outDir, d), { recursive: true, force: true });
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
    if (existsSync(path.join(DEMO, "avatars.json"))) {
      const demo = loadProject(DEMO);
      const ids = episodeIds(demo).filter((id) => existsSync(path.join(demo.episodesDir, id, "index.html")));
      if (!ids.length) notes.push("examples/demo has no episodes");
      for (const t of ids.length ? themeIds(demo) : []) {
        const figures = [];
        for (const id of ids) {
          const rel = `episodes/${t}/${id}`;
          try {
            const sheets = await themedStills(browser, demo, id, t, path.join(outDir, rel));
            stills += sheets.length;
            for (const f of sheets) figures.push(`<figure><a href="${esc(`${rel}/${f}`)}"><img src="${esc(`${rel}/${f}`)}" alt="${esc(`${id} in ${t}`)}" loading="lazy" /></a><figcaption>${esc(id)}</figcaption></figure>`);
            console.log(`stills: ${id} in ${t}`);
          } catch (e) {
            notes.push(`stills of ${id} in theme ${t}: ${e.message}`);
          }
        }
        const title = (() => {
          const hit = locate(demo, `themes/${t}/theme.json`);
          return (hit && readJson(hit.path).title) || t;
        })();
        sections.push(`<section class="theme">\n    <h3>${esc(title)} <span>${esc(t)}</span></h3>\n    ${figures.join("\n    ") || '<p class="empty">no stills</p>'}\n  </section>`);
      }
    } else {
      notes.push("no demo project (examples/demo), so no episode stills");
    }

    const all = [...failures, ...notes];
    const page = fillPage(readFileSync(INDEX_PAGE, "utf8"), {
      title: "Avatar and scene gallery",
      summary: esc(`${cards.length} avatar ${cards.length === 1 ? "look" : "looks"} in theme ${theme}; demo episodes in ${sections.length} ${sections.length === 1 ? "theme" : "themes"}.`),
      avatars: cards.join("\n    ") || '<p class="empty">no avatars</p>',
      episodes: sections.join("\n  ") || '<p class="empty">no demo episodes</p>',
      notes: all.length ? `<ul>\n    ${all.map((n) => `<li>${esc(n)}</li>`).join("\n    ")}\n  </ul>` : "",
    });
    writeFileSync(path.join(outDir, "index.html"), page);
    for (const n of notes) console.log(`note: ${n}`);
    for (const f of failures) console.error(`error: ${f}`);
    console.log(`gallery: ${cards.length - failures.length} of ${cards.length} avatar looks, ${stills} contact sheets: ${path.join(outDir, "index.html")}`);
    return { failures, notes };
  } finally {
    await browser.close();
  }
}
