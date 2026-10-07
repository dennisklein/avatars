// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// The SVG rig: one <svg> per presenter, sized to the base canvas. It builds
// the layer tree of the member's base, then every part in cast order, and
// draws a pose per frame: the base sets the bone transforms, every part
// updates its own nodes. Frames are pure functions of the pose, so they
// render in any order.
//
//   const view = Avatars.rigs.svg.create(container, member, performer);
//   view.render(3.2);
//
// This file also holds the registries that base.js and part.js files fill;
// it loads before them.
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});
  const NS = "http://www.w3.org/2000/svg";

  function registry(kind) {
    const items = {};
    return {
      register(id, impl) {
        items[id] = impl;
      },
      get(id) {
        if (!items[id]) throw new Error(`${kind} "${id}" is not loaded; is it in the cast of this episode?`);
        return items[id];
      },
    };
  }
  A.bases = A.bases || registry("base");
  A.parts = A.parts || registry("part");

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  // Ids are unique per presenter instance, so several presenters (a sheet,
  // a cast of two) can share a page.
  let instanceCount = 0;
  const slug = (s) => String(s).replace(/[^A-Za-z0-9_-]+/g, "-");

  function create(container, member, performer) {
    const data = A.data || {};
    const base = (data.bases || {})[member.base];
    if (!base) throw new Error(`base "${member.base}" of ${member.avatar} is not in Avatars.data.bases`);
    const baseImpl = A.bases.get(member.base);
    const marks = (data.brand && data.brand.marks) || {};
    const pid = `${slug(member.avatar || "avatar")}${instanceCount++}`;

    const svg = el("svg", { viewBox: `0 0 ${base.canvas[0]} ${base.canvas[1]}`, width: "100%", height: "100%", "aria-label": member.name || member.avatar }, null);
    svg.style.overflow = "visible";
    const defs = el("defs", {}, svg);

    // The clip paths the base's layers use (base.json "clips"); a part fills them.
    const clips = {};
    const clip = (name) => clips[name] || (clips[name] = el("clipPath", { id: `${pid}-clip-${slug(name)}` }, defs));

    // The base builds its bones and slot groups; it keeps what apply needs on ctx.
    const baseCtx = {
      svg,
      defs,
      el,
      id: (name) => `${pid}-base-${name}`,
      url: (name) => `url(#${pid}-base-${name})`,
      clip,
      math: A.math,
      base,
      member,
    };
    const slots = baseImpl.layers(baseCtx) || {};
    const detached = {};
    const slot = (name) => slots[name] || detached[name] || (detached[name] = el("g", {}, null));
    for (const name of member.hidden || []) if (slots[name]) slots[name].setAttribute("display", "none");

    const palette = member.palette || {};
    const parts = [];
    for (const entry of member.parts || []) {
      const impl = A.parts.get(entry.id);
      const scope = `${pid}-${slug(entry.id)}`;
      const ctx = {
        slot,
        el,
        defs,
        id: (name) => `${scope}-${name}`,
        url: (name) => `url(#${scope}-${name})`,
        clip,
        color(role) {
          if (!(role in palette)) throw new Error(`part ${entry.id} paints with role "${role}", which ${member.avatar}/${member.look} does not set`);
          return palette[role];
        },
        mark: (name) => marks[name] || null,
        options: entry.options || {},
        math: A.math,
        base,
      };
      const state = impl.build ? impl.build(ctx) : undefined;
      parts.push({ impl, ctx, state });
    }

    function render(t) {
      const pose = performer.poseAt(t);
      if (baseImpl.apply) baseImpl.apply(baseCtx, pose);
      for (const p of parts) if (p.impl.update) p.impl.update(p.ctx, pose, p.state);
    }

    container.appendChild(svg);
    render(0);
    return { render, svg };
  }

  A.rigs = A.rigs || {};
  A.rigs.svg = { create };
})(typeof window !== "undefined" ? window : globalThis);
