/* DrawUp v31 "Dream Beyond" dashboard + light Portal header.
 *
 * Loaded after drawup-studio-v26.js. It replaces only the Dashboard tab renderer (DrawUpPortal.registerTab,
 * last registration wins) and restyles the Studio Portal header (#dus-pnav) in drawup-dreambeyond-v31.css.
 * Every button goes to something that already exists in DrawUp; nothing here shows sample data.
 *
 *  - Recent Projects: the member's own project_threads with the Studio covers (DrawUpStudio.loadProjects/cover).
 *  - Arch Coach panel: the member's own Arch Coach look (DrawUpCoach); questions are handed to the real Arch Coach
 *    tab form (#dc-new, #dc-input, #dc-form), so its personality, credits and access checks stay exactly as they are.
 *  - Quick Tools: Draw Studio entry points (window.DrawUpDrawStudio.start/openRecent, built in the Draw Studio
 *    branch) when present, otherwise the current Draw tab, the member's latest drawing, Swap materials, templates.
 *  - Platform Status: credits (arch_coach_credit_accounts), active projects and drawings (counts), and a live
 *    check of the DrawUp API and database. Storage is not shown: DrawUp has no storage quota to measure against.
 *
 * window.DrawUpDreamBeyond = { render, go, version }
 */
(function () {
  'use strict';
  if (window.DrawUpDreamBeyond) return;
  const V = '31.0';
  const ART = '/drawup-dreambeyond-v31/';
  const root = document.documentElement;
  root.classList.add('db');
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const P = () => window.DrawUpPortal;
  const S = () => window.DrawUpStudio;
  const sb = () => P()?.ctx?.()?.client || window.drawupSupabaseClient;
  const T = (tab, extra) => ({ tab, ...extra });
  async function waitFor(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(120); } return null; }
  async function uid() { try { return (await sb()?.auth.getSession())?.data?.session?.user?.id || null; } catch (_e) { return null; } }

  /* ------------------------------------------------------------------ icons (24px, 1.6 stroke) */
  const I = {
    home: '<path d="M4 11.2 12 4.5l8 6.7"/><path d="M6 10v9.5h4.5v-5.5h3v5.5H18V10"/>',
    dash: '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>',
    cube: '<path d="m12 3.5 7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z"/><path d="m4.5 7.7 7.5 4.3 7.5-4.3M12 12v8.5"/>',
    team: '<path d="M12 4.5 14 9l4.8.5-3.6 3.2 1 4.8L12 15l-4.2 2.5 1-4.8-3.6-3.2L10 9z"/>',
    pen: '<path d="M5 19.5 6 15 15.5 5.5a2.1 2.1 0 0 1 3 3L9 18z"/><path d="m14 7 3 3"/>',
    check: '<path d="m12 3.5 7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z"/><path d="m8.8 12.2 2.2 2.2 4.2-4.6"/>',
    swap: '<path d="M5 8.5h11.5M13.5 5.5l3 3-3 3"/><path d="M19 15.5H7.5M10.5 12.5l-3 3 3 3"/>',
    discover: '<circle cx="12" cy="12" r="8"/><path d="m15.3 8.7-1.9 4.7-4.7 1.9 1.9-4.7z"/>',
    connect: '<path d="M5 6.5h14v9H10l-5 3.5z"/><path d="M9 11h6"/>',
    firm: '<circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c.7-3.8 3.3-6 6.5-6s5.8 2.2 6.5 6"/>',
    folder: '<path d="M3.8 7.2h6l1.7 2h8.7v9.6H3.8z"/>',
    template: '<path d="m12 3.6 7.6 4.2-7.6 4.3-7.6-4.3z"/><path d="m4.4 12 7.6 4.3 7.6-4.3M4.4 16.2l7.6 4.3 7.6-4.3"/>',
    library: '<rect x="4.5" y="4" width="15" height="16.5" rx="2"/><path d="M8.5 4v16.5M11.5 9h5M11.5 12.5h5"/>',
    material: '<path d="M12 3.5 20 8l-8 4.5L4 8z"/><path d="M4 12.2 12 16.7l8-4.5"/><path d="M4 16.2 12 20.7l8-4.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6"/><circle cx="12" cy="16.8" r=".6" fill="currentColor"/>',
    upload: '<path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9"/><path d="M5 15v4.5h14V15"/>',
    download: '<path d="M12 4.5v11M7.5 11 12 15.5 16.5 11"/><path d="M5 15v4.5h14V15"/>',
    spark: '<path d="M12 3 13.9 10.1 21 12l-7.1 1.9L12 21l-1.9-7.1L3 12l7.1-1.9z"/>',
    send: '<path d="M4.5 12 19.5 5l-4 14.5-3.5-6z"/><path d="m12 13.5 7.5-8.5"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    play: '<circle cx="12" cy="12" r="8.5"/><path d="M10.2 8.8v6.4l5-3.2z" fill="currentColor"/>',
    dots: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
    villa: '<path d="M3.5 11 12 4.5l8.5 6.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5V14h4v5.5"/>',
    cloud: '<path d="M7 18.5a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 9a3.75 3.75 0 0 1 .5 7.5"/><path d="M12 12v7M9.5 14.5 12 12l2.5 2.5"/>',
    history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9"/><path d="M12 8v4.2l2.8 1.8"/>',
    bulb: '<path d="M9 17.5h6M10 20.5h4"/><path d="M12 3.5a5.5 5.5 0 0 0-3.2 10c.7.5 1.2 1.3 1.2 2.2V16h4v-.3c0-.9.5-1.7 1.2-2.2A5.5 5.5 0 0 0 12 3.5z"/>',
    clip: '<path d="M8 12.5 14.5 6a3 3 0 0 1 4.2 4.2l-7.8 7.8a5 5 0 0 1-7-7L11 3.9"/>',
    bars: '<path d="M5 19.5V13M10 19.5V8.5M15 19.5V11M20 19.5V5"/>',
    collapse: '<path d="M15 6 9 12l6 6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    bolt: '<path d="M13 3 5.5 13.5H11L10 21l8-10.5h-5.5z"/>'
  };
  const ico = (k, cls = 'db-ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[k] || ''}</svg>`;
  const SIGNATURE = '<div class="db-signature" role="contentinfo"><i aria-hidden="true"></i><span>A Dream Beyond Platform</span><i aria-hidden="true"></i></div>';

  /* ------------------------------------------------------------------ navigation helpers */
  const go = (a, opts) => S()?.go ? S().go(a, opts) : (P()?.openPortalTab?.(a.tab));
  const hasStudio = () => !!(window.DrawUpDrawStudio && typeof window.DrawUpDrawStudio.start === 'function');
  function drawStart(kind) {
    // Draw Studio (its own branch) exposes the two-option start. Until it is merged this opens the Draw tab as it is today.
    if (hasStudio()) { go(T('draw'), { section: 'draw' }); setTimeout(() => window.DrawUpDrawStudio.start(kind), 60); return; }
    go(T('draw', kind === 'image' ? { click: '#dn29-pic' } : {}));
  }
  async function latestDrawing() {
    const c = sb(), me = await uid(); if (!c || !me) return null;
    const { data } = await c.from('drawings').select('id,name,updated_at').eq('owner_id', me).order('updated_at', { ascending: false }).limit(1);
    return (data && data[0]) || null;
  }
  async function openRecentDrawing(view) {
    if (window.DrawUpDrawStudio && typeof window.DrawUpDrawStudio.openRecent === 'function') { go(T('draw'), { section: 'draw' }); setTimeout(() => window.DrawUpDrawStudio.openRecent({ view }), 60); return; }
    const d = await latestDrawing().catch(() => null);
    if (!d) { toast(view === '3d' ? 'You have no drawings yet. Start one with New Draw, then open it in 3D.' : 'You have no drawings yet. Start one with New Draw, then export it.'); drawStart('choose'); return; }
    await go(T('draw', { hash: '#portal/draw?id=' + d.id }), { section: 'draw' });
    // Use the editor's own buttons once they are on the page, so the editor does exactly what a click does.
    if (view === '3d') { const b = await waitFor(() => $('#du-workspace-content [data-view29]') && $('#du-workspace-content #dw29-3d') ? $('#du-workspace-content [data-view29]') : null, 9000); b?.click(); }
    if (view === 'export') { const b = await waitFor(() => $('#du-workspace-content #dw29-exp'), 9000); if (b) { b.scrollIntoView({ block: 'center' }); b.click(); } }
  }
  function toast(msg) {
    $('#db-toast')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div id="db-toast" class="db-toast" role="status">${ico('spark')}<span>${esc(msg)}</span></div>`);
    setTimeout(() => $('#db-toast')?.classList.add('is-out'), 4200); setTimeout(() => $('#db-toast')?.remove(), 4700);
  }

  /* Templates: the starting points DrawUp really has today. */
  const TEMPLATES = [
    ['folder', 'Starter learning project', 'Learn DrawUp in three steps on a real example building.', T('projects', { openStarter: true })],
    ['pen', 'Example floor plan', 'Open the sample plan in Draw and edit it with the drafting tools.', T('draw', { click: 'Open example plan' })],
    ['library', 'Spec and document formats', 'DrawUp Specs: the DrawUp standard, your firm standard or a client format.', T('firm', { hash: '#portal/firm?pane=specs' })]
  ];
  function openSheet(title, kicker, bodyHTML, bind) {
    $('#db-sheet')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div id="db-sheet" class="db-modal" role="dialog" aria-modal="true" aria-labelledby="db-sheet-h"><div class="db-modal__card"><button type="button" class="db-modal__x" aria-label="Close">${ico('close')}</button><span class="db-kicker">${esc(kicker)}</span><h2 id="db-sheet-h">${esc(title)}</h2>${bodyHTML}</div></div>`);
    const m = $('#db-sheet'); const close = () => m.remove();
    m.querySelector('.db-modal__x').onclick = close; m.addEventListener('click', e => { if (e.target === m) close(); });
    m.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    m.addEventListener('click', e => { const b = e.target.closest('[data-db-go]'); if (!b) return; close(); let a = null; try { a = JSON.parse(b.dataset.dbGo); } catch (_e) {} if (a) go(a); });
    bind && bind(m, close);
    setTimeout(() => m.querySelector('button:not(.db-modal__x)')?.focus(), 20);
  }
  function openTemplates() {
    openSheet('Start from a template', 'Templates', `<p class="db-muted">These are the starting points DrawUp has today. More project templates will appear here as they are added.</p><div class="db-list">${TEMPLATES.map(t => `<button type="button" class="db-listitem" data-db-go='${esc(JSON.stringify(t[3]))}'><i>${ico(t[0])}</i><span><b>${esc(t[1])}</b><small>${esc(t[2])}</small></span>${ico('chev')}</button>`).join('')}</div>`);
  }

  /* Dashboard sidebar: shortcuts only. The top bar stays the main navigation. */
  const SIDE = [
    ['home', 'Home', 'Back to the top of your dashboard', { fn: 'home' }],
    ['cube', 'My Projects', 'All your projects', T('projects')],
    ['template', 'Templates', 'Starting points', { fn: 'templates' }],
    ['library', 'Library', 'The Locker Room: everything you saved', T('ai-team', { view: 'locker' })],
    ['material', 'Materials', 'Change materials on a picture with Swap', T('swap', { click: 'Materials' })],
    ['gear', 'Settings', 'Account, subscription and credits', T('account')],
    ['help', 'Support', 'Ask how to do anything in DrawUp, free', { fn: 'support' }]
  ];
  /* Quick Tools */
  const TOOLS = [
    ['upload', 'Import File', 'import'],
    ['pen', 'New Draw', 'new'],
    ['cube', '3D View', '3d'],
    ['dash', 'Templates', 'templates'],
    ['material', 'Materials', 'materials'],
    ['download', 'Export', 'export']
  ];
  function runTool(k) {
    if (k === 'import') return drawStart('import');
    if (k === 'new') return drawStart('choose');
    if (k === '3d') return openRecentDrawing('3d');
    if (k === 'export') return openRecentDrawing('export');
    if (k === 'templates') return openTemplates();
    if (k === 'materials') return go(T('swap', { click: 'Materials' }));
  }

  /* ------------------------------------------------------------------ Arch Coach (the existing implementation) */
  const AC_ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf,.pdf,.txt,.md,.csv,.json,text/plain';
  async function sendToCoach(text, files) {
    if (!P()?.isSignedIn?.()) { $('#drawup-signin')?.click(); throw new Error('Sign in to ask Arch Coach.'); }
    await go(T('arch-coach'));
    const w = $('#du-workspace-content');
    const nw = await waitFor(() => w.querySelector('#dc-new'), 8000); if (!nw) throw new Error('Arch Coach did not open. Try again.');
    nw.click();
    const form = await waitFor(() => w.querySelector('#dc-form'), 6000); if (!form) throw new Error('Arch Coach did not open. Try again.');
    if (files.length) {
      const fi = w.querySelector('#dc-image'); const dt = new DataTransfer(); files.forEach(f => dt.items.add(f));
      fi.files = dt.files; fi.dispatchEvent(new Event('change', { bubbles: true }));
      const ok = await waitFor(() => w.querySelectorAll('#dc-preview [data-unatt]').length >= files.length || null, 15000);
      if (!ok && !w.querySelectorAll('#dc-preview [data-unatt]').length) throw new Error('Your files did not attach. Attach them in Arch Coach.');
    }
    const ta = w.querySelector('#dc-input'); ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true }));
    w.querySelector('#dc-form').requestSubmit();
  }
  const GENERIC_LOOK = { generic: true, gender: 'nonbinary', skin: 5, face: 0, hair: 2, hairColor: 0, outfit: 'drawup_hoodie', holo: 'classic', glasses: false };
  async function coachAvatar() {
    const C = window.DrawUpCoach; if (!C?.avatarSVG) return '';
    try { await C.reload?.(); } catch (_e) {}
    const row = C.state?.()?.row;
    const mine = row && row.mode && row.mode !== 'later';
    const look = mine ? { ...GENERIC_LOOK, generic: false, ...(row.appearance || {}) } : GENERIC_LOOK;
    try { return C.avatarSVG(look, { crop: 'head', holo: !mine }); } catch (_e) { return ''; }
  }
  const SUGGEST = [
    ['villa', 'Create a modern villa', { ask: 'Help me start a modern villa: the program, the massing options and what you need to know about the site first.' }],
    ['cloud', 'Import an architectural drawing', { tool: 'import' }],
    ['history', 'Show my recent projects', { recent: true }],
    ['bulb', 'Help me develop this concept', { prefill: 'Help me develop this concept: ' }]
  ];

  /* ------------------------------------------------------------------ data */
  function ago(d) { if (!d) return ''; const s = (Date.now() - new Date(d).getTime()) / 1000; if (s < 90) return 'just now'; if (s < 3600) return Math.round(s / 60) + 'm ago'; if (s < 86400) return Math.round(s / 3600) + 'h ago'; if (s < 86400 * 30) return Math.round(s / 86400) + 'd ago'; return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  const typeOf = p => p.project_type || p.project_phase || (p.starter_key ? 'Starter project' : '');
  async function loadStatus(me) {
    const c = sb(); const out = { credits: null, projects: null, drawings: null, api: null, db: null, at: new Date() };
    const t0 = performance.now();
    const [cr, pr, dr, api] = await Promise.all([
      Promise.resolve(c.from('arch_coach_credit_accounts').select('*').eq('user_id', me).maybeSingle()).catch(e => ({ error: e })),
      Promise.resolve(c.from('project_threads').select('id', { count: 'exact', head: true }).eq('owner_id', me).eq('status', 'active').is('starter_key', null)).catch(e => ({ error: e })),
      Promise.resolve(c.from('drawings').select('id', { count: 'exact', head: true }).eq('owner_id', me)).catch(e => ({ error: e })),
      fetch('/api/features', { cache: 'no-store' }).then(r => r.ok).catch(() => false)
    ]);
    out.db = !cr.error && !pr.error; out.api = api; out.ms = Math.round(performance.now() - t0);
    if (!cr.error) out.credits = cr.data || false;
    if (!pr.error) out.projects = pr.count ?? 0;
    if (!dr.error) out.drawings = dr.count ?? 0;
    return out;
  }
  function statusHTML(s) {
    const rows = [];
    const cr = s.credits;
    if (cr) {
      const left = (cr.monthly_credits_remaining || 0) + (cr.purchased_credits_remaining || 0);
      if (cr.unlimited_access) rows.push(`<div class="db-stat"><div class="db-stat__top"><b>AI credits</b><span>Unlimited</span></div><div class="db-meter db-meter--warm"><i style="width:100%"></i></div></div>`);
      else {
        const pct = cr.monthly_credit_allowance > 0 ? Math.max(0, Math.min(100, Math.round(cr.monthly_credits_remaining / cr.monthly_credit_allowance * 100))) : null;
        rows.push(`<div class="db-stat"><div class="db-stat__top"><b>AI credits</b><span>${left.toLocaleString()} left</span></div>${pct != null ? `<div class="db-meter db-meter--warm" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Monthly credits left"><i style="width:${pct}%"></i></div><small>${pct}% of this month's ${cr.monthly_credit_allowance.toLocaleString()}${cr.purchased_credits_remaining ? ` · ${cr.purchased_credits_remaining.toLocaleString()} purchased` : ''}</small>` : ''}</div>`);
      }
    } else if (cr === false) rows.push(`<div class="db-stat"><div class="db-stat__top"><b>AI credits</b><span>No credit account yet</span></div></div>`);
    if (s.projects != null) rows.push(`<button type="button" class="db-stat db-stat--link" data-db-go='${esc(JSON.stringify(T('projects')))}'><div class="db-stat__top"><b>Projects</b><span>${s.projects} active ${ico('chev')}</span></div></button>`);
    if (s.drawings != null) rows.push(`<button type="button" class="db-stat db-stat--link" data-db-go='${esc(JSON.stringify(T('draw')))}'><div class="db-stat__top"><b>Drawings</b><span>${s.drawings} saved ${ico('chev')}</span></div></button>`);
    if (!rows.length) rows.push('<p class="db-muted">Your account figures could not load right now.</p>');
    return rows.join('');
  }
  function serviceBadge(s) {
    const ok = s.api && s.db; const part = !ok && (s.api || s.db);
    const label = ok ? 'Services responding' : part ? (s.api ? 'Database not responding' : 'DrawUp API not responding') : 'Services not responding';
    const time = s.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `<span class="db-badge ${ok ? 'is-ok' : 'is-bad'}" title="Checked from your browser at ${esc(time)}: DrawUp API ${s.api ? 'responded' : 'did not respond'}, database ${s.db ? 'responded' : 'did not respond'}.">${esc(label)}</span>`;
  }

  /* ------------------------------------------------------------------ render */
  const COLLAPSE_KEY = 'du-db-side-collapsed';
  const collapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch (_e) { return false; } };
  async function render(w) {
    w.classList.add('dus-full');
    const me = await uid();
    const name = ($('#du-menu-name')?.textContent || '').trim();
    const first = name && !/^drawup member$/i.test(name) ? name.split(/\s+/)[0] : '';
    w.innerHTML = `<div class="db-dash${collapsed() ? ' is-collapsed' : ''}" id="db-dash">
      <aside class="db-side" aria-label="Dashboard shortcuts">
        <nav class="db-side__nav">${SIDE.map((s, i) => `<button type="button" class="db-side__item${i === 0 ? ' is-on' : ''}" data-db-side="${i}" title="${esc(s[2])}" ${i === 0 ? 'aria-current="page"' : ''}>${ico(s[0])}<span>${esc(s[1])}</span></button>`).join('')}</nav>
        <div class="db-side__plan" id="db-plan" hidden></div>
        <button type="button" class="db-side__collapse" data-db-collapse aria-label="${collapsed() ? 'Expand' : 'Collapse'} shortcuts" aria-expanded="${!collapsed()}">${ico('collapse')}</button>
      </aside>
      <div class="db-main">
        <div class="db-top">
          <section class="db-hero" aria-labelledby="db-hero-h">
            <picture class="db-hero__art"><source media="(max-width:700px)" srcset="${ART}hero-villa-m.webp"><img src="${ART}hero-villa.webp" alt="A modern two-storey villa with glass walls at sunset, lit from inside, behind an infinity pool" decoding="async" fetchpriority="high"></picture>
            <div class="db-hero__copy">
              <p class="db-eyebrow">Design <i>•</i> Plan <i>•</i> Visualize</p>
              <h1 id="db-hero-h">Build What’s Next<span>.</span></h1>
              <p class="db-hero__lede">Turn ideas into immersive spaces with the power of DrawUp.</p>
              <div class="db-hero__actions">
                <button type="button" class="db-btn db-btn--primary" data-db-new>Start a New Project ${ico('right')}</button>
                <button type="button" class="db-btn db-btn--glass" data-db-tour>${ico('play')} Watch Tour</button>
              </div>
            </div>
          </section>
          <section class="db-card db-coach" aria-labelledby="db-coach-h">
            <header class="db-coach__head"><span class="db-coach__spark">${ico('spark')}</span><h2 id="db-coach-h">Arch Coach</h2><span class="db-live" id="db-coach-live">Ready</span><button type="button" class="db-iconbtn" data-db-go='${esc(JSON.stringify(T('arch-coach')))}' aria-label="Open Arch Coach">${ico('chev')}</button></header>
            <div class="db-coach__hello"><div class="db-coach__ava" id="db-coach-ava" aria-hidden="true"></div><p><b>${first ? `Good to see you, ${esc(first)}.` : 'Good to see you.'}</b><span>Ready to bring your next vision to life?</span></p></div>
            <div class="db-coach__chips">${SUGGEST.map((s, i) => `<button type="button" class="db-chip" data-db-suggest="${i}">${ico(s[0])}<span>${esc(s[1])}</span></button>`).join('')}</div>
            <div class="db-coach__recent" id="db-coach-recent" hidden></div>
            <form class="db-ask" id="db-ask" autocomplete="off">
              <label class="db-sr" for="db-ask-in">Ask Arch Coach</label>
              <button type="button" class="db-ask__clip" data-db-attach aria-label="Attach a picture or PDF">${ico('clip')}</button>
              <input id="db-ask-in" placeholder="Ask me anything…" maxlength="4000">
              <input type="file" id="db-ask-file" accept="${AC_ACCEPT}" multiple hidden>
              <button type="submit" class="db-ask__send" aria-label="Send to Arch Coach">${ico('send')}</button>
            </form>
            <div class="db-ask__files" id="db-ask-files" hidden></div>
            <p class="db-coach__status" id="db-coach-status" role="status"></p>
            <button type="button" class="db-textlink db-coach__legend" data-db-legend>Choose a legend to guide your coach</button>
          </section>
        </div>
        <div class="db-row">
          <section class="db-card db-recent" aria-labelledby="db-recent-h">
            <header class="db-card__head"><h2 id="db-recent-h"><span class="db-hico db-hico--blue">${ico('folder')}</span>Recent Projects</h2><button type="button" class="db-textlink" data-db-go='${esc(JSON.stringify(T('projects')))}'>View All ${ico('right')}</button></header>
            <div class="db-projects" id="db-projects">${'<div class="db-proj is-skel"><i></i><b></b><small></small></div>'.repeat(4)}</div>
          </section>
          <section class="db-card db-tools" aria-labelledby="db-tools-h">
            <header class="db-card__head"><h2 id="db-tools-h"><span class="db-hico db-hico--blue">${ico('bolt')}</span>Quick Tools</h2></header>
            <div class="db-toolgrid">${TOOLS.map(t => `<button type="button" class="db-tool" data-db-tool="${t[2]}">${ico(t[0])}<span>${esc(t[1])}</span></button>`).join('')}</div>
          </section>
          <section class="db-card db-status" aria-labelledby="db-status-h">
            <header class="db-card__head"><h2 id="db-status-h"><span class="db-hico db-hico--blue">${ico('bars')}</span>Platform Status</h2><span id="db-svc"></span></header>
            <div class="db-stats" id="db-stats"><div class="db-stat is-skel"></div><div class="db-stat is-skel"></div></div>
            <div class="db-family"><b>Dream Beyond</b><span>DrawUp is part of the Dream Beyond family of platforms.</span></div>
          </section>
        </div>
        ${SIGNATURE}
      </div></div>`;
    bind(w);
    coachAvatar().then(svg => { const a = w.querySelector('#db-coach-ava'); if (a && svg) a.innerHTML = svg; else if (a) a.innerHTML = `<span class="db-coach__fallback">${ico('spark')}</span>`; });
    if (!me) return;
    loadRecent(w);
    loadStatus(me).then(s => {
      const box = w.querySelector('#db-stats'); if (!box) return;
      box.innerHTML = statusHTML(s); const svc = w.querySelector('#db-svc'); if (svc) svc.innerHTML = serviceBadge(s);
      const live = w.querySelector('#db-coach-live'); if (live) { live.textContent = s.api ? 'Online' : 'Offline'; live.classList.toggle('is-off', !s.api); }
      const cr = s.credits;
      if (cr && !cr.unlimited_access && (cr.plan_code || 'explore') === 'explore') {
        const plan = w.querySelector('#db-plan'); if (!plan) return; plan.hidden = false;
        plan.innerHTML = `${ico('spark')}<b>Upgrade your plan</b><span>More Arch Coach credits and the full studio.</span><button type="button" class="db-btn db-btn--peach db-btn--sm" data-db-go='${esc(JSON.stringify(T('account')))}'>See plans</button>`;
      }
    }).catch(() => { const box = w.querySelector('#db-stats'); if (box) box.innerHTML = '<p class="db-muted">Status could not load right now.</p>'; });
  }

  async function loadRecent(w) {
    const box = w.querySelector('#db-projects'); if (!box) return;
    let projects = [];
    try { projects = await S().loadProjects(true); } catch (_e) { box.innerHTML = '<p class="db-muted">Your projects could not load. Refresh to try again.</p>'; return; }
    const real = projects.filter(p => !p.starter_key);
    const list = (real.length ? real : projects).slice(0, 4);
    if (!list.length) {
      box.innerHTML = `<div class="db-empty"><div class="db-empty__art" aria-hidden="true">${ico('cube')}</div><div><b>No projects yet</b><p>Start your first project, or bring in a drawing you already have.</p><div class="db-empty__actions"><button type="button" class="db-btn db-btn--primary db-btn--sm" data-db-new>Start a New Project</button><button type="button" class="db-btn db-btn--light db-btn--sm" data-db-tool="import">${ico('upload')} Import a drawing</button></div></div></div>`;
      return;
    }
    const covers = await Promise.all(list.map(p => S().cover(p.id).catch(() => null)));
    box.innerHTML = list.map((p, i) => {
      const cv = covers[i];
      const type = typeOf(p);
      return `<article class="db-proj">
        <button type="button" class="db-proj__open" data-db-go='${esc(JSON.stringify(T('projects', { openProject: p.id })))}' aria-label="Open ${esc(p.project_name)}">
          <i class="db-proj__img${cv?.url ? '' : ' is-empty'}" ${cv?.url ? `style="background-image:url('${esc(cv.url)}')"` : ''}>${cv?.url ? '' : ico('cube')}</i>
          <b>${esc(p.project_name || 'Untitled project')}</b>
          <small><span title="Last edited ${esc(new Date(p.updated_at).toLocaleString())}">${esc(ago(p.updated_at))}</span>${type ? `<em>${esc(type)}</em>` : ''}</small>
        </button>
        <span class="db-proj__go" aria-hidden="true">${ico('cube')}</span>
        <button type="button" class="db-proj__more" data-db-more="${esc(p.id)}" aria-label="More options for ${esc(p.project_name)}" aria-haspopup="true">${ico('dots')}</button>
      </article>`;
    }).join('');
    w._dbProjects = projects;
  }

  function projectMenu(btn, p, w) {
    $('#db-pmenu')?.remove();
    const r = btn.getBoundingClientRect();
    document.body.insertAdjacentHTML('beforeend', `<div id="db-pmenu" class="db-pop" role="menu" style="top:${r.bottom + 6}px;left:${Math.max(12, Math.min(r.right - 240, innerWidth - 252))}px">
      <button role="menuitem" data-a="open">Open project</button>
      <button role="menuitem" data-a="info">Project information</button>
      <button role="menuitem" data-a="team">Ask the AI Team about it</button>
      <button role="menuitem" data-a="cover">Change cover picture</button></div>`);
    const m = $('#db-pmenu');
    m.onclick = e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; m.remove();
      if (a === 'open') go(T('projects', { openProject: p.id }));
      if (a === 'info') go(T('project-info', { hash: '#portal/project-info?id=' + p.id }));
      if (a === 'team') go(T('ai-team', { fresh: true }));
      if (a === 'cover') S().pickCover(p, () => loadRecent(w));
    };
    setTimeout(() => { m.querySelector('button').focus(); const off = ev => { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); }, 0);
    m.addEventListener('keydown', e => { if (e.key === 'Escape') { m.remove(); btn.focus(); } });
  }

  function bind(w) {
    const dash = w.querySelector('#db-dash');
    const status = w.querySelector('#db-coach-status');
    const input = w.querySelector('#db-ask-in');
    const fileIn = w.querySelector('#db-ask-file');
    let files = [];
    const showFiles = () => { const b = w.querySelector('#db-ask-files'); b.hidden = !files.length; b.innerHTML = files.map((f, i) => `<span class="db-file">${esc(f.name)}<button type="button" data-db-unatt="${i}" aria-label="Remove ${esc(f.name)}">${ico('close')}</button></span>`).join(''); };
    w.addEventListener('click', async e => {
      const t = e.target;
      const g = t.closest('[data-db-go]'); if (g) { e.preventDefault(); let a = null; try { a = JSON.parse(g.dataset.dbGo); } catch (_e) {} if (a) go(a); return; }
      if (t.closest('[data-db-new]')) return go(T('projects', { click: '#du-new-project' }));
      if (t.closest('[data-db-tour]')) return tour();
      const tool = t.closest('[data-db-tool]'); if (tool) return runTool(tool.dataset.dbTool);
      const sd = t.closest('[data-db-side]');
      if (sd) {
        const s = SIDE[+sd.dataset.dbSide];
        if (s[3].fn === 'home') { (w.closest('.du-workspace') || window).scrollTo?.({ top: 0, behavior: 'smooth' }); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        if (s[3].fn === 'templates') return openTemplates();
        if (s[3].fn === 'support') { input.value = ''; input.placeholder = 'Ask how to do anything in DrawUp…'; input.focus(); input.closest('.db-coach').scrollIntoView({ block: 'center', behavior: 'smooth' }); status.textContent = 'Questions about using DrawUp are answered free.'; return; }
        return go(s[3]);
      }
      if (t.closest('[data-db-collapse]')) {
        const on = !dash.classList.contains('is-collapsed'); dash.classList.toggle('is-collapsed', on);
        try { localStorage.setItem(COLLAPSE_KEY, on ? '1' : '0'); } catch (_e) {}
        const b = t.closest('[data-db-collapse]'); b.setAttribute('aria-expanded', String(!on)); b.setAttribute('aria-label', (on ? 'Expand' : 'Collapse') + ' shortcuts'); return;
      }
      if (t.closest('[data-db-legend]')) return window.DrawUpCoach?.open?.('legend');
      if (t.closest('[data-db-attach]')) return fileIn.click();
      const un = t.closest('[data-db-unatt]'); if (un) { files.splice(+un.dataset.dbUnatt, 1); showFiles(); return; }
      const more = t.closest('[data-db-more]'); if (more) { e.stopPropagation(); const p = (w._dbProjects || []).find(x => x.id === more.dataset.dbMore); if (p) projectMenu(more, p, w); return; }
      const sg = t.closest('[data-db-suggest]');
      if (sg) {
        const a = SUGGEST[+sg.dataset.dbSuggest][2];
        if (a.tool) return runTool(a.tool);
        if (a.prefill) { input.value = a.prefill; input.focus(); input.setSelectionRange(input.value.length, input.value.length); status.textContent = 'Describe the concept, or attach a sketch or picture.'; return; }
        if (a.recent) return showRecentInCoach(w);
        if (a.ask) return ask(a.ask, []);
      }
    });
    fileIn.addEventListener('change', () => { files = files.concat([...fileIn.files]).slice(0, 6); fileIn.value = ''; showFiles(); });
    const form = w.querySelector('#db-ask');
    form.addEventListener('submit', e => { e.preventDefault(); const q = input.value.trim(); if (!q && !files.length) { input.focus(); return; } ask(q || 'Here are my files. What do you see?', files); });
    form.addEventListener('dragover', e => { e.preventDefault(); form.classList.add('is-drop'); });
    form.addEventListener('dragleave', () => form.classList.remove('is-drop'));
    form.addEventListener('drop', e => { e.preventDefault(); form.classList.remove('is-drop'); files = files.concat([...(e.dataTransfer?.files || [])]).slice(0, 6); showFiles(); });
    async function ask(q, fl) {
      status.textContent = 'Opening Arch Coach…';
      try { await sendToCoach(q, fl); } catch (x) { status.textContent = x.message || 'Arch Coach did not open. Try again.'; }
    }
  }
  async function showRecentInCoach(w) {
    const box = w.querySelector('#db-coach-recent'); box.hidden = false;
    box.innerHTML = '<p class="db-muted">Loading your projects…</p>';
    const projects = (await S().loadProjects().catch(() => [])).filter(p => !p.starter_key).slice(0, 5);
    box.innerHTML = projects.length ? `<p class="db-coach__say">Here are your most recent projects:</p>${projects.map(p => `<button type="button" class="db-mini" data-db-go='${esc(JSON.stringify(T('projects', { openProject: p.id })))}'><b>${esc(p.project_name)}</b><small>${esc(ago(p.updated_at))}${typeOf(p) ? ' · ' + esc(typeOf(p)) : ''}</small>${ico('chev')}</button>`).join('')}` : `<p class="db-coach__say">You have no projects yet. Start one with “Start a New Project”, or import a drawing you already have.</p>`;
  }

  /* Watch Tour: a short guided look at the dashboard itself (there is no tour video yet). */
  function tour() {
    const steps = [
      ['.db-hero__actions', 'Start here', 'Start a New Project creates a project. Everything you make in DrawUp can live inside it.'],
      ['.db-coach', 'Arch Coach', 'Ask anything about your design, codes or drawings, or attach a sketch. Questions about using DrawUp are free.'],
      ['.db-tools', 'Quick Tools', 'Import a drawing, start a new draw, open your latest drawing in 3D, or export it.'],
      ['.db-recent', 'Recent Projects', 'Your latest projects, with their covers. Use ⋯ for more options.'],
      ['#dus-pnav .dus-links', 'Main navigation', 'Projects, AI Team, Draw, CheckUp, Swap, Discover, Connect and Firm are always up here.']
    ];
    let i = 0;
    const show = () => {
      $('#db-tour')?.remove(); $$('.db-tour-on').forEach(x => x.classList.remove('db-tour-on'));
      if (i >= steps.length) return;
      const [sel, h, txt] = steps[i]; const el = $(sel); if (!el || !el.getClientRects().length) { i++; return show(); }
      el.classList.add('db-tour-on'); el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      document.body.insertAdjacentHTML('beforeend', `<div id="db-tour" class="db-tour" role="dialog" aria-live="polite" aria-label="Dashboard tour"><span class="db-kicker">${i + 1} of ${steps.length}</span><b>${esc(h)}</b><p>${esc(txt)}</p><div><button type="button" class="db-btn db-btn--light db-btn--sm" data-x>Close</button><button type="button" class="db-btn db-btn--primary db-btn--sm" data-n>${i === steps.length - 1 ? 'Done' : 'Next'}</button></div></div>`);
      const t = $('#db-tour'); t.querySelector('[data-n]').onclick = () => { i++; show(); }; t.querySelector('[data-x]').onclick = () => { i = steps.length; show(); }; t.querySelector('[data-n]').focus();
    };
    show();
  }

  /* ------------------------------------------------------------------ light header: icons, brand mark, signature in the account menu */
  const NAV_ICON = { dashboard: 'dash', projects: 'cube', 'ai-team': 'team', draw: 'pen', check: 'check', swap: 'swap', details: 'library', discover: 'discover', connect: 'connect', firm: 'firm' };
  function decorateNav() {
    const nav = $('#dus-pnav'); if (!nav) return false;
    $$('.dus-link[data-cat]', nav).forEach(b => { if (!b.querySelector('.db-ico') && NAV_ICON[b.dataset.cat]) b.insertAdjacentHTML('afterbegin', ico(NAV_ICON[b.dataset.cat])); });
    const brand = nav.querySelector('.dus-brand'); if (brand && !brand.querySelector('.db-mark')) brand.insertAdjacentHTML('afterbegin', '<svg class="db-mark" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="dbmk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB28F"/><stop offset=".55" stop-color="#FF8D72"/><stop offset="1" stop-color="#258FF5"/></linearGradient></defs><path d="M16 3 29 27H21.5L16 16.5 10.5 27H3z" fill="url(#dbmk)"/><path d="M16 16.5 21.5 27h-11z" fill="#142337" opacity=".9"/></svg>');
    return true;
  }
  function watchAcct() {
    // The account menu is rebuilt each time it opens; add the signature once it is open.
    document.addEventListener('click', () => setTimeout(() => { const pop = $('#dus-pnav .dus-pop[data-pop="acct"].is-open'); if (pop && !pop.querySelector('.db-signature')) pop.insertAdjacentHTML('beforeend', SIGNATURE); }, 0), true);
  }
  function decorateAccount() {
    const w = $('#du-workspace-content'); if (!w) return;
    const m = /^#portal\/account/.exec(location.hash || ''); if (!m || w.querySelector('.db-signature')) return;
    w.insertAdjacentHTML('beforeend', `<div class="db-about">${SIGNATURE}<p>DrawUp — Design. Plan. Visualize.</p></div>`);
  }

  /* ------------------------------------------------------------------ boot */
  function boot() {
    (function waitReg(n = 0) {
      // Register after the Studio layer so this renderer is the one the Portal uses.
      if (P()?.registerTab && S()) { P().registerTab('dashboard', w => render(w)); const w = $('#du-workspace-content'); if (w && /^#portal(\/dashboard)?($|\?)/.test(location.hash || '') && $('#du-portal')?.classList.contains('open') && !w.querySelector('#db-dash')) P().openPortalTab('dashboard'); return; }
      if (n < 400) setTimeout(() => waitReg(n + 1), 50);
    })();
    (function waitNav(n = 0) { if (decorateNav()) { const w = $('#du-workspace-content'); if (w) new MutationObserver(() => { decorateNav(); decorateAccount(); }).observe(w, { childList: true }); return; } if (n < 400) setTimeout(() => waitNav(n + 1), 50); })();
    watchAcct();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.DrawUpDreamBeyond = { render, go, runTool, version: V };
})();
