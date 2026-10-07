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
| Token | a named design value (colour, font, size, radius, shadow, timing) in the design-token JSON format | `tokens/` (primitives), `core/tokens.json`, `scenes/*/tokens.json` (components) |
| Theme | semantic tokens that give a look and feel, brand-neutral | `themes/<id>/` |
| Format | canvas size and layout geometry: safe areas, content areas, shot presets | `formats/<id>/` |
| Brand | a project's identity: name, wordmark, tagline, marks, links, presenter role, token overrides | the project (`brand/`) |
| Icon | a 24 px stroke icon, one SVG file | `icons/<pack>/<name>.svg` |
| Scene | a builder method that lays out one part of an episode, styled only through tokens | `scenes/<id>/` |
| Performer | turns narration timings, moods, gaze and gestures into a pose per frame | `core/performer.js` |
| Pose | the plain numbers that describe the avatar at one instant | contract below |
| Rig | draws a pose; the SVG rig mounts parts into the slots of a base | `rigs/<id>/` |
| Base | a body type: canvas, anchors, slot layers and bone transforms | `rigs/svg/bases/<id>/` |
| Part | a drawable piece filling one or more slots, painted with palette roles | `parts/<category>/<name>/`, `avatars/<id>/parts/<name>/` |
| Avatar | an instructor: identity parts, palette, mood strengths, temperament, voice, character bible | `avatars/<id>/` |
| Look | one dressing of an avatar: wardrobe parts plus palette overrides | `avatars/<id>/looks/<name>.json` |
| Cast | the presenters of an episode by role (`host`) | project and episode configuration |
| Voice preset | engine, voice blend, speed and pitch of an avatar | `avatars/<id>/voice.json` |
| Lexicon | pronunciation overrides, merged in layers | `lexicons/<lang>/<pack>.json`, `avatars/<id>/lexicon.json`, the project |
| Project | a consumer: configuration, brand, lexicon, checks and episodes | outside this repository |
| Episode | one video: `script.json` (narration) and `index.html` (a chain of scene calls) | the project (`episodes/<id>/`) |

## Repository layout

```text
core/                    runtime shared by every episode (browser scripts, CSS, component tokens)
  schemas/               JSON Schemas of every manifest
tokens/                  primitive tokens: colour ramps, type, space, radii, motion
themes/<id>/             theme.json (fonts) and theme.tokens.json (semantic tokens)
formats/<id>/            format.json (canvas, shots, scene geometry), optional format.tokens.json, format.css
icons/<pack>/            one SVG per icon
scenes/<id>/             <id>.js, <id>.css, tokens.json, README.md
rigs/svg/                rig.js and bases/<id>/{base.json, base.js}
parts/<category>/<name>/ part.json and part.js
avatars/<id>/            avatar.json, CHARACTER.md, voice.json, lexicon.json, parts/, looks/
voice/                   text-to-speech tool and engines (Python)
lexicons/<lang>/         pronunciation packs
cli/                     the `avatars` command and its library
integrations/            Hugo shortcode, GitHub Actions composite action
gallery/                 catalogue pages: avatar sheets and scene contact sheets
templates/               project and episode templates for `avatars new`
examples/demo/           a neutral project that tests and the gallery render
skills/                  Claude Code skills, shipped as a plugin (.claude-plugin/)
docs/                    guides
test/                    Node test suites (voice/tests/ for Python)
```

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
3. the rig (`rigs/svg/rig.js`), the base of every cast member
   (`rigs/svg/bases/<id>/base.js`) and every part the cast wears (`part.js`);
4. `core/presenter.js`, `core/episode.js`;
5. every scene (`scenes/<id>/<id>.js`) and code highlighter
   (`scenes/code/highlight/<lang>.js`).

`vendor/avatars.css` holds the compiled tokens as custom properties on
`:root`, then `core/core.css`, then each scene's CSS in scene order, then the
format's `format.css` if present. The fonts named by the theme are copied to
`vendor/fonts/<family-slug>-<weight>.woff2`; the page declares them with inline
`@font-face` rules, because HyperFrames' lint reads only inline styles.

Every runtime file is an IIFE over `typeof window !== "undefined" ? window :
globalThis` and adds to one namespace:

```js
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});
  // ...
})(typeof window !== "undefined" ? window : globalThis);
```

### Namespaces and registries

| Name | Set by | Contents |
| --- | --- | --- |
| `Avatars.data` | generated block | `{ tokens, format, brand, icons, cast, bases, parts }`, all plain JSON |
| `Avatars.math` | `core/determinism.js` | `clamp`, `lerp`, `smooth`, `f1`, `mulberry32`, `makeNoise` |
| `Avatars.tokens` | `core/tokens.js` | `get(name)`, `num(name)`, `color(name, alpha?)`, `values` |
| `Avatars.performer` | `core/performer.js` | `create(opts)`, `VISEMES`, `MOODS`, `EXPR_KEYS`, `TEMPERAMENT` |
| `Avatars.rigs` | `rigs/*/rig.js` | `Avatars.rigs.svg.create(container, member, performer)` |
| `Avatars.bases` | `base.js` | `register(id, impl)`, `get(id)` |
| `Avatars.parts` | `part.js` | `register(id, impl)`, `get(id)` |
| `Avatars.createPresenter` | `core/presenter.js` | `(role, container, tracks) → presenter` |
| `Avatars.scenes` | `core/episode.js` | `register(name, build)`, `get(name)`, `names()` |
| `Avatars.transitions` | `core/transitions.js` | `register(name, fn)`, `get(name)` |
| `Avatars.highlight` | `core/episode.js` | `register(lang, fn)`, `get(lang)` |
| `Scenes` | core files | helpers for custom scenes: `planner`, `clock`, `captions`, `phrasesOf`, `terminal`, `shot`, `SHOTS`, `transition`, `show`, `hide`, `enter`, `episode`, `vars` |
| `Episode` | `core/episode.js` | `create(opts)`, `icon(name)`, `ICON_PATHS` (same object as `Avatars.data.icons`) |

`Avatars.data`:

```js
{
  tokens: { "color.bg": "#0f172a", "motion.transition.push": 0.7, ... }, // resolved, flat
  format: { /* format.json */ },
  brand:  { name, wordmark, tagline, role, links: [[label, text], ...],
            marks: { emblem: { viewBox: [x, y, w, h], body: "<rect .../>..." }, badge: {...} } },
  icons:  { check: "<circle .../><path .../>", ... },                    // inner SVG markup, 24×24
  cast:   { host: { /* resolved cast member, see Avatars */ } },
  bases:  { "anime-600x800": { /* base.json */ } },
  parts:  { "hair/long-bangs": { /* part.json */ }, ... },
}
```

## Performer and pose

`Avatars.performer.create(opts)` returns `{ poseAt(t), mouthAt(t), exprAt(t),
gazeAt(t), headAt(t), tracks }`. Options:

- `speech`: one segment or a list, each `{ offset, visemes: [[start, end,
  viseme, weight?], ...], envelope?: { fps, values } }`, times relative to
  the segment's offset in seconds.
- `expressions`: `[{ t, name, blend? }]` (mood changes; `blend` defaults to
  0.3 s).
- `gaze`: `[{ t, x, y }]`, `x` and `y` in -1..1, `x < 0` towards the left of
  the screen.
- `gestures`: `[{ t, name, dur }]`.
- `seed` (default 7), `maxDuration` (default 600): blinks and idle motion
  are seeded noise over that span.
- `moods`: mood name → expression parameters (merged over `MOODS`).
- `temperament`: motion constants (merged over `TEMPERAMENT`).

The vocabulary is the contract between scenes, the performer and every rig:

- **Visemes**: `sil mbp aa ah ee ih oh ou fv th cdg sz ch l r w`, each
  `{ open, wide, round, teeth }` in 0..1. Unknown visemes count as `sil`.
- **Moods**: `neutral happy joy surprised thinking concerned smug wink`. Every
  avatar renders all of them; an avatar may add more.
- **Expression parameters** (`EXPR_KEYS`): `brow` (-1 frown .. 1 raised),
  `browTilt` (+ worried), `eye` (openness), `squint`, `happyEyes` (^^ arcs),
  `smile` (-1..1), `mouthOpen`, `blush`, `pupil` (scale), `winkL`, `winkR`.
- **Gestures**: `wave`. A rig ignores a gesture its base does not support, and
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
sized to the base canvas, a `<defs>` element, the layer tree of the base, and
then builds every part in cast order. Each frame it applies the pose to the
bones (through the base) and calls every part's `update`.

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

`clips` names the clip paths the layers use; a part defines them (the face
part defines `face`). `anchors.face` locates the face for framing: a base
with a different face size or position adds `"framing": { "scale", "offset":
[dx, dy] }` so shots place every face alike; without `framing` shots apply
as given.

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
  "defaults": { "top.base": "{color.slate.800}" },
  "colourways": { "navy": { "top.base": "#1e3a8a" } },
  "hides": [],
  "marks": [],
  "options": {}
}
```

- `id` is `<category>/<name>` for library parts (`parts/<category>/<name>/`)
  and `<avatar>/<name>` for parts only that avatar wears
  (`avatars/<avatar>/parts/<name>/`).
- **Categories.** Identity: `body`, `face`, `eyes`, `brows`, `mouth`, `nose`.
  Wardrobe: `hair`, `tops`, `eyewear`, `headwear`, `accessories`.
- `fits` lists the bases whose slots and geometry the part was drawn for.
- `roles` lists every palette role the part paints with; `defaults` gives
  values for roles that neither the avatar nor the look sets; `colourways`
  are named role sets a look can pick.
- `hides` lists slots this part covers; the rig hides them (a cap hides
  `hair-top`).
- `marks` lists the brand marks the part draws (`emblem`, `badge`).
- `options` documents the options a look may pass (`{ name: { type, default,
  description } }`).

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
| `defs`, `id(name)`, `url(name)` | the presenter's `<defs>`, an id unique to this presenter, `url(#id)` |
| `color(role)` | the resolved colour of a palette role |
| `mark(name)` | a brand mark `{ viewBox, body }` or `null` |
| `options` | the options the look passed |
| `math` | `Avatars.math` |
| `base` | the base's `base.json` |

Parts draw in base units and set every per-frame attribute in `update` from
the pose alone, so frames render in any order.

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

`avatars/<id>/looks/<name>.json`:

```json
{
  "id": "hoodie",
  "title": "Slate hoodie with the brand emblem",
  "wear": ["hair/long-bangs", "sindy/ahoge", "tops/hoodie", "accessories/emblem-patch", "accessories/emblem-clip"],
  "colourways": { "tops/hoodie": "navy" },
  "palette": { "top.trim": "{color.accent}" },
  "options": { "accessories/emblem-clip": { "side": "left" } }
}
```

A cast member resolves as follows:

1. parts: the avatar's `identity`, then the look's `wear`, in that order;
   parts named `<avatar>/<name>` resolve only for that avatar;
2. every part must fit the avatar's base, and two parts may not claim the
   same category unless the category is `accessories` or `hair`;
3. palette, later wins: part `defaults`, the selected `colourways`, the
   avatar's `palette`, the look's `palette`, the cast entry's `palette`;
4. role values are colours or token references (`{color.accent}`) resolved
   against the episode's tokens, so a look can follow the brand while an
   avatar's identity colours stay fixed; every role a part lists must
   resolve;
5. moods and temperament: the avatar's overrides, which the performer
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

`Avatars.createPresenter(role, container, tracks)` combines the performer
(with the member's moods, temperament and seed unless `tracks.seed` is set)
and the member's rig, and returns `{ render(t), svg, poseAt, mouthAt,
exprAt, gazeAt, tracks }`.

## Design tokens

Token files use the design-token JSON format: a token is an object with
`$value` and optional `$type`, `$description` and `$extensions`; any other
object is a group. Values are CSS strings (`"#0f172a"`, `"26px"`, `"0 30px 80px
rgba(0, 0, 0, 0.45)"`, `"\"Inter\", sans-serif"`) or numbers (seconds,
unitless factors). A value that is exactly `"{group.token}"` is an alias.
A colour token may set `"$extensions": { "avatars": { "alpha": 0.28 } }`: its
resolved colour becomes `rgba(r, g, b, 0.28)`.

Tiers, merged in this order (later files override earlier ones token by token)
and resolved after merging:

1. **Primitives** in `tokens/*.tokens.json`: colour ramps (`color.slate.900`),
   font families and weights, the type scale, spacing, radii, motion.
2. **Components** in `core/tokens.json` and `scenes/<id>/tokens.json`:
   `<component>.<property>` (`caption.bg`, `terminal.font-max`), defaulting to
   semantic tokens.
3. **Theme** in `themes/<id>/theme.tokens.json`: the semantic tokens below,
   plus any component overrides.
4. **Format** in `formats/<id>/format.tokens.json`: sizes for its canvas.
5. **Brand** `tokens` in `brand.json`, **project** `tokens` in
   `avatars.json`, **episode** `tokens` in `episode.json`.

Semantic tokens every theme defines:

| Token | Use |
| --- | --- |
| `color.bg`, `color.bg-alt` | scene backgrounds |
| `color.surface`, `color.surface-raised`, `color.surface-sunken`, `color.surface-bar` | panels, cards and nodes, terminals, window bars |
| `color.border`, `color.border-subtle` | outlines and separators |
| `color.text`, `color.text-strong`, `color.text-muted`, `color.text-dim` | body, headings, secondary text, terminal output |
| `color.accent`, `color.accent-strong`, `color.accent-soft` | brand accent, its deep and light variants |
| `color.info`, `color.info-soft` | the second accent |
| `color.ok`, `color.warn`, `color.danger` | status |
| `color.on-accent` | text on `color.accent-soft` |
| `color.code-comment`, `color.code-keyword` | code colours beyond the accents |
| `font.sans`, `font.mono` | font stacks |

The CLI writes every token as a custom property `--av-<name with dots as
dashes>` (`color.text-muted` → `--av-color-text-muted`) and as
`Avatars.data.tokens`. CSS uses only `var(--av-…)`; JS uses
`Avatars.tokens` where GSAP needs concrete values. `avatars check` and the
tests verify text contrast for the pairs each theme lists in `theme.json`.

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
  "contrast": [["color.text", "color.bg", 4.5], ["color.text-muted", "color.surface", 4.5]]
}
```

`src` is a module path resolved from this package; `file` is the name under
`vendor/fonts/`; `weight` is the CSS `font-weight` of the `@font-face` rule.
`contrast` lists `[foreground, background, minimum ratio]` token pairs.

`formats/<id>/format.json` gives the canvas (`width`, `height`), the shot
presets (`shots`: `{ frame: { left, top, width, height, borderRadius },
stage: { width, left, top }, ring }` per shot; stage height follows the base
canvas) and the geometry scenes need (`scenes.<id>`: content areas, node and
panel metrics). Shots: `hidden`, `hero`, `full`, `left`, `cornerR`,
`cornerL`, `mini`.

Icons are `icons/<pack>/<name>.svg` with `viewBox="0 0 24 24"`; the CLI keeps
their inner markup and the scenes stroke them with the `icon.stroke` token.
Projects choose packs (`core`, `tech`) and may add their own.

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

Marks are SVG files; the CLI keeps their `viewBox` and inner markup. The
intro scene shows `emblem`, wardrobe parts such as an emblem patch draw
`emblem` and small accessories prefer `badge` (an outlined variant for small
sizes), falling back to `emblem`.

## Scenes

`Avatars.scenes.register(name, build)` adds `name` as a method of every
episode builder; `build(ctx, o)` lays out the scene and returns nothing. A
scene directory holds `<name>.js`, `<name>.css`, `tokens.json` and a
`README.md` with its options, the presenter's shot and the default
transition. Scenes ask for shots, moods, glances and gestures by name and
never for a particular avatar.

The scene context:

| Member | Meaning |
| --- | --- |
| `tl`, `P`, `root`, `api` | the timeline, the narration planner, the composition root, the builder |
| `h(tag, attrs, children)`, `svg(tag, attrs, children)` | create HTML and SVG elements |
| `icon(name)` | an icon tile element |
| `time(ref)`, `lineEnd(id)` | resolve a time reference, end of a said line |
| `feel(at, mood, blend)`, `look(at, x, y)`, `glance(at, hold, x, y)`, `gesture(at, name, dur)`, `wave(at, dur)` | acting |
| `say(items, mood, gap)` | narrate lines (see `docs/authoring.md`) |
| `begin(kind, o, defaults)` | start a scene: section, transition, shot, chapter → `{ el, t }` |
| `slideFrame(kind, o)` | the shared slide frame → `{ el, t, narrate(), cue(item, i) }` |
| `chapterLabel(o)` | the chapter label element |
| `shot` | the current shot name; `setShot(name, at, dur, ease)` moves the presenter |
| `frame`, `captionsEl` | the presenter frame and the captions layer |
| `chapters`, `scenes`, `renderers`, `shown` | chapter list, scene sections, per-frame renderers, terminal and code content for `check` |
| `series`, `opts` | the builder options |
| `brand`, `presenter`, `tokens`, `format` | `Avatars.data.brand`, the host's `{ name, role, disclosure }`, `Avatars.tokens`, `Avatars.data.format` |

Library scenes: `intro`, `talk`, `slide`, `diagram`, `code`, `terminal`,
`outro`. `custom(kind, o)` begins a scene without content. Projects add
scenes from their own `library/scenes/<id>/` directory.

## Voice

The voice tool turns `script.json` into one WAV and one JSON file per line and
a `lines.js` that sets `window.AVATAR_LINES`; any engine must produce the same
line JSON:

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
  "sample": "Hi, I'm Sindy! Let's build something together.",
  "presets": {
    "sindy": { "engine": "kokoro", "mix": { "af_heart": 0.6, "af_bella": 0.4 }, "speed": 1.05, "lang": "en-us" }
  }
}
```

Lexicons map lowercase whole words to phonemes (`{ "words": { "slurm":
"slˈɜːm" } }`). They merge in this order, later wins: the project's
`lexicons` list in order (library packs such as `en-us/core`, then project
files), with the avatar's lexicon inserted right after the library packs.
A line's cache key covers its text, the preset and only the lexicon entries
its words use, so adding a word re-voices only the lines that contain it.
The host speaks every line; `script.json` names the host's preset in
`voice` (default: the avatar's `default` preset).

```text
python3 voice/avatar_voice.py setup
python3 voice/avatar_voice.py say TEXT -o BASE [--voices F] [-v PRESET] [--lexicon F ...] [--lead S]
python3 voice/avatar_voice.py script SCRIPT -o DIR [--voices F] [-v PRESET] [--lexicon F ...] [--force]
python3 voice/avatar_voice.py keys SCRIPT [--voices F] [-v PRESET] [--lexicon F ...]
python3 voice/avatar_voice.py phonemes [TEXT] [-s SCRIPT] [--voices F] [-v PRESET] [--lexicon F ...] [--flagged]
python3 voice/avatar_voice.py samples -o DIR [--voices F] [--text T]
```

`AVATARS_VOICE_CACHE` sets the model directory (default
`~/.cache/avatars-voice`). `keys` prints `{ line id: cache key }` and needs
neither the model nor numpy.

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
  "publish": { "static": "public/videos", "data": "public/videos" }
}
```

- Library ids resolve in the project's `library/` directory first
  (`library/avatars/<id>/`, `library/parts/…`, `library/scenes/<id>/`,
  `library/themes/<id>/`, `library/formats/<id>/`, `library/icons/<pack>/`),
  then in this package.
- `lexicons` entries without `./` or `../` are library packs
  (`lexicons/<lang>/<pack>.json`), the others project files.
- `episodes/<id>/episode.json` (optional) overrides `cast`, `theme`,
  `format` and `tokens` for one episode.
- `grounding` turns on the check that every terminal command and output line
  and every code line an episode shows appears in a page that embeds it:
  pages are the Markdown files under `sources`, and `embed` is the embedding
  snippet with `{id}` for the episode id.
- `checks` lists project modules whose default export `async (api) => {}`
  runs after the built-in checks, with `api = { id, dir, episode, project,
  warn(msg), error(msg) }` (`episode` is `window.__episode`).

## CLI

`avatars <command> [--project DIR]`; the project is the nearest directory with
`avatars.json` above the working directory.

| Command | Does |
| --- | --- |
| `new project DIR`, `new episode ID` | copy a template |
| `vendor ID…` | write `vendor/` for episodes |
| `voice ID…`, `voice-setup`, `phonemes ID` | narration through the voice tool |
| `fixture-voice ID…` | synthetic narration with plausible timings, for tests and layout work without TTS |
| `lint ID…` | HyperFrames lint |
| `check ID… [--quick]` | timeline, warnings, narration, grounding, project checks, lint, contact sheets |
| `render ID… [--draft]` | `renders/<id>.mp4` with burned-in captions |
| `publish ID… [--static DIR --data DIR]` | web MP4, poster, WebVTT captions and a manifest |
| `hash ID…` | the render hash |
| `ci ID… --store DIR [--used FILE]` | render on a cache miss, then publish from the store |
| `gallery --out DIR` | avatar sheets and scene contact sheets of the library |
| `sheet AVATAR [--look L] [--mode M] -o PNG` | one avatar sheet |

`--all` instead of ids selects every episode. The **render hash** covers the
episode's own files, the vendored bundle, the voice cache keys of its lines,
the HyperFrames version and the publish tool, so a library change re-renders
exactly the episodes whose bundle or voice it changes.

`publish` writes `<id>.mp4`, `<id>.jpg` and `<id>.vtt` to the static directory
and `<id>.json` to the data directory:

```json
{
  "title": "…", "duration": 45.2, "length": "0:45", "bytes": 2830000,
  "presenter": { "name": "Sindy", "disclosure": "Sindy is an AI-voiced virtual presenter" },
  "chapters": [{ "title": "…", "start": 0, "time": "0:00" }]
}
```

## Integrations

- `integrations/hugo/`: a `video` shortcode that plays a published episode
  with its poster, captions and chapter buttons, and renders nothing when the
  episode is not published.
- `integrations/github/render/`: a composite action that installs FFmpeg,
  Python and the voice model (cached), then runs `avatars ci` with a store
  kept in the Actions cache.
- `.claude-plugin/`: this repository is a Claude Code plugin marketplace whose
  plugin ships `skills/`. Projects enable it in `.claude/settings.json`.

## Versioning

Projects depend on a tag, `"@dennisklein/avatars":
"github:dennisklein/avatars#semver:^0.1"`; the lockfile pins the commit. A
change to the vocabulary, a registry or ctx signature, a schema or a slot is
breaking. Changes that alter pixels or sound of existing episodes are listed
in the release notes, because they re-render every episode they touch.

## Licence

Code, artwork and characters are licensed under Apache-2.0, copyright Dennis
Klein. Source files carry SPDX headers:

```js
// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
```

`REUSE.toml` covers files without comments (JSON, SVG, Markdown, images).
