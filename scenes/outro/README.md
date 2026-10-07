# outro

The closing card: thanks, the project's links and the next episode, with the
presenter full size on the left. She waves on the last line and winks at its
end; `done()` then fades to black. Always the last scene.

```js
.outro({ chapter: "Wrap-up", next: "Configuration", say: "outro" })
.done();
```

| | |
| --- | --- |
| Presenter | `left`: full size on the left; waves, then winks |
| Default transition in | `blur` |

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `chapter`, `label` | | chapter title; this scene shows no chapter label |
| `title` | `"Thanks for watching!"` | the card's headline |
| `links` | the brand's `links` | `[[label, text], …]`; an empty list leaves the links out |
| `next` | none | the title of what to watch or read next, under "Next up" |
| `say` | none | narration; default mood `joy`, `happy` after the start of the last line |
| `lead` | `0.7` | seconds before the narration starts |
| `wave` | before the end of the last line | a time for the wave, or `false` for none |
| `transition`, `transitionDur`, `shot` | | override the defaults |

`done({ tail })` ends the episode `tail` seconds after the last line
(default `motion.tail`, 1.8), including the fade to black
(`motion.fade-out`).

## Tokens

`outro.link-*`, `outro.label-*`, `outro.next-*`; shared: `headline.*`,
`kicker.*`, `motion.tail`, `motion.fade-out`, `blackout.bg`.
