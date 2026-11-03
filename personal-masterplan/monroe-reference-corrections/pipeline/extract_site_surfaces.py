import bpy,json
from pathlib import Path
w=Path('/workspace/monroe-townhouse-correction');src=Path('/workspace/monroe-material-update/delivery');out={}
for variant,folder,name in [('existing','01_Original_Road_Layout','Monroe_Original_Road_Layout'),('proposed','02_New_Road_Layout','Monroe_New_Road_Layout')]:
 bpy.ops.wm.open_mainfile(filepath=str(src/folder/(name+'.blend')));records=[]
 for o in bpy.context.scene.objects:
  if o.type!='MESH' or not(o.name.startswith('Terrain_') or o.name=='P_Landscape_Lawns') or any(o.get(k) for k in ['_proposal_backup','_screenshot_backup','_variant_backup','_material_backup']):continue
  pts=[list(o.matrix_world@v.co) for v in o.data.vertices]
  apt=not(max(p[0] for p in pts)<-97 or min(p[0] for p in pts)>-73 or max(p[1] for p in pts)<343 or min(p[1] for p in pts)>371)
  sec=not(max(p[0] for p in pts)<-50 or min(p[0] for p in pts)>-18 or max(p[1] for p in pts)<268 or min(p[1] for p in pts)>300)
  if not(apt or sec):continue
  records.append({'name':o.name,'vertices':pts,'faces':[list(f.vertices) for f in o.data.polygons],'uv':[list(v.uv) for v in o.data.uv_layers.active.data] if o.data.uv_layers.active else None})
 out[variant]=records
(w/'site_surface_inputs.json').write_text(json.dumps(out));print('EXTRACTED_SURFACES',[(k,len(v)) for k,v in out.items()],flush=True)
