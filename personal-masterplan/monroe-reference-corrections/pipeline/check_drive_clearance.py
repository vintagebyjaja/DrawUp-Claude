import sys,json,math,numpy as np
from pathlib import Path
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps')
from shapely.geometry import Polygon,LineString,shape,box
from shapely.ops import unary_union
from shapely import STRtree
w=Path('/workspace/monroe-townhouse-correction');proposal=json.loads(Path('/workspace/monroe-access-revision/proposal.json').read_text());plan=json.loads((w/'driveway_geometry.json').read_text());roads=json.loads(Path('/workspace/monroe-two-layouts/common_road_meshes.json').read_text());drivable=unary_union([shape(proposal['road_shape'])]+[shape(r['footprint']) for r in roads if r['family']!='paths']+[box(-6,335.5,22,353.8152)])
obstacles=[];names=[]
for r in json.loads((w/'drive_obstacles.json').read_text()):
 name=r['name']
 replacement=next((a for a in proposal['meshes'] if a['name']==name),None)
 if replacement:r=replacement
 if any(k in name for k in ['Mark','Arrow','Circle','Stem']):continue
 p=np.array(r['vertices'])
 if p[:,2].max()-p[:,2].min()<.045:continue
 parts=[]
 for f in r['faces']:
  xy=p[f,:2];poly=Polygon(xy)
  if poly.is_valid and poly.area>1e-7:parts.append(poly)
  elif 'Retaining' in name and len(xy)>=2:parts.append(LineString(xy).buffer(.04))
 geom=unary_union(parts)
 if not geom.is_empty:names.append(name);obstacles.append(geom)
tree=STRtree(obstacles)
def offset(points,d):
 p=np.array(points);t=np.gradient(p,axis=0);t/=np.linalg.norm(t,axis=1)[:,None];return p+np.c_[-t[:,1],t[:,0]]*d
def swept(points,L,width,front,rear):
 pts=np.array(points);theta=math.atan2(*(pts[1]-pts[0])[::-1]);parts=[]
 for a,b in zip(pts,pts[1:]):
  delta=b-a;ds=np.linalg.norm(delta)
  if ds<1e-8:continue
  psi=math.atan2(delta[1],delta[0]);theta+=math.sin(psi-theta)*ds/L;t=np.array([math.cos(theta),math.sin(theta)]);n=np.array([-t[1],t[0]]);rearaxle=b-L*t;parts.append(Polygon([rearaxle+t*x+n*y for x,y in [(-rear,-width/2),(L+front,-width/2),(L+front,width/2),(-rear,width/2)]]))
 return unary_union(parts)
checks=[]
for name,p in proposal['profiles'].items():
 for direction in [-1,1]:
  path=np.array(p['points']);path=offset(path,1.3716*direction)
  if direction<0:path=path[::-1]
  envelope=swept(path,2.8,1.95,1.0,1.0);outside=envelope.difference(drivable.buffer(.05)).area;hits=[]
  for i in tree.query(envelope,predicate='intersects'):
   area=envelope.intersection(obstacles[i]).area
   if area>.005:hits.append({'object':names[i],'area_m2':area,'bounds':list(envelope.intersection(obstacles[i]).bounds)})
  checks.append({'route':name,'direction':direction,'vehicle':'4.8 x 1.95 m passenger car, 2.8 m wheelbase','outside_drivable_area_m2':outside,'obstacle_collisions':hits})
envelope=swept(proposal['profiles']['loop']['points'],5.,2.5,1.5,2.5);hits=[]
for i in tree.query(envelope,predicate='intersects'):
 a=envelope.intersection(obstacles[i]).area
 if a>.005:hits.append({'object':names[i],'area_m2':a})
checks.append({'route':'loop','direction':1,'vehicle':'9 x 2.5 m concept large vehicle, 5 m wheelbase','outside_drivable_area_m2':envelope.difference(drivable.buffer(.05)).area,'obstacle_collisions':hits})
report={'horizontal_pass':all(c['outside_drivable_area_m2']<.25 and not c['obstacle_collisions'] for c in checks),'checks':checks,'campus_carriageway_ft':22,'nominal_travel_lanes_ft':[9,9],'parking_aisle_ft':24,'secondary_local_turn_width_ft':7.7056/.3048,'fixed_buildings_moved_or_resized':False,'limitations':'Concept planar bicycle-envelope clearance, not certified swept-path analysis. Checks horizontal road routes and modeled props, not every parking maneuver, grade break, underbody clearance, accessibility or fire approval. Previous local mesh grades up to 14.15% remain a civil-review item.'};(w/'delivery/validation/proposed_drive_clearance.json').write_text(json.dumps(report,indent=2));print('DRIVE_CLEARANCE',report['horizontal_pass'],flush=True)
for c in checks:
 if c['outside_drivable_area_m2']>.25 or c['obstacle_collisions']:print(c['route'],c['direction'],'outside',c['outside_drivable_area_m2'],'hits',c['obstacle_collisions'][:8],flush=True)
