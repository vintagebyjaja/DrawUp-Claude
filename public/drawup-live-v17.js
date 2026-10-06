/* DrawUp live directory V17
 *
 * Public-site firm + project lists, firm/project profiles, and the "Add a firm"
 * submission, all read from Supabase (firms, firm_offices, aec_projects,
 * project_images, project_firms, firm_submissions). Rows flagged is_demo are
 * never shown. When the database has nothing, the page says so instead of
 * showing stand-in names or colored blocks.
 */
(()=>{'use strict';
const $=id=>document.getElementById(id);
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
async function db(){for(let i=0;i<100;i++){if(window.drawupSupabaseClient)return window.drawupSupabaseClient;await new Promise(r=>setTimeout(r,100));}return null;}
const US=new Set(['US','USA','United States','United States of America']);
function officeLine(o){return [o.city,o.state,US.has(o.country)?'':o.country].filter(Boolean).join(', ');}
function firmLocations(f){return (f.firm_offices||[]).sort((a,b)=>(b.is_headquarters?1:0)-(a.is_headquarters?1:0)).map(officeLine).filter(Boolean).slice(0,2).join(' · ');}
function isIntl(f){const o=f.firm_offices||[];return o.length>0&&o.every(x=>!US.has(x.country||'US'));}
function tag(f){return f.is_verified?'<span class="pill pill-verified roster-tag">Verified</span>':'<span class="pill pill-listed roster-tag">Listed</span>';}
function rosterRow(f,i){return `<a class="roster-row" href="#firm-profile" data-page="firm-profile" data-firm-slug="${esc(f.slug)}"><span class="roster-no">${String(i+1).padStart(2,'0')}</span><span class="roster-name">${esc(String(f.name).toUpperCase())}</span><span class="roster-loc">${esc(firmLocations(f).toUpperCase())}</span>${tag(f)}</a>`;}
function emptyBlock(title,body,cta=true){return `<div class="du-live-empty"><h3>${esc(title)}</h3><p>${esc(body)}</p>${cta?'<button class="btn btn-primary btn-sm" type="button" data-du-submit-firm>Add a firm</button>':''}</div>`;}
let firmCache=null;
async function loadFirms(){
  if(firmCache)return firmCache;
  const c=await db();if(!c)throw new Error('DrawUp database is not connected.');
  const {data,error}=await c.from('firms').select('id,slug,name,description,website,logo_url,hero_image_url,is_verified,discipline,firm_offices(city,state,country,is_headquarters)').eq('is_demo',false).order('name').limit(2000);
  if(error)throw error;firmCache=data||[];return firmCache;
}

/* ---------- home roster teaser ---------- */
async function renderHomeRoster(){
  const grid=$('du-live-home-roster');if(!grid)return;
  try{const firms=(await loadFirms()).slice().sort((a,b)=>(b.is_verified?1:0)-(a.is_verified?1:0)).slice(0,6);
    grid.innerHTML=firms.length?firms.map(rosterRow).join(''):emptyBlock('The roster is being built.','No firms are in the DrawUp directory yet. Firms appear here as they are added and approved.');
  }catch(e){grid.innerHTML=emptyBlock('Roster unavailable.',e.message||String(e),false);}
}

/* ---------- connect directory ---------- */
let connectMode='us',connectLetter='ALL',connectQuery='';
async function renderConnect(){
  const host=$('du-live-connect');if(!host)return;
  let firms;try{firms=await loadFirms();}catch(e){host.innerHTML=emptyBlock('Directory unavailable.',e.message||String(e),false);return;}
  const pool=firms.filter(f=>connectMode==='intl'?isIntl(f):!isIntl(f));
  const letters=new Set(pool.map(f=>(f.name||'#')[0].toUpperCase()));
  const q=connectQuery.toLowerCase();
  const shown=pool.filter(f=>(connectLetter==='ALL'||(f.name||'')[0].toUpperCase()===connectLetter)&&(!q||(f.name+' '+firmLocations(f)+' '+(f.discipline||'')).toLowerCase().includes(q)));
  host.innerHTML=`<div class="directory-mode"><button class="subtab ${connectMode==='us'?'active':''}" data-mode="us" type="button">U.S. Firms</button><button class="subtab ${connectMode==='intl'?'active':''}" data-mode="intl" type="button">International Firms</button><input class="world-input du-live-filter" placeholder="Filter by name, city or discipline…" value="${esc(connectQuery)}"></div>
  <div class="roster-index"><span class="has ${connectLetter==='ALL'?'active':''}" data-letter="ALL" tabindex="0">ALL</span>${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(L=>letters.has(L)?`<span class="has ${connectLetter===L?'active':''}" data-letter="${L}" tabindex="0" role="button">${L}</span>`:`<span>${L}</span>`).join('')}</div>
  <p class="meta">${pool.length} ${connectMode==='intl'?'international':'U.S.'} firm${pool.length===1?'':'s'} in the DrawUp directory · architecture, engineering and construction</p>
  <div class="roster-grid">${shown.length?shown.map(rosterRow).join(''):emptyBlock(pool.length?'No firms match that filter.':'No '+(connectMode==='intl'?'international ':'')+'firms in the directory yet.',pool.length?'Try another letter or search.':'DrawUp only lists firms that are in its database. Submit a firm and it appears here after review.')}</div>
  <div class="roster-cta"><button class="btn btn-primary btn-sm" type="button" data-du-submit-firm>Add a firm</button><p style="font-family:var(--font-mono);font-size:11px;color:var(--ink-faint);margin-top:10px;">Don't see your firm? Submit it with its website, Instagram or LinkedIn and DrawUp reviews it before it is listed.</p></div>`;
  host.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{connectMode=b.dataset.mode;connectLetter='ALL';renderConnect();});
  host.querySelectorAll('[data-letter]').forEach(b=>{b.onclick=()=>{connectLetter=b.dataset.letter;renderConnect();};b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();b.click();}};});
  const inp=host.querySelector('.du-live-filter');inp.oninput=()=>{connectQuery=inp.value;clearTimeout(inp._t);inp._t=setTimeout(()=>{renderConnect().then(()=>{const i=host.querySelector('.du-live-filter');i.focus();i.setSelectionRange(i.value.length,i.value.length);});},200);};
}

/* ---------- discover: projects + firms ---------- */
function projectCard(p){const img=(p.project_images||[]).sort((a,b)=>(b.is_hero?1:0)-(a.is_hero?1:0)||a.sort_order-b.sort_order)[0]?.image_url;const team=(p.project_firms||[]).filter(x=>x.firms&&!x.firms.is_demo).slice(0,2).map(x=>`<b>${esc(x.role)}:</b> ${esc(x.firms.name)}`).join('<br>');
  return `<div class="proj-card du-live-project" data-project-slug="${esc(p.slug)}" tabindex="0" role="button">${img?`<div class="proj-media real-project-media" style="background-image:url('${esc(img).replace(/'/g,'%27')}')"></div>`:''}<div class="proj-body"><h3>${esc(p.name)}</h3><span class="proj-meta">${esc([p.city,p.state,US.has(p.country)?'':p.country].filter(Boolean).join(', ').toUpperCase())}${p.project_type?' · '+esc(String(p.project_type).toUpperCase()):''}${p.completion_year?' · '+esc(p.completion_year):''}</span>${team?`<p class="proj-arch">${team}</p>`:''}${img?'':'<p class="meta">No project photo on file yet.</p>'}</div></div>`;}
async function renderDiscover(){
  const c=await db();if(!c)return;
  const grid=$('recent-project-grid');
  if(grid){
    const {data,error}=await c.from('aec_projects').select('slug,name,city,state,country,project_type,completion_year,project_images(image_url,is_hero,sort_order),project_firms(role,firms(name,slug,is_demo))').eq('is_demo',false).order('updated_at',{ascending:false}).limit(24);
    grid.innerHTML=error?emptyBlock('Projects unavailable.',error.message,false):(data||[]).length?data.map(projectCard).join(''):`<div class="du-live-empty"><h3>No projects in DrawUp yet.</h3><p>DrawUp shows only projects it has records for. Project profiles appear here as they are added and verified, with their real photos.</p></div>`;
    grid.querySelectorAll('[data-project-slug]').forEach(el=>{el.onclick=()=>openProject(el.dataset.projectSlug);el.onkeydown=e=>{if(e.key==='Enter')el.click();};});
  }
  const fg=$('du-live-discover-firms');
  if(fg){try{const firms=await loadFirms();fg.innerHTML=firms.length?firms.slice(0,24).map(f=>`<div class="gallery-card" data-page="firm-profile" data-firm-slug="${esc(f.slug)}">${f.logo_url?`<img class="gallery-logo" src="${esc(f.logo_url)}" alt="">`:''}<h3>${esc(f.name)}</h3><span class="meta">${esc(firmLocations(f).toUpperCase()||'LOCATION NOT LISTED')}</span>${f.description?`<p>${esc(String(f.description).slice(0,140))}</p>`:''}</div>`).join(''):emptyBlock('No firms in DrawUp yet.','Firms appear here once they are in the DrawUp directory.');}catch(e){fg.innerHTML=emptyBlock('Firms unavailable.',e.message||String(e),false);}}
}

/* ---------- profiles ---------- */
async function firmProfileHTML(slug){
  const c=await db();if(!c)return null;
  const {data:f,error}=await c.from('firms').select('*,firm_offices(*),firm_photos(image_url,caption,sort_order),firm_services(service),firm_markets(market)').eq('slug',slug).eq('is_demo',false).maybeSingle();
  if(error)return `<article class="du-glass"><h2>Firm unavailable.</h2><p>${esc(error.message)}</p></article>`;if(!f)return null;
  const {data:pf}=await c.from('project_firms').select('role,provenance,aec_projects(slug,name,city,state,is_demo)').eq('firm_id',f.id);
  const projects=(pf||[]).filter(x=>x.aec_projects&&!x.aec_projects.is_demo);
  const photos=[...(f.hero_image_url?[{image_url:f.hero_image_url}]:[]),...(f.firm_photos||[]).sort((a,b)=>a.sort_order-b.sort_order)];
  return `<div class="du-live-profile"><div class="du-live-profile-head">${f.logo_url?`<img class="du-live-logo" src="${esc(f.logo_url)}" alt="">`:''}<div><span class="eyebrow">DrawUp Firm Profile${f.discipline?' · '+esc(f.discipline):''}</span><h1>${esc(f.name)}</h1><p>${esc((f.firm_offices||[]).map(officeLine).filter(Boolean).join(' · '))} ${tag(f)}</p></div>${f.website?`<a class="btn btn-ghost btn-sm" href="${esc(f.website)}" target="_blank" rel="noopener">Visit firm website ↗</a>`:''}</div>
  ${photos.length?`<div class="du-live-photos">${photos.slice(0,6).map(p=>`<figure><img src="${esc(p.image_url)}" alt="${esc(p.caption||f.name)}" loading="lazy">${p.caption?`<figcaption>${esc(p.caption)}</figcaption>`:''}</figure>`).join('')}</div>`:''}
  ${f.description?`<p class="du-live-desc">${esc(f.description)}</p>`:''}
  ${(f.firm_services||[]).length||(f.firm_markets||[]).length?`<p class="meta">${esc([...(f.firm_services||[]).map(x=>x.service),...(f.firm_markets||[]).map(x=>x.market)].join(' · '))}</p>`:''}
  ${(f.firm_offices||[]).filter(o=>o.phone).map(o=>`<div class="office-block"><div class="office-head">${esc(officeLine(o))}${o.is_headquarters?' <span class="meta">· Headquarters</span>':''}</div><a class="btn btn-accent btn-sm" href="tel:${esc(o.phone)}">Call ${esc(o.phone)}</a></div>`).join('')}
  <h3 style="margin-top:22px">Projects on DrawUp</h3>${projects.length?`<ul class="du-live-list">${projects.map(x=>`<li><a href="#" data-project-slug="${esc(x.aec_projects.slug)}">${esc(x.aec_projects.name)}</a> <span class="meta">${esc(x.role)}${x.provenance&&x.provenance!=='unverified'?' · '+esc(String(x.provenance).replace('_',' ')):' · unverified attribution'}</span></li>`).join('')}</ul>`:'<p class="meta">No projects are attributed to this firm in DrawUp yet.</p>'}
  ${f.is_verified?'':'<p class="disclaimer">This firm has not claimed its DrawUp profile. Details shown come from DrawUp\'s directory record only.</p>'}</div>`;
}
async function projectProfileHTML(slug){
  const c=await db();if(!c)return null;
  const {data:p,error}=await c.from('aec_projects').select('*,project_images(image_url,caption,is_hero,sort_order),project_firms(role,provenance,firms(name,slug,is_demo)),project_people(name,role,provenance),project_sources(source_name,source_url),project_awards(award_name,award_year),project_tags(tag)').eq('slug',slug).eq('is_demo',false).maybeSingle();
  if(error)return `<article class="du-glass"><h2>Project unavailable.</h2><p>${esc(error.message)}</p></article>`;if(!p)return null;
  const imgs=(p.project_images||[]).sort((a,b)=>(b.is_hero?1:0)-(a.is_hero?1:0)||a.sort_order-b.sort_order);
  const team=(p.project_firms||[]).filter(x=>x.firms&&!x.firms.is_demo);
  const facts=[['Location',[p.city,p.state,US.has(p.country)?'':p.country].filter(Boolean).join(', ')],['Type',p.project_type],['Status',p.status],['Completed',p.completion_year],['Size',p.size_sqft?Number(p.size_sqft).toLocaleString()+' sf':'']].filter(x=>x[1]);
  return `<div class="du-live-profile"><span class="eyebrow">DrawUp Project Profile</span><h1>${esc(p.name)}</h1>
  ${imgs.length?`<div class="du-live-photos">${imgs.slice(0,8).map(i=>`<figure><img src="${esc(i.image_url)}" alt="${esc(i.caption||p.name)}" loading="lazy">${i.caption?`<figcaption>${esc(i.caption)}</figcaption>`:''}</figure>`).join('')}</div>`:'<p class="meta">No project photos on file yet.</p>'}
  ${facts.length?`<div class="du-live-facts">${facts.map(x=>`<div><span class="meta">${esc(x[0])}</span><b>${esc(x[1])}</b></div>`).join('')}</div>`:''}
  ${p.description?`<p class="du-live-desc">${esc(p.description)}</p>`:''}
  <h3>Who designed, engineered and built it</h3>${team.length||(p.project_people||[]).length?`<ul class="du-live-list">${team.map(x=>`<li><b>${esc(x.role)}:</b> <a href="#" data-firm-slug="${esc(x.firms.slug)}">${esc(x.firms.name)}</a> <span class="meta">${esc(String(x.provenance||'unverified').replace('_',' '))}</span></li>`).join('')}${(p.project_people||[]).map(x=>`<li><b>${esc(x.role||'Team')}:</b> ${esc(x.name)} <span class="meta">${esc(String(x.provenance||'unverified').replace('_',' '))}</span></li>`).join('')}</ul>`:'<p class="meta">No team attribution on record yet.</p>'}
  ${(p.project_awards||[]).length?`<h3>Awards</h3><ul class="du-live-list">${p.project_awards.map(a=>`<li>${esc(a.award_name)}${a.award_year?' · '+esc(a.award_year):''}</li>`).join('')}</ul>`:''}
  ${(p.project_sources||[]).length?`<h3>Sources</h3><ul class="du-live-list">${p.project_sources.map(s=>`<li><a href="${esc(s.source_url)}" target="_blank" rel="noopener">${esc(s.source_name)} ↗</a></li>`).join('')}</ul>`:''}</div>`;
}
function bindProfileLinks(root,openFirm,openProj){
  root.querySelectorAll('[data-firm-slug]').forEach(a=>a.onclick=e=>{e.preventDefault();e.stopPropagation();openFirm(a.dataset.firmSlug);});
  root.querySelectorAll('[data-project-slug]').forEach(a=>a.onclick=e=>{e.preventDefault();e.stopPropagation();openProj(a.dataset.projectSlug);});
}
function showPublicPage(id){const link=document.querySelector(`[data-page="${id}"]`);document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!=='page-'+id);history.replaceState(null,'','#'+id);window.scrollTo(0,0);}
async function openFirm(slug){
  if(window.DrawUpPortal?.isSignedIn?.()&&document.getElementById('du-portal')?.classList.contains('open'))return window.DrawUpPortal.openFirm(slug);
  const host=$('du-live-firm-profile');if(!host)return;host.innerHTML='<p class="meta">Loading firm…</p>';showPublicPage('firm-profile');
  host.innerHTML=(await firmProfileHTML(slug))||emptyBlock('Firm not found.','This firm is not in the DrawUp directory.',false);bindProfileLinks(host,openFirm,openProject);
}
async function openProject(slug){
  if(window.DrawUpPortal?.isSignedIn?.()&&document.getElementById('du-portal')?.classList.contains('open'))return window.DrawUpPortal.openProject(slug);
  const host=$('du-live-firm-profile');if(!host)return;host.innerHTML='<p class="meta">Loading project…</p>';showPublicPage('firm-profile');
  host.innerHTML=(await projectProfileHTML(slug))||emptyBlock('Project not found.','This project is not in DrawUp.',false);bindProfileLinks(host,openFirm,openProject);
}

/* ---------- add a firm (firm_submissions, reviewed before listing) ---------- */
async function openFirmSubmission(prefill){
  const c=await db();const s=c?(await c.auth.getSession()).data.session:null;
  if(!s?.user||s.user.is_anonymous){$('drawup-signin')?.click();const st=$('auth-status');if(st)st.textContent='Sign in or create a free account to submit a firm.';return;}
  $('du-inline-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend',`<div id="du-inline-modal" class="du-inline-modal"><div class="du-inline-card"><button class="du-inline-x" type="button" aria-label="Close">×</button><span class="du-kicker">ADD A FIRM</span><h2>Submit a firm for the DrawUp directory</h2><p class="du-muted">DrawUp reviews every submission before the firm is listed.</p><div class="du-inline-grid"><label>Firm name<input id="fs-name" value="${esc(prefill||'')}"></label><label>City<input id="fs-city"></label><label>State / region<input id="fs-state"></label><label>Country<input id="fs-country" value="US"></label><label>Verify with<select id="fs-method"><option value="website">Website</option><option value="instagram">Instagram</option><option value="linkedin">LinkedIn</option></select></label><label>Link<input id="fs-link" placeholder="https://"></label><label class="wide">Note <small>optional</small><textarea id="fs-note" placeholder="I work here / local engineering firm not listed yet…"></textarea></label></div><button class="du-btn primary du-save">Submit for review</button><span class="du-save-status"></span></div></div>`);
  const m=$('du-inline-modal');m.querySelector('.du-inline-x').onclick=()=>m.remove();
  m.querySelector('.du-save').onclick=async()=>{const st=m.querySelector('.du-save-status'),name=m.querySelector('#fs-name').value.trim(),link=m.querySelector('#fs-link').value.trim(),method=m.querySelector('#fs-method').value;if(!name||!link){st.textContent=' Firm name and a verification link are required.';return;}
    const row={submitted_by:s.user.id,firm_name:name,city:m.querySelector('#fs-city').value.trim()||null,state:m.querySelector('#fs-state').value.trim()||null,country:m.querySelector('#fs-country').value.trim()||'US',verification_method:method,note:m.querySelector('#fs-note').value.trim()||null};row[method==='website'?'website':method+'_url']=link;
    st.textContent=' Submitting…';const r=await c.from('firm_submissions').insert(row).select('id');if(r.error){st.textContent=' Not submitted — '+r.error.message;return;}m.querySelector('.du-inline-card').innerHTML='<span class="du-kicker">SUBMITTED</span><h2>Thanks — DrawUp will review it.</h2><p>The firm is listed once it is approved.</p><button class="du-btn primary" type="button" onclick="this.closest(\'.du-inline-modal\').remove()">Done</button>';};
}

/* ---------- database search for the public search bar ---------- */
async function searchDb(q,kind){const c=await db();if(!c)throw new Error('DrawUp database is not connected.');const {data,error}=await c.rpc('drawup_search',{q,kind:kind||'all',max_rows:12});if(error)throw error;return data||{firms:[],projects:[]};}

function refresh(pageId){
  if(!pageId||pageId==='page-connect')renderConnect();
  if(!pageId||pageId==='page-discover')renderDiscover();
  if(!pageId||pageId==='page-home')renderHomeRoster();
}
document.addEventListener('click',e=>{
  const sub=e.target.closest('[data-du-submit-firm]');if(sub){e.preventDefault();openFirmSubmission();return;}
  const f=e.target.closest('[data-firm-slug]');if(f&&!f.closest('#du-portal')&&!f.closest('.du-live-profile')){e.preventDefault();e.stopImmediatePropagation();openFirm(f.dataset.firmSlug);}
},true);
window.DrawUpLive={refresh,firmProfileHTML,projectProfileHTML,bindProfileLinks,openFirmSubmission,searchDb,openFirm,openProject};
function boot(){refresh();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
