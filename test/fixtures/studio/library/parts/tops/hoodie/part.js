// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Fixture part tops/hoodie: shadows the package part of the same id.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("tops/hoodie", {
    build(ctx) {
      ctx.el("rect", { x: 0, y: 500, width: 600, height: 300, fill: ctx.color("top.base") }, ctx.slot("top"));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
