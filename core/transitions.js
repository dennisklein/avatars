// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Scene transitions and entrances. Scenes are plain (non-clip) full-frame
// sections; transitions own their visibility. Outgoing content stays fully
// visible until the handoff.
//
//   Avatars.transitions.register("wipe", (tl, from, to, at, dur, opt) => { ... });
//   Scenes.transition(tl, "push", fromEl, toEl, at, dur);
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});
  const S = (global.Scenes = global.Scenes || {});

  const registry = {};
  A.transitions = {
    register(name, fn) {
      if (typeof fn !== "function") throw new Error(`transition ${name}: not a function`);
      registry[name] = fn;
    },
    get(name) {
      return Object.prototype.hasOwnProperty.call(registry, name) ? registry[name] : undefined;
    },
    names() {
      return Object.keys(registry);
    },
  };

  function show(tl, el, at) {
    tl.set(el, { autoAlpha: 1 }, at);
  }
  function hide(tl, el, at) {
    tl.set(el, { autoAlpha: 0 }, at);
  }

  // Push: outgoing slides left, incoming follows from the right.
  A.transitions.register("push", function push(tl, from, to, at, dur) {
    dur = dur || 0.6;
    show(tl, to, at);
    tl.fromTo(to, { xPercent: 100 }, { xPercent: 0, duration: dur, ease: "power3.inOut" }, at);
    tl.fromTo(from, { xPercent: 0 }, { xPercent: -100, duration: dur, ease: "power3.inOut" }, at);
    hide(tl, from, at + dur);
    tl.set(from, { xPercent: 0 }, at + dur);
  });

  // Iris: incoming scene opens as a growing circle from (x%, y%).
  A.transitions.register("iris", function iris(tl, from, to, at, dur, opt) {
    dur = dur || 0.7;
    const x = (opt && opt.x) || "50%";
    const y = (opt && opt.y) || "50%";
    show(tl, to, at);
    tl.fromTo(to, { clipPath: `circle(0% at ${x} ${y})` }, { clipPath: `circle(150% at ${x} ${y})`, duration: dur, ease: "power2.inOut" }, at);
    hide(tl, from, at + dur);
    tl.set(to, { clipPath: "none" }, at + dur);
  });

  // Blur crossfade: calm handoff for wind-down and outro.
  A.transitions.register("blur", function blur(tl, from, to, at, dur) {
    dur = dur || 0.8;
    show(tl, to, at);
    tl.fromTo(to, { opacity: 0, filter: "blur(16px)" }, { opacity: 1, filter: "blur(0px)", duration: dur, ease: "sine.inOut" }, at);
    tl.fromTo(from, { filter: "blur(0px)" }, { filter: "blur(16px)", duration: dur, ease: "sine.inOut" }, at);
    hide(tl, from, at + dur);
    tl.set(from, { filter: "none" }, at + dur);
  });

  function transition(tl, kind, from, to, at, dur, opt) {
    const fn = A.transitions.get(kind);
    if (!fn) throw new Error(`unknown transition ${kind}`);
    fn(tl, from, to, at, dur, opt);
  }

  // Entrance helper: elements rise and fade in, staggered. The default rise
  // and duration are the motion.enter tokens.
  function enter(tl, targets, at, opt) {
    opt = opt || {};
    const T = A.tokens;
    tl.fromTo(
      targets,
      { opacity: 0, y: opt.y == null ? T.num("motion.enter.offset") : opt.y },
      { opacity: 1, y: 0, duration: opt.duration || T.num("motion.enter.duration"), ease: opt.ease || "power3.out", stagger: opt.stagger || 0 },
      at
    );
  }

  Object.assign(S, { transition, show, hide, enter });
})(typeof window !== "undefined" ? window : globalThis);
