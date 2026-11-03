from pathlib import Path
import json,sys
ns={};exec(Path('/workspace/monroe-pavement-fix/scripts/prepare_repairs.py').read_text().split('common={')[0],ns)
from shapely.geometry import Polygon,shape,LineString
from shapely.ops import unary_union
w=Path('/workspace/monroe-pavement-fix');exact=ns['exact'];footprint=ns['footprint']
# Long existing west wall, unchanged. Forecourt is constrained to available space.
a=(-35.714,356.33);b=(-26.408,411.947);line=LineString([a,b]);zone=line.buffer(7,single_sided=True,cap_style=2)
# Positive offset is west of the northbound facade.
u=((b[0]-a[0])/line.length,(b[1]-a[1])/line.length);v=(-u[1],u[0])
def rect(t0,t1,d0,d1):return Polygon([(a[0]+u[0]*t+v[0]*d,a[1]+u[1]*t+v[1]*d) for t,d in [(t0,d0),(t1,d0),(t1,d1),(t0,d1)]])
zone=zone.difference(unary_union([rect(12,17,3.7,5.2),rect(37,42,3.7,5.2)]))
for variant in ['existing','proposed']:
 path=w/(variant+'_repairs.json');plan=json.loads(path.read_text());rs=[r for r in plan['replacements'] if not r['name'].startswith('F_School_Forecourt')]
 vehicles=unary_union([footprint(r) for r in rs if r['material']=='asphalt']);court=zone.difference(vehicles.buffer(.025)).difference(ns['B'].buffer(.03));out=[]
 for r in rs:
  if r['material']=='concrete' and any(k in r['name'] for k in ['Sidewalk','Pedestrian']):
   poly=footprint(r)
   if poly.intersects(court):out.extend(exact(r['name'],poly.difference(court.buffer(.015)),.18,.14,'concrete'));continue
  out.append(r)
 out.extend(exact('F_School_Forecourt_Concrete',court,.185,.14,'concrete'));plan['replacements']=out;plan['school_forecourt']={'area_m2':court.area,'vehicle_overlap_m2':court.intersection(vehicles).area,'reference':'User facade and concrete forecourt aerial, with planted openings; approximate, constrained to fixed footprint and drive.'};path.write_text(json.dumps(plan));print(variant,plan['school_forecourt'],flush=True)
