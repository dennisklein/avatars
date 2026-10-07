// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Presenters: a cast member of Avatars.data.cast, performed by the performer
// and drawn by the member's rig.
//
//   const host = Avatars.createPresenter("host", el, { speech, expressions, gaze, gestures });
//   host.render(3.2); // any time, in any order
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  // Moods merged per mood and per parameter: later tables win.
  function mergeMoods(a, b) {
    const out = {};
    for (const table of [a, b]) {
      for (const name in table || {}) out[name] = Object.assign({}, out[name] || {}, table[name]);
    }
    return out;
  }

  A.createPresenter = function (role, container, tracks) {
    tracks = tracks || {};
    const cast = (A.data && A.data.cast) || {};
    const member = cast[role];
    if (!member) throw new Error(`createPresenter: the cast has no role "${role}" (roles: ${Object.keys(cast).join(", ") || "none"})`);
    const rigName = member.rig || "svg";
    const rig = A.rigs && A.rigs[rigName];
    if (!rig) throw new Error(`createPresenter: rig "${rigName}" of ${member.avatar} is not loaded`);
    // The member's moods, temperament and seed; tracks may override each.
    const performer = A.performer.create(
      Object.assign({}, tracks, {
        moods: mergeMoods(member.moods, tracks.moods),
        temperament: Object.assign({}, member.temperament, tracks.temperament),
        seed: tracks.seed != null ? tracks.seed : member.seed,
      })
    );
    const view = rig.create(container, member, performer);
    return {
      render: view.render,
      svg: view.svg,
      poseAt: performer.poseAt,
      mouthAt: performer.mouthAt,
      exprAt: performer.exprAt,
      gazeAt: performer.gazeAt,
      tracks: performer.tracks,
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
