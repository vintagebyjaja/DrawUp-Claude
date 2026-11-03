from pathlib import Path
import sys,json,numpy as np
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps')
from shapely.geometry import Polygon,shape,box
from shapely.ops import unary_union
ns={};src=Path('/workspace/monroe-material-update/scripts/prepare_geometry.py').read_text();exec(src.split('# Existing image-derived baseball dirt')[0],ns);mesh=ns['mesh_region'];w=Path('/workspace/monroe-townhouse-correction');p=json.loads((w/'driveway_geometry.json').read_text());drive=shape(p['footprint']);ns2={};exec(Path('/workspace/monroe-material-update/scripts/repair_surface_topology.py').read_text().split("for name in ['existing_additions.json'")[0],ns2);repair=ns2['repair'];out={}
for variant in ['existing','proposed']:
 edits=[]
 for r in json.load(open('/workspace/monroe-material-update/'+variant+'_additions.json')):
  if not r['name'].startswith('N_Neighborhood'):continue
  vv=np.array(r['vertices']);N=len(vv)//2
  if not box(*[vv[:,0].min(),vv[:,1].min(),vv[:,0].max(),vv[:,1].max()]).intersects(drive):continue
  poly=unary_union([Polygon(vv[f,:2]) for f in r['faces'] if all(i<N for i in f)])
  if poly.intersection(drive).area<.001:continue
  remainder=poly.difference(drive);parts=mesh(r['name']+'_Driveway_Trim',remainder,.18,.14,'concrete')
  for part in parts:repair(part)
  edits.append({'name':r['name'],'parts':parts})
 out[variant]=edits;print('SIDEWALKS_TRIMMED',variant,[e['name'] for e in edits],flush=True)
p['sidewalk_edits']=out;(w/'driveway_geometry.json').write_text(json.dumps(p))
