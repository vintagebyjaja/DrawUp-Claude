// Charlotte, NC and Mecklenburg County: parcels, zoning and the Charlotte UDO dimensional standards.
//
// Sources (public, no key; read 2026-11-11):
//   - Parcels and assessor data, all of Mecklenburg County, published on the City of Charlotte GIS:
//       https://gis.charlottenc.gov/arcgis/rest/services/PLN/AllParcelData/MapServer/0  (owner, land use, values, lot size)
//       https://gis.charlottenc.gov/arcgis/rest/services/CountyData/Parcels/MapServer/0 (parcel lines, PID only)
//     Parcel page for people: Mecklenburg County Polaris, https://polaris3g.mecklenburgcountync.gov/pid/<PID>
//   - Zoning map, City of Charlotte (zoning jurisdiction only; the other Mecklenburg towns zone their own land):
//       https://gis.charlottenc.gov/arcgis/rest/services/PLN/Zoning/MapServer/0  (ZoneDes, ZoneClass, ZonePetition, Overlay, Hyperlink)
//   - Pending rezoning petitions: https://gis.charlottenc.gov/arcgis/rest/services/PLN/Rezonings/MapServer/0 (Status 'Pen')
//   - Charlotte Unified Development Ordinance (effective June 1, 2023): https://charlotteudo.org/articles
//
// The UDO tables below were transcribed by hand from the published articles. Each value names its article, table
// and row. Values that could not be read cleanly were left out and are reported as "not transcribed" with the
// article link, never filled in. The PDF edition of the UDO controls over this copy.
//   - Article 4 (N1): Tables 4-1, 4-2, 4-3, from the May 2023 PDF; the same values appear in the 2024 text amendment
//     copy (petition 2024-067) and in the web edition checked 2026-11-11.
//   - Article 5 (N2), Article 6 (CG, CR), Article 12 (RAC, UE, UC): web edition, which says it reflects the text
//     amendment adopted by City Council on February 17, 2025; checked 2026-11-11.
import type { AdapterCtx, DistrictInfo, FrontageTable, Geo, Jurisdiction, ParcelInfo, Ring, Standard, VicinityInfo, ZoningInfo } from './drawup-jurisdiction-util';
import { arcFeatures, boxAround, clean, clipRings, fmtInt, money, ringAreaSf, ringCentroid, sqlSafe } from './drawup-jurisdiction-util';

const GIS = 'https://gis.charlottenc.gov/arcgis/rest/services';
export const CLT = {
  parcels: `${GIS}/PLN/AllParcelData/MapServer/0`,
  lines: `${GIS}/CountyData/Parcels/MapServer/0`,
  zoning: `${GIS}/PLN/Zoning/MapServer/0`,
  rezonings: `${GIS}/PLN/Rezonings/MapServer/0`,
  udo: 'https://charlotteudo.org/articles',
  polaris: (pid: string) => `https://polaris3g.mecklenburgcountync.gov/pid/${encodeURIComponent(pid)}`,
  archived: 'https://www.charlottenc.gov/Growth-and-Development/Planning-and-Development/Zoning/Zoning-Ordinance',
};
const SRC = {
  parcels: 'Mecklenburg County parcel and assessor records (City of Charlotte GIS)',
  zoning: 'City of Charlotte zoning map (GIS)',
  rezonings: 'City of Charlotte pending rezonings (GIS)',
  udo: 'Charlotte Unified Development Ordinance',
};
const UDO_AT = 'Transcribed from the published UDO and checked Nov 11, 2026. The PDF edition of the UDO controls.';

const ART: Record<string, [string, string]> = {
  4: ['Article 4. Neighborhood 1 Zoning Districts', 'https://charlotteudo.org/articles/part-iii-neighborhood-zoning-districts/article-4-neighborhood-1-zoning-districts'],
  5: ['Article 5. Neighborhood 2 Zoning Districts', 'https://charlotteudo.org/articles/part-iii-neighborhood-zoning-districts/article-5-neighborhood-2-zoning-districts'],
  6: ['Article 6. Commercial Zoning Districts: CG, CR', 'https://charlotteudo.org/articles/part-iv-employment-zoning-districts/article-6-commercial-zoning-districts-cg-cr'],
  7: ['Article 7. Campus Zoning Districts: IC-1, IC-2, OFC, OG, RC', 'https://charlotteudo.org/articles/part-iv-employment-zoning-districts/article-7-campus-zoning-districts-ic-1-ic-2-ofc-og-rc'],
  8: ['Article 8. Manufacturing & Logistics Zoning Districts: ML-1, ML-2', 'https://charlotteudo.org/articles/part-iv-employment-zoning-districts/article-8-manufacturing-logistics-zoning-districts-ml-1-ml-2'],
  9: ['Article 9. Innovation Mixed-Use Zoning District: IMU', 'https://charlotteudo.org/articles/part-iv-employment-zoning-districts/article-9-innovation-mixed-use-zoning-district-imu'],
  10: ['Article 10. Neighborhood Center Zoning District: NC', 'https://charlotteudo.org/articles/part-v-centers-zoning-districts/article-10-neighborhood-center-zoning-district-nc'],
  11: ['Article 11. Community Activity Center Zoning Districts', 'https://charlotteudo.org/articles/part-v-centers-zoning-districts/article-11-community-activity-center-zoning-districts'],
  12: ['Article 12. Regional Activity Center Zoning Districts', 'https://charlotteudo.org/articles/part-v-centers-zoning-districts/article-12-regional-activity-center-zoning-districts'],
  13: ['Article 13. Transit Oriented Development Zoning Districts', 'https://charlotteudo.org/articles/part-v-centers-zoning-districts/article-13-transit-oriented-development-zoning-districts'],
  14: ['Article 14. Special Purpose & Overlay Zoning Districts', 'https://charlotteudo.org/articles/part-vi-special-purpose-overlay-zoning-districts/article-14-special-purpose-overlay-zoning-districts'],
  15: ['Article 15. Uses', 'https://charlotteudo.org/articles/part-vii-uses/article-15-uses'],
  16: ['Article 16. General Development Regulations', 'https://charlotteudo.org/articles/part-viii-general-development-zoning-standards/article-16-general-development-regulations'],
  19: ['Article 19. Off-Street Vehicle & Bicycle Parking', 'https://charlotteudo.org/articles/part-viii-general-development-zoning-standards/article-19-off-street-vehicle-bicycle-parking'],
};

/** UDO base districts, the article that sets their standards. */
const BASE_ARTICLE: Record<string, number> = {
  'N1-A': 4, 'N1-B': 4, 'N1-C': 4, 'N1-D': 4, 'N1-E': 4, 'N1-F': 4, 'N2-A': 5, 'N2-B': 5, 'N2-C': 5, CG: 6, CR: 6,
  'IC-1': 7, 'IC-2': 7, OFC: 7, OG: 7, RC: 7, 'ML-1': 8, 'ML-2': 8, IMU: 9, NC: 10, 'CAC-1': 11, 'CAC-2': 11,
  RAC: 12, UE: 12, UC: 12, 'TOD-UC': 13, 'TOD-NC': 13, 'TOD-CC': 13, 'TOD-TR': 13, MHP: 14,
};
/** Overlay names as Article 14 lists them. Codes not listed here are shown as the map writes them. */
const OVERLAYS: Record<string, [string, string]> = {
  HDO: ['Historic District Overlay', 'Section 14.1'], 'HDO-S': ['Streetside Historic District Overlay', 'Section 14.2'],
  NCO: ['Neighborhood Character Overlay', 'Section 14.3'], RIO: ['Residential Infill Overlay', 'Section 14.4'],
  CCO: ['Cottage Court Overlay', 'Section 14.5'], MHO: ['Manufactured Home Overlay', 'Section 14.6'],
  ANDO: ['Airport Noise Disclosure Overlay', 'Section 14.8'],
};

/* ------------------------------------------------------------------ UDO tables (see header for provenance) */
const N1 = ['N1-A', 'N1-B', 'N1-C', 'N1-D', 'N1-E', 'N1-F'];
const T4 = {
  lotAreaRes: [10000, 8000, 6000, 3500, 3000, 3000], lotAreaNon: 12000,
  lotWidthRes: [70, 60, 50, 40, 30, 30], lotWidthNon: 70,
  front: [27, 27, 17, 17, 10, 17], corner: [13.5, 13.5, 10, 10, 10, 10], side: 5, rear: [40, 35, 30, 25, 20, 20],
  heightRes: [48, 48, 40, 40, 40, 48], heightNon: 48,
};
const FRONTAGES = ['Uptown Signature', 'Main Street', 'Linear Park', '4-5 Lane Avenue/Boulevard', '6+ Lane Avenue/Boulevard', '2-3 Lane Avenue', 'Transit Station, Off-Street Public Path, Public Park', 'Uptown Primary', 'Other – Primary', 'Uptown Secondary', 'Secondary', 'Parkway (from ROW)', 'Limited Access (from ROW)'];
const _ = null;
// frontage setback lines in feet, in FRONTAGES order; null = row not in the table or not read cleanly
const SETBACK_LINES: Record<string, (number | null)[]> = {
  'N2-A': [24, 24, 36, 24, 30, 24, 20, 20, 20, _, 20, 20, 20],
  'N2-B': [24, 24, 36, 24, 30, 20, 10, 20, 20, _, 20, 20, 20],
  'N2-C': [24, 24, 36, 20, 24, 20, 5, 20, 20, _, 16, 20, 10],
  CG: [24, 24, 36, 36, 40, 36, 20, 20, 36, 16, _, 20, 20],
  CR: [24, 24, 36, 36, 40, 36, 20, 20, 36, 16, _, 20, 20],
  RAC: [24, 24, 36, 20, 24, 20, 5, 20, 20, 16, _, 20, 10],
  UE: [24, 24, 36, 20, 24, 20, 5, 20, 20, 16, _, 20, 10],
  UC: [24, 24, 36, 20, 24, 20, 5, 20, 20, 16, _, 20, 10],
};
// build-to zones (ft from the setback line) and minimum build-to percentages, where read cleanly
const BTZ_ROWS = ['Main Street', '4-5 Lane Avenue/Boulevard', '6+ Lane Avenue/Boulevard', '2-3 Lane Avenue', 'Transit Station, Off-Street Public Path, Public Park', 'Other – Primary'];
const BTZ: Record<string, Record<string, [string, number]>> = {
  RAC: Object.fromEntries(BTZ_ROWS.map(r => [r, ['0–20', 80]])),
  UE: Object.fromEntries(BTZ_ROWS.map(r => [r, ['0–20', 80]])),
  UC: Object.fromEntries(BTZ_ROWS.map(r => [r, ['0–10', r === 'Main Street' ? 100 : 80]])),
  CG: { 'Main Street': ['0–20', 80] }, CR: { 'Main Street': ['0–20', 80] },
};

function standardsFor(base: string, lotSf?: number): { standards: Standard[]; frontage?: FrontageTable; notes: string[]; gaps: [string, string][] } {
  const S: Standard[] = [], notes: string[] = [], gaps: [string, string][] = [];
  const art = BASE_ARTICLE[base]; const A = ART[art] || ['', ''];
  const add = (key: string, label: string, value: string, ref: string, applies?: string, note?: string) => S.push({ key, label, value, ref: `UDO ${ref}`, ...(applies ? { applies } : {}), ...(note ? { note } : {}) });
  const ft = (n: number) => `${n} ft`;
  const i = N1.indexOf(base);
  if (i >= 0) {
    add('min_lot_area', 'Minimum lot area', `${fmtInt(T4.lotAreaRes[i])} sf residential; ${fmtInt(T4.lotAreaNon)} sf nonresidential or mixed-use`, 'Article 4, Table 4-1, rows A-B', undefined, 'Applies to the parcel, not to individual sublots.');
    add('min_lot_width', 'Minimum lot width', `${T4.lotWidthRes[i]} ft residential${base === 'N1-F' ? ' (50 ft for multi-family)' : ''}; ${T4.lotWidthNon} ft nonresidential or mixed-use`, 'Article 4, Table 4-1, rows C-D');
    const cov = lotSf ? (lotSf >= 10000 ? '40%' : '50%') : '';
    add('lot_coverage', 'Maximum building coverage', cov ? `${cov} (this lot is ${fmtInt(lotSf!)} sf)` : '40% on lots of 10,000 sf or more; 50% on lots under 10,000 sf', 'Article 4, Table 4-1, row E', cov ? 'Table 4-1 sets 40% for lots of 10,000 sf or more and 50% for smaller lots.' : undefined);
    add('front', 'Front setback', `${ft(T4.front[i])} from the street right-of-way`, 'Article 4, Table 4-2, row A', undefined, 'A front setback on a recorded plat replaces this; an established blockface can allow a smaller one (not under 10 ft). Network-required private streets: measured from back of curb, plus 14 ft.');
    add('corner_side', 'Corner side setback', `${ft(T4.corner[i])} from the street right-of-way`, 'Article 4, Table 4-2, row B', undefined, 'Along an arterial street the front setback applies instead.');
    add('side', 'Side setback', ft(T4.side), 'Article 4, Table 4-2, row C');
    add('rear', 'Rear setback', ft(T4.rear[i]), 'Article 4, Table 4-2, row D');
    add('height', 'Maximum height', `${ft(T4.heightRes[i])} residential; ${ft(T4.heightNon)} nonresidential or mixed-use`, 'Article 4, Table 4-3, rows A-B', undefined, 'Height can rise 1 ft for each extra foot of side or rear setback, up to 65 ft. Duplexes and triplexes also have a 45-degree height plane at the side setback (Section 4.3.D). FAA Part 77 limits can apply.');
    gaps.push(['far', `Article 4's dimensional tables (4-1 to 4-3) set no floor area ratio for ${base}.`], ['density', `Article 4's dimensional tables set no dwelling-units-per-acre limit for ${base}; the housing types allowed come from Article 15 (Uses) and the lot sizes above.`]);
  } else if (base === 'N2-A' || base === 'N2-B' || base === 'N2-C') {
    if (base !== 'N2-C') {
      add('min_lot_area', 'Minimum lot area', base === 'N2-A' ? '3,000 sf per building (single-family, duplex, triplex, quadraplex, MF-A); 12,000 sf nonresidential or mixed-use' : '3,000 sf per building (single-family, duplex, triplex, quadraplex, MF-A); 12,000 sf for MF-S; 12,000 sf nonresidential or mixed-use', 'Article 5, Table 5-1, rows A-B', undefined, 'Multi-dwelling developments add up the minimum for each building.');
      add('min_lot_width', 'Minimum lot width', base === 'N2-A' ? '50 ft for MF-A; 80 ft for a multi-dwelling development; 70 ft nonresidential or mixed-use' : '50 ft for MF-A; 80 ft for a multi-dwelling development or MF-S; 80 ft nonresidential or mixed-use', 'Article 5, Table 5-1, rows C-D');
      add('lot_coverage', 'Maximum building coverage', base === 'N2-A' ? '50%' : '60%', 'Article 5, Table 5-1, row E');
    } else gaps.push(['min_lot_area', 'The N2-C lot standards (Table 5-1) are not transcribed into DrawUp yet.'], ['min_lot_width', 'The N2-C lot standards (Table 5-1) are not transcribed into DrawUp yet.'], ['lot_coverage', 'The N2-C building coverage (Table 5-1, row E) is not transcribed into DrawUp yet.']);
    add('side', 'Side setback', '5 ft', 'Article 5, Table 5-2, row D');
    add('rear', 'Rear setback', base === 'N2-A' ? '20 ft' : '10 ft; 20 ft where the lot abuts a Neighborhood 1 Place Type', 'Article 5, Table 5-2, row E');
    add('front', 'Front setback', 'Set by the street frontage type (see the frontage table), measured from the future back of curb', 'Article 5, Table 5-2, row A');
    add('height', 'Maximum height', base === 'N2-C' ? '65 ft' : '48 ft', 'Article 5, Table 5-3, rows A-B', undefined, base === 'N2-C' ? 'Within 200 ft of residential or vacant land in a Neighborhood 1 Place Type: 50 ft in the first 100 ft and 65 ft from 100 to 200 ft.' : 'Height can rise 1 ft for each extra foot of side or rear setback, up to 65 ft. Within 200 ft of a Neighborhood 1 Place Type the first 100 ft is limited to 50 ft.');
    gaps.push(['far', 'Article 5\'s dimensional tables set no floor area ratio.'], ['density', 'Article 5\'s dimensional tables set no dwelling-units-per-acre limit; housing types come from Article 15 (Uses).']);
    notes.push('Build-to zone columns for Table 5-2 are not transcribed into DrawUp yet; check the article.');
  } else if (base === 'CG' || base === 'CR') {
    add('min_lot_width', 'Minimum lot width', '50 ft', 'Article 6, Table 6-1, row A');
    add('front', 'Front setback', 'Set by the street frontage type (see the frontage table), measured from the future back of curb', 'Article 6, Table 6-2, row A', undefined, 'With no parking or maneuvering between the building and the street, the CAC-1 setback line may be used instead.');
    add('side', 'Side setback', '10 ft', 'Article 6, Table 6-2, row D');
    add('rear', 'Rear setback', '20 ft', 'Article 6, Table 6-2, row E');
    gaps.push(['height_limit', `The ${base} height limits (Table 6-3) are not transcribed into DrawUp yet.`], ['min_lot_area', 'Table 6-1 sets a minimum lot width but no minimum lot area.'], ['far', 'Article 6\'s dimensional tables set no floor area ratio.'], ['lot_coverage', 'Article 6\'s dimensional tables set no building coverage limit.']);
  } else if (base === 'RAC' || base === 'UE' || base === 'UC') {
    const minH = { RAC: 40, UE: 24, UC: 40 }[base], maxH = { RAC: '150 ft', UE: '150 ft', UC: 'No maximum' }[base];
    add('front', 'Front setback', 'Set by the street frontage type (see the frontage table), with a build-to zone', 'Article 12, Table 12-1, rows A-C');
    add('side', 'Side setback', '0 ft; 10 ft where the lot abuts a Neighborhood 1 Place Type', 'Article 12, Table 12-1, row D');
    add('rear', 'Rear setback', '0 ft; 20 ft where the lot abuts a Neighborhood 1 Place Type', 'Article 12, Table 12-1, row E');
    add('height', 'Maximum height', maxH, 'Article 12, Table 12-2, row B', undefined, 'Within 200 ft of residential or vacant land in a Neighborhood 1 Place Type: 50 ft in the first 100 ft and 65 ft from 100 to 200 ft. FAA Part 77 limits can apply. A bonus height (Section 16.3, Table 12-2 row C) is not transcribed.');
    add('min_height', 'Minimum height', `${minH} ft`, 'Article 12, Table 12-2, row A', undefined, 'Lots of half an acre or less and buildings of 2,000 sf or less are exempt.');
    gaps.push(['min_lot_area', 'Article 12 sets no minimum lot area or width table.'], ['far', 'Article 12\'s dimensional tables set no floor area ratio.'], ['lot_coverage', 'Article 12\'s dimensional tables set no building coverage limit.'], ['density', 'Article 12\'s dimensional tables set no density limit.']);
  } else if (art) {
    gaps.push(['setbacks', `The ${base} dimensional tables (${A[0]}) are not transcribed into DrawUp yet.`], ['height_limit', `The ${base} height limits (${A[0]}) are not transcribed into DrawUp yet.`], ['min_lot_area', `The ${base} lot standards (${A[0]}) are not transcribed into DrawUp yet.`]);
  }
  let frontage: FrontageTable | undefined;
  const lines = SETBACK_LINES[base];
  if (lines) {
    const tn = art === 5 ? '5-2' : art === 6 ? '6-2' : '12-1'; const btz = BTZ[base] || {};
    const rows = FRONTAGES.map((f, k) => lines[k] == null ? null : [f, `${lines[k]} ft`, btz[f] ? `${btz[f][0]} ft` : '', btz[f] ? `${btz[f][1]}%` : '']).filter(Boolean) as string[][];
    frontage = { title: `${base} front setback by street frontage type`, ref: `UDO Article ${art}, Table ${tn}, rows A-C`, cols: ['Frontage type', 'Setback line', 'Build-to zone', 'Build to at least'], rows,
      note: 'Measured from the future back of curb (Parkway and Limited Access from the right-of-way). The frontage type of each street comes from the Charlotte Streets Map; a lot with several frontages has a setback on each. A blank build-to cell means it is not required there or not transcribed.' };
  }
  return { standards: S, frontage, notes, gaps };
}

/* ------------------------------------------------------------------ district codes from the zoning map */
export function parseDistrict(attrs: any): DistrictInfo {
  const raw = clean(attrs?.ZoneDes, 60); const up = raw.toUpperCase();
  const m = up.match(/^(N1-[A-F]|N2-[A-C]|CAC-[12]|TOD-(?:UC|NC|CC|TR)|IC-[12]|ML-[12]|NC|CG|CR|RAC|UE|UC|IMU|OFC|OG|RC|MHP)(?![A-Z0-9]|-[A-Z0-9])/);
  const base = m ? m[1] : '';
  const overlays: DistrictInfo['overlays'] = []; const seen = new Set<string>();
  const addOv = (code: string) => { const c = clean(code, 20).toUpperCase(); if (!c || c === 'NONE' || c === 'NULL' || c === 'CD' || c === 'EX' || c === 'O' || seen.has(c)) return; seen.add(c); const o = OVERLAYS[c]; overlays.push({ code: c, name: o ? o[0] : c, ...(o ? { ref: `UDO Article 14, ${o[1]}` } : {}) }); };
  (up.match(/\(([A-Z-]+)\)/g) || []).forEach(t => addOv(t.replace(/[()]/g, '')));
  const ov = clean(attrs?.Overlay, 40); if (ov && !/^none$/i.test(ov)) addOv(/airport noise/i.test(ov) ? 'ANDO' : ov);
  const kind: DistrictInfo['kind'] = up === 'R/W' ? 'right_of_way' : base ? 'base' : up ? 'legacy' : 'unknown';
  const petition = clean(attrs?.ZonePetition, 20); const link = clean(attrs?.Hyperlink, 300);
  const rz = Number(attrs?.RezoneDate); const rezoned = isFinite(rz) && rz > 0 ? new Date(rz).toISOString().slice(0, 10) : '';
  const art = base ? BASE_ARTICLE[base] : 0;
  const title = (s: string) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  return {
    raw, base, name: clean(attrs?.ZoneClass) ? title(clean(attrs.ZoneClass)) : '', kind,
    conditional: /\(?CD[)0]|\bCD\b|-CD\b/.test(up), exception: /\bEX\b|\(EX\)|EX\(/.test(up),
    ...(petition && petition.toLowerCase() !== 'null' ? { petition } : {}), ...(/^https:\/\/www\.charlottenc\.gov\//.test(link) ? { petitionUrl: link } : {}),
    ...(rezoned ? { rezoned } : {}), overlays, ...(art ? { article: ART[art][0], articleUrl: ART[art][1] } : {}),
  };
}

/* ------------------------------------------------------------------ parcels */
const q = (base: string, p: Record<string, string>) => `${base}/query?${new URLSearchParams({ f: 'json', ...p })}`;
const PARCEL_FIELDS = 'parcelid,location_address,owner1lastname,owner1firstname,owner2lastname,owner2firstname,billingaddress,zipcode,state,city,landsize,landunitdescription,landusecode,landuse_description,legaldescription,deed_book,deed_page,yearid,totallandvalue,totalbuildingvalue,totalmarketvalue,num_heatedarea,total_living_units,saledate,saleprice,tax_mundist,gis1,gis2';
export const parcelByAddressUrl = (street: string) => q(CLT.parcels, { where: `location_address LIKE '${sqlSafe(street)} %'`, outFields: PARCEL_FIELDS, returnGeometry: 'true', outSR: '4326', geometryPrecision: '6', resultRecordCount: '5' });
export const parcelByPointUrl = (lat: number, lng: number) => q(CLT.parcels, { geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: PARCEL_FIELDS, returnGeometry: 'true', outSR: '4326', geometryPrecision: '6' });

export function parseParcel(f: any, how: 'address' | 'point'): ParcelInfo | null {
  const a = f?.attributes || {}; const id = clean(a.parcelid, 20); if (!id) return null;
  const rings: Ring[] = Array.isArray(f.geometry?.rings) ? f.geometry.rings.filter((r: any) => Array.isArray(r) && r.length >= 3).map((r: any) => r.map((p: any) => [Number(p[0]), Number(p[1])])) : [];
  const unit = clean(a.landunitdescription).toUpperCase(); const size = Number(a.landsize);
  let lotSf: number | undefined, lotFrom = '';
  if (isFinite(size) && size > 0) { lotSf = /ACRE/.test(unit) ? size * 43560 : /SQ|FEET|FT/.test(unit) ? size : undefined; if (lotSf) lotFrom = 'assessor land size'; }
  if (!lotSf && rings.length) { lotSf = Math.round(rings.reduce((s, r) => s + ringAreaSf(r), 0)); lotFrom = 'GIS parcel outline'; }
  const lat = Number(a.gis2), lng = Number(a.gis1);
  const point: [number, number] | undefined = isFinite(lat) && isFinite(lng) && lat > 30 && lat < 40 && lng < -75 && lng > -85 ? [lng, lat] : rings[0] ? ringCentroid(rings[0]) : undefined;
  const name = (l: any, fN: any) => [clean(fN), clean(l)].filter(s => s && s.toLowerCase() !== 'null').join(' ');
  const owners = [name(a.owner1lastname, a.owner1firstname), name(a.owner2lastname, a.owner2firstname)].filter(Boolean);
  const sale = Number(a.saledate); const saleP = Number(a.saleprice);
  const deed = clean(a.deed_book) && clean(a.deed_page) && clean(a.deed_book).toLowerCase() !== 'null' ? `Deed book ${clean(a.deed_book)}, page ${clean(a.deed_page)}` : '';
  const n = (x: any) => { const v = Number(x); return isFinite(v) && v > 0 ? v : undefined; };
  return {
    id, url: CLT.polaris(id), src: SRC.parcels, srcUrl: `${CLT.parcels}`, conf: how === 'address' ? 'high' : 'medium', how,
    address: clean(a.location_address), owner: owners.join(' & '), ownerMail: [clean(a.billingaddress), clean(a.city), clean(a.state), clean(a.zipcode)].filter(s => s && s.toLowerCase() !== 'null').join(', '),
    landUse: clean(a.landuse_description) ? `${clean(a.landuse_description)}${clean(a.landusecode) ? ' (' + clean(a.landusecode) + ')' : ''}` : '',
    lotSf: lotSf ? Math.round(lotSf) : undefined, lotAcres: lotSf ? Math.round(lotSf / 43560 * 1000) / 1000 : undefined, lotFrom,
    legal: clean(a.legaldescription), deed, assessedYear: n(a.yearid), landValue: n(a.totallandvalue), buildingValue: n(a.totalbuildingvalue), totalValue: n(a.totalmarketvalue),
    heatedSf: n(a.num_heatedarea), units: n(a.total_living_units),
    lastSale: isFinite(sale) && sale > 0 ? `${new Date(sale).toISOString().slice(0, 10)}${isFinite(saleP) && saleP > 0 ? ' for ' + money(saleP) : ''}` : '',
    town: clean(a.tax_mundist), point, rings,
  };
}

/* ------------------------------------------------------------------ zoning + vicinity */
export const zoningAtUrl = (lat: number, lng: number) => q(CLT.zoning, { geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'ZoneDes,ZoneClass,ZonePetition,Overlay,RezoneDate,Hyperlink', returnGeometry: 'false' });
const env = (b: number[]) => ({ geometry: b.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outSR: '4326', returnGeometry: 'true', geometryPrecision: '6' });
// maxAllowableOffset is in the output units (degrees): 0.00002 deg is about 7 ft, plenty for a vicinity map.
export const zoningNearUrl = (b: number[]) => q(CLT.zoning, { ...env(b), outFields: 'ZoneDes', maxAllowableOffset: '0.00002', resultRecordCount: '200' });
export const linesNearUrl = (b: number[]) => q(CLT.lines, { ...env(b), outFields: 'PID', maxAllowableOffset: '0.00001', resultRecordCount: '600' });
export const rezoningsNearUrl = (b: number[]) => q(CLT.rezonings, { ...env(b), where: "Status='Pen'", outFields: 'Petition,ExistZone,ReqZone,Acres,Received,Hyperlink', maxAllowableOffset: '0.00002', resultRecordCount: '50' });
const ringsOf = (f: any): Ring[] => Array.isArray(f?.geometry?.rings) ? f.geometry.rings.map((r: any) => r.map((p: any) => [Number(p[0]), Number(p[1])])) : [];

const VICINITY_HALF_FT = 650; // the vicinity map shows about 1,300 ft across

export const CHARLOTTE: Jurisdiction = {
  id: 'nc-charlotte',
  label: 'Charlotte, NC (zoning, UDO limits and pending rezonings) and all of Mecklenburg County, NC (parcels and assessor data)',
  covers: (geo: Geo) => geo.state === 'NC' && /^mecklenburg/i.test(geo.county),

  async parcel(ctx: AdapterCtx) {
    const street = ctx.geo.matched.split(',')[0] || '';
    const [byAddr, byPoint] = await Promise.all([
      /^\d+\s+\S/.test(street) ? ctx.run('meck_parcel', SRC.parcels + ' (by address)', parcelByAddressUrl(street), j => arcFeatures(j)) : Promise.resolve(null),
      ctx.run('meck_parcel_pt', SRC.parcels + ' (at the map point)', parcelByPointUrl(ctx.geo.lat, ctx.geo.lng), j => arcFeatures(j)),
    ]);
    const ids = new Set((byAddr || []).map((f: any) => clean(f?.attributes?.parcelid)));
    // one parcel at the address wins; several (condos, split lots) -> the one under the map point if it is one of them
    let pick: ParcelInfo | null = null;
    if (byAddr && byAddr.length === 1) pick = parseParcel(byAddr[0], 'address');
    else if (byAddr && byAddr.length > 1 && byPoint && byPoint[0] && ids.has(clean(byPoint[0].attributes?.parcelid))) pick = parseParcel(byPoint[0], 'address');
    else if (byPoint && byPoint.length) pick = parseParcel(byPoint[0], 'point');
    if (!pick) { ctx.gap('parcel_id', 'No Mecklenburg County parcel matched this address or its map point.', 'Search the address in Polaris (polaris3g.mecklenburgcountync.gov) and enter the parcel ID.'); return null; }
    const P = pick, s = P.src, u = P.url;
    const howNote = P.how === 'address' ? 'Matched by street address.' : 'Found at the map point, not by the address; confirm it is the right lot.';
    ctx.put('parcel_id', P.id, s, u, P.conf, howNote);
    if (P.lotSf) ctx.put('site_area', `${fmtInt(P.lotSf)} sf (${P.lotAcres} ac)`, s, u, 'medium', `From the ${P.lotFrom}; not a survey.`);
    if (P.rings && P.rings.length) ctx.put('property_boundary', `County GIS parcel outline (${P.rings.reduce((a, r) => a + r.length - 1, 0)} points), shown on the vicinity map. Not a survey.`, s, u, 'medium', 'GIS parcel lines are approximate; use a boundary survey for design.');
    if (P.owner) ctx.put('parcel_owner', P.owner + (P.ownerMail ? ` (mailing: ${P.ownerMail})` : ''), s, u, 'high', 'Owner of record from the county tax roll.');
    if (P.landUse) ctx.put('assessor_land_use', P.landUse, s, u, 'high', 'Assessor land-use code, not the zoning.');
    if (P.totalValue) ctx.put('assessed_value', `${money(P.totalValue)} total${P.landValue ? ' (land ' + money(P.landValue) : ''}${P.buildingValue ? ', building ' + money(P.buildingValue) + ')' : P.landValue ? ')' : ''}${P.assessedYear ? ', tax year ' + P.assessedYear : ''}`, s, u, 'high');
    if (P.legal || P.deed) ctx.put('legal_description', [P.legal, P.deed].filter(Boolean).join('; '), s, u, 'high');
    return P;
  },

  async zoning(ctx: AdapterCtx, lat: number, lng: number, parcel: ParcelInfo | null) {
    const town = (parcel?.town || '').toUpperCase();
    const inCharlotte = town ? /CHARLOTTE/.test(town) : /^charlotte$/i.test(ctx.geo.place);
    const box = boxAround(lat, lng, VICINITY_HALF_FT);
    const jur = { id: 'nc-charlotte', name: 'City of Charlotte', ordinance: 'Charlotte Unified Development Ordinance (effective June 1, 2023)', ordinanceUrl: CLT.udo, mapName: SRC.zoning, mapUrl: CLT.zoning };
    const [at, zones, lines, rez] = await Promise.all([
      ctx.run('clt_zoning', SRC.zoning, zoningAtUrl(lat, lng), j => arcFeatures(j)),
      ctx.run('clt_zoning_near', SRC.zoning + ' (vicinity)', zoningNearUrl(box), j => arcFeatures(j)),
      ctx.run('meck_lines', 'Mecklenburg County parcel lines (City of Charlotte GIS)', linesNearUrl(box), j => arcFeatures(j)),
      ctx.run('clt_rezonings', SRC.rezonings, rezoningsNearUrl(box), j => arcFeatures(j)),
    ]);
    const vicinity: VicinityInfo = {
      bbox: box, src: `${SRC.zoning}; Mecklenburg County parcel lines; ${SRC.rezonings}`,
      zones: (zones || []).map((f: any) => ({ code: clean(f.attributes?.ZoneDes, 40), rings: clipRings(ringsOf(f), box) })).filter(z => z.rings.length),
      parcels: (lines || []).map((f: any) => clipRings(ringsOf(f), box)).filter(r => r.length).slice(0, 600),
      rezonings: (rez || []).map((f: any) => { const a = f.attributes || {}; const d = Number(a.Received); return { petition: clean(a.Petition, 20), existing: clean(a.ExistZone, 40), requested: clean(a.ReqZone, 40), ...(isFinite(+a.Acres) && +a.Acres > 0 ? { acres: Math.round(+a.Acres * 100) / 100 } : {}), ...(isFinite(d) && d > 0 ? { received: new Date(d).toISOString().slice(0, 10) } : {}), ...(/^https:\/\/www\.charlottenc\.gov\//.test(clean(a.Hyperlink, 300)) ? { url: clean(a.Hyperlink, 300) } : {}), rings: clipRings(ringsOf(f), box) }; }).filter(r => r.petition),
    };
    if (vicinity.rezonings.length) {
      ctx.put('nearby_rezonings', vicinity.rezonings.slice(0, 6).map(r => `${r.petition}: ${r.existing || '?'} to ${r.requested || '?'}${r.acres ? ` (${r.acres} ac)` : ''}`).join('; ') + (vicinity.rezonings.length > 6 ? `; and ${vicinity.rezonings.length - 6} more` : ''), SRC.rezonings, CLT.rezonings, 'high', 'City of Charlotte petitions pending within about 650 ft of the site. A rezoning can change what neighbors may build.');
    } else if (rez && inCharlotte) ctx.put('nearby_rezonings', 'No City of Charlotte rezoning pending within about 650 ft', SRC.rezonings, CLT.rezonings, 'high');

    if (!inCharlotte && town) {
      const t = town.replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase());
      for (const k of ['zoning_district', 'zoning_requirements', 'setbacks', 'height_limit', 'min_lot_area', 'lot_coverage', 'land_use', ...(vicinity.rezonings.length ? [] : ['nearby_rezonings'])])
        ctx.gap(k, `This parcel is in ${t}, which zones its own land. DrawUp covers zoning for the City of Charlotte only so far.`, `Check the ${t} zoning map and ordinance, then enter it here.`);
      return { vicinity };
    }
    const f = at && at[0];
    if (!f) {
      for (const k of ['zoning_district', 'setbacks', 'height_limit'])
        ctx.gap(k, at ? 'The Charlotte zoning map has no district at this point.' : 'The Charlotte zoning map did not answer.', at ? 'Check the parcel on the Charlotte zoning map; it may be right-of-way or outside the city\'s zoning area.' : 'Try the lookup again later.');
      return { vicinity };
    }
    const d = parseDistrict(f.attributes);
    const zi: ZoningInfo = { jurisdiction: jur, district: d, standards: [], notes: [], transcribed: UDO_AT };
    const zurl = d.petitionUrl || CLT.zoning; const pointNote = parcel ? 'Read at a point inside the parcel; if the lot sits on a district line, check the vicinity map.' : 'Read at the geocoded street point, not inside a confirmed parcel.';
    ctx.put('zoning_district', `${d.raw}${d.name ? ' (' + d.name + ')' : ''}`, SRC.zoning, CLT.zoning, parcel ? 'high' : 'medium', pointNote);
    const cond: string[] = [];
    if (d.conditional) cond.push(`Conditional district${d.petition ? ' from rezoning petition ' + d.petition : ''}: the approved site plan and its conditions apply on top of (and can be stricter than) the base district limits.`);
    if (d.exception) cond.push('Rezoned with exceptions (EX): the approved plan can change the base limits.');
    if (d.overlays.length) cond.push('Overlays: ' + d.overlays.map(o => `${o.name}${o.code !== o.name ? ' (' + o.code + ')' : ''}${o.ref ? ', ' + o.ref : ''}`).join('; ') + '.');
    if (d.petition && !d.conditional) cond.push(`Last rezoned by petition ${d.petition}${d.rezoned ? ' (' + d.rezoned + ')' : ''}.`);
    if (cond.length) ctx.put('zoning_conditions', cond.join(' '), SRC.zoning, zurl, 'high', d.petitionUrl ? 'The petition page has the approved site plan.' : undefined);
    ctx.put('land_use', d.overlays.length ? d.overlays.map(o => o.name).join('; ') : 'No overlay district on the zoning map at this point', SRC.zoning, CLT.zoning, 'high', 'Overlays only. Allowed uses come from UDO Article 15 for the district.');

    if (d.kind === 'right_of_way') {
      for (const k of ['setbacks', 'height_limit']) ctx.gap(k, 'The zoning map shows street right-of-way at this point, not a zoned lot.', 'Check the parcel on the Charlotte zoning map.');
      zi.notes.push('Right-of-way at this point.'); return { zoning: zi, vicinity };
    }
    if (d.kind === 'legacy') {
      const why = `${d.raw} is not a UDO base district. Districts like this were kept from the zoning ordinance in effect until May 31, 2023, usually through a conditional rezoning, so their limits come from the approved rezoning plan and that ordinance, not the UDO tables.`;
      for (const k of ['setbacks', 'height_limit', 'min_lot_area']) ctx.gap(k, why, d.petitionUrl ? 'Open the rezoning petition for the approved site plan.' : 'Look up the rezoning petition for this parcel and the archived Charlotte Zoning Ordinance.');
      zi.notes.push(why); return { zoning: zi, vicinity };
    }
    const lotSf = parcel?.lotSf;
    const { standards, frontage, notes, gaps } = standardsFor(d.base, lotSf);
    zi.standards = standards; zi.frontage = frontage; zi.notes.push(...notes);
    if (d.conditional || d.exception) zi.notes.unshift('These are the base district limits. The approved rezoning plan can change them; check it before relying on any number here.');
    const ref = d.articleUrl || CLT.udo; const by = (k: string) => standards.find(s => s.key === k);
    const confS = d.conditional || d.exception ? 'low' : 'medium';
    const baseNote = (d.conditional || d.exception ? 'Base district limit; the approved rezoning plan may differ. ' : '') + UDO_AT;
    const sb = ['front', 'corner_side', 'side', 'rear'].map(by).filter(Boolean) as Standard[];
    if (sb.length) ctx.put('setbacks', sb.map(s => `${s.label.replace(' setback', '')}: ${s.value}`).join(' · '), SRC.udo + `, ${d.article || ''}`.replace(/, $/, ''), ref, confS, `${sb.map(s => s.ref).filter((v, i, a) => a.indexOf(v) === i).join('; ')}. ${baseNote}`);
    const h = by('height'); if (h) ctx.put('height_limit', h.value + (by('min_height') ? ` (minimum ${by('min_height')!.value})` : ''), SRC.udo, ref, confS, `${h.ref}. ${h.note ? h.note + ' ' : ''}${baseNote}`);
    for (const k of ['min_lot_area', 'min_lot_width', 'lot_coverage', 'far', 'density']) { const s = by(k); if (s) ctx.put(k, s.value, SRC.udo, ref, confS, `${s.ref}. ${s.note ? s.note + ' ' : ''}${baseNote}`); }
    for (const [k, reason] of gaps) ctx.gap(k, reason, `See ${d.article || 'the UDO'} (${ref}).`);
    const summary = [`${d.raw}: ${d.article || 'Charlotte UDO'}.`, ...standards.map(s => `${s.label}: ${s.value} (${s.ref})`)].join('\n');
    ctx.put('zoning_requirements', summary, SRC.udo, ref, confS, baseNote);
    return { zoning: zi, vicinity };
  },
};
