# Tests

The Node test suites of the package, run with `npm test`
(`node --test "test/*.test.mjs"`). The voice tool's Python tests are in
`voice/tests/` and run with `npm run test:voice`.

| Suite | What it covers |
| --- | --- |
| `tokens.test.mjs` | `cli/lib/tokens.mjs` and `core/tokens.js`: merge order, aliases, the alpha extension, comment keys, cycles and missing references, CSS names, colour parsing, contrast |
| `themes.test.mjs` | every theme: the semantic tokens of DESIGN.md, resolution with the component tokens, fonts, its contrast pairs; every format's size tokens |
| `resolve.test.mjs` | `cli/lib/project.mjs` on `fixtures/studio`: lookup order, part rules, palettes, hidden slots, lexicon order, token tiers, `episode.json` |
| `bundle.test.mjs` | the vendor bundle (load order, identical across runs and checkouts) and the render hash (what changes it and what does not, symbolic links) |
| `validate.test.mjs` | schema validation of the package and `examples/demo`, the messages for `fixtures/broken`, line ids, Kokoro presets and token comments |
| `fixture-voice.test.mjs` | fixture narration: deterministic, plausible timings, the voice tool's files, line ids it refuses |
| `runtime.test.mjs` | runtime scripts in a Node vm: unknown moods warn and show as neutral, terminal marks |
| `source-rules.test.mjs` | no clocks, randomness, timers or network in runtime code; colours from tokens; SPDX lines; JSON; no project names; plugin version; `npm pack` leaves generated files out |
| `cli.test.mjs` | exit codes and messages of the command line, `avatars new` and the titles it refuses, what `render`, `publish` and `gallery` refuse, WebVTT escaping |
| `browser.test.mjs` | presenters of every avatar, look and theme in Chrome; seek-order determinism of the demo episodes (`cli/tools/frame-diff.mjs`); render workers that start inside back-to-back moves; shots, intro and the warnings of scenes and moods; `avatars check --quick` on the demo and on a new project, with its wordmark and stale-narration checks |

Tests write only to temporary directories, which they remove. Suites that
change a project or the package work on copies (`helpers.mjs`:
`copyProject`, `copyPackage`).

## Fixtures

- `fixtures/studio/` is a project whose library holds the avatar `kit` on
  the base `box-200x200`, its looks and parts, a part that shadows the
  package's `tops/hoodie`, a look for the package's Sindy, a lexicon pack,
  a scene and an icon pack. Each episode's `episode.json` selects one case,
  most of them errors (`two-tops`, `wrong-base`, `bad-colourway`, …).
- `fixtures/broken/` is a project in which every manifest breaks a schema or
  a rule of `avatars validate`; `validate.test.mjs` lists the message each
  file must give.

## Tools and environment

| Needs | Suites | Without it |
| --- | --- | --- |
| a Chrome: `HYPERFRAMES_BROWSER_PATH`, the Playwright headless shell under `/opt/pw-browsers`, or `google-chrome` on `PATH` | `browser.test.mjs` | skipped |
| `python3` (or `AVATARS_PYTHON`) for the voice tool's `keys` | the render hash in `bundle.test.mjs`, stale narration in `browser.test.mjs` | skipped |
| `npm` | the pack test in `source-rules.test.mjs` | skipped |

`AVATARS_TEST_BROWSER=0` skips the browser suites on purpose, which leaves a
run of about 20 seconds. With a browser, `npm test` takes two to three
minutes, most of it in `frame-diff.mjs` and in the render workers of the
edge cases. No suite needs FFmpeg, the voice model or network access.
