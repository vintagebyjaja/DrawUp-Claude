// v32 avatar maker: open from the dashboard, change the look, save a face shot, see it as the Arch Coach picture,
// then make a 6th Man and see it in the AI Team.   node tests/avatars-v32/test-avatar-maker.js
const path = require('path'), fs = require('fs');
const { open, checker, close } = require('../season1/harness');
const C = checker(); const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const t = await open('#portal/dashboard', { width: 1440, height: 900, wait: 7000 }); const p = t.page;
  await p.waitForTimeout(1200);
  C.ok(await p.locator('[data-av-edit]').count() === 1, 'Dashboard Arch Coach panel has an edit-avatar button');
  await p.click('[data-av-edit]');
  await p.waitForSelector('.du-av-stage canvas', { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(3000);
  C.ok(await p.locator('.du-av-stage canvas').count() === 1, 'The 3D avatar loads in the maker');
  C.ok(await p.locator('.du-av-tabs [role=tab]').allTextContents().then(x => x.join('|')) === 'Arch Coach|Teammate|6th Man', 'Maker offers Arch Coach, Teammate and 6th Man');
  await p.screenshot({ path: path.join(OUT, 'maker-coach.png') });
  await p.click('.du-av-chips [data-k="hair"][data-v="afro"]'); await p.click('[data-acc="glasses"]'); await p.waitForTimeout(1500);
  await p.click('[data-view="face"]'); await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(OUT, 'maker-face.png') });
  await p.click('[data-save]'); await p.waitForFunction(() => /saved/.test(document.querySelector('.du-av-status')?.textContent || ''), null, { timeout: 60000 }).catch(() => {});
  const st = await p.locator('.du-av-status').textContent(); C.ok(/saved/.test(st), 'Saving takes a face shot', st);
  const face = await p.evaluate(() => window.DrawUpAvatars.face('coach')); C.ok(/^data:image\/(webp|jpeg)/.test(face) && face.length < 120000, 'Face shot is a small image', String(face.length));
  const row = await p.evaluate(() => (window.__duMockDB?.member_avatars || []).find(r => r.role === 'coach')); C.ok(!!row && row.look.hair === 'afro', 'Saved to member_avatars with the look');
  await p.click('.du-av-tabs [data-role="sixth_man"]'); await p.waitForTimeout(2500);
  await p.screenshot({ path: path.join(OUT, 'maker-sixth.png') });
  await p.click('[data-save]'); await p.waitForFunction(() => /6th Man saved/.test(document.querySelector('.du-av-status')?.textContent || ''), null, { timeout: 60000 }).catch(() => {});
  await p.click('.du-av-x'); await p.waitForTimeout(1500);
  C.ok(await p.evaluate(() => !!document.querySelector('#db-coach-ava img.du-member-face')), 'Dashboard shows the new Arch Coach face shot');
  await p.screenshot({ path: path.join(OUT, 'dashboard-after.png'), clip: { x: 900, y: 70, width: 540, height: 300 } });
  await p.evaluate(() => { location.hash = '#portal/ai-team'; }); await p.waitForTimeout(5000);
  const six = await p.evaluate(() => [...document.querySelectorAll('.du-tm25-av.sixth_man img.du-member-face')].length);
  C.ok(six > 0, 'AI Team shows the 6th Man face shot', String(six));
  C.ok(await p.locator('.du-av-teambtn').count() >= 1, 'AI Team has an Avatars button');
  await p.screenshot({ path: path.join(OUT, 'team.png') });
  C.ok(t.errors.length === 0, 'No page errors', t.errors.join(' | '));
  await t.b.close(); close(); console.log(C.res.join('\n')); process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
