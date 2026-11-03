import bpy,numpy as np,math,json
from pathlib import Path
from PIL import Image
from mathutils import Vector

def repaint_garage(w,d,apartment,floor):
 material=apartment.data.materials[0].copy();material.name='Apartment red gray facade | garage entry representation';node=next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.colorspace_settings.name!='Non-Color');path=Path('/workspace/monroe-material-update/delivery/Shared_Textures/Apartment_Red_Brick_Gray_Upper.png');a=np.array(Image.open(path).convert('RGB'));H,W=a.shape[:2];mesh=apartment.data;mesh.calc_loop_triangles();uv=mesh.uv_layers.active;painted=0
 for tri in mesh.loop_triangles:
  points=np.array([list(apartment.matrix_world@mesh.vertices[i].co) for i in tri.vertices])
  if abs(tri.normal.x)<.5 or points[:,0].mean()>-85 or points[:,1].max()<373.0 or points[:,1].min()>379.3 or points[:,2].max()<floor or points[:,2].min()>(floor+3.):continue
  xy=np.array([[uv.data[i].uv.x*(W-1),(1-uv.data[i].uv.y)*(H-1)] for i in tri.loops]);lo=np.maximum(np.floor(xy.min(0)).astype(int),0);hi=np.minimum(np.ceil(xy.max(0)).astype(int),[W-1,H-1]);M=np.c_[xy,np.ones(3)]
  if abs(np.linalg.det(M))<1e-5:continue
  xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1));weights=np.c_[xx.ravel(),yy.ravel(),np.ones(xx.size)]@np.linalg.inv(M);world=weights@points;mask=np.all(weights>=-.001,1)&(world[:,1]>=373.0)&(world[:,1]<=379.3)&(world[:,2]>=floor)&(world[:,2]<=(floor+3.));tile=a[lo[1]:hi[1]+1,lo[0]:hi[0]+1].copy().reshape(-1,3);colors=np.full((len(world),3),[49,57,61],dtype=np.uint8);seam=np.mod(world[:,2]-floor,.32)<.025;colors[seam]=[36,42,46];frame=(world[:,1]<373.15)|(world[:,1]>379.15)|(world[:,2]>(floor+2.82));colors[frame]=[121,126,127];tile[mask]=colors[mask];a[lo[1]:hi[1]+1,lo[0]:hi[0]+1]=tile.reshape(yy.shape[0],xx.shape[1],3);painted+=int(mask.sum())
 output=d/'Shared_Textures/F_Apartment_Garage_Facade_Atlas.png';Image.fromarray(a).save(output);node.image=bpy.data.images.load(str(output),check_existing=False);node.image.pack();apartment.data.materials[0]=material
