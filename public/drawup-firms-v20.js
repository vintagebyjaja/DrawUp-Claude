/* DrawUp v20: firm featured work + Locations & Studios.
   A firm picks 4 to 6 featured projects (ordered). Offices, studios, departments and practice groups
   each get their own white profile page under the firm: #firm/<firm-slug>/<unit-slug>.
   Existing firm_offices rows are read directly (never copied) and show as office pages until an admin
   gives that office its own unit page. Tables: firm_units, firm_unit_photos, firm_unit_projects,
   firm_unit_members, firm_featured_projects (migration 0032). Writes are protected by RLS. */
(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const $=id=>document.getElementById(id);
async function db(){for(let i=0;i<100;i++){if(window.drawupSupabaseClient)return window.drawupSupabaseClient;await new Promise(r=>setTimeout(r,100));}return null;}
const US=new Set(['US','USA','United States','']);
const place=o=>[o.city,o.state,o.country&&!US.has(o.country)?o.country:''].filter(Boolean).join(', ');
const yr=p=>p.completion_year||p.opened_year||0;
const KIND={office:'Office',studio:'Studio',department:'Department',practice:'Practice group'};
const MAXF=6,MINF=4;
const RESERVED=new Set(['locations','overview']);
function slugify(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/&/g,' and ').replace(/\+/g,' ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,72)||'unit';}
function uniqueSlug(base,used){let s=base,i=2;if(RESERVED.has(s))s=s+'-'+i++;while(used.has(s))s=base+'-'+i++;used.add(s);return s;}
const inPortal=()=>!!(window.DrawUpPortal?.isSignedIn?.()&&$('du-portal')?.classList.contains('open'));
const opener=()=>inPortal()?{firm:window.DrawUpPortal.openFirm,project:window.DrawUpPortal.openProject}:{firm:window.DrawUpLive.openFirm,project:window.DrawUpLive.openProject};
const featErr=m=>/firm_featured_max_six|max_six/.test(m||'')?'A firm can feature at most 6 projects. Remove one before adding another.':/row-level security|violates/.test(m||'')?'Only admins of this firm can change its featured work.':m;

/* ---------------------------------------------------------------- ordering */
// Featured first (in the firm's chosen order), then everything else newest first.
// No choice made yet: the 6 most recent projects are featured.
function orderProjects(projects,featuredRows){
  const byId=new Map(projects.map(p=>[p.id,p]));
  const feat=(featuredRows||[]).slice().sort((a,b)=>a.slot-b.slot).map(r=>byId.get(r.project_id)).filter(Boolean);
  const recent=projects.slice().sort((a,b)=>yr(b)-yr(a)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const chosen=feat.length>0,featured=chosen?feat:recent.slice(0,MAXF),fset=new Set(featured.map(p=>p.id));
  return {featured,chosen,fset,all:[...featured,...recent.filter(p=>!fset.has(p.id))]};
}
async function loadFeatured(c,firmId,unitId){
  let q=c.from('firm_featured_projects').select('project_id,slot,unit_id').eq('firm_id',firmId);q=unitId?q.eq('unit_id',unitId):q.is('unit_id',null);
  const r=await q.order('slot').then(x=>x,()=>({data:[]}));return r.error?[]:(r.data||[]);
}

/* ---------------------------------------------------------------- firm data */
// Units plus offices that do not have their own unit page yet (read from firm_offices, never copied).
function mergeUnits(f,units,offices){
  const used=new Set((units||[]).map(u=>u.slug)),linked=new Set((units||[]).map(u=>u.office_id).filter(Boolean));
  const list=(units||[]).map(u=>{const o=u.office_id?(offices||[]).find(x=>x.id===u.office_id):null;return {...u,office:o||null,city:u.city||o?.city,state:u.state||o?.state,country:u.country||o?.country};});
  (offices||[]).filter(o=>!linked.has(o.id)).sort((a,b)=>(b.is_headquarters?1:0)-(a.is_headquarters?1:0)||String(a.city).localeCompare(String(b.city)))
    .forEach(o=>list.push({id:'office:'+o.id,pseudo:true,kind:'office',slug:uniqueSlug(slugify([o.city,o.state].filter(Boolean).join(' '))+'-office',used),name:`${f.name} ${o.city}`,city:o.city,state:o.state,country:o.country,office:o,office_id:o.id}));
  return list;
}
async function firmExtras(c,f){
  try{
    const ok=r=>r&&!r.error?(r.data||[]):[];
    const [fe,un,ph,pr]=await Promise.all([loadFeatured(c,f.id,null),
      c.from('firm_units').select('*').eq('firm_id',f.id).order('sort_order').order('name').then(x=>x,()=>null),
      c.from('firm_unit_photos').select('unit_id,image_url,caption,sort_order').eq('firm_id',f.id).order('sort_order').then(x=>x,()=>null),
      c.from('firm_unit_projects').select('unit_id,project_id').eq('firm_id',f.id).then(x=>x,()=>null)]);
    const units=mergeUnits(f,ok(un),f.firm_offices||[]),photos=ok(ph),uprojects=ok(pr);
    units.forEach(u=>{u.photos=photos.filter(p=>p.unit_id===u.id);u.projectCount=uprojects.filter(p=>p.unit_id===u.id).length;});
    return {featured:fe,units,installed:!un?.error};
  }catch(_e){return null;}
}

/* ---------------------------------------------------------------- firm profile pieces */
function card(p,f){return window.DrawUpLive.projectCard({...p,project_firms:[{role:p.role,firms:{name:f.name,slug:f.slug}}]});}
function projectsHTML(f,projects,ex){
  if(!projects.length)return '<section><h2>Projects</h2><p class="meta">No projects are attributed to this firm on DrawUp yet.</p></section>';
  const o=orderProjects(projects,ex?.featured);
  return `<section class="du-fp-featured"><div class="du-fp-sechead"><h2>Featured work</h2><span class="meta">${o.chosen?'Chosen by the firm':'Most recent projects on DrawUp'}</span></div><div class="card-grid du-firm-projects">${o.featured.map(p=>card(p,f)).join('')}</div></section>
  <section class="du-fp-all"><div class="du-fp-sechead"><h2>All projects <span class="du-fp-count">(${projects.length})</span></h2><button class="du-fp-btn" type="button" data-du-showcase="${esc(f.slug)}">Open the showcase</button></div>
  <ul class="du-fp-plist">${o.all.map(p=>`<li><a href="#" data-project-slug="${esc(p.slug)}">${esc(p.name)}</a>${o.fset.has(p.id)?'<span class="du-fp-star">Featured</span>':''}<small>${esc([place(p),p.project_type,yr(p)||'',p.role].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul></section>`;
}
function unitCard(f,u){
  const img=u.photos?.[0]?.image_url||u.hero_image_url||'';
  return `<a class="du-fu-card" data-du-action="du-firm-link" href="#firm/${esc(f.slug)}/${esc(u.slug)}" data-du-unit="${esc(u.slug)}" data-du-unit-firm="${esc(f.slug)}">
    <span class="du-fu-img${img?'':' none'}">${img?`<img src="${esc(img)}" alt="" loading="lazy">`:`<b>${esc(KIND[u.kind]||'Studio')}</b>`}</span>
    <span class="du-fu-txt"><span class="du-fu-kind">${esc(KIND[u.kind]||'Studio')}${u.office?.is_headquarters?' · Headquarters':''}</span><b>${esc(u.name)}</b>${place(u)?`<small>${esc(place(u))}</small>`:''}
    ${u.description?`<p>${esc(String(u.description).slice(0,140))}${String(u.description).length>140?'…':''}</p>`:''}
    <small class="du-fu-meta">${u.pseudo?'Office listing':[u.projectCount?u.projectCount+' project'+(u.projectCount===1?'':'s'):'',u.photos?.length?u.photos.length+' photo'+(u.photos.length===1?'':'s'):''].filter(Boolean).join(' · ')||'Profile page'}</small></span></a>`;
}
function locationsHTML(f,ex){
  const units=ex?.units||[],groups=units.filter(u=>u.kind!=='office'),offices=units.filter(u=>u.kind==='office');
  return `<section><div class="du-fp-sechead"><h2>Studios, departments and practice groups</h2></div>${groups.length?`<div class="du-fu-grid">${groups.map(u=>unitCard(f,u)).join('')}</div>`:'<p class="meta">This firm has not added studios or departments yet. Firm admins add them from Manage this firm → Locations & studios.</p>'}</section>
  <section><div class="du-fp-sechead"><h2>Offices</h2><span class="meta">${offices.length} location${offices.length===1?'':'s'}</span></div>${offices.length?`<div class="du-fu-grid">${offices.map(u=>unitCard(f,u)).join('')}</div>`:'<p class="meta">No offices on file yet.</p>'}</section>`;
}
function tabsHTML(f,ex){const n=(ex?.units||[]).length;return `<nav class="du-fp-tabs" role="tablist"><button type="button" role="tab" class="on" data-fp-tab="overview">Overview</button><button type="button" role="tab" data-fp-tab="locations">Locations &amp; Studios <span>${n}</span></button></nav>`;}
function selectTab(root,tab){
  root.querySelectorAll('[data-fp-tab]').forEach(b=>{b.classList.toggle('on',b.dataset.fpTab===tab);b.setAttribute('aria-selected',b.dataset.fpTab===tab);});
  root.querySelectorAll('[data-fp-pane]').forEach(p=>p.hidden=p.dataset.fpPane!==tab);
}
function bind(root){
  const prof=root.querySelector('.du-fp[data-firm]');
  root.querySelectorAll('[data-fp-tab]').forEach(b=>b.onclick=()=>{selectTab(root,b.dataset.fpTab);if(prof&&!inPortal())history.replaceState(null,'','#firm/'+prof.dataset.firm+(b.dataset.fpTab==='locations'?'/locations':''));});
  root.querySelectorAll('[data-du-unit]').forEach(a=>a.onclick=e=>{e.preventDefault();e.stopPropagation();openUnit(a.dataset.duUnitFirm,a.dataset.duUnit);});
  root.querySelectorAll('[data-du-firm-tab]').forEach(a=>a.onclick=e=>{e.preventDefault();e.stopPropagation();openFirmAt(a.dataset.duFirmTab,a.dataset.tab||'overview');});
}
async function openFirmAt(slug,tab){
  await opener().firm(slug);
  const root=inPortal()?$('du-workspace-content'):$('du-live-firm-profile');
  if(root&&tab==='locations'){selectTab(root,'locations');if(!inPortal())history.replaceState(null,'','#firm/'+slug+'/locations');}
}

/* ---------------------------------------------------------------- unit profile page */
function lightbox(list,i,title){
  $('du-sc-lb')?.remove();
  document.body.insertAdjacentHTML('beforeend','<div id="du-sc-lb" class="du-sc-lb"><button type="button" class="du-sc-x" aria-label="Close">×</button><button type="button" class="du-sc-nav prev" aria-label="Previous">‹</button><figure><img alt=""><figcaption></figcaption></figure><button type="button" class="du-sc-nav next" aria-label="Next">›</button></div>');
  const lb=$('du-sc-lb'),show=()=>{const it=list[i];lb.querySelector('img').src=it.image_url;lb.querySelector('img').alt=it.caption||title;lb.querySelector('figcaption').textContent=[it.caption,(i+1)+' of '+list.length].filter(Boolean).join(' · ');};
  lb.querySelector('.prev').onclick=()=>{i=(i-1+list.length)%list.length;show();};lb.querySelector('.next').onclick=()=>{i=(i+1)%list.length;show();};
  lb.querySelector('.du-sc-x').onclick=()=>lb.remove();lb.onclick=e=>{if(e.target===lb)lb.remove();};show();
}
const ini=n=>esc(String(n||'D').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase());
async function unitHTML(c,firmSlug,unitSlug){
  const {data:f}=await c.from('firms').select('id,name,slug,logo_url,hero_image_url,discipline,website,firm_offices(*)').eq('slug',firmSlug).eq('is_demo',false).maybeSingle();
  if(!f)return {html:null};
  const ex=await firmExtras(c,f);const u=(ex?.units||[]).find(x=>x.slug===unitSlug);if(!u)return {html:null,f};
  const real=!u.pseudo,city=(u.city||'').toLowerCase();
  const [pr,fe,mem,roster,people,me]=await Promise.all([
    real?c.from('firm_unit_projects').select('project_id,aec_projects(id,slug,name,city,state,country,project_type,completion_year,opened_year,created_at,description,image_page_url,is_demo,project_images(image_url,is_hero,sort_order))').eq('unit_id',u.id).then(x=>x,()=>({data:[]})):{data:[]},
    real?loadFeatured(c,f.id,u.id):[],
    real?c.from('firm_unit_members').select('user_id,title,profiles(id,display_name,username,avatar_url,title,discoverable,is_public)').eq('unit_id',u.id).then(x=>x,()=>({data:[]})):{data:[]},
    u.kind==='office'&&city?c.rpc('drawup_firm_roster',{p_firm_id:f.id}).then(x=>x.data||[],()=>[]):[],
    u.office_id?c.from('firm_office_people').select('name,title,is_head,sort_order').eq('office_id',u.office_id).order('sort_order').then(x=>x.data||[],()=>[]):[],
    c.auth.getSession().then(x=>x.data.session?.user||null,()=>null)]);
  const roles=new Map();(await c.from('project_firms').select('project_id,role').eq('firm_id',f.id).then(x=>x.data||[],()=>[])).forEach(r=>roles.set(r.project_id,r.role));
  const projects=(pr.data||[]).map(x=>x.aec_projects).filter(p=>p&&!p.is_demo).map(p=>({...p,role:roles.get(p.id)||''}));
  const o=orderProjects(projects,fe);
  const team=(mem.data||[]).filter(m=>m.profiles&&m.profiles.display_name&&m.profiles.discoverable!==false&&m.profiles.is_public!==false);
  const teamIds=new Set(team.map(m=>m.user_id));
  const fromHistory=(roster||[]).filter(r=>r.is_current&&!teamIds.has(r.user_id)&&String(r.location||'').toLowerCase().includes(city));
  const photos=(u.photos||[]),hero=u.hero_image_url||photos[0]?.image_url||'';
  const isMember=me&&!me.is_anonymous&&(await Promise.all([c.rpc('drawup_my_firms').then(x=>(x.data||[]).some(m=>m.id===f.id),()=>false),c.rpc('drawup_firm_roster',{p_firm_id:f.id}).then(x=>(x.data||[]).some(r=>r.user_id===me.id&&r.is_current),()=>false)])).some(Boolean);
  const joined=me&&teamIds.has(me.id);
  const adm=me?await c.rpc('is_firm_admin',{target_firm_id:f.id}).then(x=>x.data===true,()=>false):false;
  const stat=(n,l)=>`<div class="du-fp-stat"><b>${esc(n)}</b><span>${esc(l)}</span></div>`;
  const person=(id,name,sub,av,uname)=>`<button type="button" class="du-fu-person" ${id?`data-du-person="${esc(id)}"`:'disabled'}><span class="du-roster-av">${av?`<img src="${esc(av)}" alt="">`:ini(name)}</span><span><b>${esc(name)}</b>${sub?`<small>${esc(sub)}</small>`:''}${uname?`<small>@${esc(uname)}</small>`:''}</span></button>`;
  const off=u.office;
  const html=`<div class="du-live-profile du-fp du-fu" data-firm="${esc(f.slug)}" data-unit="${esc(u.slug)}">
  <nav class="du-fu-crumb" aria-label="Breadcrumb"><a data-du-action="du-firm-link" href="#firm/${esc(f.slug)}" data-du-firm-tab="${esc(f.slug)}" data-tab="overview">${esc(f.name)}</a><span>›</span><a data-du-action="du-firm-link" href="#firm/${esc(f.slug)}/locations" data-du-firm-tab="${esc(f.slug)}" data-tab="locations">Locations &amp; Studios</a><span>›</span><b>${esc(u.name)}</b></nav>
  <header class="du-fp-hero${hero?'':' plain'}"${hero?` style="--fp-hero:url('${esc(hero).replace(/'/g,'%27')}')"`:''}><div class="du-fp-hero-in">
    <div class="du-fp-logo">${f.logo_url?`<img src="${esc(f.logo_url)}" alt="${esc(f.name)} logo">`:`<span>${ini(f.name)}</span>`}</div>
    <div class="du-fp-id"><span class="du-fp-kicker">${esc(f.name)} · ${esc(KIND[u.kind]||'Studio')}${off?.is_headquarters?' · Headquarters':''}</span><h1>${esc(u.name)}</h1><p>${esc(place(u))}</p></div></div></header>
  <div class="du-fp-bar"><div class="du-fp-stats">${stat(projects.length,projects.length===1?'Project':'Projects')}${stat(photos.length,photos.length===1?'Photo':'Photos')}${stat(team.length+fromHistory.length,'Team on DrawUp')}</div>
    <div class="du-fp-actions"><button class="du-fp-btn" type="button" data-du-firm-tab="${esc(f.slug)}" data-tab="overview">← ${esc(f.name)}</button>${isMember&&real?`<button class="du-fp-btn primary" type="button" data-fu-join="${joined?'leave':'join'}">${joined?'Remove me from this team':'I work here: add me'}</button>`:''}${adm?`<button class="du-fp-btn accent" type="button" data-fu-manage="${esc(f.slug)}" data-fu-unit-id="${esc(real?u.id:'')}">Manage this ${esc((KIND[u.kind]||'studio').toLowerCase())}</button>`:''}</div></div>
  <div class="du-fp-body">
  <section class="du-fp-about"><div><h2>About</h2>${u.description?`<p class="du-live-desc">${esc(u.description)}</p>`:`<p class="meta">${u.pseudo?`This office is listed on ${esc(f.name)}’s profile. It has not set up its own page yet.`:'No description added yet.'}</p>`}
    ${u.leader_name?`<p class="du-fu-lead"><span class="meta">Led by</span> <b>${esc(u.leader_name)}</b>${u.leader_title?` · ${esc(u.leader_title)}`:''}</p>`:''}
    ${off?`<div class="du-fu-office">${off.address?`<span>${esc(off.address)}</span>`:''}${off.phone?`<a href="tel:${esc(off.phone)}">${esc(off.phone)}</a>`:''}${off.source==='member_reported'&&!off.is_confirmed?'<span class="du-office-tag">Reported by a DrawUp member</span>':off.source==='public_research'&&!off.is_confirmed?'<span class="du-office-tag">Unconfirmed</span>':''}</div>`:''}</div>
    ${photos.length?`<div class="du-fp-photos">${photos.slice(0,4).map((p,i)=>`<figure><button type="button" data-fu-photo="${i}"><img src="${esc(p.image_url)}" alt="${esc(p.caption||u.name)}" loading="lazy"></button>${p.caption?`<figcaption>${esc(p.caption)}</figcaption>`:''}</figure>`).join('')}</div>`:''}</section>
  ${photos.length>4?`<section><h2>Photos <span class="du-fp-count">(${photos.length})</span></h2><div class="du-fu-gallery">${photos.map((p,i)=>`<button type="button" data-fu-photo="${i}"><img src="${esc(p.image_url)}" alt="${esc(p.caption||'')}" loading="lazy"></button>`).join('')}</div></section>`:''}
  ${projects.length?`<section class="du-fp-featured"><div class="du-fp-sechead"><h2>Featured work</h2><span class="meta">${o.chosen?'Chosen by the firm':'Most recent projects'}</span></div><div class="card-grid du-firm-projects">${o.featured.map(p=>card(p,f)).join('')}</div></section>
  <section class="du-fp-all"><div class="du-fp-sechead"><h2>All projects <span class="du-fp-count">(${projects.length})</span></h2></div><ul class="du-fp-plist">${o.all.map(p=>`<li><a href="#" data-project-slug="${esc(p.slug)}">${esc(p.name)}</a>${o.fset.has(p.id)?'<span class="du-fp-star">Featured</span>':''}<small>${esc([place(p),p.project_type,yr(p)||'',p.role].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul></section>`
  :`<section><h2>Projects</h2><p class="meta">${u.pseudo?'Projects are attached to an office once the firm gives it its own page.':'No projects attached yet.'} See all of ${esc(f.name)}’s work on the <a data-du-action="du-firm-link" href="#firm/${esc(f.slug)}" data-du-firm-tab="${esc(f.slug)}" data-tab="overview">main firm profile</a>.</p></section>`}
  <section><h2>Team on DrawUp</h2>${team.length||fromHistory.length||people.length?`<div class="du-fu-team">${team.map(m=>person(m.user_id,m.profiles.display_name,m.title||m.profiles.title,m.profiles.avatar_url,m.profiles.username)).join('')}${fromHistory.map(r=>person(r.user_id,r.display_name,r.role,r.avatar_url,r.username)).join('')}${people.map(p=>person('',p.name,[p.title,p.is_head?'Office lead':''].filter(Boolean).join(' · '),'','')).join('')}</div>
    <p class="meta du-source-note">${team.length?'Members chose to list themselves on this page. ':''}${fromHistory.length?'Others are DrawUp members whose current work history lists this office city. ':''}Members choose whether their profile is public.</p>`:`<p class="meta">No DrawUp members have added themselves to this ${esc((KIND[u.kind]||'studio').toLowerCase())} yet.${real?' Members of the firm can add themselves with “I work here”.':''}</p>`}</section>
  </div></div>`;
  return {html,f,u,photos};
}
async function openUnit(firmSlug,unitSlug){
  const c=await db();if(!c)return;
  const portal=inPortal();
  let host;
  if(portal){host=$('du-workspace-content');}
  else{document.querySelectorAll('.v12-portal.open').forEach(x=>x.classList.remove('open'));host=$('du-live-firm-profile');if(!host)return;document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!=='page-firm-profile');window.scrollTo(0,0);}
  host.innerHTML='<p class="meta">Loading…</p>';
  const r=await unitHTML(c,firmSlug,unitSlug);
  const body=r.html||`<div class="du-live-empty"><h3>Location not found.</h3><p>${r.f?`${esc(r.f.name)} has no office or studio page at this address. <a data-du-action="du-firm-link" href="#firm/${esc(firmSlug)}/locations" data-du-firm-tab="${esc(firmSlug)}" data-tab="locations">See its locations</a>.`:'This firm is not in the DrawUp directory.'}</p></div>`;
  host.innerHTML=portal?`<div class="du-work-head"><div><span class="du-kicker">DRAWUP FIRM</span></div><button class="du-btn ghost" data-portal-tab="search">← Back to search</button></div>${body}`:body;
  if(!portal)history.replaceState(null,'','#firm/'+firmSlug+'/'+unitSlug);
  const op=opener();window.DrawUpLive?.bindProfileLinks?.(host,op.firm,op.project);bind(host);
  if(!r.html)return;
  host.querySelectorAll('[data-fu-photo]').forEach(b=>b.onclick=()=>lightbox(r.photos,+b.dataset.fuPhoto,r.u.name));
  const j=host.querySelector('[data-fu-join]');if(j)j.onclick=async()=>{const s=(await c.auth.getSession()).data.session;if(!s)return;j.disabled=true;
    const res=j.dataset.fuJoin==='join'?await c.from('firm_unit_members').insert({unit_id:r.u.id,firm_id:r.f.id,user_id:s.user.id}):await c.from('firm_unit_members').delete().eq('unit_id',r.u.id).eq('user_id',s.user.id);
    if(res.error){j.disabled=false;j.textContent='Not saved: '+res.error.message;return;}openUnit(firmSlug,unitSlug);};
  const m=host.querySelector('[data-fu-manage]');if(m)m.onclick=()=>{const id=m.dataset.fuUnitId;try{sessionStorage.setItem('du-manage-firm',firmSlug);}catch(_e){}
    if(window.DrawUpPortal?.isSignedIn?.()){history.replaceState(null,'','#portal/firm?firm='+encodeURIComponent(firmSlug)+'&pane=units'+(id?'&unit='+id:''));window.DrawUpPortal.openPortal('firm');window.DrawUpPortal.openPortalTab('firm');}};
}

/* ---------------------------------------------------------------- firm admin: featured picker */
// Renders into `host`. projects: [{id,name,...}]. Saves through drawup_set_featured (RLS decides who may write).
async function featuredPicker(host,c,firm,projects,unitId,label){
  const rows=await loadFeatured(c.client,firm.id,unitId);
  let sel=rows.sort((a,b)=>a.slot-b.slot).map(r=>r.project_id).filter(id=>projects.some(p=>p.id===id));
  const draw=(msg,bad)=>{
    const rest=projects.filter(p=>!sel.includes(p.id));
    host.innerHTML=`<div class="du-section-title"><h2>${esc(label||'Featured work')}</h2><span class="du-fa-fcount">${sel.length} of ${MAXF}</span></div>
    <p class="du-muted">Pick ${MINF} to ${MAXF} projects to lead the public profile, in order. Every other project stays listed under All projects and in the showcase.${sel.length?'':' Nothing chosen yet, so the profile shows the 6 most recent.'}</p>
    <ol class="du-fa-feat">${sel.map((id,i)=>{const p=projects.find(x=>x.id===id);return `<li><b>${i+1}. ${esc(p.name)}</b><small>${esc([place(p),yr(p)||''].filter(Boolean).join(' · '))}</small><span><button class="du-btn ghost" data-f-up="${i}" ${i?'':'disabled'} aria-label="Move up">↑</button><button class="du-btn ghost" data-f-down="${i}" ${i<sel.length-1?'':'disabled'} aria-label="Move down">↓</button><button class="du-btn ghost" data-f-rm="${esc(id)}">Remove</button></span></li>`;}).join('')||'<li class="du-muted">No featured projects chosen.</li>'}</ol>
    ${rest.length?`<div class="du-fa-pick">${rest.map(p=>`<button type="button" class="du-btn ghost" data-f-add="${esc(p.id)}">+ ${esc(p.name)}</button>`).join('')}</div>`:''}
    <p><button class="du-btn primary" data-f-save>Save featured work</button> <span class="du-save-status du-fa-fmsg${bad?' bad':''}" role="status">${esc(msg||'')}</span></p>`;
    host.querySelectorAll('[data-f-add]').forEach(b=>b.onclick=()=>{if(sel.length>=MAXF){draw(`You can feature at most ${MAXF} projects. Remove one before adding another.`,true);return;}sel.push(b.dataset.fAdd);draw();});
    host.querySelectorAll('[data-f-rm]').forEach(b=>b.onclick=()=>{sel=sel.filter(x=>x!==b.dataset.fRm);draw();});
    host.querySelectorAll('[data-f-up]').forEach(b=>b.onclick=()=>{const i=+b.dataset.fUp;[sel[i-1],sel[i]]=[sel[i],sel[i-1]];draw();});
    host.querySelectorAll('[data-f-down]').forEach(b=>b.onclick=()=>{const i=+b.dataset.fDown;[sel[i+1],sel[i]]=[sel[i],sel[i+1]];draw();});
    host.querySelector('[data-f-save]').onclick=async()=>{
      if(sel.length>MAXF){draw(`You can feature at most ${MAXF} projects.`,true);return;}
      const {error}=await c.client.rpc('drawup_set_featured',{p_firm_id:firm.id,p_unit_id:unitId||null,p_project_ids:sel});
      if(error){draw('Not saved: '+featErr(error.message),true);return;}
      draw(sel.length&&sel.length<MINF&&projects.length>=MINF?`Saved. Tip: ${MINF} to ${MAXF} featured projects make the strongest profile.`:'Saved. The public profile shows these first.');c.toast?.('Featured work saved.');};
  };
  draw();
}
async function adminFeatured(body,c,firm,rows){
  const host=document.createElement('article');host.className='du-glass du-fa-featured';body.prepend(host);
  const projects=(rows||[]).map(x=>x.aec_projects).filter(Boolean);
  if(!projects.length){host.innerHTML='<h2>Featured work</h2><p class="du-muted">Add projects below, then choose 4 to 6 to feature on your public profile.</p>';return;}
  await featuredPicker(host,c,firm,projects,null,'Featured work');
}

/* ---------------------------------------------------------------- firm admin: locations & studios */
async function adminUnits(body,c,firm,go,params,h){
  const cl=c.client,unitId=params.get('unit');
  const [{data:units,error},{data:offices},{data:pf}]=await Promise.all([cl.from('firm_units').select('*').eq('firm_id',firm.id).order('sort_order').order('name'),cl.from('firm_offices').select('*').eq('firm_id',firm.id).order('is_headquarters',{ascending:false}).order('city'),cl.from('project_firms').select('role,aec_projects(id,slug,name,city,state,country,project_type,completion_year,opened_year)').eq('firm_id',firm.id)]);
  if(error){body.innerHTML=`<article class="du-glass"><h2>Locations & studios need the v20 firms database update.</h2><p class="du-muted">${esc(/relation|schema cache|does not exist/i.test(error.message)?'Run drawup-v20-firms-01 to 03 in Supabase, then reload.':error.message)}</p></article>`;return;}
  const projects=[];const seen=new Set();(pf||[]).forEach(x=>{const p=x.aec_projects;if(p&&!seen.has(p.id)){seen.add(p.id);projects.push({...p,role:x.role});}});
  if(unitId)return unitEditor(body,c,firm,go,(units||[]).find(u=>u.id===unitId),offices||[],projects,h);
  const linked=new Set((units||[]).map(u=>u.office_id).filter(Boolean)),free=(offices||[]).filter(o=>!linked.has(o.id));
  const oname=o=>place(o)+(o.is_headquarters?' (HQ)':'');
  body.innerHTML=`<article class="du-glass"><div class="du-section-title"><h2>Locations &amp; studios</h2></div><p class="du-muted">Give each office, studio, department or practice group its own page under ${esc(firm.name)}, with its own photos, featured projects and team. Room for every team to show its work.</p>
  ${(units||[]).map(u=>`<div class="du-row"><div><b>${esc(u.name)}</b><small>${esc(KIND[u.kind]||u.kind)}${place(u)?' · '+esc(place(u)):''} · #firm/${esc(firm.slug)}/${esc(u.slug)}</small></div><div><button class="du-btn ghost" data-u-view="${esc(u.slug)}">View</button> <button class="du-btn primary" data-u-edit="${u.id}">Edit</button></div></div>`).join('')||'<p class="du-muted">No studios or office pages yet.</p>'}</article>
  ${free.length?`<article class="du-glass"><h2>Offices without their own page</h2><p class="du-muted">These show on your profile as office listings. Give one a page to add photos, projects and its team.</p>${free.map(o=>`<div class="du-row"><div><b>${esc(oname(o))}</b><small>${esc(o.address||'')}</small></div><button class="du-btn ghost" data-u-office="${o.id}">Give this office a page</button></div>`).join('')}</article>`:''}
  <article class="du-glass"><h2>Add a studio, department or office page</h2>
  <div class="du-two">${h.fld('Name','nu-name','','placeholder="e.g. Health studio, Sports + Recreation, Dallas office"')}<div class="du-field"><label>Kind</label><select id="nu-kind">${Object.entries(KIND).map(([k,l])=>`<option value="${k}" ${k==='studio'?'selected':''}>${l}</option>`).join('')}</select></div></div>
  <div class="du-two"><div class="du-field"><label>Office (optional)</label><select id="nu-office"><option value="">None</option>${free.map(o=>`<option value="${o.id}">${esc(oname(o))}</option>`).join('')}</select></div>${h.fld('City (optional)','nu-city','')}</div>
  <div class="du-field"><label>Description</label><textarea id="nu-desc" rows="3" placeholder="What this team does and what it is known for"></textarea></div>
  <div class="du-two">${h.fld('Leader (optional)','nu-lead','')}${h.fld('Leader title (optional)','nu-ltitle','')}</div>
  <p><button class="du-btn primary" id="nu-save">Create page</button> <span id="nu-st" class="du-save-status"></span></p></article>`;
  body.querySelectorAll('[data-u-view]').forEach(b=>b.onclick=()=>openUnit(firm.slug,b.dataset.uView));
  body.querySelectorAll('[data-u-edit]').forEach(b=>b.onclick=()=>go('units','&unit='+b.dataset.uEdit));
  const used=new Set((units||[]).map(u=>u.slug));
  const create=async row=>{row.slug=uniqueSlug(slugify(row.name),used);const {data,error:e}=await cl.from('firm_units').insert({...row,firm_id:firm.id,sort_order:(units||[]).length}).select('id').single();if(e)throw e;return data.id;};
  body.querySelectorAll('[data-u-office]').forEach(b=>b.onclick=async()=>{const o=offices.find(x=>x.id===b.dataset.uOffice);try{const id=await create({name:`${o.city} office`,kind:'office',office_id:o.id,city:o.city,state:o.state,country:o.country});c.toast('Office page created.');go('units','&unit='+id);}catch(e){c.toast(e.message,true);}});
  const v=id=>body.querySelector(id).value.trim();
  body.querySelector('#nu-office').onchange=e=>{const o=offices.find(x=>x.id===e.target.value);if(o){body.querySelector('#nu-kind').value='office';if(!v('#nu-city'))body.querySelector('#nu-city').value=o.city;if(!v('#nu-name'))body.querySelector('#nu-name').value=o.city+' office';}};
  body.querySelector('#nu-save').onclick=async()=>{const st=body.querySelector('#nu-st');if(!v('#nu-name')){st.textContent=' A name is required.';return;}st.textContent=' Creating…';
    const o=offices.find(x=>x.id===v('#nu-office'));
    try{const id=await create({name:v('#nu-name'),kind:v('#nu-kind'),office_id:o?.id||null,city:v('#nu-city')||o?.city||null,state:o?.state||null,country:o?.country||'US',description:v('#nu-desc')||null,leader_name:v('#nu-lead')||null,leader_title:v('#nu-ltitle')||null});c.toast('Page created. Add photos and projects next.');go('units','&unit='+id);}
    catch(e){st.textContent=' Not created: '+(/row-level/.test(e.message)?'only admins of this firm can add pages.':e.message);}};
}
async function unitEditor(body,c,firm,go,u,offices,projects,h){
  const cl=c.client;if(!u){body.innerHTML='<article class="du-glass"><h2>Page not found.</h2><button class="du-btn ghost" id="ue-back">← Locations &amp; studios</button></article>';body.querySelector('#ue-back').onclick=()=>go('units');return;}
  const [{data:photos},{data:att},{data:mem}]=await Promise.all([cl.from('firm_unit_photos').select('*').eq('unit_id',u.id).order('sort_order'),cl.from('firm_unit_projects').select('id,project_id').eq('unit_id',u.id),cl.from('firm_unit_members').select('id,user_id,title,profiles(display_name,username)').eq('unit_id',u.id)]);
  const attached=new Set((att||[]).map(a=>a.project_id));
  const avail=offices.filter(o=>o.id===u.office_id);
  body.innerHTML=`<p><button class="du-btn ghost" id="ue-back">← Locations &amp; studios</button> <button class="du-btn ghost" id="ue-view">View public page</button></p>
  <article class="du-glass"><h2>${esc(u.name)}</h2>
  <div class="du-two">${h.fld('Name','ue-name',u.name)}<div class="du-field"><label>Kind</label><select id="ue-kind">${Object.entries(KIND).map(([k,l])=>`<option value="${k}" ${k===u.kind?'selected':''}>${l}</option>`).join('')}</select></div></div>
  <div class="du-two">${h.fld('City','ue-city',u.city||'')}${h.fld('State / region','ue-state',u.state||'')}</div>
  <div class="du-field"><label>Description</label><textarea id="ue-desc" rows="4">${esc(u.description||'')}</textarea></div>
  <div class="du-two">${h.fld('Leader (optional)','ue-lead',u.leader_name||'')}${h.fld('Leader title (optional)','ue-ltitle',u.leader_title||'')}</div>
  ${avail.length?`<p class="du-muted">Linked to the ${esc(place(avail[0]))} office listing.</p>`:''}
  <p class="du-muted">Public link: #firm/${esc(firm.slug)}/${esc(u.slug)}</p>
  <p><button class="du-btn primary" id="ue-save">Save</button> <button class="du-btn ghost" id="ue-del">Delete this page</button> <span id="ue-st" class="du-save-status"></span></p></article>
  <article class="du-glass"><h2>Photos</h2><div class="du-hq-photos">${(photos||[]).map(p=>`<figure><img src="${esc(p.image_url)}" alt=""><figcaption>${u.hero_image_url===p.image_url?'<b>COVER</b> ':''}${esc(p.caption||'')} ${u.hero_image_url===p.image_url?'':`<button class="du-btn ghost" data-u-cover="${p.id}">Make cover</button>`} <button class="du-btn ghost" data-u-delphoto="${p.id}">Remove</button></figcaption></figure>`).join('')||'<p class="du-muted">No photos yet.</p>'}</div>${h.photoDropHTML('ue-photo','Add photos of this team and its work')}${h.fld('Caption / photo credit (optional, applies to this batch)','ue-cap','')}<p><button class="du-btn primary" id="ue-addphoto">Upload photos</button></p></article>
  <article class="du-glass"><h2>Projects</h2><p class="du-muted">Attach projects your firm is credited on. Add new projects from the Projects tab first.</p>${projects.map(p=>`<label class="du-fa-check"><input type="checkbox" data-u-proj="${p.id}" ${attached.has(p.id)?'checked':''}> <b>${esc(p.name)}</b> <small>${esc([place(p),yr(p)||''].filter(Boolean).join(' · '))}</small></label>`).join('')||'<p class="du-muted">No projects credited to your firm yet.</p>'}</article>
  <article class="du-glass du-fa-featured" id="ue-feat"></article>
  <article class="du-glass"><h2>Team on this page</h2><p class="du-muted">Members of your firm add themselves from the public page with “I work here”. You can remove anyone listed here.</p>${(mem||[]).map(m=>`<div class="du-row"><div><b>${esc(m.profiles?.display_name||'DrawUp member')}</b><small>${m.profiles?.username?'@'+esc(m.profiles.username):''}</small></div><button class="du-btn ghost" data-u-delmem="${m.id}">Remove</button></div>`).join('')||'<p class="du-muted">Nobody yet.</p>'}</article>`;
  const v=id=>body.querySelector(id).value.trim(),again=()=>go('units','&unit='+u.id);
  body.querySelector('#ue-back').onclick=()=>go('units');body.querySelector('#ue-view').onclick=()=>openUnit(firm.slug,u.slug);
  body.querySelector('#ue-save').onclick=async()=>{const st=body.querySelector('#ue-st');if(!v('#ue-name')){st.textContent=' A name is required.';return;}
    const {error}=await cl.from('firm_units').update({name:v('#ue-name'),kind:v('#ue-kind'),city:v('#ue-city')||null,state:v('#ue-state')||null,description:v('#ue-desc')||null,leader_name:v('#ue-lead')||null,leader_title:v('#ue-ltitle')||null,updated_at:new Date().toISOString()}).eq('id',u.id).select('id').single();
    if(error){st.textContent=' Not saved: '+error.message;return;}c.toast('Saved.');again();};
  body.querySelector('#ue-del').onclick=async()=>{if(!confirm('Delete this page? Its photos, project links and team list go with it. The projects themselves stay on your firm.'))return;const {error}=await cl.from('firm_units').delete().eq('id',u.id);if(error){c.toast(error.message,true);return;}c.toast('Page deleted.');go('units');};
  const drop=h.photoDrop(body,'ue-photo');
  body.querySelector('#ue-addphoto').onclick=async()=>{const files=drop.files();if(!files.length){c.toast('Choose one or more photos.',true);return;}let n=(photos||[]).length,done=0,first='';
    try{for(const file of files){drop.progress(done+1,files.length);const url=await h.uploadPublic(c,file,'firm/'+firm.id+'/unit');first=first||url;const {error}=await cl.from('firm_unit_photos').insert({unit_id:u.id,firm_id:firm.id,image_url:url,caption:v('#ue-cap')||null,sort_order:n++});if(error)throw error;done++;}
      if(!u.hero_image_url&&first)await cl.from('firm_units').update({hero_image_url:first}).eq('id',u.id);
      drop.progress(0,0);drop.clear();c.toast(done+' photo'+(done===1?'':'s')+' added.');again();}
    catch(e){drop.progress(0,0);c.toast((done?done+' added, then ':'')+'upload failed: '+(e.message||e),true);if(done)again();}};
  body.querySelectorAll('[data-u-cover]').forEach(b=>b.onclick=async()=>{const p=photos.find(x=>x.id===b.dataset.uCover);const {error}=await cl.from('firm_units').update({hero_image_url:p.image_url}).eq('id',u.id);if(error){c.toast(error.message,true);return;}again();});
  body.querySelectorAll('[data-u-delphoto]').forEach(b=>b.onclick=async()=>{const p=photos.find(x=>x.id===b.dataset.uDelphoto);const {error}=await cl.from('firm_unit_photos').delete().eq('id',p.id);if(error){c.toast(error.message,true);return;}if(u.hero_image_url===p.image_url)await cl.from('firm_units').update({hero_image_url:null}).eq('id',u.id);again();});
  body.querySelectorAll('[data-u-proj]').forEach(b=>b.onchange=async()=>{const pid=b.dataset.uProj;
    const r=b.checked?await cl.from('firm_unit_projects').insert({unit_id:u.id,firm_id:firm.id,project_id:pid}):await cl.from('firm_unit_projects').delete().eq('unit_id',u.id).eq('project_id',pid);
    if(r.error){b.checked=!b.checked;c.toast(r.error.message,true);return;}
    if(b.checked)attached.add(pid);else{attached.delete(pid);const fr=await loadFeatured(cl,firm.id,u.id);if(fr.some(x=>x.project_id===pid))await cl.rpc('drawup_set_featured',{p_firm_id:firm.id,p_unit_id:u.id,p_project_ids:fr.sort((a,b)=>a.slot-b.slot).map(x=>x.project_id).filter(x=>x!==pid)});}
    drawFeat();});
  body.querySelectorAll('[data-u-delmem]').forEach(b=>b.onclick=async()=>{const {error}=await cl.from('firm_unit_members').delete().eq('id',b.dataset.uDelmem);if(error){c.toast(error.message,true);return;}again();});
  const featHost=body.querySelector('#ue-feat');
  const drawFeat=()=>{const list=projects.filter(p=>attached.has(p.id));if(!list.length){featHost.innerHTML='<h2>Featured work for this page</h2><p class="du-muted">Attach projects above, then choose up to 6 to feature.</p>';return;}featuredPicker(featHost,c,firm,list,u.id,'Featured work for this page');};
  drawFeat();
}

/* ---------------------------------------------------------------- routing: #firm/<slug>[/<unit>|/locations] */
async function route(){
  const m=/^#firm\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?\/?$/.exec(location.hash||'');if(!m)return;
  for(let i=0;i<100&&!window.DrawUpLive?.openFirm;i++)await new Promise(r=>setTimeout(r,100));
  if(m[2]&&!RESERVED.has(m[2]))return openUnit(m[1],m[2]);
  await window.DrawUpLive.openFirm(m[1]);
  const root=$('du-live-firm-profile');if(root&&m[2]==='locations'){selectTab(root,'locations');history.replaceState(null,'','#firm/'+m[1]+'/locations');}
}
window.addEventListener('hashchange',route);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',route);else route();

window.DrawUpFirms={orderProjects,loadFeatured,firmExtras,projectsHTML,locationsHTML,tabsHTML,bind,selectTab,openUnit,openFirmAt,adminFeatured,adminUnits,featuredPicker,slugify};
})();
