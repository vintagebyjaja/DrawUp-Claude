from geometry_support import *
from shapely import affinity
import hashlib
FT=.3048;STALL_W=9*FT;STALL_L=18*FT;LANE=24*FT;ONE=11*FT;AISLE=13*FT;WEST=14*FT;WALK=5*FT
CLEAR=BUILDINGS.buffer(.25).union(PROTECTED)
# Fixed buildings and public roads are inputs, never design variables.
def rounded(points,r):
 p=Polygon(points);return p.buffer(-r,join_style='round').buffer(r,join_style='round').exterior
# Align the east campus edge to the existing curved Finch curb, not a new straight public street.
finch=geom(R['F_road_local_157']);curbpts=[]
for v in np.arange(26,108.01,.5):
 cross=finch.intersection(LineString([(-310,v),(-230,v)]));curbpts.append((cross.bounds[0],float(v)))
curbline=LineString(curbpts);eastline=curbline.offset_curve(1.9+.4+STALL_L+LANE/2);eastparkingline=curbline.offset_curve(1.9+.4+STALL_L/2)
def east_at(v):
 g=eastline.intersection(LineString([(-310,v),(-250,v)]));return (g.x,g.y) if g.geom_type=='Point' else tuple(eastline.interpolate(eastline.project(Point(-279,v))).coords[0])
easttop=east_at(34);eastbottom=east_at(104.8)
# Rounded outer campus loop; the east leg follows Finch while its original mesh is frozen.
outerpoly=Polygon([(-406.5,30),(-292,30),easttop,*[east_at(v) for v in np.arange(36,104,2)],eastbottom,(-308,104.8),(-325,101.3),(-338,103.5),(-350,104.8),(-411.6,104.8),(-411.6,78),(-406.5,60)])
outer=LineString(outerpoly.buffer(-6,join_style='round').buffer(6,join_style='round').exterior.coords)
westsegment=outer.intersection(box(-430,36,-400,99));other=outer.difference(westsegment)
base_roads=unary_union([westsegment.buffer(WEST/2),other.buffer(LANE/2)]).difference(CLEAR)
# Revision 3: the highlighted northwest entry is straight, not an arched diversion.
straight_corner_zone=box(-417,22,-395,43)
straight_corner=unary_union([LineString([(-406.5,30-LANE/2),(-406.5,43)]).buffer(WEST/2,cap_style='flat'),LineString([(-406.5,30),(-395,30)]).buffer(LANE/2,cap_style='flat')])
base_roads=base_roads.difference(straight_corner_zone).union(straight_corner).difference(CLEAR)
# Campus-only lower connection meets the unchanged Finch sidewalk/curb boundary.
exitpoint=east_at(104.8);curbexit=finch.intersection(LineString([(-310,104.8),(-230,104.8)])).bounds[0]
entrance_end_u=max(finch.intersection(LineString([(-310,v),(-230,v)])).bounds[0] for v in np.linspace(104.8-LANE/2,104.8+LANE/2,25))+.05
portal=LineString([exitpoint,(entrance_end_u,104.8)]).buffer(LANE/2,cap_style='flat').difference(PUB).difference(BUILDINGS.buffer(.25))
ACCESS_ROI=ROI.union(portal)
central_cross=LineString([(-329.6324,59.5),east_at(59.5)]).buffer(LANE/2)
leftcenter=LineString([(-347.744,30),(-347.744,69.8),(-329.6324,69.8)]).buffer(LANE/2)
rightaisle=LineString([(-329.6324,30),(-329.6324,73.6)]).buffer(AISLE/2)
leftpad=box(-344.0864,40,-338.6,58);rightpad=box(-337.1,40,-331.6136,58);median=box(-338.6,40,-337.1,58)
LZ=height(-341.3432,55)+.05;RZ=height(-334.3568,55)+.05
print('SPLIT_LEVELS',LZ,RZ,'difference',RZ-LZ,flush=True)
if RZ<=LZ:raise ValueError('Existing terrain does not support the lower-left reference')

def stripe(poly):return LineString(poly.exterior.coords).buffer(.045,cap_style='flat',join_style='mitre')
def slot_rect(cx,cy,angle=0):
 # Long axis is U, short axis V, then rotate. True 9 by 18 feet.
 return affinity.rotate(box(cx-STALL_L/2,cy-STALL_W/2,cx+STALL_L/2,cy+STALL_W/2),angle,origin=(cx,cy))
def slots_bank(u0,v0,length,orientation,name,blocked):
 out=[]
 if orientation=='horizontal':
  count=int(length/STALL_W)
  for i in range(count):
   g=slot_rect(u0+(i+.5)*STALL_W,v0,90)
   if not g.intersects(blocked):out.append((name+'_%02d'%(i+1),g))
 else:
  count=int(length/STALL_W)
  for i in range(count):
   g=slot_rect(u0,v0+(i+.5)*STALL_W)
   if not g.intersects(blocked):out.append((name+'_%02d'%(i+1),g))
 return out

def mixed_lot():
 # Approval schematic: the user's section dimensions govern. No separators between adjacent banks.
 steps=[('end',18),('angle',18),('aisle',13),('angle',18),('angle',18),('aisle',13),('angle',18),('end',18)]
 u=-327.5;v=37.;rect=box(u,v,u+134*FT,v+60*FT);slots=[];lanes=[];x=u;bank=0
 for kind,feet in steps:
  sz=feet*FT;band=box(x,v,x+sz,v+60*FT)
  if kind=='aisle':lanes.append(box(x,30,x+sz,59.5))
  else:
   bank+=1
   if kind=='end':
    start=v+(60*FT-6*STALL_W)/2
    for j in range(6):slots.append(('C_Bank_%d_Stall_%d'%(bank,j+1),slot_rect(x+sz/2,start+(j+.5)*STALL_W)))
   else:
    pitch=STALL_W*math.sqrt(2);projected=(STALL_W+STALL_L)/math.sqrt(2);occupied=projected+3*pitch;start=v+(60*FT-occupied)/2+projected/2;angle=45 if bank in [2,4] else -45
    for j in range(4):
     # Clipped corner outlines are explicitly diagrammatic; not validated 9x18 rectangular stalls.
     g=slot_rect(x+sz/2,start+j*pitch,angle).intersection(band)
     slots.append(('C_Bank_%d_Diagrammatic_Angle_%d'%(bank,j+1),g))
  x+=sz
 return rect,slots,unary_union(lanes),Polygon(),{'width_ft':134,'depth_ft':60,'spaces':len(slots),'section_ft':[18,18,13,18,18,13,18,18],'no_separators':True,'angled_stall_fit_verified':False,'reason':'Section controls as explicitly requested. Four 45-degree banks shown at four spaces each, plus two six-space end banks. Angled corner outlines are schematic: a full 9x18 rotated rectangle projects 19.09 ft rather than the specified 18 ft band. Resolve stall fit before 3D modeling.'}

def vertical_stall_rows(slots,blocked):
 # Standard 90-degree rows around the campus. Reject whole stalls rather than shrinking them.
 specs=[(-391.3,42.0,29,'horizontal','School_North_New'),(-416,22.7,68,'horizontal','North_West'),(-326,22.7,45.5,'horizontal','North_East'),(-357.0,38,28,'vertical','Main_East_Inner'),(-400,98.3,53,'horizontal','Main_Front'),(-326,66.0,33,'horizontal','Annex_North'),(-323,95.9,29.5,'horizontal','Annex_Front')]
 westline=outer.intersection(box(-430,36,-400,99))
 if westline.geom_type!='LineString':westline=max([g for g in westline.geoms if g.geom_type=='LineString'],key=lambda g:g.length)
 if westline.coords[0][1]>westline.coords[-1][1]:westline=__import__('shapely').reverse(westline)
 for side in [-1,1]:
  wl=westline.offset_curve(side*(WEST/2+STALL_L/2+.05))
  for low,high in [(39,67),(77,98)]:
   section=wl.intersection(box(-440,low,-380,high))
   if section.geom_type!='LineString':continue
   for i,dist in enumerate(np.arange(STALL_W/2,section.length-STALL_W/2,STALL_W+.06)):
    c=section.interpolate(dist);a=section.interpolate(max(0,dist-.1));b=section.interpolate(min(section.length,dist+.1));dx=b.x-a.x;dy=b.y-a.y;angle=math.degrees(math.atan2(-dx,dy));g=slot_rect(c.x,c.y,angle)
    if not g.intersects(blocked) and g.difference(ROI).area<.001:slots.append(('West_%s_%s_%s'%(side,low,i),g))
 for low,high,label in [(34,71,'Finch_North'),(79,103,'Finch_South')]:
  section=eastparkingline.intersection(box(-310,low,-250,high))
  for i,dist in enumerate(np.arange(STALL_W/2,section.length-STALL_W/2,STALL_W+.06)):
   c=section.interpolate(dist);a=section.interpolate(max(0,dist-.1));b=section.interpolate(min(section.length,dist+.1));dx=b.x-a.x;dy=b.y-a.y;angle=math.degrees(math.atan2(-dx,dy));g=slot_rect(c.x,c.y,angle)
   if not g.intersects(blocked) and g.difference(ROI).area<.001:slots.append((label+'_%02d'%i,g))
 for x,y,length,orientation,name in specs:
  found=slots_bank(x,y,length,orientation,name,blocked)
  for n,g in found:
   if g.difference(ROI).area<.001:slots.append((n,g))

all_changes={};summary={}
for option in [1,2,3]:
 print('DESIGN',option,flush=True);slots=[]
 if option in [1,3]:lot,cs,aisles,green,lot_report=mixed_lot()
 else:
  lot=box(-327.5,42.5,-327.5+134*FT,42.5+36*FT);cs=[]
  for row in range(2):
   for i in range(14):cs.append(('C_Perpendicular_Row_%d_Stall_%d'%(row+1,i+1),slot_rect(-327.5+8*FT+(i+.5)*STALL_W,42.5+(row+.5)*STALL_L,90)))
  aisles=Polygon();green=Polygon();lot_report={'width_ft':134,'depth_ft':36,'spaces':len(cs),'layout':'Back-to-back 90-degree rows, served by exterior 24-foot circulation.'}
 base=unary_union([base_roads,portal,central_cross,leftcenter,rightaisle,box(-392,33.65,-363,39.2568)]).difference(CLEAR).intersection(ROI)
 # Split-level parking flanks retain separate levels around the raised central median.
 for name,pad in [('Split_Lower_Left',leftpad),('Split_Upper_Right',rightpad)]:
  slots.extend(slots_bank(pad.centroid.x,40.65,16.5,'vertical',name,CLEAR))
 slots.extend([(n,g) for n,g in cs if not g.intersects(CLEAR)])
 vertical_stall_rows(slots,CLEAR.union(leftpad).union(rightpad).union(lot))
 # Annex right-side bank: full-size bays placed along the existing angled facade.
 annex_edge=np.array([[-298.408665603482,69.632788762652],[-295.340518648002,85.162151023960]])
 tangent=annex_edge[1]-annex_edge[0];tangent/=np.linalg.norm(tangent);normal=np.array([tangent[1],-tangent[0]])
 line_start=annex_edge[0]-tangent*.7+normal*(WALK+.12+STALL_L/2)
 angle=math.degrees(math.atan2(normal[1],normal[0]))
 for j in range(8):
  c=line_start+tangent*((j+.5)*STALL_W);g=slot_rect(c[0],c[1],angle)
  if not g.intersects(CLEAR):slots.append(('Annex_East_%02d'%(j+1),g))
 # Connector variants between main school and annex. Full-size stalls only in verified available space.
 connector_zone=box(-342.8,76,-326.0,96)
 extra_green=[];connector=Polygon();through=Polygon()
 if option==1:
  extra_green.append(box(-337.5,77,-334.1,94).buffer(-1.5,join_style='round').buffer(1.5,join_style='round'))
  through=unary_union([LineString([(-340.1,72),(-340.1,104.8)]).buffer(ONE/2),LineString([(-331.5,72),(-331.5,104.8)]).buffer(ONE/2)])
 elif option==2:
  # Revised reference: one complete upper bank, split lower bank, entry from the south.
  uc=-334.4;through=unary_union([LineString([(uc,85),(uc,104.8)]).buffer(ONE/2),LineString([(-342.2,85),(-326.6,85)]).buffer(LANE/2,cap_style='flat')])
  north_columns=[uc+(i-2)*STALL_W for i in range(5)]
  south_columns=[uc-ONE/2-.12-1.5*STALL_W,uc-ONE/2-.12-.5*STALL_W,uc+ONE/2+.12+.5*STALL_W,uc+ONE/2+.12+1.5*STALL_W]
  for row,columns,cy in [(0,north_columns,85-LANE/2-STALL_L/2),(1,south_columns,85+LANE/2+STALL_L/2)]:
   for col,cx in enumerate(columns):
    g=slot_rect(cx,cy,90)
    if not g.intersects(CLEAR):slots.append(('Connector_90_Row_%d_Stall_%d'%(row+1,col+1),g))

 else:
  # One-way 11-foot connector with angled stalls, distinct from Option 1's planted median.
  uc=-334.4;through=LineString([(uc,73),(uc,104.8)]).buffer(ONE/2)
  for side in [-1,1]:
   cx=uc+side*(ONE/2+(STALL_W+STALL_L)/math.sqrt(2)/2+.12)
   for j in range(5):
    g=slot_rect(cx,78.5+j*STALL_W*math.sqrt(2),45 if side<0 else -45)
    if not g.intersects(CLEAR):slots.append(('Connector_45_%s_%s'%(side,j+1),g))
 connector=through.difference(CLEAR).intersection(ROI)
 if option==2:connector=connector.union(box(-342.2,75.4,-326.6,96)).difference(CLEAR).intersection(ROI)
 if option==3:connector=connector.union(box(-342.2,75.4,-326.6,98)).difference(CLEAR).intersection(ROI)
 connector=connector.buffer(.6,join_style='mitre').buffer(-1.4,join_style='round').buffer(1.4,join_style='round').difference(CLEAR).intersection(ROI)
 # Reject overlapping/blocked bays. This preserves real stall dimensions.
 base=base.union(aisles).union(through).difference(unary_union(extra_green))
 if option==2:base=base.union(box(-329.6324,42.5-LANE,-279,42.5)).difference(CLEAR).intersection(ROI)
 # Rounded internal junction flares; keep the dimensional travel strips and fixed buildings intact.
 base=base.buffer(2.5,join_style='round').buffer(-2.5,join_style='round').difference(CLEAR).intersection(ROI).difference(unary_union(extra_green))
 base=base.difference(straight_corner_zone).union(straight_corner).difference(CLEAR).intersection(ROI)
 accepted=[];used=Polygon();rejected=[];aprons=[]
 for name,g in slots:
  if g.intersection(CLEAR).area>.001 or g.difference(ROI).area>.001 or g.intersection(used).area>.015 or g.intersection(base).area>.015:rejected.append(name);continue
  from shapely.ops import nearest_points
  near,drive=nearest_points(g,base);distance=near.distance(drive)
  if distance>(9.0 if name.startswith('Annex_East_') else 3.0):rejected.append(name+' (no direct aisle access)');continue
  bridge=g.union(affinity.translate(g,xoff=drive.x-near.x,yoff=drive.y-near.y)).convex_hull
  if bridge.intersection(CLEAR).area>.001:rejected.append(name+' (access blocked)');continue
  aprons.append(bridge);accepted.append((name,g));used=used.union(g)
 slots=accepted;stall_geom=unary_union([g for _,g in slots]);extra=unary_union(extra_green);median_green=median.union(extra).union(green)
 parking=unary_union([lot,leftpad,rightpad,unary_union(aprons),stall_geom.buffer(.12,join_style='mitre')]).difference(median_green).difference(CLEAR).intersection(ROI)
 vehicle=unary_union([base,parking,connector]).difference(extra).difference(CLEAR).intersection(ROI)
 # The detailed lot's actual two 13 ft aisles are included in vehicle geometry.
 vehicle=vehicle.union(aisles).difference(median_green).intersection(ROI)
 # Round the pavement's re-entrant corners; no fillet may remove a marked stall or invade a fixed building.
 vehicle=vehicle.buffer(1.5,join_style='round').buffer(-1.5,join_style='round').union(stall_geom).difference(extra).difference(CLEAR).intersection(ROI)
 # Keep this entrance exactly straight after general fillet processing.
 vehicle=vehicle.difference(straight_corner_zone).union(straight_corner).union(parking.intersection(straight_corner_zone)).difference(CLEAR).intersection(ROI)
 annex_bays=[g for name,g in slots if name.startswith('Annex_East_')]
 if annex_bays:
  bay_bounds=unary_union(annex_bays).bounds
  drive_edge=LineString([east_at(v) for v in np.linspace(max(34,bay_bounds[1]+.5),min(102,bay_bounds[3]-.5),25)]).buffer(.4)
  annex_court=unary_union(annex_bays+[drive_edge]).convex_hull.buffer(.25,join_style='round')
  vehicle=vehicle.union(annex_court.difference(BUILDINGS.buffer(WALK+.12)))
 vehicle=vehicle.union(portal)  # The apron reaches the actual Finch road edge, crossing only the site-side footway.
 # Behind-bay sidewalks follow continuous rear edges, not the pull-in mouths or jagged apron outlines.
 rear_groups={}
 for name,g in slots:
  if name.startswith(('C_','Connector_','Split_')):continue
  co=list(g.exterior.coords)[:-1];edges=[(co[k],co[(k+1)%len(co)]) for k in range(len(co))]
  a,b=max(edges,key=lambda e:base.distance(Point((e[0][0]+e[1][0])/2,(e[0][1]+e[1][1])/2)))
  mid=np.array([(a[0]+b[0])/2,(a[1]+b[1])/2]);direction=mid-np.array([g.centroid.x,g.centroid.y]);direction/=max(np.linalg.norm(direction),1e-9)
  strip=Polygon([a,b,tuple(np.array(b)+direction*WALK),tuple(np.array(a)+direction*WALK)])
  group=name.rsplit('_',1)[0];rear_groups.setdefault(group,[]).append(strip)
 rear_walks=unary_union([unary_union(gs).convex_hull for gs in rear_groups.values()])
 roadwalk=base.buffer(WALK,join_style='round').difference(base).difference(parking.buffer(.4))
 facade_walk=BUILDINGS.buffer(WALK+.15).difference(BUILDINGS.buffer(.15))
 walks=unary_union([rear_walks,roadwalk,facade_walk]).difference(vehicle.buffer(.05)).difference(BUILDINGS.buffer(.12)).intersection(ROI).difference(median_green.buffer(.08))
 # Remove the highlighted connector/island sidewalks; those strips become flush pavement.
 remove_zone=box(-345.3,73.5,-324.5,101)
 removed=walks.intersection(remove_zone);walks=walks.difference(remove_zone)
 vehicle=vehicle.union(removed).difference(BUILDINGS.buffer(.12)).difference(extra).union(portal)
 # Clean little detached sidewalk wedges and retain coherent rear paths.
 walks=unary_union([p for p in parts(walks) if p.area>=4.0]).difference(vehicle.buffer(.05))
 # Keep the highlighted approach straight in both paving and its adjacent walk edge.
 straight_walk=box(-406.5-WEST/2-WALK,30-LANE/2,-406.5-WEST/2-.05,43)
 walks=walks.difference(straight_corner_zone).union(straight_walk.union(rear_walks.intersection(straight_corner_zone)).difference(vehicle.buffer(.05)).difference(BUILDINGS.buffer(.12)).intersection(ROI))
 # Context footway along Finch is retained except for the proposed flush driveway crossing.
 public_footway=curbline.buffer(1.9,single_sided=True).difference(PUB).difference(portal)
 crosswalks=[]
 for k,y in enumerate(np.arange(104.8-LANE/2+.25,104.8+LANE/2-.2,.58)):
  g=box(curbexit-1.8,y,curbexit-.15,y+.26).intersection(portal)
  if not g.is_empty:crosswalks.append(g)
 # Painted crossings over campus pavement, replacing raised sidewalk links.
 for k,y in enumerate(np.arange(100.0,103.1,.55)):
  g=box(-337.3,y,-331.7,y+.22).intersection(vehicle)
  if not g.is_empty:crosswalks.append(g)
 # Layout-only delivery for user approval. Do not create new 3D models or grading meshes.
 if __import__('os').environ.get('MONROE_LAYOUT_ONLY')=='1':
  report={'revision':3,'annex_right_side_stalls':sum(n.startswith('Annex_East_') for n,g in slots),'northwest_straight_approach':mapping(straight_corner),'northwest_correction_zone':mapping(straight_corner_zone),'grade_interpretation':{'right_is_higher':True,'left_is_lower':True,'parking_arrangement_changed_for_slope':False},'option':option,'crosswalk_footprint':mapping(unary_union(crosswalks)),'retained_public_footway':mapping(public_footway),'entrance_apron':mapping(portal),'rear_sidewalks':mapping(rear_walks.intersection(walks)),'nominal_junction_fillet_m':2.5,'option_2_connector':'Full upper row, split lower row, south access; 24-foot maneuvering aisle' if option==2 else None,'stage':'2D approval only; not a new 3D model','central_lot':lot_report,'central_accepted_stalls':sum(n.startswith('C_') for n,g in slots),'central_angled_fit_verified':option==2,'total_stalls':len(slots),'connector_stalls':sum(n.startswith('Connector_') for n,g in slots),'east_stalls':sum(n.startswith('Finch_') for n,g in slots),'vehicle_footprint':mapping(vehicle),'sidewalk_footprint':mapping(walks),'median_footprint':mapping(median_green),'connector_court':mapping(connector),'stalls':[{'name':n,'polygon':mapping(g),'dimensions_ft':[9,18],'full_rectangular_size_verified':'Diagrammatic_Angle' not in n} for n,g in slots],'rejected_full_stalls':rejected,'changed_region_uv':mapping(ACCESS_ROI),'building_overlap_m2':vehicle.intersection(BUILDINGS).area,'public_road_overlap_m2':vehicle.intersection(PUB).area,'sidewalk_vehicle_overlap_m2':walks.intersection(vehicle).area,'widths_ft':{'typical_stall':[9,18],'main_corridors':24,'far_left':14,'parking_aisles':13,'one_way_connector':11},'grading_note':'Future modeling: flatter pads, smoother cut/fill ramps, raised lawn and lower-left/higher-right terraces; no grading model created at approval stage.'}
  assert report['building_overlap_m2']<.001 and report['public_road_overlap_m2']<.001 and report['sidewalk_vehicle_overlap_m2']<.001
  if option in [2,3]:
   union_stalls=unary_union([g for n,g in slots if n.startswith('Connector_')]);assert union_stalls.difference(vehicle).area<.001
  (W/('approval_option_%d.json'%option)).write_text(json.dumps(report,indent=2));summary[option]={k:v for k,v in report.items() if k not in ['vehicle_footprint','sidewalk_footprint','median_footprint','connector_court','stalls','changed_region_uv']};print('APPROVAL_LAYOUT',option,'total',len(slots),'central',report['central_accepted_stalls'],'connector',report['connector_stalls'],'east',report['east_stalls'],flush=True);continue
 lower_fun=lambda u,v:LZ+.0075*(v-55)
 upper_fun=lambda u,v:RZ+.0075*(v-55)
 centerZ=height(lot.centroid.x,lot.centroid.y)+.05
 lot_fun=lambda u,v:centerZ+.025*(u-lot.centroid.x)+.01*(v-lot.centroid.y)
 @__import__('functools').lru_cache(maxsize=200000)
 def pavement_z(u,v):
  p=Point(u,v);candidates=[(leftpad.distance(p),lower_fun(u,v)),(rightpad.distance(p),upper_fun(u,v)),(lot.distance(p),lot_fun(u,v))];dist,z=min(candidates,key=lambda a:a[0]);w=max(0.,1-dist/7.5);w=w*w*(3-2*w);return (height(u,v)+.05)*(1-w)+z*w
 def walk_z(u,v):return max(height(u,v)+.17,pavement_z(u,v)+.15)
 out=[]
 # Paving is a single union, with zero duplicate intersection patches. Separate stalls/paint stay editable.
 for i,g in enumerate(parts(vehicle)):out.append(solid('OPT%d_Vehicle_Pavement_%02d'%(option,i),g,pavement_z,.24,'asphalt'))
 for i,g in enumerate(parts(walks)):out.append(solid('OPT%d_Campus_Sidewalk_%02d'%(option,i),g,walk_z,.15,'concrete'))
 grass=ROI.difference(vehicle.union(walks)).difference(median_green)
 for i,g in enumerate(parts(grass)):out.append(solid('OPT%d_Retained_Grass_%02d'%(option,i),g,lambda u,v:height(u,v)+.012,.15,'grass'))
 # Tall median explicitly expresses the verified lower-left / upper-right parking distinction.
 for i,g in enumerate(parts(median_green)):
  fn=(lambda u,v:upper_fun(u,v)+.18) if g.intersects(median) else (lambda u,v:height(u,v)+.18)
  r=solid('OPT%d_Raised_Planter_%02d'%(option,i),g,fn,max(.35,RZ-LZ+.4),'grass');r['side_material']='retaining';out.append(r)
 curb=vehicle.buffer(.16).difference(vehicle).difference(walks).difference(median_green).intersection(ROI)
 for i,g in enumerate(parts(curb)):out.append(solid('OPT%d_Curbs_%02d'%(option,i),g,lambda u,v:max(height(u,v)+.14,pavement_z(u,v)+.14),.3,'concrete'))
 for idx,(name,g) in enumerate(slots):
  paint=stripe(g).intersection(vehicle)
  if paint.area>.005:
   rec=solid('OPT%d_Parking_%03d_%s'%(option,idx+1,name),paint,lambda u,v:pavement_z(u,v)+.014,.007,'paint');rec['stall_dimensions_ft']=[9,18];rec['stall_polygon']=mapping(g);out.append(rec)
 # Direction arrows are actual editable paint, particularly for the one-way third option.
 if option==3:
  for k,(x,y,angle) in enumerate([(-415,68,-90),(-383,30,0),(-302,30,0),(-279,71,90),(-310,104.8,180),(-380,104.8,180),(-334.4,97,-90),(-311,47,-90),(-295,47,90)]):
   a=Polygon([(-1.35,-.12),(.35,-.12),(.35,-.5),(1.2,0),(.35,.5),(.35,.12),(-1.35,.12)]);a=affinity.translate(affinity.rotate(a,angle,origin=(0,0)),xoff=x,yoff=y).intersection(vehicle)
   if not a.is_empty:out.append(solid('OPT3_One_Way_Arrow_%02d'%k,a,lambda u,v:pavement_z(u,v)+.018,.007,'paint'))
 # Crosswalks at campus pedestrian crossings, clipped to paving; no raised sidewalk across intersections.
 for k,(x,y) in enumerate([(-350.1,74),(-334.4,99)]):
  for stripeid in range(6):
   g=box(x-LANE/2+.25,y-1.2+stripeid*.4,x+LANE/2-.25,y-1.2+stripeid*.4+.18).intersection(vehicle)
   if not g.is_empty:out.append(solid('OPT%d_Crosswalk_%d_%d'%(option,k,stripeid),g,lambda u,v:pavement_z(u,v)+.02,.007,'paint'))
 # Field samples provide honest grading evidence, not a civil-design certification.
 zs=[{'u':u,'v':v,'source_ground_m':height(u,v),'pavement_m':pavement_z(u,v)} for u,v in [(-341.3,55),(-334.3,55),(-415,65),(-350,30),(-279,90)]]
 report={'option':option,'building_overlap_m2':vehicle.intersection(BUILDINGS).area,'public_road_or_sidewalk_overlap_m2':vehicle.intersection(PROTECTED).area,'walk_vehicle_overlap_m2':walks.intersection(vehicle).area,'stalls':len(slots),'rejected_full_stalls':rejected,'central_lot':lot_report,'split_level_lower_m':LZ,'split_level_upper_m':RZ,'split_level_difference_m':RZ-LZ,'widths_ft':{'typical_stall':[9,18],'main':24,'far_left':14,'parking_aisle':13,'one_way_connector':11 if option==3 else None},'sample_grades':zs,'changed_region_uv':mapping(ROI),'vehicle_footprint':mapping(vehicle),'median_footprint':mapping(median_green)}
 assert report['building_overlap_m2']<.001 and report['public_road_or_sidewalk_overlap_m2']<.001 and report['walk_vehicle_overlap_m2']<.001
 (W/('option_%d_geometry.json'%option)).write_text(json.dumps(out));(W/('option_%d_plan.json'%option)).write_text(json.dumps(report,indent=2));summary[option]={k:v for k,v in report.items() if k not in ['changed_region_uv','vehicle_footprint','median_footprint']};print('DESIGNED',option,'meshes',len(out),'stalls',len(slots),flush=True)
(W/'options_summary.json').write_text(json.dumps(summary,indent=2))
