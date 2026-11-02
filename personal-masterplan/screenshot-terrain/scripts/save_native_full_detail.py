import bpy,json
from mathutils import Vector
from pathlib import Path
w=Path('/workspace/monroe-screenshot/delivery');manifest=json.loads((w/'textures/screenshot_manifest.json').read_text());bpy.ops.wm.open_mainfile(filepath=str(w/'Monroe_Screenshot_Terrain.blend'))
for tile in manifest['tiles']:
 mat=bpy.data.materials['Screenshot ground | '+tile['id']];node=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE');image=bpy.data.images.load(str(w/'textures'/tile['high']),check_existing=True);image.pack();image.filepath='//textures/'+tile['high'];node.image=image
for image in list(bpy.data.images):
 if image.users==0 and image.name.endswith('_overview.jpg'):bpy.data.images.remove(image)
scene=bpy.context.scene;plan=json.loads(Path('/workspace/monroe-hd/delivery/imagery_plan.json').read_text());col=bpy.data.collections.get('12_Cameras_and_Lighting') or bpy.data.collections.new('12_Cameras_and_Lighting')
if col.name not in scene.collection.children:scene.collection.children.link(col)
for o in list(col.objects):bpy.data.objects.remove(o,do_unlink=True)
world=bpy.data.worlds.new('Comparison daylight');world.use_nodes=True;scene.world=world;world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.79,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6
sun_data=bpy.data.lights.new('Soft daylight','SUN');sun_data.energy=3;sun_data.angle=.2;sun=bpy.data.objects.new('Soft daylight',sun_data);col.objects.link(sun);sun.rotation_euler=(.35,-.45,-.6)
for view in plan['cameras']:
 data=bpy.data.cameras.new(view['name']);camera=bpy.data.objects.new('Camera_'+view['name'],data);col.objects.link(camera);camera.location=view['location'];direction=(Vector(view['target'])-camera.location).normalized();camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
 if view['name']=='school':camera.location-=direction*1800
 data.type='ORTHO';data.ortho_scale=view['ortho_scale'];data.clip_end=10000
 if view['name']=='neighborhood':scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.resolution_x=1400;scene.render.resolution_y=1050;scene.view_settings.view_transform='AgX'
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.shading.type='MATERIAL';area.spaces.active.overlay.show_overlays=False
bpy.context.scene['screenshot_lod_status']='Full-resolution screenshot tiles loaded. Optional near/far switching: lod_screenshots.register().';bpy.ops.wm.save_as_mainfile(filepath=str(w/'Monroe_Screenshot_Terrain.blend'));print('NATIVE_FULL_DETAIL_SAVED',len(manifest['tiles']),flush=True)
