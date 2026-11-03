/* DrawUp Season 1 · Document Studio (Portal › Projects › Documents, #portal/documents).
 *
 * window.DrawUpDocStudio = { open(opts), newDocument(o), versions(doc) }
 *
 * The professional document workspace: create, open, edit, save, duplicate and export letters, memos, reports,
 * minutes, RFIs, submittal reviews, QA/QC and PM documents, design narratives and outline specifications.
 * It does NOT rebuild the editor: it opens the DrawUp Specs editor (drawup-specs-v29.js) on the member's own
 * store (project_documents, SQL 0077) instead of the firm's, and adds what Season 1 asked for on top:
 *   - page setup per document: US Letter, Legal and A4, portrait or landscape, margins (PDF, Word and preview)
 *   - linked project fields from Project Information (project_profiles), never copied-in text: when a project
 *     value changes, the document says so and the member chooses to update
 *   - autosave and version history, with restore
 *   - import of PDF and Word files: the original file is kept and the readable text comes in as editable blocks
 *   - PDF and editable DOCX export (DrawUp Specs export), letterheads and firm formats
 * The firm's presentation builder and DrawUp Specs are untouched; firm documents stay where they are and are
 * listed here too, opening in the firm store.
 */
(function () {
  'use strict';
  if (window.DrawUpDocStudio) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const day = d => d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const stamp = d => d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const BUCKET = 'drawup-private';
  const TABLE = 'project_documents';
  const VERSION_GAP_MS = 60 * 1000;
  const PAGE_SIZES = [['letter', 'US Letter (8.5 × 11 in.)'], ['legal', 'Legal (8.5 × 14 in.)'], ['a4', 'A4 (210 × 297 mm)']];
  const sqlMissing = e => e && (/project_documents|document_versions|document_imports/.test(e.message || '') || e.code === '42P01' || e.code === 'PGRST205');
  let ST = null;

  const Specs = () => window.DrawUpSpecs;
  // the hub's group chips, as the menu names them
  const GROUP_OF = { PM: 'PM', pm: 'PM', CA: 'CA', ca: 'CA', CM: 'CM', cm: 'CM', qaqc: 'QA/QC', 'qa-qc': 'QA/QC', specs: 'Specs' };
  const Data = () => window.DrawUpSpecsData;
  const Xp = () => window.DrawUpSpecsExport;

  /* ------------------------------------------------------------------ versions */
  async function snapshot(c, doc, label) {
    const store = doc.owner_id ? 'project' : 'firm';
    const rec = { store, document_id: doc.id, owner_id: c.user.id, firm_id: store === 'firm' ? doc.firm_id : null, label: label || null, title: doc.title, doc_type: doc.doc_type,
      fields: doc.kind === 'spec' ? { outline: !!doc.outline } : { list: doc.fields, heading: doc.heading }, cover: { data: doc.data || {} }, sections: doc.kind === 'spec' ? doc.sections : doc.blocks };
    const r = await c.client.from('document_versions').insert(rec).select('id,created_at').single();
    if (r.error) { if (!sqlMissing(r.error)) console.warn('Document Studio version', r.error.message); return null; }
    return r.data;
  }
  async function listVersions(c, doc) {
    const r = await c.client.from('document_versions').select('id,label,title,created_at,created_by').eq('document_id', doc.id).order('created_at', { ascending: false }).limit(50);
    return r.error ? [] : (r.data || []);
  }
  async function versionsModal(doc, S) {
    const c = S.c, M = Specs()._modal('Version history', 'DOCUMENT STUDIO', '<div class="dds-vlist">Loading…</div>', true);
    const list = await listVersions(c, doc); const box = M.querySelector('.dds-vlist');
    box.innerHTML = `<p class="sp-note">A version is kept each time the document is saved (at most one a minute), plus the ones you name. Restoring brings the old text back as a new change, so nothing is lost.</p>
      <div class="dds-vbar"><input class="sp-in" id="dds-vlabel" placeholder="Name this version, for example “Issued for review”"><button type="button" class="du-btn ghost" id="dds-vsave">Save a named version</button></div>
      ${list.length ? `<ul class="dds-vl">${list.map(v => `<li><div><b>${esc(v.label || 'Autosave')}</b><small>${esc(stamp(v.created_at))}</small></div><button type="button" class="du-btn ghost" data-restore="${v.id}">Restore</button></li>`).join('')}</ul>` : '<p class="du-muted">No versions yet. One is kept the next time this document is saved.</p>'}`;
    box.querySelector('#dds-vsave').onclick = async () => { const label = box.querySelector('#dds-vlabel').value.trim() || 'Named version'; const v = await snapshot(c, doc, label); S.c.toast(v ? 'Version saved.' : 'Version not saved (run the Document Studio SQL).', !v); M.remove(); };
    box.querySelectorAll('[data-restore]').forEach(b => b.onclick = async () => {
      if (!confirm('Restore this version? The current text is saved as a version first, so you can go back.')) return;
      await snapshot(c, doc, 'Before restore');
      const r = await c.client.from('document_versions').select('*').eq('id', b.dataset.restore).single();
      if (r.error) { S.c.toast('That version could not be loaded.', true); return; }
      const v = r.data;
      if (doc.kind === 'spec') doc.sections = Array.isArray(v.sections) ? v.sections : [];
      else { doc.blocks = Array.isArray(v.sections) ? v.sections : []; doc.fields = (v.fields && v.fields.list) || doc.fields; doc.heading = (v.fields && v.fields.heading) || doc.heading; }
      doc.title = v.title || doc.title; doc.data = (v.cover && v.cover.data) || doc.data;
      M.remove(); Specs()._openEditor(S, doc); Specs()._dirty(S); S.c.toast('Version restored. Save keeps it.');
    });
  }

  /* ------------------------------------------------------------------ page setup */
  function pageModal(doc, S) {
    const fmtName = (Xp().fixFormat(((S.formats || []).find(f => f.id === doc.format_id) || {}).settings));
    const cur = (doc.data && doc.data.page) || {};
    const m = cur.margins || fmtName.margins;
    const M = Specs()._modal('Page setup', 'DOCUMENT STUDIO', `<div class="sp-grid2">
      <label><span>Page size</span><select class="sp-in" id="dds-size">${PAGE_SIZES.map(([k, l]) => `<option value="${k}" ${(cur.page || fmtName.page) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label><span>Orientation</span><select class="sp-in" id="dds-orient"><option value="portrait" ${(cur.orientation || fmtName.orientation) !== 'landscape' ? 'selected' : ''}>Portrait</option><option value="landscape" ${(cur.orientation || fmtName.orientation) === 'landscape' ? 'selected' : ''}>Landscape</option></select></label></div>
      <div class="sp-grid2 dds-marg">${[['t', 'Top'], ['r', 'Right'], ['b', 'Bottom'], ['l', 'Left']].map(([k, l]) => `<label><span>${l} margin (in.)</span><input class="sp-in" type="number" step="0.05" min="0.25" max="2.5" id="dds-m-${k}" value="${m[k]}"></label>`).join('')}</div>
      <p class="sp-note">This page setup belongs to this document and is used for the preview, the PDF and the Word file. The format's own page setup is used when you clear it.</p>
      <div class="sp-savebar"><button type="button" class="du-btn primary" id="dds-page-go">Apply</button><button type="button" class="du-btn ghost" id="dds-page-clear">Use the format's page setup</button></div>`);
    const apply = (val) => { doc.data = doc.data || {}; if (val) doc.data.page = val; else delete doc.data.page; M.remove(); Specs()._dirty(S); Specs()._openEditor(S, doc); };
    M.querySelector('#dds-page-go').onclick = () => apply({ page: M.querySelector('#dds-size').value, orientation: M.querySelector('#dds-orient').value, margins: Object.fromEntries(['t', 'r', 'b', 'l'].map(k => [k, Math.min(2.5, Math.max(0.25, parseFloat(M.querySelector('#dds-m-' + k).value) || 1))])) });
    M.querySelector('#dds-page-clear').onclick = () => apply(null);
  }

  /* ------------------------------------------------------------------ import PDF / DOCX */
  function importModal(S, afterCreate) {
    const X = Xp();
    const M = Specs()._modal('Import a document', 'PDF OR WORD', `<p class="sp-note">DrawUp keeps your original file and opens the text it can read as an editable document. Headings, paragraphs and simple lists come across. Columns, tables drawn as lines, scanned pages and exact page layout do not: check the result against the original before you send it. For a specification section, use Import inside a project manual instead.</p>
      <label class="du-btn ghost sp-file">Choose a .pdf or .docx file<input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden></label>
      <div class="dds-imp"></div>`);
    M.querySelector('input').onchange = async e => {
      const f = e.target.files[0]; if (!f) return; const out = M.querySelector('.dds-imp'); out.innerHTML = '<p class="sp-note">Reading…</p>';
      try {
        if (f.size > 40 * 1024 * 1024) throw new Error('That file is over 40 MB.');
        const bytes = new Uint8Array(await f.arrayBuffer());
        const isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
        const lines = isPdf ? await X.readPdfText(bytes) : await X.readDocxText(bytes);
        if (!lines || !lines.length) throw new Error(isPdf ? 'No text could be read from this PDF. A scanned PDF has no text layer; it is kept as a file you can attach.' : 'No text could be read from this Word file.');
        const blocks = blocksFromLines(lines);
        out.innerHTML = `<p class="sp-note"><b>${esc(f.name)}</b>: ${lines.length} line${lines.length === 1 ? '' : 's'} read, ${blocks.length} block${blocks.length === 1 ? '' : 's'}.</p>
          <label><span>Title</span><input class="sp-in" id="dds-ititle" value="${esc(f.name.replace(/\.\w+$/, ''))}"></label>
          <div class="sp-savebar"><button type="button" class="du-btn primary" id="dds-igo">Open as an editable document</button><span class="sp-st"></span></div>`;
        out.querySelector('#dds-igo').onclick = async () => {
          const st = out.querySelector('.sp-st'); st.textContent = 'Creating…';
          try {
            const path = `${S.c.user.id}/documents/${uuid()}-${f.name.replace(/[^\w.\-]+/g, '-').slice(-80)}`;
            const up = await S.c.client.storage.from(BUCKET).upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
            if (up.error) throw up.error;
            await S.c.client.from('document_imports').insert({ owner_id: S.c.user.id, store: 'project', file_name: f.name, mime_type: f.type, size_bytes: f.size, storage_path: path, extracted: true, note: isPdf ? 'PDF text layer' : 'Word text' }).then(r => { if (r.error && !sqlMissing(r.error)) console.warn(r.error.message); });
            const doc = await Specs()._createDoc(S, { type: 'narrative', title: out.querySelector('#dds-ititle').value.trim() || f.name, source: 'import', blocks });
            doc.data = Object.assign({}, doc.data, { import: { path, name: f.name, at: new Date().toISOString() } });
            M.remove(); afterCreate(doc);
          } catch (er) { st.textContent = 'Not created: ' + (er.message || er); }
        };
      } catch (er) { out.innerHTML = `<p class="sp-bad">${esc(er.message || er)}</p>`; }
    };
  }
  /** Lines of text -> editor blocks: a short line in capitals or a numbered heading starts a block. */
  function blocksFromLines(lines) {
    const X = Xp(); const out = []; let cur = null;
    const isHead = t => t.length <= 90 && (/^[0-9]+(\.[0-9]+)*\s+\S/.test(t) || (t === t.toUpperCase() && /[A-Z]/.test(t) && t.length > 2) || /^(PART|SECTION|SUBJECT|RE:)\b/i.test(t));
    for (const raw of lines) {
      const t = String((raw && raw.text != null ? raw.text : raw) || '').replace(/\s+/g, ' ').trim(); if (!t) { if (cur) cur.p += '\n'; continue; }
      if (isHead(t)) { cur = { id: X.rid(), h: t, p: '' }; out.push(cur); continue; }
      if (!cur) { cur = { id: X.rid(), h: '', p: '' }; out.push(cur); }
      cur.p += (cur.p && !cur.p.endsWith('\n') ? ' ' : '') + t;
    }
    out.forEach(b => { b.p = b.p.replace(/\n{3,}/g, '\n\n').trim(); });
    return out.length ? out.slice(0, 400) : [{ id: X.rid(), h: '', p: lines.map(l => (l && l.text != null ? l.text : l)).join('\n').slice(0, 20000) }];
  }

  /* ------------------------------------------------------------------ linked project fields that changed */
  async function changedFields(c, doc) {
    // Values the document uses that changed in Project Information since the document was last saved.
    if (!doc.project_thread_id || !doc.updated_at) return [];
    const used = usedKeys(doc); if (!used.length) return [];
    const r = await c.client.from('project_profile_changes').select('key,old_value,new_value,changed_at').eq('project_thread_id', doc.project_thread_id).order('changed_at', { ascending: false }).limit(50);
    if (r.error) return [];
    const seen = new Set(); const out = [];
    (r.data || []).forEach(x => { if (seen.has(x.key) || !used.includes(x.key)) return; if (new Date(x.changed_at) <= new Date(doc.data?.fields_seen_at || doc.created_at || 0)) return; seen.add(x.key); out.push(x); });
    return out;
  }
  function usedKeys(doc) {
    const X = Xp(); const keys = new Set();
    const scan = t => X.tokens(String(t || '')).forEach(k => { if (k.t === 'data') keys.add(k.key); });
    if (doc.kind === 'spec') (doc.sections || []).forEach(s => [1, 2, 3].forEach(n => (s.parts[n] || []).forEach(a => (a.paras || []).forEach(p => scan(p.t)))));
    else { (doc.fields || []).forEach(f => scan(f.v)); (doc.blocks || []).forEach(b => { if (b.table) b.table.rows.forEach(r => r.forEach(scan)); else scan(b.p); }); }
    return [...keys];
  }

  /* ------------------------------------------------------------------ the Specs editor, with Document Studio hooks */
  function hooks() {
    let lastVersionAt = 0;
    return {
      topHTML: () => '<button class="du-btn ghost" type="button" data-dds="page">Page setup</button><button class="du-btn ghost" type="button" data-dds="versions">Versions</button>',
      bindTop: (b, doc, S) => {
        b.querySelector('[data-dds="page"]').onclick = () => pageModal(doc, S);
        b.querySelector('[data-dds="versions"]').onclick = () => versionsModal(doc, S);
          changedFields(S.c, doc).then(list => { if (!list.length || S.doc !== doc) return; showChanged(b, doc, S, list); }).catch(() => null);
      },
      menuItems: doc => [['dds-versions', 'Version history'], ['dds-page', 'Page setup'], ...(doc.data && doc.data.import ? [['dds-orig', 'Open the original file']] : [])],
      menuPick: async (k, doc, S) => {
        if (k === 'dds-versions') { versionsModal(doc, S); return true; }
        if (k === 'dds-page') { pageModal(doc, S); return true; }
        if (k === 'dds-orig') { const r = await S.c.client.storage.from(BUCKET).createSignedUrl(doc.data.import.path, 600); if (r.data && r.data.signedUrl) window.open(r.data.signedUrl, '_blank', 'noopener'); else S.c.toast('The original file could not be opened.', true); return true; }
        return false;
      },
      afterSave: async (doc, S) => { const now = Date.now(); if (now - lastVersionAt < VERSION_GAP_MS) return; lastVersionAt = now; await snapshot(S.c, doc, null); },
    };
  }
  function showChanged(b, doc, S, list) {
    const host = b.querySelector('.sp-conflict'); if (!host) return;
    host.hidden = false;
    host.innerHTML = `<b>Project information changed.</b> ${list.map(x => `<span class="dds-ch">${esc(window.DrawUpIntelCore?.FIELD_LABEL[x.key] || x.key)}: “${esc(x.old_value || 'not set')}” → “${esc(x.new_value || 'not set')}”</span>`).join('')}
      <button class="du-btn ghost" type="button" data-dds-upd>Use the new values</button><button class="du-btn ghost" type="button" data-dds-keep>Keep this document as it is</button>`;
    host.querySelector('[data-dds-upd]').onclick = async () => {
      if (S.intel) delete S.intel[doc.project_thread_id];
      await Specs()._intelFor(S, doc.project_thread_id).catch(() => null);
      doc.data = Object.assign({}, doc.data, { fields_seen_at: new Date().toISOString() });
      host.hidden = true; Specs()._dirty(S); Specs()._openEditor(S, doc);
      S.c.toast('Linked project values updated. Text you typed is untouched.');
    };
    host.querySelector('[data-dds-keep]').onclick = () => { doc.data = Object.assign({}, doc.data, { fields_seen_at: new Date().toISOString() }); Specs()._dirty(S); host.hidden = true; };
  }

  /* ------------------------------------------------------------------ the tab */
  async function render(w, c) {
    const q = new URLSearchParams((location.hash.split('?')[1]) || '');
    ST = { w, c, project: q.get('project') || '', openId: q.get('doc') || '', group: q.get('group') || '', start: q.get('new') === '1' };
    w.innerHTML = '<div class="du-loading">LOADING DOCUMENTS…</div>';
    if (!window.DrawUpSpecs || !window.DrawUpSpecsData) { w.innerHTML = '<article class="du-glass"><h2>Document Studio could not load.</h2><p class="du-muted">The DrawUp Specs files are missing from this build.</p></article>'; return; }
    const host = document.createElement('div'); host.className = 'dds-host';
    w.innerHTML = ''; w.appendChild(host);
    await Specs().mount(host, c, { id: null, name: (c.profile && (c.profile.display_name || c.profile.username)) || 'You' }, {
      scope: { kind: 'personal', table: TABLE },
      hooks: hooks(),
      onState: S => {
        ST.S = S; window.__ddsS = S; // the open workspace, for tests and the console
        // Projects > Project Management and Firm > Document Templates open this tab with a group or the picker
        if (ST.group) S.filter.group = GROUP_OF[ST.group] || ST.group;
        if (ST.project) S.filter.project = ST.project;
      },
    }).catch(e => { host.innerHTML = `<article class="du-glass"><h2>Documents could not open.</h2><p class="du-muted">${esc(e.message || e)}</p></article>`; });
    decorate(host);
    if (ST.start && ST.S) { ST.start = false; Specs()._newDocModal(ST.S, { project: ST.project || '' }); }
  }
  /** Document Studio's own wording and buttons on the hub the Specs app rendered. */
  function decorate(host) {
    const apply = () => {
      const head = host.querySelector('.sp-head'); if (!head || head.dataset.dds) return;
      head.dataset.dds = '1';
      const k = head.querySelector('.du-kicker'), h = head.querySelector('h2'), p = head.querySelector('p');
      if (k) k.textContent = 'PROJECTS · DOCUMENT STUDIO';
      if (h) h.textContent = 'Documents';
      if (p) p.textContent = 'Letters, memos, reports, meeting minutes, RFIs, QA/QC and project management documents, outline specifications and project manuals. Project values come in as linked fields, and every document exports to PDF and editable Word.';
      const acts = head.querySelector('.fk-actions');
      if (acts && !acts.querySelector('[data-dds-import]')) acts.insertAdjacentHTML('afterbegin', '<button class="du-btn ghost" type="button" data-dds-import>Import a PDF or Word file</button>');
      const btn = acts && acts.querySelector('[data-dds-import]');
      if (btn) btn.onclick = () => { const S = ST && ST.S; if (S) importModal(S, doc => Specs()._openEditor(S, doc)); };
    };
    new MutationObserver(apply).observe(host, { childList: true, subtree: true }); apply();
  }

  function open(opts) {
    const P = window.DrawUpPortal; if (!P) return;
    const o = opts || {}; const q = new URLSearchParams();
    if (o.project) q.set('project', o.project); if (o.doc) q.set('doc', o.doc);
    history.replaceState(null, '', '#portal/documents' + (q.toString() ? '?' + q : ''));
    P.openPortalTab('documents');
  }
  function register(n) {
    const P = window.DrawUpPortal; if (!P || !P.registerTab) { if ((n || 0) < 100) setTimeout(() => register((n || 0) + 1), 100); return; }
    P.registerTab('documents', (w, c) => render(w, c));
  }
  window.DrawUpDocStudio = { open, state: () => ST && ST.S, snapshot, listVersions, _blocksFromLines: blocksFromLines, _usedKeys: usedKeys, _hooks: hooks, _importModal: importModal, _pageModal: pageModal };
  register(0);
})();
