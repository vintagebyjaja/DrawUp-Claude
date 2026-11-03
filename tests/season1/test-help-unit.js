// Help registry regression: every saved question still routes to the same feature after the Season 1 changes,
// and Details questions now answer "Season 2" with no button. node tests/season1/test-help-unit.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '../../public/drawup-help-core-v29.js'), 'utf8');
const ctx = {}; vm.runInNewContext(src + ';this.H=DrawUpHelpCore;', ctx); const H = ctx.H;
const QS = JSON.parse(fs.readFileSync(path.join(__dirname, 'help-questions.json'), 'utf8'));
let bad = [];
for (const { q, want } of QS) {
  const a = H.answerHelp(q, { signedIn: true });
  const ok = want === 'AI' ? !a : want === 'clarify' ? a && a.kind === 'clarify' : a && a.feature === want;
  if (!ok) bad.push(`${q} -> ${a ? a.feature || a.kind : 'AI'} (want ${want})`);
}
const det = H.answerHelp('How do I access DrawUp Details?', { signedIn: true });
const s2 = det && det.kind === 'status' && det.status === 'season2' && !det.go;
console.log(`${QS.length - bad.length}/${QS.length} help questions route as before`); bad.forEach(b => console.log('  MISS', b));
console.log((s2 ? 'PASS' : 'FAIL') + ' Details question answers "Season 2" with no Open button', JSON.stringify(det && { kind: det.kind, status: det.status, go: det.go }));
process.exit(bad.length || !s2 ? 1 : 0);
