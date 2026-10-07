// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Runtime scripts in a Node vm, without a browser: the performer warns once
// per unknown mood and shows it as neutral (DESIGN.md "Performer and pose"),
// and the terminal scene highlights its marks in the raw text, one span per
// match, so marks never nest or match inside markup or entities.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import vm from "node:vm";
import { REPO } from "./helpers.mjs";

// A context with the runtime files loaded in bundle order, the tokens the
// terminal reads, and console.warn recorded.
function runtime() {
  const warnings = [];
  const ctx = vm.createContext({ console: { log() {}, warn: (m) => warnings.push(String(m)) } });
  ctx.globalThis = ctx;
  ctx.Avatars = { data: { tokens: { "terminal.cps": 32, "terminal.blink": 2, "terminal.ff-hold": 1.8 } }, scenes: { register() {} } };
  for (const f of ["core/determinism.js", "core/tokens.js", "core/planner.js", "core/captions.js", "core/performer.js", "scenes/terminal/terminal.js"]) {
    vm.runInContext(readFileSync(path.join(REPO, f), "utf8"), ctx, { filename: f });
  }
  return { A: ctx.Avatars, S: ctx.Scenes, warnings };
}

describe("performer", () => {
  test("an unknown mood shows as neutral and warns once per name", () => {
    const { A, warnings } = runtime();
    const p = A.performer.create({
      expressions: [{ t: 0, name: "neutral" }, { t: 1, name: "hapy" }, { t: 2, name: "hapy" }, { t: 3, name: "happy" }, { t: 4, name: "toString" }],
    });
    assert.deepEqual(warnings, ['mood "hapy" is unknown and shows as neutral', 'mood "toString" is unknown and shows as neutral']);
    // Rounded: a blend from neutral to neutral leaves float noise.
    const expr = (t) => Object.fromEntries(Object.entries(p.exprAt(t)).map(([k, v]) => [k, Math.round(v * 1e9) / 1e9]));
    assert.deepEqual(expr(2.5), expr(0.5), "hapy looks like neutral");
    assert.deepEqual(expr(4.5), expr(0.5), "an inherited object key is no mood");
  });

  test("the library's moods and the cast's own moods do not warn", () => {
    const { A, warnings } = runtime();
    const names = [...Object.keys(A.performer.MOODS), "sleepy"];
    A.performer.create({ expressions: names.map((name, i) => ({ t: i, name })), moods: { sleepy: { eye: 0.3 } } });
    assert.deepEqual(warnings, []);
  });
});

describe("terminal marks", () => {
  // The HTML of the first line of a terminal with these steps at time t.
  const firstLine = (steps, t = 2) => {
    const { S } = runtime();
    const body = { innerHTML: "" };
    S.terminal({ querySelector: (s) => (s === ".term-body" ? body : null) }, steps, {})(t);
    return body.innerHTML.split("</div>")[0] + "</div>";
  };
  const out = (text, ...marks) => firstLine([{ at: 0, out: text }, ...marks.map((mark) => ({ at: 1, mark }))]);
  const line = (html) => `<div class="term-line term-out">${html}</div>`;
  const hl = (html) => `<span class="term-hl">${html}</span>`;

  test("one mark highlights every match and escapes the text", () => {
    assert.equal(out("x <y> & y y", "y"), line(`x &lt;${hl("y")}&gt; &amp; ${hl("y")} ${hl("y")}`));
    assert.equal(out("x <y> z", "<y>"), line(`x ${hl("&lt;y&gt;")} z`));
    assert.equal(out("a.b (c) [d] a+b", "(c)", "a+b"), line(`a.b ${hl("(c)")} [d] ${hl("a+b")}`), "marks are text, not patterns");
    assert.equal(firstLine([{ at: 0, out: "x y" }, { at: 1, mark: "y" }], 0.5), line("x y"), "not before the mark's time");
  });

  test("several marks give one span per match, never one inside another", () => {
    assert.equal(out("status: active class A", "active", "class"), line(`status: ${hl("active")} ${hl("class")} A`));
    assert.equal(out("storageclass standard", "standard", "class"), line(`storage${hl("class")} ${hl("standard")}`));
    assert.equal(out("a b", "a", "a"), line(`${hl("a")} b`), "a repeated mark");
    assert.equal(out("abc", "b", "abc"), line(hl("abc")), "the longer mark first");
  });

  test("a mark never matches inside an entity", () => {
    assert.equal(out("a & b", "amp"), line("a &amp; b"));
    assert.equal(out("x < y", "lt"), line("x &lt; y"));
  });
});
