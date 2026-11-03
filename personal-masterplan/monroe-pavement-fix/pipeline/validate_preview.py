import bpy,json,math,collections,hashlib,os
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
w=Path('/workspace/monroe-pavement-fix');d=w/'delivery';views=json.loads(Path('/workspace/monroe-road-redesign/cameras.json').read_text());reports={}
for variant,folder,name in [('existing','01_Original_Road_Layout','Monroe_Original_Road_Layout'),('proposed','02_New_Road_Layout','Monroe_New_Road_Layout')]:
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath=str(d/folder/(name+'.fbx')));scene=bpy.context.scene;objects={o.name:o for o in scene.objects if o.type=='MESH'};refs={r['name']:r for r in json.loads((w/(variant+'_reference.json')).read_text())};fail=[];errors=[]
 for name,r in refs.items():
  if name not in objects:fail.append(name+' missing');continue
  o=objects[name]
  if sum(len(f.vertices)-2 for f in o.data.polygons)!=r['triangles']:fail.append(name+' triangle count')
  if len(o.data.materials)!=r['materials']:fail.append(name+' material count')
  tree=KDTree(len(o.data.vertices))
  for i,v in enumerate(o.data.vertices):tree.insert(o.matrix_world@v.co,i)
  tree.balance();err=max((tree.find(Vector(p))[2] for p in r['points']),default=0);errors.append(err)
  if err>.0002:fail.append(name+' vertex displacement '+str(err))
 extras=sorted(set(objects)-set(refs));bodies=[o for o in objects.values() if not o.get('open_surface') and ( o.name.startswith('N_Neighborhood_Sidewalk') or o.name.startswith(('F_','C_','A_','O_','S_')) or (o.name.startswith('E_') and any(s in o.name for s in ['_Grass','_Dirt','Turf','Track_Surface'])))];openbodies=[]
 for o in bodies:
  c=collections.Counter()
  for f in o.data.polygons:
   v=list(f.vertices)
   for a,b in zip(v,v[1:]+v[:1]):c[tuple(sorted((a,b)))]+=1
  if any(n!=2 for n in c.values()):openbodies.append(o.name)
 terrain=[o for o in objects.values() if o.name.startswith('Terrain_')];terrainimages=[o.name for o in terrain if any(n.type=='TEX_IMAGE' for m in o.data.materials if m and m.use_nodes for n in m.node_tree.nodes)];buildings=[o for o in objects.values() if o.name.startswith('building_')];bleachers=[o.name for o in objects.values() if o.name.startswith('S_Bleachers_')];unpacked=[im.name for im in bpy.data.images if im.users and im.source=='FILE' and not im.packed_file]
 report={'passed':not fail and not extras and not openbodies and not terrainimages and len(buildings)==3155 and len(bleachers)==4 and not unpacked,'mesh_objects':len(objects),'building_meshes':len(buildings),'authorized_bleacher_replacements':bleachers,'max_fbx_point_error_m':max(errors),'failures':fail,'extra_objects':extras,'closed_new_pavement_sports_bodies':len(bodies),'open_bodies':openbodies,'terrain_still_using_aerial_images':terrainimages,'unpacked_used_images':unpacked,'native_skp_tested':False};(d/'validation'/(variant+'_fbx_checks.json')).write_text(json.dumps(report,indent=2));reports[variant]=report;print('VALIDATED',variant,report['passed'],'fail',len(fail),'open',len(openbodies),flush=True)
 assert report['passed'],str(report)[:1500]
 if os.environ.get('MONROE_VALIDATE_ONLY')=='1':continue
 world=bpy.data.worlds.new('Daylight');world.use_nodes=True;scene.world=world;world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.79,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6;bpy.ops.object.light_add(type='SUN');bpy.context.object.rotation_euler=(.35,-.45,-.6);bpy.context.object.data.energy=3;bpy.context.object.data.angle=.25;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=8;scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
 renderViews=[views[0],{'name':'15_garage_curb_fix','location':[-112,374,40],'target':[-86,376,21],'lens':42},{'name':'16_network_junction_fix','location':[-170,90,170],'target':[-65,170,32],'ortho':210},{'name':'17_baseball_smooth_boundary','location':[240,490,140],'target':[354,405,12],'ortho':135},{'name':'18_grass_roof_no_imagery','location':[180,590,280],'target':[440,375,15],'ortho':380},{'name':'19_housing_white_roofs_sidewalks','location':[190,110,180],'target':[70,290,24],'ortho':230},{'name':'20_corner_brick_white_columns','location':[-115,405,70],'target':[-45,458,18],'ortho':95}] if variant=='proposed' else [views[0],{'name':'21_original_60ft_parking','location':[90,280,150],'target':[-6,370,24],'ortho':190}]
 renderViews.append({'name':'22_school_facade_forecourt','location':[-74,377,85],'target':[-28,384,27],'ortho':82})
 for view in renderViews:
  bpy.ops.object.camera_add(location=view['location']);camera=bpy.context.object;direction=(Vector(view['target'])-camera.location).normalized();camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();camera.data.clip_end=10000
  if 'ortho' in view:camera.data.type='ORTHO';camera.data.ortho_scale=view['ortho'];camera.location-=direction*1500
  else:camera.data.lens=view['lens']
  scene.camera=camera;scene.render.filepath=str(d/'previews'/(variant+'_'+view['name']+'.png'));bpy.ops.render.render(write_still=True)
(d/'validation/both_versions_validation.json').write_text(json.dumps(reports,indent=2))
