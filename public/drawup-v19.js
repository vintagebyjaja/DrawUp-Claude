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

/* V21: reads the fields of a research answer while its JSON is still being written. Complete string
   fields are returned as is; the field being written right now is returned so far (marked in _writing). */
const PARTIAL_KEYS=['title','location','type','summary','answer','architect','engineers','contractor','owner','opened','area','capacity'];
function partialFields(text){const out={};const re=/"([a-z_]+)"\s*:\s*"((?:[^"\\]|\\.)*)("?)/g;let m;
  while((m=re.exec(text))){if(!PARTIAL_KEYS.includes(m[1]))continue;let v=m[2];try{v=JSON.parse('"'+v.replace(/\\$/,'')+'"');}catch(_e){}if(v)out[m[1]]=v;if(!m[3])out._writing=m[1];}
  const names=[...text.matchAll(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"role"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map(x=>x[1]+' · '+x[2]);if(names.length)out._team=names.slice(0,12);
  const srcs=[...text.matchAll(/"url"\s*:\s*"(https?:[^"]+)"/g)].map(x=>x[1]);if(srcs.length)out._sources=[...new Set(srcs)].slice(0,8);
  return out;}
/* =================================================================== research */
const Research={
  /* V20 speed: POST answers with a saved result, a clarifying question {clarify}, or a running job
     {id, quick}. opts: {clarified, parent, refresh}. */
  async start(query,type,opts={}){
    const h={'Content-Type':'application/json'};try{const c=await db();const ses=c&&(await c.auth.getSession()).data.session;if(ses&&!ses.user?.is_anonymous)h.Authorization='Bearer '+ses.access_token;}catch(_e){}
    const res=await fetch('/api/project-research',{method:'POST',headers:h,body:JSON.stringify({query,type:type||'all',clarified:!!opts.clarified,parent:opts.parent||undefined,refresh:!!opts.refresh})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data?.error||'Web research is unavailable right now.');
    if(data.result&&data.cached){data.result._saved_at=data.saved_at;if(data.match==='similar')data.result._saved_query=data.saved_query;}
    return data;
  },
  /* V21: a streamed job (stream:{cursor}) returns the text written so far; onPartial gets the fields found so far. */
  async poll(id,t0,onTick,alive,stream,onPartial){
    let cursor=stream?Number(stream.cursor)||0:null,text='',lastText=0;
    while(Date.now()-t0<115000||(text&&Date.now()-lastText<20000&&Date.now()-t0<230000)){
      await sleep(cursor===null?2500:250);if(alive&&!alive())return null;onTick&&onTick(Math.round((Date.now()-t0)/1000));
      const r=await fetch('/api/project-research?id='+encodeURIComponent(id)+(cursor!==null?'&after='+cursor:''),{cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(d.result)return d.result;
      if(!r.ok)throw new Error(d?.error||'Web research failed.');
      if(cursor!==null&&typeof d.cursor==='number'){cursor=d.cursor;if(d.delta){text+=d.delta;lastText=Date.now();}onPartial&&onPartial(partialFields(text),d.activity);}
    }
    throw new Error('DrawUp stopped this search at two minutes. Try a more specific search, for example the project name plus its city.');
  },
  /* Resolves to the full result. opts.onQuick(quick) gets the quick answer; opts.onClarify(clarify) takes over
     a clarifying question (run resolves null); without it the search continues as typed. */
  async run(query,type,onTick,opts={}){
    const t0=Date.now();
    const data=await Research.start(query,type,opts);
    if(data.result)return data.result;
    if(data.clarify){if(opts.onClarify){opts.onClarify(data.clarify);return null;}return Research.run(query,type,onTick,{...opts,clarified:true});}
    if(data.quick&&opts.onQuick)opts.onQuick(data.quick);
    if(!data.id)throw new Error('Web research did not start.');
    return Research.poll(data.id,t0,onTick,opts.alive,data.stream,opts.onPartial);
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
  if(r._saved_at)h+=`<p class="du-rs-muted">Saved DrawUp research from ${esc(new Date(r._saved_at).toLocaleDateString())}${r._saved_query?` (matched the earlier search “${esc(r._saved_query)}”)`:''}. It loaded instantly because someone searched this before.</p>`;
  h+=ingestHTML(r._ingest);
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
  h+=`<p class="du-rs-label">${r._ingest?.project?'Web research by DrawUp from public sources. The project and the firms named in these sources were listed on DrawUp as unconfirmed public-source records; firms can claim and correct them. Check the sources before relying on it.':'Web research by DrawUp from public sources. It is not added to the DrawUp database; check the sources before relying on it.'}</p><div class="du-rs-actions"><button type="button" class="du-rs-btn" data-rs-coach>Ask Arch Coach about this</button><button type="button" class="du-rs-btn ghost" data-rs-again>New search</button></div></div></div>`;
  return h;
}
function bindPage(root,{openFirm,openProject,back,again,coach}){
  root.querySelectorAll('[data-firm-slug]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openFirm(a.dataset.firmSlug);},true));
  root.querySelectorAll('[data-project-slug]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openProject(a.dataset.projectSlug);},true));
  root.querySelectorAll('[data-rs-back]').forEach(b=>b.onclick=back);root.querySelectorAll('[data-rs-again]').forEach(b=>b.onclick=again);root.querySelectorAll('[data-rs-coach]').forEach(b=>b.onclick=coach);
}
/* V20: firms and the project DrawUp listed from this research (unclaimed, unconfirmed). */
function ingestHTML(ing){
  if(!ing||!ing.project||!(ing.firms||[]).length)return '';
  const fresh=ing.firms.filter(f=>f.created);
  return `<section class="du-rs-ingest"><h2>${fresh.length?'Added to DrawUp from this search':'Credited on DrawUp from this search'}</h2><p class="du-rs-muted">Listed from public sources. Unconfirmed and not claimed by the firm${ing.firms.length>1?'s':''} yet.</p><div class="du-rs-firms">${ing.firms.map(f=>firmChip(f,(f.created?'New listing · ':'')+f.role)).join('')}</div><p><button type="button" class="du-rs-btn ghost" data-project-slug="${esc(ing.project.slug)}">Open ${esc(ing.project.name)} on DrawUp →</button></p></section>`;
}
function onDrawupHTML(d){
  const projects=d?.projects||[],firms=d?.firms||[];
  if(!d)return `<section class="du-rs-ondrawup"><h2>On DrawUp</h2><p class="du-rs-muted">Checking DrawUp records…</p></section>`;
  if(!projects.length&&!firms.length)return `<section class="du-rs-ondrawup"><h2>On DrawUp</h2><p class="du-rs-muted">No DrawUp records match these words yet.</p></section>`;
  return `<section class="du-rs-ondrawup"><h2>On DrawUp</h2>${projects.length?`<div class="du-rs-proj">${projects.map(p=>`<button type="button" class="du-rs-projcard" data-project-slug="${esc(p.slug)}">${p.image_url?`<img src="${esc(p.image_url)}" alt="">`:''}<b>${esc(p.name)}</b><small>${esc([p.city,p.state].filter(Boolean).join(', '))}${p.project_type?' · '+esc(p.project_type):''}</small><span>Open DrawUp profile →</span></button>`).join('')}</div>`:''}${firms.length?`<div class="du-rs-firms">${firms.slice(0,8).map(f=>firmChip(f)).join('')}</div>`:''}</section>`;
}
/* The page while research runs: DrawUp matches right away, then a labeled quick answer or a clarifying question. */
function provisionalHTML(q,st,head){
  let h=`<div class="du-rs du-rs-live">${head?`<header class="du-rs-head"><button type="button" class="du-rs-back" data-rs-back>← Back to DrawUp</button><span class="du-rs-kicker">DRAWUP PROJECT PORTAL</span><h1>${esc(st.quick?.title||q)}</h1><p>${esc(st.quick?.location||'')}</p></header>`:''}<div class="du-rs-body">`;
  if(st.clarify){
    h+=`<section class="du-rs-clarify"><span class="du-quick-tag">Quick question so DrawUp searches the right thing</span><h2>${esc(st.clarify.question)}</h2><div class="du-clarify-opts">${st.clarify.options.map((o,i)=>`<button type="button" data-rs-clar="${i}">${esc(o.label)}</button>`).join('')}</div><form class="du-rs-clarform"><input type="text" maxlength="160" placeholder="Or add a detail (city, state, program, building type…)" aria-label="Add a detail"><button class="du-rs-btn">Search</button></form><button type="button" class="du-rs-asis" data-rs-asis>Search “${esc(q)}” as typed</button></section>`;
  }else if(st.err){
    h+=`<section class="du-rs-error"><h2>Web research could not finish</h2><p>${esc(st.err)}</p><button type="button" class="du-rs-btn" data-rs-retry>Try again</button></section>`;
    if(st.quick)h+=`<section class="du-rs-quick"><span class="du-quick-tag">Quick answer · not verified</span><p>${esc(st.quick.answer)}</p></section>`;
  }else{
    const secs=Math.round((Date.now()-st.t0)/1000);
    h+=`<section class="du-rs-quick${st.quick?'':' waiting'}"><span class="du-quick-tag">${st.quick?`Quick answer, still checking sources · ${(st.quick.ms/1000||0).toFixed(1)}s`:'Drawing up a quick answer…'}</span>${st.quick?`<h2>${esc(st.quick.title||q)}</h2><p>${esc(st.quick.answer)}</p><small>Not verified yet. The full answer with sources replaces this when it is ready.</small>`:''}<div class="du-rs-checking"><i></i><span>${st.activity==='searching'?'Searching live sources':st.activity==='read_sources'?'Reading the sources it found':st.partial?'Writing up what it found':'Checking live sources for the full answer'}</span><b data-rs-clock>${secs}s</b></div></section>`;
    if(st.partial&&Object.keys(st.partial).some(k=>k[0]!=='_'))h+=partialHTML(st.partial);
  }
  h+=onDrawupHTML(st.db);
  return h+'</div></div>';
}
const PARTIAL_LABEL={title:'Name',location:'Location',type:'Type',summary:'Summary',answer:'Answer',architect:'Architect',engineers:'Engineers',contractor:'Contractor',owner:'Owner',opened:'Opened',area:'Size',capacity:'Capacity'};
function partialHTML(f){return `<section class="du-rs-found" aria-live="polite"><span class="du-quick-tag">Found so far · from live sources, still writing</span><dl>${PARTIAL_KEYS.filter(k=>f[k]).map(k=>`<div${f._writing===k?' class="writing"':''}><dt>${PARTIAL_LABEL[k]}</dt><dd>${esc(f[k])}${f._writing===k?'<i class="du-caret"></i>':''}</dd></div>`).join('')}${f._team?`<div><dt>Team</dt><dd>${f._team.map(esc).join('<br>')}</dd></div>`:''}${f._sources?`<div><dt>Sources</dt><dd>${f._sources.map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(domainOf(u))}</a>`).join(' · ')}</dd></div>`:''}</dl><small>Not final yet. The finished page with every source replaces this.</small></section>`;}
function searchCss(){if(document.getElementById('du-speed19-css'))return;const s=document.createElement('style');s.id='du-speed19-css';s.textContent=`
.du-quick-tag{display:inline-block;font-weight:700;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#0b7fa3}
.du-rs-quick,.du-rs-clarify,.du-rs-ingest{border:1px dashed rgba(11,127,163,.45);border-radius:16px;padding:16px 18px;background:rgba(127,231,255,.08)}
.du-rs-quick small{color:#5b6b78}.du-rs-quick.waiting{border-style:solid}
.du-rs-checking{display:flex;align-items:center;gap:10px;margin-top:12px;font-size:13px;color:#33505f}.du-rs-checking i{width:14px;height:14px;border-radius:50%;border:2px solid #7fe7ff;border-top-color:#9b5de5;animation:duSpin 0.9s linear infinite}
.du-rs-checking b{margin-left:auto;font-variant-numeric:tabular-nums}@keyframes duSpin{to{transform:rotate(360deg)}}
.du-rs-clarify .du-clarify-opts{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.du-rs-clarify .du-clarify-opts button{border:1px solid #0b7fa3;background:#fff;color:#0b5f7a;border-radius:999px;padding:9px 16px;font-weight:600;cursor:pointer;min-height:40px}
.du-rs-clarify .du-clarify-opts button:hover,.du-rs-clarify .du-clarify-opts button:focus-visible{background:#0b7fa3;color:#fff;outline:none}
.du-rs-clarform{display:flex;gap:8px;flex-wrap:wrap}.du-rs-clarform input{flex:1 1 200px;min-width:0;border:1px solid #c9d6de;border-radius:10px;padding:10px 12px;font:inherit}
.du-rs-asis{margin-top:10px;background:none;border:0;padding:0;color:#33505f;text-decoration:underline;cursor:pointer;font:inherit;font-size:13px}
.du-rs-found{margin-top:14px;border:1px solid rgba(11,127,163,.35);border-radius:16px;padding:16px 18px;background:#fff}.du-rs-found dl{margin:8px 0 6px;display:grid;gap:8px}.du-rs-found dl>div{display:grid;grid-template-columns:120px 1fr;gap:10px}.du-rs-found dt{font-weight:700;color:#33505f;font-size:13px}.du-rs-found dd{margin:0;color:#10202b;line-height:1.5;overflow-wrap:anywhere}.du-rs-found small{color:#5b6b78}.du-caret{display:inline-block;width:7px;height:14px;margin-left:2px;background:#0b7fa3;vertical-align:-2px;animation:duBlink 1s steps(2) infinite}@keyframes duBlink{50%{opacity:0}}@media(max-width:520px){.du-rs-found dl>div{grid-template-columns:1fr;gap:2px}}
.du-rs-ingest{border-style:solid;border-color:rgba(155,93,229,.45);background:rgba(155,93,229,.06)}`;document.head.appendChild(s);}

/* V20 speed: one progressive search into `el`. Shows DrawUp matches instantly, a labeled quick answer
   within seconds (or chips for an ambiguous search), then the full sourced page replaces it.
   ctx: {head, onPaint(state), bind(root,r), rerun(query,opts), opts:{clarified,parent,refresh}}. Resolves when done. */
async function liveSearch(el,q,type,ctx){
  searchCss();
  const seq=String(Date.now()+Math.random());el.dataset.duSearch=seq;const alive=()=>el.dataset.duSearch===seq;
  const st={t0:Date.now(),db:null,quick:null,clarify:null,full:null,rel:null,err:null};
  const paint=()=>{if(!alive())return;
    if(st.full)el.innerHTML=pageHTML(st.full,q,st.rel,{head:ctx.head});
    else el.innerHTML=provisionalHTML(q,st,ctx.head);
    ctx.bind(el,st.full||{title:st.quick?.title||q});
    el.querySelectorAll('[data-rs-clar]').forEach(b=>b.onclick=()=>{const o=st.clarify.options[+b.dataset.rsClar];ctx.rerun(String(o.value||o.label),{clarified:true,parent:q});});
    const cf=el.querySelector('.du-rs-clarform');if(cf)cf.onsubmit=e=>{e.preventDefault();const v=cf.querySelector('input').value.trim();if(v)ctx.rerun(q+' '+v,{clarified:true,parent:q});};
    el.querySelector('[data-rs-asis]')?.addEventListener('click',()=>ctx.rerun(q,{clarified:true}));
    el.querySelector('[data-rs-retry]')?.addEventListener('click',()=>ctx.rerun(q,ctx.opts||{}));
    ctx.onPaint&&ctx.onPaint(st);};
  const clock=setInterval(()=>{if(!alive()||st.full||st.err||st.clarify){clearInterval(clock);return;}const b=el.querySelector('[data-rs-clock]');if(b)b.textContent=Math.round((Date.now()-st.t0)/1000)+'s';},1000);
  const c=await db();
  const dbP=(c?c.rpc('drawup_search',{q,kind:type==='person'?'all':(type||'all'),max_rows:6}).then(({data})=>data||{},()=>({})):Promise.resolve({})).then(d=>{st.db=d;if(!st.full)paint();const names=[...(d.projects||[]).map(p=>p.name),...(d.firms||[]).map(f=>f.name)];if(names.length)Tunnel.relations(names,'Possible relations on DrawUp');return d;});
  paint();
  try{
    const r=await Research.run(q,type,s=>{if(s>20)Tunnel.route('Still reading sources… DrawUp keeps searching until it has a real answer.');},{...(ctx.opts||{}),alive,onQuick:qk=>{st.quick=qk;paint();},onPartial:(f,a)=>{st.partial=f;st.activity=a||st.activity;paint();},onClarify:cl=>{st.clarify=cl;paint();}});
    if(!r||!alive())return st;
    if(r.location)Tunnel.route('Routing to '+r.location+'…');
    const rel=await Research.related(r,q);await dbP;
    if(rel.credited.length||rel.nearby.length)Tunnel.relations([...rel.credited.map(f=>f.name),...rel.nearby.map(f=>f.name)],rel.place?.city?'Connecting firms near '+rel.place.city:'Connecting DrawUp firms');
    st.full=r;st.rel=rel;paint();
  }catch(e){st.err=e.message||String(e);await dbP;paint();}
  finally{clearInterval(clock);}
  return st;
}
/* Keeps the portal transition up briefly (it locates the place on the globe), then shows the live page. */
async function tunnelFor(q,ready,cancelled){
  const t0=Date.now();
  const first=await Promise.race([ready,cancelled.then(()=>'cancel')]);
  if(first==='cancel')return 'cancel';
  const min=first==='full'||first==='clarify'?500:2800;
  const left=min-(Date.now()-t0);if(left>0)await Promise.race([sleep(left),cancelled.then(()=>'cancel')]);
  Tunnel.close();return 'ok';
}

/* Public site search: DrawUp records + quick answer + web research behind the portal transition. */
async function publicSearch(q,type,opts){
  const portal=$('drawup-v12-portal');if(!portal)return false;
  const cancelled=Tunnel.open(q);
  const body=$('v12-result-body');let readyFn;const ready=new Promise(r=>readyFn=r);
  setTimeout(()=>readyFn('timeout'),6000);
  const close=()=>portal.classList.remove('open');
  const bind=(root,r)=>bindPage(root,{openFirm:s=>{close();window.DrawUpLive?.openFirm(s);},openProject:s=>{close();window.DrawUpLive?.openProject(s);},back:close,again:()=>{close();$('drawup-search-input')?.focus();},coach:()=>{close();document.querySelector('[data-page=coach]')?.click();const i=$('arch-coach-input');if(i)i.value='Tell me about '+(r?.title||q);}});
  $('v12-result-title').textContent=q;$('v12-result-sub').textContent='Checking DrawUp and live sources…';
  const search=liveSearch(body,q,type,{head:false,opts,bind,
    rerun:(nq,o)=>{const inp=$('drawup-search-input');if(inp)inp.value=nq;publicSearch(nq,type,o);},
    onPaint:st=>{
      if(st.full){$('v12-result-title').textContent=st.full.title||q;$('v12-result-sub').textContent=[st.full.type,st.full.location].filter(Boolean).join(' · ');readyFn('full');}
      else if(st.clarify){$('v12-result-title').textContent=q;$('v12-result-sub').textContent='One quick question first';readyFn('clarify');}
      else if(st.err){$('v12-result-title').textContent='DrawUp search: '+q;$('v12-result-sub').textContent='';readyFn('err');}
      else if(st.quick){$('v12-result-title').textContent=st.quick.title||q;$('v12-result-sub').textContent='Quick answer · checking sources';readyFn('quick');}}});
  const t=await tunnelFor(q,ready,cancelled);
  if(t==='cancel'){body.dataset.duSearch='cancelled';return true;}
  portal.classList.add('open');portal.scrollTop=0;
  search.finally(()=>Tunnel.close());
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
    // V20 speed: progressive search (DrawUp matches, quick answer or clarifying chips, then the full page).
    const run=async(q,opts)=>{
      const cancelled=Tunnel.open(q);let readyFn;const ready=new Promise(r=>readyFn=r);setTimeout(()=>readyFn('timeout'),6000);
      const bind=(root,r)=>bindPage(root,{openFirm:s=>open(s),openProject:s=>open(s,true),back:()=>{out.innerHTML='';qi.focus();},again:()=>{out.innerHTML='';qi.value='';qi.focus();w.scrollIntoView({block:'start'});},coach:()=>{try{sessionStorage.setItem('du-coach-prefill','Tell me about '+(r?.title||q));}catch(_e){}P.openPortalTab('arch-coach');}});
      const search=liveSearch(out,q,kind,{head:true,opts,bind,rerun:(nq,o)=>{qi.value=nq;run(nq,o);},onPaint:st=>{if(st.full)readyFn('full');else if(st.clarify)readyFn('clarify');else if(st.err||st.quick)readyFn('x');}});
      const t=await tunnelFor(q,ready,cancelled);
      if(t==='cancel'){out.dataset.duSearch='cancelled';out.innerHTML='';return;}
      out.scrollIntoView({behavior:'smooth',block:'start'});search.finally(()=>Tunnel.close());
    };
    f.onsubmit=e=>{e.preventDefault();const q=qi.value.trim();if(!q)return;run(q,{});};
    if(initial){qi.value=initial;f.requestSubmit();}
  });
  P.registerTab('firm',renderFirmTab);
});

/* =================================================================== firm admin */
const STATUS_OPTS=['Completed','Under construction','In design','Proposed','Open; renovation planned'];
// V20: pick several photos at once (browse, drag in, or paste), preview them, upload with progress.
function photoDropHTML(id,label){return `<div class="du-pdrop" id="${id}-zone" tabindex="0"><input type="file" id="${id}" accept="image/jpeg,image/png,image/webp" multiple hidden><b>${label}</b><span>Drag photos here, paste them, or <button type="button" class="du-pdrop-pick">choose files</button>. Pick as many as you like.</span><div class="du-pdrop-list"></div></div>`;}
function photoDrop(root,id){
  const zone=root.querySelector('#'+id+'-zone'),input=root.querySelector('#'+id),list=zone.querySelector('.du-pdrop-list');let files=[];
  const ok=f=>/^image\/(jpeg|png|webp)$/.test(f.type);
  const draw=()=>{list.innerHTML=files.map((f,i)=>`<figure><img alt="" src="${URL.createObjectURL(f)}"><button type="button" data-rm="${i}" aria-label="Remove">×</button><figcaption>${esc(f.name.slice(0,28))}</figcaption></figure>`).join('');zone.classList.toggle('has',files.length>0);};
  const add=fl=>{const all=[...fl];const good=all.filter(ok);files=files.concat(good).slice(0,30);zone.dataset.progress=good.length<all.length?'Only JPG, PNG or WebP photos can be added.':'';draw();};
  zone.querySelector('.du-pdrop-pick').onclick=()=>input.click();input.onchange=()=>{add(input.files);input.value='';};
  zone.ondragover=e=>{e.preventDefault();zone.classList.add('over');};zone.ondragleave=()=>zone.classList.remove('over');
  zone.ondrop=e=>{e.preventDefault();zone.classList.remove('over');add(e.dataTransfer.files);};
  zone.onpaste=e=>{const fl=[...(e.clipboardData?.files||[])];if(fl.length){e.preventDefault();add(fl);}};
  list.onclick=e=>{const b=e.target.closest('[data-rm]');if(b){files.splice(+b.dataset.rm,1);draw();}};
  return {files:()=>files.slice(),clear:()=>{files=[];draw();},progress:(n,m)=>{zone.dataset.progress=m?`Uploading ${n} of ${m}…`:'';}};
}
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
  <div class="du-subtabs du-hq-tabs">${[['details','Firm details'],['offices','Offices'],['units','Locations & studios'],['projects','Projects'],['library','Library + team']].map(([k,l])=>`<button type="button" data-fa-pane="${k}" class="${k===pane?'active':''}">${l}</button>`).join('')}</div><div id="fa-body"><div class="du-loading">LOADING…</div></div>`;
  w.querySelectorAll('[data-fa-pane]').forEach(b=>b.onclick=()=>go(b.dataset.faPane));
  w.querySelector('#fa-view').onclick=()=>P.openFirm(firm.slug);
  const sw=w.querySelector('#fa-switch');if(sw)sw.onchange=()=>{history.replaceState(null,'','#portal/firm?firm='+encodeURIComponent(sw.value));P.openPortalTab('firm');};
  const body=w.querySelector('#fa-body');
  if(pane==='library'){await P.renderFirmBase(body);return;}
  if(pane==='details')return firmDetails(body,c,firm.id,go);
  if(pane==='offices')return firmOffices(body,c,firm.id,go);
  if(pane==='units'){if(!window.DrawUpFirms){body.innerHTML='<p class="du-muted">Locations & studios needs drawup-firms-v20.js.</p>';return;}return window.DrawUpFirms.adminUnits(body,c,firm,go,params,{photoDrop,photoDropHTML,uploadPublic,fld});}
  if(pane==='projects'){const edit=params.get('edit');return edit?projectEditor(body,c,firm,edit,go):firmProjects(body,c,firm,go);}
}
async function firmDetails(body,c,id,go){
  const [{data:f,error},{data:photos}]=await Promise.all([c.client.from('firms').select('*').eq('id',id).single(),c.client.from('firm_photos').select('*').eq('firm_id',id).order('sort_order')]);if(error)throw error;
  body.innerHTML=`<article class="du-glass"><h2>Firm details</h2><div class="du-two">${fld('Firm name','fa-name',f.name)}${fld('Website','fa-web',f.website,'placeholder="https://"')}</div>
  <div class="du-two"><div class="du-field"><label>Discipline</label><select id="fa-disc">${['','Architecture','Engineering','Construction','Interior Design','Landscape','Planning','Multidisciplinary'].map(x=>`<option${(f.discipline||'')===x?' selected':''}>${x}</option>`).join('')}</select></div>${fld('Founded (year)','fa-founded',f.founded_year,'inputmode="numeric"')}</div>
  <div class="du-field"><label>About the firm</label><textarea id="fa-desc" rows="5">${esc(f.description||'')}</textarea></div>
  <div class="du-two"><div class="du-field"><label>Logo</label>${f.logo_url?`<img class="du-hq-thumb" src="${esc(f.logo_url)}" alt="">`:''}<input type="file" id="fa-logo" accept="image/jpeg,image/png,image/webp"></div><div class="du-field"><label>Cover image</label>${f.hero_image_url?`<img class="du-hq-thumb" src="${esc(f.hero_image_url)}" alt="">`:''}<input type="file" id="fa-hero" accept="image/jpeg,image/png,image/webp"></div></div>
  <p class="du-muted">Verification, the profile address and the plan are set by DrawUp HQ.</p><p><button class="du-btn primary" id="fa-save">Save details</button> <span id="fa-st" class="du-save-status"></span></p></article>
  <article class="du-glass"><h2>Firm photos</h2><div class="du-hq-photos">${(photos||[]).map(p=>`<figure><img src="${esc(p.image_url)}" alt=""><figcaption>${esc(p.caption||'')} <button class="du-btn ghost" data-del-photo="${p.id}">Remove</button></figcaption></figure>`).join('')||'<p class="du-muted">No photos yet.</p>'}</div>${photoDropHTML('fa-photo','Add firm photos')}${fld('Caption / photo credit (applies to this batch)','fa-cap','','placeholder="Photo: photographer name"')}<button class="du-btn" id="fa-addphoto">Upload photos</button></article>`;
  body.querySelector('#fa-save').onclick=async()=>{const st=body.querySelector('#fa-st');st.textContent=' Saving…';try{const name=body.querySelector('#fa-name').value.trim();if(!name)throw new Error('Firm name is required.');const yr=parseInt(body.querySelector('#fa-founded').value,10);const web=body.querySelector('#fa-web').value.trim();
    const row={name,website:web?(/^https?:\/\//i.test(web)?web:'https://'+web):null,discipline:body.querySelector('#fa-disc').value||null,founded_year:yr>1700&&yr<2100?yr:null,description:body.querySelector('#fa-desc').value.trim()||null,updated_at:new Date().toISOString()};
    const lf=body.querySelector('#fa-logo').files[0],hf=body.querySelector('#fa-hero').files[0];if(lf)row.logo_url=await uploadPublic(c,lf,'firm/'+id);if(hf)row.hero_image_url=await uploadPublic(c,hf,'firm/'+id);
    const {error}=await c.client.from('firms').update(row).eq('id',id).select('id').single();if(error)throw error;c.toast('Firm details saved.');go('details');}catch(e){st.textContent=' Not saved — '+(e.message||e);}};
  const faDrop=photoDrop(body,'fa-photo');
  body.querySelector('#fa-addphoto').onclick=async()=>{const files=faDrop.files();if(!files.length){c.toast('Choose one or more photos.',true);return;}let n=(photos||[]).length,done=0;try{for(const file of files){faDrop.progress(done+1,files.length);const url=await uploadPublic(c,file,'firm/'+id);const {error}=await c.client.from('firm_photos').insert({firm_id:id,image_url:url,caption:body.querySelector('#fa-cap').value.trim()||null,sort_order:n++});if(error)throw error;done++;}faDrop.progress();c.toast(done===1?'Photo added.':done+' photos added.');go('details');}catch(e){faDrop.progress();c.toast((done?done+' of '+files.length+' photos added. ':'')+(e.message||String(e)),true);if(done)go('details');}};
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
  window.DrawUpFirms?.adminFeatured?.(body,c,firm,rows);
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
  <div class="du-two">${fld('Cost','pe-cost',p.cost_text,'placeholder="$192.5 million"')}${fld('Capacity','pe-cap',p.capacity_text)}</div><div class="du-two">${fld('Size','pe-size',p.size_text,'placeholder="780,000 sq ft"')}${fld('Official photo page','pe-imgpage',p.image_page_url,'placeholder="https://"')}</div>${'campus_name' in p?`<div class="du-two">${fld('Campus (if this project is on a university campus)','pe-campus',p.campus_name,'placeholder="Hampton University"')}<p class="du-muted">Tagging a campus shows this project, its photos and your firm on that university's DrawUp profile.</p></div>`:''}
  <div class="du-field"><label>Description</label><textarea id="pe-desc" rows="5">${esc(p.description||'')}</textarea></div>
  <div class="du-field"><label>Key facts <small>one per line</small></label><textarea id="pe-facts" rows="4">${esc((Array.isArray(p.key_facts)?p.key_facts:[]).join('\n'))}</textarea></div>
  <p><button class="du-btn primary" id="pe-save">Save project</button> <button class="du-btn ghost" id="pe-back">Back to projects</button> <button class="du-btn ghost" id="pe-view">View profile</button>${p.created_by===c.user.id?' <button class="du-btn ghost" id="pe-del">Delete project</button>':''} <span id="pe-st" class="du-save-status"></span></p></article>
  <article class="du-glass"><h2>Photos</h2><p class="du-muted">Upload photos your firm has the right to share, and credit the photographer.</p><div class="du-hq-photos">${(imgs||[]).map(i=>`<figure><img src="${esc(i.image_url)}" alt=""><figcaption>${i.is_hero?'<b>COVER</b> ':''}${esc(i.caption||'')} ${i.is_hero?'':`<button class="du-btn ghost" data-hero="${i.id}">Make cover</button>`} <button class="du-btn ghost" data-del-img="${i.id}">Remove</button></figcaption></figure>`).join('')||'<p class="du-muted">No photos yet.</p>'}</div>${photoDropHTML('pe-img','Add project photos')}${fld('Caption / photo credit (applies to this batch)','pe-capt','','placeholder="Photo: photographer name"')}<button class="du-btn" id="pe-addimg">Upload photos</button></article>
  <article class="du-glass"><h2>Project team</h2>${(team||[]).map(t=>`<div class="du-row"><div><b>${esc(t.firms?.name||'')}</b><small>${esc(t.role)} · ${esc(String(t.provenance).replace('_',' '))}</small></div><button class="du-btn ghost" data-del-team="${t.id}">Remove</button></div>`).join('')||'<p class="du-muted">No firms linked yet.</p>'}
  <div class="du-two"><div class="du-field"><label>Firm (from the DrawUp directory)</label><input id="pe-firm" list="pe-firm-list" autocomplete="off"><datalist id="pe-firm-list"></datalist></div>${fld('Role','pe-role','','placeholder="Structural engineer, General contractor…"')}</div><button class="du-btn ghost" id="pe-addteam">Add to team</button><p class="du-muted">Firm not listed? Use “Add a firm” on the Connect page and DrawUp reviews it.</p></article>
  <article class="du-glass"><h2>Sources</h2>${(srcs||[]).map(s=>`<div class="du-row"><div><b>${esc(s.source_name)}</b><small>${esc(s.source_url)}</small></div><button class="du-btn ghost" data-del-src="${s.id}">Remove</button></div>`).join('')||'<p class="du-muted">No sources yet.</p>'}<div class="du-two">${fld('Source name','pe-sname','','placeholder="HOK project page"')}${fld('Link','pe-surl','','placeholder="https://"')}</div><button class="du-btn ghost" id="pe-addsrc">Add source</button></article>`;
  const v=s=>body.querySelector(s).value.trim(),num=s=>parseInt(v(s),10)||null;
  body.querySelector('#pe-back').onclick=()=>go('projects');body.querySelector('#pe-view').onclick=()=>window.DrawUpPortal.openProject(p.slug);
  body.querySelector('#pe-save').onclick=async()=>{const st=body.querySelector('#pe-st');st.textContent=' Saving…';if(!v('#pe-name')){st.textContent=' Name is required.';return;}
    const row={name:v('#pe-name'),street_address:v('#pe-address')||null,city:v('#pe-city')||null,state:v('#pe-state')||null,country:v('#pe-country')||'US',project_type:v('#pe-type')||null,status:v('#pe-status')||null,owner_name:v('#pe-owner')||null,opened_year:num('#pe-opened'),completion_year:num('#pe-year'),cost_text:v('#pe-cost')||null,capacity_text:v('#pe-cap')||null,size_text:v('#pe-size')||null,image_page_url:safeUrl(v('#pe-imgpage'))||null,description:v('#pe-desc')||null,key_facts:v('#pe-facts').split('\n').map(x=>x.trim()).filter(Boolean),updated_at:new Date().toISOString()};if('campus_name' in p)row.campus_name=v('#pe-campus')||null;
    const {error}=await c.client.from('aec_projects').update(row).eq('id',id).select('id').single();if(error){st.textContent=' Not saved — '+error.message;return;}c.toast('Project saved.');go('projects','&edit='+id);};
  const del=body.querySelector('#pe-del');if(del)del.onclick=async()=>{if(!confirm('Delete this project, its photos and credits?'))return;const {error}=await c.client.rpc('drawup_firm_delete_project',{p_project_id:id});if(error){c.toast(error.message,true);return;}go('projects');};
  const peDrop=photoDrop(body,'pe-img');
  body.querySelector('#pe-addimg').onclick=async()=>{const files=peDrop.files();if(!files.length){c.toast('Choose one or more photos.',true);return;}let n=(imgs||[]).length,done=0;try{for(const f of files){peDrop.progress(done+1,files.length);const url=await uploadPublic(c,f,'project/'+id);const {error}=await c.client.from('project_images').insert({project_id:id,image_url:url,caption:v('#pe-capt')||null,is_hero:n===0,sort_order:n});if(error)throw error;n++;done++;}peDrop.progress();c.toast(done===1?'Photo added.':done+' photos added.');go('projects','&edit='+id);}catch(e){peDrop.progress();c.toast((done?done+' of '+files.length+' photos added. ':'')+(e.message||String(e)),true);if(done)go('projects','&edit='+id);}};
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
    if(error){grid.innerHTML=`<div class="people-empty" style="grid-column:1/-1">People are unavailable right now: ${esc(error.message)}</div>`;return;}peopleCache=(data||[]).filter(p=>String(p.display_name||'').trim().length>0);} // V21: never list unnamed (unfinished or test) accounts
  const q=($('people-search')?.value||'').trim().toLowerCase();
  let me='';try{me=(await c.auth.getSession()).data.session?.user?.id||'';}catch(_e){}
  const rows=peopleCache.filter(p=>!q||[p.display_name,p.username,p.title,p.primary_affiliation_name,p.home_office,p.current_location,p.professional_level].join(' ').toLowerCase().includes(q));
  grid.innerHTML=rows.length?rows.slice(0,120).map(p=>`<button type="button" class="du-person-card" data-person="${p.id}"><span class="du-person-av">${p.avatar_url?`<img src="${esc(p.avatar_url)}" alt="">`:esc((p.display_name||'D').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())}</span><b>${esc(p.display_name)}${p.profile_verified?' <span class="du-check" title="Verified">✓</span>':''}</b><small>${esc(p.title||p.professional_level||'')}</small><small>${esc([p.primary_affiliation_name,p.home_office||p.current_location].filter(Boolean).join(' · '))}</small><span class="du-person-open">View profile →${me&&me===p.id?'':`<span class="du-person-msg" role="button" tabindex="0" data-msg="${p.id}" data-name="${esc(p.display_name)}">Message</span>`}</span></button>`).join(''):`<div class="people-empty" style="grid-column:1/-1">${q?'No members match that search.':'Profiles appear here as DrawUp members complete their public profiles.'}</div>`;
  grid.querySelectorAll('[data-person]').forEach(b=>b.onclick=e=>{if(e.target.closest('[data-msg]'))return;openPerson(b.dataset.person);});
  grid.querySelectorAll('[data-msg]').forEach(b=>b.onclick=e=>{e.stopPropagation();messageMember(b.dataset.msg,b.dataset.name);});
  if(q.length>=3)grid.insertAdjacentHTML('beforeend',`<div class="du-pr-cta" style="grid-column:1/-1"><div><span class="eyebrow">Beyond DrawUp members</span><b>Research “${esc(q)}” from public sources</b><small>Look up a well-known architect, designer or engineer. You get their bio, firm and projects with sources. This is outside research, not a DrawUp profile.</small></div><button type="button" class="btn btn-primary" id="du-pr-go">Look up “${esc(q.length>40?q.slice(0,40)+'…':q)}” →</button></div>`);
  const go=$('du-pr-go');if(go)go.onclick=()=>openResearchedPerson(($('people-search')?.value||'').trim());
}
// V20: message a DrawUp member through Connect.
async function messageMember(id,name){
  if(window.DrawUpConnect?.messageUser){try{await window.DrawUpConnect.messageUser(id,name);}catch(e){alert(e.message||String(e));}return;}
  if(window.DrawUpPortal?.isSignedIn?.()){window.DrawUpPortal.openPortal?.('connect');window.DrawUpPortal.openPortalTab('connect');}else $('drawup-signin')?.click();
}
// V20: well-known AEC people researched from public sources (saved to drawup_searches like every search).
async function openResearchedPerson(q){
  if(!q)return;$('du-v19-person')?.remove();
  document.body.insertAdjacentHTML('beforeend','<div id="du-v19-person" class="du-v19-overlay"><div class="du-v19-sheet du-pr"><button type="button" class="du-v19-x" aria-label="Close">×</button><div class="du-pr-wait"></div></div></div>');
  const ov=$('du-v19-person'),sheet=ov.querySelector('.du-v19-sheet');let closed=false;const close=()=>{closed=true;ov.remove();};ov.querySelector('.du-v19-x').onclick=close;ov.onclick=e=>{if(e.target===ov)close();};
  const wait=sheet.querySelector('.du-pr-wait');
  const hl=window.DrawUpV20?.holoLoader?window.DrawUpV20.holoLoader(wait):null;if(hl){hl.set('Researching '+q+' from public sources…');const k=wait.querySelector('.du-holo-kicker');if(k)k.textContent='DRAWUP · PEOPLE RESEARCH';}else wait.innerHTML='<div class="du-loading">RESEARCHING…</div>';
  let r;try{r=await Research.run(q,'person');}catch(e){hl?.done();if(closed)return;wait.innerHTML=`<h2>Could not finish this lookup.</h2><p>${esc(e.message||String(e))}</p>`;return;}
  hl?.done();if(closed)return;
  const c=await db();const name=r.title||q;
  // Link names to DrawUp firm and project pages when DrawUp already has them.
  let firms=[],projects=[];try{firms=await window.DrawUpLive.loadFirms();}catch(_e){}
  const firmOf=n=>{const a=String(n||'').toLowerCase().trim();return a?firms.find(f=>f.name.toLowerCase()===a):null;};
  const pnames=(r.projects||[]).map(p=>p?.name).filter(Boolean).slice(0,12);
  if(c&&pnames.length){try{const {data}=await c.from('aec_projects').select('slug,name').in('name',pnames).eq('is_demo',false);projects=data||[];}catch(_e){}}
  const projOf=n=>projects.find(p=>p.name.toLowerCase()===String(n||'').toLowerCase());
  const members=(peopleCache||[]).filter(p=>p.display_name&&p.display_name.toLowerCase()===String(name).toLowerCase());
  const link=(u,t)=>safeUrl(u)?`<a href="${esc(u)}" target="_blank" rel="noopener">${t} ↗</a>`:'';
  const life=[r.born&&('Born '+r.born),r.died&&('Died '+r.died),r.nationality,r.based_in&&('Based in '+r.based_in)].filter(Boolean).join(' · ');
  const img=safeUrl(r.image)?r.image:'';
  sheet.innerHTML=`<button type="button" class="du-v19-x" aria-label="Close">×</button>
  <div class="du-pr-flag">Outside research · compiled from public sources, not a DrawUp member profile${r._saved_at?' · saved '+esc(new Date(r._saved_at).toLocaleDateString()):''}</div>
  <div class="du-v19-phead">${img?`<span class="du-person-av big"><img src="${esc(img)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.textContent='${esc(String(name).split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())}'"></span>`:`<span class="du-person-av big">${esc(String(name).split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())}</span>`}<div><span class="eyebrow">${esc(r.role||'AEC professional')}</span><h2>${esc(name)}</h2>${life?`<p>${esc(life)}</p>`:''}${link(r.website,'Official website')?`<p>${link(r.website,'Official website')}</p>`:''}</div></div>
  ${members.length?`<p class="du-pr-member">A DrawUp member is named ${esc(name)}. <button type="button" class="btn btn-ghost btn-sm" data-open-member="${members[0].id}">View their DrawUp profile</button></p>`:''}
  ${r.summary?`<p><b>${esc(r.summary)}</b></p>`:''}${r.bio&&r.bio!==r.summary?String(r.bio).split(/\n+/).map(x=>`<p>${esc(x)}</p>`).join(''):''}
  ${(r.known_for||[]).filter(Boolean).length?`<p class="meta">Known for: ${esc(r.known_for.filter(Boolean).join(' · '))}</p>`:''}
  ${(r.firms||[]).length?`<h3>Firm${r.firms.length>1?'s':''}</h3><ul class="du-v19-tl">${r.firms.map(f=>{const d=firmOf(f.name);return `<li><b>${d?`<a href="#" data-firm-slug="${esc(d.slug)}">${esc(f.name)}</a> <span class="du-pr-on">On DrawUp</span>`:esc(f.name||'')}</b>${f.role?' · '+esc(f.role):''}<small>${esc(f.years||'')} ${link(f.url,'Site')}</small></li>`;}).join('')}</ul>`:''}
  ${(r.projects||[]).length?`<h3>Notable projects</h3><div class="du-pr-projects">${r.projects.slice(0,12).map(p=>{const d=projOf(p.name);return `<div class="du-pr-proj"><b>${d?`<a href="#" data-project-slug="${esc(d.slug)}">${esc(p.name)}</a> <span class="du-pr-on">On DrawUp</span>`:esc(p.name||'')}</b><small>${esc([p.type,p.location,p.year].filter(Boolean).join(' · '))}</small>${link(p.url,'Source')}</div>`;}).join('')}</div>`:''}
  ${(r.education||[]).length?`<h3>Education</h3><ul class="du-v19-tl">${r.education.map(e=>`<li><b>${esc(e.school||'')}</b><small>${esc(e.detail||'')}</small></li>`).join('')}</ul>`:''}
  ${(r.awards||[]).length?`<h3>Awards</h3><ul class="du-v19-tl">${r.awards.map(a=>`<li><b>${esc(a.name||'')}</b><small>${esc(a.year||'')}</small></li>`).join('')}</ul>`:''}
  <h3>Sources</h3>${(r.sources||[]).length?`<ol class="du-pr-src">${r.sources.map(x=>`<li>${link(x.url,esc(x.title||x.publisher||x.url))}${x.publisher?` <small>${esc(x.publisher)}</small>`:''}</li>`).join('')}</ol>`:'<p class="meta">No sources were returned, so treat this lookup as unconfirmed.</p>'}
  <p class="meta">Facts come only from the sources listed. If something is wrong, it is wrong at the source or the lookup misread it, so check before you rely on it.</p>`;
  sheet.querySelector('.du-v19-x').onclick=close;
  sheet.querySelector('[data-open-member]')?.addEventListener('click',e=>{openPerson(e.target.dataset.openMember);});
  const inPortal=()=>window.DrawUpPortal?.isSignedIn?.()&&$('du-portal')?.classList.contains('open');
  sheet.querySelectorAll('[data-firm-slug]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();close();(inPortal()?window.DrawUpPortal.openFirm:window.DrawUpLive.openFirm)(a.dataset.firmSlug);},true));
  sheet.querySelectorAll('[data-project-slug]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();close();(inPortal()&&window.DrawUpPortal.openProject?window.DrawUpPortal.openProject:window.DrawUpLive.openProject)(a.dataset.projectSlug);},true));
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
  let myId='';try{myId=(await c.auth.getSession()).data.session?.user?.id||'';}catch(_e){}
  sheet.innerHTML=`<button type="button" class="du-v19-x" aria-label="Close">×</button><div class="du-v19-phead"><span class="du-person-av big">${p.avatar_url?`<img src="${esc(p.avatar_url)}" alt="">`:esc((p.display_name||'D').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())}</span><div><span class="eyebrow">DrawUp Profile</span><h2>${esc(p.display_name||'DrawUp member')}${p.profile_verified?' <span class="du-check">✓</span>':''}</h2><p>${esc([p.username?'@'+p.username:'',p.pronouns,p.title].filter(Boolean).join(' · '))}</p><p>${p.primary_affiliation_name?(firm?`<a href="#" data-firm-slug="${esc(firm.slug)}">${esc(p.primary_affiliation_name)}</a>`:esc(p.primary_affiliation_name)):''}${p.home_office?' · Home office: '+esc(p.home_office):p.current_location?' · '+esc(p.current_location):''}</p></div></div>
  ${p.bio?`<p>${esc(p.bio)}</p>`:''}${(p.disciplines||[]).length||(p.credentials||[]).length?`<p class="meta">${esc([...(p.credentials||[]),...(p.disciplines||[])].join(' · '))}</p>`:''}
  <h3>Experience</h3>${(car||[]).length?`<ul class="du-v19-tl">${car.map(r=>`<li><b>${esc(r.role)}</b>${r.organization?' · '+esc(r.organization):''}${r.verified?' <span class="du-check" title="Verified by DrawUp">✓</span>':''}<small>${esc([r.location,[yr(r.start_date),r.end_date?yr(r.end_date):'present'].filter(Boolean).join('–')].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>`:'<p class="meta">No experience listed.</p>'}
  <h3>Education</h3>${(edu||[]).length?`<ul class="du-v19-tl">${edu.map(e=>`<li><b>${esc(e.institution_name)}</b><small>${esc([e.degree_or_certificate,e.program,e.graduation_year].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>`:'<p class="meta">No education listed.</p>'}
  <p>${safeUrl(p.website)?`<a class="btn btn-ghost btn-sm" href="${esc(p.website)}" target="_blank" rel="noopener">Website ↗</a> `:''}${safeUrl(p.linkedin_url)?`<a class="btn btn-ghost btn-sm" href="${esc(p.linkedin_url)}" target="_blank" rel="noopener">LinkedIn ↗</a>`:''} ${myId&&myId!==p.id?`<button type="button" class="btn btn-primary btn-sm" data-msg-person="${p.id}">Message ${esc((p.display_name||'').split(/\s+/)[0])}</button>`:''}</p>`;
  sheet.querySelector('[data-msg-person]')?.addEventListener('click',()=>{close();messageMember(p.id,p.display_name);});
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
