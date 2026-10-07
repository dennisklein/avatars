// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Narration through the voice tool (voice/avatar_voice.py, DESIGN.md "Voice").
// A resolved episode's voice settings (the host's voice.json, the cast
// entry's preset, the merged lexicon files) become the tool's --voices, -v
// and --lexicon flags; narration goes to episodes/<id>/assets/voice/.
import { existsSync } from "node:fs";
import path from "node:path";
import { locate, readJson } from "./project.mjs";
import { voiceTool, voiceToolOutput } from "./run.mjs";

export function voiceFlags(voice) {
  const args = [];
  if (voice.voices) args.push("--voices", voice.voices);
  if (voice.preset) args.push("-v", voice.preset);
  for (const f of voice.lexicons || []) args.push("--lexicon", f);
  return args;
}

const scriptOf = (r) => path.join(r.dir, "script.json");

export function voiceEpisode(r, opts = {}) {
  const args = ["script", scriptOf(r), "-o", path.join(r.dir, "assets", "voice"), ...voiceFlags(r.voice)];
  if (opts.force) args.push("--force");
  voiceTool(args);
}

export function phonemes(r, opts = {}) {
  const args = ["phonemes", "-s", scriptOf(r), ...voiceFlags(r.voice)];
  if (opts.flagged) args.push("--flagged");
  voiceTool(args);
}

// { line id: cache key } of an episode's lines; {} for a script without lines.
// The keys depend on texts, presets and lexicon entries, never on paths.
export function voiceKeys(r) {
  const file = scriptOf(r);
  if (!existsSync(file)) return {};
  const spec = readJson(file);
  if (!Array.isArray(spec.lines) || !spec.lines.length) return {};
  const out = voiceToolOutput(["keys", file, ...voiceFlags(r.voice)]);
  try {
    return JSON.parse(out);
  } catch {
    throw new Error(`the voice tool printed no keys for ${file}: ${out.trim().slice(0, 200)}`);
  }
}

// The voice.json files of a project's cast, for `voice-setup`.
export function castVoiceFiles(project) {
  const files = [];
  for (const entry of Object.values(project.config.cast || {})) {
    if (!entry || !entry.avatar) continue;
    const hit = locate(project, `avatars/${entry.avatar}/avatar.json`);
    if (!hit) throw new Error(`cast avatar "${entry.avatar}" is in neither ${project.lib} nor the package`);
    const avatar = readJson(hit.path);
    if (!avatar.voice) continue;
    const f = path.join(path.dirname(hit.path), avatar.voice);
    if (!files.includes(f)) files.push(f);
  }
  return files;
}

export function voiceSetup(voiceFiles) {
  if (!voiceFiles.length) return voiceTool(["setup"]);
  for (const f of voiceFiles) voiceTool(["setup", "--voices", f]);
}
