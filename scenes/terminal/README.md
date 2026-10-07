# terminal

Commands typed on cue and their output in a terminal window. The window's
content is a pure function of time (`Scenes.terminal`), so it renders
correctly at any frame.

```js
.terminal({
  chapter: "Create and check",
  say: [{ id: "create", mood: "happy" }, { id: "check", mood: "smug", cues: { running: "joy" } }],
  steps: [
    { cmd: "make up", at: "create:Run" },
    { ff: "⏩ fast-forward", after: 0.5, hold: 1.8 },
    { prompt: true, after: 0.9 },
    { cmd: "make status", at: "check:Now" },
    { out: "NAME   STATUS\nweb    running", at: "check:shows" },
    { mark: "running", at: "check:running", delay: -0.1 },
  ],
})
.terminal({ wide: true, chapter: "Inspect", say: "inspect", steps: [/* … */] })
```

| | |
| --- | --- |
| Presenter | `cornerR`; with `wide: true` the small `mini` bubble; `avatar: "none"` hides the presenter (`hidden`) |
| Default transition in | `push` |

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `chapter`, `label` | | chapter title and on-screen label |
| `title` | `"~/work — bash"` | the window title |
| `wide` | `false` | the fullscreen window, for long lines |
| `avatar` | | `"none"` hides the presenter during the scene |
| `steps` | `[]` | see below |
| `say` | none | narration; default mood from `mood` (`happy`) |
| `lead` | `0.6` | seconds before the narration starts |
| `prompt` | `"$ "` | the prompt |
| `cps` | `terminal.cps` (32) | typing speed, characters per second |
| `glance` | `true` | `false` stops the presenter glancing at typed commands |
| `transition`, `transitionDur`, `shot` | | override the defaults; `shot` moves only the presenter, and the window lays out for `cornerR` (`cornerL` covers it and logs a warning) |

Steps take `at` (a time reference, plus `delay` seconds) or `after`
(seconds after the previous step; a typed command ends when its last
character is typed; default 0.3, and the first step without `at` follows
1 s into the scene):

- `{ cmd }`: a command, typed;
- `{ out }`: output lines, shown at once;
- `{ prompt: true }`: a fresh prompt after a silent command;
- `{ ff: "⏩ ~40 s later", hold }`: a fast-forward badge for `hold` seconds
  (default `terminal.ff-hold`);
- `{ mark: "text", until }`: highlight every occurrence of `text`;
- `{ clear: true }`: clear the screen;
- `running: true` on a step leaves out the fresh prompt after it, for a
  command that keeps running, such as a server.

The font is fitted to the longest line: the regular window keeps its
largest size up to about 62 columns and shrinks to fit 96; the wide window
keeps it up to 96 columns and shrinks to fit 160. A line that does not fit
even at the smallest size logs a console warning. Terminal commands and
output are listed in `window.__episode.terminal` for `avatars check`.

## Geometry

From the format (`format.json` `scenes.terminal`): `normal` and `wide`
window rects (`left`, `top`, `width`, `height`) with font limits `max` and
`min`. The paddings, line height and bar height are tokens:
`terminal.pad-x`, `terminal.pad-y`, `terminal.line-height`,
`window.bar-height`.

## Tokens

`terminal.text`, `terminal.prompt`, `terminal.prompt-weight`,
`terminal.out`, `terminal.cursor`, `terminal.mark-*`, `terminal.ff-*`,
`terminal.cps`, `terminal.blink`, `terminal.ff-hold`; shared: `window.*`,
`font.mono-advance`.
