from pathlib import Path
import json
w=Path('/workspace/monroe-townhouse-correction');p=json.loads((w/'driveway_geometry.json').read_text());p['apartment_site'].update(stair_bottom_z_m=22.3,stair_risers=20,stair_run_m=6.4,garage_visual_bounds_y_z_m=[373.,379.3,22.,25.]);(w/'driveway_geometry.json').write_text(json.dumps(p))
for name in ['prepare_lincoln_width.py','final_trim_paths.py']:
 f=w/'scripts'/name;s=f.read_text().replace('box(-96.7,343.7,-86.1,351.1)','box(-96.7,372.8,-86.1,380.0)').replace('box(-90.4,357.5,-86.65,365.7)','box(-90.4,356.5,-86.65,365.7)').replace('box(-90.25,357.7,-86.65,365.6)','box(-90.25,356.5,-86.65,365.6)').replace("for y in [343.7,351.1]", "for y in [372.8,380.0]")
 s=s.replace("23.75+(v[0]+87)*.265-(v[1]-347)*.06", "22.05+(v[0]+86.6)*.32-(v[1]-376.3)*.055").replace("23.75+(mid+87)*.265-(y-347)*.06", "22.05+(mid+86.6)*.32-(y-376.3)*.055")
 f.write_text(s)
f=w/'scripts/apartment_details.py';s=f.read_text().replace('344.2','373.0').replace('350.5','379.3').replace('23.7','22.0').replace('26.7','25.0').replace('344.35','373.15').replace('350.35','379.15').replace('26.52','24.82')
a=s.index(' steps=[]');b=s.index(" # Exterior metal handrail",a)
s=s[:a]+""" steps=[]
 for i in range(20):
  y0=358.8+i*.32;top=25.6-i*(25.6-22.3)/20;steps.append((-90.,y0,17.,-87.25,y0+.32,top))
 boxes('A_Apartment_Exterior_Stairs',steps,'concrete');boxes('A_Apartment_Stair_Upper_Landing',[(-90.,356.6,17.,-86.65,358.8,25.6)],'concrete')
 boxes('A_Apartment_Courtyard_Retaining_and_Parapet',[(-87.2,356.4,17.,-86.75,356.6,26.4),(-87.2,358.85,17.,-86.75,370.3,26.4)],'apartment_brick')
 boxes('A_Apartment_Courtyard_Stone_Caps',[(-87.3,356.35,26.4,-86.65,356.6,26.53),(-87.3,358.85,26.4,-86.65,370.35,26.53)],'cap')
 boxes('A_Apartment_Courtyard_Brick_Piers',[(-87.35,y-.28,25.5,-86.6,y+.28,26.8) for y in [356.45,359.1,364.5,370.0]],'apartment_brick')
"""+s[b:]
s=s.replace("rail((x,357.9,23.65),(x,363.34,26.5))", "rail((x,358.8,26.5),(x,365.2,23.2))").replace("y=357.9+j*5.44/5;z=22.75+(y-357.9)/5.44*2.85", "y=358.8+j*6.4/5;z=25.6-(y-358.8)/6.4*3.3").replace("'stair_risers_approximate':17", "'stair_risers_approximate':20")
f.write_text(s)
