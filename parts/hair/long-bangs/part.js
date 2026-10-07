// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Long anime hair with pointed bangs: the back hair, the crown with bangs,
// strand lines and an angel-ring highlight, the shadow the bangs cast on the
// forehead, and two side locks that sway behind the head's motion.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  // Build an anime bangs edge: alternating notches and pointed strand tips.
  function strandEdge(points, f1) {
    // points: [[x,y,kind], ...] where kind 't' = tip, 'n' = notch
    let d = `M${points[0][0]},${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1];
      const [x1, y1, kind] = points[i];
      // Strands sweep slightly outward from the face center (x=300).
      const bend = (x1 + x0) / 2 < 300 ? -1 : 1;
      if (kind === "t") {
        d += ` Q${f1(x0 + (x1 - x0) * 0.25 + bend * 4)},${f1(y0 + (y1 - y0) * 0.75)} ${x1},${y1}`;
      } else {
        d += ` Q${f1(x0 + (x1 - x0) * 0.7 + bend * 3)},${f1(y0 + (y1 - y0) * 0.3)} ${x1},${y1}`;
      }
    }
    return d;
  }

  const BANGS_EDGE = [
    [146, 236, "n"],
    [172, 292, "t"],
    [188, 240, "n"],
    [214, 284, "t"],
    [238, 236, "n"],
    [268, 300, "t"],
    [292, 246, "n"],
    [320, 294, "t"],
    [338, 238, "n"],
    [366, 282, "t"],
    [392, 240, "n"],
    [424, 290, "t"],
    [438, 236, "n"],
    [456, 262, "t"],
    [458, 230, "n"],
  ];

  A.parts.register("hair/long-bangs", {
    build(ctx) {
      const { el } = ctx;
      const c = (role) => ctx.color(role);
      const edge = strandEdge(BANGS_EDGE, ctx.math.f1);

      const hairGrad = el("linearGradient", { id: ctx.id("front"), x1: 0, y1: 0, x2: 0, y2: 1 }, ctx.defs);
      el("stop", { offset: "0", "stop-color": c("hair.base") }, hairGrad);
      el("stop", { offset: "0.55", "stop-color": c("hair.light") }, hairGrad);
      el("stop", { offset: "1", "stop-color": c("hair.tip") }, hairGrad);
      const hairBackGrad = el("linearGradient", { id: ctx.id("back"), x1: 0, y1: 0, x2: 0, y2: 1 }, ctx.defs);
      el("stop", { offset: "0", "stop-color": c("hair.dark") }, hairBackGrad);
      el("stop", { offset: "0.7", "stop-color": c("hair.base") }, hairBackGrad);
      el("stop", { offset: "1", "stop-color": c("hair.deep") }, hairBackGrad);

      // Hair behind everything (moves with the head).
      el("path", {
        d:
          "M300,74 C176,74 108,156 108,292 C108,400 96,520 74,646 Q96,626 112,606 Q118,640 136,662 Q150,628 168,614 " +
          "Q184,650 206,664 Q214,626 232,606 L368,606 Q386,626 394,664 Q416,650 432,614 Q450,628 464,662 " +
          "Q482,640 488,606 Q504,626 526,646 C504,520 492,400 492,292 C492,156 424,74 300,74 Z",
        fill: ctx.url("back"),
      }, ctx.slot("hair-back"));

      // Shadow cast by the bangs onto the forehead.
      el("path", { d: edge + " L458,120 L146,120 Z", fill: c("skin.shade"), transform: "translate(0,12)" }, ctx.slot("face-shadow"));

      // Front hair: crown with bangs.
      const front = ctx.slot("hair-front");
      el("path", { d: edge + " C470,130 404,70 300,70 C196,70 130,130 146,236 Z", fill: ctx.url("front") }, front);
      // Strand separation lines in the bangs.
      for (const [x0, y0, x1, y1] of [[214, 150, 212, 280], [262, 128, 268, 296], [318, 128, 318, 290], [370, 146, 364, 280], [168, 186, 172, 286], [420, 186, 418, 284]]) {
        el("path", { d: `M${x0},${y0} Q${(x0 + x1) / 2 + 6},${(y0 + y1) / 2} ${x1},${y1}`, fill: "none", stroke: c("hair.dark"), "stroke-width": 2.2, opacity: 0.35 }, front);
      }
      // Angel-ring highlight.
      el("path", { d: "M184,150 C220,118 260,108 300,108 C340,108 380,118 416,150", fill: "none", stroke: c("hair.shine"), "stroke-width": 9, "stroke-linecap": "round", "stroke-dasharray": "44 14 30 12 52 16 26", opacity: 0.55 }, front);

      // Side locks (sway with a lag).
      const side = ctx.slot("hair-side");
      const lockL = el("g", {}, side);
      el("path", { d: "M150,206 C130,286 140,390 156,470 C164,512 158,548 140,584 C168,560 180,520 178,486 Q186,520 182,548 C200,510 198,470 188,430 C178,370 176,300 196,232 Z", fill: ctx.url("front") }, lockL);
      el("path", { d: "M164,250 C152,330 158,410 172,480", fill: "none", stroke: c("hair.dark"), "stroke-width": 2, opacity: 0.35 }, lockL);
      const lockR = el("g", {}, side);
      el("path", { d: "M450,206 C470,286 460,390 444,470 C436,512 442,548 460,584 C432,560 420,520 422,486 Q414,520 418,548 C400,510 402,470 412,430 C422,370 424,300 404,232 Z", fill: ctx.url("front") }, lockR);
      el("path", { d: "M436,250 C448,330 442,410 428,480", fill: "none", stroke: c("hair.dark"), "stroke-width": 2, opacity: 0.35 }, lockR);
      return { lockL, lockR };
    },

    update(ctx, pose, r) {
      // Secondary motion: the locks lag behind the head.
      const lag = pose.head.rot - pose.headLag.rot;
      const lagY = pose.head.y - pose.headLag.y;
      r.lockL.setAttribute("transform", `rotate(${(-lag * 1.6 + lagY * 0.4).toFixed(2)},176,220)`);
      r.lockR.setAttribute("transform", `rotate(${(-lag * 1.6 - lagY * 0.4).toFixed(2)},424,220)`);
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
