"""Blender --background --factory-startup --python validate_monroe.py -- OUTPUT FORMAT"""
import bpy, sys, json, math
from pathlib import Path
from mathutils import Vector

out=Path(sys.argv[sys.argv.index('--')+1]).resolve()
fmt=sys.argv[sys.argv.index('--')+2]
path=out/('Monroe_MasterPlan.'+fmt)
if fmt=='blend': bpy.ops.wm.open_mainfile(filepath=str(path))
else:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 if fmt=='glb':bpy.ops.import_scene.gltf(filepath=str(path))
 elif fmt=='obj':bpy.ops.wm.obj_import(filepath=str(path))
 elif fmt=='fbx':bpy.ops.import_scene.fbx(filepath=str(path))
 else:raise ValueError(fmt)
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
mins=[float('inf')]*3;maxs=[float('-inf')]*3
verts=faces=tris=bad=degenerate=unassigned=0
for o in objects:
 mesh=o.data;verts+=len(mesh.vertices);faces+=len(mesh.polygons)
 tris+=sum(len(p.vertices)-2 for p in mesh.polygons)
 for v in mesh.vertices:
  xyz=o.matrix_world @ v.co
  for i in range(3):
   if not math.isfinite(xyz[i]):bad+=1
   mins[i]=min(mins[i],xyz[i]);maxs[i]=max(maxs[i],xyz[i])
 for p in mesh.polygons:
  if p.area<1e-10:degenerate+=1
  if p.material_index>=len(o.material_slots) or o.material_slots[p.material_index].material is None:unassigned+=1
images=[]
for im in bpy.data.images:
 if im.source=='FILE':
  p=Path(bpy.path.abspath(im.filepath))
  images.append({'name':im.name,'packed':bool(im.packed_file),'exists':p.is_file(),'path':im.filepath})
result={'format':fmt,'file_bytes':path.stat().st_size,'mesh_objects':len(objects),'vertices':verts,'polygons':faces,'triangles':tris,'bounds_min':mins,'bounds_max':maxs,'dimensions':[maxs[i]-mins[i] for i in range(3)],'nonfinite_coordinates':bad,'degenerate_faces':degenerate,'faces_without_material':unassigned,'materials':len({s.material.name for o in objects for s in o.material_slots if s.material}),'images':images}
result['passed']=bool(objects) and verts>0 and tris>0 and bad==0 and degenerate==0 and unassigned==0 and all(i['packed'] or i['exists'] for i in images)
(out/'validation').mkdir(exist_ok=True)
(out/'validation'/f'{fmt}.json').write_text(json.dumps(result,indent=2)+'\n')
print('VALIDATION_RESULT',json.dumps(result))
if not result['passed']:raise RuntimeError('Geometry/material validation failed')
