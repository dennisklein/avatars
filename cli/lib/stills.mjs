// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Stills of an episode for eyes that cannot watch it: two per chapter, one
// mid-way and one fully built just before the next chapter, taken by
// `hyperframes snapshot` and laid out as contact sheets.
import { readdirSync, rmSync } from "node:fs";
import { hyperframes } from "./run.mjs";

export function stillTimes(ep) {
  return ep.chapters.flatMap((c, i) => {
    const end = i + 1 < ep.chapters.length ? ep.chapters[i + 1].start : ep.duration - 0.9;
    return [(c.start + end) / 2, end - 0.35].map((t) => Math.max(0, t));
  });
}

// Snapshots of the composition in `dir` at `times` into `out` (replaced);
// returns the contact sheet file names.
export function snapshot(dir, times, out) {
  rmSync(out, { recursive: true, force: true });
  hyperframes(["snapshot", "--no-end", "--describe", "false", "-o", out, "--at", times.map((t) => t.toFixed(2)).join(",")], dir);
  return readdirSync(out)
    .filter((f) => f.startsWith("contact-sheet"))
    .sort();
}
