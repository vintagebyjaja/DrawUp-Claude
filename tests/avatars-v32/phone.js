const path = require('path'); const { open, close } = require('../season1/harness');
(async () => { const t = await open('#portal/dashboard', { width: 390, height: 844, wait: 7000 }); const p = t.page;
  await p.evaluate(() => window.DrawUpAvatars.open('teammate')); await p.waitForSelector('.du-av-stage canvas', { timeout: 60000 }); await p.waitForTimeout(3000);
  await p.screenshot({ path: path.join(__dirname, 'out', 'phone.png') });
  console.log('overflow', await p.evaluate(() => document.querySelector('.du-av-card').scrollWidth - document.querySelector('.du-av-card').clientWidth), t.errors);
  await p.click('[data-view="headshot"]'); await p.waitForTimeout(800); await p.screenshot({ path: path.join(__dirname, 'out', 'phone-face.png') });
  await t.b.close(); close(); })();
