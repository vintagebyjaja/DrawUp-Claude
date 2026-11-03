import sys,json
from pathlib import Path
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps')
from shapely.geometry import box,LineString,shape
# Reuse the TIN projection without rerunning neighborhood preparation.
p=Path('/workspace/monroe-material-update/scripts/prepare_geometry.py');source=p.read_text();namespace={};exec(source[:source.index('# Existing image-derived baseball dirt')],namespace)
mesh=namespace['mesh_region'];w=namespace['w'];fields=namespace['fields'];data=json.loads((w/'sports_parts.json').read_text());poly=fields['E_Baseball_Field'];xmin,ymin,xmax,ymax=poly.bounds
def world(px,py):return xmin+px/755*(xmax-xmin),ymax-py/418*(ymax-ymin)
pts=[world(*a) for a in [(460,95),(460,220),(330,220),(330,95)]]
for i,(x,y) in enumerate(pts):data+=mesh('E_Baseball_Base_%d'%i,box(x-.22,y-.22,x+.22,y+.22).intersection(poly),.063,.012,'paint')
for i,point in enumerate([pts[1],pts[3]]):
 v=(point[0]-pts[0][0],point[1]-pts[0][1]);q=(pts[0][0]+v[0]*3.0,pts[0][1]+v[1]*3.0);line=LineString([pts[0],q]).buffer(.045,cap_style='flat').intersection(poly);data+=mesh('E_Baseball_Foul_Line_%d'%i,line,.058,.006,'paint')
football=fields['E_Football_Field'];c=football.centroid;cx,cy=c.x,c.y;marks=[]
for i in range(1,100):
 y=cy-45.72+i*.9144
 for x in [cx-24.0,cx-3.1,cx+3.1,cx+24.0]:marks.append(box(x-.30,y-.035,x+.30,y+.035))
from shapely.ops import unary_union
data+=mesh('E_Football_Hash_Marks',unary_union(marks).intersection(football),.057,.006,'paint')
(w/'sports_parts.json').write_text(json.dumps(data));print('SPORTS_WITH_MARKS',len(data))
