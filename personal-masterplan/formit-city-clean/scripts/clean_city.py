import bpy,bmesh,json,shutil,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
w=Path('/workspace/formit-city-clean');d=w/'delivery';bpy.ops.wm.open_mainfile(filepath='/workspace/formit-city-layered/FormIt_City_Layered.blend');sc=bpy.context.scene
shutil.copytree('/workspace/formit-city-layered/delivery/textures',d/'textures',dirs_exist_ok=True)
t=bpy.data.objects['Original_tinMesh_Backup'];terrain=BVHTree.FromPolygons([v.co for v in t.data.vertices],[list(p.vertices) for p in t.data.polygons])
bpy.data.objects.remove(t,do_unlink=True)
if bpy.data.objects.get('Contours'):bpy.data.objects.remove(bpy.data.objects['Contours'],do_unlink=True)
sc.render.engine='CYCLES';sc.cycles.samples=1;sc.render.threads_mode='FIXED';sc.render.threads=8
names=['building_2356','building_2099','building_2772','building_2603','building_2664'];records=[]
for name in names:
 o=bpy.data.objects[name];m=o.data
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 # Weld coincident vertices without shifting the building or joining separate buildings.
 bm=bmesh.new();bm.from_mesh(m);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(m);bm.free();m.update()
 original=m.uv_layers.active;original.name='FacadeSourceUV';original.active_render=True
 grade=m.attributes.new('FacadeGrade','FLOAT','CORNER');maximum_grade=-1e6
 for p in m.polygons:
  heights=[]
  if abs(p.normal.z)<.5:
   vs=[o.matrix_world@m.vertices[i].co for i in p.vertices]
   for a,b in zip(vs,vs[1:]+vs[:1]):
    for j in range(11):
     v=a.lerp(b,j/10);hit=terrain.ray_cast(Vector((v.x,v.y,1000)),Vector((0,0,-1)))[0]
     if hit:heights.append(hit.z)
  z=max(heights)+.45 if heights else -1e5
  if heights and name=='building_2603':
   lo=min(v.co.z for v in m.vertices);height=max(v.co.z for v in m.vertices)-lo;fraction=(z-lo)/height;phase=fraction%0.2
   if .025<phase<.175:z=lo+(math.floor(fraction/.2)*.2+.175)*height
  if heights:maximum_grade=max(maximum_grade,z)
  for li in p.loop_indices:grade.data[li].value=z
 # Make the source appearance explicit and bake below-grade window suppression into an atlas.
 for i,slot in enumerate(o.material_slots):
  mat=slot.material.copy();slot.material=mat;nt=mat.node_tree;p=nt.nodes.get('Principled BSDF');old=p.inputs['Base Color'];source=old.links[0].from_socket if old.is_linked else None
  for n in list(nt.nodes):
   if n.type=='TEX_IMAGE':
    uv=nt.nodes.new('ShaderNodeUVMap');uv.uv_map='FacadeSourceUV';nt.links.new(uv.outputs['UV'],n.inputs['Vector'])
  position=nt.nodes.new('ShaderNodeNewGeometry');sep=nt.nodes.new('ShaderNodeSeparateXYZ');nt.links.new(position.outputs['Position'],sep.inputs[0]);attr=nt.nodes.new('ShaderNodeAttribute');attr.attribute_name='FacadeGrade';less=nt.nodes.new('ShaderNodeMath');less.operation='LESS_THAN';nt.links.new(sep.outputs['Z'],less.inputs[0]);nt.links.new(attr.outputs['Fac'],less.inputs[1]);mix=nt.nodes.new('ShaderNodeMixRGB');nt.links.new(less.outputs[0],mix.inputs[0]);mix.inputs[1].default_value=old.default_value
  if source:nt.links.new(source,mix.inputs[1])
  mix.inputs[2].default_value=(.52,.39,.27,1) if name=='building_2603' else (.42,.21,.12,1)
  emit=nt.nodes.new('ShaderNodeEmission');nt.links.new(mix.outputs[0],emit.inputs[0]);nt.links.new(emit.outputs[0],nt.nodes.get('Material Output').inputs['Surface'])
 atlas=m.uv_layers.new(name='BuildingAtlasUV');m.uv_layers.active=atlas
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.1519,island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
 # Original UV remains render source; bake target is selected UV map.
 image=bpy.data.images.new(name+'_Unified_Color',width=2048,height=2048,alpha=False)
 for mat in m.materials:
  node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;mat.node_tree.nodes.active=node;node.select=True
 sc.render.bake.margin=12;sc.render.bake.use_clear=True
 bpy.ops.object.bake(type='EMIT',uv_layer='BuildingAtlasUV')
 image.filepath_raw=str(d/'textures'/(name+'_Unified_Color.png'));image.file_format='PNG';image.save();image.pack()
 mat=bpy.data.materials.new(name+' | ONE selectable textured mass');mat.use_nodes=True;p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.8;node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;uv=mat.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='BuildingAtlasUV';mat.node_tree.links.new(uv.outputs['UV'],node.inputs['Vector']);mat.node_tree.links.new(node.outputs['Color'],p.inputs['Base Color']);m.materials.clear();m.materials.append(mat)
 for p in m.polygons:p.material_index=0
 for uvname in [uv.name for uv in m.uv_layers if uv.name!='BuildingAtlasUV']:m.uv_layers.remove(m.uv_layers[uvname])
 m.uv_layers.active_index=0;m.uv_layers[0].active_render=True;o['Facade_grade_treatment']='Window-free masonry below maximum sampled terrain along each wall plus 0.45m; apartment cutoff snapped above intersected window rows; source mass and terrain unchanged. Estimated finish.';records.append({'building':name,'materials':1,'mesh_objects':1,'maximum_wall_grade_cutoff_m':maximum_grade,'vertex_count':len(m.vertices)})
 print('BAKED',name,flush=True)
# Remove loose line-only geometry; preserve terrain and all source surfaces.
removed=0
for o in list(sc.objects):
 if o.type!='MESH':continue
 bm=bmesh.new();bm.from_mesh(o.data);edges=[e for e in bm.edges if not e.link_faces];removed+=len(edges)
 if edges:bmesh.ops.delete(bm,geom=edges,context='EDGES')
 bm.to_mesh(o.data);bm.free();o.show_wire=False;o.show_all_edges=False
 # Strip unused material slots that can produce empty submeshes.
 if o.name not in names:
  used=sorted(set(p.material_index for p in o.data.polygons));mats=[o.data.materials[i] for i in used if i<len(o.data.materials)];mapping={k:i for i,k in enumerate(used)};indices=[mapping[p.material_index] for p in o.data.polygons]
  if mats:
   o.data.materials.clear()
   for mat in mats:o.data.materials.append(mat)
   for p,i in zip(o.data.polygons,indices):p.material_index=i
for image in bpy.data.images:
 if image.source=='FILE' and image.users:
  path=d/'textures'/Path(image.filepath).name
  if path.exists():image.filepath=str(path);image.pack()
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(d/'FormIt_City_Clean_Massing.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in sc.objects:
 if o.type in {'MESH','EMPTY'}:o.select_set(True)
bpy.ops.export_scene.fbx(filepath=str(d/'FormIt_City_Clean_Massing.fbx'),use_selection=True,object_types={'MESH','EMPTY'},axis_forward='Y',axis_up='Z',apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',use_mesh_edges=False,path_mode='COPY',embed_textures=True,add_leaf_bones=False,use_custom_props=True)
report={'detailed_buildings':records,'removed_loose_edges':removed,'contours_exported':False,'terrain_moved':False,'buildings_moved':False,'FormIt_runtime_tested':False,'limitations':['FormIt may display mesh triangle edges: turn off Edges in Visual Styles; FBX cannot set this application display preference.','One mesh and one material per detailed building; native FormIt solid/group selection behavior requires checking in FormIt.','Grade-aware masonry is an estimated facade treatment, not surveyed floor elevations.']};(d/'validation/cleanup.json').write_text(json.dumps(report,indent=2));print('EXPORT_DONE',flush=True)
