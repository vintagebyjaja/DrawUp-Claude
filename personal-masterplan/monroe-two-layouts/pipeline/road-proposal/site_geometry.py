import json,numpy as np
from pathlib import Path
import matplotlib.tri as mtri
from shapely.geometry import shape,Polygon
from shapely.ops import unary_union
ROOT=Path('/workspace/monroe-road-redesign')
def load_terrain():
 raw=json.loads(Path('/workspace/monroe-screenshot/registration_geometry.json').read_text());p=np.array([v for t in raw['terrain'] for v in t['points']],dtype=float);unique,ids=np.unique(p,axis=0,return_inverse=True);triangles=ids.reshape(-1,3);tri=mtri.Triangulation(unique[:,0],unique[:,1],triangles);interp=mtri.LinearTriInterpolator(tri,unique[:,2]);return interp

def load_buildings():
 return [(b['name'],shape(b['geometry'])) for b in json.loads((ROOT/'site_buildings.json').read_text())]

def rounded_path(vertices,radius=12,closed=True,step=.65):
 pts=np.array(vertices,dtype=float);N=len(pts);corners=[]
 for i,b in enumerate(pts):
  if not closed and i in (0,N-1):corners.append(([b],b,b));continue
  a=pts[(i-1)%N];c=pts[(i+1)%N];u=(b-a)/np.linalg.norm(b-a);v=(c-b)/np.linalg.norm(c-b);angle=np.arccos(np.clip(u@v,-1,1))
  if angle<1e-5:corners.append(([b],b,b));continue
  sign=np.sign(np.cross(u,v));cut=min(radius*np.tan(angle/2),np.linalg.norm(b-a)*.45,np.linalg.norm(c-b)*.45);r=cut/np.tan(angle/2);start=b-u*cut;end=b+v*cut;normal=np.array([-u[1],u[0]])*sign;center=start+normal*r;t0=np.arctan2(*(start-center)[::-1]);ts=t0+sign*np.linspace(0,angle,max(3,int(r*angle/step)+1));arc=center+np.c_[np.cos(ts),np.sin(ts)]*r;corners.append((arc,start,end))
 out=[]
 for i,(arc,start,end) in enumerate(corners):
  if i==0:out.extend(arc)
  else:
   previous=corners[i-1][2];n=max(2,int(np.linalg.norm(start-previous)/step)+1);out.extend(np.linspace(previous,start,n)[1:]);out.extend(arc[1:])
 if closed:
  a=corners[-1][2];b=corners[0][1];out.extend(np.linspace(a,b,max(2,int(np.linalg.norm(a-b)/step)+1))[1:])
 return np.array(out)

def bezier(points,step=.6):
 p=np.array(points,dtype=float);length=sum(np.linalg.norm(b-a) for a,b in zip(p,p[1:]));t=np.linspace(0,1,int(length/step)+2)[:,None];return (1-t)**3*p[0]+3*(1-t)**2*t*p[1]+3*(1-t)*t*t*p[2]+t**3*p[3]
