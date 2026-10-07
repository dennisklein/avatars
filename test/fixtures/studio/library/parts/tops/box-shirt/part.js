// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Fixture part tops/box-shirt: a shirt in the theme's surface colour.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("tops/box-shirt", {
    build(ctx) {
      ctx.el("rect", { x: 40, y: 150, width: 120, height: 50, fill: ctx.color("top.base") }, ctx.slot("top"));
      if (ctx.options.pocket) ctx.el("rect", { x: 120, y: 160, width: 20, height: 14, fill: "none", stroke: ctx.color("top.base") }, ctx.slot("top"));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
