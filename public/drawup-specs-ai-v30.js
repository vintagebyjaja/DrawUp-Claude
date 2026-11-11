/* DrawUp Season 1 · AI specification drafting inside DrawUp Specs (and Document Studio, which uses the same editor).
 *
 * window.DrawUpSpecsAI = { open(S), apply(S, draft, picks), _merge }
 *
 * "Draft with AI" in a specification's top bar. The member asks in plain words; DrawUp sends the request with the
 * project's own values and the manual's section list to /api/specs/draft, and shows what came back before anything
 * changes: the drafted sections, the questions it needs answered, the assumptions it made, the standards it refers to
 * (each marked to be confirmed) and anything DrawUp took out (named manufacturers, code citations, claims).
 * "Add to the manual" adds new sections as Draft, and for a section that is already there it fills only the parts
 * that are empty. Text the member wrote is never replaced. Each drafted section keeps a record of the request, the
 * assumptions and the references, and shows "AI draft: review every line before it is issued".
 */
(function () {
  'use strict';
  if (window.DrawUpSpecsAI) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const Sp = () => window.DrawUpSpecs, X = () => window.DrawUpSpecsExport;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const EXAMPLES = ['Draft the roofing section for a low-slope membrane roof', 'What sections does this building need? Draft the Division 01 summary', 'Draft gypsum board assemblies for the corridor walls', 'Fill in the open section'];

  async function call(S, body) {
    const tok = await S.c.token();
    const r = await fetch('/api/specs/draft', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || ('DrawUp AI could not be reached (' + r.status + ').')); e.final = true; throw e; }
    return j;
  }
  const sectionText = s => [1, 2, 3].map(n => (s.parts[n] || []).map(a => `${n}.${a.title}\n` + (a.paras || []).map(p => '>'.repeat(p.lvl || 0) + p.t).join('\n')).join('\n')).join('\n');
  const isEmpty = arts => !(arts || []).some(a => !a.off && (a.paras || []).some(p => String(p.t || '').trim()));

  /** Adds the picked drafted sections. New numbers become new Draft sections; an existing section only gets the parts
   *  that are empty. Returns { added, filled, kept } so the member is told exactly what changed. */
  function merge(doc, draft, picks, request) {
    const out = { added: [], filled: [], kept: [] };
    const toArts = arts => (arts || []).map(a => ({ id: X().rid(), title: a.title, base_title: '', paras: a.paras.map(p => ({ id: X().rid(), t: p.t, base: '', lvl: p.lvl || 0 })) }));
    const rec = { at: draft.at || new Date().toISOString(), model: draft.model || '', request: String(request || '').slice(0, 600), assumptions: draft.assumptions || [], questions: draft.questions || [], references: draft.references || [], removed: draft.removed || [] };
    (draft.sections || []).forEach((d, i) => {
      if (picks && !picks.includes(i)) return;
      const here = (doc.sections || []).find(s => String(s.number).trim() === d.number && s.state !== 'excluded');
      if (!here) {
        const s = { id: X().rid(), number: d.number, title: d.title, state: 'draft', assigned: null, parts: { 1: toArts(d.parts[1]), 2: toArts(d.parts[2]), 3: toArts(d.parts[3]) }, ai: rec };
        doc.sections.push(s); out.added.push(d.number + ' ' + d.title); return;
      }
      const did = [];
      [1, 2, 3].forEach(n => { if (isEmpty(here.parts[n]) && (d.parts[n] || []).length) { here.parts[n] = toArts(d.parts[n]); did.push('Part ' + n); } });
      if (did.length) { here.ai = Object.assign({}, rec, { parts: did }); out.filled.push(`${here.number} ${here.title} (${did.join(', ')})`); }
      else out.kept.push(`${here.number} ${here.title}`);
    });
    return out;
  }

  function open(S) {
    const doc = S.doc; if (!doc || doc.kind !== 'spec') return;
    const cur = doc.sections.find(s => s.id === S.secId) || null;
    const M = Sp()._modal('Draft with AI', 'DRAWUP SPECS · PRELIMINARY CONTENT', `
      <p class="sp-note">Ask in your own words. DrawUp reads this project's information and the sections already in the manual, then drafts editable sections for you to check. It does not name manufacturers or cite code sections, and anything it was not told comes back as a blank or a choice for you to settle. Nothing changes until you add it.</p>
      <label><span>What should DrawUp draft?</span><textarea class="sp-in" id="sai-req" rows="3" placeholder="For example: draft the roofing section for a low-slope membrane roof over the apartments"></textarea></label>
      <div class="sai-ex">${EXAMPLES.map(e => `<button type="button" class="sai-chip">${esc(e)}</button>`).join('')}</div>
      ${cur ? `<label class="sai-check"><input type="checkbox" id="sai-focus" checked> Use the open section, ${esc(cur.number)} ${esc(cur.title)}, as context</label>` : ''}
      <div class="sp-savebar"><button type="button" class="du-btn primary" id="sai-go">Draft it</button><span class="sp-st" role="status"></span></div>
      <div class="sai-out"></div>`, true);
    M.classList.add('sai');
    const q = s => M.querySelector(s);
    M.querySelectorAll('.sai-chip').forEach(b => b.onclick = () => { q('#sai-req').value = b.textContent; q('#sai-req').focus(); });
    q('#sai-go').onclick = async () => {
      const req = q('#sai-req').value.trim(); const st = q('.sp-st'); const go = q('#sai-go');
      if (req.length < 6) { st.textContent = 'Say what to draft first.'; return; }
      go.disabled = true; st.textContent = 'Reading the project…'; q('.sai-out').innerHTML = '';
      try {
        const pd = doc.project_thread_id ? Sp()._projectData(S, doc.project_thread_id).data : {};
        const focus = cur && q('#sai-focus') && q('#sai-focus').checked ? { number: cur.number, title: cur.title, text: sectionText(cur) } : null;
        let j = await call(S, { action: 'draft', request: req, values: pd, existing: doc.sections.filter(s => s.state !== 'excluded').map(s => ({ number: s.number, title: s.title })), outline: !!doc.outline, focus });
        st.textContent = 'Drafting… this usually takes under a minute.';
        const t0 = Date.now();
        while (j.status === 'running') {
          await sleep(2000); if (!document.body.contains(M)) return;
          j = await call(S, { poll: j.ticket });
          if (j.status === 'running') st.textContent = `Drafting… ${Math.round((Date.now() - t0) / 1000)} s`;
        }
        st.textContent = ''; show(S, M, j.draft, req, focus);
      } catch (e) { st.textContent = e.message || String(e); }
      go.disabled = false;
    };
  }

  function show(S, M, d, req) {
    const out = M.querySelector('.sai-out');
    const list = (h, a, cls) => a && a.length ? `<section class="sai-box ${cls || ''}"><h4>${esc(h)}</h4><ul>${a.map(x => `<li>${typeof x === 'string' ? esc(x) : `<b>${esc(x.designation)}</b> ${esc(x.why)} <i>${esc(x.confirm)}</i>`}</li>`).join('')}</ul></section>` : '';
    const rich = t => esc(t).replace(/\{\{([^}]*)\}\}/g, '<mark class="sai-blank">$1</mark>').replace(/\[\[([^\]]*)\]\]/g, (_m, o) => `<mark class="sai-opt">${o.split('|').join(' / ')}</mark>`).replace(/&lt;&lt;([a-z_]+)&gt;&gt;/g, '<mark class="sai-field">$1</mark>');
    out.innerHTML = `
      ${d.reply ? `<p class="sai-reply">${esc(d.reply)}</p>` : ''}
      ${d.systems && d.systems.length ? `<p class="sp-note"><b>Systems found:</b> ${d.systems.map(esc).join(' · ')}</p>` : ''}
      ${list('Questions to settle', d.questions, 'q')}
      ${list('Assumptions it made', d.assumptions, 'a')}
      ${list('Standards it refers to (confirm each)', d.references, 'r')}
      ${d.removed && d.removed.length ? `<p class="sai-removed"><b>DrawUp took out:</b> ${d.removed.map(esc).join(', ')}. They are blanks now.</p>` : ''}
      ${(d.sections || []).length ? `<section class="sai-secs">${d.sections.map((s, i) => {
        const here = S.doc.sections.find(x => String(x.number).trim() === s.number && x.state !== 'excluded');
        const note = here ? 'Already in the manual: only its empty parts will be filled.' : 'New section, added as Draft.';
        return `<article class="sai-sec"><label class="sai-pick"><input type="checkbox" data-pick="${i}" checked><b>${esc(s.number)} ${esc(s.title)}</b><small>${esc(note)}</small></label>
        ${[1, 2, 3].map(n => (s.parts[n] || []).length ? `<div class="sai-part"><span>PART ${n}</span>${s.parts[n].map(a => `<p class="sai-art">${esc(a.title)}</p>${a.paras.map(p => `<p class="sai-p l${p.lvl}">${rich(p.t)}</p>`).join('')}`).join('')}</div>` : '').join('')}</article>`;
      }).join('')}</section>
      <div class="sp-savebar"><button type="button" class="du-btn primary" id="sai-add">Add to the manual</button><span class="sp-note">Text you wrote is never replaced.</span></div>` : ''}
      <p class="sp-note sai-limits">This is preliminary content for schematic design and DD preparation, drafted by AI from your project's records. It is not a complete or coordinated specification, not a code review and not a product recommendation. The design professional of record checks and completes every section.</p>`;
    const add = out.querySelector('#sai-add');
    if (add) add.onclick = () => {
      const picks = [...out.querySelectorAll('[data-pick]')].filter(x => x.checked).map(x => +x.dataset.pick);
      const r = merge(S.doc, d, picks, req);
      if (!r.added.length && !r.filled.length) { S.c.toast(r.kept.length ? 'Nothing added: those sections already have text in every part.' : 'Pick a section to add.', true); return; }
      const first = S.doc.sections.find(s => s.ai && s.ai.at === d.at); if (first) S.secId = first.id;
      Sp()._dirty(S); Sp()._redraw(S); M.remove();
      S.c.toast([r.added.length ? `Added ${r.added.length} section${r.added.length === 1 ? '' : 's'}` : '', r.filled.length ? `filled empty parts of ${r.filled.length}` : '', r.kept.length ? `left ${r.kept.length} as you wrote ${r.kept.length === 1 ? 'it' : 'them'}` : ''].filter(Boolean).join(', ') + '. Review every line before it is issued.');
    };
  }

  window.DrawUpSpecsAI = { open, apply: (S, d, picks, req) => merge(S.doc, d, picks, req), _merge: merge, _show: show };
})();
