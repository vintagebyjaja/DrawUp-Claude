/* DrawUp v28 Hall of Fame legend bios.
 * Picking a legend on the Arch Coach legends artwork (Dashboard) opens a short bio page: who they were, their vision and
 * style, what they are known for and how they chime in. "Choose as my legend" saves them as the member's go-to legend
 * (arch_coach_profiles.legend; the database still checks the XP lock), and that legend can then chime in on AI Team chats.
 * Facts are kept to the public record. Nothing here quotes a legend or speaks for them.
 * window.DrawUpLegendBio = { open(key), close(), BIOS }
 */
(function () {
  'use strict';
  if (window.DrawUpLegendBio) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = () => window.DrawUpPortal;
  const C = () => P()?.ctx?.() || {};
  const sb = () => C().client || window.drawupSupabaseClient;
  const toast = (m, bad) => (C().toast ? C().toast(m, bad) : console[bad ? 'warn' : 'log'](m));
  const ART = '/drawup-studio-v26/arch-coach-legends.webp', ART_W = 1640, ART_H = 959;

  // band = where the portrait sits on the legends artwork (same numbers as drawup-studio-v26.js)
  const BIOS = {
    'paul-r-williams': { years: '1894 – 1980', place: 'Los Angeles', band: [0, 0, 200, 480],
      vision: 'Paul R. Williams believed a building should fit the life of the people in it. He listened closely, then drew fast and well, and he won clients across Southern California at a time when many doors were closed to a Black architect. He became the first Black member of the American Institute of Architects in 1923 and its first Black Fellow in 1957.',
      style: ['Elegance', 'Client empathy', 'Perseverance', 'Period revival to mid-century modern'],
      known: ['About 3,000 buildings over a career of more than 50 years', 'Homes for Hollywood clients and the Beverly Hills Hotel additions', 'Part of the team behind the LAX Theme Building', 'AIA Gold Medal, awarded in 2017'],
      coach: 'Expect questions about the client: who lives or works here, what the arrival feels like, and whether the proportions and details are gracious, not just correct.' },
    'julia-morgan': { years: '1872 – 1957', place: 'San Francisco', band: [200, 0, 392, 480],
      vision: 'Julia Morgan was the first woman admitted to the architecture program at the École des Beaux-Arts in Paris and the first woman licensed as an architect in California. She worked quietly and precisely, designing more than 700 buildings and treating every one, from a small YWCA to a castle, with the same craft.',
      style: ['Craftsmanship', 'Reinforced concrete', 'Client focus', 'Beaux-Arts and Arts & Crafts'],
      known: ['Hearst Castle at San Simeon', 'The bell tower at Mills College, which came through the 1906 earthquake', 'Asilomar conference grounds', 'First woman to receive the AIA Gold Medal (2014)'],
      coach: 'She will push on how it is built: structure, materials, joints and finish, and whether the detail serves the people who use the room.' },
    'frank-lloyd-wright': { years: '1867 – 1959', place: 'Wisconsin and Arizona', band: [392, 0, 612, 480],
      vision: 'Frank Lloyd Wright called his approach organic architecture: a building should grow from its site, its materials and the way people live, so that inside and outside, structure and ornament, read as one whole.',
      style: ['Organic design', 'Harmony with site', 'Open plan', 'Strong horizontals and natural materials'],
      known: ['Fallingwater, built over a waterfall in Pennsylvania', 'The Solomon R. Guggenheim Museum in New York', 'Prairie houses such as the Robie House', 'Usonian houses and Taliesin West'],
      coach: 'He will ask how the design meets the land, the light and the horizon, and whether the plan flows instead of boxing people in.' },
    'zaha-hadid': { years: '1950 – 2016', place: 'London', band: [612, 0, 896, 480],
      vision: 'Zaha Hadid explored architecture as continuous movement. She used painting and, later, digital tools to break the box apart into fluid forms and flowing public space. In 2004 she became the first woman to win the Pritzker Architecture Prize.',
      style: ['Vision', 'Fluidity', 'Innovation', 'Dynamic, sculptural form'],
      known: ['Vitra Fire Station in Germany', 'MAXXI museum in Rome', 'London Aquatics Centre for the 2012 Olympics', 'Heydar Aliyev Center in Baku', 'RIBA Royal Gold Medal (2016)'],
      coach: 'She will push you past the safe option: how space and movement could flow, and what the boldest version of the idea looks like before you edit it back.' },
    'norma-merrick-sklarek': { years: '1926 – 2012', place: 'New York and Los Angeles', band: [896, 0, 1020, 480],
      vision: 'Norma Merrick Sklarek was the first Black woman licensed as an architect in New York and in California, and the first Black woman elected a Fellow of the AIA. She was known for technical mastery and for getting large, complex buildings drawn, coordinated and built.',
      style: ['Technical rigor', 'Project delivery', 'Mentorship', 'Coordinated construction documents'],
      known: ['Project director at Gruen Associates', 'The U.S. Embassy in Tokyo, with César Pelli', 'Terminal One at Los Angeles International Airport', 'Co-founded Siegel Sklarek Diamond, then the largest woman-owned architecture firm in the U.S.'],
      coach: 'She will check whether the drawings can actually be built: coordination, sequencing, what the contractor needs to see and what is still missing from the set.' },
    'ove-arup': { years: '1895 – 1988', place: 'London', band: [1020, 0, 1240, 480],
      vision: 'Ove Arup was an engineer and philosopher who argued for total design: architects, engineers and builders working as one team toward a building that is efficient, humane and beautiful. He founded the firm Arup in 1946.',
      style: ['Total design', 'Integration', 'Humane engineering', 'Structure and architecture as one'],
      known: ['Engineering for the Sydney Opera House', 'The Penguin Pool at London Zoo, with Berthold Lubetkin and Tecton', 'Kingsgate Bridge in Durham', 'Founding the global firm Arup'],
      coach: 'He will look across disciplines: does the structure, the services and the architecture tell one story, and who needs to be in the room to make it work?' },
    'i-m-pei': { years: '1917 – 2019', place: 'New York', band: [1240, 0, 1440, 480],
      vision: 'I. M. Pei worked with pure geometry and light. His buildings use a few strong shapes, carefully proportioned, to make public space that feels both modern and timeless. He received the Pritzker Architecture Prize in 1983.',
      style: ['Geometric clarity', 'Light', 'Modernism', 'Precision in stone, glass and concrete'],
      known: ['The Louvre Pyramid in Paris', 'East Building of the National Gallery of Art in Washington, D.C.', 'Bank of China Tower in Hong Kong', 'Museum of Islamic Art in Doha'],
      coach: 'He will ask what the one strong idea is, whether the geometry is clear, and how daylight moves through the space across the day.' },
    'fazlur-rahman-khan': { years: '1929 – 1982', place: 'Chicago', band: [1440, 0, 1640, 480],
      vision: 'Fazlur Rahman Khan was a Bangladeshi-American structural engineer at Skidmore, Owings & Merrill who rethought the skyscraper. His tube systems let tall buildings use far less steel, and he worked side by side with architects so the structure became the architecture.',
      style: ['Structural efficiency', 'Tube systems', 'Collaboration', 'Expressed structure'],
      known: ['The John Hancock Center in Chicago (trussed tube)', 'Sears Tower, now Willis Tower (bundled tube)', 'The Hajj Terminal at Jeddah airport', 'Decades of work with architect Bruce Graham at SOM'],
      coach: 'He will look for the most efficient structure that also makes the design better, and ask how the load gets to the ground.' },
    'emily-warren-roebling': { years: '1843 – 1903', place: 'Brooklyn',
      vision: 'Emily Warren Roebling carried the day-to-day engineering coordination of the Brooklyn Bridge after her husband, chief engineer Washington Roebling, became ill. She learned the technical work, relayed his instructions and dealt with officials and contractors for years until the bridge opened in 1883.',
      style: ['Persistence', 'Technical fluency', 'Coordination', 'Clear communication'],
      known: ['The Brooklyn Bridge, opened in 1883', 'Among the first to cross the finished bridge', 'Later earned a law certificate from New York University'],
      coach: 'She will focus on coordination and communication: who needs what information, and how to keep a complicated job moving.' },
    'tadao-ando': { years: 'born 1941', place: 'Osaka',
      vision: 'Tadao Ando is a self-taught Japanese architect who works with exposed concrete, light and nature. His spaces are simple and quiet, so a beam of daylight, a view of water or the sound of rain becomes the main event. He received the Pritzker Architecture Prize in 1995.',
      style: ['Concrete', 'Light', 'Simplicity', 'Nature brought inside'],
      known: ['Church of the Light near Osaka', 'Row House in Sumiyoshi', 'Chichu Art Museum on Naoshima', 'Modern Art Museum of Fort Worth'],
      coach: 'He will ask what you can take away, how light enters, and whether the materials are honest.' },
  };

  const S = { legends: null, row: null, xp: 0 };
  async function load() {
    const uid = C().user?.id;
    const [l, r] = await Promise.all([
      S.legends ? { data: S.legends } : sb().from('arch_coach_legends').select('key,name,kind,principles,note,xp_required').order('sort_order').then(x => x, () => ({ data: [] })),
      uid ? sb().from('arch_coach_profiles').select('user_id,legend,xp').eq('user_id', uid).maybeSingle().then(x => x, () => ({ data: null })) : { data: null },
    ]);
    S.legends = l.data || []; S.row = r.data || null; S.xp = S.row?.xp || 0;
  }
  const mono = n => { const i = String(n || '').split(/[\s.]+/).filter(w => /^[A-Z]/.test(w)).map(w => w[0]); return i.length > 1 ? i[0] + i[i.length - 1] : i[0] || ''; };
  // a face-and-name crop of each panel at one shared size (230 x 385 on the 1640 x 959 artwork), so every bio
  // page frames its legend the same way; the studio's narrower click bands would cut some faces in half
  const FACE_X = { 'paul-r-williams': 0, 'julia-morgan': 175, 'frank-lloyd-wright': 378, 'zaha-hadid': 612, 'norma-merrick-sklarek': 850, 'ove-arup': 1040, 'i-m-pei': 1225, 'fazlur-rahman-khan': 1410 };
  function portrait(key, name) {
    const b = key in FACE_X ? [FACE_X[key], 85, FACE_X[key] + 230, 470] : BIOS[key]?.band;
    if (!b) return `<div class="du-lg28-mono" aria-hidden="true">${esc(mono(name))}</div>`;
    // the member-approved legends artwork, cropped to this legend's panel (scaled so the panel fills the frame)
    const w = b[2] - b[0], h = b[3] - b[1];
    return `<div class="du-lg28-pic" style="aspect-ratio:${w}/${h}"><img src="${ART}" alt="" style="width:${(ART_W / w * 100).toFixed(2)}%;left:${(-b[0] / w * 100).toFixed(2)}%;top:${(-b[1] / h * 100).toFixed(2)}%"></div>`;
  }

  let el = null, lastFocus = null;
  function close() { if (!el) return; el.remove(); el = null; document.removeEventListener('keydown', onKey, true); lastFocus?.focus?.(); }
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  async function open(key) {
    lastFocus = document.activeElement;
    close();
    el = document.createElement('div');
    el.className = 'du-lg28'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Hall of Fame legend');
    el.innerHTML = '<div class="du-lg28-card"><p class="du-lg28-loading">Opening the Hall of Fame…</p></div>';
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) close(); });
    document.addEventListener('keydown', onKey, true);
    try { await load(); } catch (_e) { /* shown below */ }
    paint(key);
  }
  function paint(key) {
    if (!el) return;
    const l = (S.legends || []).find(x => x.key === key) || { key, name: key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), kind: 'architect', principles: [], xp_required: 0 };
    const b = BIOS[key] || { vision: l.note || '', style: l.principles || [], known: [], coach: '' };
    const hq = !!C().isAdmin, locked = !hq && S.xp < (l.xp_required || 0), mine = S.row?.legend === key;
    const signed = !!C().user;
    el.innerHTML = `<article class="du-lg28-card">
      <button type="button" class="du-lg28-x" data-close aria-label="Close">×</button>
      <div class="du-lg28-side">${portrait(key, l.name)}</div>
      <div class="du-lg28-main">
        <span class="du-lg28-k">HALL OF FAME · ${esc((l.kind || 'architect').toUpperCase())}${b.years ? ' · ' + esc(b.years) : ''}</span>
        <h2>${esc(l.name)}</h2>
        ${b.place ? `<p class="du-lg28-place">${esc(b.place)}</p>` : ''}
        <h3>Vision</h3><p>${esc(b.vision)}</p>
        <h3>Style</h3><ul class="du-lg28-chips">${(b.style || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        ${(b.known || []).length ? `<h3>Known for</h3><ul class="du-lg28-list">${b.known.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${b.coach ? `<h3>How ${esc(l.name.split(' ').pop())} chimes in</h3><p>${esc(b.coach)}</p>` : ''}
        <p class="du-lg28-fine">DrawUp's interpretation, grounded in ${esc(l.name.split(' ').pop())}'s publicly documented work. Never their own words, and never an endorsement.</p>
        <div class="du-lg28-acts">
          ${mine ? '<span class="du-lg28-on">✓ Your legend</span>' : `<button type="button" class="du-btn primary" data-choose ${locked || !signed ? 'disabled' : ''}>Choose as my legend</button>`}
          ${mine && !locked ? '<button type="button" class="du-btn ghost" data-ask>Ask in the AI Team</button>' : ''}
          ${mine ? '<button type="button" class="du-btn ghost" data-clear>Stop using as my legend</button>' : ''}
          <button type="button" class="du-btn ghost" data-all>All legends</button>
        </div>
        <p class="du-lg28-status" role="status">${!signed ? 'Sign in to choose a legend.' : locked ? `🔒 Unlocks at ${l.xp_required} XP. You have ${S.xp} XP. Asking Arch Coach, uploading and running Checks all earn XP.` : mine ? `${esc(l.name)} can chime in on your AI Team chats. Look for “${esc(l.name)} can chime in” under an answer, or ask by name.` : ''}</p>
      </div></article>`;
    const q = s => el.querySelector(s);
    q('[data-close]').onclick = close;
    q('[data-choose]')?.addEventListener('click', () => choose(key));
    q('[data-clear]')?.addEventListener('click', () => choose(null, key));
    q('[data-ask]')?.addEventListener('click', () => { close(); window.DrawUpTeam?.open?.({ fresh: true, prefill: `${l.name}, what would you do here? ` }); });
    q('[data-all]').onclick = async () => { close(); if (window.DrawUpCoach?.open) await window.DrawUpCoach.open('legend'); };
    (q('[data-choose]:not([disabled])') || q('[data-close]')).focus();
  }
  async function choose(key, back) {
    const uid = C().user?.id; if (!uid) return;
    const btns = el?.querySelectorAll('button') || []; btns.forEach(b => b.disabled = true);
    const r = S.row ? await sb().from('arch_coach_profiles').update({ legend: key }).eq('user_id', uid).select('user_id,legend,xp').maybeSingle()
      : await sb().from('arch_coach_profiles').insert({ user_id: uid, legend: key }).select('user_id,legend,xp').maybeSingle();
    if (r.error) { toast('Could not save your legend: ' + r.error.message, true); paint(key || back); return; }
    S.row = r.data || { ...(S.row || {}), legend: key };
    toast(key ? 'Saved. Your legend can now chime in on AI Team chats.' : 'Legend removed.');
    window.DrawUpCoach?.reload?.();
    window.dispatchEvent(new CustomEvent('drawup:legend', { detail: { key } }));
    paint(key || back);
  }

  window.DrawUpLegendBio = { open, close, BIOS };
})();
