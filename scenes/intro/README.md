# intro

The opening sting: the project's brand lockup, the episode's kicker and
title, and the presenter's AI disclosure. Always the first scene.

```js
Episode.create({ tl, id: "first-steps", title: "First steps: a guided tour", series: "First steps" })
  .intro({ chapter: "Hi there", kicker: "Getting started", title: "First steps", say: "intro" })
```

| | |
| --- | --- |
| Presenter | rises in on the right (`hidden`, then `hero` from 0.7 s) and waves on the first line |
| Default transition in | none (the first scene shows at 0) |
| Next scene | `talk` opens with an iris from here |

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `chapter` | `"Intro"` | the first chapter's title (always starts at 0) |
| `kicker` | `""` | small uppercase line above the title (the docs section, the series) |
| `title` | the builder's `series` | the episode title |
| `say` | none | narration: a line id, `{ id, mood, cues, look, gap }` or a list; default mood `joy`, switching to `happy` after the first sentence |
| `start` | `1.5` | seconds before the first line |
| `wave` | `true` | `false` leaves out the wave on the first line |
| `transition`, `shot` | | ignored as the first scene; `shot` sets the presenter's shot before the rise-in |

## Brand

Everything above the title comes from the project's brand
(`Avatars.data.brand`); elements the brand leaves out are left out:

- `marks.emblem`: drawn as inline SVG, 250 px wide at its viewBox's aspect
  ratio. Its top-level elements pop in one by one from the centre outwards,
  each about its own centre, up to the opacity it is drawn with.
- `wordmark` and `tagline`: rise in beside the emblem.
- The disclosure line is the host's `disclosure` from the cast
  (`avatar.json`), bottom left.

## Tokens

`intro.wordmark-color`, `intro.wordmark-size`, `intro.wordmark-weight`,
`intro.tagline-color`, `intro.tagline-size`, `intro.tagline-weight`,
`intro.kicker-size`, `intro.headline-size`, `intro.disclosure-color`,
`intro.disclosure-size`, `intro.wordmark-offset`, `intro.tagline-offset`;
shared: `kicker.*`, `headline.*`, `glow.*`, `grid.*`.
