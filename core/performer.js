// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// The performer: turns narration timings, moods, gaze and gestures into a
// pose per frame. Every value is a pure function of time t (seconds) plus the
// tracks passed in at creation, so any frame can be computed in any order.
// Rigs draw poses; the performer knows nothing about drawing.
//
//   const p = Avatars.performer.create({ speech, expressions, gaze, gestures, seed });
//   p.poseAt(3.2); // { t, expr, mouth, gaze, head, headLag, breath, blink, gestures }
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});
  const { clamp, lerp, smooth, mulberry32, makeNoise } = A.math;

  // ------------------------------------------------------------- visemes --
  // Mouth shape targets. open: jaw opening 0..1, wide: corner spread 0..1,
  // round: lip rounding 0..1, teeth: upper-teeth visibility 0..1.
  const VISEMES = {
    sil: { open: 0.0, wide: 0.45, round: 0.0, teeth: 0 },
    mbp: { open: 0.0, wide: 0.4, round: 0.1, teeth: 0 },
    aa: { open: 1.0, wide: 0.65, round: 0.05, teeth: 0.25 },
    ah: { open: 0.8, wide: 0.55, round: 0.15, teeth: 0.2 },
    ee: { open: 0.6, wide: 0.95, round: 0.0, teeth: 0.7 },
    ih: { open: 0.4, wide: 0.85, round: 0.0, teeth: 0.8 },
    oh: { open: 0.75, wide: 0.25, round: 0.85, teeth: 0 },
    ou: { open: 0.35, wide: 0.05, round: 1.0, teeth: 0 },
    fv: { open: 0.12, wide: 0.6, round: 0.0, teeth: 1 },
    th: { open: 0.22, wide: 0.6, round: 0.0, teeth: 0.8 },
    cdg: { open: 0.3, wide: 0.7, round: 0.0, teeth: 0.6 },
    sz: { open: 0.15, wide: 0.8, round: 0.0, teeth: 1 },
    ch: { open: 0.3, wide: 0.35, round: 0.6, teeth: 0.6 },
    l: { open: 0.4, wide: 0.6, round: 0.0, teeth: 0.4 },
    r: { open: 0.25, wide: 0.3, round: 0.55, teeth: 0.2 },
    w: { open: 0.15, wide: 0.05, round: 1.0, teeth: 0 },
  };

  // --------------------------------------------------------------- moods --
  // brow: raise (-1 frown .. 1 raised), browTilt: inner-end tilt (+ = worried),
  // eye: openness multiplier, squint: lower-lid raise, happyEyes: ^^ arcs,
  // smile: mouth corner curve (-1..1), mouthOpen: resting jaw opening,
  // blush: 0..1, pupil: pupil scale, winkL/winkR: force one eye closed.
  const MOODS = {
    neutral: { brow: 0, browTilt: 0, eye: 1, squint: 0.05, happyEyes: 0, smile: 0.35, mouthOpen: 0, blush: 0.35, pupil: 1 },
    happy: { brow: 0.35, browTilt: 0.1, eye: 0.95, squint: 0.3, happyEyes: 0, smile: 0.85, mouthOpen: 0.15, blush: 0.6, pupil: 1 },
    joy: { brow: 0.5, browTilt: 0.15, eye: 1, squint: 0, happyEyes: 1, smile: 1, mouthOpen: 0.55, blush: 0.8, pupil: 1 },
    surprised: { brow: 1, browTilt: 0.2, eye: 1.12, squint: 0, happyEyes: 0, smile: 0, mouthOpen: 0.45, blush: 0.4, pupil: 0.8 },
    thinking: { brow: 0.15, browTilt: -0.35, eye: 0.85, squint: 0.2, happyEyes: 0, smile: 0.05, mouthOpen: 0, blush: 0.3, pupil: 1 },
    concerned: { brow: 0.1, browTilt: 0.7, eye: 0.95, squint: 0.1, happyEyes: 0, smile: -0.25, mouthOpen: 0, blush: 0.3, pupil: 1 },
    smug: { brow: -0.1, browTilt: -0.2, eye: 0.8, squint: 0.35, happyEyes: 0, smile: 0.7, mouthOpen: 0, blush: 0.5, pupil: 1 },
    wink: { brow: 0.3, browTilt: 0.1, eye: 1, squint: 0.2, happyEyes: 0, smile: 0.9, mouthOpen: 0.2, blush: 0.7, pupil: 1, winkR: 1 },
  };
  const EXPR_KEYS = ["brow", "browTilt", "eye", "squint", "happyEyes", "smile", "mouthOpen", "blush", "pupil", "winkL", "winkR"];

  // --------------------------------------------------------- temperament --
  // Motion constants of the reference avatar; an avatar overrides any of them.
  const TEMPERAMENT = {
    lipKernel: 0.035, // coarticulation half-width (s)
    lipGain: 1.3, // jaw gain when loudness is known
    blinkFirst: [0.8, 1.5], // first blink at a + rnd * b (s)
    blinkEvery: [2.2, 3.4], // blink interval a + rnd * b (s)
    blinkDouble: 0.18, // chance of a double blink
    blinkDoubleGap: 0.32, // gap of a double blink (s)
    sway: 2.2, // head roll from noise (degrees)
    swayGaze: 2.5, // head roll towards the gaze (degrees)
    nod: 3, // head nod from noise (base units)
    nodRate: 1.3,
    talkNod: 4, // head nod from speech energy (base units)
    talkNodRate: 9.5,
    shift: 6, // sideways head shift from noise (base units)
    shiftGaze: 8, // sideways head shift towards the gaze (base units)
    yawGaze: 0.6, // fake head turn towards the gaze (-1..1)
    yawNoise: 0.25,
    yawNoiseRate: 0.7,
    gazeBlend: 0.18, // gaze change duration (s)
    saccadeStep: 0.9, // micro-saccade period (s)
    saccadeX: 0.12,
    saccadeY: 0.08,
    breathPeriod: 4.2, // seconds per breath
    lag: 0.18, // delay of hair and accessories behind the head (s)
  };

  // Gestures without a duration last this long (s).
  const GESTURE_DUR = 1.8;

  // Moods merged per mood and per parameter: later tables win.
  function mergeMoods(over) {
    const out = {};
    for (const name in MOODS) out[name] = Object.assign({}, MOODS[name]);
    for (const name in over || {}) out[name] = Object.assign({}, out[name] || {}, over[name]);
    return out;
  }

  // -------------------------------------------------------------- tracks --
  // speech: one segment or an array of segments, each
  //   { offset, visemes: [[start, end, viseme, weight?], ...], envelope?: {fps, values} }
  // with viseme/envelope times relative to the segment's offset (seconds).
  // expressions: [{ t, name, blend? }]  gaze: [{ t, x, y }]  (x,y in -1..1)
  // gestures: [{ t, name, dur? }]
  function normalizeTracks(opts) {
    let segs = opts.speech || [];
    if (!Array.isArray(segs)) segs = [segs];
    const vis = [];
    const envs = [];
    for (const seg of segs) {
      const off = seg.offset || 0;
      for (const v of seg.visemes || []) {
        vis.push({ s: v[0] + off, e: v[1] + off, v: VISEMES[v[2]] ? v[2] : "sil", w: v[3] == null ? 1 : v[3] });
      }
      if (seg.envelope) envs.push({ off, fps: seg.envelope.fps, values: seg.envelope.values });
    }
    vis.sort((a, b) => a.s - b.s);
    envs.sort((a, b) => a.off - b.off);
    const expr = (opts.expressions || [{ t: 0, name: "neutral" }]).slice().sort((a, b) => a.t - b.t);
    if (!expr.length || expr[0].t > 0) expr.unshift({ t: 0, name: "neutral" });
    const gaze = (opts.gaze || [{ t: 0, x: 0, y: 0 }]).slice().sort((a, b) => a.t - b.t);
    if (!gaze.length || gaze[0].t > 0) gaze.unshift({ t: 0, x: 0, y: 0 });
    const gestures = (opts.gestures || []).slice().sort((a, b) => a.t - b.t);
    return { vis, envs, expr, gaze, gestures };
  }

  // Blink schedule: seeded intervals, occasional double blinks.
  function blinkTimes(seed, until, T) {
    const rnd = mulberry32(seed ^ 0x9e3779b9);
    const out = [];
    let t = T.blinkFirst[0] + rnd() * T.blinkFirst[1];
    while (t < until) {
      out.push(t);
      if (rnd() < T.blinkDouble) out.push(t + T.blinkDoubleGap);
      t += T.blinkEvery[0] + rnd() * T.blinkEvery[1];
    }
    return out;
  }

  function blinkAmount(times, t) {
    // 0 = open, 1 = closed. 70ms close, 40ms hold, 110ms open.
    let best = 0;
    for (let i = 0; i < times.length; i++) {
      const d = t - times[i];
      if (d < -0.1) break;
      if (d < 0 || d > 0.22) continue;
      const v = d < 0.07 ? d / 0.07 : d < 0.11 ? 1 : 1 - (d - 0.11) / 0.11;
      best = Math.max(best, v);
    }
    return best;
  }

  // ------------------------------------------------------------ instance --
  function create(opts) {
    opts = opts || {};
    const T = Object.assign({}, TEMPERAMENT, opts.temperament || {});
    const moods = mergeMoods(opts.moods);
    const seed = opts.seed == null ? 7 : opts.seed;
    const tracks = normalizeTracks(opts);
    const blinks = blinkTimes(seed, opts.maxDuration || 600, T);
    const nSway = makeNoise(seed + 1);
    const nNod = makeNoise(seed + 2);
    const nShift = makeNoise(seed + 3);
    const nGazeX = makeNoise(seed + 4);
    const nGazeY = makeNoise(seed + 5);

    function envelopeAt(t) {
      // Loudness 0..1 from whichever segment covers t (smoothed over ±30ms).
      for (let k = tracks.envs.length - 1; k >= 0; k--) {
        const env = tracks.envs[k];
        if (env.off > t) continue;
        const i = Math.floor((t - env.off) * env.fps);
        if (i - 3 >= env.values.length) return null;
        let s = 0;
        let n = 0;
        for (let j = i - 3; j <= i + 3; j++) {
          if (j >= 0 && j < env.values.length) {
            s += env.values[j];
            n++;
          }
        }
        return n ? s / n : 0;
      }
      return null;
    }

    // Viseme params at time t via triangular-kernel coarticulation.
    function mouthAt(t) {
      const ts = t;
      const h = T.lipKernel;
      const out = { open: 0, wide: 0, round: 0, teeth: 0 };
      let wsum = 0;
      const lo = ts - h;
      const hi = ts + h;
      let covered = 0;
      for (const seg of tracks.vis) {
        if (seg.e <= lo) continue;
        if (seg.s >= hi) break;
        const a = Math.max(seg.s, lo);
        const b = Math.min(seg.e, hi);
        // Integral of the triangular kernel over [a,b] approximated at 3 points.
        const k = (x) => Math.max(0, 1 - Math.abs(x - ts) / h);
        const w = ((b - a) / 6) * (k(a) + 4 * k((a + b) / 2) + k(b));
        if (w <= 0) continue;
        covered += b - a;
        const p = VISEMES[seg.v];
        out.open += p.open * seg.w * w;
        out.wide += p.wide * w;
        out.round += p.round * w;
        out.teeth += p.teeth * w;
        wsum += w;
      }
      const silW = Math.max(0, 2 * h - covered) / 2; // gaps count as silence
      const sil = VISEMES.sil;
      out.wide += sil.wide * silW;
      wsum += silW;
      if (wsum > 0) {
        out.open /= wsum;
        out.wide /= wsum;
        out.round /= wsum;
        out.teeth /= wsum;
      }
      let energy = envelopeAt(ts);
      if (energy != null) {
        out.open *= (0.5 + 0.8 * clamp(energy, 0, 1)) * T.lipGain;
      } else {
        energy = out.open;
      }
      out.energy = energy;
      return out;
    }

    // Expression parameters: the current mood, blended in from the previous one.
    function exprAt(t) {
      const ex = tracks.expr;
      let i = 0;
      while (i + 1 < ex.length && ex[i + 1].t <= t) i++;
      const cur = Object.assign({}, moods.neutral, moods[ex[i].name] || {});
      if (i === 0) {
        for (const key of EXPR_KEYS) if (cur[key] == null) cur[key] = 0;
        return cur;
      }
      const prev = Object.assign({}, moods.neutral, moods[ex[i - 1].name] || {});
      const k = smooth((t - ex[i].t) / (ex[i].blend || 0.3));
      const out = {};
      for (const key of EXPR_KEYS) out[key] = lerp(prev[key] || 0, cur[key] || 0, k);
      return out;
    }

    function gazeAt(t) {
      const gz = tracks.gaze;
      let i = 0;
      while (i + 1 < gz.length && gz[i + 1].t <= t) i++;
      let x = gz[i].x;
      let y = gz[i].y;
      if (i > 0) {
        const k = smooth((t - gz[i].t) / T.gazeBlend);
        x = lerp(gz[i - 1].x, x, k);
        y = lerp(gz[i - 1].y, y, k);
      }
      // Micro-saccades: stepped noise sampled every ~0.9s, eased quickly.
      const step = T.saccadeStep;
      const n0 = Math.floor(t / step);
      const k2 = smooth((t - n0 * step) / 0.08);
      const mx = lerp(nGazeX(n0 * step * 3.1), nGazeX((n0 + 1) * step * 3.1), k2) * T.saccadeX;
      const my = lerp(nGazeY(n0 * step * 2.7), nGazeY((n0 + 1) * step * 2.7), k2) * T.saccadeY;
      return { x: clamp(x + mx, -1, 1), y: clamp(y + my, -1, 1) };
    }

    // Head: roll (degrees), shift and nod (base units), fake yaw (-1..1).
    function headAt(t) {
      const m = mouthAt(t);
      const gz = gazeAt(t);
      const talk = m.energy;
      const sway = nSway(t) * T.sway + gz.x * T.swayGaze;
      const nod = nNod(t * T.nodRate) * T.nod + talk * T.talkNod * Math.max(0, Math.sin(t * T.talkNodRate));
      const shift = nShift(t) * T.shift + gz.x * T.shiftGaze;
      return { rot: sway, y: nod, x: shift, yaw: clamp(gz.x * T.yawGaze + nShift(t * T.yawNoiseRate) * T.yawNoise, -1, 1) };
    }

    // Active gestures: d is the time since the gesture started.
    function gesturesAt(t) {
      const out = [];
      for (const g of tracks.gestures) {
        const dur = g.dur || GESTURE_DUR;
        const d = t - g.t;
        if (d < 0 || d > dur) continue;
        out.push({ name: g.name, t: g.t, dur, d });
      }
      return out;
    }

    function poseAt(t) {
      t = Math.max(0, t);
      return {
        t,
        expr: exprAt(t),
        mouth: mouthAt(t),
        gaze: gazeAt(t),
        head: headAt(t),
        headLag: headAt(Math.max(0, t - T.lag)),
        breath: Math.sin((t / T.breathPeriod) * Math.PI * 2),
        blink: blinkAmount(blinks, t),
        gestures: gesturesAt(t),
      };
    }

    return { poseAt, mouthAt, exprAt, gazeAt, headAt, tracks };
  }

  A.performer = { create, VISEMES, MOODS, EXPR_KEYS, TEMPERAMENT };
})(typeof window !== "undefined" ? window : globalThis);
