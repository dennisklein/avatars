// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Sindy's ahoge: the antenna strand on top of her head. It lags behind the
// head's roll and nod and bobs gently on its own.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("sindy/ahoge", {
    build(ctx) {
      return ctx.el("path", { d: "M302,76 C292,36 318,10 352,20 C328,24 314,42 314,78 Z", fill: ctx.color("hair.base") }, ctx.slot("hair-top"));
    },

    update(ctx, pose, ahoge) {
      const lag = pose.head.rot - pose.headLag.rot;
      const lagY = pose.head.y - pose.headLag.y;
      ahoge.setAttribute("transform", `rotate(${(-lag * 4 + Math.sin(pose.t * 2.1) * 2 - lagY * 2).toFixed(2)},308,78)`);
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
