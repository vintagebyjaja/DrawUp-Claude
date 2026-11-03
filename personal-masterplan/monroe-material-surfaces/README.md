# Monroe — material surfaces, facades, sidewalks and editable sports parts

Two full neighborhood versions are included, each as **BLEND, FBX and SketchUp-importable DAE**:

- `01_Original_Road_Layout`: original street alignment with the shared material, sidewalk, crosswalk, sports and bleacher updates.
- `02_New_Road_Layout`: proposed campus circulation layout with the same shared updates.

**No pre-generated native SKP files are included.** This workspace has no SketchUp application/native SKP writer. See `SKETCHUP_README.md` and `Create_SketchUp_File.rb` to import and save each native SKP in SketchUp Desktop. DAE structure/geometry/texture references are checked; actual SketchUp import, grouping and native SKP behavior are not verified here. The previous BLEND/FBX delivery remains available unchanged on migration.

## What changed

The working terrain throughout the original study boundary now uses a grass material instead of a ground photograph. Existing modeled road/path pavement is retained. Unmapped residual ground defaults to grass: this is a presentation scheme, not a new land-cover survey, and does not claim that every unmodeled paved area has been recovered. The existing terrain elevations and footprint coverage remain intact. Existing proposed campus lawns and paving are retained.

The apartment building (`building_2603`) has red lower masonry and the gray upper window row. Windows and roof UV appearance remain in the same material and mesh. The previous blanket neutralization of the surrounding buildings has been undone: the earlier mixed brick/tan/cream context palette is restored except for locally identified light/gray buildings. Four local buildings (2320, 2788, 2066, 2607) retain light facades; five (2011, 2170, 2580, 2792, 3024) retain neutral gray/light finishes. These IDs are interpreted against campus oblique references, especially `Screenshot 2026-11-01 231442.jpg`, `231503.jpg`, `231538.jpg` and `231345.jpg`. Individual material and building identification remain approximate. The school and eastern brick apartment rows retain their earlier reference-informed brick appearance. Unreferenced context colors are explicitly unverified; they are not inferred as exact existing conditions. Per-building evidence status is included in `validation/*_facade_evidence.json`.

New concrete sidewalk bands follow the modeled road edges. They are geometrically subtracted from ALL vehicle pavement, building footprints, existing paths and sports areas; the proposed version also excludes the campus envelope already served by proposed paths. Thus the new sidewalks do not cross vehicle intersections. Source paths were already trimmed at source road crossings in the previous delivery. New zebra crosswalks are separate paint meshes, projected onto actual road surfaces. These are illustrative proposed markings generated at source-geometry junction candidates, not an inventory of existing marked crossings. Sidewalks follow original terrain planes and are 0.14 m thick with their tops 0.18 m above terrain; civil curb ramps and detailed accessible tie-ins have not been engineered at every junction.

## Sports editing

The former single image surfaces have been replaced with individually named mesh objects:

- Kelly Miller baseball grass and dirt, four separate base markers, and two foul lines.
- Woodson baseball/practice-area grass and dirt.
- Football turf, 25 separately selectable five-yard interval lines, two sidelines and a separate hash-mark mesh.
- Running-track surface and six separate lane-marking meshes.

Grass and dirt polygons use the warm-earth pixels of the existing registered aerial reference, cleaned and vectorized. They partition the same prior field boundaries without grass/dirt overlap or coverage gaps. Markers and foul lines are approximate and illustrative; no surveyed diamond size is claimed. The football markings use an illustrative centered 120-yard rectangle (not a verified field survey), and the track lines interpolate between the traced track edges rather than certifying a regulation lane count or track geometry. Edit, hide or recolor the markings separately. Paint meshes are thin raised surfaces; the main grass, dirt, track and sidewalk bodies are closed volumes.

## Bleacher correction and building preservation

Four long stadium-side source masses (`building_1336`, `1530`, `1548`, `1850`) are replaced in the working exports with stepped bleacher objects at the same approximate XY envelope. These are the three eastern stand segments and the western stand visible beside the track. The user's correction and aerial reference support the use as bleachers; row counts, riser heights and construction details are illustrative. Their old source masses are retained in a hidden backup collection in Blender and excluded from working exports.

All other **3,155 building meshes** retain their exact baseline geometry, position, orientation and scale. Each remains one mesh with one material, including its windows, facade and roof appearance. The four authorized bleacher replacements account for the difference from the earlier 3,159 building count. No neighborhood building layout was regenerated.

## Validation and limits

See `validation` for original/proposed geometric overlap checks, grass/dirt partition checks, exact native building hashes, reimported FBX object/point/material checks and closed-volume checks. The DAE checks compare positions, triangle counts, names and relative textures against each native export reference. These checks do not certify the resulting files in SketchUp or FormIt.

All previews are actual Blender renders of the exported FBX scenes. `comparison.png` shows the two updated road layouts from the same camera; `prior_vs_updated.png` compares the previous delivery with this update. No AI-generated preview is used.

Street widths remain the previous client-guided assumptions: typical 9 ft lanes, 18 ft local two-way pavement, the supplied 22 ft apartment-side carriageway, a proposed 22 ft campus carriageway and 24 ft main parking aisle. Larger ambiguous streets retain prior widths; these are not survey-verified. The proposed road grading remains a concept, with previously measured local sample grades up to approximately 14.15%; engineering, drainage, accessibility, fire access, curb ramps, land rights and door tie-ins require civil review. Some older proposed pavement faceting/terrain intersections may remain. This update does not claim to resolve those inherited engineering and rendering limitations.

Keep `Shared_Textures` beside both model folders. Blender textures are also packed; FBX textures are embedded. Disable mesh edges/outlines in the receiving application for the material presentation. The included SketchUp conversion script hides only coplanar triangulation edges after import. Open/import only ONE full neighborhood version at a time to avoid duplicate overlapping geometry.

`pipeline` contains project-specific scripts referring to previous workspace datasets. It is not a standalone rebuild without the prior source files. Prepared and published on **migration only**; main is unchanged.
