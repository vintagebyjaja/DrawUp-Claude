import bpy,bmesh,json,math,random,hashlib,shutil,sys
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
w=Path('/workspace/monroe-road-redesign');d=w/'delivery';source=Path('/workspace/monroe-screenshot/delivery/Monroe_Screenshot_Terrain.blend');p=json.loads((w/'proposal.json').read_text());edits=json.loads((w/'source_edits.json').read_text());trees=json.loads((w/'source_trees.json').read_text());bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene;half=6.7056/2
(d/'textures').mkdir(exist_ok=True);shutil.copytree(source.parent/'textures',d/'textures',dirs_exist_ok=True)
backup=bpy.data.collections.new('00_Existing_Site_Backup');scene.collection.children.link(backup);backup.hide_render=True;backup.hide_viewport=True
layers={};roots={}
for name in ['13_Proposed_Roads','14_Proposed_Parking','15_Proposed_Pedestrian','16_Proposed_Landscape','17_Proposed_Grading','18_Proposed_Markings','19_Proposed_Furnishings','20_Illustrative_Vehicles','21_Existing_Trees_Retained','22_Cameras_and_Lighting']:
 col=bpy.data.collections.new(name);scene.collection.children.link(col);layers[name]=col;root=bpy.data.objects.new('LAYER_'+name,None);col.objects.link(root);root['status']='PROPOSED CONCEPT' if 'Existing' not in name else 'Existing source trees retained';roots[name]=root

def add_object(o,layer):
 for col in list(o.users_collection):col.objects.unlink(o)
 layers[layer].objects.link(o);o.parent=roots[layer];o['design_status']='PROPOSED — not verified existing conditions';return o

def archive(o):
 for col in list(o.users_collection):col.objects.unlink(o)
 backup.objects.link(o);o['_proposal_backup']=True

def mesh_obj(name,vertices,faces,material,layer):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update();mesh.materials.append(material);o=bpy.data.objects.new(name,mesh);layers[layer].objects.link(o);o.parent=roots[layer];o['design_status']='PROPOSED CONCEPT';return o

def mat(name,color,rough=.8,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;bsdf=m.node_tree.nodes['Principled BSDF'];bsdf.inputs['Base Color'].default_value=(*color,1);bsdf.inputs['Roughness'].default_value=rough;bsdf.inputs['Metallic'].default_value=metal;return m
mats={'asphalt':mat('P | fine asphalt',(.055,.065,.071),.92),'concrete':mat('P | warm pedestrian concrete',(.56,.53,.46)),'curb':mat('P | pale concrete curb',(.65,.64,.59)),'retaining':mat('P | stone-faced concept retaining edge',(.32,.32,.28)),'paint':mat('P | traffic white',(.89,.88,.78)),'grass':mat('P | proposed lawn',(.13,.29,.055)),'metal':mat('P | dark bronze metal',(.055,.063,.058),.42,.65),'wood':mat('P | bench timber',(.35,.16,.065)),'blue':mat('P | accessible bay blue',(.025,.18,.50)),'glass':mat('P | vehicle glazing',(.035,.075,.095),.2,.3),'rubber':mat('P | tire rubber',(.022,.025,.026))}
# PBR grain and gentle landscape variation; no new imagery or fabricated existing detail.
for key,scale,strength in [('grass',3,.12),('asphalt',95,.035),('retaining',7,.07)]:
 m=mats[key];nt=m.node_tree;noise=nt.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=scale;noise.inputs['Detail'].default_value=2;bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=strength;bump.inputs['Distance'].default_value=.05;nt.links.new(noise.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs['Normal'],nt.nodes['Principled BSDF'].inputs['Normal'])
 if key=='grass':
  ramp=nt.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.075,.17,.027,1);ramp.color_ramp.elements[1].color=(.19,.34,.065,1);nt.links.new(noise.outputs['Fac'],ramp.inputs[0]);nt.links.new(ramp.outputs['Color'],nt.nodes['Principled BSDF'].inputs['Base Color'])
# Preserve retired source objects and original unedited terrain data in a hidden collection.
for name in edits['retire_objects']:
 if bpy.data.objects.get(name):archive(bpy.data.objects[name])
for e in edits['edits']:
 o=bpy.data.objects[e['name']];old=o.copy();old.data=o.data.copy();old.name='E_Backup_'+o.name;backup.objects.link(old);old['_proposal_backup']=True
 mesh=bpy.data.meshes.new(o.name+'_proposed_context');mesh.from_pydata(e['vertices'],[],e['faces']);mesh.update()
 for material in o.data.materials:mesh.materials.append(material)
 if e['uv']:
  uv=mesh.uv_layers.new(name=o.data.uv_layers.active.name)
  for v,coord in zip(uv.data,e['uv']):v.uv=coord
 o.data=mesh;o.matrix_world=Matrix.Identity(4);o['source_edit']='Working terrain cut only under proposed paving, or superseded internal source paths trimmed. Original data archived.'
# Retain all source trees except the explicitly listed proposed removal candidates.
removed=set(p['tree_removal_ids'])
for name,key in [('treeBaked_trunk','trunk_faces'),('treeBaked_foliage','foliage_faces')]:
 o=bpy.data.objects[name];removefaces={i for r in trees if r['id'] in removed for i in r[key]};original=o.data;keep=[face for face in original.polygons if face.index not in removefaces];used=sorted({i for face in keep for i in face.vertices});lookup={v:i for i,v in enumerate(used)};mesh=bpy.data.meshes.new(name+'_retained');mesh.from_pydata([original.vertices[i].co[:] for i in used],[],[[lookup[i] for i in face.vertices] for face in keep]);mesh.update()
 for material in original.materials:mesh.materials.append(material)
 if original.uv_layers.active:
  uv=mesh.uv_layers.new(name=original.uv_layers.active.name)
  for newface,oldface in zip(mesh.polygons,keep):
   newface.use_smooth=oldface.use_smooth
   for a,b in zip(newface.loop_indices,oldface.loop_indices):uv.data[a].uv=original.uv_layers.active.data[b].uv
 obj=bpy.data.objects.new('E_Retained_'+name,mesh);layers['21_Existing_Trees_Retained'].objects.link(obj);obj.parent=roots['21_Existing_Trees_Retained'];archive(o)
print('SOURCE_CONTEXT_READY',flush=True)
newobjects=[]
for data in p['meshes']:newobjects.append(mesh_obj(data['name'],data['vertices'],data['faces'],mats[data['material']],data['layer']))
print('PROPOSED_SURFACES_READY',flush=True)
# Ray-cast actual proposed surfaces for props and markings.
vertices=[];faces=[]
for o in newobjects:
 if o.name in ['P_Cut_Fill_Retaining_Edges','P_Lane_Parking_and_Crosswalk_Paint','P_Concrete_Curbs']:continue
 start=len(vertices);vertices.extend(o.matrix_world@v.co for v in o.data.vertices);faces.extend([start+i for i in face.vertices] for face in o.data.polygons)
BVH=BVHTree.FromPolygons(vertices,faces)
def z_at(x,y,default=20):
 hit=BVH.ray_cast(Vector((x,y,1000)),Vector((0,0,-1)))[0];return hit.z if hit else default

def cube(name,location,scale,material,layer,angle=0):
 x,y,z=[v/2 for v in scale];vs=[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)];fs=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)];o=mesh_obj(name,vs,fs,material,layer);o.location=location;o.rotation_euler.z=angle;return o

def cylinder_between(name,a,b,r,material,layer,vertices=8):
 a=Vector(a);b=Vector(b);delta=b-a;q=delta.to_track_quat('Z','Y');mid=(a+b)/2;vs=[]
 for z in [-delta.length/2,delta.length/2]:
  for i in range(vertices):vs.append(tuple(mid+q@Vector((r*math.cos(2*math.pi*i/vertices),r*math.sin(2*math.pi*i/vertices),z))))
 fs=[list(reversed(range(vertices))),list(range(vertices,2*vertices))]+[[i,(i+1)%vertices,(i+1)%vertices+vertices,i+vertices] for i in range(vertices)];return mesh_obj(name,vs,fs,material,layer)
# Retaining-edge guards (proposed, dimensions assumed for visualization).
for i,(a,b) in enumerate(p['guardrail_segments']):
 cylinder_between('P_Guard_Rail_%04d'%i,Vector(a)+Vector((0,0,1.05)),Vector(b)+Vector((0,0,1.05)),.025,mats['metal'],'19_Proposed_Furnishings')
 if i%2==0:cylinder_between('P_Guard_Post_%04d'%i,a,Vector(a)+Vector((0,0,1.05)),.025,mats['metal'],'19_Proposed_Furnishings')
print('GUARDRAILS_READY',flush=True)
# Proposed trees use linked canopy meshes for reasonable memory usage.
foliage_mats=[mat('P | foliage '+str(i),color) for i,color in enumerate([(.12,.25,.035),(.19,.32,.055),(.09,.21,.035)])];trunkmat=mat('P | tree bark',(.18,.105,.055))
for i,t in enumerate(p['new_trees']):
 x,y=t['xy'];z=t['z'];h=t['height_m'];cylinder_between('P_Tree_Trunk_%02d'%i,(x,y,z),(x,y,z+h*.72),.13,trunkmat,'16_Proposed_Landscape',10)
 rng=random.Random(i+71)
 for j in range(5):
  theta=j*2.399963;radius=.75 if j else 0;bm=bmesh.new();bmesh.ops.create_icosphere(bm,subdivisions=2,radius=1);mesh=bpy.data.meshes.new('P_CanopyMesh');bm.to_mesh(mesh);bm.free();o=bpy.data.objects.new('P_Tree_Canopy_%02d_%d'%(i,j),mesh);layers['16_Proposed_Landscape'].objects.link(o);o.parent=roots['16_Proposed_Landscape'];o.location=(x+math.cos(theta)*radius,y+math.sin(theta)*radius,z+h*.70+(j%2)*.55);o.scale=(1.65,1.65,1.9);o.data.materials.append(foliage_mats[(i+j)%3]);o['design_status']='Proposed planting'
# Raised parking-end planting islands; the traffic loop remains full-width for emergency access.
for island,(x,y) in enumerate([(-5.65,337.8),(-5.65,350.9),(21.55,337.8),(21.55,350.9)]):
 z=z_at(x,y);cube('P_Parking_Planting_Island_%02d'%island,(x,y,z+.10),(.55,3.2,.20),mats['retaining'],'16_Proposed_Landscape')
 for j in range(3):
  bm=bmesh.new();bmesh.ops.create_icosphere(bm,subdivisions=1,radius=.32);mesh=bpy.data.meshes.new('P_ShrubMesh');bm.to_mesh(mesh);bm.free();o=bpy.data.objects.new('P_Island_Shrub',mesh);layers['16_Proposed_Landscape'].objects.link(o);o.location=(x,y+(j-1)*.9,z+.45);mesh.materials.append(foliage_mats[1]);o['design_status']='Proposed planting island'
print('LANDSCAPE_READY',flush=True)
# Parking wheel stops and blue accessible markers.
for i,space in enumerate(p['parking_spaces']):
 x,y=space['center'];angle=space['angle']
 if space['type']!='resident_parallel':
  stop_y=y-2.35 if space['type']=='visitor' else y+2.35;z=z_at(x,stop_y);cube('P_Wheelstop_%02d'%i,(x,stop_y,z+.055),(1.65,.16,.11),mats['curb'],'14_Proposed_Parking')
 if space['accessible']:
  z=z_at(x,y);cube('P_Accessible_Marker_%02d'%i,(x,y,z+.014),(1.15,1.15,.012),mats['blue'],'18_Proposed_Markings')
  # A simple wheelchair-style circular mark, kept as proposed pavement geometry.
  bpy.ops.mesh.primitive_torus_add(major_segments=20,minor_segments=6,location=(x,y-.12,z+.03),major_radius=.27,minor_radius=.035);o=bpy.context.object;o.name='P_Accessible_Circle';o.data.materials.append(mats['paint']);add_object(o,'18_Proposed_Markings');cube('P_Accessible_Stem',(x+.1,y+.17,z+.04),(.07,.42,.02),mats['paint'],'18_Proposed_Markings')
# Generic parked vehicles are illustrative, not existing vehicle positions.
carcolors=[(.12,.23,.32),(.52,.065,.035),(.62,.62,.57),(.08,.10,.11),(.70,.67,.56)]
for i,s in enumerate(p['parking_spaces']):
 if s['accessible'] or i%2:continue
 x,y=s['center'];angle=s['angle'];z=z_at(x,y);color=mat('P | car paint '+str(i),carcolors[i%len(carcolors)],.3,.3);body=cube('P_Vehicle_Body_%02d'%i,(x,y,z+.53),(4.4,1.8,.7),color,'20_Illustrative_Vehicles',angle);cabin=cube('P_Vehicle_Cabin_%02d'%i,(x,y,z+1.05),(2.3,1.58,.58),mats['glass'],'20_Illustrative_Vehicles',angle)
 for sx in [-1.42,1.42]:
  for sy in [-.86,.86]:
   local=Vector((sx,sy,.31));rot=Matrix.Rotation(angle,4,'Z');v=Vector((x,y,z))+rot@local;axis=rot@Vector((0,.09,0));cylinder_between('P_Vehicle_Wheel',v-axis,v+axis,.31,mats['rubber'],'20_Illustrative_Vehicles',12)
# Benches on proposed pedestrian/green edges.
for i,(x,y) in enumerate([(-4,365),(12,360),(-60,438),(-77,445),(-20,338),(-55,404)]):
 z=z_at(x,y);cube('P_Bench_Seat_%02d'%i,(x,y,z+.46),(1.8,.48,.10),mats['wood'],'19_Proposed_Furnishings');cube('P_Bench_Back_%02d'%i,(x,y+.2,z+.72),(1.8,.08,.48),mats['wood'],'19_Proposed_Furnishings')
 for dx in [-.65,.65]:cube('P_Bench_Leg',(x+dx,y,z+.23),(.09,.35,.46),mats['metal'],'19_Proposed_Furnishings')
# Entry markers and monument leave the vehicle opening unobstructed.
primary=p['profiles']['primary'];pts=[Vector(v) for v in primary['points']];center=pts[14];tangent=(pts[15]-pts[13]).normalized();normal=Vector((-tangent.y,tangent.x))
for side in [-1,1]:
 q=center+normal*(half+2.8)*side;x,y=q;z=z_at(x,y);cube('P_Entry_Pier',(x,y,z+.8),(.55,.55,1.6),mats['retaining'],'19_Proposed_Furnishings')
q=center-normal*7.5;x,y=q;z=z_at(x,y);cube('P_Campus_Entry_Monument',(x,y,z+.65),(3.5,.35,1.3),mats['retaining'],'19_Proposed_Furnishings',.35)
bpy.ops.object.text_add(location=(x-1.45,y-.25,z+.65),rotation=(math.pi/2,0,.35));text=bpy.context.object;text.name='P_Monroe_Campus_Sign';text.data.body='MONROE CAMPUS';text.data.size=.28;text.data.extrude=.006;text.data.materials.append(mats['paint']);bpy.ops.object.convert(target='MESH');add_object(text,'19_Proposed_Furnishings')
# Simple directional arrows on long straight segments, kept off crossings.
for x,y,angle in [(-44.5,357,math.pi/2),(-44.5,368,-math.pi/2),(28,379,-math.pi/2),(28,392,math.pi/2)]:
 uv=[(-1.5,-.08),(.6,-.08),(.6,-.42),(1.5,0),(.6,.42),(.6,.08),(-1.5,.08)];coords=[]
 for a,b in uv:coords.append((x+a*math.cos(angle)-b*math.sin(angle),y+a*math.sin(angle)+b*math.cos(angle)))
 mesh_obj('P_Directional_Arrow',[[a,b,z_at(a,b)+.018] for a,b in coords],[list(range(len(coords)))],mats['paint'],'18_Proposed_Markings')
# Consistent saved cameras and sun for actual proposed/baseline renders.
for o in list(scene.objects):
 if o.type in {'CAMERA','LIGHT'}:bpy.data.objects.remove(o,do_unlink=True)
views=[{'name':'01_campus_masterplan','location':[-240,165,300],'target':[-30,365,24],'ortho':315},{'name':'02_main_entrance','location':[-101,393,19.2],'target':[-64,412,20.7],'lens':32},{'name':'03_roads_and_parking','location':[78,292,105],'target':[-3,344,24],'ortho':145},{'name':'04_pedestrian_and_green','location':[-128,455,116],'target':[-51,417,20],'ortho':160},{'name':'05_full_neighborhood','location':[0,-850,1450],'target':[0,0,25],'ortho':1850}]
for v in views:
 data=bpy.data.cameras.new(v['name']);o=bpy.data.objects.new(v['name'],data);layers['22_Cameras_and_Lighting'].objects.link(o);o.location=v['location'];direction=(Vector(v['target'])-o.location).normalized();o.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();data.clip_end=10000
 if 'ortho' in v:data.type='ORTHO';data.ortho_scale=v['ortho'];o.location-=direction*1500
 else:data.lens=v['lens'];data.clip_start=.1
 if v['name']=='01_campus_masterplan':scene.camera=o
sun_data=bpy.data.lights.new('Proposed soft daylight','SUN');sun_data.energy=3;sun_data.angle=.25;sun=bpy.data.objects.new('Proposed soft daylight',sun_data);layers['22_Cameras_and_Lighting'].objects.link(sun);sun.rotation_euler=(.35,-.45,-.6);world=bpy.data.worlds.new('Masterplan daylight');world.use_nodes=True;scene.world=world;world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.79,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=8;scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.view_settings.view_transform='AgX'
# Numerical building hashes must match the original before any export.
baseline=json.loads((d/'validation/baseline_building_hashes.json').read_text());errors=[]
for name,expected in baseline['buildings'].items():
 o=bpy.data.objects.get(name)
 if o is None:errors.append(name+' missing');continue
 value={'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'faces':[list(f.vertices) for f in o.data.polygons]};actual=hashlib.sha256(json.dumps(value,separators=(',',':')).encode()).hexdigest()
 if actual!=expected or len(o.data.materials)!=1:errors.append(name)
assert not errors,errors
for image in bpy.data.images:
 if image.source=='FILE' and image.users:
  name=Path(image.filepath).name;path=d/'textures'/name
  if path.exists():image.pack();image.filepath='//textures/'+name
scene['masterplan_status']='PROPOSED CIRCULATION CONCEPT — all buildings locked; civil/accessibility/fire/ownership checks pending survey';scene['screenshot_imagery_manifest']='//textures/screenshot_manifest.json'
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.shading.type='MATERIAL';area.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(d/'Monroe_Campus_Road_Redesign.blend'))
# Export visible working geometry only; original backups remain in the editable BLEND.
bpy.ops.object.select_all(action='DESELECT');working=[]
for o in scene.objects:
 if o.type in {'MESH','EMPTY'} and not o.get('_proposal_backup') and not o.get('_screenshot_backup'):
  o.select_set(True)
  if o.type=='MESH':working.append(o)
bpy.ops.export_scene.fbx(filepath=str(d/'Monroe_Campus_Road_Redesign.fbx'),use_selection=True,object_types={'MESH','EMPTY'},axis_forward='Y',axis_up='Z',apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',use_mesh_edges=False,path_mode='COPY',embed_textures=True,add_leaf_bones=False,use_custom_props=True)
refs=[]
for o in working:refs.append({'name':o.name,'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'triangles':sum(len(f.vertices)-2 for f in o.data.polygons),'materials':len(o.data.materials)})
(w/'export_reference.json').write_text(json.dumps(refs));(w/'cameras.json').write_text(json.dumps(views,indent=2));(d/'validation/building_lock_check.json').write_text(json.dumps({'passed':True,'buildings':len(baseline['buildings']),'geometry_hash_failures':errors,'baseline_file_unchanged':hashlib.sha256(source.read_bytes()).hexdigest()==baseline['baseline_sha256'],'source_tree_proxy_count':len(trees),'tree_removal_candidates':list(removed),'retained_source_tree_count':len(trees)-len(removed),'new_proposed_trees':len(p['new_trees'])},indent=2));print('MASTERPLAN_EXPORTED',len(working),flush=True)
