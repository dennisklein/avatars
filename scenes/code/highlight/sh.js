// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Shell: quoted strings (s) and # comments (c).
(function (global) {
  "use strict";
  const H = global.Avatars.highlight;
  const { esc, span, splitComment } = H;

  H.register("sh", function sh(l) {
    const [code, com] = splitComment(l, /(^|\s)#/);
    const body = code
      .split(/('[^']*'|"[^"]*")/)
      .map((p, i) => (i % 2 ? span("s", p) : esc(p)))
      .join("");
    return body + span("c", com);
  });
})(typeof window !== "undefined" ? window : globalThis);
