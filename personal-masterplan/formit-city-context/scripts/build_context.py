import bpy,json,math,shutil,collections
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
w=Path('/workspace/formit-city-context');d=w/'delivery';bpy.ops.wm.open_mainfile(filepath='/workspace/formit-city-clean/delivery/FormIt_City_Clean_Massing.blend');scene=bpy.context.scene
shutil.copytree('/workspace/formit-city-clean/delivery/textures',d/'textures',dirs_exist_ok=True)
# Working terrain partitions exactly cover the original TIN.
terrain_objects=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('Terrain_')];verts=[];faces=[];uvs=[]
for o in terrain_objects:
 start=len(verts);verts.extend(o.matrix_world@v.co for v in o.data.vertices)
 for p in o.data.polygons:
  faces.append([start+i for i in p.vertices]);uvs.append([tuple(o.data.uv_layers.active.data[i].uv) for i in p.loop_indices])
terrain=BVHTree.FromPolygons(verts,faces,all_triangles=True);rgb=np.load('/workspace/formit-city-layered/aerial_rgb.npy');H,W=rgb.shape[:2]
def ground(x,y):return terrain.ray_cast(Vector((x,y,1000)),Vector((0,0,-1)))
def roofpixel(v):
 hit,normal,idx,distance=ground(v.x,v.y)
 if hit is None:return None
 a,b,c=[verts[i] for i in faces[idx]];uv=barycentric_transform(hit,a,b,c,*[Vector((u,v,0)) for u,v in uvs[idx]])
 x=max(0,min(W-1,round(uv.x*(W-1))));y=max(0,min(H-1,round((1-uv.y)*(H-1))));return rgb[y,x].astype(float)
def clip(poly,z,above):
 result=[]
 for a,b in zip(poly,poly[1:]+poly[:1]):
  ina=a.z>=z if above else a.z<=z;inb=b.z>=z if above else b.z<=z
  if ina:result.append(a)
  if ina!=inb:result.append(a.lerp(b,(z-a.z)/(b.z-a.z)))
 return result
mats={}
def material(style,floors,roof):
 key=(style,floors,roof)
 if key in mats:return mats[key]
 m=bpy.data.materials.new('Context single atlas | '+' '.join(map(str,key)));m.use_nodes=True;m.diffuse_color=(.6,.4,.3,1);p=m.node_tree.nodes['Principled BSDF'];p.inputs['Roughness'].default_value=.85
 image=bpy.data.images.load(str(d/'textures'/f'context_{style}_{floors:02d}floors_{roof}.png'),check_existing=True);image.pack();node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;m.node_tree.links.new(node.outputs['Color'],p.inputs['Base Color']);mats[key]=m;return m
protected={'building_2356','building_2099','building_2772','building_2603','building_2664'};records=[]
for o in list(scene.objects):
 if o.type!='MESH' or not o.name.startswith('building_') or o.name in protected:continue
 mesh=o.data;points=[o.matrix_world@v.co for v in mesh.vertices];lo=min(v.z for v in points);hi=max(v.z for v in points);xs=[v.x for v in points];ys=[v.y for v in points];area=(max(xs)-min(xs))*(max(ys)-min(ys));heights=[];samples=[]
 for v in points:
  hit=ground(v.x,v.y)[0]
  if hit:heights.append(hit.z)
 for p in mesh.polygons:
  if p.normal.z<.3:continue
  pp=[points[i] for i in p.vertices];center=sum(pp,Vector())/len(pp)
  for v in [center]+[center.lerp(v,.45) for v in pp]:
   c=roofpixel(v)
   if c is not None and not(c[1]>c[0]*1.12 and c[1]>c[2]*1.08):samples.append(c)
 color=np.median(samples,axis=0) if samples else np.array([115.,116.,111.]);brightness=float(np.mean(color))
 roof='redbrown' if color[0]>color[1]*1.22 and color[0]>color[2]*1.3 else 'palegray' if brightness>166 else 'midgray' if brightness>97 else 'charcoal'
 # Photographs show predominantly brick residential/institutional context. Specific
 # facade identities are not asserted where photographs do not resolve them.
 style='tan_brick' if hi-lo>11 else 'cream_render' if area>1800 else 'warm_brick'
 base=max(heights)+.5 if heights else lo+.5;base=min(base,hi-.25);visible=hi-base;floors=max(1,min(12,round(visible/3.0)))
 vv=[];ff=[];alluv=[]
 for p in mesh.polygons:
  poly=[points[i] for i in p.vertices];wall=abs(p.normal.z)<.4
  pieces=[(clip(poly,base,False),'base'),(clip(poly,base,True),'wall')] if wall else [(poly,'roof' if p.normal.z>0 else 'base')]
  for pp,category in pieces:
   if len(pp)<3:continue
   start=len(vv);vv.extend(pp);ff.append(list(range(start,start+len(pp))))
   for v in pp:
    horizontal=v.y if abs(p.normal.x)>abs(p.normal.y) else v.x
    alluv.append((horizontal/12.0,max(0,min(.8,(v.z-base)/max(visible,.25)*.8))) if category=='wall' else (horizontal/12.0,.95 if category=='roof' else .85))
 new=bpy.data.meshes.new(o.name+'_single_context_mesh');new.from_pydata(vv,[],ff);new.update();uv=new.uv_layers.new(name='ContextAtlasUV')
 for value,coord in zip(uv.data,alluv):value.uv=coord
 uv.active_render=True;new.materials.append(material(style,floors,roof));old=o.data;o.data=new;o.matrix_world.identity();o['appearance_accuracy']='Illustrative facade rhythm and palette informed by supplied photo ZIP; roof shade class sampled from supplied source aerial texture, not verified per-building architectural detail.';o['selectability']='ONE mesh, ONE material; windows, facade and roof are texture regions, not separate objects.';o['source_shape']='Source surface locations preserved; wall faces split only at estimated above-grade masonry boundary.'
 records.append({'building':o.name,'style_inferred':style,'estimated_floors_for_texture':floors,'roof_shade_aerial_inferred':roof,'roof_sample_rgb':[round(float(v),1) for v in color],'roof_samples':len(samples),'masonry_cutoff_m':base,'reference_scope':'Supplied aerial/oblique photos establish neighborhood palette, not exact per-building facade measurements.'})
 if len(records)%500==0:print('CONTEXT_BUILDINGS',len(records),flush=True)
# Retain only used context texture variants in the delivery folder.
used={Path(image.filepath).name for image in bpy.data.images if image.users and image.source=='FILE'}
for p in (d/'textures').glob('context_*.png'):
 if p.name not in used:p.unlink()
for image in bpy.data.images:
 if image.source=='FILE' and image.users:
  p=d/'textures'/Path(image.filepath).name
  if p.exists():image.filepath=str(p);image.pack()
(d/'validation/context_assignments.json').write_text(json.dumps({'updated_context_buildings':len(records),'protected_detailed_buildings':sorted(protected),'photo_sources':[p.name for p in Path('/workspace/formit-city/references').glob('*.jpg')],'roof_color_source':'Existing original supplied city aerial image; terrain-UV sampling beneath roof footprint. Shade class is approximate and may reflect tree cover or shadows.','building_assignments':records},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(d/'FormIt_City_Neighborhood_Context.blend'));bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.fbx(filepath=str(d/'FormIt_City_Neighborhood_Context.fbx'),use_selection=True,object_types={'MESH','EMPTY'},axis_forward='Y',axis_up='Z',apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',use_mesh_edges=False,path_mode='COPY',embed_textures=True,add_leaf_bones=False,use_custom_props=True)
print('CONTEXT_EXPORT_COMPLETE',len(records),flush=True)
