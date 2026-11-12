// Live check (optional, costs OpenAI usage): sends the SAME scenario to every assistant with the real prompts and
// writes the replies side by side, plus how much each pair of replies overlaps.
//   OPENAI_API_KEY=... node tests/coach-reasoning/live-compare.js [scenario-id] [model]
// Default scenario: lobby (the student center example). Default model: gpt-5-mini.
const fs = require('fs'), path = require('path');
const { team } = require('./build');
const SC = require('./scenarios.json');
const key = process.env.OPENAI_API_KEY; if (!key) { console.error('Set OPENAI_API_KEY first.'); process.exit(1); }
const s = SC.scenarios.find(x => x.id === (process.argv[2] || 'lobby')); const model = process.argv[3] || 'gpt-5-mini';
const LEGENDS = [...fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/0034_arch_coach_profiles.sql'), 'utf8').matchAll(/\('([a-z-]+)', '([^']+)', '(architect|engineer)', array\[([^\]]*)\]/g)]
  .map(m => ({ key: m[1], name: m[2], kind: m[3], principles: m[4].split(',').map(x => x.trim().replace(/^'|'$/g, '')), note: null }));
const ctx = { transcript: '', projectBlock: 'ACTIVE PROJECT: none selected (general conversation).', memoryBlock: '', lockerBlock: '', setsBlock: '', firmBlock: '', activeJobs: '', history: [] };
const words = t => new Set(t.toLowerCase().replace(/[^a-z ]+/g, ' ').split(/\s+/).filter(w => w.length > 4));
const jac = (a, b) => { const A = words(a), B = words(b); let i = 0; A.forEach(w => B.has(w) && i++); return i / (A.size + B.size - i || 1); };
(async () => {
  const who = [...['coach', 'teammate', 'sixth_man'].map(sp => ({ id: sp, speaker: sp })), ...LEGENDS.map(l => ({ id: l.key, speaker: 'teammate', legend: l }))];
  const out = [];
  for (const w of who) {
    const p = await team.buildTeamPrompt({ userId: 'x', speaker: w.speaker, message: s.message, ctx, prefs: team.DEFAULT_PREFS, command: null, verifying: false, general: true, legend: w.legend || null });
    const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, instructions: p.instructions, input: p.input, max_output_tokens: p.budget + 2000 }) });
    const d = await r.json(); const text = (d.output || []).flatMap(o => o.content || []).map(c => c.text || '').join('').split('[[NEXT]]')[0].trim();
    out.push({ id: w.id, text }); console.log('done', w.id);
  }
  let md = `# ${s.id}: ${s.message}\n\nModel: ${model}\n\n`;
  for (const o of out) md += `## ${o.id}\n\n${o.text}\n\n`;
  md += '## Overlap between replies (word sets)\n\n';
  for (let i = 0; i < out.length; i++) for (let k = i + 1; k < out.length; k++) md += `- ${out[i].id} vs ${out[k].id}: ${(jac(out[i].text, out[k].text) * 100).toFixed(0)}%\n`;
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', `live-${s.id}.md`), md); console.log('wrote out/live-' + s.id + '.md');
})();
