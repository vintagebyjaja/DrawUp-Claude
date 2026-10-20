/* DrawUp V24 "Draw it up": picture in, drawing set out.
 * - Upload a photo, rendering, sketch, AI image or drawing (PNG / JPG / WebP / PDF pages, up to 6).
 * - /api/drawings/generate reads it and returns ONE building model; drawup-drawit-sheets-v24.js draws every sheet
 *   from that model (G001, plans, elevations, sections, details, foundation + framing, schedules).
 * - Each page shows on its own, opens full size, downloads as SVG / PNG, and "Combine into PDF set" makes one PDF.
 * - Details the set still needs are flagged on A501 and added to the Details library by the server.
 * - Saved in drawing_generations (SQL v24-02); reopen from Arch Coach, Projects or the project page.
 * Used by: Arch Coach tab (Draw it up mode), Projects tab (quick access + recent sets), project pages.
 * window.DrawUpDrawIt = { mount(host, opts), recent(host, opts), openSet(host, id, opts), sideLinks() }
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
  async function listSets(opts = {}) {
    const c = sb(), u = C().user; if (!c || !u) return [];
    let q = c.from('drawing_generations').select('id,title,created_at,project_thread_id,issue_status,details_needed,model->footprint,model->stories').eq('owner_id', u.id).order('created_at', { ascending: false }).limit(opts.limit || 12);
    if (opts.projectId) q = q.eq('project_thread_id', opts.projectId);
    const { data, error } = await q;
    if (error) { if (/drawing_generations|schema cache|does not exist/i.test(error.message)) return { missing: true }; throw error; }
    return data || [];
  }
  async function sourceDataUrl(path) {
    try { const { data } = await sb().storage.from(BUCKET).createSignedUrl(path, 600); if (!data?.signedUrl) return ''; const b = await (await fetch(data.signedUrl)).blob(); return await blobToDataUrl(b); } catch (_e) { return ''; }
  }

  /* ------------------------------------------------------------------ UI */
  const CSS_ID = 'du-dit24-css';
  function card(set, compact) {
    const fp = set.footprint ? `${Math.round(set.footprint.width_ft)}' x ${Math.round(set.footprint.depth_ft)}'` : '';
    return `<article class="du-dit24-set"><div><span class="du-kicker">DRAWING SET${set.issue_status ? ' · ' + esc(String(set.issue_status).toUpperCase()) : ''}</span><b>${esc(set.title || 'Drawing set')}</b><small>${esc([fp, set.stories > 1 ? set.stories + ' stories' : '', (set.details_needed || []).length ? (set.details_needed.length + ' details flagged') : '', new Date(set.created_at).toLocaleDateString()].filter(Boolean).join(' · '))}</small></div><button class="du-btn ${compact ? 'ghost' : 'primary'}" type="button" data-dit-open="${esc(set.id)}">Open set →</button></article>`;
  }
  /** Recent sets list (Projects tab, project page). */
  async function recent(host, opts = {}) {
    host.innerHTML = '<p class="du-muted">Loading drawing sets…</p>';
    let sets; try { sets = await listSets(opts); } catch (e) { host.innerHTML = `<p class="du-muted">Drawing sets could not load: ${esc(e.message)}</p>`; return; }
    if (sets.missing) { host.innerHTML = '<p class="du-muted">Run the v24 SQL (drawing sets) in Supabase to save drawing sets.</p>'; return; }
    host.innerHTML = sets.length ? sets.map(s => card(s, true)).join('') : `<p class="du-muted">${opts.projectId ? 'No drawing sets for this project yet.' : 'No drawing sets yet. Upload a picture and DrawUp draws the set.'}</p>`;
    host.querySelectorAll('[data-dit-open]').forEach(b => b.onclick = () => openInCoach({ setId: b.dataset.ditOpen }));
  }
  /** Opens Arch Coach in Draw it up mode (optionally on a saved set or a project). */
  function openInCoach(intent = {}) {
    window.__duDrawIntent = intent;
    const q = intent.setId ? 'draw=' + encodeURIComponent(intent.setId) : 'draw=1';
    history.replaceState(null, '', '#portal/arch-coach?' + q);
    P()?.openPortalTab?.('arch-coach');
  }

  function mount(host, opts = {}) {
    const ctx = C(), u = ctx.user;
    const st = { files: [], pics: [], model: null, gen: null, sheets: [], status: 'Preliminary', reviewer: '', license: '', size: 'archd', busy: false, sourceImage: '' };
    try { const s = JSON.parse(localStorage.getItem('du-dit24-tb') || 'null'); if (s) { st.reviewer = s.reviewer || ''; st.license = s.license || ''; } } catch (_e) { /* private window */ }
    host.innerHTML = `<section class="du-dit24 du-glass">
      <span class="du-kicker">DRAW IT UP · PICTURE TO DRAWING SET</span>
      <h2>Turn a picture into architectural drawings.</h2>
      <p class="du-muted">Upload a photo, rendering, sketch, AI image or drawing. DrawUp reads it, builds one coordinated building model and draws the full set: plans, elevations, sections, details, framing and schedules. Every page shows here, and you can combine them into one PDF set.</p>
      <label class="du-dit24-drop" tabindex="0"><input type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"><b>Add pictures or a PDF</b><span>PNG, JPG, WebP or PDF · up to ${MAX_FILES} pictures or pages</span></label>
      <div class="du-dit24-pics"></div>
      <div class="du-dit24-grid">
        <label class="wide">What is it? Add any sizes you know <textarea rows="2" data-f="notes" placeholder="Example: 18 x 10 ft athletic storage building, 8 ft walls, slab on grade, shed roof"></textarea></label>
        <label>Location <input data-f="location" placeholder="City, State" value="${esc(opts.location || ctx.profile?.current_location || '')}"></label>
        <label>Project <select data-f="project"><option value="">No project</option></select></label>
      </div>
      <details class="du-dit24-more"><summary>Title block + issue status</summary><div class="du-dit24-grid">
        <label>Issue status <select data-f="status">${STATUSES.map(s => `<option>${s}</option>`).join('')}</select></label>
        <label>Reviewed by (architect) <input data-f="reviewer" value="${esc(st.reviewer)}" placeholder="Name"></label>
        <label>License no. <input data-f="license" value="${esc(st.license)}" placeholder="State + number"></label>
        <label>PDF sheet size <select data-f="size"><option value="archd">ARCH D 24 x 36 (full size)</option><option value="tabloid">11 x 17 (half size)</option></select></label>
      </div><p class="du-muted">"Issued for construction" belongs on a set a licensed professional has reviewed. Until then DrawUp marks every sheet "not for construction until reviewed".</p></details>
      <div class="du-dit24-go"><button class="du-btn primary" type="button" data-go disabled>Draw it up</button><span class="du-muted" data-msg>40 credits per set (unlimited accounts are not charged). Refunded if it does not finish.</span></div>
      <div class="du-dit24-progress" hidden><div class="du-dit24-bar"><i></i></div><ol><li data-p="read">Reading the picture</li><li data-p="model">Building one coordinated model</li><li data-p="draw">Drawing the sheets</li></ol></div>
      <div class="du-dit24-out"></div>
      <div class="du-dit24-recent-wrap"><h3>Your drawing sets</h3><div class="du-dit24-recent"></div></div>
    </section>`;
    const $ = s => host.querySelector(s), f = k => host.querySelector(`[data-f="${k}"]`);
    const drop = $('.du-dit24-drop'), input = drop.querySelector('input'), go = $('[data-go]'), msg = $('[data-msg]');
    f('status').value = st.status;
    // projects
    (async () => { try { const { data } = await sb().from('project_threads').select('id,project_name,location').eq('owner_id', u.id).order('updated_at', { ascending: false }).limit(60); const sel = f('project'); (data || []).forEach(p => sel.insertAdjacentHTML('beforeend', `<option value="${esc(p.id)}">${esc(p.project_name)}</option>`)); if (opts.projectId) sel.value = opts.projectId; sel.onchange = () => { const p = (data || []).find(x => x.id === sel.value); if (p?.location && !f('location').value) f('location').value = p.location; }; } catch (_e) { /* projects optional */ } })();
    const showPics = () => { $('.du-dit24-pics').innerHTML = st.pics.map((p, i) => `<figure><img src="${p.dataUrl}" alt=""><figcaption>${esc(p.name)}</figcaption><button type="button" data-rm="${i}" aria-label="Remove ${esc(p.name)}">×</button></figure>`).join(''); host.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { st.pics.splice(+b.dataset.rm, 1); showPics(); }); go.disabled = !st.pics.length || st.busy; drop.classList.toggle('has', !!st.pics.length); };
    const addFiles = async files => { if (!files.length) return; msg.textContent = 'Reading your files…'; try { const more = await readPictures([...files]); st.pics.push(...more); st.pics = st.pics.slice(0, MAX_FILES); msg.textContent = st.pics.length >= MAX_FILES ? `Using the first ${MAX_FILES} pictures or pages.` : 'Ready. Add notes if you know sizes, then press Draw it up.'; } catch (e) { msg.textContent = e.message || String(e); } showPics(); };
    input.onchange = () => { addFiles(input.files); input.value = ''; };
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    ['status', 'reviewer', 'license', 'size'].forEach(k => f(k).addEventListener('change', () => { st[k] = f(k).value.trim(); try { localStorage.setItem('du-dit24-tb', JSON.stringify({ reviewer: st.reviewer, license: st.license })); } catch (_e) { /* ignore */ } if (st.model) { draw(); persistTb(); } }));
    if (opts.initialPictures?.length) { st.pics = opts.initialPictures.slice(0, MAX_FILES); showPics(); }
    if (opts.notes) f('notes').value = opts.notes;

    const stage = (k, pct) => { $('.du-dit24-progress').hidden = false; host.querySelectorAll('[data-p]').forEach(li => { const order = ['read', 'model', 'draw']; li.classList.toggle('on', li.dataset.p === k); li.classList.toggle('done', order.indexOf(li.dataset.p) < order.indexOf(k)); }); $('.du-dit24-bar i').style.width = Math.round(pct) + '%'; };

    go.onclick = async () => {
      if (st.busy || !st.pics.length) return;
      st.busy = true; go.disabled = true; $('.du-dit24-out').innerHTML = ''; stage('read', 4); msg.textContent = 'Uploading your pictures…';
      const genFolder = uuid(), paths = [];
      try {
        for (let i = 0; i < st.pics.length; i++) { const path = `${u.id}/drawings/${genFolder}/source-${i + 1}.jpg`; const b = await (await fetch(st.pics[i].dataUrl)).blob(); const up = await sb().storage.from(BUCKET).upload(path, b, { contentType: 'image/jpeg', upsert: true }); if (!up.error) paths.push(path); }
      } catch (_e) { /* the set still works without saved sources */ }
      msg.textContent = 'DrawUp is reading the picture. A set usually takes about a minute.';
      try {
        const res = await fetch('/api/drawings/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() },
          body: JSON.stringify({ images: st.pics.map(p => p.dataUrl), source_paths: paths, notes: f('notes').value.trim(), location: f('location').value.trim(), project_id: f('project').value || opts.projectId || '', coach_thread_id: opts.coachThreadId || '' }) });
        if (!res.ok || !res.body) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Drawing generation could not start (' + res.status + ').'); }
        const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '', done = null, fail = '';
        stage('model', 12);
        for (;;) {
          const { value, done: end } = await reader.read(); if (end) break;
          buf += dec.decode(value, { stream: true }); let cut;
          while ((cut = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, cut).trim(); buf = buf.slice(cut + 1); if (!line) continue;
            let e; try { e = JSON.parse(line); } catch (_e) { continue; }
            if (e.t === 'progress') { stage('model', Math.min(88, 12 + e.chars / 90)); msg.textContent = 'Building one coordinated model…'; }
            else if (e.t === 'done') done = e; else if (e.t === 'error') fail = e.error;
          }
        }
        if (!done) throw new Error(fail || 'The connection closed before the set was saved. If it finished, it is in Your drawing sets.');
        stage('draw', 94);
        st.model = done.model; st.gen = done.generation || null; st.sourceImage = st.pics[0]?.dataUrl || '';
        draw(); stage('draw', 100);
        setTimeout(() => { $('.du-dit24-progress').hidden = true; }, 900);
        msg.textContent = (done.saved ? 'Saved to Your drawing sets. ' : 'Drawn, but it could not be saved (run the v24 SQL). ') + (done.credits_charged ? done.credits_charged + ' credits used.' : '');
        if (done.saved) persistTb();
        refreshRecent();
      } catch (e) { $('.du-dit24-progress').hidden = true; msg.textContent = e.message || String(e); toast(e.message || String(e), true); }
      finally { st.busy = false; go.disabled = !st.pics.length; }
    };

    async function persistTb() { if (!st.gen?.id) return; try { await sb().from('drawing_generations').update({ issue_status: st.status, reviewer: st.reviewer || null, license_no: st.license || null, updated_at: new Date().toISOString() }).eq('id', st.gen.id).eq('owner_id', u.id); } catch (_e) { /* optional */ } }
    function draw() {
      const m = st.model; if (!window.DrawUpSheets) { $('.du-dit24-out').innerHTML = '<p>The sheet engine did not load. Refresh the page.</p>'; return; }
      st.sheets = window.DrawUpSheets.render(m, { location: f('location').value.trim() || st.gen?.location || '', status: st.status, reviewer: st.reviewer, license: st.license ? 'LIC. ' + st.license : '', sourceImage: st.sourceImage, date: new Date(st.gen?.created_at || Date.now()).toLocaleDateString('en-US') });
      const out = $('.du-dit24-out'), urls = st.sheets.map(s => svgUrl(s.svg));
      out.querySelectorAll('img[data-blob]').forEach(i => URL.revokeObjectURL(i.src));
      const sev = { critical: 'CRITICAL', major: 'MAJOR', minor: 'MINOR' };
      out.innerHTML = `<div class="du-dit24-head"><div><span class="du-kicker">${esc(st.sheets.length)} SHEETS · ONE MODEL</span><h2>${esc(m.title)}</h2><p>${esc(m.summary)}</p>${m.dimension_basis === 'estimated_from_picture' ? '<p class="du-dit24-warn">Sizes were estimated from the picture. Check the assumptions on G001, then type known sizes in the notes and draw it up again.</p>' : ''}</div>
        <div class="du-dit24-acts"><button class="du-btn primary" type="button" data-pdf>Combine into PDF set</button><button class="du-btn ghost" type="button" data-check>Check against code</button><button class="du-btn ghost" type="button" data-ask>Ask Arch Coach about this set</button></div></div>
        <div class="du-dit24-sheets">${st.sheets.map((s, i) => `<figure class="du-dit24-sheet"><button type="button" data-view="${i}" aria-label="Open ${esc(s.num)} full size"><img data-blob src="${urls[i]}" alt="${esc(s.num + ' ' + s.title)}" loading="lazy"></button><figcaption><b>${esc(s.num)}</b><span>${esc(s.title)}</span><span class="du-dit24-dl"><button type="button" data-dl="${i}" data-as="pdf">PDF</button><button type="button" data-dl="${i}" data-as="png">PNG</button><button type="button" data-dl="${i}" data-as="svg">SVG</button></span></figcaption></figure>`).join('')}</div>
        <div class="du-dit24-cols"><section><h3>Details this set still needs</h3><p class="du-muted">Flagged on A501 and added to the Details library, so the catalog grows with every set.</p><ol class="du-dit24-list">${m.details_needed.map(d => `<li><b>${esc(d.title)}</b><span>${esc(d.category)}${d.location ? ' · ' + esc(d.location) : ''}</span><small>${esc(d.why)}</small></li>`).join('') || '<li>No extra details flagged.</li>'}</ol><button class="du-btn ghost" type="button" data-lib>Open the Details library</button></section>
        <section><h3>Problems in the picture</h3><ul class="du-dit24-list">${m.issues_in_source.map(x => `<li><b><em class="sev-${esc(x.severity)}">${sev[x.severity] || 'NOTE'}</em> ${esc(x.issue)}</b>${x.fix ? `<small>Fix: ${esc(x.fix)}</small>` : ''}</li>`).join('') || '<li>None reported.</li>'}</ul>${m.code_notes.length ? `<h3>Code items to confirm</h3><ul class="du-dit24-list">${m.code_notes.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</section></div>`;
      out.querySelectorAll('[data-view]').forEach(b => b.onclick = () => viewer(+b.dataset.view));
      out.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => downloadOne(+b.dataset.dl, b.dataset.as, b));
      out.querySelector('[data-pdf]').onclick = async e => {
        const b = e.currentTarget; b.disabled = true; const old = b.textContent;
        try { const bytes = await sheetsToPdf(st.sheets, st.size, m.title, (i, n) => { b.textContent = `Combining sheet ${i} of ${n}…`; }); save(slug(m.title) + '-drawing-set.pdf', bytes, 'application/pdf'); toast('PDF set downloaded.'); }
        catch (err) { toast('The PDF could not be made: ' + (err.message || err), true); } finally { b.disabled = false; b.textContent = old; }
      };
      out.querySelector('[data-check]').onclick = () => { history.replaceState(null, '', '#portal/check?quick=1'); P()?.openPortalTab?.('check'); toast('Download the PDF set, then drop it into Quick Check to review it against code.'); };
      out.querySelector('[data-ask]').onclick = () => { try { sessionStorage.setItem('du-coach-prefill', `I drew up "${m.title}" with DrawUp (${m.footprint.width_ft} x ${m.footprint.depth_ft} ft, ${m.stories} stor${m.stories > 1 ? 'ies' : 'y'}, ${m.roof.type} roof, ${m.foundation.type.replace(/_/g, ' ')}). What should I check before this set goes to permit, and how should I draw these details: ${m.details_needed.map(d => d.title).join('; ')}?`); } catch (_e) { /* ignore */ } opts.onAsk ? opts.onAsk() : P()?.openPortalTab?.('arch-coach'); };
      out.querySelector('[data-lib]').onclick = () => P()?.openPortalTab?.('details');
    }
    async function downloadOne(i, as, btn) {
      const s = st.sheets[i], name = slug(st.model.title) + '-' + s.num;
      try {
        btn && (btn.disabled = true);
        if (as === 'svg') return save(name + '.svg', s.svg, 'image/svg+xml');
        if (as === 'png') { const c = await svgToCanvas(s.svg, sheetPx(36)); const b = await new Promise(r => c.toBlob(r, 'image/png')); return save(name + '.png', b, 'image/png'); }
        save(name + '.pdf', await sheetsToPdf([s], st.size, st.model.title + ' ' + s.num), 'application/pdf');
      } catch (e) { toast(e.message || String(e), true); } finally { btn && (btn.disabled = false); }
    }
    function viewer(i) {
      document.getElementById('du-dit24-view')?.remove();
      document.body.insertAdjacentHTML('beforeend', `<div id="du-dit24-view" class="du-dit24-view" role="dialog" aria-modal="true" aria-label="Sheet viewer"><div class="du-dit24-vbar"><b data-t></b><span><button type="button" data-z="-1" aria-label="Zoom out">−</button><button type="button" data-z="1" aria-label="Zoom in">+</button><button type="button" data-n="-1" aria-label="Previous sheet">‹</button><button type="button" data-n="1" aria-label="Next sheet">›</button><button type="button" data-x aria-label="Close">×</button></span></div><div class="du-dit24-vbody"><img alt=""></div></div>`);
      const v = document.getElementById('du-dit24-view'), img = v.querySelector('img'); let z = 1, url = '';
      const show = () => { if (url) URL.revokeObjectURL(url); const s = st.sheets[i]; url = svgUrl(s.svg); img.src = url; img.alt = s.num + ' ' + s.title; v.querySelector('[data-t]').textContent = `${s.num} · ${s.title} (${i + 1} of ${st.sheets.length})`; img.style.width = (z * 100) + '%'; };
      const close = () => { if (url) URL.revokeObjectURL(url); v.remove(); document.removeEventListener('keydown', key); };
      const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') { i = (i + 1) % st.sheets.length; show(); } if (e.key === 'ArrowLeft') { i = (i - 1 + st.sheets.length) % st.sheets.length; show(); } };
      v.querySelector('[data-x]').onclick = close; document.addEventListener('keydown', key);
      v.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { i = (i + +b.dataset.n + st.sheets.length) % st.sheets.length; show(); });
      v.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { z = Math.max(1, Math.min(4, z + +b.dataset.z * 0.75)); img.style.width = (z * 100) + '%'; });
      show(); v.querySelector('[data-x]').focus();
    }
    async function openSaved(id) {
      $('.du-dit24-out').innerHTML = '<p class="du-muted">Opening the drawing set…</p>';
      const { data, error } = await sb().from('drawing_generations').select('*').eq('id', id).eq('owner_id', u.id).maybeSingle();
      if (error || !data) { $('.du-dit24-out').innerHTML = `<p class="du-muted">That drawing set could not be opened${error ? ': ' + esc(error.message) : ''}.</p>`; return; }
      st.gen = data; st.model = data.model; st.status = data.issue_status || 'Preliminary'; st.reviewer = data.reviewer || st.reviewer; st.license = data.license_no || st.license;
      f('status').value = STATUSES.includes(st.status) ? st.status : 'Preliminary'; f('reviewer').value = st.reviewer; f('license').value = st.license;
      if (data.location) f('location').value = data.location; if (data.notes) f('notes').value = data.notes; if (data.project_thread_id) f('project').value = data.project_thread_id;
      st.sourceImage = data.source_paths?.[0] ? await sourceDataUrl(data.source_paths[0]) : '';
      draw(); $('.du-dit24-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function refreshRecent() { const r = $('.du-dit24-recent'); if (!r) return; recentInline(r); }
    async function recentInline(r) {
      let sets; try { sets = await listSets({ limit: 8 }); } catch (e) { r.innerHTML = `<p class="du-muted">${esc(e.message)}</p>`; return; }
      if (sets.missing) { r.innerHTML = '<p class="du-muted">Run the v24 SQL in Supabase to save drawing sets.</p>'; return; }
      r.innerHTML = sets.length ? sets.map(s => card(s, true)).join('') : '<p class="du-muted">Your drawing sets show here.</p>';
      r.querySelectorAll('[data-dit-open]').forEach(b => b.onclick = () => openSaved(b.dataset.ditOpen));
    }
    refreshRecent();
    if (opts.setId) openSaved(opts.setId);
    return { openSaved, addPictures: pics => { st.pics.push(...pics); st.pics = st.pics.slice(0, MAX_FILES); showPics(); } };
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
    host.innerHTML = `<div class="du-dit24-quick"><button type="button" data-q="draw"><b>✎ Draw it up</b><span>Picture in, drawing set out: plans, elevations, sections, details, schedules. Combine into one PDF.</span></button><button type="button" data-q="check"><b>✓ Check it</b><span>Find problems and code issues in a drawing or set, with the fix drawn on your template.</span></button><button type="button" data-q="coach"><b>✦ Ask Arch Coach</b><span>Attach pictures or files to a thread and ask about codes, details or construction.</span></button></div>`;
    host.querySelector('[data-q="draw"]').onclick = () => openInCoach({});
    host.querySelector('[data-q="check"]').onclick = () => { history.replaceState(null, '', '#portal/check?quick=1'); P()?.openPortalTab?.('check'); };
    host.querySelector('[data-q="coach"]').onclick = () => P()?.openPortalTab?.('arch-coach');
  }

  window.DrawUpDrawIt = { mount, recent, quickAccess, openInCoach, sideLinks, readPictures, imageToJpeg };
})();
