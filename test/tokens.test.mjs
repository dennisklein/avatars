// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Design tokens (cli/lib/tokens.mjs and the runtime's core/tokens.js):
// merging in tier order, aliases, the alpha extension, errors for cycles and
// missing references, CSS names, colour parsing and WCAG contrast.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import vm from "node:vm";
import { compile, contrast, cssName, flatten, merge, parseColor, resolve, resolveRef, rgba, toCss } from "../cli/lib/tokens.mjs";
import { REPO } from "./helpers.mjs";

const tok = (value, extra = {}) => Object.assign({ $value: value }, extra);
const alpha = (a) => ({ $extensions: { avatars: { alpha: a } } });
const values = (...trees) => compile(trees.map((tree, i) => ({ tree, source: `tree${i}` }))).values;

describe("flatten and merge", () => {
  test("names nested groups with dots and skips $ keys of groups", () => {
    const all = flatten({ $description: "x", color: { $type: "color", bg: tok("#000000", { $type: "color" }), text: { strong: tok("#ffffff") } } }, "t");
    assert.deepEqual([...all.keys()], ["color.bg", "color.text.strong"]);
    assert.deepEqual(all.get("color.bg"), { value: "#000000", alpha: undefined, type: "color", source: "t" });
  });

  test("rejects a leaf that is neither a token nor a group", () => {
    assert.throws(() => flatten({ color: { bg: "#000000" } }, "theme.tokens.json"), /theme\.tokens\.json: color\.bg is not a token or group/);
    assert.throws(() => flatten({ size: [1, 2] }, "x"), /size is not a token or group/);
  });

  test("a later tree replaces an earlier token as a whole", () => {
    const all = merge([
      { tree: { a: tok("#000000", alpha(0.5)), b: tok(1) }, source: "one" },
      { tree: { a: tok("#ffffff") }, source: "two" },
    ]);
    assert.equal(all.get("a").value, "#ffffff");
    assert.equal(all.get("a").alpha, undefined, "the override drops the earlier alpha");
    assert.equal(all.get("a").source, "two");
    assert.equal(all.get("b").source, "one");
  });
});

describe("compile", () => {
  test("resolves alias chains, keeps numbers and sorts names", () => {
    const v = values({ z: tok("{y}"), y: tok("{x}"), x: tok("#0f172a"), n: tok(0.7), s: tok("26px") });
    assert.deepEqual(Object.keys(v), ["n", "s", "x", "y", "z"]);
    assert.equal(v.z, "#0f172a");
    assert.equal(v.n, 0.7);
    assert.equal(typeof v.n, "number");
    assert.equal(v.s, "26px");
  });

  test("only a whole-value reference is an alias", () => {
    const v = values({ a: tok("#123456"), shadow: tok("0 0 4px {a}"), padded: tok(" {a}") });
    assert.equal(v.shadow, "0 0 4px {a}");
    assert.equal(v.padded, " {a}");
  });

  test("records where each token came from", () => {
    const { origins } = compile([
      { tree: { a: tok(1), b: tok(2) }, source: "tokens/x.tokens.json" },
      { tree: { b: tok(3) }, source: "brand" },
    ]);
    assert.deepEqual(origins, { a: "tokens/x.tokens.json", b: "brand" });
  });

  test("aliases resolve after merging, so an override reaches every alias", () => {
    // Tier order: primitives, components, theme, brand.
    const v = values(
      { color: { teal: { 500: tok("#14b8a6") } } },
      { glow: { accent: tok("{color.accent}", alpha(0.28)) }, chapter: { dot: tok("{color.accent}") } },
      { color: { accent: tok("{color.teal.500}") } },
      { color: { accent: tok("#a00000") } }
    );
    assert.equal(v["color.accent"], "#a00000");
    assert.equal(v["chapter.dot"], "#a00000");
    assert.equal(v["glow.accent"], "rgba(160, 0, 0, 0.28)");
  });

  test("the alpha extension turns a colour into rgba()", () => {
    const v = values({
      hex: tok("#0f172a", alpha(0.5)),
      short: tok("#fff", alpha(0)),
      over8: tok("#ff000080", alpha(0.25)),
      fromRgb: tok("rgb(1, 2, 3)", alpha(1)),
      viaAlias: tok("{hex}", alpha(0.1)),
      kw: tok("black", alpha(0.6)),
    });
    assert.equal(v.hex, "rgba(15, 23, 42, 0.5)");
    assert.equal(v.short, "rgba(255, 255, 255, 0)");
    assert.equal(v.over8, "rgba(255, 0, 0, 0.25)");
    assert.equal(v.fromRgb, "rgba(1, 2, 3, 1)");
    assert.equal(v.viaAlias, "rgba(15, 23, 42, 0.1)", "an alias to an alpha token takes the colour, then its own alpha");
    assert.equal(v.kw, "rgba(0, 0, 0, 0.6)");
  });

  test("an alpha on a value that is not a colour is an error", () => {
    assert.throws(() => values({ size: tok("26px", alpha(0.5)) }), /token "size" \(tree0\) sets an alpha on "26px", which is not a colour/);
    assert.throws(() => values({ n: tok(3, alpha(0.5)) }), /sets an alpha on "3"/);
  });

  test("alias cycles are errors that name the cycle", () => {
    assert.throws(() => values({ a: tok("{b}"), b: tok("{c}"), c: tok("{a}") }), /token alias cycle: a -> b -> c -> a/);
    assert.throws(() => values({ self: tok("{self}") }), /token alias cycle: self -> self/);
  });

  test("a reference to an undefined token is an error that names the referrer", () => {
    assert.throws(() => values({ color: { bg: tok("{color.slate.950}") } }), /token "color\.slate\.950" is not defined \(referenced by color\.bg in tree0\)/);
  });
});

describe("references, CSS names and CSS", () => {
  test("resolveRef resolves a token reference and passes other values through", () => {
    const v = { "color.accent": "#14b8a6" };
    assert.equal(resolveRef("{color.accent}", v), "#14b8a6");
    assert.equal(resolveRef("{ color.accent }", v), "#14b8a6");
    assert.equal(resolveRef("#ffffff", v), "#ffffff");
    assert.equal(resolveRef(3, v), 3);
    assert.throws(() => resolveRef("{color.nope}", v, "palette role top.trim"), /palette role top\.trim: token "color\.nope" is not defined/);
  });

  test("cssName writes --av- and dots as dashes", () => {
    assert.equal(cssName("color.text-muted"), "--av-color-text-muted");
    assert.equal(cssName("color.slate.900"), "--av-color-slate-900");
    assert.equal(cssName("font.mono-advance"), "--av-font-mono-advance");
  });

  test("toCss writes one sorted custom property per token on :root", () => {
    const css = toCss({ "window.bar-height": "58px", "color.bg": "#0f172a", "motion.shot": 0.9 });
    assert.equal(css, ":root {\n  --av-color-bg: #0f172a;\n  --av-motion-shot: 0.9;\n  --av-window-bar-height: 58px;\n}\n");
  });
});

describe("colours", () => {
  test("parseColor reads hex, rgb(), rgba() and three keywords", () => {
    assert.deepEqual(parseColor("#0f172a"), { r: 15, g: 23, b: 42, a: 1 });
    assert.deepEqual(parseColor("#ABC"), { r: 170, g: 187, b: 204, a: 1 });
    assert.deepEqual(parseColor("#abcd"), { r: 170, g: 187, b: 204, a: 0.867 });
    assert.deepEqual(parseColor("#ff000080"), { r: 255, g: 0, b: 0, a: 0.502 });
    assert.deepEqual(parseColor(" rgb(1, 2, 3) "), { r: 1, g: 2, b: 3, a: 1 });
    assert.deepEqual(parseColor("rgba(94, 234, 212, 0.75)"), { r: 94, g: 234, b: 212, a: 0.75 });
    assert.deepEqual(parseColor("rgb(1 2 3 / 50%)"), { r: 1, g: 2, b: 3, a: 0.5 });
    assert.deepEqual(parseColor("White"), { r: 255, g: 255, b: 255, a: 1 });
    assert.deepEqual(parseColor("black"), { r: 0, g: 0, b: 0, a: 1 });
    assert.deepEqual(parseColor("transparent"), { r: 0, g: 0, b: 0, a: 0 });
  });

  test("parseColor returns null for what it does not read", () => {
    for (const s of ["#12345", "#1234567", "#ggg", "red", "hsl(0, 0%, 0%)", "26px", "", "{color.bg}", "none"]) assert.equal(parseColor(s), null, s);
  });

  test("rgba keeps or replaces the alpha", () => {
    assert.equal(rgba({ r: 1, g: 2, b: 3, a: 0.5 }), "rgba(1, 2, 3, 0.5)");
    assert.equal(rgba({ r: 1, g: 2, b: 3, a: 0.5 }, 0), "rgba(1, 2, 3, 0)");
  });

  test("contrast follows WCAG 2", () => {
    assert.equal(contrast("#000000", "#ffffff"), 21);
    assert.equal(contrast("#ffffff", "#000000"), 21);
    assert.equal(contrast("#777777", "#777777"), 1);
    // Reference values of the WCAG formula.
    assert.ok(Math.abs(contrast("#767676", "#ffffff") - 4.54) < 0.01);
    assert.ok(Math.abs(contrast("#777777", "#ffffff") - 4.48) < 0.01);
    assert.ok(Math.abs(contrast("#e2e8f0", "#0f172a") - 14.48) < 0.01);
  });

  test("contrast composites a translucent background over `over`, then the text over that", () => {
    // Half-transparent white over black is the grey halfway in sRGB, as a
    // browser blends it.
    assert.equal(contrast("#ffffff", "rgba(255, 255, 255, 0.5)", "#000000"), contrast("#ffffff", "rgb(127.5, 127.5, 127.5)"));
    // Without `over`, black is the backdrop.
    assert.equal(contrast("#ffffff", "transparent"), 21);
    assert.equal(contrast("#ffffff", "transparent", "#ffffff"), 1);
    // Translucent text mixes with the background it sits on.
    assert.equal(contrast("rgba(255, 255, 255, 0)", "#000000"), 1);
  });

  test("contrast needs two colours", () => {
    assert.throws(() => contrast("26px", "#000000"), /contrast needs colours, got "26px" and "#000000"/);
  });
});

describe("runtime tokens (core/tokens.js)", () => {
  // core/tokens.js is a classic script for the page; run it in a context
  // whose global object stands in for window.
  const load = (tokens) => {
    const ctx = vm.createContext({ Avatars: { data: { tokens } } });
    vm.runInContext(readFileSync(path.join(REPO, "core", "tokens.js"), "utf8"), ctx, { filename: "core/tokens.js" });
    return ctx.Avatars.tokens;
  };

  test("get, num, color and has read Avatars.data.tokens", () => {
    const T = load({ "color.accent": "#14b8a6", "window.bar-height": "58px", "motion.shot": 0.9, "font.sans": "\"Inter\", sans-serif" });
    assert.equal(T.get("color.accent"), "#14b8a6");
    assert.equal(T.num("window.bar-height"), 58);
    assert.equal(T.num("motion.shot"), 0.9);
    assert.equal(T.color("color.accent"), "rgba(20, 184, 166, 1)");
    assert.equal(T.color("color.accent", 0.25), "rgba(20, 184, 166, 0.25)");
    assert.equal(T.has("color.accent"), true);
    assert.equal(T.has("color.nope"), false);
    assert.throws(() => T.get("color.nope"), /token "color\.nope" is not defined/);
    assert.throws(() => T.num("font.sans"), /not a number/);
    assert.throws(() => T.color("font.sans"), /not a colour/);
    assert.equal(T.values["motion.shot"], 0.9);
  });

  test("its colour parser agrees with the CLI's", () => {
    const T = load({});
    const samples = ["#0f172a", "#ABC", "#abcd", "#ff000080", "rgb(1, 2, 3)", "rgba(94, 234, 212, 0.75)", "rgb(1 2 3 / 50%)", "white", "BLACK", "transparent", "#12345", "red", "26px"];
    for (const s of samples) assert.deepEqual(T.parse(s) && { ...T.parse(s) }, parseColor(s), s);
  });
});

describe("resolve", () => {
  test("is the same as compile without origins", () => {
    const trees = [{ tree: { a: tok("{b}"), b: tok("#000") }, source: "x" }];
    assert.deepEqual(resolve(merge(trees)), compile(trees).values);
  });
});
