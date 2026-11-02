from pathlib import Path
from PIL import Image,ImageDraw
import random
out=Path('/workspace/formit-city-context/delivery/textures');out.mkdir(parents=True,exist_ok=True)
palettes=[((155,91,67),(65,68,69),'warm_brick'),((178,144,113),(71,70,66),'tan_brick'),((170,168,155),(71,79,83),'light_siding'),((128,108,98),(88,79,72),'brown_brick'),((197,189,166),(105,106,101),'cream_render'),((151,157,157),(63,70,77),'gray_siding')]
for wall,roof,label in palettes:
 for floors in range(1,13):
  rng=random.Random(floors*19+sum(wall));im=Image.new('RGB',(512,1024),wall);d=ImageDraw.Draw(im)
  # Image rows 205..1023 are the wall zone (UV 0..0.8).
  if 'brick' in label:
   for row,y in enumerate(range(205,1024,8)):
    for x in range(-32,544,64):
     x+=32*(row%2);delta=rng.randint(-9,9);c=tuple(max(0,min(255,v+delta)) for v in wall);d.rectangle((x+1,y+1,x+62,y+6),fill=c)
  elif 'siding' in label:
   for y in range(205,1024,14):d.line((0,y,512,y),fill=tuple(max(0,v-15) for v in wall))
  for floor in range(floors):
   lower=1024-floor*819/floors;upper=1024-(floor+1)*819/floors;h=lower-upper
   for col in range(4):
    x=col*128;y0=int(upper+h*.22);y1=int(lower-h*.22)
    d.rectangle((x+37,y0-3,x+91,y1+3),fill=(219,214,196));d.rectangle((x+41,y0,x+87,y1),fill=(54,75,85));d.line((x+64,y0,x+64,y1),fill=(177,184,180),width=2)
    if floors<=3:d.line((x+41,(y0+y1)//2,x+87,(y0+y1)//2),fill=(177,184,180),width=2)
  d.rectangle((0,110,512,190),fill=tuple(max(0,v-12) for v in wall)) # solid foundation
  d.rectangle((0,0,512,100),fill=roof)
  for i in range(700):
   x=rng.randrange(512);y=rng.randrange(100);c=tuple(max(0,min(255,v+rng.randint(-7,7))) for v in roof);d.point((x,y),fill=c)
  for roof_label,roof_color in [('charcoal',(65,68,70)),('midgray',(121,122,119)),('palegray',(192,191,181)),('redbrown',(140,91,69))]:
   variant=im.copy();v=ImageDraw.Draw(variant);v.rectangle((0,0,512,100),fill=roof_color)
   variant.save(out/f'context_{label}_{floors:02d}floors_{roof_label}.png')
print('Generated 72 shared single-material facade/roof atlases.')
