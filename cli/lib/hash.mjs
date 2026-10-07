// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// The render hash (DESIGN.md "CLI"): what identifies a render of an episode.
// It covers the episode's own files, the vendored bundle, the voice cache keys
// of its lines, the HyperFrames version and the publish module, so a library
// change re-renders exactly the episodes whose bundle or voice it changes.
// Nothing in it depends on where the project or this package are checked out.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundleFiles } from "./bundle.mjs";
import { hyperframesVersion } from "./run.mjs";
import { voiceKeys } from "./voice.mjs";

// Part of every hash: change it when the same inputs should render anew.
const VERSION = "avatars-render/1";
const PUBLISH = fileURLToPath(new URL("./publish.mjs", import.meta.url));
// Generated or local-only paths inside an episode: skipped by name anywhere,
// or by their path from the episode directory.
const SKIP_NAMES = new Set(["node_modules", "vendor", "renders", "snapshots", ".hyperframes"]);
const SKIP_PATHS = new Set(["assets/voice"]);

// The episode's own files, as sorted paths relative to its directory.
export function episodeFiles(dir, prefix = "") {
  if (!existsSync(dir)) return [];
  const out = readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const rel = prefix + d.name;
    if (SKIP_NAMES.has(d.name) || SKIP_PATHS.has(rel)) return [];
    if (d.isDirectory()) return episodeFiles(path.join(dir, d.name), `${rel}/`);
    return d.isFile() ? [rel] : [];
  });
  return out.sort();
}

export function renderHash(r) {
  const h = createHash("sha256");
  const field = (name, body) => {
    h.update(`${name}\0`);
    h.update(body);
    h.update("\0");
  };
  field("version", VERSION);
  for (const rel of episodeFiles(r.dir)) field(`episode/${rel}`, readFileSync(path.join(r.dir, rel)));
  for (const [rel, body] of bundleFiles(r)) field(`vendor/${rel}`, body);
  field("voice", JSON.stringify(voiceKeys(r)));
  field("hyperframes", hyperframesVersion());
  field("publish", readFileSync(PUBLISH));
  return h.digest("hex").slice(0, 16);
}
