from pathlib import Path
import json,shutil,numpy as np
from PIL import Image
w=Path('/workspace/monroe-two-layouts');out=w/'delivery/Shared_Textures';source=Path('/workspace/monroe-screenshot/delivery/textures');shutil.copytree(source,out,dirs_exist_ok=True);mapping={}
for p in source.glob('context_*.png'):
 a=np.array(Image.open(p).convert('RGB'));b=a.copy();region=a[205:];r,g,bb=[region[:,:,i].astype(float) for i in range(3)];mask=(r>g*1.025)&(r>bb*1.055)&(r>90)
 target=np.array([207,210,207]) if 'warm_brick' in p.name else np.array([194,198,196]) if 'tan_brick' in p.name else np.array([223,222,215]);luma=region.mean(2);median=float(np.median(luma[mask])) if mask.any() else 170;colors=np.clip(target[None,None,:]+(luma-median)[:,:,None]*.45,0,255).astype(np.uint8);b[205:][mask]=colors[mask];b[110:191]=[183,186,182];name='Neutral_'+p.name;Image.fromarray(b).save(out/name)
 rough=np.full(a.shape[:2],220,np.uint8);window=(a[:,:,2]>a[:,:,0]*1.10)&(a[:,:,1]>a[:,:,0]*1.05)&(a.mean(2)<155);rough[window]=65;rough[:101]=160;roughname='Roughness_'+p.name;Image.fromarray(rough).save(out/roughname);mapping[p.name]={'base_color':name,'roughness':roughname,'accuracy':'Photo-informed neutral palette; individual facade colors and window rhythm approximate.'}
for number,target in [('2603',[178,180,171]),('2664',[215,216,208])]:
 p=source/f'building_{number}_Unified_Color.png';a=np.array(Image.open(p).convert('RGB'));r,g,b=[a[:,:,i].astype(float) for i in range(3)];mask=(r>g*1.09)&(g>b*1.025)&(r>80);lum=a.mean(2);median=float(np.median(lum[mask]));color=np.clip(np.array(target)[None,None,:]+(lum-median)[:,:,None]*.50,0,255).astype(np.uint8);a[mask]=color[mask];name='Neutral_'+p.name;Image.fromarray(a).save(out/name);mapping[p.name]={'base_color':name,'accuracy':'Apartment: muted gray/tan masonry. Corner building: light neutral facade. Estimated palette from supplied references.'}
(w/'facade_mapping.json').write_text(json.dumps(mapping,indent=2));print('NEUTRAL_FACADE_ATLASES',len(mapping))
