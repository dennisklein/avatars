// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// The episode clock: one GSAP setter tween that renders every per-frame
// component (presenter, captions, terminals) at timeline time t. Seeking the
// paused timeline to any time renders that frame exactly, so frames come out
// right in any order and across parallel render workers.
(function (global) {
  "use strict";
  const S = (global.Scenes = global.Scenes || {});

  function clock(tl, duration, renderers) {
    const c = {
      _t: 0,
      get t() {
        return this._t;
      },
      set t(v) {
        this._t = v;
        for (const r of renderers) r(v);
      },
    };
    c.t = 0;
    tl.fromTo(c, { t: 0 }, { t: duration, duration, ease: "none", immediateRender: false }, 0);
    return c;
  }

  S.clock = clock;
})(typeof window !== "undefined" ? window : globalThis);
