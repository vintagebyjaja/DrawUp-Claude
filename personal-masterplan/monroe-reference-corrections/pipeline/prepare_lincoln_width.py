from pathlib import Path
import json,numpy as np
ns={};exec(Path('/workspace/monroe-material-update/scripts/prepare_geometry.py').read_text().split('# Existing image-derived baseball dirt')[0],ns)
from shapely.geometry import box,shape,Polygon
from shapely.ops import unary_union
w=Path('/workspace/monroe-townhouse-correction');p=json.loads((w/'driveway_geometry.json').read_text());mesh=ns['mesh_region'];B=ns['B'];road=next(r for r in ns['roads'] if r['name']=='road_local_222');old=shape(road['footprint']);widened=old.buffer((10.0584-5.4864)/2,quad_segs=4).intersection(box(-160,90,10,240));transition=old.buffer((10.0584-5.4864)/4,quad_segs=4).intersection(box(-160,75,10,90));wide=unary_union([old,widened,transition]).difference(B);R=unary_union([shape(r['footprint']) for r in ns['roads'] if r['family']!='paths' and r['name']!='road_local_222']+[wide]);walk=wide.buffer(1.85).difference(R.buffer(.20)).difference(ns['paths'].buffer(.05)).difference(B).difference(ns['sportsUnion']);assets=mesh('C_Lincoln_Street_Measured_33ft',wide,.035,.20,'asphalt')+mesh('N_Neighborhood_Sidewalk_Lincoln_33ft',walk,.18,.14,'concrete');ns2={};exec(Path('/workspace/monroe-material-update/scripts/repair_surface_topology.py').read_text().split("for name in ['existing_additions.json'")[0],ns2)
for a in assets:
 if a['name'].startswith('N_'):ns2['repair'](a)
p['lincoln_33ft']={'retire_road':'road_local_222','meshes':assets,'footprint':wide.__geo_interface__,'sidewalk_cut_mask':wide.buffer(2.0).__geo_interface__,'target_width_m':10.0584,'target_width_ft':33,'source':'User supplied 33 ft measurement on the north/south Lincoln Heights street east of Kelly field; applies to the matched northern straight portion of source local_222, with a short transition to the unverified southern bend. Widening clipped at fixed building footprints.'}
# Final combined sidewalk trimming, including the new measured-width street and apartment apron.
B=ns['B'];court=box(-86.65,356.4,-73.7,370.3).difference(B);apron=box(-96.7,372.8,-86.1,380.0).difference(B)
for r in p['apartment_site']['meshes']:
 if r['name']=='A_Apartment_Garage_Entry_Apron':
  replacement=mesh(r['name'],apron,.05,.18,'concrete')[0];N=len(replacement['vertices'])//2
  for i,v in enumerate(replacement['vertices']):v[2]=22.05+(v[0]+86.6)*.32-(v[1]-376.3)*.055-(.18 if i>=N else 0)
  r.update(replacement)
p['apartment_cut_mask']=unary_union([apron,box(-90.25,356.5,-86.65,365.6),court]).__geo_interface__
for variant in ['existing','proposed']:
 masks=[shape(p['footprint']),apron,box(-90.4,356.5,-86.65,365.7),wide.buffer(2.)]
 if variant=='existing':masks.append(shape(p['original_paving']['footprint']))
 mask=unary_union(masks);out=[]
 for r in json.load(open('/workspace/monroe-material-update/'+variant+'_additions.json')):
  if not r['name'].startswith('N_Neighborhood'):continue
  vv=np.array(r['vertices']);N=len(vv)//2
  if not box(vv[:,0].min(),vv[:,1].min(),vv[:,0].max(),vv[:,1].max()).intersects(mask):continue
  poly=unary_union([Polygon(vv[f,:2]) for f in r['faces'] if all(i<N for i in f)])
  if poly.intersection(mask).area<.001:continue
  replacement=mesh(r['name']+'_Site_Trim',poly.difference(mask),.18,.14,'concrete')
  for part in replacement:ns2['repair'](part)
  out.append({'name':r['name'],'parts':replacement})
 p['all_sidewalk_edits'][variant]=out;print('FINAL_SIDEWALK_TRIM',variant,len(out),flush=True)
(w/'driveway_geometry.json').write_text(json.dumps(p));(w/'delivery/validation/lincoln_33ft_reference.json').write_text(json.dumps({k:v for k,v in p['lincoln_33ft'].items() if k not in ['meshes','footprint','sidewalk_cut_mask']},indent=2));print('33_FT_PLAN_READY',flush=True)
