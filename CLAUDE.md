# CLAUDE.md

avatars is a library of instructor avatars, scenes and a design system for
tutorial videos rendered with HyperFrames. `DESIGN.md` is the authoritative
contract (concepts, file formats, runtime namespaces, the pose, slots, tokens,
project config, CLI); `docs/` holds the guides. Projects consume the library
by git tag and keep only their brand, lexicon, checks and episodes.

## Commands

```bash
npm ci                                   # Node 22+
npm test                                 # node --test test/
npm run test:voice                       # Python unit tests of the voice tool (no model needed)
node cli/avatars.mjs <command> --project examples/demo   # the CLI against the demo project
node cli/avatars.mjs validate --project examples/demo    # schema validation of every manifest
```

Rendering needs FFmpeg with libx264 and a Chrome that HyperFrames can drive
(`npx hyperframes browser ensure`, or `HYPERFRAMES_BROWSER_PATH`). Voicing
needs Python 3.10 to 3.13 with `voice/requirements.txt` and
`python3 voice/avatar_voice.py setup` once.

## Rules

- Runtime code (`core/`, `rigs/`, `parts/`, `avatars/*/parts/`, `scenes/`) is
  a pure function of timeline time: no `Math.random`, `Date.now`, timers,
  `requestAnimationFrame`, CSS animations or network requests.
- The library is project-neutral: no project names, logos, links or colours
  outside a brand. Colours in scenes come from tokens (`var(--av-…)` in CSS,
  `Avatars.tokens` in JS); parts paint with palette roles.
- A change to the vocabulary (visemes, moods, gestures), a registry or context
  signature, a schema or a slot is breaking; update `DESIGN.md`, the schemas
  in `core/schemas/` and the docs in the same change.
- Changes that alter pixels or sound of existing episodes re-render every
  episode that uses them; say so in the commit body.
- Every source file starts with the SPDX lines from `DESIGN.md`; `REUSE.toml`
  covers JSON, SVG, Markdown and images.

## Commits

- Conventional Commits `<type>(<scope>): <description>`; types `feat fix docs
  style refactor test chore build ci`; scopes are top-level directories
  (`core`, `scenes`, `parts`, `avatars`, `voice`, `cli`, …).
- One logical change per commit. The message describes the commit itself:
  no references to conversations, sessions, other repositories' history or
  time ("now", "new", "previously"), so it reads correctly without context.
- Prefer a bullet-point body stating what changed and why.
