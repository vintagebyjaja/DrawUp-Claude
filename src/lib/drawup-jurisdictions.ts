// Site lookup by jurisdiction: the registry of covered places. Types and helpers: drawup-jurisdiction-util.ts.
// Free sources only (Jaja, 2026-11-11): paid services (Regrid, Zoneomics, ATTOM, Google APIs) are never called; the
// page links to them so members can look things up themselves (FIND_LINKS).
// Adding a jurisdiction: write an adapter like drawup-jurisdiction-charlotte.ts from that place's free official GIS
// services and ordinance, add it to REGISTRY, add a fixture to tests/season1/fixtures-intel.js and checks to
// tests/season1/test-site-lookup.js. Buildings (OpenStreetMap) are looked up everywhere (drawup-site-buildings.ts).
export * from './drawup-jurisdiction-util';
import type { Geo, Jurisdiction } from './drawup-jurisdiction-util';
import { CHARLOTTE } from './drawup-jurisdiction-charlotte';

/* ------------------------------------------------------------------ registry */
export const REGISTRY: Jurisdiction[] = [CHARLOTTE];
/** Plain-language list of what DrawUp covers, for "not covered" messages. */
export const COVERAGE_TEXT = 'Charlotte, NC (zoning, limits, setbacks, parking) and Mecklenburg County, NC (parcels) from official sources; flood zone, elevation and nearby buildings anywhere in the U.S.';
export const findJurisdiction = (geo: Geo, _env: Record<string, string> = {}) => REGISTRY.find(j => { try { return j.covers(geo); } catch { return false; } }) || null;

/** Where a member can look things up themselves when DrawUp has no free source. Some of these sites charge or limit
 *  free use; DrawUp only links to them. */
export function findLinks(lat: number, lng: number, address: string): { label: string; url: string; what: string }[] {
  const ll = `${lat},${lng}`;
  return [
    { label: 'Google Maps (satellite and Street View)', url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ll)}`, what: 'Look at the building and street; measure by eye. Free.' },
    { label: 'Google Earth', url: `https://earth.google.com/web/search/${encodeURIComponent(address)}`, what: '3D view and a measuring tool for rough heights and footprints. Free.' },
    { label: 'Regrid parcel map', url: 'https://app.regrid.com/us', what: 'Parcel lines and some zoning codes nationwide. Limited free viewing; full data is paid.' },
    { label: 'Zoneomics', url: 'https://www.zoneomics.com/', what: 'Zoning maps and limits for many U.S. cities. Paid for full details.' },
    { label: 'Municode Library', url: 'https://library.municode.com/', what: 'Free text of many city and county zoning ordinances.' },
  ];
}
