from pathlib import Path
from PIL import Image,ImageDraw
import json,hashlib,shutil,zipfile
w=Path('/workspace/monroe-pavement-fix');d=w/'delivery';p=d/'previews';pipeline=d/'pipeline';pipeline.mkdir(exist_ok=True)
for s in (w/'scripts').glob('*.py'):shutil.copy2(s,pipeline/s.name)
for f in d.rglob('*.blend1'):f.unlink()
def gallery(names,cols,size,out):
 cellw,cellh=size;canvas=Image.new('RGB',(cols*cellw,((len(names)+cols-1)//cols)*cellh),'white');draw=ImageDraw.Draw(canvas)
 for i,(name,label) in enumerate(names):
  im=Image.open(p/(name+'.png')).convert('RGB');im.thumbnail((cellw,cellh-26));x=(i%cols)*cellw;y=(i//cols)*cellh;canvas.paste(im,(x+(cellw-im.width)//2,y));draw.text((x+12,y+cellh-22),label,fill='black')
 canvas.save(p/out)
shutil.copy2('/workspace/monroe-townhouse-correction/delivery/previews/existing_01_campus_masterplan.png',p/'before_existing_01_campus_masterplan.png')
gallery([('before_existing_01_campus_masterplan','Before pavement and material corrections'),('existing_01_campus_masterplan','After corrections - same camera')],2,(800,626),'before_after.png')
gallery([('existing_01_campus_masterplan','Original site'),('proposed_01_campus_masterplan','Proposed site - same camera')],2,(800,626),'layout_comparison.png')
gallery([('existing_22_school_facade_forecourt','School facade and concrete forecourt'),('existing_21_original_60ft_parking','Original parking - 60 ft module'),('proposed_15_garage_curb_fix','Garage apron stops at carriageway'),('proposed_16_network_junction_fix','Wider streets and continuous sidewalks'),('proposed_17_baseball_smooth_boundary','Smooth editable baseball infield'),('proposed_18_grass_roof_no_imagery','Woodson grass roof'),('proposed_19_housing_white_roofs_sidewalks','White housing roofs and sidewalks'),('proposed_20_corner_brick_white_columns','Corner red brick and white trim')],2,(650,515),'feature_gallery.png')
inventory=[]
for f in sorted(d.rglob('*')):
 if f.is_file() and f.name!='INVENTORY.json':inventory.append({'path':str(f.relative_to(d)),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
(d/'INVENTORY.json').write_text(json.dumps(inventory,indent=2))
archive=w/'Monroe_Pavement_and_Material_Fixes_Original_and_Proposed.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for f in sorted(d.rglob('*')):
  if f.is_file():z.write(f,'Monroe_Pavement_Fix/'+str(f.relative_to(d)))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
print('ZIP_CRC_PASSED',archive,archive.stat().st_size,flush=True)
