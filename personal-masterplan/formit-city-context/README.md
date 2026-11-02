# Monroe city — neighborhood appearance context

Full neighborhood model; 3,154 surrounding building meshes now have simplified contextual finishes. The five detailed buildings (main school, two detached school buildings, apartment and corner building) retain their earlier photo-informed appearance. The prior clean city package remains unchanged as a backup.

## One mass per building

Every one of the 3,159 source building meshes is ONE mesh object with ONE material. Windows, facade color and roof finish are areas of the same image texture, not separate objects or meshes. Shared atlas textures reduce file size; sharing a material does not join separate buildings. This is an editable textured mesh model, not a reconstructed native watertight FormIt solid. Native FormIt selection/group behavior has not been tested.

## Supplied images and accuracy

The supplied ZIP's 11 original JPGs are included in references/, along with a contact sheet. 231212 and 231223 establish aerial neighborhood context; 231345, 231411, 231525 and 231538 establish surrounding block character; 231442/231503 show the apartment and nearby residential context; 231238, 231555 and 231609 inform school appearance. These photos resolve the school vicinity much better than the entire 1.4 km city export. They do not show an accurate front facade of every surrounding building.

Context brick/tan/neutral palettes and approximate window patterns are illustrative, informed by those views. They are not individually verified facade matches. Window spacing and texture floor counts are estimated from source mass heights using approximately 3 m per visual floor, not measured floor levels. Roof shade classes (charcoal, gray, pale gray or reddish brown) are inferred from the existing supplied city aerial texture sampled beneath the roof footprints using terrain UV alignment. Image shadows, trees, resolution and median filtering can affect these choices. No external Google Earth mesh extraction or scraping was used.

All original building vertex locations, footprints, heights, positions and orientation remain unchanged. Context wall faces were split at an estimated masonry/base cutoff but their surfaces remain in the original planes. A conservative source-ground cutoff keeps window patterns above the highest sampled ground around each mass. The five detailed buildings retain the earlier grade-aware masonry treatment. Terrain elevations and coverage remain unchanged, with the lowest terrain at Z=0 and the source base below it.

## Files and FormIt

Import FormIt_City_Neighborhood_Context.fbx into an EMPTY document to avoid duplicate geometry. The BLEND provides editable collections, UV maps and packed textures; external texture PNGs are included. Roads, grass, paving, paths and estimated curbs retain their separate feature groups. The five optional layer-only FBXs already align to the complete model and must not be added on top of it unless duplication is intended. Grass/paving boundaries remain inferred/coarse; curb segments are estimated, not surveyed.

Actual contour geometry and loose line objects remain removed. Turn OFF edge outlines in FormIt Visual Styles to suppress mesh triangulation and outline display; FBX cannot set that application preference. Native FormIt rendering and selection are unavailable here, so checks use Blender FBX reimport and exported geometry/material data.

## Validation and regeneration

Fresh FBX reimport validates all building meshes and their single-material structure, UV coordinates, texture embedding, original source vertex positions, terrain triangle counts and Z=0. See validation/reimport.json; context_assignments.json records every appearance assignment and its limits. Previews render the reimported FBX.

scripts/create_context_atlases.py requires Pillow and generates shared facade/roof atlas PNGs. scripts/build_context.py and validate_render.py use Blender 4.3 Python plus NumPy. These executed scripts use absolute project paths; adjust them on another machine. The build input is the prior FormIt_City_Clean_Massing.blend (available in the earlier GitHub package). aerial_rgb.npy is an RGB NumPy array generated with Pillow from the unmodified maptexture.jpg. The final BLEND is directly editable without rebuilding.

Prepared for publication to migration following the user's request for the new download link. No main branch changes.

## Apartment-side street width correction

Two contiguous source road objects beside the apartment, road_local_261 and road_local_203, were widened locally to the user-supplied 22 ft (6.7056 m) carriageway width. Their longitudinal alignment is retained and widened edges are draped to the unchanged terrain. Buildings were not scaled, shifted or resized. The standalone roads layer includes this correction. Seven perpendicular cross-sections were checked again from the reimported FBX; maximum deviation is under 0.01 m near a bend (about 3/8 inch). This is numerical modeling precision relative to the supplied dimension, not surveyed street accuracy. See road_width_correction.json and road_width_reimport_check.json. The source-width audit covers other source road meshes using approximate axis cross-sections; it does not certify their real-world widths. Other roads have not been widened without dimensional evidence. Nearby sidewalk and intersection corner detail remains source/estimated geometry requiring separate verification.

Regeneration order: create_context_atlases.py, build_context.py, inspect_roads.py (records pre-correction road data), correct_apartment_road.py, validate_render.py, plot_road_width.py. Atlas generation/plotting run in ordinary Python; build, inspection, correction and reimport/render run in Blender background mode.
