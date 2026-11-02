"""User-authorized personal screenshot approximation. No licensed-orthophoto claim.
Original image pixels are projectively sampled; no AI or sharpening is used.
"""
from pathlib import Path
import sys,json,math,hashlib
sys.path.insert(0,'/workspace/monroe-hd/python-deps')
import cv2,numpy as np
from PIL import Image
w=Path('/workspace/monroe-screenshot');d=w/'delivery';refs=Path('/workspace/monroe-hd/references/updated');g=json.loads((w/'registration_geometry.json').read_text());plan=json.loads(Path('/workspace/monroe-hd/delivery/imagery_plan.json').read_text());old=cv2.imread('/workspace/formit-city/source/maptexture.jpg');oh,ow=old.shape[:2];samples=g['uv_samples'];A=np.array([[s['xy'][0],s['xy'][1],1] for s in samples]);B=np.array([s['uv'] for s in samples]);affine=np.linalg.lstsq(A,B,rcond=None)[0];residual=float(np.max(np.abs(A@affine-B)));assert residual<1e-3
# Building footprints follow individual projected mesh faces, preserving courtyards.
footprints=[];mask=np.zeros((oh,ow),np.uint8)
for b in g['buildings']:
 pts=np.array(b['points']);uv=np.c_[pts[:,:2],np.ones(len(pts))]@affine;pixels=np.c_[uv[:,0]*(ow-1),(1-uv[:,1])*(oh-1)]
 for f in b['faces']:
  xy=pts[f,:2]
  if abs(cv2.contourArea(xy.astype(np.float32)))<.05:continue
  footprints.append(xy.tolist());cv2.fillPoly(mask,[np.rint(pixels[f]).astype(np.int32)],255)
ground_mask=255-cv2.dilate(mask,np.ones((5,5),np.uint8));sift=cv2.SIFT_create(nfeatures=18000);k0,desc0=sift.detectAndCompute(cv2.cvtColor(old,cv2.COLOR_BGR2GRAY),None);flann=cv2.FlannBasedMatcher(dict(algorithm=1,trees=5),dict(checks=100))
label_regions={'Neighborhood_Aerial_Overview.png':[(.53,.18,.79,.29),(.65,.26,.79,.44),(.77,.32,.95,.48),(.95,.33,1,.48),(.17,.71,.40,.82),(.18,.83,.44,.96),(.54,.82,.77,.94),(.86,.53,1,.66)],'Monroe_School_Site_and_Streets.png':[(.37,.68,.77,.79),(0,.80,.20,.96),(.93,.24,1,.37)],'Monroe_School_Closeup.png':[]}
sources=[];registrations=[]
for name in ['Neighborhood_Aerial_Overview.png','Monroe_School_Site_and_Streets.png','Monroe_School_Closeup.png']:
 image=cv2.imread(str(refs/name));h,ww=image.shape[:2];valid=np.ones((h,ww),np.uint8)*255;valid[:12]=0;valid[-12:]=0;valid[:,:12]=0;valid[:,-12:]=0
 for x0,y0,x1,y1 in label_regions[name]:valid[int(y0*h):int(y1*h),int(x0*ww):int(x1*ww)]=0
 keys,desc=sift.detectAndCompute(cv2.cvtColor(image,cv2.COLOR_BGR2GRAY),valid);pairs=flann.knnMatch(desc0,desc,k=2);good=[a for a,b in pairs if a.distance<.70*b.distance];ground=[m for m in good if ground_mask[int(k0[m.queryIdx].pt[1]),int(k0[m.queryIdx].pt[0])]>0];mode='ground_features';selected=ground
 def estimate(ms):
  p=np.float32([k0[m.queryIdx].pt for m in ms]);q=np.float32([keys[m.trainIdx].pt for m in ms]);H,flags=cv2.findHomography(p,q,cv2.RANSAC,6.0,maxIters=10000,confidence=.999);return p,q,H,flags.ravel().astype(bool) if flags is not None else None
 if len(selected)<20:selected=good;mode='mixed_features_ground_control_insufficient'
 p,q,H,inside=estimate(selected)
 if H is None or inside.sum()<18:
  selected=good;mode='mixed_features_ground_control_insufficient';p,q,H,inside=estimate(selected)
 if H is None or inside.sum()<18:raise RuntimeError('Insufficient registration support for '+name)
 residuals=np.linalg.norm(cv2.perspectiveTransform(p.reshape(-1,1,2),H).reshape(-1,2)-q,axis=1)[inside];median=float(np.median(residuals));assert median<4.5
 # Restrict sampling to the supported feature hull, with a modest feathered margin.
 hull=cv2.convexHull(q[inside]);support=np.zeros_like(valid);cv2.fillConvexPoly(support,hull.astype(np.int32),255);support=cv2.dilate(support,np.ones((101,101),np.uint8));valid=cv2.bitwise_and(valid,support);distance=cv2.distanceTransform(valid,cv2.DIST_L2,3);weight=np.clip(distance/24,0,1).astype(np.float32)
 jac=float(np.sqrt(abs(np.linalg.det(H[:2,:2]))));record={'file':name,'sha256':hashlib.sha256((refs/name).read_bytes()).hexdigest(),'image_pixels':[ww,h],'candidate_matches':len(good),'ground_candidate_matches':len(ground),'registration_mode':mode,'inliers':int(inside.sum()),'median_reference_pixel_residual':median,'homography_source_image_to_screenshot':H.tolist(),'approx_image_scale_relative_to_old':jac,'is_verified_orthophoto':False};registrations.append(record);sources.append({'record':record,'image':image,'weight':weight,'H':H,'scale':jac});print('REGISTERED',name,int(inside.sum()),round(median,2),mode,flush=True)
sources.sort(key=lambda s:s['scale']);bounds=plan['bounds_xy_m'];tiles=[];totals=np.zeros(len(sources)+1,dtype=np.int64);infill_total=0;totalpixels=0
# Work one 350m tile at a time; no enormous full-city texture is allocated.
for ty in range(4):
 for tx in range(4):
  xmin=bounds[0]+(bounds[2]-bounds[0])*tx/4;xmax=bounds[0]+(bounds[2]-bounds[0])*(tx+1)/4;ymin=bounds[1]+(bounds[3]-bounds[1])*ty/4;ymax=bounds[1]+(bounds[3]-bounds[1])*(ty+1)/4;ww=math.ceil((xmax-xmin)/.2);h=math.ceil((ymax-ymin)/.2);x=xmin+(np.arange(ww)+.5)*(xmax-xmin)/ww;y=ymax-(np.arange(h)+.5)*(ymax-ymin)/h;xx,yy=np.meshgrid(x,y);u=xx*affine[0,0]+yy*affine[1,0]+affine[2,0];v=xx*affine[0,1]+yy*affine[1,1]+affine[2,1];px=(u*(ow-1)).astype(np.float32);py=((1-v)*(oh-1)).astype(np.float32);composite=cv2.remap(old,px,py,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE).astype(np.float32);choice=np.zeros((h,ww),np.uint8)
  for i,source in enumerate(sources):
   H=source['H'];den=H[2,0]*px+H[2,1]*py+H[2,2];qx=((H[0,0]*px+H[0,1]*py+H[0,2])/den).astype(np.float32);qy=((H[1,0]*px+H[1,1]*py+H[1,2])/den).astype(np.float32);weight=cv2.remap(source['weight'],qx,qy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT);image=cv2.remap(source['image'],qx,qy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT).astype(np.float32);composite=composite*(1-weight[...,None])+image*weight[...,None];choice[weight>.5]=i+1
  # Remove flat aerial copies beneath all 3D buildings. A small 0.5m edge margin
  # is reconstructed from neighboring pixels, not asserted as measured ground.
  building_mask=np.zeros((h,ww),np.uint8)
  for poly in footprints:
   p=np.array(poly)
   if p[:,0].max()<xmin-1 or p[:,0].min()>xmax+1 or p[:,1].max()<ymin-1 or p[:,1].min()>ymax+1:continue
   q=np.c_[(p[:,0]-xmin)/(xmax-xmin)*ww-.5,(ymax-p[:,1])/(ymax-ymin)*h-.5];cv2.fillPoly(building_mask,[np.rint(q).astype(np.int32)],255)
  building_mask=cv2.dilate(building_mask,np.ones((5,5),np.uint8));composite=np.clip(composite,0,255).astype(np.uint8)
  if building_mask.any():composite=cv2.inpaint(composite,building_mask,3,cv2.INPAINT_TELEA)
  name=f'screenshot_x{tx:02d}_y{ty:02d}';high=name+'_ground.jpg';low=name+'_overview.jpg';cv2.imwrite(str(d/'textures'/high),composite,[cv2.IMWRITE_JPEG_QUALITY,96]);overview=cv2.resize(composite,(512,512),interpolation=cv2.INTER_AREA);cv2.imwrite(str(d/'textures'/low),overview,[cv2.IMWRITE_JPEG_QUALITY,90]);counts=np.bincount(choice.ravel(),minlength=len(sources)+1);totals+=counts;infill=int((building_mask>0).sum());infill_total+=infill;totalpixels+=ww*h;tiles.append({'id':name,'bbox_local_m':[xmin,ymin,xmax,ymax],'pixels':[ww,h],'high':high,'low':low,'sha256_high':hashlib.sha256((d/'textures'/high).read_bytes()).hexdigest(),'source_selection_pixel_counts':counts.tolist(),'building_infill_pixels':infill});print('TILE_DONE',name,'screenshots',round(100*(1-counts[0]/counts.sum()),1),'percent',flush=True)
manifest={'status':'user_authorized_screenshot_approximation','usage':'personal_prototype','license_verified':False,'survey_accurate':False,'output_grid_m_per_pixel':.2,'effective_source_resolution':'Variable screenshot detail, not verified 10–30 cm imagery. Fallback retains original blurry data outside screenshot coverage.','source_order':['original_low_resolution_ground']+[s['record']['file'] for s in sources],'source_pixel_counts':totals.tolist(),'screenshot_coverage_fraction':float(1-totals[0]/totalpixels),'building_infill_fraction':infill_total/totalpixels,'buildings_masked':len(g['buildings']),'infill_method':'Local non-AI Telea image infill beneath original building footprint faces, with approx 0.5m margin. Exposed inferred ground is not surveyed.','source_registrations':registrations,'original_world_to_uv_affine':affine.tolist(),'original_world_to_uv_max_residual':residual,'local_proj4':plan['local_proj4'],'tiles':tiles,'limitations':['Projective screenshot registration is approximate; perspective, terrain relief, building lean and capture dates can leave local offsets.','Labels and image borders are excluded where identified; unmapped areas retain the earlier image.','No artificial sharpening or generated aerial details. Building-footprint ground restoration is inferred.','This is not newly licensed orthophotography and no native GSD is claimed.']};(d/'textures/screenshot_manifest.json').write_text(json.dumps(manifest,indent=2));(d/'validation/screenshot_registration.json').write_text(json.dumps({k:v for k,v in manifest.items() if k!='tiles'},indent=2));print('SCREENSHOT_COMPOSITE_DONE',manifest['screenshot_coverage_fraction'],flush=True)
