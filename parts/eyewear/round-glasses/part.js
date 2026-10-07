// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Round glasses: thin rims centred on the eyes, a keyhole bridge, end pieces
// and short temples towards the face edge (side hair covers them), a faint
// lens tint and a glint. The eyewear slot moves with the features, so the
// rims stay on the eyes through blinks, gaze and head motion; the glint
// keeps its angle on screen and slides against the head's turn, as a
// reflection of a fixed light would.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  // Rim centres: the eye centres, one unit lower so the rim tops clear the brows.
  const CY = 327;
  const R = 56; // rim radius, at the middle of its stroke
  const LENSES = [
    { side: "L", cx: 226, flip: 1 },
    { side: "R", cx: 374, flip: -1 },
  ];

  A.parts.register("eyewear/round-glasses", {
    build(ctx) {
      const { el } = ctx;
      const c = (role) => ctx.color(role);
      const slot = ctx.slot("eyewear");
      const glints = [];
      // Temples fade out as they turn back past the face edge (in the rims'
      // mirrored frame, so one gradient serves both sides).
      const temple = el("linearGradient", { id: ctx.id("temple"), gradientUnits: "userSpaceOnUse", x1: -56, y1: 0, x2: -73, y2: 0 }, ctx.defs);
      el("stop", { offset: "0", "stop-color": c("eyewear.frame") }, temple);
      el("stop", { offset: "0.6", "stop-color": c("eyewear.frame"), "stop-opacity": "0.8" }, temple);
      el("stop", { offset: "1", "stop-color": c("eyewear.frame"), "stop-opacity": "0" }, temple);
      for (const lens of LENSES) {
        const clip = el("clipPath", { id: ctx.id(`lens-${lens.side}`) }, ctx.defs);
        el("circle", { cx: lens.cx, cy: CY, r: R - 2 }, clip);
        el("circle", { cx: lens.cx, cy: CY, r: R - 1, fill: c("eyewear.lens"), opacity: 0.12 }, slot);
        // The glint is drawn in screen orientation (light from the upper
        // right for both lenses), not mirrored like the rims.
        const glint = el("g", {}, el("g", { "clip-path": ctx.url(`lens-${lens.side}`) }, slot));
        const gx = lens.cx;
        el("path", { d: `M${gx + 2},${CY - 22} L${gx + 34},${CY - 64} L${gx + 48},${CY - 64} L${gx + 16},${CY - 22} Z`, fill: c("eyewear.glint"), opacity: 0.4 }, glint);
        el("path", { d: `M${gx + 22},${CY - 18} L${gx + 58},${CY - 64} L${gx + 63},${CY - 64} L${gx + 27},${CY - 18} Z`, fill: c("eyewear.glint"), opacity: 0.32 }, glint);
        glints.push({ node: glint, cx: lens.cx });

        // Rim, end piece and temple, mirrored for the right lens (outer side on -x).
        const g = el("g", { transform: `translate(${lens.cx},${CY}) scale(${lens.flip},1)` }, slot);
        el("path", { d: "M-57,-10 L-73,-14", fill: "none", stroke: ctx.url("temple"), "stroke-width": 4.5 }, g);
        el("circle", { cx: 0, cy: 0, r: R, fill: "none", stroke: c("eyewear.frame"), "stroke-width": 5 }, g);
        el("rect", { x: -62, y: -15, width: 9, height: 10, rx: 2.5, fill: c("eyewear.frame") }, g);
        // Lens edge catching the light, along the lower inner rim.
        el("path", { d: "M16,49 A51,51 0 0 0 49,14", fill: "none", stroke: c("eyewear.glint"), "stroke-width": 2, "stroke-linecap": "round", opacity: 0.35 }, g);
      }
      // Sheen on the rims: upper left and lower right on screen, both lenses.
      for (const lens of LENSES) {
        const x = lens.cx;
        el("path", { d: `M${x - 49},${CY - 27} A${R},${R} 0 0 1 ${x - 20},${CY - 52}`, fill: "none", stroke: c("eyewear.frame-light"), "stroke-width": 1.6, "stroke-linecap": "round", opacity: 0.85 }, slot);
        el("path", { d: `M${x + 50},${CY + 25} A${R},${R} 0 0 1 ${x + 27},${CY + 49}`, fill: "none", stroke: c("eyewear.frame-light"), "stroke-width": 1.4, "stroke-linecap": "round", opacity: 0.6 }, slot);
      }
      // Keyhole bridge between the inner rims.
      el("path", { d: `M281,${CY - 9} C290,${CY - 21} 310,${CY - 21} 319,${CY - 9}`, fill: "none", stroke: c("eyewear.frame"), "stroke-width": 4.5, "stroke-linecap": "round" }, slot);
      el("path", { d: `M290,${CY - 17} C296,${CY - 20} 304,${CY - 20} 310,${CY - 17}`, fill: "none", stroke: c("eyewear.frame-light"), "stroke-width": 1.2, "stroke-linecap": "round", opacity: 0.8 }, slot);
      return glints;
    },

    update(ctx, pose, glints) {
      const { f1 } = ctx.math;
      const hd = pose.head;
      for (const g of glints) {
        g.node.setAttribute("transform", `rotate(${(-hd.rot).toFixed(2)},${g.cx},${CY}) translate(${f1(-hd.yaw * 9)},0)`);
      }
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
