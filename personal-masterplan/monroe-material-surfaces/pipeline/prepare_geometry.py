import sys,json,math,collections
from pathlib import Path
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps')
import numpy as np
from PIL import Image
from scipy import ndimage
from shapely import constrained_delaunay_triangles, STRtree
from shapely.geometry import Polygon,shape,box,Point,LineString
from shapely.ops import unary_union
w=Path('/workspace/monroe-material-update');old=Path('/workspace/monroe-two-layouts');raw=json.loads(Path('/workspace/monroe-screenshot/registration_geometry.json').read_text());roads=json.loads((old/'common_road_meshes.json').read_text());proposal=json.loads(Path('/workspace/monroe-road-redesign/proposal.json').read_text());sports=json.loads((old/'sports_shapes.json').read_text());fields={a['name']:shape(a['geometry']) for a in sports};sportsUnion=unary_union(list(fields.values()));domain=box(-701.64264,-698.38855,701.64264,698.38855)
parts=[]
for b in raw['buildings']:
 p=np.array(b['points'])
 for f in b['faces']:
  poly=Polygon(p[f,:2])
  if poly.is_valid and poly.area>.02:parts.append(poly)
B=unary_union(parts).buffer(.20);roadpolys=[shape(r['footprint']) for r in roads if r['family']!='paths'];paths=unary_union([shape(r['footprint']) for r in roads if r['family']=='paths']);roadUnion=unary_union(roadpolys);site=shape(proposal['site_boundary']);newroad=shape(proposal['road_shape']);paving=shape(proposal['paving']);print('UNIONS_READY',flush=True)
# Use original TIN planes exactly, rather than resampling long sidewalk triangles.
terrain=[]
for item in raw['terrain']:
 p=np.array(item['points']);poly=Polygon(p[:,:2])
 if poly.area<1e-8:continue
 coef=np.linalg.solve(np.c_[p[:,:2],np.ones(3)],p[:,2]);terrain.append((poly,coef))
tree=STRtree([a[0] for a in terrain])
def mesh_region(name,poly,offset=.18,depth=.12,material='concrete',split=False):
 groups={}
 for index in tree.query(poly,predicate='intersects'):
  tri,coef=terrain[index];cut=tri.intersection(poly)
  for t in constrained_delaunay_triangles(cut).geoms:
   if t.area<1e-7:continue
   xy=np.array(t.exterior.coords)[:3,:2]
   if np.cross(xy[1]-xy[0],xy[2]-xy[0])<0:xy=xy[::-1]
   group=(int(t.centroid.x//100),int(t.centroid.y//100)) if split else (0,0)
   groups.setdefault(group,[]).append(np.c_[xy,np.c_[xy,np.ones(3)]@coef+offset])
 out=[]
 for key,tris in groups.items():
  lookup={};vertices=[];faces=[]
  for tri in tris:
   f=[]
   for v in tri:
    k=tuple(np.round(v,6))
    if k not in lookup:lookup[k]=len(vertices);vertices.append(v.tolist())
    f.append(lookup[k])
   faces.append(f)
  N=len(vertices);counts=collections.Counter()
  for f in faces:
   for a,b in zip(f,f[1:]+f[:1]):counts[tuple(sorted((a,b)))]+=1
  sides=[]
  for f in faces:
   for a,b in zip(f,f[1:]+f[:1]):
    if counts[tuple(sorted((a,b)))]==1:sides.append([b,a,a+N,b+N])
  vertices+= [[x,y,z-depth] for x,y,z in vertices[:N]];fs=faces+[[i+N for i in reversed(f)] for f in faces]+sides
  out.append({'name':name+('_%d_%d'%key if split else ''),'vertices':vertices,'faces':fs,'material':material,'closed':True})
 return out
# Existing image-derived baseball dirt: identify warm bare-earth pixels, clean noise, preserve the grass island.
def dirt_from_image(name,filename,secondary=False):
 poly=fields[name];a=np.array(Image.open(old/'delivery/Shared_Textures'/filename).convert('RGB').resize((160,160)));r,g,b=[a[:,:,i].astype(float) for i in range(3)]
 if secondary:
  mask=(r>g*.98)&(r>b*1.13)&(r>105);mask[74:]=False;mask[:,:20]=False
 else:mask=(r>g*1.12)&(r>b*1.24)&(r>120)
 mask=ndimage.binary_closing(mask,iterations=1);labels,n=ndimage.label(mask);sizes=np.bincount(labels.ravel());keep=np.where(sizes>10)[0];keep=keep[keep!=0];mask=np.isin(labels,keep);bounds=poly.bounds;h,ww=mask.shape;rects=[]
 for j,row in enumerate(mask):
  ids=np.where(row)[0]
  for group in np.split(ids,np.where(np.diff(ids)>1)[0]+1):
   if len(group):rects.append(box(bounds[0]+group[0]/ww*(bounds[2]-bounds[0]),bounds[3]-(j+1)/h*(bounds[3]-bounds[1]),bounds[0]+(group[-1]+1)/ww*(bounds[2]-bounds[0]),bounds[3]-j/h*(bounds[3]-bounds[1])))
 return unary_union(rects).simplify(.4,preserve_topology=True).intersection(poly)
fieldmeshes=[];fieldreport=[]
for name,filename,secondary in [('E_Baseball_Field','Sports_Baseball.jpg',False),('E_Woodson_Baseball_Practice_Field','Sports_Woodson_Baseball.jpg',True)]:
 poly=fields[name];dirt=dirt_from_image(name,filename,secondary);grass=poly.difference(dirt)
 fieldmeshes+=mesh_region(name+'_Grass',grass,.045,.12,'sports_grass')+mesh_region(name+'_Dirt',dirt,.045,.12,'dirt')
 fieldreport.append({'field':name,'grass_area_m2':grass.area,'dirt_area_m2':dirt.area,'grass_dirt_overlap_m2':grass.intersection(dirt).area,'partition_missing_m2':poly.difference(unary_union([grass,dirt])).area,'method':'Warm-earth pixel mask on the existing registered reference; approximate, manually review boundary.'})
football=fields['E_Football_Field'];track=fields['E_Running_Track'];fieldmeshes+=mesh_region('E_Football_Turf',football,.045,.12,'sports_grass')+mesh_region('E_Running_Track_Surface',track,.045,.12,'track')
# Explicitly illustrative 120-yard playing rectangle, divided into individually selectable stripes.
c=football.centroid;cx,cy=c.x,c.y;halfW=24.384;halfL=54.864;rect=box(cx-halfW,cy-halfL,cx+halfW,cy+halfL);lines=[]
for i in range(25):
 y=cy-halfL+i*4.572;poly=box(cx-halfW,y-.05,cx+halfW,y+.05).intersection(football);fieldmeshes+=mesh_region('E_Football_Yard_Line_%02d'%i,poly,.055,.006,'paint')
for side in [-1,1]:
 x=cx+side*halfW;fieldmeshes+=mesh_region('E_Football_Sideline_%s'%side,box(x-.05,cy-halfL,x+.05,cy+halfL).intersection(football),.055,.006,'paint')
# Track lane lines follow the existing image-traced inside/outside track envelope.
inner=Polygon(track.interiors[0]);outer=Polygon(track.exterior);width=inner.boundary.distance(outer.boundary)
for i in range(1,7):
 ring=inner.buffer(width*i/7).boundary.buffer(.045).intersection(track);fieldmeshes+=mesh_region('E_Track_Lane_Marking_%02d'%i,ring,.055,.006,'paint')
(w/'sports_parts.json').write_text(json.dumps(fieldmeshes));print('SPORTS_PARTS',len(fieldmeshes),flush=True)
# Source street pair overlaps identify candidate junctions; markings are a proposed overlay, not surveyed signs.
public=[(r,shape(r['footprint'])) for r in roads if r['family'] in ['local','collector','arterial']];publictree=STRtree([p for r,p in public]);junctions=[]
for i,(r,p) in enumerate(public):
 for j in publictree.query(p,predicate='intersects'):
  if j<=i:continue
  q=public[j][1];cut=p.intersection(q)
  if cut.area<1.:continue
  c=cut.centroid
  if not any(c.distance(a)<10 for a in junctions):junctions.append(c)
crossings=[];accepted=[]
for center in junctions:
 for j in publictree.query(center.buffer(13),predicate='intersects'):
  r,p=public[j];coords=np.array(p.exterior.coords) if p.geom_type=='Polygon' else np.array(max(p.geoms,key=lambda a:a.area).exterior.coords)
  vals,vec=np.linalg.eigh(np.cov(coords[:,:2].T));axis=vec[:,-1];normal=np.array([-axis[1],axis[0]]);width=r.get('nominal_pavement_width_m') or 6.
  if vals[-1]<vals[0]*2:continue
  for sign in [-1,1]:
   mid=np.array([center.x,center.y])+axis*sign*(max(width/2,3)+3.3)
   if not p.buffer(.1).contains(Point(mid)):continue
   if any(np.linalg.norm(mid-a)<7 for a in accepted):continue
   line=LineString([mid-normal*15,mid+normal*15]);cut=line.intersection(p)
   if cut.is_empty or cut.geom_type!='LineString' or cut.length<3 or cut.length>15:continue
   endpoints=np.array(cut.coords)[[0,-1]];mid=endpoints.mean(0);across=(endpoints[1]-endpoints[0]);across/=np.linalg.norm(across);length=np.linalg.norm(endpoints[1]-endpoints[0])-.4;along=np.array([-across[1],across[0]]);stripes=[]
   for k in range(4):
    cc=mid+along*((k-1.5)*.60);poly=Polygon([cc+across*a+along*b for a,b in [(-length/2,-.16),(length/2,-.16),(length/2,.16),(-length/2,.16)]]).intersection(p)
    stripes.append(poly)
   shape_=unary_union(stripes);crossings.append({'geometry':shape_.__geo_interface__,'center':mid.tolist()});accepted.append(mid)
(w/'crossing_shapes.json').write_text(json.dumps(crossings));print('CROSSWALKS_PLANNED',len(crossings),flush=True)
for variant in ['existing','proposed']:
 fullRoad=roadUnion if variant=='existing' else unary_union([roadUnion,newroad])
 sidewalk=fullRoad.buffer(1.85,quad_segs=2).difference(fullRoad.buffer(.20,quad_segs=2)).difference(paths.buffer(.05)).difference(B).difference(sportsUnion).intersection(domain)
 if variant=='proposed':sidewalk=sidewalk.difference(site.buffer(.5))
 print('SIDEWALK_CLIP_READY',variant,sidewalk.area,flush=True);meshes=mesh_region('N_Neighborhood_Sidewalk',sidewalk,.18,.14,'concrete',True)
 marks=[];count=0
 for i,cross in enumerate(crossings):
  poly=shape(cross['geometry'])
  if variant=='proposed' and poly.intersects(site):continue
  marks+=mesh_region('N_Crosswalk_%03d'%i,poly,.055,.006,'paint');count+=1
 (w/(variant+'_additions.json')).write_text(json.dumps(meshes+marks));report={'variant':variant,'new_sidewalk_meshes':len(meshes),'sidewalk_area_m2':sidewalk.area,'sidewalk_overlap_with_vehicle_pavement_m2':sidewalk.intersection(fullRoad).area,'sidewalk_overlap_with_fixed_buildings_m2':sidewalk.intersection(B).area,'new_crosswalks':count,'crosswalk_status':'Illustrative proposed markings at source-geometry junction candidates; locations not surveyed or authority approved.','sports_partitions':fieldreport,'football_marking_status':'Illustrative standard-size 120-yard rectangle centered inside existing image-traced turf; not independently surveyed.','track_marking_status':'Illustrative lanes interpolated inside image-traced track, not a regulation track certification.'}
 (w/'delivery/validation'/(variant+'_layout_checks.json')).write_text(json.dumps(report,indent=2));print('VARIANT_READY',variant,len(meshes),len(marks),flush=True)
