/* DrawUp Draw Studio (v31): the new front door and studio layout for Draw.
 *
 *  1. "What Will You Create Today?" start screen with exactly two ways in: Import a Drawing and
 *     Create From an Image, plus the member's recent drawings. (The old building-size form is gone
 *     from the start; the example plan and Mark up a file stay as small links.)
 *  2. Import a Drawing: DXF (drawup-draw-import-v31.js) and vector PDF linework (pdf.js) go through
 *     an import review (units, scale, floors, heights, what was recognised, warnings, preview).
 *     Scanned PDFs and images go to the existing picture reader (DrawUpWorkspace.wizard).
 *  3. The studio: every existing tool is kept, regrouped into a left rail (Architecture, Geometry,
 *     Interiors, Materials, Views, Presentation, Export), a top bar (2D/3D, styles, camera, share,
 *     export), a right panel (selection properties and the Building panel with floors) and a bottom
 *     bar (3D camera presets and the Arch Coach change input).
 *  4. Floors (DrawUpFloors), 3D presentation (axonometric, isometric, elevations, floor isolation,
 *     exploded floors, roof on/off, lighting) and a clean high-resolution image export.
 *
 * Nothing here replaces the editor: it moves the existing controls (their handlers come with them)
 * and wraps DrawUpDrawV21.attach / route / decorateStart the same way v22 and v29 do.
 * Rollback: remove this file's tag line (and its CSS) from drawup-preview.html.
 * Public API (also used by the dashboard): window.DrawUpDrawStudio.start('import'|'image'|'choose'),
 * .openRecent({view:'3d'|'export'}); hash routes #portal/draw?start=… and #portal/draw?recent=….
 */
(function () {
  'use strict';
  if (window.DrawUpDrawStudio) return;
  const $q = (r, s) => r && r.querySelector(s), $$ = (r, s) => Array.from(r ? r.querySelectorAll(s) : []);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_e) { /* private mode */ } } };
  const sb = () => window.drawupSupabaseClient;
  const D = () => window.DrawUpDrawCore, F = () => window.DrawUpFloors, IM = () => window.DrawUpImport, WS = () => window.DrawUpWorkspace, G = () => window.DrawUpWSGeo, V3 = () => window.DrawUpDraw3D;
  const BUCKET = 'drawup-private', MAX_MB = 50;
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ftin = v => D().formatFtIn(v);
  const parseLen = v => { const s = String(v || '').trim(); if (!s) return NaN; let a = D().parseFtIn(s); if (isFinite(a) && a > 0) return a; const m = /^([\d.]+)\s*(mm|cm|m)$/i.exec(s); if (m) { const k = { mm: 1 / 25.4, cm: 1 / 2.54, m: 1 / 0.0254 }[m[2].toLowerCase()]; return +m[1] * k; } return NaN; };
  function toast(c, m, bad) { if (c && c.toast) return c.toast(m, bad); console[bad ? 'warn' : 'log'](m); }
  function download(name, data, type) { const blob = data instanceof Blob ? data : new Blob([data], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
  function modal(id, html, cls) {
    document.getElementById(id)?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="dws-modal ${cls || ''}" id="${id}" role="dialog" aria-modal="true"><div class="dws-mcard"><button type="button" class="dws-x" aria-label="Close">×</button><div class="dws-mbody">${html}</div></div></div>`);
    const el = document.getElementById(id), onKey = e => { if (e.key === 'Escape') close(); }, close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
    $q(el, '.dws-x').onclick = close; el.addEventListener('mousedown', e => { if (e.target === el) close(); }); document.addEventListener('keydown', onKey);
    return { el, body: $q(el, '.dws-mbody'), close };
  }
  let pdfjsP = null;
  function loadScript(src) { return new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
  async function pdfjs() { if (window.pdfjsLib) return window.pdfjsLib; if (!pdfjsP) pdfjsP = loadScript('/vendor/pdfjs-3.11.174/pdf.min.js').then(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs-3.11.174/pdf.worker.min.js'; return window.pdfjsLib; }); return pdfjsP; }
  async function pdflib() { if (window.PDFLib) return window.PDFLib; await loadScript('/vendor/pdf-lib-1.17.1.min.js'); return window.PDFLib; }

  /* ------------------------------------------------------------ icons (simple line icons, 24px) */
  const ICON = {
    upload: '<path d="M12 16V4m0 0l-4.5 4.5M12 4l4.5 4.5"/><path d="M4 15v3.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V15"/>',
    image: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M3.5 17l5-5 4 4 3-3 5 5"/>',
    arch: '<path d="M3 20h18M5 20V9l7-5 7 5v11"/><path d="M9.5 20v-5h5v5"/>', geo: '<path d="M4 18L12 4l8 14z"/><circle cx="12" cy="14" r="2.2"/>',
    int: '<path d="M4 13v5M20 13v5M4 15h16M6 13v-3a2 2 0 012-2h8a2 2 0 012 2v3"/>', mat: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    views: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>', pres: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    export: '<path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5"/><path d="M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16"/>', undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 010 12" transform="translate(0 -6)"/>', redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 000 12" transform="translate(0 -6)"/>',
    select: '<path d="M5 3l14 8-6 2-2 6z"/>', share: '<circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.2 11l7.6-3.9M8.2 13l7.6 3.9"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z"/>', send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
    props: '<path d="M4 6h16M4 12h16M4 18h10"/>', floors: '<path d="M3 8l9-4 9 4-9 4z"/><path d="M3 12l9 4 9-4M3 16l9 4 9-4"/>', dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>', camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8.5 7l1.5-2.5h4L15.5 7"/>', north: '<path d="M12 3l5 16-5-4-5 4z"/>',
  };
  const ico = (k, cls) => `<svg class="dws-ico ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON[k] || ''}</svg>`;

  /* ============================================================ plan thumbnails */
  function thumbSVG(model) {
    try {
      const m = D().normalizeModel(JSON.parse(JSON.stringify(model || {})));
      if (!m.walls.length && !(m.items || []).length) return '';
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const take = p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); };
      const polys = m.walls.map(w => { const o = D().wallOutline(m, w); const P = [o.outerA, o.outerB, o.innerB, o.innerA]; P.forEach(take); return P; });
      if (!polys.length) return '';
      const pad = Math.max(x1 - x0, y1 - y0) * 0.08;
      return `<svg viewBox="${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${polys.map(P => `<polygon points="${P.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')}"/>`).join('')}</svg>`;
    } catch (_e) { return ''; }
  }
  const ago = d => { const s = (Date.now() - new Date(d).getTime()) / 1000; if (!(s >= 0)) return ''; if (s < 90) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + 'h ago'; if (s < 86400 * 30) return Math.round(s / 86400) + 'd ago'; return new Date(d).toLocaleDateString(); };
  const kindOf = m => { const s = (m && m.ws && m.ws.source) || {}; if (s.kind === 'dxf') return 'Imported DXF'; if (s.kind === 'pdf') return 'Imported PDF'; if (s.kind === 'concept') return 'Image concept'; if (s.path || s.read_with) return 'From a picture'; return 'Drawing'; };

  /* ============================================================ start screen */
  async function renderStart(w, c, opts) {
    opts = opts || {};
    const old = $q(w, '.du-draw-start');
    // the old start grid stays in the page, hidden, so its handlers (example plan, project list) still work
    const keep = old ? old.outerHTML && old : null;
    const hidden = document.createElement('div'); hidden.hidden = true; hidden.className = 'dws-legacy'; if (keep) hidden.appendChild(keep);
    const head = $q(w, '.du-work-head'); if (head) hidden.appendChild(head);
    const projSel = $q(hidden, '#dn-proj');
    let list = [];
    try { const { data } = await sb().from('drawings').select('id,name,updated_at,model,project_thread_id').eq('owner_id', c.user.id).order('updated_at', { ascending: false }).limit(12); list = data || []; } catch (_e) { list = []; }
    w.innerHTML = '';
    w.classList.add('dws-startpage');
    w.insertAdjacentHTML('beforeend', `<section class="dws-start" aria-labelledby="dws-h">
      <header class="dws-start-head"><span class="dws-kicker">DRAW STUDIO · IMPORT · IMAGINE · DEVELOP · VISUALIZE · PRESENT</span>
        <h1 id="dws-h">What Will You Create Today?</h1>
        <p>Transform existing drawings or turn visual inspiration into an architectural design.</p></header>
      <div class="dws-cards">
        <article class="dws-card dws-card-import" id="dws-card-import">
          <div class="dws-card-ico">${ico('upload')}</div>
          <h2>Import a Drawing</h2>
          <p>Upload an existing floor plan, CAD file, or architectural drawing and transform it into an editable 3D design.</p>
          <label class="dws-drop" id="dws-drop"><input type="file" id="dws-file" accept=".dxf,.pdf,.png,.jpg,.jpeg,.webp,.svg,.dwg,.rvt,.skp,.ifc,.fbx,.dae,application/pdf,image/*"><span>Drop a file here or</span></label>
          <button type="button" class="dws-btn primary" id="dws-import">Import Drawing</button>
          <p class="dws-fine">Works now: <b>DXF</b>, <b>PDF</b> (vector or scanned), <b>PNG</b>, <b>JPG</b>, <b>SVG</b>. DWG: save as DXF first. IFC, FBX and DAE are not supported yet.</p>
        </article>
        <article class="dws-card dws-card-image" id="dws-card-image">
          <div class="dws-card-ico">${ico('image')}</div>
          <h2>Create From an Image <span class="dws-badge">Limited preview</span></h2>
          <p>Upload a photograph, sketch, or inspiration image. Describe your vision and let DrawUp generate a starting design.</p>
          <button type="button" class="dws-btn primary" id="dws-image">Create Design</button>
          <p class="dws-fine">Today this reads the layout it can see in your picture into an editable plan, with every size marked as assumed. Full concept design from an image is coming next.</p>
        </article>
      </div>
      <section class="dws-recent" aria-labelledby="dws-rh"><div class="dws-recent-head"><h2 id="dws-rh">Recent Projects</h2>${list.length ? `<a href="#portal/draw?id=${esc(list[0].id)}" class="dws-link" id="dws-viewall">Open latest →</a>` : ''}</div>
        ${list.length ? `<div class="dws-recent-grid">${list.slice(0, 8).map(d => `<article class="dws-rcard" data-id="${esc(d.id)}"><button type="button" class="dws-rthumb" data-open="${esc(d.id)}" aria-label="Open ${esc(d.name)}">${thumbSVG(d.model) || ico('cube', 'big')}</button>
          <div class="dws-rmeta"><b title="${esc(d.name)}">${esc(d.name)}</b><span>${esc(ago(d.updated_at))} · ${esc(kindOf(d.model))}</span></div>
          <button type="button" class="dws-rmore" data-more="${esc(d.id)}" aria-label="More for ${esc(d.name)}" aria-haspopup="menu">${ico('dots')}</button></article>`).join('')}</div>`
          : `<div class="dws-empty"><p><b>No drawings yet.</b> Import one or create one from an image above. Your drawings show here.</p></div>`}
      </section>
      <p class="dws-start-links"><button type="button" class="dws-link" id="dws-example">Open the example plan</button> · <button type="button" class="dws-link" id="dws-markup">Mark up a file</button>${projSel ? ` · <label class="dws-projpick">Project <span id="dws-projslot"></span></label>` : ''}</p>
    </section>`);
    w.appendChild(hidden);
    if (projSel) { $q(w, '#dws-projslot').appendChild(projSel); if (opts.project) projSel.value = opts.project; }
    const project = () => (projSel && projSel.value) || null;
    const fileIn = $q(w, '#dws-file');
    $q(w, '#dws-import').onclick = () => fileIn.click();
    fileIn.onchange = () => { const f = fileIn.files[0]; fileIn.value = ''; if (f) importFile(c, f, { project: project() }); };
    const drop = $q(w, '#dws-card-import');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) importFile(c, f, { project: project() }); });
    $q(w, '#dws-image').onclick = () => createFromImage(c, { project: project() });
    $q(w, '#dws-example').onclick = () => { const b = $q(hidden, '#dn-sample'); if (b) b.click(); else createDrawing(c, D().samplePlan(), { name: 'Example Plan', project: project() }); };
    $q(w, '#dws-markup').onclick = () => { history.replaceState(null, '', '#portal/draw?markup=new'); c.openPortalTab('draw'); };
    $$(w, '[data-open]').forEach(b => b.onclick = () => { history.replaceState(null, '', '#portal/draw?id=' + b.dataset.open); c.openPortalTab('draw'); });
    $$(w, '[data-more]').forEach(b => b.onclick = e => { e.stopPropagation(); recentMenu(c, b, list.find(d => d.id === b.dataset.more)); });
    if (opts.mode === 'import') { drop.classList.add('focus'); setTimeout(() => $q(w, '#dws-import').focus(), 50); }
    if (opts.mode === 'image') setTimeout(() => createFromImage(c, { project: project() }), 50);
  }
  function recentMenu(c, btn, d) {
    document.getElementById('dws-menu')?.remove(); if (!d) return;
    const r = btn.getBoundingClientRect();
    document.body.insertAdjacentHTML('beforeend', `<div class="dws-menu" id="dws-menu" role="menu" style="top:${Math.round(r.bottom + 6 + scrollY)}px;left:${Math.round(Math.max(8, r.right - 190) + scrollX)}px"><button role="menuitem" data-a="open">Open</button><button role="menuitem" data-a="rename">Rename…</button><button role="menuitem" data-a="dup">Duplicate</button><button role="menuitem" data-a="del" class="bad">Delete…</button></div>`);
    const M = document.getElementById('dws-menu'), close = () => { M.remove(); document.removeEventListener('mousedown', out); }, out = e => { if (!M.contains(e.target)) close(); };
    setTimeout(() => document.addEventListener('mousedown', out), 0);
    $$(M, '[data-a]').forEach(b => b.onclick = async () => {
      close(); const a = b.dataset.a;
      try {
        if (a === 'open') { history.replaceState(null, '', '#portal/draw?id=' + d.id); c.openPortalTab('draw'); }
        else if (a === 'rename') { const n = prompt('Rename drawing', d.name); if (!n || !n.trim()) return; const { error } = await sb().from('drawings').update({ name: n.trim().slice(0, 120) }).eq('id', d.id).eq('owner_id', c.user.id); if (error) throw error; c.openPortalTab('draw'); }
        else if (a === 'dup') { const { data: full, error: e1 } = await sb().from('drawings').select('*').eq('id', d.id).eq('owner_id', c.user.id).single(); if (e1) throw e1; await createDrawing(c, full.model, { name: (full.name + ' (copy)').slice(0, 120), project: full.project_thread_id, sheet: full.sheet_number, reason: 'duplicate' }); }
        else if (a === 'del') { if (!confirm(`Delete "${d.name}"? This cannot be undone.`)) return; const { error } = await sb().from('drawings').delete().eq('id', d.id).eq('owner_id', c.user.id); if (error) throw error; c.openPortalTab('draw'); }
      } catch (x) { toast(c, (x.message || String(x)), true); }
    });
  }
  async function createDrawing(c, model, o) {
    o = o || {};
    const { data, error } = await sb().from('drawings').insert({ owner_id: c.user.id, name: o.name || 'Floor Plan', sheet_number: o.sheet || 'A101', project_thread_id: o.project || null, model }).select('id').single();
    if (error) throw error;
    try { await sb().from('drawing_versions').insert({ drawing_id: data.id, owner_id: c.user.id, revision: 1, reason: o.reason || 'import', label: String(o.label || 'Imported').slice(0, 120), model, geom_hash: G() ? G().geomHash(model) : null }); } catch (_e) { /* history table optional */ }
    history.replaceState(null, '', '#portal/draw?id=' + data.id + (o.open ? '&open=' + o.open : '')); c.openPortalTab('draw');
    return data.id;
  }

  /* ============================================================ Create From an Image (limited) */
  function createFromImage(c, o) {
    const W = WS(); if (!W || !W.wizard) { toast(c, 'The picture reader did not load. Refresh the page and try again.', true); return; }
    W.wizard(c, { project: o.project || null, kind: 'photo', method: 'ai', file: o.file || null });
    const card = document.getElementById('dw29-wiz'); if (card) { card.classList.add('dws-wiz'); const k = $q(card, '.du-kicker'); if (k) k.textContent = 'DRAW STUDIO · CREATE FROM AN IMAGE · LIMITED PREVIEW'; }
  }

  /* ============================================================ Import a Drawing */
  async function importFile(c, file, o) {
    o = o || {};
    if (file.size > MAX_MB * 1024 * 1024) { toast(c, `That file is ${Math.round(file.size / 1048576)} MB. The limit is ${MAX_MB} MB.`, true); return; }
    const head = await file.slice(0, 2048).text().catch(() => '');
    const kind = IM().detect(file.name, head), fmt = IM().FORMATS[kind];
    if (!kind) { notSupported(c, file, null, 'DrawUp could not tell what kind of file this is. Import a DXF, PDF, PNG, JPG or SVG.'); return; }
    if (!fmt.ok) { notSupported(c, file, fmt, fmt.why || `${fmt.name} import is not available yet. For now, export a DXF or PDF of the plans from your design software and import that.`); return; }
    if (fmt.kind === 'image') { WS().wizard(c, { project: o.project, kind: 'floor_plan', file }); return; }
    if (kind === 'svg') { try { const png = await svgFileToPng(file); WS().wizard(c, { project: o.project, kind: 'floor_plan', file: png }); } catch (x) { toast(c, x.message || String(x), true); } return; }
    if (kind === 'dxf') return importDXF(c, file, o);
    if (kind === 'pdf') return importPDF(c, file, o);
  }
  function notSupported(c, file, fmt, why) {
    const M = modal('dws-imp', `<span class="dws-kicker">IMPORT A DRAWING</span><h2>${esc(fmt ? fmt.name : 'Unknown file')}</h2><p class="dws-file">${esc(file.name)}</p><p>${esc(why)}</p><div class="dws-row"><button type="button" class="dws-btn primary" id="dws-ns-ok">Choose another file</button></div>`);
    $q(M.body, '#dws-ns-ok').onclick = () => { M.close(); start('import'); };
  }
  async function svgFileToPng(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('This SVG could not be read.')); i.src = url; });
      const k = 2400 / Math.max(img.naturalWidth || 1200, img.naturalHeight || 900), cv = document.createElement('canvas'); cv.width = Math.round((img.naturalWidth || 1200) * k); cv.height = Math.round((img.naturalHeight || 900) * k);
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
      const blob = await new Promise(r => cv.toBlob(r, 'image/png')); return new File([blob], file.name.replace(/\.svg$/i, '') + '.png', { type: 'image/png' });
    } finally { URL.revokeObjectURL(url); }
  }
  async function uploadOriginal(c, file) {
    const safe = file.name.replace(/[^\w.-]+/g, '-').slice(-80), path = `${c.user.id}/draw/imports/${uuid()}-${safe}`;
    const up = await sb().storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' }); if (up.error) throw up.error; return path;
  }

  /* ---------- DXF */
  async function importDXF(c, file, o) {
    let text = ''; try { text = await file.text(); } catch (_e) { toast(c, 'The file could not be read.', true); return; }
    let ins; try { ins = IM().inspectDXF(text); } catch (x) { notSupported(c, file, IM().FORMATS.dxf, x.message || String(x)); return; }
    const choice = ins.dxf.unitScale ? 'file' : (IM().UNIT_CHOICES.find(u => Math.abs(u[2] - ins.unit) < 1e-9) || ['in'])[0];
    review(c, file, { kind: 'dxf', ins, project: o.project, unitChoice: choice, geo: ins.geo, flipY: true });
  }

  /* ---------- PDF: page picker, then vector linework or the picture reader */
  async function importPDF(c, file, o) {
    const M = modal('dws-imp', `<span class="dws-kicker">IMPORT A DRAWING · PDF</span><h2>Pick the page to import</h2><p class="dws-file">${esc(file.name)}</p><div class="dws-pages" id="dws-pages"><p class="dws-muted">Reading the PDF…</p></div>`, 'wide');
    try {
      const L = await pdfjs(), doc = await L.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise, n = doc.numPages, box = $q(M.body, '#dws-pages');
      box.innerHTML = `<p class="dws-muted">${n} page${n > 1 ? 's' : ''}. Pick a floor plan sheet.</p><div class="dws-pgrid">${Array.from({ length: Math.min(n, 60) }, (_, i) => `<button type="button" class="dws-pg" data-pg="${i + 1}"><canvas></canvas><span>Page ${i + 1}</span></button>`).join('')}</div>${n > 60 ? '<p class="dws-muted">Only the first 60 pages are shown.</p>' : ''}`;
      const render = async i => { const pg = await doc.getPage(i), vp = pg.getViewport({ scale: 1 }), k = 200 / Math.max(vp.width, vp.height), v2 = pg.getViewport({ scale: k }), cv = $q(box, `[data-pg="${i}"] canvas`); if (!cv) return; cv.width = v2.width; cv.height = v2.height; await pg.render({ canvasContext: cv.getContext('2d'), viewport: v2 }).promise; };
      (async () => { for (let i = 1; i <= Math.min(n, 60); i++) { if (!document.body.contains(M.el)) return; try { await render(i); } catch (_e) { /* thumbnail only */ } } })();
      $$(box, '[data-pg]').forEach(b => b.onclick = async () => { b.disabled = true; b.classList.add('busy'); try { await pdfPage(c, file, doc, +b.dataset.pg, o, M); } catch (x) { toast(c, x.message || String(x), true); b.disabled = false; b.classList.remove('busy'); } });
      if (n === 1) $q(box, '[data-pg="1"]').click();
    } catch (x) { $q(M.body, '#dws-pages').innerHTML = `<p class="dws-warn">This PDF could not be opened: ${esc(x.message || x)}</p>`; }
  }
  /** Linework of one PDF page in PDF points (1/72 in on paper), y down. */
  async function pdfLines(L, page) {
    const vp = page.getViewport({ scale: 1 }), ops = await page.getOperatorList(), O = L.OPS, segs = [], arcs = [];
    let ctm = vp.transform.slice(); const stack = [];
    const mulM = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    const P = (x, y) => ({ x: ctm[0] * x + ctm[2] * y + ctm[4], y: ctm[1] * x + ctm[3] * y + ctm[5] });
    let images = 0, paths = 0;
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], args = ops.argsArray[i];
      if (fn === O.save) stack.push(ctm.slice()); else if (fn === O.restore) ctm = stack.pop() || ctm;
      else if (fn === O.transform) ctm = mulM(ctm, args);
      else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || fn === O.paintJpegXObject) images++;
      else if (fn === O.constructPath) {
        const [sub, co] = args; let k = 0, cur = null, start = null; paths++;
        for (const op of sub) {
          if (op === O.moveTo) { cur = P(co[k], co[k + 1]); start = cur; k += 2; }
          else if (op === O.lineTo) { const p = P(co[k], co[k + 1]); if (cur) segs.push({ a: cur, b: p, layer: 'pdf' }); cur = p; k += 2; }
          else if (op === O.curveTo) { const c1 = P(co[k], co[k + 1]), c2 = P(co[k + 2], co[k + 3]), p = P(co[k + 4], co[k + 5]); if (cur) { let prev = cur; for (let j = 1; j <= 8; j++) { const t = j / 8, u = 1 - t, q = { x: u * u * u * cur.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p.x, y: u * u * u * cur.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p.y }; segs.push({ a: prev, b: q, layer: 'pdf-curve' }); prev = q; } const ch = Math.hypot(p.x - cur.x, p.y - cur.y); if (ch > 1) arcs.push({ c: cur, r: ch / Math.SQRT2, layer: 'pdf', approx: true, end: p }); } cur = p; k += 6; }
          else if (op === O.curveTo2 || op === O.curveTo3) { const p = P(co[k + 2], co[k + 3]); if (cur) segs.push({ a: cur, b: p, layer: 'pdf-curve' }); cur = p; k += 4; }
          else if (op === O.closePath) { if (cur && start) segs.push({ a: cur, b: start, layer: 'pdf' }); cur = start; }
          else if (op === O.rectangle) { const x = co[k], y = co[k + 1], w = co[k + 2], h = co[k + 3], a = P(x, y), b = P(x + w, y), c2 = P(x + w, y + h), d = P(x, y + h); segs.push({ a, b, layer: 'pdf' }, { a: b, b: c2, layer: 'pdf' }, { a: c2, b: d, layer: 'pdf' }, { a: d, b: a, layer: 'pdf' }); k += 4; }
        }
      }
      if (segs.length > 120000) break;
    }
    const tc = await page.getTextContent(); const texts = tc.items.filter(t => t.str && t.str.trim()).map(t => { const m = mulM(vp.transform, t.transform); return { at: { x: m[4], y: m[5] }, text: t.str.trim(), h: Math.hypot(m[2], m[3]), layer: 'pdf-text' }; });
    return { segs: segs.filter(s => Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y) > 0.05), arcs, texts, images, paths, size: { w: vp.width, h: vp.height } };
  }
  const SCALES = [['96', '1/8" = 1\'-0"', 96], ['64', '3/16" = 1\'-0"', 64], ['48', '1/4" = 1\'-0"', 48], ['32', '3/8" = 1\'-0"', 32], ['24', '1/2" = 1\'-0"', 24], ['16', '3/4" = 1\'-0"', 16], ['12', '1" = 1\'-0"', 12], ['192', '1/16" = 1\'-0"', 192], ['m50', '1:50', 50], ['m100', '1:100', 100], ['m200', '1:200', 200], ['m500', '1:500', 500]];
  function scaleFromText(texts) {
    const all = texts.map(t => t.text).join(' ');
    let m = /(\d+)\s*\/\s*(\d+)\s*"?\s*=\s*1\s*'\s*-?\s*0?\s*"?/.exec(all); if (m) return { den: Math.round(12 / (+m[1] / +m[2])), text: m[0] };
    m = /\b1\s*"\s*=\s*(\d+)\s*'/.exec(all); if (m) return { den: 12 * +m[1], text: m[0] };
    m = /\b1\s*:\s*(\d{2,4})\b/.exec(all); if (m) return { den: +m[1], text: m[0] };
    return null;
  }
  async function pdfPage(c, file, doc, n, o, M) {
    const L = await pdfjs(), page = await doc.getPage(n), lines = await pdfLines(L, page);
    const vector = lines.segs.length >= 200 || (lines.segs.length >= 12 && lines.images === 0);
    if (!vector) {
      // a scanned sheet: hand it to the picture reader with this page
      M.close(); const W = WS(); const wz = W.wizard(c, { project: o.project, kind: 'floor_plan', file });
      try { if (wz && wz.state && n > 1) { await sleep(400); const pg = $q(wz.el, '#dw29-pg'); if (pg) { pg.value = n; pg.dispatchEvent(new Event('change')); } } } catch (_e) { /* the member picks the page */ }
      toast(c, `Page ${n} is a scanned picture, not linework, so DrawUp reads it as a picture.`);
      return;
    }
    const found = scaleFromText(lines.texts);
    const sc = found ? (SCALES.find(s => s[2] === found.den && (s[0].startsWith('m') === /:/.test(found.text))) || null) : null;
    M.close();
    review(c, file, { kind: 'pdf', page: n, pages: doc.numPages, lines, project: o.project, scaleKey: sc ? sc[0] : '48', scaleFound: found, flipY: false });
  }

  /* ---------- the import review: confirm units, scale, floors and heights before anything is created */
  function review(c, file, st) {
    const U = IM().UNIT_CHOICES;
    st.wallH = st.wallH || "10'-0\""; st.partH = st.partH || "9'-0\""; st.floors = st.floors || 1; st.f2f = st.f2f || "12'-0\""; st.minT = st.minT || '2"'; st.maxT = st.maxT || "2'-0\""; st.name = st.name || file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80); st.north = st.north || 0; st.copy = st.copy || 'exterior';
    const M = modal('dws-imp', '', 'wide review');
    // PDF: 1 pt = 1/72 in on paper; at 1/4" = 1'-0" (1:48) that is 48/72 in real; at 1:100 it is 100/72 in real
    const unitIn = () => { if (st.kind === 'pdf') return (SCALES.find(x => x[0] === st.scaleKey) || SCALES[2])[2] / 72; if (st.unitChoice === 'file') return st.ins.dxf.unitScale; return (U.find(u => u[0] === st.unitChoice) || U[0])[2]; };
    const convert = () => {
      const geo = st.kind === 'dxf' ? st.geo : { segs: st.lines.segs, arcs: st.lines.arcs, texts: st.lines.texts };
      const unitConfirmed = st.kind === 'dxf' ? (st.unitChoice === 'file' || !!st.unitOK) : !!st.unitOK;
      const unitNote = st.kind === 'dxf' ? (st.unitChoice === 'file' ? `Units from the file: ${st.ins.dxf.unitName}.` : `Units set to ${(U.find(u => u[0] === st.unitChoice) || U[0])[1].toLowerCase()} (${st.ins.unitWhy}).`) : `Drawing scale ${(SCALES.find(x => x[0] === st.scaleKey) || SCALES[2])[1]}${st.scaleFound ? ' (read from the sheet)' : ' (chosen in import)'}.`;
      return IM().toModel(geo, { unit: unitIn(), flipY: st.flipY, wallHeight: parseLen(st.wallH) || 120, partitionHeight: parseLen(st.partH) || 108, minT: parseLen(st.minT) || 2, maxT: parseLen(st.maxT) || 24, unitConfirmed, unitNote, heightConfirmed: !!st.heightOK });
    };
    const draw = () => {
      let res; try { res = convert(); } catch (x) { M.body.innerHTML = `<p class="dws-warn">This drawing could not be converted: ${esc(x.message || x)}</p>`; return; }
      st.res = res; const m = res.model, r = res.report;
      let size = ''; if (m.walls.length) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; m.walls.forEach(w => { const ol = D().wallOutline(m, w); [ol.outerA, ol.outerB, ol.innerA, ol.innerB].forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }); }); size = `${ftin(x1 - x0)} × ${ftin(y1 - y0)}`; }
      const cls = r.walls ? 'Editable architectural model' : r.lines ? 'Editable geometry' : 'Nothing recognised';
      const info = st.kind === 'dxf' ? `DXF ${esc(st.ins.version || '')} · ${Object.keys(st.ins.layers).length} layers · ${st.geo.segs.length} lines` : `PDF page ${st.page} of ${st.pages} · ${st.lines.segs.length} vector lines`;
      const unitsUI = st.kind === 'dxf'
        ? `<div class="dws-field"><label for="dws-units">Drawing units</label><select id="dws-units">${st.ins.dxf.unitScale ? `<option value="file"${st.unitChoice === 'file' ? ' selected' : ''}>From the file: ${esc(st.ins.dxf.unitName)}</option>` : ''}${U.map(u => `<option value="${u[0]}"${st.unitChoice === u[0] ? ' selected' : ''}>${u[1]}</option>`).join('')}</select><small>${st.ins.dxf.unitScale ? 'Read from the file header.' : esc('Not set in the file; ' + st.ins.unitWhy + '.')}</small></div>`
        : `<div class="dws-field"><label for="dws-scale">Drawing scale</label><select id="dws-scale">${SCALES.map(s => `<option value="${s[0]}"${st.scaleKey === s[0] ? ' selected' : ''}>${esc(s[1])}</option>`).join('')}</select><small>${st.scaleFound ? esc('Found on the sheet: "' + st.scaleFound.text + '".') : 'No scale note found on the sheet. Check the overall size below against a known dimension.'}</small></div>`;
      M.body.innerHTML = `<span class="dws-kicker">IMPORT A DRAWING · REVIEW</span><h2>Check what DrawUp found</h2>
        <div class="dws-rv"><div class="dws-rv-stage"><div class="dws-rv-svg" id="dws-rv-svg"></div><p class="dws-muted">Preview of the plan DrawUp will create. Walls, doors and windows are real objects you can edit; grey lines are kept as editable linework.</p></div>
        <aside class="dws-rv-side">
          <p class="dws-file">${esc(file.name)} <span class="dws-chip">${esc(IM().FORMATS[st.kind].name)}</span></p><p class="dws-muted">${info}</p>
          <div class="dws-found"><span><b>${r.walls}</b> walls</span><span><b>${r.doors}</b> doors</span><span><b>${r.windows}</b> windows</span><span><b>${r.openings}</b> openings</span><span><b>${r.rooms}</b> rooms</span><span><b>${r.lines}</b> other lines</span></div>
          <p class="dws-class"><span class="dws-chip ${r.walls ? 'ok' : 'warn'}">${cls}</span> ${size ? 'Overall about <b>' + esc(size) + '</b>.' : ''}</p>
          <h3>Scale and units</h3>${unitsUI}
          <label class="dws-check"><input type="checkbox" id="dws-unitok"${st.unitOK || (st.kind === 'dxf' && st.unitChoice === 'file') ? ' checked' : ''}${st.kind === 'dxf' && st.unitChoice === 'file' ? ' disabled' : ''}> The overall size is right</label>
          <h3>Building</h3>
          <div class="dws-two"><div class="dws-field"><label for="dws-name">Drawing name</label><input id="dws-name" value="${esc(st.name)}" maxlength="80"></div><div class="dws-field"><label for="dws-north">North (degrees from up)</label><input id="dws-north" type="number" min="-180" max="180" step="1" value="${esc(st.north)}"></div></div>
          <div class="dws-two"><div class="dws-field"><label for="dws-floors">Number of floors</label><input id="dws-floors" type="number" min="1" max="60" value="${esc(st.floors)}"></div><div class="dws-field"><label for="dws-f2f">Floor-to-floor height</label><input id="dws-f2f" value="${esc(st.f2f)}"></div></div>
          ${st.floors > 1 ? `<div class="dws-field"><label for="dws-copy">Upper floors start with</label><select id="dws-copy"><option value="exterior"${st.copy === 'exterior' ? ' selected' : ''}>The exterior walls and windows</option><option value="all"${st.copy === 'all' ? ' selected' : ''}>A copy of this whole floor</option><option value="none"${st.copy === 'none' ? ' selected' : ''}>Nothing (empty floors)</option></select></div>` : ''}
          <div class="dws-two"><div class="dws-field"><label for="dws-wh">Exterior wall height</label><input id="dws-wh" value="${esc(st.wallH)}"></div><div class="dws-field"><label for="dws-ph">Partition height</label><input id="dws-ph" value="${esc(st.partH)}"></div></div>
          <label class="dws-check"><input type="checkbox" id="dws-hok"${st.heightOK ? ' checked' : ''}> These heights are confirmed (not assumptions)</label>
          <details class="dws-adv"><summary>Wall recognition</summary><div class="dws-two"><div class="dws-field"><label for="dws-mint">Thinnest wall</label><input id="dws-mint" value="${esc(st.minT)}"></div><div class="dws-field"><label for="dws-maxt">Thickest wall</label><input id="dws-maxt" value="${esc(st.maxT)}"></div></div><small>Two parallel lines this far apart are read as one wall.</small></details>
          ${r.notes.length || (st.ins && st.ins.warnings.length) ? `<h3>Notes</h3><ul class="dws-notes">${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}${(st.ins ? st.ins.warnings : []).map(wn => `<li>${esc(warnText(wn))}</li>`).join('')}</ul>` : ''}
          <h3>Assumptions to confirm (${r.assumptions.filter(a => a.status !== 'confirmed').length})</h3><ul class="dws-notes">${r.assumptions.map(a => `<li><span class="dws-chip ${a.status === 'confirmed' ? 'ok' : 'warn'}">${a.status === 'confirmed' ? 'Confirmed' : 'Assumed'}</span> ${esc(a.text)}</li>`).join('')}${r.unknowns.map(u => `<li><span class="dws-chip">Check</span> ${esc(u.text)}</li>`).join('')}</ul>
          <p class="dws-warn" id="dws-err" hidden></p>
          <div class="dws-row"><button type="button" class="dws-btn primary" id="dws-create" ${r.walls || r.lines ? '' : 'disabled'}>Create model and open studio</button><button type="button" class="dws-btn ghost" id="dws-back">Choose another file</button></div>
        </aside></div>`;
      const stage = $q(M.body, '#dws-rv-svg');
      try { stage.innerHTML = D().toSVG(m, 96, { ink: '#142337', poche: '#c8d4e2', paper: '#ffffff' }); const s = $q(stage, 'svg'); s.setAttribute('width', '100%'); s.setAttribute('height', '100%'); } catch (_e) { stage.innerHTML = '<p class="dws-muted">No preview.</p>'; }
      const on = (id, k, ev, f) => { const e = $q(M.body, id); if (e) e.addEventListener(ev || 'change', () => { st[k] = f ? f(e) : e.value; draw(); }); };
      on('#dws-units', 'unitChoice'); on('#dws-scale', 'scaleKey'); on('#dws-unitok', 'unitOK', 'change', e => e.checked); on('#dws-hok', 'heightOK', 'change', e => e.checked);
      on('#dws-floors', 'floors', 'change', e => Math.max(1, Math.min(60, Math.round(+e.value || 1)))); on('#dws-copy', 'copy');
      ['#dws-wh:wallH', '#dws-ph:partH', '#dws-f2f:f2f', '#dws-mint:minT', '#dws-maxt:maxT'].forEach(x => { const [id, k] = x.split(':'); const e = $q(M.body, id); if (e) e.addEventListener('change', () => { if (!(parseLen(e.value) > 0)) { e.classList.add('bad'); return; } st[k] = e.value; draw(); }); });
      $q(M.body, '#dws-name').oninput = e => { st.name = e.target.value; };
      $q(M.body, '#dws-north').onchange = e => { st.north = Math.max(-180, Math.min(180, +e.target.value || 0)); };
      $q(M.body, '#dws-back').onclick = () => { M.close(); start('import'); };
      $q(M.body, '#dws-create').onclick = async () => {
        const b = $q(M.body, '#dws-create'); b.disabled = true; b.textContent = 'Creating…';
        try {
          const model = st.res.model, f2f = parseLen(st.f2f) || 144;
          model.ws.source = { kind: st.kind, name: file.name, size: file.size, page: st.page || null, units: st.kind === 'dxf' ? (st.unitChoice === 'file' ? st.ins.dxf.unitName : st.unitChoice) : (SCALES.find(x => x[0] === st.scaleKey) || [])[1], unit_confirmed: !!(st.unitOK || st.unitChoice === 'file'), imported_at: new Date().toISOString(), report: { walls: st.res.report.walls, doors: st.res.report.doors, windows: st.res.report.windows, rooms: st.res.report.rooms, lines: st.res.report.lines } };
          model.ws.building = { name: st.name, north: +st.north || 0, units: 'imperial' };
          if (st.floors > 1 || f2f) {
            model.level = { name: 'LEVEL 1', elev: 0, height: f2f };
            for (let i = 1; i < st.floors; i++) F().addFloor(model, { height: f2f, copy: st.copy });
            if (st.floors > 1) F().switchTo(model, F().levels(model)[0].id);
            model.ws.assumptions.push({ id: 'im_floors', kind: 'height', status: st.heightOK ? 'confirmed' : 'assumed', text: `${st.floors} floor${st.floors > 1 ? 's' : ''} at ${ftin(f2f)} floor to floor.${st.floors > 1 ? ' Upper floors were started from ' + (st.copy === 'all' ? 'a copy of the imported floor.' : st.copy === 'none' ? 'nothing.' : 'its exterior walls and windows.') : ''}` });
          }
          try { model.ws.source.path = await uploadOriginal(c, file); } catch (_e) { model.ws.source.path = null; model.ws.source.note = 'The original file could not be stored; the drawing was still created.'; }
          M.close();
          await createDrawing(c, model, { name: st.name || 'Imported Plan', project: st.project, label: 'Imported from ' + file.name, open: 'imported' });
        } catch (x) { const e = $q(M.body, '#dws-err'); if (e) { e.hidden = false; e.textContent = 'Not created — ' + (x.message || x); } b.disabled = false; b.textContent = 'Create model and open studio'; }
      };
    };
    draw();
  }
  function warnText(wn) {
    if (wn === 'too_many') return 'The drawing is very large; only the first 60,000 lines were read.';
    if (wn === 'spline') return 'Splines were read as their control points, so curves may be rougher than in the original.';
    if (/^3d:/.test(wn)) return `${wn.slice(3)} objects are 3D and were skipped. Import plans as 2D linework.`;
    if (/^hatch:/.test(wn)) return 'Hatch patterns were skipped. DrawUp draws its own wall patterns.';
    return wn;
  }

  /* ============================================================ the studio layout */
  const RAIL = [['arch', 'Architecture', 'arch'], ['geo', 'Geometry', 'geo'], ['int', 'Interiors', 'int'], ['mat', 'Materials', 'mat'], ['views', 'Views', 'views'], ['pres', 'Presentation', 'pres'], ['export', 'Export', 'export']];
  const PRESETS = [['iso', 'Perspective'], ['exterior', 'Exterior perspective'], ['interior', 'Interior perspective'], ['axo', 'Axonometric'], ['isometric', 'Isometric'], ['plan', 'Top-down 3D'], ['north', 'North elevation'], ['south', 'South elevation'], ['east', 'East elevation'], ['west', 'West elevation']];
  const LIGHTS = [['daylight', 'Daylight'], ['morning', 'Morning'], ['evening', 'Evening'], ['overcast', 'Overcast'], ['studio', 'Studio']];

  function extend(api, e) {
    const w = api.w, c = api.c, Dm = api.D;
    if (!F() || w.classList.contains('dws')) return e;
    w.classList.add('dws'); document.documentElement.classList.add('dws-on');
    const params = new URLSearchParams((location.hash.split('?')[1]) || '');
    const pick = s => $q(w, s);
    const move = (sel, into) => { const n = typeof sel === 'string' ? pick(sel) : sel; if (n && into) into.appendChild(n); return n; };
    const save = () => api.scheduleSave();
    const change = fn => { const before = JSON.stringify(api.model); try { fn(); } catch (x) { api.model = Dm.normalizeModel(JSON.parse(before)); toast(c, x.message || String(x), true); api.render(); return false; } api.pushUndo(before); api.render(); save(); return true; };
    // --- skeleton
    const head = pick('.du-draw-head'), bar = pick('.du-draw-bar20'), split = pick('.du-draw-split'), note = pick('.du-draw-note');
    const shell = document.createElement('div'); shell.className = 'dws-shell';
    shell.innerHTML = `<div class="dws-top" role="toolbar" aria-label="Studio">
        <div class="dws-titlebox"><span class="dws-kicker">DRAW STUDIO</span><div class="dws-titlerow" id="dws-titlerow"></div></div>
        <div class="dws-quick" id="dws-quick"></div>
        <div class="dws-seg dws-dim" role="group" aria-label="2D or 3D"><button type="button" data-dim="2d" class="on">2D</button><button type="button" data-dim="3d">3D</button></div>
        <div class="dws-slot" id="dws-viewslot"></div>
        <div class="dws-slot" id="dws-styleslot"></div>
        <div class="dws-floorpick" id="dws-floorpick"></div>
        <span class="dws-flex"></span>
        <span class="dws-save" id="dws-saveslot"></span>
        <button type="button" class="dws-btn primary sm" id="dws-share">${ico('share')}<span>Share</span></button>
        <button type="button" class="dws-btn ghost sm" id="dws-export">${ico('export')}<span>Export</span></button>
        <button type="button" class="dws-btn ghost sm dws-propsbtn" id="dws-propsbtn" aria-expanded="false">${ico('props')}<span>Properties</span></button>
      </div>
      <div class="dws-body">
        <nav class="dws-rail" aria-label="Tool groups">${RAIL.map(([k, l, i]) => `<button type="button" data-rail="${k}" aria-expanded="false" aria-controls="dws-fly">${ico(i)}<span>${l}</span></button>`).join('')}</nav>
        <aside class="dws-fly" id="dws-fly" hidden aria-label="Tools">${RAIL.map(([k, l]) => `<section class="dws-panel" data-panel="${k}" hidden><header><b>${l}</b><button type="button" class="dws-x sm" data-flyclose aria-label="Close">×</button></header><div class="dws-pbody"></div></section>`).join('')}</aside>
        <main class="dws-stage" id="dws-stage"><div class="dws-ctx" id="dws-ctx"></div></main>
        <aside class="dws-props" id="dws-props" aria-label="Properties"><div class="dws-ptabs" role="tablist"><button type="button" role="tab" data-ptab="sel" aria-selected="true">Selection</button><button type="button" role="tab" data-ptab="bld" aria-selected="false">Building</button></div><div class="dws-ppane" data-ppane="sel"></div><div class="dws-ppane" data-ppane="bld" hidden></div></aside>
      </div>
      <div class="dws-bottom"><div class="dws-toastslot" id="dws-toast" hidden></div><div class="dws-cambar" id="dws-cambar" hidden></div><div class="dws-coach" id="dws-coach"></div></div>`;
    w.insertBefore(shell, head || w.firstChild);
    const P = k => $q(shell, `[data-panel="${k}"] .dws-pbody`);
    // --- move the title and drawing list
    const title = head && $q(head, '#dw-title'), listSel = head && $q(head, '#dw-list'), newBtn = head && $q(head, '#dw-new');
    const tr = $q(shell, '#dws-titlerow'); if (title) tr.appendChild(title); if (listSel) tr.appendChild(listSel); if (newBtn) { newBtn.textContent = 'New'; newBtn.className = 'dws-btn ghost xs'; tr.appendChild(newBtn); }
    if (head) head.hidden = true;
    // --- quick: select, undo, redo
    const quick = $q(shell, '#dws-quick');
    const selBtn = pick('[data-tool="select"]'); if (selBtn) { selBtn.innerHTML = ico('select') + '<span class="sr">Select</span>'; selBtn.title = 'Select (V)'; quick.appendChild(selBtn); }
    const un = pick('#dw-undo'), re = pick('#dw-redo'); if (un) { un.innerHTML = ico('undo') + '<span class="sr">Undo</span>'; quick.appendChild(un); } if (re) { re.innerHTML = ico('redo') + '<span class="sr">Redo</span>'; quick.appendChild(re); }
    // --- view seg (Floor plan / Elevation / Section / 3D) and styles
    const viewSeg = pick('.dw21-seg[aria-label="View"]'); if (viewSeg) $q(shell, '#dws-viewslot').appendChild(viewSeg);
    const styleSeg = pick('.dw21-seg[aria-label="Drawing style"]'); if (styleSeg) $q(shell, '#dws-styleslot').appendChild(styleSeg);
    const saveEl = pick('#dw-save'); if (saveEl) $q(shell, '#dws-saveslot').appendChild(saveEl);
    // --- panels
    const tools = k => pick(`[data-tool="${k}"]`);
    ['wall', 'partition', 'door', 'window', 'cased', 'column', 'stair'].forEach(k => move(tools(k), P('arch')));
    move('#dw29-curve', P('arch'));
    P('arch').insertAdjacentHTML('beforeend', `<p class="dws-hint">Doors and windows sit in a wall: pick the tool, then click a wall. Floors, heights and the roof are in <button type="button" class="dws-link" data-goto="bld">Building</button>.</p>`);
    ['shape', 'dim', 'measure', 'text'].forEach(k => move(tools(k), P('geo')));
    const snaps = $$(w, '.dw21-snaps'); snaps.forEach(s => P('geo').appendChild(s));
    ['room', 'fixture'].forEach(k => move(tools(k), P('int')));
    move('#dw29-libbtn', P('int'));
    move('#dw29-fin', P('mat'));
    P('mat').insertAdjacentHTML('beforeend', '<div class="dws-swatches" id="dws-swatches"></div><p class="dws-hint">Finishes change colours and materials only. They never move geometry.</p>');
    move(tools('camera'), P('views'));
    move('.dw21-layers-wrap', P('views'));
    const scaleL = pick('#dw-scale') && pick('#dw-scale').closest('label'); if (scaleL) P('views').appendChild(scaleL);
    ['#dw29-as', '#dw29-hist', '#dw29-under'].forEach(s => move(s, P('views')));
    P('views').insertAdjacentHTML('beforeend', `<div class="dws-vlist">${PRESETS.map(([k, l]) => `<button type="button" class="dws-chipbtn" data-preset="${k}">${l}</button>`).join('')}</div><p class="dws-hint">3D views open the model in 3D. Elevations and sections cut from the plan are under Elevation / Section in the top bar.</p>`);
    move('#dw29-coach', P('pres')); move('#dw21-markup', P('pres'));
    P('pres').insertAdjacentHTML('beforeend', `<div class="dws-field"><label for="dws-light">Lighting</label><select id="dws-light">${LIGHTS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div><div class="dws-field"><label for="dws-bg">Background</label><select id="dws-bg"><option value="">Style default</option><option value="#ffffff">White</option><option value="#fff5ef">Soft cream</option><option value="#eef4fb">Soft sky</option><option value="#142337">Midnight navy</option></select></div><button type="button" class="dws-btn primary sm" id="dws-presbtn">Presentation export…</button>`);
    // export panel: the existing export menu items and the CD PDF / DXF / SVG buttons
    const expPop = pick('#dw29-exppop'); if (expPop) { expPop.hidden = false; expPop.classList.add('dws-explist'); P('export').appendChild(expPop); }
    const exb = pick('#dw29-exp'); if (exb) exb.hidden = true;
    P('export').insertAdjacentHTML('afterbegin', `<button type="button" class="dws-btn primary sm" id="dws-exp2">Presentation export…</button><p class="dws-hint">PNG, JPG and PDF at any size, with no toolbars or selection in the picture.</p><h4>CAD and print (CD style)</h4><div class="dws-row" id="dws-cadrow"></div><h4>More</h4>`);
    ['#dw-pdf', '#dw-dxf', '#dw-svg'].forEach(s => move(s, $q(shell, '#dws-cadrow')));
    // the old bars are now empty shells (or hold only options); keep the tool options line visible above the canvas
    const ctx = $q(shell, '#dws-ctx'); move('#dw-opt', ctx); move('#dw-hint', ctx);
    const kb = $$(w, '.du-draw-tools button').find(b => /shortcut/i.test(b.textContent)); if (kb) { kb.className = 'dws-btn ghost xs'; ctx.appendChild(kb); }
    // --- stage: the canvas, 3D, elevation view and library
    const stage = $q(shell, '#dws-stage'); if (split) stage.appendChild(split);
    const insp = pick('#dw-inspect'); if (insp) $q(shell, '[data-ppane="sel"]').appendChild(insp);
    if (bar) bar.classList.add('dws-oldbar'); if (note) { note.classList.add('dws-note'); }
    const banner = pick('#dw29-banner'); if (banner) stage.insertBefore(banner, stage.firstChild);
    // --- Arch Coach change bar (the existing command form, kept as is)
    const coach = $q(shell, '#dws-coach'), form = pick('#dw29-cmd');
    if (form) {
      coach.innerHTML = `<span class="dws-coach-tag">${ico('spark')}<span>Arch Coach</span></span>`; coach.appendChild(form);
      const inp = $q(form, 'input'); if (inp) { inp.placeholder = 'Tell DrawUp a change: "add a second floor at 12 feet", "show an axonometric view"'; }
      const sb2 = $q(form, 'button[type=submit]'); if (sb2) { sb2.innerHTML = ico('send') + '<span class="sr">Preview change</span>'; sb2.className = 'dws-send'; sb2.title = 'Preview the change'; }
      form.addEventListener('submit', ev => { const v = inp ? inp.value.trim() : ''; if (!v) return; const done = studioCommand(v); if (done) { ev.preventDefault(); ev.stopImmediatePropagation(); inp.value = ''; } }, true);
    }
    // --- rail behaviour
    const fly = $q(shell, '#dws-fly'); let open = store.get('dws-rail', null);
    const setRail = k => {
      open = k; store.set('dws-rail', k); fly.hidden = !k; shell.classList.toggle('dws-flyopen', !!k);
      $$(shell, '[data-rail]').forEach(b => { const on = b.dataset.rail === k; b.classList.toggle('on', on); b.setAttribute('aria-expanded', String(on)); });
      $$(shell, '[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== k; });
      if (k === 'mat') swatches();
    };
    $$(shell, '[data-rail]').forEach(b => b.onclick = () => setRail(open === b.dataset.rail ? null : b.dataset.rail));
    $$(shell, '[data-flyclose]').forEach(b => b.onclick = () => setRail(null));
    setRail(window.innerWidth < 900 ? null : (open || 'arch'));
    // picking a drawing tool on a phone closes the panel so the canvas is free
    fly.addEventListener('click', ev => { if (window.innerWidth < 900 && ev.target.closest('[data-tool]')) setRail(null); });
    // --- right panel tabs
    const ptab = k => { $$(shell, '[data-ptab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.ptab === k))); $$(shell, '[data-ppane]').forEach(p => { p.hidden = p.dataset.ppane !== k; }); if (k === 'bld') building(); };
    $$(shell, '[data-ptab]').forEach(b => b.onclick = () => ptab(b.dataset.ptab));
    shell.addEventListener('click', ev => { const g = ev.target.closest('[data-goto]'); if (g) { ptab(g.dataset.goto); shell.classList.add('dws-propsopen'); } });
    const pb = $q(shell, '#dws-propsbtn'); pb.onclick = () => { const on = !shell.classList.contains('dws-propsopen'); shell.classList.toggle('dws-propsopen', on); pb.setAttribute('aria-expanded', String(on)); };
    // --- 2D / 3D
    const is3D = () => w.classList.contains('dw29-3dmode');
    const sync = () => { const d3 = is3D(); $$(shell, '[data-dim]').forEach(b => b.classList.toggle('on', (b.dataset.dim === '3d') === d3)); $q(shell, '#dws-cambar').hidden = !d3; if (d3) cambar(); };
    $$(shell, '[data-dim]').forEach(b => b.onclick = () => { if (b.dataset.dim === '3d') { const t = pick('[data-view29="3d"]'); if (t) t.click(); } else { const t = pick('[data-view="plan"]'); if (t) t.click(); } setTimeout(sync, 30); });
    new MutationObserver(sync).observe(w, { attributes: true, attributeFilter: ['class'] });
    // --- Share and Export
    $q(shell, '#dws-share').onclick = () => { const s = pick('#dw21-share'); if (s) s.click(); };
    const expDlg = () => exportDialog(api, c, viewer); $q(shell, '#dws-export').onclick = expDlg; $q(shell, '#dws-exp2').onclick = expDlg; $q(shell, '#dws-presbtn').onclick = expDlg;
    // --- 3D viewer access (made by v29 on first open)
    const viewer = () => (WS() && WS().viewer3d) || null;
    const v3opts = store.get('dws-3d', { light: 'daylight', explode: 0, show: 'all', bg: '' });
    function ensure3D() { if (!is3D()) { const t = pick('[data-view29="3d"]'); if (t) t.click(); } }
    async function preset(k) { ensure3D(); for (let i = 0; i < 40 && !viewer(); i++) await sleep(100); const V = viewer(); if (!V) return; apply3D(); V.view(k); cambar(); }
    function apply3D() {
      const V = viewer(); if (!V) return; const L = F().levels(api.model), act = L.find(l => l.active);
      const o = { explode: v3opts.explode > 0 ? v3opts.explode : 0, isolate: v3opts.show === 'only' ? act.id : null, upTo: v3opts.show === 'upto' ? act.id : null };
      V.update(api.model, o);
      if (v3opts.light && V.setLight) V.setLight(v3opts.light);
    }
    $$(shell, '[data-preset]').forEach(b => b.onclick = () => preset(b.dataset.preset));
    const lightSel = $q(shell, '#dws-light'); lightSel.value = v3opts.light || 'daylight'; lightSel.onchange = () => { v3opts.light = lightSel.value; store.set('dws-3d', v3opts); const V = viewer(); if (V && V.setLight) V.setLight(v3opts.light); };
    const bgSel = $q(shell, '#dws-bg'); bgSel.value = v3opts.bg || ''; bgSel.onchange = () => { v3opts.bg = bgSel.value; store.set('dws-3d', v3opts); };
    function cambar() {
      const cb = $q(shell, '#dws-cambar'), V = viewer(), L = F().levels(api.model), cur = V && V.preset ? V.preset() : 'iso';
      const old3 = pick('.dw29-3dbar');
      cb.innerHTML = `<label class="dws-camsel">${ico('camera')}<select id="dws-preset" aria-label="Camera">${PRESETS.map(([k, l]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <span class="dws-hint sm">Drag to orbit · right-drag to pan · scroll to zoom</span>
        ${L.length > 1 ? `<label class="dws-camsel">${ico('floors')}<select id="dws-show" aria-label="Floors shown"><option value="all"${v3opts.show === 'all' ? ' selected' : ''}>All floors</option><option value="upto"${v3opts.show === 'upto' ? ' selected' : ''}>Up to ${esc(L.find(l => l.active).name)}</option><option value="only"${v3opts.show === 'only' ? ' selected' : ''}>Only ${esc(L.find(l => l.active).name)}</option></select></label><label class="dws-chk"><input type="checkbox" id="dws-explode"${v3opts.explode > 0 ? ' checked' : ''}> Exploded</label>` : ''}`;
      if (old3) { old3.classList.add('dws-3dopts'); cb.appendChild(old3); $$(old3, '[data-cam3]').forEach(b => { b.closest('.dw21-seg').hidden = true; }); }
      $q(cb, '#dws-preset').onchange = e => preset(e.target.value);
      const sh = $q(cb, '#dws-show'); if (sh) sh.onchange = () => { v3opts.show = sh.value; store.set('dws-3d', v3opts); apply3D(); };
      const ex = $q(cb, '#dws-explode'); if (ex) ex.onchange = () => { v3opts.explode = ex.checked ? 72 : 0; store.set('dws-3d', v3opts); apply3D(); };
    }
    // --- floors: picker in the top bar, ghost of the floor below in plan, Building panel
    function floorPick() {
      const L = F().levels(api.model), el = $q(shell, '#dws-floorpick');
      el.innerHTML = `<label>${ico('floors')}<select id="dws-floor" aria-label="Floor">${L.slice().reverse().map(l => `<option value="${esc(l.id)}"${l.active ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}<option value="__add">+ Add a floor…</option></select></label>`;
      $q(el, '#dws-floor').onchange = ev => { const v = ev.target.value; if (v === '__add') { ev.target.value = L.find(l => l.active).id; addFloorDlg(); return; } switchFloor(v); };
    }
    function switchFloor(id) {
      if (F().levels(api.model).find(l => l.active).id === id) return;
      api.sel = null; F().switchTo(api.model, id); api.render(); save(); floorPick(); if (is3D()) apply3D(); building();
    }
    function addFloorDlg() {
      const L = F().levels(api.model), act = L.find(l => l.active);
      const M = modal('dws-floordlg', `<span class="dws-kicker">BUILDING · FLOORS</span><h2>Add a floor</h2>
        <div class="dws-two"><div class="dws-field"><label for="dws-fn">Name</label><input id="dws-fn" value="LEVEL ${L.length + 1}" maxlength="40"></div><div class="dws-field"><label for="dws-fh">Floor-to-floor height</label><input id="dws-fh" value="${esc(ftin(L[L.length - 1].height))}"></div></div>
        <div class="dws-field"><label for="dws-fb">Goes above</label><select id="dws-fb">${L.slice().reverse().map(l => `<option value="${esc(l.id)}"${l.id === L[L.length - 1].id ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
        <div class="dws-field"><label for="dws-fc">Start with</label><select id="dws-fc"><option value="exterior">The exterior walls and windows of the floor below</option><option value="all">A copy of the floor below</option><option value="none">Nothing</option></select></div>
        <p class="dws-warn" id="dws-ferr" hidden></p><div class="dws-row"><button type="button" class="dws-btn primary" id="dws-fadd">Add floor</button><button type="button" class="dws-btn ghost" id="dws-fcancel">Cancel</button></div>`);
      void act;
      $q(M.body, '#dws-fcancel').onclick = M.close;
      $q(M.body, '#dws-fadd').onclick = () => { const h = parseLen($q(M.body, '#dws-fh').value); if (!(h > 0)) { const e = $q(M.body, '#dws-ferr'); e.hidden = false; e.textContent = 'Enter a height like 12\'-0".'; return; } if (change(() => F().addFloor(api.model, { name: $q(M.body, '#dws-fn').value.trim() || undefined, height: h, below: $q(M.body, '#dws-fb').value, copy: $q(M.body, '#dws-fc').value }))) { api.sel = null; M.close(); floorPick(); if (is3D()) apply3D(); building(); flash('Floor added. Undo brings it back out.'); } };
    }
    function building() {
      const pane = $q(shell, '[data-ppane="bld"]'); if (!pane || pane.hidden) return;
      const m = api.model, L = F().levels(m), act = L.find(l => l.active), ws = m.ws || (m.ws = {}), bl = ws.building || {};
      const ext = m.walls.filter(x => x.type === 'exterior'), int = m.walls.filter(x => x.type !== 'exterior');
      const one = arr => { const hs = [...new Set(arr.map(x => Math.round((x.height || 0) * 8) / 8))]; return hs.length === 1 ? ftin(hs[0]) : hs.length ? '' : ''; };
      const ceil = [...new Set(m.rooms.map(r => r.ceiling || 0))];
      const src = ws.source || {};
      const asN = (ws.assumptions || []).filter(a => a.status !== 'confirmed').length;
      pane.innerHTML = `<div class="dws-field"><label for="dws-bname">Project name</label><input id="dws-bname" value="${esc(bl.name || api.row.name)}" maxlength="80"></div>
        <h4>Floors <small>${L.length}</small></h4>
        <ol class="dws-floors" reversed>${L.slice().reverse().map(l => `<li class="${l.active ? 'on' : ''}"><button type="button" class="dws-fsw" data-fsw="${esc(l.id)}" aria-pressed="${l.active}"><b>${esc(l.name)}</b><span>El. ${esc(ftin(l.elev))}</span></button><input class="dws-fhin" data-fh="${esc(l.id)}" value="${esc(ftin(l.height))}" aria-label="${esc(l.name)} floor-to-floor height" title="Floor-to-floor height"></li>`).join('')}</ol>
        <div class="dws-row"><button type="button" class="dws-btn ghost xs" id="dws-fadd2">+ Add floor</button>${L.length > 1 ? `<button type="button" class="dws-btn ghost xs" id="dws-frename">Rename</button><button type="button" class="dws-btn ghost xs bad" id="dws-fdel">Remove ${esc(act.name)}</button>` : ''}</div>
        <p class="dws-hint">Changing a floor-to-floor height moves every floor above it. Walls that ran the full old height follow; shorter walls keep theirs.</p>
        <h4>${esc(act.name)}</h4>
        <div class="dws-two"><div class="dws-field"><label for="dws-exh">Exterior walls</label><input id="dws-exh" value="${esc(one(ext))}" placeholder="${ext.length ? 'mixed' : 'none'}"${ext.length ? '' : ' disabled'}></div><div class="dws-field"><label for="dws-inh">Partitions</label><input id="dws-inh" value="${esc(one(int))}" placeholder="${int.length ? 'mixed' : 'none'}"${int.length ? '' : ' disabled'}></div></div>
        <div class="dws-field"><label for="dws-clg">Ceiling height (all rooms)</label><input id="dws-clg" value="${ceil.length === 1 && ceil[0] ? esc(ftin(ceil[0])) : ''}" placeholder="${m.rooms.length ? 'mixed' : 'no rooms'}"${m.rooms.length ? '' : ' disabled'}></div>
        <div class="dws-two"><div class="dws-field"><label>Units</label><input value="Imperial (ft-in)" disabled title="Metric display is not available yet. Metric files are converted on import."></div><div class="dws-field"><label for="dws-north2">North</label><div class="dws-northrow"><input id="dws-north2" type="number" min="-180" max="180" value="${esc(bl.north || 0)}"><span class="dws-narrow" style="transform:rotate(${+(bl.north || 0)}deg)">${ico('north')}</span></div></div></div>
        <h4>Roof</h4><div class="dws-row" id="dws-roofrow">${['none', 'flat', 'shed', 'gable', 'hip'].map(k => `<button type="button" class="dws-chipbtn${((m.roof && m.roof.type) || 'none') === k ? ' on' : ''}" data-roof="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
        <h4>Source</h4><p class="dws-hint">${src.kind === 'dxf' || src.kind === 'pdf' ? `Imported from <b>${esc(src.name)}</b>${src.units ? ' · ' + esc(src.units) : ''}. ${src.unit_confirmed ? 'Scale confirmed.' : 'Scale assumed: check one known dimension.'}${src.path ? ' The original file is kept with your drawing.' : ''}` : src.name ? `Read from the picture <b>${esc(src.name)}</b>.` : 'Drawn in DrawUp.'} ${asN ? `<button type="button" class="dws-link" id="dws-asgo">${asN} assumption${asN > 1 ? 's' : ''} to confirm</button>` : ''}</p>`;
      $$(pane, '[data-fsw]').forEach(b => b.onclick = () => switchFloor(b.dataset.fsw));
      $$(pane, '[data-fh]').forEach(inp => inp.onchange = () => { const h = parseLen(inp.value); if (!(h > 0)) { inp.classList.add('bad'); return; } let r = null; if (change(() => { r = F().setHeight(api.model, inp.dataset.fh, h); })) { if (is3D()) apply3D(); building(); flash(`Floor-to-floor height set to ${ftin(h)}. ${r.moved} wall${r.moved === 1 ? '' : 's'} followed; ${r.above} floor${r.above === 1 ? '' : 's'} above moved.`); } });
      $q(pane, '#dws-fadd2').onclick = addFloorDlg;
      const rn = $q(pane, '#dws-frename'); if (rn) rn.onclick = () => { const n = prompt('Floor name', act.name); if (n && n.trim()) { change(() => F().rename(api.model, act.id, n)); floorPick(); building(); } };
      const del = $q(pane, '#dws-fdel'); if (del) del.onclick = () => { if (!confirm(`Remove ${act.name} and everything on it? Undo brings it back.`)) return; if (change(() => F().removeFloor(api.model, act.id))) { api.sel = null; floorPick(); if (is3D()) apply3D(); building(); flash('Floor removed. Undo brings it back.'); } };
      const setH = (id, pickF) => { const el = $q(pane, id); if (el) el.onchange = () => { const h = parseLen(el.value); if (!(h > 0)) { el.classList.add('bad'); return; } if (change(() => pickF().forEach(x => { x.height = Dm.snap(h); }))) { if (is3D()) apply3D(); building(); } }; };
      setH('#dws-exh', () => api.model.walls.filter(x => x.type === 'exterior')); setH('#dws-inh', () => api.model.walls.filter(x => x.type !== 'exterior'));
      const cl = $q(pane, '#dws-clg'); if (cl) cl.onchange = () => { const h = parseLen(cl.value); if (!(h > 0)) { cl.classList.add('bad'); return; } change(() => api.model.rooms.forEach(r => { r.ceiling = Dm.snap(h); })); building(); };
      $q(pane, '#dws-bname').onchange = e => { (api.model.ws = api.model.ws || {}).building = Object.assign({}, api.model.ws.building, { name: e.target.value.trim() }); save(); };
      $q(pane, '#dws-north2').onchange = e => { const v = Math.max(-180, Math.min(180, Math.round(+e.target.value || 0))); (api.model.ws = api.model.ws || {}).building = Object.assign({}, api.model.ws.building, { north: v }); save(); building(); };
      $$(pane, '[data-roof]').forEach(b => b.onclick = () => { const k = b.dataset.roof; const ok = change(() => { if (G() && G().setRoof) G().setRoof(api.model, k === 'none' ? { type: 'none' } : { type: k, pitch: k === 'flat' ? 0 : 6 }); else if (k === 'none') delete api.model.roof; else api.model.roof = { type: k, pitch: k === 'flat' ? 0 : 6 }; }); if (ok) { const r3 = pick('#dw29-roof'); if (r3 && k !== 'none' && !r3.checked) { r3.checked = true; r3.dispatchEvent(new Event('change')); } if (is3D()) apply3D(); building(); } });
      const ag = $q(pane, '#dws-asgo'); if (ag) ag.onclick = () => { const b = pick('#dw29-as'); if (b) b.click(); };
    }
    function swatches() {
      const box = $q(shell, '#dws-swatches'); if (!box || !WS() || !WS().CONCEPTS) return;
      box.innerHTML = WS().CONCEPTS.map(k => { const F3 = V3() && V3().FINISHES; const col = (g, v) => (F3 && F3[g] && F3[g][v]) || '#ddd'; return `<button type="button" class="dws-sw" data-concept="${esc(k.id)}" title="${esc(k.name)}"><i style="background:${col('floor', k.floor)}"></i><i style="background:${col('wall', k.wall)}"></i><i style="background:${col('accent', k.accent)}"></i><span>${esc(k.name)}</span></button>`; }).join('');
      $$(box, '[data-concept]').forEach(b => b.onclick = () => { const k = WS().CONCEPTS.find(x => x.id === b.dataset.concept); if (!k) return; change(() => { const ws = api.model.ws || (api.model.ws = {}); ws.finishes = Object.assign({}, ws.finishes, { all: Object.assign({}, (ws.finishes || {}).all, { floor: k.floor, wall: k.wall, accent: k.accent }) }); }); if (is3D()) apply3D(); flash(k.name + ' finishes applied. Geometry did not change.'); });
    }
    // ghost of the floor below in plan, so walls can be lined up
    const baseRender = api.render;
    api.render = function () {
      // a 3D pick on another floor opens that floor
      const s = api.sel; if (s && s.id && F().multi(api.model)) { const here = s.type === 'wall' ? api.model.walls : s.type === 'opening' ? api.model.openings : s.type === 'room' ? api.model.rooms : s.type === 'item' ? api.model.items : null; if (here && !here.some(x => x.id === s.id)) { const fl = (api.model.floors || []).find(f => (f[s.type === 'wall' ? 'walls' : s.type === 'opening' ? 'openings' : s.type === 'room' ? 'rooms' : 'items'] || []).some(x => x.id === s.id)); if (fl) { F().switchTo(api.model, fl.id); floorPick(); save(); } } }
      return baseRender.apply(this, arguments);
    };
    // the editor redraws its plan into api.host on every change (including undo/redo, which do not go through api.render):
    // add the ghost of the floor below, and refresh the floor UI when the floors changed
    let floorSig = '';
    const sigOf = () => F().levels(api.model).map(l => l.id + ':' + l.name + ':' + l.height + ':' + (l.active ? 1 : 0)).join('|') + '#' + (api.model.roof && api.model.roof.type || '');
    const onRedraw = () => {
      if (!$q(api.host, '.dws-ghost')) ghost();
      const sg = sigOf(); if (sg !== floorSig) { floorSig = sg; floorPick(); building(); if (is3D()) apply3D(); }
    };
    new MutationObserver(onRedraw).observe(api.host, { childList: true });
    function ghost() {
      const svg = $q(api.host, 'svg'); if (!svg || !F().multi(api.model)) return;
      const L = F().levels(api.model), i = L.findIndex(l => l.active); if (i <= 0) return;
      const below = F().floorModel(api.model, L[i - 1].id); if (!below || !below.walls.length) return;
      const NS = 'http://www.w3.org/2000/svg', g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'dws-ghost'); g.setAttribute('pointer-events', 'none');
      below.walls.forEach(x => { try { const o = Dm.wallOutline(below, x), p = document.createElementNS(NS, 'polygon'); p.setAttribute('points', [o.outerA, o.outerB, o.innerB, o.innerA].map(q => q.x + ',' + q.y).join(' ')); p.setAttribute('fill', 'rgba(37,143,245,.07)'); p.setAttribute('stroke', 'rgba(37,143,245,.35)'); p.setAttribute('stroke-width', String(0.006 * api.scale)); p.setAttribute('stroke-dasharray', `${0.03 * api.scale} ${0.03 * api.scale}`); g.appendChild(p); } catch (_e) { /* */ } });
      const first = svg.querySelector('rect') ; if (first && first.nextSibling) svg.insertBefore(g, first.nextSibling); else svg.insertBefore(g, svg.firstChild);
    }
    // --- plain-English studio commands (handled here, before the existing change bar)
    function studioCommand(text) {
      const t = text.toLowerCase().trim();
      const pres = PRESETS.find(([k, l]) => t.includes(l.toLowerCase()) || (k === 'axo' && /axonometric|\baxo\b/.test(t)) || (k === 'isometric' && /isometric/.test(t)) || (k === 'plan' && /(top[- ]down|plan) 3d|3d (floor )?plan/.test(t)));
      if (/^(show|switch to|go to|open|give me|create|make|generate)\b/.test(t) && pres && /view|elevation|perspective|axonometric|isometric|3d/.test(t)) {
        if (/roof (removed|off|hidden)|without (the )?roof|no roof|hide (the )?roof|remove the roof/.test(t)) { const r3 = pick('#dw29-roof'); if (r3) { r3.checked = false; } }
        preset(pres[0]); flash(`${pres[1]} view.`); return true;
      }
      if (/(hide|remove|turn off|take off) (the )?roof( view)?$|^(show|view) .*(without|no) (the )?roof/.test(t) && !/delete/.test(t)) { ensure3D(); setTimeout(() => { const r3 = pick('#dw29-roof'); if (r3 && r3.checked) { r3.checked = false; r3.dispatchEvent(new Event('change')); } }, 300); flash('Roof hidden in 3D. The roof is still in the model.'); return true; }
      const st = /(?:switch|change|set|use|go)(?: (?:the )?(?:style|view|mode))?(?: to)? (cd|sketch|presentation|realistic)\b/.exec(t);
      if (st) { const b = pick(`[data-style="${st[1]}"]`); if (b) { b.click(); flash(`${st[1][0].toUpperCase() + st[1].slice(1)} style. Geometry did not change.`); return true; } }
      if (/client presentation view|presentation view/.test(t)) { const b = pick('[data-style="presentation"]'); if (b) b.click(); preset('exterior'); flash('Presentation style, exterior perspective. Use Export → Presentation export for a clean high-resolution image.'); return true; }
      // floors
      const nth = { second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5 };
      let m = /add (?:a |an |one )?(?:(second|third|fourth|fifth|sixth|2nd|3rd|4th|5th|new|another) )?(?:floor|level|story|storey)(?: (?:at|with|of)(?: an?)? ([\d'"\s.-]+?)(?: ?(?:feet|foot|ft|inches|in))?(?: floor[- ]to[- ]floor)?(?: height)?)?$/.exec(t);
      if (m) {
        const h = m[2] ? (parseLen(m[2].trim() + (/['"]/.test(m[2]) ? '' : "'")) || NaN) : NaN;
        const L = F().levels(api.model), height = h > 0 ? h : L[L.length - 1].height;
        if (!(height >= 24 && height <= 1200)) { flash('Give the height like "12 feet".', true); return true; }
        confirmChange(`Add ${m[1] && nth[m[1]] ? 'floor ' + nth[m[1]] : 'a floor'} on top at ${ftin(height)} floor to floor, starting with the exterior walls and windows of the top floor.`, () => { F().addFloor(api.model, { height, copy: 'exterior' }); floorPick(); if (is3D()) apply3D(); });
        return true;
      }
      m = /(?:make|set|change) (?:the )?(?:floor[- ]to[- ]floor|floor height)(?: height)?(?: of (?:this|the) (?:floor|level))? (?:to )?([\d'"\s.-]+?)(?: ?(?:feet|foot|ft))?$/.exec(t);
      if (m) { const h = parseLen(m[1].trim() + (/['"]/.test(m[1]) ? '' : "'")); if (!(h > 0)) { flash('Give the height like "12 feet".', true); return true; } const act = F().levels(api.model).find(l => l.active); confirmChange(`Set ${act.name} to ${ftin(h)} floor to floor. Floors above move with it.`, () => { F().setHeight(api.model, act.id, h); if (is3D()) apply3D(); }); return true; }
      if (/^(go to|switch to|open|show) (the )?(level|floor) ?(\d+)$/.test(t)) { const n = +/(\d+)$/.exec(t)[1], L = F().levels(api.model); if (L[n - 1]) { switchFloor(L[n - 1].id); flash(L[n - 1].name + '.'); } else flash(`There is no floor ${n}.`, true); return true; }
      return false;
    }
    function confirmChange(text, fn) {
      const t = $q(shell, '#dws-toast'); t.hidden = false;
      t.innerHTML = `<span class="dws-tmsg"><b>Preview:</b> ${esc(text)}</span><button type="button" class="dws-btn primary xs" id="dws-capply">Apply</button><button type="button" class="dws-btn ghost xs" id="dws-ccancel">Cancel</button>`;
      $q(t, '#dws-capply').onclick = () => { if (change(fn)) { building(); flash('Done. Undo brings it back.'); } };
      $q(t, '#dws-ccancel').onclick = () => { t.hidden = true; };
    }
    let flashT = 0;
    function flash(msg, bad, undoable) {
      const t = $q(shell, '#dws-toast'); t.hidden = false; t.classList.toggle('bad', !!bad);
      t.innerHTML = `<span class="dws-tdot ${bad ? 'bad' : ''}"></span><span class="dws-tmsg">${esc(msg)}</span>${undoable ? '<button type="button" class="dws-link" id="dws-tundo">Undo</button>' : ''}<button type="button" class="dws-x sm" aria-label="Dismiss">×</button>`;
      $q(t, '.dws-x').onclick = () => { t.hidden = true; }; const u = $q(t, '#dws-tundo'); if (u) u.onclick = () => { const b = pick('#dw-undo'); if (b) b.click(); t.hidden = true; };
      clearTimeout(flashT); flashT = setTimeout(() => { t.hidden = true; }, bad ? 9000 : 7000);
    }
    floorPick(); building(); sync(); floorSig = sigOf(); ghost();
    // opened right after an import: say so, with Undo for the first edit and a pointer to assumptions
    const openP = params.get('open');
    if (openP === 'imported') { const s = (api.model.ws || {}).source || {}; flash(`Model imported: ${s.report ? s.report.walls + ' walls, ' + s.report.doors + ' doors, ' + s.report.windows + ' windows' : 'ready to edit'}. Check the assumptions in Building.`); history.replaceState(null, '', '#portal/draw?id=' + api.row.id); }
    if (openP === '3d') { setTimeout(() => preset('axo'), 50); history.replaceState(null, '', '#portal/draw?id=' + api.row.id); }
    if (openP === 'export') { setTimeout(expDlg, 50); history.replaceState(null, '', '#portal/draw?id=' + api.row.id); }
    window.DrawUpDrawStudio.editor = { api, building, floorPick, preset, apply3D, studioCommand, flash };
    return e;
  }

  /* ============================================================ presentation export */
  const SIZES = [['1920x1080', 'HD 1920 × 1080 (16:9)'], ['3840x2160', '4K 3840 × 2160 (16:9)'], ['2400x2400', 'Square 2400 × 2400 (1:1)'], ['1080x1350', 'Portrait 1080 × 1350 (4:5)'], ['3300x2550', 'Letter landscape, 300 dpi'], ['5100x3300', 'Tabloid landscape, 300 dpi'], ['custom', 'Custom size…']];
  function exportDialog(api, c, viewer) {
    const in3D = api.w.classList.contains('dw29-3dmode');
    const st = store.get('dws-exp', { what: in3D ? 'current' : 'plan', size: '3840x2160', fmt: 'png', bg: 'white', paper: 'letter' });
    if (!in3D && st.what !== 'plan') st.what = 'plan';
    const M = modal('dws-expdlg', '', 'mid');
    const draw = () => {
      M.body.innerHTML = `<span class="dws-kicker">EXPORT · PRESENTATION</span><h2>Export a clean image</h2>
        <div class="dws-field"><label for="dws-xw">View</label><select id="dws-xw"><option value="plan"${st.what === 'plan' ? ' selected' : ''}>Floor plan (current style)</option><option value="current"${st.what === 'current' ? ' selected' : ''}>3D: the current camera</option>${PRESETS.map(([k, l]) => `<option value="${k}"${st.what === k ? ' selected' : ''}>3D: ${l}</option>`).join('')}</select></div>
        <div class="dws-two"><div class="dws-field"><label for="dws-xs">Size</label><select id="dws-xs">${SIZES.map(([k, l]) => `<option value="${k}"${st.size === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div><div class="dws-field"><label for="dws-xf">Format</label><select id="dws-xf"><option value="png"${st.fmt === 'png' ? ' selected' : ''}>PNG</option><option value="jpg"${st.fmt === 'jpg' ? ' selected' : ''}>JPG</option><option value="pdf"${st.fmt === 'pdf' ? ' selected' : ''}>PDF sheet</option></select></div></div>
        ${st.size === 'custom' ? `<div class="dws-two"><div class="dws-field"><label for="dws-xcw">Width (px)</label><input id="dws-xcw" type="number" min="200" max="8000" value="${st.cw || 3000}"></div><div class="dws-field"><label for="dws-xch">Height (px)</label><input id="dws-xch" type="number" min="200" max="8000" value="${st.ch || 2000}"></div></div>` : ''}
        <div class="dws-field"><label for="dws-xb">Background</label><select id="dws-xb"><option value="white"${st.bg === 'white' ? ' selected' : ''}>White</option><option value="cream"${st.bg === 'cream' ? ' selected' : ''}>Soft cream</option><option value="sky"${st.bg === 'sky' ? ' selected' : ''}>Soft sky</option><option value="navy"${st.bg === 'navy' ? ' selected' : ''}>Midnight navy</option><option value="transparent"${st.bg === 'transparent' ? ' selected' : ''}${st.fmt !== 'png' ? ' disabled' : ''}>Transparent (PNG only)</option></select></div>
        <div class="dws-field"><label for="dws-xn">File name</label><input id="dws-xn" value="${esc(st.name || api.fileBase())}"></div>
        <p class="dws-hint">No toolbars, selection or grips appear in the image. 3D views use the 3D style and lighting you have on screen. PDF puts the image on a titled sheet.</p>
        <p class="dws-warn" id="dws-xerr" hidden></p>
        <div class="dws-row"><button type="button" class="dws-btn primary" id="dws-xgo">Export</button><button type="button" class="dws-btn ghost" id="dws-xcancel">Cancel</button></div>`;
      const on = (id, k) => { const e = $q(M.body, id); if (e) e.onchange = () => { st[k] = e.type === 'number' ? +e.value : e.value; if (k === 'fmt' && st.fmt !== 'png' && st.bg === 'transparent') st.bg = 'white'; store.set('dws-exp', st); draw(); }; };
      on('#dws-xw', 'what'); on('#dws-xs', 'size'); on('#dws-xf', 'fmt'); on('#dws-xb', 'bg'); on('#dws-xcw', 'cw'); on('#dws-xch', 'ch');
      $q(M.body, '#dws-xn').oninput = e => { st.name = e.target.value; };
      $q(M.body, '#dws-xcancel').onclick = M.close;
      $q(M.body, '#dws-xgo').onclick = async () => {
        const b = $q(M.body, '#dws-xgo'); b.disabled = true; b.textContent = 'Rendering…';
        try { await runExport(api, c, viewer, st); M.close(); }
        catch (x) { const e = $q(M.body, '#dws-xerr'); e.hidden = false; e.textContent = 'Export failed — ' + (x.message || x); b.disabled = false; b.textContent = 'Export'; }
      };
    };
    draw();
  }
  const BG = { white: '#ffffff', cream: '#fff5ef', sky: '#eef4fb', navy: '#142337', transparent: 'transparent' };
  async function runExport(api, c, viewer, st) {
    let [W, H] = st.size === 'custom' ? [st.cw || 3000, st.ch || 2000] : st.size.split('x').map(Number);
    W = Math.max(200, Math.min(8000, Math.round(W))); H = Math.max(200, Math.min(8000, Math.round(H)));
    const name = (st.name || api.fileBase()).replace(/[^\w.-]+/g, '-'), bg = BG[st.bg] || '#ffffff';
    let canvas;
    if (st.what === 'plan') {
      const svg = $q(api.host, 'svg'); if (!svg) throw new Error('The plan is not on screen.');
      const src = await WS().svgToPng(svg, Math.max(W, H));
      canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const g = canvas.getContext('2d');
      if (bg !== 'transparent') { g.fillStyle = bg; g.fillRect(0, 0, W, H); }
      const k = Math.min(W * 0.92 / src.width, H * 0.92 / src.height), dw = src.width * k, dh = src.height * k;
      // the plan's own paper colour is dropped when the background is not white, so it sits on the chosen background
      g.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else {
      const ws = window.DrawUpDrawStudio.editor; if (!api.w.classList.contains('dw29-3dmode')) { const t = $q(api.w, '[data-view29="3d"]'); if (t) t.click(); }
      for (let i = 0; i < 50 && !viewer(); i++) await sleep(100);
      const V = viewer(); if (!V) throw new Error('3D is not ready. Your browser may not support WebGL.');
      const max = V.maxSize ? V.maxSize() : 4096; if (W > max || H > max) { const k = max / Math.max(W, H); W = Math.floor(W * k); H = Math.floor(H * k); toast(c, `This device can render up to ${max} px, so the image is ${W} × ${H}.`); }
      const before = V.preset ? V.preset() : null;
      if (st.what !== 'current' && ws) { ws.apply3D(); V.view(st.what); await sleep(60); }
      const url = V.png(W, H, { background: bg, type: 'image/png' });
      if (st.what !== 'current' && before) V.view(before);
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('The render could not be read.')); i.src = url; });
      canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; canvas.getContext('2d').drawImage(img, 0, 0);
    }
    const blob = await new Promise(r => canvas.toBlob(r, st.fmt === 'jpg' || st.fmt === 'pdf' ? 'image/jpeg' : 'image/png', 0.93));
    if (!blob) throw new Error('The image is too large for this browser. Try a smaller size.');
    if (st.fmt === 'png' || st.fmt === 'jpg') { download(name + '.' + st.fmt, blob); return; }
    // PDF sheet: landscape, image fitted, a small title line
    const PDF = await pdflib(), doc = await PDF.PDFDocument.create(), page = doc.addPage([792, 612]), img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer())), font = await doc.embedFont(PDF.StandardFonts.Helvetica);
    const k = Math.min(732 / W, 520 / H), iw = W * k, ih = H * k; page.drawImage(img, { x: (792 - iw) / 2, y: 72 + (520 - ih) / 2, width: iw, height: ih });
    page.drawLine({ start: { x: 30, y: 54 }, end: { x: 762, y: 54 }, thickness: 0.6, color: PDF.rgb(0.08, 0.14, 0.22) });
    page.drawText(String(api.row.name || 'Drawing').replace(/[^\x20-\x7e]/g, ''), { x: 30, y: 36, size: 11, font, color: PDF.rgb(0.08, 0.14, 0.22) });
    page.drawText(('DrawUp · ' + (st.what === 'plan' ? 'Floor plan' : '3D ' + ((PRESETS.find(p => p[0] === st.what) || [0, 'view'])[1])) + ' · ' + new Date().toLocaleDateString()).replace(/[^\x20-\x7e]/g, ''), { x: 30, y: 22, size: 8, font, color: PDF.rgb(0.35, 0.4, 0.48) });
    download(name + '.pdf', new Blob([await doc.save()], { type: 'application/pdf' }));
  }

  /* ============================================================ wiring */
  function start(mode) {
    const P = window.DrawUpPortal, h = '#portal/draw?start=' + (mode || 'choose');
    history.replaceState(null, '', h);
    if (P && P.openPortal && P.isSignedIn && P.isSignedIn()) P.openPortal('draw'); else location.hash = h;
  }
  async function openRecent(o) {
    const view = (o && o.view) || '3d';
    history.replaceState(null, '', '#portal/draw?recent=' + view);
    const P = window.DrawUpPortal; if (P && P.openPortal && P.isSignedIn && P.isSignedIn()) P.openPortal('draw'); else location.hash = '#portal/draw?recent=' + view;
  }
  function wire(n) {
    const V = window.DrawUpDrawV21; if (!V || !V.__v29 || !window.DrawUpDrawCore || !F() || !IM()) { if ((n || 0) < 150) setTimeout(() => wire((n || 0) + 1), 100); return; }
    if (V.__v31) return; V.__v31 = true;
    const attach = V.attach, route = V.route, decorate = V.decorateStart;
    V.attach = api => { const e = attach(api) || {}; try { return extend(api, e); } catch (x) { console.warn('Draw Studio v31', x); return e; } };
    V.route = async (w, c, params) => {
      w.classList.remove('dws-startpage', 'dws'); document.documentElement.classList.remove('dws-on');
      // the Draw tab keeps using this same params object after route() returns false, so rewrite it in place
      const startMode = params.get('start');
      if (startMode) { params.delete('start'); params.set('new', '1'); params.set('smode', startMode); history.replaceState(null, '', '#portal/draw?' + params.toString()); }
      const rec = params.get('recent');
      if (rec) {
        params.delete('recent');
        try { const { data } = await sb().from('drawings').select('id').eq('owner_id', c.user.id).order('updated_at', { ascending: false }).limit(1); if (data && data[0]) { params.set('id', data[0].id); params.set('open', rec === 'export' ? 'export' : '3d'); } else params.set('new', '1'); } catch (_e) { /* the tab opens the latest drawing */ }
        history.replaceState(null, '', '#portal/draw?' + params.toString());
      }
      return route ? route(w, c, params) : false;
    };
    V.decorateStart = (w, c) => { decorate && decorate(w, c); const q = new URLSearchParams((location.hash.split('?')[1]) || ''); renderStart(w, c, { mode: q.get('smode'), project: q.get('project') }); };
  }
  window.DrawUpDrawStudio = { start, openRecent, importFile, review, renderStart, exportDialog, thumbSVG, editor: null, _pdfLines: pdfLines, _scaleFromText: scaleFromText };
  wire(0);
})();
