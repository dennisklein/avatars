// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Schema validation (cli/lib/validate.mjs, `avatars validate`): the package,
// its templates and examples/demo have no problems; every manifest of the
// fixture project test/fixtures/broken fails with the message it should.
import assert from "node:assert/strict";
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { loadProject } from "../cli/lib/project.mjs";
import { KINDS, SCHEMA_DIR, packageManifests, projectManifests, uniqueItems, validateData, validateItems } from "../cli/lib/validate.mjs";
import { DEMO, REPO, copyProject, fixture, outputOf, runCli, tempDir } from "./helpers.mjs";

const BROKEN = fixture("broken");
const rel = (f) => path.relative(BROKEN, f).split(path.sep).join("/");

describe("the package", () => {
  test("every kind has a schema, and every schema file is a kind or shared definitions", () => {
    const files = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".schema.json")).sort();
    assert.deepEqual(files, [...KINDS, "defs"].map((k) => `${k}.schema.json`).sort());
  });

  test("the package, its templates and examples/demo validate with 0 problems", () => {
    const items = uniqueItems([...packageManifests(), ...projectManifests(loadProject(DEMO))]);
    const kinds = new Set(items.map((i) => i.kind));
    for (const k of ["project", "brand", "episode", "script", "avatar", "look", "part", "base", "theme", "format", "voice", "lexicon", "tokens"]) assert.ok(kinds.has(k), `no ${k} manifest was validated`);
    assert.ok(items.some((i) => i.template), "the templates are validated");
    const problems = validateItems(items).map((p) => `${path.relative(REPO, p.file)}: ${p.message}`);
    assert.deepEqual(problems, []);
  });

  test("the studio fixture is valid: its cases fail when episodes resolve, not here", () => {
    const items = projectManifests(loadProject(fixture("studio")));
    assert.ok(items.length > 30, `${items.length} files`);
    assert.deepEqual(validateItems(items), []);
  });

  test("avatars validate exits 0 and counts the files", (t) => {
    // From a directory without avatars.json: the package and the demo only.
    const r = runCli(["validate"], { cwd: tempDir(t) });
    assert.equal(r.status, 0, outputOf(r));
    assert.match(r.stdout, /^validate: \d+ files, 0 problems$/m);
    assert.equal(r.stderr, "");
  });
});

describe("broken manifests", () => {
  // Every file of the fixture with the messages it must give.
  const EXPECTED = {
    "avatars.json": [
      'top level: unknown key "colour"',
      'grounding: missing "embed"',
      "check module checks/missing.mjs does not exist",
      "lexicon file ./missing-lexicon.json does not exist",
    ],
    "brand/brand.json": ['top level: missing "name"', "mark emblem: emblem.svg does not exist"],
    "episodes/dup/episode.json": ['top level: unknown key "look"', 'theme is "Midnight"; expected a library id: lowercase letters, digits, dots, dashes and underscores'],
    "episodes/dup/script.json": ['lines[2]: missing "text"', 'line id "intro" appears twice'],
    "library/avatars/echo/avatar.json": [],
    "library/avatars/echo/voice.json": ['presets.soft: missing "mix"', 'the default preset "loud" is not one of the presets (soft)'],
    "library/avatars/echo/looks/odd.json": [
      'top level: unknown key "colours"',
      /^palette\["top\.base"\] is "reddish"; expected a colour \(#rgb, .*\) or a token reference such as \{color\.accent\}$/,
      'id is "even", but its location makes it "odd"',
    ],
    "library/avatars/ghost/avatar.json": [
      'top level: missing "identity"',
      'id is "phantom", but its location makes it "ghost"',
      "voice file missing-voice.json does not exist",
      'the default look "casual" has no looks/casual.json',
    ],
    "library/parts/tops/odd/part.json": [
      'top level: missing "fits"',
      'id is "tops/even", but its location makes it "tops/odd"',
      'category is "hair", but it lives under parts/tops/',
    ],
    "library/rigs/svg/bases/flat/base.json": ["canvas[0] must be > 0", "slots must NOT have fewer than 1 items"],
    "library/themes/dusk/theme.json": ['font src "@fontsource/nope/files/nope-latin-400-normal.woff2" does not resolve from the package; is its npm package installed?'],
    "library/lexicons/en-us/bad.json": ['words: key "two words" is not one word without whitespace'],
  };
  const byFile = (problems) => {
    const out = {};
    for (const p of problems) (out[rel(p.file)] = out[rel(p.file)] || []).push(p.message);
    return out;
  };

  test("every broken manifest of the fixture project fails with the expected messages", () => {
    const items = projectManifests(loadProject(BROKEN));
    const found = byFile(validateItems(items));
    for (const [file, want] of Object.entries(EXPECTED)) {
      assert.ok(items.some((i) => rel(i.file) === file), `${file} is not validated`);
      const got = found[file] || [];
      assert.equal(got.length, want.length, `${file}:\n  ${got.join("\n  ")}`);
      want.forEach((w, i) => (typeof w === "string" ? assert.equal(got[i], w, file) : assert.match(got[i], w, file)));
    }
    assert.deepEqual(Object.keys(found).filter((f) => !(f in EXPECTED)), [], "problems in files the test does not expect");
  });

  test("avatars validate --project prints one line per problem and exits 1", () => {
    const r = runCli(["validate", "--project", BROKEN]);
    assert.equal(r.status, 1, outputOf(r));
    const count = Object.values(EXPECTED).reduce((n, m) => n + m.length, 0);
    assert.match(r.stdout, new RegExp(`^validate: \\d+ files, ${count} problems$`, "m"));
    const lines = r.stderr.trim().split("\n");
    assert.equal(lines.length, count, r.stderr);
    assert.ok(lines.includes(`${path.join(BROKEN, "brand", "brand.json")}: mark emblem: emblem.svg does not exist`), r.stderr);
  });

  test("files that are not JSON or do not exist are problems", (t) => {
    const root = copyProject(BROKEN, path.join(tempDir(t), "broken"));
    writeFileSync(path.join(root, "episodes", "dup", "script.json"), '{ "lines": [ }');
    const problems = validateItems([
      { kind: "script", file: path.join(root, "episodes", "dup", "script.json") },
      { kind: "brand", file: path.join(root, "brand", "nope.json") },
    ]);
    assert.equal(problems.length, 2);
    assert.match(problems[0].message, /^not JSON: /);
    assert.equal(problems[1].message, "does not exist");
  });
});

describe("validateData", () => {
  test("accepts comments and $schema, rejects other unknown keys", () => {
    assert.deepEqual(validateData("lexicon", { $schema: "x", _comment: "fine", words: { kit: "kˈɪt" } }), []);
    assert.deepEqual(validateData("lexicon", { words: {}, extra: 1 }), ['top level: unknown key "extra"']);
  });

  test("checks colours, token references and part ids", () => {
    assert.deepEqual(validateData("look", { id: "x", wear: ["tops/hoodie"], palette: { "top.base": "{color.accent}", "top.trim": "#14b8a6" } }), []);
    assert.equal(validateData("look", { id: "x", wear: ["hoodie"] }).length, 1);
    assert.match(validateData("look", { id: "x", wear: ["hoodie"] })[0], /^wear\[0\] is "hoodie"; expected <category>\/<name> for a library part/);
  });

  test("line ids are file names that a URL can load", () => {
    const ids = (id) => validateData("script", { lines: [{ id, text: "x" }] });
    for (const id of ["why?", "100%", "a#b", "a/b", "a\\b", ".", ".."]) {
      assert.deepEqual(ids(id), [`lines[0].id is "${id}"; expected a file name without ?, # or %: it names the line's files, which the page loads by URL`], id);
    }
    for (const id of ["b.2", "intro", "step_3-a"]) assert.deepEqual(ids(id), [], id);
  });

  test("Kokoro presets (engine kokoro or none) need a mix and a speed from 0.5 to 2", () => {
    const presets = (p) => validateData("voice", { presets: { p } });
    assert.deepEqual(presets({ engine: "kokoro", voice: "af_heart" }), ['presets.p: missing "mix"']);
    assert.deepEqual(presets({ voice: "af_heart" }), ['presets.p: missing "mix"']);
    assert.deepEqual(presets({ mix: { af_heart: 1 }, speed: 0.3 }), ["presets.p.speed must be >= 0.5"]);
    assert.deepEqual(presets({ mix: { af_heart: 1 }, speed: 2.5 }), ["presets.p.speed must be <= 2"]);
    assert.deepEqual(presets({ mix: { af_heart: 1 }, speed: 2 }), []);
    assert.deepEqual(presets({ engine: "other", voice: "x" }), [], "other engines take their own keys");
  });

  test("token trees take comments in groups and in tokens", () => {
    assert.deepEqual(validateData("tokens", { _comment: "x", color: { _n: "y", bg: { $value: "#000", _why: "z" } } }), []);
    assert.deepEqual(validateData("tokens", { color: { bg: { $value: "#000", why: "z" } } }), ['color.bg: unknown key "why"']);
  });

  test("an unknown kind is an error", () => {
    assert.throws(() => validateData("nope", {}), /no schema core\/schemas\/nope\.schema\.json/);
  });
});
