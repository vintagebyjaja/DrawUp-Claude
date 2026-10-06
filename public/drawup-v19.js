/* DrawUp V19
 *
 * - DrawUp Search: the portal transition (warp tunnel) covers the time the web research
 *   takes, then opens a full research page (answer, facts, results, sources) with the
 *   firms and places on DrawUp that relate to it. Used on the public site and in the Portal.
 * - Portal Firm tab: firm admins manage their firm (details, offices, projects, photos, team).
 * - Discover People: real member profiles with a profile view; "My Profile" works.
 * - Onboarding / profile: home office finder from the firm directory.
 * - Arch Coach: links in answers are clickable.
 */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function db(){for(let i=0;i<100;i++){if(window.drawupSupabaseClient)return window.drawupSupabaseClient;await sleep(100);}return null;}
const US=new Set(['US','USA','United States','United States of America']);
const domainOf=u=>{try{return new URL(u).hostname.replace(/^www\./,'');}catch(_e){return '';}};
const safeUrl=u=>/^https?:\/\//i.test(String(u||''))?String(u):'';
function linkify(text){
  return esc(text).replace(/\[([^\]]{1,200})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:)\]])/g,(m,label,u1,u2)=>{const u=(u1||u2).replace(/&amp;/g,'&');return `<a href="${esc(u)}" target="_blank" rel="noopener">${label?label:esc(domainOf(u)+(u.replace(/^https?:\/\/[^/]+/,'').length>1?u.replace(/^https?:\/\/[^/]+/,'').slice(0,48)+(u.replace(/^https?:\/\/[^/]+/,'').length>48?'…':''):''))}</a>`;});
}
function uuid(){return (crypto.randomUUID&&crypto.randomUUID())||(Date.now().toString(16)+Math.random().toString(16).slice(2)).padEnd(32,'0').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*/,'$1-$2-4$3-a$4-$5').slice(0,36);}

/* =================================================================== research */
const Research={
  async run(query,type,onTick){
    const t0=Date.now();
    const res=await fetch('/api/project-research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,type:type||'all'})});
    let data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data?.error||'Web research is unavailable right now.');
    if(data.result)return data.result;
    if(!data.id)throw new Error('Web research did not start.');
    while(Date.now()-t0<240000){
      await sleep(2500);onTick&&onTick(Math.round((Date.now()-t0)/1000));
      const r=await fetch('/api/project-research?id='+encodeURIComponent(data.id),{cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(d.result)return d.result;
      if(!r.ok)throw new Error(d?.error||'Web research failed.');
    }
    throw new Error('Research is taking too long. Try again in a moment.');
  },
  cityOf(loc){const parts=String(loc||'').split(',').map(x=>x.trim()).filter(Boolean);for(let i=1;i<parts.length;i++){if(/^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/.test(parts[i])||/^(Alabama|Alaska|Arizona|California|Colorado|Florida|Georgia|Illinois|Maryland|Massachusetts|Michigan|New York|North Carolina|South Carolina|Ohio|Pennsylvania|Tennessee|Texas|Virginia|Washington)$/i.test(parts[i]))return {city:parts[i-1].replace(/^\d+\s.*$/,''),state:parts[i].slice(0,2).toUpperCase()};}const first=parts.find(p=>!/\d/.test(p));return first?{city:first,state:''}:null;},
  names(r){return [r.architect,r.engineers,r.contractor,r.owner].filter(Boolean).join(';').split(/;|,|\/|\band\b|\(|\)|\+/i).map(x=>x.replace(/\b(structural|mep|civil|joint venture|jv|architect|engineer(s)?|general contractor|landscape|interiors?)\b/gi,'').trim()).filter(x=>x.length>2&&x.length<60);},
  async related(r,query){
    const c=await db();if(!c)return {credited:[],nearby:[],projects:[],firms:[]};
    const out={credited:[],nearby:[],projects:[],firms:[],place:null};
    const seen=new Set();
    const tasks=Research.names(r).slice(0,8).map(n=>c.rpc('drawup_search',{q:n,kind:'firms',max_rows:3}).then(({data})=>{(data?.firms||[]).forEach(f=>{const a=f.name.toLowerCase(),b=n.toLowerCase();if((a.includes(b)||b.includes(a))&&!seen.has(f.slug)){seen.add(f.slug);out.credited.push({...f,as:n});}});},()=>{}));
    tasks.push(c.rpc('drawup_search',{q:query,kind:'all',max_rows:8}).then(({data})=>{out.projects=data?.projects||[];out.firms=(data?.firms||[]).filter(f=>!seen.has(f.slug));},()=>{}));
    const place=Research.cityOf(r.location);out.place=place;
    if(place?.city){let q=c.from('firm_offices').select('city,state,is_headquarters,firms!inner(slug,name,is_demo,is_verified)').ilike('city',place.city).eq('firms.is_demo',false).limit(40);if(place.state)q=q.ilike('state',place.state);
      tasks.push(q.then(({data})=>{const s2=new Set();out.nearby=(data||[]).filter(o=>o.firms&&!s2.has(o.firms.slug)&&s2.add(o.firms.slug)).map(o=>({...o.firms,hq:o.is_headquarters,city:o.city,state:o.state}));},()=>{}));}
    await Promise.all(tasks);return out;
  }
};

/* The portal transition: the existing DrawUp warp tunnel, raised above the Portal. */
const Tunnel={
  timer:null,
  open(q){const t=$('drawup-v12-tunnel');if(!t)return;t.classList.add('open','du-v19-front');const card=t.querySelector('.v12-tunnel-card');
    if(card&&!$('v19-tunnel-rel')){card.insertAdjacentHTML('beforeend','<div id="v19-tunnel-rel" class="v19-tunnel-rel"></div><div class="v19-tunnel-clock" id="v19-tunnel-clock"></div><button type="button" class="v19-tunnel-cancel" id="v19-tunnel-cancel">Cancel</button>');}
    $('v12-tunnel-query').textContent=q;$('v12-tunnel-route').textContent='Opening the DrawUp portal…';$('v19-tunnel-rel').innerHTML='';$('v19-tunnel-clock').textContent='';
    const S=['SEARCHING DRAWUP','OPENING THE PORTAL','SCANNING PUBLIC SOURCES','READING PROJECT PAGES','MATCHING FIRMS + LOCATIONS','CHECKING SOURCES','DRAWING IT UP'];let i=0;$('v12-tunnel-status').textContent=S[0];
    clearInterval(this.timer);const t0=Date.now();this.timer=setInterval(()=>{i++;$('v12-tunnel-status').textContent=S[Math.min(i,S.length-1)];const s=Math.round((Date.now()-t0)/1000);$('v19-tunnel-clock').textContent=s+'s · DrawUp is reading real sources so the answer is worth the wait';},1600);
    return new Promise(res=>{$('v19-tunnel-cancel').onclick=()=>{this.close();res('cancel');};this._cancel=res;});
  },
  relations(list,label){const el=$('v19-tunnel-rel');if(!el||!list.length)return;el.innerHTML=`<span>${esc(label)}</span>`+list.slice(0,6).map(x=>`<b>${esc(x)}</b>`).join('');},
  route(text){const el=$('v12-tunnel-route');if(el)el.textContent=text;},
  close(){clearInterval(this.timer);const t=$('drawup-v12-tunnel');if(t)t.classList.remove('open','du-v19-front');}
};

function sourceCard(s){const o=Array.isArray(s)?{title:s[0],url:s[1],summary:s[2],image:s[3],publisher:s[4]}:(s||{});const url=safeUrl(o.url||o.href||o.link);if(!url)return '';
  const img=safeUrl(o.image||o.image_url||o.thumbnail);
  return `<article class="du-rs-source">${img?`<a class="du-rs-source-img" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(img)}" alt="" loading="lazy" onerror="this.parentNode.remove()"></a>`:''}<div><span class="du-rs-pub">${esc(o.publisher||domainOf(url))}</span><h4>${esc(o.title||domainOf(url))}</h4>${o.summary?`<p>${esc(o.summary)}</p>`:''}<a class="du-rs-link" href="${esc(url)}" target="_blank" rel="noopener">View source ↗</a></div></article>`;}
function firmChip(f,sub){return `<button type="button" class="du-rs-firm" data-firm-slug="${esc(f.slug)}"><b>${esc(f.name)}</b><small>${esc(sub||f.locations||'')}</small></button>`;}
function linkNames(text,credited){let h=esc(text);credited.forEach(f=>{const n=esc(f.as||f.name);if(n&&h.includes(n))h=h.replace(n,`<a href="#" class="du-rs-inline" data-firm-slug="${esc(f.slug)}">${n}</a>`);});return h;}
function pageHTML(r,q,rel,opts={}){
  rel=rel||{credited:[],nearby:[],projects:[],firms:[]};
  const fields=[['Designed by',r.architect],['Engineered by',r.engineers],['Built by',r.contractor],['Owner / developer',r.owner],['Opened',r.opened],['Completed',r.completed],['Area',r.area],['Cost',r.cost],['Capacity',r.capacity]].filter(x=>x[1]);
  const hero=safeUrl(r.image||r.image_url||r.hero_image);
  const items=Array.isArray(r.items)?r.items.filter(x=>x&&(x.title||x.summary)):[];
  const sources=(Array.isArray(r.sources)?r.sources:[]).map(sourceCard).filter(Boolean);
  const place=rel.place&&rel.place.city?[rel.place.city,rel.place.state].filter(Boolean).join(', '):'';
  let h=`<div class="du-rs">${opts.head===false?'':`<header class="du-rs-head"><button type="button" class="du-rs-back" data-rs-back>← Back to DrawUp</button><span class="du-rs-kicker">DRAWUP PROJECT PORTAL</span><h1>${esc(r.title||q)}</h1><p>${esc([r.type,r.location].filter(Boolean).join(' · '))}</p></header>`}<div class="du-rs-body">`;
  if(rel.projects?.length)h+=`<section class="du-rs-ondrawup"><h2>On DrawUp</h2><div class="du-rs-proj">${rel.projects.map(p=>`<button type="button" class="du-rs-projcard" data-project-slug="${esc(p.slug)}">${p.image_url?`<img src="${esc(p.image_url)}" alt="">`:''}<b>${esc(p.name)}</b><small>${esc([p.city,p.state].filter(Boolean).join(', '))}${p.project_type?' · '+esc(p.project_type):''}</small><span>Open DrawUp profile →</span></button>`).join('')}</div></section>`;
  if(hero)h+=`<figure class="du-rs-hero"><img src="${esc(hero)}" alt="${esc(r.title||q)}" onerror="this.parentNode.remove()"><figcaption>Image from the sources below</figcaption></figure>`;
  if(r.summary)h+=`<section><h2>About</h2><p>${esc(r.summary)}</p></section>`;
  if(r.answer&&r.answer!==r.summary)h+=`<section><h2>DrawUp answer</h2><p>${esc(r.answer)}</p></section>`;
  if(fields.length)h+=`<section><h2>Project facts</h2><div class="du-rs-facts">${fields.map(x=>`<div><span>${esc(x[0])}</span><b>${linkNames(x[1],rel.credited)}</b></div>`).join('')}</div></section>`;
  if(r.story&&r.story!==r.summary)h+=`<section><h2>Project story</h2><p>${esc(r.story)}</p></section>`;
  if(Array.isArray(r.design_highlights)&&r.design_highlights.filter(Boolean).length)h+=`<section><h2>Design highlights</h2><ul>${r.design_highlights.filter(Boolean).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`;
  if(items.length)h+=`<section><h2>Results</h2><div class="du-rs-items">${items.map(x=>`<article><span class="du-rs-pub">${esc(x.subtitle||'')}</span><h4>${esc(x.title||'Result')}</h4>${x.summary?`<p>${esc(x.summary)}</p>`:''}${safeUrl(x.url)?`<a class="du-rs-link" href="${esc(x.url)}" target="_blank" rel="noopener">Open source ↗</a>`:''}</article>`).join('')}</div></section>`;
  if(rel.credited.length||rel.nearby.length||rel.firms?.length){h+=`<section class="du-rs-related"><h2>Related on DrawUp</h2>`;
    if(rel.credited.length)h+=`<h3>Firms named in this research</h3><div class="du-rs-firms">${rel.credited.map(f=>firmChip(f,'Named as '+(f.as||f.name))).join('')}</div>`;
    if(rel.nearby.length)h+=`<h3>DrawUp firms with offices in ${esc(place)}</h3><div class="du-rs-firms">${rel.nearby.slice(0,12).map(f=>firmChip(f,(f.hq?'Headquarters · ':'Office · ')+[f.city,f.state].filter(Boolean).join(', '))).join('')}</div>`;
    else if(place)h+=`<p class="du-rs-muted">No DrawUp firms list an office in ${esc(place)} yet.</p>`;
    if(rel.firms?.length)h+=`<h3>Other DrawUp matches</h3><div class="du-rs-firms">${rel.firms.slice(0,8).map(f=>firmChip(f)).join('')}</div>`;
    h+='</section>';}
  if(sources.length)h+=`<section><h2>Sources</h2><div class="du-rs-sources">${sources.join('')}</div></section>`;
  else h+=`<section><h2>Sources</h2><p class="du-rs-muted">No sources came back with this answer, so treat it as unconfirmed.</p></section>`;
  h+=`<p class="du-rs-label">Web research by DrawUp from public sources. It is not added to the DrawUp database; check the sources before relying on it.</p><div class="du-rs-actions"><button type="button" class="du-rs-btn" data-rs-coach>Ask Arch Coach about this</button><button type="button" class="du-rs-btn ghost" data-rs-again>New search</button></div></div></div>`;
  return h;
}
function bindPage(root,{openFirm,openProject,back,again,coach}){
  root.querySelectorAll('[data-firm-slug]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openFirm(a.dataset.firmSlug);},true));
  root.querySelectorAll('[data-project-slug]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openProject(a.dataset.projectSlug);},true));
  root.querySelectorAll('[data-rs-back]').forEach(b=>b.onclick=back);root.querySelectorAll('[data-rs-again]').forEach(b=>b.onclick=again);root.querySelectorAll('[data-rs-coach]').forEach(b=>b.onclick=coach);
}
async function searchFlow(q,type,{onDb}={}){
  const c=await db();
  const quick=c?c.rpc('drawup_search',{q,kind:'all',max_rows:6}).then(({data})=>data||{},()=>({})):Promise.resolve({});
  quick.then(d=>{const names=[...(d.projects||[]).map(p=>p.name),...(d.firms||[]).map(f=>f.name)];if(names.length)Tunnel.relations(names,'Possible relations on DrawUp');onDb&&onDb(d);});
  const r=await Research.run(q,type,s=>{if(s>20)Tunnel.route('Still reading sources… DrawUp keeps searching until it has a real answer.');});
  if(r?.location)Tunnel.route('Routing to '+r.location+'…');
  const rel=await Research.related(r,q);
  if(rel.credited.length||rel.nearby.length)Tunnel.relations([...rel.credited.map(f=>f.name),...rel.nearby.map(f=>f.name)],rel.place?.city?'Connecting firms near '+rel.place.city:'Connecting DrawUp firms');
  await sleep(900);
  return {r,rel};
}

/* Public site search: DrawUp records + web research behind the portal transition. */
async function publicSearch(q,type){
  const portal=$('drawup-v12-portal');if(!portal)return false;
  const cancelled=Tunnel.open(q);let done=false;
  try{
    const out=await Promise.race([searchFlow(q,type),cancelled.then(()=>null)]);if(!out)return true;
    Tunnel.close();done=true;
    $('v12-result-title').textContent=out.r.title||q;$('v12-result-sub').textContent=[out.r.type,out.r.location].filter(Boolean).join(' · ');
    const body=$('v12-result-body');body.innerHTML=pageHTML(out.r,q,out.rel,{head:false});portal.classList.add('open');portal.scrollTop=0;
    bindPage(body,{openFirm:s=>{portal.classList.remove('open');window.DrawUpLive?.openFirm(s);},openProject:s=>{portal.classList.remove('open');window.DrawUpLive?.openProject(s);},back:()=>portal.classList.remove('open'),again:()=>{portal.classList.remove('open');$('drawup-search-input')?.focus();},coach:()=>{portal.classList.remove('open');document.querySelector('[data-page=coach]')?.click();const i=$('arch-coach-input');if(i)i.value='Tell me about '+(out.r.title||q);}});
  }catch(e){
    Tunnel.close();done=true;
    let d={};try{d=await window.DrawUpLive.searchDb(q,'all');}catch(_e){}
    $('v12-result-title').textContent='DrawUp search: '+q;$('v12-result-sub').textContent='';
    const body=$('v12-result-body');body.innerHTML=pageHTML({title:q,summary:'',sources:[]},q,{credited:[],nearby:[],projects:d.projects||[],firms:d.firms||[]},{head:false}).replace('<div class="du-rs-body">',`<div class="du-rs-body"><section class="du-rs-error"><h2>Web research could not finish</h2><p>${esc(e.message||e)}</p><button type="button" class="du-rs-btn" data-rs-retry>Try again</button></section>`);
    portal.classList.add('open');body.querySelector('[data-rs-retry]').onclick=()=>{portal.classList.remove('open');publicSearch(q,type);};
    bindPage(body,{openFirm:s=>{portal.classList.remove('open');window.DrawUpLive?.openFirm(s);},openProject:s=>{portal.classList.remove('open');window.DrawUpLive?.openProject(s);},back:()=>portal.classList.remove('open'),again:()=>portal.classList.remove('open'),coach:()=>{portal.classList.remove('open');document.querySelector('[data-page=coach]')?.click();}});
  }finally{if(!done)Tunnel.close();}
  return true;
}
window.DrawUpV19={publicSearch,Research,pageHTML,linkify,openPerson};

/* =================================================================== portal tabs */
async function whenPortal(){for(let i=0;i<100;i++){if(window.DrawUpPortal?.registerTab)return window.DrawUpPortal;await sleep(100);}return null;}
whenPortal().then(P=>{if(!P)return;
  P.registerTab('search',async(w,c,initial)=>{
    w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">DRAWUP SEARCH</span><h1>What are you drawing up?</h1><p>Search a project, building, firm, city or question. DrawUp checks its own database, researches public sources, and connects what it finds to firms and places on DrawUp.</p></div></div><div class="du-search-stage"><div class="du-search-holo"><div class="du-holo-model"><i></i><i></i><i></i><b>DU</b></div></div><form id="du-v19-search" class="du-search-box"><input id="du-v19-q" type="search" placeholder="Try: SoFi Stadium · KEi Architects · stadium architects in Charlotte" autocomplete="off"><button class="du-btn primary">Search DrawUp →</button></form><div class="du-search-types">${[['all','All'],['projects','Projects'],['firms','Firms']].map((k,i)=>`<button type="button" data-kind="${k[0]}" class="${i?'':'active'}">${k[1]}</button>`).join('')}</div></div><div id="du-v19-results"></div>`;
    let kind='all';const f=w.querySelector('#du-v19-search'),qi=w.querySelector('#du-v19-q'),out=w.querySelector('#du-v19-results');
    w.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{kind=b.dataset.kind;w.querySelectorAll('[data-kind]').forEach(x=>x.classList.toggle('active',x===b));});
    const open=(slug,proj)=>proj?P.openProject(slug):P.openFirm(slug);
    f.onsubmit=async e=>{e.preventDefault();const q=qi.value.trim();if(!q)return;
      const cancelled=Tunnel.open(q);let dbHits=null;
      try{
        const res=await Promise.race([searchFlow(q,kind,{onDb:d=>dbHits=d}),cancelled.then(()=>null)]);
        Tunnel.close();if(!res){out.innerHTML='';return;}
        out.innerHTML=pageHTML(res.r,q,res.rel);
        bindPage(out,{openFirm:s=>open(s),openProject:s=>open(s,true),back:()=>{out.innerHTML='';qi.focus();},again:()=>{out.innerHTML='';qi.value='';qi.focus();w.scrollIntoView({block:'start'});},coach:()=>{try{sessionStorage.setItem('du-coach-prefill','Tell me about '+(res.r.title||q));}catch(_e){}P.openPortalTab('arch-coach');}});
        out.scrollIntoView({behavior:'smooth',block:'start'});
      }catch(err){Tunnel.close();
        const d=dbHits||{};out.innerHTML=pageHTML({title:q,sources:[]},q,{credited:[],nearby:[],projects:d.projects||[],firms:d.firms||[]}).replace('<div class="du-rs-body">',`<div class="du-rs-body"><section class="du-rs-error"><h2>Web research could not finish</h2><p>${esc(err.message||err)}</p><button type="button" class="du-rs-btn" data-rs-retry>Try again</button></section>`);
        out.querySelector('[data-rs-retry]').onclick=()=>f.requestSubmit();
        bindPage(out,{openFirm:s=>open(s),openProject:s=>open(s,true),back:()=>{out.innerHTML='';},again:()=>{out.innerHTML='';qi.focus();},coach:()=>P.openPortalTab('arch-coach')});}
    };
    if(initial){qi.value=initial;f.requestSubmit();}
  });
  P.registerTab('firm',renderFirmTab);
});

/* =================================================================== firm admin */
const STATUS_OPTS=['Completed','Under construction','In design','Proposed','Open; renovation planned'];
async function uploadPublic(c,file,folder){
  if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw new Error('Use a JPG, PNG or WebP image.');
  if(file.size>12*1024*1024)throw new Error('Image is larger than 12 MB.');
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg',path=`${c.user.id}/${folder}/${uuid()}.${ext}`;
  const up=await c.client.storage.from('drawup-files').upload(path,file,{contentType:file.type});if(up.error)throw up.error;
  return c.client.storage.from('drawup-files').getPublicUrl(path).data.publicUrl;
}
const fld=(label,id,val,extra='')=>`<div class="du-field"><label>${label}</label><input id="${id}" value="${esc(val??'')}" ${extra}></div>`;
async function renderFirmTab(w,c){
  const P=window.DrawUpPortal;
  const {data:mine}=await c.client.rpc('drawup_my_firms');
  const admin=(mine||[]).filter(x=>x.role==='admin');
  if(!admin.length){await P.renderFirmBase(w);w.insertAdjacentHTML('beforeend',`<article class="du-glass du-v19-note"><span class="du-kicker">FIRM ADMIN</span><p>Firm admins can add projects, photos, offices and team credits for their firm. Ask your firm's admin on DrawUp, or DrawUp HQ, to make you one.</p></article>`);return;}
  let want='';try{want=sessionStorage.getItem('du-manage-firm')||'';sessionStorage.removeItem('du-manage-firm');}catch(_e){}
  const params=new URLSearchParams((location.hash.split('?')[1])||'');
  const firmSlug=params.get('firm')||want||admin[0].slug,pane=params.get('pane')||'details';
  const firm=admin.find(f=>f.slug===firmSlug)||admin[0];
  const go=(p,extra)=>{history.replaceState(null,'','#portal/firm?firm='+encodeURIComponent(firm.slug)+'&pane='+p+(extra||''));P.openPortalTab('firm');};
  w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">FIRM ADMIN</span><h1>${esc(firm.name)}</h1><p>You are an admin of this firm on DrawUp. Changes show on the public firm profile right away.</p></div><div class="du-head-actions">${admin.length>1?`<select id="fa-switch">${admin.map(f=>`<option value="${esc(f.slug)}" ${f.slug===firm.slug?'selected':''}>${esc(f.name)}</option>`).join('')}</select>`:''}<button class="du-btn ghost" id="fa-view">View public profile</button></div></div>
  <div class="du-subtabs du-hq-tabs">${[['details','Firm details'],['offices','Offices'],['projects','Projects'],['library','Library + team']].map(([k,l])=>`<button type="button" data-fa-pane="${k}" class="${k===pane?'active':''}">${l}</button>`).join('')}</div><div id="fa-body"><div class="du-loading">LOADING…</div></div>`;
  w.querySelectorAll('[data-fa-pane]').forEach(b=>b.onclick=()=>go(b.dataset.faPane));
  w.querySelector('#fa-view').onclick=()=>P.openFirm(firm.slug);
  const sw=w.querySelector('#fa-switch');if(sw)sw.onchange=()=>{history.replaceState(null,'','#portal/firm?firm='+encodeURIComponent(sw.value));P.openPortalTab('firm');};
  const body=w.querySelector('#fa-body');
  if(pane==='library'){await P.renderFirmBase(body);return;}
  if(pane==='details')return firmDetails(body,c,firm.id,go);
  if(pane==='offices')return firmOffices(body,c,firm.id,go);
  if(pane==='projects'){const edit=params.get('edit');return edit?projectEditor(body,c,firm,edit,go):firmProjects(body,c,firm,go);}
}
async function firmDetails(body,c,id,go){
  const [{data:f,error},{data:photos}]=await Promise.all([c.client.from('firms').select('*').eq('id',id).single(),c.client.from('firm_photos').select('*').eq('firm_id',id).order('sort_order')]);if(error)throw error;
  body.innerHTML=`<article class="du-glass"><h2>Firm details</h2><div class="du-two">${fld('Firm name','fa-name',f.name)}${fld('Website','fa-web',f.website,'placeholder="https://"')}</div>
  <div class="du-two"><div class="du-field"><label>Discipline</label><select id="fa-disc">${['','Architecture','Engineering','Construction','Interior Design','Landscape','Planning','Multidisciplinary'].map(x=>`<option${(f.discipline||'')===x?' selected':''}>${x}</option>`).join('')}</select></div>${fld('Founded (year)','fa-founded',f.founded_year,'inputmode="numeric"')}</div>
  <div class="du-field"><label>About the firm</label><textarea id="fa-desc" rows="5">${esc(f.description||'')}</textarea></div>
  <div class="du-two"><div class="du-field"><label>Logo</label>${f.logo_url?`<img class="du-hq-thumb" src="${esc(f.logo_url)}" alt="">`:''}<input type="file" id="fa-logo" accept="image/jpeg,image/png,image/webp"></div><div class="du-field"><label>Cover image</label>${f.hero_image_url?`<img class="du-hq-thumb" src="${esc(f.hero_image_url)}" alt="">`:''}<input type="file" id="fa-hero" accept="image/jpeg,image/png,image/webp"></div></div>
  <p class="du-muted">Verification, the profile address and the plan are set by DrawUp HQ.</p><p><button class="du-btn primary" id="fa-save">Save details</button> <span id="fa-st" class="du-save-status"></span></p></article>
  <article class="du-glass"><h2>Firm photos</h2><div class="du-hq-photos">${(photos||[]).map(p=>`<figure><img src="${esc(p.image_url)}" alt=""><figcaption>${esc(p.caption||'')} <button class="du-btn ghost" data-del-photo="${p.id}">Remove</button></figcaption></figure>`).join('')||'<p class="du-muted">No photos yet.</p>'}</div><div class="du-two"><div class="du-field"><label>Add photo</label><input type="file" id="fa-photo" accept="image/jpeg,image/png,image/webp"></div>${fld('Caption / photo credit','fa-cap','','placeholder="Photo: photographer name"')}</div><button class="du-btn ghost" id="fa-addphoto">Upload photo</button></article>`;
  body.querySelector('#fa-save').onclick=async()=>{const st=body.querySelector('#fa-st');st.textContent=' Saving…';try{const name=body.querySelector('#fa-name').value.trim();if(!name)throw new Error('Firm name is required.');const yr=parseInt(body.querySelector('#fa-founded').value,10);const web=body.querySelector('#fa-web').value.trim();
    const row={name,website:web?(/^https?:\/\//i.test(web)?web:'https://'+web):null,discipline:body.querySelector('#fa-disc').value||null,founded_year:yr>1700&&yr<2100?yr:null,description:body.querySelector('#fa-desc').value.trim()||null,updated_at:new Date().toISOString()};
    const lf=body.querySelector('#fa-logo').files[0],hf=body.querySelector('#fa-hero').files[0];if(lf)row.logo_url=await uploadPublic(c,lf,'firm/'+id);if(hf)row.hero_image_url=await uploadPublic(c,hf,'firm/'+id);
    const {error}=await c.client.from('firms').update(row).eq('id',id).select('id').single();if(error)throw error;c.toast('Firm details saved.');go('details');}catch(e){st.textContent=' Not saved — '+(e.message||e);}};
  body.querySelector('#fa-addphoto').onclick=async()=>{try{const file=body.querySelector('#fa-photo').files[0];if(!file)throw new Error('Choose a photo.');const url=await uploadPublic(c,file,'firm/'+id);const {error}=await c.client.from('firm_photos').insert({firm_id:id,image_url:url,caption:body.querySelector('#fa-cap').value.trim()||null,sort_order:(photos||[]).length});if(error)throw error;c.toast('Photo added.');go('details');}catch(e){c.toast(e.message||String(e),true);}};
  body.querySelectorAll('[data-del-photo]').forEach(b=>b.onclick=async()=>{const {error}=await c.client.from('firm_photos').delete().eq('id',b.dataset.delPhoto);if(error){c.toast(error.message,true);return;}go('details');});
}
async function firmOffices(body,c,id,go){
  const {data:offices,error}=await c.client.from('firm_offices').select('*').eq('firm_id',id).order('is_headquarters',{ascending:false}).order('state').order('city');if(error)throw error;
  const tag=o=>o.source==='member_reported'&&!o.is_confirmed?'Reported by a member':o.source==='public_research'&&!o.is_confirmed?'Unconfirmed (public sources)':o.is_confirmed?'Confirmed':'';
  body.innerHTML=`<article class="du-glass"><h2>Offices</h2><p class="du-muted">Members who list your firm in their work history add their office automatically. Confirm the real ones and remove any that are wrong.</p>${(offices||[]).map(o=>`<div class="du-row"><div><b>${esc([o.city,o.state,US.has(o.country)?'':o.country].filter(Boolean).join(', '))}</b><small>${o.is_headquarters?'Headquarters · ':''}${esc(tag(o))}${o.address?' · '+esc(o.address):''}${o.phone?' · '+esc(o.phone):''}</small></div><div>${o.is_confirmed?'':`<button class="du-btn ghost" data-confirm="${o.id}">Confirm</button> `}${o.is_headquarters?'':`<button class="du-btn ghost" data-hq="${o.id}">Make HQ</button> `}<button class="du-btn ghost" data-edit-office="${o.id}">Edit</button> <button class="du-btn ghost" data-del-office="${o.id}">Remove</button></div></div>`).join('')||'<p class="du-muted">No offices yet.</p>'}</article>
  <article class="du-glass" id="fa-office-form"><h2>Add an office</h2><div class="du-two">${fld('City','fo-city','')}${fld('State / region','fo-state','','placeholder="VA"')}</div><div class="du-two">${fld('Country','fo-country','US')}${fld('Phone','fo-phone','')}</div>${fld('Street address','fo-address','')}<label><input type="checkbox" id="fo-hq"> Headquarters</label><p><button class="du-btn primary" id="fo-save">Add office</button></p></article>`;
  const form=body.querySelector('#fa-office-form');let editing=null;
  body.querySelectorAll('[data-edit-office]').forEach(b=>b.onclick=()=>{const o=offices.find(x=>x.id===b.dataset.editOffice);editing=o.id;form.querySelector('h2').textContent='Edit office';['city','state','country','phone','address'].forEach(k=>form.querySelector('#fo-'+k).value=o[k]||'');form.querySelector('#fo-hq').checked=o.is_headquarters;form.querySelector('#fo-save').textContent='Save office';form.scrollIntoView({behavior:'smooth'});});
  form.querySelector('#fo-save').onclick=async()=>{const city=form.querySelector('#fo-city').value.trim();if(!city){c.toast('City is required.',true);return;}const hq=form.querySelector('#fo-hq').checked;
    const row={firm_id:id,city,state:form.querySelector('#fo-state').value.trim()||null,country:form.querySelector('#fo-country').value.trim()||'US',phone:form.querySelector('#fo-phone').value.trim()||null,address:form.querySelector('#fo-address').value.trim()||null,is_headquarters:hq,is_confirmed:true,source:'firm_admin'};
    if(hq){const r=await c.client.from('firm_offices').update({is_headquarters:false}).eq('firm_id',id).eq('is_headquarters',true);if(r.error){c.toast(r.error.message,true);return;}}
    const {error}=editing?await c.client.from('firm_offices').update(row).eq('id',editing):await c.client.from('firm_offices').insert(row);if(error){c.toast(error.message,true);return;}c.toast('Office saved.');go('offices');};
  body.querySelectorAll('[data-confirm]').forEach(b=>b.onclick=async()=>{const {error}=await c.client.from('firm_offices').update({is_confirmed:true}).eq('id',b.dataset.confirm);if(error){c.toast(error.message,true);return;}go('offices');});
  body.querySelectorAll('[data-hq]').forEach(b=>b.onclick=async()=>{const r1=await c.client.from('firm_offices').update({is_headquarters:false}).eq('firm_id',id).eq('is_headquarters',true);const r2=await c.client.from('firm_offices').update({is_headquarters:true,is_confirmed:true}).eq('id',b.dataset.hq);if(r1.error||r2.error){c.toast((r1.error||r2.error).message,true);return;}go('offices');});
  body.querySelectorAll('[data-del-office]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this office from your firm profile?'))return;const {error}=await c.client.from('firm_offices').delete().eq('id',b.dataset.delOffice);if(error){c.toast(error.message,true);return;}go('offices');});
}
async function firmProjects(body,c,firm,go){
  const {data,error}=await c.client.from('project_firms').select('role,provenance,aec_projects(id,slug,name,city,state,country,project_type,completion_year,created_by,project_images(id))').eq('firm_id',firm.id);if(error)throw error;
  const rows=(data||[]).filter(x=>x.aec_projects);
  body.innerHTML=`<article class="du-glass"><div class="du-section-title"><h2>Projects credited to ${esc(firm.name)}</h2></div>${rows.map(x=>{const p=x.aec_projects;return `<div class="du-row"><div><b>${esc(p.name)}</b><small>${esc([p.city,p.state].filter(Boolean).join(', '))}${p.project_type?' · '+esc(p.project_type):''}${p.completion_year?' · '+p.completion_year:''} · ${esc(x.role)} · ${(p.project_images||[]).length} photo${(p.project_images||[]).length===1?'':'s'}</small></div><div><button class="du-btn ghost" data-open-proj="${esc(p.slug)}">View</button> <button class="du-btn primary" data-edit-proj="${p.id}">Edit</button></div></div>`;}).join('')||'<p class="du-muted">No projects yet. Add your first one below.</p>'}</article>
  <article class="du-glass"><h2>Add a project</h2><div class="du-two">${fld('Project name','np-name','')}${fld('Your firm\'s role','np-role','Architecture','placeholder="Architecture, Interiors, Structural engineering…"')}</div><div class="du-two">${fld('City','np-city','')}${fld('State / region','np-state','')}</div><div class="du-two">${fld('Project type','np-type','','placeholder="Higher education, Healthcare, Arena…"')}${fld('Completion year','np-year','','inputmode="numeric"')}</div><div class="du-field"><label>Status</label><select id="np-status">${STATUS_OPTS.map(s=>`<option>${s}</option>`).join('')}</select></div><div class="du-field"><label>Description</label><textarea id="np-desc" rows="3"></textarea></div><p><button class="du-btn primary" id="np-save">Add project</button> <span id="np-st" class="du-save-status"></span></p></article>`;
  body.querySelectorAll('[data-open-proj]').forEach(b=>b.onclick=()=>window.DrawUpPortal.openProject(b.dataset.openProj));
  body.querySelectorAll('[data-edit-proj]').forEach(b=>b.onclick=()=>go('projects','&edit='+b.dataset.editProj));
  body.querySelector('#np-save').onclick=async()=>{const st=body.querySelector('#np-st');const v=id=>body.querySelector(id).value.trim();if(!v('#np-name')){st.textContent=' Project name is required.';return;}st.textContent=' Adding…';
    const {data:r,error:e}=await c.client.rpc('drawup_firm_create_project',{p_firm_id:firm.id,p_name:v('#np-name'),p_role:v('#np-role')||'Architecture',p_city:v('#np-city')||null,p_state:v('#np-state')||null,p_country:'US',p_project_type:v('#np-type')||null,p_completion_year:parseInt(v('#np-year'),10)||null,p_status:v('#np-status')||null,p_description:v('#np-desc')||null});
    if(e){st.textContent=' Not added — '+e.message;return;}c.toast('Project added. Add photos and the team next.');go('projects','&edit='+r.id);};
}
async function projectEditor(body,c,firm,id,go){
  const [{data:p,error},{data:imgs},{data:team},{data:srcs}]=await Promise.all([c.client.from('aec_projects').select('*').eq('id',id).single(),c.client.from('project_images').select('*').eq('project_id',id).order('sort_order'),c.client.from('project_firms').select('id,role,provenance,firm_id,firms(name,slug)').eq('project_id',id),c.client.from('project_sources').select('*').eq('project_id',id)]);
  if(error)throw error;
  body.innerHTML=`<article class="du-glass"><span class="du-kicker">EDIT PROJECT</span><h2>${esc(p.name)}</h2><div class="du-two">${fld('Name','pe-name',p.name)}${fld('Street address','pe-address',p.street_address)}</div>
  <div class="du-two">${fld('City','pe-city',p.city)}${fld('State / region','pe-state',p.state)}</div><div class="du-two">${fld('Country','pe-country',p.country||'US')}${fld('Project type','pe-type',p.project_type)}</div>
  <div class="du-two"><div class="du-field"><label>Status</label><select id="pe-status">${[...new Set([p.status,...STATUS_OPTS].filter(Boolean))].map(s=>`<option${s===p.status?' selected':''}>${esc(s)}</option>`).join('')}</select></div>${fld('Owner / client','pe-owner',p.owner_name)}</div>
  <div class="du-two">${fld('Opened (year)','pe-opened',p.opened_year,'inputmode="numeric"')}${fld('Completed (year)','pe-year',p.completion_year,'inputmode="numeric"')}</div>
  <div class="du-two">${fld('Cost','pe-cost',p.cost_text,'placeholder="$192.5 million"')}${fld('Capacity','pe-cap',p.capacity_text)}</div><div class="du-two">${fld('Size','pe-size',p.size_text,'placeholder="780,000 sq ft"')}${fld('Official photo page','pe-imgpage',p.image_page_url,'placeholder="https://"')}</div>
  <div class="du-field"><label>Description</label><textarea id="pe-desc" rows="5">${esc(p.description||'')}</textarea></div>
  <div class="du-field"><label>Key facts <small>one per line</small></label><textarea id="pe-facts" rows="4">${esc((Array.isArray(p.key_facts)?p.key_facts:[]).join('\n'))}</textarea></div>
  <p><button class="du-btn primary" id="pe-save">Save project</button> <button class="du-btn ghost" id="pe-back">Back to projects</button> <button class="du-btn ghost" id="pe-view">View profile</button>${p.created_by===c.user.id?' <button class="du-btn ghost" id="pe-del">Delete project</button>':''} <span id="pe-st" class="du-save-status"></span></p></article>
  <article class="du-glass"><h2>Photos</h2><p class="du-muted">Upload photos your firm has the right to share, and credit the photographer.</p><div class="du-hq-photos">${(imgs||[]).map(i=>`<figure><img src="${esc(i.image_url)}" alt=""><figcaption>${i.is_hero?'<b>COVER</b> ':''}${esc(i.caption||'')} ${i.is_hero?'':`<button class="du-btn ghost" data-hero="${i.id}">Make cover</button>`} <button class="du-btn ghost" data-del-img="${i.id}">Remove</button></figcaption></figure>`).join('')||'<p class="du-muted">No photos yet.</p>'}</div><div class="du-two"><div class="du-field"><label>Add photo</label><input type="file" id="pe-img" accept="image/jpeg,image/png,image/webp" multiple></div>${fld('Caption / photo credit','pe-capt','','placeholder="Photo: photographer name"')}</div><button class="du-btn ghost" id="pe-addimg">Upload photos</button></article>
  <article class="du-glass"><h2>Project team</h2>${(team||[]).map(t=>`<div class="du-row"><div><b>${esc(t.firms?.name||'')}</b><small>${esc(t.role)} · ${esc(String(t.provenance).replace('_',' '))}</small></div><button class="du-btn ghost" data-del-team="${t.id}">Remove</button></div>`).join('')||'<p class="du-muted">No firms linked yet.</p>'}
  <div class="du-two"><div class="du-field"><label>Firm (from the DrawUp directory)</label><input id="pe-firm" list="pe-firm-list" autocomplete="off"><datalist id="pe-firm-list"></datalist></div>${fld('Role','pe-role','','placeholder="Structural engineer, General contractor…"')}</div><button class="du-btn ghost" id="pe-addteam">Add to team</button><p class="du-muted">Firm not listed? Use “Add a firm” on the Connect page and DrawUp reviews it.</p></article>
  <article class="du-glass"><h2>Sources</h2>${(srcs||[]).map(s=>`<div class="du-row"><div><b>${esc(s.source_name)}</b><small>${esc(s.source_url)}</small></div><button class="du-btn ghost" data-del-src="${s.id}">Remove</button></div>`).join('')||'<p class="du-muted">No sources yet.</p>'}<div class="du-two">${fld('Source name','pe-sname','','placeholder="HOK project page"')}${fld('Link','pe-surl','','placeholder="https://"')}</div><button class="du-btn ghost" id="pe-addsrc">Add source</button></article>`;
  const v=s=>body.querySelector(s).value.trim(),num=s=>parseInt(v(s),10)||null;
  body.querySelector('#pe-back').onclick=()=>go('projects');body.querySelector('#pe-view').onclick=()=>window.DrawUpPortal.openProject(p.slug);
  body.querySelector('#pe-save').onclick=async()=>{const st=body.querySelector('#pe-st');st.textContent=' Saving…';if(!v('#pe-name')){st.textContent=' Name is required.';return;}
    const row={name:v('#pe-name'),street_address:v('#pe-address')||null,city:v('#pe-city')||null,state:v('#pe-state')||null,country:v('#pe-country')||'US',project_type:v('#pe-type')||null,status:v('#pe-status')||null,owner_name:v('#pe-owner')||null,opened_year:num('#pe-opened'),completion_year:num('#pe-year'),cost_text:v('#pe-cost')||null,capacity_text:v('#pe-cap')||null,size_text:v('#pe-size')||null,image_page_url:safeUrl(v('#pe-imgpage'))||null,description:v('#pe-desc')||null,key_facts:v('#pe-facts').split('\n').map(x=>x.trim()).filter(Boolean),updated_at:new Date().toISOString()};
    const {error}=await c.client.from('aec_projects').update(row).eq('id',id).select('id').single();if(error){st.textContent=' Not saved — '+error.message;return;}c.toast('Project saved.');go('projects','&edit='+id);};
  const del=body.querySelector('#pe-del');if(del)del.onclick=async()=>{if(!confirm('Delete this project, its photos and credits?'))return;const {error}=await c.client.rpc('drawup_firm_delete_project',{p_project_id:id});if(error){c.toast(error.message,true);return;}go('projects');};
  body.querySelector('#pe-addimg').onclick=async()=>{const files=[...body.querySelector('#pe-img').files];if(!files.length){c.toast('Choose a photo.',true);return;}try{let n=(imgs||[]).length;for(const f of files){const url=await uploadPublic(c,f,'project/'+id);const {error}=await c.client.from('project_images').insert({project_id:id,image_url:url,caption:v('#pe-capt')||null,is_hero:n===0,sort_order:n});if(error)throw error;n++;}c.toast('Photos added.');go('projects','&edit='+id);}catch(e){c.toast(e.message||String(e),true);}};
  body.querySelectorAll('[data-del-img]').forEach(b=>b.onclick=async()=>{const {error}=await c.client.from('project_images').delete().eq('id',b.dataset.delImg);if(error){c.toast(error.message,true);return;}go('projects','&edit='+id);});
  body.querySelectorAll('[data-hero]').forEach(b=>b.onclick=async()=>{const r1=await c.client.from('project_images').update({is_hero:false}).eq('project_id',id);const r2=await c.client.from('project_images').update({is_hero:true}).eq('id',b.dataset.hero);if(r1.error||r2.error){c.toast((r1.error||r2.error).message,true);return;}go('projects','&edit='+id);});
  const list=body.querySelector('#pe-firm-list');(window.DrawUpLive?.loadFirms?.()||Promise.resolve([])).then(fs=>{list.innerHTML=fs.map(f=>`<option value="${esc(f.name)}">`).join('');},()=>{});
  body.querySelector('#pe-addteam').onclick=async()=>{const name=v('#pe-firm'),role=v('#pe-role');if(!name||!role){c.toast('Firm and role are required.',true);return;}const fs=await window.DrawUpLive.loadFirms();const f=fs.find(x=>x.name.toLowerCase()===name.toLowerCase());if(!f){c.toast('“'+name+'” is not in the DrawUp directory yet.',true);return;}const {error}=await c.client.from('project_firms').insert({project_id:id,firm_id:f.id,role,provenance:f.id===firm.id?'firm_verified':'user_submitted'});if(error){c.toast(error.message,true);return;}go('projects','&edit='+id);};
  body.querySelectorAll('[data-del-team]').forEach(b=>b.onclick=async()=>{const {error,count}=await c.client.from('project_firms').delete({count:'exact'}).eq('id',b.dataset.delTeam);if(error||!count){c.toast(error?.message||'Only DrawUp HQ can remove another firm\'s confirmed credit.',true);return;}go('projects','&edit='+id);});
  body.querySelector('#pe-addsrc').onclick=async()=>{const name=v('#pe-sname'),url=safeUrl(v('#pe-surl'));if(!name||!url){c.toast('Add a source name and a full https:// link.',true);return;}const {error}=await c.client.from('project_sources').insert({project_id:id,source_name:name,source_url:url});if(error){c.toast(error.message,true);return;}go('projects','&edit='+id);};
  body.querySelectorAll('[data-del-src]').forEach(b=>b.onclick=async()=>{const {error}=await c.client.from('project_sources').delete().eq('id',b.dataset.delSrc);if(error){c.toast(error.message,true);return;}go('projects','&edit='+id);});
}

/* =================================================================== people + profiles */
let peopleCache=null;
async function renderPeople(){
  const grid=$('people-grid');if(!grid)return;const c=await db();if(!c)return;
  if(!peopleCache){const {data,error}=await c.from('profiles').select('id,display_name,username,title,avatar_url,primary_affiliation_name,primary_affiliation_type,home_office,current_location,profile_verified,professional_level,account_type').eq('discoverable',true).not('display_name','is',null).order('updated_at',{ascending:false}).limit(400);
    if(error){grid.innerHTML=`<div class="people-empty" style="grid-column:1/-1">People are unavailable right now: ${esc(error.message)}</div>`;return;}peopleCache=data||[];}
  const q=($('people-search')?.value||'').trim().toLowerCase();
  const rows=peopleCache.filter(p=>!q||[p.display_name,p.username,p.title,p.primary_affiliation_name,p.home_office,p.current_location,p.professional_level].join(' ').toLowerCase().includes(q));
  grid.innerHTML=rows.length?rows.slice(0,120).map(p=>`<button type="button" class="du-person-card" data-person="${p.id}"><span class="du-person-av">${p.avatar_url?`<img src="${esc(p.avatar_url)}" alt="">`:esc((p.display_name||'D').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())}</span><b>${esc(p.display_name)}${p.profile_verified?' <span class="du-check" title="Verified">✓</span>':''}</b><small>${esc(p.title||p.professional_level||'')}</small><small>${esc([p.primary_affiliation_name,p.home_office||p.current_location].filter(Boolean).join(' · '))}</small><span class="du-person-open">View profile →</span></button>`).join(''):`<div class="people-empty" style="grid-column:1/-1">${q?'No members match that search.':'Profiles appear here as DrawUp members complete their public profiles.'}</div>`;
  grid.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>openPerson(b.dataset.person));
}
async function openPerson(id){
  const c=await db();if(!c)return;
  $('du-v19-person')?.remove();
  document.body.insertAdjacentHTML('beforeend','<div id="du-v19-person" class="du-v19-overlay"><div class="du-v19-sheet"><button type="button" class="du-v19-x" aria-label="Close">×</button><div class="du-loading">LOADING PROFILE…</div></div></div>');
  const ov=$('du-v19-person'),sheet=ov.querySelector('.du-v19-sheet');const close=()=>ov.remove();ov.querySelector('.du-v19-x').onclick=close;ov.onclick=e=>{if(e.target===ov)close();};
  const [{data:p},{data:edu},{data:car}]=await Promise.all([c.from('profiles').select('id,display_name,username,title,avatar_url,bio,pronouns,primary_affiliation_name,primary_affiliation_type,home_office,current_location,profile_verified,professional_level,disciplines,credentials,website,linkedin_url,discoverable').eq('id',id).maybeSingle(),c.from('profile_education').select('institution_name,program,degree_or_certificate,graduation_year,status').eq('user_id',id).eq('discoverable',true),c.from('career_timeline').select('role,organization,location,start_date,end_date,verified').eq('user_id',id).order('start_date',{ascending:false})]);
  if(!p||p.discoverable===false){sheet.innerHTML='<button type="button" class="du-v19-x" aria-label="Close">×</button><h2>This profile is private.</h2>';sheet.querySelector('.du-v19-x').onclick=close;return;}
  let firm=null;if(p.primary_affiliation_name){try{const fs=await window.DrawUpLive.loadFirms();const n=p.primary_affiliation_name.toLowerCase();firm=fs.find(f=>f.name.toLowerCase()===n)||null;}catch(_e){}}
  const yr=d=>d?String(d).slice(0,4):'';
  sheet.innerHTML=`<button type="button" class="du-v19-x" aria-label="Close">×</button><div class="du-v19-phead"><span class="du-person-av big">${p.avatar_url?`<img src="${esc(p.avatar_url)}" alt="">`:esc((p.display_name||'D').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())}</span><div><span class="eyebrow">DrawUp Profile</span><h2>${esc(p.display_name||'DrawUp member')}${p.profile_verified?' <span class="du-check">✓</span>':''}</h2><p>${esc([p.username?'@'+p.username:'',p.pronouns,p.title].filter(Boolean).join(' · '))}</p><p>${p.primary_affiliation_name?(firm?`<a href="#" data-firm-slug="${esc(firm.slug)}">${esc(p.primary_affiliation_name)}</a>`:esc(p.primary_affiliation_name)):''}${p.home_office?' · Home office: '+esc(p.home_office):p.current_location?' · '+esc(p.current_location):''}</p></div></div>
  ${p.bio?`<p>${esc(p.bio)}</p>`:''}${(p.disciplines||[]).length||(p.credentials||[]).length?`<p class="meta">${esc([...(p.credentials||[]),...(p.disciplines||[])].join(' · '))}</p>`:''}
  <h3>Experience</h3>${(car||[]).length?`<ul class="du-v19-tl">${car.map(r=>`<li><b>${esc(r.role)}</b>${r.organization?' · '+esc(r.organization):''}${r.verified?' <span class="du-check" title="Verified by DrawUp">✓</span>':''}<small>${esc([r.location,[yr(r.start_date),r.end_date?yr(r.end_date):'present'].filter(Boolean).join('–')].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>`:'<p class="meta">No experience listed.</p>'}
  <h3>Education</h3>${(edu||[]).length?`<ul class="du-v19-tl">${edu.map(e=>`<li><b>${esc(e.institution_name)}</b><small>${esc([e.degree_or_certificate,e.program,e.graduation_year].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>`:'<p class="meta">No education listed.</p>'}
  <p>${safeUrl(p.website)?`<a class="btn btn-ghost btn-sm" href="${esc(p.website)}" target="_blank" rel="noopener">Website ↗</a> `:''}${safeUrl(p.linkedin_url)?`<a class="btn btn-ghost btn-sm" href="${esc(p.linkedin_url)}" target="_blank" rel="noopener">LinkedIn ↗</a>`:''}</p>`;
  sheet.querySelector('.du-v19-x').onclick=close;
  sheet.querySelectorAll('[data-firm-slug]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();close();(window.DrawUpPortal?.isSignedIn?.()&&$('du-portal')?.classList.contains('open')?window.DrawUpPortal.openFirm:window.DrawUpLive.openFirm)(a.dataset.firmSlug);},true));
}
function bindPeople(){
  const tab=document.querySelector('#discover-tabs [data-sub="people"]');if(tab&&!tab.dataset.v19){tab.dataset.v19='1';tab.addEventListener('click',()=>setTimeout(renderPeople,0));}
  const s=$('people-search');if(s&&!s.dataset.v19){s.dataset.v19='1';let t;s.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(renderPeople,150);});}
  const my=$('open-my-profile');if(my&&!my.dataset.v19){my.dataset.v19='1';my.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(window.DrawUpPortal?.isSignedIn?.()){window.DrawUpPortal.openPortal('profile');window.DrawUpPortal.openPortalTab('profile');}else $('drawup-signin')?.click();},true);}
}
/* University profile: live member count. */
document.addEventListener('click',e=>{const b=e.target.closest('.drawup-school-profile');if(!b)return;setTimeout(async()=>{const name=(b.closest('.university-card')?.dataset.name||b.closest('.university-card')?.querySelector('h3')?.textContent||'').trim();const el=$('school-user-count');const c=await db();if(!el||!c||!name)return;const {count}=await c.from('profile_education').select('id',{count:'exact',head:true}).ilike('institution_name','%'+name.replace(/[%_]/g,'')+'%').eq('discoverable',true);el.textContent=(count||0)+' DrawUp member'+(count===1?'':'s')+' list '+name+' in their education';},60);},true);

/* =================================================================== home office finder */
async function officeFinder(nameInput,officeInput,list,hint){
  if(!nameInput||nameInput.dataset.v19)return;nameInput.dataset.v19='1';
  let firms=[];try{firms=await window.DrawUpLive.loadFirms();}catch(_e){}
  const fl=document.getElementById(nameInput.getAttribute('list'));if(fl)fl.innerHTML=firms.map(f=>`<option value="${esc(f.name)}">`).join('');
  const update=()=>{const n=nameInput.value.trim().toLowerCase();const f=firms.find(x=>x.name.toLowerCase()===n);
    const offs=(f?.firm_offices||[]).slice().sort((a,b)=>(b.is_headquarters?1:0)-(a.is_headquarters?1:0));
    if(list)list.innerHTML=offs.map(o=>`<option value="${esc([o.city,o.state||(US.has(o.country)?'':o.country)].filter(Boolean).join(', '))}">${o.is_headquarters?'Headquarters':''}</option>`).join('');
    if(hint)hint.textContent=f?(offs.length?`${f.name} has ${offs.length} office${offs.length===1?'':'s'} on DrawUp: ${offs.slice(0,6).map(o=>[o.city,o.state].filter(Boolean).join(', ')+(o.is_headquarters?' (HQ)':'')).join(' · ')}${offs.length>6?' and '+(offs.length-6)+' more':''}. Pick yours, or type a new one and DrawUp adds it to the firm profile.`:`${f.name} has no offices on DrawUp yet. Type yours (City, ST) and DrawUp adds it to the firm profile.`):(n?'Not in the DrawUp directory yet. You can still save it, and add the firm from Connect → Add a firm.':'Pick your firm above to see its offices.');};
  nameInput.addEventListener('input',update);nameInput.addEventListener('change',update);update();
}
let v19Pending=false;
function v19Scan(){v19Pending=false;
  if($('du-aff-name')&&!$('du-aff-name').dataset.v19)officeFinder($('du-aff-name'),$('du-home-office'),$('du-office-options'),$('du-home-office-hint'));
  if($('die-aff')&&!$('die-aff').dataset.v19)officeFinder($('die-aff'),$('die-home'),$('du-office-options-edit'),null);
  document.querySelectorAll('.du-coach-messages article p:not([data-v19])').forEach(p=>{p.dataset.v19='1';if(/https?:\/\//.test(p.textContent))p.innerHTML=linkify(p.textContent);});
  const ci=$('dc-input');if(ci&&!ci.dataset.v19){ci.dataset.v19='1';try{const t=sessionStorage.getItem('du-coach-prefill');if(t){ci.value=t;sessionStorage.removeItem('du-coach-prefill');}}catch(_e){}}
  bindPeople();linkShowcase();
}
new MutationObserver(()=>{if(v19Pending)return;v19Pending=true;requestAnimationFrame(v19Scan);}).observe(document.documentElement,{childList:true,subtree:true});

/* Static "For Firms" showcase cards open the real firm profiles. */
function linkShowcase(){document.querySelectorAll('.gallery-card').forEach(card=>{if(card.dataset.firmSlug||card.dataset.v19)return;const h=card.querySelector('h3')?.textContent.trim();const map={'KEi Architects':'kei-architects','Thornton Tomasetti':'thornton-tomasetti','Turner Construction':'turner-construction'};if(map[h]){card.dataset.v19='1';card.dataset.page='firm-profile';card.dataset.firmSlug=map[h];card.tabIndex=0;card.setAttribute('role','button');card.classList.add('du-firm-card');}});}
function boot(){bindPeople();linkShowcase();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
