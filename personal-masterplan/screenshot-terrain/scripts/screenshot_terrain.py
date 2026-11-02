"""Clip existing terrain to real imagery tile boundaries without altering surface elevations."""
import math,json,hashlib
from pathlib import Path

def clip(poly,axis,bound,keep_greater):
 result=[]
 for a,b in zip(poly,poly[1:]+poly[:1]):
  ina=a[axis]>=bound if keep_greater else a[axis]<=bound;inb=b[axis]>=bound if keep_greater else b[axis]<=bound
  if ina:result.append(tuple(a))
  if ina!=inb:
   t=(bound-a[axis])/(b[axis]-a[axis]);result.append(tuple(a[i]+t*(b[i]-a[i]) for i in range(3)))
 unique=[]
 for v in result:
  if not unique or math.dist(v,unique[-1])>1e-8:unique.append(v)
 if len(unique)>1 and math.dist(unique[0],unique[-1])<1e-8:unique.pop()
 return unique

def clip_box(poly,box):
 for axis,bound,greater in [(0,box[0],True),(0,box[2],False),(1,box[1],True),(1,box[3],False)]:
  if not poly:return []
  poly=clip(poly,axis,bound,greater)
 return poly

def area(poly):
 if len(poly)<3:return 0.
 from math import sqrt
 a=poly[0];total=0.
 for b,c in zip(poly[1:-1],poly[2:]):
  u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)];cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];total+=sqrt(sum(x*x for x in cross))/2
 return total

def geometry_hash(o):
 payload={'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'faces':[list(p.vertices) for p in o.data.polygons]}
 return hashlib.sha256(json.dumps(payload,separators=(',',':')).encode()).hexdigest()

def apply_manifest(manifest_path,allow_test_fixture=False):
 import bpy
 manifest_path=Path(manifest_path);manifest=json.loads(manifest_path.read_text())
 if manifest.get('status')!='user_authorized_screenshot_approximation' or manifest.get('usage')!='personal_prototype':raise ValueError('Only the explicitly authorized personal screenshot manifest is supported.')
 for t in manifest['tiles']:
  for level in ['low','high']:
   if not(manifest_path.parent/t[level]).is_file():raise FileNotFoundError(t[level])
 scene=bpy.context.scene;buildings={o.name:geometry_hash(o) for o in scene.objects if o.type=='MESH' and o.name.startswith('building_')};source=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('Terrain_')];backup=bpy.data.collections.new('00_Original_Terrain_Backup');scene.collection.children.link(backup);backup.hide_render=True;backup.hide_viewport=True
 mats={};nodes={}
 for tile in manifest['tiles']:
  material=bpy.data.materials.new('Screenshot ground | '+tile['id']);material.use_nodes=True;p=material.node_tree.nodes['Principled BSDF'];p.inputs['Roughness'].default_value=.95;node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=bpy.data.images.load(str(manifest_path.parent/tile['low']),check_existing=True);node.interpolation='Linear';node.extension='EXTEND';material.node_tree.links.new(node.outputs['Color'],p.inputs['Base Color']);material['tile_id']=tile['id'];material['manifest_path']=str(manifest_path.resolve());mats[tile['id']]=material;nodes[tile['id']]=node
 source_area=0.;result_area=0.;mesh_count=0
 for o in source:
  polygons=[[tuple(o.matrix_world@o.data.vertices[i].co) for i in p.vertices] for p in o.data.polygons];source_area+=sum(area(p) for p in polygons);collections=list(o.users_collection);parent=o.parent
  for tile in manifest['tiles']:
   box=tile['bbox_local_m'];vs=[];fs=[];uvs=[]
   for poly in polygons:
    if max(v[0] for v in poly)<box[0] or min(v[0] for v in poly)>box[2] or max(v[1] for v in poly)<box[1] or min(v[1] for v in poly)>box[3]:continue
    piece=clip_box(poly,box);a=area(piece)
    if a<1e-8:continue
    result_area+=a;start=len(vs);vs.extend(piece);fs.append(list(range(start,start+len(piece))));uvs.extend(((v[0]-box[0])/(box[2]-box[0]),(v[1]-box[1])/(box[3]-box[1])) for v in piece)
   if not fs:continue
   mesh=bpy.data.meshes.new(o.name+'_'+tile['id']);mesh.from_pydata(vs,[],fs);mesh.update();uv=mesh.uv_layers.new(name='GeographicTileUV')
   for value,coord in zip(uv.data,uvs):value.uv=coord
   mesh.materials.append(mats[tile['id']]);obj=bpy.data.objects.new(mesh.name,mesh);collections[0].objects.link(obj);obj.parent=parent;obj['imagery_tile_id']=tile['id'];mesh_count+=1
  for c in list(o.users_collection):c.objects.unlink(o)
  backup.objects.link(o);o['_screenshot_backup']=True
 after={o.name:geometry_hash(o) for o in scene.objects if o.type=='MESH' and o.name.startswith('building_')}
 if buildings!=after:raise AssertionError('Building geometry changed during terrain-only update.')
 relative=abs(source_area-result_area)/source_area
 if relative>2e-6:raise AssertionError('Tile coverage changed terrain surface area; check bounds.')
 scene['screenshot_imagery_manifest']=str(manifest_path.resolve());scene['screenshot_lod_status']='Overview loaded; run lod_imagery.register() for camera-distance loading. FBX is static.'
 return {'source_surface_area_m2':source_area,'tiled_surface_area_m2':result_area,'relative_area_error':relative,'building_geometry_unchanged':True,'buildings':len(buildings),'terrain_tile_meshes':mesh_count,'status':'screenshot_approximation_applied'}
