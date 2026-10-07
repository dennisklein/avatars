// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// A hair clip in the shape of the brand's mark, tilted on one side of the
// head. Small sizes prefer the outlined "badge" variant and fall back to the
// emblem; with neither, the clip draws nothing.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  // On the viewer's left: the mark's top-left corner, tilt and side.
  const X = 170;
  const Y = 178;
  const TILT = -18;
  const SIZE = 49.28;

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

  A.parts.register("accessories/emblem-clip", {
    build(ctx) {
      const mark = ctx.mark("badge") || ctx.mark("emblem");
      if (!mark) return;
      const width = ctx.base.canvas[0];
      // On the right, the placement mirrors about the canvas centre while the
      // mark itself stays unmirrored (it is a logo).
      const transform =
        ctx.options.side === "right"
          ? `translate(${width - X},${Y}) rotate(${-TILT}) translate(${-SIZE},0) ${fit(mark, SIZE)}`
          : `translate(${X},${Y}) rotate(${TILT}) ${fit(mark, SIZE)}`;
      const g = ctx.el("g", { transform }, ctx.slot("hair-accessory"));
      g.innerHTML = mark.body;
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
