// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Deterministic math for runtime code. Every frame is a pure function of
// timeline time, so randomness is seeded and noise is a sum of sines: any
// frame renders the same in any order, on any worker.
//
//   const { clamp, lerp, smooth, f1, mulberry32, makeNoise } = Avatars.math;
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  // Smoothstep of k clamped to 0..1.
  const smooth = (k) => {
    k = clamp(k, 0, 1);
    return k * k * (3 - 2 * k);
  };
  // One decimal: short, stable SVG attribute values.
  const f1 = (n) => Math.round(n * 10) / 10;

  // Seeded PRNG in [0, 1).
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Smooth deterministic 1D noise in [-1, 1]: a sum of detuned sines.
  function makeNoise(seed) {
    const rnd = mulberry32(seed);
    const waves = [0, 1, 2].map((i) => ({
      f: (0.11 + rnd() * 0.09) * (i + 1) * 1.7,
      p: rnd() * Math.PI * 2,
      a: 1 / (i + 1),
    }));
    const norm = waves.reduce((s, w) => s + w.a, 0);
    return (t) => waves.reduce((s, w) => s + w.a * Math.sin(t * w.f * Math.PI * 2 + w.p), 0) / norm;
  }

  A.math = { clamp, lerp, smooth, f1, mulberry32, makeNoise };
})(typeof window !== "undefined" ? window : globalThis);
