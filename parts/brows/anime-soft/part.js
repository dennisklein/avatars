// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Soft anime brows: thin tapered strokes that rise, frown and tilt with the
// mood. They sit above the bangs (anime convention).
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("brows/anime-soft", {
    build(ctx) {
      const color = ctx.color("brows.color");
      const slot = ctx.slot("brows");
      const brows = [];
      for (const side of ["L", "R"]) {
        const cx = side === "L" ? 226 : 374;
        const flip = side === "L" ? 1 : -1;
        const node = ctx.el("path", { d: "M-34,6 C-18,-6 12,-8 32,0 C12,-3 -16,0 -34,6 Z", fill: color, stroke: color, "stroke-width": 3.5, "stroke-linejoin": "round", opacity: 0.85 }, slot);
        brows.push({ side, cx, flip, node });
      }
      return brows;
    },

    update(ctx, pose, brows) {
      const { f1 } = ctx.math;
      const e = pose.expr;
      for (const b of brows) {
        const y = 262 - e.brow * 12 + (1 - Math.min(1, e.eye)) * 4;
        const tilt = e.browTilt * 10 + (e.brow < 0 ? e.brow * 6 : 0);
        b.node.setAttribute("transform", `translate(${b.cx},${f1(y)}) scale(${b.flip},1) rotate(${(-tilt).toFixed(2)},24,0)`);
      }
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
