# avatars: design

A library of instructor avatars, scenes and a design system for tutorial
videos that coding agents write, render on a CPU and re-render whenever their
source changes. Projects reference the library by git tag and keep only their
own content: brand, pronunciations, episodes and editorial checks.

This document is the authoritative description of the concepts, file formats
and runtime contracts. The guides in `docs/` explain how to use them.

## Principles

- **Every frame is a pure function of time.** Rendering seeks a paused GSAP
  timeline to arbitrary times on parallel workers. Runtime code never reads
  clocks, never uses unseeded randomness, timers, CSS animations or
  `requestAnimationFrame`, and never fetches from the network.
- **The library knows no project.** Names, logos, links, colours and words of
  a project come from its brand and configuration, never from library code.
- **Layers, each replaceable on its own.** Tokens, themes, formats, scenes,
  rigs, parts, looks, avatars and voices change independently. A scene works
  with every avatar, an avatar with every theme, a look on every avatar of a
  compatible base.
- **Data first, code where behaviour is needed.** Manifests are JSON with
  JSON Schemas in `core/schemas/`; code exists for drawing and motion.
- **Agents can check what they cannot see or hear.** `avatars check` reports
  layout warnings, stale narration and ungrounded terminal content, and
  writes contact sheets; the voice tool flags risky pronunciations.

## Vocabulary

| Concept | What it is | Where it lives |
| --- | --- | --- |
| Token | a named design value (colour, font, size, radius, shadow, timing) in the design-token JSON format | `tokens/` (primitives), `core/tokens.json` and `scenes/*/tokens.json` (components), themes, formats |
| Theme | semantic tokens that give a look and feel, brand-neutral | `themes/<id>/` |
| Format | canvas size and layout geometry: shot presets and the areas scenes lay out in | `formats/<id>/` |
| Brand | a project's identity: name, wordmark, tagline, marks, links, presenter role, token overrides | the project (`brand/brand.json`) |
| Icon | a 24 px stroke icon, one SVG file | `icons/<pack>/<name>.svg` |
| Scene | a builder method that lays out one part of an episode, styled only through tokens | `scenes/<id>/` |
| Performer | turns narration timings, moods, gaze and gestures into a pose per frame | `core/performer.js` |
| Pose | the plain numbers that describe the avatar at one instant | contract below |
| Rig | draws a pose; the SVG rig mounts parts into the slots of a base | `rigs/<rig>/` |
| Base | a body type: canvas, anchors, slot layers and bone transforms | `rigs/<rig>/bases/<id>/` |
| Part | a drawable piece filling one or more slots, painted with palette roles | `parts/<category>/<name>/`, `avatars/<id>/parts/<name>/` |
| Avatar | an instructor: identity parts, palette, moods, temperament, voice, character bible | `avatars/<id>/` |
| Look | one dressing of an avatar: wardrobe parts plus colourways, palette and options | `avatars/<id>/looks/<name>.json` |
| Cast | the presenters of an episode by role (`host`) | `avatars.json`, `episode.json` |
| Voice preset | engine, voice blend, speed, language and pitch of an avatar | `avatars/<id>/voice.json` |
| Lexicon | pronunciation overrides, merged in layers | `lexicons/<lang>/<pack>.json`, `avatars/<id>/lexicon.json`, the project |
| Project | a consumer: configuration, brand, lexicon, checks and episodes | outside this repository (`examples/demo/` is one) |
| Episode | one video: `script.json` (narration), `index.html` (a chain of scene calls), optional `episode.json` | the project (`episodes/<id>/`) |

## Repository layout

```text
core/                    runtime of every episode: browser scripts, core.css, tokens.json (component tokens)
  schemas/               JSON Schemas of every manifest
tokens/                  primitive tokens: color, font, radius, shadow and motion .tokens.json
themes/<id>/             theme.json and theme.tokens.json: midnight, daylight
formats/<id>/            format.json and format.tokens.json (format.css optional): landscape-1080p
icons/<pack>/            one SVG per icon: core, tech
scenes/<id>/             <id>.js, <id>.css, tokens.json, README.md; code/highlight/<lang>.js
rigs/svg/                rig.js and bases/<id>/{base.json, base.js}: anime-600x800
parts/<category>/<name>/ part.json and part.js
avatars/<id>/            avatar.json, CHARACTER.md, voice.json, lexicon.json, parts/, looks/: sindy
voice/                   avatar_voice.py, engines/, requirements.txt, tests/ (Python)
lexicons/<lang>/         pronunciation packs: en-us/core.json, en-us/hpc.json
cli/                     avatars.mjs, lib/ (the commands), tools/ (frame-diff, mouth-stats, shot)
templates/               project/ and episode/, copied by avatars new
examples/demo/           a neutral project with two episodes; CI and the gallery use it
gallery/                 index.html and sheet.html, the pages avatars gallery and avatars sheet fill
integrations/            hugo/ (shortcode, stylesheet), github/render/ (composite action), claude-code/ (plugin setup)
skills/                  Claude Code skills: avatars-episode, avatars-voice, avatars-design
.claude-plugin/          marketplace.json: the marketplace and the plugin that ships skills/
.claude/skills           a link to skills/, so the skills also load when working in this repository
.github/workflows/       ci.yml (tests, validation, REUSE, demo check), gallery.yml (gallery on GitHub Pages)
docs/                    guides; images/ holds generated pictures
test/                    Node test suites (*.test.mjs) and their fixtures/
```

`templates/project` holds `avatars.json`, `package.json`, `gitignore`
(copied as `.gitignore`; it leaves out what the CLI and HyperFrames write,
and `.avatars-store/`, the render store of `ci`), `README.md`, `lexicon.json`,
`brand/` (`brand.json`, `emblem.svg`, `emblem-badge.svg`) and
`episodes/hello/`; it uses the hoodie look on midnight, without grounding.
The brand's `wordmark` is the placeholder `brand`, short enough for the
intro beside the presenter. `templates/episode` holds `script.json`,
`index.html` and `hyperframes.json`. `examples/demo` is a project with the
brand "Demo" and links on example.org, and two episodes: `tour` (every library
scene, a scene registered by the page, terminal sessions of the `avatars`
command, grounding against `docs/tour.md`) and `wardrobe` (its `episode.json`
switches to the `blazer-glasses` look and the `daylight` theme).

## Runtime

### Loading

An episode page is a HyperFrames composition. It loads three generated files
from its `vendor/` directory and its narration:

```html
<script src="vendor/gsap.min.js"></script>
<script src="vendor/avatars.js"></script>
<script src="assets/voice/lines.js"></script>
<link rel="stylesheet" href="vendor/avatars.css" />
```

`vendor/avatars.js` is a concatenation of classic scripts made by the CLI
(`avatars vendor`), in this order:

1. a generated data block that sets `Avatars.data` (see below);
2. `core/determinism.js`, `core/tokens.js`, `core/planner.js`,
   `core/clock.js`, `core/captions.js`, `core/transitions.js`,
   `core/stage.js`, `core/performer.js`;
3. the rig of the cast (`rigs/svg/rig.js`), the base of every cast member
   (`rigs/svg/bases/<id>/base.js`) and every part the cast wears (`part.js`,
   in the order the cast first names them);
4. `core/presenter.js`, `core/episode.js`;
5. every scene (`scenes/<id>/<id>.js`): the library scenes, then the
   project's `scenes`; then every code highlighter of the package
   (`scenes/code/highlight/<lang>.js`, sorted).

`vendor/avatars.css` holds the compiled tokens as custom properties on
`:root`, then `core/core.css`, then each scene's CSS in scene order, then the
format's `format.css` if present. `vendor/gsap.min.js` comes from the `gsap`
package, and the fonts of the theme are copied to `vendor/fonts/<file>` (the
`file` of each font in `theme.json`). The page declares the fonts with inline
`@font-face` rules, because HyperFrames' lint reads only inline styles. The
bundle is deterministic: the same library, project and episode give the same
bytes.

Every runtime file is an IIFE over `typeof window !== "undefined" ? window :
globalThis` and adds to one namespace:

```js
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});
  // ...
})(typeof window !== "undefined" ? window : globalThis);
```

### Page structure

The page head is the contract that `avatars new episode` writes and
`avatars check` verifies:

```html
<html lang="en" data-composition-variables='[{"id":"captions","type":"boolean","label":"Burned-in captions","default":true}]'>
<head>
  <meta name="viewport" content="width=1920, height=1080" />
  <!-- the scripts and stylesheet above -->
  <style>
    @font-face { font-family: "Inter"; font-weight: 400; src: url("vendor/fonts/inter-400.woff2") format("woff2"); }
    /* … exactly the theme's fonts */
  </style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080"></div>
<script>
  const tl = gsap.timeline({ paused: true });
  Episode.create({ tl, id: "first-steps", title: "First steps", series: "First steps" })
    .intro({ /* … */ })
    .outro({ /* … */ })
    .done();
  window.__timelines["main"] = tl;
</script>
```

The timeline, `Episode.create` and the `window.__timelines` registration stay
inline, because HyperFrames' lint reads only inline scripts. The viewport and
the root's `data-width` and `data-height` match the format's canvas. The
composition variable `captions` turns the burned-in captions off
(`avatars publish` renders with `{"captions": false}`).

Inside the root, the builder adds one `<section class="scene scene-<kind>"
id="s<n>-<kind>">` per scene in order (`kind` is the scene name;
`terminal-wide` for a wide terminal), then above the scenes:

- `.presenter-frame[data-role="host"]` holding `.presenter-bg`,
  `.presenter-stage` (the rig's `<svg>`) and `.presenter-ring`;
- the talk scene's name tag `.lower-third`;
- `#captions`, a `.cap-box` of `span.cap-w` words, `.on` once spoken;
- `#blackout`, the final fade;
- one `<audio id="vo-<line>" data-start data-duration>` per spoken line,
  which HyperFrames mixes into the render.

The class names of `core/core.css` and of the scenes' CSS (`.bg-glow`,
`.bg-grid`, `.chapter`, `.slide-title`, `.card`, `.kicker`, `.headline`,
`.icon`, `.term-bar`, `.term-body`, `.code-panel`, `.bullet`, `.dnode`, …)
are part of the episode CSS contract: pages may style them.

`done()` publishes `window.__episode = { id, title, duration, chapters:
[{ title, start }], cues: [{ start, end, text }], lines: [{ id, text, start,
end }], terminal }` for the CLI: chapters for the player, caption cues for
WebVTT, line spans and the terminal and code content (`terminal`: `{ cmd, at }`
and `{ out, at, code? }` items) for `avatars check`. A page may add
`window.__episode.presenter = { name, disclosure }` for the published
manifest.

### Namespaces and registries

| Name | Set by | Contents |
| --- | --- | --- |
| `Avatars.data` | generated block | `{ tokens, format, brand, icons, cast, bases, parts }`, all plain JSON |
| `Avatars.math` | `core/determinism.js` | `clamp`, `lerp`, `smooth`, `f1`, `mulberry32`, `makeNoise` |
| `Avatars.tokens` | `core/tokens.js` | `get(name)`, `num(name)` (`"26px"` → 26), `color(name, alpha?)` → `"rgba(r, g, b, a)"`, `has(name)`, `parse(css)` → `{ r, g, b, a }` or `null`, `values`; `get` throws for an unknown token |
| `Avatars.performer` | `core/performer.js` | `create(opts)`, `VISEMES`, `MOODS`, `EXPR_KEYS`, `TEMPERAMENT` |
| `Avatars.rigs` | `rigs/<rig>/rig.js` | `Avatars.rigs.svg.create(container, member, performer)` → `{ render(t), svg }` |
| `Avatars.bases`, `Avatars.parts` | `rigs/svg/rig.js`, filled by `base.js` and `part.js` | `register(id, impl)`, `get(id)`; `get` throws for an id that is not loaded |
| `Avatars.createPresenter` | `core/presenter.js` | `(role, container, tracks) → presenter` |
| `Avatars.transitions` | `core/transitions.js` | `register(name, fn)`, `get(name)`, `names()`; built in: `push`, `iris`, `blur`; `fn(tl, from, to, at, dur, opt)` |
| `Avatars.scenes` | `core/episode.js` | `register(name, build)`, `get(name)`, `names()` |
| `Avatars.highlight` | `core/episode.js` | `register(lang, fn)`, `get(lang)`, `names()` and the helpers `esc(text)`, `span(cls, text)`, `splitComment(line, re)`; `fn(line)` returns HTML with spans of class `k` (keys), `s` (strings), `c` (comments), `w` (keywords), `p` (punctuation); `scenes/code/highlight/` registers `yaml`, `sh`, `c`, `conf`, `json` and `text` (the fallback) |
| `Scenes` | core files and the terminal scene | helpers for scenes: `planner` (`planner.js`); `clock` (`clock.js`); `captions`, `phrasesOf` (`captions.js`); `transition`, `show`, `hide`, `enter` (`transitions.js`); `shot`, `SHOTS` (`stage.js`; `SHOTS` is `Avatars.data.format.shots`); `episode`, `vars` (`episode.js`); `terminal` (`scenes/terminal/terminal.js`) |
| `Episode` | `core/episode.js` | `create(opts)`, `icon(name)`, `ICON_PATHS` (the same object as `Avatars.data.icons`; a page may add icons to it) |

`Avatars.data`:

```js
{
  tokens: { "color.bg": "#0f172a", "motion.transition.push": 0.7, ... }, // resolved, flat
  format: { /* format.json */ },
  brand:  { name, wordmark, tagline, role, links: [[label, text], ...],
            marks: { emblem: { viewBox: [x, y, w, h], body: "<rect .../>..." }, badge: {...} } },
  icons:  { check: "<circle .../><path .../>", ... },                    // inner SVG markup, 24×24
  cast:   { host: { /* resolved cast member, see Avatars and looks */ } },
  bases:  { "anime-600x800": { /* base.json */ } },
  parts:  { "hair/long-bangs": { /* part.json */ }, ... },
}
```

The narration is `window.AVATAR_LINES` from `assets/voice/lines.js`, or the
`lines` option of `Episode.create`. `Scenes.planner(lines)` lays lines out on
the timeline with a cursor: `t`, `at(t)`, `wait(d)`, `say(id, { gap })` →
`{ id, line, start, end, word(q, n), wordEnd(q, n) }`, `said`, `speech()` and
`audio(root, dir)`. `Scenes.clock(tl, duration, renderers)` adds one tween
that calls every renderer with the timeline time, so per-frame content
(presenter, captions, terminals) renders at any seek.

## Performer and pose

`Avatars.performer.create(opts)` returns `{ poseAt(t), mouthAt(t), exprAt(t),
gazeAt(t), headAt(t), tracks }`. Options:

- `speech`: one segment or a list, each `{ offset, visemes: [[start, end,
  viseme, weight?], ...], envelope?: { fps, values } }`, times relative to
  the segment's offset in seconds.
- `expressions`: `[{ t, name, blend? }]` (mood changes; `blend` defaults to
  0.3 s; `neutral` at 0 unless an entry starts there).
- `gaze`: `[{ t, x, y }]`, `x` and `y` in -1..1, `x < 0` towards the left of
  the screen; `{ t: 0, x: 0, y: 0 }` unless an entry starts at 0.
- `gestures`: `[{ t, name, dur? }]`; `dur` defaults to 1.8 s.
- `seed` (default 7), `maxDuration` (default 600): blinks and idle motion
  are seeded noise over that span.
- `moods`: mood name → expression parameters (merged over `MOODS` per mood
  and per parameter).
- `temperament`: motion constants (merged over `TEMPERAMENT`).

The vocabulary is the contract between scenes, the performer and every rig:

- **Visemes**: `sil mbp aa ah ee ih oh ou fv th cdg sz ch l r w`, each
  `{ open, wide, round, teeth }` in 0..1. Unknown visemes count as `sil`.
- **Moods**: `neutral happy joy surprised thinking concerned smug wink`. Every
  avatar renders all of them; an avatar may add more. An unknown mood shows
  as `neutral`, and the performer logs a console warning once per name,
  which `avatars check` reports.
- **Expression parameters** (`EXPR_KEYS`): `brow` (-1 frown .. 1 raised),
  `browTilt` (+ worried), `eye` (openness), `squint`, `happyEyes` (^^ arcs),
  `smile` (-1..1), `mouthOpen`, `blush`, `pupil` (scale), `winkL`, `winkR`.
- **Gestures**: `wave`. A rig ignores a gesture its base does not list, and
  `avatars check` warns about it.

`poseAt(t)` returns, for `t` clamped to ≥ 0:

```js
{
  t,
  expr:    { brow, browTilt, eye, squint, happyEyes, smile, mouthOpen, blush, pupil, winkL, winkR },
  mouth:   { open, wide, round, teeth, energy },   // after coarticulation and loudness
  gaze:    { x, y },                               // including micro-saccades
  head:    { rot, x, y, yaw },                     // degrees, base units, base units, -1..1
  headLag: { rot, x, y, yaw },                     // head at max(0, t - temperament.lag)
  breath,                                          // -1..1, sin(2π t / breathPeriod)
  blink,                                           // 0 open .. 1 closed
  gestures: [{ name, t, dur, d }],                 // active gestures, d = time since start
}
```

`expr` always holds every key of `EXPR_KEYS`; keys a mood leaves out are
those of `neutral`, else 0. A mood change blends from the previous mood with
a smoothstep over its `blend`.

`TEMPERAMENT` holds the motion constants of the reference avatar; an avatar
overrides any of them in `avatar.json`:

| Key | Default | Meaning |
| --- | --- | --- |
| `lipKernel`, `lipGain` | 0.035, 1.3 | coarticulation half-width (s), jaw gain |
| `blinkFirst` | [0.8, 1.5] | first blink at `a + rnd·b` s |
| `blinkEvery` | [2.2, 3.4] | interval `a + rnd·b` s |
| `blinkDouble`, `blinkDoubleGap` | 0.18, 0.32 | double-blink chance, gap (s) |
| `sway`, `swayGaze` | 2.2, 2.5 | head roll from noise and from gaze (degrees) |
| `nod`, `nodRate`, `talkNod`, `talkNodRate` | 3, 1.3, 4, 9.5 | head nod from noise and from speech energy |
| `shift`, `shiftGaze` | 6, 8 | sideways head shift from noise and gaze (base units) |
| `yawGaze`, `yawNoise`, `yawNoiseRate` | 0.6, 0.25, 0.7 | fake head turn |
| `gazeBlend` | 0.18 | gaze change duration (s) |
| `saccadeStep`, `saccadeX`, `saccadeY` | 0.9, 0.12, 0.08 | micro-saccade period and size |
| `breathPeriod` | 4.2 | seconds per breath |
| `lag` | 0.18 | delay of hair and accessories behind the head (s) |

## Rigs, bases, slots

A rig turns poses into pixels. The SVG rig creates one `<svg>` per presenter
with the base canvas as its `viewBox` (100 % of its container, overflow
visible), a `<defs>` element and the layer tree of the base. It hides the
slots in `member.hidden` (`display="none"`), then builds every part in cast
order. Each frame it computes the pose, lets the base apply it to the bones
and calls every part's `update`. Ids are unique per presenter, so several
presenters can share a page: `<avatar><n>-<part slug>-<name>`,
`<avatar><n>-clip-<name>` and `<avatar><n>-base-<name>`.

A **base** is `base.json` (data, read by the CLI and the runtime) plus
`base.js` (behaviour):

```json
{
  "id": "anime-600x800",
  "canvas": [600, 800],
  "anchors": { "face": { "center": [300, 283], "height": 382 }, "neck": [300, 500] },
  "slots": ["hair-back", "neck", "top", "chest", "face", "face-shadow", "blush", "nose",
            "eyes", "mouth", "eyewear", "hair-front", "hair-side", "hair-top", "headwear",
            "hair-accessory", "brows", "sleeve", "hand"],
  "clips": ["face"],
  "gestures": ["wave"]
}
```

```js
Avatars.bases.register("anime-600x800", {
  layers(ctx) { /* build the group tree under ctx.svg; return { [slot]: <g> } */ },
  apply(ctx, pose) { /* set bone transforms and gesture groups for this pose */ },
});
```

`layers(ctx)` and `apply(ctx, pose)` receive the same per-presenter context
`{ svg, defs, el, id, url, clip, math, base, member }`. `layers` returns the
slot groups and may keep its bones on the context for `apply` (the anime base
uses `ctx.bones`); it references a base clip as
`url(#${ctx.clip("face").id})`.

`slots` lists the layers bottom to top. The `anime-600x800` base nests them
in these bones:

| Slot | Bone | Notes |
| --- | --- | --- |
| `hair-back` | head-back | behind the body; follows the head, shifts against the yaw |
| `neck`, `top`, `chest` | body | breathes |
| `face` | head | rotates about the neck pivot, follows breathing |
| `face-shadow` | head, clipped to `face` | parallax 6 |
| `blush`, `nose`, `eyes`, `mouth` | features, clipped to `face` | parallax 10 |
| `eyewear` | head | parallax 10, unclipped |
| `hair-front`, `headwear` | head | parallax 6 |
| `hair-side`, `hair-top`, `hair-accessory` | head | parts animate their own sway |
| `brows` | head | parallax 10, above the bangs |
| `sleeve` | arm | the gesture arm, rotated by `wave` |
| `hand` | hand | the hand at the end of the sleeve |

`clips` names the clip paths the layers use. The rig creates each one once
per presenter; the part that defines a clip appends its shape to it (the face
part defines `face`). `anchors.face` locates the face for framing: a base
with a different face size or position adds `"framing": { "scale", "offset":
[dx, dy] }`. Shots then scale the stage by `framing.scale` about
`anchors.face.center` and move it by `framing.offset` base units, measured at
the shot's unscaled stage size, so every face sits where the shot expects it;
without `framing` shots apply as given.

## Parts

A part is a directory with `part.json` and `part.js`.

```json
{
  "id": "tops/hoodie",
  "category": "tops",
  "title": "Hoodie with drawstrings",
  "fits": ["anime-600x800"],
  "slots": ["top", "sleeve"],
  "roles": ["top.base", "top.light", "top.dark", "top.inner", "top.seam", "top.trim", "top.trim-tip"],
  "defaults": { "top.base": "{color.slate.800}", "top.trim": "{color.accent}" },
  "colourways": {},
  "hides": [],
  "marks": [],
  "options": {}
}
```

(`defaults` abridged.)

- `id` is `<category>/<name>` for library parts (`parts/<category>/<name>/`)
  and `<avatar>/<name>` for parts only that avatar wears
  (`avatars/<avatar>/parts/<name>/`). `title` and an optional `description`
  say what it draws.
- **Categories.** Identity: `body`, `face`, `eyes`, `brows`, `mouth`, `nose`.
  Wardrobe: `hair`, `tops`, `eyewear`, `headwear`, `accessories`.
- `fits` lists the bases whose slots and geometry the part was drawn for;
  `slots` the slots it draws into.
- `roles` lists every palette role the part paints with; `defaults` gives
  values for roles that neither the avatar nor the look sets; `colourways`
  are named role sets a look can pick.
- `hides` lists slots this part covers; the rig hides them (a cap hides
  `hair-top`).
- `marks` lists the brand marks the part draws (`emblem`, `badge`).
- `options` documents the options a look may pass (`{ name: { type, default,
  description } }`); the defaults apply when a look passes none.

```js
Avatars.parts.register("tops/hoodie", {
  build(ctx) { /* draw into ctx.slot("top") and ctx.slot("sleeve"); return state */ },
  update(ctx, pose, state) { /* optional, every frame */ },
});
```

The part context:

| Member | Meaning |
| --- | --- |
| `slot(name)` | the `<g>` of a slot (a detached group if the base lacks it) |
| `el(tag, attrs, parent)` | create an SVG element |
| `defs`, `id(name)`, `url(name)` | the presenter's `<defs>`, an id unique to this presenter and part, `url(#id)` |
| `clip(name)` | the `<clipPath>` of a base clip (`base.json` `clips`), shared by the base and every part |
| `color(role)` | the resolved colour of a palette role; throws for a role the member's palette lacks |
| `mark(name)` | a brand mark `{ viewBox, body }` or `null` |
| `options` | the part's options: its defaults, then the look's, then the cast entry's |
| `math` | `Avatars.math` |
| `base` | the base's `base.json` |

Parts draw in base units and set every per-frame attribute in `update` from
the pose alone, so frames render in any order. An attribute set on some frames
is set on every frame, hidden elements included (a hidden element returns to
its built state), so a frame's markup never depends on the frames rendered
before it; a base's `apply` follows the same rule. A part may keep an element
in screen orientation by counter-rotating it in `update` (round glasses keep
the angle of their glint with `rotate(-pose.head.rot)` about the lens centre
and slide it by `-pose.head.yaw`), still from the pose alone.

Palette roles are named `<group>.<name>`. The `anime-600x800` parts paint
with `skin.base`, `skin.shade`, `skin.line`, `skin.blush`; `hair.base`,
`hair.light`, `hair.tip`, `hair.dark`, `hair.shine`, `hair.deep`;
`eyes.white`, `eyes.iris-top`, `eyes.iris-mid`, `eyes.iris-low`,
`eyes.pupil` (pupil and iris outline), `eyes.glint`, `eyes.highlight`,
`eyes.lid-shadow`, `eyes.lash`; `brows.color`; `mouth.line`, `mouth.inside`,
`mouth.tongue`, `mouth.teeth`, `mouth.outline`; and the tops `top.base`,
`top.light`, `top.dark`, `top.inner`, `top.seam`, `top.trim`, `top.trim-tip`.
`tops/blazer` adds `top.button` and `top.inner-shade` (the inner top's rib
and shadows) and paints its pocket square with `top.trim`; eyewear parts use
`eyewear.frame`, `eyewear.frame-light` (rim sheen), `eyewear.lens` (tint) and
`eyewear.glint`.

Library parts: `body/anime-slim`, `face/anime-oval`, `eyes/anime-large`,
`brows/anime-soft`, `mouth/anime`, `nose/anime-line`, `hair/long-bangs`,
`tops/hoodie`, `tops/blazer` (colourways `charcoal`, `navy`, `camel`,
`ivory`; option `pocketSquare`, default `true`), `eyewear/round-glasses`
(colourways `black`, `tortoise`, `gold`, `silver`),
`accessories/emblem-patch` (mark `emblem`) and `accessories/emblem-clip`
(mark `badge`, else `emblem`; option `side`). Sindy adds `sindy/ahoge`.

## Avatars and looks

`avatars/<id>/avatar.json`:

```json
{
  "id": "sindy",
  "name": "Sindy",
  "pronunciation": "sˈɪndi",
  "base": "anime-600x800",
  "rig": "svg",
  "identity": ["body/anime-slim", "face/anime-oval", "eyes/anime-large", "brows/anime-soft", "mouth/anime", "nose/anime-line"],
  "palette": { "skin.base": "#fde8dc", "hair.base": "#0d9488" },
  "moods": { "happy": { "smile": 0.85 } },
  "temperament": {},
  "seed": 11,
  "look": "hoodie",
  "voice": "voice.json",
  "lexicon": "lexicon.json",
  "disclosure": "Sindy is an AI-voiced virtual presenter"
}
```

`rig` defaults to `svg`; `disclosure` to "`<name>` is an AI-voiced virtual
presenter". `CHARACTER.md` beside it is the character bible: personality,
writing voice, palette by role, looks, moods and when to use them, voice and
pronunciation.

`avatars/<id>/looks/<name>.json`:

```json
{
  "id": "blazer-glasses",
  "title": "Navy blazer and gold round glasses",
  "wear": ["hair/long-bangs", "sindy/ahoge", "tops/blazer", "eyewear/round-glasses", "accessories/emblem-clip"],
  "colourways": { "tops/blazer": "navy", "eyewear/round-glasses": "gold" },
  "palette": { "top.inner": "#f4fbfb", "top.inner-shade": "#b9d3d6", "top.trim": "{color.accent}" },
  "options": {}
}
```

`colourways` picks a named role set per part, `palette` sets roles, and
`options` maps part ids to options, such as
`{ "accessories/emblem-clip": { "side": "right" } }`. Sindy's looks are
`hoodie` (the default: slate hoodie, emblem patch and clip) and
`blazer-glasses`.

A cast member resolves as follows:

1. parts: the avatar's `identity`, then the look's `wear`, in that order;
   parts named `<avatar>/<name>` resolve only for that avatar;
2. every part must fit the avatar's base and draw only into slots the base
   has, and two parts may not claim the same category unless the category is
   `accessories` or `hair`;
3. palette, later wins: part `defaults`, the selected `colourways`, the
   avatar's `palette`, the look's `palette`, the cast entry's `palette`;
4. role values are colours or token references (`{color.accent}`) resolved
   against the episode's tokens, so a look can follow the theme and brand
   while an avatar's identity colours stay fixed; every role a part lists
   must resolve;
5. options, later wins: the part's option defaults, the look's `options`,
   the cast entry's `options` (both keyed by part id);
6. moods and temperament: the avatar's overrides, which the performer
   merges over `MOODS` and `TEMPERAMENT` (per mood, per parameter).

The resolved member in `Avatars.data.cast[role]`:

```js
{
  role: "host", avatar: "sindy", name: "Sindy", look: "hoodie",
  base: "anime-600x800", rig: "svg", seed: 11,
  disclosure: "Sindy is an AI-voiced virtual presenter",
  moods: {...}, temperament: {...},
  palette: { "skin.base": "#fde8dc", ... },          // resolved colours only
  parts: [{ id: "body/anime-slim", options: {} }, ...],
  hidden: ["hair-top"],                              // slots hidden by parts
}
```

`Avatars.createPresenter(role, container, tracks)` combines the performer and
the member's rig, and returns `{ render(t), svg, poseAt, mouthAt, exprAt,
gazeAt, tracks }`. `tracks` are performer options; `tracks.moods` and
`tracks.temperament` merge over the member's (per mood, per parameter), and
`tracks.seed` wins over the member's seed.

## Design tokens

Token files use the design-token JSON format: a token is an object with
`$value` and optional `$type`, `$description` and `$extensions`; any other
object is a group, and keys starting with `$` in a group are its metadata.
Keys starting with `_` are comments, in groups and in tokens; the compiler
skips them. Values are CSS strings (`"#0f172a"`, `"26px"`,
`"0 30px 80px rgba(0, 0, 0, 0.45)"`, `"\"Inter\", sans-serif"`) or numbers
(seconds, unitless factors). A value that is exactly `"{group.token}"` is an
alias. A colour token may set `"$extensions": { "avatars": { "alpha": 0.28 } }`:
its resolved colour becomes `rgba(r, g, b, 0.28)`.

Tiers, merged in this order (later files override earlier ones token by
token) and resolved after merging, so an alias follows the final value of
its target:

1. **Primitives** in `tokens/*.tokens.json`: colour ramps (the Tailwind CSS
   v3 ramps `slate`, `gray`, `teal`, `cyan`, `sky`, `blue`, `emerald`,
   `amber`, `red`, `rose`, `violet` as `color.<ramp>.<50–950>`, plus
   `color.white` and `color.black`), font families (`font.family.inter`,
   `font.family.jetbrains-mono`), weights
   (`font.weight.regular|semibold|bold|extrabold`), the type scale
   (`font.size.3xs` … `font.size.8xl`, 20–190 px), radii (`radius.2xs` …
   `radius.5xl`, `radius.pill`, `radius.circle`), shadows
   (`shadow.none|md|lg`) and motion (`motion.transition.default` and
   `motion.transition.<kind>`, `motion.shot`, `motion.enter.offset`,
   `motion.enter.duration`, `motion.fade-out`, `motion.tail`). Layout
   (positions, gaps, paddings) stays in scene CSS and `format.json`; there is
   no spacing scale.
2. **Components** in `core/tokens.json` and `scenes/<id>/tokens.json`,
   defaulting to semantic tokens. The shared runtime components in
   `core/tokens.json` are `glow`, `grid`, `chapter`, `presenter`, `caption`,
   `kicker`, `headline`, `slide-title`, `icon`, `window` and `blackout`
   (`<component>.<property>`: `caption.bg`, `window.bar-height`). A scene's
   tokens are namespaced by its id as `<scene>.<element>-<property>`
   (`diagram.node-bg`, `terminal.ff-hold`), or `<scene>.<property>` for the
   scene as a whole (`terminal.cps`, `code.text`).
3. **Theme** in `themes/<id>/theme.tokens.json`: the semantic tokens below,
   plus any component overrides.
4. **Format** in `formats/<id>/format.tokens.json`: `format.width` and
   `format.height` (px), which `core/core.css` sizes the page with, and any
   sizes for its canvas.
5. **Brand** `tokens` in `brand.json`, **project** `tokens` in
   `avatars.json`, **episode** `tokens` in `episode.json`, each a token tree.

Semantic tokens every theme defines:

| Token | Use |
| --- | --- |
| `color.bg`, `color.bg-alt` | scene backgrounds |
| `color.surface`, `color.surface-raised`, `color.surface-sunken`, `color.surface-bar` | panels, cards and nodes, terminals and code panels, window bars |
| `color.border`, `color.border-subtle` | outlines and separators |
| `color.text`, `color.text-strong`, `color.text-muted`, `color.text-dim` | body, headings, secondary text, terminal output |
| `color.accent`, `color.accent-strong` | brand accent and its deep variant |
| `color.accent-soft` | the accent as text and thin lines on the scene background: lighter than `accent` in a dark theme, deeper in a light one |
| `color.info`, `color.info-soft` | the second accent |
| `color.ok`, `color.warn`, `color.danger` | status |
| `color.on-accent` | text on `color.accent-soft` |
| `color.code-comment`, `color.code-keyword` | code colours beyond the accents |
| `font.sans`, `font.mono` | font stacks |
| `font.mono-advance` | advance width of `font.mono` per character, in em; the code and terminal scenes fit their font with it |

The CLI writes every token as a custom property `--av-<name with dots as
dashes>` (`color.text-muted` → `--av-color-text-muted`) and as
`Avatars.data.tokens`. CSS uses only `var(--av-…)`; JS uses
`Avatars.tokens` where GSAP and SVG attributes need concrete values.
Metrics that both CSS and scripts use are tokens, so they share one value:
`window.bar-height`, `code.pad-x`, `code.pad-y`, `code.note-height`,
`terminal.pad-x`, `terminal.pad-y`, `terminal.line-height`.

## Themes, formats, icons, brands

`themes/<id>/theme.json`:

```json
{
  "id": "midnight",
  "title": "Midnight",
  "fonts": [
    { "family": "Inter", "weight": "400", "file": "inter-400.woff2", "src": "@fontsource/inter/files/inter-latin-400-normal.woff2" },
    { "family": "Inter", "weight": "700 800", "file": "inter-800.woff2", "src": "@fontsource/inter/files/inter-latin-800-normal.woff2" }
  ],
  "contrast": [["color.text", "color.bg", 4.5], ["caption.text", "caption.bg", 4.5]]
}
```

(`fonts` and `contrast` abridged.) `src` is a module path resolved from this
package; `file` is the name under `vendor/fonts/`; `weight` is the CSS
`font-weight` of the `@font-face` rule. `contrast` lists
`[foreground, background, minimum ratio]` token pairs; a pair may name
component tokens (`terminal.text` on `window.bg`) where a component does not
sit on the semantic surface its default implies.
`avatars check` warns about every pair below its minimum with the episode's
tokens, compositing a semi-transparent background over `color.bg`.

Library themes:

- `midnight` (dark): slate surfaces, a teal accent and a sky-blue second
  accent. It overrides `presenter.backdrop-inner` (`#155e63`),
  `presenter.backdrop-outer` (`#0f2a3a`) and `diagram.node-accent-bg`
  (`#12303a`).
- `daylight` (light): a slate page with white cards and a deep teal accent.
  It keeps terminals and code panels dark: its `color.surface-sunken`,
  `surface-bar`, `text-dim`, `code-comment` and `code-keyword` are colours
  for those dark windows, and it overrides the component tokens that default
  to page colours: `window.border`, `bar-border`, `title-color`, `shadow`
  and `dot-*`; `terminal.text`, `prompt`, `cursor`, `mark-bg`, `mark-color`
  and `ff-color`; `code.text`, `key`, `string`, `punct`, `hl-bg` and
  `hl-bar`. For a light page it also overrides `glow.accent` and
  `glow.info`, `grid.line`, `presenter.backdrop-inner`, `backdrop-outer` and
  `ring-inset`, `caption.bg`, `border` and `text`, `talk.tag-bg`,
  `intro.disclosure-color`, and `diagram.node-shadow`, `node-accent-bg`,
  `ghost-bg`, `group-fill` and `label-bg`.

Both themes use Inter (400, 600, 700 800) and JetBrains Mono (400, 700) and
set `font.mono-advance` 0.6.

`formats/<id>/format.json` gives the canvas (`width`, `height`), the shot
presets and the geometry the scenes need:

- `shots`: per shot `{ frame: { left, top, width, height, borderRadius },
  stage: { width, left, top }, ring }`, where the frame is the visible
  window, the stage inside it holds the presenter (its height follows the
  base canvas) and `ring` the opacity of the backdrop and ring. Shots:
  `hidden`, `hero`, `full`, `left`, `cornerR`, `cornerL`, `mini`.
- `scenes.diagram`: `areas` per shot (`cornerR`, `cornerL`, and `wide` for
  any other shot; `{ x, y, w, h }`), `node` (`width`, `height`, `tall`,
  `pad`, `label`), `groupLabel` `[dx, dy]`, `edgeGap` `[start, end]` and
  `slack` `[x, y]` (how far a box may reach outside its area before a
  warning).
- `scenes.code`: `areas` (`cornerR`, `wide`), `untitledTop`, `line` (the
  line-height factor), `max` and `min` (font px), `gap` and `noteGap`.
- `scenes.terminal`: `normal` and `wide`, each `{ left, top, width, height,
  max, min }`.

Every format ships `format.tokens.json` with `format.width` and
`format.height`, and the scenes throw without their geometry. The library
format is `landscape-1080p` (1920×1080).

Icons are `icons/<pack>/<name>.svg` with `viewBox="0 0 24 24"`; the CLI keeps
their inner markup, later packs override earlier ones, and the scenes stroke
them with the `icon.stroke` token (`Episode.icon(name)`, an `.icon` tile;
unknown names show `check`). Packs: `core` (`check`, `gear`, `globe`, `key`,
`lock`, `user`, `warn`) and `tech` (`db`, `disk`, `docker`, `host`, `job`,
`network`, `nodes`, `server`, `terminal`). Projects choose packs in
`avatars.json` and may add their own in `library/icons/<pack>/`.

`brand.json` (in the project):

```json
{
  "name": "Demo",
  "wordmark": "demo",
  "tagline": "SHOW · AND · TELL",
  "role": "your demo guide",
  "links": [["Docs", "example.org/docs"], ["Code", "example.org/code"]],
  "marks": { "emblem": "emblem.svg", "badge": "emblem-badge.svg" },
  "tokens": {}
}
```

Only `name` is required. `role` is the presenter's role on the talk scene's
name tag; `links` are the outro's. The intro sets the tagline
`intro.wordmark-gap` (0.125 em) below the wordmark's line box, room for
descenders; a brand sets the token to 0 for no gap. Marks are SVG files
relative to `brand.json`; the CLI keeps their `viewBox` and inner markup
(comments and `<title>` removed). Their names:

- `emblem`: the brand mark. The intro draws `logo` if the brand has one,
  else `emblem`, as inline SVG (`svg.emblem`, 250 px wide at its viewBox's
  aspect ratio); its top-level elements pop in from the centre outwards, each
  scaling about its own centre up to the opacity of its `opacity` attribute.
- `logo` (optional): the intro's mark when the sting should differ from the
  emblem that wardrobe parts wear.
- `badge` (optional): an outlined variant for small sizes; small accessories
  prefer it and fall back to `emblem`.

Wardrobe parts fit a mark's viewBox, centred, into a square (the emblem patch
is 73.92 base units on the chest, the hair clip 49.28) and insert its markup
as is, so a mark must be self-contained: no external references, and no ids,
because a mark drawn several times on a page (intro, patch, clip) would
repeat them. `accessories/emblem-clip` takes the option `side` (`left`, the
default, or `right`, as the viewer sees it); `right` mirrors the placement but
not the mark. A part that draws a mark the brand lacks draws nothing, and
`avatars check` says so.

## Scenes

`Avatars.scenes.register(name, build)` adds `name` as a method of every
episode builder created afterwards; `build(ctx, o)` lays out the scene and
returns nothing, and the method returns the builder. It refuses the names of
the builder's own members (`tl`, `P`, `root`, `time`, `lineEnd`, `feel`,
`look`, `wave`, `gesture`, `glance`, `say`, `custom`, `done`). A scene
directory holds `<name>.js`, `<name>.css`, `tokens.json` and a `README.md`
with its options, the presenter's shot and the default transition. Scenes ask
for shots, moods, glances and gestures by name and never for a particular
avatar.

`Episode.create(opts)` takes `{ tl, id, title, series, root, lines, seed }`:
`tl` (required) is the page's paused timeline, `id` the episode id, `title`
its published title, `series` the prefix of every chapter label and the
intro's default title, `root` the composition root (default
`[data-composition-id]`), `lines` the narration (default
`window.AVATAR_LINES`) and `seed` the presenter's seed (default: the cast
member's, else 11). The builder has `tl`, `P`, `root`, `time(ref)`,
`lineEnd(id)`, `feel(at, mood, blend)`, `look(at, x, y)`, `wave(at, dur)`,
`gesture(at, name, dur)` (`dur` defaults to 2.2 s), `glance(at, hold, x, y)`,
`say(items, mood, gap)`, `custom(kind, o)`, `done({ tail })` and a method per
registered scene.

The scene context:

| Member | Meaning |
| --- | --- |
| `tl`, `P`, `root`, `api` | the timeline, the narration planner, the composition root, the builder |
| `h(tag, attrs, children)`, `svg(tag, attrs, children)` | create HTML and SVG elements (`attrs`: `class`, `text`, `html`, `style` or attributes) |
| `icon(name)` | an icon tile element |
| `time(ref)`, `lineEnd(id)` | resolve a time reference, end of a said line |
| `feel(at, mood, blend)`, `look(at, x, y)`, `glance(at, hold, x, y)`, `gesture(at, name, dur)`, `wave(at, dur)` | acting |
| `say(items, mood, gap)` | narrate lines (`docs/authoring.md`) |
| `begin(kind, o, defaults)` | start a scene: section, transition, shot, chapter → `{ el, t }` |
| `slideFrame(kind, o)` | the shared slide frame → `{ el, t, narrate(), cue(item, i) }` |
| `chapterLabel(o)` | the chapter label element (`o.label`, else `o.chapter`; `null` without) |
| `windowBar(title)` | the bar of a terminal or file window: three dots and a title (`.term-bar`) |
| `shot`, `setShot(name, at, dur, ease)` | the current shot name; move the presenter to a shot |
| `frame`, `stage`, `captionsEl` | the presenter frame, the presenter's stage inside it, the captions layer |
| `chapters`, `scenes`, `renderers`, `shown` | chapter list, scene sections, per-frame renderers `(t) => …`, terminal and code content for `check` |
| `series`, `opts` | the series and the builder options |
| `brand`, `presenter`, `tokens`, `format` | `Avatars.data.brand`, the host's `{ name, role, disclosure }` (`role` from the brand), `Avatars.tokens`, `Avatars.data.format` |

`begin(kind, o, defaults)` inserts the section, adds the transition from the
previous scene (`o.transition`, else `defaults.transition`), moves the
presenter to `o.shot`, else `defaults.shot`, over `motion.shot` seconds when
it differs from the current one, and starts a chapter when `o.chapter` is
set. The first scene shows at 0 without a transition, and its shot is set
without a move. A transition lasts `o.transitionDur`, else the token
`motion.transition.<kind>`, else `motion.transition.default`; an iris opens
at 70 % 45 %.
`slideFrame(kind, o)` begins with `{ transition: "push", shot: "cornerR" }`
and adds the background, chapter label and title; `narrate()` waits
`o.lead` (0.6 s) and says `o.say` in `o.mood` (`neutral`); `cue(item, i)` is
0.15 s before `item.at`, or 0.9 s plus 0.5 s per item into the scene without
one. `custom(kind, o)` begins a scene without content, with a push and the
current shot. The intro ignores `o.shot` and `o.transition`: the presenter
always rises in from `hidden` to `hero`.

`setShot(name, at, dur, ease)` moves the frame, the stage and the ring to the
shot over `dur` seconds (`ease` default `power3.inOut`), or sets them at once
without `dur`. A move to `hidden` cuts the frame, which is then off screen,
while the stage and ring still move. A move never starts before the previous
one has ended; it starts at that end instead. A GSAP `to` tween starts from
what is on screen when it first renders, so overlapping moves on one target
would depend on the frame a render worker's seek starts from; scenes follow
the same rule for their own moves (the code scene's scrolls of a panel).

`done({ tail })` ends the episode `tail` seconds after the last line (default
`motion.tail`) with a fade to black (`motion.fade-out`), creates the host
presenter from the acting tracks, the audio elements, the captions (unless
the `captions` variable is false) and the clock, publishes
`window.__episode` and returns the timeline.

Library scenes: `intro`, `talk`, `slide`, `diagram`, `code`, `terminal`,
`outro`. Projects add scenes from their own `library/scenes/<id>/` directory,
listed in `avatars.json` `scenes`. A page may also register a scene in its
inline script before `Episode.create`; it becomes a method of that page's
builder and gets the full scene context (`examples/demo/episodes/tour`
registers `compare` on `ctx.slideFrame`).

## Voice

The voice tool (`voice/avatar_voice.py`) turns `script.json` into one WAV and
one JSON file per line and a `lines.js` for the page.

`script.json`:

```json
{
  "voice": "sindy",
  "lines": [{ "id": "intro", "text": "Hi, I'm Sindy!", "lead": 0.5 }]
}
```

`voice` (optional) names a preset; `lead` (optional) is seconds of silence
before the line. Line ids are unique file names that are not `.` or `..`
and contain no `/`, `\`, `?`, `#` or `%`, because the page loads
`assets/voice/<id>.wav` by URL; `validate`, the voice tool and
`fixture-voice` reject others. `script SCRIPT -o DIR` writes `<id>.wav`
(mono, 16-bit, the engine's sample rate), `<id>.json` (the line JSON with its
cache key as `hash`), then `index.json` (`[{ id, duration, text }]`) and
`lines.js` (`window.AVATAR_LINES = { id: line JSON without phonemes }`).
Lines whose key and WAV are unchanged are not voiced again; `--force` voices
every line. The audio is normalised to a -1 dBFS peak and ends with 0.15 s of
silence. Every engine produces the same line JSON:

```json
{
  "text": "Hi, I'm Sindy!",
  "voice": "sindy",
  "duration": 1.82,
  "sampleRate": 24000,
  "phonemes": "hˈaɪ, ˈaɪm sˈɪndi!",
  "words": [{ "text": "Hi,", "start": 0.05, "end": 0.31 }],
  "visemes": [[0.05, 0.12, "ih", 1.0]],
  "envelope": { "fps": 100, "values": [0.0, 0.12] },
  "hash": "4f1c2d3e4a5b"
}
```

`avatars/<id>/voice.json` holds the presets:

```json
{
  "default": "sindy",
  "sample": "Hi, I'm Sindy! Today we'll build something together, one step at a time. Ready? Let's go!",
  "presets": {
    "sindy": { "engine": "kokoro", "mix": { "af_heart": 0.6, "af_bella": 0.4 }, "speed": 1.05, "lang": "en-us" },
    "sindy-anime": { "engine": "kokoro", "mix": { "af_heart": 0.6, "af_bella": 0.4 }, "speed": 1.05, "pitch": 2.5, "lang": "en-us" }
  }
}
```

A preset names its `engine` (default `kokoro`). Kokoro presets blend stock
voices by weight in `mix` (required) and set `speed` (0.5 to 2, default 1.0)
and `lang` (default `en-us`). Any preset may set `pitch` in semitones; the
tool applies it with FFmpeg's `rubberband` filter, keeping formants and
length. `-v` also accepts an engine's stock voice names (`af_heart`), which
work without `--voices`.
The preset is `-v`, else the script's `voice`, else voice.json's `default`;
the CLI passes a cast entry's `voice` as `-v`. Sindy's presets are `sindy`
(the default), `sindy-anime`, `sindy-bright` and `sindy-soft`.

Engines are `voice/engines/<name>.py`. Each provides `VERSION` (part of every
cache key), `PHONEMIZER` (the source name `phonemes` prints), `STOCK` (the
voices `samples` auditions), `stock(name)`, `setup(cache)` and `load(cache,
preset)`. `load` returns a speaker with `phonemize(word)` and
`synth(phonemes) → (audio, sampleRate, timings)`: mono float32 audio and one
`Timing(phoneme, start, end)` per phoneme character of the espeak-IPA input.
The tool does the lexicons, word alignment, visemes, envelope, pitch, files
and keys, so every engine produces the same line JSON. Engines import numpy
and their model libraries lazily, and report failures as `EngineError`. The
Kokoro engine (Kokoro-82M through kokoro-onnx 0.6.1) keeps
`kokoro-v1.0-timed.onnx` (the upstream model with its duration predictor
exposed as an output) and `voices-v1.0.bin` at the top of
`AVATARS_VOICE_CACHE` (default `~/.cache/avatars-voice`).

A lexicon file is `{ "_comment": "…", "words": { word: phonemes } }`. Keys
are lowercase whole words. A word uses an entry when both are equal after
lowercasing and stripping surrounding punctuation (every Unicode punctuation
character, plus `` ` `` and `*`; a word of punctuation alone keeps it), so
“kubectl”, `` `kubectl` `` and `*kubectl*` use `kubectl`; inner punctuation
stays (`nginx.conf`). Values are espeak IPA with spaces between spoken parts
(`"kubectl": "kjˈuːb kəntɹˌoʊl"`). Library packs: `en-us/core` (general
English and software terms) and `en-us/hpc` (HPC daemons, commands and
libraries). Lexicons merge in this order, later wins: the project's
`lexicons` list in order, with the avatar's lexicon inserted before the first
project file (or last when there is none); in the usual order that is the
library packs, then the avatar's lexicon, then the project's files.

A line's cache key is the first 12 hex characters of a SHA-256 over its text,
the preset name, the preset, the lexicon entries its words use (sorted), the
tool's and engine's versions and, when it is not 0, its `lead`. Adding a word
to a lexicon voices again only the lines that contain it.

```text
python3 voice/avatar_voice.py setup [--voices F]
python3 voice/avatar_voice.py say TEXT -o BASE [--voices F] [-v PRESET] [--lexicon F]... [--lead S]
python3 voice/avatar_voice.py script SCRIPT -o DIR [--voices F] [-v PRESET] [--lexicon F]... [--force]
python3 voice/avatar_voice.py keys SCRIPT [--voices F] [-v PRESET] [--lexicon F]...
python3 voice/avatar_voice.py phonemes [TEXT] [-s SCRIPT] [--voices F] [-v PRESET] [--lexicon F]... [--flagged]
python3 voice/avatar_voice.py samples -o DIR [--voices F] [--lexicon F]... [--text T]
```

- `setup` downloads and prepares the model of every engine the presets use
  (default: Kokoro).
- `keys` prints `{ line id: cache key }` and needs neither the model nor
  numpy; the keys equal the `hash` that `script` writes.
- `phonemes` prints each word with its phonemes, their source (`lexicon` or
  the engine's phonemizer, `espeak`) and flags: `acronym`, `plural-lost`,
  `digits`, `symbols`, `jargon`, `silent`. With `-s` the preset defaults as
  for `script`; without `-v` or `--voices` it uses the default engine in
  `en-us`.
- `samples` voices every preset, then the stock voices of their engines,
  with voice.json's `sample` text unless `--text` is given.

Errors print as `avatar_voice: <message>`; usage errors exit with 2, other
errors with 1.

## Schemas

`core/schemas/` holds `project.schema.json` (`avatars.json`), `episode`,
`brand`, `avatar`, `look`, `part`, `base`, `theme`, `format`, `voice`,
`lexicon`, `script` and `tokens` schemas (JSON Schema 2020-12), plus
`defs.schema.json` for shared definitions. Their `$id` is
`https://github.com/dennisklein/avatars/core/schemas/<name>.schema.json`.
Every manifest may carry `$schema` and keys starting with `_` (comments);
other unknown keys are errors.

## Projects

`avatars.json` at the project root:

```json
{
  "cast": { "host": { "avatar": "sindy", "look": "hoodie" } },
  "theme": "midnight",
  "format": "landscape-1080p",
  "brand": "brand/brand.json",
  "lexicons": ["en-us/core", "./lexicon.json"],
  "icons": ["core", "tech"],
  "scenes": [],
  "episodes": "episodes",
  "renders": "renders",
  "library": "library",
  "tokens": {},
  "grounding": { "sources": ["docs"], "embed": "{{< video \"{id}\" >}}" },
  "checks": [],
  "publish": { "static": "static/videos", "data": "data/videos" }
}
```

Every key is optional. The defaults: the host `sindy` in its default look,
`midnight`, `landscape-1080p`, no brand, lexicons `["en-us/core"]`, icons
`["core", "tech"]`, no project scenes, the directories `episodes`, `renders`
and `library`, no tokens, no grounding, no checks, and `publish` into
`publish/` for both.

- A cast entry is `{ avatar, look, palette, options, voice }`: `palette`
  maps roles to colours or token references, `options` maps part ids to
  options, and `voice` names a preset of the avatar's `voice.json`. Every
  episode has a `host`, the presenter that speaks the narration.
- Library ids resolve in the project's `library/` directory first
  (`library/avatars/<id>/`, `library/parts/…`, `library/rigs/…`,
  `library/scenes/<id>/`, `library/themes/<id>/`, `library/formats/<id>/`,
  `library/icons/<pack>/`, `library/lexicons/<lang>/<pack>.json`), then in
  this package. Primitive and core tokens and the code highlighters always
  come from the package.
- `lexicons` entries that start with `./` or `../` (or are absolute) are
  project files; the others are library packs.
- `scenes` lists project scenes by id; each needs `<id>.js` and may have
  `<id>.css` and `tokens.json`.
- `episodes/<id>/episode.json` (optional) overrides `cast` (merged per role
  and key; `palette` per role name, `options` per part and option),
  `theme`, `format` and `tokens` for one episode.
- `grounding` turns on the check that every terminal command and output line
  and every code line an episode shows appears in a page that embeds it.
  Pages are the Markdown files (`.md`, `.markdown`) under `sources` (files
  or directories relative to the project root, skipping entries that start
  with a dot and `node_modules`) whose text matches `embed` with `{id}`
  replaced by the episode id; whitespace in `embed` may vary, and may be
  absent where it does not separate two words. A command must occur in the
  pages' text; an output or code line must equal a page line, both trimmed
  of trailing whitespace (leading whitespace counts, except a fenced code
  block's common indentation, so a block nested in a list item matches).
  `check` reports a missing page and every ungrounded line as warnings.
- `checks` lists project modules whose default export `async (api) => {}`
  runs after the built-in checks, with `api = { id, dir, episode, project,
  warn(msg), error(msg) }` (`episode` is `window.__episode`). A check that
  throws is an error.
- `publish` names the output directories of `publish` and `ci`, relative to
  the project root.

## CLI

`avatars <command> [ids | --all] [options] [--project DIR]`. The project is
`--project DIR`, else the nearest directory with `avatars.json` at or above
the working directory; `validate`, `voice-setup`, `sheet` and `gallery` work
without one.

| Command | Does |
| --- | --- |
| `new project DIR [--title T]` | copy `templates/project` into `DIR` (absent or empty) |
| `new episode ID [--title T]` | copy `templates/episode` into `episodes/<ID>/` |
| `vendor ID…` | write `vendor/` for episodes |
| `voice ID… [--force]` | narration through the voice tool into `assets/voice/` |
| `voice-setup` | the voice model of every engine the cast's presets use |
| `phonemes ID… [--flagged]` | how the narration will be pronounced |
| `fixture-voice ID…` | synthetic narration with plausible timings and no audio, for tests and layout work |
| `lint ID…` | HyperFrames lint |
| `check ID… [--quick]` | manifests, fonts, contrast, timeline, warnings, narration, grounding, project checks; without `--quick` also lint and contact sheets |
| `render ID… [--draft]` | `renders/<id>.mp4` with burned-in captions; needs voiced narration |
| `publish ID… [--static DIR] [--data DIR]` | web video (AV1 and Opus in WebM), poster, WebVTT captions and a manifest |
| `hash ID…` | the render hash, printed as `<id>-<hash>` |
| `ci ID… --store DIR [--used FILE]` | voice and publish into the store on a miss, then copy from it |
| `validate` | JSON Schema validation of every manifest of the package (with `examples/demo`) and the project |
| `gallery --out DIR [--theme T]` | avatar sheets and demo contact sheets |
| `sheet AVATAR [--look L] [--mode expr\|visemes\|gaze\|big] [--theme T] -o PNG` | one avatar sheet |

`--all` instead of ids selects every episode that has the file the command
needs (`script.json` for `voice`, `phonemes` and `fixture-voice`, else
`index.html`). Commands that load or render a page (`lint`, `check`,
`render`, `publish`, and `ci` when it renders) first rebuild a stale
`vendor/`. Commands print errors as `avatars: <message>` and exit with 1 on
failures and 2 on usage errors. `AVATARS_PYTHON` names the Python that runs
the voice tool (default `python3`), `AVATARS_VOICE_CACHE` its model
directory and `HYPERFRAMES_BROWSER_PATH` the browser; the CLI runs
HyperFrames from its own dependency with `HYPERFRAMES_NO_TELEMETRY=1`.

**Templates.** `avatars new` fills `{{id}}` (the project directory's name or
the episode id), `{{title}}` (`--title`, else the id in words:
`first-steps` → "First steps") and `{{font-faces}}` (the theme's
`@font-face` rules; on a line of its own each rule gets that line's indent)
in every text file. `--title` and the project directory's name are filled in
unescaped, so they must not contain `"`, `\`, `<`, `>` or control characters
(a bad `--title` is a usage error). A template stores `.gitignore` as
`gitignore`, because npm leaves `.gitignore` files out of packages. Episode
ids are lowercase letters, digits, dots, dashes and underscores.

**Render hash.** The first 16 hex characters of a SHA-256 over: the tag
`avatars-render/1`; the episode's own files in sorted relative paths (a
symbolic link counts as the file or directory it points to; dangling links
and links back to a directory above are left out; skipping `vendor`,
`renders`, `snapshots`, `.hyperframes` and `node_modules` anywhere, and
`assets/voice`); the vendor files in bundle order; the JSON of the voice
tool's `keys` for the episode (`{}` without lines); the HyperFrames version;
and the source of `cli/lib/publish.mjs`.
Nothing in it depends on where the project or the package are checked out,
so a library change re-renders exactly the episodes whose bundle or voice it
changes.

**check.** Before it loads the page, `check` validates `avatars.json`,
`brand.json`, `episode.json` and `script.json`, resolves the episode,
rebuilds a stale `vendor/`, requires narration, requires the page head to
declare exactly the theme's `@font-face` rules (and prints them), warns about
brand marks the cast draws but the brand lacks and about theme contrast pairs
below their minimum. It loads the page in the HyperFrames browser, recording
the presenters it creates by wrapping `Avatars.createPresenter`, and reports:

- errors: page errors, missing files (except the WAVs of fixture narration),
  network requests, no `window.__episode`, no `script.json`, a script line
  whose text changed since it was voiced, a voiced line whose cache key
  (`hash` in lines.js) differs from the voice tool's `keys` because its
  preset, lexicon entries or `lead` changed (only computed when a line is
  voiced, so fixture narration needs no Python; a voice tool that cannot run
  is an error), failing project checks, and without `--quick` a failing lint
  or snapshot;
- warnings: console warnings and errors, gestures the presenter's base does
  not list, text cut off in diagram nodes, a brand wordmark in the intro
  whose text ends right of the hero shot's presenter frame
  (`shots.hero.frame.left`), fixture narration (one warning),
  script lines never said, more than 2.5 s without narration between two
  lines, a `window.__episode.id` that differs from the directory, no page
  that embeds the episode, ungrounded terminal and code lines, and the
  project checks' warnings.

It prints the timeline (chapters and the start of every line) and, without
`--quick`, runs `hyperframes lint` and writes two stills per chapter (in the
middle and 0.35 s before the next chapter) as contact sheets into
`episodes/<id>/snapshots/`. Errors fail the command; warnings do not.

**publish.** `publish` reads `window.__episode` in the browser, renders a
master at standard quality without burned-in captions, and writes `<id>.webm`
(AV1 by SVT-AV1 at preset 10, CRF 40 and `tune=0`, Opus 64 kbit/s mono, cues
at the front), `<id>.jpg` (the frame at min(2.6 s, duration − 0.5 s), 1280 px
wide) and `<id>.vtt` (the caption cues, with `&`, `<` and `>` escaped) to the
static directory and `<id>.json` to the data directory: `--static` and
`--data`, else `publish` in `avatars.json`. It needs voiced narration (it
refuses fixture narration, as `render` does) and does not voice. Files are
named after the episode directory.

```json
{
  "title": "…", "duration": 45.2, "length": "0:45", "bytes": 2830000,
  "presenter": { "name": "Sindy", "disclosure": "Sindy is an AI-voiced virtual presenter" },
  "chapters": [{ "title": "…", "start": 0, "time": "0:00" }]
}
```

`presenter` is `window.__episode.presenter` if the page sets it, else
`{ name, disclosure }` of `Avatars.data.cast.host`; it is left out when
neither exists.

**ci.** `ci` computes `<id>-<hash>` and treats `<store>/<id>-<hash>/` with
its `<id>.json` as a hit. On a miss it voices the episode, publishes it into
`<id>-<hash>.tmp` and renames that into place. Then it copies the video, poster
and captions into the static directory and the manifest into the data
directory (`--static`, `--data` or `publish`), and appends the key to
`--used`, so a workflow can prune the entries no episode uses.

**validate.** It checks the package's manifests (avatars, looks, parts,
bases, themes, formats, lexicons, token files and the templates' JSON),
`examples/demo` when the package has it, and the project with its library.
Beyond the schemas it checks that ids match their locations and categories
their directories, that named files exist (an avatar's voice, lexicon and
default look, a brand's marks, a project's brand, lexicon files and check
modules), that theme fonts resolve, that voice.json's `default` is a preset
and that line ids are unique. It prints one `file: message` line per problem
and `validate: N files, M problems`.

**gallery and sheets.** `avatars gallery --out DIR` writes `DIR/index.html`
(`gallery/index.html` filled), `DIR/avatars/<avatar>-<look>-expr.png` and
`-visemes.png` for every avatar and look of the package and the project
library (a project avatar shadows a package avatar of the same id), and
`DIR/episodes/<theme>/<episode>/contact-sheet-*.jpg` for every
`examples/demo` episode in every theme, with an episode's own theme removed
and fixture narration when it is not voiced. Each run first removes
`DIR/avatars/` and `DIR/episodes/` of an earlier run; when either holds
anything a run does not write, it fails and names that directory, without
removing anything. Sheets must succeed; demo stills are best effort and
reported. `avatars sheet` draws `gallery/sheet.html` next
to a vendor bundle for a cast of that avatar and look, in the project's theme
(else `midnight`, or `--theme`) with the project's brand marks (none without
a project), and takes a full-page screenshot at 1300 px wide. Every cell uses
seed 3. Modes: `expr` (`Avatars.performer.MOODS`, then the avatar's own
moods), `visemes`, `gaze` (left, right, up, down right) and `big` (neutral,
and talking happily with a wave where the base lists it, at 600 px).

**Tools.** `cli/tools/` holds scripts for library work:

- `frame-diff.mjs <id>` (options `--project DIR`, `--at 1,2.5,...`,
  `--step 1`, `--out DIR`) seeks as HyperFrames does (pause,
  `totalTime(t)`) at frame times in order, in reverse and in order again, and
  compares the rendered DOM state (attributes, inline custom properties,
  computed animated properties of visible nodes) and the pixels. A DOM that
  depends on the seek order fails (exit 1); pixel-only differences are
  reported as raster noise.
- `mouth-stats.mjs <line.json>` (options `--bundle avatars.js`,
  `--avatar ID`, `--look L`, `--project DIR`, `--fps 30`) prints
  mouth-opening statistics of a line, to tune `lipKernel` and `lipGain`.
- `shot.mjs <file.html> <out.png> [query] [width] [height]` screenshots a
  page with the HyperFrames browser.

## Integrations

- `integrations/hugo/`: `layouts/shortcodes/video.html` and
  `assets/avatars/video.css`, copied into a site or mounted from a Hugo
  module import of `github.com/dennisklein/avatars`. `{{< video "<id>" >}}`
  reads the manifest from site data (`params.avatars.data`, default
  `videos`) and the WebM, poster and WebVTT captions from
  `params.avatars.static` (default `videos`) under `params.avatars.staticDir`
  (default `static`). It renders nothing unless the manifest and the WebM
  exist. The first video of a page links the stylesheet (unless
  `params.avatars.stylesheet = false`) and a script for the chapter buttons
  that also reveals a download link under every video whose AV1 the browser
  cannot decode.
  Captions use `params.avatars.captions.lang` and `.label` (default `en`,
  `English`). Markup: `figure.av-video#video-<id>`, `.av-video-title`,
  `ol.av-video-chapters > li > button[data-t]`. Colours come from
  `--av-video-accent`, `-border`, `-bg`, `-muted`, `-screen` and `-radius`.
  It needs Hugo 0.128 or later.
- `integrations/github/render/`: a composite action with the inputs
  `project` (`.`), `store` (`.avatars-store`), `cache-key-prefix`
  (`avatars-renders`), `python-version` (`3.12`) and `install-ffmpeg`
  (`true`), and the outputs `used`, `store` and `rendered`. It runs the CLI
  of the package the project installed (`node <package>/cli/avatars.mjs`),
  restores the newest store saved under `<prefix>-run-` and hashes every
  episode (`avatars hash --all`). Only when an episode is missing from the
  store does it install FFmpeg, the voice tool's packages, the voice model
  (cached as `avatars-voice-<os>-<hash of voice/engines/*.py>`) and the
  HyperFrames browser. It then runs `avatars ci --all --store --used`,
  prunes store entries outside the used list after a successful run, and
  saves the store as `<prefix>-run-<run id>-<attempt>` when it changed.
- `.claude-plugin/`: the marketplace `avatars` lists the plugin `avatars`
  with source `./skills` and the plugin manifest inline (no `plugin.json`),
  so the plugin is the skills alone: installing it copies `skills/` and
  installs no npm dependencies. Its id is `avatars@avatars` and its skills
  are `/avatars:<skill>`. Projects enable it in `.claude/settings.json`: they
  set `extraKnownMarketplaces.avatars.source` to
  `{ "source": "github", "repo": "dennisklein/avatars", "ref": "<tag>" }`
  and `enabledPlugins["avatars@avatars"]` to `true`
  (`integrations/claude-code/README.md`).

## Versioning

Projects depend on a tag,
`"@dennisklein/avatars": "github:dennisklein/avatars#semver:^0.1"`; the
lockfile pins the commit. A
change to the vocabulary, a registry or context signature, a schema or a slot
is breaking. Changes that alter pixels or sound of existing episodes are
listed in the release notes, because they re-render every episode they
touch. A release sets the same `version` in `package.json` and in the plugin
entry of `.claude-plugin/marketplace.json`; Claude Code replaces a cached
plugin only when that version changes.

## Licence

Code, artwork and characters are licensed under Apache-2.0, copyright Dennis
Klein. Source files carry SPDX headers:

```js
// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
```

`REUSE.toml` covers files without comments (JSON, SVG, Markdown, HTML,
images).
