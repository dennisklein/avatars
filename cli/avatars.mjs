#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// The avatars command line: one entry point for a project's episodes, from a
// template to the published video (DESIGN.md, "CLI"). The commands are thin;
// their work lives in cli/lib/.
//
// Exit codes: 0 success, 1 a failure (printed as "avatars: <message>"),
// 2 a usage error.
import path from "node:path";
import { parseArgs } from "node:util";
import { bundleFiles, writeVendor } from "./lib/bundle.mjs";
import { checkEpisode } from "./lib/check.mjs";
import { ciEpisode } from "./lib/ci.mjs";
import { writeFixtureVoice } from "./lib/fixture-voice.mjs";
import { DEMO, buildGallery } from "./lib/gallery.mjs";
import { renderHash } from "./lib/hash.mjs";
import { episodeIds, findProjectRoot, isFile, loadProject, resolveEpisode } from "./lib/project.mjs";
import { publishEpisode } from "./lib/publish.mjs";
import { hyperframes } from "./lib/run.mjs";
import { SHEET_MODES, renderSheet } from "./lib/sheet.mjs";
import { UNSAFE_CHARS, isSafeText, newEpisode, newProject } from "./lib/templates.mjs";
import { packageManifests, projectManifests, uniqueItems, validateItems } from "./lib/validate.mjs";
import { refreshVendor } from "./lib/vendor.mjs";
import { castVoiceFiles, narrationProblem, phonemes, voiceEpisode, voiceSetup } from "./lib/voice.mjs";

const USAGE = `usage: avatars <command> [options] [--project DIR]

  new project DIR [--title T]          a project from the template
  new episode ID [--title T]           an episode from the template
  vendor ID...                         write episodes/<id>/vendor/
  voice ID... [--force]                narration through the voice tool
  voice-setup                          download and prepare the voice model
  phonemes ID... [--flagged]           how the narration will be pronounced
  fixture-voice ID...                  synthetic narration without TTS
  lint ID...                           HyperFrames lint
  check ID... [--quick]                timeline, warnings, narration, grounding,
                                       project checks, lint, contact sheets
  render ID... [--draft]               renders/<id>.mp4 with burned-in captions
  publish ID... [--static DIR] [--data DIR]
                                       web MP4, poster, WebVTT captions, manifest
  hash ID...                           the render hash, as <id>-<hash>
  ci ID... --store DIR [--used FILE]   render on a cache miss, then publish
  validate                             schema validation of every manifest
  gallery --out DIR [--theme T]        avatar sheets and demo contact sheets
  sheet AVATAR [--look L] [--mode expr|visemes|gaze|big] [--theme T] -o PNG
                                       one avatar sheet

--all instead of ids selects every episode. The project is --project DIR, else
the nearest directory with avatars.json at or above the working directory.`;

class UsageError extends Error {}

function parse(argv) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        project: { type: "string" },
        all: { type: "boolean" },
        quick: { type: "boolean" },
        draft: { type: "boolean" },
        force: { type: "boolean" },
        flagged: { type: "boolean" },
        static: { type: "string" },
        data: { type: "string" },
        store: { type: "string" },
        used: { type: "string" },
        out: { type: "string" },
        output: { type: "string", short: "o" },
        look: { type: "string" },
        mode: { type: "string" },
        theme: { type: "string" },
        title: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (e) {
    throw new UsageError(e.message);
  }
}

// The project of --project, else the nearest one; null where it is optional.
function projectOf(opt, required = true) {
  if (opt.project || required) return loadProject(opt.project);
  return findProjectRoot(process.cwd()) ? loadProject() : null;
}

// Episode ids from the arguments or --all; each must have the file the
// command needs (narration can be voiced before the composition exists).
function idsOf(project, opt, targets, needs) {
  if (opt.all && targets.length) throw new UsageError("pass episode ids or --all, not both");
  const has = (id) => isFile(path.join(project.episodesDir, id, needs));
  if (opt.all) {
    const ids = episodeIds(project).filter(has);
    if (!ids.length) throw new Error(`no episodes with ${needs} in ${project.episodesDir}`);
    return ids;
  }
  if (!targets.length) throw new UsageError("name one or more episodes, or pass --all");
  for (const id of targets) {
    if (!has(id)) throw new Error(`no episode ${id} (expected ${path.join(project.episodesDir, id, needs)})`);
  }
  return targets;
}

function requireVoiced(dir, id) {
  const problem = narrationProblem(dir, id);
  if (problem) throw new Error(problem);
}

const relTo = (project, p) => path.relative(project.root, p) || ".";
// Relative to the working directory unless that climbs out of it.
const shownPath = (p) => {
  const rel = path.relative(process.cwd(), p);
  return !rel || rel.startsWith("..") || path.isAbsolute(rel) ? p : rel;
};
const outDirs = (project, opt) => {
  const pub = project.config.publish || {};
  const dir = (flag, key) => (flag ? path.resolve(flag) : path.resolve(project.root, pub[key] || "publish"));
  return { static: dir(opt.static, "static"), data: dir(opt.data, "data") };
};

async function main(argv) {
  const { values: opt, positionals } = parse(argv);
  const [cmd, ...targets] = positionals;
  if (opt.help || cmd === "help") {
    console.log(USAGE);
    return 0;
  }
  if (!cmd) throw new UsageError("");

  switch (cmd) {
    case "new": {
      const [kind, arg, ...rest] = targets;
      if (!arg || rest.length || !["project", "episode"].includes(kind)) throw new UsageError("new project DIR, or new episode ID");
      if (opt.title != null && !isSafeText(opt.title)) throw new UsageError(`--title must not contain ${UNSAFE_CHARS}`);
      if (kind === "project") {
        const root = newProject(arg, { title: opt.title });
        console.log(`created ${path.relative(process.cwd(), root) || "."}`);
      } else {
        const project = projectOf(opt);
        const dir = newEpisode(project, arg, { title: opt.title });
        console.log(`created ${relTo(project, dir)}`);
      }
      return 0;
    }
    case "voice-setup": {
      if (targets.length) throw new UsageError("voice-setup takes no arguments");
      const project = projectOf(opt, false);
      voiceSetup(project ? castVoiceFiles(project) : []);
      return 0;
    }
    case "validate": {
      if (targets.length) throw new UsageError("validate takes no arguments");
      const project = projectOf(opt, false);
      const items = [...packageManifests()];
      // The demo project is part of the package.
      if (isFile(path.join(DEMO, "avatars.json"))) items.push(...projectManifests(loadProject(DEMO)));
      if (project) items.push(...projectManifests(project));
      const list = uniqueItems(items);
      const problems = validateItems(list);
      for (const p of problems) console.error(`${shownPath(p.file)}: ${p.message}`);
      console.log(`validate: ${list.length} files, ${problems.length} ${problems.length === 1 ? "problem" : "problems"}`);
      return problems.length ? 1 : 0;
    }
    case "sheet": {
      const out = opt.output || opt.out;
      if (targets.length !== 1 || !out) throw new UsageError("sheet AVATAR [--look L] [--mode M] [--theme T] -o PNG");
      const mode = opt.mode || "expr";
      if (!SHEET_MODES.includes(mode)) throw new UsageError(`--mode is one of ${SHEET_MODES.join(", ")}`);
      await renderSheet(projectOf(opt, false), { avatar: targets[0], look: opt.look, theme: opt.theme, mode, out: path.resolve(out) });
      return 0;
    }
    case "gallery": {
      const out = opt.out || opt.output;
      if (targets.length || !out) throw new UsageError("gallery --out DIR");
      const { failures } = await buildGallery(projectOf(opt, false), out, { theme: opt.theme });
      return failures.length ? 1 : 0;
    }
  }

  const NEEDS = { voice: "script.json", phonemes: "script.json", "fixture-voice": "script.json" };
  const KNOWN = ["vendor", "voice", "phonemes", "fixture-voice", "lint", "check", "render", "publish", "hash", "ci"];
  if (!KNOWN.includes(cmd)) throw new UsageError(`unknown command "${cmd}"`);
  if (cmd === "ci" && !opt.store) throw new UsageError("ci needs --store DIR");
  const project = projectOf(opt);
  const ids = idsOf(project, opt, targets, NEEDS[cmd] || "index.html");
  let failed = 0;
  for (const id of ids) {
    const dir = path.join(project.episodesDir, id);
    switch (cmd) {
      case "vendor":
        writeVendor(dir, bundleFiles(resolveEpisode(project, id)));
        console.log(`vendor: ${relTo(project, dir)}`);
        break;
      case "voice":
        voiceEpisode(resolveEpisode(project, id), { force: opt.force });
        break;
      case "phonemes":
        phonemes(resolveEpisode(project, id), { flagged: opt.flagged });
        break;
      case "fixture-voice":
        writeFixtureVoice(path.join(dir, "script.json"), path.join(dir, "assets/voice"));
        console.log(`fixture voice: ${relTo(project, dir)}`);
        break;
      case "lint":
        refreshVendor(resolveEpisode(project, id));
        hyperframes(["lint"], dir);
        break;
      case "check":
        if (!(await checkEpisode(project, id, { quick: opt.quick }))) failed++;
        break;
      case "render": {
        refreshVendor(resolveEpisode(project, id));
        requireVoiced(dir, id);
        const out = path.join(project.rendersDir, `${id}.mp4`);
        hyperframes(["render", "-q", opt.draft ? "draft" : "standard", "-o", out], dir);
        break;
      }
      case "publish": {
        refreshVendor(resolveEpisode(project, id));
        requireVoiced(dir, id);
        await publishEpisode(dir, id, outDirs(project, opt));
        break;
      }
      case "hash":
        console.log(`${id}-${renderHash(resolveEpisode(project, id))}`);
        break;
      case "ci":
        await ciEpisode(project, id, { store: path.resolve(opt.store), used: opt.used && path.resolve(opt.used), out: outDirs(project, opt) });
        break;
    }
  }
  if (failed) throw new Error(`${failed} of ${ids.length} ${ids.length === 1 ? "episode" : "episodes"} failed the check`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    if (e instanceof UsageError) {
      if (e.message) console.error(`avatars: ${e.message}`);
      console.error(USAGE);
      process.exit(2);
    }
    console.error(`avatars: ${e.message}`);
    process.exit(1);
  }
);
