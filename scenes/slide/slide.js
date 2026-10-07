// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Slide scene: a title and up to four bullets on the slide frame, each
// landing just before its cue word while the presenter glances at it.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.scenes.register("slide", function slide(ctx, o) {
    const { tl, h } = ctx;
    const T = ctx.tokens;
    const f = ctx.slideFrame("slide", o);
    const bullets = (o.bullets || []).map((b) => h("div", { class: "bullet" }, [ctx.icon(b.icon), h("div", { class: "txt" }, [h("div", { class: "t1", text: b.title }), b.text ? h("div", { class: "t2", text: b.text }) : null])]));
    f.el.append(h("div", { class: "bullets" }, bullets));
    for (const b of bullets) tl.set(b, { opacity: 0 }, 0);
    f.narrate();
    const dx = T.num("slide.enter-offset");
    const dur = T.num("slide.enter-duration");
    (o.bullets || []).forEach((b, i) => {
      const at = f.cue(b, i);
      tl.fromTo(bullets[i], { opacity: 0, x: -dx }, { opacity: 1, x: 0, duration: dur, ease: "power3.out" }, at);
      if (b.at != null) ctx.glance(at);
    });
  });
})(typeof window !== "undefined" ? window : globalThis);
