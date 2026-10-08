/* DrawUp V22 · Vendors and Lunch and Learns (a tab inside Connect)
 *
 * Vendors create one listing: what they offer (Lunch and Learn topics, products and systems,
 * CE credits only when they say so), their scope (fixed CSI MasterFormat divisions), where
 * they travel, and a calendar of time slots they control.
 * Firm members browse and filter vendors, read each vendor's calendar, and request a slot for
 * a firm they belong to. The vendor accepts or declines. Both sides see the booking.
 * Recommendations come from the database function vendor_recommendations(firm): a vendor is
 * shown when a whole-word scope keyword in one of the firm's active projects maps to a division
 * the vendor lists. No AI is involved, so every reason shown is the actual rule that matched.
 *
 * Mounting: Connect (drawup-connect-v20.js) renders a tab bar .dc-tabs inside .dc-hub. This file
 * adds a "Vendors" tab button to every hub it sees and renders into the hub body through the hub's
 * own go() so the other tabs keep working. Every rule is enforced by RLS (migration 0045).
 */
(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function db(){for(let i=0;i<100;i++){if(window.drawupSupabaseClient)return window.drawupSupabaseClient;await sleep(100);}return null;}
const initials=n=>(String(n||'V').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('')||'V').toUpperCase();
const dayKey=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
const fmtDay=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});};
const fmtTime=d=>new Date(d).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
const fmtWhen=(a,b)=>`${fmtDay(dayKey(a))} · ${fmtTime(a)} to ${fmtTime(b)}`;
const MODES={in_person:'In person',virtual:'Virtual',either:'In person or virtual'};
const CE_NOTE='CE credits are stated by the vendor. DrawUp does not verify CE credits, hours or provider approvals.';
const STATUS={pending:'Waiting on vendor',accepted:'Booked',declined:'Declined',cancelled:'Cancelled'};
const SUBS=[['browse','Find vendors'],['recs','Recommended'],['bookings','Bookings'],['mine','My vendor listing']];
const OPEN_KEY='drawup_vendors_open_';
const lines=t=>String(t||'').split(/\n|,/).map(s=>s.trim()).filter(Boolean);
const cleanUrl=u=>{u=String(u||'').trim();if(!u)return '';if(!/^https?:\/\//i.test(u))u='https://'+u;try{const x=new URL(u);return /^https?:$/.test(x.protocol)?x.href:'';}catch(_e){return '';}};

const S={c:null,user:null,divs:[],divMap:{},listings:[],slots:[],firms:null,mine:undefined,sub:'browse',
  f:{div:'',loc:'',date:'',virtual:false},firmId:null,loaded:false};

function toast(msg,bad){let t=document.getElementById('du-toast');if(!t){t=document.createElement('div');t.id='du-toast';t.className='du-toast';document.body.appendChild(t);}t.textContent=msg;t.dataset.state=bad?'bad':'good';t.classList.add('open');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('open'),bad?6000:2600);}
function signIn(){const b=document.getElementById('drawup-signin');if(b)b.click();else toast('Sign in first.',true);}
function errText(e){const m=String(e?.message||e||'');if(/row-level security|violates row/i.test(m))return 'Not allowed: you can only change your own listing, or request for a firm you belong to.';if(/one_accepted|duplicate key/i.test(m))return 'That time is already booked or already requested by your firm.';return m||'Something went wrong.';}

/* ------------------------------------------------------------------ data */
async function boot(force){
  S.c=S.c||await db();if(!S.c)throw new Error('The DrawUp database is not connected.');
  const {data}=await S.c.auth.getSession();const u=data.session?.user&&!data.session.user.is_anonymous?data.session.user:null;
  if(u?.id!==S.user?.id){S.user=u;S.firms=null;S.mine=undefined;S.firmId=null;force=true;}
  if(S.loaded&&!force)return;
  if(!S.divs.length){const r=await S.c.from('vendor_divisions').select('code,name,sort').order('sort');if(r.error)throw r.error;S.divs=r.data||[];S.divs.forEach(d=>S.divMap[d.code]=d.name);}
  const [l,s]=await Promise.all([
    S.c.from('vendor_listings').select('*').order('company_name').limit(500),
    S.c.rpc('vendor_slot_board',{p_vendor:null})]);
  if(l.error)throw l.error;if(s.error)throw s.error;
  S.listings=l.data||[];S.slots=s.data||[];
  if(S.user){
    S.mine=S.listings.find(x=>x.owner_id===S.user.id)||null;
    if(!S.mine){const m=await S.c.from('vendor_listings').select('*').eq('owner_id',S.user.id).maybeSingle();S.mine=m.data||null;}
    if(S.firms===null){const f=await S.c.rpc('drawup_my_firms');S.firms=Array.isArray(f.data)?f.data:[];if(!S.firmId&&S.firms[0])S.firmId=S.firms[0].id;}
  }else{S.mine=null;S.firms=[];}
  S.loaded=true;
}
const visibleListings=()=>S.listings.filter(v=>v.is_published||v.owner_id===S.user?.id);
const slotsOf=id=>S.slots.filter(s=>s.vendor_id===id);
const openDays=id=>[...new Set(slotsOf(id).filter(s=>!s.taken&&new Date(s.starts_at)>new Date()).map(s=>dayKey(s.starts_at)))].sort();
const divLabel=c=>`Div ${c} ${S.divMap[c]||''}`.trim();
function travelText(v){
  const p=[];const home=[v.home_city,v.home_state].filter(Boolean).join(', ');
  if(home)p.push('Based in '+home);
  if(v.travels_nationwide)p.push('Travels nationwide');else if(v.travel_radius_miles)p.push(`Travels up to ${v.travel_radius_miles} mi`);
  if(v.travel_areas?.length)p.push('Areas: '+v.travel_areas.join(', '));
  if(v.virtual_ok)p.push('Virtual sessions');
  return p.join(' · ')||'Travel area not listed yet';
}
function topicsHtml(v,limit){
  const t=(Array.isArray(v.topics)?v.topics:[]).filter(x=>x&&x.title);if(!t.length)return '<p class="vl-muted">No Lunch and Learn topics listed yet.</p>';
  const show=limit?t.slice(0,limit):t;
  return `<ul class="vl-topics">${show.map(x=>`<li><b>${esc(x.title)}</b>${x.minutes?` <span>${esc(x.minutes)} min</span>`:''}${v.offers_ce&&x.ce?` <span class="vl-ce" title="${esc(CE_NOTE)}">CE: ${esc(x.ce)} (vendor stated)</span>`:''}${!limit&&x.summary?`<small>${esc(x.summary)}</small>`:''}</li>`).join('')}${limit&&t.length>limit?`<li class="vl-muted">+${t.length-limit} more</li>`:''}</ul>`;
}

/* ------------------------------------------------------------------ calendar */
function calendar(el,{marks,selected,onPick,month}){
  const st={month:month||(selected?selected.slice(0,7):dayKey(new Date()).slice(0,7))};
  const draw=()=>{
    const [y,m]=st.month.split('-').map(Number);const first=new Date(y,m-1,1);const start=new Date(y,m-1,1-first.getDay());const today=dayKey(new Date());
    let cells='';for(let i=0;i<42;i++){const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);const k=dayKey(d);const mk=marks.get(k)||{};const out=d.getMonth()!==m-1;
      const cls=['vl-day',out?'out':'',k<today?'past':'',mk.open?'open':'',mk.taken&&!mk.open?'taken':'',mk.mine?'mine':'',k===selected?'sel':'',k===today?'today':''].filter(Boolean).join(' ');
      cells+=`<button type="button" class="${cls}" data-day="${k}" ${k<today?'disabled':''} aria-label="${esc(fmtDay(k))}${mk.open?`, ${mk.open} open`:''}${mk.taken?`, ${mk.taken} booked`:''}"><span>${d.getDate()}</span>${mk.open?`<i>${mk.open}</i>`:mk.taken?'<i class="t">•</i>':''}</button>`;}
    el.innerHTML=`<div class="vl-cal"><div class="vl-cal-head"><button type="button" class="vl-nav" data-mv="-1" aria-label="Previous month">‹</button><b>${first.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</b><button type="button" class="vl-nav" data-mv="1" aria-label="Next month">›</button></div><div class="vl-dow">${['S','M','T','W','T','F','S'].map(x=>`<span>${x}</span>`).join('')}</div><div class="vl-days">${cells}</div><div class="vl-legend"><span><i class="o"></i>Open</span><span><i class="b"></i>Booked</span></div></div>`;
    el.querySelectorAll('[data-mv]').forEach(b=>b.onclick=()=>{const d=new Date(y,m-1+Number(b.dataset.mv),1);st.month=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');draw();});
    el.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{selected=b.dataset.day;draw();onPick(selected);});
  };
  draw();return st;
}
function marksFor(slots,extra){const mk=new Map();slots.forEach(s=>{const k=dayKey(s.starts_at);const o=mk.get(k)||{open:0,taken:0};if(s.taken||s.is_closed)o.taken++;else o.open++;mk.set(k,o);});if(extra)extra(mk);return mk;}

/* ------------------------------------------------------------------ sheet */
function sheet(html){
  document.querySelector('.vl-overlay')?.remove();
  const ov=document.createElement('div');ov.className='dc-overlay vl-overlay';ov.innerHTML=`<div class="dc-sheet vl-sheet" role="dialog" aria-modal="true"><button type="button" class="dc-x vl-x" aria-label="Close">×</button>${html}</div>`;
  document.body.appendChild(ov);const close=()=>{ov.remove();document.removeEventListener('keydown',k);};
  function k(e){if(e.key==='Escape')close();}
  ov.querySelector('.vl-x').onclick=close;ov.onclick=e=>{if(e.target===ov)close();};document.addEventListener('keydown',k);
  return {el:ov.querySelector('.vl-sheet'),close};
}

function vendorSheet(v,opts={}){
  const site=cleanUrl(v.website);
  const prods=(v.products||[]).filter(Boolean);
  const s=sheet(`<span class="du-kicker">VENDOR${v.is_sample?' · SAMPLE (HQ ONLY)':''}</span><div class="vl-sheet-top"><span class="vl-logo lg">${esc(initials(v.company_name))}</span><div><h2>${esc(v.company_name)}</h2>${v.tagline?`<p class="vl-tag">${esc(v.tagline)}</p>`:''}</div></div>
    <div class="vl-chips">${(v.divisions||[]).map(c=>`<span class="vl-chip">${esc(divLabel(c))}</span>`).join('')}</div>
    ${v.about?`<p class="vl-about">${esc(v.about)}</p>`:''}
    <p class="vl-travel">${esc(travelText(v))}</p>
    <div class="vl-sec" data-sec="products"><h3>Products and systems</h3>${prods.length?`<ul class="vl-list">${prods.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>`:'<p class="vl-muted">None listed yet.</p>'}</div>
    <div class="vl-sec"><h3>Lunch and Learn topics</h3>${topicsHtml(v)}${v.offers_ce?`<p class="vl-ce-note">${v.ce_note?`<b>Vendor statement:</b> ${esc(v.ce_note)}<br>`:''}${esc(CE_NOTE)}</p>`:''}</div>
    <div class="vl-sec" data-sec="calendar"><h3>Availability</h3><p class="vl-muted">Pick a highlighted date to see open times. Times show in your time zone.</p><div class="vl-cal-host"></div><div class="vl-day-slots"></div></div>
    <div class="vl-sheet-actions">${site?`<a class="dc-btn ghost" href="${esc(site)}" target="_blank" rel="noopener">Vendor website ↗</a>`:''}${S.user&&v.owner_id!==S.user.id?`<button type="button" class="dc-btn ghost" data-vl-msg>Message vendor</button>`:''}</div>`);
  const el=s.el,slots=slotsOf(v.id);
  const days=openDays(v.id);let sel=opts.date&&days.includes(opts.date)?opts.date:(days[0]||null);
  const daySlots=el.querySelector('.vl-day-slots');
  const showDay=k=>{sel=k;const list=slots.filter(x=>dayKey(x.starts_at)===k);
    daySlots.innerHTML=`<h4>${esc(fmtDay(k))}</h4>`+(list.length?list.map(x=>`<div class="vl-slot ${x.taken?'taken':''}"><div><b>${fmtTime(x.starts_at)} to ${fmtTime(x.ends_at)}</b><small>${esc(MODES[x.mode]||x.mode)}${x.note?' · '+esc(x.note):''}</small></div>${x.taken?'<span class="vl-pill booked">Booked</span>':v.owner_id===S.user?.id?'<span class="vl-pill">Your slot</span>':`<button type="button" class="dc-btn primary sm" data-req="${x.id}">Request</button>`}</div>`).join(''):'<p class="vl-muted">No times on this date.</p>');
    daySlots.querySelectorAll('[data-req]').forEach(b=>b.onclick=()=>requestForm(v,slots.find(x=>x.id===b.dataset.req),daySlots,()=>showDay(k)));};
  calendar(el.querySelector('.vl-cal-host'),{marks:marksFor(slots),selected:sel,onPick:showDay});
  if(sel)showDay(sel);else daySlots.innerHTML='<p class="vl-muted">No open dates yet. Message the vendor to ask about other times.</p>';
  el.querySelector('[data-vl-msg]')?.addEventListener('click',async()=>{s.close();const r=await window.DrawUpConnect?.messageUser?.(v.owner_id,v.company_name);if(r==='unavailable')toast('Messaging is unavailable right now.',true);});
  if(opts.focus)setTimeout(()=>el.querySelector(`[data-sec="${opts.focus}"]`)?.scrollIntoView({block:'start',behavior:'smooth'}),60);
  return s;
}

function requestForm(v,slot,host,back){
  if(!S.user){signIn();return;}
  if(!S.firms?.length){host.innerHTML=`<div class="vl-note"><b>Requests are made for a firm.</b><p>Join your firm on DrawUp (or claim it) first, then request this time for the office.</p></div><button type="button" class="dc-btn ghost" data-back>Back to times</button>`;host.querySelector('[data-back]').onclick=back;return;}
  const topics=(Array.isArray(v.topics)?v.topics:[]).filter(x=>x?.title);
  host.innerHTML=`<form class="vl-form vl-req"><h4>Request ${esc(fmtWhen(slot.starts_at,slot.ends_at))}</h4>
    <label>For firm<select name="firm" required>${S.firms.map(f=>`<option value="${f.id}" ${f.id===S.firmId?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label>
    <label>Topic<select name="topic">${topics.map(t=>`<option>${esc(t.title)}</option>`).join('')}<option value="">Not sure yet, discuss with vendor</option></select></label>
    <div class="vl-two"><label>Expected attendees<input name="att" type="number" min="1" max="500" inputmode="numeric" placeholder="12"></label><label>Office or address<input name="loc" maxlength="200" placeholder="${slot.mode==='virtual'?'Virtual':'Office address'}"></label></div>
    <label>Message to vendor<textarea name="msg" rows="3" maxlength="1500" placeholder="Dietary needs, room setup, what the team is working on"></textarea></label>
    <div class="vl-row"><button type="submit" class="dc-btn primary">Send request</button><button type="button" class="dc-btn ghost" data-back>Back</button></div></form>`;
  const f=host.querySelector('form');f.querySelector('[data-back]').onclick=back;
  f.onsubmit=async e=>{e.preventDefault();const btn=f.querySelector('[type=submit]');btn.disabled=true;
    const firm=f.firm.value;const att=parseInt(f.att.value,10);
    const row={vendor_id:v.id,slot_id:slot.id,firm_id:firm,requested_by:S.user.id,starts_at:slot.starts_at,ends_at:slot.ends_at,topic:f.topic.value||null,attendees:att>0?Math.min(att,500):null,location:f.loc.value.trim()||null,message:f.msg.value.trim()||null};
    const {error}=await S.c.from('vendor_requests').insert(row);
    if(error){toast(errText(error),true);btn.disabled=false;return;}
    S.firmId=firm;toast('Request sent. The vendor will accept or decline.');
    host.innerHTML=`<div class="vl-note good"><b>Request sent.</b><p>Track it under Bookings. You will see the vendor's answer there.</p></div><button type="button" class="dc-btn ghost" data-back>Back to times</button>`;host.querySelector('[data-back]').onclick=back;
    S.view?.refreshCounts?.();};
}

/* ------------------------------------------------------------------ panes */
function matchLoc(v,q){q=q.toLowerCase();if(!q)return true;if(v.travels_nationwide)return true;if(/virtual|remote|online/.test(q))return !!v.virtual_ok;
  return [v.home_city,v.home_state,...(v.travel_areas||[])].filter(Boolean).some(x=>{x=x.toLowerCase();return x.includes(q)||q.includes(x);});}
function vendorCard(v,extra=''){
  const days=openDays(v.id);
  return `<article class="vl-card" data-vid="${v.id}"><div class="vl-card-top"><span class="vl-logo">${esc(initials(v.company_name))}</span><div class="vl-card-name"><h3>${esc(v.company_name)}</h3>${v.tagline?`<p>${esc(v.tagline)}</p>`:''}</div>${v.is_sample?'<span class="vl-pill">Sample · HQ only</span>':!v.is_published?'<span class="vl-pill">Hidden</span>':''}</div>
    ${extra}
    <div class="vl-chips">${(v.divisions||[]).slice(0,6).map(c=>`<span class="vl-chip" title="${esc(S.divMap[c]||'')}">${esc(divLabel(c))}</span>`).join('')}${(v.divisions||[]).length>6?`<span class="vl-chip">+${v.divisions.length-6}</span>`:''}</div>
    <p class="vl-travel">${esc(travelText(v))}</p>
    ${topicsHtml(v,2)}
    <div class="vl-next">${days.length?`<span class="vl-muted">Open:</span> ${days.slice(0,4).map(k=>`<button type="button" class="vl-date" data-open-day="${k}">${esc(fmtDay(k))}</button>`).join('')}${days.length>4?`<span class="vl-muted">+${days.length-4} more</span>`:''}`:'<span class="vl-muted">No open dates posted</span>'}</div>
    <div class="vl-actions"><button type="button" class="dc-btn primary sm" data-view="calendar">Calendar and request</button><button type="button" class="dc-btn ghost sm" data-view="products">Products and systems</button></div></article>`;
}
function wireCards(root){root.querySelectorAll('.vl-card').forEach(c=>{const v=S.listings.find(x=>x.id===c.dataset.vid);if(!v)return;
  c.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>vendorSheet(v,{focus:b.dataset.view}));
  c.querySelectorAll('[data-open-day]').forEach(b=>b.onclick=()=>vendorSheet(v,{focus:'calendar',date:b.dataset.openDay}));});}

function paneBrowse(p){
  const f=S.f;
  p.innerHTML=`<div class="vl-intro"><span class="du-kicker">VENDORS · LUNCH AND LEARNS</span><h2>Bring product experts to the office.</h2><p>Manufacturers and reps list what they teach, the scope they cover, where they travel and when they are free. Pick a time and request it for your firm.</p></div>
  <form class="vl-filters" autocomplete="off"><label><span>Scope</span><select name="div"><option value="">All divisions</option>${S.divs.map(d=>`<option value="${d.code}" ${f.div===d.code?'selected':''}>${esc(d.code+' '+d.name)}</option>`).join('')}</select></label>
  <label><span>Location</span><input name="loc" value="${esc(f.loc)}" placeholder="City, state or virtual"></label>
  <label><span>Available on</span><input name="date" type="date" value="${esc(f.date)}"></label>
  <label class="vl-check"><input type="checkbox" name="virtual" ${f.virtual?'checked':''}> Virtual OK</label>
  <button type="button" class="dc-btn ghost sm" data-clear>Clear</button></form>
  <p class="vl-count" aria-live="polite"></p><div class="vl-grid"></div>`;
  const form=p.querySelector('.vl-filters'),grid=p.querySelector('.vl-grid'),count=p.querySelector('.vl-count');
  const run=()=>{f.div=form.div.value;f.loc=form.loc.value.trim();f.date=form.date.value;f.virtual=form.virtual.checked;
    const rows=visibleListings().filter(v=>(!f.div||(v.divisions||[]).includes(f.div))&&matchLoc(v,f.loc)&&(!f.virtual||v.virtual_ok)&&(!f.date||openDays(v.id).includes(f.date)));
    count.textContent=`${rows.length} vendor${rows.length===1?'':'s'}${f.div||f.loc||f.date||f.virtual?' match your filters':''}`;
    grid.innerHTML=rows.length?rows.map(v=>vendorCard(v)).join(''):`<div class="vl-empty"><h3>${S.listings.length?'No vendors match these filters.':'No vendors have listed yet.'}</h3><p>${S.listings.length?'Try another division, a nearby city, or clear the date.':'Vendors and manufacturer reps can create a listing under My vendor listing.'}</p></div>`;
    wireCards(grid);
    if(f.date)grid.querySelectorAll('[data-view="calendar"]').forEach(b=>{const v=S.listings.find(x=>x.id===b.closest('.vl-card').dataset.vid);b.onclick=()=>vendorSheet(v,{focus:'calendar',date:f.date});});};
  form.oninput=run;form.onchange=run;form.onsubmit=e=>e.preventDefault();
  form.querySelector('[data-clear]').onclick=()=>{form.reset();form.div.value='';form.loc.value='';form.date.value='';form.virtual.checked=false;run();};
  run();
}

async function paneRecs(p){
  if(!S.user){p.innerHTML=`<div class="vl-empty"><h3>Sign in to see vendor recommendations.</h3><p>Recommendations come from your firm's active projects.</p><button type="button" class="dc-btn primary" data-si>Sign in</button></div>`;p.querySelector('[data-si]').onclick=signIn;return;}
  if(!S.firms.length){p.innerHTML=`<div class="vl-empty"><h3>Recommendations are for firms.</h3><p>Join or claim your firm on DrawUp. When the firm has an active project (In design, Under construction or Proposed), vendors whose scope matches it show up here.</p></div>`;return;}
  p.innerHTML=`<div class="vl-intro"><span class="du-kicker">RECOMMENDED FOR YOUR FIRM</span><h2>Vendors that fit your active projects.</h2><p>A vendor shows here when a scope word in one of your firm's active projects (for example “curtain wall” or “roofing”) belongs to a CSI division the vendor covers. See their options for the project, or book a Lunch and Learn for the office.</p></div>
    ${S.firms.length>1?`<label class="vl-firm"><span>Firm</span><select data-firm>${S.firms.map(f=>`<option value="${f.id}" ${f.id===S.firmId?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label>`:`<p class="vl-firm-one">${esc(S.firms[0].name)}</p>`}
    <div class="vl-recs"><p class="vl-muted">Matching your projects…</p></div>`;
  const out=p.querySelector('.vl-recs');
  const load=async()=>{out.innerHTML='<p class="vl-muted">Matching your projects…</p>';
    const {data,error}=await S.c.rpc('vendor_recommendations',{p_firm:S.firmId});
    if(error){out.innerHTML=`<p class="vl-err">${esc(errText(error))}</p>`;return;}
    const by=new Map();(data||[]).forEach(r=>{if(!by.has(r.vendor_id))by.set(r.vendor_id,[]);by.get(r.vendor_id).push(r);});
    const cards=[...by.entries()].map(([id,rs])=>{const v=S.listings.find(x=>x.id===id);if(!v)return '';
      const why=`<ul class="vl-why">${rs.map(r=>`<li>Matches your project <b>${esc(r.project_name)}</b>: ${esc('Division '+r.division_code+' '+r.division_name)} <small>(project mentions “${esc(r.keyword)}”${r.project_source==='workspace'?', workspace project':''})</small></li>`).join('')}</ul>`;
      return vendorCard(v,why);}).join('');
    out.innerHTML=cards||`<div class="vl-empty"><h3>No matches right now.</h3><p>None of this firm's active projects mention a scope that a listed vendor covers. Projects count when their status is In design, Under construction or Proposed, or when they are active firm workspace projects. Add scope words such as “curtain wall”, “roofing” or “lighting” to the project description to get matches.</p></div>`;
    out.querySelectorAll('.vl-card').forEach(c=>{const a=c.querySelector('[data-view="calendar"]');if(a)a.textContent='Book a Lunch and Learn';const b=c.querySelector('[data-view="products"]');if(b)b.textContent='See options for the project';});
    wireCards(out);};
  p.querySelector('[data-firm]')?.addEventListener('change',e=>{S.firmId=e.target.value;load();});
  await load();
}

function reqRow(r,side){
  const v=S.listings.find(x=>x.id===r.vendor_id)||(S.mine?.id===r.vendor_id?S.mine:null);
  const firm=S.firmNames?.get(r.firm_id)||'Firm';const who=S.people?.get(r.requested_by)||'A firm member';
  const acts=side==='in'&&r.status==='pending'?`<button type="button" class="dc-btn primary sm" data-acc="${r.id}">Accept</button><button type="button" class="dc-btn ghost sm" data-dec="${r.id}">Decline</button>`
    :side==='out'&&r.requested_by===S.user.id&&['pending','accepted'].includes(r.status)&&new Date(r.starts_at)>new Date()?`<button type="button" class="dc-btn ghost sm" data-cancel="${r.id}">Cancel request</button>`:'';
  return `<article class="vl-req-row s-${r.status}" data-rid="${r.id}"><div class="vl-req-main"><span class="vl-pill ${r.status==='accepted'?'booked':''}">${STATUS[r.status]||r.status}</span><b>${esc(fmtWhen(r.starts_at,r.ends_at))}</b>
    <small>${side==='in'?`${esc(firm)} · requested by ${esc(who)}`:`${esc(v?.company_name||'Vendor')} · for ${esc(firm)}`}</small>
    ${r.topic?`<small>Topic: ${esc(r.topic)}</small>`:''}${r.attendees||r.location?`<small>${r.attendees?esc(r.attendees)+' attendees':''}${r.attendees&&r.location?' · ':''}${r.location?esc(r.location):''}</small>`:''}
    ${r.message?`<p class="vl-msg">“${esc(r.message)}”</p>`:''}${r.vendor_note?`<p class="vl-msg">Vendor: “${esc(r.vendor_note)}”</p>`:''}</div>
    ${acts?`<div class="vl-req-acts">${side==='in'&&r.status==='pending'?'<input class="vl-input" data-note placeholder="Note to the firm (optional)" maxlength="500">':''}${acts}</div>`:''}</article>`;
}
async function paneBookings(p){
  if(!S.user){p.innerHTML=`<div class="vl-empty"><h3>Sign in to see bookings.</h3><button type="button" class="dc-btn primary" data-si>Sign in</button></div>`;p.querySelector('[data-si]').onclick=signIn;return;}
  p.innerHTML='<p class="vl-muted">Loading bookings…</p>';
  const {data,error}=await S.c.from('vendor_requests').select('*').order('starts_at',{ascending:true}).limit(400);
  if(error){p.innerHTML=`<p class="vl-err">${esc(errText(error))}</p>`;return;}
  const rows=data||[];const firmIds=[...new Set(rows.map(r=>r.firm_id))],ppl=[...new Set(rows.map(r=>r.requested_by))];
  const [fr,pr]=await Promise.all([firmIds.length?S.c.from('firms').select('id,name').in('id',firmIds):{data:[]},ppl.length?S.c.from('profiles').select('id,display_name,username').in('id',ppl):{data:[]}]);
  S.firmNames=new Map((fr.data||[]).map(f=>[f.id,f.name]));S.people=new Map((pr.data||[]).map(x=>[x.id,x.display_name||x.username||'DrawUp member']));
  const incoming=S.mine?rows.filter(r=>r.vendor_id===S.mine.id):[];const outgoing=rows.filter(r=>!S.mine||r.vendor_id!==S.mine.id);
  const now=new Date();const sortUp=a=>[...a.filter(r=>new Date(r.ends_at)>=now),...a.filter(r=>new Date(r.ends_at)<now).reverse()];
  p.innerHTML=`${S.mine?`<section class="vl-block"><div class="vl-block-head"><span class="du-kicker">REQUESTS TO ${esc(S.mine.company_name.toUpperCase())}</span><span class="vl-muted">${incoming.filter(r=>r.status==='pending').length} waiting</span></div>${incoming.length?sortUp(incoming).map(r=>reqRow(r,'in')).join(''):'<p class="vl-muted">No requests yet. Firms request times from your calendar.</p>'}</section>`:''}
    <section class="vl-block"><div class="vl-block-head"><span class="du-kicker">YOUR FIRM'S LUNCH AND LEARNS</span></div>${outgoing.length?sortUp(outgoing).map(r=>reqRow(r,'out')).join(''):`<p class="vl-muted">${S.firms.length?'No requests yet. Find a vendor and request a time.':'Requests are made for a firm you belong to.'}</p>`}</section>`;
  const reload=async()=>{await boot(true);paneBookings(p);};
  p.querySelectorAll('[data-acc],[data-dec]').forEach(b=>b.onclick=async()=>{const id=b.dataset.acc||b.dataset.dec;const accept=!!b.dataset.acc;const row=rows.find(r=>r.id===id);const note=b.closest('.vl-req-row').querySelector('[data-note]')?.value.trim()||null;
    b.disabled=true;const {data:d,error:e}=await S.c.from('vendor_requests').update({status:accept?'accepted':'declined',vendor_note:note,decided_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id).select('id');
    if(e||!d?.length){toast(e?errText(e):'The database did not confirm the change.',true);b.disabled=false;return;}
    if(accept&&row?.slot_id){await S.c.from('vendor_requests').update({status:'declined',vendor_note:'This time was booked by another firm.',decided_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('slot_id',row.slot_id).eq('status','pending');}
    toast(accept?'Accepted. The firm sees it as booked.':'Declined. The firm has been told.');reload();});
  p.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=async()=>{if(!confirm('Cancel this Lunch and Learn request?'))return;b.disabled=true;const {data:d,error:e}=await S.c.from('vendor_requests').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',b.dataset.cancel).select('id');if(e||!d?.length){toast(e?errText(e):'Not changed.',true);b.disabled=false;return;}toast('Request cancelled.');reload();});
}

function topicRow(t={},ce){return `<div class="vl-topic-row"><input data-t="title" maxlength="140" placeholder="Topic title" value="${esc(t.title||'')}"><input data-t="minutes" type="number" min="15" max="240" step="15" placeholder="Min" value="${esc(t.minutes||'')}"><input data-t="ce" maxlength="80" placeholder="CE stated, e.g. 1 LU|HSW" value="${esc(t.ce||'')}" ${ce?'':'hidden'}><input data-t="summary" maxlength="300" placeholder="One line summary (optional)" value="${esc(t.summary||'')}"><button type="button" class="dc-mini" data-rm aria-label="Remove topic">Remove</button></div>`;}
function paneMine(p){
  if(!S.user){p.innerHTML=`<div class="vl-empty"><h3>Are you a vendor or manufacturer rep?</h3><p>Sign in to create a listing, post your Lunch and Learn topics and open times.</p><button type="button" class="dc-btn primary" data-si>Sign in</button></div>`;p.querySelector('[data-si]').onclick=signIn;return;}
  const v=S.mine||{divisions:[],products:[],topics:[{}],travel_areas:[],is_published:true};
  p.innerHTML=`<div class="vl-intro"><span class="du-kicker">${S.mine?'MY VENDOR LISTING':'CREATE A VENDOR LISTING'}</span><h2>${S.mine?esc(S.mine.company_name):'Advocate what you offer.'}</h2><p>${S.mine?'Edit what firms see, then manage your calendar below.':'List the company you represent, the scope you cover, where you travel and your Lunch and Learn topics. Firms on DrawUp can then request your open times.'} Only you can edit this listing and its calendar.</p></div>
  <form class="vl-form vl-listing" autocomplete="off">
    <div class="vl-two"><label>Company or brand you represent<input name="company_name" required minlength="2" maxlength="120" value="${esc(v.company_name||'')}"></label><label>Short tagline<input name="tagline" maxlength="140" value="${esc(v.tagline||'')}" placeholder="What you help architects with"></label></div>
    <label>About<textarea name="about" rows="3" maxlength="2000">${esc(v.about||'')}</textarea></label>
    <div class="vl-two"><label>Website<input name="website" maxlength="300" value="${esc(v.website||'')}" placeholder="https://"></label><label>Contact email<input name="contact_email" type="email" maxlength="200" value="${esc(v.contact_email||'')}"></label></div>
    <fieldset><legend>Scope of work (CSI MasterFormat divisions)</legend><p class="vl-muted">Recommendations match these divisions to scope words in firms' active projects.</p><div class="vl-divs">${S.divs.map(d=>`<label class="vl-div"><input type="checkbox" name="div" value="${d.code}" ${(v.divisions||[]).includes(d.code)?'checked':''}><span><b>${d.code}</b> ${esc(d.name)}</span></label>`).join('')}</div></fieldset>
    <label>Products and systems (one per line)<textarea name="products" rows="4" maxlength="3000" placeholder="Unitized curtain wall&#10;Thermally broken storefront">${esc((v.products||[]).join('\n'))}</textarea></label>
    <fieldset><legend>Lunch and Learn topics</legend><label class="vl-check"><input type="checkbox" name="offers_ce" ${v.offers_ce?'checked':''}> We offer CE credits for some topics</label><p class="vl-ce-note" data-ce-note ${v.offers_ce?'':'hidden'}>${esc(CE_NOTE)}</p><label data-ce-note ${v.offers_ce?'':'hidden'}>CE statement (provider, approvals, in your words)<input name="ce_note" maxlength="300" value="${esc(v.ce_note||'')}"></label>
      <div class="vl-topic-list">${(v.topics?.length?v.topics:[{}]).map(t=>topicRow(t,v.offers_ce)).join('')}</div><button type="button" class="dc-btn ghost sm" data-add-topic>＋ Add topic</button></fieldset>
    <fieldset><legend>Where you travel</legend><div class="vl-two"><label>Home base city<input name="home_city" maxlength="80" value="${esc(v.home_city||'')}"></label><label>State<input name="home_state" maxlength="40" value="${esc(v.home_state||'')}"></label></div>
      <div class="vl-two"><label>Travel radius (miles)<input name="travel_radius_miles" type="number" min="0" max="3000" inputmode="numeric" value="${esc(v.travel_radius_miles??'')}"></label><label>Cities, metros or states you cover (comma separated)<input name="travel_areas" maxlength="600" value="${esc((v.travel_areas||[]).join(', '))}" placeholder="Atlanta, Charlotte, SC"></label></div>
      <label class="vl-check"><input type="checkbox" name="travels_nationwide" ${v.travels_nationwide?'checked':''}> Travels nationwide</label><label class="vl-check"><input type="checkbox" name="virtual_ok" ${v.virtual_ok?'checked':''}> Offers virtual sessions</label></fieldset>
    <label class="vl-check"><input type="checkbox" name="is_published" ${v.is_published!==false?'checked':''}> Show this listing to firms</label>
    <div class="vl-row"><button type="submit" class="dc-btn primary">${S.mine?'Save listing':'Create listing'}</button>${S.mine?'<button type="button" class="dc-btn ghost" data-preview>Preview as a firm</button>':''}</div></form>
  ${S.mine?`<section class="vl-block vl-mycal"><div class="vl-block-head"><span class="du-kicker">MY CALENDAR</span><span class="vl-muted">Firms see open times. Booked times show as booked, without firm names.</span></div><div class="vl-cal-split"><div class="vl-cal-host"></div><div class="vl-slot-editor"></div></div></section>`:''}`;
  const f=p.querySelector('.vl-listing');
  const ceToggle=()=>{const on=f.offers_ce.checked;f.querySelectorAll('[data-ce-note]').forEach(x=>x.hidden=!on);f.querySelectorAll('[data-t="ce"]').forEach(x=>x.hidden=!on);};
  f.offers_ce.onchange=ceToggle;
  f.querySelector('[data-add-topic]').onclick=()=>{const l=f.querySelector('.vl-topic-list');if(l.children.length>=12)return toast('Up to 12 topics.',true);l.insertAdjacentHTML('beforeend',topicRow({},f.offers_ce.checked));};
  f.addEventListener('click',e=>{const b=e.target.closest('[data-rm]');if(b)b.closest('.vl-topic-row').remove();});
  f.querySelector('[data-preview]')?.addEventListener('click',()=>vendorSheet(S.mine));
  f.onsubmit=async e=>{e.preventDefault();const btn=f.querySelector('[type=submit]');
    const divs=[...f.querySelectorAll('[name=div]:checked')].map(x=>x.value);if(!divs.length)return toast('Pick at least one division so firms can find you.',true);
    const ce=f.offers_ce.checked;
    const topics=[...f.querySelectorAll('.vl-topic-row')].map(r=>{const g=k=>r.querySelector(`[data-t="${k}"]`).value.trim();const m=parseInt(g('minutes'),10);return {title:g('title'),minutes:m>0?m:null,ce:ce?g('ce')||null:null,summary:g('summary')||null};}).filter(t=>t.title);
    const site=f.website.value.trim();if(site&&!cleanUrl(site))return toast('Check the website address.',true);
    const rad=parseInt(f.travel_radius_miles.value,10);
    const row={company_name:f.company_name.value.trim(),tagline:f.tagline.value.trim()||null,about:f.about.value.trim()||null,website:site?cleanUrl(site):null,contact_email:f.contact_email.value.trim()||null,
      divisions:divs,products:String(f.products.value).split('\n').map(s=>s.trim()).filter(Boolean).slice(0,40),topics,offers_ce:ce,ce_note:ce?f.ce_note.value.trim()||null:null,
      home_city:f.home_city.value.trim()||null,home_state:f.home_state.value.trim()||null,travel_radius_miles:rad>=0?Math.min(rad,3000):null,travel_areas:lines(f.travel_areas.value).slice(0,30),
      travels_nationwide:f.travels_nationwide.checked,virtual_ok:f.virtual_ok.checked,is_published:f.is_published.checked,updated_at:new Date().toISOString()};
    btn.disabled=true;
    const r=S.mine?await S.c.from('vendor_listings').update(row).eq('id',S.mine.id).select('*'):await S.c.from('vendor_listings').insert({...row,owner_id:S.user.id}).select('*');
    btn.disabled=false;
    if(r.error||!r.data?.length){toast(r.error?errText(r.error):'The database did not confirm the save.',true);return;}
    const first=!S.mine;S.mine=r.data[0];toast(first?'Listing created. Now add open times to your calendar.':'Listing saved.');
    await boot(true);paneMine(p);if(first)setTimeout(()=>p.querySelector('.vl-mycal')?.scrollIntoView({behavior:'smooth',block:'start'}),80);};
  if(S.mine)myCalendar(p.querySelector('.vl-mycal'));
}

async function myCalendar(sec){
  const {data,error}=await S.c.from('vendor_slots').select('*').eq('vendor_id',S.mine.id).gte('ends_at',new Date(Date.now()-864e5*31).toISOString()).order('starts_at').limit(1000);
  if(error){sec.insertAdjacentHTML('beforeend',`<p class="vl-err">${esc(errText(error))}</p>`);return;}
  const req=await S.c.from('vendor_requests').select('slot_id,status').eq('vendor_id',S.mine.id);
  const reqBySlot=new Map();(req.data||[]).forEach(r=>{if(!r.slot_id)return;const o=reqBySlot.get(r.slot_id)||{n:0,acc:false};o.n++;if(r.status==='accepted')o.acc=true;reqBySlot.set(r.slot_id,o);});
  const slots=(data||[]).map(s=>({...s,taken:!!reqBySlot.get(s.id)?.acc}));
  const ed=sec.querySelector('.vl-slot-editor');let sel=S.mySel||dayKey(new Date(Date.now()+864e5));
  const redraw=()=>myCalendar(sec);
  const showDay=k=>{sel=k;S.mySel=k;const list=slots.filter(s=>dayKey(s.starts_at)===k);
    ed.innerHTML=`<h4>${esc(fmtDay(k))}</h4>${list.length?list.map(s=>{const rq=reqBySlot.get(s.id);return `<div class="vl-slot ${s.taken?'taken':''} ${s.is_closed?'closed':''}"><div><b>${fmtTime(s.starts_at)} to ${fmtTime(s.ends_at)}</b><small>${esc(MODES[s.mode])}${s.note?' · '+esc(s.note):''}${s.is_closed?' · closed':''}${rq?` · ${rq.n} request${rq.n===1?'':'s'}`:''}</small></div>${s.taken?'<span class="vl-pill booked">Booked</span>':rq?`<button type="button" class="dc-btn ghost sm" data-close="${s.id}" data-val="${s.is_closed?'0':'1'}">${s.is_closed?'Reopen':'Close'}</button>`:`<button type="button" class="dc-btn ghost sm" data-del="${s.id}">Delete</button>`}</div>`;}).join(''):'<p class="vl-muted">No times on this date.</p>'}
      <form class="vl-form vl-add-slot"><h4>Add an open time</h4><div class="vl-three"><label>Start<input name="t" type="time" value="11:30" required></label><label>Length<select name="len">${[30,45,60,75,90,120].map(m=>`<option value="${m}" ${m===60?'selected':''}>${m} min</option>`).join('')}</select></label><label>Format<select name="mode">${Object.entries(MODES).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></label></div>
      <div class="vl-two"><label>Repeat weekly<select name="rep">${[1,2,3,4,6,8].map(n=>`<option value="${n}">${n===1?'Just this date':n+' weeks'}</option>`).join('')}</select></label><label>Note (optional)<input name="note" maxlength="160" placeholder="Lunch provided"></label></div>
      <button type="submit" class="dc-btn primary sm">Add time</button></form>`;
    const af=ed.querySelector('.vl-add-slot');
    af.onsubmit=async e=>{e.preventDefault();const [y,m,d]=k.split('-').map(Number);const [hh,mm]=af.t.value.split(':').map(Number);const len=Number(af.len.value),rep=Number(af.rep.value);
      const rows=[];for(let i=0;i<rep;i++){const st=new Date(y,m-1,d+7*i,hh,mm);if(st<=new Date())continue;rows.push({vendor_id:S.mine.id,starts_at:st.toISOString(),ends_at:new Date(st.getTime()+len*60000).toISOString(),mode:af.mode.value,note:af.note.value.trim()||null});}
      if(!rows.length)return toast('Pick a time in the future.',true);
      const b=af.querySelector('[type=submit]');b.disabled=true;const {error:e2}=await S.c.from('vendor_slots').insert(rows);b.disabled=false;
      if(e2)return toast(errText(e2),true);toast(rows.length>1?`${rows.length} times added.`:'Time added.');await boot(true);redraw();};
    ed.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{b.disabled=true;const {error:e3}=await S.c.from('vendor_slots').delete().eq('id',b.dataset.del);if(e3){toast(errText(e3),true);b.disabled=false;return;}toast('Time removed.');await boot(true);redraw();});
    ed.querySelectorAll('[data-close]').forEach(b=>b.onclick=async()=>{b.disabled=true;const {error:e4}=await S.c.from('vendor_slots').update({is_closed:b.dataset.val==='1'}).eq('id',b.dataset.close);if(e4){toast(errText(e4),true);b.disabled=false;return;}await boot(true);redraw();});
  };
  calendar(sec.querySelector('.vl-cal-host'),{marks:marksFor(slots),selected:sel,onPick:showDay});showDay(sel);
}

/* ------------------------------------------------------------------ view inside a Connect hub */
async function render(body,hub,sub){
  if(sub)S.sub=sub;
  body.innerHTML='';const wrap=document.createElement('div');wrap.className='vl-wrap';body.appendChild(wrap);
  wrap.innerHTML=`<nav class="vl-sub" role="tablist" aria-label="Vendors">${SUBS.map(([k,l])=>`<button type="button" role="tab" data-vsub="${k}" class="${k===S.sub?'active':''}" aria-selected="${k===S.sub}">${l}<i class="dc-badge" data-vbadge="${k}" hidden></i></button>`).join('')}</nav><div class="vl-pane"><p class="vl-muted">Loading vendors…</p></div>`;
  const pane=wrap.querySelector('.vl-pane');
  const show=async k=>{S.sub=k;wrap.querySelectorAll('[data-vsub]').forEach(b=>{b.classList.toggle('active',b.dataset.vsub===k);b.setAttribute('aria-selected',b.dataset.vsub===k);});
    try{await boot();}catch(e){pane.innerHTML=`<div class="vl-empty"><h3>Vendors are unavailable.</h3><p>${esc(errText(e))}</p></div>`;return;}
    if(!wrap.isConnected)return;
    if(k==='browse')paneBrowse(pane);else if(k==='recs')await paneRecs(pane);else if(k==='bookings')await paneBookings(pane);else paneMine(pane);
    counts();};
  const counts=async()=>{if(!S.user||!wrap.isConnected)return;const b=wrap.querySelector('[data-vbadge="bookings"]');if(!S.mine){b.hidden=true;return;}
    const {count}=await S.c.from('vendor_requests').select('id',{count:'exact',head:true}).eq('vendor_id',S.mine.id).eq('status','pending');b.hidden=!count;b.textContent=count>9?'9+':String(count||'');};
  S.view={refreshCounts:counts};
  wrap.querySelectorAll('[data-vsub]').forEach(b=>b.onclick=()=>show(b.dataset.vsub));
  await show(S.sub);
}

function hubFor(el){const C=window.DrawUpConnect;return C?.hubs?[...C.hubs].find(h=>h.root?.contains(el)):null;}
async function openIn(hub,sub){
  if(!hub?.root?.isConnected)return false;
  if(typeof hub.go==='function')hub.go('vendors');
  try{sessionStorage.setItem(OPEN_KEY+(hub.mode||''),'1');}catch(_e){}
  const body=hub.root.querySelector('.dc-body');if(!body)return false;body.className='dc-body dc-vendors';
  await render(body,hub,sub);return true;
}
function inject(tabs){
  if(tabs.querySelector('[data-dc-sec="vendors"]'))return;
  const b=document.createElement('button');b.type='button';b.setAttribute('role','tab');b.dataset.dcSec='vendors';b.dataset.vlTab='1';b.innerHTML='Vendors<span class="vl-tab-sub"> · Lunch and Learns</span>';
  tabs.appendChild(b);
  b.onclick=()=>openIn(hubFor(b));
  tabs.addEventListener('click',e=>{const t=e.target.closest('[data-dc-sec]');if(t&&t!==b){const h=hubFor(tabs);try{sessionStorage.removeItem(OPEN_KEY+(h?.mode||''));}catch(_e){}}});
  let want=false;const h=hubFor(tabs);try{want=sessionStorage.getItem(OPEN_KEY+(h?.mode||tabs.closest('.dc-hub')?.dataset.mode||''))==='1';}catch(_e){}
  if(want)setTimeout(()=>{const hh=hubFor(tabs);if(hh&&tabs.isConnected)openIn(hh);},450);
}
function scan(){document.querySelectorAll('.dc-hub .dc-tabs').forEach(inject);}
const mo=new MutationObserver(()=>scan());
function start(){scan();mo.observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();

/* Public API: open the Vendors tab (optionally a sub view: browse, recs, bookings, mine). */
window.DrawUpVendors={
  async open(sub){
    let h=[...(window.DrawUpConnect?.hubs||[])].find(x=>x.root?.isConnected&&x.root.offsetParent!==null);
    if(!h){const portal=document.getElementById('du-portal')?.classList.contains('open')&&window.DrawUpPortal?.openPortalTab;
      if(portal)await window.DrawUpPortal.openPortalTab('connect');else{location.hash='#connect';}
      for(let i=0;i<60&&!h;i++){await sleep(100);h=[...(window.DrawUpConnect?.hubs||[])].find(x=>x.root?.isConnected&&x.root.offsetParent!==null&&x.root.querySelector('[data-dc-sec="vendors"]'));}}
    return h?openIn(h,sub):false;
  },
  reload:()=>boot(true)
};
})();
