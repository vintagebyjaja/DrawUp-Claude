/* DrawUp Check V22
 *  - Redlines on the actual sheets: every finding is clouded on its own page and region, located with the
 *    PDF text layer (sheet numbers, room names, tags) plus the reviewer's region estimate. Shown in an on-screen
 *    viewer and written into the downloaded PDF on an optional-content layer, over the untouched original pages.
 *  - Proposed fix redrawn on the same sheet in drafting style (dimension strings, tags, notes, code summary
 *    blocks, schedules), on its own layer. It never draws a different building.
 *  - Design narrative review (PDF or Word): review first with labelled points, the member approves changes,
 *    then a rewritten professional document downloads as Word and PDF.
 *  - Narrative vs. plans: what the narrative should cover based on the plans, and statements that conflict
 *    with the plans, cited by sheet and page and clouded on the plan set.
 *  - Never hangs: findings that arrived are shown, the job finishes in the background and DrawUp notifies.
 * The Check tab in drawup-tools-v18.js calls window.DrawUpCheckV22.route first. pdf.js (Apache-2.0) and
 * pdf-lib (MIT) are vendored under /vendor and load only when needed.
 */
(function () {
  'use strict';
  const P = window.DrawUpPortal;
  const BUCKET = 'drawup-private';
  const PDFJS = '/vendor/pdfjs-3.11.174/pdf.min.js', PDFJS_WORKER = '/vendor/pdfjs-3.11.174/pdf.worker.min.js', PDFLIB = '/vendor/pdf-lib-1.17.1.min.js';
  const X = window.DrawUpCheckV22 = window.DrawUpCheckV22 || {};
  const $q = (w, s) => w.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const uuid = () => (crypto.randomUUID && crypto.randomUUID()) || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); });
  const fmtWhen = d => d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const SEV = ['critical', 'major', 'minor', 'info'];
  const SEV_RGB = { critical: [0.85, 0.11, 0.11], major: [0.9, 0.38, 0.02], minor: [0.1, 0.4, 0.85], info: [0.42, 0.45, 0.5] };
  const GREEN = [0.03, 0.5, 0.22], INK = [0.07, 0.08, 0.1], WARN = [0.72, 0.3, 0.0], WHITE = [1, 1, 1];
  const LABEL_TXT = { document_states: 'Document states', verified_requirement: 'Verified requirement', recommendation: 'Recommendation', needs_confirmation: 'Needs confirmation' };
  const MODE_TXT = { plans: 'Drawing set check', narrative: 'Design narrative review', narrative_plans: 'Narrative vs. plans' };
  const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const sortFindings = fs => (fs || []).slice().sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity));
  const slug = t => String(t || 'drawup-check').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'drawup-check';

  function download(name, data, type) { const blob = data instanceof Blob ? data : new Blob([data], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
  async function api(c, path, opts) { const token = await c.token(); const r = await fetch(path, { ...(opts || {}), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...((opts || {}).headers || {}) } }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || ('Request failed (' + r.status + ')')); return d; }
  const loaded = {};
  function loadScript(src) { if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { loaded[src] = null; rej(new Error('The PDF tools could not load. Check your connection and try again.')); }; document.head.appendChild(s); }); return loaded[src]; }
  async function pdfjs() { await loadScript(PDFJS); const L = window.pdfjsLib; L.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return L; }
  async function pdflib() { if (window.PDFLib) return window.PDFLib; await loadScript(PDFLIB); return window.PDFLib; }
  async function fileBytes(c, path) { const { data, error } = await c.client.storage.from(BUCKET).download(path); if (error) throw error; return new Uint8Array(await data.arrayBuffer()); }
  const isPdfBytes = b => b && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

  /* Standard PDF fonts use WinAnsi: keep what it can print, replace the rest. */
  const win = t => String(t ?? '').replace(/[′]/g, "'").replace(/[″]/g, '"').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/×/g, 'x').replace(/[‐‑‒]/g, '-').replace(/[^\x20-\x7e\xa0-\xff•–—‘’“”…\n]/g, '');

  /* ====================================================================== text layer */
  /** Reads the PDF with pdf.js: page sizes as seen (rotation applied) and every text item with its box (fractions). */
  async function readLayer(bytes) {
    const L = await pdfjs();
    const doc = await L.getDocument({ data: bytes.slice(0), isEvalSupported: false }).promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const pg = await doc.getPage(n), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
      const W = vp.width, H = vp.height, items = [];
      for (const it of tc.items) {
        const s = it.str || ''; if (!s.trim()) continue;
        const t = L.Util.transform(vp.transform, it.transform);
        const fh = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]) || 1, ang = Math.atan2(t[1], t[0]);
        const wv = it.width || s.length * fh * 0.5, ux = Math.cos(ang), uy = Math.sin(ang), upx = t[2] / (Math.hypot(t[2], t[3]) || 1) * fh, upy = t[3] / (Math.hypot(t[2], t[3]) || 1) * fh;
        const xs = [t[4], t[4] + ux * wv, t[4] + upx, t[4] + ux * wv + upx], ys = [t[5], t[5] + uy * wv, t[5] + upy, t[5] + uy * wv + upy];
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        items.push({ s, x0: x0 / W, x1: x1 / W, y0: y0 / H, y1: y1 / H, fh, horiz: Math.abs(uy) < 0.2 && ux > 0 });
      }
      pages.push({ n, W, H, items, lines: buildLines(items, W, H), text: items.map(i => i.s).join(' ') });
    }
    return { doc, pages };
  }
  /** Joins text items that sit on one baseline into lines, so multi-word labels can be found. */
  function buildLines(items, W, H) {
    const hz = items.filter(i => i.horiz).sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
    const lines = [], active = [];
    for (const it of hz) {
      const cy = (it.y0 + it.y1) / 2, h = it.y1 - it.y0;
      for (let k = active.length - 1; k >= 0; k--) if (cy - active[k].cy > Math.max(h, active[k].h)) active.splice(k, 1);
      const gap = L => (it.x0 - L.x1) * W / (h * H);
      let line = active.find(L => Math.abs(L.cy - cy) < Math.max(h, L.h) * 0.45 && gap(L) < 1.6 && gap(L) > -0.6 && Math.abs(L.h - h) < Math.max(L.h, h) * 0.5);
      if (!line) { line = { items: [], cy, h, x1: it.x1 }; active.push(line); lines.push(line); }
      line.items.push(it); line.x1 = Math.max(line.x1, it.x1);
    }
    const out = lines.map(L => {
      L.items.sort((a, b) => a.x0 - b.x0);
      let s = ''; L.items.forEach((it, i) => { const prev = L.items[i - 1]; if (prev && (it.x0 - prev.x1) * W > (it.y1 - it.y0) * H * 0.25 && !/\s$/.test(s)) s += ' '; s += it.s; });
      return { s, x0: Math.min(...L.items.map(i => i.x0)), x1: Math.max(...L.items.map(i => i.x1)), y0: Math.min(...L.items.map(i => i.y0)), y1: Math.max(...L.items.map(i => i.y1)), fh: Math.max(...L.items.map(i => i.fh)), horiz: true };
    });
    items.filter(i => !i.horiz).forEach(i => out.push({ ...i, horiz: false }));
    return out;
  }
  /** Compact page text for the reviewer, so it can cite pages and copy anchors exactly. */
  function layerForServer(pages, perPage = 3000, total = 60000) {
    const out = []; let used = 0;
    for (const p of pages) { const t = p.lines.map(l => l.s).join(' | ').replace(/\s+/g, ' ').slice(0, perPage); if (used + t.length > total) break; used += t.length; out.push({ page: p.n, text: t }); }
    return out;
  }
  const norm = s => String(s || '').toUpperCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /** Where `anchor` is printed on the page (fraction boxes). Whole-word match; letter-spaced CAD text also matches. */
  function findText(pg, anchor) {
    const A = norm(anchor); if (A.length < 2) return [];
    const re = new RegExp('(^|[^A-Z0-9])' + reEsc(A) + '(?=$|[^A-Z0-9])');
    const Ac = A.replace(/\s/g, ''), hits = [];
    for (const L of pg.lines) {
      const U = norm(L.s); const m = re.exec(U);
      let idx = m ? m.index + m[1].length : -1, len = A.length, tot = U.length;
      if (idx < 0 && Ac.length >= 4) { const Uc = U.replace(/\s/g, ''); const k = Uc.indexOf(Ac); if (k >= 0) { idx = k; len = Ac.length; tot = Uc.length; } }
      if (idx < 0) continue;
      if (L.horiz && tot > 0) { const span = L.x1 - L.x0; hits.push({ x0: L.x0 + span * idx / tot, x1: L.x0 + span * (idx + len) / tot, y0: L.y0, y1: L.y1, fh: L.fh, s: A }); }
      else hits.push({ x0: L.x0, x1: L.x1, y0: L.y0, y1: L.y1, fh: L.fh, s: A });
    }
    return hits;
  }
  const SHEET_RE = /\b[A-Z]{1,3}[-.]?\d{1,3}(?:\.\d{1,2})?[A-Z]?\b/g;
  function sheetTokens(s) { return [...new Set((String(s || '').toUpperCase().match(SHEET_RE) || []).filter(t => /\d/.test(t) && !/^(IBC|ADA|NFPA|ICC)/.test(t)))]; }
  /** The page whose title block shows this sheet number: the largest printing of it, preferring the lower right. */
  function pageForSheet(pages, tok) {
    let best = null, score = 0;
    for (const pg of pages) for (const h of findText(pg, tok)) { const s = h.fh * (h.x0 > 0.55 && h.y0 > 0.45 ? 1.6 : 1); if (s > score) { score = s; best = pg.n; } }
    return best;
  }

  /* ====================================================================== ink map (empty space finder) */
  async function inkMap(L, pdfDoc, n) {
    const pg = await pdfDoc.getPage(n), vp0 = pg.getViewport({ scale: 1 }), s = 220 / Math.max(vp0.width, vp0.height), vp = pg.getViewport({ scale: s });
    const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    const { data } = ctx.getImageData(0, 0, cv.width, cv.height), W = cv.width, H = cv.height, S = new Float32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; row += (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11) < 215 ? 1 : 0; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row; } }
    return { density(b) { const x0 = Math.max(0, Math.floor(b.x * W)), y0 = Math.max(0, Math.floor(b.y * H)), x1 = Math.min(W, Math.ceil((b.x + b.w) * W)), y1 = Math.min(H, Math.ceil((b.y + b.h) * H)); if (x1 <= x0 || y1 <= y0) return 1; const sum = S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0]; return sum / ((x1 - x0) * (y1 - y0)); } };
  }

  /* ====================================================================== locate + layout */
  let measureFont = null;
  async function measurer() {
    if (measureFont) return measureFont;
    const L = await pdflib(); const d = await L.PDFDocument.create();
    const f = await d.embedFont(L.StandardFonts.Helvetica), b = await d.embedFont(L.StandardFonts.HelveticaBold);
    measureFont = (s, size, bold) => { try { return (bold ? b : f).widthOfTextAtSize(win(s), size); } catch (_e) { return String(s).length * size * 0.55; } };
    return measureFont;
  }
  const textPt = (VW, VH) => Math.max(6.5, Math.min(14, Math.min(VW, VH) * 0.0058));
  const clip = (s, n) => (s = String(s || ''), s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
  function wrap(measure, text, size, maxW, bold) { const out = []; String(text || '').split('\n').forEach(par => { let cur = ''; par.split(/\s+/).filter(Boolean).forEach(w => { const t = cur ? cur + ' ' + w : w; if (measure(t, size, bold) > maxW && cur) { out.push(cur); cur = w; } else cur = t; }); out.push(cur); }); return out; }
  /** The fix to draw: the reviewer's, or a note made from the recommendation for older reviews. */
  function fixOf(f) {
    if (f.fix && f.fix.type && f.fix.type !== 'none') return f.fix;
    if (!f.recommendation) return null;
    return { type: 'note', symbol: 'none', label: '', lines: [String(f.recommendation).toUpperCase()], box: null };
  }
  /** Size of the drawn fix block in points, laid out the same way the pens draw it. */
  function fixLayout(fx, measure, ts) {
    const pad = ts * 0.6;
    if (fx.type === 'note') {
      const lines = []; (fx.lines.length ? fx.lines : [fx.label]).forEach(l => wrap(measure, String(l).toUpperCase(), ts, ts * 30, false).forEach(x => lines.push(x)));
      const w = Math.max(...lines.map(l => measure(l, ts, false)), ts * 6) + pad * 2; return { kind: 'note', lines: lines.slice(0, 14), w, h: Math.min(14, lines.length) * ts * 1.45 + pad * 1.6 };
    }
    if (fx.type === 'code_summary' || fx.type === 'table') {
      const title = (fx.label || (fx.type === 'code_summary' ? 'CODE SUMMARY' : 'SCHEDULE')).toUpperCase();
      const rows = (fx.lines.length ? fx.lines : ['NEEDS CONFIRMATION']).slice(0, 14).map(l => fx.type === 'code_summary' ? (k => k < 0 ? [l, ''] : [l.slice(0, k), l.slice(k + 1)])(l.indexOf(':')).map(s => clip(s.trim().toUpperCase(), 54)) : l.split('|').map(s => clip(s.trim().toUpperCase(), 40)));
      const cols = Math.max(...rows.map(r => r.length)), cw = [];
      for (let k = 0; k < cols; k++) cw[k] = Math.max(ts * 3, ...rows.map(r => measure(r[k] || '', ts * 0.92, k === 0 && fx.type === 'code_summary'))) + pad * 2;
      const w = Math.max(cw.reduce((a, b) => a + b, 0), measure(title, ts * 1.1, true) + pad * 2), rh = ts * 1.55, th = ts * 1.9;
      if (cw.reduce((a, b) => a + b, 0) < w) cw[cw.length - 1] += w - cw.reduce((a, b) => a + b, 0);
      return { kind: 'table', title, rows, cw, rh, th, w, h: th + rows.length * rh };
    }
    if (fx.type === 'tag') {
      const label = clip(String(fx.label || '?').toUpperCase(), 24), tw = measure(label, ts, true);
      if (fx.symbol === 'room') return { kind: 'tag', label, w: tw + ts * 1.6, h: ts * 2.2 };
      const d = Math.max(ts * 2.4, tw + ts * 1.2); return { kind: 'tag', label, w: d, h: fx.symbol === 'door' ? d * 0.87 : d };
    }
    return { kind: 'dimension' };
  }
  /**
   * Places every finding: page (sheet number + text layer), region (anchors found in the text layer, else the
   * reviewer's box), and where the redrawn fix goes (an empty area next to it). Same result for viewer and PDF.
   */
  async function locateAll(findings, layer, opts) {
    const measure = await measurer(), L = await pdfjs(), pages = layer.pages, inks = {};
    const ink = async n => { if (!inks[n]) inks[n] = await inkMap(L, layer.doc, n).catch(() => ({ density: () => 0 })); return inks[n]; };
    const out = [], blocks = {};
    for (let i = 0; i < findings.length; i++) {
      const f = findings[i], n = i + 1, toks = sheetTokens(f.sheet);
      let page = null, how = 'model';
      const bySheet = toks.length ? pageForSheet(pages, toks[0]) : null;
      if (f.page && pages[f.page - 1]) { page = f.page; if (bySheet && bySheet !== page && !findText(pages[page - 1], toks[0]).length) page = bySheet; }
      else if (bySheet) page = bySheet;
      if (!page) { page = 1; how = 'set'; }
      const pg = pages[page - 1];
      const anchors = [...(f.anchors || [])];
      String((f.location || '') + ' ' + (f.issue || '')).replace(/["“‘']([^"”’']{2,40})["”’']/g, (_m, a) => { anchors.push(a); return _m; });
      const mb = f.box && f.page === page ? f.box : null;
      let box = null;
      for (const a of anchors) {
        const hits = findText(pg, a); if (!hits.length) continue;
        const cx = mb ? mb.x + mb.w / 2 : 0.5, cy = mb ? mb.y + mb.h / 2 : 0.5;
        const h = hits.slice().sort((p, q) => Math.hypot((p.x0 + p.x1) / 2 - cx, (p.y0 + p.y1) / 2 - cy) - Math.hypot((q.x0 + q.x1) / 2 - cx, (q.y0 + q.y1) / 2 - cy))[0];
        const aw = h.x1 - h.x0, ah = h.y1 - h.y0, ratio = pg.W / pg.H;
        const w = Math.min(0.35, Math.max(aw + 0.035, Math.min(mb ? mb.w : 0.12, 0.3))), hh = Math.min(0.3, Math.max(ah + 0.035 * ratio, Math.min(mb ? mb.h : 0.1, 0.25)));
        box = { x: (h.x0 + h.x1) / 2 - w / 2, y: (h.y0 + h.y1) / 2 - hh / 2, w, h: hh }; how = 'text'; f._anchor = h.s; break;
      }
      if (!box && mb) box = { ...mb };
      if (!box) {
        const t = toks.length ? findText(pg, toks[0]).sort((p, q) => q.fh - p.fh)[0] : null;
        box = t ? { x: t.x0 - 0.03, y: t.y0 - 0.03, w: (t.x1 - t.x0) + 0.06, h: (t.y1 - t.y0) + 0.06 } : { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };
        if (how !== 'set') how = 'sheet';
      }
      box.x = Math.max(0.005, Math.min(0.995 - box.w, box.x)); box.y = Math.max(0.005, Math.min(0.995 - box.h, box.y));
      const pl = { n, f, page, box, how, also: toks.slice(1, 6), sheet: toks[0] || f.sheet || '' };
      { // where drawRedline puts its caption, so fix blocks keep clear of it
        const ts0 = textPt(pg.W, pg.H), r0 = Math.max(7, ts0 * 1.05) / pg.H, cap = `${n}  ${String(f.severity).toUpperCase()}: ${clip(f.issue, 96)}` + (toks.length > 1 ? '  (ALSO ' + toks.slice(1, 6).join(', ') + ')' : '');
        const cw = (measure(cap, ts0, true) + ts0) / pg.W, ch = ts0 * 1.55 / pg.H; let cy = box.y - r0 - ch;
        if (cy < 4 / pg.H) cy = box.y + box.h + r0 * 0.6;
        (blocks[page] = blocks[page] || []).push({ x: Math.max(0, Math.min(box.x, 1 - cw)), y: cy, w: cw, h: ch });
      }
      const fx = opts && opts.noFix ? null : fixOf(f);
      if (fx) {
        const ts = textPt(pg.W, pg.H), lay = fixLayout(fx, measure, ts);
        pl.fix = fx; pl.lay = lay;
        if (lay.kind === 'dimension') {
          let fb = fx.box && f.page === page ? { ...fx.box } : { ...box };
          if (how === 'text' && fx.box && mb) { fb.x += box.x - mb.x; fb.y += box.y - mb.y; }
          fb.x = Math.max(0.01, Math.min(0.99 - fb.w, fb.x)); fb.y = Math.max(0.01, Math.min(0.99 - fb.h, fb.y)); pl.fixBox = fb;
        } else {
          const bw = lay.w / pg.W, bh = lay.h / pg.H, g = 0.012, map = await ink(page);
          const T = box, cands = [];
          const pref = fx.box && f.page === page && how !== 'text' ? fx.box : null;
          if (pref) cands.push([pref.x, pref.y, -0.5]);
          cands.push([T.x + T.w + g, T.y, 0], [T.x - g - bw, T.y, 0.02], [T.x, T.y + T.h + g, 0.03], [T.x, T.y - g - bh, 0.04], [T.x + T.w + g, T.y + T.h - bh, 0.02], [T.x + T.w - bw, T.y + T.h + g, 0.04]);
          for (let gx = 0.02; gx < 0.98; gx += 0.04) for (let gy = 0.02; gy < 0.98; gy += 0.04) cands.push([gx, gy, 0.08]);
          const placed = blocks[page] || (blocks[page] = []);
          let best = null, bs = Infinity;
          for (const [x, y, bias] of cands) {
            if (x < 0.008 || y < 0.008 || x + bw > 0.992 || y + bh > 0.992) continue;
            const b = { x, y, w: bw, h: bh };
            const over = placed.concat([T]).some(o => !(b.x > o.x + o.w || b.x + b.w < o.x || b.y > o.y + o.h || b.y + b.h < o.y)) ? 1 : 0;
            const dist = Math.hypot((x + bw / 2) - (T.x + T.w / 2), (y + bh / 2) - (T.y + T.h / 2));
            const s = map.density(b) * 12 + dist * 1.5 + over * 3 + bias;
            if (s < bs) { bs = s; best = b; }
          }
          pl.block = best || { x: Math.max(0.01, Math.min(0.99 - bw, T.x)), y: Math.max(0.01, Math.min(0.99 - bh, T.y + T.h + g)), w: bw, h: bh };
          placed.push(pl.block);
        }
      }
      out.push(pl);
    }
    return out;
  }

  /* ====================================================================== drawing (one routine, two pens) */
  function cloudPts(x, y, w, h, step) {
    const pts = [], nx = Math.max(1, Math.round(w / step)), ny = Math.max(1, Math.round(h / step)), sx = w / nx, sy = h / ny;
    for (let i = 0; i < nx; i++) pts.push([x + (i + 1) * sx, y, sx / 2, step / 2]);
    for (let i = 0; i < ny; i++) pts.push([x + w, y + (i + 1) * sy, step / 2, sy / 2]);
    for (let i = nx - 1; i >= 0; i--) pts.push([x + i * sx, y + h, sx / 2, step / 2]);
    for (let i = ny - 1; i >= 0; i--) pts.push([x, y + i * sy, step / 2, sy / 2]);
    return pts;
  }
  /** SVG pen: draws in page points (top-left origin, page as seen). */
  function svgPen(measure) {
    let s = '';
    const col = c => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;
    return {
      measure,
      line(x1, y1, x2, y2, o) { s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col(o.color)}" stroke-width="${o.w}"${o.dash ? ` stroke-dasharray="${o.dash.join(' ')}"` : ''} stroke-linecap="round"/>`; },
      rect(x, y, w, h, o) { s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.fill ? col(o.fill) : 'none'}"${o.opacity != null ? ` fill-opacity="${o.opacity}"` : ''}${o.stroke ? ` stroke="${col(o.stroke)}" stroke-width="${o.w}"` : ''}/>`; },
      poly(pts, o) { s += `<polygon points="${pts.map(p => p.join(',')).join(' ')}" fill="${o.fill ? col(o.fill) : 'none'}"${o.stroke ? ` stroke="${col(o.stroke)}" stroke-width="${o.w}"` : ''} stroke-linejoin="round"/>`; },
      circle(cx, cy, r, o) { s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.fill ? col(o.fill) : 'none'}"${o.stroke ? ` stroke="${col(o.stroke)}" stroke-width="${o.w}"` : ''}/>`; },
      text(t, x, y, o) { const a = o.angle || 0; s += `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${o.size}"${o.bold ? ' font-weight="700"' : ''} fill="${col(o.color)}"${o.anchor === 'middle' ? ' text-anchor="middle"' : ''}${a ? ` transform="rotate(${-a} ${x} ${y})"` : ''}>${esc(win(t))}</text>`; },
      cloud(x, y, w, h, o) { const step = Math.max(8, Math.min(w, h) / 5); let d = `M${x} ${y}`; cloudPts(x, y, w, h, step).forEach(([px, py, rx, ry]) => { d += ` A${rx} ${ry} 0 0 1 ${px} ${py}`; }); s += `<path d="${d}" fill="none" stroke="${col(o.color)}" stroke-width="${o.w}" stroke-linejoin="round"/>`; },
      out() { return s; },
    };
  }
  /** pdf-lib pen: same calls, mapped from page-as-seen points into PDF user space (CropBox and /Rotate honoured). */
  function pdfPen(L, page, fonts, measure) {
    const { rgb, degrees } = L;
    const cb = page.getCropBox(), rot = ((page.getRotation().angle % 360) + 360) % 360, W = cb.width, H = cb.height;
    const VW = rot % 180 ? H : W, VH = rot % 180 ? W : H;
    const map = (vx, vy) => { const fx = vx / VW, fy = vy / VH; return rot === 90 ? [cb.x + fy * W, cb.y + fx * H] : rot === 180 ? [cb.x + W - fx * W, cb.y + fy * H] : rot === 270 ? [cb.x + W - fy * W, cb.y + H - fx * H] : [cb.x + fx * W, cb.y + H - fy * H]; };
    const C = c => rgb(c[0], c[1], c[2]);
    const path = pts => pts.map((p, i) => { const [ux, uy] = map(p[0], p[1]); return (i ? 'L' : 'M') + ux.toFixed(2) + ' ' + (-uy).toFixed(2); }).join(' ') + ' Z';
    return {
      VW, VH, measure,
      line(x1, y1, x2, y2, o) { const [a, b] = map(x1, y1), [c, d] = map(x2, y2); page.drawLine({ start: { x: a, y: b }, end: { x: c, y: d }, thickness: o.w, color: C(o.color), dashArray: o.dash, lineCap: L.LineCapStyle.Round }); },
      rect(x, y, w, h, o) { page.drawSvgPath(path([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]), { x: 0, y: 0, color: o.fill ? C(o.fill) : undefined, opacity: o.opacity, borderColor: o.stroke ? C(o.stroke) : undefined, borderWidth: o.stroke ? o.w : 0 }); },
      poly(pts, o) { page.drawSvgPath(path(pts), { x: 0, y: 0, color: o.fill ? C(o.fill) : undefined, borderColor: o.stroke ? C(o.stroke) : undefined, borderWidth: o.stroke ? o.w : 0 }); },
      circle(cx, cy, r, o) { const [a, b] = map(cx, cy); page.drawCircle({ x: a, y: b, size: r, color: o.fill ? C(o.fill) : undefined, borderColor: o.stroke ? C(o.stroke) : undefined, borderWidth: o.stroke ? o.w : 0 }); },
      text(t, x, y, o) { const s = win(t); const w = measure(s, o.size, o.bold); const a = (o.angle || 0) * Math.PI / 180; let sx = x, sy = y; if (o.anchor === 'middle') { sx = x - Math.cos(a) * w / 2; sy = y + Math.sin(a) * w / 2; } const [ux, uy] = map(sx, sy); page.drawText(s, { x: ux, y: uy, size: o.size, font: o.bold ? fonts.bold : fonts.font, color: C(o.color), rotate: degrees(rot + (o.angle || 0)) }); },
      cloud(x, y, w, h, o) {
        const [a, b] = map(x, y), [c, d] = map(x + w, y + h); const ux = Math.min(a, c), uy = Math.min(b, d), uw = Math.abs(c - a), uh = Math.abs(d - b);
        const step = Math.max(8, Math.min(uw, uh) / 5), r = step / 2, nx = Math.max(1, Math.round(uw / step)), ny = Math.max(1, Math.round(uh / step)), sx = uw / nx, sy = uh / ny; let p = 'M0 0';
        for (let i = 0; i < nx; i++) p += ` A${sx / 2} ${r} 0 0 1 ${(i + 1) * sx} 0`;
        for (let i = 0; i < ny; i++) p += ` A${r} ${sy / 2} 0 0 1 ${uw} ${(i + 1) * sy}`;
        for (let i = nx - 1; i >= 0; i--) p += ` A${sx / 2} ${r} 0 0 1 ${i * sx} ${uh}`;
        for (let i = ny - 1; i >= 0; i--) p += ` A${r} ${sy / 2} 0 0 1 0 ${i * sy}`;
        page.drawSvgPath(p, { x: ux, y: uy + uh, borderColor: C(o.color), borderWidth: o.w, borderOpacity: 0.95 });
      },
    };
  }
  /** Redline: severity cloud, numbered bubble and a one-line caption on the sheet. */
  function drawRedline(pen, pl, VW, VH) {
    const f = pl.f, color = SEV_RGB[f.severity] || SEV_RGB.info, short = Math.min(VW, VH), ts = textPt(VW, VH);
    const R = { x: pl.box.x * VW, y: pl.box.y * VH, w: pl.box.w * VW, h: pl.box.h * VH }, lw = Math.max(1.2, short / 420);
    pen.cloud(R.x, R.y, R.w, R.h, { color, w: lw });
    const r = Math.max(7, ts * 1.05);
    pen.circle(R.x, R.y, r, { fill: color, stroke: WHITE, w: 1 });
    pen.text(String(pl.n), R.x, R.y + r * 0.37, { size: r * 1.05, bold: true, color: WHITE, anchor: 'middle' });
    const cap = clip(`${pl.n}  ${String(f.severity).toUpperCase()}: ${f.issue}`, 96) + (pl.also.length ? `  (ALSO ${pl.also.join(', ')})` : '');
    const cw = pen.measure(cap, ts, true) + ts, ch = ts * 1.55;
    let cx = Math.min(R.x + r + 2, VW - cw - 4), cy = R.y - r - ch - 2;
    if (cy < 4) cy = R.y + R.h + r * 0.6;
    cx = Math.max(4, cx);
    pen.rect(cx, cy, cw, ch, { fill: WHITE, opacity: 0.9, stroke: color, w: 0.6 });
    pen.text(cap, cx + ts * 0.5, cy + ch * 0.7, { size: ts, bold: true, color });
  }
  function delta(pen, x, y, n, ts) { const s = ts * 2.1; pen.poly([[x, y - s * 0.62], [x + s * 0.58, y + s * 0.38], [x - s * 0.58, y + s * 0.38]], { fill: WHITE, stroke: GREEN, w: 1.2 }); pen.text(String(n), x, y + s * 0.24, { size: ts * 0.95, bold: true, color: GREEN, anchor: 'middle' }); }
  const inkFor = t => /NEEDS CONFIRMATION|VERIFY/i.test(t) ? WARN : INK;
  function arrow(pen, x1, y1, x2, y2, w, ts) {
    pen.line(x1, y1, x2, y2, { color: INK, w });
    const a = Math.atan2(y2 - y1, x2 - x1), L = ts * 0.9;
    pen.poly([[x2, y2], [x2 - L * Math.cos(a - 0.35), y2 - L * Math.sin(a - 0.35)], [x2 - L * Math.cos(a + 0.35), y2 - L * Math.sin(a + 0.35)]], { fill: INK });
  }
  /** Proposed fix in drafting style on the same sheet: dimension, tag, note, code summary or schedule. */
  function drawFix(pen, pl, VW, VH) {
    const fx = pl.fix, lay = pl.lay; if (!fx || !lay) return;
    const ts = textPt(VW, VH), short = Math.min(VW, VH), thin = Math.max(0.5, short / 2400), med = thin * 1.8;
    const T = { x: pl.box.x * VW, y: pl.box.y * VH, w: pl.box.w * VW, h: pl.box.h * VH };
    let E;
    if (lay.kind === 'dimension') {
      const B = { x: pl.fixBox.x * VW, y: pl.fixBox.y * VH, w: pl.fixBox.w * VW, h: pl.fixBox.h * VH }, label = String(fx.label || 'DIMENSION: NEEDS CONFIRMATION').toUpperCase();
      const tk = ts * 0.75, lw = pen.measure(label, ts, false) + ts;
      if (B.w >= B.h * 0.8) {
        const y = B.y + B.h * 0.28, x1 = B.x, x2 = B.x + B.w; // off the room label
        pen.line(x1, B.y + B.h * 0.18, x1, B.y + B.h * 0.82, { color: INK, w: thin }); pen.line(x2, B.y + B.h * 0.18, x2, B.y + B.h * 0.82, { color: INK, w: thin });
        pen.line(x1 - tk * 0.6, y, x2 + tk * 0.6, y, { color: INK, w: thin });
        [x1, x2].forEach(x => pen.line(x - tk / 2, y + tk / 2, x + tk / 2, y - tk / 2, { color: INK, w: med }));
        const tx = (x1 + x2) / 2; pen.rect(tx - lw / 2, y - ts * 1.45, lw, ts * 1.25, { fill: WHITE, opacity: 0.92 }); pen.text(label, tx, y - ts * 0.45, { size: ts, color: inkFor(label), anchor: 'middle' });
        E = { x: Math.min(x1, tx - lw / 2) - 4, y: B.y, w: Math.max(B.w, lw) + 8, h: B.h };
      } else {
        const x = B.x + B.w * 0.5, y1 = B.y, y2 = B.y + B.h;
        pen.line(B.x + B.w * 0.18, y1, B.x + B.w * 0.82, y1, { color: INK, w: thin }); pen.line(B.x + B.w * 0.18, y2, B.x + B.w * 0.82, y2, { color: INK, w: thin });
        pen.line(x, y1 - tk * 0.6, x, y2 + tk * 0.6, { color: INK, w: thin });
        [y1, y2].forEach(y => pen.line(x - tk / 2, y + tk / 2, x + tk / 2, y - tk / 2, { color: INK, w: med }));
        const ty = (y1 + y2) / 2; pen.rect(x - ts * 1.45, ty - lw / 2, ts * 1.25, lw, { fill: WHITE, opacity: 0.92 }); pen.text(label, x - ts * 0.45, ty, { size: ts, color: inkFor(label), anchor: 'middle', angle: 90 });
        E = { x: B.x, y: Math.min(y1, ty - lw / 2) - 4, w: B.w, h: Math.max(B.h, lw) + 8 };
      }
    } else {
      const B = { x: pl.block.x * VW, y: pl.block.y * VH, w: pl.block.w * VW, h: pl.block.h * VH }; E = { ...B };
      const tcx = T.x + T.w / 2, tcy = T.y + T.h / 2;
      const edge = () => { const bx = Math.max(B.x, Math.min(B.x + B.w, tcx)), by = Math.max(B.y, Math.min(B.y + B.h, tcy)); return [bx === tcx && by === tcy ? B.x : bx, by]; };
      const target = () => [Math.max(T.x, Math.min(T.x + T.w, B.x + B.w / 2)), Math.max(T.y, Math.min(T.y + T.h, B.y + B.h / 2))];
      if (lay.kind === 'note') {
        pen.rect(B.x, B.y, B.w, B.h, { fill: WHITE, opacity: 0.93 });
        lay.lines.forEach((l, k) => pen.text(l, B.x + ts * 0.6, B.y + ts * 0.6 + ts * 1.45 * k + ts * 0.95, { size: ts, color: inkFor(l), bold: k === 0 && /:$/.test(l) }));
        const [ex, ey] = edge(), [tx, ty] = target(); if (Math.hypot(tx - ex, ty - ey) > ts) arrow(pen, ex, ey, tx, ty, thin * 1.3, ts);
      } else if (lay.kind === 'table') {
        pen.rect(B.x, B.y, B.w, B.h, { fill: WHITE, opacity: 0.95, stroke: INK, w: med });
        pen.line(B.x, B.y + lay.th, B.x + B.w, B.y + lay.th, { color: INK, w: med });
        pen.text(lay.title, B.x + ts * 0.6, B.y + lay.th * 0.68, { size: ts * 1.1, bold: true, color: INK });
        lay.rows.forEach((row, k) => {
          const y = B.y + lay.th + lay.rh * k; if (k) pen.line(B.x, y, B.x + B.w, y, { color: INK, w: thin });
          let x = B.x; row.forEach((cell, j) => { if (j) pen.line(x, y, x, y + lay.rh, { color: INK, w: thin }); pen.text(cell, x + ts * 0.6, y + lay.rh * 0.68, { size: ts * 0.92, bold: j === 0 && fx.type === 'code_summary', color: inkFor(cell) }); x += lay.cw[j] || 0; });
        });
        const [ex, ey] = edge(), [tx, ty] = target(); if (Math.hypot(tx - ex, ty - ey) > ts * 3) pen.line(ex, ey, tx, ty, { color: INK, w: thin, dash: [ts * 0.5, ts * 0.4] });
      } else if (lay.kind === 'tag') {
        const cx = B.x + B.w / 2, cy = B.y + B.h / 2, rx = B.w / 2, ry = B.h / 2;
        const shape = fx.symbol === 'door' ? [0, 1, 2, 3, 4, 5].map(k => [cx + rx * Math.cos(Math.PI / 3 * k), cy + ry / 0.866 * Math.sin(Math.PI / 3 * k)]) : fx.symbol === 'window' || fx.symbol === 'wall' ? [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]] : fx.symbol === 'keynote' ? [[cx - rx * 0.8, cy - ry * 0.8], [cx + rx * 0.8, cy - ry * 0.8], [cx + rx * 0.8, cy + ry * 0.8], [cx - rx * 0.8, cy + ry * 0.8]] : null;
        if (fx.symbol === 'room') { pen.rect(B.x, B.y, B.w, B.h, { fill: WHITE, opacity: 0.95, stroke: INK, w: med }); }
        else if (shape) pen.poly(shape, { fill: WHITE, stroke: INK, w: med });
        else pen.circle(cx, cy, Math.min(rx, ry), { fill: WHITE, stroke: INK, w: med });
        pen.text(lay.label, cx, cy + ts * 0.36, { size: ts, bold: true, color: inkFor(lay.label), anchor: 'middle' });
        const [tx, ty] = [tcx, tcy]; const a = Math.atan2(ty - cy, tx - cx), sx = cx + Math.cos(a) * rx, sy = cy + Math.sin(a) * ry;
        if (Math.hypot(tx - sx, ty - sy) > ts) { pen.line(sx, sy, tx, ty, { color: INK, w: thin }); pen.circle(tx, ty, ts * 0.22, { fill: INK }); }
      }
    }
    // Green revision cloud + delta around the proposed drawing. When the fix sits on the redline area itself
    // (a dimension across the clouded span) the redline cloud already marks it, so only the delta is added.
    const pad = ts * 0.9, ix = Math.max(0, Math.min(E.x + E.w, T.x + T.w) - Math.max(E.x, T.x)) * Math.max(0, Math.min(E.y + E.h, T.y + T.h) - Math.max(E.y, T.y));
    const shared = ix > 0.6 * Math.min(E.w * E.h, T.w * T.h);
    if (!shared) pen.cloud(E.x - pad, E.y - pad, E.w + pad * 2, E.h + pad * 2, { color: GREEN, w: Math.max(1, short / 600) });
    const dx = shared ? T.x + T.w : E.x + E.w + pad, dy = shared ? T.y + T.h : E.y - pad;
    delta(pen, Math.min(dx, VW - ts * 2), Math.max(ts * 1.5, Math.min(dy, VH - ts * 2)), pl.n, ts);
    const capY = (shared ? T.y + T.h : E.y + E.h + pad) + ts * 1.6, cap = 'PROPOSED BY DRAWUP CHECK - VERIFY BEFORE ISSUE', cw = pen.measure(cap, ts * 0.7, true);
    pen.text(cap, Math.max(4, Math.min((shared ? T.x : E.x - pad), VW - cw - ts * 3)), Math.min(capY, VH - 4), { size: ts * 0.7, bold: true, color: GREEN });
  }

  /* ====================================================================== PDF markup (original pages kept) */
  /**
   * Writes redlines (and, with fixes, the redrawn fixes) onto the uploaded PDF. The original pages are not
   * re-drawn or re-ordered: pdf-lib only appends a new content stream per page, wrapped in optional-content
   * groups ("DrawUp Check - Redlines" / "DrawUp Check - Proposed fixes") that can be switched off in any PDF
   * viewer. A findings index is added AFTER the sheets.
   */
  async function buildMarkupPdf(bytes, placements, opts) {
    const L = await pdflib(), { PDFDocument, StandardFonts, PDFName, PDFString, PDFOperator, rgb } = L;
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const fonts = { font: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
    const measure = (s, size, bold) => (bold ? fonts.bold : fonts.font).widthOfTextAtSize(win(s), size);
    const ctx = doc.context, withFix = !!(opts && opts.fixes);
    const ocR = ctx.register(ctx.obj({ Type: 'OCG', Name: PDFString.of('DrawUp Check - Redlines') }));
    const ocF = withFix ? ctx.register(ctx.obj({ Type: 'OCG', Name: PDFString.of('DrawUp Check - Proposed fixes') })) : null;
    const groups = [ocR, ocF].filter(Boolean);
    const existing = doc.catalog.lookup(PDFName.of('OCProperties'));
    if (existing && existing.lookup) {
      const ocgs = existing.lookup(PDFName.of('OCGs')); if (ocgs && ocgs.push) groups.forEach(g => ocgs.push(g));
      const D = existing.lookup(PDFName.of('D')); if (D && D.lookup) { ['Order', 'ON'].forEach(k => { const a = D.lookup(PDFName.of(k)); if (a && a.push) groups.forEach(g => a.push(g)); else D.set(PDFName.of(k), ctx.obj(groups)); }); }
    } else doc.catalog.set(PDFName.of('OCProperties'), ctx.obj({ OCGs: groups, D: { Name: PDFString.of('DrawUp Check layers'), Order: groups, ON: groups, OFF: [] } }));
    const pages = doc.getPages(), byPage = {};
    placements.forEach(pl => { if (pages[pl.page - 1]) (byPage[pl.page] = byPage[pl.page] || []).push(pl); });
    Object.keys(byPage).forEach(k => {
      const page = pages[k - 1], list = byPage[k];
      if (page.node.normalize) page.node.normalize();
      const res = page.node.Resources() || (page.node.set(PDFName.of('Resources'), ctx.obj({})), page.node.Resources());
      let props = res.lookup(PDFName.of('Properties')); if (!props) { props = ctx.obj({}); res.set(PDFName.of('Properties'), props); }
      props.set(PDFName.of('DUcR'), ocR); if (ocF) props.set(PDFName.of('DUcF'), ocF);
      const pen = pdfPen(L, page, fonts, measure), VW = pen.VW, VH = pen.VH;
      page.pushOperators(PDFOperator.of('BDC', [PDFName.of('OC'), PDFName.of('DUcR')]));
      list.forEach(pl => drawRedline(pen, pl, VW, VH));
      const ts = textPt(VW, VH), stamp = 'DRAWUP CHECK REDLINES' + (withFix ? ' + PROPOSED FIXES (PRELIMINARY - NOT FOR CONSTRUCTION)' : '') + ' - INDEX AT END OF SET';
      pen.rect(ts, ts * 0.8, measure(stamp, ts, true) + ts * 1.2, ts * 1.8, { fill: [0.85, 0.11, 0.11], opacity: 0.92 });
      pen.text(stamp, ts * 1.6, ts * 2.05, { size: ts, bold: true, color: WHITE });
      page.pushOperators(PDFOperator.of('EMC'));
      if (ocF) { page.pushOperators(PDFOperator.of('BDC', [PDFName.of('OC'), PDFName.of('DUcF')])); list.forEach(pl => drawFix(pen, pl, VW, VH)); page.pushOperators(PDFOperator.of('EMC')); }
    });
    // Findings index after the sheets.
    let pg = doc.addPage([792, 612]), y = 570; const M = 40, Wd = 792 - 2 * M;
    const line = (t, size, bold, col) => { wrapPdf(t, size, bold).forEach(l => { if (y < 46) { pg = doc.addPage([792, 612]); y = 570; } pg.drawText(l, { x: M, y, size, font: bold ? fonts.bold : fonts.font, color: col ? rgb(...col) : rgb(0.07, 0.09, 0.13) }); y -= size * 1.32; }); };
    const wrapPdf = (t, size, bold) => wrap(measure, win(t), size, Wd, bold);
    line('DrawUp Check - ' + (withFix ? 'Redlines and proposed fixes' : 'Redlines') + ' - index', 16, true);
    line(win((opts && opts.title) || '') + (opts && opts.file ? '  |  ' + win(opts.file) : ''), 10);
    y -= 4;
    line('Each finding is clouded on its sheet with a numbered bubble (red = critical, orange = major, blue = minor, grey = info).' + (withFix ? ' The green cloud with a delta beside it shows how that part of the sheet could read once corrected: it is drawn over your original sheet, not a new design.' : '') + ' The original pages are unchanged underneath; switch the "DrawUp Check" layers off in your PDF viewer to see them as uploaded.', 9.5);
    y -= 6;
    placements.forEach(pl => { const f = pl.f; y -= 3; line(`${pl.n}. [${String(f.severity).toUpperCase()}] Sheet ${pl.sheet || '?'} - PDF page ${pl.page}${pl.also.length ? ' (also ' + pl.also.join(', ') + ')' : ''}${f.location ? ' - ' + f.location : ''}`, 9.5, true, SEV_RGB[f.severity]); line(f.issue, 9); if (f.recommendation) line('Fix: ' + f.recommendation, 9); if (f.reference) line('Reference: ' + f.reference, 8.5); if (pl.how === 'set') line('Placed on page 1: the review did not name a sheet for this item.', 8, false, [0.4, 0.4, 0.4]); });
    y -= 6; line('DrawUp Check is guidance for the design team. The licensed professional of record and the authority having jurisdiction make final determinations.', 8, false, [0.35, 0.35, 0.35]);
    return doc.save();
  }
  X.buildMarkupPdf = buildMarkupPdf; X.locateAll = locateAll; X.readLayer = readLayer;

  /* ====================================================================== on-screen viewer */
  async function mountViewer(host, layer, placements, opts) {
    const measure = await measurer(), L = await pdfjs();
    const pagesWith = [...new Set(placements.map(p => p.page))].sort((a, b) => a - b);
    let zoom = 1, showAll = pagesWith.length === 0, layers = { rl: true, fx: !(opts && opts.noFix) };
    host.innerHTML = `<div class="du-ck22-vbar" role="toolbar" aria-label="Viewer">
      <label class="du-ck22-tg"><input type="checkbox" data-layer="rl" checked> Redlines</label>
      ${opts && opts.noFix ? '' : '<label class="du-ck22-tg"><input type="checkbox" data-layer="fx" checked> Proposed fixes</label>'}
      <button type="button" class="du-btn ghost du-ck22-orig" aria-pressed="false">Original only</button>
      <span class="du-ck22-sp"></span>
      <button type="button" class="du-btn ghost" data-zoom="-1" aria-label="Zoom out">−</button><b class="du-ck22-zv">100%</b><button type="button" class="du-btn ghost" data-zoom="1" aria-label="Zoom in">+</button>
      <button type="button" class="du-btn ghost du-ck22-all">${showAll ? 'Pages with findings' : 'All ' + layer.pages.length + ' pages'}</button></div>
      <div class="du-ck22-frame"><div class="du-ck22-pages"></div></div>`;
    const frame = $q(host, '.du-ck22-frame'), wrapEl = $q(host, '.du-ck22-pages');
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) paint(e.target); }), { root: null, rootMargin: '400px' });
    function build() {
      io.disconnect(); wrapEl.style.width = (zoom * 100) + '%';
      const list = showAll || !pagesWith.length ? layer.pages.map(p => p.n) : pagesWith;
      wrapEl.innerHTML = list.map(n => { const pg = layer.pages[n - 1], here = placements.filter(p => p.page === n); const sheet = here.find(p => p.sheet)?.sheet || '';
        return `<figure class="du-ck22-pg" data-page="${n}"><div class="du-ck22-sheet" style="aspect-ratio:${pg.W}/${pg.H}"><canvas></canvas><svg viewBox="0 0 ${pg.W} ${pg.H}" preserveAspectRatio="none" aria-hidden="true"><g class="du-ck22-fx"></g><g class="du-ck22-rl"></g></svg></div><figcaption>PDF page ${n}${sheet ? ' · sheet ' + esc(sheet) : ''} · ${here.length ? here.length + ' item' + (here.length === 1 ? '' : 's') : 'no findings'}</figcaption></figure>`; }).join('');
      wrapEl.querySelectorAll('.du-ck22-pg').forEach(fig => {
        const n = +fig.dataset.page, pg = layer.pages[n - 1], here = placements.filter(p => p.page === n);
        const r = svgPen(measure), f = svgPen(measure);
        here.forEach(pl => drawRedline(r, pl, pg.W, pg.H)); here.forEach(pl => { if (!(opts && opts.noFix)) drawFix(f, pl, pg.W, pg.H); });
        $q(fig, '.du-ck22-rl').innerHTML = r.out(); $q(fig, '.du-ck22-fx').innerHTML = f.out();
        here.forEach(pl => { const b = pl.box, g = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); g.setAttribute('x', b.x * pg.W); g.setAttribute('y', b.y * pg.H); g.setAttribute('width', b.w * pg.W); g.setAttribute('height', b.h * pg.H); g.setAttribute('class', 'du-ck22-hit'); g.dataset.n = pl.n; $q(fig, '.du-ck22-rl').appendChild(g); });
        io.observe(fig);
      });
      applyLayers();
    }
    async function paint(fig) {
      const n = +fig.dataset.page, cv = $q(fig, 'canvas'), want = Math.min(4096, Math.round(fig.clientWidth * Math.min(2, window.devicePixelRatio || 1)));
      if (!want || +cv.dataset.w === want) return; cv.dataset.w = want;
      const pg = await layer.doc.getPage(n), vp0 = pg.getViewport({ scale: 1 }); let sc = want / vp0.width; if (vp0.width * sc * vp0.height * sc > 14e6) sc = Math.sqrt(14e6 / (vp0.width * vp0.height));
      const vp = pg.getViewport({ scale: sc }); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      try { await pg.render({ canvasContext: ctx, viewport: vp }).promise; fig.classList.add('painted'); } catch (_e) { /* a newer paint replaced this one */ }
    }
    function applyLayers() { const orig = $q(host, '.du-ck22-orig').getAttribute('aria-pressed') === 'true'; wrapEl.querySelectorAll('.du-ck22-rl').forEach(g => { g.style.display = layers.rl && !orig ? '' : 'none'; }); wrapEl.querySelectorAll('.du-ck22-fx').forEach(g => { g.style.display = layers.fx && !orig ? '' : 'none'; }); }
    host.querySelectorAll('[data-layer]').forEach(cb => cb.onchange = () => { layers[cb.dataset.layer] = cb.checked; applyLayers(); });
    $q(host, '.du-ck22-orig').onclick = e => { const b = e.currentTarget; b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); b.classList.toggle('on'); applyLayers(); };
    host.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => { zoom = Math.max(1, Math.min(4, zoom + (+b.dataset.zoom))); $q(host, '.du-ck22-zv').textContent = zoom * 100 + '%'; build(); });
    $q(host, '.du-ck22-all').onclick = e => { showAll = !showAll; e.currentTarget.textContent = showAll ? 'Pages with findings' : 'All ' + layer.pages.length + ' pages'; build(); };
    build();
    return {
      focus(n) {
        const pl = placements.find(p => p.n === n); if (!pl) return;
        if (!wrapEl.querySelector(`[data-page="${pl.page}"]`)) { showAll = true; build(); }
        const fig = wrapEl.querySelector(`[data-page="${pl.page}"]`); if (!fig) return;
        fig.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const sheet = $q(fig, '.du-ck22-sheet'); frame.scrollLeft = Math.max(0, (pl.box.x + pl.box.w / 2) * sheet.clientWidth - frame.clientWidth / 2);
        const hit = fig.querySelector(`.du-ck22-hit[data-n="${n}"]`); if (hit) { hit.classList.remove('flash'); void hit.getBoundingClientRect(); hit.classList.add('flash'); }
      },
    };
  }

  /* ====================================================================== documents (Word + PDF) */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  /** Minimal zip (stored entries) - enough for a .docx. */
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    for (const [name, text] of files) {
      const nb = enc.encode(name), data = typeof text === 'string' ? enc.encode(text) : text, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true);
      parts.push(new Uint8Array(h.buffer), nb, data);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nb); off += 30 + nb.length + data.length;
    }
    const csize = central.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: DOCX_TYPE });
  }
  const xe = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  /** Runs with NEEDS CONFIRMATION highlighted, so open items stand out in the Word file. */
  function runs(text, props) { return String(text ?? '').split(/(NEEDS CONFIRMATION)/).filter(Boolean).map(seg => `<w:r><w:rPr>${props || ''}${seg === 'NEEDS CONFIRMATION' ? '<w:b/><w:highlight w:val="yellow"/>' : ''}</w:rPr><w:t xml:space="preserve">${xe(seg)}</w:t></w:r>`).join(''); }
  function docxFrom(blocks, meta) {
    const p = (style, text, extra) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra || ''}</w:pPr>${runs(text)}</w:p>`;
    let body = '';
    for (const b of blocks) {
      if (b.t === 'cover') { body += p('CoverKicker', b.kicker) + p('CoverTitle', b.title) + (b.subtitle ? p('Subtitle', b.subtitle) : '') + b.rows.map(([k, v]) => `<w:p><w:pPr><w:pStyle w:val="CoverRow"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="0B3A53"/></w:rPr><w:t xml:space="preserve">${xe(k)}:  </w:t></w:r>${runs(v)}</w:p>`).join(''); }
      else if (b.t === 'pagebreak') body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      else if (b.t === 'title') body += p('Title', b.s);
      else if (b.t === 'subtitle') body += p('Subtitle', b.s);
      else if (b.t === 'meta') body += p('Meta', b.s);
      else if (b.t === 'h1') body += p('Heading1', b.s);
      else if (b.t === 'h2') body += p('Heading2', b.s);
      else if (b.t === 'p') body += p('', b.s);
      else if (b.t === 'small') body += p('Small', b.s);
      else if (b.t === 'bullets') b.items.forEach(it => { body += p('ListBullet', it, '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'); });
      else if (b.t === 'table') {
        const widths = b.widths || b.head.map(() => Math.floor(9360 / b.head.length));
        const cell = (t, w, head) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="0B3A53"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>${runs(t, head ? '<w:b/><w:color w:val="FFFFFF"/>' : '')}</w:p></w:tc>`;
        body += `<w:tbl><w:tblPr><w:tblStyle w:val="DUTable"/><w:tblW w:w="9360" w:type="dxa"/><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
          + `<w:tr><w:trPr><w:tblHeader/></w:trPr>${b.head.map((h, i) => cell(h, widths[i], true)).join('')}</w:tr>` + b.rows.map(r => `<w:tr>${r.map((c, i) => cell(c, widths[i], false)).join('')}</w:tr>`).join('') + '</w:tbl>' + p('', '');
      }
    }
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1300" w:right="1440" w:bottom="1300" w:left="1440" w:header="708" w:footer="600" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const font = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>';
    const st = (id, name, rpr, ppr, based) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${based ? `<w:basedOn w:val="${based}"/>` : ''}<w:qFormat/><w:pPr>${ppr || ''}</w:pPr><w:rPr>${rpr || ''}</w:rPr></w:style>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="21"/><w:color w:val="1F2A33"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="288" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
      + st('Normal', 'Normal') + st('Title', 'Title', '<w:b/><w:sz w:val="48"/><w:color w:val="0B3A53"/>', '<w:spacing w:before="600" w:after="80"/>', 'Normal')
      + st('CoverKicker', 'Cover kicker', '<w:b/><w:caps/><w:spacing w:val="40"/><w:sz w:val="22"/><w:color w:val="C2410C"/>', '<w:spacing w:before="2400" w:after="120"/>', 'Normal')
      + st('CoverTitle', 'Cover title', '<w:b/><w:sz w:val="64"/><w:color w:val="0B3A53"/>', '<w:spacing w:after="200"/><w:pBdr><w:bottom w:val="single" w:sz="18" w:space="12" w:color="0B3A53"/></w:pBdr>', 'Normal')
      + st('CoverRow', 'Cover detail', '<w:sz w:val="22"/>', '<w:spacing w:after="100"/>', 'Normal')
      + st('Subtitle', 'Subtitle', '<w:sz w:val="28"/><w:color w:val="C2410C"/>', '<w:spacing w:after="80"/>', 'Normal')
      + st('Meta', 'Document info', '<w:sz w:val="18"/><w:color w:val="5B6B78"/>', '<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="8" w:color="0B3A53"/></w:pBdr><w:spacing w:after="360"/>', 'Normal')
      + st('Heading1', 'heading 1', '<w:b/><w:sz w:val="30"/><w:color w:val="0B3A53"/>', '<w:keepNext/><w:spacing w:before="360" w:after="120"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="7FB8CC"/></w:pBdr><w:outlineLvl w:val="0"/>', 'Normal')
      + st('Heading2', 'heading 2', '<w:b/><w:sz w:val="24"/><w:color w:val="1D5B73"/>', '<w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/>', 'Normal')
      + st('ListBullet', 'List Bullet', '', '<w:ind w:left="540" w:hanging="300"/><w:spacing w:after="80"/>', 'Normal')
      + st('Small', 'Small note', '<w:sz w:val="17"/><w:color w:val="5B6B78"/>', '', 'Normal')
      + st('Footer', 'footer', '<w:sz w:val="16"/><w:color w:val="5B6B78"/>', '<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="7FB8CC"/></w:pBdr>', 'Normal')
      + `<w:style w:type="table" w:styleId="DUTable"><w:name w:val="DrawUp table"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="9FB3C0"/><w:left w:val="single" w:sz="4" w:color="9FB3C0"/><w:bottom w:val="single" w:sz="4" w:color="9FB3C0"/><w:right w:val="single" w:sz="4" w:color="9FB3C0"/><w:insideH w:val="single" w:sz="4" w:color="9FB3C0"/><w:insideV w:val="single" w:sz="4" w:color="9FB3C0"/></w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
    const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="540" w:hanging="300"/></w:pPr><w:rPr><w:color w:val="C2410C"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
    const fld = code => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
    const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs></w:pPr>${runs(meta.footer || '')}<w:r><w:tab/><w:t xml:space="preserve">Page </w:t></w:r>${fld('PAGE')}<w:r><w:t xml:space="preserve"> of </w:t></w:r>${fld('NUMPAGES')}</w:p></w:ftr>`;
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    return zip([
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
      ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(meta.title)}</dc:title><dc:creator>DrawUp Check</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`],
      ['word/document.xml', doc],
      ['word/styles.xml', styles],
      ['word/numbering.xml', numbering],
      ['word/footer1.xml', footer],
      ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rIdNum" Type="${R}/numbering" Target="numbering.xml"/><Relationship Id="rIdFooter" Type="${R}/footer" Target="footer1.xml"/></Relationships>`],
    ]);
  }
  /** The same blocks as a paginated letter-size PDF (header rule, footer with page x of y). */
  async function pdfFrom(blocks, meta) {
    const L = await pdflib(), { PDFDocument, StandardFonts, rgb } = L;
    const doc = await PDFDocument.create(); doc.setTitle(win(meta.title || 'DrawUp document')); doc.setCreator('DrawUp Check');
    const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const PW = 612, PH = 792, M = 64, TW = PW - 2 * M, navy = rgb(0.043, 0.227, 0.325), orange = rgb(0.76, 0.25, 0.05), body = rgb(0.12, 0.16, 0.2), grey = rgb(0.36, 0.42, 0.47), yellow = rgb(1, 0.93, 0.45);
    const m = (s, size, b) => (b ? bold : font).widthOfTextAtSize(s, size);
    let page, y; const pages = [];
    const newPage = () => { page = doc.addPage([PW, PH]); pages.push(page); y = PH - M; };
    newPage();
    const need = h => { if (y - h < M + 10) newPage(); };
    const textLine = (s, x, size, b, col) => {
      let cx = x; String(s).split(/(NEEDS CONFIRMATION)/).filter(Boolean).forEach(seg => { const w = m(seg, size, b || seg === 'NEEDS CONFIRMATION'); if (seg === 'NEEDS CONFIRMATION') page.drawRectangle({ x: cx - 1, y: y - size * 0.25, width: w + 2, height: size * 1.15, color: yellow }); page.drawText(seg, { x: cx, y, size, font: b || seg === 'NEEDS CONFIRMATION' ? bold : font, color: col }); cx += w; });
    };
    const para = (s, size, b, col, indent, gap) => { wrap(m, win(s), size, TW - (indent || 0), b).forEach(l => { need(size * 1.4); textLine(l, M + (indent || 0), size, b, col); y -= size * 1.42; }); y -= gap ?? size * 0.6; };
    for (const b of blocks) {
      if (b.t === 'cover') { page.drawRectangle({ x: 0, y: PH - 18, width: PW, height: 18, color: navy }); page.drawRectangle({ x: 0, y: PH - 22, width: PW, height: 4, color: orange }); y = PH - 230; para(String(b.kicker).toUpperCase(), 11, true, orange, 0, 26); para(b.title, 30, true, navy, 0, 6); if (b.subtitle) para(b.subtitle, 14, false, orange, 0, 6); page.drawRectangle({ x: M, y: y + 4, width: TW, height: 2, color: navy }); y -= 26; b.rows.forEach(([k, v]) => { need(16); page.drawText(win(k).toUpperCase(), { x: M, y, size: 8.5, font: bold, color: grey }); y -= 13; para(v, 12, false, body, 0, 8); }); }
      else if (b.t === 'pagebreak') newPage();
      else if (b.t === 'title') { y -= 30; para(b.s, 24, true, navy, 0, 4); }
      else if (b.t === 'subtitle') para(b.s, 13, false, orange, 0, 4);
      else if (b.t === 'meta') { para(b.s, 9, false, grey, 0, 6); page.drawRectangle({ x: M, y: y, width: TW, height: 1.6, color: navy }); y -= 22; }
      else if (b.t === 'h1') { need(40); y -= 8; para(b.s, 14.5, true, navy, 0, 2); page.drawRectangle({ x: M, y: y + 6, width: TW, height: 0.7, color: rgb(0.5, 0.72, 0.8) }); y -= 6; }
      else if (b.t === 'h2') { need(30); y -= 4; para(b.s, 12, true, rgb(0.11, 0.36, 0.45), 0, 2); }
      else if (b.t === 'p') para(b.s, 10.5, false, body);
      else if (b.t === 'small') para(b.s, 8.5, false, grey);
      else if (b.t === 'bullets') { b.items.forEach(it => { need(14); page.drawCircle({ x: M + 8, y: y + 3.4, size: 1.8, color: orange }); para(it, 10.5, false, body, 18, 3); }); y -= 4; }
      else if (b.t === 'table') {
        const tw = b.widths ? b.widths.map(w => w / 9360 * TW) : b.head.map(() => TW / b.head.length);
        const row = (cells, head) => {
          const lines = cells.map((c, i) => wrap(m, win(c), 9.5, tw[i] - 10, head)); const h = Math.max(...lines.map(l => l.length)) * 9.5 * 1.35 + 8;
          need(h); let x = M; page.drawRectangle({ x: M, y: y - h + 9.5, width: TW, height: h, color: head ? navy : rgb(1, 1, 1), borderColor: rgb(0.62, 0.7, 0.75), borderWidth: 0.6 });
          lines.forEach((ls, i) => { if (i) page.drawLine({ start: { x, y: y + 9.5 }, end: { x, y: y - h + 9.5 }, thickness: 0.6, color: rgb(0.62, 0.7, 0.75) }); const yy = y; ls.forEach((l, k) => { y = yy - 4 - k * 9.5 * 1.35; textLine(l, x + 5, 9.5, head, head ? rgb(1, 1, 1) : body); }); y = yy; x += tw[i]; });
          y -= h;
        };
        row(b.head, true); b.rows.forEach(r => row(r, false)); y -= 12;
      }
    }
    pages.forEach((pg, i) => { pg.drawLine({ start: { x: M, y: 44 }, end: { x: PW - M, y: 44 }, thickness: 0.6, color: rgb(0.5, 0.72, 0.8) }); pg.drawText(win(meta.footer || '').slice(0, 100), { x: M, y: 32, size: 8, font, color: grey }); const t = `Page ${i + 1} of ${pages.length}`; pg.drawText(t, { x: PW - M - font.widthOfTextAtSize(t, 8), y: 32, size: 8, font, color: grey }); });
    return doc.save();
  }
  X.docxFrom = docxFrom; X.pdfFrom = pdfFrom;
  function rewriteBlocks(rw, r) {
    const cv = rw.cover && rw.cover.enabled ? rw.cover : null;
    const b = cv ? [{ t: 'cover', kicker: rw.document_type || 'Design Narrative', title: rw.title, subtitle: rw.subtitle || '', rows: [['Prepared for', cv.prepared_for], ['Prepared by', cv.prepared_by], ['Project number', cv.project_number], ['Phase', cv.phase], ['Date', cv.date], ['Note', cv.notes], ['Location', r.jurisdiction || '']].filter(x => String(x[1] || '').trim()) }, { t: 'pagebreak' }] : [];
    b.push({ t: 'title', s: rw.title }, { t: 'subtitle', s: rw.subtitle || rw.document_type || 'Design Narrative' }, { t: 'meta', s: [r.jurisdiction, 'Revised draft ' + new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), 'Prepared with DrawUp Check from the uploaded document'].filter(Boolean).join('  |  ') });
    if (rw.project_facts.length) { b.push({ t: 'h1', s: 'Project Information' }, { t: 'table', head: ['Item', 'As stated'], widths: [3000, 6360], rows: rw.project_facts.map(f => [f.label, f.value]) }); }
    rw.sections.forEach(s => { b.push({ t: s.level === 2 ? 'h2' : 'h1', s: s.heading }); s.paragraphs.forEach(p => b.push({ t: 'p', s: p })); if (s.bullets.length) b.push({ t: 'bullets', items: s.bullets }); });
    if (rw.needs_confirmation.length) b.push({ t: 'h1', s: 'Items Needing Confirmation' }, { t: 'p', s: 'The following were not established by the original document and must be confirmed by the responsible party before this document is issued.' }, { t: 'bullets', items: rw.needs_confirmation.map(x => x + ' - NEEDS CONFIRMATION') });
    if (rw.change_log.length) b.push({ t: 'h1', s: 'Revision Log' }, { t: 'table', head: ['Ref.', 'Change'], widths: [1200, 8160], rows: rw.change_log.map(c => [c.id, c.change]) });
    b.push({ t: 'small', s: 'Rewritten by DrawUp Check using only changes approved by the author. Project facts are kept as stated in the original document; items marked NEEDS CONFIRMATION were not established. The design professional of record is responsible for the final content.' });
    return b;
  }

  /* ====================================================================== new review form */
  const CHECK_FOCUS = [['code', 'Building code'], ['accessibility', 'Accessibility'], ['life_safety', 'Life safety / egress'], ['coordination', 'Coordination'], ['dimensions', 'Dimensions'], ['documentation', 'Documentation'], ['structural', 'Structural'], ['mep', 'MEP'], ['site', 'Site']];
  function projectSelect(projects, selected) { return `<select id="ck-proj"><option value="">No project</option>${(projects || []).map(p => `<option value="${p.id}"${p.id === selected ? ' selected' : ''}>${esc(p.project_name)}</option>`).join('')}</select>`; }
  async function renderList(w, c, params, projects) {
    const { data: reviews, error } = await c.client.from('check_reviews').select('id,title,status,created_at,findings,file_name,mode,rewrite_status,notice').eq('owner_id', c.user.id).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    let mode = ['narrative', 'narrative_plans'].includes(params.get('mode')) ? params.get('mode') : 'plans';
    w.innerHTML = `<div class="du-work-head"><div><span class="du-kicker">DRAWUP CHECK</span><h1>Check drawings and narratives</h1><p>Redlines on your actual sheets with a drawn example of each fix, a design narrative reviewer that recommends before it rewrites, and a narrative-to-plans comparison. Your uploaded files are never replaced.</p></div></div>
    <div class="du-two-col du-ck22-start">
      <article class="du-glass"><h2>New check</h2>
        <div class="du-ck22-modes" role="tablist">${Object.entries(MODE_TXT).map(([k, l]) => `<button type="button" role="tab" class="du-chip${k === mode ? ' on' : ''}" data-mode="${k}" aria-selected="${k === mode}">${l}</button>`).join('')}</div>
        <p class="du-muted du-ck22-modehelp"></p>
        <div class="du-field"><label for="ck-file" id="ck-file-l">PDF drawing set (up to 32 MB)</label><input type="file" id="ck-file"></div>
        <div class="du-ck22-hint" hidden></div>
        <div class="du-field du-ck22-plansf" hidden><label for="ck-plans">Plan set PDF to compare with (up to 32 MB)</label><input type="file" id="ck-plans" accept="application/pdf,.pdf"></div>
        <div class="du-field"><label for="ck-title">Title</label><input id="ck-title" placeholder="e.g. Athletic storage building · DD set"></div>
        <div class="du-two"><div class="du-field"><label for="ck-jur">Project location (city, state, country)</label><input id="ck-jur" placeholder="e.g. Durham, NC, USA"></div><div class="du-field"><label for="ck-type">Building / occupancy type</label><input id="ck-type" placeholder="e.g. S-1 storage, B business"></div></div>
        <div class="du-field du-ck22-focus"><label>Check for</label><div class="du-chips du-check-focus">${CHECK_FOCUS.map(([k, l], i) => `<button type="button" class="du-chip${i < 5 ? ' on' : ''}" data-focus="${k}">${l}</button>`).join('')}</div></div>
        <div class="du-field"><label for="ck-proj">Project</label>${projectSelect(projects, params.get('project') || '')}</div>
        <p class="du-muted du-ck22-cost"></p>
        <button class="du-btn primary" id="ck-go">Upload and review</button> <span id="ck-status" class="du-save-status" aria-live="polite"></span>
      </article>
      <article class="du-glass"><h2>Your checks</h2>${reviews.length ? reviews.map(r => { const counts = SEV.map(s => [(r.findings || []).filter(f => f.severity === s).length, s]).filter(x => x[0]); return `<div class="du-row du-check-row" data-review="${r.id}" tabindex="0" role="button"><div><b>${esc(r.title)}</b><small>${esc(MODE_TXT[r.mode] || MODE_TXT.plans)} · ${esc(r.file_name || '')} · ${fmtWhen(r.created_at)}</small></div><div><span class="du-status-pill" data-state="${r.status}">${r.status.toUpperCase()}</span>${r.status === 'complete' && (r.mode || 'plans') === 'plans' ? `<small>${counts.map(([n, s]) => n + ' ' + s).join(' · ') || 'No findings'}${r.notice ? ' · partial' : ''}</small>` : r.rewrite_status === 'complete' ? '<small>Rewritten</small>' : ''}</div></div>`; }).join('') : '<p class="du-muted">No checks yet.</p>'}</article>
    </div>`;
    const setMode = m => {
      mode = m; w.querySelectorAll('[data-mode]').forEach(b => { const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      $q(w, '#ck-file').accept = m === 'plans' ? 'application/pdf,.pdf' : 'application/pdf,.pdf,.docx,' + DOCX_TYPE;
      $q(w, '#ck-file-l').textContent = m === 'plans' ? 'PDF drawing set (up to 32 MB)' : 'Design narrative: PDF or Word .docx (up to 32 MB)';
      $q(w, '.du-ck22-plansf').hidden = m !== 'narrative_plans'; $q(w, '.du-ck22-focus').hidden = m !== 'plans';
      $q(w, '.du-ck22-modehelp').textContent = m === 'plans' ? 'Findings are clouded on the sheet where they are, with a drawn example of how that part of the sheet should read.' : m === 'narrative' ? 'Review first: document type, project facts found, and NEEDS CONFIRMATION for anything missing. You approve the changes, then DrawUp writes the revised document (Word and PDF).' : 'Upload the narrative and the plan set. DrawUp lists what the narrative should cover based on the plans and flags statements that do not match them, by sheet and page.';
      $q(w, '.du-ck22-cost').textContent = m === 'plans' ? 'Cost: 30 credits for up to 10 pages, 150 credits for larger sets. Failed reviews are refunded. Findings are guidance for the design team, not a permit approval.' : 'Cost: 30 credits for the review (150 when a PDF has more than 10 pages) and 30 credits for an approved rewrite. Failed steps are refunded.';
    };
    w.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode)); setMode(mode);
    w.querySelectorAll('[data-focus]').forEach(b => b.onclick = () => b.classList.toggle('on'));
    w.querySelectorAll('[data-review]').forEach(el => { const go = () => { history.replaceState(null, '', '#portal/check?id=' + el.dataset.review); c.openPortalTab('check'); }; el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
    // A narrative uploaded as a "drawing set" is what sat at 95%: suggest the narrative reviewer instead.
    let layerCache = null;
    $q(w, '#ck-file').onchange = async e => {
      const f = e.target.files[0], hint = $q(w, '.du-ck22-hint'); hint.hidden = true; layerCache = null; if (!f) return;
      if (/\.pdf$/i.test(f.name) || /pdf$/.test(f.type)) {
        try { const bytes = new Uint8Array(await f.arrayBuffer()); const lay = await readLayer(bytes); layerCache = { f, lay };
          const words = lay.pages.reduce((a, p) => a + p.text.split(/\s+/).length, 0) / Math.max(1, lay.pages.length), sheets = lay.pages.filter(p => /\b[A-Z]{1,2}[-.]?\d{3}\b/.test(p.text)).length;
          if (mode === 'plans' && words > 220 && sheets < lay.pages.length / 2) { hint.hidden = false; hint.innerHTML = `This looks like a written document (${lay.pages.length} page${lay.pages.length === 1 ? '' : 's'} of text), not a drawing set. <button type="button" class="du-btn ghost">Review it as a design narrative</button>`; hint.querySelector('button').onclick = () => { setMode('narrative'); hint.hidden = true; }; }
        } catch (_e) { /* the server still reviews the file */ }
      }
    };
    $q(w, '#ck-go').onclick = async () => {
      const st = $q(w, '#ck-status'), btn = $q(w, '#ck-go'), file = $q(w, '#ck-file').files[0], plans = $q(w, '#ck-plans').files[0];
      if (!file) { c.toast(mode === 'plans' ? 'Choose a PDF first.' : 'Choose the narrative (PDF or Word) first.', true); return; }
      const isPdf = /\.pdf$/i.test(file.name) || /pdf$/.test(file.type), isDocx = /\.docx$/i.test(file.name);
      if (mode === 'plans' && !isPdf) { c.toast('The drawing set check reviews PDF drawing sets. For a Word narrative choose Design narrative review.', true); return; }
      if (mode !== 'plans' && !isPdf && !isDocx) { c.toast('Upload the narrative as PDF or Word (.docx).', true); return; }
      if (mode === 'narrative_plans' && (!plans || !(/\.pdf$/i.test(plans.name) || /pdf$/.test(plans.type)))) { c.toast('Add the plan set as a PDF.', true); return; }
      if (file.size > 32 * 1024 * 1024 || (plans && plans.size > 32 * 1024 * 1024)) { c.toast('Files must be 32 MB or smaller. Split the set and check it in parts.', true); return; }
      btn.disabled = true;
      try {
        let page_text = null, plans_text = null;
        if (isPdf) { st.textContent = ' Reading the PDF text…'; const lay = layerCache && layerCache.f === file ? layerCache.lay : await readLayer(new Uint8Array(await file.arrayBuffer())).catch(() => null); if (lay) page_text = layerForServer(lay.pages); }
        if (plans) { st.textContent = ' Reading the plan set…'; const lay = await readLayer(new Uint8Array(await plans.arrayBuffer())).catch(() => null); if (lay) plans_text = layerForServer(lay.pages); }
        st.textContent = ' Uploading…';
        const id = uuid(), path = `${c.user.id}/check/${id}.${isPdf ? 'pdf' : 'docx'}`;
        const up = await c.client.storage.from(BUCKET).upload(path, file, { contentType: isPdf ? 'application/pdf' : DOCX_TYPE, upsert: false }); if (up.error) throw up.error;
        let plans_path = null;
        if (plans) { plans_path = `${c.user.id}/check/${id}-plans.pdf`; const u2 = await c.client.storage.from(BUCKET).upload(plans_path, plans, { contentType: 'application/pdf', upsert: false }); if (u2.error) throw u2.error; }
        const focus = [...w.querySelectorAll('[data-focus].on')].map(b => b.dataset.focus);
        const row = { id, owner_id: c.user.id, title: $q(w, '#ck-title').value.trim() || file.name.replace(/\.(pdf|docx)$/i, ''), file_path: path, file_name: file.name, file_size: file.size, jurisdiction: $q(w, '#ck-jur').value.trim() || null, building_type: $q(w, '#ck-type').value.trim() || null, focus: focus.length ? focus : CHECK_FOCUS.slice(0, 5).map(x => x[0]), project_thread_id: $q(w, '#ck-proj').value || null };
        if (mode !== 'plans') Object.assign(row, { mode, plans_path, plans_name: plans ? plans.name : null });
        const ins = await c.client.from('check_reviews').insert(row).select('id').single(); if (ins.error) throw ins.error;
        st.textContent = ' Starting review…';
        try { await api(c, '/api/check', { method: 'POST', body: JSON.stringify({ review_id: id, page_text, plans_text }) }); } catch (e) { c.toast(e.message, true); }
        history.replaceState(null, '', '#portal/check?id=' + id); c.openPortalTab('check');
      } catch (e) { btn.disabled = false; st.textContent = ' Not started — ' + (e.message || e); }
    };
  }

  /* ====================================================================== review page */
  async function renderReview(w, c, id, projects) {
    const load = async () => { const { data, error } = await c.client.from('check_reviews').select('*').eq('id', id).eq('owner_id', c.user.id).maybeSingle(); if (error) throw error; return data; };
    let r = await load();
    if (!r) { history.replaceState(null, '', '#portal/check'); w.innerHTML = '<div class="du-empty"><h1>Review not found.</h1><button class="du-btn primary" data-portal-tab="check">All reviews</button></div>'; return; }
    const seq = w.dataset.seq, alive = () => w.dataset.seq === seq && document.body.contains(w);
    const mode = r.mode || 'plans', proj = (projects || []).find(p => p.id === r.project_thread_id);
    const head = () => `<div class="du-work-head"><div><span class="du-kicker">DRAWUP CHECK · ${esc((MODE_TXT[mode] || '').toUpperCase())} · ${esc(r.status.toUpperCase())}</span><h1>${esc(r.title)}</h1><p>${esc(r.file_name || '')}${r.plans_name ? ' + ' + esc(r.plans_name) : ''}${r.page_count ? ' · ' + r.page_count + ' pages' : ''}${r.jurisdiction ? ' · ' + esc(r.jurisdiction) : ''}${proj ? ' · ' + esc(proj.project_name) : ''}</p></div><div class="du-head-actions"><button class="du-btn ghost" id="cr-back">All checks</button><button class="du-btn ghost" id="cr-pdf-src">Open ${mode === 'plans' ? 'drawing set' : 'document'}</button></div></div>`;
    const wire = () => {
      $q(w, '#cr-back').onclick = () => { history.replaceState(null, '', '#portal/check'); c.openPortalTab('check'); };
      $q(w, '#cr-pdf-src').onclick = async () => { const { data } = await c.client.storage.from(BUCKET).createSignedUrl(r.file_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener'); else c.toast('The file could not be opened.', true); };
    };
    const draw = async () => {
      if (r.status === 'queued') {
        w.innerHTML = head() + `<article class="du-glass"><h2>Not started</h2><p>${esc(r.error || 'This review has not started yet.')}</p><button class="du-btn primary" id="cr-start">Start review</button> <span id="cr-st" class="du-save-status"></span></article>`; wire();
        $q(w, '#cr-start').onclick = async e => { e.target.disabled = true; $q(w, '#cr-st').textContent = ' Starting…'; try { let page_text = null, plans_text = null; const b = await fileBytes(c, r.file_path); if (isPdfBytes(b)) page_text = layerForServer((await readLayer(b)).pages); if (r.plans_path) plans_text = layerForServer((await readLayer(await fileBytes(c, r.plans_path))).pages); await api(c, '/api/check', { method: 'POST', body: JSON.stringify({ review_id: r.id, page_text, plans_text }) }); r = await load(); draw(); } catch (er) { e.target.disabled = false; $q(w, '#cr-st').textContent = ' ' + er.message; } };
        return;
      }
      if (r.status === 'failed') { w.innerHTML = head() + `<article class="du-glass"><h2>The review did not finish</h2><p>${esc(r.error || 'Unknown error.')}</p><button class="du-btn primary" id="cr-new">Start a new check</button></article>`; wire(); $q(w, '#cr-new').onclick = () => { history.replaceState(null, '', '#portal/check' + (mode !== 'plans' ? '?mode=' + mode : '')); c.openPortalTab('check'); }; return; }
      if (r.status === 'reviewing') { w.innerHTML = head() + '<article class="du-glass du-ck22-run"></article>'; wire(); return runProgress(w, c, r, $q(w, '.du-ck22-run'), alive, async () => { r = await load(); if (alive()) draw(); }); }
      w.innerHTML = head() + '<div class="du-ck22-body"></div>'; wire();
      const body = $q(w, '.du-ck22-body');
      if (mode === 'plans') return renderPlansResult(w, c, r, body, proj);
      return renderNarrativeResult(w, c, r, body, alive, async () => { r = await load(); if (alive()) draw(); });
    };
    X._ctx = { get r() { return r; } };
    draw();
  }

  /** Progress while the AI works: honest meter, items as they arrive, and a background notice instead of a hang. */
  async function runProgress(w, c, r, art, alive, done, phase) {
    const rewrite = phase === 'rewrite', narrative = (r.mode || 'plans') !== 'plans';
    const pages = r.page_count || Math.max(2, Math.round((r.file_size || 3e6) / 6e5));
    const est = rewrite ? 60 + 4 * pages : narrative ? 45 + 6 * pages : 30 + 9 * pages;
    const t0 = rewrite ? Date.now() : new Date(r.started_at || r.created_at).getTime();
    const watchMs = X.WATCHDOG_MS || Math.max(180000, est * 3000);
    art.innerHTML = `<h2>${rewrite ? 'Writing the revised document…' : narrative ? 'Reviewing the document…' : 'Reviewing your sheets…'}</h2><div class="du-ckp"><div class="du-ckp-top"><b class="du-ckp-pct">0%</b><span class="du-ckp-phase">Starting…</span></div><div class="du-ckp-meter"><i></i></div><small class="du-ckp-note"></small></div>
      <div class="du-ck22-bg" hidden role="status"></div>
      <div class="du-check-live" hidden aria-live="polite"><h3>Reading…</h3><ul class="du-check-found"></ul><p class="du-muted">Not final yet. The full ${rewrite ? 'document' : 'report'} replaces this list.</p></div>`;
    let cursor = 0, streamed = true, text = '', bg = false;
    const items = () => {
      const out = []; let m;
      if (rewrite) { const re = /"heading"\s*:\s*"((?:[^"\\]|\\.)*)"/g; while ((m = re.exec(text))) out.push({ sev: 'info', s: JSON.parse('"' + m[1] + '"') }); return out; }
      if (narrative) { const re = /"(comment|plans_show|proposed_text)"\s*:\s*"((?:[^"\\]|\\.)*)"/g; while ((m = re.exec(text))) { let s = m[2]; try { s = JSON.parse('"' + s + '"'); } catch (_e) { } out.push({ sev: m[1] === 'plans_show' ? 'major' : 'info', s: (m[1] === 'plans_show' ? 'Conflict with plans: ' : m[1] === 'proposed_text' ? 'Should cover: ' : '') + s }); } return out; }
      const re = /"severity"\s*:\s*"(critical|major|minor|info)"/g;
      while ((m = re.exec(text))) { const seg = text.slice(m.index, m.index + 3000); const im = seg.match(/"issue"\s*:\s*"((?:[^"\\]|\\.)*)"/); if (!im) continue; let s = im[1]; try { s = JSON.parse('"' + s + '"'); } catch (_e) { } const sh = (seg.match(/"sheet"\s*:\s*"([^"]*)"/) || [])[1] || ''; out.push({ sev: m[1], s: (sh ? sh + ': ' : '') + s }); }
      return out;
    };
    const paint = activity => {
      if (!document.body.contains(art)) return;
      const el = (Date.now() - t0) / 1000, its = items(); let f = Math.min(0.9, el / est * 0.85 + 0.03);
      if (its.length) f = Math.max(f, Math.min(0.94, 0.55 + its.length * 0.04));
      const pct = Math.round(f * 100); art.querySelector('.du-ckp-pct').textContent = pct + '%'; art.querySelector('.du-ckp-meter i').style.width = pct + '%';
      art.querySelector('.du-ckp-phase').textContent = bg ? 'Still working in the background' : activity === 'searching' ? 'Checking current code and jurisdiction sources…' : its.length ? (rewrite ? 'Writing sections · ' : 'Writing findings · ') + its.length + ' so far' : el > est * 1.5 ? 'Taking longer than usual — still working' : rewrite ? 'Applying your approved changes…' : narrative ? 'Reading the document' + (r.plans_path ? ' and the plans' : '') + '…' : 'Reading ' + pages + ' page' + (pages === 1 ? '' : 's') + '…';
      const mm = Math.floor(el / 60), ss = Math.floor(el % 60);
      art.querySelector('.du-ckp-note').textContent = `${mm}:${String(ss).padStart(2, '0')} elapsed · usually about ${Math.max(1, Math.round(est / 60))} min. The meter is an estimate; items appear below as soon as they are written.`;
      const live = art.querySelector('.du-check-live');
      if (its.length || bg) { live.hidden = false; live.querySelector('h3').textContent = its.length ? 'Found so far · ' + its.length + ' item' + (its.length === 1 ? '' : 's') : 'Nothing written yet'; live.querySelector('ul').innerHTML = its.map(i => `<li class="du-sev-${i.sev}"><span class="du-status-pill" data-state="${i.sev}">${i.sev === 'info' ? (rewrite ? 'SECTION' : 'NOTE') : i.sev.toUpperCase()}</span> ${esc(i.s)}</li>`).join(''); }
      if (!bg && Date.now() - t0 > watchMs) {
        bg = true; const b = art.querySelector('.du-ck22-bg'); b.hidden = false;
        b.innerHTML = `<b>This is taking much longer than usual.</b> ${its.length ? 'The ' + its.length + ' item' + (its.length === 1 ? '' : 's') + ' below arrived so far.' : 'Nothing has been written yet.'} DrawUp keeps working in the background and will notify you when the ${rewrite ? 'document' : 'review'} is saved — you can leave this page. If it cannot finish, whatever arrived is kept and you are not charged for an incomplete result.`;
      }
    };
    paint(); const tick = setInterval(() => { if (!alive()) clearInterval(tick); else paint(); }, 1000);
    while (alive()) {
      await sleep(bg ? 10000 : streamed ? 400 : 4000); if (!alive()) break;
      try {
        const d = await api(c, '/api/check?id=' + encodeURIComponent(r.id) + (rewrite ? '&phase=rewrite' : '') + (streamed ? '&after=' + cursor : ''));
        const still = rewrite ? d.review?.rewrite_status === 'writing' : d.review?.status === 'reviewing';
        if (streamed && typeof d.cursor === 'number') { cursor = d.cursor; if (d.delta) text += d.delta; paint(d.activity); if (still) continue; }
        if (streamed && still && typeof d.cursor !== 'number') streamed = false;
        if (d.review && !still) { clearInterval(tick); return done(); }
      } catch (e) { console.warn('check poll', e); }
    }
    clearInterval(tick);
  }

  /** Builds placements for this review's PDF (cached per review + file). */
  const placeCache = new Map();
  async function placementsFor(c, r, path, findings, opts) {
    const key = r.id + ':' + path + ':' + (opts && opts.noFix ? 'n' : 'f');
    if (!placeCache.has(key)) placeCache.set(key, (async () => { const bytes = await fileBytes(c, path); const layer = await readLayer(bytes); const pls = await locateAll(findings, layer, opts); return { bytes, layer, pls }; })().catch(e => { placeCache.delete(key); throw e; }));
    return placeCache.get(key);
  }

  function renderPlansResult(w, c, r, body, proj) {
    const findings = sortFindings(r.findings), counts = SEV.map(s => [s, findings.filter(f => f.severity === s).length]);
    body.innerHTML = `${r.notice ? `<div class="du-ck22-notice" role="status">${esc(r.notice)}</div>` : ''}
      <div class="du-stats">${counts.map(([s, n]) => `<article class="du-stat du-sev-${s}"><span>${s.toUpperCase()}</span><strong>${n}</strong></article>`).join('')}</div>
      <article class="du-glass du-ck22-viewcard"><div class="du-ck22-vhead"><h2>Redlines on your sheets</h2><p class="du-muted">Each finding is clouded where it is on the sheet. Green clouds show a drawn example of how that part of the sheet should read. Your uploaded pages are untouched underneath — choose “Original only” to see them as uploaded.</p></div><div class="du-ck22-viewer"><div class="du-loading">LOCATING FINDINGS ON YOUR SHEETS…</div></div></article>
      <article class="du-glass du-ck-docs"><h2>Download</h2><p class="du-muted du-ck22-placed"></p>
        <div class="du-ck-doc-grid"><button class="du-ck-doc" data-doc="markup"><b>Marked-up set</b><span>Your PDF with numbered redline clouds on the sheets (a layer you can switch off). Findings index at the end.</span></button><button class="du-ck-doc" data-doc="fix"><b>Redlines + proposed fixes</b><span>Adds the redrawn fix next to each cloud on its own layer. Preliminary: not a revised or sealed set.</span></button><button class="du-ck-doc" data-doc="report"><b>Report</b><span>All findings, fixes, references and sources.</span></button></div><span class="du-ck-doc-st du-muted" aria-live="polite"></span></article>
      <article class="du-glass"><h2>Summary</h2><p style="white-space:pre-wrap">${esc(r.summary || '')}</p><p class="du-muted">${r.credits_charged ? r.credits_charged + ' credits used · ' : ''}Reviewed ${fmtWhen(r.completed_at)}. DrawUp Check is guidance for the design team; the licensed professional of record and the authority having jurisdiction make final determinations.</p></article>
      <article class="du-glass"><h2>Findings</h2>${findings.length ? `<div class="du-findings">${findings.map((f, i) => `<div class="du-finding du-sev-${f.severity}" data-n="${i + 1}"><div class="du-finding-head"><span class="du-status-pill" data-state="${f.severity}">${f.severity.toUpperCase()}</span><b>${esc(f.sheet || 'Sheet ?')}</b><small>${esc(f.location || '')}</small><small>${esc(String(f.category || '').replace('_', ' '))} · ${esc(f.confidence || '')} confidence</small></div><p>${esc(f.issue)}</p>${f.recommendation ? `<p class="du-muted"><b>Fix:</b> ${esc(f.recommendation)}</p>` : ''}${f.reference ? `<p class="du-muted"><b>Reference:</b> ${esc(f.reference)}</p>` : ''}<div class="du-finding-foot"><span class="du-finding-num">#${i + 1}<span class="du-ck22-where"></span></span><span class="du-ck22-acts"><button type="button" class="du-btn ghost du-ck22-show">Show on sheet</button><button type="button" class="du-ask-coach${/critical|major/.test(f.severity) ? ' hot' : ''}">Ask Arch Coach how to fix this →</button></span></div></div>`).join('')}</div>` : '<p>No findings were returned for this set.</p>'}
      ${(r.sources || []).length ? `<h3>Sources consulted</h3><ul class="du-source-list">${r.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a></li>`).join('')}</ul>` : ''}</article>`;
    let viewer = null, built = null;
    const st = $q(body, '.du-ck-doc-st'), base = slug(r.title);
    placementsFor(c, r, r.file_path, findings).then(async b => {
      built = b; X._last = b; const how = b.pls.reduce((a, p) => (a[p.how] = (a[p.how] || 0) + 1, a), {});
      $q(body, '.du-ck22-placed').textContent = `${b.pls.length} finding${b.pls.length === 1 ? '' : 's'} placed on the sheets${how.text ? ' — ' + how.text + ' located from text printed on the sheet' : ''}${how.model ? ', ' + how.model + ' from the reviewer’s region' : ''}${how.sheet || how.set ? ', ' + ((how.sheet || 0) + (how.set || 0)) + ' at the sheet title block' : ''}.`;
      b.pls.forEach(pl => { const el = body.querySelector(`.du-finding[data-n="${pl.n}"] .du-ck22-where`); if (el) el.textContent = ` · PDF page ${pl.page}${pl.sheet ? ' · ' + pl.sheet : ''}`; });
      viewer = await mountViewer($q(body, '.du-ck22-viewer'), b.layer, b.pls);
    }).catch(e => { $q(body, '.du-ck22-viewer').innerHTML = `<p class="du-muted">The sheets could not be shown here: ${esc(e.message || e)}. The downloads below still work.</p>`; });
    body.querySelectorAll('.du-finding').forEach(el => {
      const n = +el.dataset.n, f = findings[n - 1];
      el.querySelector('.du-ck22-show').onclick = () => { if (viewer) { $q(body, '.du-ck22-viewcard').scrollIntoView({ behavior: 'smooth' }); setTimeout(() => viewer.focus(n), 350); } else c.toast('Still placing the redlines…'); };
      el.querySelector('.du-ask-coach').onclick = () => { const q = `DrawUp Check flagged this on my drawings${r.jurisdiction ? ' for a project in ' + r.jurisdiction : ''}${r.building_type ? ' (' + r.building_type + ')' : ''}.\nSheet ${f.sheet || '?'}, ${f.location || ''}: ${f.issue}\nSuggested fix: ${f.recommendation || 'none given'}\nReference: ${f.reference || 'none given'}\nHow do I fix this, what exactly does the code require, and what should I draw or note on the sheet?`; try { sessionStorage.setItem('du-coach-prefill', q); } catch (_e) { } P.openPortalTab('arch-coach'); };
    });
    body.querySelectorAll('[data-doc]').forEach(b => b.onclick = async () => {
      const kind = b.dataset.doc; b.disabled = true;
      try {
        if (kind === 'report') { st.textContent = ' Writing the report…'; download(base + '-report.pdf', await pdfFrom(reportBlocks(r, findings, proj, built && built.pls), { title: r.title, footer: 'DrawUp Check report - ' + win(r.title) }), 'application/pdf'); st.textContent = ' Downloaded.'; return; }
        st.textContent = ' Building the ' + (kind === 'fix' ? 'redlines + proposed fixes' : 'marked-up') + ' PDF…';
        const bb = built || await placementsFor(c, r, r.file_path, findings);
        const out = await buildMarkupPdf(bb.bytes, bb.pls, { fixes: kind === 'fix', title: r.title, file: r.file_name });
        download(base + (kind === 'fix' ? '-redlines-proposed-fixes-PRELIMINARY.pdf' : '-markup.pdf'), out, 'application/pdf'); st.textContent = ' Downloaded.';
      } catch (e) { st.textContent = ' Could not build the PDF: ' + (e.message || e); } finally { b.disabled = false; }
    });
  }
  function reportBlocks(r, findings, proj, pls) {
    const b = [{ t: 'title', s: 'Drawing Review Report' }, { t: 'subtitle', s: r.title }, { t: 'meta', s: [r.file_name, r.page_count ? r.page_count + ' pages' : '', r.jurisdiction, proj && proj.project_name, 'Reviewed ' + new Date(r.completed_at || Date.now()).toLocaleString()].filter(Boolean).join('  |  ') }];
    if (r.notice) b.push({ t: 'p', s: r.notice });
    b.push({ t: 'h1', s: 'Summary' }); String(r.summary || '').split(/\n\n+/).forEach(p => b.push({ t: 'p', s: p }));
    b.push({ t: 'h1', s: 'Findings (' + findings.length + ')' });
    findings.forEach((f, i) => { const pl = pls && pls[i]; b.push({ t: 'h2', s: `${i + 1}. [${f.severity.toUpperCase()}] ${f.sheet || ''}${pl ? ' - PDF page ' + pl.page : ''}${f.location ? ' - ' + f.location : ''}` }, { t: 'p', s: f.issue }); const items = []; if (f.recommendation) items.push('Fix: ' + f.recommendation); if (f.fix && f.fix.lines && f.fix.lines.length) items.push('Drawn fix: ' + f.fix.lines.join(' / ')); else if (f.fix && f.fix.label) items.push('Drawn fix: ' + f.fix.label); if (f.reference) items.push('Reference: ' + f.reference); items.push(`${String(f.category || '').replace('_', ' ')} - ${f.confidence} confidence`); b.push({ t: 'bullets', items }); });
    if ((r.sources || []).length) b.push({ t: 'h1', s: 'Sources consulted' }, { t: 'bullets', items: r.sources.map(s => (s.title || 'Source') + ' - ' + s.url) });
    b.push({ t: 'small', s: 'DrawUp Check is guidance for the design team. The licensed professional of record and the authority having jurisdiction make final determinations.' });
    return b;
  }

  /* ---------------------------------------------------------------- narrative result */
  function renderNarrativeResult(w, c, r, body, alive, reload) {
    const rep = r.report || {}, j = rep.jurisdiction || {}, plansMode = r.mode === 'narrative_plans';
    const nc = v => /NEEDS CONFIRMATION/i.test(v || '') ? `<span class="du-ck22-nc">NEEDS CONFIRMATION</span>` : esc(v);
    const lab = l => `<span class="du-ck22-lab lab-${esc(l)}">${esc(LABEL_TXT[l] || l)}</span>`;
    const prior = new Set((r.approved && r.approved.ids) || []);
    const approvable = (id, def) => `<label class="du-ck22-ap"><input type="checkbox" data-approve="${esc(id)}"${(prior.size ? prior.has(id) : def) ? ' checked' : ''}> Approve this change</label>`;
    const points = rep.points || [], cov = rep.coverage || [], con = rep.conflicts || [], miss = rep.missing || [];
    const labCounts = Object.keys(LABEL_TXT).map(k => [k, points.filter(p => p.label === k).length]);
    body.innerHTML = `${r.notice ? `<div class="du-ck22-notice" role="status">${esc(r.notice)}</div>` : ''}
      <article class="du-glass"><h2>1 · What this document is</h2><div class="du-ck22-kv"><div><span>Document type</span><b>${nc(rep.document_type)}</b></div><div><span>Purpose</span><b>${esc(rep.document_purpose || '')}</b></div><div><span>Audience</span><b>${esc(rep.audience || '')}</b></div></div>${rep.summary ? `<p>${esc(rep.summary)}</p>` : ''}
        <h3>Jurisdiction</h3><p class="du-ck22-chain">${[['City', j.city], ['County', j.county], ['State', j.state], ['AHJ', j.ahj]].map(([k, v]) => `<span><small>${k}</small>${nc(v)}</span>`).join('<i>→</i>')}</p>${(j.special_authorities || []).length ? `<p class="du-muted">Special authorities: ${esc(j.special_authorities.join(', '))}</p>` : ''}</article>
      <article class="du-glass"><h2>2 · Project facts found</h2><p class="du-muted">Copied as the document states them. Anything missing is marked NEEDS CONFIRMATION — DrawUp never fills it in.</p><div class="du-ck22-tablewrap"><table class="du-ck22-table"><thead><tr><th>Item</th><th>Document states</th><th>Where</th></tr></thead><tbody>${(rep.facts || []).map(f => `<tr class="${f.status === 'needs_confirmation' ? 'nc' : ''}"><td>${esc(f.field)}</td><td>${nc(f.value)}</td><td>${esc(f.where || '')}</td></tr>`).join('') || '<tr><td colspan="3">No facts were returned.</td></tr>'}</tbody></table></div></article>
      ${plansMode ? `<article class="du-glass"><h2>3 · What the narrative should cover, based on the plans</h2>${cov.length ? `<div class="du-ck22-cov">${cov.map(v => `<div class="du-ck22-covrow st-${esc(v.status)}"><span class="du-ck22-covst">${esc(v.status.replace('_', ' ').toUpperCase())}</span><div><b>${esc(v.topic)}</b><small>Plans: ${esc(v.from_plans)} · <a href="#" data-cite="${v.page || ''}">sheet ${esc(v.sheet || '?')}, PDF page ${v.page || '?'}</a>${v.narrative_where ? ' · Narrative ' + esc(v.narrative_where) : ''}</small>${(v.status === 'missing' || v.status === 'partial') && v.proposed_text ? `<p class="du-ck22-prop"><b>Proposed text:</b> ${nc(v.proposed_text)}</p>${approvable(v.id, true)}` : ''}</div></div>`).join('')}</div>` : '<p class="du-muted">Nothing specific was listed.</p>'}
        <h3>Statements that conflict with the plans (${con.length})</h3>${con.length ? con.map(x => `<div class="du-ck22-pt conflict"><div class="du-ck22-pthead"><span class="du-status-pill" data-state="${esc(x.severity)}">${esc(x.severity.toUpperCase())}</span><small>${esc(x.id)} · Narrative ${esc(x.narrative_where || '')} · <a href="#" data-cite="${x.page || ''}" data-conf="${esc(x.id)}">sheet ${esc(x.sheet || '?')}, PDF page ${x.page || '?'}</a></small></div><blockquote>“${esc(x.narrative_quote)}”</blockquote><p><b>The plans show:</b> ${esc(x.plans_show)}</p>${x.proposed_change ? `<p class="du-ck22-prop"><b>Proposed correction:</b> ${esc(x.proposed_change)}</p>${approvable(x.id, true)}` : ''}</div>`).join('') : '<p class="du-muted">No conflicts were found between the narrative and the plans.</p>'}
        <div class="du-ck22-viewer du-ck22-plansview"><div class="du-loading">PLACING CONFLICTS ON THE PLANS…</div></div><p><button type="button" class="du-btn ghost" id="ck-plans-dl">Download plans with conflicts clouded (PDF)</button> <span class="du-ck-doc-st du-muted"></span></p></article>` : ''}
      <article class="du-glass"><h2>${plansMode ? '4' : '3'} · Review points</h2><div class="du-chips du-ck22-filt">${labCounts.map(([k, n]) => `<button type="button" class="du-chip on" data-filt="${k}">${LABEL_TXT[k]} · ${n}</button>`).join('')}</div>
        <div class="du-ck22-pts">${points.map(p => `<div class="du-ck22-pt" data-label="${esc(p.label)}"><div class="du-ck22-pthead">${lab(p.label)}<small>${esc(p.id)}${p.topic ? ' · ' + esc(p.topic) : ''}${p.where ? ' · ' + esc(p.where) : ''}</small></div>${p.quote ? `<blockquote>“${esc(p.quote)}”</blockquote>` : ''}<p>${esc(p.comment)}</p>${p.source_url ? `<p class="du-muted">Source: <a href="${esc(p.source_url)}" target="_blank" rel="noopener">${esc(p.source_url)}</a></p>` : ''}${p.proposed_change ? `<p class="du-ck22-prop"><b>Proposed change:</b> ${nc(p.proposed_change)}</p>${p.label === 'document_states' ? '' : approvable(p.id, p.label === 'recommendation' || p.label === 'verified_requirement')}` : ''}</div>`).join('') || '<p class="du-muted">No review points.</p>'}</div>
        ${miss.length ? `<h3>Could strengthen the document</h3>${miss.map(m => `<div class="du-ck22-pt" data-label="${esc(m.label)}"><div class="du-ck22-pthead">${lab(m.label)}<small>${esc(m.id)}</small></div><p><b>${esc(m.item)}</b>${m.why ? ' — ' + esc(m.why) : ''}</p>${approvable(m.id, false)}</div>`).join('')}` : ''}
        ${(rep.repetition || []).length ? `<h3>Repeated or generic phrases</h3><ul class="du-ck22-rep">${rep.repetition.map(x => `<li><b>“${esc(x.phrase)}”</b> × ${x.count}${x.suggestion ? ' — ' + esc(x.suggestion) : ''}</li>`).join('')}</ul>` : ''}
        ${rep.limitations ? `<p class="du-muted">Limits of this review: ${esc(rep.limitations)}</p>` : ''}
        <p><button type="button" class="du-btn ghost" id="ck-rev-dl">Download this review (PDF)</button></p></article>
      <article class="du-glass du-ck22-approve"><h2>${plansMode ? '5' : '4'} · Approve and rewrite</h2><p>Nothing is rewritten until you approve. DrawUp keeps every accurate project fact, applies only the checked changes, and writes NEEDS CONFIRMATION where a fact is missing.</p>
        <p class="du-ck22-apcount"></p><p><button type="button" class="du-btn ghost" id="ck-ap-all">Approve all proposed</button> <button type="button" class="du-btn ghost" id="ck-ap-none">Clear</button></p>
        <div class="du-field"><label for="ck-notes">Notes for the rewrite (optional)</label><textarea id="ck-notes" rows="3" placeholder="e.g. Keep the owner’s section headings. Audience is the airport authority review board.">${esc((r.approved && r.approved.notes) || '')}</textarea></div>
        <p class="du-muted">Template: DrawUp professional template (title block, project information table, numbered headings, revision log). 30 credits; refunded if it fails.</p>
        <button type="button" class="du-btn primary" id="ck-rewrite">Rewrite with approved changes</button> <span id="ck-rw-st" class="du-save-status" aria-live="polite"></span></article>
      <div class="du-ck22-rw"></div>`;
    const count = () => { const n = body.querySelectorAll('[data-approve]:checked').length; $q(body, '.du-ck22-apcount').textContent = n + ' change' + (n === 1 ? '' : 's') + ' approved.'; $q(body, '#ck-rewrite').disabled = !n || r.rewrite_status === 'writing'; };
    body.querySelectorAll('[data-approve]').forEach(cb => cb.onchange = count); count();
    $q(body, '#ck-ap-all').onclick = () => { body.querySelectorAll('[data-approve]').forEach(cb => { cb.checked = true; }); count(); };
    $q(body, '#ck-ap-none').onclick = () => { body.querySelectorAll('[data-approve]').forEach(cb => { cb.checked = false; }); count(); };
    body.querySelectorAll('[data-filt]').forEach(b => b.onclick = () => { b.classList.toggle('on'); const on = new Set([...body.querySelectorAll('[data-filt].on')].map(x => x.dataset.filt)); body.querySelectorAll('.du-ck22-pts .du-ck22-pt').forEach(p => { p.hidden = !on.has(p.dataset.label); }); });
    $q(body, '#ck-rev-dl').onclick = async () => { download(slug(r.title) + '-narrative-review.pdf', await pdfFrom(reviewBlocks(r), { title: r.title, footer: 'DrawUp Check narrative review - ' + win(r.title) }), 'application/pdf'); };
    $q(body, '#ck-rewrite').onclick = async e => {
      const ids = [...body.querySelectorAll('[data-approve]:checked')].map(x => x.dataset.approve), st = $q(body, '#ck-rw-st'); e.target.disabled = true; st.textContent = ' Starting the rewrite…';
      try { await api(c, '/api/check', { method: 'POST', body: JSON.stringify({ review_id: r.id, action: 'rewrite', approved: ids, notes: $q(body, '#ck-notes').value }) }); reload(); }
      catch (er) { e.target.disabled = false; st.textContent = ' ' + (er.message || er); }
    };
    // Rewrite state
    const rw = $q(body, '.du-ck22-rw');
    if (r.rewrite_status === 'writing') { rw.innerHTML = '<article class="du-glass du-ck22-run"></article>'; runProgress(w, c, r, $q(rw, '.du-ck22-run'), alive, reload, 'rewrite'); rw.scrollIntoView({ block: 'nearest' }); }
    else if (r.rewrite_status === 'failed') rw.innerHTML = `<article class="du-glass"><h2>The rewrite did not finish</h2><p>${esc(r.rewrite_error || '')}</p><p class="du-muted">Adjust your approvals above and try again.</p></article>`;
    else if (r.rewrite_status === 'complete' && r.rewrite) renderRewrite(rw, r, c);
    // Plans with conflicts
    if (plansMode && r.plans_path) {
      const findings = r.findings || [];
      let viewer = null, built = null;
      placementsFor(c, r, r.plans_path, findings, { noFix: true }).then(async b => { built = b; X._last = b; viewer = await mountViewer($q(body, '.du-ck22-plansview'), b.layer, b.pls, { noFix: true }); }).catch(e => { $q(body, '.du-ck22-plansview').innerHTML = `<p class="du-muted">The plans could not be shown: ${esc(e.message || e)}</p>`; });
      body.querySelectorAll('[data-cite]').forEach(a => a.onclick = e => { e.preventDefault(); const k = findings.findIndex(f => f.reference === a.dataset.conf); if (viewer && k >= 0) { $q(body, '.du-ck22-plansview').scrollIntoView({ behavior: 'smooth' }); setTimeout(() => viewer.focus(k + 1), 300); } else if (a.dataset.cite) { const fig = body.querySelector(`.du-ck22-plansview [data-page="${a.dataset.cite}"]`); if (fig) fig.scrollIntoView({ behavior: 'smooth' }); else c.toast('Choose “All pages” in the plan viewer to see page ' + a.dataset.cite + '.'); } });
      $q(body, '#ck-plans-dl').onclick = async e => { const st = e.target.nextElementSibling; e.target.disabled = true; st.textContent = ' Building…'; try { const b = built || await placementsFor(c, r, r.plans_path, findings, { noFix: true }); download(slug(r.title) + '-plans-conflicts-markup.pdf', await buildMarkupPdf(b.bytes, b.pls, { title: r.title, file: r.plans_name }), 'application/pdf'); st.textContent = ' Downloaded.'; } catch (er) { st.textContent = ' ' + (er.message || er); } finally { e.target.disabled = false; } };
    }
  }
  function reviewBlocks(r) {
    const rep = r.report || {}, j = rep.jurisdiction || {};
    const b = [{ t: 'title', s: 'Design Narrative Review' }, { t: 'subtitle', s: r.title }, { t: 'meta', s: [r.file_name, r.plans_name ? 'compared with ' + r.plans_name : '', 'Reviewed ' + new Date(r.completed_at || Date.now()).toLocaleString()].filter(Boolean).join('  |  ') }];
    if (r.notice) b.push({ t: 'p', s: r.notice });
    b.push({ t: 'h1', s: 'Document' }, { t: 'table', head: ['Item', 'Finding'], widths: [3000, 6360], rows: [['Document type', rep.document_type || ''], ['Purpose', rep.document_purpose || ''], ['Audience', rep.audience || ''], ['Jurisdiction', [j.city, j.county, j.state, j.ahj].join(' > ')]] });
    b.push({ t: 'h1', s: 'Project facts found' }, { t: 'table', head: ['Item', 'Document states', 'Where'], widths: [2600, 5160, 1600], rows: (rep.facts || []).map(f => [f.field, f.value, f.where || '']) });
    if ((rep.coverage || []).length) b.push({ t: 'h1', s: 'What the narrative should cover (from the plans)' }, { t: 'table', head: ['Topic', 'Plans', 'Narrative'], widths: [2800, 3900, 2660], rows: rep.coverage.map(v => [v.topic, `${v.from_plans} (${v.sheet}, PDF page ${v.page ?? '?'})`, v.status.replace('_', ' ') + (v.proposed_text ? ': ' + v.proposed_text : '')]) });
    if ((rep.conflicts || []).length) { b.push({ t: 'h1', s: 'Conflicts with the plans' }); rep.conflicts.forEach(x => { b.push({ t: 'h2', s: `${x.id} - sheet ${x.sheet}, PDF page ${x.page ?? '?'}` }, { t: 'p', s: `Narrative (${x.narrative_where}): "${x.narrative_quote}"` }, { t: 'p', s: 'Plans show: ' + x.plans_show }); if (x.proposed_change) b.push({ t: 'bullets', items: ['Proposed correction: ' + x.proposed_change] }); }); }
    b.push({ t: 'h1', s: 'Review points' });
    (rep.points || []).forEach(p => { b.push({ t: 'h2', s: `${p.id} - ${LABEL_TXT[p.label] || p.label}${p.where ? ' - ' + p.where : ''}` }); if (p.quote) b.push({ t: 'p', s: `"${p.quote}"` }); b.push({ t: 'p', s: p.comment }); const it = []; if (p.proposed_change) it.push('Proposed change: ' + p.proposed_change); if (p.source_url) it.push('Source: ' + p.source_url); if (it.length) b.push({ t: 'bullets', items: it }); });
    if ((rep.missing || []).length) b.push({ t: 'h1', s: 'Could strengthen the document' }, { t: 'bullets', items: rep.missing.map(m => `${m.id} ${m.item}${m.why ? ' - ' + m.why : ''} (${LABEL_TXT[m.label] || m.label})`) });
    if ((rep.repetition || []).length) b.push({ t: 'h1', s: 'Repeated or generic phrases' }, { t: 'bullets', items: rep.repetition.map(x => `"${x.phrase}" x ${x.count}${x.suggestion ? ' - ' + x.suggestion : ''}`) });
    b.push({ t: 'small', s: 'Labels: Document states = in the uploaded document; Verified requirement = confirmed from an authoritative source; Recommendation = reviewer suggestion; Needs confirmation = cannot be verified now. DrawUp Check is guidance; the design professional of record and the AHJ make final determinations.' });
    return b;
  }
  /**
   * Rewritten document: editable before export. The member can change the title, sections and project
   * information, add rows and sections, and add a cover sheet. Edits are saved to the review (no AI, no credits).
   * When the firm kit is loaded and the member belongs to a firm, it can also open in the firm's own template.
   */
  function renderRewrite(host, r, c) {
    const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const st = JSON.parse(JSON.stringify(r.rewrite));
    st.cover = Object.assign({ enabled: false, prepared_for: '', prepared_by: '', date: today, project_number: '', phase: '', notes: '' }, st.cover || {});
    const nc = s => esc(s).replace(/NEEDS CONFIRMATION/g, '<span class="du-ck22-nc">NEEDS CONFIRMATION</span>');
    let tab = 'edit', dirty = false;
    host.innerHTML = `<article class="du-glass du-ck22-rwcard"><h2>Rewritten document</h2><p class="du-muted">Applied ${st.change_log.length} approved change${st.change_log.length === 1 ? '' : 's'}. Project facts kept as the original states them; ${st.needs_confirmation.length} item${st.needs_confirmation.length === 1 ? '' : 's'} need${st.needs_confirmation.length === 1 ? 's' : ''} confirmation.${st.limitations ? ' ' + esc(st.limitations) : ''} Edit anything below before you download; your edits are kept with this check.</p>
      <div class="du-ck22-modes" role="tablist"><button type="button" role="tab" class="du-chip on" data-rwtab="edit" aria-selected="true">Edit</button><button type="button" role="tab" class="du-chip" data-rwtab="preview" aria-selected="false">Preview</button></div>
      <div class="du-ck22-rwedit"></div><div class="du-ck22-rwprev" hidden></div>
      <p class="du-ck22-dl"><button type="button" class="du-btn ghost" id="ck-rw-save">Save edits</button> <button type="button" class="du-btn primary" id="ck-rw-docx">Download Word (.docx)</button> <button type="button" class="du-btn ghost" id="ck-rw-pdf">Download PDF</button> <button type="button" class="du-btn ghost" id="ck-rw-firm" hidden>Open in firm template (editable)</button> <span class="du-save-status" id="ck-rw-sst" aria-live="polite"></span></p></article>`;
    const ed = $q(host, '.du-ck22-rwedit'), pv = $q(host, '.du-ck22-rwprev'), sst = $q(host, '#ck-rw-sst');
    const fld = (k, label, v, ph) => `<div class="du-field"><label>${label}</label><input data-k="${k}" value="${esc(v)}"${ph ? ` placeholder="${esc(ph)}"` : ''}></div>`;
    const paint = () => {
      ed.innerHTML = `<div class="du-two">${fld('title', 'Title', st.title)}${fld('subtitle', 'Subtitle', st.subtitle)}</div>
        <fieldset class="du-ck22-fs"><legend><label><input type="checkbox" data-k="cover.enabled"${st.cover.enabled ? ' checked' : ''}> Add a cover sheet</label></legend>
          <div class="du-ck22-cov-f"${st.cover.enabled ? '' : ' hidden'}><div class="du-two">${fld('cover.prepared_for', 'Prepared for', st.cover.prepared_for, 'Owner / client')}${fld('cover.prepared_by', 'Prepared by', st.cover.prepared_by, 'Firm name')}</div><div class="du-two">${fld('cover.date', 'Date', st.cover.date)}${fld('cover.project_number', 'Project number', st.cover.project_number)}</div><div class="du-two">${fld('cover.phase', 'Phase / submission', st.cover.phase, 'e.g. Schematic Design')}${fld('cover.notes', 'Cover note', st.cover.notes, 'e.g. Issued for owner review')}</div></div></fieldset>
        <h3>Project information</h3><div class="du-ck22-facts">${st.project_facts.map((f, i) => `<div class="du-ck22-frow"><input data-fact="${i}" data-part="label" value="${esc(f.label)}" aria-label="Item"><input data-fact="${i}" data-part="value" value="${esc(f.value)}" aria-label="Value"><button type="button" class="du-btn ghost" data-delfact="${i}" aria-label="Remove row">✕</button></div>`).join('')}</div><button type="button" class="du-btn ghost" id="ck-add-fact">+ Add information</button>
        <h3>Sections</h3>${st.sections.map((sec, i) => `<div class="du-ck22-sec"><div class="du-ck22-sechead"><input data-sec="${i}" data-part="heading" value="${esc(sec.heading)}" aria-label="Section heading"><select data-sec="${i}" data-part="level" aria-label="Level"><option value="1"${sec.level !== 2 ? ' selected' : ''}>Section</option><option value="2"${sec.level === 2 ? ' selected' : ''}>Subsection</option></select><button type="button" class="du-btn ghost" data-move="${i}:-1" aria-label="Move up">↑</button><button type="button" class="du-btn ghost" data-move="${i}:1" aria-label="Move down">↓</button><button type="button" class="du-btn ghost" data-delsec="${i}" aria-label="Remove section">✕</button></div>
          <label class="du-muted">Paragraphs (blank line between paragraphs)</label><textarea data-sec="${i}" data-part="paragraphs" rows="${Math.min(14, 3 + sec.paragraphs.join('\n\n').length / 90 | 0)}">${esc(sec.paragraphs.join('\n\n'))}</textarea>
          <label class="du-muted">Bullets (one per line)</label><textarea data-sec="${i}" data-part="bullets" rows="${Math.max(2, Math.min(10, sec.bullets.length + 1))}">${esc(sec.bullets.join('\n'))}</textarea></div>`).join('')}
        <button type="button" class="du-btn ghost" id="ck-add-sec">+ Add section</button>
        <h3>Items needing confirmation</h3><textarea data-k="needs" rows="${Math.max(2, st.needs_confirmation.length + 1)}">${esc(st.needs_confirmation.join('\n'))}</textarea>`;
      ed.querySelectorAll('input,textarea,select').forEach(el => el.addEventListener('input', () => { collect(); dirty = true; sst.textContent = ' Unsaved edits'; if (el.dataset.k === 'cover.enabled') $q(ed, '.du-ck22-cov-f').hidden = !el.checked; }));
      ed.querySelectorAll('[data-k="cover.enabled"]').forEach(el => el.addEventListener('change', () => { collect(); dirty = true; $q(ed, '.du-ck22-cov-f').hidden = !el.checked; }));
      $q(ed, '#ck-add-fact').onclick = () => { collect(); st.project_facts.push({ label: '', value: '' }); dirty = true; paint(); ed.querySelector('.du-ck22-frow:last-child input').focus(); };
      $q(ed, '#ck-add-sec').onclick = () => { collect(); st.sections.push({ heading: 'New section', level: 1, paragraphs: [], bullets: [] }); dirty = true; paint(); };
      ed.querySelectorAll('[data-delfact]').forEach(b => b.onclick = () => { collect(); st.project_facts.splice(+b.dataset.delfact, 1); dirty = true; paint(); });
      ed.querySelectorAll('[data-delsec]').forEach(b => b.onclick = () => { collect(); if (st.sections.length > 1) st.sections.splice(+b.dataset.delsec, 1); dirty = true; paint(); });
      ed.querySelectorAll('[data-move]').forEach(b => b.onclick = () => { collect(); const [i, d] = b.dataset.move.split(':').map(Number), j = i + d; if (j < 0 || j >= st.sections.length) return; [st.sections[i], st.sections[j]] = [st.sections[j], st.sections[i]]; dirty = true; paint(); });
    };
    const collect = () => {
      ed.querySelectorAll('[data-k]').forEach(el => { const k = el.dataset.k; if (k === 'needs') st.needs_confirmation = el.value.split('\n').map(x => x.trim()).filter(Boolean); else if (k.startsWith('cover.')) st.cover[k.slice(6)] = el.type === 'checkbox' ? el.checked : el.value; else st[k] = el.value; });
      ed.querySelectorAll('[data-fact]').forEach(el => { const f = st.project_facts[+el.dataset.fact]; if (f) f[el.dataset.part] = el.value; });
      ed.querySelectorAll('[data-sec]').forEach(el => { const sec = st.sections[+el.dataset.sec]; if (!sec) return; const p = el.dataset.part; sec[p] = p === 'level' ? +el.value : p === 'paragraphs' ? el.value.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean) : p === 'bullets' ? el.value.split('\n').map(x => x.trim()).filter(Boolean) : el.value; });
    };
    const clean = () => ({ ...st, project_facts: st.project_facts.filter(f => f.label.trim()), sections: st.sections.filter(x => x.heading.trim()) });
    const preview = () => { const blocks = rewriteBlocks(clean(), r); pv.innerHTML = `<div class="du-ck22-paper">${blocks.map(b => b.t === 'cover' ? `<div class="du-ck22-coverpg"><p class="kick">${esc(b.kicker)}</p><h1>${esc(b.title)}</h1><p class="sub">${esc(b.subtitle)}</p><dl>${b.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${nc(v)}</dd>`).join('')}</dl></div>` : b.t === 'pagebreak' ? '<hr class="du-ck22-pb">' : b.t === 'title' ? `<h1>${esc(b.s)}</h1>` : b.t === 'subtitle' ? `<p class="sub">${esc(b.s)}</p>` : b.t === 'meta' ? `<p class="meta">${esc(b.s)}</p>` : b.t === 'h1' ? `<h2>${esc(b.s)}</h2>` : b.t === 'h2' ? `<h3>${esc(b.s)}</h3>` : b.t === 'p' ? `<p>${nc(b.s)}</p>` : b.t === 'small' ? `<p class="small">${esc(b.s)}</p>` : b.t === 'bullets' ? `<ul>${b.items.map(i => `<li>${nc(i)}</li>`).join('')}</ul>` : b.t === 'table' ? `<div class="du-ck22-tablewrap"><table><thead><tr>${b.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(row => `<tr>${row.map(x => `<td>${nc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '').join('')}</div>`; };
    host.querySelectorAll('[data-rwtab]').forEach(b => b.onclick = () => { collect(); tab = b.dataset.rwtab; host.querySelectorAll('[data-rwtab]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); ed.hidden = tab !== 'edit'; pv.hidden = tab !== 'preview'; if (tab === 'preview') preview(); });
    paint();
    const name = () => slug(st.title) + '-revised', meta = () => ({ title: st.title, footer: win(st.title) + ' - ' + (st.document_type || 'Design Narrative') });
    $q(host, '#ck-rw-docx').onclick = () => { collect(); download(name() + '.docx', docxFrom(rewriteBlocks(clean(), r), meta()), DOCX_TYPE); };
    $q(host, '#ck-rw-pdf').onclick = async () => { collect(); download(name() + '.pdf', await pdfFrom(rewriteBlocks(clean(), r), meta()), 'application/pdf'); };
    $q(host, '#ck-rw-save').onclick = async e => { collect(); e.target.disabled = true; sst.textContent = ' Saving…'; try { const d = await api(c, '/api/check', { method: 'POST', body: JSON.stringify({ review_id: r.id, action: 'save_rewrite', rewrite: clean() }) }); if (d.review) r.rewrite = d.review.rewrite; dirty = false; sst.textContent = ' Saved.'; } catch (er) { sst.textContent = ' Not saved — ' + (er.message || er); } finally { e.target.disabled = false; } };
    window.addEventListener('beforeunload', ev => { if (dirty && document.body.contains(host)) { ev.preventDefault(); ev.returnValue = ''; } });
    // Firm template (drawup-firmkit-v22.js), only when that API exists and the member belongs to a firm.
    (async () => {
      const kit = () => window.DrawUpFirmKit && typeof window.DrawUpFirmKit.newDocument === 'function' ? window.DrawUpFirmKit : null;
      if (!kit()) return;
      const { data } = await c.client.from('firm_members').select('firm_id').eq('user_id', c.user.id).limit(1);
      const firmId = data && data[0] && data[0].firm_id; if (!firmId || !document.body.contains(host)) return;
      const b = $q(host, '#ck-rw-firm'); b.hidden = false;
      b.onclick = async () => { collect(); const k = kit(); if (!k) { c.toast('The firm template tools are not loaded.', true); return; } const doc = clean();
        try { await k.newDocument({ firmId, title: doc.title, sections: [...(doc.project_facts.length ? [{ heading: 'Project Information', body: doc.project_facts.map(f => f.label + ': ' + f.value).join('\n') }] : []), ...doc.sections.map(x => ({ heading: x.heading, body: [...x.paragraphs, ...x.bullets.map(t => '• ' + t)].join('\n\n') })), ...(doc.needs_confirmation.length ? [{ heading: 'Items Needing Confirmation', body: doc.needs_confirmation.map(t => '• ' + t + ' - NEEDS CONFIRMATION').join('\n') }] : [])] }); }
        catch (er) { c.toast('The firm template could not open: ' + (er.message || er), true); } };
    })().catch(() => { });
  }

  /* ====================================================================== route + background notices */
  X.route = async (w, c, params, ctx) => {
    if (X.disabled) return false;
    const id = params.get('id');
    if (id) await renderReview(w, c, id, ctx && ctx.projects); else await renderList(w, c, params, ctx && ctx.projects);
    return true;
  };
  /** Finishes reviews that kept running after the member left, then shows DrawUp's notice for them. */
  let reconciling = false;
  async function reconcile() {
    const client = window.drawupSupabaseClient; if (!client || reconciling) return; reconciling = true;
    try {
      const ses = (await client.auth.getSession()).data.session; if (!ses || ses.user?.is_anonymous) return;
      await fetch('/api/check?reconcile=1', { headers: { Authorization: 'Bearer ' + ses.access_token }, cache: 'no-store' }).catch(() => { });
      const { data } = await client.from('drawup_notifications').select('id,title,body,href').is('read_at', null).eq('kind', 'check').order('created_at', { ascending: true }).limit(3);
      for (const n of data || []) {
        let box = document.getElementById('du-check-notice');
        if (!box) { box = document.createElement('button'); box.id = 'du-check-notice'; box.type = 'button'; box.className = 'du-ck22-toast'; document.body.appendChild(box); }
        box.innerHTML = '<b>' + esc(n.title) + '</b><span>' + esc(n.body) + '</span>';
        box.onclick = async () => { await client.from('drawup_notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id); box.remove(); if (n.href) { location.hash = n.href.replace(/^#/, ''); if (P && P.openPortalTab) P.openPortalTab('check'); } };
      }
    } catch (_e) { /* next round */ } finally { reconciling = false; }
  }
  X.reconcile = reconcile;
  setTimeout(reconcile, 2500); setInterval(reconcile, 60000);
})();
