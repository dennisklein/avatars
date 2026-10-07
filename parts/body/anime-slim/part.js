// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Slim anime body: the neck with the shadow under the chin, and the open hand
// at the end of the waving arm.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("body/anime-slim", {
    build(ctx) {
      const { el } = ctx;
      const neck = ctx.slot("neck");
      el("path", { d: "M266,430 L266,548 C284,562 316,562 334,548 L334,430 Z", fill: ctx.color("skin.base") }, neck);
      el("path", { d: "M266,440 C286,476 314,476 334,440 L334,486 C314,506 286,506 266,486 Z", fill: ctx.color("skin.shade") }, neck);

      // The hand, palm towards the viewer, wrist at the hand bone's origin.
      const hand = ctx.slot("hand");
      const skin = { fill: ctx.color("skin.base"), stroke: ctx.color("skin.line"), "stroke-width": 2.5, "stroke-linejoin": "round" };
      el("path", Object.assign({ d: "M-22,6 C-30,-20 -48,-34 -52,-46 C-54,-54 -44,-58 -38,-50 C-30,-40 -24,-34 -18,-30 Z" }, skin), hand);
      for (const [x, len, rot] of [[-17, 40, -8], [-5, 47, -2], [8, 45, 3], [20, 36, 9]]) {
        el("rect", Object.assign({ x: x - 6.5, y: -46 - len, width: 13, height: len + 10, rx: 6.5, transform: `rotate(${rot},${x},-46)` }, skin), hand);
      }
      el("path", Object.assign({ d: "M-26,4 C-28,-20 -28,-40 -24,-52 L28,-52 C30,-36 30,-16 26,4 Z" }, skin), hand);
      el("path", { d: "M-8,-30 C0,-26 8,-26 14,-30", fill: "none", stroke: ctx.color("skin.line"), "stroke-width": 2, opacity: 0.6 }, hand);
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
