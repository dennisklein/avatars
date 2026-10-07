// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// The command line (cli/avatars.mjs): exit codes and messages of usage
// errors and failures, and `avatars new` with the package's templates.
// Commands that load pages are covered by browser.test.mjs.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fontFaceProblems } from "../cli/lib/check.mjs";
import { loadProject, resolveEpisode } from "../cli/lib/project.mjs";
import { titleOf } from "../cli/lib/templates.mjs";
import { DEMO, copyProject, fixture, outputOf, runCli, tempDir, walkFiles } from "./helpers.mjs";

describe("exit codes", () => {
  test("help prints the usage and exits 0", () => {
    const r = runCli(["--help"]);
    assert.equal(r.status, 0, outputOf(r));
    assert.match(r.stdout, /^usage: avatars <command> \[options\] \[--project DIR\]/);
  });

  test("usage errors exit 2 with the message and the usage", () => {
    for (const [args, message] of [
      [[], null],
      [["frobnicate"], 'avatars: unknown command "frobnicate"'],
      [["hash", "--project", DEMO], "avatars: name one or more episodes, or pass --all"],
      [["hash", "tour", "--all", "--project", DEMO], "avatars: pass episode ids or --all, not both"],
      [["ci", "--all", "--project", DEMO], "avatars: ci needs --store DIR"],
      [["sheet", "sindy"], "avatars: sheet AVATAR [--look L] [--mode M] [--theme T] -o PNG"],
      [["sheet", "sindy", "--mode", "side", "-o", "x.png"], "avatars: --mode is one of expr, visemes, gaze, big"],
      [["new", "thing", "x"], "avatars: new project DIR, or new episode ID"],
      [["validate", "extra"], "avatars: validate takes no arguments"],
      [["vendor", "--bogus"], "avatars: Unknown option '--bogus'"],
    ]) {
      const r = runCli(args);
      assert.equal(r.status, 2, `${args.join(" ")}: ${outputOf(r)}`);
      if (message) assert.ok(r.stderr.startsWith(message), `${args.join(" ")}: ${r.stderr}`);
      assert.match(r.stderr, /usage: avatars <command>/);
    }
  });

  test("failures exit 1 with one line", (t) => {
    const empty = tempDir(t);
    for (const [args, re] of [
      [["vendor", "nope", "--project", DEMO], /^avatars: no episode nope \(expected .*index\.html\)\n$/],
      [["vendor", "--all"], /^avatars: no avatars\.json in the working directory or above; pass --project <dir>\n$/],
      [["vendor", "--all", "--project", fixture("broken")], /^avatars: no episodes with index\.html in .*\n$/],
    ]) {
      const r = runCli(args, { cwd: empty });
      assert.equal(r.status, 1, `${args.join(" ")}: ${outputOf(r)}`);
      assert.match(r.stderr, re, args.join(" "));
    }
  });

  test("an episode that does not resolve fails with the resolver's message", (t) => {
    const root = copyProject(fixture("studio"), path.join(tempDir(t), "studio"));
    // vendor needs an index.html to accept the episode.
    writeFileSync(path.join(root, "episodes", "two-tops", "index.html"), "<!doctype html>\n");
    const r = runCli(["vendor", "two-tops", "--project", root]);
    assert.equal(r.status, 1, outputOf(r));
    assert.equal(r.stderr, "avatars: kit/two-tops: parts tops/box-shirt and tops/box-vest are both tops\n");
  });
});

describe("avatars new", () => {
  const PLACEHOLDER = /\{\{(id|title|font-faces)\}\}/;

  test("titleOf turns an id into words", () => {
    assert.equal(titleOf("first-steps"), "First steps");
    assert.equal(titleOf("my_videos.v2"), "My videos v2");
  });

  test("new project copies the template, fills its placeholders and validates", (t) => {
    const root = path.join(tempDir(t), "my-videos");
    let r = runCli(["new", "project", root]);
    assert.equal(r.status, 0, outputOf(r));
    const files = walkFiles(root);
    for (const f of ["avatars.json", "package.json", ".gitignore", "README.md", "lexicon.json", "brand/brand.json", "brand/emblem.svg", "brand/emblem-badge.svg", "episodes/hello/script.json", "episodes/hello/index.html", "episodes/hello/hyperframes.json"]) {
      assert.ok(files.includes(f.split("/").join(path.sep)), `${f} in ${files.join(", ")}`);
    }
    assert.ok(!files.includes("gitignore"), "gitignore is renamed to .gitignore");
    for (const f of files) assert.doesNotMatch(readFileSync(path.join(root, f), "utf8"), PLACEHOLDER, f);
    assert.equal(JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).name, "my-videos");
    assert.equal(JSON.parse(readFileSync(path.join(root, "brand", "brand.json"), "utf8")).name, "My videos");
    // The page head declares exactly the theme's fonts.
    const project = loadProject(root);
    const ep = resolveEpisode(project, "hello");
    assert.deepEqual(fontFaceProblems(readFileSync(path.join(root, "episodes", "hello", "index.html"), "utf8"), ep.fonts, ep.config.theme), []);
    r = runCli(["validate", "--project", root]);
    assert.equal(r.status, 0, outputOf(r));
    // A second time into a directory that is not empty fails.
    r = runCli(["new", "project", root]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /exists and is not empty/);
  });

  test("new episode adds an episode with its id and title", (t) => {
    const root = path.join(tempDir(t), "videos");
    assert.equal(runCli(["new", "project", root, "--title", "Our videos"]).status, 0);
    let r = runCli(["new", "episode", "second-steps", "--project", root]);
    assert.equal(r.status, 0, outputOf(r));
    assert.equal(r.stdout, `created ${path.join("episodes", "second-steps")}\n`);
    const dir = path.join(root, "episodes", "second-steps");
    for (const f of ["script.json", "index.html", "hyperframes.json"]) assert.ok(existsSync(path.join(dir, f)), f);
    const page = readFileSync(path.join(dir, "index.html"), "utf8");
    assert.doesNotMatch(page, PLACEHOLDER);
    assert.match(page, /id: "second-steps", title: "Second steps"/);
    assert.doesNotMatch(readFileSync(path.join(dir, "script.json"), "utf8"), PLACEHOLDER);
    r = runCli(["new", "episode", "Second Steps", "--project", root]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /must be lowercase letters, digits, dots, dashes and underscores/);
    r = runCli(["new", "episode", "second-steps", "--project", root]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /already exists/);
    assert.equal(runCli(["validate", "--project", root]).status, 0);
  });
});
