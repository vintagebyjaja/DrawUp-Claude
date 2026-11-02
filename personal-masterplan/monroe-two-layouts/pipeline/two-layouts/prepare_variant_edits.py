import sys,json,numpy as np
from pathlib import Path
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps');sys.path.insert(0,str(Path(__file__).resolve().parent));sys.path.insert(0,'/workspace/monroe-road-redesign/scripts')
from shapely import constrained_delaunay_triangles
from shapely.geometry import Polygon,shape
from shapely.ops import unary_union
from pavement_slab import slab
from site_geometry import load_terrain
w=Path('/workspace/monroe-two-layouts');sources=json.loads((w/'existing_sources.json').read_text());edits=json.loads(Path('/workspace/monroe-road-redesign/source_edits.json').read_text());new={r['name']:r for r in edits['edits']};site=shape(json.loads(Path('/workspace/monroe-road-redesign/proposal.json').read_text())['site_boundary']);sports=json.loads((w/'sports_shapes.json').read_text());mask=unary_union([shape(s['geometry']) for s in sports]);T=load_terrain();all_edits={}
for variant in ['existing','proposed']:
 out=[]
 for source in sources:
  if not source['name'].startswith('Terrain_'):continue
  s=source
  if variant=='proposed' and source['name'] in new:r=new[source['name']];s={**source,'points':r['vertices'],'faces':r['faces'],'uv':r['uv']}
  pp=np.array(s['points']);bounds=[pp[:,0].min(),pp[:,1].min(),pp[:,0].max(),pp[:,1].max()]
  from shapely.geometry import box
  if not box(*bounds).intersects(mask):continue
  uv=np.array(s['uv']);offset=0;vv=[];ff=[];uu=[];changed=False
  for f in s['faces']:
   p=pp[f];u=uv[offset:offset+len(f)];offset+=len(f);poly=Polygon(p[:,:2]);parts=[]
   if poly.area>1e-9 and poly.intersects(mask):
    changed=True;left=poly.difference(mask);coef=np.linalg.lstsq(np.c_[p[:,:2],np.ones(len(p))],np.c_[p[:,2],u],rcond=None)[0]
    for tri in constrained_delaunay_triangles(left).geoms:
     if tri.area<1e-8:continue
     xy=np.array(tri.exterior.coords)[:3,:2];v=np.c_[xy,np.ones(3)]@coef;parts.append((np.c_[xy,v[:,0]],v[:,1:]))
   else:parts=[(p,u)]
   for xyz,uvs in parts:
    i=len(vv);vv.extend(xyz.tolist());ff.append(list(range(i,i+len(xyz))));uu.extend(uvs.tolist())
  if changed:out.append({'name':s['name'],'vertices':vv,'faces':ff,'uv':uu})
 all_edits[variant]=out;print('FIELDS_CARVED',variant,len(out),flush=True)
# The proposed layout retires old campus footways; keep upgraded existing paths only outside that envelope.
roads=json.loads((w/'common_road_meshes.json').read_text());proposed_paths=[]
for r in roads:
 if r['family']!='paths':continue
 geom=shape(r['footprint'])
 if not geom.intersects(site):continue
 geom=geom.difference(site)
 if geom.is_empty:proposed_paths.append({'name':r['name'],'retire':True});continue
 volume=slab(geom,lambda xy:np.ma.filled(T(xy[:,0],xy[:,1]),0)+.15,.15)
 if volume is not None:volume.update(name=r['name'],family='paths',nominal_pavement_width_m=1.8288);proposed_paths.append(volume)
(w/'sports_terrain_edits.json').write_text(json.dumps(all_edits));(w/'proposed_path_overrides.json').write_text(json.dumps(proposed_paths));print('VARIANT_EDITS_READY',len(proposed_paths),flush=True)
