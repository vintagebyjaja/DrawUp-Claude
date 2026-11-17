import sys,json,math
from functools import lru_cache
from pathlib import Path
sys.path.insert(0,'/workspace/monroe-three-options/deps')
import numpy as np
from shapely import STRtree,constrained_delaunay_triangles,set_precision
from shapely.geometry import Polygon,Point,LineString,box,shape,mapping
from shapely.ops import unary_union
W=Path('/workspace/monroe-three-options');ROWS=json.loads((W/'baseline_site.json').read_text());A=np.array([[-.165,-.986],[-.986,.165]],float);A/=np.linalg.norm(A[0]);R={r['name']:r for r in ROWS}
def uv(v):return np.asarray(v)[:,:2]@A.T
def world(p):return np.asarray(p)@A

def geom(r):
 p=uv(r['vertices']);return unary_union([Polygon(p[f]) for f in r['faces'] if len(f)>=3 and Polygon(p[f]).area>1e-8]).buffer(0)
B={n:geom(r) for n,r in R.items() if n.startswith('building_')};BUILDINGS=unary_union(list(B.values()));PUB=unary_union([geom(r) for n,r in R.items() if n.startswith('F_road_local_')]);PROTECTED=PUB.buffer(1.9)
ROI=box(-424,17,-254.5,116).difference(PROTECTED).difference(BUILDINGS.buffer(.12));TG=[];TZ=[]
for r in ROWS:
 if not r['name'].startswith('Terrain_'):continue
 p=np.asarray(r['vertices']);p[:,:2]=uv(p)
 for f in r['faces']:
  for i in range(1,len(f)-1):
   xyz=p[[f[0],f[i],f[i+1]]];g=Polygon(xyz[:,:2]);
   if g.area<1e-7:continue
   TG.append(g);TZ.append(np.linalg.solve(np.c_[xyz[:,:2],np.ones(3)],xyz[:,2]))
TREE=STRtree(TG)
@lru_cache(maxsize=500000)
def height(u,v):
 p=Point(float(u),float(v));ids=TREE.query(p,predicate='intersects')
 if len(ids)==0:ids=[TREE.nearest(p)]
 return float(np.array([u,v,1])@TZ[int(ids[0])])
def parts(poly):return [p for p in getattr(poly,'geoms',[poly]) if p.geom_type=='Polygon' and p.area>1e-6]
def clean(poly):return set_precision(poly,1e-5).buffer(0)
def solid(name,poly,fun,depth,mat):
 poly=clean(poly);vertices=[];faces=[];index={}
 def vertex(x,y,z):
  q=tuple(round(float(v),6) for v in (x,y,z))
  if q not in index:index[q]=len(vertices);xy=world(np.array([[q[0],q[1]]]))[0];vertices.append([float(xy[0]),float(xy[1]),q[2]])
  return index[q]
 for p in parts(poly):
  # Dense interior support is supplied by the original terrain TIN, preserving exact source folds.
  for ti in TREE.query(p,predicate='intersects'):
   cut=p.intersection(TG[ti])
   for g in parts(cut):
    for t in constrained_delaunay_triangles(g).geoms:
     co=list(t.exterior.coords)[:3];co=co if ((co[1][0]-co[0][0])*(co[2][1]-co[0][1])-(co[1][1]-co[0][1])*(co[2][0]-co[0][0]))>0 else co[::-1];top=[vertex(x,y,fun(x,y)) for x,y in co];bottom=[vertex(x,y,fun(x,y)-depth) for x,y in co];faces.append(top);faces.append(bottom[::-1])
  for ring in [p.exterior,*p.interiors]:
   # Split perimeter at source TIN boundaries so sides share top boundary vertices.
   line=LineString(ring.coords);segments=[]
   for ti in TREE.query(line,predicate='intersects'):
    clipped=line.intersection(TG[ti])
    for l in getattr(clipped,'geoms',[clipped]):
     if l.geom_type=='LineString':segments.extend(zip(list(l.coords),list(l.coords)[1:]))
   seen=set()
   for a,b in segments:
    key=tuple(sorted([tuple(round(v,5) for v in a),tuple(round(v,5) for v in b)]))
    if key in seen:continue
    seen.add(key);i=vertex(*a,fun(*a));j=vertex(*b,fun(*b));k=vertex(*b,fun(*b)-depth);l=vertex(*a,fun(*a)-depth);faces.append([i,l,k,j])
 return {'name':name,'vertices':vertices,'faces':faces,'material':mat,'footprint':mapping(poly)}
if __name__=='__main__':
 for v in [30,40,50,60,70,95,104]:print(v,[(u,round(height(u,v),3)) for u in [-415,-350,-343,-337,-331,-310,-285,-279]])
 print('ROI',ROI.area,'TINS',len(TG))
