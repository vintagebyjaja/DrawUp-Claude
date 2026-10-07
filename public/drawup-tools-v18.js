/* DrawUp Portal tools — V18: Draw, Check, Swap, HQ
 *
 * Registers four Portal tabs with drawup-portal-v17.js. Everything reads and writes
 * Supabase with the member's own session; the AI steps run on the DrawUp server
 * (/api/check, /api/swap), which charges credits and writes the results.
 */
(()=>{'use strict';
const P=window.DrawUpPortal;if(!P||!P.registerTab){console.warn('DrawUp tools: Portal not loaded.');return;}
const BUCKET='drawup-private';
const $q=(w,s)=>w.querySelector(s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function uuid(){return (crypto.randomUUID&&crypto.randomUUID())||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);});}
function download(name,data,type){const blob=data instanceof Blob?data:new Blob([data],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);}
function binary(str){const u=new Uint8Array(str.length);for(let i=0;i<str.length;i++)u[i]=str.charCodeAt(i)&255;return u;}
async function api(c,path,opts){const token=await c.token();const r=await fetch(path,{...(opts||{}),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...((opts||{}).headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('Request failed ('+r.status+')'));return d;}
async function myProjects(c){const {data}=await c.client.from('project_threads').select('id,project_name').eq('owner_id',c.user.id).order('updated_at',{ascending:false}).limit(100);return data||[];}
function projectSelect(c,projects,selected,id){return `<select id="${id}"><option value="">No project</option>${projects.map(p=>`<option value="${p.id}"${p.id===selected?' selected':''}>${c.esc(p.project_name)}</option>`).join('')}</select>`;}
async function signedUrl(c,path){if(!path)return'';const {data}=await c.client.storage.from(BUCKET).createSignedUrl(path,3600);return data?.signedUrl||'';}
const fmtWhen=d=>d?new Date(d).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';

/* Public-site buttons (Check / Swap pages) open the tool in the Portal, after sign-in if needed. */
document.addEventListener('click',e=>{const b=e.target.closest('[data-du-open-tool]');if(!b)return;e.preventDefault();e.stopPropagation();const tab=b.dataset.duOpenTool;if(P.isSignedIn()){P.openPortal(tab);return;}try{localStorage.setItem('drawup_portal_tab_v17',tab);}catch(_e){}const s=document.getElementById('drawup-signin');if(s)s.click();},true);

/* ====================================================================== DRAW */
/* V20: heights, wall types, columns, stairs, fixtures, text, manual dimensions, cased
   openings and a measure tool. The model, drawing and exports live in drawup-draw-core-v18.js. */
const SCALES=[[96,'1/8" = 1\'-0"'],[48,'1/4" = 1\'-0"'],[24,'1/2" = 1\'-0"']];
const DRAW_TOOLS=[['select','Select'],['wall','Exterior wall'],['partition','Partition'],['door','Door'],['window','Window'],['cased','Opening'],['room','Room'],['column','Column'],['stair','Stair'],['fixture','Fixture'],['text','Text'],['dim','Dimension'],['measure','Measure']];
const DRAW_HINTS={select:'Click to select. Drag to move. Arrow keys nudge 1" (Shift: 1\'-0"), R rotates, Delete removes.',wall:'Click a start point, then each corner. Esc ends the run.',partition:'Click a start point, then each corner. Esc ends the run.',door:'Click on a wall to place a door.',window:'Click on a wall to place a window.',cased:'Click on a wall to place a cased opening (no door).',room:'Click inside a room to place its name tag.',column:'Click to place a column.',stair:'Click the bottom of the run, then the top. The arrow points UP.',fixture:'Click near a wall: the fixture backs onto the nearest wall face.',text:'Click where the note goes.',dim:'Click two points. Snaps to wall faces and corners; hold Shift for an aligned dimension.',measure:'Click two points to read the distance. Nothing is saved.'};
const TEXT_SIZES=[[0.09375,'3/32"'],[0.125,'1/8"'],[0.1875,'3/16"'],[0.25,'1/4"']];
P.registerTab('draw',async(w,c)=>{
  const D=window.DrawUpDrawCore;if(!D){w.innerHTML='<div class="du-empty"><h1>Draw could not load.</h1></div>';return;}
  const WT=D.WALL_TYPES||{},FX=D.FIXTURES||{};
  const typeOptions=(sel,roleFirst)=>{const keys=Object.keys(WT);const grp=r=>keys.filter(k=>WT[k].role===r).map(k=>`<option value="${k}"${k===sel?' selected':''}>${c.esc(WT[k].name)} · ${c.esc(D.formatFtIn(WT[k].thickness))}</option>`).join('');const g=[['exterior','Exterior walls'],['interior','Partitions']];if(roleFirst==='interior')g.reverse();return g.map(([r,l])=>`<optgroup label="${l}">${grp(r)}</optgroup>`).join('');};
  const params=new URLSearchParams((location.hash.split('?')[1])||'');
  const {data:list,error}=await c.client.from('drawings').select('id,name,sheet_number,updated_at,revision,project_thread_id').eq('owner_id',c.user.id).order('updated_at',{ascending:false});
  if(error)throw error;
  const projects=await myProjects(c);
  const openId=params.get('id')||(list[0]&&list[0].id);
  if(!list.length||params.get('new')){
    w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">DRAW</span><h1>Plans with real dimensions</h1><p>Walls, doors and windows are geometry. Every dimension is measured from that geometry, so when a wall changes, its dimensions change with it.</p></div></div>
    <div class="du-two-col du-draw-start">
      <article class="du-glass"><h2>Start from a building size</h2><p class="du-muted">Outside face to outside face.</p>
        <div class="du-two"><div class="du-field"><label>Width</label><input id="dn-w" value="20'-0&quot;"></div><div class="du-field"><label>Depth</label><input id="dn-h" value="30'-0&quot;"></div></div>
        <div class="du-two"><div class="du-field"><label>Exterior wall type</label><select id="dn-type"><option value="">Generic — enter a thickness</option>${typeOptions('', 'exterior')}</select></div><div class="du-field"><label>Exterior wall thickness</label><input id="dn-t" value="0'-6&quot;"></div></div>
        <div class="du-two"><div class="du-field"><label>Wall height</label><input id="dn-ht" value="9'-0&quot;"></div><div class="du-field"><label>Drawing name</label><input id="dn-name" value="Floor Plan"></div></div>
        <div class="du-field"><label>Project</label>${projectSelect(c,projects,params.get('project')||'','dn-proj')}</div>
        <button class="du-btn primary" id="dn-rect">Create plan</button></article>
      <article class="du-glass"><h2>Start from the example</h2><p class="du-muted">A 20'-0" × 30'-0" building with a partition, doors, windows and rooms, fully dimensioned.</p><button class="du-btn ghost" id="dn-sample">Open example plan</button>${list.length?'<p style="margin-top:18px"><button class="du-btn ghost" id="dn-back">Back to my drawings</button></p>':''}</article>
    </div>`;
    const create=async model=>{const {data,error}=await c.client.from('drawings').insert({owner_id:c.user.id,name:$q(w,'#dn-name').value.trim()||'Floor Plan',sheet_number:'A101',project_thread_id:$q(w,'#dn-proj').value||null,model}).select('id').single();if(error){c.toast('Not created — '+error.message,true);return;}history.replaceState(null,'','#portal/draw?id='+data.id);c.openPortalTab('draw');};
    $q(w,'#dn-type').onchange=e=>{const t=WT[e.target.value];if(t){$q(w,'#dn-t').value=D.formatFtIn(t.thickness);$q(w,'#dn-ht').value=D.formatFtIn(t.height);}};
    $q(w,'#dn-rect').onclick=()=>{const key=$q(w,'#dn-type').value,W=D.parseFtIn($q(w,'#dn-w').value),H=D.parseFtIn($q(w,'#dn-h').value),T=D.parseFtIn($q(w,'#dn-t').value),HT=D.parseFtIn($q(w,'#dn-ht').value);if(!(W>=24&&H>=24&&T>0&&T<W/2)){c.toast('Enter a width and depth of at least 2\'-0" and a wall thickness, like 20\'-0".',true);return;}if(!(HT>=12&&HT<=1200)){c.toast('Enter a wall height like 9\'-0".',true);return;}const m=D.emptyModel();D.addRectangle(m,0,0,W,H,T).forEach(wl=>{if(WT[key])wl.wtype=key;wl.height=D.snap(HT);});create(m);};
    $q(w,'#dn-sample').onclick=()=>create(D.samplePlan());
    const back=$q(w,'#dn-back');if(back)back.onclick=()=>{history.replaceState(null,'','#portal/draw');c.openPortalTab('draw');};
    return;
  }
  const {data:row,error:e2}=await c.client.from('drawings').select('*').eq('id',openId).eq('owner_id',c.user.id).maybeSingle();
  if(e2)throw e2;if(!row){history.replaceState(null,'','#portal/draw');w.innerHTML='<div class="du-empty"><h1>Drawing not found.</h1><button class="du-btn primary" data-portal-tab="draw">My drawings</button></div>';return;}
  let model=D.normalizeModel(row.model),scale=row.scale_denominator||48,tool='select',sel=null,pending=null,undo=[],saveTimer=null,saving=false,revision=row.revision||1,hover=null,measure=null,drag=null,suppressClick=false;
  const opt={wall:'wd6',partition:'wd4',column:'square',fixture:'wc'};
  w.innerHTML=`<div class="du-work-head du-draw-head"><div><span class="du-kicker">DRAW · ${c.esc(row.sheet_number||'A101')}</span><h1 id="dw-title">${c.esc(row.name)}</h1></div>
    <div class="du-head-actions"><select id="dw-list">${list.map(d=>`<option value="${d.id}"${d.id===row.id?' selected':''}>${c.esc(d.name)}${d.sheet_number?' · '+c.esc(d.sheet_number):''}</option>`).join('')}</select><button class="du-btn ghost" id="dw-new">New drawing</button></div></div>
  <div class="du-draw-bar du-draw-bar20">
    <div class="du-draw-tools" role="toolbar" aria-label="Drawing tools">${DRAW_TOOLS.map(([k,l])=>`<button type="button" data-tool="${k}" class="${k==='select'?'on':''}">${l}</button>`).join('')}<button type="button" id="dw-undo" title="Undo (Ctrl+Z)">Undo</button></div>
    <div class="du-draw-tools du-draw-opts"><span id="dw-opt" class="du-draw-opt"></span><span id="dw-hint" class="du-draw-hint"></span><span class="du-draw-spacer"></span><label>Scale <select id="dw-scale">${SCALES.map(([v,l])=>`<option value="${v}"${v===scale?' selected':''}>${l}</option>`).join('')}</select></label><button type="button" id="dw-pdf">PDF</button><button type="button" id="dw-dxf">DXF</button><button type="button" id="dw-svg">SVG</button><span id="dw-save" class="du-save-status"></span></div>
  </div>
  <div class="du-draw-split"><div class="du-draw-canvas" id="dw-canvas" tabindex="0"><div id="dw-svg-host" class="du-draw-svghost"></div><div id="dw-readout" class="du-draw-readout" hidden></div></div><aside class="du-draw-inspect du-glass" id="dw-inspect"></aside></div>
  <p class="du-muted du-draw-note">Exterior dimensions run to the outside face of exterior walls and to partition centerlines; interior strings run to wall faces and door jambs. PDF, DXF and SVG exports include a wall-type legend and an opening schedule with head and sill heights. DWG and Revit (RVT) files can't be exported yet. DXF opens in AutoCAD, Revit (import) and most CAD tools; its dimensions are lines and text, not editable dimension objects.</p>`;
  const canvas=$q(w,'#dw-canvas'),host=$q(w,'#dw-svg-host'),inspect=$q(w,'#dw-inspect'),saveEl=$q(w,'#dw-save'),readout=$q(w,'#dw-readout');
  const setSave=(t,bad)=>{saveEl.textContent=t;saveEl.style.color=bad?'#ff9a9a':'';};
  const ft=v=>c.esc(D.formatFtIn(v));
  function commit(){undo.push(JSON.stringify(model));if(undo.length>80)undo.shift();}
  function scheduleSave(){setSave('Saving…');clearTimeout(saveTimer);saveTimer=setTimeout(save,600);}
  async function save(){if(saving){scheduleSave();return;}saving=true;const rev=revision+1;const {data,error}=await c.client.from('drawings').update({model,scale_denominator:scale,revision:rev,updated_at:new Date().toISOString()}).eq('id',row.id).eq('owner_id',c.user.id).select('revision').single();saving=false;if(error){setSave('Not saved — '+error.message,true);return;}revision=data.revision;setSave('Saved · rev '+revision);}
  const item=id=>(model.items||[]).find(x=>x.id===id);
  const NS='http://www.w3.org/2000/svg';
  function svgEl(svg,tag,attrs,text){const e=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text!=null)e.textContent=text;svg.appendChild(e);return e;}
  function rubber(svg,a,b,label){svgEl(svg,'line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#1b8cff','stroke-width':String(0.02*scale),'stroke-dasharray':`${0.06*scale} ${0.04*scale}`});svgEl(svg,'circle',{cx:a.x,cy:a.y,r:0.03*scale,fill:'#1b8cff'});svgEl(svg,'text',{x:(a.x+b.x)/2,y:(a.y+b.y)/2-0.1*scale,'font-size':String(0.12*scale),fill:'#1b8cff','text-anchor':'middle','font-family':'Helvetica, Arial, sans-serif'},label);}
  function render(){
    host.innerHTML=D.toSVG(model,scale,{ink:'#0d1b2a',poche:'#b9c6d3',paper:'#ffffff',hit:true});
    const svg=host.querySelector('svg');svg.setAttribute('width','100%');svg.setAttribute('height','100%');svg.style.display='block';
    if(sel){
      const q=sel.type==='wall'?`[data-wall="${sel.id}"]`:sel.type==='opening'?`[data-opening="${sel.id}"]`:sel.type==='item'?`[data-item="${sel.id}"]`:sel.type==='room'?`[data-room="${sel.id}"]`:null;
      if(q)svg.querySelectorAll(q).forEach(el=>{if(el.classList.contains('du-item-hit')){el.setAttribute('fill','rgba(27,140,255,.10)');return;}if(el.tagName==='text')el.setAttribute('fill','#1b8cff');else if(el.tagName==='polygon'&&el.classList.contains('du-wall-fill'))el.setAttribute('fill','#1b8cff');else if(el.getAttribute('fill')&&el.getAttribute('fill')!=='none'&&el.tagName==='circle')el.setAttribute('fill','#1b8cff');else el.setAttribute('stroke','#1b8cff');});
    }
    if(pending&&hover)rubber(svg,pending,hover,D.formatFtIn(Math.hypot(hover.x-pending.x,hover.y-pending.y)));
    if(measure&&measure.b)rubber(svg,measure.a,measure.b,D.formatFtIn(measure.d));else if(measure&&measure.a&&hover)rubber(svg,measure.a,hover,D.formatFtIn(Math.hypot(hover.x-measure.a.x,hover.y-measure.a.y)));
    const R=D.computeDimensions(model,scale);
    inspect.innerHTML=inspector(R);bindInspector();
  }
  function setReadout(t){readout.hidden=!t;readout.textContent=t||'';}
  function toolOptions(){
    const o=$q(w,'#dw-opt');
    if(tool==='wall'||tool==='partition')o.innerHTML=`<label>Wall type <select id="dw-wtype">${typeOptions(opt[tool],tool==='wall'?'exterior':'interior')}</select></label>`;
    else if(tool==='column')o.innerHTML=`<label>Column <select id="dw-colshape"><option value="square"${opt.column==='square'?' selected':''}>Square 12"</option><option value="round"${opt.column==='round'?' selected':''}>Round 12"</option></select></label>`;
    else if(tool==='fixture')o.innerHTML=`<label>Fixture <select id="dw-fixture">${Object.entries(FX).map(([k,l])=>`<option value="${k}"${k===opt.fixture?' selected':''}>${l}</option>`).join('')}</select></label>`;
    else o.innerHTML='';
    const s=$q(o,'select');if(s)s.onchange=e=>{opt[tool==='column'?'column':tool==='fixture'?'fixture':tool]=e.target.value;};
    $q(w,'#dw-hint').textContent=DRAW_HINTS[tool]||'';
  }
  const heightField=(id,label,v)=>`<div class="du-field"><label>${label}</label><input id="${id}" value="${v>0?ft(v):''}"></div>`;
  const delBtn='<button class="du-btn ghost" id="di-del">Delete</button>';
  function inspector(R){
    const warn=R.problems.length?`<p class="du-draw-warn">${R.problems.map(c.esc).join('<br>')}</p>`:'';
    if(!sel){
      const used=[...new Set(model.walls.map(x=>D.wallTypeKey(x)))];
      return `<span class="du-kicker">DRAWING</span><div class="du-field"><label>Name</label><input id="di-name" value="${c.esc(row.name)}"></div><div class="du-field"><label>Sheet</label><input id="di-sheet" value="${c.esc(row.sheet_number||'')}"></div><div class="du-field"><label>Project</label>${projectSelect(c,projects,row.project_thread_id,'di-proj')}</div><button class="du-btn ghost" id="di-meta">Save details</button><hr><p class="du-muted">${model.walls.length} walls · ${model.openings.length} openings · ${model.rooms.length} rooms · ${(model.items||[]).length} other elements</p>${Object.keys(R.overall).length?`<p>Overall: ${c.esc(D.formatFtIn(R.overall.N??R.overall.S))} × ${c.esc(D.formatFtIn(R.overall.E??R.overall.W))}</p>`:''}${warn}${used.length?`<div class="du-draw-legend"><b>Wall types in this plan</b>${used.map(k=>`<span><i class="du-wt-sw" style="background:${WT[k].fill}" data-hatch="${WT[k].hatch}"></i>${c.esc(WT[k].name)}</span>`).join('')}</div>`:''}<p class="du-muted">Click a wall, opening, room or element to edit it. Use the tools above to add more.</p><button class="du-btn ghost" id="di-delete-drawing">Delete drawing</button>`;
    }
    if(sel.type==='wall'){const wl=D.wallById(model,sel.id);if(!wl){sel=null;return inspector(R);}const key=D.wallTypeKey(wl);return `<span class="du-kicker">${wl.type==='exterior'?'EXTERIOR WALL':'PARTITION'}</span><div class="du-field"><label>Wall type</label><select id="di-wtype">${typeOptions(key,wl.type)}</select></div><div class="du-field"><label>Length ${wl.type==='exterior'?'(outside face)':'(face to face)'}</label><input id="di-len" value="${ft(D.wallFaceLength(model,wl))}"></div><div class="du-field"><label>Keep fixed</label><select id="di-anchor"><option value="a">Start of wall</option><option value="b">End of wall</option></select></div><div class="du-two"><div class="du-field"><label>Thickness</label><input id="di-thk" value="${ft(wl.thickness)}"></div>${heightField('di-ht','Height',wl.height)}</div><div class="du-field"><label>Dimension as</label><select id="di-type"><option value="exterior"${wl.type==='exterior'?' selected':''}>Exterior (outside face)</option><option value="interior"${wl.type!=='exterior'?' selected':''}>Partition (centerline)</option></select></div><button class="du-btn primary" id="di-apply">Apply</button> <button class="du-btn ghost" id="di-del">Delete wall</button><p class="du-muted">Changing the type sets its thickness, height and hatch. Changing the length stretches the plan: connected walls, openings and elements beyond the moving end move with it.</p>${warn}`;}
    if(sel.type==='opening'){const o=model.openings.find(x=>x.id===sel.id);if(!o){sel=null;return inspector(R);}const wl=D.wallById(model,o.wall);return `<span class="du-kicker">${o.kind==='door'?'DOOR':o.kind==='cased'?'CASED OPENING':'WINDOW'}</span><div class="du-field"><label>Type</label><select id="di-okind"><option value="door"${o.kind==='door'?' selected':''}>Door</option><option value="window"${o.kind==='window'?' selected':''}>Window</option><option value="cased"${o.kind==='cased'?' selected':''}>Cased opening (no door)</option></select></div><div class="du-two"><div class="du-field"><label>Width</label><input id="di-ow" value="${ft(o.width)}"></div><div class="du-field"><label>Tag</label><input id="di-tag" value="${c.esc(o.tag||'')}"></div></div><div class="du-field"><label>Center from start of wall</label><input id="di-oo" value="${ft(o.offset)}"></div><p class="du-muted">Wall centerline is ${ft(D.wallLength(wl))} long. Drag the opening along its wall to move it.</p><div class="du-two">${heightField('di-head','Head height',o.head)}${o.kind==='window'?heightField('di-sill','Sill height',o.sill):''}</div>${o.kind==='door'?`<div class="du-field"><label>Swing</label><select id="di-swing"><option value="left"${o.swing!=='right'?' selected':''}>Hinge at start side</option><option value="right"${o.swing==='right'?' selected':''}>Hinge at end side</option></select></div>`:''}<button class="du-btn primary" id="di-apply">Apply</button> ${delBtn}${warn}`;}
    if(sel.type==='room'){const r=model.rooms.find(x=>x.id===sel.id);if(!r){sel=null;return inspector(R);}return `<span class="du-kicker">ROOM</span><div class="du-field"><label>Name</label><input id="di-rn" value="${c.esc(r.name)}"></div><div class="du-two"><div class="du-field"><label>Number</label><input id="di-rnum" value="${c.esc(r.number||'')}"></div>${heightField('di-clg','Ceiling height',r.ceiling)}</div><p class="du-muted">The tag reads CLG and the ceiling height. Drag the tag to move it.</p><button class="du-btn primary" id="di-apply">Apply</button> ${delBtn}`;}
    if(sel.type==='item'){const it=item(sel.id);if(!it){sel=null;return inspector(R);}
      const rot=`<button class="du-btn ghost" id="di-rot">Rotate 90°</button>`;
      if(it.kind==='column')return `<span class="du-kicker">COLUMN</span><div class="du-two"><div class="du-field"><label>Shape</label><select id="di-shape"><option value="square"${it.shape==='square'?' selected':''}>Square</option><option value="round"${it.shape==='round'?' selected':''}>Round</option></select></div><div class="du-field"><label>${it.shape==='round'?'Diameter':'Size'}</label><input id="di-size" value="${ft(it.size)}"></div></div><button class="du-btn primary" id="di-apply">Apply</button> ${delBtn}`;
      if(it.kind==='stair'){const n=D.stairRisers(it),rh=it.rise/n,td=it.length/Math.max(1,n-1);const warns=[];if(rh>7.75+1e-6)warns.push(`Risers are ${D.formatFtIn(rh)} — over the 7 3/4" residential maximum (IRC R311.7.5.1). Add risers.`);if(td<10-1e-6)warns.push(`Treads are ${D.formatFtIn(td)} — under the 10" residential minimum (IRC R311.7.5.2). Lengthen the run.`);if(it.width<36)warns.push('Stairs are typically at least 3\'-0" wide (IRC R311.7.1).');return `<span class="du-kicker">STAIR</span><div class="du-two"><div class="du-field"><label>Run length</label><input id="di-slen" value="${ft(it.length)}"></div><div class="du-field"><label>Width</label><input id="di-swid" value="${ft(it.width)}"></div></div><div class="du-two">${heightField('di-rise','Total rise (floor to floor)',it.rise)}<div class="du-field"><label>Risers (blank = auto)</label><input id="di-risers" value="${it.risers>0?it.risers:''}"></div></div><p class="du-muted">${n} risers at ${ft(rh)} · ${Math.max(1,n-1)} treads at ${ft(td)}</p>${warns.length?`<p class="du-draw-warn">${warns.map(c.esc).join('<br>')}</p>`:''}<button class="du-btn primary" id="di-apply">Apply</button> ${rot} ${delBtn}`;}
      if(it.kind==='text')return `<span class="du-kicker">TEXT</span><div class="du-field"><label>Text</label><input id="di-text" value="${c.esc(it.text)}"></div><div class="du-two"><div class="du-field"><label>Size (on paper)</label><select id="di-tsize">${TEXT_SIZES.map(([v,l])=>`<option value="${v}"${Math.abs(v-it.size)<1e-6?' selected':''}>${l}</option>`).join('')}</select></div><div class="du-field"><label>Rotation</label><select id="di-trot">${[0,-90,90].map(v=>`<option value="${v}"${v===(it.rot||0)?' selected':''}>${v}°</option>`).join('')}</select></div></div><button class="du-btn primary" id="di-apply">Apply</button> ${delBtn}`;
      if(it.kind==='dim'){const g=D.dimGeometry(it,scale);return `<span class="du-kicker">DIMENSION</span><p>Measures <b>${ft(g.value)}</b> — computed from its two points, so it can't drift from the drawing.</p><div class="du-field"><label>Offset from the points</label><input id="di-doff" value="${ft(it.off)}"></div><button class="du-btn ghost" id="di-dflip">Flip side</button><p class="du-muted">Drag to move. Delete and redraw to measure different points.</p><button class="du-btn primary" id="di-apply">Apply</button> ${delBtn}`;}
      if(it.kind==='fixture')return `<span class="du-kicker">PLUMBING FIXTURE</span><div class="du-field"><label>Fixture</label><select id="di-fx">${Object.entries(FX).map(([k,l])=>`<option value="${k}"${k===it.fixture?' selected':''}>${l}</option>`).join('')}</select></div><button class="du-btn primary" id="di-apply">Apply</button> ${rot} ${delBtn}`;
    }
    return '';
  }
  function remove(){if(!sel)return;commit();if(sel.type==='wall')D.removeWall(model,sel.id);else if(sel.type==='opening')D.removeOpening(model,sel.id);else if(sel.type==='item')D.removeItem(model,sel.id);else model.rooms=model.rooms.filter(r=>r.id!==sel.id);sel=null;render();scheduleSave();}
  function rotateSel(){const it=sel&&sel.type==='item'&&item(sel.id);if(!it)return;commit();it.rot=(((it.rot||0)+90)%360+360)%360;if(it.kind==='text'&&it.rot===270)it.rot=-90;if(it.kind==='text'&&it.rot===180)it.rot=0;render();scheduleSave();}
  function bindInspector(){
    const on=(id,fn)=>{const el=$q(inspect,id);if(el)el.onclick=fn;};
    const val=id=>{const el=$q(inspect,id);return el?el.value:'';};
    const len=(id,label,min,max)=>{const t=val(id);const v=D.parseFtIn(t);if(!(v>=min&&v<=max))throw new Error(`Enter ${label} like 9'-0".`);return D.snap(v);};
    on('#di-meta',async()=>{const name=val('#di-name').trim()||'Floor Plan',sheet=val('#di-sheet').trim(),proj=val('#di-proj')||null;const {error}=await c.client.from('drawings').update({name,sheet_number:sheet,project_thread_id:proj}).eq('id',row.id);if(error){c.toast('Not saved — '+error.message,true);return;}row.name=name;row.sheet_number=sheet;row.project_thread_id=proj;$q(w,'#dw-title').textContent=name;c.toast('Drawing details saved.');});
    on('#di-delete-drawing',async()=>{if(!confirm('Delete this drawing? This cannot be undone.'))return;const {error}=await c.client.from('drawings').delete().eq('id',row.id);if(error){c.toast(error.message,true);return;}history.replaceState(null,'','#portal/draw');c.openPortalTab('draw');});
    on('#di-del',remove);on('#di-rot',rotateSel);
    on('#di-dflip',()=>{const it=item(sel.id);commit();it.off=-(it.off||0);render();scheduleSave();});
    const wt=$q(inspect,'#di-wtype');if(wt)wt.onchange=()=>{const before=JSON.stringify(model);try{D.setWallType(model,sel.id,wt.value);D.computeDimensions(model,scale);undo.push(before);}catch(e){model=D.normalizeModel(JSON.parse(before));c.toast(e.message||String(e),true);}render();scheduleSave();};
    const sh=$q(inspect,'#di-shape');if(sh)sh.onchange=()=>{const it=item(sel.id);commit();it.shape=sh.value;render();scheduleSave();};
    on('#di-apply',()=>{
      const before=JSON.stringify(model);
      try{
        if(sel.type==='wall'){const wl=D.wallById(model,sel.id);const L=D.parseFtIn(val('#di-len')),T=D.parseFtIn(val('#di-thk'));if(!(L>0))throw new Error('Enter a length like 22\'-0".');if(!(T>0&&T<48))throw new Error('Enter a thickness like 0\'-6".');const H=len('#di-ht','a height',1,1200);wl.type=val('#di-type');wl.thickness=D.snap(T);wl.height=H;D.setWallFaceLength(model,wl.id,L,val('#di-anchor'));}
        else if(sel.type==='opening'){const o=model.openings.find(x=>x.id===sel.id);const W=D.parseFtIn(val('#di-ow')),O=D.parseFtIn(val('#di-oo'));if(!(W>0)||isNaN(O))throw new Error('Enter sizes like 3\'-0".');D.moveOpening(model,o.id,O,W);o.tag=val('#di-tag').trim();const k=val('#di-okind');o.head=len('#di-head','a head height',1,1200);if(o.kind==='window')o.sill=val('#di-sill').trim()===''?36:(()=>{const s=D.parseFtIn(val('#di-sill'));if(!(s>=0&&s<o.head))throw new Error('The sill must be below the head.');return D.snap(s);})();const sw=$q(inspect,'#di-swing');if(sw)o.swing=sw.value;if(k&&k!==o.kind){o.kind=k;if(k==='window'){if(!(o.sill>=0))o.sill=36;}else delete o.sill;}}
        else if(sel.type==='room'){const r=model.rooms.find(x=>x.id===sel.id);r.name=val('#di-rn').trim().toUpperCase()||'ROOM';r.number=val('#di-rnum').trim();r.ceiling=len('#di-clg','a ceiling height',12,1200);}
        else if(sel.type==='item'){const it=item(sel.id);
          if(it.kind==='column'){it.shape=val('#di-shape');it.size=len('#di-size','a size',1,240);}
          if(it.kind==='stair'){it.length=len('#di-slen','a run length',12,2400);it.width=len('#di-swid','a width',12,480);it.rise=len('#di-rise','a total rise',6,600);const r=val('#di-risers').trim();if(r){const n=parseInt(r,10);if(!(n>=2&&n<=60))throw new Error('Enter 2 to 60 risers, or leave blank.');it.risers=n;}else it.risers=null;}
          if(it.kind==='text'){it.text=val('#di-text').trim()||'NOTE';it.size=+val('#di-tsize');it.rot=+val('#di-trot');}
          if(it.kind==='dim'){const o=D.parseFtIn(val('#di-doff').replace(/^-/,''));if(isNaN(o))throw new Error('Enter an offset like 1\'-0".');it.off=(/^\s*-/.test(val('#di-doff'))?-1:1)*D.snap(o);}
          if(it.kind==='fixture')it.fixture=val('#di-fx');}
        D.computeDimensions(model,scale);
      }catch(e){model=D.normalizeModel(JSON.parse(before));c.toast(e.message||String(e),true);render();return;}
      undo.push(before);render();scheduleSave();
    });
  }
  function toModel(ev){const svg=host.querySelector('svg');const pt=svg.createSVGPoint();pt.x=ev.clientX;pt.y=ev.clientY;const p=pt.matrixTransform(svg.getScreenCTM().inverse());return {x:p.x,y:p.y};}
  /* Snap targets: wall ends always; for dimensions and measuring also wall face corners and
     opening jambs, so manual dimensions land on real faces. */
  function snapTargets(fine){const t=[];model.walls.forEach(wl=>{t.push(wl.a,wl.b);if(fine){const o=D.wallOutline(model,wl);t.push(o.outerA,o.outerB,o.innerA,o.innerB);}});if(fine){model.openings.forEach(o=>{const g=D.openingGeometry(model,o);t.push(g.outer1,g.outer2,g.inner1,g.inner2);});(model.items||[]).forEach(it=>{if(it.kind==='column')t.push(it.at);});}return t;}
  function snapPoint(p,from,o){o=o||{};const fine=!!o.fine;let q={x:D.snap(p.x,fine?1:6),y:D.snap(p.y,fine?1:6)};let best=null;snapTargets(fine).forEach(e=>{const dd=Math.hypot(e.x-p.x,e.y-p.y);if(dd<(fine?0.15:0.25)*scale&&(!best||dd<best.d))best={d:dd,p:e};});if(best)q={x:best.p.x,y:best.p.y};if(from&&!o.free){if(best){/* keep the snapped target; align the other axis to it */if(Math.abs(q.x-from.x)<Math.abs(q.y-from.y))return {x:from.x,y:q.y};return {x:q.x,y:from.y};}if(Math.abs(q.x-from.x)<Math.abs(q.y-from.y))q.x=from.x;else q.y=from.y;}return q;}
  function nearestWall(p,extra){let best=null;model.walls.forEach(wl=>{const dx=wl.b.x-wl.a.x,dy=wl.b.y-wl.a.y,L=Math.hypot(dx,dy);const t=((p.x-wl.a.x)*dx+(p.y-wl.a.y)*dy)/L;const px=wl.a.x+dx*t/L,py=wl.a.y+dy*t/L;const d=Math.hypot(p.x-px,p.y-py);if(t>=0&&t<=L&&d<=wl.thickness/2+(extra||0.15*scale)&&(!best||d<best.d))best={d,wall:wl,t,foot:{x:px,y:py}};});return best;}
  const pickSel=ev=>{const el=ev.target.closest('[data-item],[data-opening],[data-wall],[data-room]');if(!el)return null;if(el.dataset.item)return {type:'item',id:el.dataset.item};if(el.dataset.opening)return {type:'opening',id:el.dataset.opening};if(el.dataset.room)return {type:'room',id:el.dataset.room};if(el.dataset.wall)return {type:'wall',id:el.dataset.wall};return null;};
  /* Drag to move: items and room tags move freely (1" grid), openings slide along their wall. */
  canvas.addEventListener('pointerdown',ev=>{if(tool!=='select'||ev.button!==0)return;const s=pickSel(ev);if(!s||s.type==='wall')return;sel=s;drag={sel:s,start:toModel(ev),before:JSON.stringify(model),moved:false,id:ev.pointerId};});
  canvas.addEventListener('pointermove',ev=>{
    if(drag){const p=toModel(ev),dx=p.x-drag.start.x,dy=p.y-drag.start.y;if(!drag.moved&&Math.hypot(dx,dy)<0.04*scale)return;drag.moved=true;try{canvas.setPointerCapture(drag.id);}catch(_e){}
      model=D.normalizeModel(JSON.parse(drag.before));const s=drag.sel;
      try{if(s.type==='item')D.moveItem(model,s.id,D.snap(dx,1),D.snap(dy,1));else if(s.type==='room'){const r=model.rooms.find(x=>x.id===s.id);r.at={x:D.snap(r.at.x+dx,1),y:D.snap(r.at.y+dy,1)};}else if(s.type==='opening'){const o=model.openings.find(x=>x.id===s.id),wl=D.wallById(model,o.wall),L=D.wallLength(wl),dir={x:(wl.b.x-wl.a.x)/L,y:(wl.b.y-wl.a.y)/L};const off=o.offset+dx*dir.x+dy*dir.y;D.moveOpening(model,o.id,Math.min(Math.max(D.snap(off,1),o.width/2),L-o.width/2));}}catch(_e){}
      render();return;}
    if(pending||(measure&&measure.a&&!measure.b)){const p=toModel(ev);const fine=tool==='dim'||tool==='measure';hover=snapPoint(p,pending||measure.a,{fine,free:ev.shiftKey||(tool==='measure'&&ev.altKey)});if(tool==='measure'){measure.live=hover;setReadout('Distance '+D.formatFtIn(Math.hypot(hover.x-measure.a.x,hover.y-measure.a.y)));}render();}
  });
  const endDrag=()=>{if(!drag)return;if(drag.moved){undo.push(drag.before);if(undo.length>80)undo.shift();suppressClick=true;scheduleSave();}drag=null;render();};
  canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
  canvas.addEventListener('click',ev=>{
    if(suppressClick){suppressClick=false;return;}
    const p=toModel(ev);
    if(tool==='select'){sel=pickSel(ev);if(!sel){/* thin walls are hard to hit on small screens: take the nearest wall within ~12px */const k=host.querySelector('svg').getScreenCTM().a||1,hit=nearestWall(p,12/k);if(hit){const op=model.openings.find(o=>o.wall===hit.wall.id&&Math.abs(o.offset-hit.t)<=o.width/2);sel=op?{type:'opening',id:op.id}:{type:'wall',id:hit.wall.id};}}render();return;}
    if(tool==='wall'||tool==='partition'){const q=snapPoint(p,pending);if(!pending){pending=q;hover=q;render();return;}if(Math.hypot(q.x-pending.x,q.y-pending.y)<12){return;}commit();try{const wl=D.addWall(model,pending,q,{wtype:opt[tool]});sel={type:'wall',id:wl.id};}catch(e){undo.pop();c.toast(e.message,true);}pending=q;render();scheduleSave();return;}
    if(tool==='door'||tool==='window'||tool==='cased'){const hit=nearestWall(p);if(!hit){c.toast('Click on a wall to place the '+(tool==='cased'?'opening':tool)+'.',true);return;}const L=D.wallLength(hit.wall);const width=Math.min(tool==='cased'?42:36,Math.floor(L));const off=Math.min(Math.max(D.snap(hit.t,1),width/2),L-width/2);commit();try{const o=D.addOpening(model,hit.wall.id,tool,off,width,{tag:''});sel={type:'opening',id:o.id};}catch(e){undo.pop();c.toast(e.message,true);}render();scheduleSave();return;}
    if(tool==='room'){const name=(prompt('Room name','ROOM')||'').trim();if(!name)return;commit();const r={id:'r_'+Math.random().toString(36).slice(2,9),name:name.toUpperCase(),number:'',ceiling:96,at:{x:D.snap(p.x,1),y:D.snap(p.y,1)}};model.rooms.push(r);sel={type:'room',id:r.id};render();scheduleSave();return;}
    if(tool==='column'){commit();const it=D.addItem(model,'column',{at:snapPoint(p,null,{fine:true}),shape:opt.column,size:12});sel={type:'item',id:it.id};render();scheduleSave();return;}
    if(tool==='fixture'){let at={x:D.snap(p.x,1),y:D.snap(p.y,1)},rot=0;const hit=nearestWall(p,40);if(hit){let n={x:p.x-hit.foot.x,y:p.y-hit.foot.y};const nl=Math.hypot(n.x,n.y)||1;n={x:n.x/nl,y:n.y/nl};at={x:D.snap(hit.foot.x+n.x*hit.wall.thickness/2,1/8),y:D.snap(hit.foot.y+n.y*hit.wall.thickness/2,1/8)};rot=Math.round(Math.atan2(n.y,n.x)*180/Math.PI-90);rot=((Math.round(rot/90)*90)%360+360)%360;}commit();const it=D.addItem(model,'fixture',{at,rot,fixture:opt.fixture});sel={type:'item',id:it.id};render();scheduleSave();return;}
    if(tool==='text'){const t=(prompt('Note text','')||'').trim();if(!t)return;commit();const it=D.addItem(model,'text',{at:{x:D.snap(p.x,1),y:D.snap(p.y,1)},text:t.toUpperCase(),size:0.125});sel={type:'item',id:it.id};render();scheduleSave();return;}
    if(tool==='stair'||tool==='dim'){const fine=tool==='dim';const q=snapPoint(p,pending,{fine,free:ev.shiftKey});if(!pending){pending=q;hover=q;render();return;}const d=Math.hypot(q.x-pending.x,q.y-pending.y);if(d<(tool==='stair'?24:1)){c.toast(tool==='stair'?'Make the run at least 2\'-0" long.':'Pick two different points.',true);return;}commit();try{let it;if(tool==='stair')it=D.addItem(model,'stair',{at:pending,rot:Math.round(Math.atan2(q.y-pending.y,q.x-pending.x)*180/Math.PI),length:D.snap(d,1),width:36,rise:120});else it=D.addItem(model,'dim',{a:pending,b:q,off:-0.3*scale});sel={type:'item',id:it.id};}catch(e){undo.pop();c.toast(e.message,true);}pending=null;hover=null;render();scheduleSave();return;}
    if(tool==='measure'){const q=snapPoint(p,measure&&!measure.b?measure.a:null,{fine:true,free:ev.shiftKey||ev.altKey});if(!measure||measure.b){measure={a:q};hover=q;setReadout('Click the second point');render();return;}measure.b=q;measure.d=Math.hypot(q.x-measure.a.x,q.y-measure.a.y);const dx=Math.abs(q.x-measure.a.x),dy=Math.abs(q.y-measure.a.y);setReadout(`Distance ${D.formatFtIn(measure.d)}${dx>0.01&&dy>0.01?`  (Δx ${D.formatFtIn(dx)} · Δy ${D.formatFtIn(dy)})`:''}`);hover=null;render();return;}
  });
  canvas.addEventListener('keydown',ev=>{
    if(ev.key==='Escape'){pending=null;hover=null;measure=null;setReadout('');render();return;}
    if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){ev.preventDefault();$q(w,'#dw-undo').click();return;}
    if(tool!=='select'||!sel)return;
    if(ev.key==='Delete'||ev.key==='Backspace'){ev.preventDefault();remove();return;}
    if(ev.key==='r'||ev.key==='R'){rotateSel();return;}
    const arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};const a=arrows[ev.key];if(!a)return;ev.preventDefault();const step=ev.shiftKey?12:1;
    const before=JSON.stringify(model);try{if(sel.type==='item')D.moveItem(model,sel.id,a[0]*step,a[1]*step);else if(sel.type==='room'){const r=model.rooms.find(x=>x.id===sel.id);r.at={x:r.at.x+a[0]*step,y:r.at.y+a[1]*step};}else if(sel.type==='opening'){const o=model.openings.find(x=>x.id===sel.id),wl=D.wallById(model,o.wall),L=D.wallLength(wl);D.moveOpening(model,o.id,o.offset+(a[0]*(wl.b.x-wl.a.x)+a[1]*(wl.b.y-wl.a.y))/L*step);}else return;}catch(e){model=D.normalizeModel(JSON.parse(before));c.toast(e.message,true);return;}undo.push(before);render();scheduleSave();
  });
  w.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{tool=b.dataset.tool;pending=null;hover=null;measure=null;setReadout('');if(tool!=='select')sel=null;w.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('on',x===b));canvas.style.cursor=tool==='select'?'default':'crosshair';toolOptions();canvas.focus();render();});
  $q(w,'#dw-undo').onclick=()=>{const prev=undo.pop();if(!prev){c.toast('Nothing to undo.');return;}model=D.normalizeModel(JSON.parse(prev));sel=null;pending=null;render();scheduleSave();};
  $q(w,'#dw-scale').onchange=e=>{scale=+e.target.value;render();scheduleSave();};
  $q(w,'#dw-list').onchange=e=>{history.replaceState(null,'','#portal/draw?id='+e.target.value);c.openPortalTab('draw');};
  $q(w,'#dw-new').onclick=()=>{history.replaceState(null,'','#portal/draw?new=1');c.openPortalTab('draw');};
  const fileBase=()=>((row.sheet_number?row.sheet_number+'-':'')+row.name).replace(/[^\w.-]+/g,'-');
  $q(w,'#dw-pdf').onclick=async()=>{const proj=projects.find(p=>p.id===row.project_thread_id);download(fileBase()+'.pdf',binary(D.toPDF(model,scale,{project:proj?.project_name||'DrawUp',name:row.name,sheet:row.sheet_number||'A101',revision,date:new Date().toLocaleDateString()})),'application/pdf');};
  $q(w,'#dw-dxf').onclick=()=>download(fileBase()+'.dxf',D.toDXF(model,scale),'application/dxf');
  $q(w,'#dw-svg').onclick=()=>download(fileBase()+'.svg',D.toSVG(model,scale,{paperSize:true}),'image/svg+xml');
  toolOptions();setSave('Saved · rev '+revision);render();
});

/* ====================================================================== CHECK */
const CHECK_FOCUS=[['code','Building code'],['accessibility','Accessibility'],['life_safety','Life safety / egress'],['coordination','Coordination'],['dimensions','Dimensions'],['documentation','Documentation'],['structural','Structural'],['mep','MEP'],['site','Site']];
const SEV_ORDER=['critical','major','minor','info'];
P.registerTab('check',async(w,c)=>{
  const params=new URLSearchParams((location.hash.split('?')[1])||'');
  const projects=await myProjects(c);
  const {data:reviews,error}=await c.client.from('check_reviews').select('id,title,status,created_at,completed_at,findings,credits_charged,file_name,error').eq('owner_id',c.user.id).order('created_at',{ascending:false}).limit(50);
  if(error)throw error;
  const openId=params.get('id');
  if(openId)return renderReview(w,c,openId,projects);
  w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">DRAWUP CHECK</span><h1>Review a drawing set</h1><p>Upload a PDF. DrawUp Check reads your actual sheets and returns findings tied to sheet and location for code, accessibility, life safety, coordination and dimensions.</p></div></div>
  <div class="du-two-col">
    <article class="du-glass"><h2>New review</h2>
      <div class="du-field"><label>PDF drawing set (up to 32 MB)</label><input type="file" id="ck-file" accept="application/pdf,.pdf"></div>
      <div class="du-field"><label>Review title</label><input id="ck-title" placeholder="e.g. Athletic storage building · DD set"></div>
      <div class="du-two"><div class="du-field"><label>Project location (city, state, country)</label><input id="ck-jur" placeholder="e.g. Durham, NC, USA"></div><div class="du-field"><label>Building / occupancy type</label><input id="ck-type" placeholder="e.g. S-1 storage, B business"></div></div>
      <div class="du-field"><label>Check for</label><div class="du-chips du-check-focus">${CHECK_FOCUS.map(([k,l],i)=>`<button type="button" class="du-chip${i<5?' on':''}" data-focus="${k}">${l}</button>`).join('')}</div></div>
      <div class="du-field"><label>Project</label>${projectSelect(c,projects,params.get('project')||'','ck-proj')}</div>
      <p class="du-muted">Cost: 30 credits for up to 10 pages, 150 credits for larger sets. You are only charged if the review runs; failed reviews are refunded. Findings are guidance for the design team, not a permit approval.</p>
      <button class="du-btn primary" id="ck-go">Upload and review</button> <span id="ck-status" class="du-save-status"></span>
    </article>
    <article class="du-glass"><h2>Your reviews</h2>${reviews.length?reviews.map(r=>{const counts=SEV_ORDER.map(s=>[(r.findings||[]).filter(f=>f.severity===s).length,s]).filter(x=>x[0]);return `<div class="du-row du-check-row" data-review="${r.id}" tabindex="0"><div><b>${c.esc(r.title)}</b><small>${c.esc(r.file_name||'')} · ${fmtWhen(r.created_at)}</small></div><div><span class="du-status-pill" data-state="${r.status}">${r.status.toUpperCase()}</span>${r.status==='complete'?`<small>${counts.map(([n,s])=>n+' '+s).join(' · ')||'No findings'}</small>`:''}</div></div>`;}).join(''):'<p class="du-muted">No reviews yet.</p>'}</article>
  </div>`;
  w.querySelectorAll('[data-focus]').forEach(b=>b.onclick=()=>b.classList.toggle('on'));
  w.querySelectorAll('[data-review]').forEach(el=>el.onclick=()=>{history.replaceState(null,'','#portal/check?id='+el.dataset.review);c.openPortalTab('check');});
  $q(w,'#ck-go').onclick=async()=>{
    const st=$q(w,'#ck-status'),btn=$q(w,'#ck-go'),file=$q(w,'#ck-file').files[0];
    if(!file){c.toast('Choose a PDF first.',true);return;}
    if(!/pdf$/i.test(file.type)&&!/\.pdf$/i.test(file.name)){c.toast('DrawUp Check reviews PDF drawing sets.',true);return;}
    if(file.size>32*1024*1024){c.toast('That PDF is larger than 32 MB. Split the set and check it in parts.',true);return;}
    btn.disabled=true;st.textContent=' Uploading…';
    try{
      const id=uuid(),path=`${c.user.id}/check/${id}.pdf`;
      const up=await c.client.storage.from(BUCKET).upload(path,file,{contentType:'application/pdf',upsert:false});if(up.error)throw up.error;
      const focus=[...w.querySelectorAll('[data-focus].on')].map(b=>b.dataset.focus);
      const ins=await c.client.from('check_reviews').insert({id,owner_id:c.user.id,title:$q(w,'#ck-title').value.trim()||file.name.replace(/\.pdf$/i,''),file_path:path,file_name:file.name,file_size:file.size,jurisdiction:$q(w,'#ck-jur').value.trim()||null,building_type:$q(w,'#ck-type').value.trim()||null,focus:focus.length?focus:CHECK_FOCUS.slice(0,5).map(x=>x[0]),project_thread_id:$q(w,'#ck-proj').value||null}).select('id').single();
      if(ins.error)throw ins.error;
      st.textContent=' Starting review…';
      try{await api(c,'/api/check',{method:'POST',body:JSON.stringify({review_id:id})});}
      catch(e){c.toast(e.message,true);}
      history.replaceState(null,'','#portal/check?id='+id);c.openPortalTab('check');
    }catch(e){btn.disabled=false;st.textContent=' Not started — '+(e.message||e);}
  };
});
async function renderReview(w,c,id,projects){
  const load=async()=>{const {data,error}=await c.client.from('check_reviews').select('*').eq('id',id).eq('owner_id',c.user.id).maybeSingle();if(error)throw error;return data;};
  let r=await load();
  if(!r){history.replaceState(null,'','#portal/check');w.innerHTML='<div class="du-empty"><h1>Review not found.</h1><button class="du-btn primary" data-portal-tab="check">All reviews</button></div>';return;}
  const seq=w.dataset.seq;
  const draw=()=>{
    const findings=(r.findings||[]).slice().sort((a,b)=>SEV_ORDER.indexOf(a.severity)-SEV_ORDER.indexOf(b.severity));
    const counts=SEV_ORDER.map(s=>[s,findings.filter(f=>f.severity===s).length]);
    const proj=projects.find(p=>p.id===r.project_thread_id);
    w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">DRAWUP CHECK · ${c.esc(r.status.toUpperCase())}</span><h1>${c.esc(r.title)}</h1><p>${c.esc(r.file_name||'')}${r.page_count?' · '+r.page_count+' pages':''}${r.jurisdiction?' · '+c.esc(r.jurisdiction):''}${proj?' · '+c.esc(proj.project_name):''}</p></div><div class="du-head-actions"><button class="du-btn ghost" id="cr-back">All reviews</button><button class="du-btn ghost" id="cr-pdf-src">Open drawing set</button>${r.status==='complete'?'<button class="du-btn primary" id="cr-export">Download report (PDF)</button>':''}</div></div>
    ${r.status==='queued'?`<article class="du-glass"><h2>Not started</h2><p>${c.esc(r.error||'This review has not started yet.')}</p><button class="du-btn primary" id="cr-start">Start review</button> <span id="cr-st" class="du-save-status"></span></article>`:''}
    ${r.status==='reviewing'?`<article class="du-glass"><h2>Reviewing your sheets…</h2><p class="du-muted">This page updates by itself. Large sets can take a few minutes; you can leave and come back.</p><div class="du-loading">READING ${c.esc((r.file_name||'DRAWINGS').toUpperCase())}…</div></article>`:''}
    ${r.status==='failed'?`<article class="du-glass"><h2>The review did not finish</h2><p>${c.esc(r.error||'Unknown error.')}</p></article>`:''}
    ${r.status==='complete'?`<div class="du-stats">${counts.map(([s,n])=>`<article class="du-stat du-sev-${s}"><span>${s.toUpperCase()}</span><strong>${n}</strong></article>`).join('')}</div>
      <article class="du-glass"><h2>Summary</h2><p style="white-space:pre-wrap">${c.esc(r.summary||'')}</p><p class="du-muted">${r.credits_charged?r.credits_charged+' credits used · ':''}Reviewed ${fmtWhen(r.completed_at)}. DrawUp Check is guidance for the design team; the licensed professional of record and the authority having jurisdiction make final determinations.</p></article>
      <article class="du-glass"><h2>Findings</h2>${findings.length?`<div class="du-findings">${findings.map((f,i)=>`<div class="du-finding du-sev-${f.severity}"><div class="du-finding-head"><span class="du-status-pill" data-state="${f.severity}">${f.severity.toUpperCase()}</span><b>${c.esc(f.sheet||'Sheet ?')}</b><small>${c.esc(f.location||'')}</small><small>${c.esc(f.category.replace('_',' '))} · ${c.esc(f.confidence)} confidence</small></div><p>${c.esc(f.issue)}</p>${f.recommendation?`<p class="du-muted"><b>Fix:</b> ${c.esc(f.recommendation)}</p>`:''}${f.reference?`<p class="du-muted"><b>Reference:</b> ${c.esc(f.reference)}</p>`:''}</div>`).join('')}</div>`:'<p>No findings were returned for this set.</p>'}
      ${(r.sources||[]).length?`<h3>Sources consulted</h3><ul class="du-source-list">${r.sources.map(s=>`<li><a href="${c.esc(s.url)}" target="_blank" rel="noopener">${c.esc(s.title||s.url)}</a></li>`).join('')}</ul>`:''}</article>`:''}`;
    $q(w,'#cr-back').onclick=()=>{history.replaceState(null,'','#portal/check');c.openPortalTab('check');};
    $q(w,'#cr-pdf-src').onclick=async()=>{const u=await signedUrl(c,r.file_path);if(u)window.open(u,'_blank','noopener');else c.toast('The drawing set could not be opened.',true);};
    const ex=$q(w,'#cr-export');if(ex)ex.onclick=()=>download((r.title||'drawup-check').replace(/[^\w.-]+/g,'-')+'-report.pdf',binary(reportPDF(r,findings,proj)),'application/pdf');
    const sb=$q(w,'#cr-start');if(sb)sb.onclick=async()=>{sb.disabled=true;$q(w,'#cr-st').textContent=' Starting…';try{await api(c,'/api/check',{method:'POST',body:JSON.stringify({review_id:r.id})});r=await load();draw();poll();}catch(e){sb.disabled=false;$q(w,'#cr-st').textContent=' '+e.message;}};
  };
  const poll=async()=>{while(r.status==='reviewing'&&w.dataset.seq===seq&&document.body.contains(w)){await sleep(4000);if(w.dataset.seq!==seq)return;try{const d=await api(c,'/api/check?id='+encodeURIComponent(r.id));if(d.review&&d.review.status!==r.status){r=await load();draw();}}catch(e){console.warn('check poll',e);}}};
  draw();poll();
}
/** Plain-text PDF report of a Check review (letter, wrapped, paginated). */
function reportPDF(r,findings,proj){
  const W=612,H=792,M=54,lines=[];
  const wrap=(t,size,indent)=>{const max=Math.floor((W-2*M-(indent||0))/(size*0.5));const out=[];String(t||'').split(/\n/).forEach(par=>{let cur='';par.split(/\s+/).forEach(word=>{if((cur+' '+word).trim().length>max){out.push(cur);cur=word;}else cur=(cur+' '+word).trim();});out.push(cur);});return out;};
  const add=(t,size,opts)=>wrap(t,size,(opts||{}).indent).forEach(l=>lines.push({t:l,size,bold:(opts||{}).bold,indent:(opts||{}).indent||0}));
  add('DrawUp Check — Drawing Review Report',16,{bold:true});add(r.title,12,{bold:true});
  add([r.file_name,r.page_count?r.page_count+' pages':'',r.jurisdiction,proj?.project_name,'Reviewed '+new Date(r.completed_at||Date.now()).toLocaleString()].filter(Boolean).join(' · '),9);lines.push({t:'',size:8});
  add('Summary',12,{bold:true});add(r.summary||'',10);lines.push({t:'',size:8});
  add('Findings ('+findings.length+')',12,{bold:true});
  findings.forEach((f,i)=>{lines.push({t:'',size:5});add(`${i+1}. [${f.severity.toUpperCase()}] ${f.sheet||''} — ${f.location||''} (${f.category}, ${f.confidence} confidence)`,10,{bold:true});add(f.issue,10,{indent:14});if(f.recommendation)add('Fix: '+f.recommendation,9,{indent:14});if(f.reference)add('Reference: '+f.reference,9,{indent:14});});
  if((r.sources||[]).length){lines.push({t:'',size:8});add('Sources consulted',12,{bold:true});r.sources.forEach(s=>add((s.title||'')+' — '+s.url,8));}
  lines.push({t:'',size:8});add('DrawUp Check is guidance for the design team. The licensed professional of record and the authority having jurisdiction make final determinations.',8);
  const ps=s=>'('+String(s).replace(/[\\()]/g,x=>'\\'+x).replace(/[^\x20-\x7e]/g,x=>({'—':'-','–':'-','’':"'",'‘':"'",'“':'"','”':'"','·':'-','×':'x','′':"'",'″':'"'}[x]||'?'))+')';
  const pages=[];let y=H-M,cur=[];
  lines.forEach(l=>{const h=l.size*1.35;if(y-h<M){pages.push(cur);cur=[];y=H-M;}y-=h;if(l.t)cur.push(`BT /${l.bold?'F2':'F1'} ${l.size} Tf ${M+l.indent} ${y.toFixed(1)} Td ${ps(l.t)} Tj ET`);});
  pages.push(cur);
  const objs=['<< /Type /Catalog /Pages 2 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const kids=[];pages.forEach((p,i)=>{const s=p.join('\n')+`\nBT /F1 8 Tf ${M} 30 Td ${ps('DrawUp Check · page '+(i+1)+' of '+pages.length)} Tj ET`;objs.push(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`);const cId=objs.length;objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cId} 0 R >>`);kids.push(objs.length+' 0 R');});
  objs[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let pdf='%PDF-1.4\n';const offs=[];objs.forEach((o,i)=>{offs.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});const x=pdf.length;
  pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offs.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return pdf;
}

/* ====================================================================== SWAP */
const SWAP_TYPES=[['material','Materials / finishes'],['color','Colors'],['landscape','Landscape / site'],['lighting','Time of day / lighting'],['interior','Interior finishes']];
/* DrawUp Swap (V19): full-width workspace, a basketball-court portal with a shot clock while
   the image generates, a preview you can open full screen, and downloads that save straight to
   the device as DrawUp files (no storage links shown). */
const SWAP_CLOCK=75; // typical generation time in seconds; the clock runs into overtime if it takes longer
async function swapBlob(c,path){const {data,error}=await c.client.storage.from(BUCKET).download(path);if(error)throw error;return data;}
const swapUrls=new Map();
async function swapImg(c,path){if(!path)return'';if(swapUrls.has(path))return swapUrls.get(path);try{const u=URL.createObjectURL(await swapBlob(c,path));swapUrls.set(path,u);return u;}catch(_e){return '';}}
function swapName(g){const d=new Date(g.completed_at||g.created_at||Date.now());const p=n=>String(n).padStart(2,'0');return `DrawUp-Swap-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${(String(g.result_path||'').split('.').pop()||'png').replace('jpeg','jpg')}`;}
async function swapDownload(c,g){try{const blob=await swapBlob(c,g.result_path);download(swapName(g),blob);c.toast('Saved '+swapName(g)+' to your device.');}catch(e){c.toast('Download failed — '+(e.message||e),true);}}
function swapLightbox(c,g,src,before){document.getElementById('du-swap-lightbox')?.remove();document.body.insertAdjacentHTML('beforeend',`<div id="du-swap-lightbox" class="du-swap-lightbox" role="dialog" aria-label="Swap preview"><div class="du-swap-lb-bar"><b>DrawUp Swap</b><span>${c.esc(g.prompt||'')}</span>${before?'<button type="button" class="du-btn ghost" data-lb-compare>Show before</button>':''}<button type="button" class="du-btn primary" data-lb-dl>Download</button><button type="button" class="du-btn ghost" data-lb-x>Close</button></div><div class="du-swap-lb-stage"><img src="${c.esc(src)}" alt="Swap result"></div></div>`);
  const lb=document.getElementById('du-swap-lightbox'),img=lb.querySelector('img');lb.querySelector('[data-lb-x]').onclick=()=>lb.remove();lb.onclick=e=>{if(e.target===lb||e.target.classList.contains('du-swap-lb-stage'))lb.remove();};lb.querySelector('[data-lb-dl]').onclick=()=>swapDownload(c,g);
  const cmp=lb.querySelector('[data-lb-compare]');if(cmp)cmp.onclick=()=>{const showingBefore=img.src===before;img.src=showingBefore?src:before;cmp.textContent=showingBefore?'Show before':'Show after';};
  document.addEventListener('keydown',function k(e){if(e.key==='Escape'){lb.remove();document.removeEventListener('keydown',k);}});}
function courtPortal(c,label){document.getElementById('du-swap-court')?.remove();
  document.body.insertAdjacentHTML('beforeend',`<div id="du-swap-court" class="du-swap-court"><div class="du-court-floor"><i class="du-court-line l1"></i><i class="du-court-line l2"></i><i class="du-court-circle"></i><i class="du-court-key k1"></i><i class="du-court-key k2"></i></div><div class="du-court-ball"></div><div class="du-court-card"><span class="du-kicker">DRAWUP SWAP · IN PLAY</span><div class="du-shotclock"><span class="du-shotclock-label">SHOT CLOCK</span><b id="du-shotclock">${SWAP_CLOCK}</b></div><h2 id="du-court-status">Bringing your image onto the court…</h2><p>${c.esc(label||'')}</p><div class="du-court-result" id="du-court-result"></div><div class="du-court-actions"><button type="button" class="du-btn ghost" id="du-court-hide">Keep working — I’ll check back</button></div></div></div>`);
  const el=document.getElementById('du-swap-court'),clock=document.getElementById('du-shotclock'),status=document.getElementById('du-court-status');const t0=Date.now();
  const msgs=['Reading the building, camera and light…','Matching materials to your description…','Rendering the swap…','Checking edges and lighting…','Final touches…'];
  const timer=setInterval(()=>{const s=Math.round((Date.now()-t0)/1000),left=SWAP_CLOCK-s;if(left>=0){clock.textContent=left;el.classList.toggle('du-clock-late',left<=10);}else{clock.textContent='OT +'+(-left);el.classList.add('du-clock-ot');}status.textContent=left>=0?msgs[Math.min(msgs.length-1,Math.floor(s/(SWAP_CLOCK/msgs.length)))]:'Overtime — still generating. Bigger images can take longer.';},500);
  const close=()=>{clearInterval(timer);el.remove();};document.getElementById('du-court-hide').onclick=close;
  return {close,done(html,ok){clearInterval(timer);el.classList.add(ok?'du-court-made':'du-court-miss');clock.textContent=ok?'✓':'✕';status.textContent=ok?'Bucket. Your swap is ready.':'No good — the generation failed.';document.getElementById('du-court-result').innerHTML=html;document.getElementById('du-court-hide').textContent='Close';}};
}
P.registerTab('swap',async(w,c)=>{
  const projects=await myProjects(c);
  const {data:gens,error}=await c.client.from('swap_generations').select('*').eq('owner_id',c.user.id).order('created_at',{ascending:false}).limit(40);
  if(error)throw error;
  const seq=w.dataset.seq;
  w.innerHTML=`<div class="du-swap-full"><div class="du-work-head"><div><span class="du-kicker">DRAWUP SWAP</span><h1>Swap materials on a real image</h1><p>Upload a photo or render, describe the change, and DrawUp generates a new version that keeps the building, camera and lighting. Every result is saved to your account.</p></div></div>
  <div class="du-swap-grid">
    <article class="du-glass du-swap-form"><h2>New swap</h2>
      <div class="du-field"><label>Image (JPG, PNG or WebP, up to 20 MB)</label><input type="file" id="sw-file" accept="image/jpeg,image/png,image/webp"></div><div id="sw-preview" class="du-swap-preview"></div>
      <div class="du-field"><label>What to change</label><select id="sw-type">${SWAP_TYPES.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div>
      <div class="du-field"><label>Describe the change</label><textarea id="sw-prompt" rows="4" placeholder="e.g. Replace the red brick with light gray standing-seam metal panels; keep the windows and storefront the same."></textarea></div>
      <div class="du-field"><label>Project</label>${projectSelect(c,projects,'','sw-proj')}</div>
      <p class="du-muted">Cost: 100 credits per image. Refunded automatically if generation fails.</p>
      <button class="du-btn primary" id="sw-go">Generate</button> <span id="sw-status" class="du-save-status"></span>
    </article>
    <article class="du-glass du-swap-results"><h2>Your swaps</h2><div id="sw-list" class="du-swap-list">${gens.length?'':'<p class="du-muted">No swaps yet.</p>'}</div></article>
  </div></div>`;
  const listEl=$q(w,'#sw-list');
  const label=g=>c.esc((SWAP_TYPES.find(t=>t[0]===g.swap_type)||[0,'Swap'])[1]);
  const card=async g=>{const [src,res]=await Promise.all([swapImg(c,g.source_path),swapImg(c,g.result_path)]);return `<div class="du-swap-card" data-gen="${g.id}"><div class="du-swap-pair"><figure><img src="${c.esc(src)}" alt="Original"><figcaption>Before</figcaption></figure><figure>${res?`<button type="button" class="du-swap-open" data-open-gen="${g.id}" title="Open preview"><img src="${c.esc(res)}" alt="Swapped"><span>Preview ⤢</span></button>`:`<div class="du-swap-wait">${g.status==='failed'?'FAILED':g.status==='queued'?'NOT STARTED':'<i class="du-mini-ball"></i>GENERATING…'}</div>`}<figcaption>After</figcaption></figure></div><p><b>${label(g)}</b> · ${c.esc(g.prompt)}</p><small class="du-muted">${fmtWhen(g.created_at)}${g.credits_charged?' · '+g.credits_charged+' credits':''}${g.error?' · '+c.esc(g.error):''}</small>${res?`<p class="du-swap-actions"><button type="button" class="du-btn primary" data-dl-gen="${g.id}">Download</button> <button type="button" class="du-btn ghost" data-open-gen="${g.id}">Preview</button></p>`:''}${g.status==='queued'?`<p><button class="du-btn ghost" data-start-gen="${g.id}">Start</button></p>`:''}</div>`;};
  const bindList=()=>{listEl.querySelectorAll('[data-start-gen]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api(c,'/api/swap',{method:'POST',body:JSON.stringify({generation_id:b.dataset.startGen})});c.openPortalTab('swap');}catch(e){b.disabled=false;c.toast(e.message,true);}});
    listEl.querySelectorAll('[data-dl-gen]').forEach(b=>b.onclick=()=>swapDownload(c,gens.find(g=>g.id===b.dataset.dlGen)));
    listEl.querySelectorAll('[data-open-gen]').forEach(b=>b.onclick=async()=>{const g=gens.find(x=>x.id===b.dataset.openGen);swapLightbox(c,g,await swapImg(c,g.result_path),await swapImg(c,g.source_path));});};
  const renderList=async rows=>{if(!rows.length)return;listEl.innerHTML=(await Promise.all(rows.map(card))).join('');bindList();};
  await renderList(gens);
  $q(w,'#sw-file').onchange=e=>{const f=e.target.files[0];$q(w,'#sw-preview').innerHTML=f?`<img src="${URL.createObjectURL(f)}" alt="Selected image">`:'';};
  let court=null,watching=null;
  let polling=false;
  const poll=async()=>{if(polling)return;polling=true;try{await pollLoop();}finally{polling=false;}};
  const pollLoop=async()=>{let active=gens.filter(g=>g.status==='generating');while(active.length&&w.dataset.seq===seq){await sleep(3000);if(w.dataset.seq!==seq){court?.close();return;}let changed=false;for(const g of active){try{const d=await api(c,'/api/swap?id='+g.id);if(d.generation&&d.generation.status!==g.status){Object.assign(g,d.generation);changed=true;
        if(court&&watching===g.id){if(g.status==='complete'){const res=await swapImg(c,g.result_path);court.done(`<button type="button" class="du-swap-open" id="du-court-open"><img src="${c.esc(res)}" alt="Swap result"><span>Open full screen ⤢</span></button><div class="du-court-actions"><button type="button" class="du-btn primary" id="du-court-dl">Download</button></div>`,true);document.getElementById('du-court-dl').onclick=()=>swapDownload(c,g);document.getElementById('du-court-open').onclick=async()=>swapLightbox(c,g,res,await swapImg(c,g.source_path));}else court.done(`<p>${c.esc(g.error||'Generation failed.')}</p>`,false);court=null;}}}catch(e){console.warn('swap poll',e);}}if(changed){await renderList(gens);document.dispatchEvent(new Event('du-credits'));}active=gens.filter(g=>g.status==='generating');}};
  $q(w,'#sw-go').onclick=async()=>{
    const st=$q(w,'#sw-status'),btn=$q(w,'#sw-go'),file=$q(w,'#sw-file').files[0],prompt=$q(w,'#sw-prompt').value.trim();
    if(!file){c.toast('Choose an image first.',true);return;}
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)){c.toast('Use a JPG, PNG or WebP image.',true);return;}
    if(file.size>20*1024*1024){c.toast('That image is larger than 20 MB.',true);return;}
    if(prompt.length<6){c.toast('Describe the change you want.',true);return;}
    btn.disabled=true;st.textContent=' Uploading…';
    try{
      const id=uuid(),ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg',path=`${c.user.id}/swap/${id}-source.${ext}`;
      const up=await c.client.storage.from(BUCKET).upload(path,file,{contentType:file.type});if(up.error)throw up.error;
      const ins=await c.client.from('swap_generations').insert({id,owner_id:c.user.id,source_path:path,swap_type:$q(w,'#sw-type').value,prompt,project_thread_id:$q(w,'#sw-proj').value||null}).select('*').single();if(ins.error)throw ins.error;
      st.textContent=' Starting…';court=courtPortal(c,prompt);watching=id;
      let started=null;try{started=await api(c,'/api/swap',{method:'POST',body:JSON.stringify({generation_id:id})});}catch(e){court.done(`<p>${c.esc(e.message||String(e))}</p>`,false);court=null;c.toast(e.message,true);}
      const g={...ins.data,...(started?.generation||{})};gens.unshift(g);await renderList(gens);btn.disabled=false;st.textContent='';$q(w,'#sw-prompt').value='';
      if(g.status==='generating')poll();
    }catch(e){court?.close();court=null;btn.disabled=false;st.textContent=' Not started — '+(e.message||e);}
  };
  poll();
});

/* ====================================================================== HQ */
P.registerTab('hq',async(w,c)=>{
  const {data:isAdmin}=await c.client.rpc('is_drawup_admin');
  if(isAdmin!==true){w.innerHTML='<div class="du-empty"><span class="du-kicker">DRAWUP HQ</span><h1>HQ is only for DrawUp HQ accounts.</h1><p>This area is not available to campus managers, organization managers, firm admins or members.</p></div>';return;}
  const params=new URLSearchParams((location.hash.split('?')[1])||'');const pane=params.get('pane')||'submissions';
  const go=(p,extra)=>{history.replaceState(null,'','#portal/hq?pane='+p+(extra||''));c.openPortalTab('hq');};
  const [subs,firmsCount,projCount]=await Promise.all([
    c.client.from('firm_submissions').select('*').eq('status','pending').order('created_at',{ascending:true}).limit(100),
    c.client.from('firms').select('id',{count:'exact',head:true}).eq('is_demo',false),
    c.client.from('aec_projects').select('id',{count:'exact',head:true}).eq('is_demo',false)]);
  w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">DRAWUP HQ · OWNER CONSOLE</span><h1>HQ</h1><p>Only founder and DrawUp admin accounts can open this. Every action is checked again by the database.</p></div></div>
  <div class="du-stats">${['Pending firm submissions','Firms','Projects'].map((l,i)=>`<article class="du-stat"><span>${l}</span><strong>${[subs.data?.length??0,firmsCount.count??0,projCount.count??0][i]}</strong></article>`).join('')}</div>
  <div class="du-subtabs du-hq-tabs">${[['submissions','Firm submissions'],['firms','Firms'],['projects','Projects'],['members','Members']].map(([k,l])=>`<button type="button" data-hq-pane="${k}" class="${k===pane?'active':''}">${l}</button>`).join('')}</div><div id="hq-body"></div>`;
  w.querySelectorAll('[data-hq-pane]').forEach(b=>b.onclick=()=>go(b.dataset.hqPane));
  const body=$q(w,'#hq-body');
  if(pane==='submissions'){
    const rows=subs.data||[];
    body.innerHTML=`<article class="du-glass"><h2>Pending "Add a firm" submissions</h2>${rows.length?rows.map(s=>`<div class="du-row"><div><b>${c.esc(s.firm_name)}</b><small>${c.esc([s.city,s.state,s.country].filter(Boolean).join(', '))} · via ${c.esc(s.verification_method)}: ${c.esc(s.website||s.instagram_url||s.linkedin_url||'')}</small>${s.note?`<small>${c.esc(s.note)}</small>`:''}<small>${fmtWhen(s.created_at)}</small></div><div><button class="du-btn primary" data-approve="${s.id}">Approve</button> <button class="du-btn ghost" data-reject="${s.id}">Reject</button></div></div>`).join(''):'<p class="du-muted">Nothing waiting for review.</p>'}</article>`;
    body.querySelectorAll('[data-approve],[data-reject]').forEach(b=>b.onclick=async()=>{const approve=!!b.dataset.approve;b.disabled=true;const {data,error}=await c.client.rpc('drawup_hq_review_submission',{p_submission_id:b.dataset.approve||b.dataset.reject,p_approve:approve});if(error){b.disabled=false;c.toast(error.message,true);return;}c.toast(approve?'Approved — the firm is now in the directory.':'Rejected.');go('submissions');});
    return;
  }
  if(pane==='firms'){
    const q=params.get('q')||'',edit=params.get('edit');
    if(edit)return hqEditFirm(body,c,edit==='new'?null:edit,go);
    let qy=c.client.from('firms').select('id,name,slug,discipline,is_verified,is_demo,updated_at').order('updated_at',{ascending:false}).limit(60);if(q)qy=qy.ilike('name','%'+q+'%');
    const {data}=await qy;
    body.innerHTML=`<article class="du-glass"><div class="du-section-title"><h2>Firms</h2><div class="du-head-actions"><input id="hq-fq" placeholder="Search firms" value="${c.esc(q)}"><button class="du-btn ghost" id="hq-fs">Search</button><button class="du-btn primary" id="hq-fn">Add firm</button></div></div>${(data||[]).map(f=>`<div class="du-row"><div><b>${c.esc(f.name)}</b><small>${c.esc(f.slug)}${f.discipline?' · '+c.esc(f.discipline):''}${f.is_verified?' · verified':''}${f.is_demo?' · DEMO (hidden)':''}</small></div><button class="du-btn ghost" data-edit-firm="${f.id}">Edit</button></div>`).join('')||'<p class="du-muted">No firms match.</p>'}</article>`;
    $q(body,'#hq-fs').onclick=()=>go('firms','&q='+encodeURIComponent($q(body,'#hq-fq').value.trim()));
    $q(body,'#hq-fn').onclick=()=>go('firms','&edit=new');
    body.querySelectorAll('[data-edit-firm]').forEach(b=>b.onclick=()=>go('firms','&edit='+b.dataset.editFirm));
    return;
  }
  if(pane==='projects'){
    const q=params.get('q')||'',edit=params.get('edit');
    if(edit)return hqEditProject(body,c,edit==='new'?null:edit,go);
    let qy=c.client.from('aec_projects').select('id,name,slug,city,state,country,completion_year,is_demo').order('updated_at',{ascending:false}).limit(60);if(q)qy=qy.ilike('name','%'+q+'%');
    const {data}=await qy;
    body.innerHTML=`<article class="du-glass"><div class="du-section-title"><h2>Projects</h2><div class="du-head-actions"><input id="hq-pq" placeholder="Search projects" value="${c.esc(q)}"><button class="du-btn ghost" id="hq-ps">Search</button><button class="du-btn primary" id="hq-pn">Add project</button></div></div>${(data||[]).map(p=>`<div class="du-row"><div><b>${c.esc(p.name)}</b><small>${c.esc([p.city,p.state,p.country].filter(Boolean).join(', '))}${p.completion_year?' · '+p.completion_year:''}${p.is_demo?' · DEMO (hidden)':''}</small></div><button class="du-btn ghost" data-edit-proj="${p.id}">Edit</button></div>`).join('')||'<p class="du-muted">No projects match.</p>'}</article>`;
    $q(body,'#hq-ps').onclick=()=>go('projects','&q='+encodeURIComponent($q(body,'#hq-pq').value.trim()));
    $q(body,'#hq-pn').onclick=()=>go('projects','&edit=new');
    body.querySelectorAll('[data-edit-proj]').forEach(b=>b.onclick=()=>go('projects','&edit='+b.dataset.editProj));
    return;
  }
  if(pane==='members'){
    const q=params.get('q')||'';
    const {data,error}=await c.client.rpc('drawup_hq_find_members',{p_query:q});
    body.innerHTML=`<article class="du-glass"><div class="du-section-title"><h2>Members</h2><div class="du-head-actions"><input id="hq-mq" placeholder="Email, name or @username" value="${c.esc(q)}"><button class="du-btn ghost" id="hq-ms">Search</button></div></div>${error?`<p>${c.esc(error.message)}</p>`:(data||[]).map(m=>`<div class="du-row"><div><b>${c.esc(m.display_name||'(no name)')}</b><small>${c.esc(m.email||'')}${m.username?' · @'+c.esc(m.username):''} · ${c.esc(m.account_type)} · ${m.credits} credits</small></div><div><button class="du-btn ghost" data-grant="${m.id}">Grant credits</button> <button class="du-btn ghost" data-exp="${m.id}" data-name="${c.esc(m.display_name||m.email||'')}">Experience</button></div></div>`).join('')}</article><div id="hq-member"></div>`;
    $q(body,'#hq-ms').onclick=()=>go('members','&q='+encodeURIComponent($q(body,'#hq-mq').value.trim()));
    body.querySelectorAll('[data-grant]').forEach(b=>b.onclick=async()=>{const n=parseInt(prompt('Credits to add (use a negative number to remove):','100')||'',10);if(!n)return;const {data,error}=await c.client.rpc('drawup_hq_grant_credits',{p_user_id:b.dataset.grant,p_amount:n,p_note:'HQ console'});if(error){c.toast(error.message,true);return;}c.toast('Done — balance is now '+data.credits_remaining+' credits.');go('members','&q='+encodeURIComponent(q));});
    body.querySelectorAll('[data-exp]').forEach(b=>b.onclick=async()=>{const box=$q(body,'#hq-member');const {data:rows,error}=await c.client.from('career_timeline').select('*').eq('user_id',b.dataset.exp).order('start_date',{ascending:false});if(error){c.toast(error.message,true);return;}box.innerHTML=`<article class="du-glass"><h2>Experience · ${b.dataset.name}</h2>${(rows||[]).map(r=>`<div class="du-row"><div><b>${c.esc(r.role)}</b><small>${c.esc(r.organization||'')} · ${c.esc(r.start_date||'')}–${c.esc(r.end_date||'present')} · ${c.esc(r.verification_status)}</small></div><button class="du-btn ${r.verified?'ghost':'primary'}" data-verify="${r.id}" data-v="${r.verified?0:1}">${r.verified?'Remove verification':'Verify'}</button></div>`).join('')||'<p class="du-muted">No experience entries.</p>'}</article>`;box.querySelectorAll('[data-verify]').forEach(v=>v.onclick=async()=>{const on=v.dataset.v==='1';const {error}=await c.client.from('career_timeline').update({verified:on,verification_status:on?'verified':'unverified',verified_at:on?new Date().toISOString():null,verification_method:on?'drawup_hq':null}).eq('id',v.dataset.verify);if(error){c.toast(error.message,true);return;}c.toast(on?'Experience verified.':'Verification removed.');b.click();});});
    return;
  }
});
async function hqUpload(c,file,kind){if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw new Error('Use a JPG, PNG or WebP image.');if(file.size>12*1024*1024)throw new Error('Image is larger than 12 MB.');const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const path=`${c.user.id}/hq/${kind}/${uuid()}.${ext}`;const up=await c.client.storage.from('drawup-files').upload(path,file,{contentType:file.type});if(up.error)throw up.error;return c.client.storage.from('drawup-files').getPublicUrl(path).data.publicUrl;}
const slugify=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
async function hqEditFirm(body,c,id,go){
  let f={name:'',slug:'',discipline:'',website:'',description:'',logo_url:'',hero_image_url:'',is_verified:false,is_demo:false},photos=[],offices=[];
  if(id){const [a,b,d]=await Promise.all([c.client.from('firms').select('*').eq('id',id).single(),c.client.from('firm_photos').select('*').eq('firm_id',id).order('sort_order'),c.client.from('firm_offices').select('*').eq('firm_id',id)]);if(a.error)throw a.error;f=a.data;photos=b.data||[];offices=d.data||[];}
  body.innerHTML=`<article class="du-glass"><span class="du-kicker">${id?'EDIT FIRM':'NEW FIRM'}</span><h2>${c.esc(f.name||'New firm')}</h2>
  <div class="du-two"><div class="du-field"><label>Name</label><input id="hf-name" value="${c.esc(f.name)}"></div><div class="du-field"><label>Slug (URL)</label><input id="hf-slug" value="${c.esc(f.slug)}" placeholder="auto from name"></div></div>
  <div class="du-two"><div class="du-field"><label>Discipline</label><select id="hf-disc">${['','Architecture','Engineering','Construction','Interior Design','Landscape','Planning','Multidisciplinary'].map(x=>`<option${(f.discipline||'')===x?' selected':''}>${x}</option>`).join('')}</select></div><div class="du-field"><label>Website</label><input id="hf-web" value="${c.esc(f.website||'')}"></div></div>
  <div class="du-field"><label>Description</label><textarea id="hf-desc" rows="4">${c.esc(f.description||'')}</textarea></div>
  <div class="du-two"><div class="du-field"><label>Logo</label>${f.logo_url?`<img class="du-hq-thumb" src="${c.esc(f.logo_url)}" alt="">`:''}<input type="file" id="hf-logo" accept="image/*"></div><div class="du-field"><label>Hero image</label>${f.hero_image_url?`<img class="du-hq-thumb" src="${c.esc(f.hero_image_url)}" alt="">`:''}<input type="file" id="hf-hero" accept="image/*"></div></div>
  <label><input type="checkbox" id="hf-ver"${f.is_verified?' checked':''}> Verified by DrawUp</label> &nbsp; <label><input type="checkbox" id="hf-demo"${f.is_demo?' checked':''}> Demo / hidden from the public site</label>
  <p><button class="du-btn primary" id="hf-save">Save firm</button> <button class="du-btn ghost" id="hf-back">Back</button>${id?' <button class="du-btn ghost" id="hf-del">Delete firm</button>':''} <span id="hf-st" class="du-save-status"></span></p></article>
  ${id?`<article class="du-glass"><h2>Photos</h2><div class="du-hq-photos">${photos.map(p=>`<figure><img src="${c.esc(p.image_url)}" alt=""><figcaption>${c.esc(p.caption||'')} <button class="du-btn ghost" data-del-photo="${p.id}">Remove</button></figcaption></figure>`).join('')||'<p class="du-muted">No photos yet.</p>'}</div><div class="du-two"><div class="du-field"><label>Add photo</label><input type="file" id="hf-photo" accept="image/*"></div><div class="du-field"><label>Caption / credit</label><input id="hf-cap" placeholder="Photo: Photographer name"></div></div><button class="du-btn ghost" id="hf-addphoto">Upload photo</button></article>
  <article class="du-glass"><h2>Offices</h2>${offices.map(o=>`<div class="du-row"><div><b>${c.esc([o.city,o.state,o.country].filter(Boolean).join(', '))}</b><small>${o.is_headquarters?'Headquarters':''}</small></div><button class="du-btn ghost" data-del-office="${o.id}">Remove</button></div>`).join('')||'<p class="du-muted">No offices yet.</p>'}<div class="du-two"><div class="du-field"><label>City</label><input id="hf-city"></div><div class="du-field"><label>State / region</label><input id="hf-state"></div></div><div class="du-two"><div class="du-field"><label>Country</label><input id="hf-country" value="US"></div><div class="du-field"><label><input type="checkbox" id="hf-hq"> Headquarters</label></div></div><button class="du-btn ghost" id="hf-addoffice">Add office</button></article>`:''}`;
  $q(body,'#hf-back').onclick=()=>go('firms');
  $q(body,'#hf-save').onclick=async()=>{const st=$q(body,'#hf-st');st.textContent=' Saving…';try{const name=$q(body,'#hf-name').value.trim();if(!name)throw new Error('Name is required.');const row={name,slug:slugify($q(body,'#hf-slug').value||name),discipline:$q(body,'#hf-disc').value||null,website:$q(body,'#hf-web').value.trim()||null,description:$q(body,'#hf-desc').value.trim()||null,is_verified:$q(body,'#hf-ver').checked,is_demo:$q(body,'#hf-demo').checked,updated_at:new Date().toISOString()};const lf=$q(body,'#hf-logo').files[0],hf=$q(body,'#hf-hero').files[0];if(lf)row.logo_url=await hqUpload(c,lf,'logo');if(hf)row.hero_image_url=await hqUpload(c,hf,'hero');const res=id?await c.client.from('firms').update(row).eq('id',id).select('id').single():await c.client.from('firms').insert(row).select('id').single();if(res.error)throw res.error;c.toast('Firm saved.');go('firms','&edit='+res.data.id);}catch(e){st.textContent=' Not saved — '+(e.code==='23505'?'that URL slug is already used; change the slug.':(e.message||e));}};
  const del=$q(body,'#hf-del');if(del)del.onclick=async()=>{if(!confirm('Delete this firm and its photos and offices?'))return;const {error}=await c.client.from('firms').delete().eq('id',id);if(error){c.toast(error.message,true);return;}go('firms');};
  const ap=$q(body,'#hf-addphoto');if(ap)ap.onclick=async()=>{try{const file=$q(body,'#hf-photo').files[0];if(!file)throw new Error('Choose a photo.');const url=await hqUpload(c,file,'firm');const {error}=await c.client.from('firm_photos').insert({firm_id:id,image_url:url,caption:$q(body,'#hf-cap').value.trim()||null,sort_order:photos.length});if(error)throw error;c.toast('Photo added.');go('firms','&edit='+id);}catch(e){c.toast(e.message||String(e),true);}};
  body.querySelectorAll('[data-del-photo]').forEach(b=>b.onclick=async()=>{const {error}=await c.client.from('firm_photos').delete().eq('id',b.dataset.delPhoto);if(error){c.toast(error.message,true);return;}go('firms','&edit='+id);});
  const ao=$q(body,'#hf-addoffice');if(ao)ao.onclick=async()=>{const city=$q(body,'#hf-city').value.trim();if(!city){c.toast('City is required.',true);return;}const {error}=await c.client.from('firm_offices').insert({firm_id:id,city,state:$q(body,'#hf-state').value.trim()||null,country:$q(body,'#hf-country').value.trim()||'US',is_headquarters:$q(body,'#hf-hq').checked});if(error){c.toast(error.message,true);return;}go('firms','&edit='+id);};
  body.querySelectorAll('[data-del-office]').forEach(b=>b.onclick=async()=>{const {error}=await c.client.from('firm_offices').delete().eq('id',b.dataset.delOffice);if(error){c.toast(error.message,true);return;}go('firms','&edit='+id);});
}
async function hqEditProject(body,c,id,go){
  let p={name:'',slug:'',city:'',state:'',country:'US',project_type:'',completion_year:'',status:'completed',description:'',size_sqft:'',is_demo:false},images=[],team=[];
  if(id){const [a,b,d]=await Promise.all([c.client.from('aec_projects').select('*').eq('id',id).single(),c.client.from('project_images').select('*').eq('project_id',id).order('sort_order'),c.client.from('project_firms').select('id,role,firms(name)').eq('project_id',id)]);if(a.error)throw a.error;p=a.data;images=b.data||[];team=d.data||[];}
  body.innerHTML=`<article class="du-glass"><span class="du-kicker">${id?'EDIT PROJECT':'NEW PROJECT'}</span><h2>${c.esc(p.name||'New project')}</h2>
  <div class="du-two"><div class="du-field"><label>Name</label><input id="hp-name" value="${c.esc(p.name)}"></div><div class="du-field"><label>Slug (URL)</label><input id="hp-slug" value="${c.esc(p.slug)}" placeholder="auto from name"></div></div>
  <div class="du-two"><div class="du-field"><label>City</label><input id="hp-city" value="${c.esc(p.city||'')}"></div><div class="du-field"><label>State / region</label><input id="hp-state" value="${c.esc(p.state||'')}"></div></div>
  <div class="du-two"><div class="du-field"><label>Country</label><input id="hp-country" value="${c.esc(p.country||'US')}"></div><div class="du-field"><label>Type</label><input id="hp-type" value="${c.esc(p.project_type||'')}" placeholder="e.g. Higher education, Bridge, Hospital"></div></div>
  <div class="du-two"><div class="du-field"><label>Completion year</label><input id="hp-year" value="${c.esc(p.completion_year||'')}"></div><div class="du-field"><label>Size (sq ft)</label><input id="hp-size" value="${c.esc(p.size_sqft||'')}"></div></div>
  <div class="du-field"><label>Status</label><select id="hp-status">${['completed','under_construction','in_design','proposed'].map(x=>`<option${p.status===x?' selected':''}>${x}</option>`).join('')}</select></div>
  <div class="du-field"><label>Description</label><textarea id="hp-desc" rows="4">${c.esc(p.description||'')}</textarea></div>
  <label><input type="checkbox" id="hp-demo"${p.is_demo?' checked':''}> Demo / hidden from the public site</label>
  <p><button class="du-btn primary" id="hp-save">Save project</button> <button class="du-btn ghost" id="hp-back">Back</button>${id?' <button class="du-btn ghost" id="hp-del">Delete project</button>':''} <span id="hp-st" class="du-save-status"></span></p></article>
  ${id?`<article class="du-glass"><h2>Images</h2><div class="du-hq-photos">${images.map(i=>`<figure><img src="${c.esc(i.image_url)}" alt=""><figcaption>${i.is_hero?'<b>HERO</b> ':''}${c.esc(i.caption||'')} ${i.is_hero?'':`<button class="du-btn ghost" data-hero="${i.id}">Make hero</button>`} <button class="du-btn ghost" data-del-img="${i.id}">Remove</button></figcaption></figure>`).join('')||'<p class="du-muted">No images yet. Projects without images show no image on the public site.</p>'}</div><div class="du-two"><div class="du-field"><label>Add image</label><input type="file" id="hp-img" accept="image/*"></div><div class="du-field"><label>Caption / photo credit</label><input id="hp-cap" placeholder="Photo: Photographer name"></div></div><button class="du-btn ghost" id="hp-addimg">Upload image</button></article>
  <article class="du-glass"><h2>Project team</h2>${team.map(t=>`<div class="du-row"><div><b>${c.esc(t.firms?.name||'')}</b><small>${c.esc(t.role)}</small></div><button class="du-btn ghost" data-del-team="${t.id}">Remove</button></div>`).join('')||'<p class="du-muted">No firms linked yet.</p>'}<div class="du-two"><div class="du-field"><label>Firm name (must exist in Firms)</label><input id="hp-firm"></div><div class="du-field"><label>Role</label><input id="hp-role" placeholder="e.g. Architect, Structural Engineer, General Contractor"></div></div><button class="du-btn ghost" id="hp-addteam">Link firm</button></article>`:''}`;
  $q(body,'#hp-back').onclick=()=>go('projects');
  $q(body,'#hp-save').onclick=async()=>{const st=$q(body,'#hp-st');st.textContent=' Saving…';try{const name=$q(body,'#hp-name').value.trim();if(!name)throw new Error('Name is required.');const yr=parseInt($q(body,'#hp-year').value,10),sz=parseInt(String($q(body,'#hp-size').value).replace(/,/g,''),10);const row={name,slug:slugify($q(body,'#hp-slug').value||name),city:$q(body,'#hp-city').value.trim()||null,state:$q(body,'#hp-state').value.trim()||null,country:$q(body,'#hp-country').value.trim()||'US',project_type:$q(body,'#hp-type').value.trim()||null,completion_year:yr||null,size_sqft:sz||null,status:$q(body,'#hp-status').value,description:$q(body,'#hp-desc').value.trim()||null,is_demo:$q(body,'#hp-demo').checked,updated_at:new Date().toISOString()};const res=id?await c.client.from('aec_projects').update(row).eq('id',id).select('id').single():await c.client.from('aec_projects').insert(row).select('id').single();if(res.error)throw res.error;c.toast('Project saved.');go('projects','&edit='+res.data.id);}catch(e){st.textContent=' Not saved — '+(e.code==='23505'?'that URL slug is already used; change the slug.':(e.message||e));}};
  const del=$q(body,'#hp-del');if(del)del.onclick=async()=>{if(!confirm('Delete this project and its images?'))return;const {error}=await c.client.from('aec_projects').delete().eq('id',id);if(error){c.toast(error.message,true);return;}go('projects');};
  const ai=$q(body,'#hp-addimg');if(ai)ai.onclick=async()=>{try{const file=$q(body,'#hp-img').files[0];if(!file)throw new Error('Choose an image.');const url=await hqUpload(c,file,'project');const {error}=await c.client.from('project_images').insert({project_id:id,image_url:url,caption:$q(body,'#hp-cap').value.trim()||null,is_hero:!images.length,sort_order:images.length});if(error)throw error;c.toast('Image added.');go('projects','&edit='+id);}catch(e){c.toast(e.message||String(e),true);}};
  body.querySelectorAll('[data-del-img]').forEach(b=>b.onclick=async()=>{const {error}=await c.client.from('project_images').delete().eq('id',b.dataset.delImg);if(error){c.toast(error.message,true);return;}go('projects','&edit='+id);});
  body.querySelectorAll('[data-hero]').forEach(b=>b.onclick=async()=>{const r1=await c.client.from('project_images').update({is_hero:false}).eq('project_id',id);const r2=await c.client.from('project_images').update({is_hero:true}).eq('id',b.dataset.hero);if(r1.error||r2.error){c.toast((r1.error||r2.error).message,true);return;}go('projects','&edit='+id);});
  const at=$q(body,'#hp-addteam');if(at)at.onclick=async()=>{const name=$q(body,'#hp-firm').value.trim(),role=$q(body,'#hp-role').value.trim();if(!name||!role){c.toast('Firm name and role are required.',true);return;}const {data:f}=await c.client.from('firms').select('id,name').ilike('name',name).limit(1).maybeSingle();if(!f){c.toast('No firm named "'+name+'". Add it under Firms first.',true);return;}const {error}=await c.client.from('project_firms').insert({project_id:id,firm_id:f.id,role,provenance:'owner_verified'});if(error){c.toast(error.message,true);return;}go('projects','&edit='+id);};
  body.querySelectorAll('[data-del-team]').forEach(b=>b.onclick=async()=>{const {error}=await c.client.from('project_firms').delete().eq('id',b.dataset.delTeam);if(error){c.toast(error.message,true);return;}go('projects','&edit='+id);});
}
})();
