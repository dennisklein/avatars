# Avatars

An avatar is an instructor drawn in SVG from parts on a base, dressed in a
look, and moved by the performer. This guide explains the layers from the
bottom up and how to add a look, a part or an avatar. [DESIGN.md](../DESIGN.md)
("Performer and pose" to "Avatars and looks") has the exact contracts.

```text
narration timings, moods, gaze, gestures
        │
        ▼
performer (core/performer.js) ──► pose at time t: expression, mouth, gaze, head, breath, blink, gestures
        │
        ▼
rig (rigs/svg/rig.js) ──► base (bones, slots) + parts (drawing per slot, painted with palette roles)
```

## Performer and pose

The performer turns an episode's tracks into a pose for any time `t`, as a
pure function: lip sync from the narration's visemes with coarticulation and
loudness, the mood with blends between moods, gaze with micro-saccades, a
head that sways, nods with speech and turns towards the gaze, breathing,
seeded blinks and active gestures. Scenes never move the avatar directly;
they add to the tracks (`feel`, `look`, `glance`, `wave`), and `done()`
creates the presenter from them.

The vocabulary is the contract between scenes, the performer and every
avatar:

- **Moods**: `neutral happy joy surprised thinking concerned smug wink`, each
  a set of expression parameters (`brow`, `browTilt`, `eye`, `squint`,
  `happyEyes`, `smile`, `mouthOpen`, `blush`, `pupil`, `winkL`, `winkR`).
  Every avatar renders all of them and may add more.
- **Visemes**: `sil mbp aa ah ee ih oh ou fv th cdg sz ch l r w`, each a
  mouth shape `{ open, wide, round, teeth }`. The voice tool maps phonemes to
  them.
- **Gestures**: `wave`. A base lists the gestures it animates; others are
  ignored, and `avatars check` warns.

How the avatar moves is its temperament: about twenty constants for lip
sync, blinking, sway, nod, head shift and turn, gaze and breathing, with the
reference avatar's values as defaults. An avatar overrides any of them in
`avatar.json`; `node cli/tools/mouth-stats.mjs <line.json>` helps to tune
`lipKernel` and `lipGain` (a median mouth opening of about 0.3 reads well).
Blinks and idle motion are seeded noise: the same seed gives the same
blinks in every render.

## Bases and slots

A base is a body type: `rigs/svg/bases/<id>/base.json` (canvas, anchors,
slots, clips, gestures) and `base.js` (the bone tree and how a pose moves
it). The library's base is `anime-600x800`: a slim anime upper body on a
600×800 canvas with the face centred at (300, 283). Its slots, bottom to
top:

| Slots | Moved by |
| --- | --- |
| `hair-back` | the head, shifted against the turn |
| `neck`, `top`, `chest` | the body, which breathes |
| `face`, `face-shadow`, `blush`, `nose`, `eyes`, `mouth`, `eyewear`, `hair-front`, `hair-side`, `hair-top`, `headwear`, `hair-accessory`, `brows` | the head, which rotates about the neck; features shift more than the outline when the head turns (parallax), and the features are clipped to the face |
| `sleeve`, `hand` | the waving arm |

The avatar faces the camera; a head turn is faked by that parallax.
Shots (the format's framings) place the stage by the base canvas, and a base
with a differently placed face adds `framing` so every face sits where the
shot expects it.

## Parts

A part draws one piece of the avatar into one or more slots and paints only
with palette roles, never with literal colours:

```text
parts/<category>/<name>/part.json    what it is: slots, roles, defaults, colourways, options
parts/<category>/<name>/part.js      how it draws: build() once, update() every frame
```

Identity categories are `body`, `face`, `eyes`, `brows`, `mouth` and `nose`;
wardrobe categories `hair`, `tops`, `eyewear`, `headwear` and `accessories`.
A part only one avatar wears lives in `avatars/<avatar>/parts/<name>/` with
the id `<avatar>/<name>` (Sindy's `sindy/ahoge`).

Roles are named `<group>.<name>`: `skin.base`, `hair.tip`, `top.trim`,
`eyewear.frame`. A part lists every role it uses and may give `defaults`,
often token references such as `{color.slate.800}` or `{color.accent}`, so a
garment follows the theme or brand. `colourways` are named role sets a look
picks (`tops/blazer` has `charcoal`, `navy`, `camel` and `ivory`), and
`options` are settings a look passes (`pocketSquare` of the blazer, `side` of
the emblem clip). Parts that draw brand marks list them in `marks`.

The library's wardrobe:

| Part | Slots | Notes |
| --- | --- | --- |
| `hair/long-bangs` | `hair-back`, `face-shadow`, `hair-front`, `hair-side` | long hair with pointed bangs and side locks that lag behind the head |
| `tops/hoodie` | `top`, `sleeve` | hoodie with drawstrings in `top.trim` and `top.trim-tip` |
| `tops/blazer` | `top`, `sleeve` | notched-lapel blazer over a crew-neck top, buttons, breast pocket with an optional pocket square in `top.trim` |
| `eyewear/round-glasses` | `eyewear` | round rims, keyhole bridge, a lens tint and a glint that keeps its angle on screen |
| `accessories/emblem-patch` | `chest` | the brand's `emblem` on the chest |
| `accessories/emblem-clip` | `hair-accessory` | the brand's `badge` (else `emblem`) as a hair clip, `side` `left` or `right` |

### Add a part

1. Create `parts/<category>/<name>/part.json` with `id`, `category`,
   `title`, `fits: ["anime-600x800"]`, the `slots` it draws into, its
   `roles` with `defaults`, and any `colourways`, `hides` (slots it covers,
   such as `hair-top` under a cap), `marks` and `options`.
2. Write `part.js`:

   ```js
   (function (global) {
     "use strict";
     const A = (global.Avatars = global.Avatars || {});
     A.parts.register("headwear/cap", {
       build(ctx) {
         const g = ctx.el("g", {}, ctx.slot("headwear"));
         ctx.el("path", { d: "M180,170 Q300,60 420,170 Z", fill: ctx.color("headwear.base") }, g);
         return { g };
       },
       update(ctx, pose, state) {
         // optional: per-frame attributes from the pose alone
       },
     });
   })(typeof window !== "undefined" ? window : globalThis);
   ```

   Draw in base units. `ctx.id(name)` and `ctx.url(name)` make ids unique
   per presenter, `ctx.clip("face")` is the base's face clip, and
   `ctx.options` holds the look's options. Everything `update` sets must
   follow from the pose alone, so frames render in any order: no state that
   accumulates between frames, no clocks, no randomness.
3. Wear it in a look and look at it from every side:

   ```bash
   node cli/avatars.mjs validate
   node cli/avatars.mjs sheet sindy --look <look> --mode expr -o renders/sheets/expr.png
   node cli/avatars.mjs sheet sindy --look <look> --mode big -o renders/sheets/big.png
   node cli/avatars.mjs sheet sindy --look <look> --mode gaze -o renders/sheets/gaze.png
   ```

   `big` shows the waving arm, `gaze` the head turned both ways. A part that
   animates (a sway, a glint) also needs a determinism check on an episode
   that wears it: `node cli/tools/frame-diff.mjs <id> --project <project>`.

A project adds parts the same way under `library/parts/<category>/<name>/`.

## Looks

A look dresses an avatar: `avatars/<avatar>/looks/<name>.json` lists the
wardrobe parts to `wear` after the avatar's identity parts, the
`colourways` to pick, `palette` roles to set and `options` to pass, each
keyed by part id. The palette resolves in this order, later wins: the parts'
`defaults`, the chosen colourways, the avatar's palette, the look's palette,
and the cast entry's `palette` in `avatars.json` or `episode.json`. Two parts
may share a category only in `hair` and `accessories`.

### The wardrobe example

Sindy has two looks. `hoodie`, the default, is a slate hoodie whose
drawstrings follow the theme's accents, with the brand's emblem as a chest
patch and its badge as a hair clip. `blazer-glasses` swaps the hoodie for a
navy blazer and adds gold round glasses:

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

The blazer's pocket square is `top.trim`, set to `{color.accent}`, so it
follows the theme like the hoodie's drawstrings. Her face, hair and eyes come
from `avatar.json` and stay the same in every look. The two sheets, rendered
with the demo project's brand marks:

```bash
node cli/avatars.mjs sheet sindy --look hoodie --mode expr --project examples/demo -o sheet.png
node cli/avatars.mjs sheet sindy --look blazer-glasses --mode expr --project examples/demo -o sheet.png
```

![Sindy's moods in the hoodie look](images/sindy-hoodie.png)

![Sindy's moods in the blazer-glasses look](images/sindy-blazer-glasses.png)

(The pictures in `docs/images/` are these sheets.)
An episode switches looks in its `episode.json`; the demo's `wardrobe`
episode wears `blazer-glasses` on the `daylight` theme:

```json
{
  "cast": { "host": { "look": "blazer-glasses" } },
  "theme": "daylight"
}
```

### Add a look

1. Write `avatars/<avatar>/looks/<name>.json` with `id`, `title` and `wear`;
   pick colourways and set palette roles and options as needed.
2. Check the file and look at the result:

   ```bash
   node cli/avatars.mjs validate
   node cli/avatars.mjs sheet <avatar> --look <name> -o renders/sheets/<name>.png
   ```

3. Add it to the Looks table of the avatar's `CHARACTER.md`.

A project adds a look to any avatar, the library's included, in
`library/avatars/<avatar>/looks/<name>.json` without copying the avatar, and
casts it with `"look": "<name>"`. For example, a charcoal blazer without the
pocket square:

```json
{
  "id": "charcoal-blazer",
  "title": "Charcoal blazer without a pocket square",
  "wear": ["hair/long-bangs", "sindy/ahoge", "tops/blazer", "accessories/emblem-patch", "accessories/emblem-clip"],
  "colourways": { "tops/blazer": "charcoal" },
  "palette": { "top.inner": "#f4fbfb" },
  "options": { "tops/blazer": { "pocketSquare": false }, "accessories/emblem-clip": { "side": "right" } }
}
```

## An avatar's files

An avatar is a directory `avatars/<id>/`:

| File | Holds |
| --- | --- |
| `avatar.json` | name, pronunciation, base, rig, identity parts, palette, moods, temperament, seed, default look, voice and lexicon files, disclosure |
| `CHARACTER.md` | the character bible: personality and writing voice, colours by role, looks, when to use which mood, gestures, voice and pronunciation |
| `voice.json` | voice presets and the default one ([voice.md](voice.md)) |
| `lexicon.json` | how the avatar's own name and words are said |
| `looks/` | the looks |
| `parts/` | parts only this avatar wears |

Identity colours (skin, hair, eyes, brows, mouth) live in the avatar's
`palette`, so every look keeps them. `disclosure` is shown in the intro and
published with every video ("Sindy is an AI-voiced virtual presenter").

### Add an avatar

1. Pick a base (`anime-600x800`) and the identity parts, or draw new ones.
2. Write `avatar.json`: every role the identity and the default look's parts
   use must resolve from the part defaults or the palette. Start `moods` and
   `temperament` empty and tune them against sheets.
3. Write `voice.json` with at least one preset and a `default`, and
   `lexicon.json` with the avatar's name; audition the presets with the voice
   tool's `samples`.
4. Write a default look and `CHARACTER.md`.
5. Check it: `node cli/avatars.mjs validate`, the sheets in every mode, and
   `node cli/avatars.mjs gallery --out gallery/out`, which shows every avatar
   and look. Cast it in an episode of a copy of `examples/demo` and run
   `check`.

A project keeps its own avatars in `library/avatars/<id>/`; a project avatar
shadows a library avatar of the same id. The `avatars-design` skill has the
full procedure, including how to compare renders of existing episodes before
and after a change.

## Sheets

`avatars sheet` draws one avatar in one look on a page of cells, every cell
with the same seed, so two sheets differ only by what changed:

| Mode | Cells |
| --- | --- |
| `expr` (default) | every mood of the vocabulary, then the avatar's own |
| `visemes` | every mouth shape, held |
| `gaze` | looking left, right, up, and down to the right |
| `big` | neutral, and talking happily with a wave where the base supports it, at full size |

With `--project` (or inside a project) the sheet uses the project's library,
theme and brand marks; otherwise the package alone, `midnight` and no marks.
`--theme` picks another theme.
