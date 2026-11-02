import bpy,json
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
work=Path('/workspace/formit-city-layered');out=work/'delivery';ref=json.loads((out/'validation/geometry_reference.json').read_text());results=[]
for path in sorted((out/'layers').glob('*.fbx')):
 expected={r['name']:r for r in ref if r['parent_root']=='LAYER_'+path.stem}
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath=str(path));actual={o.name:o for o in bpy.context.scene.objects if o.type=='MESH'};error=0;bad=[]
 for name,r in expected.items():
  if name not in actual:bad.append(name);continue
  o=actual[name];points=[o.matrix_world@v.co for v in o.data.vertices];tree=KDTree(len(points))
  for i,p in enumerate(points):tree.insert(p,i)
  tree.balance();error=max(error,max(tree.find(Vector(p))[2] for p in r['points']))
  if sum(len(p.vertices)-2 for p in o.data.polygons)!=r['triangles']:bad.append(name+' triangle count')
 roots={o.name for o in bpy.context.scene.objects if o.type=='EMPTY'}
 results.append({'file':path.name,'expected_meshes':len(expected),'observed_meshes':len(actual),'max_vertex_error_m':error,'failed_objects':bad,'passed':set(actual)==set(expected) and not bad and error<.001 and 'LAYER_'+path.stem in roots})
(out/'validation/separate_layer_files.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2));assert all(r['passed'] for r in results)
