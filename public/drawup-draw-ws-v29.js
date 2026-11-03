/* DrawUp Draw — V29 Draw Workspace 2.0 (window.DrawUpWorkspace).
 * Adds to the existing Draw editor (drawup-tools-v18.js + V21 + V22), without replacing it:
 *  - Start from a picture: an image or PDF becomes an editable plan (free tracer for clean plans, DrawUp AI for
 *    anything else, or both), with the scale and every assumption shown for the member to confirm.
 *  - Component library: searchable, drag onto the plan, parametric sizes, the member's own components.
 *  - Tools: curved walls, offset, trim/extend, join, rotate to any angle, stretch by length.
 *  - Styles: CD, Sketch, Presentation, Realistic. A style never changes geometry (see DrawUpWSGeo.geomHash).
 *  - Coordinated 3D view (drawup-draw-3d-v29.js), elevations and sections with furniture and the roof.
 *  - Finishes, brand palette and concepts. Commands in plain English, always previewed before they apply.
 *  - Revision history with rollback (drawing_versions, SQL v29-01).
 * Geometry lives in one place: the drawing's model. Plan, elevation, section and 3D all read it. */
(function () {
  'use strict';
  const $q = (r, s) => r && r.querySelector(s), $$ = (r, s) => Array.from(r ? r.querySelectorAll(s) : []);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_e) { /* private mode */ } } };
  const BUCKET = 'drawup-private';
  const sb = () => window.drawupSupabaseClient;
  const G = () => window.DrawUpWSGeo, LB = () => window.DrawUpDrawLib, V3 = () => window.DrawUpDraw3D, TR = () => window.DrawUpTrace, D0 = () => window.DrawUpDrawCore;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
  async function token() { const s = (await sb().auth.getSession()).data.session; return s ? s.access_token : ''; }
  async function apiCall(path, opts) { const r = await fetch(path, Object.assign({}, opts || {}, { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() } })); const d = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(d.error || ('Request failed (' + r.status + ')')); e.data = d; throw e; } return d; }
  function toast(c, m, bad) { if (c && c.toast) return c.toast(m, bad); let t = document.getElementById('du-toast'); if (!t) { t = document.createElement('div'); t.id = 'du-toast'; t.className = 'du-toast'; document.body.appendChild(t); } t.textContent = m; t.dataset.state = bad ? 'bad' : 'good'; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 4200); }
  function download(name, data, type) { const blob = data instanceof Blob ? data : new Blob([data], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  function modal(id, html, cls) {
    document.getElementById(id)?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="dd22-modal dw29-modal ${cls || ''}" id="${id}" role="dialog" aria-modal="true"><div class="dd22-mcard du-glass"><button type="button" class="dd22-close" aria-label="Close">×</button><div class="dw29-mbody">${html}</div></div></div>`);
    const el = document.getElementById(id), onKey = e => { if (e.key === 'Escape') close(); }, close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
    $q(el, '.dd22-close').onclick = close; el.onclick = e => { if (e.target === el) close(); }; document.addEventListener('keydown', onKey);
    return { el, body: $q(el, '.dw29-mbody'), close };
  }
  const ftin = v => D0().formatFtIn(v);
  const parseLen = v => { const s = String(v || '').trim(); if (!s) return NaN; const a = D0().parseFtIn(s); if (isFinite(a) && a > 0) return a; const b = G().lengthIn(s); return b > 0 ? b : NaN; };
  const AI_COST = 20, EDIT_COST = 2;

  /* ============================================================ pictures */
  let pdfjsP = null;
  function loadScript(src) { return new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
  async function pdfjs() { if (window.pdfjsLib) return window.pdfjsLib; if (!pdfjsP) pdfjsP = loadScript('/vendor/pdfjs-3.11.174/pdf.min.js').then(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs-3.11.174/pdf.worker.min.js'; return window.pdfjsLib; }); return pdfjsP; }
  /** File -> { canvas, w, h, name, pdf } with the long side near 1600 px (what the tracer and the AI both read). */
  async function loadPicture(file, page) {
    if (!file) throw new Error('Pick a picture or PDF.');
    if (file.size > 20 * 1024 * 1024) throw new Error('That file is larger than 20 MB.');
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    const cv = document.createElement('canvas'), g = cv.getContext('2d');
    let pages = 1;
    if (isPdf) {
      const L = await pdfjs(), doc = await L.getDocument({ data: await file.arrayBuffer() }).promise; pages = doc.numPages;
      const pg = await doc.getPage(Math.min(pages, page || 1)), v1 = pg.getViewport({ scale: 1 }), k = 1600 / Math.max(v1.width, v1.height), vp = pg.getViewport({ scale: k });
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      await pg.render({ canvasContext: g, viewport: vp }).promise;
    } else {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Use a JPG, PNG, WebP or PDF file.');
      const url = URL.createObjectURL(file);
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('That picture could not be opened.')); i.src = url; });
      const big = Math.max(img.naturalWidth, img.naturalHeight), k = big > 1600 || big < 900 ? 1600 / big : 1;
      cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
    }
    return { canvas: cv, w: cv.width, h: cv.height, name: (file.name || 'Picture').replace(/\.[a-z0-9]+$/i, '').slice(0, 60), pdf: isPdf, pages };
  }
  const canvasBlob = (cv, type, q) => new Promise(res => cv.toBlob(res, type || 'image/png', q));
  async function uploadPicture(c, pic) {
    const blob = await canvasBlob(pic.canvas, 'image/png'), path = `${c.user.id}/draw/src-${uuid()}.png`;
    const up = await sb().storage.from(BUCKET).upload(path, blob, { contentType: 'image/png' }); if (up.error) throw up.error; return path;
  }
  async function signedUrl(path) { if (!path) return null; try { const { data } = await sb().storage.from(BUCKET).createSignedUrl(path, 3600); return data && data.signedUrl; } catch (_e) { return null; } }

  /** Walls and openings from the tracer, meaning (rooms, furniture, curves, scale) from the AI. */
  function merge(tr, ai) {
    if (!tr || !ai || ai.frame !== 'image_px' || (tr.walls || []).length < 4) return ai || tr;
    const T = tr.wall_px || 10, d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
    const curved = (ai.walls || []).filter(w => w.curved || w.kind === 'low'); // the tracer reads neither curves nor thin half walls
    const extraOps = (ai.openings || []).filter(o => !tr.openings.some(t => d(t.at, o.at) < T * 3)).map(o => Object.assign({}, o, { wall_id: null }));
    return Object.assign({}, ai, { by: 'tracer+ai', walls: tr.walls.concat(curved), openings: tr.openings.concat(extraOps), wall_px: T,
      assumptions: (ai.assumptions || []).concat([{ text: 'Straight walls and openings were traced from the picture. Curved walls, rooms, zones and furniture were read by DrawUp AI.', kind: 'walls' }]) });
  }
  async function runAI(c, pic, path, o, onTick) {
    const start = await apiCall('/api/draw/workspace', { method: 'POST', body: JSON.stringify({ action: 'interpret', path, image: { w: pic.w, h: pic.h }, kind: o.kind, hint: o.hint || '' }) });
    document.dispatchEvent(new Event('du-credits'));
    const t0 = Date.now();
    for (;;) {
      await sleep(2500); onTick && onTick(Math.round((Date.now() - t0) / 1000));
      const r = await apiCall('/api/draw/workspace', { method: 'POST', body: JSON.stringify({ poll: start.ticket }) });
      if (r.status === 'done') return r.interpretation;
      if (Date.now() - t0 > 6 * 60 * 1000) throw new Error('DrawUp AI is taking longer than 6 minutes. Try again; a failed read is refunded.');
    }
  }

  /* ============================================================ picture-to-plan wizard */
  function wizard(c, opts) {
    opts = opts || {};
    const st = { pic: null, file: null, kind: 'floor_plan', method: 'trace', building: 'auto', I: null, tr: null, known: null, path: null, view: 'overlay', page: 1, wallH: '', ceil: '' };
    const M = modal('dw29-wiz', '', 'dw29-wizmodal');
    const stepOne = () => {
      M.body.innerHTML = `<span class="du-kicker">DRAW · START FROM A PICTURE</span><h2>Turn a picture into an editable plan</h2>
        <p class="du-muted">Upload a floor plan, a hand sketch, a rendering or a photo. DrawUp rebuilds it as real walls, doors, windows, rooms and furniture you can edit. Sizes are estimates until you confirm one measurement.</p>
        <label class="dw29-drop" id="dw29-drop"><input type="file" id="dw29-file" accept="image/png,image/jpeg,image/webp,application/pdf"><b>${st.pic ? 'Choose a different file' : 'Choose a picture or PDF'}</b><span>JPG, PNG, WebP or PDF (one page at a time), up to 20 MB.</span></label>
        <div class="dw29-prev" id="dw29-prev">${st.pic ? '' : ''}</div>
        <div class="dw29-opts">
          <fieldset><legend>What is it?</legend>${[['floor_plan', 'Floor plan (drawn from above)'], ['sketch', 'Hand sketch'], ['photo', 'Rendering, axonometric or photo']].map(([k, l]) => `<label><input type="radio" name="dw29-kind" value="${k}"${st.kind === k ? ' checked' : ''}> ${l}</label>`).join('')}</fieldset>
          <fieldset><legend>Read it with</legend>
            <label><input type="radio" name="dw29-m" value="trace"${st.method === 'trace' ? ' checked' : ''}> Free tracer <small>Clean black-on-white floor plans. Straight walls, doors and windows. No credits.</small></label>
            <label><input type="radio" name="dw29-m" value="both"${st.method === 'both' ? ' checked' : ''}> Tracer + DrawUp AI · ${AI_COST} credits <small>Walls from the tracer; rooms, zones, curved walls and furniture from the AI.</small></label>
            <label><input type="radio" name="dw29-m" value="ai"${st.method === 'ai' ? ' checked' : ''}> DrawUp AI · ${AI_COST} credits <small>Sketches, colour plans, renderings and photos. Refunded if it fails.</small></label></fieldset>
          <fieldset><legend>Building</legend>${[['auto', 'Work it out'], ['home', 'Home'], ['commercial', 'Shop, restaurant or office']].map(([k, l]) => `<label><input type="radio" name="dw29-b" value="${k}"${st.building === k ? ' checked' : ''}> ${l}</label>`).join('')}</fieldset>
        </div>
        <div class="du-field"><label for="dw29-hint">Anything DrawUp should know? (optional)</label><input id="dw29-hint" placeholder="For example: the counter is curved; the front is all glass" maxlength="300"></div>
        <p class="du-draw-warn" id="dw29-err" hidden></p>
        <div class="dw21-btnrow"><button type="button" class="du-btn primary" id="dw29-read" ${st.pic ? '' : 'disabled'}>Read the picture</button><button type="button" class="du-btn ghost" id="dw29-cancel">Cancel</button></div>
        <p class="du-muted dw21-small">The result is a starting point for design, not a survey. Check and confirm sizes before you rely on them.</p>`;
      const prev = $q(M.body, '#dw29-prev');
      const showPrev = () => { prev.innerHTML = ''; if (!st.pic) return; const im = new Image(); im.src = st.pic.canvas.toDataURL('image/jpeg', 0.8); im.alt = 'Your picture'; prev.appendChild(im); if (st.pic.pdf && st.pic.pages > 1) { prev.insertAdjacentHTML('beforeend', `<label class="dw29-page">Page <input type="number" id="dw29-pg" min="1" max="${st.pic.pages}" value="${st.page}"> of ${st.pic.pages}</label>`); $q(prev, '#dw29-pg').onchange = async e => { st.page = Math.max(1, Math.min(st.pic.pages, +e.target.value || 1)); st.pic = await loadPicture(st.file, st.page); showPrev(); }; } };
      showPrev();
      const err = m => { const e = $q(M.body, '#dw29-err'); e.hidden = !m; e.textContent = m || ''; };
      $q(M.body, '#dw29-file').onchange = async e => {
        const f = e.target.files[0]; if (!f) return; err('');
        try { st.file = f; st.page = 1; st.pic = await loadPicture(f, 1); st.path = null; showPrev(); $q(M.body, '#dw29-read').disabled = false; if (st.pic.pdf) { st.kind = 'floor_plan'; } }
        catch (x) { err(x.message || String(x)); }
      };
      $$(M.body, '[name=dw29-kind]').forEach(r => r.onchange = () => { st.kind = r.value; if (r.value !== 'floor_plan' && st.method === 'trace') { st.method = 'ai'; $q(M.body, '[name=dw29-m][value=ai]').checked = true; } });
      $$(M.body, '[name=dw29-m]').forEach(r => r.onchange = () => { st.method = r.value; });
      $$(M.body, '[name=dw29-b]').forEach(r => r.onchange = () => { st.building = r.value; });
      $q(M.body, '#dw29-cancel').onclick = M.close;
      $q(M.body, '#dw29-read').onclick = async () => {
        const b = $q(M.body, '#dw29-read'); b.disabled = true; err('');
        const hint = $q(M.body, '#dw29-hint').value.trim();
        try {
          st.tr = null; st.I = null; st.known = null;
          if (st.method !== 'ai') { b.textContent = 'Tracing walls…'; await sleep(20); st.tr = TR().fromCanvas(st.pic.canvas); }
          if (st.method === 'trace' && st.kind !== 'floor_plan') throw new Error('The free tracer only reads floor plans drawn from above. Pick DrawUp AI for sketches, renderings and photos.');
          if (st.method !== 'trace') {
            if (!confirm(`Read this picture with DrawUp AI? It uses ${AI_COST} credits, refunded if it fails.`)) { b.disabled = false; b.textContent = 'Read the picture'; return; }
            b.textContent = 'Uploading…'; st.path = st.path || await uploadPicture(c, st.pic);
            b.textContent = 'DrawUp AI is reading the picture…';
            const ai = await runAI(c, st.pic, st.path, { kind: st.kind, hint }, s => { b.textContent = `DrawUp AI is reading the picture… ${s}s`; });
            st.I = st.method === 'both' ? merge(st.tr, ai) : ai;
          } else st.I = st.tr;
          if (!st.I || (!(st.I.walls || []).length && !(st.I.rooms || []).length)) throw new Error(st.method === 'trace' ? 'The tracer found no walls. Pick DrawUp AI, or try a cleaner, higher-contrast copy.' : 'Nothing could be read from this picture.');
          review();
        } catch (x) { err(x.message || String(x)); b.disabled = false; b.textContent = 'Read the picture'; }
      };
    };
    const residential = () => (st.building === 'home' ? true : st.building === 'commercial' ? false : undefined);
    const convert = () => {
      const res = G().fromInterpretation(st.I, { known: st.known, residential: residential(), wallHeight: parseLen(st.wallH) || undefined, ceiling: parseLen(st.ceil) || undefined });
      const m = res.model;
      if (!m.rooms.length && m.walls.length) { // the tracer reads no names: one ROOM tag per closed space, to rename
        let fs = []; try { fs = G().faces(m).filter(f => Math.abs(f.area || G().area(f.poly)) > 20 * 144); } catch (_e) { fs = []; }
        const ceil = parseLen(st.ceil) || (residential() === false ? 120 : 96);
        fs.forEach((f, i) => { const c = G().centroidOf(f.poly); if (G().inside(c, f.poly)) m.rooms.push({ id: 'r_' + Math.random().toString(36).slice(2, 9), name: 'ROOM ' + (i + 1), number: '', ceiling: ceil, at: { x: Math.round(c.x), y: Math.round(c.y) } }); });
        if (m.rooms.length) { const a = { id: 'as_rooms', text: `Room names were not read: ${m.rooms.length} closed spaces are tagged ROOM 1 to ${m.rooms.length}. Rename them in each room's panel, or read the picture with DrawUp AI.`, kind: 'layout', status: 'assumed' }; res.report.assumptions.push(a); m.ws.assumptions.push(a); }
      }
      return res;
    };
    const review = () => {
      const res = convert(), m = res.model, I = st.I, sc = res.report.scale;
      const comps = (m.items || []).filter(i => i.kind === 'component').length;
      M.body.innerHTML = `<span class="du-kicker">DRAW · CHECK WHAT DREW UP</span><h2>Check the plan before it opens</h2>
        <div class="dw29-review"><div class="dw29-stagewrap"><div class="dw21-seg" role="group" aria-label="Show"><button type="button" data-rv="overlay" class="${st.view === 'overlay' ? 'on' : ''}">On the picture</button><button type="button" data-rv="plan" class="${st.view === 'plan' ? 'on' : ''}">As a plan</button></div>
          <div class="dw29-stage" id="dw29-stage"></div><p class="du-muted dw21-small" id="dw29-mhint">${I.frame === 'plan_in' ? 'This picture is not drawn from above, so the plan is DrawUp AI’s estimate of the layout.' : 'Red: outside walls. Blue: inside walls. Green: doors and openings. Orange: windows.'}</p></div>
        <aside class="dw29-rvside">
          <p><b>${m.walls.length}</b> walls · <b>${m.openings.length}</b> doors, windows and openings · <b>${m.rooms.length}</b> rooms · <b>${comps}</b> furniture and fixtures${(m.curves || []).length ? ` · <b>${m.curves.length}</b> curved` : ''}</p>
          <h3>Scale</h3><p class="dw29-scale"><span class="dw29-chip ${sc.confirmed ? 'ok' : 'warn'}">${sc.confirmed ? 'Confirmed' : 'Assumed'}</span> ${esc(sc.note)}</p>
          ${I.frame === 'plan_in' ? '' : `<button type="button" class="du-btn ghost" id="dw29-measure">Measure a known length</button><div class="dw29-mform" id="dw29-mform" hidden><p class="du-muted">Click two points on the picture that you know the distance between (a wall, a door, a dimension line).</p><div class="du-two"><div class="du-field"><label for="dw29-mlen">Real length</label><input id="dw29-mlen" placeholder="12'-0&quot;"></div><div class="du-field"><label>On the picture</label><input id="dw29-mpx" disabled></div></div><button type="button" class="du-btn primary" id="dw29-muse" disabled>Use this scale</button></div>`}
          <h3>Heights</h3><div class="du-two"><div class="du-field"><label for="dw29-wh">Wall height</label><input id="dw29-wh" placeholder="${esc(residential() === false || !(m.walls[0] && m.walls[0].height < 120) ? "12'-0\"" : "9'-0\"")}" value="${esc(st.wallH)}"></div><div class="du-field"><label for="dw29-ch">Ceiling height</label><input id="dw29-ch" placeholder="${esc(ftin((m.rooms[0] || {}).ceiling || 96))}" value="${esc(st.ceil)}"></div></div>
          <h3>Assumptions (${res.report.assumptions.length})</h3><ol class="dw29-asl">${res.report.assumptions.map(a => `<li><span class="dw29-chip ${a.status === 'confirmed' ? 'ok' : 'warn'}">${a.status === 'confirmed' ? 'Confirmed' : 'Assumed'}</span> ${esc(a.text)}</li>`).join('')}</ol>
          ${res.report.unknowns.length ? `<h3>Could not read (${res.report.unknowns.length})</h3><ul class="dw29-asl">${res.report.unknowns.map(u => `<li>${esc(u.text)}</li>`).join('')}</ul>` : ''}
          ${(I.report && I.report.notes || []).length ? `<details><summary>Tracer notes</summary><ul>${I.report.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}
          <div class="du-field"><label for="dw29-name">Drawing name</label><input id="dw29-name" value="${esc((st.pic.name || 'Floor Plan').replace(/[_-]+/g, ' '))}" maxlength="80"></div>
          <p class="du-draw-warn" id="dw29-err" hidden></p>
          <div class="dw21-btnrow"><button type="button" class="du-btn primary" id="dw29-create">Create editable plan</button><button type="button" class="du-btn ghost" id="dw29-back">Back</button></div>
          <p class="du-muted dw21-small">You can move, resize and retype everything after it opens. Nothing here is construction-ready until a professional checks it.</p>
        </aside></div>`;
      const stage = $q(M.body, '#dw29-stage');
      const drawStage = () => {
        stage.innerHTML = '';
        if (st.view === 'plan' || I.frame === 'plan_in') { stage.innerHTML = D0().toSVG(m, 96, { ink: '#0d1b2a', poche: '#1d2328', paper: '#ffffff' }); const s = $q(stage, 'svg'); s.setAttribute('width', '100%'); s.setAttribute('height', '100%'); return; }
        const cv = document.createElement('canvas'); cv.width = st.pic.w; cv.height = st.pic.h; cv.className = 'dw29-ov'; stage.appendChild(cv);
        const g = cv.getContext('2d'); g.globalAlpha = 0.55; g.drawImage(st.pic.canvas, 0, 0); g.globalAlpha = 1; const lw = Math.max(2, st.pic.w / 400);
        (I.walls || []).forEach(w => { g.strokeStyle = w.kind === 'exterior' ? '#e5322d' : w.kind === 'storefront' ? '#7b3fe4' : '#1b6cff'; g.lineWidth = lw * 1.4; g.beginPath(); g.moveTo(w.a.x, w.a.y); if (w.curved && w.curved.through) g.quadraticCurveTo(2 * w.curved.through.x - (w.a.x + w.b.x) / 2, 2 * w.curved.through.y - (w.a.y + w.b.y) / 2, w.b.x, w.b.y); else g.lineTo(w.b.x, w.b.y); g.stroke(); });
        (I.openings || []).forEach(o => { g.strokeStyle = /window|glass/.test(o.kind) ? '#ff8c00' : '#0a9b45'; g.lineWidth = lw; g.beginPath(); g.arc(o.at.x, o.at.y, lw * 4, 0, Math.PI * 2); g.stroke(); });
        g.font = `600 ${Math.round(lw * 7)}px Inter, Arial, sans-serif`; g.textAlign = 'center';
        (I.rooms || []).forEach(r => { g.fillStyle = 'rgba(13,27,42,.85)'; g.fillText(r.name, r.label_at.x, r.label_at.y); });
        (I.components || []).forEach(o => { const w = o.w_px || 20, d = o.d_px || 20; g.save(); g.translate(o.at.x, o.at.y); g.rotate((o.rot || 0) * Math.PI / 180); g.strokeStyle = '#8a2be2'; g.lineWidth = lw * 0.8; g.strokeRect(-w / 2, -d / 2, w, d); g.restore(); });
        if (st.mpts && st.mpts.length) { g.strokeStyle = '#ff2d95'; g.fillStyle = '#ff2d95'; g.lineWidth = lw; st.mpts.forEach(p => { g.beginPath(); g.arc(p.x, p.y, lw * 2.5, 0, Math.PI * 2); g.fill(); }); if (st.mpts.length === 2) { g.beginPath(); g.moveTo(st.mpts[0].x, st.mpts[0].y); g.lineTo(st.mpts[1].x, st.mpts[1].y); g.stroke(); } }
        cv.onclick = e => {
          if (!st.measuring) return; const r = cv.getBoundingClientRect(), p = { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height };
          st.mpts = st.mpts && st.mpts.length < 2 ? st.mpts.concat([p]) : [p]; drawStage();
          if (st.mpts.length === 2) { const px = Math.hypot(st.mpts[1].x - st.mpts[0].x, st.mpts[1].y - st.mpts[0].y); $q(M.body, '#dw29-mpx').value = Math.round(px) + ' px'; $q(M.body, '#dw29-muse').disabled = false; }
        };
      };
      drawStage();
      $$(M.body, '[data-rv]').forEach(b => b.onclick = () => { st.view = b.dataset.rv; $$(M.body, '[data-rv]').forEach(x => x.classList.toggle('on', x === b)); drawStage(); });
      const mb = $q(M.body, '#dw29-measure');
      if (mb) mb.onclick = () => { st.measuring = true; st.mpts = []; st.view = 'overlay'; $q(M.body, '#dw29-mform').hidden = false; $q(M.body, '#dw29-stage').classList.add('dw29-measuring'); drawStage(); };
      const mu = $q(M.body, '#dw29-muse');
      if (mu) mu.onclick = () => { const L = parseLen($q(M.body, '#dw29-mlen').value); if (!(L > 0) || !st.mpts || st.mpts.length < 2) { toast(c, 'Click two points, then type their real distance, like 12\'-0".', true); return; } st.known = { px: Math.hypot(st.mpts[1].x - st.mpts[0].x, st.mpts[1].y - st.mpts[0].y), inches: L }; st.measuring = false; st.mpts = null; review(); };
      $q(M.body, '#dw29-wh').onchange = e => { st.wallH = e.target.value; };
      $q(M.body, '#dw29-ch').onchange = e => { st.ceil = e.target.value; };
      $q(M.body, '#dw29-back').onclick = stepOne;
      $q(M.body, '#dw29-create').onclick = async () => {
        const b = $q(M.body, '#dw29-create'); b.disabled = true; b.textContent = 'Creating…';
        try {
          st.wallH = $q(M.body, '#dw29-wh').value; st.ceil = $q(M.body, '#dw29-ch').value;
          const out = convert().model;
          if (!st.path) { try { st.path = await uploadPicture(c, st.pic); } catch (_e) { st.path = null; } }
          Object.assign(out.ws.source, { path: st.path, image: { w: st.pic.w, h: st.pic.h }, name: st.pic.name, read_with: st.method });
          const name = $q(M.body, '#dw29-name').value.trim() || 'Floor Plan';
          const { data, error } = await sb().from('drawings').insert({ owner_id: c.user.id, name, sheet_number: 'A101', project_thread_id: opts.project || null, model: out }).select('id').single();
          if (error) throw error;
          await saveVersion(c, { id: data.id, revision: 1 }, out, 'import', 'From picture: ' + st.pic.name).catch(() => {});
          M.close(); history.replaceState(null, '', '#portal/draw?id=' + data.id); c.openPortalTab('draw');
        } catch (x) { const e = $q(M.body, '#dw29-err'); e.hidden = false; e.textContent = 'Not created — ' + (x.message || x); b.disabled = false; b.textContent = 'Create editable plan'; }
      };
    };
    stepOne();
    return { state: st, el: M.el, close: M.close, _review: () => review() };
  }

  /* ============================================================ versions (SQL v29-01) */
  async function saveVersion(c, row, model, reason, label) {
    const { error } = await sb().from('drawing_versions').insert({ drawing_id: row.id, owner_id: c.user.id, revision: row.revision || 1, reason, label: String(label || 'Autosave').slice(0, 120), model, geom_hash: G().geomHash(model) });
    if (error) throw error;
  }

  /* ============================================================ plan styles */
  const STYLE_LIST = [['cd', 'CD'], ['sketch', 'Sketch'], ['presentation', 'Presentation'], ['realistic', 'Realistic']];
  const ZONE_FILL = { retail: '#f6e6d2', seating: '#f3dccb', queue: '#efe9da', service: '#e8e2f3', production: '#e3ecf4', back_of_house: '#e6e9ec', restroom: '#dfeef3', living: '#efe6d6', sleeping: '#e7eaf3', kitchen: '#f1eadb', wet: '#dcecf1', storage: '#ececec', circulation: '#f4f1ea', outdoor: '#e4efdc', other: '#f1ede6' };
  const CAT_FILL = { seating: '#7d8b99', tables: '#b48a5f', beds: '#c9cfdc', storage: '#b8a284', kitchen: '#d4d6d8', bath: '#e9f2f6', retail: '#d8c3a5', office: '#b9c1c9', equipment: '#c6ccd2', lighting: '#f7e7a6', signage: '#c8102e', people: '#c9b8a4', vehicles: '#9aa5b1', plants: '#7fae6c', custom: '#a3b6c9' };
  const zoneOf = r => r.kind && ZONE_FILL[r.kind] ? r.kind : /bed|suite/i.test(r.name) ? 'sleeping' : /bath|wc|toilet|restroom|powder/i.test(r.name) ? 'wet' : /kitchen/i.test(r.name) ? 'kitchen' : /closet|wic|storage|stor/i.test(r.name) ? 'storage' : /hall|corr|stair|foyer|entry/i.test(r.name) ? 'circulation' : /living|family|bonus|great|den|dining/i.test(r.name) ? 'living' : /seat|dining/i.test(r.name) ? 'seating' : /queue|line/i.test(r.name) ? 'queue' : /sales|retail|shop/i.test(r.name) ? 'retail' : /kitchen|prod|back|boh/i.test(r.name) ? 'back_of_house' : 'other';
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) { const e = document.createElementNS(NS, tag); Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v)); return e; }
  function floorFill(model, room, realistic, defs, scale) {
    const F3 = V3() && V3().FINISHES, fin = (model.ws && model.ws.finishes) || {}, f = (fin[room.id] && fin[room.id].floor) || (fin.all && fin.all.floor);
    const base = f && V3() ? V3().finishColor('floor', f, null) : null;
    const col = base || ZONE_FILL[zoneOf(room)];
    if (!realistic || !f) return col;
    const k = String(f).toLowerCase(), id = 'dw29-p-' + k.replace(/[^a-z]/g, '');
    if (!defs.querySelector('#' + id)) {
      let p;
      if (/oak|walnut|wood|vinyl/.test(k)) { p = el('pattern', { id, patternUnits: 'userSpaceOnUse', width: 48, height: 6 }); p.append(el('rect', { width: 48, height: 6, fill: col }), el('line', { x1: 0, y1: 6, x2: 48, y2: 6, stroke: 'rgba(60,35,15,.35)', 'stroke-width': 0.4 }), el('line', { x1: 30, y1: 0, x2: 30, y2: 6, stroke: 'rgba(60,35,15,.3)', 'stroke-width': 0.4 })); }
      else if (/tile|marble|terrazzo/.test(k)) { const s = /marble/.test(k) ? 24 : 12; p = el('pattern', { id, patternUnits: 'userSpaceOnUse', width: s, height: s }); p.append(el('rect', { width: s, height: s, fill: col }), el('path', { d: `M0 0H${s}M0 0V${s}`, stroke: 'rgba(0,0,0,.18)', 'stroke-width': 0.35, fill: 'none' })); }
      else { p = el('pattern', { id, patternUnits: 'userSpaceOnUse', width: 48, height: 48 }); p.append(el('rect', { width: 48, height: 48, fill: col }), el('circle', { cx: 12, cy: 9, r: 0.6, fill: 'rgba(0,0,0,.12)' }), el('circle', { cx: 33, cy: 30, r: 0.5, fill: 'rgba(0,0,0,.1)' }), el('path', { d: 'M0 0H48M0 0V48', stroke: 'rgba(0,0,0,.08)', 'stroke-width': 0.5 })); }
      defs.appendChild(p);
    }
    void F3; void scale; return `url(#${id})`;
  }
  /** Restyles the plan SVG in place. Only colours, fills, filters and fonts change; geometry is untouched. */
  function applyStyle(svg, model, style, scale) {
    if (!svg) return; svg.dataset.dwStyle = style || 'cd';
    if (!style || style === 'cd') { $$(svg, '.du-wall-fill').forEach(p => { if (p.getAttribute('fill') !== '#1b8cff') p.setAttribute('fill', '#141414'); }); svg.style.background = '#ffffff'; return; }
    let defs = $q(svg, 'defs'); if (!defs) { defs = el('defs'); svg.insertBefore(defs, svg.firstChild); }
    const first = defs.nextSibling;
    if (style === 'sketch') {
      if (!$q(defs, '#dw29-sk')) { const f = el('filter', { id: 'dw29-sk', x: '-5%', y: '-5%', width: '110%', height: '110%' }); f.append(el('feTurbulence', { type: 'fractalNoise', baseFrequency: String(1 / (0.35 * scale)), numOctaves: 2, seed: 7, result: 'n' }), el('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: String(0.035 * scale), xChannelSelector: 'R', yChannelSelector: 'G' })); defs.appendChild(f); }
      const g = el('g', { filter: 'url(#dw29-sk)', class: 'dw29-skg' }); Array.from(svg.childNodes).filter(n => n !== defs && !(n.classList && n.classList.contains('du-item-hit'))).forEach(n => g.appendChild(n)); svg.appendChild(g);
      $$(svg, '.du-wall-fill').forEach(p => { if (p.getAttribute('fill') !== '#1b8cff') { p.setAttribute('fill', '#3a3a3a'); p.setAttribute('fill-opacity', '0.82'); } });
      $$(svg, 'text').forEach(t => t.setAttribute('font-family', "'Segoe Print','Bradley Hand','Comic Sans MS','Chalkboard SE',cursive"));
      $$(svg, 'line,polyline,path,polygon:not(.du-wall-fill)').forEach(l => { if (l.getAttribute('stroke') && l.getAttribute('stroke') !== 'none') l.setAttribute('stroke', '#2b2b2b'); });
      svg.style.background = '#fbf8f1'; return;
    }
    // presentation and realistic: coloured floors by zone or finish, charcoal walls, tinted furniture, soft shadow
    const realistic = style === 'realistic';
    let outlines = []; try { outlines = G().roomOutlines(model).filter(r => r.poly); } catch (_e) { /* */ }
    const lay = el('g', { class: 'dw29-floors', 'pointer-events': 'none' });
    outlines.forEach(r => lay.appendChild(el('polygon', { points: r.poly.map(p => p.x + ',' + p.y).join(' '), fill: floorFill(model, r.room, realistic, defs, scale), stroke: 'none' })));
    svg.insertBefore(lay, first);
    if (!$q(defs, '#dw29-sh')) { const f = el('filter', { id: 'dw29-sh', x: '-10%', y: '-10%', width: '120%', height: '120%' }); f.appendChild(el('feDropShadow', { dx: String(0.03 * scale), dy: String(0.04 * scale), stdDeviation: String(0.03 * scale), 'flood-color': '#1a2430', 'flood-opacity': realistic ? '0.35' : '0.22' })); defs.appendChild(f); }
    $$(svg, '.du-wall-fill').forEach(p => { if (p.getAttribute('fill') !== '#1b8cff') { p.setAttribute('fill', realistic ? '#3b4148' : '#2d3540'); p.setAttribute('filter', 'url(#dw29-sh)'); } });
    const comps = new Map((model.items || []).filter(i => i.kind === 'component').map(i => [i.id, i]));
    const done = new Set();
    $$(svg, 'polygon[data-item]:not(.du-item-hit)').forEach(p => {
      const it = comps.get(p.dataset.item); if (!it) return; const c = (LB().get(it.comp) || { cat: 'custom' }).cat;
      let col = CAT_FILL[c] || '#c9c2b5'; if (c === 'signage' && model.ws && model.ws.brand && /^#[0-9a-f]{6}$/i.test(model.ws.brand.primary || '')) col = model.ws.brand.primary;
      p.setAttribute('fill', col); p.setAttribute('fill-opacity', done.has(it.id) ? '0.35' : '0.75'); if (!done.has(it.id)) p.setAttribute('filter', 'url(#dw29-sh)'); done.add(it.id);
      p.setAttribute('stroke', '#3d4650');
    });
    svg.style.background = realistic ? '#f3f1ec' : '#fbfaf7';
  }
  /** The plan SVG as a PNG (for exports and the coach). */
  async function svgToPng(svg, px) {
    const vb = (svg.getAttribute('viewBox') || '0 0 100 100').split(/\s+/).map(Number), k = (px || 2400) / Math.max(vb[2], vb[3]);
    const s = svg.cloneNode(true); s.setAttribute('width', Math.round(vb[2] * k)); s.setAttribute('height', Math.round(vb[3] * k)); $$(s, '.du-item-hit').forEach(n => n.remove());
    const bg = svg.style.background || '#ffffff';
    const xml = new XMLSerializer().serializeToString(s), url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('The plan image could not be made.')); i.src = url; });
    const cv = document.createElement('canvas'); cv.width = Math.round(vb[2] * k); cv.height = Math.round(vb[3] * k); const g = cv.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0);
    return cv;
  }

  /* ============================================================ finishes, brand, concepts */
  const CONCEPTS = [
    { id: 'warm', name: 'Warm minimal', floor: 'oak', wall: 'warm white', accent: 'brass' },
    { id: 'industrial', name: 'Industrial', floor: 'polished concrete', wall: 'light grey', accent: 'black' },
    { id: 'fresh', name: 'Fresh retail', floor: 'terrazzo', wall: 'white', accent: 'green' },
    { id: 'bold', name: 'Bold brand', floor: 'white tile', wall: 'white', accent: 'red' },
    { id: 'classic', name: 'Classic home', floor: 'walnut', wall: 'sage', accent: 'brass' },
  ];

  /* ============================================================ the editor extension */
  function extend(api, e) {
    const C = api.D, w = api.w, c = api.c, Gm = G(), L = LB();
    if (!Gm || !L) return e;
    Gm.ws(api.model);
    const wsOf = () => Gm.ws(api.model);
    let tool = null, hoverPt = null, preview = null, three = null, threeOn = false, lastVer = { t: Date.now(), h: Gm.geomHash(api.model) }, underlay = store.get('dw29-under', false), underUrl = null, libOpen = false, libQ = '', libCat = '', customs = [];
    const save = () => api.scheduleSave();
    const change = (fn, silent) => { const before = JSON.stringify(api.model); try { fn(); } catch (x) { api.model = C.normalizeModel(JSON.parse(before)); Gm.ws(api.model); if (!silent) toast(c, x.message || String(x), true); api.render(); return false; } api.pushUndo(before); Gm.ws(api.model); api.render(); save(); return true; };
    const style = () => wsOf().style || 'cd';
    // UI
    const row21 = $q(w, '.dw21-row');
    const bar = $q(w, '.du-draw-bar20');
    const ws0 = wsOf(), nAs = () => (wsOf().assumptions || []).filter(a => a.status !== 'confirmed').length + (wsOf().unknowns || []).filter(u => u.status !== 'resolved').length;
    (row21 || bar).insertAdjacentHTML(row21 ? 'afterend' : 'afterbegin', `<div class="dw29-row">
      <div class="dw21-seg" role="group" aria-label="Drawing style">${STYLE_LIST.map(([k, l]) => `<button type="button" data-style="${k}" class="${style() === k ? 'on' : ''}" aria-pressed="${style() === k}">${l}</button>`).join('')}</div>
      <button type="button" class="dw21-btn" id="dw29-libbtn" aria-expanded="false">Library</button>
      <button type="button" class="dw21-btn" id="dw29-curve" aria-pressed="false" title="Click the start, the end, then a point the curve passes through">Curved wall</button>
      <button type="button" class="dw21-btn" id="dw29-fin">Finishes</button>
      <button type="button" class="dw21-btn" id="dw29-as">Assumptions <span class="dw29-badge" id="dw29-asn">${nAs()}</span></button>
      <button type="button" class="dw21-btn" id="dw29-hist">History</button>
      ${ws0.source && ws0.source.path ? `<button type="button" class="dw21-btn" id="dw29-under" aria-pressed="${underlay}">Picture</button>` : ''}
      <form class="dw29-cmd" id="dw29-cmd" autocomplete="off"><input id="dw29-cmdin" placeholder="Tell DrawUp a change: move the counter 3 feet north" aria-label="Tell DrawUp a change" maxlength="400"><button type="submit" class="dw21-btn primary">Preview</button></form>
      <button type="button" class="dw21-btn" id="dw29-coach">Ask Arch Coach</button>
      <div class="dw29-menu"><button type="button" class="dw21-btn" id="dw29-exp" aria-expanded="false">Export ▾</button><div class="dw21-pop dw29-exppop" id="dw29-exppop" hidden>
        <button type="button" data-exp="png">Plan PNG in this style</button><button type="button" data-exp="svg">Plan SVG in this style</button><button type="button" data-exp="3dpng">3D view PNG</button><button type="button" data-exp="glb">3D model (GLB)</button><button type="button" data-exp="json">Drawing data (JSON)</button><p>PDF and DXF (buttons above) stay in CD style for printing and CAD.</p></div></div>
    </div><div class="dw29-banner" id="dw29-banner" hidden></div>`);
    const view = $q(w, '.dw21-seg[aria-label="View"]');
    if (view) view.insertAdjacentHTML('beforeend', '<button type="button" data-view29="3d">3D</button>');
    const split = $q(w, '.du-draw-split');
    split.insertAdjacentHTML('afterbegin', `<aside class="dw29-lib du-glass" id="dw29-lib" hidden aria-label="Component library"></aside>
      <div class="dw29-3d" id="dw29-3d" hidden><div class="dw29-3dstage" id="dw29-3dstage"><p class="du-muted">Loading 3D…</p></div><div class="dw29-3dbar"><div class="dw21-seg" role="group" aria-label="3D camera">${[['iso', 'Corner'], ['top', 'Top'], ['front', 'Front'], ['side', 'Side']].map(([k, l]) => `<button type="button" data-cam3="${k}">${l}</button>`).join('')}</div><label class="dw29-chk"><input type="checkbox" id="dw29-cut" checked> Cut walls at 4'-0"</label><label class="dw29-chk"><input type="checkbox" id="dw29-roof"> Roof</label><label class="dw29-chk"><input type="checkbox" id="dw29-ceil"> Ceilings</label><span class="dw21-flex"></span><button type="button" class="dw21-btn" data-exp="3dpng">PNG</button><button type="button" class="dw21-btn" data-exp="glb">GLB</button><button type="button" class="dw21-btn primary" id="dw29-photo">Photoreal render…</button></div><p class="du-muted dw21-small">Built from the plan: change the plan and this view follows. Click a part to select it. The style buttons change materials only.</p></div>`);
    const canvasEl = api.canvas, v21view = $q(w, '#dw21-view');
    const banner = $q(w, '#dw29-banner');
    const syncStyleBtns = () => $$(w, '[data-style]').forEach(b => { const on = b.dataset.style === style(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    $$(w, '[data-style]').forEach(b => b.onclick = () => {
      const h0 = Gm.geomHash(api.model); wsOf().style = b.dataset.style; syncStyleBtns(); api.render(); save();
      if (Gm.geomHash(api.model) !== h0) console.error('DrawUp: style change altered geometry'); // never expected
    });
    /* ---------- 3D */
    function show3D(on) {
      threeOn = on; $q(w, '#dw29-3d').hidden = !on; w.classList.toggle('dw29-3dmode', on);
      $$(w, '[data-view29]').forEach(b => b.classList.toggle('on', on));
      if (on) { $$(w, '[data-view]').forEach(b => b.classList.remove('on')); canvasEl.hidden = true; if (v21view) v21view.hidden = true; mount3D(); }
      else { canvasEl.hidden = e && e.mode && e.mode !== 'plan'; if (v21view) v21view.hidden = !(e && e.mode && e.mode !== 'plan'); $$(w, '[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === ((e && e.mode) || 'plan'))); }
    }
    async function mount3D() {
      const stage = $q(w, '#dw29-3dstage');
      try {
        if (!three) { stage.innerHTML = ''; three = await V3().mount(stage, api.model, { style: style(), cut: $q(w, '#dw29-cut').checked ? 48 : 0, roof: $q(w, '#dw29-roof').checked, ceilings: $q(w, '#dw29-ceil').checked, onPick: s => { if (s) { api.sel = s; api.render(); } } }); window.DrawUpWorkspace.viewer3d = three; }
        else three.update(api.model, { style: style() });
      } catch (x) { stage.innerHTML = `<p class="du-draw-warn">3D could not start: ${esc(x.message || x)}. Your browser may not support WebGL.</p>`; }
    }
    let raf3 = 0; const refresh3D = () => { if (!threeOn || !three) return; cancelAnimationFrame(raf3); raf3 = requestAnimationFrame(() => three.update(api.model, { style: style(), cut: $q(w, '#dw29-cut').checked ? 48 : 0, roof: $q(w, '#dw29-roof').checked, ceilings: $q(w, '#dw29-ceil').checked })); };
    $$(w, '[data-view29]').forEach(b => b.onclick = () => show3D(true));
    $$(w, '[data-view]').forEach(b => b.addEventListener('click', () => { if (threeOn) show3D(false); }));
    $$(w, '[data-cam3]').forEach(b => b.onclick = () => three && three.view(b.dataset.cam3));
    $q(w, '#dw29-roof').onchange = () => { if ($q(w, '#dw29-roof').checked) $q(w, '#dw29-cut').checked = false; refresh3D(); }; $q(w, '#dw29-cut').onchange = () => { if ($q(w, '#dw29-cut').checked) $q(w, '#dw29-roof').checked = false; refresh3D(); }; $q(w, '#dw29-ceil').onchange = refresh3D;
    /* ---------- exports */
    const expPop = $q(w, '#dw29-exppop');
    $q(w, '#dw29-exp').onclick = ev => { ev.stopPropagation(); expPop.hidden = !expPop.hidden; $q(w, '#dw29-exp').setAttribute('aria-expanded', String(!expPop.hidden)); };
    document.addEventListener('click', ev => { if (!expPop.hidden && !expPop.contains(ev.target)) expPop.hidden = true; });
    async function doExport(k) {
      const base = api.fileBase() + (k.startsWith('3d') || k === 'glb' ? '-3D' : '-' + style());
      try {
        if (k === 'png') { const cv = await svgToPng($q(api.host, 'svg'), 2400); download(base + '.png', await canvasBlob(cv)); }
        else if (k === 'svg') { const s = $q(api.host, 'svg').cloneNode(true); $$(s, '.du-item-hit').forEach(n => n.remove()); s.setAttribute('style', 'background:' + ($q(api.host, 'svg').style.background || '#fff')); download(base + '.svg', new XMLSerializer().serializeToString(s), 'image/svg+xml'); }
        else if (k === '3dpng' || k === 'glb') { if (!threeOn) { show3D(true); await sleep(400); } if (!three) throw new Error('3D is not ready.'); if (k === 'glb') download(base + '.glb', await three.glb()); else { const u = three.png(2000, 1300); download(base + '.png', await (await fetch(u)).blob()); } }
        else if (k === 'json') download(base + '.drawup.json', JSON.stringify(api.model, null, 1), 'application/json');
        expPop.hidden = true;
      } catch (x) { toast(c, 'Export failed — ' + (x.message || x), true); }
    }
    $$(w, '[data-exp]').forEach(b => b.onclick = () => doExport(b.dataset.exp));
    /* ---------- library */
    const libEl = $q(w, '#dw29-lib');
    async function loadCustoms() { try { const { data } = await sb().from('draw_components').select('id,name,category,w,d,h,shape,color,tags').eq('owner_id', c.user.id).order('created_at', { ascending: false }).limit(200); customs = data || []; } catch (_e) { customs = []; } }
    const symSVG = (key, cw, cd) => { const it = { comp: key, w: cw, d: cd, h: 30, rot: 0, at: { x: 0, y: 0 } }; let s; try { s = L.symbol(it); } catch (_e) { s = { polys: [], lines: [] }; } const pad = Math.max(cw, cd) * 0.08; const P = pts => pts.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
      return `<svg viewBox="${-cw / 2 - pad} ${-cd / 2 - pad} ${cw + 2 * pad} ${cd + 2 * pad}" aria-hidden="true">${(s.polys || []).map(p => `<polygon points="${P(p)}"/>`).join('')}${(s.lines || []).map(l => `<polyline points="${P(l)}"/>`).join('')}${(s.circles || []).map(o => `<circle cx="${o.c ? o.c.x : o.x}" cy="${o.c ? o.c.y : o.y}" r="${o.r}"/>`).join('')}</svg>`; };
    function renderLib() {
      const list = libCat === 'custom' ? [] : L.search(libQ).filter(x => !libCat || x.cat === libCat);
      const mine = customs.filter(x => (!libCat || libCat === 'custom') && (!libQ || (x.name + ' ' + x.tags).toLowerCase().includes(libQ.toLowerCase())));
      libEl.innerHTML = `<div class="dw29-libhead"><b>Library</b><button type="button" class="dd22-close" id="dw29-libx" aria-label="Close library">×</button></div>
        <input type="search" id="dw29-libq" placeholder="Search: chair, oval counter, queue…" value="${esc(libQ)}" aria-label="Search components">
        <div class="dw29-cats">${[['', 'All']].concat(L.CATS).map(([k, l]) => `<button type="button" data-cat="${k}" class="${libCat === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
        <p class="du-muted dw21-small">Drag onto the plan, or click then click the plan. Sizes are typical; change them after placing.</p>
        <div class="dw29-grid">${mine.map(x => `<button type="button" class="dw29-comp mine" draggable="true" data-comp="custom:${x.id}" title="${esc(x.name)}"><svg viewBox="-1 -1 2 2" aria-hidden="true"><rect x="-.8" y="-.8" width="1.6" height="1.6" rx=".1"/><path d="M-.8-.8L.8.8M.8-.8L-.8.8"/></svg><span>${esc(x.name)}</span><small>${esc(ftin(x.w))} × ${esc(ftin(x.d))}</small></button>`).join('')}${list.map(x => `<button type="button" class="dw29-comp" draggable="true" data-comp="${x.key}" title="${esc(x.name)}">${symSVG(x.key, x.w, x.d)}<span>${esc(x.name)}</span><small>${esc(ftin(x.w))} × ${esc(ftin(x.d))}</small></button>`).join('')}${!list.length && !mine.length ? '<p class="du-muted">Nothing matches. Try another word, or add your own below.</p>' : ''}</div>
        <details class="dw29-addown"${libCat === 'custom' ? ' open' : ''}><summary>Add your own component</summary>
          <div class="du-field"><label for="dw29-cn">Name</label><input id="dw29-cn" maxlength="60" placeholder="Pastry display, 8 ft"></div>
          <div class="du-two"><div class="du-field"><label for="dw29-cw">Width</label><input id="dw29-cw" value="4'-0&quot;"></div><div class="du-field"><label for="dw29-cd">Depth</label><input id="dw29-cd" value="2'-0&quot;"></div></div>
          <div class="du-two"><div class="du-field"><label for="dw29-ch3">Height</label><input id="dw29-ch3" value="3'-0&quot;"></div><div class="du-field"><label for="dw29-cc">Category</label><select id="dw29-cc">${L.CATS.map(([k, l]) => `<option value="${k}"${k === 'custom' ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>
          <button type="button" class="du-btn primary" id="dw29-csave">Save to my library</button><p class="du-muted dw21-small">Your components are private to you. They draw as a labelled box in plan and 3D.</p></details>`;
      $q(libEl, '#dw29-libx').onclick = () => toggleLib(false);
      const q = $q(libEl, '#dw29-libq'); q.oninput = () => { libQ = q.value; const pos = q.selectionStart; renderLib(); const q2 = $q(libEl, '#dw29-libq'); q2.focus(); try { q2.setSelectionRange(pos, pos); } catch (_e) { /* */ } };
      $$(libEl, '[data-cat]').forEach(b => b.onclick = async () => { libCat = b.dataset.cat; if (libCat === 'custom') await loadCustoms(); renderLib(); });
      $$(libEl, '[data-comp]').forEach(b => {
        b.onclick = () => setTool({ k: 'place', comp: b.dataset.comp });
        b.ondragstart = ev => { ev.dataTransfer.setData('text/plain', 'dw29:' + b.dataset.comp); ev.dataTransfer.effectAllowed = 'copy'; };
      });
      $q(libEl, '#dw29-csave').onclick = async () => {
        const name = $q(libEl, '#dw29-cn').value.trim(), cw = parseLen($q(libEl, '#dw29-cw').value), cd = parseLen($q(libEl, '#dw29-cd').value), ch = parseLen($q(libEl, '#dw29-ch3').value);
        if (!name || !(cw > 0 && cd > 0 && ch >= 0)) { toast(c, 'Give it a name and a width, depth and height, like 4\'-0".', true); return; }
        const { error } = await sb().from('draw_components').insert({ owner_id: c.user.id, name, w: cw, d: cd, h: ch || 30, category: $q(libEl, '#dw29-cc').value });
        if (error) { toast(c, 'Not saved — ' + (/relation|schema/i.test(error.message) ? 'run SQL v29-01 in Supabase first.' : error.message), true); return; }
        await loadCustoms(); libCat = 'custom'; renderLib(); toast(c, 'Saved to your library.');
      };
    }
    function toggleLib(on) { libOpen = on == null ? !libOpen : on; libEl.hidden = !libOpen; $q(w, '#dw29-libbtn').setAttribute('aria-expanded', String(libOpen)); if (libOpen) { renderLib(); loadCustoms().then(() => { if (libOpen && customs.length) renderLib(); }); } }
    $q(w, '#dw29-libbtn').onclick = () => toggleLib();
    function makeComp(key, at) {
      if (/^custom:/.test(key)) { const x = customs.find(y => 'custom:' + y.id === key) || {}; return { kind: 'component', comp: key, at, rot: 0, w: +x.w || 24, d: +x.d || 24, h: +x.h || 30, z: 0, label: x.name || 'Component', mat: 'custom' }; }
      return L.make(key, at);
    }
    function placeComp(key, p) {
      const at = { x: C.snap(p.x, 1), y: C.snap(p.y, 1) }; let id = null;
      change(() => { const it = C.addItem(api.model, 'component', makeComp(key, at)); id = it.id; api.sel = { type: 'item', id }; });
      return id;
    }
    canvasEl.addEventListener('dragover', ev => { if ([...(ev.dataTransfer.types || [])].includes('text/plain')) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; } });
    canvasEl.addEventListener('drop', ev => { const d = ev.dataTransfer.getData('text/plain') || ''; if (!d.startsWith('dw29:')) return; ev.preventDefault(); placeComp(d.slice(5), api.toModel(ev)); canvasEl.focus(); });
    /* ---------- tools */
    function setTool(t) {
      tool = t; hoverPt = null;
      if (t && api.tool !== 'select') $q(w, '[data-tool="select"]')?.click();
      $q(w, '#dw29-curve').classList.toggle('on', !!(t && t.k === 'curve')); $q(w, '#dw29-curve').setAttribute('aria-pressed', String(!!(t && t.k === 'curve')));
      $$(libEl, '[data-comp]').forEach(b => b.classList.toggle('on', !!(t && t.k === 'place' && t.comp === b.dataset.comp)));
      const hint = $q(w, '#dw-hint');
      if (hint) hint.textContent = !t ? 'Click to select. Drag to move. Arrow keys nudge 1" (Shift: 1\'-0"), R rotates, Delete removes.' : t.k === 'curve' ? (t.pts && t.pts.length === 1 ? 'Click the end of the curved wall.' : t.pts && t.pts.length === 2 ? 'Click a point the curve passes through. Esc cancels.' : 'Curved wall: click the start point.') : t.k === 'place' ? 'Click the plan to place it. Shift-click to place more. Esc stops.' : t.k === 'pick' ? t.hint : '';
      canvasEl.style.cursor = t ? 'crosshair' : '';
      api.render();
    }
    $q(w, '#dw29-curve').onclick = () => setTool(tool && tool.k === 'curve' ? null : { k: 'curve', pts: [] });
    canvasEl.addEventListener('pointermove', ev => { if (!tool) return; hoverPt = api.snapPoint(api.toModel(ev), tool.pts && tool.pts.length ? tool.pts[tool.pts.length - 1] : null, { free: true }); if (tool.k === 'curve' && tool.pts && tool.pts.length) api.render(); });
    function nearestWall(p) { let best = null; api.model.walls.forEach(wl => { const dx = wl.b.x - wl.a.x, dy = wl.b.y - wl.a.y, Ln = Math.hypot(dx, dy), t = ((p.x - wl.a.x) * dx + (p.y - wl.a.y) * dy) / (Ln * Ln); if (t < 0 || t > 1) return; const d = Math.hypot(p.x - wl.a.x - dx * t, p.y - wl.a.y - dy * t); if (d < wl.thickness / 2 + 0.25 * api.scale && (!best || d < best.d)) best = { d, wl }; }); return best && best.wl; }
    function click(p, ev, t) {
      if (preview) return true;
      if (tool && tool.k === 'place') { placeComp(tool.comp, p); if (!ev.shiftKey) setTool(null); return true; }
      if (tool && tool.k === 'curve') {
        const q = api.snapPoint(p, null, { free: true }); tool.pts.push(q);
        if (tool.pts.length === 3) { const [a, b, mid] = tool.pts; const ext = !!$q(w, '[data-tool="wall"].on'); change(() => { const cv = Gm.addCurvedWall(api.model, a, b, mid, { wtype: 'ms358', type: ext ? 'exterior' : 'interior' }); api.sel = { type: 'wall', id: cv.id + '_s0' }; }); setTool(null); }
        else setTool(tool); return true;
      }
      if (tool && tool.k === 'pick') { const wl = nearestWall(p); if (!wl) { toast(c, 'Click a wall.', true); return true; } const fn = tool.fn; setTool(null); change(() => fn(wl)); return true; }
      return e.click ? e.click(p, ev, t) : false;
    }
    function keydown(ev, t) {
      if (preview && ev.key === 'Escape') { cancelPreview(); return true; }
      if (tool && ev.key === 'Escape') { setTool(null); return true; }
      return e.keydown ? e.keydown(ev, t) : false;
    }
    /* ---------- underlay */
    async function ensureUnder() { const s = wsOf().source; if (!s || !s.path || underUrl) return; underUrl = await signedUrl(s.path); if (underUrl) api.render(); }
    const ub = $q(w, '#dw29-under'); if (ub) ub.onclick = () => { underlay = !underlay; store.set('dw29-under', underlay); ub.setAttribute('aria-pressed', String(underlay)); ub.classList.toggle('on', underlay); if (underlay) ensureUnder(); api.render(); };
    if (ub) { ub.classList.toggle('on', underlay); if (underlay) ensureUnder(); }
    /* ---------- render hook */
    function afterRender(svg, R) {
      e.afterRender && e.afterRender(svg, R);
      Gm.ws(api.model);
      const s = wsOf().source;
      if (underlay && underUrl && s && s.image && wsOf().scale && wsOf().scale.inches_per_px > 0 && s.frame !== 'plan_in') {
        const k = wsOf().scale.inches_per_px, off = wsOf().scale.offset || { x: 0, y: 0 };
        const im = el('image', { href: underUrl, x: off.x, y: off.y, width: s.image.w * k, height: s.image.h * k, opacity: '0.28', preserveAspectRatio: 'none', 'pointer-events': 'none', class: 'dw29-under' });
        svg.insertBefore(im, svg.firstChild);
      }
      applyStyle(svg, api.model, style(), api.scale);
      if (tool && tool.k === 'curve' && tool.pts.length && hoverPt) {
        const pts = tool.pts.length === 1 ? [tool.pts[0], hoverPt] : Gm.arcPts(tool.pts[0], hoverPt, tool.pts[1], 6);
        svg.appendChild(el('polyline', { points: (pts || []).map(p => p.x + ',' + p.y).join(' '), fill: 'none', stroke: '#1b8cff', 'stroke-width': String(0.02 * api.scale), 'stroke-dasharray': `${0.06 * api.scale} ${0.04 * api.scale}` }));
      }
      if (preview) svg.classList.add('dw29-previewsvg');
      $q(w, '#dw29-asn').textContent = nAs();
      refresh3D();
      autoVersion();
    }
    /* ---------- versions */
    let verBusy = false;
    async function autoVersion() {
      if (preview || verBusy) return; const h = Gm.geomHash(api.model); if (h === lastVer.h || Date.now() - lastVer.t < 4 * 60 * 1000) return;
      verBusy = true; try { await saveVersion(c, { id: api.row.id, revision: api.revision }, JSON.parse(JSON.stringify(api.model)), 'auto', 'Autosave'); lastVer = { t: Date.now(), h }; } catch (_e) { lastVer = { t: Date.now(), h }; } finally { verBusy = false; }
    }
    $q(w, '#dw29-hist').onclick = async () => {
      const M = modal('dw29-histdlg', `<span class="du-kicker">DRAW · HISTORY</span><h2>Versions of ${esc(api.row.name)}</h2><p class="du-muted">DrawUp saves every change as you work, and keeps a version here every few minutes, on import, and before and after each change you confirm. Restoring keeps your current drawing as a version too, so nothing is lost.</p>
        <div class="dw29-vsave"><input id="dw29-vlabel" maxlength="100" placeholder="Name this version, e.g. Option B"><button type="button" class="du-btn primary" id="dw29-vnow">Save version</button></div><ol class="dw29-vlist" id="dw29-vlist"><li class="du-muted">Loading…</li></ol>`);
      const load = async () => {
        const { data, error } = await sb().from('drawing_versions').select('id,label,reason,revision,created_at,geom_hash').eq('drawing_id', api.row.id).order('created_at', { ascending: false }).limit(60);
        const ol = $q(M.el, '#dw29-vlist');
        if (error) { ol.innerHTML = `<li class="du-draw-warn">${/relation|schema/i.test(error.message) ? 'History needs SQL v29-01. Run it in Supabase, then reopen.' : esc(error.message)}</li>`; return; }
        ol.innerHTML = (data || []).map(v => `<li><b>${esc(v.label)}</b> <span class="du-muted">${esc(new Date(v.created_at).toLocaleString())} · rev ${v.revision}${v.geom_hash === Gm.geomHash(api.model) ? ' · same as now' : ''}</span><button type="button" class="dw21-btn" data-vr="${v.id}">Restore</button></li>`).join('') || '<li class="du-muted">No versions yet.</li>';
        $$(ol, '[data-vr]').forEach(b => b.onclick = async () => {
          const { data: v, error: e2 } = await sb().from('drawing_versions').select('model,label').eq('id', b.dataset.vr).single(); if (e2) { toast(c, e2.message, true); return; }
          if (!confirm(`Restore "${v.label}"? Your drawing as it is now is saved as a version first.`)) return;
          await saveVersion(c, { id: api.row.id, revision: api.revision }, api.model, 'restore', 'Before restoring ' + v.label).catch(() => {});
          const before = JSON.stringify(api.model); api.model = C.normalizeModel(v.model); Gm.ws(api.model); api.pushUndo(before); api.sel = null; api.render(); save(); M.close(); toast(c, 'Restored. Undo brings the newer drawing back.');
        });
      };
      $q(M.el, '#dw29-vnow').onclick = async () => { try { await saveVersion(c, { id: api.row.id, revision: api.revision }, api.model, 'manual', $q(M.el, '#dw29-vlabel').value.trim() || 'Saved version'); $q(M.el, '#dw29-vlabel').value = ''; load(); } catch (x) { toast(c, /relation|schema/i.test(x.message) ? 'History needs SQL v29-01.' : x.message, true); } };
      load();
    };
    /* ---------- finishes, brand, concepts */
    $q(w, '#dw29-fin').onclick = () => {
      const F = V3() ? V3().FINISHES : { floor: {}, wall: {}, accent: {} }, wsx = wsOf(), selRoom = api.sel && api.sel.type === 'room' ? api.model.rooms.find(r => r.id === api.sel.id) : null;
      const cur = Object.assign({}, (wsx.finishes || {}).all || {}, selRoom ? (wsx.finishes || {})[selRoom.id] || {} : {});
      const sel = (k, list) => `<select id="dw29-f${k}"><option value="">Default</option>${Object.keys(list).map(n => `<option${cur[k] === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
      const M = modal('dw29-findlg', `<span class="du-kicker">DRAW · FINISHES AND BRAND</span><h2>Finishes, palette and concepts</h2>
        <p class="du-muted">Finishes colour the Presentation and Realistic styles and the 3D view. They never move or resize anything.</p>
        <h3>Concepts</h3><div class="dw29-concepts">${CONCEPTS.map(k => `<button type="button" class="dw29-concept" data-concept="${k.id}"><i style="background:${V3() ? V3().finishColor('floor', k.floor, '#ccc') : '#ccc'}"></i><i style="background:${V3() ? V3().finishColor('wall', k.wall, '#eee') : '#eee'}"></i><i style="background:${V3() ? V3().finishColor('accent', k.accent, '#999') : '#999'}"></i><b>${esc(k.name)}</b></button>`).join('')}</div>
        <h3>${selRoom ? 'This room: ' + esc(selRoom.name) : 'Whole plan'}</h3>
        <div class="du-two"><div class="du-field"><label for="dw29-ffloor">Floor</label>${sel('floor', F.floor)}</div><div class="du-field"><label for="dw29-fwall">Walls</label>${sel('wall', F.wall)}</div></div>
        <div class="du-field"><label for="dw29-faccent">Accent (metals, trims)</label>${sel('accent', F.accent)}</div>
        <h3>Brand palette</h3><p class="du-muted dw21-small">Your own colours for signs and branded pieces. Use colours you have the right to use.</p>
        <div class="du-two"><div class="du-field"><label for="dw29-bp">Primary</label><input type="color" id="dw29-bp" value="${esc(wsx.brand.primary || '#c8102e')}"></div><div class="du-field"><label for="dw29-bs">Secondary</label><input type="color" id="dw29-bs" value="${esc(wsx.brand.secondary || '#1d6b3b')}"></div></div>
        <div class="dw21-btnrow"><button type="button" class="du-btn primary" id="dw29-fapply">Apply</button><button type="button" class="du-btn ghost" id="dw29-fclear">Clear finishes</button></div>`);
      const commitFin = fn => { const h0 = Gm.geomHash(api.model); change(fn); if (Gm.geomHash(api.model) !== h0) console.error('DrawUp: finishes altered geometry'); if (style() === 'cd') { wsOf().style = 'presentation'; syncStyleBtns(); api.render(); save(); } };
      $$(M.el, '[data-concept]').forEach(b => b.onclick = () => { const k = CONCEPTS.find(x => x.id === b.dataset.concept); commitFin(() => { const x = wsOf(); x.finishes.all = { floor: k.floor, wall: k.wall, accent: k.accent }; x.concepts = (x.concepts || []).filter(n => n !== k.id).concat([k.id]).slice(-6); }); M.close(); toast(c, k.name + ' applied. Switch styles to compare.'); });
      $q(M.el, '#dw29-fapply').onclick = () => { commitFin(() => { const x = wsOf(), key = selRoom ? selRoom.id : 'all', v = {}; ['floor', 'wall', 'accent'].forEach(k => { const s = $q(M.el, '#dw29-f' + k).value; if (s) v[k] = s; }); x.finishes[key] = v; x.brand = Object.assign({}, x.brand, { primary: $q(M.el, '#dw29-bp').value, secondary: $q(M.el, '#dw29-bs').value }); }); M.close(); };
      $q(M.el, '#dw29-fclear').onclick = () => { change(() => { wsOf().finishes = {}; }); M.close(); };
    };
    /* ---------- assumptions */
    $q(w, '#dw29-as').onclick = () => {
      const paint = M => {
        const x = wsOf(), selW = api.sel && api.sel.type === 'wall' ? C.wallById(api.model, api.sel.id) : null;
        M.body.innerHTML = `<span class="du-kicker">DRAW · ASSUMPTIONS</span><h2>What DrawUp assumed</h2><p class="du-muted">Everything DrawUp guessed is listed here until you confirm or change it. Nothing in this drawing is measured or construction-ready until a professional checks it.</p>
          <h3>Scale</h3><p>${x.scale ? `<span class="dw29-chip ${x.scale.confirmed ? 'ok' : 'warn'}">${x.scale.confirmed ? 'Confirmed' : 'Assumed'}</span> Basis: ${esc(String(x.scale.basis || 'assumed').replace(/_/g, ' '))}.` : 'Drawn in DrawUp, so sizes are as drawn.'}</p>
          <div class="dw29-rescale">${selW ? `<p>Selected wall measures <b>${esc(ftin(C.wallFaceLength ? C.wallFaceLength(api.model, selW) : C.wallLength(selW)))}</b>. If it is really a different length, type it and the whole plan rescales (wall thicknesses, doors and furniture keep their sizes).</p><div class="du-two"><div class="du-field"><label for="dw29-real">Real length</label><input id="dw29-real" placeholder="14'-0&quot;"></div><div class="du-field"><label>&nbsp;</label><button type="button" class="du-btn primary" id="dw29-resc">Rescale plan</button></div></div>` : '<p class="du-muted">To correct the scale, close this, select a wall you know the length of, and open Assumptions again.</p>'}</div>
          <h3>Assumptions</h3><ol class="dw29-asl">${(x.assumptions || []).map(a => `<li><span class="dw29-chip ${a.status === 'confirmed' ? 'ok' : 'warn'}">${a.status === 'confirmed' ? 'Confirmed' : 'Assumed'}</span> ${esc(a.text)} ${a.status !== 'confirmed' ? `<button type="button" class="dw21-btn" data-conf="${a.id}">Confirm</button>` : ''}</li>`).join('') || '<li class="du-muted">None.</li>'}</ol>
          ${(x.unknowns || []).length ? `<h3>Not read from the picture</h3><ol class="dw29-asl">${x.unknowns.map(u => `<li><span class="dw29-chip ${u.status === 'resolved' ? 'ok' : 'warn'}">${u.status === 'resolved' ? 'Done' : 'Open'}</span> ${esc(u.text)} ${u.status !== 'resolved' ? `<button type="button" class="dw21-btn" data-res="${u.id}">Mark done</button>` : ''}</li>`).join('')}</ol>` : ''}`;
        $$(M.body, '[data-conf]').forEach(b => b.onclick = () => { change(() => { const a = wsOf().assumptions.find(y => y.id === b.dataset.conf); if (a) a.status = 'confirmed'; }); paint(M); });
        $$(M.body, '[data-res]').forEach(b => b.onclick = () => { change(() => { const u = wsOf().unknowns.find(y => y.id === b.dataset.res); if (u) u.status = 'resolved'; }); paint(M); });
        const rs = $q(M.body, '#dw29-resc'); if (rs) rs.onclick = () => {
          const real = parseLen($q(M.body, '#dw29-real').value), now = C.wallFaceLength ? C.wallFaceLength(api.model, selW) : C.wallLength(selW);
          if (!(real > 0)) { toast(c, 'Type the real length, like 14\'-0".', true); return; }
          const f = real / now; if (f < 0.1 || f > 10) { toast(c, 'That is more than ten times off. Check the wall you selected.', true); return; }
          change(() => { Gm.rescale(api.model, f); const x2 = wsOf(); x2.scale = Object.assign({ inches_per_px: 1 }, x2.scale || {}, { confirmed: true, basis: 'known' }); (x2.assumptions || []).filter(a => a.kind === 'scale').forEach(a => { a.status = 'confirmed'; a.text = `Scale confirmed by you: a wall measured ${ftin(real)}.`; }); });
          paint(M); toast(c, 'Plan rescaled. Dimensions now follow your measurement.');
        };
      };
      paint(modal('dw29-asdlg', ''));
    };
    /* ---------- commands: preview, then confirm */
    function showBanner(html) { banner.hidden = !html; banner.innerHTML = html || ''; }
    function startPreview(ops, summary, note, source) {
      const before = JSON.stringify(api.model); let res;
      try { res = Gm.applyOps(JSON.parse(before), ops); } catch (x) { showBanner(`<p class="du-draw-warn">${esc(x.message || x)}</p><button type="button" class="dw21-btn" id="dw29-bx">OK</button>`); $q(banner, '#dw29-bx').onclick = () => showBanner(''); return false; }
      preview = { before, ops, summary, source };
      api.model = C.normalizeModel(res.model); Gm.ws(api.model); w.classList.add('dw29-previewing');
      const notes = (res.notes || []).concat(note ? [note] : []);
      showBanner(`<b>Preview</b> <span>${esc(summary || 'Change ready.')}</span>${notes.map(n => `<small>${esc(n)}</small>`).join('')}<span class="dw21-flex"></span><button type="button" class="du-btn primary" id="dw29-ok">Apply</button><button type="button" class="du-btn ghost" id="dw29-no">Cancel</button>`);
      $q(banner, '#dw29-ok').onclick = applyPreview; $q(banner, '#dw29-no').onclick = cancelPreview;
      api.render(); return true;
    }
    function applyPreview() {
      if (!preview) return; const p = preview; preview = null; w.classList.remove('dw29-previewing');
      saveVersion(c, { id: api.row.id, revision: api.revision }, JSON.parse(p.before), p.source === 'ai' ? 'ai_edit' : 'command', 'Before: ' + (p.summary || 'change').slice(0, 100)).catch(() => {});
      api.pushUndo(p.before); showBanner(''); api.render(); save(); toast(c, 'Applied. Undo takes it back.');
    }
    function cancelPreview() { if (!preview) return; api.model = C.normalizeModel(JSON.parse(preview.before)); Gm.ws(api.model); preview = null; w.classList.remove('dw29-previewing'); showBanner(''); api.render(); }
    function openView(v) {
      if (v.kind === '3d') { show3D(true); return; }
      if (v.kind === 'section' && v.through) {
        const m = api.model, s = v.through; let P = null, dir = null;
        if (s.type === 'wall') { const wl = C.wallById(m, s.id); P = { x: (wl.a.x + wl.b.x) / 2, y: (wl.a.y + wl.b.y) / 2 }; const d = Math.hypot(wl.b.x - wl.a.x, wl.b.y - wl.a.y); dir = { x: -(wl.b.y - wl.a.y) / d, y: (wl.b.x - wl.a.x) / d }; }
        else if (s.type === 'item') { const it = m.items.find(x => x.id === s.id); P = it.at; const a = (it.rot || 0) * Math.PI / 180; dir = { x: Math.cos(a), y: Math.sin(a) }; }
        else if (s.type === 'opening') { const g = C.openingGeometry(m, m.openings.find(x => x.id === s.id)); P = g.center; dir = g.normal; }
        if (P) {
          const b = Gm.envelope(m) || { x0: P.x - 240, y0: P.y - 240, x1: P.x + 240, y1: P.y + 240 }, R = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2 + 48;
          const names = (m.cameras || []).filter(k => k.kind === 'section').map(k => k.name), name = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('').find(ch => !names.includes(ch)) || 'S';
          const cam = { id: 'cam_' + Math.random().toString(36).slice(2, 9), kind: 'section', name, a: { x: Math.round(P.x - dir.y * -R), y: Math.round(P.y + dir.x * -R) }, b: { x: Math.round(P.x + dir.y * -R), y: Math.round(P.y - dir.x * -R) } };
          // the cut runs across the element: along dir's perpendicular is the line; looking along dir
          cam.a = { x: Math.round(P.x - dir.y * R), y: Math.round(P.y + dir.x * R) }; cam.b = { x: Math.round(P.x + dir.y * R), y: Math.round(P.y - dir.x * R) };
          if (s.type === 'item' || s.type === 'opening') { cam.a = { x: Math.round(P.x - dir.x * R), y: Math.round(P.y - dir.y * R) }; cam.b = { x: Math.round(P.x + dir.x * R), y: Math.round(P.y + dir.y * R) }; }
          change(() => { m.cameras = m.cameras || []; api.model.cameras.push(cam); api.sel = { type: 'camera', id: cam.id }; });
          if (threeOn) show3D(false);
          e.setMode && e.setMode('section'); toast(c, `Section ${name} cuts through it. Drag it on the key plan to move it.`); return;
        }
      }
      if (threeOn) show3D(false); e.setMode && e.setMode(v.kind === 'elevation' ? 'elevation' : v.kind === 'section' ? 'section' : 'plan');
    }
    async function aiEdit(text) {
      showBanner(`<span class="du-holo-load"></span> <span>DrawUp AI is working out the change… (${EDIT_COST} credits)</span>`);
      try {
        const st = await apiCall('/api/draw/workspace', { method: 'POST', body: JSON.stringify({ action: 'edit', text, drawing: Gm.describe(api.model, api.sel), selection: api.sel ? api.sel.type + ' ' + api.sel.id : '' }) });
        document.dispatchEvent(new Event('du-credits'));
        const t0 = Date.now(); let r;
        for (;;) { await sleep(1500); r = await apiCall('/api/draw/workspace', { method: 'POST', body: JSON.stringify({ poll: st.ticket }) }); if (r.status === 'done') break; if (Date.now() - t0 > 180000) throw new Error('DrawUp AI took too long. A failed change is refunded.'); }
        const ed = r.edit;
        if (ed.clarify) { clarify({ clarify: ed.clarify, choices: (ed.choices || []).map(x => [x, x]) }, true); return; }
        if (!ed.ops.length) { showBanner(`<span>${esc(ed.summary || 'DrawUp AI could not make that change with the tools it has.')}</span><button type="button" class="dw21-btn" id="dw29-bx">OK</button>`); $q(banner, '#dw29-bx').onclick = () => showBanner(''); return; }
        startPreview(ed.ops, ed.summary, 'Worked out by DrawUp AI. Check it before you apply.', 'ai');
      } catch (x) { showBanner(`<p class="du-draw-warn">${esc(x.message || x)}</p><button type="button" class="dw21-btn" id="dw29-bx">OK</button>`); $q(banner, '#dw29-bx').onclick = () => showBanner(''); }
    }
    function clarify(r, viaAI) {
      showBanner(`<b>${viaAI ? 'DrawUp AI asks' : 'Which one?'}</b> <span>${esc(r.clarify)}</span>${(r.choices || []).map(([, t], i) => `<button type="button" class="dw21-btn" data-ch="${i}">${esc(t)}</button>`).join('')}<button type="button" class="dw21-btn" id="dw29-bx">Cancel</button>`);
      $$(banner, '[data-ch]').forEach(b => b.onclick = () => { const t = r.choices[+b.dataset.ch][1]; $q(w, '#dw29-cmdin').value = t; runCommand(t, viaAI); });
      $q(banner, '#dw29-bx').onclick = () => showBanner('');
    }
    function runCommand(text, viaAI) {
      if (preview) cancelPreview();
      const r = Gm.parseCommand(text, { model: api.model, sel: api.sel });
      if (r.view) { showBanner(''); openView(r.view); return r; }
      if (r.clarify) { clarify(r); return r; }
      if (r.ops) { startPreview(r.ops, r.summary, r.note, 'command'); return r; }
      if (viaAI) { aiEdit(text); return r; }
      showBanner(`<span>DrawUp's built-in commands don't cover that. Ask DrawUp AI to work it out (${EDIT_COST} credits, refunded if it fails)? You'll see a preview first.</span><button type="button" class="du-btn primary" id="dw29-ai">Ask DrawUp AI</button><button type="button" class="dw21-btn" id="dw29-bx">Cancel</button>`);
      $q(banner, '#dw29-ai').onclick = () => aiEdit(text); $q(banner, '#dw29-bx').onclick = () => showBanner('');
      return r;
    }
    $q(w, '#dw29-cmd').onsubmit = ev => { ev.preventDefault(); const t = $q(w, '#dw29-cmdin').value.trim(); if (t) runCommand(t); };
    $q(w, '#dw29-cmdin').addEventListener('keydown', ev => ev.stopPropagation());
    /* ---------- Arch Coach and Teammate */
    $q(w, '#dw29-coach').onclick = async () => {
      const desc = Gm.describe(api.model, api.sel);
      const M = modal('dw29-coachdlg', `<span class="du-kicker">ARCH COACH · THIS DRAWING</span><h2>Ask Arch Coach about this drawing</h2>
        <div class="dd22-coachgrid"><figure class="dd22-coachimg"><img id="dw29-cimg" alt="The plan sent to Arch Coach"><figcaption>The plan in its current style, sent with the description below.</figcaption></figure>
        <div><div class="dd22-field"><label for="dw29-cq">Your question</label><textarea id="dw29-cq" rows="4">Review this layout. Check clear paths, door swings, accessible routes and how the rooms work together. Tell me what to change.</textarea></div>
        <details class="dd22-desc"><summary>Description sent with the image</summary><pre>${esc(desc)}</pre></details><button type="button" class="du-btn primary" id="dw29-cask">Ask Arch Coach</button>
        <p class="du-muted dw21-small">Arch Coach reads the drawing. To change geometry, type the change in the bar above the plan: you always see a preview first.</p></div></div><div class="dd22-coachstage" id="dw29-cstage" aria-live="polite"></div>`);
      let img = ''; try { img = (await svgToPng($q(api.host, 'svg'), 1400)).toDataURL('image/jpeg', 0.86); $q(M.el, '#dw29-cimg').src = img; } catch (_e) { /* */ }
      $q(M.el, '#dw29-cask').onclick = async () => {
        const V20 = window.DrawUpV20, stage = $q(M.el, '#dw29-cstage'), btn = $q(M.el, '#dw29-cask'); if (!V20 || !V20.coachAsk) { toast(c, 'Arch Coach is not loaded on this page.', true); return; }
        btn.disabled = true; stage.innerHTML = '';
        try {
          const d = await V20.coachAsk({ token: await token(), stage, label: 'Reading your drawing…', message: $q(M.el, '#dw29-cq').value.trim() + '\n\n' + desc + '\n\nThe attached image is this floor plan as drawn in DrawUp Draw.', history: [], image: img });
          stage.querySelectorAll('.du-holo-load').forEach(n => n.remove());
          stage.insertAdjacentHTML('beforeend', `<article class="dd22-answer"><span class="du-kicker">ARCH COACH</span><div class="dd22-atext"></div><div class="dw21-btnrow"><button type="button" class="du-btn ghost" id="dw29-toCmd">Make a change from this</button></div><p class="du-muted dw21-small">Guidance only. The licensed professional of record and the AHJ make final determinations.</p></article>`);
          stage.querySelector('.dd22-atext').textContent = d.answer || 'Arch Coach is still finishing; you will get a notification when the full answer is saved.';
          $q(stage, '#dw29-toCmd').onclick = () => { M.close(); const i = $q(w, '#dw29-cmdin'); i.focus(); i.placeholder = 'Type the change Arch Coach suggested'; };
        } catch (x) { stage.insertAdjacentHTML('beforeend', `<p class="du-draw-warn">${esc(x.message || x)}</p>`); } finally { btn.disabled = false; }
      };
    };
    /* ---------- photoreal render through Swap (the Let's Play pipeline) */
    $q(w, '#dw29-photo').onclick = async () => {
      if (!three) return; if (!confirm('Render a photoreal view of this 3D model? It runs through DrawUp Swap (photoreal) and uses 100 credits, refunded if it fails. The render is a picture; the drawing does not change.')) return;
      const M = modal('dw29-photodlg', '<span class="du-kicker">REALISTIC · LET’S PLAY</span><h2>Photoreal render</h2><p id="dw29-pst">Saving the 3D view…</p><div id="dw29-pimg"></div>');
      const say = t => { const p = $q(M.el, '#dw29-pst'); if (p) p.textContent = t; };
      try {
        const uid = c.user.id, blob = await (await fetch(three.png(1600, 1040))).blob(), src = `${uid}/swap/${uuid()}.png`;
        const up = await sb().storage.from(BUCKET).upload(src, blob, { contentType: 'image/png' }); if (up.error) throw up.error;
        const fin = (wsOf().finishes || {}).all || {};
        const prompt = (`Photorealistic architectural rendering of this 3D massing model of "${api.row.name}". Keep every wall, opening, counter and piece of furniture exactly where it is, at the same size, with the same camera and framing. `
          + `Materials: floor ${fin.floor || 'light neutral'}, walls ${fin.wall || 'warm white'}, accents ${fin.accent || 'brushed metal'}. Soft daylight, realistic textures, gentle shadows. No text, no logos, no brand names.`).slice(0, 1900);
        const tr = await sb().from('swap_threads').insert({ owner_id: uid, source_path: src, title: ('Draw 3D: ' + api.row.name).slice(0, 60) }).select('id').single(); if (tr.error) throw tr.error;
        await sb().from('swap_messages').insert({ thread_id: tr.data.id, owner_id: uid, role: 'user', body: 'Photoreal render of my Draw 3D model', image_path: src });
        const id = uuid(); const ins = await sb().from('swap_generations').insert({ id, owner_id: uid, source_path: src, swap_type: 'photoreal', prompt, thread_id: tr.data.id }).select('id').single(); if (ins.error) throw ins.error;
        await sb().from('swap_messages').insert({ thread_id: tr.data.id, owner_id: uid, role: 'assistant', body: '', generation_id: id });
        say('Rendering… this usually takes under two minutes.');
        let g = (await apiCall('/api/swap', { method: 'POST', body: JSON.stringify({ generation_id: id, options: { source_kind: 'model', people: null } }) })).generation; document.dispatchEvent(new Event('du-credits'));
        while (g && (g.status === 'generating' || g.status === 'queued')) { await sleep(1500); g = (await apiCall('/api/swap?id=' + id)).generation; }
        if (!g || g.status !== 'complete') throw new Error((g && g.error) || 'The render did not finish.');
        const url = await signedUrl(g.result_path); say('Done. It is also saved in your Swap threads.');
        $q(M.el, '#dw29-pimg').innerHTML = url ? `<img src="${esc(url)}" alt="Photoreal render" style="max-width:100%">` : '';
        change(() => { const x = wsOf(); x.renders = (x.renders || []).concat([{ path: g.result_path, generation_id: id, at: new Date().toISOString(), style: 'realistic' }]).slice(-12); }, true);
      } catch (x) { say('Not rendered — ' + (x.message || x)); }
    };
    /* ---------- inspector: components and wall tools */
    const MAT_OPTS = [['', 'As designed'], ['wood', 'Wood'], ['metal', 'Metal'], ['white', 'White'], ['dark', 'Dark'], ['stone', 'Stone'], ['fabric', 'Fabric'], ['glass', 'Glass'], ['brand', 'Brand colour'], ['accent', 'Accent']];
    function inspectorExtra(sel, R) {
      let h = e.inspectorExtra ? e.inspectorExtra(sel, R) : '';
      if (!sel) return h;
      if (sel.type === 'item') {
        const it = (api.model.items || []).find(x => x.id === sel.id); if (!it || it.kind !== 'component') return h;
        const d = L.get(it.comp), same = d ? L.CATALOG.filter(x => x.cat === d.cat && x.key !== d.key) : [];
        h = `<span class="du-kicker">COMPONENT</span><h3 class="dw29-ih">${esc(it.label || (d ? d.name : 'My component'))}</h3>
          <div class="du-field"><label for="dw29-il">Label</label><input id="dw29-il" value="${esc(it.label || '')}" maxlength="60" placeholder="${esc(d ? d.name : '')}"></div>
          <div class="du-two"><div class="du-field"><label for="dw29-iw">Width</label><input id="dw29-iw" value="${esc(ftin(it.w))}"></div><div class="du-field"><label for="dw29-id">Depth</label><input id="dw29-id" value="${esc(ftin(it.d))}"></div></div>
          <div class="du-two"><div class="du-field"><label for="dw29-ih">Height</label><input id="dw29-ih" value="${esc(ftin(it.h))}"></div><div class="du-field"><label for="dw29-iz">Above floor</label><input id="dw29-iz" value="${esc(ftin(it.z || 0))}"></div></div>
          <div class="du-two"><div class="du-field"><label for="dw29-ir">Rotation (degrees)</label><input id="dw29-ir" inputmode="decimal" value="${Math.round((it.rot || 0) * 10) / 10}"></div><div class="du-field"><label for="dw29-im">Material</label><select id="dw29-im">${MAT_OPTS.map(([k, l]) => `<option value="${k}"${(it.mat || '') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
          ${same.length ? `<div class="du-field"><label for="dw29-irep">Replace with</label><select id="dw29-irep"><option value="">Keep ${esc(d.name)}</option>${same.map(x => `<option value="${x.key}">${esc(x.name)}</option>`).join('')}</select></div>` : ''}
          <div class="dw21-btnrow"><button type="button" class="du-btn primary" id="dw29-iapply">Apply</button><button type="button" class="du-btn ghost" id="dw29-idup">Duplicate</button><button type="button" class="du-btn ghost" id="dw29-idel">Delete</button></div>` + h;
      }
      if (sel.type === 'wall') {
        const wl = C.wallById(api.model, sel.id); if (!wl) return h;
        const cv = wl.curve && (api.model.curves || []).find(x => x.id === wl.curve.id);
        h += `<div class="dw29-wtools"><span class="du-kicker">WALL TOOLS</span>
          ${cv ? `<div class="du-two"><div class="du-field"><label for="dw29-bulge">Curve depth</label><input id="dw29-bulge" value="${esc(ftin(Math.abs(Gm.curveBulge(cv))))}"></div><div class="du-field"><label>&nbsp;</label><button type="button" class="dw21-btn" id="dw29-bset">Set</button></div></div><button type="button" class="dw21-btn" id="dw29-straight">Make straight</button>`
          : `<div class="du-two"><div class="du-field"><label for="dw29-bulge">Curve it by</label><input id="dw29-bulge" placeholder="2'-0&quot;"></div><div class="du-field"><label>&nbsp;</label><button type="button" class="dw21-btn" id="dw29-bcurve">Curve</button></div></div>`}
          <div class="du-two"><div class="du-field"><label for="dw29-off">Offset copy</label><input id="dw29-off" placeholder="10'-0&quot;"></div><div class="du-field"><label>&nbsp;</label><button type="button" class="dw21-btn" id="dw29-offl">Left</button><button type="button" class="dw21-btn" id="dw29-offr">Right</button></div></div>
          <div class="du-two"><div class="du-field"><label for="dw29-rot">Rotate (degrees)</label><input id="dw29-rot" inputmode="decimal" placeholder="15"></div><div class="du-field"><label>&nbsp;</label><button type="button" class="dw21-btn" id="dw29-rotb">Rotate</button></div></div>
          <div class="dw21-btnrow"><button type="button" class="dw21-btn" id="dw29-trim" ${cv ? 'disabled' : ''}>Trim / extend to…</button><button type="button" class="dw21-btn" id="dw29-join" ${cv ? 'disabled' : ''}>Join corner with…</button><button type="button" class="dw21-btn" id="dw29-sect">Show in section</button></div></div>`;
      }
      if (sel.type === 'item' || sel.type === 'opening') h += `<div class="dw21-btnrow"><button type="button" class="dw21-btn" id="dw29-sect">Show in section</button></div>`;
      return h;
    }
    function bindInspector(insp) {
      e.bindInspector && e.bindInspector(insp);
      const on = (id, fn) => { const b = $q(insp, id); if (b) b.onclick = fn; };
      const sel = api.sel; if (!sel) return;
      on('#dw29-sect', () => openView({ kind: 'section', through: sel }));
      if (sel.type === 'item') {
        on('#dw29-iapply', () => change(() => {
          const it = api.model.items.find(x => x.id === sel.id), num = (id, k, min) => { const v = parseLen($q(insp, id).value); if (isFinite(v) && v >= min) it[k] = Math.round(v * 8) / 8; };
          num('#dw29-iw', 'w', 1); num('#dw29-id', 'd', 1); num('#dw29-ih', 'h', 0.5);
          const z = $q(insp, '#dw29-iz').value.trim(); it.z = z ? Math.max(0, parseLen(z) || 0) : 0;
          const r = parseFloat($q(insp, '#dw29-ir').value); if (isFinite(r)) it.rot = ((r % 360) + 360) % 360;
          it.label = $q(insp, '#dw29-il').value.trim().slice(0, 60) || undefined; const mt = $q(insp, '#dw29-im').value; if (mt) it.mat = mt; else delete it.mat;
          const rep = $q(insp, '#dw29-irep'); if (rep && rep.value) { const n = L.get(rep.value); it.comp = n.key; it.w = n.w; it.d = n.d; it.h = n.h; }
          Object.assign(it, C.normalizeModel({ items: [it] }).items[0]);
        }));
        on('#dw29-idup', () => change(() => { const it = api.model.items.find(x => x.id === sel.id), cp = JSON.parse(JSON.stringify(it)); delete cp.id; cp.at = { x: it.at.x + Math.max(12, it.w * 0.6), y: it.at.y + 12 }; const n = C.addItem(api.model, 'component', cp); api.sel = { type: 'item', id: n.id }; }));
        on('#dw29-idel', () => change(() => { C.removeItem(api.model, sel.id); api.sel = null; }));
      }
      if (sel.type === 'wall') {
        const len = id => parseLen(($q(insp, id) || {}).value);
        on('#dw29-bcurve', () => { const b = len('#dw29-bulge'); if (!(b > 0)) { toast(c, 'Type how far the middle bows out, like 2\'-0".', true); return; } const wl = C.wallById(api.model, sel.id); const r = Gm.parseCommand('curve this wall out ' + ftin(b), { model: api.model, sel }); if (r.ops) startPreview(r.ops, r.summary, r.note, 'command'); else change(() => { const x = Gm.curveWall(api.model, wl.id, b); api.sel = { type: 'wall', id: x.curve ? x.curve.id + '_s0' : sel.id }; }); });
        on('#dw29-bset', () => { const b = len('#dw29-bulge'), wl = C.wallById(api.model, sel.id), cv = (api.model.curves || []).find(x => x.id === wl.curve.id); if (!(b > 0)) return; const s = Math.sign(Gm.curveBulge(cv)) || 1; change(() => { Gm.setCurveBulge(api.model, cv.id, s * b); api.sel = { type: 'wall', id: cv.id + '_s0' }; }); });
        on('#dw29-straight', () => { const wl = C.wallById(api.model, sel.id); startPreview([{ op: 'straighten', id: wl.curve.id }], 'Make this curved wall straight again.', '', 'command'); });
        const off = s => { const d = len('#dw29-off'); if (!(d > 0)) { toast(c, 'Type an offset distance, like 10\'-0".', true); return; } change(() => { const n = Gm.offsetWall(api.model, sel.id, s * d); api.sel = { type: 'wall', id: n.id }; }); };
        on('#dw29-offl', () => off(-1)); on('#dw29-offr', () => off(1));
        on('#dw29-rotb', () => { const d = parseFloat($q(insp, '#dw29-rot').value); if (!isFinite(d) || !d) { toast(c, 'Type an angle in degrees, like 15.', true); return; } change(() => Gm.rotateTarget(api.model, sel, d)); });
        on('#dw29-trim', () => { const id = sel.id; setTool({ k: 'pick', hint: 'Click the wall to trim or extend to.', fn: wl => Gm.trimExtend(api.model, id, wl.id) }); });
        on('#dw29-join', () => { const id = sel.id; setTool({ k: 'pick', hint: 'Click the wall to join into a corner.', fn: wl => Gm.joinWalls(api.model, id, wl.id) }); });
      }
    }
    // Delete key on a curved segment removes the whole curve
    const ext = Object.assign({}, e, {
      afterRender, click, keydown, inspectorExtra, bindInspector,
      toolOptions(t, o) { if (t !== 'select' && tool) setTool(null); return e.toolOptions ? e.toolOptions(t, o) : undefined; },
      locked(s) { return e.locked ? e.locked(s) : false; },
      get snap() { return e.snap; }, get mode() { return threeOn ? '3d' : e.mode; }, setMode: m => { if (m === '3d') show3D(true); else { if (threeOn) show3D(false); e.setMode && e.setMode(m); } },
      ws: { runCommand, startPreview, applyPreview, cancelPreview, setTool, placeComp, show3D, applyStyle, get preview() { return preview; }, get three() { return three; }, doExport, toggleLib, openView },
    });
    window.DrawUpWorkspace.editor = { api, ext };
    return ext;
  }

  /* ============================================================ wiring */
  function wire(n) {
    const V = window.DrawUpDrawV21; if (!V || !window.DrawUpDrawCore || !window.DrawUpDraw22) { if ((n || 0) < 100) setTimeout(() => wire((n || 0) + 1), 100); return; }
    if (V.__v29) return; V.__v29 = true;
    const attach = V.attach, decorate = V.decorateStart;
    V.attach = api => { const e = attach(api) || {}; try { return extend(api, e); } catch (x) { console.warn('Draw V29', x); return e; } };
    V.decorateStart = (w, c) => {
      decorate && decorate(w, c);
      const grid = $q(w, '.du-draw-start'); if (!grid || $q(grid, '#dn29-pic')) return;
      grid.insertAdjacentHTML('afterbegin', `<article class="du-glass dw29-startcard"><span class="du-kicker">NEW · DRAW WORKSPACE</span><h2>Start from a picture</h2><p class="du-muted">Upload a floor plan, sketch, rendering or photo. DrawUp turns it into an editable plan with real walls, doors, windows, rooms and furniture, then shows it in 3D. You confirm the sizes it assumed.</p><div class="dw21-btnrow"><button class="du-btn primary" id="dn29-pic">Upload a picture</button></div><p class="du-muted dw21-small">Clean floor plans trace free. Sketches, colour plans and photos use DrawUp AI (${AI_COST} credits).</p></article>`);
      $q(w, '#dn29-pic').onclick = () => wizard(c, { project: ($q(w, '#dn-proj') || {}).value || null });
    };
  }
  window.DrawUpWorkspace = {
    wizard, merge, loadPicture, applyStyle, svgToPng, CONCEPTS, STYLE_LIST, editor: null, viewer3d: null,
    /** What Arch Coach, Teammate or any other part of DrawUp can read about the open drawing. */
    context() { const E = window.DrawUpWorkspace.editor; if (!E || !E.api || !document.body.contains(E.api.w)) return null; const m = E.api.model; return { drawing_id: E.api.row.id, name: E.api.row.name, style: (m.ws || {}).style || 'cd', selection: E.api.sel || null, text: G().describe(m, E.api.sel), geom_hash: G().geomHash(m) }; },
  };
  wire(0);
})();
