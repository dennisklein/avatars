// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Fixture part hair/box-fringe: a fringe over the forehead.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("hair/box-fringe", {
    build(ctx) {
      ctx.el("path", { d: "M60 60 Q100 20 140 60 Z", fill: ctx.color("hair.base") }, ctx.slot("hair"));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
