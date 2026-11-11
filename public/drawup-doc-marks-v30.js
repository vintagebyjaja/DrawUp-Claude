/* DrawUp Season 1 · Seals and signatures on documents.
 *
 * window.DrawUpMarks = { open(S), fit, apply, remove, list }
 *
 * Each person keeps their own seal and signature images in their private folder (drawup-private/<uid>/marks/).
 * Nobody else can list or read them. A seal or signature goes on a document only when its owner opens this window
 * on that document and applies it, confirming it is their own; the name, role and date are recorded with it.
 * Applying places a copy on the document (doc.data.marks) so everyone who can open the document sees the same
 * signed copy in the preview and the PDF and Word exports. Only the person who applied a mark can take it off.
 * Firm and client logos are not here: they belong to the letterhead (Firm settings, or Formats › Letterhead).
 */
(function () {
  'use strict';
  if (window.DrawUpMarks) return;
  const BUCKET = 'drawup-private', MAXPX = 900, MAXBYTES = 400 * 1024;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const Sp = () => window.DrawUpSpecs, X = () => window.DrawUpSpecsExport;
  const KIND = { seal: 'Seal', signature: 'Signature' };
  const toast = (S, m, bad) => (S.c && S.c.toast ? S.c.toast(m, bad) : console.log(m));
  const day = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

  /** Image file -> PNG data URL no larger than MAXPX on its long side; near-white backgrounds become transparent for
   *  signatures, so they sit on the page like ink. */
  async function fit(file, kind) {
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type || '') && !/\.(png|jpe?g|webp)$/i.test(file.name || '')) throw new Error('Use a PNG or JPG image.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Use an image under 10 MB.');
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('That image could not be read.')); i.src = url; });
      const r = Math.min(1, MAXPX / Math.max(img.naturalWidth, img.naturalHeight)); const w = Math.max(1, Math.round(img.naturalWidth * r)), h = Math.max(1, Math.round(img.naturalHeight * r));
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
      if (kind === 'signature') { const d = g.getImageData(0, 0, w, h); for (let i = 0; i < d.data.length; i += 4) { const v = Math.min(d.data[i], d.data[i + 1], d.data[i + 2]); if (v > 235) d.data[i + 3] = 0; } g.putImageData(d, 0, 0); }
      const data = c.toDataURL('image/png'); if (data.length * 0.75 > MAXBYTES * 1.4) throw new Error('That image is too detailed. Try a smaller scan.');
      return { data, w, h };
    } finally { URL.revokeObjectURL(url); }
  }
  const blobOf = data => { const b = atob(data.split(',')[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return new Blob([a], { type: 'image/png' }); };
  const urlOf = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });

  /** The person's own saved seals and signatures. */
  async function list(S) {
    const st = S.c.client.storage.from(BUCKET); const r = await st.list(`${S.me}/marks`, { limit: 50, sortBy: { column: 'created_at', order: 'desc' } });
    if (r.error) throw r.error;
    const rows = (r.data || []).filter(f => /^(seal|signature)-[\w-]+\.png$/.test(f.name));
    const out = [];
    for (const f of rows) { const path = `${S.me}/marks/${f.name}`; try { const d = await st.download(path); if (d.error || !d.data || !d.data.size) continue; out.push({ path, kind: f.name.startsWith('seal') ? 'seal' : 'signature', data: await urlOf(d.data), at: f.created_at || null }); } catch (_e) { /* skip */ } }
    return out;
  }
  async function save(S, kind, fitted) {
    const path = `${S.me}/marks/${kind}-${Date.now().toString(36)}.png`;
    const r = await S.c.client.storage.from(BUCKET).upload(path, blobOf(fitted.data), { contentType: 'image/png', upsert: false });
    if (r.error) throw r.error; return { path, kind, data: fitted.data, at: new Date().toISOString() };
  }
  const dims = data => new Promise(ok => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok({ w: 0, h: 0 }); i.src = data; });

  /** Puts a copy of one of the person's own images on the document, with their name, role and the date. */
  async function apply(S, item, who) {
    const doc = S.doc; const { w, h } = await dims(item.data); if (!w || !h) throw new Error('That image could not be read.');
    const m = { id: X().rid(), kind: item.kind, img: item.data, w, h, name: String(who.name || '').trim().slice(0, 120), role: String(who.role || '').trim().slice(0, 160), at: new Date().toISOString(), by: S.me };
    doc.data = Object.assign({}, doc.data); doc.data.marks = (Array.isArray(doc.data.marks) ? doc.data.marks : []).concat(m);
    Sp()._dirty(S); return m;
  }
  function remove(S, id) {
    const doc = S.doc, all = (doc.data && doc.data.marks) || []; const m = all.find(x => x.id === id);
    if (!m) return false; if (m.by !== S.me) throw new Error('Only the person who applied it can take it off.');
    doc.data = Object.assign({}, doc.data, { marks: all.filter(x => x.id !== id) }); Sp()._dirty(S); return true;
  }

  function style() {
    if (document.getElementById('mk-css')) return; const st = document.createElement('style'); st.id = 'mk-css';
    st.textContent = `.mk h4{margin:16px 0 8px;font-size:14px}.mk .mk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
.mk .mk-card{border:1px solid rgba(0,0,0,.16);border-radius:10px;padding:10px;background:#fff;color:#1d1d1f;display:flex;flex-direction:column;gap:6px}
.mk .mk-card .mk-img{height:96px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#f3f3f1 0 25%,#fff 0 50%) 0 0/14px 14px;border-radius:6px}
.mk .mk-card img{max-width:100%;max-height:92px}.mk .mk-card small{color:#555}
.mk .mk-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.mk .mk-up{display:inline-flex;align-items:center;padding:9px 16px;border:1.5px solid #1d1d1f;border-radius:999px;background:#fff;color:#1d1d1f;font-weight:600;cursor:pointer}
.mk .mk-up:focus-within{outline:2px solid #2b6cb0;outline-offset:2px}.mk .mk-form{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.mk .mk-form label{display:flex;flex-direction:column;gap:3px;font-size:12.5px}
.mk .mk-form input:not([type=checkbox]){padding:8px 10px;border:1px solid rgba(0,0,0,.2);border-radius:8px;font:inherit;background:#fff;color:#1d1d1f}
.mk .mk-form label.mk-ok{flex-direction:row;gap:8px;align-items:center;font-size:13px;grid-column:1/-1}.mk .mk-ok input{width:16px;height:16px;margin:0;flex:none}
.mk .mk-card .du-btn{padding:7px 12px;font-size:13px;min-height:0}
.mk .mk-note{font-size:12.5px;color:#555}@media (max-width:560px){.mk .mk-form{grid-template-columns:1fr}}`;
    document.head.appendChild(st);
  }

  function open(S) {
    if (!S.doc) return; style();
    const me = (S.members || []).find(x => x.id === S.me); const myName = (me && me.name) || (S.c.user && (S.c.user.user_metadata && (S.c.user.user_metadata.full_name || S.c.user.user_metadata.name))) || '';
    const M = Sp()._modal('Seal and signature', 'YOURS ONLY · APPLIED BY YOU', `
      <p class="mk-note">Your seal and signature are kept in your private folder. No one else can see them. One goes on this document only when you apply it here, and the document records your name and the date. Logos belong to the letterhead: Firm settings for your firm, Formats › Letterhead for a client.</p>
      <h4>On this document</h4><div class="mk-on"></div>
      <h4>Your seal and signature</h4>
      <div class="mk-form"><label>Name as it appears<input id="mk-name" value="${esc(myName)}" maxlength="120"></label><label>Role or license (optional)<input id="mk-role" placeholder="Architect, license no." maxlength="160"></label>
      <label class="mk-ok"><input type="checkbox" id="mk-mine"> This is my own seal or signature, and I am applying it to this document.</label></div>
      <div class="mk-lib" style="margin-top:10px"><p class="mk-note">Loading…</p></div>
      <div class="mk-row" style="margin-top:10px"><label class="mk-up">Add a signature<input type="file" accept="image/png,image/jpeg" data-up="signature" hidden></label><label class="mk-up">Add a seal<input type="file" accept="image/png,image/jpeg" data-up="seal" hidden></label><span class="mk-st sp-note" role="status"></span></div>
      <p class="mk-note">Use a scan or photo on white. PNG or JPG. A signature's white background is made clear so it sits on the page like ink.</p>`, true);
    M.classList.add('mk'); const q = s => M.querySelector(s); const st = q('.mk-st'); let lib = [];
    const drawOn = () => {
      const on = (S.doc.data && S.doc.data.marks) || [];
      q('.mk-on').innerHTML = on.length ? `<div class="mk-grid">${on.map(m => `<div class="mk-card"><div class="mk-img"><img src="${esc(m.img)}" alt="${esc(KIND[m.kind] || 'Mark')} of ${esc(m.name)}"></div><b>${esc(m.name || '(no name)')}</b><small>${esc(KIND[m.kind] || '')}${m.role ? ' · ' + esc(m.role) : ''} · ${esc(day(m.at))}</small>${m.by === S.me ? `<button type="button" class="du-btn ghost" data-off="${esc(m.id)}">Take off</button>` : '<small>Applied by someone else</small>'}</div>`).join('')}</div>` : '<p class="mk-note">Nothing yet. Exports show seals and signatures on their own page at the front of a manual, or at the end of a letter or form.</p>';
      M.querySelectorAll('[data-off]').forEach(b => b.onclick = () => { try { remove(S, b.dataset.off); drawOn(); Sp()._redraw && Sp()._redraw(S); toast(S, 'Taken off this document.'); } catch (e) { toast(S, e.message || String(e), true); } });
    };
    const drawLib = () => {
      q('.mk-lib').innerHTML = lib.length ? `<div class="mk-grid">${lib.map((m, i) => `<div class="mk-card"><div class="mk-img"><img src="${esc(m.data)}" alt="Your ${esc(KIND[m.kind].toLowerCase())}"></div><small>${esc(KIND[m.kind])}${m.at ? ' · saved ' + esc(day(m.at)) : ''}</small><button type="button" class="du-btn primary" data-apply="${i}">Apply to this document</button></div>`).join('')}</div>` : '<p class="mk-note">You have not saved a seal or signature yet.</p>';
      M.querySelectorAll('[data-apply]').forEach(b => b.onclick = async () => {
        if (!q('#mk-mine').checked) { st.textContent = 'Tick the box to confirm this is your own seal or signature.'; q('#mk-mine').focus(); return; }
        if (!q('#mk-name').value.trim()) { st.textContent = 'Add your name as it should appear.'; q('#mk-name').focus(); return; }
        try { await apply(S, lib[+b.dataset.apply], { name: q('#mk-name').value, role: q('#mk-role').value }); q('#mk-mine').checked = false; drawOn(); st.textContent = 'Applied. It shows in Preview & export.'; } catch (e) { st.textContent = e.message || String(e); }
      });
    };
    M.querySelectorAll('[data-up]').forEach(inp => inp.onchange = async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return; st.textContent = 'Saving…';
      try { const item = await save(S, inp.dataset.up, await fit(f, inp.dataset.up)); lib.unshift(item); drawLib(); st.textContent = `${KIND[item.kind]} saved to your private folder.`; } catch (er) { st.textContent = 'Not saved: ' + (er.message || er); }
      e.target.value = '';
    });
    drawOn();
    list(S).then(r => { lib = r; drawLib(); }).catch(e => { q('.mk-lib').innerHTML = `<p class="sp-bad">Your saved images could not be loaded: ${esc(e.message || e)}</p>`; });
  }

  window.DrawUpMarks = { open, fit, apply, remove, list };
})();
