/* DrawUp "Draw it up": picture in, drawing set out (v24, revisions + redlines in v25).
 * - Upload a photo, rendering, sketch, AI image or drawing (PNG / JPG / WebP / PDF pages, up to 6) and pick
 *   Preliminary (schematic), Full set, or Explore (3 design directions, develop one into a full set for free).
 * - /api/drawings/generate returns ONE building model; drawup-drawit-sheets-v24.js draws every sheet from it.
 * - Each page shows on its own, opens full size, downloads as SVG / PNG / PDF, and "Combine into PDF set" makes one PDF.
 * - v25: pin comments on any sheet (or add general notes / next steps / project to-dos), press Regenerate: the AI fixes
 *   what was marked and keeps the rest; the previous set is kept as the prior revision and the changes are clouded in
 *   red (pixel compare of the two renders). Views: Clean set, Redlines, My markups; each downloads as a PDF set.
 * - Saved in drawing_generations (SQL v24-02 + 0065); project to-dos in project_todos (0065).
 * Used by: Arch Coach tab (Draw it up mode), Projects tab, project pages (Redlines + revisions, project to-dos),
 * and the AI Design Team chat through open() / latest().
 * window.DrawUpDrawIt = { mount, recent, quickAccess, openInCoach, open, latest, sideLinks, readPictures, imageToJpeg }
 */
(function () {
  'use strict';
  if (window.DrawUpDrawIt) return;
  const BUCKET = 'drawup-private';
  const PDFJS = '/vendor/pdfjs-3.11.174/pdf.min.js', PDFJS_WORKER = '/vendor/pdfjs-3.11.174/pdf.worker.min.js', PDFLIB = '/vendor/pdf-lib-1.17.1.min.js';
  const MAX_FILES = 6, MAX_PX = 1800;
  const STATUSES = ['Preliminary', 'For review', 'For permit', 'Issued for construction'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = () => window.DrawUpPortal;
  const C = () => P()?.ctx?.() || {};
  const sb = () => C().client || window.drawupSupabaseClient;
  const toast = (m, bad) => (C().toast ? C().toast(m, bad) : console[bad ? 'warn' : 'log'](m));
  const uuid = () => (crypto.randomUUID && crypto.randomUUID()) || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); });
  const slug = t => String(t || 'drawup-set').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'drawup-set';
  const loaded = {};
  const loadScript = src => loaded[src] || (loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Could not load ' + src)); }; document.head.appendChild(s); }));
  async function pdfjs() { if (!window.pdfjsLib) await loadScript(PDFJS); window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return window.pdfjsLib; }
  async function pdflib() { if (!window.PDFLib) await loadScript(PDFLIB); return window.PDFLib; }
  function save(name, data, type) { const blob = data instanceof Blob ? data : new Blob([data], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
  const blobToDataUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b); });
  const token = async () => (await sb()?.auth.getSession())?.data?.session?.access_token || '';

  /* ------------------------------------------------------------------ input pictures */
  async function imageToJpeg(src, max = MAX_PX) {
    const img = new Image(); img.decoding = 'async';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('That picture could not be read.')); img.src = src; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86);
  }
  /** Files -> [{name, dataUrl}] (PDF pages rendered with pdf.js). */
  async function readPictures(files) {
    const out = [];
    for (const f of files) {
      if (out.length >= MAX_FILES) break;
      if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
        const L = await pdfjs(), doc = await L.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
        for (let n = 1; n <= doc.numPages && out.length < MAX_FILES; n++) {
          const page = await doc.getPage(n), v0 = page.getViewport({ scale: 1 }), k = MAX_PX / Math.max(v0.width, v0.height), v = page.getViewport({ scale: k });
          const c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
          const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
          await page.render({ canvasContext: x, viewport: v }).promise;
          out.push({ name: `${f.name} p.${n}`, dataUrl: c.toDataURL('image/jpeg', 0.86) });
        }
      } else if (/^image\//.test(f.type)) {
        const url = URL.createObjectURL(f);
        try { out.push({ name: f.name, dataUrl: await imageToJpeg(url) }); } finally { URL.revokeObjectURL(url); }
      } else throw new Error(`${f.name}: use a PNG, JPG, WebP or PDF.`);
    }
    return out;
  }

  /* ------------------------------------------------------------------ rendering to images + PDF */
  const svgUrl = svg => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  async function svgToCanvas(svg, pxW) {
    const url = svgUrl(svg), img = new Image();
    try {
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('A sheet could not be drawn.')); img.src = url; });
      const c = document.createElement('canvas'); c.width = pxW; c.height = Math.round(pxW * 2 / 3);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally { URL.revokeObjectURL(url); }
  }
  // Browsers cap a canvas at about 16 million pixels on phones, so the sheet resolution adapts.
  const sheetPx = inchesW => Math.round(inchesW * Math.min(inchesW > 20 ? 150 : 250, Math.sqrt(16e6 / (inchesW * inchesW * 2 / 3))));
  async function sheetsToPdf(sheets, size, title, onStep) {
    const L = await pdflib(), doc = await L.PDFDocument.create();
    doc.setTitle(title); doc.setCreator('DrawUp'); doc.setProducer('DrawUp Draw it up');
    const inW = size === 'tabloid' ? 17 : 36, inH = size === 'tabloid' ? 11 : 24;
    for (let i = 0; i < sheets.length; i++) {
      onStep?.(i + 1, sheets.length);
      const c = await svgToCanvas(sheets[i].svg, sheetPx(inW));
      const bytes = await new Promise(res => c.toBlob(b => b.arrayBuffer().then(a => res(new Uint8Array(a))), 'image/jpeg', 0.9));
      c.width = c.height = 0;
      const jpg = await doc.embedJpg(bytes), page = doc.addPage([inW * 72, inH * 72]);
      page.drawImage(jpg, { x: 0, y: 0, width: inW * 72, height: inH * 72 });
      if (size === 'tabloid') page.drawText('HALF SIZE: SCALES SHOWN ARE FOR 24 x 36 SHEETS', { x: 24, y: 6, size: 6 });
    }
    return doc.save();
  }

  /* ------------------------------------------------------------------ saved sets */
  async function sourceDataUrl(path) {
    try { const { data } = await sb().storage.from(BUCKET).createSignedUrl(path, 600); if (!data?.signedUrl) return ''; const b = await (await fetch(data.signedUrl)).blob(); return await blobToDataUrl(b); } catch (_e) { return ''; }
  }

  /* ------------------------------------------------------------------ v25: modes, revisions, redlines, markups */
  const MODE = {
    preliminary: { label: 'Preliminary', cost: 20, sub: 'Plans, elevations + sections. For school projects, competitions and brainstorming.', level: 'preliminary' },
    full: { label: 'Full set', cost: 40, sub: 'Adds the code analysis, wall + opening details, framing and schedules.', level: 'full' },
    explore: { label: 'Explore options', cost: 50, sub: '3 different design directions to compare. Develop the one you like into a full set at no extra cost.', level: 'preliminary' },
  };
  const REVISE_COST = 25;
  const levelOf = gen => (gen?.mode === 'preliminary' || gen?.mode === 'explore' ? 'preliminary' : gen?.mode === 'full' ? 'full' : 'standard');
  const levelName = { preliminary: 'PRELIMINARY SET', full: 'FULL SET', standard: 'DRAWING SET' };
  const RED = '#d0021b';
  let pending = null; // intent from open(), picked up by the next mount

  /** Saved sets for the signed-in member. Falls back to the v24 columns until the v25 SQL is run. */
  async function listSets(opts = {}) {
    const c = sb(), u = C().user; if (!c || !u) return [];
    const run = cols => { let q = c.from('drawing_generations').select(cols).eq('owner_id', u.id).order('created_at', { ascending: false }).limit(opts.limit || 12); if (opts.projectId) q = q.eq('project_thread_id', opts.projectId); return q; };
    let { data, error } = await run('id,title,created_at,project_thread_id,issue_status,details_needed,mode,revision,root_id,parent_id,changes,next_steps,markups,model->footprint,model->stories');
    if (error && /column|mode|revision|markups/i.test(error.message) && !/drawing_generations" does not exist/i.test(error.message)) ({ data, error } = await run('id,title,created_at,project_thread_id,issue_status,details_needed,model->footprint,model->stories'));
    if (error) { if (/drawing_generations|schema cache|does not exist/i.test(error.message)) return { missing: true }; throw error; }
    return data || [];
  }
  /** Scalloped revision cloud around a box (sheet units), drawn clockwise so the scallops bulge outward. */
  function cloud(x, y, w, h, r = 16) {
    const seg = (len) => Math.max(1, Math.round(len / (r * 2)));
    let d = `M${x} ${y}`; const nx = seg(w), ny = seg(h), sx = w / nx, sy = h / ny;
    for (let i = 0; i < nx; i++) d += ` a${r} ${r} 0 0 1 ${sx.toFixed(1)} 0`;
    for (let i = 0; i < ny; i++) d += ` a${r} ${r} 0 0 1 0 ${sy.toFixed(1)}`;
    for (let i = 0; i < nx; i++) d += ` a${r} ${r} 0 0 1 ${(-sx).toFixed(1)} 0`;
    for (let i = 0; i < ny; i++) d += ` a${r} ${r} 0 0 1 0 ${(-sy).toFixed(1)}`;
    return `<path d="${d}z" fill="none" stroke="${RED}" stroke-width="4"/>`;
  }
  const delta = (x, y, n) => `<polygon points="${x - 20},${y + 16} ${x + 20},${y + 16} ${x},${y - 20}" fill="#fff" stroke="${RED}" stroke-width="3"/><text x="${x}" y="${y + 11}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" text-anchor="middle" fill="${RED}">${esc(n)}</text>`;
  /** Boxes (sheet units) where two renders of a sheet differ, outside the title block. */
  async function changedBoxes(oldSvg, newSvg) {
    const W = 1200, H = 800, k = 3600 / W, cell = 8;
    const [a, b] = await Promise.all([svgToCanvas(oldSvg, W), svgToCanvas(newSvg, W)]);
    const A = a.getContext('2d').getImageData(0, 0, W, H).data, B = b.getContext('2d').getImageData(0, 0, W, H).data; a.width = b.width = 0;
    const gw = Math.ceil(W / cell), gh = Math.ceil(H / cell), hit = new Uint16Array(gw * gh), tb = Math.floor(3125 / k), foot = Math.floor(2330 / k);
    for (let y = 0; y < foot; y++) for (let x = 0; x < tb; x++) { const i = (y * W + x) * 4; if (Math.abs(A[i] + A[i + 1] + A[i + 2] - B[i] - B[i + 1] - B[i + 2]) > 90) hit[((y / cell) | 0) * gw + ((x / cell) | 0)]++; }
    const on = new Uint8Array(gw * gh), R = 3;
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) if (hit[gy * gw + gx] > 1) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const yy = gy + dy, xx = gx + dx; if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) on[yy * gw + xx] = 1; }
    const seen = new Uint8Array(gw * gh), boxes = [];
    for (let s = 0; s < on.length; s++) {
      if (!on[s] || seen[s]) continue;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; const q = [s]; seen[s] = 1;
      while (q.length) { const c = q.pop(), cx = c % gw, cy = (c / gw) | 0; x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = cx + dx, yy = cy + dy, n = yy * gw + xx; if (xx >= 0 && xx < gw && yy >= 0 && yy < gh && on[n] && !seen[n]) { seen[n] = 1; q.push(n); } } }
      boxes.push({ x: x0 * cell * k, y: y0 * cell * k, w: (x1 - x0 + 1) * cell * k, h: (y1 - y0 + 1) * cell * k });
    }
    return boxes.filter(bx => bx.w > 30 && bx.h > 30);
  }
  /** Redline version of each sheet: changes clouded in red with the revision delta, and the change list in the title block. */
  async function redlineSheets(oldSheets, newSheets, rev, changes, onStep) {
    const out = [], byNum = new Map(oldSheets.map(s => [s.num, s]));
    const list = (changes || []).filter(c => c.done !== false).slice(0, 12);
    const legend = list.length ? `<rect x="3150" y="1260" width="400" height="${60 + list.length * 46}" fill="#fff" stroke="${RED}" stroke-width="3"/><text x="3170" y="1294" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="bold" fill="${RED}">REVISION ${esc(rev)} CHANGES</text>` + list.map((c, i) => `<text x="3170" y="${1330 + i * 46}" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="${RED}"><tspan font-weight="bold">${esc(String(c.element || '').toUpperCase().slice(0, 40))}</tspan><tspan x="3170" dy="16">${esc(String(c.what || '').toUpperCase().slice(0, 62))}</tspan></text>`).join('') : '';
    for (let i = 0; i < newSheets.length; i++) {
      onStep?.(i + 1, newSheets.length);
      const s = newSheets[i], prev = byNum.get(s.num); let mark = '';
      if (!prev) mark = `<text x="120" y="130" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="bold" fill="${RED}">NEW SHEET IN REVISION ${esc(rev)}</text>`;
      else { const boxes = await changedBoxes(prev.svg, s.svg); mark = boxes.map(bx => cloud(bx.x - 14, bx.y - 14, bx.w + 28, bx.h + 28) + delta(bx.x + bx.w + 14, bx.y - 14, rev)).join(''); if (!boxes.length) mark = ''; }
      out.push({ ...s, changed: !!mark, svg: s.svg.replace(/<\/svg>$/, `<g class="du-redline">${mark}${legend}</g></svg>`) });
    }
    return out;
  }
  /** Sheets with the member's open comment pins drawn on them. */
  function markupSheets(sheets, marks) {
    return sheets.map(s => {
      const pins = marks.filter(m => m.sheet === s.num && m.x != null);
      if (!pins.length) return s;
      const g = pins.map(m => { const tx = Math.min(m.x + 60, 2580), ty = Math.max(m.y - 60, 120), lines = String(m.text).match(/.{1,46}(\s|$)/g) || [m.text];
        return `<line x1="${m.x}" y1="${m.y}" x2="${tx}" y2="${ty}" stroke="${RED}" stroke-width="2"/><circle cx="${m.x}" cy="${m.y}" r="22" fill="#fff" stroke="${RED}" stroke-width="3"/><text x="${m.x}" y="${m.y + 7}" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" text-anchor="middle" fill="${RED}">${esc(m.n)}</text><rect x="${tx}" y="${ty - 22}" width="520" height="${12 + lines.slice(0, 4).length * 22}" fill="#fff" stroke="${RED}" stroke-width="2"/>` + lines.slice(0, 4).map((l, i) => `<text x="${tx + 10}" y="${ty + i * 22}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${RED}">${esc(l.trim())}</text>`).join(''); }).join('');
      return { ...s, svg: s.svg.replace(/<\/svg>$/, `<g class="du-markup">${g}</g></svg>`) };
    });
  }
  /** A picture of the marked area for the AI: the sheet around the pin with a red circle where the member clicked. */
  async function cropAround(svg, x, y) {
    const W = 2400, k = W / 3600, c = await svgToCanvas(svg, W), cw = 1000, ch = 700;
    const px = x * k, py = y * k, sx = Math.max(0, Math.min(c.width - cw, px - cw / 2)), sy = Math.max(0, Math.min(c.height - ch, py - ch / 2));
    const o = document.createElement('canvas'); o.width = cw; o.height = ch; const g = o.getContext('2d');
    g.drawImage(c, sx, sy, cw, ch, 0, 0, cw, ch); c.width = 0;
    g.strokeStyle = RED; g.lineWidth = 5; g.beginPath(); g.arc(px - sx, py - sy, 34, 0, Math.PI * 2); g.stroke();
    return o.toDataURL('image/jpeg', 0.82);
  }
  /** Reads the NDJSON stream from /api/drawings/generate. */
  async function runStream(body, onProgress) {
    const res = await fetch('/api/drawings/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, body: JSON.stringify(body) });
    if (!res.ok || !res.body) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Drawing generation could not start (' + res.status + ').'); }
    if (/application\/json/.test(res.headers.get('content-type') || '')) return res.json();
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '', done = null, fail = '';
    for (;;) {
      const { value, done: end } = await reader.read(); if (end) break;
      buf += dec.decode(value, { stream: true }); let cut;
      while ((cut = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, cut).trim(); buf = buf.slice(cut + 1); if (!line) continue;
        let e; try { e = JSON.parse(line); } catch (_e) { continue; }
        if (e.t === 'progress') onProgress?.(e.chars); else if (e.t === 'done') done = e; else if (e.t === 'error') fail = e.error;
      }
    }
    if (!done) throw new Error(fail || 'The connection closed before the set was saved. If it finished, it is in Your drawing sets.');
    return done;
  }

  /* ------------------------------------------------------------------ lists (Projects tab, project page) */
  const CSS_ID = 'du-dit24-css';
  function card(set, compact) {
    const fp = set.footprint ? `${Math.round(set.footprint.width_ft)}' x ${Math.round(set.footprint.depth_ft)}'` : '';
    const open = (set.markups || []).filter(m => m.status !== 'sent').length;
    const kick = [set.mode && set.mode !== 'standard' ? (MODE[set.mode]?.label || set.mode).toUpperCase() : 'DRAWING SET', set.revision ? 'REVISION ' + set.revision : '', set.issue_status ? String(set.issue_status).toUpperCase() : ''].filter(Boolean).join(' · ');
    return `<article class="du-dit24-set"><div><span class="du-kicker">${esc(kick)}</span><b>${esc(set.title || 'Drawing set')}</b><small>${esc([fp, set.stories > 1 ? set.stories + ' stories' : '', (set.details_needed || []).length ? (set.details_needed.length + ' details flagged') : '', open ? open + ' open comment' + (open === 1 ? '' : 's') : '', new Date(set.created_at).toLocaleDateString()].filter(Boolean).join(' · '))}</small></div><button class="du-btn ${compact ? 'ghost' : 'primary'}" type="button" data-dit-open="${esc(set.id)}">Open set →</button></article>`;
  }
  /** Recent sets (Projects tab). With a projectId (project page) it also shows Redlines + revisions and the project to-dos. */
  async function recent(host, opts = {}) {
    host.innerHTML = '<p class="du-muted">Loading drawing sets…</p>';
    let sets; try { sets = await listSets({ ...opts, limit: opts.projectId ? 40 : opts.limit }); } catch (e) { host.innerHTML = `<p class="du-muted">Drawing sets could not load: ${esc(e.message)}</p>`; return; }
    if (sets.missing) { host.innerHTML = '<p class="du-muted">Run the v24 SQL (drawing sets) in Supabase to save drawing sets.</p>'; return; }
    const latestOnly = sets.filter(s => !sets.some(o => (o.root_id || o.id) === (s.root_id || s.id) && (o.revision || 0) > (s.revision || 0)));
    let html = latestOnly.length ? latestOnly.slice(0, opts.limit || 12).map(s => card(s, true)).join('') : `<p class="du-muted">${opts.projectId ? 'No drawing sets for this project yet.' : 'No drawing sets yet. Upload a picture and DrawUp draws the set.'}</p>`;
    if (opts.projectId) {
      const revs = sets.filter(s => s.revision > 0 || (s.markups || []).length);
      html += `<section class="du-dit25-redlines"><h4>Redlines + revisions</h4>${revs.length ? revs.map(s => `<article class="du-dit24-set du-dit25-redset"><div><span class="du-kicker">${s.revision ? 'REVISION ' + esc(s.revision) + ' · ' + esc((s.changes || []).filter(c => c.done !== false).length) + ' CHANGES CLOUDED' : 'MARKED UP'}</span><b>${esc(s.title)}</b><small>${esc(new Date(s.created_at).toLocaleDateString())}${(s.markups || []).length ? ' · ' + s.markups.length + ' markup comment' + (s.markups.length === 1 ? '' : 's') : ''}</small></div><span class="du-dit25-row">${s.revision ? `<button class="du-btn ghost" type="button" data-dit-red="${esc(s.id)}">Redlines</button>` : ''}${(s.markups || []).length ? `<button class="du-btn ghost" type="button" data-dit-mark="${esc(s.id)}">Markups</button>` : ''}<button class="du-btn ghost" type="button" data-dit-open="${esc(s.id)}">Clean set</button></span></article>`).join('') : '<p class="du-muted">Comment on a drawing set and press Regenerate. Each revision is saved here with the changes clouded in red.</p>'}</section>`;
      const { data: todos, error } = await sb().from('project_todos').select('id,title,why,instruction,status,source_generation_id,created_at').eq('project_thread_id', opts.projectId).neq('status', 'done').order('created_at', { ascending: false }).limit(30).then(x => x, e => ({ error: e }));
      if (!error) html += `<section class="du-dit25-todos"><h4>Project to-dos from Draw it up</h4>${(todos || []).length ? `<ul>${todos.map(t => `<li><label><input type="checkbox" data-todo-done="${esc(t.id)}"> <b>${esc(t.title)}</b></label>${t.why ? `<small>${esc(t.why)}</small>` : ''}${t.status === 'added' ? '<em>Added to a set</em>' : ''}</li>`).join('')}</ul>` : '<p class="du-muted">Next steps you add to this project from a drawing set show here.</p>'}</section>`;
    }
    host.innerHTML = html;
    host.querySelectorAll('[data-dit-open]').forEach(b => b.onclick = () => open({ setId: b.dataset.ditOpen, view: 'clean' }));
    host.querySelectorAll('[data-dit-red]').forEach(b => b.onclick = () => open({ setId: b.dataset.ditRed, view: 'redline' }));
    host.querySelectorAll('[data-dit-mark]').forEach(b => b.onclick = () => open({ setId: b.dataset.ditMark, view: 'markup' }));
    host.querySelectorAll('[data-todo-done]').forEach(b => b.onchange = async () => { const { error } = await sb().from('project_todos').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', b.dataset.todoDone); if (error) toast(error.message, true); else b.closest('li').remove(); });
  }
  /** Opens Arch Coach in Draw it up mode (optionally on a saved set or a project). */
  function openInCoach(intent = {}) {
    window.__duDrawIntent = intent;
    const q = intent.setId ? 'draw=' + encodeURIComponent(intent.setId) : 'draw=1';
    history.replaceState(null, '', '#portal/arch-coach?' + q);
    P()?.openPortalTab?.('arch-coach');
  }
  /** Public entry (AI Design Team chat, project page): { setId?, projectId?, comments?: string[], regenerate?, mode?, view? }. */
  function open(intent = {}) { pending = { ...intent }; openInCoach({ setId: intent.setId || '', projectId: intent.projectId || '' }); }
  /** Recent sets with their suggested next steps, for the team chat. */
  async function latest(opts = {}) {
    const sets = await listSets({ projectId: opts.projectId, limit: opts.limit || 5 });
    return sets.missing ? [] : sets.map(s => ({ id: s.id, title: s.title, revision: s.revision || 0, mode: s.mode || 'standard', created_at: s.created_at, next_steps: s.next_steps || [] }));
  }

  /* ------------------------------------------------------------------ the Draw it up screen */
  function mount(host, opts = {}) {
    const ctx = C(), u = ctx.user;
    const extra = pending && (!pending.setId || pending.setId === opts.setId) ? pending : null; pending = null;
    const st = { pics: [], mode: MODE[extra?.mode] && extra.mode !== 'explore' ? extra.mode : 'full', model: null, gen: null, parent: null, chain: [], sheets: [], shown: [], view: 'clean', red: null, redFor: '', marks: [], todos: [], optionView: -1,
      status: 'Preliminary', reviewer: '', license: '', size: 'archd', busy: false, sourceImage: '' };
    if (MODE[extra?.mode]) st.mode = extra.mode;
    try { const s = JSON.parse(localStorage.getItem('du-dit24-tb') || 'null'); if (s) { st.reviewer = s.reviewer || ''; st.license = s.license || ''; } } catch (_e) { /* private window */ }
    host.innerHTML = `<section class="du-dit24 du-glass">
      <span class="du-kicker">DRAW IT UP · PICTURE TO DRAWING SET</span>
      <h2>Turn a picture into architectural drawings.</h2>
      <p class="du-muted">Upload a photo, rendering, sketch, AI image or drawing. DrawUp reads it, builds one coordinated building model and draws the set from it. Every page shows here. Comment right on the drawings and press Regenerate: DrawUp fixes what you marked, keeps the rest, saves the old set and clouds the changes in red.</p>
      <label class="du-dit24-drop" tabindex="0"><input type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"><b>Add pictures or a PDF</b><span>PNG, JPG, WebP or PDF · up to ${MAX_FILES} pictures or pages</span></label>
      <div class="du-dit24-pics"></div>
      <div class="du-dit24-grid">
        <label class="wide">What is it? Add any sizes you know <textarea rows="2" data-f="notes" placeholder="Example: 18 x 10 ft athletic storage building, 8 ft walls, slab on grade, shed roof"></textarea></label>
        <label>Location <input data-f="location" placeholder="City, State" value="${esc(opts.location || ctx.profile?.current_location || '')}"></label>
        <label>Project <select data-f="project"><option value="">No project</option></select></label>
      </div>
      <fieldset class="du-dit25-modes"><legend>What do you need?</legend>${Object.entries(MODE).map(([k, v]) => `<label><input type="radio" name="du-dit25-mode" value="${k}"${k === st.mode ? ' checked' : ''}><b>${v.label}</b><span>${v.sub}</span><small>${v.cost} credits</small></label>`).join('')}</fieldset>
      <details class="du-dit24-more"><summary>Title block + issue status</summary><div class="du-dit24-grid">
        <label>Issue status <select data-f="status">${STATUSES.map(s => `<option>${s}</option>`).join('')}</select></label>
        <label>Reviewed by (architect) <input data-f="reviewer" value="${esc(st.reviewer)}" placeholder="Name"></label>
        <label>License no. <input data-f="license" value="${esc(st.license)}" placeholder="State + number"></label>
        <label>PDF sheet size <select data-f="size"><option value="archd">ARCH D 24 x 36 (full size)</option><option value="tabloid">11 x 17 (half size)</option></select></label>
      </div><p class="du-muted">"Issued for construction" belongs on a set a licensed professional has reviewed. Until then DrawUp marks every sheet "not for construction until reviewed".</p></details>
      <div class="du-dit24-go"><button class="du-btn primary" type="button" data-go disabled>Draw it up</button><span class="du-muted" data-msg></span></div>
      <div class="du-dit24-progress" hidden><div class="du-dit24-bar"><i></i></div><ol><li data-p="read">Reading the picture</li><li data-p="model">Building one coordinated model</li><li data-p="draw">Drawing the sheets</li></ol></div>
      <div class="du-dit24-out"></div>
      <div class="du-dit24-recent-wrap"><h3>Your drawing sets</h3><div class="du-dit24-recent"></div></div>
    </section>`;
    const $ = s => host.querySelector(s), f = k => host.querySelector(`[data-f="${k}"]`);
    const drop = $('.du-dit24-drop'), input = drop.querySelector('input'), go = $('[data-go]'), msg = $('[data-msg]'), out = $('.du-dit24-out');
    const costLine = () => { msg.textContent = `${MODE[st.mode].cost} credits for a ${MODE[st.mode].label.toLowerCase()} (unlimited accounts are not charged). Refunded if it does not finish.`; go.textContent = st.mode === 'explore' ? 'Explore 3 options' : 'Draw it up'; };
    host.querySelectorAll('[name="du-dit25-mode"]').forEach(r => r.onchange = () => { st.mode = r.value; costLine(); });
    costLine();
    f('status').value = st.status;
    const projectId = () => f('project').value || extra?.projectId || opts.projectId || '';
    (async () => { try { const { data } = await sb().from('project_threads').select('id,project_name,location').eq('owner_id', u.id).order('updated_at', { ascending: false }).limit(60); const sel = f('project'); (data || []).forEach(p => sel.insertAdjacentHTML('beforeend', `<option value="${esc(p.id)}">${esc(p.project_name)}</option>`)); const want = st.gen?.project_thread_id || extra?.projectId || opts.projectId; if (want) sel.value = want; sel.onchange = () => { const p = (data || []).find(x => x.id === sel.value); if (p?.location && !f('location').value) f('location').value = p.location; }; } catch (_e) { /* projects optional */ } })();
    const showPics = () => { $('.du-dit24-pics').innerHTML = st.pics.map((p, i) => `<figure><img src="${p.dataUrl}" alt=""><figcaption>${esc(p.name)}</figcaption><button type="button" data-rm="${i}" aria-label="Remove ${esc(p.name)}">×</button></figure>`).join(''); host.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { st.pics.splice(+b.dataset.rm, 1); showPics(); }); go.disabled = !st.pics.length || st.busy; drop.classList.toggle('has', !!st.pics.length); };
    const addFiles = async files => { if (!files.length) return; msg.textContent = 'Reading your files…'; try { const more = await readPictures([...files]); st.pics.push(...more); st.pics = st.pics.slice(0, MAX_FILES); msg.textContent = st.pics.length >= MAX_FILES ? `Using the first ${MAX_FILES} pictures or pages.` : 'Ready. Pick what you need, add notes if you know sizes, then press Draw it up.'; } catch (e) { msg.textContent = e.message || String(e); } showPics(); };
    input.onchange = () => { addFiles(input.files); input.value = ''; };
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    ['status', 'reviewer', 'license', 'size'].forEach(k => f(k).addEventListener('change', () => { st[k] = f(k).value.trim(); try { localStorage.setItem('du-dit24-tb', JSON.stringify({ reviewer: st.reviewer, license: st.license })); } catch (_e) { /* ignore */ } if (st.model) { st.red = null; draw(); persistTb(); } }));
    if (opts.initialPictures?.length) { st.pics = opts.initialPictures.slice(0, MAX_FILES); showPics(); }
    if (opts.notes) f('notes').value = opts.notes;

    const stage = (k, pct) => { $('.du-dit24-progress').hidden = false; host.querySelectorAll('[data-p]').forEach(li => { const order = ['read', 'model', 'draw']; li.classList.toggle('on', li.dataset.p === k); li.classList.toggle('done', order.indexOf(li.dataset.p) < order.indexOf(k)); }); $('.du-dit24-bar i').style.width = Math.round(pct) + '%'; };
    const stageText = (read, model) => { const li = host.querySelectorAll('[data-p]'); li[0].textContent = read; li[1].textContent = model; };
    const progress = chars => { stage('model', Math.min(88, 12 + chars / 90)); };

    go.onclick = async () => {
      if (st.busy || !st.pics.length) return;
      st.busy = true; go.disabled = true; out.innerHTML = ''; stageText('Reading the picture', st.mode === 'explore' ? 'Designing 3 options' : 'Building one coordinated model'); stage('read', 4); msg.textContent = 'Uploading your pictures…';
      const genFolder = uuid(), paths = [];
      try { for (let i = 0; i < st.pics.length; i++) { const path = `${u.id}/drawings/${genFolder}/source-${i + 1}.jpg`; const b = await (await fetch(st.pics[i].dataUrl)).blob(); const up = await sb().storage.from(BUCKET).upload(path, b, { contentType: 'image/jpeg', upsert: true }); if (!up.error) paths.push(path); } }
      catch (_e) { /* the set still works without saved sources */ }
      msg.textContent = st.mode === 'explore' ? 'DrawUp is designing 3 options. This takes a little longer than one set.' : 'DrawUp is reading the picture. A set usually takes about a minute.';
      try {
        stage('model', 12);
        const done = await runStream({ images: st.pics.map(p => p.dataUrl), source_paths: paths, mode: st.mode, notes: f('notes').value.trim(), location: f('location').value.trim(), project_id: projectId(), coach_thread_id: opts.coachThreadId || '' }, progress);
        stage('draw', 94); st.sourceImage = st.pics[0]?.dataUrl || '';
        await loadResult(done.generation || { mode: st.mode, options: done.options, model: done.model }, done.model, done.options);
        stage('draw', 100); setTimeout(() => { $('.du-dit24-progress').hidden = true; }, 900);
        msg.textContent = (done.saved ? 'Saved to Your drawing sets. ' : 'Drawn, but it could not be saved (run the v24 + v25 SQL). ') + (done.credits_charged ? done.credits_charged + ' credits used.' : '');
        if (done.saved) persistTb();
        refreshRecent();
      } catch (e) { $('.du-dit24-progress').hidden = true; msg.textContent = e.message || String(e); toast(e.message || String(e), true); }
      finally { st.busy = false; go.disabled = !st.pics.length; }
    };

    async function persistTb() { if (!st.gen?.id) return; try { await sb().from('drawing_generations').update({ issue_status: st.status, reviewer: st.reviewer || null, license_no: st.license || null, updated_at: new Date().toISOString() }).eq('id', st.gen.id).eq('owner_id', u.id); } catch (_e) { /* optional */ } }
    async function saveMarks() {
      if (!st.gen?.id) return;
      const { error } = await sb().from('drawing_generations').update({ markups: st.marks.map(({ n: _n, ...m }) => m) }).eq('id', st.gen.id).eq('owner_id', u.id);
      if (error) toast(/markups|column/i.test(error.message) ? 'Run the v25 SQL (drawing revisions) to save comments on drawings.' : error.message, true);
    }
    const openMarks = () => st.marks.filter(m => m.status !== 'sent');
    const number = () => { let i = 0; st.marks.forEach(m => { if (m.status !== 'sent') m.n = ++i; }); };
    function addMark(m) { st.marks.push({ id: uuid(), status: 'open', created_at: new Date().toISOString(), ...m }); number(); saveMarks(); }

    /** Loads a saved set (or a fresh result): its revision chain, the previous revision for redlines, markups + project to-dos. */
    async function loadResult(gen, model, options) {
      st.gen = gen; st.model = model; st.red = null; st.optionView = -1; st.parent = null; st.chain = [];
      st.marks = Array.isArray(gen?.markups) ? gen.markups.map(m => ({ ...m })) : []; number();
      st.status = gen?.issue_status || st.status;
      if (gen?.id && gen.revision > 0 && gen.parent_id) {
        const { data } = await sb().from('drawing_generations').select('id,model,revision,mode,created_at').eq('id', gen.parent_id).maybeSingle().then(x => x, () => ({}));
        if (data) st.parent = data;
      }
      if (gen?.id && gen.revision != null) {
        const root = gen.root_id || gen.id;
        const { data } = await sb().from('drawing_generations').select('id,revision,created_at,changes').or(`id.eq.${root},root_id.eq.${root}`).order('revision').then(x => x, () => ({}));
        st.chain = data || [];
      }
      const pid = gen?.project_thread_id;
      st.todos = [];
      if (pid) { const { data } = await sb().from('project_todos').select('id,title,why,instruction,status,source_generation_id').eq('project_thread_id', pid).eq('status', 'open').order('created_at', { ascending: false }).limit(20).then(x => x, () => ({})); st.todos = (data || []).filter(t => t.source_generation_id !== gen.id); }
      if (gen?.mode === 'explore' && (options || gen.options)?.length) { st.options = options || gen.options; showOptions(); return; }
      st.view = 'clean'; await draw();
    }
    function renderOpts(level) {
      const revisions = st.chain.filter(r => r.revision > 0 && r.revision <= (st.gen?.revision || 0)).map(r => ({ no: r.revision, desc: 'Revision ' + r.revision, date: new Date(r.created_at).toLocaleDateString('en-US') }));
      const first = st.chain.find(r => !r.revision);
      return { level, location: f('location').value.trim() || st.gen?.location || '', status: st.status, reviewer: st.reviewer, license: st.license ? 'LIC. ' + st.license : '', sourceImage: st.sourceImage, revisions,
        firstDate: first ? new Date(first.created_at).toLocaleDateString('en-US') : '', date: new Date(st.gen?.created_at || Date.now()).toLocaleDateString('en-US') };
    }
    async function viewSheets(onStep) {
      if (st.view === 'redline' && st.parent) {
        if (!st.red || st.redFor !== st.gen.id) {
          const prev = window.DrawUpSheets.render(st.parent.model, { ...renderOpts(levelOf(st.parent)), revisions: [] });
          st.red = await redlineSheets(prev, st.sheets, st.gen.revision, st.gen.changes, onStep); st.redFor = st.gen.id;
        }
        return st.red;
      }
      if (st.view === 'markup') return markupSheets(st.sheets, openMarks().concat(st.marks.filter(m => m.status === 'sent')));
      return st.sheets;
    }
    async function draw() {
      const m = st.model; if (!window.DrawUpSheets) { out.innerHTML = '<p>The sheet engine did not load. Refresh the page.</p>'; return; }
      const level = st.optionView >= 0 ? 'preliminary' : levelOf(st.gen);
      st.sheets = window.DrawUpSheets.render(m, renderOpts(level));
      if (st.view === 'redline' && !st.parent) st.view = 'clean';
      if (st.view === 'redline') out.innerHTML = '<p class="du-muted">Comparing with the previous revision and clouding the changes…</p>';
      st.shown = await viewSheets((i, n) => { const p = out.querySelector('p'); if (p) p.textContent = `Comparing sheet ${i} of ${n} with the previous revision…`; });
      const urls = st.shown.map(s => svgUrl(s.svg));
      out.querySelectorAll('img[data-blob]').forEach(i => URL.revokeObjectURL(i.src));
      const sev = { critical: 'CRITICAL', major: 'MAJOR', minor: 'MINOR' }, g = st.gen || {}, rev = g.revision || 0, opened = openMarks();
      const optionMode = st.optionView >= 0, saved = !!g.id && !optionMode;
      const changes = (g.changes || []).filter(Boolean);
      out.innerHTML = `${optionMode ? `<button class="du-btn ghost" type="button" data-back-options>← Back to the 3 options</button>` : ''}
        <div class="du-dit24-head"><div><span class="du-kicker">${esc(st.shown.length)} SHEETS · ${esc(optionMode ? 'OPTION ' + (st.optionView + 1) + ' · PRELIMINARY' : levelName[level])}${rev ? ' · REVISION ' + esc(rev) : ''}</span><h2>${esc(m.title)}</h2><p>${esc(m.summary)}</p>${m.dimension_basis === 'estimated_from_picture' ? '<p class="du-dit24-warn">Sizes were estimated from the picture. Check the assumptions on G001, then pin a comment with the real sizes and regenerate.</p>' : ''}
          ${st.chain.length > 1 ? `<div class="du-dit25-chain" role="group" aria-label="Revisions">${st.chain.map(r => `<button type="button" data-rev="${esc(r.id)}" aria-pressed="${r.id === g.id}">${r.revision ? 'Rev ' + esc(r.revision) : 'Original'}</button>`).join('')}</div>` : ''}
          <div class="du-dit25-views" role="group" aria-label="Sheet view"><button type="button" data-v="clean" aria-pressed="${st.view === 'clean'}">Clean set</button>${st.parent ? `<button type="button" data-v="redline" aria-pressed="${st.view === 'redline'}">Redlines (changes in Rev ${esc(rev)})</button>` : ''}${st.marks.length ? `<button type="button" data-v="markup" aria-pressed="${st.view === 'markup'}">My markups (${st.marks.length})</button>` : ''}</div></div>
          <div class="du-dit24-acts"><button class="du-btn primary" type="button" data-pdf>${st.view === 'redline' ? 'Redline PDF set' : st.view === 'markup' ? 'Marked-up PDF set' : 'Combine into PDF set'}</button><button class="du-btn ghost" type="button" data-pngs>Images (PNG)</button>${level === 'preliminary' && saved ? `<button class="du-btn ghost" type="button" data-upgrade>Develop into full set</button>` : ''}<button class="du-btn ghost" type="button" data-check>Check against code</button><button class="du-btn ghost" type="button" data-ask>Ask Arch Coach about this set</button></div></div>
        <div class="du-dit24-sheets">${st.shown.map((s, i) => `<figure class="du-dit24-sheet${s.changed ? ' du-dit25-changed' : ''}"><button type="button" data-view="${i}" aria-label="Open ${esc(s.num)} full size"><img data-blob src="${urls[i]}" alt="${esc(s.num + ' ' + s.title)}" loading="lazy"></button><figcaption><b>${esc(s.num)}</b><span>${esc(s.title)}${s.changed ? ' · <em class="du-dit25-red">changed</em>' : ''}${opened.filter(x => x.sheet === s.num).length ? ` · <em class="du-dit25-red">${opened.filter(x => x.sheet === s.num).length} comment${opened.filter(x => x.sheet === s.num).length === 1 ? '' : 's'}</em>` : ''}</span><span class="du-dit24-dl"><button type="button" data-dl="${i}" data-as="pdf">PDF</button><button type="button" data-dl="${i}" data-as="png">PNG</button><button type="button" data-dl="${i}" data-as="svg">SVG</button></span></figcaption></figure>`).join('')}</div>
        ${saved ? `<section class="du-dit25-comments"><h3>Comments for the next revision</h3><p class="du-muted">Open any sheet and press <b>✎ Comment</b> to pin a note right on the drawing, or write a general note below. When you regenerate, DrawUp reads each comment (and the spot you marked), fixes it, keeps everything else the same, saves this set as the previous revision and clouds the changes in red.</p>
          <ol class="du-dit25-marks">${opened.map(x => `<li><b>${esc(x.n)}</b><span>${x.sheet ? esc(x.sheet) : 'General'}</span><p>${esc(x.text)}</p><button type="button" data-unmark="${esc(x.id)}" aria-label="Remove comment ${esc(x.n)}">×</button></li>`).join('') || '<li class="du-muted">No comments yet.</li>'}</ol>
          <div class="du-dit25-general"><textarea rows="2" data-general placeholder="General note, for example: make the porch 8 ft deep and add a window on the left wall"></textarea><button class="du-btn ghost" type="button" data-add-general>Add note</button></div>
          <div class="du-dit24-go"><button class="du-btn primary" type="button" data-regen ${opened.length ? '' : 'disabled'}>Regenerate with ${opened.length} comment${opened.length === 1 ? '' : 's'}</button><span class="du-muted">${REVISE_COST} credits (unlimited accounts are not charged). Your current set stays saved as Rev ${esc(rev)}${rev ? '' : ' (Original)'}.</span></div></section>` : ''}
        ${rev && changes.length ? `<section class="du-dit25-changes"><h3>What changed in revision ${esc(rev)}</h3><ul class="du-dit24-list">${changes.map(c => `<li class="${c.done === false ? 'du-dit25-notdone' : ''}"><b>${c.done === false ? '✗ Not changed: ' : '✓ '}${esc(c.element)}</b><small>${esc(c.what)}${c.comment ? ' · comment ' + esc(c.comment) : ' · coordination'}</small></li>`).join('')}</ul></section>` : ''}
        ${saved ? `<section class="du-dit25-next"><h3>What to do next</h3>${(m.next_steps || []).length ? `<ul class="du-dit25-steps">${m.next_steps.map((x, i) => `<li><label><input type="checkbox" data-step="${i}" checked><span><b>${esc(x.title)}</b><small>${esc(x.why)}</small></span></label></li>`).join('')}</ul>
          <div class="du-dit24-acts"><button class="du-btn ghost" type="button" data-steps-set>Add checked to this set</button><button class="du-btn ghost" type="button" data-steps-project ${g.project_thread_id ? '' : 'disabled title="Pick a project for this set first"'}>Add checked to this project</button></div>` : '<p class="du-muted">No suggestions for this set.</p>'}
          ${st.todos.length ? `<h4>From this project's to-do list</h4><ul class="du-dit25-steps">${st.todos.map(t => `<li><span><b>${esc(t.title)}</b><small>${esc(t.why || '')}</small></span><button class="du-btn ghost" type="button" data-todo-add="${esc(t.id)}">Add to this set</button></li>`).join('')}</ul>` : ''}</section>` : ''}
        <div class="du-dit24-cols"><section><h3>Details this set still needs</h3><p class="du-muted">${level === 'preliminary' ? 'Listed on G001 and drawn in the full set.' : 'Flagged on A501 and added to the Details library, so the catalog grows with every set.'}</p><ol class="du-dit24-list">${m.details_needed.map(d => `<li><b>${esc(d.title)}</b><span>${esc(d.category)}${d.location ? ' · ' + esc(d.location) : ''}</span><small>${esc(d.why)}</small></li>`).join('') || '<li>No extra details flagged.</li>'}</ol><button class="du-btn ghost" type="button" data-lib>Open the Details library</button></section>
        <section><h3>Problems in the picture</h3><ul class="du-dit24-list">${m.issues_in_source.map(x => `<li><b><em class="sev-${esc(x.severity)}">${sev[x.severity] || 'NOTE'}</em> ${esc(x.issue)}</b>${x.fix ? `<small>Fix: ${esc(x.fix)}</small>` : ''}</li>`).join('') || '<li>None reported.</li>'}</ul>${m.code_notes.length ? `<h3>Code items to confirm</h3><ul class="du-dit24-list">${m.code_notes.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</section></div>`;
      const q = s => out.querySelector(s);
      out.querySelectorAll('[data-view]').forEach(b => b.onclick = () => viewer(+b.dataset.view));
      out.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => downloadOne(+b.dataset.dl, b.dataset.as, b));
      out.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { st.view = b.dataset.v; draw(); });
      out.querySelectorAll('[data-rev]').forEach(b => b.onclick = () => openSaved(b.dataset.rev));
      q('[data-back-options]') && (q('[data-back-options]').onclick = () => showOptions());
      const suffix = () => (rev ? '-rev' + rev : '') + (st.view === 'redline' ? '-redlines' : st.view === 'markup' ? '-markups' : '');
      q('[data-pdf]').onclick = async e => {
        const b = e.currentTarget; b.disabled = true; const old = b.textContent;
        try { const bytes = await sheetsToPdf(st.shown, st.size, m.title, (i, n) => { b.textContent = `Combining sheet ${i} of ${n}…`; }); save(slug(m.title) + suffix() + '-drawing-set.pdf', bytes, 'application/pdf'); toast('PDF set downloaded.'); }
        catch (err) { toast('The PDF could not be made: ' + (err.message || err), true); } finally { b.disabled = false; b.textContent = old; }
      };
      q('[data-pngs]').onclick = async e => { const b = e.currentTarget; b.disabled = true; try { for (let i = 0; i < st.shown.length; i++) { b.textContent = `Image ${i + 1} of ${st.shown.length}…`; await downloadOne(i, 'png'); await new Promise(r => setTimeout(r, 350)); } } finally { b.disabled = false; b.textContent = 'Images (PNG)'; } };
      q('[data-upgrade]') && (q('[data-upgrade]').onclick = () => regenerate([{ id: '', sheet: '', text: 'Develop this preliminary set into the full construction-document set: keep the design exactly as it is, and complete every assembly, opening, room, detail and code item.' }], 'full'));
      q('[data-check]').onclick = () => { history.replaceState(null, '', '#portal/check?quick=1'); P()?.openPortalTab?.('check'); toast('Download the PDF set, then drop it into Quick Check to review it against code.'); };
      q('[data-ask]').onclick = () => { try { sessionStorage.setItem('du-coach-prefill', `I drew up "${m.title}" with DrawUp (${m.footprint.width_ft} x ${m.footprint.depth_ft} ft, ${m.stories} stor${m.stories > 1 ? 'ies' : 'y'}, ${m.roof.type} roof, ${m.foundation.type.replace(/_/g, ' ')}). What should I check before this set goes to permit, and how should I draw these details: ${m.details_needed.map(d => d.title).join('; ')}?`); } catch (_e) { /* ignore */ } opts.onAsk ? opts.onAsk() : P()?.openPortalTab?.('arch-coach'); };
      q('[data-lib]').onclick = () => P()?.openPortalTab?.('details');
      if (!saved) return;
      out.querySelectorAll('[data-unmark]').forEach(b => b.onclick = () => { st.marks = st.marks.filter(x => x.id !== b.dataset.unmark); number(); saveMarks(); draw(); });
      q('[data-add-general]').onclick = () => { const t = q('[data-general]').value.trim(); if (!t) return; addMark({ sheet: '', x: null, y: null, text: t.slice(0, 1000) }); draw(); };
      q('[data-regen]').onclick = () => regenerate(openMarks());
      const checked = () => [...out.querySelectorAll('[data-step]')].filter(c => c.checked).map(c => m.next_steps[+c.dataset.step]);
      q('[data-steps-set]') && (q('[data-steps-set]').onclick = () => { const xs = checked(); if (!xs.length) return; xs.forEach(x => addMark({ sheet: '', x: null, y: null, text: (x.instruction || x.title).slice(0, 1000), from: 'next_step' })); toast(`${xs.length} added to your comments. Press Regenerate when you are ready.`); draw(); });
      q('[data-steps-project]') && (q('[data-steps-project]').onclick = async () => { const xs = checked(); if (!xs.length || !g.project_thread_id) return; const { error } = await sb().from('project_todos').insert(xs.map(x => ({ project_thread_id: g.project_thread_id, owner_id: u.id, title: x.title.slice(0, 200), why: x.why || null, instruction: x.instruction || null, kind: x.kind || 'design', source_generation_id: g.id }))); if (error) toast(/project_todos/i.test(error.message) ? 'Run the v25 SQL (drawing revisions) to save project to-dos.' : error.message, true); else toast(`${xs.length} added to the project's to-do list.`); });
      out.querySelectorAll('[data-todo-add]').forEach(b => b.onclick = async () => { const t = st.todos.find(x => x.id === b.dataset.todoAdd); if (!t) return; addMark({ sheet: '', x: null, y: null, text: (t.instruction || t.title).slice(0, 1000), from: 'project_todo' }); await sb().from('project_todos').update({ status: 'added', updated_at: new Date().toISOString() }).eq('id', t.id); st.todos = st.todos.filter(x => x.id !== t.id); draw(); });
    }

    /** Sends the comments (with a picture of each marked spot) and loads the new revision with its redlines. */
    async function regenerate(comments, mode) {
      if (st.busy || !st.gen?.id) return;
      if (!comments.length) { toast('Add a comment first.', true); return; }
      st.busy = true; const btn = out.querySelector('[data-regen]'); if (btn) btn.disabled = true;
      stageText('Reading your comments', 'Revising the model'); stage('read', 6); $('.du-dit24-progress').scrollIntoView({ behavior: 'smooth', block: 'center' });
      msg.textContent = 'Reading your comments and the spots you marked…';
      try {
        const clean = window.DrawUpSheets.render(st.model, renderOpts(levelOf(st.gen)));
        const payload = [];
        for (const c of comments) { const s = c.sheet && clean.find(x => x.num === c.sheet); payload.push({ id: c.id, text: c.text, sheet: c.sheet || '', crop: s && c.x != null ? await cropAround(s.svg, c.x, c.y) : '' }); }
        stage('model', 12); msg.textContent = 'DrawUp is revising the set. Everything you did not comment on stays the same.';
        const done = await runStream({ revise_of: st.gen.id, comments: payload, mode }, progress);
        stage('draw', 94);
        await loadResult(done.generation || { ...st.gen, revision: (st.gen.revision || 0) + 1, parent_id: st.gen.id }, done.model);
        if (st.parent) { st.view = 'redline'; await draw(); }
        stage('draw', 100); setTimeout(() => { $('.du-dit24-progress').hidden = true; }, 900);
        const nd = (done.model.changes || []).filter(c => c.done === false).length;
        msg.textContent = `Revision ${st.gen.revision || ''} saved. The changes are clouded in red.` + (nd ? ` ${nd} comment${nd === 1 ? '' : 's'} could not be done: see "What changed".` : '') + (done.credits_charged ? ' ' + done.credits_charged + ' credits used.' : '');
        refreshRecent(); out.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) { $('.du-dit24-progress').hidden = true; msg.textContent = e.message || String(e); toast(e.message || String(e), true); if (btn) btn.disabled = false; }
      finally { st.busy = false; }
    }

    /** Explore mode: the 3 directions side by side; develop one into a full set (no AI call, no credits). */
    function showOptions() {
      st.optionView = -1; const opts3 = st.options || [];
      out.querySelectorAll('img[data-blob]').forEach(i => URL.revokeObjectURL(i.src));
      const thumbs = opts3.map(o => { const sh = window.DrawUpSheets.render(o.model, { level: 'preliminary', status: 'PRELIMINARY' }); return [sh.find(s => /^A10/.test(s.num)), sh.find(s => s.num === 'A201')].filter(Boolean).map(s => svgUrl(s.svg)); });
      out.innerHTML = `<div class="du-dit24-head"><div><span class="du-kicker">EXPLORE · ${opts3.length} DESIGN DIRECTIONS</span><h2>Pick a direction</h2><p>Each option is a complete building model. Look through its sheets, then develop the one you like into a full set at no extra cost. You can comment and regenerate from there.</p></div></div>
        <div class="du-dit25-options">${opts3.map((o, i) => `<article class="du-glass"><span class="du-kicker">OPTION ${i + 1}</span><h3>${esc(o.name)}</h3><p>${esc(o.idea)}</p><div class="du-dit25-othumbs">${thumbs[i].map(t => `<img data-blob src="${t}" alt="">`).join('')}</div><small>${esc(Math.round(o.model.footprint.width_ft))}' x ${esc(Math.round(o.model.footprint.depth_ft))}' · ${esc(o.model.stories)} stor${o.model.stories > 1 ? 'ies' : 'y'} · ${esc(o.model.roof.type)} roof</small><div class="du-dit24-acts"><button class="du-btn primary" type="button" data-develop="${i}" ${st.gen?.id ? '' : 'disabled'}>Develop into full set</button><button class="du-btn ghost" type="button" data-see="${i}">See its sheets</button></div></article>`).join('')}</div>`;
      out.querySelectorAll('[data-see]').forEach(b => b.onclick = () => { st.optionView = +b.dataset.see; st.model = opts3[st.optionView].model; st.view = 'clean'; draw(); });
      out.querySelectorAll('[data-develop]').forEach(b => b.onclick = async () => {
        b.disabled = true; b.textContent = 'Developing…';
        try { const d = await runStream({ develop_from: st.gen.id, option: +b.dataset.develop }); await loadResult(d.generation, d.model); refreshRecent(); toast('Full set ready. Comment on it and regenerate whenever you like.'); }
        catch (e) { toast(e.message || String(e), true); b.disabled = false; b.textContent = 'Develop into full set'; }
      });
    }

    async function downloadOne(i, as, btn) {
      const s = st.shown[i], name = slug(st.model.title) + (st.gen?.revision ? '-rev' + st.gen.revision : '') + '-' + s.num + (st.view === 'redline' ? '-redline' : st.view === 'markup' ? '-markup' : '');
      try {
        btn && (btn.disabled = true);
        if (as === 'svg') return save(name + '.svg', s.svg, 'image/svg+xml');
        if (as === 'png') { const c = await svgToCanvas(s.svg, sheetPx(36)); const b = await new Promise(r => c.toBlob(r, 'image/png')); return save(name + '.png', b, 'image/png'); }
        save(name + '.pdf', await sheetsToPdf([s], st.size, st.model.title + ' ' + s.num), 'application/pdf');
      } catch (e) { toast(e.message || String(e), true); } finally { btn && (btn.disabled = false); }
    }
    /** Full-size viewer. "✎ Comment" pins a note on the spot you click (saved with the set). */
    function viewer(i) {
      document.getElementById('du-dit24-view')?.remove();
      const canMark = !!st.gen?.id && st.optionView < 0;
      document.body.insertAdjacentHTML('beforeend', `<div id="du-dit24-view" class="du-dit24-view" role="dialog" aria-modal="true" aria-label="Sheet viewer"><div class="du-dit24-vbar"><b data-t></b><span>${canMark ? '<button type="button" class="du-dit25-cbtn" data-c aria-pressed="false">✎ Comment</button>' : ''}<button type="button" data-z="-1" aria-label="Zoom out">−</button><button type="button" data-z="1" aria-label="Zoom in">+</button><button type="button" data-n="-1" aria-label="Previous sheet">‹</button><button type="button" data-n="1" aria-label="Next sheet">›</button><button type="button" data-x aria-label="Close">×</button></span></div>
        <div class="du-dit24-vbody"><div class="du-dit25-pinwrap"><img alt=""><div class="du-dit25-pins"></div></div></div><form class="du-dit25-pinform" hidden><b data-pt></b><input maxlength="1000" placeholder="What should change here? For example: move this door 3 ft to the right" required><button class="du-btn primary" type="submit">Add comment</button><button class="du-btn ghost" type="button" data-cancel>Cancel</button></form></div>`);
      const v = document.getElementById('du-dit24-view'), img = v.querySelector('img'), wrap = v.querySelector('.du-dit25-pinwrap'), pinsEl = v.querySelector('.du-dit25-pins'), form = v.querySelector('form'), cbtn = v.querySelector('[data-c]');
      let z = 1, url = '', marking = false, draft = null;
      const pins = () => { const s = st.shown[i]; pinsEl.innerHTML = st.marks.filter(mk => mk.sheet === s.num && mk.x != null && mk.status !== 'sent').map(mk => `<button type="button" class="du-dit25-pin" style="left:${(mk.x / 36).toFixed(3)}%;top:${(mk.y / 24).toFixed(3)}%" title="${esc(mk.text)}" aria-label="Comment ${esc(mk.n)}: ${esc(mk.text)}">${esc(mk.n)}</button>`).join('') + (draft ? `<span class="du-dit25-pin draft" style="left:${(draft.x / 36).toFixed(3)}%;top:${(draft.y / 24).toFixed(3)}%">+</span>` : ''); };
      const show = () => { if (url) URL.revokeObjectURL(url); const s = st.shown[i]; url = svgUrl(s.svg); img.src = url; img.alt = s.num + ' ' + s.title; v.querySelector('[data-t]').textContent = `${s.num} · ${s.title} (${i + 1} of ${st.shown.length})`; wrap.style.width = (z * 100) + '%'; draft = null; form.hidden = true; pins(); };
      const close = () => { if (url) URL.revokeObjectURL(url); v.remove(); document.removeEventListener('keydown', key); draw(); };
      const key = e => { if (e.target.tagName === 'INPUT') return; if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') { i = (i + 1) % st.shown.length; show(); } if (e.key === 'ArrowLeft') { i = (i - 1 + st.shown.length) % st.shown.length; show(); } };
      v.querySelector('[data-x]').onclick = close; document.addEventListener('keydown', key);
      v.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { i = (i + +b.dataset.n + st.shown.length) % st.shown.length; show(); });
      v.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { z = Math.max(1, Math.min(4, z + +b.dataset.z * 0.75)); wrap.style.width = (z * 100) + '%'; });
      if (cbtn) cbtn.onclick = () => { marking = !marking; cbtn.setAttribute('aria-pressed', String(marking)); wrap.classList.toggle('marking', marking); if (marking) toast('Click the spot on the drawing you want changed.'); };
      img.addEventListener('click', e => {
        if (!marking) return;
        const r = img.getBoundingClientRect(); draft = { x: Math.round((e.clientX - r.left) / r.width * 3600), y: Math.round((e.clientY - r.top) / r.height * 2400) };
        if (draft.x > 3125) { toast('Pin your comment on the drawing, not the title block.', true); draft = null; return; }
        pins(); form.hidden = false; v.querySelector('[data-pt]').textContent = 'Comment on ' + st.shown[i].num; form.querySelector('input').value = ''; form.querySelector('input').focus();
      });
      form.onsubmit = e => { e.preventDefault(); const t = form.querySelector('input').value.trim(); if (!t || !draft) return; addMark({ sheet: st.shown[i].num, x: draft.x, y: draft.y, text: t }); draft = null; form.hidden = true; pins(); toast('Comment pinned. Add more, or close the viewer and press Regenerate.'); };
      form.querySelector('[data-cancel]').onclick = () => { draft = null; form.hidden = true; pins(); };
      show(); v.querySelector('[data-x]').focus();
    }
    async function openSaved(id, view) {
      out.innerHTML = '<p class="du-muted">Opening the drawing set…</p>';
      const { data, error } = await sb().from('drawing_generations').select('*').eq('id', id).eq('owner_id', u.id).maybeSingle();
      if (error || !data) { out.innerHTML = `<p class="du-muted">That drawing set could not be opened${error ? ': ' + esc(error.message) : ''}.</p>`; return; }
      st.status = data.issue_status || 'Preliminary'; st.reviewer = data.reviewer || st.reviewer; st.license = data.license_no || st.license;
      f('status').value = STATUSES.includes(st.status) ? st.status : 'Preliminary'; f('reviewer').value = st.reviewer; f('license').value = st.license;
      if (data.location) f('location').value = data.location; if (data.notes) f('notes').value = data.notes; if (data.project_thread_id) f('project').value = data.project_thread_id;
      st.sourceImage = data.source_paths?.[0] ? await sourceDataUrl(data.source_paths[0]) : '';
      await loadResult(data, data.model);
      if (view && view !== 'clean' && (view !== 'redline' || st.parent)) { st.view = view; await draw(); }
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function refreshRecent() { const r = $('.du-dit24-recent'); if (!r) return; recentInline(r); }
    async function recentInline(r) {
      let sets; try { sets = await listSets({ limit: 12 }); } catch (e) { r.innerHTML = `<p class="du-muted">${esc(e.message)}</p>`; return; }
      if (sets.missing) { r.innerHTML = '<p class="du-muted">Run the v24 SQL in Supabase to save drawing sets.</p>'; return; }
      const latestOnly = sets.filter(s => !sets.some(o => (o.root_id || o.id) === (s.root_id || s.id) && (o.revision || 0) > (s.revision || 0)));
      r.innerHTML = latestOnly.length ? latestOnly.slice(0, 8).map(s => card(s, true)).join('') : '<p class="du-muted">Your drawing sets show here.</p>';
      r.querySelectorAll('[data-dit-open]').forEach(b => b.onclick = () => openSaved(b.dataset.ditOpen));
    }
    refreshRecent();
    (async () => {
      if (opts.setId) await openSaved(opts.setId, extra?.view);
      if (extra?.comments?.length && st.gen?.id) { extra.comments.map(String).filter(Boolean).forEach(t => addMark({ sheet: '', x: null, y: null, text: t.slice(0, 1000), from: 'chat' })); await draw(); if (extra.regenerate) regenerate(openMarks()); }
    })();
    return { openSaved, regenerate: (comments, mode) => { comments.forEach(t => addMark({ sheet: '', x: null, y: null, text: String(t).slice(0, 1000) })); return regenerate(openMarks(), mode); }, addPictures: pics => { st.pics.push(...pics); st.pics = st.pics.slice(0, MAX_FILES); showPics(); } };
  }

  /* Sidebar quick links under Projects: Draw it up + Check it. */
  function sideLinks() {
    const side = document.querySelector('.du-side'); if (!side || side.querySelector('.du-dit24-sub')) return;
    const proj = side.querySelector('[data-portal-tab="projects"]'); if (!proj) return;
    proj.insertAdjacentHTML('afterend', `<div class="du-dit24-sub"><button type="button" data-sub="draw"><span>↳</span>Draw it up</button><button type="button" data-sub="check"><span>↳</span>Check it</button></div>`);
    side.querySelector('[data-sub="draw"]').onclick = () => openInCoach({});
    side.querySelector('[data-sub="check"]').onclick = () => { history.replaceState(null, '', '#portal/check?quick=1'); P()?.openPortalTab?.('check'); };
  }
  (function waitSide(n = 0) { if (document.querySelector('.du-side [data-portal-tab="projects"]')) { sideLinks(); return; } if (n < 600) setTimeout(() => waitSide(n + 1), 500); })();
  new MutationObserver(() => { if (document.querySelector('.du-side [data-portal-tab="projects"]') && !document.querySelector('.du-dit24-sub')) sideLinks(); }).observe(document.documentElement, { childList: true, subtree: true });

  /** Quick access block for the Projects page. */
  function quickAccess(host) {
    host.innerHTML = `<div class="du-dit24-quick"><button type="button" data-q="draw"><b>✎ Draw it up</b><span>Picture in, drawing set out: preliminary, full set, or 3 options to explore. Comment on the drawings and regenerate.</span></button><button type="button" data-q="check"><b>✓ Check it</b><span>Find problems and code issues in a drawing or set, with the fix drawn on your template.</span></button><button type="button" data-q="coach"><b>✦ Ask Arch Coach</b><span>Attach pictures or files to a thread and ask about codes, details or construction.</span></button></div>`;
    host.querySelector('[data-q="draw"]').onclick = () => openInCoach({});
    host.querySelector('[data-q="check"]').onclick = () => { history.replaceState(null, '', '#portal/check?quick=1'); P()?.openPortalTab?.('check'); };
    host.querySelector('[data-q="coach"]').onclick = () => P()?.openPortalTab?.('arch-coach');
  }

  window.DrawUpDrawIt = { mount, recent, quickAccess, openInCoach, open, latest, sideLinks, readPictures, imageToJpeg };
})();
