from pathlib import Path
import json,numpy as np
ns={};exec(Path('/workspace/monroe-material-update/scripts/prepare_geometry.py').read_text().split('# Existing image-derived baseball dirt')[0],ns)
from shapely.geometry import box,shape
from shapely.ops import unary_union
w=Path('/workspace/monroe-townhouse-correction');p=json.loads((w/'driveway_geometry.json').read_text());B=ns['B'];mesh=ns['mesh_region'];court=box(-86.65,356.4,-73.7,370.3).difference(B);apron=box(-94.2,343.7,-86.1,351.1).difference(B);courtmesh=mesh('A_Apartment_Raised_Courtyard',court,.05,.20,'concrete')
for r in courtmesh:
 N=len(r['vertices'])//2
 for i,v in enumerate(r['vertices']):v[2]=25.6 if i<N else 25.4
apronmesh=mesh('A_Apartment_Garage_Entry_Apron',apron,.05,.18,'concrete')
for r in apronmesh:
 N=len(r['vertices'])//2
 for i,v in enumerate(r['vertices']):v[2]=23.75+(v[0]+87.0)*.22-(v[1]-347)*.06-(.18 if i>=N else 0)
# Trim raised path bands beneath the new garage apron; roads remain outside the traced apron.
mask=apron.union(box(-90.4,357.5,-86.65,365.7));all_edits={}
for variant in ['existing','proposed']:
 edits=[]
 old=json.loads(Path('/workspace/monroe-material-update/'+variant+'_additions.json').read_text())
 for r in old:
  if not r['name'].startswith('N_Neighborhood'):continue
  vv=np.array(r['vertices']);N=len(vv)//2
  if not box(vv[:,0].min(),vv[:,1].min(),vv[:,0].max(),vv[:,1].max()).intersects(mask):continue
  poly=unary_union([__import__('shapely').geometry.Polygon(vv[f,:2]) for f in r['faces'] if all(i<N for i in f)])
  if poly.intersection(mask).area<.001:continue
  parts=mesh(r['name']+'_Apartment_Trim',poly.difference(mask),.18,.14,'concrete');edits.append({'name':r['name'],'parts':parts})
 all_edits[variant]=edits
p['apartment_site']={'meshes':courtmesh+apronmesh,'sidewalk_edits':all_edits,'courtyard_floor_z_m':25.6,'stair_bottom_z_m':22.75,'stair_risers':17,'stair_run_m':5.44,'garage_visual_bounds_y_z_m':[344.2,350.5,23.7,26.7],'accuracy':'User photo supports courtyard, retaining wall, exterior stairs and garage entry. Dimensions and grades approximate from existing terrain and source footprint; not surveyed. Garage is an atlas representation, not a cut-through opening.'};(w/'driveway_geometry.json').write_text(json.dumps(p));print('APARTMENT_SITE_READY',[(r['name'],len(r['faces'])) for r in courtmesh+apronmesh],flush=True)
