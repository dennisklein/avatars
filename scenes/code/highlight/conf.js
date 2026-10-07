// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// key=value configuration files: keys (k) and # comments (c).
(function (global) {
  "use strict";
  const H = global.Avatars.highlight;
  const { esc, span, splitComment } = H;

  H.register("conf", function conf(l) {
    const [code, com] = splitComment(l, /(^|\s)#/);
    const body = esc(code).replace(/(^|\s)([A-Za-z][\w.]*)=/g, '$1<span class="k">$2</span>=');
    return body + span("c", com);
  });
})(typeof window !== "undefined" ? window : globalThis);
