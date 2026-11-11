// AI specification drafting: the cleaning rules, the real /api/specs/draft route against a stand-in model and
// stand-in credit RPCs, and the editor flow (ask -> review -> add, never replacing typed text).
//   node tests/season1/test-spec-ai.js
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://sb.test'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'; process.env.OPENAI_API_KEY = 'sk-test';
const path = require('path'), fs = require('fs'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '../..'); const OUTB = path.join(__dirname, 'out'); fs.mkdirSync(OUTB, { recursive: true });
execSync(`npx esbuild src/lib/drawup-spec-draft.ts --bundle --platform=node --format=cjs --outfile=${OUTB}/specdraft-lib.js --log-level=error`, { cwd: ROOT });
execSync(`npx esbuild src/app/api/specs/draft/route.ts --bundle --platform=node --format=cjs --outfile=${OUTB}/specdraft-route.js --log-level=error`, { cwd: ROOT });
const L = require('./out/specdraft-lib.js');
const { open, checker, OUT, close } = require('./harness'); const C = checker();
const UID = '11111111-1111-4111-8111-111111111111', PID = '22222222-2222-4222-8222-222222222222', DOC = '33333333-3333-4333-8333-333333333333';
const now = () => new Date().toISOString();

// What a model might send back, including the things DrawUp must not pass on.
const MODEL_ANSWER = {
  reply: 'I drafted a preliminary TPO roofing section. Tell me the insulation R-value and the warranty you want.',
  systems: ['Low-slope membrane roofing', 'Roof insulation'],
  sections: [
    { number: '075400', title: 'Thermoplastic Polyolefin (TPO) Roofing',
      part1: [{ title: 'Summary', paragraphs: [{ text: 'Section includes mechanically attached TPO membrane roofing for <<project_name>>.', level: 0 }, { text: 'Roofing shall comply with IBC Section 1507.13 and the building code.', level: 0 }] }],
      part2: [{ title: 'Manufacturers', paragraphs: [{ text: 'Basis of design: Acme RoofMax 60 TPO', level: 0 }, { text: 'Membrane: {{thickness}} mil reinforced TPO, as manufactured by Firestone Building Products.', level: 0 }, { text: 'Provide a 20-year NDL warranty.', level: 1 }, { text: 'Cover board: SuperBoard® gypsum cover board.', level: 1 }, { text: 'Insulation: polyisocyanurate, R-[[25|30|38]].', level: 0 }] }],
      part3: [{ title: 'Installation', paragraphs: [{ text: 'Install per manufacturer written instructions at <<site_secret>>.', level: 0 }] }] },
    { number: '09 29 00', title: 'Gypsum Board', part1: [{ title: 'Summary', paragraphs: [{ text: 'Section includes gypsum board assemblies.', level: 0 }] }], part2: [{ title: 'Products', paragraphs: [{ text: 'Gypsum board: Type X, {{thickness}}.', level: 0 }] }], part3: [{ title: 'Installation', paragraphs: [{ text: 'Install with joints staggered.', level: 0 }] }] },
    { number: 'roofing', title: 'Not a number', part1: [], part2: [{ title: 'X', paragraphs: [{ text: 'dropped', level: 0 }] }], part3: [] },
  ],
  questions: ['What R-value do you need at the roof?', 'What warranty length does the owner want?'],
  assumptions: ['Low-slope roof over the apartments, mechanically attached.'],
  references: [{ designation: 'ASTM D6878', why: 'Standard for TPO sheet roofing.' }, { designation: 'Acme Spec 12', why: 'made up' }, { designation: 'FM 4470', why: 'Approval standard for roof covers.' }],
};

let modelStatus = 'completed', credit = [];
global.fetch = async (input, init = {}) => {
  const u = new URL(typeof input === 'string' ? input : input.url);
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (u.host === 'sb.test' && u.pathname === '/auth/v1/user') return String((init.headers || {}).Authorization || '').includes('mock-token') ? J({ id: UID }) : J({}, 401);
  if (u.host === 'sb.test' && u.pathname.startsWith('/rest/v1/profiles')) return J([{ account_type: 'free' }]);
  if (u.host === 'sb.test' && u.pathname === '/rest/v1/rpc/drawup_account_allowance') return J({ ok: true });
  if (u.host === 'sb.test' && u.pathname === '/rest/v1/rpc/reserve_arch_coach_v11_access') { credit.push('reserve'); return J({ ok: true, access_type: 'monthly', credits_charged: 10, credits_remaining: 90, monthly_used: 10 }); }
  if (u.host === 'sb.test' && u.pathname === '/rest/v1/rpc/refund_arch_coach_v13_access') { credit.push('refund'); return J({ ok: true }); }
  if (u.host === 'api.openai.com' && init.method === 'POST') { const b = JSON.parse(init.body); global.__lastPrompt = b; return J({ id: 'resp_1', status: 'queued' }); }
  if (u.host === 'api.openai.com') return J(modelStatus === 'completed' ? { id: 'resp_1', status: 'completed', model: 'gpt-5', output_text: JSON.stringify(MODEL_ANSWER) } : { id: 'resp_1', status: 'failed', error: { message: 'boom' } });
  return J({}, 404);
};
const route = require('./out/specdraft-route.js');
const post = async (body, tok = 'mock-token-123456789') => { const r = await route.POST(new Request('http://x/api/specs/draft', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) })); return { status: r.status, json: await r.json() }; };

(async () => {
  // ---------------------------------------------------------------- the rules
  const d = L.cleanDraft(MODEL_ANSWER);
  const all = JSON.stringify(d.sections);
  C.ok(d.sections.length === 2 && d.sections[0].number === '07 54 00', 'Sections keep MasterFormat numbers; a section with no number is dropped', d.sections.map(s => s.number).join(', '));
  C.ok(!/Acme|Firestone|SuperBoard/.test(all), 'No manufacturer or brand reaches the draft', (all.match(/Acme|Firestone|SuperBoard/g) || []).join(','));
  C.ok(/\{\{Manufacturer\}\}/.test(all), 'A named product becomes a {{Manufacturer}} blank for the architect');
  C.ok(!/IBC Section 1507/.test(all) && /confirm with the AHJ/.test(all), 'A code citation is taken out and left to the AHJ');
  C.ok(!/20-year/.test(all) && /\{\{warranty period\}\}/.test(all), 'A warranty length it was not given becomes a blank');
  C.ok(/<<project_name>>/.test(all) && !/<<site_secret>>/.test(all), 'Only DrawUp\'s linked project fields survive');
  C.ok(/\[\[25\|30\|38\]\]/.test(all) && /\{\{thickness\}\}/.test(all), 'Choices and blanks the architect must settle are kept');
  C.ok(d.references.length === 2 && d.references.every(r => /^(ASTM|FM)/.test(r.designation) && /Confirm/.test(r.confirm)), 'Only real standards bodies are referenced, and each is marked to confirm', d.references.map(r => r.designation).join(', '));
  C.ok(d.removed.length >= 4, 'DrawUp says what it took out', d.removed.join(' | '));
  C.ok(d.questions.length === 2 && d.assumptions.length === 1, 'Questions and assumptions come through');

  // ---------------------------------------------------------------- the route
  let r = await post({ action: 'draft', request: 'Draft the TPO roofing section', values: { project_name: 'Fourth Ward Apartments', building_type: 'Multifamily' }, existing: [{ number: '01 10 00', title: 'Summary' }], outline: true });
  C.ok(r.status === 200 && r.json.status === 'running' && r.json.ticket, 'Route: a signed-in request starts a draft and charges once', JSON.stringify(r.json).slice(0, 120));
  C.ok(/Fourth Ward Apartments/.test(JSON.stringify(global.__lastPrompt.input)) && /01 10 00 Summary/.test(JSON.stringify(global.__lastPrompt.input)), 'Route: the model reads the project\'s own values and the existing sections');
  C.ok(/Never name a manufacturer/.test(global.__lastPrompt.instructions) && global.__lastPrompt.text.format.strict === true, 'Route: the rules and a strict schema go with every request');
  const ticket = r.json.ticket;
  r = await post({ poll: ticket });
  C.ok(r.status === 200 && r.json.status === 'done' && r.json.draft.sections.length === 2 && !/Acme/.test(JSON.stringify(r.json.draft)), 'Route: the finished draft comes back cleaned');
  r = await post({ poll: ticket }, 'nope-not-a-token-at-all');
  C.ok(r.status === 401, 'Route: someone else cannot read the draft');
  modelStatus = 'failed'; credit = [];
  r = await post({ action: 'draft', request: 'Draft the TPO roofing section', values: {} }); r = await post({ poll: r.json.ticket });
  C.ok(r.status === 502 && /not charged/.test(r.json.error) && credit.includes('refund'), 'Route: a failed draft is refunded', JSON.stringify(credit));
  modelStatus = 'completed';
  r = await post({ action: 'draft', request: 'hi' });
  C.ok(r.status === 400, 'Route: an empty request is refused before anything is charged');

  // ---------------------------------------------------------------- the editor
  const sections = [{ id: 's1', number: '09 29 00', title: 'Gypsum Board', state: 'in_progress', assigned: null, parts: { 1: [{ id: 'a1', title: 'SUMMARY', paras: [{ id: 'p1', t: 'Typed by the architect: gypsum board at corridors.', base: '', lvl: 0 }] }], 2: [], 3: [] } }];
  const mock = { extra: {
    project_threads: [{ id: PID, owner_id: UID, project_name: 'Fourth Ward Apartments', project_type: 'Multifamily', location: 'Charlotte, NC', status: 'active', created_at: now(), updated_at: now() }],
    project_documents: [{ id: DOC, owner_id: UID, project_thread_id: PID, doc_type: 'outline_spec', title: 'Outline Specification', status: 'draft', source: 'specs', fields: { outline: true }, cover: { data: {} }, sections, created_at: now(), updated_at: now() }],
  } };
  const api = async (p, req) => { if (p !== '/api/specs/draft') return null; const res = await route.POST(new Request('http://x' + p, { method: 'POST', headers: { 'content-type': 'application/json', authorization: req.headers().authorization || '' }, body: req.postData() })); return { status: res.status, json: await res.json() }; };
  const t = await open('#portal/documents?doc=' + DOC, { mock, api }); const p = t.page;
  await p.waitForSelector('[data-sp-ai]', { timeout: 10000 }).catch(() => null);
  C.ok(!!await p.$('[data-sp-ai]'), 'Editor: a specification has "Draft with AI"');
  await p.click('[data-sp-ai]'); await p.waitForSelector('#sai-req', { timeout: 5000 });
  await p.fill('#sai-req', 'Draft the roofing section for a low-slope membrane roof');
  await p.click('#sai-go'); await p.waitForSelector('#sai-add', { timeout: 20000 }).catch(() => null);
  C.ok(await p.evaluate(() => /Questions to settle/.test(document.body.textContent) && /Assumptions it made/.test(document.body.textContent) && /confirm each/i.test(document.body.textContent)), 'Editor: the questions, assumptions and references are shown before anything changes');
  C.ok(await p.evaluate(() => /DrawUp took out/.test(document.body.textContent)), 'Editor: it says what was taken out');
  C.ok(await p.evaluate(() => /only its empty parts will be filled/.test(document.body.textContent)), 'Editor: a section already in the manual is marked as fill-only');
  await t.shot('ai-01-draft');
  const before = JSON.stringify((await p.evaluate(() => window.__duMockDB.project_documents[0].sections)));
  await p.click('#sai-add'); await p.waitForTimeout(2500);
  const secs = await p.evaluate(() => JSON.parse(JSON.stringify(window.__duMockDB.project_documents[0].sections)));
  const roof = secs.find(s => s.number === '07 54 00'), gyp = secs.find(s => s.number === '09 29 00');
  C.ok(roof && roof.state === 'draft' && roof.ai && roof.ai.request && roof.ai.assumptions.length, 'Editor: the new section is saved as Draft with a record of the request and assumptions');
  C.ok(gyp && /Typed by the architect/.test(JSON.stringify(gyp.parts[1])) && gyp.parts[1].length === 1, 'Editor: the architect\'s own text is not replaced');
  C.ok(gyp && gyp.parts[2].length === 1 && gyp.parts[3].length === 1, 'Editor: only the empty parts of the existing section were filled');
  C.ok(before !== JSON.stringify(secs), 'Editor: the manual was saved');
  await p.evaluate(() => { const S = window.__ddsS; S.secId = S.doc.sections.find(s => s.number === '07 54 00').id; window.DrawUpSpecs._redraw(S); });
  await p.waitForTimeout(500);
  C.ok(await p.evaluate(() => /AI draft, .*review every line/.test(document.body.textContent)), 'Editor: the section says it is an AI draft to review');
  await t.shot('ai-02-added');
  C.ok(!t.errors.length, 'No page errors', t.errors.join(' | ').slice(0, 400));

  console.log('\nAI SPECIFICATION DRAFTING\n' + C.res.map(x => '  ' + x).join('\n'));
  console.log(`\n${C.res.length - C.failed()} passed, ${C.failed()} failed. Screenshots in ${OUT}\n`);
  await t.b.close(); close(); process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
