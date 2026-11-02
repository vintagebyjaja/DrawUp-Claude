import bpy,json,hashlib,math,collections
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
w=Path('/workspace/monroe-two-layouts');d=w/'delivery';baseline=json.loads(Path('/workspace/monroe-road-redesign/delivery/validation/baseline_building_hashes.json').read_text());proposal=json.loads(Path('/workspace/monroe-road-redesign/proposal.json').read_text());views=json.loads(Path('/workspace/monroe-road-redesign/cameras.json').read_text());reports={}
for variant,folder,filename in [('existing','01_Original_Road_Layout','Monroe_Original_Road_Layout'),('proposed','02_New_Road_Layout','Monroe_New_Road_Layout')]:
 bpy.ops.wm.open_mainfile(filepath=str(d/folder/(filename+'.blend')));failnative=[]
 for name,h in baseline['buildings'].items():
  o=bpy.data.objects.get(name)
  if not o:failnative.append(name);continue
  payload={'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'faces':[list(f.vertices) for f in o.data.polygons]}
  if hashlib.sha256(json.dumps(payload,separators=(',',':')).encode()).hexdigest()!=h or len(o.data.materials)!=1:failnative.append(name)
 assert not failnative,failnative
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath=str(d/folder/(filename+'.fbx')));scene=bpy.context.scene;objects={o.name:o for o in scene.objects if o.type=='MESH'};refs={r['name']:r for r in json.loads((w/(variant+'_reference.json')).read_text())};missing=sorted(set(refs)-set(objects));extra=sorted(set(objects)-set(refs));fail=[];maxerr=0;buildingerr=0
 for name,r in refs.items():
  if name not in objects:continue
  o=objects[name]
  if sum(len(f.vertices)-2 for f in o.data.polygons)!=r['triangles']:fail.append(name+' triangle count')
  if len(o.data.materials)!=r['materials']:fail.append(name+' material count')
  tree=KDTree(len(o.data.vertices))
  for i,v in enumerate(o.data.vertices):tree.insert(o.matrix_world@v.co,i)
  tree.balance();error=max((tree.find(Vector(p))[2] for p in r['points']),default=0);maxerr=max(maxerr,error)
  if name.startswith('building_'):buildingerr=max(buildingerr,error)
 bodies=[o for o in objects.values() if o.name.startswith('road_') or o.name in ['P_Two_Way_Road_Network','P_Visitor_Staff_Parking','P_Resident_Parallel_Parking','P_Accessible_Paths_and_Sidewalks'] or o.name in ['E_Baseball_Field','E_Football_Field','E_Running_Track','E_Woodson_Baseball_Practice_Field']];openbodies=[]
 for o in bodies:
  counts=collections.Counter()
  for p in o.data.polygons:
   v=list(p.vertices)
   for a,b in zip(v,v[1:]+v[:1]):counts[tuple(sorted((a,b)))]+=1
  bad=sum(c!=2 for c in counts.values())
  if bad:openbodies.append({'name':o.name,'non_two_face_edges':bad})
 buildings=[o for o in objects.values() if o.name.startswith('building_')];unpacked=[im.name for im in bpy.data.images if im.users and im.source=='FILE' and not im.packed_file];sports=[o.name for o in objects.values() if o.name in ['E_Baseball_Field','E_Football_Field','E_Running_Track','E_Woodson_Baseball_Practice_Field']]
 report={'passed':not missing and not extra and not fail and maxerr<.0002 and buildingerr<1e-5 and len(buildings)==3159 and not openbodies and len(sports)==4 and not unpacked,'mesh_objects':len(objects),'building_meshes':len(buildings),'building_native_hash_failures':failnative,'max_building_vertex_error_m':buildingerr,'max_any_mesh_roundtrip_error_m':maxerr,'missing_meshes':missing,'extra_meshes':extra,'failures':fail,'editable_closed_pavement_and_sports_bodies':len(bodies),'open_pavement_or_sports_bodies':openbodies,'separate_sports_objects':sports,'unpacked_used_images':unpacked,'native_FormIt_checked':False,'width_schedule_is_client_assumptions_not_survey':True}
 if variant=='proposed':
  road=objects['P_Two_Way_Road_Network'];tree=BVHTree.FromPolygons([road.matrix_world@v.co for v in road.data.vertices],[list(f.vertices) for f in road.data.polygons]);grades={}
  for name,r in proposal['profiles'].items():
   z=[]
   for x,y in r['points']:
    hit=tree.ray_cast(Vector((x,y,1000)),Vector((0,0,-1)))[0];z.append(hit.z if hit else None)
   slopes=[abs(b-a)/math.dist(p,q) for a,b,p,q in zip(z,z[1:],r['points'],r['points'][1:]) if a is not None and b is not None and math.dist(p,q)>.1];grades[name]={'max_actual_mesh_grade':max(slopes,default=0),'samples_on_retained_public_street_not_new_mesh':sum(v is None for v in z)}
  report['proposed_road_mesh_grade_checks']=grades
 reports[variant]=report;(d/'validation'/(variant+'_export_validation.json')).write_text(json.dumps(report,indent=2));print('VALIDATED',variant,json.dumps(report),flush=True)
 # Keep rendering even if a local source geometry issue is reported; final completion still requires a passing check.
 if not report['passed']:raise AssertionError('Validation issue: see '+variant+'_export_validation.json')
 world=bpy.data.worlds.new('Comparison daylight');world.use_nodes=True;scene.world=world;world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.79,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6;bpy.ops.object.light_add(type='SUN');bpy.context.object.rotation_euler=(.35,-.45,-.6);bpy.context.object.data.energy=3;bpy.context.object.data.angle=.25
 scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=8;scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
 renderViews=views if variant=='proposed' else views[:1]
 for view in renderViews:
  bpy.ops.object.camera_add(location=view['location']);camera=bpy.context.object;direction=(Vector(view['target'])-camera.location).normalized();camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();camera.data.clip_end=10000
  if 'ortho' in view:camera.data.type='ORTHO';camera.data.ortho_scale=view['ortho'];camera.location-=direction*1500
  else:camera.data.lens=view['lens'];camera.data.clip_start=.1
  scene.camera=camera;scene.render.filepath=str(d/'previews'/(variant+'_'+view['name']+'.png'));bpy.ops.render.render(write_still=True)
 if variant=='existing':
  # Diagnostic colors expose separate sports objects; only this preview changes their display materials.
  for name,color in [('E_Baseball_Field',(.12,.40,.055)),('E_Football_Field',(.08,.36,.12)),('E_Running_Track',(.43,.065,.045)),('E_Woodson_Baseball_Practice_Field',(.22,.43,.08))]:
   m=bpy.data.materials.new('DIAGNOSTIC '+name);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1);objects[name].data.materials.clear();objects[name].data.materials.append(m)
  bpy.ops.object.camera_add(location=(0,-620,1180));cam=bpy.context.object;cam.rotation_euler=(Vector((120,250,10))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1100;cam.data.clip_end=10000;scene.camera=cam;scene.render.filepath=str(d/'previews/sports_layers_diagnostic.png');bpy.ops.render.render(write_still=True)
(d/'validation/both_versions_validation.json').write_text(json.dumps(reports,indent=2))
