// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Fixture part tops/box-vest: a second top, for the one-per-category rule.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("tops/box-vest", {
    build(ctx) {
      ctx.el("rect", { x: 50, y: 150, width: 100, height: 50, fill: ctx.color("top.base") }, ctx.slot("top"));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
