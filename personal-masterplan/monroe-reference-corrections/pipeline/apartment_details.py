import bpy,numpy as np,math,json
from pathlib import Path
from PIL import Image
from mathutils import Vector

def add_details(w,d,col,mats,add):
 data=json.loads((w/'driveway_geometry.json').read_text())['apartment_site'];apartment=bpy.data.objects['building_2603'];material=apartment.data.materials[0].copy();material.name='Apartment red gray facade | garage entry representation';node=next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.colorspace_settings.name!='Non-Color');path=d/'Shared_Textures'/Path(node.image.filepath).name;a=np.array(Image.open(path).convert('RGB'));H,W=a.shape[:2];mesh=apartment.data;mesh.calc_loop_triangles();uv=mesh.uv_layers.active;painted=0
 for tri in mesh.loop_triangles:
  points=np.array([list(apartment.matrix_world@mesh.vertices[i].co) for i in tri.vertices])
  if abs(tri.normal.x)<.5 or points[:,0].mean()>-85 or points[:,1].max()<373.0 or points[:,1].min()>379.3 or points[:,2].max()<22.0 or points[:,2].min()>25.0:continue
  xy=np.array([[uv.data[i].uv.x*(W-1),(1-uv.data[i].uv.y)*(H-1)] for i in tri.loops]);lo=np.maximum(np.floor(xy.min(0)).astype(int),0);hi=np.minimum(np.ceil(xy.max(0)).astype(int),[W-1,H-1]);M=np.c_[xy,np.ones(3)]
  if abs(np.linalg.det(M))<1e-5:continue
  xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1));weights=np.c_[xx.ravel(),yy.ravel(),np.ones(xx.size)]@np.linalg.inv(M);world=weights@points;mask=np.all(weights>=-.001,1)&(world[:,1]>=373.0)&(world[:,1]<=379.3)&(world[:,2]>=22.0)&(world[:,2]<=25.0);tile=a[lo[1]:hi[1]+1,lo[0]:hi[0]+1].copy().reshape(-1,3);colors=np.full((len(world),3),[49,57,61],dtype=np.uint8);seam=np.mod(world[:,2]-22.0,.32)<.025;colors[seam]=[36,42,46];frame=(world[:,1]<373.15)|(world[:,1]>379.15)|(world[:,2]>24.82);colors[frame]=[121,126,127];tile[mask]=colors[mask];a[lo[1]:hi[1]+1,lo[0]:hi[0]+1]=tile.reshape(yy.shape[0],xx.shape[1],3);painted+=int(mask.sum())
 output=d/'Shared_Textures/Apartment_Red_Gray_With_Garage.png';Image.fromarray(a).save(output);node.image=bpy.data.images.load(str(output),check_existing=True);node.image.pack();apartment.data.materials[0]=material
 # Site-detail materials remain separately editable; apartment roof/windows/facade remain one mesh/material.
 def simple(name,color):
  m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1);m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85;return m
 mats['apartment_brick']=simple('Apartment courtyard brick',(.42,.19,.105));mats['railing']=simple('Apartment stair handrail',(.09,.10,.10));mats['cap']=simple('Apartment courtyard stone caps',(.57,.56,.51))
 # Brick texture is a material representation, not a fabricated structural detail.
 rng=np.random.default_rng(18);texture=np.zeros((256,512,3),np.uint8)
 for row in range(8):
  for k in range(-1,9):
   x0=k*64+(32 if row%2 else 0);x1=x0+61;y0=row*32;y1=y0+29;texture[y0:y1,max(0,x0):min(512,x1)]=np.clip(np.array([137,76,51])+rng.integers(-10,11),0,255)
 texture[texture.sum(2)==0]=[133,121,106];brickpath=d/'Shared_Textures/Apartment_Courtyard_Brick.png';Image.fromarray(texture).save(brickpath);im=bpy.data.images.load(str(brickpath),check_existing=True);im.pack();tex=mats['apartment_brick'].node_tree.nodes.new('ShaderNodeTexImage');tex.image=im;mats['apartment_brick'].node_tree.links.new(tex.outputs['Color'],mats['apartment_brick'].node_tree.nodes['Principled BSDF'].inputs['Base Color'])
 def boxes(name,parts,material_):
  vs=[];fs=[]
  for x0,y0,z0,x1,y1,z1 in parts:
   start=len(vs);vs.extend([(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]);fs.extend([[start+i for i in f] for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]])
  obj=add({'name':name,'vertices':vs,'faces':fs,'material':material_})
  if material_=='apartment_brick':
   uv_=obj.data.uv_layers.new(name='CourtyardBrickUV')
   for face in obj.data.polygons:
    for li,vi in zip(face.loop_indices,face.vertices):
     p=obj.data.vertices[vi].co;uv_.data[li].uv=((p.x+p.y)/1.2,p.z/.6)
  obj['source_accuracy']='Photo-supported apartment site feature; dimensions approximate from source terrain/footprint, not survey.';return obj
 for r in data['meshes']:add(r)
 boxes('A_Apartment_Garage_Apron_Wing_Retaining',data.get('garage_wingwalls',[]),'concrete')
 steps=[]
 for i in range(20):
  y0=358.8+i*.32;top=25.6-i*(25.6-22.3)/20;steps.append((-90.,y0,17.,-87.25,y0+.32,top))
 boxes('A_Apartment_Exterior_Stairs',steps,'concrete');boxes('A_Apartment_Stair_Upper_Landing',[(-90.,356.6,17.,-86.65,358.8,25.6)],'concrete')
 boxes('A_Apartment_Courtyard_Retaining_and_Parapet',[(-87.2,356.4,17.,-86.75,356.6,26.4),(-87.2,358.85,17.,-86.75,370.3,26.4)],'apartment_brick')
 boxes('A_Apartment_Courtyard_Stone_Caps',[(-87.3,356.35,26.4,-86.65,356.6,26.53),(-87.3,358.85,26.4,-86.65,370.35,26.53)],'cap')
 boxes('A_Apartment_Courtyard_Brick_Piers',[(-87.35,y-.28,25.5,-86.6,y+.28,26.8) for y in [356.45,359.1,364.5,370.0]],'apartment_brick')
 # Exterior metal handrail follows the stair rise; compound prisms are one named editable railing mesh.
 vs=[];faces=[]
 def rail(a,b,r=.035):
  a=Vector(a);b=Vector(b);q=(b-a).to_track_quat('Z','Y');mid=(a+b)/2;L=(b-a).length;start=len(vs)
  for z in [-L/2,L/2]:
   for i in range(6):vs.append(list(mid+q@Vector((r*math.cos(i*math.pi/3),r*math.sin(i*math.pi/3),z))))
  faces.extend([[start+i for i in reversed(range(6))],[start+6+i for i in range(6)]]+[[start+i,start+(i+1)%6,start+(i+1)%6+6,start+i+6] for i in range(6)])
 for x in [-90.0,-87.3]:
  rail((x,358.8,26.5),(x,365.2,23.2))
  for j in range(6):
   y=358.8+j*6.4/5;z=25.6-(y-358.8)/6.4*3.3;rail((x,y,z),(x,y,z+.9))
 add({'name':'A_Apartment_Stair_Handrails','vertices':vs,'faces':faces,'material':'railing'})
 return {'garage_atlas_pixels':painted,'garage_representation':'Facade atlas with dark sectional-door appearance and separate sloped apron; not a Boolean opening or drivable interior.','courtyard_floor_z_m':25.6,'stair_risers_approximate':20,'all_dimensions_approximate':True,'existing_building_geometry_preserved':True}
