/* DrawUp V21: Arch Coach Learning dashboard + DrawUp Playbook.
 *
 * Lives inside the Portal Arch Coach tab (no new Portal tab id is needed):
 *   #portal/arch-coach?learn                Learning dashboard (progress, XP, badges, resources, continue)
 *   #portal/arch-coach?pb                   Playbook hub (5 career paths, position picker, plays)
 *   #portal/arch-coach?pb=ch:<channel>      one play (channel)
 *   #portal/arch-coach?pb=lesson:<slug>     a lesson: Watch, Learn, Practice, Field, Verify, Complete
 *   #portal/arch-coach?pb=watch|challenges|board|studio
 * A "Learning" button is added to the Arch Coach header from this file (coach files are not edited).
 *
 * Data: playbook_* tables (migration 0041). Members write only their own position and progress.
 * Verify grades are written by /api/playbook (service role) and badges + XP only by the
 * playbook_complete() database function, so nothing here can award itself XP. Lessons can be
 * created and published only by DrawUp HQ accounts (RLS is_drawup_admin()).
 * Discussion board posts reuse Connect Boards (connect_posts kind board, topic "Playbook: <play>").
 */
(()=>{'use strict';
if(window.DrawUpPlaybook)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const P=()=>window.DrawUpPortal;
const yt=q=>'https://www.youtube.com/results?search_query='+encodeURIComponent(q).replace(/%20/g,'+');
const safeUrl=u=>/^https:\/\//i.test(String(u||''))?String(u):'';
/* Video links: YouTube (youtube-nocookie embed), Instagram reels/posts (official /embed page) and plain video files.
   Embeds load only when the viewer taps the poster, and always keep an "Open on ..." link as the fallback. */
function mediaOf(u){u=safeUrl(u);if(!u)return null;let m;
  try{const x=new URL(u),h=x.hostname.toLowerCase().replace(/^(www|m)\./,'');
    if(h==='youtube.com'||h==='youtube-nocookie.com'){const v=x.searchParams.get('v')||'';if(x.pathname==='/watch'&&/^[\w-]{11}$/.test(v))return {type:'youtube',id:v,open:u};m=x.pathname.match(/^\/(shorts|embed|live)\/([\w-]{11})/);if(m)return {type:'youtube',id:m[2],open:u};}
    if(h==='youtu.be'){m=x.pathname.match(/^\/([\w-]{11})/);if(m)return {type:'youtube',id:m[1],open:u};}
    if(h==='instagram.com'){m=x.pathname.match(/^\/(reel|reels|p|tv)\/([\w-]{5,40})/);if(m){const k=m[1]==='reels'?'reel':m[1];return {type:'instagram',kind:k,id:m[2],open:`https://www.instagram.com/${k}/${m[2]}/`};}}
    if(/\.(mp4|webm|mov)$/i.test(x.pathname))return {type:'file',url:u,open:u};
  }catch(_e){}return null;}
function embedHTML(u,label,note,style){const md=mediaOf(u);if(!md)return '';
  const site=md.type==='youtube'?'YouTube':md.type==='instagram'?'Instagram':'the source';
  return `<figure class="pb-embed pb-embed-${md.type}" data-embed="${esc(JSON.stringify(md))}">${style?'<span class="pb-style">★ The style DrawUp wants</span>':''}<button type="button" class="pb-poster" aria-label="Play ${esc(label||'video')}"><span>▶</span><b>${esc(label||'Video')}</b><small>Tap to load from ${site}</small></button>
  <figcaption>${note?esc(note)+' ':''}<a href="${esc(md.open)}" target="_blank" rel="noopener">Open on ${site} ↗</a></figcaption></figure>`;}
function bindEmbeds(root){root.querySelectorAll('.pb-embed .pb-poster').forEach(b=>b.onclick=()=>{const f=b.closest('.pb-embed');let md;try{md=JSON.parse(f.dataset.embed);}catch(_e){return;}
  let el;if(md.type==='file'){el=document.createElement('video');el.controls=true;el.preload='metadata';el.src=md.url;}
  else{el=document.createElement('iframe');el.loading='lazy';el.allowFullscreen=true;el.referrerPolicy='strict-origin-when-cross-origin';el.title='Video';
    el.allow='accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    el.src=md.type==='youtube'?`https://www.youtube-nocookie.com/embed/${encodeURIComponent(md.id)}?rel=0`:`https://www.instagram.com/${md.kind}/${encodeURIComponent(md.id)}/embed`;}
  el.className='pb-frame';b.replaceWith(el);});}

/* =================================================================== catalog */
const PATHS=[
 {key:'architecture',icon:'🏛️',name:'Architecture',blurb:'Draw it, detail it, code it, design it.',channels:['how-to-draw','detail-school','code-playbook','construction-documents','design-studio','building-types','sketch-challenges','arch-coach-challenges','software-gym','lessons-from-architects','project-walkthroughs']},
 {key:'engineering',icon:'⚙️',name:'Engineering',blurb:'Loads, systems and coordination across every discipline.',channels:['engineering-fundamentals','structural-engineering','mechanical-hvac','electrical','plumbing','fire-protection','civil-site','building-systems','coordination-challenges']},
 {key:'construction',icon:'👷',name:'Construction',blurb:'A virtual apprenticeship: drawing, detail, installation, finished building.',channels:['how-buildings-get-built','on-the-jobsite','means-methods','read-the-drawings','estimating','scheduling','rfis-submittals','field-management','construction-technology','trade-school']},
 {key:'pm',icon:'📋',name:'Project Management',blurb:'Run projects from setup through closeout. Make the calls in PM Simulations.',channels:['project-setup','project-phases','pm-simulations','team-management','client-management','budget-management','schedule-management','risk-management','qa-qc','construction-administration','office-lessons','leadership']},
 {key:'career',icon:'🎓',name:'Licensure & Career',blurb:'School to license, and what every AEC role actually does.',channels:['licensure-roadmap','are-study-room','aec-career-playbook','student-corner','aia-ce-learning']}];
const CH={
 'how-to-draw':['How to Draw','Floor plans, RCPs, elevations, sections, wall sections, details, stairs, doors and windows, enlarged plans, diagrams, axons and CD graphics.','architectural drawing tutorial construction documents'],
 'detail-school':['Detail School','What is this detail? Explanation, example, drawing exercise and the real construction photo.','architectural detail explained'],
 'code-playbook':['Code Playbook','IBC, accessibility, NFPA, occupancy, construction types, egress, fire ratings, plumbing fixture counts and healthcare.','IBC building code explained'],
 'construction-documents':['Construction Documents','How a real set is assembled: cover, life safety, plans, RCP, elevations, sections, details, schedules, specs.','how to put together a construction document set'],
 'design-studio':['Design Studio','Programming, adjacency diagrams, space planning, concept, materials, facade studies, sustainability and critiques.','architecture design process concept development'],
 'building-types':['Building Types','Healthcare, higher ed, K-12, residential, hospitality, sports, aviation, labs, retail and workplace.','building type design healthcare architecture'],
 'sketch-challenges':['Sketch Challenges','Draw this wall section, finish this stair detail, lay out this restroom.','architectural sketching practice'],
 'arch-coach-challenges':['Arch Coach Challenges','Real AEC problems. Find what does not comply and Arch Coach grades it.','building code compliance review'],
 'software-gym':['Software Gym','Revit, AutoCAD, Rhino, SketchUp, Adobe, Bluebeam, rendering and BIM workflows.','Revit tutorial for beginners'],
 'lessons-from-architects':['Lessons From Architects','What to learn from the work of Zaha Hadid, Paul R. Williams, Frank Lloyd Wright, Norman Foster, Jeanne Gang, Frank Gehry and more.','architect lecture design philosophy'],
 'project-walkthroughs':['Project Walkthroughs','Follow one building from programming to SD, DD, CD, permit, bid, construction, punch list and CO.','building project from design to construction'],
 'engineering-fundamentals':['Engineering Fundamentals','Loads, forces, systems thinking, reading architectural drawings, calculations, coordination and specs.','structural engineering fundamentals'],
 'structural-engineering':['Structural Engineering','Foundations, slabs, beams, columns, steel, concrete, wood, masonry, lateral systems and connections.','structural engineering explained building'],
 'mechanical-hvac':['Mechanical / HVAC','Loads, equipment, ductwork, diffusers, AHUs, VAVs, mechanical rooms, controls and plan reading.','HVAC system design commercial building explained'],
 'electrical':['Electrical','Power distribution, lighting, panels, transformers, generators, emergency power, one-lines and grounding.','electrical one line diagram explained building'],
 'plumbing':['Plumbing','Domestic water, sanitary, storm, medical gas, risers, fixture calculations and coordination.','commercial plumbing design explained'],
 'fire-protection':['Fire Protection','Sprinkler layouts, standpipes, fire pumps, alarm coordination and life safety systems.','fire sprinkler system design explained'],
 'civil-site':['Civil / Site','Grading, drainage, utilities, stormwater, roads, parking, site accessibility and site plans.','civil site plan grading drainage explained'],
 'building-systems':['Building Systems','Structure, HVAC, electrical, plumbing, fire protection, envelope, acoustics, lighting and vertical transportation.','building systems explained architecture'],
 'coordination-challenges':['Coordination Challenges','Structure and ductwork want the same ceiling space. Coordinate a solution.','MEP coordination clash detection'],
 'how-buildings-get-built':['How Buildings Get Built','Sitework, foundations, structure, enclosure, MEP rough in, interiors, commissioning and turnover.','how a commercial building is built step by step'],
 'on-the-jobsite':['On the Jobsite','Field video of foundations, steel, framing, MEP rough in, curtain wall, roofing, inspections, punch and closeout.','construction site walkthrough'],
 'means-methods':['Means & Methods','Sequencing, protection, scaffolding, cranes, logistics, staging and constructability.','construction means and methods'],
 'read-the-drawings':['Read the Drawings','Architectural, structural, MEP, civil and shop drawings from the contractor view.','how to read construction drawings'],
 'estimating':['Estimating','Takeoffs, labor and material costs, allowances, contingencies and conceptual estimates.','construction estimating quantity takeoff'],
 'scheduling':['Scheduling','Milestones, critical path, look-aheads, procurement and sequencing.','construction scheduling critical path'],
 'rfis-submittals':['RFIs & Submittals','Practice writing an RFI, reviewing a shop drawing and responding to a submittal.','construction RFI submittal process'],
 'field-management':['Field Management','Daily reports, inspections, safety, punch lists, QC and subcontractor coordination.','construction superintendent daily'],
 'construction-technology':['Construction Technology','BIM coordination, clash detection, drones, laser scanning and field software.','construction technology BIM laser scanning'],
 'trade-school':['Trade School','Carpentry, concrete, steel, electrical, plumbing, HVAC, drywall, glazing and roofing.','construction trades training'],
 'project-setup':['Project Setup','Scope, contracts, fees, consultants, schedules, deliverables and execution plans.','architecture project setup fee proposal'],
 'project-phases':['Project Phases','Programming, SD, DD, CD, permit, bid, CA and closeout.','architecture design phases explained'],
 'pm-simulations':['PM Simulations','You are the PM. Make the decisions and Arch Coach explains the consequences.','architecture project manager day in the life'],
 'team-management':['Team Management','Architects, engineers, consultants, contractors, owners and stakeholders.','AEC team management'],
 'client-management':['Client Management','Kickoffs, presentations, expectations, hard conversations and decision tracking.','architect client management'],
 'budget-management':['Budget Management','Fees, hours, burn rates, consultant costs, construction budgets and change.','architecture fee management burn rate'],
 'schedule-management':['Schedule Management','Milestones, dependencies, deadlines, recovery schedules and resourcing.','project schedule management AEC'],
 'risk-management':['Risk Management','Find project risks before they become expensive.','construction project risk management'],
 'qa-qc':['QA/QC','Drawing reviews, interdisciplinary coordination, constructability reviews and issue tracking.','architecture QA QC drawing review'],
 'construction-administration':['Construction Administration','RFIs, submittals, ASIs, change orders, pay apps, site observations and punch lists.','construction administration architect'],
 'office-lessons':['Office Lessons','RFIs, submittals, ASIs, change orders, minutes, redlines, QA/QC, consultants, proposals and fees.','architecture office practice'],
 'leadership':['Leadership','Delegation, mentoring, conflict resolution, communication and running meetings.','leadership for architects engineers'],
 'licensure-roadmap':['Licensure Roadmap','School, experience (AXP), ARE, registration and continuing education.','NCARB licensure path AXP ARE'],
 'are-study-room':['ARE Study Room','Organized around the ARE divisions: study videos, practice questions, flashcards and study groups.','ARE 5.0 study tips'],
 'aec-career-playbook':['AEC Career Playbook','What architects, interior designers, engineers, contractors, owners, PMs, BIM managers and spec writers do.','AEC careers day in the life'],
 'student-corner':['Student Corner','Portfolio reviews, studio advice, model making, internships, resumes and moving into practice.','architecture student portfolio tips'],
 'aia-ce-learning':['AIA / CE Learning','Continuing education. DrawUp is not an approved AIA CES provider yet, so nothing here earns official credit.','AIA continuing education architecture']};
const POSITIONS=[['Architect','architecture',['how-to-draw','code-playbook','construction-documents']],['Interior Designer','architecture',['design-studio','code-playbook','building-types']],['Student','career',['student-corner','licensure-roadmap','how-to-draw']],['Emerging Professional','career',['licensure-roadmap','are-study-room','office-lessons']],['Structural Engineer','engineering',['structural-engineering','engineering-fundamentals','coordination-challenges']],['MEP Engineer','engineering',['mechanical-hvac','electrical','plumbing','coordination-challenges']],['Civil Engineer','engineering',['civil-site','engineering-fundamentals']],['Superintendent','construction',['field-management','how-buildings-get-built','on-the-jobsite']],['Estimator','construction',['estimating','read-the-drawings']],['Project Engineer','construction',['rfis-submittals','read-the-drawings','construction-technology']],['Project Manager','pm',['pm-simulations','project-phases','budget-management']],['BIM Manager','architecture',['software-gym','construction-documents','coordination-challenges']],['Spec Writer','architecture',['construction-documents','code-playbook']],['Owner / Developer','pm',['project-phases','client-management','risk-management']],['Trades','construction',['trade-school','how-buildings-get-built']]];
const PROJECT_LINKS={'the-line-neom-case-study':'the-line-neom'};
const MODES=[['watch','Watch','🎥'],['learn','Learn','📖'],['practice','Practice','✏️'],['field','Field','🏗️'],['verify','Verify','🤖'],['complete','Complete','🏆']];
const RESOURCES=[['NCARB','https://www.ncarb.org','Licensure, AXP and the ARE'],['The American Institute of Architects','https://www.aia.org','Practice, contracts and continuing education'],['International Code Council','https://www.iccsafe.org','IBC, IRC, IECC and ICC A117.1'],['ADA.gov','https://www.ada.gov','2010 ADA Standards for Accessible Design'],['NFPA','https://www.nfpa.org','NFPA 101 Life Safety Code and fire codes'],['OSHA','https://www.osha.gov','Construction safety'],['Whole Building Design Guide','https://www.wbdg.org','Design and construction guidance from NIBS'],['NAAB','https://www.naab.org','Accredited architecture programs'],['ASHRAE','https://www.ashrae.org','HVAC and energy standards'],['AISC','https://www.aisc.org','Steel design and construction'],['CSI','https://www.csiresources.org','Specifications and MasterFormat'],['PMI','https://www.pmi.org','Project management']];

/* =================================================================== state + data */
const S={loaded:false,lessons:[],progress:new Map(),attempts:new Map(),awards:[],member:null,xp:0,isHq:false,uid:null};
const cx=()=>P()?.ctx?.()||null;
const pathOf=k=>PATHS.find(p=>p.key===k);
const chName=k=>CH[k]?.[0]||k;
const pub=()=>S.lessons.filter(l=>l.status==='published');
const bySlug=s=>S.lessons.find(l=>l.slug===s);
const lessonModes=l=>[...(l.modes||[]),'verify','complete'];
const best=id=>S.attempts.get(id)?.best||null;
const earned=id=>S.awards.find(a=>a.lesson_id===id);
const doneModes=l=>{const p=S.progress.get(l.id);const d=new Set(p?.modes||[]);if(best(l.id)?.passed)d.add('verify');if(earned(l.id))d.add('complete');return d;};
const pct=l=>{const m=lessonModes(l),d=doneModes(l);return Math.round(100*m.filter(x=>d.has(x)).length/m.length);};
const nextMode=l=>lessonModes(l).find(m=>!doneModes(l).has(m))||'complete';
const position=()=>S.member?.position||'Architect';
const posRow=()=>POSITIONS.find(p=>p[0]===position())||POSITIONS[0];
function toast(m,bad){const c=cx();if(c?.toast)return c.toast(m,bad);console[bad?'warn':'log'](m);}

async function load(force){
  const c=cx();if(!c?.user)return false;
  if(S.loaded&&!force&&S.uid===c.user.id)return true;
  const cl=c.client,uid=c.user.id;S.uid=uid;S.isHq=!!c.isAdmin;
  const [l,pr,at,aw,me,coach]=await Promise.all([
    cl.from('playbook_lessons').select('*').order('sort_order'),
    cl.from('playbook_progress').select('*').eq('user_id',uid),
    cl.from('playbook_attempts').select('id,lesson_id,score,passed,found,missing,feedback,created_at').eq('user_id',uid).order('created_at',{ascending:false}).limit(300),
    cl.from('playbook_awards').select('*').eq('user_id',uid).order('created_at',{ascending:false}),
    cl.from('playbook_members').select('*').eq('user_id',uid).maybeSingle(),
    cl.from('arch_coach_profiles').select('xp').eq('user_id',uid).maybeSingle()]);
  if(l.error)throw l.error;
  S.lessons=l.data||[];S.progress=new Map((pr.data||[]).map(r=>[r.lesson_id,r]));
  S.attempts=new Map();(at.data||[]).forEach(a=>{const e=S.attempts.get(a.lesson_id)||{list:[],best:null};e.list.push(a);if(!e.best||a.score>e.best.score)e.best=a;S.attempts.set(a.lesson_id,e);});
  S.awards=aw.data||[];S.member=me.data||null;S.xp=coach.data?.xp||0;S.loaded=true;return true;
}
async function saveProgress(l,mode,extra={}){
  const c=cx(),cur=S.progress.get(l.id),modes=[...new Set([...(cur?.modes||[]),...(mode&&mode!=='verify'&&mode!=='complete'&&(l.modes||[]).includes(mode)?[mode]:[])])];
  const row={modes,last_mode:mode||cur?.last_mode||null,...extra};
  const q=cur?c.client.from('playbook_progress').update({...row,updated_at:new Date().toISOString()}).eq('user_id',c.user.id).eq('lesson_id',l.id).select('*').single()
             :c.client.from('playbook_progress').insert({user_id:c.user.id,lesson_id:l.id,...row}).select('*').single();
  const {data,error}=await q;if(error)throw error;S.progress.set(l.id,data);return data;
}
async function savePosition(name){
  const c=cx(),row=POSITIONS.find(p=>p[0]===name);if(!row)return;
  const f={position:row[0],path_key:row[1]};
  const {data,error}=S.member?await c.client.from('playbook_members').update({...f,updated_at:new Date().toISOString()}).eq('user_id',c.user.id).select('*').single():await c.client.from('playbook_members').insert({user_id:c.user.id,...f}).select('*').single();
  if(error)throw error;S.member=data;
}

/* =================================================================== routing */
const params=()=>new URLSearchParams((location.hash.split('?')[1])||'');
const isOurs=()=>/^#portal\/arch-coach\?/.test(location.hash)&&(params().has('learn')||params().has('pb'));
/* want: the Playbook was asked for. A Portal reload of the coach tab that starts AFTER that (its loading
   placeholder appears) means someone opened the coach chat, so the Playbook steps aside. */
let want=false,bootWant=false,coachOpened=false;
function go(q){want=true;coachOpened=false;history.replaceState(null,'','#portal/arch-coach?'+q);render();}
function backToCoach(){history.replaceState(null,'','#portal/arch-coach');P()?.openPortalTab?.('arch-coach');}
let renderSeq=0;
async function render(){
  const w=$('#du-workspace-content');if(!w||!isOurs())return;
  const seq=++renderSeq;w.dataset.pb='1';
  if(!w.querySelector('.pb-root'))w.innerHTML='<div class="pb-root"><div class="du-loading">OPENING THE PLAYBOOK…</div></div>';
  try{if(!await load())return;}catch(e){w.innerHTML=`<div class="pb-root"><article class="pb-card"><span class="du-kicker">PLAYBOOK</span><h2>The Playbook could not load.</h2><p>${esc(e.message||e)}</p><button class="du-btn primary" data-pb-retry>Try again</button></article></div>`;w.querySelector('[data-pb-retry]').onclick=()=>{S.loaded=false;render();};return;}
  if(seq!==renderSeq||!isOurs()||!(want||bootWant))return;
  const pr=params(),root=document.createElement('div');root.className='pb-root';
  const pb=pr.get('pb');
  if(pr.has('learn')&&!pr.has('pb'))viewDashboard(root);
  else if(pb&&pb.startsWith('lesson:'))viewLesson(root,pb.slice(7),pr.get('m'));
  else if(pb&&pb.startsWith('ch:'))viewChannel(root,pb.slice(3));
  else viewHub(root,pb||'');
  w.innerHTML='';w.appendChild(root);window.scrollTo?.(0,0);w.scrollTop=0;
}
function nav(root){
  root.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();go(b.dataset.go);}));
  root.querySelectorAll('[data-pb-coach]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();backToCoach();}));
}
const crumbs=items=>`<nav class="pb-crumbs" aria-label="Breadcrumb"><button type="button" data-pb-coach>Arch Coach</button>${items.map(([t,q])=>q?`<span>›</span><button type="button" data-go="${esc(q)}">${esc(t)}</button>`:`<span>›</span><b>${esc(t)}</b>`).join('')}</nav>`;
const ring=(v,label)=>`<div class="pb-ring" style="--v:${Math.max(0,Math.min(100,v))}"><b>${esc(label??v+'%')}</b></div>`;

/* =================================================================== Learning dashboard */
function viewDashboard(root){
  const L=pub(),done=S.awards.length,lv=window.DrawUpCoach?.level?.(S.xp)||1+Math.floor(Math.sqrt(S.xp/25));
  const pbXp=S.awards.reduce((a,b)=>a+(b.xp||0),0);
  const recent=[...S.progress.values()].sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).map(p=>L.find(l=>l.id===p.lesson_id)).filter(l=>l&&!earned(l.id));
  const cont=recent[0];const rec=L.filter(l=>l.path_key===posRow()[1]&&!earned(l.id)&&!S.progress.has(l.id)).slice(0,3);
  root.innerHTML=`${crumbs([['Learning']])}
  <header class="pb-head"><div><span class="du-kicker">ARCH COACH · LEARNING</span><h1>Your learning dashboard</h1><p>Progress, badges and resources. Lessons live in DrawUp Playbook.</p></div>
  <button type="button" class="pb-portal" data-go="pb"><span class="pb-portal-glow"></span><small>LEARNING PORTAL</small><b>📖 Enter DrawUp Playbook →</b><i>Choose your position · Learn the playbook · Run drills · Get coached · Level up</i></button></header>
  <section class="pb-stats">
    <article><span>Coach level</span><strong>${lv}</strong><small>${S.xp} XP total</small></article>
    <article><span>Playbook XP</span><strong>${pbXp}</strong><small>from lessons</small></article>
    <article><span>Badges</span><strong>${done}</strong><small>of ${L.length} lessons</small></article>
    <article><span>In progress</span><strong>${recent.length}</strong><small>Position: ${esc(position())}</small></article></section>
  <div class="pb-grid2">
    <article class="pb-card pb-continue"><span class="du-kicker">CONTINUE WHERE YOU LEFT OFF</span>${cont?`<div class="pb-cont">${ring(pct(cont))}<div><h3>${esc(cont.title)}</h3><p>${esc(chName(cont.channel_key))} · next: ${esc(MODES.find(m=>m[0]===nextMode(cont))[1])}</p><button class="du-btn primary" data-go="pb=lesson:${esc(cont.slug)}&m=${nextMode(cont)}">Resume →</button></div></div>`:`<p>Nothing started yet. ${rec.length?'Here is where we suggest you begin:':'Open the Playbook to pick your first lesson.'}</p>`}
      ${rec.length?`<div class="pb-mini-list">${rec.map(l=>`<button type="button" data-go="pb=lesson:${esc(l.slug)}"><b>${esc(l.title)}</b><small>${esc(chName(l.channel_key))} · ${l.minutes} min</small></button>`).join('')}</div>`:''}</article>
    <article class="pb-card"><span class="du-kicker">PROGRESS BY PATH</span>${PATHS.map(p=>{const ls=L.filter(l=>l.path_key===p.key),d=ls.filter(l=>earned(l.id)).length;return `<button type="button" class="pb-bar" data-go="pb=path:${p.key}"><span>${p.icon} ${esc(p.name)}</span><i><u style="width:${ls.length?Math.round(100*d/ls.length):0}%"></u></i><small>${d}/${ls.length}</small></button>`;}).join('')}</article>
  </div>
  <div class="pb-grid2">
    <article class="pb-card"><span class="du-kicker">BADGES EARNED</span>${S.awards.length?`<div class="pb-badges">${S.awards.map(a=>`<span class="pb-badge" title="${esc(new Date(a.created_at).toLocaleDateString())}">🏆 ${esc(a.badge_name)}<small>+${a.xp} XP</small></span>`).join('')}</div>`:'<p class="pb-muted">Finish a lesson (pass Verify, then Complete) to earn your first badge. Badges show on your DrawUp profile.</p>'}</article>
    <article class="pb-card"><span class="du-kicker">RESOURCES</span><div class="pb-res">${RESOURCES.map(r=>`<a href="${esc(r[1])}" target="_blank" rel="noopener"><b>${esc(r[0])} ↗</b><small>${esc(r[2])}</small></a>`).join('')}</div><p class="pb-muted">Official sites. Codes and licensure rules vary by jurisdiction and edition, so always confirm locally.</p></article>
  </div>`;
  nav(root);
}

/* =================================================================== Playbook hub */
function hubTabs(active){const t=[['pb','Paths'],['pb=watch','Watch & Learn'],['pb=challenges','Challenges + Sims'],['pb=board','Board']];if(S.isHq)t.push(['pb=studio','HQ Studio']);
  return `<div class="pb-tabs" role="tablist">${t.map(([q,n])=>`<button type="button" role="tab" aria-selected="${q===active}" class="${q===active?'on':''}" data-go="${q}">${n}</button>`).join('')}</div>`;}
function viewHub(root,pb){
  const head=`${crumbs([['Learning','learn'],['DrawUp Playbook']])}<header class="pb-hero"><div><span class="du-kicker">📖 DRAWUP PLAYBOOK</span><h1>Choose your position. Learn the playbook.</h1><p class="pb-flow">Choose Your Position → Learn the Playbook → Run Drills → Get Coached → Play Real Scenarios → Level Up</p></div>
   <label class="pb-pos">My position<select id="pb-position">${POSITIONS.map(p=>`<option ${p[0]===position()?'selected':''}>${esc(p[0])}</option>`).join('')}</select></label></header>`;
  if(pb==='watch')return viewWatch(root,head);
  if(pb==='challenges')return viewChallenges(root,head);
  if(pb==='board')return viewBoard(root,head);
  if(pb==='studio'&&S.isHq)return viewStudio(root,head);
  const rec=posRow(),act=pb.startsWith('path:')?pb.slice(5):rec[1];const path=pathOf(act)||PATHS[0];
  const order=[...path.channels].sort((a,b)=>{const ia=rec[2].indexOf(a),ib=rec[2].indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib);});
  root.innerHTML=`${head}${hubTabs('pb')}
  <div class="pb-paths">${PATHS.map(p=>`<button type="button" class="pb-path ${p.key===path.key?'on':''}" data-go="pb=path:${p.key}"><span>${p.icon}</span><b>${esc(p.name)}</b>${p.key===rec[1]?'<em>Recommended</em>':''}</button>`).join('')}</div>
  <section class="pb-card pb-pathcard"><span class="du-kicker">${path.icon} ${esc(path.name.toUpperCase())}${path.key===rec[1]?' · RECOMMENDED FOR '+esc(position().toUpperCase()):''}</span><p>${esc(path.blurb)}</p>
   <div class="pb-chgrid">${order.map(k=>{const ls=pub().filter(l=>l.channel_key===k),d=ls.filter(l=>earned(l.id)).length,star=rec[2].includes(k);return `<button type="button" class="pb-ch ${star?'star':''}" data-go="pb=ch:${k}"><b>${esc(chName(k))}</b><small>${esc(CH[k]?.[1]||'')}</small><span>${ls.length?`${ls.length} lesson${ls.length>1?'s':''} · ${d} done`:'Videos + board · lessons coming'}${star?' · ★ for your position':''}</span></button>`;}).join('')}</div></section>`;
  nav(root);bindPosition(root);
}
function bindPosition(root){const s=root.querySelector('#pb-position');if(!s)return;s.onchange=async()=>{try{await savePosition(s.value);toast('Position saved. Your recommended path changed.');go('pb');}catch(e){toast('Could not save position: '+(e.message||e),true);}};}
const lessonCard=l=>{const d=earned(l.id),p=pct(l);return `<button type="button" class="pb-lesson" data-go="pb=lesson:${esc(l.slug)}"><span class="pb-kind k-${l.kind}">${l.kind==='lesson'?'Lesson':l.kind==='challenge'?'Arch Coach Challenge':'PM Simulation'}</span><b>${esc(l.title)}</b><small>${esc(l.summary||'')}</small><span class="pb-meta">${esc(l.level)} · ${l.minutes} min · ${lessonModes(l).length} modes${d?' · 🏆 earned':p?` · ${p}% done`:''}</span><i><u style="width:${p}%"></u></i></button>`;};
function viewChannel(root,k){
  const ls=pub().filter(l=>l.channel_key===k),path=PATHS.find(p=>p.channels.includes(k))||PATHS[0];
  root.innerHTML=`${crumbs([['Learning','learn'],['Playbook','pb'],[path.name,'pb=path:'+path.key],[chName(k)]])}
  <header class="pb-head"><div><span class="du-kicker">${path.icon} PLAY</span><h1>${esc(chName(k))}</h1><p>${esc(CH[k]?.[1]||'')}</p></div></header>
  ${ls.length?`<div class="pb-lessons">${ls.map(lessonCard).join('')}</div>`:`<article class="pb-card"><h3>HQ is building lessons for this play.</h3><p>Until then, watch what others have published and share good examples on the board.</p></article>`}
  <div class="pb-grid2"><article class="pb-card"><span class="du-kicker">🎥 WATCH & LEARN</span><p><a class="pb-link" href="${esc(yt(CH[k]?.[2]||chName(k)))}" target="_blank" rel="noopener">YouTube search: ${esc(CH[k]?.[2]||chName(k))} ↗</a></p><p class="pb-muted">Search results, not DrawUp endorsed videos. Members can post specific videos below.</p></article>
  <article class="pb-card"><span class="du-kicker">BOARD</span><p>Post a video, link or example for students in this play.</p><button class="du-btn primary" data-go="pb=board&ch=${k}">Open the ${esc(chName(k))} board</button></article></div>`;
  nav(root);
}
function viewChallenges(root,head){
  const ls=pub().filter(l=>l.kind!=='lesson');
  root.innerHTML=`${head}${hubTabs('pb=challenges')}<p class="pb-muted">Real AEC problems and PM decisions. Submit your answer and Arch Coach grades it against the rubric.</p><div class="pb-lessons">${ls.map(lessonCard).join('')||'<p>No challenges published yet.</p>'}</div>`;
  nav(root);bindPosition(root);
}
async function viewWatch(root,head){
  const items=pub().flatMap(l=>(l.watch||[]).map(v=>({...v,lesson:l})));
  const feat=items.filter(v=>mediaOf(v.url));const seen=new Set();
  root.innerHTML=`${head}${hubTabs('pb=watch')}${feat.length?`<article class="pb-card"><span class="du-kicker">CURATED VIDEOS</span><div class="pb-embeds">${feat.filter(v=>!seen.has(v.url)&&seen.add(v.url)).map(v=>embedHTML(v.url,v.label,(v.note?v.note+' ':'')+'In: '+v.lesson.title+'.',v.style)).join('')}</div></article>`:''}<div class="pb-grid2"><article class="pb-card"><span class="du-kicker">FROM PLAYBOOK LESSONS</span><div class="pb-res">${items.filter(v=>!mediaOf(v.url)).map(v=>safeUrl(v.url)?`<a href="${esc(v.url)}" target="_blank" rel="noopener"><b>${esc(v.label)} ↗</b><small>${esc(v.lesson.title)} · ${v.kind==='search'?'search results':v.kind==='official'?'official site':'video'}</small></a>`:'').join('')}</div></article>
  <article class="pb-card"><span class="du-kicker">POSTED BY MEMBERS</span><div id="pb-member-videos" class="pb-res"><p class="pb-muted">Loading…</p></div><button class="du-btn ghost" data-go="pb=board">Post a video</button></article></div>`;
  nav(root);bindPosition(root);bindEmbeds(root);
  const {data}=await cx().client.from('connect_posts').select('id,title,link_url,topic,created_at').eq('kind','board').like('topic','Playbook%').not('link_url','is',null).order('created_at',{ascending:false}).limit(40);
  const box=root.querySelector('#pb-member-videos');if(box){box.innerHTML=(data||[]).length?data.map(p=>mediaOf(p.link_url)?embedHTML(p.link_url,p.title,p.topic.replace(/^Playbook: /,'')+' · member post.'):safeUrl(p.link_url)?`<a href="${esc(p.link_url)}" target="_blank" rel="noopener"><b>${esc(p.title)} ↗</b><small>${esc(p.topic)} · member post</small></a>`:'').join(''):'<p class="pb-muted">No member videos yet. Be the first to post one.</p>';bindEmbeds(box);}
}

/* =================================================================== Board (Connect Boards, topic "Playbook: <play>") */
async function viewBoard(root,head){
  const ch=params().get('ch')||'';
  root.innerHTML=`${head}${hubTabs('pb=board')}
  <div class="pb-board"><form class="pb-card pb-post" id="pb-post"><span class="du-kicker">SHARE WITH STUDENTS</span>
   <label>Play<select name="ch">${Object.keys(CH).map(k=>`<option value="${k}" ${k===ch?'selected':''}>${esc(chName(k))}</option>`).join('')}</select></label>
   <label>Title<input name="title" maxlength="200" required placeholder="Example: Great wall section walkthrough"></label>
   <label>Video or link (https)<input name="link" type="url" placeholder="YouTube or Instagram reel link, https://…"></label>
   <label>Why it helps<textarea name="body" rows="3" maxlength="4000" placeholder="What students should look for"></textarea></label>
   <button class="du-btn primary">Post to the board</button><p class="pb-muted">Posts also appear in Connect › Boards. Anyone on DrawUp can read and reply.</p></form>
   <section class="pb-card"><span class="du-kicker">PLAYBOOK BOARD${ch?' · '+esc(chName(ch).toUpperCase()):''}</span><div id="pb-posts"><p class="pb-muted">Loading…</p></div></section></div>`;
  nav(root);bindPosition(root);
  const f=root.querySelector('#pb-post');
  f.onsubmit=async e=>{e.preventDefault();const c=cx(),fd=new FormData(f),title=String(fd.get('title')||'').trim(),link=String(fd.get('link')||'').trim(),body=String(fd.get('body')||'').trim();
    if(!title){toast('Add a title.',true);return;}if(link&&!safeUrl(link)){toast('Links must start with https://',true);return;}
    const btn=f.querySelector('button');btn.disabled=true;
    const {error}=await c.client.from('connect_posts').insert({author_id:c.user.id,kind:'board',topic:('Playbook: '+chName(String(fd.get('ch')))).slice(0,60),title,body:body||null,link_url:link||null});
    btn.disabled=false;if(error){toast(error.message,true);return;}toast('Posted to the Playbook board.');f.reset();loadPosts(root,ch);};
  loadPosts(root,ch);
}
async function loadPosts(root,ch){
  const c=cx();let q=c.client.from('connect_posts').select('id,title,body,topic,link_url,created_at,author_id,author:profiles!connect_posts_author_id_fkey(id,display_name,username),comments:connect_comments(count)').eq('kind','board').order('created_at',{ascending:false}).limit(60);
  q=ch?q.eq('topic',('Playbook: '+chName(ch)).slice(0,60)):q.like('topic','Playbook%');
  const {data,error}=await q;const box=root.querySelector('#pb-posts');if(!box)return;
  if(error){box.innerHTML=`<p>${esc(error.message)}</p>`;return;}
  box.innerHTML=(data||[]).length?data.map(p=>`<article class="pb-postrow" data-post="${p.id}"><div><small>${esc(p.topic.replace(/^Playbook: /,''))} · ${esc(p.author?.display_name||'Member')} · ${esc(new Date(p.created_at).toLocaleDateString())}</small><h4>${esc(p.title)}</h4>${p.body?`<p>${esc(p.body)}</p>`:''}${mediaOf(p.link_url)?embedHTML(p.link_url,p.title,'Member post.'):safeUrl(p.link_url)?`<a class="pb-link" href="${esc(p.link_url)}" target="_blank" rel="noopener">${esc(p.link_url.replace(/^https:\/\/(www\.)?/,'').slice(0,60))} ↗</a>`:''}</div>
   <button type="button" class="du-btn ghost pb-replies" data-replies="${p.id}">Replies (${p.comments?.[0]?.count||0})</button><div class="pb-thread" hidden></div></article>`).join(''):'<p class="pb-muted">No posts yet in this play. Share the first video or example.</p>';
  bindEmbeds(box);box.querySelectorAll('[data-replies]').forEach(b=>b.onclick=()=>openReplies(b.closest('[data-post]')));
}
async function openReplies(art){
  const c=cx(),id=art.dataset.post,box=art.querySelector('.pb-thread');box.hidden=false;box.innerHTML='<p class="pb-muted">Loading…</p>';
  const {data}=await c.client.from('connect_comments').select('id,body,created_at,author:profiles!connect_comments_author_id_fkey(display_name)').eq('post_id',id).order('created_at');
  box.innerHTML=`${(data||[]).map(m=>`<p class="pb-reply"><b>${esc(m.author?.display_name||'Member')}</b> ${esc(m.body)}</p>`).join('')}<form class="pb-replyform"><input maxlength="2000" placeholder="Reply…" required><button class="du-btn primary">Reply</button></form>`;
  box.querySelector('form').onsubmit=async e=>{e.preventDefault();const inp=box.querySelector('input'),t=inp.value.trim();if(!t)return;const {error}=await c.client.from('connect_comments').insert({post_id:id,author_id:c.user.id,body:t});if(error){toast(error.message,true);return;}openReplies(art);};
}

/* =================================================================== Lesson */
function viewLesson(root,slug,mode){
  const l=bySlug(slug);
  if(!l||(l.status!=='published'&&!S.isHq)){root.innerHTML=`${crumbs([['Learning','learn'],['Playbook','pb'],['Not found']])}<article class="pb-card"><h2>That lesson is not available.</h2><button class="du-btn primary" data-go="pb">Back to the Playbook</button></article>`;nav(root);return;}
  const modes=lessonModes(l),d=doneModes(l);if(!modes.includes(mode))mode=nextMode(l);
  const path=pathOf(l.path_key);
  root.innerHTML=`${crumbs([['Learning','learn'],['Playbook','pb'],[path.name,'pb=path:'+path.key],[chName(l.channel_key),'pb=ch:'+l.channel_key],[l.title]])}
  <header class="pb-head pb-lhead"><div><span class="du-kicker">${path.icon} ${esc(chName(l.channel_key).toUpperCase())} · ${esc(l.level.toUpperCase())}${l.status!=='published'?' · DRAFT':''}</span><h1>${esc(l.title)}</h1><p>${esc(l.summary||'')}</p></div>${ring(pct(l))}</header>
  <ol class="pb-steps">${modes.map(m=>{const M=MODES.find(x=>x[0]===m);return `<li><button type="button" class="${m===mode?'on':''} ${d.has(m)?'done':''}" data-go="pb=lesson:${esc(l.slug)}&m=${m}"><span>${d.has(m)?'✓':M[2]}</span>${M[1]}</button></li>`;}).join('')}</ol>
  <section class="pb-card pb-mode" id="pb-mode"></section>`;
  nav(root);
  const box=root.querySelector('#pb-mode');
  ({watch:modeWatch,learn:modeLearn,practice:modePractice,field:modeField,verify:modeVerify,complete:modeComplete})[mode](box,l);
}
const nextBtn=(l,m)=>{const ms=lessonModes(l),n=ms[ms.indexOf(m)+1];return n?`<button type="button" class="du-btn primary" data-mark="${m}" data-next="${n}">${m==='practice'?'Save practice':'Mark done'} · Next: ${MODES.find(x=>x[0]===n)[1]} →</button>`:'';};
function bindMark(box,l,before){box.querySelectorAll('[data-mark]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const extra=before?await before():{};if(extra===false){b.disabled=false;return;}await saveProgress(l,b.dataset.mark,extra);toast(MODES.find(x=>x[0]===b.dataset.mark)[1]+' complete.');go(`pb=lesson:${l.slug}&m=${b.dataset.next}`);}catch(e){b.disabled=false;toast(e.message||String(e),true);}});}
function modeWatch(box,l){
  const v=(l.watch||[]).filter(x=>safeUrl(x.url)),vids=v.filter(x=>mediaOf(x.url)),links=v.filter(x=>!mediaOf(x.url));
  box.innerHTML=`<span class="du-kicker">🎥 WATCH</span><h2>Watch first</h2>${vids.length?`<div class="pb-embeds">${vids.map(x=>embedHTML(x.url,x.label,x.note,x.style)).join('')}</div>`:''}<div class="pb-res">${links.map(x=>`<a href="${esc(x.url)}" target="_blank" rel="noopener"><b>${esc(x.label)} ↗</b><small>${x.kind==='search'?'YouTube search results (not a DrawUp endorsed video)':x.kind==='official'?'Official site':'Link'}</small></a>`).join('')}</div>${v.length?'':'<p class="pb-muted">HQ has not linked a video yet.</p>'}${PROJECT_LINKS[l.slug]?`<p><button type="button" class="du-btn ghost" data-project="${PROJECT_LINKS[l.slug]}">Open the project page in DrawUp</button></p>`:''}
  <p class="pb-muted">Found a better video? <button type="button" class="pb-inline" data-go="pb=board&ch=${l.channel_key}">Post it on the board</button> for other students.</p><div class="pb-actions">${nextBtn(l,'watch')}</div>`;
  nav(box);bindMark(box,l);bindEmbeds(box);box.querySelectorAll('[data-project]').forEach(b=>b.onclick=()=>{want=false;history.replaceState(null,'','#portal/arch-coach');P()?.openProject?.(b.dataset.project);});
}
function modeLearn(box,l){
  const parts=(l.learn||[]).map(t=>{const i=t.indexOf(': ');return i>0&&i<48?[t.slice(0,i),t.slice(i+2)]:['',t];});
  box.innerHTML=`<span class="du-kicker">📖 LEARN · ARCH COACH BREAKS IT DOWN</span><h2>${l.kind==='lesson'?'Every component, explained':'Know this before you answer'}</h2>
  ${l.scenario?`<div class="pb-scenario"><b>${l.kind==='simulation'?'You are the PM.':'The situation'}</b><p>${esc(l.scenario)}</p></div>`:''}
  <div class="pb-learn">${parts.map(([h,t],i)=>`<div class="pb-learnrow"><span>${i+1}</span><div>${h?`<b>${esc(h)}</b>`:''}<p>${esc(t)}</p></div></div>`).join('')}</div>
  ${(l.sources||[]).length?`<p class="pb-src">Sources: ${(l.sources||[]).filter(s=>safeUrl(s.url)).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a>`).join(' · ')}</p>`:''}
  <div class="pb-ask"><label>Ask Arch Coach about this lesson<textarea id="pb-askq" rows="2" placeholder="Example: Why does the flashing need end dams?"></textarea></label><button type="button" class="du-btn ghost" id="pb-askbtn">Ask Arch Coach</button><div id="pb-askout" class="pb-askout"></div></div>
  <div class="pb-actions">${nextBtn(l,'learn')}</div>`;
  bindMark(box,l);
  box.querySelector('#pb-askbtn').onclick=async()=>{const q=box.querySelector('#pb-askq').value.trim()||`Explain the key parts of "${l.title}" for a ${position()}.`;const out=box.querySelector('#pb-askout'),btn=box.querySelector('#pb-askbtn');btn.disabled=true;
    try{const c=cx(),token=await c.token();const msg=`DrawUp Playbook lesson "${l.title}" (${chName(l.channel_key)}). I am a ${position()}. ${q}`;let d;
      if(window.DrawUpV20?.coachAsk)d=await window.DrawUpV20.coachAsk({token,stage:out,label:'Arch Coach is explaining…',message:msg,history:[]});
      else{const r=await fetch('/api/arch-coach',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({message:msg,history:[]})});d=await r.json();if(!r.ok)throw new Error(d.error||'Arch Coach is unavailable.');}
      const a=document.createElement('article');a.className='pb-coachans';a.innerHTML=`<span>ARCH COACH</span><p>${esc(d.answer||'').replace(/\n/g,'<br>')}</p>`;out.appendChild(a);}
    catch(e){toast(e.message||String(e),true);}finally{btn.disabled=false;}};
}
const imgKey=l=>'pb_img_'+l.id;
function lsGet(k){try{return localStorage.getItem(k);}catch(_e){return null;}}
function lsSet(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v);}catch(_e){}}
function modePractice(box,l){
  const pr=S.progress.get(l.id),draw=l.practice_kind==='draw'||l.practice_kind==='upload',saved=lsGet(imgKey(l));
  box.innerHTML=`<span class="du-kicker">✏️ PRACTICE</span><h2>Your turn</h2><div class="pb-scenario"><b>Task</b><p>${esc(l.practice||'')}</p></div>
  ${l.kind==='simulation'&&(l.choices||[]).length?`<div class="pb-sim">${l.choices.map((c,i)=>`<div class="pb-q"><b>${i+1}. ${esc(c.q)}</b><div class="pb-opts">${(c.options||[]).map((o,j)=>`<button type="button" data-q="${i}" data-o="${j}">${esc(o.label)}</button>`).join('')}</div><p class="pb-result" data-res="${i}" hidden></p></div>`).join('')}</div>`:''}
  ${draw?`<div class="pb-draw"><div class="pb-drawbar"><button type="button" data-tool="pen" class="on">Pen</button><button type="button" data-tool="line">Line</button><button type="button" data-tool="erase">Eraser</button><button type="button" data-undo>Undo</button><button type="button" data-clear>Clear</button><label class="du-btn ghost">Upload image<input type="file" id="pb-upload" accept="image/png,image/jpeg,image/webp" hidden></label></div><canvas id="pb-canvas" width="1200" height="760" aria-label="Sketch area"></canvas><p class="pb-muted" id="pb-imgnote">${saved?'A drawing is saved for Verify. Draw or upload again to replace it.':'Sketch here or upload a photo or export of your drawing (PNG, JPG or WebP, under 8 MB).'}</p></div>`:''}
  <label class="pb-answer">${draw?'Notes for Arch Coach (optional): list the layers or items you included':'Your answer'}<textarea id="pb-ans" rows="${draw?3:8}" maxlength="4000">${esc(pr?.practice_note||'')}</textarea></label>
  <div class="pb-actions">${nextBtn(l,'practice')}</div>`;
  box.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{const c=l.choices[+b.dataset.q],o=c.options[+b.dataset.o];box.querySelectorAll(`[data-q="${b.dataset.q}"]`).forEach(x=>x.classList.toggle('on',x===b));const r=box.querySelector(`[data-res="${b.dataset.q}"]`);r.hidden=false;r.textContent='Arch Coach: '+o.result;});
  let pad=null;if(draw)pad=sketchPad(box);
  bindMark(box,l,async()=>{const note=box.querySelector('#pb-ans').value.trim();
    if(pad&&(pad.dirty()||pad.upload)){const c=cx(),blob=pad.upload||await pad.blob();const ext=(blob.type.split('/')[1]||'png').replace('jpeg','jpg');const path=`${c.user.id}/playbook/${l.id}-${Date.now()}.${ext}`;
      const {error}=await c.client.storage.from('drawup-private').upload(path,blob,{contentType:blob.type,upsert:true});if(error)throw error;lsSet(imgKey(l),path);}
    if(!note&&!lsGet(imgKey(l))){toast(draw?'Draw, upload or write something first.':'Write your answer first.',true);return false;}
    return {practice_note:note||null};});
}
function sketchPad(box){
  const cv=box.querySelector('#pb-canvas'),g=cv.getContext('2d');let tool='pen',strokes=[],cur=null,upload=null,uploadImg=null;
  const paint=()=>{g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);g.strokeStyle='#e8eef3';g.lineWidth=1;for(let x=0;x<cv.width;x+=40){g.beginPath();g.moveTo(x,0);g.lineTo(x,cv.height);g.stroke();}for(let y=0;y<cv.height;y+=40){g.beginPath();g.moveTo(0,y);g.lineTo(cv.width,y);g.stroke();}
    if(uploadImg){const s=Math.min(cv.width/uploadImg.width,cv.height/uploadImg.height);g.drawImage(uploadImg,0,0,uploadImg.width*s,uploadImg.height*s);}
    for(const s of [...strokes,cur].filter(Boolean)){g.strokeStyle=s.erase?'#fff':'#10202e';g.lineWidth=s.erase?22:3;g.lineCap='round';g.lineJoin='round';g.beginPath();s.pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));if(s.pts.length===1)g.lineTo(s.pts[0][0]+.1,s.pts[0][1]);g.stroke();}};
  const pt=e=>{const r=cv.getBoundingClientRect();return [(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height];};
  cv.addEventListener('pointerdown',e=>{e.preventDefault();cv.setPointerCapture(e.pointerId);cur={erase:tool==='erase',line:tool==='line',pts:[pt(e)]};paint();});
  cv.addEventListener('pointermove',e=>{if(!cur)return;const p=pt(e);if(cur.line)cur.pts=[cur.pts[0],p];else cur.pts.push(p);paint();});
  const end=()=>{if(cur){strokes.push(cur);cur=null;upload=null;paint();}};cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
  box.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{tool=b.dataset.tool;box.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('on',x===b));});
  box.querySelector('[data-undo]').onclick=()=>{strokes.pop();paint();};
  box.querySelector('[data-clear]').onclick=()=>{strokes=[];uploadImg=null;upload=null;paint();};
  box.querySelector('#pb-upload').onchange=e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>8*1024*1024){toast('Choose an image under 8 MB.',true);return;}const im=new Image();im.onload=()=>{uploadImg=im;strokes=[];paint();upload=f;box.querySelector('#pb-imgnote').textContent=f.name+' will be saved for Verify. Draw on it to mark it up.';};im.src=URL.createObjectURL(f);};
  paint();
  return {dirty:()=>strokes.length>0,get upload(){return upload;},blob:()=>new Promise(r=>cv.toBlob(r,'image/png'))};
}
function modeField(box,l){
  const links=(l.field_links||[]).filter(x=>safeUrl(x.url));
  box.innerHTML=`<span class="du-kicker">🏗️ FIELD · DRAWING → DETAIL → INSTALLATION → FINISHED BUILDING</span><h2>See it built</h2><ul class="pb-field">${(l.field||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ul>
  <div class="pb-res">${links.map(x=>`<a href="${esc(x.url)}" target="_blank" rel="noopener"><b>${esc(x.label)} ↗</b><small>${x.kind==='search'?'YouTube search results':'Official site'}</small></a>`).join('')}</div>
  <p class="pb-muted">Have jobsite photos of this assembly? Share them on the <button type="button" class="pb-inline" data-go="pb=board&ch=${l.channel_key}">board</button> (only with permission from the site).</p><div class="pb-actions">${nextBtn(l,'field')}</div>`;
  nav(box);bindMark(box,l);
}
function gradeHTML(a){return `<div class="pb-grade ${a.passed?'pass':'fail'}">${ring(a.score,a.score)}<div><h3>${a.passed?'Verified ✓':'Not yet'}: ${a.score}/100</h3><p>${esc(a.feedback||'').replace(/\n/g,'<br>')}</p></div></div>
  <div class="pb-grid2"><div><b class="pb-ok">Found</b><ul class="pb-list ok">${(a.found||[]).map(x=>`<li>${esc(x)}</li>`).join('')||'<li>Nothing yet</li>'}</ul></div><div><b class="pb-miss">Missing</b><ul class="pb-list miss">${(a.missing||[]).map(x=>`<li>${esc(x)}</li>`).join('')||'<li>Nothing missing</li>'}</ul></div></div>`;}
function modeVerify(box,l){
  const pr=S.progress.get(l.id),need=(l.modes||[]).filter(m=>!(pr?.modes||[]).includes(m)),b=best(l.id),img=lsGet(imgKey(l));
  box.innerHTML=`<span class="du-kicker">🤖 VERIFY · ARCH COACH CHECKS YOUR WORK</span><h2>Get graded</h2>
  <p>Arch Coach grades your Practice ${img?'drawing':''}${img&&pr?.practice_note?' and notes':pr?.practice_note?'answer':''} against ${(l.rubric||[]).length} rubric items. Pass mark: 70. Costs ${img?8:3} credits (refunded if grading fails).</p>
  ${!(pr?.practice_note||img)?`<p class="pb-warn">Do Practice first so there is something to grade. <button type="button" class="pb-inline" data-go="pb=lesson:${esc(l.slug)}&m=practice">Go to Practice</button></p>`:''}
  <details class="pb-rubric"><summary>See the rubric</summary><ul>${(l.rubric||[]).map(r=>`<li>${esc(r)}</li>`).join('')}</ul></details>
  <div class="pb-actions"><button type="button" class="du-btn primary" id="pb-verify" ${!(pr?.practice_note||img)?'disabled':''}>Have Arch Coach verify</button>${b?.passed?`<button type="button" class="du-btn ghost" data-go="pb=lesson:${esc(l.slug)}&m=complete">Next: Complete →</button>`:''}</div>
  <div id="pb-vstatus" class="pb-status" aria-live="polite"></div><div id="pb-vresult">${b?`<p class="pb-muted">Best grade so far:</p>${gradeHTML(b)}`:''}</div>
  ${need.length?`<p class="pb-muted">To claim the badge you also need: ${need.map(m=>MODES.find(x=>x[0]===m)[1]).join(', ')}.</p>`:''}`;
  nav(box);
  box.querySelector('#pb-verify').onclick=async()=>{const btn=box.querySelector('#pb-verify'),st=box.querySelector('#pb-vstatus');btn.disabled=true;
    const steps=['Sending your work to Arch Coach…','Reading your submission…','Checking each rubric item…','Writing feedback…'];let i=0;st.textContent=steps[0];const tick=setInterval(()=>{i=Math.min(steps.length-1,i+1);st.textContent=steps[i];},2500);
    try{const c=cx(),token=await c.token(),h={'Content-Type':'application/json',Authorization:'Bearer '+token};
      const r=await fetch('/api/playbook',{method:'POST',headers:h,body:JSON.stringify({lesson_id:l.id,answer:pr?.practice_note||'',image_path:img||null})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Verify could not start.');
      const t0=Date.now();let res=null;
      while(Date.now()-t0<180000){await sleep(1500);const g=await fetch('/api/playbook?ticket='+encodeURIComponent(d.ticket),{headers:h,cache:'no-store'});const p=await g.json().catch(()=>({}));if(!g.ok)throw new Error(p.error||'Grading failed.');if(p.status==='completed'){res=p.attempt;break;}}
      if(!res)throw new Error('Grading took too long. Try again.');
      const e=S.attempts.get(l.id)||{list:[],best:null};e.list.unshift(res);if(!e.best||res.score>e.best.score)e.best=res;S.attempts.set(l.id,e);
      saveProgress(l,'verify').catch(()=>{});
      st.textContent='';box.querySelector('#pb-vresult').innerHTML=gradeHTML(res)+(res.passed?`<div class="pb-actions"><button class="du-btn primary" data-go="pb=lesson:${esc(l.slug)}&m=complete">Next: Complete →</button></div>`:'<p class="pb-muted">Fix the missing items in Practice and verify again.</p>');nav(box);
      toast(res.passed?'Verified! Claim your badge in Complete.':'Not passed yet. See what is missing.',!res.passed);}
    catch(e){st.textContent='';toast(e.message||String(e),true);}finally{clearInterval(tick);btn.disabled=false;}};
}
function modeComplete(box,l){
  const d=doneModes(l),aw=earned(l.id),req=[...(l.modes||[]),'verify'];
  box.innerHTML=`<span class="du-kicker">🏆 COMPLETE</span><h2>${aw?'Badge earned':'Claim your badge'}</h2>
  ${aw?`<div class="pb-won"><span>🏆</span><div><h3>${esc(aw.badge_name)}</h3><p>+${aw.xp} XP added to your Arch Coach${aw.score?` · Verify score ${aw.score}`:''} · ${esc(new Date(aw.created_at).toLocaleDateString())}</p><p class="pb-muted">This badge shows on your DrawUp profile.</p></div></div>`
   :`<ul class="pb-req">${req.map(m=>`<li class="${d.has(m)?'ok':''}">${d.has(m)?'✓':'○'} ${MODES.find(x=>x[0]===m)[1]}${m==='verify'?' (pass mark 70)':''}</li>`).join('')}</ul>
   <div class="pb-actions"><button type="button" class="du-btn primary" id="pb-claim" ${req.every(m=>d.has(m))?'':'disabled'}>Complete lesson · earn ${esc(l.badge_name||l.title)}</button></div>`}
  <div class="pb-actions"><button type="button" class="du-btn ghost" data-go="pb=ch:${l.channel_key}">More in ${esc(chName(l.channel_key))}</button><button type="button" class="du-btn ghost" data-go="learn">Learning dashboard</button></div>`;
  nav(box);
  box.querySelector('#pb-claim')?.addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;
    const {data,error}=await cx().client.rpc('playbook_complete',{p_lesson:l.id});
    if(error||!data?.ok){b.disabled=false;toast(error?.message||(data?.missing_modes?.length?'Still to do: '+data.missing_modes.join(', '):'Pass Verify first.'),true);return;}
    toast(data.new_badge?`Badge earned: ${data.badge}${data.xp?' · +'+data.xp+' XP':''}`:'Badge already earned.');S.loaded=false;await load(true);window.DrawUpCoach?.reload?.();render();});
}

/* =================================================================== HQ Studio (DrawUp HQ only; RLS enforces it) */
function viewStudio(root,head){
  const lines=v=>String(v||'').split('\n').map(x=>x.trim()).filter(Boolean);
  root.innerHTML=`${head}${hubTabs('pb=studio')}
  <div class="pb-board"><form class="pb-card pb-post" id="pb-studio"><span class="du-kicker">HQ STUDIO · OFFICIAL LESSON</span>
   <label>Title<input name="title" required maxlength="140"></label>
   <div class="pb-two"><label>Path<select name="path">${PATHS.map(p=>`<option value="${p.key}">${esc(p.name)}</option>`).join('')}</select></label><label>Play<select name="ch">${Object.keys(CH).map(k=>`<option value="${k}">${esc(chName(k))}</option>`).join('')}</select></label></div>
   <div class="pb-two"><label>Type<select name="kind"><option value="lesson">Lesson</option><option value="challenge">Arch Coach Challenge</option><option value="simulation">PM Simulation</option></select></label><label>Practice<select name="pk"><option value="draw">Draw or upload</option><option value="answer">Written answer</option><option value="decision">Decision plan</option></select></label></div>
   <label>Summary<textarea name="summary" rows="2" maxlength="600"></textarea></label>
   <label>Watch links (one per line: label | https://…)<textarea name="watch" rows="2"></textarea></label>
   <label>Learn (one point per line, "Heading: text")<textarea name="learn" rows="4"></textarea></label>
   <label>Scenario (challenges and simulations)<textarea name="scenario" rows="2"></textarea></label>
   <label>Practice task<textarea name="practice" rows="2" required></textarea></label>
   <label>Field notes (one per line)<textarea name="field" rows="2"></textarea></label>
   <label>Verify rubric (one item per line)<textarea name="rubric" rows="4" required></textarea></label>
   <div class="pb-two"><label>Badge name<input name="badge" maxlength="80"></label><label>Status<select name="status"><option value="draft">Draft</option><option value="published">Published</option></select></label></div>
   <button class="du-btn primary">Save lesson</button><p class="pb-muted">Only DrawUp HQ accounts can save or publish. Cite codes by name and edition, and link only to real pages or YouTube searches.</p></form>
   <section class="pb-card"><span class="du-kicker">ALL LESSONS</span>${S.lessons.map(l=>`<div class="pb-srow"><div><b>${esc(l.title)}</b><small>${esc(chName(l.channel_key))} · ${l.kind} · ${l.status}</small></div><button type="button" class="du-btn ghost" data-toggle="${l.id}" data-st="${l.status==='published'?'draft':'published'}">${l.status==='published'?'Unpublish':'Publish'}</button></div>`).join('')}</section></div>`;
  nav(root);bindPosition(root);
  const f=root.querySelector('#pb-studio');
  f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f),g=k=>String(fd.get(k)||'').trim(),kind=g('kind'),title=g('title');
    const slug=(title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'lesson')+'-'+Date.now().toString(36).slice(-4);
    const watch=lines(g('watch')).map(x=>{const [a,b]=x.split('|').map(s=>s.trim());return {label:a,url:b,kind:/youtube\.com\/results/.test(b||'')?'search':mediaOf(b)?'video':'link'};}).filter(x=>safeUrl(x.url));
    const field=lines(g('field'));const modes=kind==='lesson'?['watch','learn','practice',...(field.length?['field']:[])].filter(m=>m!=='watch'||watch.length):['learn','practice'];
    const row={slug,title,path_key:g('path'),channel_key:g('ch'),kind,practice_kind:g('pk'),summary:g('summary')||null,watch,learn:lines(g('learn')),scenario:g('scenario')||null,practice:g('practice'),field,rubric:lines(g('rubric')),badge_name:g('badge')||title,status:g('status'),modes,official:true,created_by:cx().user.id};
    const {error}=await cx().client.from('playbook_lessons').insert(row);if(error){toast(error.message,true);return;}toast('Lesson saved.');S.loaded=false;go('pb=studio');};
  root.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{const {error}=await cx().client.from('playbook_lessons').update({status:b.dataset.st,updated_at:new Date().toISOString()}).eq('id',b.dataset.toggle);if(error){toast(error.message,true);return;}S.loaded=false;go('pb=studio');});
}

/* =================================================================== Profile accomplishments */
function accomplishments(awards,own){
  const card=document.createElement('section');card.className='pb-pcard';
  card.innerHTML=`<span class="du-kicker">📖 DRAWUP PLAYBOOK · ${awards.length} BADGE${awards.length===1?'':'S'}</span>${awards.length?`<div class="pb-badges">${awards.map(a=>`<span class="pb-badge">🏆 ${esc(a.badge_name)}<small>${esc(pathOf(a.path_key)?.name||'')}</small></span>`).join('')}</div>`:`<p class="pb-muted">${own?'No Playbook badges yet. Finish a lesson to show it here.':'No Playbook badges yet.'}</p>`}${own?'<button type="button" class="du-btn ghost" data-go="pb">Open Playbook</button>':''}`;
  card.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{P()?.openPortalTab?.('arch-coach');setTimeout(()=>go(b.dataset.go),50);});
  return card;
}
let profBusy=false;
async function injectProfile(w){
  const cover=w.querySelector('.du-profile-cover');if(!cover||w.querySelector('.pb-pcard')||profBusy)return;
  profBusy=true;try{await load(true);if(!w.querySelector('.pb-pcard')&&w.contains(cover))(w.querySelector('.ac-pcard')||cover).insertAdjacentElement('afterend',accomplishments(S.awards,true));}catch(_e){}finally{profBusy=false;}
}
async function injectPerson(){
  const sheet=$('#du-v19-person .du-v19-sheet');if(!sheet||sheet.dataset.pb||!sheet.querySelector('.du-v19-phead'))return;sheet.dataset.pb='1';
  const handle=(sheet.querySelector('.du-v19-phead p')?.textContent||'').match(/@([A-Za-z0-9_.-]+)/)?.[1];const cl=window.drawupSupabaseClient;if(!handle||!cl)return;
  const {data:p}=await cl.from('profiles').select('id').ilike('username',handle).maybeSingle();if(!p)return;
  const {data}=await cl.from('playbook_awards').select('badge_name,path_key,created_at').eq('user_id',p.id).order('created_at',{ascending:false}).limit(30);
  if((data||[]).length)sheet.querySelector('.du-v19-phead').insertAdjacentElement('afterend',accomplishments(data,false));
}

/* =================================================================== hooks */
/* After an Arch Coach answer, suggest the matching Playbook lesson (by the question asked). */
const SUGGEST=[['wall-section-play',/wall section|brick veneer|flashing|weep|parapet|air barrier|cavity wall/i],['accessible-restroom-sketch',/restroom|toilet room|grab bar|accessible bath|ada bath/i],
 ['hospital-corridor-challenge',/hospital corridor|bed movement|\bi-2\b|corridor width/i],['occupancy-classification',/occupancy|use group/i],['load-path-play',/load path|lateral|shear wall|braced frame|diaphragm|gravity load/i],
 ['ceiling-coordination-challenge',/ceiling height|plenum|clash|duct.{0,30}beam|mep coordination/i],['how-buildings-get-built',/construction sequence|rough[- ]in|dry[- ]in|how (are|is) .{0,30}built/i],['write-an-rfi',/\brfi\b|request for information/i],
 ['pm-sim-dd-crunch',/over budget|fee burn|consultant.{0,20}late|client moved/i],['project-phases-play',/schematic design|design development|project phases|construction documents phase/i],['licensure-roadmap',/licens|\baxp\b|ncarb|\bare\b (exam|division)/i],['the-line-neom-case-study',/the line|neom|linear city/i]];
async function suggest(w){
  const box=w.querySelector('#dc-messages');if(!box)return;const arts=[...box.querySelectorAll('article')];const last=arts[arts.length-1];
  if(!last||last.classList.contains('user')||last.dataset.pbSug)return;last.dataset.pbSug='1';
  const q=[...arts].reverse().find(a=>a.classList.contains('user'))?.textContent||'';const hit=SUGGEST.find(([,re])=>re.test(q));if(!hit)return;
  try{await load();}catch(_e){return;}const l=pub().find(x=>x.slug===hit[0]);if(!l||!last.isConnected)return;
  const b=document.createElement('button');b.type='button';b.className='pb-suggest';b.innerHTML=`📖 Practice this in DrawUp Playbook: <b>${esc(l.title)}</b> →`;b.onclick=()=>go('pb=lesson:'+l.slug);last.appendChild(b);
}
function injectCoach(w){
  suggest(w).catch(()=>{});
  const head=w.querySelector('.du-coach-main .du-work-head');
  if(head&&!head.querySelector('.pb-learn-btn')){const b=document.createElement('button');b.type='button';b.className='du-btn ghost pb-learn-btn';b.title='Learning dashboard and DrawUp Playbook';b.innerHTML='📈 Learning <span>· Playbook</span>';b.onclick=()=>go('learn');head.appendChild(b);}
}
let q=false;
function tick(){q=false;const w=$('#du-workspace-content');if(!w)return;
  if(isOurs()){
    if(w.querySelector('.du-loading')&&!w.querySelector('.pb-root')){if(!bootWant){want=false;coachOpened=true;}return;}
    if(w.querySelector('.du-coach-shell')){if(coachOpened&&!bootWant){coachOpened=false;history.replaceState(null,'','#portal/arch-coach');injectCoach(w);}else{bootWant=false;want=true;render();}}
    return;}
  want=false;bootWant=false;delete w.dataset.pb;injectCoach(w);injectProfile(w);}
function queue(){if(!q){q=true;requestAnimationFrame(tick);}}
async function boot(){
  if(isOurs())bootWant=true;
  for(let i=0;i<200&&!P()?.registerTab;i++)await sleep(100);
  const mo=new MutationObserver(queue);
  const attach=()=>{const w=$('#du-workspace-content');if(w&&!w.dataset.pbObs){w.dataset.pbObs='1';mo.observe(w,{childList:true,subtree:true});queue();}};
  setInterval(attach,1000);attach();
  new MutationObserver(()=>{if($('#du-v19-person .du-v19-phead'))injectPerson().catch(()=>{});}).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>{if(isOurs()){want=true;coachOpened=false;}if(isOurs()&&P()?.isSignedIn?.())setTimeout(()=>{const w=$('#du-workspace-content');if(w&&(w.querySelector('.du-coach-shell,.pb-root')))render();},0);});
  // Clicking Arch Coach while the Playbook is open returns to the coach chat.
  document.addEventListener('click',e=>{if(e.target.closest('[data-portal-tab="arch-coach"]')&&isOurs())history.replaceState(null,'','#portal/arch-coach');},true);
}
window.DrawUpPlaybook={open:(q='pb')=>{if(/^#portal\/arch-coach/.test(location.hash)&&$('#du-workspace-content .du-coach-shell,#du-workspace-content .pb-root'))return go(q);P()?.openPortalTab?.('arch-coach');setTimeout(()=>go(q),60);},reload:()=>load(true),state:()=>S,PATHS,CH,POSITIONS};
boot();
})();
