// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// JSON: object keys (k) and other strings (s).
(function (global) {
  "use strict";
  const H = global.Avatars.highlight;
  const { esc, span } = H;

  H.register("json", function json(l) {
    const parts = l.split(/("(?:[^"\\]|\\.)*")/);
    return parts.map((p, i) => (i % 2 ? span(/^\s*:/.test(parts[i + 1] || "") ? "k" : "s", p) : esc(p))).join("");
  });
})(typeof window !== "undefined" ? window : globalThis);
