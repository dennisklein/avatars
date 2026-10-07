// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Large anime eyes: gradient iris with two highlights, a winged upper lash,
// a lower lid that rises when squinting, and closed and happy (^) lids for
// blinks, winks and joy.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  // Eye geometry in local coordinates (eye center at 0,0; outer corner on -x).
  const EYE_WHITE =
    "M-46,2 C-42,-28 -12,-44 16,-42 C34,-40 44,-26 45,-12 C46,10 36,40 6,44 C-24,46 -44,28 -46,2 Z";
  const UPPER_LASH = "M-54,8 C-48,-24 -14,-46 16,-44 C34,-42 46,-28 47,-12";
  const LASH_WING = "M-46,-6 C-52,-10 -58,-8 -62,-2 C-56,-4 -52,-2 -50,4 Z";
  const LOWER_LASH = "M-30,40 C-14,47 8,47 24,40";
  const CLOSED_LID = "M-52,10 C-34,30 -2,36 22,30 C34,26 42,18 46,8";
  const HAPPY_LID = "M-46,22 C-30,-8 18,-10 40,18";

  A.parts.register("eyes/anime-large", {
    build(ctx) {
      const { el } = ctx;
      const c = (role) => ctx.color(role);
      const irisGrad = el("linearGradient", { id: ctx.id("iris"), x1: 0, y1: 0, x2: 0, y2: 1 }, ctx.defs);
      el("stop", { offset: "0", "stop-color": c("eyes.iris-top") }, irisGrad);
      el("stop", { offset: "0.55", "stop-color": c("eyes.iris-mid") }, irisGrad);
      el("stop", { offset: "1", "stop-color": c("eyes.iris-low") }, irisGrad);
      const eyeClip = el("clipPath", { id: ctx.id("clip") }, ctx.defs);
      el("path", { d: EYE_WHITE }, eyeClip);

      const slot = ctx.slot("eyes");
      const eyes = [];
      for (const side of ["L", "R"]) {
        const cx = side === "L" ? 226 : 374;
        const flip = side === "L" ? 1 : -1;
        const pos = el("g", { transform: `translate(${cx},326) scale(${flip},1)` }, slot);
        const open = el("g", {}, pos);
        el("path", { d: EYE_WHITE, fill: c("eyes.white") }, open);
        const irisWrap = el("g", { "clip-path": ctx.url("clip") }, open);
        const iris = el("g", {}, irisWrap);
        el("ellipse", { cx: 0, cy: 6, rx: 31, ry: 39, fill: ctx.url("iris") }, iris);
        el("ellipse", { cx: 0, cy: 6, rx: 31, ry: 39, fill: "none", stroke: c("eyes.pupil"), "stroke-width": 3 }, iris);
        const pupil = el("ellipse", { cx: 0, cy: 8, rx: 13, ry: 18, fill: c("eyes.pupil") }, iris);
        el("path", { d: "M-24,24 C-12,40 12,40 24,24", fill: "none", stroke: c("eyes.glint"), "stroke-width": 4, opacity: 0.7 }, iris);
        el("ellipse", { cx: -11, cy: -12, rx: 9, ry: 11, fill: c("eyes.highlight") }, iris);
        el("circle", { cx: 12, cy: 22, r: 4.5, fill: c("eyes.highlight"), opacity: 0.9 }, iris);
        // Shadow of the upper lid on the eyeball.
        el("path", { d: "M-46,2 C-42,-28 -12,-44 16,-42 C34,-40 44,-26 45,-12 L45,-30 L-46,-30 Z", fill: c("eyes.lid-shadow"), opacity: 0.18 }, irisWrap);
        // Lower lid (skin) that rises when squinting.
        const lowerLid = el("path", { d: "M-52,64 L-52,40 C-30,34 20,34 52,31 L52,64 Z", fill: c("skin.base") }, open);
        el("path", { d: UPPER_LASH, fill: "none", stroke: c("eyes.lash"), "stroke-width": 7, "stroke-linecap": "round" }, open);
        el("path", { d: LASH_WING, fill: c("eyes.lash") }, open);
        const lowerLash = el("path", { d: LOWER_LASH, fill: "none", stroke: c("eyes.lash"), "stroke-width": 2.5, "stroke-linecap": "round", opacity: 0.55 }, open);
        const closed = el("path", { d: CLOSED_LID, fill: "none", stroke: c("eyes.lash"), "stroke-width": 6, "stroke-linecap": "round", opacity: 0 }, pos);
        const happy = el("path", { d: HAPPY_LID, fill: "none", stroke: c("eyes.lash"), "stroke-width": 7, "stroke-linecap": "round", opacity: 0 }, pos);
        eyes.push({ side, flip, open, iris, pupil, lowerLid, lowerLash, closed, happy });
      }
      return eyes;
    },

    update(ctx, pose, eyes) {
      const { clamp, smooth, f1 } = ctx.math;
      const e = pose.expr;
      const gz = pose.gaze;
      const hd = pose.head;
      const blink = pose.blink;
      for (const eye of eyes) {
        const wink = eye.side === "L" ? e.winkL || 0 : e.winkR || 0;
        // No alpha blending on the eyes (it reads as ghosting): the open eye
        // squashes shut, then swaps to a closed or happy (^) line.
        const happy = Math.max(e.happyEyes, wink);
        const openK = clamp(e.eye * (1 - blink) * (1 - smooth(happy * 2)), 0, 1.2);
        const isOpen = openK >= 0.18;
        const isHappy = !isOpen && happy >= 0.5;
        eye.open.setAttribute("opacity", isOpen ? "1" : "0");
        eye.open.setAttribute("transform", `translate(0,28) scale(1,${Math.max(openK, 0.05).toFixed(3)}) translate(0,-28)`);
        eye.closed.setAttribute("opacity", !isOpen && !isHappy ? "1" : "0");
        eye.happy.setAttribute("opacity", isHappy ? "1" : "0");
        // Gaze: iris offset in the eye's local frame (mirrored for the right eye).
        const ix = (gz.x * 13 + hd.yaw * 3) * eye.flip;
        const iy = gz.y * 8;
        const ps = e.pupil;
        eye.iris.setAttribute("transform", `translate(${f1(ix)},${f1(iy)})`);
        eye.pupil.setAttribute("rx", f1(13 * ps));
        eye.pupil.setAttribute("ry", f1(18 * ps));
        const sq = e.squint * 26;
        eye.lowerLid.setAttribute("transform", `translate(0,${f1(16 - sq)})`);
        eye.lowerLash.setAttribute("transform", `translate(0,${f1(-sq * 0.85)})`);
      }
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
