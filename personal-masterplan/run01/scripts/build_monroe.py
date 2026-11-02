"""Blender 4.3+: --background --python build_monroe.py -- --output DIRECTORY

Reference-based approximation ONLY. No SKP geometry or verified georeference.
All numeric dimensions, heights and landscape positions below are estimates.
Local axes follow the supplied aerial screenshot, not verified true north.
"""
import bpy, math, random, json, sys, argparse
from pathlib import Path
from mathutils import Vector

args = argparse.ArgumentParser()
args.add_argument('--output', required=True)
args.add_argument('--skip-renders', action='store_true')
opt = args.parse_args(sys.argv[sys.argv.index('--')+1:])
OUT = Path(opt.output).resolve(); OUT.mkdir(parents=True, exist_ok=True)
(OUT/'previews').mkdir(exist_ok=True)
random.seed(41)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'; scene.unit_settings.scale_length = 1
scene['accuracy'] = 'APPROXIMATE REFERENCE MODEL — NOT SURVEYED OR GEOREFERENCED'
scene['source_imported'] = False
scene['site_address_supplied'] = '601 50th St NE, Washington, DC 20019'
scene['dimensions'] = 'All dimensions estimated. 5.2 screenshot pixels per nominal metre is an arbitrary modeling scale, not measured.'
names = ['00_SOURCE_ORIGINAL_NOT_IMPORTED','01_TERRAIN_ESTIMATED_FLAT','02_EXISTING_BUILDINGS_APPROX','03_ROADS_SIDEWALKS_PARKING','04_LANDSCAPE_APPROX','05_ROOF_SOLAR_DETAILS','06_FACADE_DETAILS','07_PRESENTATION','08_MATERIAL_LIBRARY','09_PROPOSED_EMPTY']
cols = {n:bpy.data.collections.new(n) for n in names}
for c in cols.values(): scene.collection.children.link(c)
cols[names[0]]['status'] = 'SKP preserved externally; no source geometry imported.'

def mat(name,color,rough=.75,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 return m
brick=mat('Brick | reference approximation',(.56,.25,.13))
tex=OUT/'textures'/'brick.png'
if not tex.exists(): raise RuntimeError('Missing textures/brick.png; run prepare_textures.py first')
image=bpy.data.images.load(str(tex));image.pack()
node=brick.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
brick.node_tree.links.new(node.outputs['Color'],brick.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
cream=mat('Pale precast concrete',(.65,.61,.50)); glass=mat('Blue grey glazing',(.11,.22,.28),.28,.35)
roof=mat('Warm grey flat roofing',(.40,.40,.36)); asphalt=mat('Asphalt',(.15,.17,.18)); paving=mat('Concrete paths',(.64,.64,.58))
grass=mat('Lawns',(.24,.36,.17)); soil=mat('Mulch',(.23,.16,.09)); white=mat('Paint and solar frames',(.79,.81,.77))
solar=mat('Solar blue modules',(.025,.075,.13),.25,.55); door=mat('School blue doors',(.025,.23,.43)); bark=mat('Tree trunks',(.22,.14,.08))
leaves=[mat('Foliage '+str(i),c) for i,c in enumerate([(.14,.26,.10),(.20,.32,.13),(.30,.39,.15),(.17,.31,.19)])]
context=mat('Adjacent light brick',(.60,.43,.29)); metal=mat('Rooftop equipment',(.55,.58,.56),.5,.4)

def move(obj,c):
 for old in list(obj.users_collection):old.objects.unlink(obj)
 cols[names[c]].objects.link(obj)
 return obj

mesh_cache={}
def box(name,loc,size,material,c=2):
 key=(tuple(size),material.name)
 if key not in mesh_cache:
  x,y,z=[v/2 for v in size]
  coords=[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
  faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
  mesh=bpy.data.meshes.new(name+' geometry');mesh.from_pydata(coords,[],faces);mesh.update()
  mesh.materials.append(material);uv=mesh.uv_layers.new(name='UVMap')
  for poly in mesh.polygons:
   axis=max(range(3),key=lambda a:abs(poly.normal[a]));axes=[a for a in range(3) if a!=axis]
   for li in poly.loop_indices:
    v=mesh.vertices[mesh.loops[li].vertex_index].co
    uv.data[li].uv=(v[axes[0]]/4,v[axes[1]]/2)
  mesh_cache[key]=mesh
 o=bpy.data.objects.new(name,mesh_cache[key]);o.location=loc;cols[names[c]].objects.link(o)
 o['accuracy']='Estimated from references; not measured'
 return o

def xy(px,py):return ((px-770)/5.2,(750-py)/5.2)
paving_sequence=0
def rect(name,x0,y0,x1,y1,height,material,c=2,base=.08):
 global paving_sequence
 if c==3:
  paving_sequence+=1; base+=paving_sequence*.0003
 x,y=xy((x0+x1)/2,(y0+y1)/2)
 return box(name,(x,y,base+height/2),((x1-x0)/5.2,(y1-y0)/5.2,height),material,c)

def line(name,a,b,width,z,material,c=3):
 a=Vector(a);b=Vector(b);d=b-a
 o=box(name,((a.x+b.x)/2,(a.y+b.y)/2,z),(d.length,width,.035),material,c)
 o.rotation_euler.z=math.atan2(d.y,d.x);return o

# Broad reference composition. Flat terrain deliberately avoids invented contours.
rect('Approximate flat ground — NO CADMAPPER TERRAIN',70,70,1500,1350,.5,grass,1,base=-.5)
rect('50th Street approximate alignment',348,60,402,1290,.06,asphalt,3)
rect('50th Street west sidewalk',326,60,346,1290,.09,paving,3)
rect('50th Street east sidewalk',405,80,425,1280,.09,paving,3)
rect('Northern road context',70,55,1500,103,.06,asphalt,3)
rect('Southern road context',70,1220,1470,1270,.06,asphalt,3)
rect('South sidewalk',75,1203,1450,1218,.08,paving,3)
rect('School drive and parking base',595,482,1010,867,.10,asphalt,3)
rect('South service access',604,831,650,1195,.08,asphalt,3)
rect('South outbuilding parking',751,911,827,1110,.08,asphalt,3)
rect('Main west entrance walk',648,545,684,849,.13,paving,3)
rect('Main east footpath',964,585,983,839,.11,paving,3)
rect('School forecourt',623,824,976,860,.11,paving,3)
for yy in [873,897,921,945,969,993,1017,1041,1065]:
 a=xy(763,yy);b=xy(807,yy);line('Parking stall stripe',a,b,.11,.20,white)
for yy in range(160,1190,80):
 a=xy(375,yy);b=xy(375,yy+35);line('Road centre dash',a,b,.10,.17,white)
for xx in range(351,401,7): rect('Crosswalk stripe',xx,1185,xx+3,1210,.012,white,3,base=.15)

def building(name,bounds,h,material=brick,detail=True):
 x0,y0,x1,y1=bounds
 o=rect(name,x0,y0,x1,y1,h,material)
 o['height_estimated_m']=h
 rect(name+' roof slab',x0-2,y0-2,x1+2,y1+2,.22,roof,5,base=h+.08)
 for a,b,c,d in [(x0,y0,x1,y0+2),(x0,y1-2,x1,y1),(x0,y0,x0+2,y1),(x1-2,y0,x1,y1)]:
  rect(name+' parapet coping',a,b,c,d,.42,cream,5,base=h+.25)
 if detail:
  floors=max(1,round(h/3.6))
  for floor in range(floors):
   z=1.8+floor*(h/floors)
   for px in range(int(x0+12),int(x1-8),22):
    for py in [y0-1,y1+1]:
     wx,wy=xy(px,py);box(name+' window',(wx,wy,z),(2.9,.12,1.55),glass,6)
     box(name+' sill',(wx,wy,z-.85),(3.1,.30,.14),cream,6)
     box(name+' mullion',(wx,wy,z),(.08,.18,1.55),white,6)
   for py in range(int(y0+12),int(y1-8),22):
    for px in [x0-1,x1+1]:
     wx,wy=xy(px,py);box(name+' side window',(wx,wy,z),(.12,2.9,1.55),glass,6)
     box(name+' side sill',(wx,wy,z-.85),(.30,3.1,.14),cream,6)
     box(name+' side mullion',(wx,wy,z),(.18,.08,1.55),white,6)
  # Pale vertical facade piers and horizontal bands visible in school photo.
  for py in range(int(y0+2),int(y1),44):
   for px in [x0-2,x1+2]:
    wx,wy=xy(px,py);box(name+' facade pier',(wx,wy,h/2),(.35,.50,h),cream,6)
  for py in [y0-2,y1+2]:
   for px in range(int(x0+2),int(x1),44):
    wx,wy=xy(px,py);box(name+' end pier',(wx,wy,h/2),(.50,.35,h),cream,6)
  for z in [h-.4, h/floors if floors>1 else h-.4]:
   rect(name+' west band',x0-2,y0,x0,y1,.25,cream,6,base=z)
   rect(name+' east band',x1,y0,x1+2,y1,.25,cream,6,base=z)
   rect(name+' south band',x0,y1,x1,y1+2,.25,cream,6,base=z)
 return o

building('MONROE | main classroom bar',(688,532,812,832),10.2)
building('MONROE | east low wing',(812,610,959,770),7.2)
building('MONROE | north hall',(766,353,950,432),6.4)
building('MONROE | south detached block',(664,935,750,1072),6.0)
building('Context | west residential north',(405,644,550,852),17,context)
building('Context | west residential south',(392,857,550,1160),17,context)
building('Context | west residential link',(424,837,558,879),14,context,False)
building('Context | east campus bar',(1210,815,1270,1025),7.5,context)
building('Context | east campus crossbar',(1120,709,1330,763),7.5,context)
building('Context | east campus low bar',(1090,1120,1290,1170),6.5,context)
for px,py,w,d in [(220,370,70,55),(205,490,70,60),(212,610,65,54),(240,850,88,65),(205,1000,65,55),(210,1115,70,54)]:
 building('Context | west neighborhood',(px,py,px+w,py+d),7,cream,False)

# Solar arrays: individual editable panels, perimeter rails and rooftop vents.
for label,b,h in [('Main',(696,545,803,820),10.2),('Wing',(823,622,948,757),7.2),('North',(779,365,938,419),6.4),('South',(676,946,739,1060),6),('Neighbor',(415,658,539,835),17),('Neighbor south',(405,890,540,1145),17)]:
 x0,y0,x1,y1=b
 for py in range(y0,y1-9,15):
  for px in range(x0,x1-5,9):
   x,y=xy(px+3,py+5)
   box(label+' solar panel frame',(x,y,h+.48),(1.58,2.48,.08),white,5)
   p=box(label+' solar module',(x,y,h+.535),(1.43,2.32,.035),solar,5)
   p.rotation_euler.x=.035
 for px in [x0+10,x1-10]:
  x,y=xy(px,y0+15);box(label+' roof equipment',(x,y,h+1.0),(1.6,1.8,1.4),metal,5)

# Doors and entrance canopy at the south end of the classroom block.
for px in [724,739,754]:
 x,y=xy(px,833);box('MONROE | blue entrance door',(x,y,1.5),(2.3,.18,2.8),door,6)
x,y=xy(739,846);box('MONROE | entry canopy',(x,y,3.7),(12,4,.35),cream,6)
for px in [710,768]:
 x,y=xy(px,852);box('Entrance canopy column',(x,y,1.8),(.25,.25,3.6),cream,6)

# Schematic school name sign, not a measured reproduction of the real lettering.
sx,sy=xy(750,834)
box('MONROE | sign backing',(sx,sy,9.35),(19,.22,.95),cream,6)
font=bpy.data.curves.new('School sign typography','FONT');font.body='THE MONROE SCHOOL';font.align_x='CENTER';font.size=.65;font.extrude=.006
sign=bpy.data.objects.new('MONROE | approximate name sign',font);cols[names[6]].objects.link(sign)
sign.location=(sx,sy-.50,9.12);sign.rotation_euler.x=math.pi/2;font.materials.append(glass)
bpy.context.view_layer.update()
mesh=bpy.data.meshes.new_from_object(sign.evaluated_get(bpy.context.evaluated_depsgraph_get()))
# Remove zero-area cap faces produced by font tessellation.
import bmesh
mesh.update();bad_indices=[p.index for p in mesh.polygons if p.area<1e-10]
bm=bmesh.new();bm.from_mesh(mesh);bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm,geom=[bm.faces[i] for i in bad_indices],context='FACES_ONLY')
bm.to_mesh(mesh);bm.free();mesh.update()
signmesh=bpy.data.objects.new('MONROE | approximate name sign',mesh);signmesh.matrix_world=sign.matrix_world.copy();cols[names[6]].objects.link(signmesh)
bpy.data.objects.remove(sign,do_unlink=True)

# Trees are generic editable forms, approximate canopy positions only.
import bmesh
foliage_meshes={}
for material in leaves:
 bm=bmesh.new();bmesh.ops.create_icosphere(bm,subdivisions=1,radius=1)
 mesh=bpy.data.meshes.new('Reusable editable canopy '+material.name);bm.to_mesh(mesh);bm.free();mesh.materials.append(material)
 foliage_meshes[material.name]=mesh
trunk_mesh=bpy.data.meshes.new('Reusable editable trunk')
vs=[(.22*math.cos(i*math.pi/4),.22*math.sin(i*math.pi/4),z) for z in [0,1] for i in range(8)]
fs=[tuple(reversed(range(8))),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
trunk_mesh.from_pydata(vs,[],fs);trunk_mesh.materials.append(bark)
def tree(px,py,r=3.0):
 x,y=xy(px,py);h=random.uniform(6,10)
 o=bpy.data.objects.new('Estimated tree trunk',trunk_mesh);o.location=(x,y,0);o.scale.z=h*.65;cols[names[4]].objects.link(o)
 for dx,dy,dz,s in [(0,0,0,1),(-r*.5,0,-1,.75),(r*.45,r*.2,-.5,.8)]:
  material=random.choice(leaves);o=bpy.data.objects.new('Estimated tree canopy',foliage_meshes[material.name])
  o.location=(x+dx,y+dy,h+dz);o.scale=(r*s,r*s,r*s*1.2);cols[names[4]].objects.link(o)

for px,py in [(475,300),(525,330),(590,275),(680,320),(725,250),(830,282),(940,290),(1040,340),(1150,390),(1270,390),(1380,470),(460,470),(515,530),(565,605),(550,720),(530,900),(560,1080),(600,1170),(890,920),(930,1000),(980,1120),(1090,1090),(1350,1100),(1390,800),(1430,620),(1020,540),(1070,615),(1080,870),(1190,1000),(435,1130),(980,480),(640,400),(1130,250),(1250,250),(1390,240)]:tree(px,py,random.uniform(3.1,5.1))
for i in range(26):
 px=random.uniform(980,1460);py=random.uniform(120,600)
 tree(px,py,random.uniform(3,4.5))

# Parking vehicles are schematic context, not reference measurements.
for j,yy in enumerate([893,941,989,1037]):
 x,y=xy(785,yy);car=mat('Car paint '+str(j),[(.6,.1,.07),(.75,.76,.72),(.10,.15,.23),(.25,.28,.30)][j],.3,.25)
 box('Parked car schematic',(x,y,.8),(4.2,1.8,1.2),car,3)
 box('Car glazed cabin',(x,y,1.55),(2.1,1.6,.45),glass,3)

# Presentation cameras and illumination.
world=bpy.data.worlds.new('Soft daylight');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.69,.77,.86,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
bpy.ops.object.light_add(type='SUN', location=(0,0,100));sun=bpy.context.object;sun.name='Daylight sun';sun.data.energy=3;sun.data.angle=math.radians(20);sun.rotation_euler=(.45,-.5,-.5);move(sun,7)
def camera(name,loc,target,ortho=None,lens=46):
 bpy.ops.object.camera_add(location=loc);o=bpy.context.object;o.name=name;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();o.data.lens=lens;o.data.clip_end=2000
 if ortho:o.data.type='ORTHO';o.data.ortho_scale=ortho
 move(o,7);return o
cameras=[camera('Aerial master plan',(0,-5,310),(0,-5,0),275),camera('Birds eye',(-170,-195,175),(0,0,0),None,44),camera('Street architectural',(-34,-38,2.2),(-8,-4,5),None,25),camera('Building focused',(80,-95,57),(5,15,5),None,49)]
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False
scene.render.threads_mode='FIXED';scene.render.threads=8
scene.render.resolution_x=1280;scene.render.resolution_y=960;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
scene.camera=cameras[1]
scene.render.film_transparent=False
readme=bpy.data.texts.new('READ_ME_ACCURACY.txt');readme.write('APPROXIMATE REFERENCE-BASED PROTOTYPE. No SKP geometry imported. All dimensions and heights estimated. Local modelling units are nominal metres. No verified CRS, georeferencing, survey control, boundary or terrain elevations. Original SKP is preserved in source package. No redesign. See delivery report.\n')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Monroe_MasterPlan.blend'))
# Export model geometry only, no cameras/lights.
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
 if o.type=='MESH': o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'Monroe_MasterPlan.glb'),export_format='GLB',use_selection=True,export_extras=True)
# OBJ needs an external image path; the saved BLEND and GLB already pack it.
image.unpack(method='REMOVE');image.filepath=str(tex)
bpy.ops.wm.obj_export(filepath=str(OUT/'Monroe_MasterPlan.obj'),export_selected_objects=True,export_materials=True,path_mode='RELATIVE')
bpy.ops.export_scene.fbx(filepath=str(OUT/'Monroe_MasterPlan.fbx'),use_selection=True,object_types={'MESH'},path_mode='COPY',embed_textures=True,add_leaf_bones=False)
if not opt.skip_renders:
 for cam,name in zip(cameras,['01_aerial','02_birds_eye','03_street','04_building']):
  scene.camera=cam;scene.render.filepath=str(OUT/'previews'/f'{name}.png');bpy.ops.render.render(write_still=True)
print('MONROE_BUILD_FINISHED', len([o for o in scene.objects if o.type=='MESH']))
