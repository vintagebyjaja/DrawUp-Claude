// Site lookup by jurisdiction (parcel, zoning, UDO limits, vicinity): the Charlotte / Mecklenburg adapter against
// stand-ins for the City of Charlotte GIS services, the not-covered paths, and the Project Information page.
// node tests/season1/test-site-lookup.js
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://sb.test'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
const path = require('path'), fs = require('fs'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '../..'); const OUTB = path.join(__dirname, 'out'); fs.mkdirSync(OUTB, { recursive: true });
execSync(`npx esbuild src/lib/drawup-project-intel.ts --bundle --platform=node --format=cjs --outfile=${OUTB}/site-lib.js --log-level=error`, { cwd: ROOT });
execSync(`npx esbuild src/app/api/project-intel/route.ts --bundle --platform=node --format=cjs --outfile=${OUTB}/site-route.js --log-level=error`, { cwd: ROOT });
execSync(`npx esbuild src/lib/drawup-jurisdiction-charlotte.ts --bundle --platform=node --format=cjs --outfile=${OUTB}/site-clt.js --log-level=error`, { cwd: ROOT });
const L = require('./out/site-lib.js'); const CLT = require('./out/site-clt.js'); const FX = require('./fixtures-intel.js');
const { open, checker, close } = require('./harness'); const C = checker();
const UID = '11111111-1111-4111-8111-111111111111';

let zoningDown = false; const urls = [];
const answer = url => { const u = new URL(url); urls.push(u);
  if (u.host === 'geocoding.geo.census.gov') return FX.censusByAddress(u.searchParams.get('address'));
  const g = FX.gisAnswer(u, { down: zoningDown }); if (g) return g;
  if (u.host === 'hazards.fema.gov') return u.pathname.includes('/28/') ? FX.femaZone : FX.femaPanel;
  if (u.host === 'epqs.nationalmap.gov') return FX.usgs;
  throw new Error('unexpected host ' + u.host); };
const realFetch = global.fetch;
global.fetch = async (input, init = {}) => {
  const u = new URL(typeof input === 'string' ? input : input.url);
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (u.host === 'sb.test' && u.pathname === '/auth/v1/user') return (init.headers && String(init.headers.Authorization || init.headers.authorization || '').includes('mock-token')) ? J({ id: UID, is_anonymous: false }) : J({ msg: 'bad jwt' }, 401);
  if (['geocoding.geo.census.gov', 'gis.charlottenc.gov', 'hazards.fema.gov', 'epqs.nationalmap.gov'].includes(u.host)) return J(answer(u.href));
  return realFetch(input, init);
};
const look = a => L.lookupSite(a, async url => answer(url));
const route = require('./out/site-route.js');

(async () => {
  // ---------------------------------------------------------------- district codes
  const D = x => CLT.parseDistrict(x);
  let d = D({ ZoneDes: 'N1-A(CD)', ZoneClass: 'NEIGHBORHOOD 1', ZonePetition: '2023-074', Overlay: 'none', Hyperlink: 'https://www.charlottenc.gov/x' });
  C.ok(d.base === 'N1-A' && d.kind === 'base' && d.conditional && d.petition === '2023-074' && d.petitionUrl && !d.overlays.length && /Article 4/.test(d.article), 'District: N1-A(CD) is base N1-A, conditional, petition linked, Article 4');
  d = D({ ZoneDes: 'UC(HDO)', Overlay: 'HDO' }); C.ok(d.base === 'UC' && !d.conditional && d.overlays.length === 1 && d.overlays[0].name === 'Historic District Overlay' && /14\.1/.test(d.overlays[0].ref), 'District: UC(HDO) gets one Historic District Overlay (Section 14.1), not two');
  d = D({ ZoneDes: 'CAC-1 EX(CD)' }); C.ok(d.base === 'CAC-1' && d.conditional && d.exception, 'District: CAC-1 EX(CD) is conditional with exceptions');
  d = D({ ZoneDes: 'N2-B(CD0' }); C.ok(d.base === 'N2-B' && d.conditional, 'District: the map typo "N2-B(CD0" still reads as conditional N2-B');
  d = D({ ZoneDes: 'UMUD-O' }); C.ok(d.kind === 'legacy' && !d.base, 'District: UMUD-O is a pre-UDO code (not mistaken for UC/UE)');
  d = D({ ZoneDes: 'R/W' }); C.ok(d.kind === 'right_of_way', 'District: R/W is right-of-way');
  d = D({ ZoneDes: 'TOD-UC(EX)' }); C.ok(d.base === 'TOD-UC' && d.exception && /Article 13/.test(d.article), 'District: TOD-UC(EX) -> Article 13');
  d = D({ ZoneDes: 'ML-1(CD)ANDO', Overlay: 'Airport Noise' }); C.ok(d.base === 'ML-1' && d.overlays.some(o => o.code === 'ANDO' && /Airport Noise Disclosure/.test(o.name)), 'District: "Airport Noise" overlay text maps to ANDO');
  C.ok(!/'/.test(CLT.parcelByAddressUrl("600 E 4TH ST' OR 1=1 --")) || /LIKE\+%27600\+E\+4TH\+ST\+OR\+1\+1/.test(CLT.parcelByAddressUrl("600 E 4TH ST' OR 1=1 --")), 'Parcel search: quotes and SQL punctuation are stripped from the address');

  // ---------------------------------------------------------------- uptown (demo project): UC, real parcel values
  let r = await look('600 E 4th St, Charlotte, NC 28202'); let F = r.fields;
  C.ok(F.parcel_id.v === '12502601' && F.parcel_id.url === 'https://polaris3g.mecklenburgcountync.gov/pid/12502601' && F.parcel_id.conf === 'high', 'Uptown: parcel 12502601 matched by address, linked to Polaris');
  C.ok(/^116,130 sf \(2\.666 ac\)/.test(F.site_area.v) && /CITY OF CHARLOTTE/.test(F.parcel_owner.v) && /\$87,383,800/.test(F.assessed_value.v), 'Uptown: lot size, owner and assessed value from the county record');
  C.ok(/^UC /.test(F.zoning_district.v) && /No maximum/.test(F.height_limit.v) && /minimum 40 ft/.test(F.height_limit.v) && /Table 12-2/.test(F.height_limit.note), 'Uptown: UC, no maximum height, 40 ft minimum, cites Table 12-2');
  C.ok(/Side: 0 ft; 10 ft where the lot abuts/.test(F.setbacks.v) && /Table 12-1/.test(F.setbacks.note), 'Uptown: setbacks with the Neighborhood 1 condition and Table 12-1');
  const Z = r.site.zoning; C.ok(Z.frontage && Z.frontage.rows.some(x => x[0] === 'Main Street' && x[1] === '24 ft' && x[2] === '0–10 ft' && x[3] === '100%'), 'Uptown: frontage table (Main Street 24 ft, build-to 0-10 ft, 100%)');
  C.ok(r.unavailable.some(u => u.key === 'far' && /no floor area ratio/.test(u.reason)) && !F.far, 'Uptown: FAR is reported as not set by the tables, not invented');
  C.ok(r.site.vicinity.zones.length === 2 && r.site.vicinity.parcels.length === 12 && r.site.vicinity.rezonings[0].petition === '2026-067', 'Uptown: vicinity has zoning districts, parcel lines and a pending rezoning');
  const [x0, y0, x1, y1] = r.site.vicinity.bbox; C.ok(r.site.vicinity.zones.every(z => z.rings.every(rg => rg.every(([x, y]) => x >= x0 - 1e-6 && x <= x1 + 1e-6 && y >= y0 - 1e-6 && y <= y1 + 1e-6))), 'Uptown: vicinity polygons are clipped to the map box');
  C.ok(Math.abs((x1 - x0) * 364000 * Math.cos(35.22 * Math.PI / 180) - 1300) < 5, 'Uptown: the vicinity box is about 1,300 ft across');
  const zq = urls.find(u => u.pathname.endsWith('/PLN/Zoning/MapServer/0/query') && u.searchParams.get('geometryType') === 'esriGeometryPoint');
  C.ok(zq && zq.searchParams.get('geometry') === '-80.83926799,35.22127654', 'Uptown: zoning is read at the point inside the parcel, not the street geocode');
  C.ok(Object.values(F).every(f => f.src && f.at && f.by === 'auto' && f.verified === false), 'Every value has a source, a date, by=auto and unverified');

  // ---------------------------------------------------------------- house: N1-C(CD) + HDO, lot under 10,000 sf
  r = await look('1200 Queens Rd, Charlotte, NC 28207'); F = r.fields;
  C.ok(/^N1-C\(CD\)/.test(F.zoning_district.v) && /petition 2023-074/.test(F.zoning_conditions.v) && /Historic District Overlay/.test(F.zoning_conditions.v), 'House: conditional N1-C with its petition and the historic overlay');
  C.ok(F.setbacks.v === 'Front: 17 ft from the street right-of-way · Corner side: 10 ft from the street right-of-way · Side: 5 ft · Rear: 30 ft', 'House: N1-C setbacks 17 / 10 / 5 / 30 ft (Table 4-2)', F.setbacks.v);
  C.ok(/^40 ft residential; 48 ft/.test(F.height_limit.v) && /^6,000 sf/.test(F.min_lot_area.v) && /^50 ft/.test(F.min_lot_width.v), 'House: N1-C height 40 ft, lot 6,000 sf, width 50 ft');
  C.ok(/^50% \(this lot is 9,017 sf\)/.test(F.lot_coverage.v), 'House: building coverage 50% because the lot is under 10,000 sf (0.207 ac converted)');
  C.ok(['setbacks', 'height_limit', 'lot_coverage'].every(k => F[k].conf === 'low' && /approved rezoning plan may differ/.test(F[k].note)), 'House: conditional district -> base limits are low confidence and say the plan may differ');
  C.ok(/Deed book 35512, page 118/.test(F.legal_description.v) && /PAT SAMPLE & JO SAMPLE/.test(F.parcel_owner.v), 'House: deed and both owners');

  // ---------------------------------------------------------------- Huntersville: parcels yes, zoning not covered
  r = await look('100 Main St, Huntersville, NC'); F = r.fields;
  C.ok(F.parcel_id.v === '01910101' && !F.zoning_district && r.unavailable.some(u => u.key === 'zoning_district' && /Huntersville, which zones its own land/.test(u.reason)), 'Huntersville: parcel found; zoning says the town zones its own land, nothing guessed');
  C.ok(!F.setbacks && !F.height_limit && !r.site.zoning, 'Huntersville: no Charlotte limits applied outside Charlotte');

  // ---------------------------------------------------------------- Raleigh: not covered at all
  r = await look('222 W Hargett St, Raleigh, NC'); F = r.fields;
  C.ok(!F.parcel_id && !F.zoning_district && r.unavailable.some(u => u.key === 'zoning_district' && /Wake County/.test(u.reason) && /DrawUp covers: Charlotte/.test(u.reason)), 'Raleigh: not covered; the reason names the county and what DrawUp does cover');
  C.ok(!urls.some(u => u.host === 'gis.charlottenc.gov' && u.searchParams.get('geometry') === '-78.6417,35.7779'), 'Raleigh: Charlotte services are not asked');

  // ---------------------------------------------------------------- legacy district, no parcel match
  r = await look('500 Legacy Ave, Charlotte, NC'); F = r.fields;
  C.ok(/^MUDD-O/.test(F.zoning_district.v) && F.zoning_district.conf === 'medium' && /geocoded street point/.test(F.zoning_district.note), 'Legacy: no parcel -> zoning read at the street point, medium confidence, says so');
  C.ok(!F.setbacks && r.unavailable.some(u => u.key === 'setbacks' && /not a UDO base district/.test(u.reason)), 'Legacy: pre-UDO district -> no UDO setbacks, sends the member to the rezoning plan');
  C.ok(r.unavailable.some(u => u.key === 'parcel_id' && /No Mecklenburg County parcel matched/.test(u.reason)), 'Legacy: missing parcel is named');

  // ---------------------------------------------------------------- zoning service down
  zoningDown = true; r = await look('1200 Queens Rd, Charlotte, NC 28207'); zoningDown = false; F = r.fields;
  C.ok(F.parcel_id && !F.zoning_district && r.sources.some(s => s.id === 'clt_zoning' && !s.ok && /Service unavailable/.test(s.error)) && r.unavailable.some(u => u.key === 'zoning_district' && /did not answer/.test(u.reason)), 'Zoning down: parcel still comes back; the ArcGIS error is shown and zoning says it did not answer');

  // ---------------------------------------------------------------- helpers
  C.ok(L.REGISTRY.length >= 1 && L.REGISTRY[0].id === 'nc-charlotte', 'Registry: Charlotte adapter registered');

  // ---------------------------------------------------------------- route (Workers path is the same code)
  const post = async body => { const res = await route.POST(new Request('http://x/api/project-intel', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer mock-token-123' }, body: JSON.stringify(body) })); return { status: res.status, json: await res.json() }; };
  const rr = await post({ action: 'lookup', address: '1200 Queens Rd, Charlotte, NC 28207' });
  C.ok(rr.status === 200 && rr.json.site.zoning.district.base === 'N1-C' && rr.json.site.vicinity && rr.json.site.parcel.id === '15303199', 'Route: returns the parcel, zoning and vicinity');
  C.ok(JSON.stringify(rr.json).length < 120000, `Route: answer stays small (${JSON.stringify(rr.json).length} bytes)`);

  // ---------------------------------------------------------------- page
  const api = async (p, req) => { if (p !== '/api/project-intel') return null; const res = await route.POST(new Request('http://x' + p, { method: 'POST', headers: { 'content-type': 'application/json', authorization: req.headers().authorization || '' }, body: req.postData() })); return { status: res.status, json: await res.json() }; };
  for (const [w, h, tag] of [[1440, 2600, 'desk'], [390, 3400, 'phone']]) {
    const t = await open('#portal/projects', { api, width: w, height: h }); const p = t.page;
    await p.click('#du-new-project').catch(() => {}); await p.waitForSelector('#dp-name', { timeout: 6000 });
    await p.fill('#dp-name', 'Myers Park House'); await p.fill('#dp-type', 'Single family'); await p.fill('#dp-addr', '1200 Queens Rd, Charlotte, NC 28207');
    await p.click('.du-save'); await p.waitForSelector('.dpi-zcard', { timeout: 15000 }).catch(() => {});
    C.ok(/N1-C\(CD\)/.test(await p.textContent('.dpi-zcode').catch(() => '')), `Page (${tag}): zoning card shows N1-C(CD)`);
    C.ok(await p.evaluate(() => [...document.querySelectorAll('.dpi-ztbl th')].map(x => x.textContent).join('|')).then(s => /Front setback/.test(s) && /Rear setback/.test(s) && /Maximum height/.test(s)), `Page (${tag}): limits table lists setbacks and height`);
    C.ok(await p.evaluate(() => /UDO Article 4, Table 4-2, row A/.test(document.querySelector('.dpi-ztbl').textContent) && /Unverified/.test(document.querySelector('.dpi-zcard .dpi-src1').textContent) && /zoning verification letter/.test(document.querySelector('.dpi-zcard .dpi-src1').textContent)), `Page (${tag}): every limit cites its table; the card says Unverified and how to get a binding answer`);
    C.ok(await p.evaluate(() => /Conditional/.test(document.querySelector('.dpi-tags').textContent) && /Historic District Overlay/.test(document.querySelector('.dpi-tags').textContent) && /pending rezoning/.test(document.querySelector('.dpi-tags').textContent)), `Page (${tag}): conditional, overlay and nearby rezoning are flagged`);
    C.ok(await p.evaluate(() => !!document.querySelector('.dpi-vic svg path.subj') && document.querySelectorAll('.dpi-vic .pl path').length === 12 && !!document.querySelector('.dpi-vic path.rz')), `Page (${tag}): vicinity map draws the parcel, the lot lines and the pending rezoning`);
    C.ok(await p.evaluate(() => /Polaris/.test(document.querySelector('.dpi-parcel').textContent) && /15303199/.test(document.querySelector('.dpi-parcel').textContent)), `Page (${tag}): parcel panel with Polaris link`);
    await p.click('[data-mv="street"]'); C.ok(await p.evaluate(() => !document.querySelector('[data-mvp="street"]').hidden && document.querySelector('[data-mvp="vic"]').hidden), `Page (${tag}): Street map tab switches`); await p.click('[data-mv="vic"]');
    C.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Page (${tag}): no sideways scrolling`);
    const site = await p.$('.dpi-site'); if (site) await site.screenshot({ path: path.join(OUTB, `site-${tag}.png`) });
    C.ok(!t.errors.length, `Page (${tag}): no page errors`, t.errors.join(' | ')); await t.b.close();
  }
  console.log(C.res.join('\n')); close(); process.exit(C.failed() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
