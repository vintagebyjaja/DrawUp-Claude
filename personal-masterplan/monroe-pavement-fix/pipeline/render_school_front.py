import bpy
from pathlib import Path
from mathutils import Vector
w=Path('/workspace/monroe-pavement-fix');d=w/'delivery'
for variant,folder,name in [('existing','01_Original_Road_Layout','Monroe_Original_Road_Layout'),('proposed','02_New_Road_Layout','Monroe_New_Road_Layout')]:
 bpy.ops.wm.open_mainfile(filepath=str(d/folder/(name+'.blend')));s=bpy.context.scene
 world=bpy.data.worlds.new('Daylight');world.use_nodes=True;s.world=world;world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.79,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6
 bpy.ops.object.light_add(type='SUN');bpy.context.object.rotation_euler=(.35,-.45,-.6);bpy.context.object.data.energy=3;bpy.context.object.data.angle=.25
 s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=False;s.render.threads_mode='FIXED';s.render.threads=4;s.render.resolution_x=1600;s.render.resolution_y=1200;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.view_settings.view_transform='AgX'
 bpy.ops.object.camera_add(location=(-74,377,85));c=bpy.context.object;direction=(Vector((-28,384,27))-c.location).normalized();c.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();c.data.clip_end=10000;c.data.type='ORTHO';c.data.ortho_scale=82;c.location-=direction*1500;s.camera=c;s.render.filepath=str(d/'previews'/(variant+'_22_school_facade_forecourt.png'));bpy.ops.render.render(write_still=True)
