/* DrawUp V21: Hall of Fame legends as guest helpers.
   The member always keeps their own Arch Coach. Under the latest Arch Coach answer, they can ask an
   unlocked legend for a second opinion seen through that architect's or engineer's documented work.
   The opinion streams in like any answer and is saved in the same coach thread.
   Server: POST /api/arch-coach/legend (locks re-checked there, charged like a basic question). */
(function(){
'use strict';
const TAG='HALL OF FAME · ';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const P=()=>window.DrawUpPortal;
let busy=false;

function legendsState(){const s=window.DrawUpCoach?.state?.();return s?{legends:s.legends||[],xp:s.xp||0,go:s.row?.legend||null}:{legends:[],xp:0,go:null};}
function isHq(){const c=P()?.ctx?.();return !!c?.isAdmin||['founder','drawup_admin'].includes(c?.profile?.account_type);}
const mono=l=>(l.name||'').split(/[\s.]+/).filter(w=>/^[A-Z]/.test(w)).map(w=>w[0]).join('').slice(0,3);

function styleLegendMessages(box){
  box.querySelectorAll('article.assistant:not([data-hof])').forEach(a=>{
    const p=a.querySelector('p');const t=p?.textContent||'';a.dataset.hof=t.startsWith(TAG)?'1':'0';
    if(a.dataset.hof==='1'){const nl=t.indexOf('\n');const name=t.slice(TAG.length,nl>0?nl:undefined).trim();a.classList.add('du-hof-msg');a.dataset.legend=name;
      const head=a.querySelector('span');if(head)head.textContent='HALL OF FAME · '+name.toUpperCase()+' · SECOND OPINION';if(p&&nl>0)p.textContent=t.slice(nl).trim();}
  });
  // V22: a legend reply is its own message with the legend's monogram, never the member's coach avatar.
  box.querySelectorAll('article.du-hof-msg').forEach(a=>{
    a.classList.add('ac-has-ava');a.querySelectorAll('.ac-chat-ava').forEach(x=>x.remove());
    if(!a.querySelector('.du-hof-ava')){const i=document.createElement('i');i.className='du-hof-ava';i.setAttribute('aria-hidden','true');i.textContent=mono({name:a.dataset.legend||''})||'HOF';a.prepend(i);}
  });
}

function bar(box){
  box.querySelectorAll('.du-hof-ask').forEach(x=>x.remove());
  const answers=[...box.querySelectorAll('article.assistant')].filter(a=>a.dataset.hof!=='1');
  const last=answers[answers.length-1];if(!last||busy)return;
  const {legends,xp,go}=legendsState();if(!legends.length)return;
  const hq=isHq(),open=l=>hq||xp>=l.xp_required;
  const unlocked=legends.filter(open).sort((a,b)=>(b.key===go)-(a.key===go)),locked=legends.filter(l=>!open(l));
  const el=document.createElement('div');el.className='du-hof-ask';el.setAttribute('role','group');el.setAttribute('aria-label','Ask a Hall of Fame legend');
  el.innerHTML=`<span class="du-hof-k">HALL OF FAME · SECOND OPINION</span>
    <p>${unlocked.length?'Your coach answered. Ask a legend how their approach would look at it.':'Earn XP to unlock your first legend. Asking Arch Coach, uploading and running Checks all count.'}</p>
    <div class="du-hof-chips">${unlocked.map(l=>`<button type="button" data-hof="${esc(l.key)}" title="Through the lens of ${esc(l.name)}"><i>${esc(mono(l))}</i>${esc(l.name)}${l.key===go?' <em>go-to</em>':''}</button>`).join('')}
    ${locked.slice(0,3).map(l=>`<button type="button" disabled aria-disabled="true" class="locked"><i>${esc(mono(l))}</i>${esc(l.name)} <em>🔒 ${l.xp_required} XP</em></button>`).join('')}</div>`;
  const arts=box.querySelectorAll('article');(arts[arts.length-1]||last).after(el);el.querySelector('.du-hof-k').textContent=box.querySelector('article.du-hof-msg')&&arts[arts.length-1]!==last?'HALL OF FAME · ASK ANOTHER LEGEND':'HALL OF FAME · SECOND OPINION';
  el.querySelectorAll('[data-hof]').forEach(b=>b.onclick=()=>ask(box,last,legends.find(l=>l.key===b.dataset.hof)));
  autoAsk(box,last,unlocked,go);
}

/* V22: when the member asks Arch Coach for a legend's opinion ("what would Zaha Hadid think?"), the coach
   answers first and the legend follows automatically as its own message. Once per answer. */
const surname=n=>String(n||'').split(/\s+/).filter(w=>w.length>2&&!/^[A-Z]\.$/.test(w)).pop()||'';
function autoAsk(box,last,unlocked,go){
  if(busy||!unlocked.length)return;
  const after=[];for(let n=last.nextElementSibling;n;n=n.nextElementSibling)if(n.matches?.('article'))after.push(n);
  if(after.some(a=>a.classList.contains('du-hof-msg')||a.classList.contains('user')))return;
  const prev=[...box.querySelectorAll('article.user')].filter(a=>a.compareDocumentPosition(last)&Node.DOCUMENT_POSITION_FOLLOWING).pop();
  const q=(prev?.querySelector('p')?.textContent||'').toLowerCase();if(!q)return;
  let pick=unlocked.find(l=>q.includes(l.name.toLowerCase())||(surname(l.name).length>3&&new RegExp('\\b'+surname(l.name).toLowerCase()+'\\b').test(q)));
  if(!pick&&/\b(my|the) (go-to )?legend\b|hall of fame/.test(q))pick=unlocked.find(l=>l.key===go);
  if(!pick)return;
  const key='duHofAuto:'+((last.querySelector('p')?.textContent||'').length)+':'+q.slice(0,80);
  try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');}catch{}
  ask(box,last,pick);
}

async function ask(box,answerEl,legend){
  if(busy||!legend)return;busy=true;box.querySelectorAll('.du-hof-ask').forEach(x=>x.remove());
  const prev=[...box.querySelectorAll('article.user')].filter(a=>a.compareDocumentPosition(answerEl)&Node.DOCUMENT_POSITION_FOLLOWING).pop();
  const question=prev?.querySelector('p')?.textContent||'';const answer=answerEl.querySelector('p')?.textContent||'';
  const c=P()?.ctx?.();const st=document.getElementById('dc-status');
  try{
    const token=c?await c.token():'';
    const d=await window.DrawUpV20.coachAsk({token,stage:box,endpoint:'/api/arch-coach/legend',label:'Asking through the lens of '+legend.name+'…',legend:legend.key,question,answer});
    const text=String(d.answer||'').trim();if(!text)throw new Error('The legend opinion came back empty. You were not charged.');
    const content=TAG+legend.name+'\n\n'+text;
    const threadBtn=document.querySelector('#du-workspace-content [data-thread].active');
    if(c&&threadBtn){const r=await c.client.from('coach_messages').insert({thread_id:threadBtn.dataset.thread,role:'assistant',content});if(r.error)throw r.error;busy=false;threadBtn.click();}
    else{const a=document.createElement('article');a.className='assistant';a.innerHTML=`<span>ARCH COACH</span><p></p>`;a.querySelector('p').textContent=content;box.appendChild(a);busy=false;refresh();}
    if(st&&d.credits_charged)st.textContent=d.credits_charged+' credits used'+(d.credits_remaining!=null?' · '+d.credits_remaining+' left':'')+'.';
  }catch(e){busy=false;if(st)st.textContent=e.message||String(e);refresh();}
}

function refresh(){const box=document.querySelector('#du-workspace-content #dc-messages');if(!box)return;styleLegendMessages(box);bar(box);}
let t=0;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(()=>{const box=document.querySelector('#du-workspace-content #dc-messages');if(!box||busy)return;
  const sig=box.childElementCount+':'+box.querySelectorAll('article').length;if(box.dataset.hofSig===sig&&box.querySelector('.du-hof-ask, .du-holo-load'))return;
  if(box.querySelector('.du-holo-load'))return;box.dataset.hofSig=sig;
  if(!window.DrawUpCoach?.state?.().legends?.length&&window.DrawUpCoach?.reload)window.DrawUpCoach.reload().then(refresh,()=>{});else refresh();},120);})
  .observe(document.documentElement,{childList:true,subtree:true});
window.DrawUpLegends={refresh};
})();
