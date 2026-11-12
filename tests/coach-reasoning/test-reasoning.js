// v32 response intelligence: every assistant gets the same architectural scenarios and the prompts the server
// actually builds are checked for (1) the right request type and depth, (2) shared accuracy standards in every
// prompt, (3) genuinely different reasoning priorities between profiles, (4) legends grounded in documented work.
//   node tests/coach-reasoning/test-reasoning.js
// No AI is called. Live replies can be compared with tests/coach-reasoning/live-compare.js (needs OPENAI_API_KEY).
const fs = require('fs'), path = require('path');
const { team, persona, reasoning: R } = require('./build');
const SC = require('./scenarios.json');

let pass = 0, fail = 0; const fails = [];
const ok = (cond, name) => { if (cond) pass++; else { fail++; fails.push(name); console.log('FAIL', name); } };

const words = s => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)));
const STOP = new Set('that this with what your they them their from into when where which would could should about there than then have been were will more most only each also over does make make like used uses user users user\'s space spaces design designs room rooms people building buildings work works documented approach problem solution solutions whether through before after while them'.split(' '));
const jaccard = (a, b) => { const A = words(a), B = words(b); let i = 0; A.forEach(w => B.has(w) && i++); return i / (A.size + B.size - i || 1); };

const LEGEND_KEYS = [...fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/0034_arch_coach_profiles.sql'), 'utf8').matchAll(/\('([a-z-]+)', '([^']+)', '(architect|engineer)', array\[([^\]]*)\]/g)]
  .map(m => ({ key: m[1], name: m[2], kind: m[3], principles: m[4].split(',').map(x => x.trim().replace(/^'|'$/g, '')), note: null }));

(async () => {
  // ------------------------------------------------------------ 1. request types and depth
  for (const s of SC.scenarios) {
    const c = R.classifyRequest(s.message);
    ok(c.kind === s.kind, `classify "${s.id}" as ${s.kind} (got ${c.kind})`);
    if (s.technical !== undefined) ok(c.technical === s.technical, `"${s.id}" technical=${s.technical}`);
  }
  ok(R.outputBudget('technical', true) > R.outputBudget('quick', true), 'technical answers get more room than quick ones, even when concise');
  ok(R.outputBudget('learning', true) >= 1400, 'learning answers are not squeezed by the concise preference');

  // ------------------------------------------------------------ 2. every profile, same scenarios, real prompt builders
  const ctx = { transcript: '', projectBlock: 'ACTIVE PROJECT: none selected (general conversation).', memoryBlock: '', lockerBlock: '', setsBlock: '', firmBlock: '', activeJobs: '', history: [] };
  const prefs = { ...team.DEFAULT_PREFS };
  const profiles = [
    ...['coach', 'teammate', 'sixth_man'].map(sp => ({ id: sp, build: async m => (await team.buildTeamPrompt({ userId: 'x', speaker: sp, message: m, ctx, prefs, command: null, verifying: false, general: true })) })),
    ...LEGEND_KEYS.map(l => ({ id: l.key, legend: l, build: async m => (await team.buildTeamPrompt({ userId: 'x', speaker: 'teammate', message: m, ctx, prefs, command: null, verifying: false, general: true, legend: l })) })),
  ];
  ok(profiles.length === 13, `13 profiles under test (3 core + ${LEGEND_KEYS.length} legends)`);
  const report = { generated: new Date().toISOString(), scenarios: {} };

  for (const s of SC.scenarios) {
    const built = [];
    for (const p of profiles) {
      const out = await p.build(s.message);
      built.push({ id: p.id, out });
      ok(out.instructions.includes('SHARED STANDARDS'), `${s.id}/${p.id}: shared accuracy standards present`);
      ok(/Never invent quotations/.test(out.instructions), `${s.id}/${p.id}: no-invented-quotes rule present`);
      ok(/never claim a design is code compliant/i.test(out.instructions), `${s.id}/${p.id}: no-compliance-claim rule present`);
      ok(/<project_data>/.test(out.input), `${s.id}/${p.id}: data stays fenced in <project_data>`);
      ok(out.kind === s.kind, `${s.id}/${p.id}: prompt carries request type ${s.kind}`);
      ok(out.instructions.includes(R.depthFor(s.kind).text), `${s.id}/${p.id}: depth guidance for ${s.kind}`);
      ok(out.instructions.indexOf('SHARED STANDARDS') < out.instructions.indexOf('HOW '), `${s.id}/${p.id}: standards come before the lens`);
    }
    // Reasoning blocks must differ between every pair of profiles.
    const block = o => o.instructions.slice(o.instructions.indexOf('HOW '), o.instructions.indexOf('THIS REQUEST'));
    let worst = { a: '', b: '', j: 0 };
    for (let i = 0; i < built.length; i++) for (let k = i + 1; k < built.length; k++) {
      const j = jaccard(block(built[i].out), block(built[k].out));
      if (j > worst.j) worst = { a: built[i].id, b: built[k].id, j };
    }
    ok(worst.j < 0.3, `${s.id}: most similar pair ${worst.a} vs ${worst.b} overlaps ${(worst.j * 100).toFixed(0)}% (< 30%)`);
    report.scenarios[s.id] = { kind: s.kind, most_similar_pair: worst, profiles: Object.fromEntries(built.map(b => [b.id, { budget: b.out.budget, notices_first: (block(b.out).match(/1\. What you notice first: ([^\n]+)/) || [])[1] || '' }])) };
  }

  // ------------------------------------------------------------ 3. the lobby scenario: each profile's priority is its own
  const lobby = SC.scenarios.find(s => s.id === 'lobby');
  for (const [id, expect] of Object.entries(SC.lobby_priorities)) {
    const p = profiles.find(x => x.id === id);
    const out = await p.build(lobby.message);
    const lens = out.instructions.slice(out.instructions.indexOf('HOW '));
    for (const term of expect) ok(new RegExp(term, 'i').test(lens), `lobby/${id}: reasoning emphasizes "${term}"`);
  }
  // Seven dimensions are present and distinct for every core profile.
  const dims = ['noticeFirst', 'interpret', 'questions', 'develop', 'communicate', 'tradeoffs', 'knowledge'];
  for (const d of dims) {
    const vals = ['coach', 'teammate', 'sixth_man'].map(k => R.LENSES[k][d]);
    ok(new Set(vals).size === 3 && vals.every(v => v.length > 40), `core lenses differ on ${d}`);
    const lv = Object.values(R.LEGEND_LENSES).map(l => l[d]);
    ok(new Set(lv).size === lv.length && lv.every(v => v.length > 30), `legend lenses differ on ${d}`);
  }
  // Each core profile adapts differently to each request type.
  for (const k of ['quick', 'technical', 'critique', 'learning', 'brainstorm', 'troubleshoot']) {
    const v = ['coach', 'teammate', 'sixth_man'].map(p => R.LENSES[p].adapt[k]);
    ok(new Set(v).size === 3, `core profiles adapt differently to ${k}`);
  }
  // The same profile reads a quick question and a troubleshooting request differently.
  const q = await profiles[0].build(SC.scenarios.find(s => s.kind === 'quick').message);
  const t = await profiles[0].build(lobby.message);
  ok(q.budget < t.budget && !q.instructions.includes(R.LENSES.coach.adapt.troubleshoot) && t.instructions.includes(R.LENSES.coach.adapt.troubleshoot), 'Arch Coach shape changes between a quick question and troubleshooting');

  // ------------------------------------------------------------ 4. legends: documented, no invented quotes
  for (const l of LEGEND_KEYS) {
    const lens = R.LEGEND_LENSES[l.key];
    ok(!!lens, `${l.key}: has a documented lens`);
    if (!lens) continue;
    ok(lens.sources.length > 0, `${l.key}: lens lists where its facts can be checked`);
    const quoted = JSON.stringify(Object.entries(lens).filter(([k]) => k !== 'sources').map(([, v]) => v)).match(/\\"[^\\]+\\"/g) || [];
    for (const qt of quoted) ok(SC.documented_titles.includes(qt.replace(/\\"/g, '')), `${l.key}: quoted text ${qt} is a documented title or term, not a quote`);
    ok(/\b(18|19|20)\d\d\b/.test(lens.known), `${l.key}: lens cites dated documented works`);
    const op = persona.legendPrompt({ ...l, note: null, xp_required: 0 }, lobby.message, 'Arch Coach answer.', '');
    ok(op.includes('SHARED STANDARDS') && op.includes(lens.noticeFirst), `${l.key}: second opinion uses the shared standards and its own lens`);
    ok(/never their own words/i.test(op), `${l.key}: second opinion labels itself as DrawUp's interpretation`);
  }
  // A legend added later (not in the registry) still gets a safe lens from its principles only.
  const unknown = R.legendReasoning({ key: 'new-legend', name: 'New Legend', kind: 'architect', principles: ['Daylight', 'Timber'] }, R.classifyRequest('lobby feels empty'));
  ok(/Daylight, Timber/.test(unknown) && /leave it out/.test(unknown), 'unknown legend falls back to its principles and is told not to guess');

  // ------------------------------------------------------------ 5. background jobs and Arch Coach page keep the lens
  for (const kind of ['coach_verify', 'sixth_man_shot', 'layout_option']) {
    const jp = team.jobPrompt(kind, { question: lobby.message, ctx });
    ok(jp.instructions.includes('SHARED STANDARDS') && jp.instructions.includes('HOW YOU REASON'), `${kind}: job prompt keeps the standards and lens`);
  }
  const route = fs.readFileSync(path.resolve(__dirname, '../../src/app/api/arch-coach/route.ts'), 'utf8');
  ok(/coreReasoning\('coach', classifyRequest\(message\)\)/.test(route) && /SHARED_STANDARDS/.test(route), 'Arch Coach page route builds the coach lens into its prompt');
  const chat = fs.readFileSync(path.resolve(__dirname, '../../src/app/api/team/chat/route.ts'), 'utf8');
  ok(/max_output_tokens: prompt\.budget/.test(chat), 'team chat uses the request-type output budget');

  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'reasoning-report.json'), JSON.stringify(report, null, 2));
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log(fails.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
