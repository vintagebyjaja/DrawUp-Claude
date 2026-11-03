# Monroe — reference corrections, original and proposed site options

Both complete neighborhood versions are included as **BLEND, FBX and SketchUp-importable DAE**:

- **01_Original_Road_Layout** — existing campus circulation with restored reference-traced asphalt and parking.
- **02_New_Road_Layout** — redesigned campus circulation, with a widened secondary entrance turn.

The two files use the same coordinates. Import/open one full version at a time. Keep `Shared_Textures` beside the model folders. Blender textures are packed and FBX textures embedded.

## Same buildings; different campus circulation

All **3,155 working building meshes** retain the exact earlier geometry, scale, orientation and position. Their geometry, materials, textures and UVs also match **between the two options**, including the apartments and all three school buildings. See `validation/shared_buildings_between_options.json`. Four earlier stadium massings remain corrected to separate bleacher objects, as in the previous delivery. No further building masses were removed.

The white townhouse row, concrete rear drive, apartment details, street-width reference and recreation features are common to both options. The comparison is about the campus site layout and navigation, not different architecture.

## Townhouses and concrete drive

The four reference townhouses are now light/white masonry with gray foundations and retained roofs/windows. The source CAD massing subdivides the indicated row into six pieces: 3031, 2591, 2391, 2395, 2724 and 3130. All six pieces covering that four-house row are recolored; none is moved, resized or merged.

The concrete rear drive and western access are separate editable volumes, traced approximately from the user oblique image and registered aerial. Older service pavement and sidewalk pieces are trimmed away beneath the new drive to avoid overlapping surfaces. Dimensions and edge positions are approximate, not a survey.

## Apartment courtyard, stairs and garage entry

Both versions include a raised courtyard slab, brick retaining/parapet walls with stone caps and piers, exterior stairs and handrails, and a sloped concrete garage-entry apron with retaining wings. The garage is on the northern wing beside the central western recess; the stair/landing orientation is interpreted against the overhead and oblique references.

The garage appearance is painted into the apartment's existing single facade atlas. **It is not a Boolean opening or a drivable garage interior.** The apartment remains one mesh and one material, including roof, walls, glazing and garage appearance. The courtyard, stairs, walls and apron are separate editable site objects.

The photo supports these features, but their dimensions, heights, riser count and grades are approximate. Current stair interpretation uses 20 risers and a 25.6 m local courtyard floor elevation. Native terrain/lawn is cut only under these site features so it does not cover the apron or stairs. Exact door/floor levels, site grading, guardrail/code dimensions and accessible connections require verified site measurements; this is a visualization model, not an as-built survey or construction detail.

## Original campus asphalt and parking

The original option restores approximately 2,586 m² of asphalt along the apartment/school drive, around the school, at the north turning/parking area and beside the annex. Boundaries are interpreted from registered aerial imagery and the two user oblique views. Existing building footprints are excluded. Parking stripes are separately editable and illustrative, not a certified inventory or surveyed stall count.

This correction fixes pavement that the previous all-grass residual-ground material pass omitted. The proposed option retains the redesigned campus parking and road layout instead of copying the original parking over it.

## Proposed driving clearance

The principal campus carriageway remains **22 ft**, with two nominal 9 ft travel lanes and gutters/shoulders. The main parking aisle remains **24 ft**. The secondary entrance turn is locally widened to approximately **25.3 ft**. Adjacent pavement, paths, curbs, retaining edges and lawn geometry are regenerated; legacy sidewalk bands are trimmed out of the proposed driveway mouths. A retaining edge that crossed the public-street entrance is removed at the access opening.

A planar bicycle-envelope check passes for a 4.8 × 1.95 m passenger car in both directions on the modeled routes and a 9 × 2.5 m concept vehicle around the main loop, against the modeled proposed obstacles. No retained tree centers fall within the proposed road footprint. See `validation/proposed_drive_clearance.json`.

This is a **horizontal concept check**, not a certified traffic, swept-path, emergency-access or civil design. It does not check every parking maneuver, underbody clearance or vertical transition. Previously measured local road-mesh grades reach approximately 14.15%; grades, drainage, retaining work, land rights, accessibility and actual entrance tie-ins still require civil review. Some inherited mesh faceting or terrain/pavement intersections elsewhere may remain.

## Street-width reference

The supplied **33 ft (10.0584 m)** measurement is applied to the matched northern straight portion of Lincoln Heights street, source `road_local_222`, east of the Kelly field. A short transition leads to the unverified southern bend. Its sidewalks are rebuilt outside the widened carriageway and other road intersections. Building footprints constrain widening; no building is moved to force a road width.

This is a user-supplied width reference for that segment, not an independent survey or a width applied to every street. The earlier 22 ft apartment-side reference remains separate. Other uncertain street widths retain the earlier source/client assumptions.

## Shared recreation facilities and Woodson roof

Existing editable baseball grass/dirt, football turf/yard lines/hash marks, running track/lane markings and larger stadium bleachers remain included. Added in both options:

- Woodson: four interpreted tennis courts, separate playing surfaces, markings and nets; two representative small baseball bleacher banks near the additional diamond.
- Kelly Miller north of the school: two interpreted tennis courts, red/green surfaces, markings and nets.
- Kelly Miller south: three interpreted blue tennis courts with green surrounds, markings and nets; the nearby basketball pavement with one marked full court, hoops and backboards.
- Woodson school (`building_1673`): pale cladding and planted roof zones sampled from the registered original aerial and supported by the oblique reference. The existing registered aerial roof colors retain visible panel/roof context, with a planted-zone material accent. Roof UVs are updated to place the finishes spatially; building geometry remains unchanged and the building is still one mesh/material.

Court extents and counts are interpreted from the imagery. Standard playing lines are fitted within those extents; nets, hoop styles, bleacher row counts and exact planted roof boundaries are representative. The supplied basketball crop does not show the whole complex clearly, so one full marked court is illustrative rather than a verified total count. No roof structure or unseen interior was fabricated as a verified condition.

The remaining neighborhood ground still uses material grass with modeled pavement. Unmapped residual ground defaults to grass; this is not a complete land-cover survey. Unreferenced facade colors remain the earlier mixed estimated palette, with confidence notes in the per-building facade evidence reports.

## Verification, previews and SketchUp

Checks cover unchanged native building geometry, identical buildings/appearance across both options, FBX reimport object/triangle/material/position equivalence, closed new pavement/sports/detail bodies, relative texture availability and DAE structure/geometry. Actual preview images are Blender renders of the exported FBX scenes, including a same-camera original/proposed comparison and close views of the corrected features. No AI-generated scene preview is used.

**Native SKP files are not pre-generated here.** This environment has no SketchUp application or native SKP writer. Use the supplied DAE files and `Create_SketchUp_File.rb` inside SketchUp Desktop to import and save native SKP files; see `SKETCHUP_README.md`. Actual SketchUp/FormIt import, component grouping and native SKP appearance remain untested here. Disable mesh-edge display for the material presentation.

`pipeline` contains project-specific scripts and reports referencing earlier workspace datasets. It is not a standalone rebuild without those inputs. The original source geometry and prior published ZIPs remain available; earlier deliveries have not been replaced. Prepared for **migration only**; main is unchanged.

Actual previews: [same-camera comparison](previews/comparison.png), [feature gallery](previews/feature_gallery.png).
