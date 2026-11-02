import bpy,json,hashlib,collections,sys,math
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
from io_scene_fbx import parse_fbx
work=Path('/workspace/formit-city-layered');out=work/'delivery';path=out/'FormIt_City_Layered.fbx'
def digest(objects):
 faces=[]
 for o in objects:
  for p in o.data.polygons:faces.append(tuple(sorted(tuple(round(c,6) for c in o.matrix_world@o.data.vertices[i].co) for i in p.vertices)))
 return hashlib.sha256(json.dumps(sorted(faces),separators=(',',':')).encode()).hexdigest(),len(faces)
bpy.ops.wm.open_mainfile(filepath=str(work/'FormIt_City_Layered.blend'));source_hash,source_faces=digest([bpy.data.objects['Original_tinMesh_Backup']])
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath=str(path))
observed={o.name:o for o in bpy.context.scene.objects if o.type=='MESH'};reference=json.loads((out/'validation/geometry_reference.json').read_text());expected={r['name']:r for r in reference};missing=sorted(set(expected)-set(observed));extra=sorted(set(observed)-set(expected));failures=[];max_error=0;counts=0
for name,r in expected.items():
 if name not in observed:continue
 o=observed[name]
 if (o.parent.name if o.parent else None)!=r['parent_root']:failures.append(name+' parent group')
 pts=[o.matrix_world@v.co for v in o.data.vertices];tree=KDTree(len(pts))
 for i,p in enumerate(pts):tree.insert(p,i)
 tree.balance();error=max(tree.find(Vector(p))[2] for p in r['points']);max_error=max(max_error,error)
 tri=sum(len(p.vertices)-2 for p in o.data.polygons);counts+=tri;used={tuple(sorted(k)) for p in o.data.polygons for k in p.edge_keys};loose=sum(tuple(sorted(e.vertices)) not in used for e in o.data.edges);materials=collections.Counter()
 for p in o.data.polygons:materials[o.material_slots[p.material_index].material.name]+=len(p.vertices)-2
 if error>.001 or tri!=r['triangles'] or loose!=r['loose_edges'] or dict(materials)!=r['material_triangle_counts']:failures.append(name)
 if any(not all(math.isfinite(c) for c in p) for p in pts):failures.append(name+' nonfinite')
 if sum(p.area<1e-10 for p in o.data.polygons)!=r['degenerate_faces']:failures.append(name+' introduced degenerate faces')
terrains=[o for o in observed.values() if o.name.startswith('Terrain_')];actual_hash,actual_faces=digest(terrains)
roots={o.name for o in bpy.context.scene.objects if o.type=='EMPTY'};metadata=json.loads((out/'validation/layer_extraction.json').read_text());required=['LAYER_'+n for n in metadata['layer_mesh_counts'] if not n.startswith('00_')];missing_roots=[n for n in required if n not in roots]
terrain_min=min((o.matrix_world@v.co).z for o in terrains for v in o.data.vertices)
header,_=parse_fbx.parse(str(path));settings={}
for e in header.elems:
 if e.id==b'GlobalSettings':
  for pset in e.elems:
   if pset.id==b'Properties70':
    for p in pset.elems:settings[p.props[0].decode()]=list(p.props[4:])
images=[{'name':i.name,'packed':bool(i.packed_file),'exists':Path(bpy.path.abspath(i.filepath)).is_file()} for i in bpy.data.images if i.source=='FILE']
result={'mesh_objects':len(observed),'expected_mesh_objects':len(expected),'missing_objects':missing,'extra_objects':extra,'failed_objects':failures,'triangles':counts,'max_vertex_error_m':max_error,'source_terrain_faces':source_faces,'reimported_partition_terrain_faces':actual_faces,'terrain_triangle_hash_matches_original':actual_hash==source_hash,'terrain_min_z_m':terrain_min,'required_layer_groups':required,'missing_layer_groups':missing_roots,'fbx_up_axis':settings.get('UpAxis'),'fbx_unit_scale_cm':settings.get('UnitScaleFactor'),'textures':images,'FormIt_runtime_tested':False}
result['passed']=not missing and not extra and not failures and not missing_roots and source_hash==actual_hash and source_faces==actual_faces and abs(terrain_min)<.0001 and settings.get('UpAxis')==[2] and all(i['packed'] or i['exists'] for i in images)
(out/'validation/layered_reimport_report.json').write_text(json.dumps(result,indent=2)+'\n');print('LAYERED_VALIDATION',json.dumps(result))
if not result['passed']:raise RuntimeError('Layered model validation failed')
