/* DrawUp v25.1 "Draw a detail" (Details tab).
 * - Upload ONE detail (PNG / JPG / WebP, or a PDF of up to 4 pages). DrawUp finds the flaws, explains each fix and why it is
 *   needed, and redraws it as one clean detail at a standard architectural scale (true to scale on the 8 x 6 in PDF).
 * - DWG / DXF / RVT / RFA / IFC / SKP can't be read in the browser or by the AI: the page says so and explains how to
 *   export the detail view to PDF or an image first.
 * - /api/details/draw runs the AI as a background job (ticket + polling, kept in localStorage so a closed tab picks it up),
 *   the same pattern as Draw it up. The finished detail is saved in details (source 'drawup_ai') and shows in the
 *   Detail Catalog (drawup-details-v21.js) and as a reference in Draw it up sets.
 * - toDetail(row) turns a saved row into a Detail Library kit detail (drawup-details-kit-v21.js): the drawing model is in
 *   real inches, and the largest standard scale that fits the drawing area is picked.
 * v25.1-03 (SQL v25.1-03), working on one detail:
 * - The viewer has tabs: Review, Comment + regenerate (pins on the drawing or general notes, extra screenshots / set pages
 *   when DrawUp asks for more), Team (ask the AI team, plus the members' comments) and Approve. Every revision is kept.
 * - Sheet references: detail_no + sheet_no ("C2" on "A601") are read from the bubble or typed in. Files are named
 *   "C2-A601 - Project - Revision 1 - 10-21-2026" and the Details tab finds "C2-A601" (also #portal/details?ref=C2-A601).
 * - From a set: "Work on this detail" in a Draw it up set (drawup-drawit-v24.js handoff()), or box one detail on a page of
 *   an uploaded set PDF. Approving a revision puts it back in that one spot: the Draw it up set draws it in that slot, and
 *   for a set PDF a new PDF is made with only that box replaced (pdf-lib), every other page and drawing untouched.
 * window.DrawUpDetailDraw = { toDetail, viewer, panel, urlOf, svgOf, download, handoff, fileBase, lookup, normRef, replaceInPdf }
 */
(function () {
  'use strict';
  if (window.DrawUpDetailDraw) return;
  const BUCKET = 'drawup-private', MAX_PAGES = 4, POLL_MS = 4000, PENDING_KEY = 'du-dd25-pending', COST = 15, REVISE_COST = 10, ASK_COST = 1;
  const PDFJS = '/vendor/pdfjs-3.11.174/pdf.min.js', PDFJS_WORKER = '/vendor/pdfjs-3.11.174/pdf.worker.min.js', PDFLIB = '/vendor/pdf-lib-1.17.1.min.js';
  const CAD = /\.(dwg|dxf|rvt|rfa|rte|ifc|skp|3dm|dgn|pln)$/i;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sb = () => window.DrawUpPortal?.ctx?.()?.client || window.drawupSupabaseClient;
  const me = () => window.DrawUpPortal?.ctx?.()?.user || null;
  const KIT = () => window.DrawUpDetailKit;
  const uuid = () => (crypto.randomUUID && crypto.randomUUID()) || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); });
  const toast = (m, bad) => { const P = window.DrawUpPortal?.ctx?.(); if (P?.toast) P.toast(m, bad); else console[bad ? 'warn' : 'log'](m); };
  const local = { get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (_e) { return d; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (_e) { /* private window */ } } };
  const store = { get() { const j = local.get(PENDING_KEY, null); return j && Date.now() - j.at < 6 * 3600 * 1000 ? j : null; }, set(j) { local.set(PENDING_KEY, j || null); } };
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
  async function pdfjs() { if (!window.pdfjsLib) await loadScript(PDFJS); window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return window.pdfjsLib; }
  async function pdflib() { if (!window.PDFLib) await loadScript(PDFLIB); return window.PDFLib; }

  /* ------------------------------------------------------------------ names + sheet references */
  /** "d4 / a601" -> "D4-A601" */
  const normRef = q => String(q || '').toUpperCase().trim().replace(/\s*[\/\\]\s*|\s+/g, '-').replace(/[^A-Z0-9.\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const refOf = row => row.sheet_ref || (row.detail_no && row.sheet_no ? normRef(row.detail_no + '-' + row.sheet_no) : row.detail_no || '');
  const usDate = v => { const d = v ? new Date(v) : new Date(); return isNaN(d) ? String(v) : `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`; };
  /** "C2-A601 - Project Name - Revision 1 - 10-21-2026" (characters files can't hold are removed). */
  function fileBase(row) {
    const parts = [refOf(row) || row.detail_code || 'Detail', row.project_name || row.title || 'DrawUp detail', 'Revision ' + (row.revision || 0), usDate(row.created_at)];
    return parts.map(p => String(p).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()).join(' - ').slice(0, 180);
  }

  /* ------------------------------------------------------------------ drawing model -> kit detail */
  // Printed inches per real foot -> px per real inch (the kit draws 100 px per printed inch).
  const SCALES = [['3" = 1\'-0"', 3], ['1 1/2" = 1\'-0"', 1.5], ['1" = 1\'-0"', 1], ['3/4" = 1\'-0"', 0.75], ['1/2" = 1\'-0"', 0.5], ['3/8" = 1\'-0"', 0.375], ['1/4" = 1\'-0"', 0.25], ['1/8" = 1\'-0"', 0.125]].map(([l, i]) => [l, i * 100 / 12]);
  const AREA = { x0: 34, x1: 404, y0: 46, y1: 500 }; // px; notes go to the right of x1 (kit NX)
  const cache = new Map();
  /** opt.shrink < 1: the 8 x 6 in sheet will be printed smaller (a box in a set PDF), so the scale is picked for the printed size. */
  function toDetail(row, opt = {}) {
    const shrink = Math.min(1, Math.max(0.05, Number(opt.shrink) || 1)), key = row.id + ':' + shrink;
    if (cache.has(key) && cache.get(key).row === row) return cache.get(key).d;
    const g = row.drawing || {}, els = g.elements || [], dims = (g.dims || []).map(dm => Math.abs(dm.y2 - dm.y1) <= Math.abs(dm.x2 - dm.x1) ? { ...dm, y2: dm.y1 } : { ...dm, x2: dm.x1 });
    const xs = [], ys = [];
    els.forEach(e => { if (e.kind === 'circle') { const [c, r] = e.pts; xs.push(c[0] - r[0], c[0] + r[0]); ys.push(c[1] - r[0], c[1] + r[0]); } else e.pts.forEach(p => { xs.push(p[0]); ys.push(p[1]); }); });
    dims.forEach(dm => { const hz = dm.y1 === dm.y2; xs.push(dm.x1, dm.x2, hz ? dm.x1 : dm.x1 + dm.offset); ys.push(dm.y1, dm.y2, hz ? dm.y1 + dm.offset : dm.y1); });
    if (!xs.length) { xs.push(0, 12); ys.push(0, 12); }
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys), w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    const aw = AREA.x1 - AREA.x0 - 24, ah = AREA.y1 - AREA.y0 - 24;
    const sc = SCALES.find(([, kp]) => w * kp / shrink <= aw && h * kp / shrink <= ah) || SCALES[SCALES.length - 1], k = sc[1] / shrink;
    const ox = AREA.x0 + (AREA.x1 - AREA.x0 - w * k) / 2 - minX * k, oy = AREA.y1 - (AREA.y1 - AREA.y0 - h * k) / 2 + minY * k;
    const dash = v => (v && v !== 'none' ? v : undefined);
    const box = p => { const [a, b] = p; return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])]; };
    const rev = row.revision ? ' REV ' + row.revision : '';
    const d = {
      id: 'ai-' + row.id, code: (row.detail_code || 'AI') + rev, title: row.title, cat: row.category, mat: row.material || '', asm: row.assembly || '', scale: sc[0], views: g.view || '',
      no: row.detail_no || '1', bubble: row.sheet_no || 'AI', badge: 'DRAWUP AI DETAIL', foot1: (row.project_name ? String(row.project_name).toUpperCase().slice(0, 40) + ' · ' : '') + 'AI-DRAWN · NOT FOR CONSTRUCTION',
      fileBase: fileBase(row), k, ox, oy, row,
      draw(K) {
        const L = K(k, ox, oy);
        for (const e of els) {
          const p = e.pts;
          try {
            if (e.kind === 'rect') { const [x, y, bw, bh] = box(p); L.rect(x, y, bw, bh, e.fill, e.weight, dash(e.dash)); }
            else if (e.kind === 'blk' || e.kind === 'blk1') { const [x, y, bw, bh] = box(p); L[e.kind](x, y, bw, bh); }
            else if (e.kind === 'batt') { const [x, y, bw, bh] = box(p); L.batt(x, y, bw, bh, bw > bh ? 'h' : 'v'); }
            else if (e.kind === 'poly') L.poly(p, e.fill, e.weight);
            else if (e.kind === 'polyline') L.pl(p, e.weight, dash(e.dash));
            else if (e.kind === 'line') L.ln(p[0][0], p[0][1], p[1][0], p[1][1], e.weight, dash(e.dash));
            else if (e.kind === 'circle') L.circ(p[0][0], p[0][1], p[1][0], e.fill, e.weight);
            else if (e.kind === 'brk') L.brk(p[0][0], p[0][1], p[1][0], p[1][1]);
          } catch (_e) { /* one bad element never breaks the drawing */ }
        }
        dims.forEach(dm => L.dim(dm.x1, dm.y1, dm.x2, dm.y2, dm.label, dm.offset || 0));
        (g.notes || []).forEach(nt => L.note(nt.x, nt.y, nt.text));
      },
    };
    cache.set(key, { row, d });
    return d;
  }
  const svgOf = (row, opt) => KIT().sheet(toDetail(row, opt));
  const urlOf = row => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgOf(row));
  const download = (row, fmt) => window.DrawUpDetails?.download ? window.DrawUpDetails.download(toDetail(row), fmt) : toast('Open the Details tab to download.', true);
  async function svgToCanvas(svg, pxW) {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })), img = new Image();
    try {
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('The detail could not be drawn.')); img.src = url; });
      const c = document.createElement('canvas'); c.width = pxW; c.height = Math.round(pxW * (img.naturalHeight || 600) / (img.naturalWidth || 800));
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally { URL.revokeObjectURL(url); }
  }

  /* ------------------------------------------------------------------ server calls */
  const token = async () => (await sb()?.auth.getSession())?.data?.session?.access_token || '';
  const api = async body => fetch('/api/details/draw', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, body: JSON.stringify(body) });
  async function call(body) { const res = await api(body); const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.error || 'DrawUp could not do that (' + res.status + ').'); return d; }
  async function pollJob(ticket, onTick, startedAt = Date.now(), keep = true) {
    let misses = 0;
    for (;;) {
      await new Promise(r => setTimeout(r, POLL_MS));
      onTick?.((Date.now() - startedAt) / 1000);
      let res, d;
      try { res = await api({ poll: ticket }); d = await res.json(); }
      catch (_e) { if (++misses > 15) throw new Error('DrawUp lost the connection while drawing. It keeps going: open the Details tab again later to collect it.'); continue; }
      misses = 0;
      if (d.status === 'done') { if (keep) store.set(null); return d; }
      if (!res.ok || d.final) { if (keep) store.set(null); throw new Error(d.error || 'The detail could not be drawn (' + res.status + ').'); }
    }
  }
  /** Uploads pictures to the member's private folder; a picture that fails to upload is sent inline. */
  async function uploadPictures(pics, folder) {
    const u = me(), out = [];
    for (let i = 0; i < pics.length; i++) {
      let path = '';
      try { const p = `${u.id}/details/${folder}/source-${Date.now().toString(36)}-${i + 1}.jpg`; const up = await sb().storage.from(BUCKET).upload(p, await (await fetch(pics[i].dataUrl)).blob(), { contentType: 'image/jpeg', upsert: true }); if (!up.error) path = p; } catch (_e) { /* sent inline */ }
      out.push(path ? { path, label: pics[i].label || '' } : { image: pics[i].dataUrl, label: pics[i].label || '' });
    }
    return out;
  }
  async function readFiles(files, max = MAX_PAGES) {
    const D = window.DrawUpDrawIt;
    if (D?.readPictures) return (await D.readPictures(files)).slice(0, max);
    const out = [];
    for (const f of files) {
      if (!/^image\//.test(f.type)) throw new Error('PDF reading is still loading. Try again in a moment.');
      out.push({ name: f.name, dataUrl: await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); }) });
    }
    return out.slice(0, max);
  }
  const cadMessage = names => `<b>${esc(names.join(', '))}:</b> DrawUp can't read DWG, DXF, RVT or other CAD / BIM model files directly yet; they need AutoCAD or Revit to open. Export just this detail first: in <b>AutoCAD</b>, Plot the detail's layout or window to <b>PDF</b> (DWG To PDF.pc3) or export a PNG; in <b>Revit</b>, open the detail or drafting view (or the sheet) and use <b>Export → PDF</b> or <b>Export → Images</b>. Then drop that file here.`;

  /* ------------------------------------------------------------------ review html */
  const SEV = { critical: 'CRITICAL', major: 'MAJOR', minor: 'MINOR' };
  const infoHtml = (row, button = true) => (row.needs_more_info && (row.info_requests || []).length ? `<div class="dd25-need"><b>DrawUp needs a bit more to make this detail accurate</b><ul>${row.info_requests.map(t => `<li>${esc(t)}</li>`).join('')}</ul>${button ? '<button type="button" class="du-btn ghost" data-goto="revise">Add screenshots or set pages →</button>' : ''}</div>` : '');
  function reviewHtml(row) {
    const r = row.review || {}, flaws = r.flaws || [], changes = r.changes || [];
    return `${infoHtml(row)}${r.source_reading ? `<p class="dd25-read"><b>What DrawUp read:</b> ${esc(r.source_reading)}</p>` : ''}
      ${row.revision && changes.length ? `<h4>What changed in revision ${esc(row.revision)}</h4><ul class="dd25-changes">${changes.map(c => `<li class="${c.done === false ? 'no' : ''}"><b>${c.done === false ? '✗ Not changed' : '✓'}${c.comment ? ' · comment ' + esc(c.comment) : ''}</b> ${esc(c.what)}</li>`).join('')}</ul>` : ''}
      <h4>Flaws found and how the clean detail fixes them <small>${flaws.length}</small></h4>
      ${flaws.length ? `<ol class="dd25-flaws">${flaws.map(f => `<li><span class="dd25-sev sev-${esc(f.severity)}">${SEV[f.severity] || 'NOTE'}</span><b>${esc(f.flaw)}</b><p><em>Why it matters:</em> ${esc(f.why)}</p><p><em>Fix:</em> ${esc(f.fix)}</p>${f.reference ? `<p class="dd25-ref">Reference: ${esc(f.reference)}</p>` : ''}</li>`).join('')}</ol>` : '<p class="dd21-note">No flaws were found in the upload. The clean detail is redrawn to DrawUp standards.</p>'}
      ${(r.general_notes || []).length ? `<h4>General notes</h4><ul class="dd25-list">${r.general_notes.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${(r.assumptions || []).length ? `<h4>Assumptions</h4><ul class="dd25-list">${r.assumptions.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`;
  }
  const refLine = row => [refOf(row) ? (row.detail_no && row.sheet_no ? `Detail ${row.detail_no} on ${row.sheet_no}` : refOf(row)) : '', row.project_name, 'Revision ' + (row.revision || 0), usDate(row.created_at)].filter(Boolean).join(' · ');
  const setLine = ss => (!ss ? '' : ss.kind === 'drawup' ? `From your Draw it up set · ${ss.slot}${ss.title ? ' ' + ss.title : ''}` : `From ${ss.file_name || 'your set PDF'} · page ${ss.page}${ss.pages ? ' of ' + ss.pages : ''}`);

  /* sheet reference fields (shared by the panel and the viewer) */
  const refFields = (r = {}) => `<div class="dd25-reff">
      <label>Detail no.<input data-ref="detail_no" maxlength="12" placeholder="C2" value="${esc(r.detail_no || '')}"></label>
      <label>Sheet no.<input data-ref="sheet_no" maxlength="16" placeholder="A601" value="${esc(r.sheet_no || '')}"></label>
      <label class="wide">Project name<input data-ref="project_name" maxlength="120" placeholder="Smith Residence" value="${esc(r.project_name || '')}"></label>
      <label>Set revision<input data-ref="revision" maxlength="20" placeholder="2" value="${esc(r.rev_label || '')}"></label>
      <label>Set date<input data-ref="date" maxlength="30" placeholder="10/21/2026" value="${esc(r.drawing_date || '')}"></label>
      ${r.id ? '<button type="button" class="du-btn ghost" data-refsave>Save reference</button>' : ''}</div>`;
  const readRef = el => { const o = {}; el.querySelectorAll('[data-ref]').forEach(i => { o[i.dataset.ref] = i.value.trim(); }); return o; };

  /* ------------------------------------------------------------------ the detail viewer */
  async function chainOf(row) {
    const root = row.root_id || row.id;
    const { data } = await sb().from('details').select('*').eq('source', 'drawup_ai').or(`id.eq.${root},root_id.eq.${root}`).order('revision').then(x => x, () => ({}));
    return (data || []).filter(r => r.drawing);
  }
  const draftKey = id => 'du-dd25-c-' + id;

  function viewer(row, opts = {}) {
    document.getElementById('dd21-view')?.remove();
    const d = toDetail(row), u = me(), mine = !!(row.owner_id && u && row.owner_id === u.id), signedIn = !!(u && !u.is_anonymous);
    const V = { tab: opts.tab || (row.needs_more_info && mine ? 'revise' : 'review'), comments: local.get(draftKey(row.id), []), pics: [], chain: [row], answers: [], busy: false, pinMode: false };
    document.body.insertAdjacentHTML('beforeend', `<div id="dd21-view" class="dd21-view dd25-view" role="dialog" aria-modal="true" aria-label="${esc(row.title)}"><div class="dd21-vcard">
      <button type="button" class="dd21-x" aria-label="Close">×</button>
      <div class="dd21-vimg dd25-vimg"><div class="dd25-stage"><img src="${urlOf(row)}" alt="${esc(row.title)}"><div class="dd25-pins"></div></div><p class="dd25-pinhelp" hidden>Click the drawing where the change goes. Esc to stop.</p></div>
      <aside class="dd21-vside dd25-side"><span class="dd21-kick dd21-ai">AI-DRAWN · ${esc(d.code)}${row.visibility === 'private' ? ' · PRIVATE' : ' · IN THE CATALOG'}${row.approved_at ? ' · <b class="dd25-ok">APPROVED</b>' : ''}</span><h2>${esc(row.title)}</h2>
        <p class="dd25-refline">${esc(refLine(row))}</p>${row.source_set ? `<p class="dd21-note">${esc(setLine(row.source_set))}</p>` : ''}
        <div class="dd25-revs" role="group" aria-label="Revisions"></div>
        <div class="dd21-acts dd21-big"><button type="button" data-dd25-dl="pdf">Download PDF (to scale)</button><button type="button" data-dd25-dl="png">PNG</button><button type="button" data-dd25-dl="svg">SVG</button>${mine ? `<button type="button" data-dd25-share>${row.visibility === 'private' ? 'Add to the DrawUp catalog' : 'Make private'}</button>` : ''}</div>
        <p class="dd21-note dd25-fname">Saves as “${esc(fileBase(row))}”</p>
        <div class="dd25-tabs" role="tablist"><button type="button" role="tab" data-tab="review">Review</button><button type="button" role="tab" data-tab="revise">Comment + regenerate</button><button type="button" role="tab" data-tab="team">Team</button>${mine ? '<button type="button" role="tab" data-tab="approve">Approve</button>' : ''}</div>
        <div class="dd25-pane" data-pane="review">${reviewHtml(row)}</div>
        <div class="dd25-pane" data-pane="revise"></div>
        <div class="dd25-pane" data-pane="team"><div class="dd25-ask"></div><h4>Comments from members and architects</h4><div class="dd21-vside dd25-members" data-detail-key="${esc('upload:' + row.id)}"></div></div>
        ${mine ? '<div class="dd25-pane" data-pane="approve"></div>' : ''}
        <p class="dd21-warn">Drawn by DrawUp AI from a member's upload. Not reviewed by DrawUp and not for construction: a licensed professional must verify it for the project, the adopted code and the AHJ.</p>
      </aside></div></div>`);
    const v = document.getElementById('dd21-view'), $ = s => v.querySelector(s);
    const close = () => { v.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') { if (V.pinMode) { setPin(false); return; } close(); } };
    $('.dd21-x').onclick = close; v.onclick = e => { if (e.target === v) close(); }; document.addEventListener('keydown', key);
    v.querySelectorAll('[data-dd25-dl]').forEach(b => b.onclick = () => download(row, b.dataset.dd25Dl));
    const sh = $('[data-dd25-share]');
    if (sh) sh.onclick = async () => { const to = row.visibility === 'private' ? 'drawup' : 'private'; const { error } = await sb().from('details').update({ visibility: to, updated_at: new Date().toISOString() }).eq('id', row.id); if (error) return toast(error.message, true); row.visibility = to; toast(to === 'drawup' ? 'Added to the DrawUp Detail Catalog.' : 'Now only you can see it.'); close(); window.DrawUpDetails?.reload?.(); };
    const show = tab => { V.tab = tab; v.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab))); v.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== tab; }); if (tab !== 'revise') setPin(false); };
    v.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => show(b.dataset.tab));
    v.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) show(g.dataset.goto); });

    /* pins: x, y in the drawing's real inches (same origin as the model), so the AI knows exactly where */
    const stage = $('.dd25-stage');
    const paintPins = () => { $('.dd25-pins').innerHTML = V.comments.map((c, i) => c.x == null ? '' : `<span class="dd25-pin" style="left:${((d.ox + c.x * d.k) / 8).toFixed(2)}%;top:${((d.oy - c.y * d.k) / 6).toFixed(2)}%">${i + 1}</span>`).join(''); };
    const setPin = on => { V.pinMode = on; stage.classList.toggle('pinning', on); $('.dd25-pinhelp').hidden = !on; };
    stage.onclick = e => {
      if (!V.pinMode) return;
      const r = stage.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * 800, py = (e.clientY - r.top) / r.height * 600;
      setPin(false);
      const text = prompt('What should change here?');
      if (text && text.trim()) addComment({ text: text.trim(), x: Math.round((px - d.ox) / d.k * 10) / 10, y: Math.round((d.oy - py) / d.k * 10) / 10 });
    };
    function addComment(c) { V.comments.push({ text: String(c.text).slice(0, 800), x: c.x ?? null, y: c.y ?? null, from: c.from || '' }); local.set(draftKey(row.id), V.comments); paintPins(); paintRevise(); }

    /* Comment + regenerate (also "upgrade with more pictures") */
    function paintRevise() {
      const p = $('[data-pane="revise"]');
      if (!signedIn) { p.innerHTML = '<p class="dd21-note">Sign in to comment and regenerate this detail.</p>'; return; }
      const typed = p.querySelector('.dd25-cadd textarea')?.value || '';
      p.innerHTML = `${infoHtml(row, false)}
        <p class="dd21-note">Pin a comment on the drawing or write a general one. Add screenshots or pages from the set if DrawUp needs more. Regenerating saves a new revision; this one stays as Revision ${esc(row.revision || 0)}.${mine ? '' : ' Your revision is saved to your own details.'}</p>
        <ol class="dd25-comments">${V.comments.map((c, i) => `<li><b>${i + 1}</b><span>${c.x != null ? '<em>Pinned</em> ' : ''}${c.from ? `<em>${esc(c.from)}</em> ` : ''}${esc(c.text)}</span><button type="button" data-rmc="${i}" aria-label="Remove comment ${i + 1}">×</button></li>`).join('') || '<li class="dd21-note">No comments yet.</li>'}</ol>
        <div class="dd25-cadd"><textarea rows="2" maxlength="800" placeholder="Example: show the ice barrier lapped 24 in. past the inside face of the wall"></textarea><div><button type="button" class="du-btn ghost" data-addc>Add comment</button><button type="button" class="du-btn ghost" data-pin>📍 Pin on the drawing</button><button type="button" class="du-btn ghost" data-import>Add the team's comments</button></div></div>
        <label class="dd25-drop dd25-drop-sm" tabindex="0"><input type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,.pdf,.dwg,.rvt"><b>Add screenshots or set pages</b><span>Up to ${MAX_PAGES}: the wall section, the window product detail, the sheet this detail is on…</span></label>
        <p class="dd25-cad" hidden></p><div class="dd25-pics">${V.pics.map((x, i) => `<figure><img src="${x.dataUrl}" alt=""><figcaption>${esc(x.name)}</figcaption><button type="button" data-rmp="${i}" aria-label="Remove ${esc(x.name)}">×</button></figure>`).join('')}</div>
        <details class="dd25-refbox"${refOf(row) ? '' : ' open'}><summary>Sheet reference (names the file and finds it in Details)</summary>${refFields(row)}</details>
        <div class="dd25-go"><button type="button" class="du-btn primary" data-regen ${V.comments.length || V.pics.length ? '' : 'disabled'}>${V.pics.length && !V.comments.length ? 'Upgrade the detail with these pictures' : `Regenerate with ${V.comments.length} comment${V.comments.length === 1 ? '' : 's'}`}</button><span class="dd21-note">${REVISE_COST} credits (unlimited accounts are not charged)</span></div>
        <p class="dd25-msg" aria-live="polite"></p><div class="dd25-progress" hidden><div class="dd25-bar"><i></i></div><span></span></div>`;
      p.querySelector('.dd25-cadd textarea').value = typed;
      p.querySelectorAll('[data-rmc]').forEach(b => b.onclick = () => { V.comments.splice(+b.dataset.rmc, 1); local.set(draftKey(row.id), V.comments); paintPins(); paintRevise(); });
      p.querySelectorAll('[data-rmp]').forEach(b => b.onclick = () => { V.pics.splice(+b.dataset.rmp, 1); paintRevise(); });
      p.querySelector('[data-addc]').onclick = () => { const ta = p.querySelector('.dd25-cadd textarea'), t = ta.value.trim(); if (t) { ta.value = ''; addComment({ text: t }); } };
      p.querySelector('[data-pin]').onclick = () => setPin(true);
      p.querySelector('[data-import]').onclick = importTeam;
      const input = p.querySelector('input[type=file]'), cad = p.querySelector('.dd25-cad');
      const add = async files => {
        const list = [...files], cadFiles = list.filter(f => CAD.test(f.name)), rest = list.filter(f => !CAD.test(f.name));
        if (cadFiles.length) { cad.hidden = false; cad.innerHTML = cadMessage(cadFiles.map(f => f.name)); }
        if (!rest.length) return;
        try { V.pics = [...V.pics, ...(await readFiles(rest))].slice(0, MAX_PAGES).map(x => ({ ...x, label: x.label || 'NEW PICTURE: ' + x.name })); } catch (e) { toast(e.message || String(e), true); }
        paintRevise();
      };
      input.onchange = () => { add(input.files); input.value = ''; };
      const drop = p.querySelector('.dd25-drop');
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); add(e.dataTransfer.files); });
      bindRefSave(p, row);
      p.querySelector('[data-regen]').onclick = regenerate;
    }
    async function importTeam() {
      const got = [];
      const { data } = await sb().from('detail_comments').select('body,verdict,conditions').eq('detail_key', 'upload:' + row.id).eq('hidden', false).in('verdict', ['incorrect', 'conditional', 'question', 'note']).order('created_at').limit(20).then(x => x, () => ({}));
      (data || []).forEach(c => got.push({ text: c.body + (c.conditions ? ' (' + c.conditions + ')' : ''), from: 'Member' }));
      V.answers.forEach(a => (a.suggestions || []).forEach(s => got.push({ text: s, from: a.speaker })));
      const have = new Set(V.comments.map(c => c.text)), fresh = got.filter(c => !have.has(c.text));
      if (!fresh.length) return toast('No new team comments to add. Ask the team in the Team tab first.');
      fresh.forEach(c => V.comments.push({ text: c.text.slice(0, 800), x: null, y: null, from: c.from })); local.set(draftKey(row.id), V.comments); paintRevise();
      toast(`${fresh.length} team comment${fresh.length === 1 ? '' : 's'} added.`);
    }
    async function regenerate() {
      if (V.busy) return;
      const p = $('[data-pane="revise"]'), msg = p.querySelector('.dd25-msg'), bar = p.querySelector('.dd25-progress');
      const prog = (sec, label) => { bar.hidden = false; bar.querySelector('i').style.width = Math.min(92, 8 + sec * 0.9) + '%'; bar.querySelector('span').textContent = label || (sec < 25 ? 'Reading your comments…' : 'Redrawing the detail…'); };
      V.busy = true; p.querySelector('[data-regen]').disabled = true; prog(0, 'Uploading…');
      try {
        const pictures = await uploadPictures(V.pics, row.id);
        const d0 = await call({ parent_id: row.id, comments: V.comments.map((c, i) => ({ n: String(i + 1), text: c.text, x: c.x, y: c.y })), pictures, sheet: readRef(p), notes: '' });
        store.set({ ticket: d0.ticket, at: Date.now(), parent: row.id });
        msg.textContent = 'DrawUp is making the next revision. This usually takes about a minute.';
        const done = await pollJob(d0.ticket, sec => prog(sec));
        local.set(draftKey(row.id), null);
        toast(`Revision ${done.detail?.revision ?? ''} is ready.`);
        window.DrawUpDetails?.reload?.();
        viewer(done.detail, { tab: 'review' });
      } catch (e) { bar.hidden = true; msg.textContent = e.message || String(e); toast(e.message || String(e), true); }
      finally { V.busy = false; const b = p.querySelector('[data-regen]'); if (b) b.disabled = false; }
    }

    /* Team: ask the AI team about this detail; members' comments mount below (drawup-detail-reviews-v24.js) */
    const VERD = { looks_right: ['Looks right', 'ok'], needs_changes: ['Needs changes', 'bad'], needs_more_info: ['Needs more info', 'cond'], answer: ['Answer', 'q'] };
    function paintAsk() {
      const box = $('.dd25-ask');
      box.innerHTML = `<h4>Ask the team about this detail</h4><p class="dd21-note">Arch Coach, your Teammate and the 6th Man read this drawing, its notes and the flaws, and answer here. Turn any answer into a comment for the next revision.</p>
        <div class="dd25-answers">${V.answers.map((a, i) => `<div class="dd25-qa"><p class="q">${esc(a.question)}</p><p class="a"><b>${esc(a.speaker)}</b> <span class="dd25-verd v-${(VERD[a.verdict] || VERD.answer)[1]}">${(VERD[a.verdict] || VERD.answer)[0]}</span><br>${esc(a.answer)}</p>${(a.suggestions || []).length ? `<ul>${a.suggestions.map((s, j) => `<li>${esc(s)} <button type="button" class="dd25-mini" data-sug="${i}:${j}">+ Comment</button></li>`).join('')}</ul>` : ''}${(a.info_requests || []).length ? `<div class="dd25-need"><b>To answer better, add:</b><ul>${a.info_requests.map(t => `<li>${esc(t)}</li>`).join('')}</ul><button type="button" class="du-btn ghost" data-goto="revise">Add screenshots →</button></div>` : ''}</div>`).join('')}</div>
        ${signedIn ? `<div class="dd25-chips">${['Is this detail right?', 'What is missing from this detail?', 'Does this meet code? What should I verify?', 'Will this work in a cold climate?'].map(t => `<button type="button" data-chip>${esc(t)}</button>`).join('')}</div>
        <div class="dd25-askrow"><textarea rows="2" maxlength="1500" placeholder="Ask about this detail…"></textarea><button type="button" class="du-btn primary" data-ask>Ask</button></div><p class="dd21-note">${ASK_COST} credit a question (unlimited accounts are not charged).${window.DrawUpTeam ? ' <button type="button" class="dd25-link" data-chat>Continue in AI Team chat →</button>' : ''}</p><p class="dd25-msg" aria-live="polite"></p>` : '<p class="dd21-note">Sign in to ask the team.</p>'}`;
      box.querySelectorAll('[data-sug]').forEach(b => b.onclick = () => { const [i, j] = b.dataset.sug.split(':').map(Number); const a = V.answers[i]; addComment({ text: a.suggestions[j], from: a.speaker }); b.disabled = true; b.textContent = 'Added'; });
      box.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => { box.querySelector('textarea').value = b.textContent; ask(); });
      const ab = box.querySelector('[data-ask]'); if (ab) ab.onclick = ask;
      const ch = box.querySelector('[data-chat]'); if (ch) ch.onclick = () => { close(); window.DrawUpTeam.open({ fresh: true, prefill: `About my detail "${row.title}" (${refOf(row) || d.code}, ${d.scale}): ` }); };
    }
    async function ask() {
      const box = $('.dd25-ask'), ta = box.querySelector('textarea'), q = ta.value.trim(), msg = box.querySelector('.dd25-msg');
      if (q.length < 3 || V.asking) return;
      V.asking = true; box.querySelector('[data-ask]').disabled = true; msg.textContent = 'The team is looking at the detail…';
      try {
        const t = await call({ ask: row.id, question: q });
        const done = await pollJob(t.ticket, sec => { msg.textContent = sec < 20 ? 'The team is looking at the detail…' : 'Writing the answer…'; }, Date.now(), false);
        V.answers.push(done.answer); paintAsk();
      } catch (e) { msg.textContent = e.message || String(e); }
      finally { V.asking = false; const b = box.querySelector('[data-ask]'); if (b) b.disabled = false; }
    }

    /* Approve: this revision goes back into its set */
    function paintApprove() {
      const p = $('[data-pane="approve"]'); if (!p) return;
      const ss = row.source_set;
      p.innerHTML = `<h4>${row.approved_at ? 'Approved ' + esc(new Date(row.approved_at).toLocaleDateString('en-US')) : 'Approve this revision'}</h4>
        <p class="dd21-note">${ss ? `Approving puts Revision ${esc(row.revision || 0)} back in ${ss.kind === 'drawup' ? `detail ${esc(ss.slot)} of your Draw it up set` : `the box you drew on page ${esc(ss.page)} of ${esc(ss.file_name || 'your set PDF')}`}. Only that one detail is replaced; every other sheet and drawing stays exactly the same.` : 'This detail is not linked to a set. Approving marks this revision as the one to use, and it is the one the catalog shows.'} Only one revision of a detail is approved at a time.</p>
        <div class="dd21-acts dd21-big">${row.approved_at ? `${ss?.kind === 'pdf' ? '<button type="button" data-setpdf>Download the updated set PDF</button>' : ''}${ss?.kind === 'drawup' ? '<button type="button" data-openset>Open the set</button>' : ''}<button type="button" data-unapprove>Take back the approval</button>` : `<button type="button" class="dd25-primary" data-approve>Approve Revision ${esc(row.revision || 0)}${ss ? ' + replace it in the set' : ''}</button>`}</div>
        <p class="dd25-msg" aria-live="polite"></p>`;
      const msg = p.querySelector('.dd25-msg');
      const ap = p.querySelector('[data-approve]');
      if (ap) ap.onclick = async () => {
        ap.disabled = true; msg.textContent = 'Approving…';
        try {
          const r = await call({ approve: row.id });
          row.approved_at = r.approved_at;
          if (r.set?.error) toast(r.set.error, true);
          toast(ss?.kind === 'drawup' && r.set && !r.set.error ? `Detail ${ss.slot} in your set now shows this revision.` : 'Approved.');
          window.DrawUpDetails?.reload?.(); paintApprove(); paintRevs();
          if (ss?.kind === 'pdf') { const m2 = p.querySelector('.dd25-msg'); m2.textContent = 'Making the updated set PDF…'; await replaceInPdf(row, txt => { m2.textContent = txt; }); }
        } catch (e) { p.querySelector('.dd25-msg').textContent = e.message || String(e); const b = p.querySelector('[data-approve]'); if (b) b.disabled = false; }
      };
      const un = p.querySelector('[data-unapprove]');
      if (un) un.onclick = async () => { try { await call({ unapprove: row.id }); row.approved_at = null; toast(ss?.kind === 'drawup' ? 'The set shows its original detail again.' : 'Approval taken back.'); paintApprove(); paintRevs(); } catch (e) { msg.textContent = e.message || String(e); } };
      const sp = p.querySelector('[data-setpdf]');
      if (sp) sp.onclick = async () => { sp.disabled = true; try { await replaceInPdf(row, txt => { msg.textContent = txt; }); } catch (e) { msg.textContent = e.message || String(e); } finally { sp.disabled = false; } };
      const os = p.querySelector('[data-openset]');
      if (os) os.onclick = () => { close(); window.DrawUpDrawIt?.open ? window.DrawUpDrawIt.open({ setId: ss.set_id, view: 'clean' }) : toast('Open Draw it up to see the set.'); };
    }

    async function paintRevs() {
      try { V.chain = await chainOf(row); } catch (_e) { V.chain = [row]; }
      const box = $('.dd25-revs'); if (!box || V.chain.length < 2) return;
      box.innerHTML = V.chain.map(r => `<button type="button" data-rev="${esc(r.id)}" aria-pressed="${r.id === row.id}">${r.revision ? 'Rev ' + esc(r.revision) : 'Original'}${r.approved_at ? ' ✓' : ''}</button>`).join('');
      box.querySelectorAll('[data-rev]').forEach(b => b.onclick = () => { const r = V.chain.find(x => x.id === b.dataset.rev); if (r && r.id !== row.id) viewer(r, { tab: V.tab }); });
    }
    (async () => { if (!signedIn) return; const { data } = await sb().from('detail_team_answers').select('*').eq('detail_id', row.id).order('created_at').limit(30).then(x => x, () => ({})); V.answers = data || []; if (V.answers.length) paintAsk(); })();
    paintRevise(); paintAsk(); paintApprove(); paintPins(); paintRevs(); show(V.tab);
    $('.dd21-x').focus();
  }

  function bindRefSave(el, row) {
    const b = el.querySelector('[data-refsave]'); if (!b) return;
    if (row.owner_id !== me()?.id) { b.remove(); return; }
    b.onclick = async () => {
      const r = readRef(el), ref = r.detail_no && r.sheet_no ? normRef(r.detail_no + '-' + r.sheet_no) : null;
      const fields = { detail_no: r.detail_no || null, sheet_no: r.sheet_no || null, sheet_ref: ref, project_name: r.project_name || null, rev_label: r.revision || null, drawing_date: r.date || null };
      const { error } = await sb().from('details').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', row.id);
      if (error) return toast(/column|schema/i.test(error.message) ? 'Run the v25.1-03 SQL in Supabase to save sheet references.' : error.message, true);
      Object.assign(row, fields); cache.clear();
      toast(ref ? `Saved. Search ${ref} in Details to open it.` : 'Saved.'); window.DrawUpDetails?.reload?.(); viewer(row, { tab: 'revise' });
    };
  }

  /* ------------------------------------------------------------------ set PDFs: pick the page, box the detail, put the approved one back */
  async function openSetPdf(bytes) { const L = await pdfjs(); return L.getDocument({ data: bytes.slice(0) }).promise; }
  /** The page whose biggest text matches the sheet number (title blocks print it largest). */
  async function findSheetPage(doc, sheetNo) {
    const want = String(sheetNo || '').toUpperCase().replace(/\s+/g, ''); if (!want) return 0;
    let best = 0, bestSize = 0;
    for (let i = 1; i <= Math.min(doc.numPages, 200); i++) {
      const page = await doc.getPage(i), tc = await page.getTextContent().catch(() => ({ items: [] }));
      for (const it of tc.items || []) { if (String(it.str || '').toUpperCase().replace(/\s+/g, '') !== want) continue; const size = Math.hypot(it.transform[2], it.transform[3]); if (size > bestSize) { bestSize = size; best = i; } }
    }
    return best;
  }
  async function renderPage(doc, n, pxW) {
    const page = await doc.getPage(n), v1 = page.getViewport({ scale: 1 }), scale = Math.min(pxW / v1.width, Math.sqrt(12e6 / (v1.width * v1.height))), vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: x, viewport: vp }).promise;
    return { page, canvas: c, vp };
  }
  /** Renders just the boxed region (normalized 0..1 of the displayed page) at a readable size. */
  async function renderCrop(page, rect, pxW = 1800) {
    const v1 = page.getViewport({ scale: 1 }), w = (rect[2] - rect[0]) * v1.width, h = (rect[3] - rect[1]) * v1.height;
    const scale = Math.min(pxW / w, Math.sqrt(12e6 / (w * h))), vp = page.getViewport({ scale, offsetX: -rect[0] * v1.width * scale, offsetY: -rect[1] * v1.height * scale });
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: x, viewport: vp }).promise;
    return c.toDataURL('image/jpeg', 0.9);
  }
  /** PDF user-space box [x0, y0, x1, y1] of a normalized display rect (handles /Rotate and offset media boxes). */
  function pdfRect(page, rect) {
    const v1 = page.getViewport({ scale: 1 }), a = v1.convertToPdfPoint(rect[0] * v1.width, rect[1] * v1.height), b = v1.convertToPdfPoint(rect[2] * v1.width, rect[3] * v1.height);
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])].map(n => Math.round(n * 100) / 100);
  }
  /** The newest copy of this set PDF (an earlier approved detail may already be in it), so replacements add up. */
  async function latestSetPath(ss) {
    const { data } = await sb().from('details').select('source_set').eq('owner_id', me().id).eq('source_set->>path', ss.path).not('source_set->>updated_path', 'is', null).then(x => x, () => ({}));
    const list = (data || []).map(r => r.source_set).filter(s => s?.updated_path).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    return list[0]?.updated_path || ss.path;
  }
  async function replaceInPdf(row, say = () => {}) {
    const ss = row.source_set; if (ss?.kind !== 'pdf' || !ss.pdf_rect) throw new Error('This detail is not linked to a box on a set PDF.');
    say('Getting your set PDF…');
    const base = await latestSetPath(ss), dl = await sb().storage.from(BUCKET).download(base);
    if (dl.error || !dl.data) throw new Error('Your set PDF could not be read from storage: ' + (dl.error?.message || 'missing'));
    const L = await pdflib(), doc = await L.PDFDocument.load(await dl.data.arrayBuffer(), { ignoreEncryption: true });
    const page = doc.getPage(Math.max(0, (ss.page || 1) - 1)), rot = ((page.getRotation().angle % 360) + 360) % 360;
    const [x0, y0, x1, y1] = ss.pdf_rect, bw = x1 - x0, bh = y1 - y0, side = rot === 90 || rot === 270, dw = side ? bh : bw, dh = side ? bw : bh;
    // The 8 x 6 in detail sheet at full size if it fits the box; smaller (with its scale re-picked) if not.
    const f = Math.min(1, dw / 576, dh / 432), iw = 576 * f, ih = 432 * f;
    say('Drawing the approved detail at scale…');
    const c = await svgToCanvas(svgOf(row, { shrink: f }), Math.min(3000, Math.max(800, Math.round(8 * f * 300))));
    const png = await doc.embedPng(await new Promise(res => c.toBlob(b => b.arrayBuffer().then(a => res(new Uint8Array(a))), 'image/png')));
    page.drawRectangle({ x: x0, y: y0, width: bw, height: bh, color: L.rgb(1, 1, 1) });
    const cx = x0 + bw / 2, cy = y0 + bh / 2;
    const at = rot === 90 ? { x: cx + ih / 2, y: cy - iw / 2 } : rot === 180 ? { x: cx + iw / 2, y: cy + ih / 2 } : rot === 270 ? { x: cx - ih / 2, y: cy + iw / 2 } : { x: cx - iw / 2, y: cy - ih / 2 };
    page.drawImage(png, { ...at, width: iw, height: ih, rotate: L.degrees(rot) });
    doc.setModificationDate(new Date());
    const bytes = await doc.save();
    const name = `${String(ss.file_name || 'Drawing set').replace(/\.pdf$/i, '')} - ${fileBase(row)}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ');
    say('Saving the updated set…');
    const dir = ss.path.split('/').slice(0, -1).join('/'), path = `${dir}/updated-${Date.now().toString(36)}.pdf`;
    const up = await sb().storage.from(BUCKET).upload(path, new Blob([bytes], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: true });
    if (!up.error) { const next = { ...ss, updated_path: path, updated_at: new Date().toISOString() }; const { error } = await sb().from('details').update({ source_set: next }).eq('id', row.id); if (!error) row.source_set = next; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    say(`Downloaded “${name}”. Only the detail on page ${ss.page} changed${f < 1 ? ` (drawn at ${toDetail(row, { shrink: f }).scale} to fit your box)` : ''}.`);
    return bytes;
  }

  /* ------------------------------------------------------------------ the Details tab panel */
  let pendingHandoff = null, livePanel = null;
  /** From Draw it up "Work on this detail": { pictures, notes, title, sheet, source_set, existing }. */
  function handoff(h) { pendingHandoff = h; if (livePanel?.isConnected && livePanel._take) livePanel._take(); }

  function panel(host) {
    const ctx = window.DrawUpPortal?.ctx?.() || {}, u = ctx.user;
    const wrap = document.createElement('section');
    wrap.className = 'dd25';
    wrap.innerHTML = `<div class="dd25-top"><div><span class="dd21-kick">DRAW A DETAIL · FIND THE FLAWS · CLEAN REDRAW</span><h2>Upload one detail. Get the flaws, the fixes and a clean detail to scale.</h2>
        <p class="dd21-note">DrawUp reads your detail, lists every flaw with why it matters and how it is fixed, and redraws it as one clean detail at a real architectural scale (PDF prints true to scale). It is not a full drawing set. Then comment and regenerate, ask the team, and approve it back into its set.</p></div>
        <button type="button" class="du-btn ghost dd25-toggle" aria-expanded="true">Hide</button></div>
      <div class="dd25-body">
        <div class="dd25-modes" role="group" aria-label="Where the detail comes from"><button type="button" data-mode="one" aria-pressed="true">A picture or PDF of the detail</button><button type="button" data-mode="set" aria-pressed="false">Pull it from a drawing set PDF</button></div>
        <p class="dd25-from" hidden></p>
        <div data-for="one"><label class="dd25-drop" tabindex="0"><input type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,.pdf,.dwg,.dxf,.rvt,.rfa,.ifc,.skp"><b>Add a picture or PDF of the detail</b><span>PNG, JPG, WebP or PDF (up to ${MAX_PAGES} pages) · DWG / RVT: export the detail view to PDF first</span></label></div>
        <div data-for="set" hidden><label class="dd25-drop" tabindex="0"><input type="file" accept="application/pdf,.pdf,.dwg,.rvt"><b>Add the drawing set PDF</b><span>Then pick the sheet and draw a box around the one detail. Only that detail is redrawn, and when you approve it DrawUp gives you the set back with just that box replaced.</span></label>
          <div class="dd25-set" hidden><div class="dd25-setbar"><label>Sheet no.<input data-findsheet maxlength="16" placeholder="A601"></label><button type="button" class="du-btn ghost" data-find>Find the sheet</button><span class="dd21-note" data-setinfo></span></div><div class="dd25-thumbs"></div><div class="dd25-crop" hidden><p class="dd21-note">Drag a box around the detail (include its bubble and title).</p><div class="dd25-cropstage"><canvas></canvas><i class="dd25-box" hidden></i></div><button type="button" class="du-btn primary" data-usebox disabled>Use this detail</button></div></div></div>
        <p class="dd25-cad" hidden></p>
        <div class="dd25-pics"></div>
        <label class="dd25-field">What is it? Add anything you know <textarea rows="2" maxlength="2000" placeholder="Example: roof section at the eave, asphalt shingles, 2x10 rafters, vented attic, climate zone 4A"></textarea></label>
        <details class="dd25-refbox"><summary>In a set? Add the detail and sheet number (C2 on A601) to name the file and find it later</summary>${refFields()}</details>
        <label class="dd21-chk dd25-share"><input type="checkbox" checked> Add the clean detail to the DrawUp Detail Catalog for everyone <small>(untick to keep it private)</small></label>
        <div class="dd25-go"><button type="button" class="du-btn primary" disabled>Find the flaws + draw the clean detail</button><span class="dd21-note">${COST} credits (unlimited accounts are not charged)</span></div>
        <p class="dd25-msg" aria-live="polite"></p>
        <div class="dd25-progress" hidden><div class="dd25-bar"><i></i></div><span></span></div>
        <div class="dd25-out"></div>
      </div>`;
    const head = host.querySelector('.dd21-head');
    (head || host.firstElementChild || host).insertAdjacentElement(head ? 'afterend' : 'beforebegin', wrap);
    livePanel = wrap;
    const $ = s => wrap.querySelector(s), go = $('.dd25-go button'), msg = $('.dd25-msg'), out = $('.dd25-out'), cad = $('.dd25-cad'), notesEl = $('.dd25-field textarea');
    const st = { pics: [], busy: false, mode: 'one', sourceSet: null, set: null };
    $('.dd25-toggle').onclick = e => { const b = e.currentTarget, open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(open)); b.textContent = open ? 'Hide' : 'Draw a detail'; $('.dd25-body').hidden = !open; };
    if (!u || u.is_anonymous) { $('.dd25-body').innerHTML = '<p class="dd21-note">Sign in to upload a detail and have DrawUp redraw it.</p>'; return; }
    const ready = () => { go.disabled = st.busy || !(st.pics.length || (st.sourceSet && notesEl.value.trim().length >= 15)); };
    const show = () => { $('.dd25-pics').innerHTML = st.pics.map((p, i) => `<figure><img src="${p.dataUrl}" alt=""><figcaption>${esc(p.name)}</figcaption><button type="button" data-rm="${i}" aria-label="Remove ${esc(p.name)}">×</button></figure>`).join(''); wrap.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { st.pics.splice(+b.dataset.rm, 1); if (st.mode === 'set' && !st.pics.length) st.sourceSet = null; show(); }); ready(); };
    notesEl.addEventListener('input', ready);
    const setMode = m => { st.mode = m; wrap.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m))); wrap.querySelectorAll('[data-for]').forEach(x => { x.hidden = x.dataset.for !== m; }); if (m === 'set') $('.dd25-refbox').open = true; };
    wrap.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
    const setRef = r => { Object.entries(r || {}).forEach(([k, val]) => { const i = wrap.querySelector(`[data-ref="${k}"]`); if (i && val) i.value = val; }); if (Object.values(r || {}).some(Boolean)) $('.dd25-refbox').open = true; };
    const bindDrop = (drop, onFiles) => {
      const input = drop.querySelector('input');
      input.onchange = () => { onFiles(input.files); input.value = ''; };
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); onFiles(e.dataTransfer.files); });
      drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    };
    async function add(files) {
      const list = [...files], cadFiles = list.filter(f => CAD.test(f.name)), rest = list.filter(f => !CAD.test(f.name));
      cad.hidden = !cadFiles.length; if (cadFiles.length) cad.innerHTML = cadMessage(cadFiles.map(f => f.name));
      if (!rest.length) return;
      msg.textContent = 'Reading your file…';
      try { st.pics = [...st.pics, ...(await readFiles(rest))].slice(0, MAX_PAGES); msg.textContent = st.pics.length >= MAX_PAGES ? `Using the first ${MAX_PAGES} pictures or pages. For a whole set, use "Pull it from a drawing set PDF".` : 'Ready. Add notes if you know sizes or the climate, then press the button.'; }
      catch (e) { msg.textContent = e.message || String(e); }
      show();
    }
    bindDrop($('[data-for="one"] .dd25-drop'), add);

    /* drawing set PDF: store it, show its pages, find the sheet, box the detail */
    bindDrop($('[data-for="set"] .dd25-drop'), async files => {
      const f = [...files][0]; if (!f) return;
      if (CAD.test(f.name)) { cad.hidden = false; cad.innerHTML = cadMessage([f.name]); return; }
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { msg.textContent = 'Use a PDF of the drawing set (or switch to "A picture or PDF of the detail").'; return; }
      cad.hidden = true; msg.textContent = 'Opening the set…';
      try {
        const bytes = new Uint8Array(await f.arrayBuffer()), doc = await openSetPdf(bytes), folder = uuid();
        st.set = { doc, name: f.name, pages: doc.numPages, path: '', uploading: null, page: 0, rect: null };
        $('.dd25-set').hidden = false; $('[data-setinfo]').textContent = `${f.name} · ${doc.numPages} page${doc.numPages === 1 ? '' : 's'}`;
        const safe = (f.name.replace(/\.pdf$/i, '').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-80) || 'set') + '.pdf', path = `${u.id}/sets/${folder}/${safe}`, s = st.set;
        s.uploading = sb().storage.from(BUCKET).upload(path, new Blob([bytes], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: true }).then(r => { if (!r.error) s.path = path; else toast('The set PDF could not be stored (' + r.error.message + '). You can still redraw the detail, but DrawUp can\'t put it back in the PDF.', true); }, () => {});
        msg.textContent = 'Pick the sheet, or type its number and press Find the sheet.';
        const want = wrap.querySelector('[data-ref="sheet_no"]').value.trim() || $('[data-findsheet]').value.trim();
        thumbs();
        if (want) { $('[data-findsheet]').value = want; find(); }
      } catch (e) { msg.textContent = 'That PDF could not be opened: ' + (e.message || e); }
    });
    async function thumbs() {
      const box = $('.dd25-thumbs'), s = st.set; box.innerHTML = '';
      for (let i = 1; i <= Math.min(s.pages, 120); i++) { const b = document.createElement('button'); b.type = 'button'; b.dataset.page = i; b.innerHTML = `<span>${i}</span>`; b.onclick = () => pickPage(i); box.appendChild(b); }
      for (let i = 1; i <= Math.min(s.pages, 120); i++) {
        if (st.set !== s) return;
        try { const { canvas } = await renderPage(s.doc, i, 150); const b = box.querySelector(`[data-page="${i}"]`); if (b) b.prepend(canvas); } catch (_e) { /* that thumbnail stays blank */ }
      }
    }
    async function find() {
      const s = st.set, want = $('[data-findsheet]').value.trim(); if (!s || !want) return;
      msg.textContent = `Looking for ${want}…`;
      const n = await findSheetPage(s.doc, want);
      if (n) { msg.textContent = `${want.toUpperCase()} is page ${n}. Draw a box around the detail.`; wrap.querySelector('[data-ref="sheet_no"]').value = want.toUpperCase(); pickPage(n); }
      else msg.textContent = `DrawUp could not find ${want} in the PDF's text (scanned sets have none). Pick the page below.`;
    }
    $('[data-find]').onclick = find;
    async function pickPage(n) {
      const s = st.set; s.page = n; s.rect = null;
      wrap.querySelectorAll('.dd25-thumbs [data-page]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.page === n)));
      const crop = $('.dd25-crop'); crop.hidden = false; $('[data-usebox]').disabled = true; $('.dd25-box').hidden = true;
      const { page, canvas } = await renderPage(s.doc, n, 1400); s.pageObj = page;
      $('.dd25-cropstage canvas').replaceWith(canvas);
      const stage = $('.dd25-cropstage'), boxEl = $('.dd25-box');
      let start = null;
      const pt = e => { const r = canvas.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
      const paint = (a, b) => { const r = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; Object.assign(boxEl.style, { left: r[0] * 100 + '%', top: r[1] * 100 + '%', width: (r[2] - r[0]) * 100 + '%', height: (r[3] - r[1]) * 100 + '%' }); boxEl.hidden = false; return r; };
      stage.onpointerdown = e => { e.preventDefault(); start = pt(e); stage.setPointerCapture?.(e.pointerId); };
      stage.onpointermove = e => { if (start) paint(start, pt(e)); };
      stage.onpointerup = e => { if (!start) return; const r = paint(start, pt(e)); start = null; if (r[2] - r[0] > 0.01 && r[3] - r[1] > 0.01) { s.rect = r; $('[data-usebox]').disabled = false; } };
      crop.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    $('[data-usebox]').onclick = async () => {
      const s = st.set; if (!s?.rect || !s.pageObj) return;
      msg.textContent = 'Cutting out the detail…';
      try {
        const detail = await renderCrop(s.pageObj, s.rect), whole = (await renderPage(s.doc, s.page, 1600)).canvas.toDataURL('image/jpeg', 0.82);
        st.pics = [{ name: `${s.name} p.${s.page} (detail)`, dataUrl: detail, label: 'THE DETAIL (BOXED ON THE SHEET)' }, { name: `${s.name} p.${s.page} (whole sheet)`, dataUrl: whole, label: 'THE WHOLE SHEET (FOR THE TITLE BLOCK, SHEET NUMBER AND REFERENCES)' }];
        await s.uploading;
        st.sourceSet = s.path ? { kind: 'pdf', path: s.path, page: s.page, pages: s.pages, rect: s.rect.map(v => Math.round(v * 10000) / 10000), pdf_rect: pdfRect(s.pageObj, s.rect), rotate: s.pageObj.rotate || 0, file_name: s.name } : null;
        msg.textContent = 'Ready. Check the detail and sheet numbers, then press the button.'; show();
      } catch (e) { msg.textContent = e.message || String(e); }
    };

    const progress = (sec, label) => { $('.dd25-progress').hidden = false; $('.dd25-bar i').style.width = Math.min(92, 8 + sec * 0.9) + '%'; $('.dd25-progress span').textContent = label || (sec < 20 ? 'Reading the detail…' : sec < 50 ? 'Finding the flaws…' : 'Drawing the clean detail…'); };
    async function finish(done) {
      $('.dd25-bar i').style.width = '100%'; setTimeout(() => { $('.dd25-progress').hidden = true; }, 700);
      const row = done.detail; if (!row) throw new Error('The detail came back empty.');
      window.DrawUpDetails?.reload?.();
      if (row.parent_id) { msg.textContent = 'Your revision is ready.'; viewer(row); return; }
      const d = toDetail(row);
      out.innerHTML = `<div class="dd25-result"><div class="dd25-left">${st.pics[0] ? `<figure class="dd25-orig"><img src="${st.pics[0].dataUrl}" alt="Your upload"><figcaption>Your upload</figcaption></figure>` : ''}${reviewHtml(row)}</div>
        <div class="dd25-right"><span class="dd21-kick dd21-ai">CLEAN DETAIL · ${esc(d.code)} · ${esc(d.scale)}</span><h3>${esc(row.title)}</h3><p class="dd25-refline">${esc(refLine(row))}</p><button type="button" class="dd25-img" data-open><img src="${urlOf(row)}" alt="${esc(row.title)}"></button>
          <div class="dd21-acts dd21-big"><button type="button" data-dl="pdf">Download PDF (to scale)</button><button type="button" data-dl="png">PNG</button><button type="button" data-dl="svg">SVG</button></div>
          <div class="dd21-acts dd21-big dd25-next"><button type="button" data-open="revise">Comment + regenerate</button><button type="button" data-open="team">Ask the team</button>${row.source_set ? '<button type="button" data-open="approve">Approve + put it back in the set</button>' : ''}</div>
          <p class="dd21-note">Saves as “${esc(fileBase(row))}”. ${row.visibility === 'private' ? 'Saved privately to your details.' : 'Added to the DrawUp Detail Catalog as a community AI-drawn detail.'}</p></div></div>`;
      out.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => download(row, b.dataset.dl));
      out.querySelectorAll('[data-open]').forEach(b => b.onclick = () => viewer(row, { tab: b.dataset.open || undefined }));
      out.querySelectorAll('[data-goto]').forEach(b => b.onclick = e => { e.stopPropagation(); viewer(row, { tab: b.dataset.goto }); });
      msg.textContent = 'Done. ' + (done.credits_charged ? done.credits_charged + ' credits used.' : '');
    }
    go.onclick = async () => {
      if (st.busy) return;
      st.busy = true; go.disabled = true; out.innerHTML = ''; progress(0, 'Uploading your detail…');
      try {
        const pictures = await uploadPictures(st.pics, uuid());
        const d = await call({ pictures, notes: notesEl.value.trim(), file_name: st.mode === 'set' ? st.set?.name || '' : st.pics[0]?.name || '', share: $('.dd25-share input').checked, sheet: readRef(wrap), source_set: st.sourceSet });
        store.set({ ticket: d.ticket, at: Date.now() });
        msg.textContent = 'DrawUp is checking your detail. This usually takes about a minute. You can keep using DrawUp.';
        await finish(await pollJob(d.ticket, sec => progress(sec)));
      } catch (e) { $('.dd25-progress').hidden = true; msg.textContent = e.message || String(e); toast(e.message || String(e), true); }
      finally { st.busy = false; ready(); }
    };
    // From a Draw it up set ("Work on this detail"): the slot's drawing, its set reference and where it goes back.
    wrap._take = () => {
      const h = pendingHandoff; pendingHandoff = null; if (!h) return;
      if (h.existing) { viewer(h.existing); return; }
      setMode('one'); st.pics = (h.pictures || []).slice(0, MAX_PAGES); st.sourceSet = h.source_set || null;
      notesEl.value = h.notes || ''; setRef(h.sheet);
      const from = $('.dd25-from'); from.hidden = !h.source_set; from.textContent = h.source_set ? `${setLine(h.source_set)}. When you approve the clean detail it replaces only this detail in the set.` : '';
      $('.dd25-body').hidden = false; $('.dd25-toggle').setAttribute('aria-expanded', 'true'); $('.dd25-toggle').textContent = 'Hide';
      msg.textContent = st.pics.length ? 'This detail from your set is ready. Add anything you know, then press the button.' : 'This detail is not drawn in your set yet. DrawUp will draw it from the set\'s data and your notes.';
      show(); wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    wrap._pullFromSet = ref => { setMode('set'); const [dn, sn] = String(ref || '').split('-'); setRef({ detail_no: dn || '', sheet_no: sn || '' }); $('[data-findsheet]').value = sn || ''; msg.textContent = `Add the set PDF that has ${ref}. DrawUp finds sheet ${sn || ''} for you; then draw a box around detail ${dn || ''}.`; wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    if (pendingHandoff) wrap._take();
    // A detail still being drawn when the page closed is collected here.
    const job = store.get();
    if (job) {
      st.busy = true; msg.textContent = 'Finishing the detail you started earlier…'; progress((Date.now() - job.at) / 1000);
      pollJob(job.ticket, sec => progress(sec), job.at).then(finish).catch(e => { $('.dd25-progress').hidden = true; msg.textContent = e.message || String(e); }).finally(() => { st.busy = false; ready(); });
    }
  }

  /* ------------------------------------------------------------------ find by sheet reference: "D4-A601" */
  async function lookup(q) {
    const ref = normRef(q), out = { ref, details: [], slots: [] }, u = me();
    if (!ref || !sb()) return out;
    const { data } = await sb().from('details').select('*').eq('source', 'drawup_ai').eq('sheet_ref', ref).order('revision', { ascending: false }).limit(60).then(x => x, () => ({}));
    const byRoot = new Map();
    for (const r of data || []) { if (!r.drawing || r.status === 'removed') continue; const k = r.root_id || r.id, cur = byRoot.get(k); if (!cur || (r.approved_at && !cur.approved_at) || (!!r.approved_at === !!cur.approved_at && (r.revision || 0) > (cur.revision || 0))) byRoot.set(k, r); }
    out.details = [...byRoot.values()];
    // The member's own Draw it up sets: "4/A501" is detail 4 on A501.
    if (u && !u.is_anonymous && window.DrawUpSheets?.slots) {
      const { data: sets } = await sb().from('drawing_generations').select('id,title,model,mode,revision,created_at,detail_overrides,root_id').eq('owner_id', u.id).order('created_at', { ascending: false }).limit(40).then(x => x, () => ({}));
      const seenRoot = new Set();
      for (const g of sets || []) {
        const root = g.root_id || g.id; if (seenRoot.has(root) || !g.model) continue; seenRoot.add(root); // newest revision of each set
        const level = g.mode === 'preliminary' || g.mode === 'explore' ? 'preliminary' : g.mode === 'full' ? 'full' : 'standard';
        let slots = []; try { slots = window.DrawUpSheets.slots(g.model, { level }); } catch (_e) { continue; }
        const hit = slots.find(s => normRef(s.ref) === ref);
        if (hit) out.slots.push({ gen: g, slot: hit, level, override: (g.detail_overrides || {})[hit.ref] || null });
      }
    }
    return out;
  }
  /** Crops one slot out of a saved Draw it up set and hands it to the panel (used by the lookup). */
  async function fromSet(gen, slot, level) {
    const sheets = window.DrawUpSheets.render(gen.model, { level, status: 'PRELIMINARY' }), sh = sheets.find(s => s.num === slot.sheet), m = gen.model;
    let pictures = [];
    if (sh && !slot.needed) { const c = await svgToCanvas(window.DrawUpSheets.cropSvg(sh.svg, slot.rect), 1600); pictures = [{ name: `${slot.ref} ${slot.title}`, dataUrl: c.toDataURL('image/jpeg', 0.9) }]; }
    handoff({ pictures, notes: ((slot.needed ? `Draw this needed detail: ${slot.title}. ${slot.why || ''} ` : '') + `From the Draw it up set "${m.title}": ${m.roof?.type || ''} roof, ${String(m.foundation?.type || '').replace(/_/g, ' ')}, walls ${m.wall_assembly?.stud || ''} ${m.wall_assembly?.cladding || ''}.`).slice(0, 1800), title: slot.title, sheet: { detail_no: slot.no, sheet_no: slot.sheet, project_name: m.title, revision: String(gen.revision || 0), date: new Date(gen.created_at).toLocaleDateString('en-US') }, source_set: { kind: 'drawup', set_id: gen.id, slot: slot.ref, title: slot.title } });
  }
  function lookupBox(host) {
    if (host.querySelector('.dd25-find')) return;
    const box = document.createElement('div'); box.className = 'dd25-find';
    box.innerHTML = `<form><label for="dd25-ref">Open a detail by its sheet reference</label><div><input id="dd25-ref" placeholder="D4-A601" maxlength="40" autocomplete="off"><button type="submit" class="du-btn primary">Open</button></div></form><div class="dd25-hits" aria-live="polite"></div>`;
    const anchor = host.querySelector('.dd21-filters'); if (anchor) anchor.insertAdjacentElement('beforebegin', box); else (host.querySelector('.dd25') || host.firstElementChild || host).insertAdjacentElement('afterend', box);
    const hits = box.querySelector('.dd25-hits'), input = box.querySelector('input');
    async function run(q, auto) {
      const ref = normRef(q); if (!ref) return;
      hits.innerHTML = '<p class="dd21-note">Looking…</p>';
      const r = await lookup(ref), total = r.details.length + r.slots.length;
      if (auto && r.details.length === 1 && !r.slots.length) { hits.innerHTML = ''; viewer(r.details[0]); return; }
      hits.innerHTML = total ? `<ul>${r.details.map((d, i) => `<li><b>${esc(refOf(d))}</b><span>${esc(d.title)}<small>${esc([d.project_name, 'Revision ' + (d.revision || 0), d.approved_at ? 'approved' : '', d.owner_id === me()?.id ? 'yours' : 'catalog'].filter(Boolean).join(' · '))}</small></span><button type="button" class="du-btn ghost" data-hd="${i}">Open →</button></li>`).join('')}${r.slots.map((s, i) => `<li><b>${esc(s.slot.ref)}</b><span>${esc(s.slot.title)}<small>Your Draw it up set “${esc(s.gen.title || s.gen.model?.title || 'Untitled')}”${s.gen.revision ? ' · Rev ' + esc(s.gen.revision) : ''}${s.override ? ' · replaced by ' + esc(s.override.code || 'an AI detail') : ''}</small></span><button type="button" class="du-btn ghost" data-hs="${i}">${s.override ? 'Open' : 'Work on it'} →</button></li>`).join('')}</ul>`
        : `<p class="dd21-note">No detail ${esc(ref)} yet. <button type="button" class="dd25-link" data-pull>Pull it from your drawing set PDF →</button></p>`;
      hits.querySelectorAll('[data-hd]').forEach(b => b.onclick = () => viewer(r.details[+b.dataset.hd]));
      hits.querySelectorAll('[data-hs]').forEach(b => b.onclick = async () => { const s = r.slots[+b.dataset.hs]; if (s.override?.id) { const { data } = await sb().from('details').select('*').eq('id', s.override.id).maybeSingle().then(x => x, () => ({})); if (data) return viewer(data); } await fromSet(s.gen, s.slot, s.level); });
      const pull = hits.querySelector('[data-pull]'); if (pull) pull.onclick = () => livePanel?._pullFromSet?.(ref);
    }
    box.querySelector('form').onsubmit = e => { e.preventDefault(); run(input.value); };
    const q = new URLSearchParams(location.hash.split('?')[1] || '').get('ref');
    if (q) { input.value = normRef(q); run(q, true); }
  }

  function detailsTab(host, o) { if (o?.publicPage || !host || host.querySelector('.dd25')) return; panel(host); lookupBox(host); }
  (window.DrawUpDetailTabs = window.DrawUpDetailTabs || []).push(detailsTab);
  window.DrawUpDetailDraw = { toDetail, viewer, panel, urlOf, svgOf, download, handoff, fileBase, lookup, normRef, replaceInPdf };
})();
