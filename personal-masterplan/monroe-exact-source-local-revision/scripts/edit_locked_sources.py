"""Deterministic local raster edits authorized by the user's exact-mask requirement.
No whole-image generation. Every source pixel outside two declared edit masks is retained.
"""
import os
import sys,json,hashlib,math
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
from shapely.geometry import shape,box,Point,Polygon,mapping
from shapely import affinity
from shapely.ops import unary_union
import fitz
W=Path(os.environ['MONROE_WORKDIR']);D=W/'delivery';D.mkdir(exist_ok=True);(D/'checks').mkdir(exist_ok=True);(D/'source').mkdir(exist_ok=True);(D/'images').mkdir(exist_ok=True);checks=json.loads((W/'vehicle_turning_checks.json').read_text());assert len(checks['options'])==3 and all(o['nominal_checks_passed'] for o in checks['options'].values())

def raster(g,size):
 im=Image.new('L',size,0);dr=ImageDraw.Draw(im)
 for p in getattr(g,'geoms',[g]):
  if p.geom_type!='Polygon':continue
  dr.polygon(list(p.exterior.coords),fill=255)
  for h in p.interiors:dr.polygon(list(h.coords),fill=0)
 return im

def texture(src,rect,size,seed):
 sample=src.crop(rect).convert('RGB');small=np.array(sample,dtype=float);assert small.mean()<190
 # Remove the sampled patch's illumination gradient, then mirror-tile its real fine texture.
 # Mirrored edges are seamless; no block-by-block tone changes or generated scene detail.
 low=np.array(sample.filter(ImageFilter.GaussianBlur(3)),dtype=float);center=np.median(small.reshape(-1,3),axis=0);a=np.clip(center+(small-low)*.85,0,255).astype('uint8')
 mirror=np.concatenate([a,a[:,::-1]],axis=1);mirror=np.concatenate([mirror,mirror[::-1]],axis=0);tile=Image.fromarray(mirror)
 out=Image.new('RGB',size);tw,th=tile.size
 for y in range(0,size[1],th):
  for x in range(0,size[0],tw):out.paste(tile,(x,y))
 return out

def paint(src,target,g,tex,allowed):
 mask=raster(g,src.size);m=np.minimum(np.asarray(mask),np.asarray(allowed));mask=Image.fromarray(m.astype('uint8'))
 # Feather only inside the declared mask; all outside pixels remain bit-for-bit original.
 softened=mask.filter(ImageFilter.GaussianBlur(.45));alpha=np.minimum(np.asarray(softened),np.asarray(mask));target.paste(tex,(0,0),Image.fromarray(alpha.astype('uint8')))
 return np.asarray(mask)>0

proof={'source_pdf_sha256':checks['source_pdf_sha256'],'stage':'Local 2D revisions for review; nominal turning checks only; not surveyed/certified','options':{}};outpdf=fitz.open();comp=[]
for i in [1,2,3]:
 o=checks['options'][str(i)];s=o['source_features_pixels'];fit=o['bank_fit'];assert fit['all_final_paving_maneuvers_passed'];src=Image.open(W/f'page_{i}_image_1.png').convert('RGB');dst=src.copy();sx,sy=fit['local_m_per_pixel'];back,top=s['bank_back'],s['bank_top']
 def pixels(g):return affinity.translate(affinity.scale(g,xfact=1/sx,yfact=1/sy,origin=(0,0)),xoff=back,yoff=top)
 source_drive=shape(fit['source_drive_metric']);new_pave=pixels(shape(fit['checked_pavement_metric']).difference(source_drive));bank_mask=shape(fit['source_work_mask']).buffer(2)
 # Curbs at the seven bay mouths become flush access within this marked bank. No new curb or walkway is added.
 pave=new_pave.buffer(.8).intersection(bank_mask)
 # Source arrow/car banks to the right are outside this exact mask.
 annex_allowed=raster(bank_mask,src.size);cx=int((s['drive_left']+s['drive_right'])/2);asphalt=texture(src,(cx-12,s['bank_top']+8,cx+12,s['bank_top']+32),src.size,40+i);paint(src,dst,pave,asphalt,annex_allowed)
 # Draw seven exact 9x18 ft bay outlines at source scale. Do not add decorative cars or landscaping.
 lines=Image.new('RGBA',src.size,(0,0,0,0));ld=ImageDraw.Draw(lines)
 for g in fit['new_bays_pixels']:
  p=shape(g);ld.line(list(p.exterior.coords),fill=(215,218,211,230),width=2)
 line_rgba=np.array(lines);line_rgba[:,:,3]=np.minimum(line_rgba[:,:,3],np.asarray(annex_allowed));dst=Image.alpha_composite(dst.convert('RGBA'),Image.fromarray(line_rgba)).convert('RGB')
 # Separate local edit: northwest approach only. Adjacent approved parking/end planting and original arrows are protected.
 L,R,NT,NB=s['west_left'],s['west_right'],s['north_top'],s['north_bottom'];C=s['west_center'];old_end=500 if i!=1 else 497
 roi=box(L-1,NT-1,R+78,old_end)
 protected_north=box(0,0,src.width,NT-2);protected_west=box(0,0,L-3,src.height)
 center=(R+38,old_end+1);protected_inner=Point(*center).buffer(40,resolution=48).union(box(R+2,old_end,R+100,src.height))
 arrow=box(600,389,650,424) if i in [2,3] else Polygon()
 approach_mask=roi.difference(unary_union([protected_north,protected_west,protected_inner,arrow]));allowed=raster(approach_mask,src.size);locked_stencil=raster(unary_union([protected_north,protected_west,protected_inner,arrow]),src.size);allowed=Image.fromarray(np.where(np.asarray(locked_stencil)>0,0,np.asarray(allowed)).astype('uint8'))
 straight=shape(o['straight_approach']['straight_pavement_pixels']).intersection(roi)
 # Preserve existing common pavement texture; replace grass/obsolete curb only where the straight access needs it.
 a=np.array(src);mx=a.max(2).astype(float);mn=a.min(2).astype(float);mean=a.mean(2);neutral=(mx-mn<25)&(mean>35)&(mean<175)
 common=np.asarray(raster(straight,src.size))>0;newbits=common&(np.asarray(allowed)>0)
 # Retain original circulation arrow exactly, including anti-aliased edges and its local background.
 asphalt2=texture(src,(R+33,NT+17,R+57,NT+41),src.size,90+i)
 mask=Image.fromarray((newbits*255).astype('uint8'));dst.paste(asphalt2,(0,0),mask)
 # Restore only obsolete curved pavement to the adjacent existing grass texture inside the same mask.
 outside=(np.asarray(raster(roi.difference(straight),src.size))>0)&(np.asarray(allowed)>0)
 road_or_curb=(mx-mn<32)&(mean>40)
 restore=outside&road_or_curb
 grass_x=R+74;grass=texture(src,(grass_x,NB+9,grass_x+24,NB+33),src.size,150+i);dst.paste(grass,(0,0),Image.fromarray((restore*255).astype('uint8')))
 # The actual changed-pixel test uses only the two declared masks, never a full-page tolerance.
 union_mask=np.maximum(np.asarray(annex_allowed),np.asarray(allowed))>0;changed=np.any(np.array(src)!=np.array(dst),axis=2);bad=changed&(~union_mask);assert int(bad.sum())==0
 # Approved neighboring parking and source arrows are independently locked even where a mask is nearby.
 locked=raster(unary_union([protected_north,protected_west,protected_inner,arrow]),src.size)
 # These approach-only protections do not restrict the separately authorized annex edit.
 approach_locked=(np.asarray(locked)>0)&(np.asarray(raster(roi,src.size))>0);assert not np.any(changed&approach_locked)
 out=D/'images'/f'Option_{i}_Local_Revision.png';dst.save(out);mp=D/'checks'/f'Option_{i}_Allowed_Edit_Mask.png';Image.fromarray((union_mask*255).astype('uint8')).save(mp)
 # Pure source pages keep title, legend, margins, original labels and all circulation arrows.
 pg=outpdf.new_page(width=1100,height=825);pg.insert_image(pg.rect,filename=str(out))
 proof['options'][i]={'passed':True,'source_dimensions_px':list(src.size),'changed_pixels':int(changed.sum()),'changed_pixels_outside_two_masks':int(bad.sum()),'locked_approach_neighbors_or_arrows_changed_pixels':int(np.count_nonzero(changed&approach_locked)),'new_stall_count':7,'source_image_sha256':hashlib.sha256((W/f'page_{i}_image_1.png').read_bytes()).hexdigest(),'revised_image_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'image_file':str(out.relative_to(D)),'annex_mask_pixels':mapping(bank_mask),'approach_mask_pixels':mapping(approach_mask),'nominal_vehicle_checks_passed':True,'field_scale_verified':False}
 # Compact comparison crops retain the original and revised source style.
 def pair(rect,label):
  before=src.crop(rect);after=dst.crop(rect);q=Image.new('RGB',(before.width*2,before.height+34),'white');q.paste(before,(0,34));q.paste(after,(before.width,34));dd=ImageDraw.Draw(q);dd.text((5,2),f'OPTION {i}: {label}',fill='black');dd.text((5,18),'BEFORE',fill='black');dd.text((before.width+5,18),'AFTER - LOCAL EDIT ONLY',fill='black');return q
 q=pair((s['bank_back']-75,s['bank_top']-20,s['drive_right']+25,s['south_far']+15),'ANNEX');q.save(D/f'Option_{i}_Annex_Before_After.png')
 q2=pair((L-32,NT-20,R+105,old_end+55),'STRAIGHT APPROACH');q2.save(D/f'Option_{i}_Approach_Before_After.png')
 print('LOCAL_EDIT',i,'changed',int(changed.sum()),'outside',int(bad.sum()),flush=True)
outpdf.save(D/'Monroe_Exact_Source_Local_Revisions.pdf',deflate=True);outpdf.close()
# Independently read the final PDF's actual embedded image pixels, not merely the pre-export PNGs.
pdf=fitz.open(D/'Monroe_Exact_Source_Local_Revisions.pdf')
for i,p in enumerate(pdf,1):
 import io
 im=pdf.extract_image(p.get_images()[0][0]);actual=Image.open(io.BytesIO(im['image'])).convert('RGB');expected=Image.open(D/'images'/f'Option_{i}_Local_Revision.png').convert('RGB');assert np.array_equal(actual,expected)
proof['final_pdf_embedded_pixels_match_delivery_pngs']=True;(D/'checks/LOCKED_PIXEL_COMPARISON.json').write_text(json.dumps(proof,indent=2));print('PDF_PIXEL_READBACK_PASS',len(pdf),flush=True)
