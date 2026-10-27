/* DrawUp v27 Visual Detail Intelligence: the two live views of one corrected detail.
 * - Sheet2D: the detail as real SVG vector geometry in inches (same model as the v25.1 AI details and the DXF export),
 *   black-and-white linework with lineweights and hatches, leader notes and dimension strings. In edit mode the member
 *   selects and moves materials, drags vertices, edits notes, dimensions, materials and components, adds and deletes, with
 *   undo; the deterministic checks (drawup-vdi-geometry-v27.js) re-run on every change.
 * - Holo3D: the same geometry extruded into a 3D assembly on a canvas (no WebGL, no library): Realistic (material colours,
 *   procedural textures, lighting), Hologram (navy + cyan edges), Technical (transparent faces, labels) and an exploded
 *   slider for every mode. Orbit (drag), pan (shift-drag or right-drag), zoom (wheel / pinch), click to pick a component.
 *   Inferred components are drawn with dashed edges and marked "inferred".
 * Both views share component ids, so selecting in one highlights the other (the workspace wires that).
 * window.DrawUpVDIView = { Sheet2D, Holo3D, MATERIALS, layeredSVG }
 */
(function () {
  'use strict';
  if (window.DrawUpVDIView) return;
  const G = () => window.DrawUpVDIGeo;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r3 = n => Math.round(n * 1000) / 1000;
  const clone = o => JSON.parse(JSON.stringify(o));
  const SNAP = 0.125;
  const snap = v => Math.round(v / SNAP) * SNAP;

  /* ------------------------------------------------------------------ materials */
  // fill -> name, 3D colour, hologram tint. Fills are the v25.1 detail model's hatch names.
  const MATERIALS = {
    conc: ['Concrete', '#b9b5ac'], earth: ['Earth / soil', '#7a6248'], grav: ['Gravel / crushed stone', '#9c978d'], sand: ['Sand', '#d8c48f'],
    rigid: ['Rigid insulation', '#9fd0e8'], gyp: ['Gypsum board', '#ece9e2'], brick: ['Brick', '#a5563c'], cmu: ['Concrete masonry', '#a9a59c'],
    ply: ['Plywood / OSB', '#d9b37b'], wood: ['Wood framing', '#d2aa70'], mw: ['Mineral wool', '#c9b98a'], tile: ['Tile / finish', '#c8bfae'],
    act: ['Ceiling tile', '#eeeeea'], stone: ['Stone', '#cfc6b3'], steel: ['Steel', '#5d6671'], alum: ['Aluminum', '#c5ccd3'], glass: ['Glass', '#a9d8ec'],
    seal: ['Membrane / sealant', '#2c3138'], batt: ['Batt insulation', '#f0c2b9'], membrane: ['Membrane / flashing', '#2f3a48'], vapor: ['Vapor retarder', '#5c8fb8'],
    white: ['Material', '#e9edf2'], gray: ['Material', '#cfd6dd'], dark: ['Material', '#59616b'], none: ['Line', '#ffffff'],
  };
  const matName = f => (MATERIALS[f] || MATERIALS.white)[0];
  const FILLS = Object.keys(MATERIALS).filter(k => !['batt', 'membrane', 'vapor'].includes(k));
  const LW = { h: 2.4, m: 1.3, l: 0.7, x: 0.45 };
  const DASH = { hid: '6 4', cen: '14 4 3 4', wrb: '5 3', vr: '9 3 2 3' };

  /* SVG hatch defs in inches: u = inches per "pattern unit" so patterns read at any scale. */
  function defs(u, id) {
    const P = (name, w, h, body, rot) => `<pattern id="${id}-${name}" width="${r3(w * u)}" height="${r3(h * u)}" patternUnits="userSpaceOnUse"${rot ? ` patternTransform="rotate(${rot})"` : ''}><rect width="${r3(w * u)}" height="${r3(h * u)}" fill="#fff"/>${body}</pattern>`;
    const sw = r3(u * 0.06), L = (d, w = sw) => `<path d="${d}" fill="none" stroke="#2a2f36" stroke-width="${w}"/>`;
    const sc = v => r3(v * u);
    return `<defs>
${P('conc', 6, 6, `<g fill="none" stroke="#333" stroke-width="${sw}"><path d="M${sc(1)} ${sc(1.8)}l${sc(.8)} -${sc(1)} ${sc(.4)} ${sc(1.2)}z M${sc(3.8)} ${sc(4.4)}l${sc(1)} -${sc(.6)} 0 ${sc(1)}z"/></g><g fill="#333"><circle cx="${sc(2.6)}" cy="${sc(2.8)}" r="${sc(.18)}"/><circle cx="${sc(5.2)}" cy="${sc(2.6)}" r="${sc(.14)}"/><circle cx="${sc(1.4)}" cy="${sc(4.6)}" r="${sc(.16)}"/><circle cx="${sc(3)}" cy="${sc(5.4)}" r="${sc(.12)}"/></g>`)}
${P('earth', 4, 4, L(`M0 ${sc(.4)}H${sc(4)}M0 ${sc(1)}H${sc(4)}M0 ${sc(1.6)}H${sc(4)}`), 45)}
${P('grav', 4, 4, `<g fill="none" stroke="#333" stroke-width="${sw}"><circle cx="${sc(1)}" cy="${sc(1)}" r="${sc(.5)}"/><circle cx="${sc(3)}" cy="${sc(1.6)}" r="${sc(.4)}"/><circle cx="${sc(1.8)}" cy="${sc(3)}" r="${sc(.6)}"/></g>`)}
${P('sand', 2, 2, `<g fill="#444"><circle cx="${sc(.4)}" cy="${sc(.4)}" r="${sc(.08)}"/><circle cx="${sc(1.4)}" cy="${sc(.8)}" r="${sc(.08)}"/><circle cx="${sc(.8)}" cy="${sc(1.6)}" r="${sc(.08)}"/></g>`)}
${P('rigid', 1.4, 1.4, L(`M0 0H${sc(1.4)}M0 0V${sc(1.4)}`), 45)}
${P('gyp', 1, 1, `<circle cx="${sc(.5)}" cy="${sc(.5)}" r="${sc(.09)}" fill="#444"/>`)}
${P('brick', 1, 1, L(`M0 0H${sc(1)}`), 45)}
${P('cmu', 1.8, 1.8, L(`M0 0H${sc(1.8)}`), 45)}
${P('ply', .6, .6, L(`M0 0H${sc(.6)}`), -45)}
${P('wood', 8, 1.2, L(`M0 ${sc(.6)}C${sc(2)} ${sc(.2)} ${sc(4)} ${sc(1)} ${sc(8)} ${sc(.6)}`))}
${P('mw', 1.6, 1, L(`M0 ${sc(.6)}Q${sc(.4)} 0 ${sc(.8)} ${sc(.6)}T${sc(1.6)} ${sc(.6)}`))}
${P('tile', 1.2, 1.2, L(`M0 0H${sc(1.2)}M0 0V${sc(1.2)}`))}
${P('act', 1.8, 1.8, `<g fill="#555"><circle cx="${sc(.4)}" cy="${sc(.4)}" r="${sc(.1)}"/><circle cx="${sc(1.3)}" cy="${sc(1)}" r="${sc(.1)}"/></g>`)}
${P('stone', 2.4, 2.4, L(`M0 ${sc(.6)}H${sc(2.4)}M0 ${sc(1.8)}H${sc(1.4)}`), 30)}
</defs>`;
  }
  const fillOf = (f, id) => (['conc', 'earth', 'grav', 'sand', 'rigid', 'gyp', 'brick', 'cmu', 'ply', 'wood', 'mw', 'tile', 'act', 'stone'].includes(f) ? `url(#${id}-${f})` : { steel: '#262626', alum: '#c8d0d7', glass: '#e2f0f5', seal: '#111', white: '#fff', none: 'none', gray: '#d9dee2', dark: '#555' }[f] || 'none');

  /** Batt insulation loops in inches inside a box. */
  function battPath(x0, y0, x1, y1, T) {
    const w = x1 - x0, h = y1 - y0, vert = h >= w, L = vert ? h : w, Tk = vert ? w : h, d = Tk * 0.46, p = Tk * 0.62, rr = p / (2 * Math.PI), pts = [];
    for (let t = 0; t < 4000; t += 0.2) { const s = rr * t - d * Math.sin(t) + d, c = Tk / 2 - d * Math.cos(t); if (s > L) break; if (s < 0) continue; pts.push(vert ? [x0 + c, y0 + s] : [x0 + s, y0 + c]); }
    return pts.map((q, i) => (i ? 'L' : 'M') + r3(T.x(q[0])) + ' ' + r3(T.y(q[1]))).join('');
  }

  /* ------------------------------------------------------------------ 2D */
  /** Renders the drawing as an SVG string. opt: { id, sel: {type, i}, comp (highlighted component), hidden:Set, changed:Set,
   *  issues, editable, layered (group by layer for export), title, scale } */
  function renderSVG(g, comps, opt = {}) {
    const Geo = G(), id = opt.id || 'vdi', b = opt.frame || Geo.bounds(g), span = Math.max(12, b.x1 - b.x0, b.y1 - b.y0), pad = span * 0.08;
    const noteW = Math.max(span * 0.75, 30), fs = Math.max(0.7, span / 52), u = Math.max(0.6, span / 70);
    const W = (b.x1 - b.x0) + pad * 2 + noteW, H = (b.y1 - b.y0) + pad * 2;
    const T = { x: x => x - b.x0 + pad, y: y => b.y1 - y + pad };
    const k = span / 300; // stroke scale: lineweights in "screen px" of a 300-unit drawing
    const sw = w => r3((LW[w] || LW.m) * k);
    const byComp = new Map((comps || []).map(c => [c.id, c]));
    const groups = new Map(), push = (layer, s) => { if (!groups.has(layer)) groups.set(layer, []); groups.get(layer).push(s); };
    const hidden = opt.hidden || new Set();
    (g.elements || []).forEach((e, i) => {
      if (e.comp && hidden.has(e.comp)) return;
      const o = Geo.outlineOf(e), p = e.pts || [], dash = DASH[e.dash] ? ` stroke-dasharray="${DASH[e.dash].split(' ').map(v => r3(v * k)).join(' ')}"` : '';
      const inferred = e.comp && byComp.get(e.comp)?.inferred;
      const attrs = `data-i="${i}" data-comp="${esc(e.comp || '')}" class="vdi-el${opt.sel?.type === 'el' && opt.sel.i === i ? ' sel' : ''}${opt.comp && e.comp === opt.comp ? ' hl' : ''}${opt.changed?.has(e.comp) ? ' chg' : ''}${inferred ? ' inf' : ''}"`;
      let s = '';
      if (e.kind === 'circle' && p.length >= 2) s = `<circle ${attrs} cx="${r3(T.x(p[0][0]))}" cy="${r3(T.y(p[0][1]))}" r="${r3(Math.abs(p[1][0]))}" fill="${fillOf(e.fill, id)}" stroke="#111" stroke-width="${sw(e.weight)}"/>`;
      else if (o) {
        const d = o.map((q, j) => (j ? 'L' : 'M') + r3(T.x(q[0])) + ' ' + r3(T.y(q[1]))).join('') + 'Z';
        const fill = e.kind === 'blk' || e.kind === 'blk1' ? '#fff' : e.kind === 'batt' ? '#fff' : fillOf(e.fill, id);
        s = `<path ${attrs} d="${d}" fill="${fill}" stroke="#111" stroke-width="${sw(e.kind === 'batt' ? 'x' : e.weight)}"${dash} stroke-linejoin="round"/>`;
        if (e.kind === 'blk') s += `<path pointer-events="none" d="M${r3(T.x(o[0][0]))} ${r3(T.y(o[0][1]))}L${r3(T.x(o[2][0]))} ${r3(T.y(o[2][1]))}M${r3(T.x(o[1][0]))} ${r3(T.y(o[1][1]))}L${r3(T.x(o[3][0]))} ${r3(T.y(o[3][1]))}" stroke="#111" stroke-width="${sw('x')}"/>`;
        if (e.kind === 'blk1') s += `<path pointer-events="none" d="M${r3(T.x(o[0][0]))} ${r3(T.y(o[0][1]))}L${r3(T.x(o[2][0]))} ${r3(T.y(o[2][1]))}" stroke="#111" stroke-width="${sw('x')}"/>`;
        if (e.kind === 'batt') s += `<path pointer-events="none" d="${battPath(o[0][0], o[0][1], o[2][0], o[2][1], T)}" fill="none" stroke="#333" stroke-width="${sw('x')}"/>`;
      } else if (e.kind === 'brk' && p.length >= 2) {
        const [a, c] = p, m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, uu = [(c[0] - a[0]) / L, (c[1] - a[1]) / L], n = [-uu[1], uu[0]], z = Math.min(1.2, L / 10);
        const P = [a, [m[0] - uu[0] * z, m[1] - uu[1] * z], [m[0] + n[0] * z * 2, m[1] + n[1] * z * 2], [m[0] - n[0] * z * 2, m[1] - n[1] * z * 2], [m[0] + uu[0] * z, m[1] + uu[1] * z], c];
        s = `<polyline ${attrs} points="${P.map(q => r3(T.x(q[0])) + ',' + r3(T.y(q[1]))).join(' ')}" fill="none" stroke="#111" stroke-width="${sw('l')}"/>`;
      } else if (p.length >= 2) s = `<polyline ${attrs} points="${p.map(q => r3(T.x(q[0])) + ',' + r3(T.y(q[1]))).join(' ')}" fill="none" stroke="#111" stroke-width="${sw(MEMB(e) ? 'm' : e.weight)}"${dash} stroke-linejoin="round" stroke-linecap="round"/>`;
      push(opt.layered ? Geo.layerOf(e) : 'geo', s);
    });
    // dimensions
    const dimS = [];
    (g.dims || []).forEach((d, i) => {
      const hz = Math.abs(d.y2 - d.y1) <= Math.abs(d.x2 - d.x1), off = d.offset || 0, t = fs * 0.35;
      const a = hz ? [d.x1, d.y1 + off] : [d.x1 + off, d.y1], c = hz ? [d.x2, d.y1 + off] : [d.x1 + off, d.y2];
      const bad = (opt.issues || []).some(is => is.code === 'dim_mismatch' && is.dim === i);
      const ln = (p, q, w) => `<line x1="${r3(T.x(p[0]))}" y1="${r3(T.y(p[1]))}" x2="${r3(T.x(q[0]))}" y2="${r3(T.y(q[1]))}" stroke-width="${w}"/>`;
      const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      dimS.push(`<g data-dim="${i}" class="vdi-dim${opt.sel?.type === 'dim' && opt.sel.i === i ? ' sel' : ''}${bad ? ' bad' : ''}" stroke="#111">${ln([d.x1, d.y1], a, sw('x'))}${ln([d.x2, d.y2], c, sw('x'))}${ln(a, c, sw('l'))}${[a, c].map(q => ln([q[0] - t, q[1] - t], [q[0] + t, q[1] + t], sw('m'))).join('')}<text x="${r3(T.x(mid[0]) + (hz ? 0 : -fs * 0.4))}" y="${r3(T.y(mid[1]) - (hz ? fs * 0.35 : 0))}" font-size="${r3(fs)}" text-anchor="middle" stroke="none" fill="#111"${hz ? '' : ` transform="rotate(-90 ${r3(T.x(mid[0]) - fs * 0.4)} ${r3(T.y(mid[1]))})"`}>${esc(d.label)}</text></g>`);
    });
    // leader notes in a column to the right, ordered top to bottom
    const notes = (g.notes || []).map((n, i) => ({ ...n, i })).sort((p, q) => q.y - p.y), nx = T.x(b.x1) + pad * 0.9, lh = fs * 1.25, wrapN = Math.max(16, Math.floor(noteW / (fs * 0.62)));
    let cy = pad * 0.6;
    const noteS = notes.map(n => {
      const lines = wrap(n.text.toUpperCase(), wrapN), ty = Math.max(cy, Math.min(H - lines.length * lh, T.y(n.y) - lines.length * lh / 2)); cy = ty + lines.length * lh + fs * 0.5;
      const px = T.x(n.x), py = T.y(n.y), ay = ty + fs * 0.45, ang = Math.atan2(ay - py, nx - 0.6 - px), ah = fs * 0.55;
      return `<g data-note="${n.i}" class="vdi-note${opt.sel?.type === 'note' && opt.sel.i === n.i ? ' sel' : ''}"><polyline points="${r3(px)},${r3(py)} ${r3(nx - fs * 0.6)},${r3(ay)} ${r3(nx - fs * 0.15)},${r3(ay)}" fill="none" stroke="#111" stroke-width="${sw('l')}"/><polygon points="${r3(px)},${r3(py)} ${r3(px + Math.cos(ang + 0.3) * ah)},${r3(py + Math.sin(ang + 0.3) * ah)} ${r3(px + Math.cos(ang - 0.3) * ah)},${r3(py + Math.sin(ang - 0.3) * ah)}" fill="#111"/>${lines.map((l, j) => `<text x="${r3(nx)}" y="${r3(ty + fs * 0.75 + j * lh)}" font-size="${r3(fs)}" fill="#111">${esc(l)}</text>`).join('')}</g>`;
    });
    const issueS = (opt.issues || []).filter(is => is.at && is.level !== 'info').map((is, j) => `<g class="vdi-iss ${is.level}" data-issue="${j}"><circle cx="${r3(T.x(is.at[0]))}" cy="${r3(T.y(is.at[1]))}" r="${r3(fs * 0.9)}"/><text x="${r3(T.x(is.at[0]))}" y="${r3(T.y(is.at[1]) + fs * 0.35)}" font-size="${r3(fs)}" text-anchor="middle">!</text></g>`);
    const handles = opt.editable && opt.sel?.type === 'el' ? ((g.elements[opt.sel.i] || {}).pts || []).map((q, j) => `<rect class="vdi-h" data-h="${j}" x="${r3(T.x(q[0]) - fs * 0.35)}" y="${r3(T.y(q[1]) - fs * 0.35)}" width="${r3(fs * 0.7)}" height="${r3(fs * 0.7)}"/>`).join('') : '';
    const body = [...groups.entries()].map(([layer, list]) => (opt.layered ? `<g id="${esc(layer)}" inkscape:groupmode="layer" inkscape:label="${esc(layer)}">${list.join('')}</g>` : list.join(''))).join('');
    const title = opt.title ? `<text x="${r3(pad)}" y="${r3(H + fs * 1.4)}" font-size="${r3(fs * 1.2)}" font-weight="700" fill="#111">${esc(String(opt.title).toUpperCase())}${opt.scale ? `   SCALE: ${esc(opt.scale)}` : ''}</text>` : '';
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg"${opt.layered ? ' xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"' : ''} viewBox="0 0 ${r3(W)} ${r3(H + (opt.title ? fs * 2 : 0))}" font-family="Arial, Helvetica, sans-serif" class="vdi-svg">${defs(u, id)}<rect width="100%" height="100%" fill="#fff"/>` +
        `${body}<g id="A-ANNO-DIMS"${opt.layered ? ' inkscape:groupmode="layer" inkscape:label="A-ANNO-DIMS"' : ''}>${dimS.join('')}</g><g id="A-ANNO-NOTE"${opt.layered ? ' inkscape:groupmode="layer" inkscape:label="A-ANNO-NOTE"' : ''}>${noteS.join('')}</g>${title}${opt.layered ? '' : `<g class="vdi-issues">${issueS.join('')}</g>${handles}`}</svg>`,
      T, W, H, b, fs,
    };
  }
  const MEMB = e => e.dash === 'wrb' || e.dash === 'vr';
  function wrap(t, n) { const w = String(t).split(/\s+/), L = []; let c = ''; for (const x of w) { if ((c + ' ' + x).trim().length > n) { if (c) L.push(c); c = x; } else c = (c + ' ' + x).trim(); } if (c) L.push(c); return L.length ? L : ['']; }
  /** Layered, editable SVG for Illustrator / Inkscape: one group per CAD layer. */
  const layeredSVG = (g, comps, meta) => renderSVG(g, comps, { layered: true, id: 'x', title: meta?.title, scale: meta?.scale }).svg;

  /** Interactive 2D view. host gets the SVG; editing adds a toolbar + property panel. */
  function Sheet2D(host, o) {
    const S = { g: clone(o.drawing), comps: clone(o.components || []), sel: null, comp: null, hidden: new Set(), changed: o.changed || new Set(), editable: false, undo: [], redo: [], view: null, issues: [] };
    host.classList.add('vdi-2d');
    host.innerHTML = `<div class="vdi-2d-tools" hidden></div><div class="vdi-2d-stage" tabindex="0" aria-label="Corrected 2D detail. Scroll to zoom, drag to pan."></div><div class="vdi-2d-props" hidden></div>`;
    const stage = host.querySelector('.vdi-2d-stage'), tools = host.querySelector('.vdi-2d-tools'), props = host.querySelector('.vdi-2d-props');
    let R = null;
    const check = () => { const v = G().validate(S.g, S.comps); S.issues = v.issues.map(is => (is.code === 'dim_mismatch' ? { ...is, dim: S.g.dims.findIndex(d => Math.abs((d.x1 + d.x2) / 2 - is.at[0]) < 1e-6 && Math.abs((d.y1 + d.y2) / 2 - is.at[1]) < 1e-6) } : is)); S.validation = v; o.onValidate?.(v); };
    function paint() {
      if (!S.frame) S.frame = G().bounds(S.g);
      R = renderSVG(S.g, S.comps, { id: o.id || 'vdi2d', frame: S.frame, sel: S.sel, comp: S.comp, hidden: S.hidden, changed: S.showChanges ? S.changed : null, issues: S.issues, editable: S.editable });
      stage.innerHTML = R.svg;
      const svg = stage.querySelector('svg');
      if (S.view) svg.setAttribute('viewBox', S.view.join(' ')); else S.base = svg.getAttribute('viewBox').split(' ').map(Number);
      if (S.editable) paintProps();
    }
    const toModel = (ev) => { const svg = stage.querySelector('svg'), pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); return [q.x - R.T.x(0), R.T.y(0) - q.y]; };
    // select / drag / pan
    let drag = null;
    stage.addEventListener('pointerdown', ev => {
      const t = ev.target, svg = stage.querySelector('svg'); if (!svg) return;
      const h = t.closest?.('.vdi-h'), el = t.closest?.('[data-i]'), nt = t.closest?.('[data-note]'), dm = t.closest?.('[data-dim]');
      if (S.editable && h && S.sel?.type === 'el') { push(); drag = { kind: 'vertex', j: +h.dataset.h, start: toModel(ev) }; }
      else if (el || nt || dm) {
        const sel = el ? { type: 'el', i: +el.dataset.i } : nt ? { type: 'note', i: +nt.dataset.note } : { type: 'dim', i: +dm.dataset.dim };
        const comp = el ? el.dataset.comp || null : null;
        S.sel = sel; S.comp = comp; o.onSelect?.(comp, sel); paint();
        if (S.editable && (sel.type === 'el' || sel.type === 'note')) { push(); drag = { kind: 'move', start: toModel(ev), orig: clone(sel.type === 'el' ? S.g.elements[sel.i].pts : [[S.g.notes[sel.i].x, S.g.notes[sel.i].y]]) }; }
      } else { drag = { kind: 'pan', x: ev.clientX, y: ev.clientY, vb: (S.view || S.base).slice() }; if (S.sel || S.comp) { S.sel = null; S.comp = null; o.onSelect?.(null, null); paint(); } }
      try { stage.setPointerCapture(ev.pointerId); } catch (_e) { /* */ }
    });
    stage.addEventListener('pointermove', ev => {
      if (!drag) return;
      if (drag.kind === 'pan') { const svg = stage.querySelector('svg'), r = svg.getBoundingClientRect(), vb = drag.vb, sx = vb[2] / r.width, sy = vb[3] / r.height; S.view = [vb[0] - (ev.clientX - drag.x) * sx, vb[1] - (ev.clientY - drag.y) * sy, vb[2], vb[3]]; svg.setAttribute('viewBox', S.view.join(' ')); return; }
      const p = toModel(ev), dx = snap(p[0] - drag.start[0]), dy = snap(p[1] - drag.start[1]);
      if (drag.kind === 'move') {
        if (S.sel.type === 'el') { const e = S.g.elements[S.sel.i]; e.pts = drag.orig.map((q, j) => (e.kind === 'circle' && j === 1 ? q : [r3(q[0] + dx), r3(q[1] + dy)])); }
        else { const n = S.g.notes[S.sel.i]; n.x = r3(drag.orig[0][0] + dx); n.y = r3(drag.orig[0][1] + dy); }
      } else if (drag.kind === 'vertex') { const e = S.g.elements[S.sel.i]; e.pts[drag.j] = [snap(p[0]), snap(p[1])]; }
      drag.moved = true; paint();
    });
    const end = () => { if (drag && drag.kind !== 'pan') { if (!drag.moved) S.undo.pop(); else changed(); } drag = null; };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    stage.addEventListener('wheel', ev => { ev.preventDefault(); const svg = stage.querySelector('svg'); if (!svg) return; const vb = (S.view || S.base).slice(), r = svg.getBoundingClientRect(), f = Math.exp(ev.deltaY * 0.0012), mx = vb[0] + (ev.clientX - r.left) / r.width * vb[2], my = vb[1] + (ev.clientY - r.top) / r.height * vb[3]; const w = Math.max(S.base[2] * 0.08, Math.min(S.base[2] * 3, vb[2] * f)), h = w * vb[3] / vb[2]; S.view = [mx - (mx - vb[0]) * w / vb[2], my - (my - vb[1]) * h / vb[3], w, h]; svg.setAttribute('viewBox', S.view.join(' ')); }, { passive: false });
    stage.addEventListener('dblclick', () => { S.view = null; S.frame = null; paint(); });
    stage.addEventListener('keydown', ev => {
      if (!S.editable) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); }
      else if ((ev.key === 'Delete' || ev.key === 'Backspace') && S.sel) { ev.preventDefault(); del(); }
      else if (S.sel && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) { ev.preventDefault(); const st = ev.shiftKey ? 1 : SNAP, d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] }[ev.key]; push(); nudge(d); changed(); }
    });
    function nudge([dx, dy]) { if (S.sel.type === 'el') { const e = S.g.elements[S.sel.i]; e.pts = e.pts.map((q, j) => (e.kind === 'circle' && j === 1 ? q : [r3(q[0] + dx), r3(q[1] + dy)])); } else if (S.sel.type === 'note') { const n = S.g.notes[S.sel.i]; n.x = r3(n.x + dx); n.y = r3(n.y + dy); } else { const d = S.g.dims[S.sel.i]; d.x1 += dx; d.x2 += dx; d.y1 += dy; d.y2 += dy; } }
    const snapshot = () => JSON.stringify({ g: S.g, c: S.comps });
    function push() { S.undo.push(snapshot()); if (S.undo.length > 80) S.undo.shift(); S.redo = []; }
    function restore(s) { const v = JSON.parse(s); S.g = v.g; S.comps = v.c; S.sel = null; changed(); }
    function undo() { if (!S.undo.length) return; S.redo.push(snapshot()); restore(S.undo.pop()); }
    function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); restore(S.redo.pop()); }
    function del() { push(); const s = S.sel; if (s.type === 'el') S.g.elements.splice(s.i, 1); else if (s.type === 'note') S.g.notes.splice(s.i, 1); else S.g.dims.splice(s.i, 1); S.sel = null; changed(); }
    function changed() { S.dirty = true; check(); paint(); o.onChange?.(api); }

    /* toolbar + property panel (edit mode) */
    function paintTools() {
      tools.innerHTML = `<button type="button" data-t="undo" title="Undo (Ctrl+Z)">↶ Undo</button><button type="button" data-t="redo" title="Redo (Ctrl+Shift+Z)">↷ Redo</button><span class="sep"></span>
        <button type="button" data-t="rect">＋ Material</button><button type="button" data-t="line">＋ Membrane line</button><button type="button" data-t="note">＋ Note</button><button type="button" data-t="dim">＋ Dimension</button><span class="sep"></span><button type="button" data-t="fit">Fit</button>`;
      tools.querySelectorAll('[data-t]').forEach(b => b.onclick = () => tool(b.dataset.t));
    }
    function center() { const vb = S.view || S.base; return [snap(vb[0] + vb[2] * 0.35 - R.T.x(0)), snap(R.T.y(0) - (vb[1] + vb[3] * 0.5))]; }
    function tool(t) {
      if (t === 'undo') return undo(); if (t === 'redo') return redo(); if (t === 'fit') { S.view = null; S.frame = null; return paint(); }
      push(); const [cx, cy] = center();
      if (t === 'rect') { S.g.elements.push({ kind: 'rect', pts: [[cx, cy], [cx + 4, cy + 2]], fill: 'rigid', weight: 'm', dash: 'none', comp: S.comp || '' }); S.sel = { type: 'el', i: S.g.elements.length - 1 }; }
      if (t === 'line') { S.g.elements.push({ kind: 'polyline', pts: [[cx, cy], [cx + 6, cy]], fill: 'none', weight: 'm', dash: 'wrb', comp: S.comp || '' }); S.sel = { type: 'el', i: S.g.elements.length - 1 }; }
      if (t === 'note') { S.g.notes.push({ x: cx, y: cy, text: 'NEW NOTE' }); S.sel = { type: 'note', i: S.g.notes.length - 1 }; }
      if (t === 'dim') { S.g.dims.push({ x1: cx, y1: cy, x2: cx + 6, y2: cy, label: '6"', offset: -2 }); S.sel = { type: 'dim', i: S.g.dims.length - 1 }; }
      changed();
    }
    function paintProps() {
      const s = S.sel;
      if (!s) { props.innerHTML = `<p class="vdi-muted">Select a material, line, note or dimension to edit it. Drag to move (snaps to 1/8"), drag the square handles to reshape, arrow keys nudge (Shift = 1"), Delete removes.</p>${layersHtml()}`; bindLayers(); return; }
      const compOpts = `<option value="">(none)</option>${S.comps.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}`;
      if (s.type === 'el') {
        const e = S.g.elements[s.i]; if (!e) { S.sel = null; return paintProps(); }
        props.innerHTML = `<h5>${esc(e.kind === 'polyline' || e.kind === 'line' ? 'Line' : matName(e.fill))} <small>#${s.i + 1}</small></h5>
          <label>Component<select data-p="comp">${compOpts}</select></label>
          <label>Material / hatch<select data-p="fill">${FILLS.map(f => `<option value="${f}"${f === e.fill ? ' selected' : ''}>${esc(matName(f))} (${f})</option>`).join('')}</select></label>
          <label>Shape<select data-p="kind">${['rect', 'poly', 'polyline', 'line', 'batt', 'blk', 'blk1', 'circle', 'brk'].map(k => `<option${k === e.kind ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
          <div class="vdi-row"><label>Lineweight<select data-p="weight">${[['h', 'Heavy (cut)'], ['m', 'Medium'], ['l', 'Light'], ['x', 'Fine']].map(([k, n]) => `<option value="${k}"${k === e.weight ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>Line type<select data-p="dash">${[['none', 'Solid'], ['hid', 'Hidden'], ['cen', 'Center'], ['wrb', 'WRB / membrane'], ['vr', 'Vapor retarder']].map(([k, n]) => `<option value="${k}"${k === e.dash ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
          <label>Points (inches, x y per line)<textarea data-p="pts" rows="${Math.min(8, e.pts.length + 1)}">${e.pts.map(q => q.join(' ')).join('\n')}</textarea></label>
          ${e.kind === 'rect' || e.kind === 'batt' || e.kind === 'blk' || e.kind === 'blk1' ? `<p class="vdi-muted">Size ${G().formatInches(Math.abs(e.pts[1][0] - e.pts[0][0]))} × ${G().formatInches(Math.abs(e.pts[1][1] - e.pts[0][1]))}</p>` : ''}
          <div class="vdi-row"><button type="button" data-a="dup">Duplicate</button><button type="button" data-a="del" class="bad">Delete</button></div>`;
        props.querySelector('[data-p="comp"]').value = e.comp || '';
      } else if (s.type === 'note') {
        const n = S.g.notes[s.i]; if (!n) { S.sel = null; return paintProps(); }
        props.innerHTML = `<h5>Leader note</h5><label>Text<textarea data-p="text" rows="3" maxlength="160">${esc(n.text)}</textarea></label><div class="vdi-row"><label>Arrow x<input data-p="x" type="number" step="0.125" value="${n.x}"></label><label>Arrow y<input data-p="y" type="number" step="0.125" value="${n.y}"></label></div><div class="vdi-row"><button type="button" data-a="del" class="bad">Delete</button></div>`;
      } else {
        const d = S.g.dims[s.i]; if (!d) { S.sel = null; return paintProps(); }
        const hz = Math.abs(d.y2 - d.y1) <= Math.abs(d.x2 - d.x1), drawn = hz ? Math.abs(d.x2 - d.x1) : Math.abs(d.y2 - d.y1), bad = S.issues.some(is => is.code === 'dim_mismatch' && is.dim === s.i);
        props.innerHTML = `<h5>Dimension</h5><label>Label<input data-p="label" maxlength="30" value="${esc(d.label)}"></label><p class="vdi-muted">Drawn length: <b>${G().formatInches(drawn)}</b>${bad ? ' · <span class="bad">does not match the label</span>' : ''}</p>
          <div class="vdi-row"><label>x1<input data-p="x1" type="number" step="0.125" value="${d.x1}"></label><label>y1<input data-p="y1" type="number" step="0.125" value="${d.y1}"></label></div>
          <div class="vdi-row"><label>x2<input data-p="x2" type="number" step="0.125" value="${d.x2}"></label><label>y2<input data-p="y2" type="number" step="0.125" value="${d.y2}"></label></div>
          <label>Offset<input data-p="offset" type="number" step="0.5" value="${d.offset || 0}"></label>
          <div class="vdi-row"><button type="button" data-a="fixlabel">Set label to drawn length</button><button type="button" data-a="del" class="bad">Delete</button></div>`;
      }
      props.querySelectorAll('[data-p]').forEach(inp => inp.onchange = () => setProp(inp.dataset.p, inp.value));
      props.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a));
      props.insertAdjacentHTML('beforeend', layersHtml()); bindLayers();
    }
    function setProp(k, v) {
      push(); const s = S.sel;
      if (s.type === 'el') {
        const e = S.g.elements[s.i];
        if (k === 'pts') { const pts = v.split(/\n+/).map(l => l.trim().split(/[\s,]+/).map(Number)).filter(q => q.length >= 2 && q.every(Number.isFinite)).map(q => [q[0], q[1]]); if (pts.length >= 2) e.pts = pts; }
        else if (k === 'kind') { e.kind = v; if (v === 'poly' && e.pts.length === 2) { const [a, c] = e.pts; e.pts = [[a[0], a[1]], [c[0], a[1]], [c[0], c[1]], [a[0], c[1]]]; } if (['rect', 'batt', 'blk', 'blk1', 'line', 'brk'].includes(v) && e.pts.length > 2) { const xs = e.pts.map(q => q[0]), ys = e.pts.map(q => q[1]); e.pts = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]]; } }
        else e[k] = v;
      } else if (s.type === 'note') { const n = S.g.notes[s.i]; n[k] = k === 'text' ? v.slice(0, 160) : Number(v) || 0; }
      else { const d = S.g.dims[s.i]; d[k] = k === 'label' ? v.slice(0, 30) : Number(v) || 0; }
      changed();
    }
    function act(a) {
      if (a === 'del') return del();
      push();
      if (a === 'dup') { const e = clone(S.g.elements[S.sel.i]); e.pts = e.pts.map((q, j) => (e.kind === 'circle' && j === 1 ? q : [q[0] + 1, q[1] - 1])); S.g.elements.push(e); S.sel = { type: 'el', i: S.g.elements.length - 1 }; }
      if (a === 'fixlabel') { const d = S.g.dims[S.sel.i], hz = Math.abs(d.y2 - d.y1) <= Math.abs(d.x2 - d.x1); d.label = G().formatInches(hz ? Math.abs(d.x2 - d.x1) : Math.abs(d.y2 - d.y1)); }
      changed();
    }
    const layersHtml = () => `<h5>Components / layers</h5><ul class="vdi-layers">${S.comps.map(c => `<li class="${S.comp === c.id ? 'on' : ''}"><label><input type="checkbox" data-vis="${esc(c.id)}"${S.hidden.has(c.id) ? '' : ' checked'}> ${esc(c.name)}${c.inferred ? ' <em>inferred</em>' : ''}</label><input class="vdi-cname" data-cname="${esc(c.id)}" value="${esc(c.name)}" aria-label="Rename ${esc(c.name)}"></li>`).join('')}</ul><button type="button" data-addcomp>＋ Component</button>`;
    function bindLayers() {
      props.querySelectorAll('[data-vis]').forEach(b => b.onchange = () => { b.checked ? S.hidden.delete(b.dataset.vis) : S.hidden.add(b.dataset.vis); paint(); o.onHidden?.(S.hidden); });
      props.querySelectorAll('[data-cname]').forEach(b => b.onchange = () => { push(); const c = S.comps.find(x => x.id === b.dataset.cname); if (c) c.name = b.value.slice(0, 80) || c.name; changed(); });
      const ac = props.querySelector('[data-addcomp]'); if (ac) ac.onclick = () => { const name = prompt('Component name (e.g. "Sill sealer")'); if (!name) return; push(); let n = 1; while (S.comps.some(c => c.id === 'u' + n)) n++; S.comps.push({ id: 'u' + n, name: name.slice(0, 80), material: '', inferred: false, continuous: false }); changed(); };
    }

    const api = {
      get drawing() { return { ...S.g, components: S.comps }; }, get dirty() { return !!S.dirty; }, get validation() { return S.validation; },
      setEditable(on) { S.editable = !!on; tools.hidden = props.hidden = !on; host.classList.toggle('editing', !!on); if (on) paintTools(); paint(); },
      select(comp) { S.comp = comp; if (S.sel?.type !== 'el' || (S.g.elements[S.sel.i] || {}).comp !== comp) S.sel = null; paint(); },
      setHidden(set) { S.hidden = new Set(set); paint(); },
      showChanges(on) { S.showChanges = !!on; paint(); },
      reset(d, comps) { S.g = clone(d); S.comps = clone(comps || []); S.undo = []; S.redo = []; S.dirty = false; S.sel = null; S.frame = null; S.view = null; check(); paint(); },
      svg: () => renderSVG(S.g, S.comps, { id: 'out', title: o.title, scale: o.scale }).svg,
      layered: () => layeredSVG(S.g, S.comps, { title: o.title }),
      dxf: () => G().toDXF(S.g, { title: o.title }),
      undo, redo, paint,
    };
    check(); paint();
    return api;
  }

  /* ------------------------------------------------------------------ 3D */
  const hex = h => { const n = parseInt(String(h).slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const texCache = new Map();
  /** Small procedural textures per material (Realistic mode). */
  function texture(g, fill) {
    if (texCache.has(fill)) return texCache.get(fill);
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), [r, gg, b] = hex((MATERIALS[fill] || MATERIALS.white)[1]);
    x.fillStyle = `rgb(${r},${gg},${b})`; x.fillRect(0, 0, 64, 64);
    let seed = fill.length * 97; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const dots = (n, rad, a) => { for (let i = 0; i < n; i++) { const v = rnd() < 0.5 ? -1 : 1; x.fillStyle = `rgba(${v > 0 ? '255,255,255' : '0,0,0'},${a * rnd()})`; x.beginPath(); x.arc(rnd() * 64, rnd() * 64, rad * (0.4 + rnd()), 0, 7); x.fill(); } };
    if (['conc', 'cmu', 'stone', 'sand', 'earth'].includes(fill)) dots(fill === 'sand' ? 260 : 160, fill === 'earth' ? 1.6 : 1, 0.22);
    if (fill === 'grav') { for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${90 + rnd() * 80 | 0},${90 + rnd() * 70 | 0},${80 + rnd() * 60 | 0},.9)`; x.beginPath(); x.ellipse(rnd() * 64, rnd() * 64, 3 + rnd() * 4, 2 + rnd() * 3, rnd() * 3, 0, 7); x.fill(); } }
    if (fill === 'wood' || fill === 'ply') { x.strokeStyle = 'rgba(120,80,30,.35)'; for (let i = 0; i < 9; i++) { x.beginPath(); const y0 = rnd() * 64; x.moveTo(0, y0); x.bezierCurveTo(20, y0 + rnd() * 6 - 3, 40, y0 + rnd() * 6 - 3, 64, y0); x.stroke(); } }
    if (fill === 'batt' || fill === 'mw') { x.strokeStyle = 'rgba(255,255,255,.45)'; for (let i = 0; i < 30; i++) { x.beginPath(); x.moveTo(rnd() * 64, rnd() * 64); x.quadraticCurveTo(rnd() * 64, rnd() * 64, rnd() * 64, rnd() * 64); x.stroke(); } }
    if (fill === 'rigid') { x.strokeStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 64; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); } dots(60, 0.8, 0.12); }
    if (fill === 'brick') { x.fillStyle = 'rgba(230,220,205,.9)'; for (let y = 0; y < 64; y += 16) { x.fillRect(0, y, 64, 2); for (let k = (y / 16) % 2 ? 0 : 16; k < 64; k += 32) x.fillRect(k, y, 2, 16); } dots(90, 0.8, 0.2); }
    if (fill === 'gyp') dots(40, 0.6, 0.08);
    const pat = g.createPattern(c, 'repeat'); texCache.set(fill, pat); return pat;
  }

  /** prisms from 2D regions: section in the x-y plane, extruded along z (depth). */
  function prismsOf(regions, st) {
    const all = regions.flatMap(r => r.pts); if (!all.length) return { prisms: [], R: 24 };
    const xs = all.map(p => p[0]), ys = all.map(p => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 12), D0 = Math.min(48, Math.max(16, span * 0.55));
    const compC = new Map(); regions.forEach(r => { const c = r.pts.reduce((s, p) => [s[0] + p[0] / r.pts.length, s[1] + p[1] / r.pts.length], [0, 0]); const k = r.comp || 'r' + r.index; const v = compC.get(k) || [0, 0, 0]; compC.set(k, [v[0] + c[0], v[1] + c[1], v[2] + 1]); });
    const order = [...compC.keys()];
    const prisms = regions.map(r => {
      const key = r.comp || 'r' + r.index, cc = compC.get(key), c = [cc[0] / cc[2] - cx, cc[1] / cc[2] - cy], L = Math.hypot(c[0], c[1]) || 1;
      const ex = (st.explode || 0) * span * 0.35, rank = order.indexOf(key);
      const shift = [c[0] / L * ex * Math.min(1, L / (span * 0.25)), c[1] / L * ex * Math.min(1, L / (span * 0.25)), -rank * (st.explode || 0) * 1.2];
      let depth = D0; if (st.cutaway) depth *= 1 - 0.5 * Math.max(0, Math.min(1, (r.pts.reduce((s, p) => s + p[0], 0) / r.pts.length - Math.min(...xs)) / (span || 1)));
      const ccw = window.DrawUpVDIGeo.area(r.pts) > 0;
      const v = (p, z) => [p[0] - cx + shift[0], p[1] - cy + shift[1], -z + shift[2]];
      const front = r.pts.map(p => v(p, 0)), back = r.pts.map(p => v(p, depth));
      const sides = r.pts.map((p, i) => { const q = r.pts[(i + 1) % r.pts.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; return { pts: [front[i], front[(i + 1) % front.length], back[(i + 1) % back.length], back[i]], n: [(ccw ? dy : -dy) / l, (ccw ? -dx : dx) / l, 0] }; });
      return { ...r, key, front, back, sides, depth };
    });
    let R = 1; prisms.forEach(P => P.front.concat(P.back).forEach(q => { R = Math.max(R, Math.hypot(q[0], q[1], q[2])); }));
    return { prisms, R };
  }

  function Holo3D(canvas, o = {}) {
    const S = { regions: [], mode: o.mode || 'real', explode: 0, cutaway: true, hidden: new Set(), sel: null, cam: { yaw: -0.65, pitch: 0.38, zoom: 1, px: 0, py: 0 }, scene: null, faces: [] };
    const g = canvas.getContext('2d');
    const build = () => { S.scene = prismsOf(S.regions.filter(r => !S.hidden.has(r.comp)), { explode: S.explode, cutaway: S.cutaway }); };
    function size() { const dpr = Math.min(2, window.devicePixelRatio || 1), w = canvas.clientWidth || 600, h = canvas.clientHeight || 400; if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); } return { W: canvas.width, H: canvas.height, k: dpr }; }
    function render() {
      const { W, H, k } = size(), sc = S.scene, mode = S.mode, holo = mode === 'holo', tech = mode === 'tech';
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.setLineDash([]);
      if (holo) { const bg = g.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H / 2, Math.max(W, H) * 0.75); bg.addColorStop(0, '#0d2c4a'); bg.addColorStop(0.6, '#061526'); bg.addColorStop(1, '#030a14'); g.fillStyle = bg; }
      else if (tech) g.fillStyle = '#ffffff';
      else { const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#f5f7fa'); bg.addColorStop(1, '#dde4eb'); g.fillStyle = bg; }
      g.fillRect(0, 0, W, H); S.faces = [];
      if (!sc || !sc.prisms.length) { g.fillStyle = holo ? '#7fe7ff' : '#4a5770'; g.font = `600 ${14 * k}px Inter, system-ui, sans-serif`; g.textAlign = 'center'; g.fillText('No 3D geometry yet', W / 2, H / 2); return; }
      const c = S.cam, cyw = Math.cos(c.yaw), syw = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), dist = sc.R * 3.2 / c.zoom, f = Math.min(W, H) * 1.2;
      const rot = v => { const x = v[0] * cyw + v[2] * syw, z = -v[0] * syw + v[2] * cyw, y = v[1]; return [x, y * cp - z * sp, y * sp + z * cp]; };
      const proj = q => { const d = Math.max(1e-3, dist - q[2]); return [W / 2 + c.px * k + q[0] * f / d, H / 2 + c.py * k - q[1] * f / d, q[2]]; };
      const L = [-0.4, 0.7, 0.6], Ln = Math.hypot(...L), LI = L.map(v => v / Ln);
      const faces = [];
      for (const P of sc.prisms) {
        const add = (pts, n, kind) => { const rp = pts.map(rot), nr = rot(n), z = rp.reduce((s, q) => s + q[2], 0) / rp.length; if (!tech && nr[2] < -0.02 && kind !== 'front') return; faces.push({ P, sp: rp.map(proj), z, nr, kind }); };
        add(P.front, [0, 0, 1], 'front'); add(P.back.slice().reverse(), [0, 0, -1], 'back'); P.sides.forEach(sd => add(sd.pts, sd.n, 'side'));
      }
      faces.sort((a, b) => a.z - b.z);
      if (holo) g.globalCompositeOperation = 'lighter';
      for (const F of faces) {
        const P = F.P, selOn = S.sel && P.comp === S.sel, base = hex((MATERIALS[P.fill] || MATERIALS.white)[1]), lit = Math.max(0.25, F.nr[0] * LI[0] + F.nr[1] * LI[1] + F.nr[2] * LI[2]);
        g.beginPath(); F.sp.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath();
        if (holo) {
          g.fillStyle = selOn ? 'rgba(255,185,158,.30)' : `rgba(85,216,255,${F.kind === 'front' ? 0.16 : 0.06})`; g.fill();
          g.strokeStyle = selOn ? 'rgba(255,185,158,.95)' : P.thin ? 'rgba(160,240,255,.95)' : 'rgba(85,216,255,.75)'; g.lineWidth = (F.kind === 'front' ? 1.3 : 0.7) * k;
          if (P.inferred) g.setLineDash([4 * k, 3 * k]); g.shadowColor = '#55d8ff'; g.shadowBlur = 6 * k; g.stroke(); g.shadowBlur = 0; g.setLineDash([]);
        } else if (tech) {
          g.globalAlpha = F.kind === 'front' ? 0.55 : 0.12; g.fillStyle = selOn ? '#ffb99e' : `rgb(${base.join(',')})`; g.fill(); g.globalAlpha = 1;
          g.strokeStyle = selOn ? '#c8412f' : '#1b2533'; g.lineWidth = (F.kind === 'front' ? 1.1 : 0.5) * k; if (P.inferred) g.setLineDash([4 * k, 3 * k]); g.stroke(); g.setLineDash([]);
        } else {
          const shade = F.kind === 'front' ? 1 : lit;
          g.fillStyle = F.kind === 'front' ? texture(g, P.fill) : `rgb(${base.map(v => Math.round(v * (0.55 + 0.45 * shade))).join(',')})`; g.fill();
          if (F.kind === 'front') { g.fillStyle = `rgba(0,0,0,${(1 - lit) * 0.25})`; g.fill(); }
          if (P.fill === 'glass' || P.fill === 'vapor') { g.fillStyle = 'rgba(255,255,255,.25)'; g.fill(); }
          g.strokeStyle = selOn ? '#ff9b76' : 'rgba(20,34,56,.55)'; g.lineWidth = (selOn ? 2 : 0.6) * k; if (P.inferred) g.setLineDash([4 * k, 3 * k]); g.stroke(); g.setLineDash([]);
        }
        S.faces.push(F);
      }
      g.globalCompositeOperation = 'source-over';
      // labels: one leader per component, at its front-face centroid (Technical and Hologram, or the selected one)
      const seen = new Set(), labels = [];
      for (const F of faces) { if (F.kind !== 'front' || seen.has(F.P.key)) continue; if (!(tech || holo || (S.sel && F.P.comp === S.sel))) continue; seen.add(F.P.key); const cxy = F.sp.reduce((s, q) => [s[0] + q[0] / F.sp.length, s[1] + q[1] / F.sp.length], [0, 0]); labels.push({ x: cxy[0], y: cxy[1], t: F.P.name + (F.P.inferred ? ' (inferred)' : ''), sel: S.sel && F.P.comp === S.sel }); }
      labels.sort((a, b) => a.y - b.y);
      const fs = 11 * k, lx = W - 12 * k; let ly = 16 * k;
      g.font = `600 ${fs}px Inter, system-ui, sans-serif`; g.textAlign = 'right';
      for (const lb of labels.slice(0, 18)) {
        const ty = Math.max(ly, Math.min(H - 8 * k, lb.y)); ly = ty + fs * 1.5;
        g.strokeStyle = holo ? 'rgba(127,231,255,.6)' : lb.sel ? '#c8412f' : 'rgba(20,34,56,.55)'; g.lineWidth = 0.8 * k; g.beginPath(); g.moveTo(lb.x, lb.y); const tw = g.measureText(lb.t).width; g.lineTo(lx - tw - 10 * k, ty - fs * 0.35); g.lineTo(lx - tw - 4 * k, ty - fs * 0.35); g.stroke();
        g.fillStyle = holo ? 'rgba(3,10,20,.7)' : 'rgba(255,255,255,.85)'; g.fillRect(lx - tw - 3 * k, ty - fs * 1.05, tw + 6 * k, fs * 1.4);
        g.fillStyle = holo ? (lb.sel ? '#ffb99e' : '#bff4ff') : lb.sel ? '#c8412f' : '#142238'; g.fillText(lb.t, lx, ty);
        g.beginPath(); g.arc(lb.x, lb.y, 2.4 * k, 0, 7); g.fill();
      }
    }
    // interaction
    const ptrs = new Map(); let pinch0 = 0, zoom0 = 1, moved = false;
    canvas.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, sh: e.shiftKey }); moved = false; try { canvas.setPointerCapture(e.pointerId); } catch (_e) { /* */ } if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = S.cam.zoom; } });
    canvas.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      if (ptrs.size === 2) { ptrs.set(e.pointerId, { ...p, x: e.clientX, y: e.clientY }); const [a, b] = [...ptrs.values()]; if (pinch0) S.cam.zoom = Math.max(0.3, Math.min(4, zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0)); }
      else if (p.b === 2 || p.sh) { S.cam.px += dx; S.cam.py += dy; ptrs.set(e.pointerId, { ...p, x: e.clientX, y: e.clientY }); }
      else { S.cam.yaw += dx * 0.008; S.cam.pitch = Math.max(-1.2, Math.min(1.45, S.cam.pitch + dy * 0.006)); ptrs.set(e.pointerId, { ...p, x: e.clientX, y: e.clientY }); }
      render();
    });
    const up = e => { const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; if (p && !moved && e.type === 'pointerup') pick(e); };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); S.cam.zoom = Math.max(0.3, Math.min(4, S.cam.zoom * Math.exp(-e.deltaY * 0.0012))); render(); }, { passive: false });
    canvas.addEventListener('dblclick', () => { S.cam = { yaw: -0.65, pitch: 0.38, zoom: 1, px: 0, py: 0 }; render(); });
    canvas.addEventListener('keydown', e => { const m = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }[e.key]; if (m) { e.preventDefault(); S.cam.yaw += m[0]; S.cam.pitch = Math.max(-1.2, Math.min(1.45, S.cam.pitch + m[1])); render(); } if (e.key === '+' || e.key === '=') { S.cam.zoom = Math.min(4, S.cam.zoom * 1.15); render(); } if (e.key === '-') { S.cam.zoom = Math.max(0.3, S.cam.zoom / 1.15); render(); } });
    function pick(e) {
      const r = canvas.getBoundingClientRect(), k = canvas.width / r.width, x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
      for (let i = S.faces.length - 1; i >= 0; i--) { const F = S.faces[i]; if (window.DrawUpVDIGeo.inside([x, y], F.sp.map(q => [q[0], q[1]]))) { S.sel = F.P.comp || null; render(); o.onPick?.(S.sel); return; } }
      S.sel = null; render(); o.onPick?.(null);
    }
    if (window.ResizeObserver) new ResizeObserver(() => render()).observe(canvas);
    return {
      setModel(drawing, comps) { S.regions = window.DrawUpVDIGeo.regionsOf(drawing, comps); build(); render(); },
      setMode(m) { S.mode = m; render(); }, setExplode(v) { S.explode = Math.max(0, Math.min(1, +v || 0)); build(); render(); }, setCutaway(on) { S.cutaway = !!on; build(); render(); },
      setHidden(set) { S.hidden = new Set(set); build(); render(); }, select(comp) { S.sel = comp; render(); }, render,
      png: () => canvas.toDataURL('image/png'),
      get mode() { return S.mode; },
    };
  }

  window.DrawUpVDIView = { Sheet2D, Holo3D, MATERIALS, layeredSVG, renderSVG };
})();
