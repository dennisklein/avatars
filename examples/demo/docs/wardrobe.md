# Looks and themes

{{< video "wardrobe" >}}

A look dresses an avatar: it lists the wardrobe parts the avatar wears, such
as hair, a top, eyewear and accessories, and may set the colours of their
palette roles, for example to follow the theme's accent. The avatar's
identity, such as Sindy's face, eyes and hair colour, stays the same in every
look.

A theme gives every scene its colours and fonts through semantic tokens:
backgrounds and surfaces, text and accents, a sans and a monospace font.
Scenes are styled only through those tokens, so every scene works in every
theme.

The project's `avatars.json` names the default look and theme. An episode can
override both, along with the format and tokens, in its own `episode.json`;
this one wears the `blazer-glasses` look on the `daylight` theme:

```json
{
  "cast": { "host": { "look": "blazer-glasses" } },
  "theme": "daylight"
}
```

Every other episode keeps the hoodie and the midnight theme of
`avatars.json`. A project's own looks and themes go into its `library/`
directory (`library/avatars/<avatar>/looks/`, `library/themes/<id>/`), which
the CLI searches before the package. The gallery
(`avatars gallery --out DIR`) shows every look as an avatar sheet and the
demo episodes in every theme.
