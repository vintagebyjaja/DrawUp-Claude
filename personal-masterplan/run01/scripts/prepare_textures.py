"""python prepare_textures.py OUTPUT_DIRECTORY (requires Pillow)."""
import sys, random
from pathlib import Path
from PIL import Image, ImageDraw
random.seed(12)
out=Path(sys.argv[1])/'textures';out.mkdir(parents=True,exist_ok=True)
im=Image.new('RGB',(512,256),(181,161,137));d=ImageDraw.Draw(im)
for row in range(16):
 for col in range(-1,9):
  x=col*64+(32 if row%2 else 0);y=row*16
  c=random.choice([(157,86,54),(177,101,64),(166,91,56),(185,112,76),(150,83,54)])
  d.rectangle((x+1,y+1,x+62,y+14),fill=c)
im.save(out/'brick.png')
