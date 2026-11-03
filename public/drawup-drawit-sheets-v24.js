/* DrawUp V24 "Draw it up" sheet engine.
 * Draws a coordinated architectural sheet set from ONE building model (see src/lib/drawup-drawings-core.ts):
 *   G001 Cover + notes · A101.. Floor plans (+ roof plan) · A201 Exterior elevations · A301 Building sections
 *   A501.. Wall section + details (and the details the set still needs) · A601 Foundation + roof framing · A800 Schedules
 * Every view is cut from the same geometry, so tags, dimensions and levels agree across the set.
 * Sheets are ARCH D (36 x 24 in). SVG units are 1/100 in, so 1/4" = 1'-0" is 25 units per foot and prints true.
 * window.DrawUpSheets.render(model, opts) -> [{ num, title, svg }]
 */
(function () {
  'use strict';
  const SW = 3600, SH = 2400, TB = 3130, M = 50; // sheet, title block left edge, border margin
  const FONT = 'Arial, Helvetica, sans-serif';
  const SCALES = [[50, '1/2" = 1\'-0"'], [37.5, '3/8" = 1\'-0"'], [25, '1/4" = 1\'-0"'], [18.75, '3/16" = 1\'-0"'], [12.5, '1/8" = 1\'-0"'], [9.375, '3/32" = 1\'-0"'], [6.25, '1/16" = 1\'-0"'], [3.125, '1/32" = 1\'-0"']];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r1 = v => Math.round(v * 10) / 10;
  const SIDES = ['front', 'right', 'back', 'left'];
  const SIDE_NAME = { front: 'FRONT', right: 'RIGHT SIDE', back: 'REAR', left: 'LEFT SIDE' };

  /** 12.5 -> 12'-6"  (nearest 1/2 inch) */
  function ftin(ft) {
    const neg = ft < 0; let inches = Math.round(Math.abs(ft) * 24) / 2; let f = Math.floor(inches / 12); inches -= f * 12;
    if (inches >= 12) { f += 1; inches -= 12; }
    const i = inches % 1 ? Math.floor(inches) + ' 1/2' : String(inches);
    return (neg ? '-' : '') + f + "'-" + i + '"';
  }
  const elev = ft => { const v = 100 + ft; return ftin(v).replace(/^/, ''); };

  /* ------------------------------------------------------------------ svg pen */
  function Pen() {
    const out = [];
    const p = {
      out,
      raw(s) { out.push(s); return p; },
      line(x1, y1, x2, y2, w = 1.2, extra = '') { out.push(`<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="#000" stroke-width="${w}"${extra}/>`); return p; },
      dash(x1, y1, x2, y2, w = 0.8, d = '12 8') { return p.line(x1, y1, x2, y2, w, ` stroke-dasharray="${d}"`); },
      rect(x, y, w, h, sw = 1.2, fill = 'none', extra = '') { out.push(`<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="${fill}"${/\sstroke=/.test(extra) ? '' : ` stroke="${sw ? '#000' : 'none'}" stroke-width="${sw}"`}${extra}/>`); return p; },
      poly(pts, sw = 1.2, fill = 'none', extra = '') { out.push(`<polygon points="${pts.map(q => r1(q[0]) + ',' + r1(q[1])).join(' ')}" fill="${fill}" stroke="#000" stroke-width="${sw}" stroke-linejoin="round"${extra}/>`); return p; },
      pline(pts, sw = 1.2, extra = '') { out.push(`<polyline points="${pts.map(q => r1(q[0]) + ',' + r1(q[1])).join(' ')}" fill="none" stroke="#000" stroke-width="${sw}" stroke-linejoin="round"${extra}/>`); return p; },
      circle(x, y, r, sw = 1.2, fill = 'none') { out.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="${fill}" stroke="#000" stroke-width="${sw}"/>`); return p; },
      path(d, sw = 1.2, fill = 'none', extra = '') { out.push(`<path d="${d}" fill="${fill}" stroke="#000" stroke-width="${sw}"${extra}/>`); return p; },
      text(x, y, s, size = 10, anchor = 'start', weight = 'normal', extra = '') { out.push(`<text x="${r1(x)}" y="${r1(y)}" font-family="${FONT}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}"${extra}>${esc(s)}</text>`); return p; },
      /** Wrapped text; returns the y below the last line. */
      para(x, y, s, size, width, lh = 1.35, weight = 'normal') {
        const per = Math.max(8, Math.floor(width / (size * 0.53)));
        const words = String(s || '').split(/\s+/); let line = '';
        for (const w of words) { if ((line + ' ' + w).trim().length > per) { p.text(x, y, line, size, 'start', weight); y += size * lh; line = w; } else line = (line + ' ' + w).trim(); }
        if (line) { p.text(x, y, line, size, 'start', weight); y += size * lh; }
        return y;
      },
      svg() { return out.join(''); },
    };
    return p;
  }
  const lines = (s, size, width) => { const per = Math.max(8, Math.floor(width / (size * 0.53))); let n = 0, line = ''; for (const w of String(s || '').split(/\s+/)) { if ((line + ' ' + w).trim().length > per) { n++; line = w; } else line = (line + ' ' + w).trim(); } return n + (line ? 1 : 0); };

  /* ------------------------------------------------------------------ building geometry */
  function Geo(m) {
    const W = m.footprint.width_ft, D = m.footprint.depth_ft, H = Math.max(m.wall_height_ft, (m.stories - 1) * m.floor_to_floor_ft + 8);
    const roof = m.roof, type = roof.type === 'flat' ? 'shed' : roof.type;
    const rise = (roof.type === 'flat' ? 0.25 : roof.pitch_rise_in_12) / 12, o = (roof.overhang_in || 0) / 12;
    const high = roof.type === 'flat' ? 'back' : roof.shed_high_side;
    const t = roof.type === 'flat' ? 1.0 : Math.max(0.6, 0.55 + (/2x(10|12)/.test(roof.roof_framing?.member || '') ? 0.3 : 0.1));
    const spanAxisY = roof.ridge_axis !== 'depth'; // gable ridge along width -> span measured along y
    const span = type === 'gable' ? (spanAxisY ? D : W) : type === 'hip' ? Math.min(W, D) : (high === 'front' || high === 'back' ? D : W);
    /** Height of the roof underside (top of plate line extended) above level 1 floor at plan point (x, y). */
    function under(x, y) {
      if (type === 'gable') { const v = spanAxisY ? y : x; return H + rise * Math.min(v, span - v); }
      if (type === 'hip') return H + rise * Math.min(x, W - x, y, D - y);
      const d = high === 'back' ? y : high === 'front' ? D - y : high === 'right' ? x : W - x; return H + rise * d;
    }
    const peak = type === 'shed' ? H + rise * span : H + rise * span / 2;
    const wallTb = { '2x4': 0.5, '2x6': 0.67, cmu: 0.75, steel_stud: 0.6 }[m.wall_assembly.stud] || 0.67;
    /** Plan point for a distance u along a wall, measured from the left end as seen from outside. */
    function onWall(side, u) { return side === 'front' ? [u, 0] : side === 'back' ? [W - u, D] : side === 'left' ? [0, D - u] : [W, u]; }
    const wallLen = side => (side === 'front' || side === 'back' ? W : D);
    /** For the view of `side`: plan point for (u along view, w depth from the viewer). */
    function viewPt(side, u, w) { return side === 'front' ? [u, w] : side === 'back' ? [W - u, D - w] : side === 'left' ? [w, D - u] : [W - w, u]; }
    const grade = -(m.floor_above_grade_in || 0) / 12;
    const levels = []; for (let i = 0; i < m.stories; i++) levels.push(i * m.floor_to_floor_ft);
    return { W, D, H, rise, o, t, type, high, span, under, peak, wallT: wallTb, onWall, wallLen, viewPt, grade, levels };
  }

  /* ------------------------------------------------------------------ marks */
  function marks(m) {
    const doors = [], windows = [], types = [];
    const rooms = m.rooms.map((r, i) => ({ ...r, num: r.level * 100 + 1 + m.rooms.filter((x, j) => j < i && x.level === r.level).length }));
    m.openings.forEach((o, i) => {
      if (o.kind === 'window') {
        const key = [o.width_ft, o.height_ft, o.sill_ft].join('|');
        let tp = types.find(x => x.key === key); if (!tp) { tp = { key, mark: String.fromCharCode(65 + types.length % 26) + (types.length >= 26 ? Math.floor(types.length / 26) : ''), o }; types.push(tp); }
        windows.push({ ...o, i, mark: tp.mark });
      } else doors.push({ ...o, i, mark: String(o.level * 100 + 1 + doors.filter(d => d.level === o.level).length).padStart(3, '0') });
    });
    const byIndex = {}; doors.forEach(d => byIndex[d.i] = d.mark); windows.forEach(w => byIndex[w.i] = w.mark);
    return { rooms, doors, windows, types, byIndex };
  }
  function header(span) { // rough header sizes for wood framing; flagged for structural verification on the sheet
    if (span <= 3.5) return '(2) 2x6'; if (span <= 5) return '(2) 2x8'; if (span <= 6.5) return '(2) 2x10'; if (span <= 8) return '(2) 2x12';
    return 'LVL / BY STRUCTURAL';
  }

  /* ------------------------------------------------------------------ dimension strings */
  function dimH(p, x1, x2, y, tick = 7, text = null, size = 10, above = true) {
    p.line(x1, y, x2, y, 0.7);
    for (const x of [x1, x2]) { p.line(x - tick, y + tick, x + tick, y - tick, 1.4); p.line(x, y - 12, x, y + 12, 0.5); }
    const t = text == null ? '' : text; if (t && Math.abs(x2 - x1) > t.length * size * 0.45) p.text((x1 + x2) / 2, y + (above ? -5 : size + 4), t, size, 'middle');
  }
  function dimV(p, x, y1, y2, tick = 7, text = null, size = 10) {
    p.line(x, y1, x, y2, 0.7);
    for (const y of [y1, y2]) { p.line(x - tick, y + tick, x + tick, y - tick, 1.4); p.line(x - 12, y, x + 12, y, 0.5); }
    if (text && Math.abs(y2 - y1) > text.length * size * 0.45) p.raw(`<text x="${r1(x - 5)}" y="${r1((y1 + y2) / 2)}" font-family="${FONT}" font-size="${size}" text-anchor="middle" transform="rotate(-90 ${r1(x - 5)} ${r1((y1 + y2) / 2)})">${esc(text)}</text>`);
  }
  function chain(p, pts, at, s, horiz, side) { // pts in feet along the axis; draws one string with every segment labeled
    const v = [...new Set(pts.map(x => Math.round(x * 24) / 24))].sort((a, b) => a - b);
    for (let i = 1; i < v.length; i++) {
      if (horiz) dimH(p, at.o + v[i - 1] * s, at.o + v[i] * s, at.c, 7, ftin(v[i] - v[i - 1]), 10, side !== 'below');
      else dimV(p, at.c, at.o - v[i - 1] * s, at.o - v[i] * s, 7, ftin(v[i] - v[i - 1]), 10);
    }
  }
  const bubble = (p, x, y, label, r = 22, size = 16) => { p.circle(x, y, r, 1.6, '#fff'); p.text(x, y + size * 0.36, label, size, 'middle', 'bold'); };
  function refBubble(p, x, y, num, sheet, r = 26) { p.circle(x, y, r, 1.6, '#fff'); p.line(x - r, y, x + r, y, 1); p.text(x, y - 6, num, 15, 'middle', 'bold'); p.text(x, y + 18, sheet, 10, 'middle'); }
  function viewTitle(p, x, y, num, sheet, title, scale, width = 700) {
    refBubble(p, x + 30, y, num, sheet, 28); p.text(x + 72, y + 6, title, 22, 'start', 'bold'); p.line(x + 72, y + 14, x + width, y + 14, 2.4);
    if (scale) p.text(x + 72, y + 34, 'SCALE: ' + scale, 11);
  }
  const pickScale = (wFt, hFt, availW, availH, max = 50) => SCALES.find(([s]) => s <= max && wFt * s <= availW && hFt * s <= availH) || SCALES[SCALES.length - 1];
  const hatch = (id, ang = 45, gap = 8, w = 0.5) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}" patternTransform="rotate(${ang})"><line x1="0" y1="0" x2="0" y2="${gap}" stroke="#000" stroke-width="${w}"/></pattern>`;
  const DEFS = `<defs>${hatch('h45')}${hatch('h45w', 45, 14, 0.5)}${hatch('h135', 135, 8)}<pattern id="conc" patternUnits="userSpaceOnUse" width="24" height="24"><circle cx="5" cy="6" r="1.2" fill="#000"/><circle cx="16" cy="15" r="1" fill="#000"/><path d="M14 4 l3 3 l-4 1z" fill="none" stroke="#000" stroke-width=".6"/><circle cx="7" cy="19" r=".8" fill="#000"/></pattern><pattern id="earth" patternUnits="userSpaceOnUse" width="30" height="30"><path d="M0 30 L30 0 M-5 5 L5 -5 M25 35 L35 25" stroke="#000" stroke-width=".7"/><path d="M0 15 L15 0" stroke="#000" stroke-width=".4"/></pattern><pattern id="batt" patternUnits="userSpaceOnUse" width="20" height="20"><path d="M0 10 Q5 0 10 10 T20 10" fill="none" stroke="#000" stroke-width=".7"/></pattern></defs>`;

  /* ------------------------------------------------------------------ title block */
  function titleBlock(p, ctx, sheet) {
    const x = TB, w = SW - M - TB, m = ctx.model;
    p.rect(M, M, SW - 2 * M, SH - 2 * M, 4); p.line(x, M, x, SH - M, 3);
    let y = M + 20;
    p.rect(x + 20, y, w - 40, 110, 0, '#0b1d33'); p.text(x + 40, y + 74, 'DU', 64, 'start', 'bold', ' fill="#fff"'); p.text(x + 150, y + 48, 'DRAWUP', 26, 'start', 'bold', ' fill="#7fe7ff"'); p.text(x + 150, y + 76, 'DETAIL + DOCUMENTATION', 11, 'start', 'normal', ' fill="#fff"'); p.text(x + 150, y + 92, 'SYSTEM', 11, 'start', 'normal', ' fill="#fff"');
    y += 150; p.text(x + 20, y, 'PROJECT', 10); y += 26;
    y = p.para(x + 20, y, String(m.title).toUpperCase(), 20, w - 40, 1.15, 'bold');
    y = p.para(x + 20, y + 4, [m.building_use, ctx.location].filter(Boolean).join(' · ').toUpperCase(), 10, w - 40);
    y += 14; p.line(x, y, SW - M, y, 1.5);
    // status stamp
    y += 20; p.rect(x + 20, y, w - 40, 96, 3);
    const st = ctx.status || 'PRELIMINARY';
    p.text(x + w / 2, y + 36, st, st.length > 16 ? 18 : 24, 'middle', 'bold');
    p.text(x + w / 2, y + 60, ctx.reviewer ? 'REVIEWED BY ' + String(ctx.reviewer).toUpperCase() : 'NOT FOR CONSTRUCTION UNTIL REVIEWED', 10, 'middle', 'bold');
    p.text(x + w / 2, y + 78, 'BY A LICENSED DESIGN PROFESSIONAL + THE AHJ', 9, 'middle');
    y += 120; p.line(x, y, SW - M, y, 1.5);
    y += 24; p.text(x + 20, y, 'ISSUE', 10); y += 20; p.text(x + 20, y, 'NO.', 10, 'start', 'bold'); p.text(x + 70, y, 'DESCRIPTION', 10, 'start', 'bold'); p.text(SW - M - 20, y, 'DATE', 10, 'end', 'bold'); p.line(x + 20, y + 6, SW - M - 20, y + 6, 0.8);
    const rows = [{ no: '1', desc: ctx.level === 'preliminary' ? 'PRELIMINARY / SCHEMATIC SET' : st === 'PRELIMINARY' ? 'DRAWUP GENERATED SET' : st, date: ctx.firstDate || ctx.date }, ...ctx.revisions.slice(-3).map(r => ({ no: String(r.no), desc: String(r.desc || 'REVISION ' + r.no).toUpperCase().slice(0, 30), date: r.date || '', rev: true }))];
    for (let i = 0; i < 4; i++) {
      y += 22; const r = rows[i];
      if (r) { if (r.rev) { p.poly([[x + 26, y + 3], [x + 44, y + 3], [x + 35, y - 13]], 1, '#fff'); p.text(x + 35, y + 1, r.no, 8, 'middle', 'bold'); } else p.text(x + 20, y, r.no, 10); p.text(x + 70, y, r.desc, 10); p.text(SW - M - 20, y, r.date, 10, 'end'); }
      p.line(x + 20, y + 6, SW - M - 20, y + 6, 0.4);
    }
    y += 30; p.line(x, y, SW - M, y, 1.5);
    y += 24; p.text(x + 20, y, 'SHEET INDEX', 10); y += 6;
    for (const s of ctx.index) { y += 19; if (s.num === sheet.num) p.rect(x + 14, y - 13, 6, 16, 0, '#000'); p.text(x + 26, y, s.num, 10, 'start', s.num === sheet.num ? 'bold' : 'normal'); p.text(x + 90, y, s.title.toUpperCase().slice(0, 30), 10, 'start', s.num === sheet.num ? 'bold' : 'normal'); }
    y += 24; p.line(x, y, SW - M, y, 1.5);
    y += 26; [['DRAWN BY', 'DRAWUP'], ['CHECKED BY', ctx.reviewer ? String(ctx.reviewer).toUpperCase().slice(0, 22) : '—'], ['LICENSE', ctx.license ? String(ctx.license).toUpperCase().slice(0, 22) : '—'], ['SCALE', sheet.scale || 'AS NOTED'], ['DATUM', 'T.O. SLAB = 100\'-0"']].forEach(([a, b]) => { p.text(x + 20, y, a, 10); p.text(x + 150, y, b, 10, 'start', 'bold'); y += 20; });
    y += 6; p.para(x + 20, y, 'Generated by DrawUp from the source picture. Dimensions marked as estimates, member sizes and code items must be verified for the site, loads and adopted code before construction.', 9, w - 40);
    // sheet title + number
    p.line(x, SH - M - 360, SW - M, SH - M - 360, 1.5);
    p.text(x + 20, SH - M - 330, 'SHEET TITLE', 10);
    let ty = SH - M - 290; for (const l of sheet.title.toUpperCase().split(' + ')) { p.text(x + 20, ty, l + (sheet.title.toUpperCase().split(' + ').indexOf(l) < sheet.title.split(' + ').length - 1 ? ' +' : ''), 26, 'start', 'bold'); ty += 32; }
    p.line(x, SH - M - 190, SW - M, SH - M - 190, 1.5); p.text(x + 20, SH - M - 160, 'SHEET NO.', 10);
    p.text(x + w / 2, SH - M - 40, sheet.num, 110, 'middle', 'bold');
    p.text(M + 10, SH - M - 12, 'DRAWUP GENERATED DRAWING · EVERY VIEW ON EVERY SHEET IS CUT FROM ONE BUILDING MODEL, SO TAGS, DIMENSIONS + LEVELS AGREE ACROSS THE SET · VERIFY BEFORE CONSTRUCTION', 9);
  }
  const wrapSheet = (inner, ctx, sheet) => { const p = Pen(); titleBlock(p, ctx, sheet); return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SW} ${SH}" width="${SW}" height="${SH}"><rect width="${SW}" height="${SH}" fill="#fff"/>${DEFS}${inner}${p.svg()}</svg>`; };

  /* ------------------------------------------------------------------ plan */
  function drawPlan(p, ctx, level, ox, oy, s, opts = {}) {
    const { m, g, mk } = ctx, { W, D } = g, T = g.wallT;
    const X = x => ox + x * s, Y = y => oy - y * s;
    // porch / stoop under everything
    if (m.porch.present && level === 1) {
      const P = porchRect(m, g); p.rect(X(P.x), Y(P.y + P.d), P.w * s, P.d * s, 0.8, 'url(#conc)', ' stroke-dasharray="10 6"');
      const posts = porchPosts(P); posts.forEach(([x, y]) => p.rect(X(x) - 0.25 * s, Y(y) - 0.25 * s, 0.5 * s, 0.5 * s, 1.4, '#000'));
      p.text(X(P.x + P.w / 2), Y(P.y + P.d / 2) + 4, 'COVERED PORCH', 11, 'middle', 'bold');
    }
    // exterior walls with openings cut
    const ops = m.openings.map((o, i) => ({ ...o, i })).filter(o => o.level === level);
    for (const side of SIDES) {
      const L = g.wallLen(side), mine = ops.filter(o => o.wall === side).sort((a, b) => a.center_ft - b.center_ft);
      const cuts = mine.map(o => [o.center_ft - o.width_ft / 2, o.center_ft + o.width_ft / 2]);
      let start = 0; const segs = [];
      for (const [a, b] of cuts) { if (a > start) segs.push([start, a]); start = Math.max(start, b); }
      if (start < L) segs.push([start, L]);
      for (const [a, b] of segs) {
        const p1 = g.onWall(side, a), p2 = g.onWall(side, b);
        const xs = [p1[0], p2[0]].sort((q, r) => q - r), ys = [p1[1], p2[1]].sort((q, r) => q - r);
        let x0 = xs[0], x1 = xs[1], y0 = ys[0], y1 = ys[1];
        if (side === 'front') { y1 = T; } else if (side === 'back') { y0 = D - T; } else if (side === 'left') { x1 = T; y0 = Math.max(y0, 0); } else { x0 = W - T; }
        if (side === 'left' || side === 'right') { y0 = Math.max(y0, side === 'left' || side === 'right' ? (a === 0 || b === L ? y0 : y0) : y0); }
        p.rect(X(x0), Y(y1), (x1 - x0) * s, (y1 - y0) * s, 2.2, 'url(#h45)');
      }
      for (const o of mine) drawOpeningPlan(p, ctx, side, o, X, Y, s);
    }
    // interior partitions from room edges that are not on the exterior
    const rooms = mk.rooms.filter(r => r.level === level), done = new Set(), it = 0.375;
    for (const r of rooms) {
      const edges = [[r.x_ft, r.y_ft, r.x_ft + r.w_ft, r.y_ft], [r.x_ft, r.y_ft + r.d_ft, r.x_ft + r.w_ft, r.y_ft + r.d_ft], [r.x_ft, r.y_ft, r.x_ft, r.y_ft + r.d_ft], [r.x_ft + r.w_ft, r.y_ft, r.x_ft + r.w_ft, r.y_ft + r.d_ft]];
      for (const [x1, y1, x2, y2] of edges) {
        const horiz = y1 === y2, onExt = horiz ? (y1 < T + 0.6 || y1 > D - T - 0.6) : (x1 < T + 0.6 || x1 > W - T - 0.6);
        const k = [x1, y1, x2, y2].map(v => Math.round(v * 2)).join(); if (onExt || done.has(k)) continue; done.add(k);
        const a = Math.max(horiz ? x1 : y1, T), b = Math.min(horiz ? x2 : y2, horiz ? W - T : D - T); if (b - a < 0.5) continue;
        if (horiz) p.rect(X(a), Y(y1 + it / 2), (b - a) * s, it * s, 1.4, '#fff');
        else p.rect(X(x1 - it / 2), Y(b), it * s, (b - a) * s, 1.4, '#fff');
      }
    }
    for (const r of rooms) { const cx = X(r.x_ft + r.w_ft / 2), cy = Y(r.y_ft + r.d_ft / 2); const sz = Math.min(18, Math.max(9, r.w_ft * s / Math.max(8, r.name.length) * 1.2)); p.text(cx, cy - 4, r.name.toUpperCase(), sz, 'middle', 'bold'); p.rect(cx - 22, cy + 4, 44, 20, 1); p.text(cx, cy + 19, String(r.num), 12, 'middle'); p.text(cx, cy + 40, Math.round(r.w_ft * r.d_ft) + ' SF', 9, 'middle'); }
    if (!rooms.length) { p.text(X(W / 2), Y(D / 2), (m.building_use || 'ROOM').toUpperCase().slice(0, 30), 16, 'middle', 'bold'); p.text(X(W / 2), Y(D / 2) + 22, Math.round((W - 2 * T) * (D - 2 * T)) + ' SF NET', 10, 'middle'); }
    if (opts.annotate === false) return;
    // grids
    const gx = [0, W], gy = [0, D];
    { const ex = ctx.porchEx || { l: 0, r: 0, f: 0, b: 0 };
      gx.forEach((x, i) => { p.dash(X(x), Y(D + ex.b) - 185, X(x), Y(-ex.f) + 185, 0.6, '30 8 6 8'); bubble(p, X(x), Y(D + ex.b) - 208, String(i + 1)); bubble(p, X(x), Y(-ex.f) + 208, String(i + 1)); });
      gy.forEach((y, i) => { const lab = String.fromCharCode(65 + i); p.dash(X(-ex.l) - 185, Y(y), X(W + ex.r) + 185, Y(y), 0.6, '30 8 6 8'); bubble(p, X(-ex.l) - 208, Y(y), lab); bubble(p, X(W + ex.r) + 208, Y(y), lab); }); }
    // dimension strings (outside faces)
    for (const side of SIDES) {
      const mine = ops.filter(o => o.wall === side), L = g.wallLen(side);
      const cen = mine.map(o => side === 'front' ? o.center_ft : side === 'back' ? W - o.center_ft : side === 'left' ? D - o.center_ft : o.center_ft);
      const ex = ctx.porchEx || { l: 0, r: 0, f: 0, b: 0 };
      if (side === 'front') { chain(p, [0, ...cen, W], { o: ox, c: Y(-ex.f) + 60 }, s, true, 'below'); dimH(p, X(0), X(W), Y(-ex.f) + 100, 7, ftin(W), 11, false); }
      if (side === 'back') { chain(p, [0, ...cen, W], { o: ox, c: Y(D + ex.b) - 60 }, s, true); dimH(p, X(0), X(W), Y(D + ex.b) - 100, 7, ftin(W), 11); }
      if (side === 'left') { chain(p, [0, ...cen, D], { o: oy, c: X(-ex.l) - 60 }, s, false); dimV(p, X(-ex.l) - 100, Y(0), Y(D), 7, ftin(D), 11); }
      if (side === 'right') { chain(p, [0, ...cen, D], { o: oy, c: X(W + ex.r) + 60 }, s, false); dimV(p, X(W + ex.r) + 110, Y(0), Y(D), 7, ftin(D), 11); }
      void L;
    }
    // section cuts + elevation markers
    const sx = sectionX(ctx), sy = D * 0.5, ex = ctx.porchEx || { l: 0, r: 0, f: 0, b: 0 };
    p.dash(X(sx), Y(D + ex.b) - 130, X(sx), Y(-ex.f) + 130, 2, '40 10 8 10'); refBubble(p, X(sx), Y(D + ex.b) - 155, '1', 'A301'); refBubble(p, X(sx), Y(-ex.f) + 155, '1', 'A301');
    p.dash(X(-ex.l) - 130, Y(sy), X(W + ex.r) + 130, Y(sy), 2, '40 10 8 10'); refBubble(p, X(-ex.l) - 155, Y(sy), '2', 'A301'); refBubble(p, X(W + ex.r) + 155, Y(sy), '2', 'A301');
    const em = { front: [X(W * 0.25), Y(-ex.f) + 270, 0], back: [X(W * 0.25), Y(D + ex.b) - 270, 180], left: [X(-ex.l) - 270, Y(D * 0.25), 90], right: [X(W + ex.r) + 270, Y(D * 0.25), 270] };
    SIDES.forEach((sd, i) => { const [x, y, rot] = em[sd]; p.raw(`<g transform="translate(${r1(x)} ${r1(y)}) rotate(${rot})"><polygon points="0,-44 -30,-14 30,-14" fill="#000"/></g>`); refBubble(p, x, y, String(i + 1), 'A201', 22); });
  }
  function drawOpeningPlan(p, ctx, side, o, X, Y, s) {
    const { g, mk } = ctx, T = g.wallT;
    const a = g.onWall(side, o.center_ft - o.width_ft / 2), b = g.onWall(side, o.center_ft + o.width_ft / 2);
    const inward = { front: [0, 1], back: [0, -1], left: [1, 0], right: [-1, 0] }[side];
    const at = (pt, d) => [X(pt[0] + inward[0] * d), Y(pt[1] + inward[1] * d)];
    const mark = mk.byIndex[o.i];
    // jamb lines
    p.line(...at(a, 0), ...at(a, T), 1.6); p.line(...at(b, 0), ...at(b, T), 1.6);
    if (o.kind === 'window') {
      p.line(...at(a, 0), ...at(b, 0), 0.8); p.line(...at(a, T), ...at(b, T), 0.8); p.line(...at(a, T / 2), ...at(b, T / 2), 1.4);
      const out = at([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], T + 22 / s); hexTag(p, out[0], out[1], mark);
    } else if (o.kind === 'overhead_door') {
      p.dash(...at(a, T + 0.2), ...at(b, T + 0.2), 1, '8 6'); const c = at([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], T + 1.4); p.text(c[0], c[1] + 4, 'OVERHEAD DOOR', 9, 'middle');
      const out = at([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], T + Math.min(o.width_ft * 0.5, 4) + 22 / s); doorTag(p, out[0], out[1], mark);
    } else {
      const leaves = o.kind === 'double_door' ? [[a, o.width_ft / 2, b], [b, o.width_ft / 2, a]] : [[a, o.width_ft, b]];
      for (const [hinge, len, toward] of leaves) {
        const h = at(hinge, T), open = [h[0] + inward[0] * len * s, h[1] - inward[1] * len * s];
        const dir = [(toward[0] - hinge[0]) / Math.hypot(toward[0] - hinge[0], toward[1] - hinge[1]), (toward[1] - hinge[1]) / Math.hypot(toward[0] - hinge[0], toward[1] - hinge[1])];
        const closed = [h[0] + dir[0] * len * s, h[1] - dir[1] * len * s];
        p.line(h[0], h[1], open[0], open[1], 1.6);
        const sweep = (dir[0] * inward[1] - dir[1] * inward[0]) > 0 ? 0 : 1;
        p.path(`M${r1(open[0])} ${r1(open[1])} A${r1(len * s)} ${r1(len * s)} 0 0 ${sweep} ${r1(closed[0])} ${r1(closed[1])}`, 0.6);
      }
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, k = 1 + 34 / s / len; // just past the jamb, inside
      const out = at([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], T + 20 / s); doorTag(p, out[0], out[1], mark);
    }
  }
  const doorTag = (p, x, y, mark) => { p.raw(`<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="30" ry="15" fill="#fff" stroke="#000" stroke-width="1.2"/>`); p.text(x, y + 4.5, mark, 12, 'middle', 'bold'); };
  const hexTag = (p, x, y, mark) => { const r = 17; p.poly([0, 1, 2, 3, 4, 5].map(i => [x + r * Math.cos(Math.PI / 3 * i), y + r * Math.sin(Math.PI / 3 * i)]), 1.2, '#fff'); p.text(x, y + 4.5, mark, 12, 'middle', 'bold'); };
  function porchRect(m, g) {
    const P = m.porch, { W, D } = g, len = Math.min(P.length_ft, (P.side === 'front' || P.side === 'back') ? W : D), d = P.depth_ft;
    if (P.side === 'front') return { x: (W - len) / 2, y: -d, w: len, d, side: 'front' };
    if (P.side === 'back') return { x: (W - len) / 2, y: D, w: len, d, side: 'back' };
    if (P.side === 'left') return { x: -d, y: (D - len) / 2, w: d, d: len, side: 'left' };
    return { x: W, y: (D - len) / 2, w: d, d: len, side: 'right' };
  }
  function porchPosts(P) {
    const n = Math.max(2, Math.ceil(((P.side === 'front' || P.side === 'back') ? P.w : P.d) / 10) + 1), out = [];
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      if (P.side === 'front') out.push([P.x + 0.5 + f * (P.w - 1), P.y + 0.5]); else if (P.side === 'back') out.push([P.x + 0.5 + f * (P.w - 1), P.y + P.d - 0.5]);
      else if (P.side === 'left') out.push([P.x + 0.5, P.y + 0.5 + f * (P.d - 1)]); else out.push([P.x + P.w - 0.5, P.y + 0.5 + f * (P.d - 1)]);
    }
    return out;
  }
  function roofPlan(p, ctx, ox, oy, s) {
    const { m, g } = ctx, { W, D, o } = g; const X = x => ox + x * s, Y = y => oy - y * s;
    p.dash(X(0), Y(D), X(W), Y(D), 0.8); p.dash(X(0), Y(0), X(W), Y(0), 0.8); p.dash(X(0), Y(0), X(0), Y(D), 0.8); p.dash(X(W), Y(0), X(W), Y(D), 0.8);
    p.rect(X(-o), Y(D + o), (W + 2 * o) * s, (D + 2 * o) * s, 2.2);
    const arrow = (x, y, dx, dy, lab) => { const L = 60; p.line(x, y, x + dx * L, y + dy * L, 1.4); p.poly([[x + dx * L, y + dy * L], [x + dx * (L - 14) - dy * 7, y + dy * (L - 14) + dx * 7], [x + dx * (L - 14) + dy * 7, y + dy * (L - 14) - dx * 7]], 1, '#000'); p.text(x - dy * 14 + dx * 30, y + dx * 14 + dy * 30 - 4, lab, 10, 'middle', 'bold'); };
    const pitch = m.roof.type === 'flat' ? '1/4:12 MIN' : m.roof.pitch_rise_in_12 + ':12';
    if (g.type === 'gable') {
      if (m.roof.ridge_axis !== 'depth') { p.line(X(-o), Y(D / 2), X(W + o), Y(D / 2), 2); arrow(X(W / 2), Y(D / 2) - 20, 0, -1, ''); arrow(X(W / 2), Y(D / 2) + 20, 0, 1, ''); p.text(X(W / 2) + 70, Y(D * 0.72), 'DN ' + pitch, 11, 'start', 'bold'); p.text(X(W / 2) + 70, Y(D * 0.28), 'DN ' + pitch, 11, 'start', 'bold'); }
      else { p.line(X(W / 2), Y(-o), X(W / 2), Y(D + o), 2); arrow(X(W / 2) - 20, Y(D / 2), -1, 0, ''); arrow(X(W / 2) + 20, Y(D / 2), 1, 0, ''); p.text(X(W * 0.25), Y(D / 2) - 20, 'DN ' + pitch, 11, 'middle', 'bold'); p.text(X(W * 0.75), Y(D / 2) - 20, 'DN ' + pitch, 11, 'middle', 'bold'); }
    } else if (g.type === 'hip') {
      const sh = Math.min(W, D) / 2; const pts = W >= D ? [[sh, D / 2], [W - sh, D / 2]] : [[W / 2, sh], [W / 2, D - sh]];
      p.line(X(pts[0][0]), Y(pts[0][1]), X(pts[1][0]), Y(pts[1][1]), 2);
      [[-o, -o], [W + o, -o], [W + o, D + o], [-o, D + o]].forEach(([cx, cy]) => { const q = pts.reduce((b, c) => Math.hypot(c[0] - cx, c[1] - cy) < Math.hypot(b[0] - cx, b[1] - cy) ? c : b); p.line(X(cx), Y(cy), X(q[0]), Y(q[1]), 1.4); });
      p.text(X(W / 2), Y(D * 0.2), 'DN ' + pitch + ' (ALL SIDES)', 11, 'middle', 'bold');
    } else {
      const dir = { back: [0, 1], front: [0, -1], right: [-1, 0], left: [1, 0] }[g.high]; // arrows point down-slope (svg y is flipped)
      arrow(X(W / 2), Y(D / 2), dir[0], dir[1], ''); p.text(X(W / 2) + 20, Y(D / 2) - 30, 'DN ' + pitch, 12, 'start', 'bold');
    }
    p.text(X(W + o) + 20, Y(D + o) + 14, (m.roof.roofing || 'ROOFING PER SPEC').toUpperCase().slice(0, 48), 10);
    p.text(X(W + o) + 20, Y(D + o) + 30, ('ON ' + (m.roof_framing.member || '') + ' @ ' + m.roof_framing.spacing_in + '" O.C.').toUpperCase().slice(0, 48), 10);
    p.text(X(W + o) + 20, Y(D + o) + 46, (o ? ftin(o) + ' OVERHANG' : 'NO OVERHANG') + ', DRIP EDGE + GUTTERS AS SHOWN', 10);
  }

  /* ------------------------------------------------------------------ elevation + section */
  function profile(g, side, cutW) { // roof top (T) and underside (B) along the view, u from -o to L+o
    const L = g.wallLen(side), Dp = (side === 'front' || side === 'back') ? g.D : g.W, n = 48, us = [];
    for (let i = 0; i <= n; i++) us.push(-g.o + (L + 2 * g.o) * i / n);
    if (g.type === 'gable' || g.type === 'hip') us.push(L / 2, (L - Math.max(0, L - g.span)) / 2, (L + Math.max(0, L - g.span)) / 2);
    us.sort((a, b) => a - b);
    const top = [], bot = [];
    for (const u of us) {
      let hi = -1e9; const wFar = cutW == null ? null : cutW;
      if (wFar == null) for (let j = 0; j <= 24; j++) { const w = -g.o + (Dp + 2 * g.o) * j / 24; const [x, y] = g.viewPt(side, u, w); hi = Math.max(hi, g.under(x, y) + g.t); }
      else { const [x, y] = g.viewPt(side, u, wFar); hi = g.under(x, y) + g.t; }
      const [x0, y0] = g.viewPt(side, u, cutW == null ? -g.o : cutW); const lo = g.under(x0, y0);
      top.push([u, hi]); bot.push([u, lo]);
    }
    return { top, bot, L };
  }
  function drawElevation(p, ctx, side, ox, oy, s) {
    const { m, g, mk } = ctx, L = g.wallLen(side); const X = u => ox + u * s, Y = h => oy - h * s;
    const { top, bot } = profile(g, side, null);
    // wall
    const wt = u => { const [x, y] = g.onWall(side, u); return g.under(x, y); };
    const wpts = [[0, 0], [0, wt(0)]]; if (g.type === 'gable') wpts.push([L / 2, wt(L / 2)]); wpts.push([L, wt(L)], [L, 0]);
    p.poly(wpts.map(([u, h]) => [X(u), Y(h)]), 2.2, '#fff');
    // siding hint
    const sid = /lap|siding|clapboard|board/i.test(m.wall_assembly.cladding || '');
    if (sid) { for (let h = 0.6; h < g.peak; h += 0.6) { const xs = []; for (let i = 0; i < wpts.length - 1; i++) { const [a, b] = [wpts[i], wpts[i + 1]]; if ((a[1] - h) * (b[1] - h) < 0) xs.push(a[0] + (h - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); } if (xs.length >= 2) p.line(X(Math.min(...xs)), Y(h), X(Math.max(...xs)), Y(h), 0.3); } }
    // roof
    p.poly([...top.map(([u, h]) => [X(u), Y(h)]), ...bot.slice().reverse().map(([u, h]) => [X(u), Y(h)])], 2.2, '#fff');
    p.pline(bot.map(([u, h], i) => [X(u), Y(Math.min(h + g.t * 0.45, top[i][1]))]), 0.8);
    // grade + foundation
    p.line(X(-g.o - 3), Y(g.grade), X(L + g.o + 3), Y(g.grade), 3);
    p.dash(X(0), Y(g.grade), X(0), Y(-2.5), 0.8); p.dash(X(L), Y(g.grade), X(L), Y(-2.5), 0.8); p.dash(X(-0.5), Y(-2.5), X(L + 0.5), Y(-2.5), 0.8);
    // floor lines for upper levels
    g.levels.slice(1).forEach(h => p.dash(X(0), Y(h), X(L), Y(h), 0.6, '6 6'));
    // porch posts on this face
    if (m.porch.present && m.porch.side === side) { const P = porchRect(m, g); const len = (side === 'front' || side === 'back') ? P.w : P.d; const start = (L - len) / 2; const n = Math.max(2, Math.ceil(len / 10) + 1); const bh = Math.min(g.H - 0.5, 8.5); for (let i = 0; i < n; i++) { const u = start + 0.25 + i * (len - 0.5) / (n - 1); p.rect(X(u) - 0.25 * s, Y(bh), 0.5 * s, bh * s, 1.6, '#fff'); } p.rect(X(start), Y(bh + 0.9), len * s, 0.9 * s, 1.6, '#fff'); }
    // openings
    m.openings.forEach((o, i) => {
      if (o.wall !== side) return;
      const base = g.levels[o.level - 1] + o.sill_ft, x0 = X(o.center_ft - o.width_ft / 2), w = o.width_ft * s, y0 = Y(base + o.height_ft), h = o.height_ft * s;
      p.rect(x0, y0, w, h, 1.8, '#fff');
      if (o.kind === 'window') { p.rect(x0 + 4, y0 + 4, w - 8, h - 8, 0.8); p.line(x0 + w / 2, y0 + 4, x0 + w / 2, y0 + h - 4, 1); p.line(x0 + w * 0.15, y0 + h * 0.75, x0 + w * 0.35, y0 + h * 0.4, 0.5); p.line(x0 + w * 0.65, y0 + h * 0.75, x0 + w * 0.85, y0 + h * 0.4, 0.5); p.rect(x0 - 6, y0 + h, w + 12, 6, 1); hexTag(p, x0 + w / 2, y0 + h + 34, mk.byIndex[i]); }
      else if (o.kind === 'overhead_door') { for (let k = 1; k < 5; k++) p.line(x0, y0 + h * k / 5, x0 + w, y0 + h * k / 5, 0.8); doorTag(p, x0 + w / 2, y0 - 28, mk.byIndex[i]); }
      else { if (o.kind === 'double_door') p.line(x0 + w / 2, y0, x0 + w / 2, y0 + h, 1.2); const leaves = o.kind === 'double_door' ? 2 : 1; for (let k = 0; k < leaves; k++) { const lx = x0 + k * w / leaves, lw = w / leaves; p.rect(lx + lw * 0.18, y0 + h * 0.12, lw * 0.64, h * 0.3, 0.6); p.rect(lx + lw * 0.18, y0 + h * 0.5, lw * 0.64, h * 0.38, 0.6); p.circle(k ? lx + lw * 0.12 : lx + lw * 0.88, y0 + h * 0.5, 3, 0.8, '#000'); } doorTag(p, x0 + w / 2, y0 - 28, mk.byIndex[i]); }
    });
    // levels
    const lv = [['T.O. SLAB', 0], ...g.levels.slice(1).map((h, i) => [`LEVEL ${i + 2}`, h]), [g.type === 'shed' ? 'T.O. PLATE (LOW)' : 'T.O. PLATE', g.H]];
    if (g.peak - g.H > 0.4) lv.push([g.type === 'shed' ? 'T.O. PLATE (HIGH)' : 'RIDGE (T.O. PLATE AT PEAK)', g.peak]);
    const lx = X(L + g.o) + 50; lv.forEach(([n, h]) => levelMark(p, lx, Y(h), n, h, X(L) + 4));
    p.text(X(L + g.o) + 60, Y(g.grade) + 18, 'FIN. GRADE ' + elev(g.grade), 10);
    // leaders
    const notes = [[(m.roof.roofing || 'ROOFING').toUpperCase(), L * 0.3, (g.H + g.peak) / 2 + g.t / 2], [(m.wall_assembly.cladding || 'EXTERIOR CLADDING').toUpperCase(), L * 0.12, g.H * 0.55]];
    notes.forEach(([t, u, h], k) => { const tx = X(-g.o) - 30, ty = Y(h) - 8 + k * 4; p.line(tx + 4, ty + 4, X(u), Y(h), 0.6); p.circle(X(u), Y(h), 2.5, 0.6, '#000'); p.text(tx, ty, t.slice(0, 42), 10, 'end'); });
    dimH(p, X(0), X(L), Y(-2.5) + 40, 7, ftin(L) + ' O/O SHEATHING', 10, false);
  }
  function levelMark(p, x, y, name, h, from) {
    p.dash(from, y, x - 16, y, 0.5, '18 6'); p.circle(x, y, 12, 1.2, '#fff'); p.path(`M${r1(x)} ${r1(y - 12)} A12 12 0 0 1 ${r1(x + 12)} ${r1(y)} L${r1(x)} ${r1(y)}Z M${r1(x)} ${r1(y + 12)} A12 12 0 0 1 ${r1(x - 12)} ${r1(y)} L${r1(x)} ${r1(y)}Z`, 0.5, '#000');
    p.text(x + 22, y - 3, name, 11, 'start', 'bold'); p.text(x + 22, y + 13, 'EL. ' + elev(h), 10);
  }
  function drawSection(p, ctx, which, ox, oy, s) {
    const { m, g, mk } = ctx, side = which === 1 ? 'left' : 'front', T = g.wallT;
    const cut = which === 1 ? sectionX(ctx) : g.D * 0.5; // plan coordinate of the cut
    const w = which === 1 ? cut : g.D - cut; // depth from the viewer (left side for 1, front for 2)
    const L = g.wallLen(side); const X = u => ox + u * s, Y = h => oy - h * s;
    const { top, bot } = profile(g, side, which === 1 ? cut : g.D * 0.5);
    void w;
    // earth + footings
    p.rect(X(-g.o - 3), Y(g.grade), (L + 2 * g.o + 6) * s, (2.6 + g.grade) * s, 0, 'url(#earth)');
    const fnd = m.foundation.type;
    const footD = 1.0, footW = fnd === 'piers' ? 2 : 1.67;
    for (const u of [T / 2, L - T / 2]) {
      if (fnd === 'slab_on_grade') p.poly([[X(u - footW / 2), Y(-0.33)], [X(u + footW / 2), Y(-0.33)], [X(u + footW / 2), Y(-0.33 - footD)], [X(u - footW / 2), Y(-0.33 - footD)]], 1.6, 'url(#conc)');
      else { p.rect(X(u - T / 2), Y(0), T * s, (1.5) * s, 1.6, 'url(#conc)'); p.rect(X(u - footW / 2), Y(-1.5), footW * s, footD * s, 1.6, 'url(#conc)'); }
    }
    // slab / floor
    if (fnd === 'slab_on_grade' || fnd === 'stem_wall') p.rect(X(0), Y(0), L * s, 0.33 * s, 1.6, 'url(#conc)');
    else { p.rect(X(0), Y(0), L * s, 0.9 * s, 1.6, '#fff'); for (let u = 1; u < L; u += 1.33) p.line(X(u), Y(-0.05), X(u), Y(-0.85), 0.5); }
    // walls (cut) at both ends, plus upper floors
    const wt = u => { const pt = g.viewPt(side, u, which === 1 ? cut : g.D * 0.5); return g.under(pt[0], pt[1]); };
    p.rect(X(0), Y(wt(0)), T * s, wt(0) * s, 2.6, 'url(#h45w)'); p.rect(X(L - T), Y(wt(L)), T * s, wt(L) * s, 2.6, 'url(#h45w)');
    g.levels.slice(1).forEach(h => { p.rect(X(T), Y(h), (L - 2 * T) * s, 1.0 * s, 1.4, 'url(#h135)'); });
    // ceiling / roof
    p.poly([...top.map(([u, h]) => [X(u), Y(h)]), ...bot.slice().reverse().map(([u, h]) => [X(u), Y(h)])], 2.6, 'url(#h135)');
    if (g.type !== 'shed') p.dash(X(T), Y(g.H), X(L - T), Y(g.H), 0.6, '10 6');
    // room names crossing the cut
    const rs = mk.rooms.filter(r => r.level === 1 && (which === 1 ? (r.x_ft <= cut && cut <= r.x_ft + r.w_ft) : (r.y_ft <= cut && cut <= r.y_ft + r.d_ft)));
    rs.forEach(r => { const u0 = which === 1 ? g.D - (r.y_ft + r.d_ft) : r.x_ft, uc = u0 + (which === 1 ? r.d_ft : r.w_ft) / 2; p.text(X(uc), Y(Math.min(5, g.H * 0.5)), `${r.name.toUpperCase()} ${r.num}`, 12, 'middle', 'bold'); });
    if (!rs.length) p.text(X(L / 2), Y(Math.min(5, g.H * 0.5)), (m.building_use || 'INTERIOR').toUpperCase().slice(0, 30), 12, 'middle', 'bold');
    p.line(X(-g.o - 3), Y(g.grade), X(L + g.o + 3), Y(g.grade), 3);
    const lv = [['T.O. SLAB', 0], ...g.levels.slice(1).map((h, i) => [`LEVEL ${i + 2}`, h]), [g.type === 'shed' ? 'T.O. PLATE (LOW)' : 'T.O. PLATE', g.H]]; if (g.peak - g.H > 0.4) lv.push([g.type === 'shed' ? 'T.O. PLATE (HIGH)' : 'PEAK', g.peak]);
    if (fnd !== 'piers') lv.push(['B.O. FOOTING', fnd === 'slab_on_grade' ? -1.33 : -2.5]);
    const lx = X(L + g.o) + 50; lv.forEach(([n, h]) => levelMark(p, lx, Y(h), n, h, X(L) + 4));
    // callouts to the wall section detail
    refBubble(p, X(T / 2) - 70, Y(g.H * 0.5), '1', 'A501', 24); p.line(X(T / 2) - 44, Y(g.H * 0.5), X(0), Y(g.H * 0.5), 0.6);
    dimH(p, X(0), X(L), Y(-2.9), 7, ftin(L), 10, false);
  }
  /** Cut line for section 1: near the middle, clear of openings on the front/back walls and of partitions. */
  const sectionX = ctx => {
    const { g, m } = ctx, W = g.W;
    const bad = x => m.openings.some(o => (o.wall === 'front' && Math.abs(o.center_ft - x) < o.width_ft / 2 + 0.75) || (o.wall === 'back' && Math.abs(W - o.center_ft - x) < o.width_ft / 2 + 0.75))
      || m.rooms.some(r => Math.abs(r.x_ft - x) < 1 || Math.abs(r.x_ft + r.w_ft - x) < 1);
    return [0.5, 0.42, 0.58, 0.35, 0.65, 0.28, 0.72].map(f => W * f).find(x => !bad(x)) ?? W * 0.5;
  };

  /* ------------------------------------------------------------------ details */
  function detailBox(p, x, y, w, h, num, sheet, title, scale) { p.rect(x, y, w, h, 0.8); viewTitle(p, x + 14, y + h - 46, num, sheet, title, scale, w - 30); }
  function noteList(p, x, y, items, size = 10, width = 360) { items.forEach(t => { p.line(x - 46, y - 4, x - 6, y - 4, 0.6); y = p.para(x, y, t.toUpperCase(), size, width, 1.25) + 4; }); return y; }
  /** Rafter bearing on the outer top corner (xe, ye) of the top plate, exterior to the left. Returns its geometry. */
  function rafter(p, xe, ye, tan, ov, run, depth) {
    const cos = Math.cos(Math.atan(tan)), dv = depth / cos, xo = xe - ov, xr = xe + run;
    const yb = x => ye - (x - xe) * tan;
    p.poly([[xo, yb(xo)], [xr, yb(xr)], [xr, yb(xr) - dv], [xo, yb(xo) - dv]], 1.4, 'url(#h135)');
    p.line(xo, yb(xo) - dv - 5, xr, yb(xr) - dv - 5, 1.6); p.line(xo, yb(xo) - dv - 10, xr, yb(xr) - dv - 10, 2.4); // sheathing + roofing
    return { xo, yb, dv };
  }
  function studWall(p, x0, yTop, yBot, T, plates = 2, pl = 10) {
    p.rect(x0 + 6, yTop + plates * pl, T - 12, yBot - yTop - plates * pl - pl, 0.8, 'url(#batt)');
    p.line(x0, yTop, x0, yBot, 2); p.line(x0 + 5, yTop, x0 + 5, yBot, 0.8); p.line(x0 + T, yTop, x0 + T, yBot, 1.6);
    for (let i = 0; i < plates; i++) p.rect(x0 + 5, yTop + i * pl, T - 5, pl, 1, 'url(#h45)');
    p.rect(x0 + 5, yBot - pl, T - 5, pl, 1, 'url(#h45)');
  }
  function detailWallSection(p, ctx, x, y, w, h) {
    const { m, g } = ctx, s = 75, T = Math.round(g.wallT * s), bx = x + 230, top = y + 190, slab = y + 470;
    const gr = slab + Math.min(60, (m.floor_above_grade_in || 0) / 12 * s);
    p.rect(x + 30, gr, 520, 590 - (gr - y), 0, 'url(#earth)');
    if (m.foundation.type === 'slab_on_grade') { p.poly([[bx - 10, slab], [x + 540, slab], [x + 540, slab + 30], [bx + T + 70, slab + 30], [bx + T + 50, y + 585], [bx - 10, y + 585]], 1.6, 'url(#conc)'); }
    else { p.rect(bx, slab - 4, T, 70, 1.6, 'url(#conc)'); p.rect(bx - 30, slab + 66, T + 60, 40, 1.6, 'url(#conc)'); p.rect(bx + T, slab, x + 540 - bx - T, 30, 1.6, 'url(#conc)'); }
    studWall(p, bx, top, slab, T);
    p.rect(bx - 7, top - 4, 7, slab - top - 20, 0.6, '#fff'); // cladding
    p.raw(`<path d="M${bx - 30} ${r1((top + slab) / 2)} l22 -10 l-12 20 l22 -10 M${bx + T + 8} ${r1((top + slab) / 2)} l22 -10 l-12 20 l22 -10" fill="none" stroke="#000" stroke-width="1"/>`);
    rafter(p, bx, top, Math.max(g.rise, 0.03), Math.min(g.o * s, 160), x + 540 - bx, 7.25 / 12 * s * 0.6);
    const nx = x + w - 380;
    noteList(p, nx, y + 40, [m.roof.roofing || 'Roofing per spec', 'Sheathing + underlayment per roofing manufacturer', (m.roof_framing.member || 'Rafters') + ' @ ' + m.roof_framing.spacing_in + '" o.c., uplift connector each rafter', 'Double top plate', (m.wall_assembly.stud === 'cmu' ? '8" CMU, reinforced per structural' : m.wall_assembly.stud + ' studs @ ' + m.wall_assembly.spacing_in + '" o.c.'), m.wall_assembly.sheathing || 'Wall sheathing', m.wall_assembly.wrb || 'Weather-resistive barrier, lapped shingle-fashion', m.wall_assembly.cladding || 'Exterior cladding', m.wall_assembly.insulation || 'Insulation per energy code', m.wall_assembly.interior_finish || 'Interior finish', 'Treated sill plate on sill gasket, anchor bolts per structural', m.foundation.type === 'piers' ? 'Piers + beams per structural' : '4" concrete slab on vapor retarder on compacted base', 'Footing to bear below frost depth on undisturbed soil'], 10, 360);
  }
  function detailEave(p, ctx, x, y, w, h) {
    const { m, g } = ctx, s = 100, T = Math.round(g.wallT * s), cx = x + 330, cy = y + 300, tan = Math.max(g.rise, 0.03);
    studWall(p, cx, cy, y + 600, T, 2, 15);
    p.rect(cx - 8, cy + 10, 8, 580 - (cy - y), 0.6, '#fff');
    const ov = Math.min(g.o * s, 240), R = rafter(p, cx, cy, tan, ov, x + 580 - cx, 7.25 / 12 * s);
    if (ov > 10) {
      const fx = R.xo, fTop = R.yb(fx) - R.dv - 4, fBot = R.yb(fx) + 8;
      p.rect(fx - 9, fTop, 9, fBot - fTop, 1.4, '#fff'); // fascia
      p.path(`M${r1(fx - 9)} ${r1(fTop + 14)} h-34 v34 q0 12 12 12 h12 q10 0 10 -12z`, 1.2, '#fff'); // gutter
      p.dash(fx, fBot, cx - 8, fBot, 1, '6 4'); p.text((fx + cx) / 2, fBot + 16, 'VENTED SOFFIT', 9, 'middle');
    }
    noteList(p, x + w - 380, y + 50, [m.roof.roofing || 'Roofing', 'Drip edge over underlayment at eave, ice barrier where required', (m.roof_framing.member || 'Rafter') + ', birdsmouth bearing, connector to plate', 'Blocking + vent screen between rafters', '1x fascia + vented soffit', 'Gutter + downspout to splash block, discharge away from foundation', 'Seal WRB to top plate, insulation stop / baffle'], 10, 360);
    p.text(x + 40, y + 60, (g.o ? ftin(g.o) + ' OVERHANG' : 'NO OVERHANG'), 11, 'start', 'bold');
  }
  function detailBase(p, ctx, x, y, w, h) {
    const { m, g } = ctx, s = 100, T = Math.round(g.wallT * s), bx = x + 250, sl = y + 380;
    const gr = sl + Math.max(25, Math.min(80, (m.floor_above_grade_in || 0) / 12 * s));
    p.rect(x + 30, gr, bx - x - 30, 590 - (gr - y), 0, 'url(#earth)'); p.rect(bx, sl + 40, x + 560 - bx, 590 - (sl + 40 - y), 0, 'url(#earth)');
    if (m.foundation.type === 'slab_on_grade') p.poly([[bx - 10, sl], [x + 560, sl], [x + 560, sl + 40], [bx + T + 90, sl + 40], [bx + T + 60, y + 585], [bx - 10, y + 585]], 1.6, 'url(#conc)');
    else { p.rect(bx, sl, T, 150, 1.6, 'url(#conc)'); p.rect(bx - 40, sl + 150, T + 80, 50, 1.6, 'url(#conc)'); p.rect(bx + T, sl, x + 560 - bx - T, 40, 1.6, 'url(#conc)'); }
    studWall(p, bx, y + 60, sl, T, 0, 15);
    p.rect(bx - 9, y + 60, 9, Math.max(40, gr - 50 - y - 60), 0.6, '#fff'); // cladding stops above grade
    p.line(bx + T / 2, sl - 15, bx + T / 2, sl + 70, 2.2); p.line(bx + T / 2 - 8, sl + 70, bx + T / 2 + 8, sl + 70, 2.2); // anchor bolt
    p.line(x + 30, gr, bx, gr, 2.4);
    noteList(p, x + w - 380, y + 50, [m.wall_assembly.cladding || 'Cladding', 'Keep cladding 6" min. above finish grade (verify product)', 'WRB lapped over sill flashing / weep screed', 'Pressure-treated sill plate on sill gasket', '1/2" anchor bolt, 7" min. embed, spacing per structural', m.foundation.type === 'slab_on_grade' ? 'Thickened slab edge / footing below frost depth' : 'Stem wall + continuous footing below frost depth', 'Slope grade away from building, 6" in the first 10 ft (verify)'], 10, 360);
  }
  function detailNeeded(p, ctx, x, y, w, h, d, num, sheet) {
    p.rect(x + 20, y + 20, w - 40, h - 110, 1, 'none', ' stroke-dasharray="14 8"');
    p.text(x + w / 2, y + 80, 'DETAIL REQUIRED', 22, 'middle', 'bold');
    p.text(x + w / 2, y + 108, 'FLAGGED BY DRAWUP · ADDED TO THE DETAILS LIBRARY', 10, 'middle');
    let yy = p.para(x + 50, y + 160, 'WHY: ' + d.why, 11, w - 100);
    if (d.location) yy = p.para(x + 50, yy + 8, 'WHERE: ' + d.location, 11, w - 100);
    p.para(x + 50, yy + 8, 'CATEGORY: ' + d.category, 11, w - 100);
    detailBox(p, x, y, w, h, String(num), sheet, d.title.toUpperCase().slice(0, 40), 'TO BE DRAWN');
  }

  /** v25.1: an approved AI-drawn detail (drawup-detail-draw-v25.js) in this slot, at its own true scale: the kit draws
   *  100 px per printed inch, the same as this 36 x 24 in sheet, so it is placed 1:1 (its own title strip cropped off). */
  function detailOverride(p, ctx, x, y, w, h, ov, num, sheet) {
    const svg = String(ov.svg || '').replace(/viewBox="0 0 800 600" width="800" height="600"/, 'viewBox="0 0 800 536" width="800" height="536"');
    p.rect(x, y, w, h, 0, '#fff');
    if (svg) p.raw(`<image x="${r1(x + (w - 800) / 2)}" y="${r1(y + 34)}" width="800" height="536" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}"/>`);
    p.text(x + w - 18, y + 24, ('REVISED DETAIL · ' + (ov.code || 'AI') + (ov.revision ? ' REV ' + ov.revision : '') + (ov.approved ? ' · APPROVED ' + ov.approved : '')).toUpperCase(), 10, 'end', 'bold');
    detailBox(p, x, y, w, h, String(num), sheet, String(ov.title || 'DETAIL').toUpperCase().slice(0, 40), ov.scale || 'AS NOTED');
  }

  /* ------------------------------------------------------------------ sheets */
  function sheetCover(ctx) {
    const { m, g } = ctx, p = Pen(), sheet = { num: 'G001', title: 'Cover + General Notes', scale: 'NONE' };
    p.text(120, 180, String(m.title).toUpperCase(), 56, 'start', 'bold');
    p.text(120, 230, [m.building_use, ctx.location].filter(Boolean).join(' · ').toUpperCase(), 18);
    p.line(120, 260, 3000, 260, 3);
    // source picture
    if (ctx.sourceImage) { p.text(120, 310, 'SOURCE PICTURE', 14, 'start', 'bold'); p.raw(`<image href="${esc(ctx.sourceImage)}" x="120" y="330" width="1000" height="700" preserveAspectRatio="xMidYMid meet"/>`); p.rect(120, 330, 1000, 700, 1); p.para(120, 1060, 'The picture DrawUp read. Every sheet in this set is drawn from one building model built from it, not traced from the picture.', 11, 1000); }
    else { p.text(120, 310, 'FRONT ELEVATION (SEE A201)', 14, 'start', 'bold'); const L = g.W + 2 * g.o, [es] = pickScale(L + 4, g.peak + 5, 760, 560, 37.5); drawElevation(p, ctx, 'front', 160 + (760 - L * es) / 2 + g.o * es, 330 + 600, es); }
    // project data
    let y = 310; const cx = 1200;
    p.text(cx, y, 'PROJECT DATA', 14, 'start', 'bold'); y += 30;
    const area = Math.round(g.W * g.D) * m.stories;
    [['Use', m.building_use || '—'], ['Stories', String(m.stories)], ['Footprint', ftin(g.W) + ' x ' + ftin(g.D)], ['Gross area', area + ' SF (approx.)'], ['Roof', `${m.roof.type} · ${m.roof.type === 'flat' ? '1/4' : m.roof.pitch_rise_in_12}:12 · ${ftin(g.o)} overhang`], ['Plate height', ftin(g.H)], ['Foundation', m.foundation.type.replace(/_/g, ' ')], ['Walls', `${m.wall_assembly.stud} @ ${m.wall_assembly.spacing_in}" o.c.`], ['Dimensions', { given_by_user: 'given by the user', read_from_drawing: 'read from the drawing', estimated_from_picture: 'ESTIMATED from the picture, verify on site' }[m.dimension_basis] || '—']].forEach(([a, b]) => { p.text(cx, y, a.toUpperCase(), 11); p.text(cx + 200, y, String(b).toUpperCase().slice(0, 60), 11, 'start', 'bold'); y += 20; });
    y += 20; p.text(cx, y, 'WHAT DRAWUP READ', 14, 'start', 'bold'); y = p.para(cx, y + 26, m.summary, 11, 820) + 10;
    if (m.jurisdiction_note) { p.text(cx, y + 10, 'JURISDICTION', 14, 'start', 'bold'); y = p.para(cx, y + 36, m.jurisdiction_note, 11, 820); }
    // sheet index
    let iy = 310; const ix = 2120; p.text(ix, iy, 'SHEET INDEX', 14, 'start', 'bold'); iy += 30;
    ctx.index.forEach(s => { p.text(ix, iy, s.num, 12, 'start', 'bold'); p.text(ix + 90, iy, s.title.toUpperCase(), 12); iy += 22; });
    iy += 20; p.text(ix, iy, 'ABBREVIATIONS', 14, 'start', 'bold'); iy += 26;
    ['A.F.F. above finish floor', 'B.O. bottom of', 'EL. elevation', 'F.O.S. face of sheathing', 'O.C. on center', 'O/O out to out', 'R.O. rough opening', 'T.O. top of', 'TYP. typical', 'VIF verify in field'].forEach(t => { p.text(ix, iy, t.toUpperCase(), 10); iy += 17; });
    // notes columns
    let ny = 1140; p.text(120, ny, 'GENERAL NOTES', 14, 'start', 'bold'); ny += 28;
    const gen = ['DrawUp generated this set from a picture. A licensed design professional must review, complete and take responsibility for it before it is used for permit or construction.', 'Dimensions are to face of sheathing (F.O.S.) unless noted. Opening dimensions are to the centerline of the rough opening.', 'All views are drawn from one building model, so plans, elevations, sections and schedules agree. Change the model, not a single view.', 'Member sizes, connections, footings and anchorage are typical starting points. Structural design by a licensed engineer for the actual site loads (wind, snow, seismic, soil).', 'Verify all existing conditions and estimated dimensions in the field before ordering materials.', ctx.level === 'preliminary' ? 'Preliminary / schematic set for design review, school work and competitions. Develop it into the full set before permit: the full set adds details, framing, schedules and the code analysis.' : 'Provide the construction details flagged on A501. Each flagged detail is also listed in the DrawUp Details library.'];
    gen.forEach((t, i) => { p.text(120, ny, String(i + 1) + '.', 11, 'start', 'bold'); ny = p.para(150, ny, t, 11, 920) + 6; });
    ny += 14; if (m.assumptions.length) { p.text(120, ny, 'ASSUMPTIONS (CONFIRM)', 14, 'start', 'bold'); ny += 26; m.assumptions.slice(0, 14).forEach(t => { if (ny > SH - 140) return; p.text(120, ny, '•', 11); ny = p.para(146, ny, t, 10.5, 920) + 3; }); }
    let cy = 1140; const c2 = 1200;
    p.text(c2, cy, 'ISSUES IN THE SOURCE + HOW THIS SET RESOLVES THEM', 14, 'start', 'bold'); cy += 28;
    (m.issues_in_source.length ? m.issues_in_source : [{ severity: 'minor', issue: 'No issues were reported.', fix: '' }]).slice(0, 12).forEach(x => { if (cy > SH - 160) return; p.rect(c2, cy - 13, 66, 18, 0, x.severity === 'critical' ? '#000' : '#fff', ' stroke="#000" stroke-width="1"'); p.text(c2 + 33, cy, x.severity.toUpperCase(), 9, 'middle', 'bold', x.severity === 'critical' ? ' fill="#fff"' : ''); cy = p.para(c2 + 80, cy, x.issue, 10.5, 820); if (x.fix) cy = p.para(c2 + 80, cy, 'FIX: ' + x.fix, 10.5, 820, 1.3, 'bold'); cy += 6; });
    let dy = 1140; const c3 = 2120;
    p.text(c3, dy, 'CODE ITEMS TO CONFIRM WITH THE AHJ', 14, 'start', 'bold'); dy += 28;
    m.code_notes.slice(0, 12).forEach(t => { if (dy > 1760) return; p.text(c3, dy, '•', 11); dy = p.para(c3 + 24, dy, t, 10.5, 900) + 3; });
    dy += 18; p.text(c3, dy, ctx.level === 'preliminary' ? 'DETAILS TO DEVELOP IN THE FULL SET' : 'DETAILS THIS SET STILL NEEDS (SEE A501)', 14, 'start', 'bold'); dy += 28;
    m.details_needed.forEach((d, i) => { if (dy > SH - 140) return; p.text(c3, dy, ctx.level === 'preliminary' ? String(i + 1) + '.' : String(i + 4) + '/A50' + (Math.floor((i + 3) / 9) + 1), 10.5, 'start', 'bold'); dy = p.para(c3 + 80, dy, d.title, 10.5, 840) + 3; });
    return { ...sheet, svg: wrapSheet(p.svg(), ctx, sheet) };
  }
  function sheetPlan(ctx, level) {
    const { g } = ctx, p = Pen(), num = 'A10' + level;
    const roofHere = level === ctx.m.stories;
    const availW = roofHere ? 1900 : 2600, availH = 1650;
    const P = ctx.m.porch.present ? porchRect(ctx.m, g) : null;
    const ex = P ? { l: Math.max(0, -P.x), r: Math.max(0, P.x + P.w - g.W), f: Math.max(0, -P.y), b: Math.max(0, P.y + P.d - g.D) } : { l: 0, r: 0, f: 0, b: 0 };
    const [s, label] = pickScale(g.W + ex.l + ex.r, g.D + ex.f + ex.b, availW - 640, availH - 640);
    const ox = M + 320 + ex.l * s + (availW - 640 - (g.W + ex.l + ex.r) * s) / 2, oy = M + 320 + (g.D + ex.b) * s + (availH - 640 - (g.D + ex.f + ex.b) * s) / 2;
    ctx.porchEx = ex;
    drawPlan(p, ctx, level, ox, oy, s);
    viewTitle(p, M + 60, SH - M - 190, '1', num, ctx.m.stories > 1 ? `LEVEL ${level} FLOOR PLAN` : 'FLOOR PLAN', label, 900);
    p.raw(`<g transform="translate(${M + 1500} ${SH - M - 210})"><circle r="40" fill="#fff" stroke="#000" stroke-width="1.4"/><polygon points="0,-36 12,10 0,2 -12,10" fill="#000"/><text y="62" font-family="${FONT}" font-size="11" text-anchor="middle" font-weight="bold">PLAN NORTH</text></g>`);
    if (roofHere) {
      const [rs, rl] = pickScale(g.W + 2 * g.o + 4, g.D + 2 * g.o + 4, 820, 760, 25);
      const rox = 2240 + (820 - (g.W + 2 * g.o) * rs) / 2 + g.o * rs - 60, roy = 1120;
      roofPlan(p, ctx, rox, roy, rs);
      viewTitle(p, 2190, 1320, '2', num, 'ROOF PLAN', rl, 860);
    }
    // keyed + plan notes
    const nx = roofHere ? 2190 : M + 2650, ny = roofHere ? 1450 : 400;
    p.text(nx, ny, 'PLAN NOTES', 14, 'start', 'bold');
    noteList(p, nx + 46, ny + 30, ['Exterior walls: type W1, see A601 + A501', 'Door marks (oval) + window types (hexagon) per schedules on A800', 'Sections 1 + 2 on A301, elevations on A201', ctx.m.stories > 1 ? 'Stair, guards + handrails: provide stair details (flagged on A501)' : 'Provide accessible route + landing at entry door where required', 'Dimensions marked on G001 as estimated must be field verified'], 10, 780);
    const sheet = { num, title: ctx.m.stories > 1 ? `Level ${level} Plan` + (roofHere ? ' + Roof Plan' : '') : 'Floor Plan + Roof Plan', scale: label };
    return { ...sheet, svg: wrapSheet(p.svg(), ctx, sheet) };
  }
  function sheetElevations(ctx) {
    const { g } = ctx, p = Pen(), num = 'A201';
    const maxL = Math.max(g.W, g.D) + 2 * g.o + 4, hh = g.peak + g.t + 4 + (-g.grade);
    const [s, label] = pickScale(maxL, hh, 1180, 720);
    const cells = [[M + 380, 160], [M + 1680, 160], [M + 380, 1200], [M + 1680, 1200]];
    SIDES.forEach((side, i) => {
      const [cx, cy] = cells[i], L = g.wallLen(side);
      const ox = cx + (1180 - L * s) / 2 - 80, oy = cy + 720 - 60;
      drawElevation(p, ctx, side, ox, oy, s);
      viewTitle(p, cx - 300, cy + 820, String(i + 1), num, SIDE_NAME[side] + ' ELEVATION', label, 1150);
    });
    const sheet = { num, title: 'Exterior Elevations', scale: label };
    return { ...sheet, svg: wrapSheet(p.svg(), ctx, sheet) };
  }
  function sheetSections(ctx) {
    const { g } = ctx, p = Pen(), num = 'A301';
    const hh = g.peak + g.t + 4 + 3;
    const [s, label] = pickScale(Math.max(g.W, g.D) + 2 * g.o + 4, hh, 2300, 820);
    [[1, 'left', 160], [2, 'front', 1200]].forEach(([n, side, cy]) => {
      const L = g.wallLen(side), ox = M + 300 + (2300 - L * s) / 2, oy = cy + 720 - 3 * s;
      drawSection(p, ctx, n, ox, oy, s);
      viewTitle(p, M + 60, cy + 820, String(n), num, n === 1 ? 'BUILDING SECTION (ACROSS DEPTH)' : 'BUILDING SECTION (ACROSS WIDTH)', label, 1200);
    });
    p.text(2700, 200, 'SECTION NOTES', 14, 'start', 'bold');
    noteList(p, 2746, 232, ['Sections are cut from the same model as the plans (cut lines on A101)', 'Footing size + depth per structural and frost depth', 'Insulation, vapor control + air barrier per adopted energy code', 'Roof framing, uplift + lateral connections per structural', 'See A501 for the wall section and eave + base details'], 10, 340);
    const sheet = { num, title: 'Building Sections', scale: label };
    return { ...sheet, svg: wrapSheet(p.svg(), ctx, sheet) };
  }
  function sheetsDetails(ctx) {
    const { m } = ctx, out = [], cw = 990, ch = 700, xs = [M + 20, M + 1030, M + 2040], ys = [M + 20, M + 750, M + 1480];
    const slots = ys.flatMap(y => xs.map(x => [x, y]));
    const items = [{ k: 'wall', t: 'TYPICAL WALL SECTION', sc: '3/8" = 1\'-0" (BROKEN)' }, { k: 'eave', t: 'EAVE AT ' + (ctx.g.type === 'shed' ? 'LOW WALL' : 'EAVE WALL'), sc: '1" = 1\'-0" (TYP.)' }, { k: 'base', t: 'WALL BASE AT FOUNDATION', sc: '1" = 1\'-0" (TYP.)' }, ...m.details_needed.map(d => ({ k: 'need', d }))];
    for (let page = 0; page * 9 < items.length; page++) {
      const p = Pen(), num = 'A50' + (page + 1);
      items.slice(page * 9, page * 9 + 9).forEach((it, j) => {
        const [x, y] = slots[j], n = page * 9 + j + 1;
        if (ctx.overrides[n + '/' + num]) detailOverride(p, ctx, x, y, cw, ch, ctx.overrides[n + '/' + num], n, num);
        else if (it.k === 'need') detailNeeded(p, ctx, x, y, cw, ch, it.d, n, num);
        else { if (it.k === 'wall') detailWallSection(p, ctx, x, y, cw, ch); if (it.k === 'eave') detailEave(p, ctx, x, y, cw, ch); if (it.k === 'base') detailBase(p, ctx, x, y, cw, ch); detailBox(p, x, y, cw, ch, String(n), num, it.t, it.sc); }
      });
      const sheet = { num, title: page ? 'Details (Continued)' : 'Wall Section + Details', scale: 'AS NOTED' };
      out.push({ ...sheet, svg: wrapSheet(p.svg(), ctx, sheet) });
    }
    return out;
  }
  function sheetFraming(ctx) {
    const { m, g } = ctx, p = Pen(), num = 'A601';
    const [s, label] = pickScale(g.W + 2 * g.o + 6, g.D + 2 * g.o + 6, 1200, 1100);
    // foundation plan
    const fox = M + 200 + (1200 - g.W * s) / 2, foy = M + 260 + (1100 + g.D * s) / 2;
    const X = x => fox + x * s, Y = y => foy - y * s, T = g.wallT;
    p.rect(X(0), Y(g.D), g.W * s, g.D * s, 2.2);
    if (m.foundation.type === 'piers') {
      const nx = Math.max(2, Math.ceil(g.W / 8) + 1), ny = Math.max(2, Math.ceil(g.D / 8) + 1);
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const x = 0.75 + (g.W - 1.5) * i / (nx - 1), y = 0.75 + (g.D - 1.5) * j / (ny - 1); p.rect(X(x) - 0.75 * s, Y(y) - 0.75 * s, 1.5 * s, 1.5 * s, 1.2, 'url(#conc)'); }
      p.text(X(g.W / 2), Y(g.D / 2), 'CONCRETE PIERS @ ~8\'-0" O.C. EA. WAY, SIZE BY STRUCTURAL', 11, 'middle', 'bold');
    } else {
      const fw = 0.83; p.dash(X(-fw + T / 2), Y(g.D + fw - T / 2), X(g.W + fw - T / 2), Y(g.D + fw - T / 2), 0.8); p.dash(X(-fw + T / 2), Y(-fw + T / 2), X(g.W + fw - T / 2), Y(-fw + T / 2), 0.8); p.dash(X(-fw + T / 2), Y(-fw + T / 2), X(-fw + T / 2), Y(g.D + fw - T / 2), 0.8); p.dash(X(g.W + fw - T / 2), Y(-fw + T / 2), X(g.W + fw - T / 2), Y(g.D + fw - T / 2), 0.8);
      p.rect(X(T), Y(g.D - T), (g.W - 2 * T) * s, (g.D - 2 * T) * s, 0.6, 'url(#conc)');
      p.text(X(g.W / 2), Y(g.D / 2) - 8, m.foundation.type === 'slab_on_grade' ? '4" CONC. SLAB ON VAPOR RETARDER' : m.foundation.type === 'crawlspace' ? 'CRAWLSPACE, VENTED / CONDITIONED PER CODE' : 'SLAB / FLOOR ON STEM WALL', 11, 'middle', 'bold');
      p.text(X(g.W / 2), Y(g.D / 2) + 12, 'CONT. FOOTING BELOW (DASHED), SIZE + DEPTH BY STRUCTURAL', 10, 'middle');
    }
    const ab = Math.max(2, Math.ceil(g.W / 6)); for (let i = 0; i < ab; i++) { const x = 1 + (g.W - 2) * i / (ab - 1); p.circle(X(x), Y(T / 2), 3, 0.8, '#000'); p.circle(X(x), Y(g.D - T / 2), 3, 0.8, '#000'); }
    dimH(p, X(0), X(g.W), Y(0) + 70, 7, ftin(g.W), 11, false); dimV(p, X(0) - 70, Y(0), Y(g.D), 7, ftin(g.D), 11);
    viewTitle(p, M + 60, 1580, '1', num, 'FOUNDATION PLAN', label, 1300);
    // roof framing
    const rox = M + 1650 + (1200 - g.W * s) / 2, roy = foy;
    const RX = x => rox + x * s, RY = y => roy - y * s, o = g.o;
    p.rect(RX(-o), RY(g.D + o), (g.W + 2 * o) * s, (g.D + 2 * o) * s, 2);
    p.dash(RX(0), RY(g.D), RX(g.W), RY(g.D), 0.6); p.dash(RX(0), RY(0), RX(g.W), RY(0), 0.6); p.dash(RX(0), RY(0), RX(0), RY(g.D), 0.6); p.dash(RX(g.W), RY(0), RX(g.W), RY(g.D), 0.6);
    const sp = m.roof_framing.spacing_in / 12; let every = 1; while (sp * every * s < 6) every++;
    const alongX = g.type === 'gable' ? m.roof.ridge_axis !== 'depth' : g.type === 'shed' ? (g.high === 'front' || g.high === 'back') : g.W >= g.D;
    if (alongX) { for (let x = 0; x <= g.W + 0.01; x += sp * every) p.line(RX(x), RY(-o), RX(x), RY(g.D + o), 0.7); if (g.type !== 'shed') p.line(RX(-o), RY(g.D / 2), RX(g.W + o), RY(g.D / 2), 2.4); }
    else { for (let y = 0; y <= g.D + 0.01; y += sp * every) p.line(RX(-o), RY(y), RX(g.W + o), RY(y), 0.7); if (g.type !== 'shed') p.line(RX(g.W / 2), RY(-o), RX(g.W / 2), RY(g.D + o), 2.4); }
    p.rect(RX(g.W / 2) - 260, RY(g.D / 2) + 16, 520, 46, 0, '#fff');
    p.text(RX(g.W / 2), RY(g.D / 2) + 36, (m.roof_framing.member + ' @ ' + m.roof_framing.spacing_in + '" O.C.' + (every > 1 ? ' (EVERY ' + every + ' SHOWN)' : '')).toUpperCase(), 11, 'middle', 'bold');
    p.text(RX(g.W / 2), RY(g.D / 2) + 54, g.type === 'hip' ? 'HIP + JACK RAFTERS, RIDGE BOARD, SIZES BY STRUCTURAL' : g.type === 'shed' ? 'BEARING ON HIGH + LOW WALLS, UPLIFT TIE EACH END' : 'RIDGE BOARD / BEAM PER STRUCTURAL, CEILING TIES OR RIDGE BEAM', 10, 'middle');
    viewTitle(p, M + 1600, 1580, '2', num, 'ROOF FRAMING PLAN', label, 1400);
    // wall type
    const wx = M + 140, wy = 1800; p.text(wx, wy, 'WALL TYPE W1 · EXTERIOR', 16, 'start', 'bold');
    const layers = [m.wall_assembly.interior_finish || 'Interior finish', (m.wall_assembly.stud === 'cmu' ? '8" CMU' : m.wall_assembly.stud + ' studs @ ' + m.wall_assembly.spacing_in + '" o.c.') + ', ' + (m.wall_assembly.insulation || 'insulation per energy code'), m.wall_assembly.sheathing || 'Structural sheathing', m.wall_assembly.wrb || 'Weather-resistive barrier', m.wall_assembly.cladding || 'Exterior cladding'];
    const lw = [14, 64, 14, 6, 22]; let lx = wx; layers.forEach((t, i) => { p.rect(lx, wy + 20, lw[i], 200, 1, i === 1 ? 'url(#batt)' : i === 2 ? 'url(#h45)' : i === 4 ? 'url(#h135)' : '#fff'); lx += lw[i]; });
    let ty = wy + 40; layers.forEach((t, i) => { p.line(wx + lw.slice(0, i).reduce((a, b) => a + b, 0) + lw[i] / 2, wy + 40 + i * 34, wx + 160, ty - 4, 0.6); p.text(wx + 170, ty, t.toUpperCase().slice(0, 70), 11); ty += 34; });
    p.text(M + 1600, 1800, 'FRAMING NOTES (CONFIRM WITH STRUCTURAL)', 14, 'start', 'bold');
    noteList(p, M + 1646, 1832, ['Headers per A800 rough opening schedule, jack + king studs each side', 'Double top plate, lap splices 48" min.', 'Anchor bolts / straps at sill plates per structural, 12" max. from plate ends', 'Wall bracing / shear walls per adopted code or engineered design', 'Hold-downs, uplift connectors + roof diaphragm nailing per structural', m.roof_framing.note || 'Roof framing per structural'], 10, 1300);
    const sheet = { num, title: 'Foundation + Framing', scale: label };
    return { ...sheet, svg: wrapSheet(p.svg(), ctx, sheet) };
  }
  function table(p, x, y, cols, rows, rowH = 30) {
    const w = cols.reduce((a, c) => a + c[1], 0);
    p.rect(x, y, w, rowH, 1.4, '#e8e8e8'); let cx = x; cols.forEach(([h, cw]) => { p.text(cx + cw / 2, y + rowH / 2 + 4, h, 9.5, 'middle', 'bold'); cx += cw; });
    rows.forEach((r, i) => { const yy = y + rowH * (i + 1); p.rect(x, yy, w, rowH, 0.8); let c = x; r.forEach((v, k) => { p.text(c + cols[k][1] / 2, yy + rowH / 2 + 4, String(v).toUpperCase().slice(0, Math.floor(cols[k][1] / 6.2)), 10, 'middle'); c += cols[k][1]; }); });
    cx = x; cols.forEach(([, cw]) => { p.line(cx, y, cx, y + rowH * (rows.length + 1), 0.8); cx += cw; }); p.line(cx, y, cx, y + rowH * (rows.length + 1), 0.8);
    return y + rowH * (rows.length + 1);
  }
  function sheetSchedules(ctx) {
    const { m, mk } = ctx, p = Pen(), num = 'A800';
    const side = o => ({ front: 'FRONT', back: 'REAR', left: 'LEFT', right: 'RIGHT' }[o.wall]);
    const elevRef = o => (SIDES.indexOf(o.wall) + 1) + '/A201';
    p.text(M + 60, 160, 'DOOR SCHEDULE', 18, 'start', 'bold');
    let y = table(p, M + 60, 180, [['MARK', 90], ['LEVEL', 70], ['WALL', 90], ['TYPE', 170], ['WIDTH', 100], ['HEIGHT', 100], ['FRAME', 170], ['R.O. WIDTH', 120], ['HEADER', 190], ['ELEV.', 90], ['REMARKS', 600]],
      mk.doors.map(d => [d.mark, d.level, side(d), d.kind.replace('_', ' '), ftin(d.width_ft), ftin(d.height_ft), d.kind === 'overhead_door' ? 'STEEL JAMBS' : 'HM / WOOD', ftin(d.width_ft + (d.kind === 'overhead_door' ? 0 : 0.17)), header(d.width_ft + 0.25), elevRef(d), d.note || '—']));
    if (!mk.doors.length) { p.text(M + 60, y + 24, 'NO DOORS SHOWN IN THE SOURCE PICTURE. CONFIRM ACCESS + EGRESS.', 11, 'start', 'bold'); y += 40; }
    y += 70; p.text(M + 60, y, 'WINDOW SCHEDULE', 18, 'start', 'bold');
    y = table(p, M + 60, y + 20, [['TYPE', 90], ['QTY', 70], ['WIDTH', 100], ['HEIGHT', 100], ['SILL A.F.F.', 120], ['HEAD A.F.F.', 120], ['OPERATION', 170], ['R.O.', 190], ['HEADER', 190], ['LOCATIONS', 300], ['REMARKS', 340]],
      mk.types.map(tp => { const all = mk.windows.filter(w => w.mark === tp.mark), o = tp.o; return [tp.mark, all.length, ftin(o.width_ft), ftin(o.height_ft), ftin(o.sill_ft), ftin(o.sill_ft + o.height_ft), 'VERIFY', ftin(o.width_ft + 0.04) + ' x ' + ftin(o.height_ft + 0.04), header(o.width_ft + 0.25), [...new Set(all.map(side))].join(', '), o.note || 'SAFETY GLAZING WHERE REQUIRED']; }));
    y += 70; p.text(M + 60, y, 'ROOM SCHEDULE', 18, 'start', 'bold');
    y = table(p, M + 60, y + 20, [['NO.', 90], ['NAME', 340], ['LEVEL', 80], ['SIZE', 260], ['AREA', 120]], mk.rooms.map(r => [r.num, r.name, r.level, ftin(r.w_ft) + ' x ' + ftin(r.d_ft), Math.round(r.w_ft * r.d_ft) + ' SF']));
    p.text(2000, y - (mk.rooms.length + 1) * 30 - 20, 'OPENING NOTES', 14, 'start', 'bold');
    noteList(p, 2046, y - (mk.rooms.length + 1) * 30 + 12, ['Tags match plan + elevations; one model drives all of them', 'Rough openings are starting values: use the manufacturer R.O. for the selected product', 'Headers are typical wood sizes for short spans and must be verified by structural for actual loads', 'Flash every opening shingle-fashion: sill pan, jambs, head, WRB over head flashing', 'Egress, safety glazing, accessible hardware + thresholds per adopted code'], 10, 980);
    const sheet = { num, title: 'Openings + Schedules', scale: 'NONE' };
    return { ...sheet, svg: wrapSheet(p.svg(), ctx, sheet) };
  }

  /* ------------------------------------------------------------------ full set: opening details + code analysis */
  function wallLayers(p, ctx, x, y0, y1, horiz) { // vertical wall strip (section) from y0 to y1 with exterior on the left; returns layer x's
    const T = Math.round(ctx.g.wallT * 100), xs = { clad: x - 9, wrb: x - 2, sh: x, stud: x + 6, gyp: x + T };
    p.rect(x - 9, y0, 7, y1 - y0, 0.8, '#fff'); p.line(x - 2, y0, x - 2, y1, 0.6); p.rect(x, y0, 6, y1 - y0, 0.8, 'url(#h45)');
    p.rect(x + 6, y0, T - 6, y1 - y0, 0.8, 'url(#batt)'); p.rect(x + T, y0, 6, y1 - y0, 0.8, '#fff');
    return xs;
  }
  function winFrame(p, x, y, w, h) { p.rect(x, y, w, h, 1.6, '#fff'); p.rect(x + 8, y + 8, w - 16, h - 16, 1); p.line(x + w / 2 - 2, y + 8, x + w / 2 - 2, y + h - 8, 0.6); p.line(x + w / 2 + 2, y + 8, x + w / 2 + 2, y + h - 8, 0.6); }
  function detailWinHead(p, ctx, x, y, w, h) {
    const bx = x + 260, T = Math.round(ctx.g.wallT * 100), hdrTop = y + 150, hdrBot = y + 150 + 95;
    wallLayers(p, ctx, bx, y + 40, hdrTop);
    p.rect(bx + 6, hdrTop, T - 6, hdrBot - hdrTop, 1.4, 'url(#h135)'); p.rect(bx, hdrTop, 6, hdrBot - hdrTop + 6, 0.8, 'url(#h45)'); p.rect(bx - 9, hdrTop, 7, hdrBot - hdrTop - 14, 0.8, '#fff');
    p.rect(bx + T, hdrTop, 6, hdrBot - hdrTop + 30, 0.8, '#fff');
    winFrame(p, bx - 4, hdrBot + 14, T + 4, 300);
    p.pline([[bx - 2, hdrTop + 20], [bx - 2, hdrBot - 2], [bx - 30, hdrBot - 2], [bx - 36, hdrBot + 8]], 2.2); // head flashing with drip
    p.circle(bx - 14, hdrBot + 12, 4, 1, '#000');
    noteList(p, x + w - 380, y + 50, [ctx.m.wall_assembly.cladding || 'Cladding', 'WRB lapped OVER head flashing (shingle-fashion)', 'Metal head flashing with drip, end dams', 'Header per A800 schedule, verify by structural', 'Sealant + backer rod at interior perimeter', 'Window per manufacturer installation instructions'], 10, 360);
  }
  function detailWinSill(p, ctx, x, y, w, h) {
    const bx = x + 260, T = Math.round(ctx.g.wallT * 100), sill = y + 330;
    winFrame(p, bx - 4, y + 40, T + 4, sill - y - 52);
    p.pline([[bx - 30, sill + 6], [bx - 2, sill - 4], [bx + T - 4, sill - 12], [bx + T - 4, sill - 30]], 2.2); // sloped sill pan with back dam
    p.rect(bx + 6, sill, T - 6, 24, 1.2, 'url(#h135)'); // rough sill
    wallLayers(p, ctx, bx, sill + 24, y + 600);
    p.rect(bx + T, sill - 20, 70, 14, 1.2, '#fff'); // interior stool
    noteList(p, x + w - 380, y + 50, ['Self-adhered sill pan, sloped to the exterior, turned up 6" at jambs', 'Back dam at interior edge', 'Do NOT seal the bottom flange: leave a weep path', 'WRB lapped UNDER the sill pan', 'Interior stool + apron', 'Insulating foam at the shim space (low expansion)'], 10, 360);
  }
  function detailWinJamb(p, ctx, x, y, w, h) { // plan
    const by = y + 250, T = Math.round(ctx.g.wallT * 100), jx = x + 360;
    p.rect(x + 60, by, jx - x - 60, 7, 0.8, '#fff'); p.rect(x + 60, by + 9, jx - x - 60, 6, 0.8, 'url(#h45)'); p.rect(x + 60, by + 15, jx - x - 60, T - 15, 0.8, 'url(#batt)'); p.rect(x + 60, by + T, jx - x - 60, 6, 0.8, '#fff');
    [[jx - 140, 'K'], [jx - 70, 'J']].forEach(([sx]) => { p.rect(sx, by + 15, 70, T - 15, 1.2); p.line(sx, by + 15, sx + 70, by + T, 0.6); p.line(sx + 70, by + 15, sx, by + T, 0.6); });
    winFrame(p, jx + 14, by - 4, 260, T + 8);
    p.pline([[jx - 160, by + 8], [jx + 2, by + 8], [jx + 2, by + 30]], 2); p.circle(jx + 8, by + 2, 4, 1, '#000');
    p.text(jx - 105, by + T + 34, 'KING + JACK STUDS', 9, 'middle');
    noteList(p, x + w - 380, y + 50, ['Jamb flashing over the sill pan, under the head flashing', 'King + jack studs each side of every opening', 'Sealant + backer rod at cladding joint', 'Casing / returns per finish schedule'], 10, 360);
  }
  function detailThreshold(p, ctx, x, y, w, h) {
    const sl = y + 380, bx = x + 300;
    p.rect(x + 30, sl, w - 420, 60, 1.6, 'url(#conc)'); p.rect(x + 30, sl + 60, w - 420, 520 - (sl + 60 - y), 0, 'url(#earth)');
    p.poly([[x + 30, sl + 30], [bx - 20, sl + 22], [bx - 20, sl + 60], [x + 30, sl + 60]], 1.2, 'url(#conc)'); // exterior slab sloped away
    p.poly([[bx - 30, sl - 2], [bx + 80, sl - 2], [bx + 70, sl - 22], [bx - 10, sl - 16]], 1.6, '#fff'); // threshold
    p.rect(bx + 6, y + 60, 50, sl - 24 - y - 60, 1.6, '#fff'); // door leaf
    p.pline([[bx - 40, sl + 2], [bx + 110, sl + 2], [bx + 110, sl - 30]], 2.2); // sill pan
    noteList(p, x + w - 380, y + 50, ['Door threshold set in sealant on a sill pan with back dam', 'Exterior slab / landing max. 1/2" below threshold where an accessible route is required (verify)', 'Slope exterior landing 1/4" per ft max. away from the door (verify)', 'Weatherstrip + door sweep', 'Thickened slab edge per structural'], 10, 360);
  }
  function sheetOpeningDetails(ctx, num) {
    const p = Pen(), cw = 990, ch = 700, xs = [M + 20, M + 1030, M + 2040];
    [[detailWinHead, 'WINDOW HEAD', '1" = 1\'-0"'], [detailWinSill, 'WINDOW SILL', '1" = 1\'-0"'], [detailWinJamb, 'WINDOW JAMB (PLAN)', '1" = 1\'-0"'], [detailThreshold, 'DOOR THRESHOLD AT SLAB', '1" = 1\'-0"']].forEach(([fn, t, sc], i) => {
      const x = xs[i % 3], y = M + 20 + Math.floor(i / 3) * 730, ov = ctx.overrides[(i + 1) + '/' + num];
      if (ov) detailOverride(p, ctx, x, y, cw, ch, ov, i + 1, num); else { fn(p, ctx, x, y, cw, ch); detailBox(p, x, y, cw, ch, String(i + 1), num, t, sc); }
    });
    noteList(p, M + 1076, M + 820, ['Typical for every exterior opening on A201 + A800 unless noted', 'Flashing sequence: sill pan, jambs, head, then WRB over the head flashing', 'Products: follow the window + door manufacturer installation instructions where they differ', 'Safety glazing, egress + accessible thresholds per adopted code'], 11, 900);
    const sheet = { num, title: 'Opening Details', scale: 'AS NOTED' };
    return { ...sheet, svg: wrapSheet(p.svg(), ctx, sheet) };
  }
  function sheetCode(ctx) {
    const { m, g } = ctx, p = Pen(), sheet = { num: 'G002', title: 'Code Analysis + Criteria', scale: 'NONE' };
    const area = Math.round(g.W * g.D), doors = m.openings.filter(o => o.kind !== 'window'), wins = m.openings.filter(o => o.kind === 'window');
    p.text(120, 180, 'CODE ANALYSIS + DESIGN CRITERIA', 44, 'start', 'bold'); p.line(120, 210, 3000, 210, 3);
    p.para(120, 250, 'Starting values drawn from the building model. The design professional confirms each item with the adopted code and the authority having jurisdiction (AHJ). DrawUp never certifies compliance.', 12, 2700);
    let y = 330; p.text(120, y, 'PROJECT + CODE BASIS', 16, 'start', 'bold'); y += 34;
    [['Jurisdiction / code', m.jurisdiction_note || 'Not given: confirm the adopted code edition with the AHJ'], ['Use', m.building_use || 'Confirm'], ['Occupancy group', 'CONFIRM WITH AHJ (by use)'], ['Construction type', m.wall_assembly.stud === 'cmu' ? 'Likely Type V-B or III-B (confirm)' : m.wall_assembly.stud === 'steel_stud' ? 'Likely Type II-B or V-B (confirm)' : 'Likely Type V-B (confirm)'], ['Stories above grade', String(m.stories)], ['Footprint', ftin(g.W) + ' x ' + ftin(g.D) + ' = ' + area + ' SF'], ['Gross floor area', area * m.stories + ' SF (approx.)'], ['Building height', 'Approx. ' + ftin(g.peak) + ' to the highest roof point'], ['Sprinklers', 'CONFIRM: required by use / area?'], ['Accessibility', 'CONFIRM: accessible route, entrance, toilet rooms as applicable']].forEach(([a, b]) => { p.text(120, y, a.toUpperCase(), 12); p.para(560, y, String(b).toUpperCase(), 12, 760, 1.25, 'bold'); y += 30; });
    y += 20; p.text(120, y, 'DESIGN LOADS (BY STRUCTURAL / AHJ)', 16, 'start', 'bold'); y += 34;
    ['Roof live / snow load: ______ PSF', 'Ultimate wind speed: ______ MPH, exposure ___', 'Seismic design category: ___', 'Floor live load: ______ PSF', 'Soil bearing: ______ PSF (assumed until tested)', 'Frost depth: ______ IN'].forEach(t => { p.text(120, y, t.toUpperCase(), 12); y += 26; });
    let ey = 330; const ex = 1500; p.text(ex, ey, 'EGRESS + OPENINGS (FROM THE MODEL)', 16, 'start', 'bold'); ey += 34;
    for (let l = 1; l <= m.stories; l++) {
      const dl = doors.filter(o => o.level === l), wl = wins.filter(o => o.level === l), widest = dl.reduce((a, o) => Math.max(a, o.width_ft), 0);
      ey = p.para(ex, ey, `LEVEL ${l}: ${dl.length} EXTERIOR DOOR${dl.length === 1 ? '' : 'S'}${widest ? ', WIDEST ' + ftin(widest) : ''} · ${wl.length} WINDOW${wl.length === 1 ? '' : 'S'}` + (l > 1 && !dl.length ? ' · EXIT BY INTERIOR STAIR: CONFIRM EXIT COUNT, TRAVEL DISTANCE + EMERGENCY ESCAPE OPENINGS' : ''), 12, 1500) + 8;
    }
    ey = p.para(ex, ey + 6, 'CONFIRM: occupant load, number of exits, exit width, travel distance, door swing + hardware, emergency escape openings where sleeping rooms occur, safety glazing near doors.', 11, 1500) + 20;
    p.text(ex, ey, 'CODE ITEMS TO CONFIRM (FROM DRAWUP)', 16, 'start', 'bold'); ey += 32;
    (m.code_notes.length ? m.code_notes : ['No code items were listed. Ask Arch Coach for a code checklist for this use and location.']).slice(0, 18).forEach((t, i) => { if (ey > SH - 160) return; p.text(ex, ey, String(i + 1) + '.', 12, 'start', 'bold'); ey = p.para(ex + 34, ey, t, 12, 1460) + 6; });
    return { ...sheet, svg: wrapSheet(p.svg(), ctx, sheet) };
  }

  function render(model, opts = {}) {
    const m = model, g = Geo(m), mk = marks(m);
    const level = ['preliminary', 'full'].includes(opts.level) ? opts.level : 'standard';
    const ctx = { overrides: opts.overrides && typeof opts.overrides === 'object' ? opts.overrides : {}, m, g, mk, model: m, level, location: opts.location || '', status: (opts.status || 'PRELIMINARY').toUpperCase(), reviewer: opts.reviewer || '', license: opts.license || '', date: opts.date || new Date().toLocaleDateString('en-US'), firstDate: opts.firstDate || '', revisions: Array.isArray(opts.revisions) ? opts.revisions : [], sourceImage: opts.sourceImage || '', index: [] };
    const nDet = Math.ceil((3 + m.details_needed.length) / 9);
    const full = level === 'full', prelim = level === 'preliminary';
    ctx.index = [{ num: 'G001', title: 'Cover + General Notes' }];
    if (full) ctx.index.push({ num: 'G002', title: 'Code Analysis + Criteria' });
    for (let l = 1; l <= m.stories; l++) ctx.index.push({ num: 'A10' + l, title: m.stories > 1 ? `Level ${l} Plan` + (l === m.stories ? ' + Roof' : '') : 'Floor Plan + Roof Plan' });
    ctx.index.push({ num: 'A201', title: 'Exterior Elevations' }, { num: 'A301', title: 'Building Sections' });
    if (!prelim) {
      for (let i = 0; i < nDet; i++) ctx.index.push({ num: 'A50' + (i + 1), title: i ? 'Details (Continued)' : 'Wall Section + Details' });
      if (full) ctx.index.push({ num: 'A5' + String(nDet + 1).padStart(2, '0'), title: 'Opening Details' });
      ctx.index.push({ num: 'A601', title: 'Foundation + Framing' }, { num: 'A800', title: 'Openings + Schedules' });
    }
    const sheets = [sheetCover(ctx)];
    if (full) sheets.push(sheetCode(ctx));
    for (let l = 1; l <= m.stories; l++) sheets.push(sheetPlan(ctx, l));
    sheets.push(sheetElevations(ctx), sheetSections(ctx));
    if (!prelim) {
      sheets.push(...sheetsDetails(ctx));
      if (full) sheets.push(sheetOpeningDetails(ctx, 'A5' + String(nDet + 1).padStart(2, '0')));
      sheets.push(sheetFraming(ctx), sheetSchedules(ctx));
    }
    return sheets;
  }

  /** v25.1: every detail slot of a set ("4/A501"), where it sits on its sheet, and what is drawn there, so one detail can
   *  be worked on (Details tab) and the approved one put back in that slot only (render opts.overrides). */
  function slots(model, opts = {}) {
    const m = model, level = ['preliminary', 'full'].includes(opts.level) ? opts.level : 'standard';
    if (level === 'preliminary') return [];
    const cw = 990, ch = 700, xs = [M + 20, M + 1030, M + 2040], ys = [M + 20, M + 750, M + 1480], cells = ys.flatMap(y => xs.map(x => [x, y]));
    const items = [{ t: 'Typical wall section', cat: 'Wall Sections' }, { t: 'Eave at eave wall', cat: 'Roofs' }, { t: 'Wall base at foundation', cat: 'Foundations' }, ...(m.details_needed || []).map(d => ({ t: d.title, cat: d.category, why: d.why, where: d.location, need: true }))];
    const out = items.map((it, i) => { const page = Math.floor(i / 9), [x, y] = cells[i % 9], sheet = 'A50' + (page + 1), no = String(i + 1); return { ref: no + '/' + sheet, no, sheet, title: it.t, category: it.cat, needed: !!it.need, why: it.why || '', where: it.where || '', rect: [x, y, cw, ch] }; });
    if (level === 'full') {
      const sheet = 'A5' + String(Math.ceil(items.length / 9) + 1).padStart(2, '0');
      [['Window head', 'Windows'], ['Window sill', 'Windows'], ['Window jamb (plan)', 'Windows'], ['Door threshold at slab', 'Doors']].forEach(([t, cat], i) => out.push({ ref: (i + 1) + '/' + sheet, no: String(i + 1), sheet, title: t, category: cat, needed: false, why: '', where: '', rect: [xs[i % 3], M + 20 + Math.floor(i / 3) * 730, cw, ch] }));
    }
    return out;
  }
  /** One region of a sheet's svg as its own svg (same drawing, cropped by its viewBox). */
  const cropSvg = (svg, [x, y, w, h], px = w) => String(svg).replace(/<svg([^>]*?)viewBox="[^"]*" width="[^"]*" height="[^"]*"/, `<svg$1viewBox="${x} ${y} ${w} ${h}" width="${px}" height="${Math.round(px * h / w)}"`);

  window.DrawUpSheets = { render, ftin, SW, SH, slots, cropSvg };
})();
