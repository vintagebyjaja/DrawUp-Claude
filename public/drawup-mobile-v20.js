/* DrawUp V20 — phone app tab bar (public site + Portal) and the Portal "More" sheet.
   Shown only at <=820px by drawup-mobile-v20.css. Reuses the existing routers:
   public tabs proxy to the original .mobile-bottom-nav links (bound by the page router),
   Portal tabs are [data-portal-tab] buttons handled by drawup-portal-v17.js. */
(function(){
  if(window.DrawUpMobile20)return;
  var $=function(id){return document.getElementById(id);};
  var ICON={
    home:'<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.8V20h4.5v-5.5h3V20H18V9.8"/>',
    search:'<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
    coach:'<path d="M12 3.5 13.9 10l6.6 2-6.6 2L12 20.5 10.1 14l-6.6-2 6.6-2z"/>',
    check:'<path d="m4.5 12.5 4.8 4.8L19.5 7"/>',
    connect:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/>',
    firms:'<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/><rect x="8.5" y="8.5" width="7" height="7"/>',
    dash:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="4.5" rx="1.5"/><rect x="13" y="10.5" width="7" height="9.5" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/>',
    people:'<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.5" cy="8" r="2.6"/><path d="M15.5 13.3c2.6-.3 4.6 1.4 5 4.2"/>',
    more:'<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>'
  };
  var svg=function(k){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+ICON[k]+'</svg>';};
  var PUBLIC=[['home','Home','home'],['discover','Discover','search'],['coach','Coach','coach'],['check','Check','check'],['connect','Connect','connect'],['firms','Firms','firms']];
  var PORTAL=[['dashboard','Dashboard','dash'],['search','Search','search'],['arch-coach','Arch Coach','coach'],['connect','Connect','people']];
  var MORE=[['profile','Profile','◎'],['projects','Projects','▱'],['draw','Draw','⌖'],['check','Check','✓'],['swap','Swap','⇄'],['details','Details','⌗'],['discover','Discover','◈'],['firm','Firm','◇'],['team','Team','◉'],['account','Account','⚙'],['hq','HQ','★']];
  var MAIN=PORTAL.map(function(x){return x[0];});

  function build(){
    if($('du-mbar'))return;
    var nav=document.createElement('nav');nav.id='du-mbar';nav.setAttribute('aria-label','DrawUp tabs');
    nav.innerHTML='<div class="du-mbar-row du-mbar-public">'+PUBLIC.map(function(t){return '<a href="#'+t[0]+'" data-mbar-page="'+t[0]+'">'+svg(t[2])+'<span>'+t[1]+'</span></a>';}).join('')+'</div>'+
      '<div class="du-mbar-row du-mbar-portal">'+PORTAL.map(function(t){return '<button type="button" data-portal-tab="'+t[0]+'">'+svg(t[2])+'<span>'+t[1]+'</span></button>';}).join('')+
      '<button type="button" data-mbar-more aria-haspopup="dialog" aria-expanded="false" aria-controls="du-more-sheet">'+svg('more')+'<span>More</span></button></div>';
    document.body.appendChild(nav);
    var bd=document.createElement('div');bd.id='du-more-backdrop';document.body.appendChild(bd);
    var sh=document.createElement('section');sh.id='du-more-sheet';sh.setAttribute('role','dialog');sh.setAttribute('aria-label','More Portal tabs');sh.setAttribute('aria-hidden','true');
    sh.innerHTML='<div class="du-more-grip"></div><h2>Portal</h2><div class="du-more-grid">'+MORE.map(function(t){return '<button type="button" data-portal-tab="'+t[0]+'"'+(t[0]==='hq'?' hidden data-du-hq':'')+'><span class="du-more-ic" aria-hidden="true">'+t[2]+'</span>'+t[1]+'</button>';}).join('')+
      '<button type="button" class="du-more-out" data-du-action="signout">Sign out</button></div>';
    document.body.appendChild(sh);
    nav.addEventListener('click',onBar,true);
    bd.addEventListener('click',closeMore);
    sh.addEventListener('click',function(e){if(e.target.closest('[data-portal-tab],[data-du-action]')){closeMore();scrollPortalTop();}});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closeMore();});
    sync();
  }

  /* Close every layer that sits on top of a screen, so a tab tap always lands on that tab. */
  function closeLayers(){
    document.querySelectorAll('.du-sc .du-sc-x').forEach(function(x){try{x.click();}catch(_e){}});
    document.querySelectorAll('.du-sc-lb').forEach(function(x){x.remove();});
    document.querySelectorAll('.du-v19-overlay .du-v19-x').forEach(function(x){try{x.click();}catch(_e){}});
    document.querySelectorAll('.du-v19-overlay').forEach(function(x){x.remove();});
    document.querySelectorAll('.v12-portal.open,.drawup-search-overlay.open').forEach(function(x){x.classList.remove('open');});
    document.documentElement.classList.remove('du-sc-lock');
    var d=$('mobile-drawer'),b=$('mobile-drawer-backdrop');if(d)d.classList.remove('open');if(b)b.classList.remove('open');
    var pp=$('du-profile-panel');if(pp)pp.classList.remove('open');
    closeMore();
  }
  function scrollPortalTop(){var p=$('du-portal');if(p)p.scrollTop=0;}
  function onBar(e){
    var more=e.target.closest('[data-mbar-more]');
    if(more){e.preventDefault();e.stopPropagation();var open=$('du-more-sheet').classList.contains('open');if(open)closeMore();else openMore();return;}
    var pt=e.target.closest('[data-portal-tab]');
    if(pt){closeLayers();scrollPortalTop();return;} /* the Portal's own document listener opens the tab */
    var a=e.target.closest('[data-mbar-page]');if(!a)return;
    e.preventDefault();e.stopPropagation();
    var pg=a.dataset.mbarPage;closeLayers();
    var orig=document.querySelector('.mobile-bottom-nav a[data-page="'+pg+'"]')||document.querySelector('.nav-link[data-page="'+pg+'"]');
    if(orig)orig.click();else location.hash='#'+pg;
    window.scrollTo(0,0);setTimeout(sync,0);
  }
  function openMore(){
    var hq=document.querySelector('.du-side [data-du-hq]');
    document.querySelectorAll('#du-more-sheet [data-du-hq]').forEach(function(b){b.hidden=!hq||hq.hidden;});
    $('du-more-sheet').classList.add('open');$('du-more-sheet').setAttribute('aria-hidden','false');$('du-more-backdrop').classList.add('open');
    var m=document.querySelector('#du-mbar [data-mbar-more]');if(m)m.setAttribute('aria-expanded','true');
  }
  function closeMore(){
    var s=$('du-more-sheet');if(!s||!s.classList.contains('open'))return;
    s.classList.remove('open');s.setAttribute('aria-hidden','true');$('du-more-backdrop').classList.remove('open');
    var m=document.querySelector('#du-mbar [data-mbar-more]');if(m)m.setAttribute('aria-expanded','false');
  }

  /* Active states */
  function currentPublic(){var p=document.querySelector('main [id^="page-"]:not([hidden]),[id^="page-"]:not([hidden])');return p?p.id.slice(5):'home';}
  function sync(){
    var nav=$('du-mbar');if(!nav)return;
    var pg=currentPublic();if(pg==='firm-profile')pg='firms';
    nav.querySelectorAll('[data-mbar-page]').forEach(function(a){var on=a.dataset.mbarPage===pg;a.classList.toggle('active',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    var act=document.querySelector('.du-side [data-portal-tab].active');var tab=act?act.dataset.portalTab:'';
    nav.querySelectorAll('[data-portal-tab]').forEach(function(b){var on=b.dataset.portalTab===tab;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    var m=nav.querySelector('[data-mbar-more]');if(m)m.classList.toggle('active',!!tab&&MAIN.indexOf(tab)<0);
  }
  var queued=false;function later(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;sync();});}
  function observe(){
    var mo=new MutationObserver(later);
    document.querySelectorAll('[id^="page-"]').forEach(function(p){mo.observe(p,{attributes:true,attributeFilter:['hidden']});});
    window.addEventListener('hashchange',later);
    (function side(){var s=document.querySelector('.du-side');if(s)mo.observe(s,{attributes:true,subtree:true,attributeFilter:['class','hidden']});else setTimeout(side,700);})();
  }
  function init(){build();observe();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.DrawUpMobile20={sync:sync,closeLayers:closeLayers,openMore:openMore,closeMore:closeMore};
})();
