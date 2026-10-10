/* DrawUp Draw V22 — draw at any angle, shapes, details (plan + section) in a 3D hologram.
 *
 *  1. Plan editor (drawup-tools-v18.js + drawup-draw-v21.js): a Shapes tool (line, polyline,
 *     3-point arc, circle, rectangle, regular polygon, smooth curve) that draws at any angle on
 *     the floor plan AND on elevation / section camera views (stored on the camera). Angle snap
 *     15° / 45° / Off lives in drawup-draw-v21.js, the snapping math in drawup-tools-v18.js, and
 *     mitred angled walls in drawup-draw-core-v18.js.
 *  2. Detail drawing (#portal/draw?detail=…): a plan or section detail built from material
 *     regions with real hatches (concrete, CMU, brick, earth, gravel, wood blocking, batt and
 *     rigid insulation, gypsum, membranes …), shapes, leader notes and dimensions, on a sheet
 *     with a detail bubble, title and scale. Saved per member in draw_details (migration 0048).
 *  3. 3D hologram: the detail is extruded (plan) or swept (section) into a 3D model drawn in
 *     DrawUp's hologram style, with a cutaway step and an exploded view. Flip between
 *     Hologram, Model (shaded) and Realistic. Realistic runs the shaded model view through the
 *     existing Swap photoreal pipeline (/api/swap, swap_type photoreal), so it lands in a Swap
 *     thread with the same credit charge, refund and 2:00 shot clock.
 *  4. Send it on: "Ask Arch Coach" (one image: 2D detail + 3D view, plus a structured
 *     description, through the existing /api/arch-coach image path) and "Upload to 3D" (the 3D
 *     tab of the Detail Library and of the Playbook, through the hooks DrawUpDetailTabs and
 *     DrawUpPlaybookTabs).
 *
 * Needs drawup-draw-core-v18.js and drawup-draw-v21.js loaded first (it extends DrawUpDrawV21).
 * Honest limits: the 3D renderer is a small canvas renderer (painter's algorithm), not a CAD
 * kernel, so very concave shapes can overlap oddly at some angles; the realistic image is a
 * single frame from the angle you rendered.
 */
(function () {
  'use strict';
  if (window.DrawUpDraw22) return;
  const BUCKET = 'drawup-private';
  const D = () => window.DrawUpDrawCore;
  const $q = (w, s) => w.querySelector(s), $$ = (w, s) => [...w.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const uuid = () => (crypto.randomUUID && crypto.randomUUID()) || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); });
  const rid = p => (p || 'r') + '_' + Math.random().toString(36).slice(2, 9);
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_e) { /* private mode */ } } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clone = o => JSON.parse(JSON.stringify(o));
  const f3 = v => (+v).toFixed(3);
  function download(name, data, type) { const blob = data instanceof Blob ? data : new Blob([data], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
  function toast(c, m, bad) { if (c && c.toast) return c.toast(m, bad); let t = document.getElementById('du-toast'); if (!t) { t = document.createElement('div'); t.id = 'du-toast'; t.className = 'du-toast'; document.body.appendChild(t); } t.textContent = m; t.dataset.state = bad ? 'bad' : 'good'; t.classList.add('open'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('open'), bad ? 6000 : 2600); }
  const sb = () => window.drawupSupabaseClient;
  async function sessionUser() { const c = sb(); if (!c) return null; const s = (await c.auth.getSession()).data.session; return s && s.user && !s.user.is_anonymous ? s.user : null; }
  async function signedUrl(path) { if (!path) return null; const { data } = await sb().storage.from(BUCKET).createSignedUrl(path, 3600); return data && data.signedUrl; }
  const blobToDataUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  const canvasBlob = (cv, type, q) => new Promise(res => cv.toBlob(res, type || 'image/png', q));

  /* ============================================================ materials
   * pat: how the cut face is hatched on the sheet. c3: colour for the shaded / realistic model.
   * t: a typical thickness (inches) used by the layer-stack builder.                         */
  const MATS = {
    conc: { name: 'Concrete', pat: 'conc', c3: '#b8b4ab', t: 8 },
    cmu: { name: 'Concrete masonry unit', pat: 'cmu', c3: '#a8a49b', t: 7.625 },
    brick: { name: 'Brick veneer', pat: 'brick', c3: '#a3553b', t: 3.625 },
    stone: { name: 'Stone veneer', pat: 'stone', c3: '#cdc4b1', t: 4 },
    earth: { name: 'Compacted earth', pat: 'earth', c3: '#6d5841', t: 24 },
    gravel: { name: 'Gravel / crushed stone', pat: 'gravel', c3: '#9b968c', t: 4 },
    sand: { name: 'Sand', pat: 'sand', c3: '#d6c18e', t: 2 },
    wood: { name: 'Wood framing (cut)', pat: 'xbox', c3: '#d4ae75', t: 5.5 },
    woodf: { name: 'Wood (continuous)', pat: 'grain', c3: '#c69655', t: 0.75 },
    ply: { name: 'Plywood / OSB sheathing', pat: 'ply', c3: '#d8b27a', t: 0.5 },
    gyp: { name: 'Gypsum board', pat: 'gyp', c3: '#ebe8e1', t: 0.625 },
    batt: { name: 'Batt insulation', pat: 'batt', c3: '#f1c3bb', t: 5.5 },
    rigid: { name: 'Rigid insulation', pat: 'rigid', c3: '#9dcde6', t: 2 },
    spray: { name: 'Spray foam insulation', pat: 'spray', c3: '#eedf9f', t: 3 },
    steel: { name: 'Steel', pat: 'solid', c3: '#5c6570', t: 0.5 },
    alum: { name: 'Aluminum', pat: 'alum', c3: '#c3cad1', t: 0.25 },
    membrane: { name: 'Air / water barrier membrane', pat: 'solidk', c3: '#2b3037', t: 0.125 },
    vapor: { name: 'Vapor retarder', pat: 'solidk', c3: '#3a4049', t: 0.0625 },
    flashing: { name: 'Sheet metal flashing', pat: 'solidk', c3: '#8c959d', t: 0.0625 },
    glass: { name: 'Glass', pat: 'glass', c3: '#a8d7ea', t: 1 },
    sealant: { name: 'Sealant + backer rod', pat: 'solidg', c3: '#3b3e43', t: 0.5 },
    finish: { name: 'Finish (tile / wood floor)', pat: 'finish', c3: '#c7bead', t: 0.75 },
    air: { name: 'Air space', pat: 'none', c3: '#ffffff', t: 1 },
  };
  const matOf = k => MATS[k] || MATS.conc;
  const SCALES = [[4, '3" = 1\'-0"'], [6, '2" = 1\'-0"'], [8, '1 1/2" = 1\'-0"'], [12, '1" = 1\'-0"'], [16, '3/4" = 1\'-0"'], [24, '1/2" = 1\'-0"']];
  const scaleText = s => (SCALES.find(x => x[0] === s) || [0, '1:' + s])[1];
  const GRIDS = [[0.125, '1/8"'], [0.25, '1/4"'], [0.5, '1/2"'], [1, '1"'], [3, '3"']];

  /* ============================================================ geometry */
  const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y }), add = (p, q) => ({ x: p.x + q.x, y: p.y + q.y }), mul = (p, k) => ({ x: p.x * k, y: p.y * k });
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  function area(P) { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p.x * q.y - q.x * p.y; } return a / 2; }
  function centroid(P) { const A = area(P); if (Math.abs(A) < 1e-9) { const s = P.reduce((s, p) => add(s, p), { x: 0, y: 0 }); return mul(s, 1 / (P.length || 1)); } let cx = 0, cy = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], k = p.x * q.y - q.x * p.y; cx += (p.x + q.x) * k; cy += (p.y + q.y) * k; } return { x: cx / (6 * A), y: cy / (6 * A) }; }
  function inside(p, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }
  /** Oriented box along the longest edge: origin, unit axes u (long) / v, extents. */
  function obb(P) {
    let best = null; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], L = dist(a, b); if (!best || L > best.L) best = { L, u: L > 1e-9 ? mul(sub(b, a), 1 / L) : { x: 1, y: 0 } }; }
    const u = best ? best.u : { x: 1, y: 0 }, v = { x: -u.y, y: u.x };
    const su = P.map(p => p.x * u.x + p.y * u.y), sv = P.map(p => p.x * v.x + p.y * v.y);
    const u0 = Math.min(...su), u1 = Math.max(...su), v0 = Math.min(...sv), v1 = Math.max(...sv);
    return { u, v, u0, u1, v0, v1, lu: u1 - u0, lv: v1 - v0, at: (s, t) => add(mul(u, s), mul(v, t)) };
  }
  function bbox(pts) { const xs = pts.map(p => p.x), ys = pts.map(p => p.y); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; }
  /** 0.625 → 5/8"  5.5 → 5 1/2"  30 → 2'-6" */
  function inch(v) {
    if (v >= 12) return D().formatFtIn(v);
    const den = 16, n = Math.round(v * den), w = Math.floor(n / den), r = n - w * den; if (!r) return w + '"';
    const g = (a, b) => b ? g(b, a % b) : a, k = g(r, den); return (w ? w + ' ' : '') + (r / k) + '/' + (den / k) + '"';
  }
  function regionThickness(r) { const b = obb(r.pts); return Math.min(b.lu, b.lv); }
  function regionLabel(r) { if (r.label) return r.label; const t = regionThickness(r), m = matOf(r.mat); return (['earth', 'gravel', 'sand', 'air'].includes(r.mat) || t > 40 ? '' : inch(t) + ' ') + m.name.toUpperCase(); }
  function rotPts(P, c, deg) { const a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a); return P.map(p => { const v = sub(p, c); return { x: c.x + v.x * cs - v.y * sn, y: c.y + v.x * sn + v.y * cs }; }); }
  const rectPts = (x0, y0, x1, y1) => [{ x: Math.min(x0, x1), y: Math.min(y0, y1) }, { x: Math.max(x0, x1), y: Math.min(y0, y1) }, { x: Math.max(x0, x1), y: Math.max(y0, y1) }, { x: Math.min(x0, x1), y: Math.max(y0, y1) }];

  function emptyDetail() { return { regions: [], items: [], notes: [] }; }
  function normDetail(m) {
    m = m && typeof m === 'object' ? clone(m) : emptyDetail();
    m.regions = (Array.isArray(m.regions) ? m.regions : []).filter(r => r && Array.isArray(r.pts) && r.pts.length >= 3).map(r => ({ id: r.id || rid('rg'), mat: MATS[r.mat] ? r.mat : 'conc', pts: r.pts.map(p => ({ x: +p.x, y: +p.y })), ...(r.depth > 0 ? { depth: +r.depth } : {}), ...(r.label ? { label: String(r.label).slice(0, 80) } : {}) }));
    m.items = D().normalizeModel({ items: Array.isArray(m.items) ? m.items : [] }).items;
    m.notes = (Array.isArray(m.notes) ? m.notes : []).filter(n => n && n.at && n.tip).map(n => ({ id: n.id || rid('n'), at: { x: +n.at.x, y: +n.at.y }, tip: { x: +n.tip.x, y: +n.tip.y }, text: String(n.text || 'NOTE').slice(0, 160) }));
    return m;
  }
  function detailPts(m) { const pts = []; m.regions.forEach(r => r.pts.forEach(p => pts.push(p))); m.notes.forEach(n => pts.push(n.at, n.tip)); m.items.forEach(it => { if (it.kind === 'shape') D().shapeLines(it).forEach(l => l.forEach(p => pts.push(p))); else if (it.kind === 'dim') pts.push(it.a, it.b); else if (it.at) pts.push(it.at); }); return pts; }

  /* ============================================================ sheet (2D detail drawing)
   * Real construction-document conventions: heavy cut lines, light hatches, filled membranes,
   * leader notes with arrowheads, dimension strings, a detail bubble, title and scale.     */
  const INK = '#101418';
  function patterns(id, S) {
    const P = v => f3(v * S), lw = v => f3(v * S), L = (x1, y1, x2, y2, w) => `<line x1="${f3(x1)}" y1="${f3(y1)}" x2="${f3(x2)}" y2="${f3(y2)}" stroke="${INK}" stroke-width="${lw(w || 0.0045)}"/>`;
    const lines = (name, sp, rot, w, extra) => `<pattern id="${id}-${name}" patternUnits="userSpaceOnUse" width="${P(sp)}" height="${P(sp)}" patternTransform="rotate(${rot})">${L(0, 0, sp * S, 0, w)}${extra || ''}</pattern>`;
    const t = 0.3 * S, tri = (x, y, s) => `<path d="M${f3(x)} ${f3(y)} l${f3(s)} ${f3(-s * 1.4)} l${f3(s)} ${f3(s * 1.4)} z" fill="none" stroke="${INK}" stroke-width="${lw(0.004)}"/>`, dot = (x, y, r) => `<circle cx="${f3(x)}" cy="${f3(y)}" r="${f3(r)}" fill="${INK}"/>`;
    const out = [
      `<pattern id="${id}-conc" patternUnits="userSpaceOnUse" width="${f3(t)}" height="${f3(t)}">${tri(0.04 * S, 0.1 * S, 0.018 * S)}${tri(0.19 * S, 0.24 * S, 0.014 * S)}${tri(0.2 * S, 0.06 * S, 0.012 * S)}${dot(0.12 * S, 0.05 * S, 0.006 * S)}${dot(0.09 * S, 0.2 * S, 0.006 * S)}${dot(0.25 * S, 0.15 * S, 0.005 * S)}${dot(0.03 * S, 0.27 * S, 0.005 * S)}${dot(0.15 * S, 0.13 * S, 0.004 * S)}</pattern>`,
      lines('cmu', 0.07, 45, 0.005), lines('brick', 0.036, 45, 0.0045), lines('ply', 0.045, -45, 0.004), lines('alum', 0.03, 45, 0.004), lines('stone', 0.09, 30, 0.004, L(0, 0.045 * S, 0.045 * S, 0.045 * S, 0.004)),
      `<pattern id="${id}-rigid" patternUnits="userSpaceOnUse" width="${P(0.05)}" height="${P(0.05)}" patternTransform="rotate(45)">${L(0, 0, 0.05 * S, 0)}${L(0, 0, 0, 0.05 * S)}</pattern>`,
      `<pattern id="${id}-earth" patternUnits="userSpaceOnUse" width="${P(0.14)}" height="${P(0.14)}" patternTransform="rotate(45)">${L(0, 0, 0.14 * S, 0, 0.005)}${L(0, 0.022 * S, 0.14 * S, 0.022 * S, 0.005)}${L(0, 0.044 * S, 0.14 * S, 0.044 * S, 0.005)}</pattern>`,
      `<pattern id="${id}-gravel" patternUnits="userSpaceOnUse" width="${P(0.16)}" height="${P(0.16)}">${[[0.03, 0.04, 0.018, 0.012], [0.1, 0.03, 0.014, 0.01], [0.13, 0.11, 0.02, 0.013], [0.05, 0.12, 0.013, 0.01], [0.085, 0.075, 0.01, 0.008]].map(([x, y, rx, ry]) => `<ellipse cx="${f3(x * S)}" cy="${f3(y * S)}" rx="${f3(rx * S)}" ry="${f3(ry * S)}" fill="none" stroke="${INK}" stroke-width="${lw(0.004)}"/>`).join('')}</pattern>`,
      `<pattern id="${id}-sand" patternUnits="userSpaceOnUse" width="${P(0.12)}" height="${P(0.12)}">${[[0.01, 0.02], [0.05, 0.01], [0.09, 0.04], [0.03, 0.07], [0.07, 0.08], [0.11, 0.1], [0.02, 0.11], [0.06, 0.045]].map(([x, y]) => dot(x * S, y * S, 0.0045 * S)).join('')}</pattern>`,
      `<pattern id="${id}-gyp" patternUnits="userSpaceOnUse" width="${P(0.03)}" height="${P(0.03)}">${dot(0.008 * S, 0.008 * S, 0.0035 * S)}${dot(0.023 * S, 0.022 * S, 0.0035 * S)}</pattern>`,
      `<pattern id="${id}-spray" patternUnits="userSpaceOnUse" width="${P(0.08)}" height="${P(0.08)}">${[[0.02, 0.02, 0.012], [0.06, 0.035, 0.01], [0.03, 0.065, 0.009]].map(([x, y, r]) => `<circle cx="${f3(x * S)}" cy="${f3(y * S)}" r="${f3(r * S)}" fill="none" stroke="${INK}" stroke-width="${lw(0.004)}"/>`).join('')}</pattern>`,
      `<pattern id="${id}-grain" patternUnits="userSpaceOnUse" width="${P(0.4)}" height="${P(0.06)}"><path d="M0 ${f3(0.03 * S)} Q${f3(0.1 * S)} 0 ${f3(0.2 * S)} ${f3(0.03 * S)} T${f3(0.4 * S)} ${f3(0.03 * S)}" fill="none" stroke="${INK}" stroke-width="${lw(0.0035)}"/></pattern>`,
      `<pattern id="${id}-finish" patternUnits="userSpaceOnUse" width="${P(0.06)}" height="${P(0.06)}">${L(0, 0, 0, 0.06 * S, 0.004)}</pattern>`,
    ];
    return '<defs>' + out.join('') + '</defs>';
  }
  /** Batt insulation symbol: a looping (prolate cycloid) line along the long side of the region. */
  function battPath(r) {
    const b = obb(r.pts), t = b.lv, P = Math.max(t * 0.55, 0.5), N = Math.max(2, Math.round(b.lu / P)), pts = [];
    const per = 18; for (let i = 0; i <= N * per; i++) { const th = i / per * Math.PI * 2, s = b.u0 + (th / (2 * Math.PI)) * (b.lu / N) - 0.3 * t * Math.sin(th), tt = b.v0 + t / 2 - 0.42 * t * Math.cos(th); pts.push(b.at(Math.max(b.u0, Math.min(b.u1, s)), tt)); }
    return 'M' + pts.map(p => f3(p.x) + ' ' + f3(p.y)).join(' L');
  }
  function xboxPath(r) { const b = obb(r.pts), c = [b.at(b.u0, b.v0), b.at(b.u1, b.v0), b.at(b.u1, b.v1), b.at(b.u0, b.v1)]; return `M${f3(c[0].x)} ${f3(c[0].y)} L${f3(c[2].x)} ${f3(c[2].y)} M${f3(c[1].x)} ${f3(c[1].y)} L${f3(c[3].x)} ${f3(c[3].y)}`; }
  const ptsAttr = P => P.map(p => f3(p.x) + ',' + f3(p.y)).join(' ');

  /** opts: {name, number, sheetNo, kind, sel:{type,id}, scale, title:false} → {svg, bounds} */
  function sheetSVG(model, opts) {
    opts = opts || {}; const S = opts.scale || 8, C = D(), m = normDetail(model), id = 'pd' + Math.random().toString(36).slice(2, 7), lw = v => f3(v * S);
    const parts = [];
    m.regions.forEach(r => {
      const M = matOf(r.mat), selc = opts.sel && opts.sel.type === 'region' && opts.sel.id === r.id;
      const fill = M.pat === 'solid' ? '#2d3238' : M.pat === 'solidk' ? INK : M.pat === 'solidg' ? '#6a6f75' : M.pat === 'glass' ? '#e6f5fb' : '#ffffff';
      const thin = regionThickness(r) * 1 / S < 0.03; // thinner than 1/32" on paper: draw it as a heavy filled line
      parts.push(`<g class="dd22-reg" data-region="${r.id}" data-mat="${r.mat}"><polygon points="${ptsAttr(r.pts)}" fill="${fill}" stroke="none"/>`);
      if (['conc', 'cmu', 'brick', 'ply', 'alum', 'stone', 'rigid', 'earth', 'gravel', 'sand', 'gyp', 'spray', 'grain', 'finish'].includes(M.pat)) parts.push(`<polygon points="${ptsAttr(r.pts)}" fill="url(#${id}-${M.pat})" stroke="none"/>`);
      if (M.pat === 'batt') parts.push(`<path d="${battPath(r)}" fill="none" stroke="${INK}" stroke-width="${lw(0.005)}" stroke-linejoin="round"/>`);
      if (M.pat === 'xbox') parts.push(`<path d="${xboxPath(r)}" fill="none" stroke="${INK}" stroke-width="${lw(0.006)}"/>`);
      const edge = r.mat === 'earth' ? 0 : r.mat === 'air' ? 0.004 : thin ? 0.006 : 0.014;
      if (edge) parts.push(`<polygon points="${ptsAttr(r.pts)}" fill="none" stroke="${INK}" stroke-width="${lw(edge)}" stroke-linejoin="miter"${r.mat === 'air' ? ` stroke-dasharray="${lw(0.04)} ${lw(0.03)}"` : ''}/>`);
      if (selc) parts.push(`<polygon points="${ptsAttr(r.pts)}" fill="rgba(27,140,255,.16)" stroke="#1b8cff" stroke-width="${lw(0.016)}"/>`);
      parts.push(`<polygon class="dd22-hit" points="${ptsAttr(r.pts)}" fill="rgba(0,0,0,0)" stroke="rgba(0,0,0,0)" stroke-width="${lw(0.06)}"/></g>`);
    });
    // earth: a broken ground line along its top edge reads better than an outline
    m.regions.filter(r => r.mat === 'earth').forEach(r => { const b = bbox(r.pts); parts.push(`<line x1="${f3(b.x0)}" y1="${f3(b.y0)}" x2="${f3(b.x1)}" y2="${f3(b.y0)}" stroke="${INK}" stroke-width="${lw(0.012)}"/>`); });
    // shapes, dimensions, text (the Draw core primitives, so they match the plan exports)
    const prims = m.items.length ? C.primitives({ walls: [], openings: [], rooms: [], items: m.items }, S) : [];
    const LAY = C.LAYERS || {};
    prims.forEach(p => {
      const sel = opts.sel && opts.sel.type === 'item' && opts.sel.id === p.item, col = sel ? '#1b8cff' : INK, w = lw((LAY[p.layer] || { lw: 0.008 }).lw * (sel ? 1.6 : 1)), da = p.dash ? ` stroke-dasharray="${lw(0.05)} ${lw(0.035)}"` : '';
      if (p.t === 'line') parts.push(`<line data-item="${p.item || ''}" x1="${f3(p.a.x)}" y1="${f3(p.a.y)}" x2="${f3(p.b.x)}" y2="${f3(p.b.y)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"${da}/>`);
      else if (p.t === 'circle') parts.push(`<circle data-item="${p.item || ''}" cx="${f3(p.c.x)}" cy="${f3(p.c.y)}" r="${f3(p.r)}" fill="${p.fill ? col : 'none'}" stroke="${p.fill ? 'none' : col}" stroke-width="${w}"${da}/>`);
      else if (p.t === 'text') parts.push(`<text data-item="${p.item || ''}" x="${f3(p.at.x)}" y="${f3(p.at.y)}" font-size="${f3(p.size)}" font-family="Helvetica, Arial, sans-serif" fill="${col}" text-anchor="middle" dominant-baseline="${p.dim ? 'auto' : 'middle'}"${p.angle ? ` transform="rotate(${p.angle} ${f3(p.at.x)} ${f3(p.at.y)})"` : ''}>${esc(p.text)}</text>`);
    });
    m.items.forEach(it => { const hit = it.kind === 'shape' ? C.shapeLines(it) : [C.itemOutline(it, S).concat([C.itemOutline(it, S)[0]])]; hit.forEach(l => parts.push(`<polyline class="dd22-hit" data-item="${it.id}" points="${ptsAttr(l)}" fill="${it.kind === 'shape' ? 'none' : 'rgba(0,0,0,0)'}" stroke="rgba(0,0,0,0)" stroke-width="${lw(0.08)}"/>`)); });
    // leader notes
    const ts = C.PAPER.text * S, noteBoxes = [];
    m.notes.forEach(n => {
      const sel = opts.sel && opts.sel.type === 'note' && opts.sel.id === n.id, col = sel ? '#1b8cff' : INK, right = n.at.x >= n.tip.x, elbow = { x: n.at.x + (right ? -0.12 : 0.12) * S, y: n.at.y };
      const d = sub(n.tip, elbow), L = Math.hypot(d.x, d.y) || 1, u = mul(d, 1 / L), ah = 0.07 * S, aw = 0.022 * S, base = sub(n.tip, mul(u, ah)), nn = { x: -u.y, y: u.x };
      const lines = wrap(n.text.toUpperCase(), 34), lh = ts * 1.35, y0 = n.at.y - (lines.length - 1) * lh / 2;
      parts.push(`<g class="dd22-note" data-note="${n.id}"><polyline points="${ptsAttr([n.tip, elbow, n.at])}" fill="none" stroke="${col}" stroke-width="${lw(0.007)}"/><polygon points="${ptsAttr([n.tip, add(base, mul(nn, aw)), sub(base, mul(nn, aw))])}" fill="${col}"/>`
        + lines.map((s, i) => `<text x="${f3(n.at.x + (right ? 0.04 : -0.04) * S)}" y="${f3(y0 + i * lh)}" font-size="${f3(ts)}" font-family="Helvetica, Arial, sans-serif" fill="${col}" text-anchor="${right ? 'start' : 'end'}" dominant-baseline="middle">${esc(s)}</text>`).join('')
        + `<polyline class="dd22-hit" points="${ptsAttr([n.tip, elbow, n.at])}" fill="none" stroke="rgba(0,0,0,0)" stroke-width="${lw(0.08)}"/></g>`);
      const w = Math.max(...lines.map(s => s.length)) * ts * 0.62; noteBoxes.push({ x0: right ? n.at.x : n.at.x - w - 0.04 * S, x1: right ? n.at.x + w + 0.04 * S : n.at.x, y0: y0 - lh, y1: y0 + lines.length * lh });
    });
    // extents
    const pts = detailPts(m); noteBoxes.forEach(b => pts.push({ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 }));
    prims.forEach(p => { if (p.t === 'text') pts.push(add(p.at, { x: -p.text.length * p.size * 0.32, y: -p.size }), add(p.at, { x: p.text.length * p.size * 0.32, y: p.size })); });
    let b = pts.length ? bbox(pts) : { x0: 0, y0: 0, x1: 4 * S, y1: 3 * S };
    const pad = 0.35 * S; b = { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad };
    if (b.x1 - b.x0 < 3.2 * S) { const cx = (b.x0 + b.x1) / 2; b.x0 = cx - 1.6 * S; b.x1 = cx + 1.6 * S; }
    // title: detail bubble, name, scale
    if (opts.title !== false) {
      const ty = b.y1 + 0.32 * S, r = 0.2 * S, cx = b.x0 + r + 0.05 * S;
      parts.push(`<g class="dd22-title"><circle cx="${f3(cx)}" cy="${f3(ty)}" r="${f3(r)}" fill="#fff" stroke="${INK}" stroke-width="${lw(0.012)}"/><line x1="${f3(cx - r)}" y1="${f3(ty)}" x2="${f3(cx + r)}" y2="${f3(ty)}" stroke="${INK}" stroke-width="${lw(0.008)}"/>`
        + `<text x="${f3(cx)}" y="${f3(ty - r * 0.45)}" font-size="${f3(ts * 1.25)}" font-family="Helvetica, Arial, sans-serif" font-weight="700" fill="${INK}" text-anchor="middle" dominant-baseline="middle">${esc(opts.number || '1')}</text>`
        + `<text x="${f3(cx)}" y="${f3(ty + r * 0.48)}" font-size="${f3(ts * 1.0)}" font-family="Helvetica, Arial, sans-serif" fill="${INK}" text-anchor="middle" dominant-baseline="middle">${esc(opts.sheetNo || 'D-1')}</text>`
        + `<text x="${f3(cx + r + 0.12 * S)}" y="${f3(ty - ts * 0.35)}" font-size="${f3(ts * 1.55)}" font-family="Helvetica, Arial, sans-serif" font-weight="700" fill="${INK}">${esc(String(opts.name || 'DETAIL').toUpperCase())}</text>`
        + `<line x1="${f3(cx + r + 0.12 * S)}" y1="${f3(ty + ts * 0.15)}" x2="${f3(b.x1 - 0.05 * S)}" y2="${f3(ty + ts * 0.15)}" stroke="${INK}" stroke-width="${lw(0.012)}"/>`
        + `<text x="${f3(cx + r + 0.12 * S)}" y="${f3(ty + ts * 1.25)}" font-size="${f3(ts * 0.95)}" font-family="Helvetica, Arial, sans-serif" fill="${INK}">${esc((opts.kind === 'plan' ? 'PLAN DETAIL' : 'SECTION DETAIL') + '   SCALE: ' + scaleText(S))}</text></g>`);
      b.y1 = ty + r + 0.25 * S;
    }
    const W = b.x1 - b.x0, H = b.y1 - b.y0;
    const size = opts.paperSize ? ` width="${f3(W / S)}in" height="${f3(H / S)}in"` : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="dd22-sheet" viewBox="${f3(b.x0)} ${f3(b.y0)} ${f3(W)} ${f3(H)}"${size} data-scale="${S}">${patterns(id, S)}<rect x="${f3(b.x0)}" y="${f3(b.y0)}" width="${f3(W)}" height="${f3(H)}" fill="#fff"/>${parts.join('')}</svg>`;
    return { svg, bounds: b };
  }
  function wrap(s, n) { const words = String(s).split(/\s+/), out = []; let cur = ''; words.forEach(w => { if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }); if (cur) out.push(cur); return out.length ? out : ['']; }
  async function svgToCanvas(svgText, W, H, bg) {
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    try { const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not draw the detail.')); i.src = url; });
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.fillStyle = bg || '#fff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H); return cv; }
    finally { URL.revokeObjectURL(url); }
  }
  async function sheetCanvas(model, opts, maxW) {
    const r = sheetSVG(model, Object.assign({}, opts, { paperSize: false })), b = r.bounds, ar = (b.y1 - b.y0) / (b.x1 - b.x0);
    const W = Math.round(maxW || 1400), H = Math.round(W * ar);
    return svgToCanvas(r.svg.replace('<svg ', `<svg width="${W}" height="${H}" `), W, H);
  }

  /* ============================================================ 3D: detail → prisms
   * Section detail: the sheet is the cut plane (x right, sheet y down = height down); every
   * region is swept back from the cut by `length`. Plan detail: the sheet is the plan cut
   * (sheet y down = toward the viewer); every region is extruded up by `height`.
   * cutaway: layers step back across the detail so each one shows. explode: layers pull apart. */
  const HATCH3D = { conc: [[Math.PI / 4, 1.6]], cmu: [[Math.PI / 4, 0.9]], brick: [[Math.PI / 4, 0.55]], stone: [[Math.PI / 6, 1.2]], earth: [[Math.PI / 4, 0.7], [Math.PI / 4, 0.7, 0.25]], gravel: [[0, 1.2], [Math.PI / 2, 1.2]], sand: [[Math.PI / 3, 0.8]], ply: [[-Math.PI / 4, 0.5]], rigid: [[Math.PI / 4, 0.7], [-Math.PI / 4, 0.7]], gyp: [[Math.PI / 4, 0.35]], spray: [[Math.PI / 3, 0.7], [-Math.PI / 3, 0.7]], alum: [[Math.PI / 4, 0.4]], finish: [[Math.PI / 2, 0.6]], grain: [[0, 0.6]] };
  function build3D(model, kind, st) {
    st = Object.assign({ length: 24, height: 36, cutaway: true, explode: 0 }, st || {});
    const m = normDetail(model), regs = m.regions.filter(r => r.mat !== 'air');
    if (!regs.length) return { prisms: [], R: 24, kind };
    const all = regs.flatMap(r => r.pts), b = bbox(all), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, D0 = kind === 'plan' ? +st.height || 36 : +st.length || 24;
    const key = r => { const c = centroid(r.pts); return kind === 'plan' ? c.y : c.x; };
    const order = regs.slice().sort((p, q) => key(p) - key(q)), n = order.length, span = kind === 'plan' ? (b.y1 - b.y0) || 1 : (b.x1 - b.x0) || 1, k0 = kind === 'plan' ? b.y0 : b.x0;
    const prisms = order.map((r, rank) => {
      let depth = r.depth > 0 ? +r.depth : D0;
      if (st.cutaway) depth *= 1 - 0.55 * Math.max(0, Math.min(1, (key(r) - k0) / span));
      const shift = (rank - (n - 1) / 2) * (+st.explode || 0) * Math.max(3, D0 / 6);
      const ccw = area(r.pts) > 0;
      const map = kind === 'plan'
        ? (p, h) => [p.x - cx, h - D0 / 2 + shift, p.y - cy]
        : (p, h) => [p.x - cx + shift, -(p.y - cy), D0 / 2 - h];
      const nmap = kind === 'plan' ? (x, y) => [x, 0, y] : (x, y) => [x, -y, 0];
      const cut = r.pts.map(p => map(p, kind === 'plan' ? depth : 0)), back = r.pts.map(p => map(p, kind === 'plan' ? 0 : depth));
      const sides = r.pts.map((p, i) => { const q = r.pts[(i + 1) % r.pts.length], dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1; const nx = (ccw ? dy : -dy) / L, ny = (ccw ? -dx : dx) / L; return { pts: [cut[i], cut[(i + 1) % cut.length], back[(i + 1) % back.length], back[i]], n: nmap(nx, ny) }; });
      return { id: r.id, mat: r.mat, label: regionLabel(r), pts2: r.pts, map: p => map(p, kind === 'plan' ? depth : 0), cut, back, sides, nCut: kind === 'plan' ? [0, 1, 0] : [0, 0, 1], nBack: kind === 'plan' ? [0, -1, 0] : [0, 0, -1] };
    });
    let R = 1; prisms.forEach(P => P.cut.concat(P.back).forEach(v => { R = Math.max(R, Math.hypot(v[0], v[1], v[2])); }));
    const floor = Math.min(...prisms.flatMap(P => P.cut.concat(P.back).map(v => v[1])));
    return { prisms, R, kind, floor, D0 };
  }
  const hex2rgb = h => { h = String(h).replace('#', ''); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

  /* ============================================================ 3D: canvas renderer */
  function Holo(canvas, opts) {
    opts = opts || {};
    const self = { canvas, mode: opts.mode || 'holo', cam: Object.assign({ yaw: -0.62, pitch: 0.42, zoom: 1 }, opts.cam || {}), labels: opts.labels !== false, spin: false, scene: null, onChange: null, legend: [] };
    const g = canvas.getContext('2d');
    self.setScene = sc => { self.scene = sc; self.render(); };
    function size() { const dpr = Math.min(2, window.devicePixelRatio || 1), w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height; if (opts.fixed) return { w: canvas.width, h: canvas.height, dpr: 1 }; if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); } return { w: canvas.width, h: canvas.height, dpr }; }
    self.render = () => draw(g, size(), self);
    // pointer: drag to orbit, pinch / wheel to zoom, double-click to reset
    if (!opts.fixed) {
      const pts = new Map(); let pinch0 = 0, zoom0 = 1;
      canvas.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { canvas.setPointerCapture(e.pointerId); } catch (_e) { /* */ } if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = self.cam.zoom; } e.preventDefault(); });
      canvas.addEventListener('pointermove', e => {
        const p = pts.get(e.pointerId); if (!p) return;
        if (pts.size === 2) { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) self.cam.zoom = Math.max(0.35, Math.min(2.6, zoom0 * d / pinch0)); }
        else { self.cam.yaw += (e.clientX - p.x) * 0.008; self.cam.pitch = Math.max(-0.25, Math.min(1.45, self.cam.pitch + (e.clientY - p.y) * 0.006)); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); }
        self.render(); self.onChange && self.onChange();
      });
      const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', e => { e.preventDefault(); self.cam.zoom = Math.max(0.35, Math.min(2.6, self.cam.zoom * Math.exp(-e.deltaY * 0.0012))); self.render(); }, { passive: false });
      canvas.addEventListener('dblclick', () => { self.cam = { yaw: -0.62, pitch: 0.42, zoom: 1 }; self.render(); });
      canvas.addEventListener('keydown', e => { const k = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }[e.key]; if (k) { e.preventDefault(); self.cam.yaw += k[0]; self.cam.pitch = Math.max(-0.25, Math.min(1.45, self.cam.pitch + k[1])); self.render(); } if (e.key === '+' || e.key === '=') { self.cam.zoom = Math.min(2.6, self.cam.zoom * 1.15); self.render(); } if (e.key === '-') { self.cam.zoom = Math.max(0.35, self.cam.zoom / 1.15); self.render(); } });
      if (window.ResizeObserver) new ResizeObserver(() => self.render()).observe(canvas);
    }
    let raf = 0;
    self.setSpin = on => { self.spin = on; cancelAnimationFrame(raf); if (on) { const t = () => { self.cam.yaw += 0.006; self.render(); raf = requestAnimationFrame(t); }; raf = requestAnimationFrame(t); } };
    self.destroy = () => cancelAnimationFrame(raf);
    return self;
  }
  function draw(g, sz, H) {
    const { w: W, h: Hh } = sz, sc = H.scene, holo = H.mode !== 'model', cam = H.cam;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.shadowBlur = 0;
    // background
    if (holo) { const bg = g.createRadialGradient(W * 0.5, Hh * 0.45, 10, W * 0.5, Hh * 0.5, Math.max(W, Hh) * 0.75); bg.addColorStop(0, '#0b2a44'); bg.addColorStop(0.55, '#061526'); bg.addColorStop(1, '#02070e'); g.fillStyle = bg; }
    else { const bg = g.createLinearGradient(0, 0, 0, Hh); bg.addColorStop(0, '#f4f7fa'); bg.addColorStop(1, '#d9e1e8'); g.fillStyle = bg; }
    g.fillRect(0, 0, W, Hh); H.legend = [];
    if (!sc || !sc.prisms.length) { g.fillStyle = holo ? '#7fe7ff' : '#33475b'; g.font = `600 ${Math.round(14 * (sz.dpr || 1))}px "IBM Plex Sans", system-ui, sans-serif`; g.textAlign = 'center'; g.fillText('Draw a material layer to see it in 3D', W / 2, Hh / 2); return; }
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const dist = sc.R * 3.1 / cam.zoom, f = Math.min(W, Hh) * 1.25, ox = W / 2, oy = Hh / 2 + Hh * 0.04;
    const rot = v => { const x = v[0] * cy + v[2] * sy, z = -v[0] * sy + v[2] * cy, y = v[1]; return [x, y * cp - z * sp, y * sp + z * cp]; };
    const proj = c => { const d = Math.max(1e-3, dist - c[2]); return { x: ox + c[0] * f / d, y: oy - c[1] * f / d, d }; };
    const P3 = v => proj(rot(v));
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const LIGHT = (() => { const l = [-0.45, 0.75, 0.55], n = Math.hypot(...l); return l.map(x => x / n); })();
    const k = sz.dpr || 1;
    // floor grid (hologram) or soft shadow (model)
    if (holo) {
      const step = Math.max(2, sc.R / 5), N = 7, y = sc.floor - 0.5;
      g.lineWidth = 1 * k;
      for (let i = -N; i <= N; i++) {
        const a = P3([i * step, y, -N * step]), b = P3([i * step, y, N * step]), c = P3([-N * step, y, i * step]), d = P3([N * step, y, i * step]), al = 0.16 * (1 - Math.abs(i) / (N + 1));
        g.strokeStyle = `rgba(127,231,255,${al.toFixed(3)})`; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.moveTo(c.x, c.y); g.lineTo(d.x, d.y); g.stroke();
      }
    } else {
      const c = P3([0, sc.floor - 0.5, 0]), rx = sc.R * f / dist * 1.1; const sh = g.createRadialGradient(c.x, c.y, 2, c.x, c.y, rx); sh.addColorStop(0, 'rgba(20,35,50,.28)'); sh.addColorStop(1, 'rgba(20,35,50,0)'); g.fillStyle = sh; g.beginPath(); g.ellipse(c.x, c.y, rx, rx * 0.35, 0, 0, Math.PI * 2); g.fill();
    }
    const camPos = [0, 0, dist];
    const items = sc.prisms.map(P => { const all = P.cut.concat(P.back).map(rot), c = all.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]).map(x => x / all.length); return { P, z: c[2] }; }).sort((a, b) => a.z - b.z);
    g.lineJoin = 'round';
    if (holo) g.globalCompositeOperation = 'lighter';
    items.forEach(({ P }) => {
      const M = matOf(P.mat), rgb = hex2rgb(M.c3);
      const faces = [{ pts: P.cut, n: P.nCut, cut: true }, { pts: P.back, n: P.nBack }].concat(P.sides);
      faces.forEach(F => {
        const cpts = F.pts.map(rot), nc = rot(F.n), ctr = cpts.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]).map(x => x / cpts.length);
        const toCam = [camPos[0] - ctr[0], camPos[1] - ctr[1], camPos[2] - ctr[2]]; if (dot(nc, toCam) <= 0) return;
        const pp = cpts.map(proj), lam = Math.max(0, dot(nc, LIGHT));
        g.beginPath(); pp.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath();
        if (holo) {
          const tint = [Math.round(127 * 0.65 + rgb[0] * 0.35), Math.round(231 * 0.65 + rgb[1] * 0.35), Math.round(255 * 0.7 + rgb[2] * 0.3)];
          g.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${(F.cut ? 0.2 : 0.06 + 0.1 * lam).toFixed(3)})`; g.fill();
          g.shadowColor = 'rgba(127,231,255,.9)'; g.shadowBlur = 7 * k; g.strokeStyle = F.cut ? 'rgba(170,240,255,.95)' : 'rgba(127,231,255,.55)'; g.lineWidth = (F.cut ? 1.4 : 1) * k; g.stroke(); g.shadowBlur = 0;
        } else {
          const sh = F.cut ? 1 : 0.5 + 0.5 * lam; g.fillStyle = `rgb(${Math.round(rgb[0] * sh)},${Math.round(rgb[1] * sh)},${Math.round(rgb[2] * sh)})`; g.fill();
          g.strokeStyle = 'rgba(16,24,32,.55)'; g.lineWidth = 0.8 * k; g.stroke();
        }
        if (F.cut) hatch3D(g, P, pp, proj, rot, holo, k);
      });
    });
    g.globalCompositeOperation = 'source-over';
    // numbered tags + leaders to the right (wide views)
    if (H.labels) {
      const tags = items.slice().reverse().map(({ P }) => { const c = P.map(centroid(P.pts2)), s = P3(c); return { P, s }; }).filter(t => t.s.x > -50 && t.s.x < W + 50);
      const seen = new Map(); tags.forEach(t => { if (!seen.has(t.P.label)) seen.set(t.P.label, t); });
      const list = [...seen.values()].sort((a, b) => a.s.y - b.s.y); H.legend = list.map((t, i) => ({ n: i + 1, label: t.P.label, mat: t.P.mat }));
      const wide = W / k >= 640, fs = Math.round(11.5 * k), colX = W - 14 * k; let lastY = -1e9;
      g.font = `600 ${fs}px "IBM Plex Sans", system-ui, sans-serif`; g.textBaseline = 'middle';
      list.forEach((t, i) => {
        const n = String(i + 1), r = 8 * k;
        if (wide) { let ly = Math.max(t.s.y, lastY + fs * 1.7); lastY = ly; const tw = g.measureText(t.P.label).width, lx = colX - tw;
          g.strokeStyle = holo ? 'rgba(127,231,255,.55)' : 'rgba(20,35,50,.55)'; g.lineWidth = 1 * k; g.setLineDash([3 * k, 3 * k]); g.beginPath(); g.moveTo(t.s.x, t.s.y); g.lineTo(lx - 30 * k, ly); g.lineTo(lx - 8 * k, ly); g.stroke(); g.setLineDash([]);
          g.fillStyle = holo ? 'rgba(4,16,28,.72)' : 'rgba(255,255,255,.86)'; g.fillRect(lx - 30 * k, ly - fs * 0.8, tw + 34 * k, fs * 1.6);
          g.fillStyle = holo ? '#bff4ff' : '#13202c'; g.textAlign = 'left'; g.fillText(t.P.label, lx - 4 * k, ly);
          g.fillStyle = holo ? '#ffb36b' : '#a259ff'; g.textAlign = 'center'; g.fillText(n, lx - 20 * k, ly); }
        g.beginPath(); g.arc(t.s.x, t.s.y, r, 0, Math.PI * 2); g.fillStyle = holo ? 'rgba(4,16,28,.85)' : '#ffffff'; g.fill(); g.strokeStyle = holo ? '#7fe7ff' : '#13202c'; g.lineWidth = 1.2 * k; g.stroke();
        g.fillStyle = holo ? '#7fe7ff' : '#13202c'; g.textAlign = 'center'; g.font = `700 ${Math.round(10 * k)}px "IBM Plex Mono", monospace`; g.fillText(n, t.s.x, t.s.y + 0.5); g.font = `600 ${fs}px "IBM Plex Sans", system-ui, sans-serif`;
      });
    }
    if (holo) { // scanlines + vignette
      g.fillStyle = 'rgba(127,231,255,.035)'; for (let y = 0; y < Hh; y += 3 * k) g.fillRect(0, y, W, 1);
      const v = g.createRadialGradient(W / 2, Hh / 2, Math.min(W, Hh) * 0.35, W / 2, Hh / 2, Math.max(W, Hh) * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)'); g.fillStyle = v; g.fillRect(0, 0, W, Hh);
    }
  }
  /** Hatch the cut face: the material pattern drawn on the cut plane, clipped to the face. */
  function hatch3D(g, P, pp, proj, rot, holo, k) {
    const M = matOf(P.mat), fam = HATCH3D[M.pat], b = bbox(P.pts2), segs = [];
    if (fam) fam.forEach(([ang, sp, off]) => { const u = { x: Math.cos(ang), y: Math.sin(ang) }, v = { x: -u.y, y: u.x }, cs = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(([x, y]) => v.x * x + v.y * y), span = (b.x1 - b.x0) + (b.y1 - b.y0) + 2; const s = Math.max(0.35, sp); for (let c = Math.floor(Math.min(...cs) / s) * s + (off || 0) * s; c <= Math.max(...cs); c += s) { const o = { x: v.x * c, y: v.y * c }; segs.push([add(o, mul(u, -span * 2)), add(o, mul(u, span * 2))]); } });
    if (M.pat === 'xbox') { const o = obb(P.pts2), q = [o.at(o.u0, o.v0), o.at(o.u1, o.v0), o.at(o.u1, o.v1), o.at(o.u0, o.v1)]; segs.push([q[0], q[2]], [q[1], q[3]]); }
    let batt = null; if (M.pat === 'batt') { batt = battPath({ pts: P.pts2 }).slice(1).split(' L').map(s => { const [x, y] = s.split(' ').map(Number); return { x, y }; }); }
    if (!segs.length && !batt) return;
    g.save(); g.beginPath(); pp.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.clip();
    g.strokeStyle = holo ? 'rgba(127,231,255,.5)' : 'rgba(16,24,32,.55)'; g.lineWidth = (holo ? 0.9 : 0.7) * k; g.beginPath();
    const S = q => proj(rot(P.map(q)));
    segs.forEach(([a, c]) => { const N = 6; for (let i = 0; i < N; i++) { const p0 = S(add(a, mul(sub(c, a), i / N))), p1 = S(add(a, mul(sub(c, a), (i + 1) / N))); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); } });
    if (batt) batt.forEach((q, i) => { const s = S(q); if (i) g.lineTo(s.x, s.y); else g.moveTo(s.x, s.y); });
    g.stroke(); g.restore();
  }
  /** Renders the detail in 3D into a new canvas (thumbnails, Coach image, Swap source). */
  function snapshot3D(model, kind, settings, mode, W, H, cam) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const h = Holo(cv, { fixed: true, mode, cam: cam || undefined, labels: mode !== 'model' }); h.scene = build3D(model, kind, settings); h.render(); return cv;
  }

  /* ============================================================ assemblies (starting points)
   * Typical learning geometry drawn by DrawUp, not any firm's work. Every piece stays editable. */
  const DEFAULT_STACK = [['gyp', 0.625], ['batt', 5.5], ['ply', 0.5], ['membrane', 0.125], ['air', 1], ['brick', 3.625]];
  const R = (mat, pts, extra) => Object.assign({ id: rid('rg'), mat, pts }, extra || {});
  const RR = (mat, x0, y0, x1, y1, extra) => R(mat, rectPts(x0, y0, x1, y1), extra);
  function breakLine(a, b) { const d = sub(b, a), L = Math.hypot(d.x, d.y), u = mul(d, 1 / L), n = { x: -u.y, y: u.x }, m = add(a, mul(d, 0.5)), z = Math.min(1.2, L / 12); return D().makeShape('polyline', [sub(a, mul(u, 1.5)), sub(m, mul(u, z)), add(add(m, mul(u, -z * 0.35)), mul(n, z * 2)), add(add(m, mul(u, z * 0.35)), mul(n, -z * 2)), add(m, mul(u, z)), add(b, mul(u, 1.5))], { weight: 'fine' }); }
  function dimItem(a, b, off) { try { return D().normalizeModel({ items: [{ id: rid('i'), kind: 'dim', a, b, off: off || 0, rot: 0 }] }).items[0]; } catch (_e) { return null; } }
  /** Leader notes for every region, in a column left or right of the detail. */
  function autoNotes(m, S) {
    const regs = m.regions.filter(r => r.mat !== 'air'); if (!regs.length) return [];
    const b = bbox(regs.flatMap(r => r.pts)), cx = (b.x0 + b.x1) / 2, gap = 0.24 * S, seen = new Set(), cols = { L: [], R: [] };
    regs.forEach(r => { const lab = regionLabel(r); if (seen.has(lab)) return; seen.add(lab); const o = obb(r.pts), tip = o.at((o.u0 + o.u1) / 2 + (o.lu > 12 ? o.lu * 0.12 : 0), (o.v0 + o.v1) / 2); if (!inside(tip, r.pts)) { const c = centroid(r.pts); tip.x = c.x; tip.y = c.y; } (tip.x > cx ? cols.R : cols.L).push({ r, tip, lab }); });
    const out = [];
    [['R', b.x1 + 0.75 * S], ['L', b.x0 - 0.75 * S]].forEach(([k, x]) => {
      const list = cols[k].sort((p, q) => p.tip.y - q.tip.y); let last = -1e9;
      list.forEach(t => { const y = Math.max(t.tip.y, last + gap); last = y; out.push({ id: rid('n'), tip: { x: D().snap(t.tip.x), y: D().snap(t.tip.y) }, at: { x: D().snap(x), y: D().snap(y) }, text: t.lab }); });
    });
    return out;
  }
  function stackSection(stack, H) {
    const m = emptyDetail(); let x = 0; H = H || 48;
    stack.forEach(([mat, t]) => { m.regions.push(RR(mat, x, -H, x + t, 0)); x += t; });
    m.items.push(breakLine({ x: -2, y: -H }, { x: x + 2, y: -H }), breakLine({ x: -2, y: 0 }, { x: x + 2, y: 0 }));
    const d = dimItem({ x: 0, y: -H }, { x, y: -H }, -0.35 * 8); if (d) m.items.push(d);
    return m;
  }
  function stackPlan(stack, L) {
    const m = emptyDetail(); L = L || 48; const total = stack.reduce((s, x) => s + x[1], 0); let y = total; // exterior at the top of the sheet
    stack.forEach(([mat, t]) => {
      const y0 = y - t, y1 = y;
      if (mat === 'batt') { // studs at 16" o.c. with batts between them
        let s = 0; for (let x = 8; x < L; x += 16) { if (x - 0.75 > s) m.regions.push(RR('batt', s, y0, x - 0.75, y1)); m.regions.push(RR('wood', x - 0.75, y0, x + 0.75, y1)); s = x + 0.75; } if (L - s > 0.5) m.regions.push(RR('batt', s, y0, L, y1));
      } else m.regions.push(RR(mat, 0, y0, L, y1));
      y = y0;
    });
    m.items.push(breakLine({ x: 0, y: -2 }, { x: 0, y: total + 2 }), breakLine({ x: L, y: -2 }, { x: L, y: total + 2 }));
    const d = dimItem({ x: L, y: 0 }, { x: L, y: total }, -0.4 * 8); if (d) m.items.push(d);
    const d2 = dimItem({ x: 8, y: total }, { x: 24, y: total }, 0.35 * 8); if (d2) m.items.push(d2);
    return m;
  }
  /** Outside corner in plan: every layer turns the corner as an L; a corner post in the cavity. */
  function cornerPlan(stack, A) {
    const m = emptyDetail(); A = A || 40; const rev = stack.slice().reverse(); let o = 0; // offsets from the outside corner, exterior first
    rev.forEach(([mat, t]) => {
      const o0 = o, o1 = o + t; o = o1;
      const L = (a, b) => [{ x: a, y: a }, { x: A, y: a }, { x: A, y: b }, { x: b, y: b }, { x: b, y: A }, { x: a, y: A }];
      if (mat === 'batt') { const post = 1.5; m.regions.push(R('wood', [{ x: o0, y: o0 }, { x: o1 + post, y: o0 }, { x: o1 + post, y: o1 }, { x: o1, y: o1 }, { x: o1, y: o1 + post }, { x: o0, y: o1 + post }])); m.regions.push(RR('batt', o1 + post, o0, A, o1)); m.regions.push(RR('batt', o0, o1 + post, o1, A)); }
      else m.regions.push(R(mat, L(o0, o1)));
    });
    m.items.push(breakLine({ x: A, y: -2 }, { x: A, y: o + 2 }), breakLine({ x: -2, y: A }, { x: o + 2, y: A }));
    const d = dimItem({ x: 0, y: 0 }, { x: o, y: 0 }, -0.4 * 8); if (d) m.items.push(d);
    return m;
  }
  /** Wood stud wall with brick veneer at a slab-on-grade foundation, about 4'-0" of wall shown. */
  function wallAtSlab() {
    const m = emptyDetail(), H = 40;
    m.regions.push(
      RR('gyp', 0, -H, 0.625, 0), RR('batt', 0.625, -H, 6.125, -1.5), RR('wood', 0.625, -1.5, 6.125, 0, { label: '2X6 P.T. SILL PLATE' }),
      RR('ply', 6.125, -H, 6.625, 0), RR('membrane', 6.625, -H, 6.75, 0, { label: 'WEATHER-RESISTIVE BARRIER' }), RR('air', 6.75, -H, 7.75, 4), RR('brick', 7.75, -H, 11.375, 4),
      RR('conc', -30, 0, 1.375, 4, { label: '4" CONCRETE SLAB ON GRADE' }), RR('vapor', -30, 4, 1.375, 4.0625, { label: 'VAPOR RETARDER' }), RR('gravel', -30, 4.0625, 1.375, 8, { label: '4" GRANULAR BASE' }),
      R('conc', [{ x: 1.375, y: 0 }, { x: 7.75, y: 0 }, { x: 7.75, y: 4 }, { x: 11.375, y: 4 }, { x: 11.375, y: 40 }, { x: 1.375, y: 40 }], { label: 'CONCRETE FOUNDATION WALL WITH BRICK LEDGE' }),
      RR('conc', -4.625, 40, 17.375, 50, { label: 'CONCRETE FOOTING' }), RR('rigid', 11.375, 8, 13.375, 36, { label: '2" RIGID INSULATION' }),
      R('earth', [{ x: -30, y: 8 }, { x: 1.375, y: 8 }, { x: 1.375, y: 40 }, { x: -4.625, y: 40 }, { x: -4.625, y: 50 }, { x: 17.375, y: 50 }, { x: 17.375, y: 40 }, { x: 11.375, y: 40 }, { x: 11.375, y: 36 }, { x: 13.375, y: 36 }, { x: 13.375, y: 8 }, { x: 34, y: 8 }, { x: 34, y: 60 }, { x: -30, y: 60 }]));
    m.items.push(breakLine({ x: -2, y: -H }, { x: 13.5, y: -H }), breakLine({ x: -30, y: -2 }, { x: -30, y: 62 }), breakLine({ x: 34, y: 6 }, { x: 34, y: 62 }));
    m.items.push(D().makeShape('polyline', [{ x: 3.375, y: -1 }, { x: 3.375, y: 30 }, { x: 6.375, y: 30 }], { weight: 'medium' }));
    m.items.push(D().makeShape('polyline', [{ x: 6.75, y: -6 }, { x: 6.75, y: 3.6 }, { x: 11.9, y: 3.6 }, { x: 11.9, y: 4.6 }], { weight: 'heavy' }));
    [[{ x: -4.625, y: 50 }, { x: 17.375, y: 50 }, 0.45 * 8], [{ x: 17.375, y: 40 }, { x: 17.375, y: 50 }, -0.4 * 8], [{ x: -30, y: 0 }, { x: -30, y: 4 }, 0.35 * 8]].forEach(([a, b, off]) => { const d = dimItem(a, b, off); if (d) m.items.push(d); });
    m.notes.push({ id: rid('n'), tip: { x: 3.375, y: 18 }, at: { x: -18, y: 22 }, text: '1/2" DIA. ANCHOR BOLT @ 6\'-0" O.C. MAX, 7" MIN. EMBED' }, { id: rid('n'), tip: { x: 9.5, y: 4.1 }, at: { x: 40, y: 1 }, text: 'THROUGH-WALL FLASHING WITH WEEPS @ 24" O.C.' });
    return m;
  }
  const PRESETS = [
    { id: 'wall-slab', kind: 'section', name: 'Wall section at slab on grade', blurb: '2x6 wood stud wall, brick veneer, slab on grade, foundation wall and footing.', make: () => wallAtSlab(), settings: { length: 30 } },
    { id: 'stack-section', kind: 'section', name: 'Wall section from layers', blurb: 'Vertical layers from your own list (material + thickness).', stack: true, make: st => stackSection(st, 48), settings: { length: 30 } },
    { id: 'stack-plan', kind: 'plan', name: 'Wall plan detail from layers', blurb: 'The same layers in plan, with studs at 16" o.c.', stack: true, make: st => stackPlan(st, 48), settings: { height: 36 } },
    { id: 'corner-plan', kind: 'plan', name: 'Outside corner plan detail', blurb: 'Every layer turns the corner, with a corner post.', stack: true, make: st => cornerPlan(st, 40), settings: { height: 36 } },
  ];

  /* ============================================================ description for Arch Coach */
  function describe(row, m) {
    const kind = row.kind === 'plan' ? 'Plan detail' : 'Section detail', S = row.scale_denominator || 8, st = row.settings || {};
    const regs = m.regions.slice().sort((a, b) => row.kind === 'plan' ? centroid(a.pts).y - centroid(b.pts).y : centroid(a.pts).x - centroid(b.pts).x);
    const lines = [`DETAIL: ${row.name} (${kind}, drawn in DrawUp Draw at ${scaleText(S)}).`, `ORIENTATION: ${row.kind === 'plan' ? 'plan cut, top of the image is the exterior side unless notes say otherwise' : 'vertical section, left to right as listed, up is up'}.`, 'COMPONENTS (material, thickness, size):'];
    regs.forEach((r, i) => { const o = obb(r.pts); lines.push(`${i + 1}. ${matOf(r.mat).name}${r.label ? ' (' + r.label + ')' : ''}: ${inch(Math.min(o.lu, o.lv))} thick x ${D().formatFtIn(Math.max(o.lu, o.lv))} ${r.pts.length > 4 ? '(shaped, ' + r.pts.length + ' corners)' : ''}`.trim()); });
    if (m.notes.length) { lines.push('NOTES ON THE DRAWING:'); m.notes.forEach(n => lines.push('- ' + n.text)); }
    const dims = m.items.filter(i => i.kind === 'dim').map(i => D().formatFtIn(Math.hypot(i.b.x - i.a.x, i.b.y - i.a.y))); if (dims.length) lines.push('DIMENSIONS SHOWN: ' + dims.join(', ') + '.');
    const shp = m.items.filter(i => i.kind === 'shape').length; if (shp) lines.push(`LINEWORK: ${shp} lines / shapes (break lines, anchors, flashing).`);
    lines.push(`3D VIEW IN THE IMAGE: ${row.kind === 'plan' ? 'extruded up ' + D().formatFtIn(st.height || 36) : 'swept back ' + D().formatFtIn(st.length || 24)} from the cut, layers stepped back to show each one.`);
    return lines.join('\n');
  }

  /* ============================================================ server helpers */
  async function token() { const s = (await sb().auth.getSession()).data.session; return s ? s.access_token : ''; }
  async function apiCall(path, opts) { const r = await fetch(path, Object.assign({}, opts || {}, { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() } })); const d = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(d.error || ('Request failed (' + r.status + ')')); e.data = d; throw e; } return d; }
  const SEL_COLS = 'id,owner_id,name,kind,category,scale_denominator,model,settings,holo_path,model_path,render_path,swap_generation_id,swap_thread_id,in_library,in_playbook,updated_at,created_at';
  async function createDetail(uid, o) {
    const p = PRESETS.find(x => x.id === o.preset), kind = p ? p.kind : (o.kind === 'plan' ? 'plan' : 'section');
    const model = p ? p.make(o.stack || DEFAULT_STACK) : emptyDetail(), S = 8;
    if (p && !o.noNotes) model.notes = model.notes.concat(autoNotes(model, S));
    const { data, error } = await sb().from('draw_details').insert({ owner_id: uid, name: (o.name || (p ? p.name : kind === 'plan' ? 'Plan detail' : 'Section detail')).slice(0, 200), kind, scale_denominator: S, model, settings: Object.assign({ length: 24, height: 36, cutaway: true, explode: 0 }, p ? p.settings : {}) }).select(SEL_COLS).single();
    if (error) throw error; return data;
  }

  /* ============================================================ "new detail" dialog */
  function stackRows(stack) { return stack.map(([m, t], i) => `<div class="dd22-srow" data-i="${i}"><select aria-label="Material ${i + 1}">${Object.entries(MATS).map(([k, v]) => `<option value="${k}"${k === m ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select><input aria-label="Thickness ${i + 1}" value="${esc(inch(t))}"><button type="button" class="dd22-x" data-rm="${i}" aria-label="Remove layer">×</button></div>`).join(''); }
  function newDialog(c, onCreate) {
    document.getElementById('dd22-new')?.remove();
    let stack = store.get('dd22-stack', DEFAULT_STACK);
    document.body.insertAdjacentHTML('beforeend', `<div class="dd22-modal" id="dd22-new" role="dialog" aria-modal="true" aria-label="New detail"><div class="dd22-mcard du-glass"><button type="button" class="dd22-close" aria-label="Close">×</button>
      <span class="du-kicker">DRAW · NEW DETAIL</span><h2>Draw a detail, see it as a 3D hologram</h2>
      <div class="dd22-field"><label for="dd22-nname">Name</label><input id="dd22-nname" maxlength="120" placeholder="e.g. Wall section at slab edge"></div>
      <div class="dd22-presets">${PRESETS.map(p => `<button type="button" class="dd22-preset" data-preset="${p.id}"><b>${esc(p.name)}</b><small>${p.kind === 'plan' ? 'PLAN' : 'SECTION'} · ${esc(p.blurb)}</small></button>`).join('')}
        <button type="button" class="dd22-preset" data-blank="section"><b>Blank section detail</b><small>SECTION · start from nothing</small></button><button type="button" class="dd22-preset" data-blank="plan"><b>Blank plan detail</b><small>PLAN · start from nothing</small></button></div>
      <details class="dd22-stack"><summary>Layers used by the “from layers” and corner details (inside to outside)</summary><div id="dd22-srows">${stackRows(stack)}</div><button type="button" class="du-btn ghost" id="dd22-sadd">Add layer</button></details>
      <p class="dd22-note">Assemblies are typical learning geometry drawn by DrawUp, not a firm’s detail. Adapt and verify with a licensed professional.</p></div></div>`);
    const dlg = document.getElementById('dd22-new'), close = () => dlg.remove();
    $q(dlg, '.dd22-close').onclick = close; dlg.onclick = e => { if (e.target === dlg) close(); };
    const readStack = () => { const out = []; $$(dlg, '.dd22-srow').forEach(r => { const m = $q(r, 'select').value, t = D().parseFtIn($q(r, 'input').value); if (t > 0) out.push([m, t]); }); return out.length ? out : DEFAULT_STACK; };
    const bindRows = () => { $$(dlg, '[data-rm]').forEach(b => b.onclick = () => { stack = readStack(); stack.splice(+b.dataset.rm, 1); $q(dlg, '#dd22-srows').innerHTML = stackRows(stack); bindRows(); }); };
    bindRows(); $q(dlg, '#dd22-sadd').onclick = () => { stack = readStack(); stack.push(['rigid', 1]); $q(dlg, '#dd22-srows').innerHTML = stackRows(stack); bindRows(); };
    $$(dlg, '[data-preset],[data-blank]').forEach(b => b.onclick = async () => {
      b.disabled = true; stack = readStack(); store.set('dd22-stack', stack);
      try { const u = c.user || await sessionUser(); const row = await createDetail(u.id, { preset: b.dataset.preset, kind: b.dataset.blank, stack, name: $q(dlg, '#dd22-nname').value.trim() }); close(); onCreate(row); }
      catch (e) { b.disabled = false; toast(c, 'Not created — ' + (e.message || e), true); }
    });
    $q(dlg, '#dd22-nname').focus();
  }
  const goDetail = (c, id) => { history.replaceState(null, '', '#portal/draw?detail=' + id); c.openPortalTab('draw'); };

  /* ============================================================ my details (list) */
  async function detailList(w, c) {
    const { data: rows, error } = await sb().from('draw_details').select(SEL_COLS).eq('owner_id', c.user.id).order('updated_at', { ascending: false }).limit(100);
    if (error) { w.innerHTML = `<div class="du-empty"><h1>Details could not load.</h1><p>${esc(error.message)}</p></div>`; return; }
    w.innerHTML = `<div class="dd22" data-dw21-route="detail:list"><div class="du-work-head"><div><span class="du-kicker">DRAW · DETAILS · 3D</span><h1>My details</h1><p>Plan and section details with material hatches, shown as 3D holograms. Send one to Arch Coach, upload it to the 3D tab of the Detail Library and the Playbook, or render it realistic.</p></div>
      <div class="du-head-actions"><button class="du-btn ghost" id="dd22-back">Drawings</button><button class="du-btn primary" id="dd22-new-btn">New detail</button></div></div>
      ${(rows || []).length ? `<div class="dd22-grid">${rows.map(r => `<article class="dd22-card" data-open="${r.id}"><canvas width="480" height="300" data-thumb="${r.id}" aria-hidden="true"></canvas><div><span class="dd22-kick">${r.kind === 'plan' ? 'PLAN DETAIL' : 'SECTION DETAIL'}${r.in_library ? ' · LIBRARY 3D' : ''}${r.in_playbook ? ' · PLAYBOOK 3D' : ''}${r.render_path ? ' · REALISTIC' : ''}</span><h3>${esc(r.name)}</h3><small>${new Date(r.updated_at).toLocaleString()}</small></div><div class="dd22-acts"><button class="du-btn primary" data-open="${r.id}">Open</button><button class="du-btn ghost" data-del="${r.id}">Delete</button></div></article>`).join('')}</div>`
        : `<article class="du-glass dd22-emptycard"><h2>No details yet</h2><p class="du-muted">Start from a wall section, a plan layer stack or an outside corner, or a blank sheet.</p><button class="du-btn primary" id="dd22-new-2">New detail</button></article>`}</div>`;
    (rows || []).forEach(r => { const cv = $q(w, `[data-thumb="${r.id}"]`); if (cv) { const h = Holo(cv, { fixed: true, mode: 'holo', labels: false }); h.scene = build3D(r.model, r.kind, r.settings); h.render(); } });
    $q(w, '#dd22-back').onclick = () => { history.replaceState(null, '', '#portal/draw'); c.openPortalTab('draw'); };
    [$q(w, '#dd22-new-btn'), $q(w, '#dd22-new-2')].forEach(b => { if (b) b.onclick = () => newDialog(c, row => goDetail(c, row.id)); });
    $$(w, 'button[data-open]').forEach(b => b.onclick = e => { e.stopPropagation(); goDetail(c, b.dataset.open); });
    $$(w, 'article[data-open] canvas').forEach(cv => cv.onclick = () => goDetail(c, cv.closest('[data-open]').dataset.open));
    $$(w, '[data-del]').forEach(b => b.onclick = async e => { e.stopPropagation(); if (!confirm('Delete this detail? This cannot be undone.')) return; const { error: e2 } = await sb().from('draw_details').delete().eq('id', b.dataset.del).eq('owner_id', c.user.id); if (e2) { toast(c, e2.message, true); return; } toast(c, 'Detail deleted.'); detailList(w, c); });
  }

  /* ============================================================ detail editor */
  const DTOOLS = [['select', 'Select'], ['rect', 'Layer ▭'], ['poly', 'Layer shape'], ['line', 'Line'], ['polyline', 'Polyline'], ['arc', 'Arc'], ['circle', 'Circle'], ['srect', 'Rectangle'], ['polygon', 'Polygon'], ['curve', 'Curve'], ['note', 'Note'], ['dim', 'Dimension'], ['text', 'Text']];
  const DHINTS = { select: 'Click a layer, line or note to edit it. Drag to move; drag a corner handle to reshape. Arrows nudge 1/8" (Shift 1"), Delete removes.', rect: 'Click two corners to place a material layer.', poly: 'Click each corner of the material layer, at any angle. Click the first corner, double-click or press Enter to close.', line: 'Click points: each click draws a line from the last one. Esc stops.', polyline: 'Click points, then double-click or Enter.', arc: 'Click the start, a point on the arc, then the end.', circle: 'Click the center, then a point on the circle.', srect: 'Click two corners.', polygon: 'Click the center, then a corner. Set the number of sides above.', curve: 'Click points the curve passes through, then double-click or Enter.', note: 'Click what the note points to, then where the text goes.', dim: 'Click two points. Snaps to corners.', text: 'Click where the text goes.' };
  const MULTI = ['poly', 'polyline', 'curve', 'line'];

  async function detailEditor(w, c, row) {
    const C = D(); let model = normDetail(row.model), S = row.scale_denominator || 8, settings = Object.assign({ length: 24, height: 36, cutaway: true, explode: 0 }, row.settings || {});
    let tool = 'select', sel = null, pts = [], hover = null, undo = [], saveTimer = null, saving = false, view = store.get('dd22-view', '2d'), holo = null, drag = null, suppress = false, renderMode = 'holo', realUrl = null;
    const prefs = Object.assign({ mat: 'conc', angle: 90, grid: 0.25, sides: 6, weight: 'medium', closed: false }, store.get('dd22-prefs', {}));
    const savePrefs = () => store.set('dd22-prefs', prefs);
    w.innerHTML = `<div class="dd22 dd22-editor" data-dw21-route="detail:${row.id}">
      <div class="du-work-head du-draw-head"><div><span class="du-kicker" id="dd22-kick">DRAW · ${row.kind === 'plan' ? 'PLAN' : 'SECTION'} DETAIL</span><h1 id="dd22-title">${esc(row.name)}</h1></div>
        <div class="du-head-actions"><button class="du-btn ghost" id="dd22-mine">My details</button><button class="du-btn ghost" id="dd22-new-btn">New detail</button><button class="du-btn ghost" id="dd22-plans">Drawings</button></div></div>
      <div class="dd22-bar">
        <div class="dd22-row"><div class="dw21-seg" role="group" aria-label="View"><button type="button" data-dv="2d">2D detail</button><button type="button" data-dv="3d">3D hologram</button></div>
          <div class="dd22-tools" role="toolbar" aria-label="Detail tools">${DTOOLS.map(([k, l]) => `<button type="button" data-dt="${k}">${l}</button>`).join('')}<button type="button" id="dd22-undo">Undo</button></div></div>
        <div class="dd22-row dd22-opts"><label class="dd22-mat">Material <select id="dd22-mat">${Object.entries(MATS).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('')}</select></label>
          <div class="dw21-seg dw21-snaps" role="group" aria-label="Angle snap"><span>Angle</span>${[[90, '90°'], [45, '45°'], [15, '15°'], [0, 'Off']].map(([v, l]) => `<button type="button" data-ang="${v}">${l}</button>`).join('')}</div>
          <label>Grid <select id="dd22-grid">${GRIDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
          <label>Scale <select id="dd22-scale">${SCALES.map(([v, l]) => `<option value="${v}"${v === S ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <span id="dd22-shopt"></span><button type="button" class="dw21-btn" id="dd22-asm">Assemblies</button><button type="button" class="dw21-btn" id="dd22-autonote">Label layers</button><span id="dd22-save" class="du-save-status"></span></div>
        <p class="dd22-hint" id="dd22-hint"></p></div>
      <div class="dd22-split"><div class="dd22-stage">
          <div class="dd22-sheet" id="dd22-sheet" tabindex="0" aria-label="Detail drawing"></div>
          <div class="dd22-3d" id="dd22-3d" hidden><canvas id="dd22-cv" tabindex="0" aria-label="3D hologram of the detail. Drag to turn, pinch or scroll to zoom, double-click to reset."></canvas><img id="dd22-real" alt="Realistic render of the detail" hidden><div class="dd22-realempty" id="dd22-realempty" hidden></div>
            <div class="dd22-3dbar"><div class="dw21-seg" role="group" aria-label="3D style"><button type="button" data-rm="holo">Hologram</button><button type="button" data-rm="model">Model</button><button type="button" data-rm="real">Realistic</button></div>
              <button type="button" class="dw21-btn" id="dd22-spin" aria-pressed="false">Spin</button><button type="button" class="dw21-btn" id="dd22-labels" aria-pressed="true">Labels</button><button type="button" class="dw21-btn" id="dd22-cut" aria-pressed="true">Cutaway</button><label class="dd22-range">Explode <input type="range" id="dd22-explode" min="0" max="1" step="0.05"></label><button type="button" class="dw21-btn" id="dd22-reset">Reset view</button></div>
            <ol class="dd22-legend" id="dd22-legend" aria-label="Layers"></ol><div class="dd22-prog" id="dd22-prog" hidden aria-live="polite"></div></div>
          <form class="dw21-num" id="dd22-num" hidden><label>Length <input id="dd22-num-in" autocomplete="off" inputmode="decimal" placeholder="3 1/2&quot;"></label><label>Angle <input id="dd22-num-ang" autocomplete="off" inputmode="decimal" placeholder="mouse"></label><button type="submit">Place</button><small>Degrees from east, counterclockwise. Or type 6"&lt;45.</small></form>
          <div class="dd22-readout" id="dd22-readout" hidden></div>
        </div><aside class="du-draw-inspect du-glass dd22-side" id="dd22-side"></aside></div>
      <div class="dd22-send"><span class="dd22-sendlbl">Send it on</span><button type="button" class="du-btn primary" id="dd22-coach">Ask Arch Coach about this</button><button type="button" class="du-btn ghost" id="dd22-upload">Upload to 3D</button><button type="button" class="du-btn ghost" id="dd22-render">Render realistic · Let’s Play</button>
        <span class="dd22-exp"><button type="button" data-x="png">PNG</button><button type="button" data-x="svg">SVG</button><button type="button" data-x="3d">3D PNG</button></span></div>
      <p class="du-muted dd22-foot">Hatches follow common US construction-document conventions. 3D: a ${row.kind === 'plan' ? 'plan detail is extruded up' : 'section detail is swept back from the cut'}; set the depth on the right. The realistic render runs the Model view through DrawUp Swap (photoreal) and is one frame from the angle you render.</p></div>`;
    const sheet = $q(w, '#dd22-sheet'), side = $q(w, '#dd22-side'), saveEl = $q(w, '#dd22-save'), readout = $q(w, '#dd22-readout'), numBox = $q(w, '#dd22-num');
    const setSave = (t, bad) => { saveEl.textContent = t; saveEl.style.color = bad ? '#ff9a9a' : ''; };
    function scheduleSave() { setSave('Saving…'); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 600); }
    async function saveNow() {
      if (saving) { scheduleSave(); return; } saving = true;
      const { error } = await sb().from('draw_details').update({ model, settings, name: row.name, kind: row.kind, category: row.category || null, scale_denominator: S, updated_at: new Date().toISOString() }).eq('id', row.id).eq('owner_id', c.user.id);
      saving = false; if (error) { setSave('Not saved — ' + error.message, true); return; } setSave('Saved');
    }
    const change = fn => { const before = JSON.stringify(model); try { fn(); model = normDetail(model); } catch (e) { model = normDetail(JSON.parse(before)); toast(c, e.message || String(e), true); render(); return false; } undo.push(before); if (undo.length > 100) undo.shift(); render(); scheduleSave(); return true; };
    const svgEl = () => $q(sheet, 'svg');
    function toModel(ev) { const s = svgEl(), q = s.createSVGPoint(); q.x = ev.clientX; q.y = ev.clientY; const r = q.matrixTransform(s.getScreenCTM().inverse()); return { x: r.x, y: r.y }; }
    const pxPerIn = () => { const s = svgEl(); return s ? (s.getScreenCTM().a || 1) : 1; };
    function vertices() { const v = []; model.regions.forEach(r => r.pts.forEach(p => v.push(p))); model.items.forEach(it => { if (it.kind === 'shape') C.shapeLines(it).forEach(l => { if (it.shape === 'polyline' || it.shape === 'line' || it.shape === 'rect' || it.shape === 'polygon') l.forEach(p => v.push(p)); else { v.push(l[0], l[l.length - 1]); } }); else if (it.kind === 'dim') v.push(it.a, it.b); }); return v; }
    function snapPt(p, from, free) {
      const tol = 10 / pxPerIn(); let best = null;
      if (!free) vertices().concat(tool === 'poly' ? pts.slice(0, 1) : []).forEach(v => { const d = dist(v, p); if (d < tol && (!best || d < best.d)) best = { d, p: v }; });
      if (best) return { x: best.p.x, y: best.p.y, snapped: true };
      const gs = prefs.grid || 0.25; let q = { x: C.snap(p.x, gs), y: C.snap(p.y, gs) };
      if (from && !free && prefs.angle > 0) { const st = prefs.angle * Math.PI / 180, a = Math.round(Math.atan2(p.y - from.y, p.x - from.x) / st) * st, L = C.snap(dist(p, from), gs); q = { x: C.snap(from.x + Math.cos(a) * L), y: C.snap(from.y + Math.sin(a) * L) }; }
      return q;
    }
    /* ---- render */
    function render() {
      const r = sheetSVG(model, { scale: S, name: row.name, kind: row.kind, sel });
      sheet.innerHTML = r.svg; const s = svgEl(); s.setAttribute('width', '100%'); s.setAttribute('height', '100%'); s.style.display = 'block';
      if (sel && sel.type === 'region') { const rg = model.regions.find(x => x.id === sel.id); if (rg) { const h = 7 / pxPerIn(); s.insertAdjacentHTML('beforeend', rg.pts.map((p, i) => `<rect class="dd22-vtx" data-vtx="${i}" x="${f3(p.x - h / 2)}" y="${f3(p.y - h / 2)}" width="${f3(h)}" height="${f3(h)}" fill="#fff" stroke="#1b8cff" stroke-width="${f3(1.5 / pxPerIn())}"/>`).join('')); } }
      s.insertAdjacentHTML('beforeend', '<g id="dd22-ov"></g>'); overlay();
      side.innerHTML = inspector(); bindSide();
      $q(w, '#dd22-kick').textContent = 'DRAW · ' + (row.kind === 'plan' ? 'PLAN' : 'SECTION') + ' DETAIL';
      if (view === '3d') render3D();
    }
    function overlay() {
      const g = sheet.querySelector('#dd22-ov'); if (!g) return; const k = pxPerIn(), lw = 1.6 / k, col = '#1b8cff';
      if (!pts.length || !hover) { g.innerHTML = ''; readout.hidden = true; return; }
      const P = pts.concat([hover]), path = L => 'M' + L.map(p => f3(p.x) + ' ' + f3(p.y)).join(' L'); let d = '', extra = '';
      if (tool === 'rect' || tool === 'srect') { const r = rectPts(pts[0].x, pts[0].y, hover.x, hover.y); d = path(r.concat([r[0]])); }
      else if (tool === 'arc' && pts.length === 2) d = path(C.arcPoints(pts[0], pts[1], hover));
      else if (tool === 'circle') { extra = `<circle cx="${f3(pts[0].x)}" cy="${f3(pts[0].y)}" r="${f3(dist(pts[0], hover))}" fill="none" stroke="${col}" stroke-width="${f3(lw)}" stroke-dasharray="${f3(5 / k)} ${f3(4 / k)}"/>`; d = path(P); }
      else if (tool === 'polygon') { const ps = C.regularPolygon(pts[0], dist(pts[0], hover), Math.atan2(hover.y - pts[0].y, hover.x - pts[0].x), prefs.sides || 6); d = path(ps.concat([ps[0]])); }
      else if (tool === 'curve') d = path(C.curvePoints(P, false));
      else if (tool === 'poly') d = path(P) + (pts.length > 1 ? ` L${f3(pts[0].x)} ${f3(pts[0].y)}` : '');
      else d = path(tool === 'line' ? [pts[pts.length - 1], hover] : P);
      g.innerHTML = `<path d="${d}" fill="${tool === 'rect' || tool === 'poly' ? 'rgba(27,140,255,.08)' : 'none'}" stroke="${col}" stroke-width="${f3(lw)}" stroke-dasharray="${f3(6 / k)} ${f3(4 / k)}"/>${extra}${pts.map(p => `<circle cx="${f3(p.x)}" cy="${f3(p.y)}" r="${f3(3 / k)}" fill="${col}"/>`).join('')}<circle cx="${f3(hover.x)}" cy="${f3(hover.y)}" r="${f3(hover.snapped ? 5 / k : 3 / k)}" fill="none" stroke="${hover.snapped ? '#ff8a3d' : col}" stroke-width="${f3(lw)}"/>`;
      const last = pts[pts.length - 1], L = dist(last, hover), ang = ((Math.atan2(-(hover.y - last.y), hover.x - last.x) * 180 / Math.PI) + 360) % 360;
      readout.hidden = false; readout.textContent = (tool === 'circle' ? 'R ' : '') + C.formatFtIn(L) + (tool === 'circle' ? '' : '  ∠' + (Math.round(ang * 10) / 10) + '°');
    }
    /* ---- tools */
    function setTool(t) { tool = t; pts = []; hover = null; if (t !== 'select') sel = null; $$(w, '[data-dt]').forEach(b => { b.classList.toggle('on', b.dataset.dt === t); b.setAttribute('aria-pressed', String(b.dataset.dt === t)); }); $q(w, '#dd22-hint').textContent = DHINTS[t] || ''; shapeOpts(); numBox.hidden = true; sheet.style.cursor = t === 'select' ? 'default' : 'crosshair'; render(); }
    function shapeOpts() {
      const o = $q(w, '#dd22-shopt'), sh = ['line', 'polyline', 'arc', 'circle', 'srect', 'polygon', 'curve'].includes(tool);
      o.innerHTML = sh ? `<label>Line <select id="dd22-weight">${[['fine', 'Fine'], ['medium', 'Medium'], ['heavy', 'Heavy (cut)']].map(([v, l]) => `<option value="${v}"${v === prefs.weight ? ' selected' : ''}>${l}</option>`).join('')}</select></label>${tool === 'polygon' ? `<label>Sides <input id="dd22-sides" type="number" min="3" max="24" value="${prefs.sides}"></label>` : ''}${tool === 'curve' || tool === 'polyline' ? `<label class="dd22-chk"><input type="checkbox" id="dd22-closed"${prefs.closed ? ' checked' : ''}> Closed</label>` : ''}` : '';
      const ws = $q(o, '#dd22-weight'); if (ws) ws.onchange = () => { prefs.weight = ws.value; savePrefs(); };
      const si = $q(o, '#dd22-sides'); if (si) si.onchange = () => { prefs.sides = Math.max(3, Math.min(24, parseInt(si.value, 10) || 6)); savePrefs(); };
      const cl = $q(o, '#dd22-closed'); if (cl) cl.onchange = () => { prefs.closed = cl.checked; savePrefs(); };
      $q(w, '.dd22-mat').hidden = !(tool === 'rect' || tool === 'poly' || (sel && sel.type === 'region'));
    }
    const shapeOpt = () => ({ weight: prefs.weight });
    function addShape(kind, P, extra) { const it = C.makeShape(kind, P, Object.assign(shapeOpt(), extra || {})); if (!it) throw new Error('Pick two different points.'); model.items.push(it); return it; }
    function place(p) {
      if (tool === 'rect') { if (!pts.length) { pts = [p]; return; } const a = pts[0]; if (Math.abs(p.x - a.x) < 0.05 || Math.abs(p.y - a.y) < 0.05) { toast(c, 'Make the layer wider than that.', true); return; } change(() => { const r = R(prefs.mat, rectPts(a.x, a.y, p.x, p.y)); model.regions.push(r); sel = null; }); pts = []; return; }
      if (tool === 'poly') { if (pts.length >= 3 && dist(p, pts[0]) < 8 / pxPerIn()) { finish(); return; } pts.push(p); return; }
      if (tool === 'line') { if (!pts.length) { pts = [p]; return; } const a = pts[pts.length - 1]; if (dist(a, p) < 0.05) return; change(() => addShape('line', [a, p])); pts = [p]; return; }
      if (tool === 'polyline' || tool === 'curve') { if (pts.length && dist(pts[pts.length - 1], p) < 0.05) return; pts.push(p); return; }
      if (tool === 'arc') { pts.push(p); if (pts.length === 3) { const [a, m2, b] = pts; pts = []; change(() => addShape('arc', [a, m2, b])); } return; }
      if (tool === 'circle') { if (!pts.length) { pts = [p]; return; } const a = pts[0]; pts = []; if (dist(a, p) < 0.05) return; change(() => addShape('circle', [a, p])); return; }
      if (tool === 'srect') { if (!pts.length) { pts = [p]; return; } const a = pts[0]; pts = []; change(() => addShape('rect', rectPts(a.x, a.y, p.x, p.y))); return; }
      if (tool === 'polygon') { if (!pts.length) { pts = [p]; return; } const a = pts[0]; pts = []; if (dist(a, p) < 0.05) return; change(() => addShape('polygon', C.regularPolygon(a, dist(a, p), Math.atan2(p.y - a.y, p.x - a.x), prefs.sides || 6))); return; }
      if (tool === 'dim') { if (!pts.length) { pts = [p]; return; } const a = pts[0]; pts = []; if (dist(a, p) < 0.05) return; change(() => { const it = C.addItem(model, 'dim', { a, b: p, off: -0.3 * S }); sel = { type: 'item', id: it.id }; }); return; }
      if (tool === 'text') { const t = (prompt('Text', '') || '').trim(); if (!t) return; change(() => { const it = C.addItem(model, 'text', { at: p, text: t.toUpperCase(), size: 0.125 }); sel = { type: 'item', id: it.id }; }); return; }
      if (tool === 'note') { if (!pts.length) { pts = [p]; return; } const tip = pts[0]; pts = []; const under = model.regions.slice().reverse().find(r => inside(tip, r.pts)); const t = (prompt('Note text', under ? regionLabel(under) : '') || '').trim(); if (!t) { render(); return; } change(() => { const n = { id: rid('n'), tip, at: p, text: t.toUpperCase() }; model.notes.push(n); sel = { type: 'note', id: n.id }; }); return; }
    }
    function finish() {
      if (tool === 'poly' && pts.length >= 3) { const P = pts.slice(); pts = []; if (Math.abs(area(P)) < 0.01) { toast(c, 'Those corners do not make an area.', true); render(); return; } change(() => { model.regions.push(R(prefs.mat, P)); }); return; }
      if (tool === 'polyline' && pts.length >= 2) { const P = pts.slice(); pts = []; change(() => addShape(prefs.closed && P.length > 2 ? 'polygon' : 'polyline', P)); return; }
      if (tool === 'curve' && pts.length >= 3) { const P = pts.slice(); pts = []; change(() => addShape('curve', P, { closed: prefs.closed })); return; }
      pts = []; render();
    }
    /* ---- selection, drag, vertex edit */
    const pickAt = ev => { const el = ev.target.closest && ev.target.closest('[data-vtx],[data-note],[data-item],[data-region]'); if (!el) return null; if (el.dataset.vtx != null) return { type: 'vtx', i: +el.dataset.vtx }; if (el.dataset.note) return { type: 'note', id: el.dataset.note }; if (el.dataset.item) return { type: 'item', id: el.dataset.item }; return { type: 'region', id: el.closest('[data-region]').dataset.region }; };
    function moveSel(m, s, dx, dy) {
      const mv = p => ({ x: C.snap(p.x + dx), y: C.snap(p.y + dy) });
      if (s.type === 'region') { const r = m.regions.find(x => x.id === s.id); if (r) r.pts = r.pts.map(mv); }
      else if (s.type === 'note') { const n = m.notes.find(x => x.id === s.id); if (n) { n.at = mv(n.at); n.tip = mv(n.tip); } }
      else if (s.type === 'item') C.moveItem(m, s.id, dx, dy);
    }
    sheet.addEventListener('pointerdown', ev => {
      if (tool !== 'select' || ev.button !== 0 || !svgEl()) return; const hit = pickAt(ev); if (!hit) return;
      if (hit.type === 'vtx') { drag = { vtx: hit.i, id: sel.id, before: JSON.stringify(model), start: toModel(ev), moved: false, pid: ev.pointerId }; ev.preventDefault(); return; }
      sel = hit; drag = { sel: hit, before: JSON.stringify(model), start: toModel(ev), moved: false, pid: ev.pointerId };
    });
    sheet.addEventListener('pointermove', ev => {
      if (!svgEl()) return;
      if (drag) {
        const p = toModel(ev), dx = p.x - drag.start.x, dy = p.y - drag.start.y; if (!drag.moved && Math.hypot(dx, dy) * pxPerIn() < 4) return; drag.moved = true; try { sheet.setPointerCapture(drag.pid); } catch (_e) { /* */ }
        model = normDetail(JSON.parse(drag.before)); const gs = prefs.grid || 0.25;
        if (drag.vtx != null) { const r = model.regions.find(x => x.id === drag.id); const q = snapPt(p, r.pts[(drag.vtx + r.pts.length - 1) % r.pts.length], ev.shiftKey); r.pts[drag.vtx] = { x: q.x, y: q.y }; }
        else moveSel(model, drag.sel, C.snap(dx, gs), C.snap(dy, gs));
        render(); return;
      }
      if (tool === 'select' || !pts.length) return;
      hover = snapPt(toModel(ev), pts[pts.length - 1], ev.shiftKey); overlay();
    });
    const endDrag = () => { if (!drag) return; if (drag.moved) { undo.push(drag.before); suppress = true; scheduleSave(); } drag = null; render(); };
    sheet.addEventListener('pointerup', endDrag); sheet.addEventListener('pointercancel', endDrag);
    sheet.addEventListener('click', ev => {
      if (suppress) { suppress = false; return; } if (!svgEl()) return;
      if (tool === 'select') { const h = pickAt(ev); sel = h && h.type !== 'vtx' ? h : (h ? sel : null); shapeOpts(); render(); return; }
      const p = ev.__p || snapPt(toModel(ev), pts[pts.length - 1], ev.shiftKey); place(p); hover = p; overlay();
    });
    sheet.addEventListener('dblclick', ev => { if (['poly', 'polyline', 'curve'].includes(tool)) { ev.preventDefault(); const P = []; pts.forEach(p => { if (!P.length || dist(P[P.length - 1], p) > 0.05) P.push(p); }); pts = P; finish(); } });
    sheet.addEventListener('keydown', ev => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); $q(w, '#dd22-undo').click(); return; }
      if (ev.key === 'Escape') { if (tool === 'polyline' || tool === 'curve' || tool === 'poly') finish(); else { pts = []; hover = null; render(); } return; }
      if (ev.key === 'Enter') { ev.preventDefault(); finish(); return; }
      if (/^[0-9.]$/.test(ev.key) && pts.length && tool !== 'select') { ev.preventDefault(); numBox.hidden = false; $q(numBox, '#dd22-num-in').value = ev.key; $q(numBox, '#dd22-num-ang').value = ''; $q(numBox, '#dd22-num-in').focus(); return; }
      if (!sel || tool !== 'select') return;
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); removeSel(); return; }
      const a = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key]; if (a) { ev.preventDefault(); const st = ev.shiftKey ? 1 : 0.125; change(() => moveSel(model, sel, a[0] * st, a[1] * st)); }
    });
    numBox.onsubmit = e => {
      e.preventDefault(); let t = $q(numBox, '#dd22-num-in').value, at = $q(numBox, '#dd22-num-ang').value; const mm = /^(.*?)<\s*(-?\d*\.?\d+)\s*°?\s*$/.exec(t); if (mm) { t = mm[1]; at = mm[2]; }
      const L = C.parseFtIn(t), a = pts[pts.length - 1]; if (!(L > 0) || !a) { toast(c, 'Type a length like 3 1/2" and press Enter.', true); return; }
      let dir; if (String(at).trim() !== '' && isFinite(parseFloat(at))) { const A = parseFloat(at) * Math.PI / 180; dir = { x: Math.cos(A), y: -Math.sin(A) }; } else { const h = hover || { x: a.x + 1, y: a.y }; const l = dist(h, a) || 1; dir = { x: (h.x - a.x) / l, y: (h.y - a.y) / l }; if (prefs.angle > 0) { const st = prefs.angle * Math.PI / 180, t2 = Math.round(Math.atan2(dir.y, dir.x) / st) * st; dir = { x: Math.cos(t2), y: Math.sin(t2) }; } }
      const p = { x: C.snap(a.x + dir.x * L), y: C.snap(a.y + dir.y * L) }; numBox.hidden = true; place(p); hover = p; overlay(); sheet.focus();
    };
    $$(numBox, 'input').forEach(el => el.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { numBox.hidden = true; sheet.focus(); } }));
    function removeSel() { if (!sel) return; const s = sel; sel = null; change(() => { if (s.type === 'region') model.regions = model.regions.filter(r => r.id !== s.id); else if (s.type === 'note') model.notes = model.notes.filter(n => n.id !== s.id); else if (s.type === 'item') C.removeItem(model, s.id); }); }
    /* ---- inspector */
    function inspector() {
      if (sel && sel.type === 'region') {
        const r = model.regions.find(x => x.id === sel.id); if (!r) { sel = null; return inspector(); } const o = obb(r.pts);
        return `<span class="du-kicker">MATERIAL LAYER</span><div class="du-field"><label>Material</label><select id="di22-mat">${Object.entries(MATS).map(([k, v]) => `<option value="${k}"${k === r.mat ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>
          <p class="du-muted">${esc(inch(Math.min(o.lu, o.lv)))} thick × ${esc(C.formatFtIn(Math.max(o.lu, o.lv)))} · ${r.pts.length} corners</p>
          <div class="du-field"><label>Label (blank = automatic)</label><input id="di22-label" maxlength="80" value="${esc(r.label || '')}" placeholder="${esc(regionLabel(Object.assign({}, r, { label: '' })))}"></div>
          <div class="du-two"><div class="du-field"><label>3D depth (blank = detail)</label><input id="di22-depth" value="${r.depth > 0 ? esc(C.formatFtIn(r.depth)) : ''}"></div><div class="du-field"><label>Rotate (degrees)</label><input id="di22-rot" inputmode="decimal" placeholder="e.g. 30"></div></div>
          <button class="du-btn primary" id="di22-apply">Apply</button><div class="dw21-btnrow"><button class="du-btn ghost" id="di22-dup">Duplicate</button><button class="du-btn ghost" id="di22-front">To front</button><button class="du-btn ghost" id="di22-back">To back</button><button class="du-btn ghost" id="di22-del">Delete</button></div><p class="du-muted dw21-small">Drag a corner handle to reshape the layer at any angle.</p>`;
      }
      if (sel && sel.type === 'note') { const n = model.notes.find(x => x.id === sel.id); if (!n) { sel = null; return inspector(); } return `<span class="du-kicker">NOTE</span><div class="du-field"><label>Text</label><textarea id="di22-ntext" rows="3" maxlength="160">${esc(n.text)}</textarea></div><button class="du-btn primary" id="di22-apply">Apply</button> <button class="du-btn ghost" id="di22-del">Delete</button>`; }
      if (sel && sel.type === 'item') {
        const it = model.items.find(x => x.id === sel.id); if (!it) { sel = null; return inspector(); }
        if (it.kind === 'text') return `<span class="du-kicker">TEXT</span><div class="du-field"><label>Text</label><input id="di22-text" value="${esc(it.text)}"></div><div class="du-field"><label>Rotation (degrees)</label><input id="di22-irot" value="${it.rot || 0}"></div><button class="du-btn primary" id="di22-apply">Apply</button> <button class="du-btn ghost" id="di22-del">Delete</button>`;
        if (it.kind === 'dim') return `<span class="du-kicker">DIMENSION</span><p>Measures <b>${esc(C.formatFtIn(Math.hypot(it.b.x - it.a.x, it.b.y - it.a.y)))}</b>, computed from its points.</p><button class="du-btn ghost" id="di22-dflip">Flip side</button> <button class="du-btn ghost" id="di22-del">Delete</button>`;
        return `<span class="du-kicker">${esc(String(it.shape || 'shape').toUpperCase())}</span><div class="du-two"><div class="du-field"><label>Line</label><select id="di22-weight">${[['fine', 'Fine'], ['medium', 'Medium'], ['heavy', 'Heavy (cut)']].map(([v, l]) => `<option value="${v}"${v === it.weight ? ' selected' : ''}>${l}</option>`).join('')}</select></div><div class="du-field"><label>Rotation (degrees)</label><input id="di22-irot" value="${Math.round((it.rot || 0) * 100) / 100}"></div></div><label class="dd22-chk"><input type="checkbox" id="di22-dash"${it.dash ? ' checked' : ''}> Dashed (hidden / beyond)</label><div class="dw21-btnrow"><button class="du-btn primary" id="di22-apply">Apply</button><button class="du-btn ghost" id="di22-del">Delete</button></div>`;
      }
      const regs = model.regions.length, st = settings;
      return `<span class="du-kicker">DETAIL</span><div class="du-field"><label>Name</label><input id="di22-name" maxlength="120" value="${esc(row.name)}"></div>
        <div class="du-two"><div class="du-field"><label>Type</label><select id="di22-kind"><option value="section"${row.kind !== 'plan' ? ' selected' : ''}>Section detail</option><option value="plan"${row.kind === 'plan' ? ' selected' : ''}>Plan detail</option></select></div>
        <div class="du-field"><label>${row.kind === 'plan' ? '3D height (extrude up)' : '3D depth (sweep back)'}</label><input id="di22-deep" value="${esc(C.formatFtIn(row.kind === 'plan' ? st.height : st.length))}"></div></div>
        <div class="du-field"><label>Category</label><select id="di22-cat"><option value="">—</option>${DETAIL_CATS.map(x => `<option${x === row.category ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <button class="du-btn ghost" id="di22-meta">Save details</button><hr>
        <p class="du-muted">${regs} material layer${regs === 1 ? '' : 's'} · ${model.items.length} lines, shapes and dimensions · ${model.notes.length} notes</p>
        <p class="du-muted dw21-small">Draw layers with <b>Layer ▭</b> or <b>Layer shape</b> (any angle), or start from <b>Assemblies</b>. Switch to <b>3D hologram</b> to study it, then send it on below.</p>`;
    }
    function bindSide() {
      const on = (id, fn) => { const el = $q(side, id); if (el) el.onclick = fn; }, val = id => { const el = $q(side, id); return el ? el.value : ''; };
      on('#di22-del', removeSel);
      on('#di22-dup', () => change(() => { const r = clone(model.regions.find(x => x.id === sel.id)); r.id = rid('rg'); r.pts = r.pts.map(p => ({ x: p.x + 1, y: p.y + 1 })); model.regions.push(r); sel = { type: 'region', id: r.id }; }));
      on('#di22-front', () => change(() => { const i = model.regions.findIndex(x => x.id === sel.id); const [r] = model.regions.splice(i, 1); model.regions.push(r); }));
      on('#di22-back', () => change(() => { const i = model.regions.findIndex(x => x.id === sel.id); const [r] = model.regions.splice(i, 1); model.regions.unshift(r); }));
      on('#di22-dflip', () => change(() => { const it = model.items.find(x => x.id === sel.id); it.off = -(it.off || 0); }));
      const mt = $q(side, '#di22-mat'); if (mt) mt.onchange = () => change(() => { model.regions.find(x => x.id === sel.id).mat = mt.value; });
      on('#di22-apply', () => change(() => {
        if (sel.type === 'region') { const r = model.regions.find(x => x.id === sel.id); r.label = val('#di22-label').trim().toUpperCase() || undefined; if (!r.label) delete r.label; const dv = val('#di22-depth').trim(); if (dv) { const v = C.parseFtIn(dv); if (!(v > 0)) throw new Error('Enter a depth like 2\'-0", or leave it blank.'); r.depth = C.snap(v); } else delete r.depth; const rv = parseFloat(val('#di22-rot')); if (isFinite(rv) && rv) r.pts = rotPts(r.pts, centroid(r.pts), -rv).map(p => ({ x: C.snap(p.x), y: C.snap(p.y) })); }
        else if (sel.type === 'note') { const n = model.notes.find(x => x.id === sel.id); n.text = (val('#di22-ntext').trim() || 'NOTE').toUpperCase(); }
        else if (sel.type === 'item') { const it = model.items.find(x => x.id === sel.id); if (it.kind === 'text') it.text = (val('#di22-text').trim() || 'NOTE').toUpperCase(); const rv = parseFloat(val('#di22-irot')); if (isFinite(rv)) it.rot = rv; const wt = val('#di22-weight'); if (wt) it.weight = wt; const da = $q(side, '#di22-dash'); if (da) it.dash = da.checked; }
      }));
      on('#di22-meta', () => {
        const name = val('#di22-name').trim() || row.name, kind = val('#di22-kind') === 'plan' ? 'plan' : 'section', deep = C.parseFtIn(val('#di22-deep'));
        if (!(deep > 0 && deep <= 1200)) { toast(c, 'Enter a 3D depth like 2\'-0".', true); return; }
        row.name = name; $q(w, '#dd22-title').textContent = name; if (row.kind === 'plan') settings.height = C.snap(deep); else settings.length = C.snap(deep);
        row.kind = kind; row.category = val('#di22-cat') || null; render(); saveNow().then(() => toast(c, 'Detail saved.'));
      });
    }
    /* ---- toolbar */
    $$(w, '[data-dt]').forEach(b => b.onclick = () => { setTool(b.dataset.dt); sheet.focus(); });
    $q(w, '#dd22-undo').onclick = () => { const prev = undo.pop(); if (!prev) { toast(c, 'Nothing to undo.'); return; } model = normDetail(JSON.parse(prev)); sel = null; pts = []; render(); scheduleSave(); };
    const matSel = $q(w, '#dd22-mat'); matSel.value = prefs.mat; matSel.onchange = () => { prefs.mat = matSel.value; savePrefs(); if (sel && sel.type === 'region') change(() => { model.regions.find(x => x.id === sel.id).mat = matSel.value; }); };
    const syncAng = () => $$(w, '[data-ang]').forEach(b => { const on = +b.dataset.ang === prefs.angle; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    $$(w, '[data-ang]').forEach(b => b.onclick = () => { prefs.angle = +b.dataset.ang; savePrefs(); syncAng(); }); syncAng();
    const gridSel = $q(w, '#dd22-grid'); gridSel.value = String(prefs.grid); gridSel.onchange = () => { prefs.grid = +gridSel.value; savePrefs(); };
    $q(w, '#dd22-scale').onchange = e => { S = +e.target.value; render(); scheduleSave(); };
    $q(w, '#dd22-autonote').onclick = () => change(() => { const have = new Set(model.notes.map(n => n.text)); autoNotes(model, S).forEach(n => { if (!have.has(n.text)) model.notes.push(n); }); });
    $q(w, '#dd22-asm').onclick = () => newDialogInPlace();
    function newDialogInPlace() {
      newDialog(c, async created => {
        if (model.regions.length && !confirm('Replace this detail with the assembly? (Undo brings it back.)')) { await sb().from('draw_details').delete().eq('id', created.id); return; }
        const before = JSON.stringify(model); model = normDetail(created.model); row.kind = created.kind; settings = Object.assign(settings, created.settings || {}); undo.push(before);
        await sb().from('draw_details').delete().eq('id', created.id); render(); scheduleSave(); if (view === '3d') render3D();
      });
    }
    $q(w, '#dd22-mine').onclick = () => { history.replaceState(null, '', '#portal/draw?detail=list'); c.openPortalTab('draw'); };
    $q(w, '#dd22-plans').onclick = () => { history.replaceState(null, '', '#portal/draw'); c.openPortalTab('draw'); };
    $q(w, '#dd22-new-btn').onclick = () => newDialog(c, r => goDetail(c, r.id));
    /* ---- 3D */
    const cv = $q(w, '#dd22-cv'), real = $q(w, '#dd22-real'), realEmpty = $q(w, '#dd22-realempty');
    function render3D() {
      if (!holo) { holo = Holo(cv, { mode: renderMode === 'model' ? 'model' : 'holo' }); holo.onChange = legend; }
      holo.labels = $q(w, '#dd22-labels').getAttribute('aria-pressed') === 'true';
      holo.scene = build3D(model, row.kind, settings); holo.render(); legend();
    }
    let lastLegend = '';
    function legend() { const L = holo ? holo.legend : [], key = JSON.stringify(L); if (key === lastLegend) return; lastLegend = key; $q(w, '#dd22-legend').innerHTML = L.map(x => `<li><b>${x.n}</b><i style="--c:${matOf(x.mat).c3}"></i>${esc(x.label)}</li>`).join(''); }
    function setView(v) {
      view = v; store.set('dd22-view', v); $$(w, '[data-dv]').forEach(b => { b.classList.toggle('on', b.dataset.dv === v); b.setAttribute('aria-pressed', String(b.dataset.dv === v)); });
      sheet.hidden = v !== '2d'; $q(w, '#dd22-3d').hidden = v !== '3d'; w.querySelector('.dd22-editor').classList.toggle('dd22-in3d', v === '3d');
      if (v === '3d') { render3D(); setRenderMode(renderMode); } else render();
    }
    async function setRenderMode(mo) {
      renderMode = mo; $$(w, '[data-rm]').forEach(b => { b.classList.toggle('on', b.dataset.rm === mo); b.setAttribute('aria-pressed', String(b.dataset.rm === mo)); });
      const isReal = mo === 'real'; cv.hidden = isReal && !!row.render_path; real.hidden = !(isReal && row.render_path); realEmpty.hidden = !(isReal && !row.render_path);
      if (!isReal && holo) { holo.mode = mo; holo.render(); }
      if (isReal && row.render_path) { if (!realUrl) realUrl = await signedUrl(row.render_path); real.src = realUrl || ''; }
      if (isReal && !row.render_path) realEmpty.innerHTML = `<div><b>No realistic render yet.</b><p>DrawUp sends the Model view, from the angle you set, through Swap’s photoreal pipeline. 100 credits, refunded if it fails or runs past 2:00.</p><button type="button" class="du-btn primary" id="dd22-render2">Render realistic · Let’s Play</button></div>`;
      const r2 = $q(w, '#dd22-render2'); if (r2) r2.onclick = () => renderRealistic();
    }
    $$(w, '[data-dv]').forEach(b => b.onclick = () => setView(b.dataset.dv));
    $$(w, '[data-rm]').forEach(b => b.onclick = () => setRenderMode(b.dataset.rm));
    const tog = (id, fn) => { const b = $q(w, id); b.onclick = () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); fn(on); }; b.classList.toggle('on', b.getAttribute('aria-pressed') === 'true'); };
    tog('#dd22-spin', on => { if (holo) holo.setSpin(on); });
    tog('#dd22-labels', () => render3D());
    const cutB = $q(w, '#dd22-cut'); cutB.setAttribute('aria-pressed', String(settings.cutaway !== false)); tog('#dd22-cut', on => { settings.cutaway = on; render3D(); scheduleSave(); });
    const ex = $q(w, '#dd22-explode'); ex.value = settings.explode || 0; ex.oninput = () => { settings.explode = +ex.value; render3D(); }; ex.onchange = () => scheduleSave();
    $q(w, '#dd22-reset').onclick = () => { if (holo) { holo.cam = { yaw: -0.62, pitch: 0.42, zoom: 1 }; holo.render(); } };
    /* ---- send it on */
    const ctx = () => ({ c, row, get model() { return model; }, get settings() { return settings; }, get S() { return S; }, holo: () => holo, w, setRenderMode, showProgress: () => $q(w, '#dd22-prog'), saveNow, onRendered: () => { realUrl = null; if (view !== '3d') setView('3d'); setRenderMode('real'); } });
    $q(w, '#dd22-coach').onclick = () => askCoach(ctx());
    $q(w, '#dd22-upload').onclick = () => upload3D(ctx());
    const renderRealistic = () => { if (view !== '3d') setView('3d'); if (renderMode === 'real') setRenderMode('model'); renderReal(ctx()); };
    $q(w, '#dd22-render').onclick = renderRealistic;
    $$(w, '[data-x]').forEach(b => b.onclick = async () => {
      const base = (row.name || 'detail').replace(/[^\w.-]+/g, '-');
      try { if (b.dataset.x === 'svg') download(base + '.svg', sheetSVG(model, { scale: S, name: row.name, kind: row.kind, paperSize: true }).svg, 'image/svg+xml');
        else if (b.dataset.x === 'png') download(base + '.png', await canvasBlob(await sheetCanvas(model, { scale: S, name: row.name, kind: row.kind }, 2400)), 'image/png');
        else download(base + '-3d.png', await canvasBlob(snapshot3D(model, row.kind, settings, renderMode === 'model' ? 'model' : 'holo', 1600, 1000, holo ? holo.cam : null)), 'image/png'); }
      catch (e) { toast(c, e.message || String(e), true); }
    });
    window.DrawUpDraw22.editor = { get model() { return model; }, set model(v) { model = normDetail(v); render(); }, get row() { return row; }, get settings() { return settings; }, get holo() { return holo; }, render, setTool, setView, setRenderMode, saveNow, get sel() { return sel; }, set sel(v) { sel = v; render(); } };
    setTool('select'); setView(view); setSave('Saved');
  }

  const DETAIL_CATS = ['Wall Sections', 'Exterior Walls', 'Roofs', 'Foundations', 'Slabs', 'Doors', 'Windows', 'Storefront / Curtain Wall', 'Stairs', 'Railings', 'Restrooms / ADA', 'Millwork', 'Interiors', 'Ceilings', 'Structural', 'MEP Coordination', 'Site', 'Fire / Life Safety', 'Typical Details', 'Custom'];

  /* ============================================================ modal helper */
  function modal(id, html) {
    document.getElementById(id)?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="dd22-modal" id="${id}" role="dialog" aria-modal="true"><div class="dd22-mcard du-glass"><button type="button" class="dd22-close" aria-label="Close">×</button>${html}</div></div>`);
    const el = document.getElementById(id), onKey = e => { if (e.key === 'Escape') close(); }, close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
    $q(el, '.dd22-close').onclick = close; el.onclick = e => { if (e.target === el) close(); }; document.addEventListener('keydown', onKey);
    return { el, close };
  }

  /* ============================================================ Ask Arch Coach
   * One image (the 2D detail beside the 3D model view) plus a structured description, through
   * the existing Arch Coach endpoint and its image path (DrawUpV20.coachAsk shows the answer as
   * it streams, with the quick answer first when there is one).                              */
  async function coachImage(x) {
    const left = await sheetCanvas(x.model, { scale: x.S, name: x.row.name, kind: x.row.kind }, 900), H = Math.max(620, Math.min(1100, left.height));
    const right = snapshot3D(x.model, x.row.kind, x.settings, 'model', 820, H, x.holo && x.holo() ? x.holo().cam : null);
    // the 3D half carries its numbered tags; draw them on the model view too
    const h = Holo(right, { fixed: true, mode: 'model', labels: true, cam: x.holo && x.holo() ? x.holo().cam : null }); h.scene = build3D(x.model, x.row.kind, x.settings); h.render();
    const cv = document.createElement('canvas'); cv.width = 900 + 820 + 30; cv.height = H + 56; const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#0d1b2a'; g.font = '700 22px Helvetica, Arial, sans-serif'; g.fillText('DrawUp Draw · ' + x.row.name + ' · 2D detail (left) and 3D model (right)', 16, 34);
    const k = Math.min(1, H / left.height); g.drawImage(left, 0, 56, left.width * k, left.height * k); g.drawImage(right, 930, 56);
    return cv.toDataURL('image/jpeg', 0.88);
  }
  async function askCoach(x) {
    const m = normDetail(x.model);
    if (!m.regions.length && !m.items.length) { toast(x.c, 'Draw something first: a material layer, a line or a note.', true); return; }
    const M = modal('dd22-coachdlg', `<span class="du-kicker">ARCH COACH · DETAIL REVIEW</span><h2>Ask Arch Coach about this detail</h2>
      <div class="dd22-coachgrid"><figure class="dd22-coachimg"><img id="dd22-cimg" alt="Image sent to Arch Coach"><figcaption>Sent as one image with the description below.</figcaption></figure>
      <div><div class="dd22-field"><label for="dd22-q">Your question</label><textarea id="dd22-q" rows="4">Review this detail. Check the layer order, water and air barrier continuity, flashing and drainage, insulation continuity and thermal bridges, and tell me what I must verify for my project.</textarea></div>
      <details class="dd22-desc"><summary>Description sent with the image</summary><pre id="dd22-desc"></pre></details>
      <button type="button" class="du-btn primary" id="dd22-ask">Ask Arch Coach</button></div></div>
      <div class="dd22-coachstage" id="dd22-cstage" aria-live="polite"></div>`);
    const desc = describe(x.row, m); $q(M.el, '#dd22-desc').textContent = desc;
    let img = ''; try { img = await coachImage(x); $q(M.el, '#dd22-cimg').src = img; } catch (e) { toast(x.c, 'The image could not be made: ' + e.message, true); }
    $q(M.el, '#dd22-ask').onclick = async () => {
      const btn = $q(M.el, '#dd22-ask'), stage = $q(M.el, '#dd22-cstage'), q = $q(M.el, '#dd22-q').value.trim() || 'Review this detail.';
      const V20 = window.DrawUpV20; if (!V20 || !V20.coachAsk) { toast(x.c, 'Arch Coach is not loaded on this page.', true); return; }
      btn.disabled = true; stage.innerHTML = '';
      try {
        const message = q + '\n\n' + desc + '\n\nThe attached image shows this detail: the 2D drawing on the left and a 3D model of it on the right (numbered tags match the layers).';
        const d = await V20.coachAsk({ token: await token(), stage, label: 'Reading your detail…', message, history: [], image: img });
        stage.querySelectorAll('.du-holo-load').forEach(el => el.remove());
        const src = (d.sources || []).filter(s => s && /^https:\/\//.test(s.url || '')).slice(0, 6);
        stage.insertAdjacentHTML('beforeend', `<article class="dd22-answer"><span class="du-kicker">ARCH COACH${d.partial ? ' · PARTIAL' : ''}</span><div class="dd22-atext"></div>${src.length ? `<h4>Sources</h4><ul>${src.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.url)}</a></li>`).join('')}</ul>` : ''}${d.notice ? `<p class="du-muted">${esc(d.notice)}</p>` : ''}<p class="du-muted dw21-small">Guidance only. The licensed professional of record and the AHJ make final determinations.</p></article>`);
        stage.querySelector('.dd22-atext').textContent = d.answer || 'Arch Coach is still finishing; you will get a notification when the full answer is saved.';
      } catch (e) { stage.querySelectorAll('.du-holo-load').forEach(el => el.remove()); stage.insertAdjacentHTML('beforeend', `<p class="du-draw-warn">${esc(e.message || e)}</p>`); }
      finally { btn.disabled = false; }
    };
  }

  /* ============================================================ Upload to 3D (Detail Library + Playbook) */
  async function snapshots(x, uid) {
    const cam = x.holo && x.holo() ? x.holo().cam : null;
    const holoBlob = await canvasBlob(snapshot3D(x.model, x.row.kind, x.settings, 'holo', 960, 640, cam)), modelBlob = await canvasBlob(snapshot3D(x.model, x.row.kind, x.settings, 'model', 1280, 860, cam));
    const base = `${uid}/draw-details/${x.row.id}/`, up = async (name, blob) => { const r = await sb().storage.from(BUCKET).upload(base + name, blob, { contentType: 'image/png', upsert: true }); if (r.error) throw r.error; return base + name; };
    return { holo_path: await up('holo.png', holoBlob), model_path: await up('model.png', modelBlob), modelBlob };
  }
  function upload3D(x) {
    const r = x.row;
    const M = modal('dd22-updlg', `<span class="du-kicker">UPLOAD TO 3D</span><h2>Put this detail in the 3D tabs</h2><p class="du-muted">Saved to your account (private to you). It shows in the 3D tab of the Detail Library and of the Playbook, where you can turn it, flip to the realistic render and ask Arch Coach.</p>
      <label class="dd22-chk"><input type="checkbox" id="dd22-lib"${r.in_library || !(r.in_library || r.in_playbook) ? ' checked' : ''}> Detail Library · 3D tab</label><label class="dd22-chk"><input type="checkbox" id="dd22-pb"${r.in_playbook || !(r.in_library || r.in_playbook) ? ' checked' : ''}> Playbook · 3D tab</label>
      <div class="dd22-field"><label for="dd22-ucat">Category</label><select id="dd22-ucat">${DETAIL_CATS.map(cat => `<option${cat === (r.category || (r.kind === 'plan' ? 'Exterior Walls' : 'Wall Sections')) ? ' selected' : ''}>${esc(cat)}</option>`).join('')}</select></div>
      <button type="button" class="du-btn primary" id="dd22-usave">Upload to 3D</button><p class="dd22-note" id="dd22-ust" aria-live="polite"></p>`);
    $q(M.el, '#dd22-usave').onclick = async () => {
      const st = $q(M.el, '#dd22-ust'), b = $q(M.el, '#dd22-usave'); b.disabled = true; st.textContent = 'Saving the hologram and model views…';
      try {
        await x.saveNow(); const u = x.c.user || await sessionUser(); const s = await snapshots(x, u.id);
        const lib = $q(M.el, '#dd22-lib').checked, pb = $q(M.el, '#dd22-pb').checked, cat = $q(M.el, '#dd22-ucat').value;
        const { error } = await sb().from('draw_details').update({ in_library: lib, in_playbook: pb, category: cat, holo_path: s.holo_path, model_path: s.model_path, updated_at: new Date().toISOString() }).eq('id', r.id).eq('owner_id', u.id);
        if (error) throw error; Object.assign(r, { in_library: lib, in_playbook: pb, category: cat, holo_path: s.holo_path, model_path: s.model_path });
        st.innerHTML = `Uploaded.${lib ? ' <a href="#portal/details" data-go="lib">Open the Detail Library 3D tab</a>' : ''}${pb ? ' · <a href="#portal/arch-coach?pb=3d" data-go="pb">Open the Playbook 3D tab</a>' : ''}`;
        $$(st, '[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); M.close(); if (a.dataset.go === 'lib') { store.set('dd22-libtab', '3d'); window.DrawUpPortal?.openPortalTab?.('details'); } else window.DrawUpPlaybook?.open?.('pb=3d'); });
        toast(x.c, 'Uploaded to 3D.');
      } catch (e) { st.textContent = 'Not uploaded — ' + (e.message || e); }
      finally { b.disabled = false; }
    };
  }

  /* ============================================================ Realistic render (Swap photoreal, the Let's Play pipeline)
   * Reuses /api/swap: the Model view is uploaded to the member's private swap folder, a Swap
   * thread + generation (swap_type photoreal, source_kind model) is created like the Swap tab
   * does, then POST starts it and GET polls it. Progress shows each step as it arrives; the
   * endpoint returns the finished image only (no partial frames).                            */
  function promptFor(x) {
    const m = normDetail(x.model), mats = [...new Set(m.regions.filter(r => r.mat !== 'air').map(r => regionLabel(r).toLowerCase()))].slice(0, 14);
    return (`Photorealistic cutaway mock-up of a construction ${x.row.kind === 'plan' ? 'plan' : 'wall section'} detail, "${x.row.name}", like a physical sample built for a studio display. `
      + `Keep every layer exactly where it is, at the same thickness, with the same stepped cutaway, camera and framing. Give each layer its real material: ${mats.join('; ')}. `
      + 'Real textures (concrete aggregate, brick and mortar, wood grain, fibrous batt insulation, foil-faced or extruded foam board, gypsum paper face, membranes). Clean neutral studio backdrop, soft daylight from the upper left, gentle contact shadow. No text, no labels, no people.').slice(0, 1900);
  }
  async function renderReal(x) {
    const m = normDetail(x.model); if (!m.regions.length) { toast(x.c, 'Draw at least one material layer first.', true); return; }
    if (!confirm('Render a realistic view? It runs through DrawUp Swap (photoreal) and uses 100 credits, refunded if it fails or runs past 2:00.')) return;
    const box = x.showProgress(), steps = [['up', 'Saving the model view'], ['thread', 'Opening a Swap thread'], ['start', 'Starting the photoreal render'], ['gen', 'Rendering on the court'], ['save', 'Saving the result']];
    let stopId = null, t0 = Date.now(), timer = 0, stopped = false;
    const paint = (cur, msg, bad) => { box.hidden = false; box.innerHTML = `<div class="dd22-progcard"><b>Realistic render · Let’s Play</b><ol>${steps.map(([k, l], i) => { const ci = steps.findIndex(s => s[0] === cur), state = cur === 'done' || i < ci ? 'done' : i === ci ? (bad ? 'bad' : 'now') : ''; return `<li class="${state}">${esc(l)}${state === 'now' && k === 'gen' ? ` <span class="dd22-clock">${fmt((Date.now() - t0) / 1000)} of 2:00</span>` : ''}</li>`; }).join('')}</ol>${msg ? `<p class="${bad ? 'du-draw-warn' : 'du-muted'}">${esc(msg)}</p>` : ''}<div class="dw21-btnrow">${cur === 'gen' ? '<button type="button" class="du-btn ghost" id="dd22-stop">Stop (refund)</button>' : ''}${cur === 'done' || bad ? '<button type="button" class="du-btn ghost" id="dd22-pclose">Close</button>' : ''}</div></div>`;
      const sb2 = $q(box, '#dd22-stop'); if (sb2) sb2.onclick = async () => { stopped = true; try { await apiCall('/api/swap', { method: 'POST', body: JSON.stringify({ generation_id: stopId, action: 'stop' }) }); } catch (_e) { /* */ } };
      const cl = $q(box, '#dd22-pclose'); if (cl) cl.onclick = () => { box.hidden = true; }; };
    const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    try {
      paint('up'); await x.saveNow();
      const u = x.c.user || await sessionUser(), uid = u.id, cam = x.holo && x.holo() ? x.holo().cam : null;
      const blob = await canvasBlob(snapshot3D(x.model, x.row.kind, x.settings, 'model', 1280, 860, cam)), src = `${uid}/swap/${uuid()}.png`;
      const up = await sb().storage.from(BUCKET).upload(src, blob, { contentType: 'image/png' }); if (up.error) throw up.error;
      paint('thread'); const prompt = promptFor(x);
      let threadId = x.row.swap_thread_id;
      if (threadId) { const { data } = await sb().from('swap_threads').select('id').eq('id', threadId).maybeSingle(); if (!data) threadId = null; }
      if (!threadId) { const r = await sb().from('swap_threads').insert({ owner_id: uid, source_path: src, title: ('3D detail: ' + x.row.name).slice(0, 60) }).select('id').single(); if (r.error) throw r.error; threadId = r.data.id; }
      await sb().from('swap_messages').insert({ thread_id: threadId, owner_id: uid, role: 'user', body: 'Realistic render of my 3D detail (DrawUp Draw)', image_path: src });
      const id = uuid(); stopId = id;
      const ins = await sb().from('swap_generations').insert({ id, owner_id: uid, source_path: src, swap_type: 'photoreal', prompt, thread_id: threadId }).select('id').single(); if (ins.error) throw ins.error;
      await sb().from('swap_messages').insert({ thread_id: threadId, owner_id: uid, role: 'assistant', body: '', generation_id: id });
      await sb().from('swap_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
      paint('start'); t0 = Date.now();
      let g = (await apiCall('/api/swap', { method: 'POST', body: JSON.stringify({ generation_id: id, options: { source_kind: 'model', people: null } }) })).generation;
      document.dispatchEvent(new Event('du-credits'));
      paint('gen', 'Queued. DrawUp shows each step as the server reports it; the image arrives when it is finished.'); timer = setInterval(() => { const ck = $q(box, '.dd22-clock'); if (ck) ck.textContent = fmt((Date.now() - t0) / 1000) + ' of 2:00'; }, 500);
      while (g && (g.status === 'generating' || g.status === 'queued')) { await sleep(1500); const d = await apiCall('/api/swap?id=' + id); g = d.generation; if (g && g.status === 'generating') paint('gen', d.warning ? 'Still rendering (' + d.warning + ')' : 'Still rendering…'); if (stopped && g && g.status === 'generating') paint('gen', 'Stopping…'); }
      clearInterval(timer);
      if (!g || g.status !== 'complete') throw new Error((g && g.error) || 'The render did not finish.');
      paint('save'); const { error } = await sb().from('draw_details').update({ render_path: g.result_path, swap_generation_id: id, swap_thread_id: threadId, updated_at: new Date().toISOString() }).eq('id', x.row.id).eq('owner_id', uid); if (error) throw error;
      Object.assign(x.row, { render_path: g.result_path, swap_generation_id: id, swap_thread_id: threadId });
      paint('done', 'Done in ' + fmt((Date.now() - t0) / 1000) + '. Flip between Hologram, Model and Realistic above. It is also in your Swap threads.');
      x.onRendered();
    } catch (e) { clearInterval(timer); paint(steps[0][0], (e.message || String(e)), true); }
  }

  /* ============================================================ 3D viewer (Detail Library + Playbook tabs) */
  async function viewer(rowId) {
    const { data: r, error } = await sb().from('draw_details').select(SEL_COLS).eq('id', rowId).maybeSingle(); if (error || !r) { toast(null, 'That detail could not be opened.', true); return; }
    const M = modal('dd22-viewer', `<span class="du-kicker">3D DETAIL · ${r.kind === 'plan' ? 'PLAN' : 'SECTION'}${r.category ? ' · ' + esc(r.category.toUpperCase()) : ''}</span><h2>${esc(r.name)}</h2>
      <div class="dd22-vstage"><canvas id="dd22-vcv" tabindex="0" aria-label="3D hologram. Drag to turn, pinch or scroll to zoom."></canvas><img id="dd22-vimg" alt="Realistic render" hidden><div class="dd22-realempty" id="dd22-vempty" hidden><div><b>No realistic render yet.</b><p>Open it in Draw and press Render realistic.</p></div></div></div>
      <div class="dd22-3dbar"><div class="dw21-seg" role="group" aria-label="3D style"><button type="button" data-vm="holo" class="on">Hologram</button><button type="button" data-vm="model">Model</button><button type="button" data-vm="real">Realistic</button></div><button type="button" class="dw21-btn" id="dd22-vspin" aria-pressed="false">Spin</button><label class="dd22-range">Explode <input type="range" id="dd22-vex" min="0" max="1" step="0.05" value="${r.settings?.explode || 0}"></label></div>
      <ol class="dd22-legend" id="dd22-vleg"></ol><div class="dw21-btnrow"><button type="button" class="du-btn primary" id="dd22-vopen">Open in Draw</button><button type="button" class="du-btn ghost" id="dd22-vcoach">Ask Arch Coach</button></div>`);
    M.el.classList.add('dd22-viewermodal');
    const cv = $q(M.el, '#dd22-vcv'), h = Holo(cv, { mode: 'holo' }), st = Object.assign({}, r.settings || {});
    const draw = () => { h.scene = build3D(r.model, r.kind, st); h.render(); $q(M.el, '#dd22-vleg').innerHTML = h.legend.map(x => `<li><b>${x.n}</b><i style="--c:${matOf(x.mat).c3}"></i>${esc(x.label)}</li>`).join(''); };
    requestAnimationFrame(draw);
    $$(M.el, '[data-vm]').forEach(b => b.onclick = async () => { $$(M.el, '[data-vm]').forEach(x => x.classList.toggle('on', x === b)); const real = b.dataset.vm === 'real'; cv.hidden = real && !!r.render_path; $q(M.el, '#dd22-vimg').hidden = !(real && r.render_path); $q(M.el, '#dd22-vempty').hidden = !(real && !r.render_path); if (real && r.render_path) $q(M.el, '#dd22-vimg').src = await signedUrl(r.render_path) || ''; if (!real) { h.mode = b.dataset.vm; h.render(); } });
    $q(M.el, '#dd22-vspin').onclick = e => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(on)); e.currentTarget.classList.toggle('on', on); h.setSpin(on); };
    $q(M.el, '#dd22-vex').oninput = e => { st.explode = +e.target.value; draw(); };
    $q(M.el, '#dd22-vopen').onclick = () => { h.destroy(); M.close(); history.replaceState(null, '', '#portal/draw?detail=' + r.id); window.DrawUpPortal?.openPortalTab?.('draw'); };
    $q(M.el, '#dd22-vcoach').onclick = () => askCoach({ c: null, row: r, model: r.model, settings: st, S: r.scale_denominator || 8, holo: () => h });
    const obs = new MutationObserver(() => { if (!M.el.isConnected) { h.destroy(); obs.disconnect(); } }); obs.observe(document.body, { childList: true });
  }
  async function cards3D(host, flag, opts) {
    opts = opts || {}; const u = await sessionUser();
    if (!u) { host.innerHTML = `<div class="dd22-tabempty"><h3>Sign in to see your 3D details.</h3><p>3D details are private to the member who drew them.</p></div>`; return; }
    host.innerHTML = '<div class="du-loading">LOADING 3D DETAILS…</div>';
    const { data: rows, error } = await sb().from('draw_details').select(SEL_COLS).eq('owner_id', u.id).eq(flag, true).order('updated_at', { ascending: false }).limit(60);
    if (error) { host.innerHTML = `<p class="du-draw-warn">${esc(error.message)}</p>`; return; }
    const intro = opts.intro || '';
    host.innerHTML = `<div class="dd22-tab">${intro}<div class="dd22-tabhead"><p>${(rows || []).length} 3D detail${(rows || []).length === 1 ? '' : 's'} · private to you</p><button type="button" class="du-btn primary" data-dd22-new>Draw a detail</button></div>
      ${(rows || []).length ? `<div class="dd22-grid">${rows.map(r => `<article class="dd22-card" data-view3d="${r.id}"><canvas width="480" height="300" data-thumb="${r.id}" aria-hidden="true"></canvas><div><span class="dd22-kick">${r.kind === 'plan' ? 'PLAN' : 'SECTION'}${r.category ? ' · ' + esc(r.category.toUpperCase()) : ''}${r.render_path ? ' · REALISTIC' : ''}</span><h3>${esc(r.name)}</h3><small>${new Date(r.updated_at).toLocaleDateString()}</small></div><div class="dd22-acts"><button type="button" class="du-btn primary" data-view3d="${r.id}">View in 3D</button><button type="button" class="du-btn ghost" data-open3d="${r.id}">Open in Draw</button><button type="button" class="du-btn ghost" data-unpub="${r.id}">Remove</button></div></article>`).join('')}</div>`
        : `<div class="dd22-tabempty"><h3>No 3D details here yet.</h3><p>In Draw, draw a plan or section detail, switch to 3D hologram and press <b>Upload to 3D</b>.</p></div>`}</div>`;
    (rows || []).forEach(r => { const cv = $q(host, `[data-thumb="${r.id}"]`); if (cv) { const h = Holo(cv, { fixed: true, mode: 'holo', labels: false }); h.scene = build3D(r.model, r.kind, r.settings); h.render(); } });
    $$(host, 'button[data-view3d]').forEach(b => b.onclick = e => { e.stopPropagation(); viewer(b.dataset.view3d); });
    $$(host, 'article[data-view3d] canvas').forEach(cv => cv.onclick = () => viewer(cv.closest('[data-view3d]').dataset.view3d));
    $$(host, '[data-open3d]').forEach(b => b.onclick = e => { e.stopPropagation(); history.replaceState(null, '', '#portal/draw?detail=' + b.dataset.open3d); window.DrawUpPortal?.openPortalTab?.('draw'); });
    $$(host, '[data-unpub]').forEach(b => b.onclick = async e => { e.stopPropagation(); const { error: e2 } = await sb().from('draw_details').update({ [flag]: false }).eq('id', b.dataset.unpub).eq('owner_id', u.id); if (e2) { toast(null, e2.message, true); return; } cards3D(host, flag, opts); });
    $$(host, '[data-dd22-new]').forEach(b => b.onclick = () => { history.replaceState(null, '', '#portal/draw?detail=list'); window.DrawUpPortal?.openPortalTab?.('draw'); });
  }
  /* Four library views. Existing catalog/search/downloads are untouched. */
  function detailsTab(host, o) {
    if (o && o.publicPage) return;
    if (!host || host.querySelector('.dd22-libtabs')) return;
    const head = host.querySelector('.dd21-head'); if (!head) return;
    head.insertAdjacentHTML('afterend', `<div class="dd22-libtabs" role="tablist" aria-label="Detail Library views"><button type="button" role="tab" data-lt="2d">DrawUp 2D</button><button type="button" role="tab" data-lt="public3d">DrawUp 3D</button><button type="button" role="tab" data-lt="mine">My 3D</button><button type="button" role="tab" data-lt="firm">Firm</button></div><div class="dd22-libpane" id="dd22-libpane" hidden></div>`);
    const pane = host.querySelector('#dd22-libpane');
    const libEls = () => ['.dd21-disc', '.dd21-filters', '.dd21-chips', '#dd21-count', '#dd21-results'].map(s => host.querySelector(s)).filter(Boolean);
    const catalog = () => window.DrawUpDetailCatalog || [];
    function public3D() {
      const list = catalog();
      pane.innerHTML = `<section class="dd22-public3d"><h2>DrawUp 3D · Public assembly library</h2><p>Individual, proportionate educational assembly illustrations. Select a detail to view its 3D hologram beside the actual 2D technical drawing. Illustrations are not to scale and are not construction documents.</p><div class="dd22-3d-filters"><input type="search" aria-label="Search 3D details" placeholder="Search roof, parapet, wall section…" data-p3-search><select aria-label="Category" data-p3-cat><option value="">All categories</option>${[...new Set(list.map(x=>x.cat))].map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></div><div id="dd23-selected"></div><div class="dd22-grid" id="dd22-p3-grid"></div></section>`;
      const grid = pane.querySelector('#dd22-p3-grid'), selected=pane.querySelector('#dd23-selected');
      const imageUrl=d=>'/drawup-holograms/'+encodeURIComponent(d.code)+'.svg';
      const show=d=>{
        if(!d)return;
        selected.innerHTML=`<div class="dd23-detail"><div class="dd23-detail-head"><span>${esc(d.code)} · ${esc(d.cat)}</span><h3>${esc(d.title)}</h3></div><div class="dd23-side-by-side"><figure><figcaption>3D HOLOGRAM · EDUCATIONAL / NOT TO SCALE</figcaption><img src="${imageUrl(d)}" alt="Individual 3D assembly illustration for ${esc(d.title)}" loading="eager"></figure><figure><figcaption>2D TECHNICAL DETAIL · REFERENCE</figcaption><img src="${window.DrawUpDetails.urlOf(d)}" alt="Original 2D construction drawing for ${esc(d.title)}" loading="eager"></figure></div><div class="dd23-detail-actions"><button type="button" class="du-btn ghost" data-ref="${esc(d.id)}">Open original 2D detail</button><a class="du-btn ghost" href="${imageUrl(d)}" download="${esc(d.code)}-3D-hologram.svg">Download individual 3D illustration</a></div></div>`;
        selected.querySelector('[data-ref]').onclick=()=>window.DrawUpDetails.viewer(d.id);
        selected.scrollIntoView({behavior:'smooth',block:'nearest'});
      };
      const paint=()=>{
        const q=pane.querySelector('[data-p3-search]').value.toLowerCase().trim(),cat=pane.querySelector('[data-p3-cat]').value;
        const matches=list.filter(d=>(!cat||d.cat===cat)&&(!q||[d.title,d.code,d.cat,d.mat,d.asm].join(' ').toLowerCase().includes(q)));
        grid.innerHTML=matches.map(d=>`<article class="dd22-card dd23-assembly-card"><div class="dd22-refimg"><img src="${imageUrl(d)}" alt="3D hologram for ${esc(d.title)}" loading="lazy"></div><div><span class="dd22-kick">${esc(d.code)} · ${esc(d.cat)}</span><h3>${esc(d.title)}</h3><small>Individual 3D educational illustration</small></div><div class="dd22-acts"><button type="button" class="du-btn ghost" data-show3d="${esc(d.code)}">View 3D + 2D</button></div></article>`).join('')||'<p>No matching details.</p>';
        grid.querySelectorAll('[data-show3d]').forEach(btn=>btn.onclick=()=>show(list.find(d=>d.code===btn.dataset.show3d)));
        if(!selected.querySelector('.dd23-detail')&&matches.length)show(matches[0]);
      };
      pane.querySelector('[data-p3-search]').oninput=paint;
      pane.querySelector('[data-p3-cat]').onchange=paint;
      paint();
    }
    function firmView() {
      pane.innerHTML = `<section class="dd22-public3d"><h2>Firm · Authorized libraries</h2><p>Firm-owned details are governed by each firm’s access rules. This view does not expose private files from former employers without explicit authorization.</p><div id="dd22-firm-list" class="dd22-grid"></div></section>`;
      const box=pane.querySelector('#dd22-firm-list');
      const client=window.drawupSupabaseClient;
      if (!client) {box.textContent='Sign in to browse firm libraries.';return;}
      (async()=>{
        const {data:{user}}=await client.auth.getUser();
        if(!user){box.textContent='Sign in to browse your authorized firm libraries.';return;}
        // Only firm details whose visibility is granted by Supabase RLS can be returned.
        const {data,error}=await client.from('details').select('id,title,category,description,firm_id,firms(name),detail_assets(file_name,file_ext,public_url)').not('firm_id','is',null).eq('status','published').order('created_at',{ascending:false}).limit(150);
        if(!pane.isConnected)return;
        if(error){box.textContent='Firm library unavailable: '+error.message;return;}
        box.innerHTML=(data||[]).length?(data||[]).map(d=>`<article class="dd22-card"><div><span class="dd22-kick">${esc(d.firms?.name||'Firm')} · ${esc(d.category||'Detail')}</span><h3>${esc(d.title)}</h3><small>${esc(d.description||'Firm detail')}</small></div><div class="dd22-acts">${(d.detail_assets||[]).filter(a=>a.public_url).map(a=>`<a class="du-btn ghost" href="${esc(a.public_url)}" target="_blank" rel="noopener noreferrer">${esc(a.file_ext||'File')}</a>`).join('')}</div></article>`).join(''):'<p>No firm details are currently accessible to this account.</p>';
      })().catch(e=>{box.textContent='Firm library could not load: '+e.message;});
    }
    const set = t => {
      if(!['2d','public3d','mine','firm'].includes(t))t='2d';
      store.set('dd22-libtab',t);
      $$(host,'[data-lt]').forEach(b=>{b.classList.toggle('on',b.dataset.lt===t);b.setAttribute('aria-selected',String(b.dataset.lt===t));});
      libEls().forEach(el=>{el.hidden=t!=='2d';});pane.hidden=t==='2d';
      if(t==='public3d')public3D();else if(t==='mine')cards3D(pane,'in_library',{intro:'<p class="dd22-tabintro">Your personal interactive hologram models. Rotate, explode, and study your uploaded assemblies.</p>'});else if(t==='firm')firmView();
    };
    $$(host,'[data-lt]').forEach(b=>b.onclick=()=>set(b.dataset.lt));
    const saved=store.get('dd22-libtab','2d');set(saved==='lib'?'2d':saved==='3d'?'mine':saved);
  }
  (window.DrawUpDetailTabs = window.DrawUpDetailTabs || []).push(detailsTab);
  /* Playbook hook: a "3D" hub tab (#portal/arch-coach?pb=3d). */
  (window.DrawUpPlaybookTabs = window.DrawUpPlaybookTabs || []).push({ q: 'pb=3d', name: '3D', render: root => { const box = document.createElement('div'); box.className = 'dd22-pbtab'; root.appendChild(box); cards3D(box, 'in_playbook', { intro: '<article class="pb-card dd22-pbintro"><span class="du-kicker">3D STUDY</span><p>Study details as 3D holograms at an easier view: turn them, step the layers apart, and flip to a realistic render. Upload yours from Draw.</p></article>' }); } });

  /* ============================================================ plan editor: Shapes tool (plan + elevation / section views) */
  const SHAPE_KINDS = [['line', 'Line'], ['polyline', 'Polyline'], ['arc', 'Arc (3 points)'], ['circle', 'Circle'], ['rect', 'Rectangle'], ['polygon', 'Polygon'], ['curve', 'Curve']];
  function extend(api, e21) {
    const C = api.D, E = window.DrawUpElev, w = api.w, c = api.c;
    const opt = Object.assign({ kind: 'line', weight: 'medium', dash: false, sides: 6 }, store.get('du22-shape', {}));
    let pts = [], viewHover = null, viewSel = null; const snapObj = () => (e21 && e21.snap) || {};
    const saveOpt = () => store.set('du22-shape', opt);
    const inView = () => e21 && e21.mode && e21.mode !== 'plan';
    const selCam = () => (api.sel && api.sel.type === 'camera' ? (api.model.cameras || []).find(x => x.id === api.sel.id) : null);
    const change = fn => { const before = JSON.stringify(api.model); try { fn(); } catch (e) { api.model = C.normalizeModel(JSON.parse(before)); c.toast(e.message || String(e), true); api.render(); return false; } api.pushUndo(before); api.render(); api.scheduleSave(); return true; };
    // button to the detail tool in the V21 row
    const row = $q(w, '.dw21-row'); if (row && !$q(row, '#dw22-details')) $q(row, '#dw21-markup')?.insertAdjacentHTML('beforebegin', '<button type="button" class="dw21-btn" id="dw22-details" title="Draw plan and section details and study them as 3D holograms">Details · 3D</button>');
    const db = $q(w, '#dw22-details'); if (db) db.onclick = () => { history.replaceState(null, '', '#portal/draw?detail=list'); c.openPortalTab('draw'); };
    /** Finishes the shape from world (or view) points and returns the new item. */
    function makeItem(P) {
      const k = opt.kind, x = { weight: opt.weight, dash: opt.dash };
      if (k === 'circle') return C.makeShape('circle', P, x);
      if (k === 'polygon') return C.makeShape('polygon', C.regularPolygon(P[0], Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y), Math.atan2(P[1].y - P[0].y, P[1].x - P[0].x), opt.sides || 6), x);
      if (k === 'rect') { const a = P[0], b = P[1]; return C.makeShape('rect', [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }], x); }
      return C.makeShape(k, P, x);
    }
    const need = () => ({ line: 2, arc: 3, circle: 2, rect: 2, polygon: 2 })[opt.kind] || 0; // 0 = until Enter / double-click
    function addPoint(p, toView) {
      const L = pts[pts.length - 1]; if (L && Math.hypot(p.x - L.x, p.y - L.y) < 0.05) return;
      pts.push({ x: p.x, y: p.y });
      if (opt.kind === 'line' && pts.length === 2) { const P = pts.slice(); commit(P, toView); pts = [P[1]]; if (!toView) api.pending = P[1]; return; }
      if (need() && pts.length >= need()) { const P = pts.slice(); pts = []; if (!toView) { api.pending = null; api.hover = null; } commit(P, toView); return; }
      if (!toView) api.pending = pts[pts.length - 1];
    }
    function commit(P, toView) {
      const it = makeItem(P); if (!it) { c.toast('Pick two different points.', true); return; }
      if (toView) { const cam = selCam(); if (!cam) return; change(() => { cam.shapes = Array.isArray(cam.shapes) ? cam.shapes : []; cam.shapes.push(it); }); }
      else change(() => { api.model.items = api.model.items || []; api.model.items.push(it); api.sel = { type: 'item', id: it.id }; });
    }
    function finish(toView) {
      const P = pts.slice(); pts = []; if (!toView) { api.pending = null; api.hover = null; }
      if ((opt.kind === 'polyline' && P.length >= 2) || (opt.kind === 'curve' && P.length >= 3)) commit(P, toView); else api.render();
    }
    function preview(svg, from, hov, k) {
      if (!svg || !pts.length || !hov) return; const P = pts.concat([hov]), NS = 'http://www.w3.org/2000/svg';
      let L = P;
      if (opt.kind === 'arc' && P.length === 3) L = C.arcPoints(P[0], P[1], P[2]);
      else if (opt.kind === 'curve' && P.length >= 3) L = C.curvePoints(P, false);
      else if (opt.kind === 'circle') L = C.shapeLines(C.makeShape('circle', P) || { at: P[0], pts: [], shape: 'line' })[0] || P;
      else if (opt.kind === 'polygon' || opt.kind === 'rect') { const it = makeItem(P); L = it ? C.shapeLines(it)[0] : P; }
      const e = document.createElementNS(NS, 'polyline'); e.setAttribute('points', L.map(p => p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(' ')); e.setAttribute('fill', 'none'); e.setAttribute('stroke', '#1b8cff'); e.setAttribute('stroke-width', String(k * 0.02)); e.setAttribute('stroke-dasharray', `${k * 0.06} ${k * 0.04}`); e.setAttribute('class', 'dw22-preview'); svg.appendChild(e);
    }
    /* ---- elevation / section views: shapes are drawn on the view and kept on its camera */
    const vbox = $q(w, '#dw21-view-svg');
    const viewPt = ev => { const s = vbox && vbox.querySelector('svg'); if (!s) return null; const q = s.createSVGPoint(); q.x = ev.clientX; q.y = ev.clientY; const r = q.matrixTransform(s.getScreenCTM().inverse()); return { x: r.x, y: r.y }; };
    function viewSnap(p, from, free) {
      const S = snapObj(), gs = S.grid === false ? 0.125 : 1; let q = { x: C.snap(p.x, gs), y: C.snap(p.y, gs) };
      if (from && !free) { if (S.ortho !== false) { if (Math.abs(q.x - from.x) < Math.abs(q.y - from.y)) q.x = from.x; else q.y = from.y; } else if (S.angle > 0) { const st = S.angle * Math.PI / 180, a = Math.round(Math.atan2(p.y - from.y, p.x - from.x) / st) * st, L = C.snap(Math.hypot(p.x - from.x, p.y - from.y), gs); q = { x: C.snap(from.x + Math.cos(a) * L), y: C.snap(from.y + Math.sin(a) * L) }; } }
      return q;
    }
    if (vbox) {
      vbox.addEventListener('click', ev => {
        if (!inView()) return;
        if (api.tool === 'shape') { const p = viewPt(ev); if (!p) return; addPoint(viewSnap(p, pts[pts.length - 1], ev.shiftKey), true); api.render(); return; }
        if (api.tool === 'select') { const el = ev.target.closest && ev.target.closest('[data-shape]'); viewSel = el ? el.dataset.shape : null; api.render(); }
      });
      vbox.addEventListener('dblclick', ev => { if (inView() && api.tool === 'shape') { ev.preventDefault(); const P = []; pts.forEach(p => { if (!P.length || Math.hypot(P[P.length - 1].x - p.x, P[P.length - 1].y - p.y) > 0.05) P.push(p); }); pts = P; finish(true); } });
      vbox.addEventListener('pointermove', ev => { if (!inView() || api.tool !== 'shape' || !pts.length) return; const p = viewPt(ev); if (!p) return; viewHover = viewSnap(p, pts[pts.length - 1], ev.shiftKey); const s = vbox.querySelector('svg'); s.querySelectorAll('.dw22-preview').forEach(e => e.remove()); preview(s, pts[pts.length - 1], viewHover, api.scale); });
      vbox.tabIndex = 0;
      vbox.addEventListener('keydown', ev => { if (!inView()) return; if (api.tool === 'shape' && (ev.key === 'Enter' || ev.key === 'Escape')) { ev.preventDefault(); finish(true); } if (api.tool === 'select' && viewSel && (ev.key === 'Delete' || ev.key === 'Backspace')) { ev.preventDefault(); delViewShape(); } });
    }
    function delViewShape() { const cam = selCam(); if (!cam || !viewSel) return; const id = viewSel; viewSel = null; change(() => { cam.shapes = (cam.shapes || []).filter(s => s.id !== id); }); }
    /* ---- hooks */
    const ext = Object.assign({}, e21, {
      afterRender(svg, R) {
        e21.afterRender && e21.afterRender(svg, R);
        if (svg) svg.querySelectorAll('.du-shape-hit').forEach(el => el.setAttribute('fill', 'none'));
        if (svg && api.sel && api.sel.type === 'item') svg.querySelectorAll(`.du-shape-hit[data-item="${api.sel.id}"]`).forEach(el => el.setAttribute('stroke', 'rgba(27,140,255,.22)'));
        if (api.tool === 'shape' && !inView() && pts.length && api.hover) preview(svg, pts[pts.length - 1], api.hover, api.scale);
        if (inView() && vbox) {
          const s = vbox.querySelector('svg');
          if (s && viewSel) s.querySelectorAll(`[data-shape="${viewSel}"]`).forEach(el => { el.setAttribute('stroke', '#1b8cff'); });
          let bar = $q(w, '#dw22-vbar'); if (!bar) { $q(w, '#dw21-view')?.insertAdjacentHTML('afterbegin', '<div class="dw22-vbar" id="dw22-vbar"></div>'); bar = $q(w, '#dw22-vbar'); }
          if (bar) { const cam = selCam(), n = cam && Array.isArray(cam.shapes) ? cam.shapes.length : 0; bar.innerHTML = api.tool === 'shape' ? `<span>Drawing on this view: ${esc((SHAPE_KINDS.find(k => k[0] === opt.kind) || [])[1] || opt.kind)}. Enter or double-click finishes.</span>` : viewSel ? `<span>Shape selected.</span><button type="button" class="dw21-btn" id="dw22-vdel">Delete shape</button>` : `<span>${n ? n + ' shape' + (n > 1 ? 's' : '') + ' drawn on this view. ' : ''}Pick <b>Shapes</b> to draw lines, arcs, circles and curves on this view at any angle.</span>`; const dl = $q(bar, '#dw22-vdel'); if (dl) dl.onclick = delViewShape; }
        }
      },
      toolOptions(tool, o) {
        if (tool === 'shape') {
          o.innerHTML = `<label>Shape <select id="dw22-kind">${SHAPE_KINDS.map(([k, l]) => `<option value="${k}"${k === opt.kind ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label>Line <select id="dw22-weight">${[['fine', 'Fine'], ['medium', 'Medium'], ['heavy', 'Heavy']].map(([k, l]) => `<option value="${k}"${k === opt.weight ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label class="dw22-chk"><input type="checkbox" id="dw22-dash"${opt.dash ? ' checked' : ''}> Dashed</label>${opt.kind === 'polygon' ? `<label>Sides <input id="dw22-sides" type="number" min="3" max="24" value="${opt.sides}"></label>` : ''}`;
          $q(o, '#dw22-kind').onchange = e => { opt.kind = e.target.value; pts = []; api.pending = null; saveOpt(); ext.toolOptions('shape', o); };
          $q(o, '#dw22-weight').onchange = e => { opt.weight = e.target.value; saveOpt(); };
          $q(o, '#dw22-dash').onchange = e => { opt.dash = e.target.checked; saveOpt(); };
          const si = $q(o, '#dw22-sides'); if (si) si.onchange = () => { opt.sides = Math.max(3, Math.min(24, parseInt(si.value, 10) || 6)); saveOpt(); };
        }
        pts = []; e21.toolOptions && e21.toolOptions(tool, o);
      },
      click(p, ev, tool) {
        if (tool !== 'shape') return e21.click ? e21.click(p, ev, tool) : false;
        if (inView()) return true;
        const q = ev.__p ? p : api.snapPoint(p, api.pending, { free: ev.shiftKey });
        addPoint(q, false); api.render(); return true;
      },
      keydown(ev, tool) {
        if (tool === 'shape' && !(ev.ctrlKey || ev.metaKey || ev.altKey)) {
          if (ev.key === 'Enter') { ev.preventDefault(); finish(false); return true; }
          if (ev.key === 'Escape') { finish(false); return false; }
          if (ev.key === 'Backspace' && pts.length) { ev.preventDefault(); pts.pop(); api.pending = pts[pts.length - 1] || null; api.render(); return true; }
        }
        return e21.keydown ? e21.keydown(ev, tool) : false;
      },
      inspectorExtra(sel, R) {
        const it = sel && sel.type === 'item' ? (api.model.items || []).find(x => x.id === sel.id) : null;
        if (it && it.kind === 'shape') {
          const L = C.shapeLines(it)[0] || [], len = L.reduce((s, p, i) => i ? s + Math.hypot(p.x - L[i - 1].x, p.y - L[i - 1].y) : 0, 0);
          return `<span class="du-kicker">${esc((SHAPE_KINDS.find(k => k[0] === it.shape) || [0, 'Shape'])[1].toUpperCase())}</span><p class="du-muted">${it.shape === 'circle' ? 'Radius ' + esc(C.formatFtIn(it.r)) : 'Length ' + esc(C.formatFtIn(len))}${it.shape === 'line' && L.length > 1 ? ' at ' + (Math.round(((Math.atan2(-(L[1].y - L[0].y), L[1].x - L[0].x) * 180 / Math.PI) + 360) % 360 * 10) / 10) + '°' : ''}</p>
            <div class="du-two"><div class="du-field"><label>Line</label><select id="dw22-iw">${[['fine', 'Fine'], ['medium', 'Medium'], ['heavy', 'Heavy']].map(([k, l]) => `<option value="${k}"${k === it.weight ? ' selected' : ''}>${l}</option>`).join('')}</select></div><div class="du-field"><label>Rotation (degrees)</label><input id="dw22-irot" inputmode="decimal" value="${Math.round((it.rot || 0) * 100) / 100}"></div></div>
            <label class="dw22-chk"><input type="checkbox" id="dw22-idash"${it.dash ? ' checked' : ''}> Dashed</label><div class="dw21-btnrow"><button type="button" class="du-btn primary" id="dw22-iapply">Apply</button><button type="button" class="du-btn ghost" id="dw22-idel">Delete</button></div>` + (e21.inspectorExtra ? e21.inspectorExtra(sel, R) : '');
        }
        return e21.inspectorExtra ? e21.inspectorExtra(sel, R) : '';
      },
      bindInspector(insp) {
        e21.bindInspector && e21.bindInspector(insp);
        const ap = $q(insp, '#dw22-iapply'); if (ap) ap.onclick = () => change(() => { const it = api.model.items.find(x => x.id === api.sel.id); it.weight = $q(insp, '#dw22-iw').value; it.dash = $q(insp, '#dw22-idash').checked; const r = parseFloat($q(insp, '#dw22-irot').value); if (isFinite(r)) it.rot = r; });
        const dl = $q(insp, '#dw22-idel'); if (dl) dl.onclick = () => { const id = api.sel.id; change(() => { C.removeItem(api.model, id); api.sel = null; }); };
      },
    });
    return ext;
  }

  /* ============================================================ wiring into Draw V21 */
  function wire(n) {
    const V = window.DrawUpDrawV21; if (!V || !window.DrawUpDrawCore) { if ((n || 0) < 80) setTimeout(() => wire((n || 0) + 1), 100); return; }
    if (V.__v22) return; V.__v22 = true;
    const attach = V.attach, route = V.route, decorate = V.decorateStart;
    V.attach = api => { const e21 = attach(api) || {}; try { return extend(api, e21); } catch (e) { console.warn('Draw V22', e); return e21; } };
    V.route = async (w, c, params) => {
      document.getElementById('dd22-new')?.remove();
      if (params.has('detail')) {
        const v = params.get('detail') || 'list';
        if (v === 'list') { await detailList(w, c); return true; }
        const { data: row, error } = await sb().from('draw_details').select(SEL_COLS).eq('id', v).eq('owner_id', c.user.id).maybeSingle();
        if (error || !row) { w.innerHTML = `<div class="du-empty"><h1>Detail not found.</h1><button class="du-btn primary" id="dd22-gl">My details</button></div>`; $q(w, '#dd22-gl').onclick = () => { history.replaceState(null, '', '#portal/draw?detail=list'); c.openPortalTab('draw'); }; return true; }
        await detailEditor(w, c, row); return true;
      }
      return route(w, c, params);
    };
    V.decorateStart = (w, c) => {
      decorate && decorate(w, c);
      const grid = $q(w, '.du-draw-start'); if (!grid || $q(grid, '#dn22-detail')) return;
      grid.insertAdjacentHTML('beforeend', `<article class="du-glass dd22-startcard"><h2>Draw a detail in 3D</h2><p class="du-muted">Plan and section details with real material hatches, shown as a 3D hologram you can turn, explode and render realistic. Send it to Arch Coach or the 3D tabs.</p><div class="dw21-btnrow"><button class="du-btn primary" id="dn22-detail">New detail</button><button class="du-btn ghost" id="dn22-mine">My details</button></div></article>`);
      $q(w, '#dn22-detail').onclick = () => newDialog(c, row => goDetail(c, row.id));
      $q(w, '#dn22-mine').onclick = () => { history.replaceState(null, '', '#portal/draw?detail=list'); c.openPortalTab('draw'); };
    };
  }
  window.addEventListener('hashchange', () => {
    const m = /^#portal\/draw\?(.*)$/.exec(location.hash || ''); if (!m) return; const p = new URLSearchParams(m[1]); if (!p.has('detail')) return;
    const cur = document.querySelector('#du-workspace-content [data-dw21-route]'), key = 'detail:' + (p.get('detail') || 'list');
    if ((!cur || cur.dataset.dw21Route !== key) && window.DrawUpPortal?.isSignedIn?.()) window.DrawUpPortal.openPortalTab('draw');
  });

  window.DrawUpDraw22 = { MATS, PRESETS, normDetail, sheetSVG, build3D, Holo, snapshot3D, describe, autoNotes, stackSection, stackPlan, cornerPlan, wallAtSlab, cards3D, viewer, detailsTab, extend, editor: null };
  wire(0);
})();
