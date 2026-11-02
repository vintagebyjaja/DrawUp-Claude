import bpy,sys,json,shutil,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from screenshot_terrain import apply_manifest
w=Path('/workspace/monroe-screenshot');d=w/'delivery';baseline=Path('/workspace/formit-city-context/delivery/FormIt_City_Neighborhood_Context.blend');manifestpath=d/'textures/screenshot_manifest.json';manifest=json.loads(manifestpath.read_text());shutil.copytree(baseline.parent/'textures',d/'textures',dirs_exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(baseline));scene=bpy.context.scene
baseline_hashes={o.name:hashlib.sha256(json.dumps({'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'faces':[list(p.vertices) for p in o.data.polygons]},separators=(',',':')).encode()).hexdigest() for o in scene.objects if o.type=='MESH' and not o.name.startswith('Terrain_')}
report=apply_manifest(manifestpath);scene['screenshot_imagery_manifest']='//textures/screenshot_manifest.json';scene['imagery_accuracy']='User-authorized screenshot approximation; not verified orthophotography. Original imagery retained outside registered screenshot coverage.';scene['building_ground_mask']='Aerial roof/footprint depiction masked beneath each source building mesh. Local ground infill approximate.'
for mat in bpy.data.materials:
 if mat.get('manifest_path'):mat['manifest_path']='//textures/screenshot_manifest.json'
for image in bpy.data.images:
 if image.source=='FILE' and image.users:
  name=Path(image.filepath).name;p=d/'textures'/name
  if p.exists():image.pack();image.filepath='//textures/'+name
bpy.ops.wm.save_as_mainfile(filepath=str(d/'Monroe_Screenshot_Terrain.blend'))
# Static FBX has all full-resolution tiles; BLEND overview plus optional script LOD.
for tile in manifest['tiles']:
 mat=bpy.data.materials['Screenshot ground | '+tile['id']];node=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE');node.image=bpy.data.images.load(str(d/'textures'/tile['high']),check_existing=True);node.image.pack()
working=[o for o in scene.objects if o.type=='MESH' and not o.get('_screenshot_backup')];reference=[]
for o in working:
 points=[list(o.matrix_world@v.co) for v in o.data.vertices];reference.append({'name':o.name,'points':points,'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'materials':len(o.data.materials),'uv':{'name':o.data.uv_layers.active.name,'values':[list(v.uv) for v in o.data.uv_layers.active.data]} if o.data.uv_layers.active else None})
(w/'export_reference.json').write_text(json.dumps(reference))
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
 if o.type in {'MESH','EMPTY'} and not o.get('_screenshot_backup'):o.select_set(True)
bpy.ops.export_scene.fbx(filepath=str(d/'Monroe_Screenshot_Terrain.fbx'),use_selection=True,object_types={'MESH','EMPTY'},axis_forward='Y',axis_up='Z',apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',use_mesh_edges=False,path_mode='COPY',embed_textures=True,add_leaf_bones=False,use_custom_props=True)
report.update(baseline_blend_sha256=hashlib.sha256(baseline.read_bytes()).hexdigest(),source_nonterrain_geometry_hashes=baseline_hashes,building_mesh_materials={o.name:len(o.data.materials) for o in working if o.name.startswith('building_')},screenshot_coverage_fraction=manifest['screenshot_coverage_fraction'],license_or_survey_accuracy_claimed=False,terrain_original_backup_excluded_from_FBX=True,FBX_streaming=False,BLEND_optional_LOD=True)
(d/'validation/scene_update.json').write_text(json.dumps(report,indent=2));print('SCENE_UPDATED',len(working),report['relative_area_error'],flush=True)
