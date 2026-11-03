// CheckUp: Specifications Review on a real specification, the fix-and-re-run loop, DD Readiness from the
// project's own records, and Review History.  node tests/season1/test-checkup.js
const { open, checker, OUT, close } = require('./harness'); const C = checker();
const UID = '11111111-1111-4111-8111-111111111111';
const PID = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';
const now = () => new Date().toISOString();
const art = (title, paras) => ({ id: 'a' + Math.random().toString(16).slice(2, 8), title, base_title: title, paras: paras.map(t => ({ id: 'p' + Math.random().toString(16).slice(2, 8), t, base: t, lvl: 0 })) });

// A small, realistic project manual: Division 09 is written, Division 07 is not, one section has an open
// item and an empty Part 3, and a cross reference points at a section that is not here.
const sections = [
  { id: 's1', number: '01 10 00', title: 'Summary', state: 'complete', assigned: null, parts: { 1: [art('SUMMARY', ['Work of this Contract comprises the construction of <<project_name>>.'])], 2: [art('PRODUCTS', ['Not used.'])], 3: [art('EXECUTION', ['Not used.'])] } },
  { id: 's2', number: '09 29 00', title: 'Gypsum Board', state: 'draft', assigned: null, parts: {
    1: [art('GENERAL', ['Submit product data. Comply with Section 09 91 23 for finish painting.'])],
    2: [art('PRODUCTS', ['Gypsum board: {{thickness}} thick, Type X where indicated.'])],
    3: [] } },
];
const mock = {
  extra: {
    project_threads: [{ id: PID, owner_id: UID, project_name: 'Queen City Apartments', project_type: 'Multifamily', location: 'Charlotte, NC', project_phase: 'Schematic Design', status: 'active', created_at: now(), updated_at: now() }],
    project_documents: [{ id: DOC, owner_id: UID, project_thread_id: PID, doc_type: 'spec', title: 'Project Manual — Queen City Apartments', status: 'draft', source: 'specs', revision: 0, fields: { outline: false }, cover: { data: {} }, sections, created_at: now(), updated_at: now(), created_by: UID, updated_by: UID }],
    project_profiles: [{ id: 'pp1', project_thread_id: PID, owner_id: UID, rev: 2, fields: {
      project_number: { v: '2026-014', src: 'Entered by a project member', at: now(), by: 'user' },
      site_address: { v: '600 E 4th St, Charlotte, NC 28202', src: 'U.S. Census Bureau Geocoder', at: now(), by: 'auto', verified: false },
      county: { v: 'Mecklenburg County, North Carolina', src: 'U.S. Census Bureau Geocoder', at: now(), by: 'auto', verified: true },
      owner_name: { v: 'Fourth Ward Holdings LLC', src: 'Entered by a project member', at: now(), by: 'user' },
    }, site: { lat: 35.220873, lon: -80.838195 },
      program: [{ name: 'Apartments', count: 48, area: 820 }, { name: 'Lobby', count: 1, area: 900 }],
      team: [{ name: 'Fourth Ward Holdings', role: 'Owner' }], milestones: [], files: [], lookups: [],
      decisions: [{ what: 'Facade material', status: 'open' }, { what: 'Parking layout', status: 'decided' }] }],
  },
  rpc: {},
};

(async () => {
  const t = await open('#portal/check?mode=specs', { mock }); const p = t.page;
  const db = x => p.evaluate(k => JSON.parse(JSON.stringify(window.__duMockDB[k] || [])), x);

  // ------------------------------------------------------------------ 1. the rules, on their own
  const unit = await p.evaluate(() => {
    const CU = window.DrawUpCheckUp;
    const doc = { id: 'd1', owner_id: 'u', title: 'Project Manual', sections: JSON.parse(JSON.stringify(window.__duMockDB.project_documents[0].sections)) };
    const r = CU.reviewSpec(doc, { values: { project_name: 'Queen City Apartments', project_number: '2026-014', owner_name: 'Fourth Ward Holdings LLC', site_address: '600 E 4th St, Charlotte, NC 28202' }, sheets: [{ sheet_number: 'A201', sheet_title: 'ROOF PLAN' }, { sheet_number: 'A101', sheet_title: 'FLOOR PLAN' }], reviews: [] });
    return { rules: r.findings.map(f => f.rule), summary: r.summary, counts: r.counts, findings: r.findings };
  });
  C.ok(unit.rules.includes('open-item'), 'Rule: an unfilled blank is found', unit.rules.join(','));
  C.ok(unit.rules.includes('no-execution'), 'Rule: the empty Part 3 is found');
  C.ok(unit.rules.includes('section-draft'), 'Rule: the section still marked Draft is found');
  C.ok(unit.rules.includes('cross-ref') && unit.findings.some(f => f.rule === 'cross-ref' && f.ref === '09 91 23'), 'Rule: a reference to a section that is not in the manual is found');
  C.ok(unit.rules.includes('drawing-gap') && unit.findings.some(f => f.rule === 'drawing-gap' && f.division === '07'), 'Rule: the roof plan with no Division 07 section is found', JSON.stringify(unit.findings.filter(f => f.rule === 'drawing-gap').map(f => f.issue)));
  C.ok(unit.findings.some(f => f.rule === 'value-conflict' && f.field === 'owner_name'), 'Rule: a project value that is nowhere in the manual is flagged');
  C.ok(unit.findings.every(f => f.rule_says && f.source && f.confidence), 'Every finding says which rule it came from and what it was read from');
  C.ok(!JSON.stringify(unit.findings).match(/IBC|ASTM C\d|Section 10[0-9]{2}\.\d/), 'No code citation is produced');
  C.ok(unit.findings.every(f => !/\bshall comply with the \d/.test(f.issue)), 'No invented requirement text');

  // ------------------------------------------------------------------ 2. the screen and a real run
  C.ok(await p.evaluate(() => /SPECIFICATIONS REVIEW/.test(document.querySelector('#du-workspace-content .du-kicker')?.textContent || '')), 'The Specifications Review screen opens from the CheckUp menu', await p.evaluate(() => (document.querySelector('#du-workspace-content .du-kicker') || {}).textContent));
  C.ok(await p.evaluate(() => !!document.querySelector('[data-cu="doc"] option')), 'It lists the specification written in DrawUp Specs');
  await p.selectOption('[data-cu="project"]', PID); await p.waitForTimeout(600);
  await p.click('[data-cu-run]'); await p.waitForSelector('.du-findings', { timeout: 15000 });
  let saved = await db('spec_reviews');
  C.ok(saved.length === 1 && saved[0].kind === 'specs' && saved[0].document_id === DOC && saved[0].owner_id === UID, 'The review is saved against the real document', JSON.stringify((saved[0] || {}).title));
  const first = saved[0].findings.filter(f => f.severity !== 'info').length;
  C.ok(first >= 5, 'It found the open items in the real specification (' + first + ')');
  C.ok(await p.evaluate(() => /not a licensed review|not a permit/i.test(document.body.textContent)), 'The screen says the review is preliminary and not an approval');
  C.ok(await p.evaluate(() => !!document.querySelector('[data-cu-sec]')), 'Each finding has "Open the section"');
  await t.shot('cu-01-specs');

  // ------------------------------------------------------------------ 3. open the section, fix it, re-run
  const secId = await p.evaluate(() => { const b = [...document.querySelectorAll('[data-cu-sec]')].find(x => x.dataset.cuSec); return b ? b.dataset.cuSec : ''; });
  await p.evaluate(() => { const b = [...document.querySelectorAll('[data-cu-sec]')].find(x => x.dataset.cuSec); b.click(); });
  await p.waitForTimeout(5000);
  C.ok(await p.evaluate(() => /#portal\/documents/.test(location.hash) && !!document.querySelector('.sp-wrap')), 'It opens the specification in the editor', await p.evaluate(() => location.hash));
  C.ok(await p.evaluate(s => !!window.__ddsS && window.__ddsS.secId === s, secId) || !secId, 'The editor opens at the section the finding came from', await p.evaluate(() => window.__ddsS && window.__ddsS.secId));
  // correct the omission: fill the blank, write Part 3, mark the section complete
  await p.evaluate(() => {
    const S = window.__ddsS, d = S.doc, X = window.DrawUpSpecsExport;
    const s = d.sections.find(x => x.number === '09 29 00');
    s.parts[2][0].paras[0].t = 'Gypsum board: 5/8 inch thick, Type X where indicated.';
    s.parts[3] = [{ id: X.rid(), title: 'EXECUTION', base_title: 'EXECUTION', paras: [{ id: X.rid(), t: 'Install board with joints staggered and fasteners set below the surface.', base: '', lvl: 0 }] }];
    s.state = 'complete';
    window.DrawUpSpecs._dirty(S);
  });
  await p.waitForTimeout(2500);
  const stored = (await db('project_documents'))[0];
  const sec = stored.sections.find(s => s.number === '09 29 00');
  C.ok(/5\/8 inch/.test(JSON.stringify(sec.parts[2])) && sec.parts[3].length === 1 && sec.state === 'complete', 'The correction is saved to the real document', JSON.stringify(sec.state));
  // back to CheckUp and run again
  await p.evaluate(() => { location.hash = '#portal/check?mode=specs&project=' + '22222222-2222-4222-8222-222222222222'; });
  await p.evaluate(() => window.DrawUpPortal.openPortalTab('check'));
  await p.waitForSelector('[data-cu-run]', { timeout: 10000 });
  await p.click('[data-cu-run]'); await p.waitForSelector('.du-findings', { timeout: 15000 });
  saved = await db('spec_reviews');
  const second = saved[0].findings.filter(f => f.severity !== 'info').length;
  C.ok(second < first, `Re-running shows fewer open items (${first} → ${second})`);
  C.ok(!saved[0].findings.some(f => f.rule === 'no-execution') && !saved[0].findings.some(f => f.rule === 'section-draft' && /09 29 00/.test(f.issue)), 'The items that were corrected are gone');
  C.ok((saved[0].runs || []).length >= 2 && saved[0].resolved.length >= 1, 'The review keeps a record of each run and what was settled', JSON.stringify(saved[0].runs));
  C.ok(await p.evaluate(() => /Settled since the last run/i.test(document.body.textContent)), 'It tells you what was settled since the last run');
  await t.shot('cu-02-rerun');

  // ------------------------------------------------------------------ 4. export the findings
  await p.click('[data-cu-save]'); await p.waitForTimeout(2500);
  const docs = await db('project_documents');
  const rep = docs.find(d => d.source === 'check');
  C.ok(!!rep && rep.project_thread_id === PID && /Specifications review/i.test(rep.title), 'The findings save as a document filed under the project', rep ? rep.title : 'none');
  C.ok(!!rep && /Read from|rule it came from/i.test(JSON.stringify(rep.sections)), 'The saved report says how the review was made');
  const dl = p.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await p.click('[data-cu-pdf]');
  const got = await dl;
  C.ok(!!got && /\.pdf$/.test(got.suggestedFilename()), 'The findings download as a PDF', got ? got.suggestedFilename() : 'no download');

  // ------------------------------------------------------------------ 5. DD readiness
  await p.evaluate(() => { location.hash = '#portal/check?mode=dd'; window.DrawUpPortal.openPortalTab('check'); });
  await p.waitForSelector('[data-cu-run]', { timeout: 10000 });
  await p.click('[data-cu-run]'); await p.waitForSelector('.cu-list', { timeout: 15000 });
  const dd = (await db('spec_reviews')).find(r => r.kind === 'dd_readiness');
  C.ok(!!dd && typeof dd.score === 'number' && dd.score > 0 && dd.score < 100, 'DD readiness scores from the project\'s own records', dd ? dd.score : 'none');
  C.ok(await p.evaluate(() => /advisory/i.test(document.querySelector('.cu-score').textContent) && !/permit|guarantee/i.test(document.querySelector('.cu-score').textContent)), 'The score is presented as advisory, not an approval');
  const items = await p.evaluate(() => [...document.querySelectorAll('.cu-list li')].map(li => ({ state: li.className, title: li.querySelector('b').textContent })));
  C.ok(items.length >= 10 && items[0].state.includes('missing'), 'The checklist is prioritized, with what is not settled first', JSON.stringify(items.slice(0, 3)));
  C.ok(items.some(i => /decision/i.test(i.title)) && await p.evaluate(() => /Facade material/.test(document.body.textContent)), 'It names the design decisions still open');
  C.ok(items.some(i => /zoning/i.test(i.title) && i.state.includes('missing')) && await p.evaluate(() => /ordinance|AHJ/i.test(document.body.textContent)), 'Zoning it could not look up is flagged, not invented');
  C.ok(items.some(i => /code edition/i.test(i.title)) && await p.evaluate(() => /does not assume/i.test(document.body.textContent)), 'The code edition is asked for rather than assumed');
  C.ok(items.some(i => /program/i.test(i.title)) && await p.evaluate(() => /sq ft/.test(document.body.textContent)), 'The program areas are added up from the real program');
  await t.shot('cu-03-dd');

  // ------------------------------------------------------------------ 6. review history
  await p.evaluate(() => { location.hash = '#portal/check?mode=history'; window.DrawUpPortal.openPortalTab('check'); });
  await p.waitForSelector('.cu-hist', { timeout: 10000 });
  const hist = await p.evaluate(() => [...document.querySelectorAll('.cu-hist .du-row small')].map(s => s.textContent));
  C.ok(hist.length >= 3 && hist.some(h => /Specifications Review/.test(h)) && hist.some(h => /DD Readiness/.test(h)), 'Review history lists every review, newest first', JSON.stringify(hist.slice(0, 3)));

  // ------------------------------------------------------------------ 7. the menu and nothing disturbed
  const navOk = await p.evaluate(() => {
    const N = window.DrawUpStudio._nav.PORTAL_NAV.find(c => c.id === 'check');
    return { check: N.cols[0].items.map(i => i[0]), results: N.cols[1].items.map(i => i[0]) };
  });
  C.ok(navOk.check.join(' | ') === 'Code Compliance | ADA Accessibility | Life Safety | Drawing Review | Portfolio Review | Specifications Review | DD Readiness', 'The CheckUp menu now reads as Season 1 asked', navOk.check.join(' | '));
  C.ok(navOk.results.join(' | ') === 'Findings and Reports | Design Narrative Review | Narrative vs. Plans | Review History', 'Results ends with Review History', navOk.results.join(' | '));
  await p.evaluate(() => { location.hash = '#portal/check'; window.DrawUpPortal.openPortalTab('check'); });
  await p.waitForTimeout(3500);
  C.ok(await p.evaluate(() => !!document.querySelector('.du-ck22-modes')), 'The existing drawing and narrative checks still open as they did');
  C.ok(!t.errors.length, 'No page errors', t.errors.join(' | ').slice(0, 500));

  console.log('\nCHECKUP · SPECIFICATIONS REVIEW, DD READINESS, HISTORY\n' + C.res.map(r => '  ' + r).join('\n'));
  console.log(`\n${C.res.length - C.failed()} passed, ${C.failed()} failed. Screenshots in ${OUT}\n`);
  await t.b.close(); close(); process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
