import numpy as np,collections
from shapely import constrained_delaunay_triangles
def slab(poly,zfun,depth,segment=3.):
 coords=[];faces=[];lookup={}
 for tri in constrained_delaunay_triangles(poly.segmentize(segment)).geoms:
  if tri.area<1e-7:continue
  xy=np.array(tri.exterior.coords)[:3,:2]
  if np.cross(xy[1]-xy[0],xy[2]-xy[0])<0:xy=xy[::-1]
  f=[]
  for v in xy:
   key=tuple(np.round(v,6))
   if key not in lookup:lookup[key]=len(coords);coords.append(list(v))
   f.append(lookup[key])
  faces.append(f)
 if not coords:return None
 xy=np.array(coords);z=zfun(xy);top=np.c_[xy,z];vs=np.vstack([top,top-[0,0,depth]]).tolist();N=len(top);count=collections.Counter()
 for f in faces:
  for a,b in zip(f,f[1:]+f[:1]):count[tuple(sorted((a,b)))]+=1
 boundary=[]
 for f in faces:
  for a,b in zip(f,f[1:]+f[:1]):
   if count[tuple(sorted((a,b)))]==1:boundary.append([a,b,b+N,a+N])
 fs=faces+[[i+N for i in reversed(f)] for f in faces]+boundary;edges=collections.Counter()
 for f in fs:
  for a,b in zip(f,f[1:]+f[:1]):edges[tuple(sorted((a,b)))]+=1
 assert all(v==2 for v in edges.values())
 return {'vertices':vs,'faces':fs,'top_vertex_count':N,'closed_edge_incidence':True,'thickness_m':depth}
