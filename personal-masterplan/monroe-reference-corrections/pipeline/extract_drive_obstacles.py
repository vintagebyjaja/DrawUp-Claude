import bpy,json
from pathlib import Path
w=Path('/workspace/monroe-townhouse-correction');bpy.ops.wm.open_mainfile(filepath='/workspace/monroe-material-update/delivery/02_New_Road_Layout/Monroe_New_Road_Layout.blend');excluded={'P_Two_Way_Road_Network','P_Visitor_Staff_Parking','P_Resident_Parallel_Parking','P_Accessible_Paths_and_Sidewalks','P_Landscape_Lawns','P_Lane_Parking_and_Crosswalk_Paint'};out=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH' or not o.name.startswith('P_') or o.name in excluded or 'Canopy' in o.name or o.get('_proposal_backup'):continue
 out.append({'name':o.name,'vertices':[list(o.matrix_world@v.co) for v in o.data.vertices],'faces':[list(f.vertices) for f in o.data.polygons]})
(w/'drive_obstacles.json').write_text(json.dumps(out));print('OBSTACLES',len(out),flush=True)
