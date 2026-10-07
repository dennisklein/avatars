# GitHub Actions: render episodes

A composite action that voices, renders and publishes a project's episodes in
CI with `avatars ci --all`, keeping the renders in the Actions cache so that
a run renders only what changed. It writes the published files into the
`publish` directories of the project's `avatars.json`, ready for a site
build such as the [Hugo shortcode](../../hugo/README.md).

```yaml
- uses: dennisklein/avatars/integrations/github/render@<commit> # v0.1.0
  with:
    project: docs
```

## What it does

1. Locates the installed `@dennisklein/avatars` package from the project
   (`require.resolve`) and runs that package's CLI, so the action and the
   episodes always agree on the version the lockfile pins.
2. Restores the newest render store of earlier runs from the Actions cache.
3. Sets up Python and hashes every episode (`avatars hash --all`). The render
   hash covers the episode's files, the vendored library, the voice cache keys
   of its narration, the HyperFrames version and the publish code.
4. Only when an episode's hash is not in the store: installs FFmpeg, the voice
   tool's packages (`voice/requirements.txt` of the package) and the voice
   model (`avatars voice-setup`, cached under its own key), and sets up the
   Chrome Headless Shell build of the pinned HyperFrames version.
5. Runs `avatars ci --all --store … --used …`: renders the missing episodes
   into the store and copies every episode's MP4, poster, captions and
   manifest into the publish directories.
6. After a successful run, removes store entries that no episode uses any
   more. After a failure it keeps them all, so a retry reuses the renders
   that finished.
7. Saves the store under a new cache key when it changed.

A push that touches neither episodes nor the library restores the store,
hashes, copies and is done, without FFmpeg, the voice model or a browser.

## Requirements

- A Linux runner with `apt-get` (`ubuntu-24.04`), or `install-ffmpeg: "false"`
  and FFmpeg with libx264 on the `PATH`.
- Node 22 and the project's npm dependencies installed in the project
  directory before the action runs (`actions/setup-node`, then `npm ci`).
- `publish` in `avatars.json` pointing where the site expects the files, and
  at least one episode with an `index.html`.
- `contents: read` is the only permission it needs; the cache works with the
  job's runtime token.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `project` | `.` | the project directory (the one with `avatars.json`), relative to the workspace |
| `store` | `.avatars-store` | the render store, relative to the workspace or absolute |
| `cache-key-prefix` | `avatars-renders` | prefix of the store's cache keys |
| `python-version` | `3.12` | Python for the voice tool, 3.10 to 3.13 |
| `install-ffmpeg` | `true` | install FFmpeg with `apt-get` when episodes need rendering |

## Outputs

| Output | Meaning |
| --- | --- |
| `used` | a file listing the store entries (`<id>-<hash>`) of every published episode, one per line |
| `store` | the absolute path of the store |
| `rendered` | the number of episodes that were not in the store, which this run rendered |

## The render store

The store holds one directory per render, named `<id>-<hash>`, with the
episode's published files. Cache entries cannot be overwritten, so every run
that changes the store saves it as `<prefix>-run-<run id>-<attempt>`, and the
next run restores the newest entry whose key starts with `<prefix>-run-`. A
run that changes nothing saves nothing.

GitHub keeps caches per branch: a run restores caches of its own branch and of
the default branch, and a pull request also those of its base branch. Caches
that are not used for a week are evicted, and the least recently used go first
when a repository exceeds its cache quota, so a store that is in use stays. A
workflow that renders two projects, or two checkouts of one project such as a
release and a preview branch, calls the action once for each, with its own
`store` and `cache-key-prefix`.

The voice model (about 350 MB) is cached as
`avatars-voice-<os>-<hash of the voice engines>` in
`AVATARS_VOICE_CACHE`, by default `~/.cache/avatars-voice`. Set
`HYPERFRAMES_BROWSER_PATH` in the job's environment to render with another
browser.

## Example: a Hugo site on GitHub Pages

The project lives in `docs/`, with `"publish": { "static":
"static/videos", "data": "data/videos" }` in `docs/avatars.json`, the
shortcode in the site and both directories in `docs/.gitignore`:

```yaml
name: Docs

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-24.04
    timeout-minutes: 120
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: docs/package-lock.json

      - name: Install dependencies
        working-directory: docs
        run: npm ci --no-audit --no-fund

      - name: Render episodes
        uses: dennisklein/avatars/integrations/github/render@<commit> # v0.1.0
        with:
          project: docs

      - uses: peaceiris/actions-hugo@2752ce1d29631191ea3f27c23495fa06139a5b78 # v3.2.1
        with:
          hugo-version: "0.167.0"

      - name: Build
        working-directory: docs
        run: hugo --minify --destination "$RUNNER_TEMP/site"

      - uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0
        with:
          path: ${{ runner.temp }}/site

  deploy:
    needs: build
    runs-on: ubuntu-24.04
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1
```

Pin the action to the commit of the release tag that the project's
`package.json` depends on, with the tag in a comment, as for every other
action. This prints it; for an annotated tag, take the dereferenced `^{}`
line:

```bash
git ls-remote https://github.com/dennisklein/avatars 'refs/tags/v0.1.0*'
```
