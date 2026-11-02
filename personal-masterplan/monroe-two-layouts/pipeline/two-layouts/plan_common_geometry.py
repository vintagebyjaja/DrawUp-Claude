import sys,json,math,collections
from pathlib import Path
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps');sys.path.insert(0,'/workspace/monroe-road-redesign/scripts')
import numpy as np
from scipy.spatial import cKDTree
from scipy.interpolate import LinearNDInterpolator
from shapely import constrained_delaunay_triangles
from shapely.geometry import Polygon,box
from shapely.ops import unary_union
from site_geometry import load_terrain
w=Path('/workspace/monroe-two-layouts');d=w/'delivery';raw=json.loads(Path('/workspace/monroe-screenshot/registration_geometry.json').read_text());T=load_terrain();polys=[]
for b in raw['buildings']:
 pts=np.array(b['points']);parts=[Polygon(pts[f,:2]) for f in b['faces'] if len(f)>=3];parts=[p for p in parts if p.is_valid and p.area>.05];polys.extend(parts)
B=unary_union(polys);obstacles=B.buffer(.20);sources=json.loads((w/'existing_sources.json').read_text());meshes=[];reports=[];public={};domain=box(-701.64264,-698.38855,701.64264,698.38855)

def slab(poly,zfun,depth):
 coords=[];faces=[];lookup={}
 for tri in constrained_delaunay_triangles(poly.segmentize(3.)).geoms:
  if tri.area<1e-7:continue
  xy=np.array(tri.exterior.coords)[:3,:2]
  if np.cross(xy[1]-xy[0],xy[2]-xy[0])<0:xy=xy[::-1]
  f=[]
  for v in xy:
   key=tuple(np.round(v,6))
   if key not in lookup:lookup[key]=len(coords);coords.append(list(v))
   f.append(lookup[key])
  faces.append(f)
 if not coords:return None
 xy=np.array(coords);z=zfun(xy);top=np.c_[xy,z];vs=np.vstack([top,top-[0,0,depth]]).tolist();N=len(top);count=collections.Counter()
 for f in faces:
  for a,b in zip(f,f[1:]+f[:1]):count[tuple(sorted((a,b)))]+=1
 boundary=[]
 for f in faces:
  for a,b in zip(f,f[1:]+f[:1]):
   if count[tuple(sorted((a,b)))]==1:boundary.append([a,b,b+N,a+N])
 fs=faces+[[i+N for i in reversed(f)] for f in faces]+boundary;edges=collections.Counter()
 for f in fs:
  for a,b in zip(f,f[1:]+f[:1]):edges[tuple(sorted((a,b)))]+=1
 assert all(v==2 for v in edges.values())
 return {'vertices':vs,'faces':fs,'top_vertex_count':N,'closed_edge_incidence':True,'thickness_m':depth}
for s in sources:
 name=s['name']
 if not name.startswith('road_'):continue
 pp=np.array(s['points']);parts=[Polygon(pp[f,:2]) for f in s['faces'] if len(f)>=3];parts=[v for v in parts if v.is_valid and v.area>1e-7];original=unary_union(parts)
 if original.is_empty:continue
 family=name.split('_')[1];preset={'local':4.,'collector':6.,'arterial':10.,'service':2.,'paths':1.}.get(family);target={'local':5.4864,'collector':6.,'arterial':10.,'service':2.7432,'paths':1.8288}.get(family,preset)
 if name in ['road_local_203','road_local_261']:preset=target=6.7056
 delta=(target-preset)/2 if target is not None else 0;poly=original.buffer(delta,quad_segs=3) if abs(delta)>.001 else original;poly=poly.intersection(domain);before=poly.area;poly=poly.difference(obstacles);constrained=before-poly.area
 if poly.is_empty:reports.append({'object':name,'status':'source road overlaps fixed buildings; retained original footprint pending review'});poly=original
 tree=cKDTree(pp[:,:2]);interp=None
 if family=='bridge':
  try:interp=LinearNDInterpolator(pp[:,:2],pp[:,2])
  except Exception:pass
 def zfun(xy):
  z=np.asarray(interp(xy)) if interp is not None else np.ma.filled(T(xy[:,0],xy[:,1]),np.nan)+(.15 if family=='paths' else .035)
  bad=~np.isfinite(z)
  if bad.any():z[bad]=pp[tree.query(xy[bad])[1],2]
  return z
 depth=.15 if family=='paths' else .20;mesh=slab(poly,zfun,depth)
 if mesh is None:continue
 mesh.update(name=name,family=family,footprint=poly.__geo_interface__,nominal_pavement_width_m=target,source_width_preset_m=preset);meshes.append(mesh);reports.append({'object':name,'family':family,'source_width_preset_m':preset,'nominal_new_width_m':target,'travel_lane_width_ft_assumption':9 if family in ['local','collector','service'] else None,'thickness_m':depth,'closed_volume':True,'area_clipped_at_fixed_buildings_m2':constrained,'width_is_survey_verified':False})
 if name in ['road_local_203','road_local_261','road_local_157']:public[name]=poly.__geo_interface__
 if len(meshes)%100==0:print('VOLUMETRIC_ROADS',len(meshes),flush=True)
(w/'common_road_meshes.json').write_text(json.dumps(meshes));(w/'road_geometry_plan.json').write_text(json.dumps(public));(d/'validation/common_road_schedule.json').write_text(json.dumps({'road_or_path_objects':len(meshes),'schedule':reports,'policy':'9 ft travel lanes are client assumptions; 18 ft local two-way roads, 9 ft service lanes, 6 ft paths; retain 22 ft apartment-side carriageway and source collector/arterial widths where lane counts are unverified.','all_generated_road_and_path_masses_closed':True},indent=2));print('ROAD_PLAN_READY',len(meshes),flush=True)
