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
 * window.DrawUpDetailDraw = { toDetail, viewer, panel }
 */
(function () {
  'use strict';
  if (window.DrawUpDetailDraw) return;
  const BUCKET = 'drawup-private', MAX_PAGES = 4, POLL_MS = 4000, PENDING_KEY = 'du-dd25-pending', COST = 15;
  const CAD = /\.(dwg|dxf|rvt|rfa|rte|ifc|skp|3dm|dgn|pln)$/i;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sb = () => window.DrawUpPortal?.ctx?.()?.client || window.drawupSupabaseClient;
  const KIT = () => window.DrawUpDetailKit;
  const uuid = () => (crypto.randomUUID && crypto.randomUUID()) || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); });
  const toast = (m, bad) => { const P = window.DrawUpPortal?.ctx?.(); if (P?.toast) P.toast(m, bad); else console[bad ? 'warn' : 'log'](m); };
  const store = { get() { try { const j = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); return j && Date.now() - j.at < 6 * 3600 * 1000 ? j : null; } catch (_e) { return null; } }, set(j) { try { j ? localStorage.setItem(PENDING_KEY, JSON.stringify(j)) : localStorage.removeItem(PENDING_KEY); } catch (_e) { /* private window */ } } };

  /* ------------------------------------------------------------------ drawing model -> kit detail */
  // Printed inches per real foot -> px per real inch (the kit draws 100 px per printed inch).
  const SCALES = [['3" = 1\'-0"', 3], ['1 1/2" = 1\'-0"', 1.5], ['1" = 1\'-0"', 1], ['3/4" = 1\'-0"', 0.75], ['1/2" = 1\'-0"', 0.5], ['3/8" = 1\'-0"', 0.375], ['1/4" = 1\'-0"', 0.25], ['1/8" = 1\'-0"', 0.125]].map(([l, i]) => [l, i * 100 / 12]);
  const AREA = { x0: 34, x1: 404, y0: 46, y1: 500 }; // px; notes go to the right of x1 (kit NX)
  const cache = new Map();
  function toDetail(row) {
    if (cache.has(row.id) && cache.get(row.id).row === row) return cache.get(row.id).d;
    const g = row.drawing || {}, els = g.elements || [], dims = (g.dims || []).map(dm => Math.abs(dm.y2 - dm.y1) <= Math.abs(dm.x2 - dm.x1) ? { ...dm, y2: dm.y1 } : { ...dm, x2: dm.x1 });
    const xs = [], ys = [];
    els.forEach(e => { if (e.kind === 'circle') { const [c, r] = e.pts; xs.push(c[0] - r[0], c[0] + r[0]); ys.push(c[1] - r[0], c[1] + r[0]); } else e.pts.forEach(p => { xs.push(p[0]); ys.push(p[1]); }); });
    dims.forEach(dm => { const hz = dm.y1 === dm.y2; xs.push(dm.x1, dm.x2, hz ? dm.x1 : dm.x1 + dm.offset); ys.push(dm.y1, dm.y2, hz ? dm.y1 + dm.offset : dm.y1); });
    if (!xs.length) { xs.push(0, 12); ys.push(0, 12); }
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys), w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    const aw = AREA.x1 - AREA.x0 - 24, ah = AREA.y1 - AREA.y0 - 24;
    const sc = SCALES.find(([, k]) => w * k <= aw && h * k <= ah) || SCALES[SCALES.length - 1], k = sc[1];
    const ox = AREA.x0 + (AREA.x1 - AREA.x0 - w * k) / 2 - minX * k, oy = AREA.y1 - (AREA.y1 - AREA.y0 - h * k) / 2 + minY * k;
    const dash = v => (v && v !== 'none' ? v : undefined);
    const box = p => { const [a, b] = p; return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])]; };
    const d = {
      id: 'ai-' + row.id, code: row.detail_code || 'AI', title: row.title, cat: row.category, mat: row.material || '', asm: row.assembly || '', scale: sc[0], views: g.view || '', no: '1',
      badge: 'DRAWUP AI DETAIL', bubble: 'AI', foot1: 'AI-DRAWN FROM A MEMBER UPLOAD · NOT FOR CONSTRUCTION', row,
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
    cache.set(row.id, { row, d });
    return d;
  }
  const svgOf = row => KIT().sheet(toDetail(row));
  const urlOf = row => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgOf(row));
  const download = (row, fmt) => window.DrawUpDetails?.download ? window.DrawUpDetails.download(toDetail(row), fmt) : toast('Open the Details tab to download.', true);

  /* ------------------------------------------------------------------ review + viewer */
  const SEV = { critical: 'CRITICAL', major: 'MAJOR', minor: 'MINOR' };
  function reviewHtml(row) {
    const r = row.review || {}, flaws = r.flaws || [];
    return `${r.source_reading ? `<p class="dd25-read"><b>What DrawUp read:</b> ${esc(r.source_reading)}</p>` : ''}
      <h4>Flaws found and how the clean detail fixes them <small>${flaws.length}</small></h4>
      ${flaws.length ? `<ol class="dd25-flaws">${flaws.map(f => `<li><span class="dd25-sev sev-${esc(f.severity)}">${SEV[f.severity] || 'NOTE'}</span><b>${esc(f.flaw)}</b><p><em>Why it matters:</em> ${esc(f.why)}</p><p><em>Fix:</em> ${esc(f.fix)}</p>${f.reference ? `<p class="dd25-ref">Reference: ${esc(f.reference)}</p>` : ''}</li>`).join('')}</ol>` : '<p class="dd21-note">No flaws were found in the upload. The clean detail is redrawn to DrawUp standards.</p>'}
      ${(r.general_notes || []).length ? `<h4>General notes</h4><ul class="dd25-list">${r.general_notes.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${(r.assumptions || []).length ? `<h4>Assumptions</h4><ul class="dd25-list">${r.assumptions.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`;
  }
  function viewer(row) {
    document.getElementById('dd21-view')?.remove();
    const d = toDetail(row), mine = row.owner_id && row.owner_id === window.DrawUpPortal?.ctx?.()?.user?.id;
    document.body.insertAdjacentHTML('beforeend', `<div id="dd21-view" class="dd21-view" role="dialog" aria-modal="true" aria-label="${esc(row.title)}"><div class="dd21-vcard">
      <button type="button" class="dd21-x" aria-label="Close">×</button>
      <div class="dd21-vimg"><img src="${urlOf(row)}" alt="${esc(row.title)}"></div>
      <aside class="dd21-vside dd25-side" data-detail-key="${esc('upload:' + row.id)}"><span class="dd21-kick dd21-ai">COMMUNITY · AI-DRAWN · ${esc(d.code)}${row.visibility === 'private' ? ' · PRIVATE' : ''}</span><h2>${esc(row.title)}</h2>
        <dl class="dd21-dl"><dt>Category</dt><dd>${esc(row.category)}</dd>${row.material ? `<dt>Material</dt><dd>${esc(row.material)}</dd>` : ''}${row.assembly ? `<dt>Assembly</dt><dd>${esc(row.assembly)}</dd>` : ''}<dt>Scale</dt><dd>${esc(d.scale)} (true on the PDF, 8 x 6 in)</dd></dl>
        ${row.description ? `<p class="dd21-meta">${esc(row.description)}</p>` : ''}
        <div class="dd21-acts dd21-big"><button type="button" data-dd25-dl="pdf">Download PDF (to scale)</button><button type="button" data-dd25-dl="png">PNG</button><button type="button" data-dd25-dl="svg">SVG</button>${mine ? `<button type="button" data-dd25-share>${row.visibility === 'private' ? 'Add to the DrawUp catalog' : 'Make private'}</button>` : ''}</div>
        ${reviewHtml(row)}
        <p class="dd21-warn">Drawn by DrawUp AI from a member's upload. Not reviewed by DrawUp and not for construction: a licensed professional must verify it for the project, the adopted code and the AHJ.</p>
      </aside></div></div>`);
    const v = document.getElementById('dd21-view'), close = () => { v.remove(); document.removeEventListener('keydown', key); }, key = e => { if (e.key === 'Escape') close(); };
    v.querySelector('.dd21-x').onclick = close; v.onclick = e => { if (e.target === v) close(); }; document.addEventListener('keydown', key);
    v.querySelectorAll('[data-dd25-dl]').forEach(b => b.onclick = () => download(row, b.dataset.dd25Dl));
    const sh = v.querySelector('[data-dd25-share]');
    if (sh) sh.onclick = async () => { const to = row.visibility === 'private' ? 'drawup' : 'private'; const { error } = await sb().from('details').update({ visibility: to, updated_at: new Date().toISOString() }).eq('id', row.id); if (error) return toast(error.message, true); row.visibility = to; toast(to === 'drawup' ? 'Added to the DrawUp Detail Catalog.' : 'Now only you can see it.'); close(); window.DrawUpDetails?.reload?.(); };
    v.querySelector('.dd21-x').focus();
  }

  /* ------------------------------------------------------------------ the Details tab panel */
  const token = async () => (await sb()?.auth.getSession())?.data?.session?.access_token || '';
  const api = async body => fetch('/api/details/draw', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, body: JSON.stringify(body) });
  async function pollJob(ticket, onTick, startedAt = Date.now()) {
    let misses = 0;
    for (;;) {
      await new Promise(r => setTimeout(r, POLL_MS));
      onTick?.((Date.now() - startedAt) / 1000);
      let res, d;
      try { res = await api({ poll: ticket }); d = await res.json(); }
      catch (_e) { if (++misses > 15) throw new Error('DrawUp lost the connection while drawing. It keeps going: open the Details tab again later to collect it.'); continue; }
      misses = 0;
      if (d.status === 'done') { store.set(null); return d; }
      if (!res.ok || d.final) { store.set(null); throw new Error(d.error || 'The detail could not be drawn (' + res.status + ').'); }
    }
  }
  async function readFiles(files) {
    const D = window.DrawUpDrawIt;
    if (D?.readPictures) return (await D.readPictures(files)).slice(0, MAX_PAGES);
    const out = [];
    for (const f of files) {
      if (!/^image\//.test(f.type)) throw new Error('PDF reading is still loading. Try again in a moment.');
      out.push({ name: f.name, dataUrl: await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); }) });
    }
    return out.slice(0, MAX_PAGES);
  }

  function panel(host) {
    const ctx = window.DrawUpPortal?.ctx?.() || {}, u = ctx.user;
    const wrap = document.createElement('section');
    wrap.className = 'dd25';
    wrap.innerHTML = `<div class="dd25-top"><div><span class="dd21-kick">DRAW A DETAIL · FIND THE FLAWS · CLEAN REDRAW</span><h2>Upload one detail. Get the flaws, the fixes and a clean detail to scale.</h2>
        <p class="dd21-note">DrawUp reads your detail, lists every flaw with why it matters and how it is fixed, and redraws it as one clean detail at a real architectural scale (PDF prints true to scale). It is not a full drawing set. The clean detail is added to the Detail Catalog, so you and Draw it up sets can reference it later.</p></div>
        <button type="button" class="du-btn ghost dd25-toggle" aria-expanded="true">Hide</button></div>
      <div class="dd25-body">
        <label class="dd25-drop" tabindex="0"><input type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,.pdf,.dwg,.dxf,.rvt,.rfa,.ifc,.skp"><b>Add a picture or PDF of the detail</b><span>PNG, JPG, WebP or PDF (up to ${MAX_PAGES} pages) · DWG / RVT: export the detail view to PDF first</span></label>
        <p class="dd25-cad" hidden></p>
        <div class="dd25-pics"></div>
        <label class="dd25-field">What is it? Add anything you know <textarea rows="2" maxlength="2000" placeholder="Example: roof section at the eave, asphalt shingles, 2x10 rafters, vented attic, climate zone 4A"></textarea></label>
        <label class="dd21-chk dd25-share"><input type="checkbox" checked> Add the clean detail to the DrawUp Detail Catalog for everyone <small>(untick to keep it private)</small></label>
        <div class="dd25-go"><button type="button" class="du-btn primary" disabled>Find the flaws + draw the clean detail</button><span class="dd21-note">${COST} credits (unlimited accounts are not charged)</span></div>
        <p class="dd25-msg" aria-live="polite"></p>
        <div class="dd25-progress" hidden><div class="dd25-bar"><i></i></div><span></span></div>
        <div class="dd25-out"></div>
      </div>`;
    const head = host.querySelector('.dd21-head');
    (head || host.firstElementChild || host).insertAdjacentElement(head ? 'afterend' : 'beforebegin', wrap);
    const $ = s => wrap.querySelector(s), input = $('input[type=file]'), go = $('.dd25-go button'), msg = $('.dd25-msg'), out = $('.dd25-out'), cad = $('.dd25-cad');
    const st = { pics: [], busy: false };
    $('.dd25-toggle').onclick = e => { const b = e.currentTarget, open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(open)); b.textContent = open ? 'Hide' : 'Draw a detail'; $('.dd25-body').hidden = !open; };
    if (!u || u.is_anonymous) { $('.dd25-body').innerHTML = '<p class="dd21-note">Sign in to upload a detail and have DrawUp redraw it.</p>'; return; }
    const show = () => { $('.dd25-pics').innerHTML = st.pics.map((p, i) => `<figure><img src="${p.dataUrl}" alt=""><figcaption>${esc(p.name)}</figcaption><button type="button" data-rm="${i}" aria-label="Remove ${esc(p.name)}">×</button></figure>`).join(''); wrap.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { st.pics.splice(+b.dataset.rm, 1); show(); }); go.disabled = !st.pics.length || st.busy; };
    async function add(files) {
      const list = [...files], cadFiles = list.filter(f => CAD.test(f.name)), rest = list.filter(f => !CAD.test(f.name));
      cad.hidden = !cadFiles.length;
      if (cadFiles.length) cad.innerHTML = `<b>${esc(cadFiles.map(f => f.name).join(', '))}:</b> DrawUp can't read DWG, DXF, RVT or other CAD / BIM model files directly yet; they need AutoCAD or Revit to open. Export just this detail first: in <b>AutoCAD</b>, Plot the detail's layout or window to <b>PDF</b> (DWG To PDF.pc3) or export a PNG; in <b>Revit</b>, open the detail or drafting view and use <b>Export → PDF</b> or <b>Export → Images</b>. Then drop that file here.`;
      if (!rest.length) return;
      msg.textContent = 'Reading your file…';
      try { st.pics = [...st.pics, ...(await readFiles(rest))].slice(0, MAX_PAGES); msg.textContent = st.pics.length >= MAX_PAGES ? `Using the first ${MAX_PAGES} pictures or pages.` : 'Ready. Add notes if you know sizes or the climate, then press the button.'; }
      catch (e) { msg.textContent = e.message || String(e); }
      show();
    }
    input.onchange = () => { add(input.files); input.value = ''; };
    const drop = $('.dd25-drop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); add(e.dataTransfer.files); });
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    const progress = (sec, label) => { $('.dd25-progress').hidden = false; $('.dd25-bar i').style.width = Math.min(92, 8 + sec * 0.9) + '%'; $('.dd25-progress span').textContent = label || (sec < 20 ? 'Reading the detail…' : sec < 50 ? 'Finding the flaws…' : 'Drawing the clean detail…'); };
    async function finish(done) {
      $('.dd25-bar i').style.width = '100%'; setTimeout(() => { $('.dd25-progress').hidden = true; }, 700);
      const row = done.detail; if (!row) throw new Error('The detail came back empty.');
      const d = toDetail(row);
      out.innerHTML = `<div class="dd25-result"><div class="dd25-left">${st.pics[0] ? `<figure class="dd25-orig"><img src="${st.pics[0].dataUrl}" alt="Your upload"><figcaption>Your upload</figcaption></figure>` : ''}${reviewHtml(row)}</div>
        <div class="dd25-right"><span class="dd21-kick dd21-ai">CLEAN DETAIL · ${esc(d.code)} · ${esc(d.scale)}</span><h3>${esc(row.title)}</h3><button type="button" class="dd25-img" data-open><img src="${urlOf(row)}" alt="${esc(row.title)}"></button>
          <div class="dd21-acts dd21-big"><button type="button" data-dl="pdf">Download PDF (to scale)</button><button type="button" data-dl="png">PNG</button><button type="button" data-dl="svg">SVG</button><button type="button" data-open>Open</button></div>
          <p class="dd21-note">${row.visibility === 'private' ? 'Saved privately to your details.' : 'Added to the DrawUp Detail Catalog as a community AI-drawn detail.'} Draw it up sets that need this detail will point to it.</p></div></div>`;
      out.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => download(row, b.dataset.dl));
      out.querySelectorAll('[data-open]').forEach(b => b.onclick = () => viewer(row));
      msg.textContent = 'Done. ' + (done.credits_charged ? done.credits_charged + ' credits used.' : '');
      window.DrawUpDetails?.reload?.();
    }
    go.onclick = async () => {
      if (st.busy || !st.pics.length) return;
      st.busy = true; go.disabled = true; out.innerHTML = ''; progress(0, 'Uploading your detail…');
      try {
        const folder = uuid(), pictures = [];
        for (let i = 0; i < st.pics.length; i++) {
          let path = '';
          try { const p = `${u.id}/details/${folder}/source-${i + 1}.jpg`; const up = await sb().storage.from(BUCKET).upload(p, await (await fetch(st.pics[i].dataUrl)).blob(), { contentType: 'image/jpeg', upsert: true }); if (!up.error) path = p; } catch (_e) { /* sent inline */ }
          pictures.push(path ? { path } : { image: st.pics[i].dataUrl });
        }
        const res = await api({ pictures, notes: $('textarea').value.trim(), file_name: st.pics[0]?.name || '', share: $('.dd25-share input').checked });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d.ticket) throw new Error(d.error || 'The detail could not start (' + res.status + ').');
        store.set({ ticket: d.ticket, at: Date.now() });
        msg.textContent = 'DrawUp is checking your detail. This usually takes about a minute. You can keep using DrawUp.';
        await finish(await pollJob(d.ticket, sec => progress(sec)));
      } catch (e) { $('.dd25-progress').hidden = true; msg.textContent = e.message || String(e); toast(e.message || String(e), true); }
      finally { st.busy = false; go.disabled = !st.pics.length; }
    };
    // A detail still being drawn when the page closed is collected here.
    const job = store.get();
    if (job) {
      st.busy = true; msg.textContent = 'Finishing the detail you started earlier…'; progress((Date.now() - job.at) / 1000);
      pollJob(job.ticket, sec => progress(sec), job.at).then(finish).catch(e => { $('.dd25-progress').hidden = true; msg.textContent = e.message || String(e); }).finally(() => { st.busy = false; go.disabled = !st.pics.length; });
    }
  }

  function detailsTab(host, o) { if (o?.publicPage || !host || host.querySelector('.dd25')) return; panel(host); }
  (window.DrawUpDetailTabs = window.DrawUpDetailTabs || []).push(detailsTab);
  window.DrawUpDetailDraw = { toDetail, viewer, panel, urlOf, svgOf, download };
})();
