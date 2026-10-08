/* DrawUp v21 Detail Library (Portal tab "details", public #details page, firm profiles).
   - Every detail is its own item with its own drawing: DrawUp typical details are drawn per
     detail (drawup-details-kit-v21.js + drawup-details-catalog-v21.js), never a sheet.
   - Search by keyword, category, material, assembly and source.
   - Details members asked Arch Coach / DrawUp Search for (table detail_finds, filled by the
     server) show as COMMUNITY · AI-FOUND · UNCONFIRMED until an admin reviews them.
   - Firm uploads (details.firm_id) carry the firm name and can appear on the firm profile.
   Requires: drawup-details-kit-v21.js, drawup-details-catalog-v21.js (load before this file). */
(function(){
'use strict';
const CATS=['Wall Sections','Exterior Walls','Roofs','Foundations','Slabs','Doors','Windows','Storefront / Curtain Wall','Stairs','Railings','Restrooms / ADA','Millwork','Interiors','Ceilings','Structural','MEP Coordination','Site','Fire / Life Safety','Typical Details','Custom'];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sb=()=>window.drawupSupabaseClient;
const CAT=()=>window.DrawUpDetailCatalog||[];
const KIT=()=>window.DrawUpDetailKit;
const svgCache=new Map();
function svgOf(d){if(!svgCache.has(d.id))svgCache.set(d.id,KIT().sheet(d));return svgCache.get(d.id);}
const urlOf=d=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgOf(d));
const slug=s=>String(s||'detail').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
const words=s=>String(s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(w=>w.length>1).map(w=>w.replace(/(?<=[a-z]{3})s$/,''));
const STOP=new Set('detail typical the and for with at of a an to in on how do what is drawing section'.split(' '));
const SRC={arch_coach:'Arch Coach',search:'DrawUp Search'};
function toast(m,bad){let t=document.getElementById('du-toast');if(!t){t=document.createElement('div');t.id='du-toast';t.className='du-toast';document.body.appendChild(t);}t.textContent=m;t.dataset.state=bad?'bad':'good';t.classList.add('open');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('open'),bad?6000:2600);}

/* ---------------------------------------------------------------- matching + search */
function hay(d){return (d._hay||(d._hay=words([d.title,d.cat,d.mat,d.asm,d.kw,d.code].join(' ')).join(' ')));}
/** Closest DrawUp typical for a searched detail. Requires a real keyword overlap, not just the category. */
function closestTypical(title,category){
  const q=words(title).filter(w=>!STOP.has(w));if(!q.length)return null;let best=null,bs=0;
  for(const d of CAT()){const h=' '+hay(d)+' ';let s=0;for(const w of q)if(h.includes(' '+w+' '))s+=1;if(s&&d.cat===category)s+=.5;if(s>bs){bs=s;best=d;}}
  return bs>=1.5||(bs>=1&&q.length===1)?best:null;
}
function matches(text,q){const t=' '+words(text).join(' ')+' ';return words(q).filter(w=>!STOP.has(w)).every(w=>t.includes(' '+w)||t.includes(w));}

/* ---------------------------------------------------------------- downloads */
function saveBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);}
function raster(d,scale,type,q){return new Promise((res,rej)=>{const img=new Image(),W=KIT().W,H=KIT().H;img.onload=()=>{const c=document.createElement('canvas');c.width=W*scale;c.height=H*scale;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);c.toBlob(b=>b?res(b):rej(new Error('Could not render image')),type,q);};img.onerror=()=>rej(new Error('Could not render image'));img.src=urlOf(d);});}
/* One-page PDF, 8 x 6 in, so the stated scale prints true (100 px = 1 in). */
async function pdfOf(d){
  const jpg=new Uint8Array(await (await raster(d,3,'image/jpeg',.92)).arrayBuffer()),W=KIT().W*3,H=KIT().H*3,enc=new TextEncoder(),parts=[],offs=[];let len=0;
  const put=x=>{const b=typeof x==='string'?enc.encode(x):x;parts.push(b);len+=b.length;};const obj=(n,body)=>{offs[n]=len;put(`${n} 0 obj\n${body}\nendobj\n`);};
  put('%PDF-1.4\n%âã\n');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 576 432] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  offs[4]=len;put(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);put(jpg);put('\nendstream\nendobj\n');
  const cs='q 576 0 0 432 0 0 cm /Im0 Do Q';obj(5,`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`);
  const x=len;put(`xref\n0 6\n0000000000 65535 f \n${[1,2,3,4,5].map(n=>String(offs[n]).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`);
  return new Blob(parts,{type:'application/pdf'});
}
async function download(d,fmt){
  const base='drawup-typical-'+(d.code||'').toLowerCase()+'-'+slug(d.title);
  try{if(fmt==='svg')saveBlob(new Blob([svgOf(d)],{type:'image/svg+xml'}),base+'.svg');else if(fmt==='png')saveBlob(await raster(d,2,'image/png'),base+'.png');else saveBlob(await pdfOf(d),base+'.pdf');}
  catch(e){toast('Download failed: '+(e.message||e),true);}
}

/* ---------------------------------------------------------------- data */
const state={finds:[],uploads:[],mine:[],admin:false,user:null,loaded:false};
async function loadData(){
  const c=sb();if(!c)return;
  const u=await c.auth.getSession().then(x=>x.data.session?.user||null,()=>null);state.user=u&&!u.is_anonymous?u:null;
  const sel='id,title,category,description,status,visibility,preview_url,material,assembly,firm_id,show_on_firm,owner_id,created_at,firms(name,slug),detail_assets(id,file_name,file_ext,public_url)';
  const [f,up,mine,adm]=await Promise.all([
    c.from('detail_finds').select('id,title,category,first_query,sources,sources_seen,hits,status,created_at,last_seen_at').order('last_seen_at',{ascending:false}).limit(300).then(x=>x.data||[],()=>[]),
    c.from('details').select(sel).eq('status','published').order('created_at',{ascending:false}).limit(200).then(x=>x.data||[],()=>[]),
    state.user?c.from('details').select(sel).eq('owner_id',state.user.id).order('created_at',{ascending:false}).limit(100).then(x=>x.data||[],()=>[]):[],
    state.user?c.rpc('is_drawup_admin').then(x=>x.data===true,()=>false):false]);
  state.finds=f;state.mine=mine;state.admin=adm;
  const seen=new Set();state.uploads=[...up,...mine].filter(d=>!seen.has(d.id)&&(seen.add(d.id),true));state.loaded=true;
}

/* ---------------------------------------------------------------- cards */
const thumb=(d,alt)=>`<div class="dd21-thumb"><img src="${urlOf(d)}" alt="${esc(alt||d.title)}" loading="lazy" decoding="async"></div>`;
function typicalCard(d){return `<article class="dd21-card" data-kind="typical" data-id="${esc(d.id)}" data-cat="${esc(d.cat)}">${thumb(d)}<div class="dd21-body"><span class="dd21-kick">DRAWUP TYPICAL · ${esc(d.code)} · ${esc(d.cat)}</span><h3>${esc(d.title)}</h3><p class="dd21-meta">${esc(d.mat)} · ${esc(d.asm)} · ${esc(d.scale)}</p>
  <div class="dd21-acts"><button type="button" class="dd21-open" data-open="${esc(d.id)}">Open</button><button type="button" data-dl="svg" data-id="${esc(d.id)}">SVG</button><button type="button" data-dl="png" data-id="${esc(d.id)}">PNG</button><button type="button" data-dl="pdf" data-id="${esc(d.id)}">PDF</button></div></div></article>`;}
function findCard(f){const t=closestTypical(f.title,f.category),src=(f.sources||[]).slice(0,3),via=(f.sources_seen||[]).map(s=>SRC[s]||s).join(' + ');
  return `<article class="dd21-card dd21-find" data-kind="find" data-id="${esc(f.id)}" data-cat="${esc(f.category)}">${t?`<div class="dd21-thumb"><img src="${urlOf(t)}" alt="${esc('Closest DrawUp typical: '+t.title)}" loading="lazy" decoding="async"><span class="dd21-badge">Closest typical: ${esc(t.code)}</span></div>`:`<div class="dd21-thumb dd21-pending"><b>${esc(f.category)}</b><span>No DrawUp typical drawn for this yet</span></div>`}
  <div class="dd21-body"><span class="dd21-kick dd21-ai">COMMUNITY · AI-FOUND · ${f.status==='reviewed'?'REVIEWED':'UNCONFIRMED'}</span><h3>${esc(f.title)}</h3><p class="dd21-meta">${esc(f.category)} · asked ${f.hits||1}× via ${esc(via||'search')} · ${esc(new Date(f.last_seen_at||f.created_at).toLocaleDateString())}</p>
  ${src.length?`<ul class="dd21-src">${src.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title||s.url)}</a></li>`).join('')}</ul>`:'<p class="dd21-note">No cited public source saved yet.</p>'}
  <div class="dd21-acts"><button type="button" class="dd21-open" data-open-find="${esc(f.id)}">Open</button>${t?`<button type="button" data-dl="svg" data-id="${esc(t.id)}">Typical SVG</button>`:''}${state.admin?`<button type="button" data-review="${esc(f.id)}" data-to="${f.status==='reviewed'?'unconfirmed':'reviewed'}">${f.status==='reviewed'?'Unreview':'Mark reviewed'}</button><button type="button" data-review="${esc(f.id)}" data-to="hidden">Hide</button>`:''}</div></div></article>`;}
function uploadCard(d){const a=d.detail_assets||[],img=d.preview_url||a.find(x=>/^(png|jpe?g|webp|svg)$/i.test(x.file_ext||''))?.public_url,firm=d.firms?.name;
  return `<article class="dd21-card" data-kind="upload" data-id="${esc(d.id)}" data-cat="${esc(d.category)}"><div class="dd21-thumb${img?'':' dd21-pending'}">${img?`<img src="${esc(img)}" alt="${esc(d.title)}" loading="lazy">`:`<b>${esc((a[0]?.file_ext||'FILE').toUpperCase())}</b><span>${a.length} file${a.length===1?'':'s'}</span>`}</div>
  <div class="dd21-body"><span class="dd21-kick ${firm?'dd21-firm':''}">${firm?esc(firm)+' · FIRM DETAIL':'MEMBER UPLOAD'} · ${esc(d.category)}${d.status!=='published'?' · '+esc(String(d.status).toUpperCase()):''}</span><h3>${esc(d.title)}</h3>${d.description?`<p class="dd21-meta">${esc(d.description)}</p>`:''}${firm?`<p class="dd21-note">Uploaded by ${esc(firm)}${d.show_on_firm?' · shown on the firm profile':''}.</p>`:''}
  <div class="dd21-acts">${a.filter(x=>x.public_url).map(x=>`<a href="${esc(x.public_url)}" target="_blank" rel="noopener" download>${esc((x.file_ext||'file').toUpperCase())} · ${esc(x.file_name)}</a>`).join('')||'<span class="dd21-note">No files</span>'}</div></div></article>`;}

/* ---------------------------------------------------------------- viewer */
function viewer(d,find){
  document.getElementById('dd21-view')?.remove();
  const t=d,src=find?.sources||[];
  document.body.insertAdjacentHTML('beforeend',`<div id="dd21-view" class="dd21-view" role="dialog" aria-modal="true" aria-label="${esc(find?find.title:t.title)}"><div class="dd21-vcard">
    <button type="button" class="dd21-x" aria-label="Close">×</button>
    <div class="dd21-vimg"><img src="${urlOf(t)}" alt="${esc(t.title)}"></div>
    <aside class="dd21-vside">${find?`<span class="dd21-kick dd21-ai">COMMUNITY · AI-FOUND · ${find.status==='reviewed'?'REVIEWED':'UNCONFIRMED'}</span><h2>${esc(find.title)}</h2><p class="dd21-meta">${esc(find.category)} · asked ${find.hits||1}× via ${esc((find.sources_seen||[]).map(s=>SRC[s]||s).join(' + '))}</p>
      <p class="dd21-note">Members searched for this detail in Arch Coach / DrawUp Search. It is not reviewed by DrawUp yet. The drawing shown is DrawUp's closest typical (<b>${esc(t.code)} ${esc(t.title)}</b>), not a drawing taken from the cited sources.</p>
      ${src.length?`<h4>Public sources the answer cited</h4><ul class="dd21-src">${src.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title||s.url)}</a></li>`).join('')}</ul>`:''}`
      :`<span class="dd21-kick">DRAWUP TYPICAL · ${esc(t.code)} · ${esc(t.cat)}</span><h2>${esc(t.title)}</h2>`}
      <dl class="dd21-dl"><dt>Category</dt><dd>${esc(t.cat)}</dd><dt>Material</dt><dd>${esc(t.mat)}</dd><dt>Assembly</dt><dd>${esc(t.asm)}</dd><dt>Scale</dt><dd>${esc(t.scale)} (true on the PDF, 8 x 6 in)</dd></dl>
      <p class="dd21-warn">Typical learning content drawn by DrawUp. Not for construction and not the work of any firm. A licensed professional must adapt and verify it for the project, its code and the AHJ.</p>
      <div class="dd21-acts dd21-big"><button type="button" data-dl="svg" data-id="${esc(t.id)}">Download SVG</button><button type="button" data-dl="png" data-id="${esc(t.id)}">Download PNG</button><button type="button" data-dl="pdf" data-id="${esc(t.id)}">Download PDF</button><button type="button" data-full="${esc(t.id)}">Open full size</button></div>
      ${window.DrawUpPortal?.isSignedIn?.()?`<button type="button" class="dd21-ask" data-ask="${esc(find?find.title:t.title)}">Ask Arch Coach about this detail</button>`:''}
    </aside></div></div>`);
  const v=document.getElementById('dd21-view');const close=()=>{v.remove();document.removeEventListener('keydown',key);};const key=e=>{if(e.key==='Escape')close();};
  v.querySelector('.dd21-x').onclick=close;v.onclick=e=>{if(e.target===v)close();};document.addEventListener('keydown',key);bindActs(v);v.querySelector('.dd21-x').focus();
}
function bindActs(root){
  root.querySelectorAll('[data-dl]').forEach(b=>b.onclick=e=>{e.stopPropagation();const d=CAT().find(x=>x.id===b.dataset.id);if(d)download(d,b.dataset.dl);});
  root.querySelectorAll('[data-full]').forEach(b=>b.onclick=()=>{const d=CAT().find(x=>x.id===b.dataset.full);if(d)window.open(URL.createObjectURL(new Blob([svgOf(d)],{type:'image/svg+xml'})),'_blank','noopener');});
  root.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{const d=CAT().find(x=>x.id===b.dataset.open);if(d)viewer(d);});
  root.querySelectorAll('[data-open-find]').forEach(b=>b.onclick=()=>{const f=state.finds.find(x=>x.id===b.dataset.openFind);if(!f)return;const t=closestTypical(f.title,f.category);if(t)viewer(t,f);else openFindNoDrawing(f);});
  root.querySelectorAll('[data-ask]').forEach(b=>b.onclick=()=>{document.getElementById('dd21-view')?.remove();askCoach(b.dataset.ask);});
  root.querySelectorAll('[data-review]').forEach(b=>b.onclick=async()=>{const {error}=await sb().from('detail_finds').update({status:b.dataset.to,updated_at:new Date().toISOString()}).eq('id',b.dataset.review);if(error)return toast(error.message,true);toast('Saved.');await loadData();rerender();});
}
function openFindNoDrawing(f){document.getElementById('dd21-view')?.remove();const src=f.sources||[];
  document.body.insertAdjacentHTML('beforeend',`<div id="dd21-view" class="dd21-view" role="dialog" aria-modal="true"><div class="dd21-vcard dd21-narrow"><button type="button" class="dd21-x" aria-label="Close">×</button><aside class="dd21-vside"><span class="dd21-kick dd21-ai">COMMUNITY · AI-FOUND · UNCONFIRMED</span><h2>${esc(f.title)}</h2><p class="dd21-meta">${esc(f.category)} · asked ${f.hits||1}×</p><p class="dd21-note">DrawUp has not drawn a typical for this detail yet. It is in the queue because members asked for it.</p>${src.length?`<h4>Public sources the answer cited</h4><ul class="dd21-src">${src.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title||s.url)}</a></li>`).join('')}</ul>`:''}${window.DrawUpPortal?.isSignedIn?.()?`<button type="button" class="dd21-ask" data-ask="${esc(f.title)}">Ask Arch Coach about this detail</button>`:''}</aside></div></div>`);
  const v=document.getElementById('dd21-view');v.querySelector('.dd21-x').onclick=()=>v.remove();v.onclick=e=>{if(e.target===v)v.remove();};bindActs(v);}
function askCoach(title){const P=window.DrawUpPortal;if(!P?.isSignedIn?.())return;P.openPortalTab('arch-coach');setTimeout(()=>{const i=document.querySelector('#du-workspace-content textarea, #du-workspace-content input[type=text]');if(i){i.value='Explain the typical '+title+': layers, flashing / sealant order, and what must be verified for my project.';i.focus();}},500);}

/* ---------------------------------------------------------------- library page */
let host=null,ui={q:'',cat:'',mat:'',asm:'',src:''};
try{const s=JSON.parse(localStorage.getItem('dd21-filter')||'null');if(s&&typeof s==='object')ui={...ui,...s,q:''};}catch(e){}
function filtered(){
  const q=ui.q.trim(),inCat=c=>!ui.cat||c===ui.cat,mat=m=>!ui.mat||String(m||'').toLowerCase().includes(ui.mat.toLowerCase()),asm=a=>!ui.asm||String(a||'').toLowerCase()===ui.asm.toLowerCase();
  const typ=ui.src&&ui.src!=='typical'?[]:CAT().filter(d=>inCat(d.cat)&&mat(d.mat)&&asm(d.asm)&&(!q||matches(hay(d),q)));
  const fin=ui.src&&ui.src!=='find'||ui.mat||ui.asm?[]:state.finds.filter(f=>f.status!=='hidden'&&inCat(f.category)&&(!q||matches([f.title,f.category,f.first_query].join(' '),q)));
  const upl=ui.src&&ui.src!=='upload'?[]:state.uploads.filter(d=>inCat(d.category)&&mat(d.material)&&asm(d.assembly)&&(!q||matches([d.title,d.category,d.description,d.material,d.assembly,d.firms?.name].join(' '),q)));
  return {typ,fin,upl};
}
function counts(){const n={};CAT().forEach(d=>n[d.cat]=(n[d.cat]||0)+1);state.finds.forEach(f=>n[f.category]=(n[f.category]||0)+1);state.uploads.forEach(d=>n[d.category]=(n[d.category]||0)+1);return n;}
function rerender(){const g=host&&host.isConnected&&host.querySelector('#dd21-results');if(!g)return;const {typ,fin,upl}=filtered(),total=typ.length+fin.length+upl.length;
  try{localStorage.setItem('dd21-filter',JSON.stringify({cat:ui.cat,mat:ui.mat,asm:ui.asm,src:ui.src}));}catch(e){}
  host.querySelector('#dd21-count').textContent=`${total} detail${total===1?'':'s'}${ui.q?` for “${ui.q}”`:''}${ui.cat?' in '+ui.cat:''}`;
  const sec=(k,t,sub,list,fn)=>list.length?`<section class="dd21-sec" data-sec="${k}"><div class="dd21-sechead"><h2>${t} <small>${list.length}</small></h2><p>${sub}</p></div><div class="dd21-grid">${list.map(fn).join('')}</div></section>`:'';
  g.innerHTML=(sec('typical','DrawUp typical details','One detail per drawing, drawn by DrawUp at a stated scale. Learning content: adapt and verify with a licensed professional.',typ,typicalCard)
    +sec('find','Asked in Arch Coach + Search','Details members searched for. Recorded automatically, de-duplicated, with the public sources the answer cited. Unconfirmed until reviewed.',fin,findCard)
    +sec('upload','Firm + member uploads','Uploaded by firms and members with their own files. Firm details show the firm that uploaded them.',upl,uploadCard))
    ||`<div class="dd21-empty"><h3>No details match.</h3><p>Try another word or category${state.user?', or ask Arch Coach: what you ask for gets added here.':'.'}</p></div>`;
  host.querySelectorAll('.dd21-chips button').forEach(b=>b.classList.toggle('on',b.dataset.cat===ui.cat));bindActs(g);
}
function opts(list,cur){return list.map(x=>`<option value="${esc(x)}"${x===cur?' selected':''}>${esc(x)}</option>`).join('');}
function shell(publicPage){
  const n=counts(),mats=[...new Set(CAT().map(d=>d.mat).concat(state.uploads.map(d=>d.material)).filter(Boolean).flatMap(m=>String(m).split(/\s*\/\s*/)))].sort(),asms=[...new Set(CAT().map(d=>d.asm).concat(state.uploads.map(d=>d.assembly)).filter(Boolean))].sort();
  return `<div class="dd21">
  <div class="dd21-head"><div><span class="dd21-kick">DRAWUP DETAILS</span><h1>Detail Library</h1><p>Individual construction details, each with its own drawing. Search by category, material, assembly or keyword. What members ask Arch Coach and DrawUp Search for is added here automatically.</p></div>
  ${publicPage?'':`<div class="dd21-headacts"><button type="button" class="du-btn ghost" id="dd21-up-firm">Upload to firm</button><button type="button" class="du-btn primary" id="dd21-up">Upload detail</button></div>`}</div>
  <p class="dd21-disc"><b>Typical details are learning content.</b> They are drawn by DrawUp, are not the work of any firm, and must be adapted and verified by a licensed professional for the project, the adopted code and the AHJ.</p>
  <div class="dd21-filters" role="search"><input id="dd21-q" type="search" placeholder="Search details: parapet, storefront sill, grab bar…" value="${esc(ui.q)}" aria-label="Search details">
    <select id="dd21-mat" aria-label="Material"><option value="">Any material</option>${opts(mats,ui.mat)}</select><select id="dd21-asm" aria-label="Assembly"><option value="">Any assembly</option>${opts(asms,ui.asm)}</select>
    <select id="dd21-src" aria-label="Source"><option value="">All sources</option><option value="typical"${ui.src==='typical'?' selected':''}>DrawUp typical</option><option value="find"${ui.src==='find'?' selected':''}>Asked in Coach + Search</option><option value="upload"${ui.src==='upload'?' selected':''}>Firm + member uploads</option></select></div>
  <div class="dd21-chips" role="tablist"><button type="button" data-cat="">All</button>${CATS.map(c=>`<button type="button" data-cat="${esc(c)}">${esc(c)}${n[c]?` <span>${n[c]}</span>`:''}</button>`).join('')}</div>
  <p class="dd21-count" id="dd21-count" aria-live="polite"></p><div id="dd21-results"></div></div>`;
}
function bindShell(publicPage){
  let t;host.querySelector('#dd21-q').oninput=e=>{clearTimeout(t);t=setTimeout(()=>{ui.q=e.target.value;rerender();},120);};
  host.querySelector('#dd21-mat').onchange=e=>{ui.mat=e.target.value;rerender();};host.querySelector('#dd21-asm').onchange=e=>{ui.asm=e.target.value;rerender();};host.querySelector('#dd21-src').onchange=e=>{ui.src=e.target.value;rerender();};
  host.querySelectorAll('.dd21-chips button').forEach(b=>b.onclick=()=>{ui.cat=b.dataset.cat;rerender();});
  if(!publicPage){host.querySelector('#dd21-up').onclick=()=>upload('drawup');host.querySelector('#dd21-up-firm').onclick=()=>upload('firm');}
}
async function render(w,publicPage){
  host=w;w.innerHTML='<div class="du-loading">DRAWING IT UP…</div>';
  if(!CAT().length||!KIT()){w.innerHTML='<p class="dd21-empty">The detail drawings did not load. Refresh the page.</p>';return;}
  await loadData().catch(()=>{});if(host!==w)return;
  w.innerHTML=shell(publicPage);bindShell(publicPage);rerender();(window.DrawUpDetailTabs||[]).forEach(f=>{try{f(w,{publicPage})}catch(e){console.warn(e)}});
}

/* ---------------------------------------------------------------- uploads (firm + member) */
async function upload(scope){
  const c=sb(),u=state.user;if(!u)return toast('Sign in to upload details.',true);
  const firms=await c.rpc('drawup_my_firms').then(x=>Array.isArray(x.data)?x.data:[],()=>[]);
  if(scope==='firm'&&!firms.length)return toast('You are not listed as a member of a firm on DrawUp yet. Ask your firm admin to add you, or claim your firm.',true);
  if(scope==='drawup'){const [{data:career},{data:prof}]=await Promise.all([c.from('career_timeline').select('start_date,end_date').eq('user_id',u.id),c.from('profiles').select('credentials,profile_verified').eq('id',u.id).maybeSingle()]);
    const yrs=(career||[]).reduce((s,r)=>s+Math.max(0,((r.end_date?new Date(r.end_date):new Date())-new Date(r.start_date||Date.now()))/3.15576e10),0);
    if(!(yrs>=5||(prof?.credentials||[]).length||prof?.profile_verified))return toast('Publishing to DrawUp Details needs 5+ years of recorded experience or a professional credential on your profile. You can still upload to your firm.',true);}
  document.getElementById('dd21-view')?.remove();
  document.body.insertAdjacentHTML('beforeend',`<div id="dd21-view" class="dd21-view" role="dialog" aria-modal="true"><div class="dd21-vcard dd21-narrow"><button type="button" class="dd21-x" aria-label="Close">×</button><aside class="dd21-vside dd21-form">
    <span class="dd21-kick">${scope==='firm'?'FIRM DETAIL':'DRAWUP DETAILS'}</span><h2>${scope==='firm'?'Upload a detail to your firm':'Submit a detail for review'}</h2>
    <p class="dd21-note">Upload each detail as its own file or image (PDF, PNG, JPG, SVG, DWG, DXF, RVT). Do not upload whole sheets.</p>
    ${scope==='firm'?`<label>Firm<select id="dd21-firm">${firms.map(f=>`<option value="${esc(f.id)}" data-role="${esc(f.role)}">${esc(f.name)}${f.role==='admin'?' (admin)':''}</option>`).join('')}</select></label><label class="dd21-chk"><input type="checkbox" id="dd21-show"> Show on our public firm profile <small>(firm admins only)</small></label>`:''}
    <label>Title<input id="dd21-t" maxlength="140" required></label><label>Category<select id="dd21-c">${CATS.map(x=>`<option>${esc(x)}</option>`).join('')}</select></label>
    <label>Material<input id="dd21-m" maxlength="60" placeholder="e.g. Masonry, Aluminum"></label><label>Assembly<input id="dd21-a" maxlength="60" placeholder="e.g. Roof edge, Window sill"></label>
    <label>Description<textarea id="dd21-d" maxlength="600"></textarea></label><label>Files<input id="dd21-f" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.dwg,.dxf,.rvt,.rfa"></label>
    <button type="button" class="du-btn primary" id="dd21-save">${scope==='firm'?'Add to firm library':'Submit for review'}</button><p class="dd21-note" id="dd21-st" aria-live="polite"></p></aside></div></div>`);
  const v=document.getElementById('dd21-view'),$=s=>v.querySelector(s);$('.dd21-x').onclick=()=>v.remove();
  const sync=()=>{const o=$('#dd21-firm')?.selectedOptions[0];if(o&&$('#dd21-show')){$('#dd21-show').disabled=o.dataset.role!=='admin';if(o.dataset.role!=='admin')$('#dd21-show').checked=false;}};$('#dd21-firm')&&($('#dd21-firm').onchange=sync);sync();
  $('#dd21-save').onclick=async()=>{const st=$('#dd21-st'),title=$('#dd21-t').value.trim(),files=[...$('#dd21-f').files];if(!title)return st.textContent='Title is required.';if(!files.length)return st.textContent='Choose at least one file.';
    $('#dd21-save').disabled=true;st.textContent='Saving…';
    try{const firm=scope==='firm'?firms.find(f=>f.id===$('#dd21-firm').value):null;
      const row={owner_id:u.id,title,category:$('#dd21-c').value,description:$('#dd21-d').value.trim()||null,material:$('#dd21-m').value.trim()||null,assembly:$('#dd21-a').value.trim()||null,visibility:firm?'firm':'drawup',status:firm?'published':'submitted',firm_id:firm?.id||null,firm_name:firm?.name||null,show_on_firm:!!(firm&&$('#dd21-show')?.checked)};
      const {data:d,error}=await c.from('details').insert(row).select().single();if(error)throw error;const failed=[];
      for(const f of files){const ext=(f.name.split('.').pop()||'file').toLowerCase(),path=`${u.id}/${d.id}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;st.textContent='Uploading '+f.name+'…';
        const up=await c.storage.from('drawup-files').upload(path,f,{upsert:false});if(up.error){failed.push(f.name+': '+up.error.message);continue;}
        const url=c.storage.from('drawup-files').getPublicUrl(path).data.publicUrl;const a=await c.from('detail_assets').insert({detail_id:d.id,owner_id:u.id,file_name:f.name,file_ext:ext,storage_path:path,public_url:url,file_size:f.size});if(a.error)failed.push(f.name+': '+a.error.message);
        if(!d.preview_url&&/^(png|jpe?g|webp|svg)$/.test(ext)){d.preview_url=url;await c.from('details').update({preview_url:url}).eq('id',d.id);}}
      if(failed.length)throw new Error('Detail saved, but some files failed: '+failed.join('; '));
      v.remove();toast(firm?'Added to '+firm.name+(row.show_on_firm?' and shown on the firm profile.':' library.'):'Submitted to DrawUp Details for review.');await loadData();rerender();
    }catch(e){st.textContent=e.message||String(e);$('#dd21-save').disabled=false;}};
}

/* ---------------------------------------------------------------- firm profile section */
async function firmSection(root){
  const slugv=root.dataset.firm;if(!slugv||root.querySelector('.dd21-fp'))return;const pane=root.querySelector('[data-fp-pane="overview"]')||root;
  const mark=document.createElement('section');mark.className='dd21-fp';mark.hidden=true;pane.appendChild(mark);
  const c=sb();if(!c)return;const {data:f}=await c.from('firms').select('id,name,slug').eq('slug',slugv).maybeSingle();if(!f)return;
  const [{data:list},adm]=await Promise.all([c.from('details').select('id,title,category,description,preview_url,show_on_firm,status,detail_assets(id,file_name,file_ext,public_url)').eq('firm_id',f.id).eq('show_on_firm',true).eq('status','published').order('created_at',{ascending:false}).limit(24),c.rpc('is_firm_admin',{target_firm_id:f.id}).then(x=>x.data===true,()=>false)]);
  if(!(list||[]).length&&!adm)return;
  mark.innerHTML=`<div class="du-fp-sechead"><h2>Details by ${esc(f.name)}</h2><span class="meta">Uploaded by the firm${(list||[]).length?' · '+list.length:''}</span></div>${(list||[]).length?`<div class="dd21-fpgrid">${list.map(d=>{const a=d.detail_assets||[],img=d.preview_url||a.find(x=>/^(png|jpe?g|webp|svg)$/i.test(x.file_ext||''))?.public_url;
    return `<article class="dd21-fpcard">${img?`<img src="${esc(img)}" alt="${esc(d.title)}" loading="lazy">`:`<div class="dd21-fpfile">${esc((a[0]?.file_ext||'FILE').toUpperCase())}</div>`}<div><small>${esc(d.category)} · ${esc(f.name)}</small><h3>${esc(d.title)}</h3>${a.filter(x=>x.public_url).map(x=>`<a href="${esc(x.public_url)}" target="_blank" rel="noopener" download>${esc((x.file_ext||'file').toUpperCase())} · ${esc(x.file_name)}</a>`).join(' ')}</div></article>`;}).join('')}</div>`:`<p class="meta">Firm admins: upload details from the Detail Library (Upload to firm) and tick “Show on our public firm profile”.</p>`}`;
  mark.hidden=false;
}
new MutationObserver(()=>{document.querySelectorAll('.du-fp[data-firm]').forEach(r=>{if(!r.querySelector('.dd21-fp'))firmSection(r).catch(()=>{});});}).observe(document.documentElement,{childList:true,subtree:true});

/* ---------------------------------------------------------------- wiring */
function register(n=0){const P=window.DrawUpPortal;if(P?.registerTab){P.registerTab('details',w=>render(w,false));return;}if(n<60)setTimeout(()=>register(n+1),100);}
register();
/* Public #details page: replace the static placeholder cards with the live library. */
function hydratePublic(){const pg=document.getElementById('page-details');if(!pg||pg.dataset.dd21)return;const box=pg.querySelector('.wrap .detail-grid')?.parentElement;if(!box)return;pg.dataset.dd21='1';pg.querySelector('.page-head')?.setAttribute('hidden','');const w=document.createElement('div');w.className='wrap dd21-public';box.replaceWith(w);render(w,true);}
function watchPublic(){const pg=document.getElementById('page-details');if(!pg)return;const go=()=>{if(!pg.hidden)hydratePublic();};go();new MutationObserver(go).observe(pg,{attributes:true,attributeFilter:['hidden','class','style']});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watchPublic);else watchPublic();

window.DrawUpDetails={render,closestTypical,download,svgOf,urlOf,viewer:id=>{const d=CAT().find(x=>x.id===id);if(d)viewer(d);},reload:async()=>{await loadData();rerender();},state};
})();
