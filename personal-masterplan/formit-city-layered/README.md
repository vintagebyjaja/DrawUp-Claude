Download the complete editable project: [FormIt_City_Layered_Package.zip](FormIt_City_Layered_Package.zip?download=1). On GitHub, open the ZIP and choose **Download raw**. Git clones require `git lfs pull` to retrieve the ZIP.

# FormIt city — editable feature groups

Includes the full corrected city, photo-informed school/apartment materials, and the additional corner building material treatment. Original uploads are unchanged.

## Open/import

Import FormIt_City_Layered.fbx for the full model. Named FBX parent groups distinguish buildings, terrain, grass, roads, parking/paving, paths, curbs, trees, water, base and contours. FormIt native Layers/Tags mapping has not been tested: if grouping is not retained, use the five separate files in layers/ and assign their native FormIt layers manually. These feature files are already included in the full FBX; do not import both unless intentionally duplicating them. All files share the same coordinates; do not recenter or individually drop them to ground.

The included BLEND has editable named collections and a hidden, unmodified original terrain backup. The backup is excluded from FBX to avoid duplicate terrain. Textures are embedded in FBX and supplied separately.

## Source versus inference

- Roads: 654 original source meshes, unchanged.
- Sidewalks/paths: 215 original path meshes, unchanged. Their sidewalk versus footway function is not independently verified.
- Grass/landscape: imagery-inferred classification of 5,128 original terrain triangles.
- Parking/paved: imagery-inferred classification of 8,668 original terrain triangles. Includes possible driveways and other paving; this is not a verified parking inventory.
- Other terrain: 26,439 original triangles, retained. The three terrain groups together preserve every one of the original 40,235 terrain triangles, coordinates and UVs exactly.
- Grass/paving boundaries follow coarse source triangles, so they are visibly approximate and require manual cleanup. Vegetation shadows, image colors and coarse triangles limit classification. These are not surveyed semantic polygons.
- Curbs: 7,516 estimated segments derived from source path boundaries; assumed width and height 0.12 m, bottom 0.01 m above path edge. They are new geometry, not measured or original curbs. They may include edges without real curbs and omit real curbs elsewhere. One editable mesh can be separated by loose parts.
- Corner building: warm brick/window texture treatment and pale roof; facade arrangement is an estimate, not survey documentation. Original mass remains unchanged.

## Orientation and validation

Z-up, metre units, baked transforms, original city layout retained. Lowest terrain surface is Z=0; the original base remains below zero. Source Y-up feet were converted globally by +90 degrees about X and 0.3048 scale; see transform JSON. No terrain flattening or individual building rotation.

Fresh Blender FBX reimport passed: 4,039 meshes; 344,082 triangles including added curbs; zero vertex displacement; all 11 FBX parent groups present; seven packed texture images; exact original terrain triangle hash match. All five feature FBXs also passed independent reimport with zero coordinate displacement. Eight zero-area faces already present in source base/path/road geometry were retained; no new zero-area faces were introduced. See validation/.

Native Autodesk FormIt is unavailable here. Orientation, units, groups, geometry and textures were checked through FBX metadata and Blender reimport, not an actual FormIt session.

## Previews

01: actual material campus overview. 02: actual corner-building closeup. 03: diagnostic colors only (green inferred grass, orange inferred paving, cyan source paths, dark gray roads, pale curbs, gray other terrain). Diagnostic colors are not the model materials.

## Reproduction

scripts/ contains the executed project-specific Blender Python workflows, including extraction, reimport checks and previews. They use absolute /workspace paths and require the prior materialized corner BLEND at /workspace/formit-city-corner/FormIt_City_Materialized_Corner.blend. That input was the corrected original city with photo-informed materials. Adjust paths when reproducing elsewhere; this package does not duplicate all prior-stage inputs. To rebuild aerial_rgb.npy, load textures/maptexture.jpg with Pillow, convert to RGB, then numpy.save it under /workspace/formit-city-layered/aerial_rgb.npy. Run create_layers.py with Blender 4.3 background mode, then check_source_conditions.py, verify_layers.py, verify_layer_files.py and render_layers.py. The included final BLEND can be edited directly without rerunning the pipeline.

Published to the migration branch with user approval.
