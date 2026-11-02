# Personal master plan — Run 01

Historical import investigation: SKP IMPORT REMAINS BLOCKED. The later authorized approximate fallback is documented in README.md and PROTOTYPE_RESULTS.md; the earlier no-model status below describes the inspection stage only.

## Source inspection

The accessible upload `cadmapper-fairmount-heights-maryland-us.zip` is 959,943 bytes. Its SKP is 3,553,999 bytes and has SHA-256:

`a05d8747c1246bb6f23cdc0837c25725c0dac44fb40745018f95aac3dbeccf60`

The binary header contains `SketchUp Model` and `{15.0.1}`, indicating SketchUp 2015 format. This is header inspection, not a successful import.

Readable layer names: Layer0, buildings, minor_roads, water, paths, parks, major_roads, railways, topography. These names do not prove that any layer contains geometry.

Readable metadata field names include GeoReference, GeoReferenceNorthAngle, Latitude, Longitude, ModelTranslationX/Y/Z, UsesGeoReferencing, LengthUnit, and LengthFormat. Their values have not been decoded or verified. Units, coordinate reference system, north angle, origin, site dimensions, elevations, building positions and geometry counts remain UNVERIFIED. The place name in the filename alone does not establish the intended Monroe School site.

The accompanying LICENSE.txt attributes OpenStreetMap contributors and USGS NED/NASA SRTM elevation sources and requires that license text to accompany redistribution. It does not establish which elevation dataset supplied any particular vertex.

The original ZIP and byte-identical extracted source remain outside the repository in /workspace/attachments and /workspace/masterplan-run01/source. No source geometry was modified. The Monroe_School_MasterPlan_Source_Package upload could not be transferred because it exceeds the available 32 MiB transfer limit; its references and instructions were not inspected.

## Available software and blocker

Blender 4.3.2 launches successfully. FBX, OBJ and GLB import/export operators are registered. Neither SketchUp nor Collada DAE import is registered in this Blender build. Earlier operator availability checks used hasattr, which is unreliable for Blender’s dynamic operator API; RNA registration checks corrected the result. No SketchUp import operator or compatible installed SKP converter was found. Operator availability is not an export/reimport validation.

A supported conversion is required: open the original in a SketchUp version that supports the 2015 file and exports FBX or OBJ (or use another supported, licensed converter). Export the entire model, including hidden geometry needed for preservation, and retain groups, material/texture files, original origin and scale. Include the unchanged SKP and license. Do not normalize, center, rescale or flatten the model during conversion. Record the converter/version, export settings, displayed model units, geolocation, north angle and one known site distance. FBX or OBJ/MTL is suitable for the registered importers. GLB from a supported converter is also suitable. If DAE is the only export available, an additional verified conversion step or compatible Blender build is required. Intermediate formats may lose geographic metadata, so record it separately.

## Next validation gate

1. Confirm intended site against supplied location/reference documents.
2. Import the converted geometry, inspect intermediate-format unit/up-axis metadata and compare one known source distance and elevation range. Record source geographic metadata separately; do not assume local model coordinates are a projected CRS.
3. Preserve an unchanged imported copy in SOURCE_ORIGINAL. Organize working copies into TERRAIN, EXISTING_BUILDINGS, ROADS and OTHER; do not infer geometry classes solely from appearance. No proposed structures in Run 01.
4. Assign simple materials, render top-down and perspective views, and record object/vertex/face counts, world bounds, nonfinite coordinates and mesh integrity findings.
5. Save MasterPlan_Run01.blend; export FBX, OBJ/MTL and GLB. Reopen BLEND and reimport each export into independent empty scenes. Compare nonempty geometry, world dimensions with explicit unit conversion, transforms and material references. Report format-specific losses.
6. Package verified files, textures, modeling scripts, previews, source license and accuracy report. Show inventory, actual preview images, validation results and migration diff before requesting approval to push. Choose Git LFS or separate downloadable artifact storage for large binaries before staging them.

No geometry validation has passed. No completion or geographic accuracy claim is made. This report is the only repository addition; no DrawUp application functionality changed and nothing was pushed.

## Reference package follow-up

`Monroe_School_References_Under32MB.zip` transferred successfully (8,726,437 bytes). All 11 JPG screenshots and site_address.txt were extracted without modifying their contents, and the images were visually inspected. REFERENCE_INVENTORY.json records their sizes and SHA-256 hashes. Original reference images remain outside the repository in /workspace/masterplan-run01/references.

The supplied address is The Monroe School, Inc., 601 50th St NE, Washington, DC 20019. The street-photo screenshot repeats that address and shows the school sign. This is agreement within supplied references, not independent geolocation or verification of SKP coverage.

The street photo shows orange/brown brick, pale exposed framing, repeated window bays and a flat roof/parapet. Aerial and oblique views show varied nearby building masses, extensive rooftop solar arrays, paved access/parking areas, lawns and dense tree cover. These observations supply visual comparison cues only; no building heights, dimensions, boundaries, slopes or precise positions were measured. Map pins and labels alone do not identify exact parcel or building boundaries. The neighboring taller residential-looking blocks must not be assumed to be school buildings.

The images contain no surveyed dimensions, reliable scale control, camera calibration or verified terrain elevations. Photogrammetric distortion and vegetation obscure some surfaces. They will not be traced into substitute geometry or used to claim SKP import success. No design instructions were included beyond the address/reference note; the chat restriction against redesign remains controlling. No converted FBX, OBJ/MTL, GLB or DAE model is included, so the conversion blocker remains.
