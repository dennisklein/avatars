// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Anime nose: a single short line.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("nose/anime-line", {
    build(ctx) {
      ctx.el("path", { d: "M306,368 C304,376 300,382 296,384", fill: "none", stroke: ctx.color("skin.line"), "stroke-width": 3, "stroke-linecap": "round" }, ctx.slot("nose"));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
