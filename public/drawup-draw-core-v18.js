/* DrawUp Draw core — V18
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
  function emptyModel() { return { units: 'in', walls: [], openings: [], rooms: [] }; }
  function normalizeModel(m) {
    m = m && typeof m === 'object' ? clone(m) : emptyModel();
    m.units = 'in'; m.walls = Array.isArray(m.walls) ? m.walls : []; m.openings = Array.isArray(m.openings) ? m.openings : []; m.rooms = Array.isArray(m.rooms) ? m.rooms : [];
    return m;
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
      const host = m.walls.find(x => pointOnWall(p, x, x.thickness / 2 + 0.01) && Math.abs(wallDir(x).x * d0.x + wallDir(x).y * d0.y) < 0.01);
      if (!host) return;
      const hd = wallDir(host), r = sub(p, host.a), along = r.x * hd.x + r.y * hd.y, q = add(host.a, mul(hd, along));
      p.x = snap(q.x); p.y = snap(q.y);
    });
    const w = { id: opts.id || uid('w'), a, b, thickness: opts.thickness || 6, type: opts.type || 'exterior' };
    if (wallLength(w) < 1) throw new Error('A wall must be at least 1" long.');
    m.walls.push(w); return w;
  }
  function addOpening(m, wallId, kind, offset, width, opts) {
    opts = opts || {};
    const w = wallById(m, wallId); if (!w) throw new Error('Wall not found.');
    const o = { id: opts.id || uid(kind === 'door' ? 'd' : 'g'), wall: wallId, kind: kind === 'window' ? 'window' : 'door', offset: snap(offset), width: snap(width), tag: opts.tag || '', swing: opts.swing || 'left', head: opts.head || null };
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
  function endTrim(m, w, end) {
    const p = w[end], d = wallDir(w), n = wallNormal(m, w);
    const other = m.walls.find(x => x !== w && (same(x.a, p) || same(x.b, p)));
    if (other) {
      const away = same(other.a, p) ? wallDir(other) : mul(wallDir(other), -1), tx = other.thickness / 2;
      if (Math.abs(away.x * d.x + away.y * d.y) > 0.99) return { plus: 0, minus: 0, joint: true };
      const side = away.x * n.x + away.y * n.y;
      return { plus: side > 0 ? -tx : tx, minus: side > 0 ? tx : -tx, joint: true };
    }
    const host = m.walls.find(x => x !== w && pointOnWall(p, x, x.thickness / 2 + 0.01));
    if (host) return { plus: -host.thickness / 2, minus: -host.thickness / 2, joint: true, host: host.id };
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
      const up = Math.abs(d.y) > 0.7 ? { x: -1, y: 0 } : { x: 0, y: -1 };
      const textAt = add(mul(add(lp, lq), 0.5), mul(up, P('textGap')));
      out.push({ kind: 'interior', side: 'I', wall: w.id, value: v, text, fits: tw + P('tick') * 1.5 <= v, a: lp, b: lq,
        ext: [[add(p, mul(n, w.thickness / 2 + P('extGap'))), add(lp, mul(n, P('extBeyond')))], [add(q, mul(n, w.thickness / 2 + P('extGap'))), add(lq, mul(n, P('extBeyond')))]],
        textAt, up, textWidth: tw, textHeight: P('text'), angle: Math.abs(d.y) > 0.7 ? -90 : 0 });
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
      const lines = [r.name || 'ROOM', r.number || ''].filter(Boolean);
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
    const { dims } = computeDimensions(m, scale), out = [];
    const boxes = dims.map(textBox);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlaps(boxes[i], boxes[j])) out.push(`dimension text ${dims[i].text} overlaps ${dims[j].text}`);
    dims.forEach((d, i) => { if (d.kind === 'interior' && textHitsWalls(m, d, wallById(m, d.wall))) out.push(`dimension text ${d.text} overlaps a wall`); });
    placeRoomLabels(m, dims, scale).forEach(l => { if (l.collides) out.push(`room label ${l.room.name} could not be placed clear`); });
    return out;
  }

  function bounds(m, scale) {
    const pts = []; m.walls.forEach(w => { const o = wallOutline(m, w); pts.push(o.outerA, o.outerB, o.innerA, o.innerB); });
    if (!pts.length) return { x0: 0, y0: 0, x1: 240, y1: 240 };
    const { dims } = computeDimensions(m, scale); dims.forEach(d => { pts.push(d.a, d.b, d.textAt); d.ext.forEach(e => pts.push(e[0], e[1])); });
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), pad = 0.4 * (scale || 48);
    return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
  }

  /* ----------------------------------------------------------- drawing primitives
   * One list of primitives feeds SVG, PDF and DXF, so all three outputs carry the same
   * geometry and the same computed dimensions. Lineweights are paper inches.            */
  const LAYERS = { wall: { dxf: 'A-WALL', color: 7, lw: 0.024 }, door: { dxf: 'A-DOOR', color: 2, lw: 0.012 }, glaz: { dxf: 'A-GLAZ', color: 4, lw: 0.012 }, dims: { dxf: 'A-ANNO-DIMS', color: 1, lw: 0.007 }, tick: { dxf: 'A-ANNO-DIMS', color: 1, lw: 0.016 }, iden: { dxf: 'A-AREA-IDEN', color: 3, lw: 0.01 }, tags: { dxf: 'A-ANNO-TAGS', color: 6, lw: 0.008 } };
  function primitives(m, scale) {
    scale = scale || 48; m = normalizeModel(m);
    const out = [], L = (layer, a, b, extra) => out.push(Object.assign({ t: 'line', layer, a, b }, extra || {}));
    const T = (layer, at, text, size, angle, extra) => out.push(Object.assign({ t: 'text', layer, at, text, size, angle: angle || 0 }, extra || {}));
    // walls (outline with gaps at openings)
    m.walls.forEach(w => {
      const o = wallOutline(m, w), n = o.normal, t = w.thickness / 2;
      const along = p => (p.x - w.a.x) * o.dir.x + (p.y - w.a.y) * o.dir.y;
      const pt = (s, side) => add(add(w.a, mul(o.dir, s)), mul(n, side * t));
      const ops = m.openings.filter(x => x.wall === w.id).map(x => openingGeometry(m, x)).map(g => [along(g.jamb1), along(g.jamb2)].sort((a, b) => a - b));
      // partitions butting into this wall break the face they arrive on
      const tees = { 1: [], [-1]: [] };
      m.walls.forEach(x => { if (x === w) return; ['a', 'b'].forEach(k => { const p = x[k]; const tr = endTrim(m, x, k); if (tr.host !== w.id) return; const away = k === 'a' ? wallDir(x) : mul(wallDir(x), -1); const side = away.x * n.x + away.y * n.y > 0 ? 1 : -1; const c = along(p); tees[side].push([c - x.thickness / 2, c + x.thickness / 2]); }); });
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
    // doors and windows
    m.openings.forEach(op => {
      const g = openingGeometry(m, op), w = g.wall, t = w.thickness / 2;
      if (op.kind === 'window') {
        L('glaz', add(g.jamb1, mul(g.normal, t * 0.25)), add(g.jamb2, mul(g.normal, t * 0.25)), { opening: op.id });
        L('glaz', sub(g.jamb1, mul(g.normal, t * 0.25)), sub(g.jamb2, mul(g.normal, t * 0.25)), { opening: op.id });
        L('glaz', g.outer1, g.outer2, { opening: op.id }); L('glaz', g.inner1, g.inner2, { opening: op.id });
      } else {
        const inward = mul(g.normal, -1), hinge = op.swing === 'right' ? g.inner2 : g.inner1, other = op.swing === 'right' ? g.inner1 : g.inner2;
        const leafEnd = add(hinge, mul(inward, op.width));
        L('door', hinge, leafEnd, { opening: op.id });
        out.push({ t: 'arc', layer: 'door', c: hinge, r: op.width, from: other, to: leafEnd, opening: op.id });
      }
      if (op.tag) { const tagAt = add(g.center, mul(g.normal, -(t + 0.28 * scale))); out.push({ t: 'circle', layer: 'tags', c: tagAt, r: 0.09 * scale }); T('tags', tagAt, op.tag, PAPER.text * scale * 0.9, 0, { middle: true }); }
    });
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
    return out;
  }

  /* ----------------------------------------------------------- outputs */
  const xesc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function toSVG(m, scale, opts) {
    scale = scale || 48; opts = opts || {}; m = normalizeModel(m);
    const b = bounds(m, scale), prims = primitives(m, scale), lw = k => (LAYERS[k].lw * scale).toFixed(3);
    const parts = [];
    // poche (solid wall fill) under the linework
    m.walls.forEach(w => {
      const o = wallOutline(m, w);
      parts.push(`<polygon class="du-wall-fill" data-wall="${w.id}" points="${[o.outerA, o.outerB, o.innerB, o.innerA].map(p => p.x.toFixed(3) + ',' + p.y.toFixed(3)).join(' ')}" fill="${opts.poche || '#b8c4cf'}" stroke="none"/>`);
    });
    m.openings.forEach(op => { const g = openingGeometry(m, op); parts.push(`<polygon class="du-opening-fill" data-opening="${op.id}" points="${[g.outer1, g.outer2, g.inner2, g.inner1].map(p => p.x.toFixed(3) + ',' + p.y.toFixed(3)).join(' ')}" fill="${opts.paper || '#fff'}" stroke="none"/>`); });
    prims.forEach(p => {
      const color = opts.ink || '#111';
      if (p.t === 'line') parts.push(`<line class="du-${p.layer}"${p.wall ? ` data-wall="${p.wall}"` : ''}${p.opening ? ` data-opening="${p.opening}"` : ''} x1="${p.a.x.toFixed(3)}" y1="${p.a.y.toFixed(3)}" x2="${p.b.x.toFixed(3)}" y2="${p.b.y.toFixed(3)}" stroke="${color}" stroke-width="${lw(p.layer)}" stroke-linecap="square"/>`);
      else if (p.t === 'arc') { const sw = cross(sub(p.from, p.c), sub(p.to, p.c)) > 0 ? 1 : 0; parts.push(`<path class="du-door" data-opening="${p.opening}" d="M${p.from.x.toFixed(3)} ${p.from.y.toFixed(3)} A${p.r} ${p.r} 0 0 ${sw} ${p.to.x.toFixed(3)} ${p.to.y.toFixed(3)}" fill="none" stroke="${color}" stroke-width="${lw('door')}" stroke-dasharray="${(0.04 * scale).toFixed(2)} ${(0.03 * scale).toFixed(2)}"/>`); }
      else if (p.t === 'circle') parts.push(`<circle class="du-tags" cx="${p.c.x.toFixed(3)}" cy="${p.c.y.toFixed(3)}" r="${p.r.toFixed(3)}" fill="none" stroke="${color}" stroke-width="${lw('tags')}"/>`);
      else if (p.t === 'text') parts.push(`<text class="du-${p.layer}"${p.dim ? ` data-dim-kind="${p.kind}" data-dim-side="${p.side}" data-dim-value="${p.value}"` : ''} x="${p.at.x.toFixed(3)}" y="${p.at.y.toFixed(3)}" font-size="${p.size.toFixed(3)}" font-family="Helvetica, Arial, sans-serif" fill="${color}" text-anchor="middle" dominant-baseline="${p.dim ? 'auto' : 'middle'}"${p.angle ? ` transform="rotate(${p.angle} ${p.at.x.toFixed(3)} ${p.at.y.toFixed(3)})"` : ''}>${xesc(p.text)}</text>`);
    });
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    const size = opts.paperSize ? ` width="${(w / scale).toFixed(3)}in" height="${(h / scale).toFixed(3)}in"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x0.toFixed(3)} ${b.y0.toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)}"${size} data-scale="${scale}">${parts.join('')}</svg>`;
  }
  function cross(p, q) { return p.x * q.y - p.y * q.x; }

  /** AutoCAD R12 ASCII DXF in real units (inches). Dimensions are exported as lines and
   *  text on layer A-ANNO-DIMS (not associative DIMENSION entities). */
  function toDXF(m, scale) {
    scale = scale || 48; m = normalizeModel(m);
    const prims = primitives(m, scale), out = [];
    const g = (code, v) => out.push(String(code), String(v));
    const Y = y => (-y).toFixed(4); // DXF is y-up
    g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 1); g(9, '$MEASUREMENT'); g(70, 0); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, Object.keys(LAYERS).length);
    const seen = new Set(); Object.values(LAYERS).forEach(l => { if (seen.has(l.dxf)) return; seen.add(l.dxf); g(0, 'LAYER'); g(2, l.dxf); g(70, 0); g(62, l.color); g(6, 'CONTINUOUS'); });
    g(0, 'ENDTAB'); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    prims.forEach(p => {
      const layer = LAYERS[p.layer].dxf;
      if (p.t === 'line') { g(0, 'LINE'); g(8, layer); g(10, p.a.x.toFixed(4)); g(20, Y(p.a.y)); g(30, 0); g(11, p.b.x.toFixed(4)); g(21, Y(p.b.y)); g(31, 0); }
      else if (p.t === 'circle') { g(0, 'CIRCLE'); g(8, layer); g(10, p.c.x.toFixed(4)); g(20, Y(p.c.y)); g(30, 0); g(40, p.r.toFixed(4)); }
      else if (p.t === 'arc') {
        const ang = q => (Math.atan2(-(q.y - p.c.y), q.x - p.c.x) * 180 / Math.PI + 360) % 360;
        let s = ang(p.from), e = ang(p.to); if (((e - s + 360) % 360) > 180) { const k = s; s = e; e = k; }
        g(0, 'ARC'); g(8, layer); g(10, p.c.x.toFixed(4)); g(20, Y(p.c.y)); g(30, 0); g(40, p.r.toFixed(4)); g(50, s.toFixed(4)); g(51, e.toFixed(4));
      } else if (p.t === 'text') {
        const rot = -(p.angle || 0);
        g(0, 'TEXT'); g(8, layer); g(10, p.at.x.toFixed(4)); g(20, Y(p.at.y)); g(30, 0); g(40, p.size.toFixed(4)); g(1, p.text); if (rot) g(50, rot); g(72, 1); g(11, p.at.x.toFixed(4)); g(21, Y(p.at.y)); g(31, 0);
      }
    });
    g(0, 'ENDSEC'); g(0, 'EOF');
    return out.join('\r\n') + '\r\n';
  }

  /** Vector PDF sheet (11×17 landscape) at the chosen scale, with a title block.
   *  Returns a binary string; write it with a Uint8Array of its char codes. */
  function toPDF(m, scale, info) {
    scale = scale || 48; info = info || {}; m = normalizeModel(m);
    const W = 17 * 72, H = 11 * 72, margin = 0.5 * 72, tbH = 1.1 * 72;
    const b = bounds(m, scale), drawW = (b.x1 - b.x0) / scale * 72, drawH = (b.y1 - b.y0) / scale * 72;
    const areaW = W - 2 * margin, areaH = H - 2 * margin - tbH;
    const fits = drawW <= areaW && drawH <= areaH;
    const k = 72 / scale; // model inches → points
    const ox = margin + (areaW - drawW) / 2 - b.x0 * k, oy = H - margin - (areaH - drawH) / 2 + b.y0 * k;
    const X = x => (ox + x * k).toFixed(2), Yp = y => (oy - y * k).toFixed(2);
    const ps = s => '(' + String(s).replace(/[\\()]/g, c => '\\' + c).replace(/[^\x20-\x7e]/g, '') + ')';
    const c = [];
    c.push('0.72 0.77 0.81 rg');
    m.walls.forEach(w => { const o = wallOutline(m, w); const pts = [o.outerA, o.outerB, o.innerB, o.innerA]; c.push(`${X(pts[0].x)} ${Yp(pts[0].y)} m ` + pts.slice(1).map(p => `${X(p.x)} ${Yp(p.y)} l`).join(' ') + ' h f'); });
    c.push('1 1 1 rg');
    m.openings.forEach(op => { const gg = openingGeometry(m, op); const pts = [gg.outer1, gg.outer2, gg.inner2, gg.inner1]; c.push(`${X(pts[0].x)} ${Yp(pts[0].y)} m ` + pts.slice(1).map(p => `${X(p.x)} ${Yp(p.y)} l`).join(' ') + ' h f'); });
    c.push('0 0 0 RG 0 0 0 rg 2 J');
    primitives(m, scale).forEach(p => {
      const lwPt = (LAYERS[p.layer].lw * 72).toFixed(2);
      if (p.t === 'line') c.push(`${lwPt} w [] 0 d ${X(p.a.x)} ${Yp(p.a.y)} m ${X(p.b.x)} ${Yp(p.b.y)} l S`);
      else if (p.t === 'circle' || p.t === 'arc') {
        const a0 = p.t === 'circle' ? 0 : Math.atan2(p.from.y - p.c.y, p.from.x - p.c.x);
        let a1 = p.t === 'circle' ? Math.PI * 2 : Math.atan2(p.to.y - p.c.y, p.to.x - p.c.x);
        if (p.t === 'arc') { let dA = a1 - a0; while (dA > Math.PI) dA -= 2 * Math.PI; while (dA < -Math.PI) dA += 2 * Math.PI; a1 = a0 + dA; }
        const n = 24, pts = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push({ x: p.c.x + p.r * Math.cos(a), y: p.c.y + p.r * Math.sin(a) }); }
        c.push(`${lwPt} w ${p.t === 'arc' ? '[3 2] 0 d ' : ''}${X(pts[0].x)} ${Yp(pts[0].y)} m ` + pts.slice(1).map(q => `${X(q.x)} ${Yp(q.y)} l`).join(' ') + ' S [] 0 d');
      } else if (p.t === 'text') {
        const size = p.size * k, w = p.text.length * size * 0.55, rad = (p.angle || 0) * Math.PI / 180;
        const cos = Math.cos(-rad), sin = Math.sin(-rad);
        const dx = -w / 2, dy = p.dim ? 0 : -size * 0.35;
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

  const api = { formatFtIn, parseFtIn, snap, emptyModel, normalizeModel, addWall, addRectangle, wallFaceLength, setWallFaceLength, addOpening, moveOpening, removeWall, removeOpening, setWallLength, wallLength, wallById, computeDimensions, collisions, primitives, toSVG, toDXF, toPDF, bounds, samplePlan, outwardNormal, wallOutline, openingGeometry, PAPER };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DrawUpDrawCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
