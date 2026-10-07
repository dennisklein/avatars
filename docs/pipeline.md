# From episode to docs site

A project keeps its configuration, brand, lexicon, checks and episodes, and
runs the `avatars` command of the library version its lockfile pins. This
guide covers the project file, every command, what the CLI generates, the
checks, publishing, CI and the integrations. The exact formats are in
[DESIGN.md](../DESIGN.md) ("Projects" and "CLI").

## The project

A project is a directory with `avatars.json`. This makes one from the
template:

```bash
npx --yes --package github:dennisklein/avatars#semver:^0.1 avatars new project my-videos
```

```text
avatars.json       cast, theme, format, brand, lexicons and icon packs
package.json       the dependency "@dennisklein/avatars": "github:dennisklein/avatars#semver:^0.1"
brand/             brand.json, emblem.svg, emblem-badge.svg
lexicon.json       pronunciations of the project's words
episodes/<id>/     script.json, index.html, hyperframes.json, episode.json (optional)
library/           optional: the project's own avatars, parts, looks, scenes, themes, formats, icons, lexicon packs
```

Every key of `avatars.json` is optional:

| Key | Default | Meaning |
| --- | --- | --- |
| `cast` | `{ "host": { "avatar": "sindy" } }` | presenters by role: `{ avatar, look, palette, options, voice }` |
| `theme`, `format` | `midnight`, `landscape-1080p` | ids in `library/` or the package |
| `brand` | none | the brand file, relative to the project |
| `lexicons` | `["en-us/core"]` | library packs, and project files starting with `./` |
| `icons` | `["core", "tech"]` | icon packs; later packs win |
| `scenes` | `[]` | project scenes in `library/scenes/<id>/` |
| `episodes`, `renders`, `library` | `episodes`, `renders`, `library` | directories |
| `tokens` | `{}` | token overrides for every episode |
| `grounding` | none | `{ sources, embed }`: compare terminal and code content with the pages that embed the episode |
| `checks` | `[]` | project check modules |
| `publish` | `publish/` for both | `{ static, data }`: where `publish` and `ci` write |

Ids resolve in the project's `library/` first, then in the package, so a
project adds avatars, looks, parts, scenes, themes, formats, icon packs and
lexicon packs without forking the library. An episode's `episode.json`
overrides `cast`, `theme`, `format` and `tokens` for that episode.

## Commands

`npx avatars <command> [ids | --all] [options] [--project DIR]`. The project
is `--project DIR`, else the nearest directory with `avatars.json` at or
above the working directory. `--all` selects every episode that has the file
the command needs. Errors print as `avatars: <message>`; the exit code is 1
for failures and 2 for usage errors, and `npx avatars help` prints the usage.

| Command | Does |
| --- | --- |
| `new project DIR [--title T]` | a project from `templates/project` in `DIR`, which must be absent or empty; `DIR`'s name becomes the project id |
| `new episode ID [--title T]` | `episodes/<ID>/` from `templates/episode`, with the project theme's `@font-face` rules in its head |
| `vendor ID…` | writes `episodes/<id>/vendor/` |
| `voice ID… [--force]` | voices `script.json` into `assets/voice/`, cached per line |
| `voice-setup` | downloads and prepares the voice model of every engine the cast's presets use |
| `phonemes ID… [--flagged]` | each word's phonemes, their source and flags; `--flagged` only risky words |
| `fixture-voice ID…` | timing files with made-up timings and no audio |
| `lint ID…` | `hyperframes lint` in the episode |
| `check ID… [--quick]` | everything below under "Checks"; `--quick` skips lint and contact sheets |
| `render ID… [--draft]` | `renders/<id>.mp4` at standard quality (or draft), with burned-in captions |
| `publish ID… [--static DIR] [--data DIR]` | the files a docs site serves, below under "Publishing" |
| `hash ID…` | prints `<id>-<hash>`, the render hash |
| `ci ID… --store DIR [--used FILE]` | renders what the store lacks, then publishes from the store |
| `validate` | checks every manifest of the package and the project against its schema |
| `gallery --out DIR [--theme T]` | avatar sheets and demo contact sheets |
| `sheet AVATAR [--look L] [--mode M] [--theme T] -o PNG` | one avatar sheet ([avatars.md](avatars.md)) |

`voice`, `phonemes` and `fixture-voice` need only `script.json`; the others
need `index.html`. `validate`, `voice-setup`, `sheet` and `gallery` also work
outside a project, on the package alone.

The environment:

| Variable | Meaning |
| --- | --- |
| `AVATARS_PYTHON` | the Python that runs the voice tool (default `python3`) |
| `AVATARS_VOICE_CACHE` | the voice model directory (default `~/.cache/avatars-voice`) |
| `HYPERFRAMES_BROWSER_PATH` | the Chrome to render and check with, instead of the one HyperFrames manages |

The CLI runs HyperFrames from its own dependency, never through a bare
`npx`, with telemetry off. In an episode directory,
`npx hyperframes preview` opens the HyperFrames studio once `vendor/` exists,
and `npx hyperframes render --workers 1` renders on one worker.

## The vendor bundle

An episode page loads `vendor/avatars.js`, `vendor/avatars.css`,
`vendor/gsap.min.js` and `vendor/fonts/*.woff2`, all generated from the
resolved episode: its tokens, format, brand, icons and cast, and the runtime,
rig, base, part and scene files it needs. `lint`, `check`, `render` and
`publish` rebuild it when any file differs from what `avatars vendor` would
write and leave it alone otherwise. The bundle is deterministic, so it is
part of the render hash; it is never committed. Nothing loads from the
network at render time: GSAP and the fonts come from npm, the narration from
`assets/voice/lines.js`.

## The render hash

`avatars hash <id>` prints `<id>-<hash>`: the first 16 hex characters of a
SHA-256 over the tag `avatars-render/1`, the episode's own files (not
`vendor/`, `renders/`, `snapshots/`, `.hyperframes/`, `node_modules/` or
`assets/voice/`), the vendor files, the voice cache keys of its lines, the
HyperFrames version and the publish code. It does not depend on where the
project or the package are checked out, so it matches between machines and
CI. A docs-only change keeps every hash; a library upgrade changes the hashes
of exactly the episodes whose bundle or narration it changes:

```bash
npx avatars hash --all > before.txt   # then upgrade the dependency
npx avatars hash --all | diff before.txt -
```

## Checks

`avatars check <id>` is the review an agent can run without eyes or ears.
Before it loads the page it validates `avatars.json`, `brand.json`,
`episode.json` and `script.json`, rebuilds a stale `vendor/` and compares the
page's `@font-face` rules with the theme's. It then loads the composition in
the HyperFrames browser, prints the timeline (chapters and the start of every
line) and reports:

- **Errors** (exit code 1): schema problems; an episode that does not
  resolve; no narration; `@font-face` rules that differ from the theme's (it
  prints the right ones); page errors, missing files and network requests;
  no `window.__episode` or no `script.json`; a script line changed since it
  was voiced; a failing project check, lint or snapshot.
- **Warnings**: console warnings (cues that match several words, terminal or
  code lines that do not fit, diagram overlaps); text cut off in a diagram
  node; gestures the avatar's base cannot animate; brand marks the cast draws
  but the brand lacks; theme contrast pairs below their minimum with this
  episode's tokens; fixture narration; lines never said; more than 2.5 s
  without narration; an episode id that differs from the directory; no page
  that embeds the episode; ungrounded terminal and code lines.

Without `--quick` it also runs `hyperframes lint` and writes two stills per
chapter, in the middle and just before the next chapter, as contact sheets
into `episodes/<id>/snapshots/`. Look at them before rendering.

### Grounding

With `grounding` in `avatars.json`, every terminal command, output line and
code line an episode shows must appear on a page that embeds it, so viewers
can copy from the page what they saw:

```json
"grounding": { "sources": ["docs"], "embed": "{{< video \"{id}\" >}}" }
```

- The pages are the Markdown files (`.md`, `.markdown`) under `sources`
  (relative to the project root; entries starting with a dot and
  `node_modules` are skipped) whose text contains `embed` with `{id}`
  replaced. Whitespace in the snippet may vary, and may be missing where it
  does not separate two words.
- A command must occur somewhere in the pages' text.
- An output or code line must equal a whole page line, ignoring trailing
  whitespace but not leading whitespace; blank lines are skipped. Lines of a
  fenced code block also count without the block's common indentation, so a
  block nested in a list item matches unindented output.

A missing page and every ungrounded line are warnings. Copy content from the
page into the episode, never the other way round; if the page is wrong, fix
the page in the same change.

### Project checks

Rules the library cannot know (lengths per series, a required recap chapter)
go in check modules, listed in `avatars.json` as
`"checks": ["./checks/episodes.mjs"]`:

```js
export default async function (api) {
  // api: { id, dir, episode, project, warn(msg), error(msg) }
  // episode is window.__episode: { id, title, duration, chapters, cues, lines, terminal }
  if (api.episode.duration > 180) api.warn(`longer than 3 min: ${api.episode.duration} s`);
}
```

They run after the built-in checks; a module that throws is an error.

## Publishing

`avatars publish <id>` renders a master at standard quality without burned-in
captions (the player shows a captions track instead, which viewers can turn
off) and writes:

| File | Contents |
| --- | --- |
| `<static>/<id>.mp4` | H.264 at CRF 28 with `-tune animation`, AAC 96 kbit/s mono, `+faststart`; about 4 MB per minute |
| `<static>/<id>.jpg` | the poster: the frame at 2.6 s (or half a second before the end of a shorter episode), 1280 px wide |
| `<static>/<id>.vtt` | WebVTT captions from the narration's word timings |
| `<data>/<id>.json` | the manifest: `title`, `duration`, `length`, `bytes`, `presenter` (`name`, `disclosure`) and `chapters` (`title`, `start`, `time`) |

`<static>` and `<data>` are `--static` and `--data`, else `publish` in
`avatars.json`, else `publish/`. `publish` needs voiced narration; it does
not voice. The files are build output: list their directories in the site's
`.gitignore`.

## CI

`avatars ci --all --store <dir>` is what a docs workflow runs. For every
episode it computes `<id>-<hash>`; when `<store>/<id>-<hash>/` is missing it
voices the episode and publishes it into that store entry, then it copies the
entry's files into the publish directories. `--used <file>` appends every
key, so the workflow can delete the entries no episode uses. A push that
changes no episode and no library code renders nothing.

The composite action `integrations/github/render` runs this on GitHub Actions
with the store in the Actions cache. When every episode is in the store it
needs neither FFmpeg, the voice model nor a browser and skips setting them
up:

```yaml
- uses: actions/setup-node@<commit> # v7.0.0
  with:
    node-version: 22
- run: npm ci
- uses: dennisklein/avatars/integrations/github/render@<commit> # v0.1.0
  with:
    project: .
```

Its inputs are `project`, `store` (`.avatars-store`), `cache-key-prefix`
(`avatars-renders`), `python-version` (`3.12`) and `install-ffmpeg`
(`true`); its outputs `used`, `store` and `rendered`. It runs the CLI of the
package the project installed, so the action and the episodes agree on the
library version; pin it to the commit of the same tag.
[integrations/github/render/README.md](../integrations/github/render/README.md)
has a complete workflow that builds and deploys a Hugo site to GitHub Pages.

The library's own workflows are `.github/workflows/ci.yml` (Node and Python
tests, schema validation, REUSE, and a quick check of the demo episodes with
fixture narration) and `gallery.yml` (the gallery on GitHub Pages).

## The Hugo shortcode

`integrations/hugo/` holds a `video` shortcode and its stylesheet. On a page:

```markdown
{{< video "first-steps" >}}
```

It plays the published MP4 with its poster and captions and lists the
chapters as buttons that seek the video. It renders nothing until the
manifest and the MP4 exist, so pages can embed an episode before it is
rendered, and a local build without renders works. It needs Hugo 0.128 or
later. Copy `layouts/shortcodes/video.html` and `assets/avatars/video.css`
into the site, or import the repository as a Hugo module with two mounts
(`integrations/hugo/layouts` → `layouts`, `integrations/hugo/assets` →
`assets`).

By default it reads the manifest from `data/videos/` and the media from
`static/videos/`. For a project whose Hugo site is the project directory:

```json
"publish": { "static": "static/videos", "data": "data/videos" }
```

and for a site in `docs/` of the project, `"docs/static/videos"` and
`"docs/data/videos"`. The site parameters `params.avatars.data`, `static`,
`staticDir`, `stylesheet` and `captions.lang` and `captions.label` change the
defaults, and the custom properties `--av-video-accent`, `-border`, `-bg`,
`-muted`, `-screen` and `-radius` its colours;
[integrations/hugo/README.md](../integrations/hugo/README.md) has the
details.

The shortcode is also the natural grounding `embed`: the pages that show an
episode are the pages it is checked against.

## The Claude Code plugin

The repository is a Claude Code plugin marketplace, `avatars`, with one
plugin, `avatars` (`avatars@avatars`), which ships the skills in `skills/`:

| Skill | For |
| --- | --- |
| `avatars-episode` | making or updating an episode: storyboard, narration, composition, acting, grounding, check, render |
| `avatars-voice` | speakable narration, pronunciation checks, lexicon entries, presets and the model |
| `avatars-design` | changing the library: avatars, parts, looks, themes, formats, scenes, icons, lexicon packs |

A project enables it for everyone in `.claude/settings.json`, with the same
tag as its `package.json`:

```json
{
  "extraKnownMarketplaces": {
    "avatars": {
      "source": { "source": "github", "repo": "dennisklein/avatars", "ref": "v0.1.0" }
    }
  },
  "enabledPlugins": {
    "avatars@avatars": true
  }
}
```

The skills appear as `/avatars:avatars-episode` and so on. A release sets the
same version in `package.json` and in the plugin entry of
`.claude-plugin/marketplace.json`, and Claude Code replaces its cached plugin
only when that version changes. In this
repository `.claude/skills` links to `skills/`, so the skills also load while
working on the library.
[integrations/claude-code/README.md](../integrations/claude-code/README.md)
covers non-interactive runs, cloud sessions and upgrades.
