// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Child processes: HyperFrames through its own bin (never a bare npx, which
// could fetch another version), the voice tool through Python, and FFmpeg.
// Failures throw an Error whose message names the tool, so the command line
// prints one readable line instead of a stack trace.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { PKG } from "./project.mjs";

const require = createRequire(import.meta.url);

function settle(r, what, hint) {
  if (r.error) {
    if (r.error.code === "ENOENT") throw new Error(`${what}: command not found${hint ? `; ${hint}` : ""}`);
    throw new Error(`${what}: ${r.error.message}`);
  }
  if (r.status !== 0) {
    const why = r.signal ? `signal ${r.signal}` : `exit code ${r.status}`;
    const last = typeof r.stderr === "string" ? r.stderr.trim().split("\n").pop() : "";
    throw new Error(`${what} failed (${why})${last ? `: ${last}` : ""}`);
  }
  return r;
}

const envOf = (extra) => Object.assign({}, process.env, extra || {});

// Run with inherited output. opts: { cwd, env, what, hint }.
export function run(bin, args, opts = {}) {
  const r = spawnSync(bin, args, { cwd: opts.cwd, env: envOf(opts.env), stdio: "inherit" });
  settle(r, opts.what || path.basename(bin), opts.hint);
}

// Run and return stdout; stderr is passed through unless opts.quiet.
export function capture(bin, args, opts = {}) {
  const r = spawnSync(bin, args, {
    cwd: opts.cwd,
    env: envOf(opts.env),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", opts.quiet ? "pipe" : "inherit"],
  });
  settle(r, opts.what || path.basename(bin), opts.hint);
  return r.stdout;
}

// ---------------------------------------------------------- HyperFrames --
const HF_ENV = { HYPERFRAMES_NO_TELEMETRY: "1" };
let hfPackage = null;

function hyperframesPackage() {
  if (!hfPackage) {
    let file;
    try {
      file = require.resolve("hyperframes/package.json");
    } catch {
      throw new Error("hyperframes is not installed; run: npm ci");
    }
    hfPackage = { file, meta: JSON.parse(readFileSync(file, "utf8")) };
  }
  return hfPackage;
}

export function hyperframesBin() {
  const { file, meta } = hyperframesPackage();
  const bin = typeof meta.bin === "string" ? meta.bin : (meta.bin || {}).hyperframes;
  if (!bin) throw new Error(`${file} declares no "hyperframes" bin`);
  return path.join(path.dirname(file), bin);
}

export const hyperframesVersion = () => hyperframesPackage().meta.version;

// `hyperframes <args>` in a project directory, output inherited.
export function hyperframes(args, cwd) {
  run(process.execPath, [hyperframesBin(), ...args], { cwd: cwd || PKG, env: HF_ENV, what: `hyperframes ${args[0]}` });
}

export function hyperframesOutput(args, cwd) {
  return capture(process.execPath, [hyperframesBin(), ...args], { cwd: cwd || PKG, env: HF_ENV, what: `hyperframes ${args[0]}` });
}

// --------------------------------------------------------------- Python --
export const VOICE_TOOL = path.join(PKG, "voice", "avatar_voice.py");
export const python = () => process.env.AVATARS_PYTHON || "python3";
const PY_HINT = "set AVATARS_PYTHON to a Python 3.10 to 3.13 with voice/requirements.txt";

export function voiceTool(args) {
  run(python(), [VOICE_TOOL, ...args], { what: "the voice tool", hint: PY_HINT });
}

export function voiceToolOutput(args) {
  return capture(python(), [VOICE_TOOL, ...args], { what: "the voice tool", hint: PY_HINT, quiet: true });
}

// --------------------------------------------------------------- FFmpeg --
export function ffmpeg(args) {
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { what: "ffmpeg", hint: "install FFmpeg with libx264" });
}
