import numpy as np
from scipy.optimize import linprog
from scipy.sparse import lil_matrix

def fit_profile(points,terrain,max_grade=.08,anchors=None,max_earthwork=3,closed=False):
 points=np.asarray(points);ground=np.asarray(terrain(points[:,0],points[:,1]),dtype=float);N=len(points);ds=np.linalg.norm(np.diff(points,axis=0),axis=1);rows=[];rhs=[]
 def row(terms,b):rows.append(terms);rhs.append(b)
 for i in range(N):row({i:1,N+i:-1},ground[i]);row({i:-1,N+i:-1},-ground[i])
 for i,d in enumerate(ds):row({i+1:1,i:-1},max_grade*d);row({i+1:-1,i:1},max_grade*d)
 # Limit changes of longitudinal grade, avoiding a jagged piecewise surface.
 for i in range(1,N-1):
  a,b=ds[i-1],ds[i];terms={i-1:1/a,i:-1/a-1/b,i+1:1/b};limit=.007*(a+b)/2;row(terms,limit);row({k:-v for k,v in terms.items()},limit)
 A=lil_matrix((len(rows),2*N))
 for i,terms in enumerate(rows):
  for j,v in terms.items():A[i,j]=v
 eq=[];beq=[]
 for i,z in (anchors or {}).items():r=np.zeros(2*N);r[i]=1;eq.append(r);beq.append(z)
 if closed:r=np.zeros(2*N);r[0]=1;r[N-1]=-1;eq.append(r);beq.append(0.)
 result=linprog(np.r_[np.zeros(N),np.ones(N)],A_ub=A.tocsr(),b_ub=np.array(rhs),A_eq=np.array(eq) if eq else None,b_eq=np.array(beq) if eq else None,bounds=[(z-max_earthwork,z+max_earthwork) for z in ground]+[(0,None)]*N,method='highs')
 if not result.success:raise RuntimeError('Profile infeasible: '+result.message)
 z=result.x[:N];return {'points':points.tolist(),'ground_z':ground.tolist(),'design_z':z.tolist(),'length_m':float(ds.sum()),'max_grade':float(max(abs(np.diff(z)/ds))),'max_earthwork_m':float(max(abs(z-ground))),'max_grade_target':max_grade}
