# diagram

Boxes and arrows on the slide frame: how parts relate, built up on cue
words. Nodes sit on a grid over the area below the title, groups draw a
labelled box around nodes, and edges connect nodes or groups and draw
themselves along their path.

```js
.diagram({
  chapter: "How it fits together",
  title: "One network, three services",
  say: "mesh",
  grid: [3, 2],
  nodes: [
    { id: "host", title: "Your machine", icon: "host", pos: [0, 0.5], at: "mesh:machine" },
    { id: "dns", title: "DNS", text: "names", icon: "globe", pos: [1, 0], at: "mesh:DNS" },
    { id: "db", title: "Database", icon: "db", pos: [2, 1], accent: true, at: "mesh:database" },
  ],
  groups: [{ id: "net", label: "network", around: ["dns", "db"], at: "mesh:network" }],
  edges: [{ from: "host", to: "net", label: "joins", at: "mesh:joins" }],
  pulse: [{ node: "db", at: "mesh:stores" }],
})
```

| | |
| --- | --- |
| Presenter | `cornerR` (or `shot: "mini"` / `"hidden"` for the wide area, `"cornerL"` for a bubble on the left) |
| Default transition in | `push` |

## Options

Everything the slide frame takes (`chapter`, `label`, `title`, `say`,
`mood`, `lead`, `transition`, `transitionDur`, `shot`), and:

| Option | Meaning |
| --- | --- |
| `nodes` | `[{ id, title, text, icon, pos: [col, row], width, accent, ghost, code, at }]`: fractional positions are fine; `text` adds a second line (in the monospace font with `code: true`); `icon: false` leaves the icon out; `ghost` draws a dashed outline |
| `grid` | `[cols, rows]`; default: enough columns and rows for the positions |
| `nodeWidth` | default node width (260 px, which fits a title of about 11 characters) |
| `groups` | `[{ id, label, around: [node ids], accent, pad, at }]`; edges may connect to a group by its `id` |
| `edges` | `[{ from, to, label, dashed, arrow: "end" \| "both" \| "start" \| "none", bend, accent, at }]`; `bend` bows the edge sideways by that many pixels |
| `pulse` | `[{ node, at }]` or `[{ el, at }]`: a node (or an element of `svg`) swells and rings once |
| `svg` | raw SVG fitted into the area, for anything the boxes cannot draw |
| `reveal` | `[{ el: "#selector", at, draw }]`: elements of `svg` fade in, or draw their strokes with `draw: true` |

Items appear in this order unless they have cues: groups, nodes, edges, raw
elements; the presenter glances towards each one with a cue. Overlapping
nodes or groups and boxes outside the area show up as console warnings
(and in `avatars check`); node text that is cut off is a check warning too.

## Geometry

From the format (`format.json` `scenes.diagram`): `areas` per shot
(`cornerR`, `cornerL`, `wide` for every other shot), `node` metrics
(`width`, `height`, `tall` for two lines, group `pad` and `label` height),
`groupLabel` offset, `edgeGap` (space between an edge's ends and the boxes)
and `slack` (how far a box may reach outside the area before a warning).

## Tokens

`diagram.node-*`, `diagram.ghost-bg`, `diagram.ghost-shadow`,
`diagram.icon-radius`, `diagram.title-*`, `diagram.text-*`,
`diagram.code-size`, `diagram.group-*`, `diagram.edge`,
`diagram.edge-accent` (also the arrowheads), `diagram.label-*`,
`diagram.pulse` (the ring), `diagram.reveal-mask`; shared: `icon.*`,
`slide-title.*`, `chapter.*`.
