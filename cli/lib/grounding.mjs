// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// The grounding check (DESIGN.md "Projects"): every terminal command, output
// line and code line an episode shows must appear on a page that embeds the
// episode, so what viewers see on screen is what they can copy from the page.
//
//   "grounding": { "sources": ["docs"], "embed": "{{< video \"{id}\" >}}" }
//
// Pages are the Markdown files under `sources` (relative to the project root)
// whose text contains `embed` with {id} replaced by the episode id. A command
// must occur somewhere in the pages' text; an output or code line must equal
// a page line, both with trailing whitespace trimmed. Lines of a fenced block
// also count without the block's common indentation, so a block nested in a
// list item matches unindented output.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const MARKDOWN = /\.(md|markdown)$/i;

// Markdown files under the given files or directories, sorted.
export function markdownFiles(root, sources) {
  const out = [];
  const walk = (p) => {
    const st = statSync(p);
    if (st.isFile()) {
      if (MARKDOWN.test(p)) out.push(p);
      return;
    }
    for (const d of readdirSync(p, { withFileTypes: true })) {
      if (d.name.startsWith(".") || d.name === "node_modules") continue;
      walk(path.join(p, d.name));
    }
  };
  for (const s of sources || []) {
    const p = path.resolve(root, s);
    if (existsSync(p)) walk(p);
  }
  return [...new Set(out)].sort();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The embed snippet as a pattern: whitespace may vary, and may be absent
// where it does not separate two words ({{<video "id">}} embeds too).
export function embedPattern(embed, id) {
  const parts = embed.split("{id}").map((chunk) =>
    chunk
      .split(/(\s+)/)
      .map((piece, i, all) => {
        if (!/^\s+$/.test(piece)) return escapeRe(piece);
        const before = all[i - 1] || "";
        const after = all[i + 1] || "";
        return /\w$/.test(before) && /^\w/.test(after) ? "\\s+" : "\\s*";
      })
      .join("")
  );
  return new RegExp(parts.join(escapeRe(id)));
}

// The pages that embed episode `id`: [{ file, text }].
export function groundingPages(root, grounding, id) {
  const re = embedPattern(grounding.embed, id);
  return markdownFiles(root, grounding.sources)
    .map((file) => ({ file, text: readFileSync(file, "utf8") }))
    .filter((p) => re.test(p.text));
}

const FENCE = /^(\s*)(`{3,}|~{3,})/;

// Every line of `text`, plus the lines of each fenced block with the block's
// common indentation removed, all with trailing whitespace trimmed.
export function pageLines(text) {
  const all = text.split("\n").map((l) => l.trimEnd());
  const lines = new Set(all);
  let block = null;
  const flush = () => {
    const body = block.lines.filter((l) => l.trim());
    const indent = Math.min(block.indent, ...body.map((l) => l.length - l.trimStart().length));
    if (indent > 0) for (const l of block.lines) lines.add(l.slice(Math.min(indent, l.length - l.trimStart().length)));
  };
  for (const l of all) {
    const m = FENCE.exec(l);
    if (block) {
      if (m && m[2][0] === block.fence[0] && m[2].length >= block.fence.length && !l.trim().slice(m[2].length)) {
        flush();
        block = null;
      } else block.lines.push(l);
    } else if (m) block = { fence: m[2], indent: m[1].length, lines: [] };
  }
  if (block) flush();
  return lines;
}

// Warnings for shown content ({ cmd } | { out, code? } with `at` seconds)
// that the pages do not contain. `when(t)` formats a time.
export function ungrounded(shown, pages, when = (t) => `${t}s`) {
  const text = pages.map((p) => p.text).join("\n");
  const lines = new Set(pages.flatMap((p) => [...pageLines(p.text)]));
  const out = [];
  for (const item of shown || []) {
    const at = typeof item.at === "number" ? `at ${when(item.at)}` : "";
    if (item.cmd != null && !text.includes(String(item.cmd).trimEnd())) out.push(`command not on the episode's pages ${at}: ${item.cmd}`);
    if (item.out == null) continue;
    for (const l of String(item.out).split("\n").map((x) => x.trimEnd()).filter(Boolean)) {
      if (!lines.has(l)) out.push(`${item.code ? `line of ${item.code}` : "output line"} not on the episode's pages ${at}: ${l}`);
    }
  }
  return out;
}
