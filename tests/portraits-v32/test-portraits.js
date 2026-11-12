// v32 face shots: default Arch Coach and Hall of Fame legends show the avatar-maker face shots.
//   node tests/portraits-v32/test-portraits.js
const path = require('path'), fs = require('fs');
const { open, checker, close } = require('../season1/harness');
const C = checker(); const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const loaded = sel => `[...document.querySelectorAll('${sel}')].filter(i => i.complete && i.naturalWidth > 0).length`;
(async () => {
  const legends = ['paul-r-williams', 'julia-morgan', 'frank-lloyd-wright', 'zaha-hadid', 'norma-merrick-sklarek', 'ove-arup', 'i-m-pei', 'fazlur-rahman-khan']
    .map((key, i) => ({ key, name: key.replace(/-/g, ' '), kind: 'architect', principles: [], note: '', xp_required: 0, sort_order: i }));
  // a member who hasn't customized their coach yet (mode 'later'), so the default Arch Coach face shows
  const mock = { profile: { mode: 'later' }, extra: { arch_coach_legends: legends } };
  let t = await open('#portal/dashboard', { mock, width: 1440, height: 900, wait: 7000 }); const p = t.page;
  await p.waitForTimeout(1500);
  C.ok(await p.evaluate(() => window.DrawUpPortraits?.KEYS.length) === 11, 'All 11 face shots are listed');
  C.ok(await p.evaluate(loaded('#db-coach-ava img.du-face')) === 1, 'Dashboard Arch Coach panel shows the default face shot');
  await p.screenshot({ path: path.join(OUT, 'dashboard.png'), clip: { x: 900, y: 70, width: 540, height: 420 } });
  await p.evaluate(() => window.DrawUpLegendBio.open('zaha-hadid')); await p.waitForTimeout(1500);
  C.ok(await p.evaluate(loaded('.du-lg28 img.du-face')) === 1, 'Legend bio page shows the legend face shot');
  await p.screenshot({ path: path.join(OUT, 'legend-bio.png') });
  await p.evaluate(() => window.DrawUpLegendBio.close());
  await p.evaluate(() => window.DrawUpCoach.open('legend')); await p.waitForTimeout(1500);
  const n = await p.evaluate(loaded('.ac-legend img.du-face'));
  C.ok(n >= 8, 'Legend picker tiles show face shots', String(n));
  await p.screenshot({ path: path.join(OUT, 'legend-picker.png') });
  C.ok(t.errors.length === 0, 'No page errors', t.errors.join(' | '));
  await t.b.close(); close(); console.log(C.res.join('\n')); process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
