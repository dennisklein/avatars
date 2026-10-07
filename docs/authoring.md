# Writing an episode

An episode is one video in `episodes/<id>/` of a project. Two files are
written by hand:

- `script.json`: the narration, one line per beat;
- `index.html`: the composition, a chain of scene calls that say those lines
  and time what appears to their words.

`episode.json` (optional) changes the project's cast, theme, format or tokens
for this episode, and `hyperframes.json` comes from the template and stays as
it is. The CLI generates `vendor/` (the library bundle), `assets/voice/` (the
narration) and `snapshots/` (contact sheets); they are git-ignored.

```bash
npx avatars new episode first-steps --title "First steps"
```

copies the episode template: an intro, a talk, a slide and an outro over four
lines. `examples/demo/episodes/tour/` uses every scene, and each scene's
`README.md` in `scenes/<id>/` lists all its options. This guide covers what
they share.

## The narration

```json
{
  "lines": [
    { "id": "intro", "text": "Hi there! Welcome to First steps." },
    { "id": "why", "text": "Every episode starts with why it matters." }
  ]
}
```

A line is the unit that scenes say, captions break on and cues refer to: one
or two short spoken sentences. Ids are unique and name files, so they have no
slashes. A line may add `"lead"`, seconds of silence before it, and the
script may name a voice preset in `"voice"`. [voice.md](voice.md) explains
how lines are voiced and the `avatars-voice` skill how to write them so that
they are easy to say.

Voicing needs only `script.json`, so line durations are known before the
composition exists:

```bash
npx avatars voice first-steps           # the real voice
npx avatars fixture-voice first-steps   # made-up timings, no audio
```

## The page

The template's head and root are a contract that `avatars check` verifies;
leave them as they are: the scripts and stylesheet from `vendor/` and
`assets/voice/`, the inline `<style>` with the theme's `@font-face` rules,
the `captions` composition variable and the root's `data-composition-id`,
`data-width` and `data-height` (see "Page structure" in
[DESIGN.md](../DESIGN.md)). The script builds the episode:

```js
const tl = gsap.timeline({ paused: true });
Episode.create({ tl, id: "first-steps", title: "First steps", series: "Getting started" })
  .intro({ chapter: "Welcome", kicker: "Getting started", title: "First steps", say: "intro" })
  .talk({ chapter: "Why it matters", title: "Start with why", sub: "…", chips: ["…"], nameTag: {}, say: "why" })
  .slide({ chapter: "The way there", title: "…", say: "steps", bullets: [{ icon: "user", title: "…", text: "…", at: "steps:line" }] })
  .diagram({ chapter: "…", title: "…", say: "mesh", nodes: [/* … */], groups: [/* … */], edges: [/* … */] })
  .code({ chapter: "…", title: "…", say: "cfg", file: "app.yaml", lang: "yaml", text: "…", marks: [{ text: "name:", at: "cfg:name" }] })
  .terminal({ chapter: "…", say: ["create", "check"], steps: [{ cmd: "make up", at: "create:Run" }] })
  .terminal({ wide: true, chapter: "…", say: "inspect", steps: [/* … */] })
  .outro({ chapter: "Wrap-up", next: "…", say: "outro" })
  .done();
window.__timelines["main"] = tl;
```

`id` matches the directory; `title` is the title of the published video;
`series` prefixes every on-screen chapter label ("Series · Chapter") and is
the intro's default title. `tl`, `Episode.create` and the
`window.__timelines` line stay inline in the page, because HyperFrames' lint
reads only inline scripts. Nothing loads from the network.

Each call builds its scene, lays its narration on the timeline after the
previous scene's, moves the presenter to the scene's shot and adds the
transition from the previous scene. `done()` ends the episode with a fade to
black `motion.tail` seconds after the last line (`done({ tail: 2.5 })` for
longer) and builds the presenter, the captions and the audio.

## Scenes

| Scene | Presenter | Default transition in | Use it for |
| --- | --- | --- | --- |
| `intro` | rises in on the right (`hero`), waves | none, it is the first scene | the brand sting, the episode title and the AI disclosure |
| `talk` | full size on the left (`full`) | `iris` after the intro, else `push` | framing the topic: a title card with chips and an optional name tag |
| `slide` | corner bubble (`cornerR`) | `push` | a title and up to four bullets that land on their cue words |
| `diagram` | `cornerR`, or `mini` or `hidden` for the wide area, `cornerL` for a bubble on the left | `push` | boxes and arrows built up on cue words |
| `code` | `cornerR`, or `mini` with `wide: true` | `push` | a file copied from the docs, with lines that light up or appear on cue |
| `terminal` | `cornerR`; with `wide: true` the small `mini` bubble; `avatar: "none"` hides her | `push` | commands typed on cue and their output |
| `outro` | full size on the left (`left`), waves and winks | `blur` | thanks, the brand's links and what to watch next |
| `custom(kind, o)` | unchanged | `push` | anything else: returns `{ el, t }` to fill by hand |

Every scene takes these options:

| Option | Meaning |
| --- | --- |
| `chapter` | a chapter title, listed under the docs player; slide layouts and terminals also show it top left |
| `label` | the on-screen chapter text, if it should differ |
| `say` | the narration (below) |
| `mood` | the default mood of the scene's lines, where the scene has one |
| `lead` | seconds before the narration starts (0.6, the outro 0.7; the intro uses `start`) |
| `transition`, `transitionDur` | `push`, `iris` or `blur`, and its length (default: the `motion.transition.<kind>` token) |
| `shot` | `hidden`, `hero`, `full`, `left`, `cornerR`, `cornerL` or `mini`; it moves only the presenter, so `cornerL` covers code panels and terminals, which lay out for `cornerR` (they log a warning) |

### intro

Always the first scene. The lockup comes from the project's brand: the
emblem (or a separate `logo` mark) pops in piece by piece, the wordmark and
tagline rise in beside it, and the host's disclosure stands bottom left.
`kicker` is a small line above the `title` (default: `series`). `chapter`
defaults to "Intro" and starts at 0. The narration starts at `start` (1.5 s)
in `joy`, switching to `happy` after the first sentence, and she waves on the
first line unless `wave: false`. The intro ignores `lead`, `transition` and
`shot`: the presenter always rises in from `hidden` to `hero`.

### talk

Use it once, right after the intro, to say why the episode matters. The card
on the right has an optional `kicker`, the `title`, a `sub` sentence and up
to three `chips` (the first is accented; about 40 characters together).
`nameTag: {}` shows a lower third with the host's name and the brand's role
from 0.9 s into the scene until `hold` seconds (`talk.tag-hold`, 5.2);
`nameTag: { name, role, hold }` overrides each. The default mood is
`neutral`.

### slide

A `title` and `bullets: [{ icon, title, text, at }]`, up to four; `text` is
an optional second line, and unknown icon names show `check`. Four bullets
start higher, so the last one clears the captions; a fifth runs under them
and logs a warning.

`slide`, `diagram` and `code` share the slide frame: chapter label, title,
the presenter in the corner and items that appear 0.15 s before their cue
word (`at`), or one after another from 0.9 s into the scene when they have
none. The presenter glances at every item with a cue.

### diagram

Nodes sit on a grid over the area below the title, groups draw a labelled box
around nodes, and edges connect nodes or groups and draw themselves along
their path.

```js
.diagram({
  chapter: "How it fits together",
  title: "One network, three services",
  say: "mesh",
  grid: [3, 2],
  nodes: [
    { id: "host", title: "Your machine", icon: "host", pos: [0, 0.5], at: "mesh:machine" },
    { id: "dns", title: "DNS", text: "names", icon: "globe", pos: [1, 0], at: "mesh:DNS" },
    { id: "db", title: "Database", icon: "db", pos: [2, 1], accent: true, at: "mesh:database" },
  ],
  groups: [{ id: "net", label: "network", around: ["dns", "db"], at: "mesh:network" }],
  edges: [{ from: "host", to: "net", label: "joins", at: "mesh:joins" }],
  pulse: [{ node: "db", at: "mesh:stores" }],
})
```

| Option | Meaning |
| --- | --- |
| `nodes` | `[{ id, title, text, icon, pos: [col, row], width, accent, ghost, code, at }]`; fractional positions are fine, `text` adds a second line (monospace with `code: true`), `icon: false` leaves the icon out, `ghost` draws a dashed outline |
| `grid` | `[cols, rows]`; default: enough for the positions |
| `nodeWidth` | the default node width, 260 px, which fits a title of about 11 characters |
| `groups` | `[{ id, label, around: [node ids], accent, pad, at }]` |
| `edges` | `[{ from, to, label, dashed, arrow, bend, accent, at }]`; `from` and `to` are node or group ids, `arrow` is `end` (default), `both`, `start` or `none`, `bend` bows the edge sideways by that many pixels |
| `pulse` | `[{ node, at }]` or `[{ el, at }]`: a node or an element of `svg` swells and rings once |
| `svg` | raw SVG fitted into the area, for anything the boxes cannot draw |
| `reveal` | `[{ el: "#selector", at, draw }]`: elements of `svg` fade in, or draw their strokes with `draw: true` |

Items without cues appear in this order: groups, nodes, edges, raw elements.
The area depends on the shot: `shot: "mini"` (or `"hidden"`) gives the
diagram the full width. Overlapping nodes or groups and boxes outside the
area are console warnings, and node text that is cut off is a check warning.

### code

One file (`file`, `lang`, `text`) or several side by side
(`panels: [{ file, lang, text }]`), coloured by the highlighter for `lang`:
`yaml`, `sh`, `c`, `conf`, `json`, or `text` for anything else.

| Option | Meaning |
| --- | --- |
| `reveal` | `[{ lines: [first, last], at, panel }]`: lines, counted from 1, fade in at the cue |
| `marks` | `[{ text \| line, at, until, panel }]`: light up every line that contains `text` (or line number `line`) from `at` until `until`; without `panel`, in every panel |
| `notes` | `[{ icon, text, warn, at }]`: chips under the panels; `warn` draws a warning chip |
| `wide` | the wide area and the small bubble, for long lines |
| `font` | the largest font size to use (px) |

Without a `title` the panels use the whole height below the chapter label.
The font fits the longest line and the tallest panel, and a panel scrolls to
keep revealed and marked lines in view. Every line is compared with the
episode's pages by `avatars check` (grounding), so copy files from the page
and leave lines out rather than edit them.

### terminal

```js
.terminal({
  chapter: "Create and check",
  say: [{ id: "create", mood: "happy" }, { id: "check", mood: "smug", cues: { running: "joy" } }],
  steps: [
    { cmd: "make up", at: "create:Run" },
    { ff: "⏩ fast-forward", after: 0.5, hold: 1.8 },
    { prompt: true, after: 0.9 },
    { cmd: "make status", at: "check:Now" },
    { out: "NAME   STATUS\nweb    running", at: "check:shows" },
    { mark: "running", at: "check:running", delay: -0.1 },
  ],
})
```

A step takes `at` (a time reference, plus `delay` seconds) or `after`
(seconds after the previous step, default 0.3; a typed command ends when its
last character is typed, and the first step counts from 1 s into the scene):

- `{ cmd }`: a command, typed at `cps` characters per second
  (`terminal.cps`, 32);
- `{ out }`: output lines, shown at once;
- `{ prompt: true }`: a fresh prompt after a silent command;
- `{ ff: "⏩ ~40 s later", hold }`: a fast-forward badge for `hold` seconds
  (`terminal.ff-hold`);
- `{ mark: "text", until }`: highlight every occurrence of `text`;
- `{ clear: true }`: clear the screen;
- `running: true` on a step leaves out the fresh prompt after it, for a
  command that keeps running, such as a server.

The window `title` defaults to `"~/work — bash"` and the `prompt` to `"$ "`.
The presenter glances at every typed command unless `glance: false`. The
font fits the longest line: the regular window keeps its largest size up to
about 62 columns and shrinks to fit 96; `wide: true` keeps it up to 96 and
shrinks to fit 160. A line that does not fit even then is a console warning.
Commands and output are grounded like code.

### outro

Always the last scene, before `.done()`. The card has a `title` ("Thanks for
watching!"), the brand's `links` (`[[label, text], …]`; `[]` leaves them
out) and `next`, what to watch or read next. The lines start in `joy` and
turn `happy` early in the last line; she waves near the end of the last line
(`wave: <time>` moves it, `wave: false` leaves it out) and winks after it.

## Narration and acting

`say` is a line id, `{ id, mood, cues, look, gap }` or a list of those:

```js
say: [
  { id: "create", mood: "happy" },
  { id: "check", mood: "smug", cues: { running: "joy" }, look: { complete: 0.35, All: "camera" } },
]
```

- `mood` is the expression for the line; without it the scene's default
  applies.
- `cues` change the mood at a word.
- `look` turns her eyes at a word: `x` from -1 (the left of the screen) to 1,
  `"camera"` back to the viewer.
- `gap` is the pause after the line: 0.25 s between the lines of a list, and
  after the last one the scene's own (0.2 s in most scenes).

The moods are `neutral`, `happy`, `joy`, `surprised`, `thinking`,
`concerned`, `smug` and `wink` (an unknown name shows as `neutral` and logs a
warning), and the avatar's `CHARACTER.md` says when to use which. As a rule:
`neutral` while explaining, `happy` when something works, `joy` for big
moments, `thinking` for a choice or caveat, `concerned` for warnings, `smug`
for a neat trick; `wink` belongs to the sign-off, which the outro does.

Scenes act on their own: slides, diagrams and code panels make her glance at
items with a cue, terminals at typed commands, the intro and outro wave. The
builder has the same helpers for anything else; each takes a time reference
or seconds:

| Method | Does |
| --- | --- |
| `feel(at, mood, blend)` | change the mood, blended over `blend` seconds (0.3) |
| `look(at, x, y)` | look towards `x`, `y` (-1..1) and stay |
| `glance(at, hold, x, y)` | look at content (default `-0.7, 0.1`) for `hold` seconds (0.8), then back |
| `wave(at, dur)`, `gesture(at, name, dur)` | a gesture (2.2 s); the only one is `wave` |
| `time(ref)`, `lineEnd(id)` | a time reference in seconds; the end of a said line |

A gesture the avatar's base cannot animate is ignored, and `check` warns.

## Time references

Every `at`, `until` and helper takes a time reference or plain seconds:

| Reference | Time |
| --- | --- |
| `"what:network"` | the start of the first word of line `what` that starts with "network", case and punctuation ignored |
| `"what:network#1"` | the second such word (`#0` is the first) |
| `"what:network+0.5"`, `"what:network#1-0.1"` | with an offset in seconds |
| `12.5` | seconds from the start of the episode |

A reference points at the latest occurrence of the line said so far, so it
can only name lines of this or an earlier scene. A prefix that matches
several words picks the first and logs a console warning; write `#0` if that
is right, or a longer prefix. The word part ends at `#`, `+` or `-`, so cue a
hyphenated word by its first part.

## Custom scenes

`custom(kind, o)` begins a scene (section, transition, shot, chapter) and
returns `{ el, t }`. Fill `el` with DOM, animate on the episode's timeline,
then continue with the builder:

```js
const ep = Episode.create({ tl, id: "first-steps", title: "…", series: "…" })
  .intro({ /* … */ });
const { el, t } = ep.custom("compare", { chapter: "Two ways", shot: "cornerR" });
el.innerHTML = `<div class="bg-glow"></div><table class="compare">…</table>`;
Scenes.enter(ep.tl, el.querySelector(".compare"), t + 0.5);
ep.P.wait(0.6);
ep.say({ id: "compare", mood: "neutral" });
ep.outro({ /* … */ }).done();
```

A scene used more than once is better registered. A page registers it in its
inline script before `Episode.create`; it becomes a builder method and gets
the scene context (`ctx`), as library scenes do. The demo's tour registers
`compare` on the slide frame:

```js
Avatars.scenes.register("compare", function compare(ctx, o) {
  const f = ctx.slideFrame("compare", o);   // chapter label, title, corner shot
  // … build columns of rows into f.el …
  f.narrate();                              // waits o.lead, says o.say
  items.forEach((it, i) => {
    const at = f.cue(it.spec, i);           // just before it.spec.at, or one after another
    Scenes.enter(ctx.tl, it.el, at, { y: 24 });
    if (it.spec.at != null) ctx.glance(at, 0.8, -0.6, 0.1);
  });
});
```

When several episodes need it, it becomes a project scene:
`library/scenes/<id>/<id>.js` with an optional `<id>.css`, `tokens.json`
and `README.md`, listed in `avatars.json` as `"scenes": ["<id>"]`. The
context and its members are in "Scenes" in [DESIGN.md](../DESIGN.md); a
scene's tokens are `<scene>.<element>-<property>`, defaulting to semantic
tokens.

Style custom content in the page's `<style>` with tokens only:
`var(--av-color-surface)`, `var(--av-font-size-3xl)`,
`var(--av-radius-4xl)`. Every token is `--av-` plus its name with dots as
dashes, and `vendor/avatars.css` lists them all; in scripts,
`Avatars.tokens.get`, `num` and `color` give concrete values for GSAP. Then
the episode follows every theme and brand.

Everything must be a pure function of the timeline time: no `Math.random`,
`Date.now`, timers, `requestAnimationFrame`, CSS animations or transitions,
and no network requests. Put every change on `tl` at an absolute time, and
draw seeded randomness (`Avatars.math.mulberry32(seed)`) once while building.
This renders an episode's frames in order, in reverse and in order again and
fails when the DOM depends on the seek order:

```bash
node node_modules/@dennisklein/avatars/cli/tools/frame-diff.mjs <id>
```

## Per-episode overrides

`episodes/<id>/episode.json` changes the project's settings for one episode.
The demo's `wardrobe` episode wears another look on the light theme:

```json
{
  "cast": { "host": { "look": "blazer-glasses" } },
  "theme": "daylight"
}
```

- `cast` merges over the project's cast per role and key: `avatar`, `look`,
  `palette` (role → colour or `{token}`, merged per role name), `options`
  (part id → options, merged per part and option) and `voice` (a preset of
  the avatar's `voice.json`). A new `avatar` keeps the project's `look`
  name, so name its look too.
- `theme` and `format` are ids. The page head must declare exactly the
  theme's `@font-face` rules; `check` prints them when they differ. A format
  with another canvas also needs the viewport meta and the root's
  `data-width` and `data-height` to match.
- `tokens` are a token tree merged over the brand's and the project's, one
  token at a time: `{ "terminal": { "cps": { "$value": 40 } } }`.

Lexicons, icons and scenes are project-wide.

## Check it

```bash
npx avatars check first-steps --quick   # while working on timing
npx avatars check first-steps           # also lint and contact sheets
```

`check` prints the timeline and every warning and error: cues that match
several words, terminal lines that do not fit, diagram overlaps, stale or
unused narration, dead air, and terminal or code lines that are not on the
episode's pages. Look at the contact sheets in `episodes/<id>/snapshots/`,
two stills per chapter, before rendering. [pipeline.md](pipeline.md) lists
everything it checks.
