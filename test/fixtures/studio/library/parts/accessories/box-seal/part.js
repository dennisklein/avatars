// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Fixture part accessories/box-seal: a part that draws the mark seal, which no brand has.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("accessories/box-seal", {
    build(ctx) {
      const m = ctx.mark("seal");
      if (!m) return;
      const g = ctx.el("svg", { x: 50, y: 176, width: 16, height: 16, viewBox: m.viewBox.join(" ") }, ctx.slot("accessory"));
      g.innerHTML = m.body;
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
