// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Talk scene: the presenter full size on the left, a title card on the right
// (kicker, title, sub, chips) and an optional name tag. Frames the topic
// right after the intro.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});
  const S = (global.Scenes = global.Scenes || {});

  A.scenes.register("talk", function talk(ctx, o) {
    const { tl, h } = ctx;
    const T = ctx.tokens;
    const prevIntro = ctx.scenes.length && ctx.scenes[ctx.scenes.length - 1].classList.contains("scene-intro");
    const { el, t } = ctx.begin("talk", o, { transition: prevIntro ? "iris" : "push", shot: "full" });
    const card = h("div", { class: "card" }, [
      o.kicker ? h("div", { class: "kicker", text: o.kicker }) : null,
      h("div", { class: "headline", text: o.title || "" }),
      o.sub ? h("div", { class: "sub", text: o.sub }) : null,
      o.chips ? h("div", { class: "chips" }, o.chips.map((c, i) => h("span", { class: i === 0 ? "chip accent" : "chip", text: c }))) : null,
    ]);
    el.append(h("div", { class: "bg-glow" }), h("div", { class: "bg-grid" }), card);
    S.enter(tl, card.children, t + 0.5, { stagger: 0.12 });
    // The name tag defaults to the host's name and the brand's presenter role.
    if (o.nameTag) {
      const name = o.nameTag.name || ctx.presenter.name;
      const role = o.nameTag.role || ctx.presenter.role;
      const tag = h("div", { class: "lower-third", style: "opacity: 0" }, [name ? h("div", { class: "name", text: name }) : null, role ? h("div", { class: "role", text: role }) : null]);
      ctx.root.insertBefore(tag, ctx.captionsEl);
      const dx = T.num("talk.tag-offset");
      tl.fromTo(tag, { opacity: 0, x: -dx }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, t + 0.9);
      tl.to(tag, { opacity: 0, x: -dx, duration: 0.4, ease: "power2.in" }, t + (o.nameTag.hold || T.num("talk.tag-hold")));
    }
    ctx.P.wait(o.lead != null ? o.lead : 0.6);
    ctx.say(o.say, "neutral");
  });
})(typeof window !== "undefined" ? window : globalThis);
