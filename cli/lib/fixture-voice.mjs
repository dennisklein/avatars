// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Synthetic narration: line JSON with plausible word, viseme and loudness
// timings and no audio, for tests, the gallery and layout work without a TTS
// model. Deterministic: the same text gives the same timings.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const round = (v) => Math.round(v * 1000) / 1000;
const VISEME_OF = {
  a: "aa", e: "ee", i: "ih", o: "oh", u: "ou", y: "ih",
  m: "mbp", b: "mbp", p: "mbp", f: "fv", v: "fv", s: "sz", z: "sz", c: "cdg", k: "cdg", q: "cdg", g: "cdg",
  t: "cdg", d: "cdg", n: "cdg", h: "cdg", x: "sz", j: "ch", l: "l", r: "r", w: "w",
};
const VOWEL = new Set(["aa", "ee", "ih", "oh", "ou"]);

// Words as the voice tool splits them: whitespace tokens, punctuation trimmed.
function tokenize(text) {
  const items = [];
  for (const raw of text.match(/\S+/g) || []) {
    const m = /^([("']*)(.*?)([.,!?;:)"'…—]*)$/u.exec(raw);
    const core = m[2];
    if (core) items.push({ text: core, display: raw, trail: m[3] });
  }
  return items;
}

export function fixtureLine(text, voice = "fixture") {
  let t = 0.05;
  const words = [];
  const visemes = [];
  for (const w of tokenize(text)) {
    const letters = w.text.toLowerCase().replace(/[^a-z0-9]/g, "") || "a";
    const dur = 0.09 + 0.06 * letters.length;
    const start = t;
    const step = dur / letters.length;
    [...letters].forEach((ch, i) => {
      const v = VISEME_OF[ch] || (/[0-9]/.test(ch) ? "ee" : "cdg");
      visemes.push([round(start + i * step), round(start + (i + 1) * step), v, VOWEL.has(v) ? 1 : 1]);
    });
    t = start + dur;
    words.push({ text: w.display, start: round(start), end: round(t) });
    const pause = /[.!?]/.test(w.trail) ? 0.32 : /[,;:—]/.test(w.trail) ? 0.18 : 0.04;
    if (pause > 0.1) visemes.push([round(t), round(t + pause), "sil", 1]);
    t += pause;
  }
  const duration = round(t + 0.15);
  const n = Math.ceil(duration * 100) + 1;
  const values = [];
  for (let i = 0; i < n; i++) {
    const s = i / 100;
    const inWord = words.some((w) => s >= w.start && s < w.end);
    values.push(inWord ? round(0.55 + 0.35 * Math.abs(Math.sin(i * 0.37))) : 0.02);
  }
  return { text, voice, duration, sampleRate: 24000, words, visemes, envelope: { fps: 100, values }, fixture: true };
}

// Write <out>/<id>.json, index.json and lines.js for a script.json, as the
// voice tool does (without WAV files).
export function writeFixtureVoice(scriptFile, out) {
  const spec = JSON.parse(readFileSync(scriptFile, "utf8"));
  mkdirSync(out, { recursive: true });
  const bundle = {};
  const index = [];
  for (const line of spec.lines) {
    const meta = fixtureLine(line.text, spec.voice || "fixture");
    writeFileSync(path.join(out, `${line.id}.json`), JSON.stringify(meta));
    bundle[line.id] = meta;
    index.push({ id: line.id, duration: meta.duration, text: line.text });
  }
  writeFileSync(path.join(out, "index.json"), JSON.stringify(index, null, 1));
  writeFileSync(path.join(out, "lines.js"), "window.AVATAR_LINES = " + JSON.stringify(bundle) + ";\n");
  return index;
}
