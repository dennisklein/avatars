// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Resolving projects and episodes (cli/lib/project.mjs) against the fixture
// project test/fixtures/studio: the avatar kit on the base box-200x200 lives
// in its library, and each episode's episode.json picks one case. Covers the
// lookup order (project library before package), the part rules, palette
// precedence and token references, hidden slots, lexicon order, token tiers
// and episode overrides.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { BUILTIN_SCENES, PKG, episodeIds, loadProject, locate, parseSvg, resolveEpisode } from "../cli/lib/project.mjs";
import { voiceFlags } from "../cli/lib/voice.mjs";
import { REPO, copyProject, fixture, tempDir } from "./helpers.mjs";

const STUDIO = fixture("studio");
const project = loadProject(STUDIO);
const resolve = (id, p = project) => resolveEpisode(p, id);
const lib = (rel) => path.join(STUDIO, "library", rel);
const pkg = (rel) => path.join(REPO, rel);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A copy of the studio fixture whose avatars.json is changed by `edit`.
function studioWith(t, edit) {
  const root = copyProject(STUDIO, path.join(tempDir(t), "studio"));
  const file = path.join(root, "avatars.json");
  const cfg = JSON.parse(readFileSync(file, "utf8"));
  edit(cfg);
  writeFileSync(file, JSON.stringify(cfg, null, 2));
  return loadProject(root);
}

describe("projects", () => {
  test("loadProject fills defaults and locates the project directories", () => {
    assert.equal(project.root, STUDIO);
    assert.equal(project.lib, path.join(STUDIO, "library"));
    assert.equal(project.episodesDir, path.join(STUDIO, "episodes"));
    assert.equal(project.pkg, PKG);
    assert.equal(PKG, REPO);
    assert.deepEqual(project.config.checks, [], "a default");
    assert.deepEqual(project.config.scenes, ["callout"], "from avatars.json");
  });

  test("loadProject finds avatars.json above the working directory, or explains how to pass one", (t) => {
    const cwd = process.cwd();
    t.after(() => process.chdir(cwd));
    process.chdir(path.join(STUDIO, "episodes", "basic"));
    assert.equal(loadProject().root, STUDIO);
    const empty = tempDir(t);
    process.chdir(empty);
    assert.throws(() => loadProject(), /no avatars\.json in the working directory or above; pass --project <dir>/);
    assert.throws(() => loadProject(empty), /no avatars\.json in .*; pass --project <dir>/);
  });

  test("episodeIds lists directories with an index.html or a script.json", () => {
    assert.deepEqual(episodeIds(project), ["basic"]);
    assert.deepEqual(episodeIds(loadProject(path.join(REPO, "examples", "demo"))), ["tour", "wardrobe"]);
  });

  test("an unknown episode is an error", () => {
    assert.throws(() => resolve("nope"), /no episode nope in /);
  });
});

describe("lookup order", () => {
  test("project library ids resolve before the package's, each file on its own", () => {
    assert.deepEqual(locate(project, "parts/tops/hoodie/part.json"), { path: lib("parts/tops/hoodie/part.json"), label: "project:library/parts/tops/hoodie/part.json" });
    assert.deepEqual(locate(project, "parts/tops/blazer/part.json"), { path: pkg("parts/tops/blazer/part.json"), label: "parts/tops/blazer/part.json" });
    assert.equal(locate(project, "parts/tops/nope/part.json"), null);
  });

  test("a project part shadows the package part of the same id", () => {
    const r = resolve("shadow");
    assert.equal(r.parts["tops/hoodie"].title, "Hoodie of the project library");
    const labels = r.js.map((f) => f.label);
    assert.ok(labels.includes("project:library/parts/tops/hoodie/part.js"));
    assert.ok(!labels.includes("parts/tops/hoodie/part.js"));
    // The rest of Sindy comes from the package.
    assert.ok(labels.includes("parts/hair/long-bangs/part.js"));
    assert.ok(labels.includes("avatars/sindy/parts/ahoge/part.js"));
  });

  test("a project avatar, its base, its parts and a look of a package avatar come from the library", () => {
    const r = resolve("basic");
    assert.equal(r.cast.host.avatar, "kit");
    assert.equal(r.cast.host.base, "box-200x200");
    assert.deepEqual(r.bases["box-200x200"].canvas, [200, 200]);
    const labels = r.js.map((f) => f.label);
    assert.ok(labels.includes("rigs/svg/rig.js"), "the rig of the package");
    assert.ok(labels.includes("project:library/rigs/svg/bases/box-200x200/base.js"));
    assert.ok(labels.includes("project:library/avatars/kit/parts/antenna/part.js"));
    // library/avatars/sindy/looks/borrowed.json adds a look to the package's Sindy.
    assert.equal(locate(project, "avatars/sindy/looks/borrowed.json").label, "project:library/avatars/sindy/looks/borrowed.json");
    assert.equal(locate(project, "avatars/sindy/avatar.json").label, "avatars/sindy/avatar.json");
  });

  test("project scenes come after the library's, with their CSS and tokens", () => {
    const r = resolve("basic");
    assert.deepEqual(r.scenes, [...BUILTIN_SCENES, "callout"]);
    const scenes = r.js.map((f) => f.label).filter((l) => /scenes\/[^/]+\/[^/]+\.js$/.test(l) && !l.includes("/highlight/"));
    assert.deepEqual(scenes, [...BUILTIN_SCENES.map((s) => `scenes/${s}/${s}.js`), "project:library/scenes/callout/callout.js"]);
    assert.equal(r.css.at(-1).label, "project:library/scenes/callout/callout.css");
    assert.equal(r.tokens["callout.bg"], r.tokens["color.surface-raised"]);
    assert.equal(r.tokens["callout.accent"], "rgba(160, 0, 0, 0.5)", "the brand accent at the scene's alpha");
  });

  test("icon packs: the project's own pack, later packs win", () => {
    const r = resolve("basic");
    assert.match(r.icons.star, /^<path d="M12 3l2\.6/);
    assert.equal(r.icons.check, '<path d="M4 12l5 5L20 6"/>', "extra/check.svg overrides core/check.svg");
    assert.equal(r.icons.gear, parseSvg(readFileSync(pkg("icons/core/gear.svg"), "utf8"), "gear").body);
    assert.equal(r.icons.docker, undefined, "the tech pack is not listed");
  });

  test("missing library ids are errors that name both places", () => {
    assert.throws(() => resolve("unknown-format"), new RegExp(`format: formats/portrait-720p/format\\.json is in neither ${escapeRe(path.join(STUDIO, "library"))} nor ${escapeRe(PKG)}`));
  });
});

describe("part rules", () => {
  test("every part must fit the avatar's base", () => {
    assert.throws(() => resolve("wrong-base"), /part eyewear\/round-glasses does not fit base box-200x200 \(fits: anime-600x800\)/);
  });

  test("a part may only draw into slots of the base", () => {
    assert.throws(() => resolve("wrong-slot"), /part accessories\/box-sleeve draws into slot "sleeve", which base box-200x200 lacks/);
  });

  test("one part per category, except hair and accessories", () => {
    assert.throws(() => resolve("two-tops"), /kit\/two-tops: parts tops\/box-shirt and tops\/box-vest are both tops/);
    // The plain look wears two hair parts and two accessories.
    const ids = resolve("basic").cast.host.parts.map((p) => p.id);
    assert.deepEqual(ids, ["body/box", "hair/box-fringe", "kit/antenna", "tops/box-shirt", "headwear/box-cap", "accessories/box-pin", "accessories/box-tag"]);
  });

  test("a part named <avatar>/<name> is only for that avatar", () => {
    assert.throws(() => resolve("borrowed"), /part "kit\/antenna" belongs to avatar "kit" and cannot be worn by "sindy"/);
  });

  test("a look may only pick colourways the part has", () => {
    assert.throws(() => resolve("bad-colourway"), /look kit\/bad-colourway: part headwear\/box-cap has no colourway "tartan"/);
  });

  test("every role a part paints with must resolve", () => {
    assert.throws(() => resolve("missing-role"), /part accessories\/box-pin paints with role "pin\.base", which kit\/missing-role does not set/);
  });

  test("part ids are <category>/<name> or <avatar>/<name>", (t) => {
    const p = studioWith(t, (cfg) => (cfg.cast.host.look = "odd"));
    writeFileSync(path.join(p.lib, "avatars/kit/looks/odd.json"), JSON.stringify({ id: "odd", wear: ["tops/box/shirt"] }));
    assert.throws(() => resolve("basic", p), /part id "tops\/box\/shirt" is not <category>\/<name> or <avatar>\/<name>/);
  });

  test("brand marks a part draws but the brand lacks are warnings; badge falls back to emblem", () => {
    assert.deepEqual(resolve("basic").warnings, [], "box-tag draws badge, the brand has emblem");
    assert.deepEqual(resolve("sealed").warnings, ['kit/sealed draws brand mark "seal", which the brand does not define']);
  });
});

describe("palette", () => {
  test("later wins: part defaults, colourway, avatar, look, cast entry", () => {
    const { palette } = resolve("basic").cast.host;
    assert.equal(palette["cap.a"], "#111111", "part defaults");
    assert.equal(palette["cap.b"], "#222222", "the look's colourway");
    assert.equal(palette["cap.c"], "#333333", "the avatar's palette");
    assert.equal(palette["cap.d"], "#444444", "the look's palette");
    assert.equal(palette["cap.e"], "#555555", "the cast entry's palette");
    assert.equal(palette["skin.base"], "#f2d4c4");
    assert.equal(palette["hair.base"], "#101010", "a role two parts share");
  });

  test("token references resolve against the episode's tokens", () => {
    const basic = resolve("basic");
    assert.equal(basic.cast.host.palette["top.base"], basic.tokens["color.surface"], "a part default follows the theme");
    assert.equal(basic.cast.host.palette["pin.base"], "#00b000", "a look's {color.ok} after the project's token override");
    const over = resolve("override");
    assert.equal(over.cast.host.palette["top.base"], over.tokens["color.surface"]);
    assert.notEqual(over.cast.host.palette["top.base"], basic.cast.host.palette["top.base"], "daylight's surface is not midnight's");
    // Package looks follow the brand too: the hoodie's drawstrings are {color.accent}.
    assert.equal(resolve("shadow").cast.host.palette["top.trim"], "#a00000");
  });

  test("references to undefined tokens and values that are not colours are errors", () => {
    assert.throws(() => resolve("bad-ref"), /palette role pin\.base of kit\/bare: token "color\.nope" is not defined/);
    assert.throws(() => resolve("not-colour"), /palette role pin\.base of kit\/bare is ""Inter", sans-serif", not a colour/);
  });

  test("the resolved palette holds colours only", () => {
    for (const id of ["basic", "override", "shadow"]) {
      for (const [role, v] of Object.entries(resolve(id).cast.host.palette)) assert.doesNotMatch(v, /[{}]/, `${id}: ${role} is ${v}`);
    }
  });
});

describe("cast members", () => {
  test("the member carries what the runtime needs", () => {
    const m = resolve("basic").cast.host;
    assert.deepEqual(
      { role: m.role, avatar: m.avatar, name: m.name, look: m.look, base: m.base, rig: m.rig, seed: m.seed, disclosure: m.disclosure },
      { role: "host", avatar: "kit", name: "Kit", look: "plain", base: "box-200x200", rig: "svg", seed: 5, disclosure: "Kit is a test fixture" }
    );
    assert.deepEqual(m.moods, { neutral: { smile: 0.2 }, sleepy: { eye: 0.3 } });
    assert.deepEqual(m.temperament, { sway: 1 });
  });

  test("slots hidden by parts are listed", () => {
    assert.deepEqual(resolve("basic").cast.host.hidden, ["hair"], "the cap hides the hair");
    assert.deepEqual(resolve("override").cast.host.hidden, [], "no cap in the bare look");
  });

  test("part options: the part's defaults, then the look's, then the cast entry's", () => {
    const opts = (r, id) => r.cast.host.parts.find((p) => p.id === id).options;
    assert.deepEqual(opts(resolve("basic"), "headwear/box-cap"), { brim: "back", logo: true });
    assert.deepEqual(opts(resolve("basic"), "tops/box-shirt"), { pocket: true, tuck: false });
    assert.deepEqual(opts(resolve("override"), "tops/box-shirt"), { pocket: false, tuck: true });
  });

  test("the bases and parts of the cast are in the data block", () => {
    const r = resolve("basic");
    assert.deepEqual(Object.keys(r.bases), ["box-200x200"]);
    assert.deepEqual(Object.keys(r.parts).sort(), r.cast.host.parts.map((p) => p.id).sort());
  });
});

describe("tokens of an episode", () => {
  test("tiers, later wins: theme, format, brand, project, episode", () => {
    const basic = resolve("basic");
    assert.equal(basic.tokens["color.accent"], "#a00000", "brand over theme");
    assert.equal(basic.tokens["color.info"], "#00b000", "project over brand");
    assert.equal(basic.tokens["color.ok"], "#00b000", "project over brand");
    assert.equal(basic.tokens["format.width"], "1920px", "format tokens");
    assert.equal(basic.tokens["glow.accent"], "rgba(160, 0, 0, 0.28)", "components follow the override");
    assert.equal(resolve("override").tokens["color.ok"], "#0000c0", "episode over project");
  });
});

describe("lexicons", () => {
  const STUDIO_LEXICONS = (avatarLexicon) => [
    pkg("lexicons/en-us/core.json"),
    lib("lexicons/en-us/studio.json"),
    avatarLexicon,
    path.join(STUDIO, "lexicon.json"),
    path.join(STUDIO, "more/extra.json"),
  ];

  test("library packs, then the avatar's lexicon, then project files, in list order", () => {
    assert.deepEqual(resolve("basic").voice.lexicons, STUDIO_LEXICONS(lib("avatars/kit/lexicon.json")));
    assert.deepEqual(resolve("shadow").voice.lexicons, STUDIO_LEXICONS(pkg("avatars/sindy/lexicon.json")));
  });

  test("without project files the avatar's lexicon comes last", (t) => {
    const p = studioWith(t, (cfg) => (cfg.lexicons = ["en-us/core", "en-us/hpc"]));
    assert.deepEqual(resolve("basic", p).voice.lexicons, [pkg("lexicons/en-us/core.json"), pkg("lexicons/en-us/hpc.json"), path.join(p.lib, "avatars/kit/lexicon.json")]);
  });

  test("unknown packs and missing files are errors", (t) => {
    const pack = studioWith(t, (cfg) => (cfg.lexicons = ["en-us/nope"]));
    assert.throws(() => resolve("basic", pack), /lexicon pack en-us\/nope: lexicons\/en-us\/nope\.json is in neither/);
    const file = studioWith(t, (cfg) => (cfg.lexicons = ["./nope.json"]));
    assert.throws(() => resolve("basic", file), /lexicon .*nope\.json does not exist/);
  });

  test("the voice tool gets --voices, -v and every --lexicon in order", () => {
    const r = resolve("shadow");
    assert.equal(r.voice.voices, pkg("avatars/sindy/voice.json"));
    assert.deepEqual(voiceFlags(r.voice), ["--voices", r.voice.voices, ...r.voice.lexicons.flatMap((f) => ["--lexicon", f])]);
    const over = resolve("override");
    assert.equal(over.voice.voices, null, "kit has no voice.json");
    assert.deepEqual(voiceFlags(over.voice).slice(0, 2), ["-v", "calm"]);
  });
});

describe("episode.json", () => {
  test("overrides theme, cast and tokens of one episode", () => {
    const r = resolve("override");
    assert.equal(r.config.theme, "daylight");
    assert.equal(r.theme.id, "daylight");
    assert.notEqual(r.tokens["color.bg"], resolve("basic").tokens["color.bg"], "daylight's background, not midnight's");
    assert.equal(r.cast.host.avatar, "kit", "the project's avatar stays");
    assert.equal(r.cast.host.look, "bare");
    assert.equal(r.voice.preset, "calm");
    assert.deepEqual(r.episode.cast.host.voice, "calm");
  });

  test("merges cast entries per role and key, the episode's entry over the project's", () => {
    const { palette } = resolve("override").cast.host;
    assert.equal(palette["pin.base"], "#00b000", "the episode's cast palette, {color.info} after the project's override");
    assert.equal(palette["cap.e"], "#555555", "the project's cast palette merges per role name");
  });

  test("may switch the avatar", () => {
    const r = resolve("shadow");
    assert.equal(r.cast.host.avatar, "sindy");
    assert.equal(r.cast.host.look, "hoodie");
    assert.equal(r.cast.host.base, "anime-600x800");
  });

  test("leaves the project's own configuration alone", () => {
    resolve("override");
    assert.equal(project.config.theme, "midnight");
    assert.deepEqual(project.config.cast, { host: { avatar: "kit", palette: { "cap.e": "#555555" } } });
  });

  test("a brand's marks are parsed SVG", () => {
    const { marks } = resolve("basic").brand;
    assert.deepEqual(marks.emblem, { viewBox: [0, 0, 10, 10], body: '<rect x="1" y="1" width="8" height="8" rx="2" fill="#808080"/>' }, "without the title");
  });
});

describe("parseSvg", () => {
  test("keeps the viewBox and the inner markup without comments and titles", () => {
    const svg = '<svg viewBox="0 0 24 24">\n  <!-- a comment -->\n  <title>x</title>\n  <path d="M1 1"/>\n  <circle r="2"/>\n</svg>\n';
    assert.deepEqual(parseSvg(svg, "x.svg"), { viewBox: [0, 0, 24, 24], body: '<path d="M1 1"/><circle r="2"/>' });
  });

  test("rejects files without an svg element or a viewBox", () => {
    assert.throws(() => parseSvg("<g/>", "a.svg"), /a\.svg: not an SVG document/);
    assert.throws(() => parseSvg('<svg width="24"></svg>', "b.svg"), /b\.svg: the <svg> element has no viewBox/);
    assert.throws(() => parseSvg('<svg viewBox="0 0 24"></svg>', "c.svg"), /c\.svg: bad viewBox "0 0 24"/);
  });
});
