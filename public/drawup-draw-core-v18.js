/* DrawUp Draw core — V18 (V20: heights, wall types, columns, stairs, fixtures, text, dimensions)
 *
 * The drawing is a model, not a picture: walls are segments with a thickness, doors and
 * windows are hosted on walls at an offset, rooms are labels. Every dimension string is
 * COMPUTED from that geometry each time the sheet is drawn; no dimension text is stored.
 * Change a wall from 20'-0" to 22'-0" and every affected dimension is recomputed.
 *
 * Units: inches. Plan coordinates: x to the right, y down the sheet (north is up).
 * Works in the browser (window.DrawUpDrawCore) and in Node (module.exports) for tests.
 */
(function (root) {
  'use strict';
  const EPS = 1e-6;
  const SNAP = 1 / 8; // geometry is kept on a 1/8" grid so dimension strings always reconcile

  /* ----------------------------------------------------------- units */
  function snap(v, step) { step = step || SNAP; return Math.round(v / step) * step; }
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  /** 264 → 22'-0"   42.5 → 3'-6 1/2"   8 → 0'-8" (architectural, nearest 1/8") */
  function formatFtIn(inches, precision) {
    const den = Math.round(1 / (precision || SNAP));
    let total = Math.round(Math.abs(inches) * den);
    const neg = inches < 0 && total > 0;
    let ft = Math.floor(total / (12 * den));
    total -= ft * 12 * den;
    let whole = Math.floor(total / den);
    let num = total - whole * den;
    let frac = '';
    if (num) { const g = gcd(num, den); frac = ' ' + (num / g) + '/' + (den / g); }
    return (neg ? '-' : '') + ft + "'-" + whole + frac + '"';
  }
  /** Parses 22' · 22'-0" · 22'6 · 21' 6 1/2" · 264" · 264 (bare number = inches) · 22.5' */
  function parseFtIn(text) {
    const s = String(text || '').trim().replace(/[″”]/g, '"').replace(/[′’]/g, "'");
    if (!s) return NaN;
    const frac = t => { t = (t || '').trim(); if (!t) return 0; let m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t); if (m) return +m[1] + m[2] / m[3]; m = /^(\d+)\/(\d+)$/.exec(t); if (m) return m[1] / m[2]; return /^\d*\.?\d+$/.test(t) ? +t : NaN; };
    let m = /^(-?\d*\.?\d+)\s*'\s*(?:-?\s*([\d\s\/.]*)\s*"?)?$/.exec(s);
    if (m) { const inch = frac(m[2]); return isNaN(inch) ? NaN : +m[1] * 12 + inch; }
    m = /^([\d\s\/.]+)\s*"?$/.exec(s);
    if (m) return frac(m[1]);
    return NaN;
  }

  /* ----------------------------------------------------------- vectors */
  const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });
  const add = (p, q) => ({ x: p.x + q.x, y: p.y + q.y });
  const mul = (p, k) => ({ x: p.x * k, y: p.y * k });
  const len = p => Math.hypot(p.x, p.y);
  const dist = (p, q) => len(sub(p, q));
  const norm = p => { const l = len(p) || 1; return { x: p.x / l, y: p.y / l }; };
  const same = (p, q, tol) => dist(p, q) <= (tol || 0.01);

  function uid(prefix) { return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function emptyModel() { return { units: 'in', walls: [], openings: [], rooms: [], items: [] }; }

  /* ----------------------------------------------------------- wall types (V20)
   * Each type sets a thickness (finish face to finish face), a default height, whether it
   * behaves as an exterior wall (dimensioned to its outside face) and how it is drawn:
   * a fill plus a hatch, so types read differently on the plan and in every export.  */
  const WALL_TYPES = {
    generic_ext: { name: 'Exterior wall (generic)', thickness: 6, role: 'exterior', height: 108, fill: '#b9c6d3', hatch: 'solid' },
    generic_int: { name: 'Partition (generic)', thickness: 4.5, role: 'interior', height: 96, fill: '#b9c6d3', hatch: 'solid' },
    wd4: { name: '2x4 wood stud partition', thickness: 4.5, role: 'interior', height: 96, fill: '#f3e9d4', hatch: 'wood' },
    wd6: { name: '2x6 wood stud exterior', thickness: 6.5, role: 'exterior', height: 108, fill: '#ecdcbc', hatch: 'wood' },
    ms358: { name: '3-5/8" metal stud partition', thickness: 4.875, role: 'interior', height: 96, fill: '#e2eaf2', hatch: 'metal' },
    ms6: { name: '6" metal stud wall', thickness: 7.25, role: 'interior', height: 108, fill: '#d6e1ec', hatch: 'metal' },
    cmu8: { name: '8" CMU', thickness: 7.625, role: 'exterior', height: 108, fill: '#ffffff', hatch: 'cmu' },
    cmu12: { name: '12" CMU', thickness: 11.625, role: 'exterior', height: 108, fill: '#ffffff', hatch: 'cmu' },
    conc8: { name: '8" cast-in-place concrete', thickness: 8, role: 'exterior', height: 108, fill: '#e4e4e1', hatch: 'conc' },
    brick: { name: 'Brick veneer on 2x6 stud', thickness: 11.125, role: 'exterior', height: 108, fill: '#f1d3c6', hatch: 'brick' },
    curtain: { name: 'Curtain wall / storefront', thickness: 6, role: 'exterior', height: 108, fill: '#dcf2fb', hatch: 'glass' },
    rated1: { name: '1-hr fire-rated demising partition', thickness: 4.875, role: 'interior', height: 108, fill: '#c7cfd8', hatch: 'rated' },
    low: { name: 'Low wall / pony wall', thickness: 4.5, role: 'interior', height: 42, fill: '#ffffff', hatch: 'low' },
  };
  function wallTypeKey(w) { return WALL_TYPES[w.wtype] ? w.wtype : (w.type === 'exterior' ? 'generic_ext' : 'generic_int'); }
  function wallType(w) { return WALL_TYPES[wallTypeKey(w)]; }
  const DEFAULT_HEAD = 84, DEFAULT_SILL = 36, DEFAULT_CEILING = 96;
  function defaultWallHeight(w) { return WALL_TYPES[w.wtype] ? WALL_TYPES[w.wtype].height : (w.type === 'exterior' ? 108 : 96); }
  const ITEM_KINDS = ['column', 'stair', 'text', 'dim', 'fixture', 'shape'];
  /* V22: free-angle shapes. Points are local to `at` and turn with `rot`, so move / rotate / copy work like any item. */
  const SHAPES = ['line', 'polyline', 'arc', 'circle', 'rect', 'polygon', 'curve'];
  const SHAPE_WEIGHTS = { fine: 'shpf', medium: 'shpm', heavy: 'shph' };
  const FIXTURES = { wc: 'Toilet', lav: 'Lavatory', sink: 'Kitchen sink', tub: 'Bathtub', shower: 'Shower' };
  const okPt = p => p && isFinite(p.x) && isFinite(p.y);

  /** Fills in anything an older saved drawing does not have (heights, items), so V18/V19
   *  drawings open unchanged. Geometry is never altered here. */
  function normalizeModel(m) {
    m = m && typeof m === 'object' ? clone(m) : emptyModel();
    m.units = 'in'; m.walls = Array.isArray(m.walls) ? m.walls : []; m.openings = Array.isArray(m.openings) ? m.openings : []; m.rooms = Array.isArray(m.rooms) ? m.rooms : [];
    m.items = Array.isArray(m.items) ? m.items.filter(it => it && ITEM_KINDS.includes(it.kind) && (it.kind === 'dim' ? okPt(it.a) && okPt(it.b) : okPt(it.at))) : [];
    m.walls.forEach(w => { if (!(w.height > 0)) w.height = defaultWallHeight(w); });
    m.openings.forEach(o => { if (!(o.head > 0)) o.head = DEFAULT_HEAD; if (o.kind === 'window') { if (!(o.sill >= 0)) o.sill = DEFAULT_SILL; } else delete o.sill; });
    m.rooms.forEach(r => { if (!(r.ceiling > 0)) r.ceiling = DEFAULT_CEILING; });
    m.items.forEach(it => {
      if (!isFinite(it.rot)) it.rot = 0;
      if (it.kind === 'column') { it.shape = it.shape === 'round' ? 'round' : 'square'; if (!(it.size > 0)) it.size = 12; }
      if (it.kind === 'stair') { if (!(it.length > 0)) it.length = 150; if (!(it.width > 0)) it.width = 36; if (!(it.rise > 0)) it.rise = 120; if (!(it.risers > 0)) it.risers = null; }
      if (it.kind === 'text') { it.text = String(it.text || 'NOTE'); if (!(it.size > 0)) it.size = 0.125; }
      if (it.kind === 'dim') { if (!isFinite(it.off)) it.off = 12; }
      if (it.kind === 'fixture') { if (!FIXTURES[it.fixture]) it.fixture = 'wc'; }
      if (it.kind === 'shape') { if (!SHAPES.includes(it.shape)) it.shape = 'line'; it.pts = (Array.isArray(it.pts) ? it.pts : []).filter(okPt).map(p => ({ x: +p.x, y: +p.y })); if (!SHAPE_WEIGHTS[it.weight]) it.weight = 'medium'; it.dash = !!it.dash; if (it.shape === 'circle' && !(it.r > 0)) it.r = 12; }
    });
    m.items = m.items.filter(it => it.kind !== 'shape' || (it.shape === 'circle' ? it.r > 0 : it.pts.length >= 2));
    return m;
  }
  /** Changes a wall's type: thickness, exterior/interior behaviour and (if the height was
   *  still the old type's default) its height follow the new type. */
  function setWallType(m, id, key) {
    const w = wallById(m, id), t = WALL_TYPES[key]; if (!w) throw new Error('Wall not found.'); if (!t) throw new Error('Unknown wall type.');
    const hadDefault = !(w.height > 0) || w.height === defaultWallHeight(w);
    w.wtype = key; w.type = t.role; w.thickness = t.thickness; if (hadDefault) w.height = t.height;
    return w;
  }

  /* ----------------------------------------------------------- items (V20)
   * Columns, stairs, text, manual dimensions and plumbing fixtures. Each has a position
   * (dimensions have two points) and a rotation in degrees (plan coordinates, y down). */
  function addItem(m, kind, props) {
    if (!ITEM_KINDS.includes(kind)) throw new Error('Unknown item.');
    m.items = m.items || [];
    const it = Object.assign({ id: uid('i'), kind, rot: 0 }, props || {});
    if (kind === 'dim') { if (!okPt(it.a) || !okPt(it.b) || dist(it.a, it.b) < 0.5) throw new Error('A dimension needs two different points.'); it.a = { x: snap(it.a.x), y: snap(it.a.y) }; it.b = { x: snap(it.b.x), y: snap(it.b.y) }; }
    else { if (!okPt(it.at)) throw new Error('Pick a point on the sheet.'); it.at = { x: snap(it.at.x), y: snap(it.at.y) }; }
    const n = normalizeModel({ items: [it] }).items[0]; Object.assign(it, n);
    m.items.push(it); return it;
  }
  function moveItem(m, id, dx, dy) {
    const it = (m.items || []).find(x => x.id === id); if (!it) throw new Error('Item not found.');
    const mv = p => ({ x: snap(p.x + dx), y: snap(p.y + dy) });
    if (it.kind === 'dim') { it.a = mv(it.a); it.b = mv(it.b); } else it.at = mv(it.at);
    return it;
  }
  function removeItem(m, id) { m.items = (m.items || []).filter(x => x.id !== id); }
  function stairRisers(it) { return it.risers > 0 ? Math.round(it.risers) : Math.max(2, Math.ceil(it.rise / 7.75)); }
  const rotV = (p, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }; };
  const ellipse = (cx, cy, rx, ry, n) => { const o = []; n = n || 28; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; o.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }); } return o; };
  const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  /** Fixture outlines in local inches: x across, y out from the wall the fixture backs onto. */
  function fixtureShapes(kind) {
    if (kind === 'lav') return { box: rect(-10, 0, 10, 18), polys: [rect(-10, 0, 10, 18), ellipse(0, 10, 7, 5.5)] };
    if (kind === 'sink') return { box: rect(-16.5, 0, 16.5, 22), polys: [rect(-16.5, 0, 16.5, 22), rect(-14.5, 4, -1, 20), rect(1, 4, 14.5, 20)] };
    if (kind === 'tub') return { box: rect(-30, 0, 30, 30), polys: [rect(-30, 0, 30, 30), [{ x: -24, y: 3 }, { x: 24, y: 3 }, { x: 27, y: 6 }, { x: 27, y: 24 }, { x: 24, y: 27 }, { x: -24, y: 27 }, { x: -27, y: 24 }, { x: -27, y: 6 }], ellipse(-21, 15, 1.5, 1.5, 12)] };
    if (kind === 'shower') return { box: rect(-18, 0, 18, 36), polys: [rect(-18, 0, 18, 36), ellipse(0, 18, 2, 2, 12)], lines: [[{ x: -18, y: 0 }, { x: 18, y: 36 }], [{ x: 18, y: 0 }, { x: -18, y: 36 }]] };
    return { box: rect(-10, 0, 10, 28), polys: [rect(-10, 0, 10, 8), ellipse(0, 18, 7.5, 10)] }; // wc
  }
  /** World-space outline of an item, used for picking, bounds and the selection highlight. */
  function itemOutline(it, scale) {
    scale = scale || 48;
    const W = p => add(it.at, rotV(p, it.rot || 0));
    if (it.kind === 'column') { const s = it.size / 2; return it.shape === 'round' ? ellipse(0, 0, s, s, 24).map(W) : rect(-s, -s, s, s).map(W); }
    if (it.kind === 'stair') return rect(0, -it.width / 2, it.length, it.width / 2).map(W);
    if (it.kind === 'fixture') return fixtureShapes(it.fixture).box.map(W);
    if (it.kind === 'text') { const h = it.size * scale, w = Math.max(1, it.text.length) * h * 0.62; return rect(-w / 2, -h * 0.6, w / 2, h * 0.6).map(W); }
    if (it.kind === 'dim') { const g = dimGeometry(it, scale), n = g.n, h = PAPER.text * scale; return [add(g.la, mul(n, -h * 0.4)), add(g.lb, mul(n, -h * 0.4)), add(g.lb, mul(n, h * 1.6)), add(g.la, mul(n, h * 1.6))]; }
    if (it.kind === 'shape') { const L = shapeLocal(it).flat(); const xs = L.map(p => p.x), ys = L.map(p => p.y), pad = 2; return rect(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad).map(W); }
    return [];
  }
  /** Circle through three points (null when they are in a line). */
  function circle3(a, b, c) {
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)); if (Math.abs(d) < 1e-9) return null;
    const A = a.x * a.x + a.y * a.y, B = b.x * b.x + b.y * b.y, C2 = c.x * c.x + c.y * c.y;
    const cen = { x: (A * (b.y - c.y) + B * (c.y - a.y) + C2 * (a.y - b.y)) / d, y: (A * (c.x - b.x) + B * (a.x - c.x) + C2 * (b.x - a.x)) / d };
    return { c: cen, r: dist(cen, a) };
  }
  /** Points of a 3-point arc from a through m to b. */
  function arcPoints(a, m, b, n) {
    const k = circle3(a, m, b); if (!k) return [a, m, b];
    const ang = p => Math.atan2(p.y - k.c.y, p.x - k.c.x), a0 = ang(a), am = ang(m), ab = ang(b), TAU = Math.PI * 2;
    const norm0 = t => ((t - a0) % TAU + TAU) % TAU; let sweep = norm0(ab); if (norm0(am) > sweep) sweep -= TAU;
    n = n || Math.max(12, Math.ceil(Math.abs(sweep) / (Math.PI / 24))); const o = [];
    for (let i = 0; i <= n; i++) { const t = a0 + sweep * i / n; o.push({ x: k.c.x + k.r * Math.cos(t), y: k.c.y + k.r * Math.sin(t) }); }
    return o;
  }
  /** Smooth curve (centripetal-free Catmull-Rom) through the points. */
  function curvePoints(P, closed, per) {
    per = per || 12; if (P.length < 3) return P.slice(); const n = P.length, o = [], at = i => closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) { const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      for (let j = 0; j < per; j++) { const t = j / per, t2 = t * t, t3 = t2 * t; o.push({ x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3), y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3) }); } }
    o.push(closed ? P[0] : P[n - 1]); return o;
  }
  /** A shape as polylines in its local frame (before `at` / `rot`). Closed shapes repeat the first point. */
  function shapeLocal(it) {
    const P = it.pts || [], close = a => a.length ? a.concat([a[0]]) : a;
    if (it.shape === 'circle') { const c = P[0] || { x: 0, y: 0 }; return [close(ellipse(c.x, c.y, it.r, it.r, 64))]; }
    if (it.shape === 'arc') return [P.length >= 3 ? arcPoints(P[0], P[1], P[2]) : P];
    if (it.shape === 'curve') return [curvePoints(P, !!it.closed)];
    if (it.shape === 'rect' || it.shape === 'polygon' || it.closed) return [close(P)];
    return [P];
  }
  /** World-space polylines of a shape item (plan, or view coordinates for elevation / section notes). */
  function shapeLines(it) { const W = p => add(it.at || { x: 0, y: 0 }, rotV(p, it.rot || 0)); return shapeLocal(it).map(l => l.map(W)); }
  /** Makes a shape item from world points (first point becomes `at`). */
  function makeShape(kind, world, opts) {
    opts = opts || {}; const at = { x: snap(world[0].x), y: snap(world[0].y) };
    const it = Object.assign({ id: opts.id || uid('i'), kind: 'shape', shape: kind, at, rot: 0, weight: opts.weight || 'medium', dash: !!opts.dash }, kind === 'circle' ? { pts: [{ x: 0, y: 0 }], r: snap(opts.r || dist(world[0], world[1] || world[0])) } : { pts: world.map(p => ({ x: snap(p.x - at.x), y: snap(p.y - at.y) })) });
    if (opts.closed) it.closed = true; return normalizeModel({ items: [it] }).items[0] || null;
  }
  /** Regular polygon points: center, radius to a vertex, first vertex angle (radians), sides. */
  function regularPolygon(c, r, a0, n) { const o = []; for (let i = 0; i < n; i++) { const a = a0 + i * Math.PI * 2 / n; o.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }); } return o; }
  function dimGeometry(it, scale) {
    const d = norm(sub(it.b, it.a)); let n = { x: -d.y, y: d.x };
    const off = it.off || 0; const s = off < 0 ? -1 : 1; const nn = mul(n, s);
    const la = add(it.a, mul(n, off)), lb = add(it.b, mul(n, off));
    let ang = Math.atan2(d.y, d.x) * 180 / Math.PI; if (ang > 90.01) ang -= 180; if (ang <= -90.01) ang += 180;
    if (Math.abs(Math.abs(ang) - 90) < 0.01) ang = -90;
    const up = rotV({ x: 0, y: -1 }, ang);
    return { d, n: nn, la, lb, value: dist(it.a, it.b), angle: ang, up };
  }

  function wallById(m, id) { return m.walls.find(w => w.id === id); }
  function wallLength(w) { return dist(w.a, w.b); }
  function wallDir(w) { return norm(sub(w.b, w.a)); }
  function isHorizontal(w) { return Math.abs(w.a.y - w.b.y) < EPS; }
  function isVertical(w) { return Math.abs(w.a.x - w.b.x) < EPS; }

  /* ----------------------------------------------------------- editing */
  function addWall(m, a, b, opts) {
    opts = opts || {};
    a = { x: snap(a.x), y: snap(a.y) }; b = { x: snap(b.x), y: snap(b.y) };
    // An end that lands inside another wall is pulled onto that wall's centerline, so
    // joints are exact and dimensions measure to real wall locations.
    const d0 = norm(sub(b, a));
    [a, b].forEach(p => {
      if (m.walls.some(x => same(x.a, p) || same(x.b, p))) return;
      const host = m.walls.find(x => pointOnWall(p, x, x.thickness / 2 + 0.01) && Math.abs(wallDir(x).x * d0.x + wallDir(x).y * d0.y) < 0.98);
      if (!host) return;
      const hd = wallDir(host), perp = Math.abs(hd.x * d0.x + hd.y * d0.y) < 0.01;
      // square: project onto the centerline (V20); angled (V22): slide along the new wall to the centerline
      let q; if (perp) { const r = sub(p, host.a), along = r.x * hd.x + r.y * hd.y; q = add(host.a, mul(hd, along)); } else { const k = lineHit(p, d0, host.a, hd); if (k == null) return; q = add(p, mul(d0, k)); }
      p.x = snap(q.x); p.y = snap(q.y);
    });
    const wt = WALL_TYPES[opts.wtype];
    const w = { id: opts.id || uid('w'), a, b, thickness: opts.thickness || (wt ? wt.thickness : 6), type: opts.type || (wt ? wt.role : 'exterior') };
    if (wt) w.wtype = opts.wtype;
    w.height = opts.height > 0 ? opts.height : defaultWallHeight(w);
    if (wallLength(w) < 1) throw new Error('A wall must be at least 1" long.');
    m.walls.push(w); return w;
  }
  function addOpening(m, wallId, kind, offset, width, opts) {
    opts = opts || {};
    const w = wallById(m, wallId); if (!w) throw new Error('Wall not found.');
    const k = kind === 'window' ? 'window' : kind === 'cased' ? 'cased' : 'door';
    const o = { id: opts.id || uid(k === 'door' ? 'd' : k === 'cased' ? 'c' : 'g'), wall: wallId, kind: k, offset: snap(offset), width: snap(width), tag: opts.tag || '', swing: opts.swing || 'left', head: opts.head > 0 ? opts.head : DEFAULT_HEAD };
    if (k === 'window') o.sill = opts.sill >= 0 ? opts.sill : DEFAULT_SILL;
    validateOpening(m, o); m.openings.push(o); return o;
  }
  function validateOpening(m, o) {
    const w = wallById(m, o.wall); const L = wallLength(w);
    if (!(o.width > 0)) throw new Error('Opening width must be greater than 0.');
    if (o.offset - o.width / 2 < -EPS || o.offset + o.width / 2 > L + EPS) throw new Error('The opening does not fit on that wall at that location.');
  }
  /** Points at the ends of walls that coincide with p (wall joints). */
  function jointsAt(m, p) { const out = []; m.walls.forEach(w => { if (same(w.a, p)) out.push([w, 'a']); if (same(w.b, p)) out.push([w, 'b']); }); return out; }

  /**
   * Sets a wall's length. Like a CAD stretch: everything on the far side of the wall's
   * moving end (other walls' endpoints, openings' hosts, room labels) moves with it, so
   * the plan stays closed and connected walls stay connected.
   */
  function setWallLength(m, wallId, newLength, anchor) {
    const w = wallById(m, wallId); if (!w) throw new Error('Wall not found.');
    newLength = snap(newLength);
    if (!(newLength >= 1)) throw new Error('Length must be at least 1".');
    const fixed = anchor === 'b' ? w.b : w.a, moving = anchor === 'b' ? 'a' : 'b';
    const dir = norm(sub(w[moving], fixed));
    const delta = newLength - wallLength(w);
    if (Math.abs(delta) < EPS) return m;
    const cut = (w[moving].x - fixed.x) * dir.x + (w[moving].y - fixed.y) * dir.y; // projection of moving end
    const proj = p => (p.x - fixed.x) * dir.x + (p.y - fixed.y) * dir.y;
    const shift = mul(dir, delta);
    // Openings keep their distance from the fixed end, so remember positions first.
    const opWorld = m.openings.map(o => { const h = wallById(m, o.wall); return { o, c: add(h.a, mul(wallDir(h), o.offset)) }; });
    m.walls.forEach(x => ['a', 'b'].forEach(k => { if (proj(x[k]) >= cut - 0.01) x[k] = { x: snap(x[k].x + shift.x), y: snap(x[k].y + shift.y) }; }));
    m.rooms.forEach(r => { if (proj(r.at) >= cut - 0.01) r.at = add(r.at, shift); });
    (m.items || []).forEach(it => ['at', 'a', 'b'].forEach(k => { if (it[k] && proj(it[k]) >= cut - 0.01) it[k] = { x: snap(it[k].x + shift.x), y: snap(it[k].y + shift.y) }; }));
    opWorld.forEach(({ o, c }) => {
      const h = wallById(m, o.wall);
      const moved = proj(c) >= cut - 0.01 && h.id !== w.id ? add(c, shift) : c;
      o.offset = snap((moved.x - h.a.x) * wallDir(h).x + (moved.y - h.a.y) * wallDir(h).y);
    });
    m.openings.forEach(o => validateOpening(m, o));
    return m;
  }
  function moveOpening(m, id, offset, width) {
    const o = m.openings.find(x => x.id === id); if (!o) throw new Error('Opening not found.');
    const prev = { offset: o.offset, width: o.width };
    if (offset != null) o.offset = snap(offset); if (width != null) o.width = snap(width);
    try { validateOpening(m, o); } catch (e) { Object.assign(o, prev); throw e; }
    return o;
  }
  function removeWall(m, id) { m.walls = m.walls.filter(w => w.id !== id); m.openings = m.openings.filter(o => o.wall !== id); }
  function removeOpening(m, id) { m.openings = m.openings.filter(o => o.id !== id); }

  /** A rectangular building, w × h to the OUTSIDE faces of the exterior walls (how plans are
   *  dimensioned), clockwise from the north-west corner. Wall centerlines sit t/2 inside. */
  function addRectangle(m, x, y, w, h, thickness) {
    const t = thickness || 6, i = t / 2;
    const pts = [{ x: x + i, y: y + i }, { x: x + w - i, y: y + i }, { x: x + w - i, y: y + h - i }, { x: x + i, y: y + h - i }];
    return pts.map((p, k) => addWall(m, p, pts[(k + 1) % 4], { thickness: t, type: 'exterior' }));
  }
  /** The length a person reads on the plan: outside face corner-to-corner for exterior walls,
   *  face-to-face for partitions that run between other walls. */
  function wallFaceLength(m, w) {
    if (w.type === 'exterior') { const o = wallOutline(m, w); return dist(o.outerA, o.outerB); }
    const a = touchesWall(m, w.a, w) ? endFaceOffset(m, w, 'a') : 0, b = touchesWall(m, w.b, w) ? endFaceOffset(m, w, 'b') : 0;
    return wallLength(w) - a - b;
  }
  /** Sets the length a person reads on the plan (see wallFaceLength) by stretching geometry. */
  function setWallFaceLength(m, wallId, faceLength, anchor) {
    const w = wallById(m, wallId); if (!w) throw new Error('Wall not found.');
    return setWallLength(m, wallId, wallLength(w) + (faceLength - wallFaceLength(m, w)), anchor);
  }

  /* ----------------------------------------------------------- derived geometry */
  function exteriorWalls(m) { return m.walls.filter(w => w.type === 'exterior'); }
  function centroid(m) {
    const ws = exteriorWalls(m).length ? exteriorWalls(m) : m.walls;
    if (!ws.length) return { x: 0, y: 0 };
    let sx = 0, sy = 0, n = 0; ws.forEach(w => { sx += w.a.x + w.b.x; sy += w.a.y + w.b.y; n += 2; });
    return { x: sx / n, y: sy / n };
  }
  /** Unit normal pointing to the outside of the building for an exterior wall. */
  function outwardNormal(m, w) {
    const d = wallDir(w); let n = { x: -d.y, y: d.x };
    const mid = mul(add(w.a, w.b), 0.5), c = centroid(m);
    if ((mid.x - c.x) * n.x + (mid.y - c.y) * n.y < 0) n = mul(n, -1);
    return n;
  }
  /** The wall's four corners (outer face first). Ends extend by half the thickness at
   *  joints with another wall so corners close cleanly. */
  function wallNormal(m, w) { const d = wallDir(w); return w.type === 'exterior' ? outwardNormal(m, w) : { x: -d.y, y: d.x }; }
  /** How far each face runs past (or stops short of) a wall end so joints close cleanly:
   *  at a corner the outside face runs to the outside corner and the inside face stops at
   *  the inside corner; a partition that butts into a wall stops at that wall's face. */
  /* V22: joints at any angle. Each face line of the wall runs to where it meets the matching
   * face of the other wall (a true miter for L corners, the host face for T joints), so angled
   * walls close as cleanly as square ones. Square joints give exactly the V20 numbers. */
  function lineHit(p, d, q, e) { const den = d.x * e.y - d.y * e.x; if (Math.abs(den) < 1e-9) return null; const r = sub(q, p); return (r.x * e.y - r.y * e.x) / den; }
  function endTrim(m, w, end) {
    const p = w[end], d = wallDir(w), n = wallNormal(m, w), t = w.thickness / 2;
    const out = end === 'a' ? mul(d, -1) : d, into = mul(out, -1);
    const other = m.walls.find(x => x !== w && (same(x.a, p) || same(x.b, p)));
    if (other) {
      const away = same(other.a, p) ? wallDir(other) : mul(wallDir(other), -1), tx = other.thickness / 2;
      const cos = away.x * d.x + away.y * d.y;
      if (Math.abs(cos) > 0.99) return { plus: 0, minus: 0, joint: true };
      const side = away.x * n.x + away.y * n.y;
      if (Math.abs(cos) < 1e-9) return { plus: side > 0 ? -tx : tx, minus: side > 0 ? tx : -tx, joint: true };
      let no = { x: -away.y, y: away.x }; if (no.x * into.x + no.y * into.y < 0) no = mul(no, -1);
      const cap = 6 * Math.max(t, tx);
      const ext = s => { const inner = (s > 0) === (side > 0); const k = lineHit(add(p, mul(n, s * t)), out, add(p, mul(no, inner ? tx : -tx)), away); return k == null ? 0 : Math.max(-cap, Math.min(cap, k)); };
      return { plus: ext(1), minus: ext(-1), joint: true };
    }
    const host = m.walls.find(x => x !== w && pointOnWall(p, x, x.thickness / 2 + 0.01));
    if (host) {
      const hd = wallDir(host), th = host.thickness / 2, cos = hd.x * d.x + hd.y * d.y;
      if (Math.abs(cos) < 1e-9 || Math.abs(cos) > 0.99) return { plus: -th, minus: -th, joint: true, host: host.id };
      let nh = { x: -hd.y, y: hd.x }; if (nh.x * into.x + nh.y * into.y < 0) nh = mul(nh, -1);
      const q = add(host.a, mul(nh, th)), cap = 6 * Math.max(t, th);
      const ext = s => { const k = lineHit(add(p, mul(n, s * t)), out, q, hd); return k == null ? -th : Math.max(-cap, Math.min(cap, k)); };
      return { plus: ext(1), minus: ext(-1), joint: true, host: host.id };
    }
    return { plus: 0, minus: 0, joint: false };
  }
  /** The wall's four corners: outer = the +normal face (outside face for exterior walls). */
  function wallOutline(m, w) {
    const d = wallDir(w), t = w.thickness / 2, n = wallNormal(m, w);
    const ta = endTrim(m, w, 'a'), tb = endTrim(m, w, 'b');
    return {
      outerA: add(sub(w.a, mul(d, ta.plus)), mul(n, t)), outerB: add(add(w.b, mul(d, tb.plus)), mul(n, t)),
      innerB: sub(add(w.b, mul(d, tb.minus)), mul(n, t)), innerA: sub(sub(w.a, mul(d, ta.minus)), mul(n, t)),
      normal: n, dir: d, capA: !ta.joint, capB: !tb.joint,
    };
  }
  function openingGeometry(m, o) {
    const w = wallById(m, o.wall), d = wallDir(w), n = w.type === 'exterior' ? outwardNormal(m, w) : { x: -d.y, y: d.x }, t = w.thickness / 2;
    const c = add(w.a, mul(d, o.offset));
    const j1 = sub(c, mul(d, o.width / 2)), j2 = add(c, mul(d, o.width / 2));
    return { wall: w, dir: d, normal: n, center: c, jamb1: j1, jamb2: j2, outer1: add(j1, mul(n, t)), outer2: add(j2, mul(n, t)), inner1: sub(j1, mul(n, t)), inner2: sub(j2, mul(n, t)) };
  }

  /* ----------------------------------------------------------- dimensions */
  // Sheet conventions, in PAPER inches; multiplied by the scale so they are right at any scale.
  const PAPER = { firstOffset: 0.5, spacing: 0.375, extGap: 1 / 16, extBeyond: 1 / 8, tick: 1 / 8, text: 3 / 32, textGap: 1 / 32, interiorOffset: 0.3125 };

  // Rotations that turn each side of the building into "south" (outward = +v).
  const SIDES = {
    S: { toUV: p => ({ u: p.x, v: p.y }), fromUV: (u, v) => ({ x: u, y: v }) },
    N: { toUV: p => ({ u: p.x, v: -p.y }), fromUV: (u, v) => ({ x: u, y: -v }) },
    E: { toUV: p => ({ u: p.y, v: p.x }), fromUV: (u, v) => ({ x: v, y: u }) },
    W: { toUV: p => ({ u: p.y, v: -p.x }), fromUV: (u, v) => ({ x: -v, y: u }) },
  };
  function sideOf(m, w) {
    const n = outwardNormal(m, w);
    if (n.y > 0.7) return 'S'; if (n.y < -0.7) return 'N'; if (n.x > 0.7) return 'E'; if (n.x < -0.7) return 'W'; return null;
  }
  function uniqSorted(list) { const s = list.slice().sort((a, b) => a.u - b.u); const out = []; s.forEach(p => { const last = out[out.length - 1]; if (!last || Math.abs(p.u - last.u) > 0.01) out.push(p); else if (p.v > last.v) last.v = p.v; }); return out; }
  const sameStations = (a, b) => a.length === b.length && a.every((p, i) => Math.abs(p.u - b[i].u) < 0.01);

  /**
   * Builds every dimension for the plan from the geometry.
   * Exterior: up to three strings per side, closest first —
   *   1. openings: building corners/jogs + door and window jambs
   *   2. walls: building corners/jogs + interior walls (to centerline)
   *   3. overall
   * Interior: each interior wall with openings gets a string to its jambs.
   * Returns {dims, overall, problems}. Each dim: {kind, side, a, b, value, text, line, ext, textAt, angle}.
   */
  function computeDimensions(m, scale) {
    scale = scale || 48;
    const P = k => PAPER[k] * scale;
    const ext = exteriorWalls(m);
    const dims = [], problems = [], overall = {};
    if (!ext.length) return { dims, overall, problems };
    const outlines = new Map(ext.map(w => [w.id, wallOutline(m, w)]));
    const corners = []; outlines.forEach(o => corners.push(o.outerA, o.outerB));

    Object.keys(SIDES).forEach(side => {
      const T = SIDES[side];
      const sideWalls = ext.filter(w => sideOf(m, w) === side);
      if (!sideWalls.length) return;
      const cornerUV = corners.map(T.toUV);
      const minU = Math.min(...cornerUV.map(p => p.u)), maxU = Math.max(...cornerUV.map(p => p.u));
      const faceV = Math.max(...cornerUV.map(p => p.v)); // outermost face on this side
      // the object point an extension line starts from: the outermost face at that station
      const originV = u => { let best = -Infinity; cornerUV.forEach(p => { if (Math.abs(p.u - u) < 0.01) best = Math.max(best, p.v); }); sideWalls.forEach(w => { const o = outlines.get(w.id), a = T.toUV(o.outerA), b = T.toUV(o.outerB); if (u >= Math.min(a.u, b.u) - 0.01 && u <= Math.max(a.u, b.u) + 0.01) best = Math.max(best, a.v); }); return best === -Infinity ? faceV : best; };
      const st = u => ({ u, v: originV(u) });
      const extents = [st(minU), st(maxU)];
      const jogs = []; sideWalls.forEach(w => { const o = outlines.get(w.id); jogs.push(st(T.toUV(o.outerA).u), st(T.toUV(o.outerB).u)); });
      const jambs = []; m.openings.forEach(o => { if (!sideWalls.some(w => w.id === o.wall)) return; const g = openingGeometry(m, o); jambs.push(st(T.toUV(g.outer1).u), st(T.toUV(g.outer2).u)); });
      const partitions = []; m.walls.filter(w => w.type !== 'exterior').forEach(w => {
        [w.a, w.b].forEach(p => { sideWalls.forEach(sw => { if (pointOnWall(p, sw, sw.thickness / 2 + 0.01)) partitions.push(st(T.toUV(p).u)); }); });
      });
      const s1 = uniqSorted(extents.concat(jogs, jambs));
      const s2 = uniqSorted(extents.concat(jogs, partitions));
      const s3 = uniqSorted(extents);
      const strings = [];
      if (jambs.length) strings.push(['openings', s1]);
      if (!sameStations(s2, s3) && !(jambs.length && sameStations(s1, s2))) strings.push(['walls', s2]);
      strings.push(['overall', s3]);
      overall[side] = maxU - minU;
      strings.forEach(([kind, stations], row) => {
        const lineV = faceV + P('firstOffset') + row * P('spacing');
        for (let i = 0; i < stations.length - 1; i++) {
          const p = stations[i], q = stations[i + 1], value = q.u - p.u;
          if (value < 0.01) continue;
          const text = formatFtIn(value);
          const tw = text.length * P('text') * 0.62;
          const fits = tw + P('tick') * 1.5 <= value;
          // Text reads from the bottom or the right of the sheet and sits just off the line on
          // its "up" side; narrow segments stagger alternate texts one row further out.
          const up = side === 'E' || side === 'W' ? { x: -1, y: 0 } : { x: 0, y: -1 };
          const lift = P('textGap') + (fits ? 0 : P('text') * 1.25 * (i % 2));
          const toXY = (u, v) => T.fromUV(u, v);
          const mid = toXY((p.u + q.u) / 2, lineV);
          dims.push({
            kind, side, row, value, text, fits,
            a: toXY(p.u, lineV), b: toXY(q.u, lineV),
            ext: [[toXY(p.u, p.v + P('extGap')), toXY(p.u, lineV + P('extBeyond'))], [toXY(q.u, q.v + P('extGap')), toXY(q.u, lineV + P('extBeyond'))]],
            textAt: add(mid, mul(up, lift)), up, textWidth: tw, textHeight: P('text'),
            angle: side === 'E' || side === 'W' ? -90 : 0,
          });
        }
      });
    });

    // V22: angled exterior walls get an aligned dimension (true length) along their outside face
    ext.filter(w => !isHorizontal(w) && !isVertical(w)).forEach(w => {
      const o = outlines.get(w.id), nrm = o.normal, a = o.outerA, b = o.outerB, value = dist(a, b); if (value < 0.01) return;
      const off = P('firstOffset'), la = add(a, mul(nrm, off)), lb = add(b, mul(nrm, off)), text = formatFtIn(value);
      const g = dimGeometry({ a: la, b: lb, off: 0 }, scale), tw = text.length * P('text') * 0.62;
      const up = g.up; // text reads from the bottom / right, like every other string
      dims.push({ kind: 'aligned', side: 'A', row: 0, wall: w.id, value, text, fits: tw + P('tick') * 1.5 <= value, a: la, b: lb,
        ext: [[add(a, mul(nrm, P('extGap'))), add(la, mul(nrm, P('extBeyond')))], [add(b, mul(nrm, P('extGap'))), add(lb, mul(nrm, P('extBeyond')))]],
        textAt: add(mul(add(la, lb), 0.5), mul(up, P('textGap'))), up, textWidth: tw, textHeight: P('text'), angle: g.angle });
    });

    // interior strings along walls that host openings
    m.walls.filter(w => w.type !== 'exterior').forEach(w => {
      const ops = m.openings.filter(o => o.wall === w.id); if (!ops.length) return;
      const d = wallDir(w), n0 = { x: -d.y, y: d.x }, L = wallLength(w);
      const startFace = jointsAt(m, w.a).length > 1 || touchesWall(m, w.a, w) ? endFaceOffset(m, w, 'a') : 0;
      const endFace = jointsAt(m, w.b).length > 1 || touchesWall(m, w.b, w) ? L - endFaceOffset(m, w, 'b') : L;
      const stations = [startFace, endFace]; ops.forEach(o => stations.push(o.offset - o.width / 2, o.offset + o.width / 2));
      const s = [...new Set(stations.map(x => Math.round(x * 1000) / 1000))].sort((a, b) => a - b);
      let n = n0, chosen = null;
      [n0, mul(n0, -1)].some(dirN => {
        const off = w.thickness / 2 + P('interiorOffset');
        const trial = buildInterior(m, w, s, dirN, off, P);
        if (!trial.some(dd => textHitsWalls(m, dd, w))) { chosen = trial; n = dirN; return true; }
        if (!chosen) chosen = trial; return false;
      });
      chosen.forEach(dd => dims.push(dd));
    });

    // Reconciliation: every string's segments must add up to the overall dimension.
    ['S', 'N', 'E', 'W'].forEach(side => {
      if (overall[side] == null) return;
      const rows = {}; dims.filter(d => d.side === side).forEach(d => { (rows[d.kind] = rows[d.kind] || []).push(d.value); });
      Object.keys(rows).forEach(k => { const sum = rows[k].reduce((a, b) => a + b, 0); if (Math.abs(sum - overall[side]) > 0.01) problems.push(`${side} ${k} string adds to ${formatFtIn(sum)} but overall is ${formatFtIn(overall[side])}`); });
    });
    return { dims, overall, problems };
  }
  function buildInterior(m, w, s, n, off, P) {
    const d = wallDir(w), out = [];
    for (let i = 0; i < s.length - 1; i++) {
      const v = s[i + 1] - s[i]; if (v < 0.01) continue;
      const p = add(w.a, mul(d, s[i])), q = add(w.a, mul(d, s[i + 1]));
      const lp = add(p, mul(n, off)), lq = add(q, mul(n, off));
      const text = formatFtIn(v), tw = text.length * P('text') * 0.62;
      const orth = Math.abs(d.x) < 1e-9 || Math.abs(d.y) < 1e-9, g = orth ? null : dimGeometry({ a: lp, b: lq, off: 0 }, 1); // V22: angled partitions read along the wall
      const up = g ? g.up : Math.abs(d.y) > 0.7 ? { x: -1, y: 0 } : { x: 0, y: -1 };
      const textAt = add(mul(add(lp, lq), 0.5), mul(up, P('textGap')));
      out.push({ kind: 'interior', side: 'I', wall: w.id, value: v, text, fits: tw + P('tick') * 1.5 <= v, a: lp, b: lq,
        ext: [[add(p, mul(n, w.thickness / 2 + P('extGap'))), add(lp, mul(n, P('extBeyond')))], [add(q, mul(n, w.thickness / 2 + P('extGap'))), add(lq, mul(n, P('extBeyond')))]],
        textAt, up, textWidth: tw, textHeight: P('text'), angle: g ? g.angle : Math.abs(d.y) > 0.7 ? -90 : 0 });
    }
    return out;
  }
  function pointOnWall(p, w, tol) {
    const d = wallDir(w), L = wallLength(w), r = sub(p, w.a);
    const along = r.x * d.x + r.y * d.y, across = Math.abs(-r.x * d.y + r.y * d.x);
    return along >= -tol && along <= L + tol && across <= tol;
  }
  function touchesWall(m, p, self) { return m.walls.some(w => w !== self && pointOnWall(p, w, w.thickness / 2 + 0.01)); }
  function endFaceOffset(m, w, end) { const p = w[end]; const host = m.walls.find(x => x !== w && pointOnWall(p, x, x.thickness / 2 + 0.01)); return host ? host.thickness / 2 : 0; }
  function textBox(d) {
    const vertical = d.angle === -90, w = vertical ? d.textHeight : d.textWidth, h = vertical ? d.textWidth : d.textHeight;
    const c = d.up ? add(d.textAt, mul(d.up, d.textHeight / 2)) : d.textAt; // textAt is the baseline middle
    return { x0: c.x - w / 2, x1: c.x + w / 2, y0: c.y - h / 2, y1: c.y + h / 2 };
  }
  function boxHitsSegmentRect(b, w, m) {
    const o = wallOutline(m, w); const xs = [o.outerA.x, o.outerB.x, o.innerA.x, o.innerB.x], ys = [o.outerA.y, o.outerB.y, o.innerA.y, o.innerB.y];
    return !(b.x1 < Math.min(...xs) || b.x0 > Math.max(...xs) || b.y1 < Math.min(...ys) || b.y0 > Math.max(...ys));
  }
  function textHitsWalls(m, d, self) { const b = textBox(d); return m.walls.some(w => w !== self && boxHitsSegmentRect(b, w, m)); }
  const overlaps = (a, b) => !(a.x1 <= b.x0 || a.x0 >= b.x1 || a.y1 <= b.y0 || a.y0 >= b.y1);

  /** Room labels placed so they don't sit on walls or dimension text. */
  function placeRoomLabels(m, dims, scale) {
    const h = PAPER.text * 1.3 * scale;
    const taken = dims.map(textBox);
    return m.rooms.map(r => {
      const lines = [r.name || 'ROOM', r.number || '', r.ceiling > 0 ? 'CLG ' + formatFtIn(r.ceiling) : ''].filter(Boolean);
      const wdt = Math.max(...lines.map(s => s.length)) * h * 0.62, ht = lines.length * h * 1.2;
      let at = { x: r.at.x, y: r.at.y };
      for (let k = 0; k < 12; k++) {
        const box = { x0: at.x - wdt / 2, x1: at.x + wdt / 2, y0: at.y - ht / 2, y1: at.y + ht / 2 };
        if (!taken.some(t => overlaps(t, box)) && !m.walls.some(w => boxHitsSegmentRect(box, w, m))) { taken.push(box); return { room: r, at, lines, box, size: h }; }
        at = { x: r.at.x, y: r.at.y + (k % 2 ? 1 : -1) * Math.ceil((k + 1) / 2) * h };
      }
      return { room: r, at: r.at, lines, box: null, size: h, collides: true };
    });
  }
  /** Overlapping dimension texts / labels — the sheet should have none. */
  function collisions(m, scale) {
    m = normalizeModel(m);
    const { dims } = computeDimensions(m, scale), out = [];
    const boxes = dims.map(textBox);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlaps(boxes[i], boxes[j])) out.push(`dimension text ${dims[i].text} overlaps ${dims[j].text}`);
    dims.forEach((d, i) => { if (d.kind === 'interior' && textHitsWalls(m, d, wallById(m, d.wall))) out.push(`dimension text ${d.text} overlaps a wall`); });
    placeRoomLabels(m, dims, scale).forEach(l => { if (l.collides) out.push(`room label ${l.room.name} could not be placed clear`); });
    return out;
  }

  function baseBounds(m, scale) {
    scale = scale || 48;
    const pts = []; m.walls.forEach(w => { const o = wallOutline(m, w); pts.push(o.outerA, o.outerB, o.innerA, o.innerB); });
    (m.items || []).forEach(it => itemOutline(it, scale).forEach(p => pts.push(p)));
    if (!pts.length) return { x0: 0, y0: 0, x1: 240, y1: 240 };
    const { dims } = computeDimensions(m, scale); dims.forEach(d => { pts.push(d.a, d.b, d.textAt); d.ext.forEach(e => pts.push(e[0], e[1])); });
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), pad = 0.4 * scale;
    return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
  }
  /** Sheet extents. With opts.legend the wall-type legend and opening schedule below the
   *  plan are included. */
  function bounds(m, scale, opts) {
    scale = scale || 48; m = normalizeModel(m);
    const b = baseBounds(m, scale);
    if (!(opts && opts.legend)) return b;
    const lp = legendPrims(m, scale, b); if (!lp.length) return b;
    let x1 = b.x1, y1 = b.y1;
    lp.forEach(p => { if (p.t === 'text') { x1 = Math.max(x1, p.at.x + p.text.length * p.size * 0.62 + 0.3 * scale); y1 = Math.max(y1, p.at.y + p.size + 0.3 * scale); } else if (p.t === 'poly') p.pts.forEach(q => { y1 = Math.max(y1, q.y + 0.3 * scale); }); });
    return { x0: b.x0, y0: b.y0, x1, y1 };
  }

  /* ----------------------------------------------------------- hatching (V20) */
  function clipToConvex(a, b, poly) {
    const cen = mul(poly.reduce((s, p) => add(s, p), { x: 0, y: 0 }), 1 / poly.length);
    let t0 = 0, t1 = 1; const d = sub(b, a);
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], e = sub(q, p); let nn = { x: -e.y, y: e.x };
      if (len(nn) < 1e-9) continue;
      if ((cen.x - p.x) * nn.x + (cen.y - p.y) * nn.y < 0) nn = mul(nn, -1);
      const num = (a.x - p.x) * nn.x + (a.y - p.y) * nn.y, den = d.x * nn.x + d.y * nn.y;
      if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
      const t = -num / den; if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
      if (t0 > t1) return null;
    }
    return [t0, t1];
  }
  /** Hatch linework for a wall-type pattern inside a convex polygon. origin/dir is the wall
   *  frame (along = dir); gaps are [from, to] intervals along it (openings) left clear. */
  function hatch(poly, origin, dir, style, scale, gaps, extra) {
    const out = [], nrm = { x: -dir.y, y: dir.x }; gaps = gaps || []; extra = extra || {};
    const along = p => (p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y;
    const across = p => (p.x - origin.x) * nrm.x + (p.y - origin.y) * nrm.y;
    const at = (s, t) => add(add(origin, mul(dir, s)), mul(nrm, t));
    const P = v => v * scale;
    const seg = (a, b, more) => {
      const r = clipToConvex(a, b, poly); if (!r) return;
      const sa = along(a), sb = along(b); let ivs = [[r[0], r[1]]];
      gaps.forEach(([g0, g1]) => {
        if (Math.abs(sb - sa) < 1e-9) { if (sa > g0 && sa < g1) ivs = []; return; }
        let u0 = (g0 - sa) / (sb - sa), u1 = (g1 - sa) / (sb - sa); if (u0 > u1) { const k = u0; u0 = u1; u1 = k; }
        ivs = ivs.flatMap(([x, y]) => { const o = []; if (u0 > x) o.push([x, Math.min(y, u0)]); if (u1 < y) o.push([Math.max(x, u1), y]); return o.filter(([p, q]) => q - p > 1e-6); });
      });
      const d = sub(b, a);
      ivs.forEach(([x, y]) => { const p = add(a, mul(d, x)), q = add(a, mul(d, y)); if (dist(p, q) > 0.05) out.push(Object.assign({ t: 'line', layer: 'patt', a: p, b: q }, extra, more || {})); });
    };
    const ss = poly.map(along), ts = poly.map(across);
    const s0 = Math.min(...ss), s1 = Math.max(...ss), t0 = Math.min(...ts), t1 = Math.max(...ts), mid = (t0 + t1) / 2;
    const family = (angle, sp) => {
      const u = { x: Math.cos(angle), y: Math.sin(angle) }, v = { x: -u.y, y: u.x };
      const cs = [[s0, t0], [s1, t0], [s0, t1], [s1, t1]].map(([s, t]) => v.x * s + v.y * t);
      const span = (s1 - s0) + (t1 - t0) + 1, cmax = Math.max(...cs);
      for (let c = Math.ceil(Math.min(...cs) / sp) * sp; c <= cmax; c += sp) { const s = v.x * c, t = v.y * c; seg(at(s - u.x * span, t - u.y * span), at(s + u.x * span, t + u.y * span)); }
    };
    const ticks = sp => { for (let s = Math.ceil(s0 / sp) * sp; s <= s1; s += sp) seg(at(s, t0 - 1), at(s, t1 + 1)); };
    if (style === 'wood') family(Math.PI / 4, P(0.11));
    else if (style === 'cmu') family(Math.PI / 4, P(0.045));
    else if (style === 'rated') family(-Math.PI / 4, P(0.05));
    else if (style === 'brick') { family(Math.PI / 4, P(0.04)); family(-Math.PI / 4, P(0.04)); }
    else if (style === 'metal') { const dash = P(0.06), gap = P(0.035); for (let s = s0; s < s1; s += dash + gap) seg(at(s, mid), at(Math.min(s + dash, s1), mid)); }
    else if (style === 'glass') { seg(at(s0 - 1, mid), at(s1 + 1, mid)); ticks(60); }
    else if (style === 'low') ticks(P(0.09));
    else if (style === 'conc') {
      const sp = P(0.05), r = P(0.007); let row = 0;
      for (let t = Math.ceil(t0 / sp) * sp; t <= t1; t += sp, row++) for (let s = Math.ceil(s0 / sp) * sp + (row % 2 ? sp / 2 : 0); s <= s1; s += sp) {
        const p = at(s, t), c = clipToConvex(p, add(p, { x: 1e-4, y: 0 }), poly);
        if (c && c[0] === 0 && !gaps.some(g => s > g[0] && s < g[1])) out.push(Object.assign({ t: 'circle', layer: 'patt', c: p, r, fill: true }, extra));
      }
    }
    return out;
  }

  /* ----------------------------------------------------------- drawing primitives
   * One list of primitives feeds SVG, PDF and DXF, so all three outputs carry the same
   * geometry and the same computed dimensions. Lineweights are paper inches.            */
  const LAYERS = {
    wall: { dxf: 'A-WALL', color: 7, lw: 0.024 }, patt: { dxf: 'A-WALL-PATT', color: 8, lw: 0.004 }, door: { dxf: 'A-DOOR', color: 2, lw: 0.012 }, glaz: { dxf: 'A-GLAZ', color: 4, lw: 0.012 },
    dims: { dxf: 'A-ANNO-DIMS', color: 1, lw: 0.007 }, tick: { dxf: 'A-ANNO-DIMS', color: 1, lw: 0.016 }, iden: { dxf: 'A-AREA-IDEN', color: 3, lw: 0.01 }, tags: { dxf: 'A-ANNO-TAGS', color: 6, lw: 0.008 },
    cols: { dxf: 'S-COLS', color: 5, lw: 0.016 }, strs: { dxf: 'A-FLOR-STRS', color: 3, lw: 0.009 }, fixt: { dxf: 'P-FIXT', color: 4, lw: 0.008 }, anno: { dxf: 'A-ANNO-TEXT', color: 7, lw: 0.008 }, legend: { dxf: 'A-ANNO-LEGN', color: 7, lw: 0.007 },
    shpf: { dxf: 'A-ANNO-SKCH', color: 8, lw: 0.006 }, shpm: { dxf: 'A-ANNO-SKCH', color: 7, lw: 0.012 }, shph: { dxf: 'A-ANNO-SKCH', color: 7, lw: 0.022 },
  };
  function itemPrims(it, scale) {
    const out = [], X = { item: it.id }, W = p => add(it.at, rotV(p, it.rot || 0));
    const L = (layer, a, b, more) => out.push(Object.assign({ t: 'line', layer, a, b }, X, more || {}));
    const poly = (layer, pts, fill) => out.push(Object.assign({ t: 'poly', layer, pts, fill }, X));
    const T = (layer, at, text, size, angle, more) => out.push(Object.assign({ t: 'text', layer, at, text, size, angle: angle || 0, middle: true }, X, more || {}));
    if (it.kind === 'column') {
      const pts = itemOutline(it, scale); poly('cols', pts, '#d5dce3');
      if (it.shape !== 'round') { L('cols', pts[0], pts[2]); L('cols', pts[1], pts[3]); }
    } else if (it.kind === 'fixture') {
      const sh = fixtureShapes(it.fixture); sh.polys.forEach(p => poly('fixt', p.map(W), null)); (sh.lines || []).forEach(([a, b]) => L('fixt', W(a), W(b)));
    } else if (it.kind === 'stair') {
      const n = stairRisers(it), treads = Math.max(1, n - 1), td = it.length / treads, hw = it.width / 2;
      poly('strs', rect(0, -hw, it.length, hw).map(W), null);
      for (let i = 1; i < treads; i++) L('strs', W({ x: i * td, y: -hw }), W({ x: i * td, y: hw }));
      const a0 = W({ x: Math.min(td * 0.5, it.length * 0.2), y: 0 }), a1 = W({ x: it.length - Math.min(td * 0.4, it.length * 0.1), y: 0 }), ah = Math.min(0.08 * scale, it.width * 0.25);
      L('strs', a0, a1); L('strs', a1, W({ x: it.length - Math.min(td * 0.4, it.length * 0.1) - ah, y: -ah * 0.6 })); L('strs', a1, W({ x: it.length - Math.min(td * 0.4, it.length * 0.1) - ah, y: ah * 0.6 }));
      out.push(Object.assign({ t: 'circle', layer: 'strs', c: a0, r: 0.025 * scale, fill: true }, X));
      const lab = 'UP ' + n + 'R', ls = PAPER.text * scale, horiz = Math.abs(Math.cos((it.rot || 0) * Math.PI / 180)) > 0.7;
      T('strs', W({ x: -((horiz ? lab.length * ls * 0.31 : ls * 0.6) + 0.06 * scale), y: 0 }), lab, ls, 0);
    } else if (it.kind === 'shape') {
      const layer = SHAPE_WEIGHTS[it.weight] || 'shpm';
      if (it.shape === 'circle' && !it.rot) out.push(Object.assign({ t: 'circle', layer, c: add(it.at, it.pts[0] || { x: 0, y: 0 }), r: it.r, dash: it.dash }, X));
      else shapeLines(it).forEach(l => { for (let i = 0; i + 1 < l.length; i++) if (dist(l[i], l[i + 1]) > 1e-6) L(layer, l[i], l[i + 1], { dash: it.dash }); });
    } else if (it.kind === 'text') {
      T('anno', it.at, it.text, it.size * scale, it.rot || 0);
    } else if (it.kind === 'dim') {
      const g = dimGeometry(it, scale), gap = PAPER.extGap * scale, beyond = PAPER.extBeyond * scale, text = formatFtIn(g.value);
      L('dims', g.la, g.lb, { dim: true });
      [[it.a, g.la], [it.b, g.lb]].forEach(([p, q]) => { const s = Math.abs(it.off || 0) > gap ? 1 : 0; L('dims', add(p, mul(g.n, gap * s)), add(q, mul(g.n, beyond)), { dim: true }); });
      const tk = PAPER.tick * scale / 2, diag = norm({ x: g.d.x - g.d.y, y: g.d.y + g.d.x });
      [g.la, g.lb].forEach(p => L('tick', sub(p, mul(diag, tk)), add(p, mul(diag, tk)), { dim: true }));
      out.push(Object.assign({ t: 'text', layer: 'dims', at: add(mul(add(g.la, g.lb), 0.5), mul(g.up, PAPER.textGap * scale)), text, size: PAPER.text * scale, angle: g.angle, dim: true, value: g.value, kind: 'manual', side: 'M' }, X));
    }
    return out;
  }
  const ascii = s => String(s).replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '');
  /** Wall-type legend + opening schedule (heights) placed under the plan, for exports. */
  function legendPrims(m, scale, b) {
    const out = [], ts = PAPER.text * scale, row = ts * 2.4; const x0 = b.x0 + 0.4 * scale; let y = b.y1 + 0.15 * scale;
    const T = (x, text, size, more) => out.push(Object.assign({ t: 'text', layer: 'legend', at: { x, y }, text: ascii(text), size, angle: 0, start: true }, more || {}));
    const used = []; m.walls.forEach(w => { const k = wallTypeKey(w); if (!used.includes(k)) used.push(k); });
    if (used.length) {
      T(x0, 'WALL TYPES', ts * 1.2); y += row;
      used.forEach(k => {
        const ty = WALL_TYPES[k], sw = 0.5 * scale, sh = 0.16 * scale, poly = rect(x0, y - sh / 2, x0 + sw, y + sh / 2), ws = m.walls.filter(w => wallTypeKey(w) === k);
        out.push({ t: 'poly', layer: 'legend', pts: poly, fill: ty.fill, legendType: k });
        hatch(poly, { x: x0, y }, { x: 1, y: 0 }, ty.hatch, scale, [], { legendType: k }).forEach(p => out.push(p));
        const th = [...new Set(ws.map(w => w.thickness))].sort((a, c) => a - c).map(v => formatFtIn(v)).join(', ');
        const hs = [...new Set(ws.map(w => w.height))].sort((a, c) => a - c).map(v => formatFtIn(v)).join(', ');
        T(x0 + sw + 0.12 * scale, `${ty.name.toUpperCase()}, ${th} THICK, HEIGHT ${hs}`, ts, { legendType: k }); y += row;
      });
    }
    if (m.openings.length) {
      y += row * 0.3; T(x0, 'OPENINGS', ts * 1.2); y += row;
      const groups = new Map();
      m.openings.forEach(o => { const key = [o.kind, o.tag || '', o.width, o.head, o.sill == null ? '' : o.sill].join('|'); const g = groups.get(key); if (g) g.n++; else groups.set(key, { o, n: 1 }); });
      [...groups.values()].sort((a, c) => (a.o.tag || '~').localeCompare(c.o.tag || '~')).forEach(({ o, n }) => {
        const kind = o.kind === 'cased' ? 'CASED OPENING' : o.kind.toUpperCase();
        T(x0, `${o.tag || '-'}  ${kind} (${n})  ${formatFtIn(o.width)} WIDE, HEAD ${formatFtIn(o.head)}${o.kind === 'window' ? ', SILL ' + formatFtIn(o.sill) : ''}`, ts, { opening: o.id }); y += row;
      });
    }
    return out;
  }
  function primitives(m, scale, opts) {
    scale = scale || 48; m = normalizeModel(m); opts = opts || {};
    const out = [], L = (layer, a, b, extra) => out.push(Object.assign({ t: 'line', layer, a, b }, extra || {}));
    const T = (layer, at, text, size, angle, extra) => out.push(Object.assign({ t: 'text', layer, at, text, size, angle: angle || 0 }, extra || {}));
    // walls (outline with gaps at openings)
    m.walls.forEach(w => {
      const o = wallOutline(m, w), n = o.normal, t = w.thickness / 2;
      const along = p => (p.x - w.a.x) * o.dir.x + (p.y - w.a.y) * o.dir.y;
      const pt = (s, side) => add(add(w.a, mul(o.dir, s)), mul(n, side * t));
      const ops = m.openings.filter(x => x.wall === w.id).map(x => openingGeometry(m, x)).map(g => [along(g.jamb1), along(g.jamb2)].sort((a, b) => a - b));
      // wall-type hatch, clipped to the wall and kept out of openings
      const ty = wallType(w);
      if (ty.hatch !== 'solid') hatch([o.outerA, o.outerB, o.innerB, o.innerA], w.a, o.dir, ty.hatch, scale, ops, { wall: w.id }).forEach(p => out.push(p));
      // partitions butting into this wall break the face they arrive on
      const tees = { 1: [], [-1]: [] };
      m.walls.forEach(x => { if (x === w) return; ['a', 'b'].forEach(k => { const p = x[k]; const tr = endTrim(m, x, k); if (tr.host !== w.id) return; const away = k === 'a' ? wallDir(x) : mul(wallDir(x), -1); const side = away.x * n.x + away.y * n.y > 0 ? 1 : -1; const c = along(p);
        const xo = wallOutline(m, x), c1 = along(k === 'a' ? xo.outerA : xo.outerB), c2 = along(k === 'a' ? xo.innerA : xo.innerB); // V22: angled tees open the face by their real width
        tees[side].push(Math.abs(Math.abs(c2 - c1) - x.thickness) < 1e-6 || !isFinite(c1 + c2) ? [c - x.thickness / 2, c + x.thickness / 2] : [Math.min(c1, c2), Math.max(c1, c2)]); }); });
      [1, -1].forEach(side => {
        const from = along(side === 1 ? o.outerA : o.innerA), to = along(side === 1 ? o.outerB : o.innerB);
        const gaps = ops.concat(tees[side]).sort((a, b) => a[0] - b[0]);
        let cur = from;
        gaps.forEach(([g0, g1]) => { if (g0 - cur > 0.01) L('wall', pt(cur, side), pt(g0, side), { wall: w.id }); cur = Math.max(cur, g1); });
        if (to - cur > 0.01) L('wall', pt(cur, side), pt(to, side), { wall: w.id });
      });
      if (o.capA) L('wall', o.outerA, o.innerA, { wall: w.id });
      if (o.capB) L('wall', o.outerB, o.innerB, { wall: w.id });
      ops.forEach(([s0, e0]) => { L('wall', pt(s0, 1), pt(s0, -1), { wall: w.id }); L('wall', pt(e0, 1), pt(e0, -1), { wall: w.id }); });
    });
    // doors, windows and cased openings
    m.openings.forEach(op => {
      const g = openingGeometry(m, op), w = g.wall, t = w.thickness / 2;
      if (op.kind === 'window') {
        L('glaz', add(g.jamb1, mul(g.normal, t * 0.25)), add(g.jamb2, mul(g.normal, t * 0.25)), { opening: op.id });
        L('glaz', sub(g.jamb1, mul(g.normal, t * 0.25)), sub(g.jamb2, mul(g.normal, t * 0.25)), { opening: op.id });
        L('glaz', g.outer1, g.outer2, { opening: op.id }); L('glaz', g.inner1, g.inner2, { opening: op.id });
      } else if (op.kind === 'cased') {
        // head above the cut plane: dashed lines across the opening on both faces
        L('door', g.outer1, g.outer2, { opening: op.id, dash: true }); L('door', g.inner1, g.inner2, { opening: op.id, dash: true });
      } else {
        // V21: op.opens 'out' swings the leaf to the +normal face (outside for exterior walls)
        const ox = op.opens === 'out', inward = mul(g.normal, ox ? 1 : -1), hinge = op.swing === 'right' ? (ox ? g.outer2 : g.inner2) : (ox ? g.outer1 : g.inner1), other = op.swing === 'right' ? (ox ? g.outer1 : g.inner1) : (ox ? g.outer2 : g.inner2);
        const leafEnd = add(hinge, mul(inward, op.width));
        L('door', hinge, leafEnd, { opening: op.id });
        out.push({ t: 'arc', layer: 'door', c: hinge, r: op.width, from: other, to: leafEnd, opening: op.id });
      }
      if (op.tag) { const tagAt = add(g.center, mul(g.normal, -(t + 0.28 * scale))); out.push({ t: 'circle', layer: 'tags', c: tagAt, r: 0.09 * scale }); T('tags', tagAt, op.tag, PAPER.text * scale * 0.9, 0, { middle: true }); }
    });
    // columns, stairs, fixtures, text, manual dimensions
    m.items.forEach(it => itemPrims(it, scale).forEach(p => out.push(p)));
    // dimensions
    const { dims } = computeDimensions(m, scale);
    dims.forEach(d => {
      L('dims', d.a, d.b, { dim: true });
      d.ext.forEach(e => L('dims', e[0], e[1], { dim: true }));
      const tk = PAPER.tick * scale / 2, dir = norm(sub(d.b, d.a)), diag = norm({ x: dir.x - dir.y, y: dir.y + dir.x });
      [d.a, d.b].forEach(p => L('tick', sub(p, mul(diag, tk)), add(p, mul(diag, tk)), { dim: true }));
      T('dims', d.textAt, d.text, d.textHeight, d.angle, { dim: true, value: d.value, kind: d.kind, side: d.side });
    });
    placeRoomLabels(m, dims, scale).forEach(l => l.lines.forEach((s, i) => T('iden', { x: l.at.x, y: l.at.y + (i - (l.lines.length - 1) / 2) * l.size * 1.2 }, s, l.size * (i ? 0.85 : 1), 0, { middle: true, room: l.room.id })));
    if (opts.legend) legendPrims(m, scale, baseBounds(m, scale)).forEach(p => out.push(p));
    return out;
  }

  /* ----------------------------------------------------------- outputs */
  const xesc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ptsAttr = pts => pts.map(p => p.x.toFixed(3) + ',' + p.y.toFixed(3)).join(' ');
  /** opts: ink, poche (generic wall fill), paper, paperSize, legend (wall-type legend and
   *  opening schedule), hit (transparent pick areas for items, for the editor). */
  function toSVG(m, scale, opts) {
    scale = scale || 48; opts = opts || {}; m = normalizeModel(m);
    const legend = opts.legend != null ? !!opts.legend : !!opts.paperSize;
    const b = bounds(m, scale, { legend }), prims = primitives(m, scale, { legend }), lw = k => (LAYERS[k].lw * scale).toFixed(3);
    const parts = [], color = opts.ink || '#111';
    // poche / wall-type fill under the linework
    m.walls.forEach(w => {
      const o = wallOutline(m, w), ty = wallType(w), key = wallTypeKey(w);
      const fill = ty.hatch === 'solid' ? (opts.poche || '#b8c4cf') : ty.fill;
      parts.push(`<polygon class="du-wall-fill" data-wall="${w.id}" data-wtype="${key}" data-height="${w.height}" points="${ptsAttr([o.outerA, o.outerB, o.innerB, o.innerA])}" fill="${fill}" stroke="none"/>`);
    });
    m.openings.forEach(op => { const g = openingGeometry(m, op); parts.push(`<polygon class="du-opening-fill" data-opening="${op.id}" data-kind="${op.kind}" data-head="${op.head}"${op.sill != null ? ` data-sill="${op.sill}"` : ''} points="${ptsAttr([g.outer1, g.outer2, g.inner2, g.inner1])}" fill="${opts.paper || '#fff'}" stroke="none"/>`); });
    if (opts.hit) m.items.forEach(it => parts.push(it.kind === 'shape' ? shapeLines(it).map(l => `<polyline class="du-item-hit du-shape-hit" data-item="${it.id}" points="${ptsAttr(l)}" fill="none" stroke="rgba(0,0,0,0)" stroke-width="${(0.12 * scale).toFixed(3)}" stroke-linecap="round" stroke-linejoin="round"/>`).join('') : `<polygon class="du-item-hit" data-item="${it.id}" points="${ptsAttr(itemOutline(it, scale))}" fill="rgba(0,0,0,0)" stroke="none"/>`));
    prims.forEach(p => {
      const data = `${p.wall ? ` data-wall="${p.wall}"` : ''}${p.opening ? ` data-opening="${p.opening}"` : ''}${p.item ? ` data-item="${p.item}"` : ''}${p.room ? ` data-room="${p.room}"` : ''}${p.legendType ? ` data-legend="${p.legendType}"` : ''}`;
      if (p.t === 'line') parts.push(`<line class="du-${p.layer}"${data} x1="${p.a.x.toFixed(3)}" y1="${p.a.y.toFixed(3)}" x2="${p.b.x.toFixed(3)}" y2="${p.b.y.toFixed(3)}" stroke="${color}" stroke-width="${lw(p.layer)}" stroke-linecap="square"${p.dash ? ` stroke-dasharray="${(0.05 * scale).toFixed(2)} ${(0.035 * scale).toFixed(2)}"` : ''}/>`);
      else if (p.t === 'arc') { const sw = cross(sub(p.from, p.c), sub(p.to, p.c)) > 0 ? 1 : 0; parts.push(`<path class="du-door" data-opening="${p.opening}" d="M${p.from.x.toFixed(3)} ${p.from.y.toFixed(3)} A${p.r} ${p.r} 0 0 ${sw} ${p.to.x.toFixed(3)} ${p.to.y.toFixed(3)}" fill="none" stroke="${color}" stroke-width="${lw('door')}" stroke-dasharray="${(0.04 * scale).toFixed(2)} ${(0.03 * scale).toFixed(2)}"/>`); }
      else if (p.t === 'circle') parts.push(`<circle class="du-${p.layer}"${data} cx="${p.c.x.toFixed(3)}" cy="${p.c.y.toFixed(3)}" r="${p.r.toFixed(3)}" fill="${p.fill ? color : 'none'}" stroke="${p.fill ? 'none' : color}" stroke-width="${lw(p.layer)}"${p.dash ? ` stroke-dasharray="${(0.05 * scale).toFixed(2)} ${(0.035 * scale).toFixed(2)}"` : ''}/>`);
      else if (p.t === 'poly') parts.push(`<polygon class="du-${p.layer}"${data} points="${ptsAttr(p.pts)}" fill="${p.fill || 'none'}" stroke="${color}" stroke-width="${lw(p.layer)}"/>`);
      else if (p.t === 'text') parts.push(`<text class="du-${p.layer}"${data}${p.dim ? ` data-dim-kind="${p.kind}" data-dim-side="${p.side}" data-dim-value="${p.value}"` : ''} x="${p.at.x.toFixed(3)}" y="${p.at.y.toFixed(3)}" font-size="${p.size.toFixed(3)}" font-family="Helvetica, Arial, sans-serif" fill="${color}" text-anchor="${p.start ? 'start' : 'middle'}" dominant-baseline="${p.dim ? 'auto' : 'middle'}"${p.angle ? ` transform="rotate(${p.angle} ${p.at.x.toFixed(3)} ${p.at.y.toFixed(3)})"` : ''}>${xesc(p.text)}</text>`);
    });
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    const size = opts.paperSize ? ` width="${(w / scale).toFixed(3)}in" height="${(h / scale).toFixed(3)}in"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x0.toFixed(3)} ${b.y0.toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)}"${size} data-scale="${scale}">${opts.paperSize ? `<rect x="${b.x0.toFixed(3)}" y="${b.y0.toFixed(3)}" width="${w.toFixed(3)}" height="${h.toFixed(3)}" fill="${opts.paper || '#fff'}"/>` : ''}${parts.join('')}</svg>`;
  }
  function cross(p, q) { return p.x * q.y - p.y * q.x; }

  /** AutoCAD R12 ASCII DXF in real units (inches). Dimensions are exported as lines and
   *  text on layer A-ANNO-DIMS (not associative DIMENSION entities). Wall hatches are lines
   *  on A-WALL-PATT; the wall-type legend and opening schedule are on A-ANNO-LEGN. */
  function toDXF(m, scale, opts) {
    scale = scale || 48; m = normalizeModel(m); opts = opts || {};
    const prims = primitives(m, scale, { legend: opts.legend !== false }), out = [];
    const g = (code, v) => out.push(String(code), String(v));
    const Y = y => (-y).toFixed(4); // DXF is y-up
    const line = (layer, a, b) => { g(0, 'LINE'); g(8, layer); g(10, a.x.toFixed(4)); g(20, Y(a.y)); g(30, 0); g(11, b.x.toFixed(4)); g(21, Y(b.y)); g(31, 0); };
    g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 1); g(9, '$MEASUREMENT'); g(70, 0); g(0, 'ENDSEC');
    const layerNames = [...new Set(Object.values(LAYERS).map(l => l.dxf))];
    g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, layerNames.length);
    const seen = new Set(); Object.values(LAYERS).forEach(l => { if (seen.has(l.dxf)) return; seen.add(l.dxf); g(0, 'LAYER'); g(2, l.dxf); g(70, 0); g(62, l.color); g(6, 'CONTINUOUS'); });
    g(0, 'ENDTAB'); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    prims.forEach(p => {
      const layer = LAYERS[p.layer].dxf;
      if (p.t === 'line') line(layer, p.a, p.b);
      else if (p.t === 'poly') p.pts.forEach((q, i) => line(layer, q, p.pts[(i + 1) % p.pts.length]));
      else if (p.t === 'circle') { g(0, 'CIRCLE'); g(8, layer); g(10, p.c.x.toFixed(4)); g(20, Y(p.c.y)); g(30, 0); g(40, p.r.toFixed(4)); }
      else if (p.t === 'arc') {
        const ang = q => (Math.atan2(-(q.y - p.c.y), q.x - p.c.x) * 180 / Math.PI + 360) % 360;
        let s = ang(p.from), e = ang(p.to); if (((e - s + 360) % 360) > 180) { const k = s; s = e; e = k; }
        g(0, 'ARC'); g(8, layer); g(10, p.c.x.toFixed(4)); g(20, Y(p.c.y)); g(30, 0); g(40, p.r.toFixed(4)); g(50, s.toFixed(4)); g(51, e.toFixed(4));
      } else if (p.t === 'text') {
        const rot = -(p.angle || 0);
        g(0, 'TEXT'); g(8, layer); g(10, p.at.x.toFixed(4)); g(20, Y(p.at.y)); g(30, 0); g(40, p.size.toFixed(4)); g(1, ascii(p.text)); if (rot) g(50, rot);
        if (!p.start) { g(72, 1); g(11, p.at.x.toFixed(4)); g(21, Y(p.at.y)); g(31, 0); }
      }
    });
    g(0, 'ENDSEC'); g(0, 'EOF');
    return out.join('\r\n') + '\r\n';
  }

  /** Vector PDF sheet (11×17 landscape) at the chosen scale, with a title block.
   *  Returns a binary string; write it with a Uint8Array of its char codes. */
  function toPDF(m, scale, info) {
    scale = scale || 48; info = info || {}; m = normalizeModel(m);
    const legend = info.legend !== false;
    const W = 17 * 72, H = 11 * 72, margin = 0.5 * 72, tbH = 1.1 * 72;
    const b = bounds(m, scale, { legend }), drawW = (b.x1 - b.x0) / scale * 72, drawH = (b.y1 - b.y0) / scale * 72;
    const areaW = W - 2 * margin, areaH = H - 2 * margin - tbH;
    const fits = drawW <= areaW && drawH <= areaH;
    const k = 72 / scale; // model inches → points
    const ox = margin + (areaW - drawW) / 2 - b.x0 * k, oy = H - margin - (areaH - drawH) / 2 + b.y0 * k;
    const X = x => (ox + x * k).toFixed(2), Yp = y => (oy - y * k).toFixed(2);
    const ps = s => '(' + String(s).replace(/[\\()]/g, c => '\\' + c).replace(/[^\x20-\x7e]/g, '') + ')';
    const rgb = hex => { const h = String(hex || '#ffffff').replace('#', ''); return [0, 2, 4].map(i => (parseInt(h.substr(i, 2), 16) / 255).toFixed(3)).join(' '); };
    const path = pts => `${X(pts[0].x)} ${Yp(pts[0].y)} m ` + pts.slice(1).map(p => `${X(p.x)} ${Yp(p.y)} l`).join(' ') + ' h';
    const c = [];
    m.walls.forEach(w => { const o = wallOutline(m, w), ty = wallType(w); c.push(`${ty.hatch === 'solid' ? '0.72 0.77 0.81' : rgb(ty.fill)} rg ` + path([o.outerA, o.outerB, o.innerB, o.innerA]) + ' f'); });
    c.push('1 1 1 rg');
    m.openings.forEach(op => { const gg = openingGeometry(m, op); c.push(path([gg.outer1, gg.outer2, gg.inner2, gg.inner1]) + ' f'); });
    c.push('0 0 0 RG 0 0 0 rg 2 J');
    primitives(m, scale, { legend }).forEach(p => {
      const lwPt = (LAYERS[p.layer].lw * 72).toFixed(2);
      if (p.t === 'line') c.push(`${lwPt} w ${p.dash ? '[3 2]' : '[]'} 0 d ${X(p.a.x)} ${Yp(p.a.y)} m ${X(p.b.x)} ${Yp(p.b.y)} l S`);
      else if (p.t === 'poly') c.push(`${lwPt} w [] 0 d ${p.fill ? rgb(p.fill) + ' rg ' + path(p.pts) + ' B 0 0 0 rg' : path(p.pts) + ' S'}`);
      else if (p.t === 'circle' && p.fill) { const r = Math.max(p.r * k, 0.35); c.push(`${(+X(p.c.x) - r).toFixed(2)} ${(+Yp(p.c.y) - r).toFixed(2)} ${(2 * r).toFixed(2)} ${(2 * r).toFixed(2)} re f`); }
      else if (p.t === 'circle' || p.t === 'arc') {
        const a0 = p.t === 'circle' ? 0 : Math.atan2(p.from.y - p.c.y, p.from.x - p.c.x);
        let a1 = p.t === 'circle' ? Math.PI * 2 : Math.atan2(p.to.y - p.c.y, p.to.x - p.c.x);
        if (p.t === 'arc') { let dA = a1 - a0; while (dA > Math.PI) dA -= 2 * Math.PI; while (dA < -Math.PI) dA += 2 * Math.PI; a1 = a0 + dA; }
        const n = 24, pts = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push({ x: p.c.x + p.r * Math.cos(a), y: p.c.y + p.r * Math.sin(a) }); }
        c.push(`${lwPt} w ${p.t === 'arc' ? '[3 2] 0 d ' : ''}${X(pts[0].x)} ${Yp(pts[0].y)} m ` + pts.slice(1).map(q => `${X(q.x)} ${Yp(q.y)} l`).join(' ') + ' S [] 0 d');
      } else if (p.t === 'text') {
        const size = p.size * k, w = p.text.length * size * 0.55, rad = (p.angle || 0) * Math.PI / 180;
        const cos = Math.cos(-rad), sin = Math.sin(-rad);
        const dx = p.start ? 0 : -w / 2, dy = p.dim ? 0 : -size * 0.35;
        const tx = +X(p.at.x) + dx * cos - dy * sin, ty = +Yp(p.at.y) + dx * sin + dy * cos;
        c.push(`BT /F1 ${size.toFixed(2)} Tf ${cos.toFixed(4)} ${sin.toFixed(4)} ${(-sin).toFixed(4)} ${cos.toFixed(4)} ${tx.toFixed(2)} ${ty.toFixed(2)} Tm ${ps(p.text)} Tj ET`);
      }
    });
    // sheet border + title block
    const scaleText = ({ 96: '1/8" = 1\'-0"', 48: '1/4" = 1\'-0"', 24: '1/2" = 1\'-0"', 16: '3/4" = 1\'-0"', 12: '1" = 1\'-0"' })[scale] || `1:${scale}`;
    c.push(`1.2 w ${margin / 2} ${margin / 2} ${W - margin} ${H - margin} re S 0.6 w ${margin} ${margin} ${W - 2 * margin} ${tbH - 8} re S`);
    const tb = [[info.project || 'DrawUp Project', 14, margin + 12, margin + tbH - 34], [info.name || 'Floor Plan', 11, margin + 12, margin + tbH - 54], ['Scale ' + scaleText + (fits ? '' : '  (drawing exceeds sheet at this scale)'), 9, margin + 12, margin + tbH - 72], [info.sheet || 'A101', 22, W - margin - 110, margin + tbH - 44], ['Rev ' + (info.revision || 1) + '  ' + (info.date || ''), 8, W - margin - 110, margin + tbH - 64], ['Dimensions are computed from the drawing geometry. Verify in field.', 7, margin + 340, margin + tbH - 72]];
    tb.forEach(([s, size, x, y]) => c.push(`BT /F1 ${size} Tf ${x} ${y} Td ${ps(s)} Tj ET`));
    const stream = c.join('\n');
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
    let pdf = '%PDF-1.4\n', offs = [];
    objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return pdf;
  }

  /** A small starter plan: 20'-0" x 30'-0" outside, one partition, doors, windows, rooms. */
  function samplePlan() {
    const m = emptyModel();
    const [n, e, s, wW] = addRectangle(m, 0, 0, 240, 360, 6);
    const p = addWall(m, { x: 3, y: 192 }, { x: 237, y: 192 }, { thickness: 4.5, type: 'interior' });
    addOpening(m, s.id, 'door', 117, 36, { tag: '101' }); // s runs east→west
    addOpening(m, n.id, 'window', 57, 48, { tag: 'A' });
    addOpening(m, n.id, 'window', 177, 48, { tag: 'A' });
    addOpening(m, e.id, 'window', 93, 36, { tag: 'B' });
    addOpening(m, p.id, 'door', 168, 36, { tag: '102', swing: 'right' });
    m.rooms.push({ id: uid('r'), name: 'OFFICE', number: '102', at: { x: 120, y: 96 } }, { id: uid('r'), name: 'STORAGE', number: '101', at: { x: 120, y: 276 } });
    return m;
  }

  const api = { formatFtIn, parseFtIn, snap, emptyModel, normalizeModel, addWall, addRectangle, wallFaceLength, setWallFaceLength, addOpening, moveOpening, removeWall, removeOpening, setWallLength, wallLength, wallById, computeDimensions, collisions, primitives, toSVG, toDXF, toPDF, bounds, samplePlan, outwardNormal, wallOutline, openingGeometry, PAPER,
    WALL_TYPES, FIXTURES, wallType, wallTypeKey, setWallType, addItem, moveItem, removeItem, itemOutline, stairRisers, dimGeometry, legendPrims, hatch,
    SHAPES, shapeLines, shapeLocal, makeShape, regularPolygon, arcPoints, curvePoints, circle3, endTrim, LAYERS };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DrawUpDrawCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
