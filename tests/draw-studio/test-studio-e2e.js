// Draw Studio end to end in the real page (stand-in Supabase, no real database or AI).
// Run: node tests/draw-studio/test-studio-e2e.js   (screenshots go to tests/season1/out/studio-*.png)
const H = require('../season1/harness.js'), D = require('../../public/drawup-draw-core-v18.js');
const path = require('path'), fs = require('fs');
const UID = '11111111-1111-4111-8111-111111111111', FX = path.join(__dirname, 'fixtures');
const now = new Date().toISOString();
const sample = [{ id: 'dddddddd-0000-4000-8000-000000000001', owner_id: UID, name: 'Sample Plan', sheet_number: 'A101', scale_denominator: 48, model: D.samplePlan(), revision: 3, created_at: now, updated_at: now }];
const T = H.checker(), ok = (c, m, x) => { T.ok(c, m, x); console.log(T.res[T.res.length - 1]); };
const txt = (page, sel) => page.textContent(sel, { timeout: 3000 }).catch(() => '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(page, fn, arg, ms) { try { await page.waitForFunction(fn, arg, { timeout: ms || 8000 }); return true; } catch (_e) { return false; } }

(async () => {
  /* ---------------- A. start screen, DXF import with review, floors, commands, 3D, export */
  {
    const { b, page, errors, shot } = await H.open('#portal/draw?new=1', { mock: { extra: { drawings: [], drawing_versions: [] } } });
    const h1 = await txt(page, '.dws-start h1');
    ok(h1 === 'What Will You Create Today?', 'start heading', h1);
    const cards = await page.$$eval('.dws-card h2', a => a.map(x => x.firstChild.textContent.trim()));
    ok(cards.length === 2 && cards[0] === 'Import a Drawing' && cards[1] === 'Create From an Image', 'exactly two start cards', cards.join('|'));
    ok(!(await page.content()).includes('Start From Scratch'), 'no Start From Scratch option');
    ok(await page.isVisible('#dws-import') && (await txt(page, '#dws-import')) === 'Import Drawing', 'Import Drawing button');
    ok((await txt(page, '#dws-image')) === 'Create Design', 'Create Design button');
    await shot('studio-start');

    // unsupported format: DWG explains itself, creates nothing
    await page.setInputFiles('#dws-file', { name: 'plan.dwg', mimeType: 'application/octet-stream', buffer: Buffer.from('AC1032' + '\0'.repeat(200)) });
    ok(await waitFor(page, () => document.querySelector('#dws-imp') && /DXF/.test(document.querySelector('#dws-imp').textContent)), 'DWG shows a save-as-DXF message');
    await page.click('#dws-imp .dws-x');

    await page.setInputFiles('#dws-file', path.join(FX, 'plan-in.dxf'));
    ok(await waitFor(page, () => document.querySelector('#dws-create')), 'DXF review opens');
    const found = await page.$$eval('.dws-found b', a => a.map(x => +x.textContent));
    ok(found[0] === 5 && found[1] === 2 && found[2] === 3, 'review counts walls/doors/windows', found.join(','));
    ok(/Editable architectural model/.test(await txt(page, '.dws-class')), 'classified as an editable architectural model');
    ok(/40'-0" × 30'-0"/.test(await txt(page, '.dws-class')), 'overall size 40x30 shown', await txt(page, '.dws-class'));
    ok(await page.$eval('#dws-unitok', e => e.checked && e.disabled), 'units from the file are confirmed');
    await shot('studio-review-dxf');
    await page.fill('#dws-floors', '2'); await page.dispatchEvent('#dws-floors', 'change');
    await waitFor(page, () => document.querySelector('#dws-copy'));
    ok(!!(await page.$('#dws-copy')), 'upper-floor choice appears for 2 floors');
    await page.fill('#dws-f2f', "11'-0\""); await page.dispatchEvent('#dws-f2f', 'change');
    await page.click('#dws-create');
    ok(await waitFor(page, () => window.DrawUpDrawStudio.editor && document.querySelector('.dws-shell'), null, 12000), 'studio opens after import');
    await sleep(800);
    const st = await page.evaluate(() => { const m = window.DrawUpDrawStudio.editor.api.model; return { floors: window.DrawUpFloors.levels(m).map(l => [l.name, l.elev, l.height]), src: m.ws.source, walls: m.walls.length, as: m.ws.assumptions.map(a => a.id + ':' + a.status) }; });
    ok(st.floors.length === 2 && st.floors[1][1] === 132, 'two floors at 11\'-0" floor to floor', JSON.stringify(st.floors));
    ok(st.src && st.src.kind === 'dxf' && /draw\/imports\//.test(st.src.path || ''), 'original DXF kept in storage', JSON.stringify(st.src && st.src.path));
    ok(st.as.includes('im_units:confirmed') && st.as.some(a => a.startsWith('im_height:assumed')), 'confirmed vs assumed tracked', st.as.join(','));
    const toast = await txt(page, '#dws-toast');
    ok(/Model imported/.test(toast), 'import toast', toast);
    const ver = await page.evaluate(() => (window.__DU_MOCK_DB || {}).drawing_versions || null);
    void ver;
    await shot('studio-imported');

    // rail and right panel
    await page.click('[data-rail="geo"]'); ok(await page.isVisible('[data-panel="geo"] [data-tool="dim"]'), 'Geometry panel holds Dimension tool');
    await page.click('[data-rail="arch"]'); ok(await page.isVisible('[data-panel="arch"] [data-tool="wall"]'), 'Architecture panel holds Wall tool');
    await page.click('[data-ptab="bld"]');
    ok((await page.$$('.dws-floors li')).length === 2, 'Building panel lists 2 floors');

    // Arch Coach: add a floor through a previewed command
    await page.fill('#dw29-cmd input', 'add a third floor at 10 feet'); await page.press('#dw29-cmd input', 'Enter');
    ok(await waitFor(page, () => document.querySelector('#dws-capply')), 'floor command shows a preview');
    await page.click('#dws-capply'); await sleep(300);
    let n = await page.evaluate(() => window.DrawUpFloors.count(window.DrawUpDrawStudio.editor.api.model));
    ok(n === 3, 'third floor added', n);
    await page.click('#dw-undo'); await sleep(300);
    n = await page.evaluate(() => window.DrawUpFloors.count(window.DrawUpDrawStudio.editor.api.model));
    ok(n === 2, 'undo removes the added floor', n);
    ok((await page.$$('.dws-floors li')).length === 2 && (await page.$$('#dws-floor option')).length === 3, 'floor list and picker refresh after undo');
    // geometry unchanged by a style switch
    const h0 = await page.evaluate(() => window.DrawUpWSGeo.geomHash(window.DrawUpDrawStudio.editor.api.model));
    await page.fill('#dw29-cmd input', 'switch to sketch'); await page.press('#dw29-cmd input', 'Enter'); await sleep(300);
    const h1b = await page.evaluate(() => window.DrawUpWSGeo.geomHash(window.DrawUpDrawStudio.editor.api.model));
    ok(h0 === h1b && await page.$eval('[data-style="sketch"]', e => e.classList.contains('on')), 'style command changes style, not geometry');

    // 3D with presets
    await page.click('[data-dim="3d"]');
    const has3d = await waitFor(page, () => window.DrawUpWorkspace && window.DrawUpWorkspace.viewer3d, null, 15000);
    ok(has3d, '3D viewer mounts');
    if (has3d) {
      ok(await page.isVisible('#dws-cambar'), 'camera bar shows in 3D');
      await page.selectOption('#dws-preset', 'axo'); await sleep(500);
      ok(await page.evaluate(() => window.DrawUpWorkspace.viewer3d.preset() === 'axo' && window.DrawUpWorkspace.viewer3d.isOrtho()), 'axonometric preset is orthographic');
      await page.selectOption('#dws-show', 'only'); await sleep(300);
      await page.check('#dws-explode'); await sleep(400);
      await shot('studio-3d-axo');
      // presentation export, 1920x1080 PNG, no UI in the picture
      await page.click('#dws-export'); await waitFor(page, () => document.querySelector('#dws-xgo'));
      await page.selectOption('#dws-xw', 'exterior'); await page.selectOption('#dws-xs', '1920x1080');
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }).catch(() => null), page.click('#dws-xgo')]);
      if (dl) { const p = await dl.path(), buf = fs.readFileSync(p); const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20); ok(buf.slice(1, 4).toString() === 'PNG' && w === 1920 && h === 1080, 'PNG export is 1920 x 1080', `${w}x${h}`); }
      else ok(false, 'PNG export downloads');
      // PDF sheet
      await page.click('#dws-export'); await waitFor(page, () => document.querySelector('#dws-xgo'));
      await page.selectOption('#dws-xf', 'pdf');
      const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }).catch(() => null), page.click('#dws-xgo')]);
      if (dl2) { const buf = fs.readFileSync(await dl2.path()); ok(buf.slice(0, 5).toString() === '%PDF-' && buf.length > 20000, 'PDF sheet export', buf.length); } else ok(false, 'PDF export downloads');
    }
    await page.click('[data-dim="2d"]'); await sleep(300);
    // plan export too
    await page.click('#dws-export'); await waitFor(page, () => document.querySelector('#dws-xgo'));
    await page.selectOption('#dws-xw', 'plan'); await page.selectOption('#dws-xf', 'jpg'); await page.selectOption('#dws-xs', '2400x2400');
    const [dl3] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }).catch(() => null), page.click('#dws-xgo')]);
    if (dl3) { const buf = fs.readFileSync(await dl3.path()); ok(buf[0] === 0xff && buf[1] === 0xd8 && buf.length > 30000, 'JPG plan export', buf.length); } else ok(false, 'JPG plan export downloads');
    ok(!errors.length, 'no page errors (import, studio)', errors.join(' | '));
    await b.close();
  }

  /* ---------------- B. PDF import: vector linework with the scale read from the sheet; scanned goes to the picture reader */
  {
    const { b, page, errors, shot } = await H.open('#portal/draw?new=1', { mock: { extra: { drawings: [], drawing_versions: [] } } });
    await page.setInputFiles('#dws-file', path.join(FX, 'plan-vector.pdf'));
    ok(await waitFor(page, () => document.querySelector('#dws-create'), null, 15000), 'vector PDF goes to the review');
    const sc = await page.$eval('#dws-scale', e => e.value).catch(() => '');
    ok(sc === '48', 'scale 1/4" = 1\'-0" read from the sheet', sc);
    const found = await page.$$eval('.dws-found b', a => a.map(x => +x.textContent));
    ok(found[0] >= 5, 'PDF walls recognised', found.join(','));
    ok(/40'-0" × 30'-0"/.test(await txt(page, '.dws-class')), 'PDF overall size 40x30', await txt(page, '.dws-class'));
    await shot('studio-review-pdf');
    await page.click('#dws-imp .dws-x');
    await page.setInputFiles('#dws-file', path.join(FX, 'plan-scanned.pdf'));
    ok(await waitFor(page, () => document.querySelector('#dw29-wiz'), null, 15000), 'scanned PDF goes to the picture reader');
    ok(!errors.length, 'no page errors (PDF)', errors.join(' | '));
    await b.close();
  }

  /* ---------------- C. existing drawings open as before; Recent Projects; phone layout */
  {
    const { b, page, errors, shot } = await H.open('#portal/draw', { mock: { extra: { drawings: sample, drawing_versions: [] } } });
    ok(await page.isVisible('.dws-shell') && (await page.$eval('#dw-list', e => e.value)) === sample[0].id, 'existing drawing opens directly in the studio');
    const walls = await page.evaluate(() => window.DrawUpDrawStudio.editor.api.model.walls.length);
    ok(walls === D.samplePlan().walls.length, 'existing model unchanged on open', walls);
    ok(await page.evaluate(() => !('floors' in window.DrawUpDrawStudio.editor.api.model)), 'one-floor drawing is not rewritten');
    await page.evaluate(() => window.DrawUpDrawStudio.start('choose')); await sleep(1500);
    ok((await page.$$('.dws-rcard')).length === 1, 'Recent Projects lists the drawing');
    await page.evaluate(() => window.DrawUpDrawStudio.openRecent({ view: 'export' })); await sleep(2500);
    ok(!!(await page.$('#dws-expdlg')), 'openRecent({view:"export"}) opens the export dialog on the latest drawing');
    await b.close();
    const m = await H.open('#portal/draw', { mock: { extra: { drawings: sample, drawing_versions: [] } }, width: 390, height: 844 });
    const over = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(over <= 1, 'phone: no sideways scroll in the studio', over);
    await m.shot('studio-phone');
    await m.page.evaluate(() => window.DrawUpDrawStudio.start('choose')); await sleep(1500);
    const over2 = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(over2 <= 1, 'phone: no sideways scroll on the start screen', over2);
    await m.shot('studio-phone-start');
    ok(!errors.length && !m.errors.length, 'no page errors (existing, phone)', errors.concat(m.errors).join(' | '));
    await m.b.close();
  }
  H.close();
  console.log(T.res.join('\n')); console.log(T.failed() ? `\n${T.failed()} FAILED` : '\nALL PASS'); process.exit(T.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
