// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Base anime-600x800: a slim anime upper body on a 600x800 canvas, the face
// centred at (300, 283), the neck pivot at (300, 500). It nests the slots in
// bones (head-back, body, head, arm, hand), fakes a head turn by shifting
// near layers more than far ones (parallax), and has a waving arm.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.bases.register("anime-600x800", {
    layers(ctx) {
      const { svg, el } = ctx;
      const faceClip = `url(#${ctx.clip("face").id})`;
      const b = {}; // bones and parallax groups, for apply
      const s = {}; // slot groups

      // Hair behind everything (moves with the head).
      b.headBack = el("g", {}, svg);
      s["hair-back"] = el("g", {}, b.headBack);

      // Body: breathes independently of the head.
      b.body = el("g", {}, svg);
      s.neck = el("g", {}, b.body);
      s.top = el("g", {}, b.body);
      s.chest = el("g", {}, b.body);

      // Head (front layers).
      b.head = el("g", {}, svg);
      s.face = el("g", {}, b.head);
      // Shadow cast by the bangs onto the forehead: the clip stays with the
      // face, the shadow inside shifts with the hair.
      const shade = el("g", { "clip-path": faceClip }, b.head);
      b.faceShadow = el("g", {}, shade);
      s["face-shadow"] = b.faceShadow;
      b.features = el("g", {}, el("g", { "clip-path": faceClip }, b.head));
      for (const name of ["blush", "nose", "eyes", "mouth"]) s[name] = el("g", {}, b.features);
      b.eyewear = el("g", {}, b.head);
      s.eyewear = b.eyewear;
      b.hairFront = el("g", {}, b.head);
      s["hair-front"] = b.hairFront;
      // Side locks, top strands and hair accessories animate their own sway.
      s["hair-side"] = el("g", {}, b.head);
      s["hair-top"] = el("g", {}, b.head);
      b.headwear = el("g", {}, b.head);
      s.headwear = b.headwear;
      s["hair-accessory"] = el("g", {}, b.head);
      // Brows live in their own layer above the bangs (anime convention).
      b.brows = el("g", {}, b.head);
      s.brows = b.brows;

      // Waving arm (the presenter's left hand, the viewer's right). Pivot at the
      // elbow below frame.
      b.arm = el("g", { opacity: 0 }, svg);
      b.armRot = el("g", {}, b.arm);
      s.sleeve = el("g", {}, b.armRot);
      b.hand = el("g", { transform: "translate(0,-310)" }, b.armRot);
      s.hand = b.hand;

      ctx.bones = b;
      return s;
    },

    apply(ctx, pose) {
      const { f1, smooth } = ctx.math;
      const b = ctx.bones;
      const hd = pose.head;
      const breath = pose.breath;

      // Body: breathing.
      b.body.setAttribute("transform", `translate(0,${f1(-breath * 2)}) translate(300,800) scale(1,${(1 + breath * 0.006).toFixed(4)}) translate(-300,-800)`);

      // Head: rotation about the neck, small translation, breathing follow.
      const headT = `translate(${f1(hd.x)},${f1(hd.y - breath * 3)}) rotate(${hd.rot.toFixed(2)},300,500)`;
      b.head.setAttribute("transform", headT);
      b.headBack.setAttribute("transform", `${headT} translate(${f1(-hd.yaw * 6)},0)`);
      // Fake yaw: features shift more than the face outline.
      const near = `translate(${f1(hd.yaw * 10)},0)`;
      const mid = `translate(${f1(hd.yaw * 6)},0)`;
      b.features.setAttribute("transform", near);
      b.eyewear.setAttribute("transform", near);
      b.brows.setAttribute("transform", near);
      b.hairFront.setAttribute("transform", mid);
      b.headwear.setAttribute("transform", mid);
      b.faceShadow.setAttribute("transform", mid);

      // Gestures: wave = raise (0.35s), wag, lower (0.35s).
      let armShown = false;
      for (const g of pose.gestures) {
        if (g.name !== "wave") continue;
        const dur = g.dur;
        const d = g.d;
        armShown = true;
        const up = smooth(d / 0.35) * smooth((dur - d) / 0.35);
        const wag = Math.sin(d * Math.PI * 2 * 2.2) * smooth(d / 0.3);
        b.arm.setAttribute("opacity", "1");
        b.arm.setAttribute("transform", `translate(${f1(hd.x * 0.5 + 476)},${f1(800 + (1 - up) * 440)})`);
        b.armRot.setAttribute("transform", `rotate(${(5 + wag * 8).toFixed(2)})`);
        b.hand.setAttribute("transform", `translate(0,-310) rotate(${(wag * 12).toFixed(2)})`);
      }
      // Between waves the arm returns to its rest state, so a frame's markup
      // never depends on the frames rendered before it.
      if (!armShown) {
        b.arm.setAttribute("opacity", "0");
        b.arm.removeAttribute("transform");
        b.armRot.removeAttribute("transform");
        b.hand.setAttribute("transform", "translate(0,-310)");
      }
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
