// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Every theme of the package: it defines every semantic token of DESIGN.md
// and font.mono-advance, resolves with the library's component tokens, its
// fonts are files of the installed packages, and every contrast pair it lists
// in theme.json passes its minimum. Every format sizes the page with tokens.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { contrastProblems } from "../cli/lib/check.mjs";
import { readJson, resolveEpisode } from "../cli/lib/project.mjs";
import { standInProject } from "../cli/lib/sheet.mjs";
import { flatten, parseColor } from "../cli/lib/tokens.mjs";
import { REPO, suiteDir } from "./helpers.mjs";

const require = createRequire(path.join(REPO, "package.json"));
const dirsIn = (d) => readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const THEMES = dirsIn(path.join(REPO, "themes"));
const FORMATS = dirsIn(path.join(REPO, "formats"));

// The semantic tokens of DESIGN.md ("Semantic tokens every theme defines"),
// with the ones the runtime relies on even if that table misses them.
const REQUIRED = [
  "color.bg", "color.bg-alt", "color.surface", "color.surface-raised", "color.surface-sunken", "color.surface-bar",
  "color.border", "color.border-subtle", "color.text", "color.text-strong", "color.text-muted", "color.text-dim",
  "color.accent", "color.accent-strong", "color.accent-soft", "color.info", "color.info-soft",
  "color.ok", "color.warn", "color.danger", "color.on-accent", "color.code-comment", "color.code-keyword",
  "font.sans", "font.mono", "font.mono-advance",
];
function designSemanticTokens() {
  const text = readFileSync(path.join(REPO, "DESIGN.md"), "utf8");
  const at = text.indexOf("Semantic tokens every theme defines");
  if (at < 0) return [];
  const table = text.slice(at).split("\n\n")[1] || "";
  const names = [];
  for (const row of table.split("\n").filter((l) => l.startsWith("|"))) {
    const first = row.split("|")[1] || "";
    for (const [, name] of first.matchAll(/`([a-z][\w.-]*)`/g)) names.push(name);
  }
  return names;
}
const SEMANTIC = [...new Set([...REQUIRED, ...designSemanticTokens()])];

// A theme's tokens as an episode resolves them: primitives, core and scene
// components, the theme, the format; the package's default avatar is cast.
const tmp = suiteDir(before, after, "avatars-themes-");
function resolveTheme(theme) {
  const dir = path.join(tmp.path, theme);
  mkdirSync(path.join(dir, "probe"), { recursive: true });
  return resolveEpisode(standInProject(null, dir, { avatar: "sindy", theme }), "probe");
}

test("DESIGN.md's semantic token table is found and lists the colour and font tokens", () => {
  const names = designSemanticTokens();
  assert.ok(names.length >= 20, `found ${names.length} names in the table`);
  for (const n of names) assert.match(n, /^(color|font)\./);
});

test("the package has themes", () => {
  assert.ok(THEMES.includes("midnight"), THEMES.join(", "));
});

for (const theme of THEMES) {
  describe(`theme ${theme}`, () => {
    const dir = path.join(REPO, "themes", theme);
    const meta = readJson(path.join(dir, "theme.json"));
    const own = flatten(readJson(path.join(dir, "theme.tokens.json")), `themes/${theme}/theme.tokens.json`);
    let r;
    const resolved = () => (r = r || resolveTheme(theme));

    test("theme.json names the theme after its directory", () => {
      assert.equal(meta.id, theme);
      assert.ok(meta.title, "a title");
    });

    test("theme.tokens.json defines every semantic token", () => {
      const missing = SEMANTIC.filter((n) => !own.has(n));
      assert.deepEqual(missing, [], `themes/${theme}/theme.tokens.json lacks ${missing.join(", ")}`);
    });

    test("resolves with the component tokens of core/ and every scene", () => {
      const { tokens } = resolved();
      for (const f of [path.join(REPO, "core", "tokens.json"), ...dirsIn(path.join(REPO, "scenes")).map((s) => path.join(REPO, "scenes", s, "tokens.json"))]) {
        if (!existsSync(f)) continue;
        for (const name of flatten(readJson(f), f).keys()) assert.ok(name in tokens, `${name} of ${path.relative(REPO, f)} did not resolve`);
      }
      for (const [name, v] of Object.entries(tokens)) assert.ok(typeof v === "string" || typeof v === "number", `${name} is ${JSON.stringify(v)}`);
    });

    test("semantic colours are colours, fonts are stacks, the mono advance is a fraction of an em", () => {
      const { tokens } = resolved();
      for (const n of SEMANTIC.filter((n) => n.startsWith("color."))) assert.ok(parseColor(tokens[n]), `${n} is "${tokens[n]}"`);
      for (const n of ["font.sans", "font.mono"]) assert.match(String(tokens[n]), /\S/, n);
      const adv = tokens["font.mono-advance"];
      assert.equal(typeof adv, "number");
      assert.ok(adv > 0.3 && adv < 1, `font.mono-advance is ${adv}`);
    });

    test("its fonts resolve to WOFF2 files and cover the families of font.sans and font.mono", () => {
      assert.ok(Array.isArray(meta.fonts) && meta.fonts.length, "theme.json lists fonts");
      const files = new Set();
      for (const f of meta.fonts) {
        let file;
        assert.doesNotThrow(() => (file = require.resolve(f.src)), `font src ${f.src}`);
        assert.equal(readFileSync(file).subarray(0, 4).toString("latin1"), "wOF2", `${f.src} is a WOFF2 file`);
        assert.match(f.file, /^[a-z0-9-]+\.woff2$/, "the file name under vendor/fonts/");
        assert.ok(!files.has(f.file), `${f.file} is named twice`);
        files.add(f.file);
        assert.match(String(f.weight), /^\d{3}( \d{3})?$/, `weight of ${f.file}`);
      }
      const { tokens } = resolved();
      const families = new Set(meta.fonts.map((f) => f.family));
      for (const n of ["font.sans", "font.mono"]) {
        const first = String(tokens[n]).split(",")[0].trim().replace(/^["']|["']$/g, "");
        assert.ok(families.has(first), `${n} starts with "${first}", which theme.json does not load`);
      }
    });

    test("every contrast pair of theme.json passes its minimum", () => {
      assert.ok(Array.isArray(meta.contrast) && meta.contrast.length, "theme.json lists contrast pairs");
      const pairs = meta.contrast.map(([fg, bg]) => `${fg} on ${bg}`);
      assert.ok(pairs.includes("color.text on color.bg"), "the pair color.text on color.bg is listed");
      assert.equal(new Set(pairs).size, pairs.length, "no pair is listed twice");
      assert.deepEqual(contrastProblems(meta, resolved().tokens), []);
    });
  });
}

test("contrastProblems reports a pair below its minimum and a pair with an unknown token", () => {
  const tokens = { "color.bg": "#0f172a", "color.text": "#1e293b", "color.text-strong": "#ffffff" };
  const problems = contrastProblems({ contrast: [["color.text", "color.bg", 4.5], ["color.text-strong", "color.bg", 4.5], ["color.nope", "color.bg", 3]] }, tokens);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /^color\.text \(#1e293b\) on color\.bg \(#0f172a\) has contrast 1\.\d\d, below 4\.5$/);
  assert.equal(problems[1], "contrast pair color.nope on color.bg: color.nope is not a token");
});

for (const format of FORMATS) {
  test(`format ${format} sizes the page with format.width and format.height`, () => {
    const dir = path.join(REPO, "formats", format);
    const meta = readJson(path.join(dir, "format.json"));
    assert.equal(meta.id, format);
    const own = flatten(readJson(path.join(dir, "format.tokens.json")), format);
    assert.equal(own.get("format.width").value, `${meta.width}px`);
    assert.equal(own.get("format.height").value, `${meta.height}px`);
    for (const shot of ["hidden", "hero", "full", "left", "cornerR", "cornerL", "mini"]) assert.ok(meta.shots[shot], `shot ${shot}`);
    for (const scene of ["diagram", "code", "terminal"]) assert.ok(meta.scenes[scene], `geometry of scene ${scene}`);
  });
}
