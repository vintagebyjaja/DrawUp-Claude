[Download the personal prototype ZIP](Monroe_Screenshot_Terrain_Personal_Prototype.zip?download=1). On GitHub choose Download raw; clones need `git lfs pull`. INVENTORY.json lists files inside the ZIP.

# Monroe — screenshot terrain approximation and building-footprint cleanup

Actual editable full-neighborhood model, updated at the user's explicit request using the supplied screenshots. This is a personal screenshot-based approximation, not newly acquired licensed orthophotography or a survey-accurate 10–30 cm aerial dataset.

## Open the model

- FormIt: import Monroe_Screenshot_Terrain.fbx into an EMPTY document to avoid duplicate surfaces. Full-resolution tiled textures are embedded and also supplied under textures/. Turn off edge outlines in FormIt Visual Styles to hide terrain triangulation. Native FormIt behavior cannot be tested here.
- Blender: open Monroe_Screenshot_Terrain.blend. It starts with all full-resolution tile images packed, plus four saved cameras and daylight lighting. Buildings, terrain categories, roads, paths, estimated curbs, trees and water remain separately organized. A hidden original-terrain backup is retained in the BLEND and excluded from FBX.
- Each of the 3,159 building meshes retains ONE mesh object and ONE material, including its facade/windows/roof appearance. No building was repositioned, resized, rotated, regenerated or split. The previous model remains unchanged as a backup.

## Ground imagery and footprint cleanup

Three user-supplied images are registered against the existing ground image using feature correspondences and projective mappings. Overview and site/street registrations use ground features; the closest aerial view needed mixed features because too few reliable ground-only matches were available. Results: 227 / 25 / 36 inliers respectively, with median residuals about 2.2–2.6 screenshot pixels. Those are image-matching residuals, not surveyed ground accuracy. The source terrain UVs are quantized; fitting their geographic mapping introduces up to roughly 0.8 original-image pixel of additional uncertainty.

The close-up and street views supply more detail around the campus. Screenshots cover approximately 44.6% of the full 1.399 × 1.392 km study area under conservative image-border, label and feature-support masks. The original image supplies the remainder, so the entire original neighborhood remains represented. The 16 output textures use a 20 cm raster sampling grid; effective source resolution varies and is NOT independently verified. Original-image fallback areas remain low resolution. No artificial sharpening or AI aerial details are used.

To avoid duplicate flat building images under the extruded geometry, every source building's projected footprint is masked in the terrain texture. Courtyards are preserved by projecting actual mesh faces rather than filling a convex hull. The mask includes an approximately 0.4–0.5 m edge margin. Local non-AI image infill restores pixels beneath those masks; any exposed infill is estimated surrounding-ground color/detail, not a record of real surfaces beneath buildings. About 18% of terrain texture pixels fall inside these building masks. This operation changes texture pixels, not terrain geometry or building footprints.

Perspective, tree canopy, building lean, screenshot labels, capture-date differences and incomplete image coverage can leave local alignment artifacts. The screenshot_manifest.json records source filenames, SHA256 hashes, registration mode and per-tile selection counts. Original uploaded screenshots are not duplicated in this package; retain the supplied ZIPs for exact regeneration. User approval to use these images does not establish new provider licensing or surveyed accuracy.

## Geometry, scale and validation

Fresh FBX reimport passed: 4,083 working mesh objects; all 3,159 building meshes have one material; zero FBX vertex displacement; all 16 full-resolution ground JPEGs are embedded byte-for-byte; all UV coordinate/position sets survive export. Terrain clipping introduces tile-border vertices without changing its surface planes; maximum numerical surface deviation after export is about 0.000031 m. Lowest terrain remains Z=0 and the existing model base stays below it. Original source surface area is preserved to numerical precision. These checks demonstrate data preservation, not geographic survey accuracy.

The existing 22 ft apartment-side roadway correction, source roads, paths and estimated curbs remain unchanged. Grass and candidate parking/paving categories remain inherited approximate classifications. Three optional original feature-only FBXs are included under layers/; they already appear in the complete model, so do not import them again unless intentionally duplicating them. The updated grass/paving/other terrain is tiled inside the main model's existing collections.

The validator checks geometry, UVs, packed texture bytes and actual near/far LOD switching. Frame-rate navigation and native FormIt material/filter settings have not been measured. FBX is a STATIC model; it does not execute Blender LOD scripts. The optional Blender script can switch between 512px overviews and larger images and release unused images as the viewport moves.

## Previews

All after images are actual Cycles renders of the REIMPORTED FBX. Before views use the unchanged baseline model. Cameras, orthographic framing, sun, exposure and render settings match. The school camera is moved backward along its viewing axis in both versions to avoid clipping foreground buildings; its orthographic image framing and angle are unchanged. Comparison JPGs simply place the actual before/after renders side by side.

## Reproduction and optional LOD

Executed scripts are supplied under scripts/. They are project-specific and use /workspace paths; adjust paths on another machine. Inputs: the previous FormIt_City_Neighborhood_Context.blend, its original maptexture.jpg, and the three PNGs from Monroe_School_Aerial_References_Updated.zip. Python dependencies include NumPy, Pillow and OpenCV; Blender 4.3 handles editable geometry and export.

Order: extract_registration_geometry.py (Blender), build_screenshot_tiles.py (ordinary Python), apply_to_scene.py (Blender), validate_and_render.py (Blender), render_school_unclipped.py (Blender), verify_uv_and_embedded_tiles.py (Blender), save_native_full_detail.py (Blender). The native full-detail step also saves cameras and lighting. The final BLEND can be edited directly without rebuilding.

For optional Blender image LOD, add the supplied scripts folder to Python's path and run `import lod_screenshots; lod_screenshots.register()`. Keep textures/ beside the BLEND, including screenshot_manifest.json, to let the script load external overview/full-size files. It can be stopped with `lod_screenshots.unregister()`. No automatic script execution or public DrawUp interface is added.

Prepared on migration for preview approval. This revision has not been pushed; no main branch changes.
