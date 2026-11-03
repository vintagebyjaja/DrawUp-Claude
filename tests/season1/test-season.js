// Season switch regression: Season 1 hides Season 2 Details behind the blurred screen without touching the Details
// code or rows, and the flag (or ?season2=1 on a dev host) brings the same tools back. node tests/season1/test-season.js
const { open, checker, close } = require('./harness');
const C = checker();
const detailsRows = p => p.evaluate(() => JSON.stringify((window.__duMockDB.details || []).concat(window.__duMockDB.draw_details || [])));
const navItems = (p, id) => p.evaluate(id => { const c = window.DrawUpStudio._nav.PORTAL_NAV.find(x => x.id === id); return c && c.cols ? c.cols.flatMap(col => (col.items || []).map(i => i[0])) : []; }, id);
const MOCK = { extra: { draw_details: [{ id: 'dd1', owner_id: '11111111-1111-4111-8111-111111111111', name: 'Wall section W1', kind: 'section', model: {}, settings: {}, scale_denominator: 8, updated_at: new Date().toISOString() }] } };

(async () => {
  // ---------------------------------------------------------------- Season 1 (default: flag off)
  let t = await open('#portal/details', { mock: MOCK, api: p => p === '/api/features' ? { json: { season: 1, flags: { season2Details: false } } } : null });
  let p = t.page; const before = await detailsRows(p);
  await p.waitForSelector('.dus2', { timeout: 8000 }).catch(() => {});
  C.ok(!!await p.$('.dus2 h1#dus2-title'), 'S1: Details tab opens the Season 2 screen');
  C.ok(/COMING IN SEASON 2/.test(await p.textContent('.dus2-kicker') || ''), 'S1: "COMING IN SEASON 2" heading');
  C.ok(/Advanced construction detailing, 3D assemblies, and technical documentation are coming in Season 2\./.test(await p.textContent('.dus2-lead')), 'S1: the agreed message text');
  C.ok(await p.$eval('#dus2-real', el => el.closest('[inert]') !== null && el.children.length > 0), 'S1: the real Details workspace is rendered underneath and inert');
  C.ok(await p.$eval('#dus2-real', el => getComputedStyle(el).filter.includes('blur')), 'S1: underlying workspace is blurred');
  const hit = await p.evaluate(() => { const r = document.querySelector('#dus2-real').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + 260); return !!(el && el.closest('#dus2-real')); });
  C.ok(!hit, 'S1: clicks cannot reach the underlying Details tools');
  C.ok(/saved detail/.test(await p.textContent('#dus2-kept') || ''), 'S1: tells the member their saved details are kept', await p.textContent('#dus2-kept'));
  C.ok(!(await p.$('#dus2-preview')), 'S1: no HQ preview button for a regular member');
  C.ok(await p.evaluate(() => !!document.querySelector('#dus-pnav .dus-link[data-cat="details"]')), 'S1: Details stays in the top menu');
  C.ok(await p.evaluate(() => { const c = window.DrawUpStudio._nav.PORTAL_NAV.find(x => x.id === 'details'); return !c.cols; }), 'S1: Details has no tools menu');
  C.ok(!(await navItems(p, 'draw')).some(x => /detail/i.test(x)), 'S1: Draw menu has no detail tools', (await navItems(p, 'draw')).join(', '));
  C.ok(!(await navItems(p, 'firm')).some(x => /details library/i.test(x)), 'S1: Firm menu has no Details library');
  C.ok(await p.evaluate(() => { const v = document.querySelector('.vdi27-card'); return !v || getComputedStyle(v).display === 'none'; }), 'S1: the Visual Detail Intelligence card is not offered');
  await t.shot('season1-details-gate');
  // Draw: detail routes and buttons
  await p.evaluate(() => { history.replaceState(null, '', '#portal/draw?detail=list'); window.DrawUpPortal.openPortalTab('draw'); }); await p.waitForTimeout(1500);
  C.ok(!!await p.$('.dus2'), 'S1: #portal/draw?detail=list shows the Season 2 screen, not the 3D detail tool');
  await p.evaluate(() => { history.replaceState(null, '', '#portal/draw'); window.DrawUpPortal.openPortalTab('draw'); }); await p.waitForTimeout(1500);
  C.ok(await p.evaluate(() => { const c = document.querySelector('.dd22-startcard'); return !c || getComputedStyle(c).display === 'none'; }), 'S1: Draw start screen hides "Draw a detail in 3D"');
  C.ok(!!await p.$('.du-draw-start, [data-dw21-route]'), 'S1: Draw tab still works');
  await p.evaluate(() => { history.replaceState(null, '', '#portal/dashboard'); window.DrawUpPortal.openPortalTab('dashboard'); }); await p.waitForTimeout(1800);
  C.ok(await p.evaluate(() => [...document.querySelectorAll('#dus-quick .dus-chip')].filter(x => getComputedStyle(x).display !== 'none').every(x => !/detail/i.test(x.textContent))), 'S1: dashboard quick actions have no "Draw a detail"');
  C.ok(before === await detailsRows(p), 'S1: saved details and 3D details are unchanged');
  C.ok(typeof (await p.evaluate(() => window.DrawUpDetails && typeof window.DrawUpDetails.render)) === 'string' && await p.evaluate(() => typeof window.DrawUpDetails.render === 'function' && typeof window.DrawUpDetailDraw === 'object' && typeof window.DrawUpVDI === 'object'), 'S1: Details, Draw a Detail and VDI code are still loaded');
  C.ok(!t.errors.length, 'S1: no page errors', t.errors.join(' | '));
  await t.b.close();

  // ---------------------------------------------------------------- HQ admin preview on a regular host
  t = await open('#portal/details', { mock: { ...MOCK, admin: true }, api: p => p === '/api/features' ? { json: { flags: { season2Details: false } } } : null });
  p = t.page; await p.waitForSelector('#dus2-preview', { timeout: 8000 }).catch(() => {});
  C.ok(!!await p.$('#dus2-preview'), 'HQ: Preview Season 2 button for admins');
  await p.click('#dus2-preview').catch(() => {}); await p.waitForTimeout(2500);
  C.ok(!(await p.$('.dus2')) && !!await p.$('.dus2-banner'), 'HQ: preview shows the real Details tools with a preview banner');
  await p.click('#dus2-end').catch(() => {}); await p.waitForTimeout(2000);
  C.ok(!!await p.$('.dus2'), 'HQ: ending the preview brings back the Season 2 screen');
  await t.b.close();

  // ---------------------------------------------------------------- flag on (DRAWUP_SEASON_2_DETAILS_ENABLED=true)
  t = await open('#portal/details', { mock: MOCK, api: p => p === '/api/features' ? { json: { flags: { season2Details: true } } } : null });
  p = t.page; await p.waitForTimeout(1500); await p.evaluate(() => window.DrawUpPortal.openPortalTab('details')); await p.waitForTimeout(2500);
  C.ok(!(await p.$('.dus2')), 'S2 flag: Details tab shows the real Details library');
  C.ok(/Detail Library/i.test(await p.textContent('#du-workspace-content')), 'S2 flag: Detail Library heading is back');
  C.ok((await navItems(p, 'draw')).some(x => /detail/i.test(x)), 'S2 flag: Draw menu detail tools are back');
  C.ok(await p.evaluate(() => !!window.DrawUpStudio._nav.PORTAL_NAV.find(x => x.id === 'details').cols), 'S2 flag: Details tools menu is back');
  await p.evaluate(() => { history.replaceState(null, '', '#portal/draw?detail=list'); window.DrawUpPortal.openPortalTab('draw'); }); await p.waitForTimeout(2000);
  C.ok(!(await p.$('.dus2')) && /My details/i.test(await p.textContent('#du-workspace-content')), 'S2 flag: Draw › My details (3D) opens with the saved 3D detail', (await p.textContent('#du-workspace-content')).slice(0, 120));
  C.ok(/Wall section W1/.test(await p.textContent('#du-workspace-content')), 'S2 flag: existing 3D detail record is listed');
  await t.shot('season2-flag-details');
  C.ok(!t.errors.length, 'S2 flag: no page errors', t.errors.join(' | '));
  await t.b.close();

  // ---------------------------------------------------------------- development switch ?season2=1 (127.0.0.1)
  t = await open('?season2=1#portal/details', { mock: MOCK, api: p => p === '/api/features' ? { json: { flags: { season2Details: false } } } : null });
  p = t.page; C.ok(!(await p.$('.dus2')), 'Dev: ?season2=1 turns Season 2 Details on in a development browser');
  await t.b.close();

  console.log(C.res.join('\n')); close(); process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
