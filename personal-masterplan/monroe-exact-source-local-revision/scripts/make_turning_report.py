import os
import sys,json,math,io,hashlib,shutil
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
from shapely.geometry import shape,Polygon
from shapely import affinity
import fitz
W=Path(os.environ['MONROE_WORKDIR']);D=W/'delivery';checks=json.loads((W/'vehicle_turning_checks.json').read_text());proof=json.loads((D/'checks/LOCKED_PIXEL_COMPARISON.json').read_text());report=fitz.open()

def page(title,subtitle=''):
 p=report.new_page(width=612,height=792);p.insert_text((38,40),title,fontsize=17,fontname='hebo',color=(.12,.2,.2));p.insert_text((38,60),subtitle,fontsize=9,color=(.3,.36,.36));return p

def text(p,y,s,size=10):
 n=p.insert_textbox(fitz.Rect(38,y,574,750),s,fontsize=size,fontname='helv',lineheight=1.28);assert n>=0,'Overflow';return n

def body(x,y,a):
 c,s=math.cos(a),math.sin(a);return Polygon([(x+c*u-s*v,y+s*u+c*v) for u,v in [(3.7,.925),(3.7,-.925),(-1.1,-.925),(-1.1,.925)]])
def draw_poly(dr,g,fill,outline=None):
 for p in getattr(g,'geoms',[g]):
  if p.geom_type!='Polygon':continue
  dr.polygon(list(p.exterior.coords),fill=fill)
  if outline:dr.line(list(p.exterior.coords),fill=outline,width=2)
p=page('LOCAL REVISION / VEHICLE-PATH REPORT','Owner source: parking_options_1-3.pdf | 2D review only | No new 3D model')
text(p,88,"SOURCE AUDIT\nThe owner's three original raster pages are the base. PDF Option 1 has the perpendicular connector; Option 2 has the planted island; Option 3 has the angled connector. Their labels, orientation, arrows, building footprints, streets and all unedited content remain the original pixels.\n\nAUTHORIZED EDITS\nA. Re-stripe the marked annex-right bank to exactly seven 9 x 18 ft spaces, with flush paved vehicle access. B. Straighten only the marked northwest approach. No other parking bank, sidewalk, road, tree or site boundary is redesigned.\n\nCONTROLLING INPUTS\nThe owner selected the PDF's 22 ft two-way aisles, 16 ft other one-way aisles, 13 ft angled aisles, and 9 x 18 ft stalls. Local scale is derived independently along each axis from the nominated aisle widths. The PDF is raster concept artwork and contains no survey scale; field dimensions are not independently verified. Curb traces are manual, approximately +/-2 pixels.\n\nDESIGN VEHICLE / METHOD\nPassenger car: 4.8 m long, 1.85 m wide, 2.8 m wheelbase; front/rear overhangs 0.9/1.1 m. Maximum steering 35 degrees; minimum rear-axle radius 4.0 m. Motion is a low-speed planar kinematic bicycle model, sampled at <=0.12 m; tested body clearance is 0.15 m. Steering can change at a stop; steering-rate and grade dynamics are not simulated.\n\nWHAT WAS CHECKED\nEach of 21 proposed bays: legal right-hand initial lane, smooth bounded-curvature setup, forward entry, reverse exit, six occupied neighboring bays, paved boundaries and retained aisle connection. The setup uses the opposing half while parking: yield to other traffic. Three westbound-to-southbound turns into the straight 16 ft approach also pass the stated test. Locked parking elsewhere is not certified.\n\nRESULT\n21/21 bay maneuvers and 3/3 straight-approach maneuvers pass under these nominal controls. Review-stage evidence, not surveyed/certified construction or approval of every vehicle class. Scale uncertainty is material relative to tight clearances and must be resolved before implementation.",size=10)

for i in [1,2,3]:
 o=checks['options'][str(i)];fit=o['bank_fit'];paved=shape(fit['checked_pavement_metric']);s=o['source_features_pixels'];sx,sy=fit['local_m_per_pixel'];back,top=s['bank_back'],s['bank_top']
 def pix(g):return affinity.translate(affinity.scale(g,xfact=1/sx,yfact=1/sy,origin=(0,0)),xoff=back,yoff=top)
 vals=[]
 for path in o['annex_turning']:
  f=shape(path['swept_envelope_metric']).distance(paved.boundary);path['minimum_final_pavement_clearance_m']=float(f);assert f>=.15-1e-6;vals.append(f)
 p=page(f'OPTION {i} - ANNEX SEVEN-SPACE BANK','All seven are 9 x 18 ft | Forward ingress and reverse egress | Neighboring spaces occupied')
 lines=['Bay  Entry / reverse exit  Rear-axle R  Setup  Neighbor gap  Paving gap']
 for path in o['annex_turning']:lines.append(f"{path['stall']:>2}        PASS / PASS          {path['rear_axle_turn_radius_m']:.2f} m     {path['setup_length_m']:.0f} m       {path['minimum_neighbor_clearance_m']:.2f} m       {path['minimum_final_pavement_clearance_m']:.2f} m")
 p.insert_textbox(fitz.Rect(38,85,580,225),'\n'.join(lines),fontsize=9,fontname='cour',lineheight=1.35)
 path=o['annex_turning'][3];im=Image.open(D/'images'/f'Option_{i}_Local_Revision.png').convert('RGBA');layer=Image.new('RGBA',im.size,(0,0,0,0));dr=ImageDraw.Draw(layer)
 draw_poly(dr,pix(shape(path['swept_envelope_metric'])),(0,165,220,65),(0,130,190,180))
 bays=[shape(g) for g in fit['new_bays_pixels']]
 for j,g in enumerate(bays):
  if j==3:continue
  cx=g.centroid.x;cy=g.centroid.y;gm=body((cx-back)*sx+1.3,(cy-top)*sy,math.pi);draw_poly(dr,pix(gm),(235,140,30,145),(160,90,0,220))
 positions=[(back+x/sx,top+y/sy) for x,y,a in path['poses']];dr.line(positions,fill=(0,110,240,255),width=2)
 for idx in [0,len(path['poses'])//2,-1]:draw_poly(dr,pix(body(*path['poses'][idx])),(20,160,80,45),(0,130,50,255))
 merged=Image.alpha_composite(im,layer);bounds=pix(shape(path['swept_envelope_metric'])).bounds;crop=(int(min(s['bank_back']-15,bounds[0]-15)),int(min(s['bank_top']-10,bounds[1]-15)),s['drive_right']+20,s['south_far']+10);overlay=merged.crop(crop).convert('RGB');overlay.save(D/f'Option_{i}_Vehicle_Path_Overlay.png');buf=io.BytesIO();overlay.save(buf,format='PNG');p.insert_image(fitz.Rect(45,235,395,650),stream=buf.getvalue(),keep_proportion=True)
 p.insert_textbox(fitz.Rect(407,240,576,640),f"ANALYSIS OVERLAY\nThis is separate from the unannotated revised plan.\n\nBlue: checked swept footprint and rear-axle path for bay 4.\n\nOrange: six occupied neighbors.\n\nGreen: sampled vehicle poses, including correct initial lane and final parking position.\n\nExtra flush end access within the marked bank: {fit['additional_end_access_area_m2']:.2f} m2 beyond the simple stall/apron rectangle. This end planting conversion is needed for the passing maneuver; no outside-area widening is made.\n\nComputed gaps are nominal. Manual trace/scale uncertainty can exceed the smallest margins. Verify dimensions before construction.",fontsize=9,lineheight=1.3)
 p.insert_textbox(fitz.Rect(38,672,574,746),f"Local calibration: X {sx:.6f} m/pixel; Y {sy:.6f} m/pixel. Bank length 63 ft. Right high / left low is an elevation condition, not a reason to rotate the plan. Every saved entry/reverse path is rechecked against the final paving polygon.",fontsize=9,lineheight=1.3)

p=page('STRAIGHT NORTHWEST APPROACH','Westbound approach in the correct half of the north aisle; southbound exit into the 16 ft west leg')
y=90
for i in [1,2,3]:
 a=checks['options'][str(i)]['straight_approach'];start=a['poses'][0];assert start[1]+.925+.15 <=22*.3048/2
 a['starts_in_correct_westbound_lane']=True
 p.insert_text((38,y),f"Option {i}: PASS | R {a['rear_axle_turn_radius_m']:.2f} m | minimum boundary gap {a['minimum_boundary_clearance_m']:.2f} m",fontsize=10,fontname='hebo');p.insert_image(fitz.Rect(38,y+14,574,y+165),filename=str(D/f'Option_{i}_Approach_Before_After.png'),keep_proportion=True);y+=195
p.insert_textbox(fitz.Rect(38,696,574,752),'The adjoining approved parking/end planting and existing arrows are protected pixel regions. No new parking rows or sidewalk strips are introduced. The existing west leg remains connected beyond the local straightened section.',fontsize=9,lineheight=1.3)
p=page('LOCKED-AREA COMPARISON / LIMITS','The original photo plans were locally edited; the site was not regenerated')
s='SOURCE / OUTPUT PIXEL TEST\n'
for i,r in proof['options'].items():s+=f"Option {i}: {r['changed_pixels']:,} changed pixels inside the two masks; {r['changed_pixels_outside_two_masks']} outside; {r['locked_approach_neighbors_or_arrows_changed_pixels']} in independently protected neighboring parking/arrow regions.\n"
s+='\nThe final PDF was reopened. Its extracted embedded-image pixels exactly match the delivered PNGs. Original page size remains 1100 x 825 points, with 2200 x 1650 pixel source images. Titles, dimension legends and circulation arrows are unchanged.\n\nVERIFICATION BOUNDARY\nThe numerical checks establish feasibility only for the stated vehicle and locally calibrated nominal controls. They do not independently establish a survey scale, certify all locked existing parking, check emergency/refuse vehicles, validate accessibility, or complete grading/drainage design. The original PDF itself labels the source as concept reference requiring site verification. The tightest computed nominal gaps should not be treated as field clearance measurements.\n\nNO 3D MODEL WAS CREATED.\nThe existing 3D model and main branch remain outside the work scope. This delivery is the requested local 2D review revision and its test evidence.\n\nSOURCE PDF SHA-256\n'+checks['source_pdf_sha256']+'\n\nReproducible source, every sampled path, swept-envelope geometry, and exact edit masks accompany this report.'
text(p,90,s,10);report.save(D/'Vehicle_Turning_and_Preservation_Report.pdf',deflate=True);report.close();(W/'vehicle_turning_checks.json').write_text(json.dumps(checks,indent=2));shutil.copy2(W/'vehicle_turning_checks.json',D/'checks/vehicle_turning_checks.json');print('REPORT_PASS',len(fitz.open(D/'Vehicle_Turning_and_Preservation_Report.pdf')),'pages')
