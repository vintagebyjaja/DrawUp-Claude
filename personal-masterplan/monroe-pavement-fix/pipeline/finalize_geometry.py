import sys,json,collections
from pathlib import Path
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps')
import numpy as np
from shapely.geometry import shape,Polygon,box,LineString
from shapely import constrained_delaunay_triangles
from shapely.ops import unary_union
w=Path('/workspace/monroe-pavement-fix');source=json.loads((w/'surfaces.json').read_text());ns={};exec(Path('/workspace/monroe-material-update/scripts/prepare_geometry.py').read_text().split('# Existing image-derived baseball dirt')[0],ns);region=ns['mesh_region'];rep={};code=Path('/workspace/monroe-material-update/scripts/repair_surface_topology.py').read_text().split("for name in ['existing_additions.json'")[0];code=code.replace("depth=.14 if r['name'].startswith('N_Neighborhood') else .006","depth=r.get('depth',.18)");exec(code,rep)
def close(name,triangles,depth,material):
 vs=[];fs=[];ids={};seen=set()
 for tri in triangles:
  face=[]
  for p in tri:
   key=tuple(np.round(p,7))
   if key not in ids:ids[key]=len(vs);vs.append(list(p))
   face.append(ids[key])
  key=tuple(sorted(face))
  if len(set(face))<3 or key in seen:continue
  seen.add(key);fs.append(face)
 N=len(vs);r={'name':name,'vertices':vs+[[x,y,z-depth] for x,y,z in vs],'faces':fs,'depth':depth,'material':material};rep['repair'](r);return r
for variant,records in source.items():
 p=json.loads((w/(variant+'_repairs.json')).read_text());byname={r['name']:r for r in records};new=[]
 for r in p['replacements']:
  if 'source_clip' not in r:new.append(r);continue
  original=byname[r['source_clip']];clip=shape(r['clip_to']);v=np.array(original['vertices']);N=len(v)//2;triangles=[]
  for face in original['faces']:
   if not all(i<N for i in face):continue
   xyz=v[face];poly=Polygon(xyz[:,:2]);cut=poly.intersection(clip)
   if cut.is_empty:continue
   coef=np.linalg.lstsq(np.c_[xyz[:,:2],np.ones(len(xyz))],xyz[:,2],rcond=None)[0]
   for t in constrained_delaunay_triangles(cut).geoms:
    if t.area<1e-8:continue
    xy=np.array(t.exterior.coords)[:3,:2]
    if np.cross(xy[1]-xy[0],xy[2]-xy[0])<0:xy=xy[::-1]
    triangles.append(np.c_[xy,np.c_[xy,np.ones(3)]@coef])
  if triangles:new.append(close(r['name'],triangles,r['depth'],r['material']))
 # Keep graded pedestrian routes but remove any part inside the repaired carriageways.
 if variant=='proposed':
  r=next(r for r in json.loads(Path('/workspace/monroe-access-revision/proposal.json').read_text())['meshes'] if r['name']=='P_Accessible_Paths_and_Sidewalks');p['retire'].append(r['name']);clip=shape(p['vehicle_footprint']).buffer(.025);v=np.array(r['vertices']);N=len(v)//2;triangles=[]
  for face in r['faces']:
   if not all(i<N for i in face):continue
   xyz=v[face];poly=Polygon(xyz[:,:2]);cut=poly.difference(clip)
   if cut.is_empty:continue
   coef=np.linalg.lstsq(np.c_[xyz[:,:2],np.ones(len(xyz))],xyz[:,2],rcond=None)[0]
   for t in constrained_delaunay_triangles(cut).geoms:
    if t.area<1e-8:continue
    xy=np.array(t.exterior.coords)[:3,:2]
    if np.cross(xy[1]-xy[0],xy[2]-xy[0])<0:xy=xy[::-1]
    triangles.append(np.c_[xy,np.c_[xy,np.ones(3)]@coef])
  new.append(close('F_Graded_Campus_Pedestrian_Routes',triangles,.15,'concrete'))
 if variant=='existing':
  p['retire'].append('O_Existing_Parking_Stripes');stripes=[]
  for y0 in [346.212,359.0136]:
   for i in range(12):
    x=-11.25+i*2.7432;stripes.append(LineString([(x,y0),(x,y0+5.4864)]).buffer(.045,cap_style='flat'))
  for i in range(9):
   y=313+i*2.8;stripes.append(LineString([(-13.8,y),(-7.5,y+1.7)]).buffer(.045,cap_style='flat'))
  stripe=unary_union(stripes).intersection(shape(p['vehicle_footprint']));parts=region('F_Original_60ft_Parking_Markings',stripe,.055,.006,'paint')
  for r in parts:r['depth']=.006;rep['repair'](r)
  new+=parts
 p['replacements']=new;(w/(variant+'_repairs.json')).write_text(json.dumps(p));print('FINAL_GEOMETRY',variant,len(new),flush=True)
# The requested roof group is matched to the long flat-roof housing blocks in the reference neighborhood.
ids=[]
exclude={'building_2603','building_2356','building_2099','building_2772','building_2664'}
for b in json.loads(Path('/workspace/monroe-screenshot/registration_geometry.json').read_text())['buildings']:
 a=np.array(b['points']);center=a[:,:2].mean(0)
 if b['name'] in exclude or not(-150<center[0]<180 and -100<center[1]<430):continue
 rect=__import__('shapely').geometry.MultiPoint(a[:,:2]).minimum_rotated_rectangle;xy=np.array(rect.exterior.coords)[:4];lengths=np.linalg.norm(np.roll(xy,-1,0)-xy,axis=1)
 if rect.area>140 and lengths.max()/max(lengths.min(),1)>2 and np.ptp(a[:,2])<20:ids.append(b['name'])
(w/'white_roof_ids.json').write_text(json.dumps(ids));print('WHITE_ROOF_BUILDINGS',len(ids),ids,flush=True)
