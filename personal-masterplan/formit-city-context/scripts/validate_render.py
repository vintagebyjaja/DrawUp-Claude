import bpy,json,hashlib,collections
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
w=Path('/workspace/formit-city-context');d=w/'delivery'
bpy.ops.wm.open_mainfile(filepath=str(d/'FormIt_City_Neighborhood_Context.blend'))
expected={o.name:{'points':[tuple(o.matrix_world@v.co) for v in o.data.vertices],'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'materials':len(o.data.materials)} for o in bpy.context.scene.objects if o.type=='MESH'}
uvref={}
for o in bpy.context.scene.objects:
 if o.type=='MESH' and (o.data.uv_layers.get('BuildingAtlasUV') or o.data.uv_layers.get('ContextAtlasUV')):
  uvref[o.name]=sorted(set(tuple(round(x,5) for x in (*o.data.vertices[o.data.loops[i].vertex_index].co,*v.uv)) for i,v in enumerate(o.data.uv_layers.active.data)))
original=json.loads(Path('/workspace/formit-city-layered/delivery/validation/geometry_reference.json').read_text());original={r['name']:r for r in original if r['name']!='Contours'}
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath=str(d/'FormIt_City_Neighborhood_Context.fbx'));sc=bpy.context.scene;observed={o.name:o for o in sc.objects if o.type=='MESH'};fail=[];error=0;source_error=0
for name,r in expected.items():
 o=observed.get(name)
 if o is None:fail.append(name+' missing');continue
 if sum(len(p.vertices)-2 for p in o.data.polygons)!=r['triangles']:fail.append(name+' triangle count')
 if len(o.data.materials)!=r['materials']:fail.append(name+' materials')
 tree=KDTree(len(o.data.vertices))
 for i,v in enumerate(o.data.vertices):tree.insert(o.matrix_world@v.co,i)
 tree.balance()
 for p in r['points']:error=max(error,tree.find(Vector(p))[2])
 if name not in {'road_local_261','road_local_203'}:
  for p in original[name]['points']:source_error=max(source_error,tree.find(Vector(p))[2])
 if name in uvref:
  uv=o.data.uv_layers.active
  actual=sorted(set(tuple(round(x,5) for x in (*o.data.vertices[o.data.loops[i].vertex_index].co,*v.uv)) for i,v in enumerate(uv.data)))
  if actual!=uvref[name] or len(o.data.uv_layers)!=1:fail.append(name+' atlas UV mismatch')
 for image in [n.image for mat in o.data.materials if mat.use_nodes for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image]:
  if not image.packed_file:fail.append(name+' unpacked texture')
buildings=[o for o in observed.values() if o.name.startswith('building_')];multi=[o.name for o in buildings if len(o.data.materials)!=1];loose=sum(sum(e.is_loose for e in o.data.edges) for o in observed.values());terr=[o for o in observed.values() if o.name.startswith('Terrain_')]
report={'passed':not fail and error<1e-5 and source_error<.00002 and not multi and loose==0,'meshes':len(observed),'buildings':len(buildings),'buildings_with_multiple_materials':multi,'missing_meshes':sorted(set(expected)-set(observed)),'extra_meshes':sorted(set(observed)-set(expected)),'failures':fail,'max_roundtrip_vertex_error_m':error,'max_source_to_cleaned_vertex_error_m':source_error,'loose_edges':loose,'contours_present':'Contours' in observed,'terrain_min_z_m':min((o.matrix_world@v.co).z for o in terr for v in o.data.vertices),'terrain_triangle_count':sum(len(o.data.polygons) for o in terr),'intentionally_width_corrected_roads':['road_local_261','road_local_203'],'native_FormIt_tested':False}
(d/'validation/reimport.json').write_text(json.dumps(report,indent=2));print('VALIDATION',json.dumps(report),flush=True)
assert report['passed']
roadgeo={}
for name in ['road_local_261','road_local_203']:
 o=observed[name];roadgeo[name]={'vertices':[list(o.matrix_world@v.co) for v in o.data.vertices],'faces':[list(p.vertices) for p in o.data.polygons]}
(w/'reimported_road_geometry.json').write_text(json.dumps(roadgeo))

world=bpy.data.worlds.new('Daylight');world.use_nodes=True;sc.world=world;world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.79,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6
bpy.ops.object.light_add(type='SUN');bpy.context.object.rotation_euler=(.35,-.45,-.6);bpy.context.object.data.energy=3;bpy.context.object.data.angle=.2
sc.render.engine='CYCLES';sc.cycles.samples=16;sc.cycles.use_denoising=False;sc.render.threads_mode='FIXED';sc.render.threads=8;sc.render.resolution_x=1400;sc.render.resolution_y=1050;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.view_settings.view_transform='AgX'
for name,loc,target,scale in [('01_neighborhood_context',(-300,80,260),(-25,372,28),520),('02_nearby_buildings',(-245,245,100),(-130,380,26),200),('03_full_city',(0,-850,1450),(0,0,25),1850)]:
 bpy.ops.object.camera_add(location=loc);cam=bpy.context.object;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=scale;cam.data.clip_end=10000;sc.camera=cam;sc.render.filepath=str(d/'previews'/(name+'.png'));bpy.ops.render.render(write_still=True)
