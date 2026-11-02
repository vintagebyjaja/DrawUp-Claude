import bpy,json,math,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
w=Path('/workspace/monroe-road-redesign');d=w/'delivery';proposal=json.loads((w/'proposal.json').read_text());views=json.loads((w/'cameras.json').read_text())
# Reopen editable master and verify all existing buildings against the baseline geometry hashes.
bpy.ops.wm.open_mainfile(filepath=str(d/'Monroe_Campus_Road_Redesign.blend'));baseline=json.loads((d/'validation/baseline_building_hashes.json').read_text());native_fail=[];uvref={}
for name,h in baseline['buildings'].items():
 o=bpy.data.objects.get(name)
 if o is None:native_fail.append(name+' missing');continue
 value={'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'faces':[list(f.vertices) for f in o.data.polygons]}
 if hashlib.sha256(json.dumps(value,separators=(',',':')).encode()).hexdigest()!=h:native_fail.append(name+' geometry')
 uv=o.data.uv_layers.active
 if uv:
  pairs=set(tuple(round(float(x),5) for x in (*(o.matrix_world@o.data.vertices[o.data.loops[i].vertex_index].co),*v.uv)) for i,v in enumerate(uv.data));uvref[name]=hashlib.sha256(json.dumps(sorted(pairs),separators=(',',':')).encode()).hexdigest()
assert not native_fail,native_fail
# Static FBX validation, used as the actual source of all proposal renders.
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath=str(d/'Monroe_Campus_Road_Redesign.fbx'));scene=bpy.context.scene;objects={o.name:o for o in scene.objects if o.type=='MESH'};refs=json.loads((w/'export_reference.json').read_text());expected={r['name']:r for r in refs};missing=set(expected)-set(objects);extra=set(objects)-set(expected);fail=[];maxerr=0.;buildingerr=0.;totaltri=0
for name,r in expected.items():
 if name not in objects:continue
 o=objects[name];count=sum(len(f.vertices)-2 for f in o.data.polygons);totaltri+=count
 if count!=r['triangles']:fail.append(name+' triangles')
 if len(o.data.materials)!=r['materials']:fail.append(name+' materials')
 tree=KDTree(len(o.data.vertices))
 for i,v in enumerate(o.data.vertices):tree.insert(o.matrix_world@v.co,i)
 tree.balance();error=max((tree.find(Vector(p))[2] for p in r['points']),default=0);maxerr=max(maxerr,error)
 if name.startswith('building_'):buildingerr=max(buildingerr,error)
 if name in uvref:
  uv=o.data.uv_layers.active;pairs=set(tuple(round(float(x),5) for x in (*(o.matrix_world@o.data.vertices[o.data.loops[i].vertex_index].co),*v.uv)) for i,v in enumerate(uv.data))
  if hashlib.sha256(json.dumps(sorted(pairs),separators=(',',':')).encode()).hexdigest()!=uvref[name]:fail.append(name+' building UV')
buildings=[o for o in objects.values() if o.name.startswith('building_')];multiple=[o.name for o in buildings if len(o.data.materials)!=1]
# Measure actual reimported road surface elevations along each designed centerline.
road=objects['P_Two_Way_Road_Network'];verts=[road.matrix_world@v.co for v in road.data.vertices];faces=[list(f.vertices) for f in road.data.polygons];tree=BVHTree.FromPolygons(verts,faces);grades={}
for name,r in proposal['profiles'].items():
 points=r['points'];samples=[]
 for x,y in points:
  hit=tree.ray_cast(Vector((x,y,1000)),Vector((0,0,-1)))[0];samples.append(hit.z if hit else None)
 values=[]
 for a,b,za,zb in zip(points,points[1:],samples,samples[1:]):
  if za is not None and zb is not None:
   ds=math.dist(a,b)
   if ds>.1:values.append(abs(zb-za)/ds)
 grades[name]={'maximum_sampled_mesh_grade':max(values,default=0),'missing_centerline_hits':sum(v is None for v in samples)}
# Confirm image dependencies from source context remain embedded and readable.
images=[{'name':im.name,'packed':bool(im.packed_file),'size':list(im.size)} for im in bpy.data.images if im.users and im.source=='FILE'];unpacked=[im['name'] for im in images if not im['packed']]
report={'passed':not missing and not extra and not fail and maxerr<.00015 and buildingerr<.00001 and len(buildings)==3159 and not multiple and not unpacked,'mesh_objects':len(objects),'triangles':totaltri,'missing_meshes':sorted(missing),'extra_meshes':sorted(extra),'failures':fail,'max_roundtrip_vertex_error_m':maxerr,'max_existing_building_vertex_error_m':buildingerr,'existing_building_meshes':len(buildings),'buildings_with_multiple_materials':multiple,'building_UV_preservation_checked':len(uvref),'native_existing_building_geometry_hash_failures':native_fail,'unpacked_used_images':unpacked,'packed_used_image_count':len(images),'actual_road_mesh_grades':grades,'native_FormIt_tested':False,'proposal_is_not_a_permit_or_survey_design':True}
(d/'validation/reimport_validation.json').write_text(json.dumps(report,indent=2));print('VALIDATION',json.dumps(report),flush=True);assert report['passed']
# Store a quick projected geometry set for downstream plan/prop checks, without altering the model.
(w/'actual_proposal_bounds.json').write_text(json.dumps({name:[[min((o.matrix_world@v.co)[i] for v in o.data.vertices) for i in range(3)],[max((o.matrix_world@v.co)[i] for v in o.data.vertices) for i in range(3)]] for name,o in objects.items() if name.startswith('P_')}))
world=bpy.data.worlds.new('Masterplan daylight');world.use_nodes=True;scene.world=world;world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.79,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6;bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.35,-.45,-.6);sun.data.energy=3;sun.data.angle=.25
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=8;scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
for view in views:
 bpy.ops.object.camera_add(location=view['location']);cam=bpy.context.object;direction=(Vector(view['target'])-cam.location).normalized();cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();cam.data.clip_end=10000
 if 'ortho' in view:cam.data.type='ORTHO';cam.data.ortho_scale=view['ortho'];cam.location-=direction*1500
 else:cam.data.lens=view['lens'];cam.data.clip_start=.1
 scene.camera=cam;scene.render.filepath=str(d/'previews'/(view['name']+'.png'));bpy.ops.render.render(write_still=True)
