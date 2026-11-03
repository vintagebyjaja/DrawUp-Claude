import bpy,json
from pathlib import Path
w=Path('/workspace/monroe-pavement-fix');src=Path('/workspace/monroe-townhouse-correction/delivery');out={}
for variant,folder,name in [('existing','01_Original_Road_Layout','Monroe_Original_Road_Layout'),('proposed','02_New_Road_Layout','Monroe_New_Road_Layout')]:
 bpy.ops.wm.open_mainfile(filepath=str(src/folder/(name+'.blend')));rows=[]
 for n in ['P_Landscape_Lawns','P_Concrete_Curbs','P_Cut_Fill_Retaining_Edges']:
  o=bpy.data.objects.get(n)
  if o:rows.append({'name':n,'vertices':[list(o.matrix_world@v.co) for v in o.data.vertices],'faces':[list(f.vertices) for f in o.data.polygons]})
 out[variant]=rows
(w/'auxiliary.json').write_text(json.dumps(out))
