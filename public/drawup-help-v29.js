/* DrawUp v29 Help: free answers to questions about DrawUp itself, with an Open button that goes straight there.
 *
 * The registry and the question matcher are src/lib/drawup-help.ts, bundled as drawup-help-core-v29.js (DrawUpHelpCore),
 * so the browser and the server answer exactly the same way. This file:
 *   - checks every registry destination against the live app (portal tabs, the DrawUp menu in drawup-studio-v26.js,
 *     public pages, loaded tools) and never shows a button that would not open;
 *   - answers before anything is sent to an AI, in Arch Coach (portal tab and public page), the Dashboard ask bar and
 *     DrawUp Search. The AI Team (Teammate, 6th Man, Arch Coach) is answered by the server, which saves the reply in
 *     the conversation; drawup-team-v25.js draws it with cardHtml();
 *   - renders the help card (short answer, menu path, Open button, Free · 0 credits) and runs its buttons;
 *   - adds HQ › Help registry for the founder: route check, statuses, answers, publishing, recent free answers.
 * window.DrawUpHelp = { answer, cardHtml, open, validate, features, refresh, version }
 */
(function () {
  'use strict';
  if (window.DrawUpHelp) return;
  const V = '29.0';
  const C = () => window.DrawUpHelpCore;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const P = () => window.DrawUpPortal;
  const S = () => window.DrawUpStudio;
  const sb = () => P()?.ctx?.()?.client || window.drawupSupabaseClient || null;
  const signedIn = () => !!P()?.isSignedIn?.();
  const isHq = () => document.documentElement.classList.contains('hqx-founder') || !!$('#du-portal [data-portal-tab="hq"]:not([hidden])');
  const toast = (m, bad) => { const t = P()?.ctx?.()?.toast; if (t) t(m, bad); else console[bad ? 'warn' : 'log']('[DrawUp help]', m); };

  /* ------------------------------------------------------------------ registry + HQ overrides */
  let overrides = [], loaded = false;
  async function refresh() {
    const c = sb(); if (!c) return;
    try {
      const { data, error } = await c.from('help_registry').select('feature_id,published').not('published', 'is', null);
      if (!error && Array.isArray(data)) overrides = data.map(r => ({ feature_id: r.feature_id, ...(r.published || {}) }));
    } catch (_e) { /* the v29 SQL is not installed yet: built-in registry only */ }
    loaded = true; checked = null;
  }
  // A Season 1 feature that is still marked as being built opens as live only once the app really has it: its portal tab,
  // its menu item and its code are all loaded (e.g. Portfolio Review: the Portfolio tab, Discover › Portfolio Review and
  // window.DrawUpPortfolio). HQ can still set any status in the Help registry, and a published status always wins.
  const features = () => {
    if (!C()) return [];
    const published = new Set(overrides.filter(o => o.status).map(o => o.feature_id));
    return C().withOverrides(overrides).map(f => f.status === 'building' && f.detect && !published.has(f.id) && shipped(f) ? { ...f, status: 'live', auto_live: true } : f);
  };
  function shipped(f) {
    const tab = f.go?.tab, tabs = portalTabs(), nav = navItems();
    const hasTab = !tab || tabs.includes(tab), hasNav = !f.detect.nav || nav.some(x => x.path[x.path.length - 1].toLowerCase() === f.detect.nav.toLowerCase());
    const hasCode = !f.detect.global || !!window[f.detect.global];
    return tabs.length > 0 && hasTab && hasNav && hasCode;
  }

  /* ------------------------------------------------------------------ route check against the live app */
  const FN = {
    drawItUp: () => typeof window.DrawUpDrawIt?.openInCoach === 'function',
    vdi: () => typeof window.DrawUpVDI?.open === 'function',
    coachCreator: () => typeof window.DrawUpCoach?.open === 'function',
    legends: () => typeof window.DrawUpCoach?.open === 'function' || typeof window.DrawUpLegendBio?.open === 'function',
    signin: () => !!$('#drawup-signin'),
  };
  function portalTabs() { return [...new Set($$('#du-portal [data-portal-tab]').map(b => b.dataset.portalTab))]; }
  function navItems() {
    const n = S()?._nav; if (!n) return [];
    const out = [];
    for (const [side, list] of [['portal', n.PORTAL_NAV || []], ['public', n.PUBLIC_NAV || []]]) for (const sec of list) {
      if (sec.go) out.push({ side, path: [sec.label], go: sec.go });
      for (const col of sec.cols || []) for (const it of col.items || []) out.push({ side, path: [sec.label, it[0]], go: it[1] || {} });
    }
    return out;
  }
  // a menu item that runs code (fn) cannot be compared with a registry route, so it never counts as a match
  const goKey = g => !g || g.fn ? '' : JSON.stringify(Object.keys(g).filter(k => g[k] !== undefined).sort().map(k => [k, g[k]]));
  function checkGo(g, tabs, pages) {
    const problems = [];
    if (!g) return problems;
    if (g.fn) { if (!FN[g.fn]) problems.push(`unknown action "${g.fn}"`); else if (!FN[g.fn]()) problems.push(`the tool for "${g.fn}" is not loaded`); return problems; }
    const tab = g.tab || (g.hash && (/^#portal\/([a-z-]+)/.exec(g.hash) || [])[1]);
    if (g.hash && !/^#portal\/[a-z-]+(\?[\w=&.:-]*)?$/.test(g.hash)) problems.push(`bad link ${g.hash}`);
    if (tab && tabs.length && !tabs.includes(tab)) problems.push(`portal tab "${tab}" does not exist`);
    if (g.page && !pages.has(g.page)) problems.push(`public page "${g.page}" does not exist`);
    if ((g.view || g.prefill) && typeof window.DrawUpTeam?.open !== 'function') problems.push('the AI Team is not loaded');
    if (!tab && !g.page) problems.push('no destination');
    return problems;
  }
  let checked = null;
  /** Checks every feature's destinations against the app as it is loaded right now. */
  function validate(force) {
    if (checked && !force) return checked;
    const tabs = portalTabs();
    const pages = new Set([...$$('section.page[id^="page-"]').map(s => s.id.slice(5)), ...navItems().filter(x => x.go.page).map(x => x.go.page)]);
    const nav = navItems();
    const byFeature = {};
    const list = features();
    for (const f of list) {
      const problems = [...checkGo(f.go, tabs, pages).map(p => 'portal: ' + p), ...(f.publicGo ? checkGo(f.publicGo, tabs, pages).map(p => 'public: ' + p) : [])];
      const keys = [goKey(f.go), goKey(f.publicGo)].filter(Boolean);
      const hits = nav.filter(x => keys.includes(goKey(x.go)));
      const inMenu = hits.find(x => x.path.join(' › ') === f.path.join(' › ')) || hits.sort((a, b) => b.path.length - a.path.length)[0];
      const warn = [];
      // the registry and the menu name the same page differently (members would not find the words we give them)
      if (inMenu && f.path.length && !hits.some(x => x.path[x.path.length - 1] === f.path[f.path.length - 1])) warn.push(`menu calls it ${inMenu.path.join(' › ')}`);
      let detected = false;
      if (f.detect) detected = (!!f.detect.global && !!window[f.detect.global]) || (!!f.detect.nav && nav.some(x => x.path[x.path.length - 1].toLowerCase() === f.detect.nav.toLowerCase()));
      byFeature[f.id] = { ok: !problems.length, problems, warn, menu: inMenu ? inMenu.path : null, detected, tabsKnown: tabs.length > 0 };
    }
    // menu items the registry does not cover yet
    const known = new Set(list.flatMap(f => [goKey(f.go), goKey(f.publicGo)]).filter(Boolean));
    const unregistered = nav.filter(x => !x.go.fn && !x.go.embed && !known.has(goKey(x.go))).map(x => ({ side: x.side, path: x.path, go: x.go }));
    checked = { at: new Date().toISOString(), tabs, byFeature, unregistered, ok: Object.values(byFeature).every(v => v.ok) };
    return checked;
  }

  /* ------------------------------------------------------------------ answering */
  /** The free answer for a question about DrawUp, or null when the question needs the AI. */
  function answer(question, opts = {}) {
    if (!C()) return null;
    const ctx = { signedIn: signedIn(), hq: isHq(), speaker: opts.speaker || (signedIn() ? 'coach' : 'guest'), hasHistory: !!opts.hasHistory, surface: opts.surface || '' };
    const a = C().answerHelp(question, ctx, features());
    return a ? checkAnswer(a) : null;
  }
  // Drops any button whose destination does not resolve in the app right now (never a broken button).
  function checkAnswer(a) {
    const v = validate();
    const fix = o => { const r = v.byFeature[o.id || o.feature]; if (o.go && r && !r.ok && r.tabsKnown !== false) { o.go = null; o.broken = true; } return o; };
    if (a.feature && a.go) fix(a);
    (a.options || []).forEach(fix);
    return a;
  }

  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 15.2a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Zm1.6-5.6c-.8.5-1 .8-1 1.5v.3h-2v-.4c0-1.3.5-2 1.6-2.7.8-.5 1.1-.8 1.1-1.4 0-.7-.6-1.2-1.4-1.2-.9 0-1.5.5-1.6 1.4H8.3C8.4 7.2 9.9 6 12.1 6c2.1 0 3.6 1.2 3.6 2.9 0 1.2-.6 1.9-2.1 2.7Z" fill="currentColor"/></svg>';
  let seq = 0;
  const store = new Map(); // card id -> answer (buttons look their destination up here)
  function statusLabel(s) { return { building: 'Being built · Season 1', season2: 'Season 2', off: 'Turned off', limited: 'Available with limits' }[s] || ''; }
  /** The card for a help answer. opts: { question, ai: label for "Ask the AI instead" (false hides it), again: label for a "search anyway" button } */
  function cardHtml(a, opts = {}) {
    if (!a) return '';
    // an answer saved earlier (AI Team) is redrawn with what the app has right now
    if (a.feature && C()?.answerFor) { const now = C().answerFor(a.feature, { signedIn: signedIn(), hq: isHq(), speaker: '' }, features()); if (now && (now.kind !== a.kind || now.status !== a.status || !!now.go !== !!a.go)) a = { ...now, intro: a.intro, score: a.score }; }
    a = checkAnswer(JSON.parse(JSON.stringify(a)));
    const id = 'duh' + (++seq); store.set(id, { a, q: opts.question || '' });
    const path = a.path?.length ? `<p class="duh-path" aria-label="Where it is">${a.path.map(p => `<span>${esc(p)}</span>`).join('<i aria-hidden="true">›</i>')}</p>` : '';
    const optBtn = (o, i) => `<li class="duh-opt"><div><b>${esc(o.name)}</b>${o.path?.length ? `<small>${esc(o.path.join(' › '))}</small>` : ''}${!o.go ? `<small class="duh-st">${esc(o.broken ? 'Not available right now' : statusLabel(o.status) || 'Not available')}</small>` : ''}</div>${o.go ? `<button type="button" class="duh-btn" data-duh-opt="${i}" data-duh="${id}">${o.go.fn === 'signin' ? 'Sign in to open' : 'Open'}</button>` : ''}</li>`;
    let main = '';
    if (a.kind === 'answer') main = a.go ? `<button type="button" class="duh-btn duh-primary" data-duh-open data-duh="${id}">${esc(a.open_label || 'Open')} <span aria-hidden="true">→</span></button>` : `<p class="duh-note">${esc(a.broken ? 'That page is not available right now, so there is nothing to open. HQ has been shown this in the Help registry.' : 'There is nothing to open from here.')}</p>`;
    const status = a.kind === 'status' ? `<span class="duh-badge duh-wait">${esc(statusLabel(a.status))}</span>` : a.status === 'limited' ? `<span class="duh-badge duh-wait">${esc(statusLabel('limited'))}</span>` : '';
    const intro = a.intro ? `<b class="duh-intro">${esc(a.intro)}</b> ` : '';
    return `<div class="duh-card" id="${id}" data-duh-kind="${esc(a.kind)}" role="group" aria-label="DrawUp help">
      <div class="duh-head"><span class="duh-ico">${ICON}</span><span class="duh-k">DRAWUP HELP</span><span class="duh-badge duh-free" title="Questions about using DrawUp never use credits">Free · 0 credits</span>${status}</div>
      <p class="duh-text">${intro}${esc(a.text)}</p>
      ${a.kind === 'answer' ? path : ''}
      ${a.kind === 'answer' && a.steps?.length ? `<ol class="duh-steps">${a.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
      ${a.options?.length ? `<ul class="duh-opts">${a.options.map(optBtn).join('')}</ul>` : ''}
      ${a.kind === 'answer' && a.uses ? `<p class="duh-uses">Using ${esc(a.name)} itself: ${esc(a.uses)}.</p>` : ''}
      <div class="duh-acts">${main}${opts.again ? `<button type="button" class="duh-btn duh-ghost" data-duh-again data-duh="${id}">${esc(opts.again)}</button>` : ''}${opts.ai !== false && opts.question ? `<button type="button" class="duh-btn duh-ghost" data-duh-ai data-duh="${id}">${esc(opts.ai || 'Ask the AI instead')}</button>` : ''}</div>
    </div>`;
  }

  /* ------------------------------------------------------------------ opening a destination */
  async function exitPortalIfOpen() { if ($('#du-portal.open')) { $('#du-portal [data-du-action="public-home"]')?.click(); await sleep(250); } }
  async function open(go) {
    if (!go) return;
    if (go.fn) {
      if (go.fn === 'signin') { await exitPortalIfOpen(); $('#drawup-signin')?.click(); return; }
      if (!signedIn()) { $('#drawup-signin')?.click(); return; }
      if (go.fn === 'drawItUp') return window.DrawUpDrawIt.openInCoach({});
      if (go.fn === 'vdi') return window.DrawUpVDI.open({});
      if (go.fn === 'coachCreator') return window.DrawUpCoach.open();
      if (go.fn === 'legends') return window.DrawUpCoach?.open ? window.DrawUpCoach.open('legend') : null;
      return;
    }
    if (go.page) { await exitPortalIfOpen(); return S()?.goPublic ? S().goPublic(go.page, go.sub, go.scroll) : (location.hash = '#' + go.page); }
    if (S()?.go) return S().go(go);
    if (go.hash) history.replaceState(null, '', go.hash);
    P()?.openPortalTab?.(go.tab || 'dashboard');
  }
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-duh]'); if (!b) return;
    const rec = store.get(b.dataset.duh); if (!rec) return;
    e.preventDefault();
    if (b.hasAttribute('data-duh-open')) return void open(rec.a.go);
    if (b.dataset.duhOpt != null) return void open(rec.a.options[+b.dataset.duhOpt]?.go);
    if (b.hasAttribute('data-duh-ai')) return void (rec.onAI ? rec.onAI(rec.q) : document.dispatchEvent(new CustomEvent('drawup:help-ai', { detail: { question: rec.q, card: b.dataset.duh } })));
    if (b.hasAttribute('data-duh-again')) return void rec.onAgain?.(rec.q);
  });
  const bindCard = (html, handlers) => { const id = (/id="(duh\d+)"/.exec(html) || [])[1]; const rec = id && store.get(id); if (rec) Object.assign(rec, handlers); return html; };

  async function logAsk(surface, question, a) {
    const c = sb(), u = P()?.ctx?.()?.user; if (!c || !u || !a) return;
    try { await c.from('help_log').insert({ user_id: u.id, surface, question: String(question).slice(0, 300), feature_id: a.feature || null, kind: a.kind }); } catch (_e) { /* optional */ }
  }

  /* ------------------------------------------------------------------ Arch Coach tab (#dc-form) */
  document.addEventListener('submit', e => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.id === 'dc-form') return coachSubmit(e, form);
    if (form.matches('[data-dus-legends-form]')) return dashSubmit(e, form);
    if (form.id === 'du-v19-search') return searchSubmit(e, form);
  }, true);

  function coachSubmit(e, form) {
    if (form.dataset.duhSkip) { delete form.dataset.duhSkip; return; }
    const w = form.closest('#du-workspace-content') || document;
    const inp = $('#dc-input', w), q = inp?.value.trim();
    if (!q || $$('#dc-preview [data-unatt]', w).length) return;           // files attached: a real review
    const box = $('#dc-messages', w);
    const a = answer(q, { surface: 'coach', speaker: 'coach', hasHistory: !!box?.querySelector('article') });
    if (!a) return;
    e.preventDefault(); e.stopImmediatePropagation();
    inp.value = '';
    box?.querySelector('.du-coach-empty')?.remove();
    const html = bindCard(cardHtml(a, { question: q, ai: 'Ask Arch Coach instead (uses credits)' }), {
      onAI: question => { const f = $('#dc-form'); const i = $('#dc-input'); if (!f || !i) return; i.value = question; f.dataset.duhSkip = '1'; f.requestSubmit(); },
    });
    box?.insertAdjacentHTML('beforeend', `<article class="user duh-local"><span>YOU</span><p>${esc(q)}</p></article><article class="assistant duh-local"><span>DRAWUP HELP</span>${html}</article>`);
    if (box) box.scrollTop = box.scrollHeight;
    const st = $('#dc-status', w); if (st) st.textContent = 'Answered free: no credits used.';
    logAsk('coach-tab', q, a);
  }

  /* ------------------------------------------------------------------ Dashboard ask bar (drawup-studio-v26.js) */
  function dashSubmit(e, form) {
    if (form.dataset.duhSkip) { delete form.dataset.duhSkip; return; }
    const inp = $('#dus-legends-input', form) || $('input,textarea', form), q = inp?.value.trim();
    const files = $('[data-dus-legends-files]', form.parentElement || form);
    if (!q || (files && !files.hidden && files.children.length)) return;
    const a = answer(q, { surface: 'dashboard', speaker: 'coach' });
    if (!a) return;
    e.preventDefault(); e.stopImmediatePropagation();
    showPop(form, a, q, {
      onAI: question => { inp.value = question; form.dataset.duhSkip = '1'; closePop(); form.requestSubmit(); },
    });
    logAsk('dashboard', q, a);
  }
  function closePop() { $('#duh-pop')?.remove(); }
  function showPop(anchor, a, q, handlers, opts = {}) {
    closePop();
    const html = bindCard(cardHtml(a, { question: q, ai: opts.ai || 'Ask Arch Coach instead (uses credits)', again: opts.again }), handlers);
    const pop = document.createElement('div'); pop.id = 'duh-pop'; pop.className = 'duh-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'DrawUp help');
    pop.innerHTML = `<button type="button" class="duh-x" aria-label="Close help">×</button>${html}`;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    const width = Math.min(460, vw - 32), left = Math.max(16, Math.min(r.left + r.width / 2 - width / 2, vw - width - 16));
    pop.style.width = width + 'px'; pop.style.left = left + 'px';
    const below = r.bottom + 10, h = pop.offsetHeight;
    pop.style.top = (below + h < innerHeight - 8 ? below : Math.max(8, r.top - h - 10)) + 'px';
    pop.querySelector('.duh-x').onclick = closePop;
    pop.addEventListener('click', ev => { if (ev.target.closest('[data-duh-open],[data-duh-opt]')) setTimeout(closePop, 0); });
    setTimeout(() => document.addEventListener('pointerdown', function off(ev) { if (!pop.contains(ev.target)) { closePop(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
    pop.querySelector('.duh-btn')?.focus({ preventScroll: true });
  }
  addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
  addEventListener('resize', closePop);

  /* ------------------------------------------------------------------ DrawUp Search (portal tab + public search band) */
  function searchSubmit(e, form) {
    if (form.dataset.duhSkip) { delete form.dataset.duhSkip; return; }
    const qi = $('#du-v19-q', form.parentElement || document) || $('input', form), q = qi?.value.trim();
    if (!q) return;
    const a = answer(q, { surface: 'search', speaker: '' });
    if (!a) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const out = $('#du-v19-results') || form.parentElement;
    const html = bindCard(cardHtml(a, { question: q, ai: false, again: 'Search DrawUp for this anyway' }), {
      onAgain: () => { form.dataset.duhSkip = '1'; out.innerHTML = ''; form.requestSubmit(); },
    });
    out.innerHTML = `<div class="duh-search">${html}</div>`;
    logAsk('search', q, a);
  }
  // Public search band (signed out): Enter or the Search button
  function publicSearch(e) {
    const inp = $('#drawup-search-input'); const q = inp?.value.trim();
    if (!q || inp.dataset.duhSkip) { if (inp) delete inp.dataset.duhSkip; return; }
    const a = answer(q, { surface: 'search-public', speaker: '' }); if (!a) return;
    e.preventDefault(); e.stopImmediatePropagation();
    showPop($('#drawup-search-box') || inp, a, q, { onAgain: () => { inp.dataset.duhSkip = '1'; closePop(); $('#drawup-search-button')?.click(); } }, { again: 'Search DrawUp for this anyway' });
  }
  document.addEventListener('click', e => { if (e.target.closest?.('#drawup-search-button')) publicSearch(e); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.target?.id === 'drawup-search-input') publicSearch(e); }, true);
  // the header search (drawup-nav-v28.js) uses the same search; signed out it goes straight to the public search
  function wrapSearch() {
    const DS = window.DrawUpSearch; if (!DS || DS.__duh) return;
    const run = DS.run;
    DS.run = async (q, kind) => {
      if (!signedIn()) { const a = answer(q, { surface: 'search-public', speaker: '' }); if (a) { const anchor = $('.dus-top input[type=search],header input[type=search]') || $('#drawup-search-box') || document.body; showPop(anchor, a, q, { onAgain: () => { closePop(); run(q, kind); } }, { again: 'Search DrawUp for this anyway' }); return true; } }
      return run(q, kind);
    };
    DS.__duh = true;
  }

  /* ------------------------------------------------------------------ public Arch Coach page (guest questions) */
  function guestCoach(e) {
    const inp = $('#arch-coach-input'), q = inp?.value.trim();
    if (!q || inp.dataset.duhSkip) { if (inp) delete inp.dataset.duhSkip; return; }
    const box = $('#arch-coach-messages');
    const a = answer(q, { surface: 'coach-public', speaker: signedIn() ? 'coach' : 'guest', hasHistory: !!box?.querySelector('.bubble.user') });
    if (!a) return;
    e.preventDefault(); e.stopImmediatePropagation();
    inp.value = '';
    const html = bindCard(cardHtml(a, { question: q, ai: 'Ask Arch Coach instead' }), {
      onAI: question => { inp.value = question; inp.dataset.duhSkip = '1'; $('#arch-coach-send')?.click(); },
    });
    box?.insertAdjacentHTML('beforeend', `<div class="bubble user"><span class="who">You</span>${esc(q)}</div><div class="bubble coach duh-bubble"><span class="who">DrawUp Help</span>${html}</div>`);
    if (box) box.scrollTop = box.scrollHeight;
    const st = $('#arch-coach-status'); if (st) st.textContent = 'Answered free: no guest question or credits used.';
  }
  document.addEventListener('click', e => { if (e.target.closest?.('#arch-coach-send')) guestCoach(e); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target?.id === 'arch-coach-input') guestCoach(e); }, true);

  /* ------------------------------------------------------------------ HQ › Help registry (founder) */
  const PANE = 'help-registry';
  const pane = () => new URLSearchParams(location.hash.split('?')[1] || '').get('pane') || '';
  function hqTab() {
    const tabs = $('#du-workspace-content .du-hq-tabs'); if (!tabs || !isHq()) return;
    if (!tabs.querySelector('[data-duh-pane]')) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'hqx-tab'; b.dataset.duhPane = PANE; b.textContent = 'Help registry';
      b.onclick = () => { history.replaceState(null, '', '#portal/hq?pane=' + PANE); P()?.openPortalTab?.('hq'); };
      tabs.appendChild(b);
    }
    const body = $('#hq-body');
    if (pane() === PANE && body && !body.querySelector('.duh-hq')) {
      tabs.querySelectorAll('[data-hq-pane],.hqx-tab').forEach(x => x.classList.toggle('active', x.dataset.duhPane === PANE));
      renderHq(body);
    }
  }
  let hqState = { filter: '', edit: null };
  async function renderHq(body) {
    body.innerHTML = '<article class="du-glass duh-hq"><p>Checking every destination…</p></article>';
    await refresh();
    const v = validate(true), list = features(), c = sb();
    let drafts = {}, log = [], schema = true;
    try { const r = await c.from('help_registry').select('*'); if (r.error) throw r.error; (r.data || []).forEach(x => { drafts[x.feature_id] = x; }); } catch (_e) { schema = false; }
    try { const r = await c.from('help_log').select('created_at,surface,question,feature_id,kind').order('created_at', { ascending: false }).limit(40); if (!r.error) log = r.data || []; } catch (_e) { /* */ }
    const counts = list.reduce((m, f) => (m[f.status] = (m[f.status] || 0) + 1, m), {});
    const bad = list.filter(f => !v.byFeature[f.id].ok && (f.status === 'live' || f.status === 'limited')), shipped = list.filter(f => f.status !== 'live' && v.byFeature[f.id].detected);
    const F = hqState.filter.toLowerCase();
    const rows = list.filter(f => !F || (f.name + ' ' + f.id + ' ' + f.path.join(' ') + ' ' + f.aliases.join(' ')).toLowerCase().includes(F));
    const builtIn = id => C().featureById(id);
    body.innerHTML = `<article class="du-glass duh-hq">
      <div class="duh-hq-head"><div><span class="hqx-kick">FOUNDER ONLY</span><h2>Help registry</h2>
        <p class="duh-muted">Every free help answer in Arch Coach, Teammate, 6th Man, the Dashboard and DrawUp Search comes from this list. Destinations are checked against the real menu and portal tabs each time this page opens. Changes are drafts until you publish; published changes reach every assistant within a minute.</p></div>
        <button type="button" class="du-btn ghost" data-duh-recheck>Run the route check again</button></div>
      ${schema ? '' : '<p class="duh-warn">Run the v29 SQL (v29-01) in Supabase to save and publish changes. Until then the built-in registry is used and the route check still runs.</p>'}
      <div class="duh-hq-stats">
        <span><b>${list.length}</b> features</span><span><b>${counts.live || 0}</b> live</span><span><b>${counts.limited || 0}</b> limited</span><span><b>${(counts.building || 0) + (counts.season2 || 0)}</b> not open yet</span>
        <span class="${bad.length ? 'duh-bad' : 'duh-good'}"><b>${bad.length ? bad.length + ' route problem' + (bad.length > 1 ? 's' : '') : 'All routes open'}</b></span><span><b>${v.tabs.length}</b> portal tabs found</span></div>
      ${shipped.length ? `<div class="duh-hq-box duh-hq-new"><b>Shipped since the registry was written</b>${shipped.map(f => `<p>${esc(f.name)} now appears in the app (${esc(f.detect.nav || f.detect.global)}). Check it, then set it to Live and publish.</p>`).join('')}</div>` : ''}
      ${bad.length ? `<div class="duh-hq-box duh-hq-bad"><b>Destinations that do not open</b> <small>(members see the answer without an Open button until this is fixed)</small>${bad.map(f => `<p>${esc(f.name)}: ${esc(v.byFeature[f.id].problems.join('; '))}</p>`).join('')}</div>` : ''}
      ${v.unregistered.length ? `<details class="duh-hq-box"><summary><b>${v.unregistered.length} menu item${v.unregistered.length > 1 ? 's' : ''} without their own help answer</b> (they are still found through the section they belong to)</summary>${v.unregistered.map(x => `<p>${esc(x.side)} menu: ${esc(x.path.join(' › '))}</p>`).join('')}</details>` : ''}
      <div class="duh-hq-try"><label>Try a question <input type="text" data-duh-try placeholder="Where do I find my CheckUp reports?"></label><div data-duh-try-out></div></div>
      <label class="duh-hq-filter">Filter <input type="search" data-duh-filter value="${esc(hqState.filter)}" placeholder="Name, path or phrase"></label>
      <div class="duh-hq-list">${rows.map(f => {
        const r = v.byFeature[f.id], d = drafts[f.id], draft = d?.draft || {}, editing = hqState.edit === f.id;
        const changed = d && JSON.stringify(d.draft || {}) !== JSON.stringify(d.published || {});
        return `<div class="duh-hq-row ${editing ? 'is-open' : ''}" data-row="${esc(f.id)}">
          <div class="duh-hq-main"><div><b>${esc(f.name)}</b> <small>${esc(f.id)}</small><p>${esc(f.path.join(' › ') || 'Several places: ' + (f.options || []).join(', '))}</p></div>
            <span class="duh-pill s-${esc(f.status)}">${esc(f.status)}</span><span class="duh-pill">${esc(f.access)}</span>
            <span class="duh-pill ${r.ok ? 'ok' : 'bad'}" title="${esc([...r.problems, ...r.warn].join('; '))}">${r.ok ? (r.warn.length ? '✓ opens · note' : '✓ opens') : '✗ ' + esc(r.problems[0])}</span>
            ${d?.published ? '<span class="duh-pill">published change</span>' : ''}${changed ? '<span class="duh-pill warn">draft</span>' : ''}
            <button type="button" class="du-btn ghost" data-duh-edit="${esc(f.id)}">${editing ? 'Close' : 'Edit'}</button></div>
          ${editing ? `<div class="duh-hq-edit">
            <p class="duh-muted">${esc(builtIn(f.id)?.desc || '')}</p>
            ${r.warn.length ? `<p class="duh-muted">Note: ${esc(r.warn.join('; '))}</p>` : ''}
            <label>Status <select data-k="status">${['live', 'limited', 'building', 'season2', 'off'].map(s => `<option ${((draft.status || f.status) === s) ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
            <label>Answer text (empty = built-in) <textarea data-k="answer" maxlength="600" rows="2">${esc(draft.answer || '')}</textarea></label>
            <label>Status note (shown when not live, or with limits) <textarea data-k="note" maxlength="600" rows="2">${esc(draft.note ?? '')}</textarea></label>
            <label>Extra phrases members use (comma separated) <input data-k="aliases" value="${esc((draft.aliases || []).join(', '))}"></label>
            <label class="duh-check"><input type="checkbox" data-k="hidden" ${draft.hidden ? 'checked' : ''}> Hide from help answers</label>
            <p class="duh-muted">Route: <code>${esc(JSON.stringify(f.go || f.publicGo || {}))}</code>. Routes come from the code and cannot be changed here, so a published answer can only point at a real page.</p>
            <div class="duh-acts"><button type="button" class="du-btn ghost" data-duh-save="${esc(f.id)}" ${schema ? '' : 'disabled'}>Save draft</button><button type="button" class="du-btn primary" data-duh-pub="${esc(f.id)}" ${schema ? '' : 'disabled'}>Check route and publish</button>${d?.published ? `<button type="button" class="du-btn ghost" data-duh-reset="${esc(f.id)}">Back to built-in</button>` : ''}</div>
            <p class="duh-msg" data-duh-msg></p></div>` : ''}
        </div>`; }).join('')}</div>
      <h3>Recent free answers</h3>
      <div class="duh-hq-log">${log.map(x => `<p><small>${esc(new Date(x.created_at).toLocaleString())} · ${esc(x.surface)}</small> “${esc(x.question)}” → <b>${esc(x.feature_id || x.kind)}</b></p>`).join('') || '<p class="duh-muted">None yet.</p>'}</div>
    </article>`;
    const root = body.querySelector('.duh-hq');
    root.querySelector('[data-duh-recheck]').onclick = () => renderHq(body);
    const fi = root.querySelector('[data-duh-filter]'); fi.oninput = () => { hqState.filter = fi.value; clearTimeout(fi._t); fi._t = setTimeout(() => renderHq(body).then(() => { const n = $('#hq-body [data-duh-filter]'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }), 350); };
    const tr = root.querySelector('[data-duh-try]'), to = root.querySelector('[data-duh-try-out]');
    tr.onkeydown = e => { if (e.key !== 'Enter') return; e.preventDefault(); const a = answer(tr.value, { surface: 'hq-test', speaker: 'coach' }); to.innerHTML = a ? `<p class="duh-muted">Matched ${esc(a.feature || a.kind)} (score ${a.score}). No AI call.</p>` + cardHtml(a, { ai: false }) : '<p class="duh-muted">No free answer: this question goes to the AI (and uses credits).</p>'; };
    root.querySelectorAll('[data-duh-edit]').forEach(b => b.onclick = () => { hqState.edit = hqState.edit === b.dataset.duhEdit ? null : b.dataset.duhEdit; renderHq(body); });
    const read = row => {
      const o = {}; row.querySelectorAll('[data-k]').forEach(el => { const k = el.dataset.k; if (k === 'hidden') { if (el.checked) o.hidden = true; } else if (k === 'aliases') { const a = el.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 30); if (a.length) o.aliases = a; } else if (el.value.trim()) o[k] = el.value.trim(); });
      return o;
    };
    const save = async (id, publish) => {
      const row = root.querySelector(`[data-row="${CSS.escape(id)}"]`), msg = row.querySelector('[data-duh-msg]'), draft = read(row);
      const f = C().featureById(id);
      let validation = null, published;
      if (publish) {
        const r = validate(true).byFeature[id];
        const status = draft.status || f.status;
        if ((status === 'live' || status === 'limited') && !r.ok) { msg.textContent = 'Not published: ' + r.problems.join('; ') + '. Members would get a button that does not open.'; msg.className = 'duh-msg duh-bad'; return; }
        validation = { ok: r.ok, problems: r.problems, warn: r.warn, menu: r.menu, tabs: v.tabs.length, checked_at: new Date().toISOString(), registry: C().REGISTRY_VERSION };
        published = draft;
      }
      const row0 = { feature_id: id, draft, ...(publish ? { published, validation } : {}) };
      const { error } = await c.from('help_registry').upsert(row0, { onConflict: 'feature_id' });
      if (error) { msg.textContent = error.message; msg.className = 'duh-msg duh-bad'; return; }
      toast(publish ? 'Published. Every assistant uses it within a minute.' : 'Draft saved.');
      await renderHq(body);
    };
    root.querySelectorAll('[data-duh-save]').forEach(b => b.onclick = () => save(b.dataset.duhSave, false));
    root.querySelectorAll('[data-duh-pub]').forEach(b => b.onclick = () => save(b.dataset.duhPub, true));
    root.querySelectorAll('[data-duh-reset]').forEach(b => b.onclick = async () => { const { error } = await c.from('help_registry').delete().eq('feature_id', b.dataset.duhReset); if (error) toast(error.message, true); else { toast('Back to the built-in answer.'); renderHq(body); } });
  }

  /* ------------------------------------------------------------------ boot */
  let queued = false;
  const mo = new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; wrapSearch(); if ($('#du-workspace-content .du-hq-tabs')) hqTab(); }); });
  function boot() {
    if (!C()) { console.warn('[DrawUp help] drawup-help-core-v29.js did not load; help answers are off and every question goes to the AI as before.'); return; }
    mo.observe(document.body, { childList: true, subtree: true });
    wrapSearch();
    (async () => { for (let i = 0; i < 40 && !sb(); i++) await sleep(250); await refresh(); })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  addEventListener('hashchange', () => { checked = null; });

  window.DrawUpHelp = { answer, cardHtml, open, validate, features, refresh, version: V, isLoaded: () => loaded };
})();
