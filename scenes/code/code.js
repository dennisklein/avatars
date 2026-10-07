// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Code scene: files on the slide frame. One panel (`file`, `lang`, `text`) or
// several side by side (`panels: [{ file, lang, text }]`), coloured by the
// highlighter registered for `lang` (Avatars.highlight). Lines in a `reveal`
// range ([first, last], counted from 1) fade in at its cue, `marks` light up
// the lines that contain `text` (or line number `line`) from their cue until
// `until`, and `notes` are chips under the panels. A panel scrolls to keep
// revealed and marked lines in view. The text is checked against the docs
// like terminal output, so it must be copied from the page.
//
// Geometry (areas, line height, font limits, gaps) comes from the format:
// format.json "scenes.code"; the paddings, bar and note heights CSS draws
// with are tokens.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});
  const S = (global.Scenes = global.Scenes || {});

  A.scenes.register("code", function code(ctx, o) {
    const { tl, h } = ctx;
    const T = ctx.tokens;
    const G = ctx.format.scenes.code;
    const CODE = {
      bar: T.num("window.bar-height"),
      padX: T.num("code.pad-x"),
      padY: T.num("code.pad-y"),
      note: T.num("code.note-height"),
      line: G.line,
      max: G.max,
      min: G.min,
      gap: G.gap,
      noteGap: G.noteGap,
    };
    // Monospace advance per character, in em, of the theme's font.mono.
    const MONO_ADVANCE = T.num("font.mono-advance");
    const wide = !!o.wide;
    const f = ctx.slideFrame("code", Object.assign({ shot: wide ? "mini" : "cornerR" }, o));
    // The area below the slide title (all of it without a title).
    const a = Object.assign({}, G.areas[wide ? "wide" : "cornerR"]);
    if (!o.title) {
      a.h += a.y - G.untitledTop;
      a.y = G.untitledTop;
    }
    const specs = o.panels || [{ file: o.file, lang: o.lang, text: o.text }];
    // The panels lay out beside the right-hand bubble; `shot` only moves the presenter.
    if (ctx.shot === "cornerL") console.warn(`code ${specs.map((p) => p.file).join(", ")}: the cornerL bubble covers the panels, which lay out for cornerR`);
    const notes = o.notes || [];
    const notesH = notes.length ? CODE.gap + notes.length * CODE.note + (notes.length - 1) * CODE.noteGap : 0;
    const pw = (a.w - CODE.gap * (specs.length - 1)) / specs.length;
    const bodyH = a.h - notesH - CODE.bar - 2 * CODE.padY;
    const panels = specs.map((p) => Object.assign({}, p, { lines: String(p.text || "").replace(/\n+$/, "").split("\n") }));
    const cols = Math.max(20, ...panels.flatMap((p) => p.lines.map((l) => l.length)));
    const most = Math.max(...panels.map((p) => p.lines.length));
    const fitW = Math.floor((pw - 2 * CODE.padX) / (cols * MONO_ADVANCE));
    const font = Math.max(CODE.min, Math.min(o.font || CODE.max, fitW, Math.floor(bodyH / (most * CODE.line))));
    if (fitW < CODE.min) console.warn(`code ${specs.map((p) => p.file).join(", ")}: ${cols} columns do not fit at ${CODE.min}px; use wide: true or fewer panels`);
    const lh = font * CODE.line;
    const rows = Math.max(1, Math.floor(bodyH / lh));
    const ph = CODE.bar + 2 * CODE.padY + Math.min(most, rows) * lh;

    const plain = A.highlight.get("text") || A.highlight.esc;
    const paint = A.highlight.get(o.lang) || plain;
    panels.forEach((p, k) => {
      const color = A.highlight.get(p.lang) || paint;
      p.lineEls = p.lines.map((l) => h("div", { class: "code-line" }, [h("span", { class: "code-hl" }), h("span", { class: "code-txt", html: color(l) || "&nbsp;" })]));
      p.view = h("div", { class: "code-lines" }, p.lineEls);
      p.el = h("div", { class: "code-panel", style: `left:${a.x + k * (pw + CODE.gap)}px;top:${a.y}px;width:${pw}px;height:${ph}px` }, [
        ctx.windowBar(p.file || ""),
        h("div", { class: "code-body", style: `font-size:${font}px;line-height:${lh}px` }, [p.view]),
      ]);
      f.el.append(p.el);
      ctx.shown.push({ out: p.lines.join("\n"), at: f.t, code: p.file || "code" });
    });
    const noteEls = notes.map((n, i) =>
      h("div", { class: n.warn ? "code-note warn" : "code-note", style: `left:${a.x}px;top:${a.y + ph + CODE.gap + i * (CODE.note + CODE.noteGap)}px` }, [ctx.icon(n.icon || (n.warn ? "warn" : "check")), h("span", { text: n.text })])
    );
    f.el.append(...noteEls);
    S.enter(
      tl,
      panels.map((p) => p.el),
      f.t + 0.6,
      { y: 40, stagger: 0.15 }
    );
    for (const n of noteEls) tl.set(n, { opacity: 0 }, 0);
    f.narrate();

    // Reveals and marks, in time order; each one scrolls its panel if needed.
    const panelOf = (it) => panels[it.panel || 0];
    const events = [];
    for (const r of o.reveal || []) {
      const p = panelOf(r);
      const [i0, i1] = [r.lines[0] - 1, (r.lines[1] || r.lines[0]) - 1];
      const els = p.lineEls.slice(i0, i1 + 1);
      for (const e of els) tl.set(e, { opacity: 0 }, 0);
      events.push({ at: ctx.time(r.at) - 0.15, p, first: i0, last: i1, run: (at) => tl.fromTo(els, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out", stagger: 0.06, immediateRender: false }, at) });
    }
    for (const m of o.marks || []) {
      const targets = (m.panel != null ? [panelOf(m)] : panels).flatMap((p) => p.lines.map((l, i) => ({ p, i })).filter(({ i }) => (m.line != null ? i === m.line - 1 : p.lines[i].includes(m.text))));
      if (!targets.length) throw new Error(`code: mark "${m.text != null ? m.text : m.line}" matches no line`);
      const hls = targets.map(({ p, i }) => p.lineEls[i].firstChild);
      const until = m.until != null ? ctx.time(m.until) - 0.1 : null;
      events.push({
        at: ctx.time(m.at) - 0.1,
        p: targets[0].p,
        first: targets[0].i,
        last: targets.filter((x) => x.p === targets[0].p).pop().i,
        run: (at) => {
          tl.fromTo(hls, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out", immediateRender: false }, at);
          if (until != null) tl.fromTo(hls, { opacity: 1 }, { opacity: 0, duration: 0.3, ease: "power2.in", immediateRender: false }, until);
          ctx.glance(at, 0.9, -0.7, -0.05);
        },
      });
    }
    for (const p of panels) {
      p.top = 0;
      p.scrollEnd = 0;
    }
    for (const ev of events.sort((x, y) => x.at - y.at)) {
      const p = ev.p;
      let top = p.top;
      if (ev.last >= top + rows) top = ev.last - rows + 1;
      if (ev.first < top) top = ev.first;
      if (top !== p.top) {
        // A scroll starts once the panel's previous one has ended, so it
        // starts from that scroll's end whatever frame a seek starts from.
        const at = Math.max(ev.at - 0.3, p.scrollEnd);
        tl.to(p.view, { y: -top * lh, duration: 0.5, ease: "power2.inOut" }, at);
        p.scrollEnd = at + 0.5;
        p.top = top;
      }
      ev.run(ev.at);
    }
    notes.forEach((n, i) => {
      const at = f.cue(n, i);
      tl.fromTo(noteEls[i], { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration: 0.45, ease: "power3.out", immediateRender: false }, at);
      ctx.glance(at, 0.9, -0.7, 0.1);
    });
  });
})(typeof window !== "undefined" ? window : globalThis);
