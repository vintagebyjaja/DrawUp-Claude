// Buildings near a site, anywhere in the U.S.: footprints, heights and floors from OpenStreetMap (Overpass API).
// Free, no key. OpenStreetMap is a website people edit, so every value is labelled "Website" (or "Estimate" when
// DrawUp works a number out) and stays Unverified. A height is only given when the map has one: a mapped height
// tag ("Website"), or a floor count times 12 ft ("Estimate", and it says so). Nothing else is invented.
//   Overpass API: https://overpass-api.de/api/interpreter   Data © OpenStreetMap contributors, ODbL.
import type { BuildingInfo, Ring } from './drawup-jurisdiction-util';
import { clean, inRing, r6, ringAreaSf, ringCentroid } from './drawup-jurisdiction-util';

export const OVERPASS = 'https://overpass-api.de/api/interpreter';
export const OSM_SRC = 'OpenStreetMap buildings (Overpass API)';
export const FT_PER_FLOOR = 12;

/** Buildings whose outline is within `radiusM` metres of the point; at most 80. */
export function overpassUrl(lat: number, lng: number, radiusM = 120) {
  const q = `[out:json][timeout:12];way["building"](around:${Math.round(radiusM)},${r6(lat)},${r6(lng)});out tags geom 80;`;
  return `${OVERPASS}?data=${encodeURIComponent(q)}`;
}

/** "12", "12 m", "12.5m", "40 ft", "40'" -> feet. Anything else -> undefined. */
export function heightToFt(raw: unknown): number | undefined {
  const s = clean(raw, 20).toLowerCase(); if (!s) return undefined;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(m|meters?|metres?|ft|feet|')?$/); if (!m) return undefined;
  const n = parseFloat(m[1]); if (!isFinite(n) || n <= 0 || n > 700) return undefined;
  return Math.round((m[2] && /^(ft|feet|')$/.test(m[2]) ? n : n * 3.28084) * 10) / 10;
}

export function parseOverpass(j: any, parcelRings: Ring[] = []): BuildingInfo[] {
  if (!j || !Array.isArray(j.elements)) throw new Error('unexpected answer');
  const out: BuildingInfo[] = [];
  for (const el of j.elements) {
    if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 4) continue;
    const ring: Ring = el.geometry.map((p: any) => [r6(Number(p.lon)), r6(Number(p.lat))] as [number, number]).filter((p: [number, number]) => isFinite(p[0]) && isFinite(p[1]));
    if (ring.length < 4) continue;
    const t = el.tags || {}; const footprintSf = Math.round(ringAreaSf(ring)); if (footprintSf < 60) continue;
    const c = ringCentroid(ring); const onParcel = parcelRings.some(r => inRing(c, r));
    const levels = Number(t['building:levels']); const lv = isFinite(levels) && levels > 0 && levels < 200 ? Math.round(levels) : undefined;
    const tagH = heightToFt(t.height);
    const b: BuildingInfo = { id: `osm-way-${el.id}`, src: OSM_SRC, srcUrl: `https://www.openstreetmap.org/way/${el.id}`, kind: 'website', onParcel, rings: [ring], footprintSf,
      ...(clean(t.name) ? { name: clean(t.name, 80) } : {}), ...(t.building && t.building !== 'yes' ? { use: clean(t.building, 40) } : {}), ...(lv ? { levels: lv } : {}) };
    if (tagH) { b.heightFt = tagH; b.heightKind = 'website'; b.heightNote = 'Height mapped on OpenStreetMap.'; }
    else if (lv) { b.heightFt = lv * FT_PER_FLOOR; b.heightKind = 'estimate'; b.heightNote = `Estimate: ${lv} floor${lv === 1 ? '' : 's'} on OpenStreetMap × about ${FT_PER_FLOOR} ft per floor.`; }
    if (lv) { b.floorAreaSf = footprintSf * lv; b.floorAreaKind = 'estimate'; b.floorAreaNote = `Estimate: mapped footprint × ${lv} floor${lv === 1 ? '' : 's'}. Not a measured floor area.`; }
    out.push(b);
  }
  return out.sort((a, b) => (Number(b.onParcel) - Number(a.onParcel)) || (b.footprintSf - a.footprintSf)).slice(0, 80);
}
