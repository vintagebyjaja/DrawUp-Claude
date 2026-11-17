from geometry_support import *
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.path import Path as MPath
from matplotlib.patches import PathPatch
from matplotlib.backends.backend_pdf import PdfPages
from shapely.geometry.polygon import orient
import shutil,hashlib,zipfile
FT=.3048
D=W/'approval_r3_delivery';D.mkdir(exist_ok=True);(D/'source').mkdir(exist_ok=True)
colors={'grass':'#b9c9a4','road':'#444f53','walk':'#f0ede3','building':'#cf8b3d','median':'#8ca46b','street':'#a4a8a9','line':'#ffffff'}
labels={1:'Planted connector island',2:'Perpendicular connector parking',3:'Angled connector parking'}
reports={i:json.loads((W/f'approval_option_{i}.json').read_text()) for i in [1,2,3]}

def fill(ax,g,color,edge=None,lw=.4,z=2):
 for p in parts(g):
  p=orient(p,sign=1);verts=[];codes=[]
  for ring in [p.exterior,*p.interiors]:
   co=list(ring.coords);verts+=co;codes += [MPath.MOVETO]+[MPath.LINETO]*(len(co)-2)+[MPath.CLOSEPOLY]
  ax.add_patch(PathPatch(MPath(verts,codes),facecolor=color,edgecolor=edge or color,linewidth=lw,zorder=z))

def base(ax,i,detail=None):
 r=reports[i];ax.set_facecolor('#edf1e8');fill(ax,ROI,colors['grass'],z=0);fill(ax,PUB,colors['street'],z=1)
 vehicle=shape(r['vehicle_footprint']);walk=shape(r['sidewalk_footprint']);med=shape(r['median_footprint'])
 fill(ax,shape(r['retained_public_footway']),colors['walk'],z=1.5);fill(ax,vehicle,colors['road'],z=2);fill(ax,walk,colors['walk'],z=3);fill(ax,med,colors['median'],edge='#74855f',z=3)
 for g in B.values():fill(ax,g,colors['building'],edge='#895e2c',lw=.65,z=4)
 fill(ax,shape(r['crosswalk_footprint']),'#ffffff',z=7)
 for s in r['stalls']:
  p=shape(s['polygon']);xy=list(p.exterior.coords);x=[v[0] for v in xy];y=[v[1] for v in xy];ax.plot(x,y,color='white',lw=.55,ls='--' if not s['full_rectangular_size_verified'] else '-',zorder=5)
 if detail is None:
  for n,title in [('building_2356','MONROE SCHOOL'),('building_2099','EXISTING BUILDING'),('building_2772','ANNEX'),('building_2603','APARTMENTS — UNCHANGED')]:
   p=B[n].representative_point();ax.text(p.x,p.y,title,ha='center',va='center',fontsize=7,color='#3e301d',weight='bold',zorder=6,rotation=90 if n=='building_2099' else 0)
  ax.text(-251,80,'FINCH — UNCHANGED',rotation=84,color='#343a3b',fontsize=8,ha='center',zorder=6)
  ax.text(-351,157,'50TH — UNCHANGED',rotation=9,color='#343a3b',fontsize=8,ha='center',zorder=6)
  ax.annotate('14′ campus drive\nStraight upper approach',xy=(-410.6,81),xytext=(-447,98),fontsize=8,arrowprops={'arrowstyle':'-','color':'#4e5e47'},color='#34452f')
  ax.annotate(f"Finch-side banks: {r['east_stalls']} spaces\nEntry meets Finch; painted crossing",xy=(-276,50),xytext=(-298,15),fontsize=8,ha='center',arrowprops={'arrowstyle':'-','color':'#4e5e47'},color='#34452f',bbox={'fc':'white','ec':'none','alpha':.9})
  ax.annotate('Right higher / left lower\nSlope does not change the parking layout',xy=(-334.4,85),xytext=(-367,14),fontsize=8,ha='center',arrowprops={'arrowstyle':'-','color':'#4e5e47'},color='#34452f',bbox={'fc':'white','ec':'none','alpha':.9})
  ax.set_xlim(-450,-238);ax.set_ylim(166,4)
 else:ax.set_xlim(detail[0],detail[1]);ax.set_ylim(detail[3],detail[2])
 if detail is not None and detail[0]<-334 and detail[1]>-334 and detail[2]<85<detail[3]:
  ax.annotate('',xy=(-340.7,85),xytext=(-328.1,85),arrowprops={'arrowstyle':'->','color':'#62dad0','lw':2},zorder=9)
  ax.text(-334.4,83.8,'GRADE: RIGHT HIGH → LEFT LOW',ha='center',fontsize=7.8,color='#62dad0',weight='bold',zorder=9)
 ax.set_aspect('equal');ax.set_xticks([]);ax.set_yticks([])
 for spine in ax.spines.values():spine.set_visible(False)
 return r

def page(i):
 fig=plt.figure(figsize=(14,11));ax=fig.add_axes([.035,.16,.93,.74]);r=base(ax,i)
 fig.text(.05,.956,f'OPTION {i}  |  {labels[i]}  |  REVISION 3',fontsize=18,weight='bold',color='#273b37')
 fig.text(.05,.923,'REVISED PARKING LAYOUT APPROVAL • 2D schematic from fixed model footprints • Not a new 3D model',fontsize=10,color='#53655e')
 fig.text(.05,.122,f"{r['total_stalls']} indicative spaces overall  |  Central lot: {r['central_accepted_stalls']} shown  |  Connector: {r['connector_stalls']}  |  Finch side: {r['east_stalls']}",fontsize=12,weight='bold',color='#273b37')
 note='Mixed lot: exact 134′ × 60′ envelope; 18′ / 18′ / 13′ / 18′ / 18′ / 13′ / 18′ / 18′ section. Adjacent banks touch; no separators.' if i!=2 else 'Central parking: two perpendicular rows; full 9′ × 18′ stalls. Connector follows the reference: full rear bank, split entry bank; 24′ maneuvering aisle.'
 fig.text(.05,.095,note,fontsize=9,color='#354c42')
 fig.text(.05,.074,'Typical full-size stalls: 9′ × 18′. Main drives: 24′. West drive: 14′. Angled parking aisles: 13′. One-way throat: 11′.',fontsize=9,color='#354c42')
 fig.text(.05,.052,'Added 7 annex-right bays; highlighted upper-left approach is straight. Layout stays as instructed; the hill changes elevations only.',fontsize=9,color='#354c42')
 fit='Dashed central angled outlines are schematic: 18′ bank bands conflict with the 19.1′ projection of a full 9′ × 18′ rectangle at 45°. Stall fit remains unresolved.' if i!=2 else 'Parking counts are for layout comparison. Vehicle swept paths, accessible bays and final smooth grading remain design checks before model completion.'
 fig.text(.05,.028,fit,fontsize=8.2,color='#87502b')
 return fig

with PdfPages(D/'Monroe_Parking_Layouts_Revision_3_For_Approval.pdf') as pdf:
 for i in [1,2,3]:
  f=page(i);f.savefig(D/f'Option_{i}_Parking_Layout.png',dpi=160);pdf.savefig(f);plt.close(f)
 # The dimension section is shown as contiguous bands, not separated pictorial islands.
 fig,axs=plt.subplots(2,1,figsize=(14,10),gridspec_kw={'height_ratios':[3,1]});ax=axs[0];base(ax,1,(-331,-283,30,60));ax.set_title('CENTRAL MIXED LOT — SECTION DIMENSIONS CONTROL',fontsize=16,weight='bold',pad=18)
 u=-327.5;v=37;end=u+134*FT;ax.annotate('',xy=(u,34.4),xytext=(end,34.4),arrowprops={'arrowstyle':'<->','color':'#1c6f8c'});ax.text((u+end)/2,33.6,'134′–0″ overall',ha='center',color='#1c6f8c',weight='bold',fontsize=12)
 ax.annotate('',xy=(end+1.2,v),xytext=(end+1.2,v+60*FT),arrowprops={'arrowstyle':'<->','color':'#1c6f8c'});ax.text(end+2,v+30*FT,'60′–0″',rotation=90,va='center',color='#1c6f8c',weight='bold')
 axs[1].set_xlim(0,134);axs[1].set_ylim(0,18);axs[1].axis('off');x=0
 for idx,width in enumerate([18,18,13,18,18,13,18,18]):
  aisle=idx in [2,5];axs[1].add_patch(__import__('matplotlib').patches.Rectangle((x,5),width,6,facecolor='#53666b' if aisle else '#dde5d3',edgecolor='white'));axs[1].text(x+width/2,8,f'{width}′',ha='center',va='center',weight='bold',color='white' if aisle else '#273b37');axs[1].text(x+width/2,3,'13′ aisle' if aisle else ('90° end bay' if idx in [0,7] else '45° bank'),ha='center',fontsize=9);x+=width
 fig.text(.07,.03,'No grass or added pavement strip between back-to-back banks. 28 bays shown provisionally; the angled full-size stall-fit conflict is flagged for review.',fontsize=10,color='#87502b');fig.tight_layout(rect=[0,.06,1,.98]);fig.savefig(D/'Central_Lot_Section_Review.png',dpi=150);pdf.savefig(fig);plt.close(fig)
 fig,axs=plt.subplots(1,2,figsize=(14,10));base(axs[0],3,(-347,-322,70,104));base(axs[1],3,(-292,-251,25,111));axs[0].set_title('OPTION 3 CONNECTOR\n10 full-size angled bays • No connector sidewalks',fontsize=13,weight='bold');axs[1].set_title('FINCH EDGE — ALL OPTIONS\nCurved parking banks • Finch-connected apron and crosswalk',fontsize=13,weight='bold');fig.text(.05,.035,'Connector sidewalks removed; parking opens directly onto pavement. Entry apron meets Finch with painted crossing; public road outlines stay fixed.',fontsize=10);fig.tight_layout(rect=[0,.08,1,.96]);fig.savefig(D/'Connector_and_Finch_Review.png',dpi=150);pdf.savefig(fig);plt.close(fig)
 fig,axs=plt.subplots(1,2,figsize=(14,10));base(axs[0],2,(-346,-323,72,104));base(axs[1],2,(-418,-348,14,51));axs[0].set_title('OPTION 2 — REVISED COURT\nFull rear bank • Split entry bank • Layout unchanged',fontsize=13,weight='bold');axs[1].set_title('NORTH PARKING — REAR SIDEWALK\nContinuous path behind bays • Rounded corner connections',fontsize=13,weight='bold');fig.text(.05,.035,'Additional full-size bays use available lawn. Spaces that collide with fixed buildings, turning flares or the entrance have not been forced into the plan.',fontsize=10);fig.tight_layout(rect=[0,.08,1,.96]);fig.savefig(D/'Option_2_and_Rear_Sidewalk_Review.png',dpi=150);pdf.savefig(fig);plt.close(fig)
 fig,axs=plt.subplots(1,2,figsize=(14,10));base(axs[0],3,(-304,-270,64,103));base(axs[1],3,(-419,-386,15,57));axs[0].set_title('ANNEX RIGHT SIDE — ALL THREE OPTIONS\n7 full-size bays with continuous paved access',fontsize=13,weight='bold');axs[1].set_title('HIGHLIGHTED UPPER-LEFT APPROACH\nStraight alignment replaces the curved entry',fontsize=13,weight='bold');fig.text(.05,.035,'These are layout instructions: building footprints and public streets stay fixed. Full-size bays are added in the marked grass strip; no 3D models created.',fontsize=10);fig.tight_layout(rect=[0,.08,1,.96]);fig.savefig(D/'Annex_Right_and_Straight_Approach_Review.png',dpi=160);pdf.savefig(fig);plt.close(fig)
# Readable review montage of actual vector plans, not generated imagery.
from PIL import Image,ImageDraw
canvas=Image.new('RGB',(2400,680),'white')
for i in [1,2,3]:
 im=Image.open(D/f'Option_{i}_Parking_Layout.png').convert('RGB');im.thumbnail((800,680));canvas.paste(im,((i-1)*800,0))
canvas.save(D/'Three_Options_Comparison.png')
for i in [1,2,3]:shutil.copy2(W/f'approval_option_{i}.json',D/'source'/f'approval_option_{i}.json')
for name in ['design_options.py','geometry_support.py','draw_approval.py']:shutil.copy2(W/'scripts'/name,D/'source'/name)
# Validate the delivered schematic geometry and preserve hashes of the unchanged original files.
validation={'revision':3,'stage':'2D layout approval only','three_d_model_created':False,'options':{}}
for i,r in reports.items():
 vehicle=shape(r['vehicle_footprint']);bankrect=box(-327.5,37,-327.5+134*FT,37+60*FT);greens=shape(r['median_footprint']);stalls=r['stalls'];over=[]
 for k,s in enumerate(stalls):
  p=shape(s['polygon'])
  for t in stalls[k+1:]:
   area=p.intersection(shape(t['polygon'])).area
   if area>.02:over.append([s['name'],t['name'],area])
 v={'passed':not over and r['building_overlap_m2']<.001 and r['public_road_overlap_m2']<.001 and r['sidewalk_vehicle_overlap_m2']<.001,'overlapping_stalls':over,'building_overlap_m2':r['building_overlap_m2'],'public_road_overlap_m2':r['public_road_overlap_m2'],'sidewalk_vehicle_overlap_m2':r['sidewalk_vehicle_overlap_m2'],'central_grass_separator_area_m2':greens.intersection(bankrect).area if i!=2 else None,'total_indicative_stalls':r['total_stalls'],'annex_right_stalls':r['annex_right_side_stalls'],'straight_approach_missing_pavement_m2':shape(r['northwest_straight_approach']).difference(vehicle).area,'central_angled_rectangular_fit_verified':r['central_angled_fit_verified'],'not_checked':['Vehicle swept paths','Detailed cut/fill ramp profiles','Accessible parking and pedestrian compliance'],'central_fit_limitation':r['central_lot'].get('reason'),'finch_connection_contact_m':PUB.boundary.intersection(shape(r['entrance_apron']).buffer(.000001)).length,'crosswalk_outside_pavement_m2':shape(r['crosswalk_footprint']).difference(vehicle).area,'highlighted_connector_sidewalk_m2':shape(r['sidewalk_footprint']).intersection(box(-345.3,73.5,-324.5,101)).area}
 assert v['passed'];assert v['annex_right_stalls']==7;assert v['straight_approach_missing_pavement_m2']<.001;assert v['finch_connection_contact_m']>7;assert v['crosswalk_outside_pavement_m2']<.001;assert v['highlighted_connector_sidewalk_m2']<.001;validation['options'][i]=v
inv=json.loads((W/'baseline/Monroe_Pavement_Fix/INVENTORY.json').read_text());checked=[]
for row in inv:
 if row['path'].startswith('01_Original_Road_Layout/'):
  p=W/'baseline/Monroe_Pavement_Fix'/row['path'];h=hashlib.sha256(p.read_bytes()).hexdigest();assert h==row['sha256'];checked.append({'path':row['path'],'sha256':h,'unchanged':True})
validation['unchanged_original_exports']=checked;(D/'APPROVAL_VALIDATION.json').write_text(json.dumps(validation,indent=2));print(json.dumps({i:{'count':r['total_stalls'],'central':r['central_accepted_stalls'],'connector':r['connector_stalls']} for i,r in reports.items()}),flush=True)
