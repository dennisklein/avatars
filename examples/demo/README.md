# Demo project

A neutral project that uses the library the way a consuming project does.
The tests, CI and the gallery render its episodes, so it exercises every
library scene, a scene of its own, a second look and a second theme. Its
brand is "Demo", with an original placeholder emblem and links on
example.org.

| Episode | Length | Shows |
| --- | --- | --- |
| `tour` | about 2 minutes | how a project makes a video: every library scene, a custom `compare` scene registered in the page, terminal sessions of the `avatars` command and grounding against `docs/tour.md` |
| `wardrobe` | under a minute | the `blazer-glasses` look on the `daylight` theme, set in its `episode.json` |

```text
avatars.json            cast, theme, format, brand, lexicons, icons and grounding
brand/                  brand.json, emblem.svg, emblem-badge.svg
lexicon.json            how the narration says file names such as avatars.json
docs/                   the pages that embed the episodes; check compares them
episodes/tour/          script.json, index.html, hyperframes.json
episodes/wardrobe/      the same, plus episode.json
```

From the repository root:

```bash
node cli/avatars.mjs fixture-voice --all --project examples/demo
node cli/avatars.mjs check --all --project examples/demo
node cli/avatars.mjs voice tour --project examples/demo
node cli/avatars.mjs render tour --draft --project examples/demo
```

`fixture-voice` gives the episodes made-up timings without the speech model,
which is enough for `check` and the gallery; `voice` and `render` need the
setup in the repository's `CLAUDE.md`. Generated files (`vendor/`,
`assets/voice/`, `snapshots/`, `renders/`) are git-ignored.

The terminal session in `tour` is a real run in a project made by
`avatars new project`, with the episode template's narration. When the
`avatars` output, the episode template or the voice changes, run the session
again (`new episode`, `ls`, `fixture-voice`, `voice`, `check --quick`) and
copy its output into both `episodes/tour/index.html` and `docs/tour.md`.
