import bpy,json,hashlib
from pathlib import Path
w=Path('/workspace/monroe-screenshot/delivery');bpy.ops.wm.open_mainfile(filepath=str(w/'Monroe_Screenshot_Terrain.blend'));manifest=json.loads((w/'textures/screenshot_manifest.json').read_text());checked=[]
for tile in manifest['tiles']:
 mat=bpy.data.materials['Screenshot ground | '+tile['id']];image=next(n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE');assert image.filepath.endswith(tile['high']) and image.packed_file;checked.append(tile['id'])
assert bpy.context.scene.camera is not None
buildings=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('building_')];assert len(buildings)==3159 and all(len(o.data.materials)==1 for o in buildings)
plan=json.loads(Path('/workspace/monroe-hd/delivery/imagery_plan.json').read_text());source_unchanged=hashlib.sha256(Path(plan['baseline_blend']).read_bytes()).hexdigest()==plan['baseline_sha256'];assert source_unchanged
result={'passed':True,'native_full_size_tiles_packed':len(checked),'building_meshes':len(buildings),'each_building_one_material':True,'saved_cameras':len([o for o in bpy.context.scene.objects if o.type=='CAMERA']),'active_camera':bpy.context.scene.camera.name,'original_baseline_file_unchanged':source_unchanged};(w/'validation/final_native_check.json').write_text(json.dumps(result,indent=2));print('FINAL_NATIVE',json.dumps(result),flush=True)
