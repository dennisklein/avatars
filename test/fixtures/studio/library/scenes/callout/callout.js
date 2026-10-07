// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Fixture scene callout of the project library: one box of text next to the
// presenter in the corner, styled by the scene's own tokens.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.scenes.register("callout", function callout(ctx, o) {
    const { el } = ctx.begin("callout", o, { transition: "push", shot: "cornerR" });
    el.append(ctx.h("div", { class: "callout", text: o.text || "" }));
    ctx.say(o.say, "neutral");
  });
})(typeof window !== "undefined" ? window : globalThis);
