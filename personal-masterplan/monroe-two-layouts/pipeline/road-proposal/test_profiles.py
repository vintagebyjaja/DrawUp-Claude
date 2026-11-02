import sys,json,numpy as np
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps')
from site_geometry import *
from grade_profiles import fit_profile
from shapely.geometry import LineString
terrain=load_terrain();loop=rounded_path([[-44.5,418.5],[28,418.5],[28,329.5],[2,329.5],[2,294],[-44.5,294]],12);profiles={};profiles['loop']=fit_profile(loop,terrain,.08,closed=True,max_earthwork=2.5)
line=LineString(loop);s=np.r_[0,np.cumsum(np.linalg.norm(np.diff(loop,axis=0),axis=1))];z=np.array(profiles['loop']['design_z'])
def zloop(xy):return float(np.interp(line.project(__import__('shapely').geometry.Point(xy)),s,z))
primary=bezier([[-93,400.5],[-76,400.5],[-50,418.5],[-31,418.5]]);profiles['primary']=fit_profile(primary,terrain,.085,anchors={0:float(terrain(*primary[0])),len(primary)-1:zloop(primary[-1])},max_earthwork=3)
# Correct the endpoint key to its actual array index (negative indices refer to LP variables).
secondary=bezier([[-42.5,272],[-42.5,283],[-37,294],[-24,294]]);profiles['secondary']=fit_profile(secondary,terrain,.08,anchors={0:float(terrain(*secondary[0])),len(secondary)-1:zloop(secondary[-1])},max_earthwork=2.5)
for name,r in profiles.items():print(name,{k:r[k] for k in ['length_m','max_grade','max_earthwork_m']},flush=True)
print('loopparking endpoints',zloop([-44.5,344.3528]),zloop([28,344.3528]))
(ROOT/'profiles_trial.json').write_text(json.dumps(profiles))
