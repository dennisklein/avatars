// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Design tokens at runtime: the episode's resolved, flat token map
// (Avatars.data.tokens, written by `avatars vendor`). CSS reads the same
// tokens as custom properties (--av-<name>); scripts use these accessors where
// GSAP and SVG attributes need concrete numbers and colours.
//
//   Avatars.tokens.get("color.bg")              -> "#0f172a"
//   Avatars.tokens.num("window.bar-height")     -> 58
//   Avatars.tokens.color("diagram.pulse", 0.75) -> "rgba(94, 234, 212, 0.75)"
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  // Read lazily, so a page or a test may set Avatars.data after this file.
  const all = () => (A.data && A.data.tokens) || {};
  const has = (name) => Object.prototype.hasOwnProperty.call(all(), name);

  function get(name) {
    if (!has(name)) throw new Error(`token "${name}" is not defined`);
    return all()[name];
  }

  // A number from a token: 0.7 -> 0.7, "26px" -> 26.
  function num(name) {
    const v = get(name);
    const n = typeof v === "number" ? v : parseFloat(v);
    if (!Number.isFinite(n)) throw new Error(`token "${name}" is "${v}", not a number`);
    return n;
  }

  // CSS colours as the CLI writes them: hex (3, 4, 6 or 8 digits), rgb(),
  // rgba() and the keywords black, white and transparent.
  function parse(s) {
    const str = String(s).trim();
    let m = /^#([0-9a-f]{3,8})$/i.exec(str);
    if (m) {
      let hex = m[1];
      if (hex.length === 3 || hex.length === 4) hex = hex.replace(/./g, (c) => c + c);
      if (hex.length !== 6 && hex.length !== 8) return null;
      const n = (i) => parseInt(hex.slice(i, i + 2), 16);
      return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? Math.round((n(6) / 255) * 1000) / 1000 : 1 };
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(str);
    if (m) {
      const a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      return { r: +m[1], g: +m[2], b: +m[3], a };
    }
    const k = str.toLowerCase();
    if (k === "black") return { r: 0, g: 0, b: 0, a: 1 };
    if (k === "white") return { r: 255, g: 255, b: 255, a: 1 };
    if (k === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    return null;
  }

  // A colour token as "rgba(r, g, b, a)", with its own alpha unless one is given.
  function color(name, alpha) {
    const v = get(name);
    const c = parse(v);
    if (!c) throw new Error(`token "${name}" is "${v}", not a colour`);
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha == null ? c.a : alpha})`;
  }

  A.tokens = {
    get,
    num,
    color,
    has,
    parse,
    get values() {
      return all();
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
