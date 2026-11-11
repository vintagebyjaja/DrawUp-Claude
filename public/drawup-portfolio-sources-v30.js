/* DrawUp Season 1 · Portfolio Review from files DrawUp already has.
 *
 * window.DrawUpPortfolioSources = { mount(box, ctx, choose), list(ctx), fetchFile(ctx, item) }
 *
 * Under "Upload your portfolio" Portfolio Review lists the PDFs the member already keeps in DrawUp, so a review can
 * start without uploading again:
 *   - portfolios uploaded for earlier reviews (student-portfolios/<uid>/...), e.g. to review again for another goal
 *   - PDFs in Project Information > Files (project_profiles.files, drawup-private)
 *   - PDFs brought into Document Studio (document_imports, drawup-private)
 *   - the firm's presentation PDFs in the Firm Kit (firm_kit_files, drawup-firmkit; the firm's own RLS decides)
 * A presentation made in Firm › Presentation Templates goes straight to Portfolio Review with "Review in Portfolio
 * Review" (drawup-firmkit-v22.js). Picking a file downloads it and hands it to the normal review flow, which keeps
 * its own untouched copy; the source file is never changed or moved. Read only: nothing here writes.
 */
(function () {
  'use strict';
  if (window.DrawUpPortfolioSources) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const isPdf = (name, type) => /pdf/i.test(type || '') || /\.pdf$/i.test(name || '');
  const date = s => { try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch (_e) { return ''; } };
  const GROUPS = { review: 'Earlier portfolio uploads', project: 'Project files', import: 'Documents you imported', firm: 'Firm presentations' };

  async function safe(q) { try { const r = await q; return r && !r.error && Array.isArray(r.data) ? r.data : []; } catch (_e) { return []; } }

  /** Every PDF the member can already reach, newest first, without duplicates. */
  async function list(c) {
    const uid = c.user.id, cl = c.client, out = [];
    const [reviews, profiles, threads, imports, firmFiles] = await Promise.all([
      safe(cl.from('portfolio_reviews').select('id,title,file_name,file_path,file_size_bytes,created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(40)),
      safe(cl.from('project_profiles').select('project_thread_id,files')),
      safe(cl.from('project_threads').select('id,project_name').eq('owner_id', uid)),
      safe(cl.from('document_imports').select('id,file_name,mime_type,size_bytes,storage_path,created_at').eq('owner_id', uid).order('created_at', { ascending: false }).limit(40)),
      safe(cl.from('firm_kit_files').select('id,file_name,mime_type,size_bytes,storage_path,kind,created_at').in('kind', ['template', 'asset', 'playbook']).order('created_at', { ascending: false }).limit(40)),
    ]);
    const names = Object.fromEntries(threads.map(t => [t.id, t.project_name]));
    reviews.forEach(r => r.file_path && out.push({ group: 'review', bucket: 'student-portfolios', path: r.file_path, name: r.file_name || r.title || 'Portfolio.pdf', size: r.file_size_bytes, at: r.created_at, note: r.title && r.title !== r.file_name ? r.title : '' }));
    profiles.forEach(p => (Array.isArray(p.files) ? p.files : []).forEach(f => f && f.path && isPdf(f.name, f.type) && out.push({ group: 'project', bucket: 'drawup-private', path: f.path, name: f.name, size: f.size, at: f.at, note: names[p.project_thread_id] || '' })));
    imports.forEach(i => isPdf(i.file_name, i.mime_type) && out.push({ group: 'import', bucket: 'drawup-private', path: i.storage_path, name: i.file_name, size: i.size_bytes, at: i.created_at, note: '' }));
    firmFiles.forEach(f => isPdf(f.file_name, f.mime_type) && out.push({ group: 'firm', bucket: 'drawup-firmkit', path: f.storage_path, name: f.file_name, size: f.size_bytes, at: f.created_at, note: f.kind === 'template' ? 'Presentation template' : f.kind === 'playbook' ? 'Playbook' : 'Firm file' }));
    const seen = new Set();
    return out.filter(x => { const k = x.bucket + '/' + x.path; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  async function fetchFile(c, it) {
    const r = await c.client.storage.from(it.bucket).download(it.path);
    if (r.error || !r.data) throw new Error('That file could not be opened: ' + ((r.error && r.error.message) || 'not found'));
    const name = /\.pdf$/i.test(it.name) ? it.name : it.name + '.pdf';
    return new File([r.data], name, { type: 'application/pdf' });
  }

  async function mount(box, c, choose) {
    if (!box || !c || !c.user) return;
    const items = await list(c);
    if (!items.length) { box.innerHTML = ''; return; }
    const by = {}; items.forEach((it, i) => { (by[it.group] = by[it.group] || []).push([it, i]); });
    box.innerHTML = `<details class="dpr-have" open><summary>Or review a PDF you already have in DrawUp <small>${items.length}</small></summary>
      <p class="dpr-muted">Your file is copied into the review; the original stays where it is. To review a presentation you are making, use "Review in Portfolio Review" in Firm › Presentation Templates.</p>
      ${Object.keys(GROUPS).filter(g => by[g]).map(g => `<div class="dpr-have-g"><h3>${esc(GROUPS[g])}</h3>${by[g].map(([it, i]) => `<button type="button" class="dpr-have-i" data-have="${i}"><b>${esc(it.name)}</b><small>${[it.note, it.size ? (it.size / 1048576).toFixed(1) + ' MB' : '', it.at ? date(it.at) : ''].filter(Boolean).map(esc).join(' · ')}</small></button>`).join('')}</div>`).join('')}
      <p class="dpr-have-st" role="status"></p></details>`;
    box.querySelectorAll('[data-have]').forEach(b => b.onclick = async () => {
      const it = items[+b.dataset.have], st = box.querySelector('.dpr-have-st');
      st.textContent = 'Opening ' + it.name + '…';
      try { const f = await fetchFile(c, it); st.textContent = ''; box.querySelector('details').open = false; choose(f, it); }
      catch (e) { st.textContent = e.message || String(e); }
    });
  }

  window.DrawUpPortfolioSources = { mount, list, fetchFile, GROUPS };
})();
