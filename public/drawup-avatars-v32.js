/* DrawUp v32 avatar maker: members build their own Arch Coach, Teammate and 6th Man as 3D characters (AUREVIA
 * character kit v4) and a face shot of each becomes its picture across DrawUp (Arch Coach chat and card, the dashboard,
 * the AI Team). The 3D viewer (drawup-avatar-v32/maker.js, about 650 KB, plus one 6 MB model) loads only when the maker
 * is opened; everywhere else only the saved face shot (a small image) is shown.
 * Saved in public.member_avatars (migration 0079). Until that migration is run, choices are kept on this device.
 *   window.DrawUpAvatars = { open(role), face(role), faceImg(role, cls), load(force), ROLES }
 */
(function () {
  'use strict';
  if (window.DrawUpAvatars) return;
  const V = '32.0', MAKER = '/drawup-avatar-v32/maker.js?v=' + V + '.1';
  const ROLES = { coach: 'Arch Coach', teammate: 'Teammate', sixth_man: '6th Man' };
  const BLURB = { coach: 'Your head coach: codes, details and reviews.', teammate: 'Your design partner who brainstorms and builds with you.', sixth_man: 'The game changer who comes off the bench with another play.' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = () => window.DrawUpPortal, Cx = () => P()?.ctx?.() || {};
  const sb = () => Cx().client || window.drawupSupabaseClient;
  const uid = () => Cx().user?.id || null;
  const toast = (m, bad) => (Cx().toast ? Cx().toast(m, bad) : console[bad ? 'warn' : 'log'](m));

  // ------------------------------------------------------------------ choices offered in the maker
  const SKINS = ['#f6d7c3', '#efc6a8', '#e0b093', '#cf9a76', '#b8805d', '#a26f4d', '#8c5a3b', '#7a4a30', '#5f3b27', '#47291b'];
  const HAIRC = ['#141110', '#3a2418', '#5a3c2a', '#7a4a2a', '#a8703f', '#c9a063', '#e2c68f', '#bdb8b0', '#e6e1d8', '#7a2533', '#258FF5', '#FF8D72'];
  const EYES = ['#3b2a1e', '#5a3a22', '#7a5a2a', '#3f6b3a', '#3a6a8f', '#6b6f78'];
  const CLOTH = ['#142337', '#258FF5', '#DCEBFF', '#FFB28F', '#FF8D72', '#FFF5EF', '#f4f1ea', '#17171b', '#3d4552', '#6d2a3a', '#2f4a3d', '#c9a24a'];
  const HAIRS = [['none', 'None'], ['buzzed', 'Buzzed'], ['buzzedF', 'Short'], ['parted', 'Parted'], ['long', 'Long'], ['buns', 'Buns'], ['ponytail', 'Ponytail'], ['puff', 'Puff'],
    ['afro', 'Afro'], ['taperedAfro', 'Tapered afro'], ['locs', 'Locs'], ['longLocs', 'Long locs'], ['braids', 'Braids'], ['cornrows', 'Cornrows']];
  const BODIES = [['slim', 'Slim'], ['athletic', 'Athletic'], ['balanced', 'Balanced'], ['curvy', 'Curvy'], ['fuller', 'Fuller'], ['muscular', 'Muscular'], ['broader', 'Broader']];
  const TOPS = [['tee', 'Tee'], ['polo', 'Polo'], ['longsleeve', 'Long sleeve'], ['sweater', 'Sweater'], ['hoodie', 'Hoodie'], ['vest', 'Vest'], ['tank', 'Tank'], ['crop', 'Crop']];
  const JACKETS = [['none', 'No jacket'], ['varsity', 'Varsity']];
  const BOTTOMS = [['jeans', 'Jeans'], ['trousers', 'Trousers'], ['cargo', 'Cargo'], ['joggers', 'Joggers'], ['shorts', 'Shorts'], ['basketball', 'Basketball'], ['skirt', 'Skirt'], ['leggings', 'Leggings']];
  const SHOES = [['sneakers', 'Sneakers'], ['boots', 'Boots'], ['formal', 'Formal'], ['none', 'Barefoot']];
  const ACCS = [['glasses', 'Glasses'], ['hoops', 'Hoops'], ['necklace', 'Necklace'], ['watch', 'Watch'], ['hat', 'Cap'], ['beanie', 'Beanie'], ['scarf', 'Scarf'], ['bag', 'Bag']];
  const START = {
    coach: { who: 'female', skin: '#7a4a30', hair: 'locs', hairColor: '#141110', top: 'sweater', topColor: '#142337', topTrim: '#FFB28F', accessories: ['glasses', 'hoops'], jewelry: 'gold', bottom: 'trousers', bottomColor: '#3d4552', shoes: 'formal', shoeColor: '#17171b' },
    teammate: { who: 'male', skin: '#a26f4d', hair: 'taperedAfro', hairColor: '#141110', top: 'hoodie', topColor: '#258FF5', topTrim: '#DCEBFF', bottom: 'joggers', bottomColor: '#142337', shoes: 'sneakers', shoeColor: '#f4f1ea', shoeAccent: '#FF8D72' },
    sixth_man: { who: 'male', skin: '#5f3b27', hair: 'cornrows', hairColor: '#141110', beard: true, top: 'tank', topColor: '#FF8D72', topTrim: '#142337', bottom: 'basketball', bottomColor: '#FF8D72', bottomTrim: '#142337', shoes: 'sneakers', shoeColor: '#142337', shoeAccent: '#FFB28F', accessories: ['watch'] },
  };

  // ------------------------------------------------------------------ saved avatars
  const S = { rows: {}, loaded: null, local: false, uid: null };
  const LS = () => 'du-avatars-v32:' + (uid() || 'guest');
  const readLocal = () => { try { return JSON.parse(localStorage.getItem(LS()) || '{}') || {}; } catch (_e) { return {}; } };
  const writeLocal = rows => { try { localStorage.setItem(LS(), JSON.stringify(rows)); return true; } catch (_e) { return false; } };
  function changed() { document.dispatchEvent(new CustomEvent('du-avatars-changed')); try { window.DrawUpCoach?.reload?.(); } catch (_e) {} }
  async function load(force) {
    if (S.loaded && !force && S.uid === uid()) return S.loaded;
    S.uid = uid();
    return (S.loaded = (async () => {
      const rows = {}; const id = uid();
      if (id && sb()) {
        const r = await Promise.resolve(sb().from('member_avatars').select('role,look,face,updated_at').eq('user_id', id)).catch(e => ({ error: e }));
        if (r && !r.error) { (r.data || []).forEach(x => { rows[x.role] = x; }); S.local = false; } else S.local = true;
      } else S.local = true;
      const loc = readLocal(); Object.keys(ROLES).forEach(k => { if (!rows[k] && loc[k]) rows[k] = loc[k]; });
      S.rows = rows; changed(); return rows;
    })());
  }
  async function save(role, look, face) {
    const row = { role, look, face, updated_at: new Date().toISOString() };
    S.rows[role] = row; const id = uid(); let remote = false;
    if (id && sb() && !S.local) {
      const r = await Promise.resolve(sb().from('member_avatars').upsert({ user_id: id, ...row }, { onConflict: 'user_id,role' })).catch(e => ({ error: e }));
      remote = !!(r && !r.error); if (!remote) S.local = true;
    }
    if (!remote) { const loc = readLocal(); loc[role] = row; writeLocal(loc); }
    changed(); return remote;
  }
  const face = role => S.rows[role]?.face || '';
  const faceImg = (role, cls) => { const f = face(role); return f ? `<img class="du-face du-member-face ${esc(cls || '')}" src="${f}" alt="" width="256" height="256">` : ''; };

  // ------------------------------------------------------------------ the maker
  let makerLoad = null;
  function loadMaker() {
    if (window.DrawUpAvatarMaker) return Promise.resolve(window.DrawUpAvatarMaker);
    return makerLoad ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = MAKER; s.onload = () => res(window.DrawUpAvatarMaker); s.onerror = () => { makerLoad = null; rej(new Error('The avatar maker did not load.')); }; document.head.appendChild(s); });
  }
  const M = { el: null, view: null, role: 'coach', look: null, last: null, busy: false };
  const sw = (group, list, cur, label) => `<div class="du-av-sw" role="radiogroup" aria-label="${esc(label)}">${list.map(c => `<button type="button" role="radio" aria-checked="${c === cur}" data-k="${group}" data-v="${c}" style="--c:${c}" title="${c}"><span class="du-sr">${c}</span></button>`).join('')}</div>`;
  const chips = (group, list, cur, label) => `<div class="du-av-chips" role="radiogroup" aria-label="${esc(label)}">${list.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === cur}" data-k="${group}" data-v="${v}">${esc(l)}</button>`).join('')}</div>`;
  function panel() {
    const l = M.look, acc = l.accessories || [];
    return `<section><h3>Body</h3>${chips('who', [['female', 'Woman'], ['male', 'Man']], l.who, 'Body')}${chips('body', BODIES, l.body || 'balanced', 'Body type')}</section>
      <section><h3>Skin</h3>${sw('skin', SKINS, l.skin, 'Skin tone')}<h3>Eyes</h3>${sw('eyes', EYES, l.eyes, 'Eye colour')}</section>
      <section><h3>Hair</h3>${chips('hair', HAIRS, l.hair, 'Hair style')}${sw('hairColor', HAIRC, l.hairColor, 'Hair colour')}
        ${l.who === 'male' ? `<label class="du-av-chk"><input type="checkbox" data-k="beard" ${l.beard ? 'checked' : ''}> Beard</label>` : ''}</section>
      <section><h3>Top</h3>${chips('top', TOPS, l.top, 'Top')}${sw('topColor', CLOTH, l.topColor, 'Top colour')}
        <h3>Jacket</h3>${chips('jacket', JACKETS, l.jacket || 'none', 'Jacket')}${l.jacket && l.jacket !== 'none' ? sw('jacketColor', CLOTH, l.jacketColor, 'Jacket colour') : ''}</section>
      <section><h3>Bottoms</h3>${chips('bottom', BOTTOMS, l.bottom, 'Bottoms')}${sw('bottomColor', CLOTH, l.bottomColor, 'Bottoms colour')}
        <h3>Shoes</h3>${chips('shoes', SHOES, l.shoes, 'Shoes')}${l.shoes !== 'none' ? sw('shoeColor', CLOTH, l.shoeColor, 'Shoe colour') : ''}</section>
      <section><h3>Accessories</h3><div class="du-av-chips">${ACCS.map(([v, t]) => `<button type="button" aria-pressed="${acc.includes(v)}" data-acc="${v}">${esc(t)}</button>`).join('')}</div></section>`;
  }
  function paintPanel() { const p = M.el?.querySelector('.du-av-opts'); if (p) { const y = p.scrollTop; p.innerHTML = panel(); p.scrollTop = y; } }
  function paintTabs() {
    M.el.querySelectorAll('[data-role]').forEach(b => { const on = b.dataset.role === M.role; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; const f = face(b.dataset.role); b.querySelector('i').innerHTML = f ? `<img src="${f}" alt="">` : ''; });
    M.el.querySelector('.du-av-blurb').textContent = BLURB[M.role];
    M.el.querySelector('[data-save]').textContent = `Save ${ROLES[M.role]}`;
  }
  const status = (t, bad) => { const s = M.el?.querySelector('.du-av-status'); if (s) { s.textContent = t || ''; s.classList.toggle('bad', !!bad); } };
  function pickRole(role) {
    M.role = role; const base = window.DrawUpAvatarMaker?.DEFAULT_LOOK || {};
    M.look = JSON.parse(JSON.stringify({ ...base, ...START[role], ...(S.rows[role]?.look || {}) }));
    M.last = JSON.stringify(M.look); paintTabs(); paintPanel(); M.view?.set(M.look); status('');
  }
  function close() { if (!M.el) return; M.view?.dispose(); M.view = null; M.el.remove(); M.el = null; document.removeEventListener('keydown', onKey, true); M.prevFocus?.focus?.(); }
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  async function open(role) {
    if (M.el) close();
    M.prevFocus = document.activeElement; M.role = ROLES[role] ? role : 'coach';
    const el = M.el = document.createElement('div'); el.className = 'du-av'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'du-av-h');
    el.innerHTML = `<div class="du-av-card">
      <header class="du-av-head"><div><span class="du-av-k">AVATAR MAKER</span><h2 id="du-av-h">Create your AI team</h2><p class="du-av-blurb"></p></div>
        <button type="button" class="du-av-x" data-close aria-label="Close">×</button></header>
      <div class="du-av-tabs" role="tablist" aria-label="Who you are creating">${Object.entries(ROLES).map(([k, n]) => `<button type="button" role="tab" data-role="${k}"><i aria-hidden="true"></i>${esc(n)}</button>`).join('')}</div>
      <div class="du-av-body">
        <div class="du-av-stagewrap"><div class="du-av-stage" aria-label="3D preview. Drag to turn, scroll to zoom."><p class="du-av-loading">Loading the 3D avatar…</p></div>
          <div class="du-av-views"><button type="button" data-view="body">Full body</button><button type="button" data-view="face">Face</button><button type="button" data-turn="-0.5">Rotate left</button><button type="button" data-turn="0.5">Rotate right</button></div>
          <p class="du-av-hint">Drag to rotate · scroll or pinch to zoom</p></div>
        <div class="du-av-opts"></div>
      </div>
      <footer class="du-av-foot"><p class="du-av-status" role="status"></p><button type="button" class="du-btn ghost" data-close>Cancel</button><button type="button" class="du-btn primary" data-save>Save</button></footer></div>`;
    document.body.appendChild(el); document.addEventListener('keydown', onKey, true);
    el.addEventListener('click', onClick); el.addEventListener('change', onChange);
    el.addEventListener('mousedown', e => { if (e.target === el) close(); });
    el.querySelector('.du-av-tabs').addEventListener('keydown', e => { if (!/Arrow(Left|Right)/.test(e.key)) return; const ks = Object.keys(ROLES), i = ks.indexOf(M.role), n = ks[(i + (e.key === 'ArrowRight' ? 1 : ks.length - 1)) % ks.length]; pickRole(n); el.querySelector(`[data-role="${n}"]`).focus(); });
    try { await load(); } catch (_e) {}
    let mk = null; try { mk = await loadMaker(); } catch (e) { status(e.message, true); }
    if (!M.el) return;
    pickRole(M.role);
    el.querySelector('[data-role][aria-selected="true"]')?.focus();
    if (!mk) return;
    try { const stage = el.querySelector('.du-av-stage'); M.view = await mk.mount(stage, M.look); stage.querySelector('.du-av-loading')?.remove(); if (!M.el) M.view.dispose(); }
    catch (e) { status('The 3D preview could not start on this device. ' + (e.message || ''), true); }
  }
  function onClick(e) {
    const b = e.target.closest('button'); if (!b || !M.el) return;
    if (b.matches('[data-close]')) return close();
    if (b.dataset.role) return pickRole(b.dataset.role);
    if (b.dataset.view) return M.view?.view(b.dataset.view);
    if (b.dataset.turn) return M.view?.turn(+b.dataset.turn);
    if (b.matches('[data-save]')) return doSave(b);
    if (b.dataset.acc) { const a = new Set(M.look.accessories || []); a.has(b.dataset.acc) ? a.delete(b.dataset.acc) : a.add(b.dataset.acc); M.look.accessories = [...a]; return apply(); }
    if (b.dataset.k) { const k = b.dataset.k, v = b.dataset.v; M.look[k] = v; if (k === 'topColor') M.look.topTrim = M.look.topTrim || v; if (k === 'who' && v === 'female') M.look.beard = false; return apply(k === 'who' || k === 'jacket' || k === 'shoes'); }
  }
  function onChange(e) { const i = e.target; if (i.dataset.k === 'beard') { M.look.beard = i.checked; apply(); } }
  function apply(repaint) { M.view?.set(M.look); if (repaint) paintPanel(); else paintPanel(); }
  async function doSave(btn) {
    if (M.busy) return; M.busy = true; btn.disabled = true; status('Taking the face shot…');
    try {
      const mk = await loadMaker(); const shot = await mk.faceShot(M.look);
      const look = JSON.parse(JSON.stringify(M.look)); delete look.topPrint; delete look.jacketPrint;
      const remote = await save(M.role, look, shot); M.last = JSON.stringify(M.look); paintTabs();
      status(`${ROLES[M.role]} saved. The face shot is now its picture${remote ? '' : ' on this device'}.`);
      toast(`${ROLES[M.role]} avatar saved.`);
    } catch (e) { status('Could not save: ' + (e.message || e), true); }
    finally { M.busy = false; btn.disabled = false; }
  }

  // ------------------------------------------------------------------ entry points: "3D avatar" buttons next to the coach card and the AI Team picker
  function addButtons() {
    document.querySelectorAll('.ac-pcard .ac-pact:not([data-av32])').forEach(p => { p.dataset.av32 = '1'; const b = document.createElement('button'); b.type = 'button'; b.className = 'du-btn ghost'; b.textContent = '3D avatar maker'; b.onclick = () => open('coach'); p.appendChild(b); });
    document.querySelectorAll('.du-tm25-who:not([data-av32])').forEach(p => { p.dataset.av32 = '1'; const b = document.createElement('button'); b.type = 'button'; b.className = 'du-av-teambtn'; b.textContent = 'Avatars'; b.title = 'Create your Teammate, 6th Man and Arch Coach avatars'; b.onclick = () => open(document.querySelector('.du-tm25-who [aria-checked="true"]')?.dataset.pickas || 'teammate'); p.insertAdjacentElement('afterend', b); });
  }
  let q = false; new MutationObserver(() => { if (q) return; q = true; requestAnimationFrame(() => { q = false; addButtons(); }); }).observe(document.documentElement, { childList: true, subtree: true });
  let lastUid;
  setInterval(() => { const u = uid(); if (u !== lastUid) { lastUid = u; load(true).catch(() => {}); } }, 1500);

  window.DrawUpAvatars = { open, close, face, faceImg, load, ROLES, version: V };
})();
