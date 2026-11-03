import bpy,json,math,numpy as np
from pathlib import Path
from PIL import Image
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def add_shared(w,d,mats,add,working):
 plan=json.loads((w/'driveway_geometry.json').read_text())['shared_facilities']
 def simple(name,color):
  m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9;return m
 for name,color in [('court_red',(.34,.105,.075)),('court_green',(.13,.23,.18)),('court_blue',(.11,.18,.30)),('sports_metal',(.57,.61,.62)),('net',(.065,.075,.065))]:mats[name]=simple('Recreation | '+name,color)
 for r in plan['meshes']:add(r)
 points=[];faces=[]
 for o in bpy.context.scene.objects:
  if not working(o) or not (o.name.startswith('Terrain_') or o.name.startswith('S_') or o.name.startswith('E_')):continue
  if not any(s in o.name for s in ['Terrain','Grass','Dirt','Surface','Pavement','Apron']):continue
  n=len(points);points.extend(o.matrix_world@v.co for v in o.data.vertices);faces.extend([n+i for i in f.vertices] for f in o.data.polygons)
 bvh=BVHTree.FromPolygons(points,faces)
 def ground(x,y):
  hit=bvh.ray_cast(Vector((x,y,1000)),Vector((0,0,-1)))[0];return hit.z if hit else 12.
 def boxes(name,parts,material):
  vs=[];fs=[]
  for x0,y0,z0,x1,y1,z1 in parts:
   n=len(vs);vs.extend([(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]);fs.extend([[n+i for i in f] for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]])
  return add({'name':name,'vertices':vs,'faces':fs,'material':material})
 for n in plan['tennis_nets']:
  x0,x1,y=n['x0'],n['x1'],n['y'];z0=ground(x0,y);z1=ground(x1,y);parts=[(x0-.035,y-.035,z0,x0+.035,y+.035,z0+1.07),(x1-.035,y-.035,z1,x1+.035,y+.035,z1+1.07)]
  for i in range(7):
   z=min(z0,z1)+.1+i*.135;parts.append((x0,y-.007,z,x1,y+.007,z+.014))
  for i in range(1,int((x1-x0)/.2)):
   x=x0+i*.2;z=z0+(z1-z0)*(x-x0)/(x1-x0);parts.append((x-.007,y-.008,z+.07,x+.007,y+.008,z+.94))
  boxes(n['name'],parts,'net')
 for i,h in enumerate(plan['basketball_hoops']):
  x,y,s=h['x'],h['y'],h['side'];z=ground(x,y);pole=x+s*1.65;boxes('S_Kelly_Basketball_Hoop_Support_%d'%i,[(pole-.06,y-.06,z,pole+.06,y+.06,z+3.65),(min(x,pole),y-.05,z+3.3,max(x,pole),y+.05,z+3.42)],'sports_metal');boxes('S_Kelly_Basketball_Backboard_%d'%i,[(x-.05,y-.915,z+3.0,x+.05,y+.915,z+4.07)],'paint');vs=[];fs=[];cx=x-s*.42
  for j in range(24):
   a=j*2*math.pi/24
   for k in range(6):
    b=k*2*math.pi/6;rad=.23+.018*math.cos(b);vs.append((cx+rad*math.cos(a),y+rad*math.sin(a),z+3.05+.018*math.sin(b)))
  for j in range(24):
   for k in range(6):fs.append([j*6+k,((j+1)%24)*6+k,((j+1)%24)*6+(k+1)%6,j*6+(k+1)%6])
  add({'name':'S_Kelly_Basketball_Rim_%d'%i,'vertices':vs,'faces':fs,'material':'sports_metal'})
 for item in plan['small_bleachers']:
  x0,y0,x1,y1=item['bounds'];z=ground((x0+x1)/2,(y0+y1)/2);parts=[]
  for row in range(4):
   yy0=y0+(y1-y0)*row/4;yy1=y0+(y1-y0)*(row+1)/4;parts.append((x0,yy0,z-.1,x1,yy1,z+.25+row*.28))
  boxes(item['name'],parts,'sports_metal')
 # Use the reference-supported green roof color where the registered original aerial actually shows vegetation.
 o=bpy.data.objects['building_1673'];m=o.data.materials[0].copy();m.name='Woodson | pale cladding and image-supported planted roof zones';node=next(n for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.colorspace_settings.name!='Non-Color');base=d/'Shared_Textures'/Path(node.image.filepath).name;img=np.array(Image.open(base).convert('RGB'));H,W=img.shape[:2];mesh=o.data
 if mesh.users>1:o.data=mesh.copy();mesh=o.data
 uv=mesh.uv_layers.active;pts=np.array([list(o.matrix_world@v.co) for v in mesh.vertices]);lo3=pts.min(0);hi3=pts.max(0);roof_mid=(lo3[2]+hi3[2])/2
 img[:101]=[214,216,209]
 for face in mesh.polygons:
  if abs(face.normal.z)<.7 or np.mean([pts[i,2] for i in face.vertices])<roof_mid:continue
  for li,vi in zip(face.loop_indices,face.vertices):
   x,y,z=pts[vi];uv.data[li].uv=(.02+.96*(x-lo3[0])/(hi3[0]-lo3[0]),1-(4+92*(hi3[1]-y)/(hi3[1]-lo3[1]))/(H-1))
 mesh.calc_loop_triangles();A=np.array(json.loads(Path('/workspace/monroe-screenshot/delivery/textures/screenshot_manifest.json').read_text())['original_world_to_uv_affine']);aerial=np.array(Image.open('/workspace/formit-city/source/maptexture.jpg').convert('RGB'));green_pixels=0
 # Neutralize only this photo-visible school's wall masonry while retaining its glazing and roof region.
 r,g,b=[img[:,:,i].astype(float) for i in range(3)];mask=(r>g*1.025)&(r>b*1.055)&(r>90);mask[:205]=False;lum=img.mean(2);med=np.median(lum[mask]) if mask.any() else 150;target=np.clip(np.array([224,226,222])+(lum-med)[:,:,None]*.35,0,255).astype(np.uint8);img[mask]=target[mask]
 for tri in mesh.loop_triangles:
  if abs(tri.normal.z)<.7:continue
  world=np.array([list(o.matrix_world@mesh.vertices[i].co) for i in tri.vertices])
  if world[:,2].mean()<roof_mid:continue
  xy=np.array([[uv.data[i].uv.x*(W-1),(1-uv.data[i].uv.y)*(H-1)] for i in tri.loops]);M=np.c_[xy,np.ones(3)]
  if abs(np.linalg.det(M))<1e-5:continue
  lo=np.maximum(np.floor(xy.min(0)).astype(int),0);hi=np.minimum(np.ceil(xy.max(0)).astype(int),[W-1,H-1]);xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1));weights=np.c_[xx.ravel(),yy.ravel(),np.ones(xx.size)]@np.linalg.inv(M);pos=weights@world;uvworld=np.c_[pos[:,:2],np.ones(len(pos))]@A;px=np.clip(np.rint(uvworld[:,0]*(aerial.shape[1]-1)).astype(int),0,aerial.shape[1]-1);py=np.clip(np.rint((1-uvworld[:,1])*(aerial.shape[0]-1)).astype(int),0,aerial.shape[0]-1);sample=aerial[py,px].astype(float);green=(sample[:,1]>sample[:,0]*1.04)&(sample[:,1]>sample[:,2]*1.12)&(sample[:,1]>45);select=np.all(weights>=-.001,1)&green;tile=img[lo[1]:hi[1]+1,lo[0]:hi[0]+1].copy().reshape(-1,3);inside=np.all(weights>=-.001,1);tile[inside]=sample[inside].astype(np.uint8);tile[select]=np.clip(np.array([103,128,75])+(sample[select].mean(1)-90)[:,None]*.35,0,255).astype(np.uint8);img[lo[1]:hi[1]+1,lo[0]:hi[0]+1]=tile.reshape(xx.shape[0],xx.shape[1],3);green_pixels+=int(select.sum())
 assert green_pixels>0,'No planted roof pixels were mapped; do not claim a green roof update'
 output=d/'Shared_Textures/Woodson_Pale_Facade_Planted_Roof.png';Image.fromarray(img).save(output);node.image=bpy.data.images.load(str(output),check_existing=False);node.image.pack();o.data.materials[0]=m;o['roof_reference_status']='Planted roof zones sampled from registered original aerial and supported by user oblique image; approximate mask, no structural roof geometry regenerated.'
 return {'tennis_courts_interpreted':9,'tennis_complexes':3,'basketball_courts_marked':1,'small_baseball_bleachers_added':2,'woodson_building_id':'building_1673','green_roof_atlas_pixels':green_pixels,'building_geometry_changed':False,'accuracy':plan['accuracy']}
