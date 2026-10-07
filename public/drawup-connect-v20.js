/* DrawUp V20 · Connect hub
 *
 * Connect is the social side of DrawUp, laid out like a messenger:
 *  - Messages: one to one direct messages (existing direct_messages table)
 *  - Group chats: start a chat, add people, leave
 *  - Firm chats: one chat per firm, members are that firm's DrawUp members
 *  - Timeline: projects, photos, event flyers from the AEC community
 *  - Boards: discussion threads anyone signed in can start or reply to
 * Runs in the Portal (registerTab('connect')) and on the public #page-connect section.
 * Signed-out visitors can read the Timeline and Boards. Every rule is enforced by RLS.
 */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function db(){for(let i=0;i<100;i++){if(window.drawupSupabaseClient)return window.drawupSupabaseClient;await sleep(100);}return null;}
function uuid(){return (crypto.randomUUID&&crypto.randomUUID())||('x'+Date.now().toString(16)+Math.random().toString(16).slice(2));}
const initials=n=>(String(n||'DU').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('')||'DU').toUpperCase();
function linkify(t){return esc(t).replace(/(https?:\/\/[^\s<]+[^\s<.,;:)\]])/g,u=>`<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\//,'').slice(0,60)}</a>`).replace(/\n/g,'<br>');}
function ago(d){const s=(Date.now()-new Date(d))/1000;if(s<60)return 'now';if(s<3600)return Math.floor(s/60)+'m';if(s<86400)return Math.floor(s/3600)+'h';if(s<604800)return Math.floor(s/86400)+'d';return new Date(d).toLocaleDateString(undefined,{month:'short',day:'numeric'});}
const clock=d=>new Date(d).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const av=(p,cls='')=>`<span class="dc-av ${cls}">${p?.avatar_url?`<img src="${esc(p.avatar_url)}" alt="">`:esc(initials(p?.display_name||p?.username))}</span>`;
const nameOf=p=>p?.display_name||p?.username||'DrawUp member';
const cleanQ=q=>String(q||'').replace(/[,()%*\\:."']/g,' ').trim().slice(0,60);
const SEEN_KEY='drawup_connect_seen_v20',PENDING_KEY='drawup_connect_pending_dm',COMPOSE_KEY='drawup_connect_pending_compose';
const seen=()=>{try{return JSON.parse(localStorage.getItem(SEEN_KEY)||'{}');}catch(_e){return {};}};
const markSeen=(id,t)=>{try{const s=seen();s[id]=t||new Date().toISOString();localStorage.setItem(SEEN_KEY,JSON.stringify(s));}catch(_e){}};

const SECTIONS=[['messages','Messages'],['groups','Group chats'],['firms','Firm chats'],['timeline','Timeline'],['boards','Boards']];
const TOPICS=['Update','Project','Photos','Event','Flyer','Hiring'];
const BOARD_CATS=['Emerging professionals','Codes + standards','Practice + business','Construction + GCs','Vendors + products','Software + tools','General'];
const REASONS=['Spam or scam','Harassment or hate','Inappropriate content','False or misleading','Something else'];
const PROFILE_COLS='id,display_name,username,avatar_url,title,primary_affiliation_name';

function toastFn(ctx){return ctx?.toast||((msg,bad)=>{let t=$('du-toast');if(!t){t=document.createElement('div');t.id='du-toast';t.className='du-toast';document.body.appendChild(t);}t.textContent=msg;t.dataset.state=bad?'bad':'good';t.classList.add('open');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('open'),bad?6000:2600);});}

/* connect_posts.university_name arrives with migration 0031. Until then the field stays hidden and is never sent. */
let schoolCol=null;
async function hasSchoolColumn(){if(schoolCol!==null)return schoolCol;const c=await db();if(!c)return false;const {error}=await c.from('connect_posts').select('university_name').limit(1);schoolCol=!error;return schoolCol;}
async function upload(c,uid,file,sub){
  if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type))throw new Error('Use a JPG, PNG, WebP or GIF image.');
  if(file.size>12*1024*1024)throw new Error('Image is larger than 12 MB.');
  const ext={'image/png':'png','image/webp':'webp','image/gif':'gif'}[file.type]||'jpg';
  const path=`${uid}/connect/${sub}/${uuid()}.${ext}`;
  const up=await c.storage.from('drawup-files').upload(path,file,{contentType:file.type});if(up.error)throw up.error;
  return c.storage.from('drawup-files').getPublicUrl(path).data.publicUrl;
}

/* ------------------------------------------------------------------ small overlays */
function sheet(html,cls=''){
  document.querySelector('.dc-overlay')?.remove();
  const ov=document.createElement('div');ov.className='dc-overlay';ov.innerHTML=`<div class="dc-sheet ${cls}" role="dialog" aria-modal="true"><button type="button" class="dc-x" aria-label="Close">×</button>${html}</div>`;
  document.body.appendChild(ov);const close=()=>ov.remove();
  ov.querySelector('.dc-x').onclick=close;ov.onclick=e=>{if(e.target===ov)close();};
  document.addEventListener('keydown',function k(e){if(e.key==='Escape'){close();document.removeEventListener('keydown',k);}});
  return {el:ov.querySelector('.dc-sheet'),close};
}
function lightbox(url){const s=sheet(`<img class="dc-lightbox" src="${esc(url)}" alt=""><a class="dc-link" href="${esc(url)}" target="_blank" rel="noopener">Open full size ↗</a>`,'dc-sheet-img');return s;}

/* ------------------------------------------------------------------ the hub */
function createHub(host,opts){
  const H={host,mode:opts.mode,ctx:opts.ctx||null,toast:toastFn(opts.ctx),c:null,user:null,me:null,
    section:null,sel:null,profiles:new Map(),timer:null,lastSig:'',listTick:0,boardCat:'All',dmThreads:[],chats:[]};
  const root=document.createElement('div');root.className='dc-hub';root.dataset.mode=opts.mode;H.root=root;
  const alive=()=>root.isConnected;
  const visible=()=>alive()&&root.offsetParent!==null&&document.visibilityState!=='hidden';

  async function profilesFor(ids){
    const need=[...new Set(ids.filter(id=>id&&!H.profiles.has(id)))];
    if(need.length){const {data}=await H.c.from('profiles').select(PROFILE_COLS).in('id',need);(data||[]).forEach(p=>H.profiles.set(p.id,p));}
    return H.profiles;
  }
  const signIn=()=>{const b=$('drawup-signin');if(b)b.click();else H.toast('Sign in to take part.',true);};
  const signInCard=(what)=>`<div class="dc-empty"><span class="du-kicker">CONNECT</span><h2>Sign in to ${esc(what)}.</h2><p>Anyone can read the Timeline and Boards. Sign in to message people, join group and firm chats, post and reply.</p><button type="button" class="du-btn dc-btn primary" data-dc-signin>Sign in</button></div>`;

  async function boot(){
    H.c=await db();if(!H.c){host.innerHTML='<div class="dc-empty"><h2>Connect is unavailable.</h2><p>The DrawUp database is not connected.</p></div>';return;}
    const {data}=await H.c.auth.getSession();H.user=data.session?.user&&!data.session.user.is_anonymous?data.session.user:null;
    if(H.user){await profilesFor([H.user.id]);H.me=H.profiles.get(H.user.id)||{id:H.user.id};}
    let want=null;try{want=sessionStorage.getItem('drawup_connect_section_'+H.mode);}catch(_e){}
    H.section=opts.section||want||(H.user?'messages':'timeline');
    if(!SECTIONS.some(s=>s[0]===H.section))H.section='timeline';
    let pend=null;if(H.user){pend=Connect.pending;if(!pend){try{pend=JSON.parse(sessionStorage.getItem(PENDING_KEY)||'null');}catch(_e){}}}
    let pc=null;if(H.user){pc=Connect.pendingCompose;if(!pc){try{pc=JSON.parse(sessionStorage.getItem(COMPOSE_KEY)||'null');}catch(_e){}}}
    if(pc){Connect.pendingCompose=null;try{sessionStorage.removeItem(COMPOSE_KEY);}catch(_e){}H.section='timeline';H.prefill=pc;}
    if(pend&&pend.id&&pend.id!==H.user.id){Connect.pending=null;try{sessionStorage.removeItem(PENDING_KEY);}catch(_e){}H.section='messages';await profilesFor([pend.id]);if(!H.profiles.has(pend.id))H.profiles.set(pend.id,{id:pend.id,display_name:pend.name||'DrawUp member'});}else pend=null;
    host.innerHTML='';host.appendChild(root);
    root.innerHTML=`<div class="dc-head"><div><span class="du-kicker">CONNECT</span><h1>Reach out. Draw it up together.</h1><p>Messages, group and firm chats, a timeline for projects, photos and event flyers, and discussion boards open to the whole AEC community: architects, students, engineers, general contractors and vendors.</p></div>${H.user?`<div class="dc-me">${av(H.me)}<span><b>${esc(nameOf(H.me))}</b><small>${esc(H.me?.title||H.me?.primary_affiliation_name||'DrawUp member')}</small></span></div>`:`<button type="button" class="du-btn dc-btn primary" data-dc-signin>Sign in to connect</button>`}</div>
    <nav class="dc-tabs" role="tablist">${SECTIONS.map(([k,l])=>`<button type="button" role="tab" data-dc-sec="${k}">${l}<i class="dc-badge" data-dc-badge="${k}" hidden></i></button>`).join('')}</nav>
    <div class="dc-body"></div>`;
    root.querySelectorAll('[data-dc-sec]').forEach(b=>b.onclick=()=>go(b.dataset.dcSec));
    root.addEventListener('click',e=>{if(e.target.closest('[data-dc-signin]')){e.preventDefault();signIn();}});
    go(H.section,pend?pend.id:null);
    clearInterval(H.timer);H.timer=setInterval(poll,4000);
    refreshBadges();
  }

  function go(sec,sel){
    H.section=sec;H.sel=sel||null;H.lastSig='';try{sessionStorage.setItem('drawup_connect_section_'+H.mode,sec);}catch(_e){}
    root.querySelectorAll('[data-dc-sec]').forEach(b=>{b.classList.toggle('active',b.dataset.dcSec===sec);b.setAttribute('aria-selected',b.dataset.dcSec===sec);});
    const tabs=root.querySelector('.dc-tabs'),ab=tabs.querySelector('.active');if(ab)tabs.scrollLeft=Math.max(0,ab.offsetLeft-tabs.clientWidth/2+ab.offsetWidth/2);
    const body=root.querySelector('.dc-body');body.className='dc-body dc-'+sec;refreshBadges();
    if(['messages','groups','firms'].includes(sec)){
      if(!H.user){body.innerHTML=signInCard(sec==='messages'?'send messages':sec==='groups'?'join group chats':'open your firm chat');return;}
      body.innerHTML=`<div class="dc-split"><aside class="dc-list"><div class="dc-list-head"></div><div class="dc-items"><div class="dc-loading">Loading…</div></div></aside><section class="dc-conv"><div class="dc-conv-empty"><span class="du-kicker">${sec==='messages'?'MESSAGES':sec==='groups'?'GROUP CHATS':'FIRM CHATS'}</span><h2>${sec==='messages'?'Pick a conversation or start a new one.':sec==='groups'?'Pick a group or start one.':'Pick a firm chat.'}</h2></div></section></div>`;
      return loadList(true);
    }
    if(sec==='timeline')return renderTimeline(body);
    if(sec==='boards')return renderBoards(body);
  }

  /* ---------------- chat lists ---------------- */
  async function loadList(first){
    const body=root.querySelector('.dc-body');const sec=H.section;if(!body.querySelector('.dc-list'))return;
    const head=body.querySelector('.dc-list-head'),items=body.querySelector('.dc-items');
    if(sec==='messages'){
      if(first)head.innerHTML=`<button type="button" class="du-btn dc-btn primary dc-new" data-dc-new>＋ New message</button>`;
      const me=H.user.id;
      const {data,error}=await H.c.from('direct_messages').select('id,sender_id,recipient_id,body,image_url,read_at,created_at').or(`sender_id.eq.${me},recipient_id.eq.${me}`).order('created_at',{ascending:false}).limit(500);
      if(error){items.innerHTML=`<p class="dc-err">${esc(error.message)}</p>`;return;}
      const by=new Map();(data||[]).forEach(m=>{const o=m.sender_id===me?m.recipient_id:m.sender_id;if(!by.has(o))by.set(o,{other:o,last:m,unread:0});if(m.recipient_id===me&&!m.read_at)by.get(o).unread++;});
      if(H.sel&&!by.has(H.sel))by.set(H.sel,{other:H.sel,last:null,unread:0});
      await profilesFor([...by.keys()]);
      H.dmThreads=[...by.values()];
      if(H.section!=='messages')return;
      items.innerHTML=H.dmThreads.length?H.dmThreads.map(t=>{const p=H.profiles.get(t.other);return `<button type="button" class="dc-item ${H.sel===t.other?'active':''}" data-dc-open="${t.other}">${av(p)}<span class="dc-item-main"><b>${esc(nameOf(p))}</b><small>${t.last?(t.last.sender_id===me?'You: ':'')+esc(t.last.image_url&&t.last.body==='Photo'?'Photo':t.last.body):'New conversation'}</small></span><span class="dc-item-side">${t.last?`<time>${ago(t.last.created_at)}</time>`:''}${t.unread?`<i class="dc-count">${t.unread}</i>`:''}</span></button>`;}).join(''):`<div class="dc-list-empty"><p>No conversations yet.</p><p>Message a classmate, a coworker, a firm you admire, a GC or a vendor.</p></div>`;
    }else{
      // V21: Firm chats has two sides. Internal = your firm chat, internal groups and DMs with people on your roster.
      // External = collaborations with other firms and with individuals outside your firm.
      const side=H.firmSide||(H.firmSide='internal');
      if(first||sec==='firms')head.innerHTML=sec==='groups'?`<button type="button" class="du-btn dc-btn primary dc-new" data-dc-new>＋ New group chat</button>`:`<div class="dc-side" role="tablist" aria-label="Firm chats"><button type="button" role="tab" data-dc-side="internal" class="${side==='internal'?'active':''}" aria-selected="${side==='internal'}">Internal</button><button type="button" role="tab" data-dc-side="external" class="${side==='external'?'active':''}" aria-selected="${side==='external'}">External</button></div><p class="dc-list-note">${side==='internal'?'Just your firm: the firm chat, team groups and one-on-ones with people on your roster.':'Collaborations with other firms (their roster joins) and people outside your firm.'}</p><button type="button" class="du-btn dc-btn primary dc-new" data-dc-new>${side==='internal'?'＋ New internal group':'＋ New collaboration'}</button>`;
      let {data,error}=await H.c.rpc('connect_my_chats_v21');
      if(error&&/connect_my_chats_v21|function/i.test(error.message||''))({data,error}=await H.c.rpc('connect_my_chats'));
      if(error){items.innerHTML=`<p class="dc-err">${esc(error.message)}</p>`;return;}
      H.chats=data||[];if(H.section!==sec)return;
      const list=H.chats.filter(c=>sec==='groups'?c.kind==='group'&&!c.scope:side==='internal'?(c.kind==='firm'||c.scope==='internal'):c.scope==='external'),s=seen();
      if(sec==='firms'){await firmDMs(side);if(H.section!==sec||H.firmSide!==side)return;}
      items.innerHTML=list.length?list.map(ch=>{const unread=ch.last_body&&(!s[ch.id]||new Date(ch.last_message_at)>new Date(s[ch.id]))&&H.sel!==ch.id;return `<button type="button" class="dc-item ${H.sel===ch.id?'active':''}" data-dc-open="${ch.id}"><span class="dc-av ${ch.kind==='firm'?'firm':'group'}">${esc(initials(ch.name||'Group'))}</span><span class="dc-item-main"><b>${esc(ch.name||((ch.partner_firms||[]).join(' · '))||'Group chat')}</b><small>${ch.scope==='external'&&(ch.partner_firms||[]).length?'<span class="dc-tag">'+esc(ch.partner_firms.join(' · '))+'</span> ':''}${esc(ch.last_body||(ch.member_count+' member'+(ch.member_count===1?'':'s')))}</small></span><span class="dc-item-side"><time>${ago(ch.last_message_at)}</time>${unread?'<i class="dc-dot"></i>':''}</span></button>`;}).join('')+(sec==='firms'?dmItemsHTML():''):(sec==='firms'&&H.firmDMs?.length?dmItemsHTML():sec==='groups'?`<div class="dc-list-empty"><p>No group chats yet.</p><p>Start one for a studio team, a project, a study group or an event crew.</p></div>`:(H.chats||[]).some(c=>c.kind==='firm')?`<div class="dc-list-empty"><p>${H.firmSide==='external'?'No collaborations yet.':'No internal chats yet.'}</p><p>${H.firmSide==='external'?'Start one with a consultant, a GC, a partner firm or anyone outside your firm.':'Start a group for a studio, a project team or QA/QC.'}</p></div>`:`<div class="dc-list-empty"><p>You are not on a firm roster yet.</p><p>Firm chats appear once you are a member of a firm on DrawUp. Add your current firm in Profile.</p>${H.mode==='portal'?'<button type="button" class="du-btn dc-btn ghost" data-portal-tab="profile">Open Profile</button>':''}</div>`);
    }
    items.querySelectorAll('[data-dc-open]').forEach(b=>b.onclick=()=>openThread(b.dataset.dcOpen));
    items.querySelectorAll('[data-dc-dm]').forEach(b=>b.onclick=()=>go('messages',b.dataset.dcDm));
    head.querySelectorAll('[data-dc-side]').forEach(b=>b.onclick=()=>{if(H.firmSide===b.dataset.dcSide)return;H.firmSide=b.dataset.dcSide;H.sel=null;const conv=root.querySelector('.dc-conv');if(conv)conv.innerHTML=`<div class="dc-conv-empty"><span class="du-kicker">FIRM CHATS · ${H.firmSide.toUpperCase()}</span><h2>Pick a chat or start one.</h2></div>`;loadList(true);});
    const nb=head.querySelector('[data-dc-new]');if(nb)nb.onclick=()=>sec==='messages'?newMessage():sec==='firms'?newFirmChat(H.firmSide):newGroup();
    if(first){if(H.sel&&items.querySelector(`[data-dc-open="${H.sel}"]`))openThread(H.sel);else if(window.innerWidth>760){const f=items.querySelector('[data-dc-open]');if(f)openThread(f.dataset.dcOpen);}}
  }

  /* ---------------- conversation ---------------- */
  function openThread(id){
    H.sel=id;H.lastSig='';
    root.querySelectorAll('.dc-item').forEach(x=>x.classList.toggle('active',x.dataset.dcOpen===id));
    const split=root.querySelector('.dc-split');split.classList.add('dc-show-conv');
    const conv=split.querySelector('.dc-conv');
    let title='',sub='',actions='';
    if(H.section==='messages'){const p=H.profiles.get(id);title=nameOf(p);sub=[p?.title,p?.primary_affiliation_name].filter(Boolean).join(' · ')||'Direct message';actions=`<button type="button" class="dc-icon" data-dc-profile="${id}" title="View profile">Profile</button>`;}
    else{const ch=H.chats.find(c=>c.id===id)||{};title=ch.name||'Group chat';sub=ch.kind==='firm'?'Firm chat · '+ch.member_count+' member'+(ch.member_count===1?'':'s'):ch.scope?(ch.scope==='external'?'Collaboration'+((ch.partner_firms||[]).length?' with '+ch.partner_firms.join(', '):''):'Internal')+' · '+ch.member_count+' member'+(ch.member_count===1?'':'s'):ch.member_count+' member'+(ch.member_count===1?'':'s');actions=`<button type="button" class="dc-icon" data-dc-roster title="Members">Members</button>`;}
    conv.innerHTML=`<div class="dc-conv-head"><button type="button" class="dc-back" aria-label="Back to list">‹</button><div class="dc-conv-title">${H.section==='messages'?av(H.profiles.get(id)):`<span class="dc-av ${H.section==='firms'?'firm':'group'}">${esc(initials(title))}</span>`}<span><b>${esc(title)}</b><small>${esc(sub)}</small></span></div><div class="dc-conv-actions">${actions}</div></div>
    <div class="dc-msgs" aria-live="polite"><div class="dc-loading">Loading…</div></div>${composerHTML('Write a message…')}`;
    conv.querySelector('.dc-back').onclick=()=>{split.classList.remove('dc-show-conv');H.sel=null;};
    conv.querySelector('[data-dc-profile]')?.addEventListener('click',()=>viewProfile(id));
    conv.querySelector('[data-dc-roster]')?.addEventListener('click',()=>roster(id));
    bindComposer(conv.querySelector('.dc-composer'),async(text,files)=>{
      let image_url=null;if(files[0])image_url=await upload(H.c,H.user.id,files[0],H.section==='messages'?'dm':'chat');
      if(H.section==='messages'){const {error}=await H.c.from('direct_messages').insert({sender_id:H.user.id,recipient_id:id,body:text||'Photo',image_url});if(error)throw error;}
      else{const {error}=await H.c.from('connect_chat_messages').insert({chat_id:id,author_id:H.user.id,body:text||null,image_url});if(error)throw error;}
      await loadMsgs(true);loadList(false);
    });
    loadMsgs(true);
  }

  async function loadMsgs(force){
    const id=H.sel,sec=H.section,box=root.querySelector('.dc-msgs');if(!id||!box)return;
    let rows;
    if(sec==='messages'){
      const me=H.user.id;
      const {data,error}=await H.c.from('direct_messages').select('id,sender_id,recipient_id,body,image_url,read_at,created_at').or(`and(sender_id.eq.${me},recipient_id.eq.${id}),and(sender_id.eq.${id},recipient_id.eq.${me})`).order('created_at',{ascending:false}).limit(300);
      if(error){box.innerHTML=`<p class="dc-err">${esc(error.message)}</p>`;return;}
      rows=(data||[]).reverse().map(m=>({id:m.id,author:m.sender_id,body:m.image_url&&m.body==='Photo'?'':m.body,image_url:m.image_url,created_at:m.created_at,read:m.read_at}));
      if(rows.some(m=>m.author===id&&!m.read))H.c.rpc('connect_mark_dm_read',{p_other:id}).then(()=>refreshBadges());
    }else{
      const {data,error}=await H.c.from('connect_chat_messages').select('id,author_id,body,image_url,created_at').eq('chat_id',id).order('created_at',{ascending:false}).limit(300);
      if(error){box.innerHTML=`<p class="dc-err">${esc(error.message)}</p>`;return;}
      rows=(data||[]).reverse().map(m=>({id:m.id,author:m.author_id,body:m.body,image_url:m.image_url,created_at:m.created_at}));
      await profilesFor(rows.map(r=>r.author));
      if(rows.length)markSeen(id,rows[rows.length-1].created_at);else markSeen(id);
    }
    if(H.sel!==id||H.section!==sec)return;
    const sig=rows.map(r=>r.id).join(',');if(!force&&sig===H.lastSig)return;H.lastSig=sig;
    const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<120;
    const me=H.user.id;let prevAuthor=null,prevDay='';
    box.innerHTML=rows.length?rows.map(m=>{const mine=m.author===me,p=H.profiles.get(m.author),day=new Date(m.created_at).toDateString();
      const dayRow=day!==prevDay?`<div class="dc-day">${new Date(m.created_at).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</div>`:'';
      const showName=!mine&&sec!=='messages'&&(prevAuthor!==m.author||dayRow);prevAuthor=m.author;prevDay=day;
      return `${dayRow}<div class="dc-msg ${mine?'mine':''}" data-id="${m.id}">${!mine&&sec!=='messages'?(showName?av(p,'sm'):'<span class="dc-av-gap"></span>'):''}<div class="dc-bubble-wrap">${showName?`<span class="dc-msg-name">${esc(nameOf(p))}</span>`:''}<div class="dc-bubble">${m.image_url?`<img src="${esc(m.image_url)}" alt="Shared photo" data-dc-img>`:''}${m.body?`<span>${linkify(m.body)}</span>`:''}</div><span class="dc-msg-meta"><time title="${esc(clock(m.created_at))}">${ago(m.created_at)}</time><button type="button" class="dc-mini" data-dc-msgact="${mine?'delete':'report'}" data-id="${m.id}">${mine?'Delete':'Report'}</button></span></div></div>`;}).join(''):`<div class="dc-conv-empty small"><p>No messages yet. Say hello.</p></div>`;
    box.querySelectorAll('[data-dc-img]').forEach(i=>i.onclick=()=>lightbox(i.src));
    box.querySelectorAll('[data-dc-msgact]').forEach(b=>b.onclick=async()=>{
      const tbl=sec==='messages'?'direct_messages':'connect_chat_messages';
      if(b.dataset.dcMsgact==='report')return report(sec==='messages'?'direct_message':'chat_message',b.dataset.id);
      if(!confirm('Delete this message for everyone?'))return;
      const {error,count}=await H.c.from(tbl).delete({count:'exact'}).eq('id',b.dataset.id);
      if(error||!count)return H.toast(error?.message||'That message could not be deleted.',true);
      H.toast('Message deleted.');loadMsgs(true);loadList(false);
    });
    if(force||nearBottom)box.scrollTop=box.scrollHeight;
  }

  async function poll(){
    if(!alive()){clearInterval(H.timer);return;}
    if(!visible()||!H.user)return;
    if(['messages','groups','firms'].includes(H.section)){
      if(H.sel)loadMsgs(false).catch(()=>{});
      if(++H.listTick%3===0)loadList(false).catch(()=>{});
    }
    if((H.badgeTick=(H.badgeTick||0)+1)%2===0)refreshBadges();
  }
  async function refreshBadges(){
    if(!H.user||!alive())return;
    const {count}=await H.c.from('direct_messages').select('id',{count:'exact',head:true}).eq('recipient_id',H.user.id).is('read_at',null);
    const b=root.querySelector('[data-dc-badge="messages"]');if(b){b.hidden=!count;b.textContent=count>9?'9+':String(count||'');}
  }

  /* ---------------- composer ---------------- */
  function composerHTML(ph,big){return `<form class="dc-composer ${big?'big':''}" novalidate><div class="dc-previews"></div><div class="dc-compose-row"><label class="dc-attach" title="Add a photo (or paste one)"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" ${big?'multiple':''} hidden><span aria-hidden="true">＋</span><span class="dc-sr">Add photo</span></label><textarea rows="${big?3:1}" placeholder="${esc(ph)}" maxlength="5000"></textarea>${big?'<span class="dc-hint">Up to 6 photos or flyers. You can paste images too.</span>':''}<button type="submit" class="du-btn dc-btn primary dc-send">${big?'Post':'Send'}</button></div></form>`;}
  function bindComposer(form,onSend,{multi=false,max=1}={}){
    const ta=form.querySelector('textarea'),inp=form.querySelector('input[type=file]'),prev=form.querySelector('.dc-previews');let files=[];
    const draw=()=>{prev.innerHTML=files.map((f,i)=>`<span class="dc-prev"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-rm="${i}" aria-label="Remove photo">×</button></span>`).join('');prev.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{files.splice(+b.dataset.rm,1);draw();});};
    const add=list=>{for(const f of list){if(!/^image\//.test(f.type))continue;if(multi){if(files.length<max)files.push(f);}else files=[f];}draw();};
    inp.onchange=()=>{add([...inp.files]);inp.value='';};
    ta.addEventListener('paste',e=>{const fs=[...(e.clipboardData?.files||[])].filter(f=>/^image\//.test(f.type));if(fs.length){e.preventDefault();add(fs);}});
    if(!form.classList.contains('big')){ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.min(140,ta.scrollHeight)+'px';});}
    form.onsubmit=async e=>{e.preventDefault();const text=ta.value.trim();if(!text&&!files.length)return;const btn=form.querySelector('.dc-send');btn.disabled=true;
      try{await onSend(text,files.slice());ta.value='';ta.style.height='';files=[];draw();}catch(err){H.toast(err.message||String(err),true);}finally{btn.disabled=false;}};
    return {get files(){return files;}};
  }

  /* ---------------- people ---------------- */
  async function searchPeople(q){
    let qb=H.c.from('profiles').select(PROFILE_COLS).eq('discoverable',true).neq('id',H.user.id).limit(12);
    const s=cleanQ(q);if(s)qb=qb.or(`display_name.ilike.%${s}%,username.ilike.%${s}%,primary_affiliation_name.ilike.%${s}%,title.ilike.%${s}%`);else qb=qb.order('updated_at',{ascending:false});
    const {data}=await qb;const named=(data||[]).filter(p=>String(p.display_name||p.username||'').trim().length>0);named.forEach(p=>H.profiles.set(p.id,p));return named;
  }
  function peoplePicker(el,{multi,exclude=[]}){
    const picked=new Map();
    el.innerHTML=`<input type="search" class="dc-input" placeholder="Search people by name, firm or role" data-pp-q><div class="dc-picked"></div><div class="dc-people"><div class="dc-loading">Loading…</div></div>`;
    const q=el.querySelector('[data-pp-q]'),out=el.querySelector('.dc-people'),pk=el.querySelector('.dc-picked');
    const drawPicked=()=>{pk.innerHTML=[...picked.values()].map(p=>`<span class="dc-chip">${esc(nameOf(p))}<button type="button" data-unpick="${p.id}" aria-label="Remove">×</button></span>`).join('');pk.querySelectorAll('[data-unpick]').forEach(b=>b.onclick=()=>{picked.delete(b.dataset.unpick);drawPicked();});};
    let ev=null,seq=0;
    const run=async()=>{const my=++seq;const rows=(await searchPeople(q.value)).filter(p=>!exclude.includes(p.id));if(my!==seq)return;out.innerHTML=rows.length?rows.map(p=>`<button type="button" class="dc-person" data-pp="${p.id}">${av(p,'sm')}<span><b>${esc(nameOf(p))}</b><small>${esc([p.title,p.primary_affiliation_name].filter(Boolean).join(' · ')||(p.username?'@'+p.username:'DrawUp member'))}</small></span></button>`).join(''):'<p class="dc-muted">No one found.</p>';
      out.querySelectorAll('[data-pp]').forEach(b=>b.onclick=()=>{const p=H.profiles.get(b.dataset.pp);if(multi){picked.set(p.id,p);drawPicked();}else ev&&ev(p);});};
    let t;q.oninput=()=>{clearTimeout(t);t=setTimeout(run,250);};run();setTimeout(()=>q.focus(),30);
    return {picked,onPick:f=>ev=f};
  }
  function newMessage(){
    const s=sheet(`<span class="du-kicker">NEW MESSAGE</span><h2>Who do you want to reach?</h2><div data-pp></div>`);
    const pp=peoplePicker(s.el.querySelector('[data-pp]'),{multi:false});
    pp.onPick(p=>{s.close();H.sel=p.id;loadList(false).then(()=>openThread(p.id));});
  }
  /* V21: one-on-ones shown under Firm chats, split by whether the other person is on one of your firm rosters. */
  async function firmMates(){
    if(H.mates&&Date.now()-H.mates.t<60000)return H.mates;
    const firmChats=(H.chats||[]).filter(c=>c.kind==='firm');const ids=new Set(),firms=[];
    for(const ch of firmChats){firms.push({id:ch.firm_id,name:ch.name,chat:ch.id});const {data}=await H.c.rpc('connect_chat_roster',{p_chat:ch.id});(data||[]).forEach(p=>{ids.add(p.user_id);H.profiles.set(p.user_id,{id:p.user_id,...p});});}
    return H.mates={t:Date.now(),ids,firms};
  }
  async function firmDMs(side){
    const me=H.user.id,m=await firmMates();
    const {data}=await H.c.from('direct_messages').select('sender_id,recipient_id,body,image_url,created_at').or(`sender_id.eq.${me},recipient_id.eq.${me}`).order('created_at',{ascending:false}).limit(300);
    const by=new Map();(data||[]).forEach(x=>{const o=x.sender_id===me?x.recipient_id:x.sender_id;if(!by.has(o))by.set(o,x);});
    const rows=[...by.entries()].filter(([o])=>side==='internal'?m.ids.has(o):!m.ids.has(o));
    await profilesFor(rows.map(r=>r[0]));H.firmDMs=rows;
  }
  function dmItemsHTML(){const rows=H.firmDMs||[];if(!rows.length)return '';const me=H.user.id;
    return `<p class="dc-list-sub">One-on-ones</p>`+rows.map(([o,last])=>{const p=H.profiles.get(o);return `<button type="button" class="dc-item" data-dc-dm="${o}">${av(p)}<span class="dc-item-main"><b>${esc(nameOf(p))}</b><small>${last.sender_id===me?'You: ':''}${esc(last.image_url&&last.body==='Photo'?'Photo':last.body||'')}</small></span><span class="dc-item-side"><time>${ago(last.created_at)}</time></span></button>`;}).join('');}
  async function newFirmChat(side){
    const m=await firmMates();
    if(!m.firms.length)return H.toast('Join your firm roster first (Profile), then start firm chats.',true);
    const firmSel=m.firms.length>1?`<label class="dc-label">For firm<select class="dc-input" data-ffirm>${m.firms.map(f=>`<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select></label>`:'';
    const s=sheet(`<span class="du-kicker">${side==='internal'?'NEW INTERNAL GROUP':'NEW COLLABORATION'}</span><h2>${side==='internal'?'Start a chat just for your firm':'Start a chat with another firm or person'}</h2>${firmSel}
      <label class="dc-label">Name<input class="dc-input" data-gname maxlength="120" placeholder="${side==='internal'?'Healthcare studio, Project team, QA/QC…':'Stadium JV with HOK, MEP coordination…'}"></label>
      ${side==='external'?`<label class="dc-label">Partner firms (their whole DrawUp roster joins)</label><input type="search" class="dc-input" data-fq placeholder="Search firms by name"><div class="dc-picked" data-fpicked></div><div class="dc-people" data-fout></div><label class="dc-label">People outside your firm</label><div data-pp></div>`
      :`<label class="dc-label">People on your roster</label><div class="dc-people" data-roster></div>`}
      <div class="dc-sheet-actions"><button type="button" class="du-btn dc-btn primary" data-create>Create chat</button></div>`);
    const firmId=()=>s.el.querySelector('[data-ffirm]')?.value||m.firms[0].id;
    const picked=new Set(),partners=new Map();let pp=null;
    if(side==='internal'){const box=s.el.querySelector('[data-roster]');const draw=async()=>{const f=m.firms.find(x=>x.id===firmId());const {data}=await H.c.rpc('connect_chat_roster',{p_chat:f.chat});
        box.innerHTML=(data||[]).filter(p=>p.user_id!==H.user.id).map(p=>`<label class="dc-person dc-check"><input type="checkbox" value="${p.user_id}">${av({...p,id:p.user_id},'sm')}<span><b>${esc(nameOf(p))}</b><small>${esc(p.title||'Member')}</small></span></label>`).join('')||'<p class="dc-muted">No one else is on this roster yet.</p>';
        box.querySelectorAll('input').forEach(i=>i.onchange=()=>i.checked?picked.add(i.value):picked.delete(i.value));};
      s.el.querySelector('[data-ffirm]')?.addEventListener('change',()=>{picked.clear();draw();});draw();}
    else{pp=peoplePicker(s.el.querySelector('[data-pp]'),{multi:true,exclude:[...m.ids]});
      const fq=s.el.querySelector('[data-fq]'),fout=s.el.querySelector('[data-fout]'),fpk=s.el.querySelector('[data-fpicked]');
      const drawP=()=>{fpk.innerHTML=[...partners.values()].map(f=>`<span class="dc-chip">${esc(f.name)}<button type="button" data-unf="${f.id}" aria-label="Remove">×</button></span>`).join('');fpk.querySelectorAll('[data-unf]').forEach(b=>b.onclick=()=>{partners.delete(b.dataset.unf);drawP();});};
      let t;fq.oninput=()=>{clearTimeout(t);t=setTimeout(async()=>{const q=fq.value.trim().replace(/[%,()]/g,' ');if(q.length<2){fout.innerHTML='';return;}
        const {data}=await H.c.from('firms').select('id,name,slug').ilike('name','%'+q+'%').eq('is_demo',false).limit(8);
        fout.innerHTML=(data||[]).filter(f=>!m.firms.some(x=>x.id===f.id)).map(f=>`<button type="button" class="dc-person" data-fpick="${f.id}" data-fname="${esc(f.name)}"><span class="dc-av firm">${esc(initials(f.name))}</span><span><b>${esc(f.name)}</b><small>Firm</small></span></button>`).join('')||'<p class="dc-muted">No firm found.</p>';
        fout.querySelectorAll('[data-fpick]').forEach(b=>b.onclick=()=>{partners.set(b.dataset.fpick,{id:b.dataset.fpick,name:b.dataset.fname});drawP();});},250);};}
    s.el.querySelector('[data-create]').onclick=async e=>{const name=s.el.querySelector('[data-gname]').value.trim();
      const members=side==='internal'?[...picked]:[...pp.picked.keys()],firms=[...partners.keys()];
      if(!name&&!firms.length)return H.toast('Give the chat a name.',true);
      if(!members.length&&!firms.length)return H.toast(side==='internal'?'Pick at least one person on your roster.':'Add a partner firm or a person.',true);
      e.target.disabled=true;
      const {data,error}=await H.c.rpc('connect_create_firm_chat',{p_firm:firmId(),p_scope:side,p_name:name||null,p_members:members,p_firms:firms});e.target.disabled=false;
      if(error)return H.toast(error.message,true);s.close();H.toast(side==='internal'?'Internal group created.':'Collaboration chat created.');H.sel=data;await loadList(false);openThread(data);};
  }
  function newGroup(){
    const s=sheet(`<span class="du-kicker">NEW GROUP CHAT</span><h2>Start a group chat</h2><label class="dc-label">Group name<input class="dc-input" data-gname maxlength="120" placeholder="Studio 4B, Hospital team, ARE study group…"></label><label class="dc-label">Add people</label><div data-pp></div><div class="dc-sheet-actions"><button type="button" class="du-btn dc-btn primary" data-create>Create group</button></div>`);
    const pp=peoplePicker(s.el.querySelector('[data-pp]'),{multi:true});
    s.el.querySelector('[data-create]').onclick=async e=>{const name=s.el.querySelector('[data-gname]').value.trim();if(!name)return H.toast('Give the group a name.',true);if(!pp.picked.size)return H.toast('Add at least one person.',true);e.target.disabled=true;
      const {data,error}=await H.c.rpc('connect_create_group',{p_name:name,p_members:[...pp.picked.keys()]});e.target.disabled=false;
      if(error)return H.toast(error.message,true);s.close();H.toast('Group chat created.');H.sel=data;await loadList(false);openThread(data);};
  }
  async function roster(chatId){
    const ch=H.chats.find(c=>c.id===chatId)||{};
    const s=sheet(`<span class="du-kicker">${ch.kind==='firm'?'FIRM CHAT':'GROUP CHAT'}</span><h2>${esc(ch.name||'Members')}</h2><div class="dc-people" data-list><div class="dc-loading">Loading…</div></div>${ch.kind==='group'?`<div class="dc-sheet-actions"><button type="button" class="du-btn dc-btn ghost" data-add>Add people</button><button type="button" class="du-btn dc-btn danger" data-leave>Leave group</button></div><div data-addbox></div>`:`<p class="dc-muted">Firm chat members come from the firm roster on DrawUp. Firm admins manage the roster.</p>`}`);
    const {data,error}=await H.c.rpc('connect_chat_roster',{p_chat:chatId});
    const list=s.el.querySelector('[data-list]');
    if(error){list.innerHTML=`<p class="dc-err">${esc(error.message)}</p>`;return;}
    (data||[]).forEach(p=>H.profiles.set(p.user_id,{id:p.user_id,...p}));
    list.innerHTML=(data||[]).map(p=>`<button type="button" class="dc-person" data-pp="${p.user_id}">${av(p,'sm')}<span><b>${esc(nameOf(p))}${p.user_id===H.user.id?' (you)':''}</b><small>${esc([p.title,p.role==='owner'?'Started this group':p.role==='admin'?'Firm admin':''].filter(Boolean).join(' · ')||'Member')}</small></span></button>`).join('');
    list.querySelectorAll('[data-pp]').forEach(b=>b.onclick=()=>{if(b.dataset.pp!==H.user.id){s.close();viewProfile(b.dataset.pp);}});
    s.el.querySelector('[data-leave]')?.addEventListener('click',async()=>{if(!confirm('Leave this group chat?'))return;const {error,count}=await H.c.from('connect_chat_members').delete({count:'exact'}).eq('chat_id',chatId).eq('user_id',H.user.id);if(error||!count)return H.toast(error?.message||'Could not leave.',true);s.close();H.toast('You left the group.');H.sel=null;go('groups');});
    s.el.querySelector('[data-add]')?.addEventListener('click',()=>{
      const box=s.el.querySelector('[data-addbox]');box.innerHTML='<div data-pp></div><div class="dc-sheet-actions"><button type="button" class="du-btn dc-btn primary" data-addgo>Add to group</button></div>';
      const pp=peoplePicker(box.querySelector('[data-pp]'),{multi:true,exclude:(data||[]).map(x=>x.user_id)});
      box.querySelector('[data-addgo]').onclick=async()=>{if(!pp.picked.size)return;const rows=[...pp.picked.keys()].map(u=>({chat_id:chatId,user_id:u,added_by:H.user.id,role:'member'}));const {error}=await H.c.from('connect_chat_members').insert(rows);if(error)return H.toast(error.message,true);H.toast('Added to the group.');s.close();await loadList(false);openThread(chatId);};
    });
  }
  function viewProfile(id){
    const p=H.profiles.get(id);
    const s=sheet(`<div class="dc-pcard">${av(p,'lg')}<div><span class="du-kicker">DRAWUP MEMBER</span><h2>${esc(nameOf(p))}</h2><p>${esc([p?.title,p?.primary_affiliation_name].filter(Boolean).join(' · ')||(p?.username?'@'+p.username:''))}</p></div></div><div class="dc-sheet-actions">${H.user&&id!==H.user.id?'<button type="button" class="du-btn dc-btn primary" data-msg>Message</button>':''}${window.DrawUpV19?.openPerson?'<button type="button" class="du-btn dc-btn ghost" data-full>Full profile</button>':''}${H.user&&id!==H.user.id?'<button type="button" class="du-btn dc-btn ghost" data-rep>Report</button>':''}</div>`);
    s.el.querySelector('[data-msg]')?.addEventListener('click',()=>{s.close();H.section='messages';go('messages',id);});
    s.el.querySelector('[data-full]')?.addEventListener('click',()=>{s.close();window.DrawUpV19.openPerson(id);});
    s.el.querySelector('[data-rep]')?.addEventListener('click',()=>{s.close();report('profile',id);});
  }
  function report(type,id){
    if(!H.user)return signIn();
    const s=sheet(`<span class="du-kicker">REPORT</span><h2>What is wrong with this?</h2><p class="dc-muted">DrawUp HQ reviews every report. The person is not told who reported them.</p><div class="dc-reasons">${REASONS.map((r,i)=>`<label class="dc-radio"><input type="radio" name="dc-reason" value="${esc(r)}" ${i===0?'checked':''}> ${esc(r)}</label>`).join('')}</div><label class="dc-label">Details (optional)<textarea class="dc-input" rows="3" maxlength="2000" data-det></textarea></label><div class="dc-sheet-actions"><button type="button" class="du-btn dc-btn primary" data-send>Send report</button></div>`);
    s.el.querySelector('[data-send]').onclick=async()=>{const reason=s.el.querySelector('input[name=dc-reason]:checked')?.value||null,details=s.el.querySelector('[data-det]').value.trim()||null;
      const {error}=await H.c.from('connect_reports').insert({reporter_id:H.user.id,target_type:type,target_id:String(id),reason,details});
      if(error)return H.toast(error.message,true);s.close();H.toast('Thanks. DrawUp HQ will review it.');};
  }

  /* ---------------- timeline ---------------- */
  async function renderTimeline(body){
    body.innerHTML=`<div class="dc-feed-wrap"><div class="dc-feed-main">${H.user?`<div class="dc-card dc-post-compose"><div class="dc-compose-top">${av(H.me)}<div class="dc-topics">${TOPICS.map((t,i)=>`<button type="button" class="dc-topic ${i===0?'active':''}" data-topic="${t}">${t}</button>`).join('')}</div></div><div class="dc-event-fields" hidden><input class="dc-input" type="date" data-ev-date aria-label="Event date"><input class="dc-input" data-ev-place maxlength="200" placeholder="Where (venue, city or online)"><input class="dc-input" data-ev-link maxlength="500" placeholder="Link for tickets or details (optional)"></div><label class="dc-school" data-school-wrap hidden><span>Tag a school</span><input class="dc-input" data-school maxlength="160" placeholder="Optional: university or school this post is about"></label>${composerHTML('Share a project, photos, an event flyer or news with the AEC community…',true)}</div>`:`<div class="dc-card dc-signin-strip"><span><b>Share projects, photos and event flyers.</b> Sign in to post, like and comment.</span><button type="button" class="du-btn dc-btn primary" data-dc-signin>Sign in</button></div>`}<div class="dc-feed"><div class="dc-loading">Loading the timeline…</div></div></div>
    <aside class="dc-feed-side"><div class="dc-card"><span class="du-kicker">UPCOMING EVENTS</span><div data-events><p class="dc-muted">Loading…</p></div></div><div class="dc-card"><span class="du-kicker">COMMUNITY</span><p class="dc-muted">Be kind, credit the team behind the work, and only share images you have the right to share. Use Report on anything that breaks the rules.</p></div></aside></div>`;
    if(H.user){
      let topic='Update';const comp=body.querySelector('.dc-post-compose'),evf=comp.querySelector('.dc-event-fields');
      comp.querySelectorAll('[data-topic]').forEach(b=>b.onclick=()=>{topic=b.dataset.topic;comp.querySelectorAll('[data-topic]').forEach(x=>x.classList.toggle('active',x===b));evf.hidden=!(topic==='Event'||topic==='Flyer');});
      const schoolOk=await hasSchoolColumn();const sch=comp.querySelector('[data-school]');comp.querySelector('[data-school-wrap]').hidden=!schoolOk;
      if(H.prefill&&schoolOk){sch.value=H.prefill.university_name||'';}
      if(H.prefill){H.prefill=null;setTimeout(()=>{comp.scrollIntoView({block:'center'});comp.querySelector('.dc-composer textarea').focus();},60);}
      bindComposer(comp.querySelector('.dc-composer'),async(text,files)=>{
        const urls=[];for(const f of files)urls.push(await upload(H.c,H.user.id,f,'timeline'));
        const ev=topic==='Event'||topic==='Flyer';const link=ev?comp.querySelector('[data-ev-link]').value.trim():'';
        const row={author_id:H.user.id,kind:'timeline',topic,body:text||null,image_urls:urls,event_date:ev?comp.querySelector('[data-ev-date]').value||null:null,event_place:ev?comp.querySelector('[data-ev-place]').value.trim()||null:null,link_url:/^https?:\/\//i.test(link)?link:null};
        if(schoolOk&&sch.value.trim())row.university_name=sch.value.trim().slice(0,160);
        const {error}=await H.c.from('connect_posts').insert(row);if(error)throw error;sch.value='';
        comp.querySelectorAll('[data-ev-date],[data-ev-place],[data-ev-link]').forEach(i=>i.value='');
        H.toast('Posted to the timeline.');loadFeed(body);
      },{multi:true,max:6});
    }
    loadFeed(body);
  }
  async function myLikes(ids){if(!H.user||!ids.length)return new Set();const {data}=await H.c.from('connect_likes').select('post_id').eq('user_id',H.user.id).in('post_id',ids);return new Set((data||[]).map(x=>x.post_id));}
  async function loadFeed(body){
    const feed=body.querySelector('.dc-feed');
    const {data,error}=await H.c.from('connect_posts').select('*,author:profiles!connect_posts_author_id_fkey('+PROFILE_COLS+'),comments:connect_comments(count),likes:connect_likes(count)').eq('kind','timeline').order('created_at',{ascending:false}).limit(40);
    if(error){feed.innerHTML=`<p class="dc-err">${esc(error.message)}</p>`;return;}
    (data||[]).forEach(p=>p.author&&H.profiles.set(p.author.id,p.author));
    const liked=await myLikes((data||[]).map(p=>p.id));
    feed.innerHTML=(data||[]).length?data.map(p=>postCard(p,liked.has(p.id))).join(''):`<div class="dc-card dc-empty-card"><h3>The timeline is waiting for its first post.</h3><p class="dc-muted">Share a project photo, a site visit, an event flyer or studio news.</p></div>`;
    bindPosts(feed,()=>loadFeed(body));
    const today=new Date().toISOString().slice(0,10);
    const evs=(data||[]).filter(p=>p.event_date&&p.event_date>=today).sort((a,b)=>a.event_date.localeCompare(b.event_date)).slice(0,5);
    const side=body.querySelector('[data-events]');if(side)side.innerHTML=evs.length?evs.map(p=>`<button type="button" class="dc-ev" data-jump="${p.id}"><b>${new Date(p.event_date+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'})}</b><span>${esc((p.body||p.topic||'Event').slice(0,70))}<small>${esc(p.event_place||'')}</small></span></button>`).join(''):'<p class="dc-muted">No upcoming events posted yet. Post a flyer with a date and it shows here.</p>';
    side?.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>feed.querySelector(`[data-post="${b.dataset.jump}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}));
  }
  function postCard(p,liked){
    const a=p.author||{},mine=H.user&&p.author_id===H.user.id,imgs=p.image_urls||[];const nc=p.comments?.[0]?.count||0,nl=p.likes?.[0]?.count||0;
    return `<article class="dc-card dc-post" data-post="${p.id}"><div class="dc-post-head"><button type="button" class="dc-author" data-who="${a.id||''}">${av(a)}<span><b>${esc(nameOf(a))}</b><small>${esc([a.title,a.primary_affiliation_name].filter(Boolean).join(' · ')||'DrawUp member')} · ${ago(p.created_at)}</small></span></button>${p.topic?`<span class="dc-tag">${esc(p.topic)}</span>`:''}</div>${p.university_name?`<div class="dc-school-tag" title="Tagged school">🎓 ${esc(p.university_name)}</div>`:''}
    ${p.body?`<div class="dc-post-body">${linkify(p.body)}</div>`:''}
    ${p.event_date||p.event_place?`<div class="dc-event"><b>${p.event_date?new Date(p.event_date+'T00:00:00').toLocaleDateString(undefined,{weekday:'short',month:'long',day:'numeric',year:'numeric'}):'Event'}</b>${p.event_place?`<span>${esc(p.event_place)}</span>`:''}${p.link_url?`<a href="${esc(p.link_url)}" target="_blank" rel="noopener">Details ↗</a>`:''}</div>`:''}
    ${imgs.length?`<div class="dc-imgs n${Math.min(imgs.length,4)}">${imgs.slice(0,4).map((u,i)=>`<button type="button" class="dc-img" data-img="${esc(u)}"><img src="${esc(u)}" alt="Post photo ${i+1}" loading="lazy">${i===3&&imgs.length>4?`<i>+${imgs.length-4}</i>`:''}</button>`).join('')}</div>`:''}
    <div class="dc-post-foot"><button type="button" class="dc-act ${liked?'on':''}" data-like aria-pressed="${liked}">♥ <span>${nl||''}</span> Like</button><button type="button" class="dc-act" data-cmts>💬 <span>${nc||''}</span> Comment</button><span class="dc-grow"></span>${mine?'<button type="button" class="dc-mini" data-del>Delete</button>':H.user?'<button type="button" class="dc-mini" data-rep>Report</button>':''}</div><div class="dc-thread" hidden></div></article>`;
  }
  function bindPosts(scope,reload){
    scope.querySelectorAll('[data-who]').forEach(b=>b.onclick=()=>b.dataset.who&&viewProfile(b.dataset.who));
    scope.querySelectorAll('.dc-post').forEach(card=>{
      const id=card.dataset.post;
      card.querySelectorAll('[data-img]').forEach(b=>b.onclick=()=>lightbox(b.dataset.img));
      card.querySelector('[data-like]')?.addEventListener('click',async e=>{if(!H.user)return signIn();const b=e.currentTarget,on=b.classList.contains('on'),n=b.querySelector('span');
        const {error}=on?await H.c.from('connect_likes').delete().eq('post_id',id).eq('user_id',H.user.id):await H.c.from('connect_likes').insert({post_id:id,user_id:H.user.id});
        if(error)return H.toast(error.message,true);b.classList.toggle('on',!on);b.setAttribute('aria-pressed',!on);const v=(parseInt(n.textContent)||0)+(on?-1:1);n.textContent=v||'';});
      card.querySelector('[data-cmts]')?.addEventListener('click',()=>{const t=card.querySelector('.dc-thread');t.hidden=!t.hidden;if(!t.hidden)loadComments(t,id,card);});
      card.querySelector('[data-del]')?.addEventListener('click',async()=>{if(!confirm('Delete this post?'))return;const {error,count}=await H.c.from('connect_posts').delete({count:'exact'}).eq('id',id);if(error||!count)return H.toast(error?.message||'That post could not be deleted.',true);H.toast('Post deleted.');reload();});
      card.querySelector('[data-rep]')?.addEventListener('click',()=>report('post',id));
    });
  }
  async function loadComments(box,postId,card,label='Comment'){
    box.innerHTML='<div class="dc-loading">Loading…</div>';
    const {data,error}=await H.c.from('connect_comments').select('id,body,created_at,author_id,author:profiles!connect_comments_author_id_fkey('+PROFILE_COLS+')').eq('post_id',postId).order('created_at').limit(300);
    if(error){box.innerHTML=`<p class="dc-err">${esc(error.message)}</p>`;return;}
    (data||[]).forEach(c=>c.author&&H.profiles.set(c.author.id,c.author));
    box.innerHTML=`<div class="dc-cmts">${(data||[]).map(c=>`<div class="dc-cmt" data-cmt="${c.id}"><button type="button" class="dc-author" data-who="${c.author_id}">${av(c.author,'sm')}</button><div class="dc-cmt-body"><b>${esc(nameOf(c.author))}</b> <small>${ago(c.created_at)}</small><p>${linkify(c.body)}</p>${H.user?(c.author_id===H.user.id?'<button type="button" class="dc-mini" data-cdel>Delete</button>':'<button type="button" class="dc-mini" data-crep>Report</button>'):''}</div></div>`).join('')||`<p class="dc-muted">${label==='Reply'?'No replies yet. Be the first to answer.':'No comments yet.'}</p>`}</div>${H.user?`<form class="dc-cmt-form"><textarea class="dc-input" rows="${label==='Reply'?3:1}" maxlength="5000" placeholder="${label==='Reply'?'Write a reply…':'Write a comment…'}"></textarea><button type="submit" class="du-btn dc-btn primary">${label}</button></form>`:`<p class="dc-muted"><button type="button" class="dc-link" data-dc-signin>Sign in</button> to ${label==='Reply'?'reply':'comment'}.</p>`}`;
    box.querySelectorAll('[data-who]').forEach(b=>b.onclick=()=>viewProfile(b.dataset.who));
    const f=box.querySelector('.dc-cmt-form');
    if(f)f.onsubmit=async e=>{e.preventDefault();const ta=f.querySelector('textarea'),t=ta.value.trim();if(!t)return;const btn=f.querySelector('button');btn.disabled=true;
      const {error}=await H.c.from('connect_comments').insert({post_id:postId,author_id:H.user.id,body:t});btn.disabled=false;
      if(error)return H.toast(error.message,true);bump(card,1);loadComments(box,postId,card,label);};
    box.querySelectorAll('[data-cdel]').forEach(b=>b.onclick=async()=>{const id=b.closest('[data-cmt]').dataset.cmt;if(!confirm('Delete this '+label.toLowerCase()+'?'))return;const {error,count}=await H.c.from('connect_comments').delete({count:'exact'}).eq('id',id);if(error||!count)return H.toast(error?.message||'Could not delete.',true);bump(card,-1);loadComments(box,postId,card,label);});
    box.querySelectorAll('[data-crep]').forEach(b=>b.onclick=()=>report('comment',b.closest('[data-cmt]').dataset.cmt));
    if(card?.querySelector('[data-rcount]'))syncReplies(box,card);
  }
  function syncReplies(scope,card){const n=scope.querySelectorAll('.dc-cmt').length,t=n+' '+(n===1?'reply':'replies');const rc=card?.querySelector('[data-rcount]');if(rc)rc.textContent=t;const li=root.querySelector(`.dc-board-item[data-bopen="${card?.dataset.post}"] .dc-replies`);if(li)li.innerHTML=n+'<small>'+(n===1?'reply':'replies')+'</small>';}
  const bump=(card,d)=>{if(card?.querySelector('[data-rcount]'))return;const n=card?.querySelector('[data-cmts] span');if(n){const v=(parseInt(n.textContent)||0)+d;n.textContent=v||'';}};

  /* ---------------- discussion boards ---------------- */
  async function renderBoards(body){
    body.innerHTML=`<div class="dc-split"><aside class="dc-list"><div class="dc-list-head"><button type="button" class="du-btn dc-btn primary dc-new" data-bnew>＋ Start a discussion</button><div class="dc-cats">${['All',...BOARD_CATS].map(c=>`<button type="button" class="dc-cat ${c===H.boardCat?'active':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div></div><div class="dc-items"><div class="dc-loading">Loading…</div></div></aside><section class="dc-conv dc-board-view"><div class="dc-conv-empty"><span class="du-kicker">DISCUSSION BOARDS</span><h2>Ask the AEC community.</h2><p>Anyone can start a discussion: an architect with a question for emerging professionals, a student asking about the ARE, a GC looking for subs, a vendor sharing a product. Pick a thread to read and reply.</p></div></section></div>`;
    body.querySelector('[data-bnew]').onclick=()=>H.user?boardForm(body):signIn();
    body.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{H.boardCat=b.dataset.cat;body.querySelectorAll('[data-cat]').forEach(x=>x.classList.toggle('active',x===b));loadBoards(body);});
    await loadBoards(body);
  }
  async function loadBoards(body){
    const items=body.querySelector('.dc-items');
    let q=H.c.from('connect_posts').select('id,title,topic,created_at,author_id,author:profiles!connect_posts_author_id_fkey('+PROFILE_COLS+'),comments:connect_comments(count)').eq('kind','board').order('created_at',{ascending:false}).limit(80);
    if(H.boardCat!=='All')q=q.eq('topic',H.boardCat);
    const {data,error}=await q;if(error){items.innerHTML=`<p class="dc-err">${esc(error.message)}</p>`;return;}
    items.innerHTML=(data||[]).length?data.map(p=>`<button type="button" class="dc-item dc-board-item ${H.sel===p.id?'active':''}" data-bopen="${p.id}"><span class="dc-item-main"><b>${esc(p.title)}</b><small>${esc(nameOf(p.author))} · ${esc(p.topic||'General')} · ${ago(p.created_at)}</small></span><span class="dc-item-side"><i class="dc-replies">${p.comments?.[0]?.count||0}<small>${p.comments?.[0]?.count===1?'reply':'replies'}</small></i></span></button>`).join(''):`<div class="dc-list-empty"><p>No discussions${H.boardCat!=='All'?' in '+esc(H.boardCat):''} yet.</p><p>Start the first one.</p></div>`;
    items.querySelectorAll('[data-bopen]').forEach(b=>b.onclick=()=>openBoard(body,b.dataset.bopen));
    if(!H.sel&&window.innerWidth>760&&data?.length)openBoard(body,data[0].id);
  }
  async function openBoard(body,id){
    H.sel=id;body.querySelectorAll('[data-bopen]').forEach(x=>x.classList.toggle('active',x.dataset.bopen===id));
    const split=body.querySelector('.dc-split');split.classList.add('dc-show-conv');const view=body.querySelector('.dc-board-view');
    view.innerHTML='<div class="dc-loading">Loading…</div>';
    const {data:p,error}=await H.c.from('connect_posts').select('*,author:profiles!connect_posts_author_id_fkey('+PROFILE_COLS+')').eq('id',id).maybeSingle();
    if(error||!p){view.innerHTML=`<p class="dc-err">${esc(error?.message||'This discussion was removed.')}</p>`;return;}
    if(p.author)H.profiles.set(p.author.id,p.author);
    const mine=H.user&&p.author_id===H.user.id,imgs=p.image_urls||[];
    view.innerHTML=`<div class="dc-conv-head"><button type="button" class="dc-back" aria-label="Back to list">‹</button><div class="dc-conv-title"><span><small>${esc(p.topic||'General')}</small></span></div><div class="dc-conv-actions">${mine?'<button type="button" class="dc-mini" data-del>Delete</button>':H.user?'<button type="button" class="dc-mini" data-rep>Report</button>':''}</div></div>
    <div class="dc-board-scroll"><article class="dc-post dc-board-post" data-post="${p.id}"><h2>${esc(p.title)}</h2><button type="button" class="dc-author" data-who="${p.author_id}">${av(p.author)}<span><b>${esc(nameOf(p.author))}</b><small>${esc([p.author?.title,p.author?.primary_affiliation_name].filter(Boolean).join(' · ')||'DrawUp member')} · ${clock(p.created_at)}</small></span></button>${p.body?`<div class="dc-post-body">${linkify(p.body)}</div>`:''}${imgs.length?`<div class="dc-imgs n${Math.min(imgs.length,4)}">${imgs.map(u=>`<button type="button" class="dc-img" data-img="${esc(u)}"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join('')}</div>`:''}<div class="dc-post-foot"><span class="dc-act dc-act-static" data-rcount></span></div></article><h3 class="dc-replies-h">Replies</h3><div class="dc-thread"></div></div>`;
    view.querySelector('.dc-back').onclick=()=>{split.classList.remove('dc-show-conv');H.sel=null;};
    view.querySelector('[data-who]').onclick=()=>viewProfile(p.author_id);
    view.querySelectorAll('[data-img]').forEach(b=>b.onclick=()=>lightbox(b.dataset.img));
    view.querySelector('[data-del]')?.addEventListener('click',async()=>{if(!confirm('Delete this discussion and its replies?'))return;const {error,count}=await H.c.from('connect_posts').delete({count:'exact'}).eq('id',id);if(error||!count)return H.toast(error?.message||'Could not delete.',true);H.toast('Discussion deleted.');H.sel=null;renderBoards(body);});
    view.querySelector('[data-rep]')?.addEventListener('click',()=>report('post',id));
    const card=view.querySelector('.dc-board-post');
    await loadComments(view.querySelector('.dc-thread'),id,card,'Reply');
  }
  function boardForm(body){
    H.sel=null;const split=body.querySelector('.dc-split');split.classList.add('dc-show-conv');const view=body.querySelector('.dc-board-view');
    view.innerHTML=`<div class="dc-conv-head"><button type="button" class="dc-back" aria-label="Back to list">‹</button><div class="dc-conv-title"><span><b>Start a discussion</b><small>Anyone on DrawUp can read and reply</small></span></div></div><form class="dc-board-form"><label class="dc-label">Board<select class="dc-input" data-bcat>${BOARD_CATS.map(c=>`<option ${c===H.boardCat?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label class="dc-label">Title<input class="dc-input" data-btitle maxlength="200" required placeholder="What should emerging professionals know about…"></label><label class="dc-label">Details<textarea class="dc-input" data-bbody rows="7" maxlength="8000" placeholder="Give context so people can answer well."></textarea></label><label class="dc-label">Photos (optional)<input type="file" data-bimg accept="image/jpeg,image/png,image/webp,image/gif" multiple></label><div class="dc-sheet-actions"><button type="submit" class="du-btn dc-btn primary">Post discussion</button></div></form>`;
    view.querySelector('.dc-back').onclick=()=>split.classList.remove('dc-show-conv');
    const f=view.querySelector('form');
    f.onsubmit=async e=>{e.preventDefault();const title=f.querySelector('[data-btitle]').value.trim();if(!title)return H.toast('Add a title.',true);const btn=f.querySelector('[type=submit]');btn.disabled=true;
      try{const urls=[];for(const file of [...f.querySelector('[data-bimg]').files].slice(0,6))urls.push(await upload(H.c,H.user.id,file,'boards'));
        const {data,error}=await H.c.from('connect_posts').insert({author_id:H.user.id,kind:'board',topic:f.querySelector('[data-bcat]').value,title,body:f.querySelector('[data-bbody]').value.trim()||null,image_urls:urls}).select('id').single();
        if(error)throw error;H.toast('Discussion posted.');H.boardCat='All';await renderBoards(body);openBoard(body,data.id);}
      catch(err){H.toast(err.message||String(err),true);btn.disabled=false;}};
  }

  H.boot=boot;H.go=go;H.destroy=()=>clearInterval(H.timer);
  return H;
}

/* ------------------------------------------------------------------ mount points */
const Connect={hubs:new Set(),
  async mount(host,opts){for(const h of Connect.hubs){if(h.host===host||!h.root.isConnected){h.destroy();Connect.hubs.delete(h);}}const h=createHub(host,opts||{mode:'public'});Connect.hubs.add(h);await h.boot();return h;}
};
/* Open Connect on a 1:1 conversation with this person (Discover People, profile sheets).
   Portal Connect tab when the Portal is open, else the public Connect page, else asks guests to sign in.
   Resolves to 'opened', 'signin' (guest asked to sign in; the chat opens after sign-in) or 'unavailable'. */
Connect.messageUser=async(userId,displayName)=>{
  if(!userId)return 'unavailable';
  const c=await db();if(!c)return 'unavailable';
  const {data}=await c.auth.getSession();const u=data.session?.user;
  const pend={id:String(userId),name:displayName||''};
  if(!u||u.is_anonymous){try{sessionStorage.setItem(PENDING_KEY,JSON.stringify(pend));}catch(_e){}const b=$('drawup-signin');if(b)b.click();return 'signin';}
  if(u.id===pend.id)return 'unavailable';
  Connect.pending=pend;await openHub(()=>!!Connect.pending);
  for(let i=0;i<80;i++){const h=[...Connect.hubs].find(h=>h.root.isConnected&&h.sel===pend.id&&h.root.querySelector('.dc-conv .dc-composer'));if(h)return 'opened';await sleep(100);}
  return 'unavailable';
};
async function openHub(stillPending){
  const portalOpen=$('du-portal')?.classList.contains('open')&&window.DrawUpPortal?.openPortalTab;
  if(portalOpen){await window.DrawUpPortal.openPortalTab('connect');}
  else{const link=document.querySelector('.nav-link[data-page="connect"]');if(link)link.click();else location.hash='#connect';await mountPublic(false);if(stillPending())await Connect.mount(pubHost,{mode:'public'});}
}
/* Open the Connect timeline composer, optionally with a school tagged (university profiles).
   Resolves to 'opened', 'signin' (guest asked to sign in; the composer opens after sign-in) or 'unavailable'. */
Connect.compose=async(opts={})=>{
  const pc={university_name:String(opts.university_name||'').slice(0,160)};
  const c=await db();if(!c)return 'unavailable';
  const {data}=await c.auth.getSession();const u=data.session?.user;
  if(!u||u.is_anonymous){try{sessionStorage.setItem(COMPOSE_KEY,JSON.stringify(pc));}catch(_e){}const b=$('drawup-signin');if(b)b.click();return 'signin';}
  Connect.pendingCompose=pc;await openHub(()=>!!Connect.pendingCompose);
  for(let i=0;i<80;i++){const h=[...Connect.hubs].find(h=>h.root.isConnected&&h.section==='timeline'&&!h.prefill&&h.root.querySelector('.dc-post-compose .dc-composer'));if(h)return 'opened';await sleep(100);}
  return 'unavailable';
};
window.DrawUpConnect=Connect;

/* Public page: replace the old firm-directory content of #page-connect with the hub. */
let pubHost=null,pubUser='?';
async function mountPublic(force){
  const page=$('page-connect');if(!page)return;
  if(!pubHost||!page.contains(pubHost)){page.classList.add('dc-public');page.innerHTML='<div class="wrap dc-public-wrap"><div class="dc-public-host"></div></div>';pubHost=page.querySelector('.dc-public-host');force=true;}
  const c=await db();const {data}=c?await c.auth.getSession():{data:{}};const uid=data?.session?.user?.id||'';
  if(force||uid!==pubUser){pubUser=uid;await Connect.mount(pubHost,{mode:'public'});}
}
function startPublic(){
  setTimeout(()=>mountPublic(true),0);
  window.addEventListener('hashchange',()=>{if(/^#connect\b/.test(location.hash))mountPublic(false);});
  db().then(c=>c&&c.auth.onAuthStateChange(ev=>setTimeout(async()=>{
    let pend=null;try{pend=sessionStorage.getItem(PENDING_KEY)||sessionStorage.getItem(COMPOSE_KEY);}catch(_e){}
    if(ev==='SIGNED_IN'&&pend){for(let i=0;i<60;i++){if($('du-portal')?.classList.contains('open'))break;await sleep(150);}if($('du-portal')?.classList.contains('open')&&window.DrawUpPortal?.openPortalTab){await sleep(400);window.DrawUpPortal.openPortalTab('connect');return;}}
    mountPublic(false);},50)));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startPublic);else startPublic();

/* Portal tab. */
(async()=>{for(let i=0;i<150;i++){if(window.DrawUpPortal?.registerTab)break;await sleep(100);}
  const P=window.DrawUpPortal;if(!P?.registerTab)return;
  P.registerTab('connect',async(w,ctx)=>{const host=document.createElement('div');host.className='dc-portal-host';w.innerHTML='';w.appendChild(host);await Connect.mount(host,{mode:'portal',ctx});});
})();
})();
