// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Fixture part kit/antenna: one strand, only kit wears it.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("kit/antenna", {
    build(ctx) {
      ctx.el("path", { d: "M100 30 Q110 10 120 14", fill: "none", stroke: ctx.color("hair.base"), "stroke-width": 3 }, ctx.slot("hair"));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
