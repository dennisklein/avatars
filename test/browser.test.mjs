// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Pages in Chrome: every avatar and look of the package builds a presenter in
// every theme and renders frames that depend only on time; the demo episodes
// render the same DOM in any seek order (cli/tools/frame-diff.mjs); `avatars
// check --quick` passes on the demo and on a project made from the template.
// The suites share one browser; they skip when no browser is found
// (HYPERFRAMES_BROWSER_PATH, the Playwright headless shell, google-chrome).
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { DEMO, REPO, copyProject, findBrowser, fixture, outputOf, runCli, runNode, suiteDir } from "./helpers.mjs";

const BROWSER = findBrowser();
// The CLI's own browser lookup and every child process use the same one.
if (BROWSER) process.env.HYPERFRAMES_BROWSER_PATH = BROWSER;
const SKIP = BROWSER ? false : "no browser: set HYPERFRAMES_BROWSER_PATH or run npx hyperframes browser ensure (AVATARS_TEST_BROWSER=0 skips on purpose)";
const FRAME_DIFF = path.join(REPO, "cli", "tools", "frame-diff.mjs");
const THEMES = readdirSync(path.join(REPO, "themes")).sort();

// In the page: a presenter with speech, moods, gaze and every gesture its
// base animates, rendered at times forward and backward. A frame is the
// presenter's whole SVG markup, hidden groups included: every attribute must
// follow from the pose at that time. Returns what the test asserts on.
function renderFrames() {
  const A = window.Avatars;
  const member = A.data.cast.host;
  const base = A.data.bases[member.base];
  const box = document.createElement("div");
  box.style.cssText = "width: 300px; height: 400px";
  document.body.appendChild(box);
  const p = A.createPresenter("host", box, {
    speech: { offset: 0.2, visemes: [[0, 0.3, "aa"], [0.3, 0.6, "oh"], [0.6, 0.9, "mbp"], [0.9, 1.4, "ee"], [1.4, 1.6, "nonsense"]] },
    expressions: [{ t: 0, name: "happy" }, { t: 1.5, name: "surprised" }, { t: 3, name: "wink" }, { t: 4.5, name: "concerned" }],
    gaze: [{ t: 0, x: -1, y: 0 }, { t: 2, x: 0.8, y: 0.4 }],
    gestures: (base.gestures || []).map((name) => ({ t: 0.5, name, dur: 2 })),
  });
  const times = [0, 0.35, 0.8, 1.6, 2.4, 3.3, 5.1, 9.7, 31.4];
  const shown = (n) => {
    const attrs = [...n.attributes].map((a) => ` ${a.name}="${a.value}"`).join("");
    return `<${n.tagName}${attrs}>${[...n.children].map(shown).join("")}</${n.tagName}>`;
  };
  const at = (t) => {
    p.render(t);
    return shown(p.svg);
  };
  const forward = times.map(at);
  const backward = [...times].reverse().map(at).reverse();
  const bbox = p.svg.getBBox();
  const pose = p.poseAt(1.6);
  return {
    frames: times.length,
    distinct: new Set(forward).size,
    sameBackward: forward.every((s, i) => s === backward[i]),
    nodes: p.svg.querySelectorAll("*").length,
    size: [bbox.width, bbox.height],
    canvas: base.canvas,
    poseKeys: Object.keys(pose).sort(),
    moods: Object.keys(A.performer.MOODS),
    visemes: Object.keys(A.performer.VISEMES),
    sheetMoods: new Set([...Object.keys(A.performer.MOODS), ...Object.keys(member.moods || {})]).size,
    sheet: window.__sheet,
  };
}

describe("in a browser", { skip: SKIP }, () => {
  let browser;
  let lib;
  const tmp = suiteDir(before, after, "avatars-browser-");
  before(async () => {
    // Imported here so a skipped run never loads puppeteer.
    const [{ STABLE_ARGS, launch, openEpisode }, sheet, project, gallery] = await Promise.all(
      ["browser.mjs", "sheet.mjs", "project.mjs", "gallery.mjs"].map((m) => import(`../cli/lib/${m}`))
    );
    lib = { openEpisode, ...sheet, ...project, ...gallery };
    browser = await launch({ args: STABLE_ARGS });
  });
  after(async () => {
    if (browser) await browser.close();
  });

  // Build a sheet, open it, render frames; assert a clean page.
  async function presenter(project, opts, mode = "expr") {
    const sheet = lib.buildSheet(project, opts);
    try {
      const { page, log } = await lib.openEpisode(browser, sheet.dir, { query: `mode=${mode}`, width: 1300, height: 900 });
      try {
        assert.deepEqual(log.errors, [], "page errors while loading");
        const result = await page.evaluate(renderFrames);
        assert.deepEqual(log.errors, [], "page errors");
        assert.deepEqual(log.warnings, [], "console warnings");
        assert.deepEqual(log.missing, [], "missing files");
        assert.deepEqual(log.network, [], "network requests");
        return { result, r: sheet.r };
      } finally {
        await page.close();
      }
    } finally {
      sheet.remove();
    }
  }
  const assertFrames = (result, what) => {
    assert.ok(result.sheet && result.sheet.cells > 0, `${what}: the sheet drew its cells`);
    assert.ok(result.nodes > 10, `${what}: ${result.nodes} SVG nodes`);
    assert.ok(result.size[0] > result.canvas[0] / 4 && result.size[1] > result.canvas[1] / 4, `${what}: drawn ${result.size.join("x")} on ${result.canvas.join("x")}`);
    assert.ok(result.distinct >= result.frames - 2, `${what}: ${result.distinct} distinct frames of ${result.frames}`);
    assert.ok(result.sameBackward, `${what}: a frame depends on the frames rendered before it`);
    // The vocabulary and the pose of DESIGN.md ("Performer and pose").
    assert.deepEqual(result.poseKeys, ["blink", "breath", "expr", "gaze", "gestures", "head", "headLag", "mouth", "t"]);
    assert.deepEqual(result.moods, ["neutral", "happy", "joy", "surprised", "thinking", "concerned", "smug", "wink"]);
    assert.deepEqual(result.visemes, "sil mbp aa ah ee ih oh ou fv th cdg sz ch l r w".split(" "));
  };

  describe("presenters", () => {
    test("every avatar and look of the package, in every theme, with the demo's brand marks", async (t) => {
      const demo = lib.loadProject(DEMO);
      const looks = lib.avatarLooks(null);
      assert.ok(looks.length >= 2, looks.map((l) => `${l.avatar}/${l.look}`).join(", "));
      for (const { avatar, look } of looks) {
        for (const theme of THEMES) {
          await t.test(`${avatar}/${look} in ${theme}`, async () => {
            const { result, r } = await presenter(demo, { avatar, look, theme });
            assert.equal(r.cast.host.look, look);
            assert.equal(r.config.theme, theme);
            assert.deepEqual(r.warnings, []);
            assert.equal(result.sheet.cells, result.sheetMoods, "one cell per mood");
            assertFrames(result, `${avatar}/${look}/${theme}`);
          });
        }
      }
    });

    test("an avatar without a project: no brand, so its emblem parts draw nothing", async () => {
      const { result, r } = await presenter(null, { avatar: "sindy" }, "big");
      assert.ok(r.warnings.length > 0, "the missing marks are reported");
      assertFrames(result, "sindy without a project");
      assert.equal(result.sheet.cells, 2);
    });

    test("a project-library avatar on its own base (test/fixtures/studio)", async () => {
      const { result, r } = await presenter(lib.loadProject(fixture("studio")), { avatar: "kit" }, "big");
      assert.equal(r.cast.host.base, "box-200x200");
      assertFrames(result, "kit");
    });
  });

  describe("the demo project", () => {
    let root;
    before(() => {
      root = copyProject(DEMO, path.join(tmp.path, "demo"));
      const r = runCli(["fixture-voice", "--all", "--project", root]);
      assert.equal(r.status, 0, outputOf(r));
    });

    test("avatars check --all --quick passes", () => {
      const r = runCli(["check", "--all", "--quick", "--project", root], { timeout: 180000 });
      assert.equal(r.status, 0, outputOf(r));
      for (const id of ["tour", "wardrobe"]) assert.match(r.stdout, new RegExp(`^${id}: 0 errors, \\d+ warnings?$`, "m"));
      // Only the reminder that fixture narration has no audio: no console
      // output, ignored gestures, clipped text, low contrast or ungrounded
      // terminal and code lines.
      const warnings = r.stdout.split("\n").filter((l) => l.startsWith("  warning: "));
      assert.deepEqual(warnings.filter((w) => !/lines have fixture narration without audio/.test(w)), []);
    });

    // Frames every few seconds plus every chapter start, in order, in
    // reverse and in order again: the DOM must not depend on the seek order.
    for (const [id, step] of [["wardrobe", 8], ["tour", 15]]) {
      test(`${id} renders the same DOM in any seek order`, () => {
        const r = runNode(FRAME_DIFF, [id, "--project", root, "--step", String(step)], { timeout: 300000 });
        assert.equal(r.status, 0, outputOf(r));
        assert.match(r.stdout, new RegExp(`^${id}: \\d+ frames`, "m"));
        assert.match(r.stdout, /identical in order|0 with a DOM that depends on the seek order/);
      });
    }
  });

  describe("a project from the template", () => {
    test("new project, new episode, fixture-voice and check --quick pass", () => {
      const root = path.join(tmp.path, "my-videos");
      let r = runCli(["new", "project", root, "--title", "My videos"]);
      assert.equal(r.status, 0, outputOf(r));
      r = runCli(["new", "episode", "second-steps", "--project", root]);
      assert.equal(r.status, 0, outputOf(r));
      r = runCli(["fixture-voice", "--all", "--project", root]);
      assert.equal(r.status, 0, outputOf(r));
      r = runCli(["check", "--all", "--quick", "--project", root], { timeout: 180000 });
      assert.equal(r.status, 0, outputOf(r));
      for (const id of ["hello", "second-steps"]) assert.match(r.stdout, new RegExp(`^${id}: 0 errors, \\d+ warnings?$`, "m"));
    });
  });
});
