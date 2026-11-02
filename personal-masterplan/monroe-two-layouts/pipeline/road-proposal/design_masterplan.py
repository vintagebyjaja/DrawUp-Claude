"""Proposed design, using source metres. Buildings are obstacles, never design variables."""
import sys,json,math,collections
from pathlib import Path
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps')
import numpy as np
from scipy.spatial import cKDTree
from scipy import ndimage
from shapely import constrained_delaunay_triangles,contains_xy
from shapely.geometry import Polygon,LineString,Point,box,shape
from shapely.ops import unary_union,nearest_points,substring
from site_geometry import *
from grade_profiles import fit_profile
w=ROOT;d=w/'delivery';T=load_terrain();buildings=load_buildings();B=unary_union([s for n,s in buildings]);bld=dict(buildings);half=6.7056/2
loop=rounded_path([[-44.5,418.5],[28,418.5],[28,329.5],[2,329.5],[2,294],[-44.5,294]],12);profiles={};profiles['loop']=fit_profile(loop,T,.08,closed=True,max_earthwork=2.5)
loopline=LineString(loop);ls=np.r_[0,np.cumsum(np.linalg.norm(np.diff(loop,axis=0),axis=1))]
def roadz(name,point):
 r=profiles[name];line=LineString(r['points']);s=line.project(Point(point));dist=np.r_[0,np.cumsum(np.linalg.norm(np.diff(np.array(r['points']),axis=0),axis=1))];return float(np.interp(s,dist,r['design_z']))
primary=np.vstack([bezier([[-93,398],[-75,398],[-75,424],[-57,424]]),bezier([[-57,424],[-47,424],[-41,418.5],[-31,418.5]])[1:]])
profiles['primary']=fit_profile(primary,T,.085,anchors={0:float(T(*primary[0])),len(primary)-1:roadz('loop',primary[-1])},max_earthwork=2.5)
secondary=bezier([[-42.5,272],[-42.5,283],[-37,294],[-24,294]]);profiles['secondary']=fit_profile(secondary,T,.08,anchors={0:float(T(*secondary[0])),len(secondary)-1:roadz('loop',secondary[-1])},max_earthwork=2.5)
# A flat-enough parking terrace, tied into a cross-campus through aisle at both ends.
lot=box(-6,335.5,22,353.8152);cx,cy=8,344.6576;sx=-.015;sy=-.012
west=roadz('loop',(-44.5,cy));east=roadz('loop',(28,cy));lower=max(east-.08*6-sx*(22-cx),west-.08*38.5-sx*(-6-cx));upper=min(east+.08*6-sx*(22-cx),west+.08*38.5-sx*(-6-cx));assert lower<=upper
pZ=float(np.clip(float(T(cx,cy)),lower+.06,upper-.30));plane=lambda x,y:pZ+sx*(np.asarray(x)-cx)+sy*(np.asarray(y)-cy)
p=np.c_[np.linspace(-44.5,28,170),np.ones(170)*cy];anchors={0:west,len(p)-1:east}
for i,(x,y) in enumerate(p):
 if -6<=x<=22:anchors[i]=float(plane(x,y))
profiles['cross_aisle']=fit_profile(p,T,.08,anchors=anchors,max_earthwork=3)
# A corner-building access/turning court is linked by the retained western public street.
corner_center=(-71,454);cornerCourt=Point(corner_center).buffer(6.6,resolution=24);cornerZ=min(float(T(*corner_center)),float(T(-91.8,454))+.028*20.8);cornerplane=lambda x,y:cornerZ+.012*(np.asarray(x)+71)
p=np.c_[np.linspace(-91.8,-71,50),np.ones(50)*454];ca={0:float(T(*p[0])),len(p)-1:cornerZ}
for i,xy in enumerate(p):
 if cornerCourt.contains(Point(xy)):ca[i]=float(cornerplane(*xy))
profiles['corner_access']=fit_profile(p,T,.05,anchors=ca,max_earthwork=1.8)
paths={name:LineString(r['points']) for name,r in profiles.items()};road=unary_union([l.buffer(half,cap_style='round',join_style='round') for l in paths.values()]+[cornerCourt,paths['cross_aisle'].intersection(lot).buffer(7.3152/2,cap_style='flat')]);dropSchool=box(-41.15,374,-38.55,391);dropNorth=box(-4,412.55,14,415.15);service=box(-4.0,306,-1.35,316);road=unary_union([road,dropSchool,dropNorth,service])
# Four parallel resident spaces alongside the low-speed entry drive.
resident=[];pline=paths['primary']
for k in range(4):
 s=19+6*k;c=pline.interpolate(s);a=pline.interpolate(s-.1);b=pline.interpolate(s+.1);t=np.array([b.x-a.x,b.y-a.y]);t/=np.linalg.norm(t);n=np.array([t[1],-t[0]]);center=np.array(c.coords[0])+n*(half+1.25);poly=Polygon([center+t*L+n*W for L,W in [(-2.8,-1.25),(2.8,-1.25),(2.8,1.25),(-2.8,1.25)]]);resident.append(poly)
residentShape=unary_union(resident);parking=unary_union([lot,residentShape]);paved=unary_union([road,parking]);collisions=[{'building':name,'area_m2':paved.intersection(s).area} for name,s in buildings if paved.intersection(s).area>.001];assert not collisions,collisions
# Native geometry elevations follow optimized road profiles. Crossfall: 2% crown.
profile_data={}
for name,r in profiles.items():
 pts=np.array(r['points']);profile_data[name]={'points':pts,'z':np.array(r['design_z']),'s':np.r_[0,np.cumsum(np.linalg.norm(np.diff(pts,axis=0),axis=1))],'line':paths[name],'tree':cKDTree(pts)}
def continuous_profile(r,xy):
 dist,idx=r['tree'].query(xy);best=np.full(len(xy),np.inf);values=np.zeros(len(xy));signed=np.zeros(len(xy))
 for offset in [-1,0]:
  i=np.clip(idx+offset,0,len(r['points'])-2);a=r['points'][i];b=r['points'][i+1];delta=b-a;tt=np.clip(np.sum((xy-a)*delta,axis=1)/np.maximum(np.sum(delta*delta,axis=1),1e-12),0,1);projection=a+delta*tt[:,None];distance=np.linalg.norm(xy-projection,axis=1);better=distance<best;best[better]=distance[better];values[better]=(r['z'][i]+tt*(r['z'][i+1]-r['z'][i]))[better];normal=np.c_[-delta[:,1],delta[:,0]]/np.maximum(np.linalg.norm(delta,axis=1)[:,None],1e-9);signed[better]=np.sum((xy-projection)*normal,axis=1)[better]
 return best,values,signed

def elevation(x,y):
 x,y=np.broadcast_arrays(np.asarray(x,dtype=float),np.asarray(y,dtype=float));xy=np.c_[x.ravel(),y.ravel()];num=np.zeros(len(xy));den=np.zeros(len(xy))
 for r in profile_data.values():
  dist,zvalue,signed=continuous_profile(r,xy);weights=1/np.maximum(dist+.3,.3)**3;value=zvalue-.015*signed;num+=value*weights;den+=weights
 z=num/den
 inlot=contains_xy(lot.buffer(.001),xy[:,0],xy[:,1]);z[inlot]=plane(xy[inlot,0],xy[inlot,1])
 inc=contains_xy(cornerCourt.buffer(.001),xy[:,0],xy[:,1]);z[inc]=cornerplane(xy[inc,0],xy[inc,1])
 from shapely import distance,points as make_points
 gap=distance(public,make_points(xy));near=gap<3
 if near.any():
  weight=np.clip(gap[near]/3,0,1);ground=np.asarray(T(xy[near,0],xy[near,1]))+.02;z[near]=ground*(1-weight)+z[near]*weight
 return z.reshape(x.shape)
# Retained public pavement is an access anchor, not new campus sidewalk area.
oldroads=json.loads(Path('/workspace/formit-city-context/roads_near_apartment.json').read_text());updated=json.loads(Path('/workspace/formit-city-context/reimported_road_geometry.json').read_text());pub=[]
for rr in oldroads:
 if rr['name'] not in ['road_local_203','road_local_261','road_local_157']:continue
 rr={**rr,**updated.get(rr['name'],{})};pp=np.array(rr['vertices']);pub.extend(Polygon(pp[f,:2]) for f in rr['faces'] if Polygon(pp[f,:2]).is_valid and Polygon(pp[f,:2]).area>1e-6)
public=unary_union(pub)
commonFile=Path('/workspace/monroe-two-layouts/road_geometry_plan.json')
if commonFile.exists():public=unary_union([shape(v) for v in json.loads(commonFile.read_text()).values()])
road=road.difference(public.buffer(-.02));paved=unary_union([road,parking])

# Roadside pedestrian surfaces, clipped away from every fixed building.
sidewalk=paved.buffer(1.95).difference(paved).difference(B.buffer(.35)).difference(public.buffer(.1));walk_profiles={};walk_shapes=[];path_report=[]
def path_to_building(name,start,via,building):
 end=nearest_points(Point(via[-1]),bld[building].boundary)[1];endxy=np.array(end.coords[0]);pts=rounded_path([start]+via+[list(endxy)],radius=2.3,closed=False,step=.45);line=LineString(pts);geom=line.buffer(.95,cap_style='flat',join_style='round').difference(B);z0=float(plane(*start)) if lot.buffer(2.05).contains(Point(start)) else float(elevation(*start))+(.015 if road.contains(Point(start)) else .15);zend=float(T(*endxy))+.04
 for maximum in [.05,.0833]:
  try:r=fit_profile(pts,T,maximum,anchors={0:z0,len(pts)-1:zend},max_earthwork=3.0);break
  except RuntimeError:r=None
 if r is None:raise RuntimeError('No ramp profile fits '+name)
 walk_profiles[name]=r;walk_shapes.append(geom);path_report.append({'name':name,'building':building,'profile_max_grade':r['max_grade'],'max_local_grading_m':r['max_earthwork_m'],'length_m':r['length_m'],'grade_class':'walk_5_percent_or_less' if r['max_grade']<=.05001 else 'ramp_concept_requires_landings_and_handrail_review','door_tie_in_verified':False});return geom
# The accessible parking arrival winds through the courtyard rather than taking a steep shortcut.
path_to_building('Accessible_school_court',[-2,354.1],[[13,358],[3,363],[-10,362]],'building_2356')
path_to_building('School_west_arrival',[-38.9,382],[[-35,382]],'building_2356')
path_to_building('North_hall_arrival',[-12,422.6],[[8,422.6],[8,425.8],[-12,429],[-17,431]],'building_2099')
path_to_building('South_annex_arrival',[-3.8,312],[[-8,304],[-17,305]],'building_2772')
path_to_building('Apartment_north_arrival',[-48.8,401],[[-56,401],[-65,396],[-65,393]],'building_2603')
path_to_building('Corner_building_arrival',[-65,454],[[-66,463],[-63,470],[-55,475],[-50,474]],'building_2664')
walk=unary_union([sidewalk]+walk_shapes).difference(B.buffer(.02)).difference(road);paving=unary_union([road,parking,walk]);site=Polygon([[-91,275],[-91,463],[-62,482],[-26,475],[31,451],[47,417],[52,360],[30,325],[14,285]]);grass=site.difference(paving).difference(B.buffer(.18)).difference(public.buffer(.15));assert paving.intersection(B).area<.01
# Separate profile-based walkway heights, with 2% transverse fall.
walk_data=[]
for name,r in walk_profiles.items():
 pts=np.array(r['points']);walk_data.append({'tree':cKDTree(pts),'points':pts,'z':np.array(r['design_z'])})
def walk_elevation(x,y):
 x,y=np.broadcast_arrays(np.asarray(x,float),np.asarray(y,float));xy=np.c_[x.ravel(),y.ravel()];best=np.full(len(xy),np.inf);out=np.asarray(elevation(x,y)).ravel()+.15
 inside=contains_xy(lot.buffer(2.05),xy[:,0],xy[:,1]);out[inside]=plane(xy[inside,0],xy[inside,1])
 inside=contains_xy(cornerCourt.buffer(2.05),xy[:,0],xy[:,1]);out[inside]=cornerplane(xy[inside,0],xy[inside,1])+.15
 for r in walk_data:
  dist,zvalue,signed=continuous_profile(r,xy);use=(dist<1.5)&(dist<best);out[use]=zvalue[use]-.015*signed[use];best[use]=dist[use]
 # Curb-ramp surfaces lower the sidewalk edge at marked crossing locations.
 for center,tangent in [([1,418.5],[1,0]),([-44.5,382],[0,1])]:
  tangent=np.array(tangent,dtype=float);normal=np.array([-tangent[1],tangent[0]]);delta=xy-np.array(center);along=abs(delta@tangent);across=abs(delta@normal);use=(along<2.2)&(across>=half-.03)&(across<half+1.95)&~contains_xy(lot.buffer(2.05),xy[:,0],xy[:,1]);rise=.15*np.clip((across-half)/1.8,0,1);out[use]=np.asarray(elevation(xy[use,0],xy[use,1]))+rise[use]
 return out.reshape(x.shape)
# Helpers emit actual indexed polygon meshes. Triangles are subdivided for grading fidelity.
meshes=[]
def triangles(geom,maxedge=2.):
 result=[]
 def divide(p,depth=0):
  lengths=[np.linalg.norm(p[(i+1)%3]-p[i]) for i in range(3)]
  if max(lengths)<=maxedge or depth>=5:result.append(p);return
  i=int(np.argmax(lengths));j=(i+1)%3;k=(i+2)%3;mid=(p[i]+p[j])/2;divide(np.array([p[i],mid,p[k]]),depth+1);divide(np.array([mid,p[j],p[k]]),depth+1)
 for t in constrained_delaunay_triangles(geom).geoms:
  if t.area>1e-7:divide(np.array(t.exterior.coords)[:3,:2])
 return result

def surface(name,geom,zfun,material,layer,maxedge=2.):
 if geom.is_empty:return
 tris=triangles(geom,maxedge);pts=np.array([p for tri in tris for p in tri]);zs=zfun(pts[:,0],pts[:,1]);vs=np.c_[pts,zs].tolist();fs=np.arange(len(vs)).reshape(-1,3).tolist();meshes.append({'name':name,'vertices':vs,'faces':fs,'material':material,'layer':layer})
 print('SURFACE',name,len(fs),flush=True)
surface('P_Two_Way_Road_Network',road,elevation,'asphalt','13_Proposed_Roads',1.25)
surface('P_Visitor_Staff_Parking',lot.difference(road),lambda x,y:plane(x,y)+.008,'asphalt','14_Proposed_Parking',1.5)
surface('P_Resident_Parallel_Parking',residentShape.difference(road),elevation,'asphalt','14_Proposed_Parking',1.25)
surface('P_Accessible_Paths_and_Sidewalks',walk,walk_elevation,'concrete','15_Proposed_Pedestrian',1.2)
# Grass follows original elevations; it does not flatten the site.
rawTIN=json.loads(Path('/workspace/monroe-screenshot/registration_geometry.json').read_text())['terrain'];gvs=[];gfs=[]
for original in rawTIN:
 coords=np.array(original['points']);poly=Polygon(coords[:,:2])
 if poly.area<1e-8 or not grass.intersects(poly):continue
 cut=poly.intersection(grass)
 if cut.is_empty:continue
 coeff=np.linalg.solve(np.c_[coords[:,:2],np.ones(3)],coords[:,2])
 for tri in constrained_delaunay_triangles(cut).geoms:
  if tri.area<1e-8:continue
  xy=np.array(tri.exterior.coords)[:3,:2];zz=np.c_[xy,np.ones(3)]@coeff+.04;i=len(gvs);gvs.extend(np.c_[xy,zz].tolist());gfs.append([i,i+1,i+2])
meshes.append({'name':'P_Landscape_Lawns','vertices':gvs,'faces':gfs,'material':'grass','layer':'16_Proposed_Landscape'});print('EXACT_TIN_LAWN',len(gfs),flush=True)
# Retaining edges explicitly represent local cut/fill, rather than leaving unsupported paving.
wallvs=[];wallfs=[];rail_segments=[]
outer=paving.boundary
for line in ([outer] if outer.geom_type=='LineString' else outer.geoms):
 n=max(2,int(line.length/.9)+1)
 for a,b in zip([line.interpolate(s) for s in np.linspace(0,line.length,n)[:-1]],[line.interpolate(s) for s in np.linspace(0,line.length,n)[1:]]):
  pa=np.array(a.coords[0]);pb=np.array(b.coords[0]);mid=(pa+pb)/2
  topa=float(walk_elevation(*pa)) if walk.distance(a)<.1 else float(elevation(*pa));topb=float(walk_elevation(*pb)) if walk.distance(b)<.1 else float(elevation(*pb));ga=float(T(*pa));gb=float(T(*pb))
  if max(abs(topa-ga),abs(topb-gb))>.08:
   i=len(wallvs);wallvs.extend([[*pa,ga],[*pb,gb],[*pb,topb],[*pa,topa]]);wallfs.append([i,i+1,i+2,i+3])
   if max(topa-ga,topb-gb)>.8 and walk.distance(Point(mid))<.25:rail_segments.append([[*pa,topa],[*pb,topb]])
meshes.append({'name':'P_Cut_Fill_Retaining_Edges','vertices':wallvs,'faces':wallfs,'material':'retaining','layer':'17_Proposed_Grading'})
# Parking stalls: two rows of nine, including one van-sized access bay in each row.
spaces=[];markings=[];wheelstops=[]
for row,y0 in [('visitor',335.5),('staff',348.3152)]:
 x=-5.
 for i in range(9):
  width=3.66 if i==0 else 2.60;poly=box(x,y0,x+width,y0+5.5);spaces.append({'type':row,'accessible':i==0,'center':[x+width/2,y0+2.75],'angle':math.pi/2,'length_m':5.5,'width_m':width,'polygon':poly.__geo_interface__});markings.append(LineString([(x,y0),(x,y0+5.5)]).buffer(.045,cap_style='flat'));wheelstops.append([x+width/2,y0+.35 if row=='visitor' else y0+5.15,0]);x+=width
  if i==0:
   aisle=box(x,y0,x+1.525,y0+5.5);markings.append(aisle.boundary.buffer(.045));x+=1.525
 markings.append(LineString([(x,y0),(x,y0+5.5)]).buffer(.045,cap_style='flat'))
for k,p in enumerate(resident):
 c=p.centroid;spaces.append({'type':'resident_parallel','accessible':False,'center':[c.x,c.y],'angle':math.atan2(pline.interpolate(20+6*k).y-pline.interpolate(18+6*k).y,pline.interpolate(20+6*k).x-pline.interpolate(18+6*k).x),'length_m':5.6,'width_m':2.5,'polygon':p.__geo_interface__});markings.append(p.boundary.buffer(.045))
# Painted crosswalks and restrained centerline dashes.
crosswalks=[]
gc=paths['primary'].interpolate(10);ga=paths['primary'].interpolate(9.9);gb=paths['primary'].interpolate(10.1)
for name,center,t in [('Gate',[gc.x,gc.y],[gb.x-ga.x,gb.y-ga.y]),('School',[-44.5,382],[0,1]),('North_Hall',[1,418.5],[1,0]),('Parking',[-1,cy],[1,0])]:
 t=np.array(t,dtype=float);t/=np.linalg.norm(t);n=np.array([-t[1],t[0]])
 for s in np.arange(-1.8,1.81,.65):
  c=np.array(center)+t*s;poly=Polygon([c+t*L+n*W for L,W in [(-.20,-6.2),(.20,-6.2),(.20,6.2),(-.20,6.2)]]).intersection(road)
  if not poly.is_empty:markings.append(poly)
 crosswalks.append({'name':name,'center':center})
for name,line in paths.items():
 if name=='corner_access':continue
 for s in np.arange(8,line.length-5,9):
  if name=='cross_aisle' and -6<line.interpolate(s).x<22:continue
  markings.append(substring(line,s,min(s+3,line.length)).buffer(.045,cap_style='flat'))
for name,line in paths.items():
 if name in ['cross_aisle','corner_access']:continue
 for side in ['left','right']:
  edge=line.parallel_offset(2.7432,side,join_style='round');markings.append(edge.buffer(.035,cap_style='flat'))
paint=unary_union(markings).intersection(paved);surface('P_Lane_Parking_and_Crosswalk_Paint',paint,lambda x,y:elevation(x,y)+.012,'paint','18_Proposed_Markings',1.2)
# Curbs stop at public access mouths and at stall/aisle interfaces.
curbvs=[];curbfs=[];curbBoundary=unary_union([road.boundary,parking.boundary.difference(road.buffer(.05))])
for line in ([curbBoundary] if curbBoundary.geom_type=='LineString' else curbBoundary.geoms):
 stations=np.linspace(0,line.length,max(2,int(line.length/.75)+1))
 for sa,sb in zip(stations,stations[1:]):
  a=np.array(line.interpolate(sa).coords[0]);b=np.array(line.interpolate(sb).coords[0]);mid=(a+b)/2;point=Point(mid)
  rampOpening=False
  for center,tangent in [([1,418.5],[1,0]),([-44.5,382],[0,1])]:
   tangent=np.array(tangent,dtype=float);normal=np.array([-tangent[1],tangent[0]]);delta=mid-np.array(center)
   if abs(delta@tangent)<2.25 and abs(delta@normal)<half+3.5:rampOpening=True
  for r in walk_profiles.values():
   line=LineString(r['points'])
   if line.distance(point)<1.15 and line.project(point)<4:rampOpening=True
  if rampOpening:continue
  if public.buffer(.18).contains(point) or lot.buffer(.2).contains(point) or (parking.contains(point) and road.boundary.distance(point)<.08):continue
  tangent=b-a
  if np.linalg.norm(tangent)<.01:continue
  n=np.array([-tangent[1],tangent[0]])/np.linalg.norm(tangent)*.075;corners=[a+n,a-n,b-n,b+n];i=len(curbvs)
  for height in [.005,.15]:
   curbvs.extend([[*v,float(elevation(*v))+height] for v in corners])
  curbfs.extend([[i+j for j in f] for f in [(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)]])
meshes.append({'name':'P_Concrete_Curbs','vertices':curbvs,'faces':curbfs,'material':'curb','layer':'15_Proposed_Pedestrian'})

# Remove trees only where source proxy stems physically conflict with new paved surfaces.
trees=json.loads((w/'source_trees.json').read_text());removed=[];root_review=[]
for r in trees:
 p=Point(r['xy'])
 if paving.buffer(.45).contains(p):removed.append(r['id'])
 elif paving.buffer(3).contains(p):root_review.append(r['id'])
# New tree positions are explicitly proposed; avoid paving, fixed buildings and retained tree stems.
existing=np.array([r['xy'] for r in trees if r['id'] not in removed]);oldtree=cKDTree(existing);newtrees=[]
for name,line in paths.items():
 if name in ['cross_aisle','corner_access']:continue
 for s in np.arange(12,line.length-9,15):
  for side in [-1,1]:
   p=line.interpolate(s);a=line.interpolate(max(0,s-.3));b=line.interpolate(min(line.length,s+.3));t=np.array([b.x-a.x,b.y-a.y]);t/=np.linalg.norm(t);n=np.array([-t[1],t[0]]);q=np.array(p.coords[0])+side*n*9.5;point=Point(q)
   if not grass.buffer(-1).contains(point) or B.buffer(3).contains(point) or paving.buffer(3).contains(point) or oldtree.query(q)[0]<5:continue
   if newtrees and min(np.linalg.norm(q-np.array(v['xy'])) for v in newtrees)<6:continue
   newtrees.append({'xy':q.tolist(),'z':float(T(*q)),'height_m':6.5+(len(newtrees)%3)*.65,'canopy_radius_m':2.6})
# Campus vehicle reachability, including retained public-road links.
oldroads=json.loads(Path('/workspace/formit-city-context/roads_near_apartment.json').read_text());updated=json.loads(Path('/workspace/formit-city-context/reimported_road_geometry.json').read_text());pub=[]
for rr in oldroads:
 if rr['name'] not in ['road_local_203','road_local_261','road_local_157']:continue
 rr={**rr,**updated.get(rr['name'],{})};pts=np.array(rr['vertices']);pub.extend(Polygon(pts[f,:2]) for f in rr['faces'] if Polygon(pts[f,:2]).is_valid and Polygon(pts[f,:2]).area>1e-6)
public=unary_union(pub);drivable=unary_union([road,public]);safe=drivable.buffer(-1.05);xs=np.arange(-105,45,.4);ys=np.arange(265,467,.4);xx,yy=np.meshgrid(xs,ys);grid=contains_xy(safe,xx,yy);labels,count=ndimage.label(grid,np.ones((3,3)));destinations={'main_gate':[-93,398],'secondary_gate':[-42.5,272],'school_dropoff':[-44.5,382],'north_hall_dropoff':[1,418.5],'south_annex_service':[2,312],'visitor_staff_aisle':[5,cy],'corner_access':[-74,454],'resident_bays_access':list(pline.interpolate(27).coords[0])};reachable={}
for name,(x,y) in destinations.items():
 iy=int(np.argmin(abs(ys-y)));ix=int(np.argmin(abs(xs-x)));label=int(labels[iy,ix]);reachable[name]=label
assert min(reachable.values())>0 and len(set(reachable.values()))==1,reachable
# Swept envelope for a 9m x 2.5m concept emergency vehicle, using front-axle-following bicycle kinematics.
L=5.;front=1.5;rear=2.5;width=2.5;pts=np.array(profiles['loop']['points']);theta=math.atan2(*(pts[1]-pts[0])[::-1]);sweeps=[]
for a,b in zip(pts,pts[1:]):
 delta=b-a;ds=np.linalg.norm(delta);psi=math.atan2(delta[1],delta[0]);theta+=math.sin(psi-theta)*ds/L;t=np.array([math.cos(theta),math.sin(theta)]);n=np.array([-t[1],t[0]]);rearaxle=b-L*t;poly=Polygon([rearaxle+t*x+n*y for x,y in [(-rear,-width/2),(L+front,-width/2),(L+front,width/2),(-rear,width/2)]]);sweeps.append(poly)
swept=unary_union(sweeps);sweep_outside=swept.difference(road.buffer(.15)).area;sweep_building=swept.intersection(B).area
print('SWEEP_OUTSIDE',sweep_outside,'BUILDING',sweep_building,flush=True)
# Passing the full road envelope is a concept check, not an authority-approved fire-access analysis.
report={'status':'proposed_concept_not_as_built_or_permit_design','road_width_m':6.7056,'road_width_ft':22,'minimum_loop_centerline_radius_m':12,'primary_curve_min_radius_m_approx':14.8,'vehicle_max_grades':{k:v['max_grade'] for k,v in profiles.items()},'vehicle_max_local_cut_fill_m':{k:v['max_earthwork_m'] for k,v in profiles.items()},'parking_plane':{'origin':[cx,cy,pZ],'x_slope':sx,'y_slope':sy,'gradient':float(math.hypot(sx,sy))},'parking_spaces_total':len(spaces),'visitor_spaces':9,'staff_spaces':9,'resident_parallel_spaces':4,'marked_accessible_spaces':2,'building_paving_collision_area_m2':paving.intersection(B).area,'vehicle_destination_component_labels':reachable,'all_vehicle_destinations_connected_via_proposed_and_retained_public_roads':True,'concept_emergency_vehicle':{'length_m':9,'width_m':2.5,'wheelbase_m':5,'swept_area_outside_pavement_with_0_15m_tolerance_m2':sweep_outside,'swept_building_collision_area_m2':sweep_building,'limitations':'Concept bicycle-model envelope; not a certified apparatus or fire-authority approval.'},'pedestrian_routes':path_report,'source_tree_proxy_count':len(trees),'proposed_tree_removal_candidates':removed,'preserved_tree_root_review_candidates':root_review,'new_proposed_tree_count':len(newtrees),'limitations':['Land ownership, ROW permits, utilities, fire access, drainage and actual door/floor levels are not independently verified.','Source terrain supports numeric concept grading only; retaining walls and cut/fill require civil design and survey.','Accessible parking geometry and route profiles are proposed; no ADA or code compliance certification.','All buildings remain fixed; secondary/corner access uses the existing public-road network.']}
# Closed editable pavement volumes, with explicit top, bottom and boundary walls.
sys.path.insert(0,'/workspace/monroe-two-layouts/scripts')
from pavement_slab import slab
volume_specs={'P_Two_Way_Road_Network':(road,elevation,.20),'P_Visitor_Staff_Parking':(lot.difference(road),lambda xy:plane(xy[:,0],xy[:,1])+.008,.18),'P_Resident_Parallel_Parking':(residentShape.difference(road),elevation,.18),'P_Accessible_Paths_and_Sidewalks':(walk,walk_elevation,.15)}
for data in meshes:
 if data['name'] not in volume_specs:continue
 geom,fn,depth=volume_specs[data['name']]
 if data['name'] in ['P_Two_Way_Road_Network','P_Resident_Parallel_Parking','P_Accessible_Paths_and_Sidewalks']:
  zfunc=lambda xy,f=fn:f(xy[:,0],xy[:,1])
 else:zfunc=fn
 vol=slab(geom,zfunc,depth,segment=.55);data['vertices']=vol['vertices'];data['faces']=vol['faces'];data['closed_volume']=True;data['thickness_m']=depth
report['travel_lane_width_ft']=9;report['campus_road_paved_width_ft']=22;report['paved_gutter_shoulder_ft_each_side']=2;report['parking_aisle_width_ft']=24;report['pavement_volumes_closed']=True

proposal={'meshes':meshes,'profiles':profiles,'walk_profiles':walk_profiles,'paving':paving.__geo_interface__,'site_boundary':site.__geo_interface__,'road_shape':road.__geo_interface__,'grass_shape':grass.__geo_interface__,'parking_spaces':spaces,'wheelstops':wheelstops,'new_trees':newtrees,'tree_removal_ids':removed,'guardrail_segments':rail_segments,'report':report}
(w/'proposal.json').write_text(json.dumps(proposal));(d/'validation/design_checks.json').write_text(json.dumps(report,indent=2));print('DESIGN_READY',len(meshes),len(spaces),len(newtrees),len(removed),flush=True)
