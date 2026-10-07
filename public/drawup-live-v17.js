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
  const {data,error}=await c.from('firms').select('*,firm_offices(city,state,country,is_headquarters,is_confirmed,source)').eq('is_demo',false).order('name').limit(2000);
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

/* ---------- discover: projects + firms (V19: every filter is wired, all matches shown) ---------- */
const CONTINENT={'United Kingdom':'Europe','Germany':'Europe','France':'Europe','Spain':'Europe','Italy':'Europe','Netherlands':'Europe','Denmark':'Europe','Norway':'Europe','Sweden':'Europe','Switzerland':'Europe','Austria':'Europe','Belgium':'Europe','Ireland':'Europe','Poland':'Europe','Romania':'Europe','Portugal':'Europe','Finland':'Europe','Greece':'Europe','Turkiye':'Europe','Turkey':'Europe','China':'Asia','Hong Kong':'Asia','Japan':'Asia','South Korea':'Asia','Singapore':'Asia','India':'Asia','Vietnam':'Asia','Thailand':'Asia','Malaysia':'Asia','Kazakhstan':'Asia','Indonesia':'Asia','Philippines':'Asia','Taiwan':'Asia','United Arab Emirates':'Middle East','Saudi Arabia':'Middle East','Qatar':'Middle East','Lebanon':'Middle East','Israel':'Middle East','Kuwait':'Middle East','Bahrain':'Middle East','Oman':'Middle East','Canada':'North America','Mexico':'North America','US':'North America','Brazil':'South America','Chile':'South America','Argentina':'South America','Peru':'South America','Colombia':'South America','Ecuador':'South America','Australia':'Oceania','New Zealand':'Oceania','South Africa':'Africa','Ghana':'Africa','Nigeria':'Africa','Kenya':'Africa','Rwanda':'Africa','Botswana':'Africa','Egypt':'Africa','Morocco':'Africa','Burkina Faso':'Africa'};
const STATES={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',PR:'Puerto Rico',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
const normCountry=c=>US.has(c||'US')?'US':c;
function continentOf(c){return CONTINENT[normCountry(c)]||'';}
function firmKind(f){if(f.discipline)return f.discipline;const n=String(f.name||'');if(/construct|builders|contract|turner|skanska|whiting|clark\b|mortenson|gilbane|mccarthy|hensel|balfour/i.test(n))return'Construction';if(/engineer|tomasetti|walter p|arup|aecom|hdr|wsp|stantec|jacobs|kimley|dewberry|stv|hntb|ghd|thornton|moore|henderson|burns|fluor|arcadis/i.test(n))return'Engineering';return'Architecture';}
function hqOf(f){const o=(f.firm_offices||[]);return o.find(x=>x.is_headquarters)||o[0]||null;}
function fillStateSelect(sel,rows,getStates){if(!sel||sel.dataset.filled)return;const set=new Set();rows.forEach(r=>getStates(r).forEach(s=>s&&STATES[s]&&set.add(s)));sel.innerHTML='<option value="">All U.S. States</option>'+[...set].sort((x,y)=>STATES[x].localeCompare(STATES[y])).map(s=>`<option value="${s}">${esc(STATES[s])}</option>`).join('');sel.dataset.filled='1';}
const discoverState={firmChip:'all',firmLimit:48,projects:null,firmLetter:'ALL'};
let myHome=null;
async function homeState(){if(myHome!==null)return myHome;myHome='';try{const c=await db();const u=(await c.auth.getSession()).data.session?.user;if(u){const {data}=await c.from('profiles').select('home_office,current_location').eq('id',u.id).maybeSingle();const m=/,\s*([A-Za-z]{2})\b/.exec(data?.home_office||data?.current_location||'');myHome=m?m[1].toUpperCase():'';}}catch(_e){}return myHome;}
function firmMatches(f,opts){
  const offs=f.firm_offices||[];
  if(opts.scope==='us'&&!offs.some(o=>normCountry(o.country)==='US')&&offs.length)return false;
  if(opts.scope==='intl'&&!offs.some(o=>normCountry(o.country)!=='US'))return false;
  if(opts.state&&!offs.some(o=>normCountry(o.country)==='US'&&String(o.state||'').toUpperCase()===opts.state))return false;
  if(opts.continent&&!offs.some(o=>continentOf(o.country)===opts.continent))return false;
  if(opts.chip==='verified'&&!f.is_verified)return false;
  if(['Architecture','Engineering','Construction'].includes(opts.chip)&&firmKind(f)!==opts.chip)return false;
  if(opts.chip==='near'&&!(opts.home&&offs.some(o=>String(o.state||'').toUpperCase()===opts.home)))return false;
  if(opts.q){const hay=(f.name+' '+(f.description||'')+' '+(f.discipline||'')+' '+offs.map(o=>[o.city,o.state,STATES[String(o.state||'').toUpperCase()]||'',o.country].join(' ')).join(' ')).toLowerCase();if(!opts.q.split(/\s+/).every(t=>hay.includes(t)))return false;}
  return true;
}
function firmCardHTML(f){const hq=hqOf(f),n=(f.firm_offices||[]).length;const site=f.website?String(f.website).replace(/^https?:\/\/(www\.)?/,'').replace(/\/.*$/,''):'';
  return `<div class="gallery-card du-firm-card" data-page="firm-profile" data-firm-slug="${esc(f.slug)}" tabindex="0" role="button">${f.logo_url?`<img class="gallery-logo" src="${esc(f.logo_url)}" alt="">`:`<div class="gallery-mark">${esc(String(f.name).replace(/[^A-Za-z0-9 ]/g,'').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'DU')}</div>`}<h3>${esc(f.name)}</h3><span class="meta">${esc(hq?officeLine(hq).toUpperCase():'LOCATION NOT LISTED YET')}</span><span class="du-firm-card-sub">${esc(firmKind(f))}${n>1?' · '+n+' offices':''}${site?' · '+esc(site):''}</span>${f.is_verified?'<span class="pill pill-verified">Verified</span>':f.listed_via==='drawup_search'?'<span class="pill pill-listed" title="Added from public sources found by DrawUp Search. Not confirmed by the firm.">From public sources · unconfirmed</span>':''}</div>`;}
async function renderDiscoverFirms(){
  const fg=$('du-live-discover-firms');if(!fg)return;
  let firms;try{firms=await loadFirms();}catch(e){fg.innerHTML=emptyBlock('Firms unavailable.',e.message||String(e),false);return;}
  fillStateSelect($('du-firm-state'),firms,f=>(f.firm_offices||[]).filter(o=>normCountry(o.country)==='US').map(o=>String(o.state||'').toUpperCase()));
  const opts={q:($('du-firm-q')?.value||'').trim().toLowerCase(),scope:$('du-firm-scope')?.value||'all',state:$('du-firm-state')?.value||'',continent:$('du-firm-continent')?.value||'',chip:discoverState.firmChip,home:discoverState.firmChip==='near'?await homeState():''};
  const matched=firms.filter(f=>firmMatches(f,opts));
  // V21: A-Z index, so members can click through firms by first letter (works with every other filter).
  const first=f=>{const c=String(f.name||'').trim().replace(/^the\s+/i,'').charAt(0).toUpperCase();return /[A-Z]/.test(c)?c:'#';};
  const have=new Set(matched.map(first));if(discoverState.firmLetter&&discoverState.firmLetter!=='ALL'&&!have.has(discoverState.firmLetter))discoverState.firmLetter='ALL';
  const L=discoverState.firmLetter||'ALL';
  let az=$('du-firm-az');if(!az){az=document.createElement('nav');az.id='du-firm-az';az.className='roster-index du-firm-az';az.setAttribute('aria-label','Firms by first letter');fg.parentNode.insertBefore(az,fg);}
  az.innerHTML=['ALL',...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),'#'].map(x=>x==='ALL'||have.has(x)?`<button type="button" class="has${L===x?' active':''}" data-letter="${x}" aria-pressed="${L===x}">${x==='#'?'0–9':x}</button>`:`<span aria-hidden="true">${x==='#'?'':x}</span>`).join('');
  az.querySelectorAll('[data-letter]').forEach(b=>b.onclick=()=>{discoverState.firmLetter=b.dataset.letter;discoverState.firmLimit=48;renderDiscoverFirms();});
  const shown=L==='ALL'?matched:matched.filter(f=>first(f)===L);
  const cnt=$('du-firm-count');if(cnt)cnt.textContent=opts.chip==='near'&&!opts.home?'Add your home office (City, ST) to your profile to see firms near you.':`${shown.length} of ${firms.length} firms in the DrawUp directory${L!=='ALL'?' · starting with '+(L==='#'?'a number':L):''}`;
  fg.innerHTML=shown.length?shown.slice(0,discoverState.firmLimit).map(firmCardHTML).join('')+(shown.length>discoverState.firmLimit?`<div class="du-show-more"><button class="btn btn-ghost btn-sm" type="button" id="du-firm-more">Show ${Math.min(48,shown.length-discoverState.firmLimit)} more of ${shown.length-discoverState.firmLimit}</button></div>`:''):emptyBlock('No firms match those filters.','Try All World, clear the state, or search a different name or city. Missing a firm? Add it and DrawUp reviews it.');
  const more=$('du-firm-more');if(more)more.onclick=()=>{discoverState.firmLimit+=48;renderDiscoverFirms();};
}
function bindDiscoverControls(){
  const fc=$('du-firm-controls');if(fc&&!fc.dataset.bound){fc.dataset.bound='1';let t;const go=()=>{discoverState.firmLimit=48;clearTimeout(t);t=setTimeout(renderDiscoverFirms,140);};fc.querySelectorAll('input,select').forEach(el=>{el.addEventListener('input',go);el.addEventListener('change',go);});
    $('du-firm-scope')?.addEventListener('change',()=>{if($('du-firm-scope').value==='intl')$('du-firm-state').value='';});
    document.querySelectorAll('#du-firm-chips [data-chip]').forEach(ch=>ch.addEventListener('click',()=>{discoverState.firmChip=ch.dataset.chip;document.querySelectorAll('#du-firm-chips [data-chip]').forEach(x=>x.classList.toggle('active',x===ch));go();}));}
  const pc=$('du-proj-controls');if(pc&&!pc.dataset.bound){pc.dataset.bound='1';let t;const go=()=>{clearTimeout(t);t=setTimeout(renderDiscoverProjects,140);};pc.querySelectorAll('input,select').forEach(el=>{el.addEventListener('input',go);el.addEventListener('change',go);});}
}
function projectMedia(p){const img=(p.project_images||[]).sort((a,b)=>(b.is_hero?1:0)-(a.is_hero?1:0)||a.sort_order-b.sort_order)[0]?.image_url;
  if(img)return `<div class="proj-media real-project-media" style="background-image:url('${esc(img).replace(/'/g,'%27')}')"></div>`;
  return `<div class="proj-media du-proj-nophoto"><span class="du-proj-type">${esc(String(p.project_type||'Project').toUpperCase())}</span><b>${esc(p.name)}</b><small>${esc([p.city,p.state].filter(Boolean).join(', '))}</small><em>Photos are added by the firms on the project${p.image_page_url?' · official photos linked inside':''}</em></div>`;}
function projectCard(p){const team=(p.project_firms||[]).filter(x=>x.firms&&!x.firms.is_demo).slice(0,3).map(x=>`<b>${esc(x.role)}:</b> ${esc(x.firms.name)}`).join('<br>');
  const yr=p.completion_year||p.opened_year;
  return `<div class="proj-card du-live-project" data-project-slug="${esc(p.slug)}" tabindex="0" role="button">${projectMedia(p)}<div class="proj-body"><h3>${esc(p.name)}</h3><span class="proj-meta">${esc([p.city,p.state,US.has(p.country)?'':p.country].filter(Boolean).join(', ').toUpperCase())}${p.project_type?' · '+esc(String(p.project_type).toUpperCase()):''}${yr?' · '+esc(yr):''}</span>${p.description?`<p class="du-proj-desc">${esc(String(p.description).slice(0,190))}${String(p.description).length>190?'…':''}</p>`:''}${team?`<p class="proj-arch">${team}</p>`:''}<span class="du-proj-open">Open full project profile →</span></div></div>`;}
async function renderDiscoverProjects(){
  const grid=$('recent-project-grid');if(!grid)return;const c=await db();if(!c)return;
  if(!discoverState.projects){const {data,error}=await c.from('aec_projects').select('slug,name,city,state,country,project_type,completion_year,opened_year,description,image_page_url,project_images(image_url,is_hero,sort_order),project_firms(role,firms(name,slug,is_demo))').eq('is_demo',false).order('updated_at',{ascending:false}).limit(500);
    if(error){grid.innerHTML=emptyBlock('Projects unavailable.',error.message,false);return;}discoverState.projects=data||[];}
  const all=discoverState.projects;fillStateSelect($('du-proj-state'),all,p=>normCountry(p.country)==='US'?[String(p.state||'').toUpperCase()]:[]);
  const q=($('du-proj-q')?.value||'').trim().toLowerCase(),scope=$('du-proj-scope')?.value||'all',st=$('du-proj-state')?.value||'',ct=$('du-proj-continent')?.value||'';
  const shown=all.filter(p=>{if(scope==='us'&&normCountry(p.country)!=='US')return false;if(scope==='intl'&&normCountry(p.country)==='US')return false;if(st&&String(p.state||'').toUpperCase()!==st)return false;if(ct&&continentOf(p.country)!==ct)return false;if(q){const hay=[p.name,p.city,p.state,STATES[String(p.state||'').toUpperCase()]||'',p.country,p.project_type,p.description,...(p.project_firms||[]).map(x=>x.firms?.name+' '+x.role)].join(' ').toLowerCase();if(!q.split(/\s+/).every(t=>hay.includes(t)))return false;}return true;});
  grid.innerHTML=all.length?(shown.length?shown.map(projectCard).join(''):emptyBlock('No projects match those filters.','Try All World or a different search.',false)):`<div class="du-live-empty"><h3>No projects in DrawUp yet.</h3><p>DrawUp shows only projects it has records for. Project profiles appear here as they are added and verified, with their real photos.</p></div>`;
  grid.querySelectorAll('[data-project-slug]').forEach(el=>{el.onclick=()=>openProject(el.dataset.projectSlug);el.onkeydown=e=>{if(e.key==='Enter')el.click();};});
}
async function renderDiscover(){bindDiscoverControls();await Promise.all([renderDiscoverProjects(),renderDiscoverFirms()]);}

/* ---------- profiles ---------- */
function domainOf(u){try{return new URL(u).hostname.replace(/^www\./,'');}catch(_e){return '';}}
function officeTag(o){if(o.source==='member_reported'&&!o.is_confirmed)return '<span class="du-office-tag">Reported by a DrawUp member</span>';if(o.source==='public_research'&&!o.is_confirmed)return '<span class="du-office-tag">Unconfirmed</span>';return '';}
/* Used only when the roster SQL is not installed: rebuild it from public work history and profiles. */
async function rosterFallback(c,f){
  try{
    const pat=String(f.name).replace(/[%_,()]/g,' ').trim();
    const [{data:car},{data:aff}]=await Promise.all([
      c.from('career_timeline').select('user_id,role,location,start_date,end_date,verified').ilike('organization',pat).limit(300),
      c.from('profiles').select('id,title,home_office').ilike('primary_affiliation_name',pat).limit(300)]);
    const rows=(car||[]).map(r=>({user_id:r.user_id,role:r.role,location:r.location,start_year:r.start_date?+String(r.start_date).slice(0,4):null,end_year:r.end_date?+String(r.end_date).slice(0,4):null,is_current:!r.end_date,verified:!!r.verified}));
    const have=new Set(rows.map(r=>r.user_id));(aff||[]).forEach(p=>{if(!have.has(p.id))rows.push({user_id:p.id,role:p.title,location:p.home_office,start_year:null,end_year:null,is_current:true,verified:false});});
    const ids=[...new Set(rows.map(r=>r.user_id))];if(!ids.length)return {data:[]};
    const {data:ps}=await c.from('profiles').select('id,display_name,username,avatar_url,discoverable,is_public').in('id',ids);
    const pm=new Map((ps||[]).filter(p=>p.display_name&&p.discoverable!==false&&p.is_public!==false).map(p=>[p.id,p]));
    return {data:rows.filter(r=>pm.has(r.user_id)).map(r=>({...r,display_name:pm.get(r.user_id).display_name,username:pm.get(r.user_id).username,avatar_url:pm.get(r.user_id).avatar_url})).sort((a,b)=>(b.is_current-a.is_current)||((b.end_year||9999)-(a.end_year||9999))||((a.start_year||9999)-(b.start_year||9999)))};
  }catch(_e){return {data:[]};}
}
function rosterHTML(rows){
  const cur=rows.filter(r=>r.is_current),past=rows.filter(r=>!r.is_current),now=new Date().getFullYear();
  const ini=n=>esc(String(n||'D').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase());
  const yrs=r=>r.start_year?(!r.is_current&&r.end_year===r.start_year?String(r.start_year):`${r.start_year}–${r.is_current?'Present':(r.end_year||'')}`):(r.is_current?'Present':(r.end_year?'Until '+r.end_year:'—'));
  const ten=r=>{if(!r.start_year)return '—';const n=(r.is_current?now:(r.end_year||now))-r.start_year;return n<1?'<1 yr':n+' yr'+(n===1?'':'s');};
  const table=(title,list,empty)=>`<div class="du-roster-block"><div class="du-roster-title"><b>${title}</b><span>${list.length}</span></div>${list.length?`<div class="du-roster-scroll"><table class="du-roster"><thead><tr><th>Name</th><th>Position</th><th>Office</th><th>Years</th><th class="num">Tenure</th></tr></thead><tbody>${list.map(r=>`<tr data-du-person="${esc(r.user_id)}" tabindex="0"><td class="who"><div class="du-roster-who"><span class="du-roster-av">${r.avatar_url?`<img src="${esc(r.avatar_url)}" alt="">`:ini(r.display_name)}</span><span><a href="#">${esc(r.display_name)}</a>${r.verified?' <span class="du-check" title="Verified by DrawUp">✓</span>':''}${r.username?`<small>@${esc(r.username)}</small>`:''}</span></div></td><td>${esc(r.role||'—')}</td><td>${esc(r.location||'—')}</td><td class="yrs">${esc(yrs(r))}</td><td class="num">${esc(ten(r))}</td></tr>`).join('')}</tbody></table></div>`:`<p class="meta">${empty}</p>`}</div>`;
  return `<h2>Roster</h2><div class="du-roster-wrap">${table('Current team',cur,'No DrawUp members list this firm as their current workplace yet.')}${table('Former team',past,'No DrawUp members list this firm as a past workplace yet.')}</div><p class="meta du-source-note">Built from DrawUp members’ work history. Members choose whether their profile is public.</p>`;
}
async function firmProfileHTML(slug){
  const c=await db();if(!c)return null;
  const {data:f,error}=await c.from('firms').select('*,firm_offices(*),firm_photos(image_url,caption,sort_order),firm_services(service),firm_markets(market)').eq('slug',slug).eq('is_demo',false).maybeSingle();
  if(error)return `<article class="du-glass"><h2>Firm unavailable.</h2><p>${esc(error.message)}</p></article>`;if(!f)return null;
  const [{data:pf},{data:roster},adm,ex]=await Promise.all([
    c.from('project_firms').select('role,provenance,aec_projects(id,created_at,slug,name,city,state,country,project_type,completion_year,opened_year,description,image_page_url,is_demo,project_images(image_url,is_hero,sort_order))').eq('firm_id',f.id),
    c.rpc('drawup_firm_roster',{p_firm_id:f.id}).then(r=>r.error?rosterFallback(c,f):{data:r.data||[]},()=>rosterFallback(c,f)),
    c.rpc('is_firm_admin',{target_firm_id:f.id}).then(r=>r,()=>({data:false})),
    window.DrawUpFirms?.firmExtras?window.DrawUpFirms.firmExtras(c,f):null]);
  const seen=new Set(),projects=(pf||[]).filter(x=>x.aec_projects&&!x.aec_projects.is_demo&&!seen.has(x.aec_projects.slug)&&seen.add(x.aec_projects.slug));
  const photos=[...(f.hero_image_url?[{image_url:f.hero_image_url}]:[]),...(f.firm_photos||[]).sort((a,b)=>a.sort_order-b.sort_order)];
  const offices=(f.firm_offices||[]).slice().sort((a,b)=>(b.is_headquarters?1:0)-(a.is_headquarters?1:0)||(normCountry(a.country)==='US'?0:1)-(normCountry(b.country)==='US'?0:1)||String(a.state||'').localeCompare(String(b.state||''))||String(a.city).localeCompare(String(b.city)));
  const hq=offices.find(o=>o.is_headquarters);
  const cur=(roster||[]).filter(r=>r.is_current).length,hero=photos[0]?.image_url||'',firstPhoto=hero?1:0;
  const services=[...(f.firm_services||[]).map(x=>x.service),...(f.firm_markets||[]).map(x=>x.market)];
  const stat=(n,l)=>`<div class="du-fp-stat"><b>${esc(n)}</b><span>${esc(l)}</span></div>`;
  const FX=ex&&window.DrawUpFirms,plist=projects.map(x=>({...x.aec_projects,role:x.role}));
  return `<div class="du-live-profile du-firm-profile du-fp" data-firm="${esc(f.slug)}">
  <header class="du-fp-hero${hero?'':' plain'}"${hero?` style="--fp-hero:url('${esc(hero).replace(/'/g,'%27')}')"`:''}><div class="du-fp-hero-in">
    <div class="du-fp-logo">${f.logo_url?`<img src="${esc(f.logo_url)}" alt="${esc(f.name)} logo">`:`<span>${esc(String(f.name).split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase())}</span>`}</div>
    <div class="du-fp-id"><span class="du-fp-kicker">DrawUp Firm Profile${f.discipline?' · '+esc(f.discipline):''}</span><h1>${esc(f.name)}</h1><p>${hq?esc(officeLine(hq))+' headquarters':''}${f.founded_year?(hq?' · ':'')+'Founded '+esc(f.founded_year):''} ${tag(f)}</p></div>
  </div></header>
  <div class="du-fp-bar"><div class="du-fp-stats">${stat(offices.length,offices.length===1?'Office':'Offices')}${stat(projects.length,projects.length===1?'Project on DrawUp':'Projects on DrawUp')}${stat(cur,'Team on DrawUp')}${f.founded_year?stat(f.founded_year,'Founded'):''}</div>
    <div class="du-fp-actions"><button class="du-fp-btn primary" type="button" data-du-showcase="${esc(f.slug)}">View firm showcase</button>${f.website?`<a class="du-fp-btn" href="${esc(f.website)}" target="_blank" rel="noopener">${esc(domainOf(f.website)||'Website')} ↗</a>`:''}${adm?.data===true?`<button class="du-fp-btn accent" type="button" data-du-manage-firm="${esc(f.slug)}">Manage this firm</button>`:''}</div></div>
  ${FX?FX.tabsHTML(f,ex):''}<div class="du-fp-body" data-fp-pane="overview">
  <section class="du-fp-about"><div><h2>About</h2>${f.description?`<p class="du-live-desc">${esc(f.description)}</p>`:'<p class="meta">This firm has not added a description yet.</p>'}${services.length?`<div class="du-fp-tags">${services.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}</div>
    ${photos.length>firstPhoto?`<div class="du-fp-photos">${photos.slice(firstPhoto,firstPhoto+4).map(p=>`<figure><img src="${esc(p.image_url)}" alt="${esc(p.caption||f.name)}" loading="lazy">${p.caption?`<figcaption>${esc(p.caption)}</figcaption>`:''}</figure>`).join('')}</div>`:''}</section>
  ${FX?FX.projectsHTML(f,plist,ex):`<section><h2>Projects</h2>${projects.length?`<div class="card-grid du-firm-projects">${projects.slice(0,6).map(x=>projectCard({...x.aec_projects,project_firms:[{role:x.role,firms:{name:f.name,slug:f.slug}}]})).join('')}</div>${projects.length>6?`<p><button class="du-fp-btn" type="button" data-du-showcase="${esc(f.slug)}">See all ${projects.length} projects in the showcase</button></p>`:''}`:'<p class="meta">No projects are attributed to this firm on DrawUp yet.</p>'}</section>`}
  <section><h2>Offices</h2>${offices.length?`<div class="du-office-grid">${offices.map(o=>`<div class="du-office"><b>${esc(officeLine(o)||o.city)}</b>${o.is_headquarters?'<span class="du-office-hq">Headquarters</span>':''}${o.address?`<small>${esc(o.address)}</small>`:''}${o.phone?`<a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>`:''}${officeTag(o)}</div>`).join('')}</div>${f.source_url?`<p class="meta du-source-note">Office list from ${esc(domainOf(f.source_url))}${/^Unconfirmed/.test(f.research_note||'')?' and other public sources (not yet confirmed by the firm)':''}. Members add offices automatically when they list this firm in their work history.</p>`:''}`:'<p class="meta">No offices on file yet. Members add them automatically when they list this firm and its city in their work history.</p>'}</section>
  <section>${rosterHTML(roster||[])}</section>
  ${f.is_verified?'':'<p class="disclaimer">This firm has not claimed its DrawUp profile. Details shown come from DrawUp\'s directory record and public sources.</p>'}</div>${FX?`<div class="du-fp-body" data-fp-pane="locations" hidden>${FX.locationsHTML(f,ex)}</div>`:''}</div>`;
}
async function projectProfileHTML(slug){
  const c=await db();if(!c)return null;
  const {data:p,error}=await c.from('aec_projects').select('*,project_images(image_url,caption,is_hero,sort_order),project_firms(role,provenance,firms(name,slug,is_demo)),project_people(name,role,provenance),project_sources(source_name,source_url),project_awards(award_name,award_year),project_tags(tag)').eq('slug',slug).eq('is_demo',false).maybeSingle();
  if(error)return `<article class="du-glass"><h2>Project unavailable.</h2><p>${esc(error.message)}</p></article>`;if(!p)return null;
  const imgs=(p.project_images||[]).sort((a,b)=>(b.is_hero?1:0)-(a.is_hero?1:0)||a.sort_order-b.sort_order);
  const team=(p.project_firms||[]).filter(x=>x.firms&&!x.firms.is_demo);
  const facts=[['Address',p.street_address],['Location',[p.city,p.state,US.has(p.country)?'':p.country].filter(Boolean).join(', ')],['Type',p.project_type],['Status',p.status],['Opened',p.opened_year],['Completed',p.completion_year],['Owner',p.owner_name],['Cost',p.cost_text],['Capacity',p.capacity_text],['Size',p.size_text||(p.size_sqft?Number(p.size_sqft).toLocaleString()+' sf':'')]].filter(x=>x[1]);
  const kf=Array.isArray(p.key_facts)?p.key_facts:[],cf=Array.isArray(p.conflicts)?p.conflicts:[];
  return `<div class="du-live-profile du-project-profile"><span class="eyebrow">DrawUp Project Profile</span><h1>${esc(p.name)}</h1>${p.street_address?`<p class="du-project-address">${esc(p.street_address)}</p>`:''}
  ${imgs.length?`<div class="du-live-photos">${imgs.slice(0,8).map(i=>`<figure><img src="${esc(i.image_url)}" alt="${esc(i.caption||p.name)}" loading="lazy">${i.caption?`<figcaption>${esc(i.caption)}</figcaption>`:''}</figure>`).join('')}</div>`:`<div class="du-proj-nophoto du-proj-nophoto-wide"><span class="du-proj-type">${esc(String(p.project_type||'Project').toUpperCase())}</span><b>${esc(p.name)}</b><small>No photos on DrawUp yet. Firms credited on this project can add photos with credit from their Portal.</small>${p.image_page_url?`<a class="btn btn-ghost btn-sm" href="${esc(p.image_page_url)}" target="_blank" rel="noopener">See official project photos on ${esc(domainOf(p.image_page_url))} ↗</a>`:''}</div>`}
  ${p.description?`<p class="du-live-desc">${esc(p.description)}</p>`:''}
  ${facts.length?`<div class="du-live-facts">${facts.map(x=>`<div><span class="meta">${esc(x[0])}</span><b>${esc(x[1])}</b></div>`).join('')}</div>`:''}
  ${kf.length?`<h3>Key facts</h3><ul class="du-live-list du-key-facts">${kf.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
  <h3>Who designed, engineered and built it</h3>${team.length||(p.project_people||[]).length?`<ul class="du-live-list">${team.map(x=>`<li><b>${esc(x.role)}:</b> <a href="#" data-firm-slug="${esc(x.firms.slug)}">${esc(x.firms.name)}</a> <span class="meta">${esc(String(x.provenance||'unverified').replace('_',' '))}</span></li>`).join('')}${(p.project_people||[]).map(x=>`<li><b>${esc(x.role||'Team')}:</b> ${esc(x.name)} <span class="meta">${esc(String(x.provenance||'unverified').replace('_',' '))}</span></li>`).join('')}</ul>`:'<p class="meta">No team attribution on record yet.</p>'}
  ${cf.length?`<h3>Where sources disagree</h3><ul class="du-live-list du-conflicts">${cf.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
  ${(p.project_awards||[]).length?`<h3>Awards</h3><ul class="du-live-list">${p.project_awards.map(a=>`<li>${esc(a.award_name)}${a.award_year?' · '+esc(a.award_year):''}</li>`).join('')}</ul>`:''}
  ${(p.project_tags||[]).length?`<p class="meta">${p.project_tags.map(t=>esc(t.tag)).join(' · ')}</p>`:''}
  ${(p.project_sources||[]).length?`<h3>Sources</h3><ul class="du-live-list du-sources">${p.project_sources.map(s=>`<li><a href="${esc(s.source_url)}" target="_blank" rel="noopener">${esc(s.source_name)} ↗</a></li>`).join('')}</ul>`:''}</div>`;
}
function bindProfileLinks(root,openFirm,openProj){
  root.querySelectorAll('[data-firm-slug]').forEach(a=>a.onclick=e=>{e.preventDefault();e.stopPropagation();openFirm(a.dataset.firmSlug);});
  root.querySelectorAll('[data-project-slug]').forEach(a=>a.onclick=e=>{e.preventDefault();e.stopPropagation();openProj(a.dataset.projectSlug);});
  root.querySelectorAll('[data-du-person]').forEach(tr=>{const go=e=>{if(e.type==='keydown'&&e.key!=='Enter')return;e.preventDefault();e.stopPropagation();window.DrawUpV19?.openPerson?.(tr.dataset.duPerson);};tr.onclick=go;tr.onkeydown=go;});
  root.querySelectorAll('[data-du-showcase]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();window.DrawUpV20?.openShowcase?.(b.dataset.duShowcase);});
  window.DrawUpFirms?.bind?.(root);
  root.querySelectorAll('[data-du-manage-firm]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();try{sessionStorage.setItem('du-manage-firm',b.dataset.duManageFirm);}catch(_e){}if(window.DrawUpPortal?.isSignedIn?.()){window.DrawUpPortal.openPortal('firm');window.DrawUpPortal.openPortalTab('firm');}});
}
function showPublicPage(id){const current=[...document.querySelectorAll('.page')].find(p=>!p.hidden);if(id==='firm-profile'&&current&&current.id!=='page-firm-profile')window.__duProfileBackPage=current.id.replace(/^page-/,'');document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!=='page-'+id);history.replaceState(null,'','#'+id);window.scrollTo(0,0);const back=document.getElementById('du-global-profile-back');if(back)back.hidden=id!=='firm-profile';}
async function openFirm(slug){
  if(window.DrawUpPortal?.isSignedIn?.()&&document.getElementById('du-portal')?.classList.contains('open'))return window.DrawUpPortal.openFirm(slug);
  document.querySelectorAll('.v12-portal.open').forEach(x=>x.classList.remove('open'));
  const host=$('du-live-firm-profile');if(!host)return;host.innerHTML='<p class="meta">Loading firm…</p>';showPublicPage('firm-profile');
  host.innerHTML=(await firmProfileHTML(slug))||emptyBlock('Firm not found.','This firm is not in the DrawUp directory.',false);bindProfileLinks(host,openFirm,openProject);
  if(/^[a-z0-9-]+$/.test(slug||''))history.replaceState(null,'','#firm/'+slug);
}
async function openProject(slug){
  if(window.DrawUpPortal?.isSignedIn?.()&&document.getElementById('du-portal')?.classList.contains('open'))return window.DrawUpPortal.openProject(slug);
  document.querySelectorAll('.v12-portal.open').forEach(x=>x.classList.remove('open'));
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
const DU_GENERIC_PROJECT_WORDS=new Set(['the','a','an','of','at','in','on','for','and','project','building','facility','venue','field','park','stadium','arena','center','centre','campus','complex','baseball','basketball','football','soccer','sports','indoor','outdoor','nfl','nba','wnba','mlb','nhl','mls','ncaa']);
function duNormName(v){return String(v||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();}
function duCoreTokens(v){return duNormName(v).split(/\s+/).filter(x=>x&&x.length>1&&!DU_GENERIC_PROJECT_WORDS.has(x));}
function duProjectScore(q,p){
  const nq=duNormName(q),nn=duNormName(p?.name);if(!nq||!nn)return 0;
  if(nq===nn)return 100;if(nq.includes(nn)||nn.includes(nq))return 98;
  const qt=duCoreTokens(q),nt=duCoreTokens(p?.name);if(!qt.length)return 0;
  const aliases=(p?.project_tags||[]).map(x=>x?.tag||'').join(' ');
  const sources=(p?.project_sources||[]).map(x=>x?.source_name||'').join(' ');
  const context=duNormName([p?.name,p?.description,p?.city,p?.state,p?.country,p?.project_type,p?.owner_name,aliases,sources].filter(Boolean).join(' '));
  const nameHit=nt.filter(t=>qt.includes(t)).length;
  const contextHit=qt.filter(t=>context.includes(t)).length;
  const contextRecall=contextHit/qt.length;
  let score=0;
  if(nt.length&&nameHit){const nameRecall=nameHit/nt.length,namePrecision=nameHit/qt.length;score=Math.max(score,70*nameRecall+25*namePrecision+(nameRecall===1?8:0));}
  // If every meaningful query token is already present in the stored project record,
  // treat it as a canonical DrawUp match even when the user searched by tenant/team/old-name context.
  if(contextRecall===1)score=Math.max(score,92);
  else if(contextRecall>=.75)score=Math.max(score,86);
  const place=duNormName([p?.city,p?.state].filter(Boolean).join(' '));if(place&&nq.includes(place))score+=3;
  return Math.min(99,score);
}
async function fuzzyProjects(c,q,maxRows){
  const {data,error}=await c.from('aec_projects').select('slug,name,city,state,country,project_type,completion_year,opened_year,description,owner_name,image_page_url,project_tags(tag),project_sources(source_name),project_images(image_url,is_hero,sort_order)').eq('is_demo',false).limit(500);
  if(error)return [];
  return (data||[]).map(p=>({...p,_match_score:duProjectScore(q,p),image_url:projectMedia(p)})).filter(p=>p._match_score>=78).sort((a,b)=>b._match_score-a._match_score).slice(0,maxRows||12);
}
async function searchDb(q,kind){const c=await db();if(!c)throw new Error('DrawUp database is not connected.');const {data,error}=await c.rpc('drawup_search',{q,kind:kind||'all',max_rows:12});if(error)throw error;const out=data||{firms:[],projects:[]};if(kind!=='firms'){
  const fuzzy=await fuzzyProjects(c,q,12);const seen=new Set((out.projects||[]).map(p=>p.slug));for(const p of fuzzy)if(!seen.has(p.slug)){(out.projects||(out.projects=[])).push(p);seen.add(p.slug);}out.projects=(out.projects||[]).map(p=>({...p,_match_score:Math.max(Number(p._match_score)||0,duProjectScore(q,p))})).sort((a,b)=>(b._match_score||0)-(a._match_score||0));
  out.strong_project=out.projects.find(p=>(p._match_score||0)>=88)||null;
}return out;}

function refresh(pageId){
  if(!pageId||pageId==='page-connect')renderConnect();
  if(!pageId||pageId==='page-discover')renderDiscover();
  if(!pageId||pageId==='page-home')renderHomeRoster();
}
document.addEventListener('click',e=>{
  const sub=e.target.closest('[data-du-submit-firm]');if(sub){e.preventDefault();openFirmSubmission();return;}
  const f=e.target.closest('[data-firm-slug]');if(f&&!f.closest('#du-portal')&&!f.closest('.du-live-profile')){e.preventDefault();e.stopImmediatePropagation();openFirm(f.dataset.firmSlug);}
},true);
window.DrawUpLive={refresh,loadFirms,projectCard,firmProfileHTML,projectProfileHTML,bindProfileLinks,openFirmSubmission,searchDb,openFirm,openProject};
function boot(){refresh();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
