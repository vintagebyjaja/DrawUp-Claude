import sys,json,numpy as np
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps')
from site_geometry import *
from shapely.geometry import LineString,Point,box
terrain=load_terrain();buildings=load_buildings();union=unary_union([s for n,s in buildings]);loop=rounded_path([[-44.5,418.5],[28,418.5],[28,329.5],[2,329.5],[2,294],[-44.5,294]],12)
paths={'loop':loop,'primary':bezier([[-93,412],[-75,412],[-49,418.5],[-31,418.5]]),'secondary':bezier([[-42.5,272],[-42.5,283],[-37,294],[-24,294]]),'cross_aisle':np.c_[np.linspace(-44.5,28,130),np.ones(130)*344.3528]}
for name,p in paths.items():
 z=np.asarray(terrain(p[:,0],p[:,1]));ds=np.linalg.norm(np.diff(p,axis=0),axis=1);grad=np.diff(z)/ds;road=LineString(p).buffer(6.7056/2,cap_style='round',join_style='round');bad=[(n,road.intersection(s).area) for n,s in buildings if road.intersects(s)];print(name,'length',sum(ds),'zrange',z.min(),z.max(),'grade max',np.max(abs(grad)),'p90',np.quantile(abs(grad),.9),'collisions',bad,flush=True)
for name,b in [('main_lot',[-9,335.5,22,353.2056]),('res_lot',[-76,395,-54,408]),('corner_court',[-83,447,-63,460])]:
 x,y=np.meshgrid(np.linspace(b[0],b[2],15),np.linspace(b[1],b[3],15));z=np.asarray(terrain(x,y));A=np.c_[x.ravel()-x.mean(),y.ravel()-y.mean(),np.ones(x.size)];coef=np.linalg.lstsq(A,z.ravel(),rcond=None)[0];print(name,'zrange',z.min(),z.max(),'plane',coef,'collision',[(n,box(*b).intersection(s).area) for n,s in buildings if box(*b).intersects(s)],flush=True)
(ROOT/'candidate_paths.json').write_text(json.dumps({k:v.tolist() for k,v in paths.items()}))
