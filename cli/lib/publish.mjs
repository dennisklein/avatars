// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Publish an episode for a docs site: a web-sized MP4 without burned-in
// captions, a poster, WebVTT captions, and a JSON manifest with the
// presenter and the chapters (DESIGN.md, "CLI").
//
//   <static>/<id>.mp4, <id>.jpg, <id>.vtt     <data>/<id>.json
//
// The composition must end with Episode.create(...)...done(), which
// publishes window.__episode (id, title, duration, chapters, caption cues).
// This file is part of the render hash (hash.mjs): changing it re-renders
// every episode in CI.
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { launch, openEpisode } from "./browser.mjs";
import { ffmpeg, hyperframes } from "./run.mjs";

const POSTER_AT = 2.6; // seconds: past the intro's logo animation
const CRF = 28;

// Episode metadata, read from the composition outside the render runtime,
// and the presenter: the page's own, else the host of Avatars.data.cast.
export async function readEpisode(dir) {
  const browser = await launch();
  try {
    const { page, log } = await openEpisode(browser, dir);
    const got = await page.evaluate(() => {
      const A = window.Avatars;
      const host = A && A.data && A.data.cast && A.data.cast.host;
      return { ep: window.__episode || null, host: host ? { name: host.name || "", disclosure: host.disclosure || "" } : null };
    });
    if (!got.ep) throw new Error(`no window.__episode in ${path.join(dir, "index.html")}${log.errors.length ? `: ${log.errors.join("; ")}` : ""}`);
    const p = got.ep.presenter;
    const presenter = p ? { name: p.name || "", disclosure: p.disclosure || "" } : got.host;
    return { ep: got.ep, presenter };
  } finally {
    await browser.close();
  }
}

const stamp = (t) => {
  const ms = Math.round(t * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, "0");
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `${h}:${m}:${s}.${String(ms % 1000).padStart(3, "0")}`;
};

export function webVtt(cues) {
  const vtt = ["WEBVTT", ""];
  cues.forEach((c, i) => vtt.push(String(i + 1), `${stamp(c.start)} --> ${stamp(c.end)}`, c.text, ""));
  return vtt.join("\n");
}

export const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export function manifestOf(ep, bytes, presenter) {
  const manifest = { title: ep.title, duration: ep.duration, length: clock(ep.duration), bytes };
  if (presenter) manifest.presenter = presenter;
  manifest.chapters = ep.chapters.map((c) => ({ title: c.title, start: c.start, time: clock(c.start) }));
  return manifest;
}

// Publish the episode in `dir` as `id` into out = { static, data }.
// opts: { master } an existing master render to encode instead of rendering one.
export async function publishEpisode(dir, id, out, opts = {}) {
  const { ep, presenter } = await readEpisode(dir);
  if (ep.id && ep.id !== id) console.warn(`warning: ${id}: window.__episode.id is "${ep.id}"; publishing as "${id}"`);

  // Master render without burned-in captions (the player shows the WebVTT track).
  let master = opts.master;
  let tmp = null;
  if (!master) {
    tmp = mkdtempSync(path.join(tmpdir(), "avatars-"));
    master = path.join(tmp, "master.mp4");
    hyperframes(["render", "-q", "standard", "--variables", JSON.stringify({ captions: false }), "-o", master], dir);
  }
  try {
    mkdirSync(out.static, { recursive: true });
    mkdirSync(out.data, { recursive: true });
    const file = (ext) => path.join(out.static, `${id}.${ext}`);
    ffmpeg(["-i", master, "-c:v", "libx264", "-preset", "slow", "-tune", "animation", "-crf", String(CRF), "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", "-c:a", "aac", "-b:a", "96k", "-ac", "1", file("mp4")]);
    // The poster frame must exist in short episodes too.
    const posterAt = Math.min(POSTER_AT, Math.max(0, ep.duration - 0.5));
    ffmpeg(["-ss", String(posterAt), "-i", master, "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "3", file("jpg")]);
    writeFileSync(file("vtt"), webVtt(ep.cues));
    const manifest = manifestOf(ep, statSync(file("mp4")).size, presenter);
    writeFileSync(path.join(out.data, `${id}.json`), JSON.stringify(manifest, null, 2) + "\n");
    console.log(`published ${id}: ${clock(ep.duration)}, ${(manifest.bytes / 1048576).toFixed(1)} MB, ${ep.cues.length} cues, ${ep.chapters.length} chapters`);
    return manifest;
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}
