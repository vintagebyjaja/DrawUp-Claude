import bpy,sys,json,math,hashlib,collections
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from lod_screenshots import update
w=Path('/workspace/monroe-screenshot');d=w/'delivery';manifest=json.loads((d/'textures/screenshot_manifest.json').read_text());plan=json.loads(Path('/workspace/monroe-hd/delivery/imagery_plan.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(d/'Monroe_Screenshot_Terrain.blend'));update(camera_position=(-20,380,90),force=True);near=sum(n.image and n.image.filepath.endswith('_ground.jpg') for m in bpy.data.materials if m.name.startswith('Screenshot ground | ') for n in m.node_tree.nodes if n.type=='TEX_IMAGE');assert near>0;update(camera_position=(10000,10000,10000),force=True);far=sum(n.image and n.image.filepath.endswith('_ground.jpg') for m in bpy.data.materials if m.name.startswith('Screenshot ground | ') for n in m.node_tree.nodes if n.type=='TEX_IMAGE');assert far==0
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath=str(d/'Monroe_Screenshot_Terrain.fbx'));scene=bpy.context.scene;observed={o.name:o for o in scene.objects if o.type=='MESH'};reference=json.loads((w/'export_reference.json').read_text());expected={r['name']:r for r in reference};missing=set(expected)-set(observed);extra=set(observed)-set(expected);fail=[];maxerr=0;triangles=0
for name,r in expected.items():
 if name not in observed:continue
 o=observed[name];count=sum(len(p.vertices)-2 for p in o.data.polygons);triangles+=count
 if count!=r['triangles']:fail.append(name+' triangle count')
 if len(o.data.materials)!=r['materials']:fail.append(name+' material count')
 tree=KDTree(len(o.data.vertices))
 for i,v in enumerate(o.data.vertices):tree.insert(o.matrix_world@v.co,i)
 tree.balance()
 for p in r['points']:maxerr=max(maxerr,tree.find(Vector(p))[2])
 if r['uv']:
  uv=o.data.uv_layers.active
  if not uv or len(o.data.uv_layers)!=1:fail.append(name+' UV layer count')
# Validate the actual tiled surface against the original source TIN planes.
geo=json.loads((w/'registration_geometry.json').read_text());vs=[];fs=[]
for tri in geo['terrain']:
 start=len(vs);vs.extend(tri['points']);fs.append([start,start+1,start+2])
source=BVHTree.FromPolygons(vs,fs,all_triangles=True);terrain=[o for o in observed.values() if o.name.startswith('Terrain_')];surface_error=0
for o in terrain:
 for v in o.data.vertices:
  hit=source.find_nearest(o.matrix_world@v.co)
  if hit[0] is None:fail.append('missing source terrain surface')
  else:surface_error=max(surface_error,hit[3])
# Every high tile must be present and readable from the static FBX.
textures=[]
for mat in bpy.data.materials:
 if mat.name.startswith('Screenshot ground | '):
  node=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE');textures.append({'material':mat.name,'image':node.image.name,'packed':bool(node.image.packed_file),'pixels':list(node.image.size)})
  if not node.image.packed_file:fail.append(mat.name+' unpacked image')
if len(textures)!=16:fail.append('16 tile textures required')
buildings=[o for o in observed.values() if o.name.startswith('building_')];multiple=[o.name for o in buildings if len(o.data.materials)!=1];loose=sum(sum(e.is_loose for e in o.data.edges) for o in observed.values());minz=min((o.matrix_world@v.co).z for o in terrain for v in o.data.vertices)
report={'passed':not missing and not extra and not fail and maxerr<1e-5 and surface_error<.0002 and not multiple and len(buildings)==3159 and loose==0,'mesh_count':len(observed),'building_meshes':len(buildings),'buildings_with_multiple_materials':multiple,'missing_meshes':sorted(missing),'extra_meshes':sorted(extra),'failures':fail,'max_FBX_roundtrip_vertex_error_m':maxerr,'max_tiled_terrain_deviation_from_original_surface_m':surface_error,'terrain_min_z_m':minz,'triangles':triangles,'loose_edges':loose,'actual_high_tile_images_packed_in_FBX':textures,'native_LOD_test':{'near_camera_high_tiles':near,'far_camera_high_tiles':far,'passed':near>0 and far==0},'screenshot_coverage_fraction':manifest['screenshot_coverage_fraction'],'Google_screenshot_alignment_is_approximate':True,'native_FormIt_tested':False}
(d/'validation/reimport_report.json').write_text(json.dumps(report,indent=2));print('REIMPORT_VALIDATION',json.dumps({k:v for k,v in report.items() if k!='actual_high_tile_images_packed_in_FBX'}),flush=True);assert report['passed']
# Same saved cameras, lighting and render settings as baseline renders.
world=bpy.data.worlds.new('Comparison daylight');world.use_nodes=True;scene.world=world;world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.79,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6;bpy.ops.object.light_add(type='SUN');bpy.context.object.rotation_euler=(.35,-.45,-.6);bpy.context.object.data.energy=3;bpy.context.object.data.angle=.2
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=8;scene.render.resolution_x=1400;scene.render.resolution_y=1050;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
for view in plan['cameras']:
 bpy.ops.object.camera_add(location=view['location']);cam=bpy.context.object;cam.rotation_euler=(Vector(view['target'])-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=view['ortho_scale'];cam.data.clip_end=10000;scene.camera=cam;scene.render.filepath=str(d/'previews'/('after_'+view['name']+'.png'));bpy.ops.render.render(write_still=True)
