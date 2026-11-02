import bpy,json
from pathlib import Path
work=Path('/workspace/formit-city-layered');out=work/'delivery'
bpy.ops.wm.open_mainfile(filepath=str(work/'FormIt_City_Layered.blend'))
counts={o.name:sum(p.area<1e-10 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH'}
ref=json.loads((out/'validation/geometry_reference.json').read_text())
for r in ref:
 r['degenerate_faces']=counts[r['name']];o=bpy.data.objects[r['name']];r['parent_root']=o.parent.name if o.parent else None
(out/'validation/geometry_reference.json').write_text(json.dumps(ref))
bpy.ops.wm.open_mainfile(filepath='/workspace/formit-city-corner/FormIt_City_Materialized_Corner.blend')
baseline={o.name:sum(p.area<1e-10 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH'}
report={'preexisting_source_degenerate_face_counts':{k:v for k,v in baseline.items() if v},'layer_working_degenerate_face_counts':{k:v for k,v in counts.items() if v},'new_derived_surface_or_curb_degeneracies':{k:v for k,v in counts.items() if v and (k.startswith('Terrain_') or k.startswith('Curbs_'))}}
assert not report['new_derived_surface_or_curb_degeneracies']
assert report['preexisting_source_degenerate_face_counts']==report['layer_working_degenerate_face_counts']
(out/'validation/source_geometry_conditions.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
