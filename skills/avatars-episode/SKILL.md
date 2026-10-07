---
name: avatars-episode
description: Make or update a tutorial video episode with the avatars library (episodes/<id>/ in a project that has avatars.json) — scope, storyboard, script.json narration, the index.html chain of scene calls, acting, grounding in the project's pages, voice, check and contact sheets, render and review, custom scenes and per-episode overrides in episode.json. Use whenever someone asks for a video, episode, screencast or tutorial clip, wants an existing episode changed (pacing, scenes, terminal output, narration, acting, look, theme), or edits a page, command or file that an episode embeds or shows, because the episode must change with it.
---

# Make or update an episode

An episode is a short screencast and slideshow hybrid presented by an avatar,
the cast's `host`. It lives in `episodes/<id>/` of a project, the directory
with `avatars.json`. Only these files are written by hand:

- `script.json`: the narration, one entry per line: `{ "id", "text" }`.
- `index.html`: the composition, a chain of scene calls on the Episode
  builder.
- `episode.json` (optional): per-episode overrides of cast, theme, format and
  tokens.

`hyperframes.json` comes from the template and stays as it is. Everything
else is generated and git-ignored: `vendor/` (the library bundle),
`assets/voice/` (narration audio and timings), `snapshots/`, `renders/` and
the publish directories. Rendered files are never committed.

The library provides the mechanics; the project decides the content.

## Read first

- **The project's own instructions**: its `CLAUDE.md`, a video README or a
  project skill. They name the series, ids, titles and lengths, the pages
  episodes belong on, the intro and outro conventions, review rules and
  commit conventions. Where they and this skill differ, the project wins.
- `avatars.json` (cast, theme, `grounding`, `checks`) and one existing
  episode of the project, as the model of its conventions.
- The host's character bible, `CHARACTER.md` (how the avatar talks, which
  mood fits what), and the README of every scene you use. Both ship with the
  installed library:

  ```bash
  AV=$(node -p 'path.dirname(require.resolve("@dennisklein/avatars/package.json"))')
  ls "$AV/scenes"                       # intro talk slide diagram code terminal outro
  cat "$AV/scenes/terminal/README.md"   # options, presenter shot, transition, tokens
  cat "$AV/avatars/<avatar>/CHARACTER.md"
  ```

  An avatar or scene of the project itself lives in `library/avatars/<id>/`
  or `library/scenes/<id>/` instead.
- The `avatars-voice` skill, for writing and checking the narration.

Commands below are `npx avatars …`, run from the project root (`--project
DIR` from elsewhere); `npx avatars --help` lists them all.

## Setup

Once per machine or cloud session:

```bash
npm ci                                       # the library, HyperFrames, GSAP
AV=$(node -p 'path.dirname(require.resolve("@dennisklein/avatars/package.json"))')
python3 --version                            # the voice tool needs 3.10 to 3.13
pip install -r "$AV/voice/requirements.txt"  # in a venv if pip refuses the system Python
npx avatars voice-setup                      # the Kokoro model, about 350 MB, once
npx hyperframes browser ensure               # or export HYPERFRAMES_BROWSER_PATH=<chrome>
ffmpeg -hide_banner -encoders | grep libx264
```

The CLI runs the voice tool with `python3`; `AVATARS_PYTHON=.venv/bin/python`
names another one. `AVATARS_VOICE_CACHE` points at a model set up elsewhere
(default `~/.cache/avatars-voice`). Without the model,
`npx avatars fixture-voice <id>` writes narration with plausible timings and
no audio: enough for layout work and `check`, not for a render. It replaces
voiced timings, so the next `voice` run voices every line again.

## New episode

### 1. Read the source and decide the scope

The video complements the page or document it explains; it does not replace
it. Pick the happy path and the 3 to 6 moments a newcomer should see (a
concept, the main commands, the result), and leave flag tables, edge cases
and alternatives to the text. Aim for the length the project asks for. The
host speaks about 2.8 words per second, and transitions and pauses add up, so
the length is roughly the narration's word count divided by 2.4, plus 4
seconds.

Collect every command, output line and file you want to show **verbatim from
the project's sources** (see "Grounding"). Never invent, adjust or "complete"
terminal output: the pages are what maintainers keep in sync with real runs
and review, and an episode must not be the one place where the software looks
different. If a command has no output on the page, show it without output
only when it really prints nothing; a command that does print something but
has no output on the page must not end a terminal as if it were silent or
hung: show it in a `code` panel as what you run, leave it out, or ask the
maintainer for real output and add it to the page first. Showing a subset of
the output lines is fine; every shown line stays whole.

Commands in one terminal must form one believable session. A page's examples
are often independent of each other (deleting one item and then a range that
contains it would fail), so pick and order them so that each works after the
previous one, and read the code when unsure.

### 2. Storyboard

Write the storyboard as a table before any code, and show it to the user when
they are around: it is the cheapest point to change the plan.

| Chapter | Scene | Line ids | On screen | Cue words |
| --- | --- | --- | --- | --- |

Pick scenes by what the viewer needs to see:

| Scene | Use it for | Rules of thumb |
| --- | --- | --- |
| `intro` | always first: brand lockup, kicker, title, AI disclosure | kicker and title as the project's conventions say |
| `talk` | framing right after the intro: what you'll build, why it matters | once per episode; up to 3 chips of about 40 characters together, or they wrap; `nameTag: {}` shows the host's name and the brand's role |
| `slide` | a concept or a list of steps | at most 4 bullets (a fifth logs a warning), each landing on a cue word said in the narration |
| `diagram` | how parts relate: components, networks, what talks to what | up to about 8 nodes on a grid; build it up on cue words, nodes before the edges between them; `shot: "mini"` for more room |
| `code` | a config or source file, built up or highlighted on cue | copy the file verbatim (`check` compares it like output); up to about 14 lines per panel stay readable, `wide: true` for long lines |
| `terminal` | commands and their output | lines up to about 62 columns keep the full-size font; `running: true` on a server's step leaves out the next prompt |
| `terminal` with `wide: true` | wider output, such as tables | up to 96 columns at full size; `avatar: "none"` hides the presenter |
| `outro` | always last: thanks, the brand's links, what comes next | `next` names what to watch or read next |
| `custom(kind, o)` | anything else (a table, a chat, a comparison) | see "Custom scenes" |

Unless the project says otherwise, an episode opens with why: the `intro`
line greets and names the topic, and the `talk` scene states the hook as the
viewer's problem rather than a definition, and the use case the episode
carries through. It closes with a recap slide (two or three bullets that
recap what the episode showed, never a new fact), then the outro, whose line
names what comes next.

Keep scenes between about 5 and 20 seconds; split a long explanation over
several scenes rather than letting one slide hang. A terminal that only shows
silent commands is mostly empty, so keep it short or give it several
commands. Fast-forward long waits with a badge (`{ ff: "⏩ ~40 s later" }`)
instead of showing them; like output, a stated duration needs the sources or
the maintainer behind it, otherwise write `⏩ fast-forward`.

### 3. Narration

Create the episode from the library's template, then replace its lines:

```bash
npx avatars new episode <id> --title "<Title>"   # episodes/<id>/: script.json, index.html, hyperframes.json
```

Write `script.json` (`{ "lines": [{ "id": "intro", "text": "…" }] }`, an
optional `"lead"` per line in seconds of silence; ids name files, so no `/`,
`\`, `?`, `#` or `%`) following the `avatars-voice` skill: one line per
beat, short spoken sentences, commands said the way a person says them, and
cue words that occur once in their line. Check the pronunciation, then
voice:

```bash
npx avatars phonemes <id> --flagged    # words worth a closer look
npx avatars voice <id>                 # cached per line; prints each line's duration
```

Voicing needs only `script.json`, so the line durations are known before the
composition is written.

### 4. Composition

The template's head and root stay as they are: the scripts and stylesheet
from `vendor/` and `assets/voice/`, the inline `<style>` with the theme's
`@font-face` rules, the `data-composition-variables` attribute (burned-in
captions on or off) and the root's `data-composition-id`, `data-width` and
`data-height`. Replace the comment at the top of the script with the source
the episode explains, and the chain with your storyboard:

```js
const tl = gsap.timeline({ paused: true });
Episode.create({ tl, id: "<id>", title: "<Episode title>", series: "<Series>" })
  .intro({ chapter: "…", kicker: "…", title: "<Title>", say: "intro" })
  .talk({ chapter: "…", title: "…", sub: "…", chips: ["…"], nameTag: {}, say: "why" })
  .slide({ chapter: "…", title: "…", say: "steps", bullets: [{ icon: "nodes", title: "…", text: "…", at: "steps:container" }] })
  .terminal({ chapter: "…", say: ["add", "check"], steps: [{ cmd: "…", at: "add:Run" }] })
  .outro({ chapter: "Wrap-up", next: "…", say: "outro" })
  .done();
window.__timelines["main"] = tl;
```

`id` must match the directory. `title` is the episode's title in the
published manifest; `series` prefixes every on-screen chapter label
("Series · Chapter") and is the intro's default title.

Keep `const tl = …`, `Episode.create({ tl, … })` and the
`window.__timelines["main"] = tl` line inline in the page: HyperFrames' lint
reads only inline scripts and otherwise reports a missing timeline and no
duration source. Load nothing from the network; everything comes from
`vendor/` or the episode directory.

Builder reference (each scene's README has its own options):

- Every scene takes `chapter` (listed under the player, shown top left),
  `label` (on-screen text if it should differ), `transition` (`push`, `iris`,
  `blur`), `transitionDur`, `shot` (`hidden`, `hero`, `full`, `left`,
  `cornerR`, `cornerL`, `mini`) and `lead` (seconds before the narration
  starts). The intro ignores `shot`, `transition` and `lead` (it uses
  `start`). `shot` moves only the presenter: code and terminal lay out for
  `cornerR`, so `cornerL` covers them and logs a warning.
- `say` is a line id, `{ id, mood, cues, look, gap }`, or a list of those.
- Times are `"line:word"` (the first word in that line that starts with
  `word`, case and punctuation ignored, in the line's latest occurrence),
  `"line:word#1"` for the second match, `"line:word+0.5"` or
  `"line:word-0.1"` with an offset, or plain seconds. They can only point at
  lines said in this or an earlier scene.
- The builder also has `feel(at, mood, blend)`, `look(at, x, y)`,
  `glance(at, hold, x, y)`, `wave(at, dur)`, `gesture(at, name, dur)`,
  `time(ref)`, `lineEnd(id)`, `custom(kind, o)` and `done({ tail })`.
- Icons are the file names in the project's icon packs (`avatars.json`
  `icons`; `ls "$AV/icons/core" "$AV/icons/tech"`, plus
  `library/icons/<pack>/`). Unknown names show `check`.

### 5. Acting

Acting is part of the job, not decoration:

- `mood` per line and `cues: { word: mood }` at the payoff word. Every avatar
  renders `neutral happy joy surprised thinking concerned smug wink`, and its
  `CHARACTER.md` says when to use which (an avatar may add moods of its own;
  an unknown name shows as `neutral` and `avatars check` warns).
  As a rule: neutral while explaining, happy when a command succeeds, joy for
  big wins, thinking for a choice or caveat, concerned for warnings, smug for
  a neat trick; `wink` belongs to the sign-off, which the outro does.
- Slides, diagrams, code panels and terminals make the host glance at items
  with a cue and at typed commands on their own; add `look: { word: x }` (x
  from -1, the left of the screen, to 1; `"camera"` looks back) only where a
  glance tells something.
- The intro waves on the first line and the outro before the end of the last.
  A gesture the avatar's base does not animate is ignored, and `check` warns.
- Time on-screen events to the words that name them: a bullet at its
  keyword, a command at "Run", output at "shows", a highlight
  (`{ mark: "running" }`) on the word itself. Viewers read what the host
  says.
- Leave reading time after dense output: a larger `gap` on the line, or a
  `lead` on the next scene.

### 6. Grounding

Terminal commands, output lines and code lines come verbatim from the
project's sources. `check` enforces this when `avatars.json` has a
`grounding` entry:

```json
"grounding": { "sources": ["docs"], "embed": "{{< video \"{id}\" >}}" }
```

- The episode's pages are the Markdown files (`.md`, `.markdown`) under
  `sources` (relative to the project root, skipping dot directories and
  `node_modules`) whose text contains `embed` with `{id}` replaced by the
  episode id. Whitespace in the snippet may vary, and may be missing where it
  does not separate two words.
- A command must occur somewhere in the pages' text. Every output line and
  code line must equal a whole line of a page, ignoring trailing whitespace
  but not leading whitespace. Lines of a fenced code block also count
  without the block's common indentation, so a block nested in a list item
  matches unindented output.
- So embed the episode on its page before running `check`, where the
  project's instructions say. The library's Hugo shortcode renders nothing
  until the episode is published, so pages can embed it early.

Without `grounding` nothing is compared: check the content against the
sources by hand.

Rules `check` cannot know (titles per series, a required recap chapter,
copies of commands between pages) belong in a project check module, listed
in `avatars.json` as `"checks": ["./checks/episodes.mjs"]`:

```js
export default async function (api) {
  // api: { id, dir, episode, project, warn(msg), error(msg) };
  // episode is window.__episode: { id, title, duration, chapters, cues, lines, terminal }
  if (api.episode.duration > 120) api.warn(`longer than 2 min: ${api.episode.duration} s`);
}
```

### 7. Check

```bash
npx avatars check <id>
```

It validates `avatars.json`, `brand.json`, `episode.json` and `script.json`,
rebuilds a stale `vendor/`, loads the composition and prints the timeline
(chapters, and the start of every line), then runs the grounding and project
checks, lint, and takes two stills per chapter (middle and end) as contact
sheets in `episodes/<id>/snapshots/`. Errors (exit code 1) are in "Errors"
below. Fix all of them, and resolve every warning or say why it stays:

| Warning | What to do |
| --- | --- |
| `console: terminal: N columns do not fit …` | `wide: true`, or show fewer columns by choosing another command from the sources |
| `console: code …: N columns do not fit …` | `wide: true`, fewer panels, or leave out long lines (never shorten them) |
| `console: cue "line:word" matches N words …` | the cue picked the first match; write `line:word#0` if that is right, or a longer prefix |
| `console: diagram …: nodes … overlap`, `… reaches outside the diagram area`, `groups … overlap` | change `grid`, `pos` or `width`; with many columns, `shot: "mini"` gives the diagram the full width |
| `text cut off in a diagram node: …` | widen the node (`width`) or shorten the title; 260 px fit about 11 characters |
| `wordmark "…" runs under the presenter …` | the brand's `wordmark` is too long for the intro (about five characters fit at the default size): shorten it in `brand.json`, or set a smaller `intro.wordmark-size` in the brand's `tokens` |
| `command not on the episode's pages …`, `output line not on …`, `line of <file> not on …` | copy it from the page: the episode is wrong, not the page. If the page is wrong, fix the page in the same change |
| `no page under … embeds …` | embed the episode on its page (step 6) |
| `N s without narration before …` | dead air: shorten the wait or add a line |
| `line "…" is in script.json but never said` | use it or delete it |
| `N lines have fixture narration without audio …` | fine for layout; voice it before rendering |
| `gesture "…" of the host is ignored …` | the avatar's base cannot animate it; leave it out |
| `… has contrast …, below …` | a token override in `episode.json`, `avatars.json` or the brand made text too faint; change the token |
| `window.__episode.id is "…", but the episode directory is "…"` | make `Episode.create({ id })` match the directory |
| `./checks/…: …` | a project check; its module says what it wants |

`--quick` skips lint and the stills while iterating on timing. Every full
run replaces `snapshots/`.

### 8. Look at the contact sheets

Open `snapshots/contact-sheet*.jpg` (and the `frame-*.png` stills next to
them) and look at them like a viewer would: text clipped or overflowing its
box, captions covering terminal output or a bullet, the presenter bubble
covering content, chips wrapping, a scene that is still empty at its end,
bullets that never appeared, a highlight on the wrong text, a font too small
to read, the wrong look or theme. For extra stills around a moment the
timeline names, run inside the episode directory:

```bash
npx hyperframes snapshot --no-end --describe false -o snapshots/extra --at 41.5,42,42.5
```

### 9. Render and review

```bash
npx avatars render <id> --draft    # renders/<id>.mp4, fast
npx avatars render <id>            # standard quality, burned-in captions
npx avatars publish <id>           # web MP4 without burned-in captions, poster, WebVTT, manifest
```

A render takes about 3 to 5 times the video's length on 4 CPUs. `publish`
writes into the `publish` directories of `avatars.json` (or `--static DIR
--data DIR`); how a site picks them up, and whether CI renders with
`avatars ci`, is the project's business. Send the MP4 to the user
(`SendUserFile`, if you have it) or give its path, instead of describing it.

You cannot hear the result. Before calling an episode done, ask a human to
watch it and listen for mispronounced words (list the ones `phonemes
--flagged` showed and the lexicon entries you added), pacing, and lines that
sound flat. Follow the project's review rules.

### 10. Commit

Commit `script.json`, `index.html`, `hyperframes.json` and `episode.json` if
there is one; `git status` must not list `vendor/`, `assets/voice/`,
`snapshots/` or renders. Lexicon entries and project library changes
(scenes, avatars, checks) get their own commits. Follow the project's commit
and pull request conventions.

## Update an episode

When a source an episode shows or embeds changes (the page, a command's
output, a config file), update the episode in the same change:

1. `npx avatars voice <id>` (narration is not committed, so a fresh checkout
   needs it; it is cached afterwards), then `npx avatars check <id> --quick`,
   which lists terminal and code content that is no longer on the pages
   (with `grounding` configured).
   Copy the new commands, output and file lines into `index.html`.
2. If the change affects what the host says (a renamed flag, a new step),
   edit those lines in `script.json` and voice again; only changed lines are
   voiced again. Time references to changed lines may need new cue words.
3. Run the full `check`, look at the stills of the changed chapters, and
   render a draft.

The pages that embed an episode contain its embed snippet, so `grep` the
sources for it; `grep` the episodes' `index.html` files for a changed
command. Pure prose edits usually need no episode change; `check` passing is
the signal.

When the project upgrades the library, `npx avatars hash --all` before and
after the upgrade names the episodes whose bundle or narration changed: they
re-render. Voice and check them all, and look at their stills.

## Per-episode overrides

`episodes/<id>/episode.json` changes the project's settings for one episode:

```json
{
  "cast": { "host": { "look": "blazer-glasses", "voice": "sindy-soft" } },
  "theme": "daylight",
  "tokens": { "terminal": { "cps": { "$value": 40 } } }
}
```

- `cast` merges over the project's cast, per role and key: `avatar`, `look`,
  `palette` (role to colour or `{token}`), `options` (part id to options) and
  `voice` (a preset of the avatar's `voice.json`, which wins over
  `script.json`'s `voice`). A new `avatar` keeps the project's `look` name,
  so name the new avatar's look too. See looks with `ls
  "$AV/avatars/<avatar>/looks"` and `npx avatars sheet <avatar> --look <look>
  -o look.png`.
- `theme` and `format` are ids (`ls "$AV/themes" "$AV/formats"`, plus the
  project's `library/`). The page head must declare exactly the new theme's
  `@font-face` rules: `check` reports the difference and prints the rules to
  paste. A format with another canvas also needs the page's viewport meta and
  the root's `data-width` and `data-height` to match.
- `tokens` are design-token JSON, merged over the brand's and the project's
  one token at a time; each scene's README lists its component tokens.
- Nothing else is allowed (a schema error); lexicons, icons and scenes are
  project-wide.

Change colours and sizes through tokens, never with literal values in the
page, so the episode keeps following the theme and brand.

## Custom scenes

`custom(kind, o)` begins a scene (section, transition, shot, chapter) and
returns `{ el, t }` instead of the chain. Fill `el` with DOM, animate on the
episode's timeline, then continue with the builder object:

```js
const ep = Episode.create({ tl, id: "<id>", title: "…", series: "…" })
  .intro({ … })
  .talk({ … });
const { el, t } = ep.custom("compare", { chapter: "Two ways", shot: "cornerR" });
el.innerHTML = `<div class="bg-glow"></div><table class="compare">…</table>`;
Scenes.enter(ep.tl, el.querySelector(".compare"), t + 0.5);
ep.P.wait(0.6);
ep.say({ id: "compare", mood: "neutral" });
ep.outro({ … }).done();
```

Style it in the page's `<style>` with token custom properties only:
`var(--av-color-surface)`, `var(--av-font-size-3xl)`,
`var(--av-radius-4xl)`. Every token is `--av-` plus its name with dots as
dashes; `vendor/avatars.css` lists them all. In scripts, `Avatars.tokens`
gives concrete values for GSAP: `get(name)`, `num(name)`,
`color(name, alpha)`.

When a second episode needs the scene, make it a project scene:
`library/scenes/<id>/<id>.js` (with optional `<id>.css`, `tokens.json` and
a `README.md`), listed in `avatars.json` as `"scenes": ["<id>"]`. It
registers a builder method and gets the scene context:

```js
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.scenes.register("table", function table(ctx, o) {
    const { tl, h } = ctx;
    const f = ctx.slideFrame("table", o); // chapter label, title, corner shot
    const rows = (o.rows || []).map((r) => h("tr", {}, r.cells.map((c) => h("td", { text: c }))));
    f.el.append(h("table", { class: "table" }, rows));
    for (const r of rows) tl.set(r, { opacity: 0 }, 0);
    f.narrate(); // waits o.lead, says o.say
    (o.rows || []).forEach((r, i) => {
      const at = f.cue(r, i); // just before r.at, or one after another
      tl.to(rows[i], { opacity: 1, duration: ctx.tokens.num("table.enter-duration") }, at);
      if (r.at != null) ctx.glance(at);
    });
  });
})(typeof window !== "undefined" ? window : globalThis);
```

Episodes then call `.table({ chapter, title, say, rows: [{ cells, at }] })`.
The context has `tl`, `P`, `h`, `svg`, `icon`, `time`, `lineEnd`, `feel`,
`look`, `glance`, `gesture`, `wave`, `say`, `begin(kind, o, defaults)`,
`slideFrame(kind, o)`, `chapterLabel`, `windowBar`, `shot`, `setShot`,
`renderers` (per-frame functions of `t`), `shown` (terminal and code content
for the grounding check), `tokens`, `format`, `brand` and `presenter`; the
`Scenes` helpers include `enter`, `show`, `hide` and `transition`. A
scene's tokens live in its `tokens.json` as `<scene>.<element>-<property>`
defaulting to semantic tokens (`{color.text}`), and its CSS uses them as
`var(--av-…)`. Scenes ask for shots, moods and glances by name, never for a
particular avatar.

Everything must be a pure function of the timeline time: no `Math.random`,
`Date.now`, `setTimeout`, `requestAnimationFrame`, CSS animations or
transitions, or network requests. HyperFrames seeks a paused timeline to any
time on parallel workers, so put every change on `tl` at an absolute time,
and draw seeded randomness (`Avatars.math.mulberry32(seed)`) once while
building, never per frame. To test it:

```bash
node "$AV/cli/tools/frame-diff.mjs" <id>   # frames in order, in reverse, in order again
```

It exits with 1 when a frame's DOM depends on the seek order. A scene that
every project could use belongs in the library itself (`avatars-design`
skill).

## Errors

| Error | Cause and fix |
| --- | --- |
| `no narration, run: avatars voice <id> …` | voice it, or `fixture-voice` for layout work |
| `page error: voice line "x" missing; …` | a `say` names a line that is not in `script.json` or not voiced yet: add it, then `voice` |
| `line "x" changed since it was voiced …` | run `npx avatars voice <id>` |
| `line "x" is stale (its voice, lexicon entries or lead changed) …` | the preset, a lexicon entry the line uses or its `lead` changed since it was voiced: run `npx avatars voice <id>` |
| `cannot compare the narration with its voice keys: …` | the voice tool did not run; voiced narration needs Python (`AVATARS_PYTHON`) for `check` too |
| `fixture narration has no audio, run: avatars voice <id>` | `render` and `publish` need voiced narration; voice the episode first |
| `page error: line "x" has not been said yet …` | time references can only point at lines said in this or an earlier scene |
| `page error: word "x" not found in: …` | the cue must be the start of a word in that line (case and punctuation ignored); `x#1` for the second match |
| `page error: bad time reference "…"` | write `"line:word"`, `"line:word#n"`, `"line:word+0.5"` or seconds |
| `page error: diagram …: group … names no node …`, `edge … names no node or group …`, `pulse names no node …` | ids in `around`, `from`, `to` and `pulse` must be node ids (edges also take group ids) |
| `page error: diagram …: reveal "x" matches nothing in its svg` | the selector must match an element inside the diagram's `svg` |
| `page error: code: mark "…" matches no line` | the mark's `text` must occur in a line of the panel, or `line` must exist |
| `page error: unknown shot …`, `unknown transition …` | see the builder reference in step 4 |
| `page error: token "x" is not defined` | a custom scene or override names a token the episode lacks; look it up in `vendor/avatars.css` |
| `the page head lacks the @font-face rule of theme …`, `declares @font-face …, which theme … does not have` | paste the rules `check` prints into the head's `<style>` |
| `<file>: …: unknown key "x"` and other schema messages | fix the manifest the message names |
| `look "x" of …`, `part … does not fit base …`, `… is in neither …` | the cast names an avatar, look or part that does not exist or does not fit |
| `missing file: …` | a path in the page that does not exist in the episode directory |
| `fetches from the network (renders must not): …` | load everything from `vendor/` or the episode directory |
| `no window.__episode: …` | usually follows a page error; otherwise the chain lacks `.done()` |
| lint: missing timeline or duration source | the page must create `tl`, pass it to `Episode.create` and register it on `window.__timelines` inline |
| lint: `font_family_without_font_face` | use only the theme's fonts: `var(--av-font-sans)`, `var(--av-font-mono)` |
| a frame flashes or differs between renders | run `frame-diff`, find the non-deterministic code; `npx hyperframes render --workers 1` in the episode directory confirms a worker-boundary problem |
