# code

Files on the slide frame: a configuration or source file copied from the
docs, with lines that light up or appear on cue and note chips underneath.

```js
.code({
  chapter: "The configuration",
  title: "A minimal config",
  say: "cfg",
  file: "app.yaml",
  lang: "yaml",
  text: ["name: demo", "services:", "  - web", "  - db"].join("\n"),
  marks: [{ text: "services:", at: "cfg:services" }],
  notes: [{ icon: "check", text: "every key is optional", at: "cfg:optional" }],
})
```

| | |
| --- | --- |
| Presenter | `cornerR` (or `mini` with `wide: true`) |
| Default transition in | `push` |

## Options

Everything the slide frame takes (`chapter`, `label`, `title`, `say`,
`mood`, `lead`, `transition`, `transitionDur`, `shot`), and:

| Option | Meaning |
| --- | --- |
| `file`, `lang`, `text` | one panel: its title, language and content |
| `panels` | several panels side by side: `[{ file, lang, text }]` |
| `wide` | the wide area and the small bubble, for long lines |
| `font` | largest font size to use (px); default: the format's `max` |
| `reveal` | `[{ lines: [first, last], at, panel }]`: lines (counted from 1) fade in at the cue |
| `marks` | `[{ text \| line, at, until, panel }]`: light up every line that contains `text` (or line number `line`) from `at` until `until` |
| `notes` | `[{ icon, text, warn, at }]`: chips under the panels; `warn` draws a warning chip |

`shot` moves only the presenter: the panels lay out beside `cornerR` (or
in the wide area with `wide: true`), so `cornerL` puts the bubble over them,
and the scene logs a warning.

Without a `title` the panels use the whole height below the chapter label.
The font is fitted to the longest line and the tallest panel; a panel scrolls
to keep revealed and marked lines in view. Like terminal output, every line
is compared with the docs page by `avatars check`, so copy files from the
page and leave out lines rather than edit them.

## Languages

Highlighters live in `highlight/<lang>.js` and register with
`Avatars.highlight.register(lang, (line) => html)`: `yaml`, `sh`, `c`,
`conf`, `json` and `text` (the fallback for unknown languages). They mark
keys (`k`), strings (`s`), comments (`c`), keywords (`w`) and punctuation
(`p`) with spans, using `Avatars.highlight.esc`, `span(cls, text)` and
`splitComment(line, re)`.

## Geometry

From the format (`format.json` `scenes.code`): `areas` (`cornerR`,
`wide`), `untitledTop`, the line height factor `line`, font limits `max`
and `min`, the `gap` between panels and above the notes, and `noteGap`
between notes. The paddings and heights CSS draws with are tokens:
`code.pad-x`, `code.pad-y`, `code.note-height`, `window.bar-height`.

## Tokens

`code.text`, `code.key`, `code.string`, `code.comment`, `code.keyword`,
`code.punct`, `code.hl-*`, `code.note-*`, `code.pad-x`, `code.pad-y`;
shared: `window.*` (panel and bar), `icon.*`, `font.mono-advance`.
