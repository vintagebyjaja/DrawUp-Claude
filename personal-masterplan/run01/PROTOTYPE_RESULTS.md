# Monroe School prototype — actual generated results

**Outcome: editable approximate prototype generated. Original CADmapper SKP import did not succeed.** This fulfills the newly authorized reference-based fallback, not the earlier geographically verified import completion criteria.

The real Blender geometry includes the main school bar and lower wing, detached masses, pale facade framing, brick, windows and a schematic sign, individual solar modules, simple rooftop equipment, contextual neighboring buildings, streets, sidewalks, parking, vehicles, trees and open lawns. No proposed redesign or DrawUp application changes.

## Accuracy

Every coordinate, height and dimension is estimated. The supplied first aerial screenshot informed relative block layout at an arbitrary 5.2 pixels per nominal metre. The reference photos informed facade character. Nominal scene bounds are 275.00 × 249.04 × 19.20 model metres; these are **not real-world site measurements**. Local screenshot axes are not verified true north. The ground is flat and does not represent CADmapper terrain. Neither parcel limits nor geographic coverage has been verified. Trees, parking, window bays, panel counts and roof equipment are schematic; adjacent buildings are contextual and not asserted to be school property. Individual solids overlap intentionally; this is not a unified watertight construction or fabrication model. No interiors, surveyed facades or engineering verification are included.

## Executed validation

Each format was independently opened/imported into a fresh Blender process after export. All mesh coordinates are finite; zero degenerate polygons and zero faces without material assignments were found. The brick image is packed in BLEND and FBX, embedded in GLB, and linked through a working relative textures/brick.png reference in OBJ/MTL. All formats preserve the same triangle count and model bounds to within 0.001 nominal metres. This tolerance validates file conversion consistency only, not survey accuracy. See validation/SUMMARY.json for raw results.

| Format | Mesh objects after import | Triangles | Materials | Result |
| --- | ---: | ---: | ---: | --- |
| BLEND | 4,511 | 59,656 | 21 | PASS |
| GLB | 4,511 | 59,656 | 21 | PASS |
| OBJ | 4,511 | 59,656 | 21 | PASS |
| FBX | 4,511 | 59,656 | 21 | PASS |

## Renders

Four Cycles CPU renders are produced from the saved model's cameras: aerial master plan, bird's-eye, street-level architectural approach and building-focused view. 1280 × 960 PNG; 32 samples. Denoising is unavailable in this Blender build, so light sampling noise may remain. These are actual 3D renders, not image-generated concept art. Preview camera positions are estimates and are not calibrated to the source photographs.

## Source preservation and conversion

The unchanged SketchUp 2015 source and original license accompany the downloadable package in source/. Its SHA-256 is a05d8747c1246bb6f23cdc0837c25725c0dac44fb40745018f95aac3dbeccf60. The Blender original-source collection is deliberately empty and marked NOT_IMPORTED. Open-source SDK-dependent conversion was investigated and an importer module-load attempt failed; details and references are in README.md. No source terrain was substituted with this flat ground under an accuracy claim.

## Files and Git delivery

Monroe_MasterPlan.blend, .fbx, .obj with .mtl, .glb, textures/brick.png, four previews, reproducible scripts, source SKP/license, reports and raw validation results form the separate downloadable ZIP. INVENTORY.json contains file sizes and SHA-256 checksums. Binaries remain outside Git; scripts, documentation, validation and preview copies are the local migration changes. A saved migration.patch is the pre-push review artifact. Remote main still points to 21aec9d277dbebb8541f46b10bc013860b5775a4; no remote migration branch was present at the read-only check. Nothing has been committed, pushed or merged. No online GitHub preview was published without approval.
