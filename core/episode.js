// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Episode builder: an episode is a sequence of scene calls. Each call builds
// its scene's DOM, lays its narration on the timeline, moves the presenter to
// the scene's shot and adds the transition from the previous scene. Scenes
// register here (Avatars.scenes) and become methods of every builder.
//
//   const tl = gsap.timeline({ paused: true });
//   Episode.create({ tl, id: "first-steps", title: "…", series: "Getting started" })
//     .intro({ kicker: "Getting started", title: "First steps", say: "intro" })
//     .talk({ chapter: "What you'll build", title: "…", say: "welcome" })
//     .slide({ chapter: "…", title: "…", bullets: [{ icon: "network", title: "…", text: "…", at: "what:network" }], say: "what" })
//     .terminal({ chapter: "…", say: ["create", "check"], steps: [{ cmd: "make run", at: "create:Run" }] })
//     .outro({ chapter: "Wrap-up", next: "…", say: "outro" })
//     .done();                              // builds the presenter, captions, audio, clock
//   window.__timelines["main"] = tl;         // in the page, so HyperFrames' lint sees it
//
// Narration (`say`): a line id, or { id, mood, cues: { word: mood }, look, gap },
// or an array of those. Times are written as "line:word" (the start of the
// first word beginning with "word" in the line's latest occurrence;
// "line:word#2" for the third match), and every helper accepts seconds instead.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});
  const S = (global.Scenes = global.Scenes || {});
  const data = (A.data = A.data || {});

  // ------------------------------------------------------------- DOM --
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k === "html") el.innerHTML = attrs[k];
      else if (k === "style") el.setAttribute("style", attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    for (const c of [].concat(children || [])) if (c) el.appendChild(c);
    return el;
  }

  const SVG_NS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs, children) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs || {}) el.setAttribute(k, attrs[k]);
    for (const c of [].concat(children || [])) if (c) el.appendChild(c);
    return el;
  }

  // Icons: name -> inner markup of a 24x24 stroke icon, from the project's
  // icon packs. Episodes may add their own: Episode.ICON_PATHS.chat = "<path …/>".
  const ICON_PATHS = (data.icons = data.icons || {});

  // An icon tile: a .icon box with the icon stroked in the icon.stroke colour.
  // Unknown names fall back to "check".
  function icon(name) {
    const paths = ICON_PATHS[name] || ICON_PATHS.check || "";
    const stroke = A.tokens.get("icon.stroke");
    return h("div", { class: "icon", html: `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>` });
  }

  // Words match cues ignoring case and punctuation, as in Scenes.planner.
  const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

  // ------------------------------------------------------ registries --
  // Builder members a scene may not replace.
  const RESERVED = new Set(["tl", "P", "root", "time", "lineEnd", "feel", "look", "wave", "gesture", "glance", "say", "custom", "done"]);
  const sceneBuilders = new Map();
  A.scenes = {
    register(name, build) {
      if (RESERVED.has(name)) throw new Error(`scene "${name}" would replace the builder's own ${name}`);
      if (typeof build !== "function") throw new Error(`scene "${name}": build is not a function`);
      sceneBuilders.set(name, build);
    },
    get(name) {
      return sceneBuilders.get(name);
    },
    names() {
      return [...sceneBuilders.keys()];
    },
  };

  // Code highlighters: lang -> (line) => HTML with spans for keys (k),
  // strings (s), comments (c), keywords (w) and punctuation (p). The helpers
  // work on raw text and escape it.
  const highlighters = {};
  const escHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  A.highlight = {
    register(lang, fn) {
      if (typeof fn !== "function") throw new Error(`highlighter ${lang}: not a function`);
      highlighters[lang] = fn;
    },
    get(lang) {
      return Object.prototype.hasOwnProperty.call(highlighters, lang) ? highlighters[lang] : undefined;
    },
    names() {
      return Object.keys(highlighters);
    },
    esc: escHtml,
    span: (cls, s) => (s ? `<span class="${cls}">${escHtml(s)}</span>` : ""),
    // [code, comment]: the line split where the comment pattern first matches.
    splitComment(l, re) {
      const i = l.search(re);
      return i < 0 ? [l, ""] : [l.slice(0, i), l.slice(i)];
    },
  };

  // ------------------------------------------------------------ builder --
  function create(opts) {
    opts = opts || {};
    const root = typeof opts.root === "string" ? document.querySelector(opts.root) : opts.root || document.querySelector("[data-composition-id]");
    const compId = root.getAttribute("data-composition-id");
    // The page creates and registers the timeline itself (HyperFrames' lint
    // reads only inline scripts).
    const tl = opts.tl;
    if (!tl) throw new Error("Episode.create needs { tl: gsap.timeline({ paused: true }) }");
    const T = A.tokens;
    const P = S.planner(opts.lines || global.AVATAR_LINES);
    const series = opts.series || opts.title || "";
    const brand = data.brand || {};
    const member = (data.cast && data.cast.host) || {};
    const presenter = { name: member.name || "", role: brand.role || "", disclosure: member.disclosure || "" };

    const expressions = [{ t: 0, name: "happy" }];
    const gaze = [{ t: 0, x: 0, y: 0 }];
    const gestures = [];
    const renderers = [];
    const chapters = [];
    const scenes = [];
    const shown = []; // terminal commands and output, code lines: for `avatars check`
    let shotName = null;
    let sceneCount = 0;

    // Layers above the scenes: presenter, name tag, captions, fade.
    const stage = h("div", { class: "presenter-stage" });
    const frame = h("div", { class: "presenter-frame", "data-role": "host" }, [h("div", { class: "presenter-bg" }), stage, h("div", { class: "presenter-ring" })]);
    const captionsEl = h("div", { id: "captions" });
    const blackout = h("div", { id: "blackout" });
    root.appendChild(frame);
    root.appendChild(captionsEl);
    root.appendChild(blackout);

    // ---- time references ----
    function time(ref) {
      if (typeof ref === "number") return ref;
      const m = /^([^:]+):([^#+-]+)(?:#(\d+))?([+-][\d.]+)?$/.exec(String(ref));
      if (!m) throw new Error(`bad time reference "${ref}" (want "line:word", "line:word#n" or seconds)`);
      const said = P.said.findLast((s) => s.id === m[1]);
      if (!said) throw new Error(`line "${m[1]}" has not been said yet (reference "${ref}")`);
      const word = m[2].trim();
      if (m[3] == null) {
        // A prefix that matches several words picks the first; say so.
        const key = norm(word);
        const hits = said.line.words.filter((w) => norm(w.text).startsWith(key)).map((w) => w.text);
        if (hits.length > 1) console.warn(`cue "${ref}" matches ${hits.length} words (${hits.join(", ")}); write "${m[1]}:${word}#0" for the first, or a longer prefix`);
      }
      return said.word(word, m[3] ? Number(m[3]) : 0) + (m[4] ? Number(m[4]) : 0);
    }
    const lineEnd = (id) => {
      const said = P.said.findLast((s) => s.id === id);
      if (!said) throw new Error(`line "${id}" has not been said yet`);
      return said.end;
    };

    // ---- acting ----
    const feel = (at, mood, blend) => expressions.push({ t: time(at), name: mood, blend });
    const look = (at, x, y) => gaze.push({ t: time(at), x, y: y || 0 });
    const gesture = (at, name, dur) => gestures.push({ t: time(at), name, dur: dur || 2.2 });
    const wave = (at, dur) => gesture(at, "wave", dur || 2.2);
    // Glance at content (on the left of the screen) and back to the camera.
    const glance = (at, hold, x, y) => {
      const t = time(at);
      look(t, x == null ? -0.7 : x, y == null ? 0.1 : y);
      look(t + (hold || 0.8), 0, 0);
    };

    function say(items, defaultMood, gap) {
      const list = [].concat(items || []);
      const out = [];
      list.forEach((item, i) => {
        const spec = typeof item === "string" ? { id: item } : item;
        const last = i === list.length - 1;
        const s = P.say(spec.id, { gap: spec.gap != null ? spec.gap : last ? (gap != null ? gap : 0.2) : 0.25 });
        if (spec.mood || defaultMood) feel(s.start, spec.mood || defaultMood);
        for (const [word, mood] of Object.entries(spec.cues || {})) feel(`${spec.id}:${word}`, mood);
        for (const [word, x] of Object.entries(spec.look || {})) look(`${spec.id}:${word}`, x === "camera" ? 0 : x);
        out.push(s);
      });
      return out;
    }

    // ---- scenes ----
    function setShot(name, at, dur, ease) {
      S.shot(tl, frame, name, at, dur, ease);
      shotName = name;
    }

    // A transition's duration: its motion.transition.<kind> token, else the default one.
    const transitionDur = (kind) => T.num(T.has(`motion.transition.${kind}`) ? `motion.transition.${kind}` : "motion.transition.default");

    // Start a scene: its section, the transition from the previous scene, the
    // presenter's shot and the chapter. defaults: { transition, shot }.
    function begin(kind, o, defaults) {
      o = o || {};
      defaults = defaults || {};
      const el = h("section", { class: `scene scene-${kind}`, id: `s${++sceneCount}-${kind}` });
      root.insertBefore(el, frame);
      const t = P.t;
      const prev = scenes[scenes.length - 1];
      if (!prev) {
        S.show(tl, el, 0);
      } else {
        const kindT = o.transition || defaults.transition;
        // An iris opens near the presenter's hero position.
        S.transition(tl, kindT, prev, el, t, o.transitionDur || transitionDur(kindT), kindT === "iris" ? { x: "70%", y: "45%" } : undefined);
      }
      const shot = o.shot !== undefined ? o.shot : defaults.shot;
      if (shot && shot !== shotName) setShot(shot, t, prev ? T.num("motion.shot") : 0);
      if (o.chapter) chapters.push({ title: o.chapter, start: t });
      scenes.push(el);
      return { el, t };
    }

    function chapterLabel(o) {
      const label = o.label || o.chapter;
      if (!label) return null;
      return h("div", { class: "chapter" }, [h("span", { class: "dot" }), document.createTextNode(series), h("b", { text: ` · ${label}` })]);
    }

    // The bar of a terminal or file window: three window dots and a title.
    function windowBar(title) {
      return h("div", { class: "term-bar" }, [h("i", { class: "dot-close" }), h("i", { class: "dot-min" }), h("i", { class: "dot-max" }), h("span", { class: "title", text: title || "" })]);
    }

    // The frame shared by slide layouts (bullets, diagram, code): background,
    // chapter label and title, with the presenter in the corner. The layout
    // fills the area below the title, then calls narrate() so that its items
    // can refer to the lines, and shows each item at cue(item, i): just
    // before its cue word (`at`), or one after another when it has none.
    function slideFrame(kind, o) {
      const { el, t } = begin(kind, o, { transition: "push", shot: "cornerR" });
      const title = h("div", { class: "slide-title", text: o.title || "" });
      el.append(...[h("div", { class: "bg-glow" }), chapterLabel(o), title].filter(Boolean));
      S.enter(tl, title, t + 0.5);
      return {
        el,
        t,
        narrate() {
          P.wait(o.lead != null ? o.lead : 0.6);
          say(o.say, o.mood || "neutral");
        },
        cue(item, i) {
          return item.at != null ? time(item.at) - 0.15 : t + 0.9 + i * 0.5;
        },
      };
    }

    // Anything else (a custom scene): returns { el, t } to fill in by hand.
    function custom(kind, o) {
      return begin(kind, o || {}, { transition: "push", shot: shotName || "cornerR" });
    }

    function done(o) {
      o = o || {};
      const END = P.t + (o.tail != null ? o.tail : T.num("motion.tail"));
      const fade = T.num("motion.fade-out");
      tl.to(blackout, { opacity: 1, duration: fade, ease: "power1.in" }, END - fade);
      tl.fromTo(root.querySelectorAll(".bg-grid"), { backgroundPosition: "0px 0px" }, { backgroundPosition: `${Math.round(END * T.num("grid.drift-x"))}px ${Math.round(END * T.num("grid.drift-y"))}px`, duration: END, ease: "none" }, 0);
      P.audio(root);
      const host = A.createPresenter("host", stage, { speech: P.speech(), expressions, gaze, gestures, seed: opts.seed || member.seed || 11, maxDuration: END + 5 });
      const list = [host.render, ...renderers];
      // Docs renders turn burned-in captions off and ship a WebVTT track instead.
      if (S.vars({ captions: true }).captions) list.push(S.captions(captionsEl, P.said));
      S.clock(tl, END, list);
      S.episode({ id: opts.id || compId, title: opts.title || series, duration: END, said: P.said, chapters, terminal: shown });
      return tl;
    }

    const api = { tl, P, root, time, lineEnd, feel, look, wave, gesture, glance, say, custom, done };

    // The scene context (DESIGN.md, "Scenes").
    const ctx = {
      tl,
      P,
      root,
      api,
      h,
      svg,
      icon,
      time,
      lineEnd,
      feel,
      look,
      glance,
      gesture,
      wave,
      say,
      begin,
      slideFrame,
      chapterLabel,
      windowBar,
      get shot() {
        return shotName;
      },
      setShot,
      frame,
      stage,
      captionsEl,
      chapters,
      scenes,
      renderers,
      shown,
      series,
      opts,
      brand,
      presenter,
      tokens: T,
      format: data.format || {},
    };

    for (const name of A.scenes.names()) {
      const build = A.scenes.get(name);
      api[name] = function (o) {
        build(ctx, o || {});
        return api;
      };
    }
    return api;
  }

  // Publish episode metadata on window.__episode for the CLI: chapters (for
  // the docs player) and caption cues (for WebVTT). Narration spans and
  // terminal and code content are for `avatars check`.
  function episode(meta) {
    const r3 = (v) => Math.round(v * 1000) / 1000;
    global.__episode = {
      id: meta.id,
      title: meta.title,
      duration: r3(meta.duration),
      chapters: meta.chapters.map((c) => ({ title: c.title, start: r3(c.start) })),
      cues: S.phrasesOf(meta.said, { maxWords: 12, commaMin: 5 }).map((p) => ({
        start: r3(Math.max(0, p.start)),
        end: r3(p.end),
        text: p.words.map((w) => w.text).join(" "),
      })),
      lines: meta.said.map((s) => ({ id: s.id, text: s.line.text, start: r3(s.start), end: r3(s.end) })),
      terminal: meta.terminal || [],
    };
    return global.__episode;
  }

  // Composition variables (HyperFrames --variables), with defaults outside the runtime.
  function vars(defaults) {
    const hf = global.__hyperframes;
    const got = hf && hf.getVariables ? hf.getVariables() : {};
    return Object.assign({}, defaults, got);
  }

  Object.assign(S, { episode, vars });
  global.Episode = { create, icon, ICON_PATHS };
})(typeof window !== "undefined" ? window : globalThis);
