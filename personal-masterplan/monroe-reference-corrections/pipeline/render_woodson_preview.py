import bpy,json
from pathlib import Path
from mathutils import Vector
w=Path('/workspace/monroe-townhouse-correction');d=w/'delivery';variant='proposed'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(d/'02_New_Road_Layout/Monroe_New_Road_Layout.fbx'));scene=bpy.context.scene
world=bpy.data.worlds.new('Daylight');world.use_nodes=True;scene.world=world;world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.79,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6;bpy.ops.object.light_add(type='SUN');bpy.context.object.rotation_euler=(.35,-.45,-.6);bpy.context.object.data.energy=3;bpy.context.object.data.angle=.25;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=8;scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
renderViews=[{'name':'12_woodson_courts_and_green_roof','location':[180,590,280],'target':[440,375,15],'ortho':380}]
for view in renderViews:
 bpy.ops.object.camera_add(location=view['location']);camera=bpy.context.object;direction=(Vector(view['target'])-camera.location).normalized();camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();camera.data.clip_end=10000
 if 'ortho' in view:camera.data.type='ORTHO';camera.data.ortho_scale=view['ortho'];camera.location-=direction*1500
 else:camera.data.lens=view['lens']
 scene.camera=camera;scene.render.filepath=str(d/'previews'/(variant+'_'+view['name']+'.png'));bpy.ops.render.render(write_still=True)
