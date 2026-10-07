/* DrawUp Draw V21 — more control, Floor plan / Elevation / Section views with a camera,
 * "Markup a file" redlines on your own image or PDF, and sharing (open link or a chat).
 *
 * Pairs with drawup-draw-core-v18.js (model), drawup-draw-elev-v21.js (views) and the Draw
 * tab in drawup-tools-v18.js, which calls window.DrawUpDrawV21.route / attach / decorateStart.
 * pdf.js (Apache-2.0) and pdf-lib (MIT) are vendored under /vendor and load only when needed.
 */
(function () {
  'use strict';
  const BUCKET = 'drawup-private';
  const PDFJS = '/vendor/pdfjs-3.11.174/pdf.min.js', PDFJS_WORKER = '/vendor/pdfjs-3.11.174/pdf.worker.min.js', PDFLIB = '/vendor/pdf-lib-1.17.1.min.js';
  const $q = (w, s) => w.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const uuid = () => (crypto.randomUUID && crypto.randomUUID()) || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); });
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_e) { /* private mode */ } } };
  function download(name, data, type) { const blob = data instanceof Blob ? data : new Blob([data], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
  function binary(str) { const u = new Uint8Array(str.length); for (let i = 0; i < str.length; i++) u[i] = str.charCodeAt(i) & 255; return u; }
  const loaded = {};
  function loadScript(src) { if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }); return loaded[src]; }
  async function pdfjs() { await loadScript(PDFJS); const L = window.pdfjsLib; L.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return L; }
  async function pdflib() { await loadScript(PDFLIB); return window.PDFLib; }
  function shareUrl(token) { return location.origin + location.pathname + '#portal/draw?share=' + token; }
  async function copyText(t) { try { await navigator.clipboard.writeText(t); return true; } catch (_e) { return false; } }
  const LAYERS = [['walls', 'Walls'], ['openings', 'Doors & windows'], ['rooms', 'Room tags'], ['items', 'Columns, stairs, fixtures, text'], ['dims', 'Dimensions'], ['cams', 'Section & elevation marks']];

  /* ============================================================ editor extension */
  function attach(api) {
    const D = api.D, E = window.DrawUpElev, c = api.c, w = api.w;
    const snap = Object.assign({ grid: true, ortho: true, ends: true }, store.get('du21-snap', {}));
    const layers = store.get('du21-layers', {});
    let mode = 'plan', camPending = null, camHover = null, camDrag = null, justDragged = false, numBox = null;
    const cams = () => { const m = api.model; if (!Array.isArray(m.cameras)) m.cameras = []; return m.cameras; };
    const camById = id => cams().find(x => x.id === id);
    const selCam = () => (api.sel && api.sel.type === 'camera' ? camById(api.sel.id) : null);
    const ft = v => D.formatFtIn(v);
    const save = () => api.scheduleSave();
    const change = fn => { const before = JSON.stringify(api.model); try { fn(); } catch (e) { api.model = D.normalizeModel(JSON.parse(before)); c.toast(e.message || String(e), true); api.render(); return false; } api.pushUndo(before); api.render(); save(); return true; };

    /* ---- UI: view switch, snapping, layers, share, markup */
    const bar = $q(w, '.du-draw-bar20');
    bar.insertAdjacentHTML('afterbegin', `<div class="dw21-row">
      <div class="dw21-seg" role="group" aria-label="View"><button type="button" data-view="plan" class="on">Floor plan</button><button type="button" data-view="elevation">Elevation</button><button type="button" data-view="section">Section</button></div>
      <div class="dw21-seg dw21-snaps" role="group" aria-label="Snapping"><span>Snap</span><button type="button" data-snap="grid">Grid</button><button type="button" data-snap="ortho">Ortho</button><button type="button" data-snap="ends">Ends</button></div>
      <div class="dw21-layers-wrap"><button type="button" class="dw21-btn" id="dw21-layers-btn" aria-expanded="false">Layers</button><div class="dw21-pop" id="dw21-layers" hidden><b>Layers</b><table><thead><tr><th></th><th>Show</th><th>Lock</th></tr></thead><tbody>${LAYERS.map(([k, l]) => `<tr><td>${l}</td><td><input type="checkbox" data-lshow="${k}" aria-label="Show ${l}"></td><td><input type="checkbox" data-llock="${k}" aria-label="Lock ${l}"></td></tr>`).join('')}</tbody></table><p>Hidden layers still print. Locked layers can't be picked or moved.</p></div></div>
      <span class="dw21-flex"></span>
      <button type="button" class="dw21-btn" id="dw21-markup">Markup a file</button><button type="button" class="dw21-btn primary" id="dw21-share">Share</button></div>`);
    const split = $q(w, '.du-draw-split');
    split.insertAdjacentHTML('afterbegin', '<div class="dw21-view" id="dw21-view" hidden><div class="dw21-view-svg" id="dw21-view-svg"></div></div>');
    canvasNumBox();
    const syncSnap = () => w.querySelectorAll('[data-snap]').forEach(b => { b.classList.toggle('on', snap[b.dataset.snap] !== false); b.setAttribute('aria-pressed', String(snap[b.dataset.snap] !== false)); });
    w.querySelectorAll('[data-snap]').forEach(b => b.onclick = () => { snap[b.dataset.snap] = snap[b.dataset.snap] === false; store.set('du21-snap', snap); syncSnap(); });
    syncSnap();
    const lb = $q(w, '#dw21-layers-btn'), lp = $q(w, '#dw21-layers');
    lb.onclick = () => { lp.hidden = !lp.hidden; lb.setAttribute('aria-expanded', String(!lp.hidden)); };
    document.addEventListener('click', e => { if (!lp.hidden && !e.target.closest('.dw21-layers-wrap')) { lp.hidden = true; lb.setAttribute('aria-expanded', 'false'); } });
    lp.querySelectorAll('[data-lshow]').forEach(cb => { const k = cb.dataset.lshow; cb.checked = !(layers[k] && layers[k].hide); cb.onchange = () => { layers[k] = Object.assign({}, layers[k], { hide: !cb.checked }); store.set('du21-layers', layers); api.render(); }; });
    lp.querySelectorAll('[data-llock]').forEach(cb => { const k = cb.dataset.llock; cb.checked = !!(layers[k] && layers[k].lock); cb.onchange = () => { layers[k] = Object.assign({}, layers[k], { lock: cb.checked }); store.set('du21-layers', layers); if (api.sel && layerOf(api.sel) === k && cb.checked) api.sel = null; api.render(); }; });
    w.querySelectorAll('[data-view]').forEach(b => b.onclick = () => setMode(b.dataset.view));
    $q(w, '#dw21-share').onclick = () => shareDialog(c, { kind: 'drawing', id: api.row.id, name: api.row.name });
    $q(w, '#dw21-markup').onclick = () => { history.replaceState(null, '', '#portal/draw?markup=new'); c.openPortalTab('draw'); };
    const layerOf = s => s.type === 'wall' ? 'walls' : s.type === 'opening' ? 'openings' : s.type === 'room' ? 'rooms' : s.type === 'camera' ? 'cams' : s.type === 'item' ? ((api.model.items || []).find(x => x.id === s.id)?.kind === 'dim' ? 'dims' : 'items') : '';

    /* ---- typed lengths while drawing */
    function canvasNumBox() {
      api.canvas.insertAdjacentHTML('beforeend', '<form class="dw21-num" id="dw21-num" hidden><label>Length <input id="dw21-num-in" autocomplete="off" inputmode="decimal" placeholder="12\'-6&quot;"></label><button type="submit">Place</button><small>Enter places the point, Esc cancels</small></form>');
      numBox = $q(api.canvas, '#dw21-num');
      const inp = $q(numBox, 'input');
      numBox.onsubmit = e => { e.preventDefault(); placeTyped(inp.value); };
      inp.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeNum(); api.canvas.focus(); } e.stopPropagation(); });
      numBox.addEventListener('pointerdown', e => e.stopPropagation()); numBox.addEventListener('click', e => e.stopPropagation());
    }
    const startPt = () => (api.tool === 'camera' ? camPending : api.pending);
    function openNum(first) { numBox.hidden = false; const inp = $q(numBox, 'input'); inp.value = first || ''; inp.focus(); }
    function closeNum() { numBox.hidden = true; }
    function placeTyped(text) {
      const L = D.parseFtIn(text), a = startPt();
      if (!(L > 0) || !a) { c.toast('Type a length like 12\'-6" and press Enter.', true); return; }
      const h = api.tool === 'camera' ? camHover : api.hover;
      let d = h ? { x: h.x - a.x, y: h.y - a.y } : { x: 1, y: 0 }; const l = Math.hypot(d.x, d.y);
      d = l > 0.01 ? { x: d.x / l, y: d.y / l } : { x: 1, y: 0 };
      if (snap.ortho !== false) d = Math.abs(d.x) >= Math.abs(d.y) ? { x: Math.sign(d.x) || 1, y: 0 } : { x: 0, y: Math.sign(d.y) };
      // a run that starts inside a wall starts on that wall's centerline (as addWall does)
      let a0 = a;
      if (api.tool === 'wall' || api.tool === 'partition') api.model.walls.forEach(wl => { const WL = D.wallLength(wl), u = { x: (wl.b.x - wl.a.x) / WL, y: (wl.b.y - wl.a.y) / WL }, rx = a.x - wl.a.x, ry = a.y - wl.a.y, along = rx * u.x + ry * u.y, perp = Math.abs(rx * u.y - ry * u.x); if (along >= 0 && along <= WL && perp <= wl.thickness / 2 + 0.01 && Math.abs(u.x * d.x + u.y * d.y) < 0.01) a0 = { x: wl.a.x + u.x * along, y: wl.a.y + u.y * along }; });
      const pt = { x: D.snap(a0.x + d.x * L), y: D.snap(a0.y + d.y * L) };
      closeNum();
      if (api.tool === 'camera') placeCamera(pt); else api.clickAt(pt);
      api.canvas.focus();
    }

    /* ---- cameras on the plan */
    function placeCamera(p) {
      if (!camPending) { camPending = p; camHover = p; api.render(); return; }
      if (Math.hypot(p.x - camPending.x, p.y - camPending.y) < 24) { c.toast('Make the camera line at least 2\'-0" long.', true); return; }
      const kind = store.get('du21-camkind', 'section'), n = cams().filter(x => x.kind === kind).length;
      const cam = { id: 'cam_' + Math.random().toString(36).slice(2, 9), kind, name: kind === 'section' ? String.fromCharCode(65 + (n % 26)) : 'E' + (n + 1), a: camPending, b: p };
      camPending = null; camHover = null;
      change(() => { cams().push(cam); api.sel = { type: 'camera', id: cam.id }; });
    }
    api.canvas.addEventListener('pointermove', ev => {
      if (camDrag) return;
      if (api.tool === 'camera' && camPending) { camHover = api.snapPoint(api.toModel(ev), camPending, { free: ev.shiftKey }); api.render(); }
    });
    api.canvas.addEventListener('pointerdown', ev => {
      if (api.tool !== 'select' || ev.button !== 0) return;
      const el = ev.target.closest('[data-cam]'); if (!el || isLocked({ type: 'camera' })) return;
      const cam = camById(el.dataset.cam); if (!cam) return;
      api.sel = { type: 'camera', id: cam.id };
      camDrag = { id: cam.id, end: el.dataset.end || null, start: api.toModel(ev), orig: JSON.parse(JSON.stringify(cam)), before: JSON.stringify(api.model), moved: false, pid: ev.pointerId };
    });
    api.canvas.addEventListener('pointermove', ev => {
      if (!camDrag) return;
      const p = api.toModel(ev), dx = p.x - camDrag.start.x, dy = p.y - camDrag.start.y;
      if (!camDrag.moved && Math.hypot(dx, dy) < 0.04 * api.scale) return;
      camDrag.moved = true; try { api.canvas.setPointerCapture(camDrag.pid); } catch (_e) { /* */ }
      const cam = camById(camDrag.id), o = camDrag.orig; if (!cam) return;
      if (camDrag.end) cam[camDrag.end] = { x: D.snap(o[camDrag.end].x + dx, 1), y: D.snap(o[camDrag.end].y + dy, 1) };
      else { cam.a = { x: D.snap(o.a.x + dx, 1), y: D.snap(o.a.y + dy, 1) }; cam.b = { x: D.snap(o.b.x + dx, 1), y: D.snap(o.b.y + dy, 1) }; }
      api.render();
    });
    const endCamDrag = () => { if (!camDrag) return; if (camDrag.moved) { api.pushUndo(camDrag.before); justDragged = true; save(); } camDrag = null; api.render(); };
    api.canvas.addEventListener('pointerup', endCamDrag); api.canvas.addEventListener('pointercancel', endCamDrag);

    /* ---- views */
    function setMode(m) {
      if (m !== 'plan' && !E) { c.toast('Views could not load.', true); return; }
      mode = m; w.classList.toggle('dw21-viewmode', m !== 'plan');
      w.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === m));
      $q(w, '#dw21-view').hidden = m === 'plan'; api.canvas.hidden = m !== 'plan';
      if (m !== 'plan') {
        let cur = selCam(); if (!cur || cur.kind !== m) cur = cams().find(x => x.kind === m);
        if (!cur) {
          const before = JSON.stringify(api.model), add = m === 'elevation' ? E.defaultElevations(api.model) : [E.defaultSection(api.model, 'A')];
          cams().push(...add); api.pushUndo(before); save(); cur = add[0];
          c.toast(m === 'elevation' ? 'Added north, east, south and west elevations. Drag a marker on the key plan to aim it.' : 'Added Section A across the middle. Drag it on the key plan to move it.');
        }
        api.sel = { type: 'camera', id: cur.id };
        if (api.tool !== 'select') w.querySelector('[data-tool="select"]')?.click();
      }
      api.render();
    }
    function viewOf(cam) { return E.build(api.model, cam, api.scale); }
    function renderView() {
      const cam = selCam(), box = $q(w, '#dw21-view-svg'); if (!box) return;
      if (!cam) { box.innerHTML = '<p class="dw21-empty">Pick a camera.</p>'; return; }
      const V = viewOf(cam); box.innerHTML = E.toSVG(V);
      const s = box.querySelector('svg'); s.setAttribute('width', '100%'); s.setAttribute('height', '100%');
    }
    function camPanel(cam) {
      const all = cams(), F = E.frame(cam);
      return `<div class="dw21-cam" data-campanel="${esc(cam.id)}"><span class="du-kicker">${cam.kind === 'section' ? 'SECTION CAMERA' : 'ELEVATION CAMERA'}</span>
        <div class="du-field"><label>Camera</label><select id="dw21-camlist">${all.map(x => `<option value="${esc(x.id)}"${x.id === cam.id ? ' selected' : ''}>${esc(E.title(x))}</option>`).join('')}</select></div>
        <div class="du-two"><div class="du-field"><label>Name</label><input id="dw21-camname" maxlength="24" value="${esc(cam.name || '')}"></div><div class="du-field"><label>Type</label><select id="dw21-camkind"><option value="section"${cam.kind === 'section' ? ' selected' : ''}>Section</option><option value="elevation"${cam.kind === 'elevation' ? ' selected' : ''}>Elevation</option></select></div></div>
        <p class="dw21-camfacts">Looking <b id="dw21-facing">${E.facing(cam)}</b> · width <b>${esc(ft(F.L))}</b>${cam.depth > 0 ? ` · sees ${esc(ft(cam.depth))} deep` : ''}</p>
        <div class="dw21-keyplan" id="dw21-keyplan" title="Drag the camera to aim it. Drag a round end to turn it."></div>
        <div class="dw21-btnrow"><button type="button" class="du-btn ghost" id="dw21-camflip">Flip direction</button><button type="button" class="du-btn ghost" id="dw21-camrot">Rotate 90°</button></div>
        <div class="du-two"><div class="du-field"><label>See up to (blank = all)</label><input id="dw21-camdepth" value="${cam.depth > 0 ? esc(ft(cam.depth)) : ''}" placeholder="all"></div><div class="du-field"><label>Move by (x, y)</label><input id="dw21-cammove" placeholder="2'-0&quot;, 0"></div></div>
        <div class="dw21-btnrow"><button type="button" class="du-btn primary" id="dw21-camapply">Apply</button><button type="button" class="du-btn ghost" id="dw21-camdel">Delete camera</button></div>
        ${mode === 'plan' ? `<div class="dw21-thumb" id="dw21-thumb" title="Live view from this camera"></div><button type="button" class="du-btn ghost" id="dw21-camopen">Open ${cam.kind === 'section' ? 'section' : 'elevation'} view</button>` : ''}
        <div class="dw21-exp"><span>Export this view</span><button type="button" id="dw21-xpdf">PDF</button><button type="button" id="dw21-xsvg">SVG</button><button type="button" id="dw21-xpng">PNG</button><button type="button" id="dw21-xdxf">DXF</button></div>
        <p class="du-muted dw21-small">Generated from the plan: wall heights, sill and head heights, ceilings and stair rises. Fixtures, text and furniture are not drawn in elevations yet.</p></div>`;
    }
    function keyPlan(cam) {
      const box = $q(api.inspect, '#dw21-keyplan'); if (!box) return;
      box.innerHTML = D.toSVG(api.model, api.scale, { ink: '#0d1b2a', poche: '#b9c6d3', paper: '#ffffff' });
      const s = box.querySelector('svg'); s.setAttribute('width', '100%'); s.setAttribute('height', '100%');
      s.insertAdjacentHTML('beforeend', E.planOverlay({ cameras: cams() }, api.scale, cam.id));
      fitCams(s);
      let drag = null;
      const pt = ev => { const q = s.createSVGPoint(); q.x = ev.clientX; q.y = ev.clientY; const r = q.matrixTransform(s.getScreenCTM().inverse()); return { x: r.x, y: r.y }; };
      s.addEventListener('pointerdown', ev => {
        const cm = selCam(); if (!cm) return; const p = pt(ev);
        const k = s.getScreenCTM().a || 1, near = q => Math.hypot(q.x - p.x, q.y - p.y) < 16 / k;
        const end = near(cm.a) ? 'a' : near(cm.b) ? 'b' : null;
        drag = { end, start: p, orig: JSON.parse(JSON.stringify(cm)), before: JSON.stringify(api.model), moved: false };
        try { s.setPointerCapture(ev.pointerId); } catch (_e) { /* */ } ev.preventDefault();
      });
      s.addEventListener('pointermove', ev => {
        if (!drag) return; const cm = selCam(); if (!cm) return; const p = pt(ev), dx = p.x - drag.start.x, dy = p.y - drag.start.y, o = drag.orig;
        drag.moved = true;
        if (drag.end) cm[drag.end] = { x: D.snap(o[drag.end].x + dx, 1), y: D.snap(o[drag.end].y + dy, 1) };
        else { cm.a = { x: D.snap(o.a.x + dx, 1), y: D.snap(o.a.y + dy, 1) }; cm.b = { x: D.snap(o.b.x + dx, 1), y: D.snap(o.b.y + dy, 1) }; }
        s.querySelectorAll('.du-cam').forEach(g => g.remove()); s.insertAdjacentHTML('beforeend', E.planOverlay({ cameras: cams() }, api.scale, cm.id));
        if (mode === 'plan') thumb(cm); else renderView();
        const f = $q(api.inspect, '#dw21-facing'); if (f) f.textContent = E.facing(cm);
      });
      const up = () => { if (!drag) return; if (drag.moved) { api.pushUndo(drag.before); save(); } drag = null; api.render(); };
      s.addEventListener('pointerup', up); s.addEventListener('pointercancel', up);
    }
    function thumb(cam) { const t = $q(api.inspect, '#dw21-thumb'); if (!t) return; t.innerHTML = E.toSVG(viewOf(cam)); const s = t.querySelector('svg'); s.setAttribute('width', '100%'); s.setAttribute('height', '100%'); }
    function fitCams(svg) {
      const list = cams(); if (!list.length) return;
      const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number); if (vb.length !== 4) return;
      let [x0, y0, ww, hh] = vb, x1 = x0 + ww, y1 = y0 + hh; const m = 0.35 * api.scale;
      const pts = []; list.forEach(cm => pts.push(cm.a, cm.b)); if (camPending) pts.push(camPending); if (camHover) pts.push(camHover);
      pts.forEach(p => { x0 = Math.min(x0, p.x - m); y0 = Math.min(y0, p.y - m); x1 = Math.max(x1, p.x + m); y1 = Math.max(y1, p.y + m); });
      svg.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
    }
    async function exportView(kind) {
      const cam = selCam(); if (!cam) return; const V = viewOf(cam), base = api.fileBase() + '-' + E.title(cam).replace(/[^\w]+/g, '-');
      if (kind === 'svg') download(base + '.svg', E.toSVG(V, { paperSize: true }), 'image/svg+xml');
      else if (kind === 'dxf') download(base + '.dxf', E.toDXF(V), 'application/dxf');
      else if (kind === 'pdf') { const proj = (api.projects || []).find(p => p.id === api.row.project_thread_id); download(base + '.pdf', binary(E.toPDF(V, { project: proj?.project_name || 'DrawUp', name: api.row.name, sheet: (api.row.sheet_number || 'A') + '.' + (cam.name || '1') })), 'application/pdf'); }
      else if (kind === 'png') { const blob = await svgToPng(E.toSVG(V, { paperSize: true }), V); download(base + '.png', blob, 'image/png'); }
    }
    function bindCam(insp) {
      const cam = selCam(); if (!cam) return;
      const on = (id, fn) => { const el = $q(insp, id); if (el) el.onclick = fn; };
      keyPlan(cam); if (mode === 'plan') thumb(cam);
      $q(insp, '#dw21-camlist').onchange = e => { api.sel = { type: 'camera', id: e.target.value }; const k = camById(e.target.value)?.kind; if (mode !== 'plan' && k && k !== mode) setMode(k); else api.render(); };
      on('#dw21-camflip', () => change(() => E.flip(selCam())));
      on('#dw21-camrot', () => change(() => E.rotate(selCam(), 90)));
      on('#dw21-camdel', () => { const id = cam.id; change(() => { api.model.cameras = cams().filter(x => x.id !== id); const nx = cams().find(x => x.kind === mode); api.sel = nx ? { type: 'camera', id: nx.id } : null; }); if (mode !== 'plan' && !selCam()) setMode('plan'); });
      on('#dw21-camopen', () => setMode(cam.kind));
      on('#dw21-camapply', () => change(() => {
        const cm = selCam(); cm.name = ($q(insp, '#dw21-camname').value || '').trim().toUpperCase().slice(0, 24) || cm.name;
        const k = $q(insp, '#dw21-camkind').value; cm.kind = k === 'elevation' ? 'elevation' : 'section';
        const dv = $q(insp, '#dw21-camdepth').value.trim(); if (dv) { const v = D.parseFtIn(dv); if (!(v > 0)) throw new Error('Enter a depth like 20\'-0", or leave it blank.'); cm.depth = D.snap(v); } else delete cm.depth;
        const mv = $q(insp, '#dw21-cammove').value.trim(); if (mv) { const [a, b] = mv.split(','); const dx = D.parseFtIn(a), dy = b == null || !b.trim() ? 0 : D.parseFtIn(b); if (isNaN(dx) || isNaN(dy)) throw new Error('Enter a move like 2\'-0", 0'); E.move(cm, D.snap(dx), D.snap(dy)); }
        if (mode !== 'plan' && cm.kind !== mode) setTimeout(() => setMode(cm.kind), 0);
      }));
      ['pdf', 'svg', 'png', 'dxf'].forEach(k => on('#dw21-x' + k, () => exportView(k)));
    }

    /* ---- extra properties: door swing side, move / copy / mirror */
    function moveCopyHTML(label) { return `<div class="dw21-mc"><span class="du-kicker">${label}</span><div class="du-two"><div class="du-field"><label>Δx (right +)</label><input id="dw21-dx" value="2'-0&quot;"></div><div class="du-field"><label>Δy (down +)</label><input id="dw21-dy" value="0'-0&quot;"></div></div><div class="dw21-btnrow"><button type="button" class="du-btn ghost" id="dw21-move">Move</button><button type="button" class="du-btn ghost" id="dw21-copy">Copy</button>${label === 'MOVE / COPY / MIRROR' ? '<button type="button" class="du-btn ghost" id="dw21-mirror">Mirror</button>' : ''}</div></div>`; }
    function inspectorExtra(sel) {
      if (!sel) return `<div class="dw21-mc"><p class="du-muted dw21-small">${cams().length ? cams().length + ' camera' + (cams().length > 1 ? 's' : '') + ' on this plan. ' : ''}Switch to Elevation or Section above, or use <b>Section / Elev</b> to place a camera.</p></div>`;
      if (sel.type === 'camera') { const cam = selCam(); return cam ? camPanel(cam) : ''; }
      if (sel.type === 'opening') {
        const o = api.model.openings.find(x => x.id === sel.id); if (!o) return '';
        const wl = D.wallById(api.model, o.wall), ext = wl && wl.type === 'exterior';
        return `${o.kind === 'door' ? `<div class="dw21-mc"><span class="du-kicker">DOOR SWING</span><div class="du-field"><label>Opens to</label><select id="dw21-opens"><option value="in"${o.opens !== 'out' ? ' selected' : ''}>${ext ? 'Inside' : 'Side A'}</option><option value="out"${o.opens === 'out' ? ' selected' : ''}>${ext ? 'Outside' : 'Side B'}</option></select></div><p class="du-muted dw21-small">Hand: ${handOf(o)}. </p><div class="dw21-btnrow"><button type="button" class="du-btn ghost" id="dw21-hand">Flip hinge side</button><button type="button" class="du-btn ghost" id="dw21-swingside">Flip swing side</button></div></div>` : ''}<div class="dw21-mc"><span class="du-kicker">COPY</span><div class="dw21-btnrow"><button type="button" class="du-btn ghost" id="dw21-copyop">Copy along the wall</button></div></div>`;
      }
      if (sel.type === 'wall') return moveCopyHTML('MOVE / COPY') + '<p class="du-muted dw21-small">Moving a wall keeps its corners joined: connected walls stretch with it.</p>';
      if (sel.type === 'room') return moveCopyHTML('MOVE / COPY');
      if (sel.type === 'item') { const it = (api.model.items || []).find(x => x.id === sel.id); return it ? moveCopyHTML(it.kind === 'fixture' || it.kind === 'stair' ? 'MOVE / COPY / MIRROR' : 'MOVE / COPY') : ''; }
      return '';
    }
    function handOf(o) { const lr = o.swing === 'right' ? 'hinge at end of wall' : 'hinge at start of wall'; return lr + ', swings ' + (o.opens === 'out' ? 'out' : 'in'); }
    const nid = p => p + '_' + Math.random().toString(36).slice(2, 9);
    function moveWall(m, wl, dx, dy) {
      const a0 = { ...wl.a }, b0 = { ...wl.b }, same = (p, q) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;
      m.walls.forEach(x => { if (x === wl) return; ['a', 'b'].forEach(k => { if (same(x[k], a0) || same(x[k], b0)) x[k] = { x: D.snap(x[k].x + dx), y: D.snap(x[k].y + dy) }; }); });
      wl.a = { x: D.snap(a0.x + dx), y: D.snap(a0.y + dy) }; wl.b = { x: D.snap(b0.x + dx), y: D.snap(b0.y + dy) };
      m.openings.forEach(o => { const h = D.wallById(m, o.wall), L = D.wallLength(h); if (o.offset - o.width / 2 < -1e-6 || o.offset + o.width / 2 > L + 1e-6) throw new Error('That move would leave an opening off its wall.'); });
      if (m.walls.some(x => D.wallLength(x) < 1)) throw new Error('That move would collapse a wall.');
    }
    function bindInspector(insp) {
      const sel = api.sel; if (!sel) return;
      if (sel.type === 'camera') return bindCam(insp);
      const on = (id, fn) => { const el = $q(insp, id); if (el) el.onclick = fn; };
      const delta = () => { const dx = D.parseFtIn($q(insp, '#dw21-dx').value.replace(/^\s*-/, '')), dy = D.parseFtIn($q(insp, '#dw21-dy').value.replace(/^\s*-/, '')); if (isNaN(dx) || isNaN(dy)) throw new Error('Enter distances like 2\'-0".'); return [(/^\s*-/.test($q(insp, '#dw21-dx').value) ? -1 : 1) * D.snap(dx), (/^\s*-/.test($q(insp, '#dw21-dy').value) ? -1 : 1) * D.snap(dy)]; };
      const opens = $q(insp, '#dw21-opens'); if (opens) opens.onchange = () => change(() => { const o = api.model.openings.find(x => x.id === sel.id); o.opens = opens.value === 'out' ? 'out' : 'in'; });
      on('#dw21-hand', () => change(() => { const o = api.model.openings.find(x => x.id === sel.id); o.swing = o.swing === 'right' ? 'left' : 'right'; }));
      on('#dw21-swingside', () => change(() => { const o = api.model.openings.find(x => x.id === sel.id); o.opens = o.opens === 'out' ? 'in' : 'out'; }));
      on('#dw21-copyop', () => change(() => {
        const m = api.model, o = m.openings.find(x => x.id === sel.id), L = D.wallLength(D.wallById(m, o.wall)), gap = 12;
        const tryAt = [o.offset + o.width + gap, o.offset - o.width - gap].find(off => off - o.width / 2 >= 0 && off + o.width / 2 <= L && !m.openings.some(x => x.wall === o.wall && Math.abs(x.offset - off) < (x.width + o.width) / 2));
        if (tryAt == null) throw new Error('No room on this wall for a copy.');
        const cp = D.addOpening(m, o.wall, o.kind, tryAt, o.width, { tag: o.tag, swing: o.swing, head: o.head, sill: o.sill }); if (o.opens) cp.opens = o.opens; api.sel = { type: 'opening', id: cp.id };
      }));
      on('#dw21-move', () => change(() => { const [dx, dy] = delta(), m = api.model; if (sel.type === 'item') D.moveItem(m, sel.id, dx, dy); else if (sel.type === 'room') { const r = m.rooms.find(x => x.id === sel.id); r.at = { x: r.at.x + dx, y: r.at.y + dy }; } else if (sel.type === 'wall') moveWall(m, D.wallById(m, sel.id), dx, dy); }));
      on('#dw21-copy', () => change(() => {
        const [dx, dy] = delta(), m = api.model; if (!dx && !dy) throw new Error('Enter how far to copy it.');
        if (sel.type === 'item') { const it = JSON.parse(JSON.stringify(m.items.find(x => x.id === sel.id))); it.id = nid('i'); m.items.push(it); D.moveItem(m, it.id, dx, dy); api.sel = { type: 'item', id: it.id }; }
        else if (sel.type === 'room') { const r = JSON.parse(JSON.stringify(m.rooms.find(x => x.id === sel.id))); r.id = nid('r'); r.at = { x: r.at.x + dx, y: r.at.y + dy }; if (/^\d+$/.test(r.number || '')) r.number = String(+r.number + 1); m.rooms.push(r); api.sel = { type: 'room', id: r.id }; }
        else if (sel.type === 'wall') { const wl = D.wallById(m, sel.id), cp = D.addWall(m, { x: wl.a.x + dx, y: wl.a.y + dy }, { x: wl.b.x + dx, y: wl.b.y + dy }, { thickness: wl.thickness, type: wl.type, wtype: wl.wtype, height: wl.height }); cp.thickness = wl.thickness; cp.type = wl.type; api.sel = { type: 'wall', id: cp.id }; }
      }));
      on('#dw21-mirror', () => change(() => {
        const it = api.model.items.find(x => x.id === sel.id);
        if (it.kind === 'stair') { const r = (it.rot || 0) * Math.PI / 180; it.at = { x: D.snap(it.at.x + Math.cos(r) * it.length), y: D.snap(it.at.y + Math.sin(r) * it.length) }; it.rot = ((it.rot || 0) + 180) % 360; }
        else it.rot = (((it.rot || 0) + 180) % 360 + 360) % 360;
      }));
    }

    /* ---- hooks called by drawup-tools-v18.js */
    function isLocked(s) { const k = layerOf(s); return !!(k && layers[k] && layers[k].lock); }
    let lastCam = null;
    function afterRender(svg) {
      if (selCam()) lastCam = selCam().id;
      if (mode !== 'plan' && !selCam()) { const k = camById(lastCam) || cams().find(x => x.kind === mode); if (k) api.sel = { type: 'camera', id: k.id }; }
      LAYERS.forEach(([k]) => api.host.classList.toggle('dw21-hide-' + k, !!(layers[k] && layers[k].hide)));
      if (E && svg) {
        let html = E.planOverlay({ cameras: cams() }, api.scale, api.sel && api.sel.type === 'camera' ? api.sel.id : null);
        if (camPending && camHover) { const tmp = { id: '_p', kind: store.get('du21-camkind', 'section'), name: '?', a: camPending, b: camHover }; if (Math.hypot(camHover.x - camPending.x, camHover.y - camPending.y) > 1) html += E.planOverlay({ cameras: [tmp] }, api.scale, '_p'); }
        svg.insertAdjacentHTML('beforeend', html);
        fitCams(svg);
      }
      if (mode !== 'plan') renderView();
    }
    function toolOptions(tool, o) {
      if (tool === 'camera') {
        const k = store.get('du21-camkind', 'section');
        o.innerHTML = `<label>Camera <select id="dw21-camtool"><option value="section"${k === 'section' ? ' selected' : ''}>Section (cuts through)</option><option value="elevation"${k === 'elevation' ? ' selected' : ''}>Elevation (looks at)</option></select></label>`;
        $q(o, 'select').onchange = e => store.set('du21-camkind', e.target.value);
      }
      if (['wall', 'partition', 'stair', 'dim', 'camera'].includes(tool)) o.insertAdjacentHTML('beforeend', '<span class="dw21-tip">After the first click, type a length (12\'6) and press Enter.</span>');
      if (tool !== 'camera') { camPending = null; camHover = null; }
      closeNum();
    }
    function click(p, ev, tool) {
      if (justDragged) { justDragged = false; return true; }
      if (tool === 'camera') { placeCamera(ev.__p ? p : api.snapPoint(p, camPending, { free: ev.shiftKey })); return true; }
      if (tool === 'select' && ev.target && ev.target.closest && ev.target.closest('[data-cam]')) { if (isLocked({ type: 'camera' })) return false; api.sel = { type: 'camera', id: ev.target.closest('[data-cam]').dataset.cam }; api.render(); return true; }
      return false;
    }
    function keydown(ev, tool) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return false;
      if (ev.key === 'Escape') { camPending = null; camHover = null; closeNum(); return false; }
      if (/^[0-9.]$/.test(ev.key) && ['wall', 'partition', 'stair', 'dim', 'camera'].includes(tool) && startPt()) { ev.preventDefault(); openNum(ev.key); return true; }
      const cam = selCam();
      if (cam && tool === 'select') {
        if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); const id = cam.id; change(() => { api.model.cameras = cams().filter(x => x.id !== id); api.sel = null; }); return true; }
        if (ev.key === 'r' || ev.key === 'R') { change(() => E.rotate(selCam(), 90)); return true; }
        const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }, a = arrows[ev.key];
        if (a) { ev.preventDefault(); const st = ev.shiftKey ? 12 : 1; change(() => E.move(selCam(), a[0] * st, a[1] * st)); return true; }
      }
      return false;
    }
    return { afterRender, inspectorExtra, bindInspector, toolOptions, click, keydown, locked: isLocked, get snap() { return snap; }, setMode, get mode() { return mode; } };
  }

  async function svgToPng(svgText, V) {
    const s = V.scale, b = V.bounds, dpi = 150, W = Math.min(6000, Math.round((b.x1 - b.x0) / s * dpi)), H = Math.min(6000, Math.round((b.y1 - b.y0) / s * dpi));
    const url = URL.createObjectURL(new Blob([svgText.replace(/width="[^"]+in" height="[^"]+in"/, `width="${W}" height="${H}"`)], { type: 'image/svg+xml' }));
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not draw the view.')); i.src = url; });
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
      return await new Promise(res => cv.toBlob(res, 'image/png'));
    } finally { URL.revokeObjectURL(url); }
  }

  /* ============================================================ start page */
  function decorateStart(w, c) {
    const grid = $q(w, '.du-draw-start'); if (!grid) return;
    grid.insertAdjacentHTML('beforeend', `<article class="du-glass"><h2>Mark up a file</h2><p class="du-muted">Upload your own image or PDF and draw redlines on it: clouds, arrows, pen, text callouts and boxes. Saved to your account; share it with your team.</p><button class="du-btn ghost" id="dn-markup">Markup a file</button></article>`);
    $q(w, '#dn-markup').onclick = () => { history.replaceState(null, '', '#portal/draw?markup=new'); c.openPortalTab('draw'); };
  }

  /* ============================================================ routing */
  async function route(w, c, params) {
    document.getElementById('dw21-share-dlg')?.remove();
    if (params.get('share')) { await openShare(w, c, params.get('share')); return true; }
    if (params.has('markup')) { await openMarkup(w, c, params.get('markup')); return true; }
    return false;
  }
  window.addEventListener('hashchange', () => {
    const m = /^#portal\/draw\?(.*)$/.exec(location.hash || ''); if (!m) return;
    const p = new URLSearchParams(m[1]); const cur = document.querySelector('#du-workspace-content [data-dw21-route]');
    const key = p.get('share') ? 'share:' + p.get('share') : p.has('markup') ? 'markup:' + p.get('markup') : null;
    if (key && (!cur || cur.dataset.dw21Route !== key) && window.DrawUpPortal?.isSignedIn?.()) window.DrawUpPortal.openPortalTab('draw');
  });

  /* ============================================================ markups */
  const MK_TOOLS = [['select', 'Select'], ['pen', 'Pen'], ['arrow', 'Arrow'], ['cloud', 'Cloud'], ['rect', 'Box'], ['text', 'Text callout']];
  const MK_COLORS = [['#e0201b', 'Red'], ['#1f6fe0', 'Blue'], ['#14904a', 'Green'], ['#111111', 'Black']];
  async function renderPdfPage(data, pageNo) {
    const L = await pdfjs(); const doc = await L.getDocument({ data: data.slice ? data.slice(0) : data, isEvalSupported: false }).promise;
    const page = await doc.getPage(pageNo), vp = page.getViewport({ scale: 2 });
    const cv = document.createElement('canvas'); cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    return { url: cv.toDataURL('image/png'), width: cv.width, height: cv.height, pages: doc.numPages };
  }
  async function pdfPageCount(data) { const L = await pdfjs(); const doc = await L.getDocument({ data: data.slice(0), isEvalSupported: false }).promise; return doc.numPages; }
  function imageSize(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res({ width: i.naturalWidth, height: i.naturalHeight, img: i }); i.onerror = () => rej(new Error('That image could not be read.')); i.src = url; }); }

  /* Geometry of one mark as SVG path data (used by the editor, PNG and PDF export). */
  function markPath(k) {
    const P = p => p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    if (k.t === 'pen') return 'M' + k.pts.map(P).join(' L');
    if (k.t === 'rect') { const [x0, y0] = k.a, [x1, y1] = k.b; return `M${x0} ${y0} L${x1} ${y0} L${x1} ${y1} L${x0} ${y1} Z`; }
    if (k.t === 'arrow' || k.t === 'callout') {
      const [tx, ty] = k.t === 'arrow' ? k.b : k.a, [fx, fy] = k.t === 'arrow' ? k.a : k.b;
      const ang = Math.atan2(ty - fy, tx - fx), h = Math.max(10, (k.w || 3) * 4.5), sp = 0.45;
      const h1 = [tx - h * Math.cos(ang - sp), ty - h * Math.sin(ang - sp)], h2 = [tx - h * Math.cos(ang + sp), ty - h * Math.sin(ang + sp)];
      return `M${fx.toFixed(1)} ${fy.toFixed(1)} L${tx.toFixed(1)} ${ty.toFixed(1)} M${P(h1)} L${tx.toFixed(1)} ${ty.toFixed(1)} L${P(h2)}`;
    }
    if (k.t === 'cloud') {
      const x0 = Math.min(k.a[0], k.b[0]), y0 = Math.min(k.a[1], k.b[1]), x1 = Math.max(k.a[0], k.b[0]), y1 = Math.max(k.a[1], k.b[1]);
      const r = Math.max(6, Math.min(40, Math.min(x1 - x0, y1 - y0) / 5, (k.w || 3) * 6));
      const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; let d = `M${x0} ${y0}`;
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 4], L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / (2 * r)));
        for (let j = 1; j <= n; j++) { const x = ax + (bx - ax) * j / n, y = ay + (by - ay) * j / n, rr = L / n * 0.6; d += ` A${rr.toFixed(1)} ${rr.toFixed(1)} 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`; }
      }
      return d + ' Z';
    }
    return '';
  }
  function textBox(k) { const lines = String(k.text || '').split('\n'), sz = k.size || 18, wd = Math.max(...lines.map(l => l.length)) * sz * 0.58 + sz * 0.8, ht = lines.length * sz * 1.25 + sz * 0.5; const [x, y] = k.t === 'callout' ? k.b : k.at; return { x, y: y - ht / 2, w: wd, h: ht, lines, sz }; }
  function markSVG(k, sel, hitW) {
    const col = k.c || '#e0201b', w = k.w || 3;
    let body = '';
    if (k.t === 'text' || k.t === 'callout') {
      const b = textBox(k);
      if (k.t === 'callout') body += `<path d="${markPath(k)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
      body += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#fffef6" fill-opacity=".92" stroke="${col}" stroke-width="${Math.max(1.5, w * 0.7)}"/>` + b.lines.map((l, i) => `<text x="${b.x + b.sz * 0.4}" y="${b.y + b.sz * 0.25 + (i + 1) * b.sz * 1.25 - b.sz * 0.25}" font-size="${b.sz}" font-family="Helvetica, Arial, sans-serif" font-weight="700" fill="${col}">${esc(l)}</text>`).join('');
      body += `<rect class="mk-hit" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="rgba(0,0,0,0)"/>`;
    } else body = `<path d="${markPath(k)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>` + (hitW ? `<path class="mk-hit" d="${markPath(k)}" fill="none" stroke="rgba(0,0,0,0)" stroke-width="${hitW}"/>` : '');
    return `<g data-mark="${esc(k.id)}" data-mark-type="${k.t}"${sel ? ' class="mk-sel"' : ''}>${body}</g>`;
  }
  function drawMarksCanvas(g, marks, k) {
    marks.forEach(m => {
      g.save(); g.scale(k, k); g.strokeStyle = m.c || '#e0201b'; g.fillStyle = m.c || '#e0201b'; g.lineWidth = m.w || 3; g.lineCap = 'round'; g.lineJoin = 'round';
      if (m.t !== 'text') g.stroke(new Path2D(markPath(m)));
      if (m.t === 'text' || m.t === 'callout') { const b = textBox(m); g.fillStyle = 'rgba(255,254,246,.92)'; g.fillRect(b.x, b.y, b.w, b.h); g.lineWidth = Math.max(1.5, (m.w || 3) * 0.7); g.strokeRect(b.x, b.y, b.w, b.h); g.fillStyle = m.c || '#e0201b'; g.font = `700 ${b.sz}px Helvetica, Arial, sans-serif`; b.lines.forEach((l, i) => g.fillText(l, b.x + b.sz * 0.4, b.y + b.sz * 0.25 + (i + 1) * b.sz * 1.25 - b.sz * 0.25)); }
      g.restore();
    });
  }
  async function exportMarkupPNG(st) {
    const cv = document.createElement('canvas'); cv.width = st.width; cv.height = st.height; const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    const { img } = await imageSize(st.bgUrl); g.drawImage(img, 0, 0, st.width, st.height); drawMarksCanvas(g, st.marks, 1);
    return await new Promise(res => cv.toBlob(res, 'image/png'));
  }
  const hexRgb = (L, hex) => { const h = String(hex || '#e0201b').replace('#', ''); return L.rgb(parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255); };
  function pdfMarks(L, page, font, marks, k, pageH) {
    marks.forEach(m => {
      const color = hexRgb(L, m.c), w = m.w || 3;
      if (m.t !== 'text') page.drawSvgPath(markPath(m), { x: 0, y: pageH, scale: k, borderColor: color, borderWidth: w, borderLineCap: L.LineCapStyle ? L.LineCapStyle.Round : undefined });
      if (m.t === 'text' || m.t === 'callout') {
        const b = textBox(m);
        page.drawRectangle({ x: b.x * k, y: pageH - (b.y + b.h) * k, width: b.w * k, height: b.h * k, color: L.rgb(1, 0.996, 0.965), opacity: 0.92, borderColor: color, borderWidth: Math.max(1.5, w * 0.7) * k });
        b.lines.forEach((l, i) => page.drawText(l.replace(/[^\x20-\x7e]/g, ''), { x: (b.x + b.sz * 0.4) * k, y: pageH - (b.y + b.sz * 0.25 + (i + 1) * b.sz * 1.25 - b.sz * 0.25) * k, size: b.sz * k, font, color }));
      }
    });
  }
  async function exportMarkupPDF(st) {
    const L = await pdflib();
    if (st.kind === 'pdf' && st.srcBytes) {
      const doc = await L.PDFDocument.load(st.srcBytes, { ignoreEncryption: true }); const page = doc.getPage(st.page - 1);
      if (!(page.getRotation().angle % 360)) {
        const { width, height } = page.getSize(), k = width / st.width; const font = await doc.embedFont(L.StandardFonts.HelveticaBold);
        pdfMarks(L, page, font, st.marks, k, height); return new Blob([await doc.save()], { type: 'application/pdf' });
      }
    }
    // images (and rotated PDF pages): the page picture with the redlines drawn as vectors on top
    const doc = await L.PDFDocument.create(), k = 0.75, page = doc.addPage([st.width * k, st.height * k]);
    const png = await (await fetch(st.bgUrl.startsWith('data:') ? st.bgUrl : await toPngDataUrl(st.bgUrl, st.width, st.height))).arrayBuffer();
    const im = await doc.embedPng(png); page.drawImage(im, { x: 0, y: 0, width: st.width * k, height: st.height * k });
    const font = await doc.embedFont(L.StandardFonts.HelveticaBold); pdfMarks(L, page, font, st.marks, k, st.height * k);
    return new Blob([await doc.save()], { type: 'application/pdf' });
  }
  async function toPngDataUrl(url, W, H) { const { img } = await imageSize(url); const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d').drawImage(img, 0, 0, W, H); return cv.toDataURL('image/png'); }

  /** Loads the source of a markup row (owner, or someone it was shared with) into a background picture. */
  async function loadMarkupSource(c, row) {
    const { data, error } = await c.client.storage.from(BUCKET).download(row.source_path);
    if (error || !data) throw new Error('The file could not be loaded' + (error?.message ? ' — ' + error.message : '.'));
    if (row.source_kind === 'pdf') { const bytes = new Uint8Array(await data.arrayBuffer()); const r = await renderPdfPage(bytes, row.page || 1); return { bgUrl: r.url, srcBytes: bytes }; }
    return { bgUrl: URL.createObjectURL(data), srcBytes: null };
  }

  async function openMarkup(w, c, id) {
    const { data: list } = await c.client.from('draw_markups').select('id,name,source_kind,updated_at').eq('owner_id', c.user.id).order('updated_at', { ascending: false }).limit(200);
    const head = (title, extra) => `<div class="du-work-head du-draw-head"><div><span class="du-kicker">DRAW · MARKUP</span><h1 id="mk-title">${esc(title)}</h1></div><div class="du-head-actions">${(list || []).length ? `<select id="mk-list" aria-label="My markups"><option value="">My markups…</option>${list.map(m => `<option value="${m.id}"${m.id === id ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select>` : ''}<button class="du-btn ghost" id="mk-new">New markup</button><button class="du-btn ghost" id="mk-back">My drawings</button>${extra || ''}</div></div>`;
    const bindHead = () => {
      const l = $q(w, '#mk-list'); if (l) l.onchange = e => { if (!e.target.value) return; history.replaceState(null, '', '#portal/draw?markup=' + e.target.value); c.openPortalTab('draw'); };
      $q(w, '#mk-new').onclick = () => { history.replaceState(null, '', '#portal/draw?markup=new'); c.openPortalTab('draw'); };
      $q(w, '#mk-back').onclick = () => { history.replaceState(null, '', '#portal/draw'); c.openPortalTab('draw'); };
    };
    if (!id || id === 'new') {
      w.innerHTML = head('Markup a file') + `<div class="dw21-mkstart" data-dw21-route="markup:new"><article class="du-glass"><h2>Upload an image or PDF</h2><p class="du-muted">JPG, PNG, WebP or PDF, up to 25 MB. For a PDF you pick the page to mark up. The file stays private in your account until you share it.</p>
        <label class="dw21-drop"><input type="file" id="mk-file" accept="image/jpeg,image/png,image/webp,application/pdf"><span>Choose a file</span></label>
        <div id="mk-pick" hidden><div class="du-two"><div class="du-field"><label>Page</label><select id="mk-page"></select></div><div class="du-field"><label>Name</label><input id="mk-name" maxlength="200"></div></div><div class="dw21-pickprev" id="mk-prev"></div><button class="du-btn primary" id="mk-start">Start marking up</button></div>
        <p class="du-muted dw21-small" id="mk-status" aria-live="polite"></p></article></div>`;
      bindHead();
      let file = null, bytes = null;
      const status = t => { $q(w, '#mk-status').textContent = t || ''; };
      const preview = async () => { const n = +$q(w, '#mk-page').value || 1; status('Rendering page ' + n + '…'); try { const r = await renderPdfPage(bytes, n); $q(w, '#mk-prev').innerHTML = `<img src="${r.url}" alt="Page ${n} preview">`; status(''); } catch (e) { status(e.message || String(e)); } };
      $q(w, '#mk-file').onchange = async e => {
        file = e.target.files[0]; if (!file) return;
        if (file.size > 25 * 1024 * 1024) { c.toast('That file is larger than 25 MB.', true); return; }
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (!isPdf && !/^image\/(jpeg|png|webp)$/.test(file.type)) { c.toast('Use a JPG, PNG, WebP or PDF file.', true); return; }
        $q(w, '#mk-name').value = file.name.replace(/\.[^.]+$/, '').slice(0, 200) || 'Markup';
        const sel = $q(w, '#mk-page');
        if (isPdf) {
          status('Reading the PDF…'); bytes = new Uint8Array(await file.arrayBuffer());
          try { const n = await pdfPageCount(bytes); sel.innerHTML = Array.from({ length: n }, (_, i) => `<option value="${i + 1}">Page ${i + 1} of ${n}</option>`).join(''); sel.disabled = n < 2; sel.onchange = preview; $q(w, '#mk-pick').hidden = false; await preview(); }
          catch (err) { status('That PDF could not be opened — ' + (err.message || err)); return; }
        } else { bytes = null; sel.innerHTML = '<option value="1">Image</option>'; sel.disabled = true; $q(w, '#mk-prev').innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Preview">`; $q(w, '#mk-pick').hidden = false; status(''); }
      };
      $q(w, '#mk-start').onclick = async () => {
        if (!file) return; const btn = $q(w, '#mk-start'); btn.disabled = true;
        try {
          const isPdf = !!bytes, page = isPdf ? (+$q(w, '#mk-page').value || 1) : 1;
          status(isPdf ? 'Preparing the page…' : 'Reading the image…');
          let width, height, pageCount = 1;
          if (isPdf) { const r = await renderPdfPage(bytes, page); width = r.width; height = r.height; pageCount = r.pages; }
          else { const r = await imageSize(URL.createObjectURL(file)); width = r.width; height = r.height; }
          status('Uploading…');
          const ext = isPdf ? 'pdf' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
          const path = `${c.user.id}/markups/${uuid()}.${ext}`;
          const up = await c.client.storage.from(BUCKET).upload(path, file, { contentType: isPdf ? 'application/pdf' : file.type });
          if (up.error) throw up.error;
          const { data, error } = await c.client.from('draw_markups').insert({ owner_id: c.user.id, name: ($q(w, '#mk-name').value || '').trim() || 'Markup', source_path: path, source_kind: isPdf ? 'pdf' : 'image', source_name: file.name.slice(0, 200), page, page_count: pageCount, width, height, marks: [] }).select('id').single();
          if (error) throw error;
          history.replaceState(null, '', '#portal/draw?markup=' + data.id); c.openPortalTab('draw');
        } catch (e) { status(''); c.toast('Not saved — ' + (e.message || e), true); btn.disabled = false; }
      };
      return;
    }
    const { data: row, error } = await c.client.from('draw_markups').select('*').eq('id', id).eq('owner_id', c.user.id).maybeSingle();
    if (error) throw error;
    if (!row) { w.innerHTML = head('Markup not found') + '<div class="du-empty" data-dw21-route="markup:' + esc(id) + '"><p>This markup is not in your account.</p></div>'; bindHead(); return; }
    w.innerHTML = head(row.name, '') + `<div data-dw21-route="markup:${esc(id)}"><p class="du-muted dw21-small" id="mk-loading">Loading the file…</p></div>`; bindHead();
    let src;
    try { src = await loadMarkupSource(c, row); } catch (e) { $q(w, '#mk-loading').textContent = e.message || String(e); return; }
    const host = $q(w, '[data-dw21-route]');
    markupEditor(host, c, row, src, { editable: true });
  }

  /** The markup canvas. opts.editable false = read-only viewer (shared links). */
  function markupEditor(host, c, row, src, opts) {
    const st = { width: row.width, height: row.height, marks: Array.isArray(row.marks) ? JSON.parse(JSON.stringify(row.marks)) : [], bgUrl: src.bgUrl, srcBytes: src.srcBytes, kind: row.source_kind, page: row.page || 1 };
    const ed = opts.editable;
    let tool = ed ? 'pen' : 'select', color = '#e0201b', weight = 1, sel = null, draft = null, undo = [], zoom = 1, saveTimer = null, saving = false, drag = null;
    const baseW = Math.max(2, Math.round(st.width / 400)), baseT = Math.max(14, Math.round(st.width / 55));
    host.innerHTML = `<div class="dw21-mkbar">${ed ? `<div class="du-draw-tools dw21-mktools" role="toolbar" aria-label="Markup tools">${MK_TOOLS.map(([k, l]) => `<button type="button" data-mk="${k}" class="${k === tool ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="dw21-mkopts"><div class="dw21-colors" role="group" aria-label="Color">${MK_COLORS.map(([v, l], i) => `<button type="button" data-color="${v}" title="${l}" aria-label="${l}" class="${i ? '' : 'on'}" style="--c:${v}"></button>`).join('')}</div>
        <label>Line <select id="mk-weight"><option value="0.6">Thin</option><option value="1" selected>Medium</option><option value="1.8">Thick</option></select></label>
        <button type="button" class="dw21-btn" id="mk-undo">Undo</button><button type="button" class="dw21-btn" id="mk-del">Delete</button><span id="mk-save" class="du-save-status"></span></div>` : ''}
      <div class="dw21-mkopts"><button type="button" class="dw21-btn" id="mk-zout" aria-label="Zoom out">−</button><button type="button" class="dw21-btn" id="mk-fit">Fit</button><button type="button" class="dw21-btn" id="mk-zin" aria-label="Zoom in">+</button><span class="dw21-flex"></span><button type="button" class="dw21-btn" id="mk-png">Export PNG</button><button type="button" class="dw21-btn" id="mk-pdf">Export PDF</button>${ed ? '<button type="button" class="dw21-btn primary" id="mk-share">Share</button>' : ''}</div></div>
      <div class="dw21-stagewrap" id="mk-wrap"><div class="dw21-stage" id="mk-stage" style="aspect-ratio:${st.width}/${st.height}"><img id="mk-bg" src="${st.bgUrl}" alt="${esc(row.name)}" draggable="false"><svg id="mk-svg" viewBox="0 0 ${st.width} ${st.height}" preserveAspectRatio="none" class="${ed ? 'dw21-draw-on' : ''}"></svg></div></div>
      <p class="du-muted dw21-small">${row.source_kind === 'pdf' ? `PDF page ${row.page} of ${row.page_count}. ` : ''}${ed ? 'Draw with the mouse, a pen or a finger. Text callouts: drag from the spot to where the note goes.' : 'Read only.'}</p>`;
    const svg = $q(host, '#mk-svg'), stage = $q(host, '#mk-stage'), wrap = $q(host, '#mk-wrap');
    const setSave = (t, bad) => { const e = $q(host, '#mk-save'); if (e) { e.textContent = t; e.style.color = bad ? '#ff9a9a' : ''; } };
    const fit = () => { const avail = wrap.clientWidth - 2; zoom = Math.max(0.05, avail / st.width); stage.style.width = Math.round(st.width * zoom) + 'px'; };
    const setZoom = z => { zoom = Math.max(0.05, Math.min(4, z)); stage.style.width = Math.round(st.width * zoom) + 'px'; draw(); };
    function draw() {
      const k = st.width / Math.max(1, stage.clientWidth || st.width), hit = 14 * k;
      svg.innerHTML = st.marks.map(m => markSVG(m, sel === m.id, hit)).join('') + (draft ? markSVG(draft, false, 0) : '');
    }
    function scheduleSave() { if (!ed) return; setSave('Saving…'); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 500); }
    async function saveNow() { if (saving) { scheduleSave(); return; } saving = true; const { error } = await c.client.from('draw_markups').update({ marks: st.marks, updated_at: new Date().toISOString() }).eq('id', row.id).eq('owner_id', c.user.id); saving = false; if (error) { setSave('Not saved — ' + error.message, true); return; } setSave('Saved'); }
    const commit = () => { undo.push(JSON.stringify(st.marks)); if (undo.length > 100) undo.shift(); };
    const pt = ev => { const q = svg.createSVGPoint(); q.x = ev.clientX; q.y = ev.clientY; const r = q.matrixTransform(svg.getScreenCTM().inverse()); return [Math.round(Math.max(0, Math.min(st.width, r.x)) * 10) / 10, Math.round(Math.max(0, Math.min(st.height, r.y)) * 10) / 10]; };
    const mid = () => 'm_' + Math.random().toString(36).slice(2, 9);
    if (ed) {
      host.querySelectorAll('[data-mk]').forEach(b => b.onclick = () => { tool = b.dataset.mk; host.querySelectorAll('[data-mk]').forEach(x => x.classList.toggle('on', x === b)); svg.classList.toggle('dw21-draw-on', tool !== 'select'); if (tool !== 'select') sel = null; draw(); });
      host.querySelectorAll('[data-color]').forEach(b => b.onclick = () => { color = b.dataset.color; host.querySelectorAll('[data-color]').forEach(x => x.classList.toggle('on', x === b)); const m = st.marks.find(x => x.id === sel); if (m) { commit(); m.c = color; draw(); scheduleSave(); } });
      $q(host, '#mk-weight').onchange = e => { weight = +e.target.value; };
      $q(host, '#mk-undo').onclick = () => { const p = undo.pop(); if (p == null) { c.toast('Nothing to undo.'); return; } st.marks = JSON.parse(p); sel = null; draw(); scheduleSave(); };
      const del = () => { if (!sel) return; commit(); st.marks = st.marks.filter(m => m.id !== sel); sel = null; draw(); scheduleSave(); };
      $q(host, '#mk-del').onclick = del;
      const onKey = e => { if (!host.isConnected) { document.removeEventListener('keydown', onKey); return; } if (document.getElementById('dw21-share-dlg') || (e.target.closest && e.target.closest('input,select,textarea'))) return; if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); $q(host, '#mk-undo').click(); } }; document.addEventListener('keydown', onKey);
      $q(host, '#mk-share').onclick = () => shareDialog(c, { kind: 'markup', id: row.id, name: row.name });
      svg.addEventListener('pointerdown', ev => {
        if (ev.button !== 0) return; const p = pt(ev);
        if (tool === 'select') { const g = ev.target.closest('[data-mark]'); sel = g ? g.dataset.mark : null; if (sel) drag = { id: sel, start: p, before: JSON.stringify(st.marks), moved: false }; draw(); if (sel) { try { svg.setPointerCapture(ev.pointerId); } catch (_e) { /* */ } } return; }
        ev.preventDefault(); try { svg.setPointerCapture(ev.pointerId); } catch (_e) { /* */ }
        const base = { id: mid(), c: color, w: Math.round(baseW * weight * 10) / 10 };
        if (tool === 'pen') draft = Object.assign(base, { t: 'pen', pts: [p] });
        else if (tool === 'text') draft = Object.assign(base, { t: 'callout', a: p, b: p, text: '…', size: baseT });
        else draft = Object.assign(base, { t: tool, a: p, b: p });
        draw();
      });
      svg.addEventListener('pointermove', ev => {
        const p = pt(ev);
        if (drag) { const dx = p[0] - drag.start[0], dy = p[1] - drag.start[1]; if (!drag.moved && Math.hypot(dx, dy) < 3) return; drag.moved = true; const orig = JSON.parse(drag.before).find(m => m.id === drag.id), m = st.marks.find(x => x.id === drag.id); const mv = q => [q[0] + dx, q[1] + dy]; ['a', 'b', 'at'].forEach(k => { if (orig[k]) m[k] = mv(orig[k]); }); if (orig.pts) m.pts = orig.pts.map(mv); draw(); return; }
        if (!draft) return;
        if (draft.t === 'pen') { const l = draft.pts[draft.pts.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) >= 2) draft.pts.push(p); } else draft.b = p;
        draw();
      });
      const finish = () => {
        if (drag) { if (drag.moved) { undo.push(drag.before); scheduleSave(); } drag = null; return; }
        if (!draft) return; const d = draft; draft = null;
        const size = d.t === 'pen' ? d.pts.length : Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
        if (d.t === 'callout') {
          const t = (window.prompt('Callout text', '') || '').trim(); if (!t) { draw(); return; }
          d.text = t.slice(0, 500); if (size < 8) { d.t = 'text'; d.at = d.a; delete d.a; delete d.b; }
        } else if ((d.t === 'pen' && size < 2) || (d.t !== 'pen' && size < 6)) { draw(); return; }
        commit(); st.marks.push(d); sel = null; draw(); scheduleSave();
      };
      svg.addEventListener('pointerup', finish); svg.addEventListener('pointercancel', finish);
      setSave('Saved');
    }
    $q(host, '#mk-fit').onclick = () => { fit(); draw(); };
    $q(host, '#mk-zin').onclick = () => setZoom(zoom * 1.25); $q(host, '#mk-zout').onclick = () => setZoom(zoom / 1.25);
    const base = (row.name || 'Markup').replace(/[^\w.-]+/g, '-') + '-markup';
    $q(host, '#mk-png').onclick = async () => { try { download(base + '.png', await exportMarkupPNG(st), 'image/png'); } catch (e) { c.toast('Export failed — ' + (e.message || e), true); } };
    $q(host, '#mk-pdf').onclick = async () => { const b = $q(host, '#mk-pdf'); b.disabled = true; try { download(base + '.pdf', await exportMarkupPDF(st), 'application/pdf'); } catch (e) { c.toast('Export failed — ' + (e.message || e), true); } b.disabled = false; };
    fit(); draw();
    window.__dw21Markup = st; // read by the browser tests
  }

  /* ============================================================ sharing */
  async function createShare(c, target, scope) {
    const rec = { owner_id: c.user.id, drawing_id: target.kind === 'drawing' ? target.id : null, markup_id: target.kind === 'markup' ? target.id : null, firm_id: scope.firm_id || null, chat_id: scope.chat_id || null, note: scope.note || null };
    const { data, error } = await c.client.from('draw_shares').insert(rec).select('id,token').single();
    if (error) throw error;
    if (scope.people && scope.people.length) { const { error: e2 } = await c.client.from('draw_share_people').insert(scope.people.map(u => ({ share_id: data.id, user_id: u }))); if (e2) throw e2; }
    return data;
  }
  async function shareDialog(c, target) {
    document.getElementById('dw21-share-dlg')?.remove();
    const what = target.kind === 'drawing' ? 'drawing' : 'markup';
    document.body.insertAdjacentHTML('beforeend', `<div id="dw21-share-dlg" class="dw21-modal" role="dialog" aria-modal="true" aria-label="Share"><div class="dw21-modal-card du-glass">
      <button type="button" class="dw21-x" aria-label="Close">×</button><span class="du-kicker">SHARE ${what.toUpperCase()}</span><h2>${esc(target.name)}</h2>
      <p class="du-muted dw21-small">A link opens only for the people you share it with. Anyone else who gets the link sees “not shared with you”. Saving happens as you work; every link opens the latest version.</p>
      <section><h3>Send to a person</h3><input id="dw21-ppl-q" class="dw21-input" placeholder="Search people by name or @username" autocomplete="off"><div id="dw21-ppl" class="dw21-list"></div></section>
      <section><h3>Post in a chat</h3><div id="dw21-chats" class="dw21-list"><p class="du-muted dw21-small">Loading your chats…</p></div></section>
      <section id="dw21-firm-sec" hidden><h3>Everyone at my firm</h3><div id="dw21-firms" class="dw21-list"></div></section>
      <section><h3>Links already shared</h3><div id="dw21-existing" class="dw21-list"><p class="du-muted dw21-small">Loading…</p></div></section>
      <div class="dw21-linkout" id="dw21-linkout" hidden><label>Link<input id="dw21-link" class="dw21-input" readonly></label><button type="button" class="du-btn ghost" id="dw21-copy-again">Copy</button></div></div></div>`);
    const dlg = document.getElementById('dw21-share-dlg'), onEsc = e => { if (e.key === 'Escape') close(); }, close = () => { dlg.remove(); document.removeEventListener('keydown', onEsc); window.removeEventListener('hashchange', close); };
    dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('.dw21-x')) close(); });
    document.addEventListener('keydown', onEsc); window.addEventListener('hashchange', close);
    const showLink = async (token, msg) => { const url = shareUrl(token); $q(dlg, '#dw21-linkout').hidden = false; const i = $q(dlg, '#dw21-link'); i.value = url; i.select(); const ok = await copyText(url); c.toast((msg || 'Link ready') + (ok ? ' — copied.' : ' — copy it from the box.')); loadExisting(); };
    $q(dlg, '#dw21-copy-again').onclick = async () => { const ok = await copyText($q(dlg, '#dw21-link').value); c.toast(ok ? 'Copied.' : 'Select the link and copy it.'); };
    const link = (name, token) => `${target.kind === 'drawing' ? 'Shared a drawing' : 'Shared a markup'} with you: ${name}\n${shareUrl(token)}`;
    // people
    let timer = null; const pq = $q(dlg, '#dw21-ppl-q'), plist = $q(dlg, '#dw21-ppl');
    pq.oninput = () => { clearTimeout(timer); timer = setTimeout(async () => {
      const q = pq.value.trim().replace(/[%_,()]/g, ''); if (q.length < 2) { plist.innerHTML = ''; return; }
      const { data } = await c.client.from('profiles').select('id,display_name,username,title').or(`display_name.ilike.%${q}%,username.ilike.%${q}%`).neq('id', c.user.id).limit(8);
      plist.innerHTML = (data || []).length ? data.map(p => `<div class="dw21-li" data-person="${p.id}"><span><b>${esc(p.display_name || p.username || 'Member')}</b>${p.username ? ` <small>@${esc(p.username)}</small>` : ''}</span><span><button type="button" class="du-btn ghost" data-pcopy>Copy link</button><button type="button" class="du-btn primary" data-psend>Send in Messages</button></span></div>`).join('') : '<p class="du-muted dw21-small">No one found.</p>';
      plist.querySelectorAll('[data-person]').forEach(li => {
        const uid = li.dataset.person, name = li.querySelector('b').textContent;
        li.querySelector('[data-pcopy]').onclick = async () => { try { const s = await createShare(c, target, { people: [uid], note: 'For ' + name }); showLink(s.token, 'Link for ' + name); } catch (e) { c.toast(e.message || String(e), true); } };
        li.querySelector('[data-psend]').onclick = async () => {
          try { const s = await createShare(c, target, { people: [uid], note: 'Sent to ' + name }); const { error } = await c.client.from('direct_messages').insert({ sender_id: c.user.id, recipient_id: uid, body: link(target.name, s.token) }); if (error) throw error;
            c.toast('Sent to ' + name + ' in Messages.'); close(); if (window.DrawUpConnect?.messageUser) window.DrawUpConnect.messageUser(uid, name); }
          catch (e) { c.toast('Not sent — ' + (e.message || e), true); }
        };
      });
    }, 250); };
    // chats
    (async () => {
      const box = $q(dlg, '#dw21-chats'); const { data, error } = await c.client.rpc('connect_my_chats');
      if (error || !(data || []).length) { box.innerHTML = '<p class="du-muted dw21-small">' + (error ? 'Chats could not load.' : 'You are not in any group or firm chats yet.') + '</p>'; return; }
      box.innerHTML = data.map(ch => `<div class="dw21-li" data-chat="${ch.id}"><span><b>${esc(ch.name || 'Group chat')}</b> <small>${ch.kind === 'firm' ? 'Firm chat' : 'Group'} · ${ch.member_count || 0} people</small></span><button type="button" class="du-btn primary">Post here</button></div>`).join('');
      box.querySelectorAll('[data-chat]').forEach(li => li.querySelector('button').onclick = async () => {
        try { const ch = data.find(x => x.id === li.dataset.chat); const s = await createShare(c, target, { chat_id: ch.id, note: 'Posted in ' + (ch.name || 'chat') });
          const { error: e2 } = await c.client.from('connect_chat_messages').insert({ chat_id: ch.id, author_id: c.user.id, body: link(target.name, s.token) }); if (e2) throw e2;
          showLink(s.token, 'Posted in ' + (ch.name || 'the chat') + '. Members of that chat can open it'); }
        catch (e) { c.toast('Not posted — ' + (e.message || e), true); }
      });
    })();
    // firms
    (async () => {
      const { data } = await c.client.from('firm_members').select('firm_id,firms(name)').eq('user_id', c.user.id);
      if (!(data || []).length) return; $q(dlg, '#dw21-firm-sec').hidden = false;
      const box = $q(dlg, '#dw21-firms'); box.innerHTML = data.map(f => `<div class="dw21-li" data-firm="${f.firm_id}"><span><b>${esc(f.firms?.name || 'My firm')}</b> <small>all members</small></span><button type="button" class="du-btn ghost">Copy firm link</button></div>`).join('');
      box.querySelectorAll('[data-firm]').forEach(li => li.querySelector('button').onclick = async () => { try { const s = await createShare(c, target, { firm_id: li.dataset.firm, note: 'Everyone at ' + li.querySelector('b').textContent }); showLink(s.token, 'Firm link ready'); } catch (e) { c.toast(e.message || String(e), true); } });
    })();
    async function loadExisting() {
      const col = target.kind === 'drawing' ? 'drawing_id' : 'markup_id', box = $q(dlg, '#dw21-existing');
      const { data } = await c.client.from('draw_shares').select('id,token,note,created_at,revoked_at').eq(col, target.id).eq('owner_id', c.user.id).is('revoked_at', null).order('created_at', { ascending: false }).limit(20);
      box.innerHTML = (data || []).length ? data.map(s => `<div class="dw21-li" data-share="${s.id}"><span>${esc(s.note || 'Shared link')} <small>${new Date(s.created_at).toLocaleDateString()}</small></span><span><button type="button" class="du-btn ghost" data-scopy="${s.token}">Copy</button><button type="button" class="du-btn ghost" data-srevoke>Stop sharing</button></span></div>`).join('') : '<p class="du-muted dw21-small">Not shared yet.</p>';
      box.querySelectorAll('[data-scopy]').forEach(b => b.onclick = () => showLink(b.dataset.scopy, 'Link ready'));
      box.querySelectorAll('[data-srevoke]').forEach(b => b.onclick = async () => { const id = b.closest('[data-share]').dataset.share; const { error } = await c.client.from('draw_shares').update({ revoked_at: new Date().toISOString() }).eq('id', id); if (error) { c.toast(error.message, true); return; } c.toast('That link no longer opens.'); loadExisting(); });
    }
    loadExisting();
    setTimeout(() => pq.focus(), 50);
  }

  /* ============================================================ opening a share link */
  async function openShare(w, c, token) {
    w.innerHTML = `<div data-dw21-route="share:${esc(token)}"><div class="du-loading">OPENING SHARED LINK…</div></div>`;
    const host = $q(w, '[data-dw21-route]');
    const ok = /^[0-9a-f-]{36}$/i.test(token);
    const { data, error } = ok ? await c.client.rpc('draw_share_open', { p_token: token }) : { data: null, error: null };
    const back = '<button class="du-btn ghost" data-dw21-mine>My drawings</button>';
    if (error || !data) {
      host.innerHTML = `<article class="du-glass du-wide dw21-noshare"><span class="du-kicker">SHARED LINK</span><h2>This link isn’t shared with you.</h2><p class="du-muted">Only the people the owner chose can open it. Ask them to share it with your DrawUp account.</p>${back}</article>`;
      bindMine(host, c); return;
    }
    const by = data.is_owner ? 'You shared this' : 'Shared by ' + esc(data.owner_name || 'a DrawUp member');
    if (data.kind === 'markup') {
      const mk = data.markup;
      host.innerHTML = `<div class="du-work-head du-draw-head"><div><span class="du-kicker">SHARED MARKUP · ${by}</span><h1>${esc(mk.name)}</h1></div><div class="du-head-actions">${data.is_owner ? `<button class="du-btn ghost" data-dw21-edit>Open in editor</button>` : ''}${back}</div></div><div id="dw21-shared-mk"><p class="du-muted dw21-small">Loading the file…</p></div>`;
      bindMine(host, c);
      const ed = $q(host, '[data-dw21-edit]'); if (ed) ed.onclick = () => { history.replaceState(null, '', '#portal/draw?markup=' + mk.id); c.openPortalTab('draw'); };
      try { const src = await loadMarkupSource(c, mk); markupEditor($q(host, '#dw21-shared-mk'), c, mk, src, { editable: false }); }
      catch (e) { $q(host, '#dw21-shared-mk').innerHTML = `<p class="du-draw-warn">${esc(e.message || e)}</p>`; }
      return;
    }
    const D = window.DrawUpDrawCore, E = window.DrawUpElev, dr = data.drawing; const model = D.normalizeModel(dr.model), scale = dr.scale_denominator || 48;
    if (!Array.isArray(model.cameras)) model.cameras = [];
    let view = 'plan', camId = null;
    host.innerHTML = `<div class="du-work-head du-draw-head"><div><span class="du-kicker">SHARED DRAWING · ${by} · REV ${dr.revision || 1}</span><h1>${esc(dr.name)}</h1></div><div class="du-head-actions">${data.is_owner ? '<button class="du-btn ghost" data-dw21-edit>Open in editor</button>' : '<button class="du-btn primary" data-dw21-copy>Save a copy to my drawings</button>'}${back}</div></div>
      <div class="dw21-row"><div class="dw21-seg" role="group" aria-label="View"><button type="button" data-sview="plan" class="on">Floor plan</button><button type="button" data-sview="elevation">Elevation</button><button type="button" data-sview="section">Section</button></div><select id="dw21-scam" hidden aria-label="Camera"></select><span class="dw21-flex"></span><button type="button" class="dw21-btn" id="dw21-sx-pdf">PDF</button><button type="button" class="dw21-btn" id="dw21-sx-svg">SVG</button></div>
      <div class="dw21-shared-canvas" id="dw21-shared-canvas"></div><p class="du-muted dw21-small">Read only. Dimensions are computed from the drawing geometry.</p>`;
    bindMine(host, c);
    const cv = $q(host, '#dw21-shared-canvas'), sc = $q(host, '#dw21-scam');
    const camsOf = k => { let list = model.cameras.filter(x => x.kind === k); if (!list.length && E) list = k === 'elevation' ? E.defaultElevations(model) : [E.defaultSection(model, 'A')]; return list; };
    const draw = () => {
      if (view === 'plan') { cv.innerHTML = D.toSVG(model, scale, { ink: '#0d1b2a', poche: '#b9c6d3', paper: '#ffffff' }); const s = cv.querySelector('svg'); if (E) s.insertAdjacentHTML('beforeend', E.planOverlay(model, scale, null)); sc.hidden = true; }
      else { const list = camsOf(view); if (!list.find(x => x.id === camId)) camId = list[0].id; sc.hidden = false; sc.innerHTML = list.map(x => `<option value="${esc(x.id)}"${x.id === camId ? ' selected' : ''}>${esc(E.title(x))}</option>`).join(''); cv.innerHTML = E.toSVG(E.build(model, list.find(x => x.id === camId), scale)); }
      const s = cv.querySelector('svg'); s.setAttribute('width', '100%'); s.setAttribute('height', '100%');
    };
    host.querySelectorAll('[data-sview]').forEach(b => b.onclick = () => { view = b.dataset.sview; host.querySelectorAll('[data-sview]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    sc.onchange = () => { camId = sc.value; draw(); };
    const fname = (dr.sheet_number ? dr.sheet_number + '-' : '') + dr.name;
    $q(host, '#dw21-sx-pdf').onclick = () => { if (view === 'plan') download(fname.replace(/[^\w.-]+/g, '-') + '.pdf', binary(D.toPDF(model, scale, { project: 'Shared by ' + (data.owner_name || 'DrawUp member'), name: dr.name, sheet: dr.sheet_number || 'A101', revision: dr.revision || 1, date: new Date().toLocaleDateString() })), 'application/pdf'); else { const cam = camsOf(view).find(x => x.id === camId); download(fname.replace(/[^\w.-]+/g, '-') + '-' + E.title(cam).replace(/\W+/g, '-') + '.pdf', binary(E.toPDF(E.build(model, cam, scale), { name: dr.name })), 'application/pdf'); } };
    $q(host, '#dw21-sx-svg').onclick = () => { if (view === 'plan') download(fname.replace(/[^\w.-]+/g, '-') + '.svg', D.toSVG(model, scale, { paperSize: true }), 'image/svg+xml'); else { const cam = camsOf(view).find(x => x.id === camId); download(fname.replace(/[^\w.-]+/g, '-') + '.svg', E.toSVG(E.build(model, cam, scale), { paperSize: true }), 'image/svg+xml'); } };
    const ed = $q(host, '[data-dw21-edit]'); if (ed) ed.onclick = () => { history.replaceState(null, '', '#portal/draw?id=' + dr.id); c.openPortalTab('draw'); };
    const cp = $q(host, '[data-dw21-copy]'); if (cp) cp.onclick = async () => { cp.disabled = true; const { data: nd, error: e2 } = await c.client.from('drawings').insert({ owner_id: c.user.id, name: (dr.name + ' (copy)').slice(0, 200), sheet_number: dr.sheet_number, scale_denominator: scale, model }).select('id').single(); if (e2) { c.toast('Not saved — ' + e2.message, true); cp.disabled = false; return; } c.toast('Saved a copy to your drawings.'); history.replaceState(null, '', '#portal/draw?id=' + nd.id); c.openPortalTab('draw'); };
    draw();
  }
  function bindMine(host, c) { const b = $q(host, '[data-dw21-mine]'); if (b) b.onclick = () => { history.replaceState(null, '', '#portal/draw'); c.openPortalTab('draw'); }; }

  window.DrawUpDrawV21 = { attach, route, decorateStart, markPath, shareDialog };
})();
