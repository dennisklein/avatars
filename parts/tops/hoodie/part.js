// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Hoodie with drawstrings: the hood lying behind the neck, the torso with a
// soft top light, the collar opening over an inner shirt, drawstrings with
// tips, shoulder seams, and the sleeve with its cuff on the waving arm.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("tops/hoodie", {
    build(ctx) {
      const { el } = ctx;
      const c = (role) => ctx.color(role);
      const grad = el("linearGradient", { id: ctx.id("cloth"), x1: 0, y1: 0, x2: 0, y2: 1 }, ctx.defs);
      el("stop", { offset: "0", "stop-color": c("top.light") }, grad);
      el("stop", { offset: "1", "stop-color": c("top.base") }, grad);

      const top = ctx.slot("top");
      // Hood lying behind the neck.
      el("path", { d: "M196,548 C210,500 250,500 300,510 C350,500 390,500 404,548 C380,540 340,532 300,540 C260,532 220,540 196,548 Z", fill: c("top.dark") }, top);
      el("path", {
        d: "M300,536 C214,536 140,552 98,606 C70,644 60,720 56,820 L544,820 C540,720 530,644 502,606 C460,552 386,536 300,536 Z",
        fill: ctx.url("cloth"),
      }, top);
      // Collar opening and inner shirt.
      el("path", { d: "M262,540 C276,566 324,566 338,540 Z", fill: c("top.inner") }, top);
      el("path", { d: "M248,536 C262,578 338,578 352,536", fill: "none", stroke: c("top.dark"), "stroke-width": 10, "stroke-linecap": "round" }, top);
      el("path", { d: "M248,536 C262,578 338,578 352,536", fill: "none", stroke: c("top.light"), "stroke-width": 2, "stroke-linecap": "round", opacity: 0.8 }, top);
      // Drawstrings.
      el("path", { d: "M270,572 C268,620 272,650 266,690", fill: "none", stroke: c("top.trim"), "stroke-width": 5, "stroke-linecap": "round" }, top);
      el("path", { d: "M330,572 C332,620 328,650 334,690", fill: "none", stroke: c("top.trim"), "stroke-width": 5, "stroke-linecap": "round" }, top);
      el("rect", { x: 261, y: 686, width: 10, height: 18, rx: 3, fill: c("top.trim-tip") }, top);
      el("rect", { x: 329, y: 686, width: 10, height: 18, rx: 3, fill: c("top.trim-tip") }, top);
      // Shoulder seam highlights.
      el("path", { d: "M120,600 C150,580 180,570 214,566", fill: "none", stroke: c("top.seam"), "stroke-width": 3, opacity: 0.6 }, top);
      el("path", { d: "M480,600 C450,580 420,570 386,566", fill: "none", stroke: c("top.seam"), "stroke-width": 3, opacity: 0.6 }, top);

      // Sleeve and cuff of the waving arm (pivot at the elbow below frame).
      const sleeve = ctx.slot("sleeve");
      el("path", { d: "M-34,0 C-36,-120 -30,-220 -28,-300 L28,-300 C30,-220 40,-120 40,0 Z", fill: ctx.url("cloth") }, sleeve);
      el("path", { d: "M-30,-288 L30,-288 L32,-312 L-32,-312 Z", fill: c("top.dark") }, sleeve);
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
