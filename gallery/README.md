# Gallery

The gallery is the catalogue of the library: what every avatar looks like in
every look, and what the scenes look like in every theme. It is generated, not
committed; `gallery/out/` is git-ignored.

```bash
npm run gallery                                   # gallery/out/index.html
node cli/avatars.mjs gallery --out DIR            # anywhere
node cli/avatars.mjs gallery --out DIR --project P   # with a project's library
```

The command writes:

| File | Contents |
| --- | --- |
| `index.html` | this directory's `index.html` with its placeholders filled |
| `avatars/<avatar>-<look>-expr.png` | the avatar in every mood |
| `avatars/<avatar>-<look>-visemes.png` | the avatar with every mouth shape |
| `episodes/<theme>/<episode>/contact-sheet-*.jpg` | two stills per chapter of each demo episode |

Avatar sheets cover every avatar and look of this package and, with a
project, of its `library/`; a project avatar shadows a package avatar of the
same id. The sheets use the project's theme and brand marks when there is a
project, else the `midnight` theme and no marks (`--theme` picks another).
A sheet that fails to draw fails the command.

Episode stills come from the demo project in `examples/demo/`: each episode is
rendered in every theme of the package, with fixture narration when it has
not been voiced. They take a few seconds per episode and theme, need the
HyperFrames browser, and are best effort: failures are listed at the bottom of
the page and on the console without failing the command.

## Avatar sheets

`sheet.html` draws one avatar. `avatars sheet` copies it into a temporary
directory next to a `vendor/` bundle built for a cast of only that avatar and
look, opens it and takes a screenshot:

```bash
node cli/avatars.mjs sheet sindy -o sindy.png                    # moods
node cli/avatars.mjs sheet sindy --look hoodie --mode visemes -o mouths.png
node cli/avatars.mjs sheet sindy --mode big --theme midnight -o big.png
```

| Mode | Cells |
| --- | --- |
| `expr` (default) | every mood of the vocabulary (`Avatars.performer.MOODS`), then the avatar's own moods |
| `visemes` | every viseme, held |
| `gaze` | looking left, right, up, and down to the right |
| `big` | neutral, and talking happily with a wave where the base supports it, at full size |

Every cell renders the presenter with seed 3 at a fixed time, so sheets are
the same on every run and differences between two sheets come from the
avatar, the look or the theme.

`index.html` and `sheet.html` take placeholders the command fills:
`{{title}}`, `{{summary}}`, `{{avatars}}`, `{{episodes}}` and `{{notes}}` in
the index; `{{title}}` and `{{font-faces}}` (the theme's `@font-face` rules)
in the sheet.
