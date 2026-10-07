# talk

Framing the topic: the presenter full size on the left, a title card on the
right with an optional kicker, sub line and topic chips, and an optional name
tag. Use it once, right after the intro, to state why the episode matters.

```js
.talk({
  chapter: "What you'll build",
  kicker: "Getting started",
  title: "Your first project",
  sub: "One command on your own machine.",
  chips: ["one command", "two services"],
  nameTag: {},
  say: { id: "welcome", mood: "thinking", cues: { build: "neutral" }, look: { complete: 0.35, All: "camera" } },
})
```

| | |
| --- | --- |
| Presenter | `full`: full size on the left |
| Default transition in | `iris` after the intro, else `push` |

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `chapter`, `label` | | chapter title (listed under the player); this scene shows no chapter label |
| `kicker` | none | small uppercase line above the title |
| `title` | `""` | the card's headline |
| `sub` | none | a sentence under the headline |
| `chips` | none | short topic chips (the first is accented); up to three of about 40 characters together, or they wrap |
| `nameTag` | none | `{ name, role, hold }`: a lower third from 0.9 s into the scene until `hold` seconds (default `talk.tag-hold`, 5.2); `name` defaults to the host's name, `role` to the brand's `role` |
| `say` | none | narration; default mood `neutral` |
| `lead` | `0.6` | seconds before the narration starts |
| `transition`, `transitionDur`, `shot` | | override the defaults |

The card's items rise in one after another from 0.5 s.

## Tokens

`talk.sub-*`, `talk.chip-*` (`color`, `bg`, `border`, `accent`,
`accent-color`, `radius`, `size`, `weight`), `talk.tag-bg`,
`talk.tag-accent`, `talk.tag-radius`, `talk.name-*`, `talk.role-*`,
`talk.tag-offset`, `talk.tag-hold`; shared: `kicker.*`, `headline.*`.
