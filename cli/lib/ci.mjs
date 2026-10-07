// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// `avatars ci`: what a docs workflow runs. It renders an episode only when
// <store>/<id>-<hash>/ does not exist yet, then copies the published files
// into the project's publish directories. The hash covers the episode and
// everything that can change its pixels or sound (hash.mjs), so a docs-only
// push re-renders nothing and a library change re-renders only the episodes
// it touches. --used appends every key, so the workflow can prune the rest.
import { appendFileSync, cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { renderHash } from "./hash.mjs";
import { resolveEpisode } from "./project.mjs";
import { MEDIA, publishEpisode } from "./publish.mjs";
import { refreshVendor } from "./vendor.mjs";
import { voiceEpisode } from "./voice.mjs";

// out = { static, data }: where the published files go.
export async function ciEpisode(project, id, { store, used, out }) {
  const r = resolveEpisode(project, id);
  const key = `${id}-${renderHash(r)}`;
  const entry = path.join(store, key);
  if (existsSync(path.join(entry, `${id}.json`))) {
    console.log(`${key}: cached`);
  } else {
    console.log(`${key}: rendering`);
    mkdirSync(store, { recursive: true });
    const tmp = `${entry}.tmp`;
    rmSync(tmp, { recursive: true, force: true });
    voiceEpisode(r);
    refreshVendor(r);
    await publishEpisode(r.dir, id, { static: tmp, data: tmp });
    // An entry without its manifest is a leftover of an interrupted run.
    rmSync(entry, { recursive: true, force: true });
    renameSync(tmp, entry);
  }
  mkdirSync(out.static, { recursive: true });
  mkdirSync(out.data, { recursive: true });
  for (const ext of MEDIA) cpSync(path.join(entry, `${id}.${ext}`), path.join(out.static, `${id}.${ext}`));
  cpSync(path.join(entry, `${id}.json`), path.join(out.data, `${id}.json`));
  if (used) appendFileSync(used, key + "\n");
  return key;
}
