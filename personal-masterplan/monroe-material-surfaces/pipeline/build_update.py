import bpy,json,hashlib,math,shutil,collections
import numpy as np
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
from PIL import Image
w=Path('/workspace/monroe-material-update');d=w/'delivery';old=Path('/workspace/monroe-two-layouts/delivery');shared=d/'Shared_Textures';shutil.copytree(old/'Shared_Textures',shared,dirs_exist_ok=True);baseline=json.loads(Path('/workspace/monroe-road-redesign/delivery/validation/baseline_building_hashes.json').read_text())['buildings'];bleacherids={'building_1336','building_1530','building_1548','building_1850'}
def working(o):return o.type=='MESH' and not any(o.get(k) for k in ['_proposal_backup','_screenshot_backup','_variant_backup','_material_backup'])
def hash_obj(o):return hashlib.sha256(json.dumps({'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'faces':[list(f.vertices) for f in o.data.polygons]},separators=(',',':')).encode()).hexdigest()
def mat(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1);m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.86;return m
# Repaint the existing atlas by actual wall height. UVs, glazing, roof and building geometry stay fixed.
def apartment(o):
 material=o.data.materials[0].copy();material.name='Apartment | red lower brick and gray upper floor';node=next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.colorspace_settings.name!='Non-Color');source=Path('/workspace/monroe-screenshot/delivery/textures/building_2603_Unified_Color.png');a=np.array(Image.open(source).convert('RGB'));H,W=a.shape[:2];height=np.full((H,W),np.nan,dtype=np.float32);mesh=o.data;mesh.calc_loop_triangles();uv=mesh.uv_layers.active
 for tri in mesh.loop_triangles:
  if abs(tri.normal.z)>.55:continue
  points=np.array([list(o.matrix_world@mesh.vertices[i].co) for i in tri.vertices]);xy=np.array([[uv.data[i].uv.x*(W-1),(1-uv.data[i].uv.y)*(H-1)] for i in tri.loops]);xmin,ymin=np.maximum(np.floor(xy.min(0)).astype(int),0);xmax,ymax=np.minimum(np.ceil(xy.max(0)).astype(int),[W-1,H-1])
  if xmax<xmin or ymax<ymin:continue
  M=np.c_[xy,np.ones(3)]
  if abs(np.linalg.det(M))<1e-5:continue
  xx,yy=np.meshgrid(np.arange(xmin,xmax+1),np.arange(ymin,ymax+1));sample=np.c_[xx.ravel(),yy.ravel(),np.ones(xx.size)];weights=sample@np.linalg.inv(M);mask=np.all(weights>=-.001,axis=1);zz=weights@points[:,2];view=height[ymin:ymax+1,xmin:xmax+1];view.ravel()[mask]=zz[mask]
 # NumPy subarray ravel can copy: write using explicit tile values instead.
  tile=height[ymin:ymax+1,xmin:xmax+1].copy().reshape(-1);tile[mask]=zz[mask];height[ymin:ymax+1,xmin:xmax+1]=tile.reshape(yy.shape)
 finite=np.isfinite(height);print('WINDOW_HEIGHT_QUANTILES', np.nanpercentile(height[(a[:,:,2]>a[:,:,0]*1.13)&finite],[10,30,50,70,90,98]).tolist(),flush=True);zmin=min((o.matrix_world@v.co).z for v in mesh.vertices);zmax=max((o.matrix_world@v.co).z for v in mesh.vertices);threshold=zmax-3.4;r,g,b=[a[:,:,i].astype(float) for i in range(3)];glazing=(b>r*1.13)&(g>r*1.06);wall=finite&~glazing&(a.mean(2)>35);lum=a.mean(2);detail=np.clip((lum-150)*.35,-32,32)
 for select,target in [(wall&(height<threshold),[153,72,50]),(wall&(height>=threshold),[127,134,138])]:a[select]=np.clip(np.array(target)+detail[select,None],0,255).astype(np.uint8)
 imagepath=shared/'Apartment_Red_Brick_Gray_Upper.png';Image.fromarray(a).save(imagepath);node.image=bpy.data.images.load(str(imagepath),check_existing=True);node.image.pack();o.data.materials[0]=material;o['facade_update']='Red lower masonry and gray top window storey, painted by world wall height; glazing retained.';return {'threshold_world_z_m':threshold,'lower_wall_pixels':int(np.count_nonzero(wall&(height<threshold))),'upper_wall_pixels':int(np.count_nonzero(wall&(height>=threshold)))}
for variant,folder,filename in [('existing','01_Original_Road_Layout','Monroe_Original_Road_Layout'),('proposed','02_New_Road_Layout','Monroe_New_Road_Layout')]:
 bpy.ops.wm.open_mainfile(filepath=str(old/folder/(filename+'.blend')));scene=bpy.context.scene;backup=bpy.data.collections.new('00_Material_Upgrade_Backup');scene.collection.children.link(backup);backup.hide_render=True;backup.hide_viewport=True
 def retire(o):
  for c in list(o.users_collection):c.objects.unlink(o)
  backup.objects.link(o);o['_material_backup']=True
 mats={k:mat('Site material | '+k,c) for k,c in {'grass':(.17,.31,.075),'sports_grass':(.095,.25,.085),'dirt':(.46,.25,.105),'track':(.34,.075,.055),'concrete':(.62,.63,.59),'paint':(.9,.91,.86),'bleacher':(.53,.56,.59)}.items()}
 for key in ['grass','sports_grass','dirt','concrete']:
  nt=mats[key].node_tree;noise=nt.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=3 if 'grass' in key else 14;bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.08;bump.inputs['Distance'].default_value=.02;nt.links.new(noise.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs['Normal'],nt.nodes['Principled BSDF'].inputs['Normal'])
 grasscount=0
 for o in list(scene.objects):
  if working(o) and o.name.startswith('Terrain_'):o.data.materials.clear();o.data.materials.append(mats['grass']);grasscount+=1;o['terrain_display']='Material grass replaces ground aerial photograph; original image material retained in source version.'
 # Undo the previous blanket neutralization. Preserve only photo-supported local light facades.
 with bpy.data.libraries.load('/workspace/monroe-screenshot/delivery/Monroe_Screenshot_Terrain.blend',link=False) as (source_data,target_data):
  target_data.materials=[name for name in source_data.materials if name.startswith('Context single atlas') and bpy.data.materials.get(name) is None]
 light_ids={'building_2320','building_2788','building_2066','building_2607'}
 gray_ids={'building_2011','building_2170','building_2580','building_2792','building_3024'}
 audit=[]
 for ob in list(scene.objects):
  if not working(ob) or not ob.name.startswith('building_') or ob.name in bleacherids:continue
  m=ob.data.materials[0]
  if ob.name in light_ids or ob.name in gray_ids:
   status='Local light/gray facade interpretation from campus oblique reference; approximate building identification and material, not a street survey.'
  elif ob.name=='building_2603':status='User-corrected apartment: red lower brick, gray upper window row.'
  elif m.name.startswith('NeutralFacade | ') and ob.name!='building_2664':
   key=m.name.split('NeutralFacade | ',1)[1];original=bpy.data.materials.get(key)
   assert original is not None,('Missing original mixed material',key)
   ob.data.materials[0]=original;status='Earlier mixed context palette restored; individual facade not verified by available photos.'
  else:status='Retained existing reference-informed facade; see original source accuracy notes.'
  ob['facade_evidence_status']=status;audit.append({'building':ob.name,'material':ob.data.materials[0].name,'evidence_status':status})
 (d/'validation'/(variant+'_facade_evidence.json')).write_text(json.dumps(audit,indent=2))
 appearance=apartment(bpy.data.objects['building_2603']);print('APARTMENT_PAINT',variant,appearance,flush=True)
 sportnames={'E_Baseball_Field','E_Football_Field','E_Running_Track','E_Woodson_Baseball_Practice_Field'}
 for name in sportnames:retire(bpy.data.objects[name])
 cols={}
 for name in ['24_Neighborhood_Sidewalks','25_Neighborhood_Crosswalks','26_Editable_Sports_Parts','27_Stadium_Bleachers']:
  col=bpy.data.collections.new(name);scene.collection.children.link(col);cols[name]=col
 def mesh_obj(r,layer):
  m=bpy.data.meshes.new(r['name']);m.from_pydata(r['vertices'],[],r['faces']);m.update();m.materials.append(mats[r['material']]);o=bpy.data.objects.new(r['name'],m);cols[layer].objects.link(o);o['editable_surface_part']=True;o['source_accuracy']='Approximate image-derived sports surfaces; proposed sidewalk/marking geometry. See validation notes.';return o
 surfaceObjects=[o for o in scene.objects if working(o) and o.name.startswith('road_') and 'paths' not in o.name];vs=[];fs=[]
 for o in surfaceObjects:
  n=len(vs);vs.extend(o.matrix_world@v.co for v in o.data.vertices);fs.extend([i+n for i in p.vertices] for p in o.data.polygons)
 roadBVH=BVHTree.FromPolygons(vs,fs)
 additions=json.loads((w/(variant+'_additions.json')).read_text())
 for r in additions:
  if r['name'].startswith('N_Crosswalk'):
   for vi,v in enumerate(r['vertices']):
    hit=roadBVH.ray_cast(Vector((v[0],v[1],1000)),Vector((0,0,-1)))[0]
    if hit:v[2]=hit.z+(.022 if vi<len(r['vertices'])//2 else .016)
   # Paint is an editable surface, not a civil pavement volume: each point projects to the actual road.
   o=mesh_obj(r,'25_Neighborhood_Crosswalks')
  else:o=mesh_obj(r,'24_Neighborhood_Sidewalks')
 for r in json.loads((w/'sports_parts.json').read_text()):mesh_obj(r,'26_Editable_Sports_Parts')
 # Replace only four long stadium-side source masses identified as bleachers in the aerial.
 bleacherreport=[]
 for name in sorted(bleacherids):
  o=bpy.data.objects[name];p=np.array([list(o.matrix_world@v.co) for v in o.data.vertices]);lo=p.min(0);hi=p.max(0);retire(o);vertices=[];faces=[];rows=max(4,min(12,int((hi[0]-lo[0])/.80)));rowdepth=(hi[0]-lo[0])/rows;east=lo[0]>420
  for row in range(rows):
   x0=lo[0]+row*rowdepth if east else hi[0]-(row+1)*rowdepth;x1=x0+rowdepth;y0=lo[1];y1=hi[1];z0=lo[2]-.12;z1=lo[2]+.25+row*.28;start=len(vertices);vertices.extend([(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]);faces.extend([[start+i for i in f] for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]])
  mesh_obj({'name':'S_Bleachers_'+name.replace('building_',''),'vertices':vertices,'faces':faces,'material':'bleacher'},'27_Stadium_Bleachers');bleacherreport.append({'replaced_source_mass':name,'rows_illustrative':rows,'bounds_m':[lo.tolist(),hi.tolist()],'status':'Bleacher location consistent with aerial and user correction; row count and construction illustrative.'})
 failures=[]
 for name,h in baseline.items():
  if name in bleacherids:continue
  o=bpy.data.objects.get(name)
  if not o or hash_obj(o)!=h or len(o.data.materials)!=1:failures.append(name)
 assert not failures,failures
 for image in bpy.data.images:
  if image.source=='FILE' and image.users:
   base=Path(image.filepath).name
   if (shared/base).exists():
    if not image.packed_file:image.pack()
    image.filepath='//../Shared_Textures/'+base
 scene['terrain_display']='Full study area uses ground materials; no aerial photograph painted on working terrain.';scene['bleacher_correction_source_ids']=','.join(sorted(bleacherids));scene['ground_surface_scheme']='Illustrative grass for unmapped residual ground, with existing modeled pavement preserved; not a landcover survey.'
 out=d/folder;out.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(out/(filename+'.blend')));bpy.ops.object.select_all(action='DESELECT');workingobjects=[]
 for o in scene.objects:
  if working(o):o.select_set(True);workingobjects.append(o)
 bpy.ops.export_scene.fbx(filepath=str(out/(filename+'.fbx')),use_selection=True,object_types={'MESH'},axis_forward='Y',axis_up='Z',apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',use_mesh_edges=False,path_mode='COPY',embed_textures=True,add_leaf_bones=False,use_custom_props=True)
 refs=[{'name':o.name,'points':[list(o.matrix_world@v.co) for v in o.data.vertices],'triangles':sum(len(f.vertices)-2 for f in o.data.polygons),'materials':len(o.data.materials)} for o in workingobjects];(w/(variant+'_reference.json')).write_text(json.dumps(refs));(d/'validation'/(variant+'_native_checks.json')).write_text(json.dumps({'passed':True,'unchanged_buildings':3155,'authorized_bleacher_replacements':bleacherreport,'building_hash_failures':failures,'terrain_meshes_with_grass_material':grasscount,'apartment':appearance,'working_meshes':len(workingobjects),'native_skp_export_available':False},indent=2));print('EXPORTED',variant,len(workingobjects),flush=True)
