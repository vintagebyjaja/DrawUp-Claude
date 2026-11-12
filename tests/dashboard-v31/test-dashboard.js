// v31 Dream Beyond dashboard + light header. Uses the Season 1 harness: the real drawup-preview.html with a
// stand-in Supabase (tests/season1/mock-supabase.js, test rows only) and stand-in API answers. No real data or AI.
//   node tests/dashboard-v31/test-dashboard.js
const path = require('path'), fs = require('fs');
const { open, checker, close } = require('../season1/harness');
const C = checker();
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const mock = { cover1: { path: '/drawup-studio-v26/products-building.webp', label: 'Test cover' }, extra: { drawings: [{ id: 'dw1', owner_id: '11111111-1111-4111-8111-111111111111', name: 'Test plan', model: { walls: [], openings: [], rooms: [] }, updated_at: new Date().toISOString() }] } };
const api = async p => p === '/api/features' ? { json: { season2_details: false } } : null;

(async () => {
  // ---------------------------------------------------------------- desktop
  let t = await open('#portal/dashboard', { mock, api, width: 1672, height: 941, wait: 8000 }); let p = t.page;
  await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(OUT, 'desk-1672.png') });
  await p.screenshot({ path: path.join(OUT, 'desk-1672-full.png'), fullPage: true });
  const nav = await p.evaluate(() => ({
    labels: [...document.querySelectorAll('#dus-pnav .dus-links .dus-link')].map(b => b.textContent.trim()),
    bg: getComputedStyle(document.querySelector('#dus-pnav')).backgroundColor,
    active: (() => { const a = document.querySelector('#dus-pnav .dus-link.is-active'); return a ? [a.textContent.trim(), getComputedStyle(a).backgroundImage] : null; })(),
    icons: document.querySelectorAll('#dus-pnav .dus-link .db-ico').length,
    search: !!document.querySelector('#dus-pnav [data-dus-search]'), bell: !!document.querySelector('#dus-pnav [data-dus-pop="notes"]'), avatar: !!document.querySelector('#dus-pnav .dus-avatar'),
    brand: document.querySelector('#dus-pnav .dus-brand')?.textContent.replace(/\s+/g, ' ').trim()
  }));
  C.ok(nav.labels.filter(l => l !== 'Details').join('|') === 'Dashboard|Projects|AI Team|Draw|CheckUp|Swap|Discover|Connect|Firm', 'Top navigation keeps Dashboard, Projects, AI Team, Draw, CheckUp, Swap, Discover, Connect, Firm (plus the Season 2 Details teaser that is there today)', nav.labels.join('|'));
  C.ok(/rgba?\(255, 255, 255/.test(nav.bg), 'Header is light (white), not navy', nav.bg);
  C.ok(nav.active && nav.active[0] === 'Dashboard' && /gradient/.test(nav.active[1]), 'Dashboard is highlighted with the peach gradient', JSON.stringify(nav.active));
  C.ok(nav.icons >= 9, 'Each top link has an icon', String(nav.icons));
  C.ok(nav.search && nav.bell && nav.avatar, 'Search, notifications and the profile avatar are kept');
  C.ok(/DrawUp/.test(nav.brand) && /Portal/i.test(nav.brand), 'DrawUp Portal branding is kept', nav.brand);

  const d = await p.evaluate(() => ({
    side: [...document.querySelectorAll('.db-side__item span')].map(s => s.textContent),
    h1: document.querySelector('.db-hero h1')?.textContent, lede: document.querySelector('.db-hero__lede')?.textContent,
    btns: [...document.querySelectorAll('.db-hero__actions .db-btn')].map(b => b.textContent.trim()),
    heroImg: (() => { const i = document.querySelector('.db-hero__art img'); return i && i.complete && i.naturalWidth; })(),
    coach: document.querySelector('#db-coach-h')?.textContent, chips: [...document.querySelectorAll('.db-chip span')].map(s => s.textContent),
    hello: document.querySelector('.db-coach__hello b')?.textContent, ava: !!document.querySelector('#db-coach-ava svg'), live: document.querySelector('#db-coach-live')?.textContent,
    projects: [...document.querySelectorAll('.db-proj:not(.is-skel) .db-proj__open b')].map(b => b.textContent),
    projMeta: [...document.querySelectorAll('.db-proj__open small')].map(b => b.textContent),
    covers: [...document.querySelectorAll('.db-proj__img')].filter(i => /url/.test(i.style.backgroundImage)).length,
    tools: [...document.querySelectorAll('.db-tool span')].map(s => s.textContent),
    stats: document.querySelector('#db-stats')?.innerText.replace(/\s+/g, ' '), svc: document.querySelector('#db-svc')?.textContent,
    sig: document.querySelector('.db-dash .db-signature')?.textContent, aelio: /AELIO/i.test(document.querySelector('#db-dash')?.innerText || ''), dwg: /DWG/.test(document.querySelector('#db-dash')?.innerText || '')
  }));
  C.ok(d.side.join('|') === 'Home|My Projects|Templates|Library|Materials|Settings|Support', 'Sidebar: Home, My Projects, Templates, Library, Materials, Settings, Support', d.side.join('|'));
  C.ok(d.h1 === 'Build What’s Next.', 'Hero headline', d.h1);
  C.ok(d.lede === 'Turn ideas into immersive spaces with the power of DrawUp.', 'Hero supporting text', d.lede);
  C.ok(/Start a New Project/.test(d.btns[0]) && /Watch Tour/.test(d.btns[1]), 'Hero buttons: Start a New Project, Watch Tour', d.btns.join(' / '));
  C.ok(d.heroImg > 1000, 'Hero rendering loads', String(d.heroImg));
  C.ok(d.coach === 'Arch Coach' && !d.aelio, 'The assistant panel is Arch Coach (no AELIO assistant)');
  C.ok(d.chips.join('|') === 'Create a modern villa|Import an architectural drawing|Show my recent projects|Help me develop this concept', 'Arch Coach suggestions use the brief wording', d.chips.join('|'));
  C.ok(!d.dwg, 'No DWG wording on the dashboard');
  C.ok(d.hello === 'Good to see you, Jabari.', 'Personal welcome uses the member name', d.hello);
  C.ok(d.ava, 'Arch Coach avatar is the member’s own coach look');
  C.ok(d.live === 'Online', 'Availability shows Online after the API answered', d.live);
  C.ok(d.projects.join('|') === 'Henrico CASA Playhouse|Hampton University Tech & AI Center|KEi Office Renovation', 'Recent Projects: the member’s own projects, newest first, starter project left out', d.projects.join('|'));
  C.ok(d.projMeta[0] && /h ago/.test(d.projMeta[0]) && /Community/.test(d.projMeta[0]), 'Project card shows last edited and project type', d.projMeta[0]);
  C.ok(d.covers === 1, 'Only the project that has a cover shows a picture', String(d.covers));
  C.ok(d.tools.join('|') === 'Import File|New Draw|3D View|Templates|Materials|Export', 'Quick Tools: Import File, New Draw, 3D View, Templates, Materials, Export', d.tools.join('|'));
  C.ok(/AI credits 500 left/.test(d.stats) && /Projects 3 active/.test(d.stats) && /Drawings 1 saved/.test(d.stats), 'Platform Status reads credits, active projects and drawings from the database', d.stats);
  C.ok(!/Storage/.test(d.stats) && !/%/.test(d.stats), 'No storage figure and no made-up percentages (the test account has no monthly allowance)', d.stats);
  C.ok(d.svc === 'Services responding', 'Service badge comes from a live check', d.svc);
  C.ok(/GROOVEVILLE LLC \| DRAWUP HEADQUARTERS/.test((d.sig || '').replace(/\s+/g, ' ')), 'Footer signature: GROOVEVILLE LLC | DRAWUP HEADQUARTERS', d.sig);

  // suggestions + panel behaviour
  await p.click('[data-db-suggest="2"]'); await p.waitForTimeout(600);
  const rec = await p.evaluate(() => [...document.querySelectorAll('#db-coach-recent .db-mini b')].map(b => b.textContent));
  C.ok(rec.length === 3 && rec[0] === 'Henrico CASA Playhouse', '“Show my recent projects” lists the member’s projects in the panel', rec.join('|'));
  await p.screenshot({ path: path.join(OUT, 'desk-coach-recent.png'), clip: await p.evaluate(() => { const r = document.querySelector('.db-coach').getBoundingClientRect(); return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }; }) });
  await p.click('[data-db-suggest="3"]');
  C.ok((await p.inputValue('#db-ask-in')).startsWith('Help me develop this concept'), '“Help me develop this concept” starts the question for the member to finish');
  await p.click('[data-db-tool="templates"]'); await p.waitForTimeout(300);
  const tp = await p.evaluate(() => [...document.querySelectorAll('#db-sheet .db-listitem b')].map(b => b.textContent));
  C.ok(tp.length === 3, 'Templates opens the real starting points', tp.join('|'));
  await p.screenshot({ path: path.join(OUT, 'desk-templates.png') });
  await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelector('#db-sheet')?.remove());
  await p.click('.db-proj [data-db-more]'); await p.waitForTimeout(200);
  C.ok(await p.evaluate(() => document.querySelectorAll('#db-pmenu button').length === 4), 'Project options menu opens');
  await p.keyboard.press('Escape');
  await p.click('[data-db-tour]'); await p.waitForTimeout(500);
  C.ok(await p.evaluate(() => !!document.querySelector('#db-tour') && !!document.querySelector('.db-tour-on')), 'Watch Tour starts the guided tour');
  await p.screenshot({ path: path.join(OUT, 'desk-tour.png') });
  await p.evaluate(() => document.querySelector('#db-tour [data-x]').click());
  // collapse
  await p.click('[data-db-collapse]'); await p.waitForTimeout(400);
  C.ok(await p.evaluate(() => document.querySelector('#db-dash').classList.contains('is-collapsed') && localStorage.getItem('du-db-side-collapsed') === '1'), 'Sidebar collapses and remembers it');
  await p.screenshot({ path: path.join(OUT, 'desk-collapsed.png') });
  await p.click('[data-db-collapse]');
  // ask Arch Coach: goes through the real Arch Coach form
  await p.fill('#db-ask-in', 'What is the minimum corridor width in a school?');
  await p.click('.db-ask__send'); await p.waitForTimeout(4500);
  const asked = await p.evaluate(() => ({ hash: location.hash, threads: (window.__duMockLog || []).filter(x => x === 'insert coach_threads').length }));
  C.ok(/#portal\/arch-coach/.test(asked.hash) && asked.threads >= 1, 'Sending a question opens Arch Coach and saves it through the existing Arch Coach form', JSON.stringify(asked));
  // quick tool: 3D view opens the latest drawing
  await p.evaluate(() => window.DrawUpStudio.go({ tab: 'dashboard' })); await p.waitForTimeout(2500);
  await p.click('[data-db-tool="3d"]'); await p.waitForTimeout(5000);
  C.ok(/#portal\/draw\?id=dw1/.test(await p.evaluate(() => location.hash)), '3D View opens the member’s latest drawing', await p.evaluate(() => location.hash));
  await p.screenshot({ path: path.join(OUT, 'desk-3d-view.png') });
  // account menu signature
  await p.evaluate(() => window.DrawUpStudio.go({ tab: 'dashboard' })); await p.waitForTimeout(2000);
  await p.click('#dus-pnav .dus-avatar'); await p.waitForTimeout(300);
  C.ok(await p.evaluate(() => /GROOVEVILLE LLC/.test(document.querySelector('#dus-pnav .dus-pop[data-pop="acct"]')?.textContent || '')), 'Account menu carries the Dream Beyond signature');
  await p.screenshot({ path: path.join(OUT, 'desk-account-menu.png') });
  await p.keyboard.press('Escape');
  // other tabs still open
  for (const tab of ['projects', 'ai-team', 'draw', 'check', 'swap', 'discover', 'connect', 'firm']) {
    await p.evaluate(tb => window.DrawUpStudio.go({ tab: tb }), tab); await p.waitForTimeout(1800);
    const ok = await p.evaluate(() => (document.querySelector('#du-workspace-content')?.innerText || '').trim().length > 20 && !document.querySelector('#db-dash'));
    C.ok(ok, `Top nav ${tab} still opens its page`);
  }
  await p.evaluate(() => window.DrawUpStudio.go({ tab: 'projects' })); await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(OUT, 'desk-projects-tab.png') });
  // empty state
  await p.evaluate(() => { window.__duMockDB.project_threads.length = 0; window.DrawUpStudio.go({ tab: 'dashboard' }); }); await p.waitForTimeout(3000);
  C.ok(await p.evaluate(() => /No projects yet/.test(document.querySelector('.db-empty')?.textContent || '')), 'A member with no projects sees the empty state, not sample projects');
  await p.screenshot({ path: path.join(OUT, 'desk-empty.png') });
  C.ok(!t.errors.length, 'Desktop: no page errors', t.errors.join(' | '));
  await t.b.close();

  // ---------------------------------------------------------------- 1280 laptop
  t = await open('#portal/dashboard', { mock, api, width: 1280, height: 800, wait: 8000 }); p = t.page; await p.waitForTimeout(1200);
  await p.screenshot({ path: path.join(OUT, 'desk-1280-full.png'), fullPage: true });
  C.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '1280px: no sideways scroll');
  await t.b.close();

  // ---------------------------------------------------------------- tablet + phone
  for (const [w, h, name] of [[820, 1180, 'tablet'], [390, 844, 'phone']]) {
    t = await open('#portal/dashboard', { mock, api, width: w, height: h, wait: 8000 }); p = t.page; await p.waitForTimeout(1200);
    await p.screenshot({ path: path.join(OUT, name + '.png') });
    await p.screenshot({ path: path.join(OUT, name + '-full.png'), fullPage: true });
    const m = await p.evaluate(() => {
      const wide = [...document.querySelectorAll('#db-dash *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.className.baseVal ?? e.className).slice(0, 5);
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, wide, side: getComputedStyle(document.querySelector('.db-side__nav')).flexDirection };
    });
    C.ok(m.sw <= m.iw + 1 && !m.wide.length, `${name}: nothing sticks out sideways`, JSON.stringify(m));
    C.ok(m.side === 'row', `${name}: sidebar becomes a compact row`, m.side);
    if (name === 'phone') {
      const small = await p.evaluate(() => [...document.querySelectorAll('.db-dash button')].filter(b => { const r = b.getBoundingClientRect(); return r.width && r.height && (r.height < 30 || r.width < 30); }).map(b => b.className + ':' + Math.round(b.getBoundingClientRect().height)).slice(0, 6));
      C.ok(!small.length, 'phone: buttons are at least 30px for touch', small.join(', '));
      await p.click('#dus-pnav [data-dus-burger]'); await p.waitForTimeout(500);
      await p.screenshot({ path: path.join(OUT, 'phone-menu.png') });
    }
    C.ok(!t.errors.length, `${name}: no page errors`, t.errors.join(' | '));
    await t.b.close();
  }

  console.log(C.res.join('\n'));
  console.log(`\n${C.res.length - C.failed()} of ${C.res.length} passed`);
  fs.writeFileSync(path.join(OUT, 'results.txt'), C.res.join('\n'));
  close(); process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); close(); process.exit(1); });
