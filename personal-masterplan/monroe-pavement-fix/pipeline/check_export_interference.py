import sys,json,numpy as np
from pathlib import Path
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps');sys.path.insert(0,'/workspace/monroe-road-redesign/scripts')
from shapely.geometry import Polygon,shape,Point
from shapely.ops import unary_union
from site_geometry import load_terrain
w=Path('/workspace/monroe-pavement-fix');T=load_terrain()
for variant in ['existing','proposed']:
 rows=json.loads((w/(variant+'_export_surfaces.json')).read_text());vehicles=[];walks=[];garage=[];bad=[];samples=0;minimum=1e9
 for r in rows:
  polygons=[];centers=[]
  for xyz in r['triangles']:
   a=np.array(xyz);p=Polygon(a[:,:2])
   if p.area<1e-8:continue
   polygons.append(p)
   if r['kind']=='street':centers.append(a.mean(0))
  geom=unary_union(polygons)
  if r['kind']=='walk':walks.append(geom)
  elif r['kind']=='garage':garage.append(geom)
  else:vehicles.append(geom)
  if centers:
   a=np.array(centers);ground=np.ma.filled(T(a[:,0],a[:,1]),np.nan);delta=a[:,2]-ground;valid=np.isfinite(delta);samples+=int(valid.sum());minimum=min(minimum,float(delta[valid].min()))
   for p,d in zip(a[valid][delta[valid]<-.005],delta[valid][delta[valid]<-.005]):
    if len(bad)<20:bad.append({'object':r['name'],'xyz':p.tolist(),'below_ground_m':float(-d)})
 V=unary_union(vehicles);W=unary_union(walks);G=unary_union(garage);overlap=G.intersection(V).area;walkover=W.intersection(V.union(G)).area;report={'passed':overlap<.001 and walkover<.005 and not bad,'garage_overlap_with_actual_exported_vehicle_surfaces_m2':overlap,'sidewalk_overlap_with_actual_exported_vehicle_surfaces_m2':walkover,'actual_exported_street_top_samples':samples,'minimum_street_height_above_source_terrain_m':minimum,'street_samples_below_terrain':bad,'method':'Independent projection of reimported FBX top faces, compared to each other and the original terrain interpolator.'};(w/'delivery/validation'/(variant+'_export_interference_checks.json')).write_text(json.dumps(report,indent=2));print('EXPORT_INTERFERENCE',variant,report,flush=True);assert report['passed'],report
