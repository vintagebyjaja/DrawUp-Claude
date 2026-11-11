# Site lookup: parcel, zoning, setbacks and vicinity

Projects › Project Information › **Look up site data** now goes past the Census, FEMA and USGS lookups. Where
DrawUp covers the place, the same button also fills the parcel, the zoning district, the district's dimensional
limits and the setbacks, and draws a vicinity map. Free, no AI, no credits, no new keys or SQL.

## What is covered

| Place | Parcel and assessor data | Zoning district | Dimensional limits and setbacks | Pending rezonings |
|---|---|---|---|---|
| City of Charlotte, NC | yes | yes | UDO base districts N1-A to N1-F, N2-A, N2-B (N2-C partly), CG, CR, RAC, UE, UC | yes |
| Other Mecklenburg County towns (Huntersville, Cornelius, Davidson, Matthews, Mint Hill, Pineville) | yes | no: the town zones its own land, and the page says so | no | Charlotte petitions only |
| Anywhere else in the U.S. | no | no | no | no |

Charlotte districts whose tables are not transcribed yet (NC, CAC-1/2, TOD-*, IMU, ML-1/2, IC-1/2, OFC, OG, RC, MHP)
show the district and the UDO article link, and say the limits are not transcribed. Pre-UDO codes (R-3, B-1(CD),
MUDD-O, UMUD-O and similar) send the member to the rezoning plan, because the UDO tables do not apply to them.

## Honesty rules (same as Project Information)

- A district comes from the city's zoning map. A limit comes from the ordinance table it names (article, table, row).
- Nothing is guessed. A value that could not be read cleanly from the ordinance is left out and reported.
- Every value carries its source, a link, the lookup date and a confidence, and is "Unverified" until a member checks it.
- Conditional (CD) and exception (EX) districts, overlays and pending rezonings nearby are flagged. Base limits on a
  conditional district are low confidence and say the approved plan can change them.
- The card ends with "Not a zoning determination: for a binding answer ask the city for a zoning verification letter."

## Sources (public, no key)

- Parcels and assessor data, all of Mecklenburg County: `gis.charlottenc.gov/.../PLN/AllParcelData/MapServer/0`;
  parcel lines `.../CountyData/Parcels/MapServer/0`; the person-facing link is Polaris (`polaris3g.mecklenburgcountync.gov/pid/<PID>`).
- Charlotte zoning map: `.../PLN/Zoning/MapServer/0`. Pending rezonings: `.../PLN/Rezonings/MapServer/0` (Status 'Pen').
- Charlotte UDO (effective June 1, 2023): https://charlotteudo.org/articles. Tables transcribed and checked Nov 11, 2026
  (provenance per article is at the top of `src/lib/drawup-jurisdiction-charlotte.ts`). The PDF edition controls.

## How it runs on Workers

`/api/project-intel` (unchanged route) runs: Census geocode → parcel (by address and at the point, in parallel) →
FEMA, USGS, zoning at a point inside the parcel, vicinity zoning, parcel lines and rezonings (in parallel). It is all
waiting on the network; the only CPU work is parsing JSON and clipping a few hundred small polygons to the map box
(well under the Workers CPU limit). The answer for a Charlotte lot is about 30-80 KB.

## Files

- `src/lib/drawup-jurisdictions.ts`: the registry of covered places. `drawup-jurisdiction-util.ts`: shared types and helpers.
- `src/lib/drawup-jurisdiction-charlotte.ts`: the Charlotte / Mecklenburg adapter and the transcribed UDO tables.
- `src/lib/drawup-project-intel.ts`: calls the registry; new fields (parcel owner, assessor land use, assessed value,
  legal description, conditions and overlays, minimum lot area and width, coverage, FAR, density, pending rezonings).
- `public/drawup-project-intel-core-v30.js`: GENERATED; rebuild after editing any of the .ts files above:
  `npx esbuild src/lib/drawup-project-intel.ts --bundle --format=iife --global-name=DrawUpIntelCore --target=es2019 --outfile=public/drawup-project-intel-core-v30.js`
  then put the "GENERATED" comment line back on top.
- `public/drawup-project-intel-v30.js/.css`: parcel panel, zoning card with the limits table, frontage table, vicinity map.
- `public/drawup-preview.html`: the three project-intel tags moved to `?v=30.1`.
- Tests: `tests/season1/test-site-lookup.js` (55 checks) and the updated `test-project-intel.js` (36).

## Adding a jurisdiction

1. Write `src/lib/drawup-jurisdiction-<place>.ts` exporting a `Jurisdiction` (`covers`, `parcel`, `zoning`), using
   only that place's official GIS services and its ordinance tables, each value with its reference.
2. Add it to `REGISTRY` in `drawup-jurisdictions.ts` and rebuild the core file.
3. Add fixtures to `tests/season1/fixtures-intel.js` and checks to `test-site-lookup.js`.

## Still to check after deploy

The container that built this cannot reach the city and county services, so the tests use stand-ins shaped like the
real answers (the 600 E 4th St parcel values are copied from the live service). Run one live lookup after deploy.
