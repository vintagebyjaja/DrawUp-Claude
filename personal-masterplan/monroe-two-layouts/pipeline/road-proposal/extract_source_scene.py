import bpy,json,hashlib,collections
from pathlib import Path
from mathutils.kdtree import KDTree
w=Path('/workspace/monroe-road-redesign');source=Path('/workspace/monroe-screenshot/delivery/Monroe_Screenshot_Terrain.blend');bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene

def components(o):
 m=o.data;parent=list(range(len(m.vertices)))
 def root(i):
  while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
  return i
 for e in m.edges:
  a,b=map(root,e.vertices)
  if a!=b:parent[b]=a
 verts=collections.defaultdict(list);faces=collections.defaultdict(list)
 for i in range(len(parent)):verts[root(i)].append(i)
 for p in m.polygons:faces[root(p.vertices[0])].append(p.index)
 return [(v,faces[k]) for k,v in verts.items()]
trunk=bpy.data.objects['treeBaked_trunk'];foliage=bpy.data.objects['treeBaked_foliage'];trees=[]
for i,(indices,faces) in enumerate(components(trunk)):
 points=[trunk.matrix_world@trunk.data.vertices[j].co for j in indices];lo=[min(v[j] for v in points) for j in range(3)];hi=[max(v[j] for v in points) for j in range(3)];trees.append({'id':i,'xy':[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2],'trunk_bbox':[lo,hi],'trunk_faces':faces,'foliage_faces':[],'foliage_bbox':None})
tree=KDTree(len(trees))
for r in trees:tree.insert((*r['xy'],0),r['id'])
tree.balance()
for indices,faces in components(foliage):
 pts=[foliage.matrix_world@foliage.data.vertices[j].co for j in indices];lo=[min(v[j] for v in pts) for j in range(3)];hi=[max(v[j] for v in pts) for j in range(3)];center=((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,0);nearest=tree.find(center)[1];r=trees[nearest];r['foliage_faces'].extend(faces);r['foliage_bbox']=[lo,hi]
(w/'source_trees.json').write_text(json.dumps(trees));records=[];building_hashes={}
for o in scene.objects:
 if o.type!='MESH' or o.get('_screenshot_backup'):continue
 if o.name.startswith('building_'):
  data={'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'faces':[list(p.vertices) for p in o.data.polygons]};building_hashes[o.name]=hashlib.sha256(json.dumps(data,separators=(',',':')).encode()).hexdigest();continue
 if not(o.name.startswith('Terrain_') or o.name.startswith('road_') or o.name.startswith('Curbs_')):continue
 pts=[o.matrix_world@v.co for v in o.data.vertices]
 if not pts:continue
 lo=[min(v[j] for v in pts) for j in range(3)];hi=[max(v[j] for v in pts) for j in range(3)]
 if hi[0]<-115 or lo[0]>85 or hi[1]<260 or lo[1]>480:continue
 records.append({'name':o.name,'points':[list(p) for p in pts],'faces':[list(p.vertices) for p in o.data.polygons],'uv':[list(v.uv) for v in o.data.uv_layers.active.data] if o.data.uv_layers.active else None})
(w/'source_surfaces.json').write_text(json.dumps(records));(w/'delivery/validation/baseline_building_hashes.json').write_text(json.dumps({'baseline':str(source),'baseline_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'buildings':building_hashes},indent=2));print('EXTRACTED',len(trees),'trees',len(records),'source surfaces',len(building_hashes),'buildings',flush=True)
