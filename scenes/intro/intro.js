// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Intro scene: the brand sting (emblem, wordmark, tagline from the project's
// brand), the episode's kicker and title, and the presenter's disclosure.
// The presenter rises in on the right and waves on the first line.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});
  const S = (global.Scenes = global.Scenes || {});

  A.scenes.register("intro", function intro(ctx, o) {
    const { tl, h, brand } = ctx;
    const T = ctx.tokens;
    const { el } = ctx.begin("intro", o, {});

    // The emblem as inline SVG, so its pieces can pop in one by one.
    const mark = brand.marks && brand.marks.emblem;
    let emblem = null;
    if (mark) {
      emblem = ctx.svg("svg", { class: "emblem", viewBox: mark.viewBox.join(" "), "aria-hidden": "true" });
      emblem.innerHTML = mark.body;
    }
    const words = [brand.wordmark ? h("div", { class: "wordmark", text: brand.wordmark }) : null, brand.tagline ? h("div", { class: "tagline", text: brand.tagline }) : null].filter(Boolean);
    const lockup = emblem || words.length ? h("div", { class: "lockup" }, [emblem, words.length ? h("div", {}, words) : null]) : null;
    el.append(
      ...[
        h("div", { class: "bg-glow" }),
        h("div", { class: "bg-grid" }),
        h("div", { class: "brand" }, [lockup, h("div", { class: "ep" }, [h("div", { class: "kicker", text: o.kicker || "" }), h("div", { class: "headline", text: o.title || ctx.series })])]),
        ctx.presenter.disclosure ? h("div", { class: "disclosure", text: ctx.presenter.disclosure }) : null,
      ].filter(Boolean)
    );
    ctx.chapters.length = 0;
    ctx.chapters.push({ title: o.chapter || "Intro", start: 0 });

    // The emblem's pieces pop in from the centre outwards, each about its own
    // centre and up to the opacity it was drawn with. The origin is in both
    // states: GSAP shifts an SVG element whose origin changes mid-tween.
    const pieces = emblem ? [...emblem.children] : [];
    if (pieces.length) {
      const own = (i, p) => (p.getAttribute("opacity") == null ? 1 : Number(p.getAttribute("opacity")));
      tl.fromTo(pieces, { scale: 0, opacity: 0, transformOrigin: "50% 50%" }, { scale: 1, opacity: own, transformOrigin: "50% 50%", duration: 0.45, ease: "back.out(2)", stagger: { each: 0.05, from: "center" } }, 0.15);
    }
    const enter = (sel, at, opt) => {
      const x = el.querySelector(sel);
      if (x) S.enter(tl, x, at, opt);
    };
    enter(".wordmark", 0.55, { y: T.num("intro.wordmark-offset") });
    enter(".tagline", 0.8, { y: T.num("intro.tagline-offset") });
    enter(".ep", 1.1);
    enter(".disclosure", 1.3, { y: 0 });
    ctx.setShot("hidden", 0);
    ctx.setShot("hero", 0.7, 0.9, "power3.out");
    ctx.P.at(o.start != null ? o.start : 1.5);
    const said = ctx.say(o.say, "joy", 0.25);
    if (said.length && o.wave !== false) ctx.wave(said[0].start - 0.1, 2.2);
    if (said.length) {
      // From "joy" to "happy" once the first sentence is over.
      const w = said[0].line.words;
      const k = w.findIndex((x, i) => i > 0 && /[.!?]$/.test(w[i - 1].text));
      if (k > 0) ctx.feel(said[0].start + w[k].start, "happy");
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
