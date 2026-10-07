// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// C: preprocessor lines and keywords (w), function names (k), strings (s)
// and // comments (c).
(function (global) {
  "use strict";
  const H = global.Avatars.highlight;
  const { esc, span, splitComment } = H;

  H.register("c", function c(l) {
    if (/^\s*#/.test(l)) return span("w", l);
    const [code, com] = splitComment(l, /\/\//);
    const body = code
      .split(/("[^"]*")/)
      .map((p, i) =>
        i % 2
          ? span("s", p)
          : esc(p)
              .replace(/\b(int|char|void|return|if|else|for|while|const|struct|unsigned|long|double|float)\b/g, '<span class="w">$1</span>')
              .replace(/\b([A-Za-z_]\w*)(?=\()/g, '<span class="k">$1</span>')
      )
      .join("");
    return body + span("c", com);
  });
})(typeof window !== "undefined" ? window : globalThis);
