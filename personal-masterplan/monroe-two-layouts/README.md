# Monroe — Original and New Road Layouts

Two complete, independently editable neighborhood models are included:

- `01_Original_Road_Layout`: original road alignments with the shared facade, pavement and sports-layer upgrades.
- `02_New_Road_Layout`: proposed campus loop, two entrances, parking, pedestrian routes and landscape concept.

Each folder contains a Blender source and FBX export. Open one version at a time; both use identical coordinates. Import FBX into an empty document and retain `Shared_Textures` beside the model folders. Blender textures are also packed. All 3,159 buildings retain the baseline geometry, location, orientation and scale; each is one mesh with its roof, facade and window appearance in one material. Hidden backup collections preserve replaced source surfaces and are excluded from FBX. Turn edge outlines off in the receiving application's display settings.

## Shared upgrades

Most context facades now use white/light gray with roof and window pixels retained. The school brick and five eastern brick context buildings remain brick. Neutral context colors are reference-informed approximations, not a verified facade survey. The apartments are toned gray/tan. No new building geometry was fabricated.

Roads, sidewalks, parking and sports areas are separate selectable closed mesh bodies. Roads are 0.20 m thick, sidewalks 0.15 m, proposed parking 0.18 m and sports patches 0.12 m. Extrusion extends downward from terrain-following top surfaces. Mesh editing is supported; these are not parametric civil CAD objects or native FormIt solids.

The baseball field, football field and running track are separate objects, plus an additional Woodson baseball/practice field. Their footprints are removed from the working base terrain. Boundaries are traced from imagery and are not survey or regulation dimensions. The diagnostic sports preview uses temporary identifying colors; the models retain imagery-based materials.

## Width assumptions

Typical local streets use two 9 ft lanes (18 ft total); service drives use 9 ft and paths 6 ft. The two apartment-side source segments retain the supplied 22 ft width. The proposed campus carriageway is 22 ft, marked as two 9 ft lanes plus 2 ft gutters/shoulders each side. Larger source roads and bridges retain source widths where lane counts are unverified. Widening is constrained at existing buildings and study edges; consult `common_road_schedule.json` for exceptions. These are client-guided assumptions, not surveyed street sizes.

The proposed main parking aisle is 24 ft. There are 22 spaces: nine visitor, nine staff and four parallel resident spaces. Two marked accessible spaces use 3.66 m widths and 1.525 m access aisles. Normal stalls are 2.6 by 5.5 m. Exact property rights, entrance locations and accessibility compliance require verification.

## Proposed grading and limitations

The concept retains existing buildings and adds site grading, retaining edges, six walking arrival profiles, 22 illustrative trees and site furnishings. Six existing tree proxies are designated removal candidates. New trees, vehicles, furnishings and road geometry are proposed, not verified existing conditions.

Design centerline profiles target 8–8.5% maximum road grades and 5% arrival walking grades. Validation of the actual triangulated pavement found local centerline sample grades up to 14.15% at the primary access, 10.61% on the loop, 10.87% secondary, 8.88% cross aisle and 9.46% corner access. Therefore this is an editable visualization concept, not a construction-ready or accessibility/fire-certified plan. Surface transitions and door tie-ins need civil design review. Ground-level previews also expose triangulation/faceting and some terrain-to-pavement intersection artifacts; these have not been fully resolved and this delivery is not a polished final architectural rendering. A simplified vehicle-envelope check is included and is not a swept-path engineering certification.

The existing screenshot-based aerial registration is retained: approximately 44.6% of coverage uses registered user references, with original lower-resolution imagery elsewhere. No new licensed 10–30 cm aerial source was obtained. Imagery and source-photo rights remain with their owners; this is the requested personal prototype, not a redistribution license or imagery quality certification.

## Verification and previews

Both FBX files were reimported into Blender and compared against their export references. All 3,159 building hashes match the baseline; no exported objects are missing; all pavement and sports bodies are closed; used images are packed. Maximum FBX roundtrip point error is 0.031 mm. FormIt import has not been tested. Validation reports include the actual grade limitations above.

`previews` contains actual Blender renders, including both layouts at the same camera angle, entrance, parking, pedestrian and full-neighborhood views. `comparison.png` combines the two actual renders. No AI-generated scene images are used.

`pipeline` contains project-specific scripts and design reports for review. They reference workspace input paths and require the previous screenshot terrain master and original reference data; they are not a standalone one-command rebuild. Blender 4.3.2 was used; geometry planning also uses NumPy, SciPy, Shapely, Pillow and Matplotlib.

Prepared for the migration branch only. Main is unchanged.
