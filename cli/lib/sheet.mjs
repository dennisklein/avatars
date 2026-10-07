// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Avatar sheets: one avatar in one look in every mood, mouth shape or gaze
// direction. gallery/sheet.html draws them from a temporary directory next
// to a vendor bundle built for a cast of just that avatar, in a theme; the
// brand marks are the project's if there is a project, else there are none.
//
//   const sheet = buildSheet(project, { avatar: "sindy", look: "hoodie", theme: "midnight" });
//   await shootSheet(browser, sheet.dir, "expr", "sindy-expr.png");
//   sheet.remove();
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { launch, openEpisode } from "./browser.mjs";
import { bundleFiles, writeVendor } from "./bundle.mjs";
import { PKG, resolveEpisode } from "./project.mjs";
import { fill } from "./templates.mjs";

export const SHEET_PAGE = path.join(PKG, "gallery", "sheet.html");
export const SHEET_MODES = ["expr", "visemes", "gaze", "big"];
// Wide enough for four cells of 300 px or two of 600 px.
const VIEWPORT = { width: 1300, height: 900 };

// The configuration of a project without one: this package alone.
function bareProject(root) {
  return {
    root,
    file: null,
    lib: path.join(root, "library"),
    pkg: PKG,
    config: {
      format: "landscape-1080p",
      brand: null,
      lexicons: [],
      icons: ["core"],
      scenes: [],
      library: "library",
      tokens: {},
      grounding: null,
      checks: [],
    },
  };
}

// A stand-in project whose only episode is an empty directory under `tmp`,
// so resolveEpisode builds the bundle with the project's library, brand,
// tokens and lexicons, the given cast of one and the theme.
export function standInProject(project, tmp, { avatar, look, theme, format }) {
  const base = project || bareProject(tmp);
  const host = look ? { avatar, look } : { avatar };
  const config = Object.assign({}, base.config, {
    cast: { host },
    theme: theme || base.config.theme || "midnight",
    format: format || base.config.format || "landscape-1080p",
    scenes: [],
  });
  return Object.assign({}, base, { config, episodesDir: tmp, rendersDir: tmp });
}

// Write the sheet page and its vendor/ into a temporary directory.
export function buildSheet(project, opts) {
  const tmp = mkdtempSync(path.join(tmpdir(), "avatars-sheet-"));
  try {
    const dir = path.join(tmp, "sheet");
    mkdirSync(dir);
    const r = resolveEpisode(standInProject(project, tmp, opts), "sheet");
    writeVendor(dir, bundleFiles(r));
    const host = r.cast.host;
    const page = fill(readFileSync(SHEET_PAGE, "utf8"), { id: host.avatar, title: `${host.name} (${host.look})`, fonts: r.fonts });
    writeFileSync(path.join(dir, "index.html"), page);
    return { dir, r, remove: () => rmSync(tmp, { recursive: true, force: true }) };
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    // Without a project there is no library to name.
    if (!project) e.message = e.message.split(` is in neither ${path.join(tmp, "library")} nor `).join(" is not in ");
    throw e;
  }
}

// Screenshot a built sheet in one mode to a PNG file.
export async function shootSheet(browser, dir, mode, out) {
  if (!SHEET_MODES.includes(mode)) throw new Error(`sheet mode "${mode}" is not one of ${SHEET_MODES.join(", ")}`);
  const { page, log } = await openEpisode(browser, dir, Object.assign({ query: `mode=${mode}` }, VIEWPORT));
  try {
    const state = await page.evaluate(() => window.__sheet || null);
    if (log.errors.length || !state) throw new Error(`sheet ${mode}: ${log.errors.join("; ") || "the page did not finish drawing"}`);
    for (const f of log.missing) throw new Error(`sheet ${mode}: missing file ${f}`);
    mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    await page.screenshot({ path: out, fullPage: true });
    return state;
  } finally {
    await page.close();
  }
}

// One sheet as a PNG: `avatars sheet`.
export async function renderSheet(project, { avatar, look, theme, mode = "expr", out }) {
  const sheet = buildSheet(project, { avatar, look, theme });
  try {
    const browser = await launch();
    try {
      return await shootSheet(browser, sheet.dir, mode, out);
    } finally {
      await browser.close();
    }
  } finally {
    sheet.remove();
  }
}
