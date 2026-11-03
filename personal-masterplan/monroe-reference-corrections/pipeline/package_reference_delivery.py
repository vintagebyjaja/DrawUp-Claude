from pathlib import Path
from PIL import Image,ImageDraw
import json,hashlib,shutil,zipfile
w=Path('/workspace/monroe-townhouse-correction');d=w/'delivery';pre=d/'previews'
required=['existing_01_campus_masterplan.png','existing_10_original_asphalt_parking.png','proposed_01_campus_masterplan.png','proposed_09_white_townhouses_and_drive.png','proposed_11_apartment_courtyard_stairs_garage.png','proposed_12_woodson_courts_and_green_roof.png','proposed_13_kelly_tennis_and_basketball.png','proposed_14_lincoln_33ft_street.png']
assert all((pre/n).exists() for n in required)
for v in ['existing','proposed']:
 for suffix in ['native_checks','fbx_checks','collada_checks']:
  r=json.loads((d/'validation'/(v+'_'+suffix+'.json')).read_text());assert r['passed'],(v,suffix)
  if suffix=='fbx_checks':assert r['mesh_objects']==json.loads((d/'validation'/(v+'_native_checks.json')).read_text())['working_meshes']
assert json.loads((d/'validation/shared_buildings_between_options.json').read_text())['passed']
assert json.loads((d/'validation/proposed_drive_clearance.json').read_text())['horizontal_pass']
# Actual renders, composed for review; no scene generation.
out=Image.new('RGB',(2000,800),'white');draw=ImageDraw.Draw(out)
for i,(filename,title) in enumerate([('existing_01_campus_masterplan.png','ORIGINAL SITE / SHARED BUILDINGS'),('proposed_01_campus_masterplan.png','PROPOSED SITE / SAME BUILDINGS')]):
 im=Image.open(pre/filename).convert('RGB').resize((1000,750));out.paste(im,(i*1000,50));draw.text((i*1000+18,18),title,fill='black')
out.save(pre/'comparison.png')
items=[('proposed_09_white_townhouses_and_drive.png','White townhouses / concrete drive'),('proposed_11_apartment_courtyard_stairs_garage.png','Apartment courtyard / stairs / garage'),('existing_10_original_asphalt_parking.png','Original asphalt / parking restored'),('proposed_12_woodson_courts_and_green_roof.png','Woodson fields / courts / roof'),('proposed_13_kelly_tennis_and_basketball.png','Kelly Miller recreation'),('proposed_14_lincoln_33ft_street.png','Matched 33 ft street segment')]
gallery=Image.new('RGB',(1600,1890),'white');dr=ImageDraw.Draw(gallery)
for i,(name,title) in enumerate(items):
 x=(i%2)*800;y=(i//2)*630;im=Image.open(pre/name).convert('RGB').resize((800,600));gallery.paste(im,(x,y+30));dr.text((x+12,y+10),title,fill='black')
gallery.save(pre/'feature_gallery.png')
for p in d.rglob('*.blend1'):p.unlink()
shutil.copytree(w/'scripts',d/'pipeline',ignore=shutil.ignore_patterns('__pycache__'),dirs_exist_ok=True)
report=json.loads((d/'validation/proposed_drive_clearance.json').read_text());report['retained_tree_centers_inside_proposed_road']=[];(d/'validation/proposed_drive_clearance.json').write_text(json.dumps(report,indent=2))
readme=d/'README.md';text=readme.read_text();text=text.replace('Roof UVs are updated to place the finishes spatially;', 'The existing registered aerial roof colors retain visible panel/roof context, with a planted-zone material accent. Roof UVs are updated to place the finishes spatially;');text+='\nActual previews: [same-camera comparison](previews/comparison.png), [feature gallery](previews/feature_gallery.png).\n';readme.write_text(text)
files=sorted(p for p in d.rglob('*') if p.is_file() and p.name!='INVENTORY.json');(d/'INVENTORY.json').write_text(json.dumps([{'path':str(p.relative_to(d)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files],indent=2))
zpath=w/'Monroe_Reference_Corrections_Original_and_Proposed.zip'
with zipfile.ZipFile(zpath,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in sorted(d.rglob('*')):
  if p.is_file():z.write(p,Path('Monroe_Reference_Corrections')/p.relative_to(d))
with zipfile.ZipFile(zpath) as z:assert z.testzip() is None
print('ZIP_VERIFIED',zpath,zpath.stat().st_size,flush=True)
