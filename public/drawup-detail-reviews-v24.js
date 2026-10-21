/* DrawUp V24 Detail reviews: "Verified by an architect" + comments on every detail in the Details library.
 * - Each card shows its status: Verified by an architect (as drawn, or only for stated conditions) and a comment
 *   count split into correct / only works in certain situations / incorrect. One RPC per screen (detail_review_summary).
 * - The detail viewer and a "Reviews" button on each card open the review panel: architect verifications,
 *   comments with a verdict and the situations it does or does not work for, and the comment form.
 * - Architects add their license (state + number); DrawUp HQ approves it before they can verify (SQL v24-03/04/06).
 * - HQ sees "Architect license requests" at the top of the Details tab.
 * Keys: typical:<catalog id>, find:<detail_finds id>, upload:<details id>. Works on the Portal tab and the public page.
 */
(function () {
  'use strict';
  if (window.DrawUpDetailReviews) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sb = () => window.drawupSupabaseClient;
  const VERDICT = { correct: ['Correct as drawn', 'ok'], conditional: ['Only works in certain situations', 'cond'], incorrect: ['Incorrect / needs a fix', 'bad'], question: ['Question', 'q'], note: ['Note', 'q'] };
  const summaries = new Map();
  let me = null, arch = null, admin = false, missing = false, meLoaded = null;
  function toast(m, bad) { let t = document.getElementById('du-toast'); if (!t) { t = document.createElement('div'); t.id = 'du-toast'; t.className = 'du-toast'; document.body.appendChild(t); } t.textContent = m; t.dataset.state = bad ? 'bad' : 'good'; t.classList.add('open'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('open'), bad ? 6000 : 2600); }
  const keyOfCard = c => { const k = c.dataset.kind, id = c.dataset.id; return k && id && /^(typical|find|upload)$/.test(k) ? k + ':' + id : ''; };
  const needSql = e => /detail_comments|detail_verifications|detail_review_summary|architect_credentials|schema cache|does not exist|PGRST20/i.test(String(e?.message || e));

  async function loadMe(force) {
    if (meLoaded && !force) return meLoaded;
    meLoaded = (async () => {
      const c = sb(); if (!c) return;
      const u = await c.auth.getSession().then(x => x.data.session?.user || null, () => null);
      me = u && !u.is_anonymous ? u : null; arch = null; admin = false;
      if (!me) return;
      const [a, h] = await Promise.all([c.from('architect_credentials').select('*').eq('user_id', me.id).maybeSingle().then(x => x, e => ({ error: e })), c.rpc('is_drawup_admin').then(x => x.data === true, () => false)]);
      if (a.error && needSql(a.error)) missing = true; arch = a.data || null; admin = h;
    })();
    return meLoaded;
  }

  /* ---------------------------------------------------------------- card badges */
  let pend = new Set(), timer = 0;
  function queue(keys) { keys.forEach(k => { if (k && !summaries.has(k)) pend.add(k); }); clearTimeout(timer); timer = setTimeout(flush, 150); }
  async function flush() {
    const keys = [...pend]; pend = new Set(); if (!keys.length || !sb()) return paintAll();
    for (let i = 0; i < keys.length; i += 400) {
      const { data, error } = await sb().rpc('detail_review_summary', { p_keys: keys.slice(i, i + 400) });
      if (error) { if (needSql(error)) missing = true; keys.forEach(k => summaries.set(k, null)); continue; }
      keys.slice(i, i + 400).forEach(k => summaries.set(k, { comments: 0, verified: 0 }));
      (data || []).forEach(r => summaries.set(r.detail_key, r));
    }
    paintAll();
  }
  function badge(sm) {
    if (!sm) return '';
    const v = sm.verified > 0 ? `<span class="dr24-ver${sm.verified_with_conditions === sm.verified ? ' cond' : ''}" title="${esc((sm.verified_by || []).join(', '))}">✓ Verified by ${sm.verified === 1 ? 'an architect' : sm.verified + ' architects'}${sm.verified_with_conditions === sm.verified ? ' · for stated conditions' : ''}</span>` : '<span class="dr24-unver">Not verified by an architect yet</span>';
    const c = sm.comments ? `<span class="dr24-cnt">${sm.comments} comment${sm.comments === 1 ? '' : 's'}${sm.correct ? ` · ${sm.correct} correct` : ''}${sm.conditional ? ` · ${sm.conditional} situational` : ''}${sm.incorrect ? ` · ${sm.incorrect} needs fix` : ''}</span>` : '';
    return v + c;
  }
  function paintCard(card) {
    const key = keyOfCard(card); if (!key) return;
    let row = card.querySelector('.dr24-row');
    if (!row) { const body = card.querySelector('.dd21-body') || card; body.insertAdjacentHTML('beforeend', `<div class="dr24-row"><div class="dr24-badges"></div><button type="button" class="dr24-open">Reviews + comments</button></div>`); row = card.querySelector('.dr24-row'); row.querySelector('.dr24-open').onclick = e => { e.stopPropagation(); openPanel(key, card.querySelector('h3')?.textContent || 'Detail'); }; }
    if (!summaries.has(key)) { queue([key]); return; }
    row.querySelector('.dr24-badges').innerHTML = missing ? '' : badge(summaries.get(key));
  }
  function paintAll() { document.querySelectorAll('.dd21-card[data-kind]').forEach(paintCard); document.querySelectorAll('.dd21-vside[data-detail-key]').forEach(v => mountInViewer(v)); }

  /* ---------------------------------------------------------------- review panel */
  async function panelHtml(key) {
    await loadMe();
    const c = sb();
    const [vs, cs] = await Promise.all([
      c.from('detail_verifications').select('id,architect_id,architect_name,license_state,scope,conditions,note,created_at').eq('detail_key', key).order('created_at'),
      c.from('detail_comments').select('id,user_id,verdict,conditions,body,hidden,created_at,profiles(display_name,username)').eq('detail_key', key).order('created_at')]);
    if (vs.error || cs.error) { const e = vs.error || cs.error; return needSql(e) ? '<p class="dr24-note">Run the v24 SQL (detail reviews) in Supabase to turn on verification and comments.</p>' : `<p class="dr24-note">Reviews could not load: ${esc(e.message)}</p>`; }
    const mineV = me && (vs.data || []).find(v => v.architect_id === me.id);
    const archOk = arch?.status === 'approved';
    let h = `<section class="dr24-sec"><h4>Verified by an architect</h4>`;
    h += (vs.data || []).length ? `<ul class="dr24-vlist">${vs.data.map(v => `<li><b>✓ ${esc(v.architect_name || 'Architect')}${v.license_state ? ' · licensed in ' + esc(v.license_state) : ''}</b><span>${v.scope === 'with_conditions' ? 'Verified only for: ' + esc(v.conditions) : 'Verified as drawn'} · ${esc(new Date(v.created_at).toLocaleDateString())}</span>${v.note ? `<small>${esc(v.note)}</small>` : ''}${me && (v.architect_id === me.id || admin) ? `<button type="button" data-unverify="${esc(v.id)}">${v.architect_id === me.id ? 'Withdraw my verification' : 'Remove (HQ)'}</button>` : ''}</li>`).join('')}</ul>` : '<p class="dr24-note">No architect has verified this detail yet. DrawUp typical details are learning content until a licensed architect verifies them.</p>';
    if (me && archOk && !mineV) h += `<form class="dr24-form" data-verify><label>Verify this detail <select name="scope"><option value="as_drawn">As drawn</option><option value="with_conditions">Only for certain conditions</option></select></label><label class="dr24-condl" hidden>Conditions it works for <input name="conditions" maxlength="1000" placeholder="Example: wood frame, climate zones 3-5, slab on grade"></label><label>Note (optional) <input name="note" maxlength="500"></label><button class="du-btn primary" type="submit">Verify as ${esc(arch.full_name)}</button></form>`;
    else if (me && !arch) h += `<details class="dr24-lic"><summary>Are you a licensed architect? Add your license to verify details.</summary><form class="dr24-form" data-license><label>Full name on license <input name="full_name" required maxlength="120"></label><label>State / jurisdiction <input name="license_state" required maxlength="40" placeholder="VA"></label><label>License number <input name="license_number" required maxlength="60"></label><button class="du-btn ghost" type="submit">Submit for DrawUp review</button><p class="dr24-note">DrawUp checks the license with the state board before you can verify details.</p></form></details>`;
    else if (me && arch && !archOk) h += `<p class="dr24-note">Your architect license (${esc(arch.license_state)} ${esc(arch.license_number)}) is ${arch.status === 'rejected' ? 'not approved' + (arch.note ? ': ' + esc(arch.note) : '') : 'waiting for DrawUp review'}.</p>`;
    h += `</section><section class="dr24-sec"><h4>Comments <small>${(cs.data || []).filter(x => !x.hidden).length}</small></h4>`;
    h += (cs.data || []).length ? `<ul class="dr24-clist">${cs.data.map(x => { const v = VERDICT[x.verdict] || VERDICT.note; const who = x.profiles?.display_name || (x.profiles?.username ? '@' + x.profiles.username : 'DrawUp member'); return `<li class="${x.hidden ? 'dr24-hidden' : ''}"><span class="dr24-pill ${v[1]}">${esc(v[0])}</span>${x.conditions ? `<b>${x.verdict === 'incorrect' ? 'Fails when' : 'Works when'}: ${esc(x.conditions)}</b>` : ''}<p>${esc(x.body)}</p><small>${esc(who)} · ${esc(new Date(x.created_at).toLocaleDateString())}${x.hidden ? ' · hidden' : ''}</small>${me && (x.user_id === me.id || admin) ? `<span class="dr24-cacts">${x.user_id === me.id ? `<button type="button" data-cdel="${esc(x.id)}">Delete</button>` : ''}${admin ? `<button type="button" data-chide="${esc(x.id)}" data-to="${x.hidden ? 'false' : 'true'}">${x.hidden ? 'Unhide' : 'Hide'} (HQ)</button>` : ''}</span>` : ''}</li>`; }).join('')}</ul>` : '<p class="dr24-note">No comments yet. Is this detail right? Does it only work in certain situations? Say so here.</p>';
    h += me ? `<form class="dr24-form" data-comment><label>Your take <select name="verdict"><option value="correct">Correct as drawn</option><option value="conditional" selected>Only works in certain situations</option><option value="incorrect">Incorrect / needs a fix</option><option value="question">Question</option><option value="note">Note</option></select></label><label class="dr24-condc">Situations <input name="conditions" maxlength="1000" placeholder="Example: only with a 2 ft overhang; not for high-wind zones"></label><label class="wide">Comment <textarea name="body" rows="3" required maxlength="4000" placeholder="What is right or wrong, and why?"></textarea></label><button class="du-btn primary" type="submit">Post comment</button></form>` : '<p class="dr24-note">Sign in to comment.</p>';
    return h + '</section>';
  }
  function bindPanel(root, key, reload) {
    const c = sb(), $ = s => root.querySelector(s);
    const vf = $('[data-verify]'); if (vf) { const sc = vf.elements.scope, cl = vf.querySelector('.dr24-condl'); sc.onchange = () => { cl.hidden = sc.value !== 'with_conditions'; }; vf.onsubmit = async e => { e.preventDefault(); const { error } = await c.from('detail_verifications').insert({ detail_key: key, architect_id: me.id, scope: sc.value, conditions: vf.elements.conditions.value.trim() || null, note: vf.elements.note.value.trim() || null }); if (error) return toast(error.message, true); toast('Verified. Thank you.'); summaries.delete(key); reload(); }; }
    const lf = $('[data-license]'); if (lf) lf.onsubmit = async e => { e.preventDefault(); const f = lf.elements; const { error } = await c.from('architect_credentials').upsert({ user_id: me.id, full_name: f.full_name.value.trim(), license_state: f.license_state.value.trim(), license_number: f.license_number.value.trim() }); if (error) return toast(error.message, true); toast('License sent to DrawUp for review.'); await loadMe(true); reload(); };
    const cf = $('[data-comment]'); if (cf) { const vsel = cf.elements.verdict, cc = cf.querySelector('.dr24-condc'); const sync = () => { cc.hidden = !['conditional', 'incorrect', 'correct'].includes(vsel.value); }; vsel.onchange = sync; sync(); cf.onsubmit = async e => { e.preventDefault(); const body = cf.elements.body.value.trim(); if (!body) return; const btn = cf.querySelector('button[type=submit]'); btn.disabled = true; const { error } = await c.from('detail_comments').insert({ detail_key: key, user_id: me.id, verdict: vsel.value, conditions: cc.hidden ? null : (cf.elements.conditions.value.trim() || null), body }); btn.disabled = false; if (error) return toast(error.message, true); toast('Comment posted.'); summaries.delete(key); reload(); }; }
    root.querySelectorAll('[data-unverify]').forEach(b => b.onclick = async () => { if (!confirm('Remove this verification?')) return; const { error } = await c.from('detail_verifications').delete().eq('id', b.dataset.unverify); if (error) return toast(error.message, true); summaries.delete(key); reload(); });
    root.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => { if (!confirm('Delete your comment?')) return; const { error } = await c.from('detail_comments').delete().eq('id', b.dataset.cdel); if (error) return toast(error.message, true); summaries.delete(key); reload(); });
    root.querySelectorAll('[data-chide]').forEach(b => b.onclick = async () => { const { error } = await c.from('detail_comments').update({ hidden: b.dataset.to === 'true', updated_at: new Date().toISOString() }).eq('id', b.dataset.chide); if (error) return toast(error.message, true); summaries.delete(key); reload(); });
  }
  async function fill(host, key) {
    host.innerHTML = '<p class="dr24-note">Loading reviews…</p>';
    const reload = async () => { host.innerHTML = await panelHtml(key); bindPanel(host, key, reload); queue([key]); };
    try { await reload(); } catch (e) { host.innerHTML = `<p class="dr24-note">Reviews could not load: ${esc(e.message || e)}</p>`; }
  }
  function mountInViewer(side) {
    if (side.querySelector('.dr24-panel')) return;
    const key = side.dataset.detailKey; side.insertAdjacentHTML('beforeend', '<div class="dr24-panel"></div>'); fill(side.querySelector('.dr24-panel'), key);
  }
  function openPanel(key, title) {
    if (/^(typical|find):/.test(key)) { const card = document.querySelector(`.dd21-card[data-kind="${key.split(':')[0]}"][data-id="${CSS.escape(key.split(':')[1])}"]`); const open = card?.querySelector('[data-open],[data-open-find]'); if (open) { open.click(); setTimeout(() => document.querySelector('#dd21-view .dr24-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120); return; } }
    document.getElementById('dd21-view')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div id="dd21-view" class="dd21-view" role="dialog" aria-modal="true" aria-label="Reviews"><div class="dd21-vcard dd21-narrow"><button type="button" class="dd21-x" aria-label="Close">×</button><aside class="dd21-vside"><span class="dd21-kick">DETAIL REVIEWS</span><h2>${esc(title)}</h2><div class="dr24-panel"></div></aside></div></div>`);
    const v = document.getElementById('dd21-view'), close = () => v.remove();
    v.querySelector('.dd21-x').onclick = close; v.onclick = e => { if (e.target === v) close(); };
    fill(v.querySelector('.dr24-panel'), key); v.querySelector('.dd21-x').focus();
  }

  /* ---------------------------------------------------------------- HQ: architect license requests */
  async function hqPanel() {
    const host = document.querySelector('#du-workspace-content .dd21-head, #du-workspace-content #dd21-results'); if (!host || document.querySelector('.dr24-hq')) return;
    await loadMe(); if (!admin || missing) return;
    const { data, error } = await sb().from('architect_credentials').select('*,profiles(display_name,username)').eq('status', 'pending').order('created_at');
    if (error || !(data || []).length || document.querySelector('.dr24-hq')) return;
    host.insertAdjacentHTML('beforebegin', `<section class="dr24-hq"><h3>Architect license requests <small>${data.length}</small></h3><p class="dr24-note">Check each license with the state board, then approve. Approved architects can mark details "Verified by an architect".</p><ul>${data.map(r => `<li><b>${esc(r.full_name)}</b> <span>${esc(r.license_state)} #${esc(r.license_number)} · ${esc(r.profiles?.display_name || r.profiles?.username || '')}</span><span class="dr24-cacts"><button type="button" data-arch="${esc(r.user_id)}" data-to="approved">Approve</button><button type="button" data-arch="${esc(r.user_id)}" data-to="rejected">Reject</button></span></li>`).join('')}</ul></section>`);
    document.querySelectorAll('.dr24-hq [data-arch]').forEach(b => b.onclick = async () => { const note = b.dataset.to === 'rejected' ? prompt('Reason (shown to the member):', 'License could not be confirmed with the state board.') : null; const { error: e } = await sb().from('architect_credentials').update({ status: b.dataset.to, note }).eq('user_id', b.dataset.arch); if (e) return toast(e.message, true); toast(b.dataset.to === 'approved' ? 'Approved.' : 'Rejected.'); b.closest('li').remove(); });
  }

  let raf = 0;
  new MutationObserver(() => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (document.querySelector('.dd21-card[data-kind]:not(:has(.dr24-row)), .dd21-vside[data-detail-key]:not(:has(.dr24-panel))')) { loadMe().then(paintAll); } if (document.querySelector('#du-workspace-content #dd21-results')) hqPanel(); }); }).observe(document.documentElement, { childList: true, subtree: true });
  window.DrawUpDetailReviews = { openPanel, refresh: () => { summaries.clear(); paintAll(); } };
})();
