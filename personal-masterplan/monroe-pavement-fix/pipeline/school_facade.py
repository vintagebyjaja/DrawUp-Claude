"""Reference-informed school wall finish; preserves mesh, UVs and roof."""
import bpy,numpy as np
from pathlib import Path
from PIL import Image

def repaint_school(d,o):
 m=o.data.materials[0].copy();m.name='Monroe school | brick panels concrete frame and glazing'
 n=next(n for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.colorspace_settings.name!='Non-Color')
 a=np.array(Image.open('/workspace/monroe-townhouse-correction/delivery/Shared_Textures/building_2356_Unified_Color.png').convert('RGB'));H,W=a.shape[:2];o.data.calc_loop_triangles();uv=o.data.uv_layers.active
 for tri in o.data.loop_triangles:
  if abs(tri.normal.z)>.5:continue
  points=np.array([list(o.matrix_world@o.data.vertices[i].co) for i in tri.vertices]);xy=np.array([[uv.data[i].uv.x*(W-1),(1-uv.data[i].uv.y)*(H-1)] for i in tri.loops]);lo=np.maximum(np.floor(xy.min(0)).astype(int),0);hi=np.minimum(np.ceil(xy.max(0)).astype(int),[W-1,H-1]);M=np.c_[xy,np.ones(3)]
  if abs(np.linalg.det(M))<1e-5:continue
  xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1));weights=np.c_[xx.ravel(),yy.ravel(),np.ones(xx.size)]@np.linalg.inv(M);p=weights@points;mask=np.all(weights>=-.001,1);z=p[:,2]-22.794775;t=(p[:,1]-356.33)*.986+(p[:,0]+35.714)*.165 if abs(tri.normal.x)>.5 else p[:,0]+35.714
  brick=((np.floor(z/.085)%2)*.13+t)% .26; mortar=(np.mod(z,.085)<.009)|(brick<.009);noise=np.sin(t*22+z*19)*5
  c=np.tile([157.,117.,91.],(len(p),1))+noise[:,None];c[mortar]=[171,151,130]
  pier=np.mod(t,6.1)<.28;bands=(abs(z-3.8)<.15)|(abs(z-7.3)<.18)|(z>9.18);c[pier|bands]=[179,179,166]
  windows=((z>1.25)&(z<2.9))|((z>5.05)&(z<6.65));windows&=(np.mod(t,6.1)>.55)&(np.mod(t,6.1)<5.8)
  c[windows]=[87,111,118];frame=windows&((np.mod(t,.98)<.055)|(abs(z-2.05)<.045)|(abs(z-5.85)<.045));c[frame]=[194,200,192]
  # The broad central entrance shown in the reference is a facade finish, not a geometry relocation.
  front=(tri.normal.x<-.5);entry=front&(t>24)&(t<29)&(z<2.8);c[entry]=[70,91,99];c[entry&(np.mod(t,.95)<.06)]=[181,185,177]
  tile=a[lo[1]:hi[1]+1,lo[0]:hi[0]+1].copy().reshape(-1,3);tile[mask]=np.clip(c[mask],0,255).astype('uint8');a[lo[1]:hi[1]+1,lo[0]:hi[0]+1]=tile.reshape(yy.shape[0],xx.shape[1],3)
 out=d/'Shared_Textures/F_Monroe_School_Reference_Facade.png';Image.fromarray(a).save(out);n.image=bpy.data.images.load(str(out),check_existing=False);n.image.pack();o.data.materials[0]=m;o['finish_update']='Reference-informed brick infill, concrete piers/bands and two window rows. Dimensions approximate; original geometry and roof unchanged.'
