import bpy,json
from pathlib import Path
bpy.ops.wm.open_mainfile(filepath='/workspace/formit-city-context/delivery/FormIt_City_Neighborhood_Context.blend')
result=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH' or not (o.name.startswith('road_') or o.name=='building_2603'):continue
 vs=[o.matrix_world@v.co for v in o.data.vertices];lo=[min(v[i] for v in vs) for i in range(3)];hi=[max(v[i] for v in vs) for i in range(3)]
 if hi[0]<-180 or lo[0]>-20 or hi[1]<230 or lo[1]>430:continue
 result.append({'name':o.name,'min':lo,'max':hi,'vertices':[list(v) for v in vs],'faces':[list(p.vertices) for p in o.data.polygons]})
Path('/workspace/formit-city-context/roads_near_apartment.json').write_text(json.dumps(result))
print('ROADS',[(r['name'],r['min'][:2],r['max'][:2]) for r in result],flush=True)
