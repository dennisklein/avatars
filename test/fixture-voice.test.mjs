// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Fixture narration (cli/lib/fixture-voice.mjs, `avatars fixture-voice`):
// line JSON without audio that is deterministic and has plausible timings,
// in the files the voice tool writes, for line ids that name files.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import vm from "node:vm";
import { fixtureLine, writeFixtureVoice } from "../cli/lib/fixture-voice.mjs";
import { DEMO, copyProject, outputOf, runCli, tempDir } from "./helpers.mjs";

// The viseme vocabulary of DESIGN.md ("Performer and pose").
const VISEMES = new Set("sil mbp aa ah ee ih oh ou fv th cdg sz ch l r w".split(" "));
const SENTENCES = [
  "Hi, I'm Sindy! Let's see how this video was made.",
  "Run avatars new episode with a name, and out comes a folder.",
  "Zero errors, zero warnings. It's ready to render!",
  "One",
  "Numbers like 42 and 3.14 count too; so do dashes — and quotes \"like this\".",
];

describe("fixtureLine", () => {
  test("is deterministic", () => {
    for (const s of SENTENCES) assert.equal(JSON.stringify(fixtureLine(s)), JSON.stringify(fixtureLine(s)));
  });

  test("has the fields of the voice tool's line JSON and marks itself as a fixture", () => {
    const line = fixtureLine(SENTENCES[0], "sindy");
    assert.deepEqual(Object.keys(line).sort(), ["duration", "envelope", "fixture", "sampleRate", "text", "visemes", "voice", "words"]);
    assert.equal(line.text, SENTENCES[0]);
    assert.equal(line.voice, "sindy");
    assert.equal(line.sampleRate, 24000);
    assert.equal(line.fixture, true);
    assert.equal(fixtureLine("Hi.").voice, "fixture");
  });

  for (const text of SENTENCES) {
    test(`timings are plausible: ${JSON.stringify(text.slice(0, 32))}`, () => {
      const { words, visemes, envelope, duration } = fixtureLine(text);
      assert.equal(words.length, text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length, "one word per spoken token");
      assert.deepEqual(words.map((w) => w.text), text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)), "words keep their punctuation");
      // Words in order, inside the line, at a speaking rate.
      let prev = 0;
      for (const w of words) {
        assert.ok(w.start >= prev && w.end > w.start && w.end <= duration, `${w.text} ${w.start}-${w.end}`);
        prev = w.end;
      }
      assert.ok(words[0].start > 0 && words[0].start < 0.2, "a short lead-in");
      assert.ok(duration - words.at(-1).end < 0.6, "a short tail");
      const rate = words.length / duration;
      assert.ok(rate > 1 && rate < 5, `${rate.toFixed(2)} words per second`);
      // Visemes from the vocabulary, in order, without overlaps, within the line.
      let end = 0;
      for (const [a, b, v, weight] of visemes) {
        assert.ok(VISEMES.has(v), `viseme ${v}`);
        assert.ok(a >= end - 1e-9 && b > a && b <= duration, `${v} ${a}-${b}`);
        assert.ok(weight > 0 && weight <= 1);
        end = b;
      }
      assert.ok(visemes.filter(([, , v]) => v !== "sil").length >= words.length, "every word moves the mouth");
      // A loudness envelope over the whole line at 100 fps, loud while speaking.
      assert.equal(envelope.fps, 100);
      assert.ok(Math.abs(envelope.values.length - duration * 100) <= 2, `${envelope.values.length} values for ${duration} s`);
      for (const v of envelope.values) assert.ok(v >= 0 && v <= 1, `envelope value ${v}`);
      const at = (t) => envelope.values[Math.floor(t * 100)];
      const w = words[0];
      assert.ok(at((w.start + w.end) / 2) > 0.5, "loud inside a word");
      assert.ok(at(0) < 0.1, "quiet before the first word");
    });
  }

  test("longer text takes longer, and sentence ends pause longer than commas", () => {
    assert.ok(fixtureLine("one two three four").duration > fixtureLine("one two").duration);
    const stop = fixtureLine("Alpha. Beta");
    const comma = fixtureLine("Alpha, Beta");
    const none = fixtureLine("Alpha Beta");
    assert.ok(stop.duration > comma.duration && comma.duration > none.duration, `${stop.duration} > ${comma.duration} > ${none.duration}`);
    assert.ok(stop.visemes.some(([, , v]) => v === "sil"), "a silence at the full stop");
  });
});

describe("writeFixtureVoice", () => {
  test("writes <id>.json, index.json and lines.js as the voice tool does, without WAV files", (t) => {
    const out = path.join(tempDir(t), "voice");
    const script = path.join(DEMO, "episodes", "wardrobe", "script.json");
    const spec = JSON.parse(readFileSync(script, "utf8"));
    const index = writeFixtureVoice(script, out);
    const ids = spec.lines.map((l) => l.id);
    assert.deepEqual(readdirSync(out).sort(), [...ids.map((id) => `${id}.json`), "index.json", "lines.js"].sort());
    assert.deepEqual(index.map((e) => e.id), ids);
    assert.deepEqual(JSON.parse(readFileSync(path.join(out, "index.json"), "utf8")), index);
    for (const e of index) {
      assert.deepEqual(Object.keys(e), ["id", "duration", "text"]);
      assert.deepEqual(JSON.parse(readFileSync(path.join(out, `${e.id}.json`), "utf8")), fixtureLine(e.text, "fixture"));
    }
    // lines.js is a classic script that sets window.AVATAR_LINES.
    const js = readFileSync(path.join(out, "lines.js"), "utf8");
    assert.match(js, /^window\.AVATAR_LINES = \{.*\};\n$/s);
    const ctx = vm.createContext({ window: {} });
    vm.runInContext(js, ctx);
    assert.deepEqual(Object.keys(ctx.window.AVATAR_LINES), ids);
    assert.equal(ctx.window.AVATAR_LINES[ids[0]].duration, index[0].duration);
  });

  test("refuses line ids that are not file names before it writes anything", (t) => {
    const tmp = tempDir(t);
    const script = path.join(tmp, "script.json");
    const out = path.join(tmp, "voice");
    const refuse = (lines, re) => {
      writeFileSync(script, JSON.stringify({ lines }));
      assert.throws(() => writeFixtureVoice(script, out), re, JSON.stringify(lines));
      assert.ok(!existsSync(out), "nothing written");
    };
    for (const id of ["../x", "a/b", "a\\b", "why?", "100%", "a#b", ".", "..", ""]) {
      refuse([{ id, text: "Hi." }], (e) => e.message === `script ${script}: line id "${id}" must be a file name without / \\ ? # %`);
    }
    refuse([{ id: "a", text: "Hi." }, { id: "a", text: "Ho." }], /line id "a" appears twice$/);
    refuse([{ id: "a" }], /line 1 needs a string id and text$/);
    refuse({}, /expected \{"lines": /);
    writeFileSync(script, '{ "lines": [');
    assert.throws(() => writeFixtureVoice(script, out), /^Error: script .*script\.json: /);
    assert.ok(!existsSync(out));
  });

  test("avatars fixture-voice --all writes the same files on every run", (t) => {
    const root = copyProject(DEMO, path.join(tempDir(t), "demo"));
    const snapshot = () => {
      const out = {};
      for (const id of ["tour", "wardrobe"]) {
        const dir = path.join(root, "episodes", id, "assets", "voice");
        for (const f of readdirSync(dir)) out[`${id}/${f}`] = readFileSync(path.join(dir, f), "utf8");
      }
      return out;
    };
    let r = runCli(["fixture-voice", "--all", "--project", root]);
    assert.equal(r.status, 0, outputOf(r));
    assert.equal(r.stdout, "fixture voice: episodes/tour\nfixture voice: episodes/wardrobe\n");
    const first = snapshot();
    r = runCli(["fixture-voice", "tour", "wardrobe", "--project", root]);
    assert.equal(r.status, 0, outputOf(r));
    assert.deepEqual(snapshot(), first);
  });
});
