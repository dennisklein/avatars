---
name: avatars-design
description: Work on the avatars library itself — add or change an avatar (base, identity parts, palette, moods, temperament, CHARACTER.md, voice.json, lexicon.json), a part, a look, a theme, a format, a scene, an icon or a lexicon pack, and verify the change with validate, avatar sheets, the gallery, frame-diff and a before/after pixel comparison of existing episodes. Use whenever a change touches avatars/, parts/, rigs/, themes/, formats/, tokens/, scenes/, icons/, lexicons/ or core/ of the library or a project's library/ directory, or when deciding whether a library change is breaking or re-renders episodes.
---

# Work on the library

The library is layers that change independently: tokens, themes, formats,
scenes, rigs and bases, parts, looks, avatars and voices. A scene works with
every avatar, an avatar with every theme, a look on every avatar of a
compatible base. Keep it that way.

Read first:

- `DESIGN.md`, the contract: vocabulary, runtime namespaces, the pose, slots,
  the part and scene contexts, tokens, manifests, versioning. Where it and
  the code differ, the code is right unless it is clearly a bug; fix the
  document in the same change.
- `CLAUDE.md`: commands, rules and commit conventions.
- The neighbours of what you change: an existing part, look, theme, scene or
  avatar is the best template, and `core/schemas/` says what each manifest
  may hold.

A project extends the library with the same layout under its `library/`
directory (`library/avatars/<id>/`, `library/parts/<category>/<name>/`,
`library/rigs/svg/bases/<id>/`, `library/scenes/<id>/`,
`library/themes/<id>/`, `library/formats/<id>/`, `library/icons/<pack>/`,
`library/lexicons/<lang>/<pack>.json`). Ids resolve there first, then in the
package. Everything below applies there too, with `npx avatars …` instead of
`node cli/avatars.mjs …`.

## Rules

- **Every frame is a pure function of time.** Runtime code (`core/`,
  `rigs/`, `parts/`, `avatars/*/parts/`, `scenes/`) never uses
  `Math.random`, `Date.now`, timers, `requestAnimationFrame`, CSS animations
  or transitions, or the network. Seeded randomness (`Avatars.math`:
  `mulberry32(seed)`, `makeNoise(seed)`) is drawn while building, or is a
  function of `t`; nothing advances from one frame to the next.
- **The library knows no project.** No names, logos, links, colours or words
  of a project outside a brand; marks, links and the presenter's role come
  from `Avatars.data.brand`.
- **Tokens and palette roles, never literal colours** in scenes: CSS uses
  `var(--av-…)`, scripts `Avatars.tokens`. Parts paint with palette roles.
- Every source file starts with the SPDX lines from `DESIGN.md`; JSON, SVG
  and Markdown carry none (`REUSE.toml` covers them).

## An avatar

`avatars/<id>/` holds:

| File | Contents |
| --- | --- |
| `avatar.json` | `id`, `name`, `pronunciation` (IPA), `base`, `rig`, `identity` (body, face, eyes, brows, mouth, nose parts), `palette`, `moods`, `temperament`, `seed`, `look` (the default), `voice`, `lexicon`, `disclosure` |
| `CHARACTER.md` | the canon that scripts, art and voice stay consistent with: personality and writing voice, look (identity colours by role), looks, expressions (when to use each mood), gestures and gaze, voice, pronunciation, disclosure |
| `voice.json` | presets and the `default` one (`avatars-voice` skill) |
| `lexicon.json` | the avatar's name and words of the character, nothing of a project |
| `looks/<name>.json` | the dressings |
| `parts/<name>/` | parts only this avatar wears, id `<avatar>/<name>` |

Steps:

1. **Base.** Pick one in `rigs/svg/bases/` (its `base.json` lists canvas,
   anchors, slots, clips and gestures). A new body type is a new base
   (below).
2. **Identity parts**, one per category: reuse library parts or draw new
   ones that fit the base.
3. **Palette.** Identity colours (skin, eyes, brows, mouth, and hair even
   though hair is wardrobe) are literal colours in `avatar.json`, so they
   stay fixed in every theme. Every role the cast's parts list must resolve:
   part `defaults`, then the look's colourways, the avatar's `palette`, the
   look's `palette` and the cast entry's, later wins.
4. **Moods.** `moods` overrides the expression parameters (`brow`,
   `browTilt`, `eye`, `squint`, `happyEyes`, `smile`, `mouthOpen`, `blush`,
   `pupil`, `winkL`, `winkR`) per mood and parameter; all eight moods of
   the vocabulary (`neutral happy joy surprised thinking concerned smug
   wink`) must read as themselves, and the avatar may add more.
5. **Temperament.** Motion constants over `TEMPERAMENT` (`DESIGN.md` lists
   them). Tune lip sync with `lipKernel` and `lipGain` until the median
   mouth opening (p50) of a line voiced with the avatar's preset is about
   0.3:

   ```bash
   node cli/tools/mouth-stats.mjs <project>/episodes/<id>/assets/voice/<line>.json --avatar <avatar>
   ```

6. **Voice.** Audition presets with the voice tool's `samples`, write
   `voice.json` and the voice section of `CHARACTER.md`; the name goes in
   `pronunciation` and `lexicon.json`.
7. **Disclosure.** `disclosure` is the line the intro and the published
   manifest show; without it, the avatar's `name` followed by "is an
   AI-voiced virtual presenter".
8. Validate, render every sheet in every theme and look at them (see
   "Verify").

## A base

`rigs/svg/bases/<id>/base.json` (`id`, `canvas`, `anchors.face.center` and
`height`, `anchors.neck`, `slots` bottom to top, `clips`, `gestures`, and
`framing: { scale, offset }` when its face differs in size or position from
the reference base, so shots place every face alike) and `base.js`:

```js
Avatars.bases.register("<id>", {
  layers(ctx) { /* build bones and slot groups under ctx.svg; keep bones on ctx; return { [slot]: <g> } */ },
  apply(ctx, pose) { /* bone transforms and gesture groups for this pose */ },
});
```

Both get `{ svg, defs, el, id, url, clip, math, base, member }`. A base
lists only the gestures it animates; `apply` ignores the others, and
`avatars check` warns about them. Parts that fit another base are other parts.

## A part

`parts/<category>/<name>/part.json` and `part.js`, or
`avatars/<avatar>/parts/<name>/` for a part of one avatar. Categories:
identity `body face eyes brows mouth nose`, wardrobe `hair tops eyewear
headwear accessories`; a cast member wears one part per category, except
`hair` and `accessories`.

| Key | Meaning |
| --- | --- |
| `fits` | the bases whose slots and geometry it was drawn for |
| `slots` | the slots it draws into; each must exist in those bases |
| `roles` | every palette role it paints with, named `<group>.<name>` (`top.trim`, `eyewear.lens`) |
| `defaults` | values for roles neither the avatar nor the look sets; token references (`{color.slate.800}`) follow the theme |
| `colourways` | named role sets a look picks by name |
| `hides` | slots it covers, which the rig hides (a cap hides `hair-top`) |
| `marks` | brand marks it draws (`emblem`, `badge`) |
| `options` | `{ name: { type, default, description } }` a look may set |

Reuse existing role names where the meaning is the same (a new top paints
with the `top.*` roles every look already sets); a new role needs a default,
or every avatar and look that wears the part must set it.

```js
Avatars.parts.register("tops/hoodie", {
  build(ctx) { /* draw into ctx.slot("top") and ctx.slot("sleeve"); return state */ },
  update(ctx, pose, state) { /* optional, every frame */ },
});
```

The part context: `slot(name)`, `el(tag, attrs, parent)`, `defs`, `id(name)`
and `url(name)` (unique per presenter and part), `clip(name)` (the shared
`<clipPath>` of a base clip: the part that defines it appends its shape,
others reference `url(#${ctx.clip("face").id})`), `color(role)`,
`mark(name)` (`{ viewBox, body }` or `null`), `options`, `math`, `base`.

- Draw in base units on the base canvas (the `anime-600x800` face centre is
  at 300, 283, the neck pivot at 300, 500).
- `build` creates the nodes once; `update` sets every per-frame attribute
  from the pose alone (`t`, `expr`, `mouth`, `gaze`, `head`, `headLag`,
  `breath`, `blink`, `gestures`), so frames render in any order. Hair and
  accessories lag behind the head with `pose.head` minus `pose.headLag`.
- A part that draws a mark draws nothing without one, fits the mark's
  `viewBox` centred into its square and inserts the markup as is.
- Never crossfade stacked features with opacity (the result looks ghosted);
  squash them shut and swap opaque states instead.

A part shows up in sheets and the gallery only when a look wears it: add it
to a look (or a look in a scratch project's `library/`) to see it.

## A look

`avatars/<id>/looks/<name>.json`: `id`, `title`, `wear` (wardrobe parts, in
drawing order after the identity), `colourways` (`{ part id: colourway }`),
`palette` (role overrides; token references such as `{color.accent}` make
the look follow the brand) and `options` (`{ part id: { option: value } }`).
Add it to the looks table in `CHARACTER.md` and render its sheets in every
theme.

## A theme

`themes/<id>/theme.json` (`id`, `title`, `description`, `fonts`, `contrast`)
and `theme.tokens.json`, which defines every semantic token:

`color.bg`, `color.bg-alt`, `color.surface`, `color.surface-raised`,
`color.surface-sunken`, `color.surface-bar`, `color.border`,
`color.border-subtle`, `color.text`, `color.text-strong`, `color.text-muted`,
`color.text-dim`, `color.accent`, `color.accent-strong`, `color.accent-soft`,
`color.info`, `color.info-soft`, `color.ok`, `color.warn`, `color.danger`,
`color.on-accent`, `color.code-comment`, `color.code-keyword`, `font.sans`,
`font.mono`, `font.mono-advance`.

- Component tokens (`core/tokens.json`, `scenes/*/tokens.json`) default to
  semantic ones; a theme may override any of them, as `daylight` repaints
  terminals and code panels to stay dark on a light page.
- `fonts`: `family`, `weight` (the CSS `font-weight` of the rule), `file`
  (its name under `vendor/fonts/`) and `src` (a module path resolved from
  this package, such as `@fontsource/inter/files/…`; a new family is a new
  npm dependency). Episode pages declare exactly their theme's `@font-face`
  rules, so changing a theme's fonts makes `check` fail on every page of that
  theme until its head is updated: a breaking change for projects.
- `contrast`: `[foreground, background, minimum]` token pairs for every text
  colour on every surface the scenes draw, component tokens included.
  `avatars check` warns per episode, with its overrides, compositing
  translucent backgrounds over `color.bg`.
- Keep themes brand-neutral: a project sets its own accent through its
  brand's `tokens`.

Look at every scene in the theme: the gallery renders the demo episodes in
every theme, and `sheet --theme` draws an avatar on the theme's page.

## A format

`formats/<id>/format.json`: `width`, `height`, the shots (`hidden`, `hero`,
`full`, `left`, `cornerR`, `cornerL`, `mini`, each `{ frame: { left, top,
width, height, borderRadius }, stage: { width, left, top }, ring }`) and the
geometry the scenes need (`scenes.diagram`, `scenes.code`, `scenes.terminal`;
each scene's README has a "Geometry" section). Scenes throw without their
geometry. `format.tokens.json` must define `format.width` and
`format.height` (`core/core.css` sizes the page with them), plus size tokens
for the canvas; an optional `format.css` loads last. Episode pages state
their canvas in the viewport meta and the root's `data-width` and
`data-height`, and the templates write 1920 by 1080.

## A scene

`scenes/<id>/` holds `<id>.js`, `<id>.css`, `tokens.json` and `README.md`.
Add the id to `BUILTIN_SCENES` in `cli/lib/project.mjs` (the bundle loads
scenes in that order, then the project's) and to the library scenes in
`DESIGN.md`.

- `Avatars.scenes.register(name, build)` makes `name` a method of every
  builder; `build(ctx, o)` lays out the scene and returns nothing. Builder
  members (`tl`, `P`, `root`, `time`, `lineEnd`, `feel`, `look`, `wave`,
  `gesture`, `glance`, `say`, `custom`, `done`) cannot be scene names.
- The scene context is in `DESIGN.md` ("Scenes") and `core/episode.js`:
  `begin(kind, o, defaults)` starts a scene (section, transition, shot,
  chapter) and `slideFrame(kind, o)` gives slide layouts the chapter label,
  title, corner shot, narration and cue timing. Ask for shots, moods,
  glances and gestures by name, never for a particular avatar.
- Push terminal and code content to `ctx.shown` (`{ cmd, at }` or `{ out,
  at, code }`) so the grounding check covers it; per-frame content is a
  function of `t` in `ctx.renderers`.
- Tokens: `<scene>.<element>-<property>` in `tokens.json`, defaulting to
  semantic tokens (`{color.surface}`); CSS uses them as `var(--av-…)`,
  scripts through `ctx.tokens`. Positions and gaps stay in CSS and
  `format.json`; metrics that both CSS and scripts need are tokens.
- Scope new selectors under `.scene-<id>`; the class names scenes already
  use are part of the episode CSS contract, and renaming them breaks pages
  that style them.
- `README.md` as the others: an example call, the presenter's shot and the
  default transition, options, geometry, tokens.
- Show it in a demo episode (`examples/demo/`), so the gallery and CI cover
  it.

## Icons and lexicon packs

Icons are `icons/<pack>/<name>.svg`: `viewBox="0 0 24 24"`, `fill="none"
stroke="currentColor" stroke-width="2" stroke-linecap="round"
stroke-linejoin="round"`, no colours, as the existing ones. The CLI keeps
the inner markup and scenes stroke it with the `icon.stroke` token. Names
are global across a project's packs (later packs win) and unknown names fall
back to `check`, so pick names that say what the icon shows.

Lexicon packs are `lexicons/<lang>/<pack>.json`, with a `_comment` that
states the pack's conventions. An entry belongs in a pack only when every
project would say the word that way; a changed entry voices again the lines
that use it in every project that upgrades. Check entries with the voice
tool's `phonemes` (`avatars-voice` skill).

## Verify

```bash
npm test                                   # Node suites
npm run test:voice                         # the voice tool, no model needed
node cli/avatars.mjs validate              # every manifest, ids against locations, named files
node cli/avatars.mjs sheet <avatar> --look <look> --mode expr -o renders/sheets/<avatar>-expr.png
node cli/avatars.mjs sheet <avatar> --mode visemes -o renders/sheets/<avatar>-visemes.png
node cli/avatars.mjs sheet <avatar> --mode gaze -o renders/sheets/<avatar>-gaze.png
node cli/avatars.mjs sheet <avatar> --mode big --theme daylight -o renders/sheets/<avatar>-big.png
npm run gallery                            # gallery/out/index.html: every avatar, look and theme
node cli/avatars.mjs fixture-voice --all --project examples/demo   # if not voiced; replaces voiced timings
node cli/avatars.mjs check --all --project examples/demo
node cli/tools/frame-diff.mjs <episode> --project examples/demo
```

Sheet modes: `expr` (every mood, then the avatar's own), `visemes` (every
mouth shape), `gaze` (left, right, up, down right), `big` (full size,
talking with a wave where the base supports it). Every cell uses seed 3 at a
fixed time, so two sheets differ only by what you changed.

**Look at what you made**: open the PNGs, the contact sheets
(`examples/demo/episodes/<id>/snapshots/`) and the gallery's images like a
designer reviewing the work, in every theme and look: edges that do not
meet, parts drawn in the wrong layer, colours that ignore the theme, a mood
that reads as another, a hand or sleeve that pops, text that leaves its box.
`node cli/tools/shot.mjs <page.html> <out.png>` screenshots any page, such as
`gallery/out/index.html`.

`frame-diff` renders frames in order, in reverse and in order again; it
exits with 1 when a frame's DOM depends on the seek order (a determinism
bug) and reports pixel-only differences as raster noise.

## Before and after

A change that must not alter existing episodes (a refactor, a new optional
feature, a part nobody wears yet) needs proof:

1. **The old version.** With the change uncommitted, `HEAD` is the before
   state:

   ```bash
   git worktree add ../avatars-before HEAD
   (cd ../avatars-before && npm ci)
   ```

2. **Render hashes.** The hash covers an episode's files, the vendored
   bundle, the voice cache keys of its lines, the HyperFrames version and
   the publish code. Run `hash --all` with both CLIs on the same project
   (`node ../avatars-before/cli/avatars.mjs hash --all --project <dir>`, then
   `node cli/avatars.mjs hash --all --project <dir>`): an unchanged hash
   means unchanged output. Most code changes alter the bundle and therefore
   the hash; then compare pixels.
3. **Stills from both versions**, at the same times in the same order:

   ```bash
   for tree in ../avatars-before .; do
     node $tree/cli/avatars.mjs fixture-voice --all --project $tree/examples/demo
     node $tree/cli/avatars.mjs check --all --project $tree/examples/demo
   done
   px() { ffmpeg -loglevel error -i "$1" -f framemd5 - | tail -n 1 | awk '{print $NF}'; }
   for a in ../avatars-before/examples/demo/episodes/*/snapshots/frame-*.png; do
     b=${a#../avatars-before/}
     [ "$(px "$a")" = "$(px "$b")" ] || echo "differs: $b"
   done
   ```

   `check` takes two stills per chapter; the timeline it prints must match
   too, since moved chapters move the stills. `fixture-voice` gives both
   trees the same narration without the model; it replaces voiced timings,
   so `voice` voices those lines again afterwards. To compare with real
   narration, copy each episode's `assets/voice/` into the worktree instead
   (narration is git-ignored, so the worktree has none). For a project's
   episodes, run both versions' CLIs on the same project one after the other
   and copy `snapshots/` away in between: each run rebuilds `vendor/` and
   replaces the stills.
4. **Look at every difference.** A difference image is black where the
   frames agree:

   ```bash
   ffmpeg -loglevel error -i before.png -i after.png -lavfi "[0][1]blend=all_mode=difference" -frames:v 1 -y diff.png
   ```

   The headless browser sometimes rasterises a single 1 px column at a moving
   edge, such as a push transition's seam, differently. Shoot such a frame
   again on its own in the episode directory of each version (`npx
   hyperframes snapshot --no-end --describe false -o snapshots/again --at
   <t>`) before counting it.

`git worktree remove ../avatars-before` cleans up afterwards. The same
comparison of two `sheet` images shows what an art change did.

## Breaking or not

Projects depend on a tag, and the lockfile pins the commit (`DESIGN.md`,
"Versioning").

- **Breaking**: a change to the vocabulary (visemes, moods, expression keys,
  gestures), a registry or context signature (builder, scene, part or base
  context), a schema (a new required key, a removed key or value) or a slot.
  Removing or renaming an id that projects name (an avatar, look, part,
  theme, format, scene, icon, lexicon pack or token), a scene's class names
  and a theme's fonts break them too. Update `DESIGN.md`, the schemas in
  `core/schemas/` and the docs in the same change.
- **Re-renders**: a change that alters the pixels or sound of existing
  episodes (a part's drawing, a token's value, a scene's layout, a lexicon
  entry, a preset) re-renders every episode it touches. It is listed in the
  release notes; say so in the commit body.
- **Additive**: a new avatar, look, part, theme, format, icon, scene, or an
  option whose default keeps the old output. Show that with the comparison
  above.

## Commits

Conventional Commits, `<type>(<scope>): <description>`, with the types `feat
fix docs style refactor test chore build ci` and a top-level directory as
the scope (`core`, `scenes`, `parts`, `avatars`, `voice`, `cli`, …). One
logical change per commit. The message describes the commit itself, with no
references to conversations, sessions or other repositories' history and no
"now", "new" or "previously", and prefers a bullet-point body that states
what changed and why, including whether existing episodes change.
