// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Fixture part body/box: a rounded square torso and a round head.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("body/box", {
    build(ctx) {
      ctx.el("rect", { x: 40, y: 120, width: 120, height: 80, rx: 20, fill: ctx.color("skin.base") }, ctx.slot("body"));
      ctx.el("circle", { cx: 100, cy: 70, r: 40, fill: ctx.color("skin.base") }, ctx.slot("body"));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
