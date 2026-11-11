// Project Management tracker: real project documents as tracked items, tracking saved on the document without
// touching its text, overdue and ball-in-court counts, the log, CSV, the menu item and "New item".
//   node tests/season1/test-tracker.js
const { open, checker, OUT, close } = require('./harness'); const C = checker();
const UID = '11111111-1111-4111-8111-111111111111', PID = '22222222-2222-4222-8222-222222222222', P2 = '55555555-5555-4555-8555-555555555555';
const ago = d => new Date(Date.now() - d * 86400000).toISOString();
const blocks = [{ id: 'b1', h: 'QUESTION', t: 'Confirm the parapet height at grid C.' }];
const doc = (id, type, num, title, days, extra) => Object.assign({ id, owner_id: UID, project_thread_id: PID, doc_type: type, title, doc_number: num, status: 'draft', source: 'specs', fields: { list: [], heading: title }, cover: { data: { page: { page: 'letter' } } }, sections: blocks, created_at: ago(days), updated_at: ago(days) }, extra || {});

(async () => {
  const mock = { extra: {
    project_threads: [{ id: PID, owner_id: UID, project_name: 'Fourth Ward Apartments', status: 'active', created_at: ago(90), updated_at: ago(1) }, { id: P2, owner_id: UID, project_name: 'Queen City Library', status: 'active', created_at: ago(90), updated_at: ago(2) }],
    project_documents: [
      doc('d1', 'rfi', 'RFI-001', 'Parapet height at grid C', 12),                                         // overdue by the usual 7 days
      doc('d2', 'submittal_review', 'SUB-03', 'Storefront shop drawings', 3, { cover: { data: { page: { page: 'letter' }, track: { state: 'in_review', ball: 'Architect', due: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10), log: [] } } } }),
      doc('d3', 'punch_list', 'PL-1', 'Level 2 punch list', 40, { cover: { data: { track: { state: 'closed', closed_at: ago(5), responded_at: ago(10), opened: ago(40), log: [] } } } }),
      doc('d4', 'ncr', 'NCR-02', 'Slab flatness at level 3', 2, { project_thread_id: P2 }),
      doc('d5', 'letter', '', 'Letter to the owner', 2),                                                    // not tracked
      doc('d6', 'outline_spec', '', 'Outline specification', 2, { sections: [] }),                          // not tracked
    ] } };
  const t = await open('#portal/tracker', { mock }); const p = t.page;
  await p.waitForSelector('.pmt', { timeout: 10000 }).catch(() => null);
  C.ok(!!await p.$('.pmt'), 'The tracker opens at #portal/tracker');
  const rows = await p.$$eval('.pmt-tr:not(.pmt-th) .pmt-item b', x => x.map(b => b.textContent));
  C.ok(rows.length === 3 && !rows.includes('Letter to the owner') && !rows.includes('Outline specification') && !rows.includes('Level 2 punch list'), 'Open items come from the project documents; letters and specs are not tracked; closed is filtered out', rows.join(', '));
  C.ok(rows[0] === 'Parapet height at grid C', 'Overdue items are listed first');
  const cards = await p.$$eval('.pmt-card b', x => x.map(b => b.textContent));
  C.ok(cards[0] === '3' && cards[1] === '1' && cards[3] === '1', 'Open 3, Overdue 1, Closed in 30 days 1', cards.join(','));
  C.ok(await p.evaluate(() => /Architect\s*1/.test(document.querySelector('.pmt-ball').textContent)), 'Ball in court counts open items by who has to act');
  C.ok(await p.evaluate(() => /Usual turnaround/.test(document.body.textContent) && /Overdue/.test(document.querySelector('.is-late').textContent)), 'A due date nobody set is labeled as the usual turnaround, and overdue items are marked');
  await t.shot('pm-01-tracker');

  await p.selectOption('#pmt-proj', P2); await p.waitForTimeout(200);
  C.ok((await p.$$eval('.pmt-tr:not(.pmt-th)', x => x.length)) === 1, 'Filtering by project');
  await p.selectOption('#pmt-proj', ''); await p.selectOption('#pmt-state', 'all'); await p.waitForTimeout(200);
  C.ok((await p.$$eval('.pmt-tr:not(.pmt-th)', x => x.length)) === 4, 'Every state shows closed items too');

  // track the RFI: respond, set the ball and a note
  await p.click('.pmt-tr:has-text("Parapet height")'); await p.waitForSelector('#pmt-panel');
  await p.selectOption('#pmt-f-state', 'responded'); await p.fill('#pmt-f-ball', 'Contractor'); await p.fill('#pmt-f-note', 'Answered by SK-03. Contractor to confirm.');
  await t.shot('pm-02-panel');
  const before = await p.evaluate(() => JSON.parse(JSON.stringify(window.__duMockDB.project_documents.find(d => d.id === 'd1'))));
  await p.click('#pmt-save'); await p.waitForTimeout(700);
  const after = await p.evaluate(() => JSON.parse(JSON.stringify(window.__duMockDB.project_documents.find(d => d.id === 'd1'))));
  const tr = after.cover.data.track;
  C.ok(tr && tr.state === 'responded' && tr.ball === 'Contractor' && tr.responded_at && tr.log.length === 1 && /Open → Responded/.test(tr.log[0].what) && /SK-03/.test(tr.log[0].note), 'Tracking is saved on the document with a dated log entry', JSON.stringify(tr).slice(0, 200));
  C.ok(JSON.stringify(after.sections) === JSON.stringify(before.sections) && after.status === before.status && after.title === before.title && JSON.stringify(after.cover.data.page) === JSON.stringify(before.cover.data.page), 'The document text, status, title and page setup are untouched');
  C.ok(await p.evaluate(() => /Responded/.test(document.querySelector('.pmt-tr:not(.pmt-th)').parentElement.textContent)), 'The list shows the new state right away');

  // submittal action
  await p.click('.pmt-tr:has-text("Storefront")'); await p.waitForSelector('#pmt-f-act');
  C.ok(!!await p.$('#pmt-f-act'), 'Submittals have an action (No exceptions taken, Revise and resubmit…)');
  await p.selectOption('#pmt-f-act', 'Revise and resubmit'); await p.selectOption('#pmt-f-state', 'responded'); await p.selectOption('#pmt-f-ball', '').catch(() => null); await p.fill('#pmt-f-ball', 'Contractor');
  await p.click('#pmt-save'); await p.waitForTimeout(600);
  const sub = await p.evaluate(() => window.__duMockDB.project_documents.find(d => d.id === 'd2').cover.data.track);
  C.ok(sub.action === 'Revise and resubmit' && /Action: Revise and resubmit/.test(sub.log[sub.log.length - 1].what), 'The submittal action is recorded');

  // CSV
  const dl = p.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await p.click('#pmt-csv'); const got = await dl;
  const csv = got ? require('fs').readFileSync(await got.path(), 'utf8') : '';
  C.ok(/RFI-001/.test(csv) && /Revise and resubmit/.test(csv) && /Ball in court/.test(csv), 'The log downloads as CSV', got ? got.suggestedFilename() : 'no download');

  // open the document, and New item goes to Documents with the type picked
  await p.click('.pmt-tr:has-text("Slab flatness")'); await p.click('#pmt-open'); await p.waitForTimeout(1500);
  C.ok(await p.evaluate(() => /#portal\/documents\?doc=d4/.test(location.hash) || /Slab flatness/.test((document.querySelector('.sp-ed, .sp-editor, .sp-title, input[data-top="title"]') || {}).value || document.body.textContent)), 'Open the document goes to Document Studio');
  await p.evaluate(() => window.DrawUpTracker.open()); await p.waitForSelector('#pmt-new');
  await p.selectOption('#pmt-new', 'rfi'); await p.waitForTimeout(2500);
  C.ok(await p.evaluate(() => !!document.querySelector('.sp-type.on[data-type="rfi"]')), 'New item opens the new-document form with RFI picked');
  await p.keyboard.press('Escape');

  // menu
  const menu = await p.evaluate(() => { const N = window.DrawUpStudio && window.DrawUpStudio._nav && window.DrawUpStudio._nav.PORTAL_NAV; const c = N && N.find(x => x.id === 'projects'); const cols = c && c.cols; return cols ? JSON.stringify(cols) : ''; });
  C.ok(/Project Management/.test(menu) && /"tab":"tracker"/.test(menu), 'Projects › Project Management opens the tracker', menu.slice(0, 160));
  C.ok(!t.errors.length, 'No page errors', t.errors.join(' | ').slice(0, 400));

  console.log('\nPROJECT TRACKER\n' + C.res.map(x => '  ' + x).join('\n'));
  console.log(`\n${C.res.length - C.failed()} passed, ${C.failed()} failed. Screenshots in ${OUT}\n`);
  await t.b.close(); close(); process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
