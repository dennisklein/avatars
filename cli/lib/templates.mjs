// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// `avatars new`: copy a template of this package (templates/project,
// templates/episode) and fill in its placeholders in every text file:
//
//   {{id}}          the project directory's name, or the episode id
//   {{title}}       --title, else the id in words ("first-steps" -> "First steps")
//   {{font-faces}}  the theme's @font-face rules; on a line of its own, every
//                   rule gets that line's indent
//
// npm leaves .gitignore files out of packages, so a template keeps its
// .gitignore as "gitignore" and the copy renames it.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PKG, fontFaceCss, locate, readJson } from "./project.mjs";

export const TEMPLATES = path.join(PKG, "templates");
const ID = /^[a-z0-9][a-z0-9._-]*$/;
// What a placeholder must not hold: it goes unescaped into JSON strings, HTML
// and the page's inline script.
const UNSAFE = /["\\<>\u0000-\u001f\u007f]/;
export const UNSAFE_CHARS = '" \\ < > or control characters';
export const isSafeText = (s) => !UNSAFE.test(s);

export const titleOf = (id) => {
  const words = id.replace(/[-_.]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function template(name) {
  const dir = path.join(TEMPLATES, name);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`this package has no ${name} template (${dir} is missing); reinstall the package or use a release that ships templates/`);
  }
  return dir;
}

export function fill(text, vars) {
  return text
    .replace(/^([ \t]*)\{\{font-faces\}\}[ \t]*$/gm, (_, indent) => fontFaceCss(vars.fonts, indent))
    .replace(/\{\{font-faces\}\}/g, () => fontFaceCss(vars.fonts, ""))
    .replace(/\{\{id\}\}/g, () => vars.id)
    .replace(/\{\{title\}\}/g, () => vars.title);
}

// Copy src into dst, filling placeholders in text files (no NUL bytes).
function copyFilled(src, dst, vars) {
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, e.name);
    const to = path.join(dst, e.name === "gitignore" ? ".gitignore" : e.name);
    if (e.isDirectory()) {
      copyFilled(from, to, vars);
      continue;
    }
    const buf = readFileSync(from);
    if (buf.includes(0)) cpSync(from, to);
    else writeFileSync(to, fill(buf.toString("utf8"), vars));
  }
}

const fontsOf = (theme) => (theme.fonts || []).map((f) => ({ family: f.family, weight: String(f.weight), file: f.file }));

function isEmptyDir(dir) {
  return !existsSync(dir) || (statSync(dir).isDirectory() && readdirSync(dir).length === 0);
}

// A new project in `dir` (absent or empty). Returns the project root.
export function newProject(dir, opts = {}) {
  const src = template("project");
  const root = path.resolve(dir);
  if (!isEmptyDir(root)) throw new Error(`${root} exists and is not empty`);
  const id = path.basename(root);
  if (!isSafeText(id)) throw new Error(`the project directory's name "${id}" becomes its id and must not contain ${UNSAFE_CHARS}`);
  // The template names its theme; its fonts come from this package.
  const cfgFile = path.join(src, "avatars.json");
  const theme = (existsSync(cfgFile) && readJson(cfgFile).theme) || "midnight";
  const themeFile = path.join(PKG, "themes", theme, "theme.json");
  if (!existsSync(themeFile)) throw new Error(`the project template uses theme "${theme}", which this package lacks`);
  copyFilled(src, root, { id, title: opts.title || titleOf(id), fonts: fontsOf(readJson(themeFile)) });
  return root;
}

// A new episode `id` in a loaded project. Returns its directory.
export function newEpisode(project, id, opts = {}) {
  if (!ID.test(id)) throw new Error(`episode id "${id}" must be lowercase letters, digits, dots, dashes and underscores`);
  const src = template("episode");
  const dir = path.join(project.episodesDir, id);
  if (existsSync(dir)) throw new Error(`${dir} already exists`);
  const theme = project.config.theme;
  const hit = locate(project, `themes/${theme}/theme.json`);
  if (!hit) throw new Error(`theme "${theme}" is in neither ${project.lib} nor the package`);
  copyFilled(src, dir, { id, title: opts.title || titleOf(id), fonts: fontsOf(readJson(hit.path)) });
  return dir;
}
