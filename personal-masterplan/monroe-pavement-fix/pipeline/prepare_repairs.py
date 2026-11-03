import sys,json,math,hashlib,collections
from pathlib import Path
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps')
sys.path.insert(0,'/workspace/monroe-road-redesign/scripts')
import numpy as np
from shapely import constrained_delaunay_triangles,STRtree,set_precision
from shapely.geometry import Polygon,Point,LineString,box,shape
from shapely.ops import unary_union,nearest_points
from scipy.spatial import cKDTree
from site_geometry import load_terrain
w=Path('/workspace/monroe-pavement-fix');src=Path('/workspace/monroe-townhouse-correction');raw=json.loads(Path('/workspace/monroe-screenshot/registration_geometry.json').read_text());surfaces=json.loads((w/'surfaces.json').read_text());T=load_terrain();FACTOR=22/14
# Reuse exact original TIN clipping, never a long coarse road triangle spanning terrain folds.
ns={};exec(Path('/workspace/monroe-material-update/scripts/prepare_geometry.py').read_text().split('# Existing image-derived baseball dirt')[0],ns);region=ns['mesh_region'];B=ns['B'];cache={}
repairns={};code=Path('/workspace/monroe-material-update/scripts/repair_surface_topology.py').read_text().split("for name in ['existing_additions.json'")[0];code=code.replace("depth=.14 if r['name'].startswith('N_Neighborhood') else .006","depth=r.get('depth',.18)");exec(code,repairns);repair=repairns['repair']
def clean(g):
 if g.is_empty:return g
 g=set_precision(g,1e-4)
 if g.geom_type=='Polygon':return g if g.area>.025 else Polygon()
 return unary_union([p for p in getattr(g,'geoms',[]) if p.geom_type=='Polygon' and p.area>.025])
def footprint(r):
 v=np.array(r['vertices']);N=len(v)//2
 return clean(unary_union([Polygon(v[f,:2]) for f in r['faces'] if all(i<N for i in f) and len(f)>=3]))
def exact(name,poly,offset,depth,material,split=False):
 poly=clean(poly)
 if poly.is_empty:return []
 key=hashlib.sha256(poly.wkb+str((offset,depth,split)).encode()).hexdigest()
 if key not in cache:
  parts=region('mesh',poly,offset,depth,material,split)
  for part in parts:
   N=len(part['vertices'])//2;seen=set();top=[]
   for f in part['faces']:
    if not all(i<N for i in f) or len(set(f))<3:continue
    key=tuple(sorted(f))
    if key in seen:continue
    seen.add(key);top.append(f)
   part['faces']=top;part['depth']=depth;repair(part)
  cache[key]=parts
 out=[]
 for i,r in enumerate(cache[key]):out.append({**r,'name':name+('_%03d'%i if split or len(cache[key])>1 else ''),'material':material})
 return out
common={r['name']:r for r in json.loads(Path('/workspace/monroe-two-layouts/common_road_meshes.json').read_text())};old222=shape(common['road_local_222']['footprint']);verified={'road_local_203','road_local_261'}
# Geometry and widths are calibrated in the horizontal plane; buildings are obstacles, never scaled.
for variant,data in surfaces.items():
 for r in data:r['poly']=footprint(r)
 print('FOOTPRINTS',variant,len(data),flush=True)
 original_by_name={r['name']:r for r in data};roads=[r for r in data if r['kind']=='road'];walks=[r for r in data if r['kind']=='walk'];extras=[r for r in data if r['kind']=='graded_vehicle'];out=[];retire=[];schedule=[];covered=Polygon()
 def base_name(n):
  if n.startswith('road_'):return n
  for k in common:
   if n.endswith(k):return k
  return n
 def priority(r):
  n=r['name'];b=base_name(n)
  if b in verified or 'Lincoln_Street' in n:return 0
  return 1 if 'arterial' in n else 2 if 'collector' in n else 3 if 'local' in n else 4
 expanded=[]
 for r in sorted(roads,key=priority):
  n=r['name'];base=base_name(n);old=r['poly'];nom=common.get(base,{}).get('nominal_pavement_width_m') or 2.7432
  if 'Lincoln_Street' in n:poly=old222.buffer((10.0584-5.4864)/2,quad_segs=6);target=10.0584;status='33 ft user reference, extended along the same matched street'
  elif base in verified:poly=old;target=6.7056;status='22 ft user reference retained'
  else:target=nom*FACTOR;poly=old.buffer((target-nom)/2,quad_segs=6);status='unverified carriageway widened by 22/14'
  before=poly.area;poly=clean(poly.difference(B));constrained=before-poly.area
  usable=clean(poly.difference(covered));covered=unary_union([covered,poly]);expanded.append((n,poly));retire.append(n)
  out+=exact('F_'+n,usable,.04,.20,'asphalt')
  
  if len(schedule)%100==0:print('ROADS_REBUILT',variant,len(schedule),flush=True)
  schedule.append({'source':n,'old_nominal_m':nom,'target_width_m':target,'target_width_ft':target/.3048,'area_constrained_at_buildings_m2':constrained,'policy':status})
 streetUnion=covered;print('ROAD_WIDTHS',variant,len(roads),flush=True)
 # Existing designed campus pavement keeps the stated 22 ft carriageway /24 ft parking aisle; public streets are widened above.
 privateRoad=Polygon();privateVehicle=Polygon()
 for r in extras:
  n=r['name'];poly=clean(r['poly'].difference(streetUnion));retire.append(n)
  if n=='P_Two_Way_Road_Network':
   # Keep graded surface for this designed road; repair overlaps by clipping its existing top triangles below.
   privateRoad=poly;privateVehicle=unary_union([privateVehicle,poly]);out.append({'name':'F_'+n,'source_clip':n,'clip_to':poly.__geo_interface__,'depth':.20,'material':'asphalt'})
  elif n.startswith('P_'):
   privateVehicle=unary_union([privateVehicle,poly]);out.append({'name':'F_'+n,'source_clip':n,'clip_to':poly.__geo_interface__,'depth':.18,'material':'asphalt'})
  else:
   if variant=='existing' and n=='O_Existing_Campus_Asphalt_and_Parking':
    # 60 ft = 18 ft stall +24 ft aisle +18 ft stall; fit below the existing school wall.
    module=box(-13.8,346.212,20.0,364.5).difference(B);poly=clean(unary_union([poly,module]).difference(streetUnion))
   privateVehicle=unary_union([privateVehicle,poly]);out+=exact('F_'+n,poly,.04,.18,'concrete' if 'Concrete_Driveway' in n else 'asphalt')
 vehicle=unary_union([streetUnion,privateVehicle]);print('VEHICLE_UNION',variant,flush=True)
 garage=next(r for r in data if r['kind']=='garage');oldpad=garage['poly'];pad=clean(oldpad.difference(vehicle.buffer(.02)).difference(B));retire+= [garage['name']]+[r['name'] for r in data if r['kind']=='wings'];padmeshes=exact('F_Garage_Apron',pad,.04,.18,'concrete')
 bld=next(b for b in raw['buildings'] if b['name']=='building_2603');bp=np.array(bld['points']);bpoly=unary_union([Polygon(bp[f,:2]) for f in bld['faces'] if Polygon(bp[f,:2]).area>.01]).buffer(.20)
 boundary_vertices=[]
 for m in padmeshes:
  N=len(m['vertices'])//2
  for i,v in enumerate(m['vertices']):
   q=Point(v[:2]);rd=max(vehicle.distance(q)-.02,0);bd=bpoly.distance(q);a=rd/max(rd+bd,1e-8);pnt=nearest_points(q,vehicle)[1];curbz=float(T(pnt.x,pnt.y))+.04;v[2]=(1-a)*curbz+a*22.02-(.18 if i>=N else 0)
   if i<N and rd<.005:boundary_vertices.append(abs(v[2]-curbz))
 out+=padmeshes;vehicle=unary_union([vehicle,pad]);out+=exact('F_Garage_Base_Ground_Restored',oldpad.difference(pad).difference(B),0.,.10,'grass')
 # Remove raised walkways from every carriageway and rebuild missing roadside walks at the expanded edges.
 vclear=vehicle.buffer(.025);existingWalk=unary_union([r['poly'] for r in walks]);retire += [r['name'] for r in walks]
 ring=clean(streetUnion.buffer(1.85,quad_segs=4).difference(vclear).difference(existingWalk).difference(B))
 footCovered=clean(unary_union([existingWalk,ring]).difference(vclear).difference(B))
 out+=exact('F_Continuous_Sidewalk',footCovered,.18,.14,'concrete',True)
 restoreWalk=clean(vehicle.buffer(1.85).difference(vclear).intersection(oldpad).difference(pad).difference(footCovered).difference(B));out+=exact('F_Garage_Sidewalk_Restored',restoreWalk,.18,.14,'concrete')
 print('SIDEWALK_NETWORK_REBUILT',variant,flush=True)
 # Refit zebra stripes to the actual widened carriageways, avoiding old floating/short stripes.
 for r in [r for r in data if r['kind']=='markings']:
  retire.append(r['name']);poly=r['poly'];parts=[]
  for stripe in ([poly] if poly.geom_type=='Polygon' else poly.geoms):
   if stripe.is_empty:continue
   v=np.array(stripe.minimum_rotated_rectangle.exterior.coords)[:4];d=np.roll(v,-1,0)-v;axis=d[np.argmax(np.linalg.norm(d,axis=1))];axis/=max(np.linalg.norm(axis),1e-9);c=np.array(stripe.centroid.coords[0]);line=LineString([c-axis*25,c+axis*25]);cut=line.intersection(vehicle)
   if cut.geom_type=='MultiLineString':cut=min(cut.geoms,key=lambda g:g.distance(stripe.centroid))
   if cut.geom_type=='LineString' and 2<cut.length<23:parts.append(cut.buffer(.16,cap_style='flat').intersection(vehicle))
  out+=exact('F_'+r['name'],unary_union(parts),.055,.006,'paint')
 # Preserve source stair/courtyard geometry and restore field boundaries with smooth reference-shaped curves.
 p=json.loads((src/'driveway_geometry.json').read_text());fields={r['name']:shape(r['geometry']) for r in json.loads(Path('/workspace/monroe-two-layouts/sports_shapes.json').read_text())}
 home=np.array([378.,388.]);angles=np.linspace(math.pi/2,math.pi,121);fan=Polygon([home.tolist()]+[(home+36*np.array([math.cos(a),math.sin(a)])).tolist() for a in angles]+[home.tolist()]).intersection(fields['E_Woodson_Baseball_Practice_Field'])
 kel=fields['E_Baseball_Field'];bounds=kel.bounds
 def pix(x,y):return (bounds[0]+x/755*(bounds[2]-bounds[0]),bounds[3]-y/418*(bounds[3]-bounds[1]))
 outer=Polygon([pix(x,y) for x,y in [(274,85),(474,84),(474,279),(450,297),(411,309),(360,303),(312,285),(283,248),(260,211),(259,171),(260,127)]]).buffer(1.0).buffer(-1.0);inner=Polygon([pix(x,y) for x,y in [(337,106),(448,106),(448,224),(337,224)]]);mound=Point(pix(400,160)).buffer(2.3,quad_segs=24);dirt=outer.difference(inner).union(mound).intersection(kel)
 for name,parcel,soil in [('E_Woodson_Baseball_Practice_Field',fields['E_Woodson_Baseball_Practice_Field'],fan),('E_Baseball_Field',kel,dirt)]:
  retire+=[name+'_Grass',name+'_Dirt'];out+=exact(name+'_Grass',parcel.difference(soil),.045,.12,'sports_grass')+exact(name+'_Dirt',soil,.045,.12,'dirt')
 # Retire source caps/rail fragments only when a repaired surface replaces their geometry elsewhere.
 report={'width_factor_unverified':FACTOR,'source_road_segments_rebuilt':len(roads),'sidewalk_old_segments_rebuilt':len(walks),'new_roadside_sidewalk_area_m2':ring.area,'garage_old_area_m2':oldpad.area,'garage_new_area_m2':pad.area,'garage_overlap_with_carriageway_m2':pad.intersection(vehicle.difference(pad)).area,'garage_mouth_max_vertical_step_m':max(boundary_vertices,default=0),'buildings_moved_or_scaled':False,'schedule':schedule,'footway_overlap_with_vehicle_m2':footCovered.intersection(vehicle).area,'field_method':'Smooth reference-shaped grass/dirt boundaries, not pixel-run contours. Source building footprints unchanged.'}
 (w/(variant+'_repairs.json')).write_text(json.dumps({'replacements':out,'retire':sorted(set(retire)),'vehicle_footprint':vehicle.__geo_interface__,'walk_footprint':footCovered.__geo_interface__,'garage_footprint':pad.__geo_interface__}));(w/'delivery/validation'/(variant+'_surface_plan.json')).write_text(json.dumps(report,indent=2));print('REPAIRS_READY',variant,len(out),flush=True)
