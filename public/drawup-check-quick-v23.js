/* DrawUp Quick Check V23: just this step, nothing else.
 *  1 Find the flaws  - upload an image, PNG or PDF set (up to 12 pages); findings appear as they are written.
 *  2 Understand the fix - each finding explained in plain language with the change to make.
 *  3 On your template - your drawing placed on the sheet template you chose (DrawUp sheets or your own
 *    uploaded title block), with each fix drawn in green and a revision list in the title block.
 * The page renders every page to an image itself and sends it to /api/check/quick, which streams the answer
 * back on the same request (no background queue, no polling). Images become a PDF first, so the saved check
 * also opens later from "Your checks" with the full V22 viewer.
 * Mounts on top of the Check tab by wrapping window.DrawUpCheckV22.route (loads after drawup-check-v22.js)
 * and reuses its readLayer / locateAll / buildMarkupPdf.
 */
(function () {
  'use strict';
  const X = window.DrawUpCheckV22;
  if (!X || !X.route || X._quickV23) return;
  X._quickV23 = true;
  const BUCKET = 'drawup-private';
  const PDFJS = '/vendor/pdfjs-3.11.174/pdf.min.js', PDFJS_WORKER = '/vendor/pdfjs-3.11.174/pdf.worker.min.js', PDFLIB = '/vendor/pdf-lib-1.17.1.min.js';
  const MAX_PAGES = 12, TILE_PAGES = 6, FULL_PX = 1600, TILE_PX = 3000;
  const SEV = ['critical', 'major', 'minor', 'info'];
  const LS_TPL = 'du-qk23-template', LS_CUSTOM = 'du-qk23-custom';
  const $q = (w, s) => w.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const uuid = () => (crypto.randomUUID && crypto.randomUUID()) || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); });
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_e) { /* private window */ } };
  const win = t => String(t ?? '').replace(/[′]/g, "'").replace(/[″]/g, '"').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/×/g, 'x').replace(/[‐‑‒]/g, '-').replace(/[^\x20-\x7e\xa0-\xff•–—‘’“”…]/g, '');
  const clip = (s, n) => (s = String(s || ''), s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
  const slug = t => String(t || 'drawup-check').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'drawup-check';
  function download(name, data, type) { const blob = data instanceof Blob ? data : new Blob([data], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
  const loaded = {};
  function loadScript(src) { if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { loaded[src] = null; rej(new Error('The PDF tools could not load. Check your connection and try again.')); }; document.head.appendChild(s); }); return loaded[src]; }
  async function pdfjs() { if (!window.pdfjsLib) await loadScript(PDFJS); const L = window.pdfjsLib; L.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return L; }
  async function pdflib() { if (window.PDFLib) return window.PDFLib; await loadScript(PDFLIB); return window.PDFLib; }

  /* ====================================================================== templates */
  // Sizes in PDF points (72 per inch), landscape. tb = where the title block strip sits.
  const TEMPLATES = [
    { id: 'drawup-d', name: 'DrawUp ARCH D', sub: '36 × 24 in', w: 2592, h: 1728, tb: 'right' },
    { id: 'arch-e1', name: 'DrawUp ARCH E1', sub: '42 × 30 in', w: 3024, h: 2160, tb: 'right' },
    { id: 'tabloid', name: 'DrawUp Tabloid', sub: '17 × 11 in', w: 1224, h: 792, tb: 'bottom', flip: true },
    { id: 'letter', name: 'DrawUp Letter', sub: '11 × 8.5 in', w: 792, h: 612, tb: 'bottom', flip: true },
    { id: 'custom', name: 'My template', sub: 'Upload your sheet', custom: true },
  ];
  const thumb = t => t.custom
    ? '<svg viewBox="0 0 60 40" aria-hidden="true"><rect x="1" y="1" width="58" height="38" rx="2" fill="none" stroke="currentColor" stroke-dasharray="3 2"/><path d="M30 12v14M23 19h14" stroke="currentColor" stroke-width="2"/></svg>'
    : t.tb === 'right'
      ? '<svg viewBox="0 0 60 40" aria-hidden="true"><rect x="1" y="1" width="58" height="38" rx="1" fill="none" stroke="currentColor"/><rect x="48" y="3" width="9" height="34" fill="currentColor" opacity=".35"/><rect x="4" y="4" width="41" height="32" fill="none" stroke="currentColor" opacity=".5"/></svg>'
      : '<svg viewBox="0 0 60 40" aria-hidden="true"><rect x="1" y="1" width="58" height="38" rx="1" fill="none" stroke="currentColor"/><rect x="3" y="30" width="54" height="7" fill="currentColor" opacity=".35"/><rect x="4" y="4" width="52" height="23" fill="none" stroke="currentColor" opacity=".5"/></svg>';

  /** Sheet number printed on a page (largest sheet-number-looking text, preferring the lower right). */
  function sheetOf(pg) {
    let best = '', score = 0;
    for (const l of (pg && pg.lines) || []) {
      const m = String(l.s || '').toUpperCase().match(/\b[A-Z]{1,3}[-.]?\d{1,3}(?:\.\d{1,2})?[A-Z]?\b/g) || [];
      for (const t of m) { if (/^(IBC|ADA|NFPA|ICC|UL|R)\d/.test(t) && !/^[A-Z]{1,2}\d{3}$/.test(t)) continue; const s = l.fh * (l.x0 > 0.55 && l.y0 > 0.45 ? 1.8 : 1); if (s > score) { score = s; best = t; } }
    }
    return best;
  }

  /**
   * Builds the sheet set on the chosen template: each source page is placed (as vector, untouched) in the
   * template's drawing area, with the title block filled in. Returns the bytes and, per page, the drawing area
   * as fractions of the new page so finding boxes can be moved onto it.
   */
  async function buildTemplated(srcBytes, tpl, meta, custom) {
    const PL = await pdflib(), { PDFDocument, StandardFonts, rgb } = PL;
    const src = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.Helvetica), bold = await out.embedFont(StandardFonts.HelveticaBold);
    const emb = await out.embedPages(src.getPages());
    let bg = null, bgW = 0, bgH = 0;
    if (custom) {
      if (custom.kind === 'pdf') { const t = await PDFDocument.load(custom.bytes, { ignoreEncryption: true }); [bg] = await out.embedPages([t.getPage(0)]); bgW = bg.width; bgH = bg.height; }
      else { bg = custom.kind === 'png' ? await out.embedPng(custom.bytes) : await out.embedJpg(custom.bytes); const k = 2592 / Math.max(bg.width, bg.height); bgW = bg.width * k; bgH = bg.height * k; }
    }
    const ink = rgb(0.07, 0.09, 0.13), grey = rgb(0.38, 0.42, 0.48), green = rgb(0.03, 0.5, 0.22), red = rgb(0.85, 0.11, 0.11);
    const fit = (s, f, size, maxW) => { s = win(s); while (s.length > 1 && f.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -2) + '…'; return s; };
    const wrapT = (s, f, size, maxW, maxLines) => { const out2 = []; let cur = ''; win(s).split(/\s+/).forEach(w => { const t = cur ? cur + ' ' + w : w; if (f.widthOfTextAtSize(t, size) > maxW && cur) { out2.push(cur); cur = w; } else cur = t; }); if (cur) out2.push(cur); if (out2.length > maxLines) { out2.length = maxLines; out2[maxLines - 1] = fit(out2[maxLines - 1] + '…', f, size, maxW); } return out2; };
    const areas = [], date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    emb.forEach((ep, i) => {
      const n = i + 1, portrait = ep.height > ep.width;
      let W, H, tb;
      if (custom) { W = bgW; H = bgH; tb = custom.side === 'bottom' ? 'bottom' : 'right'; }
      else { W = tpl.w; H = tpl.h; tb = tpl.tb; if (portrait && tpl.flip) { W = tpl.h; H = tpl.w; } }
      const page = out.addPage([W, H]), U = Math.min(W, H) / 612; // 1 unit = Letter-size point
      const fixes = meta.byPage[n] || [], sheetNo = meta.sheets[n] || ('SK-' + n);
      let area;
      if (custom) {
        if (custom.kind === 'pdf') page.drawPage(bg, { x: 0, y: 0, width: W, height: H }); else page.drawImage(bg, { x: 0, y: 0, width: W, height: H });
        const m = Math.min(W, H) * 0.035;
        area = tb === 'right' ? { x: m, y: m, w: W * 0.8 - m * 1.5, h: H - 2 * m } : { x: m, y: H * 0.17, w: W - 2 * m, h: H * 0.83 - m };
        // A slim note across the top of the drawing area; the member's own title block is left untouched.
        const s = 7 * U, note = fit(`PROPOSED CORRECTIONS - PRELIMINARY, NOT FOR CONSTRUCTION  |  ${meta.title}  |  ${date}  |  DELTA 1-${meta.total} SEE INDEX`, bold, s, area.w - s);
        page.drawRectangle({ x: area.x, y: area.y + area.h - s * 1.9, width: bold.widthOfTextAtSize(note, s) + s, height: s * 1.9, color: rgb(1, 1, 1), opacity: 0.92 });
        page.drawText(note, { x: area.x + s / 2, y: area.y + area.h - s * 1.35, size: s, font: bold, color: green });
        area = { ...area, h: area.h - s * 2.2 };
      } else {
        const m = 18 * U, ml = 30 * U; // binding edge on the left
        page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
        page.drawRectangle({ x: ml, y: m, width: W - ml - m, height: H - 2 * m, borderColor: ink, borderWidth: 1.6 * U });
        if (tb === 'right') {
          const sw = Math.max(110 * U, (W - ml - m) * 0.105), sx = W - m - sw, top = H - m, pad = 6 * U, iw = sw - 2 * pad;
          page.drawLine({ start: { x: sx, y: m }, end: { x: sx, y: top }, thickness: 1.2 * U, color: ink });
          let y = top - pad;
          const rule = () => { y -= pad * 0.6; page.drawLine({ start: { x: sx, y }, end: { x: W - m, y }, thickness: 0.6 * U, color: ink }); y -= pad; };
          const txt = (s, size, f, col) => { page.drawText(fit(s, f, size, iw), { x: sx + pad, y: y - size, size, font: f, color: col || ink }); y -= size * 1.35; };
          txt('DRAWUP', 15 * U, bold, ink); txt(meta.by || 'Prepared with DrawUp Check', 6.5 * U, font, grey); rule();
          txt('PROJECT', 5.5 * U, bold, grey); wrapT(meta.title, bold, 9 * U, iw, 3).forEach(l => txt(l, 9 * U, bold)); if (meta.where) txt(meta.where, 7 * U, font, grey); rule();
          txt('REVISIONS', 5.5 * U, bold, grey);
          const maxRows = Math.max(3, Math.floor((y - m - 190 * U) / (7.2 * U * 2.7)));
          fixes.slice(0, maxRows).forEach(f => { const lines = wrapT(f.text, font, 6.2 * U, iw - 16 * U, 2); page.drawText(String(f.n), { x: sx + pad + 2 * U, y: y - 6.5 * U, size: 6.5 * U, font: bold, color: green }); page.drawRectangle({ x: sx + pad, y: y - 8.5 * U, width: 11 * U, height: 10 * U, borderColor: green, borderWidth: 0.7 * U, opacity: 0 }); lines.forEach((l, k) => page.drawText(l, { x: sx + pad + 16 * U, y: y - 6.5 * U - k * 7.4 * U, size: 6.2 * U, font, color: ink })); y -= Math.max(13 * U, lines.length * 7.4 * U + 5 * U); });
          if (fixes.length > maxRows) txt(`+${fixes.length - maxRows} more, see index`, 6 * U, font, grey);
          if (!fixes.length) txt('No corrections on this sheet', 6.2 * U, font, grey);
          // Bottom block: stamp, sheet title, date, sheet number.
          let by = m + pad;
          page.drawText(fit(sheetNo, bold, 26 * U, iw), { x: sx + pad, y: by, size: 26 * U, font: bold, color: ink }); by += 30 * U;
          page.drawLine({ start: { x: sx, y: by }, end: { x: W - m, y: by }, thickness: 0.6 * U, color: ink }); by += pad;
          [['SCALE', 'AS NOTED'], ['DATE', date], ['SHEET', 'PROPOSED CORRECTIONS']].forEach(([k, v]) => { page.drawText(fit(v, bold, 7 * U, iw), { x: sx + pad, y: by, size: 7 * U, font: bold, color: ink }); by += 8.5 * U; page.drawText(k, { x: sx + pad, y: by, size: 5.5 * U, font: bold, color: grey }); by += 10 * U; });
          page.drawLine({ start: { x: sx, y: by }, end: { x: W - m, y: by }, thickness: 0.6 * U, color: ink }); by += pad;
          const stH = 34 * U; page.drawRectangle({ x: sx + pad, y: by, width: iw, height: stH, borderColor: red, borderWidth: 1 * U });
          wrapT('PRELIMINARY - NOT FOR CONSTRUCTION. DrawUp Check guidance, not a sealed or permitted set.', bold, 6 * U, iw - 8 * U, 4).forEach((l, k) => page.drawText(l, { x: sx + pad + 4 * U, y: by + stH - 9 * U - k * 7.4 * U, size: 6 * U, font: bold, color: red }));
          area = { x: ml + 10 * U, y: m + 10 * U, w: sx - ml - 20 * U, h: H - 2 * m - 20 * U };
        } else {
          const sh = Math.max(56 * U, (H - 2 * m) * 0.13), sy = m, pad = 5 * U;
          page.drawLine({ start: { x: ml, y: sy + sh }, end: { x: W - m, y: sy + sh }, thickness: 1.2 * U, color: ink });
          const cols = [0.16, 0.3, 0.32, 0.22], x0s = []; let acc = ml; const tw = W - ml - m; cols.forEach(c => { x0s.push(acc); acc += tw * c; });
          x0s.slice(1).forEach(x => page.drawLine({ start: { x, y: sy }, end: { x, y: sy + sh }, thickness: 0.6 * U, color: ink }));
          const cell = (k, label, lines, size, f, col) => { const x = x0s[k] + pad, w2 = tw * cols[k] - 2 * pad; page.drawText(label, { x, y: sy + sh - pad - 5.5 * U, size: 5.5 * U, font: bold, color: grey }); lines.forEach((l, j) => page.drawText(fit(l, f, size, w2), { x, y: sy + sh - pad - 7 * U - (j + 1) * size * 1.25, size, font: f, color: col || ink })); };
          cell(0, 'DRAWUP', [meta.by || 'Prepared with DrawUp Check'], 6.5 * U, font, grey);
          cell(1, 'PROJECT', [...wrapT(meta.title, bold, 8 * U, tw * cols[1] - 2 * pad, 2), meta.where || ''].filter(Boolean), 8 * U, bold);
          const revLines = fixes.length ? fixes.slice(0, 4).map(f => f.n + '  ' + f.text) : ['No corrections on this sheet']; if (fixes.length > 4) revLines.push(`+${fixes.length - 4} more, see index`);
          cell(2, 'REVISIONS (PRELIMINARY - NOT FOR CONSTRUCTION)', revLines, 6 * U, font, fixes.length ? green : grey);
          cell(3, 'SHEET', [], 0, font);
          page.drawText(fit(sheetNo, bold, 20 * U, tw * cols[3] - 2 * pad), { x: x0s[3] + pad, y: sy + pad + 12 * U, size: 20 * U, font: bold, color: ink });
          page.drawText(fit(`PROPOSED CORRECTIONS  |  ${date}`, font, 6 * U, tw * cols[3] - 2 * pad), { x: x0s[3] + pad, y: sy + pad, size: 6 * U, font, color: grey });
          area = { x: ml + 8 * U, y: sy + sh + 8 * U, w: W - ml - m - 16 * U, h: H - m - sy - sh - 16 * U };
        }
      }
      // Place the original page, untouched and to scale, centred in the drawing area.
      const k = Math.min(area.w / ep.width, area.h / ep.height), dw = ep.width * k, dh = ep.height * k;
      const dx = area.x + (area.w - dw) / 2, dy = area.y + (area.h - dh) / 2;
      page.drawPage(ep, { x: dx, y: dy, width: dw, height: dh });
      areas.push({ x: dx / W, y: 1 - (dy + dh) / H, w: dw / W, h: dh / H }); // top-left fractions, like finding boxes
    });
    return { bytes: await out.save(), areas };
  }
  const moveBox = (b, a) => b ? { x: a.x + b.x * a.w, y: a.y + b.y * a.h, w: b.w * a.w, h: b.h * a.h } : b;

  /* ====================================================================== source files -> one PDF + page images */
  async function imageToJpeg(file, maxPx) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`${file.name} could not be read as an image. Use PNG, JPG or PDF.`)); i.src = url; });
      const k = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement('canvas');
      cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
      return new Uint8Array(await blob.arrayBuffer());
    } finally { URL.revokeObjectURL(url); }
  }
  const isPdf = f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
  const isImg = f => /^image\/(png|jpeg|webp|gif|bmp)$/.test(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name);
  /** One PDF from everything chosen: a single PDF is used as is (never altered); images become pages. */
  async function sourcePdf(files) {
    if (files.length === 1 && isPdf(files[0])) return new Uint8Array(await files[0].arrayBuffer());
    const PL = await pdflib(), doc = await PL.PDFDocument.create();
    for (const f of files) {
      if (isPdf(f)) { const d = await PL.PDFDocument.load(new Uint8Array(await f.arrayBuffer()), { ignoreEncryption: true }); (await doc.copyPages(d, d.getPageIndices())).forEach(p => doc.addPage(p)); continue; }
      const raw = new Uint8Array(await f.arrayBuffer());
      let img;
      if (f.type === 'image/png' || /\.png$/i.test(f.name)) { try { img = await doc.embedPng(raw); } catch (_e) { img = null; } }
      else if (f.type === 'image/jpeg' || /\.jpe?g$/i.test(f.name)) { try { img = await doc.embedJpg(raw); } catch (_e) { img = null; } }
      if (!img || Math.max(img.width, img.height) > 7000) img = await doc.embedJpg(await imageToJpeg(f, 6000));
      // 150 dpi feels like a printed sheet; tiny images still get a usable page.
      const k = Math.max(72 / 150, 792 / Math.max(img.width, img.height)), pg = doc.addPage([img.width * k, img.height * k]);
      pg.drawImage(img, { x: 0, y: 0, width: img.width * k, height: img.height * k });
    }
    return new Uint8Array(await doc.save());
  }
  async function renderPage(pdfDoc, n, longPx) {
    const pg = await pdfDoc.getPage(n), vp0 = pg.getViewport({ scale: 1 }), s = longPx / Math.max(vp0.width, vp0.height), vp = pg.getViewport({ scale: s });
    const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    return cv;
  }
  const jpeg = (cv, q) => cv.toDataURL('image/jpeg', q || 0.82);
  /** Full page plus (for small sets) four overlapping close-up quarters so small sheet text is legible. */
  async function pageImages(pdfDoc, onStep) {
    const out = [], tiles = pdfDoc.numPages <= TILE_PAGES;
    for (let n = 1; n <= pdfDoc.numPages; n++) {
      onStep(n);
      const big = await renderPage(pdfDoc, n, tiles ? TILE_PX : FULL_PX);
      let full = big;
      if (tiles) { full = document.createElement('canvas'); const k = FULL_PX / Math.max(big.width, big.height); full.width = Math.round(big.width * k); full.height = Math.round(big.height * k); full.getContext('2d').drawImage(big, 0, 0, full.width, full.height); }
      const page = { image: jpeg(full), tiles: [] };
      if (tiles) {
        const W = big.width, H = big.height, ov = 0.06, tw = Math.round(W * (0.5 + ov)), th = Math.round(H * (0.5 + ov));
        [['top-left quarter', 0, 0], ['top-right quarter', W - tw, 0], ['bottom-left quarter', 0, H - th], ['bottom-right quarter', W - tw, H - th]].forEach(([label, x, y]) => {
          const t = document.createElement('canvas'); t.width = tw; t.height = th; t.getContext('2d').drawImage(big, x, y, tw, th, 0, 0, tw, th); page.tiles.push({ label, image: jpeg(t, 0.8) });
        });
      }
      out.push(page);
    }
    return out;
  }

  /* ====================================================================== custom template */
  async function customTemplate(c) {
    const saved = lsGet(LS_CUSTOM); if (!saved || !saved.path) return null;
    if (customTemplate._cache && customTemplate._cache.path === saved.path) return customTemplate._cache;
    const { data, error } = await c.client.storage.from(BUCKET).download(saved.path); if (error) return null;
    const bytes = new Uint8Array(await data.arrayBuffer());
    customTemplate._cache = { ...saved, bytes };
    return customTemplate._cache;
  }

  /* ====================================================================== streamed items */
  function itemsFrom(text) {
    const out = []; const re = /"severity"\s*:\s*"(critical|major|minor|info)"/g; let m;
    const field = (seg, k) => { const x = seg.match(new RegExp('"' + k + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"')); if (!x) return ''; try { return JSON.parse('"' + x[1] + '"'); } catch (_e) { return x[1]; } };
    while ((m = re.exec(text))) { const seg = text.slice(m.index, m.index + 4000).split(/"severity"\s*:/).slice(0, 2).join('"severity":'); const issue = field(seg, 'issue'); if (!issue) continue; out.push({ severity: m[1], sheet: field(seg, 'sheet'), issue, why: field(seg, 'why'), recommendation: field(seg, 'recommendation') }); }
    return out;
  }

  /* ====================================================================== UI */
  function mount(w, c) {
    if ($q(w, '.du-qk23')) return;
    let tplId = lsGet(LS_TPL) || 'drawup-d';
    if (!TEMPLATES.some(t => t.id === tplId)) tplId = 'drawup-d';
    const card = document.createElement('article');
    card.className = 'du-glass du-qk23';
    card.innerHTML = `<span class="du-kicker">QUICK CHECK · JUST THIS STEP</span>
      <h2>Upload a drawing. See what's wrong and how it should look.</h2>
      <p class="du-muted">An image, PNG, JPG or PDF set, up to ${MAX_PAGES} pages. DrawUp reads it, explains each problem, then shows the fix drawn on the sheet template you pick. Your file is never changed.</p>
      <label class="du-qk23-drop" for="qk-file"><input type="file" id="qk-file" multiple accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"><b>Choose files</b><span class="du-qk23-files">or drop them here</span></label>
      <div class="du-field"><label>Show the fix on</label><div class="du-qk23-tpls" role="radiogroup" aria-label="Sheet template">${TEMPLATES.map(t => `<button type="button" role="radio" class="du-qk23-tpl" data-tpl="${t.id}" aria-checked="${t.id === tplId}">${thumb(t)}<b>${esc(t.name)}</b><small>${esc(t.sub)}</small></button>`).join('')}</div></div>
      <div class="du-qk23-custom" hidden><div class="du-two"><div class="du-field"><label for="qk-tplfile">Your blank sheet with title block (PDF, PNG or JPG)</label><input type="file" id="qk-tplfile" accept="application/pdf,.pdf,image/png,image/jpeg,.png,.jpg,.jpeg"></div><div class="du-field"><label for="qk-side">Title block is on the</label><select id="qk-side"><option value="right">Right side</option><option value="bottom">Bottom</option></select></div></div><small class="du-muted du-qk23-cst"></small></div>
      <details class="du-qk23-more"><summary>Add details (optional)</summary><div class="du-field"><label for="qk-title">Title</label><input id="qk-title" placeholder="e.g. Playhouse · 05 Architecture"></div><div class="du-two"><div class="du-field"><label for="qk-jur">Project location</label><input id="qk-jur" placeholder="e.g. Henrico, VA"></div><div class="du-field"><label for="qk-type">Building / occupancy type</label><input id="qk-type" placeholder="e.g. A-3, B business"></div></div></details>
      <p class="du-qk23-go"><button type="button" class="du-btn primary" id="qk-go">Check it</button> <span class="du-save-status" id="qk-st" aria-live="polite"></span></p>
      <small class="du-muted">30 credits up to 10 pages, 150 for 11 or 12. Refunded if it does not finish. Guidance for the design team, not a permit approval.</small>
      <div class="du-qk23-out" hidden></div>`;
    const anchor = $q(w, '.du-ck22-start') || $q(w, '.du-work-head');
    if (anchor && anchor.parentNode) { if (anchor.classList.contains('du-work-head')) anchor.after(card); else anchor.before(card); } else w.prepend(card);

    const fileIn = $q(card, '#qk-file'), drop = $q(card, '.du-qk23-drop');
    let files = [];
    const setFiles = list => {
      files = [...list].filter(f => isPdf(f) || isImg(f));
      const bad = [...list].length - files.length;
      $q(card, '.du-qk23-files').textContent = files.length ? files.map(f => f.name).join(', ') + (bad ? ` (${bad} skipped: not PDF or image)` : '') : (bad ? 'Those files are not PDF or images.' : 'or drop them here');
      drop.classList.toggle('has', !!files.length);
    };
    fileIn.onchange = () => setFiles(fileIn.files);
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) setFiles(e.dataTransfer.files); });

    const cst = $q(card, '.du-qk23-cst'), side = $q(card, '#qk-side');
    const showCustom = () => { const s = lsGet(LS_CUSTOM); cst.textContent = s && s.name ? `Saved template: ${s.name}. Upload another to replace it.` : 'Upload it once; DrawUp remembers it for next time.'; if (s && s.side) side.value = s.side; };
    const pickTpl = id => { tplId = id; lsSet(LS_TPL, id); card.querySelectorAll('[data-tpl]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.tpl === id))); $q(card, '.du-qk23-custom').hidden = id !== 'custom'; if (id === 'custom') showCustom(); };
    card.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => pickTpl(b.dataset.tpl));
    pickTpl(tplId);
    side.onchange = () => { const s = lsGet(LS_CUSTOM); if (s) lsSet(LS_CUSTOM, { ...s, side: side.value }); };
    $q(card, '#qk-tplfile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const kind = isPdf(f) ? 'pdf' : /png$/i.test(f.type) || /\.png$/i.test(f.name) ? 'png' : /jpe?g$/i.test(f.type) || /\.jpe?g$/i.test(f.name) ? 'jpg' : null;
      if (!kind) { cst.textContent = 'Use a PDF, PNG or JPG for the template.'; return; }
      cst.textContent = 'Saving your template…';
      try {
        const path = `${c.user.id}/check/template-v23-${Date.now()}.${kind}`;
        const up = await c.client.storage.from(BUCKET).upload(path, f, { contentType: kind === 'pdf' ? 'application/pdf' : 'image/' + (kind === 'jpg' ? 'jpeg' : 'png'), upsert: true }); if (up.error) throw up.error;
        lsSet(LS_CUSTOM, { path, kind, name: f.name, side: side.value }); customTemplate._cache = null; showCustom();
      } catch (er) { cst.textContent = 'The template could not be saved: ' + (er.message || er); }
    };

    $q(card, '#qk-go').onclick = () => run(card, c, files, tplId);
    if (/[?&]quick=1/.test(location.hash)) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
  }

  async function run(card, c, files, tplId) {
    const st = $q(card, '#qk-st'), btn = $q(card, '#qk-go'), out = $q(card, '.du-qk23-out');
    if (!files.length) { c.toast('Choose an image, PNG or PDF first.', true); return; }
    if (files.some(f => f.size > 32 * 1024 * 1024)) { c.toast('Each file must be 32 MB or smaller.', true); return; }
    const tpl = TEMPLATES.find(t => t.id === tplId) || TEMPLATES[0];
    let custom = null;
    if (tpl.custom) { custom = await customTemplate(c).catch(() => null); if (!custom) { c.toast('Upload your template sheet first, or pick a DrawUp template.', true); return; } custom.side = $q(card, '#qk-side').value; }
    btn.disabled = true;
    const t0 = Date.now(); let timer = 0, phase = 'Preparing…';
    const tick = () => { st.textContent = ` ${phase} ${Math.floor((Date.now() - t0) / 1000)}s`; };
    timer = setInterval(tick, 500);
    const say = p => { phase = p; tick(); };
    out.hidden = false;
    out.innerHTML = `<ol class="du-qk23-steps"><li class="on"><span>01</span>Find the flaws</li><li><span>02</span>Understand the fix</li><li><span>03</span>On your template</li></ol>
      <section class="du-qk23-s1"><h3>What's wrong</h3><ul class="du-qk23-live"><li class="du-muted">Reading your pages…</li></ul></section>
      <section class="du-qk23-s2" hidden><h3>Understand the fix</h3><div class="du-qk23-fixes"></div></section>
      <section class="du-qk23-s3" hidden><h3>How it should look on ${esc(tpl.custom ? 'your template' : tpl.name + ' (' + tpl.sub + ')')}</h3><div class="du-qk23-vbar"></div><div class="du-qk23-sheets"><div class="du-loading">DRAWING THE FIXES ON YOUR TEMPLATE…</div></div><div class="du-qk23-dl"></div></section>`;
    const live = $q(out, '.du-qk23-live');
    const step = k => out.querySelectorAll('.du-qk23-steps li').forEach((li, i) => li.classList.toggle('on', i <= k));
    try {
      say('Reading your files…');
      const src = await sourcePdf(files);
      const L = await pdfjs();
      const pdfDoc = await L.getDocument({ data: src.slice(0), isEvalSupported: false }).promise;
      if (pdfDoc.numPages > MAX_PAGES) throw new Error(`This set has ${pdfDoc.numPages} pages. Quick check reads up to ${MAX_PAGES}; use the full check below for bigger sets, or split it.`);
      const id = uuid(), path = `${c.user.id}/check/${id}.pdf`;
      const title = $q(card, '#qk-title').value.trim() || files[0].name.replace(/\.(pdf|png|jpe?g|webp|gif|bmp)$/i, '') + (files.length > 1 ? ` + ${files.length - 1} more` : '');
      // Upload + save the row while the pages render.
      const saveRow = (async () => {
        const up = await c.client.storage.from(BUCKET).upload(path, new Blob([src], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: false }); if (up.error) throw up.error;
        const row = { id, owner_id: c.user.id, title, file_path: path, file_name: files.length === 1 ? files[0].name : files.length + ' files', file_size: src.byteLength, jurisdiction: $q(card, '#qk-jur').value.trim() || null, building_type: $q(card, '#qk-type').value.trim() || null, focus: ['code', 'accessibility', 'life_safety', 'coordination', 'dimensions', 'documentation'] };
        const ins = await c.client.from('check_reviews').insert(row).select('id').single(); if (ins.error) throw ins.error;
      })();
      const layer = await X.readLayer(src).catch(() => null);
      const pages = await pageImages(pdfDoc, n => say(`Preparing page ${n} of ${pdfDoc.numPages}…`));
      const page_text = layer ? layer.pages.map(p => ({ page: p.n, text: p.lines.map(l => l.s).join(' | ').replace(/\s+/g, ' ').slice(0, 3000) })) : null;
      await saveRow;
      say('Reading the sheets…');
      const token = await c.token();
      const res = await fetch('/api/check/quick', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ review_id: id, pages, page_text, template: { id: tpl.id, name: tpl.custom ? 'My template' : tpl.name } }) });
      if (!res.ok || !res.body) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'The check could not start (' + res.status + ').'); }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '', text = '', review = null, err = '';
      const paintLive = () => {
        const its = itemsFrom(text);
        if (its.length) { say(`Writing findings · ${its.length} so far ·`); live.innerHTML = its.map(i => `<li class="du-sev-${i.severity}"><span class="du-status-pill" data-state="${i.severity}">${i.severity.toUpperCase()}</span> <b>${esc(i.sheet || '')}</b> ${esc(i.issue)}</li>`).join(''); }
      };
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let k;
        while ((k = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, k); buf = buf.slice(k + 1); if (!line.trim()) continue;
          let e; try { e = JSON.parse(line); } catch (_e) { continue; }
          if (e.t === 'delta') { text += e.d; paintLive(); }
          else if (e.t === 'done') review = e.review;
          else if (e.t === 'error') { err = e.error; review = e.review || null; }
        }
      }
      if (!review || review.status !== 'complete') throw new Error(err || 'The connection closed before the answer was saved. If it finished, it is in Your checks; otherwise you were refunded.');
      clearInterval(timer); st.textContent = ` Done in ${Math.round((Date.now() - t0) / 1000)}s.`;
      await showResult(out, c, review, src, layer, tpl, custom, step);
    } catch (e) {
      clearInterval(timer); st.textContent = ' ' + (e.message || e);
      if (live && !live.querySelector('.du-sev-critical,.du-sev-major,.du-sev-minor,.du-sev-info')) live.innerHTML = `<li class="du-muted">${esc(e.message || e)}</li>`;
    } finally { clearInterval(timer); btn.disabled = false; }
  }

  async function showResult(out, c, review, src, layer, tpl, custom, step) {
    const findings = (review.findings || []).slice().sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity));
    const live = $q(out, '.du-qk23-live');
    live.innerHTML = findings.length ? findings.map((f, i) => `<li class="du-sev-${f.severity}"><span class="du-status-pill" data-state="${f.severity}">${f.severity.toUpperCase()}</span> <b>${i + 1}. ${esc(f.sheet || '')}</b> ${esc(f.issue)}</li>`).join('') : '<li>No problems were found on these pages.</li>';
    if (review.notice) live.insertAdjacentHTML('beforebegin', `<div class="du-ck22-notice" role="status">${esc(review.notice)}</div>`);
    if (review.summary) live.insertAdjacentHTML('afterend', `<p class="du-qk23-sum">${esc(review.summary.split(/\n\n/)[0])}</p>`);
    step(1);
    const s2 = $q(out, '.du-qk23-s2'); s2.hidden = !findings.length;
    $q(out, '.du-qk23-fixes').innerHTML = findings.map((f, i) => `<div class="du-finding du-sev-${f.severity}"><div class="du-finding-head"><span class="du-qk23-delta">${i + 1}</span><span class="du-status-pill" data-state="${f.severity}">${f.severity.toUpperCase()}</span><b>${esc(f.sheet || 'Sheet ?')}</b><small>${esc(f.location || '')}</small></div><p><b>What's wrong:</b> ${esc(f.issue)}</p>${f.why ? `<p><b>Why it matters:</b> ${esc(f.why)}</p>` : ''}${f.recommendation ? `<p><b>The fix:</b> ${esc(f.recommendation)}</p>` : ''}${f.reference ? `<p class="du-muted"><b>Reference:</b> ${esc(f.reference)}</p>` : ''}</div>`).join('');
    const s3 = $q(out, '.du-qk23-s3'); s3.hidden = false; step(2);
    const sheetsEl = $q(out, '.du-qk23-sheets'), dl = $q(out, '.du-qk23-dl'), vbar = $q(out, '.du-qk23-vbar');
    try {
      const pages = layer ? layer.pages : [];
      const sheets = {}; pages.forEach(p => { sheets[p.n] = sheetOf(p); });
      const byPage = {};
      findings.forEach((f, i) => { const p = f.page && f.page <= (pages.length || 99) ? f.page : 1; (byPage[p] = byPage[p] || []).push({ n: i + 1, text: f.recommendation || f.issue }); if (!sheets[p] && /^[A-Z]{1,3}[-.]?\d/.test(f.sheet || '')) sheets[p] = f.sheet; });
      const meta = { title: review.title || 'Drawing check', where: review.jurisdiction || '', by: '', byPage, sheets, total: findings.length };
      const tplt = await buildTemplated(src, tpl, meta, custom);
      // Move every box onto the template's drawing area, then place clouds and fixes there.
      const moved = findings.map(f => { const p = f.page && tplt.areas[f.page - 1] ? f.page : 1, a = tplt.areas[p - 1]; return { ...f, page: p, box: moveBox(f.box, a), fix: f.fix ? { ...f.fix, box: moveBox(f.fix.box, a) } : f.fix }; });
      const tLayer = await X.readLayer(tplt.bytes);
      const pls = await X.locateAll(moved, tLayer);
      const finalBytes = await X.buildMarkupPdf(tplt.bytes, pls, { fixes: true, title: review.title, file: review.file_name });
      const L = await pdfjs(), fin = await L.getDocument({ data: finalBytes.slice(0), isEvalSupported: false }).promise;
      const occ = await fin.getOptionalContentConfig();
      const groups = occ.getGroups ? occ.getGroups() || {} : {};
      const gid = name => Object.keys(groups).find(k => groups[k] && String(groups[k].name || '').indexOf(name) >= 0);
      const gR = gid('Redlines'), gF = gid('Proposed fixes');
      let view = 'fixed', zoomed = false;
      vbar.innerHTML = `<div class="du-qk23-seg" role="radiogroup" aria-label="Show">${[['fixed', 'Corrected'], ['both', 'Redlines + fixes'], ['orig', 'Original']].map(([k, l]) => `<button type="button" role="radio" data-view="${k}" aria-checked="${k === view}">${l}</button>`).join('')}</div> <button type="button" class="du-btn ghost du-qk23-zoom" aria-pressed="false">Zoom in</button>`;
      const nSheets = tplt.areas.length;
      sheetsEl.innerHTML = Array.from({ length: nSheets }, (_v, i) => `<figure class="du-qk23-pg"><canvas data-page="${i + 1}"></canvas><figcaption>${esc(sheets[i + 1] || 'Page ' + (i + 1))} · ${(byPage[i + 1] || []).length} fix${(byPage[i + 1] || []).length === 1 ? '' : 'es'}</figcaption></figure>`).join('');
      const paint = async () => {
        if (gR) occ.setVisibility(gR, view === 'both');
        if (gF) occ.setVisibility(gF, view !== 'orig');
        for (const cv of sheetsEl.querySelectorAll('canvas')) {
          const pg = await fin.getPage(+cv.dataset.page), vp0 = pg.getViewport({ scale: 1 });
          const want = Math.min(zoomed ? 4800 : 2400, Math.max(600, Math.round(sheetsEl.clientWidth * (zoomed ? 2.2 : 1) * Math.min(2, window.devicePixelRatio || 1))));
          const vp = pg.getViewport({ scale: want / vp0.width }); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
          const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
          await pg.render({ canvasContext: ctx, viewport: vp, optionalContentConfigPromise: Promise.resolve(occ) }).promise;
        }
      };
      vbar.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view; vbar.querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-checked', String(x === b))); paint(); });
      $q(vbar, '.du-qk23-zoom').onclick = e => { zoomed = !zoomed; sheetsEl.classList.toggle('zoom', zoomed); e.currentTarget.setAttribute('aria-pressed', String(zoomed)); e.currentTarget.textContent = zoomed ? 'Fit to width' : 'Zoom in'; paint(); };
      await paint();
      const base = slug(review.title);
      dl.innerHTML = `<button type="button" class="du-btn primary" data-dl="tpl">Download on template (PDF)</button> <button type="button" class="du-btn ghost" data-dl="orig">Marked-up original (PDF)</button> <button type="button" class="du-btn ghost" data-dl="open">Open full review</button> <span class="du-save-status" aria-live="polite"></span>`;
      const dst = $q(dl, '.du-save-status');
      $q(dl, '[data-dl="tpl"]').onclick = () => download(base + '-on-template-PRELIMINARY.pdf', finalBytes, 'application/pdf');
      $q(dl, '[data-dl="orig"]').onclick = async e => { e.target.disabled = true; dst.textContent = ' Building…'; try { const ol = layer || await X.readLayer(src); const p2 = await X.locateAll(findings.map(f => ({ ...f })), ol); download(base + '-redlines-proposed-fixes-PRELIMINARY.pdf', await X.buildMarkupPdf(src, p2, { fixes: true, title: review.title, file: review.file_name }), 'application/pdf'); dst.textContent = ''; } catch (er) { dst.textContent = ' ' + (er.message || er); } finally { e.target.disabled = false; } };
      $q(dl, '[data-dl="open"]').onclick = () => { history.replaceState(null, '', '#portal/check?id=' + review.id); c.openPortalTab('check'); };
    } catch (e) {
      sheetsEl.innerHTML = `<p class="du-muted">The template view could not be drawn: ${esc(e.message || e)}. The findings above are saved in Your checks.</p>`;
    }
  }

  /* ====================================================================== hook into the Check tab */
  const orig = X.route;
  X.route = async (w, c, params, ctx) => {
    const ok = await orig(w, c, params, ctx);
    if (ok && !params.get('id')) { try { mount(w, c); } catch (e) { console.warn('quick check', e); } }
    return ok;
  };
  X.quick = { buildTemplated, sourcePdf, TEMPLATES };
})();
