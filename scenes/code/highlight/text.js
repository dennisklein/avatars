// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Plain text: escaped, no colours. Also the fallback for unknown languages.
(function (global) {
  "use strict";
  const H = global.Avatars.highlight;

  H.register("text", H.esc);
})(typeof window !== "undefined" ? window : globalThis);
