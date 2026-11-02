# FormIt City — clean building selection and grade-aware facades

Open FormIt_City_Clean_Massing.fbx in a NEW/EMPTY FormIt document to avoid overlapping the previous full city or separate terrain layers. All source city coverage, coordinates, elevations and metre scale are retained. The lowest terrain elevation remains Z=0, with the original base beneath it.

## Changes

- All 3,159 buildings export as one named mesh object with ONE material per building. The five detailed building textures now combine walls, windows and roof appearance into one atlas each. Coincident vertices were welded without changing positions. This is a selectable textured mesh mass, not a newly reconstructed watertight native FormIt solid. Native FormIt grouping/selection is not testable in this environment.
- Imported contour geometry and all loose line edges are excluded from this working copy. Original uploads and the previous model remain untouched.
- Detailed wall finishes use window-free masonry below the maximum source terrain elevation sampled along each wall face, plus a 0.45 m allowance, with apartment cutoffs snapped past any intersected window row. Windows remain visible above grade; original building heights, roof positions and terrain have NOT been shifted. The apartment spans approximately 11 m of source ground rise, so some lower floors are appropriately represented as masonry rather than exposed windows on the uphill side. These foundation finishes and allowances are visual estimates, not surveyed facade or floor levels.
- Grass, paving, roads, paths and estimated curbs remain separately grouped, and the five individual feature FBXs are included. Grass/paving classification remains coarse and inferred; curbs are estimated 0.12 m wide and high, not surveyed. Do not import feature FBXs on top of the full model unless intentionally duplicating those features.

## Black lines and FormIt display

FBX does not control FormIt Visual Styles. Turn OFF the Edges display in FormIt to hide black outlines/triangulation in the shaded view. Curved/hilly terrain necessarily contains mesh edges; deleting those surface edges would change the terrain. This model removes actual contour/loose line objects, but an importer can still draw geometric face boundaries. There is no baked black wireframe texture in the supplied model. Native FormIt display has not been verified here.

## Validation

Fresh FBX reimport: 4,038 mesh objects; all 3,159 buildings one mesh and one material; zero displacement from original mesh positions; no loose edges or contour object; 40,235 terrain triangles retained; terrain minimum Z=0. Packed building texture atlases retained on reimport; exact vertex/UV pair checks passed with one UV layer per detailed building. See validation/reimport.json and cleanup.json. Renders were produced from the reimported FBX, not a separate illustration.

## Editing and reproducibility

The BLEND retains editable mesh geometry, building materials, UV atlases and separate feature collections. Atlas PNGs are supplied in textures/. Source facade images and original material textures are included for reference. scripts/clean_city.py and validate_render.py are the executed Blender 4.3 workflows, with project-specific absolute paths. Regeneration requires the earlier /workspace/formit-city-layered/FormIt_City_Layered.blend input; adjust paths on another computer. The final BLEND is directly editable without regenerating.

This revision is prepared for review and has not been pushed. The previously approved layered package remains on migration. Nothing has been merged or pushed to main.
