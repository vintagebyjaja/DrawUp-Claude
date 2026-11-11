// Project Intelligence (Season 1): site and jurisdiction lookups from public sources, with provenance.
// Pure code (no imports) so the route and the tests share it.
//
// Every value DrawUp fills in carries where it came from: { v, src, url, at, conf, by: 'auto', verified: false }.
// Nothing here is a legal determination. Parcel lines, zoning rules, setbacks and site conditions are only shown
// when a connected source returns them, and are always marked unverified until the member checks them. When a
// jurisdiction has no connected source the field is returned as "not available" with the reason, never guessed.
//
// Sources (public, no key):
//   - U.S. Census Bureau Geocoder: address -> coordinates, state, county, place (municipality), census tract.
//     https://geocoding.geo.census.gov/geocoder/  (docs: https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html)
//   - FEMA National Flood Hazard Layer (NFHL) ArcGIS service: flood zone and FIRM panel at the point.
//     https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer
//   - USGS Elevation Point Query Service (3DEP): ground elevation at the point.  https://epqs.nationalmap.gov/v1/
//   - Sun position: computed here (NOAA solar equations), no network.
//   - Parcels, zoning, UDO limits and the vicinity map: one adapter per covered jurisdiction
//     (drawup-jurisdictions.ts; Charlotte and Mecklenburg County, NC in drawup-jurisdiction-charlotte.ts).
import { COVERAGE_TEXT, findJurisdiction } from './drawup-jurisdictions';
import type { AdapterCtx, BuildingInfo, ParcelInfo, Ring, SourceKind, VicinityInfo, ZoningInfo } from './drawup-jurisdictions';
import { overpassUrl, parseOverpass, OSM_SRC } from './drawup-site-buildings';
export { KIND_LABEL } from './drawup-jurisdictions';
export { REGISTRY, COVERAGE_TEXT, findLinks } from './drawup-jurisdictions';
export { parseDistrict } from './drawup-jurisdiction-charlotte';

export type Conf = 'high' | 'medium' | 'low';
export type FieldValue = { v: string; src: string; url?: string; at: string; conf?: Conf; by: 'auto' | 'user'; verified?: boolean; note?: string; kind?: SourceKind };
export type SourceResult = { id: string; name: string; url: string; ok: boolean; error?: string; ms?: number };
export type Unavailable = { key: string; reason: string; next: string };
export type SiteInfo = { lat?: number; lng?: number; from?: 'census' | 'parcel'; boundary?: Ring[] | null; jurisdiction?: string; parcel?: ParcelInfo; zoning?: ZoningInfo; vicinity?: VicinityInfo; buildings?: BuildingInfo[]; building?: string };
export type LookupResult = { fields: Record<string, FieldValue>; site: SiteInfo; sources: SourceResult[]; unavailable: Unavailable[]; at: string };

export const SOURCES = {
  census: { name: 'U.S. Census Bureau Geocoder', home: 'https://geocoding.geo.census.gov/geocoder/' },
  fema: { name: 'FEMA National Flood Hazard Layer', home: 'https://msc.fema.gov/portal/home' },
  usgs: { name: 'USGS Elevation Point Query Service (3DEP)', home: 'https://apps.nationalmap.gov/epqs/' },
  sun: { name: 'DrawUp sun position (NOAA solar equations)', home: 'https://gml.noaa.gov/grad/solcalc/calcdetails.html' },
} as const;

/** Project Information fields, grouped. Keys shared with DrawUp Specs project data (<<project_name>> tokens). */
export const FIELD_GROUPS: { id: string; label: string; fields: [string, string, string?][] }[] = [
  { id: 'project', label: 'Project', fields: [['project_name', 'Project name'], ['project_number', 'Project number'], ['project_status', 'Project status'], ['phase', 'Phase'], ['building_type', 'Building type'], ['project_description', 'Description']] },
  { id: 'site', label: 'Site and jurisdiction', fields: [['project_address', 'Project address'], ['project_location', 'City and state'], ['latitude', 'Latitude'], ['longitude', 'Longitude'], ['county', 'County'], ['municipality', 'Municipality'], ['jurisdiction', 'Likely permitting jurisdiction'], ['census_tract', 'Census tract'], ['parcel_id', 'Parcel ID'], ['site_area', 'Site area'], ['property_boundary', 'Property boundary'], ['parcel_owner', 'Owner of record'], ['assessor_land_use', 'Assessor land use'], ['assessed_value', 'Assessed value'], ['legal_description', 'Legal description and deed']] },
  { id: 'zoning', label: 'Zoning and land use', fields: [['zoning_district', 'Zoning designation'], ['zoning_conditions', 'Conditions and overlays'], ['zoning_requirements', 'Zoning requirements'], ['setbacks', 'Setbacks (front / side / rear)'], ['height_limit', 'Height limit'], ['min_lot_area', 'Minimum lot area'], ['min_lot_width', 'Minimum lot width'], ['lot_coverage', 'Maximum building coverage'], ['far', 'Floor area ratio (FAR)'], ['density', 'Density'], ['land_use', 'Land-use restrictions'], ['parking_requirement', 'Parking requirement'], ['nearby_rezonings', 'Pending rezonings nearby']] },
  { id: 'environment', label: 'Flood, terrain and environment', fields: [['flood_zone', 'Flood zone'], ['firm_panel', 'FIRM panel'], ['base_flood_elevation', 'Base flood elevation'], ['ground_elevation', 'Ground elevation'], ['solar_summer', 'Sun at noon, June 21'], ['solar_winter', 'Sun at noon, December 21'], ['environmental_notes', 'Environmental notes'], ['existing_structures', 'Existing structures']] },
  { id: 'existing', label: 'Existing building on the site', fields: [['existing_building', 'Selected building'], ['existing_footprint', 'Footprint'], ['existing_height', 'Height'], ['existing_stories', 'Floors'], ['existing_floor_area', 'Floor area']] },
  { id: 'building', label: 'Building', fields: [['occupancy', 'Preliminary occupancy classification'], ['construction_type', 'Construction type'], ['stories', 'Stories'], ['gross_area', 'Gross area'], ['sprinklered', 'Sprinklered'], ['code_edition', 'Building code (adopted edition)'], ['code_references', 'Preliminary code references']] },
  { id: 'team', label: 'Owner and team', fields: [['owner_name', 'Owner'], ['owner_address', 'Owner address'], ['architect_name', 'Architect'], ['architect_address', 'Architect address'], ['pm_name', 'Project manager'], ['contractor_name', 'Contractor'], ['structural_engineer', 'Structural engineer'], ['mep_engineer', 'MEP engineer'], ['civil_engineer', 'Civil engineer']] },
];
export const FIELD_LABEL: Record<string, string> = Object.fromEntries(FIELD_GROUPS.flatMap(g => g.fields.map(f => [f[0], f[1]])));

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const clean = (s: unknown, max = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/* ------------------------------------------------------------------ request URLs */
export function censusUrl(address: string) {
  const q = new URLSearchParams({ address, benchmark: 'Public_AR_Current', vintage: 'Current_Current', layers: 'all', format: 'json' });
  return `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?${q}`;
}
const NFHL = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer';
// Layer 28 = Flood Hazard Zones (S_FLD_HAZ_AR); layer 3 = FIRM Panels (S_FIRM_PAN).
export function femaZoneUrl(lat: number, lng: number) {
  const q = new URLSearchParams({ geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DFIRM_ID', returnGeometry: 'false', f: 'json' });
  return `${NFHL}/28/query?${q}`;
}
export function femaPanelUrl(lat: number, lng: number) {
  const q = new URLSearchParams({ geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'FIRM_PAN,EFF_DATE,PANEL_TYP', returnGeometry: 'false', f: 'json' });
  return `${NFHL}/3/query?${q}`;
}
export function usgsUrl(lat: number, lng: number) {
  const q = new URLSearchParams({ x: String(lng), y: String(lat), wkid: '4326', units: 'Feet', includeDate: 'false' });
  return `https://epqs.nationalmap.gov/v1/json?${q}`;
}
/** A human link for a result (opens the official viewer where there is one). */
export const femaViewer = (lat: number, lng: number) => `https://msc.fema.gov/portal/search?AddressQuery=${encodeURIComponent(`${r6(lat)},${r6(lng)}`)}`;

/* ------------------------------------------------------------------ parsers (tolerant: any odd shape = no value) */
export function parseCensus(j: any) {
  const m = j?.result?.addressMatches?.[0]; if (!m || !m.coordinates) return null;
  const g = m.geographies || {};
  const first = (...names: string[]) => { for (const n of names) { const a = g[n]; if (Array.isArray(a) && a[0]) return a[0]; } return null; };
  const state = first('States'), county = first('Counties'), place = first('Incorporated Places'), csub = first('County Subdivisions'), tract = first('Census Tracts');
  const lat = Number(m.coordinates.y), lng = Number(m.coordinates.x);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  const comps = m.addressComponents || {};
  return {
    matched: clean(m.matchedAddress), lat: r6(lat), lng: r6(lng),
    state: clean(state?.STUSAB || comps.state), stateName: clean(state?.NAME),
    county: clean(county?.NAME), place: clean(place?.BASENAME || place?.NAME), placeName: clean(place?.NAME || place?.BASENAME), countySub: clean(csub?.BASENAME || csub?.NAME),
    tract: clean(tract?.NAME || (tract?.TRACT ? `Census Tract ${tract.TRACT}` : '')), tractGeoid: clean(tract?.GEOID),
    city: clean(comps.city), zip: clean(comps.zip),
  };
}
export function parseFemaZone(j: any) {
  const f = j?.features; if (!Array.isArray(f)) return null; if (!f.length) return { zone: '', subtype: '', sfha: false, bfe: '', none: true };
  const a = f[0].attributes || {};
  const bfe = Number(a.STATIC_BFE);
  return { zone: clean(a.FLD_ZONE), subtype: clean(a.ZONE_SUBTY), sfha: String(a.SFHA_TF).toUpperCase() === 'T', bfe: isFinite(bfe) && bfe > -9000 ? `${bfe} ft` : '', none: false };
}
export function parseFemaPanel(j: any) {
  const f = j?.features; if (!Array.isArray(f) || !f.length) return null;
  const a = f[0].attributes || {}; const eff = a.EFF_DATE ? new Date(Number(a.EFF_DATE)) : null;
  return { panel: clean(a.FIRM_PAN), effective: eff && !isNaN(eff.getTime()) ? eff.toISOString().slice(0, 10) : '' };
}
export function parseUsgs(j: any) { const v = Number(j?.value); return isFinite(v) && v > -10000 ? Math.round(v * 10) / 10 : null; }

/* ------------------------------------------------------------------ sun position (NOAA general solar position) */
const rad = (d: number) => d * Math.PI / 180, deg = (r: number) => r * 180 / Math.PI;
function declination(dayOfYear: number) { const g = 2 * Math.PI / 365 * (dayOfYear - 1); return deg(0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)); }
/** Noon altitude, day length and sunrise/sunset azimuths for a day of the year at a latitude. */
export function sunOn(lat: number, dayOfYear: number) {
  const d = declination(dayOfYear), noonAlt = 90 - Math.abs(lat - d);
  const cosH = (Math.cos(rad(90.833)) - Math.sin(rad(lat)) * Math.sin(rad(d))) / (Math.cos(rad(lat)) * Math.cos(rad(d)));
  const H = Math.acos(Math.max(-1, Math.min(1, cosH))); const dayHours = 2 * deg(H) / 15;
  const riseAz = deg(Math.acos(Math.max(-1, Math.min(1, Math.sin(rad(d)) / Math.cos(rad(lat))))));
  return { noonAltitude: Math.round(noonAlt * 10) / 10, dayHours: Math.round(dayHours * 10) / 10, sunriseAzimuth: Math.round(riseAz), sunsetAzimuth: Math.round(360 - riseAz) };
}
export function solarSummary(lat: number) {
  const s = sunOn(lat, 172), w = sunOn(lat, 355);
  const fmt = (x: ReturnType<typeof sunOn>) => `${x.noonAltitude}° above the horizon at solar noon; ${x.dayHours} h of daylight; rises at ${x.sunriseAzimuth}°, sets at ${x.sunsetAzimuth}° (from north)`;
  return { summer: fmt(s), winter: fmt(w), facing: lat >= 0 ? 'South-facing glazing gets the most winter sun; west glazing gets the hardest summer afternoon sun.' : 'North-facing glazing gets the most winter sun.' };
}

/* ------------------------------------------------------------------ lookup */
type Fetcher = (url: string, init?: { body?: string }) => Promise<any>;
const nowIso = () => new Date().toISOString();
/** Never hand a key back to the browser: tokens in a request URL are blanked in what the lookup returns. */
const hide = (url: string) => String(url || '').replace(/([?&](?:token|api_key|key)=)[^&]+/gi, '$1hidden');

/** Runs every public lookup for an address. Each source is independent; a failed source never blocks the rest. */
/** Values for the "Existing building" fields from one building (used by the lookup and when a member picks a building). */
export function fieldsForBuilding(b: BuildingInfo, parcel: ParcelInfo | undefined | null, at: string, onlyOnParcel = 1): Record<string, FieldValue> {
  const F: Record<string, FieldValue> = {}; const f = (k: string, v: string, src: string, url: string, conf: Conf, kind: SourceKind, note?: string) => { F[k] = { v, src, url, at, conf, by: 'auto', verified: false, kind, ...(note ? { note } : {}) }; };
  const nm = [b.name, b.use].filter(Boolean).join(', ');
  f('existing_building', `${nm || 'Building'}${b.onParcel ? ' on this parcel' : ' next to the site'}`, b.src, b.srcUrl, 'medium', b.kind);
  f('existing_footprint', `${b.footprintSf.toLocaleString('en-US')} sf`, b.src, b.srcUrl, 'medium', b.kind === 'official' ? 'official' : 'estimate', 'Area worked out from the mapped outline.');
  if (b.heightFt) f('existing_height', `${b.heightFt} ft`, b.src, b.srcUrl, b.heightKind === 'website' || b.heightKind === 'official' ? 'medium' : 'low', b.heightKind || 'estimate', b.heightNote);
  if (b.levels) f('existing_stories', String(b.levels), b.src, b.srcUrl, 'medium', b.kind, 'Floor count mapped on the source.');
  // The assessor's heated area is the best floor area when the parcel has exactly one building and this is it.
  if (b.onParcel && onlyOnParcel === 1 && parcel && parcel.heatedSf) f('existing_floor_area', `${Math.round(parcel.heatedSf).toLocaleString('en-US')} sf heated (assessor)`, parcel.src, parcel.url, 'high', 'official', 'Heated area from the county tax record for the whole parcel.');
  else if (b.floorAreaSf) f('existing_floor_area', `${b.floorAreaSf.toLocaleString('en-US')} sf`, b.src, b.srcUrl, 'low', b.floorAreaKind || 'estimate', b.floorAreaNote);
  return F;
}

/** Free public sources only; opts.env is passed to adapters for future free services that need a variable. */
export async function lookupSite(address: string, fetchJson: Fetcher, opts: { env?: Record<string, string> } = {}): Promise<LookupResult> {
  const env = opts.env || {};
  const at = nowIso(); const fields: Record<string, FieldValue> = {}; const sources: SourceResult[] = []; const unavailable: Unavailable[] = [];
  const put = (k: string, v: string, src: string, url: string, conf: Conf, note?: string, kind: SourceKind = 'official') => { if (v) fields[k] = { v, src, url: hide(url), at, conf, by: 'auto', verified: false, kind, ...(note ? { note } : {}) }; };
  const run = async <T>(id: string, name: string, url: string, parse: (j: any) => T) => {
    const t0 = Date.now();
    try { const out = parse(await fetchJson(url)); sources.push({ id, name, url: hide(url), ok: out != null, ms: Date.now() - t0, ...(out == null ? { error: 'no match' } : {}) }); return out; }
    catch (e: any) { sources.push({ id, name, url: hide(url), ok: false, error: clean(e?.message || e, 160), ms: Date.now() - t0 }); return null; }
  };

  const geo = await run('census', SOURCES.census.name, censusUrl(address), parseCensus);
  if (!geo) {
    unavailable.push({ key: 'latitude', reason: 'The Census geocoder could not match this address.', next: 'Check the street address (number, street, city, state, ZIP) or enter the coordinates.' });
    return { fields, site: {}, sources, unavailable, at };
  }
  const cu = censusUrl(address), C = SOURCES.census.name;
  put('project_address', geo.matched, C, cu, 'medium', 'Matched to Census address ranges; the exact lot is not confirmed.');
  put('project_location', [geo.place || geo.city, geo.state].filter(Boolean).join(', '), C, cu, 'high');
  put('latitude', String(geo.lat), C, cu, 'medium', 'Interpolated along the street; may be off by a few lots.');
  put('longitude', String(geo.lng), C, cu, 'medium', 'Interpolated along the street; may be off by a few lots.');
  put('county', [geo.county, geo.stateName].filter(Boolean).join(', '), C, cu, 'high');
  if (geo.place) put('municipality', geo.place, C, cu, 'high');
  else if (geo.countySub) put('municipality', `${geo.countySub} (unincorporated area)`, C, cu, 'medium');
  put('jurisdiction', geo.place ? `${geo.placeName} (incorporated place)` : geo.county ? `${geo.county} (unincorporated, county jurisdiction likely)` : '', C, cu, 'low',
    'Inferred from Census boundaries. Confirm the permitting authority (AHJ) and any extraterritorial jurisdiction with the city or county.');
  put('census_tract', geo.tract, C, cu, 'high');

  // Parcels, zoning and the vicinity, from the jurisdiction's own sources when DrawUp covers it.
  const J = findJurisdiction(geo as any, env); let parcel: ParcelInfo | null = null; let lat = geo.lat, lng = geo.lng, from: 'census' | 'parcel' = 'census';
  const ctx: AdapterCtx = { address, geo: geo as any, at, fetchJson, env, run: (id, name, url, parse) => run(id, name, url, parse), put, gap: (key, reason, next) => { if (!unavailable.some(u => u.key === key)) unavailable.push({ key, reason, next }); } };
  if (J) {
    try { parcel = await J.parcel(ctx); } catch (e: any) { ctx.gap('parcel_id', 'The parcel lookup failed: ' + clean(e?.message || e, 120), 'Try again later.'); }
    if (parcel && parcel.point) {
      [lng, lat] = [parcel.point[0], parcel.point[1]]; from = 'parcel';
      const pn = 'A point inside the county GIS parcel, more exact than the street-range geocode.';
      put('latitude', String(lat), parcel.src, parcel.url, 'high', pn); put('longitude', String(lng), parcel.src, parcel.url, 'high', pn);
    }
  }
  const zoningP = J ? J.zoning(ctx, lat, lng, parcel).catch((e: any) => { ctx.gap('zoning_district', 'The zoning lookup failed: ' + clean(e?.message || e, 120), 'Try again later.'); return {} as { zoning?: ZoningInfo; vicinity?: VicinityInfo }; }) : Promise.resolve({} as { zoning?: ZoningInfo; vicinity?: VicinityInfo });
  const bldP = run('osm_buildings', OSM_SRC, overpassUrl(lat, lng), j => parseOverpass(j, parcel?.rings || []));
  const [zone, panel, elev, zres, blds] = await Promise.all([
    run('fema_zone', SOURCES.fema.name + ' (flood zones)', femaZoneUrl(lat, lng), parseFemaZone),
    run('fema_panel', SOURCES.fema.name + ' (FIRM panels)', femaPanelUrl(lat, lng), parseFemaPanel),
    run('usgs', SOURCES.usgs.name, usgsUrl(lat, lng), parseUsgs),
    zoningP, bldP,
  ]);
  const fv = femaViewer(lat, lng), F = SOURCES.fema.name;
  if (zone && !zone.none) {
    put('flood_zone', `Zone ${zone.zone}${zone.subtype ? ' (' + zone.subtype.toLowerCase() + ')' : ''}${zone.sfha ? ' - Special Flood Hazard Area' : ''}`, F, fv, 'medium', from === 'parcel' ? 'At one point inside the parcel; check the whole parcel on the FIRM.' : 'At the geocoded point only; check the whole parcel on the FIRM.');
    if (zone.bfe) put('base_flood_elevation', zone.bfe, F, fv, 'medium');
  } else if (zone && zone.none) unavailable.push({ key: 'flood_zone', reason: 'FEMA returned no mapped flood zone at this point (the area may be unmapped).', next: 'Check the FEMA Flood Map Service Center for the parcel.' });
  else unavailable.push({ key: 'flood_zone', reason: 'The FEMA flood service did not answer.', next: 'Try again later or check the FEMA Flood Map Service Center.' });
  if (panel) put('firm_panel', `${panel.panel}${panel.effective ? ', effective ' + panel.effective : ''}`, F, fv, 'medium');
  if (elev != null) put('ground_elevation', `${elev} ft (NAVD 88), at ${from === 'parcel' ? 'a point inside the parcel' : 'the geocoded point'}`, SOURCES.usgs.name, usgsUrl(lat, lng), 'medium', 'From 3DEP terrain data; not a survey.');
  else unavailable.push({ key: 'ground_elevation', reason: 'The USGS elevation service did not answer.', next: 'Use a survey or try again later.' });

  const sun = solarSummary(lat); const su = SOURCES.sun.home;
  put('solar_summer', sun.summer, SOURCES.sun.name, su, 'high', 'Calculated by DrawUp from the latitude.', 'estimate'); put('solar_winter', sun.winter, SOURCES.sun.name, su, 'high', 'Calculated by DrawUp from the latitude.', 'estimate');

  // Buildings: the biggest one on the parcel is selected by default; the member can pick another on the page.
  const onParcel = (blds || []).filter(b => b.onParcel);
  const pick = onParcel[0] || (!parcel && blds && blds[0] && Math.hypot(blds[0].rings[0][0][0] - lng, blds[0].rings[0][0][1] - lat) < 0.0006 ? blds[0] : null);
  if (pick) Object.assign(fields, fieldsForBuilding(pick, parcel, at, onParcel.length));
  else if (blds) unavailable.push({ key: 'existing_building', reason: blds.length ? 'OpenStreetMap shows no building on this parcel.' : 'OpenStreetMap shows no buildings mapped here.', next: 'Pick a building on the vicinity map, or enter the existing building from a survey or site visit.' });
  else unavailable.push({ key: 'existing_building', reason: 'The OpenStreetMap building service did not answer.', next: 'Try again later.' });
  if (pick && !pick.heightFt) unavailable.push({ key: 'existing_height', reason: 'OpenStreetMap has no height or floor count for this building.', next: 'Measure it, take it from a 3D file or survey, or enter it here.' });

  // Anything the jurisdiction layer did not answer (or no jurisdiction covers this place): say so instead of guessing.
  const where = geo.county ? `${geo.county}${geo.stateName ? ', ' + geo.stateName : ''}` : 'this jurisdiction';
  const covered = J ? '' : ` DrawUp covers: ${COVERAGE_TEXT}`;
  for (const [key, what] of [['parcel_id', 'parcel records'], ['property_boundary', 'parcel boundaries'], ['site_area', 'parcel area'], ['zoning_district', 'zoning'], ['setbacks', 'setbacks'], ['height_limit', 'height limits'], ['land_use', 'land-use restrictions']] as const)
    if (!fields[key] && !unavailable.some(u => u.key === key)) unavailable.push({ key, reason: J ? `The ${what} lookup for ${where} returned nothing.` : `DrawUp has no connected ${what} source for ${where} yet.${covered}`, next: key === 'property_boundary' || key === 'site_area' ? 'Upload a survey or the county GIS parcel report, then enter it.' : 'Check the zoning ordinance or the city/county GIS, then enter it here.' });
  unavailable.push({ key: 'code_edition', reason: 'The adopted building code edition is not looked up automatically.', next: 'Confirm the adopted edition and local amendments with the AHJ (the ICC adoption map is a starting point).' });

  const site: SiteInfo = { lat, lng, from, boundary: parcel?.rings?.length ? parcel.rings : null, ...(J ? { jurisdiction: J.id } : {}) };
  if (parcel) { const { rings: _r, ...rest } = parcel; site.parcel = rest; }
  if (zres && zres.zoning) site.zoning = zres.zoning;
  if (zres && zres.vicinity) site.vicinity = zres.vicinity;
  if (blds && blds.length) { site.buildings = blds.slice(0, 60); if (pick) site.building = pick.id; }
  return { fields, site, sources, unavailable, at };
}

/** Merge a lookup into saved fields without overwriting anything a member entered or verified. */
export function mergeLookup(saved: Record<string, FieldValue>, found: Record<string, FieldValue>) {
  const out: Record<string, FieldValue> = { ...saved }; const applied: string[] = []; const kept: string[] = [];
  for (const [k, v] of Object.entries(found)) {
    const cur = saved[k];
    if (cur && (cur.by === 'user' || cur.verified) && String(cur.v || '').trim()) { if (String(cur.v) !== String(v.v)) kept.push(k); continue; }
    out[k] = v; applied.push(k);
  }
  return { fields: out, applied, kept };
}

/** Plain values (for documents): { key: 'value' }. */
export const plainValues = (fields: Record<string, FieldValue>) => Object.fromEntries(Object.entries(fields || {}).filter(([, f]) => f && String(f.v ?? '').trim()).map(([k, f]) => [k, String(f.v)]));
