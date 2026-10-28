/* DrawUp v26.1 "Living Studio": cinematic module transitions ("active portals").
 * window.DrawUpStudioFX.play(section, { speed: 'quick' | 'cinematic', cover, projectName }) lays a short scene over the Portal
 * while the area is already opening underneath. Every scene is built from layered art made for DrawUp (Blender renders, the
 * DrawUp sample floor plan as live SVG, the globe drawn from Natural Earth data) plus the member-approved images
 * (the Arch Coach legends artwork and the Swap gym pair). Nothing here is a crop of the 3x3 reference board.
 *
 * Rules it keeps:
 *  - v28 (Jaja: "like 3 seconds, so quick I can't see what is happening"): 3 s (Quick) or 4 s (Cinematic). It never
 *    plays twice in a row for the same area, and a click, tap or Esc still skips it at once.
 *  - It never waits on or blocks the page and never makes a navigation request: DrawUpStudio opens the tab first.
 *  - A click, a tap, Esc, Enter, Space or the Skip button ends it at once.
 *  - DrawUpStudio only calls it for clicks in the Studio navigation, not for direct links, reloads or back/forward,
 *    and not when the member turned transitions off or the device asks for reduced motion (checked again here).
 *  - Phones get lighter images and fewer moving layers.
 *  - If an image fails to load the layer is dropped and the scene still plays with its lines and title.
 *  - The CheckUp scene shows where a review looks (walls, doors, dimensions, egress). It never shows a result. */
(function () {
  'use strict';
  if (window.DrawUpStudioFX) return;
  const ART = '/drawup-studio-v26/fx/';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const small = () => matchMedia('(max-width: 760px)').matches;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = () => !!(navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType || '')));
  // an image layer: phones get the -m (960 px) version when one exists
  const img = (name, cls = '', style = '', m = true) => `<img class="fx-img ${cls}" src="${ART}${small() && m ? name.replace(/\.webp$/, '-m.webp') : name}" alt="" decoding="async" style="${style}" onerror="this.remove()">`;
  const line = (d, i, cls = '') => `<path class="fx-ln ${cls}" pathLength="1" style="--i:${i}" d="${d}"/>`;

  // Wall section layers, inside to outside, with the anchor point (percent of the frame) where each leader starts.
  const WALL = [
    ['foundation', 'Concrete foundation', [52, 78]],
    ['framing', 'Wood stud framing', [40, 30]],
    ['insulation', 'Insulation', [44, 50]],
    ['sheathing', 'Sheathing', [49, 40]],
    ['wrb', 'Weather barrier', [52, 36]],
    ['cladding', 'Exterior cladding', [58, 32]]
  ];
  // Globe pins (percent of the globe image) for real places, and illustrative project cards.
  const PINS = [[56.8, 37.0], [48.4, 36.3], [28.7, 40.0], [39.2, 54.0], [76.8, 81.3], [79.1, 17.8]];

  /* The scene list. One entry per Portal area: id, route, number and words for the title, the images it uses,
   * how it is built, what shows if images fail (fallback), and what happens with reduced motion (nothing plays). */
  const SCENES = {
    'ai-team': { route: '#portal/ai-team', num: '01', title: ['AI ', 'Team'], kicker: 'Your design intelligence',
      text: 'Arch Coach, Teammate and Sixth Man, with Hall of Fame legends for a second opinion.',
      assets: ['legends-band.webp'], fallback: 'blueprint lines and the Arch Coach panel', reducedMotion: 'none',
      build() {
        const cols = [[0, 12.2], [12.2, 23.9], [23.9, 37.3], [37.3, 54.6], [54.6, 62.2], [62.2, 75.6], [75.6, 87.8], [87.8, 100]];
        let bp = ''; for (let k = 0; k < 14; k++) bp += line(`M${k * 120} 0V700`, k * .01, 'fx-ln--faint');
        for (let k = 0; k < 7; k++) bp += line(`M0 ${k * 110 + 40}H1600`, .03 + k * .01, 'fx-ln--faint');
        bp += line('M300 610H1300M800 470V700', .1) + line('M520 640a280 90 0 0 0 560 0', .14);
        return `<svg class="fx-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${bp}</svg>
          <div class="fx-legends">${cols.map(([a, b], k) => `<i style="--k:${k};left:${a}%;width:${b - a}%;background-position:${a / (100 - (b - a)) * 100}% 0;background-size:${100 / (b - a) * 100}% 100%"></i>`).join('')}</div>
          <div class="fx-coach"><span class="fx-coach__k">DrawUp AI Team</span><b>Arch Coach</b>
            <div class="fx-coach__who"><span>Arch Coach<small>Your coach</small></span><span>Teammate<small>Works the problem</small></span><span>Sixth Man<small>Fresh eyes</small></span></div>
            <div class="fx-coach__bar"><i></i>Ask Arch Coach…<em></em></div></div>`;
      } },
    projects: { route: '#portal/projects', num: '02', title: ['', 'Projects'], kicker: 'Your project universe',
      text: 'Every drawing, check, render and conversation, filed with the project.',
      assets: ['tower-frame.webp', 'tower-clay.webp', 'tower-photo.webp'], fallback: 'the hologram frame', reducedMotion: 'none',
      build(o) {
        const card = o.cover && o.cover.url ? `<div class="fx-pcard"><i style="background-image:url('${esc(o.cover.url)}')"></i><span>Opening<b>${esc(o.projectName || 'your project')}</b></span></div>` : '';
        return `<div class="fx-cam">${img('tower-frame.webp', 'fx-rise fx-rise--1')}${img('tower-clay.webp', 'fx-rise fx-rise--2')}${img('tower-photo.webp', 'fx-rise fx-rise--3')}<i class="fx-riseline"></i></div>${card}`;
      } },
    check: { route: '#portal/check', num: '03', title: ['Check', 'Up'], kicker: 'Design with confidence',
      text: 'CheckUp reads your sheets: walls, doors, dimensions and the way out.',
      assets: ['plan-holo.svg'], fallback: 'the review panel', reducedMotion: 'none',
      build() {
        return `<div class="fx-plan fx-plan--check" data-fx-plan></div><i class="fx-beam"></i>
          <div class="fx-panel"><span class="fx-panel__k">CheckUp</span><b>Review areas</b>
            <ol><li style="--k:0">Walls and openings</li><li style="--k:1">Door clearances</li><li style="--k:2">Dimensions</li><li style="--k:3">Egress paths</li><li style="--k:4">Accessible restrooms</li></ol>
            <small>Illustrative. Your results come from your own sheets.</small></div>`;
      } },
    draw: { route: '#portal/draw', num: '04', title: ['', 'Draw'], kicker: 'From concept to creation',
      text: 'Plans with real dimensions that become a model.',
      assets: ['plan-holo.svg', 'model-navy.webp'], fallback: 'the drafting grid', reducedMotion: 'none',
      build() {
        return `<div class="fx-grid"></div><div class="fx-plan fx-plan--draw" data-fx-plan></div><div class="fx-model">${img('model-navy.webp')}</div>
          <ul class="fx-tools"><li style="--k:0">Walls</li><li style="--k:1">Doors</li><li style="--k:2">Windows</li><li style="--k:3">Dimensions</li><li style="--k:4">3D</li></ul>`;
      } },
    details: { route: '#portal/details', num: '05', title: ['', 'Details'], kicker: 'Built from the inside out',
      text: 'Real assemblies, layer by layer.',
      assets: WALL.map(w => 'wall-' + w[0] + '.webp'), fallback: 'the layer labels', reducedMotion: 'none',
      build() {
        const n = WALL.length;
        return `<div class="fx-wall">${WALL.map((w, k) => `<div class="fx-wall__l" style="--k:${k - (n - 1) / 2}">${img('wall-' + w[0] + '.webp', '', '', false)}</div>`).join('')}</div>
          <ul class="fx-leaders">${WALL.slice().reverse().map((w, k) => `<li style="--k:${k}"><span>${esc(w[1])}</span></li>`).join('')}</ul>`;
      } },
    swap: { route: '#portal/swap', num: '06', title: ['', 'Swap'], kicker: 'Reimagine existing spaces',
      text: 'Same space. Same camera. A new look.',
      assets: ['gym-before.webp', 'gym-after.webp'], fallback: 'the divider and labels', reducedMotion: 'none',
      build() {
        return `<div class="fx-swap"><img class="fx-swap__a" src="${ART}gym-before.webp" alt="" onerror="this.remove()"><img class="fx-swap__b" src="${ART}gym-after.webp" alt="" onerror="this.remove()"><i class="fx-swap__div"></i><span class="fx-tag fx-tag--l">Before</span><span class="fx-tag fx-tag--r">After</span></div>`;
      } },
    firm: { route: '#portal/firm', num: '07', title: ['', 'Firm'], kicker: 'Your firm. Your playbook.',
      text: 'Projects, standards and people in one studio.',
      assets: ['studio.webp'], fallback: 'the standards panels', reducedMotion: 'none',
      build() {
        const lines = line('M300 300C480 340 560 420 650 520', .35) + line('M1300 300C1120 340 1060 420 990 520', .42) + line('M800 160V470', .5);
        return `<div class="fx-cam fx-cam--push">${img('studio.webp')}</div><svg class="fx-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${lines}</svg>
          <div class="fx-chip" style="--k:0;left:9%;top:24%"><b>Projects</b><small>Every job, one place</small></div>
          <div class="fx-chip" style="--k:1;left:43%;top:9%"><b>Standards</b><small>Your details and notes</small></div>
          <div class="fx-chip" style="--k:2;right:9%;top:24%"><b>Team</b><small>Who is on what</small></div>`;
      } },
    discover: { route: '#portal/discover', num: '08', title: ['', 'Discover'], kicker: 'The world of design',
      text: 'Projects, firms and architects, everywhere.',
      assets: ['globe.webp', 'tower-photo.webp', 'model-white.webp'], fallback: 'the network lines', reducedMotion: 'none',
      build() {
        const arcs = [[0, 2], [0, 4], [0, 5], [1, 3], [2, 3]].map(([a, b], k) => { const p = PINS[a], q = PINS[b]; const mx = (p[0] + q[0]) / 2, my = Math.min(p[1], q[1]) - 14; return line(`M${p[0] * 10} ${p[1] * 10}Q${mx * 10} ${my * 10} ${q[0] * 10} ${q[1] * 10}`, .2 + k * .06, 'fx-ln--arc'); }).join('');
        return `<div class="fx-world"><div class="fx-globe">${img('globe.webp', '', '', false)}<svg class="fx-svg" viewBox="0 0 1000 1000" aria-hidden="true">${arcs}</svg>${PINS.map((p, k) => `<i class="fx-pin" style="--k:${k};left:${p[0]}%;top:${p[1]}%"></i>`).join('')}</div>
          <div class="fx-card" style="--k:0;left:8%;top:16%"><i style="background-image:url('${ART}tower-photo-m.webp')"></i><b>Mixed-use</b><small>8 storeys</small></div>
          <div class="fx-card" style="--k:1;right:8%;top:12%"><i style="background-image:url('${ART}model-white-m.webp')"></i><b>Clinic</b><small>2,560 sq ft</small></div>
          <div class="fx-card fx-card--feat" style="--k:2;left:58%;top:30%"><i style="background-image:url('${ART}../hero-studio.webp')"></i><b>Residence</b><small>Featured</small></div></div>`;
      } },
    connect: { route: '#portal/connect', num: '09', title: ['', 'Connect'], kicker: 'Better together',
      text: 'Architects, engineers, builders and clients around one project.',
      assets: ['tower-holo.webp'], fallback: 'the discipline network', reducedMotion: 'none',
      build() {
        const N = [['Architect', 800, 150], ['Structural', 1180, 260], ['MEP', 1280, 520], ['Contractor', 1060, 760], ['Client', 540, 760], ['Civil', 320, 520], ['Interiors', 420, 260]];
        const outer = [[620, 70], [1000, 80], [1420, 380], [1420, 680], [800, 860], [180, 680], [180, 380]];
        let s = N.map(([, x, y], k) => line(`M800 470L${x} ${y}`, .12 + k * .04)).join('');
        s += N.map(([, x, y], k) => { const [ox, oy] = outer[k]; return line(`M${x} ${y}L${ox} ${oy}`, .5 + k * .03, 'fx-ln--faint'); }).join('');
        s += N.map(([, x, y], k) => { const [nx, ny] = N[(k + 1) % N.length]; return line(`M${x} ${y}L${nx} ${ny}`, .45 + k * .03, 'fx-ln--faint'); }).join('');
        return `<div class="fx-net"><div class="fx-net__b">${img('tower-holo.webp')}</div><svg class="fx-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${s}${outer.map(([x, y], k) => `<circle class="fx-dot" style="--k:${k}" cx="${x}" cy="${y}" r="7"/>`).join('')}</svg>
          ${N.map(([n, x, y], k) => `<span class="fx-node" style="--k:${k};left:${x / 16}%;top:${y / 9}%">${esc(n)}</span>`).join('')}</div>`;
      } }
  };

  // The sample plan is one SVG file shared by the CheckUp and Draw scenes; it is fetched once and kept.
  let planSVG = null, planReq = null;
  function loadPlan() { if (planSVG || planReq) return planReq; planReq = fetch(ART + 'plan-holo.svg', { credentials: 'same-origin' }).then(r => r.ok ? r.text() : '').then(t => { planSVG = t; return t; }).catch(() => ''); return planReq; }
  function mountPlan(el) {
    const box = el.querySelector('[data-fx-plan]'); if (!box) return;
    const put = t => { if (!t || !box.isConnected) return; box.innerHTML = t.replace(/^<svg\b/, '<svg preserveAspectRatio="xMidYMid meet" aria-hidden="true"'); box.querySelectorAll('.pl-walls rect, .pl-open path, .pl-open line, .pl-egress path').forEach(n => n.setAttribute('pathLength', '1')); box.classList.add('is-ready'); };
    if (planSVG) put(planSVG); else loadPlan().then(put);
  }

  let cur = null;
  function stop() {
    if (!cur) return; const { el, onKey, timer } = cur; cur = null; clearTimeout(timer);
    document.removeEventListener('keydown', onKey, true);
    el.classList.add('is-out'); setTimeout(() => el.remove(), 260);
  }
  function play(section, opts = {}) {
    const sc = SCENES[section]; if (!sc || reduced()) return Promise.resolve(false);
    stop();
    const ms = opts.speed === 'cinematic' ? 4000 : 3000;
    const el = document.createElement('div');
    el.className = `dus-fx dus-fx--${section}${small() ? ' is-small' : ''}`;
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.style.setProperty('--d', ms + 'ms');
    el.innerHTML = `<div class="dus-fx__bg"></div><div class="dus-fx__stage">${sc.build(opts)}</div>
      <div class="dus-fx__title"><span class="dus-fx__num">${sc.num}</span><h2>${esc(sc.title[0])}<em>${esc(sc.title[1])}</em></h2><p class="dus-fx__kicker">${esc(sc.kicker)}</p><p class="dus-fx__text">${esc(sc.text)}</p></div>
      <span class="dus-fx__sr">Opening ${esc(sc.title.join(''))}</span>
      <button type="button" class="dus-fx__skip">Skip</button>`;
    document.body.appendChild(el);
    mountPlan(el);
    const onKey = e => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stop(); } };
    el.addEventListener('pointerdown', stop);
    document.addEventListener('keydown', onKey, true);
    return new Promise(res => {
      const timer = setTimeout(() => { if (cur && cur.el === el) stop(); res(true); }, ms);
      cur = { el, onKey, timer };
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
    });
  }
  // Warm the art when the browser is idle, a scene at a time, unless the device is saving data.
  function preload() {
    if (saveData()) return;
    const q = []; Object.values(SCENES).forEach(s => s.assets.forEach(a => { if (!q.includes(a)) q.push(a); }));
    const next = () => { const a = q.shift(); if (!a) return; if (/\.svg$/.test(a)) { loadPlan(); return idle(next); } const i = new Image(); i.onload = i.onerror = () => idle(next); i.src = ART + (small() && /^(tower|model|studio)/.test(a) ? a.replace(/\.webp$/, '-m.webp') : a); };
    idle(next);
  }
  const idle = f => (window.requestIdleCallback || (g => setTimeout(g, 400)))(f, { timeout: 3000 });
  setTimeout(() => idle(preload), 2500);
  window.DrawUpStudioFX = { play, stop, scenes: Object.keys(SCENES), config: SCENES };
})();
