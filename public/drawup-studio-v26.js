/* DrawUp v26 "The Living Studio": one navigation system, the cinematic Dashboard, project covers,
 * holographic transitions and their preference, shared by the public site and the Portal.
 *
 * It only reorganizes how members reach what already exists. Every link opens an existing Portal tab
 * (DrawUpPortal.openPortalTab), an existing tool view (DrawUpTeam.open, DrawUpDrawIt.openInCoach, …) or an
 * existing public page (by clicking the original, now hidden, nav link so the original router runs).
 * The old sidebar and top tabs stay in the DOM, hidden, because other layers read them (HQ flag, Draw it up
 * side links, the hashchange handler).
 *
 * window.DrawUpStudio = { prefs, setPrefs, go, cover, pickCover, transition, refresh }
 */
(function () {
  'use strict';
  if (window.DrawUpStudio) return;
  const root = document.documentElement;
  root.classList.add('dus');
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const P = () => window.DrawUpPortal;
  const sb = () => P()?.ctx?.()?.client || window.drawupSupabaseClient;
  const ctx = () => P()?.ctx?.() || {};
  const ART = '/drawup-studio-v26/';
  const V = '26.0';

  /* ------------------------------------------------------------------ icons (24px stroke) */
  const I = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    dots: '<circle cx="5.5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18.5" cy="12" r="1.2" fill="currentColor"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    upright: '<path d="M7 17 17 7M8 7h9v9"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    projects: '<path d="M4 7.5h6l1.6 2H20v9.5H4z"/><path d="M8 13h8M8 16h5"/>',
    team: '<circle cx="8" cy="8.5" r="2.6"/><circle cx="16.5" cy="8" r="2.3"/><path d="M3.5 19c.5-3.2 2.4-5 4.5-5s4 1.8 4.5 5"/><path d="M13.5 13.6c.9-.5 1.9-.8 3-.8 2 0 3.6 1.6 4 4.7"/>',
    draw: '<path d="M5 19 9 8l3 3-4 8z"/><path d="m12 11 6-6 1.5 1.5-6 6"/><path d="M14 19h6"/><circle cx="9" cy="8" r="1"/>',
    check: '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.3 2.6 2.6 5-5.4"/>',
    swap: '<rect x="4" y="5" width="7" height="7" rx="1"/><rect x="13" y="12" width="7" height="7" rx="1"/><path d="M15 5h3a2 2 0 0 1 2 2v2M9 19H6a2 2 0 0 1-2-2v-2"/>',
    details: '<path d="M4 6.5h16M4 11h10M4 15.5h16M4 20h10"/><path d="M17 9.5v3"/>',
    discover: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    connect: '<circle cx="6" cy="12" r="2.2"/><circle cx="18" cy="6.5" r="2.2"/><circle cx="18" cy="17.5" r="2.2"/><path d="m8 11 8-3.5M8 13l8 3.5"/>',
    firm: '<path d="M4 20V8l6-3v15M10 20V9h10v11"/><path d="M13 12h1.5M16.5 12H18M13 15.5h1.5M16.5 15.5H18M6.5 10.5h1M6.5 13.5h1"/><path d="M3 20h18"/>',
    user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
    spark: '<path d="M12 3.5 13.9 10l6.6 2-6.6 2L12 20.5 10.1 14l-6.6-2 6.6-2z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    file: '<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5V8h4M9.5 12h6M9.5 15.5h6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>',
    upload: '<path d="M12 16V5M7 10l5-5 5 5"/><path d="M5 19h14"/>',
    clip: '<path d="M8 12.5 14.5 6a3 3 0 0 1 4.2 4.2l-7.8 7.8a5 5 0 0 1-7-7L11 3.9"/>',
    msg: '<path d="M4 5.5h16v11H9l-5 4z"/>',
    play: '<path d="M8 5.5v13l10-6.5z"/>',
    layers: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>'
  };
  const ico = (k, cls = 'dus-ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[k] || ''}</svg>`;

  /* ------------------------------------------------------------------ preferences
     Saved on this device right away (localStorage) and on the member's account (Supabase auth user_metadata,
     which every account already has, so no database change is needed). */
  const PREF_KEY = 'du-studio-prefs-v26';
  const PREF_DEFAULT = { transitions: 'on', speed: 'quick' };
  let prefs = (() => { try { return { ...PREF_DEFAULT, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch (_e) { return { ...PREF_DEFAULT }; } })();
  const reducedMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  async function syncPrefsFromAccount() {
    try {
      const c = sb(); if (!c) return;
      const u = (await c.auth.getUser()).data?.user; const saved = u?.user_metadata?.drawup_studio;
      if (saved && typeof saved === 'object') { prefs = { ...PREF_DEFAULT, ...saved }; localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); renderPrefControls(); }
    } catch (_e) {}
  }
  async function setPrefs(patch) {
    prefs = { ...prefs, ...patch };
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (_e) {}
    renderPrefControls();
    try { const c = sb(); const s = c && (await c.auth.getSession()).data.session; if (s && !s.user.is_anonymous) await c.auth.updateUser({ data: { drawup_studio: prefs } }); } catch (e) { console.warn('DrawUp preferences were saved on this device only:', e); }
  }
  function prefControlsHTML() {
    const on = prefs.transitions !== 'off';
    return `<div class="dus-pref-row"><div><b>Holographic transitions</b><span>A short holographic entrance when you open a major area. Off goes straight to the page.${reducedMotion() ? ' Your device asks for reduced motion, so they stay off.' : ''}</span></div><div class="dus-toggle" role="group" aria-label="Holographic transitions"><button type="button" data-dus-pref="transitions" data-v="on" aria-pressed="${on}">On</button><button type="button" data-dus-pref="transitions" data-v="off" aria-pressed="${!on}">Off</button></div></div>
      <div class="dus-pref-row" ${on ? '' : 'hidden'}><div><b>Length</b><span>Quick is about 1.2 seconds. Cinematic is about 1.8 seconds. You can skip any transition with a click, a tap or Esc.</span></div><div class="dus-toggle" role="group" aria-label="Transition length"><button type="button" data-dus-pref="speed" data-v="quick" aria-pressed="${prefs.speed !== 'cinematic'}">Quick</button><button type="button" data-dus-pref="speed" data-v="cinematic" aria-pressed="${prefs.speed === 'cinematic'}">Cinematic</button></div></div>`;
  }
  function renderPrefControls() { $$('[data-dus-prefs]').forEach(b => { b.innerHTML = prefControlsHTML(); }); }
  document.addEventListener('click', e => { const b = e.target.closest('[data-dus-pref]'); if (!b) return; e.preventDefault(); setPrefs({ [b.dataset.dusPref]: b.dataset.v }); });

  /* ------------------------------------------------------------------ data: projects + covers */
  const D = { projects: null, covers: new Map(), coverAt: 0, profile: null, loading: null };
  const isPortalOpen = () => $('#du-portal')?.classList.contains('open');
  async function uid() { try { return (await sb()?.auth.getSession())?.data?.session?.user?.id || null; } catch (_e) { return null; } }
  async function signedMany(paths) {
    const out = new Map(), c = sb(); const list = [...new Set(paths.filter(Boolean))];
    const direct = list.filter(p => /^(https?:|\/|data:)/.test(p)); direct.forEach(p => out.set(p, p));
    const rest = list.filter(p => !out.has(p)); if (!rest.length || !c) return out;
    try { const { data } = await c.storage.from('drawup-private').createSignedUrls(rest, 3600); (data || []).forEach(x => { if (x?.signedUrl) out.set(x.path, x.signedUrl); }); } catch (_e) {}
    return out;
  }
  const IMG_RE = /\.(png|jpe?g|webp|gif|avif)$/i;
  /* Cover priority (spec): member's chosen cover → latest finished render → uploaded picture → drawing preview → hologram. */
  async function loadProjects(force) {
    if (D.loading && !force) return D.loading;
    D.loading = (async () => {
      const c = sb(), me = await uid(); if (!c || !me) return [];
      const [pr, sw, dg] = await Promise.all([
        c.from('project_threads').select('*').eq('owner_id', me).order('updated_at', { ascending: false }).limit(40),
        c.from('swap_generations').select('id,project_thread_id,result_path,status,created_at,completed_at,prompt').eq('owner_id', me).eq('status', 'complete').order('created_at', { ascending: false }).limit(60),
        c.from('drawing_generations').select('id,project_thread_id,title,source_paths,created_at').eq('owner_id', me).order('created_at', { ascending: false }).limit(60)
      ]);
      const projects = pr.data || [];
      const renders = (sw.data || []).filter(r => r.result_path), sets = dg.data || [];
      const cand = new Map();
      for (const p of projects) {
        const list = [];
        const chosen = p.progress?.cover;
        if (chosen?.path) list.push({ kind: 'chosen', path: chosen.path, label: chosen.label || 'Chosen cover', from: chosen.kind });
        renders.filter(r => r.project_thread_id === p.id).forEach(r => list.push({ kind: 'render', path: r.result_path, label: r.prompt ? 'Render · ' + r.prompt.slice(0, 40) : 'Saved render', at: r.completed_at || r.created_at }));
        sets.filter(s => s.project_thread_id === p.id).forEach(s => (s.source_paths || []).filter(x => IMG_RE.test(x)).forEach(x => list.push({ kind: 'upload', path: x, label: 'Uploaded picture · ' + (s.title || 'Drawing set'), at: s.created_at, setId: s.id })));
        sets.filter(s => s.project_thread_id === p.id).slice(0, 3).forEach(s => list.push({ kind: 'drawing', setId: s.id, label: 'Drawing preview · ' + (s.title || 'Drawing set'), at: s.created_at }));
        if (p.starter_key) list.push({ kind: 'upload', path: '/starter-athletic-storage/01-ai-generated-source.png', label: 'Starter project picture' });
        cand.set(p.id, list);
      }
      const urls = await signedMany([...cand.values()].flat().map(x => x.path));
      for (const [id, list] of cand) list.forEach(x => { if (x.path) x.url = urls.get(x.path) || ''; });
      D.projects = projects; D.cand = cand; D.coverAt = Date.now();
      projects.forEach(p => D.covers.set(p.id, coverFor(p.id)));
      return projects;
    })();
    try { return await D.loading; } finally { setTimeout(() => { D.loading = null; }, 0); }
  }
  function coverFor(id) {
    const list = (D.cand && D.cand.get(id)) || [];
    const pick = list.find(x => x.kind === 'chosen' && x.url) || list.find(x => x.kind === 'render' && x.url) || list.find(x => x.kind === 'upload' && x.url);
    return pick ? { url: pick.url, kind: pick.kind === 'chosen' ? (pick.from || 'chosen') : pick.kind, label: pick.label } : null;
  }
  /* A drawing preview is drawn from the set's own building model by the Draw it up sheet renderer, in the browser. */
  async function drawingPreview(setId) {
    try {
      const c = sb(); const { data } = await c.from('drawing_generations').select('model,title').eq('id', setId).maybeSingle();
      const S = window.DrawUpSheets; if (!data?.model || !S) return '';
      const fn = S.sheetSVG || S.renderSheet || S.svg; if (typeof fn !== 'function') return '';
      const svg = await fn(data.model, 'A101'); if (!svg) return '';
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(typeof svg === 'string' ? svg : new XMLSerializer().serializeToString(svg));
    } catch (_e) { return ''; }
  }

  /* ------------------------------------------------------------------ navigation model
     Every destination below already exists. Labels follow the v26 brief; where the brief named something
     DrawUp does not have as its own page, the link opens the closest real place and says what it is. */
  const T = (tab, extra) => ({ tab, ...extra });
  const PORTAL_NAV = [
    { id: 'dashboard', label: 'Dashboard', go: T('dashboard') },
    { id: 'projects', label: 'Projects', go: T('projects'), feature: { art: 'card-projects.webp', title: 'Start a new project', text: 'Name it, add a cover, and the whole team can work in its context.', go: T('projects', { click: '#du-new-project' }) },
      cols: [
        { h: 'Projects', items: [['All Projects', T('projects')], ['Drawing Sets', T('projects', { scroll: '#du-dit24-recent' }), 'Draw it up sets for your projects'], ['DrawUp Ready', T('projects', { openStarter: true }), 'The 3-step starter learning project'], ['Project Reviews', T('check', { scroll: 'Your checks' }), 'CheckUp reviews of your sets'], ['Project Memory', T('ai-team', { view: 'memory' }), 'What the AI Team remembers']] },
        { h: 'Recent', recent: true }
      ] },
    { id: 'ai-team', label: 'AI Team', go: T('ai-team'), feature: { art: 'card-team.webp', title: 'Ready to draw something up?', text: 'Arch Coach, Teammate and 6th Man in one conversation.', go: T('ai-team', { fresh: true }) },
      cols: [
        { h: 'Workspace', items: [['AI Workspace', T('ai-team')], ['Conversations', T('ai-team', { view: 'chat' })], ['The Locker Room', T('ai-team', { view: 'locker' })], ['Active Generations', T('ai-team', { view: 'jobs' })]] },
        { h: 'The team', small: true, items: [['Arch Coach', T('arch-coach'), 'Code, ADA and drawing questions'], ['Teammate', T('ai-team', { prefill: 'Teammate, ' }), 'Brainstorms and builds with you'], ['6th Man', T('ai-team', { prefill: '6th Man, check in.' }), 'Off the bench when you call'], ['Project Memory', T('ai-team', { view: 'memory' })], ['Coach Playbook', T('arch-coach', { hash: '#portal/arch-coach?pb=1' })]] }
      ] },
    { id: 'draw', label: 'Draw', go: T('draw'), feature: { art: 'card-draw.webp', title: 'Draw it up', text: 'A picture in, a coordinated drawing set out.', go: { fn: () => window.DrawUpDrawIt?.openInCoach?.({}) || P()?.openPortalTab('draw') } },
      cols: [
        { h: 'Draw', items: [['Design Workspace', T('draw')], ['Space Planning', T('draw', { click: 'Create plan' }), 'Plans with real dimensions'], ['Drawing Generation', { fn: () => window.DrawUpDrawIt?.openInCoach?.({}) }, 'Draw it up: a picture to a drawing set'], ['Mark Up a File', T('draw', { click: 'Markup a file' })], ['Draw a Detail in 3D', T('draw', { click: 'New detail' })]] },
        { h: 'Start from', small: true, items: [['The example plan', T('draw', { click: 'Open example plan' })], ['Your drawing sets', T('projects', { scroll: '#du-dit24-recent' })], ['My 3D details', T('draw', { click: 'My details' })]] }
      ] },
    { id: 'check', label: 'CheckUp', go: T('check'), feature: { art: 'card-check.webp', title: 'Quick Check', text: 'Upload a sheet and see what is wrong and how it should look.', go: T('check', { hash: '#portal/check?quick=1' }) },
      cols: [
        { h: 'CheckUp', items: [['Code Compliance', T('check', { click: 'Building code', scroll: 'New check' })], ['ADA Accessibility', T('check', { click: 'Accessibility', scroll: 'New check' })], ['Life Safety', T('check', { click: 'Life safety / egress', scroll: 'New check' })], ['Drawing Review', T('check', { click: 'Drawing set check', scroll: 'New check' })]] },
        { h: 'Results', small: true, items: [['Findings and Reports', T('check', { scroll: 'Your checks' })], ['Design narrative review', T('check', { click: 'Design narrative review', scroll: 'New check' })], ['Narrative vs. plans', T('check', { click: 'Narrative vs. plans', scroll: 'New check' })]] }
      ] },
    { id: 'swap', label: 'Swap', go: T('swap'), feature: { art: 'card-swap.webp', title: 'Start a swap', text: 'Change materials, light and time of day on a real picture.', go: T('swap', { click: '＋ New swap' }) },
      cols: [{ h: 'Swap', items: [['Interior Visualization', T('swap', { click: 'Swap' })], ['Material Changes', T('swap', { click: 'Materials' })], ['Photoreal Render', T('swap', { click: 'Photoreal render' })], ["Let's Play", T('swap', { click: 'Let’s Play' })], ['Saved Visualizations', T('swap')]] }] },
    { id: 'details', label: 'Details', go: T('details'), feature: { art: 'card-details.webp', title: 'Draw a detail', text: 'Upload one detail. Get the flaws, the fixes and a clean drawing.', go: T('details', { scroll: 'Upload one detail' }) },
      cols: [{ h: 'Detail Library', items: [['DrawUp 2D', T('details', { click: 'DrawUp 2D' })], ['DrawUp 3D', T('details', { click: 'DrawUp 3D' })], ['My 3D', T('details', { click: 'My 3D' })], ['Firm Details', T('details', { click: 'Firm' })]] },
        { h: 'Tools', small: true, items: [['Draw a detail from a picture', T('details', { scroll: 'Upload one detail' })], ['Find by sheet reference', T('details', { focus: 'input[placeholder*="A601"],input[placeholder*="sheet"]' })], ['Reviews and comments', T('details', { click: 'Reviews + comments' })]] }] },
    { id: 'discover', label: 'Discover', go: T('discover'), cols: [
      { h: 'Discover', items: [['Search DrawUp', T('search')], ['Projects', T('discover', { sub: 'projects' })], ['Firms', T('discover', { sub: 'firms' })], ['People', T('discover', { sub: 'people' })], ['Universities', T('discover', { sub: 'universities' })]] },
      { h: 'Resources', small: true, items: [['Codes', { embed: 'resources', sub: 'codes' }], ['AIA & NOMA', { embed: 'resources', sub: 'aia' }], ['Education', { embed: 'resources', sub: 'education' }], ['International', { embed: 'resources', sub: 'international' }]] }] },
    { id: 'connect', label: 'Connect', go: T('connect'), cols: [
      { h: 'Connect', items: [['Messages', T('connect', { click: 'Messages' })], ['Group Chats', T('connect', { click: 'Group chats' })], ['Firm Chats', T('connect', { click: 'Firm chats' })], ['Timeline', T('connect', { click: 'Timeline' })]] },
      { h: 'Community', small: true, items: [['Boards', T('connect', { click: 'Boards' })], ['Vendors', T('connect', { click: 'Vendors' })], ['Lunch and Learns', T('connect', { click: 'Lunch and Learns' })]] }] },
    { id: 'firm', label: 'Firm', go: T('firm'), cols: [
      { h: 'Firm', items: [['Firm Workspace', T('firm')], ['Firm Playbook', T('firm', { hash: '#portal/firm?pane=playbook' }), 'Firm admins'], ['Team Management', T('team')], ['Shared Resources', T('firm', { hash: '#portal/firm?pane=library' })]] },
      { h: 'More', small: true, items: [['GM Presentation', T('firm', { hash: '#portal/firm?pane=present' }), 'Firm admins'], ['Firm Details library', T('details', { click: 'Firm' })], ['Locations & studios', T('firm', { hash: '#portal/firm?pane=units' }), 'Firm admins']] }] }
  ];
  const TAB_SECTION = { dashboard: 'dashboard', projects: 'projects', 'ai-team': 'ai-team', 'arch-coach': 'ai-team', draw: 'draw', check: 'check', swap: 'swap', details: 'details', discover: 'discover', search: 'discover', connect: 'connect', firm: 'firm', team: 'firm' };

  const PUBLIC_NAV = [
    { id: 'discover', label: 'Discover', cols: [
      { h: 'Discover DrawUp', items: [['What is DrawUp?', { page: 'home', scroll: '#dus-about' }], ['How DrawUp Works', { page: 'home', scroll: '#dus-how' }], ['Features', { page: 'products' }], ['Why DrawUp', { page: 'home', scroll: '#dus-why' }]] },
      { h: 'Explore', small: true, items: [['Projects', { page: 'discover', sub: 'projects' }], ['Firms', { page: 'discover', sub: 'firms' }], ['People', { page: 'discover', sub: 'people' }], ['Universities', { page: 'discover', sub: 'universities' }], ['Connect', { page: 'connect' }]] }],
      feature: { art: 'card-projects.webp', title: 'Draw it up. See it through.', text: 'One studio for drawings, checks, details and your AI design team.', go: { page: 'products' } } },
    { id: 'products', label: 'Products', cols: [
      { h: 'Products', items: [['DrawUp Draw', { page: 'products', scroll: '#dus-p-draw' }], ['CheckUp', { page: 'check' }], ['DrawUp Details', { page: 'details' }], ['DrawUp Swap', { page: 'swap' }]] },
      { h: 'More', small: true, items: [['AI Team', { page: 'products', scroll: '#dus-p-team' }], ['Arch Coach', { page: 'coach' }], ['DrawUp Sets', { page: 'products', scroll: '#dus-p-sets' }, 'Drawing sets filed by sheet'], ['Narrative Review', { page: 'products', scroll: '#dus-p-docs' }, 'Narratives checked against your plans']] }],
      feature: { art: 'card-team.webp', title: 'Meet your AI Design Team', text: 'Arch Coach, Teammate and 6th Man in one conversation.', go: { page: 'products', scroll: '#dus-p-team' } } },
    { id: 'solutions', label: 'Solutions', cols: [
      { h: 'Solutions', items: [['Students', { page: 'solutions', scroll: '#dus-s-students' }], ['Architects', { page: 'solutions', scroll: '#dus-s-architects' }], ['Architecture Firms', { page: 'firms' }], ['Engineering Teams', { page: 'solutions', scroll: '#dus-s-engineers' }], ['Educators', { page: 'solutions', scroll: '#dus-s-educators' }]] }],
      feature: { art: 'card-details.webp', title: 'For firms', text: 'Firm workspace, playbook, roster and shared details.', go: { page: 'firms' } } },
    { id: 'resources', label: 'Resources', cols: [
      { h: 'Learn', items: [['DrawUp Playbook', { page: 'coach', signedIn: { tab: 'arch-coach', hash: '#portal/arch-coach?pb=1' } }], ['Tutorials', { page: 'qa' }], ['Documentation', { page: 'resources' }], ['Help Center', { page: 'qa' }]] },
      { h: 'Reference', small: true, items: [['Codes', { page: 'resources', sub: 'codes' }], ['AIA & NOMA', { page: 'resources', sub: 'aia' }], ['Education', { page: 'resources', sub: 'education' }], ['International', { page: 'resources', sub: 'international' }], ['AI policy', { page: 'ai-policy' }]] }] },
    { id: 'pricing', label: 'Pricing', cols: [
      { h: 'Pricing', items: [['Plans', { page: 'pricing' }], ['Compare Features', { page: 'pricing', scroll: 'table' }], ['Credits', { page: 'pricing', scroll: 'Credits' }]] }] }
  ];

  /* ------------------------------------------------------------------ go(): run one destination */
  async function waitFor(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(120); } return null; }
  function findByText(rootEl, text, sel = 'button,a,[role=tab],h1,h2,h3,label,.du-chip') {
    if (!rootEl) return null; if (/^[#.\[]/.test(text)) return rootEl.querySelector(text);
    const want = text.toLowerCase();
    const els = [...rootEl.querySelectorAll(sel)].filter(e => e.offsetParent !== null || e.getClientRects().length);
    return els.find(e => e.textContent.trim().toLowerCase() === want) || els.find(e => e.textContent.trim().toLowerCase().startsWith(want)) || null;
  }
  let lastNavFromStudio = 0;
  async function go(a, opts = {}) {
    if (!a) return;
    closeAll();
    if (a.fn) { await maybeTransition(opts.section, opts); a.fn(); return; }
    if (a.page) { if (a.signedIn && P()?.isSignedIn?.()) return go(a.signedIn, opts); return goPublic(a.page, a.sub, a.scroll); }
    if (a.embed) { await openPortalTabWith('discover'); return; }
    const tab = a.tab; if (!tab) return;
    if (!P()?.isSignedIn?.()) { if (window.DrawUpPortal) { $('#drawup-signin')?.click(); } return; }
    const section = TAB_SECTION[tab] || null;
    lastNavFromStudio = Date.now();
    await maybeTransition(opts.section || section, opts);
    if (a.view || a.prefill || a.fresh) { window.DrawUpTeam?.open?.({ view: a.view, prefill: a.prefill, fresh: a.fresh }); }
    else if (a.hash) { history.replaceState(null, '', a.hash); P().openPortalTab(tab); }
    else if (a.sub && tab === 'discover') { history.replaceState(null, '', '#portal/discover'); P().openPortalTab('discover'); const w = $('#du-workspace-content'); const b = await waitFor(() => w.querySelector(`.subtab[data-sub="${a.sub}"]`)); b?.click(); }
    else { history.replaceState(null, '', '#portal/' + tab); P().openPortalTab(tab); }
    const w = $('#du-workspace-content');
    if (a.openStarter) { const b = await waitFor(() => w.querySelector('.du-starter-project [data-open-proj]')); b?.click(); }
    if (a.openProject) { const b = await waitFor(() => w.querySelector(`[data-open-proj="${a.openProject}"]`)); b?.click(); }
    if (a.click) { const b = await waitFor(() => findByText(w, a.click)); if (b) { b.click(); } }
    if (a.focus) { const f = await waitFor(() => w.querySelector(a.focus)); if (f) { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); f.focus(); } }
    if (a.scroll) { const el = await waitFor(() => findByText(w, a.scroll)); if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120); }
  }
  async function openPortalTabWith(tab) { history.replaceState(null, '', '#portal/' + tab); P()?.openPortalTab(tab); }
  /* Public pages: click the original link so the original page router (showPage/setSubtab) runs. */
  function goPublic(page, sub, scroll) {
    closeAll();
    if (STUDIO_PAGES[page]) { showStudioPage(page, scroll); return; }
    hideStudioPages();
    const orig = (sub && $(`nav.nav a[data-page="${page}"][data-sub="${sub}"]`)) || $(`nav.nav .nav-link[data-page="${page}"]`) || $(`nav.nav a[data-page="${page}"]`) || $(`a[data-page="${page}"]`);
    if (orig) orig.click(); else location.hash = '#' + page;
    if (sub && !(orig && orig.dataset.sub === sub)) { const st = $(`#page-${page} .subtab[data-sub="${sub}"]`); st?.click(); }
    setPublicActive(page);
    if (scroll) setTimeout(() => { const pg = $('#page-' + page); const el = /^[#.]/.test(scroll) ? $(scroll) : findByText(pg, scroll, 'h1,h2,h3,table,th,.eyebrow'); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
  }

  /* New public pages (Products, Solutions) live in their own <section class="page"> elements. The original
     router only knows the pages that existed when it started, so these are shown and hidden here. */
  const STUDIO_PAGES = {};
  function registerPage(id, build) { STUDIO_PAGES[id] = build; }
  function showStudioPage(id, scroll) {
    let pg = $('#page-' + id);
    if (!pg) { const main = $('#main') || document.body; pg = document.createElement('section'); pg.className = 'page dus-page'; pg.id = 'page-' + id; main.appendChild(pg); STUDIO_PAGES[id](pg); }
    $$('#main > .page, section.page').forEach(x => { x.hidden = x !== pg; });
    $$('nav.nav .nav-link').forEach(a => a.classList.remove('active'));
    const bb = $('#back-bar'); if (bb) bb.hidden = false;
    history.replaceState(null, '', '#' + id); setPublicActive(id);
    window.scrollTo(0, 0);
    if (scroll) setTimeout(() => $(scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }
  function hideStudioPages() { $$('section.dus-page').forEach(x => { x.hidden = true; }); }
  // Deep links (#products) and Back to a page the original router does not know.
  function routeStudioHash() { const id = (location.hash || '').slice(1).split('?')[0]; if (STUDIO_PAGES[id] && !isPortalOpen()) showStudioPage(id); }

  /* ------------------------------------------------------------------ mega menu controller (shared) */
  let openId = null, hoverT = null, closeT = null, megaModel = null, megaEl = null, scrim = null;
  function megaHTML(cat) {
    const cols = cat.cols || [];
    const colsHTML = cols.map(col => {
      if (col.recent) {
        const list = (D.projects || []).filter(p => !p.starter_key).slice(0, 4);
        return `<div class="dus-mega__col dus-mega__col--small"><h3>${esc(col.h)}</h3>${list.length ? list.map(p => { const cv = D.covers.get(p.id); return `<button type="button" class="dus-mega__recent" data-dus-go='${esc(JSON.stringify(T('projects', { openProject: p.id })))}'><i style="${cv ? `background-image:url('${esc(cv.url)}')` : `background-image:url('${ART}holo-generic.webp')`}"></i><span>${esc(p.project_name)}<small>${esc(p.project_phase || p.project_type || '')}</small></span></button>`; }).join('') : `<button type="button" data-dus-go='${esc(JSON.stringify(T('projects', { click: '#du-new-project' })))}'>Start your first project<small>Projects you open show up here.</small></button>`}</div>`;
      }
      return `<div class="dus-mega__col${col.small ? ' dus-mega__col--small' : ''}"><h3>${esc(col.h)}</h3>${col.items.map((it, i) => `<button type="button" style="transition-delay:${40 + i * 25}ms" data-dus-go='${esc(JSON.stringify(it[1]))}'>${esc(it[0])}${it[2] ? `<small>${esc(it[2])}</small>` : ''}</button>`).join('')}</div>`;
    }).join('');
    const f = cat.feature;
    const feat = f ? `<button type="button" class="dus-mega__feature" style="background-image:url('${ART}${f.art}')" data-dus-go='${esc(JSON.stringify(f.go))}'><b>${esc(f.title)}</b><span>${esc(f.text)}</span></button>` : '<div></div>';
    return `<div class="dus-mega__inner" style="--cols:${cols.length}">${colsHTML}${feat}</div>`;
  }
  function openMega(id, nav, focusFirst) {
    const cat = megaModel.find(c => c.id === id); if (!cat || !cat.cols) { closeMega(); return; }
    clearTimeout(closeT);
    if (openId === id && megaEl.classList.contains('is-open')) return;
    megaEl.innerHTML = megaHTML(cat);
    const inner = megaEl.firstElementChild; const h = inner.scrollHeight;
    megaEl.style.height = h + 'px'; megaEl.classList.add('is-open'); (nav._scrim || scrim).classList.add('is-open');
    $$('.dus-link[aria-haspopup]', nav).forEach(b => b.setAttribute('aria-expanded', String(b.dataset.cat === id)));
    openId = id;
    if (focusFirst) setTimeout(() => megaEl.querySelector('button,a')?.focus(), 30);
  }
  function closeMega() {
    if (!megaEl) return; megaEl.classList.remove('is-open'); megaEl.style.height = '0px'; $$('.dus-scrim').forEach(x => x.classList.remove('is-open'));
    $$('.dus-link[aria-haspopup]').forEach(b => b.setAttribute('aria-expanded', 'false')); openId = null;
  }
  function closeAll() { closeMega(); $$('.dus-pop.is-open').forEach(p => p.classList.remove('is-open')); $$('[data-dus-pop]').forEach(b => b.setAttribute('aria-expanded', 'false')); closeSheet(); }
  function bindMega(nav, model) {
    // The public and Portal bars each own a mega panel; whichever bar the pointer or focus is in drives the controller.
    const use = () => { if (megaEl !== nav.querySelector('.dus-mega')) { closeMega(); megaEl = nav.querySelector('.dus-mega'); } megaModel = model; };
    use();
    nav.addEventListener('pointerenter', use, true); nav.addEventListener('focusin', use); nav.addEventListener('pointerdown', use, true);
    $$('.dus-link[data-cat]', nav).forEach(b => {
      const cat = model.find(c => c.id === b.dataset.cat);
      b.addEventListener('pointerenter', e => { if (e.pointerType !== 'mouse') return; clearTimeout(hoverT); clearTimeout(closeT); hoverT = setTimeout(() => cat.cols ? openMega(cat.id, nav) : closeMega(), openId ? 0 : 140); });
      b.addEventListener('pointerleave', e => { if (e.pointerType !== 'mouse') return; clearTimeout(hoverT); closeT = setTimeout(closeMega, 260); });
      b.addEventListener('click', e => {
        e.preventDefault();
        // Touch: the first tap opens the menu (it has no hover); mouse and keyboard go straight to the area.
        if (cat.cols && b.dataset.lastPointer === 'touch' && openId !== cat.id) { openMega(cat.id, nav, false); return; }
        if (cat.go) go(cat.go, { section: cat.id }); else if (cat.cols) openMega(cat.id, nav, true);
      });
      b.addEventListener('pointerdown', e => { b.dataset.lastPointer = e.pointerType; });
      b.addEventListener('keydown', e => {
        if ((e.key === 'ArrowDown' || e.key === ' ') && cat.cols) { e.preventDefault(); openMega(cat.id, nav, true); }
        if (e.key === 'Escape') { closeMega(); b.focus(); }
      });
    });
    megaEl.addEventListener('pointerenter', () => clearTimeout(closeT));
    megaEl.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') closeT = setTimeout(closeMega, 260); });
    megaEl.addEventListener('keydown', e => {
      const items = $$('button,a', megaEl); const i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { const id = openId; closeMega(); nav.querySelector(`.dus-link[data-cat="${id}"]`)?.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, i + 1)]?.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(0, i - 1)]?.focus(); }
    });
    megaEl.addEventListener('focusout', e => { if (!megaEl.contains(e.relatedTarget) && !nav.contains(e.relatedTarget)) closeMega(); });
  }
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-dus-go]'); if (g) { e.preventDefault(); e.stopPropagation(); let a = null; try { a = JSON.parse(g.dataset.dusGo); } catch (_e) {} const sec = a?.tab ? TAB_SECTION[a.tab] : null; go(a, { section: sec }); return; }
    if (!e.target.closest('.dus-pop,[data-dus-pop],.dus-mega,.dus-link,.dus-sheet,.dus-burger')) closeAll();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

  /* ------------------------------------------------------------------ portal navigation */
  function portalNavHTML() {
    return `<div class="dus-nav__inner"><button type="button" class="dus-brand" data-dus-go='${JSON.stringify(T('dashboard'))}' aria-label="DrawUp Portal, Dashboard"><b>DrawUp</b><small>Portal</small></button>
      <nav class="dus-links" aria-label="Portal">${PORTAL_NAV.map(c => `<button type="button" class="dus-link" data-cat="${c.id}"${c.cols ? ' aria-haspopup="true" aria-expanded="false"' : ''}>${esc(c.label)}</button>`).join('')}</nav>
      <div class="dus-right">
        <button type="button" class="dus-iconbtn" data-dus-search aria-label="Search DrawUp">${ico('search')}</button>
        <button type="button" class="dus-iconbtn" data-dus-pop="notes" aria-haspopup="true" aria-expanded="false" aria-label="Notifications">${ico('bell')}<span class="dus-dot" hidden></span></button>
        <button type="button" class="dus-avatar" data-dus-pop="acct" aria-haspopup="true" aria-expanded="false" aria-label="Account">DU</button>
        <button type="button" class="dus-iconbtn dus-burger" data-dus-burger aria-label="Open menu" aria-expanded="false">${ico('menu')}</button>
      </div></div>
      <div class="dus-mega" role="region" aria-label="Menu"></div>
      <div class="dus-pop" data-pop="acct" role="menu"></div>
      <div class="dus-pop" data-pop="notes" role="dialog" aria-label="Notifications"></div>`;
  }
  function acctHTML() {
    const prof = D.profile || {}; const av = $('#du-avatar'); const name = $('#du-menu-name')?.textContent || prof.display_name || 'DrawUp Member'; const user = $('#du-menu-user')?.textContent || '';
    const plan = $('#du-plan-status')?.textContent || '';
    const hq = $('.du-side [data-du-hq]'); const isHQ = hq && !hq.hidden;
    return `<div class="dus-pop__head"><span class="dus-avatar${av?.classList.contains('has-photo') ? ' has-photo' : ''}" style="${av?.style.backgroundImage ? `background-image:${av.style.backgroundImage}` : ''}">${esc(av?.textContent || 'DU')}</span><div><b>${esc(name)}</b><span>${esc(user)}</span></div></div>
      <button class="dus-pop__item" role="menuitem" data-dus-go='${JSON.stringify(T('profile'))}'>Profile ${ico('user')}</button>
      <button class="dus-pop__item" role="menuitem" data-dus-coach>Arch Coach character ${ico('spark')}</button>
      <button class="dus-pop__item" role="menuitem" data-dus-go='${JSON.stringify(T('account'))}'>Subscription <small>${esc(plan.split('·')[0] || '')}</small></button>
      <button class="dus-pop__item" role="menuitem" data-dus-go='${JSON.stringify(T('account'))}'>Credits <small>${esc((plan.split('·')[1] || '').trim())}</small></button>
      <button class="dus-pop__item" role="menuitem" data-dus-prefs-open>Preferences ${ico('gear')}</button>
      <button class="dus-pop__item" role="menuitem" data-dus-go='${JSON.stringify(T('account'))}'>Settings</button>
      ${isHQ ? `<button class="dus-pop__item" role="menuitem" data-dus-go='${JSON.stringify(T('hq'))}'>DrawUp HQ</button>` : ''}
      <div class="dus-pop__sep"></div>
      <button class="dus-pop__item dus-pop__item--out" role="menuitem" data-du-action="signout">Sign out</button>`;
  }
  async function notesHTML(box) {
    box.innerHTML = '<h4>Notifications</h4><div class="dus-empty-s">Loading…</div>';
    try {
      const { data, error } = await sb().from('drawup_notifications').select('id,title,body,href,created_at,read_at').order('created_at', { ascending: false }).limit(12);
      if (error) throw error;
      box.innerHTML = '<h4>Notifications</h4>' + ((data || []).length ? data.map(n => `<button class="dus-note${n.read_at ? '' : ' is-unread'}" data-note="${esc(n.id)}" data-href="${esc(n.href || '')}"><b>${esc(n.title)}</b><span>${esc(n.body || '')}</span><small>${esc(ago(n.created_at))}</small></button>`).join('') : '<div class="dus-empty-s">You are all caught up. Finished AI work, check results and messages show up here.</div>');
      $$('[data-note]', box).forEach(b => b.onclick = async () => { try { await sb().from('drawup_notifications').update({ read_at: new Date().toISOString() }).eq('id', b.dataset.note); } catch (_e) {} closeAll(); if (b.dataset.href) location.hash = b.dataset.href.replace(/^#/, ''); refreshDot(); });
    } catch (e) { box.innerHTML = '<h4>Notifications</h4><div class="dus-empty-s">Notifications could not load.</div>'; }
  }
  async function refreshDot() {
    try { const { count } = await sb().from('drawup_notifications').select('id', { count: 'exact', head: true }).is('read_at', null); $$('.dus-dot').forEach(d => d.hidden = !count); } catch (_e) {}
  }
  function bindPops(nav) {
    $$('[data-dus-pop]', nav).forEach(b => b.addEventListener('click', async e => {
      e.preventDefault(); e.stopPropagation();
      const pop = nav.querySelector(`[data-pop="${b.dataset.dusPop}"]`); const was = pop.classList.contains('is-open');
      closeAll(); if (was) return;
      if (b.dataset.dusPop === 'acct') pop.innerHTML = acctHTML(); else notesHTML(pop);
      pop.classList.add('is-open'); b.setAttribute('aria-expanded', 'true');
      if (b.dataset.dusPop === 'acct') setTimeout(() => pop.querySelector('button')?.focus(), 20);
    }));
    nav.addEventListener('click', e => {
      if (e.target.closest('[data-dus-coach]')) { closeAll(); window.DrawUpCoach?.open?.(); }
      if (e.target.closest('[data-dus-prefs-open]')) { closeAll(); openPrefsModal(); }
      if (e.target.closest('[data-dus-search]')) { closeAll(); if (P()?.isSignedIn?.() && isPortalOpen()) go(T('search'), { section: 'discover' }); else goPublic('home', null, '#drawup-search-input'); setTimeout(() => $('#drawup-search-input')?.focus(), 300); }
      if (e.target.closest('[data-dus-burger]')) { e.stopPropagation(); toggleSheet(nav); }
    });
  }
  function openPrefsModal() {
    $('#dus-prefs-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div id="dus-prefs-modal" class="dus-modal" role="dialog" aria-modal="true" aria-labelledby="dus-prefs-h"><div class="dus-modal__card"><button type="button" class="dus-modal__x" aria-label="Close">${ico('close')}</button><span class="dus-kicker">Preferences</span><h2 id="dus-prefs-h" class="dus-h3" style="margin:10px 0 6px">Studio preferences</h2><p class="dus-muted-s">Saved to your account, so they follow you to every device.</p><div data-dus-prefs></div><div class="dus-modal__foot"><button type="button" class="dus-btn dus-btn--light dus-btn--sm" data-dus-go='${JSON.stringify(T('ai-team', { view: 'chat' }))}'>AI Team settings</button><button type="button" class="dus-btn dus-btn--primary dus-btn--sm" data-dus-close>Done</button></div></div></div>`);
    const m = $('#dus-prefs-modal'); renderPrefControls();
    const close = () => m.remove(); m.querySelector('.dus-modal__x').onclick = close; m.querySelector('[data-dus-close]').onclick = close; m.addEventListener('click', e => { if (e.target === m) close(); });
    m.querySelector('[data-dus-pref]')?.focus();
  }

  /* mobile sheet (≤1020px): the same groups as accordions */
  let sheetEl = null;
  function sheetHTML(model, isPortal) {
    return model.map(c => c.cols ? `<details><summary>${esc(c.label)}</summary><div class="dus-sheet__links">${c.go ? `<button type="button" data-dus-go='${esc(JSON.stringify(c.go))}'>Open ${esc(c.label)}</button>` : ''}${c.cols.filter(col => !col.recent).flatMap(col => col.items).map(it => `<button type="button" data-dus-go='${esc(JSON.stringify(it[1]))}'>${esc(it[0])}</button>`).join('')}</div></details>` : `<button type="button" class="dus-sheet__direct" data-dus-go='${esc(JSON.stringify(c.go))}'>${esc(c.label)}</button>`).join('') +
      (isPortal ? '' : `<div class="dus-sheet__cta"><button type="button" class="dus-btn dus-btn--ghost-dark" data-dus-signin>Sign in</button><button type="button" class="dus-btn dus-btn--peach" data-dus-join>Get Started</button></div>`);
  }
  function toggleSheet(nav) {
    if (sheetEl && sheetEl.classList.contains('is-open')) { closeSheet(); return; }
    closeAll();
    const isPortal = nav.id === 'dus-pnav';
    if (!sheetEl) { sheetEl = document.createElement('div'); sheetEl.className = 'dus-sheet'; sheetEl.setAttribute('role', 'dialog'); sheetEl.setAttribute('aria-label', 'Menu'); document.body.appendChild(sheetEl); }
    sheetEl.innerHTML = sheetHTML(isPortal ? PORTAL_NAV : PUBLIC_NAV, isPortal);
    sheetEl.classList.add('is-open'); $$('[data-dus-burger]').forEach(b => b.setAttribute('aria-expanded', 'true'));
    document.documentElement.style.overflow = 'hidden';
  }
  function closeSheet() { if (!sheetEl) return; sheetEl.classList.remove('is-open'); $$('[data-dus-burger]').forEach(b => b.setAttribute('aria-expanded', 'false')); document.documentElement.style.overflow = ''; }

  function setPortalActive() {
    const m = /^#portal(?:\/([a-z-]+))?/.exec(location.hash || ''); const tab = m ? (m[1] || 'dashboard') : null;
    const sec = tab ? TAB_SECTION[tab] : null;
    $$('#dus-pnav .dus-link').forEach(b => { const on = b.dataset.cat === sec; b.classList.toggle('is-active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  }
  function syncAvatar() {
    const src = $('#du-avatar'); const a = $('#dus-pnav .dus-avatar'); if (!src || !a) return;
    a.textContent = src.textContent; a.style.backgroundImage = src.style.backgroundImage || ''; a.classList.toggle('has-photo', src.classList.contains('has-photo'));
  }
  function mountPortalNav() {
    const portal = $('#du-portal'); if (!portal || $('#dus-pnav')) return !!$('#dus-pnav');
    const nav = document.createElement('header'); nav.id = 'dus-pnav'; nav.className = 'dus-nav'; nav.innerHTML = portalNavHTML();
    portal.insertBefore(nav, portal.firstChild);
    megaEl = nav.querySelector('.dus-mega');
    // the Portal is its own stacking layer, so it gets its own scrim under its bar
    const ps = document.createElement('div'); ps.className = 'dus-scrim'; ps.addEventListener('click', closeAll); portal.insertBefore(ps, nav.nextSibling); nav._scrim = ps;
    if (!scrim) { scrim = document.createElement('div'); scrim.className = 'dus-scrim'; document.body.appendChild(scrim); scrim.addEventListener('click', closeAll); }
    bindMega(nav, PORTAL_NAV); bindPops(nav); setPortalActive(); syncAvatar();
    const av = $('#du-avatar'); if (av) new MutationObserver(syncAvatar).observe(av, { attributes: true, childList: true, characterData: true, subtree: true });
    window.addEventListener('hashchange', setPortalActive);
    new MutationObserver(() => { setPortalActive(); onTabRendered(); }).observe($('#du-workspace-content') || portal, { childList: true });
    return true;
  }

  /* ------------------------------------------------------------------ public navigation */
  function publicNavHTML() {
    return `<div class="dus-nav__inner"><a class="dus-brand" href="#home" data-dus-home aria-label="DrawUp home"><b>DrawUp</b></a>
      <nav class="dus-links" aria-label="DrawUp">${PUBLIC_NAV.map(c => `<button type="button" class="dus-link" data-cat="${c.id}"${c.cols ? ' aria-haspopup="true" aria-expanded="false"' : ''}>${esc(c.label)}</button>`).join('')}</nav>
      <div class="dus-right dus-nav__public-actions">
        <button type="button" class="dus-iconbtn" data-dus-search aria-label="Search DrawUp">${ico('search')}</button>
        <button type="button" class="dus-link" data-dus-signin>Sign in</button>
        <button type="button" class="dus-btn dus-btn--peach dus-btn--sm" data-dus-join>Get Started</button>
        <button type="button" class="dus-iconbtn dus-burger" data-dus-burger aria-label="Open menu" aria-expanded="false">${ico('menu')}</button>
      </div></div><div class="dus-mega" role="region" aria-label="Menu"></div>`;
  }
  let pubNav = null;
  function mountPublicNav() {
    const old = $('nav.nav'); if (!old || $('#dus-pubnav')) return;
    pubNav = document.createElement('header'); pubNav.id = 'dus-pubnav'; pubNav.className = 'dus-nav dus-nav--public'; pubNav.innerHTML = publicNavHTML();
    old.parentNode.insertBefore(pubNav, old);
    const saveMega = megaEl; megaEl = pubNav.querySelector('.dus-mega');
    if (!scrim) { scrim = document.createElement('div'); scrim.className = 'dus-scrim'; document.body.appendChild(scrim); scrim.addEventListener('click', closeAll); }
    bindMega(pubNav, PUBLIC_NAV); if (saveMega) { megaEl = saveMega; megaModel = PORTAL_NAV; }
    PUBLIC_NAV.forEach(c => { if (!c.go) c.go = (c.cols[0].items[0] || [])[1]; });
    pubNav.addEventListener('click', e => {
      if (e.target.closest('[data-dus-home]')) { e.preventDefault(); goPublic('home'); }
      if (e.target.closest('[data-dus-signin]')) { e.preventDefault(); closeAll(); const s = $('#drawup-signin'); s ? s.click() : null; }
      if (e.target.closest('[data-dus-join]')) { e.preventDefault(); closeAll(); const j = $('.join-preseason'); if (j && j.style.display !== 'none') j.click(); else $('#drawup-signin')?.click(); }
      if (e.target.closest('[data-dus-search]')) { closeAll(); goPublic('home', null, '#drawup-search-input'); setTimeout(() => $('#drawup-search-input')?.focus(), 300); }
      if (e.target.closest('[data-dus-burger]')) { e.stopPropagation(); toggleSheet(pubNav); }
    });
    document.addEventListener('click', e => { if (e.target.closest('.dus-sheet [data-dus-signin]')) { closeAll(); $('#drawup-signin')?.click(); } if (e.target.closest('.dus-sheet [data-dus-join]')) { closeAll(); $('.join-preseason')?.click(); } });
    syncPublicAuth();
    new MutationObserver(syncPublicAuth).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('hashchange', () => setPublicActive((location.hash || '#home').slice(1).split('?')[0]));
    setPublicActive((location.hash || '#home').slice(1).split('?')[0]);
  }
  const PUBLIC_SECTION = { discover: 'discover', connect: 'discover', home: null, products: 'products', check: 'products', details: 'products', swap: 'products', coach: 'products', solutions: 'solutions', firms: 'solutions', resources: 'resources', qa: 'resources', pricing: 'pricing' };
  function setPublicActive(page) { const sec = PUBLIC_SECTION[page] || null; $$('#dus-pubnav .dus-link[data-cat]').forEach(b => b.classList.toggle('is-active', b.dataset.cat === sec)); }
  function syncPublicAuth() {
    if (!pubNav) return; const signed = root.classList.contains('du-authenticated');
    const s = pubNav.querySelector('[data-dus-signin]'), j = pubNav.querySelector('[data-dus-join]');
    if (s) s.textContent = signed ? 'Portal' : 'Sign in';
    if (j) j.hidden = signed;
  }

  /* ------------------------------------------------------------------ dashboard */
  const CARDS = [
    ['projects', 'Projects', 'Drawings and deliverables', 'projects', T('projects')],
    ['ai-team', 'AI Team', 'Your design intelligence', 'team', T('ai-team')],
    ['draw', 'Draw', 'Design and document', 'draw', T('draw')],
    ['check', 'CheckUp', 'Review and coordinate', 'check', T('check')],
    ['swap', 'Swap', 'Visualize and compare', 'swap', T('swap')],
    ['details', 'Details', 'Construction knowledge', 'details', T('details')]
  ];
  const ART_FOR = { projects: 'card-projects.webp', 'ai-team': 'card-team.webp', draw: 'card-draw.webp', check: 'card-check.webp', swap: 'card-swap.webp', details: 'card-details.webp' };
  function ago(d) { if (!d) return ''; const s = (Date.now() - new Date(d).getTime()) / 1000; if (s < 90) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + (Math.round(s / 3600) === 1 ? ' hour ago' : ' hours ago'); if (s < 86400 * 30) { const d2 = Math.round(s / 86400); return d2 + (d2 === 1 ? ' day ago' : ' days ago'); } return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  const agoShort = d => ago(d).replace(' hours ago', 'h ago').replace(' hour ago', 'h ago').replace(' days ago', 'd ago').replace(' day ago', 'd ago').replace(' min ago', 'm ago');
  async function loadActivity(me) {
    const c = sb(); const q = (p) => p.then(r => r.data || []).catch(() => []);
    const [sets, checks, swaps, threads, jobs, details] = await Promise.all([
      q(c.from('drawing_generations').select('id,title,project_thread_id,created_at').eq('owner_id', me).order('created_at', { ascending: false }).limit(5)),
      q(c.from('check_reviews').select('id,title,status,created_at').eq('owner_id', me).order('created_at', { ascending: false }).limit(5)),
      q(c.from('swap_generations').select('id,status,prompt,created_at').eq('owner_id', me).order('created_at', { ascending: false }).limit(5)),
      q(c.from('coach_threads').select('id,title,updated_at,project_thread_id').eq('owner_id', me).order('updated_at', { ascending: false }).limit(5)),
      q(c.from('team_jobs').select('id,title,status,kind,coach_thread_id,created_at').eq('owner_id', me).order('created_at', { ascending: false }).limit(5)),
      q(c.from('details').select('id,title,code,created_at,source').eq('owner_id', me).order('created_at', { ascending: false }).limit(4))
    ]);
    const items = [];
    sets.forEach(s => items.push({ at: s.created_at, icon: 'file', text: 'Drawing set saved · ' + (s.title || 'Drawing set'), go: { fn: () => window.DrawUpDrawIt?.openInCoach?.({ setId: s.id }) } }));
    checks.forEach(k => items.push({ at: k.created_at, icon: 'check', text: (k.status === 'complete' ? 'CheckUp completed · ' : k.status === 'failed' ? 'CheckUp could not finish · ' : 'CheckUp in progress · ') + (k.title || 'Review'), go: T('check', { hash: '#portal/check?id=' + k.id }) }));
    swaps.forEach(s => items.push({ at: s.created_at, icon: 'swap', text: (s.status === 'complete' ? 'Swap render ready' : 'Swap ' + (s.status || 'queued')) + (s.prompt ? ' · ' + s.prompt.slice(0, 48) : ''), go: T('swap') }));
    threads.forEach(t => items.push({ at: t.updated_at, icon: 'msg', text: 'AI Team conversation · ' + (t.title || 'Conversation'), go: { fn: () => window.DrawUpTeam?.open?.({ threadId: t.id }) } }));
    jobs.forEach(j => items.push({ at: j.created_at, icon: 'spark', text: (j.status === 'done' || j.status === 'complete' ? 'AI Team finished · ' : j.status === 'running' ? 'AI Team working on · ' : 'AI Team · ') + (j.title || 'Background task'), go: T('ai-team', { view: 'jobs' }) }));
    details.forEach(d => items.push({ at: d.created_at, icon: 'layers', text: 'Detail added to library · ' + (d.code ? d.code + ' ' : '') + (d.title || ''), go: T('details') }));
    return items.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5);
  }
  const recentKey = 'du-studio-recent-v26';
  function rememberVisit(tab) { if (!tab || tab === 'dashboard') return; try { const list = JSON.parse(localStorage.getItem(recentKey) || '[]').filter(x => x.tab !== tab); list.unshift({ tab, at: Date.now(), hash: location.hash }); localStorage.setItem(recentKey, JSON.stringify(list.slice(0, 6))); } catch (_e) {} }
  const TAB_INFO = { projects: ['Projects', 'projects'], 'ai-team': ['AI Team', 'team'], 'arch-coach': ['Arch Coach', 'spark'], draw: ['Draw', 'draw'], check: ['CheckUp', 'check'], swap: ['Swap', 'swap'], details: ['Details', 'details'], discover: ['Discover', 'discover'], search: ['Search', 'search'], connect: ['Connect', 'connect'], firm: ['Firm', 'firm'], team: ['Team', 'team'], profile: ['Profile', 'user'], account: ['Account', 'gear'] };

  /* ------------------------------------------------------------------ Arch Coach legends (the member's approved artwork, shown as is)
   * The picture is Jaja's own Arch Coach legends image. Everything you can use on it is real HTML laid over it at the same place:
   * the ask bar (type, paste text or pictures, attach or drop files) sends to the Arch Coach tab, and each legend opens the legend picker
   * (DrawUpCoach), where the XP locks still apply. Positions are percentages of the 1640 x 959 picture. */
  const LEG_W = 1640, LEG_H = 959;
  const LEGENDS = [
    ['', 'DrawUp General', [47, 686, 197, 912]],
    ['paul-r-williams', 'Paul R. Williams', [213, 686, 365, 912], [0, 0, 200, 480]],
    ['julia-morgan', 'Julia Morgan', [387, 686, 533, 912], [200, 0, 392, 480]],
    ['frank-lloyd-wright', 'Frank Lloyd Wright', [555, 686, 700, 912], [392, 0, 612, 480]],
    ['zaha-hadid', 'Zaha Hadid', [722, 686, 874, 912], [612, 0, 896, 480]],
    ['norma-merrick-sklarek', 'Norma Merrick Sklarek', [898, 686, 1048, 912], [896, 0, 1020, 480]],
    ['ove-arup', 'Ove Arup', [1071, 686, 1218, 912], [1020, 0, 1240, 480]],
    ['i-m-pei', 'I. M. Pei', [1241, 686, 1398, 912], [1240, 0, 1440, 480]],
    ['fazlur-rahman-khan', 'Fazlur Rahman Khan', [1426, 686, 1586, 912], [1440, 0, 1640, 480]]
  ];
  const AC_ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf,.pdf,.txt,.md,.csv,.json,text/plain';
  const AC_OK = f => /^image\/(png|jpeg|webp)$/.test(f.type) || f.type === 'application/pdf' || /^text\//.test(f.type) || /\.(pdf|txt|md|csv|json)$/i.test(f.name || '');
  const pct = ([x0, y0, x1, y1]) => `left:${(x0 / LEG_W * 100).toFixed(3)}%;top:${(y0 / LEG_H * 100).toFixed(3)}%;width:${((x1 - x0) / LEG_W * 100).toFixed(3)}%;height:${((y1 - y0) / LEG_H * 100).toFixed(3)}%`;
  function legendsSection() {
    return `<section class="dus-legends" aria-labelledby="dus-legends-h">
      <h2 id="dus-legends-h" class="dus-sr">Arch Coach. Perspective builds better design. Choose a legend to guide your Arch Coach, or start with DrawUp General.</h2>
      <div class="dus-legends__art">
        <div class="dus-legends__pic"><img src="${ART}arch-coach-legends.webp" width="${LEG_W}" height="${LEG_H}" alt="" decoding="async" loading="lazy">
        ${LEGENDS.filter(l => l[3]).map(l => `<button type="button" class="dus-legends__hit dus-legends__hit--band" tabindex="-1" aria-hidden="true" data-dus-legend="${l[0]}" style="${pct(l[3])}"></button>`).join('')}
        ${LEGENDS.map(l => `<button type="button" class="dus-legends__hit" data-dus-legend="${l[0]}" style="${pct(l[2])}" aria-label="${l[0] ? esc(l[1]) + ': make this your go-to legend' : 'DrawUp General: choose a legend each time you ask'}"></button>`).join('')}</div>
        <form class="dus-legends__bar" data-dus-legends-form style="${pct([286, 580, 1353, 659])}">
          <label class="dus-legends__clip" title="Attach pictures or files">${ico('clip')}<span class="dus-sr">Attach pictures or files</span><input type="file" multiple accept="${AC_ACCEPT}" hidden data-dus-legends-file></label>
          <label class="dus-sr" for="dus-legends-input">Ask Arch Coach</label>
          <input id="dus-legends-input" autocomplete="off" placeholder="Ask Arch Coach a question, upload a file, or explore your next move…">
          <button class="dus-legends__send" aria-label="Send to Arch Coach">${ico('up')}</button>
        </form>
      </div>
      <div class="dus-legends__files" data-dus-legends-files hidden></div>
      <p class="dus-legends__status" role="status" data-dus-legends-status></p>
    </section>`;
  }
  function bindLegends(w) {
    const box = w.querySelector('.dus-legends'); if (!box) return;
    const form = box.querySelector('[data-dus-legends-form]'), inp = box.querySelector('#dus-legends-input');
    const fileIn = box.querySelector('[data-dus-legends-file]'), list = box.querySelector('[data-dus-legends-files]'), st = box.querySelector('[data-dus-legends-status]');
    let files = [];
    const say = t => { st.textContent = t || ''; };
    const paint = () => {
      list.hidden = !files.length;
      list.innerHTML = files.map((f, i) => `<span class="dus-legends__file">${ico(/^image\//.test(f.type) ? 'image' : 'file')}<b>${esc(f.name || 'Pasted picture')}</b><button type="button" data-dus-unfile="${i}" aria-label="Remove ${esc(f.name || 'pasted picture')}">${ico('close')}</button></span>`).join('');
      $$('[data-dus-unfile]', list).forEach(b => b.onclick = () => { files.splice(+b.dataset.dusUnfile, 1); paint(); inp.focus(); });
    };
    const add = incoming => {
      let skipped = 0;
      for (const f of incoming) {
        if (!AC_OK(f)) { skipped++; continue; }
        if (f.size > 15 * 1024 * 1024) { say(`${f.name || 'That file'} is over 15 MB.`); continue; }
        if (files.length >= 5) { say('Attach up to 5 files per message.'); break; }
        // pasted screenshots arrive as "image.png"; give them a clearer name
        files.push(f.name && f.name !== 'image.png' ? f : new File([f], `pasted-${Date.now()}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }));
      }
      if (skipped) say('Arch Coach takes pictures (PNG, JPG, WebP), PDFs and text files.');
      paint();
    };
    fileIn.onchange = () => { add([...(fileIn.files || [])]); fileIn.value = ''; inp.focus(); };
    inp.addEventListener('paste', e => {
      const items = [...(e.clipboardData?.items || [])].filter(it => it.kind === 'file').map(it => it.getAsFile()).filter(Boolean);
      if (items.length) { if (!e.clipboardData.getData('text/plain')) e.preventDefault(); add(items); }
    });
    const art = box.querySelector('.dus-legends__art');
    ['dragenter', 'dragover'].forEach(t => box.addEventListener(t, e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); art.classList.add('is-drop'); } }));
    ['dragleave', 'drop'].forEach(t => box.addEventListener(t, e => { if (t === 'dragleave' && box.contains(e.relatedTarget)) return; art.classList.remove('is-drop'); }));
    box.addEventListener('drop', e => { if (e.dataTransfer?.files?.length) { e.preventDefault(); add([...e.dataTransfer.files]); inp.focus(); } });
    form.onsubmit = async e => {
      e.preventDefault();
      const text = inp.value.trim();
      if (!text && !files.length) { inp.focus(); return; }
      form.classList.add('is-busy'); say('Opening Arch Coach…');
      try { await sendToCoach(text, files); inp.value = ''; files = []; paint(); say(''); }
      catch (err) { say(err.message || 'Arch Coach did not open. Try again.'); }
      finally { form.classList.remove('is-busy'); }
    };
    $$('[data-dus-legend]', box).forEach(b => b.onclick = () => {
      const key = b.dataset.dusLegend;
      if (!key) { inp.focus(); say('DrawUp General is on. Ask anything, then choose a legend for a second opinion after any answer.'); return; }
      openLegend(key);
    });
  }
  async function openLegend(key) {
    const C = window.DrawUpCoach; if (!C?.open) { go(T('arch-coach')); return; }
    await C.open('legend');
    // put focus on that legend in the picker; locked legends stay disabled and say how much XP unlocks them
    const b = await waitFor(() => document.querySelector(`.ac-legend[data-legend="${CSS.escape(key)}"]`), 4000);
    if (b) { b.scrollIntoView({ block: 'center' }); if (!b.disabled) { b.click(); b.focus(); } else { b.classList.add('dus-pulse'); b.closest('[role=radiogroup]')?.querySelector('.ac-legend:not([disabled])')?.focus(); } }
  }
  // Hands the question and files to the existing Arch Coach tab, in a new thread, through its own form, so saving, uploads,
  // credits and replies all work exactly as they do there.
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

  async function renderDashboard(w) {
    w.classList.add('dus-full');
    const c = sb(); const me = await uid();
    const name = ($('#du-menu-name')?.textContent || '').trim() || 'there';
    const first = name.split(/\s+/)[0];
    w.innerHTML = `<div class="dus-dash"><section class="dus-hero" aria-label="Welcome"><div class="dus-hero__art"><img src="${ART}hero-studio.webp" alt="" decoding="async" fetchpriority="high"></div><i class="dus-hero__scan" aria-hidden="true"></i>
      <div class="dus-hero__copy"><div><p class="dus-hero__hello">Good to see you again,</p><h1 class="dus-hero__name">${esc(first)}.</h1><p class="dus-hero__tag">Your projects. Your tools. Your studio.</p>
        <div class="dus-hero__actions"><button type="button" class="dus-btn dus-btn--primary" data-dus-new>${ico('plus')} Create new project</button><button type="button" class="dus-circle" data-dus-heromore aria-label="More quick actions" aria-haspopup="true">${ico('dots')}</button></div></div>
        <div class="dus-hero__project" id="dus-hero-project"></div></div></section>
      <div class="dus-sect"><div class="dus-sect__head"><h2>Your workspace</h2><button type="button" class="dus-textlink" data-dus-go='${JSON.stringify(T('projects'))}'>View all projects <span class="dus-circle">${ico('right')}</span></button></div>
        <div class="dus-cards">${CARDS.map(cd => `<button type="button" class="dus-card" data-dus-go='${esc(JSON.stringify(cd[4]))}'><span class="dus-card__art"><img src="${ART}${ART_FOR[cd[0]]}" alt="" loading="lazy" decoding="async"></span><span class="dus-card__ico">${ico(cd[3])}</span><b>${cd[1]}</b><small>${cd[2]}</small><span class="dus-card__go">${ico('right')}</span></button>`).join('')}</div>
        ${legendsSection()}
        <div class="dus-grid3 dus-grid3--two">
          <section class="dus-panel" aria-label="Recent projects"><h3>Recent projects <button type="button" data-dus-go='${JSON.stringify(T('projects'))}'>All projects</button></h3><div id="dus-recent">${'<div class="dus-prow"><i class="dus-skel"></i><div><b class="dus-skel" style="width:70%;height:14px"></b><span class="dus-skel" style="width:50%;height:11px;margin-top:8px"></span></div></div>'.repeat(3)}</div></section>
          <section class="dus-panel" aria-label="Activity"><h3>Activity</h3><ul class="dus-feed" id="dus-feed"><li><i class="dus-skel"></i><div class="dus-skel" style="height:30px"></div></li></ul></section>
        </div>
        <div class="dus-grid2">
          <section class="dus-panel" aria-label="Continue working"><h3>Continue working</h3><div class="dus-continue" id="dus-continue"></div></section>
          <section class="dus-panel" aria-label="Quick actions and preferences"><h3>Quick actions</h3><div class="dus-quick" id="dus-quick"></div><div style="margin-top:18px" data-dus-prefs></div></section>
        </div></div></div>`;
    renderPrefControls();
    bindLegends(w);
    w.querySelector('[data-dus-new]').onclick = () => go(T('projects', { click: '#du-new-project' }));
    w.querySelector('[data-dus-heromore]').onclick = e => { e.stopPropagation(); quickMenu(e.currentTarget); };
    const QUICK = [['spark', 'Ask the AI Team', T('ai-team', { fresh: true })], ['draw', 'Draw it up', { fn: () => window.DrawUpDrawIt?.openInCoach?.({}) }], ['check', 'Quick Check a sheet', T('check', { hash: '#portal/check?quick=1' })], ['layers', 'Draw a detail', T('details', { scroll: 'Upload one detail' })], ['swap', 'Start a swap', T('swap')], ['search', 'Search DrawUp', T('search')]];
    w.querySelector('#dus-quick').innerHTML = QUICK.map(q => `<button type="button" class="dus-chip" data-dus-go='${esc(JSON.stringify(q[2]))}'>${ico(q[0])}${esc(q[1])}</button>`).join('');
    let recent = []; try { recent = JSON.parse(localStorage.getItem(recentKey) || '[]'); } catch (_e) {}
    const cont = recent.filter(r => TAB_INFO[r.tab]).slice(0, 4);
    w.querySelector('#dus-continue').innerHTML = cont.length ? cont.map(r => `<button type="button" class="dus-cont" data-dus-go='${esc(JSON.stringify(T(r.tab, /\?/.test(r.hash || '') ? { hash: r.hash } : {})))}'><i>${ico(TAB_INFO[r.tab][1])}</i><div><b>${esc(TAB_INFO[r.tab][0])}</b><span>Last opened ${esc(ago(r.at))}</span></div></button>`).join('') : `<button type="button" class="dus-cont" data-dus-go='${JSON.stringify(T('ai-team', { fresh: true }))}'><i>${ico('team')}</i><div><b>Start with the AI Team</b><span>Where you left off shows up here.</span></div></button><button type="button" class="dus-cont" data-dus-go='${JSON.stringify(T('projects', { openStarter: true }))}'><i>${ico('projects')}</i><div><b>Starter project</b><span>Learn DrawUp in 3 steps</span></div></button>`;
    if (!me) return;
    loadActivity(me).then(items => { const f = w.querySelector('#dus-feed'); if (!f) return; f.innerHTML = items.length ? items.map(it => `<li><i>${ico(it.icon)}</i><button type="button" data-dus-go='${esc(JSON.stringify(it.go))}'><b>${esc(it.text)}</b><span>${esc(ago(it.at))}</span></button></li>`).join('') : '<li style="grid-template-columns:1fr"><div class="dus-empty-s" style="padding:0">Your drawing sets, checks, renders and AI Team work will show up here.</div></li>'; });
    const projects = await loadProjects(true).catch(() => []);
    const real = projects.filter(p => !p.starter_key); const list = (real.length ? real : projects).slice(0, 3);
    w.querySelector('#dus-recent').innerHTML = list.length ? list.map(p => { const cv = D.covers.get(p.id); return `<div class="dus-prow" role="button" tabindex="0" data-dus-go='${esc(JSON.stringify(T('projects', { openProject: p.id })))}'><i style="background-image:url('${esc(cv?.url || ART + 'holo-generic.webp')}')"></i><div><b>${esc(p.project_name)}</b><span>${esc([p.project_phase || p.project_type, 'Updated ' + agoShort(p.updated_at)].filter(Boolean).join(' · '))}</span></div><button type="button" class="dus-more" data-dus-cover="${esc(p.id)}" aria-label="Project cover and options for ${esc(p.project_name)}">${ico('dots')}</button></div>`; }).join('') : `<div class="dus-empty-s" style="padding:6px 0">No projects yet. <button type="button" class="dus-textlink" style="color:var(--dus-royal)" data-dus-go='${JSON.stringify(T('projects', { click: '#du-new-project' }))}'>Create your first project</button></div>`;
    $$('[data-dus-cover]', w).forEach(b => b.onclick = e => { e.stopPropagation(); const p = projects.find(x => x.id === b.dataset.dusCover); pickCover(p, () => renderDashboard(w)); });
    $$('.dus-prow[role=button]', w).forEach(r => r.onkeydown = e => { if (e.key === 'Enter') r.click(); });
    const hp = list[0] || null; const heroBox = w.querySelector('#dus-hero-project');
    if (hp && heroBox) {
      const cv = D.covers.get(hp.id);
      if (cv?.url) { const art = w.querySelector('.dus-hero__art'); const im = document.createElement('img'); im.className = 'dus-hero__user'; im.alt = ''; im.src = cv.url; im.decoding = 'async'; art.appendChild(im); art.classList.add('has-user'); }
      const thumbs = list.slice(0, 4).map(p => ({ p, cv: D.covers.get(p.id) }));
      heroBox.innerHTML = `<span class="dus-kicker">Recent project</span><div class="dus-hero__prow"><div><h2>${esc(hp.project_name)}</h2><p>${esc(hp.project_phase || hp.project_type || 'Project')}</p></div><button type="button" class="dus-circle dus-circle--dark" aria-label="Open ${esc(hp.project_name)}" data-dus-go='${esc(JSON.stringify(T('projects', { openProject: hp.id })))}'>${ico('upright')}</button></div>
        <div class="dus-thumbs">${thumbs.map((t, i) => `<button type="button" class="dus-thumb${i === 0 ? ' is-on' : ''}" title="${esc(t.p.project_name)}" aria-label="Open ${esc(t.p.project_name)}" style="background-image:url('${esc(t.cv?.url || ART + 'holo-generic.webp')}')" data-dus-go='${esc(JSON.stringify(T('projects', { openProject: t.p.id })))}'></button>`).join('')}<button type="button" class="dus-thumb" style="display:grid;place-items:center;color:#fff;background:rgba(8,23,41,.4)" aria-label="Change the cover of ${esc(hp.project_name)}" data-dus-cover-hero>${ico('image')}</button></div>`;
      heroBox.querySelector('[data-dus-cover-hero]').onclick = e => { e.stopPropagation(); pickCover(hp, () => renderDashboard(w)); };
    }
  }
  function quickMenu(anchor) {
    $('#dus-qm')?.remove();
    const r = anchor.getBoundingClientRect();
    document.body.insertAdjacentHTML('beforeend', `<div id="dus-qm" class="dus-pop is-open" role="menu" style="position:fixed;top:${r.bottom + 8}px;left:${Math.min(r.left, innerWidth - 300)}px;right:auto;width:280px">
      <button class="dus-pop__item" role="menuitem" data-dus-go='${JSON.stringify(T('ai-team', { fresh: true }))}'>New AI Team conversation ${ico('team')}</button>
      <button class="dus-pop__item" role="menuitem" data-dus-go='${JSON.stringify({ fn: null })}' data-dus-drawit>Draw it up from a picture ${ico('draw')}</button>
      <button class="dus-pop__item" role="menuitem" data-dus-go='${JSON.stringify(T('check', { hash: '#portal/check?quick=1' }))}'>Quick Check a sheet ${ico('check')}</button>
      <button class="dus-pop__item" role="menuitem" data-dus-go='${JSON.stringify(T('projects', { openStarter: true }))}'>Open the starter project ${ico('projects')}</button>
      <div class="dus-pop__sep"></div><button class="dus-pop__item" role="menuitem" data-dus-prefs-open2>Studio preferences ${ico('gear')}</button></div>`);
    const m = $('#dus-qm'); m.querySelector('[data-dus-drawit]').onclick = e => { e.stopPropagation(); m.remove(); window.DrawUpDrawIt?.openInCoach?.({}); };
    m.querySelector('[data-dus-prefs-open2]').onclick = () => { m.remove(); openPrefsModal(); };
    setTimeout(() => { const off = ev => { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', off, true); } }; document.addEventListener('click', off, true); m.querySelector('button')?.focus(); }, 0);
  }

  /* ------------------------------------------------------------------ project covers */
  async function pickCover(p, done) {
    if (!p) return;
    await loadProjects(true).catch(() => {});
    const list = (D.cand?.get(p.id) || []).filter(x => x.kind !== 'chosen');
    const cur = p.progress?.cover || null;
    $('#dus-cover-modal')?.remove();
    const group = (k, h) => { const items = list.filter(x => x.kind === k); return items.length ? `<h4 class="dus-cv-h">${h}</h4><div class="dus-cv-grid">${items.map((x, i) => `<button type="button" class="dus-cv${cur && cur.path === x.path ? ' is-on' : ''}" data-cv-kind="${k}" data-cv-i="${list.indexOf(x)}"><i style="${x.url ? `background-image:url('${esc(x.url)}')` : ''}">${x.kind === 'drawing' ? '<em>Drawing preview</em>' : ''}</i><span>${esc(x.label)}</span></button>`).join('')}</div>` : ''; };
    document.body.insertAdjacentHTML('beforeend', `<div id="dus-cover-modal" class="dus-modal" role="dialog" aria-modal="true" aria-labelledby="dus-cv-title"><div class="dus-modal__card dus-modal__card--wide"><button type="button" class="dus-modal__x" aria-label="Close">${ico('close')}</button>
      <span class="dus-kicker">Project cover</span><h2 id="dus-cv-title" class="dus-h3" style="margin:10px 0 6px">${esc(p.project_name)}</h2>
      <p class="dus-muted-s">The cover shows on your Dashboard, Projects, the project page, the AI Team and the Projects transition. Choosing one never deletes a render, a picture or a file.</p>
      <div class="dus-cv-auto"><button type="button" class="dus-cv${!cur ? ' is-on' : ''}" data-cv-auto><i style="background-image:url('${esc((list.find(x => x.kind === 'render' && x.url) || list.find(x => x.kind === 'upload' && x.url) || {}).url || ART + 'holo-generic.webp')}')"></i><span><b>Automatic</b> · newest render, then an uploaded picture, then a hologram</span></button></div>
      ${group('render', 'Saved renders')}${group('upload', 'Uploaded pictures')}${group('drawing', 'Drawing previews')}
      <h4 class="dus-cv-h">Upload a new picture</h4><label class="dus-cv-up"><input type="file" accept="image/jpeg,image/png,image/webp" hidden>${ico('upload')} Choose an image (JPG, PNG or WebP, up to 12 MB)</label>
      <p class="dus-cv-status" role="status"></p></div></div>`);
    const m = $('#dus-cover-modal'), st = m.querySelector('.dus-cv-status');
    const close = () => m.remove(); m.querySelector('.dus-modal__x').onclick = close; m.addEventListener('click', e => { if (e.target === m) close(); });
    $$('.dus-cv-grid [data-cv-kind="drawing"]', m).forEach(async b => { const x = list[+b.dataset.cvI]; const u = await drawingPreview(x.setId); if (u) { x.preview = u; b.querySelector('i').style.backgroundImage = `url("${u}")`; b.querySelector('em')?.remove(); } else { b.disabled = true; b.querySelector('em').textContent = 'Preview not available'; } });
    const save = async cover => {
      st.textContent = 'Saving…';
      try {
        const c = sb(); const { data: fresh } = await c.from('project_threads').select('progress').eq('id', p.id).maybeSingle();
        const prog = { ...(fresh?.progress || p.progress || {}) };
        const hist = Array.isArray(prog.cover_history) ? prog.cover_history : []; if (prog.cover?.path) hist.unshift({ ...prog.cover, replaced_at: new Date().toISOString() });
        if (cover) prog.cover = { ...cover, set_at: new Date().toISOString() }; else delete prog.cover;
        prog.cover_history = hist.slice(0, 12);
        const r = await c.from('project_threads').update({ progress: prog }).eq('id', p.id); if (r.error) throw r.error;
        p.progress = prog; st.textContent = 'Saved.'; await loadProjects(true); close(); done && done();
      } catch (e) { st.textContent = 'Not saved: ' + (e.message || e); }
    };
    m.querySelector('[data-cv-auto]').onclick = () => save(null);
    $$('.dus-cv-grid .dus-cv', m).forEach(b => b.onclick = async () => {
      const x = list[+b.dataset.cvI];
      if (x.kind === 'drawing') {
        if (!x.preview) return; st.textContent = 'Saving the drawing preview…';
        try { const blob = await (await fetch(x.preview)).blob(); const me = await uid(); const path = `${me}/covers/${p.id}/drawing-${Date.now()}.svg`; const up = await sb().storage.from('drawup-private').upload(path, blob, { contentType: 'image/svg+xml', upsert: false }); if (up.error) throw up.error; save({ path, kind: 'drawing', label: x.label }); } catch (e) { st.textContent = 'Not saved: ' + (e.message || e); }
        return;
      }
      save({ path: x.path, kind: x.kind, label: x.label });
    });
    m.querySelector('.dus-cv-up input').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { st.textContent = 'Choose a JPG, PNG or WebP image.'; return; }
      if (f.size > 12 * 1024 * 1024) { st.textContent = 'Choose an image under 12 MB.'; return; }
      st.textContent = 'Uploading…';
      try { const me = await uid(); const path = `${me}/covers/${p.id}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`; const up = await sb().storage.from('drawup-private').upload(path, f, { contentType: f.type, upsert: false }); if (up.error) throw up.error; save({ path, kind: 'upload', label: 'Uploaded cover · ' + f.name }); } catch (err) { st.textContent = 'Not uploaded: ' + (err.message || err); }
    };
    m.querySelector('.dus-cv')?.focus();
  }
  const cover = async id => { if (!D.projects || Date.now() - D.coverAt > 45 * 60e3) await loadProjects(true).catch(() => {}); return D.covers.get(id) || null; };

  /* ------------------------------------------------------------------ hooks after each Portal tab renders */
  let lastTabSeen = null;
  function currentTab() { const m = /^#portal(?:\/([a-z-]+))?/.exec(location.hash || ''); return m ? (m[1] || 'dashboard') : null; }
  function onTabRendered() {
    const t = currentTab(); const w = $('#du-workspace-content'); if (!w) return;
    if (t !== 'dashboard') w.classList.remove('dus-full');
    if (t && t !== lastTabSeen) { lastTabSeen = t; rememberVisit(t); }
    if (t === 'projects') decorateProjects(w);
    if (t === 'ai-team') decorateTeam(w);
    if (t === 'account' && !w.querySelector('.dus-acct-prefs')) {
      // Account settings: the same Studio preferences as the dashboard, saved to the account.
      w.insertAdjacentHTML('beforeend', `<section class="du-glass dus-acct-prefs"><span class="dus-kicker">Studio preferences</span><h2 class="dus-h3" style="margin:10px 0 4px">Motion</h2><p class="dus-muted-s">Saved to your account, so they follow you to every device.</p><div data-dus-prefs></div></section>`);
      renderPrefControls();
    }
    syncAvatar();
  }
  // AI Team: show the linked project's cover beside the project picker, so the same picture follows the project everywhere.
  let teamObs = null;
  function decorateTeam(w) {
    const paint = () => {
      const sel = $('#du-tm25-project', w); if (!sel) return;
      const lab = sel.closest('label') || sel.parentElement;
      let th = lab.querySelector('.dus-projthumb');
      if (!th) { th = document.createElement('i'); th.className = 'dus-projthumb'; th.setAttribute('aria-hidden', 'true'); lab.insertBefore(th, sel); }
      const cv = sel.value ? D.covers.get(sel.value) : null;
      const url = sel.value ? (cv?.url || ART + 'holo-generic.webp') : '';
      if (th.dataset.url !== url) { th.dataset.url = url; th.style.backgroundImage = url ? `url('${url}')` : ''; th.hidden = !url; }
    };
    loadProjects().then(paint).catch(() => {}); paint();
    if (!w._dusTeamChange) { w._dusTeamChange = true; w.addEventListener('change', e => { if (e.target.id === 'du-tm25-project') paint(); }); }
    teamObs?.disconnect();
    let q = null; teamObs = new MutationObserver(() => { if (currentTab() !== 'ai-team') { teamObs.disconnect(); return; } clearTimeout(q); q = setTimeout(paint, 120); });
    teamObs.observe(w, { childList: true, subtree: true });
  }
  let decoT = null;
  function decorateProjects(w) {
    clearTimeout(decoT);
    decoT = setTimeout(async () => {
      // Deep link: #portal/projects?id=<project id> opens that project.
      const id = new URLSearchParams((location.hash.split('?')[1]) || '').get('id');
      if (id) { const b = w.querySelector(`[data-open-proj="${CSS.escape(id)}"]`); if (b) { b.click(); return; } }
      const cards = $$('.du-v15-project', w); if (!cards.length) { decorateProjectPage(w); return; }
      await loadProjects().catch(() => {});
      cards.forEach(card => {
        if (card.querySelector('.dus-pcover')) return;
        const pid = card.querySelector('[data-open-proj]')?.dataset.openProj; if (!pid) return;
        const p = (D.projects || []).find(x => x.id === pid); const cv = D.covers.get(pid);
        card.classList.add('dus-pcard');
        card.insertAdjacentHTML('afterbegin', `<div class="dus-pcover${cv ? '' : ' is-holo'}" style="background-image:url('${esc(cv?.url || ART + 'holo-generic.webp')}')"><button type="button" class="dus-pcover__btn" aria-label="Change cover">${ico('image')}</button></div>`);
        card.querySelector('.dus-pcover__btn').onclick = e => { e.stopPropagation(); pickCover(p, () => { card.querySelector('.dus-pcover')?.remove(); decorateProjects(w); }); };
      });
    }, 60);
  }
  async function decorateProjectPage(w) {
    const head = w.querySelector('.du-work-head'); if (!head || w.querySelector('.dus-phero')) return;
    const title = head.querySelector('h1')?.textContent?.trim(); const kicker = head.querySelector('.du-kicker')?.textContent || '';
    if (!/^PROJECT/.test(kicker)) return;
    await loadProjects().catch(() => {});
    const p = (D.projects || []).find(x => x.project_name === title); if (!p) return;
    const cv = D.covers.get(p.id);
    head.classList.add('dus-phead');
    head.insertAdjacentHTML('beforebegin', `<div class="dus-phero${cv ? '' : ' is-holo'}"><img src="${esc(cv?.url || ART + 'holo-generic.webp')}" alt=""><i class="dus-phero__scan" aria-hidden="true"></i><button type="button" class="dus-btn dus-btn--ghost-dark dus-btn--sm" data-dus-pcover>${ico('image')} ${cv ? 'Change cover' : 'Add a cover'}</button></div>`);
    w.querySelector('[data-dus-pcover]').onclick = () => pickCover(p, () => { w.querySelector('.dus-phero')?.remove(); decorateProjectPage(w); });
  }

  /* ------------------------------------------------------------------ transitions (filled in by drawup-studio-fx-v26.js) */
  const recentlyPlayed = new Map();
  async function maybeTransition(section, opts = {}) {
    try {
      if (!section || opts.noFx) return;
      if (prefs.transitions === 'off' || reducedMotion()) return;
      const fx = window.DrawUpStudioFX; if (!fx) return;
      const cur = TAB_SECTION[currentTab()] || null; if (cur === section && isPortalOpen()) return; // same area: never replay
      const last = recentlyPlayed.get(section) || 0; if (Date.now() - last < 10 * 60e3) return;     // once per area per 10 minutes
      recentlyPlayed.set(section, Date.now());
      const projectId = opts.projectId || null;
      const p0 = projectId ? (D.projects || []).find(p => p.id === projectId) : (D.projects || [])[0];
      fx.play(section, { speed: prefs.speed, projectId, projectName: p0?.project_name || '', cover: projectId ? await cover(projectId) : (p0 ? D.covers.get(p0.id) : null) });
    } catch (e) { console.warn('DrawUp transition skipped:', e); }
  }

  /* ------------------------------------------------------------------ boot */
  function boot() {
    mountPublicNav();
    (function waitPortal(n = 0) { if (mountPortalNav()) return; if (n < 400) setTimeout(() => waitPortal(n + 1), 50); })();
    (function waitReg(n = 0) { if (P()?.registerTab) { P().registerTab('dashboard', w => renderDashboard(w)); return; } if (n < 400) setTimeout(() => waitReg(n + 1), 50); })();
    (function waitClient(n = 0) { if (sb()) { syncPrefsFromAccount(); refreshDot(); setInterval(refreshDot, 90000); return; } if (n < 300) setTimeout(() => waitClient(n + 1), 200); })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.DrawUpStudio = { registerPage, showStudioPage, routeStudioHash, prefs: () => ({ ...prefs }), setPrefs, go, goPublic, cover, pickCover, loadProjects, refresh: () => loadProjects(true), icon: ico, art: ART, version: V, _nav: { PORTAL_NAV, PUBLIC_NAV } };
})();
