from pathlib import Path
import json,numpy as np
ns={};exec(Path('/workspace/monroe-material-update/scripts/prepare_geometry.py').read_text().split('# Existing image-derived baseball dirt')[0],ns)
from shapely.geometry import shape,Point,LineString,Polygon
w=Path('/workspace/monroe-townhouse-correction');p=json.loads((w/'driveway_geometry.json').read_text());wide=shape(p['lincoln_33ft']['footprint']);old=shape(next(r for r in ns['roads'] if r['name']=='road_local_222')['footprint']);mesh=ns['mesh_region'];marks=[];retire=[]
for i,r in enumerate(json.loads(Path('/workspace/monroe-material-update/crossing_shapes.json').read_text())):
 c=Point(r['center']);poly=shape(r['geometry'])
 if c.y<95 or not old.buffer(.2).contains(c):continue
 first=max(poly.geoms,key=lambda a:a.area) if poly.geom_type=='MultiPolygon' else poly;xy=np.array(first.minimum_rotated_rectangle.exterior.coords)[:4];ds=np.roll(xy,-1,0)-xy;axis=ds[np.argmax(np.linalg.norm(ds,axis=1))];axis/=np.linalg.norm(axis)
 if abs(axis[0])<.70:continue
 expanded=[]
 for stripe in (list(poly.geoms) if poly.geom_type=='MultiPolygon' else [poly]):
  cc=np.array(stripe.centroid.coords[0]);cut=LineString([cc-axis*15,cc+axis*15]).intersection(wide)
  if cut.geom_type=='MultiLineString':cut=min(cut.geoms,key=lambda a:a.distance(stripe.centroid))
  if cut.is_empty or cut.geom_type!='LineString':continue
  expanded.append(cut.buffer(.16,cap_style='flat').intersection(wide))
 if expanded:
  shape_=__import__('shapely').ops.unary_union(expanded);marks+=mesh('C_Lincoln_33ft_Crosswalk_%03d'%i,shape_,.055,.006,'paint');retire.append('N_Crosswalk_%03d'%i)
p['lincoln_33ft']['crosswalk_meshes']=marks;p['lincoln_33ft']['retire_crosswalks']=retire
revision=json.loads(Path('/workspace/monroe-access-revision/proposal.json').read_text());p['proposed_access_revision']={'meshes':revision['meshes'],'secondary_flare_footprint':LineString(revision['profiles']['secondary']['points']).buffer(3.8528).__geo_interface__,'secondary_width_m':7.7056,'secondary_width_ft':7.7056/.3048,'reason':'Passenger-car envelope clipped the old retaining edge at the secondary turn. Widen only that local entrance corridor and regenerate adjacent sidewalk/curb/retaining/lawn surfaces. Buildings stay fixed.'};(w/'driveway_geometry.json').write_text(json.dumps(p));print('FINAL_PLAN',len(marks),'crosswalks widened',retire,flush=True)
