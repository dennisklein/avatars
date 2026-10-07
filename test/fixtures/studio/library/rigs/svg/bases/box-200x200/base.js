// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Fixture base box-200x200: a body that breathes and a head layer (hair and
// headwear) that follows the pose's head. Small enough to read in a test.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.bases.register("box-200x200", {
    layers(ctx) {
      const { svg, el } = ctx;
      const b = { body: el("g", {}, svg), head: null };
      const s = { body: el("g", {}, b.body), top: el("g", {}, b.body), accessory: el("g", {}, b.body) };
      b.head = el("g", {}, svg);
      s.hair = el("g", {}, b.head);
      s.headwear = el("g", {}, b.head);
      ctx.bones = b;
      return s;
    },
    apply(ctx, pose) {
      const { f1 } = ctx.math;
      ctx.bones.body.setAttribute("transform", `translate(0,${f1(-pose.breath)})`);
      ctx.bones.head.setAttribute("transform", `translate(${f1(pose.head.x / 4)},${f1(pose.head.y / 4)}) rotate(${pose.head.rot.toFixed(2)},100,120)`);
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
