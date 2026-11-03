import xml.etree.ElementTree as ET,json,math
from pathlib import Path
from urllib.parse import unquote
w=Path('/workspace/monroe-pavement-fix');d=w/'delivery';ns={'c':'http://www.collada.org/2005/11/COLLADASchema'}
for variant,folder,name in [('existing','01_Original_Road_Layout','Monroe_Original_Road_Layout'),('proposed','02_New_Road_Layout','Monroe_New_Road_Layout')]:
 path=d/folder/(name+'.dae');refs={a['name']:a for a in json.loads((w/(variant+'_reference.json')).read_text())};ids=set();duplicates=[];links=set();names=set();geometrynames=set();fail=[];errors=[];images=0
 for event,e in ET.iterparse(path,events=('start','end')):
  tag=e.tag.rsplit('}',1)[-1]
  if event=='start':
   if 'id' in e.attrib:
    i=e.attrib['id']
    if i in ids:duplicates.append(i)
    ids.add(i)
   for k in ['url','source','target']:
    v=e.attrib.get(k,'')
    if v.startswith('#'):links.add(v[1:])
   continue
  if tag=='image':
   image=e.find('c:init_from',ns);p=path.parent/unquote(image.text);images+=1
   if not p.exists():fail.append('Missing texture '+str(p))
   e.clear()
  elif tag=='geometry':
   name_=e.attrib['name'];geometrynames.add(name_);ref=refs.get(name_)
   if not ref:fail.append('Unexpected geometry '+name_)
   else:
    values=list(map(float,e.find('c:mesh/c:source/c:float_array',ns).text.split()));expected=[v for p in ref['points'] for v in p]
    if len(values)!=len(expected):fail.append(name_+' point count')
    else:errors.append(max((abs(a-b) for a,b in zip(values,expected)),default=0))
    tris=e.findall('c:mesh/c:triangles',ns);count=sum(int(t.attrib['count']) for t in tris)
    if count!=ref['triangles']:fail.append(name_+' triangle count')
    for tri in tris:
     indices=tri.find('c:p',ns).text.split()
     if len(indices)!=int(tri.attrib['count'])*9:fail.append(name_+' index count')
   e.clear()
  elif tag=='node':names.add(e.attrib.get('name'));e.clear()
 missing=sorted(set(refs)-geometrynames);unresolved=sorted(links-ids);maximum=max(errors,default=0)
 report={'passed':not fail and not missing and not duplicates and not unresolved and names==set(refs) and maximum<.00001,'geometry_nodes':len(geometrynames),'scene_object_nodes':len(names),'relative_texture_files':images,'max_numeric_position_error_m':maximum,'missing_geometries':missing,'failures':fail,'duplicate_ids':duplicates,'unresolved_id_references':unresolved,'units':'meters','up_axis':'Z_UP','native_skp_tested':False,'scope':'XML structure, object names, triangle/position equivalence and texture availability. Does not verify actual SketchUp import.'}
 (d/'validation'/(variant+'_collada_checks.json')).write_text(json.dumps(report,indent=2));print('COLLADA_CHECK',variant,report['passed'],maximum,flush=True);assert report['passed'],report
