// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Design tokens: merge token trees in tier order, resolve aliases and alpha,
// and emit CSS custom properties and a flat map for the runtime.
//
//   const tokens = compile([{ tree, source }, ...]);   // later trees override earlier ones
//   tokens.values["color.bg"]                          // "#0f172a"
//   toCss(tokens.values)                               // ":root { --av-color-bg: #0f172a; ... }"

const ALIAS = /^\{([^{}]+)\}$/;

// Walk a token tree into name -> token entries. Keys starting with "$" in a
// group are group metadata, keys starting with "_" comments; an object with
// "$value" is a token.
export function flatten(tree, source, prefix = [], out = new Map()) {
  for (const [key, node] of Object.entries(tree || {})) {
    if (key.startsWith("$") || key.startsWith("_")) continue;
    if (node === null || typeof node !== "object" || Array.isArray(node)) {
      throw new Error(`${source}: ${[...prefix, key].join(".")} is not a token or group`);
    }
    const name = [...prefix, key].join(".");
    if (Object.prototype.hasOwnProperty.call(node, "$value")) {
      const ext = (node.$extensions && node.$extensions.avatars) || {};
      out.set(name, { value: node.$value, alpha: ext.alpha, type: node.$type, source });
    } else {
      flatten(node, source, [...prefix, key], out);
    }
  }
  return out;
}

// Merge sources ({ tree, source }) in order; a later token replaces an earlier one.
export function merge(sources) {
  const all = new Map();
  for (const { tree, source } of sources) {
    for (const [name, tok] of flatten(tree, source)) all.set(name, tok);
  }
  return all;
}

export function parseColor(s) {
  const str = String(s).trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(str);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? Math.round((n(6) / 255) * 1000) / 1000 : 1 };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(str);
  if (m) {
    let a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  if (/^(black|white|transparent)$/i.test(str)) {
    const k = str.toLowerCase();
    return k === "black" ? { r: 0, g: 0, b: 0, a: 1 } : k === "white" ? { r: 255, g: 255, b: 255, a: 1 } : { r: 0, g: 0, b: 0, a: 0 };
  }
  return null;
}

export function rgba(c, alpha) {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha == null ? c.a : alpha})`;
}

// Resolve every token: aliases (whole-value "{name}") and the alpha extension.
export function resolve(all) {
  const values = {};
  const resolving = new Set();
  const get = (name, from) => {
    if (Object.prototype.hasOwnProperty.call(values, name)) return values[name];
    const tok = all.get(name);
    if (!tok) throw new Error(`token "${name}" is not defined${from ? ` (referenced by ${from})` : ""}`);
    if (resolving.has(name)) throw new Error(`token alias cycle: ${[...resolving, name].join(" -> ")}`);
    resolving.add(name);
    let v = tok.value;
    const m = typeof v === "string" ? ALIAS.exec(v) : null;
    if (m) v = get(m[1].trim(), `${name} in ${tok.source}`);
    if (tok.alpha != null) {
      const c = parseColor(v);
      if (!c) throw new Error(`token "${name}" (${tok.source}) sets an alpha on "${v}", which is not a colour`);
      v = rgba(c, tok.alpha);
    }
    resolving.delete(name);
    values[name] = v;
    return v;
  };
  for (const name of all.keys()) get(name);
  // Stable order: sorted names.
  return Object.fromEntries(Object.keys(values).sort().map((k) => [k, values[k]]));
}

export function compile(sources) {
  const all = merge(sources);
  return { values: resolve(all), origins: Object.fromEntries([...all].map(([k, t]) => [k, t.source])) };
}

// A colour value or token reference ("{color.accent}") against resolved tokens.
export function resolveRef(value, values, what) {
  if (typeof value !== "string") return value;
  const m = ALIAS.exec(value);
  if (!m) return value;
  const name = m[1].trim();
  if (!Object.prototype.hasOwnProperty.call(values, name)) throw new Error(`${what || "value"}: token "${name}" is not defined`);
  return values[name];
}

export const cssName = (name) => `--av-${name.replace(/\./g, "-")}`;

export function toCss(values) {
  const lines = Object.keys(values)
    .sort()
    .map((k) => `  ${cssName(k)}: ${values[k]};`);
  return `:root {\n${lines.join("\n")}\n}\n`;
}

// WCAG 2 contrast ratio of two colours (alpha composited over `over`, default black).
export function contrast(a, b, over) {
  const base = parseColor(over || "#000000");
  const solid = (c) => {
    const k = c.a;
    return { r: c.r * k + base.r * (1 - k), g: c.g * k + base.g * (1 - k), b: c.b * k + base.b * (1 - k) };
  };
  const lum = (c) => {
    const ch = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  };
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) throw new Error(`contrast needs colours, got "${a}" and "${b}"`);
  const bgSolid = solid(cb);
  const fg = { r: ca.r * ca.a + bgSolid.r * (1 - ca.a), g: ca.g * ca.a + bgSolid.g * (1 - ca.a), b: ca.b * ca.a + bgSolid.b * (1 - ca.a) };
  const l1 = lum(fg);
  const l2 = lum(bgSolid);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
