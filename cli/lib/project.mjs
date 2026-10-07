// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Projects and episodes: read avatars.json, look up library ids (project
// library first, then this package) and resolve everything one episode needs:
// tokens, format, brand, icons, cast (avatars, looks, parts, palettes), scenes
// and the ordered runtime files of its bundle.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, parseColor, resolveRef } from "./tokens.mjs";

export const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

export const IDENTITY = ["body", "face", "eyes", "brows", "mouth", "nose"];
export const WARDROBE = ["hair", "tops", "eyewear", "headwear", "accessories"];
export const CATEGORIES = [...IDENTITY, ...WARDROBE];
// Categories a cast member may wear more than one part of.
const MULTI = new Set(["hair", "accessories"]);
export const BUILTIN_SCENES = ["intro", "talk", "slide", "diagram", "code", "terminal", "outro"];
const CORE_HEAD = ["core/determinism.js", "core/tokens.js", "core/planner.js", "core/clock.js", "core/captions.js", "core/transitions.js", "core/stage.js", "core/performer.js"];
const CORE_TAIL = ["core/presenter.js", "core/episode.js"];

const DEFAULTS = {
  cast: { host: { avatar: "sindy" } },
  theme: "midnight",
  format: "landscape-1080p",
  brand: null,
  lexicons: ["en-us/core"],
  icons: ["core", "tech"],
  scenes: [],
  episodes: "episodes",
  renders: "renders",
  library: "library",
  tokens: {},
  grounding: null,
  checks: [],
  publish: { static: "publish", data: "publish" },
};

export function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file}: ${e.message}`);
  }
}

export function findProjectRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, "avatars.json"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function loadProject(dir) {
  const root = dir ? path.resolve(dir) : findProjectRoot(process.cwd());
  if (!root || !existsSync(path.join(root, "avatars.json"))) {
    throw new Error(`no avatars.json in ${dir ? path.resolve(dir) : "the working directory or above"}; pass --project <dir>`);
  }
  const file = path.join(root, "avatars.json");
  const config = Object.assign({}, DEFAULTS, readJson(file));
  return {
    root,
    file,
    config,
    lib: path.join(root, config.library),
    pkg: PKG,
    episodesDir: path.join(root, config.episodes),
    rendersDir: path.join(root, config.renders),
  };
}

export function episodeIds(project) {
  const dir = project.episodesDir;
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (existsSync(path.join(dir, d.name, "index.html")) || existsSync(path.join(dir, d.name, "script.json"))))
    .map((d) => d.name)
    .sort();
}

// A library path in the project's library directory, else in this package.
// Labels identify files independently of where they are checked out.
export function locate(project, rel) {
  for (const [base, prefix] of [
    [project.lib, `project:${project.config.library}/`],
    [PKG, ""],
  ]) {
    const p = path.join(base, rel);
    if (existsSync(p)) return { path: p, label: prefix + rel.split(path.sep).join("/") };
  }
  return null;
}

function need(project, rel, what) {
  const hit = locate(project, rel);
  if (!hit) throw new Error(`${what}: ${rel} is in neither ${project.lib} nor ${PKG}`);
  return hit;
}

const optional = (project, rel) => locate(project, rel);

// `text` without any match of `re`. One pass can join the text around a
// match into another one ("<!-<!-- x -->-" leaves "<!--"), so it repeats
// until nothing matches.
function removeAll(text, re) {
  let prev;
  do {
    prev = text;
    text = text.replace(re, "");
  } while (text !== prev);
  return text;
}

// The viewBox and inner markup of an SVG file (marks, icons), without
// comments (an unterminated one runs to the end, as browsers read it) and
// titles.
export function parseSvg(text, what) {
  const m = /<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i.exec(text.trim());
  if (!m) throw new Error(`${what}: not an SVG document`);
  const vb = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(m[1]);
  if (!vb) throw new Error(`${what}: the <svg> element has no viewBox`);
  const viewBox = vb[1].trim().split(/[\s,]+/).map(Number);
  if (viewBox.length !== 4 || viewBox.some((n) => !Number.isFinite(n))) throw new Error(`${what}: bad viewBox "${vb[1]}"`);
  const body = removeAll(removeAll(m[2], /<!--[\s\S]*?(?:-->|$)/g), /<title\b[\s\S]*?<\/title>/gi)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("");
  return { viewBox, body };
}

function svgFiles(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".svg"))
    .sort();
}

// Cast entries: the project's, with the episode's merged in per role and
// key; palette merges per role name and options per part and option, so an
// episode can change one colour without restating the others.
function mergeCast(base, over) {
  const out = {};
  for (const [role, m] of Object.entries(base || {})) out[role] = Object.assign({}, m);
  for (const [role, m] of Object.entries(over || {})) {
    const prev = out[role] || {};
    const entry = Object.assign({}, prev, m);
    if (prev.palette || m.palette) entry.palette = Object.assign({}, prev.palette, m.palette);
    if (prev.options || m.options) {
      entry.options = Object.assign({}, prev.options);
      for (const [id, o] of Object.entries(m.options || {})) entry.options[id] = Object.assign({}, entry.options[id], o);
    }
    out[role] = entry;
  }
  if (!out.host) throw new Error("the cast has no host");
  return out;
}

function partDir(id, avatarId) {
  const [scope, name, ...rest] = id.split("/");
  if (!name || rest.length) throw new Error(`part id "${id}" is not <category>/<name> or <avatar>/<name>`);
  if (CATEGORIES.includes(scope)) return `parts/${scope}/${name}`;
  if (scope !== avatarId) throw new Error(`part "${id}" belongs to avatar "${scope}" and cannot be worn by "${avatarId}"`);
  return `avatars/${scope}/parts/${name}`;
}

function resolveMember(project, role, entry, tokens, acc) {
  if (!entry.avatar) throw new Error(`cast member "${role}" names no avatar`);
  const avatarHit = need(project, `avatars/${entry.avatar}/avatar.json`, `cast member "${role}"`);
  const avatar = readJson(avatarHit.path);
  const lookName = entry.look || avatar.look;
  if (!lookName) throw new Error(`avatar "${avatar.id}" has no default look and cast member "${role}" names none`);
  const look = readJson(need(project, `avatars/${entry.avatar}/looks/${lookName}.json`, `look "${lookName}" of ${avatar.id}`).path);
  const rig = avatar.rig || "svg";
  const baseHit = need(project, `rigs/${rig}/bases/${avatar.base}/base.json`, `base of ${avatar.id}`);
  const base = readJson(baseHit.path);
  acc.bases[base.id] = base;
  acc.rigs.add(rig);
  acc.baseFiles.set(base.id, need(project, `rigs/${rig}/bases/${avatar.base}/base.js`, `base ${base.id}`));

  const ids = [...(avatar.identity || []), ...(look.wear || [])];
  const seenCategory = new Map();
  const parts = [];
  const metas = [];
  for (const id of ids) {
    const rel = partDir(id, avatar.id);
    const meta = readJson(need(project, `${rel}/part.json`, `part ${id}`).path);
    if (meta.id !== id) throw new Error(`${rel}/part.json has id "${meta.id}", expected "${id}"`);
    if (!CATEGORIES.includes(meta.category)) throw new Error(`part ${id}: unknown category "${meta.category}"`);
    if (!(meta.fits || []).includes(base.id)) throw new Error(`part ${id} does not fit base ${base.id} (fits: ${(meta.fits || []).join(", ") || "none"})`);
    for (const s of meta.slots || []) if (!base.slots.includes(s)) throw new Error(`part ${id} draws into slot "${s}", which base ${base.id} lacks`);
    if (seenCategory.has(meta.category) && !MULTI.has(meta.category)) {
      throw new Error(`${avatar.id}/${look.id}: parts ${seenCategory.get(meta.category)} and ${id} are both ${meta.category}`);
    }
    seenCategory.set(meta.category, id);
    const defaults = {};
    for (const [k, spec] of Object.entries(meta.options || {})) if (spec && "default" in spec) defaults[k] = spec.default;
    parts.push({ id, options: Object.assign(defaults, (look.options || {})[id] || {}, ((entry.options || {})[id]) || {}) });
    metas.push(meta);
    acc.parts[id] = meta;
    if (!acc.partFiles.has(id)) acc.partFiles.set(id, need(project, `${rel}/part.js`, `part ${id}`));
  }

  // Palette, later wins: part defaults, colourways, avatar, look, cast entry.
  const raw = {};
  for (const meta of metas) Object.assign(raw, meta.defaults || {});
  for (const meta of metas) {
    const way = (look.colourways || {})[meta.id];
    if (way == null) continue;
    const set = (meta.colourways || {})[way];
    if (!set) throw new Error(`look ${avatar.id}/${look.id}: part ${meta.id} has no colourway "${way}"`);
    Object.assign(raw, set);
  }
  Object.assign(raw, avatar.palette || {}, look.palette || {}, entry.palette || {});
  const palette = {};
  for (const [roleName, v] of Object.entries(raw)) {
    const value = resolveRef(v, tokens, `palette role ${roleName} of ${avatar.id}/${look.id}`);
    if (!parseColor(value) && value !== "none") throw new Error(`palette role ${roleName} of ${avatar.id}/${look.id} is "${value}", not a colour`);
    palette[roleName] = value;
  }
  for (const meta of metas) {
    for (const r of meta.roles || []) if (!(r in palette)) throw new Error(`part ${meta.id} paints with role "${r}", which ${avatar.id}/${look.id} does not set`);
  }
  const hidden = [...new Set(metas.flatMap((m) => m.hides || []))];
  const marks = [...new Set(metas.flatMap((m) => m.marks || []))];

  return {
    member: {
      role,
      avatar: avatar.id,
      name: avatar.name,
      look: look.id,
      base: base.id,
      rig,
      seed: avatar.seed,
      disclosure: avatar.disclosure || `${avatar.name} is an AI-voiced virtual presenter`,
      moods: avatar.moods || {},
      temperament: avatar.temperament || {},
      palette,
      parts,
      hidden,
    },
    avatar,
    avatarDir: path.dirname(avatarHit.path),
    marks,
  };
}

const pkgFile = (rel) => ({ path: path.join(PKG, rel), label: rel });

// Resolve cast entries ({ role: { avatar, look, palette, options } }) against
// resolved tokens. Returns the members, their avatars and the rig, base and
// part files in bundle order.
export function resolveCast(project, castCfg, tokens, marks = {}) {
  const acc = { bases: {}, parts: {}, rigs: new Set(), baseFiles: new Map(), partFiles: new Map() };
  const cast = {};
  const avatars = {};
  // Parts that draw a missing mark draw nothing; check reports it.
  const warnings = [];
  for (const [role, entry] of Object.entries(castCfg)) {
    const r = resolveMember(project, role, entry, tokens, acc);
    cast[role] = r.member;
    avatars[role] = { avatar: r.avatar, dir: r.avatarDir };
    for (const m of r.marks) {
      if (!marks[m] && !(m === "badge" && marks.emblem)) warnings.push(`${r.avatar.id}/${r.member.look} draws brand mark "${m}", which the brand does not define`);
    }
  }
  const files = [];
  for (const rig of acc.rigs) files.push(need(project, `rigs/${rig}/rig.js`, `rig ${rig}`));
  files.push(...acc.baseFiles.values(), ...acc.partFiles.values());
  return { cast, avatars, acc, files, warnings };
}

function lexiconFiles(project, cfg, avatarLexicon) {
  const out = [];
  let inserted = false;
  const isFile = (e) => e.startsWith("./") || e.startsWith("../") || path.isAbsolute(e);
  for (const e of cfg.lexicons || []) {
    if (!isFile(e)) {
      out.push(need(project, `lexicons/${e}.json`, `lexicon pack ${e}`).path);
      continue;
    }
    if (!inserted && avatarLexicon) out.push(avatarLexicon);
    inserted = true;
    out.push(path.resolve(project.root, e));
  }
  if (!inserted && avatarLexicon) out.push(avatarLexicon);
  for (const f of out) if (!existsSync(f)) throw new Error(`lexicon ${f} does not exist`);
  return out;
}

export function resolveEpisode(project, id) {
  const dir = path.join(project.episodesDir, id);
  if (!existsSync(dir)) throw new Error(`no episode ${id} in ${project.episodesDir}`);
  const epFile = path.join(dir, "episode.json");
  const ep = existsSync(epFile) ? readJson(epFile) : {};
  const cfg = Object.assign({}, project.config);
  for (const k of ["theme", "format"]) if (ep[k]) cfg[k] = ep[k];
  const castCfg = mergeCast(project.config.cast, ep.cast);

  const themeDir = path.dirname(need(project, `themes/${cfg.theme}/theme.json`, "theme").path);
  const theme = readJson(path.join(themeDir, "theme.json"));
  const formatDir = path.dirname(need(project, `formats/${cfg.format}/format.json`, "format").path);
  const format = readJson(path.join(formatDir, "format.json"));

  let brand = {};
  let brandDir = project.root;
  if (cfg.brand) {
    const f = path.resolve(project.root, cfg.brand);
    brand = readJson(f);
    brandDir = path.dirname(f);
  }
  const marks = {};
  for (const [name, file] of Object.entries(brand.marks || {})) {
    const f = path.resolve(brandDir, file);
    marks[name] = parseSvg(readFileSync(f, "utf8"), f);
  }

  // Scenes: the library's, then the project's own.
  const sceneIds = [...BUILTIN_SCENES, ...(cfg.scenes || []).filter((s) => !BUILTIN_SCENES.includes(s))];
  const scenes = sceneIds.map((s) => ({
    id: s,
    js: need(project, `scenes/${s}/${s}.js`, `scene ${s}`),
    css: optional(project, `scenes/${s}/${s}.css`),
    tokens: optional(project, `scenes/${s}/tokens.json`),
  }));

  // Tokens, in tier order.
  const sources = [];
  const tokDir = path.join(PKG, "tokens");
  for (const f of readdirSync(tokDir).filter((f) => f.endsWith(".tokens.json")).sort()) {
    sources.push({ tree: readJson(path.join(tokDir, f)), source: `tokens/${f}` });
  }
  sources.push({ tree: readJson(path.join(PKG, "core/tokens.json")), source: "core/tokens.json" });
  for (const s of scenes) if (s.tokens) sources.push({ tree: readJson(s.tokens.path), source: s.tokens.label });
  sources.push({ tree: readJson(path.join(themeDir, "theme.tokens.json")), source: `themes/${cfg.theme}/theme.tokens.json` });
  if (existsSync(path.join(formatDir, "format.tokens.json"))) {
    sources.push({ tree: readJson(path.join(formatDir, "format.tokens.json")), source: `formats/${cfg.format}/format.tokens.json` });
  }
  if (brand.tokens) sources.push({ tree: brand.tokens, source: "brand" });
  if (project.config.tokens) sources.push({ tree: project.config.tokens, source: "avatars.json" });
  if (ep.tokens) sources.push({ tree: ep.tokens, source: `episodes/${id}/episode.json` });
  const tokens = compile(sources).values;

  // Icons: later packs override earlier ones.
  const icons = {};
  for (const pack of cfg.icons || []) {
    const d = need(project, `icons/${pack}`, `icon pack ${pack}`).path;
    for (const f of svgFiles(d)) icons[f.replace(/\.svg$/, "")] = parseSvg(readFileSync(path.join(d, f), "utf8"), path.join(d, f)).body;
  }

  // Cast.
  const { cast, avatars, acc, files: castJs, warnings } = resolveCast(project, castCfg, tokens, marks);

  // Runtime files, in bundle order.
  const js = [...CORE_HEAD.map(pkgFile)];
  js.push(...castJs, ...CORE_TAIL.map(pkgFile));
  js.push(...scenes.map((s) => s.js));
  const hlDir = path.join(PKG, "scenes/code/highlight");
  if (existsSync(hlDir)) for (const f of readdirSync(hlDir).filter((f) => f.endsWith(".js")).sort()) js.push(pkgFile(`scenes/code/highlight/${f}`));
  const css = [pkgFile("core/core.css"), ...scenes.filter((s) => s.css).map((s) => s.css)];
  if (existsSync(path.join(formatDir, "format.css"))) css.push({ path: path.join(formatDir, "format.css"), label: `formats/${cfg.format}/format.css` });

  const fonts = (theme.fonts || []).map((f) => ({ family: f.family, weight: String(f.weight), file: f.file, path: require.resolve(f.src) }));

  // Voice: the host's presets and the merged lexicons.
  const host = avatars.host;
  const voiceFile = host.avatar.voice ? path.join(host.dir, host.avatar.voice) : null;
  const avatarLexicon = host.avatar.lexicon ? path.join(host.dir, host.avatar.lexicon) : null;

  return {
    id,
    dir,
    project,
    config: cfg,
    episode: ep,
    theme,
    format,
    brand: {
      name: brand.name || "",
      wordmark: brand.wordmark || "",
      tagline: brand.tagline || "",
      role: brand.role || "",
      links: brand.links || [],
      marks,
    },
    tokens,
    icons,
    cast,
    bases: acc.bases,
    parts: acc.parts,
    scenes: sceneIds,
    js,
    css,
    fonts,
    gsap: require.resolve("gsap/dist/gsap.min.js"),
    voice: { voices: voiceFile, preset: castCfg.host.voice || null, lexicons: lexiconFiles(project, cfg, avatarLexicon) },
    warnings,
  };
}

// The inline @font-face rules an episode page declares for its theme.
export function fontFaceCss(fonts, indent = "  ") {
  return fonts
    .map((f) => `${indent}@font-face { font-family: "${f.family}"; font-weight: ${f.weight}; src: url("vendor/fonts/${f.file}") format("woff2"); }`)
    .join("\n");
}

export const isFile = (p) => existsSync(p) && statSync(p).isFile();
