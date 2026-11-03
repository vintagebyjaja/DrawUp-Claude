import sys,json,numpy as np
from pathlib import Path
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps');sys.path.insert(0,'/workspace/monroe-road-redesign/scripts')
from shapely.geometry import shape,Point,Polygon,box
from shapely.ops import unary_union,nearest_points
from site_geometry import load_terrain
w=Path('/workspace/monroe-pavement-fix');T=load_terrain();raw=json.loads(Path('/workspace/monroe-screenshot/registration_geometry.json').read_text());b=next(b for b in raw['buildings'] if b['name']=='building_2603');bp=np.array(b['points']);B=unary_union([Polygon(bp[f,:2]) for f in b['faces'] if Polygon(bp[f,:2]).area>.01]).buffer(.2)
for variant in ['existing','proposed']:
 path=w/(variant+'_repairs.json');p=json.loads(path.read_text());pad=shape(p['garage_footprint']);road=shape(p['vehicle_footprint']).difference(pad).intersection(box(-110,365,-80,385));near=nearest_points(Point(-86.6,376.3),road)[1];floor=max(float(T(near.x,near.y))+.16,float(bp[:,2].min())+.12)
 for r in p['replacements']:
  if r['name']!='F_Garage_Apron':continue
  N=len(r['vertices'])//2
  for i,v in enumerate(r['vertices']):
   q=Point(v[:2]);rd=max(road.distance(q)-.02,0);bd=B.distance(q);a=rd/max(rd+bd,1e-8);point=nearest_points(q,road)[1];z=float(T(point.x,point.y))+.04;v[2]=(1-a)*z+a*floor-(.18 if i>=N else 0)
 p['garage_floor_z_m']=floor;path.write_text(json.dumps(p));reportpath=w/'delivery/validation'/(variant+'_surface_plan.json');r=json.loads(reportpath.read_text());r['garage_floor_z_m']=floor;r['garage_grade_method']='Curb-derived threshold, limited to above the existing building base; original arbitrary raised apron removed.';reportpath.write_text(json.dumps(r,indent=2));print('CURB_THRESHOLD',variant,floor,flush=True)
