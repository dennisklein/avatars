// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Outro scene: thanks, the brand's links and the next episode on a card, the
// presenter full size on the left; she waves on the last line and winks at
// its end. The episode then fades to black (done()).
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});
  const S = (global.Scenes = global.Scenes || {});

  A.scenes.register("outro", function outro(ctx, o) {
    const { tl, h } = ctx;
    const { el, t } = ctx.begin("outro", o, { transition: "blur", shot: "left" });
    // Links: [label, text] pairs, by default the brand's.
    const links = o.links || ctx.brand.links || [];
    const card = h("div", { class: "card" }, [
      h("div", { class: "headline", text: o.title || "Thanks for watching!" }),
      links.length ? h("div", { class: "links" }, links.map(([k, v]) => h("div", { class: "link" }, [h("span", { text: k }), document.createTextNode(v)]))) : null,
      o.next ? h("div", { class: "next" }, [h("div", { class: "kicker", text: "Next up" }), h("div", { class: "t", text: o.next })]) : null,
    ]);
    el.append(h("div", { class: "bg-glow" }), h("div", { class: "bg-grid" }), card);
    S.enter(tl, card.children, t + 0.6, { stagger: 0.15 });
    ctx.P.wait(o.lead != null ? o.lead : 0.7);
    const said = ctx.say(o.say, "joy", 0);
    const last = said[said.length - 1];
    if (last) {
      ctx.feel(last.start + Math.min(1.2, last.line.duration / 3), "happy");
      if (o.wave !== false) ctx.wave(o.wave != null ? o.wave : Math.max(last.start, last.end - 2.6), 2.4);
      ctx.feel(last.end + 0.2, "wink");
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
