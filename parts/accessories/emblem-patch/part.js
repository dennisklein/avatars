// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// A patch on the chest showing the brand's emblem. Draws nothing when the
// brand has no emblem.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  // The patch: top-left corner and side of the square the mark fits into.
  const X = 392;
  const Y = 660;
  const SIZE = 73.92;

  // Scale and offset (in mark units) that fit a mark's viewBox, centred,
  // into a size x size square at the origin.
  function fit(mark, size) {
    const [x, y, w, h] = mark.viewBox;
    const side = Math.max(w, h);
    let t = `scale(${size / side})`;
    const dx = (side - w) / 2 - x;
    const dy = (side - h) / 2 - y;
    if (dx || dy) t += ` translate(${dx},${dy})`;
    return t;
  }

  A.parts.register("accessories/emblem-patch", {
    build(ctx) {
      const mark = ctx.mark("emblem");
      if (!mark) return;
      const g = ctx.el("g", { transform: `translate(${X},${Y}) ${fit(mark, SIZE)}` }, ctx.slot("chest"));
      g.innerHTML = mark.body;
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
