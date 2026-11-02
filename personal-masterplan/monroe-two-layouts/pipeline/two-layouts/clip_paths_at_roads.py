import sys,json,numpy as np
from pathlib import Path
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps');sys.path.insert(0,'/workspace/monroe-road-redesign/scripts');sys.path.insert(0,str(Path(__file__).resolve().parent))
from shapely.geometry import shape
from shapely.ops import unary_union
from pavement_slab import slab
from site_geometry import load_terrain
w=Path('/workspace/monroe-two-layouts');data=json.loads((w/'common_road_meshes.json').read_text());T=load_terrain();road=unary_union([shape(r['footprint']) for r in data if r['family']!='paths']).buffer(.025);out=[];empty=[]
for r in data:
 if r['family']!='paths':out.append(r);continue
 poly=shape(r['footprint']).difference(road)
 if poly.is_empty:empty.append(r['name']);continue
 mesh=slab(poly,lambda xy:np.ma.filled(T(xy[:,0],xy[:,1]),0)+.15,.15);mesh.update({k:v for k,v in r.items() if k not in ['vertices','faces','top_vertex_count']});mesh['footprint']=poly.__geo_interface__;out.append(mesh)
(w/'common_road_meshes.json').write_text(json.dumps(out));(w/'empty_path_retirements.json').write_text(json.dumps(empty));print('PATHS_TRIMMED_AT_ROAD_CROSSINGS',len(out),'retired_duplicate_paths',len(empty))
