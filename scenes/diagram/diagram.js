// SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
// SPDX-License-Identifier: Apache-2.0
// Diagram scene: a box-and-arrow diagram on the slide frame. Nodes sit on a
// grid over the area below the title (`pos: [col, row]`, fractions allowed),
// groups draw a labelled box around nodes, and edges connect nodes or groups.
// Every item appears at its cue word (`at`) and the presenter glances at it;
// edges draw themselves from start to end. `svg` with `reveal` covers
// anything the boxes cannot: raw SVG fitted into the area, whose elements
// (CSS selectors) fade in or draw (`draw: true`) on their cues.
//
// Geometry (areas per shot, node metrics) comes from the format:
// format.json "scenes.diagram".
(function (global) {
  "use strict";
  const A = (global.Avatars = global.Avatars || {});

  A.scenes.register("diagram", function diagram(ctx, o) {
    const { tl, h, svg } = ctx;
    const T = ctx.tokens;
    const G = ctx.format.scenes.diagram;
    const NODE = G.node;
    const W = ctx.format.width;
    const H = ctx.format.height;
    const f = ctx.slideFrame("diagram", o);
    const el = f.el;
    const sid = el.id;
    // The area below the title, clear of the captions and of the presenter's
    // bubble; with a small bubble ("mini") or none ("hidden") it is wider.
    const area = G.areas[ctx.shot] || G.areas.wide;
    const name = o.title || o.chapter || sid;
    const box = {}; // id -> { x, y, w, h }: center and size of a node or group
    const r1 = (v) => Math.round(v * 10) / 10;

    const art = o.svg ? h("div", { class: "diagram-art", html: o.svg, style: `left:${area.x}px;top:${area.y}px;width:${area.w}px;height:${area.h}px` }) : null;
    const defs = svg("defs");
    const layer = svg("svg", { class: "dlines", width: W, height: H, viewBox: `0 0 ${W} ${H}` }, [defs]);
    el.append(...[art, layer].filter(Boolean));
    for (const [suffix, color] of [["", T.get("diagram.edge")], ["-accent", T.get("diagram.edge-accent")]])
      defs.append(svg("marker", { id: `${sid}-arrow${suffix}`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 4.5, markerHeight: 4.5, orient: "auto-start-reverse" }, [svg("path", { d: "M0,0 L10,5 L0,10 z", fill: color })]));

    // Nodes (a node with a second line is taller).
    const nodes = (o.nodes || []).map((n, i) => Object.assign({ id: `n${i}`, pos: [i, 0] }, n));
    const cols = (o.grid && o.grid[0]) || Math.max(1, ...nodes.map((n) => Math.floor(n.pos[0]) + 1));
    const rows = (o.grid && o.grid[1]) || Math.max(1, ...nodes.map((n) => Math.floor(n.pos[1]) + 1));
    const items = [];
    for (const n of nodes) {
      const w = n.width || o.nodeWidth || NODE.width;
      const ht = n.text ? NODE.tall : NODE.height;
      const b = { x: area.x + ((n.pos[0] + 0.5) * area.w) / cols, y: area.y + ((n.pos[1] + 0.5) * area.h) / rows, w, h: ht };
      box[n.id] = b;
      const node = h("div", { class: "dnode" + (n.accent ? " accent" : "") + (n.ghost ? " ghost" : ""), style: `left:${r1(b.x - w / 2)}px;top:${r1(b.y - ht / 2)}px;width:${w}px;height:${ht}px` }, [
        n.icon === false ? null : ctx.icon(n.icon || "nodes"),
        h("div", { class: "txt" }, [h("div", { class: "t1", text: n.title || n.id }), n.text ? h("div", { class: n.code ? "t2 code" : "t2", text: n.text }) : null]),
      ]);
      n.el = node;
      items.push({ kind: "node", spec: n, els: [node], x: b.x, y: b.y });
    }

    // Groups: drawn behind the nodes, labelled in their top-left corner.
    const groupRadius = T.num("diagram.group-radius");
    const groups = (o.groups || []).map((g) => {
      const members = (g.around || []).map(
        (id) =>
          box[id] ||
          (() => {
            throw new Error(`diagram "${name}": group "${g.label || g.id}" names no node "${id}"`);
          })()
      );
      const pad = g.pad != null ? g.pad : NODE.pad;
      const x0 = Math.min(...members.map((b) => b.x - b.w / 2)) - pad;
      const x1 = Math.max(...members.map((b) => b.x + b.w / 2)) + pad;
      const y0 = Math.min(...members.map((b) => b.y - b.h / 2)) - pad - (g.label ? NODE.label : 0);
      const y1 = Math.max(...members.map((b) => b.y + b.h / 2)) + pad;
      const b = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
      if (g.id) box[g.id] = b;
      const rect = svg("rect", { class: "dgroup" + (g.accent ? " accent" : ""), x: r1(x0), y: r1(y0), width: r1(x1 - x0), height: r1(y1 - y0), rx: groupRadius });
      const label = g.label ? h("div", { class: "dgroup-label", text: g.label, style: `left:${r1(x0 + G.groupLabel[0])}px;top:${r1(y0 + G.groupLabel[1])}px` }) : null;
      return { kind: "group", spec: g, els: [rect, label].filter(Boolean), x: b.x, y: b.y, rect, label, b };
    });
    for (const g of groups) layer.insertBefore(g.rect, defs.nextSibling);

    // Edges: straight, or bent sideways by `bend` pixels, from border to border.
    const exit = (b, tx, ty, gap) => {
      const dx = tx - b.x;
      const dy = ty - b.y;
      if (!dx && !dy) return [r1(b.x), r1(b.y)];
      const k = Math.min(dx ? (b.w / 2 + gap) / Math.abs(dx) : Infinity, dy ? (b.h / 2 + gap) / Math.abs(dy) : Infinity);
      return [r1(b.x + dx * k), r1(b.y + dy * k)];
    };
    const edges = (o.edges || []).map((e, i) => {
      const a = box[e.from];
      const b = box[e.to];
      if (!a || !b) throw new Error(`diagram "${name}": edge ${e.from} → ${e.to} names no node or group "${a ? e.to : e.from}"`);
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const bend = e.bend || 0;
      const q = [(a.x + b.x) / 2 - ((b.y - a.y) / len) * bend, (a.y + b.y) / 2 + ((b.x - a.x) / len) * bend];
      const p0 = exit(a, q[0], q[1], G.edgeGap[0]);
      const p1 = exit(b, q[0], q[1], G.edgeGap[1]);
      const d = bend ? `M${p0} Q${r1(q[0])},${r1(q[1])} ${p1}` : `M${p0} L${p1}`;
      const marker = `url(#${sid}-arrow${e.accent ? "-accent" : ""})`;
      const arrow = e.arrow || "end";
      const path = svg("path", { d, class: "dedge" + (e.dashed ? " dashed" : "") + (e.accent ? " accent" : ""), mask: `url(#${sid}-m${i})` });
      if (arrow === "end" || arrow === "both") path.setAttribute("marker-end", marker);
      if (arrow === "start" || arrow === "both") path.setAttribute("marker-start", marker);
      // The edge draws itself: a wide mask stroke grows along it.
      const grow = svg("path", { d, class: "dreveal" });
      defs.append(svg("mask", { id: `${sid}-m${i}`, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: W, height: H }, [grow]));
      layer.append(path);
      const L = path.getTotalLength();
      grow.setAttribute("stroke-dasharray", `${r1(L)} ${r1(L + 40)}`);
      grow.setAttribute("stroke-dashoffset", r1(L + 20));
      const mid = bend ? [0.25 * p0[0] + 0.5 * q[0] + 0.25 * p1[0], 0.25 * p0[1] + 0.5 * q[1] + 0.25 * p1[1]] : [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      const label = e.label ? h("div", { class: "dlabel-at", style: `left:${r1(mid[0])}px;top:${r1(mid[1])}px` }, [h("span", { class: "dlabel", text: e.label })]) : null;
      return { kind: "edge", spec: e, els: label ? [label] : [], x: mid[0], y: mid[1], grow, label, L };
    });

    // HTML above the SVG layer: group labels, nodes, edge labels.
    el.append(...groups.map((g) => g.label).filter(Boolean), ...items.map((it) => it.els[0]), ...edges.map((e) => e.label).filter(Boolean));

    // Raw SVG elements revealed on cue.
    const reveals = (o.reveal || []).map((r) => {
      const targets = art ? [...art.querySelectorAll(r.el)] : [];
      if (!targets.length) throw new Error(`diagram "${name}": reveal "${r.el}" matches nothing in its svg`);
      if (r.draw)
        for (const t of targets) {
          const L = t.getTotalLength ? t.getTotalLength() : 0;
          t.style.strokeDasharray = `${r1(L)} ${r1(L + 10)}`;
          t.style.strokeDashoffset = r1(L);
          t.__len = L;
        }
      return { kind: "reveal", spec: r, els: targets, x: null, y: null };
    });

    // Overlaps and boxes outside the area show up as console warnings.
    const [sx, sy] = G.slack;
    const out = (id, b) => b.x - b.w / 2 < area.x - sx || b.x + b.w / 2 > area.x + area.w + sx || b.y - b.h / 2 < area.y - sy || b.y + b.h / 2 > area.y + area.h + sy;
    const hit = (a, b, m) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + m && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + m;
    const inside = (a, b) => a.x - a.w / 2 >= b.x - b.w / 2 && a.x + a.w / 2 <= b.x + b.w / 2 && a.y - a.h / 2 >= b.y - b.h / 2 && a.y + a.h / 2 <= b.y + b.h / 2;
    nodes.forEach((n, i) => {
      if (out(n.id, box[n.id])) console.warn(`diagram "${name}": node "${n.id}" reaches outside the diagram area; change the grid, pos or width`);
      for (const m of nodes.slice(i + 1)) if (hit(box[n.id], box[m.id], 16)) console.warn(`diagram "${name}": nodes "${n.id}" and "${m.id}" overlap; spread the grid or narrow the nodes`);
    });
    groups.forEach((g, i) => {
      if (out(null, g.b)) console.warn(`diagram "${name}": group "${g.spec.label || g.spec.id}" reaches outside the diagram area`);
      for (const k of groups.slice(i + 1))
        if (hit(g.b, k.b, 12) && !inside(g.b, k.b) && !inside(k.b, g.b)) console.warn(`diagram "${name}": groups "${g.spec.label || g.spec.id}" and "${k.spec.label || k.spec.id}" overlap`);
    });

    // Narrate, then schedule: groups, nodes, edges, raw elements.
    const all = [...groups, ...items, ...edges, ...reveals];
    for (const it of all) for (const e of it.els) tl.set(e, { opacity: 0 }, 0);
    f.narrate();
    const center = ctx.format.shots[ctx.shot] && ctx.format.shots[ctx.shot].frame;
    const glanceAt = (it, at) => {
      if (it.spec.at == null) return;
      if (it.x == null || !center) return ctx.glance(at);
      const cx = center.left + center.width / 2;
      const cy = center.top + center.height / 2;
      ctx.glance(at, 0.8, Math.max(-0.9, Math.min(0.9, (it.x - cx) / 1400)), Math.max(-0.5, Math.min(0.3, (it.y - cy) / 900)));
    };
    all.forEach((it, i) => {
      const at = f.cue(it.spec, i);
      if (it.kind === "group") {
        tl.fromTo(it.els, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.out" }, at);
      } else if (it.kind === "node") {
        tl.fromTo(it.els, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.6)" }, at);
      } else if (it.kind === "edge") {
        tl.fromTo(it.grow, { attr: { "stroke-dashoffset": r1(it.L + 20) } }, { attr: { "stroke-dashoffset": 0 }, duration: Math.min(0.9, 0.35 + it.L / 1200), ease: "power2.inOut" }, at);
        if (it.label) tl.fromTo(it.label, { opacity: 0 }, { opacity: 1, duration: 0.35 }, at + 0.35);
      } else {
        tl.fromTo(it.els, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" }, at);
        for (const t of it.spec.draw ? it.els : []) tl.fromTo(t, { strokeDashoffset: r1(t.__len) }, { strokeDashoffset: 0, duration: Math.min(1.2, 0.4 + t.__len / 1000), ease: "power2.inOut" }, at);
      }
      glanceAt(it, at);
    });

    // Pulses: a node (or raw element) swells and rings once at its cue.
    for (const p of o.pulse || []) {
      const at = ctx.time(p.at);
      const node = p.node != null ? nodes.find((n) => n.id === p.node) : null;
      const targets = node ? [node.el] : art && p.el ? [...art.querySelectorAll(p.el)] : [];
      if (!targets.length) throw new Error(`diagram "${name}": pulse names no node "${p.node || p.el}"`);
      tl.fromTo(targets, { scale: 1 }, { scale: 1.07, duration: 0.2, yoyo: true, repeat: 1, ease: "power2.out", transformOrigin: "50% 50%", immediateRender: false }, at);
      if (node) {
        const base = T.get(node.ghost ? "diagram.ghost-shadow" : "diagram.node-shadow");
        tl.fromTo(node.el, { boxShadow: `${base}, 0 0 0 0px ${T.color("diagram.pulse", 0.75)}` }, { boxShadow: `${base}, 0 0 0 18px ${T.color("diagram.pulse", 0)}`, duration: 0.8, ease: "power2.out", immediateRender: false }, at);
        const b = box[node.id];
        glanceAt({ spec: p, x: b.x, y: b.y }, at);
      }
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
