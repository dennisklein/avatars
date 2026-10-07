// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Fixture part headwear/box-cap: a cap in five colours; it hides the hair.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("headwear/box-cap", {
    build(ctx) {
      const g = ctx.slot("headwear");
      const front = ctx.options.brim !== "back";
      ctx.el("path", { d: "M58 56 Q100 14 142 56 Z", fill: ctx.color("cap.a") }, g);
      ctx.el("rect", { x: 58, y: 50, width: 84, height: 8, fill: ctx.color("cap.b") }, g);
      ctx.el("rect", { x: front ? 40 : 120, y: 54, width: 40, height: 6, fill: ctx.color("cap.c") }, g);
      ctx.el("circle", { cx: 100, cy: 22, r: 4, fill: ctx.color("cap.d") }, g);
      if (ctx.options.logo) ctx.el("circle", { cx: 100, cy: 40, r: 6, fill: ctx.color("cap.e") }, g);
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
