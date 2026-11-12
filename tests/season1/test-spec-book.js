// The full spec book on a format's page: opens from the first page, firm or DrawUp branding, print preview and
// an edit sheet you type on (the change is saved to the document and shows in the print preview).
//   node tests/season1/test-spec-book.js
const { open, checker, close } = require('./harness'); const C = checker();
const UID = '11111111-1111-4111-8111-111111111111', PID = '22222222-2222-4222-8222-222222222222', DOC = '44444444-4444-4444-8444-444444444444', FIRM = '55555555-5555-4555-8555-555555555555';
const now = () => new Date().toISOString();
const para = (id, t, lvl) => ({ id, t, base: t, lvl: lvl || 0 });
const sections = [
  { id: 's2', number: '01 33 00', title: 'Submittal Procedures', state: 'draft', parts: { 1: [{ id: 'a2', title: 'SUMMARY', paras: [para('p3', 'Section includes requirements for submittals.')] }], 2: [], 3: [] } },
  { id: 's1', number: '01 32 00', title: 'Construction Progress Documentation', state: 'draft', parts: { 1: [{ id: 'a1', title: 'SECTION INCLUDES', paras: [para('p1', 'Administrative and procedural requirements for <<project_name>>.'), para('p2', 'Startup construction schedule.', 1)] }], 2: [], 3: [] } }];
(async () => {
  const mock = { rpc: { drawup_my_firms: [{ id: FIRM, name: 'KEi Architects', slug: 'kei-architects', role: 'admin' }] }, extra: {
    firms: [{ id: FIRM, name: 'KEi Architects', slug: 'kei-architects' }], firm_members: [{ firm_id: FIRM, user_id: UID, role: 'admin' }],
    project_threads: [{ id: PID, owner_id: UID, project_name: 'Fourth Ward Apartments', status: 'active', created_at: now(), updated_at: now() }],
    project_documents: [{ id: DOC, owner_id: UID, project_thread_id: PID, doc_type: 'spec', title: 'Fourth Ward Project Manual', status: 'draft', source: 'specs', fields: {}, cover: { data: {} }, sections, created_at: now(), updated_at: now() }] } };
  const t = await open('#portal/documents?view=formats', { mock }); const p = t.page;
  await p.waitForSelector('[data-fopen="drawup"]', { timeout: 15000 }).catch(() => null);
  C.ok(!!(await p.$('[data-fopen="drawup"]')), 'The Formats page shows the DrawUp standard');
  await p.click('[data-fopen="drawup"]');
  await p.waitForSelector('.sp-pgslot canvas', { timeout: 20000 }).catch(() => null);
  const info = await p.evaluate(() => ({ slots: document.querySelectorAll('.sp-pgslot').length, src: document.querySelector('[data-bk="src"]')?.selectedOptions[0]?.textContent, brands: [...document.querySelectorAll('[data-bk-brand]')].map(b => b.textContent + (b.classList.contains('active') ? '*' : '')), top: document.querySelector('.sp-fprev').scrollTop, first: document.querySelector('.sp-pgslot')?.dataset.n }));
  C.ok(info.slots >= 4, 'The whole book is laid out (cover, contents and every section)', JSON.stringify(info));
  C.ok(/Fourth Ward Project Manual/.test(info.src || ''), 'The member’s own project manual is the book shown', info.src);
  C.ok(info.brands.join() === 'KEi Architects*,DrawUp', 'Branding tabs: the firm (picked) and DrawUp', info.brands.join());
  C.ok(info.top === 0 && info.first === '1', 'It opens at the first page');
  await p.evaluate(() => document.querySelector('.sp-bk-top').scrollIntoView()); await p.waitForTimeout(900); await t.shot('book-print-firm');
  // edit sheet
  await p.click('[data-bk-mode="edit"]'); await p.waitForSelector('.sp-sheet [data-e]', { timeout: 10000 });
  const sheet = await p.evaluate(() => ({ n: document.querySelectorAll('.sp-sheet').length, firstSec: document.querySelector('.sp-sheet[data-sec]')?.dataset.sec, head: document.querySelector('.sp-sh-head')?.textContent, tok: document.querySelectorAll('.sp-tok').length }));
  C.ok(sheet.n === 4 && sheet.firstSec === 's1', 'Edit sheet: cover, contents, then sections in number order (01 32 00 first)', JSON.stringify(sheet));
  C.ok(/KEi Architects Project Number/.test(sheet.head || ''), 'Header carries the firm name in firm branding', sheet.head);
  await p.evaluate(() => document.querySelector('.sp-bk-top').scrollIntoView()); await p.waitForTimeout(300); await t.shot('book-edit-firm'); await p.evaluate(() => { const b = document.querySelector('.sp-fprev'); b.scrollTop = b.querySelector('.sp-sheet[data-sec]').offsetTop * parseFloat(b.querySelector('.sp-sheets').style.zoom || 1) - 10; }); await p.waitForTimeout(300); await t.shot('book-edit-firm-sec');
  // type into a paragraph that holds project data: the data code survives
  const el = await p.$('[data-e="p:1:1:0:0"]'); await el.click(); await p.keyboard.press('End'); await p.keyboard.type(' Typed here.');
  await p.click('[data-e="a:1:1:0"]', { clickCount: 3 }); await p.keyboard.type('SCOPE OF SECTION');
  await p.click('[data-e="s:1"]', { clickCount: 3 }); await p.keyboard.type('Progress Documentation');
  await p.waitForTimeout(2200);
  const saved = await p.evaluate(D => { const r = window.__duMockDB.project_documents.find(x => x.id === D); const s = r.sections.find(x => x.id === 's1'); return { p: s.parts[1][0].paras[0].t, a: s.parts[1][0].title, t: s.title, st: document.querySelector('.sp-bk-st')?.textContent }; }, DOC);
  C.ok(saved.p === 'Administrative and procedural requirements for <<project_name>>. Typed here.', 'Typed words save to the document and the project data code is kept', saved.p);
  C.ok(saved.a === 'SCOPE OF SECTION' && saved.t === 'Progress Documentation', 'Article and section titles change by typing', saved.a + ' | ' + saved.t);
  C.ok(/Saved/.test(saved.st || ''), 'Save status shows', saved.st);
  // Enter does not break the format
  const before = await p.evaluate(() => document.querySelectorAll('.sp-sh-p').length); await p.click('[data-e="p:1:1:0:1"]'); await p.keyboard.press('Enter'); const after = await p.evaluate(() => document.querySelectorAll('.sp-sh-p').length);
  C.ok(before === after, 'Enter does not add or split paragraphs (the format stays locked)');
  // DrawUp branding
  await p.click('[data-bk-brand="drawup"]'); await p.waitForTimeout(1200);
  const dh = await p.evaluate(() => document.querySelector('.sp-sh-head')?.textContent + ' | ' + document.querySelector('.sp-sh-cover')?.textContent);
  C.ok(/DrawUp Project Number/.test(dh) && !/KEi/.test(dh), 'DrawUp branding puts the DrawUp name across the book', dh);
  await p.evaluate(() => document.querySelector('.sp-bk-top').scrollIntoView()); await t.shot('book-edit-drawup');
  // back to print: the edit is in the PDF
  await p.click('[data-bk-mode="print"]'); await p.waitForSelector('.sp-pgslot canvas', { timeout: 20000 }).catch(() => null); await p.waitForTimeout(800);
  await p.evaluate(() => { const b = document.querySelector('.sp-fprev'); b.scrollTop = b.querySelector('.sp-pgslot[data-n="3"]').offsetTop - 10; }); await p.waitForTimeout(1500); await t.shot('book-print-drawup');
  // the starter book
  await p.selectOption('[data-bk="src"]', 'starter'); await p.waitForSelector('.sp-pgslot', { timeout: 20000 }); await p.waitForTimeout(1500);
  const st = await p.evaluate(() => ({ n: document.querySelectorAll('.sp-pgslot').length, save: !!document.querySelector('[data-bk-act="savedoc"]') }));
  C.ok(st.n > 30 && st.save, 'DrawUp starter book compiles in full and can be saved as a document', JSON.stringify(st));
  // phone width
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(600); await p.click('[data-bk-mode="edit"]'); await p.waitForTimeout(1200);
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  C.ok(ov <= 1, 'No sideways scroll on a phone', String(ov));
  await t.shot('book-phone');
  C.ok(!t.errors.length, 'No page errors', t.errors.slice(0, 3).join(' | '));
  console.log(C.res.join('\n')); await t.b.close(); close(); process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
