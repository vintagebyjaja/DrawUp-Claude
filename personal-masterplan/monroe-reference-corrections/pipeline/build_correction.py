import bpy,json,hashlib,shutil
from pathlib import Path
import numpy as np
from PIL import Image
import sys
sys.path.insert(0,'/workspace/monroe-townhouse-correction/scripts')
from apartment_details import add_details
from shared_facilities import add_shared
w=Path('/workspace/monroe-townhouse-correction');d=w/'delivery';src=Path('/workspace/monroe-material-update/delivery');shutil.copytree(src/'Shared_Textures',d/'Shared_Textures',dirs_exist_ok=True);plan=json.loads((w/'driveway_geometry.json').read_text());targets={'building_3031','building_2591','building_2391','building_2395','building_2724','building_3130'}
def working(o):return o.type=='MESH' and not any(o.get(k) for k in ['_proposal_backup','_screenshot_backup','_variant_backup','_material_backup','_townhouse_backup'])
def hash_obj(o):return hashlib.sha256(json.dumps({'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'faces':[list(f.vertices) for f in o.data.polygons]},separators=(',',':')).encode()).hexdigest()
for variant,folder,name in [('existing','01_Original_Road_Layout','Monroe_Original_Road_Layout'),('proposed','02_New_Road_Layout','Monroe_New_Road_Layout')]:
 bpy.ops.wm.open_mainfile(filepath=str(src/folder/(name+'.blend')));scene=bpy.context.scene;scene['comparison_policy']='Identical buildings and shared context/site details; only campus site circulation differs';before={o.name:hash_obj(o) for o in scene.objects if working(o) and o.name.startswith('building_')};backup=bpy.data.collections.new('00_Townhouse_Driveway_Backup');scene.collection.children.link(backup);backup.hide_render=True;backup.hide_viewport=True
 def retire(o):
  for c in list(o.users_collection):c.objects.unlink(o)
  backup.objects.link(o);o['_townhouse_backup']=True
 def material(label,color):
  m=bpy.data.materials.new(label);m.diffuse_color=(*color,1);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9;return m
 mats={'paint':material('Existing parking stripes',(.90,.91,.86)),'concrete':material('Townhouse rear drive | concrete',(.66,.65,.60)),'asphalt':material('Retained road asphalt',(.085,.095,.1))};cache={}
 for id_ in sorted(targets):
  o=bpy.data.objects[id_];old=o.data.materials[0]
  if old.name not in cache:
   m=old.copy();m.name='Reference correction | white townhouse | '+old.name;m.diffuse_color=(.82,.81,.77,1)
   for node in m.node_tree.nodes:
    if node.type!='TEX_IMAGE' or not node.image or node.image.colorspace_settings.name=='Non-Color':continue
    base=Path(node.image.filepath).name;input_=src/'Shared_Textures'/base
    if not input_.exists():continue
    a=np.array(Image.open(input_).convert('RGB'));r,g,b=[a[:,:,i].astype(float) for i in range(3)];mask=(r>g*1.025)&(r>b*1.055)&(r>90);mask[:205]=False;lum=a.mean(2);median=np.median(lum[mask]) if mask.any() else 150;colors=np.clip(np.array([232,232,225])+(lum-median)[:,:,None]*.38,0,255).astype(np.uint8);a[mask]=colors[mask];a[110:191]=[192,194,189];filename='Townhouse_White_'+base;Image.fromarray(a).save(d/'Shared_Textures'/filename);node.image=bpy.data.images.load(str(d/'Shared_Textures'/filename),check_existing=True);node.image.pack()
   cache[old.name]=m
  o.data.materials[0]=cache[old.name];o['facade_evidence_status']='User-identified white/light townhouse row in supplied oblique reference. Source geometry preserved.'
 if variant=='proposed':
  for r in plan['proposed_access_revision']['meshes']:
   o=bpy.data.objects.get(r['name'])
   if not o:raise RuntimeError('Missing proposed surface '+r['name'])
   mesh=bpy.data.meshes.new(o.name+'_access_revision');mesh.from_pydata(r['vertices'],[],r['faces']);mesh.update()
   for mat_ in o.data.materials:mesh.materials.append(mat_)
   o.data=mesh
 col=bpy.data.collections.new('28_Townhouse_Concrete_Driveway');scene.collection.children.link(col)
 featurecols={}
 for label in ['29_Apartment_Courtyard_and_Garage','30_Original_Campus_Pavement','31_Measured_Lincoln_Street','32_Woodson_Recreation','33_Kelly_Miller_Recreation','34_Neighborhood_Path_Corrections']:
  featurecols[label]=bpy.data.collections.new(label);scene.collection.children.link(featurecols[label])
 def add(r):
  mesh=bpy.data.meshes.new(r['name']);mesh.from_pydata(r['vertices'],[],r['faces']);mesh.update();mesh.materials.append(mats[r['material']]);o=bpy.data.objects.new(r['name'],mesh)
  label='29_Apartment_Courtyard_and_Garage' if r['name'].startswith('A_') else '30_Original_Campus_Pavement' if r['name'].startswith('O_') else '31_Measured_Lincoln_Street' if 'Lincoln' in r['name'] else '32_Woodson_Recreation' if r['name'].startswith('S_Woodson') else '33_Kelly_Miller_Recreation' if r['name'].startswith('S_Kelly') else '34_Neighborhood_Path_Corrections' if r['name'].startswith('N_') or 'Footpath' in r['name'] else None
  (featurecols[label] if label else col).objects.link(o);o['source_accuracy']='Reference-supported site surface/detail; dimensions approximate. See feature validation notes.';return o
 for e in plan['road_edits']+[{'name':plan['lincoln_33ft']['retire_road'],'parts':[]}]+plan['all_sidewalk_edits'][variant]+(plan['original_paving']['road_edits'] if variant=='existing' else plan['proposed_access_revision']['legacy_path_edits'])+[{'name':n,'parts':[]} for n in plan['lincoln_33ft']['retire_crosswalks']]:
  o=bpy.data.objects.get(e['name'])
  if o and working(o):
   retire(o)
   for r in e.get('parts',[]):add(r)
 for r in plan['driveway']+plan['lincoln_33ft']['meshes']+plan['lincoln_33ft']['crosswalk_meshes']:add(r)
 if variant=='existing':
  for r in plan['original_paving']['meshes']:add(r)
 # Remove old ground and proposed lawn only beneath the photographed apartment site features.
 for e in json.loads((w/'site_ground_edits.json').read_text())[variant]:
  o=bpy.data.objects[e['name']];mesh=bpy.data.meshes.new(o.name+'_courtyard_apron_cut');mesh.from_pydata(e['vertices'],[],e['faces']);mesh.update()
  for material_ in o.data.materials:mesh.materials.append(material_)
  if e['uv'] is not None:
   uv=mesh.uv_layers.new(name='UVMap')
   for a,b in zip(uv.data,e['uv']):a.uv=b
  o.data=mesh
 apartment_details=add_details(w,d,col,mats,add)
 recreation=add_shared(w,d,mats,add,working)
 (d/'validation'/(variant+'_recreation_details.json')).write_text(json.dumps(recreation,indent=2))
 (d/'validation'/(variant+'_apartment_details.json')).write_text(json.dumps(apartment_details,indent=2))
 fail=[name for name,h in before.items() if hash_obj(bpy.data.objects[name])!=h];assert not fail,fail
 for im in bpy.data.images:
  if im.source=='FILE' and im.users:
   p=d/'Shared_Textures'/Path(im.filepath).name
   if p.exists():
    if not im.packed_file:im.pack()
    im.filepath='//../Shared_Textures/'+p.name
 out=d/folder;out.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(out/(name+'.blend')));bpy.ops.object.select_all(action='DESELECT');objects=[]
 for o in scene.objects:
  if working(o):o.select_set(True);objects.append(o)
 bpy.ops.export_scene.fbx(filepath=str(out/(name+'.fbx')),use_selection=True,object_types={'MESH'},axis_forward='Y',axis_up='Z',apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',use_mesh_edges=False,path_mode='COPY',embed_textures=True,add_leaf_bones=False,use_custom_props=True)
 refs=[{'name':o.name,'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'triangles':sum(len(f.vertices)-2 for f in o.data.polygons),'materials':len(o.data.materials)} for o in objects];(w/(variant+'_reference.json')).write_text(json.dumps(refs));(d/'validation'/(variant+'_native_checks.json')).write_text(json.dumps({'passed':True,'unchanged_buildings':len(before),'building_hash_failures':fail,'white_townhouse_source_pieces':sorted(targets),'working_meshes':len(objects),'driveway_objects':[r['name'] for r in plan['driveway']],'native_skp_export_available':False},indent=2));print('CORRECTION_EXPORTED',variant,len(objects),flush=True)
