// Header fit check: the brand ("DrawUp | Portal") must not touch the first nav link at desktop widths.
//   node tests/dashboard-v31/check-header.js
const path = require('path');
const { open, checker, close } = require('../season1/harness');
const C = checker();
const api = async p => p === '/api/features' ? { json: { season2_details: true } } : null;
(async () => {
  let t;
  for (const w of [1920, 1672, 1440, 1366, 1280, 1180, 1024, 900]) {
    t = await open('#portal/dashboard', { api, width: w, height: 900, wait: 6000 });
    const r = await t.page.evaluate(() => {
      const box = s => document.querySelector(s)?.getBoundingClientRect();
      const brand = box('#dus-pnav .dus-brand'), small = box('#dus-pnav .dus-brand small');
      const links = [...document.querySelectorAll('#dus-pnav .dus-links .dus-link')].filter(l => l.offsetParent);
      const first = links[0]?.getBoundingClientRect(), last = links[links.length - 1]?.getBoundingClientRect(), right = box('#dus-pnav .dus-right');
      return { brandR: Math.max(brand?.right || 0, small?.right || 0), firstL: first?.left, lastR: last?.right, rightL: right?.left, n: links.length, linksShown: getComputedStyle(document.querySelector('#dus-pnav .dus-links')).display };
    });
    await t.page.screenshot({ path: path.join(__dirname, 'out', `hdr-${w}.png`), clip: { x: 0, y: 0, width: w, height: 90 } });
    if (r.linksShown === 'none' || !r.n) C.ok(true, `${w}px: links collapse into the menu`);
    else C.ok(r.firstL - r.brandR >= 8 && r.rightL - r.lastR >= 4, `${w}px: brand, links and right icons don't overlap`, JSON.stringify(r));
    await t.b.close();
  }
  close(); console.log(C.res.join('\n')); process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
