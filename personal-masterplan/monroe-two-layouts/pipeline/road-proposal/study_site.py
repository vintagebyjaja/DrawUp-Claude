from pathlib import Path
import json,sys,numpy as np
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps')
from shapely.geometry import Polygon
from shapely.ops import unary_union
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
w=Path('/workspace/monroe-road-redesign');raw=json.loads(Path('/workspace/monroe-screenshot/registration_geometry.json').read_text());buildings=[]
for b in raw['buildings']:
 points=np.array(b['points']);polys=[]
 for f in b['faces']:
  p=Polygon(points[f,:2])
  if p.is_valid and p.area>.05:polys.append(p)
 shape=unary_union(polys)
 if shape.is_empty:continue
 if shape.bounds[2]<-140 or shape.bounds[0]>160 or shape.bounds[3]<240 or shape.bounds[1]>520:continue
 buildings.append({'name':b['name'],'geometry':shape.__geo_interface__,'bounds':list(shape.bounds),'zmin':float(points[:,2].min()),'zmax':float(points[:,2].max())})
(w/'site_buildings.json').write_text(json.dumps(buildings));fig,ax=plt.subplots(figsize=(12,12));confirmed={'building_2356':'MAIN SCHOOL','building_2099':'NORTH HALL','building_2772':'SOUTH ANNEX','building_2603':'APARTMENT','building_2664':'CORNER'}
for b in buildings:
 from shapely.geometry import shape
 p=shape(b['geometry']);ps=list(p.geoms) if p.geom_type=='MultiPolygon' else [p]
 for poly in ps:ax.fill(*poly.exterior.xy,color='#c5b292' if b['name'] in confirmed else '#dedbd4',edgecolor='#666666',linewidth=.6)
 c=p.centroid;label=confirmed.get(b['name'],b['name'].replace('building_',''));ax.text(c.x,c.y,label,ha='center',va='center',fontsize=8)
roads=json.loads(Path('/workspace/formit-city-context/roads_near_apartment.json').read_text());new=json.loads(Path('/workspace/formit-city-context/reimported_road_geometry.json').read_text())
for r in roads:
 if r['name'].startswith('building_'):continue
 if r['name'] in new:r={**r,**new[r['name']]}
 polys=[[r['vertices'][i][:2] for i in f] for f in r['faces']];ax.add_collection(PolyCollection(polys,facecolor='#77848b',edgecolor='none'))
ax.set(xlim=(-140,160),ylim=(240,520),aspect='equal',xlabel='Local east (m)',ylabel='Local north (m)',title='Existing source buildings and streets — no buildings moved');ax.grid(alpha=.2);fig.tight_layout();fig.savefig(w/'site_study.png',dpi=140)
print('SITE_BUILDINGS',len(buildings),flush=True)
