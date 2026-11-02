import bpy,json,hashlib
from pathlib import Path
w=Path('/workspace/monroe-screenshot');d=w/'delivery'
def uv_digest(o):
 uv=o.data.uv_layers.active
 if not uv:return None
 values=set(tuple(round(float(x),5) for x in (*(o.matrix_world@o.data.vertices[o.data.loops[i].vertex_index].co),*v.uv)) for i,v in enumerate(uv.data))
 return hashlib.sha256(json.dumps(sorted(values),separators=(',',':')).encode()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(d/'Monroe_Screenshot_Terrain.blend'));expected={o.name:uv_digest(o) for o in bpy.context.scene.objects if o.type=='MESH' and not o.get('_screenshot_backup')};bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath=str(d/'Monroe_Screenshot_Terrain.fbx'));observed={o.name:o for o in bpy.context.scene.objects if o.type=='MESH'};bad=[name for name,digest in expected.items() if name not in observed or uv_digest(observed[name])!=digest];manifest=json.loads((d/'textures/screenshot_manifest.json').read_text());tilechecks=[]
for tile in manifest['tiles']:
 mat=bpy.data.materials['Screenshot ground | '+tile['id']];image=next(n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE');match=bool(image.packed_file) and hashlib.sha256(bytes(image.packed_file.data)).hexdigest()==tile['sha256_high'];tilechecks.append({'tile':tile['id'],'embedded_bytes_match_texture_file':match})
report={'passed':not bad and all(t['embedded_bytes_match_texture_file'] for t in tilechecks),'UV_meshes_checked':len(expected),'UV_failures':bad,'embedded_tile_checks':tilechecks};(d/'validation/UV_and_texture_integrity.json').write_text(json.dumps(report,indent=2));print('UV_TEXTURE_TEST',json.dumps(report),flush=True);assert report['passed']
