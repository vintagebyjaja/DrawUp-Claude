/* DrawUp V20: personal Arch Coach ("My Player" style).
 *
 * - After sign-in, members who have not chosen yet get a dismissible "Create your Arch Coach" prompt
 *   (or one tap for the generic hologram coach). The choice is saved in arch_coach_profiles.
 * - Creator: illustrated layered SVG avatar drawn in code (every skin tone works with every gender),
 *   outfit, hologram mode, blueprint + 14 skill sliders under an XP point budget, Inspiration Legends.
 * - Adds an Arch Coach card to Portal > Profile, an "Edit coach" button to the Arch Coach tab header,
 *   and the coach avatar next to each Arch Coach answer.
 * XP is earned on the server only. The database re-checks the budget and legend locks on every save.
 */
(()=>{'use strict';
if(window.DrawUpCoach)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];

/* =================================================================== options */
const SKIN=[['#3b2219','Deep espresso'],['#5a3825','Espresso'],['#734a2e','Chestnut'],['#8d5524','Mahogany'],['#a86b3c','Caramel'],['#c68642','Honey'],['#d9a066','Golden'],['#e8b98a','Sand'],['#f1c9a0','Light'],['#ffdcc0','Fair']];
const HAIRC=[['#151515','Black'],['#3b2417','Dark brown'],['#6a4328','Brown'],['#8a3b1f','Auburn'],['#c9a05a','Blonde'],['#e6dfcf','Platinum'],['#9a9a9a','Gray'],['#2fb7c9','Hologram teal']];
const FACES=['Oval','Round','Square','Heart','Long','Diamond'];
const HAIRS=['Bald','Buzz','Fade','Curly top','Afro','Locs','Braids','Ponytail','Long','Bun','Waves'];
const GENDERS=[['male','Male','♂'],['female','Female','♀'],['nonbinary','Non-binary','⚥']];
const OUTFITS=[['drawup_hoodie','DrawUp Hoodie'],['hoodie','Hoodie'],['suit','Suit'],['suit_no_tie','Suit (No Tie)'],['tshirt','T-Shirt'],['polo','Polo']];
const HOLOS=[['classic','Classic'],['wireframe','Wireframe'],['blueprint','Blueprint'],['energy','Energy']];
const GROUPS=[
  ['create','CREATE','Turn ideas into spaces','#ff8a3d',[['design','Design'],['render','Render'],['space_planning','Space Planning']]],
  ['analyze','ANALYZE','Study · explore · understand','#3fd0ff',[['research','Research'],['precedents','Precedents'],['problem_solving','Problem Solving']]],
  ['verify','VERIFY','Check · comply · validate','#3ee08f',[['code_compliance','Code Compliance'],['accessibility','Accessibility'],['materials','Materials']]],
  ['learn','LEARN','Grow · discover · stay current','#ffd23f',[['curiosity','Curiosity'],['details','Details'],['documentation','Documentation']]],
  ['advise','ADVISE','Guide · support · mentor','#a77bff',[['advice','Advice'],['presentation','Presentation']]]];
const KEYS=GROUPS.flatMap(g=>g[4].map(s=>s[0]));
const PROF={design:66,render:60,space_planning:64,research:72,precedents:70,problem_solving:68,code_compliance:64,accessibility:62,materials:62,curiosity:70,details:62,documentation:64,advice:68,presentation:62};
const ARCH=[['College Professor','Explains the why, connects to fundamentals, suggests what to study next.'],
  ['Visionary','Leads with concept and design intent, then grounds it in constraints.',['design','render','space_planning'],['precedents','presentation']],
  ['Code Specialist','Leads with governing requirements and what the AHJ must confirm.',['code_compliance','accessibility','documentation'],['research','details']],
  ['Master Builder','Leads with constructability, sequencing, materials and details.',['details','materials','documentation'],['problem_solving','code_compliance']],
  ['Researcher','Leads with evidence, precedents and sources.',['research','precedents','curiosity'],['problem_solving','documentation']],
  ['Mentor','Coaches you as a growing professional: next steps and presentation.',['advice','presentation','curiosity'],['research','design']]];
const DISC=['Architecture','Interior Design','Landscape Architecture','Structural Engineering','MEP Engineering','Civil Engineering','Construction Management','Urban Planning'];
const FOCUS=['Design','Codes and compliance','Technical detailing','Sustainability','Project delivery','Research','Portfolio and career'];
const STYLES=[['concise','Concise'],['balanced','Balanced'],['in_depth','In-depth']];
const LANGS=[['auto','Match my question'],['en','English'],['es','Español'],['fr','Français'],['pt','Português'],['zh','中文'],['ar','العربية'],['hi','हिन्दी'],['de','Deutsch'],['ja','日本語'],['ko','한국어'],['tl','Tagalog'],['vi','Tiếng Việt'],['it','Italiano']];
const STEPS=[['appearance','Appearance'],['outfit','Outfit'],['hologram','Hologram'],['skills','Skills'],['legend','Legend'],['confirm','Confirm']];
const MIN=25,MAX=99;
const budget=xp=>Math.min(1190,920+Math.floor(Math.max(0,xp||0)/20));
const level=xp=>1+Math.floor(Math.sqrt(Math.max(0,xp||0)/25));
const levelXp=l=>25*(l-1)*(l-1);
const total=s=>KEYS.reduce((a,k)=>a+(+s[k]||0),0);
const DEFAULT_LOOK={gender:'male',skin:3,face:0,hair:2,hairColor:0,outfit:'drawup_hoodie',holo:'classic',glasses:false};
const GENERIC_LOOK={generic:true,gender:'nonbinary',skin:5,face:0,hair:2,hairColor:0,outfit:'drawup_hoodie',holo:'classic',glasses:false};
function preset(name){const a=ARCH.find(x=>x[0]===name);if(!a||!a[2])return {...PROF};const s={};KEYS.forEach(k=>s[k]=60);a[2].forEach(k=>s[k]=78);a[3].forEach(k=>s[k]=70);return s;}

/* =================================================================== avatar (layered SVG) */
function shade(hex,amt){const n=parseInt(hex.slice(1),16);let r=n>>16,g=n>>8&255,b=n&255;const f=v=>Math.max(0,Math.min(255,Math.round(amt<0?v*(1+amt):v+(255-v)*amt)));return '#'+[f(r),f(g),f(b)].map(v=>v.toString(16).padStart(2,'0')).join('');}
const HEADS=[
  'M100 50C122 50 131 68 131 90C131 114 118 132 100 132C82 132 69 114 69 90C69 68 78 50 100 50Z',
  'M100 52C124 52 133 70 133 92C133 116 120 130 100 130C80 130 67 116 67 92C67 70 76 52 100 52Z',
  'M100 50C124 50 131 64 131 86L130 112C128 124 116 131 100 131C84 131 72 124 70 112L69 86C69 64 76 50 100 50Z',
  'M100 50C125 50 133 66 132 86C131 106 116 126 100 133C84 126 69 106 68 86C67 66 75 50 100 50Z',
  'M100 46C120 46 128 64 128 90C128 118 116 136 100 136C84 136 72 118 72 90C72 64 80 46 100 46Z',
  'M100 50C114 50 124 62 132 88C128 110 116 130 100 133C84 130 72 110 68 88C76 62 86 50 100 50Z'];
const CAP='M69 88C68 60 82 49 100 49C118 49 132 60 131 88C127 70 116 63 100 63C84 63 73 70 69 88Z';
const TALL='M68 90C64 52 84 40 100 40C116 40 136 52 132 90C126 70 116 62 100 62C84 62 74 70 68 90Z';
const PART='M68 92C64 54 84 42 102 42C120 42 136 56 132 92C128 74 118 60 96 62C84 64 74 74 68 92Z';
function hairLayers(i,c){
  const hi=shade(c,.25),f=(d,o)=>`<path d="${d}" fill="${c}"${o?` opacity="${o}"`:''}/>`;
  switch(i){
    case 1:return ['',f(CAP,.88)];
    case 2:return ['',f(CAP,.55)+f('M72 80C68 50 84 38 101 38C120 38 134 50 129 80C126 64 117 57 100 57C83 57 74 64 72 80Z')];
    case 3:{let s=f(CAP,.6);[[74,58],[84,52],[94,49],[104,49],[114,52],[124,58],[79,46],[89,41],[99,39],[109,41],[119,46]].forEach(([x,y])=>s+=`<circle cx="${x}" cy="${y}" r="8.5" fill="${c}"/><circle cx="${x-2}" cy="${y-2}" r="2.4" fill="${hi}" opacity=".5"/>`);return ['',s];}
    case 4:return [`<circle cx="100" cy="74" r="50" fill="${c}"/><circle cx="100" cy="74" r="50" fill="none" stroke="${hi}" stroke-width="2" stroke-dasharray="2 5" opacity=".5"/>`,f('M70 86C66 56 82 44 100 44C118 44 134 56 130 86C126 68 116 60 100 60C84 60 74 68 70 86Z')];
    case 5:{let b='';for(let x=64;x<=136;x+=9)b+=`<rect x="${x-3.5}" y="68" width="7.5" height="${90+((x*7)%20)}" rx="3.7" fill="${c}"/>`;return [b,f(TALL)+`<path d="M78 60C82 70 80 78 76 84M122 60C118 70 120 78 124 84" stroke="${c}" stroke-width="7" stroke-linecap="round" fill="none"/>`];}
    case 6:{let b='';[[70,1],[130,-1]].forEach(([x,d])=>{for(let k=0;k<7;k++)b+=`<ellipse cx="${x-d*k*.6}" cy="${110+k*9}" rx="5" ry="6" fill="${c}" stroke="${hi}" stroke-width=".8"/>`;});return [b,f(CAP)+`<path d="M78 66C88 56 92 54 100 52M86 62C94 58 100 57 104 56M96 60C104 59 110 58 116 58M106 62C114 62 120 64 124 68" stroke="${hi}" stroke-width="1.4" fill="none" opacity=".7"/>`];}
    case 7:return [f('M118 52C150 50 158 92 148 132C144 148 132 152 130 142C140 112 136 82 118 66Z'),f(PART)];
    case 8:return [f('M64 90C60 50 82 36 100 36C118 36 140 50 136 90L142 172C120 180 80 180 58 172Z'),f('M68 92C64 54 82 42 100 42C120 42 136 54 132 92C128 72 120 62 108 60C96 70 82 74 68 92Z')];
    case 9:return [`<circle cx="100" cy="40" r="15" fill="${c}"/><circle cx="96" cy="36" r="4" fill="${hi}" opacity=".45"/>`,f(TALL)];
    case 10:return [f('M66 92C60 54 82 38 100 38C118 38 140 54 134 92L136 128C128 134 122 130 124 118L76 118C78 130 72 134 64 128Z'),f(PART)+`<path d="M74 70C82 64 88 66 94 60M104 56C112 60 118 58 126 66" stroke="${hi}" stroke-width="1.6" fill="none" opacity=".6"/>`];
    default:return ['',''];
  }
}
function outfitSVG(o,sw){
  const L=100-sw,R=100+sw;
  const torso=fill=>`<path d="M${L} 250L${L} 198C${L} 174 ${L+12} 164 84 157L116 157C${R-12} 164 ${R} 174 ${R} 198L${R} 250Z" fill="${fill}" stroke="rgba(255,255,255,.14)" stroke-width="1"/>`;
  const strings=c=>`<path d="M93 166V194M107 166V194" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/><circle cx="93" cy="195" r="2.2" fill="${c}"/><circle cx="107" cy="195" r="2.2" fill="${c}"/>`;
  const hood=c=>`<path d="M74 152C78 178 122 178 126 152C118 168 82 168 74 152Z" fill="${c}"/>`;
  const pocket=c=>`<path d="M74 222L82 206H118L126 222V240H74Z" fill="${c}" opacity=".55"/>`;
  switch(o){
    case 'hoodie':return torso('#8e939c')+hood('#6f747d')+pocket('#7b8089')+strings('#f2f2f2');
    case 'suit':return torso('#1c2a48')+'<path d="M86 157L100 200L114 157Z" fill="#f4f6fa"/><path d="M96.5 160H103.5L105.5 194L100 203L94.5 194Z" fill="#c8512b"/><path d="M84 157L100 202L91 178L78 168Z" fill="#14203a"/><path d="M116 157L100 202L109 178L122 168Z" fill="#14203a"/><circle cx="100" cy="214" r="2.2" fill="#0b1426"/><circle cx="100" cy="226" r="2.2" fill="#0b1426"/>';
    case 'suit_no_tie':return torso('#2b2f36')+'<path d="M86 157L100 200L114 157Z" fill="#cfe0f4"/><path d="M92 157L100 172L108 157Z" fill="var(--ac-skin)"/><path d="M84 157L100 202L91 178L78 168Z" fill="#1f2228"/><path d="M116 157L100 202L109 178L122 168Z" fill="#1f2228"/><circle cx="100" cy="216" r="2.2" fill="#15171b"/>';
    case 'tshirt':return torso('#f3f5f8')+'<path d="M84 157C88 168 112 168 116 157" stroke="#cfd5de" stroke-width="4" fill="none"/><text x="100" y="206" text-anchor="middle" font-size="11" font-weight="900" font-family="Archivo,Arial,sans-serif" fill="#101828" letter-spacing="1">DR<tspan fill="#ff8a3d">A</tspan>WUP</text>';
    case 'polo':return torso('#13284a')+'<path d="M84 155L99 167L91 175Z" fill="#1d3a66" stroke="#0b1a33"/><path d="M116 155L101 167L109 175Z" fill="#1d3a66" stroke="#0b1a33"/><path d="M100 168V190" stroke="#0b1a33" stroke-width="2"/><circle cx="100" cy="176" r="1.6" fill="#e9eef6"/><circle cx="100" cy="185" r="1.6" fill="#e9eef6"/><path d="M118 192L122 184L126 192" stroke="#7fe7ff" stroke-width="2.2" fill="none"/>';
    default:return torso('#16191f')+hood('#0c0e12')+pocket('#0f1217')+strings('#e9e9e9')+'<text x="100" y="208" text-anchor="middle" font-size="12" font-weight="900" font-family="Archivo,Arial,sans-serif" fill="#ffffff" letter-spacing="1.2">DR<tspan fill="#ff9a3c">A</tspan>WUP</text>';
  }
}
/* opt: {crop:'head'|'torso', holo:true, cls} */
function avatarSVG(a,opt={}){
  a={...DEFAULT_LOOK,...(a||{})};
  const holo=opt.holo||a.generic;
  const skin=(SKIN[a.skin]||SKIN[3])[0],hc=(HAIRC[a.hairColor]||HAIRC[0])[0],dark=shade(skin,-.22);
  const g=a.gender,sw=g==='female'?62:g==='nonbinary'?68:75,nw=g==='female'?10:g==='nonbinary'?11.5:13,sx=g==='female'?.94:g==='nonbinary'?.97:1;
  const [back,front]=hairLayers(+a.hair||0,hc);
  const vb=opt.crop==='head'?'54 30 92 92':opt.crop==='bust'?'14 40 172 200':'0 18 200 222';
  const brow=g==='female'?1.8:2.8;
  const lashes=g==='female'?'<path d="M80 90L77 87M120 90L123 87" stroke="#1a1010" stroke-width="1.4" stroke-linecap="round"/>':'';
  const lips=g==='female'?`<path d="M91 117C96 115 104 115 109 117C104 122 96 122 91 117Z" fill="${shade(skin,-.35)}" opacity=".8"/>`:`<path d="M91 117C96 121 104 121 109 117" stroke="${shade(skin,-.45)}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  const glasses=a.glasses?'<g fill="none" stroke="#1d2433" stroke-width="2"><rect x="76" y="85" width="20" height="15" rx="5"/><rect x="104" y="85" width="20" height="15" rx="5"/><path d="M96 91H104M76 90L69 88M124 90L131 88"/></g>':'';
  const head=`<g transform="translate(100 0) scale(${sx} 1) translate(-100 0)"><ellipse cx="69" cy="95" rx="5.5" ry="9" fill="${dark}"/><ellipse cx="131" cy="95" rx="5.5" ry="9" fill="${dark}"/><path d="${HEADS[a.face]||HEADS[0]}" fill="${skin}"/><path d="${HEADS[a.face]||HEADS[0]}" fill="${dark}" opacity=".18" transform="translate(4 2) scale(.96)"/></g>`;
  const face=`<path d="M80 83C84 80 90 80 94 82M106 82C110 80 116 80 120 83" stroke="${hc==='#e6dfcf'?'#8d8578':hc}" stroke-width="${brow}" fill="none" stroke-linecap="round"/><ellipse cx="88" cy="93" rx="5.2" ry="3.6" fill="#fbfbfb"/><ellipse cx="112" cy="93" rx="5.2" ry="3.6" fill="#fbfbfb"/><circle cx="88.4" cy="93.3" r="2.7" fill="#2a1a12"/><circle cx="112.4" cy="93.3" r="2.7" fill="#2a1a12"/><circle cx="89.3" cy="92.4" r=".9" fill="#fff"/><circle cx="113.3" cy="92.4" r=".9" fill="#fff"/>${lashes}<path d="M100 96C98 104 96 108 99 110C101 111 104 110 105 108" stroke="${shade(skin,-.4)}" stroke-width="1.6" fill="none" stroke-linecap="round"/>${lips}${glasses}`;
  const cls=['ac-ava',holo?'ac-holo ac-holo-'+(a.holo||'classic'):'',opt.cls||''].join(' ').trim();
  return `<svg class="${cls}" viewBox="${vb}" style="--ac-skin:${skin}" role="img" aria-label="${esc(holo?'Hologram Arch Coach':'Arch Coach avatar')}">${back}<rect x="${100-nw}" y="118" width="${nw*2}" height="36" rx="${nw*.6}" fill="${dark}"/><g transform="translate(0 -8)">${outfitSVG(a.outfit,sw)}</g>${head}${face}${front}</svg>`;
}
function monogram(l){const ini=l.name.replace(/[^A-Za-z ]/g,'').split(' ').filter(Boolean).map(w=>w[0]).join('').slice(0,3);const c=l.kind==='engineer'?'#3ee08f':'#7fe7ff';
  return `<svg viewBox="0 0 120 120" class="ac-mono" aria-hidden="true"><polygon points="60,6 107,33 107,87 60,114 13,87 13,33" fill="none" stroke="${c}" stroke-width="2"/><polygon points="60,18 96,39 96,81 60,102 24,81 24,39" fill="${c}" opacity=".08"/>${l.kind==='engineer'?'<path d="M30 92H90M38 92V78L60 64L82 78V92M60 64V92" stroke="'+c+'" stroke-width="1.4" fill="none" opacity=".55"/>':'<path d="M36 90L60 30L84 90M46 66H74" stroke="'+c+'" stroke-width="1.4" fill="none" opacity=".55"/>'}<text x="60" y="68" text-anchor="middle" font-size="26" font-weight="900" font-family="Archivo,Arial,sans-serif" fill="#fff">${esc(ini)}</text></svg>`;}

/* =================================================================== data */
const S={uid:null,row:null,legends:[],events:[],loaded:false,promptShown:false,loading:null};
const sb=()=>window.drawupSupabaseClient||window.DrawUpPortal?.ctx?.()?.client;
const toast=(m,bad)=>{const c=window.DrawUpPortal?.ctx?.();if(c?.toast)c.toast(m,bad);else console[bad?'warn':'log'](m);};
async function load(force){
  const P=window.DrawUpPortal,c=P?.ctx?.();const uid=c?.user?.id;if(!uid)return null;
  if(S.loaded&&!force&&S.uid===uid)return S;
  if(S.loading&&!force)return S.loading;
  S.loading=(async()=>{const cl=sb();
    const [r,l,e]=await Promise.all([cl.from('arch_coach_profiles').select('*').eq('user_id',uid).maybeSingle(),cl.from('arch_coach_legends').select('*').order('sort_order'),cl.from('arch_coach_xp_events').select('kind,points,created_at').eq('user_id',uid).order('created_at',{ascending:false}).limit(5)]);
    if(r.error)throw r.error;S.uid=uid;S.row=r.data||null;S.legends=l.data||[];S.events=e.data||[];S.loaded=true;S.loading=null;refreshInjected();return S;})();
  try{return await S.loading;}catch(err){S.loading=null;throw err;}
}
async function saveRow(fields){
  const cl=sb();let q;
  if(S.row)q=cl.from('arch_coach_profiles').update(fields).eq('user_id',S.uid).select('*').single();
  else q=cl.from('arch_coach_profiles').insert({user_id:S.uid,...fields}).select('*').single();
  const {data,error}=await q;if(error)throw error;S.row=data;refreshInjected();return data;
}
const look=()=>S.row&&S.row.mode&&S.row.mode!=='later'?{...DEFAULT_LOOK,...S.row.appearance}:{...GENERIC_LOOK};
const xp=()=>S.row?.xp||0;

/* =================================================================== creator */
let M=null;
async function openCreator(step){
  if(!S.uid){try{await load();}catch(_e){}}
  if(!S.uid){toast('Sign in to build your Arch Coach.',true);return;}
  closeCreator();
  const r=S.row||{};
  const d={step:Math.max(0,STEPS.findIndex(s=>s[0]===step)),look:{...DEFAULT_LOOK,...(r.mode&&r.mode!=='later'?r.appearance:{})},
    discipline:r.discipline||DISC[0],focus:r.focus||FOCUS[0],archetype:r.archetype||'College Professor',answer_style:r.answer_style||'balanced',
    skills:{...PROF,...(r.skills||{})},legend:r.legend||null,language:r.language||'auto',prevFocus:document.activeElement};
  if(r.mode==='generic')d.look.generic=true;
  const el=document.createElement('div');el.className='ac-modal';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','ac-title');
  el.innerHTML=`<div class="ac-shell"><header class="ac-top"><div class="ac-brand"><span class="ac-season">DRAWUP <i></i> SEASON 1</span><h1 id="ac-title">ARCH COACH <em>CREATOR</em></h1><p>Design your Arch Coach. Your perspective. Your style. Your expertise.</p></div>
    <ol class="ac-steps">${STEPS.map((s,i)=>`<li><button type="button" data-ac-goto="${i}"><b>${i+1}</b><span>${s[1]}</span></button></li>`).join('')}</ol>
    <div class="ac-potential" title="Your point budget grows with XP"><small>ARCH COACH<br>POTENTIAL</small><b id="ac-pot">--</b><i><u id="ac-pot-bar"></u></i></div>
    <button type="button" class="ac-x" aria-label="Close">×</button></header>
    <div class="ac-body"><section class="ac-stage" aria-live="polite"><div class="ac-stage-figs"><div class="ac-fig" id="ac-fig"></div><div class="ac-fig ac-fig-holo" id="ac-fig-holo"></div></div><div class="ac-tag"><b id="ac-tag-name"></b><span id="ac-tag-sub"></span></div></section>
    <section class="ac-panel" id="ac-panel"></section></div>
    <footer class="ac-foot"><button type="button" class="ac-btn" id="ac-back">Back</button><button type="button" class="ac-btn" id="ac-random">Randomize</button><span class="ac-keys" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd> choose · <kbd>Tab</kbd> move · <kbd>Esc</kbd> close</span><button type="button" class="ac-btn primary" id="ac-next">Next</button></footer></div>`;
  document.body.appendChild(el);document.documentElement.classList.add('ac-open');
  M={el,d};
  el.querySelector('.ac-x').onclick=closeCreator;
  el.addEventListener('keydown',onKey);
  M.esc=e=>{if(e.key==='Escape'&&M&&!M.el.contains(e.target)){e.preventDefault();closeCreator();}};document.addEventListener('keydown',M.esc);
  el.querySelector('#ac-back').onclick=()=>go(M.d.step-1);
  el.querySelector('#ac-next').onclick=()=>M.d.step===STEPS.length-1?save():go(M.d.step+1);
  el.querySelector('#ac-random').onclick=randomize;
  el.querySelectorAll('[data-ac-goto]').forEach(b=>b.onclick=()=>go(+b.dataset.acGoto));
  go(d.step);
  setTimeout(()=>el.querySelector('#ac-panel button, #ac-panel input')?.focus(),30);
}
function closeCreator(){if(!M)return;document.removeEventListener('keydown',M.esc);const f=M.d.prevFocus;M.el.remove();M=null;document.documentElement.classList.remove('ac-open');try{f?.focus?.();}catch(_e){}}
function onKey(e){
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeCreator();return;}
  const t=e.target;if(!t.closest)return;
  const grp=t.closest('[role=radiogroup]');
  if(grp&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
    const items=$$('[role=radio]:not([disabled])',grp);const i=items.indexOf(t.closest('[role=radio]'));if(i<0)return;
    e.preventDefault();const n=items[(i+(e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1)+items.length)%items.length],v=n.dataset.v,gname=grp.dataset.group;n.click();
    const g2=M&&$(`[data-group="${gname}"]`,M.el);const again=g2&&$$('[role=radio]',g2).find(x=>x.dataset.v===v);(again||n).focus();
  }
}
function go(i){if(!M)return;M.d.step=Math.max(0,Math.min(STEPS.length-1,i));M.el.dataset.step=STEPS[M.d.step][0];drawPanel();drawStage();
  const st=M.el.querySelectorAll('[data-ac-goto]');st.forEach((b,k)=>{b.classList.toggle('on',k===M.d.step);b.classList.toggle('done',k<M.d.step);b.setAttribute('aria-current',k===M.d.step?'step':'false');});
  M.el.querySelector('#ac-back').disabled=M.d.step===0;const nx=M.el.querySelector('#ac-next');nx.textContent=M.d.step===STEPS.length-1?'Save coach':'Next: '+STEPS[M.d.step+1][1];nx.id='ac-next';
  M.el.querySelector('#ac-random').hidden=!['appearance','outfit','hologram'].includes(STEPS[M.d.step][0]);
  M.el.querySelector('.ac-shell').scrollTop=0;M.el.querySelector('#ac-panel').scrollTop=0;}
function drawStage(){if(!M)return;const d=M.d,lk=d.look;
  M.el.querySelector('#ac-fig').innerHTML=lk.generic?avatarSVG({...lk},{holo:true}):avatarSVG(lk);
  M.el.querySelector('#ac-fig-holo').innerHTML=avatarSVG({...lk,generic:false},{holo:true});
  M.el.querySelector('#ac-fig').classList.toggle('is-generic',!!lk.generic);
  const b=budget(xp()),used=total(d.skills);
  M.el.querySelector('#ac-pot').textContent=Math.round(b/14);M.el.querySelector('#ac-pot-bar').style.width=Math.round(100*(b-920)/(1190-920))+'%';
  M.el.querySelector('#ac-tag-name').textContent=(lk.generic?'Hologram Coach':'Your Arch Coach')+' · OVR '+Math.round(used/14);
  M.el.querySelector('#ac-tag-sub').textContent=`${d.archetype} · Level ${level(xp())} · ${xp()} XP`;}
const radio=(group,label,items,cur,render,cls='')=>`<div class="ac-field"><span class="ac-label">${label}</span><div class="ac-grid ${cls}" role="radiogroup" aria-label="${esc(label)}" data-group="${group}">${items.map((it,i)=>{const v=it.v??i;const on=String(v)===String(cur);return `<button type="button" role="radio" aria-checked="${on}" tabindex="${on?0:-1}" class="${on?'on':''}" data-group-item="${group}" data-v="${esc(v)}" title="${esc(it.title||'')}" ${it.disabled?'disabled':''}>${render(it,i)}</button>`;}).join('')}</div></div>`;
function drawPanel(){
  const d=M.d,lk=d.look,p=M.el.querySelector('#ac-panel'),k=STEPS[d.step][0];
  if(k==='appearance'){
    p.innerHTML=`<div class="ac-panel-head"><h2>HEAD + STYLE</h2><button type="button" class="ac-btn holo" data-ac-generic>Use the generic hologram coach</button></div>
    ${lk.generic?'<p class="ac-note">You are using the generic hologram coach. Pick anything below to build your own instead.</p>':''}
    ${radio('gender','Gender',GENDERS.map(g=>({v:g[0],title:g[1],g})),lk.gender,it=>`<span class="ac-sym">${it.g[2]}</span>${it.g[1]}`,'ac-row3')}
    ${radio('face','Face type',FACES.map((f,i)=>({v:i,title:f})),lk.face,(it,i)=>avatarSVG({...lk,generic:false,face:i},{crop:'head'})+`<small>${FACES[i]}</small>`,'ac-tiles')}
    ${radio('skin','Skin tone',SKIN.map((s,i)=>({v:i,title:s[1]})),lk.skin,(it,i)=>`<i class="ac-sw" style="background:${SKIN[i][0]}"></i><span class="ac-sr">${SKIN[i][1]}</span>`,'ac-swatches')}
    ${radio('hair','Hair style',HAIRS.map((h,i)=>({v:i,title:h})),lk.hair,(it,i)=>avatarSVG({...lk,generic:false,hair:i},{crop:'head'})+`<small>${HAIRS[i]}</small>`,'ac-tiles')}
    ${radio('hairColor','Hair color',HAIRC.map((h,i)=>({v:i,title:h[1]})),lk.hairColor,(it,i)=>`<i class="ac-sw" style="background:${HAIRC[i][0]}"></i><span class="ac-sr">${HAIRC[i][1]}</span>`,'ac-swatches')}
    ${radio('glasses','Glasses',[{v:'false',title:'No glasses'},{v:'true',title:'Glasses'}],String(!!lk.glasses),it=>it.title,'ac-row3')}`;
  }else if(k==='outfit'){
    p.innerHTML=`<div class="ac-panel-head"><h2>OUTFIT</h2></div>${radio('outfit','Choose clothing',OUTFITS.map(o=>({v:o[0],title:o[1]})),lk.outfit,it=>avatarSVG({...lk,generic:false,outfit:it.v},{crop:'bust'})+`<small>${esc(it.title)}</small>`,'ac-tiles ac-wide')}`;
  }else if(k==='hologram'){
    p.innerHTML=`<div class="ac-panel-head"><h2>HOLOGRAM MODE</h2></div><p class="ac-note">How your coach appears while it draws up an answer.</p>${radio('holo','Hologram mode',HOLOS.map(h=>({v:h[0],title:h[1]})),lk.holo,it=>avatarSVG({...lk,generic:false,holo:it.v},{crop:'head',holo:true})+`<small>${esc(it.title)}</small>`,'ac-tiles')}
    <div class="ac-field"><span class="ac-label">Coach look</span><div class="ac-grid ac-row3" role="radiogroup" aria-label="Coach look" data-group="generic">${[['false','My avatar'],['true','Generic hologram coach']].map(([v,t])=>{const on=String(!!lk.generic)===v;return `<button type="button" role="radio" aria-checked="${on}" tabindex="${on?0:-1}" class="${on?'on':''}" data-group-item="generic" data-v="${v}">${t}</button>`;}).join('')}</div></div>`;
  }else if(k==='skills'){
    const cyc=(name,label,list,cur)=>`<div class="ac-cycle" data-cycle="${name}"><span class="ac-label">${label}</span><div><button type="button" aria-label="Previous ${esc(label)}" data-dir="-1">◀</button><b>${esc(cur)}</b><button type="button" aria-label="Next ${esc(label)}" data-dir="1">▶</button></div></div>`;
    const arch=ARCH.find(a=>a[0]===d.archetype)||ARCH[0];
    p.innerHTML=`<div class="ac-skills-wrap"><aside class="ac-blueprint"><h2>Coach Blueprint</h2><p class="ac-note">Set your foundation. Shape how your Arch Coach thinks.</p>
      ${cyc('discipline','Discipline',DISC,d.discipline)}${cyc('focus','Primary focus',FOCUS,d.focus)}${cyc('archetype','Coach archetype',ARCH.map(a=>a[0]),d.archetype)}
      <p class="ac-note" id="ac-arch-note">${esc(arch[1])} Changing the archetype loads its starting ratings.</p>
      ${radio('answer_style','Answer length',STYLES.map(s=>({v:s[0],title:s[1]})),d.answer_style,it=>esc(it.title),'ac-row3')}
      <label class="ac-field"><span class="ac-label">Coach language</span><select id="ac-lang">${LANGS.map(l=>`<option value="${l[0]}" ${l[0]===d.language?'selected':''}>${esc(l[1])}</option>`).join('')}</select><small class="ac-note">Arch Coach answers in the language you write in; this is the fallback. It always stays professional.</small></label></aside>
      <div class="ac-skillcard"><div class="ac-skillhead"><h2>ARCH COACH SKILLS</h2><p>Allocate points to match your design journey. Each skill is 25–99; your budget grows as you earn XP.</p></div>
      <div class="ac-budget" id="ac-budget"><div><b id="ac-used"></b><span id="ac-left"></span></div><i><u id="ac-budget-bar"></u></i><small id="ac-budget-msg" aria-live="polite"></small></div>
      ${GROUPS.map(g=>`<div class="ac-group" style="--g:${g[3]}"><div class="ac-gname"><b>${g[1]}</b><small>${g[2]}</small></div><div class="ac-rows">${g[4].map(([key,lab])=>`<label class="ac-srow"><span>${lab}</span><input type="range" min="${MIN}" max="${MAX}" step="1" value="${d.skills[key]}" data-skill="${key}" aria-label="${esc(lab)}"><output data-out="${key}">${d.skills[key]}</output><small>/99</small></label>`).join('')}</div></div>`).join('')}</div></div>`;
    p.querySelectorAll('[data-cycle]').forEach(c=>c.querySelectorAll('button').forEach(b=>b.onclick=()=>{const name=c.dataset.cycle,list=name==='discipline'?DISC:name==='focus'?FOCUS:ARCH.map(a=>a[0]);const i=(list.indexOf(d[name])+(+b.dataset.dir)+list.length)%list.length;d[name]=list[i];if(name==='archetype')d.skills=preset(d[name]);drawPanel();drawStage();p.querySelector(`[data-cycle="${name}"] [data-dir="${b.dataset.dir}"]`)?.focus();}));
    p.querySelector('#ac-lang').onchange=e=>{d.language=e.target.value;};
    p.querySelectorAll('[data-skill]').forEach(inp=>inp.addEventListener('input',()=>setSkill(inp)));
    updBudget();
  }else if(k==='legend'){
    const x=xp(),next=S.legends.find(l=>l.xp_required>x);
    p.innerHTML=`<div class="ac-panel-head"><h2>HALL OF FAME LEGENDS</h2></div><p class="ac-note">You always keep your own Arch Coach. Legends are Hall of Fame guest helpers: after any answer, ask an unlocked legend for a second opinion seen through the publicly documented principles of that architect or engineer. It never pretends to be them or puts words in their mouth. Pick your go-to legend here. Earn XP to unlock more.</p>
    <div class="ac-xpline"><b>${x} XP</b> · Level ${level(x)}${next?` · next unlock: ${esc(next.name)} at ${next.xp_required} XP`:' · every legend unlocked'}</div>
    <div class="ac-xpways"><span>Ask Arch Coach +5</span><span>Upload to Coach / Check +8</span><span>Run a Check +15</span><span>Likes on your Connect posts +2</span><span>Replies from peers +4</span><span>Help someone on Boards +6</span></div>
    <div class="ac-legends" role="radiogroup" aria-label="Inspiration legend" data-group="legend"><button type="button" role="radio" aria-checked="${!d.legend}" tabindex="${!d.legend?0:-1}" class="ac-legend ac-none ${!d.legend?'on':''}" data-group-item="legend" data-v="" data-legend=""><b>No go-to legend</b><small>Choose a legend each time you ask.</small></button>
    ${S.legends.map(l=>{const locked=x<l.xp_required,on=d.legend===l.key;return `<button type="button" role="radio" aria-checked="${on}" tabindex="${on?0:-1}" class="ac-legend ${on?'on':''} ${locked?'locked':''}" data-group-item="legend" data-v="${esc(l.key)}" data-legend="${esc(l.key)}" ${locked?'disabled aria-disabled="true"':''}>${monogram(l)}<b>${esc(l.name)}</b><span class="ac-kind">${l.kind==='engineer'?'ENGINEER':'ARCHITECT'}</span><span class="ac-princ">${(l.principles||[]).map(esc).join(' · ')}</span><small>${esc(l.note||'')}</small><em>${locked?`🔒 Unlocks at ${l.xp_required} XP`:on?'GO-TO LEGEND':'Make go-to'}</em></button>`;}).join('')}</div>`;
  }else{
    const leg=S.legends.find(l=>l.key===d.legend);const used=total(d.skills);
    const top=KEYS.slice().sort((a,b)=>d.skills[b]-d.skills[a]).slice(0,3).map(k=>GROUPS.flatMap(g=>g[4]).find(s=>s[0]===k)[1]);
    p.innerHTML=`<div class="ac-panel-head"><h2>CONFIRM</h2></div><div class="ac-confirm">
      <div><span class="ac-label">Look</span><b>${d.look.generic?'Generic hologram coach':`${esc(GENDERS.find(g=>g[0]===d.look.gender)?.[1])} · ${FACES[d.look.face]} face · ${SKIN[d.look.skin][1]} skin · ${HAIRS[d.look.hair]} (${HAIRC[d.look.hairColor][1]})`}</b></div>
      <div><span class="ac-label">Outfit + hologram</span><b>${esc(OUTFITS.find(o=>o[0]===d.look.outfit)?.[1])} · ${esc(HOLOS.find(h=>h[0]===d.look.holo)?.[1])} hologram</b></div>
      <div><span class="ac-label">Blueprint</span><b>${esc(d.discipline)} · ${esc(d.focus)} · ${esc(d.archetype)} · ${esc(STYLES.find(s=>s[0]===d.answer_style)?.[1])} answers</b></div>
      <div><span class="ac-label">Strongest skills</span><b>${top.join(', ')} · ${used}/${budget(xp())} points · OVR ${Math.round(used/14)}</b></div>
      <div><span class="ac-label">Legend</span><b>${leg?esc(leg.name):'None yet'}</b></div>
      <div><span class="ac-label">Language</span><b>${esc(LANGS.find(l=>l[0]===d.language)?.[1])}</b></div></div>
      <p class="ac-note">Your coach still answers every architecture, engineering and construction question fully. These settings change emphasis and style only, and Arch Coach always stays professional. Edit any time from Profile or the Arch Coach tab.</p>`;
  }
  // generic radio items
  p.querySelectorAll('[data-group-item]').forEach(b=>b.onclick=()=>pick(b.dataset.groupItem,b.dataset.v));
  p.querySelector('[data-ac-generic]')?.addEventListener('click',useGenericNow);
}
function pick(group,v){const d=M.d;
  if(group==='legend'){const l=S.legends.find(x=>x.key===v);if(v&&(!l||xp()<l.xp_required))return;d.legend=v||null;}
  else if(group==='answer_style')d.answer_style=v;
  else if(group==='generic')d.look.generic=v==='true';
  else{const num=['face','skin','hair','hairColor'].includes(group);d.look[group]=group==='glasses'?v==='true':num?+v:v;if(group!=='holo')d.look.generic=false;}
  drawPanel();drawStage();}
function setSkill(inp){const d=M.d,k=inp.dataset.skill;let v=Math.max(MIN,Math.min(MAX,Math.round(+inp.value)));
  const others=total(d.skills)-d.skills[k],room=budget(xp())-others;const msg=M.el.querySelector('#ac-budget-msg');
  if(v>room){v=Math.max(MIN,room);inp.value=v;msg.textContent='Point budget reached. Lower another skill or earn XP to raise this one.';const b=M.el.querySelector('#ac-budget');b.classList.remove('flash');void b.offsetWidth;b.classList.add('flash');}
  else msg.textContent='';
  d.skills[k]=v;M.el.querySelector(`[data-out="${k}"]`).textContent=v;updBudget();drawStage();}
function updBudget(){const d=M.d,b=budget(xp()),u=total(d.skills);const e=M.el;if(!e.querySelector('#ac-used'))return;
  e.querySelector('#ac-used').textContent=`${u} / ${b} points`;e.querySelector('#ac-left').textContent=`${b-u} left · OVR ${Math.round(u/14)}`;e.querySelector('#ac-budget-bar').style.width=Math.min(100,100*u/b)+'%';
  e.querySelectorAll('[data-skill]').forEach(i=>{const pct=(i.value-MIN)/(MAX-MIN)*100;i.style.setProperty('--v',pct+'%');});}
function randomize(){const d=M.d,r=n=>Math.floor(Math.random()*n);d.look={...d.look,generic:false,gender:GENDERS[r(3)][0],skin:r(SKIN.length),face:r(FACES.length),hair:r(HAIRS.length),hairColor:r(HAIRC.length),outfit:OUTFITS[r(OUTFITS.length)][0],holo:HOLOS[r(HOLOS.length)][0],glasses:Math.random()<.25};drawPanel();drawStage();}
function fields(d,mode){return {mode,appearance:mode==='generic'?{...GENERIC_LOOK,holo:d.look.holo||'classic'}:{...d.look,generic:false},discipline:d.discipline,focus:d.focus,archetype:d.archetype,answer_style:d.answer_style,skills:d.skills,legend:d.legend,language:d.language};}
async function save(){const d=M.d,btn=M.el.querySelector('#ac-next');
  if(total(d.skills)>budget(xp())){toast('Your skills use more points than your budget.',true);go(3);return;}
  btn.disabled=true;btn.textContent='Saving…';
  try{await saveRow(fields(d,d.look.generic?'generic':'custom'));closeCreator();hidePrompt();toast('Arch Coach saved to your profile.');}
  catch(e){btn.disabled=false;btn.textContent='Save coach';toast('Arch Coach was not saved: '+(e.message||e),true);}}
async function useGenericNow(){try{await saveRow(fields({...M.d,look:{...M.d.look,generic:true}},'generic'));closeCreator();hidePrompt();toast('You are using the generic hologram coach. Build your own any time from Profile.');}catch(e){toast('Could not save: '+(e.message||e),true);}}

/* =================================================================== sign-in prompt */
function hidePrompt(){$('.ac-prompt')?.remove();}
function showPrompt(){
  if($('.ac-prompt'))return;S.promptShown=true;
  const el=document.createElement('aside');el.className='ac-prompt';el.setAttribute('role','dialog');el.setAttribute('aria-label','Create your Arch Coach');
  el.innerHTML=`<button type="button" class="ac-prompt-x" data-ac-prompt="later" aria-label="Not now">×</button><div class="ac-prompt-fig">${avatarSVG(GENERIC_LOOK,{crop:'head',holo:true})}</div><div><span class="ac-season">NEW · ARCH COACH</span><h3>Create your Arch Coach</h3><p>Build your own coach: look, outfit, skills and an Inspiration Legend. It starts as a College Professor and gets stronger as you ask, upload and collaborate.</p><div class="ac-prompt-act"><button type="button" class="ac-btn primary" data-ac-prompt="create">Create my coach</button><button type="button" class="ac-btn holo" data-ac-prompt="generic">Use generic hologram coach</button><button type="button" class="ac-btn ghost" data-ac-prompt="later">Not now</button></div></div>`;
  document.body.appendChild(el);
  el.querySelectorAll('[data-ac-prompt]').forEach(b=>b.onclick=async()=>{const a=b.dataset.acPrompt;hidePrompt();
    try{
      if(a==='create'){if(!S.row||!S.row.mode)await saveRow({mode:'later'});openCreator('appearance');}
      else if(a==='generic'){await saveRow({mode:'generic',appearance:{...GENERIC_LOOK}});toast('Generic hologram coach selected. Customize it any time from Profile.');}
      else{await saveRow({mode:'later'});toast('You can create your Arch Coach any time from Profile.');}
    }catch(e){toast('Could not save your choice: '+(e.message||e),true);}
  });
}
async function checkPrompt(){
  const P=window.DrawUpPortal;if(!P?.isSignedIn?.()||!$('#du-portal.open')||$('#du-onboarding.open'))return;
  const uid=P.ctx?.()?.user?.id;if(!uid)return;
  if(S.uid&&S.uid!==uid){S.loaded=false;S.promptShown=false;S.row=null;}
  try{await load();}catch(e){return;}
  if(!S.promptShown&&(!S.row||!S.row.mode)&&!M)showPrompt();
}

/* =================================================================== Portal hooks */
function coachHead(cls){return avatarSVG(look(),{crop:'head',cls});}
function profileCard(){
  const x=xp(),lv=level(x),lo=levelXp(lv),hi=levelXp(lv+1),r=S.row,custom=r&&(r.mode==='custom'||r.mode==='generic');
  const leg=S.legends.find(l=>l.key===r?.legend),next=S.legends.find(l=>l.xp_required>x);const sk=r?.skills||PROF,u=total(sk);
  const card=document.createElement('section');card.className='ac-pcard';
  card.innerHTML=`<div class="ac-pfig ${look().generic?'is-generic':''}">${avatarSVG(look(),{crop:'head',holo:look().generic})}</div>
  <div class="ac-pinfo"><span class="du-kicker">ARCH COACH · LEVEL ${lv} · ${x} XP</span><h2>${custom?esc(r.archetype)+(r.mode==='generic'?' · Hologram coach':''):'Create your Arch Coach'}</h2>
  <p>${custom?`${esc(r.discipline)} · ${esc(r.focus)} · OVR ${Math.round(u/14)} · Potential ${Math.round(budget(x)/14)}${leg?' · Legend: '+esc(leg.name):''}`:'Build a coach that fits how you work. It starts as a College Professor and grows with XP.'}</p>
  <div class="ac-pxp"><i><u style="width:${Math.min(100,Math.round(100*(x-lo)/Math.max(1,hi-lo)))}%"></u></i><small>${hi-x} XP to level ${lv+1}${next?` · ${esc(next.name)} unlocks at ${next.xp_required} XP`:''}</small></div>
  ${S.events.length?`<div class="ac-pevents">${S.events.slice(0,3).map(e=>`<span>+${e.points} ${esc(({ask:'question',upload:'upload',check:'Check',peer_like:'like',peer_comment:'peer reply',board_help:'Boards help'})[e.kind]||e.kind)}</span>`).join('')}</div>`:''}
  <div class="ac-pact"><button type="button" class="du-btn primary" data-ac-open="appearance">${custom?'Edit appearance':'Create coach'}</button><button type="button" class="du-btn ghost" data-ac-open="skills">Skills + advice</button><button type="button" class="du-btn ghost" data-ac-open="legend">Legends</button></div></div>`;
  card.querySelectorAll('[data-ac-open]').forEach(b=>b.onclick=()=>openCreator(b.dataset.acOpen));
  return card;
}
let injectQueued=false;
function refreshInjected(){$$('.ac-pcard').forEach(c=>c.remove());$$('.ac-chat-ava').forEach(a=>a.remove());$$('.ac-has-ava').forEach(a=>a.classList.remove('ac-has-ava'));$$('.ac-edit-btn').forEach(a=>a.remove());inject();}
function inject(){
  injectQueued=false;
  const w=$('#du-workspace-content');if(!w||!S.loaded)return;
  const cover=w.querySelector('.du-profile-cover');
  if(cover&&!w.querySelector('.ac-pcard')){cover.insertAdjacentElement('afterend',profileCard());if(!cover.dataset.acFresh){cover.dataset.acFresh='1';load(true).catch(()=>{});}}
  const head=w.querySelector('.du-coach-main .du-work-head');
  if(head&&!head.querySelector('.ac-edit-btn')){const b=document.createElement('button');b.type='button';b.className='du-btn ghost ac-edit-btn';b.innerHTML=`<span class="ac-mini">${coachHead()}</span>Edit coach`;b.onclick=()=>openCreator('appearance');head.appendChild(b);}
  const box=w.querySelector('#dc-messages');
  if(box)box.querySelectorAll('article.assistant:not(.ac-has-ava),article.coach:not(.ac-has-ava)').forEach(a=>{a.classList.add('ac-has-ava');const i=document.createElement('i');i.className='ac-chat-ava'+(look().generic?' is-generic':'');i.setAttribute('aria-hidden','true');i.innerHTML=avatarSVG(look(),{crop:'head',holo:look().generic});a.prepend(i);});
}
function queueInject(){if(injectQueued)return;injectQueued=true;requestAnimationFrame(inject);}

async function boot(){
  for(let i=0;i<200&&!window.DrawUpPortal?.registerTab;i++)await sleep(100);
  const mo=new MutationObserver(()=>{if(S.loaded)queueInject();});
  const attach=()=>{const w=$('#du-workspace-content');if(w&&!w.dataset.acObs){w.dataset.acObs='1';mo.observe(w,{childList:true,subtree:true});}};
  setInterval(()=>{attach();checkPrompt().then(()=>queueInject());},1200);
  attach();checkPrompt();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.loaded)load(true).catch(()=>{});});
}

window.DrawUpCoach={open:openCreator,close:closeCreator,avatarSVG,reload:()=>load(true),state:()=>({row:S.row,legends:S.legends,xp:xp(),budget:budget(xp()),level:level(xp())}),budget,level,KEYS,SKIN,FACES,HAIRS,OUTFITS,HOLOS,GENDERS};
boot();
})();
