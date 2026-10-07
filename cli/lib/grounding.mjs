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
// a page line, both with trailing whitespace trimmed.
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

// Warnings for shown content ({ cmd } | { out, code? } with `at` seconds)
// that the pages do not contain. `when(t)` formats a time.
export function ungrounded(shown, pages, when = (t) => `${t}s`) {
  const text = pages.map((p) => p.text).join("\n");
  const lines = new Set(text.split("\n").map((l) => l.trimEnd()));
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
