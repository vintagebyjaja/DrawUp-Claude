// Portfolio Review from what DrawUp already has: earlier uploads, project files, imported documents and firm
// presentation PDFs, plus "Review in Portfolio Review" from the presentation builder.
//   node tests/season1/test-portfolio-sources.js
const { open, checker, OUT, close } = require('./harness'); const C = checker();
const { PDFDocument, StandardFonts } = require('pdf-lib');
const UID = '11111111-1111-4111-8111-111111111111', PID = '22222222-2222-4222-8222-222222222222', FIRM = '44444444-4444-4444-8444-444444444444';
const now = () => new Date().toISOString();

async function pdf(pages) {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) { const p = d.addPage([792, 612]); p.drawText('Portfolio page ' + i, { x: 60, y: 520, size: 32, font: f }); }
  return Buffer.from(await d.save()).toString('base64');
}

(async () => {
  const files = {
    'drawup-private/u/projects/p/site-plans.pdf': await pdf(3),
    'student-portfolios/u/r1/jaja-portfolio.pdf': await pdf(2),
  };
  const mock = {
    files,
    rpc: { drawup_my_firms: [{ id: FIRM, name: 'KEi Architects', slug: 'kei-architects', role: 'admin' }] },
    extra: {
      project_threads: [{ id: PID, owner_id: UID, project_name: 'Fourth Ward Apartments', project_type: 'Multifamily', status: 'active', created_at: now(), updated_at: now() }],
      project_profiles: [{ id: 'pp1', project_thread_id: PID, owner_id: UID, rev: 1, fields: {}, files: [
        { path: 'u/projects/p/site-plans.pdf', name: 'site-plans.pdf', kind: 'drawings', size: 120000, type: 'application/pdf', at: now() },
        { path: 'u/projects/p/photo.jpg', name: 'photo.jpg', kind: 'photos', size: 9000, type: 'image/jpeg', at: now() }] }],
      portfolio_reviews: [{ id: 'r1', user_id: UID, title: 'Internship portfolio', file_name: 'jaja-portfolio.pdf', file_path: 'u/r1/jaja-portfolio.pdf', file_size_bytes: 2400000, goal: 'internship', discipline: 'architecture', status: 'complete', feedback: { overall_score: 78 }, page_count: 2, pages: [], created_at: now() }],
      document_imports: [{ id: 'i1', owner_id: UID, store: 'project', file_name: 'consultant-narrative.pdf', mime_type: 'application/pdf', size_bytes: 50000, storage_path: 'u/documents/n.pdf', created_at: now() },
        { id: 'i2', owner_id: UID, store: 'project', file_name: 'notes.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size_bytes: 5000, storage_path: 'u/documents/n.docx', created_at: now() }],
      firms: [{ id: FIRM, name: 'KEi Architects', slug: 'kei-architects' }],
      firm_members: [{ firm_id: FIRM, user_id: UID, role: 'admin' }],
      firm_kit_files: [{ id: 'k1', firm_id: FIRM, kind: 'template', storage_path: FIRM + '/t/kei-deck.pdf', file_name: 'KEi deck template.pdf', mime_type: 'application/pdf', size_bytes: 800000, created_at: now() }],
      firm_presentation_templates: [{ id: 'tpl1', firm_id: FIRM, name: 'KEi meeting deck', is_default: true, updated_at: now(), spec: { format: 'wide', margins: { t: 0.6, r: 0.7, b: 0.6, l: 0.7 }, safe: 0.25, colors: { primary: '#123456', accent: '#E8772E', text: '#1B2430', bg: '#FFFFFF' }, fonts: { heading: 'Helvetica', body: 'Helvetica' }, sizes: { title: 40, heading: 28, body: 18, small: 10 } } }],
    },
  };
  const api = async p => p === '/api/portfolio' ? { status: 200, json: { cost: 30, ask_cost: 1, max_pages: 40, ready: true } } : null;
  const t = await open('#portal/portfolio', { mock, api }); const p = t.page;
  await p.waitForSelector('.dpr-have', { timeout: 10000 }).catch(() => null);
  const groups = await p.$$eval('.dpr-have-g h3', hs => hs.map(h => h.textContent));
  C.ok(groups.length === 4, 'Portfolio Review lists PDFs from earlier uploads, project files, imported documents and the firm', groups.join(', '));
  const names = await p.$$eval('.dpr-have-i b', bs => bs.map(b => b.textContent));
  C.ok(names.includes('site-plans.pdf') && names.includes('jaja-portfolio.pdf') && names.includes('consultant-narrative.pdf') && names.includes('KEi deck template.pdf'), 'Each PDF is listed by its own name', names.join(', '));
  C.ok(!names.includes('photo.jpg') && !names.includes('notes.docx'), 'Pictures and Word files are not offered (the review reads PDFs)');
  C.ok(await p.evaluate(() => /Fourth Ward Apartments/.test(document.querySelector('.dpr-have').textContent)), 'A project file shows which project it belongs to');
  await t.shot('pr-01-have');

  await p.click('.dpr-have-i:has-text("jaja-portfolio.pdf")');
  await p.waitForFunction(() => document.querySelectorAll('#dpr-thumbs .dpr-thumb').length === 2, null, { timeout: 15000 }).catch(() => null);
  C.ok(await p.$$eval('#dpr-thumbs .dpr-thumb', x => x.length) === 2, 'An earlier upload opens in the review with its pages');
  C.ok(await p.evaluate(() => /jaja-portfolio\.pdf/.test(document.querySelector('#dpr-file-name').textContent)), 'The chosen file is named where an upload would be');
  await p.click('.dpr-have summary'); await p.click('.dpr-have-i:has-text("site-plans.pdf")');
  await p.waitForFunction(() => document.querySelectorAll('#dpr-thumbs .dpr-thumb').length === 3, null, { timeout: 15000 }).catch(() => null);
  C.ok(await p.$$eval('#dpr-thumbs .dpr-thumb', x => x.length) === 3, 'A project file opens the same way (3 pages)');
  C.ok(!!await p.$('#dpr-form'), 'The normal review form follows (goal, pages, start)');
  await t.shot('pr-02-picked');
  const before = await p.evaluate(() => JSON.stringify([window.__duMockDB.project_profiles, window.__duMockDB.document_imports, window.__duMockDB.firm_kit_files]));

  // from the presentation builder
  await p.evaluate(() => { location.hash = '#portal/firm?firm=kei-architects&pane=present'; });
  await p.waitForSelector('[data-fk-make]', { timeout: 10000 }).catch(() => null);
  C.ok(!!await p.$('[data-fk-make]'), 'Firm presentation builder is reachable');
  await p.click('[data-fk-make]'); await p.waitForSelector('[data-fkm="review"]', { timeout: 5000 }).catch(() => null);
  C.ok(!!await p.$('[data-fkm="review"]'), 'Making a presentation offers "Review in Portfolio Review"');
  await p.click('[data-fkm="review"]');
  await p.waitForFunction(() => /portfolio/.test(location.hash) && document.querySelectorAll('#dpr-thumbs .dpr-thumb').length >= 2, null, { timeout: 20000 }).catch(() => null);
  const st = await p.evaluate(() => ({ hash: location.hash, n: document.querySelectorAll('#dpr-thumbs .dpr-thumb').length, name: (document.querySelector('#dpr-file-name') || {}).textContent }));
  C.ok(/portfolio/.test(st.hash) && st.n >= 2 && /project-kickoff-meeting\.pdf/.test(st.name || ''), 'The presentation goes straight into Portfolio Review as a PDF, page by page', JSON.stringify(st));
  await t.shot('pr-03-from-presentation');
  const after = await p.evaluate(() => JSON.stringify([window.__duMockDB.project_profiles, window.__duMockDB.document_imports, window.__duMockDB.firm_kit_files]));
  C.ok(before === after, 'Nothing about the source files was changed');
  C.ok(!t.errors.length, 'No page errors', t.errors.join(' | ').slice(0, 400));

  console.log('\nPORTFOLIO REVIEW FROM EXISTING FILES\n' + C.res.map(x => '  ' + x).join('\n'));
  console.log(`\n${C.res.length - C.failed()} passed, ${C.failed()} failed. Screenshots in ${OUT}\n`);
  await t.b.close(); close(); process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
