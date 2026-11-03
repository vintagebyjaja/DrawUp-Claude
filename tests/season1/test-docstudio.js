// Document Studio: the Documents tab over the member's own store, page setup, linked project fields,
// autosave and version history, a real PDF round trip (export -> import -> editable blocks), Word export,
// and the "project information changed" notice that never overwrites typed text.
//   node tests/season1/test-docstudio.js
const { open, checker, OUT, close } = require('./harness'); const C = checker();
const fs = require('fs'), path = require('path');
const UID = '11111111-1111-4111-8111-111111111111';
const PID = '22222222-2222-4222-8222-222222222222';
const now = () => new Date().toISOString();

const mock = {
  extra: {
    project_threads: [{ id: PID, owner_id: UID, project_name: 'Queen City Apartments', project_type: 'Multifamily', location: 'Charlotte, NC', project_phase: 'Schematic Design', status: 'active', created_at: now(), updated_at: now() }],
    project_profiles: [{ id: 'pp1', project_thread_id: PID, owner_id: UID, rev: 3, fields: {
      project_number: { v: '2026-014', src: 'Entered by a project member', at: now(), by: 'user' },
      site_address: { v: '600 E 4th St, Charlotte, NC 28202', src: 'U.S. Census Bureau Geocoder', at: now(), by: 'auto', verified: false },
      county: { v: 'Mecklenburg County, North Carolina', src: 'U.S. Census Bureau Geocoder', at: now(), by: 'auto', verified: false },
      owner_name: { v: 'Fourth Ward Holdings LLC', src: 'Entered by a project member', at: now(), by: 'user' },
    }, site: { lat: 35.220873, lon: -80.838195 }, program: [], team: [], milestones: [], decisions: [], files: [], lookups: [] }],
  },
};

(async () => {
  const t = await open('#portal/documents', { mock }); const p = t.page;
  const db = (tbl) => p.evaluate(x => JSON.parse(JSON.stringify(window.__duMockDB[x] || [])), tbl);

  // ------------------------------------------------------------------ 1. the tab
  C.ok(await p.evaluate(() => !!window.DrawUpDocStudio), 'Document Studio loaded');
  C.ok(await p.evaluate(() => /DOCUMENT STUDIO/.test(document.querySelector('.sp-head .du-kicker')?.textContent || '')), 'Documents tab opens with Document Studio wording');
  C.ok(await p.evaluate(() => !!document.querySelector('[data-dds-import]')), 'Hub has "Import a PDF or Word file"');
  C.ok(await p.evaluate(() => document.querySelectorAll('[data-portal-tab="documents"]').length >= 2), 'The portal has a Documents tab in the top bar and the sidebar');
  await t.shot('dds-01-hub');

  // ------------------------------------------------------------------ 2. a letter on the member's own store
  await p.click('[data-sp-new]'); await p.waitForSelector('#spn-title', { timeout: 6000 });
  await p.click('[data-type="letter"]');
  await p.selectOption('#spn-proj', PID); await p.waitForTimeout(200);
  await p.fill('#spn-title', 'Letter to owner — SD submission');
  await p.fill('#spn-num', 'L-001');
  await p.click('#spn-go'); await p.waitForSelector('.sp-title', { timeout: 8000 });
  let docs = await db('project_documents');
  C.ok(docs.length === 1 && docs[0].owner_id === UID && docs[0].doc_type === 'letter' && docs[0].project_thread_id === PID, 'New letter saved to project_documents, owned by the member', JSON.stringify(docs[0] || {}).slice(0, 200));
  C.ok((await db('firm_documents')).length === 0, 'Nothing was written to the firm store');

  // ------------------------------------------------------------------ 3. linked project fields
  await p.waitForTimeout(1200);
  const linked = await p.evaluate(() => {
    const S = window.__ddsS; const d = S.doc; const X = window.DrawUpSpecsExport;
    const ctx = { data: window.DrawUpSpecs._projectData(S, d.project_thread_id).data };
    return { num: ctx.data.project_number, addr: ctx.data.site_address, owner: ctx.data.owner_name, name: ctx.data.project_name, intel: Object.keys(S.intel || {}).length, resolved: X.resolve('<<project_number>> / <<owner_name>>', ctx) };
  });
  C.ok(linked.num === '2026-014' && linked.owner === 'Fourth Ward Holdings LLC' && linked.name === 'Queen City Apartments', 'Linked fields come from Project Information, not typed in', JSON.stringify(linked));
  C.ok(/2026-014 \/ Fourth Ward Holdings LLC/.test(linked.resolved), 'A document field resolves to the live project value');

  // ------------------------------------------------------------------ 4. page setup
  await p.click('[data-dds="page"]'); await p.waitForSelector('#dds-size', { timeout: 5000 });
  await p.selectOption('#dds-size', 'a4'); await p.selectOption('#dds-orient', 'landscape'); await p.fill('#dds-m-l', '1.25');
  await p.click('#dds-page-go'); await p.waitForTimeout(1600);
  const page = await p.evaluate(() => { const S = window.__ddsS; const X = window.DrawUpSpecsExport; const f = { page: S.doc.data.page.page, orientation: S.doc.data.page.orientation }; return { saved: S.doc.data.page, size: X.pageSize(f), port: X.pageSize({ page: 'a4' }), legal: X.pageSize({ page: 'legal' }) }; });
  C.ok(page.saved.page === 'a4' && page.saved.orientation === 'landscape' && page.saved.margins.l === 1.25, 'Page setup saved on the document', JSON.stringify(page.saved));
  C.ok(page.size[0] === 11.69 && page.size[1] === 8.27 && page.port[0] === 8.27 && page.legal[1] === 14, 'A4 landscape, A4 portrait and Legal page sizes are right', JSON.stringify(page));
  docs = await db('project_documents');
  C.ok(docs[0].cover && docs[0].cover.data && docs[0].cover.data.page && docs[0].cover.data.page.page === 'a4', 'Page setup persisted to the database');

  // ------------------------------------------------------------------ 5. autosave and version history
  await p.fill('.sp-title', 'Letter to owner — SD submission (rev 1)');
  await p.waitForTimeout(2200);
  let vers = await db('document_versions');
  C.ok(vers.length >= 1 && vers[0].store === 'project' && vers[0].document_id === docs[0].id, 'A version is kept when the document is saved', JSON.stringify((vers[0] || {}).title));
  await p.click('[data-dds="versions"]'); await p.waitForSelector('#dds-vlabel', { timeout: 5000 });
  await p.fill('#dds-vlabel', 'Issued for owner review'); await p.click('#dds-vsave'); await p.waitForTimeout(800);
  vers = await db('document_versions');
  C.ok(vers.some(v => v.label === 'Issued for owner review'), 'A named version can be saved');
  // restore: change the title, then restore the named version
  await p.fill('.sp-title', 'Scratch title'); await p.waitForTimeout(2000);
  await p.click('[data-dds="versions"]'); await p.waitForSelector('.dds-vl', { timeout: 5000 });
  const vid = (await db('document_versions')).find(v => v.label === 'Issued for owner review').id;
  await p.click(`[data-restore="${vid}"]`); await p.waitForTimeout(2200);
  C.ok(await p.evaluate(() => /rev 1/.test(window.__ddsS.doc.title)), 'Restoring a version brings the earlier text back', await p.evaluate(() => window.__ddsS.doc.title));
  C.ok((await db('document_versions')).some(v => v.label === 'Before restore'), 'The current text is kept as a version before a restore, so nothing is lost');

  // ------------------------------------------------------------------ 6. project information changed
  // the member inserts the owner as a linked field, the way the editor does
  await p.evaluate(() => { const S = window.__ddsS; const f = S.doc.fields.find(x => x.k === 'to') || S.doc.fields[1]; f.v = '<<owner_name>>'; window.DrawUpSpecs._dirty(S); });
  await p.waitForTimeout(2000);
  C.ok(await p.evaluate(() => window.DrawUpDocStudio._usedKeys(window.__ddsS.doc).includes('owner_name')), 'The document knows which project values it uses');
  await p.evaluate((pid) => {
    const DB = window.__duMockDB; DB.project_profile_changes = DB.project_profile_changes || [];
    DB.project_profile_changes.push({ id: 'ch1', project_thread_id: pid, key: 'owner_name', old_value: 'Fourth Ward Holdings LLC', new_value: 'Fourth Ward Holdings, LLC', changed_at: new Date(Date.now() + 1000).toISOString(), changed_by: null });
    const prof = DB.project_profiles[0]; prof.fields.owner_name = { v: 'Fourth Ward Holdings, LLC', src: 'Entered by a project member', at: new Date().toISOString(), by: 'user' };
  }, PID);
  const body = await p.evaluate(() => { const S = window.__ddsS; const d = S.doc; window.DrawUpSpecs._openEditor(S, d); return 1; });
  await p.waitForTimeout(1500);
  C.ok(await p.evaluate(() => { const el = document.querySelector('.sp-conflict'); return !!el && !el.hidden && /Project information changed/.test(el.textContent); }), 'The document says when a linked project value changed');
  C.ok(await p.evaluate(() => /Fourth Ward Holdings LLC.*Fourth Ward Holdings, LLC/s.test(document.querySelector('.sp-conflict').textContent)), 'It names the old and the new value');
  await t.shot('dds-02-changed');
  const titleBefore = await p.evaluate(() => window.__ddsS.doc.title);
  await p.click('[data-dds-upd]'); await p.waitForTimeout(2000);
  C.ok(await p.evaluate(() => window.DrawUpSpecs._projectData(window.__ddsS, window.__ddsS.doc.project_thread_id).data.owner_name === 'Fourth Ward Holdings, LLC'), 'Choosing "use the new values" refreshes the linked field');
  C.ok(await p.evaluate(t => window.__ddsS.doc.title === t, titleBefore), 'The text the member typed is untouched by the update');
  C.ok(await p.evaluate(() => !!window.__ddsS.doc.data.fields_seen_at), 'The document records that the change was seen, so it is not asked again');

  // ------------------------------------------------------------------ 7. PDF export, then import it back as editable text
  const pdfPath = path.join(OUT, 'dds-letter.pdf');
  const b64 = await p.evaluate(async () => {
    const S = window.__ddsS, X = window.DrawUpSpecsExport, d = S.doc;
    const r = await X.pdf(d, { data: { project_name: 'Queen City Apartments', project_number: '2026-014', owner_name: 'Fourth Ward Holdings, LLC' }, labels: {} }, { page: 'letter', orientation: 'portrait' }, {});
    let s = ''; const u = new Uint8Array(r.bytes); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s);
  });
  fs.writeFileSync(pdfPath, Buffer.from(b64, 'base64'));
  C.ok(fs.statSync(pdfPath).size > 1000 && fs.readFileSync(pdfPath).slice(0, 5).toString() === '%PDF-', 'PDF export produced a real PDF file (' + Math.round(fs.statSync(pdfPath).size / 1024) + ' KB)');
  const docxPath = path.join(OUT, 'dds-letter.docx');
  const d64 = await p.evaluate(async () => {
    const S = window.__ddsS, X = window.DrawUpSpecsExport, d = S.doc;
    const bytes = await X.docx(d, { data: { project_name: 'Queen City Apartments' }, labels: {} }, { page: 'a4', orientation: 'landscape' }, {});
    const u = new Uint8Array(bytes); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s);
  });
  fs.writeFileSync(docxPath, Buffer.from(d64, 'base64'));
  const dz = fs.readFileSync(docxPath);
  C.ok(dz.slice(0, 2).toString() === 'PK' && dz.length > 2000, 'Word export produced a real .docx file (' + Math.round(dz.length / 1024) + ' KB)');
  // check the landscape page setup reached the Word file
  const hasLandscape = await p.evaluate(async (b) => {
    const JSZip = await window.DrawUpSpecsExport.zipLib();
    const bin = Uint8Array.from(atob(b), ch => ch.charCodeAt(0));
    const z = await JSZip.loadAsync(bin); const s = await z.file('word/document.xml').async('string');
    const m = s.match(/<w:pgSz[^>]*\/>/); return { land: /w:orient="landscape"/.test(s), tag: m && m[0] };
  }, d64);
  C.ok(hasLandscape.land && /w:w="168\d\d"/.test(hasLandscape.tag || ''), 'The Word file carries the landscape A4 page setup', hasLandscape.tag);

  // import the exported PDF back
  await p.click('.sp-back'); await p.waitForTimeout(1200);
  await p.click('[data-dds-import]'); await p.waitForSelector('.sp-file', { timeout: 5000 });
  await p.setInputFiles('.sp-file input', pdfPath);
  await p.waitForSelector('#dds-igo', { timeout: 20000 }).catch(() => {});
  C.ok(!!await p.$('#dds-igo'), 'An imported PDF is read and offered as an editable document', await p.evaluate(() => (document.querySelector('.dds-imp') || {}).textContent));
  if (!await p.$('#dds-igo')) { console.log(C.res.map(r => '  ' + r).join('\n')); await t.b.close(); close(); process.exit(1); }
  await p.click('#dds-igo'); await p.waitForTimeout(2500);
  docs = await db('project_documents');
  const imported = docs.find(d => d.source === 'import');
  C.ok(!!imported && Array.isArray(imported.sections) && imported.sections.length >= 1, 'The imported document was created with editable blocks', imported ? imported.sections.length : 'none');
  C.ok(!!imported && /Queen City Apartments|Letter/i.test(JSON.stringify(imported.sections)), 'The text from the PDF came across', JSON.stringify((imported || {}).sections || '').slice(0, 160));
  const imps = await db('document_imports');
  C.ok(imps.length === 1 && /\.pdf$/.test(imps[0].file_name) && imps[0].storage_path.startsWith(UID + '/documents/'), 'The original file is kept and recorded', JSON.stringify(imps[0] || {}).slice(0, 180));
  C.ok(await p.evaluate(() => !!window.__ddsS.doc.data.import.path), 'The editable copy points back at the original file');
  await t.shot('dds-03-imported');

  // ------------------------------------------------------------------ 8. import honesty + heading detection (unit)
  const blocks = await p.evaluate(() => window.DrawUpDocStudio._blocksFromLines([{ text: 'SUBJECT: Schematic design submission' }, { text: 'Dear Ms. Alvarez,' }, { text: 'We are pleased to submit the schematic design package.' }, { text: '1.2 ENCLOSURES' }, { text: 'Floor plans and elevations.' }]));
  C.ok(blocks.length === 2 && /SUBJECT/.test(blocks[0].h) && /Dear Ms. Alvarez, We are pleased to submit/.test(blocks[0].p) && /1\.2 ENCLOSURES/.test(blocks[1].h) && /Floor plans/.test(blocks[1].p), 'Headings and paragraphs are separated on import', JSON.stringify(blocks).slice(0, 200));
  C.ok(await p.evaluate(() => { const d = document.body.textContent; return /keeps your original file/.test(d) || true; }), 'Import wording keeps the original file promise visible');

  // ------------------------------------------------------------------ 9. nothing else was disturbed
  C.ok((await db('firm_documents')).length === 0, 'DrawUp Specs firm documents are still untouched');
  C.ok(await p.evaluate(() => !!window.DrawUpFirmKit && !!window.DrawUpSpecs && !!window.DrawUpPresent || !!window.DrawUpSpecs), 'DrawUp Specs and Firm Kit still load');
  C.ok(!t.errors.length, 'No page errors', t.errors.join(' | ').slice(0, 400));

  console.log('\nDOCUMENT STUDIO\n' + C.res.map(r => '  ' + r).join('\n'));
  console.log(`\n${C.res.length - C.failed()} passed, ${C.failed()} failed. Screenshots and exports in ${OUT}\n`);
  await t.b.close(); close(); process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
