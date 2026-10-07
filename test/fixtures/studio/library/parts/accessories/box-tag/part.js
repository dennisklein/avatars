// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Fixture part accessories/box-tag: a name tag that draws the brand badge.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("accessories/box-tag", {
    build(ctx) {
      const m = ctx.mark("badge") || ctx.mark("emblem");
      if (!m) return;
      const g = ctx.el("svg", { x: 120, y: 176, width: 16, height: 16, viewBox: m.viewBox.join(" ") }, ctx.slot("accessory"));
      g.innerHTML = m.body;
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
