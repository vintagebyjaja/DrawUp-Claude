import bpy,json,hashlib,shutil,math
import numpy as np
from pathlib import Path
from PIL import Image
import sys
sys.path.insert(0,"/workspace/monroe-pavement-fix/scripts")
from garage_facade import repaint_garage
from school_facade import repaint_school
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
w=Path('/workspace/monroe-pavement-fix');d=w/'delivery';src=Path('/workspace/monroe-townhouse-correction/delivery');(d/'Shared_Textures').mkdir(exist_ok=True);shutil.copytree(src/'Shared_Textures',d/'Shared_Textures',dirs_exist_ok=True)
def active(o):return o.type=='MESH' and not any(o.get(k) for k in ['_proposal_backup','_screenshot_backup','_variant_backup','_material_backup','_townhouse_backup'])
def digest(o):return hashlib.sha256(json.dumps({'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'faces':[list(p.vertices) for p in o.data.polygons]},separators=(',',':')).encode()).hexdigest()
def material(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1);m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9;return m
white_ids=set(json.loads((w/'white_roof_ids.json').read_text()));usedfiles=set()
for variant,folder,filename in [('existing','01_Original_Road_Layout','Monroe_Original_Road_Layout'),('proposed','02_New_Road_Layout','Monroe_New_Road_Layout')]:
 bpy.ops.wm.open_mainfile(filepath=str(src/folder/(filename+'.blend')));scene=bpy.context.scene;before={o.name:digest(o) for o in scene.objects if active(o) and o.name.startswith('building_')};plan=json.loads((w/(variant+'_repairs.json')).read_text());mats={name:material('Fixed surface | '+name,color) for name,color in {'asphalt':(.085,.095,.10),'concrete':(.63,.63,.59),'grass':(.17,.31,.075),'sports_grass':(.17,.31,.075),'dirt':(.46,.25,.105),'paint':(.90,.91,.86)}.items()}
 repaint_garage(w,d,bpy.data.objects['building_2603'],plan['garage_floor_z_m'])
 repaint_school(d,bpy.data.objects['building_2356'])
 # Keep all verified building geometry. Roof/column changes use each building's single material atlas.
 for id_ in sorted(white_ids|{'building_1673','building_2664'}):
  o=bpy.data.objects.get(id_)
  if not o:continue
  m=o.data.materials[0].copy();node=next((n for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.colorspace_settings.name!='Non-Color'),None)
  if not node:continue
  path=src/'Shared_Textures'/Path(node.image.filepath).name
  if id_=='building_2664':path=Path('/workspace/monroe-screenshot/delivery/textures/building_2664_Unified_Color.png')
  a=np.array(Image.open(path).convert('RGB'))
  if id_=='building_1673':
   rng=np.random.default_rng(44);noise=rng.integers(-3,4,(101,a.shape[1],1));a[:101]=np.clip(np.array([94,132,61])+noise,0,255);m.name='Woodson | grass roof and facade atlas';label='Grass roof material, no aerial roof screenshot.'
  elif id_=='building_2664':
   r,g,b=[a[:,:,i].astype(float) for i in range(3)];neutral=(np.max(a,2)-np.min(a,2)<32)&(a.mean(2)>155);a[neutral]=np.clip(np.array([235,235,228])+(a.mean(2)[neutral,None]-190)*.25,0,255).astype(np.uint8);m.name='Corner building | red brick and white columns';label='Red brick with white existing column/pilaster finish; geometry unchanged.'
  else:a[:101]=[235,236,230];m.name='Reference housing | white roof | '+id_;label='White flat roof finish from the supplied housing reference.'
  out=d/'Shared_Textures'/('Fixed_'+id_+'_Facade_Roof_Atlas.png');Image.fromarray(a).save(out);node.image=bpy.data.images.load(str(out),check_existing=False);node.image.pack();o.data.materials[0]=m;o['finish_update']=label
 for name in plan['retire']:
  o=bpy.data.objects.get(name)
  if o and active(o):bpy.data.objects.remove(o,do_unlink=True)
 col=bpy.data.collections.new('35_Repaired_Roads_Sidewalks_and_Fields');scene.collection.children.link(col);newobjects=[];vehicles=[]
 for r in plan['replacements']:
  mesh=bpy.data.meshes.new(r['name']);mesh.from_pydata(r['vertices'],[],r['faces']);mesh.update();mesh.materials.append(mats[r['material']]);o=bpy.data.objects.new(r['name'],mesh);col.objects.link(o);o['open_surface']=bool(r.get('open_surface'));o['repair']='Terrain-conforming, intersection-clipped editable surface';newobjects.append(o)
  if r['material'] not in ['grass','sports_grass','dirt','paint'] and not any(k in r['name'] for k in ['Sidewalk','Pedestrian']):vehicles.append(o)
 # Keep the small reference bleachers behind the restored dirt fan, not on the playing surface.
 small=bpy.data.objects.get('S_Woodson_Baseball_Small_Bleachers_B')
 if small:small.location.y-=7.
 # Project paint to actual repaired pavement. This prevents floating or buried striping on hills.
 vertices=[];faces=[]
 for o in vehicles+[o for o in scene.objects if active(o) and o.name.startswith('road_bridge')]:
  n=len(vertices);vertices.extend(o.matrix_world@v.co for v in o.data.vertices);faces.extend([n+i for i in p.vertices] for p in o.data.polygons)
 bvh=BVHTree.FromPolygons(vertices,faces)
 newnames={o.name for o in newobjects}
 for o in list(scene.objects):
  if not active(o) or o.name in newnames:continue
  if o.name.startswith(('S_','E_')):continue
  if not any(k in o.name for k in ['Crosswalk','Parking_Stripes','Parking_Markings','Lane_Parking_and_Crosswalk_Paint']):continue
  o.data=o.data.copy()
  for v in o.data.vertices:
   p=o.matrix_world@v.co;hit=bvh.ray_cast(Vector((p.x,p.y,1000)),Vector((0,0,-1)))[0]
   if hit:v.co.z=hit.z+.012
 # Remove source screenshot/reference backups from this clean delivery only. Previous ZIPs remain intact.
 for o in list(bpy.data.objects):
  if any(o.get(k) for k in ['_proposal_backup','_screenshot_backup','_variant_backup','_material_backup','_townhouse_backup']) or (o.type=='EMPTY' and o.empty_display_type=='IMAGE'):bpy.data.objects.remove(o,do_unlink=True)
 for cam in bpy.data.cameras:
  cam.background_images.clear()
 for key in list(scene.keys()):
  if 'screenshot' in key.lower() or 'imagery_manifest' in key.lower():del scene[key]
 for mesh in list(bpy.data.meshes):
  if mesh.users==0:bpy.data.meshes.remove(mesh)
 for mat in list(bpy.data.materials):
  if mat.users==0:bpy.data.materials.remove(mat)
 for group in list(bpy.data.node_groups):
  if group.users==0:bpy.data.node_groups.remove(group)
 for image in list(bpy.data.images):
  if image.users==0:bpy.data.images.remove(image)
 nonfacade=[]
 for o in scene.objects:
  if not active(o) or o.name.startswith('building_'):continue
  for m in o.data.materials:
   if m and m.use_nodes and any(n.type=='TEX_IMAGE' and n.image and Path(n.image.filepath).name not in {'Apartment_Courtyard_Brick.png'} for n in m.node_tree.nodes):nonfacade.append(o.name)
 assert not nonfacade,nonfacade
 fail=[n for n,h in before.items() if not bpy.data.objects.get(n) or digest(bpy.data.objects[n])!=h];assert not fail,fail
 working_images={n.image for o in scene.objects if active(o) for m in o.data.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image}
 for im in list(bpy.data.images):
  if im not in working_images and im.source=='FILE':bpy.data.images.remove(im,do_unlink=True)
 for im in working_images:
  if im.source=='FILE':
   path=d/'Shared_Textures'/Path(im.filepath).name
   if path.exists():
    if not im.packed_file:im.pack()
    usedfiles.add(path.name);im.filepath='//../Shared_Textures/'+path.name
 out=d/folder;out.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(out/(filename+'.blend')));bpy.ops.object.select_all(action='DESELECT');objects=[]
 for o in scene.objects:
  if active(o):o.select_set(True);objects.append(o)
 bpy.ops.export_scene.fbx(filepath=str(out/(filename+'.fbx')),use_selection=True,object_types={'MESH'},axis_forward='Y',axis_up='Z',apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',use_mesh_edges=False,path_mode='COPY',embed_textures=True,add_leaf_bones=False,use_custom_props=True)
 refs=[{'name':o.name,'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'triangles':sum(len(f.vertices)-2 for f in o.data.polygons),'materials':len(o.data.materials)} for o in objects];(w/(variant+'_reference.json')).write_text(json.dumps(refs));(d/'validation'/(variant+'_native_checks.json')).write_text(json.dumps({'passed':True,'building_geometry_unchanged':len(before),'building_hash_failures':fail,'working_meshes':len(objects),'nonfacade_image_materials':nonfacade,'white_roof_ids':sorted(white_ids),'native_skp_tested':False},indent=2));print('FIXED_EXPORTED',variant,len(objects),flush=True)
# Ship only textures actually used by the current models, not old terrain screenshots.
for p in (d/'Shared_Textures').iterdir():
 if p.is_file() and p.name not in usedfiles:p.unlink()
