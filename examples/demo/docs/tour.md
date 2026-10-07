# A tour of the demo project

{{< video "tour" >}}

The tour shows how a project makes a video with the avatars library: the
files a project keeps, the way from a script to a published video, and the
commands that create, voice and check an episode. This page holds every file
and terminal line the video shows, because `avatars check` compares the two.

## What a project keeps

A project keeps only what is its own: its brand, a lexicon with the
pronunciations of its words, its episodes and any checks of its own. The
avatars, looks, scenes, themes and formats come from the library.

## The project file

`avatars.json` at the project root casts the presenter, picks the theme, the
format and the brand, and lists the lexicons and icon packs:

```json
{
  "cast": { "host": { "avatar": "sindy", "look": "hoodie" } },
  "theme": "midnight",
  "format": "landscape-1080p",
  "brand": "brand/brand.json",
  "lexicons": ["en-us/core", "./lexicon.json"],
  "icons": ["core", "tech"],
  "grounding": { "sources": ["docs"], "embed": "{{< video \"{id}\" >}}" }
}
```

`grounding` turns on the check that every terminal command and output line
and every code line an episode shows also appears on a page that embeds the
episode. For the tour, that page is this one, `docs/tour.md`.

## From script to video

1. `script.json` holds the narration, one line per beat.
2. The voice tool speaks every line and records when each word starts.
3. The composition, `index.html`, places its scenes on those words.
4. HyperFrames renders the composition into an MP4 with burned-in captions.
5. `avatars publish` writes a web video, a poster, WebVTT captions and a
   manifest for the docs page that embeds the episode. In CI, `avatars ci`
   renders only the episodes whose render hash changed.

## Start an episode

In a project made with `avatars new project my-videos`, after `npm install`,
a new episode starts from the episode template:

```console
$ npx avatars new episode first-steps
created episodes/first-steps
$ ls episodes/first-steps
hyperframes.json  index.html  script.json
$ npx avatars fixture-voice first-steps
fixture voice: episodes/first-steps
```

`script.json` is the narration, `index.html` the chain of scenes and
`hyperframes.json` the HyperFrames project settings. Fixture voice writes
made-up word timings without a speech model, for layout work and tests.

## Voice and check

The real voice runs a speech model on the CPU and caches every line, so a
changed line is the only one voiced again. Then `check` loads the episode and
prints its chapters and lines:

```console
$ npx avatars voice first-steps
intro                      2.37s  Hi there! Welcome to First steps.
why                        6.13s  Every episode starts with why it matters. Name the viewer's
steps                      7.34s  Then show the way there. Each line of narration is one beat,
outro                      5.60s  That's the shape of an episode. Swap in your own lines and s
$ npx avatars check first-steps --quick
first-steps: vendor/ was out of date; rebuilt

first-steps: 0:27.3 (27.3 s), 4 chapters, 4 lines
  0:00.0    4.1 s  Welcome
          0:01.5  intro        Hi there! Welcome to First steps.
  0:04.1    6.9 s  Why it matters
          0:04.7  why          Every episode starts with why it matters. Name the viewer's pro…
  0:11.1    8.1 s  The way there
          0:11.7  steps        Then show the way there. Each line of narration is one beat, sc…
  0:19.2    8.1 s  Wrap-up
          0:19.9  outro        That's the shape of an episode. Swap in your own lines and scen…
first-steps: 0 errors, 0 warnings
```

`check` without `--quick` also runs the HyperFrames lint and writes two stills
per chapter as contact sheets into the episode's `snapshots/` directory.
