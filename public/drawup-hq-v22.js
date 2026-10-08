/* DrawUp V22 HQ founder delete tools.
 * Only the founder account (profiles.account_type = founder) sees anything from this file.
 * The browser only decides whether to SHOW controls: every delete goes to /api/hq/delete,
 * where the server checks the signed-in token again and answers 403 to everyone else.
 *  - Small "Delete" controls on posts, board posts, Playbook posts, comments, chat messages,
 *    member details and firm / project / team photos wherever they are shown.
 *  - HQ tab: Accounts (search, owned counts, delete with typed confirmation, leftover files),
 *    Content (recent items of every kind with Delete) and the Deletion log.
 */
(function(){
'use strict';
const S={founder:false,uid:null,checking:null};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const client=()=>window.drawupSupabaseClient;
async function token(){try{const {data}=await client().auth.getSession();return data.session?.access_token||'';}catch(_e){return '';}}
async function api(path,body){
  const t=await token();
  const r=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+t,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||('Request failed ('+r.status+')'));
  return j;
}
function toast(msg,bad){const c=window.DrawUpPortal?.ctx?.();if(c?.toast)return c.toast(msg,bad);let t=document.getElementById('hqx-toast');if(!t){t=document.createElement('div');t.id='hqx-toast';document.body.appendChild(t);}t.textContent=msg;t.className=bad?'bad open':'open';clearTimeout(t._h);t._h=setTimeout(()=>t.className='',bad?6000:2600);}
const fmtDate=d=>d?new Date(d).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'';

/* ---------------------------------------------------------------- founder check */
async function refresh(){
  const cl=client();if(!cl)return;
  let uid=null;try{const {data}=await cl.auth.getSession();const u=data.session?.user;uid=u&&!u.is_anonymous?u.id:null;}catch(_e){}
  if(uid===S.uid&&S.checked)return;
  S.uid=uid;S.checked=true;S.founder=false;
  if(uid){try{const j=await api('/api/hq?view=me');S.founder=j.founder===true&&S.uid===uid;}catch(_e){S.founder=false;}}
  document.documentElement.classList.toggle('hqx-founder',S.founder);
  if(!S.founder)document.querySelectorAll('.hqx-del,.hqx-tab').forEach(x=>x.remove());
  scan();
}

/* ---------------------------------------------------------------- confirm dialog */
function confirmBox({title,text,confirmWord,button}){
  return new Promise(res=>{
    const bg=document.createElement('div');bg.className='hqx-modal-bg';
    bg.innerHTML=`<div class="hqx-modal" role="dialog" aria-modal="true" aria-labelledby="hqx-mt"><span class="hqx-kick">DRAWUP HQ · FOUNDER</span><h2 id="hqx-mt">${esc(title)}</h2><p>${text}</p>${confirmWord?`<label class="hqx-lab">Type <b>${esc(confirmWord)}</b> to confirm<input id="hqx-cw" autocomplete="off" spellcheck="false"></label>`:''}<div class="hqx-modal-acts"><button type="button" class="hqx-btn ghost" data-x>Cancel</button><button type="button" class="hqx-btn danger" data-ok ${confirmWord?'disabled':''}>${esc(button||'Delete')}</button></div></div>`;
    document.body.appendChild(bg);
    const ok=bg.querySelector('[data-ok]'),inp=bg.querySelector('#hqx-cw');
    const done=v=>{bg.remove();document.removeEventListener('keydown',key);res(v);};
    const key=e=>{if(e.key==='Escape')done(false);};document.addEventListener('keydown',key);
    if(inp){inp.oninput=()=>ok.disabled=inp.value.trim().toLowerCase()!==confirmWord.toLowerCase();setTimeout(()=>inp.focus(),30);}else setTimeout(()=>ok.focus(),30);
    bg.querySelector('[data-x]').onclick=()=>done(false);
    bg.onclick=e=>{if(e.target===bg)done(false);};
    ok.onclick=()=>done(inp?inp.value.trim():true);
  });
}

/* ---------------------------------------------------------------- inline Delete controls */
const NAMES={connect_post:'this post',connect_comment:'this comment',message:'this message',detail:'this uploaded detail',detail_find:'this AI-found detail',photo_url:'this photo'};
const TARGETS=[
  {sel:'.dc-post[data-post]',kind:'connect_post',id:e=>e.dataset.post,at:e=>e.querySelector('.dc-post-head')||e.querySelector(':scope > h2')||e},
  {sel:'.pb-postrow[data-post]',kind:'connect_post',id:e=>e.dataset.post,at:e=>e.querySelector(':scope > div')||e},
  {sel:'.dc-cmt[data-cmt]',kind:'connect_comment',id:e=>e.dataset.cmt,at:e=>e.querySelector('.dc-cmt-body')||e},
  {sel:'.dc-msg[data-id]',kind:'message',id:e=>e.dataset.id,at:e=>e.querySelector('.dc-msg-meta')||e},
  {sel:'.dd21-card[data-kind="upload"][data-id]',kind:'detail',id:e=>e.dataset.id,at:e=>e.querySelector('.dd21-acts')||e.querySelector('.dd21-body')||e},
  {sel:'.dd21-card[data-kind="find"][data-id]',kind:'detail_find',id:e=>e.dataset.id,at:e=>e.querySelector('.dd21-acts')||e.querySelector('.dd21-body')||e},
  {sel:'.du-fp-photos figure,.du-live-photos figure,.du-sc-photos > button,.du-sc-gallery > button,.du-fu-gallery > button',kind:'photo_url',url:e=>e.querySelector('img')?.src,at:e=>e,overlay:true},
];
function addControl(el,t){
  el.dataset.hqx='1';
  const id=t.id?t.id(el):null,url=t.url?t.url(el):null;if(!id&&!url)return;
  // Gallery tiles are buttons themselves, so the control is a span with role=button (no nested buttons).
  const b=document.createElement(t.overlay?'span':'button');
  if(t.overlay){b.setAttribute('role','button');b.tabIndex=0;}else b.type='button';
  b.className='hqx-del'+(t.overlay?' hqx-over':'');b.textContent='Delete';b.title='Founder: delete '+(NAMES[t.kind]||'this item');
  b.setAttribute('aria-label','Delete '+(NAMES[t.kind]||'item')+' (DrawUp founder)');
  const go=async e=>{e.preventDefault();e.stopPropagation();
    const ok=await confirmBox({title:'Delete '+(NAMES[t.kind]||'this item')+'?',text:'This removes it for everyone and deletes its files from storage when nothing else uses them. It cannot be undone. The deletion is written to the HQ deletion log.'});
    if(!ok)return;b.textContent='Deleting…';b.classList.add('busy');
    try{await api('/api/hq/delete',t.kind==='photo_url'?{kind:'photo_url',url}:{kind:t.kind,id});
      el.classList.add('hqx-gone');setTimeout(()=>el.remove(),260);toast('Deleted.');
    }catch(err){b.textContent='Delete';b.classList.remove('busy');toast(err.message||String(err),true);}
  };
  b.addEventListener('click',go);b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')go(e);});
  if(t.overlay){el.classList.add('hqx-rel');el.appendChild(b);}else t.at(el).appendChild(b);
}
function scan(){
  if(!S.founder)return;
  for(const t of TARGETS)document.querySelectorAll(t.sel).forEach(el=>{if(!el.dataset.hqx)addControl(el,t);});
  hqTabs();
}
let queued=false;
const mo=new MutationObserver(()=>{if(queued||!S.founder)return;queued=true;requestAnimationFrame(()=>{queued=false;scan();});});

/* ---------------------------------------------------------------- HQ panes */
const PANES=[['hqx-accounts','Accounts'],['hqx-content','Content'],['hqx-log','Deletion log']];
const pane=()=>new URLSearchParams(location.hash.split('?')[1]||'').get('pane')||'';
function goPane(p,extra){history.replaceState(null,'','#portal/hq?pane='+p+(extra||''));window.DrawUpPortal?.openPortalTab?.('hq');}
function hqTabs(){
  const tabs=document.querySelector('#du-workspace-content .du-hq-tabs');if(!tabs||tabs.dataset.hqx)return;
  tabs.dataset.hqx='1';
  const cur=pane();
  for(const [k,l] of PANES){const b=document.createElement('button');b.type='button';b.className='hqx-tab'+(k===cur?' active':'');b.dataset.hqxPane=k;b.textContent=l;b.onclick=()=>goPane(k);tabs.appendChild(b);}
  const body=document.getElementById('hq-body');
  if(body&&cur.startsWith('hqx-')){tabs.querySelectorAll('[data-hq-pane]').forEach(x=>x.classList.remove('active'));renderPane(cur,body);}
}
async function renderPane(p,body){
  body.innerHTML='<article class="du-glass hqx-pane"><p class="hqx-muted">Loading…</p></article>';
  try{if(p==='hqx-accounts')await accountsPane(body);else if(p==='hqx-content')await contentPane(body);else await logPane(body);}
  catch(e){body.innerHTML=`<article class="du-glass hqx-pane"><h2>Founder only</h2><p>${esc(e.message||e)}</p></article>`;}
}
const LABELS={connect_posts:'Posts',connect_comments:'Comments',connect_chat_messages:'Chat messages',direct_messages:'Direct messages',connect_likes:'Likes',details:'Details',detail_assets:'Detail files',storage_files:'Files',coach_threads:'Coach threads',arch_coach_jobs:'Coach jobs',arch_coach_xp_events:'XP events',arch_coach_profiles:'Coach profile',playbook_progress:'Playbook progress',playbook_attempts:'Playbook attempts',playbook_awards:'Playbook awards',playbook_members:'Playbook',firm_members:'Firm memberships',firm_unit_members:'Team memberships',drawings:'Drawings',draw_markups:'Markups',draw_shares:'Shares',check_reviews:'Check reviews',swap_generations:'Swap images',swap_threads:'Swap threads',project_threads:'Projects',career_timeline:'Experience',connections:'Connections',campus_posts:'Campus posts',drawup_notifications:'Notifications'};
const SKIP=new Set(['arch_coach_usage','arch_coach_credit_accounts','arch_coach_credit_ledger','swap_messages','thread_participants','connect_chat_members','detail_find_events','drawup_searches']);
function ownedChips(o){const e=Object.entries(o||{}).filter(([k,n])=>n>0&&!SKIP.has(k)).sort((a,b)=>b[1]-a[1]);if(!e.length)return '<span class="hqx-chip dim">Nothing published</span>';return e.slice(0,8).map(([k,n])=>`<span class="hqx-chip">${esc(LABELS[k]||k.replace(/_/g,' '))} <b>${n}</b></span>`).join('')+(e.length>8?`<span class="hqx-chip dim">+${e.length-8} more</span>`:'');}
async function accountsPane(body){
  const q=new URLSearchParams(location.hash.split('?')[1]||'').get('q')||'';
  const [acc,files]=await Promise.all([api('/api/hq?view=accounts&q='+encodeURIComponent(q)),api('/api/hq?view=files')]);
  const list=acc.accounts||[];
  body.innerHTML=`<article class="du-glass hqx-pane"><div class="hqx-head"><div><span class="hqx-kick">FOUNDER ONLY</span><h2>Accounts</h2><p class="hqx-muted">${list.length} account${list.length===1?'':'s'}${q?' matching “'+esc(q)+'”':''}. Deleting an account removes its posts, messages, files and memberships. Firms, projects and universities it created stay for everyone else.</p></div>
    <form class="hqx-search" id="hqx-af"><input id="hqx-aq" type="search" placeholder="Search name or email" value="${esc(q)}" aria-label="Search accounts"><button class="hqx-btn ghost">Search</button></form></div>
    <div class="hqx-files"><div><b>Leftover files</b><span class="hqx-muted">${files.count} file${files.count===1?'':'s'} (${(files.bytes/1048576).toFixed(1)} MB) still in storage from accounts that no longer exist and used by nothing.${files.in_use?' '+files.in_use+' more are kept because a firm, project or post still shows them.':''}</span></div><button type="button" class="hqx-btn danger sm" id="hqx-lf" ${files.count?'':'disabled'}>Remove leftover files</button></div>
    <div class="hqx-list">${list.map(a=>`<div class="hqx-acc" data-acc="${esc(a.id)}"><div class="hqx-acc-main"><b>${esc(a.display_name||(a.is_anonymous?'Guest':'(no name)'))}</b><small>${esc(a.email||'Guest · no email')}</small><div class="hqx-meta"><span class="hqx-type t-${esc(a.account_type)}">${esc(a.account_type)}${a.is_anonymous?' · guest':''}</span><span>Joined ${esc(fmtDate(a.created_at))}</span></div><div class="hqx-chips">${ownedChips(a.owned)}</div></div><div class="hqx-acc-act">${a.protected||a.is_self?'<span class="hqx-chip lock">Protected</span>':`<button type="button" class="hqx-btn danger sm" data-del-acc="${esc(a.id)}">Delete account</button>`}</div></div>`).join('')||'<p class="hqx-muted">No accounts found.</p>'}</div></article>`;
  body.querySelector('#hqx-af').onsubmit=e=>{e.preventDefault();goPane('hqx-accounts','&q='+encodeURIComponent(body.querySelector('#hqx-aq').value.trim()));};
  body.querySelector('#hqx-lf').onclick=async()=>{const ok=await confirmBox({title:'Remove leftover files?',text:`Deletes ${files.count} file(s) left by removed accounts, except files a firm, project or post still uses.`,button:'Remove files'});if(!ok)return;try{const r=await api('/api/hq/delete',{kind:'leftover_files'});toast(r.files_removed+' file(s) removed'+(r.files_kept?', '+r.files_kept+' kept because they are in use':'')+'.');goPane('hqx-accounts',q?'&q='+encodeURIComponent(q):'');}catch(e){toast(e.message,true);}};
  body.querySelectorAll('[data-del-acc]').forEach(b=>b.onclick=async()=>{
    const a=list.find(x=>x.id===b.dataset.delAcc);if(!a)return;
    const word=a.email||'DELETE';
    const typed=await confirmBox({title:'Delete this account?',text:`<b>${esc(a.display_name||a.email||'Guest account')}</b> ${a.email?'('+esc(a.email)+')':''}<br>This deletes the sign in, the profile and everything this account published or uploaded: <span class="hqx-chips">${ownedChips(a.owned)}</span><br>It cannot be undone.`,confirmWord:word,button:'Delete account'});
    if(!typed)return;b.disabled=true;b.textContent='Deleting…';
    try{const r=await api('/api/hq/delete',{kind:'account',id:a.id,confirm:typed});toast('Account deleted'+(r.files_removed?' with '+r.files_removed+' file(s)':'')+'.');const row=b.closest('.hqx-acc');row.classList.add('hqx-gone');setTimeout(()=>row.remove(),260);}
    catch(e){b.disabled=false;b.textContent='Delete account';toast(e.message,true);}
  });
}
async function contentPane(body){
  const sp=new URLSearchParams(location.hash.split('?')[1]||'');const kind=sp.get('kind')||'connect_post',q=sp.get('q')||'';
  const r=await api('/api/hq?view=content&kind='+encodeURIComponent(kind)+'&q='+encodeURIComponent(q));
  body.innerHTML=`<article class="du-glass hqx-pane"><div class="hqx-head"><div><span class="hqx-kick">FOUNDER ONLY</span><h2>Content</h2><p class="hqx-muted">The newest 60 items of each kind. Deleting also removes the item's files from storage when nothing else uses them.</p></div>
    <form class="hqx-search" id="hqx-cf"><select id="hqx-ck" aria-label="Kind of content">${r.kinds.map(k=>`<option value="${esc(k.key)}"${k.key===kind?' selected':''}>${esc(k.title)}</option>`).join('')}</select><input id="hqx-cq" type="search" placeholder="Search text" value="${esc(q)}" aria-label="Search content"><button class="hqx-btn ghost">Show</button></form></div>
    <div class="hqx-list">${r.items.map(x=>`<div class="hqx-item"><div><b>${esc(x.label)}</b><small>${[x.author,fmtDate(x.created_at)].filter(Boolean).map(esc).join(' · ')}</small></div><button type="button" class="hqx-btn danger sm" data-del-item="${esc(x.id)}">Delete</button></div>`).join('')||'<p class="hqx-muted">Nothing here.</p>'}</div></article>`;
  const sub=()=>goPane('hqx-content','&kind='+encodeURIComponent(body.querySelector('#hqx-ck').value)+'&q='+encodeURIComponent(body.querySelector('#hqx-cq').value.trim()));
  body.querySelector('#hqx-cf').onsubmit=e=>{e.preventDefault();sub();};body.querySelector('#hqx-ck').onchange=sub;
  body.querySelectorAll('[data-del-item]').forEach(b=>b.onclick=async()=>{const ok=await confirmBox({title:'Delete this '+r.title.toLowerCase()+'?',text:'It is removed for everyone and cannot be undone.'});if(!ok)return;b.disabled=true;try{await api('/api/hq/delete',{kind,id:b.dataset.delItem});const row=b.closest('.hqx-item');row.classList.add('hqx-gone');setTimeout(()=>row.remove(),260);toast('Deleted.');}catch(e){b.disabled=false;toast(e.message,true);}});
}
async function logPane(body){
  const r=await api('/api/hq?view=audit');
  body.innerHTML=`<article class="du-glass hqx-pane"><span class="hqx-kick">FOUNDER ONLY</span><h2>Deletion log</h2><p class="hqx-muted">Every account, post and file removed from HQ or by the cleanup SQL.</p><div class="hqx-list">${(r.items||[]).map(x=>`<div class="hqx-item"><div><b>${esc(x.label||x.target_id||x.kind)}</b><small>${esc(x.kind.replace(/_/g,' '))} · ${esc(new Date(x.created_at).toLocaleString())} · by ${esc(x.actor_label||'unknown')}${x.detail?.files_removed?.length!=null?' · '+x.detail.files_removed.length+' file(s)':x.detail?.files_removed!=null?' · '+x.detail.files_removed+' file(s)':''}</small></div></div>`).join('')||'<p class="hqx-muted">Nothing deleted yet.</p>'}</div></article>`;
}

/* ---------------------------------------------------------------- boot */
(async function boot(){
  for(let i=0;i<200&&!client();i++)await sleep(100);
  const cl=client();if(!cl)return;
  cl.auth.onAuthStateChange(()=>{S.checked=false;setTimeout(refresh,0);});
  mo.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>setTimeout(scan,50));
  refresh();
})();
})();
