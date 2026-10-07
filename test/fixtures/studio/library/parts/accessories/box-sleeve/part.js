// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Fixture part accessories/box-sleeve: draws into the slot sleeve, which box-200x200 lacks.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("accessories/box-sleeve", {
    build(ctx) {
      ctx.el("rect", { x: 0, y: 0, width: 10, height: 10, fill: "none" }, ctx.slot("sleeve"));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
