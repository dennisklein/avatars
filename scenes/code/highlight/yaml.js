// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// YAML: keys (k), list dashes (p) and # comments (c).
(function (global) {
  "use strict";
  const H = global.Avatars.highlight;
  const { esc, span, splitComment } = H;

  H.register("yaml", function yaml(l) {
    const [code, com] = splitComment(l, /(^|\s)#/);
    const m = /^(\s*)(- )?([\w.-]+:)(\s.*|)$/.exec(code);
    const d = /^(\s*)(- )(.*)$/.exec(code);
    const body = m ? esc(m[1]) + span("p", m[2]) + span("k", m[3]) + esc(m[4]) : d ? esc(d[1]) + span("p", d[2]) + esc(d[3]) : esc(code);
    return body + span("c", com);
  });
})(typeof window !== "undefined" ? window : globalThis);
