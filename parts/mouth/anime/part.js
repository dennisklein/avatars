// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Anime mouth: a curved line when closed, an open shape with teeth and tongue
// when speaking. Shaped every frame from the coarticulated viseme mix, the
// loudness and the mood's smile and resting opening.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.parts.register("mouth/anime", {
    build(ctx) {
      const { el } = ctx;
      const r = {};
      r.mouth = el("g", { transform: "translate(300,424)" }, ctx.slot("mouth"));
      r.mouthLine = el("path", { d: "", fill: "none", stroke: ctx.color("mouth.line"), "stroke-width": 3.5, "stroke-linecap": "round" }, r.mouth);
      r.mouthFill = el("path", { d: "", fill: ctx.color("mouth.inside") }, r.mouth);
      const mouthClipEl = el("clipPath", { id: ctx.id("clip") }, ctx.defs);
      r.mouthClip = el("path", { d: "" }, mouthClipEl);
      const inner = el("g", { "clip-path": ctx.url("clip") }, r.mouth);
      r.tongue = el("ellipse", { cx: 0, cy: 16, rx: 16, ry: 9, fill: ctx.color("mouth.tongue") }, inner);
      r.teeth = el("rect", { x: -30, y: -20, width: 60, height: 8, fill: ctx.color("mouth.teeth") }, inner);
      r.mouthOutline = el("path", { d: "", fill: "none", stroke: ctx.color("mouth.outline"), "stroke-width": 2.2, "stroke-linejoin": "round" }, r.mouth);
      return r;
    },

    update(ctx, pose, r) {
      const { clamp, lerp, f1 } = ctx.math;
      const e = pose.expr;
      const m = pose.mouth;
      const open = clamp(Math.max(m.open, e.mouthOpen * (1 - m.energy * 0.5)), 0, 1.1);
      const round = m.round * clamp(m.open * 3, 0, 1);
      const wide = lerp(0.45, m.wide, clamp(m.open * 2.5 + m.teeth * 0.3, 0, 1));
      const smile = e.smile * (1 - round * 0.7);
      const w = lerp(34, 58, wide) * (1 - round * 0.45) * (1 + smile * 0.12);
      const h = open * lerp(40, 46, round);
      const cornerY = -smile * 6;
      const L = -w / 2;
      const R = w / 2;
      if (h < 3) {
        const d = `M${f1(L)},${f1(cornerY)} Q0,${f1(smile * 7 + h)} ${f1(R)},${f1(cornerY)}`;
        r.mouthLine.setAttribute("d", d);
        r.mouthLine.setAttribute("opacity", "1");
        r.mouthFill.setAttribute("d", "");
        r.mouthOutline.setAttribute("d", "");
        r.mouthClip.setAttribute("d", "");
        r.teeth.setAttribute("opacity", "0");
        r.tongue.setAttribute("opacity", "0");
      } else {
        const top = -h * 0.28 - smile * 2;
        const bot = h * 0.72 + smile * 3;
        const rr = round * w * 0.18;
        const d =
          `M${f1(L)},${f1(cornerY)} ` +
          `C${f1(L + w * 0.12 - rr)},${f1(top)} ${f1(R - w * 0.12 + rr)},${f1(top)} ${f1(R)},${f1(cornerY)} ` +
          `C${f1(R - w * 0.02 + rr)},${f1(bot)} ${f1(L + w * 0.02 - rr)},${f1(bot)} ${f1(L)},${f1(cornerY)} Z`;
        r.mouthLine.setAttribute("opacity", "0");
        r.mouthFill.setAttribute("d", d);
        r.mouthOutline.setAttribute("d", d);
        r.mouthClip.setAttribute("d", d);
        r.teeth.setAttribute("opacity", clamp(m.teeth * 1.2, 0, 1).toFixed(2));
        const lipTop = 0.25 * cornerY + 0.75 * top;
        r.teeth.setAttribute("y", f1(lipTop - 2));
        r.teeth.setAttribute("height", f1(clamp(h * 0.3, 4, 10) + 2));
        r.tongue.setAttribute("opacity", clamp((h - 8) / 10, 0, 1).toFixed(2));
        r.tongue.setAttribute("cy", f1(bot - 4));
        r.tongue.setAttribute("rx", f1(w * 0.32));
      }
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
