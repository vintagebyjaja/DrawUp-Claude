"""Portable COLLADA 1.4.1 export for SketchUp Desktop import. Not native SKP."""
import bpy,json,collections
from pathlib import Path
from xml.sax.saxutils import escape,quoteattr
w=Path('/workspace/monroe-pavement-fix');d=w/'delivery'
def working(o):return o.type=='MESH' and not any(o.get(k) for k in ['_proposal_backup','_screenshot_backup','_variant_backup','_material_backup','_townhouse_backup'])
def floats(seq):return ' '.join(format(float(x),'.9g') for x in seq)
for folder,name in [('01_Original_Road_Layout','Monroe_Original_Road_Layout'),('02_New_Road_Layout','Monroe_New_Road_Layout')]:
 bpy.ops.wm.open_mainfile(filepath=str(d/folder/(name+'.blend')));objects=[o for o in bpy.context.scene.objects if working(o)];materials={m.name:m for o in objects for m in o.data.materials if m};mids={name:'mat%d'%i for i,name in enumerate(materials)};images={};info={}
 for key,m in materials.items():
  color=m.diffuse_color[:];image=None
  if m.use_nodes:
   bsdf=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
   if bsdf:
    c=bsdf.inputs['Base Color'];color=c.default_value[:]
    if c.is_linked and c.links[0].from_node.type=='TEX_IMAGE':image=c.links[0].from_node.image
  iid=None
  if image:
   base=Path(image.filepath).name
   if (d/'Shared_Textures'/base).exists():
    if base not in images:images[base]='image%d'%len(images)
    iid=images[base]
  info[key]=(color,iid)
 path=d/folder/(name+'.dae')
 with path.open('w',encoding='utf-8') as f:
  f.write('<?xml version="1.0" encoding="utf-8"?><COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1"><asset><contributor><authoring_tool>Monroe material update Blender exporter</authoring_tool></contributor><created>2026-11-03T00:00:00Z</created><modified>2026-11-03T00:00:00Z</modified><unit name="meter" meter="1"/><up_axis>Z_UP</up_axis></asset><library_images>')
  for base,iid in images.items():f.write('<image id="%s"><init_from>%s</init_from></image>'%(iid,escape('../Shared_Textures/'+base)))
  f.write('</library_images><library_effects>')
  for name,mid in mids.items():
   color,iid=info[name];f.write('<effect id="%s_fx"><profile_COMMON>'%mid)
   if iid:f.write('<newparam sid="surf"><surface type="2D"><init_from>%s</init_from></surface></newparam><newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam>'%iid)
   f.write('<technique sid="common"><lambert><diffuse>')
   f.write('<texture texture="samp" texcoord="UVSET0"/>' if iid else '<color>'+floats(color)+'</color>');f.write('</diffuse></lambert></technique></profile_COMMON><extra><technique profile="GOOGLEEARTH"><double_sided>1</double_sided></technique></extra></effect>')
  f.write('</library_effects><library_materials>')
  for name,mid in mids.items():f.write('<material id="%s" name=%s><instance_effect url="#%s_fx"/></material>'%(mid,quoteattr(name),mid))
  f.write('</library_materials><library_geometries>')
  for oi,o in enumerate(objects):
   mesh=o.data;mesh.calc_loop_triangles();gid='geo%d'%oi;f.write('<geometry id="%s" name=%s><mesh>'%(gid,quoteattr(o.name)))
   positions=[v for vertex in mesh.vertices for v in (o.matrix_world@vertex.co)];normals=[v for n in mesh.corner_normals for v in (o.matrix_world.to_3x3().inverted().transposed()@n.vector).normalized()];uv=mesh.uv_layers.active;uvs=[x for v in uv.data for x in v.uv] if uv else [0.,0.]*len(mesh.loops)
   for sid,array,stride,params in [('pos',positions,3,['X','Y','Z']),('norm',normals,3,['X','Y','Z']),('uv',uvs,2,['S','T'])]:
    ref=gid+'_'+sid;f.write('<source id="%s"><float_array id="%s_arr" count="%d">%s</float_array><technique_common><accessor source="#%s_arr" count="%d" stride="%d">'%(ref,ref,len(array),floats(array),ref,len(array)//stride,stride));f.write(''.join('<param name="%s" type="float"/>'%p for p in params));f.write('</accessor></technique_common></source>')
   f.write('<vertices id="%s_verts"><input semantic="POSITION" source="#%s_pos"/></vertices>'%(gid,gid));groups=collections.defaultdict(list)
   for tri in mesh.loop_triangles:groups[tri.material_index].append(tri)
   for mi,tris in groups.items():
    if len(mesh.materials)==0:continue
    mi=min(mi,len(mesh.materials)-1);material=mesh.materials[mi];mid=mids[material.name];f.write('<triangles material="%s" count="%d"><input semantic="VERTEX" source="#%s_verts" offset="0"/><input semantic="NORMAL" source="#%s_norm" offset="1"/><input semantic="TEXCOORD" source="#%s_uv" offset="2" set="0"/><p>'%(mid,len(tris),gid,gid,gid));f.write(' '.join('%d %d %d'%(vi,li,li) for tri in tris for vi,li in zip(tri.vertices,tri.loops)));f.write('</p></triangles>')
   f.write('</mesh></geometry>')
  f.write('</library_geometries><library_visual_scenes><visual_scene id="Scene" name="Monroe">')
  for oi,o in enumerate(objects):
   f.write('<node id="object%d" name=%s type="NODE"><instance_geometry url="#geo%d"><bind_material><technique_common>'%(oi,quoteattr(o.name),oi))
   for material in o.data.materials:
    if material:
     mid=mids[material.name];f.write('<instance_material symbol="%s" target="#%s"><bind_vertex_input semantic="UVSET0" input_semantic="TEXCOORD" input_set="0"/></instance_material>'%(mid,mid))
   f.write('</technique_common></bind_material></instance_geometry></node>')
  f.write('</visual_scene></library_visual_scenes><scene><instance_visual_scene url="#Scene"/></scene></COLLADA>')
 print('COLLADA_EXPORTED',path,len(objects),path.stat().st_size,flush=True)
