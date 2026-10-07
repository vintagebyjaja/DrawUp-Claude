/* DrawUp V20: keyboard shortcuts for computer users.
   ?          show / hide the shortcut sheet
   [  ]       previous / next tab on the current page (Profile, Discover, Connect, Firm admin…)
   1 – 9      jump to that tab on the current page
   /          focus the search box on the current page
   g then a key   go to a Portal tab (g d Dashboard, g p Profile, g c Arch Coach …)
   Draw: V select, W exterior wall, P partition, D door, N window, O opening, A room,
         C column, S stair, F fixture, T text, L dimension, M measure (R rotate, Del, arrows, Ctrl+Z already exist)
   Shortcuts never fire while typing in a box, and are not shown on phones. */
(function(){
'use strict';
const DRAW_KEYS={v:'select',w:'wall',p:'partition',d:'door',n:'window',o:'cased',a:'room',c:'column',s:'stair',f:'fixture',t:'text',l:'dim',m:'measure'};
const GO_KEYS={d:['dashboard','Dashboard'],s:['search','Search'],p:['profile','Profile'],j:['projects','Projects'],w:['draw','Draw'],c:['arch-coach','Arch Coach'],k:['check','Check'],x:['swap','Swap'],e:['details','Details'],v:['discover','Discover'],m:['connect','Connect'],f:['firm','Firm'],t:['team','Team'],a:['account','Account']};
const TAB_GROUPS='.du-subtabs,.subtabs,.dc-tabs,.du-fp-tabs,[role="tablist"]';
const typing=t=>!!t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const visible=el=>!!el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
const portalOpen=()=>!!document.getElementById('du-portal')?.classList.contains('open');
function scope(){
  const overlay=[...document.querySelectorAll('#du-uni,#du-showcase,#du-v19-person')].find(visible);if(overlay)return overlay;
  if(portalOpen())return document.getElementById('du-workspace-content')||document;
  return [...document.querySelectorAll('section.page')].find(p=>!p.hidden&&visible(p))||document;
}
function drawTools(){const t=portalOpen()&&document.querySelector('#du-workspace-content .du-draw-tools');return t&&visible(t)?t:null;}
function tabGroup(){
  const s=scope();
  return [...s.querySelectorAll(TAB_GROUPS)].find(g=>visible(g)&&!g.closest('.du-draw-tools')&&g.querySelectorAll('button,a').length>1)||null;
}
function tabsOf(g){return [...g.querySelectorAll('button,a,[role="tab"]')].filter(b=>visible(b)&&!b.disabled);}
function activeIndex(list){const i=list.findIndex(b=>b.classList.contains('active')||b.classList.contains('on')||b.getAttribute('aria-selected')==='true'||b.getAttribute('aria-current')==='page');return i;}
function flash(msg){let el=document.getElementById('du-keys-toast');if(!el){el=document.createElement('div');el.id='du-keys-toast';document.body.appendChild(el);}el.textContent=msg;el.classList.add('on');clearTimeout(flash.t);flash.t=setTimeout(()=>el.classList.remove('on'),1100);}
function sheet(){
  const old=document.getElementById('du-keys-sheet');if(old){old.remove();return;}
  const row=(k,l)=>`<li><span>${k.split(' ').map(x=>`<kbd>${x}</kbd>`).join(' ')}</span><b>${l}</b></li>`;
  const draw=[['V','Select'],['W','Exterior wall'],['P','Partition'],['D','Door'],['N','Window'],['O','Opening'],['A','Room'],['C','Column'],['S','Stair'],['F','Fixture'],['T','Text'],['L','Dimension'],['M','Measure'],['R','Rotate selected'],['Del','Delete selected'],['Ctrl Z','Undo'],['Esc','Cancel']];
  document.body.insertAdjacentHTML('beforeend',`<div id="du-keys-sheet" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts"><div class="du-keys-card"><button type="button" class="du-keys-x" aria-label="Close">×</button><span class="du-kicker">DRAWUP</span><h2>Keyboard shortcuts</h2>
  <div class="du-keys-cols"><section><h3>Anywhere</h3><ul>${row('?','Show or hide this sheet')}${row('[ ]','Previous or next tab on this page')}${row('1 – 9','Jump to a tab on this page')}${row('/','Search on this page')}${row('Esc','Close a panel')}</ul>
  <h3>Go to (Portal)</h3><ul>${Object.entries(GO_KEYS).map(([k,[,l]])=>row('G '+k.toUpperCase(),l)).join('')}</ul></section>
  <section><h3>Draw</h3><ul>${draw.map(([k,l])=>row(k,l)).join('')}</ul></section></div><p class="du-keys-note">Shortcuts pause while you are typing in a box.</p></div></div>`);
  const s=document.getElementById('du-keys-sheet');s.onclick=e=>{if(e.target===s||e.target.closest('.du-keys-x'))s.remove();};
}
let goPending=0;
document.addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||typing(e.target))return;
  const k=e.key;
  if(k==='?'){e.preventDefault();sheet();return;}
  if(k==='Escape'){const s=document.getElementById('du-keys-sheet');if(s){s.remove();e.preventDefault();}return;}
  if(document.getElementById('du-keys-sheet'))return;
  const low=k.length===1?k.toLowerCase():k;
  if(goPending&&Date.now()-goPending<1500){goPending=0;const g=GO_KEYS[low];if(g&&portalOpen()&&window.DrawUpPortal?.openPortalTab){e.preventDefault();window.DrawUpPortal.openPortalTab(g[0]);flash('Go to '+g[1]);}return;}
  goPending=0;
  const tools=drawTools();
  if(tools&&!e.shiftKey&&DRAW_KEYS[low]){const b=tools.querySelector(`[data-tool="${DRAW_KEYS[low]}"]`);if(b){e.preventDefault();b.click();flash(b.textContent.trim());}return;}
  if(low==='g'&&portalOpen()){goPending=Date.now();return;}
  if(k==='/'){const box=[...scope().querySelectorAll('input[type="search"],input[placeholder*="earch"],input.world-input,input.people-search')].find(visible);if(box){e.preventDefault();box.focus();box.select?.();}return;}
  if(k==='['||k===']'||/^[1-9]$/.test(k)){
    if(tools)return;
    const g=tabGroup();if(!g)return;const list=tabsOf(g);if(list.length<2)return;
    let i=activeIndex(list);
    if(k===']')i=(i+1+list.length)%list.length;else if(k==='[')i=(i-1+list.length)%list.length;else{i=+k-1;if(i>=list.length)return;}
    e.preventDefault();list[i].click();list[i].focus({preventScroll:true});flash(list[i].textContent.trim().replace(/\s+/g,' ').slice(0,40));
  }
});
// Show the key letter on Draw buttons (desktop only, via CSS) and a small shortcuts button on the profile + draw headers.
const inv=Object.fromEntries(Object.entries(DRAW_KEYS).map(([k,v])=>[v,k.toUpperCase()]));
new MutationObserver(()=>{
  document.querySelectorAll('.du-draw-tools [data-tool]:not([data-key])').forEach(b=>{const key=inv[b.dataset.tool];if(key){b.dataset.key=key;b.title=(b.title?b.title+' ':'')+'('+key+')';}});
  document.querySelectorAll('.du-profile-cover:not([data-keys]),.du-draw-tools:not([data-keys])').forEach(h=>{h.dataset.keys='1';if(h.classList.contains('du-draw-tools')&&(h.parentElement?.closest('.du-draw-tools')||h.parentElement?.querySelector('.du-keys-btn')))return;const b=document.createElement('button');b.type='button';b.className='du-keys-btn';b.textContent='⌨ Shortcuts (?)';b.onclick=sheet;h.appendChild(b);});
}).observe(document.documentElement,{childList:true,subtree:true});
window.DrawUpKeys={sheet};
})();
