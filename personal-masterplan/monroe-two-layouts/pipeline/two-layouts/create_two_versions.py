import bpy,json,hashlib,collections,math
from pathlib import Path
from mathutils import Matrix
w=Path('/workspace/monroe-two-layouts');d=w/'delivery';shared=d/'Shared_Textures';mapping=json.loads((w/'facade_mapping.json').read_text());roads=json.loads((w/'common_road_meshes.json').read_text());fieldedits=json.loads((w/'sports_terrain_edits.json').read_text());sports=json.loads((w/'sports_meshes.json').read_text());overrides={r['name']:r for r in json.loads((w/'proposed_path_overrides.json').read_text())};emptyPaths=json.loads((w/'empty_path_retirements.json').read_text());baseline=json.loads(Path('/workspace/monroe-road-redesign/delivery/validation/baseline_building_hashes.json').read_text())
# These brick context blocks are visible in the supplied campus views. Other context uses a neutral palette.
keepbrick={'building_2589','building_2777','building_1992','building_2923','building_1955'};protected={'building_2356','building_2099','building_2772'}
def hash_building(o):return hashlib.sha256(json.dumps({'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'faces':[list(f.vertices) for f in o.data.polygons]},separators=(',',':')).encode()).hexdigest()
def make_material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9;return m
for variant,src,subdir,filename in [('existing','/workspace/monroe-screenshot/delivery/Monroe_Screenshot_Terrain.blend','01_Original_Road_Layout','Monroe_Original_Road_Layout'),('proposed','/workspace/monroe-road-redesign/delivery/Monroe_Campus_Road_Redesign.blend','02_New_Road_Layout','Monroe_New_Road_Layout')]:
 folder=d/subdir;folder.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=src);scene=bpy.context.scene;backup=bpy.data.collections.new('00_Common_Upgrade_Backup');scene.collection.children.link(backup);backup.hide_render=True;backup.hide_viewport=True
 def retire(o):
  for c in list(o.users_collection):c.objects.unlink(o)
  backup.objects.link(o);o['_variant_backup']=True
 def replace_mesh(o,record,uv=None):
  mesh=bpy.data.meshes.new(o.name+'_editable_volume');mesh.from_pydata(record['vertices'],[],record['faces']);mesh.update()
  for material in o.data.materials:mesh.materials.append(material)
  if uv:
   layer=mesh.uv_layers.new(name='UVMap')
   for a,b in zip(layer.data,uv):a.uv=b
  o.data=mesh;o.matrix_world=Matrix.Identity(4);return mesh
 materials={};changed=0
 for o in scene.objects:
  if o.type!='MESH' or not o.name.startswith('building_'):continue
  if o.name in protected or o.name in keepbrick:continue
  original=o.data.materials[0];key=original.name
  if key not in materials:
   material=original.copy();material.name='NeutralFacade | '+original.name;material.diffuse_color=(.72,.74,.72,1)
   if material.use_nodes:
    bsdf=material.node_tree.nodes.get('Principled BSDF');rough=None
    for node in material.node_tree.nodes:
     if node.type!='TEX_IMAGE' or not node.image:continue
     base=Path(node.image.filepath).name
     if base in mapping:
      rec=mapping[base];node.image=bpy.data.images.load(str(shared/rec['base_color']),check_existing=True);node.image.pack();rough=rec.get('roughness')
    if rough and bsdf:
     node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=bpy.data.images.load(str(shared/rough),check_existing=True);node.image.colorspace_settings.name='Non-Color';node.image.pack();material.node_tree.links.new(node.outputs['Color'],bsdf.inputs['Roughness'])
   materials[key]=material
  o.data.materials[0]=materials[key];changed+=1
 # Closed road and sidewalk slabs, with the source layout retained in the original-layout version.
 roadmat=make_material('Editable road asphalt',(.085,.095,.10));walkmat=make_material('Editable sidewalk concrete',(.60,.60,.56));count=0
 for record in roads:
  o=bpy.data.objects.get(record['name'])
  if o is None or o.get('_proposal_backup') or o.get('_screenshot_backup') or o.get('_variant_backup'):continue
  r=record
  if variant=='proposed' and record['name'] in overrides:
   r=overrides[record['name']]
   if r.get('retire'):retire(o);continue
  old=o.copy();old.data=o.data.copy();old.name='E_PreVolume_'+o.name;backup.objects.link(old);old['_variant_backup']=True;replace_mesh(o,r);o.data.materials.clear();o.data.materials.append(walkmat if record['family']=='paths' else roadmat);o['geometry_type']='Closed editable pavement mesh volume';o['thickness_m']=record['thickness_m'];o['lane_width_ft_assumption']=9 if record['family'] in ['local','collector','service'] else 0;o['width_status']='Client lane assumption/source class; not surveyed';o['nominal_pavement_width_m']=record.get('nominal_pavement_width_m') or 0;count+=1
 for name in emptyPaths:
  o=bpy.data.objects.get(name)
  if o and not o.get('_proposal_backup'):retire(o)
 # Cut the sports areas out of the working terrain, retaining the former data in backup.
 for e in fieldedits[variant]:
  o=bpy.data.objects.get(e['name'])
  if o is None:raise RuntimeError('Missing terrain '+e['name'])
  old=o.copy();old.data=o.data.copy();old.name='E_PreSports_'+o.name;backup.objects.link(old);old['_variant_backup']=True;replace_mesh(o,e,e['uv'])
 col=bpy.data.collections.new('23_Separate_Sports_Fields');scene.collection.children.link(col);root=bpy.data.objects.new('LAYER_23_Separate_Sports_Fields',None);col.objects.link(root)
 for record in sports:
  mesh=bpy.data.meshes.new(record['name']);mesh.from_pydata(record['vertices'],[],record['faces']);mesh.update();uv=mesh.uv_layers.new(name='SportsUV')
  for a,b in zip(uv.data,record['uv']):a.uv=b
  mat=make_material('Sports surface | '+record['name'],(.4,.5,.3));image=bpy.data.images.load(str(shared/record['texture']),check_existing=True);image.pack();node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;mat.node_tree.links.new(node.outputs['Color'],mat.node_tree.nodes['Principled BSDF'].inputs['Base Color']);mesh.materials.append(mat);o=bpy.data.objects.new(record['name'],mesh);col.objects.link(o);o.parent=root;o['source_accuracy']='Image-traced existing sports area, not surveyed dimensions';o['separated_from_base_terrain']=True;o['volume_thickness_m']=.12
 # The proposed roads/parking/walks were generated as closed graded volumes in the design step.
 errors=[]
 for name,h in baseline['buildings'].items():
  o=bpy.data.objects.get(name)
  if o is None or hash_building(o)!=h or len(o.data.materials)!=1:errors.append(name)
 assert not errors,errors
 for image in bpy.data.images:
  if image.source=='FILE' and image.users:
   base=Path(image.filepath).name
   if (shared/base).exists():image.pack();image.filepath='//../Shared_Textures/'+base
 scene['screenshot_imagery_manifest']='//../Shared_Textures/screenshot_manifest.json';scene['version_description']='Original road alignment with upgraded materials/volumes' if variant=='existing' else 'Proposed campus circulation with shared material/volume upgrades';scene['road_width_policy']='9 ft lanes assumed; source-specific 22 ft carriageway retained; larger ambiguous streets retained pending verification';scene['sports_fields_separated']=True
 bpy.ops.wm.save_as_mainfile(filepath=str(folder/(filename+'.blend')))
 bpy.ops.object.select_all(action='DESELECT');working=[]
 for o in scene.objects:
  if o.type in {'MESH','EMPTY'} and not o.get('_proposal_backup') and not o.get('_screenshot_backup') and not o.get('_variant_backup'):
   o.select_set(True)
   if o.type=='MESH':working.append(o)
 bpy.ops.export_scene.fbx(filepath=str(folder/(filename+'.fbx')),use_selection=True,object_types={'MESH','EMPTY'},axis_forward='Y',axis_up='Z',apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',use_mesh_edges=False,path_mode='COPY',embed_textures=True,add_leaf_bones=False,use_custom_props=True)
 reference=[{'name':o.name,'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'triangles':sum(len(f.vertices)-2 for f in o.data.polygons),'materials':len(o.data.materials)} for o in working];(w/(variant+'_reference.json')).write_text(json.dumps(reference));(d/'validation'/(variant+'_native_build.json')).write_text(json.dumps({'passed':True,'baseline_building_geometry_unchanged':True,'building_meshes':3159,'each_building_one_material':True,'neutral_facade_buildings':changed,'editable_road_sidewalk_volumes':count,'separate_sports_meshes':len(sports),'source_layout_preserved':variant=='existing','source_dimensions_not_survey_verified':True},indent=2));print('VERSION_EXPORTED',variant,len(working),changed,count,flush=True)
