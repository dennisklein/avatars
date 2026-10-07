// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Shared helpers of the test suites: paths, temporary directories that a test
// removes when it ends, copies of the package and of projects (tests never
// write into the repository), the command line as a child process, and the
// tools a suite may need (a browser, Python).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CLI = path.join(REPO, "cli", "avatars.mjs");
export const DEMO = path.join(REPO, "examples", "demo");
export const FIXTURES = path.join(REPO, "test", "fixtures");
export const fixture = (name) => path.join(FIXTURES, name);

// Generated, local-only or bulky paths (the .gitignore entries and the
// repository's own metadata) that copies and repository scans leave out.
export const GENERATED = new Set(["node_modules", ".git", "vendor", "snapshots", "renders", ".hyperframes", "__pycache__", "publish"]);
const GENERATED_PATHS = [`assets${path.sep}voice`, `gallery${path.sep}out`];
export const isGenerated = (rel) => rel.split(path.sep).some((s) => GENERATED.has(s)) || GENERATED_PATHS.some((p) => rel === p || rel.endsWith(`${path.sep}${p}`));

// A temporary directory removed when the test with context `t` ends.
export function tempDir(t, prefix = "avatars-test-") {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A temporary directory of a suite, made by a before() hook and removed by an
// after() hook, so a run that filters the suite's tests out leaves nothing.
// Call it in the suite's body with node:test's before and after; the
// directory is `.path` once the suite runs.
export function suiteDir(before, after, prefix = "avatars-test-") {
  const dir = { path: null };
  before(() => {
    dir.path = mkdtempSync(path.join(tmpdir(), prefix));
  });
  after(() => {
    if (dir.path) rmSync(dir.path, { recursive: true, force: true });
  });
  return dir;
}

// A copy of a directory without its generated files, such as a project
// (examples/demo or a fixture) at dst.
export function copyProject(src, dst) {
  cpSync(src, dst, {
    recursive: true,
    filter: (p) => {
      const rel = path.relative(src, p);
      return !rel || !isGenerated(rel);
    },
  });
  return dst;
}

// A copy of this package at dst, as a second checkout would be: the sources
// without tests and tool metadata, sharing the installed node_modules.
export function copyPackage(dst) {
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(REPO, { withFileTypes: true })) {
    if (GENERATED.has(e.name) || [".claude", "test"].includes(e.name)) continue;
    copyProject(path.join(REPO, e.name), path.join(dst, e.name));
  }
  symlinkSync(path.join(REPO, "node_modules"), path.join(dst, "node_modules"), "dir");
  return dst;
}

// Run the command line (or another script) of this package or of a copy.
// Returns { status, stdout, stderr }.
export function runNode(script, args, opts = {}) {
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: opts.cwd || tmpdir(),
    env: Object.assign({}, process.env, { HYPERFRAMES_NO_TELEMETRY: "1" }, opts.env || {}),
    encoding: "utf8",
    timeout: opts.timeout || 120000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
export const runCli = (args, opts = {}) => runNode(opts.cli || CLI, args, opts);

// The output of a failed run, for assertion messages.
export const outputOf = (r) => `exit ${r.status}\n--- stdout\n${r.stdout}\n--- stderr\n${r.stderr}`;

// The Python that runs the voice tool, if it runs at all.
export function pythonAvailable() {
  const r = spawnSync(process.env.AVATARS_PYTHON || "python3", ["--version"], { encoding: "utf8" });
  return !r.error && r.status === 0;
}

function onPath(name) {
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    const p = path.join(dir, name);
    if (dir && existsSync(p)) return p;
  }
  return null;
}

// A Chrome to run browser suites with: HYPERFRAMES_BROWSER_PATH, the
// Playwright headless shell, or google-chrome on PATH; null if none (or if
// AVATARS_TEST_BROWSER=0), so the suites skip instead of letting HyperFrames
// download one.
export function findBrowser() {
  if (process.env.AVATARS_TEST_BROWSER === "0") return null;
  const env = process.env.HYPERFRAMES_BROWSER_PATH;
  if (env && existsSync(env)) return env;
  const root = "/opt/pw-browsers";
  if (existsSync(root)) {
    // The newest build first.
    const builds = readdirSync(root).filter((d) => /^chromium_headless_shell-\d+$/.test(d));
    for (const d of builds.sort((a, b) => b.split("-")[1] - a.split("-")[1])) {
      const p = path.join(root, d, "chrome-linux", "headless_shell");
      if (existsSync(p)) return p;
    }
  }
  return onPath("google-chrome");
}

// Every file under a directory as paths relative to it, without generated
// files and without following symbolic links.
export function walkFiles(root, rel = "") {
  const out = [];
  for (const e of readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const p = rel ? path.join(rel, e.name) : e.name;
    if (isGenerated(p)) continue;
    if (e.isDirectory()) out.push(...walkFiles(root, p));
    else if (e.isFile()) out.push(p);
  }
  return out.sort();
}
