import json,collections
from pathlib import Path
w=Path('/workspace/monroe-material-update')
def repair(r):
 v=r['vertices'];N=len(v)//2;top=[list(f) for f in r['faces'] if all(i<N for i in f)];vertices=[list(a) for a in v[:N]];inc=collections.defaultdict(list)
 for i,f in enumerate(top):
  for a in f:inc[a].append(i)
 changes=0
 for vertex,faces in inc.items():
  remaining=set(faces);fans=[]
  while remaining:
   seed=remaining.pop();fan={seed};todo=[seed]
   while todo:
    i=todo.pop();neighbors=set(top[i])-{vertex};linked=[j for j in remaining if neighbors.intersection(top[j])]
    for j in linked:remaining.remove(j);fan.add(j);todo.append(j)
   fans.append(fan)
  for fan in fans[1:]:
   new=len(vertices);vertices.append(list(vertices[vertex]));changes+=1
   for i in fan:top[i]=[new if a==vertex else a for a in top[i]]
 N=len(vertices);depth=.14 if r['name'].startswith('N_Neighborhood') else .006
 if any(s in r['name'] for s in ['_Grass','_Dirt','Turf','Track_Surface']):depth=.12
 if '_Base_' in r['name']:depth=.012
 faces=list(top);count=collections.Counter()
 for f in top:
  for a,b in zip(f,f[1:]+f[:1]):count[tuple(sorted((a,b)))]+=1
 vertices += [[x,y,z-depth] for x,y,z in vertices[:N]]
 faces += [[i+N for i in reversed(f)] for f in top]
 for f in top:
  for a,b in zip(f,f[1:]+f[:1]):
   if count[tuple(sorted((a,b)))]==1:faces.append([b,a,a+N,b+N])
 c=collections.Counter()
 for f in faces:
  for a,b in zip(f,f[1:]+f[:1]):c[tuple(sorted((a,b)))]+=1
 assert all(n==2 for n in c.values()),(r['name'],collections.Counter(c.values()))
 r['vertices']=vertices;r['faces']=faces;r['closed']=True;return changes
for name in ['existing_additions.json','proposed_additions.json','sports_parts.json']:
 data=json.loads((w/name).read_text());changes=sum(repair(r) for r in data);(w/name).write_text(json.dumps(data));print('REPAIRED',name,'point contact fans separated',changes)
