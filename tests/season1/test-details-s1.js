// Season 1: Details is out of the main menu; the Details tab, every link to it and the public Details page show
// the Season 2 screen; the public page's own content is kept underneath and comes back with Season 2 on.
//   node tests/season1/test-details-s1.js
const { open, checker, OUT, close } = require('./harness'); const C = checker();
(async () => {
  let t = await open('#portal/dashboard', {}); let p = t.page;
  const shown = await p.$$eval('#dus-pnav .dus-link', bs => bs.filter(b => getComputedStyle(b).display !== 'none').map(b => b.textContent));
  C.ok(shown.length > 5 && !shown.includes('Details'), 'Details is not in the Season 1 main menu', shown.join(', '));
  C.ok(await p.evaluate(() => !!document.querySelector('#dus-pnav .dus-link[data-cat="details"]')), 'The menu entry is hidden, not deleted');
  await p.evaluate(() => window.DrawUpPortal.openPortalTab('details')); await p.waitForTimeout(1500);
  C.ok(await p.evaluate(() => /COMING IN SEASON 2/.test(document.body.textContent) && !!document.querySelector('#dus2-title')), 'A link to the Details tab opens the Season 2 screen');
  await p.evaluate(() => { location.hash = '#portal/draw?detail=new'; }); await p.waitForTimeout(1500);
  C.ok(await p.evaluate(() => !!document.querySelector('#dus2-title')), 'A Draw link to a detail opens the Season 2 screen');
  C.ok(!t.errors.length, 'Portal: no page errors', t.errors.join(' | '));
  await t.b.close();

  t = await open('', { mock: { signedOut: true } }); p = t.page;
  await p.evaluate(() => document.querySelector('a[data-page="details"]').click()); await p.waitForTimeout(1200);
  const pub = await p.evaluate(() => ({ gate: !!document.querySelector('#page-details .dus2 #dus2-pub-title'), visible: !document.getElementById('page-details').hidden, kept: !!document.querySelector('#page-details .dus2-pubreal[inert] .page-head') }));
  C.ok(pub.gate && pub.visible, 'The public Details page shows the Season 2 screen', JSON.stringify(pub));
  C.ok(pub.kept, 'The public page content is kept underneath, blurred and inert');
  await t.shot('det-01-public');
  await p.evaluate(() => window.DrawUpSeason.preview(true)); await p.waitForTimeout(300);
  C.ok(await p.evaluate(() => !document.querySelector('#page-details .dus2') && !!document.querySelector('#page-details > .page-head')), 'With Season 2 Details on, the public page comes back as it was');
  C.ok(!t.errors.length, 'Public: no page errors', t.errors.join(' | '));
  await t.b.close(); close();
  console.log('\nDETAILS IN SEASON 1\n' + C.res.map(x => '  ' + x).join('\n'));
  console.log(`\n${C.res.length - C.failed()} passed, ${C.failed()} failed. Screenshots in ${OUT}\n`);
  process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
