// Spec imports that keep every word: the real Division 01 set (27 Word files) and the combined manual are read,
// turned into sections, and checked word for word against an independent reading of each file (srcwords.py).
// Then the import window: four sources, a consultant merge that keeps a duplicate number beside the original,
// the same-format check, the three layout settings, and an export of the imported text.
//   node tests/season1/test-spec-import.js
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const { open, checker, close } = require('./harness'); const C = checker();
const SRC = process.env.DIV01 || '/mnt/project-files/specs/division-01-source';
const COMBINED = process.env.DIV01_COMBINED || '/mnt/project-files/specs/Division 01 - General Requirements (combined).docx';
const UID = '11111111-1111-4111-8111-111111111111', PID = '22222222-2222-4222-8222-222222222222', DOC = '44444444-4444-4444-8444-444444444444';
const now = () => new Date().toISOString();
const have = fs.existsSync(SRC);
const files = have ? fs.readdirSync(SRC).filter(f => f.endsWith('.docx')).sort().map(f => path.join(SRC, f)) : [];
if (have && fs.existsSync(COMBINED)) files.push(COMBINED);
const indep = files.length ? JSON.parse(execFileSync('python3', [path.join(__dirname, 'srcwords.py'), ...files], { maxBuffer: 1 << 28 }).toString()) : {};

(async () => {
  const sections = [{ id: 's1', number: '01 21 00', title: 'Allowances', state: 'draft', parts: { 1: [{ id: 'a1', title: 'SUMMARY', paras: [{ id: 'p1', t: 'Existing allowance text.', base: 'Existing allowance text.', lvl: 0 }] }], 2: [], 3: [] } }];
  const mock = { extra: {
    project_threads: [{ id: PID, owner_id: UID, project_name: 'Fourth Ward Apartments', status: 'active', created_at: now(), updated_at: now() }],
    project_documents: [{ id: DOC, owner_id: UID, project_thread_id: PID, doc_type: 'spec', title: 'Project Manual', status: 'draft', source: 'specs', fields: {}, cover: { data: {} }, sections, created_at: now(), updated_at: now() }] } };
  const t = await open('#portal/documents?doc=' + DOC, { mock }); const p = t.page;
  await p.waitForFunction(() => window.DrawUpSpecsImport && window.DrawUpSpecsExport, null, { timeout: 10000 }).catch(() => null);
  C.ok(await p.evaluate(() => !!window.DrawUpSpecsImport), 'The importer loads');

  // ---- 1. every real file, word for word, against an independent reading
  if (!files.length) C.ok(false, 'Division 01 source files found', SRC);
  let allSecs = 0, worst = 1, bad = [];
  for (const f of files) {
    const b64 = fs.readFileSync(f).toString('base64'); const name = path.basename(f);
    const r = await p.evaluate(async ({ b64, name }) => {
      const I = window.DrawUpSpecsImport; const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const blocks = await I.readDocx(bytes); const { sections, notes } = I.toSections(blocks, { file: name, source: 'drawup' });
      const flat = sections.flatMap(s => { const lead = s.parts[1][0] && s.parts[1][0].lead ? s.parts[1][0] : null; const o = [...(lead ? lead.paras.map(x => x.t) : []), 'SECTION', s.number, s.title]; [1, 2, 3].forEach(n => { if (s.part_titles && s.part_titles[n]) o.push(s.part_titles[n]); s.parts[n].forEach(a => { if (a === lead) return; o.push(a.title); a.paras.forEach(x => o.push(x.t)); }); }); return o; }).join(' ');
      const cov = I.coverage(blocks, sections);
      // export it in the DrawUp standard to prove the imported text lays out
      const doc = { kind: 'spec', title: 'Check', sections }; const X = window.DrawUpSpecsExport;
      const fl = X.flatten(doc, { values: {} }, X.DRAWUP_FORMAT, {});
      return { n: sections.length, nums: sections.map(s => s.number + ' ' + s.title).slice(0, 4), flat, cov: { total: cov.total, kept: cov.kept, missing: cov.missing.slice(0, 3) }, notes: notes.length, flatN: fl.length, front: sections.filter(s => s.front).length };
    }, { b64, name });
    // independent check: every word of the file, in order, is in the imported sections
    const norm = ws => { const o = []; ws.map(w => String(w).toLowerCase().replace(/[‘’`]/g, "'").replace(/[“”]/g, '"').replace(/^[^\w<{[]+|[^\w>}\]]+$/g, '')).filter(Boolean).forEach(w => { if (/^\d+$/.test(w) && o.length && /^\d+$/.test(o[o.length - 1])) o[o.length - 1] += w; else o.push(w); }); return o; };
    const src = norm(indep[name] || []), dst = norm(r.flat.split(/\s+/));
    let j = 0, kept = 0; const miss = [];
    for (let i = 0; i < src.length; i++) { const w = src[i]; let k = -1; for (let x = j; x < Math.min(dst.length, j + 600); x++) if (dst[x] === w && (x - j < 3 || i + 2 >= src.length || (dst[x + 1] === src[i + 1] && dst[x + 2] === src[i + 2]))) { k = x; break; } if (k >= 0) { kept++; j = k + 1; } else if (miss.length < 5) miss.push(w); }
    const pct = src.length ? kept / src.length : 0; worst = Math.min(worst, pct); allSecs += r.n;
    if (pct < 1 || r.cov.kept !== r.cov.total) bad.push(`${name}: ${kept}/${src.length} independent, ${r.cov.kept}/${r.cov.total} own check, missing ${miss.join(' ')} ${r.cov.missing.join(' | ')}`);
    if (process.env.VERBOSE) console.log(name, r.n, r.nums.join(' ; '), kept + '/' + src.length, r.front ? 'front' : '', r.flatN);
  }
  C.ok(files.length >= 27 && !bad.length, `All ${files.length} Division 01 files import with every word kept, in order (independent check and the importer's own check)`, bad.slice(0, 4).join(' || '));
  C.ok(allSecs >= files.length, `${allSecs} sections were made from ${files.length} files`);

  // ---- 1b. an imported section exports in the DrawUp standard with every word on the page
  if (files.length) {
    const f = path.join(SRC, '01_2200_-_UNIT_PRICES.docx'); const b64 = fs.readFileSync(f).toString('base64');
    const pdfB64 = await p.evaluate(async b64 => { const I = window.DrawUpSpecsImport, X = window.DrawUpSpecsExport; const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const { sections } = I.toSections(await I.readDocx(bytes), { file: '01_2200_-_UNIT_PRICES.docx' });
      const out = await X.pdf({ kind: 'spec', title: 'Check', sections }, { data: { owner_name: 'OWNER', project_name: 'PROJECT', architect_name: 'ARCHITECT', project_number: '1' } }, { ...X.fixFormat(null), cover: false, toc: false });
      const B = out.bytes || out; let s = ''; for (let i = 0; i < B.length; i++) s += String.fromCharCode(B[i]); return btoa(s); }, b64);
    const pf = path.join(__dirname, 'out', 'import-unit-prices.pdf'); fs.writeFileSync(pf, Buffer.from(pdfB64, 'base64'));
    const txt = execFileSync('pdftotext', ['-layout', pf, '-']).toString().replace(/-\n\s*/g, '');
    const have = new Set(txt.toLowerCase().split(/\s+/).map(w => w.replace(/^[^\w]+|[^\w]+$/g, '')));
    const want = (indep['01_2200_-_UNIT_PRICES.docx'] || []).map(w => w.toLowerCase().replace(/^[^\w]+|[^\w]+$/g, '')).filter(w => w && !/^\d+$/.test(w));
    const lost = want.filter(w => !have.has(w));
    C.ok(want.length > 400 && lost.length === 0, `The imported section exports to PDF in the DrawUp standard with all ${want.length} words on the page`, lost.slice(0, 8).join(' '));
  }

  // ---- 2. the window: consultant merge beside an existing number, same-format check, three layouts
  await p.waitForSelector('[data-imp]', { timeout: 8000 }).catch(() => null);
  await p.click('[data-imp]'); await p.waitForSelector('.spx [data-src]', { timeout: 5000 });
  C.ok((await p.$$eval('.spx [data-src]', x => x.map(b => b.dataset.src).join(','))) === 'client,firm,drawup,consultant', 'Four sources: client, firm standard, DrawUp standard, consultant');
  await p.click('.spx [data-src="consultant"]');
  const allow = path.join(SRC, '01_2100_-_ALLOWANCES.docx'), unit = path.join(SRC, '01_2200_-_UNIT_PRICES.docx');
  await p.setInputFiles('.spx input[type=file]', [allow, unit]); await p.waitForSelector('#spx-add', { timeout: 15000 }).catch(() => null);
  const txt = await p.evaluate(() => document.querySelector('.spx').textContent);
  C.ok(/Word-for-word check/.test(txt) && /Nothing was left out/.test(txt), 'The window shows the word-for-word check, with nothing left out', txt.slice(0, 200));
  C.ok(/Same-format check/.test(txt) && /already has 01 21 00/.test(txt), 'The same-format check flags that 01 21 00 is already in the manual', txt.match(/Same-format check.{0,200}/) && txt.match(/Same-format check.{0,200}/)[0]);
  await t.shot('import-01-check');
  await p.click('#spx-add'); await p.waitForSelector('[data-lay]', { timeout: 5000 });
  await t.shot('import-02-layouts');
  const lay = await p.$$eval('[data-lay]', x => x.map(b => b.dataset.lay + (b.disabled ? ':off' : '')).join(','));
  C.ok(lay === 'firm:off,client:off,drawup', 'Three layout settings; firm and client wait until a format is saved, so the DrawUp standard is the default', lay);
  await p.click('[data-lay="drawup"]'); await p.waitForTimeout(1800);
  const saved = await p.evaluate(() => JSON.parse(JSON.stringify(window.__duMockDB.project_documents[0])));
  const s21 = saved.sections.filter(s => s.number === '01 21 00');
  C.ok(s21.length === 2 && s21.some(s => s.id === 's1' && s.parts[1][0].paras[0].t === 'Existing allowance text.') && s21.some(s => s.dup_of === 's1' && /consultant/.test(s.title)), 'The existing 01 21 00 is untouched and the consultant’s 01 21 00 is kept beside it, flagged', s21.map(s => s.title).join(' / '));
  C.ok(saved.sections.some(s => s.number === '01 22 00' && s.state === 'draft' && s.imported && s.imported.source === 'consultant'), 'Imported sections are editable Drafts that remember where they came from');
  const log = (saved.cover && saved.cover.data && saved.cover.data.imports) || (saved.data && saved.data.imports) || [];
  C.ok(Array.isArray(log) && log.length === 1 && log[0].files.length === 2 && log[0].files.every(f => f.kept === f.words), 'The import and its word counts are logged on the document', JSON.stringify(log).slice(0, 200));
  C.ok(!saved.format_id, 'With no firm or client format saved, the manual uses the DrawUp standard');
  // editing works on an imported paragraph
  const edinfo = await p.evaluate(() => ({ tab: (document.querySelector('.sp-parts .on') || {}).textContent, n: document.querySelectorAll('.sp-txt').length, ce: document.querySelectorAll('.sp-txt[contenteditable="true"]').length, title: (document.querySelector('.sp-sec-title') || {}).textContent }));
  C.ok(edinfo.ce > 0, 'The imported section opens in the editor and can be edited', JSON.stringify(edinfo));

  // ---- 3. typed numbers and level checks (units)
  const u = await p.evaluate(() => { const I = window.DrawUpSpecsImport;
    const blocks = ['SECTION 08 7100 - DOOR HARDWARE', 'PART 1 - GENERAL', '1.01 SUMMARY', 'A. Section includes hinges.', '1. Butts.', 'a. Ball bearing.', 'PART 2 - PRODUCTS', 'PART 4 - SCHEDULES', 'Hardware set 1: hinges, lockset.', 'END OF SECTION 08 7100'].map(x => I.classify(x, null));
    const r = I.toSections(blocks, { file: 'x.docx', source: 'client' }); const s = r.sections[0]; const cov = I.coverage(blocks, r.sections);
    const a = s.parts[1][0]; const p3 = s.parts[3]; const lv = a.paras.map(p => p.lvl).join('');
    const doc = { sections: [] }; s.parts[1][0].paras.push({ id: 'z', t: 'B. Typed by hand.', base: '', lvl: 0 }); const fc = I.formatCheck(r.sections, doc); const n = I.stripTyped(r.sections);
    return { num: s.number, title: s.title, art: a.title, lv, p3: p3.map(x => x.title).join('|'), sched: p3[0] && p3[0].paras[0].plain, cov: cov.kept + '/' + cov.total, fc: fc.issues.map(i => i.fix || '').join(','), n, after: a.paras[3].t }; });
  C.ok(u.num === '08 71 00' && u.title === 'DOOR HARDWARE' && u.art === 'SUMMARY' && u.lv === '012', 'Typed SECTION, PART, 1.01 and A./1./a. become the manual’s numbering', JSON.stringify(u));
  C.ok(u.p3 === 'PART 4 - SCHEDULES' && u.sched === true && u.cov.split('/')[0] === u.cov.split('/')[1], 'PART 4 is kept as the last article of Part 3, with its schedule text', JSON.stringify(u));
  C.ok(/typed/.test(u.fc) && u.n === 1 && u.after === 'Typed by hand.', 'A typed number left in a paragraph is flagged, and the fix removes only the label', JSON.stringify(u));
  // ---- 4. a client's page layout read from their Word file (used when "keep this file's page layout" is ticked)
  if (files.length) {
    const lay = await p.evaluate(async b64 => window.DrawUpSpecsImport.docxLayout(Uint8Array.from(atob(b64), c => c.charCodeAt(0))), fs.readFileSync(path.join(SRC, '01_2100_-_ALLOWANCES.docx')).toString('base64'));
    C.ok(lay.page === 'letter' && lay.margins && lay.margins.l > 0 && lay.number_style === 'compact' && ['Helvetica', 'Times', 'Courier'].includes(lay.font), 'A client’s page size, margins, font and numbering style are read from their Word file', JSON.stringify(lay).slice(0, 300));
  }
  C.ok(!t.errors.length, 'No page errors', t.errors.join(' | ').slice(0, 400));
  console.log('\nSPEC IMPORT\n' + C.res.map(x => '  ' + x).join('\n'));
  console.log(`\n${C.res.length - C.failed()} passed, ${C.failed()} failed.\n`);
  await t.b.close(); close(); process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
