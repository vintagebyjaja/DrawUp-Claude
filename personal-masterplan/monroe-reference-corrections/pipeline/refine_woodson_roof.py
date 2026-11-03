import bpy,json,math,numpy as np
from pathlib import Path
from PIL import Image
w=Path('/workspace/monroe-townhouse-correction');d=w/'delivery'
source=(w/'scripts/shared_facilities.py').read_text();part=source[source.index(' # Use the reference-supported green roof'):];exec('def roof_only():\n plan=json.loads((w/"driveway_geometry.json").read_text())["shared_facilities"]\n'+part)
def working(o):return o.type=='MESH' and not any(o.get(k) for k in ['_proposal_backup','_screenshot_backup','_variant_backup','_material_backup','_townhouse_backup'])
for variant,folder,name in [('existing','01_Original_Road_Layout','Monroe_Original_Road_Layout'),('proposed','02_New_Road_Layout','Monroe_New_Road_Layout')]:
 file=d/folder/(name+'.blend');bpy.ops.wm.open_mainfile(filepath=str(file));report=roof_only();report['roof_texture_method']='Registered original aerial roof colors with a planted-zone material accent. No structural roof or panel geometry is regenerated.'
 for image in bpy.data.images:
  if image.source=='FILE' and image.users and (d/'Shared_Textures'/Path(image.filepath).name).exists():image.filepath='//../Shared_Textures/'+Path(image.filepath).name
 bpy.ops.wm.save_as_mainfile(filepath=str(file));bpy.ops.object.select_all(action='DESELECT')
 for o in bpy.context.scene.objects:
  if working(o):o.select_set(True)
 bpy.ops.export_scene.fbx(filepath=str(d/folder/(name+'.fbx')),use_selection=True,object_types={'MESH'},axis_forward='Y',axis_up='Z',apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',use_mesh_edges=False,path_mode='COPY',embed_textures=True,add_leaf_bones=False,use_custom_props=True)
 (d/'validation'/(variant+'_recreation_details.json')).write_text(json.dumps(report,indent=2));print('ROOF_REFERENCE_REFINED',variant,flush=True)
