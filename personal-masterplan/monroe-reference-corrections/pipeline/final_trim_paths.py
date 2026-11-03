from pathlib import Path
import json,numpy as np
ns={};exec(Path('/workspace/monroe-material-update/scripts/prepare_geometry.py').read_text().split('# Existing image-derived baseball dirt')[0],ns)
from shapely.geometry import shape,box,Polygon,Point
from shapely.ops import unary_union
w=Path('/workspace/monroe-townhouse-correction');p=json.loads((w/'driveway_geometry.json').read_text());mesh=ns['mesh_region'];revision=json.loads(Path('/workspace/monroe-access-revision/proposal.json').read_text());B=ns['B'];ns2={};code=Path('/workspace/monroe-material-update/scripts/repair_surface_topology.py').read_text().split("for name in ['existing_additions.json'")[0];code=code.replace("depth=.14 if r['name'].startswith('N_Neighborhood') else .006","depth=r.get('thickness_m',.14 if r['name'].startswith('N_Neighborhood') else .006)");exec(code,ns2);repair=ns2['repair']
for variant in ['existing','proposed']:
 masks=[shape(p['footprint']),box(-96.7,372.8,-86.1,380.0).difference(B),box(-90.4,356.5,-86.65,365.7),shape(p['lincoln_33ft']['sidewalk_cut_mask'])]
 masks.append(shape(p['original_paving']['footprint']) if variant=='existing' else shape(revision['paving']))
 mask=unary_union(masks);out=[]
 for r in json.load(open('/workspace/monroe-material-update/'+variant+'_additions.json')):
  if not r['name'].startswith('N_Neighborhood'):continue
  vv=np.array(r['vertices']);N=len(vv)//2
  if not box(vv[:,0].min(),vv[:,1].min(),vv[:,0].max(),vv[:,1].max()).intersects(mask):continue
  poly=unary_union([Polygon(vv[f,:2]) for f in r['faces'] if all(i<N for i in f)])
  if poly.intersection(mask).area<.001:continue
  replacement=mesh(r['name']+'_Site_Trim',poly.difference(mask),.18,.14,'concrete')
  for part in replacement:repair(part)
  out.append({'name':r['name'],'parts':replacement})
 p['all_sidewalk_edits'][variant]=out;print('FINAL_NEIGHBORHOOD_PATH_TRIM',variant,len(out),flush=True)
# Remove legacy raised footpaths where they would otherwise cross a proposed driveway mouth.
baseoverrides={r['name']:r for r in json.load(open('/workspace/monroe-two-layouts/proposed_path_overrides.json'))};pathedits=[]
for r in ns['roads']:
 if r['family']!='paths':continue
 if r['name'] in baseoverrides:
  b=baseoverrides[r['name']]
  if b.get('retire'):continue
  a=np.array(b['vertices']);N=len(a)//2;poly=unary_union([Polygon(a[f,:2]) for f in b['faces'] if all(i<N for i in f)])
 else:poly=shape(r['footprint'])
 cut=shape(revision['road_shape'])
 if poly.intersection(cut).area<.001:continue
 parts=mesh('C_Proposed_Footpath_Trim_'+r['name'],poly.difference(cut),.15,.15,'concrete')
 for part in parts:part['thickness_m']=.15;repair(part)
 pathedits.append({'name':r['name'],'parts':parts})
p['proposed_access_revision']['legacy_path_edits']=pathedits
# Concrete wings close the sloped garage apron against adjacent existing ground.
wings=[]
for y in [372.8,380.0]:
 xs=np.linspace(-96.7,-88.5,9)
 for a,b in zip(xs,xs[1:]):
  mid=(a+b)/2;i=int(ns['tree'].nearest(Point(mid,y)));ground=float(ns['terrain'][i][1]@np.array([mid,y,1]));ramp=22.05+(mid+86.6)*.32-(y-376.3)*.055;wings.append([float(a),y-.09,17.,float(b),y+.09,max(ground+.07,ramp+.1)])
p['apartment_site']['garage_wingwalls']=wings;(w/'driveway_geometry.json').write_text(json.dumps(p));print('LEGACY_PROPOSED_PATHS_TRIMMED',len(pathedits),flush=True)
