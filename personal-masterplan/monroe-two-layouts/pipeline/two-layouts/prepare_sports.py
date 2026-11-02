import sys,json,math,collections
from pathlib import Path
sys.path.insert(0,'/workspace/monroe-road-redesign/python-deps')
import numpy as np
from shapely import constrained_delaunay_triangles
from shapely.geometry import Polygon,shape
from shapely.ops import unary_union
from PIL import Image
import scipy.ndimage
w=Path('/workspace/monroe-two-layouts');d=w/'delivery';manifest=json.loads(Path('/workspace/monroe-screenshot/delivery/textures/screenshot_manifest.json').read_text());A=np.array(manifest['original_world_to_uv_affine']);M=np.linalg.inv(A[:2].T)
def to_world(pixels):
 p=np.array(pixels,dtype=float);uv=np.c_[p[:,0]/1501,1-p[:,1]/1501];return (uv-A[2])@M.T
base=Polygon(to_world([(386,547),(544,547),(548,630),(493,637),(390,636)]));outer=Polygon(to_world([(1164,321),(1165,307),(1170,296),(1180,286),(1193,280),(1208,278),(1222,281),(1238,288),(1248,300),(1254,315),(1255,438),(1251,451),(1241,464),(1226,474),(1212,479),(1195,477),(1181,470),(1170,459),(1165,444)]));inner=Polygon(to_world([(1178,323),(1180,309),(1189,300),(1202,294),(1218,295),(1233,302),(1241,313),(1244,325),(1244,432),(1240,445),(1230,454),(1215,461),(1201,460),(1187,454),(1179,443),(1177,431)]));fields=[('E_Baseball_Field',base,'Sports_Baseball.jpg'),('E_Football_Field',inner,'Sports_Football_Track.jpg'),('E_Running_Track',outer.difference(inner),'Sports_Football_Track.jpg')];woodson_baseball=Polygon(to_world([(1087,280),(1104,264),(1158,265),(1158,439),(1080,442)]));fields.append(('E_Woodson_Baseball_Practice_Field',woodson_baseball,'Sports_Woodson_Baseball.jpg'));allfields=unary_union([base,outer,woodson_baseball]);raw=json.loads(Path('/workspace/monroe-screenshot/registration_geometry.json').read_text());records=[]
def texture_crop(name,poly):
 b=poly.bounds;ww=math.ceil((b[2]-b[0])/.2);h=math.ceil((b[3]-b[1])/.2);x=b[0]+(np.arange(ww)+.5)*(b[2]-b[0])/ww;y=b[3]-(np.arange(h)+.5)*(b[3]-b[1])/h;xx,yy=np.meshgrid(x,y);image=np.zeros((h,ww,3),np.uint8)
 for tile in manifest['tiles']:
  q=tile['bbox_local_m'];selected=(xx>=q[0])&(xx<=q[2])&(yy>=q[1])&(yy<=q[3])
  if not selected.any():continue
  data=np.array(Image.open(Path('/workspace/monroe-screenshot/delivery/textures')/tile['high']).convert('RGB'));px=(xx[selected]-q[0])/(q[2]-q[0])*data.shape[1]-.5;py=(q[3]-yy[selected])/(q[3]-q[1])*data.shape[0]-.5
  for c in range(3):image[:,:,c][selected]=scipy.ndimage.map_coordinates(data[:,:,c],[py,px],order=1,mode='nearest')
 Image.fromarray(image).save(d/'Shared_Textures'/name,quality=96,subsampling=0);return list(b)
texturebounds={'Sports_Baseball.jpg':texture_crop('Sports_Baseball.jpg',base),'Sports_Football_Track.jpg':texture_crop('Sports_Football_Track.jpg',outer),'Sports_Woodson_Baseball.jpg':texture_crop('Sports_Woodson_Baseball.jpg',woodson_baseball)}
for name,poly,texture in fields:
 coords=[];topfaces=[];lookup={};b=texturebounds[texture]
 for item in raw['terrain']:
  pp=np.array(item['points']);tri=Polygon(pp[:,:2])
  if tri.area<1e-9 or not tri.intersects(poly):continue
  cut=tri.intersection(poly);coef=np.linalg.solve(np.c_[pp[:,:2],np.ones(3)],pp[:,2])
  for t in constrained_delaunay_triangles(cut).geoms:
   if t.area<1e-8:continue
   xy=np.array(t.exterior.coords)[:3,:2];cross=(xy[1,0]-xy[0,0])*(xy[2,1]-xy[0,1])-(xy[1,1]-xy[0,1])*(xy[2,0]-xy[0,0])
   if cross<0:xy=xy[::-1]
   f=[]
   for p in xy:
    key=tuple(np.round(p,6))
    if key not in lookup:lookup[key]=len(coords);coords.append([*p,float(np.r_[p,1]@coef)+.035])
    f.append(lookup[key])
   topfaces.append(f)
 N=len(coords);vs=coords+[[x,y,z-.12] for x,y,z in coords];edgecounts=collections.Counter()
 for f in topfaces:
  for a,bb in zip(f,f[1:]+f[:1]):edgecounts[tuple(sorted((a,bb)))]+=1
 side=[]
 for f in topfaces:
  for a,bb in zip(f,f[1:]+f[:1]):
   if edgecounts[tuple(sorted((a,bb)))]==1:side.append([a,bb,bb+N,a+N])
 fs=topfaces+[[i+N for i in reversed(f)] for f in topfaces]+side;uv=[[(vs[i][0]-b[0])/(b[2]-b[0]),(vs[i][1]-b[1])/(b[3]-b[1])] for f in fs for i in f];records.append({'name':name,'vertices':vs,'faces':fs,'uv':uv,'texture':texture,'footprint':poly.__geo_interface__,'thickness_m':.12,'top_vertices':N})
(w/'sports_meshes.json').write_text(json.dumps(records));(w/'sports_shapes.json').write_text(json.dumps([{'name':n,'geometry':p.__geo_interface__} for n,p,t in fields]));(d/'validation/sports_source_report.json').write_text(json.dumps({'features':[{'name':r['name'],'thickness_m':.12,'area_m2':shape(r['footprint']).area,'source':'Image-traced boundary on original aerial image, transformed with the existing model UV calibration; not a surveyed sports-field dimension.'} for r in records],'original_terrain_cut_from_working_base_under_fields':True,'building_geometry_changed':False},indent=2));print('SPORTS_MESHES_READY',[(r['name'],len(r['faces'])) for r in records])
