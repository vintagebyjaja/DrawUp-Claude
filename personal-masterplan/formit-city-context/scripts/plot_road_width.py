import json,math
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
w=Path('/workspace/formit-city-context');d=w/'delivery';before={r['name']:r for r in json.loads((w/'roads_near_apartment.json').read_text())};after=json.loads((w/'reimported_road_geometry.json').read_text());names=['road_local_261','road_local_203']
def section(r,y):
 xs=[]
 for f in r['faces']:
  poly=[r['vertices'][i] for i in f]
  for a,b in zip(poly,poly[1:]+poly[:1]):
   if min(a[1],b[1])<=y<=max(a[1],b[1]) and abs(b[1]-a[1])>1e-9:xs.append(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]))
 return min(xs),max(xs)
# Independent perpendicular-width recomputation FROM REIMPORTED FBX triangle data.
checks=[]
for y in [300,325,345,385,410,450,475]:
 old=before['road_local_261' if y<366 else 'road_local_203'];q=section(old,y);qa=section(old,y-.5);qb=section(old,y+.5);s=((qb[0]+qb[1])-(qa[0]+qa[1]))/2;c=(q[0]+q[1])/2;norm=math.sqrt(1+s*s);allrot={'vertices':[],'faces':[]}
 for name in names:
  r=after[name];start=len(allrot['vertices']);allrot['vertices'].extend([[(p[0]-c-s*(p[1]-y))/norm,(s*(p[0]-c)+(p[1]-y))/norm,0] for p in r['vertices']]);allrot['faces'].extend([[start+i for i in f] for f in r['faces']])
 a,b=section(allrot,0);width=b-a;checks.append({'world_y_m':y,'reimported_perpendicular_width_m':width,'width_ft':width/.3048,'error_m':abs(width-6.7056)})
assert max(r['error_m'] for r in checks)<.011
(d/'validation/road_width_reimport_check.json').write_text(json.dumps({'passed':True,'target_ft':22,'target_m':6.7056,'checks':checks,'maximum_error_m':max(r['error_m'] for r in checks),'authority':'User supplied dimension; numerical export validation, not surveyed accuracy.'},indent=2))
fig,axes=plt.subplots(1,2,figsize=(9,7),constrained_layout=True)
for ax,source,title in zip(axes,[before,after],['Original source road','Corrected export — 22 ft']):
 for name in names:
  r=source[name];polys=[[(r['vertices'][i][0],r['vertices'][i][1]) for i in f] for f in r['faces']];ax.add_collection(PolyCollection(polys,facecolor='#555d62',edgecolor='none'))
 apt=before['building_2603'];polys=[[(apt['vertices'][i][0],apt['vertices'][i][1]) for i in f] for f in apt['faces']];ax.add_collection(PolyCollection(polys,facecolor='#c4ad8a',edgecolor='none'))
 q=section(source['road_local_261'],325);ax.annotate('',xy=(q[0],325),xytext=(q[1],325),arrowprops={'arrowstyle':'<->','color':'#efb820','linewidth':2});ax.text(sum(q)/2,329,'22 ft' if source is after else 'Source width',ha='center',fontsize=9,bbox={'facecolor':'white','alpha':.8,'edgecolor':'none'});ax.set(xlim=(-110,-75),ylim=(290,360),aspect='equal',xlabel='Local X (metres)',ylabel='Local Y (metres)',title=title);ax.set_facecolor('#e5e8db');ax.grid(alpha=.15)
fig.suptitle('Apartment-side street: source vs corrected FBX\nBuildings and terrain retain their original scale and positions',fontsize=12);fig.savefig(d/'previews/04_road_width_comparison.png',dpi=170);plt.close(fig)
print('REIMPORTED_ROAD_WIDTH_CHECK_PASSED',max(r['error_m'] for r in checks))
