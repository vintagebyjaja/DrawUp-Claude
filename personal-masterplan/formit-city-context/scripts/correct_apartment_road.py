import bpy,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
w=Path('/workspace/formit-city-context');d=w/'delivery';bpy.ops.wm.open_mainfile(filepath=str(d/'FormIt_City_Neighborhood_Context.blend'));sc=bpy.context.scene
# 50th St corridor adjacent to apartment: southern and northern source segments.
selected=['road_local_261','road_local_203'];target=22*.3048
terrain_objects=[o for o in sc.objects if o.type=='MESH' and o.name.startswith('Terrain_')];vs=[];fs=[]
for o in terrain_objects:
 start=len(vs);vs.extend(o.matrix_world@v.co for v in o.data.vertices);fs.extend([start+i for i in p.vertices] for p in o.data.polygons)
tin=BVHTree.FromPolygons(vs,fs,all_triangles=True)
def height(x,y):
 hit=tin.ray_cast(Vector((x,y,1000)),Vector((0,0,-1)))[0]
 return hit.z if hit else None

def interval(points,faces,y):
 xs=[]
 for f in faces:
  poly=[points[i] for i in f]
  for a,b in zip(poly,poly[1:]+poly[:1]):
   if min(a.y,b.y)<=y<=max(a.y,b.y) and abs(b.y-a.y)>1e-8:xs.append(a.x+(b.x-a.x)*(y-a.y)/(b.y-a.y))
 return (min(xs),max(xs)) if xs else None
before={};audit=[]
for o in sc.objects:
 if o.type!='MESH' or not o.name.startswith('road_') or o.name.startswith('road_paths_'):continue
 pp=[o.matrix_world@v.co for v in o.data.vertices];faces=[list(p.vertices) for p in o.data.polygons];xmin=min(p.x for p in pp);xmax=max(p.x for p in pp);ymin=min(p.y for p in pp);ymax=max(p.y for p in pp)
 # Width audit estimates use axis-cross sections; do not assert survey truth.
 vertical=(ymax-ymin)>(xmax-xmin);samples=[]
 if vertical:
  for t in [.25,.5,.75]:
   y=ymin+(ymax-ymin)*t;q=interval(pp,faces,y)
   if q:samples.append(q[1]-q[0])
 else:
  rot=[Vector((p.y,p.x,p.z)) for p in pp]
  for t in [.25,.5,.75]:
   q=interval(rot,faces,xmin+(xmax-xmin)*t)
   if q:samples.append(q[1]-q[0])
 audit.append({'source_object':o.name,'approx_axis_cross_section_widths_m':samples,'status':'Cross-section estimate, may include bends/intersections; not externally verified.'})
 if o.name not in selected:continue
 before[o.name]={'points':pp,'faces':faces,'ymin':ymin,'ymax':ymax}
# Shared combined cross section avoids mismatched widths at the segment seam.
allpoints=[];allfaces=[]
for r in before.values():
 start=len(allpoints);allpoints.extend(r['points']);allfaces.extend([start+i for i in f] for f in r['faces'])
ymin=min(p.y for p in allpoints);ymax=max(p.y for p in allpoints)
def section(y):
 y=max(ymin+3,min(ymax-3,y));l,r=interval(allpoints,allfaces,y);return (l+r)/2,r-l
changes=[]
for name,r in before.items():
 o=bpy.data.objects[name]
 for v,p in zip(o.data.vertices,r['points']):
  c,width=section(p.y);ca,_=section(p.y-.5);cb,_=section(p.y+.5);slope=cb-ca;target_horizontal=target*math.sqrt(1+slope*slope)
  # At sloped end caps, extend the neighboring stable centerline section.
  py=max(ymin+3,min(ymax-3,p.y));slope_end=slope;c+=slope_end*(p.y-py)
  nx=c+(p.x-c)*(target_horizontal/max(width,1e-5));old_ground=height(p.x,p.y);new_ground=height(nx,p.y);nz=p.z if old_ground is None or new_ground is None else p.z+(new_ground-old_ground)
  v.co=o.matrix_world.inverted()@Vector((nx,p.y,nz))
 o.data.update();o['width_authority']='User supplied aerial measurement: 22 ft (6.7056 m) carriageway; XY width corrected locally, terrain-following Z.';changes.append(name)
# Numerical perpendicular width checks through exported road surface cross sections.
newpoints=[];newfaces=[]
for name in selected:
 o=bpy.data.objects[name];start=len(newpoints);newpoints.extend(o.matrix_world@v.co for v in o.data.vertices);newfaces.extend([start+i for i in p.vertices] for p in o.data.polygons)
checks=[]
for y in [300,325,345,385,410,450,475]:
 c,_=section(y);ca,_=section(y-.5);cb,_=section(y+.5);s=cb-ca;normal=Vector((1,-s,0)).normalized();tangent=Vector((s,1,0)).normalized();origin=Vector((c,y,0));rot=[]
 for p in newpoints:
  delta=p-origin;rot.append(Vector((delta.dot(normal),delta.dot(tangent),p.z)))
 q=interval(rot,newfaces,0)
 if q:checks.append({'station_world_y_m':y,'perpendicular_width_m':q[1]-q[0],'width_ft':(q[1]-q[0])/.3048,'error_m':abs(q[1]-q[0]-target)})
report={'corrected_objects':changes,'target_width_ft':22,'target_width_m':target,'authority':'User supplied aerial measurement, not a survey certificate.','checks':checks,'audit_other_roads':audit,'limitations':['Only the identified apartment-side 50th St corridor was corrected to the supplied 22 ft dimension.','Other road widths are source geometry estimates; no verified widths were supplied for them.','Context road surfaces are coarse; intersection corners and sidewalks need independent survey verification.'],'native_FormIt_tested':False}
(d/'validation/road_width_correction.json').write_text(json.dumps(report,indent=2));print('ROAD_CHECKS',json.dumps(checks),flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(d/'FormIt_City_Neighborhood_Context.blend'));bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.fbx(filepath=str(d/'FormIt_City_Neighborhood_Context.fbx'),use_selection=True,object_types={'MESH','EMPTY'},axis_forward='Y',axis_up='Z',apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',use_mesh_edges=False,path_mode='COPY',embed_textures=True,add_leaf_bones=False,use_custom_props=True)
# Updated standalone roads layer at exactly the same world coordinates.
bpy.ops.object.select_all(action='DESELECT')
for o in sc.objects:
 if o.name.startswith('road_') and not o.name.startswith('road_paths_') or o.name=='LAYER_03_Roads_Source':o.select_set(True)
bpy.ops.export_scene.fbx(filepath=str(d/'layers/03_Roads_Source.fbx'),use_selection=True,object_types={'MESH','EMPTY'},axis_forward='Y',axis_up='Z',apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',use_mesh_edges=False,path_mode='COPY',embed_textures=True,add_leaf_bones=False)
