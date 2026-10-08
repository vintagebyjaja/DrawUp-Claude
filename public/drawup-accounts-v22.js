/* DrawUp V22 — two accounts per person: one personal email plus one school, firm or business email.
   1) Sign-up screen: checks the email with the server before the account is created and explains the rule.
   2) After sign up and on every sign in: links the account to this device (hashed on the server).
   3) Founder only: a read-only list of devices used by more than one account, inside the HQ area.
   Uses the guest identity from drawup-v20.js (DrawUpV20.guestHeaders). Load after drawup-v20.js. */
(function(){
  'use strict';
  var $=function(id){return document.getElementById(id);};
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  var heads=function(){try{return (window.DrawUpV20&&window.DrawUpV20.guestHeaders&&window.DrawUpV20.guestHeaders())||{};}catch(_e){return {};}};
  var RULE='Each person can have two DrawUp accounts: one personal email and one school, firm or business email.';
  var isSignup=function(){var b=$('auth-submit');return !!b&&/create/i.test(b.textContent||'');};

  /* ------------------------------------------------ sign-up screen */
  function note(){
    var n=$('du-acct-note');
    if(!n){var st=$('auth-status');if(!st)return null;n=document.createElement('div');n.id='du-acct-note';n.className='du-acct-note';n.setAttribute('role','status');n.setAttribute('aria-live','polite');st.parentNode.insertBefore(n,st);}
    return n;
  }
  function kindOf(email){
    var d=(String(email).split('@')[1]||'').toLowerCase();
    if(!/\./.test(d))return '';
    if(/\.edu$|\.edu\.[a-z]{2}$|\.ac\.[a-z]{2}$|(^|\.)k12\./.test(d))return 'School email';
    if(/^(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|mac|aol|proton|protonmail|pm|gmx|mail|zoho|yandex)\./.test(d))return 'Personal email';
    return 'Firm or business email';
  }
  function renderHint(){
    var n=note();if(!n)return;
    if(!isSignup()){n.hidden=true;n.innerHTML='';return;}
    var k=kindOf(($('auth-email')||{}).value||'');
    n.hidden=false;n.className='du-acct-note';
    n.innerHTML='<span class="du-acct-rule"><b>2 accounts per person.</b> One personal email plus one school, firm or business email.</span>'+(k?'<span class="du-acct-kind">'+esc(k)+'</span>':'');
  }
  function showBlock(msg){
    var n=note();if(!n)return;n.hidden=false;n.className='du-acct-note du-acct-block';
    n.innerHTML='<b>One more step</b><p>'+esc(msg)+'</p><small>'+esc(RULE)+' Using a shared or school computer? Create your account on your own phone or computer.</small>';
    var st=$('auth-status');if(st)st.textContent='';
  }
  var passing=false;
  document.addEventListener('click',function(e){
    var btn=e.target&&e.target.closest&&e.target.closest('#auth-submit');
    if(!btn||passing||!isSignup())return;
    e.preventDefault();e.stopImmediatePropagation();
    var email=(($('auth-email')||{}).value||'').trim();
    var st=$('auth-status');if(st)st.textContent='Checking…';btn.disabled=true;
    fetch('/api/account/check',{method:'POST',headers:Object.assign({'Content-Type':'application/json'},heads()),body:JSON.stringify({email:email}),cache:'no-store'})
      .then(function(r){return r.json();}).catch(function(){return {ok:true};})
      .then(function(d){
        btn.disabled=false;
        if(d&&d.ok===false){showBlock(d.message||RULE);return;}
        if(st)st.textContent='';
        passing=true;try{btn.click();}finally{passing=false;}
      });
  },true);
  document.addEventListener('input',function(e){if(e.target&&e.target.id==='auth-email')renderHint();});
  function watchModal(){
    var t=$('auth-title'),b=$('auth-submit');if(!t||!b)return false;
    new MutationObserver(renderHint).observe(b,{childList:true,characterData:true,subtree:true});
    renderHint();return true;
  }
  if(!watchModal())document.addEventListener('DOMContentLoaded',watchModal);

  /* ------------------------------------------------ link the account after sign up / sign in */
  var linked={};
  function banner(msg){
    var b=$('du-acct-banner');
    if(!b){b=document.createElement('div');b.id='du-acct-banner';b.className='du-acct-banner';b.setAttribute('role','alert');document.body.appendChild(b);}
    b.innerHTML='<div><b>Free credits are off for this account</b><p>'+esc(msg)+'</p></div><button type="button" aria-label="Dismiss">×</button>';
    b.querySelector('button').onclick=function(){b.remove();};
  }
  function link(session){
    var u=session&&session.user;if(!u||u.is_anonymous||linked[u.id])return;linked[u.id]=1;
    fetch('/api/account/link',{method:'POST',headers:Object.assign({Authorization:'Bearer '+session.access_token},heads()),cache:'no-store'})
      .then(function(r){return r.json();})
      .then(function(d){window.DrawUpAccounts.last=d;if(d&&d.ok===false&&d.message)banner(d.message);document.dispatchEvent(new CustomEvent('drawup:account-linked',{detail:d}));})
      .catch(function(){delete linked[u.id];});
  }
  var tries=0;
  (function hook(){
    var c=window.drawupSupabaseClient;
    if(!c||!c.auth){if(++tries<200)setTimeout(hook,150);return;}
    c.auth.onAuthStateChange(function(ev,session){
      if(session&&(ev==='SIGNED_IN'||ev==='INITIAL_SESSION'||ev==='USER_UPDATED'))setTimeout(function(){link(session);},0);
      if(ev==='SIGNED_OUT')linked={};
    });
  })();

  /* ------------------------------------------------ founder list inside HQ (read only) */
  var pairsBusy=false;
  function pairs(){
    if(!/^#portal\/hq/.test(location.hash)||pairsBusy)return;
    var host=$('du-workspace-content');if(!host||!host.children.length||host.querySelector('#du-acct-pairs'))return;
    var c=window.drawupSupabaseClient;if(!c)return;pairsBusy=true;
    c.auth.getSession().then(function(r){
      var s=r.data&&r.data.session;if(!s)return null;
      return fetch('/api/account/pairs',{headers:{Authorization:'Bearer '+s.access_token},cache:'no-store'}).then(function(x){return x.ok?x.json():null;});
    }).then(function(d){
      if(!d||host.querySelector('#du-acct-pairs')||!/^#portal\/hq/.test(location.hash))return;
      var a=document.createElement('details');a.id='du-acct-pairs';a.className='du-glass du-acct-pairs';
      var g=d.groups||[];
      a.innerHTML='<summary><span class="du-kicker">FOUNDER · READ ONLY</span><b>Shared devices</b><em>'+g.length+'</em></summary>'+
        '<p class="du-acct-sub">Devices or browser fingerprints used by more than one DrawUp account. Keys are one-way hashes. '+esc(RULE)+' Grandfathered accounts existed before the limit and keep their credits.</p>'+
        (g.length?g.map(function(x){return '<div class="du-acct-group"><small>'+esc(x.key_type)+' '+esc(x.key_ref)+'…</small>'+(x.accounts||[]).map(function(m){
          return '<div class="du-acct-row"><span>'+esc(m.email)+'</span><i class="k-'+esc(m.kind)+'">'+esc(m.kind==='work'?'firm / business':m.kind)+'</i><i class="s-'+esc(String(m.status).replace(/\s/g,'-'))+'">'+esc(m.status)+(m.reason?' · '+esc(String(m.reason).replace(/_/g,' ')):'')+(m.account_type&&m.account_type!=='member'?' · '+esc(m.account_type):'')+'</i></div>';}).join('')+'</div>';}).join(''):'<p class="du-acct-sub">No shared devices yet.</p>');
      host.appendChild(a);
    }).catch(function(){}).then(function(){pairsBusy=false;});
  }
  new MutationObserver(function(){pairs();}).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',pairs);

  window.DrawUpAccounts={rule:RULE,kindOf:kindOf,link:link,last:null};
})();
