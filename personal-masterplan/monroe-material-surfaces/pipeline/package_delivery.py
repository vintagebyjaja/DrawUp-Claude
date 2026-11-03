from pathlib import Path
from PIL import Image,ImageDraw
import shutil,json,hashlib,zipfile
w=Path('/workspace/monroe-material-update');d=w/'delivery';previews=d/'previews'
required=['existing_01_campus_masterplan.png','proposed_01_campus_masterplan.png','proposed_03_roads_and_parking.png','proposed_05_full_neighborhood.png','proposed_06_football_and_bleachers.png','proposed_07_baseball_layers.png','proposed_08_apartment_materials.png']
assert all((previews/p).exists() for p in required),'Render previews incomplete'
for v in ['existing','proposed']:
 for suffix in ['native_checks','fbx_checks','collada_checks']:
  assert json.loads((d/'validation'/(v+'_'+suffix+'.json')).read_text())['passed'],(v,suffix)
for pairs,name in [([(previews/'existing_01_campus_masterplan.png','ORIGINAL ROAD ALIGNMENTS / UPDATED SURFACES'),(previews/'proposed_01_campus_masterplan.png','PROPOSED ROAD LAYOUT / UPDATED SURFACES')],'comparison.png'),([(Path('/workspace/monroe-two-layouts/delivery/previews/proposed_01_campus_masterplan.png'),'PREVIOUS DELIVERY'),(previews/'proposed_01_campus_masterplan.png','UPDATED GROUND / FACADES / SIDEWALKS')],'prior_vs_updated.png')]:
 out=Image.new('RGB',(2000,800),'white');dr=ImageDraw.Draw(out)
 for i,(path,title) in enumerate(pairs):
  im=Image.open(path).convert('RGB').resize((1000,750));out.paste(im,(i*1000,50));dr.text((i*1000+20,18),title,fill='black')
 out.save(previews/name)
shutil.copytree(w/'scripts',d/'pipeline',ignore=shutil.ignore_patterns('__pycache__'),dirs_exist_ok=True)
for old in d.rglob('*.blend1'):old.unlink()
files=sorted(p for p in d.rglob('*') if p.is_file() and p.name!='INVENTORY.json')
(d/'INVENTORY.json').write_text(json.dumps([{'path':str(p.relative_to(d)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files],indent=2))
zipname='Monroe_Material_Surfaces_Original_and_Proposed.zip';zpath=w/zipname
with zipfile.ZipFile(zpath,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in sorted(d.rglob('*')):
  if p.is_file():z.write(p,Path('Monroe_Material_Surfaces')/p.relative_to(d))
with zipfile.ZipFile(zpath) as z:assert z.testzip() is None
repo=Path('/workspace/DrawUp-Claude/personal-masterplan/monroe-material-surfaces');repo.mkdir(parents=True,exist_ok=True);shutil.copy2(zpath,repo/zipname)
for name in ['README.md','SKETCHUP_README.md','Create_SketchUp_File.rb','INVENTORY.json']:shutil.copy2(d/name,repo/name)
for name in ['previews','validation','pipeline']:shutil.copytree(d/name,repo/name,dirs_exist_ok=True)
print('ZIP_VERIFIED',zpath,zpath.stat().st_size,'bytes',flush=True)
