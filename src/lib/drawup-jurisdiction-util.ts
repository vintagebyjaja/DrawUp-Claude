// Site lookup by jurisdiction (shared types and helpers): parcels, zoning, dimensional standards and the vicinity around a site.
// Pure code (no imports) so the route, the browser core and the tests share it.
//
// Zoning is published separately by every city and county, so each covered place is one adapter in REGISTRY.
// An adapter answers only what its official sources answer. Rules for every adapter:
//   - Never guess a value. A district code comes from the jurisdiction's zoning map; a dimensional limit comes
//     from the ordinance table it cites (article, table, row). If a value is not transcribed, say so.
//   - Every value carries its source, a link, the lookup date and a confidence, and stays "Unverified" until a
//     member checks it (the FieldValue shape in drawup-project-intel.ts).
//   - Conditional districts, overlays and pending rezonings are flagged, because they can change the base limits.
//   - When a place is not covered, the gaps say which places are and what to check instead.
//
// Adding a jurisdiction: write an adapter (see drawup-jurisdiction-charlotte.ts), add it to REGISTRY, add its
// fixture to tests/season1/fixtures-intel.js and a test to tests/season1/test-site-lookup.js.

export type Conf = 'high' | 'medium' | 'low';
export type FieldValue = { v: string; src: string; url?: string; at: string; conf?: Conf; by: 'auto' | 'user'; verified?: boolean; note?: string };
export type SourceResult = { id: string; name: string; url: string; ok: boolean; error?: string; ms?: number };
export type Unavailable = { key: string; reason: string; next: string };
export type Ring = [number, number][]; // [lng, lat] pairs

/** What the Census geocoder told us about the address (see parseCensus). */
export type Geo = { matched: string; lat: number; lng: number; state: string; stateName: string; county: string; place: string; placeName: string; countySub: string; city: string; zip: string };

/** One dimensional limit, always with the ordinance reference it was read from. */
export type Standard = { key: string; label: string; value: string; ref: string; applies?: string; note?: string };
export type FrontageTable = { title: string; ref: string; note: string; cols: string[]; rows: string[][] };

export type ParcelInfo = {
  id: string; url: string; src: string; srcUrl: string; conf: Conf; how: 'address' | 'point';
  address?: string; owner?: string; ownerMail?: string; landUse?: string; lotSf?: number; lotAcres?: number; lotFrom?: string;
  legal?: string; deed?: string; assessedYear?: number; landValue?: number; buildingValue?: number; totalValue?: number;
  heatedSf?: number; units?: number; lastSale?: string; town?: string; point?: [number, number]; rings?: Ring[];
};
export type DistrictInfo = {
  raw: string; base: string; name: string; kind: 'base' | 'legacy' | 'right_of_way' | 'unknown';
  conditional: boolean; exception: boolean; petition?: string; petitionUrl?: string; rezoned?: string;
  overlays: { code: string; name: string; ref?: string }[]; article?: string; articleUrl?: string;
};
export type ZoningInfo = {
  jurisdiction: { id: string; name: string; ordinance: string; ordinanceUrl: string; mapName: string; mapUrl: string };
  district?: DistrictInfo; standards: Standard[]; frontage?: FrontageTable; notes: string[]; transcribed?: string;
};
export type VicinityInfo = {
  bbox: [number, number, number, number]; // xmin, ymin, xmax, ymax in degrees
  zones: { code: string; rings: Ring[] }[];
  parcels: Ring[][];
  rezonings: { petition: string; existing: string; requested: string; acres?: number; received?: string; url?: string; rings: Ring[] }[];
  src: string;
};
export type SiteExtras = { parcel?: ParcelInfo; zoning?: ZoningInfo; vicinity?: VicinityInfo; coverage: string };

export type Fetcher = (url: string, init?: { body?: string }) => Promise<any>;
export type AdapterCtx = {
  address: string; geo: Geo; at: string; fetchJson: Fetcher;
  run: <T>(id: string, name: string, url: string, parse: (j: any) => T, body?: string) => Promise<T | null>;
  put: (k: string, v: string, src: string, url: string, conf: Conf, note?: string) => void;
  gap: (key: string, reason: string, next: string) => void;
};
/** An adapter finds the parcel first (so later lookups use a point inside the lot), then zoning and the vicinity. */
export type Jurisdiction = {
  id: string; label: string; covers: (geo: Geo) => boolean;
  /** Find the parcel; returns the point to use for the rest of the lookups (inside the lot), or null. */
  parcel: (ctx: AdapterCtx) => Promise<ParcelInfo | null>;
  /** Zoning at the point, the dimensional standards for the district, and the vicinity map data. */
  zoning: (ctx: AdapterCtx, lat: number, lng: number, parcel: ParcelInfo | null) => Promise<{ zoning?: ZoningInfo; vicinity?: VicinityInfo }>;
};

/* ------------------------------------------------------------------ helpers shared by adapters */
export const clean = (s: unknown, max = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
export const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
export const money = (n: number) => '$' + fmtInt(n);
/** ArcGIS answers errors with HTTP 200 and { error }; treat that as a failure. */
export function arcFeatures(j: any): any[] {
  if (j && j.error) throw new Error(clean(j.error.message || 'ArcGIS error', 120) + (j.error.code ? ` (${j.error.code})` : ''));
  if (!j || !Array.isArray(j.features)) throw new Error('unexpected answer');
  return j.features;
}
/** Only letters, digits, spaces and a few safe characters go into an ArcGIS where clause. */
export const sqlSafe = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9 \-/]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

/** Area of a ring in square feet (lng/lat degrees, local equirectangular; good to well under 1% at lot scale). */
export function ringAreaSf(ring: Ring): number {
  if (!ring || ring.length < 3) return 0;
  const lat0 = ring.reduce((a, p) => a + p[1], 0) / ring.length; const kx = 364000 * Math.cos(lat0 * Math.PI / 180), ky = 364000;
  let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
  return Math.abs(a / 2);
}
export function ringCentroid(ring: Ring): [number, number] {
  let x = 0, y = 0; ring.forEach(p => { x += p[0]; y += p[1]; }); return [x / ring.length, y / ring.length];
}
/** Sutherland-Hodgman clip of a ring to a box, so the vicinity map stores only what it draws. */
export function clipRing(ring: Ring, b: [number, number, number, number]): Ring {
  let out: Ring = ring.slice();
  const edges: [(p: [number, number]) => boolean, (a: [number, number], c: [number, number]) => [number, number]][] = [
    [p => p[0] >= b[0], (a, c) => [b[0], a[1] + (c[1] - a[1]) * (b[0] - a[0]) / (c[0] - a[0])]],
    [p => p[0] <= b[2], (a, c) => [b[2], a[1] + (c[1] - a[1]) * (b[2] - a[0]) / (c[0] - a[0])]],
    [p => p[1] >= b[1], (a, c) => [a[0] + (c[0] - a[0]) * (b[1] - a[1]) / (c[1] - a[1]), b[1]]],
    [p => p[1] <= b[3], (a, c) => [a[0] + (c[0] - a[0]) * (b[3] - a[1]) / (c[1] - a[1]), b[3]]],
  ];
  for (const [inside, cut] of edges) {
    const src = out; out = []; if (!src.length) break;
    for (let i = 0; i < src.length; i++) {
      const cur = src[i], prev = src[(i + src.length - 1) % src.length];
      if (inside(cur)) { if (!inside(prev)) out.push(cut(prev, cur)); out.push(cur); }
      else if (inside(prev)) out.push(cut(prev, cur));
    }
  }
  return out.map(p => [r6(p[0]), r6(p[1])] as [number, number]);
}
export const clipRings = (rings: Ring[], b: [number, number, number, number]) => (rings || []).map(r => clipRing(r, b)).filter(r => r.length >= 3);
export function boxAround(lat: number, lng: number, halfFt: number): [number, number, number, number] {
  const dy = halfFt / 364000, dx = halfFt / (364000 * Math.cos(lat * Math.PI / 180));
  return [r6(lng - dx), r6(lat - dy), r6(lng + dx), r6(lat + dy)];
}

