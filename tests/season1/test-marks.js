// Seals and signatures: kept in the person's private folder, applied only by them with a confirmation, recorded
// with name and date on the document, placed in the PDF and Word exports, and taken off only by the person who
// applied them. Project data edits keep them.
//   node tests/season1/test-marks.js
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const { open, checker, OUT, close } = require('./harness'); const C = checker();
const UID = '11111111-1111-4111-8111-111111111111', PID = '22222222-2222-4222-8222-222222222222', SPEC = '66666666-6666-4666-8666-666666666666', LET = '77777777-7777-4777-8777-777777777777';
const now = () => new Date().toISOString();
const FX = path.join(__dirname, 'fixtures');

(async () => {
  const sections = [{ id: 's1', number: '01 10 00', title: 'Summary', state: 'draft', parts: { 1: [{ id: 'a1', title: 'SUMMARY', paras: [{ id: 'p1', t: 'Work includes the renovation.', base: 'Work includes the renovation.', lvl: 0 }] }], 2: [], 3: [] } }];
  const other = { id: 'm-other', kind: 'signature', img: 'data:image/png;base64,' + fs.readFileSync(path.join(FX, 'test-signature.png')).toString('base64'), w: 600, h: 180, name: 'Someone Else', role: '', at: now(), by: '99999999-9999-4999-8999-999999999999' };
  const mock = { extra: {
    project_threads: [{ id: PID, owner_id: UID, project_name: 'Fourth Ward Apartments', status: 'active', created_at: now(), updated_at: now() }],
    project_documents: [
      { id: SPEC, owner_id: UID, project_thread_id: PID, doc_type: 'spec', title: 'Project Manual', status: 'draft', source: 'specs', fields: {}, cover: { data: {} }, sections, created_at: now(), updated_at: now() },
      { id: LET, owner_id: UID, project_thread_id: PID, doc_type: 'rfi', title: 'RFI response', status: 'draft', source: 'specs', fields: { list: [], heading: 'Letter' }, cover: { data: { marks: [other] } }, sections: [{ id: 'b1', p: 'Please find the revised drawings attached.' }], created_at: now(), updated_at: now() }] } };
  const t = await open('#portal/documents?doc=' + SPEC, { mock }); const p = t.page;
  await p.waitForSelector('[data-sp-marks]', { timeout: 10000 }).catch(() => null);
  C.ok(!!await p.$('[data-sp-marks]'), 'The editor has a "Seal & signature" button');
  await p.click('[data-sp-marks]'); await p.waitForSelector('.mk [data-up="signature"]', { timeout: 5000, state: 'attached' });
  C.ok(await p.evaluate(() => /No one else can see them/.test(document.querySelector('.mk').textContent) && /Formats › Letterhead/.test(document.querySelector('.mk').textContent)), 'It says the images are private, and points logos to the letterhead');

  // save a signature and a seal to the private folder
  await p.setInputFiles('.mk [data-up="signature"]', path.join(FX, 'test-signature.png')); await p.waitForSelector('.mk [data-apply]', { timeout: 8000 }).catch(() => null);
  await p.setInputFiles('.mk [data-up="seal"]', path.join(FX, 'test-seal.png')); await p.waitForFunction(() => document.querySelectorAll('.mk [data-apply]').length === 2, null, { timeout: 8000 }).catch(() => null);
  const stored = await p.evaluate(() => Object.keys(window.__duMockStore || {}));
  C.ok(stored.length === 2 && stored.every(k => k.startsWith('drawup-private/11111111-1111-4111-8111-111111111111/marks/')), 'Both are saved in the person’s own private folder', stored.join(', '));
  const transparent = await p.evaluate(async () => { const k = Object.keys(window.__duMockStore).find(x => /signature-/.test(x)); const b = window.__duMockStore[k].body; const u = URL.createObjectURL(b); const i = new Image(); await new Promise(r => { i.onload = r; i.src = u; }); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(2, 2, 1, 1).data[3]; });
  C.ok(transparent === 0, 'The white behind a signature is made clear', String(transparent));
  await t.shot('marks-01-library');

  // applying needs the confirmation
  const before = await p.evaluate(id => JSON.stringify(window.__duMockDB.project_documents.find(d => d.id === id).cover), SPEC);
  await p.click('.mk [data-apply="0"]'); await p.waitForTimeout(300);
  C.ok(await p.evaluate(() => /Tick the box/.test(document.querySelector('.mk-st').textContent)) && !(await p.$('.mk-on .mk-card')), 'Nothing is applied until the person confirms it is their own');
  await p.fill('#mk-name', 'Jordan Rivera'); await p.fill('#mk-role', 'Architect, VA 0401-012345');
  await p.check('#mk-mine'); await p.click('.mk [data-apply="1"]'); await p.waitForSelector('.mk-on .mk-card', { timeout: 4000 }).catch(() => null);
  await p.check('#mk-mine'); await p.click('.mk [data-apply="0"]'); await p.waitForTimeout(2200);
  await t.shot('marks-02-applied');
  const saved = await p.evaluate(id => JSON.parse(JSON.stringify(window.__duMockDB.project_documents.find(d => d.id === id))), SPEC);
  const mk = (saved.cover && saved.cover.data && saved.cover.data.marks) || [];
  C.ok(mk.length === 2 && mk.every(m => m.by === UID && m.name === 'Jordan Rivera' && /VA 0401/.test(m.role) && m.at && /^data:image\/png;base64,/.test(m.img)) && mk.some(m => m.kind === 'seal') && mk.some(m => m.kind === 'signature'), 'The seal and signature are saved on the document with the name, role, date and who applied them', JSON.stringify(mk.map(m => [m.kind, m.name, m.by])));
  C.ok(JSON.stringify(saved.sections) === JSON.stringify(sections), 'The document text is untouched');
  C.ok(before !== JSON.stringify(saved.cover), 'The document changed only by the marks');

  // exports
  const out = await p.evaluate(async id => {
    const X = window.DrawUpSpecsExport; const r = window.__duMockDB.project_documents.find(d => d.id === id);
    const doc = { kind: 'spec', title: r.title, sections: r.sections, data: r.cover.data };
    const ctx = { data: { project_name: 'Fourth Ward Apartments', owner_name: 'Owner', architect_name: 'Architect', project_number: '1' } };
    const fmt = { ...X.fixFormat(null), cover: false, toc: false };
    const a = await X.pdf(doc, ctx, fmt, {}); const d = await X.docx(doc, ctx, fmt, {});
    const b64 = u => { let s = ''; const B = u.bytes || u; for (let i = 0; i < B.length; i++) s += String.fromCharCode(B[i]); return btoa(s); };
    return { pdf: b64(a), docx: b64(d) };
  }, SPEC);
  const pf = path.join(OUT, 'marks-manual.pdf'), df = path.join(OUT, 'marks-manual.docx');
  fs.writeFileSync(pf, Buffer.from(out.pdf, 'base64')); fs.writeFileSync(df, Buffer.from(out.docx, 'base64'));
  const ptxt = execFileSync('pdftotext', ['-layout', pf, '-']).toString(); const pimg = execFileSync('pdfimages', ['-list', pf]).toString().trim().split('\n').length - 2;
  C.ok(/SEALS AND SIGNATURES/.test(ptxt) && /Jordan Rivera/.test(ptxt) && /Signed \w+ \d+, \d{4}/.test(ptxt) && /Sealed /.test(ptxt) && pimg >= 2, 'The PDF has a seals page with both images, the name and the dates', `images ${pimg}`);
  C.ok(ptxt.indexOf('SEALS AND SIGNATURES') < ptxt.indexOf('SUMMARY'), 'In a manual, the seals page comes before the first section');
  const unz = execFileSync('unzip', ['-l', df]).toString(); const dxml = execFileSync('unzip', ['-p', df, 'word/document.xml']).toString(); const rels = execFileSync('unzip', ['-p', df, 'word/_rels/document.xml.rels']).toString();
  const ids = [...dxml.matchAll(/r:embed="(rMk\w+)"/g)].map(m => m[1]);
  C.ok((unz.match(/word\/media\/mark_/g) || []).length === 2 && ids.length === 2 && ids.every(i => rels.includes(`Id="${i}"`)) && /Jordan Rivera/.test(dxml), 'The Word file carries both images, linked, with the caption');
  // Word file opens: convert with LibreOffice and look for the images
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-'));
  try { execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', tmp, df], { stdio: 'ignore', timeout: 120000 }); const conv = path.join(tmp, 'marks-manual.pdf'); const n = fs.existsSync(conv) ? execFileSync('pdfimages', ['-list', conv]).toString().trim().split('\n').length - 2 : -1; C.ok(n >= 2, 'The Word file opens with both images in place (LibreOffice)', String(n)); } catch (e) { C.ok(false, 'The Word file opens with both images in place (LibreOffice)', e.message.slice(0, 120)); }

  // take off: own mark yes, someone else's no
  const off = await p.evaluate(() => { const b = document.querySelector('.mk [data-off]'); if (!b) return false; b.click(); return true; }); await p.waitForTimeout(1800);
  const left = await p.evaluate(id => (window.__duMockDB.project_documents.find(d => d.id === id).cover.data.marks || []).length, SPEC);
  C.ok(off && left === 1, 'The person who applied a mark can take it off', String(left));
  await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelectorAll('.mk').forEach(m => m.remove()));

  // a letter: someone else's signature cannot be taken off by this person, and marks go at the end
  const errs1 = t.errors.slice(); await t.b.close();
  const t2 = await open('#portal/documents?doc=' + LET, { mock }); const p2 = t2.page;
  await p2.waitForSelector('[data-sp-marks]', { timeout: 10000 }).catch(() => null);
  C.ok(await p2.evaluate(() => /\(1\)/.test((document.querySelector('[data-sp-marks]') || {}).textContent || '')), 'The button shows how many are on the document');
  await p2.click('[data-sp-marks]'); await p2.waitForSelector('.mk-on', { timeout: 5000 });
  C.ok(await p2.evaluate(() => !document.querySelector('.mk [data-off]') && /Applied by someone else/.test(document.querySelector('.mk-on').textContent)), 'Someone else’s signature cannot be taken off');
  const lt = await p2.evaluate(async id => { const X = window.DrawUpSpecsExport; const r = window.__duMockDB.project_documents.find(d => d.id === id); const doc = { kind: 'letter', title: r.title, heading: 'Letter', fields: [], blocks: r.sections, data: r.cover.data }; const bl = X.flatten(doc, { data: {} }, X.fixFormat(null), {}); return bl.map(b => b.t).join(','); }, LET);
  C.ok(/,marks$/.test(lt), 'In a letter, signatures go at the end', lt);
  C.ok(!errs1.length && !t2.errors.length, 'No page errors', errs1.concat(t2.errors).join(' | ').slice(0, 400));
  console.log('\nSEALS AND SIGNATURES\n' + C.res.map(x => '  ' + x).join('\n'));
  console.log(`\n${C.res.length - C.failed()} passed, ${C.failed()} failed.\n`);
  await t2.b.close(); close(); process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
