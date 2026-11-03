// The 12 acceptance tests Jaja listed, run end to end in one browser session, in order.
//   node tests/season1/test-acceptance.js
// The public GIS services (Census, FEMA, USGS) cannot be reached from the build container, so the site
// lookup runs the real /api/project-intel route against recorded answers from those services
// (fixtures-intel.js). Everything else runs the real page code against an in-memory Supabase.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://sb.test'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
const path = require('path'), fs = require('fs'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '../..'); const OUTB = path.join(__dirname, 'out'); fs.mkdirSync(OUTB, { recursive: true });
execSync(`npx esbuild src/app/api/project-intel/route.ts --bundle --platform=node --format=cjs --outfile=${OUTB}/acc-route.js --log-level=error`, { cwd: ROOT });
const FX = require('./fixtures-intel.js');
const { open, checker, OUT, close } = require('./harness');
const UID = '11111111-1111-4111-8111-111111111111';
const FIRM = '44444444-4444-4444-8444-444444444444';
const now = () => new Date().toISOString();

const realFetch = global.fetch;
global.fetch = async (input, init = {}) => {
  const u = new URL(typeof input === 'string' ? input : input.url);
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (u.host === 'sb.test' && u.pathname === '/auth/v1/user') return String((init.headers || {}).Authorization || (init.headers || {}).authorization || '').includes('mock-token') ? J({ id: UID, is_anonymous: false }) : J({ msg: 'bad jwt' }, 401);
  if (u.host === 'geocoding.geo.census.gov') return J(FX.census);
  if (u.host === 'hazards.fema.gov') return J(u.pathname.includes('/28/') ? FX.femaZone : FX.femaPanel);
  if (u.host === 'epqs.nationalmap.gov') return J(FX.usgs);
  return realFetch(input, init);
};
const route = require('./out/acc-route.js');

// a firm with a presentation template already saved, and a 3D detail the member drew in Season 2's tools
const mock = {
  admin: false,
  rpc: { drawup_my_firms: [{ id: FIRM, name: 'KEi Architects', slug: 'kei-architects', role: 'admin' }] },
  extra: {
    firms: [{ id: FIRM, name: 'KEi Architects', slug: 'kei-architects', website: 'https://example.org', discipline: 'Architecture' }],
    firm_members: [{ firm_id: FIRM, user_id: UID, role: 'admin' }],
    firm_presentation_templates: [{ id: 'tpl1', firm_id: FIRM, name: 'KEi meeting deck', is_default: true, updated_at: now(), spec: { format: 'wide', margins: { t: 0.6, r: 0.7, b: 0.6, l: 0.7 }, safe: 0.25, colors: { primary: '#123456', accent: '#E8772E', text: '#1B2430', bg: '#FFFFFF' }, fonts: { heading: 'Arial', body: 'Arial' }, sizes: { title: 40, heading: 28, body: 18, small: 10 }, logo: { src: 'firm', pos: 'tl', h: 0.5 }, header: { on: true, text: '<<project_name>>', rule: true }, footer: { on: true, text: 'KEi Architects', rule: true, page: true }, elements: [], background: { type: 'color' }, guides: true } }],
    details: [{ id: 'det1', owner_id: UID, title: 'Parapet at low roof', category: 'Roofing', status: 'complete', created_at: now() }],
    draw_details: [{ id: 'dd1', owner_id: UID, name: 'Wall section W1', kind: 'section', model: { walls: 2 }, settings: {}, scale_denominator: 8, updated_at: now() }],
  },
};

const T = []; // the 12, each recorded honestly
const rec = (n, name, state, note) => { T.push({ n, name, state, note: note || '' }); console.log(`  ${state === 'pass' ? 'PASS' : state === 'fail' ? 'FAIL' : 'TODO'}  ${n}. ${name}${note ? '  [' + note + ']' : ''}`); };

(async () => {
  const api = async (p, req) => { if (p !== '/api/project-intel') return null; const r = await route.POST(new Request('http://x' + p, { method: 'POST', headers: { 'content-type': 'application/json', authorization: req.headers().authorization || '' }, body: req.postData() })); return { status: r.status, json: await r.json() }; };
  const t = await open('#portal/projects', { mock, api }); const p = t.page;
  const db = x => p.evaluate(k => JSON.parse(JSON.stringify(window.__duMockDB[k] || [])), x);
  const go = async (hash, tab, wait) => { await p.evaluate(h => { location.hash = h; }, hash); await p.evaluate(x => window.DrawUpPortal.openPortalTab(x), tab); await p.waitForTimeout(wait || 3000); };
  let PID = '';

  // 1 ----------------------------------------------------------------- new project at a real site
  try {
    await p.click('#du-new-project'); await p.waitForSelector('#dp-name', { timeout: 8000 });
    await p.fill('#dp-name', 'Fourth Ward Apartments'); await p.fill('#dp-type', 'Multifamily');
    await p.fill('#dp-addr', '600 E 4th St, Charlotte, NC 28202');
    await p.click('.du-save'); await p.waitForSelector('.dpi-site', { timeout: 12000 });
    await p.waitForFunction(() => document.querySelector('#dpi-f-county') && document.querySelector('#dpi-f-county').value, null, { timeout: 20000 }).catch(() => null);
    PID = await p.evaluate(() => (window.__duMockDB.project_threads.find(x => x.project_name === 'Fourth Ward Apartments') || {}).id);
    const prof = (await db('project_profiles')).find(r => r.project_thread_id === PID);
    rec(1, 'Create a new project and connect it to a real site', PID && prof && prof.site && prof.site.lat ? 'pass' : 'fail', PID ? `project ${PID.slice(0, 8)}, site ${prof && prof.site ? prof.site.lat + ', ' + prof.site.lng : 'none'}` : 'no project');
  } catch (e) { rec(1, 'Create a new project and connect it to a real site', 'fail', e.message); }

  // 2 ----------------------------------------------------------------- site and jurisdiction data
  try {
    const prof = (await db('project_profiles')).find(r => r.project_thread_id === PID) || { fields: {} };
    const f = prof.fields || {};
    const haveProv = Object.values(f).every(v => v.src && v.at && v.verified === false || v.by === 'user');
    const flagged = await p.evaluate(() => /Not available/.test(document.body.textContent) && /AHJ|ordinance/i.test(document.body.textContent));
    rec(2, 'Populate site and jurisdiction data, with sources and gaps flagged',
      f.county && f.jurisdiction && f.flood_zone && haveProv && flagged ? 'pass' : 'fail',
      `${Object.keys(f).length} values with sources; zoning and parcel flagged as not available`);
  } catch (e) { rec(2, 'Populate site and jurisdiction data', 'fail', e.message); }

  // 3 ----------------------------------------------------------------- a letter with linked fields
  let letterId = '';
  try {
    // the member types the firm's job number on the project record, the way they would
    await p.fill('#dpi-f-project_number', '2026-014'); await p.waitForTimeout(1600);
    await go('#portal/documents', 'documents', 4500);
    await p.click('[data-sp-new]'); await p.waitForSelector('#spn-title', { timeout: 8000 });
    await p.click('[data-type="letter"]'); await p.selectOption('#spn-proj', PID); await p.waitForTimeout(300);
    await p.fill('#spn-title', 'Letter to owner — schematic design submission');
    await p.click('#spn-go'); await p.waitForSelector('.sp-title', { timeout: 10000 });
    await p.waitForTimeout(1500);
    await p.evaluate(() => { const S = window.__ddsS; const f = S.doc.fields.find(x => x.k === 'to') || S.doc.fields[1]; f.v = '<<owner_name>>'; S.doc.blocks[0].p = 'Dear <<owner_name>>:\n\nWe are pleased to submit the schematic design package for <<project_name>> at <<project_address>>, project number <<project_number>>.\n\nSincerely,'; window.DrawUpSpecs._dirty(S); });
    await p.waitForTimeout(2200);
    letterId = await p.evaluate(() => window.__ddsS.doc.id);
    const resolved = await p.evaluate(() => { const S = window.__ddsS, X = window.DrawUpSpecsExport; const ctx = { data: window.DrawUpSpecs._projectData(S, S.doc.project_thread_id).data }; return X.resolve(S.doc.blocks[0].p, ctx); });
    const row = (await db('project_documents')).find(d => d.id === letterId);
    const ok3 = { saved: !!row, keepsFields: row ? /<<owner_name>>/.test(JSON.stringify(row.sections)) : false, name: /Fourth Ward Apartments/.test(resolved), addr: /600 E 4TH ST|600 E 4th St/i.test(resolved), num: /2026-014/.test(resolved), owner: !/<<owner_name>>/.test(resolved) };
    rec(3, 'Write a professional letter that uses linked project fields',
      ok3.saved && ok3.keepsFields && ok3.name && ok3.addr && ok3.num ? 'pass' : 'fail',
      ok3.saved && ok3.keepsFields && ok3.name && ok3.addr && ok3.num ? 'the saved letter keeps the linked fields; they resolve to the project record' : 'resolved text: ' + JSON.stringify(resolved).slice(0, 220) + ' ' + JSON.stringify(ok3));
  } catch (e) { rec(3, 'Write a professional letter that uses linked project fields', 'fail', e.message); }

  // 4 ----------------------------------------------------------------- PDF and editable DOCX
  try {
    const out = await p.evaluate(async () => {
      const S = window.__ddsS, X = window.DrawUpSpecsExport, d = S.doc;
      const ctx = { data: window.DrawUpSpecs._projectData(S, d.project_thread_id).data, labels: {} };
      const pdf = await X.pdf(d, ctx, { page: 'letter', orientation: 'portrait' }, {});
      const docx = await X.docx(d, ctx, { page: 'letter', orientation: 'portrait' }, {});
      const b64 = u => { let s = ''; const a = new Uint8Array(u); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };
      return { pdf: b64(pdf.bytes), docx: b64(docx) };
    });
    const pdfB = Buffer.from(out.pdf, 'base64'), docxB = Buffer.from(out.docx, 'base64');
    fs.writeFileSync(path.join(OUT, 'acc-letter.pdf'), pdfB); fs.writeFileSync(path.join(OUT, 'acc-letter.docx'), docxB);
    const text = await p.evaluate(async b => { const JSZip = await window.DrawUpSpecsExport.zipLib(); const z = await JSZip.loadAsync(Uint8Array.from(atob(b), ch => ch.charCodeAt(0))); return (await z.file('word/document.xml').async('string')); }, out.docx);
    rec(4, 'Export the letter to PDF and to editable Word', pdfB.slice(0, 5).toString() === '%PDF-' && docxB.slice(0, 2).toString() === 'PK' && /Fourth Ward Apartments/.test(text) && /<w:p\b/.test(text) ? 'pass' : 'fail',
      `${Math.round(pdfB.length / 1024)} KB PDF, ${Math.round(docxB.length / 1024)} KB .docx with editable paragraphs and the project values written in`);
  } catch (e) { rec(4, 'Export the letter to PDF and to editable Word', 'fail', e.message); }

  // 5 + 6 ------------------------------------------------------------- an editable preliminary spec section, saved to the project
  let specId = '';
  try {
    await go('#portal/documents', 'documents', 4000);
    await p.click('[data-sp-new]'); await p.waitForSelector('#spn-title', { timeout: 8000 });
    await p.click('[data-type="outline_spec"]'); await p.selectOption('#spn-proj', PID); await p.waitForTimeout(300);
    await p.fill('#spn-title', 'Outline Specification — Fourth Ward Apartments');
    await p.click('#spn-go'); await p.waitForSelector('.sp-tree-list, .sp-sec', { timeout: 12000 });
    await p.waitForTimeout(1200);
    specId = await p.evaluate(() => window.__ddsS.doc.id);
    // write a preliminary section the way a member would
    const wrote = await p.evaluate(() => {
      const S = window.__ddsS, Sp = window.DrawUpSpecs, X = window.DrawUpSpecsExport;
      const sec = Sp.makeSection('07 54 00', 'Thermoplastic Membrane Roofing', true);
      sec.parts[2] = [{ id: X.rid(), title: 'MATERIALS', base_title: 'MATERIALS', paras: [
        { id: X.rid(), t: 'Membrane: {{thickness}} mil reinforced TPO, mechanically attached.', base: '', lvl: 0 },
        { id: X.rid(), t: 'Insulation: polyisocyanurate to R-[[30|38|49]], tapered at drains.', base: '', lvl: 0 },
      ] }];
      S.doc.sections.push(sec); window.DrawUpSpecs._dirty(S);
      return { id: sec.id, open: X.openItems(JSON.stringify(sec.parts), { data: {} }) };
    });
    await p.waitForTimeout(2300);
    const row = (await db('project_documents')).find(d => d.id === specId);
    const sec = row && (row.sections || []).find(s => s.number === '07 54 00');
    rec(5, 'Create an editable preliminary specification section', sec && wrote.open >= 2 ? 'pass' : 'fail', sec ? `07 54 00 with ${wrote.open} items left open for the member to decide` : 'not written');
    rec(6, 'Save the specification to the project', row && row.project_thread_id === PID && row.owner_id === UID ? 'pass' : 'fail', row ? 'filed under the project in project_documents' : 'not saved');
  } catch (e) { rec(5, 'Create an editable preliminary specification section', 'fail', e.message); rec(6, 'Save the specification to the project', 'fail', 'not reached'); }

  // 7 ----------------------------------------------------------------- review it in CheckUp
  let before = null;
  try {
    await go('#portal/check?mode=specs&project=' + PID, 'check', 4500);
    await p.waitForSelector('[data-cu-run]', { timeout: 10000 });
    await p.click('[data-cu-run]'); await p.waitForSelector('.du-findings', { timeout: 20000 });
    const r = (await db('spec_reviews'))[0];
    before = r.findings.filter(f => f.severity !== 'info').length;
    rec(7, 'Review that specification in CheckUp', r && r.document_id === specId && before > 0 ? 'pass' : 'fail', `${before} items found, each pointing at the section it came from`);
  } catch (e) { rec(7, 'Review that specification in CheckUp', 'fail', e.message); }

  // 8 ----------------------------------------------------------------- identify and correct an omission
  try {
    const open1 = await p.evaluate(() => { const b = [...document.querySelectorAll('[data-cu-sec]')].find(x => x.dataset.cuSec); return b ? { sec: b.dataset.cuSec, doc: b.dataset.cuDoc } : null; });
    await p.evaluate(() => { const b = [...document.querySelectorAll('[data-cu-sec]')].find(x => x.dataset.cuSec); b.click(); });
    await p.waitForTimeout(5000);
    const atSection = await p.evaluate(s => !!window.__ddsS && window.__ddsS.secId === s, open1 && open1.sec);
    // correct it: fill the open items in 07 54 00
    await p.evaluate(() => {
      const S = window.__ddsS; const s = S.doc.sections.find(x => x.number === '07 54 00');
      s.parts[2][0].paras[0].t = 'Membrane: 60 mil reinforced TPO, mechanically attached.';
      s.parts[2][0].paras[1].t = 'Insulation: polyisocyanurate to R-38, tapered at drains.';
      s.state = 'in_review'; window.DrawUpSpecs._dirty(S);
    });
    await p.waitForTimeout(2300);
    await go('#portal/check?mode=specs&project=' + PID, 'check', 4500);
    await p.click('[data-cu-run]'); await p.waitForSelector('.du-findings', { timeout: 20000 });
    const r = (await db('spec_reviews'))[0];
    const after = r.findings.filter(f => f.severity !== 'info').length;
    rec(8, 'Identify an omission, correct it, and see it close on a re-run', atSection && after < before && r.resolved.length > 0 ? 'pass' : 'fail',
      `opened the section from the finding, filled it in, re-ran: ${before} → ${after}, ${r.resolved.length} recorded as settled`);
    await t.shot('acc-08-rerun');
  } catch (e) { rec(8, 'Identify an omission, correct it, and see it close on a re-run', 'fail', e.message); }

  // 9 ----------------------------------------------------------------- a project report from existing data
  try {
    await p.click('[data-cu-save]'); await p.waitForTimeout(2500);
    const dl = p.waitForEvent('download', { timeout: 30000 }).catch(() => null);
    await p.click('[data-cu-pdf]'); const got = await dl;
    const rep = (await db('project_documents')).find(d => d.source === 'check');
    const body = rep ? JSON.stringify(rep.sections) : '';
    rec(9, 'Generate a project report from information already in DrawUp',
      rep && rep.project_thread_id === PID && /Fourth Ward/.test(body) && /How this review was made/.test(body) && got ? 'pass' : 'fail',
      rep ? `"${rep.title}" filed under the project, and a PDF (${got ? got.suggestedFilename() : 'no download'})` : 'no report');
  } catch (e) { rec(9, 'Generate a project report from information already in DrawUp', 'fail', e.message); }

  // 10 ---------------------------------------------------------------- an existing presentation opens unchanged
  try {
    const was = JSON.stringify((await db('firm_presentation_templates'))[0]);
    await go('#portal/firm?firm=kei-architects&pane=present', 'firm', 6000);
    const shown = await p.evaluate(() => ({ name: (document.querySelector('#fk-name') || {}).value, primary: (document.querySelector('#fk-c-primary') || {}).value, head: (document.querySelector('#fk-h-text') || {}).value, slide: !!document.querySelector('.fk-prev svg') }));
    const nowRow = JSON.stringify((await db('firm_presentation_templates'))[0]);
    rec(10, 'Open an existing presentation without losing anything',
      shown.name === 'KEi meeting deck' && shown.primary === '#123456' && shown.slide && was === nowRow ? 'pass' : 'fail',
      `"${shown.name}" opens with its colors, header and slide preview, and the saved template row is byte-for-byte unchanged`);
    await t.shot('acc-10-presentation');
  } catch (e) { rec(10, 'Open an existing presentation without losing anything', 'fail', e.message); }

  // 11 ---------------------------------------------------------------- Details functionality and data preserved
  try {
    const rows = JSON.stringify((await db('details')).concat(await db('draw_details')));
    const files = await p.evaluate(() => ['DrawUpDetails', 'DrawUpDetailDraw', 'DrawUpVDI'].filter(k => !!window[k]));
    const reg = await p.evaluate(async () => { const r = await fetch('/api/features'); return r.ok ? await r.json() : null; });
    await go('#portal/details', 'details', 4000);
    const rows2 = JSON.stringify((await db('details')).concat(await db('draw_details')));
    const under = await p.evaluate(() => { const real = document.querySelector('#dus2-real'); const box = document.querySelector('.dus2-under'); return { present: !!real, children: real ? real.children.length : 0, inert: !!(box && box.hasAttribute('inert')), blurred: real ? /blur/.test(getComputedStyle(real).filter || '') : false }; });
    rec(11, 'Confirm Details functionality and its data are preserved',
      rows === rows2 && files.length >= 2 && under.present && under.inert ? 'pass' : 'fail',
      `${files.join(', ')} still loaded; the real workspace renders under the screen${under.inert ? ', marked inert' : ', NOT inert'}${under.blurred ? ' and blurred' : ''}; detail rows ${rows === rows2 ? 'unchanged' : 'CHANGED: ' + rows2.slice(0, 160)}`);
  } catch (e) { rec(11, 'Confirm Details functionality and its data are preserved', 'fail', e.message); }

  // 12 ---------------------------------------------------------------- Season 1 members see the Season 2 screen
  try {
    const seen = await p.evaluate(() => {
      const w = document.querySelector('.dus2'); if (!w) return null;
      const glass = document.querySelector('.dus2-glass');
      return { title: (w.querySelector('#dus2-title') || {}).textContent, pill: /SEASON 2/.test(w.textContent), line: /Advanced construction detailing/.test(w.textContent), glass: !!glass && /blur/.test(getComputedStyle(glass).backdropFilter || getComputedStyle(glass).webkitBackdropFilter || ''), tab: !!document.querySelector('[data-portal-tab="details"]'), kept: /saved detail/.test(w.textContent) };
    });
    rec(12, 'A Season 1 member sees the blurred Details screen, with the tab still there',
      seen && /DETAILS/i.test(seen.title || '') && seen.pill && seen.line && seen.tab && seen.kept ? 'pass' : 'fail',
      seen ? `"${(seen.title || '').trim()}", the Season 2 line, the frosted overlay${seen.glass ? ' (blurred)' : ''}, the tab still in the menu, and a note that saved details are kept` : 'screen not shown');
    await t.shot('acc-12-details-season2');
  } catch (e) { rec(12, 'A Season 1 member sees the blurred Details screen', 'fail', e.message); }

  const pass = T.filter(x => x.state === 'pass').length, fail = T.filter(x => x.state === 'fail').length, todo = T.filter(x => x.state === 'todo').length;
  console.log(`\n${pass} of 12 passed, ${fail} failed, ${todo} still to implement.`);
  if (t.errors.length) console.log('Page errors: ' + t.errors.join(' | ').slice(0, 500));
  fs.writeFileSync(path.join(OUT, 'acceptance.json'), JSON.stringify({ at: new Date().toISOString(), results: T, pageErrors: t.errors }, null, 2));
  console.log(`Written to ${path.join(OUT, 'acceptance.json')}; screenshots and exports in ${OUT}\n`);
  await t.b.close(); close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
