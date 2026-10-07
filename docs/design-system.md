# The design system

Every colour, font, size, radius, shadow and timing of an episode is a
design token. Scenes use only tokens, so the same episode renders in any
theme and with any brand, and a project changes its look without touching
library code. [DESIGN.md](../DESIGN.md) ("Design tokens" and "Themes,
formats, icons, brands") is the reference; this guide explains how the
pieces fit and how to add your own.

## Tokens

Token files use the design-token JSON format. A token is an object with a
`$value`; any other object is a group, so names are paths:

```json
{
  "caption": {
    "bg": { "$value": "{color.bg}", "$type": "color", "$extensions": { "avatars": { "alpha": 0.78 } } },
    "size": { "$value": "{font.size.3xl}", "$type": "dimension" }
  }
}
```

- A value is a CSS string (`"#0f172a"`, `"26px"`, a shadow, a font stack) or
  a number (seconds, unitless factors).
- A value that is exactly `"{name}"` is an alias of another token.
- `$extensions.avatars.alpha` turns a colour into `rgba(r, g, b, alpha)`:
  `caption.bg` above is the theme's background at 78 %.

`avatars vendor` merges every token file of an episode in tier order, then
resolves aliases, so an alias follows the final value of its target: a brand
that changes `color.accent` changes every component token that aliases it.
The episode's `vendor/avatars.css` starts with every token as a custom
property, `--av-` plus the name with dots as dashes (`caption.bg` →
`--av-caption-bg`), and `Avatars.data.tokens` holds the same values for
scripts (`Avatars.tokens.get`, `num`, `color`).

## Tiers and names

| Tier | Files | Names |
| --- | --- | --- |
| Primitives | `tokens/color`, `font`, `radius`, `shadow` and `motion.tokens.json` | `color.<ramp>.<50–950>`, `color.white`, `color.black`, `font.family.*`, `font.weight.*`, `font.size.3xs` … `font.size.8xl`, `radius.2xs` … `radius.5xl`, `radius.pill`, `radius.circle`, `shadow.none\|md\|lg`, `motion.*` |
| Components | `core/tokens.json`, `scenes/<id>/tokens.json` | `<component>.<property>` (`window.bar-height`); a scene's as `<scene>.<element>-<property>` (`diagram.node-bg`) or `<scene>.<property>` (`terminal.cps`) |
| Theme | `themes/<id>/theme.tokens.json` | the semantic tokens (`color.bg`, `color.accent`, `font.sans`, `font.mono-advance`, …) and component overrides |
| Format | `formats/<id>/format.tokens.json` | `format.width`, `format.height` and sizes for the canvas |
| Brand, project, episode | `tokens` in `brand.json`, `avatars.json`, `episode.json` | any token, overriding the tiers before |

The colour ramps are the Tailwind CSS v3 ramps `slate`, `gray`, `teal`,
`cyan`, `sky`, `blue`, `emerald`, `amber`, `red`, `rose` and `violet`. The
type scale runs from `font.size.3xs` (20 px) to `font.size.8xl` (190 px).
Motion tokens are seconds and pixels: `motion.transition.default`,
`.push`, `.iris` and `.blur`, `motion.shot` (the presenter's glide between
shots), `motion.enter.offset` and `.duration` (the rise of entering items),
`motion.fade-out` and `motion.tail` (the end of an episode). There is no
spacing scale: positions, gaps and paddings live in scene CSS and in the
format's geometry.

Component tokens default to semantic tokens, so a theme rarely needs to set
them. The shared ones in `core/tokens.json` are `glow`, `grid`, `chapter`,
`presenter`, `caption`, `kicker`, `headline`, `slide-title`, `icon`,
`window` and `blackout`; each scene's README lists its own. Metrics that CSS
and scripts both use are tokens too, so they share one value:
`window.bar-height`, `code.pad-x`, `code.pad-y`, `code.note-height`,
`terminal.pad-x`, `terminal.pad-y` and `terminal.line-height`.

The semantic tokens every theme sets:

| Token | Use |
| --- | --- |
| `color.bg`, `color.bg-alt` | scene backgrounds |
| `color.surface`, `color.surface-raised` | panels, cards and nodes |
| `color.surface-sunken`, `color.surface-bar` | terminals and code panels, their window bars |
| `color.border`, `color.border-subtle` | outlines and separators |
| `color.text`, `color.text-strong`, `color.text-muted`, `color.text-dim` | body, headings, secondary text, terminal output |
| `color.accent`, `color.accent-strong` | the brand accent and its deep variant |
| `color.accent-soft` | the accent as text and thin lines on the scene background: lighter than `accent` in a dark theme, deeper in a light one |
| `color.on-accent` | text on `color.accent-soft` |
| `color.info`, `color.info-soft` | the second accent |
| `color.ok`, `color.warn`, `color.danger` | status |
| `color.code-comment`, `color.code-keyword` | code colours beyond the accents |
| `font.sans`, `font.mono` | font stacks |
| `font.mono-advance` | the advance width of `font.mono` per character, in em (0.6 for JetBrains Mono); code and terminal scenes fit their font with it |

## Themes

A theme is `themes/<id>/theme.json` and `theme.tokens.json`. The library has
two:

- `midnight`, dark: slate surfaces, a teal accent, a sky-blue second accent.
- `daylight`, light: a slate page with white cards and a deep teal accent.
  Terminals and code panels stay dark, as screens on a light page, so its
  `surface-sunken`, `surface-bar`, `text-dim`, `code-comment` and
  `code-keyword` are colours for those windows, and it overrides the window,
  terminal and code tokens that default to page colours. Its `accent-soft`
  is a deeper teal than its `accent`, so that kickers, chapter labels and
  chip text reach 4.5:1 on the light page.

`theme.json` names the fonts and the contrast pairs:

```json
{
  "id": "daylight",
  "title": "Daylight",
  "description": "A light theme: …",
  "fonts": [
    { "family": "Inter", "weight": "400", "file": "inter-400.woff2", "src": "@fontsource/inter/files/inter-latin-400-normal.woff2" }
  ],
  "contrast": [
    ["color.text", "color.bg", 4.5],
    ["headline.color", "color.bg", 3],
    ["terminal.text", "window.bg", 4.5]
  ]
}
```

A font's `src` is a module path that resolves from the package, `file` its
name in `vendor/fonts/`, and `weight` the `font-weight` of its `@font-face`
rule (a range such as `"700 800"` covers both). Every episode page declares
exactly its theme's fonts inline; `avatars check` compares them and prints
the rules to paste when they differ.

### Make a theme

1. Copy the theme closest to yours into `themes/<id>/` of the library, or
   `library/themes/<id>/` of a project, and set `id` and `title`.
2. Set every semantic token in `theme.tokens.json`, including
   `font.mono-advance` for the monospace font. Prefer aliases of primitives
   (`{color.teal.600}`) to literals.
3. Override component tokens only where a component does not sit where its
   default implies: a light theme with dark terminals overrides the
   `window.*`, `terminal.*` and `code.*` colours, as `daylight` does.
4. List the fonts. A font package other than Inter and JetBrains Mono must be
   installed where the package resolves it (an npm dependency of the library,
   or of the project when npm installs it at the top of `node_modules`).
5. List contrast pairs for every text colour on every background it sits
   on, including component pairs such as `terminal.text` on `window.bg`:
   4.5 for text, 3 for large headings.
6. Check it:

   ```bash
   node cli/avatars.mjs validate
   node cli/avatars.mjs sheet sindy --theme <id> -o renders/sheets/sindy-<id>.png
   node cli/avatars.mjs gallery --out gallery/out
   ```

   The gallery renders every demo episode in every theme of the package;
   look at the contact sheets under `gallery/out/episodes/<id>/<episode>/`. In a
   project, set `"theme": "<id>"` in one episode's `episode.json` and run
   `npx avatars check <episode>`.

Themes stay brand-neutral: a project's own colours belong in its brand's
`tokens`, which apply on top of any theme.

## Contrast

`avatars check` computes the WCAG contrast ratio of every pair in
`theme.json` with the episode's final tokens, after the brand, project and
episode overrides, and warns about each pair below its minimum. A
semi-transparent background is composited over `color.bg` first. So a brand
that sets a pale accent learns about it at the first check of any episode.

A pair cannot say "over another token": a translucent highlight on a dark
terminal window in a light theme is composited over the light page, not the
window. List such text against the window colour, and check the real
composite by hand.

## Formats

A format is `formats/<id>/format.json` with `format.tokens.json` (and an
optional `format.css`). The library has `landscape-1080p`, 1920×1080.

- `width` and `height` are the canvas; `format.width` and `format.height` in
  the tokens size the page in `core/core.css`.
- `shots` are the presenter's framings, each a frame (the visible window: its
  position, size and corner radius), a stage inside it (where the avatar is
  drawn; its height follows the base canvas) and `ring`, the opacity of the
  round backdrop and ring. Scenes ask for shots by name: `hidden`, `hero`,
  `full`, `left`, `cornerR`, `cornerL`, `mini`.
- `scenes` holds the geometry of the diagram, code and terminal scenes: the
  areas they lay out in per shot, node metrics, font limits and gaps. The
  scenes throw without it.

A format with another canvas also needs episode pages whose viewport meta and
root `data-width` and `data-height` match it; the templates are 1920×1080.

## Brands and marks

A brand is the project's `brand.json`, here the demo's with an accent of its
own added:

```json
{
  "name": "Demo",
  "wordmark": "demo",
  "tagline": "SHOW · AND · TELL",
  "role": "your demo guide",
  "links": [["Docs", "example.org/docs"], ["Code", "example.org/code"]],
  "marks": { "emblem": "emblem.svg", "badge": "emblem-badge.svg" },
  "tokens": { "color": { "accent": { "$value": "#e11d48" } } }
}
```

The intro shows the wordmark, tagline and mark, the talk scene's name tag the
`role`, and the outro the `links`. `tokens` override any token for every
episode of the project; an accent of the brand reaches every scene and the
looks whose palette follows `{color.accent}`.

The intro leaves `intro.wordmark-gap` (0.125 em of the wordmark size, about
24 px) between the wordmark's line box and the tagline, so that descenders
such as g, p and y clear the tagline. A brand puts the tagline right under
the line box with `"tokens": { "intro": { "wordmark-gap": { "$value": 0 } } }`,
for example a wordmark without descenders whose rendered episodes should
keep their intro pixels.

Marks are SVG files next to `brand.json`, under three names:

| Mark | Drawn by |
| --- | --- |
| `emblem` | the intro (unless there is a `logo`), the emblem patch on the hoodie, and the hair clip when there is no `badge` |
| `badge` | the hair clip and other small accessories: an outlined variant that reads at small sizes |
| `logo` | the intro, when the sting should differ from the emblem the wardrobe wears |

The CLI keeps a mark's `viewBox` and inner markup. Parts fit the viewBox,
centred, into a square (the patch is about 74 base units wide, the clip
about 49) and insert the markup as it is, and the intro pops in the mark's
top-level elements one by one from the centre outwards, each up to its own
`opacity`. So a mark must be self-contained: plain shapes with their own
fills, no external references, and no ids, because the intro, the patch and
the clip draw it several times on one page and repeated ids clash. Group
pieces that should appear together into one top-level `<g>`.

A part that draws a mark the brand lacks draws nothing, and `avatars check`
warns. `examples/demo/brand/` and the project template's `brand/` hold
neutral placeholder marks.

## Icons

Icons are 24×24 stroke icons, one SVG per file in `icons/<pack>/<name>.svg`.
The CLI keeps their inner markup, and the scenes draw them in an `.icon` tile
stroked with `icon.stroke` (width 2, round caps and joins), so the inner
elements should not set their own stroke colour. A project picks packs in
`avatars.json` (`"icons": ["core", "tech"]`); later packs override earlier
ones. Packs:

- `core`: `check`, `gear`, `globe`, `key`, `lock`, `user`, `warn`;
- `tech`: `db`, `disk`, `docker`, `host`, `job`, `network`, `nodes`,
  `server`, `terminal`.

A project adds a pack in `library/icons/<pack>/` and lists it, and a page can
add one icon inline: `Episode.ICON_PATHS.chat = "<path d=\"…\"/>"`. Unknown
names show `check`.
