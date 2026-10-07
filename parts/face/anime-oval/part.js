// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Oval anime face with a pointed chin and soft blush. Defines the base clip
// "face", which keeps the features and the bang shadow inside the outline.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  const FACE = "M146,250 C146,350 196,430 300,474 C404,430 454,350 454,250 C454,140 384,92 300,92 C216,92 146,140 146,250 Z";

  A.parts.register("face/anime-oval", {
    build(ctx) {
      const { el } = ctx;
      el("path", { d: FACE }, ctx.clip("face"));

      const blushGrad = el("radialGradient", { id: ctx.id("blush") }, ctx.defs);
      el("stop", { offset: "0", "stop-color": ctx.color("skin.blush"), "stop-opacity": "0.55" }, blushGrad);
      el("stop", { offset: "1", "stop-color": ctx.color("skin.blush"), "stop-opacity": "0" }, blushGrad);

      const face = ctx.slot("face");
      el("path", { d: FACE, fill: ctx.color("skin.base") }, face);
      el("path", { d: "M154,318 C168,380 214,434 300,474 C386,434 432,380 446,318", fill: "none", stroke: ctx.color("skin.line"), "stroke-width": 2.5, "stroke-linecap": "round", opacity: 0.55 }, face);

      const blush = ctx.slot("blush");
      return {
        blushL: el("ellipse", { cx: 214, cy: 392, rx: 40, ry: 18, fill: ctx.url("blush") }, blush),
        blushR: el("ellipse", { cx: 386, cy: 392, rx: 40, ry: 18, fill: ctx.url("blush") }, blush),
      };
    },

    update(ctx, pose, r) {
      const bl = ctx.math.clamp(pose.expr.blush, 0, 1);
      r.blushL.setAttribute("opacity", bl.toFixed(2));
      r.blushR.setAttribute("opacity", bl.toFixed(2));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
