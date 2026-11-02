import bpy,json
from pathlib import Path
w=Path('/workspace/monroe-screenshot');bpy.ops.wm.open_mainfile(filepath='/workspace/formit-city-context/delivery/FormIt_City_Neighborhood_Context.blend');scene=bpy.context.scene
terrain=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('Terrain_')];uv_samples=[];triangles=[]
for o in terrain:
 uv=o.data.uv_layers.active
 for p in o.data.polygons:
  points=[list(o.matrix_world@o.data.vertices[i].co) for i in p.vertices];uvs=[list(uv.data[i].uv) for i in p.loop_indices];triangles.append({'points':points,'uv':uvs})
  if len(uv_samples)<1000:uv_samples.extend({'xy':p[:2],'uv':u} for p,u in zip(points,uvs))
buildings=[]
for o in scene.objects:
 if o.type=='MESH' and o.name.startswith('building_'):
  buildings.append({'name':o.name,'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'faces':[list(p.vertices) for p in o.data.polygons]})
(w/'registration_geometry.json').write_text(json.dumps({'uv_samples':uv_samples,'terrain':triangles,'buildings':buildings}));print('EXTRACTED',len(buildings),len(triangles),flush=True)
