# Monroe: original and proposed site, pavement and material corrections

Both complete neighborhood models are included. The original and proposed options share exactly the same 3,155 building meshes, world coordinates, dimensions, orientation, UVs and facade finishes. Only site circulation differs. Buildings remain individually named/selectable. Work is for the migration branch; main is unchanged.

## Included formats

Each layout contains BLEND, embedded-texture FBX and COLLADA DAE. Keep Shared_Textures beside the two model folders. Import one version at a time. These are editable meshes, not parametric BIM solids. Native SKP is not pre-generated or tested: use SketchUp Desktop and the supplied Ruby helper to import DAE and save SKP. See SKETCHUP_README.md.

## Corrections

- Rebuilt 645 original / 642 proposed road surfaces. The 642 / 639 unverified nominal road widths increase by 22/14 (about 57%). Known 22-foot apartment streets and the 33-foot Lincoln reference remain calibrated separately. Existing designed private campus drives retain 22 feet, and parking aisles 24 feet. Buildings are fixed obstacles: constrained locations are clipped rather than changing a building. Width schedules document these constraints. This is not a uniform scale of the model.
- Road top triangles follow the original terrain TIN at +0.04 m, with 0.20 m extrusions. Sidewalks follow terrain at +0.18 m, with 0.14 m thickness. Bridge grades remain as sourced. Vehicle junctions are partitioned; pedestrian pavement is clipped outside vehicle pavement. Existing pedestrian routes are retained and roadside walks expanded. New roadside paths are conceptual where reference coverage is incomplete.
- Garage apron stops outside the carriageway. Its footprint decreases from about 70.8 to 48.5 square metres; the threshold is corrected to local curb grade (19.635 m). The matching door is a facade representation, without a modeled garage interior. Original building mesh is unchanged.
- Original school parking includes the supplied 60-foot module: 18-foot stalls, 24-foot aisle and 18-foot stalls. Main-row striping uses 9-foot spacing, with a separate angled annex row. Proposed parking retains its alternate arrangement.
- School building_2356 has a reference-informed brick/concrete facade with window bands and pale piers. Its original massing and roof are retained. A separately editable concrete forecourt follows the long west elevation, with planted openings and no vehicle overlap. Obscured facade details, bay dimensions and forecourt edges are approximate, not a measured facade survey.
- Baseball dirt boundaries are smooth vector shapes, not pixel outlines. Dirt, grass and markings remain separate editable parts. Two tiny existing building-shaped objects near Woodson baseball are preserved pending confirmation of their identity; no additional building has been removed.
- Woodson building_1673 uses a generated grass roof material. Corner building_2664 uses red brick and white existing column/pilaster finishes. Thirty-two long housing blocks receive white roof finishes. All are finish changes with unchanged building geometry.
- No screenshot or aerial textures are used on terrain, sports grounds or roofs. Unused screenshot backups/assets are removed from this delivery. Building facade atlases remain; a generated courtyard brick tile is retained. Prior releases are unaffected.

## Verification and previews

The validation folder contains exact native building geometry checks, independent FBX reimport checks, cross-option building geometry/material/UV comparisons and COLLADA geometry/texture checks. Road/garage/sidewalk interference reports compare actual reimported FBX surface triangles against each other and the original terrain. New closed pavement/sports meshes are checked for edge incidence; existing deliberately open landscape surfaces are labeled separately.

Previews are actual Blender renders of the working exports, not generated concept images. Both campus views use the same camera. Close views show garage, junction, baseball, grass roof, housing roofs, corner facade, original parking and school facade/forecourt.

This is an architectural study, not surveyed civil design. Inherited terrain/private-road grading can be steep (about 14% in a prior checked segment); widening is not a vehicle swept-path or accessibility certification. Trees remain approximate proxies. Check drainage, grades, utilities, turning and SketchUp import before construction/design reliance. No utility-clearance certification is made.

The pipeline folder contains the project-specific source scripts for review. They reference working inputs outside this ZIP and are not a standalone rebuild kit. Complete exported models and required textures are included.
