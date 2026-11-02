"""Move orthographic camera backward along its viewing axis: identical framing, no near-plane cuts."""
import bpy,json
from pathlib import Path
from mathutils import Vector
w=Path('/workspace/monroe-screenshot');d=w/'delivery';plan=json.loads(Path('/workspace/monroe-hd/delivery/imagery_plan.json').read_text());view=next(v for v in plan['cameras'] if v['name']=='school')
for state,path in [('before','/workspace/formit-city-context/delivery/FormIt_City_Neighborhood_Context.blend'),('after',str(d/'Monroe_Screenshot_Terrain.fbx'))]:
 if path.endswith('.blend'):bpy.ops.wm.open_mainfile(filepath=path)
 else:bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath=path)
 scene=bpy.context.scene
 for o in list(scene.objects):
  if o.type=='LIGHT':bpy.data.objects.remove(o,do_unlink=True)
 world=bpy.data.worlds.new('Comparison daylight');world.use_nodes=True;scene.world=world;world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.79,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6;bpy.ops.object.light_add(type='SUN');bpy.context.object.rotation_euler=(.35,-.45,-.6);bpy.context.object.data.energy=3;bpy.context.object.data.angle=.2
 scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=8;scene.render.resolution_x=1400;scene.render.resolution_y=1050;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
 bpy.ops.object.camera_add(location=view['location']);cam=bpy.context.object;direction=(Vector(view['target'])-cam.location).normalized();cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();cam.location-=direction*1800;cam.data.type='ORTHO';cam.data.ortho_scale=view['ortho_scale'];cam.data.clip_end=10000;scene.camera=cam;scene.render.filepath=str(d/'previews'/(state+'_school.png'));bpy.ops.render.render(write_still=True)
