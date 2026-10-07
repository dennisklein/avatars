# Pitfalls

Roadblocks met while building and porting this pipeline, and their fixes.

## Local setup

- **Python 3.14**: `pip install` fails with "No matching distribution found
  for kokoro-onnx==0.6.1", because kokoro-onnx supports Python 3.10 to 3.13.
  Create the virtual environment from 3.12, as the GitHub action does.
- **pip refuses the system Python** ("externally-managed-environment", PEP
  668, for example on Ubuntu 24.04): use a virtual environment and activate
  it in every new shell before `voice`, `phonemes`, `hash` or `ci`, which run
  `python3`, or set `AVATARS_PYTHON=.venv/bin/python`.
- **FFmpeg without libx264**: HyperFrames and the web encode need it; check
  with `ffmpeg -hide_banner -encoders | grep libx264`. Fedora's default
  `ffmpeg-free` lacks it (enable RPM Fusion, then
  `sudo dnf swap ffmpeg-free ffmpeg --allowerasing`), and mise's `ffmpeg`
  comes from conda and may lack it too. Pitched voice presets also need the
  `rubberband` filter (`ffmpeg -hide_banner -filters | grep rubberband`).
- **`hyperframes doctor` shows ✗** for whisper-cpp, TTS (Kokoro) and
  MusicGen: optional HyperFrames features this library does not use. The
  Kokoro check is about `hyperframes tts`, not the voice tool. It also
  offers a newer HyperFrames; the library pins its version, which is part of
  every render hash, so upgrade it only with the library.
- **`npx avatars` outside a project** can fetch an unrelated npm package
  named `avatars`. Run it in a project after `npm install`, or name the
  package: `npx --package github:dennisklein/avatars#semver:^0.1 avatars …`.
  A project's npm scripts run its own installed `avatars`, and the GitHub
  action calls `node <package>/cli/avatars.mjs` directly.
- **Hugo**: the shortcode needs 0.128 or later; distribution packages are
  often older. Use a release binary (the standard edition is enough).
- **No video on a local docs page**: the shortcode renders nothing until
  `avatars publish` or `avatars ci` has written the files. That is intended.

## Cloud sessions

- No Docker daemon and no GPU: renders use software GL on the CPU and take a
  few times the video's length on 4 vCPUs, which is fine for the SVG rig.
  When the CPU is shared, render or check one episode at a time.
- Egress proxies may block huggingface.co, jsDelivr, unpkg, hosted
  text-to-speech APIs, hyperframes.heygen.com and api.github.com. That is why
  the voice model comes from the kokoro-onnx release on GitHub and GSAP and
  the fonts from npm.
- `npx hyperframes browser ensure` may work there; otherwise point
  `HYPERFRAMES_BROWSER_PATH` at a preinstalled headless Chrome, such as
  `/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell`.
- Playwright's open-source Chromium cannot decode H.264, so a docs page
  tested there shows a spinner instead of playing the video. Chrome,
  Firefox, Safari and Edge play it.
- The agent cannot listen: voice, pronunciation and pacing need a human ear.

## Authoring episodes

- Nothing may be fetched at render time. HyperFrames' own templates load
  GSAP from jsDelivr; episodes load `vendor/` and `assets/voice/lines.js`
  instead, and `check` reports every network request as an error.
- HyperFrames' lint reads only inline scripts, so each page creates the
  paused timeline, passes it to `Episode.create({ tl })` and registers it on
  `window.__timelines` itself; otherwise lint reports a missing timeline and
  no duration source.
- Outside the HyperFrames runtime `window.__timelines` does not exist, so
  tools that load a composition directly (`check`, `publish`, the sheets)
  define it before the page's scripts run.
- The root has no `data-duration`: the length comes from the clock tween
  that spans the episode. The narration's `<audio>` elements are mixed into
  the render, and each needs an `id` (the planner names them `vo-<line>`).
- Named fonts need an `@font-face` rule with a local file, or lint complains
  (`font_family_without_font_face`). Use `var(--av-font-sans)` and
  `var(--av-font-mono)`, and keep the head's rules exactly the theme's.
- Literal colours in a page's styles do not follow the theme: under a light
  theme a hard-coded dark panel becomes a grey box with unreadable text.
  Style custom content with `var(--av-…)` tokens, and use `Avatars.tokens`
  in GSAP tweens.
- A cue prefix that matches several words picks the first and logs a
  warning; a cue word ends at `#`, `+` or `-`, so a hyphenated word is cued
  by its first part.
- Terminal output and code must match the docs page. When the page changes,
  update the episode in the same change; `check` lists what no longer
  matches. Grounding compares whole lines with their leading whitespace;
  only a fenced block's common indentation (a block nested in a list item)
  is ignored.
- Hugo runs shortcodes even inside code fences, so a Hugo page cannot show
  a line that contains one, such as the grounding snippet of `avatars.json`,
  in a code block an episode is checked against: escaping it as
  `{{</* … */>}}` stops Hugo from running it but changes the line that
  grounding compares.
- Never crossfade stacked features with opacity (the eyes looked ghosted);
  squash them shut and swap opaque states instead.
- Lip sync: tune `lipKernel` and `lipGain` with `cli/tools/mouth-stats.mjs`;
  a median opening of about 0.3 reads well.
- Parallel render workers: if a frame flashes at a worker boundary, find the
  state that depends on seek order with `cli/tools/frame-diff.mjs`, and
  confirm with `npx hyperframes render --workers 1` in the episode
  directory.

## Voice

- The upstream Kokoro ONNX export returns audio only; `setup` exposes the
  duration predictor (`/encoder/Gather_output_0`) as a `duration` output. If
  a new export renames that tensor, `setup` stops with an error naming it.
- espeak misreads commands, acronyms and jargon, and reads a lone "a" as the
  letter (`en-us/core` fixes that one). Fix recurring words in a lexicon,
  and write numbers, flags and paths in the script the way they should be
  spoken.
- Kokoro silently drops phoneme symbols outside its vocabulary; build lexicon
  entries from symbols `phonemes` prints.
- The model reads at most 510 phonemes, about 50 words, at once and splits
  longer lines where the intonation can start over: keep lines short.
- The cache key does not cover the espeak-ng version or FFmpeg's
  `rubberband`; after upgrading either, `avatars voice <id> --force`.
- `fixture-voice` replaces voiced timing files, so the next `voice` run
  voices every line again.

## Rendering and comparing frames

- **Raster noise depends on seek history.** The headless shell sometimes
  rasterises a 1-pixel column on a moving edge (a push transition's seam,
  often along 256-pixel tile rows) or the anti-aliasing of curved edges (the
  presenter ring, the ahoge) differently, depending on which frames were
  drawn before, even with `--disable-partial-raster`. The same page compared
  with itself in another seek order shows it, and a fresh seek of the flagged
  frame shows no difference. Compare renders frame by frame only when both
  were drawn in the same order, or accept single-column seam differences;
  `frame-diff` compares the DOM as well and reports pixel-only differences as
  raster noise without failing.
- **The first frame.** On a fresh page HyperFrames runs `totalTime(0, true)`,
  after which seeking to 0 does nothing, so frame 0 lacks the background grid
  and glow that frame 1 has: a one-frame flash at the start of every render.
  The poster is taken at 2.6 s, so published posters are unaffected.
- **Hidden scenes.** While a scene is hidden, its transform depends on the
  seek order (a later push parks it off-screen only after it has rendered
  once). It never reaches pixels, which is why `frame-diff` compares only
  visible state.
- **Brand marks with ids.** Marks are inserted as markup, and the intro, the
  emblem patch and the hair clip draw them several times on one page, so a
  mark whose gradients or clips are referenced by id repeats those ids and
  may draw with another copy's definitions. Keep marks self-contained and
  without ids.
