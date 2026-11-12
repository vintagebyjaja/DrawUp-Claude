/* DrawUp Draw Studio (v31): import a drawing file into the shared Draw model.
 *
 *  - DXF (any version AutoCAD, Revit or SketchUp writes as text): LINE, LWPOLYLINE / POLYLINE
 *    (bulges become arcs), ARC, CIRCLE, ELLIPSE, SPLINE (control polygon), TEXT, MTEXT, INSERT
 *    (blocks are exploded with their position, scale and rotation, nested up to 8 deep) and
 *    DIMENSION (the measured value, used to check the scale). Units from $INSUNITS.
 *  - PDF vector linework is read in the browser by drawup-draw-studio-v31.js with pdf.js and
 *    handed to the same wall finder as plain segments (see fromSegments).
 *
 * The wall finder is deterministic (no AI): two parallel lines a wall's thickness apart become
 * one wall; a gap between two collinear walls becomes a door (a swing arc at the gap), a window
 * (glazing lines across the gap) or an opening. Everything it is not sure about is written down
 * as an assumption, and lines that are not walls are kept as editable linework.
 * Units: inches. Plan y runs down the sheet (DXF y runs up, so it is flipped).
 * Browser: window.DrawUpImport. Node: module.exports.
 */
(function (root) {
  'use strict';
  const NODE = typeof module === 'object' && module.exports;
  const core = () => (NODE ? require('./drawup-draw-core-v18.js') : root.DrawUpDrawCore);
  const EPS = 1e-9;
  const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y }), add = (p, q) => ({ x: p.x + q.x, y: p.y + q.y }), mul = (p, k) => ({ x: p.x * k, y: p.y * k });
  const len = p => Math.hypot(p.x, p.y), dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y), dot = (p, q) => p.x * q.x + p.y * q.y, cross = (p, q) => p.x * q.y - p.y * q.x;
  const unit = p => { const l = len(p) || 1; return { x: p.x / l, y: p.y / l }; };
  const r8 = v => Math.round(v * 8) / 8;

  /* ============================================================ units */
  // $INSUNITS → inches per drawing unit
  const INSUNITS = { 0: null, 1: 1, 2: 12, 3: 63360, 4: 1 / 25.4, 5: 1 / 2.54, 6: 1 / 0.0254, 7: 39370.0787, 8: 1e-6, 9: 0.001, 10: 36, 14: 1 / 0.254, 15: 393.700787 };
  const UNIT_NAMES = { 1: 'inches', 2: 'feet', 4: 'millimetres', 5: 'centimetres', 6: 'metres', 10: 'yards', 14: 'decimetres' };
  const UNIT_CHOICES = [['in', 'Inches', 1], ['ft', 'Feet', 12], ['mm', 'Millimetres', 1 / 25.4], ['cm', 'Centimetres', 1 / 2.54], ['m', 'Metres', 1 / 0.0254]];

  /* ============================================================ DXF reader */
  function pairs(text) {
    const L = String(text).replace(/\r\n?/g, '\n').split('\n'), out = [];
    for (let i = 0; i + 1 < L.length; i += 2) { const c = parseInt(L[i].trim(), 10); if (isNaN(c)) { i -= 1; continue; } out.push([c, L[i + 1].replace(/\s+$/, '')]); }
    return out;
  }
  function isBinaryDXF(buf) { const head = typeof buf === 'string' ? buf.slice(0, 22) : String.fromCharCode.apply(null, Array.from(buf.slice(0, 22))); return head.startsWith('AutoCAD Binary DXF'); }
  function cleanMText(s) { return String(s || '').replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;\\{}]*;/g, '').replace(/\\[~LlOoKk]/g, '').replace(/[{}]/g, '').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/\s+/g, ' ').trim(); }

  /** Splits the pair stream into entity records: [{type, g: Map code -> [values]}]. */
  function records(P, i0, stop) {
    const out = []; let cur = null, i = i0;
    for (; i < P.length; i++) {
      const [c, v] = P[i];
      if (c === 0) {
        if (cur) out.push(cur);
        if (stop(v)) { cur = null; break; }
        cur = { type: v.trim().toUpperCase(), list: [] };
      } else if (cur) cur.list.push([c, v]);
    }
    if (cur) out.push(cur);
    return { recs: out, end: i };
  }
  const g1 = (r, c, d) => { const x = r.list.find(p => p[0] === c); return x ? x[1] : d; };
  const gn = (r, c, d) => { const v = parseFloat(g1(r, c, NaN)); return isNaN(v) ? d : v; };

  function parseDXF(text) {
    if (isBinaryDXF(text)) throw new Error('This is a binary DXF. Save it from your CAD program as an ASCII (text) DXF and try again.');
    const P = pairs(text); if (P.length < 4) throw new Error('This file does not look like a DXF drawing.');
    const out = { header: {}, layers: {}, blocks: {}, ents: [], version: '' };
    let i = 0;
    while (i < P.length) {
      if (P[i][0] === 0 && P[i][1] === 'SECTION' && P[i + 1] && P[i + 1][0] === 2) {
        const name = P[i + 1][1].trim().toUpperCase(); i += 2;
        if (name === 'HEADER') {
          let key = null;
          for (; i < P.length && !(P[i][0] === 0 && P[i][1] === 'ENDSEC'); i++) { const [c, v] = P[i]; if (c === 9) { key = v.trim(); out.header[key] = []; } else if (key) out.header[key].push([c, v]); }
        } else if (name === 'TABLES') {
          const { recs, end } = records(P, i, v => v === 'ENDSEC'); i = end;
          recs.filter(r => r.type === 'LAYER').forEach(r => { const n = g1(r, 2, ''); if (n) out.layers[n] = { name: n, color: gn(r, 62, 7), off: gn(r, 62, 7) < 0, frozen: (gn(r, 70, 0) & 1) === 1 }; });
        } else if (name === 'BLOCKS') {
          const { recs, end } = records(P, i, v => v === 'ENDSEC'); i = end; let blk = null;
          recs.forEach(r => {
            if (r.type === 'BLOCK') { blk = { name: g1(r, 2, ''), base: { x: gn(r, 10, 0), y: gn(r, 20, 0) }, ents: [] }; out.blocks[blk.name] = blk; }
            else if (r.type === 'ENDBLK') blk = null;
            else if (blk) blk.ents.push(r);
          });
        } else if (name === 'ENTITIES') {
          const { recs, end } = records(P, i, v => v === 'ENDSEC'); i = end; out.ents = recs;
        } else { while (i < P.length && !(P[i][0] === 0 && P[i][1] === 'ENDSEC')) i++; }
      }
      i++;
    }
    const iu = out.header.$INSUNITS ? parseInt((out.header.$INSUNITS.find(p => p[0] === 70) || [0, '0'])[1], 10) : 0;
    const ms = out.header.$MEASUREMENT ? parseInt((out.header.$MEASUREMENT.find(p => p[0] === 70) || [0, '0'])[1], 10) : null;
    out.version = out.header.$ACADVER ? (out.header.$ACADVER.find(p => p[0] === 1) || [0, ''])[1] : '';
    out.insunits = iu; out.measurement = ms;
    out.unitScale = INSUNITS[iu] || null;
    out.unitName = UNIT_NAMES[iu] || (iu ? 'code ' + iu : 'not set');
    return out;
  }

  /** Flattens entities (blocks exploded) into geometry in drawing units, DXF y up. */
  function geometryOf(dxf, opts) {
    opts = opts || {};
    const segs = [], arcs = [], texts = [], dims = [], warnings = [], counts = {};
    const MAXN = opts.max || 60000;
    let n = 0;
    const T = (m, p) => ({ x: m[0] * p.x + m[1] * p.y + m[2], y: m[3] * p.x + m[4] * p.y + m[5] });
    const compose = (A, B) => [A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2], A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5]];
    const scaleOf = m => Math.sqrt(Math.abs(m[0] * m[4] - m[1] * m[3])) || 1;
    const rotOf = m => Math.atan2(m[3], m[0]);
    const mirrored = m => m[0] * m[4] - m[1] * m[3] < 0;
    const layerOK = l => { const L = dxf.layers[l]; return !(L && (L.off || L.frozen)); };
    const seg = (a, b, layer) => { if (n++ > MAXN) return; if (dist(a, b) > EPS) segs.push({ a, b, layer }); };
    function arcPts(c, r, a0, a1, M) { // degrees, ccw from a0 to a1
      let s = a0, e = a1; while (e <= s) e += 360; const sweep = e - s, k = Math.max(2, Math.ceil(sweep / 10)), pts = [];
      for (let j = 0; j <= k; j++) { const t = (s + sweep * j / k) * Math.PI / 180; pts.push(T(M, { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) })); }
      return pts;
    }
    function bulgeArc(p, q, b, M, layer) {
      const d = dist(p, q); if (d < EPS) return;
      const th = 4 * Math.atan(b), u = unit(sub(q, p)), nrm = { x: -u.y, y: u.x }, mid = mul(add(p, q), 0.5);
      const cc = add(mid, mul(nrm, d / (2 * Math.tan(th / 2)))), r = dist(cc, p);
      let a0 = Math.atan2(p.y - cc.y, p.x - cc.x) * 180 / Math.PI, a1 = Math.atan2(q.y - cc.y, q.x - cc.x) * 180 / Math.PI;
      if (b < 0) { const t = a0; a0 = a1; a1 = t; }
      const pts = arcPts(cc, r, a0, a1, M); for (let j = 1; j < pts.length; j++) seg(pts[j - 1], pts[j], layer);
      arcs.push({ c: T(M, cc), r: r * scaleOf(M), layer });
    }
    function walk(list, M, depth, layerIn) {
      list.forEach(r => {
        let layer = g1(r, 8, '0'); if (layer === '0' && layerIn) layer = layerIn; // block entities on 0 take the insert's layer
        counts[r.type] = (counts[r.type] || 0) + 1;
        if (!layerOK(layer)) return;
        switch (r.type) {
          case 'LINE': seg(T(M, { x: gn(r, 10, 0), y: gn(r, 20, 0) }), T(M, { x: gn(r, 11, 0), y: gn(r, 21, 0) }), layer); break;
          case 'LWPOLYLINE': {
            const pts = []; let cur = null;
            r.list.forEach(([c, v]) => { if (c === 10) { cur = { x: +v, y: 0, b: 0 }; pts.push(cur); } else if (c === 20 && cur) cur.y = +v; else if (c === 42 && cur) cur.b = +v; });
            const closed = (gn(r, 70, 0) & 1) === 1;
            for (let j = 0; j < pts.length - (closed ? 0 : 1); j++) { const p = pts[j], q = pts[(j + 1) % pts.length]; if (Math.abs(p.b) > 1e-6) bulgeArc(p, q, p.b, M, layer); else seg(T(M, p), T(M, q), layer); }
            break;
          }
          case 'ARC': { const c = { x: gn(r, 10, 0), y: gn(r, 20, 0) }, rr = gn(r, 40, 0); let a0 = gn(r, 50, 0), a1 = gn(r, 51, 360); if (mirrored(M)) { const t = a0; a0 = 180 - a1; a1 = 180 - t; } const pts = arcPts(c, rr, a0, a1, M); for (let j = 1; j < pts.length; j++) seg(pts[j - 1], pts[j], layer); arcs.push({ c: T(M, c), r: rr * scaleOf(M), layer, a0, a1 }); break; }
          case 'CIRCLE': { const c = { x: gn(r, 10, 0), y: gn(r, 20, 0) }, rr = gn(r, 40, 0), pts = arcPts(c, rr, 0, 360, M); for (let j = 1; j < pts.length; j++) seg(pts[j - 1], pts[j], layer); break; }
          case 'ELLIPSE': {
            const c = { x: gn(r, 10, 0), y: gn(r, 20, 0) }, mj = { x: gn(r, 11, 1), y: gn(r, 21, 0) }, ratio = gn(r, 40, 1), t0 = gn(r, 41, 0), t1 = gn(r, 42, Math.PI * 2);
            const mn = { x: -mj.y * ratio, y: mj.x * ratio }; let e = t1; while (e <= t0) e += Math.PI * 2; const k = Math.max(8, Math.ceil((e - t0) / 0.15)); let prev = null;
            for (let j = 0; j <= k; j++) { const t = t0 + (e - t0) * j / k, p = T(M, add(c, add(mul(mj, Math.cos(t)), mul(mn, Math.sin(t))))); if (prev) seg(prev, p, layer); prev = p; }
            break;
          }
          case 'SPLINE': { const pts = []; let cur = null; r.list.forEach(([c, v]) => { if (c === 10) { cur = { x: +v, y: 0 }; pts.push(cur); } else if (c === 20 && cur) cur.y = +v; }); for (let j = 1; j < pts.length; j++) seg(T(M, pts[j - 1]), T(M, pts[j]), layer); if (pts.length) warnings.push('spline'); break; }
          case 'POLYLINE': break; // vertices follow as VERTEX records (handled below)
          case 'TEXT': case 'MTEXT': case 'ATTRIB': {
            const raw = r.type === 'MTEXT' ? r.list.filter(p => p[0] === 3 || p[0] === 1).map(p => p[1]).join('') : g1(r, 1, '');
            const t = cleanMText(raw); if (!t) break;
            texts.push({ at: T(M, { x: gn(r, 10, 0), y: gn(r, 20, 0) }), text: t, h: gn(r, 40, 0) * scaleOf(M), layer }); break;
          }
          case 'DIMENSION': {
            const v = gn(r, 42, NaN), p1 = { x: gn(r, 13, NaN), y: gn(r, 23, NaN) }, p2 = { x: gn(r, 14, NaN), y: gn(r, 24, NaN) };
            if (!isNaN(v) && !isNaN(p1.x) && !isNaN(p2.x)) dims.push({ value: v * scaleOf(M), a: T(M, p1), b: T(M, p2), text: g1(r, 1, ''), layer, type: gn(r, 70, 0) & 7 });
            break;
          }
          case 'INSERT': {
            const b = dxf.blocks[g1(r, 2, '')]; if (!b || depth > 8) break;
            const sx = gn(r, 41, 1), sy = gn(r, 42, 1), rot = gn(r, 50, 0) * Math.PI / 180, cs = Math.cos(rot), sn = Math.sin(rot), at = { x: gn(r, 10, 0), y: gn(r, 20, 0) };
            const L = [sx * cs, -sy * sn, at.x - (b.base.x * sx * cs - b.base.y * sy * sn), sx * sn, sy * cs, at.y - (b.base.x * sx * sn + b.base.y * sy * cs)];
            walk(b.ents, compose(M, L), depth + 1, layer); break;
          }
          default: break;
        }
      });
      // old-style POLYLINE + VERTEX + SEQEND
      for (let j = 0; j < list.length; j++) {
        if (list[j].type !== 'POLYLINE') continue;
        const r = list[j], layer = g1(r, 8, '0'), closed = (gn(r, 70, 0) & 1) === 1, pts = [];
        if ((gn(r, 70, 0) & (16 | 64)) !== 0) continue; // polygon / polyface meshes are 3D; skipped
        for (let k = j + 1; k < list.length && list[k].type === 'VERTEX'; k++) pts.push({ x: gn(list[k], 10, 0), y: gn(list[k], 20, 0), b: gn(list[k], 42, 0) });
        if (!layerOK(layer)) continue;
        for (let k = 0; k < pts.length - (closed ? 0 : 1); k++) { const p = pts[k], q = pts[(k + 1) % pts.length]; if (Math.abs(p.b) > 1e-6) bulgeArc(p, q, p.b, M, layer); else seg(T(M, p), T(M, q), layer); }
      }
    }
    walk(dxf.ents, [1, 0, 0, 0, 1, 0], 0, '');
    if (n > MAXN) warnings.push('too_many');
    ['3DFACE', '3DSOLID', 'MESH', 'POLYFACE', 'REGION', 'BODY'].forEach(t => { if (counts[t]) warnings.push('3d:' + t); });
    if (counts.HATCH) warnings.push('hatch:' + counts.HATCH);
    return { segs, arcs, texts, dims, warnings, counts };
  }

  /** Checks drawing units against the DIMENSION entities: their measured value / their measured length. */
  function dimScale(dims) {
    const r = dims.map(d => { const L = d.type === 0 || d.type === 1 ? (d.type === 0 ? Math.abs(d.b.x - d.a.x) || dist(d.a, d.b) : dist(d.a, d.b)) : dist(d.a, d.b); return L > EPS && d.value > EPS ? d.value / L : null; }).filter(Boolean);
    if (!r.length) return null; r.sort((a, b) => a - b); const med = r[Math.floor(r.length / 2)], agree = r.filter(x => Math.abs(x - med) / med < 0.02).length;
    return { ratio: med, agree, total: r.length };
  }

  /* ============================================================ wall finder */
  const WALL_LAYER = /(^|[^a-z])(a[-_ ]?)?wall|mur|wand|muro|partition|ptn|^0?[-_ ]?w$/i;
  const DOOR_LAYER = /door|porte|tür|puerta|a[-_ ]?door/i, GLAZ_LAYER = /glaz|window|wind|wndw|a[-_ ]?glaz|fenetre|fenster|ventana|glass/i;

  /** segs (inches, plan y down) → walls + openings. opts: { minT, maxT, minLen } */
  function findWalls(segsIn, arcsIn, opts) {
    opts = Object.assign({ minT: 2, maxT: 24, minLen: 12 }, opts || {});
    const notes = [];
    // prefer wall layers when the drawing has them
    const byLayer = {}; segsIn.forEach(s => { byLayer[s.layer] = (byLayer[s.layer] || 0) + 1; });
    const wallLayers = Object.keys(byLayer).filter(l => WALL_LAYER.test(l) && !DOOR_LAYER.test(l) && !GLAZ_LAYER.test(l) && byLayer[l] >= 4);
    let pool = wallLayers.length ? segsIn.filter(s => wallLayers.includes(s.layer)) : segsIn;
    if (wallLayers.length) notes.push(`Walls read from layer${wallLayers.length > 1 ? 's' : ''} ${wallLayers.join(', ')}.`);
    pool = pool.filter(s => dist(s.a, s.b) >= Math.min(opts.minLen, 6));
    // direction buckets (0..180 deg, 0.5 deg)
    const S = pool.map((s, i) => { const d = unit(sub(s.b, s.a)); let ang = Math.atan2(d.y, d.x) * 180 / Math.PI; if (ang < 0) ang += 180; if (ang >= 180 - 0.25) ang -= 180; const dir = { x: Math.cos(ang * Math.PI / 180), y: Math.sin(ang * Math.PI / 180) }, nrm = { x: -dir.y, y: dir.x }; const t0 = dot(s.a, dir), t1 = dot(s.b, dir); return { i, s, ang, dir, nrm, off: dot(s.a, nrm), t0: Math.min(t0, t1), t1: Math.max(t0, t1), cov: [] }; });
    const buckets = new Map(); S.forEach(x => { const k = Math.round(x.ang * 2); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(x); });
    const cands = [];
    buckets.forEach((list, k) => {
      const near = [].concat(list, buckets.get(k + 1) || [], k === 0 ? buckets.get(359) || [] : []);
      const L = list.slice().sort((a, b) => a.off - b.off), N = near.slice().sort((a, b) => a.off - b.off);
      L.forEach(a => {
        N.forEach(b => {
          if (b === a || b.i < a.i && list.includes(b)) return;
          if (Math.abs(cross(a.dir, b.dir)) > Math.sin(0.75 * Math.PI / 180)) return;
          const d = Math.abs(dot(sub(b.s.a, a.s.a), a.nrm)); if (d < opts.minT - 1e-6 || d > opts.maxT + 1e-6) return;
          const bt0 = Math.min(dot(b.s.a, a.dir), dot(b.s.b, a.dir)), bt1 = Math.max(dot(b.s.a, a.dir), dot(b.s.b, a.dir));
          const o0 = Math.max(a.t0, bt0), o1 = Math.min(a.t1, bt1); if (o1 - o0 < Math.max(6, Math.min(opts.minLen, d * 1.5))) return;
          cands.push({ a, b, d, o0, o1, side: Math.sign(dot(sub(b.s.a, a.s.a), a.nrm)) || 1 });
        });
      });
    });
    // thinnest pairs first: a face line pairs with its own wall's other face, not a wall across a corridor
    cands.sort((p, q) => p.d - q.d || (q.o1 - q.o0) - (p.o1 - p.o0));
    const free = (x, t0, t1) => { let used = 0; x.cov.forEach(([u0, u1]) => { used += Math.max(0, Math.min(t1, u1) - Math.max(t0, u0)); }); return 1 - used / Math.max(EPS, t1 - t0); };
    const pieces = [];
    cands.forEach(c => {
      if (free(c.a, c.o0, c.o1) < 0.5 || free(c.b, c.o0, c.o1) < 0.5) return;
      // a line in between the two faces means these are not the two faces of one wall
      c.a.cov.push([c.o0, c.o1]); c.b.cov.push([c.o0, c.o1]);
      const mid = c.a.off + c.side * c.d / 2;
      pieces.push({ dir: c.a.dir, nrm: c.a.nrm, off: mid, t0: c.o0, t1: c.o1, th: r8(c.d), layer: c.a.s.layer });
    });
    // merge collinear pieces of one wall
    const merged = [];
    pieces.sort((p, q) => p.off - q.off || p.t0 - q.t0).forEach(p => {
      const m = merged.find(x => Math.abs(cross(x.dir, p.dir)) < 0.01 && Math.abs(x.off - p.off * (dot(x.nrm, p.nrm) < 0 ? -1 : 1)) < 0.6 && Math.abs(x.th - p.th) < 0.6 && p.t0 <= x.t1 + 1 && p.t1 >= x.t0 - 1);
      if (m) { m.t0 = Math.min(m.t0, p.t0); m.t1 = Math.max(m.t1, p.t1); } else merged.push(Object.assign({}, p));
    });
    // a thin pair sitting inside a thicker wall's band is glazing or a sill, not a wall of its own
    for (let k = merged.length - 1; k >= 0; k--) {
      const p = merged[k];
      if (merged.some(q => q !== p && q.th > p.th + 0.6 && Math.abs(cross(q.dir, p.dir)) < 0.01 && Math.abs(q.off - p.off * (dot(q.nrm, p.nrm) < 0 ? -1 : 1)) + p.th / 2 <= q.th / 2 + 0.6)) merged.splice(k, 1);
    }
    // join collinear walls across a gap and find what the gap is
    const arcs = arcsIn || [];
    const glass = segsIn.filter(s => GLAZ_LAYER.test(s.layer) || !wallLayers.length || !wallLayers.includes(s.layer));
    const walls = [], openings = [];
    const groups = [];
    merged.forEach(p => { const gk = groups.find(g => Math.abs(cross(g[0].dir, p.dir)) < 0.01 && Math.abs(g[0].off - p.off * (dot(g[0].nrm, p.nrm) < 0 ? -1 : 1)) < 0.6 && Math.abs(g[0].th - p.th) < 1.1); if (gk) gk.push(p); else groups.push([p]); });
    groups.forEach(g => {
      g.sort((p, q) => p.t0 - q.t0);
      let run = Object.assign({}, g[0], { ops: [] });
      const flush = () => walls.push(run);
      for (let k = 1; k < g.length; k++) {
        const p = g[k], gap = p.t0 - run.t1;
        const kind = gap >= 18 && gap <= 144 ? classifyGap(run, p, gap, arcs, glass) : null;
        if (kind) { run.ops.push({ kind: kind.kind, t: run.t1 + gap / 2, width: r8(gap), swing: kind.swing, double: kind.double }); run.t1 = p.t1; }
        else if (gap < 18) run.t1 = Math.max(run.t1, p.t1); // a crossing wall or a small notch, not an opening
        else { flush(); run = Object.assign({}, p, { ops: [] }); }
      }
      flush();
    });
    // a door or window at the very end of a wall (between a wall end and a crossing wall) is not found; noted below
    const toPt = (w, t) => add(mul(w.dir, t), mul(w.nrm, w.off));
    let W = walls.map((w, k) => ({ id: 'w' + k, a: toPt(w, w.t0), b: toPt(w, w.t1), th: w.th, dir: w.dir, ops: w.ops, t0: w.t0, off: w.off, layer: w.layer }));
    // corners and tees: carry each end to where it meets another wall's centreline
    W.forEach(w => {
      ['a', 'b'].forEach(end => {
        const p = w[end], out = end === 'a' ? mul(w.dir, -1) : w.dir; let best = null;
        W.forEach(o => {
          if (o === w || Math.abs(cross(o.dir, w.dir)) < 0.2) return;
          const den = cross(out, o.dir); if (Math.abs(den) < EPS) return;
          const s = cross(sub(o.a, p), o.dir) / den; // along `out` from p
          if (s < -(o.th / 2 + 1) || s > o.th / 2 + w.th + 3) return;
          const q = add(p, mul(out, s)), u = dot(sub(q, o.a), o.dir), L = dist(o.a, o.b);
          if (u < -(w.th / 2 + 3) || u > L + w.th / 2 + 3) return;
          if (!best || Math.abs(s) < Math.abs(best.s)) best = { s, q, o, u, L };
        });
        if (best) {
          w[end] = best.q; if (end === 'a') w.ops.forEach(op => { op.shift = (op.shift || 0) + best.s; });
          // the other wall stretches to the corner too, when this end lands just past its end
          if (best.u < 0) best.o.a = add(best.o.a, mul(best.o.dir, best.u)); else if (best.u > best.L) best.o.b = add(best.o.b, mul(best.o.dir, best.u - best.L));
        }
      });
    });
    W = W.filter(w => dist(w.a, w.b) >= Math.max(6, w.th));
    W.forEach(w => w.ops.forEach(op => { op.at = add(mul(w.dir, op.t), mul({ x: -w.dir.y, y: w.dir.x }, w.off)); }));
    if (!W.length) notes.push('No parallel line pairs at wall spacing were found.');
    return { walls: W, notes, wallLayers };
  }
  function classifyGap(run, p, gap, arcs, glass) {
    const j1 = add(mul(run.dir, run.t1), mul(run.nrm, run.off)), j2 = add(mul(run.dir, p.t0), mul(run.nrm, run.off)), mid = mul(add(j1, j2), 0.5);
    const swing = arcs.filter(a => { const r = a.r, near = Math.min(dist(a.c, j1), dist(a.c, j2)); return near <= run.th + 3 && (Math.abs(r - gap) / gap < 0.22 || Math.abs(r - gap / 2) / gap < 0.12); });
    if (swing.length) { const dbl = swing.some(a => Math.abs(a.r - gap / 2) / gap < 0.12); const at1 = swing.some(a => dist(a.c, j1) < dist(a.c, j2)); return { kind: 'door', swing: at1 ? 'left' : 'right', double: dbl }; }
    // glazing: lines parallel to the wall, inside the wall band, across most of the gap
    const band = run.th / 2 + 0.5;
    const across = glass.filter(s => { const d = unit(sub(s.b, s.a)); if (Math.abs(cross(d, run.dir)) > 0.05) return false; const o1 = dot(s.a, run.nrm) - run.off, o2 = dot(s.b, run.nrm) - run.off; if (Math.abs(o1) > band || Math.abs(o2) > band) return false; const u0 = Math.min(dot(s.a, run.dir), dot(s.b, run.dir)), u1 = Math.max(dot(s.a, run.dir), dot(s.b, run.dir)); return Math.min(u1, p.t0) - Math.max(u0, run.t1) > gap * 0.6; });
    if (across.length) return { kind: 'window' };
    void mid; return gap <= 72 ? { kind: 'cased' } : null;
  }

  /* ============================================================ to a Draw model */
  /** geometry (drawing units, DXF y up) → { model, report }. opts: { unit (inches per drawing unit), wallHeight, floorHeight, name, keepLines, flipY } */
  function toModel(geo, opts) {
    const D = core(); opts = opts || {};
    const k = opts.unit > 0 ? opts.unit : 1, flip = opts.flipY !== false;
    const P = p => ({ x: p.x * k, y: (flip ? -p.y : p.y) * k });
    let segs = geo.segs.map(s => ({ a: P(s.a), b: P(s.b), layer: s.layer }));
    const arcs = (geo.arcs || []).map(a => ({ c: P(a.c), r: a.r * k, layer: a.layer }));
    const texts = (geo.texts || []).map(t => ({ at: P(t.at), text: t.text, h: t.h * k, layer: t.layer }));
    let F = findWalls(segs, arcs, { minT: opts.minT || 2, maxT: opts.maxT || 24 });
    // shift to a tidy origin: the walls' corner 2'-0" in from the sheet edge (all linework if there are no walls)
    let x0 = Infinity, y0 = Infinity; const take = p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); };
    if (F.walls.length) F.walls.forEach(w => { take(w.a); take(w.b); }); else segs.forEach(s => { take(s.a); take(s.b); });
    if (!isFinite(x0)) { x0 = 0; y0 = 0; }
    x0 -= 24; y0 -= 24;
    const sh = p => ({ x: r8(p.x - x0), y: r8(p.y - y0) });
    segs = segs.map(s => ({ a: sh(s.a), b: sh(s.b), layer: s.layer })); arcs.forEach(a => { a.c = sh(a.c); }); texts.forEach(t => { t.at = sh(t.at); });
    F = findWalls(segs, arcs, { minT: opts.minT || 2, maxT: opts.maxT || 24 });
    const m = D.emptyModel(); const report = { walls: 0, doors: 0, windows: 0, openings: 0, rooms: 0, lines: 0, skipped: [], notes: F.notes.slice(), assumptions: [], unknowns: [] };
    const H = opts.wallHeight > 0 ? opts.wallHeight : 108;
    // exterior: a ray from the middle of the wall, out of one face, meets no other wall
    const hits = (p, d, self) => F.walls.some(o => { if (o === self) return false; const e = sub(o.b, o.a), den = cross(d, e); if (Math.abs(den) < EPS) return false; const r = sub(o.a, p), s = cross(r, e) / den, t = cross(r, d) / den; return s > 1 && t >= -0.02 && t <= 1.02; });
    const idMap = {};
    F.walls.forEach(w => {
      const mid = mul(add(w.a, w.b), 0.5), n = { x: -w.dir.y, y: w.dir.x }, ext = !hits(mid, n, w) || !hits(mid, mul(n, -1), w);
      try { const nw = D.addWall(m, w.a, w.b, { thickness: w.th, type: ext ? 'exterior' : 'interior', height: ext ? H : Math.min(H, opts.partitionHeight > 0 ? opts.partitionHeight : H) }); idMap[w.id] = nw.id; report.walls++; } catch (_e) { report.skipped.push('wall'); }
    });
    F.walls.forEach(w => {
      const id = idMap[w.id]; if (!id) return; const nw = D.wallById(m, id), L = D.wallLength(nw);
      const nd = unit(sub(nw.b, nw.a));
      w.ops.forEach(op => {
        const off = dot(sub(op.at, nw.a), nd); if (off - op.width / 2 < -0.5 || off + op.width / 2 > L + 0.5) { report.skipped.push(op.kind); return; }
        try {
          const o = D.addOpening(m, id, op.kind, Math.max(op.width / 2, Math.min(L - op.width / 2, off)), op.width, { swing: op.swing || 'left', head: op.kind === 'window' ? 84 : 80, sill: op.kind === 'window' ? 36 : undefined });
          if (op.double) o.leaves = 2; if (op.kind === 'door') report.doors++; else if (op.kind === 'window') report.windows++; else report.openings++;
        } catch (_e) { report.skipped.push(op.kind); }
      });
    });
    // room names: text that sits inside the walls and reads like a name
    const isName = t => /[a-z]/i.test(t) && t.length >= 2 && t.length <= 32 && !/^\d+(\.\d+)?$/.test(t) && !/['"]|\d+\s*(mm|cm|m)\b|scale|sheet|date|drawn|checked|project|revision|north|^[A-Z]-?\d+$/i.test(t);
    const box = m.walls.length ? m.walls.reduce((b, w) => ({ x0: Math.min(b.x0, w.a.x, w.b.x), y0: Math.min(b.y0, w.a.y, w.b.y), x1: Math.max(b.x1, w.a.x, w.b.x), y1: Math.max(b.y1, w.a.y, w.b.y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }) : null;
    if (box) {
      const used = [];
      texts.filter(t => isName(t.text) && t.at.x > box.x0 && t.at.x < box.x1 && t.at.y > box.y0 && t.at.y < box.y1)
        .sort((p, q) => q.h - p.h)
        .forEach(t => { if (used.some(u => dist(u, t.at) < 48)) return; const ceil = opts.ceiling > 0 ? opts.ceiling : Math.min(H, 108); m.rooms.push({ id: 'r_' + Math.random().toString(36).slice(2, 9), name: t.text.toUpperCase().slice(0, 32), number: '', ceiling: ceil, at: { x: r8(t.at.x), y: r8(t.at.y) } }); used.push(t.at); report.rooms++; });
    }
    // everything that is not a wall face stays as editable linework, grouped by layer
    if (opts.keepLines !== false) {
      const wallSeg = s => m.walls.some(w => { const d = unit(sub(w.b, w.a)), n = { x: -d.y, y: d.x }; const o1 = Math.abs(dot(sub(s.a, w.a), n)), o2 = Math.abs(dot(sub(s.b, w.a), n)); if (o1 > w.thickness / 2 + 0.75 || o2 > w.thickness / 2 + 0.75) return false; const L = D.wallLength(w), u1 = dot(sub(s.a, w.a), d), u2 = dot(sub(s.b, w.a), d); return Math.min(u1, u2) >= -w.thickness - 1 && Math.max(u1, u2) <= L + w.thickness + 1; });
      // door and window symbols and dimension strings are redrawn by DrawUp from the model, so their linework is not kept
      const dropL = l => (report.doors && DOOR_LAYER.test(l)) || ((report.windows) && GLAZ_LAYER.test(l)) || /dim/i.test(l);
      const dropped = segs.filter(s => dropL(s.layer)).length; if (dropped) report.notes.push(`${dropped} lines of door, window and dimension symbols were left out: DrawUp draws those from the model.`);
      const rest = segs.filter(s => !wallSeg(s) && !dropL(s.layer));
      const cap = opts.maxLines || 6000; let kept = 0;
      // chain touching segments on one layer into polylines, so a curve stays one piece
      const byL = {}; rest.forEach(s => { (byL[s.layer] = byL[s.layer] || []).push(s); });
      Object.keys(byL).forEach(layer => {
        const L = byL[layer], usedS = new Set();
        L.forEach((s, i) => {
          if (usedS.has(i) || kept >= cap) return; usedS.add(i); const pts = [s.a, s.b];
          let grew = true; while (grew && pts.length < 400) { grew = false; for (let j = 0; j < L.length; j++) { if (usedS.has(j)) continue; const q = L[j], e = pts[pts.length - 1]; if (dist(q.a, e) < 0.05) { pts.push(q.b); usedS.add(j); grew = true; } else if (dist(q.b, e) < 0.05) { pts.push(q.a); usedS.add(j); grew = true; } } }
          try { const it = D.makeShape('polyline', pts, { weight: 'fine' }); if (it) { it.layer = layer; it.imported = true; m.items.push(it); kept++; report.lines++; } } catch (_e) { /* tiny piece */ }
        });
      });
      if (kept >= cap) report.notes.push(`Only the first ${cap} pieces of other linework were kept, to keep the drawing quick to edit.`);
    }
    // assumptions the member confirms
    report.assumptions.push({ id: 'im_units', kind: 'scale', status: opts.unitConfirmed ? 'confirmed' : 'assumed', text: opts.unitNote || 'Drawing units were assumed.' });
    report.assumptions.push({ id: 'im_height', kind: 'height', status: opts.heightConfirmed ? 'confirmed' : 'assumed', text: `Walls are ${D.formatFtIn(H)} tall${opts.heightConfirmed ? '' : ' (not in the file)'}.` });
    if (report.walls) report.assumptions.push({ id: 'im_ext', kind: 'layout', status: 'assumed', text: `${m.walls.filter(w => w.type === 'exterior').length} walls were taken as exterior because nothing lies outside them. Change a wall's type in its panel if that is wrong.` });
    if (report.doors + report.windows + report.openings) report.assumptions.push({ id: 'im_ops', kind: 'layout', status: 'assumed', text: 'Doors were found by their swing arcs and windows by glazing lines in the wall gap. Head heights (doors 6\'-8", windows 7\'-0" with a 3\'-0" sill) are typical values, not read from the file.' });
    if (!report.walls) report.unknowns.push({ id: 'im_nowalls', status: 'open', text: 'No walls could be recognised. The linework is kept so you can trace walls over it with the Wall tool.' });
    report.unknowns.push({ id: 'im_edge_ops', status: 'open', text: 'A door or window right at the end of a wall, against a crossing wall, is not found automatically. Add any that are missing with the Door and Window tools.' });
    m.ws = { v: 31, assumptions: report.assumptions.slice(), unknowns: report.unknowns.slice(), style: 'cd', finishes: {}, concepts: [], brand: {}, renders: [] };
    return { model: m, report };
  }

  /** Plain segments (inches, plan y down already, e.g. from a PDF page) straight to a model. */
  function fromSegments(segs, arcs, texts, opts) {
    return toModel({ segs, arcs: arcs || [], texts: texts || [] }, Object.assign({ unit: 1, flipY: false }, opts || {}));
  }

  /** Reads a DXF text and returns what the review screen shows before anything is created. */
  function inspectDXF(text) {
    const dxf = parseDXF(text), geo = geometryOf(dxf);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; geo.segs.forEach(s => { x0 = Math.min(x0, s.a.x, s.b.x); y0 = Math.min(y0, s.a.y, s.b.y); x1 = Math.max(x1, s.a.x, s.b.x); y1 = Math.max(y1, s.a.y, s.b.y); });
    const ds = dimScale(geo.dims);
    // unit guess: the header, else the dimension strings, else the size of the drawing
    let unit = dxf.unitScale, unitWhy = unit ? `from the file header ($INSUNITS = ${dxf.unitName})` : '', confirmed = !!unit;
    if (!unit && ds && ds.agree >= 2 && Math.abs(ds.ratio - 1) < 0.02) { unit = null; }
    const span = Math.max(x1 - x0, y1 - y0);
    if (!unit) {
      // a building is usually 15 ft to 1500 ft across
      const opts = UNIT_CHOICES.map(([k, l, f]) => ({ k, l, f, ft: span * f / 12 })).filter(o => o.ft >= 12 && o.ft <= 2000);
      const pick = opts.find(o => o.k === (dxf.measurement === 1 ? 'mm' : 'in')) || opts.find(o => o.k === 'mm') || opts[0];
      unit = pick ? pick.f : 1; unitWhy = pick ? `guessed from the drawing size (about ${Math.round(pick.ft)} ft across if the units are ${pick.l.toLowerCase()})` : 'not known';
    }
    const layers = {}; geo.segs.forEach(s => { layers[s.layer] = (layers[s.layer] || 0) + 1; });
    return { dxf, geo, bbox: isFinite(x0) ? { x0, y0, x1, y1 } : null, unit, unitWhy, unitConfirmed: confirmed, dims: ds, layers, version: dxf.version, counts: geo.counts, warnings: geo.warnings };
  }

  /* ============================================================ format detection */
  const FORMATS = {
    dxf: { name: 'DXF drawing', kind: 'cad', ok: true }, pdf: { name: 'PDF drawing', kind: 'sheet', ok: true },
    png: { name: 'PNG image', kind: 'image', ok: true }, jpg: { name: 'JPG image', kind: 'image', ok: true }, jpeg: { name: 'JPG image', kind: 'image', ok: true }, webp: { name: 'WebP image', kind: 'image', ok: true },
    svg: { name: 'SVG drawing', kind: 'vector', ok: true },
    ifc: { name: 'IFC model', kind: 'bim', ok: false }, fbx: { name: 'FBX model', kind: 'mesh', ok: false }, dae: { name: 'COLLADA (DAE) model', kind: 'mesh', ok: false },
    dwg: { name: 'DWG drawing', kind: 'cad', ok: false, why: 'DrawUp can\'t read DWG files. In AutoCAD or Revit choose Save As (or Export) → DXF, then import the DXF here.' },
    rvt: { name: 'Revit model', kind: 'bim', ok: false, why: 'DrawUp can\'t read Revit files. Export a DXF (plans) or an IFC (the model) from Revit and import that.' },
    skp: { name: 'SketchUp model', kind: 'mesh', ok: false, why: 'DrawUp can\'t read SketchUp files directly. In SketchUp choose File → Export → 3D Model → COLLADA (.dae), or export a 2D DXF.' },
  };
  function detect(name, head) {
    const ext = String(name || '').toLowerCase().split('.').pop();
    const h = head || '';
    if (/^%PDF-/.test(h)) return 'pdf';
    if (/^AC10\d\d/.test(h)) return 'dwg';
    if (/^ISO-10303-21/.test(h)) return 'ifc';
    if (/^Kaydara FBX Binary/.test(h) || /^; FBX/.test(h)) return 'fbx';
    if (/<COLLADA/i.test(h)) return 'dae';
    if (/^\s*0\s*[\r\n]+\s*SECTION/.test(h) || /^AutoCAD Binary DXF/.test(h)) return 'dxf';
    if (/^\x89PNG/.test(h)) return 'png';
    if (/^\xFF\xD8/.test(h)) return 'jpg';
    if (/^RIFF....WEBP/.test(h)) return 'webp';
    if (/<svg[\s>]/i.test(h)) return 'svg';
    return FORMATS[ext] ? ext : null;
  }

  const api = { parseDXF, geometryOf, inspectDXF, findWalls, toModel, fromSegments, dimScale, detect, FORMATS, UNIT_CHOICES, INSUNITS, cleanMText };
  if (NODE) module.exports = api; else root.DrawUpImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
