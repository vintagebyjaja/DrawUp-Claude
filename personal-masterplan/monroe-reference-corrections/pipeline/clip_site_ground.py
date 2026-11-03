import sys,json,numpy as np
from pathlib import Path
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps')
from shapely.geometry import shape,Polygon
from shapely import constrained_delaunay_triangles
w=Path('/workspace/monroe-townhouse-correction');p=json.loads((w/'driveway_geometry.json').read_text());mask=shape(p['apartment_cut_mask']);data=json.loads((w/'site_surface_inputs.json').read_text());out={}
for variant,records in data.items():
 edits=[]
 mask_=mask.union(shape(p['proposed_access_revision']['secondary_flare_footprint'])) if variant=='proposed' else mask
 for r in records:
  if variant=='proposed' and r['name']=='P_Landscape_Lawns':
   updated=next(a for a in p['proposed_access_revision']['meshes'] if a['name']==r['name']);r={**r,'vertices':updated['vertices'],'faces':updated['faces'],'uv':None}
  pp=np.array(r['vertices']);uv=np.array(r['uv']) if r['uv'] is not None else None;offset=0;vv=[];ff=[];uu=[];changed=False
  for face in r['faces']:
   pts=pp[face];tex=uv[offset:offset+len(face)] if uv is not None else None;offset+=len(face);poly=Polygon(pts[:,:2]);pieces=[]
   if poly.area>1e-8 and poly.intersects(mask_):
    changed=True;cut=poly.difference(mask_);values=np.c_[pts[:,2],tex] if tex is not None else pts[:,2,None];coef=np.linalg.lstsq(np.c_[pts[:,:2],np.ones(len(pts))],values,rcond=None)[0]
    for t in constrained_delaunay_triangles(cut).geoms:
     if t.area<1e-8:continue
     xy=np.array(t.exterior.coords)[:3,:2];vals=np.c_[xy,np.ones(3)]@coef;pieces.append((np.c_[xy,vals[:,0]],vals[:,1:] if tex is not None else None))
   else:pieces=[(pts,tex)]
   for pts_,uv_ in pieces:
    i=len(vv);vv.extend(pts_.tolist());ff.append(list(range(i,i+len(pts_))))
    if uv_ is not None:uu.extend(uv_.tolist())
  if changed:edits.append({'name':r['name'],'vertices':vv,'faces':ff,'uv':uu if uv is not None else None})
 out[variant]=edits;print('GROUND_CUT',variant,[r['name'] for r in edits],flush=True)
(w/'site_ground_edits.json').write_text(json.dumps(out))
