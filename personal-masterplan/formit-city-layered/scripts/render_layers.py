import bpy,json
from pathlib import Path
from mathutils import Vector
work=Path('/workspace/formit-city-layered');out=work/'delivery';bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath=str(out/'FormIt_City_Layered.fbx'));scene=bpy.context.scene
world=bpy.data.worlds.new('Layer preview daylight');world.use_nodes=True;scene.world=world;world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.79,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.35,-.45,-.6);sun.data.energy=3;sun.data.angle=.2
scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=8;scene.render.resolution_x=1400;scene.render.resolution_y=1050;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
def camera(loc,target,scale):
 bpy.ops.object.camera_add(location=loc);o=bpy.context.object;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();o.data.type='ORTHO';o.data.ortho_scale=scale;o.data.clip_end=10000;return o
scene.camera=camera((-220,165,210),(-25,372,28),260);scene.render.filepath=str(out/'previews/01_campus_corner_and_layers.png');bpy.ops.render.render(write_still=True)
scene.camera=camera((-98,411,67),(-45.49,458.76,20),68);scene.render.filepath=str(out/'previews/02_corner_building_closeup.png');bpy.ops.render.render(write_still=True)
# Diagnostic colors only; saved model materials are not altered.
colors={'Terrain_grass_surface':(.12,.55,.15),'Terrain_paved_surface':(.88,.32,.08),'Terrain_other_surface':(.42,.44,.43),'Curbs_Estimated_Path_Edges':(.90,.85,.58)}
def material(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1);return m
mats={k:material('Diagnostic '+k,c) for k,c in colors.items()};road=material('Diagnostic Roads',(.12,.14,.17));paths=material('Diagnostic Sidewalks/Paths',(.05,.65,.85))
for o in scene.objects:
 if o.type!='MESH':continue
 m=mats.get(o.name) or (paths if o.name.startswith('road_paths_') else road if o.name.startswith('road_') else None)
 if m:
  o.data.materials.clear();o.data.materials.append(m)
  for p in o.data.polygons:p.material_index=0
scene.camera=camera((-25,372,500),(-25,372,0),310);scene.render.filepath=str(out/'previews/03_layer_diagnostic_colors.png');bpy.ops.render.render(write_still=True)
