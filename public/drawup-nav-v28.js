/* DrawUp v28: header and search helpers.
 * 1. Tap the top header (any empty spot on it, or the Season 1 tip-off bar) to go back to the top. A round ↑ button
 *    also appears after scrolling down a few screens. Works on the public site (the page scrolls) and in the Portal
 *    (#du-portal is its own scroll box, so the iPhone status-bar tap cannot reach it).
 * 2. One search everywhere: pressing Enter or "Search DrawUp" in any Discover search box runs the same DrawUp search
 *    as the header's search, with the Discover tab as the type (Projects, Firms, People). Typing still filters the
 *    Discover list as before. Signed in, the results open in the Portal's DrawUp Search tab; signed out, in the public
 *    search, exactly as the header search does.
 * window.DrawUpSearch = { run(q, kind) }
 */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ back to top */
  const portalOpen = () => { const p = $('#du-portal'); return !!p && getComputedStyle(p).display !== 'none' && p.offsetHeight > 0; };
  const scroller = () => (portalOpen() ? $('#du-portal') : null);
  const scrollTopNow = () => { const s = scroller(); return s ? s.scrollTop : (window.scrollY || document.documentElement.scrollTop || 0); };
  function toTop() {
    const s = scroller(), behavior = reduce() ? 'auto' : 'smooth';
    if (s) s.scrollTo({ top: 0, behavior }); else window.scrollTo({ top: 0, behavior });
  }
  // a tap on the header itself, not on one of its links, buttons or fields
  const INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="button"],[role="menu"],[role="region"],.dus-mega,.dus-sheet,[contenteditable]';
  document.addEventListener('click', e => {
    const bar = e.target.closest?.('#dus-pubnav, #dus-pnav, .dus-nav, .tipoff-strip');
    if (!bar || e.target.closest(INTERACTIVE)) return;
    if (scrollTopNow() > 4) toTop();
  });

  let btn = null;
  function mountButton() {
    if (btn) return;
    btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'du-top28'; btn.setAttribute('aria-label', 'Back to top'); btn.title = 'Back to top';
    btn.innerHTML = '<span aria-hidden="true">↑</span>';
    btn.addEventListener('click', () => { toTop(); btn.blur(); });
    document.body.appendChild(btn);
  }
  let ticking = false;
  function update() {
    ticking = false; if (!btn) return;
    const on = scrollTopNow() > window.innerHeight * 1.5;
    if (on !== btn.classList.contains('on')) { btn.classList.toggle('on', on); btn.tabIndex = on ? 0 : -1; btn.setAttribute('aria-hidden', on ? 'false' : 'true'); }
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('scroll', onScroll, { passive: true, capture: true }); // also catches #du-portal scrolling
  window.addEventListener('hashchange', () => setTimeout(update, 50));

  // older browsers get a fixed header (drawup-nav-v28.css); the page needs the tip-off bar's height
  function measureTip() {
    const t = $('.tipoff-strip'); if (t) document.documentElement.style.setProperty('--du-tip28-h', t.offsetHeight + 'px');
  }
  window.addEventListener('resize', measureTip);

  /* ------------------------------------------------------------------ one DrawUp search */
  const P = () => window.DrawUpPortal;
  async function run(q, kind) {
    q = String(q || '').trim(); if (!q) return false;
    kind = ['projects', 'firms', 'person'].includes(kind) ? kind : 'all';
    if (P()?.isSignedIn?.()) {
      // the Portal's DrawUp Search tab (drawup-v19): set the type, fill the box, search
      await P().openPortalTab('search');
      let form = null;
      for (let i = 0; i < 40 && !(form = $('#du-v19-search')); i++) await sleep(100);
      if (form) {
        const k = kind === 'person' ? 'all' : kind;
        form.parentElement?.querySelector(`[data-kind="${k}"]`)?.click() || $(`#du-workspace-content [data-kind="${k}"]`)?.click();
        const qi = $('#du-v19-q'); if (qi) qi.value = q;
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
        return true;
      }
      return !!P().search?.(q);
    }
    if (window.DrawUpV19?.publicSearch) { const inp = $('#drawup-search-input'); if (inp) inp.value = q; return window.DrawUpV19.publicSearch(q, kind === 'all' ? 'all' : kind); }
    return false;
  }
  window.DrawUpSearch = { run };

  // Discover's search boxes, with the type each one searches
  const BOXES = [['#du-proj-q', 'projects'], ['#du-firm-q', 'firms'], ['#people-search', 'person'], ['#university-search', 'all']];
  function wireDiscover() {
    BOXES.forEach(([sel, kind]) => {
      document.querySelectorAll(sel).forEach(input => {
        if (input.dataset.du28) return; input.dataset.du28 = '1';
        input.setAttribute('enterkeyhint', 'search');
        input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && input.value.trim()) { e.preventDefault(); run(input.value, kind); } });
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'du-srch28'; b.textContent = 'Search DrawUp →';
        b.setAttribute('aria-label', 'Search DrawUp for this');
        b.addEventListener('click', () => { if (input.value.trim()) run(input.value, kind); else input.focus(); });
        input.insertAdjacentElement('afterend', b);
      });
    });
  }

  function boot() {
    mountButton(); measureTip(); wireDiscover(); update();
    // Discover is shown on the public page and copied into the Portal's Discover tab, so check again when pages change
    let queued = false;
    new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; wireDiscover(); }); } }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
