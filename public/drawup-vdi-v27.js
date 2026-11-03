/* DrawUp v27 Visual Detail Intelligence 1.0 — Find the Flaws → Understand the Fix → DrawUp Ready, in one workspace.
 * A member uploads, drops, pastes or picks a drawing (Details tab card, Check tab card, or a picture attached in Arch Coach /
 * the AI Team chat). /api/vdi runs the review as background AI jobs; this page polls and shows each stage as soon as it lands:
 *   1 Assessment (A) + what looks right (B) + findings table (C) + numbered markers on the original (D)
 *   2 Code + sources: adopted edition for the jurisdiction and each code item, verified only with an official URL
 *   3 Two references (E): DrawUp's own library first (DrawUp 2D / DrawUp 3D / Firm / AI details), then approved
 *     manufacturer libraries (metadata + link to the original, never a copy), each labelled with where it comes from
 *   4 The corrected detail (F): editable vector 2D + a 3D assembly from the same geometry, side by side with the untouched
 *     original, a before/after slider, deterministic geometry checks, assumed dimensions and what changed
 *   5 One follow-up question (G) that refines the same review
 *   6 DrawUp Ready: correction summary, remaining decisions, approve, exports (SVG, layered SVG, DXF, PDF, PNG), report
 * Nothing is applied to a drawing set until the member approves (the v25.1 approve flow). Arch Coach speaks as an educator,
 * Teammate as a production assistant (persona on the review).
 * window.DrawUpVDI = { open, openReview, startWith }
 */
(function () {
  'use strict';
  if (window.DrawUpVDI) return;
  const BUCKET = 'drawup-private', POLL_MS = 3500, COST = 20, REFINE_COST = 3, REDRAW_COST = 10, MAX_PICS = 3;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sb = () => window.DrawUpPortal?.ctx?.()?.client || window.drawupSupabaseClient;
  const me = () => window.DrawUpPortal?.ctx?.()?.user || null;
  const toast = (m, bad) => { const P = window.DrawUpPortal?.ctx?.(); if (P?.toast && !document.getElementById('vdi27')) P.toast(m, bad); else { let t = document.getElementById('vdi27-toast'); if (!t) { t = document.createElement('div'); t.id = 'vdi27-toast'; document.body.appendChild(t); } t.textContent = m; t.className = bad ? 'bad' : ''; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 2800); } };
  const uuid = () => (crypto.randomUUID && crypto.randomUUID()) || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); });
  const token = async () => (await sb()?.auth.getSession())?.data?.session?.access_token || '';
  async function api(body) {
    const res = await fetch('/api/vdi', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'DrawUp could not do that (' + res.status + ').');
    return d;
  }
  const download = (name, data, type) => { const blob = data instanceof Blob ? data : new Blob([data], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); };
  const safeName = s => String(s || 'DrawUp detail').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

  const STATUS = {
    generally_coordinated: ['Generally coordinated', 'ok'], needs_clarification: ['Needs clarification', 'warn'],
    needs_significant_revision: ['Needs significant revision', 'bad'], insufficient_documentation: ['Not enough shown to assess', 'gray'],
  };
  const KIND = { confirmed_defect: ['Confirmed defect', 'bad'], likely_coordination_issue: ['Likely coordination', 'warn'], missing_information: ['Missing information', 'info'], requires_professional_verification: ['Professional verification', 'pro'] };
  const BASIS = { mandatory_code: 'Mandatory code provisions', referenced_standard: 'Referenced standards', manufacturer_requirement: 'Manufacturer requirements', industry_best_practice: 'Industry best practice (not code)' };
  const CHECK = { verified: ['Verified code reference', 'ok'], partly_verified: ['Partly verified', 'warn'], not_verified: ['Not verified', 'gray'] };
  const PERSONA = { coach: { name: 'Arch Coach', role: 'Educator + technical reviewer', icon: '✦' }, teammate: { name: 'Teammate', role: 'Production assistant', icon: '◆' } };

  /* ------------------------------------------------------------------ pictures in */
  async function toJpeg(src, max = 2000) {
    const img = new Image(); img.crossOrigin = 'anonymous';
    const url = src instanceof Blob ? URL.createObjectURL(src) : src;
    try {
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('That picture could not be read.')); img.src = url; });
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.9);
    } finally { if (src instanceof Blob) URL.revokeObjectURL(url); }
  }
  const CAD = /\.(dwg|dxf|rvt|rfa|ifc|skp|3dm|dgn|pln)$/i;
  /** Files -> [{ name, dataUrl }]. PDFs use Draw it up's PDF reader (first pages), images are resized to 2000 px. */
  async function readFiles(files) {
    const list = [...files], out = [];
    const cad = list.filter(f => CAD.test(f.name));
    if (cad.length) toast(`${cad.map(f => f.name).join(', ')}: DrawUp can't open CAD or BIM files in the browser. Export the detail to PDF or PNG first (AutoCAD: Plot to PDF; Revit: Export → PDF or Images).`, true);
    for (const f of list.filter(x => !CAD.test(x.name))) {
      if (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name)) {
        if (!window.DrawUpDrawIt?.readPictures) { toast('PDF reading is still loading. Try again in a moment, or paste a screenshot.', true); continue; }
        (await window.DrawUpDrawIt.readPictures([f])).forEach(p => out.push({ name: p.name, dataUrl: p.dataUrl }));
      } else if (/^image\//.test(f.type)) out.push({ name: f.name || 'pasted drawing.png', dataUrl: await toJpeg(f) });
    }
    return out.slice(0, MAX_PICS);
  }
  async function uploadPics(pics) {
    const u = me(), folder = uuid(), out = [];
    for (let i = 0; i < pics.length; i++) {
      let path = '';
      try { const p = `${u.id}/vdi/${folder}/source-${i + 1}.jpg`; const up = await sb().storage.from(BUCKET).upload(p, await (await fetch(pics[i].dataUrl)).blob(), { contentType: 'image/jpeg', upsert: true }); if (!up.error) path = p; } catch (_e) { /* sent inline; the server stores it */ }
      out.push(path ? { path } : { image: pics[i].dataUrl });
    }
    return out;
  }
  const signed = new Map();
  async function signUrl(path) {
    if (!path) return '';
    if (signed.has(path)) return signed.get(path);
    const { data } = await sb().storage.from(BUCKET).createSignedUrl(path, 3600).then(x => x, () => ({}));
    const url = data?.signedUrl || ''; if (url) signed.set(path, url); return url;
  }

  /* ------------------------------------------------------------------ overlay shell */
  let V = null; // the open workspace
  function shell() {
    document.getElementById('vdi27')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div id="vdi27" class="vdi27" role="dialog" aria-modal="true" aria-label="Visual Detail Intelligence"><div class="vdi27-frame">
      <header class="vdi27-top"><div class="vdi27-brand"><span class="vdi27-kick">VISUAL DETAIL INTELLIGENCE</span><h1>Review a drawing</h1></div>
        <div class="vdi27-topr"><span class="vdi27-who" hidden></span><div class="vdi27-lvl" role="group" aria-label="Explanation level" hidden><button type="button" data-lvl="student">Student</button><button type="button" data-lvl="pro">Professional</button></div><button type="button" class="vdi27-x" aria-label="Close">×</button></div></header>
      <ol class="vdi27-steps" hidden>${['Assessment', 'Issues', 'Code + sources', 'References', '2D proposal', '3D assembly'].map((t, i) => `<li data-step="${i}"><b>${i + 1}</b>${t}</li>`).join('')}</ol>
      <main class="vdi27-main"></main></div></div>`);
    const el = document.getElementById('vdi27');
    const close = () => { if (V?.timer) clearTimeout(V.timer); if (V?.sheet?.dirty && !confirm('Close without saving your edits to the detail?')) return; el.remove(); document.removeEventListener('keydown', key); V = null; if (/[?&]vdi=/.test(location.hash)) history.replaceState(null, '', location.hash.replace(/([?&])vdi=[^&]*&?/, '$1').replace(/[?&]$/, '')); };
    const key = e => { if (e.key === 'Escape' && !e.target.closest?.('input,textarea,select')) close(); };
    el.querySelector('.vdi27-x').onclick = close; document.addEventListener('keydown', key);
    return el;
  }

  /* ------------------------------------------------------------------ start screen */
  async function open(opts = {}) {
    const u = me();
    if (!u || u.is_anonymous) { toast('Sign in to review a drawing.', true); return; }
    if (opts.id) return openReview(opts.id);
    const el = shell(), main = el.querySelector('.vdi27-main');
    const st = { pics: [], persona: opts.persona === 'teammate' ? 'teammate' : 'coach', busy: false };
    main.innerHTML = `<section class="vdi27-start">
      <div class="vdi27-sl"><p class="vdi27-lead">Upload, drop or paste one drawing. DrawUp finds the flaws, checks the code for your jurisdiction, finds verified references, and proposes an editable corrected detail with a 3D assembly. Nothing in your drawings changes until you approve it.</p>
        <label class="vdi27-drop" tabindex="0"><input type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,.pdf,.dwg,.dxf,.rvt"><b>Drop a drawing here, paste it (Ctrl/⌘+V) or click to choose</b><span>PNG, JPG, WebP or PDF · the first picture is the drawing, up to 2 more for context (the wall section, the sheet)</span></label>
        <div class="vdi27-pics"></div>
        <div class="vdi27-recent"></div></div>
      <form class="vdi27-sr">
        <fieldset class="vdi27-persona"><legend>Who reviews it</legend>${Object.entries(PERSONA).map(([k, p]) => `<label><input type="radio" name="persona" value="${k}"${k === st.persona ? ' checked' : ''}><span class="ic">${p.icon}</span><b>${p.name}</b><small>${p.role}</small></label>`).join('')}</fieldset>
        <fieldset><legend>Where is the project? <small>Code findings stay unverified without it</small></legend>
          <div class="vdi27-row"><label>City<input name="city" maxlength="80" placeholder="e.g. Raleigh"></label><label>State / region<input name="state" maxlength="80" placeholder="e.g. North Carolina"></label></div>
          <div class="vdi27-row"><label>Country<input name="country" maxlength="80" value="United States"></label><label>Permit context<input name="permit" maxlength="200" placeholder="New one-family dwelling, IRC"></label></div></fieldset>
        <label>Project<select name="project"><option value="">No project</option></select></label>
        <label>Anything DrawUp should know<textarea name="notes" rows="3" maxlength="2000" placeholder="Exterior wall on slab-on-grade, climate zone 4A, wood frame with fiber cement siding"></textarea></label>
        <button type="submit" class="vdi27-go" disabled>Find the flaws <small>${COST} credits</small></button>
        <p class="vdi27-msg" aria-live="polite"></p>
        <p class="vdi27-fine">AI review for design development. It never declares a drawing code compliant, and a licensed professional must verify it.</p></form></section>`;
    const $ = s => main.querySelector(s), form = $('form'), go = $('.vdi27-go'), msg = $('.vdi27-msg');
    const paint = () => { $('.vdi27-pics').innerHTML = st.pics.map((p, i) => `<figure><img src="${p.dataUrl}" alt=""><figcaption>${i ? 'Context ' + i : 'The drawing'} · ${esc(p.name)}</figcaption><button type="button" data-rm="${i}" aria-label="Remove">×</button></figure>`).join(''); main.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { st.pics.splice(+b.dataset.rm, 1); paint(); }); go.disabled = st.busy || !st.pics.length; };
    const add = async files => { try { msg.textContent = 'Reading…'; st.pics = [...st.pics, ...(await readFiles(files))].slice(0, MAX_PICS); msg.textContent = ''; } catch (e) { msg.textContent = e.message || String(e); } paint(); };
    if (opts.pictures?.length) { st.pics = opts.pictures.slice(0, MAX_PICS); }
    if (opts.files?.length) await add(opts.files);
    if (opts.notes) form.notes.value = opts.notes;
    const drop = $('.vdi27-drop'), input = drop.querySelector('input');
    input.onchange = () => { add(input.files); input.value = ''; };
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); add(e.dataTransfer.files); });
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    el.addEventListener('paste', e => { const files = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type)); if (files.length) { e.preventDefault(); add(files); } });
    form.querySelectorAll('[name=persona]').forEach(r => r.onchange = () => { st.persona = r.value; });
    // projects + place from the project
    const { data: projects } = await sb().from('project_threads').select('id,project_name,location').eq('owner_id', me().id).neq('status', 'archived').order('updated_at', { ascending: false }).limit(50).then(x => x, () => ({}));
    (projects || []).forEach(p => form.project.insertAdjacentHTML('beforeend', `<option value="${esc(p.id)}"${p.id === opts.projectId ? ' selected' : ''}>${esc(p.project_name)}</option>`));
    recent($('.vdi27-recent'));
    paint();
    form.onsubmit = async e => {
      e.preventDefault(); if (st.busy || !st.pics.length) return;
      st.busy = true; go.disabled = true; msg.textContent = 'Uploading the drawing…';
      try {
        const pictures = await uploadPics(st.pics);
        const r = await api({ start: { pictures, notes: form.notes.value.trim(), file_name: st.pics[0].name, persona: st.persona, project_id: form.project.value || undefined, jurisdiction: { city: form.city.value.trim(), state: form.state.value.trim(), country: form.country.value.trim(), permit: form.permit.value.trim() } } });
        localOriginal.set(r.id, st.pics[0].dataUrl);
        openReview(r.id);
      } catch (err) { msg.textContent = err.message || String(err); st.busy = false; paint(); }
    };
  }
  const localOriginal = new Map(); // the original picture as the member gave it, while the signed link loads

  async function recent(box) {
    const { data } = await sb().from('vdi_reviews').select('id,title,stage,created_at,review').eq('owner_id', me().id).order('created_at', { ascending: false }).limit(6).then(x => x, () => ({}));
    if (!data?.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<h3>Your recent reviews</h3><ul>${data.map(r => { const s = STATUS[r.review?.assessment?.status]; return `<li><button type="button" data-open="${esc(r.id)}"><b>${esc(r.title)}</b><small>${new Date(r.created_at).toLocaleDateString('en-US')} · ${s ? s[0] : esc(r.stage)}</small></button></li>`; }).join('')}</ul>`;
    box.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openReview(b.dataset.open));
  }

  /* ------------------------------------------------------------------ the review workspace */
  async function openReview(id) {
    const el = document.getElementById('vdi27') || shell();
    V = { id, el, row: null, lvl: null, sheet: null, holo: null, drawKey: '', refs: null, refsKey: '', busy: {} };
    el.querySelector('.vdi27-steps').hidden = false;
    const main = el.querySelector('.vdi27-main');
    main.innerHTML = `<div class="vdi27-review">
      <section class="vdi27-sec" data-sec="assess"><div class="vdi27-wait">Reading the drawing…</div></section>
      <section class="vdi27-sec" data-sec="visual"></section>
      <section class="vdi27-sec" data-sec="table"></section>
      <section class="vdi27-sec" data-sec="code"></section>
      <section class="vdi27-sec" data-sec="refs"></section>
      <section class="vdi27-sec" data-sec="compare"></section>
      <section class="vdi27-sec" data-sec="followup"></section>
      <section class="vdi27-sec" data-sec="ready"></section></div>`;
    if (!/[?&]vdi=/.test(location.hash) && location.hash.startsWith('#portal/')) history.replaceState(null, '', location.hash.split('?')[0] + '?vdi=' + id);
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { V.lvl = b.dataset.lvl; paintLvl(); renderAll(true); });
    await tick();
  }
  async function tick() {
    if (!V) return;
    const v = V;
    try { const row = await api({ poll: v.id }); if (V !== v) return; v.row = row; renderAll(); }
    catch (e) { if (V !== v) return; const s = v.el.querySelector('[data-sec="assess"]'); s.innerHTML = `<div class="vdi27-err">${esc(e.message || e)}</div>`; }
    const j = v.row?.jobs || {}, live = Object.values(j).some(x => x && (x.status === 'running' || x.status === 'starting'));
    if (V === v && (live || ['reviewing'].includes(v.row?.stage))) v.timer = setTimeout(tick, POLL_MS);
  }
  const jobState = k => V.row?.jobs?.[k]?.status || '';
  function paintLvl() { V.el.querySelectorAll('[data-lvl]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lvl === V.lvl))); }

  function renderAll(force) {
    const row = V.row, rv = row.review, el = V.el;
    const persona = PERSONA[row.persona] || PERSONA.coach;
    if (!V.lvl) { V.lvl = row.user_state?.lvl || (row.persona === 'teammate' ? 'pro' : 'student'); }
    el.querySelector('.vdi27-brand h1').textContent = rv?.title || row.title || 'Review a drawing';
    const who = el.querySelector('.vdi27-who'); who.hidden = false; who.innerHTML = `<span class="ic">${persona.icon}</span>${persona.name}<small>${persona.role}</small>`;
    el.querySelector('.vdi27-lvl').hidden = !rv; paintLvl();
    // stepper
    const steps = [!!rv, !!rv, row.research ? 'done' : jobState('research'), V.refs ? 'done' : rv ? 'running' : '', row.drawing ? 'done' : jobState('draw'), row.drawing ? 'done' : ''];
    el.querySelectorAll('[data-step]').forEach((li, i) => { const s = steps[i]; li.className = s === true || s === 'done' ? 'done' : s === 'running' || s === 'starting' ? 'run' : s === 'failed' ? 'fail' : ''; });
    if (row.stage === 'failed' || jobState('review') === 'failed') { sec('assess', `<div class="vdi27-err"><b>The review could not be finished.</b> ${esc(row.jobs?.review?.error || '')}. You were not charged. Close this and try again, or try a clearer picture.</div>`); return; }
    if (!rv) { sec('assess', `<div class="vdi27-wait"><i class="vdi27-spin"></i>${persona.name} is reading the drawing. The first findings usually arrive in under a minute. You can keep working; this review is saved.</div>`); return; }
    const key = JSON.stringify([rv, row.user_state?.markers, V.lvl]);
    if (force || V.rvKey !== key) { V.rvKey = key; renderAssess(); renderVisual(); renderTable(); renderFollow(); }
    const ck = JSON.stringify([row.research, row.jurisdiction, jobState('research'), rv.code_items]);
    if (force || V.codeKey !== ck) { V.codeKey = ck; renderCode(); }
    renderRefs();
    const dk = JSON.stringify([row.detail_id, row.drawing?.edited_at, jobState('draw'), !!row.drawing]);
    if (V.drawKey !== dk) { V.drawKey = dk; V.aiKey = ''; renderCompare(); } else renderAiImage();
    renderReady();
  }
  const sec = (name, html) => { const s = V.el.querySelector(`[data-sec="${name}"]`); if (s) s.innerHTML = html; return s; };
  const findingNo = f => V.row.review.findings.indexOf(f) + 1;
  const explainText = f => (V.lvl === 'pro' ? f.explain.professional || f.explain.student : f.explain.student || f.explain.professional);

  /* A + B */
  function renderAssess() {
    const rv = V.row.review, s = STATUS[rv.assessment.status] || STATUS.needs_clarification;
    const counts = rv.findings.reduce((m, f) => { m[f.kind] = (m[f.kind] || 0) + 1; return m; }, {});
    sec('assess', `<div class="vdi27-assess"><div><span class="vdi27-kick">A · INITIAL ASSESSMENT</span><span class="vdi27-pill ${s[1]}">${s[0]}</span>
        <h2>${esc(rv.assessment.headline || 'Review complete.')}</h2><p>${esc(rv.assessment.why)}</p>
        <p class="vdi27-meta">${esc(rv.assembly.type || rv.assembly.category)}${rv.assembly.materials.length ? ' · ' + esc(rv.assembly.materials.slice(0, 6).join(', ')) : ''}</p>
        <div class="vdi27-counts">${Object.entries(KIND).map(([k, [n, c]]) => counts[k] ? `<span class="vdi27-tag ${c}">${counts[k]} ${n.toLowerCase()}</span>` : '').join('')}</div>
        <p class="vdi27-fine">DrawUp never declares a drawing code compliant. ${rv.is_drawing ? '' : '<b>This picture may not be an architectural drawing.</b>'}</p></div>
      <div class="vdi27-right"><span class="vdi27-kick">B · WHAT LOOKS RIGHT</span>${rv.looks_right.length ? `<ul class="vdi27-ok">${rv.looks_right.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="vdi27-muted">Nothing could be confirmed as correctly shown yet.</p>'}</div></div>`);
  }

  /* D: the original with numbered markers */
  function markerOf(f) { const o = V.row.user_state?.markers?.[f.id]; return o || f.marker; }
  async function renderVisual() {
    const rv = V.row.review, s = sec('visual', `<div class="vdi27-head"><span class="vdi27-kick">D · VISUAL EXPLANATION</span><h3>Your drawing, marked up</h3><div class="vdi27-tools"><button type="button" data-adjust aria-pressed="false">Move markers</button></div></div>
      <div class="vdi27-vis"><div class="vdi27-orig"><img alt="Your original drawing (unchanged)"><div class="vdi27-marks"></div></div><aside class="vdi27-pop"><p class="vdi27-muted">Click a numbered marker to see what the component does, the problem, why it matters, a possible solution and the sources.</p></aside></div>`);
    const img = s.querySelector('img'), local = localOriginal.get(V.id);
    img.src = local || await signUrl(V.row.source_paths?.[0]);
    const marks = s.querySelector('.vdi27-marks');
    const list = rv.findings.filter(f => markerOf(f));
    marks.innerHTML = list.map(f => { const m = markerOf(f); return `<button type="button" class="vdi27-mk p-${f.priority}" data-f="${esc(f.id)}" style="left:${(m.x * 100).toFixed(2)}%;top:${(m.y * 100).toFixed(2)}%" aria-label="Finding ${findingNo(f)}: ${esc(f.item)}">${findingNo(f)}</button>`; }).join('');
    const unplaced = rv.findings.filter(f => !markerOf(f));
    if (unplaced.length) s.querySelector('.vdi27-orig').insertAdjacentHTML('afterend', `<p class="vdi27-muted vdi27-unplaced">Not tied to one spot: ${unplaced.map(f => `<button type="button" class="vdi27-link" data-f="${esc(f.id)}">${findingNo(f)} ${esc(f.item)}</button>`).join(' · ')}</p>`);
    s.querySelectorAll('[data-f]').forEach(b => b.onclick = e => { if (V.adjust) return; e.stopPropagation(); showFinding(b.dataset.f); });
    // move markers (saved to user_state, which the member may change)
    const adj = s.querySelector('[data-adjust]');
    adj.onclick = () => { V.adjust = !V.adjust; adj.setAttribute('aria-pressed', String(V.adjust)); marks.classList.toggle('adjust', V.adjust); adj.textContent = V.adjust ? 'Done moving' : 'Move markers'; };
    marks.querySelectorAll('.vdi27-mk').forEach(b => b.addEventListener('pointerdown', e => {
      if (!V.adjust) return; e.preventDefault(); const r = marks.getBoundingClientRect(); b.setPointerCapture(e.pointerId);
      const move = ev => { b.style.left = Math.max(0, Math.min(100, (ev.clientX - r.left) / r.width * 100)) + '%'; b.style.top = Math.max(0, Math.min(100, (ev.clientY - r.top) / r.height * 100)) + '%'; };
      const upH = async () => { b.removeEventListener('pointermove', move); b.removeEventListener('pointerup', upH); const us = { ...(V.row.user_state || {}) }; us.markers = { ...(us.markers || {}), [b.dataset.f]: { x: parseFloat(b.style.left) / 100, y: parseFloat(b.style.top) / 100 } }; V.row.user_state = us; V.rvKey = JSON.stringify([V.row.review, us.markers, V.lvl]); await saveState(us); };
      b.addEventListener('pointermove', move); b.addEventListener('pointerup', upH);
    }));
  }
  async function saveState(us) { const { error } = await sb().from('vdi_reviews').update({ user_state: us, updated_at: new Date().toISOString() }).eq('id', V.id).then(x => x, e => ({ error: e })); if (error) toast('Could not save: ' + (error.message || error), true); }
  function codeFor(f) {
    const items = V.row.review.code_items.filter(k => f.code_ids.includes(k.id)), checks = V.row.research?.code_checks || [];
    return items.map(k => ({ k, c: checks.find(c => c.id === k.id) }));
  }
  function showFinding(fid) {
    const f = V.row.review.findings.find(x => x.id === fid); if (!f) return;
    const pop = V.el.querySelector('.vdi27-pop'); if (!pop) return;
    V.el.querySelectorAll('.vdi27-mk, tr[data-f]').forEach(m => m.classList.toggle('on', m.dataset.f === fid));
    const k = KIND[f.kind] || KIND.missing_information, codes = codeFor(f);
    pop.innerHTML = `<span class="vdi27-num p-${f.priority}">${findingNo(f)}</span><h4>${esc(f.item)}</h4><p><span class="vdi27-tag ${k[1]}">${k[0]}</span> <span class="vdi27-tag pr-${f.priority}">${f.priority} priority</span> <span class="vdi27-tag">${esc(f.discipline)}</span></p>
      <dl><dt>What it does</dt><dd>${esc(f.explain.does || '—')}</dd><dt>The potential problem</dt><dd>${esc(f.explain.problem || f.finding)}</dd><dt>Why it matters</dt><dd>${esc(f.explain.why_it_matters || '—')}</dd><dt>What a solution might look like</dt><dd>${esc(f.explain.solution || f.recommendation)}</dd></dl>
      <div class="vdi27-explain"><b>${V.lvl === 'pro' ? 'For professionals' : 'In plain words'}</b><p>${esc(explainText(f))}</p></div>
      ${codes.length ? `<h5>Code + standards</h5><ul class="vdi27-mini">${codes.map(({ k, c }) => `<li>${codeLine(k, c)}</li>`).join('')}</ul>` : ''}
      ${f.manufacturer_note ? `<h5>Manufacturer installation</h5><p>${esc(f.manufacturer_note)} <em class="vdi27-muted">Confirm with the product's own installation instructions.</em></p>` : ''}
      ${f.component_id ? `<button type="button" class="vdi27-link" data-showcomp="${esc(f.component_id)}">Show this part in the 2D and 3D views →</button>` : ''}`;
    const sc = pop.querySelector('[data-showcomp]'); if (sc) sc.onclick = () => { selectComp(sc.dataset.showcomp); V.el.querySelector('[data-sec="compare"]').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  }

  /* C: the table */
  function renderTable() {
    const rv = V.row.review;
    sec('table', `<div class="vdi27-head"><span class="vdi27-kick">C · WHAT NEEDS ATTENTION</span><h3>${rv.findings.length} item${rv.findings.length === 1 ? '' : 's'}</h3></div>
      ${rv.findings.length ? `<div class="vdi27-tablewrap"><table class="vdi27-table"><thead><tr><th>#</th><th>Item</th><th>Finding</th><th>Recommendation</th><th>Priority</th></tr></thead><tbody>${rv.findings.map(f => { const k = KIND[f.kind] || KIND.missing_information; return `<tr data-f="${esc(f.id)}" tabindex="0"><td><span class="vdi27-num p-${f.priority}">${findingNo(f)}</span></td><td><b>${esc(f.item)}</b><br><span class="vdi27-tag ${k[1]}">${k[0]}</span></td><td>${esc(f.finding)}</td><td>${esc(f.recommendation)}</td><td><span class="vdi27-tag pr-${f.priority}">${f.priority[0].toUpperCase() + f.priority.slice(1)}</span></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="vdi27-muted">No issues were found in what is shown.</p>'}
      ${rv.unresolved.length ? `<details class="vdi27-open"><summary>Open design decisions (${rv.unresolved.length})</summary><ul>${rv.unresolved.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}`)
      .querySelectorAll('tr[data-f]').forEach(tr => { const go = () => { showFinding(tr.dataset.f); V.el.querySelector('[data-sec="visual"]').scrollIntoView({ behavior: 'smooth', block: 'start' }); }; tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter') go(); }; });
  }

  /* Code + sources */
  function codeLine(k, c) {
    const st = CHECK[c?.status] || CHECK.not_verified, ed = c?.edition || editionFor(k.code);
    return `<b>${esc(k.code)}${ed ? ' ' + esc(ed) : ''}${(c?.section || k.section) ? ' § ' + esc(c?.section || k.section) : ''}</b> <span class="vdi27-tag ${st[1]}">${st[0]}</span> ${esc(c?.requirement || k.summary)}${c?.source_url ? ` <a href="${esc(c.source_url)}" target="_blank" rel="noopener noreferrer">Official source ↗</a>` : ''}`;
  }
  function editionFor(code) {
    const a = V.row.research?.adoption?.codes || [], n = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const hit = a.find(x => x.verified && String(x.code).toUpperCase().replace(/[^A-Z0-9]/g, '').includes(n.slice(0, 4)));
    return hit ? hit.edition : '';
  }
  function renderCode() {
    const row = V.row, rv = row.review, r = row.research, j = row.jurisdiction || {}, place = [j.city, j.state, j.country].filter(Boolean).join(', '), rs = jobState('research');
    const placeForm = `<form class="vdi27-place"><label>City<input name="city" maxlength="80" value="${esc(j.city || '')}"></label><label>State / region<input name="state" maxlength="80" value="${esc(j.state || '')}"></label><label>Country<input name="country" maxlength="80" value="${esc(j.country || 'United States')}"></label><label class="w">Permit context<input name="permit" maxlength="200" value="${esc(j.permit || '')}" placeholder="New commercial building, IBC Type V-B"></label><button type="submit">${place ? 'Re-check' : 'Check the code'} <small>${REFINE_COST} credits</small></button></form>`;
    const ad = r?.adoption;
    const adoption = !place ? `<div class="vdi27-note warn"><b>Set where the project is to check the adopted code.</b> The newest code is not automatically the one that applies. Until then, every code item below is a model-code reference only and is marked not verified.</div>`
      : !row.web_search ? `<div class="vdi27-note">Web search is turned off on this site, so DrawUp can't check the adopted edition for ${esc(place)}. Code items stay unverified.</div>`
      : rs === 'running' || rs === 'starting' ? `<div class="vdi27-wait"><i class="vdi27-spin"></i>Checking which codes ${esc(place)} has adopted, on official sources…</div>`
      : ad ? `<div class="vdi27-adopt"><b>Adopted codes for ${esc(ad.jurisdiction || place)}</b> <span class="vdi27-tag ${ad.status === 'confirmed' ? 'ok' : ad.status === 'partly_confirmed' ? 'warn' : 'gray'}">${{ confirmed: 'Confirmed on official sources', partly_confirmed: 'Partly confirmed', not_found: 'Could not be confirmed', not_attempted: 'Not checked' }[ad.status]}</span>
          ${ad.codes.length ? `<ul>${ad.codes.map(c => `<li><b>${esc(c.code)}</b> ${esc(c.edition || 'edition not stated')}${c.amendments ? ' · ' + esc(c.amendments) : ''}${c.effective ? ' · effective ' + esc(c.effective) : ''} ${c.verified ? `<a href="${esc(c.source_url)}" target="_blank" rel="noopener noreferrer">source ↗</a>` : '<span class="vdi27-tag gray">no official source found</span>'}</li>`).join('')}</ul>` : ''}${ad.note ? `<p class="vdi27-muted">${esc(ad.note)}</p>` : ''}</div>`
      : rs === 'failed' ? `<div class="vdi27-note warn">The code check could not finish (${esc(row.jobs?.research?.error || 'error')}). Code items stay unverified.</div>` : '';
    const groups = {};
    rv.code_items.forEach(k => { (groups[k.basis] = groups[k.basis] || []).push(k); });
    const checks = r?.code_checks || [];
    const cards = Object.keys(BASIS).filter(b => groups[b]).map(b => `<div class="vdi27-cgroup"><h4>${BASIS[b]}</h4>${groups[b].map(k => {
      const c = checks.find(x => x.id === k.id), st = CHECK[c?.status] || CHECK.not_verified, ed = c?.edition || editionFor(k.code);
      return `<article class="vdi27-code"><header><b>${esc(k.code)}</b><span class="vdi27-tag ${st[1]}">${st[0]}</span></header>
        <dl><dt>Adopted edition</dt><dd>${ed ? esc(ed) : '<span class="vdi27-muted">Not established' + (place ? '' : ' (no jurisdiction)') + '</span>'}</dd>
        <dt>Section / table</dt><dd>${(c?.section || k.section) ? esc(c?.section || k.section) + (c?.status === 'verified' ? '' : ' <span class="vdi27-muted">(not verified)</span>') : '<span class="vdi27-muted">Not verified</span>'}</dd>
        <dt>Requirement</dt><dd>${esc(c?.requirement || k.summary)}</dd><dt>Applies when</dt><dd>${esc(c?.applicability || k.applicability || '—')}</dd>
        <dt>Source</dt><dd>${c?.source_url ? `<a href="${esc(c.source_url)}" target="_blank" rel="noopener noreferrer">${esc(new URL(c.source_url).hostname)} ↗</a>` : '<span class="vdi27-muted">No official source confirmed. Verify with the adopted code before relying on this.</span>'}</dd>
        <dt>Confidence</dt><dd>${c?.status === 'verified' ? 'Read on an official source by DrawUp' : c?.status === 'partly_verified' ? 'Section found; adopted edition or wording not fully confirmed' : 'AI model-code reference only'}${c?.note ? ' · ' + esc(c.note) : ''}</dd></dl>
        <p class="vdi27-for">For: ${rv.findings.filter(f => f.code_ids.includes(k.id)).map(f => `<button type="button" class="vdi27-link" data-f="${esc(f.id)}">${findingNo(f)} ${esc(f.item)}</button>`).join(', ') || '—'}</p></article>`;
    }).join('')}</div>`).join('');
    const s = sec('code', `<div class="vdi27-head"><span class="vdi27-kick">CODE CROSS-REFERENCE</span><h3>Code + sources${place ? ' · ' + esc(place) : ''}</h3></div>${adoption}<details class="vdi27-placebox"${place ? '' : ' open'}><summary>${place ? 'Change the jurisdiction' : 'Where is the project?'}</summary>${placeForm}</details>
      ${cards || '<p class="vdi27-muted">No code items were raised for this drawing.</p>'}
      <p class="vdi27-fine">Codes are linked to official sources (state and local sites, the ICC's free-to-read code view, the Access Board). DrawUp does not host or copy code text.</p>`);
    s.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { showFinding(b.dataset.f); V.el.querySelector('[data-sec="visual"]').scrollIntoView({ behavior: 'smooth' }); });
    s.querySelector('.vdi27-place').onsubmit = async e => {
      e.preventDefault(); const f = e.target, b = f.querySelector('button'); b.disabled = true;
      try { const r2 = await api({ place: V.id, city: f.city.value.trim(), state: f.state.value.trim(), country: f.country.value.trim(), permit: f.permit.value.trim() }); if (r2.note) toast(r2.note); V.row.jurisdiction = { city: f.city.value.trim(), state: f.state.value.trim(), country: f.country.value.trim(), permit: f.permit.value.trim() }; clearTimeout(V.timer); tick(); }
      catch (err) { toast(err.message, true); b.disabled = false; }
    };
  }

  /* E: two references, DrawUp's own library first */
  const words = s => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
  async function findRefs() {
    const rv = V.row.review, terms = [...new Set([...rv.search_terms.flatMap(words), ...words(rv.assembly.type), ...rv.assembly.materials.flatMap(words)])].slice(0, 30);
    const score = (text, cat) => { const t = String(text).toLowerCase(); let n = 0; terms.forEach(w => { if (t.includes(w)) n++; }); if (cat && cat === rv.assembly.category) n += 3; return n; };
    const out = [];
    // DrawUp 2D + DrawUp 3D catalog (DrawUp-authored learning details; holograms in /drawup-holograms)
    (window.DrawUpDetailCatalog || []).forEach(d => { const s = score([d.title, d.kw, d.cat, d.asm, d.mat].join(' '), d.cat); if (s >= 3) out.push({ kind: 'catalog', s, d }); });
    // the member's own, firm and published DrawUp AI details (RLS decides what this member may see)
    const like = terms.slice(0, 6).map(w => `title.ilike.%${w}%`).join(',');
    if (like) {
      const { data } = await sb().from('details').select('id,title,category,description,material,assembly,source,owner_id,firm_id,visibility,status,drawing,detail_code,revision,review,firms(name)').or(like).eq('status', 'published').neq('id', V.row.detail_id || '00000000-0000-0000-0000-000000000000').limit(30).then(x => x, () => ({}));
      (data || []).forEach(d => { if (d.review?.vdi_review_id === V.id) return; const s = score([d.title, d.category, d.assembly, d.material, d.description].join(' '), d.category); if (s >= 2) out.push({ kind: d.firm_id ? 'firm' : d.source === 'drawup_ai' ? 'ai' : 'member', s: s + (d.firm_id ? 2 : 0), d }); });
      const { data: m } = await sb().from('vdi_manufacturer_refs').select('*').or(terms.slice(0, 6).map(w => `search_text.ilike.%${w}%`).join(',')).limit(20).then(x => x, () => ({}));
      (m || []).forEach(r => out.push({ kind: 'mfr', s: score([r.title, r.product, r.search_text].join(' ')), d: r }));
    }
    (V.row.research?.manufacturer_refs || []).forEach(r => { if (!out.some(o => o.kind === 'mfr' && o.d.url === r.url)) out.push({ kind: 'mfr', s: 2 + score([r.title, r.product].join(' ')), d: r }); });
    return out.sort((a, b) => b.s - a.s);
  }
  async function renderRefs() {
    const key = JSON.stringify([V.row.review?.search_terms, (V.row.research?.manufacturer_refs || []).length, V.row.detail_id]);
    if (V.refsKey === key) return; V.refsKey = key;
    sec('refs', `<div class="vdi27-head"><span class="vdi27-kick">E · TWO REFERENCE OPTIONS</span><h3>Understand the fix</h3></div><div class="vdi27-wait"><i class="vdi27-spin"></i>Searching DrawUp's detail library first…</div>`);
    let list = []; try { list = await findRefs(); } catch (e) { console.warn(e); }
    V.refs = list;
    const project = [V.row.jurisdiction?.state, V.row.jurisdiction?.country].filter(Boolean).join(', ');
    const visual = list.find(x => x.kind === 'catalog') ? { kind: 'catalog3d', d: list.find(x => x.kind === 'catalog').d } : list.find(x => x.kind === 'mfr' && x.d.kind === 'visual') || (V.row.drawing ? { kind: 'own3d' } : null);
    const technical = list.find(x => x.kind === 'firm') || list.find(x => x.kind === 'catalog') || list.find(x => x.kind === 'mfr' && ['technical', 'installation_guide'].includes(x.d.kind)) || list.find(x => x.kind === 'ai');
    const PROV = { catalog: ['DrawUp library detail', 'DrawUp-authored typical detail (learning content, not for construction)'], catalog3d: ['DrawUp 3D library', 'DrawUp-authored educational 3D illustration, not to scale'], firm: ['Firm detail', 'Your firm\'s detail, shown under your firm\'s access rules'], ai: ['DrawUp-generated interpretation', 'Drawn by DrawUp AI; not verified by a manufacturer or engineer'], member: ['Member detail', 'Uploaded by a DrawUp member'], mfr: ['Manufacturer original', 'Opens on the manufacturer\'s site. DrawUp links to it and does not copy it.'], own3d: ['DrawUp-generated interpretation', 'Built from the corrected detail below; not a manufacturer drawing'] };
    const card = (opt, label, x) => {
      if (!x) return `<article class="vdi27-ref empty"><span class="vdi27-kick">${opt}</span><h4>${label}</h4><p class="vdi27-muted">No matching ${opt === 'OPTION 1' ? 'visual' : 'technical'} reference was found${V.row.web_search ? '' : ' (manufacturer search is off)'}. DrawUp will not invent one.</p></article>`;
      const p = PROV[x.kind] || PROV.member, d = x.d || {};
      let img = '', title = '', meta = '', act = '';
      if (x.kind === 'catalog3d') { img = `<img src="/drawup-holograms/${encodeURIComponent(d.code)}.svg" alt="3D illustration of ${esc(d.title)}">`; title = d.title; meta = `${d.code} · ${d.cat}`; act = `<button type="button" data-cat="${esc(d.id)}">Open with its 2D detail</button>`; }
      else if (x.kind === 'catalog') { img = window.DrawUpDetails?.urlOf ? `<img src="${window.DrawUpDetails.urlOf(d)}" alt="${esc(d.title)}">` : ''; title = d.title; meta = `${d.code} · ${d.cat} · ${d.scale}`; act = `<button type="button" data-cat="${esc(d.id)}">Open in Details</button>`; }
      else if (x.kind === 'own3d') { img = '<div class="vdi27-refown">The 3D assembly of the corrected detail is in section F.</div>'; title = 'Corrected detail in 3D'; act = '<button type="button" data-goto="compare">Go to the 3D view</button>'; }
      else if (x.kind === 'mfr') { title = d.title; meta = [d.manufacturer, d.product, d.region, d.revision && 'Rev ' + d.revision, d.published, /bimobject\.com/i.test(d.url) && 'via BIMobject'].filter(Boolean).join(' · '); act = `<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">Open the original ↗</a>`; img = `<div class="vdi27-mfr"><b>${esc(d.manufacturer)}</b><span>${esc(d.file_type || 'Document')}</span></div>`; }
      else { img = d.drawing && window.DrawUpDetailDraw?.urlOf ? `<img src="${window.DrawUpDetailDraw.urlOf(d)}" alt="${esc(d.title)}">` : ''; title = d.title; meta = [d.firms?.name, d.category, d.detail_code].filter(Boolean).join(' · '); act = d.drawing ? `<button type="button" data-ai="${esc(d.id)}">Open</button>` : ''; }
      const regionWarn = x.kind === 'mfr' && d.region && project && !new RegExp(String(d.region).split(/[ ,]/)[0], 'i').test(project) ? `<p class="vdi27-note warn">This is a ${esc(d.region)} document. It is not automatically applicable to a project in ${esc(project)}.</p>` : '';
      return `<article class="vdi27-ref"><span class="vdi27-kick">${opt} · ${label}</span><div class="vdi27-refimg">${img}</div><h4>${esc(title)}</h4><p class="vdi27-meta">${esc(meta)}</p><p><span class="vdi27-prov ${x.kind}">${p[0]}</span> <small>${p[1]}</small></p>${x.kind === 'mfr' ? `<dl class="vdi27-credit"><dt>Source</dt><dd>${esc(d.manufacturer)}</dd><dt>Product</dt><dd>${esc(d.product || '—')}</dd><dt>Detail</dt><dd>${esc(d.title)}</dd><dt>Region</dt><dd>${esc(d.region || 'not stated')}</dd><dt>Revision</dt><dd>${esc(d.revision || d.published || 'not stated')}</dd><dt>Reference</dt><dd><a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(new URL(d.url).hostname)}</a></dd></dl><p class="vdi27-fine">Manufacturer-specific. Use only with that manufacturer's products and in the market it was written for.</p>` : ''}${regionWarn}<div class="vdi27-acts">${act}</div></article>`;
    };
    const more = list.filter(x => x !== technical && !(visual && x.d === visual.d)).slice(0, 8);
    const s = sec('refs', `<div class="vdi27-head"><span class="vdi27-kick">E · TWO REFERENCE OPTIONS</span><h3>Understand the fix</h3></div>
      <div class="vdi27-refs">${card('OPTION 1', 'VISUAL ASSEMBLY', visual)}${card('OPTION 2', 'TECHNICAL CD DETAIL', technical)}</div>
      ${more.length ? `<details class="vdi27-open"><summary>More references (${more.length})</summary><ul class="vdi27-morerefs">${more.map(x => `<li><span class="vdi27-prov ${x.kind}">${(PROV[x.kind] || PROV.member)[0]}</span> ${x.kind === 'mfr' ? `<a href="${esc(x.d.url)}" target="_blank" rel="noopener noreferrer">${esc(x.d.title)} ↗</a> <small>${esc([x.d.manufacturer, x.d.region, /bimobject\.com/i.test(x.d.url) && 'via BIMobject'].filter(Boolean).join(' · '))}</small>` : x.kind === 'catalog' ? `<button type="button" class="vdi27-link" data-cat="${esc(x.d.id)}">${esc(x.d.code)} ${esc(x.d.title)}</button>` : `<button type="button" class="vdi27-link" data-ai="${esc(x.d.id)}">${esc(x.d.title)}</button> <small>${esc(x.d.firms?.name || x.d.category || '')}</small>`}</li>`).join('')}</ul></details>` : ''}
      <p class="vdi27-fine">References help you understand the fix. They are not approved for your project: a DrawUp library detail is learning content, and a manufacturer detail applies only to that manufacturer's system and market.</p>`);
    s.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => window.DrawUpDetails?.viewer?.(b.dataset.cat));
    s.querySelectorAll('[data-ai]').forEach(b => b.onclick = () => { const x = list.find(o => o.d.id === b.dataset.ai); if (x && window.DrawUpDetailDraw?.viewer) window.DrawUpDetailDraw.viewer(x.d); });
    s.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => V.el.querySelector('[data-sec="compare"]').scrollIntoView({ behavior: 'smooth' }));
    renderAll.stepsRefresh?.();
  }

  /* F: side-by-side comparison workspace */
  function changedComps() {
    const rv = V.row.review, d = V.row.drawing; if (!d) return new Set();
    const set = new Set((d.drawing.components || []).filter(c => !rv.components.some(x => x.id === c.id)).map(c => c.id));
    (d.diffs || []).forEach(x => { const f = rv.findings.find(ff => ff.id === x.finding_id); if (f?.component_id) set.add(f.component_id); });
    return set;
  }
  function selectComp(comp, from) {
    V.comp = comp; if (from !== '2d') V.sheet?.select(comp); if (from !== '3d') V.holo?.select(comp);
    V.el.querySelectorAll('[data-comp-li]').forEach(li => li.classList.toggle('on', li.dataset.compLi === comp));
    V.el.querySelectorAll('.vdi27-mk').forEach(m => { const f = V.row.review.findings.find(x => x.id === m.dataset.f); m.classList.toggle('hl', !!comp && f?.component_id === comp); });
  }
  async function renderCompare() {
    const row = V.row, ds = jobState('draw');
    if (!row.drawing) {
      sec('compare', `<div class="vdi27-head"><span class="vdi27-kick">F · DRAWUP CORRECTED DETAIL</span><h3>Corrected detail</h3></div>${ds === 'failed' ? `<div class="vdi27-note warn">The corrected detail could not be drawn (${esc(row.jobs?.draw?.error || 'error')}). <button type="button" data-redraw>Try again</button></div>` : '<div class="vdi27-wait"><i class="vdi27-spin"></i>Drawing the corrected 2D detail from the findings. The 3D assembly is built from the same geometry as soon as it lands.</div>'}`);
      const rb = V.el.querySelector('[data-redraw]'); if (rb) rb.onclick = redraw;
      return;
    }
    const d = row.drawing, g = d.drawing, comps = g.components || [], val = row.validation || { issues: [] };
    const scale = window.DrawUpDetailDraw && row.detail_id ? '' : '';
    const s = sec('compare', `<div class="vdi27-head"><span class="vdi27-kick">F · DRAWUP CORRECTED DETAIL</span><h3>${esc(d.title)}</h3>
        <div class="vdi27-tools"><button type="button" data-cmp="side" aria-pressed="true">Side by side</button><button type="button" data-cmp="slider" aria-pressed="false">Before / after slider</button><label class="vdi27-chk"><input type="checkbox" data-showchg> Highlight changes</label><button type="button" data-edit aria-pressed="false">✎ Edit detail</button></div></div>
      <div class="vdi27-cmp">
        <figure class="vdi27-pane"><figcaption>ORIGINAL · unchanged</figcaption><div class="vdi27-origwrap"><img alt="Your original drawing"></div></figure>
        <figure class="vdi27-pane vdi27-p2d"><figcaption>CORRECTED 2D · DrawUp-generated proposal · editable vector</figcaption><div class="vdi27-2dhost"></div></figure>
        <figure class="vdi27-pane vdi27-p3d"><figcaption>3D ASSEMBLY · from the same geometry</figcaption><div class="vdi27-3dbar" role="group" aria-label="3D view">${[['real', 'Realistic'], ['holo', 'Hologram'], ['explode', 'Exploded'], ['tech', 'Technical']].map(([k, n]) => `<button type="button" data-m="${k}">${n}</button>`).join('')}</div><canvas class="vdi27-3d" tabindex="0" aria-label="3D assembly. Drag to rotate, shift-drag to pan, scroll to zoom, click a part to select it."></canvas><div class="vdi27-3dctl"><label>Explode<input type="range" min="0" max="1" step="0.05" value="0" data-explode></label><label class="vdi27-chk"><input type="checkbox" data-cut checked> Cutaway</label><button type="button" data-png>PNG</button></div></figure>
        <div class="vdi27-slider" hidden><div class="vdi27-sl-a"><img alt="Original"></div><div class="vdi27-sl-b"></div><input type="range" min="0" max="100" value="50" aria-label="Before / after"><span class="vdi27-sl-l">Before</span><span class="vdi27-sl-r">After</span><p class="vdi27-fine">Visual comparison only. The two drawings are fitted to the same box; they are not overlaid to scale.</p></div>
      </div>
      <div class="vdi27-under">
        <div><h4>Components</h4><ul class="vdi27-comps">${comps.map(c => `<li data-comp-li="${esc(c.id)}"><label><input type="checkbox" data-hide="${esc(c.id)}" checked></label><button type="button" data-pick="${esc(c.id)}">${esc(c.name)}</button>${c.inferred ? '<span class="vdi27-tag warn">inferred</span>' : ''}${changedComps().has(c.id) ? '<span class="vdi27-tag chg">changed</span>' : ''}</li>`).join('')}</ul></div>
        <div><h4>What changed from the original</h4>${(d.diffs || []).length ? `<ul class="vdi27-diffs">${d.diffs.map(x => { const f = row.review.findings.find(ff => ff.id === x.finding_id); return `<li>${f ? `<button type="button" class="vdi27-num p-${f.priority}" data-f="${esc(f.id)}">${findingNo(f)}</button>` : '<span class="vdi27-num">·</span>'} ${esc(x.change)}</li>`; }).join('')}</ul>` : '<p class="vdi27-muted">No changes were listed.</p>'}
          <h4>Assumed dimensions <small>confirm before use</small></h4>${(d.assumed_dims || []).length ? `<ul class="vdi27-assumed">${d.assumed_dims.map(a => `<li><b>${esc(a.what)}: ${esc(a.value)}</b> <span class="vdi27-muted">${esc(a.why)}</span></li>`).join('')}</ul>` : '<p class="vdi27-muted">None listed.</p>'}</div>
        <div><h4>Geometry checks <span class="vdi27-tag ${val.ok ? 'ok' : 'bad'}">${val.ok ? 'No errors' : 'Errors to fix'}</span></h4><ul class="vdi27-checks">${(val.issues || []).map(is => `<li class="${is.level}"${is.comp ? ` data-pick="${esc(is.comp)}"` : ''}>${esc(is.text)}</li>`).join('') || '<li class="info">Every dimension matches its drawn length, and no materials overlap.</li>'}</ul><p class="vdi27-fine">Checked by DrawUp's geometry engine, not by AI: dimension strings against drawn lengths, overlapping materials, leaders, continuity of control layers, and parts that are listed but not drawn.</p></div>
      </div>
      <div class="vdi27-editbar" hidden><span>Editing. Your changes update the 3D view and the checks live.</span><button type="button" data-save class="vdi27-primary">Save as new revision</button><button type="button" data-discard>Discard edits</button></div>
      <div class="vdi27-exports"><b>Export</b><button type="button" data-x="svg">SVG</button><button type="button" data-x="lsvg">Layered SVG</button><button type="button" data-x="dxf">DXF (AutoCAD R12)</button><button type="button" data-x="pdf">PDF to scale</button><button type="button" data-x="png">PNG</button><span class="vdi27-muted" title="DWG is a closed format. Converting it needs a licensed engine such as the ODA SDK.">DWG: open the DXF in AutoCAD and Save As DWG</span></div>
      ${row.ai_image ? '<div class="vdi27-aiimg"></div>' : ''}`);
    // original
    const src = localOriginal.get(V.id) || await signUrl(row.source_paths?.[0]);
    s.querySelectorAll('.vdi27-origwrap img, .vdi27-sl-a img').forEach(i => { i.src = src; });
    // 2D + 3D from the same model
    const VW = window.DrawUpVDIView;
    V.sheet = VW.Sheet2D(s.querySelector('.vdi27-2dhost'), { drawing: g, components: comps, changed: changedComps(), title: d.title, id: 'vdi2d',
      onSelect: comp => selectComp(comp, '2d'),
      onChange: api2 => { V.holo.setModel(api2.drawing, api2.drawing.components); },
      onValidate: v => { const ul = s.querySelector('.vdi27-checks'); if (ul && V.sheet?.dirty) ul.innerHTML = v.issues.map(is => `<li class="${is.level}">${esc(is.text)}</li>`).join('') || '<li class="info">No problems found.</li>'; },
      onHidden: set => V.holo.setHidden(set) });
    V.holo = VW.Holo3D(s.querySelector('.vdi27-3d'), { mode: 'real', onPick: comp => selectComp(comp, '3d') });
    V.holo.setModel(g, comps);
    const bar = s.querySelector('.vdi27-3dbar'), ex = s.querySelector('[data-explode]');
    const setMode = m => { bar.querySelectorAll('[data-m]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m))); if (m === 'explode') { ex.value = 0.6; V.holo.setExplode(0.6); V.holo.setMode(V.holo.mode === 'tech' || V.holo.mode === 'holo' ? V.holo.mode : 'real'); } else { V.holo.setMode(m); } };
    bar.querySelectorAll('[data-m]').forEach(b => b.onclick = () => setMode(b.dataset.m)); setMode('real');
    ex.oninput = () => V.holo.setExplode(ex.value);
    s.querySelector('[data-cut]').onchange = e => V.holo.setCutaway(e.target.checked);
    s.querySelector('[data-png]').onclick = () => { const a = document.createElement('a'); a.href = V.holo.png(); a.download = safeName(d.title) + ' - 3D.png'; a.click(); };
    s.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => selectComp(b.dataset.pick));
    s.querySelectorAll('[data-hide]').forEach(b => b.onchange = () => { const hidden = [...s.querySelectorAll('[data-hide]')].filter(x => !x.checked).map(x => x.dataset.hide); V.sheet.setHidden(hidden); V.holo.setHidden(hidden); });
    s.querySelectorAll('.vdi27-diffs [data-f]').forEach(b => b.onclick = () => { showFinding(b.dataset.f); V.el.querySelector('[data-sec="visual"]').scrollIntoView({ behavior: 'smooth' }); });
    s.querySelector('[data-showchg]').onchange = e => V.sheet.showChanges(e.target.checked);
    // comparison modes
    s.querySelectorAll('[data-cmp]').forEach(b => b.onclick = () => {
      const slider = b.dataset.cmp === 'slider'; s.querySelectorAll('[data-cmp]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      s.querySelector('.vdi27-slider').hidden = !slider; s.querySelectorAll('.vdi27-pane').forEach(p => { p.hidden = slider && !p.classList.contains('vdi27-p3d'); });
      if (slider) { s.querySelector('.vdi27-sl-b').innerHTML = V.sheet.svg(); slide(); }
    });
    const rng = s.querySelector('.vdi27-slider input[type=range]'), slide = () => { s.querySelector('.vdi27-sl-b').style.clipPath = `inset(0 0 0 ${rng.value}%)`; };
    rng.oninput = slide;
    // edit
    const eb = s.querySelector('[data-edit]'), editbar = s.querySelector('.vdi27-editbar');
    eb.onclick = () => { const on = eb.getAttribute('aria-pressed') !== 'true'; eb.setAttribute('aria-pressed', String(on)); V.sheet.setEditable(on); editbar.hidden = !on; s.querySelector('.vdi27-cmp').classList.toggle('editing', on); };
    s.querySelector('[data-discard]').onclick = () => { V.sheet.reset(g, comps); V.holo.setModel(g, comps); };
    s.querySelector('[data-save]').onclick = async e => {
      const b = e.target; b.disabled = true;
      try { const r = await api({ save_edit: V.id, drawing: V.sheet.drawing }); V.row = { ...V.row, ...r }; V.detailRow = null; toast(r.validation?.ok ? 'Saved as a new revision.' : 'Saved as a new revision. Some geometry checks still need attention.'); V.drawKey = ''; renderAll(); }
      catch (err) { toast(err.message, true); } finally { b.disabled = false; }
    };
    // exports
    s.querySelectorAll('[data-x]').forEach(b => b.onclick = () => exportAs(b.dataset.x));
    renderAiImage();
    if (V.comp) selectComp(V.comp);
  }
  /* Photoreal AI illustration, anchored to DrawUp's own 3D model of this exact detail and checked against it. */
  function modelRender() {
    const c = document.createElement('canvas'); c.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:800px';
    document.body.appendChild(c);
    try {
      const h = window.DrawUpVDIView.Holo3D(c, { mode: 'real', zoom: 1.8 }), g = (V.sheet && !V.sheet.dirty ? V.sheet.drawing : V.row.drawing.drawing);
      h.setModel(g, g.components || []); h.setCutaway(true); h.setExplode(0.12); h.select(null); h.render();
      return c.toDataURL('image/png');
    } finally { c.remove(); }
  }
  async function renderAiImage() {
    const row = V.row, box = V.el.querySelector('.vdi27-aiimg'); if (!box || !row.drawing) return;
    const ck = row.ai_image_check || null, js = jobState('image'), jc = jobState('imgcheck');
    const key = JSON.stringify([row.ai_image_path, ck, js, jc, row.ai_image_ref_path]); if (V.aiKey === key) return; V.aiKey = key;
    const busy = js === 'running' || js === 'starting' || jc === 'running' || jc === 'starting';
    const what = ck?.status === 'retrying' ? 'The first try did not match the model, so DrawUp is making it again with the differences fixed (no extra charge)…' : jc === 'running' ? 'Checking the illustration against the 3D model…' : 'Making the illustration from the 3D model of this detail…';
    const badge = !ck || busy ? '' : ck.status === 'checked' && ck.matches ? `<p class="vdi27-note"><span class="vdi27-tag ok">Checked against the model: matches</span> ${esc(ck.note || '')}</p>`
      : ck.status === 'checked' ? `<div class="vdi27-note warn"><span class="vdi27-tag warn">Does not fully match the model</span> ${esc(ck.note || '')}<ul>${[...ck.missing.map(x => 'Missing: ' + x), ...ck.extra.map(x => 'Not in the model: ' + x), ...ck.wrong.map(x => 'Different: ' + x)].map(x => `<li>${esc(x)}</li>`).join('')}</ul>Use the DrawUp 3D model for anything technical.</div>`
      : `<p class="vdi27-note"><span class="vdi27-tag gray">Not checked</span> ${esc(ck.note || 'The illustration could not be checked against the model.')}</p>`;
    box.innerHTML = `<h4>Photoreal illustration</h4>
      ${busy ? `<div class="vdi27-wait"><i class="vdi27-spin"></i>${what}</div>` : ''}
      ${row.ai_image_path && !busy ? `<div class="vdi27-aipair"><figure><img data-ref alt="DrawUp 3D model of this detail"><figcaption>DRAWUP 3D MODEL · exact geometry from the corrected detail</figcaption></figure><figure><img data-ai alt="AI illustration"><figcaption>AI ILLUSTRATION · made from the model on the left</figcaption></figure></div>${badge}` : ''}
      ${busy ? '' : `<p class="vdi27-muted">The illustration is made from DrawUp's 3D model of this exact detail: same parts, order, sizes and camera. Only the materials are made photoreal, and every picture is compared with the model before it is shown. It is still an illustration, not a construction document.</p><button type="button" data-aiimg>${row.ai_image_path ? 'Make it again' : 'Make a photoreal illustration'}</button>`}`;
    if (row.ai_image_path && !busy) { box.querySelector('[data-ai]').src = await signUrl(row.ai_image_path); box.querySelector('[data-ref]').src = await signUrl(row.ai_image_ref_path); }
    const b = box.querySelector('[data-aiimg]');
    if (b) b.onclick = async () => {
      if (V.sheet?.dirty) return toast('Save your edits first, so the illustration matches the saved detail.', true);
      b.disabled = true;
      try { const reference = modelRender(); await api({ image: V.id, reference }); V.row.jobs = { ...V.row.jobs, image: { status: 'running' } }; V.aiKey = ''; renderAiImage(); clearTimeout(V.timer); tick(); }
      catch (err) { toast(err.message, true); b.disabled = false; }
    };
  }
  async function detailRow() {
    if (V.detailRow?.id === V.row.detail_id) return V.detailRow;
    if (!V.row.detail_id) return null;
    const { data } = await sb().from('details').select('*').eq('id', V.row.detail_id).maybeSingle().then(x => x, () => ({}));
    V.detailRow = data || null; return V.detailRow;
  }
  async function exportAs(fmt) {
    const d = V.row.drawing, base = safeName((V.row.review?.sheet_ref?.detail_no ? V.row.review.sheet_ref.detail_no + ' - ' : '') + d.title + ' - DrawUp proposal');
    if (fmt === 'svg') return download(base + '.svg', V.sheet.svg(), 'image/svg+xml');
    if (fmt === 'lsvg') return download(base + ' - layered.svg', V.sheet.layered(), 'image/svg+xml');
    if (fmt === 'dxf') return download(base + '.dxf', V.sheet.dxf(), 'application/dxf');
    if (V.sheet.dirty) toast('PDF and PNG use the saved revision. Save your edits first to include them.', true);
    const row = await detailRow();
    if (row && window.DrawUpDetailDraw?.download) return window.DrawUpDetailDraw.download(row, fmt);
    if (fmt === 'png') { const svg = V.sheet.svg(), img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = 2400; c.height = Math.round(2400 * img.naturalHeight / img.naturalWidth); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => download(base + '.png', b), 'image/png'); }; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); return; }
    toast('Open the Details tab once to load the PDF maker, then try again.', true);
  }
  async function redraw() {
    try { const r = await api({ redraw: V.id }); toast(r.credits_charged ? `Redrawing (${r.credits_charged} credits).` : 'Redrawing.'); V.drawKey = ''; clearTimeout(V.timer); tick(); }
    catch (e) { toast(e.message, true); }
  }

  /* G: one follow-up question */
  function renderFollow() {
    const row = V.row, q = row.review.followup, rs = jobState('refine');
    const s = sec('followup', `<div class="vdi27-head"><span class="vdi27-kick">G · ONE QUESTION</span><h3>${q.question ? 'The most important thing DrawUp needs to know' : 'No open question'}</h3></div>
      ${(row.followups || []).length ? `<ul class="vdi27-qa">${row.followups.map(x => `<li><b>${esc(x.q)}</b><span>${esc(x.a)}</span></li>`).join('')}</ul>` : ''}
      ${rs === 'running' || rs === 'starting' ? '<div class="vdi27-wait"><i class="vdi27-spin"></i>Refining the review with your answer…</div>'
        : q.question ? `<form class="vdi27-ask"><p class="vdi27-q">${esc(q.question)}</p>${q.why ? `<p class="vdi27-muted">${esc(q.why)}</p>` : ''}${q.options.length ? `<div class="vdi27-opts">${q.options.map(o => `<button type="button" data-opt>${esc(o)}</button>`).join('')}</div>` : ''}<div class="vdi27-askrow"><input name="a" maxlength="1200" placeholder="Your answer"><button type="submit">Answer <small>${REFINE_COST} credits</small></button></div></form>` : ''}
      ${(row.followups || []).length && row.drawing ? `<p class="vdi27-muted">Your answers refine the findings. To update the corrected detail too: <button type="button" class="vdi27-link" data-redraw>Redraw with my answers (${REDRAW_COST} credits)</button></p>` : ''}`);
    const f = s.querySelector('form');
    if (f) {
      s.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => { f.a.value = b.textContent; f.a.focus(); });
      f.onsubmit = async e => { e.preventDefault(); const a = f.a.value.trim(); if (!a) return; f.querySelector('button[type=submit]').disabled = true; try { await api({ answer: V.id, text: a }); V.row.jobs = { ...V.row.jobs, refine: { status: 'running' } }; renderFollow(); clearTimeout(V.timer); tick(); } catch (err) { toast(err.message, true); f.querySelector('button[type=submit]').disabled = false; } };
    }
    const rb = s.querySelector('[data-redraw]'); if (rb) rb.onclick = redraw;
  }

  /* DrawUp Ready */
  function renderReady() {
    const row = V.row, rv = row.review, d = row.drawing;
    const pro = rv.findings.filter(f => f.kind === 'requires_professional_verification' || ['structural', 'fire'].includes(f.discipline));
    const inferred = (d?.drawing?.components || []).filter(c => c.inferred);
    const key = JSON.stringify([!!d, row.detail_id, row.validation?.ok, pro.length, inferred.length, (d?.assumed_dims || []).length, V.approved]);
    if (V.readyKey === key) return; V.readyKey = key;
    const persona = PERSONA[row.persona] || PERSONA.coach;
    const s = sec('ready', `<div class="vdi27-head"><span class="vdi27-kick">DRAWUP READY</span><h3>Corrected detail package</h3></div>
      <div class="vdi27-ready"><div><h4>Correction summary</h4><p>${d ? `${(d.diffs || []).length} change${(d.diffs || []).length === 1 ? '' : 's'} from the original answer ${new Set((d.diffs || []).map(x => x.finding_id).filter(Boolean)).size} of ${rv.findings.length} findings.` : 'The corrected detail is still being drawn.'} ${row.validation ? (row.validation.ok ? 'Geometry checks found no errors.' : 'Geometry checks found errors to fix before use.') : ''}</p>
        <h4>Still to decide or verify</h4><ul class="vdi27-remain">${[...rv.unresolved.map(t => ['Design decision', t]), ...(d?.assumed_dims || []).map(a => ['Assumed dimension', `${a.what}: ${a.value}`]), ...inferred.map(c => ['Inferred part', c.name]), ...pro.map(f => ['Licensed professional review', `${f.item}: ${f.finding}`])].map(([k, t]) => `<li><span class="vdi27-tag ${k === 'Licensed professional review' ? 'pro' : 'warn'}">${k}</span> ${esc(t)}</li>`).join('') || '<li>Nothing open was listed. A licensed professional must still review the detail.</li>'}</ul>
        <p class="vdi27-fine">The corrected detail is a DrawUp-generated proposal. It is not a manufacturer-approved or engineer-approved detail, and it is not for construction until a licensed professional has reviewed it for the project, the adopted code and the AHJ.</p></div>
        <div class="vdi27-readyacts">${d && row.detail_id ? `<button type="button" class="vdi27-primary" data-approve>${V.approved ? '✓ Approved' : 'Approve this corrected detail'}</button><p class="vdi27-muted">Approving marks this revision as the one to use in your Details. It does not change any drawing set by itself; to put it in a set, open it in Details and use Approve + replace in the set.</p><button type="button" data-details>Open in Details (comment, regenerate, ask the team)</button>` : ''}
          <button type="button" data-team>Ask ${persona.name} about this review</button><button type="button" data-report>Print / save the review as PDF</button><button type="button" data-new>Review another drawing</button></div></div>`);
    const ap = s.querySelector('[data-approve]');
    if (ap) ap.onclick = async () => {
      if (V.sheet?.dirty) return toast('Save or discard your edits first.', true);
      ap.disabled = true;
      try { const res = await fetch('/api/details/draw', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, body: JSON.stringify({ [V.approved ? 'unapprove' : 'approve']: row.detail_id }) }); const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'Could not approve.'); V.approved = !V.approved; toast(V.approved ? 'Approved. Nothing else in your drawings changed.' : 'Approval taken back.'); V.readyKey = ''; renderReady(); window.DrawUpDetails?.reload?.(); }
      catch (e) { toast(e.message, true); ap.disabled = false; }
    };
    const dt = s.querySelector('[data-details]'); if (dt) dt.onclick = async () => { const r = await detailRow(); if (r && window.DrawUpDetailDraw?.viewer) window.DrawUpDetailDraw.viewer(r, { tab: 'review' }); else toast('Open the Details tab to see it.', true); };
    s.querySelector('[data-team]').onclick = () => {
      const top = rv.findings.slice(0, 4).map((f, i) => `${i + 1}. ${f.item}: ${f.finding}`).join(' ');
      const prefill = `About my drawing review "${rv.title}" (${(STATUS[rv.assessment.status] || [''])[0]}): ${top} `;
      if (window.DrawUpTeam?.open) { V.el.querySelector('.vdi27-x').click(); window.DrawUpTeam.open({ fresh: true, prefill, assistant: row.persona === 'teammate' ? 'teammate' : 'coach' }); } else toast('Open the AI Team tab to ask.', true);
    };
    s.querySelector('[data-report]').onclick = report;
    s.querySelector('[data-new]').onclick = () => open({ persona: row.persona });
    if (ap) (async () => { const r = await detailRow(); if (r?.approved_at && !V.approved) { V.approved = true; ap.textContent = '✓ Approved'; } })();
  }

  /* printable review (the browser saves it as PDF) */
  async function report() {
    const row = V.row, rv = row.review, d = row.drawing, w = window.open('', '_blank');
    if (!w) return toast('Allow pop-ups to print the review.', true);
    const orig = localOriginal.get(V.id) || await signUrl(row.source_paths?.[0]);
    const three = V.holo ? V.holo.png() : '';
    const checks = row.research?.code_checks || [];
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(rv.title)} - DrawUp review</title><style>body{font:12px/1.45 Arial,sans-serif;color:#142238;margin:28px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px;border-bottom:2px solid #13243C}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd;padding:4px 6px;vertical-align:top;text-align:left}img,svg{max-width:100%}.g{display:grid;grid-template-columns:1fr 1fr;gap:12px}.f{font-size:10px;color:#556}</style></head><body>
      <h1>${esc(rv.title)}</h1><p>${esc((STATUS[rv.assessment.status] || [''])[0])} · ${new Date().toLocaleDateString('en-US')} · Reviewed by DrawUp ${esc((PERSONA[row.persona] || PERSONA.coach).name)}</p>
      <h2>Initial assessment</h2><p><b>${esc(rv.assessment.headline)}</b> ${esc(rv.assessment.why)}</p>
      <h2>What looks right</h2><ul>${rv.looks_right.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <h2>What needs attention</h2><table><tr><th>#</th><th>Item</th><th>Finding</th><th>Recommendation</th><th>Priority</th><th>Type</th></tr>${rv.findings.map((f, i) => `<tr><td>${i + 1}</td><td>${esc(f.item)}</td><td>${esc(f.finding)}</td><td>${esc(f.recommendation)}</td><td>${esc(f.priority)}</td><td>${esc((KIND[f.kind] || [''])[0])}</td></tr>`).join('')}</table>
      <h2>Code references</h2><table><tr><th>Code</th><th>Edition</th><th>Section</th><th>Requirement</th><th>Status</th><th>Source</th></tr>${rv.code_items.map(k => { const c = checks.find(x => x.id === k.id); return `<tr><td>${esc(k.code)}</td><td>${esc(c?.edition || editionFor(k.code) || 'not established')}</td><td>${esc(c?.section || k.section || '—')}</td><td>${esc(c?.requirement || k.summary)}</td><td>${esc((CHECK[c?.status] || CHECK.not_verified)[0])}</td><td>${c?.source_url ? esc(c.source_url) : '—'}</td></tr>`; }).join('')}</table>
      <h2>Original and corrected detail</h2><div class="g"><div><p class="f">ORIGINAL (unchanged)</p><img src="${orig}"></div><div><p class="f">DRAWUP-GENERATED PROPOSAL</p>${d && V.sheet ? V.sheet.svg() : '<p>Not drawn yet.</p>'}</div></div>${three ? `<p class="f">3D ASSEMBLY FROM THE SAME GEOMETRY</p><img src="${three}" style="max-height:340px">` : ''}
      ${d ? `<h2>Changes</h2><ul>${(d.diffs || []).map(x => `<li>${esc(x.change)}</li>`).join('')}</ul><h2>Assumed dimensions</h2><ul>${(d.assumed_dims || []).map(a => `<li>${esc(a.what)}: ${esc(a.value)} (${esc(a.why)})</li>`).join('') || '<li>None listed</li>'}</ul>` : ''}
      <h2>Open decisions</h2><ul>${rv.unresolved.map(t => `<li>${esc(t)}</li>`).join('') || '<li>None listed</li>'}</ul>
      <p class="f">DrawUp Visual Detail Intelligence. AI-assisted review for design development. Not a code compliance determination. The corrected detail is a DrawUp-generated proposal, not a manufacturer- or engineer-approved detail, and must be reviewed by a licensed professional for the project, the adopted code and the AHJ.</p>
      <script>setTimeout(()=>print(),400)<\/script></body></html>`);
    w.document.close();
  }

  /* ------------------------------------------------------------------ entry points */
  // 1. Details tab: a card above "Draw a detail"
  function detailsCard(host, o) {
    if (o?.publicPage || !host || host.querySelector('.vdi27-card')) return;
    const card = document.createElement('section'); card.className = 'vdi27-card';
    card.innerHTML = `<div><span class="vdi27-kick">VISUAL DETAIL INTELLIGENCE · ARCH COACH + TEAMMATE</span><h2>Find the flaws → Understand the fix → DrawUp Ready</h2><p>Upload or paste a drawing. Get the assessment, marked-up issues, code checked for your jurisdiction, verified references, and an editable corrected detail with a 3D assembly.</p></div>
      <div class="vdi27-cardacts"><label class="vdi27-drop sm" tabindex="0"><input type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"><b>Drop, paste or choose a drawing</b></label><button type="button" data-open>Open reviews</button></div>`;
    const anchor = host.querySelector('.dd25') || host.querySelector('.dd21-head');
    if (anchor) anchor.insertAdjacentElement(anchor.classList.contains('dd25') ? 'beforebegin' : 'afterend', card); else host.prepend(card);
    bindCard(card, 'coach');
  }
  function bindCard(card, persona) {
    const drop = card.querySelector('.vdi27-drop'), input = drop.querySelector('input');
    input.onchange = () => { const f = [...input.files]; input.value = ''; if (f.length) open({ files: f, persona }); };
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); open({ files: [...e.dataTransfer.files], persona }); });
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    card.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])].filter(x => /^image\//.test(x.type)); if (f.length) { e.preventDefault(); open({ files: f, persona }); } });
    card.querySelector('[data-open]').onclick = () => open({ persona });
  }
  (window.DrawUpDetailTabs = window.DrawUpDetailTabs || []).push(detailsCard);

  // 2. Arch Coach tab + AI Team chat: a picture attached or pasted there can be reviewed in one click.
  let offer = null;
  function offerReview(files, persona) {
    const imgs = [...files].filter(f => /^image\//.test(f.type) || /\.pdf$/i.test(f.name)); if (!imgs.length) return;
    document.getElementById('vdi27-offer')?.remove();
    offer = { files: imgs, persona, at: Date.now() };
    document.body.insertAdjacentHTML('beforeend', `<div id="vdi27-offer" role="status"><span class="ic">${PERSONA[persona].icon}</span><div><b>Is this a drawing?</b><small>${esc(PERSONA[persona].name)} can run a full Visual Detail review: markups, code for your jurisdiction, references and a corrected 2D + 3D detail.</small></div><button type="button" data-go>Review it</button><button type="button" data-no aria-label="Dismiss">×</button></div>`);
    const el = document.getElementById('vdi27-offer');
    el.querySelector('[data-go]').onclick = () => { el.remove(); open({ files: offer.files, persona: offer.persona }); };
    el.querySelector('[data-no]').onclick = () => el.remove();
    setTimeout(() => { if (offer && Date.now() - offer.at >= 59000) document.getElementById('vdi27-offer')?.remove(); }, 60000);
  }
  const teamPersona = () => (document.querySelector('[data-pickas][aria-checked="true"]')?.dataset.pickas === 'coach' ? 'coach' : 'teammate');
  document.addEventListener('change', e => {
    const t = e.target; if (!(t instanceof HTMLInputElement) || t.type !== 'file' || !t.files?.length) return;
    if (t.id === 'dc-image') offerReview(t.files, 'coach');
    else if (t.id === 'du-tm25-file') offerReview(t.files, teamPersona());
  }, true);
  document.addEventListener('paste', e => {
    const t = e.target, files = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type)); if (!files.length || !t?.closest) return;
    if (t.closest('#dc-input, #dc-form')) offerReview(files, 'coach');
    else if (t.closest('#du-tm25-input, #du-tm25-form')) offerReview(files, teamPersona());
    else if (t.closest('.dus-ask, [class*="legends"] form, [data-ask-bar]')) offerReview(files, 'coach');
  }, true);

  // 3. Check tab: one card at the top ("Review one detail")
  function checkCard() {
    if (!/^#portal\/check/.test(location.hash)) return;
    const root = document.getElementById('du-workspace-content'); if (!root || root.querySelector('.vdi27-card')) return;
    const head = root.querySelector('.du-work-head'); if (!head) return;
    const card = document.createElement('section'); card.className = 'vdi27-card compact';
    card.innerHTML = `<div><span class="vdi27-kick">CHECK ONE DETAIL · VISUAL DETAIL INTELLIGENCE</span><h2>Checking a single detail? Get the markups, code sources and a corrected 2D + 3D detail.</h2></div><div class="vdi27-cardacts"><label class="vdi27-drop sm" tabindex="0"><input type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"><b>Drop, paste or choose a detail</b></label><button type="button" data-open>Open reviews</button></div>`;
    head.insertAdjacentElement('afterend', card); bindCard(card, 'teammate');
  }
  new MutationObserver(() => { checkCard(); }).observe(document.documentElement, { childList: true, subtree: true });
  // 4. deep link: #portal/details?vdi=<id>
  function fromHash() { const m = location.hash.match(/[?&]vdi=([0-9a-f-]{36})/i); if (m && (!V || V.id !== m[1]) && me()) openReview(m[1]); }
  window.addEventListener('hashchange', fromHash); setTimeout(fromHash, 1500);

  window.DrawUpVDI = { open, openReview, startWith: (pictures, o) => open({ ...(o || {}), pictures }) };
})();
