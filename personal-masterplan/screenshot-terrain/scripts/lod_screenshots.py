"""Blender-only image LOD. Register once in a trusted Blender session; FBX has no streaming."""
import bpy,json,time
from pathlib import Path
from mathutils import Vector
_cache={};_last=0.;_busy=False

def update(camera_position=None,force=False,allow_test_fixture=False):
 global _last,_busy
 if _busy or not force and time.monotonic()-_last<.3:return
 scene=bpy.context.scene;path=scene.get('screenshot_imagery_manifest')
 if not path:return
 manifest_path=Path(bpy.path.abspath(path));manifest=json.loads(manifest_path.read_text())
 if manifest.get('status')!='user_authorized_screenshot_approximation' and not(allow_test_fixture and manifest.get('status')=='synthetic_unit_test_fixture'):return
 if camera_position is None:
  for screen in bpy.data.screens:
   for area in screen.areas:
    if area.type=='VIEW_3D':camera_position=area.spaces.active.region_3d.view_matrix.inverted().translation;break
   if camera_position is not None:break
 if camera_position is None and scene.camera:camera_position=scene.camera.location
 if camera_position is None:return
 _busy=True
 try:
  for tile in manifest['tiles']:
   box=tile['bbox_local_m'];x,y,z=camera_position;dx=max(box[0]-x,0,x-box[2]);dy=max(box[1]-y,0,y-box[3]);level='high' if (dx*dx+dy*dy+z*z)**.5<400 else 'low';mat=bpy.data.materials.get('Screenshot ground | '+tile['id'])
   if mat is None:continue
   node=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE');filename=str(manifest_path.parent/tile[level])
   if not node.image or bpy.path.abspath(node.image.filepath)!=filename:
    old=node.image;node.image=bpy.data.images.load(filename,check_existing=True);node.interpolation='Linear'
    if old and old.users==0:bpy.data.images.remove(old)
  _last=time.monotonic()
 finally:_busy=False

def _handler(scene,depsgraph):update()
def register():
 unregister();bpy.app.handlers.depsgraph_update_post.append(_handler)
 if hasattr(bpy.context.preferences.system,'anisotropic_filter'):bpy.context.preferences.system.anisotropic_filter='FILTER_16'
 update(force=True)
def unregister():
 for h in list(bpy.app.handlers.depsgraph_update_post):
  if getattr(h,'__module__',None)==__name__ and getattr(h,'__name__','')=='_handler':bpy.app.handlers.depsgraph_update_post.remove(h)
if __name__=='__main__':register()
