/* DrawUp Swap V20 — Swap as a thread, like Arch Coach.
 *
 * Overrides the Portal 'swap' tab. A thread starts from an image (upload, drag-drop, or paste
 * with Ctrl/Cmd+V). Each request is a message; each result lands as a before/after card with
 * Download (a real file, never a storage link) and Preview. Follow-ups edit the latest result,
 * or any earlier image picked with "Edit from this". When a request names a material or colour
 * but not where, DrawUp asks where first (free). "Mark area" lets the member brush the part to
 * change; it is sent as a mask the size of the image. Generation runs under the basketball-court
 * portal with a 2:00 shot clock: at 0:00 the page stops waiting, the server cancels the job and
 * refunds it once. Threads and messages live in swap_threads / swap_messages (RLS: own rows).
 */
(()=>{'use strict';
const BUCKET='drawup-private',COST=100;
const T={limitMs:120000,pollMs:2000}; // window.DrawUpSwap20 exposes these for tests
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const uuid=()=>(crypto.randomUUID&&crypto.randomUUID())||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,ch=>{const r=Math.random()*16|0;return(ch==='x'?r:(r&3|8)).toString(16);});
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const mmss=s=>{s=Math.max(0,Math.ceil(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
const fmtWhen=d=>d?new Date(d).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';

/* ------------------------------------------------------------------ files */
const urls=new Map();
async function blobOf(c,path){const {data,error}=await c.client.storage.from(BUCKET).download(path);if(error)throw error;return data;}
async function imgUrl(c,path){if(!path)return'';if(urls.has(path))return urls.get(path);try{const u=URL.createObjectURL(await blobOf(c,path));urls.set(path,u);return u;}catch(_e){return'';}}
function saveFile(name,blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},800);}
function fileName(g){const d=new Date(g.completed_at||g.created_at||Date.now());const p=n=>String(n).padStart(2,'0');return `DrawUp-Swap-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${(String(g.result_path||'').split('.').pop()||'png').replace('jpeg','jpg')}`;}
async function download(c,g){try{const b=await blobOf(c,g.result_path);saveFile(fileName(g),b);c.toast('Saved '+fileName(g)+' to your device.');}catch(e){c.toast('Download failed: '+(e.message||e),true);}}
/* Re-encode every new image (applies phone rotation, caps size at 2048 px) so the mask the
   member brushes always matches the stored image pixel for pixel. */
async function normalize(file){
  let bmp;try{bmp=await createImageBitmap(file,{imageOrientation:'from-image'});}catch(_e){bmp=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('That file is not an image this browser can read.'));i.src=URL.createObjectURL(file);});}
  const w0=bmp.width,h0=bmp.height,k=Math.min(1,2048/Math.max(w0,h0)),w=Math.round(w0*k),h=Math.round(h0*k);
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(bmp,0,0,w,h);
  const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',.92));if(!blob)throw new Error('Could not read that image.');
  return {blob,w,h};
}
function lightbox(c,g,src,before){document.getElementById('du-swap-lightbox')?.remove();document.body.insertAdjacentHTML('beforeend',`<div id="du-swap-lightbox" class="du-swap-lightbox" role="dialog" aria-label="Swap preview"><div class="du-swap-lb-bar"><b>DrawUp Swap</b><span>${esc(g.prompt||'')}</span>${before?'<button type="button" class="du-btn ghost" data-lb-compare>Show before</button>':''}<button type="button" class="du-btn primary" data-lb-dl>Download</button><button type="button" class="du-btn ghost" data-lb-x>Close</button></div><div class="du-swap-lb-stage"><img src="${esc(src)}" alt="Swap result"></div></div>`);
  const lb=document.getElementById('du-swap-lightbox'),img=lb.querySelector('img');const close=()=>{lb.remove();document.removeEventListener('keydown',k);};function k(e){if(e.key==='Escape')close();}
  lb.querySelector('[data-lb-x]').onclick=close;lb.onclick=e=>{if(e.target===lb||e.target.classList.contains('du-swap-lb-stage'))close();};lb.querySelector('[data-lb-dl]').onclick=()=>download(c,g);
  const cmp=lb.querySelector('[data-lb-compare]');if(cmp)cmp.onclick=()=>{const b=img.src===before;img.src=b?src:before;cmp.textContent=b?'Show before':'Show after';};document.addEventListener('keydown',k);}

/* ------------------------------------------------------------------ where-question heuristic */
const MATERIAL=/\b(concrete|wood|wooden|oak|walnut|maple|cedar|bamboo|timber|marble|granite|quartz|quartzite|terrazzo|tiles?|brick|stone|limestone|slate|travertine|porcelain|ceramic|metal|steel|copper|zinc|aluminium|aluminum|brass|bronze|stucco|plaster|cladding|carpet|vinyl|laminate|paint|painted|wallpaper|epoxy|polished|matte|glossy|brushed|herringbone|chevron|gr[ae]y|white|black|beige|cream|ivory|navy|blue|green|sage|red|terracotta|brown|tan|charcoal|gold|pink|yellow|orange|purple|teal)\b/i;
const WHERE=/\b(floors?|flooring|walls?|ceilings?|counters?|countertops?|cabinets?|cabinetry|island|backsplash|roofs?|roofing|facade|façade|exterior|siding|doors?|windows?|frames?|trim|stairs?|staircase|railings?|columns?|beams?|rugs?|sofa|couch|chairs?|stools?|tables?|beds?|curtains?|drapes|lamps?|fixtures?|lights?|pendants?|tub|shower|vanity|sinks?|fireplace|mantel|deck|patio|driveway|sidewalk|paths?|fence|garage|soffits?|fascia|gutters?|canopy|awning|storefront|panels?|lawn|grass|trees?|sky|pool|planters?|everything|whole|entire|marked|here)\b/i;
const needsWhere=t=>MATERIAL.test(t)&&!WHERE.test(t);
const AREAS=['Floor','Walls','Ceiling','Countertops','Cabinets','Exterior facade','Roof'];
function inferType(t){if(/\b(night|dusk|dawn|sunset|sunrise|evening|morning|daylight|lighting|lit|golden hour|overcast|snow|rain)\b/i.test(t))return'lighting';if(/\b(landscap\w*|lawn|grass|trees?|plants?|planting|garden|shrubs?|hardscape|paving)\b/i.test(t))return'landscape';if(/\b(sofa|couch|rug|chairs?|furniture|kitchen|bathroom|bedroom|living room|cabinets?|countertops?|vanity|backsplash)\b/i.test(t))return'interior';if(!/\b(concrete|wood|oak|marble|granite|quartz|tile|brick|stone|metal|steel|stucco|siding|cladding|carpet|plaster|glass)\b/i.test(t)&&MATERIAL.test(t))return'color';return'material';}

/* ------------------------------------------------------------------ the court portal (2:00 shot clock) */
function court(c,{prompt,area,before,onStop,t0:start}){document.getElementById('du-swap-court')?.remove();
  const lim=T.limitMs/1000;
  document.body.insertAdjacentHTML('beforeend',`<div id="du-swap-court" class="du-swap-court sw20-court"><div class="du-court-floor"><i class="du-court-line l1"></i><i class="du-court-line l2"></i><i class="du-court-circle"></i><i class="du-court-key k1"></i><i class="du-court-key k2"></i></div><div class="du-court-ball"></div><div class="du-court-card"><span class="du-kicker">DRAWUP SWAP · IN PLAY</span><div class="du-shotclock"><span class="du-shotclock-label">SHOT CLOCK</span><b id="du-shotclock">${mmss(lim-(start?(Date.now()-start)/1000:0))}</b></div><h2 id="du-court-status">Bringing your image onto the court…</h2>${before?`<div class="sw20-holo"><img src="${esc(before)}" alt=""><i></i></div>`:''}<p class="sw20-court-req">“${esc(prompt||'')}”${area?` <em class="sw20-chip">📍 ${esc(area)}</em>`:''}</p><div class="du-court-result" id="du-court-result"></div><div class="du-court-actions" id="du-court-actions"><button type="button" class="du-btn ghost" id="du-court-hide">Keep working — I’ll check back</button><button type="button" class="du-btn ghost" id="du-court-stop">Stop &amp; refund</button></div></div></div>`);
  const el=document.getElementById('du-swap-court'),clock=document.getElementById('du-shotclock'),status=document.getElementById('du-court-status');const t0=start||Date.now();
  const msgs=['Reading the building, camera and light…','Finding the surfaces you named…','Matching the new material to the light…','Rendering the swap…','Checking edges and reflections…','Final touches…'];
  const timer=setInterval(()=>{const s=(Date.now()-t0)/1000,left=lim-s;clock.textContent=mmss(left);el.classList.toggle('du-clock-late',left<=15);status.textContent=left>0?msgs[Math.min(msgs.length-1,Math.floor(s/(lim/msgs.length)))]:'Shot clock — stopping…';},250);
  const close=()=>{clearInterval(timer);el.remove();};document.getElementById('du-court-hide').onclick=close;document.getElementById('du-court-stop').onclick=()=>{document.getElementById('du-court-stop').disabled=true;onStop&&onStop();};
  return {el,close,done(html,ok,msg){clearInterval(timer);el.classList.add(ok?'du-court-made':'du-court-miss');clock.textContent=ok?'✓':'✕';status.textContent=msg||(ok?'Bucket. Your swap is ready.':'No good — the generation failed.');document.getElementById('du-court-result').innerHTML=html;document.getElementById('du-court-stop')?.remove();const h=document.getElementById('du-court-hide');h.textContent='Close';}};
}

/* ------------------------------------------------------------------ the brush (mark area) */
function brush(c,src,onApply){document.getElementById('sw20-brush')?.remove();
  document.body.insertAdjacentHTML('beforeend',`<div id="sw20-brush" class="sw20-brush" role="dialog" aria-label="Mark the area to change"><div class="sw20-brush-bar"><b>Mark the area to change</b><span>Click or brush over the part of the image to swap.</span><div class="sw20-brush-tools"><button type="button" class="du-btn ghost on" data-mode="paint">Brush</button><button type="button" class="du-btn ghost" data-mode="erase">Erase</button><label>Size <input type="range" min="1" max="15" value="5" id="sw20-size"></label><button type="button" class="du-btn ghost" id="sw20-clear">Clear</button><button type="button" class="du-btn ghost" id="sw20-bx">Cancel</button><button type="button" class="du-btn primary" id="sw20-use">Use this area</button></div></div><div class="sw20-brush-stage"><div class="sw20-brush-frame"><img alt="Image to mark"><canvas></canvas></div></div></div>`);
  const ov=document.getElementById('sw20-brush'),img=ov.querySelector('img'),cv=ov.querySelector('canvas');let mode='paint',down=false,last=null;
  const close=()=>{ov.remove();document.removeEventListener('keydown',k);};function k(e){if(e.key==='Escape')close();}document.addEventListener('keydown',k);
  img.onload=()=>{cv.width=img.naturalWidth;cv.height=img.naturalHeight;};img.src=src;
  const ctx=()=>cv.getContext('2d');
  const pt=e=>{const r=cv.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*cv.width,y:(e.clientY-r.top)/r.height*cv.height};};
  const rad=()=>Math.max(cv.width,cv.height)*(+ov.querySelector('#sw20-size').value)/100;
  const stroke=(a,b)=>{const x=ctx();x.globalCompositeOperation=mode==='erase'?'destination-out':'source-over';x.strokeStyle=x.fillStyle='rgb(255,59,31)';x.lineCap='round';x.lineWidth=rad()*2;x.beginPath();x.moveTo(a.x,a.y);x.lineTo(b.x,b.y);x.stroke();x.beginPath();x.arc(b.x,b.y,rad(),0,Math.PI*2);x.fill();};
  cv.addEventListener('pointerdown',e=>{if(!cv.width)return;e.preventDefault();down=true;cv.setPointerCapture(e.pointerId);last=pt(e);stroke(last,last);});
  cv.addEventListener('pointermove',e=>{if(!down)return;const p=pt(e);stroke(last,p);last=p;});
  const up=()=>{down=false;};cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  ov.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;ov.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('on',x===b));});
  ov.querySelector('#sw20-clear').onclick=()=>ctx().clearRect(0,0,cv.width,cv.height);ov.querySelector('#sw20-bx').onclick=close;
  ov.querySelector('#sw20-use').onclick=async()=>{const w=cv.width,h=cv.height;if(!w){close();return;}
    const d=ctx().getImageData(0,0,w,h).data;let n=0;for(let i=3;i<d.length;i+=16)if(d[i])n++;if(!n){c.toast('Brush over the part of the image you want to change first.',true);return;}
    // OpenAI mask: same size as the image; transparent pixels = the area to edit, opaque = keep.
    const m=document.createElement('canvas');m.width=w;m.height=h;const mx=m.getContext('2d');mx.fillStyle='#000';mx.fillRect(0,0,w,h);mx.globalCompositeOperation='destination-out';mx.drawImage(cv,0,0);
    const blob=await new Promise(r=>m.toBlob(r,'image/png'));const p=document.createElement('canvas');const s=Math.min(1,240/Math.max(w,h));p.width=Math.round(w*s);p.height=Math.round(h*s);const px=p.getContext('2d');px.drawImage(img,0,0,p.width,p.height);px.globalAlpha=.6;px.drawImage(cv,0,0,p.width,p.height);
    close();onApply({blob,w,h,preview:p.toDataURL('image/jpeg',.8)});};
}

/* ------------------------------------------------------------------ watching generations (module level, so the 2:00 stop runs even after leaving the tab) */
const watching=new Map(); // gen id -> {t0, court}
let view=null; // the mounted thread view (or null)
async function api(c,path,opts){const token=await c.token();const r=await fetch(path,{...(opts||{}),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token}});const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.error||('Request failed ('+r.status+')'));e.data=d;throw e;}return d;}
function onGen(g){if(view&&view.gens){view.gens.set(g.id,g);if(view.root.isConnected)view.drawMessages();}}
async function stopGen(c,id,reason){try{const d=await api(c,'/api/swap',{method:'POST',body:JSON.stringify({generation_id:id,action:'stop',reason})});if(d.generation)onGen(d.generation);return d.generation;}catch(e){c.toast(e.message,true);return null;}}
async function watch(c,g,crt,localStart){
  if(watching.has(g.id)){if(crt)watching.get(g.id).court=crt;return;}
  const t0=Math.min(localStart||Infinity,g.started_at?new Date(g.started_at).getTime():Date.now());const st={t0,court:crt||null};watching.set(g.id,st);
  let cur=g;
  try{
    while(cur.status==='generating'||cur.status==='queued'){
      await sleep(T.pollMs);
      if(Date.now()-st.t0>=T.limitMs){cur=(await stopGen(c,cur.id,'timeout'))||cur;if(cur.status==='generating'||cur.status==='queued')cur={...cur,status:'failed',error:'Shot clock ran out: DrawUp stopped this generation at 2:00. Your credits were refunded.'};break;}
      try{const d=await api(c,'/api/swap?id='+cur.id);if(d.generation){cur=d.generation;if(cur.status!=='generating')onGen(cur);}}catch(e){console.warn('swap poll',e);}
    }
  }finally{watching.delete(g.id);}
  onGen(cur);document.dispatchEvent(new Event('du-credits'));
  const k=st.court;if(k&&k.el.isConnected){
    if(cur.status==='complete'){const res=await imgUrl(c,cur.result_path),before=await imgUrl(c,cur.source_path);k.done(`<button type="button" class="du-swap-open" id="du-court-open"><img src="${esc(res)}" alt="Swap result"><span>Open full screen ⤢</span></button><div class="du-court-actions"><button type="button" class="du-btn primary" id="du-court-dl">Download</button></div>`,true);document.getElementById('du-court-dl').onclick=()=>download(c,cur);document.getElementById('du-court-open').onclick=()=>lightbox(c,cur,res,before);}
    else{const timeUp=/shot clock/i.test(cur.error||'');k.done(`<p>${esc(cur.error||'Generation failed.')}</p>`,false,timeUp?'Shot clock violation — stopped at 2:00.':'No good — the generation failed.');}
  }
}

/* ------------------------------------------------------------------ the tab */
async function render(w,c){
  const uid=c.user.id;
  const [{data:threads,error},{count:legacyCount}]=await Promise.all([
    c.client.from('swap_threads').select('*').eq('owner_id',uid).order('updated_at',{ascending:false}).limit(60),
    c.client.from('swap_generations').select('id',{count:'exact',head:true}).eq('owner_id',uid).is('thread_id',null),
  ]);
  if(error)throw error;
  let wanted=null;try{wanted=localStorage.getItem('drawup_swap20_thread');}catch(_e){}
  const V={root:null,threads:threads||[],active:null,msgs:[],gens:new Map(),base:null,mask:null,pendingAsk:null,busy:false,legacy:false,legacyCount:legacyCount||0};
  V.active=V.threads.find(t=>t.id===wanted)||null;
  view=V;

  const load=async()=>{V.msgs=[];V.gens=new Map();V.base=null;V.mask=null;V.pendingAsk=null;if(!V.active)return;
    const [m,g]=await Promise.all([c.client.from('swap_messages').select('*').eq('thread_id',V.active.id).order('created_at'),c.client.from('swap_generations').select('*').eq('thread_id',V.active.id).order('created_at')]);
    if(m.error)throw m.error;if(g.error)throw g.error;V.msgs=m.data||[];(g.data||[]).forEach(x=>V.gens.set(x.id,x));
    const last=V.msgs[V.msgs.length-1];if(last&&last.role==='assistant'&&!last.generation_id&&/^Where should/.test(last.body||'')){const u=[...V.msgs].reverse().find(x=>x.role==='user'&&x.body);if(u)V.pendingAsk={text:u.body};}
    for(const x of V.gens.values())if(x.status==='generating')watch(c,x);};
  const latestBase=()=>{let p=V.active?.source_path||null;for(const m of V.msgs){if(m.image_path)p=m.image_path;const g=m.generation_id&&V.gens.get(m.generation_id);if(g&&g.status==='complete'&&g.result_path)p=g.result_path;}return p;};
  const base=()=>V.base||latestBase();
  const hydrate=root=>root.querySelectorAll('img[data-path]').forEach(async i=>{const u=await imgUrl(c,i.dataset.path);if(u)i.src=u;});

  const genCard=g=>{if(!g)return'<div class="sw20-gen"><p class="du-muted">This result was removed.</p></div>';
    const after=g.status==='complete'&&g.result_path?`<button type="button" class="du-swap-open" data-open="${g.id}" title="Open preview"><img data-path="${esc(g.result_path)}" alt="After"><span>Preview ⤢</span></button>`
      :`<div class="sw20-wait ${g.status}">${g.status==='failed'?'NO GOOD':g.status==='queued'?'NOT STARTED':`<i class="du-mini-ball"></i>IN PLAY <b data-clock="${g.id}">${mmss(T.limitMs/1000)}</b>`}</div>`;
    return `<div class="sw20-gen" data-gen="${g.id}"><div class="sw20-pair"><figure><img data-path="${esc(g.source_path)}" alt="Before"><figcaption>Before</figcaption></figure><figure>${after}<figcaption>After</figcaption></figure></div>
      ${g.status==='failed'?`<p class="sw20-err">${esc(g.error||'Generation failed.')}</p>`:''}
      <div class="sw20-gen-foot"><small>${esc(fmtWhen(g.completed_at||g.created_at))}${g.area?' · 📍 '+esc(g.area):''}${g.mask_path&&g.area!=='Marked area'?' · marked area':''}${g.credits_charged&&g.status!=='failed'?' · '+g.credits_charged+' credits':''}</small>
      ${g.status==='complete'?`<span><button type="button" class="du-btn primary" data-dl="${g.id}">Download</button><button type="button" class="du-btn ghost" data-open="${g.id}">Preview</button><button type="button" class="du-btn ghost" data-base="${esc(g.result_path)}">Edit from this</button></span>`:g.status==='generating'?`<span><button type="button" class="du-btn ghost" data-watch="${g.id}">Watch</button><button type="button" class="du-btn ghost" data-stop="${g.id}">Stop &amp; refund</button></span>`:''}</div></div>`;};
  const msgHtml=(m,i)=>{
    if(m.role==='user'&&m.image_path)return `<article class="sw20-msg user img"><span>YOU</span><figure><img data-path="${esc(m.image_path)}" alt="Image you added"></figure><small>Image added · <button type="button" class="sw20-link" data-base="${esc(m.image_path)}">Edit this one</button></small></article>`;
    if(m.role==='user')return `<article class="sw20-msg user"><span>YOU</span><p>${esc(m.body)}</p>${m.area?`<em class="sw20-chip">📍 ${esc(m.area)}</em>`:''}</article>`;
    if(m.generation_id)return `<article class="sw20-msg bot gen"><span>DRAWUP SWAP</span>${genCard(V.gens.get(m.generation_id))}</article>`;
    const asking=V.pendingAsk&&i===V.msgs.length-1;
    return `<article class="sw20-msg bot"><span>DRAWUP SWAP</span><p>${esc(m.body)}</p>${asking?`<div class="sw20-chips">${AREAS.map(a=>`<button type="button" data-area="${esc(a)}">${esc(a)}</button>`).join('')}<button type="button" data-area-other>Other…</button><button type="button" class="mark" data-area-mark>✎ Mark it on the image</button></div><small class="du-muted">Free — no credits are used until you pick.</small>`:''}</article>`;};

  const draw=()=>{
    const t=V.active,threadBtn=x=>`<button type="button" data-thread="${x.id}" class="${t&&x.id===t.id?'active':''}"><img data-path="${esc(x.source_path)}" alt=""><span><b>${esc(x.title||'New swap')}</b><small>${esc(fmtWhen(x.updated_at))}</small></span></button>`;
    w.innerHTML=`<div class="sw20" id="sw20"><aside class="sw20-threads"><button type="button" class="du-btn primary" id="sw20-new">＋ New swap</button><div class="sw20-list">${V.threads.map(threadBtn).join('')}${V.legacyCount?`<button type="button" data-legacy class="${V.legacy?'active':''}"><i>⟲</i><span><b>Earlier swaps</b><small>${V.legacyCount} from before threads</small></span></button>`:''}</div></aside>
      <section class="sw20-main"><div class="du-work-head sw20-head"><div><span class="du-kicker">DRAWUP SWAP</span><h1>${V.legacy?'Earlier swaps':esc(t?.title||'Start a swap')}</h1><p>Saved to your account · ${COST} credits per image · refunded automatically if it fails or the 2:00 shot clock runs out.</p></div>${t?'<button type="button" class="du-btn ghost" id="sw20-del">Delete thread</button>':''}</div>
      <div class="sw20-msgs" id="sw20-msgs"></div>
      ${V.legacy?'':`<div class="sw20-compose" id="sw20-compose"><div class="sw20-basebar" id="sw20-basebar"></div><form id="sw20-form"><label class="sw20-attach" title="Upload an image"><span aria-hidden="true">＋</span><span class="sr">Upload image</span><input type="file" id="sw20-file" accept="image/jpeg,image/png,image/webp" hidden></label><textarea id="sw20-input" rows="2" placeholder="${t?'Describe the change… e.g. make the floor grey polished concrete':'Paste (Ctrl/Cmd+V), drop or upload an image to start'}"></textarea><button class="du-btn primary" id="sw20-send">Send</button></form><small class="du-muted">Enter sends · Shift+Enter new line · paste or drop an image any time to add it to this thread</small></div>`}</section></div>`;
    V.root=w.querySelector('#sw20');hydrate(w.querySelector('.sw20-threads'));
    w.querySelector('#sw20-new').onclick=()=>{V.active=null;V.legacy=false;remember(null);load().then(draw);};
    w.querySelectorAll('[data-thread]').forEach(b=>b.onclick=async()=>{V.active=V.threads.find(x=>x.id===b.dataset.thread);V.legacy=false;remember(V.active.id);await load();draw();});
    w.querySelector('[data-legacy]')?.addEventListener('click',()=>{V.active=null;V.legacy=true;draw();});
    w.querySelector('#sw20-del')?.addEventListener('click',async()=>{if(!confirm('Delete this swap thread and its messages? Generated images stay in Earlier swaps.'))return;const r=await c.client.from('swap_threads').delete().eq('id',t.id).eq('owner_id',uid);if(r.error){c.toast(r.error.message,true);return;}V.threads=V.threads.filter(x=>x.id!==t.id);V.legacyCount+=[...V.gens.values()].length;V.active=null;remember(null);await load();draw();});
    if(V.legacy){drawLegacy();return;}
    const form=w.querySelector('#sw20-form'),input=w.querySelector('#sw20-input');
    form.onsubmit=e=>{e.preventDefault();const v=input.value;if(!v.trim())return;send(v);};
    input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}};
    w.querySelector('#sw20-file').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)addImage(f);};
    const root=V.root;root.addEventListener('dragover',e=>{if([...(e.dataTransfer?.items||[])].some(i=>i.kind==='file')){e.preventDefault();root.classList.add('drop');}});
    root.addEventListener('dragleave',e=>{if(e.target===root||!root.contains(e.relatedTarget))root.classList.remove('drop');});
    root.addEventListener('drop',e=>{root.classList.remove('drop');const f=[...(e.dataTransfer?.files||[])].find(x=>/^image\//.test(x.type));if(f){e.preventDefault();addImage(f);}});
    drawMessages();
  };
  const remember=id=>{try{id?localStorage.setItem('drawup_swap20_thread',id):localStorage.removeItem('drawup_swap20_thread');}catch(_e){}};
  V.drawMessages=()=>drawMessages();
  const drawMessages=()=>{const box=w.querySelector('#sw20-msgs');if(!box||V.legacy)return;
    if(!V.active){box.innerHTML=`<label class="sw20-drop" for="sw20-file"><b>Drop, paste or upload an image</b><span>Copy a photo or render and press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>V</kbd> here, drag it in, or tap to upload (JPG, PNG or WebP).</span><span>Then tell DrawUp what to swap — “grey polished concrete floor”, “make the rug darker”. Keep commenting to refine it.</span></label>`;drawBase();return;}
    box.innerHTML=V.msgs.map(msgHtml).join('')||'<p class="du-muted">Say what to change.</p>';hydrate(box);
    box.querySelectorAll('[data-dl]').forEach(b=>b.onclick=()=>download(c,V.gens.get(b.dataset.dl)));
    box.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{const g=V.gens.get(b.dataset.open);lightbox(c,g,await imgUrl(c,g.result_path),await imgUrl(c,g.source_path));});
    box.querySelectorAll('[data-base]').forEach(b=>b.onclick=()=>{V.base=b.dataset.base;V.mask=null;drawBase();w.querySelector('#sw20-input')?.focus();c.toast('Next change will edit this image.');});
    box.querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>{b.disabled=true;stopGen(c,b.dataset.stop,'user');});
    box.querySelectorAll('[data-watch]').forEach(b=>b.onclick=async()=>{const g=V.gens.get(b.dataset.watch);const st=watching.get(g.id);const t0=st?.t0||(g.started_at?new Date(g.started_at).getTime():Date.now());const k=court(c,{prompt:g.prompt,area:g.area,t0,before:await imgUrl(c,g.source_path),onStop:()=>stopGen(c,g.id,'user')});if(st)st.court=k;else watch(c,g,k);});
    box.querySelectorAll('[data-area]').forEach(b=>b.onclick=()=>answerWhere(b.dataset.area));
    box.querySelector('[data-area-other]')?.addEventListener('click',()=>{const i=w.querySelector('#sw20-input');i.placeholder='Where? e.g. the kitchen island, the back wall';i.focus();});
    box.querySelector('[data-area-mark]')?.addEventListener('click',()=>openMark(()=>answerWhere('Marked area')));
    const bottom=()=>{box.scrollTop=box.scrollHeight;};bottom();box.querySelectorAll('img').forEach(i=>i.addEventListener('load',bottom,{once:true}));drawBase();};
  const drawBase=()=>{const bar=w.querySelector('#sw20-basebar');if(!bar)return;const p=V.active&&base();
    if(!p){bar.innerHTML='';return;}const isLatest=!V.base||V.base===latestBase();
    bar.innerHTML=`<img data-path="${esc(p)}" alt=""><span>Editing <b>${isLatest?'the latest image':'an earlier image'}</b>${isLatest?'':' · <button type="button" class="sw20-link" id="sw20-latest">use latest</button>'}</span><button type="button" class="du-btn ghost" id="sw20-mark">${V.mask?'✎ Re-mark area':'✎ Mark area'}</button>${V.mask?`<em class="sw20-chip mask"><img src="${V.mask.preview}" alt="">Marked area <button type="button" id="sw20-unmark" aria-label="Clear marked area">×</button></em>`:''}`;
    hydrate(bar);bar.querySelector('#sw20-mark').onclick=()=>openMark();bar.querySelector('#sw20-unmark')?.addEventListener('click',()=>{V.mask=null;drawBase();});bar.querySelector('#sw20-latest')?.addEventListener('click',()=>{V.base=null;V.mask=null;drawBase();});};
  const openMark=async after=>{const p=base();if(!p)return;const src=await imgUrl(c,p);if(!src){c.toast('That image could not be opened.',true);return;}brush(c,src,m=>{V.mask={...m,path:p};drawBase();if(after)after();else w.querySelector('#sw20-input')?.focus();});};

  const drawLegacy=async()=>{const box=w.querySelector('#sw20-msgs');const {data}=await c.client.from('swap_generations').select('*').eq('owner_id',uid).is('thread_id',null).order('created_at',{ascending:false}).limit(40);
    (data||[]).forEach(g=>V.gens.set(g.id,g));box.innerHTML=(data||[]).map(g=>`<article class="sw20-msg bot gen"><span>${esc(g.prompt)}</span>${genCard(g)}${g.status==='complete'?`<p><button type="button" class="du-btn ghost" data-from="${g.id}">Start a thread from this</button></p>`:''}</article>`).join('')||'<p class="du-muted">No earlier swaps.</p>';hydrate(box);
    box.querySelectorAll('[data-dl]').forEach(b=>b.onclick=()=>download(c,V.gens.get(b.dataset.dl)));
    box.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{const g=V.gens.get(b.dataset.open);lightbox(c,g,await imgUrl(c,g.result_path),await imgUrl(c,g.source_path));});
    box.querySelectorAll('[data-from],[data-base]').forEach(b=>b.onclick=async()=>{const g=V.gens.get(b.dataset.from)||[...V.gens.values()].find(x=>x.result_path===b.dataset.base);try{await newThread(g.result_path,g.prompt);V.legacy=false;draw();}catch(e){c.toast(e.message||String(e),true);}});};

  const newThread=async(path,title)=>{const r=await c.client.from('swap_threads').insert({owner_id:uid,source_path:path,title:(title||'New swap').slice(0,60)}).select('*').single();if(r.error)throw r.error;
    const m=await c.client.from('swap_messages').insert({thread_id:r.data.id,owner_id:uid,role:'user',image_path:path}).select('*').single();if(m.error)throw m.error;
    V.threads.unshift(r.data);V.active=r.data;remember(r.data.id);await load();};
  const touch=async fields=>{const r=await c.client.from('swap_threads').update({updated_at:new Date().toISOString(),...(fields||{})}).eq('id',V.active.id).select('*').single();if(!r.error){Object.assign(V.active,r.data);}};

  /* an image from upload, drop or paste: starts a thread, or joins the open one as the new base */
  const addImage=async file=>{if(V.busy)return;if(!/^image\/(jpeg|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.type||'')){c.toast('Use a JPG, PNG or WebP image.',true);return;}if(file.size>25*1024*1024){c.toast('That image is larger than 25 MB.',true);return;}
    V.busy=true;c.toast('Adding your image…');
    try{const n=await normalize(file);const id=uuid(),path=`${uid}/swap/${id}-source.jpg`;const up=await c.client.storage.from(BUCKET).upload(path,n.blob,{contentType:'image/jpeg'});if(up.error)throw up.error;
      urls.set(path,URL.createObjectURL(n.blob));
      if(!V.active){V.legacy=false;await newThread(path,'New swap');draw();}
      else{const m=await c.client.from('swap_messages').insert({thread_id:V.active.id,owner_id:uid,role:'user',image_path:path}).select('*').single();if(m.error)throw m.error;V.msgs.push(m.data);V.base=null;V.mask=null;V.pendingAsk=null;await touch();drawMessages();}
      w.querySelector('#sw20-input')?.focus();
    }catch(e){c.toast('Could not add the image: '+(e.message||e),true);}finally{V.busy=false;}};

  const say=async(role,body,area)=>{const r=await c.client.from('swap_messages').insert({thread_id:V.active.id,owner_id:uid,role,body,area:area||null}).select('*').single();if(r.error)throw r.error;V.msgs.push(r.data);return r.data;};
  const send=async text=>{text=text.trim();const input=w.querySelector('#sw20-input');
    if(!V.active){c.toast('Add an image first: paste, drop or upload one.',true);return;}
    if(V.busy)return;if(text.length<2){c.toast('Say what to change.',true);return;}
    V.busy=true;input.value='';input.placeholder='Describe the change… e.g. make the rug darker';
    try{
      if(V.pendingAsk&&text.length<=60&&!/\b(make|change|replace|swap|add|remove|turn)\b/i.test(text)){const ask=V.pendingAsk;V.pendingAsk=null;await say('user',text,text);drawMessages();V.busy=false;await generate(ask.text,text);return;}
      V.pendingAsk=null;await say('user',text,V.mask?'Marked area':null);
      if(V.active.title==='New swap')await touch({title:text.slice(0,60)});else await touch();refreshList();
      if(!V.mask&&needsWhere(text)){V.pendingAsk={text};await say('assistant',`Where should this go — “${text.slice(0,80)}”? Pick a spot, or mark it on the image.`);drawMessages();refreshList();return;}
      drawMessages();V.busy=false;await generate(text,V.mask?'Marked area':null);
    }catch(e){c.toast(e.message||String(e),true);}finally{V.busy=false;}};
  const answerWhere=async area=>{if(!V.pendingAsk||V.busy)return;const ask=V.pendingAsk;V.pendingAsk=null;
    try{await say('user',area==='Marked area'?'Here (marked on the image)':area,area);drawMessages();await generate(ask.text,area);}catch(e){c.toast(e.message||String(e),true);}};
  const refreshList=()=>{const list=w.querySelector('.sw20-list');if(!list)return;V.threads.sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));const act=list.querySelector('[data-thread].active b');if(act)act.textContent=V.active.title;const h=w.querySelector('.sw20-head h1');if(h)h.textContent=V.active.title;};

  const generate=async(text,area)=>{if(V.busy)return;V.busy=true;const sendBtn=w.querySelector('#sw20-send');if(sendBtn)sendBtn.disabled=true;
    let k=null;
    try{
      const src=base(),id=uuid();let maskPath=null;const mask=V.mask&&V.mask.path===src?V.mask:null;
      if(mask){maskPath=`${uid}/swap/${id}-mask.png`;const up=await c.client.storage.from(BUCKET).upload(maskPath,mask.blob,{contentType:'image/png'});if(up.error)throw up.error;}
      const ins=await c.client.from('swap_generations').insert({id,owner_id:uid,source_path:src,swap_type:inferType(text+' '+(area||'')),prompt:text.slice(0,2000),thread_id:V.active.id,area:area||(mask?'Marked area':null),mask_path:maskPath}).select('*').single();if(ins.error)throw ins.error;
      V.gens.set(id,ins.data);
      const gm=await c.client.from('swap_messages').insert({thread_id:V.active.id,owner_id:uid,role:'assistant',body:'',generation_id:id}).select('*').single();if(gm.error)throw gm.error;V.msgs.push(gm.data);
      V.mask=null;V.base=null;await touch();drawMessages();
      const t0=Date.now();k=court(c,{prompt:text,area:area||(mask?'Marked area':''),t0,before:await imgUrl(c,src),onStop:()=>stopGen(c,id,'user')});
      let d;try{d=await api(c,'/api/swap',{method:'POST',body:JSON.stringify({generation_id:id})});}
      catch(e){if(e.data?.generation)onGen(e.data.generation);k.done(`<p>${esc(e.message)}</p>`,false,e.data?.code==='INSUFFICIENT_CREDITS'?'Not enough credits for this one.':'No good — it did not start.');k=null;
        const r=await c.client.from('swap_generations').select('*').eq('id',id).single();if(r.data?.status==='queued')await stopGen(c,id,'not-started');else if(r.data)onGen(r.data);return;}
      const g=d.generation||ins.data;onGen(g);document.dispatchEvent(new Event('du-credits'));
      if(g.status==='generating'||g.status==='queued')watch(c,g,k,t0);else if(k){k.done(`<p>${esc(g.error||'')}</p>`,g.status==='complete');}
    }catch(e){k?.close();c.toast('Swap did not start: '+(e.message||e),true);}
    finally{V.busy=false;if(sendBtn)sendBtn.disabled=false;}};

  V.addImage=addImage;
  if(V.active)await load();
  draw();
}

/* paste anywhere in the Swap tab (images only — pasted text still goes into the box) */
document.addEventListener('paste',e=>{if(!view||!view.root||!view.root.isConnected||view.legacy)return;if(document.getElementById('sw20-brush')||document.getElementById('du-swap-lightbox'))return;
  const f=[...(e.clipboardData?.items||[])].filter(i=>i.kind==='file'&&/^image\//.test(i.type)).map(i=>i.getAsFile()).find(Boolean);if(!f)return;e.preventDefault();view.addImage(f);});

/* live clocks on in-play cards */
setInterval(()=>{if(!view||!view.root||!view.root.isConnected)return;view.root.querySelectorAll('[data-clock]').forEach(b=>{const st=watching.get(b.dataset.clock),g=view.gens.get(b.dataset.clock);const t0=st?.t0||(g?.started_at?new Date(g.started_at).getTime():Date.now());b.textContent=mmss((T.limitMs-(Date.now()-t0))/1000);});},500);

async function whenPortal(){for(let i=0;i<150;i++){if(window.DrawUpPortal?.registerTab)return window.DrawUpPortal;await sleep(100);}return null;}
(async()=>{const P=await whenPortal();if(!P){console.warn('DrawUp Swap V20: Portal not loaded.');return;}
  P.registerTab('swap',render);
  window.DrawUpSwap20={timing:T,needsWhere,inferType};
})();
})();
