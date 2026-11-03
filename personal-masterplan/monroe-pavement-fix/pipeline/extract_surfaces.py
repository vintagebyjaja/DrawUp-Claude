import bpy,json
from pathlib import Path
w=Path('/workspace/monroe-pavement-fix');src=Path('/workspace/monroe-townhouse-correction/delivery');all_={}
def active(o):return o.type=='MESH' and not any(o.get(k) for k in ['_proposal_backup','_screenshot_backup','_variant_backup','_material_backup','_townhouse_backup'])
for variant,folder,name in [('existing','01_Original_Road_Layout','Monroe_Original_Road_Layout'),('proposed','02_New_Road_Layout','Monroe_New_Road_Layout')]:
 bpy.ops.wm.open_mainfile(filepath=str(src/folder/(name+'.blend')));out=[]
 for o in bpy.context.scene.objects:
  if not active(o):continue
  n=o.name;kind=None
  if n.startswith('road_') and 'bridge' not in n:kind='walk' if '_paths_' in n else 'road'
  elif n.startswith('C_') and ('road_' in n or 'Lincoln_Street' in n):kind='walk' if '_paths_' in n else 'road'
  elif n.startswith('O_Retained_road_'):kind='walk' if '_paths_' in n else 'road'
  elif n.startswith('N_Neighborhood_Sidewalk'):kind='walk'
  elif n in ['P_Two_Way_Road_Network','P_Visitor_Staff_Parking','P_Resident_Parallel_Parking','O_Existing_Campus_Asphalt_and_Parking','C_Townhouse_Concrete_Driveway']:kind='graded_vehicle'
  elif n=='A_Apartment_Garage_Entry_Apron':kind='garage'
  elif n=='A_Apartment_Garage_Apron_Wing_Retaining':kind='wings'
  elif ('Crosswalk' in n or 'Crosswalk' in n.title()) and n.startswith(('N_','C_')):kind='markings'
  if kind:out.append({'name':n,'kind':kind,'vertices':[list(o.matrix_world@v.co) for v in o.data.vertices],'faces':[list(f.vertices) for f in o.data.polygons]})
 all_[variant]=out;print('EXTRACTED',variant,len(out),flush=True)
(w/'surfaces.json').write_text(json.dumps(all_))
