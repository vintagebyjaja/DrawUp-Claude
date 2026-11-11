/* DrawUp Season 1 · Project Intelligence: Projects › Project Information and Projects › Project Map.
 *
 * window.DrawUpProjectInfo = { open(pid, opts), afterCreate(projectRow, address), data(pid), load(c, pid), fieldsFor(...) }
 *
 * One record per project (project_profiles, SQL 0076) that Draw, CheckUp, DrawUp Specs and Document Studio read.
 * Every value shows where it came from (source, date, confidence) and whether a member verified it. A public
 * lookup (/api/project-intel: Census geocoder, FEMA flood map, USGS elevation, sun position) fills empty fields
 * and never replaces a value a member typed or verified. Where DrawUp covers the jurisdiction (Charlotte / Mecklenburg
 * County, NC so far) it also shows the parcel, the zoning district with its UDO limits and references, and a vicinity
 * map (zoning, parcel lines, pending rezonings). Elsewhere the page says what is not covered instead of guessing.
 * Shared field list and merge rules: drawup-project-intel-core-v30.js (bundled from src/lib/drawup-project-intel.ts).
 */
(function () {
  'use strict';
  if (window.DrawUpProjectInfo) return;
  const Core = window.DrawUpIntelCore;
  if (!Core) { console.warn('DrawUp Project Information: core file missing'); return; }
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const day = d => d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const nowIso = () => new Date().toISOString();
  const BUCKET = 'drawup-private';
  const sqlMissing = e => e && (/project_profiles|project_profile_changes|drawup_project_access/.test(e.message || '') || e.code === '42P01' || e.code === 'PGRST205');
  const EMPTY = () => ({ fields: {}, site: {}, program: [], team: [], milestones: [], decisions: [], files: [], lookups: [], rev: 0 });
  const LEVELS = { high: 'High', medium: 'Medium', low: 'Low' };
  const FILE_KINDS = [['survey', 'Survey'], ['site_photo', 'Site photo'], ['existing', 'Existing conditions'], ['reference', 'Reference image'], ['report', 'Report or study'], ['other', 'Other']];
  let S = null; // page state

  /* ------------------------------------------------------------------ data */
  async function listProjects(c) {
    const own = await c.client.from('project_threads').select('id,project_name,project_type,location,project_phase,description,client_nickname,owner_id,firm_id,status,updated_at,starter_key').eq('owner_id', c.user.id).order('updated_at', { ascending: false }).limit(200);
    let rows = (own.data || []).filter(p => !p.starter_key && p.status !== 'archived').map(p => ({ ...p, mine: true }));
    // firm projects the member can see (DrawUp Specs function, SQL 0075); skipped quietly when not installed
    try {
      const f = await c.client.rpc('drawup_my_firms'); const firms = Array.isArray(f.data) ? f.data : [];
      for (const firm of firms.slice(0, 5)) {
        const id = firm.id || firm.firm_id; if (!id) continue;
        const r = await c.client.rpc('drawup_spec_projects', { p_firm: id });
        (Array.isArray(r.data) ? r.data : []).forEach(p => { if (!rows.some(x => x.id === p.id)) rows.push({ ...p, mine: p.owner_id === c.user.id }); });
      }
    } catch (_e) { /* optional */ }
    return rows;
  }
  async function loadProfile(c, pid) {
    const r = await c.client.from('project_profiles').select('*').eq('project_thread_id', pid).maybeSingle();
    if (r.error) { if (sqlMissing(r.error)) return { row: EMPTY(), missing: true }; throw r.error; }
    return { row: Object.assign(EMPTY(), r.data || {}), exists: !!r.data };
  }
  /** Values for documents and other tools: the project's own columns first, then Project Information. */
  function valuesFor(project, row, extra) {
    const out = {};
    if (project) Object.assign(out, { project_name: project.project_name || '', project_location: project.location || '', building_type: project.project_type || '', phase: project.project_phase || '', project_description: project.description || '', owner_name: project.client_nickname || '' });
    Object.entries(Core.plainValues((row && row.fields) || {})).forEach(([k, v]) => { out[k] = v; });
    Object.assign(out, extra || {});
    Object.keys(out).forEach(k => { if (out[k] == null || String(out[k]).trim() === '') delete out[k]; });
    return out;
  }
  async function data(pid) {
    const c = window.DrawUpPortal?.ctx?.(); if (!c || !pid) return null;
    const pr = await c.client.from('project_threads').select('id,project_name,project_type,location,project_phase,description,client_nickname').eq('id', pid).maybeSingle();
    const { row, missing } = await loadProfile(c, pid);
    return { project: pr.data || null, profile: row, values: valuesFor(pr.data, row), missing: !!missing };
  }

  async function save(force) {
    if (!S || !S.pid) return; clearTimeout(S.timer);
    if (!S.dirty && !force) return; if (S.missing) { status('Not saved: run the Project Information SQL (0076) in Supabase.', true); return; }
    if (S.saving) { S.again = true; return; }
    S.saving = true; S.dirty = false; status('Saving…');
    const r0 = S.row; const rec = { project_thread_id: S.pid, fields: r0.fields, site: r0.site, program: r0.program, team: r0.team, milestones: r0.milestones, decisions: r0.decisions, files: r0.files, lookups: r0.lookups.slice(0, 10) };
    try {
      const r = await S.c.client.from('project_profiles').upsert(rec, { onConflict: 'project_thread_id' }).select('*');
      if (r.error) throw r.error; const back = (r.data || [])[0]; if (!back) throw new Error('the database did not confirm the save');
      S.row.rev = back.rev; S.row.updated_at = back.updated_at; status('Saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    } catch (e) { S.dirty = true; status('Not saved: ' + (sqlMissing(e) ? 'run the Project Information SQL (0076).' : (e.message || e)), true); }
    S.saving = false; if (S.again) { S.again = false; save(); }
  }
  function dirty() { if (!S) return; S.dirty = true; status('Unsaved changes'); clearTimeout(S.timer); S.timer = setTimeout(save, 900); }
  function status(t, bad) { const el = S && S.w.querySelector('#dpi-saved'); if (el) { el.textContent = t; el.classList.toggle('bad', !!bad); } }

  /* ------------------------------------------------------------------ provenance */
  function badge(f, key) {
    if (!f || !String(f.v ?? '').trim()) {
      const un = lastUnavailable(key);
      return un ? `<span class="dpi-prov na" title="${esc(un.next)}">Not available: ${esc(un.reason)}</span>` : '<span class="dpi-prov empty">Not set</span>';
    }
    if (f.by === 'user') return `<span class="dpi-prov user">${f.verified ? '<b>Verified</b> · ' : ''}Entered by ${esc(f.src || 'a member')}${f.at ? ' · ' + esc(day(f.at)) : ''}</span> <select class="dpi-kindsel" data-kind="${esc(key)}" aria-label="Where this value came from">${['member', 'website', 'estimate', '3d', 'aerial', 'official'].map(k => `<option value="${k}" ${(f.kind || 'member') === k ? 'selected' : ''}>${esc(k === 'member' ? 'Source: you' : 'Source: ' + KL[k])}</option>`).join('')}</select>`;
    return `${chip(f.kind || 'official')}<span class="dpi-prov auto${f.verified ? ' ver' : ''}">${f.verified ? '<b>Verified</b> · ' : '<b>Unverified</b> · '}${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.src)}</a>` : esc(f.src)}${f.at ? ' · ' + esc(day(f.at)) : ''}${f.conf ? ' · ' + esc(LEVELS[f.conf] || f.conf) + ' confidence' : ''}${f.note ? `<i title="${esc(f.note)}"> ⓘ ${esc(f.note)}</i>` : ''}</span>`;
  }
  function lastUnavailable(key) { const L = S && S.row.lookups && S.row.lookups[0]; return L && Array.isArray(L.unavailable) ? L.unavailable.find(u => u.key === key) : null; }
  function projectFallback(key) {
    const p = S.project; if (!p) return '';
    return ({ project_name: p.project_name, project_location: p.location, building_type: p.project_type, phase: p.project_phase, project_description: p.description, owner_name: p.client_nickname })[key] || '';
  }

  /* ------------------------------------------------------------------ page */
  async function render(w, c) {
    const q = new URLSearchParams((location.hash.split('?')[1]) || '');
    S = { w, c, view: q.get('view') === 'map' ? 'map' : 'info', pid: q.get('id') || (S && S.pid) || '', projects: [], row: EMPTY(), timer: null };
    w.innerHTML = '<div class="du-loading">LOADING PROJECT INFORMATION…</div>';
    S.projects = await listProjects(c);
    if (!S.pid || !S.projects.some(p => p.id === S.pid)) S.pid = (S.projects[0] || {}).id || '';
    if (S.view === 'map') return renderMap();
    return renderInfo();
  }
  function setHash() { const p = new URLSearchParams(); if (S.view === 'map') p.set('view', 'map'); else if (S.pid) p.set('id', S.pid); history.replaceState(null, '', '#portal/project-info' + (p.toString() ? '?' + p : '')); }
  function head(title, sub) {
    return `<div class="du-work-head dpi-head"><div><span class="du-kicker">PROJECTS · ${S.view === 'map' ? 'PROJECT MAP' : 'PROJECT INFORMATION'}</span><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>
      <div class="du-head-actions"><div class="du-subtabs dpi-tabs" role="tablist"><button type="button" role="tab" data-v="info" class="${S.view === 'info' ? 'active' : ''}">Project information</button><button type="button" role="tab" data-v="map" class="${S.view === 'map' ? 'active' : ''}">Project map</button></div></div></div>`;
  }
  function bindHead() { S.w.querySelectorAll('.dpi-tabs [data-v]').forEach(b => b.onclick = () => { S.view = b.dataset.v; setHash(); S.view === 'map' ? renderMap() : renderInfo(); }); }

  async function renderInfo(opts) {
    const w = S.w; setHash();
    if (!S.projects.length) {
      w.innerHTML = head('Project information', 'One record for each project, used by Draw, CheckUp, Documents and Specifications.') + `<article class="du-glass dpi-empty"><h2>No projects yet</h2><p class="du-muted">Start a project, add its site address, and DrawUp fills in what public sources know about the site.</p><button class="du-btn primary" type="button" data-portal-tab="projects">Go to Projects</button></article>`;
      bindHead(); return;
    }
    S.project = S.projects.find(p => p.id === S.pid);
    const { row, missing } = await loadProfile(S.c, S.pid); S.row = row; S.missing = !!missing;
    const f = S.row.fields, site = S.row.site || {}, look = S.row.lookups[0];
    const filled = Core.FIELD_GROUPS.flatMap(g => g.fields).filter(([k]) => (f[k] && String(f[k].v || '').trim()) || projectFallback(k)).length;
    const total = Core.FIELD_GROUPS.flatMap(g => g.fields).length;
    w.innerHTML = head(S.project.project_name, 'One record for this project. Draw, CheckUp, Documents and Specifications all read it.') + `
    ${S.missing ? '<article class="du-glass dpi-warn"><b>Run the Project Information SQL.</b> Supabase still needs migration 0076 (project_profiles). You can look things up, but nothing is saved until then.</article>' : ''}
    <div class="dpi-bar du-glass"><label><span>Project</span><select id="dpi-proj">${S.projects.map(p => `<option value="${esc(p.id)}" ${p.id === S.pid ? 'selected' : ''}>${esc(p.project_name)}${p.location ? ' · ' + esc(p.location) : ''}${p.mine ? '' : ' (firm)'}</option>`).join('')}</select></label>
      <span class="dpi-meter" title="${filled} of ${total} fields filled"><i style="width:${Math.round(filled / total * 100)}%"></i></span><span class="dpi-mtext">${filled} of ${total} filled</span>
      <span class="dpi-saved" id="dpi-saved" role="status">${S.row.updated_at ? 'Saved ' + esc(day(S.row.updated_at)) : ''}</span>
      <button class="du-btn ghost" type="button" data-portal-tab="documents" id="dpi-docs">Documents</button></div>
    <div class="dpi-grid">
      <article class="du-glass dpi-site"><span class="du-kicker">SITE</span><h2>Where is the site?</h2>
        <div class="dpi-addr"><input id="dpi-addr" class="dpi-in" placeholder="Street address, city, state ZIP" value="${esc((f.project_address && f.project_address.v) || '')}" aria-label="Site address"><button class="du-btn primary" type="button" id="dpi-look">Look up site data</button></div>
        <p class="dpi-note">Free. DrawUp asks the U.S. Census geocoder, the FEMA flood map and the USGS elevation service, plus the county parcel records and the city zoning map where DrawUp covers the place. Covered now: ${esc(Core.COVERAGE_TEXT || 'none')}. It fills only empty fields; values you typed or verified are never replaced. Public data is preliminary; nothing here is a survey, a zoning determination or legal verification.</p>
        <div id="dpi-lookres">${look ? lookupHTML(look) : ''}</div>
        ${site.lat && site.lng ? siteSections(site) : '<div class="dpi-nomap">Add a site address to place the project on the map.</div>'}
      </article>
      <article class="du-glass dpi-used"><span class="du-kicker">USED BY</span><h2>Where this information goes</h2><div id="dpi-usedby"><p class="du-muted">Checking…</p></div></article>
    </div>
    <div class="dpi-groups">${Core.FIELD_GROUPS.map(g => { const n = g.fields.filter(([k]) => (f[k] && String(f[k].v || '').trim()) || projectFallback(k)).length; return `<article class="du-glass dpi-group" data-g="${g.id}"><details data-sec="g-${g.id}"${openSet().has('g-' + g.id) ? ' open' : ''}><summary><span class="du-kicker">${esc(g.label.toUpperCase())}</span><span class="dpi-gcount">${n} of ${g.fields.length} filled</span></summary><div class="dpi-rows">${g.fields.map(([k, label]) => fieldRow(k, label)).join('')}</div></details></article>`; }).join('')}</div>
    <article class="du-glass dpi-list" data-l="program"><div class="dpi-lhead"><span class="du-kicker">BUILDING PROGRAM</span><span class="dpi-total" id="dpi-total"></span></div>${listTable('program')}</article>
    <div class="dpi-grid2"><article class="du-glass dpi-list" data-l="team"><span class="du-kicker">PROJECT TEAM AND CONSULTANTS</span>${listTable('team')}</article>
      <article class="du-glass dpi-list" data-l="milestones"><span class="du-kicker">MILESTONES</span>${listTable('milestones')}</article></div>
    <article class="du-glass dpi-list" data-l="decisions"><span class="du-kicker">DESIGN DECISIONS</span><p class="dpi-note">Open decisions show up in DD Readiness.</p>${listTable('decisions')}</article>
    <article class="du-glass dpi-files"><span class="du-kicker">SURVEYS AND SITE DOCUMENTS</span><div class="dpi-up"><select id="dpi-fkind" class="dpi-in" aria-label="Kind of file">${FILE_KINDS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><label class="du-btn ghost">Upload a file<input type="file" id="dpi-file" hidden multiple accept="image/*,application/pdf,.dwg,.dxf,.docx,.xlsx,.csv"></label></div><div id="dpi-flist">${filesHTML()}</div></article>`;
    bindHead(); bindInfo(); bindMaps(); usedBy(); total_();
    if (opts && opts.autoLookup) lookup(opts.autoLookup);
  }

  function fieldRow(k, label) {
    const f = S.row.fields[k]; const fb = !f ? projectFallback(k) : '';
    const v = f ? f.v : fb; const long = ['project_description', 'zoning_requirements', 'zoning_conditions', 'setbacks', 'nearby_rezonings', 'parcel_owner', 'legal_description', 'environmental_notes', 'existing_structures', 'code_references', 'land_use', 'property_boundary'].includes(k);
    const prov = f ? badge(f, k) : fb ? '<span class="dpi-prov proj">From the DrawUp project</span>' : badge(null, k);
    const canVerify = f && String(f.v || '').trim();
    return `<div class="dpi-row" data-k="${k}"><label for="dpi-f-${k}">${esc(label)}</label><div class="dpi-val">${long ? `<textarea id="dpi-f-${k}" class="dpi-in" rows="2" data-f="${k}">${esc(v)}</textarea>` : `<input id="dpi-f-${k}" class="dpi-in" data-f="${k}" value="${esc(v)}">`}
      <div class="dpi-meta">${prov}${canVerify ? `<label class="dpi-ver"><input type="checkbox" data-ver="${k}" ${f.verified ? 'checked' : ''}> Verified</label>` : ''}</div></div></div>`;
  }

  const LISTS = {
    program: { cols: [['name', 'Space', 'text'], ['area', 'Area (sf)', 'number'], ['count', 'Count', 'number'], ['level', 'Level', 'text'], ['adj', 'Next to', 'text']], add: 'Add a space', blank: () => ({ id: uid(), name: '', area: '', count: 1, level: '', adj: '' }) },
    team: { cols: [['role', 'Role', 'text'], ['company', 'Company', 'text'], ['name', 'Name', 'text'], ['email', 'Email', 'email']], add: 'Add a team member', blank: () => ({ id: uid(), role: '', company: '', name: '', email: '' }) },
    milestones: { cols: [['name', 'Milestone', 'text'], ['date', 'Date', 'date'], ['status', 'Status', ['planned', 'in progress', 'done']]], add: 'Add a milestone', blank: () => ({ id: uid(), name: '', date: '', status: 'planned' }) },
    decisions: { cols: [['topic', 'Topic', 'text'], ['decision', 'Decision', 'text'], ['status', 'Status', ['open', 'decided']], ['date', 'Date', 'date']], add: 'Add a decision', blank: () => ({ id: uid(), topic: '', decision: '', status: 'open', date: '' }) },
  };
  function listTable(name) {
    const L = LISTS[name], rows = S.row[name] || [];
    return `<div class="dpi-tblwrap"><table class="dpi-tbl"><thead><tr>${L.cols.map(c => `<th>${esc(c[1])}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map((r, i) => `<tr>${L.cols.map(([k, , t]) => `<td>${Array.isArray(t) ? `<select class="dpi-in" data-li="${name}:${i}:${k}">${t.map(o => `<option ${r[k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select>` : `<input class="dpi-in" type="${t}" data-li="${name}:${i}:${k}" value="${esc(r[k] ?? '')}" aria-label="${esc(k)}">`}</td>`).join('')}<td><button type="button" class="dpi-x" data-ldel="${name}:${i}" aria-label="Remove">✕</button></td></tr>`).join('') || `<tr><td colspan="${L.cols.length + 1}" class="du-muted">Nothing yet.</td></tr>`}</tbody></table></div><button type="button" class="du-btn ghost dpi-add" data-ladd="${name}">＋ ${esc(L.add)}</button>${name === 'program' ? ' <button type="button" class="du-btn ghost" id="dpi-usegross">Use total as gross area</button>' : ''}`;
  }
  function programTotal() { return (S.row.program || []).reduce((a, r) => a + (parseFloat(r.area) || 0) * (parseFloat(r.count) || 1), 0); }
  function total_() { const el = S.w.querySelector('#dpi-total'); if (el) { const t = programTotal(); el.textContent = t ? `Total program area: ${Math.round(t).toLocaleString()} sf (net)` : ''; } }

  function bindInfo() {
    const w = S.w;
    w.querySelector('#dpi-proj').onchange = async e => { await save(); S.pid = e.target.value; renderInfo(); };
    w.querySelectorAll('[data-f]').forEach(inp => inp.oninput = () => {
      const k = inp.dataset.f, cur = S.row.fields[k] || {}; const me = S.c.profile && (S.c.profile.display_name || S.c.profile.username) || 'you';
      S.row.fields[k] = { v: inp.value, by: 'user', src: me, at: nowIso(), verified: !!cur.verified && cur.v === inp.value, kind: cur.by === 'user' && cur.kind ? cur.kind : 'member' };
      const meta = inp.closest('.dpi-row').querySelector('.dpi-meta'); meta.innerHTML = badge(S.row.fields[k], k) + `<label class="dpi-ver"><input type="checkbox" data-ver="${k}"> Verified</label>`; bindVer(meta); dirty();
    });
    bindVer(w);
    w.querySelectorAll('[data-li]').forEach(inp => inp.oninput = inp.onchange = () => { const [n, i, k] = inp.dataset.li.split(':'); S.row[n][+i][k] = inp.value; total_(); dirty(); });
    w.querySelectorAll('[data-ladd]').forEach(b => b.onclick = () => { const n = b.dataset.ladd; S.row[n] = (S.row[n] || []).concat(LISTS[n].blank()); refreshList(n); dirty(); });
    w.querySelectorAll('[data-ldel]').forEach(b => b.onclick = () => { const [n, i] = b.dataset.ldel.split(':'); S.row[n].splice(+i, 1); refreshList(n); dirty(); });
    const ug = w.querySelector('#dpi-usegross'); if (ug) ug.onclick = () => { const t = programTotal(); if (!t) return S.c.toast('Add spaces with areas first.', true); S.row.fields.gross_area = { v: Math.round(t).toLocaleString() + ' sf (net program; add circulation and walls for gross)', by: 'user', src: 'the program table', at: nowIso() }; dirty(); renderInfoKeep(); };
    w.querySelector('#dpi-look').onclick = () => lookup(w.querySelector('#dpi-addr').value);
    w.querySelector('#dpi-addr').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); lookup(e.target.value); } };
    w.querySelector('#dpi-file').onchange = e => upload([...e.target.files]);
    bindFiles();
  }
  function bindKind(root) { root.querySelectorAll('[data-kind]').forEach(sel => sel.onchange = () => { const f = S.row.fields[sel.dataset.kind]; if (!f) return; f.kind = sel.value; dirty(); }); }
  function bindVer(root) { bindKind(root); root.querySelectorAll('[data-ver]').forEach(cb => cb.onchange = () => { const f = S.row.fields[cb.dataset.ver]; if (!f) return; f.verified = cb.checked; f.verified_at = cb.checked ? nowIso() : null; const meta = cb.closest('.dpi-meta'); meta.innerHTML = badge(f, cb.dataset.ver) + `<label class="dpi-ver"><input type="checkbox" data-ver="${cb.dataset.ver}" ${f.verified ? 'checked' : ''}> Verified</label>`; bindVer(meta); dirty(); }); }
  function refreshList(n) { const art = S.w.querySelector(`[data-l="${n}"]`); const keep = art.querySelector('.du-kicker').outerHTML; const extra = n === 'decisions' ? '<p class="dpi-note">Open decisions show up in DD Readiness.</p>' : n === 'program' ? '' : ''; art.innerHTML = (n === 'program' ? '<div class="dpi-lhead"><span class="du-kicker">BUILDING PROGRAM</span><span class="dpi-total" id="dpi-total"></span></div>' : keep + extra) + listTable(n); bindInfoLists(art); total_(); }
  function bindInfoLists(art) {
    art.querySelectorAll('[data-li]').forEach(inp => inp.oninput = inp.onchange = () => { const [n, i, k] = inp.dataset.li.split(':'); S.row[n][+i][k] = inp.value; total_(); dirty(); });
    art.querySelectorAll('[data-ladd]').forEach(b => b.onclick = () => { const n = b.dataset.ladd; S.row[n] = (S.row[n] || []).concat(LISTS[n].blank()); refreshList(n); dirty(); });
    art.querySelectorAll('[data-ldel]').forEach(b => b.onclick = () => { const [n, i] = b.dataset.ldel.split(':'); S.row[n].splice(+i, 1); refreshList(n); dirty(); });
    const ug = art.querySelector('#dpi-usegross'); if (ug) ug.onclick = () => { const t = programTotal(); if (!t) return S.c.toast('Add spaces with areas first.', true); S.row.fields.gross_area = { v: Math.round(t).toLocaleString() + ' sf (net program; add circulation and walls for gross)', by: 'user', src: 'the program table', at: nowIso() }; dirty(); renderInfoKeep(); };
  }
  async function renderInfoKeep() { await save(); renderInfo(); }

  function lookupHTML(L) {
    const ok = (L.sources || []).filter(s => s.ok), bad = (L.sources || []).filter(s => !s.ok);
    return `<div class="dpi-look"><p><b>Last lookup:</b> ${esc(day(L.at))}${L.applied ? ` · ${L.applied.length} field${L.applied.length === 1 ? '' : 's'} filled` : ''}${L.kept && L.kept.length ? ` · ${L.kept.length} kept as you entered them (${L.kept.map(k => esc(Core.FIELD_LABEL[k] || k)).join(', ')})` : ''}</p>
      ${(() => { const list = `<ul class="dpi-src">${ok.map(s => `<li class="ok">✓ <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a></li>`).join('')}${bad.map(s => `<li class="bad">✕ ${esc(s.name)}: ${esc(s.error || 'no answer')}</li>`).join('')}</ul>`;
        return ok.length + bad.length > 4 ? `<details class="dpi-srcs"${bad.length ? ' open' : ''}><summary>${ok.length} source${ok.length === 1 ? '' : 's'} answered${bad.length ? `, ${bad.length} did not` : ''}</summary>${list}</details>` : list; })()}
      ${(L.unavailable || []).length ? `<details><summary>${L.unavailable.length} item${L.unavailable.length === 1 ? '' : 's'} DrawUp could not look up</summary><ul class="dpi-na">${L.unavailable.map(u => `<li><b>${esc(Core.FIELD_LABEL[u.key] || u.key)}</b>: ${esc(u.reason)} <i>${esc(u.next)}</i></li>`).join('')}</ul></details>` : ''}</div>`;
  }
  function mapEmbed(lat, lng) {
    const d = 0.004, bbox = [lng - d * 1.4, lat - d, lng + d * 1.4, lat + d].map(x => x.toFixed(5)).join(',');
    return `<div class="dpi-map"><iframe title="Site map" loading="lazy" referrerpolicy="no-referrer" src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&amp;layer=mapnik&amp;marker=${lat},${lng}"></iframe>
      <p class="dpi-note">Pin at the ${S && S.row.site && S.row.site.from === 'parcel' ? 'parcel point' : 'geocoded point'} (${(+lat).toFixed(5)}, ${(+lng).toFixed(5)}). ${S && S.row.site && S.row.site.boundary ? 'Parcel lines are on the Vicinity tab.' : 'Property lines are not shown: no parcel source is connected for this site.'} Map © OpenStreetMap contributors. <a href="https://www.openstreetmap.org/?mlat=${lat}&amp;mlon=${lng}#map=18/${lat}/${lng}" target="_blank" rel="noopener">Open larger map</a></p></div>`;
  }

  /* ------------------------------------------------------------------ parcel, zoning, buildings, parking, map (collapsible sections) */
  const money = n => n ? '$' + Math.round(n).toLocaleString() : '';
  const KL = Core.KIND_LABEL || { official: 'Official record', website: 'Website', estimate: 'Estimate', '3d': '3D file', aerial: 'Aerial imagery', member: 'Entered by you' };
  const chip = k => k ? `<span class="dpi-kind k-${esc(k)}" title="Where this value came from">${esc(KL[k] || k)}</span>` : '';
  const OPEN_KEY = 'du-dpi-open-v1';
  const openSet = () => { try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]')); } catch (_e) { return new Set(); } };
  function sec(id, title, sum, body, k) {
    return `<details class="dpi-sec" data-sec="${id}"${openSet().has(id) ? ' open' : ''}><summary><span class="dpi-sect">${esc(title)}</span><span class="dpi-secs">${sum}</span>${k ? chip(k) : ''}</summary><div class="dpi-secb">${body}</div></details>`;
  }
  function bindSecs(root) {
    (root || S.w).querySelectorAll('details[data-sec]').forEach(d => d.ontoggle = () => { const o = openSet(); d.open ? o.add(d.dataset.sec) : o.delete(d.dataset.sec); try { localStorage.setItem(OPEN_KEY, JSON.stringify([...o])); } catch (_e) { /* private mode */ } });
  }
  const gapsFor = keys => ((S.row.lookups[0] || {}).unavailable || []).filter(u => keys.includes(u.key));
  const gapHTML = (g, links) => `<div class="dpi-zgap"><b>Not available.</b> ${esc(g.reason)} <i>${esc(g.next)}</i>${links ? ' <a href="#" data-opensec="find">Look it up yourself</a>' : ''}</div>`;

  function siteSections(site) {
    const f = S.row.fields, look = S.row.lookups[0] || {}; const fv = k => f[k] && String(f[k].v || '').trim() ? f[k].v : '';
    const out = [];
    // zoning and limits
    const Z = site.zoning, D = Z && Z.district;
    if (D) {
      const tags = [D.conditional ? '<span class="dpi-tag warn">Conditional (CD)</span>' : '', D.exception ? '<span class="dpi-tag warn">Exception (EX)</span>' : '', D.kind === 'legacy' ? '<span class="dpi-tag warn">Pre-UDO district</span>' : '', ...(D.overlays || []).map(o => `<span class="dpi-tag ov" title="${esc(o.ref || '')}">${esc(o.name)}</span>`), (site.vicinity && site.vicinity.rezonings && site.vicinity.rezonings.length) ? `<span class="dpi-tag rz">${site.vicinity.rezonings.length} pending rezoning${site.vicinity.rezonings.length === 1 ? '' : 's'} nearby</span>` : ''].join('');
      const gaps = gapsFor(['setbacks', 'height_limit', 'min_lot_area', 'min_lot_width', 'lot_coverage', 'far', 'density']);
      const rows = (Z.standards || []).map(x => `<tr><th scope="row">${esc(x.label)}</th><td>${esc(x.value)}${x.note ? `<small>${esc(x.note)}</small>` : ''}</td><td class="dpi-ref">${chip(Z.kind || 'official')}<a href="${esc(D.articleUrl || Z.jurisdiction.ordinanceUrl)}" target="_blank" rel="noopener">${esc(x.ref)}</a></td></tr>`).join('');
      const gapRows = gaps.map(g => `<tr class="na"><th scope="row">${esc(Core.FIELD_LABEL[g.key] || g.key)}</th><td colspan="2">${esc(g.reason)}</td></tr>`).join('');
      const fr = Z.frontage ? `<details class="dpi-front"><summary>${esc(Z.frontage.title)} <small>${esc(Z.frontage.ref)}</small></summary><div class="dpi-tblwrap"><table class="dpi-tbl"><thead><tr>${Z.frontage.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${Z.frontage.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="dpi-note">${esc(Z.frontage.note)}</p></details>` : '';
      const rz = site.vicinity && site.vicinity.rezonings && site.vicinity.rezonings.length ? `<details class="dpi-front"><summary>Pending rezonings within about 650 ft</summary><ul class="dpi-rzl">${site.vicinity.rezonings.map(r => `<li><b>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.petition)}</a>` : esc(r.petition)}</b> ${esc(r.existing || '?')} → ${esc(r.requested || '?')}${r.acres ? ` · ${esc(r.acres)} ac` : ''}${r.received ? ` · filed ${esc(r.received)}` : ''}</li>`).join('')}</ul></details>` : '';
      const body = `<div class="dpi-zcard"><div class="dpi-zhead"><span class="du-kicker">ZONING · ${esc(Z.jurisdiction.name.toUpperCase())}</span>${D.petitionUrl ? `<a href="${esc(D.petitionUrl)}" target="_blank" rel="noopener">Rezoning petition ${esc(D.petition || '')} ↗</a>` : ''}</div>
        <div class="dpi-zcode"><b>${esc(D.raw)}</b><span>${esc(D.name || '')}${D.article ? ` · <a href="${esc(D.articleUrl)}" target="_blank" rel="noopener">${esc(D.article)}</a>` : ''}</span></div>
        ${tags ? `<div class="dpi-tags">${tags}</div>` : ''}${(Z.notes || []).map(n => `<p class="dpi-znote">${esc(n)}</p>`).join('')}
        ${rows || gapRows ? `<div class="dpi-tblwrap"><table class="dpi-ztbl"><tbody>${rows}${gapRows}</tbody></table></div>` : ''}${fr}${rz}
        <p class="dpi-src1"><b>Unverified</b> · district from the <a href="${esc(Z.jurisdiction.mapUrl)}" target="_blank" rel="noopener">${esc(Z.jurisdiction.mapName)}</a>${rows ? `; limits from the <a href="${esc(Z.jurisdiction.ordinanceUrl)}" target="_blank" rel="noopener">${esc(Z.jurisdiction.ordinance)}</a>` : ''} · ${esc(day(look.at))}${Z.transcribed && rows ? ` · ${esc(Z.transcribed)}` : ''} Not a zoning determination: for a binding answer ask the city for a zoning verification letter.</p></div>`;
      const sb = (Z.standards || []).filter(x => ['front', 'side', 'rear'].includes(x.key)).map(x => x.value.replace(/ from the street right-of-way/, '').split(';')[0]);
      const hh = (Z.standards || []).find(x => x.key === 'height');
      out.push(sec('zoning', 'Zoning and limits', `<b>${esc(D.raw)}</b>${sb.length === 3 && !/frontage/.test(sb[0]) ? ` · setbacks ${esc(sb.join(' / '))}` : ''}${hh ? ` · height ${esc(hh.value.split(';')[0].replace(/ residential$/, ''))}` : ''}`, body, Z.kind || 'official'));
    } else {
      const g = gapsFor(['zoning_district'])[0];
      out.push(sec('zoning', 'Zoning and limits', '<span class="dpi-na2">Not available here</span>', g ? gapHTML(g, true) : '<p class="dpi-note">Run a lookup to see the zoning.</p>'));
    }
    // parcel
    const P = site.parcel;
    if (P) {
      out.push(sec('parcel', 'Parcel', `<b>${esc(P.id)}</b>${P.lotSf ? ` · ${Math.round(P.lotSf).toLocaleString()} sf` : ''}${P.owner ? ` · ${esc(P.owner)}` : ''}`, `<div class="dpi-parcel"><div class="dpi-zhead"><span class="du-kicker">PARCEL</span><a href="${esc(P.url)}" target="_blank" rel="noopener">Open the county record ↗</a></div>
        <dl class="dpi-pdl"><dt>Parcel ID</dt><dd><b>${esc(P.id)}</b>${P.how === 'point' ? ' <span class="dpi-tag warn" title="Found at the map point, not by the address">check lot</span>' : ''}</dd>
        ${P.lotSf ? `<dt>Lot size</dt><dd>${Math.round(P.lotSf).toLocaleString()} sf · ${esc(P.lotAcres)} ac <small>(${esc(P.lotFrom)})</small></dd>` : ''}${P.owner ? `<dt>Owner of record</dt><dd>${esc(P.owner)}</dd>` : ''}
        ${P.landUse ? `<dt>Assessor land use</dt><dd>${esc(P.landUse)}</dd>` : ''}${P.totalValue ? `<dt>Assessed value</dt><dd>${money(P.totalValue)}${P.assessedYear ? ` <small>(tax year ${esc(P.assessedYear)})</small>` : ''}</dd>` : ''}
        ${P.heatedSf ? `<dt>Heated area</dt><dd>${Math.round(P.heatedSf).toLocaleString()} sf</dd>` : ''}${P.lastSale ? `<dt>Last sale</dt><dd>${esc(P.lastSale)}</dd>` : ''}</dl>
        <p class="dpi-src1"><b>Unverified</b> · <a href="${esc(P.srcUrl)}" target="_blank" rel="noopener">${esc(P.src)}</a> · ${esc(day(look.at))}</p></div>`, 'official'));
    } else {
      const g = gapsFor(['parcel_id'])[0];
      out.push(sec('parcel', 'Parcel', '<span class="dpi-na2">Not available here</span>', g ? gapHTML(g, true) : '<p class="dpi-note">Run a lookup to find the parcel.</p>'));
    }
    // buildings
    const B = site.buildings || [], sel = B.find(b => b.id === site.building);
    const lim = Z && (Z.standards || []).find(x => x.key === 'height'); const cov = Z && (Z.standards || []).find(x => x.key === 'lot_coverage');
    const val = (k, label) => fv(k) ? `<dt>${esc(label)}</dt><dd>${esc(fv(k))} ${chip(f[k].by === 'user' ? (f[k].kind || 'member') : (f[k].kind || 'official'))}${f[k].note ? `<small>${esc(f[k].note)}</small>` : ''}</dd>` : `<dt>${esc(label)}</dt><dd class="dpi-na2">Not known${(gapsFor([k])[0] || {}).reason ? ': ' + esc(gapsFor([k])[0].reason) : ''}</dd>`;
    const selHTML = (sel || fv('existing_building')) ? `<dl class="dpi-pdl">${val('existing_building', 'Building')}${val('existing_footprint', 'Footprint')}${val('existing_height', 'Height')}${val('existing_stories', 'Floors')}${val('existing_floor_area', 'Floor area')}</dl>
      ${lim || cov ? `<p class="dpi-cmp">For comparison, the zoning allows: ${lim ? `height ${esc(lim.value)}` : ''}${lim && cov ? '; ' : ''}${cov ? `building coverage ${esc(cov.value)}` : ''}${sel && site.parcel && site.parcel.lotSf && sel.onParcel ? `. This footprint covers about ${Math.round(sel.footprintSf / site.parcel.lotSf * 100)}% of the lot.` : '.'}</p>` : ''}` : (gapsFor(['existing_building'])[0] ? gapHTML(gapsFor(['existing_building'])[0], true) : '');
    const list = B.length ? `<details class="dpi-front"${sel ? '' : ' open'}><summary>Pick a building (${B.length} mapped within about 400 ft)</summary><ul class="dpi-blist">${B.slice(0, 40).map(b => `<li><label><input type="radio" name="dpi-bsel" data-bsel="${esc(b.id)}" ${b.id === site.building ? 'checked' : ''}> <b>${esc(b.name || (b.use ? b.use[0].toUpperCase() + b.use.slice(1) : 'Building'))}</b>${b.onParcel ? ' <span class="dpi-tag ov">on this parcel</span>' : ''} <span>${b.footprintSf.toLocaleString()} sf footprint${b.heightFt ? ` · ${b.heightFt} ft` : ''}${b.levels ? ` · ${b.levels} fl` : ''}</span> ${chip(b.heightKind || b.kind)}</label></li>`).join('')}</ul><p class="dpi-note">Or click a building on the vicinity map.</p></details>` : '';
    out.push(sec('building', 'Buildings', sel ? `<b>${esc(fv('existing_footprint') || '')}</b>${fv('existing_height') ? ' · ' + esc(fv('existing_height')) + ' tall' : ''}${fv('existing_floor_area') ? ' · ' + esc(fv('existing_floor_area').split(' (')[0]) : ''}` : B.length ? `${B.length} nearby` : '<span class="dpi-na2">None found</span>',
      `${selHTML}${list}<p class="dpi-note">Footprints, heights and floors come from OpenStreetMap, a free map people edit; heights worked out from a floor count are labelled Estimate. Have a better number from a 3D file, a survey or Google Earth? Type it in Existing building below and pick where it came from.</p>`, sel ? (sel.heightKind || sel.kind) : ''));
    // parking
    const PK = Z && Z.parking;
    if (PK) out.push(sec('parking', 'Parking', `<b>${esc(PK.tier)}</b> · ${esc(/no .*maximums\.$/i.test(PK.rule) ? 'minimums, no maximum' : /^Most uses/.test(PK.rule) ? 'no minimum for most uses, maximums apply' : 'minimums and maximums')}`,
      `<p><b>${esc(PK.tier)}.</b> ${esc(PK.rule)} <a href="${esc(PK.url)}" target="_blank" rel="noopener">${esc(PK.ref)} ↗</a></p><div class="dpi-tblwrap"><table class="dpi-tbl dpi-park"><thead><tr><th>Use</th><th>Minimum</th><th>Maximum</th></tr></thead><tbody>${PK.rows.map(r => `<tr><td>${esc(r.use)}</td><td>${esc(r.min)}</td><td>${esc(r.max)}</td></tr>`).join('')}</tbody></table></div><p class="dpi-znote">${esc(PK.note)}</p><p class="dpi-src1"><b>Unverified</b> · Low confidence for the ratios · ${esc(day(look.at))}</p>`, 'official'));
    else { const g = gapsFor(['parking_requirement'])[0]; out.push(sec('parking', 'Parking', '<span class="dpi-na2">Not available here</span>', g ? gapHTML(g, true) : `<div class="dpi-zgap"><b>Not available.</b> DrawUp has no free parking source for this place yet. <a href="#" data-opensec="find">Look it up yourself</a></div>`)); }
    // map
    if (site.lat && site.lng) out.push(sec('map', 'Vicinity map', site.vicinity ? 'Zoning, parcel lines and buildings' : B.length ? 'Buildings around the site' : 'Street map', siteMaps(site)));
    // links
    const links = (Core.findLinks ? Core.findLinks(site.lat || 0, site.lng || 0, fv('project_address') || '') : []);
    if (links.length && site.lat) out.push(sec('find', 'Look it up yourself', 'Free and paid sites DrawUp links to', `<ul class="dpi-links">${links.map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a> <span>${esc(l.what)}</span></li>`).join('')}</ul><p class="dpi-note">DrawUp only uses free public sources. These sites are here so you can check or fill in what DrawUp could not; some of them charge. Values you copy from them are labelled with where they came from.</p>`));
    return `<div class="dpi-secs-wrap">${out.join('')}</div>`;
  }
  const FAM = [[/^N1-/, '#e3efd9'], [/^N2-/, '#f6e7c8'], [/^(CG|CR)\b/, '#f4d6d2'], [/^(NC|CAC|RAC|UE|UC)\b/, '#f1d2e4'], [/^TOD-/, '#dcd8f3'], [/^(IMU|ML|IC|OFC|OG|RC)\b/, '#d6e4f2'], [/^R\/W/, '#ffffff']];
  const famColor = code => { const c = String(code || '').toUpperCase(); const f = FAM.find(([re]) => re.test(c)); return f ? f[1] : '#e9ebef'; };
  function vicinitySVG(site) {
    const V = site.vicinity || {}, B = site.buildings || [];
    if (!V.bbox && !B.length) return '';
    let bbox = V.bbox; if (!bbox) { const dy = 450 / 364000, dx = 450 / (364000 * Math.cos(site.lat * Math.PI / 180)); bbox = [site.lng - dx, site.lat - dy, site.lng + dx, site.lat + dy]; }
    const [x0, y0, x1, y1] = bbox, W = 600, H = Math.round(600 * (y1 - y0) / ((x1 - x0) * Math.cos(((y0 + y1) / 2) * Math.PI / 180)) || 600);
    const X = x => ((x - x0) / (x1 - x0) * W).toFixed(1), Y = y => ((y1 - y) / (y1 - y0) * H).toFixed(1);
    const path = rings => rings.map(r => 'M' + r.map(p => X(p[0]) + ',' + Y(p[1])).join('L') + 'Z').join('');
    const area = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(a); };
    const labelAt = rings => { const r = rings.slice().sort((a, b) => area(b) - area(a))[0]; if (!r) return null; let cx = 0, cy = 0; r.forEach(p => { cx += p[0]; cy += p[1]; }); return [cx / r.length, cy / r.length, area(r) / ((x1 - x0) * (y1 - y0))]; };
    const zones = (V.zones || []).map(z => `<path d="${path(z.rings)}" fill="${famColor(z.code)}" stroke="#9aa8bb" stroke-width="1"><title>${esc(z.code)}</title></path>`).join('');
    const lines = (V.parcels || []).map(rs => `<path d="${path(rs)}"/>`).join('');
    const rez = (V.rezonings || []).map(r => `<path d="${path(r.rings)}" class="rz"><title>Pending rezoning ${esc(r.petition)}: ${esc(r.existing)} to ${esc(r.requested)}</title></path>`).join('');
    const blds = B.map(b => `<path d="${path(b.rings)}" class="bd${b.id === site.building ? ' sel' : ''}" data-bsel="${esc(b.id)}" tabindex="0" role="button" aria-label="Pick ${esc(b.name || 'this building')}"><title>${esc(b.name || 'Building')}: ${b.footprintSf.toLocaleString()} sf footprint${b.heightFt ? ', ' + b.heightFt + ' ft' : ''}</title></path>`).join('');
    const sx = +X(site.lng), sy = +Y(site.lat);
    const labels = (V.zones || []).map(z => { const l = labelAt(z.rings); if (!l || l[2] <= 0.01) return ''; let lx = Math.min(W - 34, Math.max(34, +X(l[0]))), ly = Math.min(H - 30, Math.max(20, +Y(l[1]))); if (Math.hypot(lx - sx, ly - sy) < 50) ly = ly + (ly + 60 < H - 30 ? 60 : -60); return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${esc(z.code)}</text>`; }).join('');
    const subj = site.boundary ? `<path d="${path(site.boundary)}" class="subj"/>` : `<circle cx="${X(site.lng)}" cy="${Y(site.lat)}" r="7" class="subjpt"/>`;
    const ftPerPx = ((x1 - x0) * 364000 * Math.cos(((y0 + y1) / 2) * Math.PI / 180)) / W, bar = 200 / ftPerPx;
    const codes = [...new Set((V.zones || []).map(z => z.code))].slice(0, 8);
    return `<figure class="dpi-vic"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Vicinity map around the site"><rect width="${W}" height="${H}" fill="#f7f8fa"/>${zones}<g class="pl">${lines}</g>${rez}${subj}<g class="bds">${blds}</g><g class="lb">${labels}</g>
      <g class="sc" transform="translate(16 ${H - 18})"><rect width="${bar.toFixed(1)}" height="5" fill="#13233d"/><text y="-6">200 ft</text></g><g class="na" transform="translate(${W - 26} 30)"><path d="M0,-16 L7,6 L0,1 L-7,6Z" fill="#13233d"/><text y="20" text-anchor="middle">N</text></g></svg>
      <figcaption><span class="lg"><i class="subj"></i>${site.boundary ? 'This parcel' : 'The site'}</span>${B.length ? '<span class="lg"><i class="bd"></i>Building (click to pick)</span>' : ''}${(V.rezonings || []).length ? '<span class="lg"><i class="rz"></i>Pending rezoning</span>' : ''}${codes.map(c => `<span class="lg"><i style="background:${famColor(c)}"></i>${esc(c)}</span>`).join('')}
        <small>About ${Math.round((x1 - x0) * 364000 * Math.cos(((y0 + y1) / 2) * Math.PI / 180) / 100) * 100} ft across. ${esc([V.src, B.length ? 'buildings © OpenStreetMap contributors' : ''].filter(Boolean).join('; '))}. Map lines are approximate, not a survey.</small></figcaption></figure>`;
  }
  function siteMaps(site) {
    const vic = vicinitySVG(site); if (!vic) return mapEmbed(site.lat, site.lng);
    return `<div class="dpi-maps"><div class="du-subtabs dpi-tabs dpi-maptabs" role="tablist"><button type="button" role="tab" class="active" data-mv="vic">Vicinity</button><button type="button" role="tab" data-mv="street">Street map</button></div>
      <div data-mvp="vic">${vic}</div><div data-mvp="street" hidden>${mapEmbed(site.lat, site.lng)}</div></div>`;
  }
  function bindMaps() {
    S.w.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => { S.w.querySelectorAll('[data-mv]').forEach(x => x.classList.toggle('active', x === b)); S.w.querySelectorAll('[data-mvp]').forEach(p => { p.hidden = p.dataset.mvp !== b.dataset.mv; }); });
    S.w.querySelectorAll('[data-bsel]').forEach(el => { const go = () => pickBuilding(el.dataset.bsel); if (el.tagName === 'INPUT') el.onchange = go; else { el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; } });
    S.w.querySelectorAll('[data-opensec]').forEach(a => a.onclick = e => { e.preventDefault(); const d = S.w.querySelector(`details[data-sec="${a.dataset.opensec}"]`); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } });
    bindSecs();
  }
  /** A member picks a building: its values fill Existing building, never over what the member typed or verified. */
  async function pickBuilding(id) {
    const site = S.row.site || {}; const b = (site.buildings || []).find(x => x.id === id); if (!b) return;
    const n = (site.buildings || []).filter(x => x.onParcel).length;
    // drop the last building's looked-up values (not ones a member typed or checked) so nothing stale carries over
    const base = Object.assign({}, S.row.fields);
    (Core.FIELD_GROUPS.find(g => g.id === 'existing') || { fields: [] }).fields.forEach(([k]) => { const c = base[k]; if (c && c.by !== 'user' && !c.verified) delete base[k]; });
    const m = Core.mergeLookup(base, Core.fieldsForBuilding(b, site.parcel, nowIso(), n));
    S.row.fields = m.fields; S.row.site = Object.assign({}, site, { building: id });
    const o = openSet(); o.add('building'); try { localStorage.setItem(OPEN_KEY, JSON.stringify([...o])); } catch (_e) { /* private mode */ }
    S.dirty = true; await save(true); await renderInfo();
    if (m.kept.length) S.c.toast(`Kept what you entered for ${m.kept.map(k => Core.FIELD_LABEL[k] || k).join(', ')}.`);
  }

  async function lookup(address) {
    address = String(address || '').trim(); const res = S.w.querySelector('#dpi-lookres'), btn = S.w.querySelector('#dpi-look');
    if (address.length < 6) { S.c.toast('Enter a street address with a city and state.', true); return; }
    btn.disabled = true; res.innerHTML = '<p class="dpi-note">Looking up public site data…</p>';
    try {
      const tok = await S.c.token();
      const r = await fetch('/api/project-intel', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ action: 'lookup', address }) });
      const j = await r.json().catch(() => ({})); if (!r.ok || !j.fields) throw new Error(j.error || 'The lookup did not answer. Try again.');
      const m = Core.mergeLookup(S.row.fields, j.fields);
      S.row.fields = m.fields;
      if (j.site && j.site.lat) {
        const keep = Object.assign({}, S.row.site); ['parcel', 'zoning', 'vicinity', 'boundary', 'jurisdiction', 'buildings', 'building'].forEach(k => delete keep[k]); // a new lookup replaces the old site layers
        S.row.site = Object.assign(keep, { lat: j.site.lat, lng: j.site.lng, from: j.site.from || 'census', at: j.at }, ...['parcel', 'zoning', 'vicinity', 'boundary', 'jurisdiction', 'buildings', 'building'].filter(k => j.site[k]).map(k => ({ [k]: j.site[k] })));
      }
      S.row.lookups = [{ at: j.at, address, sources: j.sources, unavailable: j.unavailable, applied: m.applied, kept: m.kept }].concat(S.row.lookups || []).slice(0, 10);
      // fill the project's own location only when it is empty (never replace what the member typed)
      const loc = j.fields.project_location && j.fields.project_location.v;
      if (loc && S.project && !S.project.location && S.project.owner_id === S.c.user.id) { const u = await S.c.client.from('project_threads').update({ location: loc }).eq('id', S.pid).eq('owner_id', S.c.user.id); if (!u.error) S.project.location = loc; }
      S.dirty = true; await save(true); await renderInfo();
      S.c.toast(m.applied.length ? `Filled ${m.applied.length} field${m.applied.length === 1 ? '' : 's'} from public sources.` : 'Nothing new found; your values were kept.');
    } catch (e) { res.innerHTML = `<p class="dpi-bad">${esc(e.message || e)}</p>`; btn.disabled = false; }
  }

  function filesHTML() { const L = S.row.files || []; return L.length ? `<ul class="dpi-fl">${L.map((f, i) => `<li><span class="dpi-fk">${esc((FILE_KINDS.find(k => k[0] === f.kind) || [0, 'File'])[1])}</span><b>${esc(f.name)}</b><small>${esc(day(f.at))}</small><button type="button" class="du-btn ghost" data-fopen="${i}">Open</button><button type="button" class="dpi-x" data-fdel="${i}" aria-label="Remove from the list">✕</button></li>`).join('')}</ul>` : '<p class="du-muted">No surveys or site documents yet. Upload a survey, site photos or existing-condition drawings; they stay private to this project.</p>'; }
  function bindFiles() {
    const box = S.w.querySelector('#dpi-flist');
    box.querySelectorAll('[data-fopen]').forEach(b => b.onclick = async () => { const f = S.row.files[+b.dataset.fopen]; const r = await S.c.client.storage.from(BUCKET).createSignedUrl(f.path, 600); if (r.data && r.data.signedUrl) window.open(r.data.signedUrl, '_blank', 'noopener'); else S.c.toast('That file could not be opened.', true); });
    box.querySelectorAll('[data-fdel]').forEach(b => b.onclick = () => { if (!confirm('Remove this file from the project list? The stored file is kept.')) return; S.row.files.splice(+b.dataset.fdel, 1); box.innerHTML = filesHTML(); bindFiles(); dirty(); });
  }
  async function upload(files) {
    const kind = S.w.querySelector('#dpi-fkind').value;
    for (const file of files.slice(0, 10)) {
      if (file.size > 50 * 1024 * 1024) { S.c.toast(file.name + ' is over 50 MB.', true); continue; }
      const path = `${S.c.user.id}/projects/${S.pid}/${uid()}-${file.name.replace(/[^\w.\-]+/g, '-').slice(-80)}`;
      const r = await S.c.client.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (r.error) { S.c.toast('Upload failed: ' + r.error.message, true); continue; }
      S.row.files = (S.row.files || []).concat({ path, name: file.name, kind, size: file.size, type: file.type, at: nowIso() });
    }
    S.w.querySelector('#dpi-flist').innerHTML = filesHTML(); bindFiles(); dirty();
  }

  async function usedBy() {
    const box = S.w.querySelector('#dpi-usedby'); if (!box) return; const c = S.c, pid = S.pid;
    const cnt = async (t) => { try { const r = await c.client.from(t).select('id', { count: 'exact', head: true }).eq('project_thread_id', pid); return r.error ? null : r.count || 0; } catch (_e) { return null; } };
    const [docs, fdocs, sets, checks, ports] = await Promise.all([cnt('project_documents'), cnt('firm_documents'), cnt('drawing_generations'), cnt('check_reviews'), cnt('portfolio_reviews')]);
    if (!S || S.pid !== pid) return;
    const line = (n, label, tab, extra) => n == null ? '' : `<li><b>${n}</b> ${esc(label)}${tab ? ` <button type="button" class="dpi-link" data-go="${tab}" ${extra || ''}>Open</button>` : ''}</li>`;
    box.innerHTML = `<ul class="dpi-used-l">${line((docs || 0) + (fdocs || 0), 'documents and specifications', 'documents')}${line(sets, 'drawing sets', 'projects')}${line(checks, 'CheckUp reviews', 'check')}${line(ports, 'portfolio reviews', 'portfolio')}</ul>
      <p class="dpi-note">Documents insert these values as linked fields (for example the project address). When a value here changes, each document shows what changed and lets you accept the update.</p>`;
    box.querySelectorAll('[data-go]').forEach(b => b.onclick = async () => { await save(); if (b.dataset.go === 'documents') history.replaceState(null, '', '#portal/documents?project=' + pid); c.openPortalTab(b.dataset.go); });
  }

  /* ------------------------------------------------------------------ project map */
  // geoAlbersUsa lower-48 (as used for us-atlas states-albers-10m: scale 1300, translate [487.5, 305]).
  function albers(lng, lat) {
    if (lat < 23 || lat > 50 || lng < -126 || lng > -65) return null;
    const r = Math.PI / 180, p0 = 29.5 * r, p1 = 45.5 * r, sy0 = Math.sin(p0), n = (sy0 + Math.sin(p1)) / 2, c = 1 + sy0 * (2 * n - sy0), r0 = Math.sqrt(c) / n;
    const proj = (l, p) => { const rr = Math.sqrt(c - 2 * n * Math.sin(p)) / n; return [rr * Math.sin(l * n), r0 - rr * Math.cos(l * n)]; };
    const k = 1300, ctr = proj(-0.6 * r, 38.7 * r), dx = 487.5 - ctr[0] * k, dy = 305 + ctr[1] * k;
    const pt = proj((lng + 96) * r, lat * r); return [pt[0] * k + dx, dy - pt[1] * k];
  }
  async function renderMap() {
    const w = S.w; setHash(); const US = window.DRAWUP_US_STATES || {};
    const ids = S.projects.map(p => p.id); let profs = [];
    if (ids.length) { const r = await S.c.client.from('project_profiles').select('project_thread_id,site,fields,updated_at').in('project_thread_id', ids.slice(0, 300)); profs = r.error ? [] : (r.data || []); S.missing = !!(r.error && sqlMissing(r.error)); }
    const by = Object.fromEntries(profs.map(p => [p.project_thread_id, p]));
    const rows = S.projects.map(p => { const pr = by[p.id] || {}; const s = pr.site || {}; const f = pr.fields || {}; const xy = s.lat && s.lng ? albers(+s.lng, +s.lat) : null; return { p, lat: s.lat, lng: s.lng, xy, flood: f.flood_zone && f.flood_zone.v, juris: f.jurisdiction && f.jurisdiction.v, addr: f.project_address && f.project_address.v }; });
    const placed = rows.filter(r => r.lat), unplaced = rows.filter(r => !r.lat);
    w.innerHTML = head('Project map', 'Your projects at their sites. Each pin opens the same project record that Documents, Specifications, Draw and CheckUp use.') + `
    ${S.missing ? '<article class="du-glass dpi-warn"><b>Run the Project Information SQL (0076)</b> to place projects on the map.</article>' : ''}
    <div class="dpi-mapgrid"><div class="du-glass dpi-mapsvg"><svg viewBox="0 0 975 610" role="img" aria-label="Projects on a map of the United States">${Object.values(US).map(s => `<path d="${s.d}" fill="#e7edf5" stroke="#fff" stroke-width="1"/>`).join('')}
      ${placed.filter(r => r.xy).map(r => `<g class="dpi-pin" data-open="${esc(r.p.id)}" tabindex="0" role="button" aria-label="${esc(r.p.project_name)}"><circle cx="${r.xy[0].toFixed(1)}" cy="${r.xy[1].toFixed(1)}" r="7"/><title>${esc(r.p.project_name)}${r.addr ? ' · ' + esc(r.addr) : ''}</title></g>`).join('')}</svg>
      <p class="dpi-note">${placed.length} of ${rows.length} project${rows.length === 1 ? '' : 's'} placed from their site address. Projects outside the lower 48 states are listed but not drawn.</p></div>
      <div class="dpi-maplist">${placed.map(r => `<article class="du-glass dpi-mcard"><b>${esc(r.p.project_name)}</b><span>${esc(r.addr || r.p.location || '')}</span><small>${r.juris ? 'Jurisdiction: ' + esc(r.juris) : ''}${r.flood ? ' · ' + esc(r.flood) : ''}</small><button type="button" class="du-btn ghost" data-open="${esc(r.p.id)}">Project information</button></article>`).join('')}
        ${unplaced.length ? `<article class="du-glass dpi-mcard dpi-unplaced"><b>No site yet</b>${unplaced.map(r => `<span>${esc(r.p.project_name)} <button type="button" class="dpi-link" data-open="${esc(r.p.id)}">Add a site address</button></span>`).join('')}</article>` : ''}</div></div>`;
    bindHead();
    w.querySelectorAll('[data-open]').forEach(b => { const go = () => { S.pid = b.dataset.open; S.view = 'info'; renderInfo(); }; b.onclick = go; b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
  }

  /* ------------------------------------------------------------------ wiring */
  function open(pid, opts) { const P = window.DrawUpPortal; if (!P) return; history.replaceState(null, '', '#portal/project-info' + (pid ? '?id=' + encodeURIComponent(pid) : (opts && opts.view === 'map' ? '?view=map' : ''))); S = null; if (opts && opts.lookup) pendingLookup = { pid, address: opts.lookup }; P.openPortalTab('project-info'); }
  let pendingLookup = null;
  function afterCreate(row, address) { open(row.id, { lookup: address || '' }); }
  function register(n) {
    const P = window.DrawUpPortal; if (!P || !P.registerTab) { if ((n || 0) < 100) setTimeout(() => register((n || 0) + 1), 100); return; }
    P.registerTab('project-info', async (w, c) => {
      await render(w, c);
      if (pendingLookup && pendingLookup.pid === S.pid) { const a = pendingLookup.address; pendingLookup = null; if (a) { const inp = w.querySelector('#dpi-addr'); if (inp) inp.value = a; lookup(a); } else w.querySelector('#dpi-addr')?.focus(); }
    });
  }
  // Project page (Projects › a project): a Project Information card with the key facts.
  function decorateProjectPage() {
    const grid = document.querySelector('#du-workspace-content .du-profile-grid[data-project-id]'); if (!grid || grid.querySelector('.dpi-card')) return;
    const pid = grid.dataset.projectId; const c = window.DrawUpPortal?.ctx?.(); if (!c || !c.user) return;
    grid.insertAdjacentHTML('afterbegin', `<article class="du-glass du-wide dpi-card"><div class="du-section-title"><span class="du-kicker">PROJECT INFORMATION</span><span><button class="du-btn ghost" type="button" data-dpi-docs>Documents</button> <button class="du-btn primary" type="button" data-dpi-open>Open project information</button></span></div><div class="dpi-card-b"><p class="du-muted">Loading…</p></div></article>`);
    const card = grid.querySelector('.dpi-card');
    card.querySelector('[data-dpi-open]').onclick = () => open(pid);
    card.querySelector('[data-dpi-docs]').onclick = () => { history.replaceState(null, '', '#portal/documents?project=' + pid); c.openPortalTab('documents'); };
    loadProfile(c, pid).then(({ row, missing }) => {
      const f = row.fields || {}; const v = k => f[k] && String(f[k].v || '').trim() ? esc(f[k].v) : '<span class="du-muted">Not set</span>';
      card.querySelector('.dpi-card-b').innerHTML = missing ? '<p class="du-muted">Run the Project Information SQL (0076) to keep site and jurisdiction data here.</p>' : `<dl class="dpi-dl"><dt>Address</dt><dd>${v('project_address')}</dd><dt>Jurisdiction</dt><dd>${v('jurisdiction')}</dd><dt>Zoning</dt><dd>${v('zoning_district')}</dd><dt>Flood zone</dt><dd>${v('flood_zone')}</dd><dt>Parcel</dt><dd>${v('parcel_id')}</dd><dt>Setbacks</dt><dd>${v('setbacks')}</dd><dt>Height limit</dt><dd>${v('height_limit')}</dd><dt>Occupancy</dt><dd>${v('occupancy')}</dd><dt>Gross area</dt><dd>${v('gross_area')}</dd></dl>`;
    }).catch(() => { card.querySelector('.dpi-card-b').innerHTML = '<p class="du-muted">Project information could not load.</p>'; });
  }
  function watch() { const host = document.getElementById('du-workspace-content'); if (!host) { setTimeout(watch, 300); return; } new MutationObserver(decorateProjectPage).observe(host, { childList: true, subtree: false }); decorateProjectPage(); }

  window.DrawUpProjectInfo = { open, afterCreate, data, load: loadProfile, valuesFor, albers };
  register(0); watch();
  // Season 1 Projects menu
})();
