from pathlib import Path
import json,numpy as np
ns={};exec(Path('/workspace/monroe-material-update/scripts/prepare_geometry.py').read_text().split('# Existing image-derived baseball dirt')[0],ns)
from shapely.geometry import Polygon,box,shape,LineString
from shapely.ops import unary_union
w=Path('/workspace/monroe-townhouse-correction');p=json.loads((w/'driveway_geometry.json').read_text());B=ns['B'];mesh=ns['mesh_region'];roads=ns['roads']
parts=[Polygon([(-31,365),(-25,371),(-12,370),(13,367),(19,365),(22,354),(19,350),(-12,350),(-26,354)]),Polygon([(19,354),(25,354),(26,377),(22,400),(17,402),(17,392),(20,375)]),Polygon([(-5,409),(0,413),(0,423),(10,426),(15,424),(17,414),(20,409),(15,407),(7,407)]),LineString([(-44,419),(-30,419),(-12,418),(4,418)]).buffer(2.6),LineString([(-44,300),(-45,335),(-45,364),(-44,390),(-42,416)]).buffer(3.3528),Polygon([(-20,337),(-16,341),(-9,339),(-5,318),(-8,311),(-15,310),(-18,318)])]
pave=unary_union(parts).difference(B);assets=mesh('O_Existing_Campus_Asphalt_and_Parking',pave,.065,.18,'asphalt');edits=[]
for r in roads:
 footprint=shape(r['footprint'])
 if not footprint.intersects(pave) or footprint.intersection(pave).area<.01:continue
 remainder=footprint.difference(pave);replacement=mesh('O_Retained_'+r['name'],remainder,.15 if r['family']=='paths' else .035,.15 if r['family']=='paths' else .20,'concrete' if r['family']=='paths' else 'asphalt') if not remainder.is_empty else []
 edits.append({'name':r['name'],'parts':replacement})
marks=[]
for i in range(11):
 x=-10+i*2.65;marks.append(LineString([(x,359.0),(x+1.0,364.3)]).buffer(.045,cap_style='flat'))
for i in range(9):
 y=313.0+i*2.8;marks.append(LineString([(-13.8,y),(-7.5,y+1.7)]).buffer(.045,cap_style='flat'))
assets+=mesh('O_Existing_Parking_Stripes',unary_union(marks).intersection(pave),.078,.006,'paint')
p['original_paving']={'meshes':assets,'road_edits':edits,'footprint':pave.__geo_interface__,'status':'Existing-condition asphalt/parking outline traced approximately against registered aerial and the newly supplied oblique reference. Parking stripes illustrative; not a surveyed parking inventory.'}
# One combined trim pass prevents newly restored pavement being covered by older sidewalk bands.
ns2={};exec(Path('/workspace/monroe-material-update/scripts/repair_surface_topology.py').read_text().split("for name in ['existing_additions.json'")[0],ns2);repair=ns2['repair'];p['all_sidewalk_edits']={}
for variant in ['existing','proposed']:
 masks=[shape(p['footprint']),box(-94.2,343.7,-86.1,351.1).difference(B),box(-90.4,357.5,-86.65,365.7)]
 if variant=='existing':masks.append(pave)
 mask=unary_union(masks);out=[]
 for r in json.load(open('/workspace/monroe-material-update/'+variant+'_additions.json')):
  if not r['name'].startswith('N_Neighborhood'):continue
  vv=np.array(r['vertices']);N=len(vv)//2
  if not box(vv[:,0].min(),vv[:,1].min(),vv[:,0].max(),vv[:,1].max()).intersects(mask):continue
  poly=unary_union([Polygon(vv[f,:2]) for f in r['faces'] if all(i<N for i in f)])
  if poly.intersection(mask).area<.001:continue
  remainder=poly.difference(mask);replacement=mesh(r['name']+'_Site_Trim',remainder,.18,.14,'concrete')
  for part in replacement:repair(part)
  out.append({'name':r['name'],'parts':replacement})
 p['all_sidewalk_edits'][variant]=out;print('COMBINED_SIDEWALK_TRIM',variant,len(out),flush=True)
(w/'driveway_geometry.json').write_text(json.dumps(p));(w/'delivery/validation/original_paving_plan.json').write_text(json.dumps({'asphalt_area_m2':pave.area,'building_overlap_m2':pave.intersection(B).area,'accuracy':p['original_paving']['status'],'restored_to_original_version_only':True,'new_design_parking_retained_in_proposed_version':True},indent=2));print('ORIGINAL_ASPHALT_READY',pave.area,len(edits),flush=True)
