"""Separate source roads/paths and partition TIN imagery; retain all original terrain triangles.
Grass/paved classification and curb dimensions are inferred, not surveyed.
"""
import bpy,json,sys,math,hashlib,collections,shutil
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
work=Path('/workspace/formit-city-layered');out=work/'delivery';previous=Path('/workspace/formit-city-corner')
for n in ['textures','validation','layers','previews']:(out/n).mkdir(parents=True,exist_ok=True)
shutil.copytree(previous/'delivery/textures',out/'textures',dirs_exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(previous/'FormIt_City_Materialized_Corner.blend'))
scene=bpy.context.scene;original_objects=[o for o in scene.objects if o.type=='MESH'];tin=bpy.data.objects['tinMesh'];mesh=tin.data;rgb=np.load(work/'aerial_rgb.npy');H,W=rgb.shape[:2]
names=['00_Original_Terrain_Backup','01_Terrain_Unclassified','02_Grass_Landscape_Inferred','03_Roads_Source','04_Parking_Paved_Inferred','05_Sidewalks_Paths_Source','06_Curbs_Estimated','07_Buildings','08_Trees','09_Water','10_Model_Base','11_Contours']
cols={};roots={}
for name in names:
 col=bpy.data.collections.new(name);scene.collection.children.link(col);cols[name]=col
 if not name.startswith('00_'):
  root=bpy.data.objects.new('LAYER_'+name,None);col.objects.link(root);root['layer_status']='Source geometry' if any(x in name for x in ['Roads_Source','Paths_Source','Buildings','Trees','Water','Model_Base','Contours']) else 'Imagery-inferred or estimated geometry' if any(x in name for x in ['Inferred','Estimated']) else 'Source terrain triangles';roots[name]=root
cols[names[0]].hide_render=True;cols[names[0]].hide_viewport=True

def move(o,name):
 for c in list(o.users_collection):c.objects.unlink(o)
 cols[name].objects.link(o)
 if name in roots:
  world=o.matrix_world.copy();o.parent=roots[name];o.matrix_parent_inverse=Matrix.Identity(4);o.matrix_world=world
for o in original_objects:
 n=o.name
 if n=='tinMesh':continue
 if n.startswith('road_paths_'):key=names[5]
 elif n.startswith('road_'):key=names[3]
 elif n.startswith('building_'):key=names[7]
 elif n.startswith('treeBaked'):key=names[8]
 elif n.startswith('water'):key=names[9]
 elif n in ['clipSide','clippedBottom']:key=names[10]
 elif n=='Contours':key=names[11]
 else:raise RuntimeError('Unclassified source mesh '+n)
 move(o,key)
# Masks prevent building roofs, mapped roads/paths, tree canopies and water from
# being called grass or parking based solely on image color.
verts=[];faces=[]
for o in original_objects:
 if not (o.name.startswith('building_') or o.name.startswith('road_') or o.name.startswith('water') or o.name=='treeBaked_foliage'):continue
 start=len(verts);verts.extend(o.matrix_world@v.co for v in o.data.vertices);faces.extend([start+i for i in p.vertices] for p in o.data.polygons)
mask=BVHTree.FromPolygons(verts,faces,all_triangles=False)
uv=mesh.uv_layers.active;parts={'grass':[],'paved':[],'other':[]};covered=0
weights=np.array([[1/3]*3,[.65,.175,.175],[.175,.65,.175],[.175,.175,.65],[.5,.5,0],[.5,0,.5],[0,.5,.5]])
for p in mesh.polygons:
 if len(p.vertices)!=3:raise RuntimeError('Expected triangular source TIN')
 centre=tin.matrix_world@p.center
 hit=mask.ray_cast(Vector((centre.x,centre.y,1000)),Vector((0,0,-1)),2000)
 category='other'
 if hit[0] is not None:covered+=1
 elif p.normal.z>math.cos(math.radians(20)):
  coords=np.array([uv.data[i].uv[:] for i in p.loop_indices]);samples=weights@coords
  xs=np.clip(np.rint(samples[:,0]*(W-1)).astype(int),0,W-1);ys=np.clip(np.rint((1-samples[:,1])*(H-1)).astype(int),0,H-1);c=rgb[ys,xs].astype(float)/255;r,g,b=c[:,0],c[:,1],c[:,2];mx=c.max(axis=1);mn=c.min(axis=1);sat=(mx-mn)/np.maximum(mx,.001)
  grass=(g>r*1.05)&(g>b*1.04)&(g-r>.012)&(g-b>.012)&(mx>.20)&(sat>.12)
  paved=(sat<.16)&(mx>.24)&(mx<.78)
  if int(grass.sum())>=5:category='grass'
  elif int(paved.sum())>=5:category='paved'
 parts[category].append(p.index)
source_face_count=len(mesh.polygons)
assert sum(len(x) for x in parts.values())==source_face_count
source_signatures=collections.Counter(tuple(sorted(tuple(mesh.vertices[i].co) for i in p.vertices)) for p in mesh.polygons)
new_signatures=collections.Counter();terrain_working=[]
for category,key in [('grass',names[2]),('paved',names[4]),('other',names[1])]:
 indices=parts[category]
 if not indices:continue
 used=sorted({i for pi in indices for i in mesh.polygons[pi].vertices});lookup={v:i for i,v in enumerate(used)};newmesh=bpy.data.meshes.new('Terrain_'+category);newmesh.from_pydata([mesh.vertices[i].co[:] for i in used],[],[[lookup[i] for i in mesh.polygons[pi].vertices] for pi in indices]);newmesh.update()
 material=mesh.materials[0].copy();material.name='Aerial_'+category+'_surface';newmesh.materials.append(material)
 newuv=newmesh.uv_layers.new(name='UVMap');normal_values=[]
 for newp,oldi in zip(newmesh.polygons,indices):
  oldp=mesh.polygons[oldi];newp.use_smooth=oldp.use_smooth
  for a,b in zip(newp.loop_indices,oldp.loop_indices):newuv.data[a].uv=uv.data[b].uv;normal_values.append(tuple(mesh.corner_normals[b].vector))
 if normal_values:newmesh.normals_split_custom_set(normal_values)
 obj=bpy.data.objects.new('Terrain_'+category+'_surface',newmesh);obj.matrix_world=tin.matrix_world.copy();scene.collection.objects.link(obj);move(obj,key);obj['inference']='Imagery color votes with source-building/road/tree/water masks; not verified land-use boundaries' if category!='other' else 'Unclassified source terrain triangles';terrain_working.append(obj)
 new_signatures.update(tuple(sorted(tuple(newmesh.vertices[i].co) for i in p.vertices)) for p in newmesh.polygons)
assert source_signatures==new_signatures
move(tin,names[0]);tin.name='Original_tinMesh_Backup';tin['original_name']='tinMesh';tin['status']='Unchanged original terrain; excluded from export to avoid duplicate surfaces'
# Estimated 0.12 m wide x 0.12 m high curb-like strips on source path boundaries.
cv=[];cf=[];segments=0;source_paths=[]
terrain_min=np.min(np.array([v.co[:] for v in mesh.vertices]),axis=0);terrain_max=np.max(np.array([v.co[:] for v in mesh.vertices]),axis=0)
for obj in original_objects:
 if not obj.name.startswith('road_paths_'):continue
 counts=collections.Counter();coords={}
 for p in obj.data.polygons:
  for a,b in zip(list(p.vertices),list(p.vertices)[1:]+list(p.vertices)[:1]):
   pa=obj.matrix_world@obj.data.vertices[a].co;pb=obj.matrix_world@obj.data.vertices[b].co;ka=tuple(round(v,4) for v in pa);kb=tuple(round(v,4) for v in pb);key=tuple(sorted((ka,kb)));counts[key]+=1;coords[key]=(pa,pb)
 before=segments
 for edge,n in counts.items():
  if n!=1:continue
  a,b=coords[edge];d=Vector((b.x-a.x,b.y-a.y,0))
  if d.length<.20:continue
  n=Vector((-d.y,d.x,0)).normalized()*.06
  pts=[a+n,a-n,b-n,b+n]
  if any(p.x<terrain_min[0]+.1 or p.x>terrain_max[0]-.1 or p.y<terrain_min[1]+.1 or p.y>terrain_max[1]-.1 for p in pts):continue
  offset=len(cv);cv.extend(tuple(p+Vector((0,0,z))) for z in [.01,.13] for p in pts)
  cf.extend([[offset+i for i in f] for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]]);segments+=1
 source_paths.append({'path':obj.name,'inferred_segments':segments-before})
curbmesh=bpy.data.meshes.new('Estimated path-edge curb strips');curbmesh.from_pydata(cv,[],cf);curbmesh.update();cm=bpy.data.materials.new('Estimated curb light concrete');cm.use_nodes=True;cm.diffuse_color=(.65,.65,.59,1);cm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=cm.diffuse_color;curbmesh.materials.append(cm);curbs=bpy.data.objects.new('Curbs_Estimated_Path_Edges',curbmesh);scene.collection.objects.link(curbs);move(curbs,names[6]);curbs['dimensions_assumed_m']='Width 0.12; height 0.12; bottom 0.01 above source path edge. Not surveyed curbs.'
for image in bpy.data.images:
 if image.source=='FILE':
  path=out/'textures'/Path(image.filepath).name
  if path.exists():image.filepath=str(path);image.pack()
scene['layer_scope']='Source roads/path meshes grouped; original TIN partitioned without coordinate changes into inferred grass/paved and unclassified surfaces. Curbs are estimates.'
metadata={'source_mesh_count':len(original_objects),'original_terrain_faces':source_face_count,'terrain_face_partition':{k:len(v) for k,v in parts.items()},'terrain_union_exactly_matches_original':source_signatures==new_signatures,'masked_terrain_faces':covered,'curb_segments_estimated':segments,'curb_width_m_assumed':.12,'curb_height_m_assumed':.12,'curb_source_paths':source_paths,'limitations':['Grass layer may include non-grass vegetation and miss shaded grass; color classification is approximate.','Paved layer includes candidate parking/driveways; parking use is not independently verified.','Paths layer includes exported footways, not a verified sidewalk inventory.','Curbs are generated along path edges; actual curb location, width and height were not supplied.'],'layer_mesh_counts':{k:sum(o.type=='MESH' for o in c.objects) for k,c in cols.items()}}
(out/'validation/layer_extraction.json').write_text(json.dumps(metadata,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(work/'FormIt_City_Layered.blend'))
working=[o for o in scene.objects if o.type=='MESH' and o!=tin]
def export(path,objects,groupnames):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects+[roots[n] for n in groupnames]:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.export_scene.fbx(filepath=str(path),use_selection=True,object_types={'MESH','EMPTY'},axis_forward='Y',axis_up='Z',apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',use_mesh_edges=True,path_mode='COPY',embed_textures=True,use_custom_props=True,add_leaf_bones=False)
export(out/'FormIt_City_Layered.fbx',working,list(roots))
for name in [names[2],names[3],names[4],names[5],names[6]]:
 objs=[o for o in cols[name].objects if o.type=='MESH']
 if objs:export(out/'layers'/(name+'.fbx'),objs,[name])
reference=[]
for o in working:
 pts=[list(o.matrix_world@v.co) for v in o.data.vertices];used={tuple(sorted(k)) for p in o.data.polygons for k in p.edge_keys};loose=[e for e in o.data.edges if tuple(sorted(e.vertices)) not in used];counts=collections.Counter()
 for p in o.data.polygons:counts[o.material_slots[p.material_index].material.name]+=len(p.vertices)-2
 reference.append({'name':o.name,'parent_root':o.parent.name if o.parent else None,'vertices':len(pts),'degenerate_faces':sum(p.area<1e-10 for p in o.data.polygons),'faces':len(o.data.polygons),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'loose_edges':len(loose),'points':pts,'materials':[s.material.name for s in o.material_slots],'material_triangle_counts':dict(counts)})
(out/'validation/geometry_reference.json').write_text(json.dumps(reference))
print('LAYER_EXTRACTION',json.dumps({k:v for k,v in metadata.items() if k!='curb_source_paths'}),flush=True)
