import sys,json
from pathlib import Path
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps')
from shapely.geometry import Polygon,box,shape,mapping
from shapely.ops import unary_union
p=Path('/workspace/monroe-material-update/scripts/prepare_geometry.py');ns={};exec(p.read_text().split('# Existing image-derived baseball dirt')[0],ns)
w=Path('/workspace/monroe-townhouse-correction');mesh=ns['mesh_region'];B=ns['B']
# Reference-traced rear drive and western access, approximate at existing model registration.
drive=unary_union([Polygon([(-156,311),(-150,311),(-107,311),(-103.6,313),(-103.6,317),(-150,317),(-150,326),(-156,326)]),box(-158,282.5,-152,314)]).buffer(.45).buffer(-.45).difference(B)
assets=mesh('C_Townhouse_Concrete_Driveway',drive,.065,.18,'concrete');roads=json.load(open('/workspace/monroe-two-layouts/common_road_meshes.json'));edits=[]
for r in roads:
 footprint=shape(r['footprint'])
 if not footprint.intersects(drive):continue
 cut=footprint.intersection(drive)
 if cut.area<.005:continue
 remainder=footprint.difference(drive)
 if remainder.is_empty:edits.append({'name':r['name'],'retire':True});continue
 replacements=mesh('C_Trimmed_'+r['name'],remainder,.15 if r['family']=='paths' else .035,.15 if r['family']=='paths' else .20,'concrete' if r['family']=='paths' else 'asphalt')
 edits.append({'name':r['name'],'parts':replacements})
(w/'driveway_geometry.json').write_text(json.dumps({'driveway':assets,'road_edits':edits,'footprint':mapping(drive)}))
(w/'delivery/validation/driveway_plan.json').write_text(json.dumps({'area_m2':drive.area,'building_overlap_m2':drive.intersection(B).area,'source':'Rear concrete drive visible in user oblique image and registered aerial reference; approximate tracing, not survey.','existing_road_path_segments_trimmed':[e['name'] for e in edits],'source_building_ids_for_four_reference_townhouses':['building_3031','building_2591','building_2391','building_2395','building_2724','building_3130'],'note':'The source massing splits this four-house row into six mesh pieces. Preserve source geometry and recolor all six pieces covering the indicated row.'},indent=2));print('DRIVEWAY_READY',drive.area,len(edits),flush=True)
