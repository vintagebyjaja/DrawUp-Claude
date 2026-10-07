/* DrawUp Swap V21: three modes inside a swap thread.
 *
 *  1. Swap            quick chips (materials, finishes, light, time of day, season and weather,
 *                     style) that add to the request text, plus free text. Uses the V20 flow.
 *  2. Photoreal       turns a sketch, model screenshot or photo into a photoreal render that
 *                     follows the description closely, optionally with real-life people
 *                     (how many, doing what). Sent as swap_type 'photoreal' with options.
 *  3. Let’s Play      an in-browser canvas over the image. Tap a surface to select it (a
 *                     similar-colour flood select, or brush the selection by hand), recolour it
 *                     with swatches, a colour wheel or the system colour picker. Drag in an
 *                     object from the member’s own image, then move, scale and rotate it. Undo
 *                     and reset. "Submit to the real game" uploads the edited composite, a mask
 *                     of the changed areas (transparent = change) and the objects as reference
 *                     images, and runs it through the normal swap generation (swap_type 'play'),
 *                     so it lands in the thread with the same 100 credit charge, refund and 2:00
 *                     shot clock.
 *
 * Honest limits: the selection is colour based (plus a hand brush), not object recognition, so
 * it can spill into neighbouring surfaces of a similar colour; "remove plain background" only
 * works on objects shot on a plain backdrop. The photoreal pass is what makes it look real.
 *
 * Needs drawup-swap-v20.js (which calls DrawUpSwap21.mount / beforeSend).
 */
(()=>{'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(_e){return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(_e){}}};
const MODES=[{id:'swap',icon:'⇄',name:'Swap',sub:'Materials, light, time of day'},{id:'photoreal',icon:'📷',name:'Photoreal render',sub:'Sketch or model to real'},{id:'play',icon:'🏀',name:'Let’s Play',sub:'Recolour and drag in objects'}];
const CHIPS={
  'Materials':['white oak flooring','grey polished concrete','Carrara marble','exposed red brick','board-formed concrete','walnut wood panelling','terrazzo','blackened steel','limestone cladding','cedar siding'],
  'Finishes':['matte finish','satin finish','high-gloss lacquer','brushed brass hardware','honed stone','limewash walls','fluted panels','powder-coated black metal'],
  'Light':['soft diffuse daylight','warm interior lighting','dramatic side light','cool overcast light','glowing pendant lights','LED cove lighting'],
  'Time of day':['golden hour','blue hour at dusk','bright midday sun','night with the lights on','early sunrise'],
  'Season & weather':['light snow','after rain with wet reflections','autumn leaves','lush summer planting','foggy morning'],
  'Style':['Scandinavian style','Japandi style','mid-century modern style','industrial loft style','warm minimalist style','coastal style','biophilic style'],
};
const PEOPLE=[{v:'1-2',t:'1–2'},{v:'few',t:'A few'},{v:'busy',t:'Busy'},{v:'crowd',t:'Crowd'}];
const ACTS=['walking through','sitting and talking','working','playing basketball','shopping','dining','relaxing'];
const SWATCHES=[['#ffffff','white'],['#f2ede4','warm white'],['#d9d4cc','greige'],['#9a9a96','mid grey'],['#4a4d50','charcoal'],['#151515','black'],['#c8a27a','light oak'],['#8b5a2b','walnut'],['#a2482f','brick red'],['#c2683f','terracotta'],['#e8c27a','sand'],['#9caf88','sage green'],['#2f5d50','forest green'],['#1d428a','royal blue'],['#ffc72c','gold'],['#1b2a4a','navy'],['#7fa7c9','sky blue'],['#c0392b','red'],['#e67e22','orange'],['#7d3c98','purple'],['#f1c6c6','blush pink'],['#b87333','copper']];
const NAMES=[...SWATCHES,['#808080','grey'],['#ffff00','yellow'],['#00a000','green'],['#0000ff','blue'],['#ff00ff','magenta'],['#00c0c0','teal'],['#f5f5dc','beige'],['#800000','maroon'],['#c0c0c0','silver'],['#6b4f3a','brown']];
const hex2rgb=h=>{h=String(h).replace('#','');if(h.length===3)h=h.split('').map(x=>x+x).join('');const n=parseInt(h,16)||0;return[n>>16&255,n>>8&255,n&255];};
const rgb2hex=(r,g,b)=>'#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
const colorName=h=>{const[r,g,b]=hex2rgb(h);let best='',bd=1e9;for(const[x,n]of NAMES){const[R,G,B]=hex2rgb(x);const d=(r-R)**2*2+(g-G)**2*4+(b-B)**2*3;if(d<bd){bd=d;best=n;}}return best;};
function hsv2rgb(h,s,v){const f=n=>{const k=(n+h/60)%6;return v-v*s*Math.max(0,Math.min(k,4-k,1));};return[f(5)*255,f(3)*255,f(1)*255];}
function rgb2hsv(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0;if(d){if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;if(h<0)h+=360;}return[h,mx?d/mx:0,mx];}
const whereOf=(cx,cy,W,H)=>{const v=cy<H/3?'upper':cy>2*H/3?'lower':'middle',hz=cx<W/3?'left':cx>2*W/3?'right':'centre';return v==='middle'&&hz==='centre'?'centre':`${v} ${hz}`;};
const isPhone=()=>matchMedia('(max-width:820px)').matches;

let mode=store.get('drawup_swap21_mode','swap');if(!MODES.some(m=>m.id===mode))mode='swap';
let PR=Object.assign({source:'auto',people:false,count:'few',activity:'walking through'},store.get('drawup_swap21_photoreal',{}));
let group='Materials';
let A=null; // the V20 thread api

/* ------------------------------------------------------------------ mode picker in the compose area */
function pickerHtml(){
  return `<div class="sw21-modes" id="sw21-modes"><div class="sw21-seg" role="tablist" aria-label="Swap mode">${MODES.map(m=>`<button type="button" role="tab" data-mode="${m.id}" aria-selected="${m.id===mode}" class="${m.id===mode?'on':''}"><i aria-hidden="true">${m.icon}</i><span><b>${esc(m.name)}</b><small>${esc(m.sub)}</small></span></button>`).join('')}</div><div class="sw21-panel" id="sw21-panel"></div></div>`;}
function panelHtml(){
  if(mode==='swap')return `<div class="sw21-groups" role="tablist" aria-label="Quick chips">${Object.keys(CHIPS).map(g=>`<button type="button" role="tab" data-group="${esc(g)}" aria-selected="${g===group}" class="${g===group?'on':''}">${esc(g)}</button>`).join('')}</div><div class="sw21-chips" aria-label="${esc(group)} chips">${CHIPS[group].map(t=>`<button type="button" data-chip="${esc(t)}">＋ ${esc(t)}</button>`).join('')}</div><small class="sw21-note">Chips add to your request. Name where, e.g. “floor”, or mark the area.</small>`;
  if(mode==='photoreal')return `<div class="sw21-pr"><label>Starting from <select id="sw21-src"><option value="auto">Let DrawUp tell</option><option value="sketch">A sketch or drawing</option><option value="model">A 3D model screenshot</option><option value="photo">A photo</option></select></label><label class="sw21-toggle"><input type="checkbox" id="sw21-people" ${PR.people?'checked':''}> Add real-life people</label></div>
    <div class="sw21-people ${PR.people?'':'off'}" id="sw21-peoplebox"><div class="sw21-row"><span>How many</span>${PEOPLE.map(p=>`<button type="button" data-count="${p.v}" class="${PR.count===p.v?'on':''}" aria-pressed="${PR.count===p.v}">${p.t}</button>`).join('')}</div><div class="sw21-row"><span>Doing</span>${ACTS.map(a=>`<button type="button" data-act="${esc(a)}" class="${PR.activity===a?'on':''}" aria-pressed="${PR.activity===a}">${esc(a)}</button>`).join('')}<input id="sw21-act" maxlength="80" placeholder="or type it" value="${ACTS.includes(PR.activity)?'':esc(PR.activity)}" aria-label="What the people are doing"></div></div>
    <div class="sw21-row end"><small class="sw21-note">Describe it below as closely as you like: DrawUp follows the description. 100 credits.</small><button type="button" class="du-btn primary" id="sw21-render">Render photoreal</button></div>`;
  return `<div class="sw21-playcta"><div><b>Let’s Play on this image</b><span>Tap a surface and recolour it on the spot, drag in an object from your own photo (say a basketball goal), then submit your play to the real game for a photoreal render in this thread.</span></div><button type="button" class="du-btn primary" id="sw21-openplay">▶ Open Let’s Play</button></div>`;
}
function mount(api){A=api;const comp=api.w.querySelector('#sw20-compose');if(!comp)return;comp.querySelector('#sw21-modes')?.remove();comp.insertAdjacentHTML('afterbegin',pickerHtml());
  comp.querySelectorAll('.sw21-seg [data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;store.set('drawup_swap21_mode',mode);comp.querySelectorAll('.sw21-seg [data-mode]').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-selected',x===b);});drawPanel();});
  comp.querySelector('.sw21-seg').addEventListener('keydown',e=>{if(!/^Arrow(Left|Right)$/.test(e.key))return;const bs=[...comp.querySelectorAll('.sw21-seg [data-mode]')],i=bs.indexOf(document.activeElement);if(i<0)return;e.preventDefault();const n=bs[(i+(e.key==='ArrowRight'?1:bs.length-1))%bs.length];n.focus();n.click();});
  drawPanel();}
function drawPanel(){const comp=A?.w.querySelector('#sw20-compose');if(!comp)return;const box=comp.querySelector('#sw21-panel');box.innerHTML=panelHtml();comp.dataset.sw21=mode;
  const input=comp.querySelector('#sw20-input');
  if(input&&A.V.active)input.placeholder=mode==='photoreal'?'Describe the render… e.g. warm oak, white walls, late afternoon sun, lush planting':mode==='swap'?'Describe the change… e.g. make the floor grey polished concrete':input.placeholder;
  box.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{group=b.dataset.group;drawPanel();comp.querySelector(`[data-group="${CSS.escape(group)}"]`)?.focus();});
  box.querySelectorAll('[data-chip]').forEach(b=>b.onclick=()=>{if(!input)return;const v=input.value.trim();input.value=v?(/[,.;]$/.test(v)?v+' ':v+', ')+b.dataset.chip:b.dataset.chip;input.focus();b.classList.add('used');});
  const save=()=>store.set('drawup_swap21_photoreal',PR);
  box.querySelector('#sw21-src')?.addEventListener('change',e=>{PR.source=e.target.value;save();});const src=box.querySelector('#sw21-src');if(src)src.value=PR.source;
  box.querySelector('#sw21-people')?.addEventListener('change',e=>{PR.people=e.target.checked;save();box.querySelector('#sw21-peoplebox').classList.toggle('off',!PR.people);});
  box.querySelectorAll('[data-count]').forEach(b=>b.onclick=()=>{PR.count=b.dataset.count;PR.people=true;save();drawPanel();});
  box.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>{PR.activity=b.dataset.act;PR.people=true;save();drawPanel();});
  box.querySelector('#sw21-act')?.addEventListener('input',e=>{const v=e.target.value.trim();if(v){PR.activity=v;PR.people=true;save();box.querySelectorAll('[data-act]').forEach(x=>{x.classList.remove('on');x.setAttribute('aria-pressed','false');});}});
  box.querySelector('#sw21-render')?.addEventListener('click',()=>{if(!A.V.active){A.c.toast('Add an image first: paste, drop or upload one.',true);return;}const f=comp.querySelector('#sw20-form');if(!input.value.trim())input.value='Photoreal render true to the original design';f.requestSubmit();});
  box.querySelector('#sw21-openplay')?.addEventListener('click',()=>openPlay());}

/* V20 calls this before sending a request; returning {extra} sends it as a V21 mode. */
function beforeSend(text){
  if(mode!=='photoreal')return null;
  const people=PR.people?{count:PR.count,activity:PR.activity}:null;
  const ptxt=people?` · People: ${(PEOPLE.find(p=>p.v===people.count)||{}).t||''}, ${people.activity}`:' · No people';
  return {text,body:text+ptxt,label:'Photoreal render',extra:{swapType:'photoreal',noMask:true,options:{source_kind:PR.source==='auto'?'':PR.source,people}}};
}

/* ------------------------------------------------------------------ Let’s Play */
let P=null; // the open play session (tests read it through DrawUpSwap21.play)
async function loadImg(src){return await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('That image could not be opened.'));i.src=src;});}
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}

async function openPlay(){
  if(!A||!A.V.active){A?.c.toast('Add an image first: paste, drop or upload one.',true);return;}
  const path=A.base();const src=path&&await A.imgUrl(path);if(!src){A.c.toast('That image could not be opened.',true);return;}
  let img;try{img=await loadImg(src);}catch(e){A.c.toast(e.message,true);return;}
  const k=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight)),W=Math.max(1,Math.round(img.naturalWidth*k)),H=Math.max(1,Math.round(img.naturalHeight*k));
  const work=canvas(W,H),wx=work.getContext('2d',{willReadFrequently:true});wx.drawImage(img,0,0,W,H);
  const orig=wx.getImageData(0,0,W,H);
  const lum=new Float32Array(W*H);for(let i=0,j=0;i<lum.length;i++,j+=4)lum[i]=.299*orig.data[j]+.587*orig.data[j+1]+.114*orig.data[j+2];
  const chg=canvas(W,H); // alpha = recoloured pixels
  P={W,H,work,wx,orig,lum,chg,sel:new Uint8Array(W*H),selCount:0,selVer:1,objs:[],active:null,changes:[],undo:[],tool:'pick',tol:28,contig:true,add:false,color:'#1d428a',hsv:rgb2hsv(...hex2rgb('#1d428a')),cursor:{x:W/2,y:H/2},promptDirty:false,basePath:path,busy:false};
  buildUi();render();refreshSide();
}

function buildUi(){document.getElementById('sw21-play')?.remove();
  document.body.insertAdjacentHTML('beforeend',`<div id="sw21-play" class="sw21-play" role="dialog" aria-modal="true" aria-label="Let’s Play">
  <header class="sw21-pbar"><b class="sw21-logo">🏀 LET’S PLAY</b><span class="sw21-hint">Tap a surface to select it, then pick a colour. Drag in an object to place it.</span>
    <div class="sw21-pbtns"><button type="button" class="du-btn ghost" id="sw21-undo" disabled>↶ Undo</button><button type="button" class="du-btn ghost" id="sw21-reset">Reset</button><button type="button" class="du-btn ghost" id="sw21-close">Close</button></div></header>
  <div class="sw21-pbody">
    <div class="sw21-stage" id="sw21-stage"><canvas id="sw21-cv" tabindex="0" aria-label="Your image. Tap a surface to select it. Keyboard: arrows move the cursor, Enter selects."></canvas><div class="sw21-dropnote">Drop an image to add it as an object</div></div>
    <aside class="sw21-side">
      <section><h3>1 · Select</h3><div class="sw21-tools" role="group" aria-label="Selection tool"><button type="button" data-tool="pick" class="on" aria-pressed="true">☝ Tap select</button><button type="button" data-tool="brush" aria-pressed="false">🖌 Brush</button><button type="button" data-tool="erase" aria-pressed="false">⌫ Unbrush</button></div>
        <label class="sw21-range">Similar colours <input type="range" id="sw21-tol" min="4" max="80" value="28"><output id="sw21-tolv">28</output></label>
        <label class="sw21-range" id="sw21-sizebox" hidden>Brush size <input type="range" id="sw21-bsize" min="1" max="12" value="4"></label>
        <div class="sw21-checks"><label><input type="checkbox" id="sw21-contig" checked> Touching only</label><label><input type="checkbox" id="sw21-add"> Add to selection</label><button type="button" class="sw21-link" id="sw21-none">Select none</button></div>
        <p class="sw21-selinfo" id="sw21-selinfo" aria-live="polite">Nothing selected yet.</p></section>
      <section><h3>2 · Colour</h3><div class="sw21-sw" role="group" aria-label="Swatches">${SWATCHES.map(([h,n])=>`<button type="button" data-sw="${h}" title="${esc(n)}" aria-label="${esc(n)}" style="--c:${h}"></button>`).join('')}</div>
        <div class="sw21-wheelrow"><canvas id="sw21-wheel" width="132" height="132" tabindex="0" aria-label="Colour wheel. Arrows change hue and strength."></canvas><div class="sw21-wheelside"><label class="sw21-range">Brightness <input type="range" id="sw21-val" min="5" max="100" value="54"></label><label class="sw21-pick">Picker <input type="color" id="sw21-color" value="#1d428a"></label><div class="sw21-cur"><i id="sw21-curc"></i><span id="sw21-curn">royal blue</span></div><button type="button" class="du-btn primary" id="sw21-apply">Apply colour</button></div></div></section>
      <section><h3>3 · Drag in an object</h3><label class="du-btn ghost sw21-addobj">＋ Add object image<input type="file" id="sw21-objfile" accept="image/jpeg,image/png,image/webp" hidden></label><label class="sw21-check"><input type="checkbox" id="sw21-cut" checked> Remove plain background (works on plain backdrops only)</label>
        <div id="sw21-objs"></div></section>
      <section><h3>4 · Submit to the real game</h3><ul class="sw21-changes" id="sw21-changes"></ul><label class="sw21-promptl">What DrawUp will render (edit freely)<textarea id="sw21-prompt" rows="4"></textarea></label><button type="button" class="du-btn primary sw21-submit" id="sw21-submit">Submit to the real game · 100 credits</button><small class="sw21-note">Refunded automatically if it fails or the 2:00 shot clock runs out.</small></section>
      <p class="sw21-keys">Keys: Ctrl/⌘+Z undo · arrows move the cursor or object · Enter select · +/− size · [ ] rotate · Delete remove object · Esc close</p>
    </aside></div></div>`);
  const ov=document.getElementById('sw21-play'),cv=ov.querySelector('#sw21-cv');cv.width=P.W;cv.height=P.H;
  const $=s=>ov.querySelector(s);
  $('#sw21-close').onclick=()=>closePlay();
  $('#sw21-undo').onclick=undo;
  $('#sw21-reset').onclick=()=>{if((P.changes.length||P.objs.length)&&!confirm('Reset all your play changes?'))return;resetPlay();};
  ov.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{P.tool=b.dataset.tool;ov.querySelectorAll('[data-tool]').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b);});$('#sw21-sizebox').hidden=P.tool==='pick';cv.style.cursor=P.tool==='pick'?'pointer':'crosshair';});
  $('#sw21-tol').oninput=e=>{P.tol=+e.target.value;$('#sw21-tolv').textContent=P.tol;};
  $('#sw21-contig').onchange=e=>{P.contig=e.target.checked;};$('#sw21-add').onchange=e=>{P.add=e.target.checked;};
  $('#sw21-none').onclick=()=>{P.sel.fill(0);P.selCount=0;P.selVer++;render();refreshSide();};
  ov.querySelectorAll('[data-sw]').forEach(b=>b.onclick=()=>{setColor(b.dataset.sw);if(P.selCount)applyColor();});
  $('#sw21-color').oninput=e=>setColor(e.target.value);
  $('#sw21-val').oninput=e=>{P.hsv[2]=+e.target.value/100;setColor(rgb2hex(...hsv2rgb(...P.hsv)),true);};
  $('#sw21-apply').onclick=()=>applyColor();
  wheel($('#sw21-wheel'));drawWheel();
  $('#sw21-objfile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)addObject(f);};
  $('#sw21-prompt').oninput=()=>{P.promptDirty=true;};
  $('#sw21-submit').onclick=()=>submitPlay();
  const stage=$('#sw21-stage');
  stage.addEventListener('dragover',e=>{if([...(e.dataTransfer?.items||[])].some(i=>i.kind==='file')){e.preventDefault();stage.classList.add('drop');}});
  stage.addEventListener('dragleave',()=>stage.classList.remove('drop'));
  stage.addEventListener('drop',e=>{stage.classList.remove('drop');const f=[...(e.dataTransfer?.files||[])].find(x=>/^image\//.test(x.type));if(f){e.preventDefault();addObject(f,pt(e));}});
  pointer(cv);
  cv.addEventListener('focus',()=>{P.kbd=true;render();});cv.addEventListener('blur',()=>{P.kbd=false;render();});
  document.addEventListener('keydown',onKey,true);document.addEventListener('paste',onPaste,true);
  setColor(P.color);fitCanvas();addEventListener('resize',fitCanvas);setTimeout(()=>cv.focus({preventScroll:true}),50);
}
/* show the image as large as the stage allows (small images are scaled up, never cropped) */
function fitCanvas(){const cv=document.getElementById('sw21-cv'),st=document.getElementById('sw21-stage');if(!cv||!st||!P)return;
  const aw=Math.max(80,st.clientWidth-(isPhone()?16:28)),ah=Math.max(80,isPhone()?innerHeight*.42:st.clientHeight-28),k=Math.min(aw/P.W,ah/P.H);
  cv.style.width=Math.floor(P.W*k)+'px';cv.style.height=Math.floor(P.H*k)+'px';}
function closePlay(force){if(!P)return;if(!force&&(P.changes.length||P.objs.length)&&!confirm('Close Let’s Play? Your play changes will be lost.'))return;document.getElementById('sw21-play')?.remove();removeEventListener('resize',fitCanvas);document.removeEventListener('keydown',onKey,true);document.removeEventListener('paste',onPaste,true);P=null;}
function resetPlay(){P.wx.putImageData(P.orig,0,0);P.chg.getContext('2d').clearRect(0,0,P.W,P.H);P.objs=[];P.active=null;P.changes=[];P.undo=[];P.sel.fill(0);P.selCount=0;P.selVer++;P.promptDirty=false;render();refreshSide();}

/* --- coordinates and pointer */
function pt(e){const cv=document.getElementById('sw21-cv'),r=cv.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*P.W,y:(e.clientY-r.top)/r.height*P.H};}
function toLocal(o,p){const dx=(p.x-o.x)/o.s,dy=(p.y-o.y)/o.s,c=Math.cos(-o.r),s=Math.sin(-o.r);return{x:dx*c-dy*s+o.c.width/2,y:dx*s+dy*c+o.c.height/2};}
function corner(o){const c=Math.cos(o.r),s=Math.sin(o.r),hx=o.c.width/2*o.s,hy=o.c.height/2*o.s;return{x:o.x+hx*c-hy*s,y:o.y+hx*s+hy*c};}
function hitObj(p){for(let i=P.objs.length-1;i>=0;i--){const o=P.objs[i],l=toLocal(o,p);if(l.x>=0&&l.y>=0&&l.x<o.c.width&&l.y<o.c.height&&o.alpha[(l.y|0)*o.c.width+(l.x|0)]>12)return o;}return null;}
function pointer(cv){const pts=new Map();let drag=null;
  const handleR=()=>Math.max(P.W,P.H)*.025;
  cv.addEventListener('pointerdown',e=>{e.preventDefault();cv.focus({preventScroll:true});try{cv.setPointerCapture(e.pointerId);}catch(_e){}const p=pt(e);pts.set(e.pointerId,p);
    if(pts.size===2&&P.active){const[a,b]=[...pts.values()];drag={kind:'pinch',o:P.active,d0:Math.hypot(b.x-a.x,b.y-a.y),a0:Math.atan2(b.y-a.y,b.x-a.x),s0:P.active.s,r0:P.active.r,snap:snapObjs()};return;}
    if(pts.size>1)return;
    if(P.tool!=='pick'){drag={kind:'paint',last:p};paint(p,p);return;}
    if(P.active){const h=corner(P.active);if(Math.hypot(p.x-h.x,p.y-h.y)<handleR()*1.6){const o=P.active;drag={kind:'handle',o,v0:Math.hypot(p.x-o.x,p.y-o.y),a0:Math.atan2(p.y-o.y,p.x-o.x),s0:o.s,r0:o.r,snap:snapObjs()};return;}}
    const o=hitObj(p);if(o){P.active=o;P.objs.splice(P.objs.indexOf(o),1);P.objs.push(o);drag={kind:'move',o,dx:p.x-o.x,dy:p.y-o.y,snap:snapObjs(),moved:false};render();refreshSide();return;}
    if(P.active){P.active=null;render();refreshSide();return;} // first tap away just lets go of the object
    floodSelect(p);});
  cv.addEventListener('pointermove',e=>{if(!pts.has(e.pointerId))return;const p=pt(e);pts.set(e.pointerId,p);if(!drag)return;
    if(drag.kind==='paint'){paint(drag.last,p);drag.last=p;}
    else if(drag.kind==='move'){drag.o.x=p.x-drag.dx;drag.o.y=p.y-drag.dy;drag.moved=true;render();}
    else if(drag.kind==='handle'){const o=drag.o;o.s=Math.max(.02,drag.s0*Math.hypot(p.x-o.x,p.y-o.y)/Math.max(1,drag.v0));o.r=drag.r0+Math.atan2(p.y-o.y,p.x-o.x)-drag.a0;drag.moved=true;render();}
    else if(drag.kind==='pinch'&&pts.size===2){const[a,b]=[...pts.values()];drag.o.s=Math.max(.02,drag.s0*Math.hypot(b.x-a.x,b.y-a.y)/Math.max(1,drag.d0));drag.o.r=drag.r0+Math.atan2(b.y-a.y,b.x-a.x)-drag.a0;drag.moved=true;render();}});
  const up=e=>{pts.delete(e.pointerId);if(!drag)return;if(pts.size)return;
    if(drag.kind==='paint'){P.selCount=countSel();refreshSide();}
    else if(drag.moved){pushObjUndo(drag.snap,'Moved an object');}
    drag=null;};
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);}

/* --- selection */
function countSel(){let n=0;for(let i=0;i<P.sel.length;i++)n+=P.sel[i];return n;}
function floodSelect(p){const{W,H}=P,x0=Math.max(0,Math.min(W-1,p.x|0)),y0=Math.max(0,Math.min(H-1,p.y|0));
  const d=P.wx.getImageData(0,0,W,H).data,i0=(y0*W+x0)*4,r0=d[i0],g0=d[i0+1],b0=d[i0+2],thr=(P.tol/100*441)**2;
  const near=j=>{const q=j*4,dr=d[q]-r0,dg=d[q+1]-g0,db=d[q+2]-b0;return dr*dr+dg*dg+db*db<=thr;};
  const sel=P.add?P.sel:new Uint8Array(W*H);
  if(!P.contig){for(let j=0;j<W*H;j++)if(near(j))sel[j]=1;}
  else{const seen=new Uint8Array(W*H),st=new Int32Array(W*H);let sp=0;st[sp++]=y0*W+x0;seen[y0*W+x0]=1;
    while(sp){const j=st[--sp];sel[j]=1;const x=j%W,y=(j/W)|0;
      if(x>0&&!seen[j-1]){seen[j-1]=1;if(near(j-1))st[sp++]=j-1;}if(x<W-1&&!seen[j+1]){seen[j+1]=1;if(near(j+1))st[sp++]=j+1;}
      if(y>0&&!seen[j-W]){seen[j-W]=1;if(near(j-W))st[sp++]=j-W;}if(y<H-1&&!seen[j+W]){seen[j+W]=1;if(near(j+W))st[sp++]=j+W;}}}
  P.sel=sel;P.selVer++;P.selCount=countSel();P.selAt={x:x0,y:y0};render();refreshSide();}
function paint(a,b){const{W,H}=P,r=Math.max(W,H)*(+(document.getElementById('sw21-bsize')?.value||4))/100,v=P.tool==='erase'?0:1;
  const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/(r/2)));
  for(let s=0;s<=steps;s++){const cx=a.x+(b.x-a.x)*s/steps,cy=a.y+(b.y-a.y)*s/steps;
    for(let y=Math.max(0,cy-r|0);y<=Math.min(H-1,cy+r|0);y++)for(let x=Math.max(0,cx-r|0);x<=Math.min(W-1,cx+r|0);x++)if((x-cx)**2+(y-cy)**2<=r*r)P.sel[y*W+x]=v;}
  P.selVer++;render();}

/* --- colour */
function setColor(h,fromVal){P.color=h;const ov=document.getElementById('sw21-play');if(!ov)return;
  if(!fromVal){const v=rgb2hsv(...hex2rgb(h));P.hsv=v;ov.querySelector('#sw21-val').value=Math.round(v[2]*100);}
  ov.querySelector('#sw21-color').value=h;ov.querySelector('#sw21-curc').style.background=h;ov.querySelector('#sw21-curn').textContent=`${colorName(h)} · ${h}`;
  ov.querySelectorAll('[data-sw]').forEach(b=>b.classList.toggle('on',b.dataset.sw===h));drawWheel();}
function drawWheel(){const cv=document.getElementById('sw21-wheel');if(!cv)return;const x=cv.getContext('2d'),R=cv.width/2,img=x.createImageData(cv.width,cv.height),v=P.hsv[2];
  for(let j=0;j<cv.height;j++)for(let i=0;i<cv.width;i++){const dx=i-R,dy=j-R,d=Math.hypot(dx,dy),q=(j*cv.width+i)*4;if(d>R-1)continue;const h=(Math.atan2(dy,dx)*180/Math.PI+360)%360,[r,g,b]=hsv2rgb(h,d/R,v);img.data[q]=r;img.data[q+1]=g;img.data[q+2]=b;img.data[q+3]=255;}
  x.putImageData(img,0,0);const a=P.hsv[0]*Math.PI/180,rr=P.hsv[1]*R;x.strokeStyle=v>.5?'#000':'#fff';x.lineWidth=2;x.beginPath();x.arc(R+Math.cos(a)*rr,R+Math.sin(a)*rr,6,0,Math.PI*2);x.stroke();}
function wheel(cv){let down=false;const R=cv.width/2;
  const set=e=>{const r=cv.getBoundingClientRect(),dx=(e.clientX-r.left)/r.width*cv.width-R,dy=(e.clientY-r.top)/r.height*cv.height-R;P.hsv[0]=(Math.atan2(dy,dx)*180/Math.PI+360)%360;P.hsv[1]=Math.min(1,Math.hypot(dx,dy)/R);setColor(rgb2hex(...hsv2rgb(...P.hsv)),true);};
  cv.addEventListener('pointerdown',e=>{e.preventDefault();down=true;cv.setPointerCapture(e.pointerId);set(e);});cv.addEventListener('pointermove',e=>{if(down)set(e);});
  const up=()=>{down=false;};cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  cv.addEventListener('keydown',e=>{const k=e.key;if(!/^Arrow/.test(k))return;e.preventDefault();e.stopPropagation();if(k==='ArrowLeft')P.hsv[0]=(P.hsv[0]+350)%360;if(k==='ArrowRight')P.hsv[0]=(P.hsv[0]+10)%360;if(k==='ArrowUp')P.hsv[1]=Math.min(1,P.hsv[1]+.05);if(k==='ArrowDown')P.hsv[1]=Math.max(0,P.hsv[1]-.05);setColor(rgb2hex(...hsv2rgb(...P.hsv)),true);});}
/* Recolour keeps the light: each pixel takes the new colour scaled by its original brightness
   relative to the selection average, so shading, texture and shadows stay visible. */
function applyColor(){if(!P.selCount){A.c.toast('Tap a surface first to select it.',true);return;}
  const{W,H,sel,lum}=P;let x0=W,y0=H,x1=0,y1=0,sum=0,n=0;
  for(let j=0;j<W*H;j++)if(sel[j]){const x=j%W,y=(j/W)|0;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;sum+=lum[j];n++;}
  const bw=x1-x0+1,bh=y1-y0+1,before=P.wx.getImageData(x0,y0,bw,bh),cx=P.chg.getContext('2d'),chgBefore=cx.getImageData(x0,y0,bw,bh);
  const out=P.wx.getImageData(x0,y0,bw,bh),cm=cx.getImageData(x0,y0,bw,bh),m=Math.max(8,sum/n),[tr,tg,tb]=hex2rgb(P.color),tl=.299*tr+.587*tg+.114*tb;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const j=y*W+x;if(!sel[j])continue;const q=((y-y0)*bw+(x-x0))*4,f=Math.max(.2,Math.min(1.9,lum[j]/m));
    // dark targets keep relative shading, light targets compress highlights so whites stay white
    const k=tl>200?.55+.45*f:f;out.data[q]=Math.min(255,tr*k);out.data[q+1]=Math.min(255,tg*k);out.data[q+2]=Math.min(255,tb*k);out.data[q+3]=255;cm.data[q+3]=255;}
  P.wx.putImageData(out,x0,y0);cx.putImageData(cm,x0,y0);
  const pct=Math.max(1,Math.round(n/(W*H)*100)),ch={kind:'color',hex:P.color,name:colorName(P.color),where:whereOf((x0+x1)/2,(y0+y1)/2,W,H),pct,selVer:P.selVer};
  P.undo.push({kind:'color',x0,y0,before,chgBefore,prev:P.changes.slice()});
  // trying another colour on the same selection replaces the last one instead of stacking
  const last=P.changes[P.changes.length-1];if(last&&last.selVer===P.selVer)P.changes[P.changes.length-1]=ch;else P.changes.push(ch);trimUndo();
  render();refreshSide();}

/* --- objects */
async function addObject(file,at){if(!P)return;if(!/^image\//.test(file.type||'')){A.c.toast('Use a JPG, PNG or WebP image.',true);return;}if(P.objs.length>=3){A.c.toast('Up to 3 objects per play.',true);return;}
  let bmp;try{bmp=await createImageBitmap(file,{imageOrientation:'from-image'});}catch(_e){try{bmp=await loadImg(URL.createObjectURL(file));}catch(e){A.c.toast(e.message,true);return;}}
  const k=Math.min(1,1024/Math.max(bmp.width,bmp.height)),w=Math.max(1,Math.round(bmp.width*k)),h=Math.max(1,Math.round(bmp.height*k)),c=canvas(w,h),x=c.getContext('2d',{willReadFrequently:true});x.drawImage(bmp,0,0,w,h);
  let cut=0;if(document.getElementById('sw21-cut')?.checked)cut=cutBackground(c);
  const alpha=new Uint8Array(w*h),d=x.getImageData(0,0,w,h).data;for(let i=0;i<w*h;i++)alpha[i]=d[i*4+3];
  const s=Math.min(P.W,P.H)*.4/Math.max(w,h),snap=snapObjs();
  const o={id:Math.random().toString(36).slice(2,8),c,alpha,x:at?.x??P.W/2,y:at?.y??P.H/2,s,r:0,desc:'',name:file.name||'object'};
  P.objs.push(o);P.active=o;pushObjUndo(snap,'Added an object');
  A.c.toast(cut>0.02?`Object added. Plain background removed (${Math.round(cut*100)}% of it).`:'Object added. Drag to place it; use the corner handle, the sliders or a pinch to size and turn it.');
  setTimeout(()=>document.querySelector(`[data-objdesc="${o.id}"]`)?.focus(),60);}
/* Flood from the border with similar colours and make them transparent (plain backdrops only). */
function cutBackground(c){const w=c.width,h=c.height,x=c.getContext('2d'),img=x.getImageData(0,0,w,h),d=img.data,seen=new Uint8Array(w*h),st=new Int32Array(w*h);let sp=0,n=0;
  const corners=[0,w-1,(h-1)*w,(h-1)*w+w-1].map(j=>[d[j*4],d[j*4+1],d[j*4+2]]);
  const bg=j=>{const q=j*4;if(d[q+3]<20)return true;return corners.some(([r,g,b])=>(d[q]-r)**2+(d[q+1]-g)**2+(d[q+2]-b)**2<1600);};
  for(let i=0;i<w;i++){[i,(h-1)*w+i].forEach(j=>{if(!seen[j]&&bg(j)){seen[j]=1;st[sp++]=j;}});}for(let i=0;i<h;i++){[i*w,i*w+w-1].forEach(j=>{if(!seen[j]&&bg(j)){seen[j]=1;st[sp++]=j;}});}
  while(sp){const j=st[--sp];d[j*4+3]=0;n++;const xx=j%w,yy=(j/w)|0;for(const q of[xx>0?j-1:-1,xx<w-1?j+1:-1,yy>0?j-w:-1,yy<h-1?j+w:-1])if(q>=0&&!seen[q]){seen[q]=1;if(bg(q))st[sp++]=q;}}
  if(n>w*h*.97)return 0; // it would remove everything: keep the original
  x.putImageData(img,0,0);return n/(w*h);}
function snapObjs(){return P.objs.map(o=>({o,x:o.x,y:o.y,s:o.s,r:o.r,desc:o.desc}));}
function pushObjUndo(snap,label){P.undo.push({kind:'obj',snap,active:P.active,nChanges:P.changes.length,label});trimUndo();render();refreshSide();}
function trimUndo(){while(P.undo.length>30)P.undo.shift();}
function undo(){const u=P&&P.undo.pop();if(!u)return;
  if(u.kind==='color'){P.wx.putImageData(u.before,u.x0,u.y0);P.chg.getContext('2d').putImageData(u.chgBefore,u.x0,u.y0);P.changes=u.prev;}
  else{P.objs=u.snap.map(s=>Object.assign(s.o,{x:s.x,y:s.y,s:s.s,r:s.r,desc:s.desc}));if(!P.objs.includes(P.active))P.active=null;}
  render();refreshSide();}

/* --- drawing */
function drawObjs(x,list){for(const o of list){x.save();x.translate(o.x,o.y);x.rotate(o.r);x.scale(o.s,o.s);x.drawImage(o.c,-o.c.width/2,-o.c.height/2);x.restore();}}
let selCv=null,selKey='';
function render(){const cv=document.getElementById('sw21-cv');if(!cv||!P)return;const x=cv.getContext('2d'),{W,H}=P;
  x.clearRect(0,0,W,H);x.drawImage(P.work,0,0);drawObjs(x,P.objs);
  if(P.selCount||P.tool!=='pick'){if(!selCv||selCv.width!==W||selCv.height!==H){selCv=canvas(W,H);selKey='';}const key=P.selVer+'';if(key!==selKey){selKey=key;const sx=selCv.getContext('2d'),im=sx.createImageData(W,H);
    for(let j=0;j<W*H;j++)if(P.sel[j]){const q=j*4,edge=(j%W&&!P.sel[j-1])||(j%W<W-1&&!P.sel[j+1])||(j>=W&&!P.sel[j-W])||(j<W*(H-1)&&!P.sel[j+W]);im.data[q]=edge?255:127;im.data[q+1]=edge?255:231;im.data[q+2]=255;im.data[q+3]=edge?255:90;}
    sx.putImageData(im,0,0);}x.drawImage(selCv,0,0);}
  const lw=Math.max(2,Math.max(W,H)/400);
  if(P.active){const o=P.active;x.save();x.translate(o.x,o.y);x.rotate(o.r);x.setLineDash([lw*4,lw*3]);x.strokeStyle='#ff8a3d';x.lineWidth=lw;x.strokeRect(-o.c.width/2*o.s,-o.c.height/2*o.s,o.c.width*o.s,o.c.height*o.s);x.restore();
    const h=corner(o),R=Math.max(W,H)*.025;x.fillStyle='#ff8a3d';x.strokeStyle='#fff';x.lineWidth=lw;x.beginPath();x.arc(h.x,h.y,R,0,Math.PI*2);x.fill();x.stroke();x.fillStyle='#fff';x.font=`700 ${R*1.2}px system-ui`;x.textAlign='center';x.textBaseline='middle';x.fillText('⤡',h.x,h.y);}
  if(P.kbd&&!P.active){const c=P.cursor,R=Math.max(W,H)*.02;x.strokeStyle='#7fe7ff';x.lineWidth=lw;x.beginPath();x.moveTo(c.x-R,c.y);x.lineTo(c.x+R,c.y);x.moveTo(c.x,c.y-R);x.lineTo(c.x,c.y+R);x.stroke();x.beginPath();x.arc(c.x,c.y,R*.6,0,Math.PI*2);x.stroke();}
}
function describeObj(o){const w=o.c.width*o.s,pct=Math.max(1,Math.round(w/P.W*100)),deg=Math.round(((o.r*180/Math.PI)%360+540)%360-180);
  return `${o.desc?o.desc:'the pasted object'} at the ${whereOf(o.x,o.y,P.W,P.H)} of the image, about ${pct}% of the image width${Math.abs(deg)>=3?`, turned ${deg}°`:''}`;}
function autoPrompt(){const L=[];P.changes.forEach(c=>L.push(`Recolour the ${c.where} surface I selected (about ${c.pct}% of the image) to ${c.name} (${c.hex}), keeping its real material texture, shading and reflections.`));
  P.objs.forEach(o=>L.push(`Add ${describeObj(o)}, sitting naturally in the scene with matching perspective, light and contact shadows.`));
  if(L.length)L.push('Make every change look real and keep everything else in the image as it is.');return L.join(' ');}
function refreshSide(){const ov=document.getElementById('sw21-play');if(!ov||!P)return;
  ov.querySelector('#sw21-undo').disabled=!P.undo.length;
  ov.querySelector('#sw21-selinfo').textContent=P.selCount?`Selected ${Math.max(1,Math.round(P.selCount/(P.W*P.H)*100))}% of the image. Pick a colour to recolour it.`:'Nothing selected yet. Tap a surface (or brush it).';
  const box=ov.querySelector('#sw21-objs');
  box.innerHTML=P.objs.map(o=>`<div class="sw21-obj ${o===P.active?'on':''}" data-obj="${o.id}"><button type="button" class="sw21-objpick" data-objpick="${o.id}" aria-label="Select ${esc(o.name)}"><img alt="" src="${o.c.toDataURL('image/png')}"></button><div><label>What is it exactly? <input data-objdesc="${o.id}" maxlength="120" placeholder="e.g. Golden State Warriors basketball goal" value="${esc(o.desc)}"></label>
    <label class="sw21-range">Size <input type="range" data-objsize="${o.id}" min="2" max="300" value="${Math.round(o.s*Math.max(o.c.width,o.c.height)/Math.min(P.W,P.H)*100)}"></label><label class="sw21-range">Turn <input type="range" data-objrot="${o.id}" min="-180" max="180" value="${Math.round(((o.r*180/Math.PI)%360+540)%360-180)}"></label>
    <button type="button" class="sw21-link" data-objdel="${o.id}">Remove</button></div></div>`).join('')||'<p class="sw21-note">No objects yet. Add one, drop an image on the picture or paste one.</p>';
  const byId=id=>P.objs.find(o=>o.id===id);let snap=null;
  box.querySelectorAll('[data-objpick]').forEach(b=>b.onclick=()=>{P.active=byId(b.dataset.objpick);render();refreshSide();});
  box.querySelectorAll('[data-objdesc]').forEach(i=>{i.oninput=()=>{byId(i.dataset.objdesc).desc=i.value.trim();updatePrompt();};});
  box.querySelectorAll('[data-objsize]').forEach(i=>{i.onpointerdown=i.onfocus=()=>{snap=snap||snapObjs();};i.oninput=()=>{const o=byId(i.dataset.objsize);o.s=+i.value/100*Math.min(P.W,P.H)/Math.max(o.c.width,o.c.height);P.active=o;render();updatePrompt();};i.onchange=()=>{if(snap){P.undo.push({kind:'obj',snap,nChanges:P.changes.length});snap=null;ov.querySelector('#sw21-undo').disabled=false;}};});
  box.querySelectorAll('[data-objrot]').forEach(i=>{i.onpointerdown=i.onfocus=()=>{snap=snap||snapObjs();};i.oninput=()=>{const o=byId(i.dataset.objrot);o.r=+i.value*Math.PI/180;P.active=o;render();updatePrompt();};i.onchange=()=>{if(snap){P.undo.push({kind:'obj',snap,nChanges:P.changes.length});snap=null;ov.querySelector('#sw21-undo').disabled=false;}};});
  box.querySelectorAll('[data-objdel]').forEach(b=>b.onclick=()=>{const s=snapObjs(),o=byId(b.dataset.objdel);P.objs=P.objs.filter(x=>x!==o);if(P.active===o)P.active=null;pushObjUndo(s,'Removed an object');});
  ov.querySelector('#sw21-changes').innerHTML=[...P.changes.map(c=>`<li><i style="background:${c.hex}"></i>${esc(c.where)} → ${esc(c.name)}</li>`),...P.objs.map(o=>`<li><i class="obj">◆</i>${esc(o.desc||o.name)}</li>`)].join('')||'<li class="none">No changes yet.</li>';
  updatePrompt();}
function updatePrompt(){const t=document.getElementById('sw21-prompt');if(!t||!P)return;if(!P.promptDirty||!t.value.trim()){t.value=autoPrompt();P.promptDirty=false;}}

/* --- keyboard and paste (only while Let’s Play is open) */
function onKey(e){if(!P||!document.getElementById('sw21-play'))return;const t=e.target,typing=/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)&&!(t.type==='range'||t.type==='checkbox');
  if(e.key==='Escape'){e.preventDefault();closePlay();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!typing){e.preventDefault();undo();return;}
  if(typing||t.id==='sw21-wheel'||t.type==='range')return;
  const o=P.active,stepPx=Math.max(P.W,P.H)*(e.shiftKey?.05:.01);
  if(/^Arrow/.test(e.key)&&(o||t.id==='sw21-cv')){e.preventDefault();const dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;
    if(o){if(!P.kmove){P.kmove=snapObjs();}o.x+=dx*stepPx;o.y+=dy*stepPx;}else{P.cursor.x=Math.max(0,Math.min(P.W-1,P.cursor.x+dx*stepPx));P.cursor.y=Math.max(0,Math.min(P.H-1,P.cursor.y+dy*stepPx));}render();return;}
  if(o&&(e.key==='+'||e.key==='='||e.key==='-'||e.key==='_')){e.preventDefault();if(!P.kmove)P.kmove=snapObjs();o.s*=(e.key==='+'||e.key==='=')?1.06:1/1.06;render();return;}
  if(o&&(e.key==='['||e.key===']')){e.preventDefault();if(!P.kmove)P.kmove=snapObjs();o.r+=(e.key===']'?5:-5)*Math.PI/180;render();return;}
  if(o&&(e.key==='Delete'||e.key==='Backspace')){e.preventDefault();const s=snapObjs();P.objs=P.objs.filter(x=>x!==o);P.active=null;pushObjUndo(s,'Removed an object');return;}
  if(t.id==='sw21-cv'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();if(o){P.active=null;render();refreshSide();return;}const hit=hitObj(P.cursor);if(hit){P.active=hit;render();refreshSide();}else floodSelect(P.cursor);}
}
document.addEventListener('keyup',()=>{if(P&&P.kmove){const s=P.kmove;P.kmove=null;pushObjUndo(s,'Moved an object');}});
function onPaste(e){if(!P)return;const f=[...(e.clipboardData?.items||[])].filter(i=>i.kind==='file'&&/^image\//.test(i.type)).map(i=>i.getAsFile()).find(Boolean);if(!f)return;e.preventDefault();e.stopPropagation();addObject(f);}

/* --- composite, mask and submit */
function buildComposite(){const{W,H}=P,c=canvas(W,H),x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,W,H);x.drawImage(P.work,0,0);drawObjs(x,P.objs);return c;}
/* OpenAI mask: same size as the image; transparent = change, opaque = keep. The changed pixels
   are grown a little so edges and object shadows can blend. */
function buildMask(){const{W,H}=P,ch=canvas(W,H),cx=ch.getContext('2d');cx.drawImage(P.chg,0,0);drawObjs(cx,P.objs);
  const dil=canvas(W,H),dx=dil.getContext('2d'),r=Math.max(4,Math.round(Math.max(W,H)*.012));dx.drawImage(ch,0,0);
  for(const rr of[r/2,r])for(let a=0;a<12;a++)dx.drawImage(ch,Math.cos(a*Math.PI/6)*rr,Math.sin(a*Math.PI/6)*rr);
  for(const o of P.objs){const h=o.c.height*o.s;dx.drawImage(ch,0,h*.06);} // room for a contact shadow under objects
  const m=canvas(W,H),mx=m.getContext('2d');mx.fillStyle='#000';mx.fillRect(0,0,W,H);mx.globalCompositeOperation='destination-out';mx.drawImage(dil,0,0);
  let n=0;const d=mx.getImageData(0,0,W,H).data;for(let i=3;i<d.length;i+=4)if(d[i]<128)n++;return{canvas:m,changed:n/(W*H)};}
const toBlob=(c,t,q)=>new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('Could not encode the image.')),t,q));
async function submitPlay(){if(!P||P.busy)return;const ov=document.getElementById('sw21-play');
  if(!P.changes.length&&!P.objs.length){A.c.toast('Make a play first: recolour something or drag in an object.',true);return;}
  if(A.isBusy()){A.c.toast('Another swap is starting. Try again in a moment.',true);return;}
  const prompt=(ov.querySelector('#sw21-prompt').value.trim()||autoPrompt()).slice(0,1900);
  P.busy=true;const btn=ov.querySelector('#sw21-submit');btn.disabled=true;btn.textContent='Sending your play…';
  try{const{c,uid,BUCKET,uuid}=A,id=uuid();
    const comp=await toBlob(buildComposite(),'image/jpeg',.92),mask=await toBlob(buildMask().canvas,'image/png');
    const playPath=`${uid}/swap/${id}-play.jpg`;let up=await c.client.storage.from(BUCKET).upload(playPath,comp,{contentType:'image/jpeg'});if(up.error)throw up.error;A.urls.set(playPath,URL.createObjectURL(comp));
    const objects=[];for(let i=0;i<P.objs.length;i++){const o=P.objs[i],rp=`${uid}/swap/${id}-ref${i+1}.png`;let ok=false;try{const b=await toBlob(o.c,'image/png');if(b.size<8*1024*1024){const u=await c.client.storage.from(BUCKET).upload(rp,b,{contentType:'image/png'});ok=!u.error;}}catch(_e){}objects.push({desc:o.desc,ref_path:ok?rp:null});}
    closePlay(true);
    await A.say('user',prompt,'Let’s Play');if(A.V.active.title==='New swap')await A.touch({title:'Let’s Play'});else await A.touch();A.refreshList();A.drawMessages();
    await A.generate(prompt,null,{swapType:'play',sourcePath:playPath,maskBlob:mask,noMask:true,options:{objects}});
  }catch(e){A.c.toast('Your play was not sent: '+(e.message||e),true);if(P){P.busy=false;btn.disabled=false;btn.textContent='Submit to the real game · 100 credits';}}}

window.DrawUpSwap21={mount,beforeSend,openPlay,get mode(){return mode;},setMode(m){if(MODES.some(x=>x.id===m)){mode=m;store.set('drawup_swap21_mode',m);if(A)mount(A);}},
  get play(){return P;},_mask:()=>P&&buildMask(),_composite:()=>P&&buildComposite(),colorName};
// if the Swap tab is already on screen (script loaded late), mount now
})();
