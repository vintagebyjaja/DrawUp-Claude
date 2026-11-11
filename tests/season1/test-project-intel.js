// Project Intelligence: lookups with provenance, merge rules, the real /api/project-intel route, and the page:
// new project with a site address -> fields filled with sources -> member edits are kept on the next lookup ->
// program, decisions, files -> project map pin -> the project page card. node tests/season1/test-project-intel.js
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://sb.test'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
const path = require('path'), fs = require('fs'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '../..'); const OUTB = path.join(__dirname, 'out'); fs.mkdirSync(OUTB, { recursive: true });
execSync(`npx esbuild src/lib/drawup-project-intel.ts --bundle --platform=node --format=cjs --outfile=${OUTB}/intel-lib.js --log-level=error`, { cwd: ROOT });
execSync(`npx esbuild src/app/api/project-intel/route.ts --bundle --platform=node --format=cjs --outfile=${OUTB}/intel-route.js --log-level=error`, { cwd: ROOT });
const L = require('./out/intel-lib.js'); const FX = require('./fixtures-intel.js');
const { open, checker, close } = require('./harness'); const C = checker();
const UID = '11111111-1111-4111-8111-111111111111';

let failServices = false, calls = [];
const realFetch = global.fetch;
global.fetch = async (input, init = {}) => {
  const u = new URL(typeof input === 'string' ? input : input.url); calls.push(u.host + u.pathname);
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (u.host === 'sb.test' && u.pathname === '/auth/v1/user') return (init.headers && String(init.headers.Authorization || init.headers.authorization || '').includes('mock-token')) ? J({ id: UID, is_anonymous: false }) : J({ msg: 'bad jwt' }, 401);
  if (u.host === 'geocoding.geo.census.gov') return J(/nowhere/i.test(u.searchParams.get('address')) ? FX.censusNoMatch : FX.census);
  const gis = FX.gisAnswer(u); if (gis) return J(gis);
  if (u.host === 'hazards.fema.gov') { if (failServices) return J({ error: 'down' }, 503); return J(u.pathname.includes('/28/') ? FX.femaZone : FX.femaPanel); }
  if (u.host === 'epqs.nationalmap.gov') { if (failServices) throw new Error('connect ETIMEDOUT'); return J(FX.usgs); }
  return realFetch(input, init);
};
const route = require('./out/intel-route.js');
const post = async (body, tok = 'mock-token-123456789') => { const r = await route.POST(new Request('http://x/api/project-intel', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) })); return { status: r.status, json: await r.json() }; };

(async () => {
  // ---------------------------------------------------------------- unit
  const s = L.sunOn(35.22, 172), wv = L.sunOn(35.22, 355);
  C.ok(Math.abs(s.noonAltitude - 78.2) < 0.6 && Math.abs(wv.noonAltitude - 31.3) < 0.6, `Sun: Charlotte noon altitude June ${s.noonAltitude}°, Dec ${wv.noonAltitude}° (expected ≈78.2° / 31.3°)`);
  C.ok(Math.abs(s.dayHours - 14.5) < 0.3 && Math.abs(wv.dayHours - 9.8) < 0.3, `Sun: day length ${s.dayHours} h / ${wv.dayHours} h (expected ≈14.5 / 9.8)`);
  const res = await L.lookupSite('600 E 4th St, Charlotte, NC 28202', async url => (await global.fetch(url)).json());
  const F = res.fields;
  C.ok(F.latitude && F.latitude.v === '35.22127654' && F.longitude.v === '-80.83926799' && /parcel/.test(F.latitude.note), 'Lookup: coordinates from a point inside the county parcel (more exact than the Census street range)');
  C.ok(F.county.v === 'Mecklenburg County, North Carolina' && F.municipality.v === 'Charlotte', 'Lookup: county and municipality');
  C.ok(/Charlotte city \(incorporated place\)/.test(F.jurisdiction.v) && F.jurisdiction.conf === 'low' && /AHJ/.test(F.jurisdiction.note), 'Lookup: jurisdiction is inferred, low confidence, and says to confirm with the AHJ');
  C.ok(/^Zone X/.test(F.flood_zone.v) && !/Special Flood/.test(F.flood_zone.v) && F.firm_panel.v.startsWith('3710454500K'), 'Lookup: FEMA flood zone and FIRM panel', F.flood_zone && F.flood_zone.v);
  C.ok(/^719\.4 ft/.test(F.ground_elevation.v), 'Lookup: USGS ground elevation');
  C.ok(Object.values(F).every(f => f.src && f.at && f.by === 'auto' && f.verified === false), 'Lookup: every value has a source, a date, by=auto and unverified');
  C.ok(F.parcel_id.v === '12502601' && /^UC\b/.test(F.zoning_district.v) && !F.code_edition && res.unavailable.some(u => u.key === 'code_edition'), 'Lookup: Charlotte parcel and zoning are filled; the code edition is still flagged as not available, not guessed');
  C.ok(res.sources.length === 10 && res.sources.every(x => x.ok), 'Lookup: 10 sources answered (Census, 2 parcel searches, 4 Charlotte GIS layers, FEMA x2, USGS)', res.sources.map(x => x.id + ':' + x.ok).join(' '));
  failServices = true; const res2 = await L.lookupSite('600 E 4th St, Charlotte, NC 28202', async url => { const r = await global.fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); failServices = false;
  C.ok(res2.fields.county && !res2.fields.flood_zone && res2.sources.filter(x => !x.ok).length === 3 && res2.unavailable.some(u => u.key === 'flood_zone' && /did not answer/.test(u.reason)), 'Lookup: when FEMA and USGS are down, the Census values still come back and the gaps are named');
  const res3 = await L.lookupSite('1 Nowhere Rd, Nowhere, ZZ', async url => (await global.fetch(url)).json());
  C.ok(!Object.keys(res3.fields).length && res3.unavailable[0].key === 'latitude', 'Lookup: unmatched address returns nothing and says why');
  const m = L.mergeLookup({ county: { v: 'Mecklenburg', by: 'user' }, flood_zone: { v: 'AE', by: 'auto', verified: true }, municipality: { v: 'old', by: 'auto' } }, F);
  C.ok(m.fields.county.v === 'Mecklenburg' && m.fields.flood_zone.v === 'AE' && m.fields.municipality.v === 'Charlotte' && m.kept.includes('county') && m.kept.includes('flood_zone'), 'Merge: member-entered and verified values are never replaced; auto values refresh');
  // ---------------------------------------------------------------- route
  let r = await post({ action: 'lookup', address: '600 E 4th St, Charlotte, NC 28202' });
  C.ok(r.status === 200 && r.json.fields.county, 'Route: signed-in lookup returns fields');
  r = await post({ action: 'lookup', address: '600 E 4th St, Charlotte, NC' }, 'nope');
  C.ok(r.status === 401, 'Route: signed-out request is refused');
  r = await post({ action: 'lookup', address: 'Charlotte' });
  C.ok(r.status === 400, 'Route: an address without a street number is refused');

  // ---------------------------------------------------------------- browser
  const api = async (p, req) => { if (p !== '/api/project-intel') return null; const res = await route.POST(new Request('http://x' + p, { method: 'POST', headers: { 'content-type': 'application/json', authorization: req.headers().authorization || '' }, body: req.postData() })); return { status: res.status, json: await res.json() }; };
  const t = await open('#portal/projects', { api }); const p = t.page;
  await p.click('#du-new-project').catch(() => {}); await p.waitForSelector('#dp-name', { timeout: 6000 });
  C.ok(!!await p.$('#dp-addr'), 'New project: has a Site address field');
  await p.fill('#dp-name', 'Queen City Apartments'); await p.fill('#dp-type', 'Multifamily'); await p.fill('#dp-addr', '600 E 4th St, Charlotte, NC 28202');
  await p.click('.du-save'); await p.waitForSelector('.dpi-site', { timeout: 8000 }).catch(() => {});
  await p.waitForFunction(() => document.querySelector('#dpi-f-county') && document.querySelector('#dpi-f-county').value, null, { timeout: 15000 }).catch(() => {});
  const pid = await p.evaluate(() => (window.__duMockDB.project_threads.find(x => x.project_name === 'Queen City Apartments') || {}).id);
  C.ok(!!pid && /#portal\/project-info\?id=/.test(await p.evaluate(() => location.hash)), 'New project: opens Project Information for it');
  const prof = () => p.evaluate(pid => JSON.parse(JSON.stringify((window.__duMockDB.project_profiles || []).find(x => x.project_thread_id === pid) || null)), pid);
  let row = await prof();
  C.ok(row && row.fields.county && row.fields.county.v === 'Mecklenburg County, North Carolina' && row.site.lat === 35.22127654 && row.site.parcel && row.site.parcel.id === '12502601' && row.site.zoning && row.site.vicinity, 'New project: site data saved to project_profiles with the parcel point, parcel, zoning and vicinity');
  C.ok(await p.evaluate(() => /U\.S\. Census Bureau Geocoder/.test(document.querySelector('[data-k="county"] .dpi-prov').textContent) && /Unverified/.test(document.querySelector('[data-k="county"] .dpi-prov').textContent)), 'Page: each value shows its source and "Unverified"');
  C.ok(await p.evaluate(() => /City of Charlotte zoning map/.test(document.querySelector('[data-k="zoning_district"] .dpi-prov').textContent) && /Unverified/.test(document.querySelector('[data-k="zoning_district"] .dpi-prov').textContent)), 'Page: zoning names its source and says "Unverified"');
  C.ok(await p.evaluate(() => /Not available/.test(document.querySelector('[data-k="code_edition"] .dpi-prov').textContent)), 'Page: the code edition says "Not available" with the reason');
  C.ok(await p.evaluate(() => !!document.querySelector('.dpi-map iframe[src*="openstreetmap.org/export/embed.html"]')), 'Page: site map at the geocoded point');
  C.ok(await p.evaluate(pid => (window.__duMockDB.project_threads.find(x => x.id === pid) || {}).location === 'Charlotte, NC', pid), 'New project: empty project location filled as "Charlotte, NC"');
  await t.shot('intel-01-filled');
  // member edits + verify
  await p.fill('#dpi-f-zoning_district', 'UR-2 (Urban Residential)'); await p.fill('#dpi-f-county', 'Mecklenburg County, NC');
  await p.check('[data-ver="flood_zone"]'); await p.waitForTimeout(1500);
  row = await prof();
  C.ok(row.fields.zoning_district.by === 'user' && row.fields.county.by === 'user' && row.fields.flood_zone.verified === true, 'Page: typed values are saved as entered by the member; verified is saved');
  await p.click('#dpi-look'); await p.waitForTimeout(3000); row = await prof();
  C.ok(row.fields.county.v === 'Mecklenburg County, NC' && row.fields.zoning_district.v === 'UR-2 (Urban Residential)', 'Second lookup keeps the member\'s values');
  C.ok(/kept as you entered them/.test(await p.textContent('#dpi-lookres')), 'Second lookup says which values were kept');
  // program + decisions
  await p.click('[data-ladd="program"]'); await p.fill('[data-li="program:0:name"]', 'Apartment units'); await p.fill('[data-li="program:0:area"]', '850'); await p.fill('[data-li="program:0:count"]', '120');
  await p.click('[data-ladd="decisions"]'); await p.fill('[data-li="decisions:0:topic"]', 'Parking structure or surface lot'); await p.waitForTimeout(1400);
  C.ok(/102,000 sf/.test(await p.textContent('#dpi-total')), 'Program: totals area × count (102,000 sf)');
  row = await prof(); C.ok(row.program.length === 1 && row.decisions[0].status === 'open', 'Program and open decisions are saved');
  // files
  const tmp = path.join(OUTB, 'survey.pdf'); fs.writeFileSync(tmp, '%PDF-1.4\n%test\n'); await p.setInputFiles('#dpi-file', tmp); await p.waitForTimeout(1500); row = await prof();
  C.ok(row.files.length === 1 && row.files[0].path.startsWith(UID + '/projects/' + pid + '/') && row.files[0].kind === 'survey', 'Survey upload is stored under the member\'s private project folder');
  // map
  await p.click('.dpi-tabs [data-v="map"]'); await p.waitForTimeout(1500);
  const pin = await p.evaluate(() => { const c = document.querySelector('.dpi-pin circle'); return c ? [+c.getAttribute('cx'), +c.getAttribute('cy')] : null; });
  const nc = await p.evaluate(() => window.DRAWUP_US_STATES.NC.c);
  C.ok(pin && Math.hypot(pin[0] - nc[0], pin[1] - nc[1]) < 80, `Map: Charlotte pin lands in North Carolina (pin ${pin}, NC centre ${nc})`);
  await t.shot('intel-02-map');
  await p.click('.dpi-pin').catch(() => {}); await p.waitForTimeout(1500);
  C.ok(!!await p.$('.dpi-site'), 'Map: the pin opens that project\'s information');
  // project page card
  await p.evaluate(pid => window.DrawUpPortal.openProject ? null : null, pid);
  await p.evaluate(() => { history.replaceState(null, '', '#portal/projects'); window.DrawUpPortal.openPortalTab('projects'); }); await p.waitForTimeout(1500);
  await p.evaluate(pid => document.querySelector(`[data-open-proj="${pid}"]`)?.click(), pid); await p.waitForTimeout(1800);
  C.ok(/UR-2/.test(await p.textContent('.dpi-card').catch(() => '')), 'Project page: Project Information card shows the key facts');
  await t.shot('intel-03-project-card');
  // phone
  C.ok(!t.errors.length, 'No page errors', t.errors.join(' | ')); await t.b.close();
  const t2 = await open('#portal/project-info?id=' + 'aaaaaaaa-0000-4000-8000-000000000001', { width: 390, height: 844, api }); await t2.page.waitForTimeout(800); await t2.shot('intel-04-phone');
  C.ok(await t2.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Phone: no sideways scrolling');
  C.ok(!t2.errors.length, 'Phone: no page errors', t2.errors.join(' | ')); await t2.b.close();
  console.log(C.res.join('\n')); close(); process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
