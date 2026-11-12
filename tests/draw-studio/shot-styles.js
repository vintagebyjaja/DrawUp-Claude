// Renders the 3D styles to PNG for review: node tests/draw-studio/shot-styles.js
const H = require('../season1/harness.js'), D = require('../../public/drawup-draw-core-v18.js'), fs = require('fs');
const UID = '11111111-1111-4111-8111-111111111111';
(async () => {
  const rows = [{ id: 'dddddddd-0000-4000-8000-000000000001', owner_id: UID, name: 'Sample Plan', sheet_number: 'A101', scale_denominator: 48, model: D.samplePlan(), revision: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
  const { b, page, errors } = await H.open('#portal/draw', { mock: { extra: { drawings: rows, drawing_versions: [] } } });
  await page.click('[data-dim="3d"]'); await page.waitForFunction(() => window.DrawUpWorkspace.viewer3d, null, { timeout: 15000 });
  for (const [style, cut] of [['sketch', false], ['sketch', true], ['cd', false], ['presentation', false]]) {
    await page.click(`[data-style="${style}"]`); await page.waitForTimeout(300);
    await page.evaluate(c => { const x = document.querySelector('#dw29-cut'); if (x && x.checked !== c) { x.checked = c; x.dispatchEvent(new Event('change')); } }, cut);
    await page.waitForTimeout(400);
    const url = await page.evaluate(() => { const V = window.DrawUpWorkspace.viewer3d; V.view('axo'); return V.png(1600, 1100, { background: '#ffffff' }); });
    const f = `${process.argv[2] || __dirname}/style-${style}${cut ? '-cut' : ''}.png`; fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log(f);
  }
  console.log(errors.join('\n') || 'no errors'); await b.close(); H.close();
})();
