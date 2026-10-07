# {{title}}

Tutorial videos of {{title}}, made with the
[avatars](https://github.com/dennisklein/avatars) library: a presenter,
scenes and a design system for videos that render on a CPU with HyperFrames
and render again whenever their sources change.

## Setup

You need Node.js 22 or later, Python 3.10 to 3.13 for the voice, FFmpeg with
libx264, and a Chrome that HyperFrames can drive. Once per machine:

```bash
npm install
python3 -m venv .venv
. .venv/bin/activate          # in every new shell
pip install -r node_modules/@dennisklein/avatars/voice/requirements.txt
npx avatars voice-setup       # downloads the speech model, about 350 MB
ffmpeg -hide_banner -encoders | grep libx264
npx hyperframes browser ensure
```

The speech model goes to `~/.cache/avatars-voice` (`AVATARS_VOICE_CACHE`
moves it). `AVATARS_PYTHON` names the Python that runs the voice tool
(default: `python3`, the one of the active virtual environment).
`HYPERFRAMES_BROWSER_PATH` points HyperFrames at a Chrome you already have.

## Make an episode

An episode is a directory under `episodes/` with `script.json`, the
narration, one line per beat, and `index.html`, the composition: a chain of
scene calls that say those lines and time what appears to their words.
`episodes/hello/` is the first one.

```bash
npx avatars new episode first-steps     # episodes/first-steps/ from the template
npx avatars fixture-voice first-steps   # made-up timings, for layout work without the model
npx avatars voice first-steps           # the narration, cached line by line
npx avatars check first-steps           # timeline, warnings, lint and contact sheets
npx avatars render first-steps --draft  # renders/first-steps.mp4
npx avatars publish first-steps         # web MP4, poster, WebVTT captions and manifest
```

`check` writes two stills per chapter into the episode's `snapshots/`; look
at them before rendering. `check --quick` skips lint and stills while you
work on timing. `--all` instead of an episode id runs a command for every
episode, as the npm scripts do (`npm run voice`, `npm run check`,
`npm run render`). `npx avatars phonemes first-steps --flagged` lists words
the voice may get wrong; fix them in `lexicon.json`.

## What is where

```text
avatars.json       cast, theme, format, brand, lexicons and icon packs
brand/             brand.json and its marks: emblem.svg, emblem-badge.svg
lexicon.json       pronunciations of this project's words
episodes/<id>/     script.json, index.html, hyperframes.json, episode.json (optional)
```

The CLI writes `vendor/`, `assets/voice/` and `snapshots/` into episodes and
`renders/` and `publish/` into the project; `.gitignore` leaves them out.

`brand/brand.json` names the project and holds the presenter's role (on the
name tag), the links of the closing card and the marks: the intro shows
`emblem.svg`, the presenter's hoodie shows it as a patch and her hair clip
shows `emblem-badge.svg`, an outlined variant for small sizes. Replace the
placeholder marks with your own self-contained SVG files.

An episode's `episode.json` overrides the project's `cast`, `theme`, `format`
or `tokens` for that episode alone. `avatars.json` can also turn on grounding,
the check that every terminal and code line an episode shows appears on a
docs page that embeds it, and point `publish` at a docs site:

```json
{
  "grounding": { "sources": ["docs"], "embed": "{{< video \"{id}\" >}}" },
  "publish": { "static": "docs/static/videos", "data": "docs/data/videos" }
}
```

## Read more

- The avatars repository: `DESIGN.md` describes every file format and the
  `avatars` command, `docs/` holds the guides, and `examples/demo/` is a
  complete project.
- Every scene's options: `node_modules/@dennisklein/avatars/scenes/<id>/README.md`.
- `npx avatars help` lists the commands and their options.
