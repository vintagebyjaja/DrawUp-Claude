# SketchUp Desktop import

This package contains **DAE (Collada), FBX and BLEND files, not pre-generated native SKP files**. This Linux workspace has no SketchUp application or native SKP exporter. Native SketchUp conversion and its import appearance have not been tested here.

1. Extract the ENTIRE ZIP. Keep `Shared_Textures` beside both model folders.
2. In SketchUp Desktop, open a new empty document. Remove any default scale figure, then save the empty document so it is unmodified.
3. Open Window > Ruby Console (the location varies by SketchUp version), and run:

   `load '/full/path/to/Monroe_Pavement_Fix/Create_SketchUp_File.rb'`

   On Windows, use forward slashes in the full path, for example `load 'C:/Users/YourName/Downloads/Monroe_Pavement_Fix/Create_SketchUp_File.rb'`.
4. Choose Original or Proposed. SketchUp imports the DAE and saves its own native SKP in `Converted_SKP`.
5. Start another empty document and repeat for the other layout.

Alternatively use **File > Import > COLLADA (.dae)**, select one model, then **Save As .skp**. The script requires a Desktop edition with Ruby support; SketchUp for Web cannot run it.

The DAE uses meters, Z-up, one named geometry node per working mesh, and relative texture paths. Building nodes remain separate. Sports parts and sidewalk/crosswalk nodes are individually named. Confirm that the importer preserves grouping and scale before editing. Imported buildings are textured mesh objects, not parametric BIM solids. Native SketchUp component behavior is unverified.

Large neighborhood models can take several minutes to import. These files retain the whole study area, including 3,155 building meshes plus four corrected bleacher objects. Geometric export checks are provided, but do not replace checking the actual SketchUp import.
