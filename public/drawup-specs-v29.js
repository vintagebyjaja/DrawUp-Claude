/* DrawUp Specs v29: spec and project document maker in Portal › Firm › DrawUp Specs (next to GM Presentation).
   - Documents: project manuals in CSI MasterFormat (divisions tree, Part 1 General / Part 2 Products / Part 3 Execution)
     and CA, CM, QA/QC and PM documents (RFI response, submittal review, ASI, field report, punch list, minutes,
     daily report, QA/QC plan, NCR, deficiency log, letter, memo, transmittal...). Content: drawup-specs-data-v29.js.
   - Project map: the firm's projects on a US map with filters; every document pulls the project data
     (project_threads, firm offices, drawing set sheets, Check findings) through <<tokens>>.
   - Formats: the DrawUp format (built in), the firm standard format and client formats with uploaded preferred
     formats (Word template, PDF letterhead, reference files). Layout and export: drawup-specs-export-v29.js.
   Data (migration 0075): firm_documents (+doc_type, project_thread_id, format_id, status...), firm_spec_formats,
   firm_project_info, firm_kit_files kind spec_format under drawup-firmkit/firm-id/specs/.
   Hooks into drawup-firmkit-v22.js: adds the 'specs' pane and DrawUpFirmKit.newDocument() (used by Check). */
(function () {
'use strict';
if (window.DrawUpSpecs) return;
const D = window.DrawUpSpecsData, X = window.DrawUpSpecsExport;
if (!D || !X) { console.warn('DrawUp Specs: data or export file missing'); return; }
const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const BUCKET = 'drawup-firmkit', MAXB = 50 * 1024 * 1024;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2);
const day = d => d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const stamp = d => d ? new Date(d).toLocaleString(undefined, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const TYPE = Object.fromEntries(D.DOC_TYPES.map(t => [t.key, t]));
const LABELS = Object.fromEntries(D.PROJECT_FIELDS.map(f => [f[0], f[1]]).concat(D.AUTO_TOKENS));
const SEC_STATES = [['draft', 'Draft'], ['in_progress', 'In progress'], ['in_review', 'In review'], ['complete', 'Complete'], ['excluded', 'Left out of the manual']];
const DOC_STATUS = [['draft', 'Draft'], ['in_progress', 'In progress'], ['in_review', 'In review'], ['issued', 'Issued'], ['archived', 'Archived']];
const STATUS_LABEL = Object.fromEntries(DOC_STATUS);
const catTitle = n => (D.CATALOG.find(c => c[0] === n) || [])[1] || '';
const sqlMissing = e => e && (/firm_spec_formats|firm_project_info|doc_type|drawup_spec_|format_id|project_thread_id/.test(e.message || '') || e.code === '42P01' || e.code === '42703' || e.code === 'PGRST205' || e.code === 'PGRST202');
const isPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name), isDocx = f => f.type === DOCX_MIME || /\.docx$/i.test(f.name), isImg = f => /^image\/(png|jpeg)$/.test(f.type);
const download = (bytes, name, mime) => { const u = URL.createObjectURL(new Blob([bytes], { type: mime })); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
const slug = s => String(s || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'document';
const STATE_NAMES = () => { const m = {}; Object.entries(window.DRAWUP_US_STATES || {}).forEach(([a, s]) => { m[s.n.toLowerCase()] = a; }); return m; };
function stateOf(loc) { const s = String(loc || ''); let m = s.match(/,\s*([A-Z]{2})\b/) || s.match(/\b([A-Z]{2})\s*\d{5}/) || s.match(/^\s*([A-Z]{2})\s*$/); if (m && (window.DRAWUP_US_STATES || {})[m[1]]) return m[1]; const names = STATE_NAMES(); const low = s.toLowerCase(); for (const n of Object.keys(names).sort((a, b) => b.length - a.length)) if (low.includes(n)) return names[n]; return ''; }

/* v30 Document Studio: the same editor serves two stores. A firm scope keeps documents in firm_documents
   (the firm's own, SQL 0075). A personal scope keeps them in project_documents (the member's own, SQL 0077).
   Everything below goes through DOCS(S), scopeFilter and scopeFields, so neither store is special-cased. */
const DOCS = S => (S.scope && S.scope.table) || 'firm_documents';
const scopeFilter = (S, q) => S.scope && S.scope.kind === 'personal' ? q.eq('owner_id', S.me) : q.eq('firm_id', S.firm.id);
const scopeFields = S => S.scope && S.scope.kind === 'personal' ? { owner_id: S.me } : { firm_id: S.firm.id };
const isPersonal = S => !!(S.scope && S.scope.kind === 'personal');

/* ------------------------------------------------------------------ document model */
function makeSection(number, title, outline) {
  const src = D.MASTER[number] || D.genericSection(number, title || catTitle(number) || 'Section'); const parts = {};
  [1, 2, 3].forEach(n => { parts[n] = outline && n !== 2 ? [] : (src[n] || []).map(a => ({ id: X.rid(), title: a.title, base_title: a.title, paras: (a.paras || []).map(t => { const m = t.match(/^(>*)([\s\S]*)$/); return { id: X.rid(), t: m[2], base: m[2], lvl: m[1].length }; }) })); });
  return { id: X.rid(), number, title: title || catTitle(number) || 'Section', state: 'draft', assigned: null, parts };
}
function fromRow(r) {
  const t = TYPE[r.doc_type] || TYPE.narrative, kind = t.kind;
  const doc = { id: r.id, firm_id: r.firm_id, owner_id: r.owner_id, title: r.title, doc_type: TYPE[r.doc_type] ? r.doc_type : 'narrative', kind, type_label: t.label, project_thread_id: r.project_thread_id || null, format_id: r.format_id || null, status: r.status || 'draft', doc_number: r.doc_number || '', assigned_to: r.assigned_to || null, source: r.source || 'manual', created_by: r.created_by, updated_by: r.updated_by, updated_at: r.updated_at, created_at: r.created_at, data: (r.cover && r.cover.data) || {} };
  if (kind === 'spec') { doc.sections = Array.isArray(r.sections) ? r.sections : []; doc.outline = !!(r.fields && r.fields.outline) || !!t.outline; }
  else { doc.blocks = Array.isArray(r.sections) ? r.sections : []; doc.fields = (r.fields && Array.isArray(r.fields.list)) ? r.fields.list : []; doc.heading = (r.fields && r.fields.heading) || t.label; }
  return doc;
}
function toRow(doc, me) {
  return { title: doc.title || 'Untitled', doc_type: doc.doc_type, project_thread_id: doc.project_thread_id || null, format_id: doc.format_id || null, status: doc.status || 'draft', doc_number: doc.doc_number || null, assigned_to: doc.assigned_to || null,
    sections: doc.kind === 'spec' ? doc.sections : doc.blocks, fields: doc.kind === 'spec' ? { outline: !!doc.outline } : { list: doc.fields, heading: doc.heading }, cover: { data: doc.data || {} }, updated_at: new Date().toISOString(), updated_by: me };
}
function openCount(doc, ctx) { let n = 0; const add = t => { n += X.openItems(t, ctx); };
  if (doc.kind === 'spec') doc.sections.forEach(s => { if (s.state === 'excluded') return; [1, 2, 3].forEach(k => (s.parts[k] || []).forEach(a => { if (a.off) return; a.paras.forEach(p => { if (!p.off) add(p.t); }); })); });
  else { doc.fields.forEach(f => add(f.v)); doc.blocks.forEach(b => { if (b.off) return; if (b.table) b.table.rows.forEach(r => r.forEach(add)); else add(b.p || ''); }); }
  return n; }

/* ------------------------------------------------------------------ data access */
async function loadAll(S) {
  const c = S.c, f = isPersonal(S) ? '00000000-0000-0000-0000-000000000000' : S.firm.id;
  const q = await Promise.all([
    scopeFilter(S, c.client.from(DOCS(S)).select('*')).order('updated_at', { ascending: false }),
    (isPersonal(S) ? c.client.from('firm_spec_formats').select('*') : c.client.from('firm_spec_formats').select('*').eq('firm_id', f)).order('updated_at', { ascending: false }),
    c.client.rpc('drawup_spec_projects', { p_firm: f }),
    c.client.from('firm_project_info').select('*').eq('firm_id', f),
    c.client.from('firm_members').select('user_id,role').eq('firm_id', f),
    c.client.from('firm_offices').select('*').eq('firm_id', f),
    c.client.from('project_firms').select('project_id,role').eq('firm_id', f),
    c.client.from('firm_kit_files').select('*').eq('firm_id', f).eq('kind', 'spec_format')
  ]);
  S.missing = [q[0], q[1], q[2], q[3]].some(r => sqlMissing(r.error));
  if (q[0].error && !S.missing) throw q[0].error;
  S.docs = (q[0].data || []).filter(r => !r.doc_type || TYPE[r.doc_type] || r.doc_type === 'narrative').map(fromRow);
  S.formats = q[1].data || [];
  let projects = q[2].data;
  if (!Array.isArray(projects) || q[2].error) { const own = await c.client.from('project_threads').select('id,project_name,project_type,location,project_phase,description,client_nickname,owner_id,firm_id,status,updated_at,starter_key').eq('owner_id', S.me).order('updated_at', { ascending: false }).limit(100); projects = (own.data || []).filter(p => !p.starter_key).map(p => ({ ...p, mine: true })); }
  S.projects = projects.filter(p => p.status !== 'archived');
  S.info = Object.fromEntries((q[3].data || []).map(r => [r.project_thread_id, r]));
  const ids = (q[4].data || []).map(m => m.user_id); S.roles = Object.fromEntries((q[4].data || []).map(m => [m.user_id, m.role]));
  S.members = []; if (ids.length) { const pr = await c.client.from('profiles').select('id,display_name,username,title').in('id', ids); S.members = (pr.data || []).map(p => ({ id: p.id, name: p.display_name || p.username || 'Member', title: p.title || '' })); }
  S.offices = q[5].data || []; S.kitFiles = q[7].data || [];
  S.portfolio = []; const pids = (q[6].data || []).map(r => r.project_id);
  if (pids.length) { const ap = await c.client.from('aec_projects').select('id,slug,name,city,state,project_type,status,completion_year,size_sqft').in('id', pids.slice(0, 300)); S.portfolio = ap.data || []; }
}
const memberName = (S, id) => (S.members.find(m => m.id === id) || {}).name || (id === S.me ? (S.c.user?.user_metadata?.display_name || 'You') : '');
const project = (S, id) => S.projects.find(p => p.id === id) || null;
function officeAddress(S) { const o = S.offices.find(x => x.is_headquarters) || S.offices[0]; if (!o) return ''; return [o.address, [o.city, o.state].filter(Boolean).join(', ')].filter(Boolean).join(', '); }
function autoInfo(S, p) { const a = { architect_name: S.firm.name, architect_address: officeAddress(S) }; if (p) Object.assign(a, { project_name: p.project_name, project_location: p.location, building_type: p.project_type, phase: p.project_phase, project_description: p.description, owner_name: p.client_nickname }); return a; }
function projectData(S, pid) {
  const p = project(S, pid); const auto = autoInfo(S, p);
  // v30: Project Information (project_profiles) is the project's own record; the firm's saved info still applies
  // on top of it for firm documents. Both are "saved" values, so neither is overwritten by a document.
  const intel = (pid && S.intel && S.intel[pid]) || {};
  const saved = { ...intel, ...((pid && S.info[pid] && S.info[pid].info) || {}) };
  const out = { ...auto }; Object.entries(saved).forEach(([k, v]) => { if (v != null && String(v).trim() !== '') out[k] = v; });
  return { data: out, auto, saved, p };
}
function ctxFor(S, doc) {
  const base = doc.project_thread_id ? projectData(S, doc.project_thread_id).data : { ...autoInfo(S, null), ...doc.data };
  const brief = doc.project_thread_id && S.briefs[doc.project_thread_id];
  return { data: { ...base, today: new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }), firm_name: S.firm.name, document_number: doc.doc_number || '', document_title: doc.title || '', sheet_count: brief ? String(brief.sheets.length) : '', sheet_list: brief && brief.sheets.length ? brief.sheets.map(x => (x.sheet_number || '') + '   ' + (x.sheet_title || '')).join('\n') : '' }, labels: LABELS };
}
/** v30: the project's own Project Information values (project_profiles), cached per project. */
async function intelFor(S, pid) {
  if (!pid || !window.DrawUpProjectInfo) return null; S.intel = S.intel || {};
  if (S.intel[pid]) return S.intel[pid];
  try { const d = await window.DrawUpProjectInfo.data(pid); S.intel[pid] = (d && d.values) || {}; } catch (_e) { S.intel[pid] = {}; }
  return S.intel[pid];
}
async function brief(S, pid) { if (!pid) return null; if (S.briefs[pid]) return S.briefs[pid]; const r = await S.c.client.rpc('drawup_spec_project_brief', { p_project: pid }); const b = r.data && typeof r.data === 'object' ? r.data : {}; S.briefs[pid] = { sheets: Array.isArray(b.sheets) ? b.sheets : [], reviews: Array.isArray(b.reviews) ? b.reviews : [] }; return S.briefs[pid]; }
async function bytesOf(S, path) { if (!path) return null; if (S.bytes[path]) return S.bytes[path]; const r = await S.c.client.storage.from(BUCKET).download(path); if (r.error) throw r.error; const b = new Uint8Array(await r.data.arrayBuffer()); S.bytes[path] = b; return b; }
async function uploadSpecFile(S, file) {
  if (file.size > MAXB) throw new Error('Files must be 50 MB or smaller.');
  const name = file.name.replace(/[^\w.\- ]+/g, '').slice(-120) || 'file', path = `${S.firm.id}/specs/${uuid()}-${name.replace(/\s+/g, '-')}`;
  const type = file.type || (isDocx(file) ? DOCX_MIME : isPdf(file) ? 'application/pdf' : 'application/octet-stream');
  const up = await S.c.client.storage.from(BUCKET).upload(path, file, { contentType: type }); if (up.error) throw up.error;
  const r = await S.c.client.from('firm_kit_files').insert({ firm_id: S.firm.id, kind: 'spec_format', storage_path: path, file_name: file.name.slice(0, 200), mime_type: type, size_bytes: file.size, uploaded_by: S.me }).select('*').single();
  if (r.error) { await S.c.client.storage.from(BUCKET).remove([path]); throw r.error; }
  S.bytes[path] = new Uint8Array(await file.arrayBuffer()); S.kitFiles.unshift(r.data); return r.data;
}
function formatRow(S, id) { return id ? S.formats.find(f => f.id === id) || null : null; }
/** v30: the format's settings with this document's own page setup on top (size, orientation, margins). */
function pageOver(settings, doc) {
  const o = (doc && doc.data && doc.data.page) || null; if (!o) return settings;
  const out = { ...settings, ...(o.page ? { page: o.page } : {}), ...(o.orientation ? { orientation: o.orientation } : {}) };
  if (o.margins) out.margins = { ...settings.margins, ...o.margins };
  return X.fixFormat(out);
}
const fmtFor = (S, doc) => pageOver(X.fixFormat((formatRow(S, doc.format_id) || {}).settings), doc);
function formatName(S, id) { const f = formatRow(S, id); return f ? (f.kind === 'firm' ? 'Firm standard' : 'Client: ' + (f.client_name || f.name)) : 'DrawUp standard'; }
async function formatFiles(S, row, doc) { // settings + bytes for export
  const settings = pageOver(X.fixFormat(row ? row.settings : null), doc), files = {};
  if (row) { if (settings.background && settings.background.path) { try { settings.background = { ...settings.background, bytes: await bytesOf(S, settings.background.path) }; } catch (_e) { settings.background = null; } }
    if (row.template_file_id) { const kf = S.kitFiles.find(k => k.id === row.template_file_id); if (kf) try { files.wordTemplate = await bytesOf(S, kf.storage_path); } catch (_e) { /* falls back to the DrawUp Word layout */ } } }
  const logo = settings.letterhead.logo; let url = null;
  if (logo === 'upload' && settings.letterhead.logo_path) { try { const b = await bytesOf(S, settings.letterhead.logo_path); files.logo = b; files.logoType = /\.png$/i.test(settings.letterhead.logo_path) ? 'image/png' : 'image/jpeg'; } catch (_e) { /* no logo */ } }
  else if (logo === 'firm' && S.firm.logo_url) url = S.firm.logo_url;
  if (url) { try { const r = await fetch(url); if (r.ok) { const blob = await r.blob(); if (/png|jpe?g/.test(blob.type)) { files.logo = new Uint8Array(await blob.arrayBuffer()); files.logoType = blob.type.includes('png') ? 'image/png' : 'image/jpeg'; } } } catch (_e) { /* logo is optional */ } }
  if (files.logo) { try { const im = await createImageBitmap(new Blob([files.logo], { type: files.logoType })); files.logoW = im.width; files.logoH = im.height; } catch (_e) { /* size unknown */ } }
  return { settings, files };
}

/* ------------------------------------------------------------------ rich text with chips */
function richHTML(text, ctx) {
  return X.tokens(text).map(k => {
    if (k.t === 'txt') return esc(k.v);
    const raw = esc(X.untokens([k]));
    if (k.t === 'blank') { const f = k.value != null && k.value !== ''; return `<span class="sp-chip ${f ? 'fill' : 'blank'}" contenteditable="false" data-raw="${raw}" title="${f ? 'Filled: ' : 'Fill in: '}${esc(k.label)}">${esc(f ? k.value : k.label)}</span>`; }
    if (k.t === 'opt') return `<span class="sp-opts" contenteditable="false" data-raw="${raw}" title="Pick one">${k.opts.map((o, j) => `<span class="sp-opt ${j === k.sel ? 'on' : k.sel >= 0 ? 'off' : ''}" data-j="${j}">${esc(o)}</span>`).join('')}</span>`;
    const v = ctx.data[k.key], has = v != null && String(v).trim() !== '', label = LABELS[k.key] || k.key;
    return `<span class="sp-chip data ${has ? '' : 'missing'}" contenteditable="false" data-raw="${raw}" data-key="${esc(k.key)}" title="Project data: ${esc(label)}${has ? '' : ' (not set yet)'}">${esc(has ? v : label)}</span>`;
  }).join('');
}
function serialize(el) { let s = ''; el.childNodes.forEach(n => { if (n.nodeType === 3) s += n.nodeValue; else if (n.dataset && n.dataset.raw != null) s += n.dataset.raw; else if (n.nodeName === 'BR') s += '\n'; else { if ((n.nodeName === 'DIV' || n.nodeName === 'P') && s && !s.endsWith('\n')) s += '\n'; s += serialize(n); } }); return s.replace(/ /g, ' '); }
function diffHTML(a, b) { // word diff: what changed from the starter text (a) to now (b)
  const A = String(a || '').split(/(\s+)/).filter(Boolean), B = String(b || '').split(/(\s+)/).filter(Boolean);
  if (A.length * B.length > 250000) return esc(b);
  const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0, out = '';
  while (i < n && j < m) { if (A[i] === B[j]) { out += esc(A[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out += `<del>${esc(A[i++])}</del>`; else out += `<ins>${esc(B[j++])}</ins>`; }
  while (i < n) out += `<del>${esc(A[i++])}</del>`; while (j < m) out += `<ins>${esc(B[j++])}</ins>`;
  return out;
}

/* ------------------------------------------------------------------ mount */
async function mountSpecs(body, c, firm, opts) {
  const scope = (opts && opts.scope) || { kind: 'firm', table: 'firm_documents' };
  const fr = scope.kind === 'personal' ? { data: null } : await c.client.from('firms').select('id,name,slug,logo_url,website').eq('id', firm.id).maybeSingle();
  const S = { c, body, scope, firm: { ...firm, ...(fr.data || {}) }, admin: !!(opts && opts.admin), me: c.user.id, briefs: {}, bytes: {}, view: 'docs', filter: { group: 'All', project: '', q: '' }, mapF: { state: '', type: '', phase: '', docs: false, mine: false, src: 'all' } };
  body.innerHTML = '<div class="du-loading">LOADING DRAWUP SPECS…</div>';
  await loadAll(S);
  S.admin = S.admin || S.roles[S.me] === 'admin' || isPersonal(S);
  if (opts && opts.hooks) S.hooks = opts.hooks;
  if (opts && opts.onState) opts.onState(S);
  window.DrawUpSpecs._current = S; // v30: the open workspace, for AI drafting
  const params = new URLSearchParams((location.hash.split('?')[1]) || ''); let openId = params.get('doc');
  try { const k = sessionStorage.getItem('du-specs-open'); if (k) { openId = k; sessionStorage.removeItem('du-specs-open'); } } catch (_e) { /* private mode */ }
  const want = openId && S.docs.find(d => d.id === openId);
  if (want) return openEditor(S, want);
  if (params.get('view') === 'map') S.view = 'map'; if (params.get('view') === 'formats') S.view = 'formats';
  renderHub(S);
}
const setHashParam = (k, v) => { const [h, q] = location.hash.split('?'); if (!/^#portal\/firm/.test(h || '')) return; const p = new URLSearchParams(q || ''); if (v) p.set(k, v); else p.delete(k); history.replaceState(null, '', h + '?' + p.toString()); };

/* ------------------------------------------------------------------ hub */
function renderHub(S) {
  setHashParam('doc', '');
  const b = S.body, groups = ['All'].concat(D.GROUP_ORDER);
  b.innerHTML = `<div class="sp-wrap" data-sp="hub">
  <article class="du-glass fk-head sp-head"><div><span class="du-kicker">DRAWUP SPECS · ${S.view === 'map' ? 'PROJECT MAP' : S.view === 'formats' ? 'FORMATS' : 'DOCUMENTS'}</span><h2>Specs and project documents</h2><p class="du-muted">Write project specifications the way spec writers do, by division and section with Part 1, 2 and 3, and the CA, CM, QA/QC and PM paperwork that goes with them. Every document pulls the project data, so names, numbers and addresses stay the same everywhere. Export to PDF or Word in the DrawUp format, your firm standard or a client's own format.</p></div>
  <div class="fk-actions"><button class="du-btn ghost" type="button" data-sp-go="formats">Formats</button><button class="du-btn primary" type="button" data-sp-new>New document</button></div></article>
  ${S.missing ? `<article class="du-glass sp-warn"><b>Run the DrawUp Specs SQL.</b> <span>Supabase still needs <code>drawup-specs-01.sql</code> (migration 0075). Until then documents cannot be saved.</span></article>` : ''}
  <div class="du-subtabs sp-tabs" role="tablist">${[['docs', 'Documents'], ['map', 'Project map'], ['formats', 'Formats']].map(([k, l]) => `<button type="button" role="tab" data-sp-go="${k}" class="${S.view === k ? 'active' : ''}" aria-selected="${S.view === k}">${l}</button>`).join('')}</div>
  <div class="sp-view"></div></div>`;
  b.querySelectorAll('[data-sp-go]').forEach(x => x.onclick = () => { S.view = x.dataset.spGo; setHashParam('view', S.view === 'docs' ? '' : S.view); renderHub(S); });
  b.querySelector('[data-sp-new]').onclick = () => newDocModal(S, {});
  const v = b.querySelector('.sp-view');
  if (S.view === 'map') return renderMap(S, v);
  if (S.view === 'formats') return renderFormats(S, v);
  const F = S.filter;
  v.innerHTML = `<div class="sp-filters"><div class="fk-chips sp-groups">${groups.map(g => `<button type="button" class="${F.group === g ? 'on' : ''}" data-g="${esc(g)}">${g === 'All' ? 'All' : esc(g)}</button>`).join('')}</div>
    <select class="sp-in" data-f="project" aria-label="Project"><option value="">All projects</option>${S.projects.map(p => `<option value="${p.id}" ${F.project === p.id ? 'selected' : ''}>${esc(p.project_name)}</option>`).join('')}</select>
    <input class="sp-in" type="search" data-f="q" placeholder="Search documents" value="${esc(F.q)}" aria-label="Search documents"></div><div class="sp-docs"></div>`;
  const list = v.querySelector('.sp-docs');
  const draw = () => {
    const q = F.q.trim().toLowerCase();
    const docs = S.docs.filter(d => (F.group === 'All' || (TYPE[d.doc_type] || {}).group === F.group) && (!F.project || d.project_thread_id === F.project) && (!q || (d.title + ' ' + d.type_label + ' ' + (project(S, d.project_thread_id)?.project_name || '')).toLowerCase().includes(q)));
    if (!docs.length) { list.innerHTML = `<article class="du-glass sp-empty"><h3>${S.docs.length ? 'No documents match.' : 'No documents yet.'}</h3><p class="du-muted">${S.docs.length ? 'Clear the filters or start a new one.' : 'Start a project manual, an RFI response, meeting minutes or any other document. Pick a project and it fills in the project name, number, address, owner and team for you.'}</p><button class="du-btn primary" type="button" data-sp-new2>New document</button></article>`; list.querySelector('[data-sp-new2]').onclick = () => newDocModal(S, { project: F.project }); return; }
    list.innerHTML = docs.map(d => { const t = TYPE[d.doc_type] || {}; const p = project(S, d.project_thread_id); const n = openCount(d, ctxFor(S, d));
      return `<button type="button" class="sp-card" data-open="${d.id}"><span class="sp-card-k">${esc(t.group || '')} · ${esc(t.label || '')}</span><b>${esc(d.title)}</b><span class="sp-card-p">${esc(p ? p.project_name : 'No project')}${d.doc_number ? ' · ' + esc(d.doc_number) : ''}</span>
      <span class="sp-card-m"><i class="sp-pill s-${d.status}">${esc(STATUS_LABEL[d.status] || d.status)}</i>${d.kind === 'spec' ? `<i>${d.sections.length} section${d.sections.length === 1 ? '' : 's'}</i>` : ''}<i>${esc(formatName(S, d.format_id))}</i>${n ? `<i class="sp-open">${n} open item${n === 1 ? '' : 's'}</i>` : ''}</span><small>Updated ${esc(day(d.updated_at))}${d.updated_by ? ' · ' + esc(memberName(S, d.updated_by)) : ''}</small></button>`; }).join('');
    list.querySelectorAll('[data-open]').forEach(x => x.onclick = () => openEditor(S, S.docs.find(d => d.id === x.dataset.open)));
  };
  v.querySelectorAll('[data-g]').forEach(x => x.onclick = () => { F.group = x.dataset.g; v.querySelectorAll('[data-g]').forEach(y => y.classList.toggle('on', y === x)); draw(); });
  v.querySelector('[data-f="project"]').onchange = e => { F.project = e.target.value; draw(); };
  v.querySelector('[data-f="q"]').oninput = e => { F.q = e.target.value; draw(); };
  draw();
}

/* ------------------------------------------------------------------ modal helper */
function modal(title, kicker, html, wide) {
  document.getElementById('sp-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div id="sp-modal" class="sp-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sp-modal-card ${wide ? 'wide' : ''}"><button type="button" class="sp-x" aria-label="Close">×</button><span class="du-kicker">${esc(kicker)}</span><h2>${esc(title)}</h2>${html}</div></div>`);
  const m = document.getElementById('sp-modal'); m.querySelector('.sp-x').onclick = () => m.remove(); m.addEventListener('mousedown', e => { if (e.target === m) m.remove(); });
  const key = e => { if (e.key === 'Escape') { m.remove(); document.removeEventListener('keydown', key); } }; document.addEventListener('keydown', key);
  return m;
}
const toast = (S, msg, bad) => S.c.toast ? S.c.toast(msg, bad) : console.log(msg);

/* ------------------------------------------------------------------ new document */
function newDocModal(S, pre) {
  const fmts = S.formats; const def = fmts.find(f => f.kind === 'firm' && f.is_default) || fmts.find(f => f.kind === 'firm');
  let type = pre.type || 'spec';
  const m = modal('New document', 'DRAWUP SPECS', `<div class="sp-types">${D.GROUP_ORDER.map(g => `<section><h4>${esc(D.GROUP_LABEL[g])}</h4>${D.DOC_TYPES.filter(t => t.group === g).map(t => `<button type="button" class="sp-type ${t.key === type ? 'on' : ''}" data-type="${t.key}"><b>${esc(t.label)}</b><small>${esc(t.desc)}</small></button>`).join('')}</section>`).join('')}</div>
  <div class="sp-grid2"><label><span>Title</span><input class="sp-in" id="spn-title"></label><label><span>Document number <small>optional</small></span><input class="sp-in" id="spn-num" placeholder="For example RFI-014"></label>
  <label><span>Project</span><select class="sp-in" id="spn-proj"><option value="">No project</option>${S.projects.map(p => `<option value="${p.id}" ${pre.project === p.id ? 'selected' : ''}>${esc(p.project_name)}${p.location ? ' · ' + esc(p.location) : ''}</option>`).join('')}</select></label>
  <label><span>Format</span><select class="sp-in" id="spn-fmt"></select></label></div>
  <p class="sp-note" id="spn-note"></p><div class="sp-savebar"><button type="button" class="du-btn primary" id="spn-go">Create document</button><span class="sp-st" role="status"></span></div>`, true);
  const v = id => m.querySelector('#' + id);
  const fmtOpts = () => { const pid = v('spn-proj').value; const client = fmts.filter(f => f.kind === 'client'); const forProj = client.find(f => pid && f.project_thread_id === pid);
    v('spn-fmt').innerHTML = `<option value="">DrawUp standard</option>${fmts.filter(f => f.kind === 'firm').map(f => `<option value="${f.id}">Firm standard: ${esc(f.name)}</option>`).join('')}${client.map(f => `<option value="${f.id}">Client: ${esc(f.client_name || f.name)}${f.project_thread_id && f.project_thread_id === pid ? ' (this project)' : ''}</option>`).join('')}`;
    v('spn-fmt').value = (forProj || def || { id: '' }).id; v('spn-note').textContent = forProj ? 'This project has a client format, so it is picked. You can change it any time.' : ''; };
  const setTitle = () => { const t = TYPE[type], p = project(S, v('spn-proj').value); v('spn-title').value = t.kind === 'spec' ? (t.outline ? 'Outline Specification' : 'Project Manual') + (p ? ' - ' + p.project_name : '') : t.label + (p ? ' - ' + p.project_name : ''); };
  m.querySelectorAll('[data-type]').forEach(x => x.onclick = () => { type = x.dataset.type; m.querySelectorAll('[data-type]').forEach(y => y.classList.toggle('on', y === x)); setTitle(); });
  v('spn-proj').onchange = () => { fmtOpts(); setTitle(); };
  fmtOpts(); setTitle();
  v('spn-go').onclick = async () => { const st = m.querySelector('.sp-st'); st.textContent = 'Creating…'; v('spn-go').disabled = true;
    try { const doc = await createDoc(S, { type, title: v('spn-title').value.trim(), number: v('spn-num').value.trim(), project: v('spn-proj').value || null, format: v('spn-fmt').value || null }); m.remove(); openEditor(S, doc); }
    catch (e) { st.textContent = 'Not created: ' + (sqlMissing(e) ? 'run the DrawUp Specs SQL first.' : (e.message || e)); v('spn-go').disabled = false; } };
}
async function createDoc(S, o) {
  const t = TYPE[o.type]; const doc = { ...scopeFields(S), doc_type: o.type, kind: t.kind, type_label: t.label, title: o.title || t.label, doc_number: o.number || '', project_thread_id: o.project, format_id: o.format, status: 'draft', data: {} };
  if (t.kind === 'spec') { doc.outline = !!t.outline; doc.sections = (o.sections || t.starter || []).map(n => makeSection(n, null, doc.outline)); }
  else { doc.fields = JSON.parse(JSON.stringify(t.fields || [])); doc.heading = t.label; doc.blocks = JSON.parse(JSON.stringify(o.blocks || t.blocks || [])).map(b => ({ id: X.rid(), ...b }));
    if (o.project) { const br = await brief(S, o.project).catch(() => null); doc.blocks.forEach(b => { if (b.pull) pullInto(S, doc, b, br); }); } }
  const row = { ...scopeFields(S), created_by: S.me, source: o.source || 'specs', ...toRow(doc, S.me) };
  const r = await S.c.client.from(DOCS(S)).insert(row).select('*').single(); if (r.error) throw r.error;
  const d = fromRow(r.data); S.docs.unshift(d); return d;
}
// Fill a table block from the project: drawing sheets, Check findings or the project team.
function pullInto(S, doc, b, br) {
  const cols = b.table.cols.map(c => c.toLowerCase()); const at = (row, name, val) => { const i = cols.findIndex(c => c.includes(name)); if (i >= 0) row[i] = val; };
  const blank = () => cols.map(() => '');
  if (b.pull === 'sheets' && br && br.sheets.length) b.table.rows = br.sheets.map(s => { const r = blank(); at(r, 'cop', '1'); at(r, 'sheet', s.sheet_number || ''); at(r, 'title', s.sheet_title || ''); at(r, 'date', day(s.set_date)); return r; });
  if (b.pull === 'findings' && br && br.reviews.length) { let n = 0; const rows = []; br.reviews.forEach(rv => (Array.isArray(rv.findings) ? rv.findings : []).forEach(f => { const r = blank(); at(r, 'no', String(++n)); at(r, 'sheet', f.sheet || f.sheet_number || f.location || ''); at(r, 'finding', f.title || f.issue || f.summary || f.description || ''); at(r, 'severity', f.severity || ''); at(r, 'status', 'Open'); rows.push(r); })); if (rows.length) b.table.rows = rows.slice(0, 300); }
  if (b.pull === 'team') { const pd = doc.project_thread_id ? projectData(S, doc.project_thread_id).data : {}; const team = [['owner_rep', 'Owner representative', 'owner_name'], ['pm_name', 'Project manager', 'architect_name'], ['ca_name', 'Construction administrator', 'architect_name'], ['contractor_name', 'Contractor', 'contractor_name'], ['cm_name', 'Construction manager', 'cm_name'], ['structural_engineer', 'Structural engineer', ''], ['mep_engineer', 'MEP engineer', ''], ['civil_engineer', 'Civil engineer', '']].filter(([k]) => pd[k]);
    if (team.length) b.table.rows = team.map(([k, role, co]) => { const r = blank(); at(r, 'name', '<<' + k + '>>'); at(r, 'role', role); at(r, 'company', co && co !== k ? '<<' + co + '>>' : ''); return r; }); }
}

/* ------------------------------------------------------------------ editor shell */
function openEditor(S, doc) {
  if (!doc) return renderHub(S);
  setHashParam('doc', doc.id);
  // v30: a CheckUp finding opens the section it came from
  let want = null; try { want = sessionStorage.getItem('du-specs-section'); if (want) sessionStorage.removeItem('du-specs-section'); } catch (_e) { /* private mode */ }
  if (want && doc.kind === 'spec' && doc.sections.some(s => s.id === want)) S.secId = want;
  S.doc = doc; S.side = S.side || null; S.showChanges = false; S.secId = doc.kind === 'spec' ? ((doc.sections.find(s => s.id === S.secId) || sortedSecs(doc)[0] || {}).id || null) : null; S.part = S.part || 2; S.dirty = false; S.loadedAt = doc.updated_at;
  const b = S.body, p = project(S, doc.project_thread_id), t = TYPE[doc.doc_type];
  b.innerHTML = `<div class="sp-wrap sp-ed ${doc.kind === 'spec' ? 'spec' : 'letter'}" data-sp="editor">
  <div class="sp-top">
    <div class="sp-top-l"><button class="du-btn ghost sp-back" type="button" aria-label="Back to documents">← Documents</button><div class="sp-top-t"><span class="sp-top-k">${esc(t.group)} · ${esc(t.label)}</span><input class="sp-title" value="${esc(doc.title)}" aria-label="Document title"><span class="sp-saved" role="status"></span></div></div>
    <div class="sp-top-r">
      <label class="sp-mini"><span>Project</span><select data-top="project"><option value="">No project</option>${S.projects.map(x => `<option value="${x.id}" ${x.id === doc.project_thread_id ? 'selected' : ''}>${esc(x.project_name)}</option>`).join('')}</select></label>
      <label class="sp-mini"><span>Format</span><select data-top="format" title="Changes the layout only. The text stays exactly as it is."><option value="">DrawUp standard</option>${S.formats.map(f => `<option value="${f.id}" ${f.id === doc.format_id ? 'selected' : ''}>${f.kind === 'firm' ? 'Firm standard: ' + esc(f.name) : 'Client: ' + esc(f.client_name || f.name)}</option>`).join('')}</select></label>
      <label class="sp-mini"><span>Status</span><select data-top="status">${DOC_STATUS.map(([k, l]) => `<option value="${k}" ${k === doc.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${(S.hooks && S.hooks.topHTML) ? S.hooks.topHTML(doc, S) : ''}${doc.kind === 'spec' && window.DrawUpSpecsAI ? '<button class="du-btn ghost" type="button" data-sp-ai>Draft with AI</button>' : ''}${window.DrawUpMarks ? `<button class="du-btn ghost" type="button" data-sp-marks>Seal & signature${(doc.data && Array.isArray(doc.data.marks) && doc.data.marks.length) ? ` (${doc.data.marks.length})` : ''}</button>` : ''}<button class="du-btn ghost" type="button" data-side="data">Project data</button><button class="du-btn primary" type="button" data-side="preview">Preview &amp; export</button>
      <button class="du-btn ghost sp-more" type="button" aria-label="More" data-more>⋯</button>
    </div></div>
  <div class="sp-conflict" hidden></div>
  <div class="sp-main">${doc.kind === 'spec' ? '<aside class="sp-tree"></aside>' : ''}<section class="sp-doc"></section><aside class="sp-side" hidden></aside></div></div>`;
  const savedEl = b.querySelector('.sp-saved'); S.savedEl = savedEl; showSaved(S);
  b.querySelector('.sp-back').onclick = async () => { await flush(S); S.doc = null; renderHub(S); };
  b.querySelector('.sp-title').oninput = e => { doc.title = e.target.value; dirty(S); };
  b.querySelector('[data-top="project"]').onchange = async e => { doc.project_thread_id = e.target.value || null; dirty(S); if (doc.project_thread_id) await Promise.all([brief(S, doc.project_thread_id).catch(() => null), intelFor(S, doc.project_thread_id).catch(() => null)]); redraw(S); if (S.side) openSide(S, S.side); };
  b.querySelector('[data-top="format"]').onchange = e => { doc.format_id = e.target.value || null; dirty(S); if (S.side === 'preview') openSide(S, 'preview'); };
  b.querySelector('[data-top="status"]').onchange = e => { doc.status = e.target.value; dirty(S); };
  b.querySelectorAll('[data-side]').forEach(x => x.onclick = () => S.side === x.dataset.side ? closeSide(S) : openSide(S, x.dataset.side));
  b.querySelector('[data-more]').onclick = e => moreMenu(S, e.currentTarget);
  if (S.hooks && S.hooks.bindTop) S.hooks.bindTop(b, doc, S);
  { const ai = b.querySelector('[data-sp-ai]'); if (ai) ai.onclick = () => window.DrawUpSpecsAI.open(S); } // v30 AI drafting
  { const mk = b.querySelector('[data-sp-marks]'); if (mk) mk.onclick = () => window.DrawUpMarks.open(S); } // v30 seals and signatures
  if (doc.project_thread_id) Promise.all([brief(S, doc.project_thread_id), intelFor(S, doc.project_thread_id)]).then(() => { if (S.doc === doc) { redraw(S); if (S.side) openSide(S, S.side); } }).catch(() => null);
  redraw(S); if (S.side) openSide(S, S.side);
}
function moreMenu(S, at) {
  const doc = S.doc; document.querySelector('.sp-menu')?.remove();
  const items = [['dup', 'Duplicate document'], ...(doc.kind === 'spec' ? [['changes', S.showChanges ? 'Hide changes' : 'Show changes from the starter text']] : []), ...((S.hooks && S.hooks.menuItems) ? S.hooks.menuItems(doc, S) : []), ['del', 'Delete document']];
  const r = at.getBoundingClientRect(); document.body.insertAdjacentHTML('beforeend', `<div class="sp-menu" role="menu" style="top:${r.bottom + 6 + window.scrollY}px;left:${Math.max(8, r.right - 260 + window.scrollX)}px">${items.map(([k, l]) => `<button type="button" role="menuitem" data-m="${k}">${l}</button>`).join('')}</div>`);
  const m = document.querySelector('.sp-menu'); const close = e => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', close); } }; setTimeout(() => document.addEventListener('mousedown', close));
  m.querySelectorAll('[data-m]').forEach(x => x.onclick = async () => { m.remove();
    if (S.hooks && S.hooks.menuPick && await S.hooks.menuPick(x.dataset.m, doc, S)) return;
    if (x.dataset.m === 'changes') { S.showChanges = !S.showChanges; redraw(S); }
    if (x.dataset.m === 'dup') { await flush(S); try { const copy = JSON.parse(JSON.stringify(doc)); const d = await createDoc(S, { type: doc.doc_type, title: doc.title + ' (copy)', number: doc.doc_number, project: doc.project_thread_id, format: doc.format_id, sections: [] }); Object.assign(d, { sections: copy.sections, blocks: copy.blocks, fields: copy.fields, heading: copy.heading, data: copy.data, outline: copy.outline }); S.doc = d; await save(S, true); openEditor(S, d); toast(S, 'Copy made.'); } catch (e) { toast(S, e.message || String(e), true); } }
    if (x.dataset.m === 'del') { if (!confirm('Delete “' + doc.title + '”? This cannot be undone.')) return; const r2 = await S.c.client.from(DOCS(S)).delete().eq('id', doc.id).select('id'); if (r2.error || !r2.data?.length) { toast(S, r2.error?.message || 'Only the person who made it or a firm admin can delete it.', true); return; } S.docs = S.docs.filter(d => d.id !== doc.id); S.doc = null; clearTimeout(S.timer); S.dirty = false; renderHub(S); toast(S, 'Document deleted.'); }
  });
}
function redraw(S) { if (S.doc.kind === 'spec') { renderTree(S); renderSection(S); } else renderLetter(S); }
function dirty(S) { S.dirty = true; showSaved(S); clearTimeout(S.timer); S.timer = setTimeout(() => save(S), 1200); }
async function flush(S) { clearTimeout(S.timer); if (S.dirty) await save(S); }
function showSaved(S) { if (!S.savedEl || !S.doc) return; const d = S.doc; S.savedEl.textContent = S.saving ? 'Saving…' : S.dirty ? 'Unsaved changes' : 'Last saved: ' + stamp(d.updated_at) + (d.updated_by ? ' - ' + memberName(S, d.updated_by) : ''); S.savedEl.classList.toggle('bad', !!S.saveError); if (S.saveError) S.savedEl.textContent = 'Not saved: ' + S.saveError; }
async function save(S, force) {
  const doc = S.doc; if (!doc || (!S.dirty && !force)) return; if (S.saving) { S.again = true; return; }
  S.saving = true; S.saveError = ''; showSaved(S);
  try {
    if (!force) { const cur = await S.c.client.from(DOCS(S)).select('updated_at,updated_by').eq('id', doc.id).maybeSingle();
      if (cur.data && S.loadedAt && cur.data.updated_at && cur.data.updated_at !== S.loadedAt && cur.data.updated_by && cur.data.updated_by !== S.me && !S.overwrite) { S.saving = false; conflict(S, cur.data); return; } }
    const row = toRow(doc, S.me); S.dirty = false;
    const r = await S.c.client.from(DOCS(S)).update(row).eq('id', doc.id).select('updated_at,updated_by'); if (r.error) throw r.error; if (!r.data?.length) throw new Error('the database did not confirm the save');
    doc.updated_at = r.data[0].updated_at || row.updated_at; doc.updated_by = S.me; S.loadedAt = doc.updated_at;
    if (S.hooks && S.hooks.afterSave) { try { await S.hooks.afterSave(doc, S); } catch (e) { console.warn('Document Studio version', e); } }
  } catch (e) { S.dirty = true; S.saveError = sqlMissing(e) ? 'run the DrawUp Specs SQL' : (e.message || String(e)); }
  S.saving = false; showSaved(S); if (S.again) { S.again = false; save(S); }
}
function conflict(S, cur) { const el = S.body.querySelector('.sp-conflict'); if (!el) return; el.hidden = false; el.innerHTML = `<b>${esc(memberName(S, cur.updated_by) || 'Someone')} saved this document at ${esc(stamp(cur.updated_at))}.</b> <button class="du-btn ghost" type="button" data-c="reload">Load their version</button> <button class="du-btn ghost" type="button" data-c="keep">Keep mine and save</button>`;
  el.querySelector('[data-c="reload"]').onclick = async () => { const r = await S.c.client.from(DOCS(S)).select('*').eq('id', S.doc.id).single(); if (r.data) { const d = fromRow(r.data); S.docs = S.docs.map(x => x.id === d.id ? d : x); S.dirty = false; openEditor(S, d); } };
  el.querySelector('[data-c="keep"]').onclick = () => { S.overwrite = true; el.hidden = true; save(S).then(() => { S.overwrite = false; }); }; }

/* ------------------------------------------------------------------ spec editor: tree */
const sortedSecs = doc => doc.sections.slice().sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
function renderTree(S) {
  const doc = S.doc, el = S.body.querySelector('.sp-tree'); if (!el) return; const tab = S.treeTab || 'div', q = (S.treeQ || '').toLowerCase();
  el.innerHTML = `<div class="sp-tree-tabs"><button type="button" class="${tab === 'div' ? 'on' : ''}" data-tt="div">Divisions</button><button type="button" class="${tab === 'dwg' ? 'on' : ''}" data-tt="dwg">From drawings</button></div>
  ${tab === 'div' ? `<input class="sp-in sp-tree-q" type="search" placeholder="Search by title, number, or keyword…" value="${esc(S.treeQ || '')}" aria-label="Search sections"><div class="sp-tree-list"></div><div class="sp-tree-add"><button class="du-btn primary" type="button" data-add>＋ Add section</button><button class="du-btn ghost" type="button" data-imp>Import from Word or PDF</button></div>` : '<div class="sp-dwg"></div>'}`;
  el.querySelectorAll('[data-tt]').forEach(x => x.onclick = () => { S.treeTab = x.dataset.tt; renderTree(S); });
  if (tab === 'dwg') return renderFromDrawings(S, el.querySelector('.sp-dwg'));
  el.querySelector('.sp-tree-q').oninput = e => { S.treeQ = e.target.value; const pos = e.target.selectionStart; renderTree(S); const i = S.body.querySelector('.sp-tree-q'); i.focus(); i.setSelectionRange(pos, pos); };
  el.querySelector('[data-add]').onclick = () => addSectionModal(S); el.querySelector('[data-imp]').onclick = () => importModal(S);
  const ctx = ctxFor(S, doc); const secs = sortedSecs(doc).filter(s => !q || (s.number + ' ' + s.title + ' ' + JSON.stringify(s.parts)).toLowerCase().includes(q));
  const byDiv = {}; secs.forEach(s => (byDiv[String(s.number).slice(0, 2)] = byDiv[String(s.number).slice(0, 2)] || []).push(s));
  S.openDivs = S.openDivs || {};
  el.querySelector('.sp-tree-list').innerHTML = !secs.length ? `<p class="sp-note">${doc.sections.length ? 'No section matches.' : 'No sections yet. Add one, import one, or let the drawings suggest them.'}</p>` : D.GROUPS.map(([gk, gl, divs]) => { const here = divs.filter(d => byDiv[d]); if (!here.length) return ''; return `<div class="sp-grp"><span class="sp-grp-l">${esc(gl)}</span>${here.map(dv => { const open = S.openDivs[dv] !== false; return `<div class="sp-div"><button type="button" class="sp-div-h" data-div="${dv}" aria-expanded="${open}"><i>${open ? '▾' : '▸'}</i>DIVISION ${dv} - ${esc(D.DIVISIONS[dv].toUpperCase())}</button>${open ? byDiv[dv].map(s => { const n = X.openItems(JSON.stringify(s.parts), ctx); return `<div class="sp-sec ${s.id === S.secId ? 'on' : ''} st-${s.state}" ><button type="button" class="sp-sec-b" data-sec="${s.id}"><span>${esc(s.number)} - ${esc(String(s.title).toUpperCase())}</span><small>${esc((SEC_STATES.find(x => x[0] === s.state) || [])[1] || '')}${s.assigned ? ' · ' + esc(memberName(S, s.assigned)) : ''}${n ? ' · ' + n + ' open' : ''}</small></button><button type="button" class="sp-dots" data-secm="${s.id}" aria-label="Section menu">⋮</button></div>`; }).join('') : ''}</div>`; }).join('')}</div>`; }).join('');
  el.querySelectorAll('[data-div]').forEach(x => x.onclick = () => { S.openDivs[x.dataset.div] = S.openDivs[x.dataset.div] === false; renderTree(S); });
  el.querySelectorAll('[data-sec]').forEach(x => x.onclick = () => { S.secId = x.dataset.sec; renderTree(S); renderSection(S); if (window.innerWidth < 900) S.body.querySelector('.sp-doc').scrollIntoView({ block: 'start' }); });
  el.querySelectorAll('[data-secm]').forEach(x => x.onclick = () => secMenu(S, x.dataset.secm, x));
}
function secMenu(S, id, at) {
  const doc = S.doc, s = doc.sections.find(x => x.id === id); document.querySelector('.sp-menu')?.remove();
  const r = at.getBoundingClientRect(); document.body.insertAdjacentHTML('beforeend', `<div class="sp-menu" role="menu" style="top:${r.bottom + 4 + window.scrollY}px;left:${r.left + window.scrollX}px"><button type="button" data-m="ren">Rename or renumber</button><button type="button" data-m="dup">Duplicate</button><button type="button" data-m="ex">${s.state === 'excluded' ? 'Put back in the manual' : 'Leave out of the manual'}</button><button type="button" data-m="del">Remove from project</button></div>`);
  const m = document.querySelector('.sp-menu'); const close = e => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', close); } }; setTimeout(() => document.addEventListener('mousedown', close));
  m.querySelectorAll('[data-m]').forEach(x => x.onclick = () => { m.remove(); const k = x.dataset.m;
    if (k === 'ren') { const mm = modal('Rename section', 'SECTION', `<div class="sp-grid2"><label><span>Number</span><input class="sp-in" id="spr-n" value="${esc(s.number)}"></label><label><span>Title</span><input class="sp-in" id="spr-t" value="${esc(s.title)}"></label></div><div class="sp-savebar"><button class="du-btn primary" type="button" id="spr-go">Save</button></div>`); mm.querySelector('#spr-go').onclick = () => { s.number = mm.querySelector('#spr-n').value.trim() || s.number; s.title = mm.querySelector('#spr-t').value.trim() || s.title; mm.remove(); dirty(S); redraw(S); }; }
    if (k === 'dup') { const c2 = JSON.parse(JSON.stringify(s)); c2.id = X.rid(); c2.title += ' (copy)'; doc.sections.push(c2); S.secId = c2.id; dirty(S); redraw(S); }
    if (k === 'ex') { s.state = s.state === 'excluded' ? 'draft' : 'excluded'; dirty(S); redraw(S); }
    if (k === 'del') { if (!confirm('Remove ' + s.number + ' ' + s.title + ' from this project manual?')) return; doc.sections = doc.sections.filter(x => x.id !== id); if (S.secId === id) S.secId = (sortedSecs(doc)[0] || {}).id || null; dirty(S); redraw(S); }
  });
}
async function renderFromDrawings(S, el) {
  const doc = S.doc; if (!doc.project_thread_id) { el.innerHTML = '<p class="sp-note">Pick a project at the top. DrawUp reads the sheet titles of its latest drawing set and suggests the sections the drawings call for.</p>'; return; }
  el.innerHTML = '<p class="sp-note">Reading the drawing set…</p>'; const br = await brief(S, doc.project_thread_id).catch(() => null);
  if (!br || !br.sheets.length) { el.innerHTML = '<p class="sp-note">This project has no drawing set yet. Upload one in Projects › Drawing sets and the suggestions show up here.</p>'; return; }
  const have = new Set(doc.sections.map(s => s.number)); const sugg = [];
  const STOP = new Set(['plan', 'plans', 'schedule', 'sheet', 'sheets', 'section', 'sections', 'wall', 'walls', 'elevation', 'elevations', 'general', 'site', 'floor', 'finish', 'detail', 'details', 'type', 'index', 'drawing', 'exterior', 'interior', 'power', 'existing']);
  D.CATALOG.forEach(([num, title, kw]) => { if (!kw) return; const words = kw.split(' ').filter(w => w.length > 2 && !STOP.has(w)); if (!words.length) return; const hits = br.sheets.filter(s => { const t = ' ' + (s.sheet_title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' '; const has = w => t.includes(' ' + w); return words.length <= 2 ? words.every(has) : words.some(has); }); if (hits.length) sugg.push({ num, title, hits }); });
  el.innerHTML = `<p class="sp-note">${br.sheets.length} sheets in the latest set. Sections the sheet titles point to:</p>${sugg.length ? sugg.map(s => `<div class="sp-sug"><div><b>${esc(s.num)} - ${esc(s.title)}</b><small>${s.hits.slice(0, 3).map(h => esc((h.sheet_number || '') + ' ' + (h.sheet_title || ''))).join(' · ')}${s.hits.length > 3 ? ' · +' + (s.hits.length - 3) : ''}</small></div>${have.has(s.num) ? '<span class="sp-have">Added</span>' : `<button type="button" class="du-btn ghost" data-sadd="${esc(s.num)}">Add</button>`}</div>`).join('') : '<p class="sp-note">No matches in the sheet titles.</p>'}${sugg.some(s => !have.has(s.num)) ? '<button type="button" class="du-btn primary" data-sall>Add all suggested</button>' : ''}`;
  const add = nums => { nums.forEach(n => { if (!doc.sections.some(s => s.number === n)) doc.sections.push(makeSection(n, null, doc.outline)); }); dirty(S); renderTree(S); renderSection(S); };
  el.querySelectorAll('[data-sadd]').forEach(x => x.onclick = () => { add([x.dataset.sadd]); S.secId = doc.sections.find(s => s.number === x.dataset.sadd).id; renderTree(S); renderSection(S); });
  el.querySelector('[data-sall]')?.addEventListener('click', () => add(sugg.map(s => s.num)));
}
function addSectionModal(S) {
  const doc = S.doc; const m = modal('Add sections', 'MASTERFORMAT', `<div class="sp-grid2"><input class="sp-in" type="search" id="spa-q" placeholder="Search by number or title" aria-label="Search sections"><select class="sp-in" id="spa-d" aria-label="Division"><option value="">All divisions</option>${Object.entries(D.DIVISIONS).map(([k, l]) => `<option value="${k}">${k} - ${esc(l)}</option>`).join('')}</select></div><div class="sp-cat"></div>
  <details class="sp-custom"><summary>Add a section that is not on the list</summary><div class="sp-grid2"><label><span>Number</span><input class="sp-in" id="spa-n" placeholder="07 65 00"></label><label><span>Title</span><input class="sp-in" id="spa-t" placeholder="Flexible flashing"></label></div><button class="du-btn ghost" type="button" id="spa-c">Add this section</button></details>
  <p class="sp-note">Sections with written starter text: ${Object.keys(D.MASTER).join(', ')}. Every other section starts from a DrawUp outline with blanks to fill. Starter text is a general starting point, not a licensed master guide spec, and needs review for the project.</p>`, true);
  const list = m.querySelector('.sp-cat');
  const draw = () => { const q = m.querySelector('#spa-q').value.toLowerCase(), dv = m.querySelector('#spa-d').value; const have = new Set(doc.sections.map(s => s.number));
    const rows = D.CATALOG.filter(([n, t]) => (!dv || n.startsWith(dv)) && (!q || (n + ' ' + t).toLowerCase().includes(q) || n.replace(/\s/g, '').includes(q.replace(/\s/g, ''))));
    list.innerHTML = rows.map(([n, t]) => `<div class="sp-cat-r"><span><b>${esc(n)}</b> ${esc(t)}${D.MASTER[n] ? ' <i class="sp-tag">Starter text</i>' : ''}</span>${have.has(n) ? '<span class="sp-have">In this manual</span>' : `<button type="button" class="du-btn ghost" data-n="${esc(n)}">Add</button>`}</div>`).join('') || '<p class="sp-note">Nothing matches.</p>';
    list.querySelectorAll('[data-n]').forEach(x => x.onclick = () => { const s = makeSection(x.dataset.n, null, doc.outline); doc.sections.push(s); S.secId = s.id; dirty(S); redraw(S); draw(); toast(S, s.number + ' added.'); }); };
  m.querySelector('#spa-q').oninput = draw; m.querySelector('#spa-d').onchange = draw; draw();
  m.querySelector('#spa-c').onclick = () => { const n = m.querySelector('#spa-n').value.trim(), t = m.querySelector('#spa-t').value.trim(); if (!/^\d{2}\s?\d{2}\s?\d{2}(\.\d{2})?$/.test(n) || !t) { toast(S, 'Use a number like 07 65 00 and a title.', true); return; } const num = n.replace(/^(\d{2})\s?(\d{2})\s?(\d{2})/, '$1 $2 $3'); const s = makeSection(num, t, doc.outline); doc.sections.push(s); S.secId = s.id; dirty(S); redraw(S); m.remove(); };
}
function importModal(S) {
  if (window.DrawUpSpecsImport) { window.DrawUpSpecsImport.open(S); return; } // v30: four sources, nothing removed, word-for-word check
  const doc = S.doc; const m = modal('Import a section', 'WORD OR PDF', `<p class="sp-note">Use a section the client or a consultant sent you. DrawUp reads SECTION, PART 1/2/3, articles (1.1) and paragraphs (A., 1., a.). Word list numbering works too. Nothing leaves your firm.</p><label class="du-btn ghost sp-file">Choose a .docx or .pdf<input type="file" accept=".docx,.pdf,application/pdf,${DOCX_MIME}" hidden></label><div class="sp-imp"></div>`);
  m.querySelector('input').onchange = async e => { const f = e.target.files[0]; if (!f) return; const out = m.querySelector('.sp-imp'); out.innerHTML = '<p class="sp-note">Reading…</p>';
    try { const bytes = new Uint8Array(await f.arrayBuffer()); const lines = isDocx(f) ? await X.readDocxText(bytes) : isPdf(f) ? await X.readPdfText(bytes) : null; if (!lines) throw new Error('Use a Word (.docx) or PDF file.');
      const sec = X.parseSpecText(lines); const counts = [1, 2, 3].map(n => sec.parts[n].reduce((a, x) => a + x.paras.length, 0)); if (!counts.some(Boolean)) throw new Error('No spec paragraphs were found in this file.');
      out.innerHTML = `<div class="sp-grid2"><label><span>Number</span><input class="sp-in" id="spi-n" value="${esc(sec.number)}"></label><label><span>Title</span><input class="sp-in" id="spi-t" value="${esc(sec.title || f.name.replace(/\.\w+$/, ''))}"></label></div><p class="sp-note">Found ${[1, 2, 3].map(n => `Part ${n}: ${sec.parts[n].length} articles, ${counts[n - 1]} paragraphs`).join(' · ')}.</p><button class="du-btn primary" type="button" id="spi-go">Add to this manual</button>`;
      out.querySelector('#spi-go').onclick = () => { const s = { id: X.rid(), number: out.querySelector('#spi-n').value.trim() || '00 00 00', title: out.querySelector('#spi-t').value.trim() || 'Imported section', state: 'draft', assigned: null, parts: sec.parts, imported: f.name }; [1, 2, 3].forEach(n => s.parts[n].forEach(a => { a.base_title = a.title; })); doc.sections.push(s); S.secId = s.id; dirty(S); redraw(S); m.remove(); toast(S, 'Section imported.'); };
    } catch (er) { out.innerHTML = `<p class="sp-bad">${esc(er.message || er)}</p>`; } };
}

/* ------------------------------------------------------------------ spec editor: section */
function renderSection(S) {
  const doc = S.doc, el = S.body.querySelector('.sp-doc'); const s = doc.sections.find(x => x.id === S.secId);
  if (!s) { el.innerHTML = `<div class="sp-blank"><h3>${doc.sections.length ? 'Pick a section on the left.' : 'Add the first section.'}</h3><p class="du-muted">Sections follow CSI MasterFormat. Each one has Part 1 General, Part 2 Products and Part 3 Execution.</p><button class="du-btn primary" type="button" data-add2>＋ Add section</button></div>`; el.querySelector('[data-add2]').onclick = () => addSectionModal(S); return; }
  const ctx = ctxFor(S, doc), part = S.part, arts = s.parts[part] || (s.parts[part] = []), fmt = fmtFor(S, doc);
  const n = X.openItems(JSON.stringify(s.parts), ctx);
  el.innerHTML = `<div class="sp-parts" role="tablist">${[1, 2, 3].map(k => `<button type="button" role="tab" class="${k === part ? 'on' : ''}" data-part="${k}" aria-selected="${k === part}">Part ${k} - ${{ 1: 'General', 2: 'Products', 3: 'Execution' }[k]}</button>`).join('')}</div>
  <div class="sp-sheet">
    <div class="sp-tools-bar" role="toolbar" aria-label="Insert"><button type="button" data-ins="blank" title="Insert a blank to fill in">＋ Blank</button><button type="button" data-ins="opt" title="Insert a choice">＋ Choice</button><button type="button" data-ins="data" title="Insert project data">＋ Project data</button><span class="sp-sep"></span><button type="button" data-tb="changes" class="${S.showChanges ? 'on' : ''}">${S.showChanges ? 'Hide changes' : 'Show changes'}</button><button type="button" data-tb="expand">Expand all</button></div>
    <h2 class="sp-sec-title">${esc(s.number)} - ${esc(String(s.title).toUpperCase())}</h2>
    <div class="sp-secmeta"><label><b>State:</b><select data-sm="state">${SEC_STATES.map(([k, l]) => `<option value="${k}" ${s.state === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><span class="sp-bar">|</span><label><b>Assigned to:</b><select data-sm="assigned"><option value="">Nobody</option>${S.members.map(mb => `<option value="${mb.id}" ${s.assigned === mb.id ? 'selected' : ''}>${esc(mb.name)}</option>`).join('')}</select></label><span class="sp-bar">|</span><span class="sp-openn ${n ? 'has' : ''}"><b>Open items:</b> ${n}</span>${s.imported ? `<span class="sp-bar">|</span><span class="sp-note">Imported from ${esc(typeof s.imported === 'object' ? s.imported.file + (s.imported.source ? ' (' + ((window.DrawUpSpecsImport && window.DrawUpSpecsImport.SOURCES[s.imported.source] || {}).label || s.imported.source) + ')' : '') : s.imported)}${s.dup_of ? ' · same number as another section; compare and exclude one' : ''}</span>` : ''}${s.ai ? `<span class="sp-bar">|</span><span class="sp-note sp-ai-note">AI draft, ${esc(day(s.ai.at))}: review every line before it is issued</span>` : ''}</div>
    ${doc.outline && part !== 2 ? '<p class="sp-note">Outline specifications usually carry Part 2 only. Add articles here if this project needs them.</p>' : ''}
    <div class="sp-arts">${arts.map((a, ai) => artHTML(S, a, part + '.' + (ai + 1), ctx, fmt)).join('')}</div>
    <button type="button" class="du-btn ghost sp-add-art" data-addart>＋ Add article</button>
  </div>`;
  el.querySelectorAll('[data-part]').forEach(x => x.onclick = () => { S.part = +x.dataset.part; renderSection(S); });
  el.querySelector('[data-sm="state"]').onchange = e => { s.state = e.target.value; dirty(S); renderTree(S); };
  el.querySelector('[data-sm="assigned"]').onchange = e => { s.assigned = e.target.value || null; dirty(S); renderTree(S); };
  el.querySelector('[data-tb="changes"]').onclick = () => { S.showChanges = !S.showChanges; renderSection(S); };
  el.querySelector('[data-tb="expand"]').onclick = () => { arts.forEach(a => { a.closed = false; }); renderSection(S); };
  el.querySelector('[data-addart]').onclick = () => { const a = { id: X.rid(), title: 'NEW ARTICLE', base_title: '', paras: [{ id: X.rid(), t: '', base: '', lvl: 0 }] }; arts.push(a); dirty(S); renderSection(S); focusEl(el, `.sp-art-t[data-aid="${a.id}"]`, true); };
  bindArticles(S, el, s, arts);
  bindInsert(S, el);
}
function artHTML(S, a, num, ctx, fmt) {
  const paras = a.paras || [], labs = X.paraLabels(paras.filter(p => !p.off), fmt.numbering, num); let li = 0;
  return `<div class="sp-art ${a.off ? 'off' : ''} ${a.closed ? 'closed' : ''}" data-aid="${a.id}"><div class="sp-art-h"><button type="button" class="sp-chev" data-a="toggle" aria-label="${a.closed ? 'Expand' : 'Collapse'} article" aria-expanded="${!a.closed}">${a.closed ? '›' : '⌄'}</button><b class="sp-num">${a.off ? '–' : num}</b><span class="sp-art-t" contenteditable="${S.showChanges ? 'false' : 'true'}" spellcheck="true" data-aid="${a.id}">${S.showChanges && a.base_title != null && a.base_title !== a.title ? diffHTML(a.base_title, a.title) : esc(a.title)}</span>
  <span class="sp-atools"><button type="button" data-a="up" title="Move up" aria-label="Move article up">↑</button><button type="button" data-a="down" title="Move down" aria-label="Move article down">↓</button><button type="button" data-a="off" title="${a.off ? 'Put back' : 'Leave out'}" aria-label="${a.off ? 'Put article back' : 'Leave article out'}">${a.off ? '↺' : '⊘'}</button><button type="button" data-a="del" title="Delete article" aria-label="Delete article">✕</button></span></div>
  ${a.closed ? '' : `<div class="sp-paras">${paras.map(p => { const lab = p.off ? '–' : labs[li++]; return `<div class="sp-para lvl-${Math.min(3, p.lvl | 0)} ${p.off ? 'off' : ''}" data-pid="${p.id}"><button type="button" class="sp-lab" data-p="off" title="${p.off ? 'Put this paragraph back' : 'Leave this paragraph out'}">${esc(lab)}</button><div class="sp-txt" ${S.showChanges ? '' : 'contenteditable="true"'} spellcheck="true" data-pid="${p.id}" data-ph="Type the paragraph">${S.showChanges && p.base != null && p.base !== p.t ? diffHTML(X.resolve(p.base, ctx), X.resolve(p.t, ctx)) : richHTML(p.t, ctx)}</div><span class="sp-ptools"><button type="button" data-p="outd" title="Outdent (Shift+Tab)" aria-label="Outdent">⇤</button><button type="button" data-p="ind" title="Indent (Tab)" aria-label="Indent">⇥</button><button type="button" data-p="add" title="New paragraph below (Enter)" aria-label="New paragraph below">＋</button><button type="button" data-p="del" title="Delete paragraph" aria-label="Delete paragraph">✕</button></span></div>`; }).join('')}<button type="button" class="sp-addp" data-a="addp">＋ Paragraph</button></div>`}</div>`;
}
function focusEl(root, sel, end) { const e = root.querySelector(sel); if (!e) return; e.focus(); if (end) { const r = document.createRange(); r.selectNodeContents(e); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } }
function bindArticles(S, el, s, arts) {
  const findA = id => arts.find(a => a.id === id), findP = id => { for (const a of arts) { const i = a.paras.findIndex(p => p.id === id); if (i >= 0) return { a, i, p: a.paras[i] }; } return null; };
  el.querySelectorAll('.sp-art-t').forEach(t => { t.oninput = () => { findA(t.dataset.aid).title = t.textContent.replace(/\s+/g, ' ').trim(); dirty(S); }; t.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const a = findA(t.dataset.aid); if (!a.paras.length) a.paras.push({ id: X.rid(), t: '', base: '', lvl: 0 }); renderSection(S); focusEl(el, `.sp-txt[data-pid="${a.paras[0].id}"]`, true); } }; });
  el.querySelectorAll('.sp-txt[contenteditable]').forEach(t => {
    t.oninput = () => { const f = findP(t.dataset.pid); if (f) { f.p.t = serialize(t); dirty(S); } };
    t.onpaste = e => { e.preventDefault(); const txt = (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\r?\n+/g, ' '); document.execCommand('insertText', false, txt); };
    t.onkeydown = e => { const f = findP(t.dataset.pid); if (!f) return;
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const np = { id: X.rid(), t: '', base: '', lvl: f.p.lvl }; f.a.paras.splice(f.i + 1, 0, np); dirty(S); renderSection(S); focusEl(el, `.sp-txt[data-pid="${np.id}"]`); }
      else if (e.key === 'Tab') { e.preventDefault(); f.p.lvl = Math.max(0, Math.min(3, (f.p.lvl | 0) + (e.shiftKey ? -1 : 1))); dirty(S); renderSection(S); focusEl(el, `.sp-txt[data-pid="${f.p.id}"]`, true); }
      else if (e.key === 'Backspace' && !t.textContent && f.a.paras.length > 1) { e.preventDefault(); f.a.paras.splice(f.i, 1); dirty(S); const prev = f.a.paras[Math.max(0, f.i - 1)]; renderSection(S); focusEl(el, `.sp-txt[data-pid="${prev.id}"]`, true); } };
    t.addEventListener('focus', () => { S.lastEditable = t; });
  });
  el.querySelectorAll('[data-a]').forEach(x => x.onclick = () => { const a = findA(x.closest('.sp-art').dataset.aid), i = arts.indexOf(a), k = x.dataset.a;
    if (k === 'toggle') a.closed = !a.closed; if (k === 'up' && i > 0) arts.splice(i - 1, 0, arts.splice(i, 1)[0]); if (k === 'down' && i < arts.length - 1) arts.splice(i + 1, 0, arts.splice(i, 1)[0]);
    if (k === 'off') a.off = !a.off; if (k === 'del') { if (!confirm('Delete article “' + a.title + '”?')) return; arts.splice(i, 1); }
    if (k === 'addp') { const np = { id: X.rid(), t: '', base: '', lvl: 0 }; a.paras.push(np); dirty(S); renderSection(S); focusEl(el, `.sp-txt[data-pid="${np.id}"]`); return; }
    if (k !== 'toggle') dirty(S); renderSection(S); });
  el.querySelectorAll('[data-p]').forEach(x => x.onclick = () => { const f = findP(x.closest('.sp-para').dataset.pid), k = x.dataset.p; if (!f) return;
    if (k === 'off') f.p.off = !f.p.off; if (k === 'ind') f.p.lvl = Math.min(3, (f.p.lvl | 0) + 1); if (k === 'outd') f.p.lvl = Math.max(0, (f.p.lvl | 0) - 1);
    if (k === 'del') f.a.paras.splice(f.i, 1); let focusId = null; if (k === 'add') { const np = { id: X.rid(), t: '', base: '', lvl: f.p.lvl }; f.a.paras.splice(f.i + 1, 0, np); focusId = np.id; }
    dirty(S); renderSection(S); if (focusId) focusEl(el, `.sp-txt[data-pid="${focusId}"]`); });
  bindChips(S, el, t => { const f = findP(t.dataset.pid); if (f) { f.p.t = serialize(t); dirty(S); renderTree(S); } });
}
// Chips: pick a choice, fill a blank, open project data. commit(editable) saves the paragraph or cell.
function bindChips(S, root, commit) {
  root.__spCommit = commit; if (root.__spChips) return; root.__spChips = true; commit = el => root.__spCommit(el);
  root.addEventListener('mousedown', e => { if (e.target.closest('.sp-opts,.sp-chip')) e.preventDefault(); });
  root.addEventListener('click', e => {
    const opt = e.target.closest('.sp-opt'), chip = e.target.closest('.sp-chip'); const host = (opt || chip) && (opt || chip).closest('[contenteditable="true"]'); if (!host) return;
    if (opt) { const g = opt.closest('.sp-opts'); const k = X.tokens(g.dataset.raw)[0]; const j = +opt.dataset.j; k.sel = k.sel === j ? -1 : j; g.outerHTML = richHTML(X.untokens([k]), ctxFor(S, S.doc)); commit(host); return; }
    if (chip.classList.contains('data')) { openSide(S, 'data', chip.dataset.key); return; }
    const k = X.tokens(chip.dataset.raw)[0]; const r = chip.getBoundingClientRect(); document.querySelector('.sp-pop')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="sp-pop" style="top:${r.bottom + 6 + window.scrollY}px;left:${Math.min(window.innerWidth - 300, r.left) + window.scrollX}px"><label><span>${esc(k.label)}</span><input class="sp-in" value="${esc(k.value || '')}"></label><div><button type="button" class="du-btn primary" data-ok>Fill in</button><button type="button" class="du-btn ghost" data-clear>Clear</button><button type="button" class="du-btn ghost" data-txt>Make it plain text</button></div></div>`);
    const pop = document.querySelector('.sp-pop'), inp = pop.querySelector('input'); inp.focus(); inp.select();
    const done = (mode) => { if (mode === 'txt') { chip.replaceWith(document.createTextNode(inp.value || k.label)); } else { k.value = mode === 'clear' ? '' : inp.value; chip.outerHTML = richHTML(X.untokens([k]), ctxFor(S, S.doc)); } pop.remove(); commit(host); };
    pop.querySelector('[data-ok]').onclick = () => done('ok'); pop.querySelector('[data-clear]').onclick = () => done('clear'); pop.querySelector('[data-txt]').onclick = () => done('txt');
    inp.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); done('ok'); } if (ev.key === 'Escape') pop.remove(); };
    const away = ev => { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('mousedown', away); } }; setTimeout(() => document.addEventListener('mousedown', away));
  });
}
let LAST_RANGE = null;
document.addEventListener('selectionchange', () => { const sel = getSelection(); const n = sel.rangeCount && sel.anchorNode; const el = n && (n.nodeType === 1 ? n : n.parentElement); if (el && el.closest('.sp-ed [contenteditable="true"]')) LAST_RANGE = sel.getRangeAt(0).cloneRange(); });
function bindInsert(S, root) {
  root.querySelectorAll('[data-ins]').forEach(b => { b.onmousedown = e => e.preventDefault(); b.onclick = () => {
    const range = LAST_RANGE && root.contains(LAST_RANGE.startContainer) ? LAST_RANGE : null;
    if (!range) { toast(S, 'Click in a paragraph first, then insert.', true); return; }
    const host = range.startContainer.nodeType === 1 ? range.startContainer.closest('[contenteditable="true"]') : range.startContainer.parentElement.closest('[contenteditable="true"]'); if (!host) return;
    const put = raw => { const tmp = document.createElement('span'); tmp.innerHTML = richHTML(raw, ctxFor(S, S.doc)); const node = tmp.firstChild; range.deleteContents(); range.insertNode(node); range.setStartAfter(node); range.collapse(true); host.dispatchEvent(new Event('input', { bubbles: true })); };
    if (b.dataset.ins === 'blank') { const l = prompt('Name the blank, for example “Insert value” or “Manufacturer”:', 'Insert value'); if (l) put('{{' + l.replace(/[{}=]/g, '') + '}}'); }
    if (b.dataset.ins === 'opt') { const l = prompt('Type the choices separated by | (for example 1/180|1/240|1/360):', ''); if (l && l.includes('|')) put('[[' + l.replace(/[\[\]]/g, '') + ']]'); }
    if (b.dataset.ins === 'data') { const keys = D.PROJECT_FIELDS.concat(D.AUTO_TOKENS.map(a => [a[0], a[1]])); const m = modal('Insert project data', 'PROJECT DATA', `<div class="sp-keys">${keys.map(k => `<button type="button" class="sp-key" data-k="${k[0]}"><b>${esc(k[1])}</b><small>${esc(ctxFor(S, S.doc).data[k[0]] || 'Not set yet')}</small></button>`).join('')}</div>`); m.querySelectorAll('[data-k]').forEach(x => x.onclick = () => { m.remove(); put('<<' + x.dataset.k + '>>'); }); }
  }; });
}

/* ------------------------------------------------------------------ letter editor */
function renderLetter(S) {
  const doc = S.doc, el = S.body.querySelector('.sp-doc'), ctx = ctxFor(S, doc), fmt = fmtFor(S, doc);
  const lh = X.resolve(fmt.letterhead.lines || '', ctx).split('\n').map(s => s.replace(/\[[^\]]*\]/g, '').trim()).filter(Boolean);
  el.innerHTML = `<div class="sp-tools-bar" role="toolbar" aria-label="Insert"><button type="button" data-ins="blank">＋ Blank</button><button type="button" data-ins="opt">＋ Choice</button><button type="button" data-ins="data">＋ Project data</button><span class="sp-sep"></span><span class="sp-openn ${openCount(doc, ctx) ? 'has' : ''}"><b>Open items:</b> ${openCount(doc, ctx)}</span></div>
  <div class="sp-page" style="--sp-accent:${fmt.accent}">
    ${fmt.letterhead.show ? `<div class="sp-lh ${fmt.letterhead.align === 'right' ? 'r' : ''}">${S.firm.logo_url && fmt.letterhead.logo === 'firm' ? `<img src="${esc(S.firm.logo_url)}" alt="">` : ''}<div>${lh.map((l, i) => i ? `<span>${esc(l)}</span>` : `<b>${esc(l)}</b>`).join('')}</div></div>` : ''}
    <input class="sp-heading" value="${esc(doc.heading)}" aria-label="Document heading"><div class="sp-docno"><span>No.</span><input value="${esc(doc.doc_number)}" placeholder="Number" aria-label="Document number"></div><hr>
    <div class="sp-fields">${doc.fields.map((f, i) => `<div class="sp-field" data-fi="${i}"><input class="sp-flabel" value="${esc(f.label)}" aria-label="Field name"><div class="sp-fval" contenteditable="true" data-fi="${i}" aria-label="${esc(f.label)}">${richHTML(f.v, ctx)}</div><button type="button" class="sp-ic" data-fdel="${i}" aria-label="Remove field">✕</button></div>`).join('')}<button type="button" class="sp-addp" data-fadd>＋ Field</button></div>
    <div class="sp-blocks">${doc.blocks.map((b, i) => blockHTML(S, b, i, ctx)).join('')}</div>
    <div class="sp-addblocks"><span>Add</span><button type="button" class="du-btn ghost" data-badd="text">Text</button><button type="button" class="du-btn ghost" data-badd="table">Table</button><button type="button" class="du-btn ghost" data-badd="sheets">Drawing sheet list</button><button type="button" class="du-btn ghost" data-badd="findings">Check findings</button><button type="button" class="du-btn ghost" data-badd="sign">Signatures</button></div>
  </div>`;
  el.querySelector('.sp-heading').oninput = e => { doc.heading = e.target.value; dirty(S); };
  el.querySelector('.sp-docno input').oninput = e => { doc.doc_number = e.target.value; dirty(S); };
  el.querySelectorAll('.sp-flabel').forEach(x => x.oninput = () => { doc.fields[+x.closest('[data-fi]').dataset.fi].label = x.value; dirty(S); });
  el.querySelectorAll('[data-fdel]').forEach(x => x.onclick = () => { doc.fields.splice(+x.dataset.fdel, 1); dirty(S); renderLetter(S); });
  el.querySelector('[data-fadd]').onclick = () => { doc.fields.push({ k: 'f' + Date.now(), label: 'Field', v: '' }); dirty(S); renderLetter(S); };
  const commit = t => { if (t.dataset.fi != null && t.classList.contains('sp-fval')) doc.fields[+t.dataset.fi].v = serialize(t).replace(/\n/g, ' '); else if (t.dataset.cell) { const [bi, r, cc] = t.dataset.cell.split(':').map(Number); const b = doc.blocks[bi]; if (r < 0) b.table.cols[cc] = serialize(t); else b.table.rows[r][cc] = serialize(t); } else if (t.dataset.bp != null) doc.blocks[+t.dataset.bp].p = serialize(t); dirty(S); };
  el.querySelectorAll('[contenteditable="true"]').forEach(t => { t.oninput = () => commit(t); t.onpaste = e => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); };
    t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && (t.dataset.bp != null || t.dataset.cell)) { e.preventDefault(); document.execCommand('insertLineBreak'); } else if (e.key === 'Enter' && t.classList.contains('sp-fval')) e.preventDefault(); }; });
  el.querySelectorAll('[data-bh]').forEach(x => x.oninput = () => { doc.blocks[+x.dataset.bh].h = x.value; dirty(S); });
  el.querySelectorAll('[data-b]').forEach(x => x.onclick = async () => { const i = +x.closest('[data-bi]').dataset.bi, b = doc.blocks[i], k = x.dataset.b;
    if (k === 'up' && i > 0) doc.blocks.splice(i - 1, 0, doc.blocks.splice(i, 1)[0]); if (k === 'down' && i < doc.blocks.length - 1) doc.blocks.splice(i + 1, 0, doc.blocks.splice(i, 1)[0]);
    if (k === 'off') b.off = !b.off; if (k === 'del') { if (!confirm('Delete this part of the document?')) return; doc.blocks.splice(i, 1); }
    if (k === 'row+') b.table.rows.push(b.table.cols.map(() => '')); if (k === 'row-' && b.table.rows.length > 1) b.table.rows.pop();
    if (k === 'col+') { b.table.cols.push('Column'); b.table.rows.forEach(r => r.push('')); } if (k === 'col-' && b.table.cols.length > 1) { b.table.cols.pop(); b.table.rows.forEach(r => r.pop()); }
    if (k === 'pull') { if (!doc.project_thread_id && b.pull !== 'team') { toast(S, 'Pick a project at the top first.', true); return; } const br = await brief(S, doc.project_thread_id).catch(() => null); const before = JSON.stringify(b.table.rows); pullInto(S, doc, b, br); toast(S, JSON.stringify(b.table.rows) === before ? 'Nothing new to pull from the project yet.' : 'Filled from the project.'); }
    dirty(S); renderLetter(S); });
  el.querySelectorAll('[data-badd]').forEach(x => x.onclick = async () => { const k = x.dataset.badd; const nb = { id: X.rid() };
    if (k === 'text') Object.assign(nb, { h: 'Heading', p: '' }); if (k === 'table') Object.assign(nb, { h: 'Table', table: { cols: ['Item', 'Description', 'Notes'], rows: [['', '', '']] } });
    if (k === 'sheets') Object.assign(nb, { h: 'Drawing sheets', pull: 'sheets', table: { cols: ['Sheet', 'Title', 'Date'], rows: [['', '', '']] } });
    if (k === 'findings') Object.assign(nb, { h: 'Check findings', pull: 'findings', table: { cols: ['No.', 'Sheet', 'Finding', 'Severity', 'Status'], rows: [['1', '', '', '', 'Open']] } });
    if (k === 'sign') Object.assign(nb, { h: 'Signatures', table: { cols: ['Party', 'Name', 'Signature', 'Date'], rows: [['Architect', '<<architect_name>>', '', ''], ['Owner', '<<owner_name>>', '', ''], ['Contractor', '<<contractor_name>>', '', '']] } });
    if (nb.pull && doc.project_thread_id) pullInto(S, doc, nb, await brief(S, doc.project_thread_id).catch(() => null));
    doc.blocks.push(nb); dirty(S); renderLetter(S); });
  bindChips(S, el, commit); bindInsert(S, el);
}
function blockHTML(S, b, i, ctx) {
  const tools = `<span class="sp-btools">${b.pull ? `<button type="button" data-b="pull" title="Fill from the project">⟳ From project</button>` : ''}<button type="button" data-b="up" aria-label="Move up">↑</button><button type="button" data-b="down" aria-label="Move down">↓</button><button type="button" data-b="off" aria-label="${b.off ? 'Put back' : 'Leave out'}">${b.off ? '↺' : '⊘'}</button><button type="button" data-b="del" aria-label="Delete">✕</button></span>`;
  const head = `<div class="sp-bh"><input data-bh="${i}" value="${esc(b.h || '')}" placeholder="Heading (optional)" aria-label="Heading">${tools}</div>`;
  if (b.table) return `<div class="sp-block ${b.off ? 'off' : ''}" data-bi="${i}">${head}<div class="sp-tblwrap"><table class="sp-tbl"><thead><tr>${b.table.cols.map((c, cc) => `<th><div contenteditable="true" data-cell="${i}:-1:${cc}">${richHTML(c, ctx)}</div></th>`).join('')}</tr></thead><tbody>${b.table.rows.map((r, ri) => `<tr>${r.map((v, cc) => `<td><div contenteditable="true" data-cell="${i}:${ri}:${cc}">${richHTML(v, ctx)}</div></td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="sp-tbtools"><button type="button" data-b="row+">＋ Row</button><button type="button" data-b="row-">− Row</button><button type="button" data-b="col+">＋ Column</button><button type="button" data-b="col-">− Column</button></div></div>`;
  return `<div class="sp-block ${b.off ? 'off' : ''}" data-bi="${i}">${head}<div class="sp-bp" contenteditable="true" spellcheck="true" data-bp="${i}" data-ph="Type here">${richHTML(b.p || '', ctx).replace(/\n/g, '<br>')}</div></div>`;
}

/* ------------------------------------------------------------------ side panel: project data, preview & export */
function closeSide(S) { S.side = null; const s = S.body.querySelector('.sp-side'); if (s) { s.hidden = true; s.innerHTML = ''; } S.body.querySelector('.sp-main')?.classList.remove('with-side'); S.body.querySelectorAll('[data-side]').forEach(x => x.classList.remove('on')); }
async function openSide(S, kind, focusKey) {
  S.side = kind; const el = S.body.querySelector('.sp-side'); if (!el) return; el.hidden = false; el.onclick = e => { if (e.target.closest('[data-close]')) closeSide(S); }; S.body.querySelector('.sp-main').classList.add('with-side');
  S.body.querySelectorAll('[data-side]').forEach(x => x.classList.toggle('on', x.dataset.side === kind));
  const head = t => `<div class="sp-side-h"><b>${t}</b><button type="button" class="sp-ic" data-close aria-label="Close">×</button></div>`;
  if (kind === 'data') {
    const doc = S.doc, pid = doc.project_thread_id, pd = pid ? projectData(S, pid) : { data: { ...autoInfo(S, null), ...doc.data }, auto: autoInfo(S, null), saved: doc.data, p: null };
    const br = pid ? await brief(S, pid).catch(() => null) : null; const groups = [...new Set(D.PROJECT_FIELDS.map(f => f[2]))];
    el.innerHTML = head('Project data') + `<p class="sp-note">${pid ? `Shared by every document for <b>${esc(pd.p ? pd.p.project_name : 'this project')}</b>. Change it once and it changes everywhere.` : 'This document has no project, so these values belong to this document only. Pick a project at the top to share them.'}</p>
    ${pid ? `<div class="sp-facts"><span><b>${br ? br.sheets.length : '…'}</b> drawing sheets</span><span><b>${br ? br.reviews.reduce((a, r) => a + (Array.isArray(r.findings) ? r.findings.length : 0), 0) : '…'}</b> Check findings</span></div>` : ''}
    <button type="button" class="du-btn ghost" data-pull>Pull from DrawUp</button>
    <form class="sp-dform">${groups.map(g => `<fieldset><legend>${esc(g)}</legend>${D.PROJECT_FIELDS.filter(f => f[2] === g).map(([k, l, , hint]) => { const saved = pd.saved[k], auto = pd.auto[k]; return `<label class="${k === focusKey ? 'focus' : ''}"><span>${esc(l)}${saved == null || saved === '' ? (auto ? ' <i class="sp-auto">from DrawUp</i>' : '') : ''}</span>${k === 'project_description' ? `<textarea class="sp-in" data-k="${k}" rows="3" placeholder="${esc(auto || hint)}">${esc(saved || '')}</textarea>` : `<input class="sp-in" data-k="${k}" value="${esc(saved || '')}" placeholder="${esc(auto || hint)}">`}</label>`; }).join('')}</fieldset>`).join('')}</form><span class="sp-st" role="status"></span>`;
    const st = el.querySelector('.sp-st'); let tm = null;
    const persist = async vals => { st.textContent = 'Saving…';
      try { if (pid) { const row = { firm_id: S.firm.id, project_thread_id: pid, info: vals, updated_by: S.me, updated_at: new Date().toISOString() }; const cur = S.info[pid];
          const r = cur && cur.id ? await S.c.client.from('firm_project_info').update(row).eq('id', cur.id).select('*') : await S.c.client.from('firm_project_info').upsert(row, { onConflict: 'firm_id,project_thread_id' }).select('*'); if (r.error) throw r.error; S.info[pid] = (r.data && r.data[0]) || row; }
        else { const keep = {}; ['page', 'import', 'imports', 'marks'].forEach(k => { if (doc.data && doc.data[k] != null) keep[k] = doc.data[k]; }); doc.data = { ...vals, ...keep }; dirty(S); } // v30: page setup, import log and seals stay
        st.textContent = 'Saved.'; } catch (e) { st.textContent = 'Not saved: ' + (sqlMissing(e) ? 'run the DrawUp Specs SQL.' : (e.message || e)); } };
    const read = () => { const v = {}; el.querySelectorAll('[data-k]').forEach(i => { if (i.value.trim()) v[i.dataset.k] = i.value.trim(); }); return v; };
    el.querySelectorAll('[data-k]').forEach(i => i.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => { await persist(read()); refreshChips(S); }, 700); });
    el.querySelector('[data-pull]').onclick = async () => { el.querySelectorAll('[data-k]').forEach(i => { if (!i.value.trim() && pd.auto[i.dataset.k]) i.value = pd.auto[i.dataset.k]; }); await persist(read()); refreshChips(S); };
    if (focusKey) el.querySelector(`[data-k="${focusKey}"]`)?.focus();
  }
  if (kind === 'preview') {
    const doc = S.doc; const secOnly = doc.kind === 'spec' && S.prevScope === 'section';
    el.innerHTML = head('Preview &amp; export') + `${doc.kind === 'spec' ? `<div class="sp-seg"><button type="button" class="${secOnly ? '' : 'on'}" data-scope="all">Whole manual</button><button type="button" class="${secOnly ? 'on' : ''}" data-scope="section">This section</button></div>` : ''}
    <div class="sp-exp"><button type="button" class="du-btn primary" data-exp="pdf">Download PDF</button><button type="button" class="du-btn ghost" data-exp="docx">Download Word</button></div><p class="sp-note sp-fmtnote"></p><div class="sp-pv"><p class="sp-note">Laying out pages…</p></div>`;
    el.querySelectorAll('[data-scope]').forEach(x => x.onclick = () => { S.prevScope = x.dataset.scope; openSide(S, 'preview'); });
    const opts = secOnly ? { sectionId: S.secId } : {}; const row = formatRow(S, doc.format_id);
    el.querySelector('.sp-fmtnote').textContent = formatName(S, doc.format_id) + (row && row.template_file_id ? ' · Word export uses the uploaded Word template' : '') + '. Open items print in [brackets] so they are easy to find.';
    el.querySelectorAll('[data-exp]').forEach(x => x.onclick = async () => { x.disabled = true; const k = x.dataset.exp; const old = x.textContent; x.textContent = 'Building…';
      try { await flush(S); const { settings, files } = await formatFiles(S, row, doc); const ctx = ctxFor(S, doc); const name = slug(doc.title) + (secOnly ? '-' + slug(doc.sections.find(s => s.id === S.secId)?.number) : '');
        if (k === 'pdf') { const r = await X.pdf(doc, ctx, settings, files, opts); download(r.bytes, name + '.pdf', 'application/pdf'); }
        else { const b = await X.docx(doc, ctx, settings, files, opts); download(b, name + '.docx', DOCX_MIME); }
        if (ctx.warnings && ctx.warnings.length) toast(S, ctx.warnings.join(' '), true); }
      catch (e) { toast(S, 'Export failed: ' + (e.message || e), true); } x.disabled = false; x.textContent = old; });
    try { const { settings, files } = await formatFiles(S, row, doc); const ctx = ctxFor(S, doc); const r = await X.pdf(doc, ctx, settings, files, opts); if (S.side !== 'preview') return; await renderPdf(el.querySelector('.sp-pv'), r.bytes, 30); }
    catch (e) { el.querySelector('.sp-pv').innerHTML = `<p class="sp-bad">The preview could not be made: ${esc(e.message || e)}</p>`; }
  }
}
function refreshChips(S) { const ctx = ctxFor(S, S.doc); S.body.querySelectorAll('.sp-chip.data').forEach(ch => { const v = ctx.data[ch.dataset.key]; const has = v != null && String(v).trim() !== ''; ch.textContent = has ? v : (LABELS[ch.dataset.key] || ch.dataset.key); ch.classList.toggle('missing', !has); }); if (S.doc.kind === 'letter') { /* letterhead and counts */ } }
async function renderPdf(box, bytes, max) {
  const L = await X.pdfjs(); const d = await L.getDocument({ data: bytes.slice() }).promise; box.innerHTML = '';
  const w = Math.max(240, Math.min(820, box.clientWidth || 520));
  for (let i = 1; i <= Math.min(d.numPages, max); i++) { const pg = await d.getPage(i); const v0 = pg.getViewport({ scale: 1 }); const v = pg.getViewport({ scale: w / v0.width * Math.min(2, window.devicePixelRatio || 1) }); const cv = document.createElement('canvas'); cv.width = Math.round(v.width); cv.height = Math.round(v.height); cv.className = 'sp-pg'; cv.setAttribute('aria-label', 'Page ' + i); box.appendChild(cv); await pg.render({ canvasContext: cv.getContext('2d'), viewport: v }).promise; }
  if (d.numPages > max) box.insertAdjacentHTML('beforeend', `<p class="sp-note">Showing ${max} of ${d.numPages} pages. The download has them all.</p>`);
}

/* ------------------------------------------------------------------ project map */
function renderMap(S, v) {
  const F = S.mapF, US = window.DRAWUP_US_STATES || {};
  const rows = S.projects.map(p => ({ id: p.id, kind: 'drawup', name: p.project_name, state: stateOf(p.location), loc: p.location || '', type: p.project_type || '', phase: p.project_phase || '', updated: p.updated_at, mine: !!p.mine, firm: p.firm_id === S.firm.id, docs: S.docs.filter(d => d.project_thread_id === p.id).length, p }))
    .concat(S.portfolio.map(a => ({ id: a.id, kind: 'portfolio', name: a.name, state: (a.state || '').toUpperCase().slice(0, 2), loc: [a.city, a.state].filter(Boolean).join(', '), type: a.project_type || '', phase: a.status === 'completed' ? 'Completed' + (a.completion_year ? ' ' + a.completion_year : '') : (a.status || ''), updated: null, docs: 0, a })));
  const types = [...new Set(rows.map(r => r.type).filter(Boolean))].sort(), phases = [...new Set(rows.map(r => r.phase).filter(Boolean))].sort();
  const pass = r => (!F.state || r.state === F.state) && (!F.type || r.type === F.type) && (!F.phase || r.phase === F.phase) && (!F.docs || r.docs) && (!F.mine || r.mine) && (F.src === 'all' || r.kind === F.src);
  const shown = rows.filter(pass); const counts = {}; rows.filter(r => (!F.type || r.type === F.type) && (!F.phase || r.phase === F.phase) && (!F.docs || r.docs) && (!F.mine || r.mine) && (F.src === 'all' || r.kind === F.src)).forEach(r => { if (r.state) counts[r.state] = (counts[r.state] || 0) + 1; });
  const max = Math.max(1, ...Object.values(counts)); const fillFor = n => { if (!n) return '#e5ebf2'; const t = n / max; return t > 0.66 ? '#0f3b6e' : t > 0.33 ? '#2f6fb3' : '#7fb2e5'; };
  const sel = (k, opts, label) => `<label><span>${label}</span><select class="sp-in" data-mf="${k}"><option value="">Any</option>${opts.map(o => `<option ${F[k] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  v.innerHTML = `<div class="sp-map">
   <aside class="sp-mapf"><label><span>State</span><select class="sp-in" data-mf="state"><option value="">Any</option>${Object.keys(US).sort().map(a => `<option value="${a}" ${F.state === a ? 'selected' : ''}>${esc(US[a].n)}</option>`).join('')}</select></label>${sel('type', types, 'Building type')}${sel('phase', phases, 'Phase')}
     <label><span>Source</span><select class="sp-in" data-mf="src"><option value="all">DrawUp and portfolio</option><option value="drawup" ${F.src === 'drawup' ? 'selected' : ''}>DrawUp projects</option><option value="portfolio" ${F.src === 'portfolio' ? 'selected' : ''}>Public portfolio</option></select></label>
     <label class="sp-chk"><input type="checkbox" data-mf="docs" ${F.docs ? 'checked' : ''}> Has documents</label><label class="sp-chk"><input type="checkbox" data-mf="mine" ${F.mine ? 'checked' : ''}> My projects only</label>
     <button type="button" class="du-btn ghost" data-mclear>Clear</button></aside>
   <div class="sp-maplist" aria-label="Projects">${shown.length ? shown.map(r => `<article class="sp-mcard ${S.mapSel === r.id ? 'on' : ''}"><small>${r.updated ? 'Last updated: ' + esc(day(r.updated)) : r.kind === 'portfolio' ? 'Public portfolio' : ''}</small><b>${esc(r.name)}</b><span>State: ${esc(r.state || 'Not set')}${r.loc ? ' · ' + esc(r.loc) : ''}</span><span>Building type: ${esc(r.type || 'Not set')}</span><span>Phase: ${esc(r.phase || 'Not set')}</span>${r.kind === 'drawup' ? `<span>Documents: ${r.docs}</span>` : ''}<button type="button" class="sp-link" data-mopen="${r.id}">More details</button></article>`).join('') : '<p class="sp-note">No projects match. Projects come from DrawUp Projects shared with the firm, your own projects, and the firm\'s public portfolio.</p>'}</div>
   <div class="sp-mapsvg"><svg viewBox="0 0 975 610" role="img" aria-label="Projects by state">${Object.entries(US).map(([a, s]) => `<path d="${s.d}" fill="${fillFor(counts[a])}" stroke="#fff" stroke-width="1" data-st="${a}" class="${F.state === a ? 'on' : ''}"><title>${esc(s.n)}: ${counts[a] || 0} project${counts[a] === 1 ? '' : 's'}</title></path>`).join('')}${Object.entries(counts).filter(([a]) => US[a]).map(([a, n]) => `<text x="${US[a].c[0]}" y="${US[a].c[1] + 5}" text-anchor="middle" class="${n / max > 0.33 ? 'lt' : ''}">${n}</text>`).join('')}</svg>
     <div class="sp-legend"><i style="background:#7fb2e5"></i>Fewer<i style="background:#2f6fb3"></i><i style="background:#0f3b6e"></i>More projects · Click a state to filter</div></div>
  </div>
  <div class="sp-mapcards"><article class="du-glass"><span class="du-kicker">FIRM CONTACTS</span>${S.members.filter(m => S.roles[m.id] === 'admin').slice(0, 4).map(m => `<p><b>${esc(m.name)}</b><br><small>${esc(m.title || 'Firm admin')}</small></p>`).join('') || '<p class="du-muted">No firm admins listed.</p>'}</article>
   <article class="du-glass"><span class="du-kicker">RECENT DOCUMENTS</span>${S.docs.slice(0, 4).map(d => `<p><button type="button" class="sp-link" data-dopen="${d.id}">${esc(d.title)}</button><br><small>${esc((TYPE[d.doc_type] || {}).label || '')} · ${esc(day(d.updated_at))}</small></p>`).join('') || '<p class="du-muted">No documents yet.</p>'}</article>
   <article class="du-glass"><span class="du-kicker">FORMATS</span><p><b>DrawUp standard</b><br><small>Built in</small></p>${S.formats.slice(0, 3).map(f => `<p><b>${esc(f.kind === 'firm' ? 'Firm standard: ' + f.name : 'Client: ' + (f.client_name || f.name))}</b><br><small>${f.template_file_id ? 'Word template' : 'Settings'}${f.settings && f.settings.background ? ' · PDF letterhead' : ''}</small></p>`).join('')}</article></div>`;
  v.querySelectorAll('[data-mf]').forEach(x => x.onchange = () => { const k = x.dataset.mf; F[k] = x.type === 'checkbox' ? x.checked : x.value; renderMap(S, v); });
  v.querySelector('[data-mclear]').onclick = () => { S.mapF = { state: '', type: '', phase: '', docs: false, mine: false, src: 'all' }; renderMap(S, v); };
  v.querySelectorAll('[data-st]').forEach(x => x.onclick = () => { F.state = F.state === x.dataset.st ? '' : x.dataset.st; renderMap(S, v); });
  v.querySelectorAll('[data-mopen]').forEach(x => x.onclick = () => { S.mapSel = x.dataset.mopen; projectModal(S, rows.find(r => r.id === x.dataset.mopen)); });
  v.querySelectorAll('[data-dopen]').forEach(x => x.onclick = () => openEditor(S, S.docs.find(d => d.id === x.dataset.dopen)));
}
async function projectModal(S, r) {
  if (!r) return;
  if (r.kind === 'portfolio') { const a = r.a; const m = modal(r.name, 'PUBLIC PORTFOLIO', `<dl class="sp-dl"><dt>Location</dt><dd>${esc(r.loc || 'Not set')}</dd><dt>Building type</dt><dd>${esc(r.type || 'Not set')}</dd><dt>Status</dt><dd>${esc(r.phase || 'Not set')}</dd>${a.size_sqft ? `<dt>Size</dt><dd>${Number(a.size_sqft).toLocaleString()} sf</dd>` : ''}</dl><p class="sp-note">This is a finished project from the public firm portfolio. To write specs or CA documents for a project, start it in DrawUp Projects and share it with the firm.</p>${a.slug ? '<button type="button" class="du-btn ghost" data-pp>Open the project page</button>' : ''}`); m.querySelector('[data-pp]')?.addEventListener('click', () => { m.remove(); window.DrawUpPortal?.openProject?.(a.slug); }); return; }
  const p = r.p, pd = projectData(S, p.id), br = await brief(S, p.id).catch(() => null), docs = S.docs.filter(d => d.project_thread_id === p.id);
  const keys = ['project_number', 'project_address', 'building_type', 'phase', 'owner_name', 'contractor_name', 'gross_area', 'construction_type', 'occupancy', 'code_edition'];
  const m = modal(p.project_name, 'PROJECT', `<p class="du-muted">${esc(p.description || '')}</p><dl class="sp-dl">${keys.map(k => `<dt>${esc(LABELS[k])}</dt><dd>${esc(pd.data[k] || 'Not set')}</dd>`).join('')}<dt>Drawing sheets</dt><dd>${br ? br.sheets.length : 0}</dd><dt>Check findings</dt><dd>${br ? br.reviews.reduce((a, x) => a + (Array.isArray(x.findings) ? x.findings.length : 0), 0) : 0}</dd><dt>Owner on DrawUp</dt><dd>${esc(p.owner_name || (p.mine ? 'You' : ''))}${p.firm_id === S.firm.id ? ' · shared with the firm' : ' · not shared with the firm yet'}</dd></dl>
  <h4>Documents</h4>${docs.length ? docs.map(d => `<p><button type="button" class="sp-link" data-dopen="${d.id}">${esc(d.title)}</button> <small>${esc((TYPE[d.doc_type] || {}).label)} · ${esc(STATUS_LABEL[d.status] || d.status)}</small></p>`).join('') : '<p class="du-muted">No documents yet.</p>'}
  <div class="sp-savebar"><button type="button" class="du-btn primary" data-pnew>New document for this project</button>${p.mine && p.firm_id !== S.firm.id ? '<button type="button" class="du-btn ghost" data-pshare>Share with the firm</button>' : ''}${p.mine ? '<button type="button" class="du-btn ghost" data-popen>Open in Projects</button>' : ''}<span class="sp-st" role="status"></span></div>`, true);
  m.querySelectorAll('[data-dopen]').forEach(x => x.onclick = () => { m.remove(); openEditor(S, S.docs.find(d => d.id === x.dataset.dopen)); });
  m.querySelector('[data-pnew]').onclick = () => { m.remove(); newDocModal(S, { project: p.id }); };
  m.querySelector('[data-pshare]')?.addEventListener('click', async () => { const st = m.querySelector('.sp-st'); if (!confirm('Share “' + p.project_name + '” with ' + S.firm.name + '? Firm members can then write its documents and firm admins can open the project.')) return; const r2 = await S.c.client.from('project_threads').update({ firm_id: S.firm.id }).eq('id', p.id).eq('owner_id', S.me).select('id'); if (r2.error || !r2.data?.length) { st.textContent = 'Not shared: ' + (r2.error?.message || 'only the owner can share it.'); return; } p.firm_id = S.firm.id; st.textContent = 'Shared with the firm.'; });
  m.querySelector('[data-popen]')?.addEventListener('click', () => { m.remove(); window.DrawUpPortal?.openPortalTab?.('projects'); });
}

/* ------------------------------------------------------------------ formats */
const SAMPLE_SPEC = () => ({ kind: 'spec', title: 'Project Manual', sections: [makeSection('07 42 13.13')] });
const SAMPLE_LETTER = () => { const t = TYPE.rfi; return { kind: 'letter', title: 'RFI response', heading: t.label, doc_number: 'RFI-014', fields: JSON.parse(JSON.stringify(t.fields)), blocks: JSON.parse(JSON.stringify(t.blocks)) }; };
function renderFormats(S, v) {
  const firmF = S.formats.filter(f => f.kind === 'firm'), clientF = S.formats.filter(f => f.kind === 'client');
  const card = (f) => `<button type="button" class="sp-fcard" data-fopen="${f.id}"><b>${esc(f.kind === 'client' ? (f.client_name || f.name) : f.name)}</b><small>${f.kind === 'client' ? esc(f.name) + (f.project_thread_id ? ' · ' + esc(project(S, f.project_thread_id)?.project_name || 'project') : '') : (f.is_default ? 'Firm default' : 'Firm standard')}</small><span>${[f.template_file_id ? 'Word template' : '', f.settings && f.settings.background ? 'PDF letterhead' : '', (f.reference_file_ids || []).length ? (f.reference_file_ids.length + ' reference file' + (f.reference_file_ids.length === 1 ? '' : 's')) : ''].filter(Boolean).map(x => `<i>${x}</i>`).join('') || '<i>Settings only</i>'}</span></button>`;
  v.innerHTML = `<div class="sp-fcols">
  <article class="du-glass sp-fcol"><span class="du-kicker">1 · DRAWUP STANDARD</span><h3>DrawUp standard</h3><p class="du-muted">Built in, and used until your firm saves its own standard. Owner, project and project numbers in a block at the top, SECTION 01 1000 and the title centered, PART 1 - GENERAL, 1.01 articles, A. 1. a. paragraphs, and the section title with "01 1000 - Page 1 of 4" in the footer. Changing a document's format changes its layout only, never its text.</p><button type="button" class="sp-fcard" data-fopen="drawup"><b>DrawUp standard</b><small>Default until a firm standard is saved</small><span><i>Arial 9 pt</i><i>Letter</i></span></button></article>
  <article class="du-glass sp-fcol"><span class="du-kicker">2 · FIRM STANDARD</span><h3>Firm standard format</h3><p class="du-muted">Your firm's own fonts, margins, header and footer, numbering and letterhead. Upload your Word template or letterhead PDF and DrawUp uses it.${S.admin ? '' : ' Only firm admins can change it.'}</p>${firmF.map(card).join('') || '<p class="sp-note">Not set up yet.</p>'}${S.admin ? `<button type="button" class="du-btn ${firmF.length ? 'ghost' : 'primary'}" data-fnew="firm">${firmF.length ? 'Add another firm format' : 'Set up the firm standard'}</button>` : ''}</article>
  <article class="du-glass sp-fcol"><span class="du-kicker">3 · CLIENT FORMATS</span><h3>Client formats</h3><p class="du-muted">When a client has their own requirements, upload their preferred format (Word template, PDF letterhead or their spec guidelines) and link it to their projects. Any firm member can add one.</p>${clientF.map(card).join('') || '<p class="sp-note">None yet.</p>'}<button type="button" class="du-btn primary" data-fnew="client">Add a client format</button></article></div>`;
  v.querySelectorAll('[data-fopen]').forEach(x => x.onclick = () => formatEditor(S, v, x.dataset.fopen === 'drawup' ? 'drawup' : S.formats.find(f => f.id === x.dataset.fopen)));
  v.querySelectorAll('[data-fnew]').forEach(x => x.onclick = () => formatEditor(S, v, { kind: x.dataset.fnew, name: x.dataset.fnew === 'firm' ? S.firm.name + ' standard' : 'Client format', settings: {}, is_default: x.dataset.fnew === 'firm' && !firmF.length, reference_file_ids: [] }));
}
/* ------------------------------------------------------------------ v31: the full spec book on a format's page
   Opening a format shows the whole compiled spec book from its first page (cover, contents, then every section in
   number order), in that format. Two views: Print preview (the real PDF pages) and Edit sheet (the same book as a
   typed-on sheet: words and titles change, the layout stays the format's). Branding: the member's firm or DrawUp.
   The book is the firm's own project manual when there is one, or the DrawUp starter book (DrawUp-written text). */
const BOOK_KEY = 'du-specs-book-v31';
const bookPrefs = () => { try { return JSON.parse(localStorage.getItem(BOOK_KEY) || '{}') || {}; } catch (_e) { return {}; } };
const setBookPref = (k, val) => { try { const o = bookPrefs(); o[k] = val; localStorage.setItem(BOOK_KEY, JSON.stringify(o)); } catch (_e) { /* private mode */ } };
function starterNumbers() { const n = new Set(Object.keys(D.MASTER)); D.CATALOG.forEach(([x]) => { if (/^01 /.test(x)) n.add(x); }); return [...n].sort(); }
function starterBook(fresh) {
  let saved = null; if (!fresh) { try { saved = JSON.parse(localStorage.getItem(BOOK_KEY + ':starter') || 'null'); } catch (_e) { saved = null; } }
  if (saved && Array.isArray(saved.sections) && saved.sections.length) return { id: null, starter: true, kind: 'spec', title: saved.title || 'Project Manual', sections: saved.sections, data: {} };
  return { id: null, starter: true, kind: 'spec', title: 'Project Manual', sections: starterNumbers().map(n => makeSection(n)), data: {} };
}
const bookDocs = S => S.docs.filter(d => d.kind === 'spec' && (d.sections || []).length);
/** The firm whose name and logo go on the book: the firm workspace, else the member's own firm, else the architect saved on the project. */
async function brandFirm(S) {
  if (S.brandFirm !== undefined) return S.brandFirm;
  let f = null;
  if (!isPersonal(S) && S.firm && S.firm.name) f = { name: S.firm.name, logo_url: S.firm.logo_url || null };
  else {
    try { const r = await S.c.client.rpc('drawup_my_firms'); const row = Array.isArray(r.data) ? r.data[0] : null;
      if (row && row.name) { f = { id: row.id, name: row.name, logo_url: row.logo_url || null };
        if (!f.logo_url && row.id) { const l = await S.c.client.from('firms').select('logo_url').eq('id', row.id).maybeSingle(); f.logo_url = (l.data && l.data.logo_url) || null; } } } catch (_e) { /* no firm */ }
  }
  if (!f) { const pid = S.projects[0]?.id; const an = pid ? String(projectData(S, pid).saved.architect_name || '').trim() : ''; if (an) f = { name: an, logo_url: null }; }
  S.brandFirm = f; return f;
}
function bookCtx(S, doc, brand, firm) {
  const ctx = ctxFor(S, { ...doc, project_thread_id: doc.project_thread_id || S.projects[0]?.id || null, data: doc.data || {} });
  const useFirm = brand === 'firm' && firm; const name = useFirm ? firm.name : 'DrawUp';
  ctx.data = { ...ctx.data, firm_name: name, architect_name: name };
  if (!useFirm) ctx.data.architect_address = 'Prepared with DrawUp';
  return ctx;
}
async function brandLogo(S, brand, firm) {
  const url = brand === 'firm' ? (firm && firm.logo_url) : '/icons/drawup-icon-512.png'; if (!url) return null;
  S.logoCache = S.logoCache || {}; if (S.logoCache[url] !== undefined) return S.logoCache[url];
  let out = null;
  try { const r = await fetch(url); if (r.ok) { const b = await r.blob(); if (/png|jpe?g/.test(b.type)) { out = { logo: new Uint8Array(await b.arrayBuffer()), logoType: b.type.includes('png') ? 'image/png' : 'image/jpeg' }; try { const im = await createImageBitmap(b); out.logoW = im.width; out.logoH = im.height; } catch (_e) { /* size unknown */ } } } } catch (_e) { /* logo is optional */ }
  S.logoCache[url] = out; return out;
}
/** Settings + files for the book in this branding: the format's own uploaded logo stays; "firm logo" follows the branding. */
async function brandFiles(S, settings, files, brand, firm) {
  if (settings.letterhead.logo !== 'firm') return files;
  const out = { ...files }; delete out.logo; delete out.logoType; delete out.logoW; delete out.logoH;
  const l = await brandLogo(S, brand, firm); return l ? { ...out, ...l } : out;
}
// All pages of a PDF, drawn when they scroll into view, from the first page.
async function renderBookPdf(box, bytes) {
  const L = await X.pdfjs(); const d = await L.getDocument({ data: bytes.slice() }).promise;
  const p1 = await d.getPage(1); const v1 = p1.getViewport({ scale: 1 }); const w = Math.max(240, Math.min(820, (box.clientWidth || 560) - 24));
  box.innerHTML = ''; box.scrollTop = 0;
  const io = new IntersectionObserver(es => es.forEach(async e => {
    if (!e.isIntersecting) return; const el = e.target; io.unobserve(el);
    try { const pg = await d.getPage(+el.dataset.n); const v0 = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: w / v0.width * Math.min(2, window.devicePixelRatio || 1) });
      const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height); cv.className = 'sp-pg'; el.replaceChildren(cv); await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; } catch (_e) { /* page skipped */ }
  }), { root: box, rootMargin: '900px 0px' });
  for (let i = 1; i <= d.numPages; i++) { const s = document.createElement('div'); s.className = 'sp-pgslot'; s.dataset.n = i; s.style.width = w + 'px'; s.style.aspectRatio = v1.width + ' / ' + v1.height; s.setAttribute('aria-label', 'Page ' + i + ' of ' + d.numPages); box.appendChild(s); io.observe(s); }
  return d.numPages;
}
// ---- the edit sheet: the same book as HTML in the format's type, indents and numbering; text is typed on directly
const CSS_FONT = { Helvetica: 'Arial, Helvetica, sans-serif', Times: '"Times New Roman", Times, serif', Courier: '"Courier New", Courier, monospace' };
const PART_T = { 1: 'GENERAL', 2: 'PRODUCTS', 3: 'EXECUTION' };
const shownNum = (n, fmt) => { const s = String(n || ''); return fmt.number_style === 'compact' ? s.replace(/^(\d{2}) (\d{2}) (\d{2})/, '$1 $2$3') : s; };
/** Text with project data, blanks and choices as chips that keep their codes, so typing around them never loses them. */
function richText(raw, ctx) {
  const D0 = (ctx && ctx.data) || {};
  return X.tokens(raw).map(k => { if (k.t === 'txt') return esc(k.v); const code = X.untokens([k]);
    const open = (k.t === 'blank' && !(k.value != null && k.value !== '')) || (k.t === 'opt' && k.sel < 0) || (k.t === 'data' && !(D0[k.key] != null && String(D0[k.key]).trim()));
    return `<span class="sp-tok${open ? ' open' : ''}" contenteditable="false" data-tok="${esc(encodeURIComponent(code))}" title="${esc(k.t === 'data' ? 'Project data: ' + k.key.replace(/_/g, ' ') : k.t === 'blank' ? 'Blank: ' + k.label : 'Choice: ' + k.opts.join(' / '))}">${esc(X.resolve(code, ctx))}</span>`; }).join('');
}
function readRich(el) { let s = ''; el.childNodes.forEach(n => { if (n.nodeType === 3) s += n.nodeValue; else if (n.dataset && n.dataset.tok) s += decodeURIComponent(n.dataset.tok); else if (n.nodeName === 'BR') s += '\n'; else if (n.nodeType === 1) s += (n.nodeName === 'DIV' && s ? '\n' : '') + readRich(n); }); return s.replace(/ /g, ' '); }
function sheetHTML(doc, ctx, fmt, pm) {
  const R = t => X.resolve(t, ctx), IND = fmt.indent, [pw] = X.pageSize(fmt), M = fmt.margins, ed = (key, raw, cls) => `<span class="sp-ed ${cls || ''}" contenteditable="true" spellcheck="true" data-e="${key}">${richText(raw, ctx)}</span>`;
  const pad = `padding:${M.t}in ${M.r}in ${M.b}in ${M.l}in;width:${pw}in`;
  const head = () => { const lines = String(fmt.header.block || '').split('\n').filter(x => x.trim()); const body = lines.length ? lines.map(l => { const [a, b] = l.split('\t'); return `<div class="sp-sh-hl"><span>${esc(R(a))}</span><span>${esc(R(b || ''))}</span></div>`; }).join('') : `<div class="sp-sh-hl lr"><span>${esc(R(fmt.header.left))}</span><span>${esc(R(fmt.header.right))}</span></div>`; return `<div class="sp-sh-head${fmt.header.rule ? ' rule' : ''}${fmt.header.bold ? ' b' : ''}">${body}</div>`; };
  const foot = sec => { const rg = pm && pm.ranges && pm.ranges[sec.number + '|' + sec.title], one = rg ? (rg[0] === rg[1] ? String(rg[0]) : rg[0] + '–' + rg[1]) : '#'; const f = c => esc(R(X.fill(c, { section_number: sec.number, section_title: sec.title, page_total: one, page: rg ? (rg[1] > rg[0] ? '1–' + (rg[1] - rg[0] + 1) : '1') : '#', pages: pm ? String(pm.pages) : '#', section_pages: rg ? String(rg[1] - rg[0] + 1) : '#' }))); return `<div class="sp-sh-foot${fmt.footer.rule ? ' rule' : ''}${fmt.footer.bold ? ' b' : ''}"><span>${f(fmt.footer.left)}</span><span>${f(fmt.footer.center)}</span><span>${f(fmt.footer.right)}</span></div>`; };
  const secs = (doc.sections || []).map((s, si) => ({ s, si })).filter(x => x.s.state !== 'excluded').sort((a, b) => String(a.s.number).localeCompare(String(b.s.number)));
  const out = [];
  if (fmt.cover) out.push(`<div class="sp-sheet cover" style="${pad}"><div class="sp-sh-cover"><h2 style="color:${esc(fmt.accent)}">${ed('d', doc.title || 'Project Manual')}</h2>${[R('<<project_name>>'), R('<<project_address>>'), '', 'Project no. ' + R('<<project_number>>'), R('<<issue_purpose>>'), R('<<issue_date>>'), '', R('<<architect_name>>'), R('<<architect_address>>')].map(l => l ? `<p>${esc(l)}</p>` : '<br>').join('')}</div></div>`);
  if (fmt.toc) { let div = ''; out.push(`<div class="sp-sheet" style="${pad}">${head()}<h4 class="sp-sh-t">TABLE OF CONTENTS</h4>${secs.map(({ s }) => { const d = String(s.number).slice(0, 2); const dh = d !== div ? (div = d, `<p class="sp-sh-div">DIVISION ${esc(d)} - ${esc((D.DIVISIONS[d] || '').toUpperCase())}</p>`) : ''; return dh + `<p class="sp-sh-toc" style="--ti:${IND * 2.4}in"><span>${esc(shownNum(s.number, fmt))}</span><span>${esc(R(s.title).toUpperCase())}</span></p>`; }).join('')}${foot({ number: '00 01 10', title: 'TABLE OF CONTENTS' })}</div>`); }
  secs.forEach(({ s, si }) => {
    const sec = { number: shownNum(s.number, fmt), title: R(s.title).toUpperCase() }; const h = [];
    const lead = (((s.parts || {})[1] || [])[0] || {}).lead ? s.parts[1][0] : null;
    if (lead && !lead.off) lead.paras.forEach((p, pi) => { if (!p.off) h.push(`<p class="sp-sh-p" style="padding-left:0">${ed(`p:${si}:1:0:${pi}`, p.t)}</p>`); });
    String(fmt.section_title || '').split('\n').forEach(line => { h.push(`<h4 class="sp-sh-t">${esc(line).replace('{number}', esc(sec.number)).replace('{title}', ed(`s:${si}`, s.title, 'up'))}</h4>`); });
    [1, 2, 3].forEach(n => {
      const part = (s.parts || {})[n] || [];
      if (doc.outline && n !== 2 && !part.length) return; if (s.front && !part.filter(a => !a.lead).length) return;
      if (!s.front) h.push(`<p class="sp-sh-part">${esc(X.fill(fmt.part_style, { n, title: (s.part_titles && s.part_titles[n]) || PART_T[n] }))}</p>`);
      let ai = 0;
      part.forEach((a, aIdx) => { if (a.off || a.lead) return;
        const titled = !a.untitled || String(a.title || '').trim(); if (titled) ai++;
        const num = n + '.' + (String(fmt.article_style) === '01' ? String(Math.max(ai, 1)).padStart(2, '0') : Math.max(ai, 1));
        if (titled) h.push(`<p class="sp-sh-a" style="padding-left:${IND}in"><b class="sp-sh-l" style="left:0">${esc(num)}</b>${ed(`a:${si}:${n}:${aIdx}`, a.title, fmt.caps_articles ? 'up b' : 'b')}</p>`);
        const live = (a.paras || []).map((p, pi) => ({ p, pi })).filter(x => !x.p.off); const labs = X.paraLabels(live.map(x => x.p), fmt.numbering, num);
        live.forEach(({ p, pi }, k) => { const lv = Math.min(3, p.lvl | 0); h.push(`<p class="sp-sh-p" style="padding-left:${IND * (lv + 2)}in"><span class="sp-sh-l" style="left:${IND * (lv + 1)}in">${esc(labs[k] || '')}</span>${ed(`p:${si}:${n}:${aIdx}:${pi}`, p.t)}</p>`); });
      });
    });
    if (!s.front) h.push(`<p class="sp-sh-end">${esc(X.fill(fmt.end_text, { number: sec.number, title: sec.title }))}</p>`);
    out.push(`<div class="sp-sheet" data-sec="${esc(s.id)}" style="${pad}">${head()}${h.join('')}${foot(sec)}</div>`);
  });
  return `<div class="sp-sheets" style="font-family:${CSS_FONT[fmt.font] || CSS_FONT.Helvetica};font-size:${fmt.size}pt;line-height:${fmt.line}">${out.join('')}</div>`;
}
function applyEdit(doc, key, text) {
  const [k, ...ix] = key.split(':'); const n = ix.map(Number);
  if (k === 'd') { doc.title = text; return; }
  const s = doc.sections[n[0]]; if (!s) return;
  if (k === 's') { s.title = text; return; }
  const a = ((s.parts || {})[n[1]] || [])[n[2]]; if (!a) return;
  if (k === 'a') { a.title = text; return; }
  const p = (a.paras || [])[n[3]]; if (p) p.t = text;
}
/** The book panel inside a format's page. get() returns { settings, files } for the format as it is on screen. */
function bookPanel(S, box, bar, get) {
  const P = bookPrefs(); const B = { mode: P.mode === 'edit' ? 'edit' : 'print', brand: P.brand === 'drawup' ? 'drawup' : 'firm', doc: null, firm: null, stale: true, timer: null, seq: 0 };
  const docs = bookDocs(S); const pick = P.src && docs.find(d => d.id === P.src);
  B.doc = P.src === 'starter' ? starterBook() : pick || (docs.slice().sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0]) || starterBook();
  const st = t => { const el = bar.querySelector('.sp-bk-st'); if (el) el.textContent = t; };
  const paintBar = () => {
    const firmName = B.firm ? B.firm.name : '';
    bar.innerHTML = `<div class="sp-bk-row"><label class="sp-mini"><span>Spec book</span><select class="sp-in" data-bk="src">${docs.map(d => `<option value="${d.id}" ${B.doc.id === d.id ? 'selected' : ''}>${esc(d.title)} · ${d.sections.length} section${d.sections.length === 1 ? '' : 's'}</option>`).join('')}<option value="starter" ${B.doc.starter ? 'selected' : ''}>DrawUp starter book · ${B.doc.starter ? B.doc.sections.length : starterNumbers().length} sections</option></select></label>
      <div class="sp-seg" role="tablist" aria-label="Branding"><span>Branding</span>${firmName ? `<button type="button" role="tab" data-bk-brand="firm" class="${B.brand === 'firm' ? 'active' : ''}" aria-selected="${B.brand === 'firm'}">${esc(firmName)}</button>` : ''}<button type="button" role="tab" data-bk-brand="drawup" class="${B.brand === 'drawup' || !firmName ? 'active' : ''}" aria-selected="${B.brand === 'drawup' || !firmName}">DrawUp</button></div></div>
     <div class="sp-bk-row"><div class="sp-seg" role="tablist" aria-label="View"><button type="button" role="tab" data-bk-mode="print" class="${B.mode === 'print' ? 'active' : ''}" aria-selected="${B.mode === 'print'}">Print preview</button><button type="button" role="tab" data-bk-mode="edit" class="${B.mode === 'edit' ? 'active' : ''}" aria-selected="${B.mode === 'edit'}">Edit sheet</button></div>
      <span class="sp-bk-st" role="status"></span><span class="sp-bk-act">${B.doc.starter ? '<button type="button" class="du-btn ghost" data-bk-act="savedoc">Save as a document</button><button type="button" class="sp-link" data-bk-act="reset">Reset starter text</button>' : ''}<button type="button" class="du-btn ghost" data-bk-act="pdf">Download PDF</button><button type="button" class="du-btn ghost" data-bk-act="print">Print</button></span></div>
     <p class="sp-note sp-bk-note">${B.mode === 'edit' ? 'Click any word or title and type. The layout, numbering and indents stay in this format. Shaded words are project data, blanks and choices; type around them.' : B.doc.starter ? 'DrawUp-written starter text, ready to edit. Pick your own project manual above to see it in this format.' : 'Your project manual, compiled in this format from the first page.'}</p>`;
    bar.querySelector('[data-bk="src"]').onchange = async e => { await flushBook(); const id = e.target.value; setBookPref('src', id); B.doc = id === 'starter' ? starterBook() : docs.find(d => d.id === id) || starterBook(); B.stale = true; paintBar(); show(); };
    bar.querySelectorAll('[data-bk-brand]').forEach(x => x.onclick = () => { B.brand = x.dataset.bkBrand; setBookPref('brand', B.brand); B.stale = true; paintBar(); show(); });
    bar.querySelectorAll('[data-bk-mode]').forEach(x => x.onclick = async () => { B.mode = x.dataset.bkMode; setBookPref('mode', B.mode); await flushBook(); paintBar(); show(); });
    bar.querySelectorAll('[data-bk-act]').forEach(x => x.onclick = () => act(x.dataset.bkAct));
  };
  const brand = () => (B.brand === 'firm' && B.firm ? 'firm' : 'drawup');
  const build = async () => { const { settings, files } = await get(); const f2 = await brandFiles(S, settings, files, brand(), B.firm); const ctx = bookCtx(S, B.doc, brand(), B.firm); return { settings, files: f2, ctx }; };
  const show = async () => {
    const my = ++B.seq; box.classList.add('sp-bookbox'); box.classList.toggle('editing', B.mode === 'edit');
    if (B.mode === 'edit') { const { settings, files, ctx } = await build(); if (my !== B.seq) return; box.innerHTML = sheetHTML(B.doc, ctx, settings, B.pm); fit(); box.scrollTop = 0; paginate(settings, files, ctx, my); return; }
    box.innerHTML = '<p class="sp-note">Laying out the whole book…</p>';
    try { const { settings, files, ctx } = await build(); const r = await X.pdf(B.doc, ctx, settings, files, {}); if (my !== B.seq) return; B.bytes = r.bytes; B.pm = { pages: r.pages, ranges: r.ranges }; B.stale = false; const n = await renderBookPdf(box, r.bytes); if (my === B.seq) st(n + ' pages'); }
    catch (e) { if (my === B.seq) box.innerHTML = `<p class="sp-bad">${esc(e.message || e)}</p>`; }
  };
  const paginate = async (settings, files, ctx, my) => { try { const r = await X.pdf(B.doc, ctx, settings, files, {}); if (my !== B.seq) return; B.bytes = r.bytes; B.pm = { pages: r.pages, ranges: r.ranges }; B.stale = false; const fresh = document.createElement('div'); fresh.innerHTML = sheetHTML(B.doc, ctx, settings, B.pm); const nf = fresh.querySelectorAll('.sp-sh-foot'), of = box.querySelectorAll('.sp-sh-foot'); if (nf.length === of.length) of.forEach((el, i) => { el.innerHTML = nf[i].innerHTML; }); } catch (_e) { /* footers keep # */ } };
  const fit = () => { const sh = box.querySelector('.sp-sheets'); if (!sh) return; const first = sh.querySelector('.sp-sheet'); const w = first ? first.offsetWidth : 816; sh.style.zoom = String(Math.min(1, Math.max(0.35, ((box.clientWidth || 600) - 28) / w))); };
  const saveBook = async () => {
    clearTimeout(B.timer); B.timer = null; const doc = B.doc;
    if (B.mode === 'edit') build().then(({ settings, files, ctx }) => paginate(settings, files, ctx, B.seq)).catch(() => null);
    if (doc.starter) { try { localStorage.setItem(BOOK_KEY + ':starter', JSON.stringify({ title: doc.title, sections: doc.sections })); st('Saved on this device.'); } catch (_e) { st('Not saved: this browser blocked storage.'); } return; }
    st('Saving…'); const row = toRow(doc, S.me);
    const r = await S.c.client.from(DOCS(S)).update(row).eq('id', doc.id).select('updated_at');
    if (r.error || !r.data?.length) { st('Not saved: ' + (r.error ? r.error.message : 'you can only edit documents you can open')); return; }
    doc.updated_at = r.data[0].updated_at || row.updated_at; doc.updated_by = S.me; st('Saved to “' + doc.title + '”.');
  };
  const flushBook = async () => { if (B.timer) await saveBook(); };
  box.addEventListener('input', e => { const el = e.target.closest && e.target.closest('[data-e]'); if (!el || B.mode !== 'edit') return; applyEdit(B.doc, el.dataset.e, readRich(el)); B.stale = true; st('Editing…'); clearTimeout(B.timer); B.timer = setTimeout(saveBook, 900); });
  box.addEventListener('keydown', e => { const el = e.target.closest && e.target.closest('[data-e]'); if (!el) return; if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey && el.dataset.e.startsWith('p:')) document.execCommand('insertLineBreak'); } });
  box.addEventListener('paste', e => { const el = e.target.closest && e.target.closest('[data-e]'); if (!el) return; e.preventDefault(); const t = (e.clipboardData && e.clipboardData.getData('text/plain')) || ''; document.execCommand('insertText', false, t.replace(/\s*\n\s*/g, ' ')); });
  const act = async k => {
    if (k === 'reset') { if (!confirm('Put the DrawUp starter text back? Your edits to the starter book on this device are removed.')) return; try { localStorage.removeItem(BOOK_KEY + ':starter'); } catch (_e) { /* private mode */ } B.doc = starterBook(true); paintBar(); show(); return; }
    if (k === 'savedoc') { await flushBook(); try { const d = await createDoc(S, { type: 'spec', title: B.doc.title, sections: [] }); d.sections = JSON.parse(JSON.stringify(B.doc.sections)); const r = await S.c.client.from(DOCS(S)).update(toRow(d, S.me)).eq('id', d.id).select('updated_at'); if (r.error) throw r.error; docs.unshift(d); B.doc = d; setBookPref('src', d.id); paintBar(); st('Saved as a document in Documents.'); toast(S, 'Spec book saved as a document.'); } catch (e) { st('Not saved: ' + (sqlMissing(e) ? 'run the DrawUp Specs SQL.' : (e.message || e))); } return; }
    await flushBook(); st('Preparing the PDF…');
    try { let bytes = B.bytes; if (B.stale || !bytes) { const { settings, files, ctx } = await build(); bytes = (await X.pdf(B.doc, ctx, settings, files, {})).bytes; B.bytes = bytes; B.stale = false; }
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      if (k === 'print') { const w = window.open(url, '_blank'); if (!w) { st('Allow pop-ups to print, or use Download PDF.'); return; } setTimeout(() => { try { w.print(); } catch (_e) { /* the viewer prints */ } }, 900); st('Opened for printing.'); }
      else { const a = document.createElement('a'); a.href = url; a.download = slug(B.doc.title || 'spec-book') + (brand() === 'drawup' ? '-drawup' : '') + '.pdf'; document.body.appendChild(a); a.click(); a.remove(); st('PDF downloaded.'); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { st('No PDF: ' + (e.message || e)); }
  };
  window.addEventListener('resize', fit);
  (async () => { B.firm = await brandFirm(S); paintBar(); show(); })();
  paintBar();
  return { redraw: () => { B.stale = true; show(); }, flush: flushBook, state: B };
}
function formatEditor(S, v, row) {
  const builtIn = row === 'drawup'; if (builtIn) row = { kind: 'drawup', name: 'DrawUp standard', settings: {} };
  const canEdit = !builtIn && (row.kind === 'client' || S.admin);
  const st = X.fixFormat(row.settings); let tplId = row.template_file_id || null, refs = (row.reference_file_ids || []).slice(); let sample = 'book', book = null;
  const fileName = id => (S.kitFiles.find(k => k.id === id) || {}).file_name || 'File';
  const ro = canEdit ? '' : 'disabled';
  v.innerHTML = `<div class="sp-fed fk-wrap"><div class="sp-fed-h"><button type="button" class="du-btn ghost" data-fback>← Formats</button><h3>${esc(builtIn ? 'DrawUp standard' : row.kind === 'firm' ? 'Firm standard format' : 'Client format')}</h3>${builtIn ? '<span class="sp-note">Built in. Copy it into a firm or client format to change it.</span>' : ''}</div>
  <div class="fk-gm sp-fgrid"><div class="fk-form">
   <details open><summary>Format</summary>${row.kind === 'client' ? `<label class="fk-wide"><span>Client</span><input id="sf-client" value="${esc(row.client_name || '')}" ${ro} placeholder="Client or owner name"></label>` : ''}<label class="fk-wide"><span>Format name</span><input id="sf-name" value="${esc(row.name || '')}" ${ro || (builtIn ? 'disabled' : '')}></label>
    ${row.kind === 'client' ? `<label class="fk-wide"><span>Use for project <small>optional</small></span><select id="sf-proj" ${ro}><option value="">Any project</option>${S.projects.map(p => `<option value="${p.id}" ${row.project_thread_id === p.id ? 'selected' : ''}>${esc(p.project_name)}</option>`).join('')}</select></label>` : ''}
    ${row.kind === 'firm' ? `<label class="fk-check"><input type="checkbox" id="sf-def" ${row.is_default ? 'checked' : ''} ${ro}> Firm default for new documents</label>` : ''}</details>
   ${builtIn ? '' : `<details open><summary>Preferred format files</summary><p class="sp-fnote">Word template (.docx): Word export keeps its styles, headers, footers and page setup. Type &lt;&lt;project_name&gt;&gt; or any project data key in its header or footer and DrawUp fills it in. PDF letterhead: drawn under the PDF pages. Reference files are the client's spec guidelines, kept with the format.</p>
     <div class="sp-ffile"><b>Word template</b><span>${tplId ? esc(fileName(tplId)) + ' <button type="button" class="sp-link" data-fx="tpl">Remove</button>' : 'None'}</span>${canEdit ? `<label class="du-btn ghost sp-file">Upload .docx<input type="file" accept=".docx,${DOCX_MIME}" data-up="tpl" hidden></label>` : ''}</div>
     <div class="sp-ffile"><b>PDF letterhead</b><span>${st.background ? esc(st.background.name || 'PDF') + ' <button type="button" class="sp-link" data-fx="bg">Remove</button>' : 'None'}</span>${canEdit ? `<label class="du-btn ghost sp-file">Upload PDF<input type="file" accept=".pdf,application/pdf" data-up="bg" hidden></label>` : ''}</div>
     ${st.background ? `<label class="fk-wide"><span>Letterhead on</span><select id="sf-bgmode" ${ro}>${[['first', 'First page only'], ['letters', 'First page of letters'], ['all', 'Every page']].map(([k, l]) => `<option value="${k}" ${st.background.mode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
     <div class="sp-ffile"><b>Reference files</b><span>${refs.length ? refs.map(id => `<button type="button" class="sp-link" data-ref="${id}">${esc(fileName(id))}</button>${canEdit ? ` <button type="button" class="sp-link" data-rx="${id}" aria-label="Remove">✕</button>` : ''}`).join(' · ') : 'None'}</span>${canEdit ? `<label class="du-btn ghost sp-file">Upload<input type="file" accept=".pdf,.docx,image/png,image/jpeg" data-up="ref" hidden></label>` : ''}</div></details>`}
   <details open><summary>Page and type</summary><div class="fk-two"><label><span>Page size</span><select id="sf-page" ${ro}>${Object.entries(X.PAGES).map(([k, p]) => `<option value="${k}" ${st.page === k ? 'selected' : ''}>${p[2]}</option>`).join('')}</select></label><label><span>Font</span><select id="sf-font" ${ro}>${Object.entries(X.FONTS).map(([k, f]) => `<option value="${k}" ${st.font === k ? 'selected' : ''}>${f[3]}</option>`).join('')}</select></label>
     <label><span>Size (pt)</span><input id="sf-size" type="number" step="0.5" min="7" max="14" value="${st.size}" ${ro}></label><label><span>Line spacing</span><input id="sf-line" type="number" step="0.05" min="1" max="2" value="${st.line}" ${ro}></label>
     <label><span>Accent color</span><input id="sf-accent" type="color" value="${st.accent}" ${ro}></label><label><span>Indent per level (in.)</span><input id="sf-indent" type="number" step="0.05" min="0.2" max="1" value="${st.indent}" ${ro}></label></div>
     <div class="fk-four">${['t', 'r', 'b', 'l'].map(k => `<label><span>${{ t: 'Top', r: 'Right', b: 'Bottom', l: 'Left' }[k]}</span><input data-mg="${k}" type="number" step="0.05" min="0.25" max="2.5" value="${st.margins[k]}" ${ro}></label>`).join('')}</div></details>
   <details><summary>Spec sections</summary><label class="fk-wide"><span>Paragraph numbering</span><select id="sf-num" ${ro}><option value="csi" ${st.numbering === 'csi' ? 'selected' : ''}>CSI: 1.1, A., 1., a.</option><option value="decimal" ${st.numbering === 'decimal' ? 'selected' : ''}>Decimal: 1.1, 1.1.1, 1.1.1.1</option></select></label>
     <div class="fk-two"><label><span>Article numbers</span><select id="sf-art" ${ro}><option value="01" ${String(st.article_style) === '01' ? 'selected' : ''}>1.01, 1.02</option><option value="1" ${String(st.article_style) === '1' ? 'selected' : ''}>1.1, 1.2</option></select></label><label><span>Section numbers</span><select id="sf-numst" ${ro}><option value="compact" ${st.number_style === 'compact' ? 'selected' : ''}>01 1000</option><option value="spaced" ${st.number_style === 'spaced' ? 'selected' : ''}>01 10 00</option></select></label></div>
     <label class="fk-wide"><span>Section title ({number}, {title}; new line allowed)</span><textarea id="sf-sectitle" rows="2" ${ro}>${esc(st.section_title)}</textarea></label><label class="fk-wide"><span>Part heading ({n}, {title})</span><input id="sf-part" value="${esc(st.part_style)}" ${ro}></label><label class="fk-wide"><span>End of section</span><input id="sf-end" value="${esc(st.end_text)}" ${ro}></label>
     <label class="fk-check"><input type="checkbox" id="sf-caps" ${st.caps_articles ? 'checked' : ''} ${ro}> Article titles in capitals</label><label class="fk-check"><input type="checkbox" id="sf-cover" ${st.cover ? 'checked' : ''} ${ro}> Cover page</label><label class="fk-check"><input type="checkbox" id="sf-toc" ${st.toc ? 'checked' : ''} ${ro}> Table of contents</label></details>
   <details><summary>Header and footer</summary><p class="sp-fnote">Use project data like &lt;&lt;project_name&gt;&gt; and {page_total} (page in the whole book), {pages} (pages in the book), {page} and {section_pages} (page and pages within a section), {section_number}, {section_title}.</p><label class="fk-wide"><span>Header block on spec pages (one line each; a tab lines up the value). Leave empty to use Header left and right.</span><textarea id="sf-hblock" rows="4" ${ro}>${esc(st.header.block || '')}</textarea></label><div class="fk-two"><label class="fk-check"><input type="checkbox" id="sf-hrule" ${st.header.rule ? 'checked' : ''} ${ro}> Rule under the header</label><label class="fk-check"><input type="checkbox" id="sf-frule" ${st.footer.rule ? 'checked' : ''} ${ro}> Rule over the footer, bold header and footer</label></div><div class="fk-two"><label><span>Header left</span><input data-hf="header.left" value="${esc(st.header.left)}" ${ro}></label><label><span>Header right</span><input data-hf="header.right" value="${esc(st.header.right)}" ${ro}></label></div>
     <div class="fk-three"><label><span>Spec footer left</span><input data-hf="footer.left" value="${esc(st.footer.left)}" ${ro}></label><label><span>Center</span><input data-hf="footer.center" value="${esc(st.footer.center)}" ${ro}></label><label><span>Right</span><input data-hf="footer.right" value="${esc(st.footer.right)}" ${ro}></label></div>
     <div class="fk-three"><label><span>Letter footer left</span><input data-hf="letter_footer.left" value="${esc(st.letter_footer.left)}" ${ro}></label><label><span>Center</span><input data-hf="letter_footer.center" value="${esc(st.letter_footer.center)}" ${ro}></label><label><span>Right</span><input data-hf="letter_footer.right" value="${esc(st.letter_footer.right)}" ${ro}></label></div></details>
   <details><summary>Letterhead</summary><label class="fk-check"><input type="checkbox" id="sf-lh" ${st.letterhead.show ? 'checked' : ''} ${ro}> Show the letterhead on letters</label><label class="fk-wide"><span>Lines (first line is bold)</span><textarea id="sf-lhl" rows="3" ${ro}>${esc(st.letterhead.lines)}</textarea></label>
     <div class="fk-two"><label><span>Logo</span><select id="sf-logo" ${ro}><option value="firm" ${st.letterhead.logo === 'firm' ? 'selected' : ''}>Firm logo</option><option value="upload" ${st.letterhead.logo === 'upload' ? 'selected' : ''}>Uploaded logo</option><option value="none" ${st.letterhead.logo === 'none' ? 'selected' : ''}>No logo</option></select></label><label><span>Align</span><select id="sf-align" ${ro}><option value="left">Left</option><option value="right" ${st.letterhead.align === 'right' ? 'selected' : ''}>Right</option></select></label></div>
     ${canEdit ? `<label class="du-btn ghost sp-file">Upload a logo (PNG or JPG)<input type="file" accept="image/png,image/jpeg" data-up="logo" hidden></label>` : ''}</details>
   ${canEdit ? `<div class="fk-savebar"><button type="button" class="du-btn primary" data-fsave>Save format</button>${row.id ? '<button type="button" class="du-btn ghost" data-fdel>Delete</button>' : ''}<span class="sp-st" role="status"></span></div>` : builtIn ? `<div class="fk-savebar">${S.admin ? '<button type="button" class="du-btn ghost" data-fcopy="firm">Copy into a firm standard</button>' : ''}<button type="button" class="du-btn ghost" data-fcopy="client">Copy into a client format</button></div>` : ''}
  </div><div class="fk-prev-col sp-bookcol"><div class="sp-bk-top"><div class="fk-prev-tabs sp-ptabs" role="tablist"><button type="button" class="active" data-smp="book">Full spec book</button><button type="button" data-smp="letter">Letter page</button></div><button type="button" class="sp-link" data-fwide aria-pressed="false">Wide view</button></div><div class="sp-bkbar"></div><div class="sp-fprev"><p class="sp-note">Laying out…</p></div><p class="sp-note sp-smpnote" hidden>Sample letter with this firm's project data where it is set.</p></div></div></div>`;
  const q = id => v.querySelector('#' + id);
  const read = () => { if (!canEdit) return st; const o = { ...st, margins: { ...st.margins }, header: { ...st.header }, footer: { ...st.footer }, letter_footer: { ...st.letter_footer }, letterhead: { ...st.letterhead } };
    o.page = q('sf-page').value; o.font = q('sf-font').value; o.size = +q('sf-size').value; o.line = +q('sf-line').value; o.accent = q('sf-accent').value; o.indent = +q('sf-indent').value;
    v.querySelectorAll('[data-mg]').forEach(i => { o.margins[i.dataset.mg] = +i.value; }); o.numbering = q('sf-num').value; o.section_title = q('sf-sectitle').value; o.part_style = q('sf-part').value; o.end_text = q('sf-end').value; o.caps_articles = q('sf-caps').checked; o.cover = q('sf-cover').checked; o.toc = q('sf-toc').checked; o.article_style = q('sf-art').value; o.number_style = q('sf-numst').value;
    v.querySelectorAll('[data-hf]').forEach(i => { const [a, b] = i.dataset.hf.split('.'); o[a][b] = i.value; }); o.header.block = q('sf-hblock').value.replace(/\\t/g, '\t'); o.header.rule = q('sf-hrule').checked; o.footer.rule = q('sf-frule').checked; o.header.bold = o.footer.bold = q('sf-frule').checked; o.letterhead.show = q('sf-lh').checked; o.letterhead.lines = q('sf-lhl').value; o.letterhead.logo = q('sf-logo').value; o.letterhead.align = q('sf-align').value;
    if (o.background && q('sf-bgmode')) o.background = { ...o.background, mode: q('sf-bgmode').value }; Object.assign(st, X.fixFormat(o)); return st; };
  let tm = null; const fmtNow = async () => { const s2 = read(); const fake = { id: row.id, kind: row.kind, settings: s2, template_file_id: tplId }; return formatFiles(S, builtIn ? null : fake); };
  const draw = async () => { const box = v.querySelector('.sp-fprev'), bar = v.querySelector('.sp-bkbar'); v.querySelector('.sp-smpnote').hidden = sample === 'book'; bar.hidden = sample !== 'book';
    if (sample === 'book') { if (book) book.redraw(); else book = bookPanel(S, box, bar, fmtNow); return; }
    box.classList.remove('sp-bookbox', 'editing');
    try { const { settings, files } = await fmtNow(); const doc = SAMPLE_LETTER(); const f = await brandFirm(S); const brand = bookPrefs().brand === 'drawup' || !f ? 'drawup' : 'firm'; const ctx = bookCtx(S, { ...doc, data: {} }, brand, f); const r = await X.pdf(doc, ctx, settings, await brandFiles(S, settings, files, brand, f), {}); await renderPdf(box, r.bytes, 2); } catch (e) { box.innerHTML = `<p class="sp-bad">${esc(e.message || e)}</p>`; } };
  v.querySelector('.fk-form').addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(draw, 500); }); v.querySelector('.fk-form').addEventListener('change', () => { clearTimeout(tm); tm = setTimeout(draw, 200); });
  v.querySelectorAll('[data-smp]').forEach(x => x.onclick = async () => { if (book && sample === 'book') await book.flush(); sample = x.dataset.smp; v.querySelectorAll('[data-smp]').forEach(y => y.classList.toggle('active', y === x)); draw(); });
  v.querySelector('[data-fwide]').onclick = e => { const g = v.querySelector('.sp-fgrid'); const on = g.classList.toggle('sp-wide'); e.target.setAttribute('aria-pressed', String(on)); e.target.textContent = on ? 'Show format settings' : 'Wide view'; if (book) book.redraw(); };
  v.querySelector('[data-fback]').onclick = async () => { if (book) await book.flush(); renderFormats(S, v); };
  v.querySelectorAll('[data-fcopy]').forEach(x => x.onclick = () => formatEditor(S, v, { kind: x.dataset.fcopy, name: x.dataset.fcopy === 'firm' ? S.firm.name + ' standard' : 'Client format', settings: JSON.parse(JSON.stringify(X.DRAWUP_FORMAT)), reference_file_ids: [] }));
  v.querySelectorAll('[data-ref]').forEach(x => x.onclick = async () => { const kf = S.kitFiles.find(k => k.id === x.dataset.ref); if (!kf) return; const r = await S.c.client.storage.from(BUCKET).createSignedUrl(kf.storage_path, 600, { download: kf.file_name }); if (r.data) window.open(r.data.signedUrl, '_blank', 'noopener'); });
  v.querySelectorAll('[data-rx]').forEach(x => x.onclick = () => { refs = refs.filter(id => id !== x.dataset.rx); row.reference_file_ids = refs; row.settings = read(); row.template_file_id = tplId; formatEditor(S, v, row); });
  v.querySelectorAll('[data-fx]').forEach(x => x.onclick = () => { if (x.dataset.fx === 'tpl') tplId = null; else st.background = null; row.settings = read(); row.template_file_id = tplId; row.reference_file_ids = refs; formatEditor(S, v, row); });
  v.querySelectorAll('[data-up]').forEach(inp => inp.onchange = async () => { const f = inp.files[0]; if (!f) return; const stl = v.querySelector('.sp-st'); const k = inp.dataset.up; stl && (stl.textContent = 'Uploading…');
    try { if (k === 'tpl' && !isDocx(f)) throw new Error('Use a Word .docx file.'); if (k === 'bg' && !isPdf(f)) throw new Error('Use a PDF file.'); if (k === 'logo' && !isImg(f)) throw new Error('Use a PNG or JPG logo.');
      const kf = await uploadSpecFile(S, f); read();
      if (k === 'tpl') { tplId = kf.id; const fmtFromDoc = await readDocxFormat(S.bytes[kf.storage_path]).catch(() => null); if (fmtFromDoc) Object.assign(st, fmtFromDoc, { margins: { ...st.margins, ...fmtFromDoc.margins } }); }
      if (k === 'bg') { st.background = { file_id: kf.id, path: kf.storage_path, name: f.name, mode: 'first', page: 1 }; try { const P = await X.pdfLib(); const src = await P.PDFDocument.load(S.bytes[kf.storage_path], { ignoreEncryption: true }); const pg = src.getPage(0); const w = pg.getWidth() / 72, h = pg.getHeight() / 72; const best = Object.entries(X.PAGES).find(([, p]) => Math.abs(p[0] - w) < 0.2 && Math.abs(p[1] - h) < 0.2); if (best) st.page = best[0]; } catch (_e) { /* keep page size */ } }
      if (k === 'logo') st.letterhead = { ...st.letterhead, logo: 'upload', logo_path: kf.storage_path };
      if (k === 'ref') refs.push(kf.id);
      row.settings = { ...st }; row.template_file_id = tplId; row.reference_file_ids = refs; formatEditor(S, v, row); toast(S, k === 'tpl' ? 'Word template added. Page size, margins and font were read from it.' : 'File added.');
    } catch (e) { toast(S, e.message || String(e), true); stl && (stl.textContent = ''); } });
  v.querySelector('[data-fsave]')?.addEventListener('click', async () => { const stl = v.querySelector('.sp-st'); stl.textContent = 'Saving…';
    try { const settings = read(); const clean = { ...settings }; if (clean.background) { const { bytes, ...bgRest } = clean.background; clean.background = bgRest; }
      const rec = { firm_id: S.firm.id, kind: row.kind, name: (q('sf-name').value || '').trim() || 'Format', client_name: row.kind === 'client' ? (q('sf-client').value || '').trim() || null : null, project_thread_id: row.kind === 'client' ? (q('sf-proj').value || null) : null, settings: clean, template_file_id: tplId, reference_file_ids: refs, is_default: row.kind === 'firm' ? q('sf-def').checked : false, updated_by: S.me, updated_at: new Date().toISOString() };
      if (rec.is_default) { const u = await S.c.client.from('firm_spec_formats').update({ is_default: false }).eq('firm_id', S.firm.id).eq('kind', 'firm').eq('is_default', true); if (u.error) throw u.error; S.formats.forEach(f => { if (f.kind === 'firm') f.is_default = false; }); }
      const r = row.id ? await S.c.client.from('firm_spec_formats').update(rec).eq('id', row.id).select('*') : await S.c.client.from('firm_spec_formats').insert({ ...rec, created_by: S.me }).select('*');
      if (r.error) throw r.error; if (!r.data?.length) throw new Error('the database did not confirm the save'); const saved = r.data[0];
      S.formats = [saved].concat(S.formats.filter(f => f.id !== saved.id)); Object.assign(row, saved); stl.textContent = 'Saved.'; toast(S, 'Format saved.');
    } catch (e) { stl.textContent = 'Not saved: ' + (sqlMissing(e) ? 'run the DrawUp Specs SQL.' : (e.message || e)); } });
  v.querySelector('[data-fdel]')?.addEventListener('click', async () => { if (!confirm('Delete this format? Documents that use it switch to the DrawUp standard.')) return; const r = await S.c.client.from('firm_spec_formats').delete().eq('id', row.id).select('id'); if (r.error || !r.data?.length) { toast(S, r.error?.message || 'Only the person who added it or a firm admin can delete it.', true); return; } S.formats = S.formats.filter(f => f.id !== row.id); S.docs.forEach(d => { if (d.format_id === row.id) d.format_id = null; }); renderFormats(S, v); toast(S, 'Format deleted.'); });
  draw();
}
// Page size, margins and body font from a Word template.
async function readDocxFormat(bytes) {
  const JSZip = await X.zipLib(); const z = await JSZip.loadAsync(bytes); const doc = (await z.file('word/document.xml')?.async('string')) || '', sty = (await z.file('word/styles.xml')?.async('string')) || '';
  const out = { margins: {} }; const sz = doc.match(/<w:pgSz [^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/); if (sz) { const w = +sz[1] / 1440, h = +sz[2] / 1440; const best = Object.entries(X.PAGES).find(([, p]) => Math.abs(p[0] - w) < 0.2 && Math.abs(p[1] - h) < 0.2); if (best) out.page = best[0]; }
  const mg = doc.match(/<w:pgMar [^>]*>/); if (mg) [['top', 't'], ['right', 'r'], ['bottom', 'b'], ['left', 'l']].forEach(([a, k]) => { const m = mg[0].match(new RegExp('w:' + a + '="(\\d+)"')); if (m) out.margins[k] = Math.round(+m[1] / 1440 * 100) / 100; });
  const defs = sty.match(/<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/); const font = (defs && defs[0].match(/w:ascii="([^"]+)"/)) || sty.match(/w:ascii="([^"]+)"/); if (font) out.font = /times|georgia|garamond|cambria|book/i.test(font[1]) ? 'Times' : /courier|mono/i.test(font[1]) ? 'Courier' : 'Helvetica';
  const s2 = defs && defs[0].match(/<w:sz w:val="(\d+)"/); if (s2) out.size = +s2[1] / 2;
  return out;
}

/* ------------------------------------------------------------------ Check hook: DrawUpFirmKit.newDocument */
async function newDocumentFromCheck(o) {
  const c = window.DrawUpPortal?.ctx?.(); if (!c || !c.client) throw new Error('Sign in first.');
  const fr = await c.client.from('firms').select('id,name,slug').eq('id', o.firmId).maybeSingle(); if (!fr.data) throw new Error('The firm was not found.');
  const S = { c, firm: fr.data, me: c.user.id, docs: [], formats: [], projects: [], info: {}, briefs: {}, bytes: {}, members: [], offices: [], kitFiles: [] };
  const blocks = (o.sections || []).map(s => ({ h: s.heading || '', p: String(s.body || '') }));
  const doc = await createDoc(S, { type: 'narrative', title: (o.title || 'Report').slice(0, 200), project: o.projectId || null, format: null, blocks, source: 'check' });
  try { sessionStorage.setItem('du-specs-open', doc.id); } catch (_e) { /* private mode */ }
  const { data: mine } = await c.client.rpc('drawup_my_firms'); const role = ((mine || []).find(f => f.id === o.firmId) || {}).role;
  if (role === 'admin') { history.replaceState(null, '', '#portal/firm?firm=' + encodeURIComponent(fr.data.slug) + '&pane=specs&doc=' + doc.id); window.DrawUpPortal.openPortalTab('firm'); }
  else { history.replaceState(null, '', '#portal/firm'); window.DrawUpPortal.openPortalTab('firm'); let n = 0; const t = setInterval(() => { const b = document.querySelector('[data-fk-mpane="specs"]'); if (b || ++n > 40) { clearInterval(t); b?.click(); } }, 150); }
  return doc;
}

/* ------------------------------------------------------------------ register with the firm kit */
function register() {
  const K = window.DrawUpFirmKit; if (!K || K.__specs) return !!K;
  K.__specs = true; if (!K.panes.some(p => p[0] === 'specs')) K.panes.push(['specs', 'DrawUp Specs']);
  const owns = K.owns, mount = K.mount;
  K.owns = p => p === 'specs' || owns(p);
  K.mount = (body, c, firm, pane, opts) => pane === 'specs' ? mountSpecs(body, c, firm, opts).catch(e => { body.innerHTML = `<article class="du-glass"><p>DrawUp Specs could not open: ${esc(e.message || e)}</p></article>`; }) : mount(body, c, firm, pane, opts);
  K.newDocument = newDocumentFromCheck;
  return true;
}
if (!register()) document.addEventListener('DOMContentLoaded', register);
window.DrawUpSpecs = { mount: mountSpecs, _intelFor: intelFor, _projectData: projectData, _openEditor: openEditor, _createDoc: createDoc, _modal: modal, _TYPE: () => TYPE, makeSection, newDocument: newDocumentFromCheck, _stateOf: stateOf, _richHTML: richHTML, _serialize: serialize, _dirty: dirty, _flush: flush, _renderHub: renderHub, _newDocModal: newDocModal, _redraw: redraw, _ctxFor: ctxFor, _uploadSpecFile: uploadSpecFile };
})();
