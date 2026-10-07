// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Narration planner: lays narration lines out on the timeline with a cursor
// and resolves cue words to times.
//
//   const P = Scenes.planner(window.AVATAR_LINES);
//   P.wait(1.2); const hi = P.say("intro"); P.wait(0.4);
//   hi.word("network")  -> absolute time the word starts
(function (global) {
  "use strict";
  const S = (global.Scenes = global.Scenes || {});

  // Words match cues ignoring case and punctuation.
  const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

  function planner(lines) {
    lines = lines || {};
    let cursor = 0;
    const said = [];
    const P = {
      get t() {
        return cursor;
      },
      at(t) {
        cursor = t;
        return cursor;
      },
      wait(d) {
        cursor += d;
        return cursor;
      },
      say(id, opts) {
        opts = opts || {};
        const line = lines[id];
        if (!line) throw new Error(`voice line "${id}" missing; run avatars voice (or fixture-voice) for this episode`);
        const start = cursor;
        const item = {
          id,
          line,
          start,
          end: start + line.duration,
          // Start time of the n-th word matching q (index or text prefix).
          word(q, n) {
            const w = findWord(line.words, q, n || 0);
            return start + w.start;
          },
          wordEnd(q, n) {
            const w = findWord(line.words, q, n || 0);
            return start + w.end;
          },
        };
        said.push(item);
        cursor = item.end + (opts.gap == null ? 0.3 : opts.gap);
        return item;
      },
      said,
      speech() {
        return said.map((s) => ({ offset: s.start, visemes: s.line.visemes, envelope: s.line.envelope }));
      },
      // Framework-owned <audio> clips, one per spoken line.
      audio(root, dir) {
        for (const s of said) {
          const a = document.createElement("audio");
          a.id = `vo-${s.id}`;
          a.src = `${dir || "assets/voice"}/${s.id}.wav`;
          a.setAttribute("data-start", s.start.toFixed(3));
          a.setAttribute("data-duration", s.line.duration.toFixed(3));
          root.appendChild(a);
        }
      },
    };
    return P;
  }

  function findWord(words, q, n) {
    if (typeof q === "number") {
      if (!words[q]) throw new Error(`word index ${q} out of range`);
      return words[q];
    }
    const key = norm(q);
    let seen = 0;
    for (const w of words) {
      if (norm(w.text).startsWith(key)) {
        if (seen === n) return w;
        seen++;
      }
    }
    throw new Error(`word "${q}" not found in: ${words.map((w) => w.text).join(" ")}`);
  }

  S.planner = planner;
})(typeof window !== "undefined" ? window : globalThis);
