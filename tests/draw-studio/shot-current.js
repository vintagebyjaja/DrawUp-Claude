const H = require('../season1/harness.js'), D = require('../../public/drawup-draw-core-v18.js');
const UID = '11111111-1111-4111-8111-111111111111';
(async () => {
  const m = D.samplePlan();
  const rows = [{ id: 'dddddddd-0000-4000-8000-000000000001', owner_id: UID, name: 'Sample Plan', sheet_number: 'A101', scale_denominator: 48, model: m, revision: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
  const hash = process.argv[2] || '#portal/draw';
  const { b, page, errors } = await H.open(hash, { mock: { extra: { drawings: rows, drawing_versions: [] } }, width: 1440, height: 900 });
  await page.screenshot({ path: __dirname + '/out-' + (process.argv[3] || 'cur') + '.png' });
  console.log(errors.join('\n')); await b.close(); H.close();
})();
