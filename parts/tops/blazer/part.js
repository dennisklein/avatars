// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Tailored blazer over a crew-neck top: the stand collar behind the neck,
// the torso on the hoodie's shoulders, the top showing in the V between
// notched lapels, shoulder and armhole seams, a button at the break point
// and one below, a breast welt pocket on the viewer's right (where an emblem
// patch sits just under it) with an optional pocket square, hip pocket
// flaps, and the sleeve with the top's cuff on the waving arm. Shots show
// the body down to about y 700, so everything that matters is above it.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  // The viewer's left half; the right half mirrors it about the canvas centre.
  // Roll line: the lapel's fold from the neck side down to the break point.
  const ROLL = "M262,536 C263,548 264,558 266,566 C276,598 288,628 300,652";
  // Lapel: roll line up to the gorge, out to the notch and the lapel point,
  // then the outer edge back down to the break point.
  const LAPEL = "M300,652 C288,628 276,598 266,566 L224,588 L203,603 C236,624 270,640 300,652 Z";
  // Collar: from behind the neck over the shoulder to the collar point and
  // the notch, back along the gorge seam and up the roll line.
  const COLLAR = "M267,508 C250,511 233,524 224,542 C218,555 212,567 208,578 L224,588 L266,566 C264,558 263,548 262,536 Z";
  // The collar's back, standing up behind the neck.
  const COLLAR_BACK = "M267,504 C252,506 236,516 226,532 L234,546 C244,532 256,522 267,518 Z";

  A.parts.register("tops/blazer", {
    build(ctx) {
      const { el } = ctx;
      const c = (role) => ctx.color(role);
      const W = ctx.base.canvas[0];
      const grad = el("linearGradient", { id: ctx.id("cloth"), x1: 0, y1: 0, x2: 0, y2: 1 }, ctx.defs);
      el("stop", { offset: "0", "stop-color": c("top.light") }, grad);
      el("stop", { offset: "0.45", "stop-color": c("top.base") }, grad);
      el("stop", { offset: "1", "stop-color": c("top.base") }, grad);

      const top = ctx.slot("top");
      // Both halves of a layer: the viewer's left as drawn, the right mirrored.
      const halves = () => [el("g", {}, top), el("g", { transform: `translate(${W},0) scale(-1,1)` }, top)];

      for (const g of halves()) el("path", { d: COLLAR_BACK, fill: c("top.dark") }, g);
      // Torso on the hoodie's neck and shoulders, a touch squarer at the
      // shoulder point; between the neck sides it stops at the crew neckline.
      el("path", {
        d: "M262,534 C222,536 148,546 104,594 C74,630 62,716 56,820 L544,820 C538,716 526,630 496,594 C452,546 378,536 338,534 C326,560 274,560 262,534 Z",
        fill: ctx.url("cloth"),
      }, top);

      // The crew-neck top in the V: rib band at the neck, the shadow the
      // lapels cast along the roll lines.
      el("path", { d: "M252,530 L262,534 C274,560 326,560 338,534 L348,530 L300,652 Z", fill: c("top.inner") }, top);
      el("path", { d: "M263,540 C276,568 324,568 337,540", fill: "none", stroke: c("top.inner-shade"), "stroke-width": 2.5, "stroke-linecap": "round" }, top);
      for (const g of halves()) {
        el("path", { d: "M266,540 C267,552 268,560 270,568 C279,596 288,620 297,640", fill: "none", stroke: c("top.inner-shade"), "stroke-width": 7, "stroke-linecap": "round", opacity: 0.7 }, g);
      }

      for (const g of halves()) {
        // Shoulder seam and armhole (set-in sleeve).
        el("path", { d: "M226,546 C190,556 150,568 114,590", fill: "none", stroke: c("top.seam"), "stroke-width": 3, "stroke-linecap": "round", opacity: 0.7 }, g);
        el("path", { d: "M114,590 C102,620 96,660 98,712", fill: "none", stroke: c("top.seam"), "stroke-width": 3, "stroke-linecap": "round", opacity: 0.55 }, g);
        // The shadow the lapel casts on the front panel.
        el("path", { d: "M203,606 C236,628 270,644 300,657", fill: "none", stroke: c("top.dark"), "stroke-width": 5, "stroke-linecap": "round", opacity: 0.45 }, g);
        el("path", { d: COLLAR, fill: c("top.light") }, g);
        el("path", { d: LAPEL, fill: c("top.light") }, g);
        // Gorge seam, outer edges and the pick stitch along the lapel edge.
        el("path", { d: "M266,566 L224,588", fill: "none", stroke: c("top.dark"), "stroke-width": 2, opacity: 0.8 }, g);
        el("path", { d: "M224,588 L203,603 C236,624 270,640 300,652 M224,588 L208,578 C212,567 218,555 224,542 C233,524 250,511 267,508", fill: "none", stroke: c("top.dark"), "stroke-width": 2.5, "stroke-linejoin": "round", opacity: 0.9 }, g);
        el("path", { d: "M212,603 C240,621 270,635 294,645", fill: "none", stroke: c("top.seam"), "stroke-width": 1.5, "stroke-dasharray": "3 4", opacity: 0.7 }, g);
        // The fold catches the light.
        el("path", { d: ROLL, fill: "none", stroke: c("top.seam"), "stroke-width": 2.5, "stroke-linecap": "round" }, g);
        // Hip pocket flap.
        el("path", { d: "M124,770 L212,764 L214,786 C184,790 154,792 126,792 Z", fill: c("top.base"), stroke: c("top.dark"), "stroke-width": 2.5, "stroke-linejoin": "round" }, g);
      }

      // The viewer's left front overlaps the right below the break point.
      el("path", { d: "M300,652 C305,690 309,740 312,820", fill: "none", stroke: c("top.dark"), "stroke-width": 3, "stroke-linecap": "round" }, top);
      for (const y of [668, 768]) {
        el("circle", { cx: 300, cy: y, r: 7.5, fill: c("top.button"), stroke: c("top.dark"), "stroke-width": 1.5 }, top);
        el("circle", { cx: 300, cy: y, r: 4.6, fill: "none", stroke: c("top.seam"), "stroke-width": 1, opacity: 0.6 }, top);
        el("path", { d: `M297.5,${y - 3.2} a5,5 0 0 1 5,0`, fill: "none", stroke: c("top.seam"), "stroke-width": 1.2, opacity: 0.7 }, top);
      }

      // Breast welt pocket on the viewer's right, square peeking out of it.
      // A two-point fold: the back point first, the front one over it.
      if (ctx.options.pocketSquare !== false) {
        const fold = { fill: c("top.trim"), stroke: c("top.dark"), "stroke-width": 1.5, "stroke-linejoin": "round" };
        el("path", Object.assign({ d: "M420,647 L438,626 L448,645 Z" }, fold), top);
        el("path", Object.assign({ d: "M402,649 L416,622 L432,646 Z" }, fold), top);
        el("path", { d: "M416,622 L421,647", fill: "none", stroke: c("top.dark"), "stroke-width": 1.2, opacity: 0.3 }, top);
      }
      el("path", { d: "M386,650 L472,641 L473,648 L387,657 Z", fill: c("top.dark"), stroke: c("top.dark"), "stroke-width": 1.5, "stroke-linejoin": "round" }, top);
      el("path", { d: "M388,650 L470,641.5", fill: "none", stroke: c("top.seam"), "stroke-width": 1.2, opacity: 0.6 }, top);

      // Sleeve of the waving arm (pivot at the elbow below frame): the top's
      // cuff shows past the blazer's hem.
      const sleeve = ctx.slot("sleeve");
      el("path", { d: "M-28,-292 L28,-292 L29,-316 L-29,-316 Z", fill: c("top.inner"), stroke: c("top.inner-shade"), "stroke-width": 1.5, "stroke-linejoin": "round" }, sleeve);
      el("path", { d: "M-27,-298 L27,-298", fill: "none", stroke: c("top.inner-shade"), "stroke-width": 2 }, sleeve);
      el("path", { d: "M-34,0 C-36,-120 -30,-220 -29,-292 L30,-292 C31,-220 40,-120 40,0 Z", fill: ctx.url("cloth") }, sleeve);
      el("path", { d: "M-30,-280 L30,-280", fill: "none", stroke: c("top.dark"), "stroke-width": 2, opacity: 0.6 }, sleeve);
      el("path", { d: "M14,-4 C14,-110 12,-210 12,-280", fill: "none", stroke: c("top.seam"), "stroke-width": 2, opacity: 0.5 }, sleeve);
      for (const y of [-252, -264]) el("circle", { cx: 20, cy: y, r: 3.2, fill: c("top.button") }, sleeve);
      el("path", { d: "M-29,-292 L30,-292", fill: "none", stroke: c("top.dark"), "stroke-width": 3, "stroke-linecap": "round" }, sleeve);
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
