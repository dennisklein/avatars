// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Keep an episode's vendor/ in step with the library and the project: every
// command that loads or renders a page rebuilds it first when any file
// differs from what `avatars vendor` would write. An unchanged vendor/ is
// left alone, so tools that watch the directory see no spurious changes.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { bundleFiles, writeVendor } from "./bundle.mjs";

function listFiles(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const rel = prefix + d.name;
    return d.isDirectory() ? listFiles(path.join(dir, d.name), `${rel}/`) : [rel];
  });
}

// Whether <dir>/vendor holds exactly these files ([relative path, contents]).
export function vendorFresh(dir, files) {
  const out = path.join(dir, "vendor");
  if (!existsSync(out)) return false;
  const want = new Map(files.map(([rel, body]) => [rel, Buffer.isBuffer(body) ? body : Buffer.from(body)]));
  const have = listFiles(out);
  if (have.length !== want.size) return false;
  return have.every((rel) => want.has(rel) && want.get(rel).equals(readFileSync(path.join(out, rel))));
}

// Rebuild the vendor/ of a resolved episode if it is stale; true if it was.
export function refreshVendor(r) {
  const files = bundleFiles(r);
  if (vendorFresh(r.dir, files)) return false;
  writeVendor(r.dir, files);
  return true;
}
