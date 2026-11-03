// The Season 1 menus: Projects, CheckUp (with Results) and Firm, in the order Season 1 asked for, with
// nothing dropped, Quick Check kept, and the destinations actually opening.  node tests/season1/test-nav.js
const { open, checker, close } = require('./harness'); const C = checker();
const UID = '11111111-1111-4111-8111-111111111111';
const PID = '22222222-2222-4222-8222-222222222222';
const mock = { extra: { project_threads: [{ id: PID, owner_id: UID, project_name: 'Queen City Apartments', project_type: 'Multifamily', location: 'Charlotte, NC', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] } };

const COLS = p => p.evaluate(() => {
  const N = window.DrawUpStudio._nav.PORTAL_NAV; const out = {};
  N.forEach(c => { out[c.id] = { label: c.label, feature: c.feature ? c.feature.title : null, cols: (c.cols || []).map(col => ({ h: col.h, recent: !!col.recent, items: (col.items || []).map(i => [i[0], JSON.stringify(i[1])]) })) }; });
  return out;
});

(async () => {
  const t = await open('#portal/dashboard', { mock }); const p = t.page;
  const N = await COLS(p);

  // ---------------------------------------------------------------- Projects
  const pr = N.projects.cols;
  C.ok(pr[0].h === 'Projects' && pr[0].items.map(i => i[0]).join(' | ') === 'Overview | Project Map | Project Information | Documents | Specifications | Project Management',
    'Projects: Overview, Map, Information, Documents, Specifications, Project Management, in that order', pr[0].items.map(i => i[0]).join(' | '));
  C.ok(pr.some(c => c.h === 'More' && c.items.some(i => /Drawing Sets/.test(i[0])) && c.items.some(i => /DrawUp Ready/.test(i[0]))),
    'Projects: what the menu had before is kept under More', JSON.stringify(pr.map(c => c.h)));
  C.ok(pr.some(c => c.recent), 'Projects: the Recent projects column is still there');
  C.ok(/project-info\?view=map/.test(pr[0].items[1][1]) && /"tab":"documents"/.test(pr[0].items[3][1]) && /pane=specs/.test(pr[0].items[4][1]) && /group=PM/.test(pr[0].items[5][1]),
    'Projects: each item points at its own screen');

  // ---------------------------------------------------------------- CheckUp and Results
  const ck = N.check.cols;
  C.ok(ck[0].h === 'CheckUp' && ck[0].items.map(i => i[0]).join(' | ') === 'Code Compliance | ADA Accessibility | Life Safety | Drawing Review | Portfolio Review',
    'CheckUp: Code Compliance, ADA, Life Safety, Drawing Review, Portfolio Review', ck[0].items.map(i => i[0]).join(' | '));
  C.ok(ck[1].h === 'Results' && ck[1].items.map(i => i[0]).join(' | ') === 'Findings and Reports | Design Narrative Review | Narrative vs. Plans',
    'Results: Findings and Reports, Design Narrative Review, Narrative vs. Plans', ck[1].items.map(i => i[0]).join(' | '));
  C.ok(/Quick Check/i.test(N.check.feature || ''), 'CheckUp: Quick Check is still the first thing in the menu', N.check.feature);

  // ---------------------------------------------------------------- Firm
  const fm = N.firm.cols;
  C.ok(fm[0].h === 'Firm' && fm[0].items.map(i => i[0]).join(' | ') === 'Firm Profile | Letterheads | Document Templates | Presentation Templates | Branding',
    'Firm: Profile, Letterheads, Document Templates, Presentation Templates, Branding', fm[0].items.map(i => i[0]).join(' | '));
  C.ok(fm.some(c => c.h === 'More' && c.items.some(i => /Team Management/.test(i[0])) && c.items.some(i => /Firm Playbook/.test(i[0]))),
    'Firm: the firm workspace, playbook and team stay under More');
  C.ok(!JSON.stringify(fm).toLowerCase().includes('details library'), 'Firm: the Details library is not offered in Season 1');
  C.ok(/focus=brand/.test(fm[0].items[4][1]), 'Firm: Branding opens the brand section');

  // ---------------------------------------------------------------- nothing was lost
  // Season 2's own Details menu is expected to go; everything else must still be reachable (the label may be
  // written differently, so this compares without case).
  const before = await p.evaluate(() => { const N = window.DrawUpStudio._nav.PORTAL_NAV; const out = []; N.forEach(c => { if (c.id === 'details') return; ((c.__orig && c.__orig.cols) || []).forEach(col => (col.items || []).forEach(i => out.push(i[0]))); }); return out; });
  const after = await p.evaluate(() => { const N = window.DrawUpStudio._nav.PORTAL_NAV; const out = []; N.forEach(c => (c.cols || []).forEach(col => (col.items || []).forEach(i => out.push(i[0])))); return out; });
  const low = after.map(x => x.toLowerCase());
  const lost = before.filter(l => !low.includes(l.toLowerCase()) && !/detail/i.test(l) && l !== 'All Projects');
  C.ok(!lost.length, 'No menu item was dropped except the Season 2 Details ones', lost.join(', '));

  // ---------------------------------------------------------------- the destinations open
  await p.evaluate(() => window.DrawUpStudio.go({ tab: 'documents', hash: '#portal/documents?group=PM' }));
  await p.waitForTimeout(4000);
  C.ok(await p.evaluate(() => /#portal\/documents/.test(location.hash) && !!document.querySelector('.sp-head')), 'Projects › Project Management opens Documents', await p.evaluate(() => location.hash));
  C.ok(await p.evaluate(() => (window.__ddsS || {}).filter && window.__ddsS.filter.group === 'PM'), 'It opens on the project management documents');
  await p.evaluate(() => window.DrawUpStudio.go({ tab: 'documents', hash: '#portal/documents?new=1' }));
  await p.waitForTimeout(4000);
  C.ok(!!await p.$('#spn-title'), 'Firm › Document Templates opens the template picker');
  C.ok(await p.evaluate(() => document.querySelectorAll('#sp-modal [data-type]').length >= 15), 'The picker lists the document templates', await p.evaluate(() => document.querySelectorAll('#sp-modal [data-type]').length));
  await p.keyboard.press('Escape');
  await p.evaluate(() => window.DrawUpStudio.go({ tab: 'project-info', hash: '#portal/project-info?view=map' }));
  await p.waitForTimeout(3500);
  C.ok(await p.evaluate(() => !!document.querySelector('.dpi-mapgrid, .dpi-mapsvg')), 'Projects › Project Map opens the map');
  C.ok(!t.errors.length, 'No page errors', t.errors.join(' | ').slice(0, 400));

  console.log('\nSEASON 1 MENUS\n' + C.res.map(r => '  ' + r).join('\n'));
  console.log(`\n${C.res.length - C.failed()} passed, ${C.failed()} failed.\n`);
  await t.b.close(); close(); process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
