/* DrawUp V20
 *
 * - Arch Coach (public and Portal) answers as a background job with a hologram-drawing
 *   loader, keeps the conversation (so "richmond, va" answers the earlier question),
 *   and gives up cleanly at two minutes with an automatic refund.
 */
(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const LIMIT_MS=115000;

/* =================================================================== hologram drawing loader */
const HOLO_SVG=`<svg viewBox="0 0 220 220" class="du-holo-svg" aria-hidden="true">
<defs><radialGradient id="duHoloG" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#7fe7ff" stop-opacity=".35"/><stop offset="1" stop-color="#7fe7ff" stop-opacity="0"/></radialGradient></defs>
<circle cx="110" cy="110" r="104" fill="url(#duHoloG)"/>
<circle class="ring r1" cx="110" cy="110" r="98"/><circle class="ring r2" cx="110" cy="110" r="84"/><circle class="ring r3" cx="110" cy="110" r="70"/>
<g class="plan">
<path class="ln l1" d="M58 62 H162 V158 H58 Z"/>
<path class="ln l2" d="M58 112 H118 M134 112 H162"/>
<path class="ln l3" d="M110 62 V96 M110 112 V158"/>
<path class="ln l4" d="M118 112 A16 16 0 0 1 134 96"/>
<path class="ln l5" d="M74 62 V54 M146 62 V54 M74 58 H146"/>
<path class="ln l6" d="M66 74 L100 104 M100 74 L66 104"/>
<path class="ln l7" d="M124 126 H152 V150 H124 Z"/>
</g><circle class="pen" r="3.2" cx="58" cy="62"/></svg>`;
function holoLoader(stage,label){
  if(!stage)return {set(){},done(){},quick(){}};
  speedCss();
  const el=document.createElement('div');el.className='du-holo-load';
  el.innerHTML=`<div class="du-holo-quick" hidden></div><div class="du-holo-portal">${HOLO_SVG}</div><div class="du-holo-text"><span class="du-holo-kicker">ARCH COACH · DRAWING IT UP</span><b class="du-holo-phase">${esc(label||'Reading your question…')}</b><div class="du-holo-meter"><i></i></div><small class="du-holo-time">0s</small></div>`;
  stage.appendChild(el);stage.scrollTop=stage.scrollHeight;
  const t0=Date.now(),phases=[[0,'Reading your question…'],[4,'Checking codes, standards and current sources…'],[14,'Drawing up the answer…'],[40,'Cross-checking what it found…'],[75,'Almost there, finishing the write-up…']];
  const tick=setInterval(()=>{const s=Math.round((Date.now()-t0)/1000);el.querySelector('.du-holo-time').textContent=el.querySelector('.du-holo-live p')?.textContent?s+'s · still writing':s+'s of 2:00 max';const p=[...phases].reverse().find(x=>s>=x[0]);if(p&&!el.dataset.custom)el.querySelector('.du-holo-phase').textContent=p[1];el.querySelector('.du-holo-meter i').style.width=Math.min(96,100*(1-Math.exp(-s/30)))+'%';},500);
  return {set(t){el.dataset.custom='1';el.querySelector('.du-holo-phase').textContent=t;},
    // V20 speed: the quick answer shows above the loader until the full sourced answer replaces it.
    // V21: the full answer appears here as it is written, then the finished answer replaces the loader.
    live(text,activity){let lv=el.querySelector('.du-holo-live');if(!lv){lv=document.createElement('div');lv.className='du-holo-live';lv.innerHTML='<span class="du-quick-tag">Full answer · writing now</span><p></p>';el.insertBefore(lv,el.querySelector('.du-holo-portal'));el.classList.add('has-quick');}
      if(text){lv.querySelector('p').textContent=text;const q=el.querySelector('.du-holo-quick');if(q&&!q.hidden)q.classList.add('du-quick-dim');}
      this.set(activity==='searching'?'Searching current sources…':activity==='read_sources'?'Reading the sources it found…':text?'Writing the full answer…':'Checking sources for the full answer…');
      const nearBottom=stage.scrollHeight-stage.scrollTop-stage.clientHeight<160;if(nearBottom)stage.scrollTop=stage.scrollHeight;},
    quick(text,ms){const q=el.querySelector('.du-holo-quick');q.hidden=false;q.innerHTML=`<span class="du-quick-tag">Quick answer, still checking sources${ms?` · ${(ms/1000).toFixed(1)}s`:''}</span><p>${linkText(text)}</p><small>Not verified yet. The full answer with sources replaces this when it is ready.</small>`;el.classList.add('has-quick');this.set('Checking sources for the full answer…');stage.scrollTop=stage.scrollHeight;},
    done(){clearInterval(tick);el.remove();}};
}
const linkText=t=>window.DrawUpV19?.linkify?window.DrawUpV19.linkify(t):esc(t);
function speedCss(){if(document.getElementById('du-speed20-css'))return;const s=document.createElement('style');s.id='du-speed20-css';s.textContent=`
.du-holo-load.has-quick{flex-wrap:wrap}.du-holo-quick{flex:1 1 100%;margin:0 0 10px;padding:12px 14px;border-radius:14px;border:1px dashed rgba(127,231,255,.55);background:rgba(127,231,255,.07);color:#e9fbff;text-align:left}
.du-holo-quick p{margin:6px 0 4px;line-height:1.5;white-space:pre-wrap}.du-holo-quick small{color:rgba(233,251,255,.62);font-size:12px}
.du-holo-live{flex:1 1 100%;margin:0 0 10px;padding:12px 14px;border-radius:14px;border:1px solid rgba(127,231,255,.35);background:rgba(4,15,28,.55);color:#f2fdff;text-align:left}.du-holo-live p{margin:6px 0 0;line-height:1.55;white-space:pre-wrap}.du-quick-dim{opacity:.55}
.du-quick-tag{display:inline-block;font:700 11px/1.2 inherit;letter-spacing:.08em;text-transform:uppercase;color:#7fe7ff}
.du-clarify{margin:8px 0;padding:14px;border-radius:16px;border:1px solid rgba(127,231,255,.45);background:linear-gradient(135deg,rgba(127,231,255,.10),rgba(155,93,229,.10));color:#eefcff}
.du-clarify b{display:block;margin:4px 0 10px;font-size:15px}.du-clarify-opts{display:flex;flex-wrap:wrap;gap:8px}
.du-clarify-opts button{border:1px solid rgba(127,231,255,.6);background:rgba(4,15,28,.6);color:#7fe7ff;border-radius:999px;padding:8px 14px;font:600 13px inherit;cursor:pointer;min-height:36px}
.du-clarify-opts button:hover,.du-clarify-opts button:focus-visible{background:#7fe7ff;color:#04101c;outline:none}
.du-clarify form{display:flex;gap:8px;margin-top:10px}.du-clarify input{flex:1;min-width:0;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:rgba(4,15,28,.72);color:#fff;padding:9px 11px;font:inherit}
.du-clarify form button{border:0;border-radius:10px;padding:9px 14px;background:linear-gradient(135deg,#ff8a3d,#9b5de5);color:#fff;font-weight:700;cursor:pointer}
.du-clarify .du-clarify-skip{margin-top:8px;background:none;border:0;color:rgba(238,252,255,.7);text-decoration:underline;cursor:pointer;font:inherit;font-size:12px;padding:0}`;document.head.appendChild(s);}

/* V20 speed: Arch Coach asks one clarifying question with tappable options when the question is
   ambiguous (city vs state, program type, building type…). Resolves with the chosen clue, or '' to skip. */
function clarifyCard(stage,c){
  speedCss();
  return new Promise(res=>{
    const el=document.createElement('div');el.className='du-clarify';el.setAttribute('role','group');
    el.innerHTML=`<span class="du-quick-tag">Arch Coach · quick question</span><b>${esc(c.question)}</b><div class="du-clarify-opts">${(c.options||[]).map((o,i)=>`<button type="button" data-i="${i}">${esc(o.label)}</button>`).join('')}</div><form><input type="text" maxlength="160" placeholder="Or type the detail (city, state, program…)" aria-label="Your answer"><button>Send</button></form><button type="button" class="du-clarify-skip">Just answer it as asked</button>`;
    stage.appendChild(el);stage.scrollTop=stage.scrollHeight;
    const finish=v=>{el.remove();res(v);};
    el.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>finish(String(c.options[+b.dataset.i].value||c.options[+b.dataset.i].label)));
    el.querySelector('form').onsubmit=e=>{e.preventDefault();const v=el.querySelector('input').value.trim();if(v)finish(v);};
    el.querySelector('.du-clarify-skip').onclick=()=>finish('');
  });
}

/* =================================================================== Arch Coach request */
/* body: {message, history, location, project, image}. Resolves to the full answer payload.
   V20 speed: a quick answer shows within seconds (labeled, never presented as verified), then the
   full sourced answer replaces it. Ambiguous questions get chips first; the pick reruns with the clue. */
/* V21: guests get 10 questions per device. A device id (kept in storage and a cookie) and a light
   browser fingerprint go to the server, which stores only one-way hashes of them. */
function deviceId(){let id='';try{id=localStorage.getItem('du_device')||'';}catch(_e){}if(!id){const m=document.cookie.match(/(?:^|; )du_device=([\w-]+)/);id=m?m[1]:'';}
  if(!id){id=(crypto.randomUUID?crypto.randomUUID():String(Math.random()).slice(2)+Date.now()).replace(/[^\w-]/g,'');}
  try{localStorage.setItem('du_device',id);}catch(_e){}document.cookie='du_device='+id+'; max-age=63072000; path=/; SameSite=Lax';return id;}
let fpCache='';
function fingerprint(){if(fpCache)return fpCache;let c='';try{const cv=document.createElement('canvas');cv.width=220;cv.height=30;const x=cv.getContext('2d');x.textBaseline='top';x.font='14px Arial';x.fillStyle='#f60';x.fillRect(100,1,62,20);x.fillStyle='#069';x.fillText('DrawUp guest check',2,15);c=cv.toDataURL();}catch(_e){}
  const parts=[navigator.userAgent,navigator.language,(navigator.languages||[]).join(','),screen.width+'x'+screen.height+'x'+screen.colorDepth,new Date().getTimezoneOffset(),Intl.DateTimeFormat().resolvedOptions().timeZone,navigator.hardwareConcurrency,navigator.maxTouchPoints,navigator.platform,c].join('|');
  let h1=0x811c9dc5,h2=0x1b873593;for(let i=0;i<parts.length;i++){const k=parts.charCodeAt(i);h1=Math.imul(h1^k,16777619);h2=Math.imul(h2^k,2246822507);}
  return fpCache=('fp'+(h1>>>0).toString(36)+(h2>>>0).toString(36)).padEnd(12,'0');}
function guestHeaders(){try{return {'X-DrawUp-Device':deviceId(),'X-DrawUp-Fp':fingerprint()};}catch(_e){return {};}}
/** Shows the guest questions left for this device on the public Arch Coach page (signed-out visitors only). */
async function refreshGuestCount(){const el=document.getElementById('coach-free-count');if(!el)return;
  try{const c=window.drawupSupabaseClient;const ses=c?(await c.auth.getSession()).data.session:null;if(ses&&!ses.user?.is_anonymous)return;
    const r=await fetch('/api/arch-coach?guest=1',{headers:guestHeaders(),cache:'no-store'});const d=await r.json();
    if(Number.isInteger(d.free_questions_remaining))el.textContent=d.free_questions_remaining+' guest question'+(d.free_questions_remaining===1?'':'s')+' remaining';}catch(_e){}}
setTimeout(refreshGuestCount,1200);
async function coachAsk({token,stage,label,endpoint,...body}){
  const loader=holoLoader(stage,label);
  try{
    const h={'Content-Type':'application/json',Authorization:'Bearer '+token,...guestHeaders()};
    let d,res;
    for(let round=0;;round++){
      res=await fetch(endpoint||'/api/arch-coach',{method:'POST',headers:h,body:JSON.stringify({...body,async:true})});
      d=await res.json().catch(()=>({}));
      if(!res.ok){if(d.code==='GUEST_LIMIT_REACHED'){const el=document.getElementById('coach-free-count');if(el)el.textContent='0 guest questions remaining';}throw new Error(d.error||'Arch Coach could not start ('+res.status+').');}
      if(!(d.clarify&&d.clarify.options?.length>=2&&round<1&&stage))break;
      loader.set('Waiting for your answer…');
      const clue=await clarifyCard(stage,d.clarify);
      const message=clue?`${body.message} (${clue})`:body.message;
      const history=Array.isArray(body.history)?body.history.slice():[];
      if(clue&&history.length&&history[history.length-1]?.role==='user')history[history.length-1]={role:'user',content:message};
      body={...body,message,history,clarified:true};loader.set('Reading your question…');
    }
    if(!d.ticket)return d;
    if(d.quick?.answer)loader.quick(d.quick.answer,d.quick.ms);
    const t0=Date.now();let cursor=d.stream?Number(d.stream.cursor)||0:null,text='',lastText=t0;
    // V21: streamed answers keep going while text is still arriving (up to 4 minutes); a silent job stops at 2:00.
    while(Date.now()-t0<LIMIT_MS||(text&&Date.now()-lastText<20000&&Date.now()-t0<LIMIT_MS*2)){
      if(cursor===null)await sleep(Date.now()-t0<10000?1500:2500);else await sleep(250);
      const r=await fetch('/api/arch-coach?ticket='+encodeURIComponent(d.ticket)+(cursor!==null?'&after='+cursor:''),{headers:h,cache:'no-store'});
      const p=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(p.error||'Arch Coach could not finish that answer. You were not charged.');
      if(p.status==='completed')return {...p,clarified_message:body.clarified?body.message:undefined};
      if(cursor!==null&&typeof p.cursor==='number'){cursor=p.cursor;if(p.delta){text+=p.delta;lastText=Date.now();}loader.live(text,p.activity);}
    }
    fetch('/api/arch-coach?ticket='+encodeURIComponent(d.ticket),{method:'DELETE',headers:h}).catch(()=>{});
    // Never leave the member with nothing: keep the quick answer (or what was written) and say it was not fully checked.
    const partial=text||d.quick?.answer;
    if(partial)return {answer:partial+'\n\n(Arch Coach could not finish checking sources in time, so this answer is not fully verified. You were not charged.)',sources:[],partial:true,credits_charged:0};
    throw new Error('That answer took longer than two minutes, so DrawUp stopped it. You were not charged. Try asking a narrower question.');
  }finally{loader.done();}
}

/* =================================================================== DrawUp Check: progress, markups, Ask Coach */
const SEV=['critical','major','minor','info'];
const SEV_RGB={critical:[0.85,0.11,0.11],major:[0.93,0.45,0.05],minor:[0.10,0.40,0.85],info:[0.42,0.45,0.50]};
const P=()=>window.DrawUpPortal;
let pdfLibP=null;
function pdfLib(){if(window.PDFLib)return Promise.resolve(window.PDFLib);if(!pdfLibP)pdfLibP=new Promise((ok,no)=>{const s=document.createElement('script');s.src='/vendor/pdf-lib-1.17.1.min.js';s.onload=()=>ok(window.PDFLib);s.onerror=()=>{pdfLibP=null;no(new Error('The PDF tools could not load. Check your connection and try again.'));};document.head.appendChild(s);});return pdfLibP;}
/* Standard PDF fonts only cover basic Latin, so normalize anything else. */
const ascii=t=>String(t??'').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-').replace(/≥/g,'>=').replace(/≤/g,'<=').replace(/×/g,'x').replace(/…/g,'...').replace(/[^\x20-\x7e\xa0-\xff\n]/g,'');
function wrapText(font,text,size,maxW){const out=[];String(text).split('\n').forEach(par=>{let cur='';par.split(/\s+/).forEach(w=>{const t=cur?cur+' '+w:w;if(font.widthOfTextAtSize(t,size)>maxW&&cur){out.push(cur);cur=w;}else cur=t;});out.push(cur);});return out;}
const sortFindings=fs=>(fs||[]).slice().sort((a,b)=>SEV.indexOf(a.severity)-SEV.indexOf(b.severity));
function checkCtx(){const id=new URLSearchParams((location.hash.split('?')[1])||'').get('id');return /^#portal\/check/.test(location.hash)&&id?id:null;}
async function loadReview(id){const c=P()?.ctx?.();if(!c)return null;const {data}=await c.client.from('check_reviews').select('*').eq('id',id).eq('owner_id',c.user.id).maybeSingle();return data?{c,r:data}:null;}

/* Maps a box given from the top-left of the page as seen (fractions) to PDF user space, honoring CropBox and /Rotate. */
function boxToPdf(page,b){
  const cb=page.getCropBox(),rot=((page.getRotation().angle%360)+360)%360,W=cb.width,H=cb.height;
  const pt=(vx,vy)=>rot===90?[cb.x+vy*W,cb.y+vx*H]:rot===180?[cb.x+W-vx*W,cb.y+vy*H]:rot===270?[cb.x+W-vy*W,cb.y+H-vx*H]:[cb.x+vx*W,cb.y+H-vy*H];
  const [x1,y1]=pt(b.x,b.y),[x2,y2]=pt(b.x+b.w,b.y+b.h);
  return {x:Math.min(x1,x2),y:Math.min(y1,y2),w:Math.abs(x2-x1),h:Math.abs(y2-y1),rot,W,H,cb};
}
/* Revision cloud: outward scallops around the box (drawn in user space, so it follows any page rotation). */
function cloud(page,R,color,width){
  const {x,y,w,h}=R,step=Math.max(10,Math.min(w,h)/5),r=step/2;let d='M0 0';
  const nx=Math.max(1,Math.round(w/step)),ny=Math.max(1,Math.round(h/step)),sx=w/nx,sy=h/ny;
  for(let i=0;i<nx;i++)d+=` A${sx/2} ${r} 0 0 1 ${(i+1)*sx} 0`;
  for(let i=0;i<ny;i++)d+=` A${r} ${sy/2} 0 0 1 ${w} ${(i+1)*sy}`;
  for(let i=nx-1;i>=0;i--)d+=` A${sx/2} ${r} 0 0 1 ${i*sx} ${h}`;
  for(let i=ny-1;i>=0;i--)d+=` A${r} ${sy/2} 0 0 1 0 ${i*sy}`;
  page.drawSvgPath(d,{x,y:y+h,borderColor:color,borderWidth:width,borderOpacity:0.95});
}
async function buildMarkup(review,bytes,mode){
  const L=await pdfLib();const {PDFDocument,StandardFonts,rgb,degrees}=L;
  const doc=await PDFDocument.load(bytes,{ignoreEncryption:true});
  const font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const pages=doc.getPages(),findings=sortFindings(review.findings);
  const fix=mode==='fix',green=rgb(0.05,0.55,0.25);
  const placed=[],unplaced=[];
  findings.forEach((f,i)=>{const n=i+1;const pg=f.page&&pages[f.page-1];if(!pg||!f.box){unplaced.push([n,f]);return;}placed.push([n,f]);
    const R=boxToPdf(pg,f.box),c=fix?green:rgb(...SEV_RGB[f.severity]||SEV_RGB.info),lw=Math.max(1.2,Math.min(R.W,R.H)/500);
    cloud(pg,R,c,lw);
    const tag=Math.max(9,Math.min(R.W,R.H)/70),up=degrees(R.rot);
    const tx=R.rot===0?R.x:R.x+R.w,ty=R.rot===0?R.y+R.h:R.y+R.h;
    pg.drawCircle({x:tx,y:ty,size:tag,color:c,borderColor:rgb(1,1,1),borderWidth:1});
    pg.drawText(String(n),{x:tx-(String(n).length*tag*0.28),y:ty-tag*0.35,size:tag,font:bold,color:rgb(1,1,1),rotate:R.rot===0?undefined:up});
    if(fix&&R.rot===0){const size=Math.max(8,Math.min(R.W,R.H)/80),maxW=Math.min(R.W*0.34,size*44);const lines=wrapText(font,ascii('SUGGESTED CHANGE '+n+': '+(f.recommendation||f.issue)),size,maxW).slice(0,8);
      const bw=Math.max(...lines.map((l,k)=>(k===0?bold:font).widthOfTextAtSize(l,size)))+size*1.4,bh=lines.length*size*1.3+size*0.8,pad=tag*1.6;
      let bx=R.x+R.w+pad,by=R.y+R.h-bh;
      if(bx+bw>R.cb.x+R.W-4){bx=Math.max(R.cb.x+4,Math.min(R.x,R.cb.x+R.W-bw-4));by=R.y-bh-pad;if(by<R.cb.y+4)by=R.y+R.h+pad;}
      by=Math.max(R.cb.y+4,Math.min(by,R.cb.y+R.H-bh-4));
      pg.drawRectangle({x:bx,y:by,width:bw,height:bh,color:rgb(1,1,1),opacity:0.94,borderColor:green,borderWidth:lw});
      lines.forEach((l,k)=>pg.drawText(l,{x:bx+size*0.6,y:by+bh-size*1.2-k*size*1.3,size,font:k===0?bold:font,color:rgb(0.02,0.3,0.12)}));}
  });
  // stamp each marked page
  const stamped=new Set(placed.map(([,f])=>f.page));
  stamped.forEach(pn=>{const pg=pages[pn-1],cb=pg.getCropBox(),rot=pg.getRotation().angle%360;if(rot)return;const size=Math.max(8,cb.width/110);
    const txt=fix?'DRAWUP CHECK - PRELIMINARY SUGGESTED CHANGES - NOT FOR CONSTRUCTION':'DRAWUP CHECK MARKUP - SEE LEGEND ON PAGE 1';
    pg.drawRectangle({x:cb.x+size,y:cb.y+cb.height-size*2.6,width:font.widthOfTextAtSize(txt,size)+size*1.2,height:size*1.9,color:fix?green:rgb(0.85,0.11,0.11),opacity:0.92});
    pg.drawText(txt,{x:cb.x+size*1.6,y:cb.y+cb.height-size*2.05,size,font:bold,color:rgb(1,1,1)});});
  // legend / change list cover page
  const cover=doc.insertPage(0,[792,612]);let y=570;const M=40,W=792-2*M;
  const line=(t,size,f,col)=>{wrapText(f||font,ascii(t),size,W).forEach(l=>{if(y<50){return;}cover.drawText(l,{x:M,y,size,font:f||font,color:col||rgb(0.07,0.09,0.13)});y-=size*1.3;});};
  line(fix?'DrawUp Check - Preliminary suggested changes':'DrawUp Check - Markup legend',18,bold);
  line(ascii(review.title||'')+'  |  '+ascii(review.file_name||'')+(review.jurisdiction?'  |  '+ascii(review.jurisdiction):''),10);
  y-=6;
  if(fix){line('This is NOT a revised drawing set. Each green cloud marks where a change is suggested and the box beside it says what to change. The architect or engineer of record must make, check and seal any revision. Sheets are otherwise unchanged.',10);}
  else{line('Clouds mark the area each finding refers to. The number in the circle matches the finding number in the DrawUp Check report. Locations are placed by the reviewer and may be approximate.',10);
    y-=4;SEV.forEach((s,i)=>{const lx=M+(i%2)*(W/2),ly=y-Math.floor(i/2)*18;cover.drawCircle({x:lx+7,y:ly+3,size:7,color:rgb(...SEV_RGB[s])});cover.drawText(s.toUpperCase()+(s==='critical'?' - life safety or likely permit rejection':s==='major'?' - must be fixed before issue':s==='minor'?' - drafting / quality':' - note for the designer'),{x:lx+18,y:ly,size:9.5,font,color:rgb(0.1,0.1,0.1)});});y-=44;}
  y-=4;line((fix?'Changes':'Findings')+' ('+findings.length+')',12,bold);
  [...placed,...unplaced].sort((a,b)=>a[0]-b[0]).forEach(([n,f])=>{if(y<60)return;line(n+'. ['+String(f.severity).toUpperCase()+'] '+(f.sheet||'')+(f.page?' (PDF page '+f.page+')':' (not located on a sheet)')+' - '+(f.location||''),9.5,bold,fix?green:rgb(...SEV_RGB[f.severity]||SEV_RGB.info));line((fix?'Change: '+(f.recommendation||f.issue):f.issue),9);y-=3;});
  if(y<60)cover.drawText('More items continue in the DrawUp Check report.',{x:M,y:36,size:8,font,color:rgb(0.3,0.3,0.3)});
  cover.drawText('DrawUp Check is guidance for the design team. The licensed professional of record and the authority having jurisdiction make final determinations.',{x:M,y:22,size:7.5,font,color:rgb(0.35,0.35,0.35)});
  return await doc.save();
}
function saveBlob(name,bytes){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},4000);}

function enhanceReviewing(w,id){
  const art=[...w.querySelectorAll('article.du-glass')].find(a=>/Reviewing your sheets/.test(a.querySelector('h2')?.textContent||''));
  if(!art||art.dataset.v20)return;art.dataset.v20='1';
  art.innerHTML='<h2>Reviewing your sheets…</h2><div class="du-ckp"><div class="du-ckp-top"><b class="du-ckp-pct">0%</b><span class="du-ckp-phase">Opening your PDF…</span></div><div class="du-ckp-meter"><i></i></div><ol class="du-ckp-steps"></ol><small class="du-ckp-note"></small></div><div class="du-check-live" hidden aria-live="polite"><h3>Reading the sheets…</h3><ul class="du-check-found"></ul><p class="du-muted">Not final yet. The full report with locations, fixes and references replaces this list.</p></div>';
  loadReview(id).then(x=>{if(!x)return;const r=x.r,pages=r.page_count||Math.max(2,Math.round((r.file_size||3e6)/6e5)),est=30+9*pages,t0=new Date(r.started_at||r.created_at).getTime();
    const focus=(r.focus||[]).map(f=>f.replace('_',' '));
    const steps=[['Uploaded '+(r.file_name||'drawing set'),0],['Reading '+pages+' page'+(pages===1?'':'s')+' (sheets, notes, schedules)',0.08],['Checking '+(focus.join(', ')||'code, accessibility and coordination'),0.4],['Locating each finding on its sheet',0.75],['Writing the report and markups',0.9]];
    const tick=()=>{if(!document.body.contains(art)){clearInterval(t);return;}const el=(Date.now()-t0)/1000,f=Math.min(0.95,el/est*0.9+0.03),pct=Math.round(f*100);
      art.querySelector('.du-ckp-pct').textContent=pct+'%';art.querySelector('.du-ckp-meter i').style.width=pct+'%';
      const cur=steps.filter(s=>f>=s[1]).length-1;let phase=steps[cur][0];if(cur===1)phase='Reading page '+Math.min(pages,Math.max(1,Math.ceil((f-0.08)/0.32*pages)))+' of '+pages;if(cur===2&&focus.length)phase='Checking '+focus[Math.floor(el/6)%focus.length];
      art.querySelector('.du-ckp-phase').textContent=phase;
      art.querySelector('.du-ckp-steps').innerHTML=steps.map((s,i)=>`<li class="${i<cur?'done':i===cur?'now':''}">${i<cur?'✓ ':i===cur?'● ':'○ '}${esc(s[0])}</li>`).join('');
      const m=Math.floor(el/60),sec=Math.floor(el%60);art.querySelector('.du-ckp-note').textContent=`${m}:${String(sec).padStart(2,'0')} elapsed · about ${Math.max(1,Math.round(est/60))} min expected for ${pages} pages. Progress is estimated from the size of the set${el>est*1.5?'. This one is taking longer than usual; you can leave and come back.':'.'}`;};
    tick();const t=setInterval(tick,1000);});
}
function enhanceComplete(w,id){
  const list=w.querySelector('.du-findings');const stats=w.querySelector('.du-stats');
  if(!stats||stats.dataset.v20)return;stats.dataset.v20='1';
  loadReview(id).then(x=>{if(!x)return;const {c,r}=x,findings=sortFindings(r.findings),located=findings.filter(f=>f.page&&f.box).length;
    const box=document.createElement('article');box.className='du-glass du-ck-docs';
    box.innerHTML=`<h2>Review documents</h2><p class="du-muted">Three PDFs from this review. ${located?located+' of '+findings.length+' findings are placed on your sheets.':'This review was run before sheet locations were added, so the markups list findings on a legend page only. Run a new review to get clouds on the sheets.'}</p>
    <div class="du-ck-doc-grid"><button class="du-ck-doc" data-doc="report"><b>1 · Report</b><span>All findings, references and sources.</span></button><button class="du-ck-doc" data-doc="markup"><b>2 · Marked-up set</b><span>Your PDF with numbered redline clouds by severity, plus a legend page.</span></button><button class="du-ck-doc" data-doc="fix"><b>3 · Suggested changes (preliminary)</b><span>Your PDF with each suggested change written beside its cloud. Not a revised or sealed set.</span></button></div><span class="du-ck-doc-st du-muted"></span>`;
    stats.insertAdjacentElement('afterend',box);
    const st=box.querySelector('.du-ck-doc-st'),base=(r.title||'drawup-check').replace(/[^\w.-]+/g,'-');
    box.querySelectorAll('[data-doc]').forEach(b=>b.onclick=async()=>{const kind=b.dataset.doc;
      if(kind==='report'){w.querySelector('#cr-export')?.click();return;}
      b.disabled=true;st.textContent=' Building the '+(kind==='fix'?'suggested-changes':'marked-up')+' PDF…';
      try{const dl=await c.client.storage.from('drawup-private').download(r.file_path);if(dl.error)throw dl.error;const bytes=new Uint8Array(await dl.data.arrayBuffer());
        const out=await buildMarkup(r,bytes,kind==='fix'?'fix':'markup');saveBlob(base+(kind==='fix'?'-suggested-changes-PRELIMINARY.pdf':'-markup.pdf'),out);st.textContent=' Downloaded.';}
      catch(e){st.textContent=' Could not build the PDF: '+(e.message||e);}finally{b.disabled=false;}});
    if(list)[...list.querySelectorAll('.du-finding')].forEach((el,i)=>{const f=findings[i];if(!f||el.querySelector('.du-ask-coach'))return;
      const n=document.createElement('div');n.className='du-finding-foot';n.innerHTML=`<span class="du-finding-num">#${i+1}${f.page?' · PDF page '+f.page:''}</span><button type="button" class="du-ask-coach${/critical|major/.test(f.severity)?' hot':''}">Ask Arch Coach how to fix this →</button>`;el.appendChild(n);
      n.querySelector('button').onclick=()=>{const q=`DrawUp Check flagged this on my drawings${r.jurisdiction?' for a project in '+r.jurisdiction:''}${r.building_type?' ('+r.building_type+')':''}.\nSheet ${f.sheet||'?'}, ${f.location||''}: ${f.issue}\nSuggested fix: ${f.recommendation||'none given'}\nReference: ${f.reference||'none given'}\nHow do I fix this, what exactly does the code require, and what should I draw or note on the sheet?`;try{sessionStorage.setItem('du-coach-prefill',q);}catch(_e){}P().openPortalTab('arch-coach');};});
  });
}
let ckPending=false;
function ckScan(){ckPending=false;const id=checkCtx();if(!id)return;const w=document.getElementById('du-workspace-content');if(!w)return;enhanceReviewing(w,id);enhanceComplete(w,id);}
new MutationObserver(()=>{if(!ckPending){ckPending=true;requestAnimationFrame(ckScan);}}).observe(document.documentElement,{childList:true,subtree:true});

/* =================================================================== Search portal: timer + globe pin */
const STATE_C={AL:[32.8,-86.8],AK:[64.2,-149.5],AZ:[34.3,-111.7],AR:[34.9,-92.4],CA:[37.2,-119.5],CO:[39.0,-105.5],CT:[41.6,-72.7],DE:[39.0,-75.5],DC:[38.9,-77.0],FL:[28.6,-82.4],GA:[32.7,-83.4],HI:[20.8,-156.3],ID:[44.4,-114.6],IL:[40.0,-89.2],IN:[39.9,-86.3],IA:[42.1,-93.5],KS:[38.5,-98.4],KY:[37.5,-85.3],LA:[31.1,-92.0],ME:[45.4,-69.2],MD:[39.0,-76.8],MA:[42.3,-71.8],MI:[44.3,-85.4],MN:[46.3,-94.3],MS:[32.7,-89.7],MO:[38.4,-92.5],MT:[47.0,-109.6],NE:[41.5,-99.8],NV:[39.3,-116.6],NH:[43.7,-71.6],NJ:[40.2,-74.7],NM:[34.4,-106.1],NY:[42.9,-75.5],NC:[35.6,-79.4],ND:[47.5,-100.5],OH:[40.3,-82.8],OK:[35.6,-97.5],OR:[43.9,-120.6],PA:[40.9,-77.8],RI:[41.7,-71.5],SC:[33.9,-80.9],SD:[44.4,-100.2],TN:[35.9,-86.4],TX:[31.5,-99.3],UT:[39.3,-111.7],VT:[44.1,-72.7],VA:[37.5,-78.8],WA:[47.4,-120.5],WV:[38.6,-80.6],WI:[44.6,-89.9],WY:[43.0,-107.6]};
const STATE_N={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
let landP=null;
function land(){if(window.DRAWUP_LAND)return Promise.resolve(window.DRAWUP_LAND);if(!landP)landP=new Promise(ok=>{const sc=document.createElement('script');sc.src='/vendor/drawup-land-110m.js';sc.onload=()=>ok(window.DRAWUP_LAND||[]);sc.onerror=()=>ok([]);document.head.appendChild(sc);});return landP;}
function withTimeout(p,ms){return Promise.race([p,new Promise(r=>setTimeout(()=>r(null),ms))]);}
async function nominatim(q,ms){
  try{const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),ms);
    const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=en&q='+encodeURIComponent(q),{signal:ctl.signal,headers:{Accept:'application/json'}});clearTimeout(t);
    const d=(await r.json())[0];if(!d)return null;const a=d.address||{};
    const city=a.city||a.town||a.village||a.hamlet||a.municipality||a.county||'';
    return {lat:+d.lat,lon:+d.lon,city,state:a.state||'',country:a.country||'',label:[city,a.state,a.country].filter(Boolean).join(', ')};
  }catch(_e){return null;}
}
async function dbPlace(q){
  const c=window.drawupSupabaseClient;if(!c)return null;
  try{const {data}=await c.rpc('drawup_search',{q,kind:'all',max_rows:4});const p=(data?.projects||[]).find(x=>x.city)||null;if(!p)return null;
    const st=String(p.state||'').toUpperCase(),cc=STATE_C[st];
    const geo=await nominatim([p.city,p.state,p.country].filter(Boolean).join(', '),1800);
    if(geo)return {...geo,city:p.city,label:[p.city,STATE_N[st]||p.state,geo.country||'United States'].filter(Boolean).join(', ')};
    return cc?{lat:cc[0],lon:cc[1],city:p.city,state:STATE_N[st]||st,country:'United States',label:[p.city,STATE_N[st]||st,'United States'].join(', ')}:null;
  }catch(_e){return null;}
}
function globe(canvas){
  const ctx=canvas.getContext('2d');let rot=[-40,-20],target=null,pin=null,raf=0,polys=[],alive=true;const D=Math.PI/180;
  land().then(l=>{polys=l||[];});
  const size=()=>{const r=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;canvas.width=r.width*dpr;canvas.height=r.height*dpr;return [r.width*dpr,r.height*dpr];};
  let [W,H]=size();
  const proj=(lon,lat)=>{const l=(lon+rot[0])*D,p=lat*D,p0=rot[1]*D;const cosc=Math.sin(-p0)*Math.sin(p)+Math.cos(-p0)*Math.cos(p)*Math.cos(l);if(cosc<0)return null;const R=W/2-2;return [W/2+R*Math.cos(p)*Math.sin(l),H/2-R*(Math.cos(-p0)*Math.sin(p)-Math.sin(-p0)*Math.cos(p)*Math.cos(l))];};
  const frame=t=>{if(!alive)return;
    if(target){rot[0]+=(target[0]-rot[0])*0.08;rot[1]+=(target[1]-rot[1])*0.08;}else rot[0]=(rot[0]+0.25)%360;
    ctx.clearRect(0,0,W,H);const R=W/2-2;
    const g=ctx.createRadialGradient(W*0.4,H*0.35,R*0.1,W/2,H/2,R);g.addColorStop(0,'rgba(80,190,255,.30)');g.addColorStop(1,'rgba(10,40,80,.55)');
    ctx.beginPath();ctx.arc(W/2,H/2,R,0,7);ctx.fillStyle=g;ctx.fill();ctx.lineWidth=Math.max(1,W/120);ctx.strokeStyle='#9ee7ff';ctx.stroke();
    ctx.lineWidth=Math.max(.6,W/400);ctx.strokeStyle='rgba(174,243,213,.25)';
    for(let lo=-180;lo<180;lo+=30){ctx.beginPath();let m=false;for(let la=-90;la<=90;la+=5){const q=proj(lo,la);if(q){m?ctx.lineTo(...q):ctx.moveTo(...q);m=true;}else m=false;}ctx.stroke();}
    for(let la=-60;la<=60;la+=30){ctx.beginPath();let m=false;for(let lo=-180;lo<=180;lo+=5){const q=proj(lo,la);if(q){m?ctx.lineTo(...q):ctx.moveTo(...q);m=true;}else m=false;}ctx.stroke();}
    ctx.fillStyle='rgba(158,231,255,.35)';ctx.strokeStyle='rgba(174,243,255,.8)';ctx.lineWidth=Math.max(.6,W/360);
    polys.forEach(pl=>{ctx.beginPath();let m=false;for(let i=0;i<pl.length;i+=2){const q=proj(pl[i],pl[i+1]);if(q){m?ctx.lineTo(...q):ctx.moveTo(...q);m=true;}else m=false;}ctx.stroke();});
    if(pin){const q=proj(pin[0],pin[1]);if(q){const pulse=(t/600)%1;ctx.beginPath();ctx.arc(q[0],q[1],W/40+pulse*W/9,0,7);ctx.strokeStyle=`rgba(255,59,48,${1-pulse})`;ctx.lineWidth=W/90;ctx.stroke();ctx.beginPath();ctx.arc(q[0],q[1],W/32,0,7);ctx.fillStyle='#ff3b30';ctx.shadowColor='#ff3b30';ctx.shadowBlur=W/12;ctx.fill();ctx.shadowBlur=0;}}
    raf=requestAnimationFrame(frame);};
  raf=requestAnimationFrame(frame);
  return {go(lat,lon){target=[-lon,-lat*0.85];pin=[lon,lat];},stop(){alive=false;cancelAnimationFrame(raf);}};
}
const Portal20={g:null,timer:null,t0:0,q:'',seq:0};
function tunnelOpened(t){
  const card=t.querySelector('.v12-tunnel-card'),gl=t.querySelector('.v12-globe');if(!card||!gl)return;
  const seq=++Portal20.seq;Portal20.t0=Date.now();
  if(!t.querySelector('.du-sp-clock'))gl.insertAdjacentHTML('beforebegin','<div class="du-sp-clock"><b>0.0</b><span>seconds</span></div>');
  if(!t.querySelector('.du-sp-place'))gl.insertAdjacentHTML('afterend','<div class="du-sp-place"></div>');
  gl.classList.add('du-sp-globe');let cv=gl.querySelector('canvas');if(!cv){cv=document.createElement('canvas');gl.appendChild(cv);}
  Portal20.g?.stop();Portal20.g=globe(cv);
  const placeEl=t.querySelector('.du-sp-place');placeEl.innerHTML='<span>LOCATING…</span>';placeEl.classList.remove('found');
  clearInterval(Portal20.timer);Portal20.timer=setInterval(()=>{const s=(Date.now()-Portal20.t0)/1000;const el=t.querySelector('.du-sp-clock b');if(el)el.textContent=s<60?s.toFixed(1):Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');},100);
  setTimeout(async()=>{const q=(document.getElementById('v12-tunnel-query')?.textContent||'').trim();Portal20.q=q;
    const place=await withTimeout(Promise.all([nominatim(q,2600),dbPlace(q)]).then(([a,b])=>b||a),2900);
    if(seq!==Portal20.seq)return;
    if(place)found(place);else placeEl.innerHTML='<span>LOCATING FROM SOURCES…</span>';},30);
  function found(p){Portal20.g?.go(p.lat,p.lon);placeEl.classList.add('found');placeEl.innerHTML=`<span>LOCATED</span><b>${esc(p.label||[p.city,p.state,p.country].filter(Boolean).join(', '))}</b>`;}
  Portal20.found=found;Portal20.seqFound=seq;
}
function tunnelClosed(){clearInterval(Portal20.timer);Portal20.g?.stop();Portal20.g=null;Portal20.seq++;}
(function watchTunnel(){
  const t=document.getElementById('drawup-v12-tunnel');if(!t){setTimeout(watchTunnel,300);return;}
  let was=t.classList.contains('open');
  new MutationObserver(()=>{const now=t.classList.contains('open');if(now&&!was)tunnelOpened(t);if(!now&&was)tunnelClosed();was=now;}).observe(t,{attributes:true,attributeFilter:['class']});
  const route=document.getElementById('v12-tunnel-route');
  if(route)new MutationObserver(async()=>{const m=/^Routing to (.+?)…?$/.exec(route.textContent||'');const pl=t.querySelector('.du-sp-place');if(!m||!pl||pl.classList.contains('found'))return;const seq=Portal20.seq;const g=await nominatim(m[1],2500);if(g&&seq===Portal20.seq&&Portal20.found)Portal20.found(g);}).observe(route,{childList:true,characterData:true,subtree:true});
})();

/* =================================================================== Firm showcase */
async function openShowcase(slug){
  const c=window.drawupSupabaseClient;if(!c)return;
  document.getElementById('du-showcase')?.remove();
  document.body.insertAdjacentHTML('beforeend','<div id="du-showcase" class="du-sc" role="dialog" aria-modal="true"><div class="du-sc-top"><button type="button" class="du-sc-x" aria-label="Close showcase">×</button><div class="du-sc-head"><span class="du-sc-kicker">FIRM SHOWCASE</span><h1>Loading…</h1></div></div><div class="du-sc-body"><div class="du-sc-loading">Loading projects…</div></div></div>');
  const ov=document.getElementById('du-showcase'),body=ov.querySelector('.du-sc-body');document.documentElement.classList.add('du-sc-lock');
  const close=()=>{ov.remove();document.documentElement.classList.remove('du-sc-lock');document.removeEventListener('keydown',onKey);};
  const onKey=e=>{if(e.key==='Escape'){const lb=document.getElementById('du-sc-lb');if(lb)lb.remove();else close();}};document.addEventListener('keydown',onKey);
  ov.querySelector('.du-sc-x').onclick=close;
  const {data:f}=await c.from('firms').select('id,name,slug,logo_url,discipline,website,firm_photos(image_url,caption,sort_order)').eq('slug',slug).maybeSingle();
  if(!f){body.innerHTML='<p>Firm not found.</p>';return;}
  const {data:pf}=await c.from('project_firms').select('role,aec_projects(id,slug,name,city,state,country,project_type,status,completion_year,opened_year,description,image_page_url,is_demo,project_images(image_url,caption,is_hero,sort_order))').eq('firm_id',f.id);
  const seen=new Set(),projects=(pf||[]).filter(x=>x.aec_projects&&!x.aec_projects.is_demo&&!seen.has(x.aec_projects.id)&&seen.add(x.aec_projects.id)).map(x=>({...x.aec_projects,role:x.role,imgs:(x.aec_projects.project_images||[]).slice().sort((a,b)=>(b.is_hero?1:0)-(a.is_hero?1:0)||a.sort_order-b.sort_order)}))
    .sort((a,b)=>(b.imgs.length?1:0)-(a.imgs.length?1:0)||(b.completion_year||b.opened_year||0)-(a.completion_year||a.opened_year||0));
  // V20: the firm's chosen featured projects lead (in its order), every other project follows.
  const fslot=new Map(((await window.DrawUpFirms?.loadFeatured?.(c,f.id,null))||[]).map(r=>[r.project_id,r.slot]));
  projects.sort((a,b)=>(fslot.get(a.id)||99)-(fslot.get(b.id)||99));projects.forEach(p=>p.featured=fslot.has(p.id));
  ov.querySelector('.du-sc-head').innerHTML=`<span class="du-sc-kicker">FIRM SHOWCASE${f.discipline?' · '+esc(f.discipline).toUpperCase():''}</span><h1>${f.logo_url?`<img src="${esc(f.logo_url)}" alt="">`:''}${esc(f.name)}</h1><p>${projects.length} project${projects.length===1?'':'s'} on DrawUp${f.website?` · <a href="${esc(f.website)}" target="_blank" rel="noopener">${esc(f.website.replace(/^https?:\/\/(www\.)?/,'').replace(/\/$/,''))} ↗</a>`:''}</p>`;
  const types=[...new Set(projects.map(p=>p.project_type).filter(Boolean))];
  const place=p=>[p.city,p.state&&!/^(US|USA)$/i.test(p.state)?p.state:'',p.country&&!/^(US|USA|United States)$/i.test(p.country)?p.country:''].filter(Boolean).join(', ');
  const tile=p=>`<button type="button" class="du-sc-tile" data-sc-proj="${esc(p.id)}" data-type="${esc(p.project_type||'')}">${p.imgs[0]?`<img src="${esc(p.imgs[0].image_url)}" alt="${esc(p.name)}" loading="lazy">`:`<span class="du-sc-noimg"><b>${esc(String(p.project_type||'Project').toUpperCase())}</b></span>`}<span class="du-sc-cap">${p.featured?'<span class="du-sc-feat">Featured</span>':''}<b>${esc(p.name)}</b><small>${esc([place(p),p.completion_year||p.opened_year].filter(Boolean).join(' · '))}</small><small>${esc(p.role||'')}${p.imgs.length>1?' · '+p.imgs.length+' photos':''}</small></span></button>`;
  const grid=()=>{body.innerHTML=`${types.length>1?`<div class="du-sc-chips"><button type="button" class="on" data-sc-type="">All</button>${types.map(t=>`<button type="button" data-sc-type="${esc(t)}">${esc(t)}</button>`).join('')}</div>`:''}
    ${projects.length?`<div class="du-sc-grid">${projects.map(tile).join('')}</div>`:'<p class="du-sc-empty">No projects are attributed to this firm on DrawUp yet. Firm admins can add projects with photos from Manage this firm.</p>'}
    ${(f.firm_photos||[]).length?`<h2>Firm gallery</h2><div class="du-sc-gallery">${f.firm_photos.slice().sort((a,b)=>a.sort_order-b.sort_order).map((ph,i)=>`<button type="button" data-sc-fphoto="${i}"><img src="${esc(ph.image_url)}" alt="${esc(ph.caption||'')}" loading="lazy">${ph.caption?`<span>${esc(ph.caption)}</span>`:''}</button>`).join('')}</div>`:''}`;
    body.querySelectorAll('[data-sc-type]').forEach(b=>b.onclick=()=>{body.querySelectorAll('[data-sc-type]').forEach(x=>x.classList.toggle('on',x===b));body.querySelectorAll('.du-sc-tile').forEach(t=>t.hidden=!!b.dataset.scType&&t.dataset.type!==b.dataset.scType);});
    body.querySelectorAll('[data-sc-proj]').forEach(b=>b.onclick=()=>detail(projects.find(p=>p.id===b.dataset.scProj)));
    const fp=(f.firm_photos||[]).slice().sort((a,b)=>a.sort_order-b.sort_order);body.querySelectorAll('[data-sc-fphoto]').forEach(b=>b.onclick=()=>lightbox(fp,+b.dataset.scFphoto,f.name));
    ov.scrollTop=0;};
  const detail=p=>{body.innerHTML=`<button type="button" class="du-sc-back">← All projects</button><div class="du-sc-detail"><div class="du-sc-dhead"><span class="du-sc-kicker">${esc(String(p.project_type||'Project').toUpperCase())}${p.role?' · '+esc(p.role.toUpperCase()):''}</span><h2>${esc(p.name)}</h2><p>${esc([place(p),p.status,p.completion_year?'Completed '+p.completion_year:p.opened_year?'Opened '+p.opened_year:''].filter(Boolean).join(' · '))}</p></div>
    ${p.imgs.length?`<div class="du-sc-photos">${p.imgs.map((im,i)=>`<button type="button" data-sc-ph="${i}" class="${i===0?'big':''}"><img src="${esc(im.image_url)}" alt="${esc(im.caption||p.name)}" loading="lazy">${im.caption?`<span>${esc(im.caption)}</span>`:''}</button>`).join('')}</div>`:`<div class="du-sc-nophotos"><b>No photos on DrawUp yet.</b><span>The firm can add several photos at once from Manage this firm → Projects.</span>${p.image_page_url?`<a href="${esc(p.image_page_url)}" target="_blank" rel="noopener">See official project photos ↗</a>`:''}</div>`}
    ${p.description?`<p class="du-sc-desc">${esc(p.description)}</p>`:''}<button type="button" class="du-sc-open">Open full project profile →</button></div>`;
    body.querySelector('.du-sc-back').onclick=grid;body.querySelectorAll('[data-sc-ph]').forEach(b=>b.onclick=()=>lightbox(p.imgs,+b.dataset.scPh,p.name));
    body.querySelector('.du-sc-open').onclick=()=>{close();const inPortal=window.DrawUpPortal?.isSignedIn?.()&&document.getElementById('du-portal')?.classList.contains('open');(inPortal?window.DrawUpPortal.openProject:window.DrawUpLive.openProject)(p.slug);};
    ov.scrollTop=0;};
  grid();
}
function lightbox(list,i,title){
  document.getElementById('du-sc-lb')?.remove();
  document.body.insertAdjacentHTML('beforeend','<div id="du-sc-lb" class="du-sc-lb"><button type="button" class="du-sc-x" aria-label="Close">×</button><button type="button" class="du-sc-nav prev" aria-label="Previous">‹</button><figure><img alt=""><figcaption></figcaption></figure><button type="button" class="du-sc-nav next" aria-label="Next">›</button></div>');
  const lb=document.getElementById('du-sc-lb');const show=()=>{const it=list[i];lb.querySelector('img').src=it.image_url;lb.querySelector('img').alt=it.caption||title;lb.querySelector('figcaption').textContent=[it.caption,(i+1)+' of '+list.length].filter(Boolean).join(' · ');};
  lb.querySelector('.prev').onclick=()=>{i=(i-1+list.length)%list.length;show();};lb.querySelector('.next').onclick=()=>{i=(i+1)%list.length;show();};
  lb.querySelector('.du-sc-x').onclick=()=>lb.remove();lb.onclick=e=>{if(e.target===lb)lb.remove();};show();
}


/* =================================================================== V20: university public profiles */
// A university gets a public profile like a firm: campus projects + photos, firms that worked on
// campus, firms where its alumni work, and timeline posts tagged to the school. One read-only RPC.
const UNI_ALIAS={'mit':['Massachusetts Institute of Technology'],'massachusetts institute of technology':['MIT'],'ucla':['University of California, Los Angeles'],'usc':['University of Southern California'],'vcu':['Virginia Commonwealth University'],'virginia commonwealth university':['VCU'],'virginia tech':['Virginia Polytechnic Institute and State University'],'georgia tech':['Georgia Institute of Technology'],'uc berkeley':['University of California, Berkeley'],'cmu':['Carnegie Mellon University'],'carnegie mellon university':['CMU'],'nyu':['New York University']};
const initials=n=>String(n||'U').split(/\s+/).filter(w=>/^[A-Za-z]/.test(w)&&!/^(of|the|and|at)$/i.test(w)).map(w=>w[0]).slice(0,3).join('').toUpperCase();
async function openUniversity(name,meta,card){
  const c=window.drawupSupabaseClient;if(!c||!name)return false;
  document.getElementById('du-uni')?.remove();
  document.body.insertAdjacentHTML('beforeend',`<div id="du-uni" class="du-sc du-uni" role="dialog" aria-modal="true"><div class="du-sc-top"><button type="button" class="du-sc-x" aria-label="Close profile">×</button><div class="du-sc-head"><span class="du-sc-kicker">DRAWUP UNIVERSITY PROFILE</span><h1><span class="du-uni-mark">${esc(initials(name))}</span>${esc(name)}</h1><p>${esc(meta||'')}</p></div></div><div class="du-sc-body"><p class="du-sc-loading">Loading campus projects, firms and alumni…</p></div></div>`);
  const ov=document.getElementById('du-uni'),body=ov.querySelector('.du-sc-body');document.documentElement.classList.add('du-sc-lock');
  const close=()=>{ov.remove();document.documentElement.classList.remove('du-sc-lock');document.removeEventListener('keydown',onKey);};
  const onKey=e=>{if(e.key==='Escape'){const lb=document.getElementById('du-sc-lb');if(lb)lb.remove();else close();}};document.addEventListener('keydown',onKey);
  ov.querySelector('.du-sc-x').onclick=close;
  const names=[name,...(UNI_ALIAS[name.toLowerCase()]||[])];
  const {data,error}=await c.rpc('drawup_university_profile',{p_names:names});
  if(error){body.innerHTML=`<div class="du-sc-nophotos"><b>University profiles need the v20 database update.</b><span>${esc(/function|schema cache/i.test(error.message)?'Run the v20 university SQL file in Supabase, then reload.':error.message)}</span></div>${legacyBtn()}`;bindLegacy();return true;}
  const d=data||{},projects=d.projects||[],firms=d.firms||[],alum=d.alumni_firms||[],posts=d.posts||[];
  const allPhotos=projects.flatMap(p=>(p.images||[]).map(i=>({image_url:i.url,caption:[p.name,i.caption].filter(Boolean).join(' · ')})));
  const postPhotos=posts.flatMap(p=>(p.images||[]).map(u=>({image_url:u,caption:[p.title||p.author,p.author?'posted by '+p.author:''].filter(Boolean).join(' · ')})));
  const stat=(n,l)=>`<div class="du-fp-stat"><b>${esc(n)}</b><span>${esc(l)}</span></div>`;
  const av=p=>`<span class="du-uni-av" title="${esc(p.name)}">${p.avatar_url?`<img src="${esc(p.avatar_url)}" alt="">`:esc(initials(p.name))}</span>`;
  const when=t=>{try{return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}catch(_e){return '';}};
  function legacyBtn(){return `<p class="du-uni-legacy"><button type="button" class="du-fp-btn" data-uni-legacy>Campus organizations, leadership and Campus Manager tools →</button></p>`;}
  function bindLegacy(){body.querySelectorAll('[data-uni-legacy]').forEach(b=>b.onclick=()=>{close();const pn=document.getElementById('school-profile-name'),pm=document.getElementById('school-profile-meta');if(pn)pn.textContent=name;if(pm)pm.textContent=meta||'';document.getElementById('drawup-school-portal')?.classList.add('open');});}
  body.innerHTML=`<div class="du-fp-bar du-uni-bar"><div class="du-fp-stats">${stat(projects.length,projects.length===1?'Campus project':'Campus projects')}${stat(firms.length,'Firms on campus')}${stat(d.alumni_count||0,'Alumni on DrawUp')}${stat(posts.length,posts.length===1?'Timeline post':'Timeline posts')}</div><div class="du-fp-actions"><button type="button" class="du-fp-btn primary" data-uni-post>Post to this campus timeline</button></div></div>
  <section><h2>Campus projects</h2>${projects.length?`<div class="du-sc-grid">${projects.map((p,i)=>`<button type="button" class="du-sc-tile" data-uni-proj="${i}">${p.images?.[0]?.url?`<img src="${esc(p.images[0].url)}" alt="" loading="lazy">`:'<span class="du-sc-noimg"><b>NO PHOTO YET</b></span>'}<span class="du-sc-cap"><b>${esc(p.name)}</b><small>${esc([p.project_type,[p.city,p.state].filter(Boolean).join(', '),p.year].filter(Boolean).join(' · '))}</small><small>${esc((p.firms||[]).map(f=>f.name).join(' · '))}</small></span></button>`).join('')}</div>
    ${allPhotos.length?`<h3 class="du-uni-sub">Campus photos</h3><div class="du-sc-gallery">${allPhotos.slice(0,24).map((x,i)=>`<button type="button" data-uni-photo="${i}"><img src="${esc(x.image_url)}" alt="" loading="lazy"><span>${esc(x.caption)}</span></button>`).join('')}</div>`:''}`
    :`<div class="du-sc-nophotos"><b>No campus projects on DrawUp yet.</b><span>Firms can tag a project with this campus from Firm → Projects → Campus, and it will show here with its photos.</span></div>`}</section>
  <section><h2>Firms that have worked on campus</h2>${firms.length?`<div class="du-uni-firms">${firms.map(f=>`<button type="button" class="du-uni-firm" data-uni-firm="${esc(f.slug)}"><span class="du-uni-logo">${f.logo_url?`<img src="${esc(f.logo_url)}" alt="">`:esc(initials(f.name))}</span><span><b>${esc(f.name)}</b><small>${f.projects} campus project${f.projects==1?'':'s'}</small></span></button>`).join('')}</div>`:'<p class="meta du-uni-empty">No firms are linked to campus projects yet.</p>'}</section>
  <section><h2>Our alumni work at these firms</h2>${alum.length?`<div class="du-uni-alum">${alum.map(a=>`<div class="du-uni-arow"><div>${a.slug?`<button type="button" class="du-uni-link" data-uni-firm="${esc(a.slug)}">${esc(a.firm)}</button>`:`<b>${esc(a.firm)}</b>`}<small>${a.count} alum${a.count==1?'':'ni'} on DrawUp</small></div><div class="du-uni-people">${(a.people||[]).map(p=>`<button type="button" data-uni-person="${esc(p.id)}">${av(p)}<span>${esc(p.name)}</span></button>`).join('')}</div></div>`).join('')}</div><p class="meta du-uni-note">Built from DrawUp members who list this school in their education and chose to be discoverable. Current workplace comes from their work history.</p>`:'<p class="meta du-uni-empty">No discoverable DrawUp members list this school with a current firm yet.</p>'}</section>
  <section><h2>Campus timeline</h2>${postPhotos.length?`<div class="du-sc-gallery">${postPhotos.slice(0,24).map((x,i)=>`<button type="button" data-uni-pphoto="${i}"><img src="${esc(x.image_url)}" alt="" loading="lazy"><span>${esc(x.caption)}</span></button>`).join('')}</div>`:''}
    ${posts.length?`<div class="du-uni-posts">${posts.slice(0,12).map(p=>`<article class="du-uni-post"><header>${p.author_id?`<button type="button" class="du-uni-link" data-uni-person="${esc(p.author_id)}">${esc(p.author||'DrawUp member')}</button>`:'<b>DrawUp member</b>'}<small>${esc(when(p.created_at))}</small></header>${p.title?`<b>${esc(p.title)}</b>`:''}${p.body?`<p>${esc(p.body)}</p>`:''}</article>`).join('')}</div>`:'<p class="meta du-uni-empty">No timeline posts are tagged with this school yet. Members can tag the school when they post on the Connect timeline.</p>'}</section>
  ${legacyBtn()}`;
  bindLegacy();
  body.querySelectorAll('[data-uni-proj]').forEach(b=>b.onclick=()=>{const p=projects[+b.dataset.uniProj];const imgs=(p.images||[]).map(i=>({image_url:i.url,caption:i.caption}));if(imgs.length)lightbox(imgs,0,p.name);else{close();(window.DrawUpLive?.openProject)?.(p.slug);}});
  body.querySelectorAll('[data-uni-photo]').forEach(b=>b.onclick=()=>lightbox(allPhotos,+b.dataset.uniPhoto,name));
  body.querySelectorAll('[data-uni-pphoto]').forEach(b=>b.onclick=()=>lightbox(postPhotos,+b.dataset.uniPphoto,name));
  const inPortal=()=>window.DrawUpPortal?.isSignedIn?.()&&document.getElementById('du-portal')?.classList.contains('open');
  body.querySelectorAll('[data-uni-firm]').forEach(b=>b.onclick=()=>{close();(inPortal()?window.DrawUpPortal.openFirm:window.DrawUpLive.openFirm)(b.dataset.uniFirm);});
  body.querySelectorAll('[data-uni-person]').forEach(b=>b.onclick=()=>{(window.DrawUpV19?.openPerson)?.(b.dataset.uniPerson);});
  body.querySelector('[data-uni-post]').onclick=()=>{close();if(window.DrawUpConnect?.compose)window.DrawUpConnect.compose({university_name:name});else if(window.DrawUpPortal?.isSignedIn?.()){window.DrawUpPortal.openPortal?.('connect');window.DrawUpPortal.openPortalTab('connect');}else document.getElementById('drawup-signin')?.click();};
  return true;
}
// Replace the old dark campus portal with the profile (the old portal stays reachable from it).
document.addEventListener('click',e=>{const b=e.target.closest('.drawup-school-profile');if(!b||!window.drawupSupabaseClient)return;const card=b.closest('.university-card');const name=(card?.dataset.name||card?.querySelector('h3')?.textContent||'').trim();if(!name)return;e.preventDefault();e.stopImmediatePropagation();openUniversity(name,card?.querySelector('.meta')?.textContent||'',card);},true);
window.DrawUpV20=Object.assign(window.DrawUpV20||{},{coachAsk,guestHeaders,refreshGuestCount,holoLoader,buildMarkup,openShowcase,openUniversity});
})();
