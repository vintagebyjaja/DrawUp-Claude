"""Render the four stored cameras from the actual saved Blender geometry."""
import bpy, sys
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]).resolve()
bpy.ops.wm.open_mainfile(filepath=str(out/'Monroe_MasterPlan.blend'))
scene=bpy.context.scene
for camera,name in [('Aerial master plan','01_aerial'),('Birds eye','02_birds_eye'),('Street architectural','03_street'),('Building focused','04_building')]:
 scene.camera=bpy.data.objects[camera]
 scene.render.filepath=str(out/'previews'/f'{name}.png')
 bpy.ops.render.render(write_still=True)
