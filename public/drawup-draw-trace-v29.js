/* DrawUp Draw Workspace 2.0 (v29): free wall tracer for clean floor plan pictures.
 *
 * No AI and no credits. It works on drawings where walls are drawn as solid dark bands (most
 * listing plans, CAD exports, scanned CDs with poche). It does not read text, furniture or
 * hand sketches; the DrawUp AI does that (and gets these traced walls as a head start).
 *   1. grey -> dark mask; the thickest common dark band is taken as the wall thickness
 *   2. an opening (erode + dilate) with a square a bit thinner than that removes thin lines
 *      (door swings, furniture, text, dimension lines), leaving the walls
 *   3. horizontal and vertical runs are swept into rectangles: each long thin rectangle is a wall
 *   4. a gap between two walls on the same line is an opening: a window when thin lines run
 *      across the gap, a door when the gap is clear (its swing is drawn off the wall)
 * Only walls that run north-south or east-west are found. Angled and curved walls are left for
 * the AI or for drawing by hand, and the report says so.
 * Output: an interpretation in image pixels (see drawup-draw-ws-geo-v29.js fromInterpretation).
 * Browser: window.DrawUpTrace.fromCanvas(canvas) / .trace({w, h, gray}); Node: module.exports.
 */
(function (root) {
  'use strict';
  function integral(mask, w, h) { const I = new Uint32Array((w + 1) * (h + 1)); for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += mask[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } } return I; }
  const boxSum = (I, w, x0, y0, x1, y1) => I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
  function erode(mask, w, h, k) { const I = integral(mask, w, h), out = new Uint8Array(w * h), r0 = k >> 1, r1 = k - r0; for (let y = r0; y < h - r1; y++) for (let x = r0; x < w - r1; x++) if (boxSum(I, w, x - r0, y - r0, x + r1, y + r1) === k * k) out[y * w + x] = 1; return out; }
  function dilate(mask, w, h, k) { const I = integral(mask, w, h), out = new Uint8Array(w * h), r0 = k >> 1, r1 = k - r0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - r1 + 1), y0 = Math.max(0, y - r1 + 1), x1 = Math.min(w, x + r0 + 1), y1 = Math.min(h, y + r0 + 1); if (boxSum(I, w, x0, y0, x1, y1) > 0) out[y * w + x] = 1; } return out; }

  /** The most common thickness of solid dark bands (min of horizontal / vertical run at each pixel). */
  function bandThickness(dark, w, h) {
    const hist = new Uint32Array(80), hr = new Uint16Array(w * h), vr = new Uint16Array(w * h);
    for (let y = 0; y < h; y++) { let x = 0; while (x < w) { if (!dark[y * w + x]) { x++; continue; } let e = x; while (e < w && dark[y * w + e]) e++; for (let i = x; i < e; i++) hr[y * w + i] = Math.min(65535, e - x); x = e; } }
    for (let x = 0; x < w; x++) { let y = 0; while (y < h) { if (!dark[y * w + x]) { y++; continue; } let e = y; while (e < h && dark[e * w + x]) e++; for (let i = y; i < e; i++) vr[i * w + x] = Math.min(65535, e - y); y = e; } }
    for (let i = 0; i < w * h; i++) if (dark[i]) { const a = hr[i], b = vr[i], t = Math.min(a, b), L = Math.max(a, b); if (t >= 3 && t < 80 && L >= 6 * t) hist[t]++; }
    // weight by thickness: thick wall bands are fewer pixels per unit length than they look
    const sm = t => hist[t] + (hist[t - 1] || 0) * 0.5 + (hist[t + 1] || 0) * 0.5;
    let best = 0, bi = 0; for (let t = 3; t < 80; t++) { const s = sm(t); if (s > best) { best = s; bi = t; } }
    // the thinnest band that is common too (partitions are often drawn thinner than exterior walls)
    let tmin = bi; for (let t = 4; t < bi; t++) if (sm(t) >= best * 0.2) { tmin = t; break; }
    return { t: bi, tmin, votes: best };
  }

  /** Sweep runs (rows when horiz) into rectangles {u0, u1, v0, v1} (u along the run). */
  function sweep(mask, w, h, horiz, minLen, tol) {
    const W = horiz ? w : h, H = horiz ? h : w, at = (u, v) => (horiz ? mask[v * w + u] : mask[u * w + v]);
    let open = [], done = [];
    for (let v = 0; v < H; v++) {
      const runs = []; let u = 0;
      while (u < W) { if (!at(u, v)) { u++; continue; } let e = u; while (e < W && at(e, v)) e++; if (e - u >= minLen) runs.push([u, e]); u = e; }
      const next = [];
      runs.forEach(([a, b]) => { const i = open.findIndex(r => Math.abs(r.u0 - a) <= tol && Math.abs(r.u1 - b) <= tol && r.v1 === v); if (i >= 0) { const r = open[i]; open.splice(i, 1); r.v1 = v + 1; r.u0 = Math.min(r.u0, a); r.u1 = Math.max(r.u1, b); next.push(r); } else next.push({ u0: a, u1: b, v0: v, v1: v + 1 }); });
      open.forEach(r => done.push(r)); open = next;
    }
    return done.concat(open);
  }

  function trace(img, opts) {
    opts = opts || {}; const w = img.w, h = img.h, g = img.gray, N = w * h;
    const thr = opts.threshold || 110, dark = new Uint8Array(N); let nd = 0;
    for (let i = 0; i < N; i++) if (g[i] < thr) { dark[i] = 1; nd++; }
    const report = { notes: [] };
    if (nd < N * 0.003) return { error: 'This picture has almost no dark lines. The free tracer reads drawn floor plans; try DrawUp AI for photos and sketches.' };
    if (nd > N * 0.45) return { error: 'This picture is mostly dark, so it does not look like a drawn floor plan. Try DrawUp AI.' };
    const band = bandThickness(dark, w, h);
    if (band.t < 3 || band.votes < 200) return { error: 'No solid wall lines were found. The free tracer needs walls drawn as solid dark bands; try DrawUp AI.' };
    const T = band.t, k = Math.max(2, Math.round(band.tmin * 0.6));
    const walls = dilate(erode(dark, w, h, k), w, h, k);
    const minLen = Math.max(3 * T, Math.round(Math.max(w, h) * 0.02)), tol = Math.max(2, Math.round(T * 0.35));
    const rects = [];
    sweep(walls, w, h, true, minLen, tol).forEach(r => { const t = r.v1 - r.v0, L = r.u1 - r.u0; if (t >= k && t <= T * 2.6 && L >= 2.2 * t) rects.push({ dir: 'h', x0: r.u0, x1: r.u1, y0: r.v0, y1: r.v1, t, c: (r.v0 + r.v1) / 2 }); });
    sweep(walls, w, h, false, minLen, tol).forEach(r => { const t = r.v1 - r.v0, L = r.u1 - r.u0; if (t >= k && t <= T * 2.6 && L >= 2.2 * t) rects.push({ dir: 'v', y0: r.u0, y1: r.u1, x0: r.v0, x1: r.v1, t, c: (r.v0 + r.v1) / 2 }); });
    if (rects.length < 3) return { error: 'Only ' + rects.length + ' wall lines were found. Try DrawUp AI for this picture.' };
    // collinear pieces with a gap -> one wall + an opening in the gap
    const segs = rects.map(r => r.dir === 'h' ? { dir: 'h', c: r.c, s0: r.x0, s1: r.x1, t: r.t } : { dir: 'v', c: r.c, s0: r.y0, s1: r.y1, t: r.t });
    const openings = [], out = [];
    ['h', 'v'].forEach(dir => {
      const list = segs.filter(s => s.dir === dir).sort((a, b) => a.c - b.c || a.s0 - b.s0);
      const lines = []; list.forEach(s => { const L = lines.find(l => { const lo = Math.min(l.c - l.t / 2, s.c - s.t / 2), hi = Math.max(l.c + l.t / 2, s.c + s.t / 2); return Math.abs(l.c - s.c) <= (l.t + s.t) / 2 + 1 && hi - lo <= T * 1.6; });
        if (L) { L.parts.push(s); const lo = Math.min(L.c - L.t / 2, s.c - s.t / 2), hi = Math.max(L.c + L.t / 2, s.c + s.t / 2); L.c = (lo + hi) / 2; L.t = hi - lo; } else lines.push({ c: s.c, t: s.t, parts: [s] }); });
      lines.forEach(L => {
        L.parts.sort((a, b) => a.s0 - b.s0); const merged = [];
        L.parts.forEach(p => { const last = merged[merged.length - 1]; if (last && p.s0 <= last.s1 + 1) last.s1 = Math.max(last.s1, p.s1); else merged.push({ s0: p.s0, s1: p.s1, t: p.t }); });
        // a gap is an opening if it is door- or window-sized compared with the wall thickness
        const runs = [{ s0: merged[0].s0, s1: merged[0].s1, ops: [] }];
        for (let i = 1; i < merged.length; i++) {
          const gap = merged[i].s0 - runs[runs.length - 1].s1, cur = runs[runs.length - 1];
          if (gap >= 2.2 * T && gap <= Math.max(w, h) * 0.16) {
            const g0 = cur.s1, g1 = merged[i].s0, kind = gapKind(g, w, h, dir, L.c, L.t, g0, g1);
            cur.ops.push({ kind, s0: g0, s1: g1 }); cur.s1 = merged[i].s1;
          } else if (gap < 2.2 * T) cur.s1 = merged[i].s1; else runs.push({ s0: merged[i].s0, s1: merged[i].s1, ops: [] });
        }
        runs.forEach(r => {
          if (r.s1 - r.s0 < minLen) return;
          const id = 'tw' + out.length, P = s => (dir === 'h' ? { x: s, y: L.c } : { x: L.c, y: s });
          out.push({ id, a: P(r.s0), b: P(r.s1), thickness_px: L.t, kind: 'interior', confidence: 0.9 });
          r.ops.forEach(o => openings.push({ wall_id: id, kind: o.kind, at: P((o.s0 + o.s1) / 2), width_px: o.s1 - o.s0, confidence: 0.75 }));
        });
      });
    });
    // exterior = the walls on the outer edge of the drawing's wall extent, and thicker walls
    const xs = out.flatMap(o => [o.a.x, o.b.x]), ys = out.flatMap(o => [o.a.y, o.b.y]), X0 = Math.min(...xs), X1 = Math.max(...xs), Y0 = Math.min(...ys), Y1 = Math.max(...ys), tMax = Math.max(...out.map(o => o.thickness_px));
    out.forEach(o => { const horiz = o.a.y === o.b.y, c = horiz ? o.a.y : o.a.x, lo = horiz ? Y0 : X0, hi = horiz ? Y1 : X1, edge = Math.min(c - lo, hi - c) <= T * 1.5; if (edge || o.thickness_px >= tMax * 0.85 && o.thickness_px > T * 1.25) o.kind = 'exterior'; });
    // an outline wall with no other walls beyond it on that side is exterior even when set back (jogs)
    out.filter(o => o.kind !== 'exterior').forEach(o => {
      const horiz = o.a.y === o.b.y, c = horiz ? o.a.y : o.a.x, s0 = horiz ? Math.min(o.a.x, o.b.x) : Math.min(o.a.y, o.b.y), s1 = horiz ? Math.max(o.a.x, o.b.x) : Math.max(o.a.y, o.b.y);
      const beyond = sgn => out.some(p => p !== o && (p.a.y === p.b.y) === horiz && (horiz ? p.a.y : p.a.x) * sgn > c * sgn + T && Math.min(horiz ? Math.max(p.a.x, p.b.x) : Math.max(p.a.y, p.b.y), s1) - Math.max(horiz ? Math.min(p.a.x, p.b.x) : Math.min(p.a.y, p.b.y), s0) > (s1 - s0) * 0.3);
      if ((!beyond(1) || !beyond(-1)) && o.thickness_px >= T * 0.95) o.kind = 'exterior';
    });
    const ext = out.filter(o => o.kind === 'exterior').length;
    report.notes.push(`Traced ${out.length} walls (${ext} on the outside) and ${openings.length} openings. Wall lines are ${band.tmin === T ? T : band.tmin + ' to ' + T}px thick.`);
    report.notes.push('The free tracer finds straight walls that run across or up the sheet. Curved and angled walls, furniture and room names are not read: add them, or run DrawUp AI.');
    const doorish = openings.filter(o => o.kind === 'door');
    return { by: 'tracer', source_kind: 'floor_plan', frame: 'image_px', image: { w, h }, walls: out, openings, rooms: [], components: [], unknowns: [], assumptions: [], wall_px: T, doors: doorish.length, report };
  }
  /** Thin lines running along the wall inside the gap = glazing; otherwise a door or passage. */
  function gapKind(g, w, h, dir, c, t, g0, g1) {
    const dark = { length: 0 }; void dark; const isInk = i => g[i] < 215; // window glazing is often drawn in a light grey
    let hits = 0, n = 0, lines = 0; const half = Math.max(1, Math.round(t / 2));
    for (let o = -half; o <= half; o++) {
      let rowHits = 0, rowN = 0;
      for (let s = Math.round(g0 + 2); s < g1 - 2; s++) { const x = dir === 'h' ? s : Math.round(c + o), y = dir === 'h' ? Math.round(c + o) : s; if (x < 0 || y < 0 || x >= w || y >= h) continue; rowN++; if (isInk(y * w + x)) rowHits++; }
      n += rowN; hits += rowHits; if (rowN && rowHits / rowN > 0.6) lines++;
    }
    return lines >= 2 && hits / Math.max(1, n) > 0.08 ? 'window' : 'door'; // glazing is drawn as two or more lines; a door may have one threshold line
  }
  /** Reads a canvas (or image drawn into one), scaled so the long side is at most maxSide px. */
  function fromCanvas(cv, maxSide) {
    maxSide = maxSide || 1600; const s = Math.min(1, maxSide / Math.max(cv.width, cv.height)), w = Math.round(cv.width * s), h = Math.round(cv.height * s);
    const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; const g2 = c2.getContext('2d', { willReadFrequently: true }); g2.fillStyle = '#fff'; g2.fillRect(0, 0, w, h); g2.drawImage(cv, 0, 0, w, h);
    const d = g2.getImageData(0, 0, w, h).data, gray = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0;
    const r = trace({ w, h, gray }); if (r && !r.error) r.px_scale = 1 / s; // traced px -> original px
    return r;
  }
  const api = { trace, fromCanvas, bandThickness };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DrawUpTrace = api;
})(typeof window !== 'undefined' ? window : globalThis);
