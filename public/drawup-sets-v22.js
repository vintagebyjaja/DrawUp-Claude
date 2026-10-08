/* DrawUp V22 Project drawing sets.
 * Upload a full drawing set PDF to a project. The browser splits it page by page (pdf-lib),
 * reads each sheet number and title from the page text (pdf.js, title block at bottom right),
 * and files every sheet as its own single page PDF into discipline folders 01 General to
 * 10 Electrical, with sheet type subfolders 0 General to 9 Misc. Pages with no readable sheet
 * number go to "Unsorted, needs a sheet number". Each discipline folder can be opened on its own,
 * refiled by hand, and sent alone to DrawUp Check with "Review this set".
 * Mounted from drawup-portal-v17.js renderProject via window.DrawUpSets.mount(w, project).
 */
(function () {
  'use strict';
  const BUCKET = 'drawup-project-sets';
  const PDFJS = '/vendor/pdfjs-3.11.174/pdf.min.js', PDFJS_WORKER = '/vendor/pdfjs-3.11.174/pdf.worker.min.js', PDFLIB = '/vendor/pdf-lib-1.17.1.min.js';
  const CHECK_MAX = 32 * 1024 * 1024, TUS_MIN = 6 * 1024 * 1024, TUS_CHUNK = 6 * 1024 * 1024;
  // Discipline designators and organization (Jaja's chart): folder number, designator letter, folder name.
  const DISC = [['01', 'G', 'General'], ['02', 'C', 'Civil'], ['03', 'L', 'Landscape'], ['04', 'S', 'Structural'], ['05', 'A', 'Architecture'],
    ['06', 'I', 'Interiors'], ['07', 'F', 'Fire Protection'], ['08', 'P', 'Plumbing'], ['09', 'M', 'Mechanical'], ['10', 'E', 'Electrical']];
  // Sheet type designators: first digit of the sheet number.
  const TYPES = ['General', 'Floor Plans', 'Reflected Ceiling Plans', 'Elevations/Sections', 'Enlarged Plans', 'Stairs and Conveying',
    'Details', 'Special Construction', 'Doors and Windows', 'Misc'];
  // Sub-types from the last two digits. Ranges between the chart's values (for example 6-20s) are DrawUp's reading of the chart.
  const SERIES = {
    3: [[0, 29, '00', 'Building elevations'], [30, 39, '30', 'Building sections'], [40, 49, '40', 'Wall sections']],
    6: [[0, 9, '00', 'Plan details'], [10, 29, '10', 'Section details'], [30, 39, '30', 'Roof details'], [40, 49, '40', 'Ceiling details']],
    8: [[0, 19, '00', 'Door schedule and details'], [20, 29, '20', 'Window schedule and details']],
  };
  const SERIES_LABEL = (t, code) => ((SERIES[t] || []).find(r => r[2] === code) || [])[3] || '';
  const RX = /^([GCLSAIFPME])([A-Z])?([-. ]?)(\d)(\d{0,2})(?:\.(\d{1,3}))?([A-Z])?$/;
  const LABEL_NO = /\b(SHEET|DWG\.?|DRAWING)\s*(NO\.?|NUMBER|#)(?=\s|:|$)|^SHEET\s*:?$/i;
  const LABEL_TITLE = /^(SHEET|DRAWING|DWG\.?)\s*TITLE\s*:?\s*/i;
  const LABELISH = /^(SHEET|SCALE|DATE|DRAWN|CHECKED|PROJECT|JOB|REV|REVISION|ISSUE|SEAL|NO\.?|NUMBER|DRAWING|DWG|APPROVED|BY|TITLE|CLIENT|OWNER|COPYRIGHT|NOT FOR)\b/i;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const client = () => window.drawupSupabaseClient;
  const discName = c => { const d = DISC.find(x => x[0] === c); return d ? d[0] + ' ' + d[2] : 'Unsorted'; };
  const natural = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true });
  const loaded = {};
  function loadScript(src) { if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Could not load ' + src)); }; document.head.appendChild(s); }); return loaded[src]; }
  async function pdfjs() { if (!window.pdfjsLib) await loadScript(PDFJS); window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return window.pdfjsLib; }
  async function pdflib() { if (!window.PDFLib) await loadScript(PDFLIB); return window.PDFLib; }
  (function css() { if (!document.querySelector('link[href*="drawup-sets-v22.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/drawup-sets-v22.css?v=22.0'; document.head.appendChild(l); } })();

  /* ---------------------------------------------------------------- sheet number reading */
  function classify(raw) {
    const t = String(raw || '').trim().toUpperCase();
    const m = RX.exec(t); if (!m) return null;
    if (m[3] === ' ' && (m[5] || '').length < 2) return null; // "A 1" is too loose to trust
    const d = DISC.find(x => x[1] === m[1]); if (!d) return null;
    const type = +m[4], seq = parseInt(m[5] || m[6] || '0', 10);
    const sr = (SERIES[type] || []).find(r => seq >= r[0] && seq <= r[1]);
    return { number: t.replace(' ', ''), designator: m[1] + (m[2] || ''), discipline: d[0], sheet_type: type, sheet_series: sr ? sr[2] : null, digits: (m[4] + (m[5] || '') + (m[6] || '')).length };
  }
  function candidatesIn(s) {
    const U = s.toUpperCase().trim(), out = [];
    const T = U.replace(/^(SHEET|DWG\.?|DRAWING)\s*(NO\.?|NUMBER|#)?\s*[:.]?\s*/, '');
    const labeled = T !== U && T.length > 0;
    if (classify(T)) out.push({ num: T, whole: true, labeled });
    const toks = T.split(/\s+/);
    if (toks.length > 1) toks.forEach((k, i) => {
      const k2 = k.replace(/^[(\[]+|[)\],;:]+$/g, '');
      if (classify(k2)) out.push({ num: k2, whole: false, labeled: labeled && i === 0 });
      if (i < toks.length - 1 && /^[GCLSAIFPME][A-Z]?$/.test(k) && /^\d{3}$/.test(toks[i + 1])) out.push({ num: k + toks[i + 1], whole: false, labeled: labeled && i === 0 });
    });
    return out;
  }
  // items: [{s, x, y, size}] with x, y as fractions of the page, y measured from the top.
  function readSheet(items) {
    items = (items || []).filter(i => i && i.s && String(i.s).trim());
    if (!items.length) return { number: null, title: null, reason: 'no text on this page' };
    const sizes = items.map(i => i.size || 8).sort((a, b) => a - b), median = sizes[Math.floor(sizes.length / 2)] || 8;
    // Join items that sit on one line (CAD exports often split "A" and "101").
    const lines = [], sorted = items.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    sorted.forEach(i => { const l = lines.find(L => Math.abs(L.y - i.y) < 0.006 && i.x - L.end < 0.05 && i.x >= L.x); if (l) { l.s += ' ' + i.s; l.end = i.x + (i.w || 0); l.size = Math.max(l.size, i.size); l.n++; } else lines.push({ s: i.s, x: i.x, y: i.y, end: i.x + (i.w || 0), size: i.size, n: 1 }); });
    const labels = items.filter(i => LABEL_NO.test(i.s));
    const pool = items.concat(lines.filter(l => l.n > 1));
    const best = new Map();
    pool.forEach(it => candidatesIn(it.s).forEach(c => {
      const cls = classify(c.num); if (!cls) return;
      const near = c.labeled || labels.some(L => L !== it && ((it.y - L.y > -0.012 && it.y - L.y < 0.07 && Math.abs(L.x - it.x) < 0.14) || (Math.abs(L.y - it.y) < 0.012 && it.x > L.x && it.x - L.x < 0.2)));
      const rel = (it.size || 8) / median;
      const zone = (it.x > 0.6 && it.y > 0.6 && rel >= 1.2) || (it.x > 0.75 && it.y > 0.85);
      if (!near && !zone) return;
      if (!near && cls.digits < 2) return;
      const score = it.x * 2 + it.y * 2 + Math.min(3, rel) + (c.whole ? 1 : 0) + (near ? 4 : 0) + (c.labeled ? 2 : 0);
      const prev = best.get(cls.number); if (!prev || prev.score < score) best.set(cls.number, { ...cls, score, at: it });
    }));
    const pick = [...best.values()].sort((a, b) => b.score - a.score)[0];
    if (!pick) return { number: null, title: null, reason: 'no sheet number found in the title block' };
    return { ...pick, title: readTitle(items, pick, median), at: undefined };
  }
  function readTitle(items, c, median) {
    const at = c.at, num = c.number;
    const ok = i => i !== at && /[A-Z]{3}/i.test(i.s) && !classify(i.s.trim()) && !i.s.toUpperCase().includes(num) && !/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(i.s) && !LABEL_NO.test(i.s);
    const inline = items.find(i => LABEL_TITLE.test(i.s) && i.s.replace(LABEL_TITLE, '').trim().length > 2 && Math.abs(i.x - at.x) < 0.35 && Math.abs(i.y - at.y) < 0.3);
    if (inline) return inline.s.replace(LABEL_TITLE, '').trim();
    const lab = items.filter(i => LABEL_TITLE.test(i.s) && Math.abs(i.x - at.x) < 0.35 && Math.abs(i.y - at.y) < 0.3).sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y))[0];
    if (lab) {
      const below = items.filter(i => ok(i) && !LABELISH.test(i.s) && i.y > lab.y + 0.002 && i.y - lab.y < 0.07 && Math.abs(i.x - lab.x) < 0.2).sort((a, b) => a.y - b.y || a.x - b.x);
      if (below.length) return below.slice(0, 2).map(i => i.s.trim()).join(' ');
    }
    const near = items.filter(i => ok(i) && !LABELISH.test(i.s) && Math.abs(i.x - at.x) < 0.3 && i.y > at.y - 0.2 && i.y < at.y + 0.04 && (i.size || 8) >= median)
      .sort((a, b) => (b.size - a.size) || (Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y)));
    return near.length ? near[0].s.trim() : null;
  }
  async function pageItems(pdf, n) {
    const page = await pdf.getPage(n), vp = page.getViewport({ scale: 1 }), tc = await page.getTextContent();
    return tc.items.filter(t => t.str && t.str.trim()).map(t => {
      const p = vp.convertToViewportPoint(t.transform[4], t.transform[5]);
      return { s: t.str.trim(), x: p[0] / vp.width, y: p[1] / vp.height, w: (t.width || 0) / vp.width, size: Math.hypot(t.transform[2], t.transform[3]) || t.height || 8 };
    });
  }

  /* ---------------------------------------------------------------- storage */
  const b64 = s => btoa(unescape(encodeURIComponent(s)));
  async function token() { const { data } = await client().auth.getSession(); return data?.session?.access_token || ''; }
  // Large sets go straight to Supabase Storage with a resumable (TUS) upload in 6 MB pieces.
  async function tusUpload(bucket, path, blob, onProgress) {
    const c = client(), base = (c.storage?.url || (c.supabaseUrl + '/storage/v1')).replace(/\/$/, ''), tok = await token();
    const H = { authorization: 'Bearer ' + tok, apikey: c.supabaseKey, 'tus-resumable': '1.0.0', 'x-upsert': 'true' };
    const r = await fetch(base + '/upload/resumable', { method: 'POST', headers: { ...H, 'upload-length': String(blob.size), 'upload-metadata': 'bucketName ' + b64(bucket) + ',objectName ' + b64(path) + ',contentType ' + b64('application/pdf') + ',cacheControl ' + b64('3600') } });
    if (r.status !== 201) throw new Error('Resumable upload could not start (' + r.status + ').');
    let loc = r.headers.get('location'); if (!loc) throw new Error('Resumable upload gave no location.');
    if (!/^https?:/.test(loc)) loc = new URL(loc, base).href;
    let off = 0;
    while (off < blob.size) {
      const part = blob.slice(off, off + TUS_CHUNK);
      let tries = 0, p;
      for (;;) {
        p = await fetch(loc, { method: 'PATCH', headers: { ...H, 'upload-offset': String(off), 'content-type': 'application/offset+octet-stream' }, body: part }).catch(e => ({ status: 0, e }));
        if (p.status === 204 || tries++ >= 3) break;
        await new Promise(res => setTimeout(res, 800 * tries));
      }
      if (p.status !== 204) throw new Error('Upload stopped at ' + Math.round(100 * off / blob.size) + '% (' + p.status + ').');
      off = Number(p.headers.get('upload-offset')) || off + part.size;
      onProgress && onProgress(off / blob.size);
    }
  }
  async function upload(path, blob, onProgress) {
    if (blob.size >= (window.DrawUpSets._tusMin || TUS_MIN)) {
      try { await tusUpload(BUCKET, path, blob, onProgress); return 'resumable'; }
      catch (e) { console.warn('DrawUp sets: resumable upload failed, trying a single upload.', e.message); }
    }
    const { error } = await client().storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: true });
    if (error) throw new Error(error.message || 'Upload failed.');
    onProgress && onProgress(1); return 'single';
  }

  /* ---------------------------------------------------------------- state + data */
  const S = { w: null, p: null, uid: null, sets: [], set: null, sheets: [], reviews: [], focus: null, open: new Set(), busy: false, live: {} };
  async function load(keepSet) {
    const c = client();
    const r = await c.from('project_sets').select('*').eq('project_thread_id', S.p.id).order('created_at', { ascending: false });
    if (r.error) throw r.error;
    S.sets = r.data || [];
    S.set = (keepSet && S.sets.find(s => s.id === keepSet)) || S.sets[0] || null;
    if (S.set) {
      const [sh, rv] = await Promise.all([
        c.from('project_set_sheets').select('*').eq('set_id', S.set.id).order('page_no'),
        c.from('project_set_reviews').select('*').eq('set_id', S.set.id).order('created_at', { ascending: false }),
      ]);
      if (sh.error) throw sh.error; if (rv.error) throw rv.error;
      S.sheets = sh.data || []; S.reviews = rv.data || [];
    } else { S.sheets = []; S.reviews = []; }
  }
  const panel = () => S.w && S.w.querySelector('#du-sets');

  async function mount(w, p) {
    if (!w || !p || !p.id || !client()) return;
    S.w = w; S.p = p; S.focus = null; S.open = new Set();
    const { data } = await client().auth.getSession(); S.uid = data?.session?.user?.id || null;
    const grid = w.querySelector('.du-profile-grid') || w;
    w.querySelector('#du-sets')?.remove();
    const el = document.createElement('article');
    el.className = 'du-glass du-wide du-sets'; el.id = 'du-sets';
    el.innerHTML = '<div class="du-sets-loading">Loading drawing sets…</div>';
    grid.children[0] ? grid.children[0].after(el) : grid.appendChild(el);
    try { await load(); render(); resumeReviews(); }
    catch (e) { el.innerHTML = `<span class="du-kicker">DRAWING SETS</span><p>Drawing sets could not load: ${esc(e.message || e)}. Run the V22 migration 0050 and refresh.</p>`; }
  }

  /* ---------------------------------------------------------------- render */
  function folders() {
    const by = {}; DISC.forEach(d => by[d[0]] = []); by.u = [];
    S.sheets.forEach(s => (s.discipline && by[s.discipline] ? by[s.discipline] : by.u).push(s));
    Object.values(by).forEach(a => a.sort((x, y) => natural(x.sheet_number, y.sheet_number) || x.page_no - y.page_no));
    return by;
  }
  const latestReview = d => S.reviews.find(r => r.discipline === d);
  function chip(d) {
    const r = latestReview(d), live = S.live[d];
    if (live) return `<span class="du-sf-chip run">${esc(live)}</span>`;
    if (!r) return '';
    if (r.status === 'complete') return `<span class="du-sf-chip ${r.critical_count ? 'crit' : r.major_count ? 'major' : 'ok'}">${r.finding_count} finding${r.finding_count === 1 ? '' : 's'}${r.critical_count ? ' · ' + r.critical_count + ' critical' : ''}</span>`;
    if (r.status === 'failed') return '<span class="du-sf-chip crit">Review failed</span>';
    return '<span class="du-sf-chip run">Reviewing…</span>';
  }
  function sheetRow(s) {
    const t = s.sheet_type != null ? s.sheet_type + ' ' + TYPES[s.sheet_type] : '';
    const sub = s.sheet_series ? SERIES_LABEL(s.sheet_type, s.sheet_series) : '';
    return `<div class="du-sheet-row" data-sheet="${esc(s.id)}"><b class="du-sheet-num">${esc(s.sheet_number || 'No number')}</b><span class="du-sheet-ttl">${esc(s.sheet_title || (s.sheet_number ? 'Untitled sheet' : 'No sheet number found on this page'))}</span><small>Page ${s.page_no}${sub ? ' · ' + esc(sub) : ''}${s.filed_by === 'manual' ? ' · <i>filed by hand</i>' : ''}${!s.discipline && t ? ' · ' + esc(t) : ''}</small><span class="du-sheet-act"><button type="button" class="du-btn ghost" data-view="${esc(s.id)}">View</button><button type="button" class="du-btn ghost" data-refile="${esc(s.id)}">${s.sheet_number ? 'Refile' : 'Add number'}</button></span></div>`;
  }
  function reviewBlock(d, list) {
    const r = latestReview(d); const live = S.live[d];
    if (!r && !live) return '';
    if (!r) return `<div class="du-sf-review run"><b>${esc(live)}</b></div>`;
    const ids = list.map(s => s.id).sort().join(), was = (r.sheet_ids || []).slice().sort().join();
    const changed = r.status === 'complete' && ids !== was ? '<p class="du-sf-warn">This folder changed after the review. Run it again to include the changes.</p>' : '';
    const head = `<div class="du-sf-review-h"><span class="du-kicker">CHECK · ${esc(discName(d).toUpperCase())}</span><small>${esc(new Date(r.created_at).toLocaleString())} · ${(r.sheet_numbers || []).length} sheet${(r.sheet_numbers || []).length === 1 ? '' : 's'}: ${esc((r.sheet_numbers || []).join(', '))}</small></div>`;
    if (r.status === 'failed') return `<div class="du-sf-review">${head}<p class="du-sf-warn">${esc(r.error || 'The review failed.')}</p></div>`;
    if (r.status !== 'complete') return `<div class="du-sf-review run">${head}<p>${esc(live || 'Reviewing this consultant set…')}</p></div>`;
    const f = Array.isArray(r.findings) ? r.findings : [];
    return `<div class="du-sf-review">${head}${changed}<p class="du-sf-sum">${esc(String(r.summary || '').split('\n\n')[0])}</p>${f.length ? `<ol class="du-sf-findings">${f.map(x => `<li class="sev-${esc(x.severity)}"><span class="du-sev">${esc(x.severity)}</span><b>${esc(x.sheet || '')}${x.location ? ' · ' + esc(x.location) : ''}</b><p>${esc(x.issue)}</p>${x.recommendation ? `<p class="du-fix">Fix: ${esc(x.recommendation)}</p>` : ''}${x.reference ? `<small>${esc(x.reference)}</small>` : ''}</li>`).join('')}</ol>` : '<p>No findings in this set.</p>'}<p class="du-sf-note">Guidance for the design team from DrawUp Check, not a permit approval.</p></div>`;
  }
  function folderHTML(d, label, list, unsorted) {
    const open = S.focus === d || (unsorted ? !S.open.has('u-closed') : S.open.has(d));
    const subs = {};
    list.forEach(s => { const k = s.sheet_type == null ? 'x' : String(s.sheet_type); (subs[k] = subs[k] || []).push(s); });
    const subHTML = unsorted ? `<div class="du-sub-rows">${list.map(sheetRow).join('')}</div>`
      : Object.keys(subs).sort().map(k => `<div class="du-sub"><h4><i class="du-sub-ic"></i>${k === 'x' ? 'Sheet type not read' : esc(k + ' ' + TYPES[+k])}<em>${subs[k].length}</em></h4><div class="du-sub-rows">${subs[k].map(sheetRow).join('')}</div></div>`).join('');
    const tools = unsorted ? '<p class="du-sf-hint">DrawUp could not read a sheet number on these pages, so it did not guess. Add the number and they file themselves.</p>'
      : `<div class="du-sf-tools">${S.focus === d ? '<button type="button" class="du-btn ghost" data-allfolders>← All folders</button>' : `<button type="button" class="du-btn ghost" data-focus="${d}">Open this set on its own</button>`}<button type="button" class="du-btn primary" data-review="${d}" ${S.live[d] || !list.length ? 'disabled' : ''}>Review this set</button></div>`;
    return `<section class="du-sf${unsorted ? ' du-sf-unsorted' : ''}${list.length ? '' : ' empty'}${open ? ' open' : ''}" data-disc="${d}"><button type="button" class="du-sf-head" data-toggle="${d}" aria-expanded="${open}" ${list.length ? '' : 'disabled'}><i class="du-sf-ic"></i><b>${unsorted ? '!' : esc(d)}</b><span>${esc(label)}</span><em>${list.length} sheet${list.length === 1 ? '' : 's'}</em>${unsorted ? '' : chip(d)}</button>${open && list.length ? `<div class="du-sf-body">${tools}${unsorted ? '' : reviewBlock(d, list)}${subHTML}</div>` : ''}</section>`;
  }
  function render() {
    const el = panel(); if (!el) return;
    const by = folders(), set = S.set;
    const head = `<div class="du-sets-head"><div><span class="du-kicker">DRAWING SETS</span><h2>${set ? esc(set.title) : 'Upload a drawing set'}</h2><p>${set ? `${set.page_count || S.sheets.length} sheet${(set.page_count || S.sheets.length) === 1 ? '' : 's'} · ${esc(set.file_name || '')}${set.status !== 'ready' ? ' · <b class="du-sets-st">' + esc(set.status) + '</b>' : ''}` : 'Upload the full set as one PDF. DrawUp splits it page by page, reads each sheet number from the title block and files it into 01 General through 10 Electrical, so each consultant set can be opened and reviewed on its own.'}</p></div>
      <div class="du-sets-actions">${S.sets.length > 1 ? `<select id="du-sets-pick" aria-label="Drawing set">${S.sets.map(s => `<option value="${esc(s.id)}" ${set && s.id === set.id ? 'selected' : ''}>${esc(s.title)} · ${esc(new Date(s.created_at).toLocaleDateString())}</option>`).join('')}</select>` : ''}<label class="du-btn primary du-sets-up${S.busy ? ' disabled' : ''}">Upload set PDF<input type="file" id="du-sets-file" accept="application/pdf,.pdf" hidden ${S.busy ? 'disabled' : ''}></label>${set && !S.busy ? '<button type="button" class="du-btn ghost" id="du-sets-del">Delete set</button>' : ''}</div></div>
      <div class="du-sets-progress" id="du-sets-progress" ${S.busy ? '' : 'hidden'}><div class="du-sets-bar"><i style="width:0%"></i></div><p></p></div>`;
    let tree = '';
    if (set) {
      if (S.focus) { const d = DISC.find(x => x[0] === S.focus); tree = folderHTML(d[0], d[2], by[d[0]], false); }
      else tree = (by.u.length ? folderHTML('u', 'Unsorted, needs a sheet number', by.u, true) : '') + DISC.map(d => folderHTML(d[0], d[2], by[d[0]], false)).join('');
    }
    el.innerHTML = head + (set ? `<div class="du-sets-tree${S.focus ? ' focus' : ''}">${tree}</div>` : '');
    wire(el);
  }
  function wire(el) {
    el.querySelector('#du-sets-file')?.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) uploadSet(f); });
    el.querySelector('#du-sets-pick')?.addEventListener('change', async e => { await load(e.target.value); S.focus = null; render(); });
    el.querySelector('#du-sets-del')?.addEventListener('click', deleteSet);
    el.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => { const d = b.dataset.toggle === 'u' ? 'u-closed' : b.dataset.toggle; S.open.has(d) ? S.open.delete(d) : S.open.add(d); render(); });
    el.querySelectorAll('[data-focus]').forEach(b => b.onclick = () => { S.focus = b.dataset.focus; render(); el.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    el.querySelectorAll('[data-allfolders]').forEach(b => b.onclick = () => { S.focus = null; render(); });
    el.querySelectorAll('[data-view]').forEach(b => b.onclick = () => viewSheet(b.dataset.view));
    el.querySelectorAll('[data-refile]').forEach(b => b.onclick = () => refile(b.dataset.refile));
    el.querySelectorAll('[data-review]').forEach(b => b.onclick = () => reviewFolder(b.dataset.review));
  }
  function progress(frac, text) {
    const el = panel()?.querySelector('#du-sets-progress'); if (!el) return;
    el.hidden = false; el.querySelector('i').style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%'; el.querySelector('p').textContent = text;
  }
  function toast(msg, bad) {
    const t = document.createElement('div'); t.className = 'du-sets-toast' + (bad ? ' bad' : ''); t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  /* ---------------------------------------------------------------- upload + split */
  async function uploadSet(file) {
    if (S.busy) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { toast('Choose a PDF drawing set.', true); return; }
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...head) !== '%PDF-') { toast('That file is not a PDF.', true); return; }
    S.busy = true; S.focus = null; render();
    const c = client(); let set = null;
    try {
      progress(0.01, 'Creating the set…');
      const ins = await c.from('project_sets').insert({ project_thread_id: S.p.id, uploaded_by: S.uid, title: file.name.replace(/\.pdf$/i, '').slice(0, 120) || 'Drawing set', file_name: file.name, file_size: file.size, status: 'uploading' }).select('*').single();
      if (ins.error) throw ins.error; set = ins.data;
      const src = `${S.p.id}/${set.id}/source.pdf`;
      await upload(src, file, f => progress(0.02 + f * 0.28, `Uploading the full set to private storage… ${Math.round(f * 100)}%`));
      await c.from('project_sets').update({ file_path: src, status: 'splitting', updated_at: new Date().toISOString() }).eq('id', set.id);
      progress(0.3, 'Opening the PDF…');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const [lib, PL] = await Promise.all([pdfjs(), pdflib()]);
      const doc = await lib.getDocument({ data: bytes.slice() }).promise;
      const srcDoc = await PL.PDFDocument.load(bytes, { ignoreEncryption: true });
      const n = srcDoc.getPageCount();
      await c.from('project_sets').update({ page_count: n }).eq('id', set.id);
      S.sets.unshift({ ...set, page_count: n, status: 'splitting' }); S.set = S.sets[0]; S.sheets = []; S.reviews = []; render();
      for (let i = 0; i < n; i++) {
        let read = { number: null, title: null };
        try { read = readSheet(await pageItems(doc, i + 1)); } catch (e) { read = { number: null, title: null }; }
        const one = await PL.PDFDocument.create();
        const [pg] = await one.copyPages(srcDoc, [i]); one.addPage(pg);
        const out = await one.save({ useObjectStreams: false });
        const path = `${S.p.id}/${set.id}/sheets/p${String(i + 1).padStart(4, '0')}.pdf`;
        const where = read.number ? `${read.number} → ${discName(read.discipline)} / ${read.sheet_type} ${TYPES[read.sheet_type]}` : 'no sheet number → Unsorted';
        progress(0.3 + 0.7 * (i + 0.5) / n, `Sheet ${i + 1} of ${n}: ${where}`);
        await upload(path, new Blob([out], { type: 'application/pdf' }));
        const row = { set_id: set.id, project_thread_id: S.p.id, page_no: i + 1, file_path: path, sheet_number: read.number || null, sheet_title: read.title || null,
          designator: read.designator || null, discipline: read.discipline || null, sheet_type: read.number ? read.sheet_type : null, sheet_series: read.sheet_series || null,
          auto_number: read.number || null, auto_title: read.title || null, filed_by: 'auto', updated_by: S.uid };
        const up = await c.from('project_set_sheets').upsert(row, { onConflict: 'set_id,page_no' }).select('*').single();
        if (up.error) throw up.error;
        S.sheets = S.sheets.filter(s => s.page_no !== up.data.page_no).concat(up.data);
        if (read.discipline) S.open.add(read.discipline);
        render(); progress(0.3 + 0.7 * (i + 1) / n, `Sheet ${i + 1} of ${n}: ${where}`);
      }
      await c.from('project_sets').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('id', set.id);
      S.busy = false; await load(set.id); S.open = new Set(); render();
      const un = S.sheets.filter(s => !s.discipline).length;
      toast(`${n} sheet${n === 1 ? '' : 's'} filed.${un ? ' ' + un + (un === 1 ? ' needs' : ' need') + ' a sheet number.' : ''}`);
    } catch (e) {
      S.busy = false;
      if (set) await c.from('project_sets').update({ status: 'failed', error: String(e.message || e).slice(0, 400) }).eq('id', set.id);
      toast('The set could not be split: ' + (e.message || e), true);
      try { await load(set && set.id); } catch (_) { /* keep what is shown */ }
      render();
    }
  }
  async function deleteSet() {
    const set = S.set; if (!set || !confirm('Delete the drawing set “' + set.title + '” and all of its sheet files?')) return;
    const c = client();
    const paths = S.sheets.map(s => s.file_path).concat(set.file_path ? [set.file_path] : []);
    for (let i = 0; i < paths.length; i += 100) await c.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    const r = await c.from('project_sets').delete().eq('id', set.id);
    if (r.error) { toast(r.error.message, true); return; }
    toast('Drawing set deleted.'); await load(); render();
  }
  async function viewSheet(id) {
    const s = S.sheets.find(x => x.id === id); if (!s) return;
    const win = window.open('', '_blank');
    const { data, error } = await client().storage.from(BUCKET).createSignedUrl(s.file_path, 600);
    if (error || !data?.signedUrl) { win && win.close(); toast('Could not open the sheet: ' + (error?.message || 'no link'), true); return; }
    if (win) win.location.href = data.signedUrl; else location.assign(data.signedUrl);
  }

  /* ---------------------------------------------------------------- refile by hand */
  function refile(id) {
    const s = S.sheets.find(x => x.id === id); if (!s) return;
    document.getElementById('du-sets-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div id="du-sets-modal" class="du-inline-modal du-sets-modal"><div class="du-inline-card"><button class="du-inline-x" type="button" aria-label="Close">×</button><span class="du-kicker">REFILE SHEET · PAGE ${s.page_no}</span><h2>${esc(s.sheet_number || 'Add a sheet number')}</h2>
      ${s.auto_number ? `<p class="du-muted">DrawUp read ${esc(s.auto_number)}${s.auto_title ? ' · ' + esc(s.auto_title) : ''} from the title block.</p>` : '<p class="du-muted">No sheet number could be read on this page.</p>'}
      <div class="du-inline-grid"><label>Sheet number<input id="dsr-num" value="${esc(s.sheet_number || '')}" placeholder="A101, S-201, M2.01" autocomplete="off"></label><label>Sheet title<input id="dsr-title" value="${esc(s.sheet_title || '')}"></label>
      <label>Discipline folder<select id="dsr-disc"><option value="">Unsorted, needs a sheet number</option>${DISC.map(d => `<option value="${d[0]}" ${s.discipline === d[0] ? 'selected' : ''}>${d[0]} ${d[2]}</option>`).join('')}</select></label>
      <label>Sheet type<select id="dsr-type"><option value="">Not set</option>${TYPES.map((t, i) => `<option value="${i}" ${s.sheet_type === i ? 'selected' : ''}>${i} ${t}</option>`).join('')}</select></label></div>
      <p class="du-sets-derive" id="dsr-derive"></p><div class="du-sets-mbtns"><button type="button" class="du-btn ghost" id="dsr-view">View sheet</button><button type="button" class="du-btn primary" id="dsr-save">Save</button></div><span class="du-save-status" id="dsr-status"></span></div></div>`);
    const m = document.getElementById('du-sets-modal'), q = k => m.querySelector(k);
    let touched = false;
    q('.du-inline-x').onclick = () => m.remove();
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    q('#dsr-disc').onchange = q('#dsr-type').onchange = () => { touched = true; derive(false); };
    q('#dsr-view').onclick = () => viewSheet(s.id);
    const derive = typing => {
      const c = classify(q('#dsr-num').value);
      if (c && typing && !touched) { q('#dsr-disc').value = c.discipline; q('#dsr-type').value = String(c.sheet_type); }
      const sel = q('#dsr-disc').value;
      q('#dsr-derive').textContent = q('#dsr-num').value.trim() ? (c ? `Number reads as ${discName(c.discipline)} / ${c.sheet_type} ${TYPES[c.sheet_type]}${c.sheet_series ? ' · ' + SERIES_LABEL(c.sheet_type, c.sheet_series) : ''}${sel !== c.discipline ? ' · filed by hand to ' + discName(sel || null) : ''}` : 'Not a standard sheet number. Pick the folder below.') : '';
    };
    q('#dsr-num').oninput = () => derive(true); derive(false);
    q('#dsr-save').onclick = async () => {
      const num = q('#dsr-num').value.trim().toUpperCase(), c = classify(num), disc = q('#dsr-disc').value || null, tv = q('#dsr-type').value;
      const type = tv === '' ? null : +tv;
      const f = { sheet_number: num || null, sheet_title: q('#dsr-title').value.trim() || null, designator: c ? c.designator : null, discipline: disc, sheet_type: type,
        sheet_series: c && c.sheet_type === type ? c.sheet_series : null, filed_by: 'manual', updated_by: S.uid, updated_at: new Date().toISOString() };
      q('#dsr-save').disabled = true; q('#dsr-status').textContent = 'Saving…';
      const r = await client().from('project_set_sheets').update(f).eq('id', s.id).select('*');
      if (r.error || !r.data?.length) { q('#dsr-save').disabled = false; q('#dsr-status').textContent = 'Not saved: ' + (r.error?.message || 'the database did not confirm the change.'); return; }
      S.sheets = S.sheets.map(x => x.id === s.id ? r.data[0] : x);
      if (disc) S.open.add(disc);
      m.remove(); render(); toast(`${num || 'Sheet'} filed to ${discName(disc)}.`);
    };
  }

  /* ---------------------------------------------------------------- review one consultant set */
  async function authFetch(url, opt) { const tok = await token(); return fetch(url, { ...(opt || {}), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok, ...((opt || {}).headers || {}) } }); }
  function setLive(d, text) { S.live[d] = text; render(); }
  async function reviewFolder(d) {
    if (S.live[d]) return;
    const list = (folders()[d] || []).slice().sort((x, y) => x.page_no - y.page_no); if (!list.length) return; // the set's own page order
    const c = client(), set = S.set, name = discName(d);
    try {
      setLive(d, `Collecting ${list.length} ${name} sheet${list.length === 1 ? '' : 's'}…`);
      const PL = await pdflib(); const merged = await PL.PDFDocument.create();
      for (const s of list) {
        const { data, error } = await c.storage.from(BUCKET).download(s.file_path);
        if (error) throw new Error('Could not read ' + (s.sheet_number || 'page ' + s.page_no) + ': ' + error.message);
        const one = await PL.PDFDocument.load(new Uint8Array(await data.arrayBuffer()), { ignoreEncryption: true });
        (await merged.copyPages(one, one.getPageIndices())).forEach(p => merged.addPage(p));
      }
      merged.setTitle(`${S.p.project_name} · ${name}`);
      const bytes = await merged.save({ useObjectStreams: false });
      if (bytes.byteLength > CHECK_MAX) throw new Error(`The ${name} set is ${(bytes.byteLength / 1048576).toFixed(1)} MB. Check takes up to 32 MB, so refile part of it into another folder or review it in parts from the Check tab.`);
      setLive(d, 'Sending ' + name + ' to DrawUp Check…');
      const path = `${S.uid}/project-sets/${set.id}/${d}-${Date.now()}.pdf`;
      const up = await c.storage.from('drawup-private').upload(path, new Blob([bytes], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: false });
      if (up.error) throw new Error(up.error.message);
      const fileName = `${(S.p.project_name || 'Project').replace(/[^\w .-]+/g, '').slice(0, 60)} ${d} ${name.slice(3)}.pdf`;
      const ck = await c.from('check_reviews').insert({ owner_id: S.uid, project_thread_id: S.p.id, title: `${S.p.project_name} · ${name}`.slice(0, 160), file_path: path, file_name: fileName, file_size: bytes.byteLength, building_type: S.p.project_type || null, jurisdiction: S.p.location || null }).select('id').single();
      if (ck.error) throw new Error(ck.error.message);
      const ins = await c.from('project_set_reviews').insert({ set_id: set.id, project_thread_id: S.p.id, discipline: d, check_review_id: ck.data.id, requested_by: S.uid, sheet_ids: list.map(s => s.id), sheet_numbers: list.map(s => s.sheet_number || 'Page ' + s.page_no), status: 'reviewing' }).select('*').single();
      if (ins.error) throw new Error(ins.error.message);
      S.reviews.unshift(ins.data);
      const r = await authFetch('/api/check', { method: 'POST', body: JSON.stringify({ review_id: ck.data.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { await finish(ins.data, { status: 'failed', error: j.error || 'Check could not start (' + r.status + ').' }); return; }
      await poll(ins.data);
    } catch (e) {
      delete S.live[d]; render(); toast('Review could not start: ' + (e.message || e), true);
    }
  }
  async function poll(rv) {
    const d = rv.discipline; let cursor = 0, text = '';
    for (let i = 0; i < 900; i++) {
      const r = await authFetch('/api/check?id=' + encodeURIComponent(rv.check_review_id) + '&after=' + cursor).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      const ck = j.review;
      if (ck && (ck.status === 'complete' || ck.status === 'failed')) { await finish(rv, ck); return; }
      if (r && r.status === 404) { await finish(rv, { status: 'failed', error: 'The Check review was removed.' }); return; }
      if (typeof j.delta === 'string') { text += j.delta; cursor = j.cursor ?? cursor; }
      const n = (text.match(/"issue"\s*:/g) || []).length;
      setLive(d, n ? `Reviewing ${discName(d)}… ${n} finding${n === 1 ? '' : 's'} written so far` : `Reviewing ${discName(d)}…${j.activity ? ' ' + j.activity : ''}`);
      await new Promise(res => setTimeout(res, i < 20 ? 1500 : 4000));
      if (!panel()) return; // user left the project; the review keeps running and is picked up next time
    }
    delete S.live[d]; render();
  }
  async function finish(rv, ck) {
    const pages = rv.sheet_numbers || [];
    // Keep the sheet the reviewer named when it is one of the sheets sent; otherwise name it from the page number.
    const named = f => pages.find(n => String(f.sheet || '').toUpperCase().replace(/\s/g, '').includes(String(n).toUpperCase()) && !pages.some(m => m !== n && m.length > n.length && String(f.sheet || '').toUpperCase().includes(m.toUpperCase())));
    const findings = (ck.findings || []).map(f => ({ ...f, sheet: named(f) || (f.page && pages[f.page - 1]) || f.sheet || '' }));
    const f = ck.status === 'complete'
      ? { status: 'complete', summary: ck.summary || null, findings, finding_count: findings.length, critical_count: findings.filter(x => x.severity === 'critical').length, major_count: findings.filter(x => x.severity === 'major').length, error: null }
      : { status: 'failed', error: ck.error || 'The review failed.' };
    const r = await client().from('project_set_reviews').update({ ...f, updated_at: new Date().toISOString() }).eq('id', rv.id).select('*');
    const row = r.data?.[0] || { ...rv, ...f };
    S.reviews = S.reviews.map(x => x.id === rv.id ? row : x);
    delete S.live[rv.discipline]; render();
    if (ck.status === 'complete') toast(`${discName(rv.discipline)} reviewed: ${findings.length} finding${findings.length === 1 ? '' : 's'}.`);
  }
  function resumeReviews() {
    S.reviews.filter(r => r.status === 'reviewing' && r.requested_by === S.uid && r.check_review_id && !S.live[r.discipline] && latestReview(r.discipline) === r)
      .forEach(r => { S.live[r.discipline] = 'Reviewing ' + discName(r.discipline) + '…'; poll(r); });
    render();
  }

  window.DrawUpSets = { mount, readSheet, classify, DISC, TYPES, _tusMin: 0 };
})();
