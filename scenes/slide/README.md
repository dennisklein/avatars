# slide

A title and up to four bullets that land on their cue words, with the
presenter in the corner. Use it for a concept or a list of steps.

```js
.slide({
  chapter: "What it sets up",
  title: "One command sets up…",
  say: "what",
  bullets: [
    { icon: "network", title: "Network and DNS", text: "services find each other by name", at: "what:network" },
    { icon: "key", title: "Keys and configuration", text: "generated for this project", at: "what:keys" },
  ],
})
```

| | |
| --- | --- |
| Presenter | `cornerR`: a round bubble in the bottom-right corner |
| Default transition in | `push` |

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `chapter` | | chapter title, listed under the player and shown top left |
| `label` | `chapter` | on-screen chapter text, if it should differ |
| `title` | `""` | the slide title |
| `bullets` | `[]` | `{ icon, title, text, at }`: `icon` is an icon name (unknown names show `check`), `text` an optional second line |
| `say` | none | narration; default mood from `mood` (`neutral`) |
| `mood` | `"neutral"` | default mood of the lines |
| `lead` | `0.6` | seconds before the narration starts |
| `transition`, `transitionDur`, `shot` | | override the defaults |

## The slide frame

`slide`, `diagram` and `code` share one frame (`ctx.slideFrame(kind, o)` in
`core/episode.js`): chapter label, title, the presenter in the corner,
narration, and items that appear just before their cue word (`at`, 0.15 s
early), or one after another from 0.9 s when they have none. The presenter
glances at every item that has a cue. A new layout, such as a table, builds
on the same frame.

Four bullets start higher and closer together, so the last clears the
captions.

## Tokens

`slide.bullet-bg`, `slide.bullet-border`, `slide.bullet-radius`,
`slide.icon-radius`, `slide.bullet-title-*`, `slide.bullet-text-*`,
`slide.enter-offset`, `slide.enter-duration`; shared: `slide-title.*`,
`chapter.*`, `icon.stroke`, `icon.bg`.
