// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Pages in Chrome: every avatar and look of the package builds a presenter in
// every theme and renders frames that depend only on time; the demo episodes
// render the same DOM in any seek order (cli/tools/frame-diff.mjs); a render
// worker that starts inside back-to-back moves renders what one from 0
// renders; the format's shots stay as they are and the intro ignores `shot`;
// `avatars check --quick` passes on the demo and on a project made from the
// template, and reports what scenes, moods, the wordmark and stale narration
// warn or fail about.
// The suites share one browser; they skip when no browser is found
// (HYPERFRAMES_BROWSER_PATH, the Playwright headless shell, google-chrome).
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { DEMO, REPO, copyProject, findBrowser, fixture, outputOf, pythonAvailable, runCli, runNode, suiteDir } from "./helpers.mjs";

const BROWSER = findBrowser();
// The CLI's own browser lookup and every child process use the same one.
if (BROWSER) process.env.HYPERFRAMES_BROWSER_PATH = BROWSER;
const SKIP = BROWSER ? false : "no browser: set HYPERFRAMES_BROWSER_PATH or run npx hyperframes browser ensure (AVATARS_TEST_BROWSER=0 skips on purpose)";
const FRAME_DIFF = path.join(REPO, "cli", "tools", "frame-diff.mjs");
const THEMES = readdirSync(path.join(REPO, "themes")).sort();

// A mono 16-bit WAV of silence, seconds long at 24 kHz.
function silentWav(seconds) {
  const data = Math.round(seconds * 24000) * 2;
  const b = Buffer.alloc(44 + data);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + data, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(24000, 24);
  b.writeUInt32LE(48000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(data, 40);
  return b;
}

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
    const [{ STABLE_ARGS, launch, openEpisode }, sheet, project, gallery, voice] = await Promise.all(
      ["browser.mjs", "sheet.mjs", "project.mjs", "gallery.mjs", "voice.mjs"].map((m) => import(`../cli/lib/${m}`))
    );
    lib = { openEpisode, ...sheet, ...project, ...gallery, voiceKeys: voice.voiceKeys };
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
    // Wardrobe's 2 s step puts neighbouring frames inside one caption phrase,
    // so state left over from a later frame of the same phrase shows. The
    // tour, twice as long, keeps a coarse step within the time budget.
    for (const [id, step] of [["wardrobe", 2], ["tour", 15]]) {
      test(`${id} renders the same DOM in any seek order`, () => {
        const r = runNode(FRAME_DIFF, [id, "--project", root, "--step", String(step)], { timeout: 300000 });
        assert.equal(r.status, 0, outputOf(r));
        assert.match(r.stdout, new RegExp(`^${id}: \\d+ frames`, "m"));
        assert.match(r.stdout, /identical in order|0 with a DOM that depends on the seek order/);
      });
    }
  });

  // Episodes that exercise edges of the runtime, in a project from the
  // template: moves of one element right after another, a shot set without a
  // move, and the warnings of scenes and the performer.
  describe("edge cases of the runtime", () => {
    let root;
    const LINES = [
      { id: "a", text: "Hello there. One two three four five." },
      { id: "b", text: "This is a slide with one bullet point here." },
      { id: "c", text: "Now a terminal, one command, without me." },
      { id: "d", text: "And some code with the bubble on the left side." },
      { id: "e", text: "Thanks for watching, see you soon!" },
    ];
    const FILE = Array.from({ length: 40 }, (_, i) => `key${i + 1}: value ${i + 1}`).join("\n");
    const bullet = (title) => ({ icon: "check", title });
    // Scene chains by episode id, between Episode.create(…) and .done().
    const EPISODES = {
      // Two scrolls of one code panel, half a second apart.
      scroll: `.intro({ title: "Scroll", say: "a" })
        .code({ chapter: "Code", title: "Code", file: "big.yaml", lang: "yaml", text: ${JSON.stringify(FILE)}, say: "d", marks: [{ line: 35, at: "d:some" }, { line: 2, at: "d:code" }] })
        .outro({ chapter: "Bye", say: "e" })`,
      // A slide without narration, shorter than a presenter move, then another shot.
      quick: `.intro({ title: "Quick", say: "a" })
        .talk({ chapter: "Talk", title: "Talk", say: "b" })
        .slide({ chapter: "Interlude", title: "Interlude" })
        .slide({ chapter: "Slide", title: "Slide", shot: "mini", say: "c" })
        .outro({ chapter: "Bye", say: "e" })`,
      // The intro ignores shot; the outro moves to left.
      shots: `.intro({ shot: "left", title: "Shots", say: "a" })
        .slide({ chapter: "Slide", title: "Slide", say: "b", bullets: [${JSON.stringify(bullet("x"))}] })
        .outro({ chapter: "Bye", say: "e" })`,
      // The same without shot.
      plain: `.intro({ title: "Shots", say: "a" })
        .slide({ chapter: "Slide", title: "Slide", say: "b", bullets: [${JSON.stringify(bullet("x"))}] })
        .outro({ chapter: "Bye", say: "e" })`,
      five: `.intro({ title: "Five", say: "a" })
        .slide({ chapter: "Slide", title: "Slide", say: "b", bullets: ${JSON.stringify(["One", "Two", "Three", "Four", "Five"].map(bullet))} })
        .outro({ chapter: "Bye", say: "e" })`,
      corner: `.intro({ title: "Corner", say: "a" })
        .terminal({ chapter: "Term", shot: "cornerL", say: "c", steps: [{ cmd: "ls", at: "c:one" }] })
        .code({ chapter: "Code", shot: "cornerL", title: "Code", file: "x.yaml", lang: "yaml", text: "a: 1", say: "d" })
        .outro({ chapter: "Bye", say: "e" })`,
      mood: `.intro({ title: "Mood", say: "a" })
        .talk({ chapter: "Talk", title: "Talk", say: { id: "b", mood: "exited", cues: { slide: "thinkin" } } })
        .outro({ chapter: "Bye", say: "e" })`,
    };
    before(() => {
      root = path.join(tmp.path, "edges");
      let r = runCli(["new", "project", root]);
      assert.equal(r.status, 0, outputOf(r));
      for (const [id, chain] of Object.entries(EPISODES)) {
        r = runCli(["new", "episode", id, "--project", root]);
        assert.equal(r.status, 0, outputOf(r));
        const dir = path.join(root, "episodes", id);
        writeFileSync(path.join(dir, "script.json"), JSON.stringify({ lines: LINES }, null, 2));
        const page = readFileSync(path.join(dir, "index.html"), "utf8");
        const create = `Episode.create({ tl, id: "${id}", title: "Edge", series: "Edge" })`;
        writeFileSync(path.join(dir, "index.html"), page.replace(/Episode\.create\([\s\S]*?\.done\(\);/, () => `${create}\n        ${chain}\n    .done();`));
      }
      const ids = Object.keys(EPISODES);
      for (const cmd of ["fixture-voice", "vendor"]) {
        r = runCli([cmd, ...ids, "--project", root]);
        assert.equal(r.status, 0, outputOf(r));
      }
    });
    const open = (id) => lib.openEpisode(browser, path.join(root, "episodes", id));

    // In the page: the spans in which a move of an element of `sels` starts
    // less than 0.1 s after the previous move of that element ends, or
    // before; there a `to` tween starts from what the previous one left.
    function moveSpans(sels) {
      const tl = window.__timelines.main;
      const els = new Set(sels.flatMap((s) => [...document.querySelectorAll(s)]));
      const moves = new Map();
      for (const tw of tl.getChildren(true, true, false)) {
        if (!(tw.duration() > 0)) continue;
        let start = tw.startTime();
        for (let p = tw.parent; p && p !== tl; p = p.parent) start += p.startTime();
        for (const el of tw.targets()) if (els.has(el)) (moves.get(el) || moves.set(el, []).get(el)).push([start, start + tw.duration()]);
      }
      const spans = [];
      for (const list of moves.values()) {
        list.sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < list.length; i++) if (list[i][0] < list[i - 1][1] + 0.1) spans.push([list[i - 1][0], Math.max(list[i - 1][1], list[i][1])]);
      }
      return spans.sort((a, b) => a[0] - b[0]);
    }
    // In the page, as a render worker: totalTime(0, true) once, then every
    // frame from `from` to `to`; the inline styles of `sels` from frame `keep` on.
    function worker(sels, from, to, keep) {
      const tl = window.__timelines.main;
      tl.pause();
      tl.totalTime(0, true);
      const out = {};
      for (let f = from; f <= to; f++) {
        tl.totalTime(f / 30);
        if (f >= keep) out[f] = sels.map((s) => [...document.querySelectorAll(s)].map((e) => e.getAttribute("style")).join(" | ")).join(" || ");
      }
      return out;
    }

    test("a render worker that starts inside back-to-back moves renders what one from 0 renders", async (t) => {
      for (const [id, sels] of [["scroll", [".code-lines"]], ["quick", [".presenter-frame", ".presenter-stage", ".presenter-ring"]]]) {
        await t.test(id, async () => {
          let { page } = await open(id);
          const spans = await page.evaluate(moveSpans, sels);
          assert.ok(spans.length > 0, "the episode has back-to-back moves");
          const first = Math.floor(spans[0][0] * 30);
          const last = Math.ceil(Math.max(...spans.map((s) => s[1])) * 30);
          const ref = await page.evaluate(worker, sels, 0, last, first);
          await page.close();
          const differ = [];
          for (const [a, b] of spans) {
            // A worker per chunk start, on a fresh page as HyperFrames' workers are.
            for (let start = Math.floor(a * 30); start <= Math.ceil(b * 30); start++) {
              ({ page } = await open(id));
              const got = await page.evaluate(worker, sels, start, Math.ceil(b * 30), start);
              await page.close();
              for (const [f, style] of Object.entries(got)) if (style !== ref[f]) differ.push(`from ${(start / 30).toFixed(3)} s, frame ${(f / 30).toFixed(3)} s`);
            }
          }
          assert.deepEqual(differ.slice(0, 5), [], `${differ.length} frames differ from a worker that starts at 0`);
        });
      }
    });

    test("shots stay as the format defines them, and the intro ignores shot", async () => {
      const format = JSON.parse(readFileSync(path.join(REPO, "formats", "landscape-1080p", "format.json"), "utf8"));
      // GSAP adds its tween settings to a vars object it is given, such as
      // its timeline as parent, which JSON shows as a string.
      const shots = (page) => page.evaluate(() => JSON.parse(JSON.stringify(Avatars.data.format.shots, (k, v) => (k === "parent" ? "a timeline" : v))));
      // In the page: the presenter frame's and stage's widths at the start,
      // middle and end of the last presenter move (the outro's, into left),
      // and their inline styles every 0.1 s.
      const presenter = () => {
        const tl = window.__timelines.main;
        const frame = document.querySelector(".presenter-frame");
        const stage = document.querySelector(".presenter-stage");
        const moves = tl.getChildren(true, true, false).filter((tw) => tw.duration() > 0 && tw.targets().includes(stage));
        const last = moves[moves.length - 1];
        const widths = (t) => {
          tl.totalTime(t);
          return [frame, stage].map((e) => e.getBoundingClientRect().width);
        };
        tl.pause();
        tl.totalTime(0, true);
        const move = [widths(last.startTime()), widths(last.startTime() + last.duration() / 2), widths(last.endTime())];
        const styles = [];
        for (let t = 0; t < tl.duration(); t += 0.1) {
          tl.totalTime(t);
          styles.push(`${t.toFixed(1)} s: ${frame.getAttribute("style")} | ${stage.getAttribute("style")}`);
        }
        return { move, styles };
      };
      const seen = {};
      for (const id of ["shots", "plain"]) {
        const { page } = await open(id);
        try {
          assert.deepEqual(await shots(page), format.shots, `${id}: after the timeline is built`);
          seen[id] = await page.evaluate(presenter);
          assert.deepEqual(await shots(page), format.shots, `${id}: after seeking`);
        } finally {
          await page.close();
        }
      }
      // The frame and the stage glide together into the outro's shot.
      for (const i of [0, 1]) {
        const [a, mid, b] = seen.shots.move.map((w) => w[i]);
        assert.ok(a !== b && Math.min(a, b) < mid && mid < Math.max(a, b), `${["frame", "stage"][i]} width ${a} → ${mid} → ${b}`);
      }
      const differ = seen.shots.styles.filter((st, i) => st !== seen.plain.styles[i]);
      assert.deepEqual(differ.slice(0, 3), [], `${differ.length} of ${seen.shots.styles.length} times differ from the episode without shot`);
    });

    test("check reports more than four bullets, the cornerL bubble over code and terminal, and unknown moods", () => {
      const r = runCli(["check", "five", "corner", "mood", "--quick", "--project", root], { timeout: 180000 });
      assert.equal(r.status, 0, outputOf(r));
      const warnings = r.stdout.split("\n").filter((l) => l.startsWith("  warning: console: "));
      assert.deepEqual(warnings.sort(), [
        '  warning: console: code x.yaml: the cornerL bubble covers the panels, which lay out for cornerR',
        '  warning: console: mood "exited" is unknown and shows as neutral',
        '  warning: console: mood "thinkin" is unknown and shows as neutral',
        '  warning: console: slide "Slide": 5 bullets; at most 4 fit above the captions',
        "  warning: console: terminal: the cornerL bubble covers the window, which lays out for cornerR",
      ]);
    });
  });

  describe("a project from the template", () => {
    let root;
    before(() => {
      root = path.join(tmp.path, "my-videos");
      let r = runCli(["new", "project", root, "--title", "My videos"]);
      assert.equal(r.status, 0, outputOf(r));
      r = runCli(["new", "episode", "second-steps", "--project", root]);
      assert.equal(r.status, 0, outputOf(r));
      r = runCli(["fixture-voice", "--all", "--project", root]);
      assert.equal(r.status, 0, outputOf(r));
    });
    const brand = () => path.join(root, "brand", "brand.json");

    test("new project, new episode, fixture-voice and check --quick pass", () => {
      const r = runCli(["check", "--all", "--quick", "--project", root], { timeout: 180000 });
      assert.equal(r.status, 0, outputOf(r));
      for (const id of ["hello", "second-steps"]) assert.match(r.stdout, new RegExp(`^${id}: 0 errors, \\d+ warnings?$`, "m"));
      // The template's wordmark fits beside the presenter.
      assert.doesNotMatch(r.stdout, /warning: wordmark/);
    });

    test("check warns about a wordmark that runs under the presenter", () => {
      const original = readFileSync(brand(), "utf8");
      writeFileSync(brand(), JSON.stringify(Object.assign(JSON.parse(original), { wordmark: "my-videos" })));
      try {
        const r = runCli(["check", "hello", "--quick", "--project", root]);
        assert.equal(r.status, 0, outputOf(r));
        assert.match(r.stdout, /^ {2}warning: wordmark "my-videos" runs under the presenter \(it ends at x=\d+, the presenter starts at x=1080\)/m);
      } finally {
        writeFileSync(brand(), original);
      }
    });

    // Voiced narration without the model: lines.js as the voice tool writes
    // it (each line's cache key as hash, no fixture flag) and silent WAVs.
    test("check reports a voiced line whose cache key changed", { skip: pythonAvailable() ? false : "needs python3 (or AVATARS_PYTHON) for the voice tool's keys" }, () => {
      const id = "second-steps";
      const dir = path.join(root, "episodes", id);
      const voice = path.join(dir, "assets", "voice");
      const script = path.join(dir, "script.json");
      const original = readFileSync(script, "utf8");
      const lines = JSON.parse(readFileSync(path.join(voice, "lines.js"), "utf8").replace(/^window\.AVATAR_LINES = /, "").replace(/;\s*$/, ""));
      const r0 = lib.resolveEpisode(lib.loadProject(root), id);
      const hash = lib.voiceKeys(r0);
      for (const [line, json] of Object.entries(lines)) {
        delete json.fixture;
        json.hash = hash[line];
        writeFileSync(path.join(voice, `${line}.wav`), silentWav(json.duration));
      }
      writeFileSync(path.join(voice, "lines.js"), `window.AVATAR_LINES = ${JSON.stringify(lines)};\n`);
      let r = runCli(["check", id, "--quick", "--project", root]);
      assert.equal(r.status, 0, outputOf(r));
      assert.match(r.stdout, new RegExp(`^${id}: 0 errors`, "m"));
      const spec = JSON.parse(original);
      spec.lines[1].lead = 1;
      writeFileSync(script, JSON.stringify(spec, null, 2));
      try {
        r = runCli(["check", id, "--quick", "--project", root]);
        assert.equal(r.status, 1, outputOf(r));
        assert.deepEqual(r.stderr.split("\n").filter((l) => l.startsWith("  error: ")), [`  error: line "${spec.lines[1].id}" is stale (its voice, lexicon entries or lead changed), run: avatars voice ${id}`]);
      } finally {
        writeFileSync(script, original);
      }
    });
  });
});
