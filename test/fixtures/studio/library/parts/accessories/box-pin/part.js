// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Fixture part accessories/box-pin: a pin whose colour nothing sets by default.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("accessories/box-pin", {
    build(ctx) {
      ctx.el("circle", { cx: 70, cy: 165, r: 6, fill: ctx.color("pin.base") }, ctx.slot("accessory"));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
