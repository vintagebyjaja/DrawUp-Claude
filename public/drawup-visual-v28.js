/* DrawUp v28 Visual answers + Watch & Learn videos.
 * When a member asks the AI Team (Teammate, 6th Man, Arch Coach) or the Arch Coach tab something visual ("can you show me
 * what a window detail drawing should look like?"), a "See it" card appears under the answer:
 *  - pictures right away: DrawUp's own library details first (drawn live from their vector geometry), then free-licensed
 *    pictures from Wikimedia Commons with the author and licence shown and linked (fetched by the browser, nothing stored);
 *  - four ways to see it: Sketch, 3D, Construction Detail Drawing and YouTube.
 *    Sketch, 3D and Construction Detail are three views of ONE DrawUp detail geometry (the v25.1 detail model in real
 *    inches, rendered with the v27 Sheet2D / Holo3D views). A matching library detail is used for free; otherwise the
 *    member can have DrawUp draw one through the existing "Draw a detail" route (/api/details/draw, saved private).
 *    YouTube runs /api/visual, which only returns videos YouTube itself confirms are real and public. Each found video is
 *    kept (link, title, channel, thumbnail) in learn_videos and shows in Arch Coach > Learning > Watch & Learn.
 *    DrawUp never hosts a video: the page plays YouTube's own player (youtube-nocookie.com) or opens YouTube.
 * window.DrawUpVisual = { isVisual, topicOf, card, mount, watchShelf, videoCards, bindVideos }
 */
(function () {
  'use strict';
  if (window.DrawUpVisual) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = () => window.DrawUpPortal;
  const C = () => P()?.ctx?.() || {};
  const sb = () => C().client || window.drawupSupabaseClient;
  const toast = (m, bad) => (C().toast ? C().toast(m, bad) : console[bad ? 'warn' : 'log'](m));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const token = async () => (await sb()?.auth.getSession())?.data?.session?.access_token || '';
  const strip = h => { const d = document.createElement('div'); d.innerHTML = String(h || ''); return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
  const DRAW_COST = 15; // the v25.1 "Draw a detail" price (DRAWUP_DETAIL_DRAW_COST)

  /* ------------------------------------------------------------------ is this a visual question? */
  const VISUAL_RE = /\b(show me|let me see|can i see|what (?:does|do|should|would|will) [^?.!]{1,80}\blook(?:s)? like|what [^?.!]{1,40} looks? like|how (?:does|should|do) [^?.!]{1,60} look\b|picture of|image of|photo of|diagram of|sketch (?:of|me|a|an|the)|draw (?:me|a|an|the|out)\b|illustrat\w*|visuali[sz]e|example (?:of|drawing) (?:a|an|the)? ?[^?.!]{0,40}\b(?:detail|section|plan|elevation|drawing))/i;
  const isVisual = t => VISUAL_RE.test(String(t || ''));
  function topicOf(t) {
    let s = String(t || '').replace(/\s+/g, ' ').trim().replace(/[?!.]+$/, '');
    s = s.replace(/^(?:hey|hi|yo|ok|okay|so|teammate|coach|arch coach|6th man|sixth man)[,\s]+/i, '');
    s = s.replace(/^(?:can|could|would|will) you (?:please )?/i, '').replace(/^(?:please )?(?:show|draw|sketch|give) me\s*/i, '').replace(/^(?:a picture|an image|a photo|a diagram|a sketch|an example) of\s*/i, '');
    s = s.replace(/^what (?:a|an|the)?\s*/i, '').replace(/\s*(?:should|would|does|do|will)?\s*looks?\s*like.*$/i, '').replace(/^(?:a|an|the)\s+/i, '');
    s = s.replace(/\b(?:drawing|drawings)\b/gi, '').replace(/\s+/g, ' ').trim();
    return (s || String(t || '')).slice(0, 80);
  }
  const words = t => [...new Set(String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'detail', 'details', 'what', 'look', 'like', 'show', 'should', 'drawing'].includes(w)))];

  /* ------------------------------------------------------------------ pictures: DrawUp library + Wikimedia Commons */
  const picCache = new Map();
  async function libraryDetails(topic) {
    const w = words(topic).slice(0, 4); if (!w.length || !sb()) return [];
    try {
      const { data } = await sb().from('details').select('id,title,category,drawing,detail_code,sheet_ref,source,owner_id,visibility,status')
        .not('drawing', 'is', null).eq('status', 'published').or(w.map(x => `title.ilike.%${x}%`).join(',')).limit(12);
      const score = d => w.filter(x => (d.title + ' ' + (d.category || '')).toLowerCase().includes(x)).length;
      return (data || []).filter(d => d.drawing?.elements?.length >= 3 && score(d) > 0).sort((a, b) => score(b) - score(a)).slice(0, 2);
    } catch (_e) { return []; }
  }
  async function commons(topic, kind) {
    const tries = [topic, topic + (kind === 'detail' || kind === 'section' ? ' construction detail' : ' architecture')];
    for (const q of tries) {
      try {
        const u = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', origin: '*', generator: 'search', gsrnamespace: '6', gsrsearch: q + ' filetype:bitmap|drawing', gsrlimit: '10', prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '640' });
        const r = await fetch(u); if (!r.ok) continue;
        const d = await r.json();
        const pages = Object.values(d?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
        const out = pages.map(p => { const ii = (p.imageinfo || [])[0] || {}, m = ii.extmetadata || {};
          if (!/^image\/(jpeg|png|webp|svg\+xml|gif)$/.test(ii.mime || '') || !ii.thumburl) return null;
          return { kind: 'web', title: strip(m.ObjectName?.value) || String(p.title || '').replace(/^File:/, '').replace(/\.[a-z]+$/i, ''), thumb: ii.thumburl, page: ii.descriptionurl, author: strip(m.Artist?.value).slice(0, 80), license: strip(m.LicenseShortName?.value) || 'See source', licenseUrl: m.LicenseUrl?.value || ii.descriptionurl };
        }).filter(Boolean).slice(0, 3);
        if (out.length) return out;
      } catch (_e) { /* offline or blocked: the card still offers the four views */ }
    }
    return [];
  }
  async function pictures(topic, kind) {
    const k = topic.toLowerCase();
    if (!picCache.has(k)) picCache.set(k, Promise.all([libraryDetails(topic), commons(topic, kind)]).then(([lib, web]) => ({ lib, web })));
    return picCache.get(k);
  }
  const svgOf = (d, id) => { try { return window.DrawUpVDIView.renderSVG(d.drawing, d.drawing.components || [], { id }).svg; } catch (_e) { return ''; } };

  /* ------------------------------------------------------------------ the card */
  const cards = new Map();
  let seq = 0;
  const OPTS = [['sketch', '✎', 'Sketch'], ['3d', '⬢', '3D'], ['cd', '▤', 'Construction Detail Drawing'], ['yt', '▶', 'YouTube']];
  function card(o) {
    const key = o.id || ('q:' + o.question);
    if (cards.has(key)) return cards.get(key).el;
    const topic = (o.topic || topicOf(o.question)).trim();
    const st = { key, n: ++seq, topic, kind: o.kind || 'detail', question: o.question || topic, geom: null, drawing: false, view: '', videos: null, holo: null, sheet: null };
    const el = document.createElement('section');
    el.className = 'du-vis28'; el.setAttribute('aria-label', 'See it: ' + topic);
    el.innerHTML = `<header class="du-vis28-head"><span class="du-vis28-k">SEE IT</span><b>${esc(topic)}</b></header>
      <div class="du-vis28-pics" aria-live="polite"><div class="du-vis28-skel"></div><div class="du-vis28-skel"></div><div class="du-vis28-skel"></div></div>
      <p class="du-vis28-ask">How do you want to see it?</p>
      <div class="du-vis28-opts" role="group" aria-label="Ways to see it">${OPTS.map(([k, i, n]) => `<button type="button" data-vis="${k}" aria-pressed="false"><span aria-hidden="true">${i}</span>${n}</button>`).join('')}</div>
      <div class="du-vis28-view" hidden></div>`;
    st.el = el; cards.set(key, st);
    el.querySelectorAll('[data-vis]').forEach(b => b.onclick = () => show(st, b.dataset.vis));
    fillPictures(st);
    return el;
  }
  async function fillPictures(st) {
    const box = st.el.querySelector('.du-vis28-pics');
    const { lib, web } = await pictures(st.topic, st.kind);
    if (lib[0] && !st.geom) st.geom = { ...lib[0], from: 'library' };
    const figs = [
      ...lib.map((d, i) => `<figure class="du-vis28-fig lib"><button type="button" class="du-vis28-pic" data-lib="${i}" aria-label="Open ${esc(d.title)} as a construction detail">${svgOf(d, 'vl' + st.n + i)}</button><figcaption><b>${esc(d.title)}</b><span class="du-vis28-src">DrawUp library${d.detail_code ? ' · ' + esc(d.detail_code) : ''}</span></figcaption></figure>`),
      ...web.map(p => `<figure class="du-vis28-fig"><a class="du-vis28-pic" href="${esc(p.page)}" target="_blank" rel="noopener"><img src="${esc(p.thumb)}" alt="${esc(p.title)}" loading="lazy" referrerpolicy="no-referrer"></a><figcaption><b>${esc(p.title)}</b><span class="du-vis28-src">Wikimedia Commons${p.author ? ' · ' + esc(p.author) : ''} · <a href="${esc(p.licenseUrl)}" target="_blank" rel="noopener">${esc(p.license)}</a></span></figcaption></figure>`),
    ].slice(0, 4);
    box.innerHTML = figs.length ? figs.join('') : `<p class="du-vis28-none">No picture found for “${esc(st.topic)}” yet. Pick a view below and DrawUp will draw it.</p>`;
    box.querySelectorAll('[data-lib]').forEach(b => b.onclick = () => { st.geom = { ...lib[+b.dataset.lib], from: 'library' }; show(st, 'cd'); });
  }
  function press(st, k) { st.el.querySelectorAll('[data-vis]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.vis === k))); }
  async function show(st, k) {
    st.view = k; press(st, k);
    const v = st.el.querySelector('.du-vis28-view'); v.hidden = false;
    if (k === 'yt') return showVideos(st, v);
    if (!st.geom) return offerDraw(st, v, k);
    renderView(st, v, k);
  }
  function offerDraw(st, v, k) {
    if (st.drawing) { v.innerHTML = drawingHtml(); return; }
    const name = OPTS.find(x => x[0] === k)[2];
    v.innerHTML = `<div class="du-vis28-offer"><p>There is no DrawUp detail for <b>${esc(st.topic)}</b> yet. DrawUp can draw one in its own style: real dimensions, materials and notes. You then get the Sketch, the 3D and the Construction Detail Drawing from the same drawing.</p>
      <button type="button" class="du-btn primary" data-draw>Draw it in DrawUp style · ${DRAW_COST} credits</button><small>Saved privately to your Detail Catalog. It is a DrawUp-generated proposal, not for construction until a licensed professional reviews it.</small></div>`;
    v.querySelector('[data-draw]').onclick = () => drawIt(st, v, k, name);
  }
  const drawingHtml = () => '<div class="du-vis28-wait"><i></i><p>DrawUp is drawing it. This usually takes about a minute; you can keep chatting.</p></div>';
  async function api(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || 'Request failed (' + r.status + ')'), { data: d, status: r.status });
    return d;
  }
  async function drawIt(st, v, k) {
    st.drawing = true; v.innerHTML = drawingHtml();
    try {
      let d = await api('/api/details/draw', { notes: `Draw a typical ${st.topic} as a clear, teachable construction detail. The member asked: ${st.question}`.slice(0, 1900), share: false, file_name: '' });
      const t0 = Date.now();
      const ticket = d.ticket;
      while (d.status === 'running' && Date.now() - t0 < 15 * 60e3) { await sleep(4000); d = await api('/api/details/draw', { poll: ticket }); }
      if (!d.detail?.drawing) throw new Error(d.error || 'The drawing did not come back.');
      st.geom = { ...d.detail, from: 'drawn' };
      st.drawing = false;
      if (st.view !== 'yt') renderView(st, st.el.querySelector('.du-vis28-view'), st.view || k);
    } catch (e) {
      st.drawing = false;
      v.innerHTML = `<p class="du-vis28-err">${esc(e.message || e)}</p>`;
      if (e.status === 402) toast(e.message, true);
    }
  }
  function sourceLine(st) {
    const g = st.geom;
    return g.from === 'library' ? `From the DrawUp library: <b>${esc(g.title)}</b>${g.detail_code ? ' (' + esc(g.detail_code) + ')' : ''}.` : `Drawn by DrawUp for this question and saved privately as <b>${esc(g.detail_code || g.title)}</b>. A DrawUp-generated proposal: confirm sizes with a licensed professional.`;
  }
  function renderView(st, v, k) {
    const g = st.geom, d = g.drawing, comps = d.components || [];
    if (k === 'sketch') {
      v.innerHTML = `<figure class="du-vis28-sketch" aria-label="Hand sketch of ${esc(g.title)}">${svgOf(g, 'vs' + st.n)}</figure><p class="du-vis28-note">${sourceLine(st)} The sketch is the same drawing, loosened up like a trace-paper study.</p>`;
      return;
    }
    if (k === '3d') {
      v.innerHTML = `<div class="du-vis28-3dbar" role="group" aria-label="3D view">${[['real', 'Realistic'], ['holo', 'Hologram'], ['tech', 'Technical']].map(([m, n], i) => `<button type="button" data-m="${m}" aria-pressed="${!i}">${n}</button>`).join('')}<label>Explode <input type="range" min="0" max="1" step="0.05" value="0" data-explode></label></div><canvas class="du-vis28-3d" tabindex="0" aria-label="3D assembly. Drag to rotate, scroll to zoom."></canvas><p class="du-vis28-note">${sourceLine(st)} Built in your browser from the same geometry. Drag to turn it.</p>`;
      const cv = v.querySelector('canvas');
      st.holo = window.DrawUpVDIView.Holo3D(cv, { mode: 'real' });
      requestAnimationFrame(() => st.holo.setModel(d, comps));
      v.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { st.holo.setMode(b.dataset.m); v.querySelectorAll('[data-m]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
      v.querySelector('[data-explode]').oninput = e => st.holo.setExplode(e.target.value);
      return;
    }
    v.innerHTML = `<div class="du-vis28-cd"></div><div class="du-vis28-row"><button type="button" class="du-btn ghost" data-x="svg">SVG</button><button type="button" class="du-btn ghost" data-x="dxf">DXF (AutoCAD)</button><button type="button" class="du-btn ghost" data-open>Open in Details</button></div><p class="du-vis28-note">${sourceLine(st)}</p>`;
    st.sheet = window.DrawUpVDIView.Sheet2D(v.querySelector('.du-vis28-cd'), { drawing: d, components: comps, title: g.title, id: 'vc' + st.n });
    const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const base = String(g.title || 'DrawUp detail').replace(/[^\w .()-]+/g, '').slice(0, 80);
    v.querySelector('[data-x="svg"]').onclick = () => dl(base + '.svg', st.sheet.svg(), 'image/svg+xml');
    v.querySelector('[data-x="dxf"]').onclick = () => dl(base + '.dxf', st.sheet.dxf(), 'application/dxf');
    v.querySelector('[data-open]').onclick = () => { history.replaceState(null, '', '#portal/details?ref=' + encodeURIComponent(g.sheet_ref || g.detail_code || '')); P()?.openPortalTab?.('details'); };
  }

  /* ------------------------------------------------------------------ YouTube */
  const ytCache = new Map();
  async function findVideos(topic, question) {
    const k = topic.toLowerCase();
    if (ytCache.has(k)) return ytCache.get(k);
    const p = (async () => {
      let d = await api('/api/visual', { videos: { topic, q: question } });
      const t0 = Date.now();
      const ticket = d.ticket;
      while (d.status === 'running' && Date.now() - t0 < 6 * 60e3) { await sleep(3000); d = await api('/api/visual', { poll: ticket }); }
      if (!d.videos) throw new Error(d.error || 'No videos came back.');
      return d;
    })();
    ytCache.set(k, p); p.catch(() => ytCache.delete(k));
    return p;
  }
  async function showVideos(st, v) {
    if (!st.videos) v.innerHTML = '<div class="du-vis28-wait"><i></i><p>Finding videos on YouTube…</p></div>';
    try {
      const d = st.videos || await findVideos(st.topic, st.question); st.videos = d;
      if (st.view !== 'yt') return;
      v.innerHTML = `<div class="du-vid28-grid">${videoCards(d.videos)}</div><p class="du-vis28-note">${d.saved !== false ? 'Saved to <a class="du-vis28-link" href="#portal/arch-coach?pb=watch" data-learn>Arch Coach › Learning › Watch &amp; Learn</a>. ' : ''}Videos play from YouTube. DrawUp does not host them.</p>`;
      bindVideos(v);
      v.querySelector('[data-learn]')?.addEventListener('click', openLearn);
    } catch (e) { if (st.view === 'yt') v.innerHTML = `<p class="du-vis28-err">${esc(e.message || e)}</p><p><a class="du-vis28-link" href="https://www.youtube.com/results?search_query=${encodeURIComponent(st.topic)}" target="_blank" rel="noopener">Search YouTube for “${esc(st.topic)}” ↗</a></p>`; }
  }
  function openLearn(e) { e?.preventDefault?.(); history.replaceState(null, '', '#portal/arch-coach?pb=watch'); P()?.openPortalTab?.('arch-coach'); }
  const thumb = v => /^https:\/\/i\.ytimg\.com\//.test(v.thumbnail_url || '') ? v.thumbnail_url : `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`;
  function videoCards(list, o = {}) {
    return (list || []).filter(v => /^[\w-]{11}$/.test(v?.video_id || '')).map(v => `<article class="du-vid28" data-vid="${esc(v.video_id)}">
      <button type="button" class="du-vid28-thumb" data-yt="${esc(v.video_id)}" aria-label="Play ${esc(v.title)}"><img src="${esc(thumb(v))}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="du-vid28-play" aria-hidden="true">▶</span></button>
      <div class="du-vid28-meta"><h4><a href="https://www.youtube.com/watch?v=${esc(v.video_id)}" target="_blank" rel="noopener">${esc(v.title)}</a></h4>
      ${v.channel_title ? `<p class="du-vid28-ch">${v.channel_url ? `<a href="${esc(v.channel_url)}" target="_blank" rel="noopener">${esc(v.channel_title)}</a>` : esc(v.channel_title)}</p>` : ''}
      ${o.topic && v.topic ? `<p class="du-vid28-topic">${esc(v.topic)}</p>` : ''}${o.hide ? `<button type="button" class="du-vid28-hide" data-hide="${esc(v.video_id)}">Hide for everyone</button>` : ''}</div></article>`).join('');
  }
  function bindVideos(root) {
    root.querySelectorAll('[data-yt]').forEach(b => b.onclick = () => {
      const f = document.createElement('iframe');
      f.className = 'du-vid28-frame'; f.title = b.getAttribute('aria-label') || 'YouTube video'; f.loading = 'lazy'; f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.yt)}?rel=0&autoplay=1`;
      b.replaceWith(f);
    });
  }

  /* ------------------------------------------------------------------ Watch & Learn shelves (Arch Coach > Learning) */
  async function watchShelf(box) {
    if (!box || !sb()) return;
    const uid = C().user?.id;
    box.innerHTML = '<p class="pb-muted">Loading videos…</p>';
    const [mine, all, hq] = await Promise.all([
      uid ? sb().from('learn_video_asks').select('video_id,question,topic,created_at,video:learn_videos(video_id,title,channel_title,channel_url,thumbnail_url,url,topic,hidden)').eq('user_id', uid).order('created_at', { ascending: false }).limit(24).then(x => x, () => ({ data: [] })) : { data: [] },
      sb().from('learn_videos').select('video_id,title,channel_title,channel_url,thumbnail_url,url,topic,last_asked_at').eq('hidden', false).order('last_asked_at', { ascending: false }).limit(36).then(x => x, () => ({ data: [], error: { message: 'missing' } })),
      sb().rpc('is_drawup_admin').then(x => !!x.data, () => false),
    ]);
    if (all.error && /learn_videos|relation|schema/i.test(all.error.message || '')) { box.innerHTML = '<p class="pb-muted">Run the v28 SQL in Supabase to collect videos from AI Team questions here.</p>'; return; }
    const my = (mine.data || []).map(r => r.video ? { ...r.video, topic: r.topic || r.video.topic } : null).filter(v => v && !v.hidden);
    const myIds = new Set(my.map(v => v.video_id));
    const rest = (all.data || []).filter(v => !myIds.has(v.video_id));
    const topics = [...new Set([...my, ...rest].map(v => v.topic).filter(Boolean))].slice(0, 12);
    box.innerHTML = `${topics.length ? `<div class="du-vid28-filter" role="group" aria-label="Filter by topic"><button type="button" data-t="" aria-pressed="true">All</button>${topics.map(t => `<button type="button" data-t="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('')}</div>` : ''}
      <section class="du-vid28-shelf"><h3>From your questions</h3>${my.length ? `<div class="du-vid28-grid">${videoCards(my, { topic: true })}</div>` : '<p class="pb-muted">Ask the AI Team or Arch Coach to show you something, then pick YouTube. The videos you get land here.</p>'}</section>
      <section class="du-vid28-shelf"><h3>Found by the AI Team</h3>${rest.length ? `<div class="du-vid28-grid">${videoCards(rest, { topic: true, hide: hq })}</div>` : '<p class="pb-muted">Videos other members found from their questions show here.</p>'}</section>
      <p class="pb-muted">Videos play from YouTube or open on YouTube. DrawUp keeps only the link, title, channel and thumbnail.</p>`;
    bindVideos(box);
    box.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
      box.querySelectorAll('[data-t]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      const t = b.dataset.t; box.querySelectorAll('.du-vid28').forEach(a => { a.hidden = !!t && a.querySelector('.du-vid28-topic')?.textContent !== t; });
    });
    box.querySelectorAll('[data-hide]').forEach(b => b.onclick = async () => {
      const { error } = await sb().from('learn_videos').update({ hidden: true }).eq('video_id', b.dataset.hide);
      if (error) toast(error.message, true); else { b.closest('.du-vid28').remove(); toast('Hidden from Watch & Learn.'); }
    });
  }

  /* ------------------------------------------------------------------ mounting */
  // AI Team: drawup-team-v25.js writes <div class="du-vis28-slot" data-vis-id data-q data-topic data-kind> under a reply and
  // calls mount() after each redraw, so the same card (with its open view) survives streaming redraws.
  function mount(root) {
    (root || document).querySelectorAll('.du-vis28-slot').forEach(s => {
      const el = card({ id: s.dataset.visId, question: s.dataset.q || '', topic: s.dataset.topic || '', kind: s.dataset.kind || '' });
      if (el.parentNode !== s) s.appendChild(el);
    });
  }
  // Arch Coach tab (#dc-messages): a card under each answer to a visual question.
  function coachTab() {
    const box = document.getElementById('dc-messages'); if (!box) return;
    box.querySelectorAll(':scope > article.assistant:not(.du-hof-msg)').forEach((a, i) => {
      if (a.dataset.vis28) return;
      let q = a.previousElementSibling; while (q && !q.matches('article.user')) q = q.previousElementSibling;
      const text = q?.querySelector('p')?.textContent || '';
      const body = a.querySelector('p')?.textContent || '';
      if (!text || !isVisual(text) || body.length < 40) return;
      a.dataset.vis28 = '1';
      a.after(card({ id: 'dc:' + i + ':' + text.slice(0, 80), question: text }));
    });
  }
  let pending = 0;
  new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; coachTab(); }); }).observe(document.documentElement, { childList: true, subtree: true });

  // the trace-paper wobble used by the Sketch view (one shared SVG filter)
  function sketchFilter() {
    if (document.getElementById('du-vis28-defs')) return;
    document.body.insertAdjacentHTML('beforeend', '<svg id="du-vis28-defs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><filter id="du-vis28-rough" x="-2%" y="-2%" width="104%" height="104%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G"/></filter></svg>');
  }
  if (document.body) sketchFilter(); else document.addEventListener('DOMContentLoaded', sketchFilter);

  window.DrawUpVisual = { isVisual, topicOf, card, mount, watchShelf, videoCards, bindVideos };
})();
