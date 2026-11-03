/* DrawUp Draw Workspace 2.0 (v29): geometry operations on the shared Draw model.
 *
 * The Draw model (drawup-draw-core-v18.js) stays the single source of truth. Everything here
 * reads or edits that one model, so the plan, elevations, sections, 3D and every style show
 * the same geometry:
 *   - rooms from walls (closed wall loops become room outlines, areas, floors and ceilings)
 *   - curved walls (a curve record plus the short straight wall segments that draw it)
 *   - offset, trim/extend, join, stretch, rotate, move-with-joints
 *   - roofs (flat, shed, gable, hip) as 3D planes
 *   - picture-to-plan: turns an interpretation (from the free wall tracer or the DrawUp AI) into
 *     a Draw model, with the scale and every guess written down as an assumption
 *   - plain-English commands ("move this wall 2 feet north") parsed without any AI, and a small
 *     op list that both the parser and the AI edit route produce, applied in one place
 *   - geomHash: a fingerprint of the geometry only, so tests can prove a style change did not
 *     move anything
 * Units are inches, plan y runs down the sheet (north is up). Browser: window.DrawUpWSGeo (needs
 * DrawUpDrawCore and DrawUpDrawLib). Node: module.exports.
 */
(function (root) {
  'use strict';
  const NODE = typeof module === 'object' && module.exports;
  const core = () => (NODE ? require('./drawup-draw-core-v18.js') : root.DrawUpDrawCore);
  const lib = () => (NODE ? require('./drawup-draw-lib-v29.js') : root.DrawUpDrawLib);
  const EPS = 1e-6;
  const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y }), add = (p, q) => ({ x: p.x + q.x, y: p.y + q.y }), mul = (p, k) => ({ x: p.x * k, y: p.y * k });
  const len = p => Math.hypot(p.x, p.y), dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y), unit = p => { const l = len(p) || 1; return { x: p.x / l, y: p.y / l }; };
  const cross = (p, q) => p.x * q.y - p.y * q.x, dot = (p, q) => p.x * q.x + p.y * q.y;
  const r8 = v => Math.round(v * 8) / 8, r1 = v => Math.round(v);
  const uid = p => (p || 'id') + '_' + Math.random().toString(36).slice(2, 9);
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ------------------------------------------------------------ workspace meta on the model */
  function ws(m) {
    m.ws = m.ws && typeof m.ws === 'object' ? m.ws : {};
    const w = m.ws;
    w.v = 29;
    if (!Array.isArray(w.assumptions)) w.assumptions = [];
    if (!Array.isArray(w.unknowns)) w.unknowns = [];
    if (!w.style) w.style = 'cd';
    if (!w.finishes || typeof w.finishes !== 'object') w.finishes = {};
    if (!Array.isArray(w.concepts)) w.concepts = [];
    if (!w.brand || typeof w.brand !== 'object') w.brand = {};
    if (!Array.isArray(w.renders)) w.renders = [];
    if (!Array.isArray(m.curves)) m.curves = [];
    if (!m.level || typeof m.level !== 'object') m.level = { name: 'LEVEL 1', elev: 0 };
    return w;
  }

  /** Geometry fingerprint: walls, openings, rooms, items, curves, roof, level. Style, finishes,
   *  brand, view settings, cameras and the workspace notes are left out on purpose. */
  function geomHash(m) {
    const n = v => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
    const pick = (o, keys) => keys.map(k => { const v = o[k]; return v && typeof v === 'object' ? JSON.stringify(v, (_k, x) => n(x)) : n(v); }).join(',');
    const parts = [];
    (m.walls || []).forEach(w => parts.push('W' + pick(w, ['id', 'a', 'b', 'thickness', 'height', 'type', 'wtype', 'curve', 'top'])));
    (m.openings || []).forEach(o => parts.push('O' + pick(o, ['id', 'wall', 'kind', 'offset', 'width', 'head', 'sill', 'swing', 'opens'])));
    (m.rooms || []).forEach(r => parts.push('R' + pick(r, ['id', 'name', 'at', 'ceiling', 'poly'])));
    (m.items || []).forEach(i => parts.push('I' + pick(i, ['id', 'kind', 'comp', 'at', 'a', 'b', 'rot', 'w', 'd', 'h', 'z', 'size', 'length', 'width', 'rise', 'pts', 'r'])));
    (m.curves || []).forEach(c => parts.push('C' + pick(c, ['id', 'a', 'b', 'm', 'thickness', 'height'])));
    if (m.roof) parts.push('F' + pick(m.roof, ['type', 'pitch', 'overhang', 'ridge', 'parapet', 'base']));
    let h = 2166136261; const s = parts.join('|');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16).padStart(8, '0') + ':' + parts.length;
  }

  /* ------------------------------------------------------------ polygons */
  function area(poly) { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p.x * q.y - q.x * p.y; } return a / 2; }
  function inside(pt, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }
  function centroidOf(poly) { const A = area(poly); if (Math.abs(A) < EPS) { const s = poly.reduce((o, p) => add(o, p), { x: 0, y: 0 }); return mul(s, 1 / poly.length); } let cx = 0, cy = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], f = p.x * q.y - q.x * p.y; cx += (p.x + q.x) * f; cy += (p.y + q.y) * f; } return { x: cx / (6 * A), y: cy / (6 * A) }; }
  function bboxOf(pts) { const xs = pts.map(p => p.x), ys = pts.map(p => p.y); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; }
  /** Shrinks a simple polygon by d (inward offset of each edge, corners re-intersected). */
  function insetPoly(poly, d) {
    const n = poly.length; if (n < 3) return poly.slice();
    const ccw = area(poly) > 0, out = [];
    const lines = poly.map((p, i) => { const q = poly[(i + 1) % n], e = unit(sub(q, p)); let nn = { x: -e.y, y: e.x }; if (!ccw) nn = mul(nn, -1); return { p: add(p, mul(nn, d)), e }; });
    for (let i = 0; i < n; i++) { const L0 = lines[(i + n - 1) % n], L1 = lines[i], den = cross(L0.e, L1.e); if (Math.abs(den) < 1e-9) { out.push(L1.p); continue; } const t = cross(sub(L1.p, L0.p), L1.e) / den; out.push(add(L0.p, mul(L0.e, t))); }
    return out;
  }

  /* ------------------------------------------------------------ rooms from walls
   * Wall centerlines become a planar graph (split where walls cross or tee); its bounded faces
   * are the spaces. A room tag inside a face gets that face, shrunk to the wall faces. */
  function segIntersect(a, b, c, d) {
    const r = sub(b, a), s = sub(d, c), den = cross(r, s); if (Math.abs(den) < 1e-9) return null;
    const t = cross(sub(c, a), s) / den, u = cross(sub(c, a), r) / den;
    if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
    return { t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u)), p: add(a, mul(r, t)) };
  }
  function faces(m, opts) {
    opts = opts || {}; const tol = opts.tol || 2;
    const walls = (m.walls || []).filter(w => w.type !== 'low' && core().wallTypeKey(w) !== 'low');
    const cuts = walls.map(() => [0, 1]);
    for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) {
      const A = walls[i], B = walls[j];
      const hit = segIntersect(A.a, A.b, B.a, B.b);
      if (hit) { cuts[i].push(hit.t); cuts[j].push(hit.u); continue; }
      // near misses: an end that stops within tol of the other wall still joins it
      [[A, B, i, j], [B, A, j, i]].forEach(([P, Q, pi, qi]) => ['a', 'b'].forEach(k => {
        const p = P[k], d = sub(Q.b, Q.a), L = len(d); if (L < EPS) return;
        const t = dot(sub(p, Q.a), d) / (L * L); if (t <= 0 || t >= 1) return;
        const foot = add(Q.a, mul(d, t)); if (dist(foot, p) <= Math.max(tol, P.thickness / 2 + Q.thickness / 2)) cuts[qi].push(t);
      }));
    }
    const nodes = [], key = p => { for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) <= tol) return i; nodes.push({ x: p.x, y: p.y }); return nodes.length - 1; };
    const edges = new Set(), adj = new Map();
    walls.forEach((w, i) => {
      const ts = [...new Set(cuts[i].map(t => Math.round(t * 1e6) / 1e6))].sort((a, b) => a - b), d = sub(w.b, w.a);
      for (let k = 0; k + 1 < ts.length; k++) {
        const u = key(add(w.a, mul(d, ts[k]))), v = key(add(w.a, mul(d, ts[k + 1]))); if (u === v) continue;
        const e = u < v ? u + ':' + v : v + ':' + u; if (edges.has(e)) continue; edges.add(e);
        if (!adj.has(u)) adj.set(u, []); if (!adj.has(v)) adj.set(v, []); adj.get(u).push(v); adj.get(v).push(u);
      }
    });
    // prune dangling ends (a wall stub that closes nothing)
    let changed = true; while (changed) { changed = false; adj.forEach((ns, u) => { if (ns.length === 1) { const v = ns[0]; adj.set(u, []); adj.set(v, adj.get(v).filter(x => x !== u)); changed = true; } }); }
    const ang = (u, v) => Math.atan2(nodes[v].y - nodes[u].y, nodes[v].x - nodes[u].x);
    adj.forEach((ns, u) => ns.sort((a, b) => ang(u, a) - ang(u, b)));
    const used = new Set(), out = [];
    adj.forEach((ns, u0) => ns.forEach(v0 => {
      if (used.has(u0 + '>' + v0)) return;
      const loop = []; let u = u0, v = v0, guard = 0;
      while (guard++ < 2000) {
        used.add(u + '>' + v); loop.push(u);
        const list = adj.get(v); if (!list || !list.length) break;
        const i = list.indexOf(u); const w = list[(i - 1 + list.length) % list.length];
        u = v; v = w; if (u === u0 && v === v0) break;
      }
      if (loop.length >= 3) { const poly = loop.map(i => nodes[i]); const A = area(poly); if (A > 144) out.push({ poly, area: A }); }
    }));
    // in plan coordinates (y down) the bounded faces come out with positive area; drop the outer one
    return out.filter(f => f.area > 0).sort((a, b) => a.area - b.area);
  }
  /** Rooms with their outline (inside wall faces), area in square feet and the face they sit in. */
  function roomOutlines(m) {
    const fs = faces(m), walls = m.walls || [];
    const half = fs.map(f => { const t = walls.length ? walls.reduce((s, w) => s + w.thickness, 0) / walls.length / 2 : 0; return insetPoly(f.poly, t); });
    return (m.rooms || []).map(r => {
      if (Array.isArray(r.poly) && r.poly.length >= 3) return { room: r, poly: r.poly, sf: Math.abs(area(r.poly)) / 144, source: 'drawn' };
      const i = fs.findIndex(f => inside(r.at, f.poly));
      if (i < 0) return { room: r, poly: null, sf: null, source: 'open' };
      return { room: r, poly: half[i], sf: Math.abs(area(half[i])) / 144, source: 'walls' };
    });
  }

  /* ------------------------------------------------------------ joints */
  const same = (p, q, t) => dist(p, q) <= (t || 0.01);
  function jointsAt(m, p, except) { const out = []; (m.walls || []).forEach(w => { if (w === except) return; if (same(w.a, p)) out.push([w, 'a']); if (same(w.b, p)) out.push([w, 'b']); }); return out; }
  /** Moves one wall; walls joined at its ends stretch with it (their joined end moves too). */
  function moveWall(m, id, dx, dy) {
    const w = core().wallById(m, id); if (!w) throw new Error('Wall not found.');
    ['a', 'b'].forEach(k => { jointsAt(m, w[k], w).forEach(([o, ok]) => { o[ok] = { x: r8(o[ok].x + dx), y: r8(o[ok].y + dy) }; }); });
    w.a = { x: r8(w.a.x + dx), y: r8(w.a.y + dy) }; w.b = { x: r8(w.b.x + dx), y: r8(w.b.y + dy) };
    (m.rooms || []).forEach(r => { if (r.poly) delete r.poly; });
    return w;
  }
  /** Moves one end of a wall to p (stretching it); walls joined at that end follow. */
  function stretchWall(m, id, end, p) {
    const w = core().wallById(m, id); if (!w) throw new Error('Wall not found.');
    const q = { x: r8(p.x), y: r8(p.y) }; if (dist(q, w[end === 'a' ? 'b' : 'a']) < 6) throw new Error('A wall must stay at least 6" long.');
    jointsAt(m, w[end], w).forEach(([o, ok]) => { o[ok] = { x: q.x, y: q.y }; });
    w[end] = q; clampOpenings(m, w); return w;
  }
  function clampOpenings(m, w) { const L = core().wallLength(w); (m.openings || []).filter(o => o.wall === w.id).forEach(o => { if (o.width > L - 2) o.width = Math.max(12, Math.floor(L - 2)); o.offset = Math.min(Math.max(o.offset, o.width / 2 + 1), L - o.width / 2 - 1); }); }
  /** A copy of the wall, parallel, d inches to its left (+) or right (-) looking from a to b. */
  function offsetWall(m, id, d) {
    const w = core().wallById(m, id); if (!w) throw new Error('Wall not found.');
    if (!(Math.abs(d) >= w.thickness)) throw new Error('Offset by at least the wall thickness (' + core().formatFtIn(w.thickness) + ').');
    const u = unit(sub(w.b, w.a)), n = { x: -u.y, y: u.x }, o = mul(n, d);
    const c = { id: uid('w'), a: { x: r8(w.a.x + o.x), y: r8(w.a.y + o.y) }, b: { x: r8(w.b.x + o.x), y: r8(w.b.y + o.y) }, thickness: w.thickness, type: w.type, height: w.height };
    if (w.wtype) c.wtype = w.wtype; m.walls.push(c); return c;
  }
  function lineX(a, b, c, d) { const r = sub(b, a), s = sub(d, c), den = cross(r, s); if (Math.abs(den) < 1e-9) return null; const t = cross(sub(c, a), s) / den; return { t, p: add(a, mul(r, t)) }; }
  /** Trims or extends the nearer end of wall `id` to the centerline of wall `to`. */
  function trimExtend(m, id, to, end) {
    const w = core().wallById(m, id), t = core().wallById(m, to); if (!w || !t || w === t) throw new Error('Pick two different walls.');
    const x = lineX(w.a, w.b, t.a, t.b); if (!x) throw new Error('Those walls are parallel; they never meet.');
    const k = end || (Math.abs(x.t) < Math.abs(x.t - 1) ? 'a' : 'b');
    const p = { x: r8(x.p.x), y: r8(x.p.y) }; if (dist(p, w[k === 'a' ? 'b' : 'a']) < 6) throw new Error('That would make the wall shorter than 6".');
    w[k] = p; clampOpenings(m, w); return { wall: w, end: k, at: p };
  }
  /** Joins two walls into a clean corner: both run to where their centerlines cross. */
  function joinWalls(m, idA, idB) {
    const A = core().wallById(m, idA), B = core().wallById(m, idB); if (!A || !B || A === B) throw new Error('Pick two different walls.');
    const x = lineX(A.a, A.b, B.a, B.b); if (!x) throw new Error('Those walls are parallel. Use Stretch to line them up instead.');
    const p = { x: r8(x.p.x), y: r8(x.p.y) };
    const near = w => (dist(w.a, p) < dist(w.b, p) ? 'a' : 'b');
    const ka = near(A), kb = near(B); A[ka] = { x: p.x, y: p.y }; B[kb] = { x: p.x, y: p.y };
    clampOpenings(m, A); clampOpenings(m, B); return p;
  }
  /** Rotates an item, a room tag or a wall (about its midpoint, or about `about`) by deg. */
  function rotateTarget(m, sel, deg, about) {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), rot = (p, o) => { const v = sub(p, o); return { x: r8(o.x + v.x * c - v.y * s), y: r8(o.y + v.x * s + v.y * c) }; };
    if (sel.type === 'item') { const it = (m.items || []).find(x => x.id === sel.id); if (!it) throw new Error('Item not found.'); if (about && it.at) it.at = rot(it.at, about); it.rot = ((((it.rot || 0) + deg) % 360) + 360) % 360; return it; }
    if (sel.type === 'wall') { const w = core().wallById(m, sel.id); if (!w) throw new Error('Wall not found.'); const o = about || mul(add(w.a, w.b), 0.5); w.a = rot(w.a, o); w.b = rot(w.b, o); return w; }
    if (sel.type === 'room') { const r = m.rooms.find(x => x.id === sel.id); if (r && about) r.at = rot(r.at, about); return r; }
    throw new Error('Pick a wall or an element to rotate.');
  }

  /* ------------------------------------------------------------ curved walls */
  function circle3(a, b, c) { return core().circle3(a, b, c); }
  /** Segment points of an arc from a through mid to b, about one segment per 7.5 degrees. */
  function arcPts(a, mid, b, maxSeg) {
    const k = circle3(a, mid, b); if (!k) return [a, b];
    const ang = p => Math.atan2(p.y - k.c.y, p.x - k.c.x), a0 = ang(a), am = ang(mid), ab = ang(b), TAU = Math.PI * 2;
    const nrm = t => ((t - a0) % TAU + TAU) % TAU; let sweep = nrm(ab); if (nrm(am) > sweep) sweep -= TAU;
    const n = Math.max(4, Math.min(48, Math.ceil(Math.abs(sweep) / (Math.PI / 24)), Math.ceil(Math.abs(sweep) * k.r / (maxSeg || 36))));
    const o = []; for (let i = 0; i <= n; i++) { const t = a0 + sweep * i / n; o.push({ x: r8(k.c.x + k.r * Math.cos(t)), y: r8(k.c.y + k.r * Math.sin(t)) }); }
    o[0] = { x: a.x, y: a.y }; o[o.length - 1] = { x: b.x, y: b.y }; return o;
  }
  /** Rebuilds the straight segments of a curve record. Openings on the old segments are kept
   *  only where they still fit on one segment (most do not: see the report). */
  function buildCurve(m, cv) {
    const old = m.walls.filter(w => w.curve && w.curve.id === cv.id), oldIds = new Set(old.map(w => w.id));
    const dropped = m.openings.filter(o => oldIds.has(o.wall)).length;
    m.openings = m.openings.filter(o => !oldIds.has(o.wall));
    m.walls = m.walls.filter(w => !oldIds.has(w.id));
    const pts = arcPts(cv.a, cv.m, cv.b), n = pts.length - 1, made = [];
    for (let i = 0; i < n; i++) { const w = { id: cv.id + '_s' + i, a: pts[i], b: pts[i + 1], thickness: cv.thickness, type: cv.type || 'exterior', height: cv.height, curve: { id: cv.id, i, n } }; if (cv.wtype) w.wtype = cv.wtype; m.walls.push(w); made.push(w); }
    return { walls: made, droppedOpenings: dropped };
  }
  function addCurvedWall(m, a, b, mid, opts) {
    ws(m); opts = opts || {}; const W = core().WALL_TYPES[opts.wtype];
    if (dist(a, b) < 24) throw new Error('Make a curved wall at least 2\'-0" across.');
    if (!circle3(a, mid, b)) throw new Error('Pull the middle point off the straight line to make a curve.');
    const cv = { id: opts.id || uid('cv'), a: { x: r8(a.x), y: r8(a.y) }, b: { x: r8(b.x), y: r8(b.y) }, m: { x: r8(mid.x), y: r8(mid.y) }, thickness: opts.thickness || (W ? W.thickness : 6), type: opts.type || (W ? W.role : 'exterior'), height: opts.height || (W ? W.height : 108) };
    if (opts.wtype) cv.wtype = opts.wtype;
    m.curves.push(cv); buildCurve(m, cv); return cv;
  }
  /** Bulge = how far the middle of the curve sits off the straight chord (+ = to the left of a→b). */
  function curveBulge(cv) { const d = unit(sub(cv.b, cv.a)), n = { x: -d.y, y: d.x }, c = mul(add(cv.a, cv.b), 0.5); return dot(sub(cv.m, c), n); }
  function setCurveBulge(m, id, bulge) {
    ws(m); const cv = m.curves.find(x => x.id === id); if (!cv) throw new Error('Curve not found.');
    const d = unit(sub(cv.b, cv.a)), n = { x: -d.y, y: d.x }, c = mul(add(cv.a, cv.b), 0.5);
    if (Math.abs(bulge) < 1) throw new Error('A curve needs a bulge of at least 1".');
    if (Math.abs(bulge) > dist(cv.a, cv.b) / 2) throw new Error('The bulge can be at most half the width (a half circle).');
    cv.m = { x: r8(c.x + n.x * bulge), y: r8(c.y + n.y * bulge) }; return buildCurve(m, cv);
  }
  /** Turns a straight wall into a curve with that bulge. Walls joined at its ends stay joined. */
  function curveWall(m, id, bulge) {
    ws(m); const w = core().wallById(m, id); if (!w) throw new Error('Wall not found.');
    if (w.curve) return setCurveBulge(m, w.curve.id, bulge);
    const d = unit(sub(w.b, w.a)), n = { x: -d.y, y: d.x }, c = mul(add(w.a, w.b), 0.5);
    const lost = m.openings.filter(o => o.wall === w.id).length;
    m.walls = m.walls.filter(x => x !== w); m.openings = m.openings.filter(o => o.wall !== w.id);
    const cv = addCurvedWall(m, w.a, w.b, add(c, mul(n, bulge)), { thickness: w.thickness, type: w.type, wtype: w.wtype, height: w.height });
    return { curve: cv, droppedOpenings: lost };
  }
  function removeCurve(m, id) { m.walls = m.walls.filter(w => !(w.curve && w.curve.id === id)); m.curves = (m.curves || []).filter(c => c.id !== id); }

  /* ------------------------------------------------------------ roof */
  const ROOFS = ['flat', 'shed', 'gable', 'hip'];
  function envelope(m) {
    const C = core(), ext = (m.walls || []).filter(w => w.type === 'exterior'), list = ext.length ? ext : (m.walls || []);
    if (!list.length) return null; const pts = [];
    list.forEach(w => { const o = C.wallOutline(m, w); pts.push(o.outerA, o.outerB, o.innerA, o.innerB); });
    return bboxOf(pts);
  }
  /** Roof planes in 3D (x, y plan inches; z up from the floor), from the building's outer rectangle.
   *  Season 1 roofs follow that rectangle; L- and T-shaped roofs are not modelled yet. */
  function roofPlanes(m) {
    const rf = m.roof; if (!rf || !ROOFS.includes(rf.type)) return [];
    const b = envelope(m); if (!b) return [];
    const eave = rf.base > 0 ? rf.base : (m.walls || []).filter(w => w.type === 'exterior').reduce((h, w) => Math.max(h, w.height || 0), 0) || 108;
    const o = rf.type === 'flat' ? 0 : Math.max(0, rf.overhang || 0), x0 = b.x0 - o, y0 = b.y0 - o, x1 = b.x1 + o, y1 = b.y1 + o, k = Math.max(0, Math.min(24, rf.pitch || 0)) / 12;
    const alongX = rf.ridge !== 'y'; // ridge runs east-west by default
    const P3 = (x, y, z) => ({ x, y, z });
    if (rf.type === 'flat') {
      const z = eave, par = rf.parapet > 0 ? rf.parapet : 0;
      const planes = [{ pts: [P3(x0, y0, z), P3(x1, y0, z), P3(x1, y1, z), P3(x0, y1, z)], kind: 'roof' }];
      if (par) planes.push({ parapet: par, z, rect: { x0, y0, x1, y1 }, kind: 'parapet' });
      return planes;
    }
    if (rf.type === 'shed') {
      const span = alongX ? y1 - y0 : x1 - x0, zt = eave + span * k; // high side at north / west
      return [{ pts: alongX ? [P3(x0, y0, zt), P3(x1, y0, zt), P3(x1, y1, eave), P3(x0, y1, eave)] : [P3(x0, y0, zt), P3(x1, y0, eave), P3(x1, y1, eave), P3(x0, y1, zt)], kind: 'roof' }];
    }
    if (alongX) {
      const ym = (y0 + y1) / 2, zr = eave + (ym - y0) * k;
      if (rf.type === 'gable') return [{ pts: [P3(x0, y0, eave), P3(x1, y0, eave), P3(x1, ym, zr), P3(x0, ym, zr)], kind: 'roof' }, { pts: [P3(x0, ym, zr), P3(x1, ym, zr), P3(x1, y1, eave), P3(x0, y1, eave)], kind: 'roof' }, { pts: [P3(x0 + o, y0 + o, eave), P3(x0 + o, ym, eave + (ym - y0 - o) * k), P3(x0 + o, y1 - o, eave)], kind: 'gable' }, { pts: [P3(x1 - o, y0 + o, eave), P3(x1 - o, ym, eave + (ym - y0 - o) * k), P3(x1 - o, y1 - o, eave)], kind: 'gable' }];
      const h = Math.min((y1 - y0) / 2, (x1 - x0) / 2); // hip
      return [{ pts: [P3(x0, y0, eave), P3(x1, y0, eave), P3(x1 - h, ym, zr), P3(x0 + h, ym, zr)], kind: 'roof' }, { pts: [P3(x1 - h, ym, zr), P3(x1, y1, eave), P3(x0, y1, eave), P3(x0 + h, ym, zr)], kind: 'roof' }, { pts: [P3(x0, y0, eave), P3(x0 + h, ym, zr), P3(x0, y1, eave)], kind: 'roof' }, { pts: [P3(x1, y0, eave), P3(x1, y1, eave), P3(x1 - h, ym, zr)], kind: 'roof' }];
    }
    const xm = (x0 + x1) / 2, zr = eave + (xm - x0) * k;
    if (rf.type === 'gable') return [{ pts: [P3(x0, y0, eave), P3(xm, y0, zr), P3(xm, y1, zr), P3(x0, y1, eave)], kind: 'roof' }, { pts: [P3(xm, y0, zr), P3(x1, y0, eave), P3(x1, y1, eave), P3(xm, y1, zr)], kind: 'roof' }, { pts: [P3(x0 + o, y0 + o, eave), P3(xm, y0 + o, eave + (xm - x0 - o) * k), P3(x1 - o, y0 + o, eave)], kind: 'gable' }, { pts: [P3(x0 + o, y1 - o, eave), P3(xm, y1 - o, eave + (xm - x0 - o) * k), P3(x1 - o, y1 - o, eave)], kind: 'gable' }];
    const h = Math.min((y1 - y0) / 2, (x1 - x0) / 2);
    return [{ pts: [P3(x0, y0, eave), P3(xm, y0 + h, zr), P3(xm, y1 - h, zr), P3(x0, y1, eave)], kind: 'roof' }, { pts: [P3(xm, y0 + h, zr), P3(x1, y0, eave), P3(x1, y1, eave), P3(xm, y1 - h, zr)], kind: 'roof' }, { pts: [P3(x0, y0, eave), P3(x1, y0, eave), P3(xm, y0 + h, zr)], kind: 'roof' }, { pts: [P3(x0, y1, eave), P3(xm, y1 - h, zr), P3(x1, y1, eave)], kind: 'roof' }];
  }
  function setRoof(m, r) {
    if (!r || r.type === 'none') { delete m.roof; return null; }
    if (!ROOFS.includes(r.type)) throw new Error('Roof type must be flat, shed, gable or hip.');
    const pitch = r.type === 'flat' ? 0 : +r.pitch; if (r.type !== 'flat' && !(pitch > 0 && pitch <= 24)) throw new Error('Enter a roof pitch between 1:12 and 24:12.');
    m.roof = { type: r.type, pitch, overhang: Math.max(0, Math.min(60, +r.overhang || 0)), ridge: r.ridge === 'y' ? 'y' : 'x', parapet: r.type === 'flat' ? Math.max(0, Math.min(96, +r.parapet || 0)) : 0 };
    if (r.base > 0) m.roof.base = +r.base; return m.roof;
  }

  /* ------------------------------------------------------------ picture to plan
   * An interpretation (shape in INTERP_DOC) comes from the free tracer (clean floor plans) or the
   * DrawUp AI (any picture). It is converted here, at a scale the member can confirm. */
  const COMP_ALIAS = {
    chair: 'chair', seat: 'chair', stool: 'bar_stool', bar_stool: 'bar_stool', sofa: 'sofa', couch: 'sofa', armchair: 'armchair', bench: 'bench', booth: 'booth', banquette: 'booth',
    table: 'cafe_table', cafe_table: 'cafe_table', table_round: 'table_round', round_table: 'table_round', dining_table: 'dining_table', high_top: 'bar_table', bar_table: 'bar_table', coffee_table: 'coffee_table', rug: 'rug',
    bed: 'bed_queen', bed_queen: 'bed_queen', bed_king: 'bed_king', bed_twin: 'bed_twin', nightstand: 'nightstand', dresser: 'dresser', wardrobe: 'wardrobe', closet: 'closet_rod', bookshelf: 'bookshelf',
    base_cabinet: 'base_cabinet', counter: 'base_cabinet', upper_cabinet: 'upper_cabinet', island: 'island', kitchen_sink: 'kitchen_sink', range: 'range', stove: 'range', fridge: 'fridge', refrigerator: 'fridge', dishwasher: 'dishwasher', washer_dryer: 'washer_dryer',
    toilet: 'toilet', wc: 'toilet', lavatory: 'lav', lav: 'lav', sink: 'lav', vanity: 'lav_vanity', double_vanity: 'lav_vanity', tub: 'tub', bathtub: 'tub', shower: 'shower', urinal: 'urinal',
    shelving: 'wall_shelving', wall_shelving: 'wall_shelving', gondola: 'gondola', merchandise_shelving: 'wall_shelving', display_table: 'display_table', feature_display: 'display_table', display_case: 'display_case', pastry_case: 'display_case',
    checkout: 'checkout', checkout_counter: 'checkout', cash_wrap: 'checkout', checkout_u: 'checkout_u', curved_checkout: 'checkout_u', counter_oval: 'counter_oval', oval_counter: 'counter_oval', production_counter: 'counter_oval', counter_curve: 'counter_curve', curved_counter: 'counter_curve',
    stanchion: 'stanchion', queue_line: 'queue_line', queue: 'queue_line', mannequin: 'mannequin', kiosk: 'kiosk', digital_sign: 'kiosk', podium: 'podium', pedestal: 'podium',
    desk: 'desk', desk_l: 'desk_l', task_chair: 'task_chair', office_chair: 'task_chair', conference_table: 'conference', reception: 'reception', file_cabinet: 'file_cabinet',
    person: 'person', people: 'person', car: 'car', tree: 'tree', shrub: 'shrub', plant: 'planter', planter: 'planter', planter_box: 'planter_box',
    pendant: 'pendant', downlight: 'downlight', light: 'downlight', linear_light: 'linear_light', floor_lamp: 'floor_lamp',
    prep_table: 'prep_table', three_compartment_sink: 'comp_sink', oven: 'oven', fryer: 'oven', production_line: 'production_line', conveyor: 'production_line', walk_in: 'walk_in', cooler: 'walk_in', mop_sink: 'mop_sink', water_heater: 'water_heater', vending: 'vending',
    wall_sign: 'wall_sign', sign: 'wall_sign', blade_sign: 'blade_sign',
  };
  const compKey = t => { const k = String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); return lib().get(k) ? k : COMP_ALIAS[k] || COMP_ALIAS[k.replace(/s$/, '')] || null; };
  const ROOM_CEILING = { residential: 96, commercial: 120, retail: 120, office: 108 };

  /** Inches per image pixel, and how it was found. Order: the member's known dimension, a read
   *  dimension on the drawing (scale bar or room size), typical door width, then a plain guess. */
  function scaleOf(I, known) {
    if (known && known.inches > 0 && known.px > 0) return { k: known.inches / known.px, basis: 'known', note: `From your measurement: ${core().formatFtIn(known.inches)} over ${Math.round(known.px)} px.`, confirmed: true };
    const s = I.scale || {};
    if (s.inches_per_px > 0 && ['scale_bar', 'dimension_text', 'known_dimension'].includes(s.basis)) return { k: +s.inches_per_px, basis: s.basis, note: s.note || (s.basis === 'scale_bar' ? 'Read from the scale bar on the drawing.' : 'Read from dimensions written on the drawing.'), confirmed: false };
    const fromRooms = scaleFromRoomDims(I); if (fromRooms) return fromRooms;
    const doors = (I.openings || []).filter(o => /door/.test(o.kind) && !/double|pair|storefront/.test(o.kind) && o.width_px > 0).map(o => o.width_px).sort((a, b) => a - b);
    if (doors.length >= 2) { const med = doors[doors.length >> 1]; return { k: 34 / med, basis: 'typical_door', note: `Assumed: the ${doors.length} doors are about 2'-10" wide (a common interior door). Measure one wall to confirm.`, confirmed: false }; }
    if (s.inches_per_px > 0) return { k: +s.inches_per_px, basis: 'assumed', note: s.note || 'Assumed by DrawUp AI from typical sizes of what it sees. Measure one wall to confirm.', confirmed: false };
    const W = (I.image && I.image.w) || 1000; return { k: 480 / W, basis: 'assumed', note: 'Assumed: the picture is about 40\'-0" across. Measure one wall to confirm.', confirmed: false };
  }
  /** Room size labels like 13' x 17' against the room's drawn box: the median ratio is the scale. */
  function scaleFromRoomDims(I) {
    const ratios = [];
    (I.rooms || []).forEach(r => {
      const m = /(\d+(?:\.\d+)?)\s*['′]?\s*(?:-\s*(\d+)\s*["″]?)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*['′]?\s*(?:-\s*(\d+)\s*["″]?)?/i.exec(String(r.dims_text || '')); if (!m || !Array.isArray(r.poly) || r.poly.length < 3) return;
      const a = +m[1] * 12 + (+m[2] || 0), b = +m[3] * 12 + (+m[4] || 0), bb = bboxOf(r.poly), pw = bb.x1 - bb.x0, ph = bb.y1 - bb.y0; if (!(pw > 4 && ph > 4)) return;
      const big = Math.max(a, b), small = Math.min(a, b), pBig = Math.max(pw, ph), pSmall = Math.min(pw, ph);
      ratios.push(big / pBig, small / pSmall);
    });
    if (ratios.length < 2) return null;
    ratios.sort((a, b) => a - b); const med = ratios[ratios.length >> 1];
    const spread = ratios.filter(r => Math.abs(r / med - 1) < 0.12).length / ratios.length;
    return { k: med, basis: 'room_dims', note: `Read from ${ratios.length / 2} room sizes written on the plan (they agree ${Math.round(spread * 100)}%). Room sizes on listings are often rounded, so confirm one wall.`, confirmed: false };
  }
  const WT_BY = (role, t, residential, kind) => {
    if (kind === 'storefront') return 'curtain'; if (kind === 'low') return 'low';
    if (role === 'exterior') { if (t >= 10.5) return residential ? 'brick' : 'cmu12'; return residential ? 'wd6' : 'cmu8'; }
    return residential ? 'wd4' : (t >= 6.5 ? 'ms6' : 'ms358');
  };
  /** Interpretation -> Draw model. opts: { known: {px, inches}, scale: {k, basis}, ceiling, residential } */
  function fromInterpretation(I, opts) {
    opts = opts || {}; const C = core(), m = C.emptyModel(); ws(m);
    const planFrame = I.frame === 'plan_in';
    const sc = planFrame ? { k: 1, basis: I.scale && I.scale.basis || 'assumed', note: (I.scale && I.scale.note) || 'Sizes are DrawUp AI estimates from a perspective picture. Nothing here is measured.', confirmed: false } : (opts.scale || scaleOf(I, opts.known));
    const k = sc.k, residential = opts.residential != null ? !!opts.residential : /resid|house|home|apartment|bed/i.test(I.building_type || '') || (I.rooms || []).some(r => /bed|bath|wic|closet|kitchen|living|family|bonus/i.test(r.name || ''));
    const P = p => ({ x: p.x * k, y: p.y * k });
    const report = { scale: sc, dropped: [], merged: 0, assumptions: [], unknowns: [] };
    const A = (text, kind, more) => report.assumptions.push(Object.assign({ id: uid('as'), text, kind: kind || 'layout', status: 'assumed' }, more || {}));
    A(sc.note, 'scale', { basis: sc.basis, status: sc.confirmed ? 'confirmed' : 'assumed' });
    // walls
    let walls = (I.walls || []).map((w, i) => {
      let a = P(w.a), b = P(w.b); const t0 = (w.thickness_px > 0 ? w.thickness_px * k : (w.thickness_in || 0)) || (w.kind === 'exterior' ? 8 : 4.5);
      const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI, near = x => Math.abs(((x % 180) + 180) % 180);
      if (near(ang) < 4 || near(ang) > 176) { const y = (a.y + b.y) / 2; a.y = y; b.y = y; } else if (Math.abs(near(ang) - 90) < 4) { const x = (a.x + b.x) / 2; a.x = x; b.x = x; }
      const role = w.kind === 'interior' || w.kind === 'low' ? 'interior' : 'exterior';
      return { src: w.id || 'w' + i, a, b, t: Math.max(3.5, Math.min(16, t0)), role, kind: w.kind, curved: w.curved && w.curved.through ? P(w.curved.through) : null, conf: w.confidence };
    }).filter(w => dist(w.a, w.b) >= 6 || (report.dropped.push('a wall shorter than 6"'), false));
    // weld ends: cluster endpoints, then pull ends onto walls they nearly touch (T joints)
    const ends = []; walls.forEach(w => { ends.push([w, 'a'], [w, 'b']); });
    ends.forEach(([w, e], i) => { for (let j = 0; j < i; j++) { const [o, oe] = ends[j]; const tol = Math.max(w.t, o.t) * 1.1 + 2; if (dist(w[e], o[oe]) <= tol && dist(w[e], o[oe]) > 0) { const c = mul(add(w[e], o[oe]), 0.5); const dx = Math.abs(w.a.x - w.b.x) < 0.01, ox = Math.abs(o.a.x - o.b.x) < 0.01; const q = { x: dx ? w[e].x : ox ? o[oe].x : c.x, y: !dx && Math.abs(w.a.y - w.b.y) < 0.01 ? w[e].y : !ox && Math.abs(o.a.y - o.b.y) < 0.01 ? o[oe].y : c.y }; w[e] = { x: q.x, y: q.y }; o[oe] = { x: q.x, y: q.y }; report.merged++; } } });
    ends.forEach(([w, e]) => {
      if (walls.some(o => o !== w && (dist(o.a, w[e]) < 0.01 || dist(o.b, w[e]) < 0.01))) return;
      let best = null; walls.forEach(o => { if (o === w) return; const d = sub(o.b, o.a), L = len(d); const t = dot(sub(w[e], o.a), d) / (L * L); if (t < 0.02 || t > 0.98) return; const f = add(o.a, mul(d, t)), dd = dist(f, w[e]); if (dd <= o.t / 2 + w.t + 3 && (!best || dd < best.d)) best = { d: dd, f, o }; });
      if (best) { const dir = unit(sub(w[e === 'a' ? 'b' : 'a'], w[e])); const hd = unit(sub(best.o.b, best.o.a)); if (Math.abs(dot(dir, hd)) < 0.2) w[e] = { x: best.f.x, y: best.f.y }; }
    });
    // drop exact duplicates (tracers can find both faces of one wall)
    walls = walls.filter((w, i) => !walls.some((o, j) => j < i && ((dist(o.a, w.a) < 2 && dist(o.b, w.b) < 2) || (dist(o.a, w.b) < 2 && dist(o.b, w.a) < 2))));
    // shift to positive coordinates with a 2'-0" margin
    const all = []; walls.forEach(w => all.push(w.a, w.b)); (I.rooms || []).forEach(r => r.label_at && all.push(P(r.label_at))); (I.components || []).forEach(c => c.at && all.push(P(c.at)));
    const bb = all.length ? bboxOf(all) : { x0: 0, y0: 0 }, off = { x: 24 - bb.x0, y: 24 - bb.y0 }, T = p => ({ x: r8(p.x + off.x), y: r8(p.y + off.y) });
    const idMap = {};
    walls.forEach(w => {
      const wt = WT_BY(w.role, w.t, residential, w.kind), W = C.WALL_TYPES[wt];
      if (w.curved) { try { const cv = addCurvedWall(m, T(w.a), T(w.b), T(w.curved), { wtype: wt, thickness: W.thickness, type: W.role, height: opts.wallHeight || W.height }); idMap[w.src] = cv.id + '_s0'; } catch (e) { report.dropped.push('a curved wall (' + e.message + ')'); } return; }
      const x = { id: uid('w'), a: T(w.a), b: T(w.b), thickness: W.thickness, type: W.role, wtype: wt, height: opts.wallHeight || (W.role === 'exterior' ? (residential ? 108 : 144) : (residential ? 96 : 120)) };
      if (wt === 'low') x.height = 42;
      m.walls.push(x); idMap[w.src] = x.id;
    });
    if (m.walls.length) A(`Wall types are guesses from line thickness: ${residential ? '2x6 wood exterior, 2x4 wood partitions' : 'metal stud and CMU'}. Change any wall in its panel.`, 'walls');
    const hDefault = residential ? 96 : 120;
    // openings: on the wall the interpretation names, or the nearest wall
    (I.openings || []).forEach(o => {
      const at = o.at ? T(P(o.at)) : null; let wall = o.wall_id && idMap[o.wall_id] ? C.wallById(m, idMap[o.wall_id]) : null;
      if (at) { let best = null; m.walls.forEach(w => { const d = sub(w.b, w.a), L = len(d), t = dot(sub(at, w.a), d) / (L * L); if (t < 0 || t > 1) return; const f = add(w.a, mul(d, t)), dd = dist(f, at); if (dd < Math.max(18, w.thickness * 2) && (!best || dd < best.d)) best = { d: dd, w, t: t * L }; }); if (best && (!wall || best.w !== wall)) wall = best.w; if (best) o._t = best.t; }
      if (!wall) { report.dropped.push(`a ${o.kind || 'opening'} that is not on a wall`); return; }
      const L = C.wallLength(wall); let wd = o.width_in > 0 ? o.width_in : (o.width_px > 0 ? o.width_px * k : 0);
      const kind = /window|glaz/.test(o.kind) ? 'window' : /cased|opening|archway|pass/.test(o.kind) ? 'cased' : 'door';
      if (!(wd > 0)) { wd = kind === 'window' ? 36 : /double|pair|storefront|french/.test(o.kind) ? 72 : 36; A(`${kind === 'window' ? 'Window' : 'Door'} width assumed ${C.formatFtIn(wd)}.`, 'dimension'); }
      wd = Math.max(18, Math.min(L - 2, Math.round(wd / 2) * 2)); if (wd < 18) { report.dropped.push('an opening on a very short wall'); return; }
      const off0 = o._t != null ? o._t : L / 2, offset = Math.min(Math.max(r1(off0), wd / 2 + 1), L - wd / 2 - 1);
      const op = { id: uid('o'), wall: wall.id, kind, offset, width: wd, tag: '', head: kind === 'window' ? 84 : (/storefront/.test(o.kind) ? 96 : 80) };
      if (kind === 'window') op.sill = wall.wtype === 'curtain' ? 12 : (residential ? 36 : 30);
      if (m.openings.some(x => x.wall === wall.id && Math.abs(x.offset - op.offset) < (x.width + op.width) / 2)) { report.dropped.push('an overlapping opening'); return; }
      m.openings.push(op);
    });
    // rooms
    (I.rooms || []).forEach(r => {
      if (!r.label_at && !(r.poly && r.poly.length >= 3)) return;
      const at = r.label_at ? T(P(r.label_at)) : T(centroidOf(r.poly.map(P)));
      const room = { id: uid('r'), name: String(r.name || 'ROOM').toUpperCase().slice(0, 40), number: '', ceiling: r.ceiling_in > 0 ? r.ceiling_in : (opts.ceiling > 0 ? opts.ceiling : hDefault), at, kind: r.kind || null };
      if (r.dims_text) room.size_text = String(r.dims_text).slice(0, 30);
      if (Array.isArray(r.poly) && r.poly.length >= 3 && r.poly_exact) room.poly = r.poly.map(p => T(P(p)));
      m.rooms.push(room);
    });
    if (m.rooms.length && !(opts.ceiling > 0) && !(I.rooms || []).some(r => r.ceiling_in > 0)) A(`Ceiling heights assumed ${C.formatFtIn(hDefault)} (${residential ? 'typical for a house' : 'typical for a store'}). Change them in each room's panel.`, 'height');
    // components
    (I.components || []).forEach(cpt => {
      const key = compKey(cpt.type); if (!key || !cpt.at) { report.dropped.push(`a ${cpt.label || cpt.type || 'component'} DrawUp has no symbol for yet`); return; }
      const d0 = lib().get(key), at = T(P(cpt.at));
      const it = lib().make(key, at, { rot: Math.round((+cpt.rot || 0) / 15) * 15 });
      if (cpt.w_px > 0) it.w = r1(Math.max(6, cpt.w_px * k)); else if (cpt.w_in > 0) it.w = r1(cpt.w_in);
      if (cpt.d_px > 0) it.d = r1(Math.max(6, cpt.d_px * k)); else if (cpt.d_in > 0) it.d = r1(cpt.d_in);
      if (cpt.h_in > 0) it.h = r1(cpt.h_in);
      if (cpt.label && d0 && !/chair|stool|stanchion|person|downlight/.test(key)) it.label = String(cpt.label).slice(0, 60);
      if (cpt.note) it.note = String(cpt.note).slice(0, 40);
      try { C.addItem(m, 'component', it); } catch (e) { report.dropped.push(cpt.type + ' (' + e.message + ')'); }
    });
    (I.unknowns || []).forEach(u => report.unknowns.push({ id: uid('uk'), text: String(u.what || u.text || '').slice(0, 300), at: u.at ? T(planFrame ? u.at : P(u.at)) : null, status: 'open' }));
    (I.assumptions || []).forEach(a => A(String(a.text || a).slice(0, 300), a.kind || 'layout'));
    if (I.roof && ROOFS.includes(I.roof.type)) { try { setRoof(m, I.roof); A(`Roof: ${I.roof.type}${I.roof.pitch ? ' at ' + I.roof.pitch + ':12' : ''}, as seen or assumed.`, 'roof'); } catch (_e) { /* ignore a bad roof */ } }
    const w = ws(m); w.assumptions = report.assumptions; w.unknowns = report.unknowns; w.scale = { inches_per_px: k, basis: sc.basis, confirmed: !!sc.confirmed, offset: off };
    w.source = { kind: I.source_kind || 'floor_plan', by: I.by || 'ai', frame: I.frame || 'image_px' };
    if (report.dropped.length) A(`Left out: ${[...new Set(report.dropped)].slice(0, 8).join('; ')}.`, 'dropped');
    return { model: m, report };
  }
  /** Rescales a converted model so the wall (or two points) measures `inches`. Everything scales
   *  about the plan origin; wall thicknesses, opening widths and component sizes are kept, since
   *  those come from types and the library, not from the picture. */
  function rescale(m, factor) {
    if (!(factor > 0) || Math.abs(factor - 1) < 1e-9) return m;
    const S = p => ({ x: r8(p.x * factor), y: r8(p.y * factor) });
    const C = core();
    const lens = new Map(m.walls.map(w => [w.id, C.wallLength(w)]));
    m.walls.forEach(w => { w.a = S(w.a); w.b = S(w.b); });
    m.openings.forEach(o => { const w = C.wallById(m, o.wall); if (!w) return; const L = C.wallLength(w); o.offset = Math.min(Math.max(r1(o.offset * L / (lens.get(w.id) || L)), o.width / 2 + 1), L - o.width / 2 - 1); });
    m.rooms.forEach(r => { r.at = S(r.at); if (r.poly) r.poly = r.poly.map(S); });
    (m.items || []).forEach(it => { if (it.at) it.at = S(it.at); if (it.a) it.a = S(it.a); if (it.b) it.b = S(it.b); });
    (m.curves || []).forEach(cv => { cv.a = S(cv.a); cv.b = S(cv.b); cv.m = S(cv.m); buildCurve(m, cv); });
    const w = ws(m); (w.unknowns || []).forEach(u => { if (u.at) u.at = S(u.at); });
    if (w.scale) { w.scale.inches_per_px = (w.scale.inches_per_px || 1) * factor; if (w.scale.offset) w.scale.offset = { x: w.scale.offset.x * factor, y: w.scale.offset.y * factor }; } // the picture underneath scales with the plan
    return m;
  }

  /* ------------------------------------------------------------ commands (no AI)
   * "move this wall 2 feet north", "make it 10' tall", "change the roof slope to 6:12",
   * "make this storefront curved", "set the ceiling to 12 feet", "show me this wall in section",
   * "add a door", "rotate 45", "delete this". Anything else goes to the AI (or asks). */
  const WORDN = { zero: 0, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, eighteen: 18, twenty: 20, thirty: 30, half: 0.5 };
  function lengthIn(text) {
    const s = String(text).toLowerCase().replace(/(\d)\s*(feet|foot|ft)\b/g, "$1'").replace(/(\d)\s*(inches|inch|in)\b/g, '$1"').replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|eighteen|twenty|thirty)\s+(feet|foot|ft)\b/g, (_m, n) => WORDN[n] + "'").replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|eighteen|twenty)\s+(inches|inch)\b/g, (_m, n) => WORDN[n] + '"');
    const m = /(-?\d+(?:\.\d+)?)\s*'\s*(?:-?\s*(\d+(?:\.\d+)?)\s*(?:"|\b))?|(-?\d+(?:\.\d+)?)\s*"/.exec(s);
    if (!m) return null; if (m[3] != null) return +m[3]; return +m[1] * 12 + (+m[2] || 0);
  }
  const DIRS = { north: { x: 0, y: -1 }, up: { x: 0, y: -1 }, south: { x: 0, y: 1 }, down: { x: 0, y: 1 }, east: { x: 1, y: 0 }, right: { x: 1, y: 0 }, west: { x: -1, y: 0 }, left: { x: -1, y: 0 } };
  function parseCommand(text, ctx) {
    const t = ' ' + String(text || '').toLowerCase().replace(/[’']s\b/g, ' is').trim() + ' ', m = ctx.model, sel = ctx.sel, C = core();
    const L = lengthIn(t), dir = Object.keys(DIRS).find(d => new RegExp('\\b' + d + '(ward|wards)?\\b').test(t));
    const selWall = sel && sel.type === 'wall' ? C.wallById(m, sel.id) : null, selItem = sel && sel.type === 'item' ? (m.items || []).find(x => x.id === sel.id) : null;
    const selRoom = sel && sel.type === 'room' ? m.rooms.find(x => x.id === sel.id) : null, selOpening = sel && sel.type === 'opening' ? m.openings.find(x => x.id === sel.id) : null;
    const name = selWall ? 'this wall' : selItem ? 'this ' + ((lib().get(selItem.comp) || {}).name || selItem.kind).toLowerCase() : selRoom ? selRoom.name.toLowerCase() : 'it';
    const need = what => ({ clarify: `Select ${what} first (tap it on the plan), then ask again.` });
    // view requests (no geometry change)
    if (/\b(show|see|cut|view)\b.*\bsection\b/.test(t)) { if (!selWall && !selItem && !selOpening) return need('a wall'); return { view: { kind: 'section', through: sel }, summary: `Open a section cut through ${name}.` }; }
    if (/\b(show|see|view)\b.*\belevation\b/.test(t)) { return { view: { kind: 'elevation', through: sel || null }, summary: 'Open the elevation view.' }; }
    if (/\b(show|see|view)\b.*\b3d\b|\bin 3d\b/.test(t)) return { view: { kind: '3d' }, summary: 'Open the 3D view.' };
    // undo / delete
    if (/\b(delete|remove|get rid of)\b/.test(t) && /\b(this|it|that|selected)\b/.test(t)) { if (!sel) return need('what to delete'); return { ops: [{ op: 'remove', target: sel }], summary: `Delete ${name}.` }; }
    // roof
    const pitch = /(\d+(?:\.\d+)?)\s*(?::|\/|in|on)\s*12\b/.exec(t);
    if (/\broof\b/.test(t)) {
      const type = ['flat', 'shed', 'gable', 'hip'].find(x => t.includes(x)), rf = m.roof || {};
      if (pitch || type || /slope|pitch|steeper|flatter/.test(t)) {
        let p = pitch ? +pitch[1] : rf.pitch || 4; if (!pitch && /steeper/.test(t)) p = Math.min(24, (rf.pitch || 4) + 2); if (!pitch && /flatter|lower/.test(t)) p = Math.max(1, (rf.pitch || 4) - 2);
        const ty = type || (rf.type && rf.type !== 'flat' ? rf.type : 'gable');
        return { ops: [{ op: 'roof', type: ty, pitch: ty === 'flat' ? 0 : p, overhang: rf.overhang != null ? rf.overhang : 12, ridge: rf.ridge || 'x' }], summary: ty === 'flat' ? 'Make the roof flat.' : `Make the roof a ${ty} at ${p}:12.` };
      }
    }
    // ceiling
    if (/\bceiling\b/.test(t)) {
      if (L == null) return { clarify: 'What ceiling height? For example "make the ceiling 10 feet".' };
      const all = /\ball\b|\bevery\b|\beverywhere\b/.test(t) || !selRoom;
      return { ops: [{ op: 'ceiling', room: all ? 'all' : selRoom.id, height: L }], summary: `Set the ${all ? 'ceilings' : selRoom.name.toLowerCase() + ' ceiling'} to ${C.formatFtIn(L)}.` };
    }
    // curved
    if (/\bcurv(e|ed|ing)\b|\bbow\b|\barc\b|\bround(ed)?\b/.test(t) && !/\bstraight\b/.test(t)) {
      if (!selWall) return need('the wall or storefront to curve');
      const W = C.wallLength(selWall), b = L != null ? L : Math.round(Math.min(W / 5, 60)); const s = /\bin(ward|side)?\b/.test(t) ? -1 : 1;
      return { ops: [{ op: 'curve_wall', id: selWall.id, bulge: s * b * (selWall.type === 'exterior' ? outwardSign(m, selWall) : 1) }], summary: `Curve ${name} so its middle bows ${C.formatFtIn(b)} ${s > 0 ? 'out' : 'in'}.`, note: m.openings.some(o => o.wall === selWall.id) ? 'Doors and windows on this wall come off: openings on curved walls are not supported yet.' : '' };
    }
    if (/\bstraight(en)?\b/.test(t) && selWall && selWall.curve) return { ops: [{ op: 'straighten', id: selWall.curve.id }], summary: 'Make this curved wall straight again.' };
    // height / tall
    if (/\b(tall|taller|high|height)\b/.test(t) && !/\bceiling\b/.test(t)) {
      if (L == null) return { clarify: 'How tall? For example "make this wall 12 feet tall".' };
      if (selWall) return { ops: [{ op: 'wall_height', id: selWall.id, height: L }], summary: `Make ${name} ${C.formatFtIn(L)} tall.` };
      if (selItem && selItem.kind === 'component') return { ops: [{ op: 'item_size', id: selItem.id, h: L }], summary: `Make ${name} ${C.formatFtIn(L)} tall.` };
      if (/\ball walls|\bthe walls\b/.test(t)) return { ops: [{ op: 'wall_height', id: 'all', height: L }], summary: `Make every wall ${C.formatFtIn(L)} tall.` };
      return need('a wall');
    }
    // thickness
    if (/\bthick(er|ness)?\b/.test(t) && selWall) { if (L == null) return { clarify: 'How thick? For example "make this wall 8 inches thick".' }; return { ops: [{ op: 'wall_thickness', id: selWall.id, thickness: L }], summary: `Make ${name} ${C.formatFtIn(L)} thick.` }; }
    // length / longer / wider
    if (/\b(long|longer|length|shorter|wide|wider|narrower|width)\b/.test(t) && L != null) {
      if (selWall) { const cur = C.wallFaceLength(m, selWall); const v = /\b(longer|by)\b/.test(t) && !/\bto\b/.test(t) ? cur + L : /\bshorter\b/.test(t) && !/\bto\b/.test(t) ? cur - L : L; return { ops: [{ op: 'wall_length', id: selWall.id, length: v, anchor: 'a' }], summary: `Make ${name} ${C.formatFtIn(v)} long (the start stays put).` }; }
      if (selOpening) return { ops: [{ op: 'opening_size', id: selOpening.id, width: L }], summary: `Make this ${selOpening.kind} ${C.formatFtIn(L)} wide.` };
      if (selItem && selItem.kind === 'component') return { ops: [{ op: 'item_size', id: selItem.id, w: L }], summary: `Make ${name} ${C.formatFtIn(L)} wide.` };
    }
    // rotate
    const deg = /rotat\w*\s*(?:it|this)?\s*(?:by\s*)?(-?\d+)\s*(?:°|deg|degrees)?/.exec(t);
    if (deg || /\bturn\b.*\b(around|90)\b/.test(t)) { if (!sel) return need('what to rotate'); return { ops: [{ op: 'rotate', target: sel, deg: deg ? +deg[1] : 90 }], summary: `Rotate ${name} ${deg ? deg[1] : 90}°.` }; }
    // move
    if (/\b(move|shift|push|slide|nudge|pull)\b/.test(t)) {
      if (!sel) return need('what to move');
      if (L == null) return { clarify: `How far? For example "move ${name} 2 feet north".` };
      let d = dir ? DIRS[dir] : null;
      if (!d && selWall) { const n = unit({ x: -(selWall.b.y - selWall.a.y), y: selWall.b.x - selWall.a.x }), horiz = Math.abs(n.y) > Math.abs(n.x); return { clarify: `Which way should ${name} move ${C.formatFtIn(L)}?`, choices: horiz ? [['north', `Move ${name} ${C.formatFtIn(L)} north`], ['south', `Move ${name} ${C.formatFtIn(L)} south`]] : [['east', `Move ${name} ${C.formatFtIn(L)} east`], ['west', `Move ${name} ${C.formatFtIn(L)} west`]] }; }
      if (!d) return { clarify: `Which way: north, south, east or west?`, choices: ['north', 'south', 'east', 'west'].map(x => [x, `Move ${name} ${C.formatFtIn(L)} ${x}`]) };
      if (selWall) { const along = unit(sub(selWall.b, selWall.a)); if (Math.abs(dot(along, d)) > 0.9) return { clarify: `That direction runs along the wall. To make it longer, say "make this wall ${C.formatFtIn(C.wallFaceLength(m, selWall) + L)} long".` }; }
      return { ops: [{ op: 'move', target: sel, dx: d.x * L, dy: d.y * L }], summary: `Move ${name} ${C.formatFtIn(L)} ${dir}.` };
    }
    // add a door / window to the selected wall
    const addK = /\badd\b.*\b(door|window|opening)\b/.exec(t);
    if (addK && selWall) { const kind = addK[1] === 'opening' ? 'cased' : addK[1]; const width = L || (kind === 'window' ? 36 : 36); return { ops: [{ op: 'add_opening', wall: selWall.id, kind, width, offset: C.wallLength(selWall) / 2 }], summary: `Add a ${C.formatFtIn(width)} ${kind === 'cased' ? 'cased opening' : kind} in the middle of this wall.` }; }
    return { ai: true };
  }
  function outwardSign(m, w) { const n0 = unit({ x: -(w.b.y - w.a.y), y: w.b.x - w.a.x }), out = core().outwardNormal ? null : null; const c = mul(add(w.a, w.b), 0.5), ctr = (() => { const ex = m.walls.filter(x => x.type === 'exterior'); let sx = 0, sy = 0; ex.forEach(x => { sx += x.a.x + x.b.x; sy += x.a.y + x.b.y; }); return { x: sx / (2 * ex.length || 1), y: sy / (2 * ex.length || 1) }; })(); void out; return dot(sub(c, ctr), n0) > 0 ? 1 : -1; }

  /* ------------------------------------------------------------ ops: one place applies every change */
  const OPS = ['move', 'remove', 'roof', 'ceiling', 'curve_wall', 'straighten', 'wall_height', 'wall_thickness', 'wall_length', 'wall_type', 'opening_size', 'add_opening', 'item_size', 'rotate', 'add_wall', 'add_room', 'rename_room', 'add_component', 'replace_component', 'finish'];
  function applyOps(m, ops) {
    const C = core(), notes = []; ws(m);
    (ops || []).forEach(o => {
      if (!o || !OPS.includes(o.op)) throw new Error('Unknown change: ' + (o && o.op));
      const T = o.target || {};
      switch (o.op) {
        case 'move': {
          const dx = +o.dx || 0, dy = +o.dy || 0; if (Math.hypot(dx, dy) > 1200) throw new Error('That move is over 100 feet.');
          if (T.type === 'wall') moveWall(m, T.id, dx, dy);
          else if (T.type === 'item') C.moveItem(m, T.id, dx, dy);
          else if (T.type === 'room') { const r = m.rooms.find(x => x.id === T.id); if (!r) throw new Error('Room not found.'); r.at = { x: r8(r.at.x + dx), y: r8(r.at.y + dy) }; if (r.poly) r.poly = r.poly.map(p => ({ x: r8(p.x + dx), y: r8(p.y + dy) })); }
          else if (T.type === 'opening') { const op = m.openings.find(x => x.id === T.id), w = op && C.wallById(m, op.wall); if (!w) throw new Error('Opening not found.'); const d = unit(sub(w.b, w.a)); C.moveOpening(m, op.id, op.offset + dx * d.x + dy * d.y); }
          else throw new Error('Pick something to move.'); break;
        }
        case 'remove': if (T.type === 'wall') { const w = C.wallById(m, T.id); if (w && w.curve) removeCurve(m, w.curve.id); else C.removeWall(m, T.id); } else if (T.type === 'opening') C.removeOpening(m, T.id); else if (T.type === 'item') C.removeItem(m, T.id); else if (T.type === 'room') m.rooms = m.rooms.filter(r => r.id !== T.id); break;
        case 'roof': setRoof(m, o); break;
        case 'ceiling': { const h = +o.height; if (!(h >= 72 && h <= 600)) throw new Error('Ceilings must be between 6\'-0" and 50\'-0".'); m.rooms.forEach(r => { if (o.room === 'all' || r.id === o.room) r.ceiling = r8(h); }); const tall = m.walls.filter(w => w.height < h).length; if (tall) notes.push(`${tall} wall${tall > 1 ? 's are' : ' is'} shorter than the new ceiling. Raise them with "make all walls ${C.formatFtIn(h)} tall".`); break; }
        case 'curve_wall': { const r = curveWall(m, o.id, +o.bulge); if (r && r.droppedOpenings) notes.push(`${r.droppedOpenings} opening${r.droppedOpenings > 1 ? 's were' : ' was'} removed from the curved wall.`); break; }
        case 'straighten': { const cv = (m.curves || []).find(c => c.id === o.id); if (!cv) throw new Error('Curve not found.'); removeCurve(m, cv.id); const w = { id: uid('w'), a: cv.a, b: cv.b, thickness: cv.thickness, type: cv.type, height: cv.height }; if (cv.wtype) w.wtype = cv.wtype; m.walls.push(w); break; }
        case 'wall_height': { const h = +o.height; if (!(h >= 12 && h <= 1200)) throw new Error('Enter a wall height like 10\'-0".'); m.walls.forEach(w => { if (o.id === 'all' || w.id === o.id || (w.curve && core().wallById(m, o.id) && core().wallById(m, o.id).curve && core().wallById(m, o.id).curve.id === w.curve.id)) w.height = r8(h); }); (m.curves || []).forEach(cv => { if (o.id === 'all' || (C.wallById(m, o.id) || {}).curve?.id === cv.id) cv.height = r8(h); }); break; }
        case 'wall_thickness': { const v = +o.thickness; if (!(v >= 2 && v <= 48)) throw new Error('Enter a thickness like 0\'-6".'); const w = C.wallById(m, o.id); if (!w) throw new Error('Wall not found.'); w.thickness = r8(v); break; }
        case 'wall_length': { const w = C.wallById(m, o.id); if (!w) throw new Error('Wall not found.'); if (w.curve) throw new Error('Curved walls change size from their end points; drag them in the plan.'); if (!(o.length >= 6 && o.length <= 12000)) throw new Error('Enter a length like 12\'-0".'); C.setWallFaceLength(m, w.id, +o.length, o.anchor === 'b' ? 'b' : 'a'); break; }
        case 'wall_type': C.setWallType(m, o.id, o.wtype); break;
        case 'opening_size': { const op = m.openings.find(x => x.id === o.id); if (!op) throw new Error('Opening not found.'); C.moveOpening(m, op.id, op.offset, o.width > 0 ? +o.width : op.width); if (o.head > 0) op.head = +o.head; if (op.kind === 'window' && o.sill >= 0 && o.sill != null) op.sill = +o.sill; break; }
        case 'add_opening': { const w = C.wallById(m, o.wall); if (!w) throw new Error('Wall not found.'); const L = C.wallLength(w), wd = Math.min(+o.width || 36, L - 2); C.addOpening(m, w.id, o.kind === 'window' ? 'window' : o.kind === 'cased' ? 'cased' : 'door', Math.min(Math.max(+o.offset || L / 2, wd / 2 + 1), L - wd / 2 - 1), wd, { tag: '' }); break; }
        case 'item_size': { const it = (m.items || []).find(x => x.id === o.id); if (!it || it.kind !== 'component') throw new Error('Pick a component.'); ['w', 'd', 'h'].forEach(k => { if (o[k] > 0) it[k] = r8(Math.min(+o[k], 12000)); }); break; }
        case 'rotate': rotateTarget(m, o.target, +o.deg || 90); break;
        case 'add_wall': { const W = C.WALL_TYPES[o.wtype] ? o.wtype : 'ms358'; C.addWall(m, o.a, o.b, { wtype: W }); break; }
        case 'add_room': m.rooms.push({ id: uid('r'), name: String(o.name || 'ROOM').toUpperCase().slice(0, 40), number: '', ceiling: o.ceiling > 0 ? +o.ceiling : 96, at: { x: r8(o.at.x), y: r8(o.at.y) } }); break;
        case 'rename_room': { const r = m.rooms.find(x => x.id === o.id); if (!r) throw new Error('Room not found.'); r.name = String(o.name || r.name).toUpperCase().slice(0, 40); break; }
        case 'add_component': { if (!lib().get(o.comp)) throw new Error('Unknown component: ' + o.comp); C.addItem(m, 'component', lib().make(o.comp, o.at, { rot: +o.rot || 0, w: o.w > 0 ? +o.w : undefined, d: o.d > 0 ? +o.d : undefined, h: o.h > 0 ? +o.h : undefined })); m.items[m.items.length - 1] = C.normalizeModel({ items: [m.items[m.items.length - 1]] }).items[0]; break; }
        case 'replace_component': { const it = (m.items || []).find(x => x.id === o.id); const c = lib().get(o.comp); if (!it || !c) throw new Error('Pick a component and what to replace it with.'); it.comp = c.key; if (!o.keepSize) { it.w = c.w; it.d = c.d; it.h = c.h; } break; }
        case 'finish': { const w = ws(m), key = o.room || 'all'; w.finishes[key] = Object.assign({}, w.finishes[key] || {}, pickFinish(o)); break; }
      }
    });
    return { model: m, notes };
  }
  function pickFinish(o) { const out = {}; ['floor', 'wall', 'ceiling', 'accent'].forEach(k => { if (o[k]) out[k] = String(o[k]).slice(0, 40); }); return out; }

  /** A plain-text summary of the drawing for Arch Coach / Teammate: what is there, what is selected. */
  function describe(m, sel) {
    const C = core(), rooms = roomOutlines(m), lines = [];
    const ext = m.walls.filter(w => w.type === 'exterior'), b = envelope(m);
    lines.push(`DRAWING: ${m.walls.length} walls (${ext.length} exterior${(m.curves || []).length ? ', ' + m.curves.length + ' curved' : ''}), ${m.openings.length} doors/windows/openings, ${m.rooms.length} rooms, ${(m.items || []).filter(i => i.kind === 'component').length} components.`);
    if (b) lines.push(`OUTSIDE SIZE: about ${C.formatFtIn(b.x1 - b.x0)} east-west x ${C.formatFtIn(b.y1 - b.y0)} north-south. Coordinates are inches, x east, y south.`);
    rooms.forEach(r => lines.push(`ROOM ${r.room.id}: ${r.room.name} at (${Math.round(r.room.at.x)}, ${Math.round(r.room.at.y)}), ceiling ${C.formatFtIn(r.room.ceiling)}${r.sf ? ', about ' + Math.round(r.sf) + ' sf' : ''}.`));
    m.walls.slice(0, 80).forEach(w => { if (w.curve && w.curve.i) return; lines.push(`WALL ${w.id}: ${w.type}${w.curve ? ' curved' : ''} ${C.wallTypeKey(w)} from (${Math.round(w.a.x)}, ${Math.round(w.a.y)}) to (${Math.round(w.b.x)}, ${Math.round(w.b.y)}), ${C.formatFtIn(w.thickness)} thick, ${C.formatFtIn(w.height)} tall.`); });
    m.openings.slice(0, 60).forEach(o => lines.push(`OPENING ${o.id}: ${o.kind} ${C.formatFtIn(o.width)} wide on wall ${o.wall} at ${Math.round(o.offset)}" from its start.`));
    (m.items || []).filter(i => i.kind === 'component').slice(0, 80).forEach(i => lines.push(`COMPONENT ${i.id}: ${i.comp} at (${Math.round(i.at.x)}, ${Math.round(i.at.y)}), ${Math.round(i.w)}x${Math.round(i.d)}", rotated ${i.rot || 0}.`));
    if (m.roof) lines.push(`ROOF: ${m.roof.type}${m.roof.pitch ? ' ' + m.roof.pitch + ':12' : ''}.`);
    if (sel) lines.push(`SELECTED: ${sel.type} ${sel.id}.`);
    const w = m.ws || {}; (w.assumptions || []).filter(a => a.status !== 'confirmed').slice(0, 10).forEach(a => lines.push('ASSUMPTION: ' + a.text));
    return lines.join('\n');
  }

  const api = { ws, geomHash, area, inside, insetPoly, centroidOf, bboxOf, faces, roomOutlines, moveWall, stretchWall, offsetWall, trimExtend, joinWalls, rotateTarget,
    addCurvedWall, buildCurve, setCurveBulge, curveBulge, curveWall, removeCurve, arcPts, ROOFS, roofPlanes, setRoof, envelope,
    compKey, scaleOf, scaleFromRoomDims, fromInterpretation, rescale, lengthIn, parseCommand, applyOps, OPS, describe };
  if (NODE) module.exports = api; else root.DrawUpWSGeo = api;
})(typeof window !== 'undefined' ? window : globalThis);
