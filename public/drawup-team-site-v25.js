/* DrawUp V25 public site: "Meet your AI Design Team" on the home page, an interactive scripted demo, and the
 * Teammate / 6th Man prices in the Pricing credit table.
 * The demo uses predefined responses only: no AI calls, no credits. The call to action opens the existing sign-up
 * (or the portal's AI Team tab for members who are already signed in).
 */
(function () {
  'use strict';
  if (window.__duTeamSite25) return; window.__duTeamSite25 = true;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const NAMES = { teammate: 'Teammate', sixth_man: '6th Man', coach: 'Arch Coach' };
  const ICON = { teammate: '◆', sixth_man: '6', coach: '✦' };
  const CARDS = [
    { k: 'teammate', title: 'TEAMMATE', sub: 'Your design partner', text: 'Brainstorm, talk, create, and make adjustments with an AI teammate that keeps up with your ideas.', feats: ['Instant Conversations', 'Design Collaboration', 'Project Memory', 'Talk & Build'], plan: 'Available on Free Plan' },
    { k: 'sixth_man', title: '6TH MAN', sub: 'The game changer', text: 'Stuck on a design? Call in the 6th Man. Your on-demand strategist knows the project and helps find the next play.', feats: ['Creative Alternatives', 'On-Demand Solutions', 'Project Awareness', 'Design Strategy'], plan: 'Available on Free Plan' },
    { k: 'coach', title: 'ARCH COACH', sub: 'The head coach', text: 'Your architectural expert for technical guidance, code research, drawing reviews, and design education.', feats: ['Building Code Guidance', 'Technical Research', 'Drawing Reviews', 'Architectural Education'], plan: 'On every plan, Free included · 3 credits a question, 8 for code research' },
  ];
  const PROMPT = 'How can I improve this office layout?';
  const SCRIPT = {
    teammate: [
      { who: 'teammate', text: "Let's open the middle of the layout and create a better connection between the offices. If we pull the copy room out of the center, the core becomes a shared work lounge with daylight from both sides." },
      { who: 'job', text: 'Generating a layout option' },
    ],
    sixth_man: [{ who: 'sixth_man', text: "I've been following the layout. I've got another play: what if we shift the meeting room instead of moving the corridor? Reception gets the room it needs, and the offices don't move at all." }],
    coach: [{ who: 'coach', text: "Before finalizing that change, let's review accessibility and egress requirements. A 44 in corridor usually works for this occupancy, and the meeting room door needs maneuvering clearance on the pull side. I'm checking the requirements for your jurisdiction now." }],
  };

  function section() {
    return `<section class="section du-ts25" id="du-ai-team" aria-labelledby="du-ts25-h">
      <div class="wrap">
        <div class="du-ts25-head"><span class="eyebrow">New in Season 1</span><h2 id="du-ts25-h">MEET YOUR AI DESIGN TEAM</h2>
          <p>Every great design needs a team. Meet the AI-powered crew that helps you think, create, solve, and build — all in one conversation.</p></div>
        <div class="du-ts25-cards">${CARDS.map(c => `<article class="du-ts25-card ${c.k}"><div class="du-ts25-badge ${c.k}" aria-hidden="true">${ICON[c.k]}</div>
          <h3>${c.title}</h3><p class="du-ts25-sub">${c.sub}</p><p>${esc(c.text)}</p>
          <ul>${c.feats.map(f => `<li>${esc(f)}</li>`).join('')}</ul><span class="du-ts25-plan">${esc(c.plan)}</span></article>`).join('')}</div>
        <div class="du-ts25-demo">
          <div class="du-ts25-demohead"><span class="du-ts25-label">DEMO · scripted answers, no AI, no credits</span>
            <div class="du-ts25-tabs" role="tablist" aria-label="Ask a team member">${Object.keys(NAMES).map((k, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-ts="${k}" class="${k}"><span>${ICON[k]}</span>${NAMES[k]}</button>`).join('')}</div></div>
          <div class="du-ts25-chat" aria-live="polite"><div class="du-ts25-msg user"><b>YOU</b><p>${esc(PROMPT)}</p></div></div>
          <div class="du-ts25-foot"><button type="button" class="btn btn-ghost btn-sm" data-ts-replay>Replay</button><span>Switch team members: they all share the same conversation.</span></div>
        </div>
        <div class="du-ts25-cta"><button type="button" class="btn btn-primary" data-ts-join>Join the Team — Start Designing Free</button></div>
      </div></section>`;
  }

  let run = 0;
  async function typeInto(el, text, my) {
    if (reduce()) { el.textContent = text; return; }
    for (let i = 0; i < text.length; i += 3) { if (my !== run) return; el.textContent = text.slice(0, i + 3); await sleep(14); }
  }
  async function play(root, who, fresh) {
    const my = ++run, chat = root.querySelector('.du-ts25-chat');
    if (fresh) chat.innerHTML = `<div class="du-ts25-msg user"><b>YOU</b><p>${esc(PROMPT)}</p></div>`;
    else if (chat.children.length > 1) { const u = document.createElement('div'); u.className = 'du-ts25-msg user'; u.innerHTML = `<b>YOU</b><p>${esc(who === 'sixth_man' ? '6th Man, what you thinking?' : who === 'coach' ? 'Coach, would that affect egress?' : "Teammate, let's try that.")}</p>`; chat.appendChild(u); }
    for (const step of SCRIPT[who]) {
      if (my !== run) return;
      if (step.who === 'job') {
        const j = document.createElement('div'); j.className = 'du-ts25-job';
        j.innerHTML = `<b>⟳ ${esc(step.text)}</b><span>In progress · keep chatting</span><div class="du-ts25-bar"><i></i></div>`;
        chat.appendChild(j);
        (async () => { const bar = j.querySelector('i'); for (let p = 0; p <= 100; p += 5) { if (my !== run) return; bar.style.width = p + '%'; await sleep(reduce() ? 0 : 120); } j.querySelector('span').textContent = 'Done · Layout option ready in the thread'; j.classList.add('done'); })();
        continue;
      }
      const m = document.createElement('div'); m.className = 'du-ts25-msg ' + step.who;
      m.innerHTML = `<b><span class="du-ts25-badge ${step.who}">${ICON[step.who]}</span>${NAMES[step.who].toUpperCase()}</b><p><span class="du-ts25-dots" aria-label="Writing"><i></i><i></i><i></i></span></p>`;
      chat.appendChild(m); chat.scrollTop = chat.scrollHeight;
      await sleep(reduce() ? 0 : 650);
      await typeInto(m.querySelector('p'), step.text, my);
      chat.scrollTop = chat.scrollHeight;
    }
  }
  function join() {
    try { localStorage.setItem('drawup_portal_tab_v17', 'ai-team'); } catch (_) {}
    if (window.DrawUpPortal?.isSignedIn?.()) { window.DrawUpPortal.openPortal('ai-team'); return; }
    const j = document.querySelector('.join-preseason');
    if (j) j.click(); else location.hash = '#signup';
  }
  function mount() {
    const home = document.getElementById('page-home');
    if (!home || document.getElementById('du-ai-team')) return;
    const five = [...home.querySelectorAll('section.section')].find(s => s.querySelector('.five-grid'));
    const wrap = document.createElement('div'); wrap.innerHTML = section();
    const node = wrap.firstElementChild;
    if (five) five.after(node); else home.appendChild(node);
    node.querySelectorAll('[data-ts]').forEach(b => b.onclick = () => { node.querySelectorAll('[data-ts]').forEach(x => x.setAttribute('aria-selected', String(x === b))); play(node, b.dataset.ts, false); });
    node.querySelector('[data-ts-replay]').onclick = () => { node.querySelectorAll('[data-ts]').forEach((x, i) => x.setAttribute('aria-selected', String(i === 0))); play(node, 'teammate', true); };
    node.querySelector('[data-ts-join]').onclick = join;
    // Start the demo the first time it scrolls into view.
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); play(node, 'teammate', true); } }, { threshold: .35 }) : null;
    if (io) io.observe(node.querySelector('.du-ts25-demo')); else play(node, 'teammate', true);
    // Pricing: show what the new team members cost, next to the existing Arch Coach rows.
    const table = document.querySelector('#page-pricing .du-credit-table');
    if (table && !table.querySelector('[data-ts-row]')) table.insertAdjacentHTML('afterbegin', `<div class="du-credit-row" role="row" data-ts-row><span class="du-credit-cost" role="cell" data-ts-cost="chat">1</span><span role="cell"><b>Teammate or 6th Man message</b><small>AI Design Team conversation, included on the Free plan</small></span></div><div class="du-credit-row" role="row" data-ts-row><span class="du-credit-cost" role="cell" data-ts-cost="shot">8</span><span role="cell"><b>6th Man “take the shot” or a new layout option</b><small>A detailed proposal written in the background</small></span></div>`);
    fetch('/api/team/config').then(r => r.json()).then(d => { document.querySelectorAll('[data-ts-cost]').forEach(el => { const v = d?.costs?.[el.dataset.tsCost]; if (Number.isFinite(v)) el.textContent = v; }); }).catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
