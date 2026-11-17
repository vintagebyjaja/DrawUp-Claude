"""Reproduce local source edits and checks in a new output directory."""
import argparse,os,sys,subprocess,shutil
from pathlib import Path
import fitz
p=argparse.ArgumentParser();p.add_argument('--output',required=True);args=p.parse_args();root=Path(__file__).resolve().parent.parent;work=Path(args.output).resolve()
if work.exists() and any(work.iterdir()):raise SystemExit('Use a new or empty output directory.')
work.mkdir(parents=True,exist_ok=True);shutil.copy2(root/'source/parking_options_1-3_original.pdf',work/'source.pdf');doc=fitz.open(work/'source.pdf');assert len(doc)==3
for i,page in enumerate(doc,1):
 imgs=page.get_images();assert len(imgs)==1;data=doc.extract_image(imgs[0][0]);assert data['width']==2200 and data['height']==1650;(work/('page_%d_image_1.png'%i)).write_bytes(data['image'])
env=dict(os.environ);env['MONROE_WORKDIR']=str(work)
for script in ['check_vehicle_paths.py','edit_locked_sources.py','make_turning_report.py']:subprocess.run([sys.executable,str(root/'scripts'/script)],env=env,check=True)
print('Rebuilt deliverables:',work/'delivery')
