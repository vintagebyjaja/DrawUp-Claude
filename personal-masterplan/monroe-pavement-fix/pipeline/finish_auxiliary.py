from pathlib import Path
import json,numpy as np
prefix=Path('/workspace/monroe-pavement-fix/scripts/finalize_geometry.py').read_text().split('for variant,records in source.items():')[0];ns={};exec(prefix,ns);close=ns['close'];w=Path('/workspace/monroe-pavement-fix')
from shapely.geometry import Polygon,shape,box,LineString
from shapely import constrained_delaunay_triangles
from shapely.ops import unary_union
rawsurfaces=json.loads((w/'surfaces.json').read_text());aux=json.loads((w/'auxiliary.json').read_text())
for variant in ['existing','proposed']:
 p=json.loads((w/(variant+'_repairs.json')).read_text());streetnames={'F_'+r['name'] for r in rawsurfaces[variant] if r['kind']=='road'};pieces=[]
 for r in p['replacements']:
  if r['name'] not in streetnames:continue
  a=np.array(r['vertices']);N=len(a)//2;pieces.extend(Polygon(a[f,:2]) for f in r['faces'] if all(i<N for i in f))
 streets=unary_union(pieces).intersection(box(-115,260,60,490));vehicle=shape(p['vehicle_footprint']).intersection(box(-115,260,60,490))
 for r in aux[variant]:
  n=r['name'];v=np.array(r['vertices']);triangles=[];mask=vehicle if n=='P_Landscape_Lawns' else streets.buffer(.025)
  if n=='P_Cut_Fill_Retaining_Edges':
   vs=[];fs=[]
   for f in r['faces']:
    q=v[f]
    if len(q)!=4:continue
    line=LineString(q[:2,:2]);cut=line.difference(mask)
    if cut.is_empty:continue
    for seg in ([cut] if cut.geom_type=='LineString' else cut.geoms):
     if seg.geom_type!='LineString' or seg.length<.001:continue
     a,b=np.array(seg.coords)[[0,-1],:2];delta=q[1,:2]-q[0,:2];L=max(delta@delta,1e-12);ta=(a-q[0,:2])@delta/L;tb=(b-q[0,:2])@delta/L;topa=q[0,2]+ta*(q[1,2]-q[0,2]);topb=q[0,2]+tb*(q[1,2]-q[0,2]);bota=q[3,2]+ta*(q[2,2]-q[3,2]);botb=q[3,2]+tb*(q[2,2]-q[3,2]);i=len(vs);vs.extend([[*a,topa],[*b,topb],[*b,botb],[*a,bota]]);fs.append([i,i+1,i+2,i+3])
   p['replacements'].append({'name':'F_Retaining_Edges_Clear_of_Public_Roads','vertices':vs,'faces':fs,'material':'concrete','open_surface':True});p['retire'].append(n);continue
  for f in r['faces']:
   q=v[f];poly=Polygon(q[:,:2])
   if poly.area<1e-8:continue
   if n=='P_Concrete_Curbs':
    normal=np.cross(q[1]-q[0],q[2]-q[0])
    if normal[2]<=0:continue
   cut=poly.difference(mask)
   if cut.is_empty:continue
   coef=np.linalg.lstsq(np.c_[q[:,:2],np.ones(len(q))],q[:,2],rcond=None)[0]
   for t in constrained_delaunay_triangles(cut).geoms:
    if t.area<1e-8:continue
    xy=np.array(t.exterior.coords)[:3,:2]
    if np.cross(xy[1]-xy[0],xy[2]-xy[0])<0:xy=xy[::-1]
    triangles.append(np.c_[xy,np.c_[xy,np.ones(3)]@coef])
  if n=='P_Landscape_Lawns':
   vv=[];ff=[]
   for q in triangles:i=len(vv);vv.extend(q.tolist());ff.append([i,i+1,i+2])
   p['replacements'].append({'name':'F_Campus_Lawns_Clear_of_Roads','vertices':vv,'faces':ff,'material':'grass','open_surface':True})
  elif triangles:p['replacements'].append(close('F_Campus_Curbs_Clear_of_Public_Roads',triangles,.145,'concrete'))
  p['retire'].append(n)
 (w/(variant+'_repairs.json')).write_text(json.dumps(p));print('AUX_READY',variant,flush=True)
