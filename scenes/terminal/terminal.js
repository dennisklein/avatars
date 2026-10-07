// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Terminal scene: commands typed on cue and their output, in a window beside
// the presenter's corner bubble (or fullscreen with `wide: true`). The
// window's content is a pure function of time: Scenes.terminal returns a
// renderer that the episode clock calls every frame.
//
// Geometry (window rects, font limits) comes from the format:
// format.json "scenes.terminal".
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});
  const S = (global.Scenes = global.Scenes || {});

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // The HTML of a line with every occurrence of the marks in a highlight.
  // Marks match the raw text in one pass, longest first, and each piece is
  // escaped once, so a mark never matches markup or an entity.
  function highlight(text, marks) {
    const list = [...new Set(marks.filter(Boolean))].sort((a, b) => b.length - a.length);
    if (!list.length) return esc(text);
    const re = new RegExp(`(${list.map(reEsc).join("|")})`);
    return text
      .split(re)
      .map((s, i) => (i % 2 ? `<span class="term-hl">${esc(s)}</span>` : esc(s)))
      .join("");
  }

  // steps: [{ at, cmd } | { at, out } | { at, prompt: true } | { at, ff, hold? } | { at, mark, until? } | { at, clear: true }]
  // cmd lines are typed (deterministic per-char timing), out lines appear at once.
  function terminal(el, steps, opts) {
    opts = opts || {};
    const T = A.tokens;
    const prompt = opts.prompt || "$ ";
    const cps = opts.cps || T.num("terminal.cps"); // typing speed, chars per second
    const blink = T.num("terminal.blink");
    const hold = T.num("terminal.ff-hold");
    const rows = opts.rows || 14;
    const sorted = steps.slice().sort((a, b) => a.at - b.at);
    const body = el.querySelector(".term-body");
    const badge = el.querySelector(".term-ff");
    let lastKey = "";

    return function render(t) {
      const lines = [];
      let typing = false;
      let ff = null;
      const marks = [];
      let running = false;
      for (const s of sorted) {
        if (s.at > t) break;
        // A command that keeps running (a server) gets no fresh prompt;
        // marks and badges on its output keep it that way.
        if (s.cmd != null || s.out != null || s.prompt) running = !!s.running;
        if (s.clear) lines.length = 0;
        // A finished silent command: show a fresh, empty prompt.
        if (s.prompt) lines.push({ kind: "cmd", text: "", idle: true });
        if (s.cmd != null) {
          if (lines.length && lines[lines.length - 1].idle) lines.pop();
          const n = Math.floor((t - s.at) * cps);
          const shown = s.cmd.slice(0, clamp(n, 0, s.cmd.length));
          if (n < s.cmd.length) typing = true;
          lines.push({ kind: "cmd", text: shown });
        }
        if (s.out != null) {
          for (const l of s.out.split("\n")) lines.push({ kind: "out", text: l });
        }
        if (s.ff && t - s.at < (s.hold || hold)) ff = s.ff;
        if (s.mark && (s.until == null || t < s.until)) marks.push(s.mark);
      }
      const last = lines[lines.length - 1];
      // Once output follows a command, show a fresh prompt.
      if (!running && (!last || last.kind === "out")) lines.push({ kind: "cmd", text: "" });
      const cursorOn = typing || Math.floor(t * blink) % 2 === 0;
      const view = lines.slice(-rows);
      const key = JSON.stringify([view, cursorOn, ff, marks]);
      if (key === lastKey) return;
      lastKey = key;
      body.innerHTML = view
        .map((l, i) => {
          const html = highlight(l.text, marks);
          const isLast = i === view.length - 1;
          const cur = isLast && cursorOn ? '<span class="term-cursor"></span>' : "";
          return l.kind === "cmd"
            ? `<div class="term-line"><span class="term-prompt">${esc(prompt)}</span>${html}${cur}</div>`
            : `<div class="term-line term-out">${html || "&nbsp;"}</div>`;
        })
        .join("");
      if (badge) {
        badge.style.opacity = ff ? "1" : "0";
        if (ff) badge.textContent = ff;
      }
    };
  }
  S.terminal = terminal;

  A.scenes.register("terminal", function terminalScene(ctx, o) {
    const { tl, h } = ctx;
    const T = ctx.tokens;
    const G = ctx.format.scenes.terminal;
    const wide = !!o.wide;
    const shot = o.avatar === "none" ? "hidden" : wide ? "mini" : "cornerR";
    const { el, t } = ctx.begin(wide ? "terminal-wide" : "terminal", o, { transition: "push", shot });
    // The window lays out beside the right-hand bubble; `shot` only moves the presenter.
    if (ctx.shot === "cornerL") console.warn("terminal: the cornerL bubble covers the window, which lays out for cornerR");
    const geo = wide ? G.wide : G.normal;
    const body = h("div", { class: "term-body" });
    const win = h("div", { class: wide ? "term wide" : "term", style: `left:${geo.left}px;top:${geo.top}px;width:${geo.width}px;height:${geo.height}px` }, [ctx.windowBar(o.title || "~/work — bash"), body, h("div", { class: "term-ff" })]);
    el.append(...[h("div", { class: "bg-glow" }), ctx.chapterLabel(o), win].filter(Boolean));
    S.enter(tl, win, t + 0.4, { y: 40 });
    ctx.P.wait(o.lead != null ? o.lead : 0.6);
    ctx.say(o.say, o.mood || "happy", 0.3);

    // Resolve step times: `at` is absolute, `after` follows the previous step.
    const prompt = o.prompt || "$ ";
    const cps = o.cps || T.num("terminal.cps");
    let prevEnd = t + 1;
    const steps = (o.steps || []).map((st) => {
      const at = st.at != null ? ctx.time(st.at) + (st.delay || 0) : prevEnd + (st.after != null ? st.after : 0.3);
      const step = Object.assign({}, st, { at });
      if (st.until != null) step.until = ctx.time(st.until);
      delete step.after;
      delete step.delay;
      prevEnd = st.cmd != null ? at + st.cmd.length / cps : at;
      if (st.cmd != null && o.glance !== false && shot !== "hidden") ctx.glance(at, Math.max(0.8, st.cmd.length / cps + 0.4), wide ? -0.5 : -0.8, 0.2);
      return step;
    });

    // Fit the font to the longest line; the wide terminal goes smaller.
    const cols = Math.max(20, ...steps.flatMap((s) => (s.cmd != null ? [prompt.length + s.cmd.length + 1] : s.out != null ? s.out.split("\n").map((l) => l.length) : [])));
    const advance = T.num("font.mono-advance");
    const inner = geo.width - 2 * T.num("terminal.pad-x");
    const font = Math.max(geo.min, Math.min(geo.max, Math.floor(inner / (cols * advance))));
    if (inner / (cols * advance) < geo.min) console.warn(`terminal: ${cols} columns do not fit at ${geo.min}px; use wide: true or shorten the lines`);
    body.style.fontSize = `${font}px`;
    const rows = Math.floor((geo.height - T.num("window.bar-height") - 2 * T.num("terminal.pad-y")) / (font * T.num("terminal.line-height")));
    ctx.renderers.push(S.terminal(win, steps, { prompt, cps, rows }));
    for (const st of steps) {
      if (st.cmd != null) ctx.shown.push({ cmd: st.cmd, at: st.at });
      if (st.out != null) ctx.shown.push({ out: st.out, at: st.at });
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
