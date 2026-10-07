// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Rules of the repository's files (DESIGN.md "Principles" and "Licence",
// CLAUDE.md "Rules"): runtime code is a pure function of timeline time,
// scenes and the core take colours from tokens only, every source file
// carries the SPDX lines, every JSON file parses, the library names no
// consuming project, and the plugin's version follows the package's.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { REPO, walkFiles } from "./helpers.mjs";

// Every file of the repository without generated ones (helpers.mjs mirrors
// .gitignore), as paths with forward slashes.
const FILES = walkFiles(REPO).map((f) => f.split(path.sep).join("/"));
const text = (f) => readFileSync(path.join(REPO, f), "utf8");
const ext = (f) => path.extname(f);
const SOURCE = new Set([".js", ".mjs", ".cjs", ".py", ".css", ".yml", ".yaml", ".sh"]);
const TEXT = new Set([...SOURCE, ".json", ".md", ".html", ".svg", ".txt", ".toml"]);
const isText = (f) => TEXT.has(ext(f)) || ["LICENSE", "NOTICE", "gitignore", ".gitignore"].includes(path.basename(f));

// Runtime directories: what pages load and run per frame.
const RUNTIME = (f) => /^core\/[^/]+\.js$/.test(f) || /^(rigs|parts|scenes)\//.test(f) || /^avatars\/[^/]+\/parts\//.test(f);
const RUNTIME_JS = FILES.filter((f) => RUNTIME(f) && ext(f) === ".js");
const RUNTIME_CSS = FILES.filter((f) => (/^(core|scenes|formats)\//.test(f) || RUNTIME(f)) && ext(f) === ".css");

// Code without comments; strings stay, so this is for searching only.
const stripComments = (s, lang) => {
  let out = s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  if (lang === "js") out = out.replace(/^([ \t]*)\/\/.*$/gm, "$1");
  return out;
};
// Offenders as "file:line: text".
function grep(files, re, lang) {
  const hits = [];
  for (const f of files) {
    stripComments(text(f), lang)
      .split("\n")
      .forEach((line, i) => {
        if (re.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
  }
  return hits;
}

test("the scan sees the repository", () => {
  for (const f of ["core/episode.js", "rigs/svg/rig.js", "scenes/talk/talk.css", "voice/avatar_voice.py", "cli/avatars.mjs", "package.json", "DESIGN.md"]) assert.ok(FILES.includes(f), f);
  assert.ok(RUNTIME_JS.length > 20, `${RUNTIME_JS.length} runtime scripts`);
  assert.ok(!FILES.some((f) => f.startsWith("node_modules/") || f.includes("/vendor/")), "generated files are left out");
});

describe("runtime code is a pure function of timeline time", () => {
  test("no clocks, randomness, timers, animation frames or network in core, rigs, parts and scenes", () => {
    const FORBIDDEN = /\bMath\.random\b|\bDate\.now\b|\bnew Date\b|\bperformance\.now\b|\bsetTimeout\b|\bsetInterval\b|\brequestAnimationFrame\b|\brequestIdleCallback\b|\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bgetRandomValues\b/;
    assert.deepEqual(grep(RUNTIME_JS, FORBIDDEN, "js"), []);
  });

  test("no CSS animations or transitions", () => {
    assert.deepEqual(grep(RUNTIME_CSS, /@keyframes|\banimation(-name)?\s*:|(^|[;{\s])transition(-[a-z]+)?\s*:/, "css"), []);
  });
});

describe("colours come from tokens", () => {
  // Hex colours, colour functions and named colours. transparent and
  // currentColor are not theme colours.
  const NAMED = "white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|maroon|navy|teal|aqua|cyan|magenta|fuchsia|lime|olive|gold|brown|indigo|violet";
  const HEX = /(?<![\w&$-])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
  const FUNC = /(?<![\w.-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;
  // In scripts only inside strings: Avatars.tokens.color() and helpers named
  // color are not colours.
  const JS_FUNC = /["'`][^"'`\n]*\b(?:rgba?|hsla?|hwb|oklab|oklch)\(/;
  const CSS_NAMED = new RegExp(`:[^;{}]*\\b(?:${NAMED})\\b`, "i");
  const JS_NAMED = new RegExp(`["'\`](?:${NAMED})["'\`]`, "i");

  test("no colour literals in the CSS of core/ and scenes/", () => {
    const css = FILES.filter((f) => /^(core|scenes)\//.test(f) && ext(f) === ".css");
    assert.ok(css.length >= 8, css.join(", "));
    const hits = [];
    for (const f of css) {
      // Only declarations: selectors such as #captions are not colours.
      const blocks = [...stripComments(text(f), "css").matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
      for (const decls of blocks) {
        for (const d of decls.split(";")) {
          const value = d.slice(d.indexOf(":") + 1);
          if (d.includes(":") && (HEX.test(value) || FUNC.test(value) || CSS_NAMED.test(`:${value}`))) hits.push(`${f}: ${d.trim()}`);
        }
      }
    }
    assert.deepEqual(hits, []);
  });

  test("no colour literals in the scripts of core/ and scenes/, except the colour parser in core/tokens.js", () => {
    const js = FILES.filter((f) => /^(core|scenes)\//.test(f) && ext(f) === ".js" && f !== "core/tokens.js");
    assert.deepEqual(grep(js, HEX, "js"), []);
    assert.deepEqual(grep(js, JS_FUNC, "js"), []);
    assert.deepEqual(grep(js, JS_NAMED, "js"), []);
  });
});

describe("files", () => {
  test("every source file starts with the SPDX lines of DESIGN.md (after a shebang)", () => {
    const COPYRIGHT = "SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>";
    const LICENSE = "SPDX-License-Identifier: Apache-2.0";
    const sources = FILES.filter((f) => SOURCE.has(ext(f)));
    assert.ok(sources.length > 50, `${sources.length} source files`);
    const bad = [];
    for (const f of sources) {
      let lines = text(f).split("\n");
      if (lines[0].startsWith("#!")) lines = lines.slice(1);
      // The first comment lines: // and # lines, or a /* */ block.
      const head = lines.slice(0, 4).filter((l) => /^\s*(\/\/|#|\/\*|\*)/.test(l));
      const has = (s) => head.some((l) => l.includes(s));
      if (!has(COPYRIGHT) || !has(LICENSE) || !/^\s*(\/\/|#|\/\*)/.test(lines[0])) bad.push(f);
    }
    assert.deepEqual(bad, []);
  });

  test("every JSON file parses", () => {
    const json = FILES.filter((f) => ext(f) === ".json");
    assert.ok(json.length > 50, `${json.length} JSON files`);
    const bad = [];
    for (const f of json) {
      try {
        JSON.parse(text(f));
      } catch (e) {
        bad.push(`${f}: ${e.message}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  test("no file names a consuming project", () => {
    // Built from parts, so this file does not match itself.
    const NAME = new RegExp(`\\b${"si"}nd\\b`, "i");
    const PRODUCT = new RegExp(`${"sl"}urm`, "i");
    const ORG = new RegExp(`\\b${"g"}si\\b`, "i");
    const EMAIL = new RegExp(`d\\.klein@${"g"}si\\.de`, "gi");
    const hits = [];
    for (const f of FILES.filter((f) => isText(f) && f !== "package-lock.json")) {
      text(f)
        .split("\n")
        .forEach((line, i) => {
          const at = `${f}:${i + 1}: ${line.trim().slice(0, 100)}`;
          if (NAME.test(line)) hits.push(at);
          // The HPC pronunciation pack names the scheduler; nothing else may.
          else if (PRODUCT.test(line) && f !== "lexicons/en-us/hpc.json") hits.push(at);
          else if (ORG.test(line.replace(EMAIL, ""))) hits.push(at);
        });
    }
    assert.deepEqual(hits, []);
  });
});

describe("package", () => {
  const pkg = JSON.parse(text("package.json"));

  test("the Claude Code plugin has the package's version", () => {
    const plugin = JSON.parse(text(".claude-plugin/plugin.json"));
    assert.equal(plugin.version, pkg.version);
    const market = JSON.parse(text(".claude-plugin/marketplace.json"));
    assert.ok(market.plugins.some((p) => p.name === plugin.name), "the marketplace lists the plugin");
  });

  test("every path the package ships exists, and the command has a shebang", () => {
    for (const entry of pkg.files) {
      const literal = entry.replace(/\/\*.*$/, "");
      assert.ok(FILES.some((f) => f === literal || f.startsWith(`${literal}/`)), `files entry ${entry}`);
    }
    for (const bin of Object.values(pkg.bin)) assert.match(text(bin), /^#!\/usr\/bin\/env node\n/, bin);
  });
});
