// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Schema validation of manifests (core/schemas/, JSON Schema 2020-12) with
// one readable line per problem, plus what a schema cannot say: ids that
// match their file locations, files a manifest names that do not exist, a
// default voice preset that is not a preset, line ids used twice.
//
//   const items = [...packageManifests(), ...projectManifests(project)];
//   for (const { file, message } of validateItems(items)) console.error(`${file}: ${message}`);
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import Ajv2020Module from "ajv/dist/2020.js";
import { PKG } from "./project.mjs";

const Ajv2020 = Ajv2020Module.default || Ajv2020Module;
const BASE = "https://github.com/dennisklein/avatars/core/schemas/";
export const SCHEMA_DIR = path.join(PKG, "core", "schemas");
export const KINDS = ["project", "episode", "brand", "avatar", "look", "part", "base", "theme", "format", "voice", "lexicon", "script", "tokens"];
const pkgRequire = createRequire(path.join(PKG, "package.json"));

let ajv = null;
function validator(kind) {
  if (!ajv) {
    ajv = new Ajv2020({ allErrors: true, verbose: true, strictTypes: false, strictTuples: false, allowUnionTypes: true });
    for (const f of readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".schema.json")).sort()) {
      ajv.addSchema(JSON.parse(readFileSync(path.join(SCHEMA_DIR, f), "utf8")));
    }
  }
  const v = ajv.getSchema(`${BASE}${kind}.schema.json`);
  if (!v) throw new Error(`no schema core/schemas/${kind}.schema.json`);
  return v;
}

// A JSON pointer as a readable path: /lines/3/id -> lines[3].id.
function where(pointer) {
  if (!pointer) return "top level";
  return pointer
    .slice(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))
    .map((s, i) => (/^\d+$/.test(s) ? `[${s}]` : /^[A-Za-z_][\w-]*$/.test(s) ? (i ? `.${s}` : s) : `["${s}"]`))
    .join("");
}

const shown = (v) => (typeof v === "string" ? `"${v.length > 60 ? `${v.slice(0, 59)}…` : v}"` : JSON.stringify(v));
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1).replace(/\.$/, "");

function describe(e, keyWhy) {
  const at = where(e.instancePath);
  const p = e.params || {};
  switch (e.keyword) {
    case "required":
      return `${at}: missing "${p.missingProperty}"`;
    case "additionalProperties":
      return `${at}: unknown key "${p.additionalProperty}"`;
    case "propertyNames": {
      const why = keyWhy.get(`${e.instancePath} ${p.propertyName}`);
      return `${at}: key "${p.propertyName}" is not ${why ? lowerFirst(why) : "allowed here"}`;
    }
    case "enum":
      return `${at} is ${shown(e.data)}; expected one of ${p.allowedValues.map((v) => JSON.stringify(v)).join(", ")}`;
    case "type":
      return `${at} is ${shown(e.data)}; expected ${String(p.type).split(",").join(" or ")}`;
    case "pattern": {
      const what = e.parentSchema && e.parentSchema.description;
      return `${at} is ${shown(e.data)}; expected ${what ? lowerFirst(what) : `a match of ${p.pattern}`}`;
    }
    default:
      return `${at} ${e.message}`;
  }
}

// Messages for data against the schema of `kind`.
export function validateData(kind, data) {
  const v = validator(kind);
  if (v(data)) return [];
  const out = [];
  // Errors inside a propertyNames subschema explain the propertyNames error
  // that follows them; "if" errors repeat the then/else errors they wrap.
  const keyWhy = new Map();
  for (const e of v.errors) {
    if (e.propertyName != null && e.parentSchema && e.parentSchema.description) keyWhy.set(`${e.instancePath} ${e.propertyName}`, e.parentSchema.description);
  }
  for (const e of v.errors) {
    if (e.propertyName != null || e.keyword === "if") continue;
    const m = describe(e, keyWhy);
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

// --------------------------------------------------------- semantics --
const fileOf = (item, rel) => path.resolve(path.dirname(item.file), rel);

function semantics(item, data) {
  const out = [];
  const isObj = data && typeof data === "object" && !Array.isArray(data);
  if (!isObj) return out;
  if (item.id != null && data.id != null && data.id !== item.id) out.push(`id is "${data.id}", but its location makes it "${item.id}"`);
  if (item.category != null && data.category != null && data.category !== item.category) {
    out.push(`category is "${data.category}", but it lives under parts/${item.category}/`);
  }
  switch (item.kind) {
    case "avatar":
      for (const k of ["voice", "lexicon"]) if (typeof data[k] === "string" && !existsSync(fileOf(item, data[k]))) out.push(`${k} file ${data[k]} does not exist`);
      if (typeof data.look === "string" && !existsSync(fileOf(item, `looks/${data.look}.json`))) out.push(`the default look "${data.look}" has no looks/${data.look}.json`);
      break;
    case "voice":
      if (data.default != null && data.presets && typeof data.presets === "object" && !(data.default in data.presets)) {
        out.push(`the default preset "${data.default}" is not one of the presets (${Object.keys(data.presets).join(", ")})`);
      }
      break;
    case "script": {
      const seen = new Set();
      for (const l of Array.isArray(data.lines) ? data.lines : []) {
        if (!l || typeof l.id !== "string") continue;
        if (seen.has(l.id)) out.push(`line id "${l.id}" appears twice`);
        seen.add(l.id);
      }
      break;
    }
    case "theme":
      for (const f of Array.isArray(data.fonts) ? data.fonts : []) {
        if (!f || typeof f.src !== "string") continue;
        try {
          pkgRequire.resolve(f.src);
        } catch {
          out.push(`font src "${f.src}" does not resolve from the package; is its npm package installed?`);
        }
      }
      break;
    case "brand":
      for (const [name, rel] of Object.entries(data.marks || {})) {
        if (typeof rel === "string" && !existsSync(fileOf(item, rel))) out.push(`mark ${name}: ${rel} does not exist`);
      }
      break;
    case "project": {
      if (item.template) break;
      const root = path.dirname(item.file);
      if (typeof data.brand === "string" && !existsSync(path.resolve(root, data.brand))) out.push(`brand file ${data.brand} does not exist`);
      for (const c of Array.isArray(data.checks) ? data.checks : []) if (typeof c === "string" && !existsSync(path.resolve(root, c))) out.push(`check module ${c} does not exist`);
      for (const l of Array.isArray(data.lexicons) ? data.lexicons : []) {
        if (typeof l === "string" && /^(\.{1,2}\/|\/)/.test(l) && !existsSync(path.resolve(root, l))) out.push(`lexicon file ${l} does not exist`);
      }
      break;
    }
  }
  return out;
}

// [{ file, message }] for every item ({ kind, file, id?, category?, template? }).
export function validateItems(items) {
  const problems = [];
  for (const item of items) {
    let data;
    try {
      data = JSON.parse(readFileSync(item.file, "utf8"));
    } catch (e) {
      problems.push({ file: item.file, message: e.code === "ENOENT" ? "does not exist" : `not JSON: ${e.message}` });
      continue;
    }
    for (const message of [...validateData(item.kind, data), ...semantics(item, data)]) problems.push({ file: item.file, message });
  }
  return problems;
}

// ------------------------------------------------------- collections --
const dirsIn = (d) =>
  existsSync(d)
    ? readdirSync(d, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : [];
const filesIn = (d, re) =>
  existsSync(d)
    ? readdirSync(d, { withFileTypes: true })
        .filter((e) => e.isFile() && re.test(e.name))
        .map((e) => e.name)
        .sort()
    : [];

function readOr(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// The manifests of a library tree: this package or a project's library/.
export function libraryManifests(base) {
  const items = [];
  const add = (kind, rel, extra) => {
    const file = path.join(base, rel);
    if (existsSync(file)) items.push(Object.assign({ kind, file }, extra));
  };
  for (const a of dirsIn(path.join(base, "avatars"))) {
    const dir = `avatars/${a}`;
    add("avatar", `${dir}/avatar.json`, { id: a });
    const avatar = readOr(path.join(base, dir, "avatar.json"), {});
    add("voice", `${dir}/${typeof avatar.voice === "string" ? avatar.voice : "voice.json"}`);
    add("lexicon", `${dir}/${typeof avatar.lexicon === "string" ? avatar.lexicon : "lexicon.json"}`);
    for (const f of filesIn(path.join(base, dir, "looks"), /\.json$/)) add("look", `${dir}/looks/${f}`, { id: f.replace(/\.json$/, "") });
    for (const p of dirsIn(path.join(base, dir, "parts"))) add("part", `${dir}/parts/${p}/part.json`, { id: `${a}/${p}` });
  }
  for (const c of dirsIn(path.join(base, "parts"))) {
    for (const n of dirsIn(path.join(base, "parts", c))) add("part", `parts/${c}/${n}/part.json`, { id: `${c}/${n}`, category: c });
  }
  for (const rig of dirsIn(path.join(base, "rigs"))) {
    for (const b of dirsIn(path.join(base, "rigs", rig, "bases"))) add("base", `rigs/${rig}/bases/${b}/base.json`, { id: b });
  }
  for (const t of dirsIn(path.join(base, "themes"))) {
    add("theme", `themes/${t}/theme.json`, { id: t });
    add("tokens", `themes/${t}/theme.tokens.json`);
  }
  for (const f of dirsIn(path.join(base, "formats"))) {
    add("format", `formats/${f}/format.json`, { id: f });
    add("tokens", `formats/${f}/format.tokens.json`);
  }
  for (const lang of dirsIn(path.join(base, "lexicons"))) {
    for (const f of filesIn(path.join(base, "lexicons", lang), /\.json$/)) add("lexicon", `lexicons/${lang}/${f}`);
  }
  for (const s of dirsIn(path.join(base, "scenes"))) add("tokens", `scenes/${s}/tokens.json`);
  return items;
}

// A project's own manifests and its library's.
export function projectManifests(project) {
  const cfg = project.config;
  const items = [{ kind: "project", file: project.file }];
  if (typeof cfg.brand === "string") items.push({ kind: "brand", file: path.resolve(project.root, cfg.brand) });
  for (const l of cfg.lexicons || []) {
    if (typeof l === "string" && /^(\.{1,2}\/|\/)/.test(l)) items.push({ kind: "lexicon", file: path.resolve(project.root, l) });
  }
  for (const id of dirsIn(project.episodesDir)) {
    for (const [kind, f] of [["episode", "episode.json"], ["script", "script.json"]]) {
      const file = path.join(project.episodesDir, id, f);
      if (existsSync(file)) items.push({ kind, file });
    }
  }
  // Missing brand and lexicon files are reported by the project's own checks.
  return [...items.filter((i) => existsSync(i.file)), ...libraryManifests(project.lib)];
}

// This package: its library, its token files and its templates.
export function packageManifests() {
  const items = libraryManifests(PKG);
  for (const f of filesIn(path.join(PKG, "tokens"), /\.tokens\.json$/)) items.push({ kind: "tokens", file: path.join(PKG, "tokens", f) });
  if (existsSync(path.join(PKG, "core", "tokens.json"))) items.push({ kind: "tokens", file: path.join(PKG, "core", "tokens.json") });
  // Templates hold placeholders inside strings, so they are still JSON.
  const KIND_OF = { "avatars.json": "project", "brand.json": "brand", "episode.json": "episode", "script.json": "script", "lexicon.json": "lexicon" };
  const walk = (dir) => {
    for (const e of existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (KIND_OF[e.name]) items.push({ kind: KIND_OF[e.name], file: p, template: true });
    }
  };
  walk(path.join(PKG, "templates"));
  return items;
}

// Items without duplicates (the same file reached twice).
export function uniqueItems(items) {
  const seen = new Set();
  return items.filter((i) => !seen.has(i.file) && seen.add(i.file));
}
