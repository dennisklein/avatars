// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Captions: spoken lines split into phrases, with the spoken words lit.
(function (global) {
  "use strict";
  const S = (global.Scenes = global.Scenes || {});

  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Split spoken lines into caption phrases (shared by on-screen captions and
  // the WebVTT export, so both show the same cues).
  // opts.maxWords caps a phrase; a comma only ends one that has commaMin words.
  function phrasesOf(said, opts) {
    opts = opts || {};
    const maxWords = opts.maxWords || 7;
    const commaMin = opts.commaMin || 1;
    const phrases = [];
    for (const s of said) {
      let cur = [];
      const flush = () => {
        if (!cur.length) return;
        phrases.push({ words: cur.slice(), start: cur[0].t0 - 0.08, end: cur[cur.length - 1].t1 + 0.35 });
        cur = [];
      };
      for (const w of s.line.words) {
        cur.push({ text: w.text, t0: s.start + w.start, t1: s.start + w.end });
        if (/[.!?;:]$/.test(w.text) || (/,$/.test(w.text) && cur.length >= commaMin) || cur.length >= maxWords) flush();
      }
      flush();
    }
    // A phrase never overlaps the next one.
    for (let i = 0; i + 1 < phrases.length; i++) phrases[i].end = Math.min(phrases[i].end, phrases[i + 1].start);
    return phrases;
  }

  // A renderer for the clock: shows the phrase at t in el and lights the
  // words already spoken. It touches the DOM only when the phrase or the
  // number of lit words changes.
  function captions(el, said, opts) {
    opts = opts || {};
    const phrases = phrasesOf(said, opts);
    let shown = -2;
    let lit = -1;
    const box = document.createElement("div");
    box.className = "cap-box";
    el.appendChild(box);
    return function render(t) {
      let idx = -1;
      for (let i = 0; i < phrases.length; i++) {
        if (t >= phrases[i].start && t < phrases[i].end) {
          idx = i;
          break;
        }
      }
      if (idx !== shown) {
        shown = idx;
        lit = -1;
        if (idx < 0) {
          box.style.opacity = "0";
          box.innerHTML = "";
        } else {
          box.style.opacity = "1";
          box.innerHTML = phrases[idx].words.map((w) => `<span class="cap-w">${esc(w.text)}</span>`).join(" ");
        }
      }
      if (idx >= 0) {
        const ws = phrases[idx].words;
        let n = 0;
        while (n < ws.length && ws[n].t0 <= t) n++;
        if (n !== lit) {
          lit = n;
          const spans = box.children;
          for (let i = 0; i < spans.length; i++) spans[i].classList.toggle("on", i < n);
        }
      }
    };
  }

  S.phrasesOf = phrasesOf;
  S.captions = captions;
})(typeof window !== "undefined" ? window : globalThis);
