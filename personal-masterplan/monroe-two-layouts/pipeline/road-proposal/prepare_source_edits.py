"""Keep original site data; clip working terrain only under the proposed paving."""
import sys,json,numpy as np
from pathlib import Path
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps')
from shapely import constrained_delaunay_triangles
from shapely.geometry import Polygon,Point,shape
from shapely.prepared import prep
w=Path('/workspace/monroe-road-redesign');proposal=json.loads((w/'proposal.json').read_text());pave=shape(proposal['paving']);site=shape(proposal['site_boundary']);mask=prep(pave);siteprep=prep(site);sources=json.loads((w/'source_surfaces.json').read_text());edits=[];retire=[];changed_area=0.
for source in sources:
 name=source['name'];isTerrain=name.startswith('Terrain_');isPath=name.startswith('road_paths_');isCurb=name.startswith('Curbs_')
 if name in ['road_service_217','road_service_236','road_service_246']:retire.append(name);continue
 if not(isTerrain or isPath or isCurb):continue
 points=np.array(source['points']);uv=np.array(source['uv']) if source['uv'] is not None else None;offset=0;vv=[];ff=[];uvs=[];changed=False
 for face in source['faces']:
  pp=points[face];faceUV=uv[offset:offset+len(face)] if uv is not None else None;offset+=len(face)
  if isCurb:
   if siteprep.contains(Point(pp[:,:2].mean(0))):changed=True;continue
   result=[pp];resultUV=[faceUV]
  else:
   poly=Polygon(pp[:,:2]);target=pave if isTerrain else site;intersector=mask if isTerrain else siteprep
   if poly.area<1e-8 or not intersector.intersects(poly):result=[pp];resultUV=[faceUV]
   else:
    changed=True;difference=poly.difference(target);removed=poly.area-difference.area
    if isTerrain:changed_area+=removed
    if difference.is_empty:continue
    # All retained cut points lie on the same original plane; UVs interpolate on it.
    A=np.c_[pp[:,:2],np.ones(len(pp))];attributes=np.c_[pp[:,2],faceUV] if faceUV is not None else pp[:,2,None];coef=np.linalg.lstsq(A,attributes,rcond=None)[0];result=[];resultUV=[]
    for tri in constrained_delaunay_triangles(difference).geoms:
     if tri.area<1e-8:continue
     xy=np.array(tri.exterior.coords)[:3,:2];v=np.c_[xy,np.ones(3)]@coef;result.append(np.c_[xy,v[:,0]]);resultUV.append(v[:,1:] if faceUV is not None else None)
  for p,u in zip(result,resultUV):
   i=len(vv);vv.extend(p.tolist());ff.append(list(range(i,i+len(p))))
   if u is not None:uvs.extend(u.tolist())
 if changed:
  if not ff:retire.append(name)
  else:edits.append({'name':name,'vertices':vv,'faces':ff,'uv':uvs if uv is not None else None})
  print('SOURCE_EDIT',name,len(ff),flush=True)
(w/'source_edits.json').write_text(json.dumps({'edits':edits,'retire_objects':retire,'terrain_xy_area_removed_for_proposed_paving_m2':changed_area}));print('SOURCE_EDITS_READY',len(edits),len(retire),changed_area,flush=True)
