/* DrawUp v26 "Living Studio": public site pages and home sections.
 * Adds What is DrawUp / How it works / Why DrawUp to the home page and two new pages, Products and Solutions,
 * through DrawUpStudio.registerPage. Everything links to features that already exist. Static markup only. */
(function () {
  'use strict';
  const S = window.DrawUpStudio; if (!S || S._site) return; S._site = true;
  const ART = S.art; const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const go = a => `data-dus-go='${esc(JSON.stringify(a))}'`;
  const ico = n => (S.icon ? S.icon(n) : '');

  // Each product: where it lives on the public site, and where it opens in the Portal.
  const PRODUCTS = [
    { id: 'dus-p-draw', name: 'Draw', kicker: 'DrawUp Draw', art: 'card-draw.webp', title: 'Plans with real dimensions.',
      text: 'Walls, doors and windows are geometry, and every dimension is measured from that geometry. When a wall moves, its dimensions move with it.',
      points: ['Start from a building size or the example plan', 'Draw it up: a picture in, a drawing set out (preliminary, full set, or three options)', 'Mark up a file you already have', 'Comment on the drawings and regenerate'],
      open: { tab: 'draw' } },
    { id: 'dus-p-team', name: 'AI Team', kicker: 'Your AI Design Team', art: 'card-team.webp', title: 'The whole team is here.',
      text: 'Teammate brainstorms and builds with you. 6th Man waits on the bench until you call for another play. Arch Coach handles codes, details and reviews. One conversation, one shared memory.',
      points: ['The Locker Room keeps decisions, ideas and proposals', 'Project Memory remembers what matters on each project', 'Active Generations run in the background while you keep working'],
      open: { tab: 'ai-team' } },
    { id: 'dus-p-check', name: 'CheckUp', kicker: 'DrawUp CheckUp', art: 'card-check.webp', title: 'Check drawings before anyone else does.',
      text: 'Redlines on your actual sheets, with a drawn example of each fix. Your uploaded files are never replaced.',
      points: ['Quick Check a single sheet', 'Review a whole drawing set', 'Code, life safety and accessibility guidance for the design team'],
      page: 'check', open: { tab: 'check' } },
    { id: 'dus-p-details', name: 'Details', kicker: 'DrawUp Details', art: 'card-details.webp', title: 'Construction knowledge, one detail at a time.',
      text: 'A library of construction details, each with its own drawing. Upload one of yours and get the flaws, the fixes and a clean detail to scale.',
      points: ['Search by category, material, assembly or keyword', 'DrawUp 2D and 3D details', 'Share a detail with your firm'],
      page: 'details', open: { tab: 'details' } },
    { id: 'dus-p-swap', name: 'Swap', kicker: 'DrawUp Swap', art: 'card-swap.webp', title: 'See the next version of the room.',
      text: 'Paste a photo or render and tell DrawUp what to swap: materials, finishes, light, time of day. Turn a sketch or model into a photoreal render.',
      points: ['Material and finish chips to start from', 'Photoreal render from a sketch or model', 'Keep commenting to refine it'],
      page: 'swap', open: { tab: 'swap' } },
    { id: 'dus-p-projects', name: 'Projects', kicker: 'Projects and Sets', art: 'card-projects.webp', title: 'Every project in one place.',
      text: 'Each project keeps its drawing sets, checks, details, renders and AI Team conversations together, saved to your account, with a cover you choose.',
      points: ['Drawing sets filed by sheet', 'A cover picked from your renders, uploads or drawings', 'A starter project that teaches DrawUp in three steps'],
      open: { tab: 'projects' } },
    { id: 'dus-p-docs', name: 'Narrative Review', kicker: 'Narrative review', art: 'holo-generic.webp', title: 'Narratives that match the drawings.',
      text: 'CheckUp reads a design narrative, recommends before it rewrites, and compares the narrative against your plans so the words and the sheets agree.',
      points: ['Design narrative reviewer', 'Narrative-to-plans comparison', 'Recommendations you approve'],
      page: 'check', open: { tab: 'check' } }
  ];
  const SOLUTIONS = [
    { id: 'dus-s-students', title: 'Students', text: 'Learn by doing. The starter project and the DrawUp Playbook teach the tools in small steps, Arch Coach answers questions at any hour, and every drawing you make is saved to your account.', uses: ['Starter project', 'Playbook badges', 'Arch Coach', 'Draw'] },
    { id: 'dus-s-architects', title: 'Architects', text: 'Draw it up, check it and detail it in one place. Keep each project’s sets, checks and conversations together, and bring the AI Team into the work when you need another set of eyes.', uses: ['Draw', 'CheckUp', 'Details', 'AI Team'] },
    { id: 'dus-s-firms', title: 'Architecture firms', text: 'A firm workspace with offices, units, projects, a shared detail library, a playbook and presentations, with the permissions your firm already set.', uses: ['Firm workspace', 'Detail library', 'Playbook', 'Present'], page: 'firms' },
    { id: 'dus-s-engineers', title: 'Engineering teams', text: 'Review drawings with redlines on the real sheets, share construction details, and ask code and construction questions with the drawing attached.', uses: ['CheckUp', 'Details', 'Arch Coach', 'Connect'] },
    { id: 'dus-s-educators', title: 'Educators', text: 'Point students to the Playbook and the starter project, follow their work in Discover, and use Connect for boards, timelines and Lunch and Learns.', uses: ['Playbook', 'Discover', 'Connect', 'Universities'] }
  ];
  const ctaRow = `<div class="dus-mcta"><button type="button" class="dus-btn dus-btn--peach" data-dus-start>Get Started</button><button type="button" class="dus-btn dus-btn--ghost-dark" ${go({ page: 'pricing' })}>See pricing</button></div>`;

  /* ---------------------------------------------------------------- home sections */
  function homeSections() {
    const home = $('#page-home'); const hero = home && home.querySelector('header.hero'); if (!hero || $('#dus-about')) return;
    // v26.1: the home hero is Jaja's approved artwork (the nav and countdown strip cropped off, since the live ones sit above it).
    // Its buttons and cards are real links laid over the picture; phones get a building-only crop with the words as live text.
    hero.classList.add('dus-h3hero');
    const HW = 1595, HH = 883, at = ([x0, y0, x1, y1]) => `left:${(x0 / HW * 100).toFixed(3)}%;top:${(y0 / HH * 100).toFixed(3)}%;width:${((x1 - x0) / HW * 100).toFixed(3)}%;height:${((y1 - y0) / HH * 100).toFixed(3)}%`;
    const CARDS = [
      ['Design', 'Space planning and concepts with AI', { page: 'products', scroll: '#dus-p-draw' }, [32, 694, 324, 851]],
      ['Check', 'Plan review with CheckUp', { page: 'products', scroll: '#dus-p-check' }, [341, 694, 633, 851]],
      ['Details', '2D and 3D detail library', { page: 'products', scroll: '#dus-p-details' }, [650, 694, 942, 851]],
      ['Sets', 'Drawing sets', { page: 'products', scroll: '#dus-p-sets' }, [958, 694, 1250, 851]],
      ['Bid Board', 'Connect with vendors and builders', { page: 'products', scroll: '#dus-p-connect' }, [1267, 694, 1559, 851]]
    ];
    hero.insertAdjacentHTML('afterbegin', `<div class="dus-h3">
      <div class="dus-h3__pic">
        <picture><source media="(max-width:760px)" srcset="${ART}home-hero-m.webp" width="800" height="687"><img src="${ART}home-hero.webp" width="${HW}" height="${HH}" alt="" decoding="async" fetchpriority="high"></picture>
        <button type="button" class="dus-h3__hit dus-h3__hit--pill" data-dus-start style="${at([36, 384, 212, 436])}">Get Started</button>
        <button type="button" class="dus-h3__hit dus-h3__hit--pill" data-dus-overview style="${at([232, 384, 441, 436])}" aria-label="Watch overview: see how DrawUp works">Watch Overview</button>
        ${CARDS.map(c => `<button type="button" class="dus-h3__hit dus-h3__hit--card" ${go(c[2])} style="${at(c[3])}" aria-label="${esc(c[0])}: ${esc(c[1])}"></button>`).join('')}
      </div>
      <div class="dus-h3__copy">
        <span class="dus-h3__eyebrow">Design · Check · Plan · Build</span>
        <h1>Draw it up. <span>See it through.</span></h1>
        <p>The AI architecture platform for students, professionals, and firms.</p>
        <div class="dus-h3__actions"><button type="button" class="dus-btn dus-btn--primary" data-dus-start>Get Started ${S.icon('right')}</button><button type="button" class="dus-btn dus-btn--ghost-dark" data-dus-overview>${S.icon('play')} Watch Overview</button></div>
      </div>
      <nav class="dus-h3__cards" aria-label="Start with a tool">${CARDS.map(c => `<button type="button" class="dus-h3__card" ${go(c[2])}><b>${esc(c[0])}</b><small>${esc(c[1])}</small>${S.icon('right')}</button>`).join('')}</nav>
    </div>`);
    const tiles = PRODUCTS.slice(0, 6).map(p => `<button type="button" class="dus-mtile" ${go({ page: 'products', scroll: '#' + p.id })}><span class="dus-mtile__art" style="background-image:url('${ART}${p.art}')"></span><span class="dus-mtile__copy"><b>${esc(p.name)}</b><small>${esc(p.title)}</small></span></button>`).join('');
    const html = `
      <section class="dus-msec dus-msec--light" id="dus-about"><div class="dus-mwrap">
        <span class="dus-kicker">What is DrawUp</span>
        <h2 class="dus-mh2">One studio for the whole job.</h2>
        <p class="dus-mlead">DrawUp brings drawing, checking, detailing, visualizing and an AI design team into one place, around your projects. Pick up where you left off on any device.</p>
        <div class="dus-mtiles">${tiles}</div>
      </div></section>
      <section class="dus-msec dus-msec--grey" id="dus-how"><div class="dus-mwrap">
        <span class="dus-kicker">How DrawUp works</span>
        <h2 class="dus-mh2">Start a project. Draw it up. See it through.</h2>
        <ol class="dus-msteps">
          <li><i>1</i><b>Start a project</b><p>Name it, add the type, phase and location, and pick a cover. Everything you make after that is filed with it.</p></li>
          <li><i>2</i><b>Draw it up and check it</b><p>Plans with real dimensions, drawing sets from a picture, and CheckUp redlines on the real sheets.</p></li>
          <li><i>3</i><b>Detail, visualize and share</b><p>Details to scale, Swap renders, and your firm or classmates in Connect. The AI Team stays with you the whole way.</p></li>
        </ol>
      </div></section>
      <section class="dus-msec dus-msec--light" id="dus-why"><div class="dus-mwrap dus-mwhy">
        <div><span class="dus-kicker">Why DrawUp</span><h2 class="dus-mh2">Built for the people who draw it up.</h2>${ctaRow.replace('dus-btn--ghost-dark', 'dus-btn--light')}</div>
        <ul class="dus-mwhy__list">
          <li><b>Real geometry</b><span>Dimensions come from the drawing, not typed on top of it.</span></li>
          <li><b>Your files stay yours</b><span>Checks and markups never replace what you uploaded.</span></li>
          <li><b>A team that remembers</b><span>Project Memory and the Locker Room keep decisions with the project.</span></li>
          <li><b>One place</b><span>Projects, drawings, checks, details and renders, together.</span></li>
        </ul>
      </div></section>`;
    hero.insertAdjacentHTML('afterend', html);
  }

  /* ---------------------------------------------------------------- Products */
  /* ---------------------------------------------------------------- Products (v26.1, after Jaja's image 5)
   * White page, navy type, cyan holograms, royal-blue highlights and a little peach. Every button opens a feature that exists.
   * The CheckUp redlines are drawn on DrawUp's own sample plan and are marked as an illustration. */
  const FXA = ART + 'fx/';
  const SEC1 = [
    { id: 'dus-p-draw', k: 'DrawUp Draw', t: 'Plans with real dimensions.', p: 'Generate, edit, and develop drawings where every dimension is measured from the walls.', open: { tab: 'draw' },
      art: `<div class="dus-pc__draw"><img class="dus-pc__plan" src="${ART}plan-sheet.svg" alt="" loading="lazy"><img class="dus-pc__model" src="${FXA}model-white.webp" alt="" loading="lazy"></div>` },
    { id: 'dus-p-check', k: 'DrawUp CheckUp', t: 'Review before you build.', p: 'Redlines on your real sheets for drawing issues, code questions, accessibility and coordination.', open: { tab: 'check' },
      art: `<div class="dus-pc__check"><img src="${ART}plan-sheet.svg" alt="" loading="lazy"><span class="dus-rl" style="left:76%;top:43%">Exit door clearance?</span><span class="dus-rl dus-rl--b" style="left:26%;top:43%">Egress path</span><span class="dus-rl" style="left:37%;top:20%">Turning space</span><em class="dus-pc__note">Illustration</em></div>` },
    { id: 'dus-p-details', k: 'DrawUp Details', t: 'Understand every connection.', p: 'Explore 2D and 3D construction assemblies, or upload a detail and get the fixes.', open: { tab: 'details' },
      art: `<div class="dus-pc__wall">${['foundation', 'gypsum', 'framing', 'insulation', 'sheathing', 'wrb', 'cladding'].map((l, k) => `<img src="${FXA}wall-${l}.webp" alt="" loading="lazy" style="--k:${[0, -1.4, -.6, 0, .8, 1.6, 2.4][k]}">`).join('')}
        <ul><li>Exterior cladding</li><li>Weather barrier</li><li>Sheathing</li><li>Insulation</li><li>Wood studs</li><li>Concrete foundation</li></ul></div>` },
    { id: 'dus-p-sets', k: 'DrawUp Sets', t: 'From drawings to deliverables.', p: 'Organize coordinated sheets into a drawing set, filed with the project.', open: { tab: 'projects' },
      art: `<div class="dus-pc__sets"><figure style="--r:-9deg;--x:-28%"><img src="${ART}plan-sheet.svg" alt="" loading="lazy"><figcaption>A-101</figcaption></figure><figure style="--r:-2deg;--x:-6%"><img src="${FXA}wall-cladding.webp" alt="" loading="lazy" class="is-sec"><figcaption>A-501</figcaption></figure><figure style="--r:6deg;--x:18%"><img src="${ART}plan-sheet.svg" alt="" loading="lazy"><figcaption>A-102</figcaption></figure><img class="dus-pc__mini" src="${FXA}model-white.webp" alt="" loading="lazy"></div>` }
  ];
  const MORE = [
    { id: 'dus-p-docs', k: 'Narrative Review', t: 'Narratives that match the drawings.', p: 'CheckUp reads a design narrative, recommends before it rewrites, and compares it against your plans.', go: { tab: 'check' }, label: 'Open CheckUp' },
    { id: 'dus-p-coach', k: 'Arch Coach', t: 'Your own coach, your own way.', p: 'Make your coach, earn XP, unlock Hall of Fame legends and work through the Playbook.', go: { page: 'coach' }, label: 'About Arch Coach' },
    { id: 'dus-p-firm', k: 'Firm', t: 'One workspace for the firm.', p: 'Offices, units, projects, a shared detail library, a playbook and presentations, with the permissions your firm set.', go: { page: 'firms' }, label: 'For firms' },
    { id: 'dus-p-discover', k: 'Discover', t: 'Projects, firms and people.', p: 'Explore projects, firms, people and universities, and follow the work that inspires you.', go: { page: 'discover' }, label: 'Open Discover' },
    { id: 'dus-p-connect', k: 'Connect', t: 'Better together.', p: 'Boards, timelines and Lunch and Learns with the people you build with.', go: { page: 'connect' }, label: 'Open Connect' }
  ];
  const head = (n, k, h, side) => `<div class="dus-pr-head"><div><span class="dus-pr-k">${n} / ${esc(k)}</span><h2>${esc(h)}</h2></div><p>${esc(side)}</p></div>`;
  const arrow = (a, label) => `<button type="button" class="dus-pr-go" ${go(a)} aria-label="${esc(label)}">${ico('right')}</button>`;
  S.registerPage('products', pg => {
    pg.innerHTML = `<div class="dus-pr">
      <header class="dus-pr-hero"><div class="dus-pr-wrap dus-pr-hero__grid">
        <div class="dus-pr-hero__copy"><span class="dus-pr-k">Products</span><h1>Every tool<br>in the <em>studio.</em></h1>
          <p>Draw, check, detail, and visualize with an AI design team that knows the project.</p>
          <nav class="dus-pr-chips" aria-label="Products">${[['Draw', 'dus-p-draw'], ['AI Team', 'dus-p-team'], ['CheckUp', 'dus-p-check'], ['Details', 'dus-p-details'], ['Swap', 'dus-p-swap'], ['Projects', 'dus-p-projects']].map(([n, id]) => `<a href="#${id}" data-dus-jump="${id}">${n}</a>`).join('')}</nav></div>
        <div class="dus-pr-hero__art"><img src="${ART}products-hero.webp" alt="A multistorey building, photoreal on the left, becoming a cyan hologram on the right" fetchpriority="high">
          <ol class="dus-pr-hero__labels" aria-label="From concept to build">${['Concept', 'Design', 'Analyze', 'Detail', 'Build'].map((l, k) => `<li style="--k:${k}">${l}</li>`).join('')}</ol></div>
      </div></header>

      <section class="dus-pr-sec"><div class="dus-pr-wrap">
        ${head('01', 'Design & documentation', 'Architecture you can build on.', 'From concept to coordinated drawings, with tools that keep architectural precision.')}
        <div class="dus-pr-cards">${SEC1.map(c => `<article class="dus-pc" id="${c.id}"><div class="dus-pc__art" aria-hidden="true">${c.art}</div>
          <div class="dus-pc__body"><span class="dus-pr-k dus-pr-k--s">${esc(c.k)}</span><h3>${esc(c.t)}</h3><p>${esc(c.p)}</p>${arrow(c.open, 'Open ' + c.k)}</div></article>`).join('')}</div>
      </div></section>

      <section class="dus-pr-sec dus-pr-sec--alt" id="dus-p-team"><div class="dus-pr-wrap">
        ${head('02', 'Architectural intelligence', 'An entire design team, one conversation.', 'Guidance seen through legendary architects and engineers, and AI built for the building industry.')}
        <div class="dus-pr-team">
          <div class="dus-pr-team__copy">
            <dl><dt>Arch Coach</dt><dd>Codes, details and reviews, with your own coach character.</dd><dt>Teammate</dt><dd>Brainstorms and builds with you.</dd><dt>Sixth Man</dt><dd>Comes off the bench for another play.</dd></dl>
            <p>Your AI design team, connected to your project.</p>
            <button type="button" class="dus-btn dus-pr-btn" ${go({ tab: 'ai-team' })}>Open AI Team ${ico('right')}</button></div>
          <div class="dus-pr-team__art" aria-hidden="true"><div class="dus-pr-team__band"></div><img class="dus-pr-team__holo" src="${FXA}tower-holo-m.webp" alt="" loading="lazy">
            <ul>${['Ideas', 'Drawings', 'Code', 'Details', 'Visualize'].map(x => `<li>${x}</li>`).join('')}</ul></div>
        </div>
      </div></section>

      <section class="dus-pr-sec" id="dus-p-swap"><div class="dus-pr-wrap">
        ${head('03', 'DrawUp Swap', 'See the possibilities before they’re built.', 'Transform existing spaces into photorealistic redesigns with AI.')}
        <div class="dus-pr-swap">
          <div class="dus-ba" data-dus-ba style="--x:50%">
            <img src="${FXA}gym-after.webp" alt="After: the gym with light blue and orange court paint" loading="lazy">
            <div class="dus-ba__before"><img src="${FXA}gym-before.webp" alt="Before: the gym with navy court paint" loading="lazy"></div>
            <span class="dus-ba__tag dus-ba__tag--l">Before</span><span class="dus-ba__tag dus-ba__tag--r">After</span>
            <div class="dus-ba__line"><button type="button" class="dus-ba__knob" role="slider" aria-label="Compare before and after" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" aria-valuetext="50% before">${ico('swap')}</button></div>
          </div>
          <div class="dus-pr-side"><span class="dus-pr-k dus-pr-k--s">DrawUp Swap</span><h3>Same space.<br>New possibilities.</h3><p>Upload an existing space, visualize design changes, and compare the transformation.</p>
            <button type="button" class="dus-btn dus-pr-btn" ${go({ tab: 'swap' })}>Open Swap ${ico('right')}</button></div>
        </div>
      </div></section>

      <section class="dus-pr-sec dus-pr-sec--alt" id="dus-p-projects"><div class="dus-pr-wrap">
        ${head('04', 'Project workspace', 'Your projects. Your firm’s standards.', 'Keep everything connected: projects, drawings, reviews and firm knowledge.')}
        <div class="dus-pr-proj">
          <div class="dus-pr-proj__stage">
            <img class="dus-pr-proj__bld" src="${ART}products-building.webp" alt="" loading="lazy">
            <div class="dus-pp dus-pp--phases"><b>Projects</b><ol>${['Concept', 'Schematic Design', 'Design Development', 'Construction Documents', 'Bidding', 'Construction'].map((x, k) => `<li class="${k === 2 ? 'is-on' : ''}">${x}</li>`).join('')}</ol></div>
            <div class="dus-pp dus-pp--draw"><b>Drawings</b><img src="${ART}plan-sheet.svg" alt="" loading="lazy"></div>
            <div class="dus-pp dus-pp--team"><b>Team</b><span><i>AR</i><i>ST</i><i>ME</i><i>+</i></span><small>Architect, structural, MEP</small></div>
            <div class="dus-pp dus-pp--std"><b>Standards</b><ul><li>Detail library</li><li>Playbook</li><li>Presentations</li></ul></div>
          </div>
          <div class="dus-pr-side"><span class="dus-pr-k dus-pr-k--s">DrawUp Projects</span><h3>Organize, explore, and bring your buildings to life.</h3>
            <ol class="dus-pr-flow"><li>Find the flaws</li><li>Understand the fix</li><li>DrawUp ready</li></ol>
            <button type="button" class="dus-btn dus-pr-btn" ${go({ tab: 'projects' })}>Open Projects ${ico('right')}</button></div>
        </div>
      </div></section>

      <section class="dus-pr-sec"><div class="dus-pr-wrap">
        ${head('05', 'More in the studio', 'Everything else you already use.', 'Reviews, your coach, your firm, and the community around your work.')}
        <div class="dus-pr-more">${MORE.map(m => `<article class="dus-pm" id="${m.id}"><span class="dus-pr-k dus-pr-k--s">${esc(m.k)}</span><h3>${esc(m.t)}</h3><p>${esc(m.p)}</p><button type="button" class="dus-textlink" ${go(m.go)}>${esc(m.label)} ${ico('right')}</button></article>`).join('')}</div>
      </div></section>
      <section class="dus-msec dus-msec--navy"><div class="dus-mwrap dus-center"><h2 class="dus-mh2">Draw it up. See it through.</h2>${ctaRow}</div></section>
    </div>`;
    bindBeforeAfter(pg);
  });
  // The Swap comparison: drag, click or tap anywhere on it, or use the arrow keys, Home and End on the handle.
  function bindBeforeAfter(root) {
    root.querySelectorAll('[data-dus-ba]').forEach(ba => {
      const knob = ba.querySelector('.dus-ba__knob'); let v = 50, drag = false;
      const set = n => { v = Math.max(0, Math.min(100, Math.round(n))); ba.style.setProperty('--x', v + '%'); knob.setAttribute('aria-valuenow', v); knob.setAttribute('aria-valuetext', `${v}% before`); };
      const at = e => { const r = ba.getBoundingClientRect(); set((e.clientX - r.left) / r.width * 100); };
      ba.addEventListener('pointerdown', e => { drag = true; ba.setPointerCapture(e.pointerId); at(e); knob.focus({ preventScroll: true }); });
      ba.addEventListener('pointermove', e => { if (drag) at(e); });
      ['pointerup', 'pointercancel'].forEach(t => ba.addEventListener(t, () => { drag = false; }));
      knob.addEventListener('keydown', e => {
        const step = e.shiftKey ? 10 : 2, m = { ArrowLeft: v - step, ArrowDown: v - step, ArrowRight: v + step, ArrowUp: v + step, PageDown: v - 10, PageUp: v + 10, Home: 0, End: 100 };
        if (e.key in m) { e.preventDefault(); set(m[e.key]); }
      });
    });
  }

  /* ---------------------------------------------------------------- Solutions */
  S.registerPage('solutions', pg => {
    pg.innerHTML = `
      <header class="dus-phead dus-phead--art"><div class="dus-mwrap">
        <span class="dus-kicker">Solutions</span><h1 class="dus-mh1">However you build, DrawUp fits.</h1>
        <p class="dus-mlead">Students, architects, firms, engineers and educators use the same studio in different ways.</p>
        <nav class="dus-pchips" aria-label="Solutions">${SOLUTIONS.map(s => `<a href="#${s.id}" data-dus-jump="${s.id}">${esc(s.title)}</a>`).join('')}</nav>
      </div></header>
      <section class="dus-msec dus-msec--light"><div class="dus-mwrap dus-sgrid">
        ${SOLUTIONS.map(s => `<article class="dus-scard" id="${s.id}"><h2>${esc(s.title)}</h2><p>${esc(s.text)}</p><div class="dus-scard__uses">${s.uses.map(u => `<span>${esc(u)}</span>`).join('')}</div>
          ${s.page ? `<button type="button" class="dus-btn dus-btn--light dus-btn--sm" ${go({ page: s.page })}>For firms ${ico('right')}</button>` : ''}</article>`).join('')}
      </div></section>
      <section class="dus-msec dus-msec--navy"><div class="dus-mwrap dus-center"><h2 class="dus-mh2">Find your seat on the team.</h2>${ctaRow}</div></section>`;
  });

  // In-page jumps and Get Started on the new pages.
  document.addEventListener('click', e => {
    const j = e.target.closest('[data-dus-jump]'); if (j) { e.preventDefault(); document.getElementById(j.dataset.dusJump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (e.target.closest('[data-dus-overview]')) { e.preventDefault(); const h = $('#dus-how'); if (h) { h.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } return; }
    if (e.target.closest('[data-dus-start]')) { e.preventDefault(); const k = $('.join-preseason'); if (k && k.style.display !== 'none') k.click(); else $('#drawup-signin')?.click(); }
  });

  function boot() { homeSections(); S.routeStudioHash?.(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
