# Hugo shortcode

A `video` shortcode that plays a published episode on a Hugo site: the MP4
with its poster, WebVTT captions and chapter buttons that seek the video.

```markdown
{{< video "quickstart" >}}
```

It renders nothing until the episode is published, so pages can embed
episodes before they are rendered and a local build without renders still
works. It needs Hugo 0.128 or later (tested with 0.128.0, 0.145.0 and
0.167.0); the standard edition is enough.

## What it reads

`avatars publish` and `avatars ci` write two kinds of files for an episode
`<id>` ([DESIGN.md](../../DESIGN.md), "CLI"):

| File | Used for |
| --- | --- |
| `data/videos/<id>.json` | the manifest: `title`, `length`, `presenter.name`, `presenter.disclosure` and `chapters` (`title`, `start`, `time`) |
| `static/videos/<id>.mp4` | the video |
| `static/videos/<id>.jpg` | the poster; its size gives the player its aspect ratio (16:9 without it) |
| `static/videos/<id>.vtt` | the captions track |

The shortcode renders the player when both the manifest and the MP4 exist.
The line under the title shows the length and the presenter's disclosure,
or the presenter's name when the avatar has no disclosure.

## Filling `data/` and `static/`

Point the `publish` directories of the project's `avatars.json` at the site,
relative to the project root:

```json
{
  "publish": { "static": "docs/static/videos", "data": "docs/data/videos" }
}
```

Then either way fills them; `--static DIR` and `--data DIR` override the
configuration for one run:

```bash
npx avatars voice --all && npx avatars publish --all   # voice, render and publish every episode
npx avatars ci --all --store .avatars-store            # the same for what changed since the last run
```

`ci` keeps one directory per render hash in the store and copies from it, so
a site build voices and renders only the episodes whose sources, narration or
library changed. In GitHub Actions, the composite action in
[`integrations/github/render`](../github/render/README.md) runs `ci` with the
store kept in the Actions cache. The published files are build output: list
the two directories in the site's `.gitignore`.

## Use it: copy the files

Copy the shortcode and its stylesheet into the site, for example from the
installed package:

```bash
pkg=node_modules/@dennisklein/avatars/integrations/hugo
mkdir -p docs/layouts/shortcodes docs/assets/avatars
cp "$pkg/layouts/shortcodes/video.html" docs/layouts/shortcodes/
cp "$pkg/assets/avatars/video.css" docs/assets/avatars/
```

Sites that use the template layout of Hugo 0.146 and later may put the
shortcode in `layouts/_shortcodes/` instead. Copied files do not follow
library updates; copy them again after upgrading.

## Use it: import a Hugo module

The repository can be imported as a Hugo module with two mounts, so the site
uses the files of a tagged release without copying them. Modules need Go, and
the site must be a module itself (`hugo mod init <module path>` once):

```toml
[module]
  [[module.imports]]
    path = "github.com/dennisklein/avatars"
    [[module.imports.mounts]]
      source = "integrations/hugo/layouts"
      target = "layouts"
    [[module.imports.mounts]]
      source = "integrations/hugo/assets"
      target = "assets"
```

`hugo mod get github.com/dennisklein/avatars@v0.1.0` pins a release in the
site's `go.mod`; without it, the first build records the latest release tag
there. Only the two mounted directories reach the site.

## Configuration

Every setting is an optional site parameter:

```toml
[params.avatars]
  data = "videos"         # data key of the manifests; "/" nests: "media/videos" is data/media/videos/
  static = "videos"       # path of the media under staticDir, and their URL path
  staticDir = "static"    # the site directory that holds the static files
  stylesheet = true       # link the stylesheet before the first video of a page
  [params.avatars.captions]
    lang = "en"           # srclang of the captions track
    label = "English"     # its label in the player's menu
```

`static` and `staticDir` must match where `avatars publish` writes the media:
with `"static": "docs/static/media/clips"` in `avatars.json`, set
`static = "media/clips"`. A site with Hugo's own `staticDir` changed sets
`staticDir` to the same directory. On a multilingual site, set the captions
per language under `[languages.<lang>.params.avatars.captions]`; the other
settings carry over from the root.

## Page markup

The first video on a page adds a `<link rel="stylesheet">` for
`assets/avatars/video.css` (minified and fingerprinted by Hugo Pipes) and a
small script; later videos on the same page reuse them. The script handles
clicks on chapter buttons for every video on the page: it seeks the button's
video to the chapter and plays it.

```html
<figure class="av-video" id="video-quickstart">
  <video controls preload="none" playsinline poster="…/quickstart.jpg" width="1280" height="720" aria-label="Quickstart">
    <source src="…/quickstart.mp4" type="video/mp4">
    <track kind="captions" src="…/quickstart.vtt" srclang="en" label="English" default>
  </video>
  <figcaption>
    <div class="av-video-title"><strong>Quickstart</strong><span>1:04 · …</span></div>
    <ol class="av-video-chapters">
      <li><button type="button" data-t="0">0:00</button>Welcome</li>
    </ol>
  </figcaption>
</figure>
```

`video-<id>` anchors link to a video from elsewhere.

## Styling

The stylesheet lives in `assets/` rather than `static/` so that Hugo
minifies and fingerprints it, and so that only pages with a video load it. Its
colours derive from the text colour, which suits light and dark themes; a
site matches its palette by setting these custom properties on `:root` or
`.av-video`:

| Property | Styles | Default |
| --- | --- | --- |
| `--av-video-accent` | chapter buttons | the text colour |
| `--av-video-border` | the outline of the figure | the text colour at 20 % |
| `--av-video-bg` | the caption area | the text colour at 5 % |
| `--av-video-muted` | the length and presenter line | the text colour at 70 % |
| `--av-video-screen` | the player before the poster loads | black |
| `--av-video-radius` | the corners | 12px |

```css
:root {
  --av-video-accent: #0d9488;
}
```

To bundle the rules with the site's own CSS instead, set
`stylesheet = false` and add `resources.Get "avatars/video.css"` to the
theme's CSS pipeline.
