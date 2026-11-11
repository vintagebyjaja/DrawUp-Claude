/* DrawUp Season 1 · Project Management tracker (#portal/tracker). Projects › Project Management.
 *
 * window.DrawUpTracker = { open(opts), _trackOf, _summary, _rows, _csv }
 *
 * One list of the project's construction administration, construction management, QA/QC and PM documents that need
 * an answer or a close-out: RFIs, submittals, ASIs, change order requests, field reports, punch lists, NCRs,
 * inspections, deficiency logs and meeting minutes. The items ARE the member's Document Studio documents
 * (project_documents, SQL 0077); nothing is copied and no demonstration data is shown.
 *
 * Tracking (state, ball in court, due date, priority, submittal action, a dated log) is kept on the document itself,
 * in project_documents.cover.data.track, next to the page setup Document Studio keeps there. A save re-reads the row
 * and merges, so the document's own text, fields and status are never touched. The tracking state is separate
 * from the document status (Draft, Issued…): closing an RFI does not issue or archive its document.
 */
(function () {
  'use strict';
  if (window.DrawUpTracker) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const TABLE = 'project_documents';
  const KINDS = {
    rfi: { label: 'RFI', plural: 'RFIs', group: 'CA', due: 7 },
    submittal_review: { label: 'Submittal', plural: 'Submittals', group: 'CA', due: 14 },
    asi: { label: 'ASI', plural: 'ASIs', group: 'CA', due: 7 },
    change_order_request: { label: 'Change order request', plural: 'Change orders', group: 'CM', due: 14 },
    field_report: { label: 'Field report', plural: 'Field reports', group: 'CA', due: 7 },
    punch_list: { label: 'Punch list', plural: 'Punch lists', group: 'CA', due: 30 },
    ncr: { label: 'NCR', plural: 'NCRs', group: 'QA/QC', due: 14 },
    inspection_checklist: { label: 'Inspection', plural: 'Inspections', group: 'QA/QC', due: 7 },
    deficiency_log: { label: 'Deficiency log', plural: 'Deficiency logs', group: 'QA/QC', due: 30 },
    meeting_minutes: { label: 'Meeting minutes', plural: 'Minutes', group: 'CM', due: 7 },
    transmittal: { label: 'Transmittal', plural: 'Transmittals', group: 'PM', due: 7 },
  };
  const STATES = [['open', 'Open'], ['in_review', 'In review'], ['responded', 'Responded'], ['closed', 'Closed']];
  const STATE = Object.fromEntries(STATES);
  const ACTIONS = ['', 'No exceptions taken', 'Make corrections noted', 'Revise and resubmit', 'Rejected', 'For record only'];
  const BALL = ['Architect', 'Contractor', 'Owner', 'Consultant', 'Subcontractor'];
  const DAY = 86400000;
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const iso = d => new Date(d).toISOString().slice(0, 10);
  const fmt = s => { try { return new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch (_e) { return s; } };
  let ST = null;

  /** The tracking record of a document, with defaults that need no saving: open, due by the type's usual turnaround. */
  function trackOf(row) {
    const t = (row.cover && row.cover.data && row.cover.data.track) || {};
    const k = KINDS[row.doc_type] || { due: 7 };
    const opened = t.opened || row.created_at;
    return { state: STATE[t.state] ? t.state : 'open', ball: t.ball || '', due: t.due || iso(new Date(opened).getTime() + k.due * DAY), dueSet: !!t.due, priority: t.priority || 'normal', action: t.action || '', opened, closed_at: t.closed_at || null, responded_at: t.responded_at || null, log: Array.isArray(t.log) ? t.log : [], saved: !!row.cover?.data?.track };
  }
  function rowsOf(docs, projects) {
    const names = Object.fromEntries((projects || []).map(p => [p.id, p.project_name]));
    const now = today().getTime();
    return docs.filter(d => KINDS[d.doc_type]).map(d => {
      const t = trackOf(d); const end = t.closed_at ? new Date(t.closed_at).getTime() : Date.now();
      const due = new Date(t.due + 'T23:59:59').getTime();
      return { id: d.id, doc: d, kind: d.doc_type, label: KINDS[d.doc_type].label, group: KINDS[d.doc_type].group, number: d.doc_number || '', title: d.title, project: d.project_thread_id || '', projectName: names[d.project_thread_id] || 'No project', status: d.status, t,
        days: Math.max(0, Math.round((end - new Date(t.opened).getTime()) / DAY)), overdue: t.state !== 'closed' && due < now, soon: t.state !== 'closed' && due >= now && due < now + 7 * DAY };
    });
  }
  function summary(rows) {
    const open = rows.filter(r => r.t.state !== 'closed');
    const closed = rows.filter(r => r.t.state === 'closed' && r.t.closed_at);
    const recent = closed.filter(r => Date.now() - new Date(r.t.closed_at).getTime() < 30 * DAY);
    const turn = rows.filter(r => r.t.responded_at || r.t.closed_at).map(r => (new Date(r.t.responded_at || r.t.closed_at) - new Date(r.t.opened)) / DAY);
    return { open: open.length, overdue: open.filter(r => r.overdue).length, soon: open.filter(r => r.soon).length, closed30: recent.length, avg: turn.length ? Math.round(turn.reduce((a, b) => a + b, 0) / turn.length * 10) / 10 : null, ball: BALL.concat('').map(b => [b || 'Not set', open.filter(r => (r.t.ball || '') === b).length]).filter(x => x[1]) };
  }
  function csv(rows) {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const head = ['Number', 'Type', 'Title', 'Project', 'Tracking', 'Ball in court', 'Due', 'Priority', 'Submittal action', 'Opened', 'Responded', 'Closed', 'Days open', 'Document status'];
    return [head.map(q).join(',')].concat(rows.map(r => [r.number, r.label, r.title, r.projectName, STATE[r.t.state], r.t.ball, r.t.due, r.t.priority, r.t.action, iso(r.t.opened), r.t.responded_at ? iso(r.t.responded_at) : '', r.t.closed_at ? iso(r.t.closed_at) : '', r.days, r.status].map(q).join(','))).join('\r\n');
  }

  async function load() {
    const c = ST.c;
    const [d, p] = await Promise.all([
      c.client.from(TABLE).select('id,owner_id,project_thread_id,doc_type,title,doc_number,status,assigned_to,cover,created_at,updated_at').in('doc_type', Object.keys(KINDS)).order('created_at', { ascending: false }).limit(1000),
      c.client.from('project_threads').select('id,project_name,status').order('updated_at', { ascending: false }).limit(200),
    ]);
    if (d.error) throw d.error;
    ST.docs = d.data || []; ST.projects = (p.data || []).filter(x => x.status !== 'archived');
  }

  /** Writes the tracking record only: re-reads cover so page setup and anything else on the row stays as it is. */
  async function saveTrack(id, next, note) {
    const c = ST.c;
    const cur = await c.client.from(TABLE).select('cover').eq('id', id).maybeSingle();
    if (cur.error) throw cur.error; if (!cur.data) throw new Error('That document is no longer there.');
    const cover = cur.data.cover && typeof cur.data.cover === 'object' ? cur.data.cover : {};
    const data = cover.data && typeof cover.data === 'object' ? cover.data : {};
    const was = Object.assign({ state: 'open', log: [] }, data.track || {});
    const changes = [];
    if ((was.state || 'open') !== next.state) changes.push(`${STATE[was.state || 'open']} → ${STATE[next.state]}`);
    if ((was.ball || '') !== next.ball) changes.push(`Ball in court: ${next.ball || 'not set'}`);
    if ((was.due || '') !== next.due && next.due) changes.push(`Due ${fmt(next.due)}`);
    if ((was.priority || 'normal') !== next.priority) changes.push(`Priority: ${next.priority}`);
    if ((was.action || '') !== next.action && next.action) changes.push(`Action: ${next.action}`);
    if (!changes.length && !note) return null;
    const now = new Date().toISOString();
    const track = Object.assign({}, was, next, {
      opened: was.opened || next.opened,
      responded_at: was.responded_at || (next.state === 'responded' || next.state === 'closed' ? now : null),
      closed_at: next.state === 'closed' ? (was.state === 'closed' && was.closed_at ? was.closed_at : now) : null,
      log: (was.log || []).concat({ at: now, by: c.user.id, what: changes.join(' · '), note: note || '' }).slice(-200),
    });
    const r = await c.client.from(TABLE).update({ cover: Object.assign({}, cover, { data: Object.assign({}, data, { track }) }), updated_at: now, updated_by: c.user.id }).eq('id', id).select('id,cover,updated_at');
    if (r.error) throw r.error; if (!r.data || !r.data.length) throw new Error('The database did not confirm the save.');
    return r.data[0];
  }

  function draw() {
    const w = ST.w, f = ST.f;
    let rows = rowsOf(ST.docs, ST.projects);
    if (f.project) rows = rows.filter(r => r.project === f.project);
    const all = rows;
    if (f.kind) rows = rows.filter(r => r.kind === f.kind);
    if (f.state === 'open') rows = rows.filter(r => r.t.state !== 'closed'); else if (f.state === 'overdue') rows = rows.filter(r => r.overdue); else if (f.state === 'closed') rows = rows.filter(r => r.t.state === 'closed');
    if (f.q) { const q = f.q.toLowerCase(); rows = rows.filter(r => (r.number + ' ' + r.title + ' ' + r.t.ball + ' ' + r.projectName).toLowerCase().includes(q)); }
    rows.sort((a, b) => (a.t.state === 'closed') - (b.t.state === 'closed') || b.overdue - a.overdue || (a.t.due < b.t.due ? -1 : a.t.due > b.t.due ? 1 : 0));
    ST.rows = rows;
    const s = summary(all);
    const kinds = Object.keys(KINDS).filter(k => all.some(r => r.kind === k));
    w.innerHTML = `<div class="pmt">
      <div class="du-work-head"><div><span class="du-kicker">PROJECTS · PROJECT MANAGEMENT</span><h1>Project tracker</h1><p>RFIs, submittals, change orders, punch lists, NCRs and inspections from your project documents, with who has the ball and when it is due. Open any item to write or answer it in Documents.</p></div>
        <div class="du-head-actions"><label class="pmt-new"><span class="sr-only">New item</span><select id="pmt-new"><option value="">+ New item…</option>${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></label><button type="button" class="du-btn ghost" id="pmt-csv" ${rows.length ? '' : 'disabled'}>Download log (CSV)</button></div></div>
      <div class="pmt-cards">
        <button type="button" class="pmt-card ${f.state === 'open' ? 'on' : ''}" data-st="open"><b>${s.open}</b><span>Open</span></button>
        <button type="button" class="pmt-card warn ${f.state === 'overdue' ? 'on' : ''}" data-st="overdue"><b>${s.overdue}</b><span>Overdue</span></button>
        <div class="pmt-card"><b>${s.soon}</b><span>Due in the next 7 days</span></div>
        <button type="button" class="pmt-card ${f.state === 'closed' ? 'on' : ''}" data-st="closed"><b>${s.closed30}</b><span>Closed in 30 days</span></button>
        <div class="pmt-card"><b>${s.avg == null ? '—' : s.avg}</b><span>Average days to respond</span></div>
        <div class="pmt-card pmt-ball"><span>Ball in court (open)</span>${s.ball.length ? s.ball.map(([b, n]) => `<i>${esc(b)} <b>${n}</b></i>`).join('') : '<i>Nothing open</i>'}</div>
      </div>
      <div class="pmt-filters">
        <select id="pmt-proj"><option value="">All projects</option>${ST.projects.map(p => `<option value="${p.id}" ${f.project === p.id ? 'selected' : ''}>${esc(p.project_name)}</option>`).join('')}</select>
        <select id="pmt-state">${[['all', 'Every state'], ['open', 'Open'], ['overdue', 'Overdue'], ['closed', 'Closed']].map(([k, l]) => `<option value="${k}" ${f.state === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input id="pmt-q" type="search" placeholder="Search number, title, ball in court" value="${esc(f.q)}">
        <div class="pmt-chips"><button type="button" data-kind="" class="${f.kind ? '' : 'on'}">All</button>${kinds.map(k => `<button type="button" data-kind="${k}" class="${f.kind === k ? 'on' : ''}">${esc(KINDS[k].plural)} <small>${all.filter(r => r.kind === k && r.t.state !== 'closed').length}</small></button>`).join('')}</div>
      </div>
      ${rows.length ? `<div class="pmt-table" role="table" aria-label="Tracked items">
        <div class="pmt-tr pmt-th" role="row"><span>No.</span><span>Item</span><span>Tracking</span><span>Ball in court</span><span>Due</span><span>Days open</span></div>
        ${rows.map((r, i) => `<button type="button" class="pmt-tr ${r.overdue ? 'is-late' : ''} ${r.t.state === 'closed' ? 'is-closed' : ''}" role="row" data-row="${i}">
          <span class="pmt-no">${esc(r.number || '—')}</span>
          <span class="pmt-item"><b>${esc(r.title)}</b><small>${esc(r.label)} · ${esc(r.projectName)}${r.t.action ? ' · ' + esc(r.t.action) : ''}${r.t.priority !== 'normal' ? ` · <em class="p-${esc(r.t.priority)}">${esc(r.t.priority)}</em>` : ''}</small></span>
          <span><i class="pmt-pill s-${r.t.state}">${esc(STATE[r.t.state])}</i></span>
          <span>${esc(r.t.ball || '—')}</span>
          <span class="pmt-due">${esc(fmt(r.t.due))}${r.overdue ? '<small>Overdue</small>' : r.t.dueSet ? '' : '<small>Usual turnaround</small>'}</span>
          <span>${r.days}</span></button>`).join('')}
      </div>` : `<article class="du-glass pmt-empty"><h2>${all.length ? 'Nothing matches these filters.' : 'No items to track yet.'}</h2><p class="du-muted">${all.length ? 'Change the filters above.' : 'RFIs, submittals, change orders, punch lists, NCRs and inspections you write in Documents show up here. Start one with "New item".'}</p></article>`}
      <p class="pmt-fine">Due dates you have not set use a usual turnaround for the item type (for example 7 days for an RFI and 14 for a submittal); set the real date from the contract. Tracking is kept on each document and does not change its text or its status.</p>
    </div>`;
    const q = s2 => w.querySelector(s2);
    q('#pmt-proj').onchange = e => { f.project = e.target.value; draw(); };
    q('#pmt-state').onchange = e => { f.state = e.target.value; draw(); };
    q('#pmt-q').oninput = e => { f.q = e.target.value; clearTimeout(ST.qt); ST.qt = setTimeout(() => { draw(); const el = w.querySelector('#pmt-q'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250); };
    w.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { f.kind = b.dataset.kind; draw(); });
    w.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { f.state = f.state === b.dataset.st ? 'all' : b.dataset.st; draw(); });
    w.querySelectorAll('[data-row]').forEach(b => b.onclick = () => panel(ST.rows[+b.dataset.row]));
    q('#pmt-csv').onclick = () => { const blob = new Blob(['﻿' + csv(rows)], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'drawup-project-tracker-' + iso(Date.now()) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
    q('#pmt-new').onchange = e => { const k = e.target.value; if (!k) return; const p = new URLSearchParams({ new: '1', type: k }); if (f.project) p.set('project', f.project); history.replaceState(null, '', '#portal/documents?' + p); window.DrawUpPortal.openPortalTab('documents'); };
  }

  function panel(r) {
    document.getElementById('pmt-panel')?.remove();
    const names = {}; (ST.members || []).forEach(m => { names[m.id] = m.name; });
    const isSub = r.kind === 'submittal_review';
    document.body.insertAdjacentHTML('beforeend', `<div id="pmt-panel" class="pmt-panel" role="dialog" aria-modal="true" aria-label="Track ${esc(r.title)}"><div class="pmt-pcard">
      <button type="button" class="pmt-x" aria-label="Close">×</button>
      <span class="du-kicker">${esc(r.label.toUpperCase())}${r.number ? ' · ' + esc(r.number) : ''}</span><h2>${esc(r.title)}</h2>
      <p class="du-muted">${esc(r.projectName)} · opened ${esc(fmt(r.t.opened))} · document status: ${esc(r.status)}</p>
      <div class="pmt-form">
        <label><span>Tracking</span><select id="pmt-f-state">${STATES.map(([k, l]) => `<option value="${k}" ${r.t.state === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label><span>Ball in court</span><input id="pmt-f-ball" list="pmt-balls" value="${esc(r.t.ball)}" placeholder="Who has to act next"><datalist id="pmt-balls">${BALL.map(b => `<option value="${b}">`).join('')}</datalist></label>
        <label><span>Due</span><input id="pmt-f-due" type="date" value="${esc(r.t.due)}"></label>
        <label><span>Priority</span><select id="pmt-f-pri">${['normal', 'high', 'urgent'].map(k => `<option ${r.t.priority === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        ${isSub ? `<label class="pmt-wide"><span>Submittal action</span><select id="pmt-f-act">${ACTIONS.map(a => `<option value="${esc(a)}" ${r.t.action === a ? 'selected' : ''}>${esc(a || 'Not reviewed yet')}</option>`).join('')}</select></label>` : ''}
        <label class="pmt-wide"><span>Note for the log <small>optional</small></span><textarea id="pmt-f-note" rows="2" placeholder="For example: answered by sketch SK-03, contractor to confirm"></textarea></label>
      </div>
      <div class="pmt-bar"><button type="button" class="du-btn primary" id="pmt-save">Save tracking</button><button type="button" class="du-btn ghost" id="pmt-open">Open the document</button><span class="pmt-st" role="status"></span></div>
      <h3>Log</h3><ol class="pmt-log">${r.t.log.length ? r.t.log.slice().reverse().map(l => `<li><b>${esc(fmt(l.at))}</b> ${esc(l.what || '')}${l.note ? `<q>${esc(l.note)}</q>` : ''}<small>${esc(l.by === ST.c.user.id ? 'You' : names[l.by] || 'A project member')}</small></li>`).join('') : '<li class="du-muted">Nothing recorded yet.</li>'}</ol>
    </div></div>`);
    const P = document.getElementById('pmt-panel'), q = s => P.querySelector(s);
    const close = () => P.remove();
    q('.pmt-x').onclick = close; P.onclick = e => { if (e.target === P) close(); };
    q('#pmt-open').onclick = () => { close(); window.DrawUpDocStudio ? window.DrawUpDocStudio.open({ doc: r.id }) : (location.hash = '#portal/documents?doc=' + r.id); };
    q('#pmt-save').onclick = async () => {
      const st = q('.pmt-st'); st.textContent = 'Saving…';
      try {
        const next = { state: q('#pmt-f-state').value, ball: q('#pmt-f-ball').value.trim().slice(0, 80), due: q('#pmt-f-due').value || r.t.due, priority: q('#pmt-f-pri').value, action: isSub ? q('#pmt-f-act').value : (r.t.action || ''), opened: r.t.opened };
        const saved = await saveTrack(r.id, next, q('#pmt-f-note').value.trim().slice(0, 600));
        if (!saved) { st.textContent = 'Nothing changed.'; return; }
        ST.docs = ST.docs.map(d => d.id === r.id ? Object.assign({}, d, { cover: saved.cover, updated_at: saved.updated_at }) : d);
        close(); draw(); ST.c.toast('Tracking saved.');
      } catch (e) { st.textContent = 'Could not save: ' + (e.message || e); }
    };
  }

  async function render(w, c) {
    const qs = new URLSearchParams((location.hash.split('?')[1]) || '');
    ST = { w, c, docs: [], projects: [], f: { project: qs.get('project') || '', kind: qs.get('kind') || '', state: qs.get('state') || 'open', q: '' } };
    w.innerHTML = '<div class="du-loading">LOADING THE PROJECT TRACKER…</div>';
    try { await load(); }
    catch (e) {
      const missing = /project_documents|42P01|PGRST205/.test((e.message || '') + (e.code || ''));
      w.innerHTML = `<article class="du-glass"><h2>The tracker could not load.</h2><p class="du-muted">${missing ? 'Run the Document Studio SQL (0077) in Supabase first: the tracker reads your project documents.' : esc(e.message || e)}</p></article>`; return;
    }
    draw();
  }
  function open(opts) { const o = opts || {}; const p = new URLSearchParams(); if (o.project) p.set('project', o.project); history.replaceState(null, '', '#portal/tracker' + (p.toString() ? '?' + p : '')); window.DrawUpPortal && window.DrawUpPortal.openPortalTab('tracker'); }

  (function register(n) {
    const P = window.DrawUpPortal; if (!P || !P.registerTab) { if (n < 100) setTimeout(() => register(n + 1), 100); return; }
    P.registerTab('tracker', render);
  })(0);
  window.DrawUpTracker = { open, KINDS, STATES, _trackOf: trackOf, _rows: rowsOf, _summary: summary, _csv: csv, _save: saveTrack, state: () => ST };
})();
