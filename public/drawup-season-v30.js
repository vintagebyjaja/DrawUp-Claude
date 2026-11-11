/* DrawUp Season 1 restructure: the season switch in the browser.
 *
 * window.DrawUpSeason = { flags, isOn(id), registry, ready, refresh, season2Screen(w, opts), preview(on) }
 *
 * - Reads the shared registry (drawup-season-core-v30.js, bundled from src/lib/drawup-season.ts) and the flags
 *   from /api/features (DRAWUP_SEASON_2_DETAILS_ENABLED). Default = Season 1: Season 2 features are hidden.
 * - Hidden is not removed. The Details tab stays in the menu and opens a blurred, non-interactive Details screen
 *   ("Coming in Season 2") drawn over the REAL Details workspace. Every Details file, API route, table and stored
 *   row is left as it is; turning the flag on brings the same screens back.
 * - Season 1 menus: the portal menu model (DrawUpStudio._nav.PORTAL_NAV) is edited in place. Entries that
 *   other Season 1 stages add (Project Information, Document Studio, Specifications Review, DD Readiness) register
 *   through DrawUpSeason.addNav(...) so a menu item only appears once its screen exists.
 * - Development: ?season2=1 turns Season 2 on in this browser on a non-production host (?season2=0 clears it).
 *   HQ admins can preview Season 2 on production from the Details screen (this tab only).
 * Loaded at the end of drawup-preview.html, after the Portal, Studio and Details files. */
(function () {
  'use strict';
  if (window.DrawUpSeason) return;
  const Core = window.DrawUpSeasonCore || { DEFAULT_FLAGS: { season2Details: false }, FEATURES: [], isOn: () => true };
  const root = document.documentElement;
  const LS_FLAGS = 'du-season-flags-v30', LS_DEV = 'du-season2-dev', SS_PREVIEW = 'du-season2-preview';
  const PROD_HOSTS = /^(www\.)?drawup\.studio$/i;
  const get = (s, k) => { try { return s.getItem(k); } catch (_e) { return null; } };
  const set = (s, k, v) => { try { v == null ? s.removeItem(k) : s.setItem(k, v); } catch (_e) { /* private mode */ } };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  // ?season2=1 / ?season2=0 (development and preview hosts only)
  try {
    const m = /[?&#]season2=([01])\b/.exec(location.search + location.hash);
    if (m && !PROD_HOSTS.test(location.hostname)) set(localStorage, LS_DEV, m[1] === '1' ? '1' : null);
  } catch (_e) { /* ignore */ }

  let serverFlags = Object.assign({}, Core.DEFAULT_FLAGS);
  try { Object.assign(serverFlags, JSON.parse(get(localStorage, LS_FLAGS) || '{}')); } catch (_e) { /* ignore */ }
  const devOn = () => !PROD_HOSTS.test(location.hostname) && get(localStorage, LS_DEV) === '1';
  const previewOn = () => get(sessionStorage, SS_PREVIEW) === '1';
  const flags = () => ({ season2Details: !!(serverFlags.season2Details || devOn() || previewOn()) });

  const listeners = [f => publicGate(f)];
  function apply() {
    const f = flags();
    root.classList.toggle('du-s1', !f.season2Details);
    root.classList.toggle('du-s2-details', f.season2Details);
    applyNav(f);
    listeners.forEach(fn => { try { fn(f); } catch (e) { console.warn('DrawUpSeason listener', e); } });
  }

  /* ------------------------------------------------------------------ menu model */
  const extraNav = []; // { cat, col, item:[label, go, sub], season2?: bool, after?: label }
  const x_feature = {};
  function nav() { return window.DrawUpStudio && window.DrawUpStudio._nav && window.DrawUpStudio._nav.PORTAL_NAV; }
  function applyNav(f) {
    const N = nav(); if (!N) return;
    // restore each category's original columns first, then edit copies (so the edit can be re-applied)
    N.forEach(cat => { if (!cat.__orig) cat.__orig = { cols: cat.cols, feature: cat.feature }; cat.cols = cat.__orig.cols; cat.feature = cat.__orig.feature; });
    const byId = id => N.find(c => c.id === id);
    const s1 = !f.season2Details;
    const cloneCols = cat => { if (!cat || !cat.cols) return; cat.cols = cat.cols.map(col => col.recent ? col : { ...col, items: col.items.slice() }); };
    N.forEach(cloneCols);
    if (s1) {
      // Details: the tab stays; its tools menu goes (the tab opens the Season 2 screen).
      const d = byId('details'); if (d) { d.cols = undefined; d.feature = undefined; }
      // Draw: no detail tools in the Season 1 drawing menu.
      const dr = byId('draw'); if (dr && dr.cols) dr.cols.forEach(col => { if (col.items) col.items = col.items.filter(it => !/detail/i.test(it[0])); });
      // Firm: the firm's detail library is part of Details.
      const fm = byId('firm'); if (fm && fm.cols) fm.cols.forEach(col => { if (col.items) col.items = col.items.filter(it => !/details library/i.test(it[0])); });
      // the Season 1 menus: Projects, CheckUp and Firm
      N.forEach(s1Cols);
    }
    extraNav.forEach(x => {
      if (x.season2 && s1) return;
      const cat = byId(x.cat); if (!cat) return;
      if (!cat.cols) cat.cols = [];
      let col = typeof x.col === 'number' ? cat.cols[x.col] : cat.cols.find(c => c.h === x.col);
      if (!col) { col = { h: x.col, small: !!x.small, items: [] }; cat.cols.push(col); }
      if (!col.items || col.items.some(it => it[0] === x.item[0])) return;
      const at = x.after ? col.items.findIndex(it => it[0] === x.after) : -1;
      if (at >= 0) col.items.splice(at + 1, 0, x.item); else if (x.first) col.items.unshift(x.item); else col.items.push(x.item);
    });
    Object.keys(x_feature).forEach(id => { const c = byId(id); if (c) c.feature = x_feature[id]; });
    // a top-level link whose menu was emptied opens directly
    document.querySelectorAll('#dus-pnav .dus-link[data-cat]').forEach(b => { const c = byId(b.dataset.cat); if (!c) return; if (c.cols && c.cols.length) b.setAttribute('aria-haspopup', 'true'); else { b.removeAttribute('aria-haspopup'); b.removeAttribute('aria-expanded'); } });
  }
  /* The Season 1 menus. Each column lists the Season 1 work in order; everything the menu had before and
   * that is not named here is kept in a "More" column, so no screen loses its way in. A label only appears
   * when its screen exists: CheckUp's new reviews register themselves with addNav as they land. */
  const T = (tab, extra) => ({ tab, ...extra });
  const S1_COLS = {
    projects: [
      { h: 'Projects', items: [
        ['Overview', T('projects'), 'Every project you are working on'],
        ['Project Map', T('project-info', { hash: '#portal/project-info?view=map' }), 'Your projects on one map'],
        ['Project Information', T('project-info'), 'Site, zoning, program, team, decisions and files'],
        ['Documents', T('documents'), 'Letters, reports, minutes, RFIs and narratives'],
        ['Specifications', T('firm', { hash: '#portal/firm?pane=specs' }), 'Project manuals and outline specs'],
        ['Project Management', T('tracker'), 'RFIs, submittals, change orders, punch lists and QA/QC, with who has the ball'],
      ] },
      { h: 'More', small: true, keepRest: true },
      { h: 'Recent', recent: true },
    ],
    check: [
      { h: 'CheckUp', items: [
        ['Code Compliance', T('check', { click: 'Building code', scroll: 'New check' })],
        ['ADA Accessibility', T('check', { click: 'Accessibility', scroll: 'New check' })],
        ['Life Safety', T('check', { click: 'Life safety / egress', scroll: 'New check' })],
        ['Drawing Review', T('check', { click: 'Drawing set check', scroll: 'New check' })],
      ] },
      { h: 'Results', small: true, items: [
        ['Findings and Reports', T('check', { scroll: 'Your checks' })],
        ['Design Narrative Review', T('check', { click: 'Design narrative review', scroll: 'New check' })],
        ['Narrative vs. Plans', T('check', { click: 'Narrative vs. plans', scroll: 'New check' })],
      ] },
    ],
    firm: [
      { h: 'Firm', items: [
        ['Firm Profile', T('firm', { hash: '#portal/firm?pane=details' }), 'Name, logo, discipline and offices'],
        ['Letterheads', T('firm', { hash: '#portal/firm?pane=specs&view=formats' }), 'Letterhead, margins and page setup for documents'],
        ['Document Templates', T('documents', { hash: '#portal/documents?new=1' }), 'Start a document from a DrawUp template'],
        ['Presentation Templates', T('firm', { hash: '#portal/firm?pane=present' }), 'Firm admins'],
        ['Branding', T('firm', { hash: '#portal/firm?pane=present&focus=brand' }), 'Logo, colors and fonts used on documents and presentations'],
      ] },
      { h: 'More', small: true, keepRest: true },
    ],
  };
  /** Rebuild one category's columns from S1_COLS, keeping every item it had that the new lists do not name. */
  function s1Cols(cat) {
    const plan = S1_COLS[cat.id]; if (!plan) return;
    const was = []; (cat.cols || []).forEach(col => (col.items || []).forEach(it => was.push(it)));
    const named = new Set(); plan.forEach(col => (col.items || []).forEach(it => named.add(it[0].toLowerCase())));
    const rest = was.filter(it => !named.has(String(it[0]).toLowerCase()));
    const out = plan.map(col => col.recent ? { h: col.h, recent: true }
      : { h: col.h, small: !!col.small, items: col.keepRest ? rest.slice() : col.items.map(it => it.slice()) })
      .filter(col => col.recent || (col.items && col.items.length));
    if (out.length) cat.cols = out;
  }
  function addNav(x) { extraNav.push(x); applyNav(flags()); }
  function setFeature(cat, feature) { x_feature[cat] = feature; applyNav(flags()); }

  /* ------------------------------------------------------------------ Details: Season 2 screen */
  const CATS = [['layers', 'All Details'], ['folder', 'Wall Systems'], ['tri', 'Roofing'], ['stack', 'Floor Systems'], ['grid', 'Foundations'], ['grid', 'Facade'], ['frame', 'Openings'], ['layers', 'Assemblies'], ['cube', '3D Details']];
  const ICON = {
    layers: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 16.5 9 5 9-5"/>',
    folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z"/>',
    tri: '<path d="M12 4 3 19h18L12 4Z"/><path d="M8 14h8"/>',
    stack: '<rect x="4" y="5" width="16" height="4" rx="1"/><rect x="4" y="10" width="16" height="4" rx="1"/><rect x="4" y="15" width="16" height="4" rx="1"/>',
    grid: '<rect x="4" y="4" width="16" height="16"/><path d="M4 10h16M4 15h16M10 4v16M15 4v16"/>',
    frame: '<rect x="5" y="4" width="14" height="16"/><rect x="8" y="7" width="8" height="10"/>',
    cube: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
    draw: '<path d="M4 5h9l3 3v4"/><path d="M4 5v14h8"/><path d="m14 18 5-5 2 2-5 5h-2v-2Z"/>',
    table: '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 10h16M4 14.5h16M10 5v14M15 5v14"/>',
    me: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z"/>',
    shared: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="8" r="2.5"/><path d="M15.5 13.6A4.5 4.5 0 0 1 21 18"/>'
  };
  const svg = (k, cls) => `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ''}</svg>`;

  async function savedCounts(c) {
    // Shown so members can see their details are kept. Counting only; nothing is changed.
    if (!c || !c.client || !c.user) return null;
    const n = async (t, col) => { try { const r = await c.client.from(t).select('id', { count: 'exact', head: true }).eq(col, c.user.id); return r.error ? null : (r.count || 0); } catch (_e) { return null; } };
    const [a, b] = await Promise.all([n('details', 'owner_id'), n('draw_details', 'owner_id')]);
    if (a == null && b == null) return null; return (a || 0) + (b || 0);
  }

  async function isHqAdmin(c) {
    if (c && c.isAdmin) return true;
    try { const r = await c.client.rpc('is_drawup_admin'); return r && r.data === true; } catch (_e) { return false; }
  }
  async function season2Screen(w, c) {
    const isHq = await isHqAdmin(c);
    w.innerHTML = `<section class="dus2" aria-labelledby="dus2-title">
      <div class="dus2-under" inert aria-hidden="true"><aside class="dus2-side"><h2>Details Library</h2><ul>${CATS.map((x, i) => `<li class="${i === 0 ? 'on' : ''}">${svg(x[0])}${esc(x[1])}</li>`).join('')}</ul><hr><ul><li>${svg('me')}My Details</li><li>${svg('shared')}Shared Details</li></ul></aside><div class="dus2-real" id="dus2-real"></div></div>
      <div class="dus2-glass"></div>
      <div class="dus2-msg">
        <div class="dus2-tile">${svg('layers')}</div>
        <h1 id="dus2-title">Details</h1>
        <p class="dus2-kicker"><span></span>COMING IN SEASON 2<span></span></p>
        <p class="dus2-lead">Advanced construction detailing, 3D assemblies, and technical documentation are coming in Season 2.</p>
        <ul class="dus2-tools" aria-label="Included in Season 2"><li>${svg('draw')}Draw a Detail</li><li>${svg('cube')}3D Details</li><li>${svg('table')}Details Table</li><li>${svg('layers')}Detail Library</li></ul>
        <p class="dus2-pill">SEASON 2</p>
        <p class="dus2-sub">DESIGN DEVELOPMENT + CONSTRUCTION DOCUMENTATION</p>
        <p class="dus2-kept" id="dus2-kept" hidden></p>
        <div class="dus2-acts"><button type="button" class="dus2-btn" data-portal-tab="draw">Go to Draw</button><button type="button" class="dus2-btn ghost" data-portal-tab="projects">Open your projects</button>${isHq ? '<button type="button" class="dus2-btn ghost" id="dus2-preview" title="HQ only: shows the Season 2 Details tools in this browser tab">HQ · Preview Season 2</button>' : ''}</div>
      </div>
    </section>`;
    // The real Details workspace renders underneath, blurred and inert (no clicks, no keyboard focus).
    const real = w.querySelector('#dus2-real');
    try { if (window.DrawUpDetails && window.DrawUpDetails.render) await window.DrawUpDetails.render(real, false); } catch (e) { console.warn('Details (under the Season 2 screen)', e); }
    real.querySelectorAll('input,button,select,textarea,a,[tabindex]').forEach(el => el.setAttribute('tabindex', '-1'));
    const kept = w.querySelector('#dus2-kept'), n = await savedCounts(c);
    if (kept && n) { kept.hidden = false; kept.textContent = `Your ${n} saved detail${n === 1 ? ' is' : 's are'} kept and will be here in Season 2.`; }
    const pv = w.querySelector('#dus2-preview'); if (pv) pv.onclick = () => { preview(true); c.openPortalTab('details'); };
  }

  /* The public Details page (marketing side) shows the same Season 2 screen in Season 1: its own content stays in
   * the page, blurred and inert underneath, and comes back as it was when Season 2 Details is turned on. */
  function publicGate(f) {
    const pg = document.getElementById('page-details'); if (!pg) return;
    const on = !f.season2Details, has = pg.classList.contains('dus2-pub');
    if (on && !has) {
      const under = document.createElement('div'); under.className = 'dus2-pubreal'; under.setAttribute('inert', ''); under.setAttribute('aria-hidden', 'true');
      while (pg.firstChild) under.appendChild(pg.firstChild);
      pg.classList.add('dus2-pub');
      pg.innerHTML = `<section class="dus2" aria-labelledby="dus2-pub-title"><div class="dus2-under"></div><div class="dus2-glass"></div>
        <div class="dus2-msg">
          <div class="dus2-tile">${svg('layers')}</div>
          <h1 id="dus2-pub-title">Details</h1>
          <p class="dus2-kicker"><span></span>COMING IN SEASON 2<span></span></p>
          <p class="dus2-lead">Advanced construction detailing, 3D assemblies, and technical documentation are coming in Season 2.</p>
          <ul class="dus2-tools" aria-label="Included in Season 2"><li>${svg('draw')}Draw a Detail</li><li>${svg('cube')}3D Details</li><li>${svg('table')}Details Table</li><li>${svg('layers')}Detail Library</li></ul>
          <p class="dus2-pill">SEASON 2</p>
          <p class="dus2-sub">DESIGN DEVELOPMENT + CONSTRUCTION DOCUMENTATION</p>
          <p class="dus2-s1">Season 1 is here now: project information, drawings, specifications, documents and CheckUp, from pre-design through DD preparation.</p>
          <div class="dus2-acts"><a class="dus2-btn" href="#products" data-page="products">See Season 1</a><a class="dus2-btn ghost" href="#check" data-page="check">Explore CheckUp</a></div>
        </div></section>`;
      pg.querySelector('.dus2-under').appendChild(under);
    } else if (!on && has) {
      const under = pg.querySelector('.dus2-pubreal'); const kids = under ? [...under.childNodes] : [];
      pg.innerHTML = ''; kids.forEach(k => pg.appendChild(k)); pg.classList.remove('dus2-pub');
    }
  }

  function registerGate(n) {
    const P = window.DrawUpPortal; if (!P || !P.registerTab) { if ((n || 0) < 100) setTimeout(() => registerGate((n || 0) + 1), 100); return; }
    P.registerTab('details', async (w, c) => {
      if (flags().season2Details && window.DrawUpDetails && window.DrawUpDetails.render) {
        await window.DrawUpDetails.render(w, false);
        if (previewOn() && !serverFlags.season2Details) w.insertAdjacentHTML('afterbegin', '<div class="dus2-banner">Season 2 preview (HQ, this tab only). Members see the Season 2 screen. <button type="button" id="dus2-end">End preview</button></div>');
        const e = w.querySelector('#dus2-end'); if (e) e.onclick = () => { preview(false); c.openPortalTab('details'); };
        return;
      }
      return season2Screen(w, c);
    });
  }

  /* ------------------------------------------------------------------ Draw: no detail routes in Season 1 */
  function wrapDraw(n) {
    const V = window.DrawUpDrawV21; if (!V || !V.__v22 || !V.route) { if ((n || 0) < 120) setTimeout(() => wrapDraw((n || 0) + 1), 100); return; }
    if (V.__season) return; V.__season = true;
    const route = V.route;
    V.route = async (w, c, params) => {
      if (params && params.has && params.has('detail') && !flags().season2Details) { await season2Screen(w, c); return true; }
      return route(w, c, params);
    };
  }

  function preview(on) { set(sessionStorage, SS_PREVIEW, on ? '1' : null); apply(); }

  async function refresh() {
    try {
      const r = await fetch('/api/features', { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); if (j && j.flags) { serverFlags = Object.assign({}, Core.DEFAULT_FLAGS, j.flags); set(localStorage, LS_FLAGS, JSON.stringify(serverFlags)); } }
    } catch (_e) { /* keep the cached or default flags */ }
    apply(); return flags();
  }

  window.DrawUpSeason = {
    get flags() { return flags(); },
    isOn: id => Core.isOn(id, flags()),
    registry: Core.FEATURES,
    addNav, setFeature, season2Screen, preview,
    onChange: fn => { listeners.push(fn); },
    refresh,
    ready: null
  };
  // Season 1 CheckUp menu: Portfolio Review sits with the other reviews (it stays under Discover too).
  extraNav.push({ cat: 'check', col: 'CheckUp', item: ['Portfolio Review', { tab: 'portfolio' }, 'Advisory scores and page notes'], after: 'Drawing Review' });
  apply();
  registerGate(0); wrapDraw(0);
  // the Studio nav mounts when the portal opens; re-apply once it exists
  (function waitNav(n) { if (nav()) { applyNav(flags()); return; } if (n < 200) setTimeout(() => waitNav(n + 1), 100); })(0);
  window.DrawUpSeason.ready = refresh();
})();
