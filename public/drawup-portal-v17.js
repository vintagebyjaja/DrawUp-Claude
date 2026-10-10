/* DrawUp Portal V17
 *
 * One file, one scope. Replaces v1311-portal.js, whose later "patch" layers ran
 * outside the scope they patched and crashed on load (openPortalTab is not
 * defined / du-exit-portal is null), which is why session restore, sign out,
 * Portal search, native Arch Coach and the starter project never ran.
 *
 * Every screen here reads from and writes to Supabase directly with the signed-in
 * member's session (RLS decides what they can touch). Nothing is shown as saved
 * until the database says it was saved.
 */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const TAB_KEY='drawup_portal_tab_v17';
const TABS=['dashboard','search','profile','projects','draw','arch-coach','check','swap','details','discover','connect','firm','team','account','hq'];
/* V18: Draw, Check, Swap and HQ live in drawup-tools-v18.js and register here. */
const EXT={};
const STARTER_KEY='athletic-storage-v1';
const TAB_LABELS=['Dashboard','Search','Profile','Projects','Draw','Arch Coach','Check','Swap','Details','Discover','Connect','Firm','Team','Account','HQ'];
let client=null,currentUser=null,currentProfile=null,step=0,pendingAvatar=null,pendingAvatarFile=null,authRun=null,authUserId=null,portalReady=false;
const interests=new Set(),disciplines=new Set();

function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function initials(n){return (String(n||'DU').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('')||'DU').toUpperCase();}
function toast(msg,bad){let t=$('du-toast');if(!t){t=document.createElement('div');t.id='du-toast';t.className='du-toast';document.body.appendChild(t);}t.textContent=msg;t.dataset.state=bad?'bad':'good';t.classList.add('open');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('open'),bad?6000:2600);}
function fmtDate(d){if(!d)return'';const x=new Date(d+(String(d).length===10?'T00:00:00':''));return isNaN(x)?String(d):x.toLocaleDateString(undefined,{month:'short',year:'numeric'});}

/* ------------------------------------------------------------------ markup */
function mount(){
  if($('du-portal'))return;
  document.body.insertAdjacentHTML('beforeend',`<div id="du-onboarding"><div class="du-onboard-shell"><div class="du-onboard-logo">DrawUp</div><div class="du-progress"><i id="du-progress-bar" style="width:20%"></i></div>
<section class="du-step active"><span class="du-kicker">WELCOME TO DRAWUP</span><h1>Let's draw up your profile.</h1><p>This helps DrawUp personalize your workspace and connect you across DrawUp. You can skip anything and finish it later.</p><div class="du-photo-row"><div class="du-photo-preview" id="du-photo-preview">DU</div><div class="du-photo-upload"><input id="du-photo-input" type="file" accept="image/jpeg,image/png,image/webp"><label for="du-photo-input">Upload profile photo</label><small>JPG, PNG or WebP. DrawUp crops it square.</small></div></div><div class="du-field du-account-email"><label>Signed in as</label><input id="du-account-email" type="email" readonly aria-readonly="true"><small>Your email is private and identifies the DrawUp account you are signed into. Your username is your public DrawUp identity.</small></div><div class="du-two"><div class="du-field"><label>Display name</label><input id="du-name" autocomplete="name"></div><div class="du-field"><label>Username</label><input id="du-username" autocomplete="username" placeholder="yourname"><small id="du-username-status" class="du-username-status">Your username is unique across DrawUp.</small></div></div><div class="du-two"><div class="du-field"><label>Pronouns <span class="du-note">optional</span></label><input id="du-pronouns"></div><div class="du-field"><label>Location <span class="du-note">optional</span></label><input id="du-location" placeholder="City, State / Country"></div></div></section>
<section class="du-step"><span class="du-kicker">YOUR LANE</span><h1>What do you do?</h1><p>Choose everything that fits. This can change as your career changes.</p><div class="du-chips" data-set="disciplines">${['Architecture','Interior Design','Engineering','Construction','Planning','Landscape','Student','Educator','Developer / Owner','Other'].map(x=>`<button class="du-chip" type="button" data-value="${x}">${x}</button>`).join('')}</div><div class="du-field"><label>Title / role <span class="du-note">optional</span></label><input id="du-title" placeholder="Designer, Project Architect, Student…"></div></section>
<section class="du-step"><span class="du-kicker">CURRENT AFFILIATION</span><h1>Where are you connected now?</h1><p>Your current firm does not replace your education or previous work history. This only controls your primary affiliation and coworker view.</p><div class="du-field"><label>Primary affiliation <span class="du-note">optional</span></label><select id="du-aff-type"><option value="">Choose one</option><option value="firm">Firm / company</option><option value="university">University / school</option><option value="organization">Organization</option></select></div><div class="du-field"><label>Name <span class="du-note">optional</span></label><input id="du-aff-name" list="du-firm-options" autocomplete="off" placeholder="Start typing your firm, school or organization…"><datalist id="du-firm-options"></datalist></div><div class="du-field" id="du-home-office-field"><label>Home office <span class="du-note">the office you work out of</span></label><input id="du-home-office" list="du-office-options" autocomplete="off" placeholder="City, ST (e.g. Richmond, VA)"><datalist id="du-office-options"></datalist><small class="du-note" id="du-home-office-hint">Pick your firm above to see its offices. If yours is not listed, type it and DrawUp adds it to the firm's profile.</small></div></section>
<section class="du-step"><span class="du-kicker">EDUCATION + TRADE</span><h1>Add your school or trade history.</h1><p>This belongs to your personal profile even when you currently work at a firm. Add one now and add more later from Profile.</p><div class="du-two"><div class="du-field"><label>School / program <span class="du-note">optional</span></label><input id="du-edu-name" placeholder="University, community college, trade school…"></div><div class="du-field"><label>Type</label><select id="du-edu-type"><option value="university">University / college</option><option value="community_college">Community college</option><option value="trade">Trade / technical school</option><option value="apprenticeship">Apprenticeship</option><option value="other">Other</option></select></div></div><div class="du-two"><div class="du-field"><label>Program / major <span class="du-note">optional</span></label><input id="du-edu-program" placeholder="Architecture, Electrical, Construction…"></div><div class="du-field"><label>Degree / certificate <span class="du-note">optional</span></label><input id="du-edu-degree" placeholder="B.Arch, certificate, apprenticeship…"></div></div><div class="du-two"><div class="du-field"><label>Start year <span class="du-note">optional</span></label><input id="du-edu-start" type="number" min="1900" max="2100"></div><div class="du-field"><label>Graduation / expected year <span class="du-note">optional</span></label><input id="du-edu-grad" type="number" min="1900" max="2100"></div></div></section>
<section class="du-step"><span class="du-kicker">WORK HISTORY</span><h1>Add previous experience.</h1><p>Your current firm and previous firms stay separate. Add one role now or skip and build your full career timeline later.</p><div class="du-two"><div class="du-field"><label>Employer / organization <span class="du-note">optional</span></label><input id="du-work-org" placeholder="Previous firm or employer"></div><div class="du-field"><label>Role <span class="du-note">optional</span></label><input id="du-work-role" placeholder="Designer, intern, project manager…"></div></div><div class="du-two"><div class="du-field"><label>Location <span class="du-note">optional</span></label><input id="du-work-location" placeholder="City, State"></div><div class="du-field"><label>Dates <span class="du-note">optional</span></label><div class="du-two"><input id="du-work-start" type="date"><input id="du-work-end" type="date"></div></div></div></section>
<section class="du-step"><span class="du-kicker">PERSONALIZE DRAWUP</span><h1>What are you here to do?</h1><p>Pick a few. We'll use this to shape your portal—not to limit what you can access.</p><div class="du-chips" data-set="interests">${['Ask Arch Coach','Search projects','Discover firms','Check drawings','Codes + ADA','Details','Learn','Network','Visualize'].map(x=>`<button class="du-chip" type="button" data-value="${x}">${x}</button>`).join('')}</div></section>
<section class="du-step du-ready-step"><div class="du-first-portal"><div class="du-first-grid"></div><div class="du-first-orbit"></div><span class="du-kicker">PROFILE DRAWN UP</span><h1>Your DrawUp is taking shape.</h1><p id="du-ready-intro">Connecting your profile across DrawUp.</p><div class="du-ready-cards"><article><small>YOUR CONNECTION</small><b id="du-ready-aff">DrawUp Community</b><span id="du-ready-aff-sub">Projects · people · resources</span></article><article><small>YOUR PLACE</small><b id="du-ready-place">DrawUp Network</b><span>Firms · projects · AEC community</span></article><article><small>YOUR SCHOOL / TRADE</small><b id="du-ready-school">Your profile</b><span>Education · alumni · organizations</span></article></div><div class="du-ready-status" id="du-onboard-status">READY TO ENTER</div></div></section>
<div class="du-actions"><button class="du-btn ghost" id="du-skip" type="button">Skip for now</button><button class="du-btn primary" id="du-next" type="button">Continue →</button></div></div></div>
<div id="du-login-tunnel"><div class="du-tunnel-grid"></div><div class="du-tunnel-rings"></div><button class="du-skip" id="du-tunnel-skip">Skip →</button><div class="du-tunnel-copy"><div class="du-mark">DU</div><div class="du-tunnel-status" id="du-tunnel-status">IDENTIFYING PLAYER</div><h1 id="du-tunnel-name">Welcome back.</h1><p>Drawing up your workspace…</p></div></div>
<div id="du-portal"><header class="du-portal-top"><button type="button" class="du-portal-brand du-brand-button" data-du-action="public-home">DrawUp <span class="du-kicker">PORTAL</span></button><nav class="du-portal-tabs" id="du-portal-tabs">${TAB_LABELS.map((x,i)=>`<button type="button" data-portal-tab="${x.toLowerCase().replace(/ /g,'-')}" class="${i===0?'active':''}"${x==='HQ'?' hidden data-du-hq':''}>${x}</button>`).join('')}</nav><div class="du-top-user"><span class="du-portal-status" id="du-plan-status"></span><button class="du-avatar" id="du-avatar">DU</button></div><div class="du-profile-panel" id="du-profile-panel"><div style="padding:8px 10px 12px"><b id="du-menu-name">DrawUp Member</b><div class="du-portal-status" id="du-menu-user"></div></div><button data-portal-tab="profile">View / Edit Profile</button><button data-portal-tab="account">Account & Billing</button><button data-du-action="signout">Sign out</button></div></header><main class="du-portal-shell"><aside class="du-side"><div class="du-side-profile"><button class="du-avatar du-avatar-lg" id="du-side-avatar">DU</button><b id="du-side-name">DrawUp Member</b><span id="du-side-role">Member</span></div>${TAB_LABELS.map((x,i)=>`<button type="button" data-portal-tab="${x.toLowerCase().replace(/ /g,'-')}" class="${i===0?'active':''}"${x==='HQ'?' hidden data-du-hq':''}><span>${['⌂','⌕','◎','▱','⌖','✦','✓','⇄','⌗','◈','∞','◇','◉','⚙','★'][i]}</span>${x}</button>`).join('')}<div class="du-side-foot">DrawUp Season 1<br><small>Draw it up. See it through.</small></div></aside><section class="du-workspace"><div id="du-workspace-content"></div></section></main></div></div>`);
  bindStatic();
}

/* ------------------------------------------------------------------ data */
async function waitClient(){for(let i=0;i<100;i++){if(window.drawupSupabaseClient)return window.drawupSupabaseClient;await new Promise(r=>setTimeout(r,100));}return null;}
async function loadProfile(user){
  // Retries instead of timing out to "no profile": a slow network must never look like a brand-new member.
  let lastErr=null;
  for(let i=0;i<3;i++){
    const {data,error}=await client.from('profiles').select('*').eq('id',user.id).maybeSingle();
    if(!error){
      if(data)return data;
      // Auth user without a profile row (created before the signup trigger existed): create it, never overwrite.
      const ins=await client.from('profiles').upsert({id:user.id,display_name:user.user_metadata?.display_name||user.email?.split('@')[0]||'DrawUp Member'},{onConflict:'id',ignoreDuplicates:true});
      if(ins.error){lastErr=ins.error;}
      continue;
    }
    lastErr=error;await new Promise(r=>setTimeout(r,400*(i+1)));
  }
  throw lastErr||new Error('Profile could not be loaded.');
}
async function saveProfile(fields){
  if(!client||!currentUser)throw new Error('Not signed in.');
  const {data,error}=await client.from('profiles').update(fields).eq('id',currentUser.id).select('*').maybeSingle();
  if(error)throw error;
  if(!data)throw new Error('Profile row not found for this account.');
  currentProfile=data;syncPortalIdentity();return data;
}
async function profileHistory(){
  const [e,c]=await Promise.all([
    client.from('profile_education').select('*').eq('user_id',currentUser.id).order('graduation_year',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}),
    client.from('career_timeline').select('*').eq('user_id',currentUser.id).order('start_date',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false})
  ]);
  if(e.error)throw e.error; if(c.error)throw c.error;
  return {edu:e.data||[],career:c.data||[]};
}
function yearsExperience(career){const now=new Date();let m=0;(career||[]).forEach(r=>{if(!r.start_date)return;const s=new Date(r.start_date),e=r.end_date?new Date(r.end_date):now;if(e>s)m+=(e.getFullYear()-s.getFullYear())*12+(e.getMonth()-s.getMonth());});return m/12;}

/* ------------------------------------------------------------------ auth */
function profileEstablished(p){return !!(p&&(p.onboarding_completed_at||(p.username&&p.username.trim())||(p.primary_affiliation_name&&p.primary_affiliation_name.trim())));}
async function afterAuth(user,{fromSignIn=false}={}){
  if(!user||user.is_anonymous)return;
  if(authRun&&authUserId===user.id)return authRun;           // modal handler + SIGNED_IN event both land here
  authUserId=user.id;
  authRun=(async()=>{
    currentUser=user;decorateSignedIn();
    try{currentProfile=await loadProfile(user);}
    catch(e){
      console.warn('DrawUp profile load failed:',e);currentProfile=null;
      openPortal();toast('Signed in, but your profile could not be loaded yet ('+(e.message||e)+'). Refresh to try again — nothing was changed.',true);return;
    }
    if(!profileEstablished(currentProfile)){openOnboarding(false);return;}
    if(fromSignIn)tunnel();else openPortal();
  })();
  try{await authRun;}finally{/* keep authRun so repeated events for the same user are no-ops */}
}
async function signOut(){
  try{if(client)await client.auth.signOut();}catch(e){console.warn('Sign out:',e);}
  try{localStorage.removeItem(TAB_KEY);}catch(_e){}
  currentUser=null;currentProfile=null;authRun=null;authUserId=null;
  document.documentElement.classList.remove('du-authenticated');
  closePortal();
  history.replaceState(null,'',location.pathname+'#home');
  location.reload();
}
function decorateSignedIn(){
  document.documentElement.classList.add('du-authenticated');
  document.querySelectorAll('.join-preseason').forEach(x=>{x.style.display='none';x.setAttribute('aria-hidden','true');});
  const sign=$('drawup-signin');if(sign){sign.textContent='Portal';sign.onclick=e=>{e.preventDefault();e.stopImmediatePropagation();openPortal();};}
  const nav=document.querySelector('.mobile-bottom-nav');
  if(nav&&!nav.querySelector('[data-du-profile]')){const a=document.createElement('a');a.href='#portal';a.dataset.duProfile='1';a.innerHTML='<span class="m-icon">●</span><span>Portal</span>';a.onclick=e=>{e.preventDefault();openPortal();};nav.appendChild(a);}
}

/* ------------------------------------------------------------------ onboarding */
function normalizeUsername(v){return (v||'').trim().replace(/^@+/,'').toLowerCase().replace(/[^a-z0-9._]/g,'').slice(0,30);}
let usernameTimer=null;
async function checkUsername(show=true){
  const input=$('du-username'),status=$('du-username-status');if(!input||!client||!currentUser)return true;
  const u=normalizeUsername(input.value);input.value=u;
  const say=(t,s)=>{if(status&&show){status.textContent=t;status.dataset.state=s;}};
  if(!u){say('Choose a unique DrawUp username.','idle');return true;}
  if(u===normalizeUsername(currentProfile?.username)){say('✓ @'+u+' is already yours.','good');return true;}
  if(u.length<3){say('Username must be at least 3 characters.','bad');return false;}
  const {data,error}=await client.from('profiles').select('id').ilike('username',u).neq('id',currentUser.id).limit(1);
  if(error){say('Could not verify username yet. Try again.','bad');return false;}
  const ok=!(data&&data.length);say(ok?'✓ @'+u+' is available.':'@'+u+' is already taken.',ok?'good':'bad');return ok;
}
function showStep(n){const steps=document.querySelectorAll('.du-step');step=Math.max(0,Math.min(steps.length-1,n));steps.forEach((x,i)=>x.classList.toggle('active',i===step));$('du-progress-bar').style.width=(((step+1)/steps.length)*100)+'%';$('du-next').textContent=step===steps.length-1?'Enter DrawUp →':'Continue →';$('du-skip').style.visibility=step===steps.length-1?'hidden':'visible';if(step===steps.length-1)readyPreview();}
function setOnboardStatus(t){const s=$('du-onboard-status');if(s)s.textContent=t;}
async function uploadAvatar(){
  if(!pendingAvatarFile)return pendingAvatar||currentProfile?.avatar_url||null;
  const path=`${currentUser.id}/avatar-${Date.now()}.jpg`;
  const up=await client.storage.from('drawup-files').upload(path,pendingAvatarFile,{upsert:true,contentType:'image/jpeg'});
  if(up.error){console.warn('Avatar storage upload failed, keeping inline copy:',up.error.message);return pendingAvatar;}
  pendingAvatarFile=null;
  pendingAvatar=client.storage.from('drawup-files').getPublicUrl(path).data.publicUrl;return pendingAvatar;
}
function stepFields(n){
  if(n===0)return{display_name:$('du-name').value.trim()||currentProfile?.display_name||currentUser.email?.split('@')[0],username:normalizeUsername($('du-username').value)||null,pronouns:$('du-pronouns').value.trim()||null,current_location:$('du-location').value.trim()||null};
  if(n===1)return{title:$('du-title').value.trim()||null,disciplines:[...disciplines]};
  if(n===2)return{primary_affiliation_type:$('du-aff-type').value||null,primary_affiliation_name:$('du-aff-name').value.trim()||null,...($('du-home-office')?{home_office:$('du-home-office').value.trim()||null}:{})};
  if(n===5)return{onboarding_interests:[...interests]};
  return null;
}
async function saveStep(){
  if(step===0&&!(await checkUsername(true)))return false;
  const f=stepFields(step);
  try{
    if(f){if(step===0)f.avatar_url=await uploadAvatar();await saveProfile(f);}
    if(step===3)await saveEducationFromOnboarding();
    if(step===4)await saveCareerFromOnboarding();
    setOnboardStatus('SAVED');return true;
  }catch(e){setOnboardStatus('SAVE FAILED — '+(e.message||e));toast('Could not save: '+(e.message||e),true);return false;}
}
async function saveEducationFromOnboarding(){
  const name=$('du-edu-name').value.trim();if(!name)return;
  const grad=Number($('du-edu-grad').value)||null;
  const {error}=await client.from('profile_education').insert({user_id:currentUser.id,institution_name:name,institution_type:$('du-edu-type').value||'other',program:$('du-edu-program').value.trim()||null,degree_or_certificate:$('du-edu-degree').value.trim()||null,start_year:Number($('du-edu-start').value)||null,graduation_year:grad,status:grad&&grad<new Date().getFullYear()?'alumni':'student',discoverable:true});
  if(error)throw error;
  ['du-edu-name','du-edu-program','du-edu-degree','du-edu-start','du-edu-grad'].forEach(id=>$(id).value='');
}
async function saveCareerFromOnboarding(){
  const org=$('du-work-org').value.trim(),role=$('du-work-role').value.trim();if(!org&&!role)return;
  if(!role)throw new Error('Add a role for '+org+' (or clear the employer field).');
  const {error}=await client.from('career_timeline').insert({user_id:currentUser.id,role,organization:org||null,location:$('du-work-location').value.trim()||null,start_date:$('du-work-start').value||null,end_date:$('du-work-end').value||null});
  if(error)throw error;
  ['du-work-org','du-work-role','du-work-location','du-work-start','du-work-end'].forEach(id=>$(id).value='');
}
async function finishOnboarding(){
  const next=$('du-next');next.disabled=true;setOnboardStatus('SAVING YOUR DRAWUP');
  try{
    if(!currentProfile?.onboarding_completed_at)await saveProfile({onboarding_completed_at:new Date().toISOString(),onboarding_interests:[...interests]});
    else await saveProfile({onboarding_interests:[...interests]});
    setOnboardStatus("LET'S PLAY");
    setTimeout(()=>{$('du-onboarding').classList.remove('open');next.disabled=false;openPortal('profile');},450);
  }catch(e){next.disabled=false;setOnboardStatus('SAVE FAILED — '+(e.message||e));}
}
function readyPreview(){const aff=$('du-aff-name').value.trim()||currentProfile?.primary_affiliation_name||'',place=$('du-location').value.trim()||currentProfile?.current_location||'',school=$('du-edu-name').value.trim();$('du-ready-aff').textContent=aff||'DrawUp Community';$('du-ready-place').textContent=place||'DrawUp';$('du-ready-school').textContent=school||'Your profile';$('du-ready-aff-sub').textContent=aff?'Team · projects · resources':'Projects · people · resources';$('du-ready-intro').textContent=[aff,place].filter(Boolean).length?'Connecting '+[aff,place].filter(Boolean).join(' · ')+' to your Portal.':'Connecting your profile across DrawUp.';}
function prefill(){
  $('du-account-email').value=currentUser?.email||'';
  const p=currentProfile||{};pendingAvatar=p.avatar_url||null;pendingAvatarFile=null;renderAvatarPreview(pendingAvatar);
  $('du-name').value=p.display_name||'';$('du-username').value=p.username||'';$('du-pronouns').value=p.pronouns||'';$('du-location').value=p.current_location||'';$('du-title').value=p.title||'';$('du-aff-type').value=p.primary_affiliation_type||'';$('du-aff-name').value=p.primary_affiliation_name||'';if($('du-home-office'))$('du-home-office').value=p.home_office||'';
  disciplines.clear();(p.disciplines||[]).forEach(x=>disciplines.add(x));interests.clear();(p.onboarding_interests||[]).forEach(x=>interests.add(x));
  document.querySelectorAll('[data-set="disciplines"] .du-chip').forEach(b=>b.classList.toggle('on',disciplines.has(b.dataset.value)));
  document.querySelectorAll('[data-set="interests"] .du-chip').forEach(b=>b.classList.toggle('on',interests.has(b.dataset.value)));
}
function openOnboarding(editing){
  prefill();showStep(0);setOnboardStatus('READY TO ENTER');
  const skip=$('du-skip');
  if(editing){skip.textContent='Close';skip.onclick=()=>{$('du-onboarding').classList.remove('open');openPortal('profile');};}
  else{skip.textContent='Skip for now';skip.onclick=async()=>{await saveStep();showStep(step+1);};}
  $('du-portal').classList.remove('open');$('du-onboarding').classList.add('open');
}
function renderAvatarPreview(src){const box=$('du-photo-preview');if(!box)return;if(src)box.innerHTML='<img alt="Profile photo" src="'+esc(src)+'">';else box.textContent=initials(currentProfile?.display_name||currentUser?.email);}
async function handlePhoto(e){const file=e.target.files&&e.target.files[0];if(!file)return;if(!/^image\/(jpeg|png|webp)$/.test(file.type)){toast('Choose a JPG, PNG or WebP image.',true);e.target.value='';return;}if(file.size>8*1024*1024){toast('Choose an image under 8 MB.',true);e.target.value='';return;}const img=new Image(),url=URL.createObjectURL(file);await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=url;});const size=384,c=document.createElement('canvas');c.width=size;c.height=size;const ctx=c.getContext('2d'),s=Math.max(size/img.naturalWidth,size/img.naturalHeight),w=img.naturalWidth*s,h=img.naturalHeight*s;ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);URL.revokeObjectURL(url);pendingAvatar=c.toDataURL('image/jpeg',.82);pendingAvatarFile=await new Promise(r=>c.toBlob(r,'image/jpeg',.82));renderAvatarPreview(pendingAvatar);}

/* ------------------------------------------------------------------ portal shell */
function tunnel(){const name=currentProfile?.display_name||currentUser?.email?.split('@')[0]||'Player';$('du-tunnel-name').textContent='Welcome back, '+name+'.';$('du-login-tunnel').classList.add('open');const s=['IDENTIFYING PLAYER','LOADING PROFILE','CONNECTING PROJECTS','LOADING DRAWUP',"LET'S PLAY."];let i=0;$('du-tunnel-status').textContent=s[0];const t=setInterval(()=>{i++;if(i<s.length)$('du-tunnel-status').textContent=s[i];if(i>=s.length-1){clearInterval(t);setTimeout(()=>{if($('du-login-tunnel').classList.contains('open'))openPortal();},450);}},380);}
function avatarHTML(p){p=p||currentProfile;const src=p?.avatar_url,n=p?.display_name||'DU';return src?`<img src="${esc(src)}" alt="${esc(n)}">`:esc(initials(n));}
function syncPortalIdentity(){
  if(!$('du-side-name'))return;
  const n=currentProfile?.display_name||currentUser?.email?.split('@')[0]||'DrawUp Member';
  $('du-menu-name').textContent=n;$('du-menu-user').textContent=currentProfile?.username?'@'+currentProfile.username:(currentUser?.email||'');
  $('du-side-name').textContent=n;$('du-side-role').textContent=currentProfile?.title||currentProfile?.primary_affiliation_name||'DrawUp Member';
  ['du-avatar','du-side-avatar'].forEach(id=>{const a=$(id);if(!a)return;if(currentProfile?.avatar_url){a.classList.add('has-photo');a.style.backgroundImage=`url("${String(currentProfile.avatar_url).replace(/"/g,'%22')}")`;a.textContent='';}else{a.classList.remove('has-photo');a.style.backgroundImage='';a.textContent=initials(n);}});
}
function tabFromHash(){const m=/^#portal(?:\/([a-z-]+))?/.exec(location.hash||'');if(!m)return null;return TABS.includes(m[1])?m[1]:'dashboard';}
function savedTab(){try{const t=localStorage.getItem(TAB_KEY);return TABS.includes(t)?t:'dashboard';}catch(_e){return'dashboard';}}
function openPortal(tab){
  $('du-login-tunnel').classList.remove('open');$('du-onboarding').classList.remove('open');$('du-portal').classList.add('open');
  document.documentElement.classList.add('du-in-portal');
  portalReady=true;syncPortalIdentity();loadPlanPill();loadHqFlag();
  openPortalTab(tab||tabFromHash()||savedTab());
}
function closePortal(){restoreEmbedded();$('du-portal')?.classList.remove('open');$('du-profile-panel')?.classList.remove('open');document.documentElement.classList.remove('du-in-portal');portalReady=false;}
async function loadPlanPill(){try{const {data}=await client.from('arch_coach_credit_accounts').select('*').eq('user_id',currentUser.id).maybeSingle();$('du-plan-status').textContent=data?((data.plan_code||'explore').replace(/_/g,' ').toUpperCase()+' · '+(data.unlimited_access?'Unlimited credits':((data.monthly_credits_remaining||0)+(data.purchased_credits_remaining||0))+' credits')):'';}catch(_e){}}

/* Public pages shown inside the Portal are moved in, then put back exactly where they were. */
let embedded=null;
function restoreEmbedded(){if(!embedded)return;const {page,parent,next}=embedded;page.hidden=true;page.classList.remove('du-portal-embedded-page');if(next&&next.parentNode===parent)parent.insertBefore(page,next);else parent.appendChild(page);embedded=null;}
function embedPublic(w,pageId,note){restoreEmbedded();const page=$(pageId);if(!page){w.innerHTML='<div class="du-empty"><h1>Workspace unavailable.</h1></div>';return;}embedded={page,parent:page.parentNode,next:page.nextSibling};w.innerHTML=note||'';page.hidden=false;page.classList.add('du-portal-embedded-page');w.appendChild(page);window.DrawUpLive?.refresh?.(pageId);}

let tabSeq=0;
async function openPortalTab(tab){
  if(!TABS.includes(tab))tab='dashboard';
  try{localStorage.setItem(TAB_KEY,tab);}catch(_e){}
  // keep a tool's own state (e.g. #portal/draw?id=…) when it is already on this tab
  if(location.hash!=='#portal/'+tab&&!location.hash.startsWith('#portal/'+tab+'?'))history.replaceState(null,'','#portal/'+tab);
  restoreEmbedded();
  document.querySelectorAll('[data-portal-tab]').forEach(x=>x.classList.toggle('active',x.dataset.portalTab===tab));
  $('du-profile-panel')?.classList.remove('open');
  const w=$('du-workspace-content');if(!w)return;
  const seq=++tabSeq;w.innerHTML='<div class="du-loading">DRAWING IT UP…</div>';w.dataset.seq=seq;
  try{
    if(EXT[tab])return await EXT[tab](w,toolCtx());
    if(tab==='dashboard')return await renderDashboard(w);
    if(tab==='search')return renderSearch(w);
    if(tab==='profile')return await renderProfile(w);
    if(tab==='projects')return await renderProjects(w);
    if(tab==='arch-coach')return await renderCoach(w);
    if(tab==='details')return await renderDetails(w);
    if(tab==='discover')return embedPublic(w,'page-discover');
    if(tab==='connect')return embedPublic(w,'page-connect');
    if(tab==='firm')return await renderFirm(w);
    if(tab==='team')return await renderTeam(w);
    if(tab==='account')return await renderAccount(w);
  }catch(e){console.error('Portal tab '+tab,e);if(w.dataset.seq==String(seq))w.innerHTML=`<article class="du-glass du-wide"><span class="du-kicker">CONNECTION ISSUE</span><h2>This workspace could not load.</h2><p>${esc(e.message||e)}</p><button class="du-btn primary" data-portal-tab="${tab}">Try again</button></article>`;}
}

/* Inside the Portal, any public-site link becomes Portal navigation. */
const PUBLIC_TO_TAB={home:'dashboard',discover:'discover',connect:'connect',details:'details',resources:'details',coach:'arch-coach',check:'check',swap:'swap',firms:'firm','firm-profile':'connect',profile:'profile',pricing:'account'};
function bindStatic(){
  $('du-photo-input').addEventListener('change',handlePhoto);
  document.querySelectorAll('.du-chip').forEach(b=>b.addEventListener('click',()=>{b.classList.toggle('on');const set=b.closest('[data-set]').dataset.set==='interests'?interests:disciplines;b.classList.contains('on')?set.add(b.dataset.value):set.delete(b.dataset.value);}));
  $('du-next').onclick=async()=>{if(step===document.querySelectorAll('.du-step').length-1){await finishOnboarding();return;}if(await saveStep())showStep(step+1);};
  $('du-username').addEventListener('input',()=>{const st=$('du-username-status');if(st){st.textContent='Checking username…';st.dataset.state='idle';}clearTimeout(usernameTimer);usernameTimer=setTimeout(()=>checkUsername(true),250);});
  $('du-username').addEventListener('blur',()=>checkUsername(true));
  $('du-tunnel-skip').onclick=()=>openPortal();
  $('du-avatar').onclick=e=>{e.stopPropagation();$('du-profile-panel').classList.toggle('open');};
  document.addEventListener('click',e=>{const p=$('du-profile-panel');if(p&&p.classList.contains('open')&&!e.target.closest('#du-profile-panel,#du-avatar'))p.classList.remove('open');});
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-portal-tab]');if(t){e.preventDefault();openPortalTab(t.dataset.portalTab);return;}
    const a=e.target.closest('[data-du-action]');if(!a)return;e.preventDefault();
    const act=a.dataset.duAction;
    if(act==='signout')signOut();
    else if(act==='public-home')openPortalTab('dashboard');
    else if(act==='profile')openOnboarding(true);
  });
  // Capture phase so the public hash router never sees clicks made inside the Portal.
  document.addEventListener('click',e=>{
    if(!$('du-portal')?.classList.contains('open'))return;
    const el=e.target.closest('[data-page],a[href^="#"]');if(!el||el.closest('[data-portal-tab],[data-du-action]'))return;
    const page=el.dataset.page||(el.getAttribute('href')||'').slice(1);
    if(!page||page==='portal'||page.startsWith('portal/'))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(el.dataset.firmSlug){openFirmProfile(el.dataset.firmSlug);return;}
    if(PUBLIC_TO_TAB[page]){openPortalTab(PUBLIC_TO_TAB[page]);return;}
    if($('page-'+page)){const w=$('du-workspace-content');document.querySelectorAll('[data-portal-tab]').forEach(x=>x.classList.remove('active'));embedPublic(w,'page-'+page);}
  },true);
  window.addEventListener('hashchange',()=>{if(!currentUser)return;const t=tabFromHash();if(!t)return;if(!$('du-portal').classList.contains('open'))openPortal(t);else if(!document.querySelector(`.du-side [data-portal-tab="${t}"].active`))openPortalTab(t);});
}

/* ------------------------------------------------------------------ dashboard */
function statCard(label,value,sub=''){return `<article class="du-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</article>`;}
async function renderDashboard(w){
  const [cr,pr,th]=await Promise.all([
    client.from('arch_coach_credit_accounts').select('*').eq('user_id',currentUser.id).maybeSingle(),
    client.from('project_threads').select('id',{count:'exact',head:true}).eq('owner_id',currentUser.id),
    client.from('coach_threads').select('id',{count:'exact',head:true}).eq('owner_id',currentUser.id)
  ]);
  const credits=cr.data,unlimited=!!credits?.unlimited_access,remaining=(credits?.monthly_credits_remaining||0)+(credits?.purchased_credits_remaining||0);
  const n=currentProfile?.display_name||'there';
  w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">YOUR DRAWUP</span><h1>Welcome, ${esc(n)}.</h1><p>${esc(currentProfile?.primary_affiliation_name||'Your AEC workspace is ready.')}</p></div><div class="du-live-pill">● PORTAL LIVE</div></div>
  <div class="du-stats">${statCard('Arch Coach',unlimited?'Unlimited':(credits?remaining+' credits':'—'),credits?(unlimited?'Personal unlimited access':'Available balance'):'No credit account yet')}${statCard('Projects',String(pr.count??0),'In your Portal')}${statCard('Coach threads',String(th.count??0),'Saved conversations')}${statCard('Profile',currentProfile?.profile_verified?'Verified':'Active',currentProfile?.username?'@'+currentProfile.username:'Add a username')}</div>
  <div class="du-portal-holo"><div class="du-holo-copy"><span class="du-kicker">DRAWUP COMMAND CENTER</span><h2>What are you drawing up?</h2><p>Projects · firms · people · codes · details · resources — architecture, engineering and construction</p><button class="du-btn primary" data-portal-tab="search">Search DrawUp →</button></div></div>
  <div class="du-dash-grid"><article class="du-glass du-command"><span class="du-kicker">COMMAND CENTER</span><h2>Jump back in</h2><div class="du-quick">${[['✦','Ask Arch Coach','arch-coach'],['▱','Projects','projects'],['✓','Check','check'],['⌕','Search','search']].map(x=>`<button data-portal-tab="${x[2]}"><b>${x[0]}</b><span>${x[1]}</span></button>`).join('')}</div></article>
  <article class="du-glass"><span class="du-kicker">PROFILE</span><h2>${esc(currentProfile?.display_name||'Your profile')}</h2><p>${esc([currentProfile?.title,currentProfile?.primary_affiliation_name].filter(Boolean).join(' · ')||'Build your AEC identity.')}</p><button data-portal-tab="profile">Open profile →</button></article>
  <article class="du-glass"><span class="du-kicker">TEAM</span><h2>Your coworkers on DrawUp</h2><p>Members who list ${esc(currentProfile?.primary_affiliation_name||'your firm')} as their affiliation.</p><button data-portal-tab="team">View team →</button></article></div>`;
}

/* ------------------------------------------------------------------ search */
function locLine(p){return [p.city,p.state,p.country&&p.country!=='US'?p.country:''].filter(Boolean).join(', ');}
function firmCard(f){return `<article class="du-glass du-result-card" data-open-firm="${esc(f.slug)}" tabindex="0">${f.hero_image_url||f.logo_url?`<div class="du-result-media"><img src="${esc(f.hero_image_url||f.logo_url)}" alt="${esc(f.name)}" loading="lazy"></div>`:''}<span class="du-kicker">FIRM${f.discipline?' · '+esc(String(f.discipline).toUpperCase()):''}${f.is_verified?' · VERIFIED':''}</span><h3>${esc(f.name)}</h3>${f.locations?`<p>${esc(f.locations)}</p>`:''}${f.description?`<p class="du-muted">${esc(String(f.description).slice(0,180))}</p>`:''}</article>`;}
function projectCard(p){const team=(p.team||[]).slice(0,3).map(t=>`${t.role}: ${t.firm}`).join(' · ');return `<article class="du-glass du-result-card" data-open-project="${esc(p.slug)}" tabindex="0">${p.image_url?`<div class="du-result-media"><img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy"></div>`:''}<span class="du-kicker">PROJECT${p.project_type?' · '+esc(String(p.project_type).toUpperCase()):''}${p.completion_year?' · '+esc(p.completion_year):''}</span><h3>${esc(p.name)}</h3>${locLine(p)?`<p>${esc(locLine(p))}</p>`:''}${team?`<p class="du-muted">${esc(team)}</p>`:''}</article>`;}
async function dbSearch(q,kind){const {data,error}=await client.rpc('drawup_search',{q,kind:kind||'all',max_rows:24});if(error)throw error;return data||{firms:[],projects:[]};}
function renderSearch(w,initial){
  if(EXT.search)return EXT.search(w,toolCtx(),initial);
  const kinds=[['all','All'],['projects','Projects'],['firms','Firms']];let kind='all';
  w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">DRAWUP SEARCH</span><h1>What are you drawing up?</h1><p>Search DrawUp's firm and project database — architecture, engineering and construction — without leaving your Portal.</p></div></div><div class="du-search-stage"><div class="du-search-holo"><div class="du-holo-model"><i></i><i></i><i></i><b>DU</b></div></div><form id="du-v17-search" class="du-search-box"><input id="du-v17-q" type="search" placeholder="Search a project, building, firm, city or project type…" autocomplete="off"><button class="du-btn primary">Search DrawUp →</button></form><div class="du-search-types">${kinds.map((k,i)=>`<button type="button" data-kind="${k[0]}" class="${i?'':'active'}">${k[1]}</button>`).join('')}</div></div><div id="du-v17-results"></div>`;
  const f=w.querySelector('#du-v17-search'),q=w.querySelector('#du-v17-q'),out=w.querySelector('#du-v17-results');
  w.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{kind=b.dataset.kind;w.querySelectorAll('[data-kind]').forEach(x=>x.classList.toggle('active',x===b));if(q.value.trim())f.requestSubmit();});
  f.onsubmit=async e=>{
    e.preventDefault();const term=q.value.trim();if(!term)return;
    out.innerHTML='<div class="du-loading">SEARCHING DRAWUP…</div>';
    try{
      const r=await dbSearch(term,kind);const firms=r.firms||[],projects=r.projects||[];
      out.innerHTML=`${projects.length?`<div class="du-section-title"><div><span class="du-kicker">DRAWUP PROJECTS</span><h2>${projects.length} project${projects.length===1?'':'s'}</h2></div></div><div class="du-profile-grid">${projects.map(projectCard).join('')}</div>`:''}
      ${firms.length?`<div class="du-section-title"><div><span class="du-kicker">DRAWUP FIRMS</span><h2>${firms.length} firm${firms.length===1?'':'s'}</h2></div></div><div class="du-profile-grid">${firms.map(firmCard).join('')}</div>`:''}
      ${!firms.length&&!projects.length?`<article class="du-glass du-wide"><span class="du-kicker">NO DRAWUP RECORD YET</span><h2>DrawUp doesn't have “${esc(term)}” in its database.</h2><p>DrawUp only shows firms and projects it has records for. You can research it on the open web below — those results are labeled as outside research, with their sources, and are not added to DrawUp.</p></article>`:''}
      <article class="du-glass du-wide"><span class="du-kicker">OUTSIDE RESEARCH</span><h2>Research “${esc(term)}” on the web</h2><p class="du-muted">Results come from public web sources, not DrawUp's verified database. Check the sources before relying on them.</p><button class="du-btn ghost" id="du-v17-web">Research on the web →</button><div id="du-v17-web-out"></div></article>`;
      bindResultClicks(out);out.scrollIntoView({behavior:'smooth',block:'start'});
      out.querySelector('#du-v17-web').onclick=()=>webResearch(term,out.querySelector('#du-v17-web-out'),out.querySelector('#du-v17-web'));
    }catch(err){out.innerHTML=`<article class="du-glass"><h2>Search connection issue</h2><p>${esc(err.message||err)}</p></article>`;}
  };
  if(initial){q.value=initial;f.requestSubmit();}
}
function bindResultClicks(root){
  root.querySelectorAll('[data-open-firm]').forEach(c=>{c.onclick=()=>openFirmProfile(c.dataset.openFirm);c.onkeydown=e=>{if(e.key==='Enter')c.click();};});
  root.querySelectorAll('[data-open-project]').forEach(c=>{c.onclick=()=>openProjectProfile(c.dataset.openProject);c.onkeydown=e=>{if(e.key==='Enter')c.click();};});
}
async function webResearch(term,box,btn){
  btn.disabled=true;box.innerHTML='<div class="du-loading">RESEARCHING PUBLIC SOURCES…</div>';
  try{
    const token=(await client.auth.getSession()).data.session?.access_token||'';
    const res=await fetch('/api/project-research',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({query:term,type:'all'})});
    const data=await res.json().catch(()=>({}));if(!res.ok||!data?.result)throw new Error(data?.error||'Web research unavailable.');
    const r=data.result,fields=[['Location',r.location],['Architecture',r.architect],['Engineering',r.engineers],['Construction',r.contractor],['Owner / Developer',r.owner],['Opened',r.opened],['Completed',r.completed],['Area',r.area],['Cost',r.cost],['Capacity',r.capacity]].filter(x=>x[1]);
    const sources=(Array.isArray(r.sources)?r.sources:[]).map(s=>Array.isArray(s)?{title:s[0],url:s[1]}:s).filter(s=>s&&s.url);
    box.innerHTML=`<div class="du-web-result"><span class="du-kicker">WEB RESEARCH · NOT VERIFIED BY DRAWUP</span><h3>${esc(r.title||term)}</h3>${r.summary||r.answer?`<p>${esc(r.summary||r.answer)}</p>`:''}${fields.length?`<div class="du-profile-grid">${fields.map(x=>`<article class="du-glass"><span class="du-kicker">${esc(x[0])}</span><p>${esc(x[1])}</p></article>`).join('')}</div>`:''}${Array.isArray(r.items)&&r.items.length?`<ul>${r.items.map(x=>`<li><b>${esc(x.title||'')}</b>${x.summary?' — '+esc(x.summary):''}${x.url?` <a href="${esc(x.url)}" target="_blank" rel="noopener">source ↗</a>`:''}</li>`).join('')}</ul>`:''}${sources.length?`<p class="du-kicker" style="margin-top:14px">SOURCES</p><ul class="du-source-list">${sources.slice(0,10).map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title||s.publisher||s.url)} ↗</a></li>`).join('')}</ul>`:'<p class="du-muted">No sources were returned, so treat this as unconfirmed.</p>'}</div>`;
  }catch(e){box.innerHTML=`<p class="du-muted">${esc(e.message||e)}</p>`;}
  finally{btn.disabled=false;}
}
async function openFirmProfile(slug){
  if(!$('du-portal').classList.contains('open'))openPortal('search');
  restoreEmbedded();const w=$('du-workspace-content');w.innerHTML='<div class="du-loading">LOADING FIRM…</div>';
  const html=await window.DrawUpLive?.firmProfileHTML?.(slug);
  w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">DRAWUP FIRM</span></div><button class="du-btn ghost" data-portal-tab="search">← Back to search</button></div>${html||'<article class="du-glass"><h2>Firm not found.</h2></article>'}`;
  window.DrawUpLive?.bindProfileLinks?.(w,openFirmProfile,openProjectProfile);
}
async function openProjectProfile(slug){
  if(!$('du-portal').classList.contains('open'))openPortal('search');
  restoreEmbedded();const w=$('du-workspace-content');w.innerHTML='<div class="du-loading">LOADING PROJECT…</div>';
  const html=await window.DrawUpLive?.projectProfileHTML?.(slug);
  w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">DRAWUP PROJECT</span></div><button class="du-btn ghost" data-portal-tab="search">← Back to search</button></div>${html||'<article class="du-glass"><h2>Project not found.</h2></article>'}`;
  window.DrawUpLive?.bindProfileLinks?.(w,openFirmProfile,openProjectProfile);
}

/* ------------------------------------------------------------------ profile */
function modal(title,html,kicker='EDIT PROFILE'){$('du-inline-modal')?.remove();document.body.insertAdjacentHTML('beforeend',`<div id="du-inline-modal" class="du-inline-modal"><div class="du-inline-card"><button class="du-inline-x" type="button" aria-label="Close">×</button><span class="du-kicker">${esc(kicker)}</span><h2>${esc(title)}</h2>${html}</div></div>`);const m=$('du-inline-modal');m.querySelector('.du-inline-x').onclick=()=>m.remove();return m;}
async function runSave(m,fn){const st=m.querySelector('.du-save-status'),btn=m.querySelector('.du-save');btn.disabled=true;st.textContent=' Saving…';try{await fn();m.remove();return true;}catch(e){st.textContent=' Not saved — '+(e.message||e);btn.disabled=false;return false;}}
function editBasics(){
  const p=currentProfile||{};
  const m=modal('Profile',`<div class="du-inline-grid"><label>Display name<input id="die-name" value="${esc(p.display_name||'')}"></label><label>Title / role<input id="die-title" value="${esc(p.title||'')}"></label><label>Pronouns<input id="die-pronouns" value="${esc(p.pronouns||'')}"></label><label>Location<input id="die-loc" value="${esc(p.current_location||'')}"></label><label>Current affiliation<input id="die-aff" list="du-firm-options-edit" autocomplete="off" value="${esc(p.primary_affiliation_name||'')}"><datalist id="du-firm-options-edit"></datalist></label><label>Home office <small>City, ST</small><input id="die-home" list="du-office-options-edit" autocomplete="off" value="${esc(p.home_office||'')}"><datalist id="du-office-options-edit"></datalist></label><label>Affiliation type<select id="die-afft"><option value="">Choose one</option>${['firm','university','organization'].map(x=>`<option value="${x}" ${p.primary_affiliation_type===x?'selected':''}>${x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select></label><label>Website<input id="die-web" value="${esc(p.website||'')}"></label><label>LinkedIn<input id="die-li" value="${esc(p.linkedin_url||'')}"></label><label>Disciplines <small>comma separated</small><input id="die-disc" value="${esc((p.disciplines||[]).join(', '))}"></label><label>Credentials <small>comma separated (AIA, PE, LEED AP…)</small><input id="die-cred" value="${esc((p.credentials||[]).join(', '))}"></label><label class="wide">Bio<textarea id="die-bio">${esc(p.bio||'')}</textarea></label></div><button class="du-btn primary du-save">Save changes</button><span class="du-save-status"></span>`);
  const list=id=>m.querySelector(id).value.split(',').map(x=>x.trim()).filter(Boolean);
  m.querySelector('.du-save').onclick=()=>runSave(m,async()=>{const name=m.querySelector('#die-name').value.trim();if(!name)throw new Error('Display name is required.');await saveProfile({display_name:name,title:m.querySelector('#die-title').value.trim()||null,pronouns:m.querySelector('#die-pronouns').value.trim()||null,current_location:m.querySelector('#die-loc').value.trim()||null,primary_affiliation_name:m.querySelector('#die-aff').value.trim()||null,primary_affiliation_type:m.querySelector('#die-afft').value||null,home_office:m.querySelector('#die-home').value.trim()||null,website:m.querySelector('#die-web').value.trim()||null,linkedin_url:m.querySelector('#die-li').value.trim()||null,disciplines:list('#die-disc'),credentials:list('#die-cred'),bio:m.querySelector('#die-bio').value.trim()||null});toast('Profile saved.');openPortalTab('profile');});
}
function editEducation(row){
  row=row||{};
  const m=modal(row.id?'Edit education + trade':'Add education + trade',`<div class="du-inline-grid"><label>School / program<input id="die-school" value="${esc(row.institution_name||'')}"></label><label>Type<select id="die-etype">${[['university','University / college'],['community_college','Community college'],['trade','Trade / technical school'],['apprenticeship','Apprenticeship'],['other','Other']].map(x=>`<option value="${x[0]}" ${row.institution_type===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></label><label>Program / major<input id="die-program" value="${esc(row.program||'')}"></label><label>Degree / certificate<input id="die-degree" value="${esc(row.degree_or_certificate||'')}"></label><label>Start year<input id="die-es" type="number" min="1900" max="2100" value="${esc(row.start_year||'')}"></label><label>Graduation / expected year<input id="die-eg" type="number" min="1900" max="2100" value="${esc(row.graduation_year||'')}"></label><label>Status<select id="die-status">${['student','alumni','trade','apprentice','other'].map(x=>`<option ${row.status===x?'selected':''}>${x}</option>`).join('')}</select></label></div><button class="du-btn primary du-save">${row.id?'Save changes':'Add education'}</button>${row.id?'<button class="du-btn ghost du-delete" type="button">Delete</button>':''}<span class="du-save-status"></span>`);
  m.querySelector('.du-save').onclick=()=>runSave(m,async()=>{const school=m.querySelector('#die-school').value.trim();if(!school)throw new Error('School / program is required.');const p={institution_name:school,institution_type:m.querySelector('#die-etype').value,program:m.querySelector('#die-program').value.trim()||null,degree_or_certificate:m.querySelector('#die-degree').value.trim()||null,start_year:Number(m.querySelector('#die-es').value)||null,graduation_year:Number(m.querySelector('#die-eg').value)||null,status:m.querySelector('#die-status').value,updated_at:new Date().toISOString()};const r=row.id?await client.from('profile_education').update(p).eq('id',row.id).eq('user_id',currentUser.id).select('id'):await client.from('profile_education').insert({...p,user_id:currentUser.id,discoverable:true}).select('id');if(r.error)throw r.error;if(!r.data?.length)throw new Error('The database did not confirm the save.');toast('Education saved.');openProfilePane('education');});
  m.querySelector('.du-delete')?.addEventListener('click',()=>{if(!confirm('Delete this education record?'))return;runSave(m,async()=>{const r=await client.from('profile_education').delete().eq('id',row.id).eq('user_id',currentUser.id);if(r.error)throw r.error;toast('Education removed.');openProfilePane('education');});});
}
function editCareer(row){
  row=row||{};
  const m=modal(row.id?'Edit work experience':'Add work experience',`<div class="du-inline-grid"><label>Employer / organization<input id="die-org" value="${esc(row.organization||'')}"></label><label>Role<input id="die-role" value="${esc(row.role||'')}"></label><label>Location<input id="die-wloc" value="${esc(row.location||'')}"></label><label>Start date<input id="die-ws" type="date" value="${esc(row.start_date||'')}"></label><label>End date <small>leave blank if current</small><input id="die-we" type="date" value="${esc(row.end_date||'')}"></label><label class="wide">Description<textarea id="die-wdesc">${esc(row.description||'')}</textarea></label></div><button class="du-btn primary du-save">${row.id?'Save changes':'Add experience'}</button>${row.id?'<button class="du-btn ghost du-delete" type="button">Delete</button>':''}<span class="du-save-status"></span>`);
  m.querySelector('.du-save').onclick=()=>runSave(m,async()=>{const org=m.querySelector('#die-org').value.trim(),role=m.querySelector('#die-role').value.trim();if(!role)throw new Error('Role is required.');const s=m.querySelector('#die-ws').value||null,e=m.querySelector('#die-we').value||null;if(s&&e&&e<s)throw new Error('End date is before start date.');const p={organization:org||null,role,location:m.querySelector('#die-wloc').value.trim()||null,start_date:s,end_date:e,description:m.querySelector('#die-wdesc').value.trim()||null};const r=row.id?await client.from('career_timeline').update(p).eq('id',row.id).eq('user_id',currentUser.id).select('id'):await client.from('career_timeline').insert({...p,user_id:currentUser.id}).select('id');if(r.error)throw r.error;if(!r.data?.length)throw new Error('The database did not confirm the save.');toast('Experience saved.');openProfilePane('experience');});
  m.querySelector('.du-delete')?.addEventListener('click',()=>{if(!confirm('Delete this role?'))return;runSave(m,async()=>{const r=await client.from('career_timeline').delete().eq('id',row.id).eq('user_id',currentUser.id);if(r.error)throw r.error;toast('Experience removed.');openProfilePane('experience');});});
}
let profilePaneWanted='overview';
function openProfilePane(name){profilePaneWanted=name;openPortalTab('profile');}
async function renderProfile(w){
  const [fresh,data]=await Promise.all([loadProfile(currentUser),profileHistory()]);currentProfile=fresh;syncPortalIdentity();
  const p=currentProfile,n=p.display_name||'DrawUp Member';
  const panes=[['overview','Overview'],['experience','Experience'],['education','Education + Trade'],['credentials','Credentials'],['saved','Saved']];
  w.innerHTML=`<div class="du-profile-cover"><div class="du-profile-orb">${avatarHTML()}</div><div><span class="du-kicker">DRAWUP PROFILE</span><h1>${esc(n)}</h1><p>${esc([p.title,p.primary_affiliation_name,p.current_location].filter(Boolean).join(' · '))}</p><div class="du-badges">${(p.disciplines||[]).map(x=>`<span>${esc(x)}</span>`).join('')}</div></div><div class="du-head-actions"><button class="du-btn ghost" id="du-edit-onboarding">Photo + username</button><button class="du-btn primary" id="du-edit-profile">Edit profile</button></div></div><div class="du-subtabs">${panes.map(x=>`<button data-profile-pane="${x[0]}">${x[1]}</button>`).join('')}</div><div id="du-profile-pane"></div>`;
  w.querySelector('#du-edit-profile').onclick=editBasics;w.querySelector('#du-edit-onboarding').onclick=()=>openOnboarding(true);
  const show=async name=>{
    w.querySelectorAll('[data-profile-pane]').forEach(b=>b.classList.toggle('active',b.dataset.profilePane===name));
    const pane=w.querySelector('#du-profile-pane');
    if(name==='overview'){pane.innerHTML=`<div class="du-profile-grid"><article class="du-glass du-edit-card du-click-edit" data-act="basics"><span class="du-kicker">CURRENT AFFILIATION</span><h2>${esc(p.primary_affiliation_name||'Add affiliation')}</h2><p>Your current affiliation stays separate from your history.</p></article><article class="du-glass du-edit-card du-click-edit" data-act="experience"><span class="du-kicker">WORK EXPERIENCE</span><h2>${data.career.length} role${data.career.length===1?'':'s'}</h2><p>${yearsExperience(data.career).toFixed(1)} years recorded.</p>${data.career.slice(0,3).map(x=>`<p><b>${esc(x.role)}</b>${x.organization?' · '+esc(x.organization):''}</p>`).join('')}</article><article class="du-glass du-edit-card du-click-edit" data-act="education"><span class="du-kicker">EDUCATION + TRADE</span><h2>${data.edu.length} record${data.edu.length===1?'':'s'}</h2>${data.edu.slice(0,3).map(x=>`<p><b>${esc(x.institution_name)}</b>${x.program?' · '+esc(x.program):''}</p>`).join('')||'<p>Universities, colleges, trade schools and apprenticeships.</p>'}</article><article class="du-glass du-edit-card du-click-edit" data-act="basics"><span class="du-kicker">ABOUT</span><p>${esc(p.bio||'Add a bio to tell the DrawUp community about your work and interests.')}</p></article></div>`;pane.querySelectorAll('[data-act]').forEach(c=>c.onclick=()=>c.dataset.act==='basics'?editBasics():show(c.dataset.act));return;}
    if(name==='experience'){pane.innerHTML=`<article class="du-glass du-wide"><div class="du-section-title"><span class="du-kicker">WORK EXPERIENCE</span><button class="du-btn primary" data-add="career">+ Add work experience</button></div>${data.career.length?data.career.map((x,i)=>`<div class="du-row"><div><b>${esc(x.role||'Role')}</b><span>${esc([x.organization,x.location].filter(Boolean).join(' · '))}</span>${x.description?`<small>${esc(x.description)}</small>`:''}</div><div><small>${esc(fmtDate(x.start_date))} — ${x.end_date?esc(fmtDate(x.end_date)):'Present'}${x.verified||x.verification_status==='verified'?' · ✓ Verified':''}</small> <button class="du-btn ghost" data-edit-career="${i}">Edit</button></div></div>`).join(''):'<p>No work history yet.</p>'}</article>`;pane.querySelector('[data-add]').onclick=()=>editCareer();pane.querySelectorAll('[data-edit-career]').forEach(b=>b.onclick=()=>editCareer(data.career[Number(b.dataset.editCareer)]));return;}
    if(name==='education'){pane.innerHTML=`<article class="du-glass du-wide"><div class="du-section-title"><span class="du-kicker">EDUCATION + TRADE</span><button class="du-btn primary" data-add="edu">+ Add education / trade</button></div>${data.edu.length?data.edu.map((x,i)=>`<div class="du-row"><div><b>${esc(x.institution_name)}</b><span>${esc([x.program,x.degree_or_certificate].filter(Boolean).join(' · '))}</span></div><div><small>${esc([x.status,x.graduation_year].filter(Boolean).join(' · '))}</small> <button class="du-btn ghost" data-edit-edu="${i}">Edit</button></div></div>`).join(''):'<p>No education or trade records yet.</p>'}</article>`;pane.querySelector('[data-add]').onclick=()=>editEducation();pane.querySelectorAll('[data-edit-edu]').forEach(b=>b.onclick=()=>editEducation(data.edu[Number(b.dataset.editEdu)]));return;}
    if(name==='credentials'){const a=p.credentials||[];pane.innerHTML=`<article class="du-glass du-wide"><div class="du-section-title"><span class="du-kicker">CREDENTIALS</span><button class="du-btn primary" data-act="basics">Edit credentials</button></div>${a.length?a.map(x=>`<div class="du-row"><b>${esc(x)}</b><span class="du-live-pill">SELF-REPORTED</span></div>`).join(''):'<p>Add licenses and certifications (AIA, NCARB, PE, LEED AP…).</p>'}</article>`;pane.querySelector('[data-act]').onclick=editBasics;return;}
    if(name==='saved'){const {data:saved,error}=await client.from('saved_items').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(50);pane.innerHTML=`<article class="du-glass du-wide"><span class="du-kicker">SAVED</span>${error?`<p>${esc(error.message)}</p>`:(saved||[]).length?saved.map(x=>`<div class="du-row"><div><b>${esc(x.label||x.entity_key)}</b><span>${esc(x.entity_type)}</span></div></div>`).join(''):'<p>Nothing saved yet.</p>'}</article>`;}
  };
  w.querySelectorAll('[data-profile-pane]').forEach(b=>b.onclick=()=>show(b.dataset.profilePane));
  const want=profilePaneWanted;profilePaneWanted='overview';show(want);
}

/* ------------------------------------------------------------------ projects */
const STARTER={name:'DrawUp Athletic Storage Bldg Example',type:'Learning project',location:'DrawUp Learning Project',description:'Learn DrawUp by finding the flaws in an AI-generated drawing, understanding the corrected assembly, and opening a coordinated DrawUp-ready sheet set.'};
const STARTER_FLAWS=[['View coordination','The generated plans, elevations, framing and axonometric views do not consistently describe the same building geometry.'],['Dimension conflicts','Overall and component dimensions do not reliably reconcile from view to view, and the strings are not derived from the geometry they claim to measure.'],['Roof geometry','Slope, overhang, high/low wall conditions and framing are not coordinated across the generated views.'],['Structural load path','Members are labeled, but sizing, bearing, uplift, lateral resistance and connections are not resolved.'],['Foundation design','Footing/pier size, depth, anchorage, soil/frost assumptions and post bases are not documented.'],['Openings + headers','Doors/windows and header conditions are not consistently dimensioned or coordinated with framing and schedules.'],['Detail completeness','The generated “details” lack dependable scales, fasteners, material specs, references and project-specific criteria.'],['Drawing navigation','There is no reliable sheet/detail/section reference system connecting the views.'],['Code + jurisdiction','The image does not establish jurisdiction, adopted code, loads, use/occupancy or other project criteria.'],['AEC coordination','Architectural-looking output does not establish structural, civil/site, electrical or other required engineering/construction coordination.']];
const STARTER_FIX=[['Geometry drives dimensions','Every dimension string is measured from the one building model, so partial strings add up to the overall.'],['Wall types are real assemblies','Each tagged wall type corresponds to a layered assembly shown on A601.'],['Openings coordinate','Door and window tags match the plan, the elevations and the A800 schedule.'],['Sections cut the same building','A301 sections and A501 details are taken from the same geometry as the plan.'],['Callouts point somewhere real','Section and detail bubbles reference sheets that exist in this set.']];
const STARTER_SHEETS=[['A101','Floor Plan','/starter-athletic-storage/A101-floor-plan.svg'],['A201','Exterior Elevations','/starter-athletic-storage/A201-elevations.svg'],['A301','Building Sections','/starter-athletic-storage/A301-building-sections.svg'],['A501','Wall Sections + Details','/starter-athletic-storage/A501-details.svg'],['A601','Typical Wall Types','/starter-athletic-storage/A601-wall-types.svg'],['A800','Openings + Schedules','/starter-athletic-storage/A800-openings-schedules.svg']];
async function ensureStarter(){
  const {data,error}=await client.from('project_threads').select('*').eq('owner_id',currentUser.id).eq('starter_key',STARTER_KEY).maybeSingle();
  if(error)throw error;if(data)return data;
  const ins=await client.from('project_threads').insert({owner_id:currentUser.id,starter_key:STARTER_KEY,project_name:STARTER.name,project_type:STARTER.type,location:STARTER.location,project_phase:'Learning',description:STARTER.description,status:'active',progress:{step:1}}).select('*').maybeSingle();
  if(ins.error){if(/duplicate|unique/i.test(ins.error.message)){const again=await client.from('project_threads').select('*').eq('owner_id',currentUser.id).eq('starter_key',STARTER_KEY).maybeSingle();return again.data;}throw ins.error;}
  return ins.data;
}
async function renderProjects(w){
  let starterErr=null;try{await ensureStarter();}catch(e){starterErr=e;}
  const {data,error}=await client.from('project_threads').select('*').eq('owner_id',currentUser.id).order('updated_at',{ascending:false}).limit(60);
  if(error)throw error;
  const projects=(data||[]).sort((a,b)=>(a.starter_key?1:0)-(b.starter_key?1:0));
  w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">PROJECTS</span><h1>Your work starts here.</h1><p>Every project here is saved to your DrawUp account.</p></div><div class="du-head-actions"><button class="du-btn primary" id="du-new-project">＋ Start new project</button></div></div>
  ${starterErr?`<article class="du-glass du-wide"><span class="du-kicker">STARTER PROJECT</span><p>The learning project could not be added to your account: ${esc(starterErr.message||starterErr)}. Run the V17 Supabase migration (0020) and refresh.</p></article>`:''}
  <div class="du-profile-grid du-project-grid">${projects.length?projects.map(p=>`<article class="du-glass du-v15-project${p.starter_key?' du-starter-project':''}"><span class="du-kicker">${p.starter_key?'STARTER PROJECT · LEARNING':esc((p.project_phase||p.status||'Project').toUpperCase())}</span><h3>${esc(p.project_name)}</h3><p>${esc([p.project_type,p.location].filter(Boolean).join(' · ')||'DrawUp project')}</p>${p.starter_key?`<p class="du-muted">Step ${esc(p.progress?.step||1)} of 3</p>`:''}<button class="du-btn ghost" data-open-proj="${esc(p.id)}">Open project →</button></article>`).join(''):'<article class="du-glass du-wide"><h3>No projects yet.</h3><p>Start a project to keep its Arch Coach threads, notes and files together.</p></article>'}</div>`;
  w.querySelector('#du-new-project').onclick=()=>editProject();
  w.querySelectorAll('[data-open-proj]').forEach(b=>b.onclick=()=>{const p=projects.find(x=>x.id===b.dataset.openProj);p.starter_key?renderStarter(w,p):renderProject(w,p);});
}
function editProject(p){
  p=p||{};
  const m=modal(p.id?'Edit project':'Start a new project',`<div class="du-inline-grid"><label>Project name<input id="dp-name" value="${esc(p.project_name||'')}"></label><label>Project type<input id="dp-type" placeholder="Healthcare, bridge, mixed-use, retrofit…" value="${esc(p.project_type||'')}"></label><label>Location<input id="dp-loc" placeholder="City, State / Country" value="${esc(p.location||'')}"></label><label>Phase<select id="dp-phase">${['Pre-design','Schematic design','Design development','Construction documents','Bidding','Construction administration','Construction','Closeout','Learning'].map(x=>`<option ${p.project_phase===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Client nickname <small>optional, private</small><input id="dp-client" value="${esc(p.client_nickname||'')}"></label><label class="wide">Description<textarea id="dp-desc">${esc(p.description||'')}</textarea></label></div><button class="du-btn primary du-save">${p.id?'Save project':'Create project'}</button><span class="du-save-status"></span>`,'PROJECT');
  m.querySelector('.du-save').onclick=()=>runSave(m,async()=>{const name=m.querySelector('#dp-name').value.trim();if(!name)throw new Error('Project name is required.');const f={project_name:name,project_type:m.querySelector('#dp-type').value.trim()||null,location:m.querySelector('#dp-loc').value.trim()||null,project_phase:m.querySelector('#dp-phase').value,client_nickname:m.querySelector('#dp-client').value.trim()||null,description:m.querySelector('#dp-desc').value.trim()||null,updated_at:new Date().toISOString()};const r=p.id?await client.from('project_threads').update(f).eq('id',p.id).eq('owner_id',currentUser.id).select('*'):await client.from('project_threads').insert({...f,owner_id:currentUser.id}).select('*');if(r.error)throw r.error;if(!r.data?.length)throw new Error('The database did not confirm the save.');toast('Project saved.');renderProject($('du-workspace-content'),r.data[0]);});
}
async function renderProject(w,p){
  const {data:threads}=await client.from('coach_threads').select('id,title,updated_at').eq('owner_id',currentUser.id).eq('project_thread_id',p.id).order('updated_at',{ascending:false});
  w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">PROJECT · ${esc((p.project_phase||'').toUpperCase())}</span><h1>${esc(p.project_name)}</h1><p>${esc([p.project_type,p.location].filter(Boolean).join(' · '))}</p></div><div class="du-head-actions"><button class="du-btn ghost" data-portal-tab="projects">← All projects</button><button class="du-btn ghost" id="dp-edit">Edit</button><button class="du-btn ghost" id="dp-del">Delete</button></div></div>
  <div class="du-profile-grid"><article class="du-glass du-wide"><span class="du-kicker">ABOUT</span><p>${esc(p.description||'No description yet.')}</p>${p.client_nickname?`<p class="du-muted">Client: ${esc(p.client_nickname)}</p>`:''}</article>
  <article class="du-glass du-wide"><div class="du-section-title"><span class="du-kicker">ARCH COACH THREADS FOR THIS PROJECT</span><button class="du-btn primary" id="dp-coach">＋ New project thread</button></div>${(threads||[]).length?threads.map(t=>`<div class="du-row"><div><b>${esc(t.title)}</b><span>${esc(new Date(t.updated_at).toLocaleString())}</span></div><button class="du-btn ghost" data-open-thread="${esc(t.id)}">Open →</button></div>`).join(''):'<p>No Arch Coach threads linked to this project yet.</p>'}</article></div>`;
  w.querySelector('#dp-edit').onclick=()=>editProject(p);
  w.querySelector('#dp-del').onclick=async()=>{if(!confirm('Delete “'+p.project_name+'”? Its Arch Coach threads are kept but unlinked.'))return;const r=await client.from('project_threads').delete().eq('id',p.id).eq('owner_id',currentUser.id);if(r.error){toast(r.error.message,true);return;}toast('Project deleted.');openPortalTab('projects');};
  w.querySelector('#dp-coach').onclick=()=>{coachIntent={projectId:p.id,newThread:true};openPortalTab('arch-coach');};
  w.querySelectorAll('[data-open-thread]').forEach(b=>b.onclick=()=>{coachIntent={threadId:b.dataset.openThread};openPortalTab('arch-coach');});
  try{window.DrawUpSets?.mount?.(w,p);}catch(e){console.warn('Drawing sets',e);}
  try{window.DrawUpProjectStudio?.mount?.(w,p,client,currentUser,toast);}catch(e){console.warn('Project development studio',e);}
}
async function renderStarter(w,proj){
  const save=async step=>{proj.progress={...(proj.progress||{}),step};const r=await client.from('project_threads').update({progress:proj.progress,updated_at:new Date().toISOString()}).eq('id',proj.id).eq('owner_id',currentUser.id);if(r.error)toast('Progress not saved: '+r.error.message,true);};
  w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">DRAWUP STARTER PROJECT</span><h1>${esc(STARTER.name)}</h1><p>One project that teaches the full DrawUp workflow: why the first result is wrong, how to correct it, and what a coordinated result looks like.</p></div><div class="du-head-actions"><button class="du-btn ghost" data-portal-tab="projects">← All projects</button><span class="du-live-pill">LEARNING PROJECT</span></div></div><div class="du-starter-steps"><button data-step="1"><b>01</b><span>Find the flaws</span></button><button data-step="2"><b>02</b><span>Understand the fix</span></button><button data-step="3"><b>03</b><span>DrawUp Ready</span></button></div><div id="du-starter-stage"></div><div class="du-head-actions du-starter-nav"><button class="du-btn ghost" id="ds-prev">← Previous step</button><button class="du-btn primary" id="ds-next">Next step →</button></div>`;
  const stage=w.querySelector('#du-starter-stage');
  const show=n=>{n=Math.max(1,Math.min(3,n));w.querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('active',Number(b.dataset.step)===n));w.querySelector('#ds-prev').disabled=n===1;w.querySelector('#ds-next').disabled=n===3;
    if(n===1)stage.innerHTML=`<div class="du-starter-split"><article class="du-glass"><span class="du-kicker">STEP 1 · AI-GENERATED SOURCE</span><h2>Looks plausible. Is it coordinated?</h2><p class="du-muted">This image is the example you learn to critique. It is not a construction document.</p><a href="/starter-athletic-storage/01-ai-generated-source.png" target="_blank" rel="noopener"><img class="du-ai-source" src="/starter-athletic-storage/01-ai-generated-source.png" alt="AI-generated athletic storage drawing used for flaw review"></a></article><div class="du-flaw-list">${STARTER_FLAWS.map((f,i)=>`<article class="du-glass"><b>${String(i+1).padStart(2,'0')} · ${esc(f[0])}</b><p>${esc(f[1])}</p></article>`).join('')}</div></div>`;
    else if(n===2)stage.innerHTML=`<article class="du-glass du-wide"><span class="du-kicker">STEP 2 · CORRECTED ASSEMBLY</span><h2>Every piece comes from one coordinated building.</h2><p>Foundation, floor, walls, openings, roof and connections are treated as one system, so the drawings that come out of it agree with each other.</p><img class="du-holo-assembly" src="/starter-athletic-storage/02-corrected-hologram.svg" alt="Corrected exploded holographic building assembly"><div class="du-flaw-list">${STARTER_FIX.map(f=>`<article class="du-glass"><b>${esc(f[0])}</b><p>${esc(f[1])}</p></article>`).join('')}</div></article>`;
    else stage.innerHTML=`<div class="du-section-title"><div><span class="du-kicker">STEP 3 · DRAWUP READY</span><h2>Coordinated sheet set</h2><p>Black-and-white documentation with DrawUp titleblocks, scales, callouts and cross-references. Learning content — project-specific verification is still required.</p></div></div><div class="du-sheet-grid">${STARTER_SHEETS.map(s=>`<article class="du-glass"><a href="${s[2]}" target="_blank" rel="noopener"><img src="${s[2]}" alt="${esc(s[0]+' '+s[1])}"></a><span class="du-kicker">${s[0]}</span><h3>${esc(s[1])}</h3><a href="${s[2]}" target="_blank" rel="noopener">Open full sheet ↗</a></article>`).join('')}</div>`;
    save(n);};
  w.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>show(Number(b.dataset.step)));
  w.querySelector('#ds-prev').onclick=()=>show((proj.progress?.step||1)-1);w.querySelector('#ds-next').onclick=()=>show((proj.progress?.step||1)+1);
  show(Number(proj.progress?.step)||1);
}

/* ------------------------------------------------------------------ arch coach (persisted) */
let coachIntent=null;
async function renderCoach(w){
  const intent=coachIntent;coachIntent=null;
  const [{data:threads,error},{data:projects}]=await Promise.all([
    client.from('coach_threads').select('id,title,project_thread_id,updated_at').eq('owner_id',currentUser.id).order('updated_at',{ascending:false}).limit(40),
    client.from('project_threads').select('id,project_name').eq('owner_id',currentUser.id).order('updated_at',{ascending:false})
  ]);
  if(error)throw error;
  let active=intent?.threadId?threads.find(t=>t.id===intent.threadId):(intent?.newThread?null:threads[0]);
  let draftProject=intent?.projectId||null,messages=[],pendingImage='';
  const projName=id=>(projects||[]).find(p=>p.id===id)?.project_name;
  const loadMessages=async()=>{if(!active){messages=[];return;}const {data,error}=await client.from('coach_messages').select('id,role,content,created_at').eq('thread_id',active.id).order('created_at');if(error)throw error;messages=data||[];};
  const draw=()=>{
    const pid=active?active.project_thread_id:draftProject;
    w.innerHTML=`<div class="du-coach-shell"><aside class="du-coach-threads"><button class="du-btn primary" id="dc-new">＋ New thread</button><div class="du-coach-thread-list">${(threads||[]).map(t=>`<button data-thread="${t.id}" class="${active&&t.id===active.id?'active':''}"><b>${esc(t.title||'New chat')}</b><small>${esc(projName(t.project_thread_id)||'General')}</small></button>`).join('')||'<p class="du-muted">Your saved threads appear here.</p>'}</div></aside>
    <section class="du-coach-main"><div class="du-work-head"><div><span class="du-kicker">ARCH COACH</span><h1>${esc(active?.title||'New thread')}</h1><p>Saved to your account${pid?' · linked to '+esc(projName(pid)||'a project'):''}.</p></div>${active?'<button class="du-btn ghost" id="dc-del">Delete thread</button>':''}</div>
    <div class="du-coach-tools"><label>Project <select id="dc-project" ${active?'disabled':''}><option value="">General (no project)</option>${(projects||[]).map(p=>`<option value="${p.id}" ${p.id===pid?'selected':''}>${esc(p.project_name)}</option>`).join('')}</select></label><label>＋ Graphic<input id="dc-image" type="file" accept="image/png,image/jpeg,image/webp" hidden></label></div>
    <div id="dc-messages" class="du-coach-messages">${messages.length?messages.map(m=>`<article class="${m.role}"><span>${m.role==='user'?'YOU':'ARCH COACH'}</span><p>${esc(m.content)}</p></article>`).join(''):'<div class="du-coach-empty"><b>What are we drawing up?</b><p>Ask about codes, details, structure, construction or a specific project. Every message is saved to this thread.</p></div>'}</div>
    <div id="dc-preview"></div><form id="dc-form" class="du-coach-compose"><textarea id="dc-input" rows="3" placeholder="Ask Arch Coach…"></textarea><button class="du-btn primary">Send</button></form><div id="dc-status" class="du-muted"></div></section></div>`;
    const box=w.querySelector('#dc-messages');box.scrollTop=box.scrollHeight;
    w.querySelector('#dc-new').onclick=()=>{active=null;messages=[];draftProject=null;draw();};
    w.querySelector('#dc-project').onchange=e=>{draftProject=e.target.value||null;};
    w.querySelectorAll('[data-thread]').forEach(b=>b.onclick=async()=>{active=threads.find(t=>t.id===b.dataset.thread);await loadMessages();draw();});
    w.querySelector('#dc-del')?.addEventListener('click',async()=>{if(!confirm('Delete this thread and its messages?'))return;const r=await client.from('coach_threads').delete().eq('id',active.id).eq('owner_id',currentUser.id);if(r.error){toast(r.error.message,true);return;}threads.splice(threads.indexOf(active),1);active=threads[0]||null;await loadMessages();draw();});
    const fi=w.querySelector('#dc-image');fi.onchange=()=>{const f=fi.files?.[0];if(!f)return;if(f.size>6*1024*1024){toast('Choose an image under 6 MB.',true);return;}const r=new FileReader();r.onload=()=>{pendingImage=String(r.result);w.querySelector('#dc-preview').innerHTML=`<div class="du-coach-preview"><img src="${pendingImage}" alt=""><span>${esc(f.name)} · sent with your next message (not stored)</span></div>`;};r.readAsDataURL(f);};
    w.querySelector('#dc-input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();w.querySelector('#dc-form').requestSubmit();}};
    w.querySelector('#dc-form').onsubmit=async e=>{
      e.preventDefault();const inp=w.querySelector('#dc-input'),text=inp.value.trim()||(pendingImage?'Review this graphic.':'');if(!text)return;
      const st=w.querySelector('#dc-status'),btn=w.querySelector('#dc-form button');btn.disabled=true;st.textContent='Saving your question…';
      try{
        if(!active){const r=await client.from('coach_threads').insert({owner_id:currentUser.id,title:text.slice(0,60),type:draftProject?'project':'general',project_thread_id:draftProject}).select('id,title,project_thread_id,updated_at').single();if(r.error)throw r.error;active=r.data;threads.unshift(active);}
        const um=await client.from('coach_messages').insert({thread_id:active.id,role:'user',content:text}).select('id,role,content,created_at').single();if(um.error)throw um.error;
        messages.push(um.data);const img=pendingImage;pendingImage='';draw();
        const st2=w.querySelector('#dc-status');st2.textContent='Arch Coach is drawing it up…';
        const token=(await client.auth.getSession()).data.session?.access_token||'';
        const history=messages.slice(-16).map(x=>({role:x.role,content:x.content}));
        const askBody={message:text,history,image:img||undefined,location:currentProfile?.current_location||'',project:projName(active.project_thread_id)||'',thread_id:active.id};
        let d;if(window.DrawUpV20?.coachAsk){st2.textContent='';d=await window.DrawUpV20.coachAsk({token,stage:w.querySelector('#dc-messages'),...askBody});}
        else{const res=await fetch('/api/arch-coach',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(askBody)});d=await res.json().catch(()=>({}));if(!res.ok)throw new Error(d.error||'Arch Coach connection issue.');}
        if(d.server_persisted){
          await loadMessages();
        }else{
          const sourcesTxt=(d.sources||[]).length?'\n\nSources:\n'+d.sources.map(s=>'• '+(s.title||'Source')+' — '+s.url).join('\n'):'';
          const am=await client.from('coach_messages').insert({thread_id:active.id,role:'assistant',content:String(d.answer||'')+sourcesTxt}).select('id,role,content,created_at').single();if(am.error)throw am.error;
          messages.push(am.data);
        }
        await client.from('coach_threads').update({updated_at:new Date().toISOString()}).eq('id',active.id);
        draw();loadPlanPill();
        const s3=w.querySelector('#dc-status');if(s3&&d.credits_charged)s3.textContent=`${d.credits_charged} credits used${d.credits_remaining!=null?' · '+d.credits_remaining+' left':''}.`;
      }catch(err){draw();const s=w.querySelector('#dc-status');if(s)s.textContent='Your question is saved; the answer did not arrive: '+(err.message||err);}
    };
  };
  await loadMessages();draw();
}

/* ------------------------------------------------------------------ details */
const DU_CATS=['Wall Sections','Exterior Walls','Roofs','Foundations','Slabs','Doors','Windows','Storefront / Curtain Wall','Stairs','Railings','Restrooms / ADA','Millwork','Interiors','Ceilings','Structural','MEP Coordination','Site','Fire / Life Safety','Typical Details','Custom'];
const STARTER_DETAILS=[['Wall Sections','Typical Exterior Wall Section','A501 / 1','/starter-athletic-storage/A501-details.svg'],['Exterior Walls','Wall Base / Sill Condition','A501 / 2','/starter-athletic-storage/A501-details.svg'],['Roofs','Roof Eave Condition','A501 / 3','/starter-athletic-storage/A501-details.svg'],['Doors','Door Head + Jamb','A501 / 4','/starter-athletic-storage/A501-details.svg'],['Windows','Window Head + Jamb + Sill','A501 / 5','/starter-athletic-storage/A501-details.svg'],['Structural','Post / Beam Connection Study','A501 / 6','/starter-athletic-storage/A501-details.svg'],['Typical Details','Wood Stud Exterior Wall Type W1','A601 / W1','/starter-athletic-storage/A601-wall-types.svg'],['Typical Details','Wood Stud Interior Wall Type W2','A601 / W2','/starter-athletic-storage/A601-wall-types.svg'],['Typical Details','Insulated Storage Wall Type W3','A601 / W3','/starter-athletic-storage/A601-wall-types.svg'],['Doors','Door Types + Frame Types','A800','/starter-athletic-storage/A800-openings-schedules.svg'],['Windows','Window / Opening Schedule','A800','/starter-athletic-storage/A800-openings-schedules.svg']];
function starterDetailCard(d){return `<article class="du-glass du-starter-detail" data-cat="${esc(d[0])}"><div class="du-detail-thumb"><img src="${d[3]}" alt="${esc(d[1])}"></div><span class="du-kicker">DRAWUP STARTER · ${esc(d[0])}</span><h3>${esc(d[1])}</h3><p>${esc(d[2])} · Learning content from the starter project — adapt to project-specific conditions.</p><div class="du-card-actions"><a href="${d[3]}" target="_blank" rel="noopener">Open sheet ↗</a></div></article>`;}
function detailCard(d){const assets=d.detail_assets||[];const types=[...new Set(assets.map(a=>(a.file_ext||'FILE').toUpperCase()))];return `<article class="du-detail-card"><div class="du-detail-thumb">${d.preview_url?`<img src="${esc(d.preview_url)}" alt="">`:'<b>DETAIL</b>'}</div><div class="du-detail-body"><span class="du-kicker">${esc(d.category||'Detail')}${d.status&&d.status!=='published'?' · '+esc(d.status.toUpperCase()):''}</span><h3>${esc(d.title||'Untitled detail')}</h3><p>${esc(d.description||'')}</p><div class="du-filetypes">${types.map(x=>`<span>${esc(x)}</span>`).join('')}</div>${assets.map(a=>a.public_url?`<a class="du-download" href="${esc(a.public_url)}" target="_blank" rel="noopener">${esc((a.file_ext||'file').toUpperCase())} · ${esc(a.file_name)}</a>`:'').join('')}</div></article>`;}
async function getDetails(scope){let q=client.from('details').select('*,detail_assets(*)').order('created_at',{ascending:false}).limit(100);if(scope==='firm')q=q.eq('firm_name',currentProfile?.primary_affiliation_name||'__none__').in('visibility',['firm','drawup']);else if(scope==='mine')q=q.eq('owner_id',currentUser.id);else q=q.eq('status','published').eq('visibility','drawup');const {data,error}=await q;if(error)throw error;return data||[];}
async function uploadDetail(scope){
  const {data:career}=await client.from('career_timeline').select('start_date,end_date').eq('user_id',currentUser.id);
  const canCommunity=yearsExperience(career)>=5||(currentProfile?.credentials||[]).length>0||currentProfile?.profile_verified;
  if(scope==='drawup'&&!canCommunity){toast('Publishing to DrawUp Details requires 5+ years of recorded experience or a professional credential on your profile. You can still upload to your firm library.',true);return;}
  if(scope==='firm'&&!currentProfile?.primary_affiliation_name){toast('Add your firm affiliation to your profile first.',true);return;}
  const m=modal('Upload a detail',`<div class="du-inline-grid"><label>Title<input id="dd-title"></label><label>Category<select id="dd-cat">${DU_CATS.map(x=>`<option>${esc(x)}</option>`).join('')}</select></label><label class="wide">Description<textarea id="dd-desc"></textarea></label><label class="wide">Files <small>PDF, JPG, PNG, DWG, DXF, RVT, RFA…</small><input id="dd-files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.dwg,.dxf,.rvt,.rfa,.doc,.docx,.xls,.xlsx,.zip"></label></div><button class="du-btn primary du-save">${scope==='firm'?'Add to firm library':'Submit for review'}</button><span class="du-save-status"></span>`,'DETAILS');
  m.querySelector('.du-save').onclick=()=>runSave(m,async()=>{const title=m.querySelector('#dd-title').value.trim(),files=[...m.querySelector('#dd-files').files];if(!title)throw new Error('Title is required.');if(!files.length)throw new Error('Choose at least one file.');
    const {data:d,error}=await client.from('details').insert({owner_id:currentUser.id,title,category:m.querySelector('#dd-cat').value,description:m.querySelector('#dd-desc').value.trim()||null,visibility:scope==='firm'?'firm':'drawup',firm_name:currentProfile?.primary_affiliation_name||null,status:scope==='firm'?'published':'submitted'}).select().single();if(error)throw error;
    const failed=[];for(const f of files){const ext=(f.name.split('.').pop()||'file').toLowerCase(),path=`${currentUser.id}/${d.id}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const up=await client.storage.from('drawup-files').upload(path,f,{upsert:false});if(up.error){failed.push(f.name+': '+up.error.message);continue;}const url=client.storage.from('drawup-files').getPublicUrl(path).data.publicUrl;const a=await client.from('detail_assets').insert({detail_id:d.id,owner_id:currentUser.id,file_name:f.name,file_ext:ext,storage_path:path,public_url:url,file_size:f.size});if(a.error)failed.push(f.name+': '+a.error.message);if(!d.preview_url&&/^(png|jpe?g|webp)$/.test(ext))await client.from('details').update({preview_url:url}).eq('id',d.id);}
    if(failed.length)throw new Error('Detail saved, but some files failed: '+failed.join('; '));
    toast(scope==='firm'?'Added to your firm library.':'Submitted to DrawUp Details for review.');openPortalTab(scope==='firm'?'firm':'details');});
}
async function renderDetails(w){
  const [list,mine]=await Promise.all([getDetails('drawup').catch(()=>[]),getDetails('mine').catch(()=>[])]);
  w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">DRAWUP DETAILS</span><h1>Detail Library</h1><p>Published details with their real PDF, image, CAD and BIM files, plus the starter project's learning details.</p></div><div class="du-head-actions"><button class="du-btn ghost" id="du-upload-firm">Upload to firm</button><button class="du-btn primary" id="du-upload-community">Upload detail</button></div></div><div class="du-category-strip"><button data-cat="" class="active">All</button>${DU_CATS.map(x=>`<button data-cat="${esc(x)}">${esc(x)}</button>`).join('')}</div><div class="du-detail-grid" id="du-detail-grid"></div>${mine.length?`<div class="du-section-title"><div><span class="du-kicker">YOUR UPLOADS</span><h2>${mine.length} detail${mine.length===1?'':'s'}</h2></div></div><div class="du-detail-grid">${mine.map(detailCard).join('')}</div>`:''}`;
  const grid=w.querySelector('#du-detail-grid');
  const fill=cat=>{const db=list.filter(d=>!cat||d.category===cat),st=STARTER_DETAILS.filter(d=>!cat||d[0]===cat);grid.innerHTML=st.map(starterDetailCard).join('')+db.map(detailCard).join('')||'<article class="du-glass"><h2>No details in this category yet.</h2></article>';};
  w.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{w.querySelectorAll('[data-cat]').forEach(x=>x.classList.toggle('active',x===b));fill(b.dataset.cat);});
  w.querySelector('#du-upload-community').onclick=()=>uploadDetail('drawup');w.querySelector('#du-upload-firm').onclick=()=>uploadDetail('firm');fill('');
}

/* ------------------------------------------------------------------ firm / team / account */
async function firmMembers(){const firm=currentProfile?.primary_affiliation_name;if(!firm)return[];const {data}=await client.from('profiles').select('id,display_name,username,title,avatar_url,profile_verified').eq('primary_affiliation_name',firm).eq('discoverable',true).limit(100);return data||[];}
async function renderFirm(w){
  const firm=currentProfile?.primary_affiliation_name;
  if(!firm){w.innerHTML=`<div class="du-empty"><span class="du-kicker">FIRM</span><h1>Add your firm to unlock your firm page.</h1><p>Personal accounts can still have a firm page. Add a current affiliation from Profile; a firm subscription is not required.</p><button class="du-btn primary" data-portal-tab="profile">Update profile</button></div>`;return;}
  const [members,lib,match]=await Promise.all([firmMembers(),getDetails('firm').catch(()=>[]),client.from('firms').select('slug,name,is_verified').ilike('name',firm).eq('is_demo',false).limit(1)]);
  const rec=match.data?.[0];
  w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">YOUR FIRM</span><h1>${esc(firm)}</h1><p>${rec?`Listed in the DrawUp firm directory${rec.is_verified?' · verified':''}.`:'Not in the DrawUp firm directory yet.'}</p></div><div class="du-head-actions">${rec?`<button class="du-btn ghost" id="df-open">Open firm profile</button>`:`<button class="du-btn ghost" id="df-submit">Submit this firm</button>`}<span class="du-live-pill">${members.length} DRAWUP MEMBER${members.length===1?'':'S'}</span></div></div>
  <div class="du-dash-grid"><article class="du-glass"><span class="du-kicker">TEAM</span><h2>${members.length} coworker${members.length===1?'':'s'} on DrawUp</h2><button data-portal-tab="team">Open team →</button></article><article class="du-glass du-command"><div class="du-section-title"><span class="du-kicker">FIRM LIBRARY</span><button class="du-btn primary" id="df-up">Upload files</button></div>${lib.length?`<div class="du-detail-grid">${lib.map(detailCard).join('')}</div>`:'<p>No firm library files yet.</p>'}</article></div>`;
  w.querySelector('#df-up').onclick=()=>uploadDetail('firm');
  w.querySelector('#df-open')?.addEventListener('click',()=>openFirmProfile(rec.slug));
  w.querySelector('#df-submit')?.addEventListener('click',()=>window.DrawUpLive?.openFirmSubmission?.(firm));
}
async function renderTeam(w){const firm=currentProfile?.primary_affiliation_name;if(!firm){w.innerHTML='<div class="du-empty"><h1>Team</h1><p>Add your firm affiliation to see coworkers on DrawUp.</p><button class="du-btn primary" data-portal-tab="profile">Update profile</button></div>';return;}const members=await firmMembers();w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">TEAM</span><h1>${esc(firm)}</h1><p>DrawUp members who list this as their current affiliation.</p></div></div><div class="du-team-grid">${members.length?members.map(m=>`<article class="du-person"><div class="du-person-avatar">${m.avatar_url?`<img src="${esc(m.avatar_url)}" alt="">`:esc(initials(m.display_name))}</div><div><h3>${esc(m.display_name||'DrawUp Member')}</h3><p>${esc(m.title||'')}</p><small>${m.profile_verified?'✓ Verified profile':esc(m.username?'@'+m.username:'')}</small></div></article>`).join(''):'<div class="du-empty"><h2>No coworkers found yet.</h2></div>'}</div>`;}
async function renderAccount(w){const {data:c}=await client.from('arch_coach_credit_accounts').select('*').eq('user_id',currentUser.id).maybeSingle();const u=!!c?.unlimited_access;w.innerHTML=`<div class="du-work-head"><div><span class="du-kicker">ACCOUNT</span><h1>Plan & usage</h1><p>Billing, credits and account preferences.</p></div></div><div class="du-stats">${statCard('Plan',c?.plan_code||'Explore','Current plan')}${statCard('Monthly credits',u?'Unlimited':String(c?.monthly_credits_remaining??0),'Remaining')}${statCard('Purchased credits',u?'Unlimited':String(c?.purchased_credits_remaining??0),'Remaining')}${statCard('Access',u?'Unlimited':'Metered','Arch Coach')}</div><article class="du-glass"><h2>Signed in as</h2><p>${esc(currentUser?.email||'')}</p><button class="du-btn ghost" data-du-action="signout">Sign out</button></article>`;}

/* ------------------------------------------------------------------ boot */
function toolCtx(){return {client,user:currentUser,profile:currentProfile,esc,toast,modal,openPortalTab,fmtDate,isAdmin:isHq,token:async()=>(await client.auth.getSession()).data.session?.access_token||''};}
/* HQ is shown only when the database says this member is a DrawUp admin; every HQ
   read/write is also enforced by RLS and is_drawup_admin() on the server. */
let isHq=false;
async function loadHqFlag(){isHq=false;try{const {data}=await client.rpc('is_drawup_admin');isHq=data===true;}catch(_e){}document.querySelectorAll('[data-du-hq]').forEach(b=>b.hidden=!isHq);}
window.DrawUpPortalAfterAuth=user=>afterAuth(user,{fromSignIn:true});
window.DrawUpPortal={openPortal:t=>currentUser&&openPortal(t),openPortalTab:t=>currentUser&&openPortalTab(t),search:q=>{if(!currentUser)return false;openPortal('search');setTimeout(()=>renderSearch($('du-workspace-content'),q),60);return true;},renderFirmBase:w=>renderFirm(w),reloadProfile:async()=>{currentProfile=await loadProfile(currentUser);return currentProfile;},openFirm:s=>openFirmProfile(s),openProject:s=>openProjectProfile(s),isSignedIn:()=>!!currentUser,registerTab:(id,fn)=>{if(TABS.includes(id))EXT[id]=fn;},ctx:()=>toolCtx()};
async function init(){
  mount();
  client=await waitClient();if(!client){console.warn('DrawUp: Supabase is not configured.');return;}
  client.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT'){if(currentUser){currentUser=null;currentProfile=null;authRun=null;authUserId=null;closePortal();}return;}
    if((event==='SIGNED_IN'||event==='INITIAL_SESSION')&&session?.user&&!session.user.is_anonymous)setTimeout(()=>afterAuth(session.user,{fromSignIn:false}),0);
  });
  const {data}=await client.auth.getSession();
  if(data.session?.user&&!data.session.user.is_anonymous)afterAuth(data.session.user,{fromSignIn:false});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
