import bpy,json
from pathlib import Path
w=Path('/workspace/monroe-two-layouts');bpy.ops.wm.open_mainfile(filepath='/workspace/monroe-screenshot/delivery/Monroe_Screenshot_Terrain.blend');out=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH' or not(o.name.startswith('road_') or o.name.startswith('Terrain_')) or o.get('_screenshot_backup'):continue
 out.append({'name':o.name,'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'faces':[list(p.vertices) for p in o.data.polygons],'uv':[list(v.uv) for v in o.data.uv_layers.active.data] if o.data.uv_layers.active else None})
(w/'existing_sources.json').write_text(json.dumps(out));print('EXISTING_SOURCES',len(out),flush=True)
