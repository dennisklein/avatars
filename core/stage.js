// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Presenter framing. The frame is the visible window; the stage inside it
// holds the presenter's SVG at the aspect ratio of its base canvas. Shots are
// the format's presets (format.json "shots"); the presenter glides between
// them on the episode timeline.
//
//   <div class="presenter-frame" data-role="host">
//     <div class="presenter-bg"></div> <div class="presenter-stage"></div> <div class="presenter-ring"></div>
//   </div>
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});
  const S = (global.Scenes = global.Scenes || {});

  const data = () => A.data || {};
  // The same objects as Avatars.data.format.shots: GSAP's tl.set() writes its
  // bookkeeping (duration 0, parent) into the frame vars it is given, and
  // later moves to a shot copy those vars, so a shot that was once set
  // without a move is reached without one afterwards.
  S.SHOTS = (data().format && data().format.shots) || {};

  // The base of the cast member a frame shows (data-role, default "host").
  function baseOf(frame) {
    const d = data();
    const role = (frame.getAttribute && frame.getAttribute("data-role")) || "host";
    const member = d.cast && d.cast[role];
    const base = member && d.bases && d.bases[member.base];
    if (!base || !base.canvas) throw new Error(`shot: no base canvas for presenter "${role}"`);
    return base;
  }

  // Stage box of a shot for a base: the height follows the canvas. A base
  // with `framing` is scaled by framing.scale about its face centre
  // (anchors.face.center) and moved by framing.offset base units, so every
  // face sits where the shot expects it.
  function stageBox(st, base) {
    const cw = base.canvas[0];
    const ch = base.canvas[1];
    const f = base.framing;
    if (!f) return Object.assign({}, st, { height: (st.width * ch) / cw });
    const k = f.scale == null ? 1 : f.scale;
    const u = st.width / cw;
    const face = (base.anchors && base.anchors.face && base.anchors.face.center) || [cw / 2, ch / 2];
    const off = f.offset || [0, 0];
    const width = st.width * k;
    return Object.assign({}, st, {
      width,
      height: (width * ch) / cw,
      left: st.left + face[0] * u * (1 - k) + off[0] * u,
      top: st.top + face[1] * u * (1 - k) + off[1] * u,
    });
  }

  function shot(tl, frame, name, at, dur, ease) {
    const s = S.SHOTS[name];
    if (!s) throw new Error(`unknown shot ${name}`);
    const stage = frame.querySelector(".presenter-stage");
    const deco = frame.querySelectorAll(".presenter-ring, .presenter-bg");
    const stageVars = stageBox(s.stage, baseOf(frame));
    if (!dur) {
      tl.set(frame, s.frame, at);
      tl.set(stage, stageVars, at);
      tl.set(deco, { opacity: s.ring }, at);
      return;
    }
    const e = ease || "power3.inOut";
    tl.to(frame, Object.assign({ duration: dur, ease: e }, s.frame), at);
    tl.to(stage, Object.assign({ duration: dur, ease: e }, stageVars), at);
    tl.to(deco, { opacity: s.ring, duration: dur * 0.6, ease: "power1.inOut" }, at + (s.ring ? dur * 0.4 : 0));
  }

  S.shot = shot;
})(typeof window !== "undefined" ? window : globalThis);
