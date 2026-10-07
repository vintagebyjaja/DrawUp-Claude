/* DrawUp Draw V21 — elevations and sections generated from the plan model.
 *
 * A camera is a line on the plan (a → b) with a look direction. The viewer stands on the
 * line and looks to its left-hand normal n = (d.y, -d.x) where d is the unit vector a → b
 * (plan y runs down the sheet), so a → b always runs left → right in the view. "Flip"
 * swaps a and b. kind 'section' cuts everything the line crosses (cut walls are poured
 * and hatched) and shows what is beyond; kind 'elevation' cuts nothing and shows what is
 * in front of the line. Only what lies between a and b (and within depth, if set) is shown.
 *
 * Heights come from the model: wall height, opening sill and head, room ceiling, stair
 * rise. Nothing is stored: move the camera and the view is rebuilt.
 * View coordinates: x = u (inches along the camera), y = -z (z = height above the floor).
 * Works in the browser (window.DrawUpElev, needs DrawUpDrawCore) and in Node.
 */
(function (root) {
  'use strict';
  const NODE = typeof module === 'object' && module.exports;
  const core = () => (NODE ? require('./drawup-draw-core-v18.js') : root.DrawUpDrawCore);
  const EPS = 1e-6;
  const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y }), add = (p, q) => ({ x: p.x + q.x, y: p.y + q.y }), mul = (p, k) => ({ x: p.x * k, y: p.y * k });
  const len = p => Math.hypot(p.x, p.y), unit = p => { const l = len(p) || 1; return { x: p.x / l, y: p.y / l }; };
  const uid = () => 'cam_' + Math.random().toString(36).slice(2, 9);
  const ink = '#0d1b2a';

  /* ----------------------------------------------------------- cameras */
  function frame(cam) {
    const d = unit(sub(cam.b, cam.a)), L = len(sub(cam.b, cam.a)), n = { x: d.y, y: -d.x };
    return { d, n, L, U: p => (p.x - cam.a.x) * d.x + (p.y - cam.a.y) * d.y, W: p => (p.x - cam.a.x) * n.x + (p.y - cam.a.y) * n.y };
  }
  function planBox(m) {
    const C = core(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const take = p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); };
    m.walls.forEach(w => { const o = C.wallOutline(m, w); [o.outerA, o.outerB, o.innerA, o.innerB].forEach(take); });
    (m.items || []).forEach(it => { if (it.at) take(it.at); });
    if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 240, y1: 240 };
    return { x0, y0, x1, y1 };
  }
  /** Four exterior elevations around the building, 6'-0" out, each viewing the face it names. */
  function defaultElevations(m) {
    const b = planBox(m), off = 72, pad = 24;
    return [
      { name: 'NORTH', a: { x: b.x1 + pad, y: b.y0 - off }, b: { x: b.x0 - pad, y: b.y0 - off } },
      { name: 'EAST', a: { x: b.x1 + off, y: b.y1 + pad }, b: { x: b.x1 + off, y: b.y0 - pad } },
      { name: 'SOUTH', a: { x: b.x0 - pad, y: b.y1 + off }, b: { x: b.x1 + pad, y: b.y1 + off } },
      { name: 'WEST', a: { x: b.x0 - off, y: b.y0 - pad }, b: { x: b.x0 - off, y: b.y1 + pad } },
    ].map(e => ({ id: uid(), kind: 'elevation', name: e.name, a: e.a, b: e.b }));
  }
  /** A section across the middle of the building, looking north (up the sheet). */
  function defaultSection(m, name) {
    const b = planBox(m), pad = 36, y = Math.round((b.y0 + b.y1) / 2);
    return { id: uid(), kind: 'section', name: name || 'A', a: { x: b.x0 - pad, y }, b: { x: b.x1 + pad, y } };
  }
  function flip(cam) { const t = cam.a; cam.a = cam.b; cam.b = t; return cam; }
  function rotate(cam, deg) {
    const c = mul(add(cam.a, cam.b), 0.5), r = deg * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
    const rot = p => { const v = sub(p, c); return { x: Math.round(c.x + v.x * cs - v.y * sn), y: Math.round(c.y + v.x * sn + v.y * cs) }; };
    cam.a = rot(cam.a); cam.b = rot(cam.b); return cam;
  }
  function move(cam, dx, dy) { cam.a = { x: cam.a.x + dx, y: cam.a.y + dy }; cam.b = { x: cam.b.x + dx, y: cam.b.y + dy }; return cam; }
  /** Compass word for the look direction (plan north is up the sheet). */
  function facing(cam) { const n = frame(cam).n; return Math.abs(n.x) > Math.abs(n.y) ? (n.x > 0 ? 'EAST' : 'WEST') : (n.y > 0 ? 'SOUTH' : 'NORTH'); }
  function title(cam) { return cam.kind === 'section' ? 'SECTION ' + (cam.name || 'A') : (cam.name ? cam.name + ' ELEVATION' : 'ELEVATION') ; }

  /* ----------------------------------------------------------- geometry */
  /** Sutherland–Hodgman: keep the part of poly where f(p) >= k. */
  function clipHalf(poly, f, k) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], fp = f(p) - k, fq = f(q) - k;
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push({ u: p.u + (q.u - p.u) * t, w: p.w + (q.w - p.w) * t }); }
    }
    return out;
  }
  /** u-range where the polygon crosses the line w = 0. */
  function crossRange(poly) {
    const us = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      if (Math.abs(p.w) < EPS) us.push(p.u);
      if ((p.w > EPS && q.w < -EPS) || (p.w < -EPS && q.w > EPS)) us.push(p.u + (q.u - p.u) * (p.w / (p.w - q.w)));
    }
    return us.length >= 2 ? [Math.min(...us), Math.max(...us)] : null;
  }
  function segsCross(p1, p2, q1, q2) {
    const c = (a, b, d) => (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
    const d1 = c(q1, q2, p1), d2 = c(q1, q2, p2), d3 = c(p1, p2, q1), d4 = c(p1, p2, q2);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }
  /** Splits [0,h] by holes [[z0,z1]] into solid bands. */
  function bands(h, holes) {
    let out = [[0, h]];
    holes.forEach(([z0, z1]) => { const nx = []; out.forEach(([a, b]) => { if (z1 <= a || z0 >= b) { nx.push([a, b]); return; } if (z0 > a) nx.push([a, z0]); if (z1 < b) nx.push([z1, b]); }); out = nx; });
    return out.filter(([a, b]) => b - a > 0.01);
  }

  /* ----------------------------------------------------------- build */
  /**
   * Returns { cam, cuts, beyond, rooms, prims, bounds, levels, title }.
   * cuts: what the section line cuts ({type:'wall'|'column'|'stair', u0, u1, h, holes, id})
   * beyond: what is seen ({type, u0, u1, w, h, openings, id}), far to near.
   */
  function build(model, cam, scale, opts) {
    const C = core(); opts = opts || {}; scale = scale || 48;
    const m = C.normalizeModel(model), F = frame(cam), L = F.L, isCut = cam.kind === 'section';
    const depth = cam.depth > 0 ? cam.depth : Infinity;
    const toUW = p => ({ u: F.U(p), w: F.W(p) });
    const visiblePart = poly => {
      let q = clipHalf(poly, p => p.w, isCut ? EPS : 0); if (q.length < 3) return null;
      if (depth < Infinity) { q = clipHalf(q, p => -p.w, -depth); if (q.length < 3) return null; }
      q = clipHalf(q, p => p.u, 0); if (q.length < 3) return null;
      q = clipHalf(q, p => -p.u, -L); if (q.length < 3) return null;
      const us = q.map(p => p.u), ws = q.map(p => p.w);
      return { u0: Math.min(...us), u1: Math.max(...us), w: Math.min(...ws) };
    };
    const cutPart = poly => { if (!isCut) return null; const r = crossRange(poly); if (!r) return null; const u0 = Math.max(0, r[0]), u1 = Math.min(L, r[1]); return u1 - u0 > 0.05 ? { u0, u1 } : null; };
    const cuts = [], beyond = [];
    const maxWall = m.walls.reduce((h, w) => Math.max(h, w.height || 0), 0) || 108;
    m.walls.forEach(w => {
      const o = C.wallOutline(m, w), poly = [o.outerA, o.outerB, o.innerB, o.innerA].map(toUW), ops = m.openings.filter(x => x.wall === w.id);
      const c = cutPart(poly);
      if (c) {
        // where the line crosses the wall centerline, measured from the wall's start
        const wa = F.W(w.a), wb = F.W(w.b), WL = C.wallLength(w);
        const t = Math.abs(wa - wb) > EPS ? wa / (wa - wb) * WL : null;
        const holes = t == null ? [] : ops.filter(op => Math.abs(t - op.offset) <= op.width / 2 + EPS).map(op => ({ z0: op.kind === 'window' ? op.sill : 0, z1: op.head, kind: op.kind, id: op.id, tag: op.tag || '' }));
        cuts.push({ type: 'wall', id: w.id, u0: c.u0, u1: c.u1, h: w.height, holes, wtype: C.wallTypeKey(w) });
      }
      const v = visiblePart(poly);
      if (v) {
        const openings = ops.map(op => {
          const g = C.openingGeometry(m, op); let a = F.U(g.jamb1), b = F.U(g.jamb2); const hingeU = op.swing === 'right' ? b : a;
          const lo = Math.max(Math.min(a, b), v.u0), hi = Math.min(Math.max(a, b), v.u1);
          if (hi - lo < 1) return null;
          return { id: op.id, kind: op.kind, u0: lo, u1: hi, z0: op.kind === 'window' ? op.sill : 0, z1: op.head, tag: op.tag || '', hinge: Math.abs(hingeU - lo) < Math.abs(hingeU - hi) ? 'lo' : 'hi', w: F.W(g.center) };
        }).filter(Boolean);
        beyond.push({ type: 'wall', id: w.id, u0: v.u0, u1: v.u1, w: v.w, h: w.height, openings });
      }
    });
    (m.items || []).forEach(it => {
      if (it.kind !== 'column' && it.kind !== 'stair') return;
      const poly = C.itemOutline(it, scale).map(toUW);
      if (it.kind === 'column') {
        const c = cutPart(poly); if (c) cuts.push({ type: 'column', id: it.id, u0: c.u0, u1: c.u1, h: maxWall, holes: [] });
        const v = visiblePart(poly); if (v) beyond.push({ type: 'column', id: it.id, u0: v.u0, u1: v.u1, w: v.w, h: maxWall });
        return;
      }
      const n = C.stairRisers(it), rh = it.rise / n, td = it.length / Math.max(1, n - 1), dir = { x: Math.cos((it.rot || 0) * Math.PI / 180), y: Math.sin((it.rot || 0) * Math.PI / 180) };
      const along = Math.abs(dir.x * F.d.x + dir.y * F.d.y) > 0.3;
      const steps = []; for (let i = 0; i < n; i++) steps.push({ u: F.U(add(it.at, mul(dir, Math.min(i * td, it.length)))), z: (i + 1) * rh });
      const info = { type: 'stair', id: it.id, along, steps, rise: it.rise, risers: n, uStart: F.U(it.at), uEnd: F.U(add(it.at, mul(dir, it.length))) };
      const c = cutPart(poly), v = visiblePart(poly);
      if (c) cuts.push(Object.assign({ u0: c.u0, u1: c.u1, h: it.rise, holes: [] }, info));
      else if (v) beyond.push(Object.assign({ u0: v.u0, u1: v.u1, w: v.w, h: it.rise }, info));
    });
    beyond.sort((p, q) => q.w - p.w);
    cuts.sort((p, q) => p.u0 - q.u0);
    // rooms: spaces between cut walls, named by the room tag that sees the section line
    const rooms = [];
    if (isCut) {
      const wc = cuts.filter(c => c.type === 'wall');
      for (let i = 0; i + 1 < wc.length; i++) {
        const g0 = wc[i].u1, g1 = wc[i + 1].u0; if (g1 - g0 < 12) continue;
        let best = null;
        m.rooms.forEach(r => {
          const u = F.U(r.at), w = F.W(r.at); if (u <= g0 || u >= g1) return;
          const foot = add(cam.a, mul(F.d, u));
          if (m.walls.some(x => segsCross(r.at, foot, x.a, x.b))) return;
          if (!best || Math.abs(w) < Math.abs(best.w)) best = { r, w };
        });
        if (best) rooms.push({ id: best.r.id, name: best.r.name, number: best.r.number || '', ceiling: best.r.ceiling, u0: g0, u1: g1 });
      }
    }
    const out = { cam, frame: F, cuts, beyond, rooms, title: title(cam), scale };
    out.prims = prims(out, opts);
    out.bounds = boundsOf(out.prims, scale);
    return out;
  }

  /* ----------------------------------------------------------- primitives */
  const LW = { cut: 0.03, beyond: 0.012, fine: 0.006, ground: 0.04, dims: 0.007, hatch: 0.004, level: 0.007 };
  function prims(V, opts) {
    const C = core(), s = V.scale, P = [], ts = C.PAPER.text * s;
    const Z = z => -z;
    const line = (a, b, lw, more) => P.push(Object.assign({ t: 'line', a, b, lw }, more || {}));
    const rect = (u0, z0, u1, z1, more) => P.push(Object.assign({ t: 'poly', pts: [{ x: u0, y: Z(z0) }, { x: u1, y: Z(z0) }, { x: u1, y: Z(z1) }, { x: u0, y: Z(z1) }] }, more));
    const text = (at, s2, size, more) => P.push(Object.assign({ t: 'text', at, text: s2, size, angle: 0, anchor: 'middle' }, more || {}));
    // beyond, far to near: each face is painted over what is behind it
    V.beyond.forEach(e => {
      if (e.type === 'stair' && e.along) {
        const pts = [{ x: e.steps[0].u, y: 0 }]; let z = 0;
        e.steps.forEach((st, i) => { const nextU = i + 1 < e.steps.length ? e.steps[i + 1].u : e.uEnd; pts.push({ x: st.u, y: Z(st.z) }); pts.push({ x: nextU, y: Z(st.z) }); z = st.z; });
        pts.push({ x: e.uEnd, y: 0 });
        P.push({ t: 'poly', pts, fill: '#ffffff', lw: LW.beyond, data: { el: 'stair', id: e.id } });
        return;
      }
      rect(e.u0, 0, e.u1, e.h, { fill: '#ffffff', lw: LW.beyond, data: { el: e.type, id: e.id, h: e.h } });
      if (e.type === 'stair') for (let i = 1; i < e.risers; i++) line({ x: e.u0, y: Z(i * e.rise / e.risers) }, { x: e.u1, y: Z(i * e.rise / e.risers) }, LW.fine, { data: { el: 'stair', id: e.id } });
      (e.openings || []).forEach(o => {
        const d = { el: 'opening', id: o.id, kind: o.kind, z0: o.z0, z1: o.z1 };
        rect(o.u0, o.z0, o.u1, o.z1, { fill: o.kind === 'cased' ? '#e9eef2' : '#ffffff', lw: LW.beyond, data: d });
        const f = Math.min(2, (o.u1 - o.u0) / 6);
        if (o.kind === 'window') {
          rect(o.u0 + f, o.z0 + f, o.u1 - f, o.z1 - f, { fill: '#eef7fc', lw: LW.fine, data: d });
          line({ x: o.u0 + f, y: Z((o.z0 + o.z1) / 2) }, { x: o.u1 - f, y: Z((o.z0 + o.z1) / 2) }, LW.fine, { data: d });
          line({ x: o.u0 - 1, y: Z(o.z0) }, { x: o.u1 + 1, y: Z(o.z0) }, LW.beyond, { data: d });
        } else if (o.kind === 'door') {
          rect(o.u0 + f, o.z0, o.u1 - f, o.z1 - f, { fill: '#ffffff', lw: LW.fine, data: d });
          // swing: dashed lines from the latch-side corners meet at the hinge side
          const hu = o.hinge === 'lo' ? o.u0 + f : o.u1 - f, lu = o.hinge === 'lo' ? o.u1 - f : o.u0 + f, mz = (o.z1 - f) / 2;
          line({ x: lu, y: Z(0) }, { x: hu, y: Z(mz) }, LW.fine, { dash: true, data: d }); line({ x: lu, y: Z(o.z1 - f) }, { x: hu, y: Z(mz) }, LW.fine, { dash: true, data: d });
        }
        if (o.tag) { const c = { x: (o.u0 + o.u1) / 2, y: Z(o.z1) - 0.22 * s }; P.push({ t: 'circle', c, r: 0.09 * s, lw: LW.fine }); text(c, o.tag, ts * 0.9, { data: d }); }
      });
    });
    // cut: poured (poche) and hatched
    const hatchRect = (u0, z0, u1, z1, data) => {
      const sp = 0.06 * s, H = z1 - z0, W = u1 - u0;
      for (let k = -H; k < W; k += sp) {
        // 45 degree line u = u0 + k + (z - z0), clipped to the rectangle
        let za = z0, zb = z1, ua = u0 + k, ub = u0 + k + H;
        if (ua < u0) { za += u0 - ua; ua = u0; } if (ub > u1) { zb -= ub - u1; ub = u1; }
        if (zb - za > 0.01) line({ x: ua, y: Z(za) }, { x: ub, y: Z(zb) }, LW.hatch, { data });
      }
    };
    V.cuts.forEach(c => {
      const data = { cut: c.type, id: c.id, h: c.h };
      if (c.type === 'stair') {
        const pts = [{ x: c.steps[0].u, y: 0 }];
        c.steps.forEach((st, i) => { const nextU = i + 1 < c.steps.length ? c.steps[i + 1].u : c.uEnd; pts.push({ x: st.u, y: Z(st.z) }); pts.push({ x: nextU, y: Z(st.z) }); });
        const back = c.steps.length > 1 ? c.steps[1].u : c.uEnd;
        pts.push({ x: c.uEnd, y: Z(Math.max(0, c.rise - 10)) }); pts.push({ x: back, y: 0 });
        if (c.along) P.push({ t: 'poly', pts, fill: '#9fb0bf', lw: LW.cut, data });
        else rect(c.u0, 0, c.u1, c.rise, { fill: '#9fb0bf', lw: LW.cut, data });
        return;
      }
      bands(c.h, c.holes.map(hh => [hh.z0, hh.z1])).forEach(([z0, z1]) => { rect(c.u0, z0, c.u1, z1, { fill: '#9fb0bf', lw: LW.cut, data }); hatchRect(c.u0, z0, c.u1, z1, data); });
      c.holes.forEach(hh => { if (hh.kind === 'window') line({ x: (c.u0 + c.u1) / 2, y: Z(hh.z0) }, { x: (c.u0 + c.u1) / 2, y: Z(hh.z1) }, LW.beyond, { data: { cut: 'glass', id: hh.id } }); });
    });
    // extents
    const all = V.cuts.concat(V.beyond);
    const u0 = all.length ? Math.min(...all.map(e => e.u0)) : 0, u1 = all.length ? Math.max(...all.map(e => e.u1)) : V.frame.L;
    const top = all.length ? Math.max(...all.map(e => e.h)) : 108;
    // rooms and ceilings (section)
    const levels = [{ z: 0, label: 'FLOOR' }];
    V.rooms.forEach(r => {
      line({ x: r.u0, y: Z(r.ceiling) }, { x: r.u1, y: Z(r.ceiling) }, LW.beyond * 1.6, { data: { ceiling: r.id, z: r.ceiling } });
      text({ x: (r.u0 + r.u1) / 2, y: Z(r.ceiling) + ts * 1.4 }, 'CLG ' + C.formatFtIn(r.ceiling), ts * 0.9, { data: { room: r.id } });
      text({ x: (r.u0 + r.u1) / 2, y: Z(Math.min(r.ceiling, top) * 0.55) }, r.name + (r.number ? ' ' + r.number : ''), ts * 1.1, { data: { room: r.id } });
      if (!levels.some(l => Math.abs(l.z - r.ceiling) < 0.5)) levels.push({ z: r.ceiling, label: 'CLG' });
    });
    if (top > 0 && !levels.some(l => Math.abs(l.z - top) < 0.5)) levels.push({ z: top, label: 'T.O. WALL' });
    // ground line
    line({ x: u0 - 0.4 * s, y: 0 }, { x: u1 + 0.4 * s, y: 0 }, LW.ground, { data: { ground: 1 } });
    // levels at the right
    const lx = u1 + 0.55 * s;
    levels.sort((a, b) => a.z - b.z).forEach(l => {
      line({ x: u1 + 0.1 * s, y: Z(l.z) }, { x: lx, y: Z(l.z) }, LW.level, { dash: true, data: { level: l.z } });
      P.push({ t: 'circle', c: { x: lx + 0.06 * s, y: Z(l.z) }, r: 0.06 * s, lw: LW.level });
      text({ x: lx + 0.16 * s, y: Z(l.z) - ts * 0.15 }, l.label, ts * 0.85, { anchor: 'start', data: { level: l.z } });
      text({ x: lx + 0.16 * s, y: Z(l.z) + ts * 1.05 }, C.formatFtIn(l.z), ts * 0.85, { anchor: 'start', data: { level: l.z } });
    });
    // vertical chain at the left: floor, every visible sill and head, top of wall
    const zs = [0, top]; const addZ = z => { if (z > 0 && z < top && !zs.some(q => Math.abs(q - z) < 0.5)) zs.push(z); };
    V.beyond.forEach(e => (e.openings || []).forEach(o => { addZ(o.z0); addZ(o.z1); }));
    V.cuts.forEach(c => (c.holes || []).forEach(hh => { addZ(hh.z0); addZ(hh.z1); }));
    zs.sort((a, b) => a - b);
    const dx = u0 - 0.5 * s, tk = C.PAPER.tick * s / 2;
    line({ x: dx, y: Z(zs[0]) }, { x: dx, y: Z(zs[zs.length - 1]) }, LW.dims, { dim: 'v' });
    zs.forEach(z => { line({ x: dx - tk, y: Z(z) + tk }, { x: dx + tk, y: Z(z) - tk }, LW.dims * 2.2, { dim: 'v' }); line({ x: u0 - 0.06 * s, y: Z(z) }, { x: dx - 0.08 * s, y: Z(z) }, LW.dims, { dim: 'v' }); });
    for (let i = 0; i + 1 < zs.length; i++) { const v = zs[i + 1] - zs[i]; if (v < 0.25) continue; text({ x: dx - ts * 0.6, y: Z((zs[i] + zs[i + 1]) / 2) }, C.formatFtIn(v), ts, { angle: -90, dimValue: v, data: { dim: 'v', value: v } }); }
    // horizontal: rooms between cut walls (section), then overall
    const hz = 0.55 * s;
    const chain = (pts, y, kind) => {
      line({ x: pts[0], y }, { x: pts[pts.length - 1], y }, LW.dims, { dim: kind });
      pts.forEach(u => { line({ x: u - tk, y: y + tk }, { x: u + tk, y: y - tk }, LW.dims * 2.2, { dim: kind }); line({ x: u, y: 0.08 * s }, { x: u, y: y + 0.06 * s }, LW.dims, { dim: kind }); });
      for (let i = 0; i + 1 < pts.length; i++) { const v = pts[i + 1] - pts[i]; if (v < 0.25) continue; text({ x: (pts[i] + pts[i + 1]) / 2, y: y - ts * 0.35 }, C.formatFtIn(v), ts, { data: { dim: kind, value: v } }); }
    };
    let y = hz;
    if (V.rooms.length) { const pts = []; V.cuts.filter(c => c.type === 'wall').forEach(c => { pts.push(c.u0, c.u1); }); const uniq = pts.sort((a, b) => a - b).filter((v, i, a) => !i || v - a[i - 1] > 0.05); if (uniq.length > 2) { chain(uniq, y, 'h'); y += 0.375 * s; } }
    if (u1 - u0 > 1) chain([u0, u1], y, 'overall');
    // title
    const ty = y + 0.55 * s;
    text({ x: u0, y: ty }, V.title, ts * 1.8, { anchor: 'start', data: { title: 1 } });
    text({ x: u0, y: ty + ts * 1.9 }, 'SCALE ' + scaleText(s) + '   LOOKING ' + facing(V.cam), ts * 0.95, { anchor: 'start' });
    P.levels = levels;
    return P;
  }
  function scaleText(s) { return ({ 96: '1/8" = 1\'-0"', 48: '1/4" = 1\'-0"', 24: '1/2" = 1\'-0"' })[s] || '1:' + s; }
  function boundsOf(P, s) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const take = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    P.forEach(p => {
      if (p.t === 'line') { take(p.a.x, p.a.y); take(p.b.x, p.b.y); }
      else if (p.t === 'poly') p.pts.forEach(q => take(q.x, q.y));
      else if (p.t === 'circle') { take(p.c.x - p.r, p.c.y - p.r); take(p.c.x + p.r, p.c.y + p.r); }
      else if (p.t === 'text') { const w = String(p.text).length * p.size * 0.6; if (p.angle) { take(p.at.x - p.size, p.at.y - w / 2); take(p.at.x + p.size, p.at.y + w / 2); } else { take(p.anchor === 'start' ? p.at.x : p.at.x - w / 2, p.at.y - p.size); take(p.anchor === 'start' ? p.at.x + w : p.at.x + w / 2, p.at.y + p.size * 0.4); } }
    });
    if (!isFinite(x0)) return { x0: 0, y0: -120, x1: 240, y1: 24 };
    const m = 0.4 * s; return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
  }

  /* ----------------------------------------------------------- outputs */
  const xesc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f3 = v => (+v).toFixed(3);
  function toSVG(V, opts) {
    opts = opts || {}; const s = V.scale, b = V.bounds, w = b.x1 - b.x0, h = b.y1 - b.y0, color = opts.ink || ink;
    const dataAttr = d => d ? Object.entries(d).map(([k, v]) => ` data-${k}="${xesc(v)}"`).join('') : '';
    const parts = P => P.map(p => {
      const lw = f3((p.lw || LW.fine) * s);
      if (p.t === 'line') return `<line${dataAttr(p.data)}${p.dim ? ` data-dimline="${p.dim}"` : ''} x1="${f3(p.a.x)}" y1="${f3(p.a.y)}" x2="${f3(p.b.x)}" y2="${f3(p.b.y)}" stroke="${color}" stroke-width="${lw}"${p.dash ? ` stroke-dasharray="${f3(0.05 * s)} ${f3(0.035 * s)}"` : ''}/>`;
      if (p.t === 'poly') return `<polygon${dataAttr(p.data)} points="${p.pts.map(q => f3(q.x) + ',' + f3(q.y)).join(' ')}" fill="${p.fill || 'none'}" stroke="${color}" stroke-width="${lw}" stroke-linejoin="round"/>`;
      if (p.t === 'circle') return `<circle cx="${f3(p.c.x)}" cy="${f3(p.c.y)}" r="${f3(p.r)}" fill="none" stroke="${color}" stroke-width="${lw}"/>`;
      if (p.t === 'text') return `<text${dataAttr(p.data)} x="${f3(p.at.x)}" y="${f3(p.at.y)}" font-size="${f3(p.size)}" font-family="Helvetica, Arial, sans-serif" fill="${color}" text-anchor="${p.anchor === 'start' ? 'start' : 'middle'}"${p.angle ? ` transform="rotate(${p.angle} ${f3(p.at.x)} ${f3(p.at.y)})"` : ''}>${xesc(p.text)}</text>`;
      return '';
    }).join('');
    const size = opts.paperSize ? ` width="${f3(w / s)}in" height="${f3(h / s)}in"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" class="du-elev-svg" data-kind="${V.cam.kind}" data-camera="${xesc(V.cam.id || '')}" viewBox="${f3(b.x0)} ${f3(b.y0)} ${f3(w)} ${f3(h)}"${size}><rect x="${f3(b.x0)}" y="${f3(b.y0)}" width="${f3(w)}" height="${f3(h)}" fill="${opts.paper || '#ffffff'}"/>${parts(V.prims)}</svg>`;
  }
  const ascii = s => String(s).replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '');
  function toDXF(V) {
    const out = [], g = (c, v) => out.push(String(c), String(v)), Y = y => (-y).toFixed(4);
    const layer = p => p.data && p.data.cut ? 'A-SECT-CUT' : p.dim || (p.data && p.data.dim) ? 'A-ANNO-DIMS' : p.data && p.data.el === 'opening' ? 'A-ELEV-OPEN' : p.t === 'text' ? 'A-ANNO-TEXT' : 'A-ELEV';
    g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 1); g(0, 'ENDSEC');
    const names = ['A-ELEV', 'A-ELEV-OPEN', 'A-SECT-CUT', 'A-ANNO-DIMS', 'A-ANNO-TEXT'];
    g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, names.length); names.forEach((n, i) => { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, [7, 4, 1, 1, 7][i]); g(6, 'CONTINUOUS'); }); g(0, 'ENDTAB'); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    const ln = (L, a, b) => { g(0, 'LINE'); g(8, L); g(10, a.x.toFixed(4)); g(20, Y(a.y)); g(30, 0); g(11, b.x.toFixed(4)); g(21, Y(b.y)); g(31, 0); };
    V.prims.forEach(p => {
      const L = layer(p);
      if (p.t === 'line') ln(L, p.a, p.b);
      else if (p.t === 'poly') p.pts.forEach((q, i) => ln(L, q, p.pts[(i + 1) % p.pts.length]));
      else if (p.t === 'circle') { g(0, 'CIRCLE'); g(8, L); g(10, p.c.x.toFixed(4)); g(20, Y(p.c.y)); g(30, 0); g(40, p.r.toFixed(4)); }
      else if (p.t === 'text') { g(0, 'TEXT'); g(8, L); g(10, p.at.x.toFixed(4)); g(20, Y(p.at.y)); g(30, 0); g(40, p.size.toFixed(4)); g(1, ascii(p.text)); if (p.angle) g(50, -p.angle); if (p.anchor !== 'start') { g(72, 1); g(11, p.at.x.toFixed(4)); g(21, Y(p.at.y)); g(31, 0); } }
    });
    g(0, 'ENDSEC'); g(0, 'EOF'); return out.join('\r\n') + '\r\n';
  }
  /** Vector PDF (11x17 landscape) with a title block; returns a binary string. */
  function toPDF(V, info) {
    info = info || {}; const s = V.scale, b = V.bounds, W = 17 * 72, H = 11 * 72, margin = 36, tbH = 79;
    const k0 = 72 / s, dw = (b.x1 - b.x0) * k0, dh = (b.y1 - b.y0) * k0, aw = W - 2 * margin, ah = H - 2 * margin - tbH;
    const fit = Math.min(1, aw / dw, ah / dh), k = k0 * fit;
    const ox = margin + (aw - dw * fit) / 2 - b.x0 * k, oy = H - margin - (ah - dh * fit) / 2 + b.y0 * k;
    const X = x => (ox + x * k).toFixed(2), Yp = y => (oy - y * k).toFixed(2);
    const ps = t => '(' + ascii(t).replace(/[\\()]/g, c => '\\' + c) + ')';
    const rgb = hex => { const h = String(hex || '#ffffff').replace('#', ''); return [0, 2, 4].map(i => (parseInt(h.substr(i, 2), 16) / 255).toFixed(3)).join(' '); };
    const c = ['0.051 0.106 0.165 RG 1 j'];
    V.prims.forEach(p => {
      const lw = Math.max(0.2, (p.lw || LW.fine) * 72 * fit).toFixed(2);
      if (p.t === 'line') c.push(`${lw} w ${p.dash ? '[3 2]' : '[]'} 0 d ${X(p.a.x)} ${Yp(p.a.y)} m ${X(p.b.x)} ${Yp(p.b.y)} l S`);
      else if (p.t === 'poly') { const path = `${X(p.pts[0].x)} ${Yp(p.pts[0].y)} m ` + p.pts.slice(1).map(q => `${X(q.x)} ${Yp(q.y)} l`).join(' ') + ' h'; c.push(`${lw} w [] 0 d ${p.fill ? rgb(p.fill) + ' rg ' + path + ' B' : path + ' S'}`); }
      else if (p.t === 'circle') { const n = 20, pts = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; pts.push(`${X(p.c.x + p.r * Math.cos(a))} ${Yp(p.c.y + p.r * Math.sin(a))}`); } c.push(`${lw} w [] 0 d ${pts[0]} m ${pts.slice(1).map(q => q + ' l').join(' ')} S`); }
      else if (p.t === 'text') {
        const size = p.size * k, w = ascii(p.text).length * size * 0.55, rad = (p.angle || 0) * Math.PI / 180, cos = Math.cos(-rad), sin = Math.sin(-rad);
        const dx = p.anchor === 'start' ? 0 : -w / 2, tx = +X(p.at.x) + dx * cos, ty = +Yp(p.at.y) + dx * sin;
        c.push(`0.051 0.106 0.165 rg BT /F1 ${size.toFixed(2)} Tf ${cos.toFixed(4)} ${sin.toFixed(4)} ${(-sin).toFixed(4)} ${cos.toFixed(4)} ${tx.toFixed(2)} ${ty.toFixed(2)} Tm ${ps(p.text)} Tj ET`);
      }
    });
    c.push(`0 0 0 RG 0 0 0 rg 1.2 w ${margin / 2} ${margin / 2} ${W - margin} ${H - margin} re S 0.6 w ${margin} ${margin} ${W - 2 * margin} ${tbH - 8} re S`);
    [[info.project || 'DrawUp Project', 14, margin + 12, margin + tbH - 34], [V.title + (info.name ? ' - ' + info.name : ''), 11, margin + 12, margin + tbH - 54], ['Scale ' + (fit < 1 ? 'reduced to fit the sheet' : scaleText(s)), 9, margin + 12, margin + tbH - 72], [info.sheet || 'A201', 22, W - margin - 110, margin + tbH - 44], ['Generated from the plan model. Verify in field.', 7, margin + 340, margin + tbH - 72]]
      .forEach(([t, size, x, y]) => c.push(`BT /F1 ${size} Tf ${x} ${y} Td ${ps(t)} Tj ET`));
    const stream = c.join('\n');
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
    let pdf = '%PDF-1.4\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return pdf;
  }

  /* ----------------------------------------------------------- plan overlay */
  /** SVG markup for the cameras on the plan (section lines with end arrows, elevation markers). */
  function planOverlay(m, scale, selId) {
    const s = scale || 48, ts = 0.1 * s, out = [];
    (m.cameras || []).forEach(cam => {
      const F = frame(cam), on = cam.id === selId, col = on ? '#1b8cff' : (cam.kind === 'section' ? '#d0342c' : '#7a3fd1');
      const mid = mul(add(cam.a, cam.b), 0.5), ah = 0.16 * s, lab = cam.kind === 'section' ? (cam.name || 'A') : (cam.name || 'E').slice(0, 1);
      const arrow = (p) => { const tip = add(p, mul(F.n, ah * 1.6)), l = add(p, mul(F.d, -ah * 0.7)), r = add(p, mul(F.d, ah * 0.7)); return `<polygon points="${[l, tip, r].map(q => f3(q.x) + ',' + f3(q.y)).join(' ')}" fill="${col}"/>`; };
      const bubble = p => `<circle cx="${f3(p.x)}" cy="${f3(p.y)}" r="${f3(ts * 1.25)}" fill="#fff" stroke="${col}" stroke-width="${f3(0.012 * s)}"/><text x="${f3(p.x)}" y="${f3(p.y)}" font-size="${f3(ts * 1.2)}" font-family="Helvetica, Arial, sans-serif" font-weight="700" fill="${col}" text-anchor="middle" dominant-baseline="central">${xesc(lab)}</text>`;
      const hit = `<line class="du-cam-hit" data-cam="${cam.id}" x1="${f3(cam.a.x)}" y1="${f3(cam.a.y)}" x2="${f3(cam.b.x)}" y2="${f3(cam.b.y)}" stroke="rgba(0,0,0,0)" stroke-width="${f3(0.22 * s)}" style="cursor:move"/>`;
      const ends = on ? ['a', 'b'].map(k => `<circle class="du-cam-end" data-cam="${cam.id}" data-end="${k}" cx="${f3(cam[k].x)}" cy="${f3(cam[k].y)}" r="${f3(0.11 * s)}" fill="#1b8cff" fill-opacity=".25" stroke="#1b8cff" stroke-width="${f3(0.01 * s)}" style="cursor:crosshair"/>`).join('') : '';
      let body;
      if (cam.kind === 'section') body = `<line x1="${f3(cam.a.x)}" y1="${f3(cam.a.y)}" x2="${f3(cam.b.x)}" y2="${f3(cam.b.y)}" stroke="${col}" stroke-width="${f3(0.016 * s)}" stroke-dasharray="${f3(0.18 * s)} ${f3(0.05 * s)} ${f3(0.03 * s)} ${f3(0.05 * s)}"/>` + arrow(add(cam.a, mul(F.n, ts * 1.2))) + arrow(add(cam.b, mul(F.n, ts * 1.2))) + bubble(cam.a) + bubble(cam.b);
      else body = `<line x1="${f3(cam.a.x)}" y1="${f3(cam.a.y)}" x2="${f3(cam.b.x)}" y2="${f3(cam.b.y)}" stroke="${col}" stroke-width="${f3(0.008 * s)}" stroke-dasharray="${f3(0.05 * s)} ${f3(0.05 * s)}"/>` + arrow(add(mid, mul(F.n, ts * 1.3))) + bubble(mid);
      out.push(`<g class="du-cam" data-cam="${cam.id}" data-kind="${cam.kind}">${body}${hit}${ends}</g>`);
    });
    return out.join('');
  }

  const api = { frame, defaultElevations, defaultSection, flip, rotate, move, facing, title, build, toSVG, toDXF, toPDF, planOverlay, planBox, scaleText };
  if (NODE) module.exports = api; else root.DrawUpElev = api;
})(typeof window !== 'undefined' ? window : globalThis);
