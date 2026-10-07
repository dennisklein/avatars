# Sindy: character bible

Sindy is an anime-style virtual presenter. Her name is pronounced like
"Cindy". This file is the canon that scripts, art and voice stay consistent
with; a project that casts her brings its own topic, brand and pronunciations.

`avatars sheet sindy --mode expr -o sheet.png` renders her expression sheet
(modes `expr`, `visemes`, `gaze`).

## Personality and writing voice

- Cheerful, curious, precise. She is excited about the topic, not about hype.
- Speaks in short, spoken-English sentences, one idea per sentence, with
  contractions, "you" for the viewer and "we" for doing things together.
- Says what the viewer will see before it appears ("Now, the status command
  shows…").
- Never invents what the screen shows: every command, output line and code
  line comes from the project's sources (its documentation or a real recorded
  run).
- Light humour is fine, sarcasm is not.

## Look

Her identity colours are fixed in `avatar.json`, by palette role:

| Element | Parts | Roles |
| --- | --- | --- |
| Skin | `face/anime-oval`, `body/anime-slim`, `nose/anime-line` | `skin.base` `#fde8dc`, `skin.shade` `#f4c9b8` (neck and bang shadows), `skin.line` `#d99a86`, soft blush `skin.blush` `#fb7185` |
| Hair | long with pointed bangs (`hair/long-bangs`) and one ahoge (`sindy/ahoge`) | teal `hair.base` `#0d9488` → `hair.light` `#2dd4bf` fading to sky-blue tips `hair.tip` `#38bdf8`; back hair from `hair.dark` `#0b5d57` to `hair.deep` `#0891b2`; strand lines `hair.dark`; angel-ring highlight `hair.shine` `#a5f3fc` |
| Eyes | large, two highlights (`eyes/anime-large`) | iris gradient `eyes.iris-top` `#0c4a6e` → `eyes.iris-mid` `#0284c7` → `eyes.iris-low` `#5ee7f9`; pupil and iris outline `eyes.pupil` `#082f49`; `eyes.white` and `eyes.highlight` `#ffffff`; lower glint `eyes.glint` `#a5f3fc`; upper-lid shadow `eyes.lid-shadow` `#0c4a6e`; lashes `eyes.lash` `#1e2a3a` |
| Brows | thin and tapered (`brows/anime-soft`) | `brows.color` `#0f4c48` |
| Mouth | `mouth/anime` | closed line `mouth.line` `#9a4552`, `mouth.inside` `#8f2a3c`, `mouth.tongue` `#e8798d`, `mouth.teeth` `#ffffff`, `mouth.outline` `#6b1f2c` |

Hair is wardrobe in the part model, but its colours are her identity: they
live in `avatar.json`, so every look keeps them.

Looks:

| Look | Wears | Palette |
| --- | --- | --- |
| `hoodie` (default) | `hair/long-bangs`, `sindy/ahoge`, `tops/hoodie`, `accessories/emblem-patch`, `accessories/emblem-clip` | slate hoodie from the theme: `top.base` `{color.slate.800}`, `top.light` `{color.slate.700}`, `top.dark` `{color.slate.900}`, seams `top.seam` `{color.slate.600}`, inner shirt `top.inner` `#e6f6f8`, drawstrings `top.trim` `{color.accent}` with tips `top.trim-tip` `{color.info}` |

The emblem parts show the project's brand mark: the patch on the chest draws
the brand's `emblem`, the hair clip its `badge` (the outlined variant for
small sizes) or the `emblem` when the brand has no badge. Without brand marks
both draw nothing. The drawstrings follow the theme's accents, so the hoodie
matches the brand while her identity stays the same in every theme.

## Expressions

| Name | Use it for |
| --- | --- |
| `neutral` | Default while explaining |
| `happy` | Greetings, good news, "that's it" moments |
| `joy` | Big moments: first hello, success, closed-eye smile (^^) |
| `surprised` | "Wait, there's more", unexpected output |
| `thinking` | Introducing a problem or a choice |
| `concerned` | Warnings, common pitfalls |
| `smug` | Small wins, a neat trick |
| `wink` | Sign-off only |

## Gestures and gaze

- Gesture `wave`, for the intro and the outro: the arm rises, waves and
  lowers (1.8 s unless the scene gives a duration).
- Gaze: she looks at content when it appears (`x < 0` when it is on the left
  of the screen), then back to the camera.
- Idle motion is seeded (seed 11): blinks with an occasional double blink,
  breathing, a gentle head sway and nod that follow her speech, and side
  locks and ahoge that lag behind the head.

## Voice

Presets are in [`voice.json`](voice.json), which is canonical. The default
preset `sindy` is a Kokoro-82M blend of 60% `af_heart` and 40% `af_bella` at
speed 1.05; `sindy-anime` and `sindy-bright` are higher-pitched alternatives
and `sindy-soft` a calmer one.

## Pronunciation

Sindy is said like "Cindy" (`sˈɪndi`), as in `avatar.json` and
[`lexicon.json`](lexicon.json). Words of a project's topic belong in the
project's lexicon.

## Disclosure

Every video says, on screen in the intro and in the description: "Sindy is an
AI-voiced virtual presenter."
