/* DrawUp Portfolio Review (Season 1). Portal tab #portal/portfolio, under Discover.
 *  1 Upload a portfolio PDF. The original is kept untouched in student-portfolios/<uid>/<review id>/.
 *  2 Every page is rendered with pdf.js as a selectable thumbnail; the selected pages (up to 40) are rendered
 *    again as pictures to drawup-private/<uid>/portfolio/<review id>/ so the AI reviews what the pages look like.
 *  3 The member picks the goal (internship, architecture school, employment, graduate school, general critique).
 *  4-5 /api/portfolio runs the review in the background: six category scores with explanations, strengths and
 *    prioritized improvements, every point labelled factual or subjective, notes boxed on each page.
 *  6 Pick a page and ask Arch Coach about it (answers are kept on the review).
 *  7 Layout references and a conceptual layout preview per page, drawn as wireframes with the page's own content.
 *  8 Export a PDF report with the pages, numbered annotations and recommendations (pdf-lib, in the browser).
 * Rows live in portfolio_reviews (SQL 0073). window.DrawUpPortfolio.open({ id?, file? }) opens it from anywhere.
 */
(function () {
  'use strict';
  if (window.DrawUpPortfolio) return;
  const PDFJS = '/vendor/pdfjs-3.11.174/pdf.min.js', PDFJS_WORKER = '/vendor/pdfjs-3.11.174/pdf.worker.min.js', PDFLIB = '/vendor/pdf-lib-1.17.1.min.js';
  const ORIGINALS = 'student-portfolios', PRIVATE = 'drawup-private';
  const MAX_BYTES = 50 * 1024 * 1024, MAX_PAGES = 40, PAGE_PX = 1400, THUMB_PX = 220, POLL_MS = 5000;
  const GOALS = [
    ['internship', 'Internship', 'Office-ready skills, drawings and a quick read.'],
    ['architecture_school', 'Architecture school', 'Creativity, process and range.'],
    ['employment', 'Employment', 'Professional work and your role on teams.'],
    ['graduate_school', 'Graduate school', 'Design thinking, research and rigor.'],
    ['general', 'General critique', 'A balanced look at everything.'],
  ];
  const GOAL_NAME = Object.fromEntries(GOALS.map(g => [g[0], g[1]]));
  const DISCIPLINES = [['architecture', 'Architecture'], ['interior_design', 'Interior design'], ['landscape', 'Landscape architecture'], ['urban_design', 'Urban design'], ['other', 'Other design field']];
  const CATS = { presentation: 'Presentation quality', storytelling: 'Storytelling', technical_drawings: 'Technical drawing clarity', graphics: 'Graphics', descriptions: 'Project descriptions', organization: 'Overall organization' };
  /* Layout references, drawn as wireframes on a 300 × 200 spread. k: img | draw | text | title. */
  const LAYOUTS = {
    project_opener: { name: 'Project opener', text: 'A full page that names the project, its site and its one-line idea before any drawings.', slots: [['hero', 0, 0, 190, 200, 'img'], ['title', 205, 20, 85, 30, 'title'], ['idea', 205, 60, 85, 60, 'text'], ['facts', 205, 140, 85, 40, 'text']] },
    hero_with_caption: { name: 'Hero with caption', text: 'One strong image carries the page; a short caption column explains it.', slots: [['hero', 0, 0, 220, 200, 'img'], ['caption', 232, 120, 60, 70, 'text']] },
    drawing_led_sheet: { name: 'Drawing-led sheet', text: 'Plans and sections at a readable size with a scale bar, north arrow and labels, like a presentation board.', slots: [['plan', 10, 10, 170, 150, 'draw'], ['section', 190, 10, 100, 70, 'draw'], ['labels', 190, 90, 100, 70, 'text'], ['scale + north', 10, 168, 170, 22, 'text']] },
    process_grid: { name: 'Process grid', text: 'A grid of sketches, models and iterations in order, each with a few words.', slots: [['step 1', 10, 10, 85, 80, 'img'], ['step 2', 107, 10, 85, 80, 'img'], ['step 3', 204, 10, 85, 80, 'img'], ['step 4', 10, 105, 85, 80, 'img'], ['step 5', 107, 105, 85, 80, 'img'], ['notes', 204, 105, 85, 80, 'text']] },
    diptych: { name: 'Diptych', text: 'Two related views side by side (before and after, plan and photo, day and night).', slots: [['left', 10, 20, 135, 140, 'img'], ['right', 155, 20, 135, 140, 'img'], ['caption', 10, 170, 280, 20, 'text']] },
    sequence_strip: { name: 'Sequence strip', text: 'A row of views read left to right, like walking through the building.', slots: [['view 1', 10, 50, 66, 90, 'img'], ['view 2', 82, 50, 66, 90, 'img'], ['view 3', 154, 50, 66, 90, 'img'], ['view 4', 226, 50, 66, 90, 'img'], ['caption', 10, 150, 282, 22, 'text'], ['title', 10, 14, 160, 22, 'title']] },
    detail_callout: { name: 'Detail callout', text: 'A larger drawing with one or two enlarged details called out and keyed.', slots: [['drawing', 10, 10, 180, 180, 'draw'], ['detail A', 205, 10, 85, 85, 'draw'], ['detail B', 205, 105, 85, 60, 'draw'], ['key', 205, 172, 85, 18, 'text']] },
    text_and_image_columns: { name: 'Text and image columns', text: 'A narrow text column beside images, so reading and looking happen together.', slots: [['text', 10, 10, 80, 180, 'text'], ['image 1', 100, 10, 190, 110, 'img'], ['image 2', 100, 130, 92, 60, 'img'], ['image 3', 198, 130, 92, 60, 'img']] },
    contents_index: { name: 'Contents index', text: 'Projects listed with thumbnails, year and type, so a reviewer can jump in.', slots: [['title', 10, 10, 120, 24, 'title'], ['project 1', 10, 50, 135, 40, 'text'], ['project 2', 10, 98, 135, 40, 'text'], ['project 3', 10, 146, 135, 40, 'text'], ['thumbs', 160, 50, 130, 136, 'img']] },
    resume_page: { name: 'Resume page', text: 'Education, experience, skills and contact on one clean page.', slots: [['name + contact', 10, 10, 280, 30, 'title'], ['education', 10, 52, 135, 60, 'text'], ['experience', 10, 120, 135, 70, 'text'], ['skills', 155, 52, 135, 60, 'text'], ['awards / links', 155, 120, 135, 70, 'text']] },
  };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const $q = (w, s) => w.querySelector(s), $$ = (w, s) => [...w.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const uuid = () => (crypto.randomUUID && crypto.randomUUID()) || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); });
  const fmt = d => { try { return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (_e) { return ''; } };
  const pagesTxt = a => (a && a.length ? (a.length === 1 ? 'p. ' : 'pp. ') + a.join(', ') : '');
  const safeName = n => String(n || 'portfolio.pdf').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'portfolio.pdf';
  const md = s => esc(s).split(/\n{2,}/).map(p => /^\s*-\s/m.test(p) ? '<ul>' + p.split('\n').filter(l => l.trim()).map(l => '<li>' + l.replace(/^\s*-\s*/, '') + '</li>').join('') + '</ul>' : '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const loaded = {};
  function loadScript(src) { if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { loaded[src] = null; rej(new Error('The PDF tools could not load. Check your connection and try again.')); }; document.head.appendChild(s); }); return loaded[src]; }
  async function pdfjs() { if (!window.pdfjsLib) await loadScript(PDFJS); window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return window.pdfjsLib; }
  async function pdflib() { if (!window.PDFLib) await loadScript(PDFLIB); return window.PDFLib; }
  const P = () => window.DrawUpPortal;

  let ctx = null, pending = null, pollTimer = 0, config = null;
  const S = { file: null, doc: null, count: 0, selected: new Set(), goal: 'internship', discipline: 'architecture', title: '', project: '' };

  async function api(body) {
    const token = await ctx.token();
    const r = await fetch('/api/portfolio', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Portfolio Review could not be reached (' + r.status + ').'); e.status = r.status; e.final = j.final; throw e; }
    return j;
  }
  async function loadConfig() { if (config) return config; try { const r = await fetch('/api/portfolio', { cache: 'no-store' }); config = r.ok ? await r.json() : null; } catch (_e) { config = null; } return config || { cost: 30, ask_cost: 1, max_pages: MAX_PAGES, ready: true }; }
  const hashId = () => { const m = /[?&]id=([0-9a-f-]{36})/i.exec(location.hash || ''); return m ? m[1] : null; };
  const setHash = id => history.replaceState(null, '', '#portal/portfolio' + (id ? '?id=' + id : ''));

  /* ====================================================================== entry */
  async function render(w, c) {
    ctx = c; clearTimeout(pollTimer);
    const p = pending; pending = null;
    if (p && p.file) { resetDraft(); return home(w, p.file); }
    const id = (p && p.id) || hashId();
    if (id) return detail(w, id);
    return home(w);
  }
  function resetDraft() { S.file = null; S.doc = null; S.count = 0; S.selected = new Set(); S.title = ''; S.project = ''; }
  async function open(opts) {
    pending = opts || {};
    if (!P() || !P().isSignedIn || !P().isSignedIn()) { const b = document.getElementById('drawup-signin'); if (b) b.click(); return false; }
    setHash(pending.id || null);
    P().openPortalTab('portfolio');
    return true;
  }

  /* ====================================================================== home: new review + your reviews */
  async function home(w, file) {
    const cfg = await loadConfig();
    w.innerHTML = `<div class="dpr">
      <div class="du-work-head"><div><span class="du-kicker">Discover · Portfolio Review</span><h1>Portfolio Review</h1><p>Upload your portfolio as a PDF. Arch Coach looks at every page you pick, scores it for your goal, and shows what is working and what to fix first.</p></div></div>
      <section class="dpr-card" id="dpr-new" aria-label="New portfolio review">
        <div class="dpr-step"><span>1</span><div><h2>Upload your portfolio</h2><p>PDF only, up to 50 MB. Your original file is kept exactly as you uploaded it.</p></div></div>
        <label class="dpr-drop" id="dpr-drop"><input type="file" accept="application/pdf,.pdf" id="dpr-file"><strong>Choose a PDF or drop it here</strong><span id="dpr-file-name">No file chosen</span></label>
        <div id="dpr-draft"></div>
      </section>
      <section class="dpr-card" aria-label="Your portfolio reviews"><div class="dpr-row"><h2>Your reviews</h2></div><div id="dpr-list" class="dpr-list"><p class="dpr-muted">Loading…</p></div></section>
      <p class="dpr-fine">Reviews are advisory and educational. Admissions and hiring decisions stay with each school or firm. Arch Coach only comments on what is on your pages and never adds projects, awards or experience you did not show.</p>
    </div>`;
    const input = $q(w, '#dpr-file'), drop = $q(w, '#dpr-drop');
    input.onchange = () => input.files[0] && choose(w, input.files[0], cfg);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('is-over'); };
    drop.ondragleave = () => drop.classList.remove('is-over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('is-over'); const f = e.dataTransfer.files[0]; if (f) choose(w, f, cfg); };
    listReviews(w);
    if (file) choose(w, file, cfg);
  }

  async function listReviews(w) {
    const box = $q(w, '#dpr-list'); if (!box) return;
    const { data, error } = await ctx.client.from('portfolio_reviews').select('id,title,file_name,goal,discipline,status,feedback,created_at,page_count,project_thread_id').eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(30);
    if (error) { box.innerHTML = `<p class="dpr-warn">${/column|goal|schema/i.test(error.message) ? 'Run the Portfolio Review SQL (portfolio-01) in Supabase to save reviews.' : esc(error.message)}</p>`; return; }
    if (!data.length) { box.innerHTML = '<p class="dpr-muted">No reviews yet. Your first one shows up here.</p>'; return; }
    box.innerHTML = data.map(r => {
      const sc = r.status === 'complete' && r.feedback ? r.feedback.overall_score : null;
      return `<button type="button" class="dpr-item" data-open="${esc(r.id)}"><span class="dpr-score-s${sc == null ? ' is-empty' : ''}">${sc == null ? '…' : sc}</span><span><b>${esc(r.title || r.file_name)}</b><small>${esc(GOAL_NAME[r.goal] || 'General critique')} · ${esc(statusLabel(r.status))} · ${esc(fmt(r.created_at))}</small></span><span class="dpr-go" aria-hidden="true">›</span></button>`;
    }).join('');
    $$(box, '[data-open]').forEach(b => b.onclick = () => { setHash(b.dataset.open); detail(w, b.dataset.open); });
  }
  const statusLabel = s => ({ submitted: 'Not started', reviewing: 'Reviewing', complete: 'Done', failed: 'Did not finish' }[s] || s);

  async function choose(w, file, cfg) {
    const box = $q(w, '#dpr-draft'), name = $q(w, '#dpr-file-name');
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) { name.textContent = 'Please choose a PDF file.'; return; }
    if (file.size > MAX_BYTES) { name.textContent = 'That PDF is over 50 MB. Export a smaller copy (for example at 150 dpi) and try again.'; return; }
    resetDraft(); S.file = file; S.title = file.name.replace(/\.pdf$/i, '');
    name.textContent = file.name + ' · ' + (file.size / 1048576).toFixed(1) + ' MB';
    box.innerHTML = '<div class="dpr-step"><span>2</span><div><h2>Pick the pages to review</h2><p id="dpr-render-note">Rendering your pages…</p></div></div><div class="dpr-thumbs" id="dpr-thumbs"></div><div id="dpr-form"></div>';
    try {
      const L = await pdfjs();
      S.doc = await L.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    } catch (e) { $q(w, '#dpr-render-note').textContent = 'This PDF could not be opened. It may be password protected or damaged. ' + (e.message || ''); return; }
    S.count = S.doc.numPages;
    for (let i = 1; i <= Math.min(S.count, MAX_PAGES); i++) S.selected.add(i);
    const grid = $q(w, '#dpr-thumbs');
    grid.innerHTML = Array.from({ length: S.count }, (_, i) => `<button type="button" class="dpr-thumb" data-p="${i + 1}" aria-pressed="${S.selected.has(i + 1)}"><canvas width="10" height="14"></canvas><span>${i + 1}</span></button>`).join('');
    grid.onclick = e => { const b = e.target.closest('.dpr-thumb'); if (!b) return; const n = +b.dataset.p; if (S.selected.has(n)) S.selected.delete(n); else if (S.selected.size < MAX_PAGES) S.selected.add(n); b.setAttribute('aria-pressed', S.selected.has(n)); form(w, cfg); };
    form(w, cfg);
    for (let i = 1; i <= S.count; i++) {
      if (S.file !== file) return;
      try { const page = await S.doc.getPage(i); const v = page.getViewport({ scale: 1 }); const k = THUMB_PX / Math.max(v.width, v.height); const vp = page.getViewport({ scale: k }); const cv = grid.querySelector(`[data-p="${i}"] canvas`); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height); await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; } catch (_e) { /* a page that will not render keeps its blank tile */ }
    }
    const note = $q(w, '#dpr-render-note'); if (note) note.textContent = `${S.count} page${S.count === 1 ? '' : 's'}. Tap a page to leave it out or add it back.${S.count > MAX_PAGES ? ` Up to ${MAX_PAGES} pages are reviewed at once.` : ''}`;
  }

  async function form(w, cfg) {
    const box = $q(w, '#dpr-form'); if (!box) return;
    if (!box.dataset.built) {
      box.dataset.built = '1';
      let projects = [];
      try { const { data } = await ctx.client.from('project_threads').select('id,project_name').eq('owner_id', ctx.user.id).order('updated_at', { ascending: false }).limit(60); projects = data || []; } catch (_e) { /* projects are optional */ }
      box.innerHTML = `<div class="dpr-tools"><button type="button" class="dpr-link" data-all>Select all</button><button type="button" class="dpr-link" data-none>Clear</button><span id="dpr-count"></span></div>
        <div class="dpr-step"><span>3</span><div><h2>What is this portfolio for?</h2><p>Arch Coach changes what it looks for to match your goal.</p></div></div>
        <div class="dpr-goals" role="radiogroup" aria-label="Portfolio goal">${GOALS.map(g => `<button type="button" role="radio" class="dpr-goal" data-goal="${g[0]}" aria-checked="${S.goal === g[0]}"><b>${g[1]}</b><small>${g[2]}</small></button>`).join('')}</div>
        <div class="dpr-fields"><label>Title<input id="dpr-title" maxlength="120" value="${esc(S.title)}"></label><label>Field<select id="dpr-disc">${DISCIPLINES.map(d => `<option value="${d[0]}"${S.discipline === d[0] ? ' selected' : ''}>${d[1]}</option>`).join('')}</select></label>
        <label>Project <small>optional</small><select id="dpr-proj"><option value="">Not part of a project</option>${projects.map(p => `<option value="${esc(p.id)}">${esc(p.project_name)}</option>`).join('')}</select></label></div>
        <div class="dpr-start"><button type="button" class="dpr-btn" id="dpr-start">Start review</button><span id="dpr-cost">${cfg.cost} credits per review · DrawUp HQ accounts are free. Nothing is charged if the review does not finish.</span></div>
        <div id="dpr-progress" class="dpr-progress" hidden><i></i><span></span></div>`;
      $q(box, '[data-all]').onclick = () => { S.selected = new Set(Array.from({ length: Math.min(S.count, MAX_PAGES) }, (_, i) => i + 1)); $$(w, '.dpr-thumb').forEach(b => b.setAttribute('aria-pressed', S.selected.has(+b.dataset.p))); form(w, cfg); };
      $q(box, '[data-none]').onclick = () => { S.selected.clear(); $$(w, '.dpr-thumb').forEach(b => b.setAttribute('aria-pressed', 'false')); form(w, cfg); };
      $$(box, '.dpr-goal').forEach(b => b.onclick = () => { S.goal = b.dataset.goal; $$(box, '.dpr-goal').forEach(x => x.setAttribute('aria-checked', x === b)); });
      $q(box, '#dpr-start').onclick = () => startReview(w);
    }
    const n = S.selected.size;
    $q(box, '#dpr-count').textContent = `${n} of ${S.count} page${S.count === 1 ? '' : 's'} selected`;
    $q(box, '#dpr-start').disabled = !n;
  }

  function progress(w, frac, text) { const p = $q(w, '#dpr-progress'); if (!p) return; p.hidden = false; p.querySelector('i').style.width = Math.round(frac * 100) + '%'; p.querySelector('span').textContent = text; }

  async function renderPage(n, px) {
    const page = await S.doc.getPage(n); const v = page.getViewport({ scale: 1 }); const k = px / Math.max(v.width, v.height); const vp = page.getViewport({ scale: k });
    const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.84));
    let text = '';
    try { const tc = await page.getTextContent(); text = tc.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim().slice(0, 4000); } catch (_e) { /* pages without text */ }
    return { blob, w: cv.width, h: cv.height, text };
  }

  async function startReview(w) {
    const btn = $q(w, '#dpr-start'); if (btn.disabled) return;
    const pages = [...S.selected].sort((a, b) => a - b);
    if (!pages.length) return;
    btn.disabled = true;
    S.title = ($q(w, '#dpr-title').value || '').trim() || S.file.name; S.discipline = $q(w, '#dpr-disc').value; S.project = $q(w, '#dpr-proj').value;
    const id = uuid(), uid = ctx.user.id, st = ctx.client.storage;
    try {
      progress(w, 0.02, 'Saving your original PDF…');
      const orig = `${uid}/${id}/${safeName(S.file.name)}`;
      const up = await st.from(ORIGINALS).upload(orig, S.file, { contentType: 'application/pdf', upsert: false });
      if (up.error) throw new Error(/size|large|413/i.test(up.error.message) ? 'That PDF is larger than the upload limit. Run the Portfolio Review SQL in Supabase (it raises the limit to 50 MB) or upload a smaller copy.' : 'The PDF could not be saved: ' + up.error.message);
      const list = [], text = [];
      for (let i = 0; i < pages.length; i++) {
        progress(w, 0.05 + 0.8 * (i / pages.length), `Preparing page ${pages[i]} (${i + 1} of ${pages.length})…`);
        const r = await renderPage(pages[i], PAGE_PX);
        const path = `${uid}/portfolio/${id}/p${String(pages[i]).padStart(3, '0')}.jpg`;
        const u = await st.from(PRIVATE).upload(path, r.blob, { contentType: 'image/jpeg', upsert: true });
        if (u.error) throw new Error('A page picture could not be saved: ' + u.error.message);
        list.push({ n: pages[i], path, w: r.w, h: r.h }); if (r.text) text.push({ page: pages[i], text: r.text });
      }
      progress(w, 0.88, 'Saving the review…');
      const row = { id, user_id: uid, status: 'submitted', discipline: S.discipline, goal: S.goal, title: S.title.slice(0, 120), file_path: orig, file_name: S.file.name, file_size_bytes: S.file.size, page_count: S.count, pages: list, project_thread_id: S.project || null };
      const ins = await ctx.client.from('portfolio_reviews').insert(row);
      if (ins.error) throw new Error(/column|goal|pages|check constraint|schema/i.test(ins.error.message) ? 'Run the Portfolio Review SQL (portfolio-01) in Supabase first.' : 'The review could not be saved: ' + ins.error.message);
      progress(w, 0.94, 'Sending to Arch Coach…');
      try { await api({ start: id, text_layer: text }); }
      catch (e) { setHash(id); await detail(w, id, e.message); return; }
      resetDraft(); setHash(id); detail(w, id);
    } catch (e) {
      progress(w, 0, e.message || String(e)); $q(w, '#dpr-progress').classList.add('is-bad'); btn.disabled = false;
    }
  }

  /* ====================================================================== one review */
  async function loadRow(id) {
    const { data, error } = await ctx.client.from('portfolio_reviews').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(/column|schema/i.test(error.message) ? 'Run the Portfolio Review SQL (portfolio-01) in Supabase.' : error.message);
    return data;
  }
  async function signedPages(row) {
    const paths = (row.pages || []).map(p => p.path);
    if (!paths.length) return {};
    const { data } = await ctx.client.storage.from(PRIVATE).createSignedUrls(paths, 3600);
    const out = {}; (data || []).forEach((d, i) => { if (d && d.signedUrl) out[row.pages[i].n] = d.signedUrl; });
    return out;
  }

  async function detail(w, id, startError) {
    clearTimeout(pollTimer);
    let row;
    try { row = await loadRow(id); } catch (e) { w.innerHTML = `<div class="dpr"><section class="dpr-card"><h2>This review could not load</h2><p>${esc(e.message)}</p><button class="dpr-btn" data-back>Back to Portfolio Review</button></section></div>`; $q(w, '[data-back]').onclick = () => { setHash(null); home(w); }; return; }
    if (!row) { setHash(null); return home(w); }
    const head = `<div class="du-work-head"><div><span class="du-kicker">Discover · Portfolio Review</span><h1>${esc(row.title || row.file_name)}</h1><p>${esc(GOAL_NAME[row.goal] || 'General critique')} · ${esc((DISCIPLINES.find(d => d[0] === row.discipline) || [, 'Architecture'])[1])} · ${(row.pages || []).length} of ${row.page_count || (row.pages || []).length} pages · ${esc(fmt(row.created_at))}</p></div><button type="button" class="dpr-btn dpr-btn--ghost" data-back>All reviews</button></div>`;
    if (row.status !== 'reviewing' && row.status !== 'complete') {
      const msg = startError || row.error || (row.status === 'submitted' ? 'This review has not started yet.' : 'The review did not finish.');
      w.innerHTML = `<div class="dpr">${head}<section class="dpr-card"><h2>${row.status === 'failed' ? 'The review did not finish' : 'Ready to review'}</h2><p>${esc(msg)}</p><div class="dpr-start"><button class="dpr-btn" data-run>${row.status === 'failed' ? 'Try again' : 'Start review'}</button><button class="dpr-btn dpr-btn--ghost" data-del>Delete</button></div></section></div>`;
      $q(w, '[data-run]').onclick = async e => { e.target.disabled = true; try { await api({ start: id }); } catch (er) { return detail(w, id, er.message); } detail(w, id); };
      bindCommon(w, row); return;
    }
    if (row.status === 'reviewing') {
      const t0 = new Date(row.started_at || row.created_at).getTime();
      w.innerHTML = `<div class="dpr">${head}<section class="dpr-card dpr-wait"><div class="dpr-spin" aria-hidden="true"></div><div><h2>Arch Coach is reviewing ${(row.pages || []).length} pages</h2><p id="dpr-wait-t">This usually takes 2 to 6 minutes. You can leave this page; the review keeps going and is saved here.</p></div></section></div>`;
      bindCommon(w, row);
      const tick = async () => {
        if (!w.isConnected || hashId() !== id) return;
        let j = null; try { j = await api({ poll: id }); } catch (_e) { /* try again next tick */ }
        if (j && j.status && j.status !== 'reviewing') return detail(w, id);
        const el = $q(w, '#dpr-wait-t'); if (el) el.textContent = `Running for ${Math.max(1, Math.round((Date.now() - t0) / 60000))} min. This usually takes 2 to 6 minutes. You can leave this page; the review keeps going and is saved here.`;
        pollTimer = setTimeout(tick, POLL_MS);
      };
      pollTimer = setTimeout(tick, 1500); return;
    }
    return results(w, row, head);
  }

  function bindCommon(w, row) {
    const back = $q(w, '[data-back]'); if (back) back.onclick = () => { clearTimeout(pollTimer); setHash(null); home(w); };
    const del = $q(w, '[data-del]'); if (del) del.onclick = () => removeReview(w, row);
  }
  async function removeReview(w, row) {
    if (!confirm('Delete this review? Your scores, notes and questions for it are removed. This cannot be undone.')) return;
    const st = ctx.client.storage;
    await st.from(PRIVATE).remove((row.pages || []).map(p => p.path)).catch(() => {});
    if (row.file_path) await st.from(ORIGINALS).remove([row.file_path]).catch(() => {});
    const { error } = await ctx.client.from('portfolio_reviews').delete().eq('id', row.id);
    if (error) { ctx.toast('The review could not be deleted: ' + error.message, true); return; }
    ctx.toast('Review deleted.'); setHash(null); home(w);
  }

  /* ---------------------------------------------------------------------- results */
  const kindTag = k => `<span class="dpr-kind dpr-kind--${k}">${k === 'factual' ? 'Factual' : 'Subjective'}</span>`;
  const prioTag = p => `<span class="dpr-prio dpr-prio--${p}">${p === 'high' ? 'Fix first' : p === 'medium' ? 'Next' : 'Polish'}</span>`;
  const pageChips = a => (a || []).map(n => `<button type="button" class="dpr-pchip" data-dpr-page="${n}">p. ${n}</button>`).join('');
  function ring(score) { const r = 44, c = 2 * Math.PI * r, f = Math.max(0, Math.min(100, score)) / 100; return `<svg viewBox="0 0 110 110" class="dpr-ring" role="img" aria-label="Overall score ${score} out of 100"><circle cx="55" cy="55" r="${r}" class="dpr-ring__bg"/><circle cx="55" cy="55" r="${r}" class="dpr-ring__fg" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 55 55)"/><text x="55" y="60" text-anchor="middle">${score}</text><text x="55" y="78" text-anchor="middle" class="dpr-ring__of">of 100</text></svg>`; }
  function wireframe(key, slots, opts) {
    const L = LAYOUTS[key]; if (!L) return '';
    const given = slots || [];
    const label = s => { const m = given.find(g => String(g.slot || '').toLowerCase().startsWith(s.split(' ')[0])); return m ? m.content : ''; };
    return `<svg viewBox="0 0 300 200" class="dpr-wire${opts && opts.small ? ' dpr-wire--s' : ''}" role="img" aria-label="${esc(L.name)} layout"><rect x="0.5" y="0.5" width="299" height="199" rx="4" class="dpr-wire__page"/>${L.slots.map(([s, x, y, ww, hh, k]) => {
      const t = label(s);
      return `<g class="dpr-wire__${k}"><rect x="${x + 2}" y="${y + 2}" width="${ww - 4}" height="${hh - 4}" rx="3"/>${k === 'img' ? `<path d="M${x + 2} ${y + hh - 2}L${x + ww * 0.45} ${y + hh * 0.5}L${x + ww * 0.65} ${y + hh * 0.7}L${x + ww * 0.8} ${y + hh * 0.55}L${x + ww - 2} ${y + hh - 2}" />` : ''}<foreignObject x="${x + 5}" y="${y + 4}" width="${ww - 10}" height="${hh - 8}"><div xmlns="http://www.w3.org/1999/xhtml" class="dpr-wire__t"><b>${esc(s)}</b>${t ? ' ' + esc(t) : ''}</div></foreignObject></g>`;
    }).join('')}</svg>`;
  }

  async function results(w, row, head) {
    const fb = row.feedback || {}; const cfg = await loadConfig();
    const urls = await signedPages(row);
    const pages = fb.pages || [];
    let cur = (pages[0] || {}).page || (row.pages[0] || {}).n;
    const imp = fb.improvements || [];
    const projectsSel = await ctx.client.from('project_threads').select('id,project_name').eq('owner_id', ctx.user.id).order('updated_at', { ascending: false }).limit(60).then(r => r.data || [], () => []);
    w.innerHTML = `<div class="dpr">${head}
      <section class="dpr-card dpr-sum">
        ${ring(fb.overall_score || 0)}
        <div><h2>Summary</h2><p>${esc(fb.summary)}</p><h3>For ${esc((GOAL_NAME[row.goal] || 'General critique').toLowerCase())}</h3><p>${esc(fb.goal_fit)}</p></div>
        <div class="dpr-side"><button type="button" class="dpr-btn" data-export>Export PDF report</button>
          <label class="dpr-mini">Project<select data-link><option value="">Not part of a project</option>${projectsSel.map(p => `<option value="${esc(p.id)}"${row.project_thread_id === p.id ? ' selected' : ''}>${esc(p.project_name)}</option>`).join('')}</select></label>
          <button type="button" class="dpr-link" data-del>Delete review</button></div>
      </section>
      <section class="dpr-card"><h2>Scores by category</h2><div class="dpr-cats">${(fb.categories || []).map(c => `<article class="dpr-cat"><div class="dpr-cat__top"><b>${esc(c.label || CATS[c.key])}</b><span>${c.score}<small>/10</small></span></div><div class="dpr-bar"><i style="width:${c.score * 10}%"></i></div><p>${esc(c.explanation)}</p><div>${pageChips(c.pages)}</div></article>`).join('')}</div></section>
      <div class="dpr-two">
        <section class="dpr-card"><h2>Strengths</h2><ul class="dpr-strengths">${(fb.strengths || []).map(s => `<li><span>${esc(s.text)}</span> ${pageChips(s.pages)}</li>`).join('') || '<li class="dpr-muted">None listed.</li>'}</ul></section>
        <section class="dpr-card"><h2>How to read this review</h2><p>${kindTag('factual')} points can be checked on the page, like a typo, text too small to read, or a plan without a scale bar.</p><p>${kindTag('subjective')} points are design and presentation judgement. Treat them as a reviewer's opinion, not a rule.</p>${fb.limitations ? `<p class="dpr-muted"><b>Not judged:</b> ${esc(fb.limitations)}</p>` : ''}</section>
      </div>
      <section class="dpr-card"><h2>Improvements, most important first</h2><ol class="dpr-imps">${imp.map(i => `<li><div class="dpr-imp__top">${prioTag(i.priority)}${kindTag(i.kind)}<small>${esc(CATS[i.category] || '')}</small></div><b>${esc(i.title)}</b><p>${esc(i.detail)}</p>${i.how ? `<p class="dpr-how"><b>How:</b> ${esc(i.how)}</p>` : ''}<div>${pageChips(i.pages)}</div></li>`).join('')}</ol></section>
      <section class="dpr-card" id="dpr-pages"><h2>Page by page</h2><p class="dpr-muted">Pick a page to see its notes, a layout idea and to ask Arch Coach about it.</p>
        <div class="dpr-strip" role="tablist" aria-label="Reviewed pages">${row.pages.map(p => `<button type="button" role="tab" class="dpr-sthumb" data-sel="${p.n}" aria-selected="${p.n === cur}">${urls[p.n] ? `<img src="${esc(urls[p.n])}" alt="Page ${p.n}" loading="lazy">` : ''}<span>${p.n}${((pages.find(x => x.page === p.n) || {}).notes || []).length ? ' · ' + pages.find(x => x.page === p.n).notes.length + ' note' + (pages.find(x => x.page === p.n).notes.length === 1 ? '' : 's') : ''}</span></button>`).join('')}</div>
        <div id="dpr-page"></div></section>
      ${(fb.layout_references || []).length ? `<section class="dpr-card"><h2>Layout references</h2><p class="dpr-muted">Common portfolio layouts that would help this portfolio. They are starting points, not templates to copy.</p><div class="dpr-refs">${fb.layout_references.map(l => `<article class="dpr-ref">${wireframe(l.pattern, [], { small: true })}<b>${esc((LAYOUTS[l.pattern] || {}).name || l.pattern)}</b><p>${esc(l.why)}</p><div>${pageChips(l.pages)}</div></article>`).join('')}</div></section>` : ''}
      ${(fb.projects_found || []).length ? `<section class="dpr-card"><h2>Projects Arch Coach found</h2><p class="dpr-muted">Only titles printed on your pages are listed. "Read from the page picture" means the PDF had no text for it, so check the spelling.</p><ul class="dpr-projects">${fb.projects_found.map(p => `<li><b>${esc(p.title)}</b> ${pageChips(p.pages)} ${p.printed ? '' : '<small>Read from the page picture</small>'}</li>`).join('')}</ul></section>` : ''}
      <p class="dpr-fine">Reviewed ${esc(fmt(fb.reviewed_at || row.completed_at))}. Your original PDF is unchanged. Reviews are advisory and educational; admissions and hiring decisions stay with each school or firm.</p>
    </div>`;
    bindCommon(w, row);
    const showPage = n => {
      cur = n; $$(w, '.dpr-sthumb').forEach(b => b.setAttribute('aria-selected', +b.dataset.sel === n));
      const pg = pages.find(x => x.page === n) || { page: n, notes: [], layout: { pattern: 'keep', slots: [] } };
      const meta = row.pages.find(p => p.n === n) || {};
      const qs = (row.questions || []).filter(q => q.page === n);
      const lay = pg.layout || {};
      $q(w, '#dpr-page').innerHTML = `<div class="dpr-pv">
        <div class="dpr-pv__img"><div class="dpr-pv__frame" style="aspect-ratio:${meta.w || 4}/${meta.h || 3}">${urls[n] ? `<img src="${esc(urls[n])}" alt="Page ${n} of your portfolio">` : '<p>Picture unavailable.</p>'}${pg.notes.map((x, i) => x.box ? `<span class="dpr-pin dpr-pin--${x.kind}" style="left:${x.box.x * 100}%;top:${x.box.y * 100}%;width:${x.box.w * 100}%;height:${x.box.h * 100}%"><i>${i + 1}</i></span>` : '').join('')}</div></div>
        <div class="dpr-pv__notes"><h3>Page ${n}${pg.project ? ' · ' + esc(pg.project) : ''} <small>${esc(pg.role || '')}</small></h3>
          ${pg.notes.length ? `<ol class="dpr-notes">${pg.notes.map(x => `<li>${kindTag(x.kind)} ${esc(x.text)}</li>`).join('')}</ol>` : '<p class="dpr-muted">No notes on this page.</p>'}
          ${lay.pattern && lay.pattern !== 'keep' && LAYOUTS[lay.pattern] ? `<div class="dpr-concept"><h4>Concept preview: ${esc(LAYOUTS[lay.pattern].name)}</h4>${wireframe(lay.pattern, lay.slots)}<p>${esc(lay.why || LAYOUTS[lay.pattern].text)}</p><small>A conceptual arrangement of this page's own content. It is not a redesign.</small></div>` : lay.pattern === 'keep' ? '<p class="dpr-muted">The layout of this page works; no change suggested.</p>' : ''}
          <div class="dpr-ask"><h4>Ask Arch Coach about page ${n}</h4><div class="dpr-qa">${qs.map(q => `<div class="dpr-q"><b>You</b><p>${esc(q.question)}</p></div><div class="dpr-a"><b>Arch Coach</b>${md(q.answer)}</div>`).join('')}</div>
            <form class="dpr-askf"><textarea rows="2" maxlength="1500" placeholder="For example: is the section on this page readable at this size?"></textarea><button class="dpr-btn" type="submit">Ask · ${cfg.ask_cost} credit${cfg.ask_cost === 1 ? '' : 's'}</button></form><p class="dpr-ask-st" aria-live="polite"></p></div>
        </div></div>`;
      const f = $q(w, '.dpr-askf');
      f.onsubmit = async e => {
        e.preventDefault(); const ta = f.querySelector('textarea'), q = ta.value.trim(), st = $q(w, '.dpr-ask-st'), b = f.querySelector('button');
        if (q.length < 3) { st.textContent = 'Type a question first.'; return; }
        b.disabled = true; st.textContent = 'Arch Coach is looking at page ' + n + '…';
        try {
          const s = await api({ ask: row.id, page: n, question: q });
          let done = null;
          for (let i = 0; i < 90 && !done; i++) { await sleep(3000); try { const j = await api({ poll_ask: s.ticket }); if (j.status === 'done') done = j.answer; } catch (er) { if (er.final) throw er; } }
          if (!done) throw new Error('Arch Coach is taking longer than usual. Open this review again in a minute.');
          if (!(row.questions || []).some(x => x.id === done.id)) row.questions = [...(row.questions || []), done]; ta.value = ''; st.textContent = ''; showPage(n);
        } catch (er) { st.textContent = er.message; b.disabled = false; }
      };
    };
    $q(w, '.dpr').addEventListener('click', e => {
      const c = e.target.closest('[data-dpr-page],[data-sel]'); if (!c) return;
      const n = +(c.dataset.dprPage || c.dataset.sel); if (!row.pages.some(p => p.n === n)) return;
      showPage(n); if (c.dataset.dprPage) $q(w, '#dpr-pages').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    showPage(cur);
    $q(w, '[data-link]').onchange = async e => { try { await api({ link: row.id, project_thread_id: e.target.value || null }); row.project_thread_id = e.target.value || null; ctx.toast(e.target.value ? 'Filed under the project.' : 'Removed from the project.'); } catch (er) { ctx.toast(er.message, true); } };
    $q(w, '[data-export]').onclick = async e => { const b = e.target; b.disabled = true; const t = b.textContent; b.textContent = 'Building the PDF…'; try { await exportPdf(row, urls); } catch (er) { ctx.toast('The PDF could not be made: ' + (er.message || er), true); } b.disabled = false; b.textContent = t; };
  }

  /* ====================================================================== PDF report */
  const win = t => String(t == null ? '' : t).replace(/[′‘’]/g, "'").replace(/[″“”]/g, '"').replace(/[‐‑‒–—]/g, '-').replace(/…/g, '...').replace(/•/g, '-').replace(/×/g, 'x').replace(/[^\x20-\x7e\xa0-\xff]/g, '');
  async function exportPdf(row, urls) {
    const { PDFDocument, StandardFonts, rgb } = await pdflib();
    const fb = row.feedback || {};
    const doc = await PDFDocument.create();
    doc.setTitle(win(`Portfolio Review - ${row.title || row.file_name}`)); doc.setProducer('DrawUp'); doc.setCreator('DrawUp Portfolio Review');
    const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const W = 612, H = 792, M = 48, ink = rgb(0.08, 0.13, 0.22), grey = rgb(0.36, 0.41, 0.5), royal = rgb(0.16, 0.33, 0.63), line = rgb(0.86, 0.89, 0.93);
    const kc = { factual: rgb(0.78, 0.25, 0.18), subjective: rgb(0.16, 0.33, 0.63) };
    let page, y;
    const newPage = () => { page = doc.addPage([W, H]); y = H - M; page.drawText(win('DrawUp Portfolio Review'), { x: M, y: 24, size: 8, font, color: grey }); page.drawText(win(row.title || row.file_name).slice(0, 80), { x: W - M - font.widthOfTextAtSize(win(row.title || row.file_name).slice(0, 80), 8), y: 24, size: 8, font, color: grey }); };
    const need = h => { if (y - h < M) newPage(); };
    const wrap = (s, f, size, maxW) => { const out = []; String(s == null ? '' : s).split('\n').forEach(par => { let cur = ''; win(par).split(/\s+/).forEach(word => { const t = cur ? cur + ' ' + word : word; if (f.widthOfTextAtSize(t, size) > maxW && cur) { out.push(cur); cur = word; } else cur = t; }); out.push(cur); }); return out; };
    const text = (s, o = {}) => { const f = o.bold ? bold : font, size = o.size || 10, x = o.x || M, maxW = o.w || W - M - x, lh = size * 1.35; for (const l of wrap(s, f, size, maxW)) { need(lh); page.drawText(l, { x, y: y - size, size, font: f, color: o.color || ink }); y -= lh; } y -= o.after == null ? 4 : o.after; };
    const h2 = s => { need(40); y -= 8; text(s, { bold: true, size: 14, color: royal, after: 6 }); };
    newPage();
    text('PORTFOLIO REVIEW', { bold: true, size: 9, color: royal, after: 2 });
    text(row.title || row.file_name, { bold: true, size: 22, after: 4 });
    text(`${GOAL_NAME[row.goal] || 'General critique'} - ${(DISCIPLINES.find(d => d[0] === row.discipline) || [, ''])[1]} - ${(row.pages || []).length} of ${row.page_count || (row.pages || []).length} pages reviewed - ${fmt(fb.reviewed_at || row.completed_at)}`, { color: grey, size: 9, after: 14 });
    need(70); page.drawText(String(fb.overall_score || 0), { x: M, y: y - 44, size: 48, font: bold, color: royal }); page.drawText('/ 100 overall', { x: M + bold.widthOfTextAtSize(String(fb.overall_score || 0), 48) + 8, y: y - 40, size: 12, font, color: grey }); y -= 64;
    text(fb.summary || '', { after: 6 }); if (fb.goal_fit) text(fb.goal_fit, { color: grey });
    h2('Scores by category');
    for (const c of fb.categories || []) {
      need(30); page.drawText(win(c.label || CATS[c.key]), { x: M, y: y - 10, size: 10, font: bold, color: ink }); page.drawText(`${c.score}/10`, { x: W - M - 30, y: y - 10, size: 10, font: bold, color: royal });
      page.drawRectangle({ x: M + 170, y: y - 10, width: W - 2 * M - 210, height: 6, color: line }); page.drawRectangle({ x: M + 170, y: y - 10, width: (W - 2 * M - 210) * c.score / 10, height: 6, color: royal }); y -= 18;
      text(c.explanation + (c.pages && c.pages.length ? ` (${pagesTxt(c.pages)})` : ''), { size: 9, color: grey, after: 6 });
    }
    h2('Strengths'); (fb.strengths || []).forEach(s => text('+ ' + s.text + (s.pages.length ? ` (${pagesTxt(s.pages)})` : ''), { size: 10 }));
    h2('Improvements, most important first');
    text('Factual = checkable on the page. Subjective = design judgement; treat it as a reviewer\'s opinion.', { size: 8.5, color: grey, after: 8 });
    (fb.improvements || []).forEach((i, k) => { text(`${k + 1}. ${i.title}  [${i.priority === 'high' ? 'Fix first' : i.priority === 'medium' ? 'Next' : 'Polish'} - ${i.kind === 'factual' ? 'Factual' : 'Subjective'}]`, { bold: true, size: 10, after: 2 }); text(i.detail, { size: 9.5, x: M + 14, after: 2 }); if (i.how) text('How: ' + i.how, { size: 9.5, x: M + 14, color: grey, after: 2 }); if (i.pages.length) text(pagesTxt(i.pages), { size: 8.5, x: M + 14, color: royal, after: 8 }); });
    if ((fb.layout_references || []).length) { h2('Layout references'); fb.layout_references.forEach(l => text(`${(LAYOUTS[l.pattern] || {}).name || l.pattern}: ${l.why}${l.pages.length ? ` (${pagesTxt(l.pages)})` : ''}`, { size: 9.5 })); }
    if (fb.limitations) { h2('Not judged'); text(fb.limitations, { size: 9.5, color: grey }); }
    // One section per reviewed page: the page with numbered boxes, then its notes, layout idea and questions.
    for (const meta of row.pages || []) {
      const pg = (fb.pages || []).find(x => x.page === meta.n) || { notes: [], layout: {} };
      newPage(); text(`Page ${meta.n}${pg.project ? ' - ' + pg.project : ''}`, { bold: true, size: 14, color: royal, after: 8 });
      if (urls[meta.n]) {
        try {
          const bytes = await (await fetch(urls[meta.n])).arrayBuffer(); const img = await doc.embedJpg(bytes);
          const maxW = W - 2 * M, maxH = 360, k = Math.min(maxW / img.width, maxH / img.height), iw = img.width * k, ih = img.height * k, ix = M, iy = y - ih;
          page.drawImage(img, { x: ix, y: iy, width: iw, height: ih }); page.drawRectangle({ x: ix, y: iy, width: iw, height: ih, borderColor: line, borderWidth: 0.6 });
          pg.notes.forEach((x, i) => { if (!x.box) return; const c = kc[x.kind] || royal; const bx = ix + x.box.x * iw, by = iy + ih - (x.box.y + x.box.h) * ih; page.drawRectangle({ x: bx, y: by, width: x.box.w * iw, height: x.box.h * ih, borderColor: c, borderWidth: 1.4 }); page.drawCircle({ x: bx, y: by + x.box.h * ih, size: 8, color: c }); const t = String(i + 1); page.drawText(t, { x: bx - bold.widthOfTextAtSize(t, 9) / 2, y: by + x.box.h * ih - 3.2, size: 9, font: bold, color: rgb(1, 1, 1) }); });
          y = iy - 14;
        } catch (_e) { text('(The page picture could not be added.)', { color: grey }); }
      }
      if (pg.notes.length) pg.notes.forEach((x, i) => text(`${i + 1}. [${x.kind === 'factual' ? 'Factual' : 'Subjective'}] ${x.text}`, { size: 9.5, after: 3 })); else text('No notes on this page.', { color: grey, size: 9.5 });
      if (pg.layout && pg.layout.pattern && pg.layout.pattern !== 'keep' && LAYOUTS[pg.layout.pattern]) {
        y -= 4; text(`Layout idea: ${LAYOUTS[pg.layout.pattern].name}`, { bold: true, size: 10, after: 2 }); text(pg.layout.why || LAYOUTS[pg.layout.pattern].text, { size: 9.5, after: 2 });
        (pg.layout.slots || []).forEach(s => text(`- ${s.slot}: ${s.content}`, { size: 9, x: M + 10, color: grey, after: 1 }));
      }
      const qs = (row.questions || []).filter(q => q.page === meta.n);
      if (qs.length) { y -= 6; text('Questions to Arch Coach', { bold: true, size: 10, after: 2 }); qs.forEach(q => { text('Q: ' + q.question, { size: 9.5, bold: true, after: 1 }); text(String(q.answer).replace(/\*\*/g, ''), { size: 9.5, after: 6 }); }); }
    }
    newPage(); text('About this report', { bold: true, size: 12, after: 6 });
    text('Made by DrawUp Portfolio Review with Arch Coach. It comments only on what is on the uploaded pages and never adds projects, qualifications or achievements. Factual points can be checked on the page; subjective points are design judgement. The review is advisory and educational: admissions and hiring decisions stay with each school or firm. Your original PDF was not changed.', { size: 9.5, color: grey });
    const bytes = await doc.save();
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); a.download = `DrawUp Portfolio Review - ${safeName(row.title || row.file_name).replace(/\.pdf$/i, '')}.pdf`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  /* ====================================================================== wiring */
  // The public Arch Coach page had a Student Portfolio Review prototype whose button only printed a status line.
  // It now hands the chosen PDF to the real review (signing in first when needed).
  function upgradePrototype() {
    document.querySelectorAll('.portfolio-submit').forEach(btn => {
      if (btn.dataset.dprBound) return;
      const fresh = btn.cloneNode(true); fresh.dataset.dprBound = '1'; fresh.textContent = 'Review with Arch Coach'; btn.replaceWith(fresh);
      fresh.addEventListener('click', () => {
        const input = document.getElementById(fresh.dataset.input); const st = fresh.parentElement.querySelector('.review-status');
        const f = input && input.files && input.files[0];
        if (!f) { if (st) st.textContent = 'Choose a PDF first.'; return; }
        if (!open({ file: f }) && st) st.textContent = 'Sign in, then press Review with Arch Coach again.';
      });
    });
    const note = document.querySelector('#student-portfolio-review .review-note');
    if (note && !note.dataset.dpr) { note.dataset.dpr = '1'; note.textContent = 'Portfolio Review is in your DrawUp Portal under Discover. Feedback is advisory and educational; admissions, academic and hiring decisions remain with the applicable school, firm or reviewer.'; }
  }
  (function register(n) {
    const p = P();
    if (p && p.registerTab) { p.registerTab('portfolio', render); return; }
    if (n < 400) setTimeout(() => register(n + 1), 50);
  })(0);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', upgradePrototype); else upgradePrototype();

  window.DrawUpPortfolio = { open, render, LAYOUTS, GOALS, route: '#portal/portfolio', _exportPdf: exportPdf };
})();
