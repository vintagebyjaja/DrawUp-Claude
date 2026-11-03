import bpy,json
from pathlib import Path
w=Path('/workspace/monroe-pavement-fix');d=w/'delivery'
for variant,folder,name in [('existing','01_Original_Road_Layout','Monroe_Original_Road_Layout'),('proposed','02_New_Road_Layout','Monroe_New_Road_Layout')]:
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath=str(d/folder/(name+'.fbx')));plan=json.loads((w/(variant+'_repairs.json')).read_text());vehicle={r['name'] for r in plan['replacements'] if r['material'] in ['asphalt','concrete'] and not any(k in r['name'] for k in ['Sidewalk','Pedestrian','Forecourt','Curbs','Retain'])};walks={r['name'] for r in plan['replacements'] if any(k in r['name'] for k in ['Sidewalk','Pedestrian','Forecourt'])};source=json.loads((w/'surfaces.json').read_text())[variant];streets={'F_'+r['name'] for r in source if r['kind']=='road'};out=[]
 for o in bpy.context.scene.objects:
  if o.type!='MESH' or o.name not in vehicle|walks:continue
  triangles=[];o.data.calc_loop_triangles()
  for t in o.data.loop_triangles:
   if t.normal.z<.05:continue
   triangles.append([list(o.matrix_world@o.data.vertices[i].co) for i in t.vertices])
  out.append({'name':o.name,'kind':'garage' if o.name=='F_Garage_Apron' else 'walk' if o.name in walks else 'street' if o.name in streets else 'vehicle','triangles':triangles})
 (w/(variant+'_export_surfaces.json')).write_text(json.dumps(out));print('ACTUAL_EXPORT_SURFACES',variant,len(out),flush=True)
