/* DrawUp v33: Library and Materials (opened from the Dream Beyond dashboard sidebar).
 *
 *  Library    everything the member uploaded (from their own private folder: Swap pictures, Draw imports,
 *             CheckUp sets, Arch Coach attachments, project covers, markups, Connect and Playbook files)
 *             and every Swap picture DrawUp made for them (swap_generations, complete).
 *  Materials  three tabs:
 *             DrawUp    the built-in DrawUp material library (below, in code).
 *             Imported  materials the member uploads (user_materials, source 'imported', private).
 *             Vendor    real vendor products with their real sizes (user_materials, source 'vendor'), grouped on
 *                       browsable vendor pages (material_vendors). Uploading a product asks who the vendor is and
 *                       either adds it to that vendor's existing page or makes the vendor a new page.
 *  Swap       any material can be picked for Swap (up to 3). The pick shows above the Swap message box; when
 *             the member sends, the material goes with the request: its name and finish in the text, and for
 *             imported and vendor materials their picture and real size as references (server side, /api/swap).
 *
 * Needs migration 0080_library_materials.sql. Until it is run the Imported and Vendor tabs say so.
 * window.DrawUpMaterials = { renderLibrary, renderMaterials, openPicker, mountSwap, forSwap, clearSwap, picks, CATALOG }
 */
(function () {
  'use strict';
  if (window.DrawUpMaterials) return;
  const V = '33.0';
  const PRIV = 'drawup-private', PUB = 'drawup-materials';
  const MAX_PICKS = 3;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const sb = () => window.DrawUpPortal?.ctx?.()?.client || window.drawupSupabaseClient;
  async function uid() { try { return (await sb()?.auth.getSession())?.data?.session?.user?.id || null; } catch (_e) { return null; } }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_e) {} } };
  const go = a => window.DrawUpDreamBeyond?.go ? window.DrawUpDreamBeyond.go(a) : window.DrawUpPortal?.openPortalTab?.(a.tab);

  const I = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    upload: '<path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9"/><path d="M5 15v4.5h14V15"/>',
    download: '<path d="M12 4.5v11M7.5 11 12 15.5 16.5 11"/><path d="M5 15v4.5h14V15"/>',
    swap: '<path d="M5 8.5h11.5M13.5 5.5l3 3-3 3"/><path d="M19 15.5H7.5M10.5 12.5l-3 3 3 3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5.5 12.5 4 4 9-9.5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    left: '<path d="M15 6 9 12l6 6"/>',
    ext: '<path d="M13.5 5H19v5.5M19 5l-8 8"/><path d="M17 13.5V19H5V7h5.5"/>',
    doc: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M9.5 12h6M9.5 15.5h6"/>',
    image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m5 17 4.5-4.5 3 3 2.5-2.5L19.5 17"/>',
    store: '<path d="M4.5 9.5 6 4.5h12l1.5 5"/><path d="M4.5 9.5c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5"/><path d="M6 12v7.5h12V12M10 19.5v-4h4v4"/>',
    mail: '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="m4 7 8 6 8-6"/>',
    phone: '<path d="M6.5 4h3l1.5 4-2 1.2a10 10 0 0 0 5.8 5.8L16 13l4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>',
    pin: '<path d="M12 20.5s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="9.5" r="2.3"/>',
    ruler: '<path d="M3.5 15.5 15.5 3.5l5 5-12 12z"/><path d="m7 12 2 2M10 9l1.5 1.5M13 6l2 2"/>',
    edit: '<path d="M5 19.5 6 15 15.5 5.5a2.1 2.1 0 0 1 3 3L9 18z"/>',
    trash: '<path d="M5 7h14M9.5 7V4.5h5V7M7 7l1 12.5h8L17 7"/>',
    layers: '<path d="M12 3.5 20 8l-8 4.5L4 8z"/><path d="M4 12.2 12 16.7l8-4.5"/><path d="M4 16.2 12 20.7l8-4.5"/>'
  };
  const ico = (k, cls = 'mt-ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[k] || ''}</svg>`;

  function toast(msg, bad) {
    $('#mt-toast')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div id="mt-toast" class="mt-toast${bad ? ' is-bad' : ''}" role="status">${esc(msg)}</div>`);
    const t = $('#mt-toast'); setTimeout(() => t?.classList.add('is-out'), bad ? 5600 : 3400); setTimeout(() => t?.remove(), bad ? 6100 : 3900);
  }
  const missingTable = e => /does not exist|schema cache|42P01|PGRST20[05]/i.test(String(e?.message || e?.code || e || '')) || e?.code === '42P01';
  const NEEDS_SQL = '<div class="mt-empty"><b>Almost ready</b><p>This part needs the v33 database update. Run <code>0080_library_materials.sql</code> in Supabase (SQL editor), then refresh.</p></div>';

  /* ------------------------------------------------------------------ the built-in DrawUp material library */
  const CATS = [['flooring', 'Flooring'], ['tile', 'Tile'], ['stone', 'Stone'], ['wood', 'Wood'], ['concrete', 'Concrete'], ['brick', 'Brick and masonry'], ['metal', 'Metal'], ['glass', 'Glass'], ['wall', 'Wall finishes'], ['paint', 'Paint'], ['roofing', 'Roofing'], ['siding', 'Siding and cladding'], ['fabric', 'Fabric'], ['countertop', 'Countertops'], ['landscape', 'Landscape'], ['fixture', 'Fixtures'], ['other', 'Other']];
  const CAT_NAME = Object.fromEntries(CATS);
  const UNITS = ['in', 'ft', 'mm', 'cm', 'm'];
  const planks = (a, b, c, w = 7) => `repeating-linear-gradient(90deg,${a} 0 ${w}px,${b} ${w}px ${w + 2}px,${c} ${w + 2}px ${w * 2}px,${b} ${w * 2}px ${w * 2 + 1}px),linear-gradient(${a},${c})`;
  const grid = (bg, line, s = 22) => `linear-gradient(${line} 1px,transparent 1px) 0 0/${s}px ${s}px,linear-gradient(90deg,${line} 1px,transparent 1px) 0 0/${s}px ${s}px,${bg}`;
  const speck = (bg, dot, dot2) => `radial-gradient(${dot} 1px,transparent 1.6px) 0 0/9px 9px,radial-gradient(${dot2} 1.2px,transparent 1.8px) 4px 5px/13px 11px,${bg}`;
  const vein = (bg, v) => `linear-gradient(115deg,transparent 40%,${v} 42%,transparent 45%),linear-gradient(65deg,transparent 62%,${v} 63.5%,transparent 66%),linear-gradient(140deg,transparent 18%,${v} 19%,transparent 21.5%),${bg}`;
  const brick = (b, m) => `linear-gradient(${m} 2px,transparent 2px) 0 0/30px 12px,linear-gradient(90deg,${m} 2px,transparent 2px) 0 0/30px 24px,linear-gradient(90deg,${m} 2px,transparent 2px) 15px 12px/30px 24px,${b}`;
  const lines = (bg, l, s = 10, d = 90) => `repeating-linear-gradient(${d}deg,${bg} 0 ${s - 1}px,${l} ${s - 1}px ${s}px)`;
  const flat = c => c;
  // [key, name, category, finish, size {w,l,t,unit} or null, swatch]
  const CATALOG = [
    ['white-oak', 'White oak plank', 'flooring', 'matte, natural oil', { w: 7.5, l: 72, t: 0.75, unit: 'in' }, planks('#d9bf95', '#b8996c', '#cfb185')],
    ['walnut-plank', 'American walnut plank', 'flooring', 'satin', { w: 6, l: 60, t: 0.75, unit: 'in' }, planks('#6f4a30', '#4e3220', '#7c5538')],
    ['ash-herringbone', 'Light ash herringbone', 'flooring', 'matte', { w: 4, l: 24, t: 0.625, unit: 'in' }, `repeating-linear-gradient(45deg,#e5d3b4 0 8px,#cdb894 8px 9px),repeating-linear-gradient(-45deg,#e9dabd 0 8px,#cdb894 8px 9px)`],
    ['lvp-grey', 'Grey luxury vinyl plank', 'flooring', 'low sheen', { w: 9, l: 60, t: 0.25, unit: 'in' }, planks('#b5b2ab', '#97948e', '#aeaba4', 9)],
    ['polished-concrete', 'Grey polished concrete', 'concrete', 'polished', null, speck('linear-gradient(135deg,#a9aaa7,#bdbdb9)', 'rgba(255,255,255,.35)', 'rgba(60,60,60,.18)')],
    ['board-formed', 'Board-formed concrete', 'concrete', 'raw, board texture', { w: 6, l: 96, t: 0, unit: 'in' }, lines('#a4a29c', '#8e8c86', 12, 0)],
    ['microcement', 'Warm microcement', 'concrete', 'matte, seamless', null, speck('linear-gradient(135deg,#cbbfae,#d8cdbd)', 'rgba(255,255,255,.4)', 'rgba(90,70,50,.12)')],
    ['carrara', 'Carrara marble', 'stone', 'honed', { w: 24, l: 24, t: 0.375, unit: 'in' }, vein('linear-gradient(135deg,#f2f2f0,#e5e6e4)', 'rgba(120,125,130,.55)')],
    ['calacatta', 'Calacatta gold marble', 'stone', 'polished', { w: 24, l: 48, t: 0.375, unit: 'in' }, vein('linear-gradient(135deg,#f7f4ee,#ece6da)', 'rgba(176,140,80,.6)')],
    ['nero-marquina', 'Nero Marquina marble', 'stone', 'polished', { w: 24, l: 24, t: 0.375, unit: 'in' }, vein('linear-gradient(135deg,#1b1b1d,#2a2a2d)', 'rgba(235,235,235,.6)')],
    ['travertine', 'Travertine', 'stone', 'honed and filled', { w: 18, l: 36, t: 0.5, unit: 'in' }, lines('#dccab0', '#cdb898', 7, 8)],
    ['limestone', 'Limestone cladding', 'stone', 'honed', { w: 24, l: 48, t: 1.25, unit: 'in' }, grid('linear-gradient(135deg,#e4dccb,#d8cfbc)', 'rgba(150,135,110,.35)', 34)],
    ['slate', 'Charcoal slate', 'stone', 'cleft', { w: 12, l: 24, t: 0.5, unit: 'in' }, grid('linear-gradient(135deg,#45494d,#54595e)', 'rgba(20,20,20,.45)', 24)],
    ['terrazzo', 'Terrazzo', 'tile', 'polished', { w: 24, l: 24, t: 0.5, unit: 'in' }, speck('#ece7df', 'rgba(170,120,90,.8)', 'rgba(80,90,100,.7)')],
    ['zellige', 'White zellige', 'tile', 'glossy, handmade', { w: 4, l: 4, t: 0.375, unit: 'in' }, grid('linear-gradient(135deg,#f6f4ee,#e8e5dc)', 'rgba(180,175,160,.6)', 14)],
    ['subway', 'White subway tile', 'tile', 'gloss', { w: 3, l: 6, t: 0.3125, unit: 'in' }, brick('#f4f4f1', '#d6d6d2')],
    ['porcelain-large', 'Large-format grey porcelain', 'tile', 'matte', { w: 24, l: 48, t: 0.375, unit: 'in' }, grid('linear-gradient(135deg,#bdbbb5,#c9c7c1)', 'rgba(110,110,105,.4)', 40)],
    ['encaustic', 'Encaustic pattern tile', 'tile', 'matte', { w: 8, l: 8, t: 0.625, unit: 'in' }, 'radial-gradient(circle at 50% 50%,#1d428a 0 4px,transparent 5px) 0 0/16px 16px,conic-gradient(#e9e1d2 25%,#cfc3ad 0 50%,#e9e1d2 0 75%,#cfc3ad 0) 0 0/16px 16px'],
    ['red-brick', 'Exposed red brick', 'brick', 'natural', { w: 3.625, l: 7.625, t: 2.25, unit: 'in' }, brick('#a2482f', '#d5c8b8')],
    ['white-brick', 'Painted white brick', 'brick', 'painted', { w: 3.625, l: 7.625, t: 2.25, unit: 'in' }, brick('#efede8', '#cfccc5')],
    ['blackened-steel', 'Blackened steel', 'metal', 'waxed', null, 'linear-gradient(135deg,#2a2c2e,#3b3e41 40%,#26282a)'],
    ['brushed-brass', 'Brushed brass', 'metal', 'brushed', null, lines('#c9a45c', '#b8924a', 3, 0)],
    ['corten', 'Weathering steel (Corten)', 'metal', 'rusted patina', null, speck('linear-gradient(135deg,#8e4a24,#a4592c)', 'rgba(60,25,10,.4)', 'rgba(210,130,70,.4)')],
    ['standing-seam', 'Black standing-seam metal', 'roofing', 'matte', { w: 16, l: 0, t: 0, unit: 'in' }, lines('#2b2d30', '#45484c', 14, 90)],
    ['clay-tile', 'Terracotta clay roof tile', 'roofing', 'natural', null, 'radial-gradient(circle at 50% 0,#c2683f 0 9px,#a9532e 10px 11px,transparent 11px) 0 0/20px 12px,#b45d35'],
    ['cedar', 'Cedar siding', 'siding', 'natural, oiled', { w: 5.5, l: 0, t: 0.75, unit: 'in' }, lines('#b9784a', '#8f5531', 10, 0)],
    ['charred-timber', 'Charred timber (shou sugi ban)', 'siding', 'brushed char', { w: 6, l: 0, t: 0.75, unit: 'in' }, lines('#1f1c1a', '#38322e', 11, 90)],
    ['fiber-cement', 'Fiber-cement panel', 'siding', 'smooth', { w: 48, l: 96, t: 0.3125, unit: 'in' }, grid('#9aa0a3', 'rgba(60,65,70,.5)', 30)],
    ['walnut-panel', 'Walnut wood panelling', 'wood', 'satin', { w: 48, l: 96, t: 0.75, unit: 'in' }, lines('#6c4a33', '#5a3c28', 16, 90)],
    ['fluted-oak', 'Fluted oak panel', 'wood', 'matte', { w: 1, l: 96, t: 0.75, unit: 'in' }, `repeating-linear-gradient(90deg,#d2b48a 0 5px,#b8996e 5px 7px,#e0c79f 7px 9px)`],
    ['limewash', 'Limewash', 'wall', 'mottled matte', null, 'radial-gradient(circle at 30% 30%,#eee7dc,transparent 60%),radial-gradient(circle at 70% 70%,#ddd2c2,transparent 55%),#e6ddcf'],
    ['venetian-plaster', 'Venetian plaster', 'wall', 'burnished', null, 'radial-gradient(circle at 20% 70%,#d8d3cb,transparent 50%),radial-gradient(circle at 80% 20%,#f1eee8,transparent 45%),#e3ded6'],
    ['warm-white', 'Warm white paint', 'paint', 'eggshell', null, flat('#f2ede4')],
    ['greige', 'Greige paint', 'paint', 'matte', null, flat('#d9d4cc')],
    ['sage', 'Sage green paint', 'paint', 'matte', null, flat('#9caf88')],
    ['navy', 'Deep navy paint', 'paint', 'satin', null, flat('#1b2a4a')],
    ['clear-glass', 'Clear low-iron glass', 'glass', 'clear', null, 'linear-gradient(135deg,rgba(220,240,250,.9),rgba(170,210,230,.7) 45%,rgba(240,250,255,.95) 55%,rgba(180,215,232,.8))'],
    ['fluted-glass', 'Fluted (reeded) glass', 'glass', 'translucent', null, 'repeating-linear-gradient(90deg,#dceef3 0 4px,#bcd8e0 4px 8px)'],
    ['quartz-white', 'White quartz', 'countertop', 'polished', { w: 63, l: 120, t: 1.25, unit: 'in' }, speck('#f3f2ef', 'rgba(160,160,160,.35)', 'rgba(200,200,200,.4)')],
    ['butcher-block', 'Butcher block', 'countertop', 'oiled', { w: 25, l: 96, t: 1.5, unit: 'in' }, lines('#c99a62', '#b0814c', 7, 90)],
    ['boucle', 'Ivory boucle', 'fabric', 'textured', null, speck('#efe9de', 'rgba(255,255,255,.8)', 'rgba(170,160,140,.4)')],
    ['linen', 'Natural linen', 'fabric', 'woven', null, 'repeating-linear-gradient(0deg,rgba(255,255,255,.18) 0 1px,transparent 1px 3px),repeating-linear-gradient(90deg,rgba(120,100,70,.14) 0 1px,transparent 1px 3px),#d8ccb6'],
    ['lawn', 'Lawn grass', 'landscape', 'natural', null, speck('linear-gradient(135deg,#5f8f3e,#78a74c)', 'rgba(180,220,120,.5)', 'rgba(40,80,20,.4)')],
    ['gravel', 'Pea gravel', 'landscape', 'loose', null, speck('#b9b1a3', 'rgba(110,100,90,.6)', 'rgba(240,235,225,.7)')],
    ['pavers', 'Concrete pavers', 'landscape', 'brushed', { w: 12, l: 24, t: 2.375, unit: 'in' }, brick('#b8b4ac', '#8d8a84')]
  ].map(([key, name, category, finish, size, swatch]) => ({ key, name, category, finish, size, swatch }));
  const catalogByKey = Object.fromEntries(CATALOG.map(m => [m.key, m]));

  const num = n => { const v = Number(n); return Number.isFinite(v) && v > 0 ? String(Math.round(v * 1000) / 1000) : ''; };
  function sizeText(m) {
    const s = m.size || { w: m.width, l: m.length, t: m.thickness, unit: m.unit };
    const parts = [num(s.w), num(s.l), num(s.t)].filter(Boolean);
    return parts.length ? parts.join(' × ') + ' ' + (s.unit || 'in') : '';
  }
  const initials = n => (String(n || 'V').trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('') || 'V').toUpperCase();
  const slugify = n => String(n || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[_\s-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'vendor';
  const cleanUrl = u => { u = String(u || '').trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (_e) { return ''; } };
  const pubUrl = p => p ? sb().storage.from(PUB).getPublicUrl(p).data.publicUrl : '';
  async function signedMap(paths) {
    const out = new Map(); const list = [...new Set(paths.filter(Boolean))]; if (!list.length) return out;
    for (let i = 0; i < list.length; i += 100) {
      const { data } = await sb().storage.from(PRIV).createSignedUrls(list.slice(i, i + 100), 3600).catch(() => ({ data: null }));
      (data || []).forEach(d => { if (d.signedUrl) out.set(d.path, d.signedUrl); });
    }
    return out;
  }
  // Pictures are cut down to a sensible size before upload (2048px longest side, JPEG), so Swap can use them as references.
  async function normalize(file, max = 2048) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Use a JPG, PNG or WebP picture.');
    const bmp = await createImageBitmap(file).catch(() => null); if (!bmp) throw new Error('That picture could not be opened.');
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
    const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) throw new Error('That picture could not be prepared.');
    return blob;
  }

  /* ------------------------------------------------------------------ picks for Swap (kept across pages) */
  const PICK_KEY = 'drawup_swap_materials_v33';
  let picks = store.get(PICK_KEY, []).filter(p => p && p.id && p.name).slice(0, MAX_PICKS);
  const savePicks = () => { store.set(PICK_KEY, picks); document.dispatchEvent(new CustomEvent('du-material-picks')); };
  const pickId = m => m.kind === 'drawup' ? 'du:' + m.key : m.id;
  const isPicked = id => picks.some(p => p.id === id);
  function pickFrom(m, kind) {
    if (kind === 'drawup') return { id: 'du:' + m.key, kind, name: m.name, text: `${m.name}${m.finish ? ', ' + m.finish : ''}${sizeText(m) ? ', each piece ' + sizeText(m) : ''}`, swatch: m.swatch };
    return { id: m.id, kind, name: m.name, text: m.name + (m._vendor ? ' by ' + m._vendor : ''), thumb: m._img || '' };
  }
  function togglePick(p) {
    if (isPicked(p.id)) { picks = picks.filter(x => x.id !== p.id); savePicks(); return false; }
    if (picks.length >= MAX_PICKS) { toast(`Swap takes up to ${MAX_PICKS} materials at a time. Remove one first.`, true); return null; }
    picks.push(p); savePicks(); return true;
  }
  function forSwap() {
    if (!picks.length) return null;
    return { text: 'Materials to use: ' + picks.map(p => String(p.text).replace(/\.+$/, '')).join('; ') + '.', ids: picks.filter(p => p.kind !== 'drawup').map(p => p.id) };
  }
  function clearSwap() { picks = []; savePicks(); }
  const pickThumb = p => p.swatch ? `<i class="mt-pill__sw" style="background:${esc(p.swatch)}"></i>` : p.thumb ? `<i class="mt-pill__sw" style="background-image:url('${esc(p.thumb)}')"></i>` : `<i class="mt-pill__sw">${ico('layers')}</i>`;

  /* Swap: a "Materials" row above the message box. */
  let swapApi = null;
  function mountSwap(api) {
    swapApi = api;
    const comp = api?.w?.querySelector('#sw20-compose'); if (!comp) return;
    let bar = comp.querySelector('#mt-swapbar');
    if (!bar) { const form = comp.querySelector('#sw20-form'); if (!form) return; form.insertAdjacentHTML('beforebegin', '<div class="mt-swapbar" id="mt-swapbar"></div>'); bar = comp.querySelector('#mt-swapbar'); }
    paintSwapBar(bar);
  }
  function paintSwapBar(bar = $('#mt-swapbar')) {
    if (!bar) return;
    bar.innerHTML = `<span class="mt-swapbar__h">${ico('layers')} Materials</span>${picks.map(p => `<span class="mt-pill">${pickThumb(p)}<span>${esc(p.name)}</span><button type="button" data-mt-unpick="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">${ico('close')}</button></span>`).join('')}<button type="button" class="mt-linkbtn" data-mt-openpick>${ico('plus')} ${picks.length ? 'Change' : 'Pick from the Materials library'}</button>${picks.length ? '<small>Goes with your next request. Say where, for example “use it on the floor”.</small>' : ''}`;
    bar.onclick = e => {
      const u = e.target.closest('[data-mt-unpick]'); if (u) { picks = picks.filter(x => x.id !== u.dataset.mtUnpick); savePicks(); return; }
      if (e.target.closest('[data-mt-openpick]')) openPicker();
    };
  }
  document.addEventListener('du-material-picks', () => { paintSwapBar(); $$('[data-mt-pickcount]').forEach(x => { x.textContent = picks.length ? `${picks.length} picked for Swap` : ''; }); });

  function openPicker() {
    $('#mt-picker')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div id="mt-picker" class="mt-modal" role="dialog" aria-modal="true" aria-label="Pick materials for Swap"><div class="mt-modal__card mt-modal__card--wide"><button type="button" class="mt-modal__x" aria-label="Close">${ico('close')}</button><div id="mt-picker-body"></div><div class="mt-modal__foot"><span data-mt-pickcount>${picks.length ? `${picks.length} picked for Swap` : ''}</span><button type="button" class="db-btn db-btn--primary db-btn--sm" data-mt-done>Done</button></div></div></div>`);
    const m = $('#mt-picker'); const close = () => { m.remove(); document.removeEventListener('keydown', key); };
    function key(e) { if (e.key === 'Escape' && !$('.mt-modal--form')) close(); }
    document.addEventListener('keydown', key);
    m.querySelector('.mt-modal__x').onclick = close; m.querySelector('[data-mt-done]').onclick = close;
    m.addEventListener('click', e => { if (e.target === m) close(); });
    renderMaterials(m.querySelector('#mt-picker-body'), { pick: true });
  }

  /* ------------------------------------------------------------------ shared page shell */
  function shell(el, { title, sub, tabs, tab, actions = '' }) {
    el.innerHTML = `<section class="mt-page" aria-labelledby="mt-h">
      <header class="mt-head"><div><h1 id="mt-h">${esc(title)}</h1><p>${esc(sub)}</p></div><div class="mt-head__actions">${actions}</div></header>
      <div class="mt-tabs" role="tablist">${tabs.map(t => `<button type="button" role="tab" data-mt-tab="${t[0]}" aria-selected="${t[0] === tab}" class="${t[0] === tab ? 'is-on' : ''}">${esc(t[1])}${t[2] != null ? `<small>${esc(t[2])}</small>` : ''}</button>`).join('')}</div>
      <div class="mt-tools" id="mt-tools"></div>
      <div class="mt-body" id="mt-body"><div class="mt-grid">${'<div class="mt-card is-skel"></div>'.repeat(6)}</div></div>
    </section>`;
    return { body: el.querySelector('#mt-body'), tools: el.querySelector('#mt-tools') };
  }
  const setHashView = (view, extra = '') => { if (/^#portal(\/dashboard)?($|\?)/.test(location.hash || '') || !location.hash) history.replaceState(null, '', '#portal/dashboard?view=' + view + extra); };

  /* ================================================================== LIBRARY */
  const LIB_FOLDERS = [
    ['swap', 'Swap', f => /-source\.(jpe?g|png|webp)$/i.test(f)],
    ['draw/imports', 'Draw import'],
    ['check', 'CheckUp'],
    ['markups', 'Markup'],
    ['playbook', 'Playbook'],
    ['coach', 'Arch Coach', null, true],
    ['covers', 'Project cover', f => !/^drawing-/.test(f), true],
    ['connect', 'Connect', null, true]
  ];
  const kindOf = (name, mime) => /^image\//.test(mime || '') || /\.(jpe?g|png|webp|gif|svg)$/i.test(name) ? 'image' : /pdf$/i.test(mime || '') || /\.pdf$/i.test(name) ? 'pdf' : 'file';
  const prettyName = (n, label) => {
    const s = String(n || '').replace(/^[0-9a-f]{8}-[0-9a-f-]{27}-?/i, '').replace(/^\d{10,}-/, '').replace(/^template-v23-\d+/, 'CheckUp template');
    const ext = (/\.([a-z0-9]{2,5})$/i.exec(n || '') || [])[1] || '';
    return !s || /^-?(source|p\d+)?\.[a-z0-9]+$/i.test(s) ? (label === 'Swap' ? 'Picture for Swap' : label + ' file') + (ext ? '.' + ext.toLowerCase() : '') : s;
  };
  const fmtBytes = b => !b ? '' : b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
  const fmtDate = d => d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  async function listUploads(me) {
    const c = sb(); const out = [];
    const list = async (prefix) => { const { data, error } = await c.storage.from(PRIV).list(prefix, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } }); if (error) return []; return data || []; };
    await Promise.all(LIB_FOLDERS.map(async ([sub, label, keep, nested]) => {
      const base = `${me}/${sub}`;
      const top = await list(base);
      const files = [];
      const take = (prefix, arr) => arr.filter(x => x.id && x.name && !x.name.startsWith('.')).forEach(x => files.push({ path: `${prefix}/${x.name}`, name: x.name, at: x.created_at || x.updated_at, size: x.metadata?.size || 0, mime: x.metadata?.mimetype || '' }));
      take(base, top);
      if (nested) { const dirs = top.filter(x => !x.id).slice(0, 24); for (const d of dirs) take(`${base}/${d.name}`, await list(`${base}/${d.name}`)); }
      files.filter(f => !keep || keep(f.name)).forEach(f => out.push({ ...f, label, kind: kindOf(f.name, f.mime) }));
    }));
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }

  async function renderLibrary(el, opts = {}) {
    el.onclick = null;
    let tab = opts.tab || store.get('drawup_lib_tab', 'all');
    const me = await uid();
    const S = { swaps: null, uploads: null, urls: new Map(), q: '', type: '' };
    const draw = () => {
      const { body, tools } = shell(el, { title: 'Library', sub: 'Everything you uploaded and every Swap picture DrawUp made for you, in one place.', tab, tabs: [['all', 'All', S.swaps && S.uploads ? S.swaps.length + S.uploads.length : null], ['swaps', 'Swap pictures', S.swaps ? S.swaps.length : null], ['uploads', 'Uploads', S.uploads ? S.uploads.length : null]] });
      tools.innerHTML = `<label class="mt-search">${ico('search')}<input type="search" placeholder="Search your library" value="${esc(S.q)}" aria-label="Search your library" data-mt-q></label>${tab !== 'swaps' ? `<select data-mt-type aria-label="File type"><option value="">All file types</option><option value="image" ${S.type === 'image' ? 'selected' : ''}>Pictures</option><option value="pdf" ${S.type === 'pdf' ? 'selected' : ''}>PDFs</option><option value="file" ${S.type === 'file' ? 'selected' : ''}>Other files</option></select>` : ''}`;
      paint(body);
      el.querySelectorAll('[data-mt-tab]').forEach(b => b.onclick = () => { tab = b.dataset.mtTab; store.set('drawup_lib_tab', tab); draw(); });
      const q = tools.querySelector('[data-mt-q]'); q.oninput = () => { S.q = q.value.trim().toLowerCase(); paint(body); };
      const ty = tools.querySelector('[data-mt-type]'); if (ty) ty.onchange = () => { S.type = ty.value; paint(body); };
    };
    const items = () => {
      const sw = (S.swaps || []).map(g => ({ t: 'swap', id: g.id, path: g.result_path, name: g.prompt || 'Swap picture', label: g.swap_type === 'photoreal' ? 'Photoreal render' : g.swap_type === 'play' ? 'Let’s Play' : 'Swap picture', at: g.completed_at || g.created_at, kind: 'image', g }));
      const up = (S.uploads || []).map(f => ({ t: 'upload', id: f.path, path: f.path, name: prettyName(f.name, f.label), label: f.label, at: f.at, kind: f.kind, size: f.size }));
      let all = tab === 'swaps' ? sw : tab === 'uploads' ? up : [...sw, ...up].sort((a, b) => String(b.at).localeCompare(String(a.at)));
      if (S.type && tab !== 'swaps') all = all.filter(x => x.kind === S.type);
      if (S.q) all = all.filter(x => (x.name + ' ' + x.label).toLowerCase().includes(S.q));
      return all;
    };
    const paint = body => {
      if (!me) { body.innerHTML = '<div class="mt-empty"><b>Sign in to see your library</b></div>'; return; }
      if (!S.swaps || !S.uploads) return;
      const list = items();
      if (!list.length) {
        body.innerHTML = S.q || S.type ? '<div class="mt-empty"><b>Nothing matches</b><p>Try another search or file type.</p></div>'
          : `<div class="mt-empty"><b>${tab === 'swaps' ? 'No Swap pictures yet' : 'Nothing here yet'}</b><p>${tab === 'swaps' ? 'Pictures you make in Swap show up here.' : 'Pictures and files you upload anywhere in DrawUp (Swap, Draw, CheckUp, Arch Coach, project covers) show up here.'}</p><button type="button" class="db-btn db-btn--primary db-btn--sm" data-mt-goswap>${ico('swap')} Open Swap</button></div>`;
        body.querySelector('[data-mt-goswap]')?.addEventListener('click', () => go({ tab: 'swap' }));
        return;
      }
      body.innerHTML = `<div class="mt-grid">${list.slice(0, 240).map(x => {
        const url = S.urls.get(x.path);
        return `<article class="mt-card mt-card--lib" data-mt-item="${esc(x.t + '|' + x.id)}">
          <div class="mt-card__img ${x.kind !== 'image' ? 'is-file' : ''}" ${x.kind === 'image' && url ? `style="background-image:url('${esc(url)}')"` : ''}>${x.kind !== 'image' ? ico(x.kind === 'pdf' ? 'doc' : 'doc') + `<em>${x.kind === 'pdf' ? 'PDF' : (x.name.split('.').pop() || 'FILE').slice(0, 5).toUpperCase()}</em>` : !url ? ico('image') : ''}<span class="mt-tag">${esc(x.label)}</span></div>
          <div class="mt-card__txt"><b title="${esc(x.name)}">${esc(x.name)}</b><small>${esc(fmtDate(x.at))}${x.size ? ' · ' + esc(fmtBytes(x.size)) : ''}</small></div>
          <div class="mt-card__acts">
            ${url ? `<a class="mt-iconbtn" href="${esc(url)}" target="_blank" rel="noopener" title="Open" aria-label="Open ${esc(x.name)}">${ico('ext')}</a>` : ''}
            <button type="button" class="mt-iconbtn" data-a="dl" title="Download" aria-label="Download ${esc(x.name)}">${ico('download')}</button>
            ${x.kind === 'image' ? `<button type="button" class="mt-iconbtn" data-a="mat" title="Save as a material" aria-label="Save ${esc(x.name)} as a material">${ico('layers')}</button><button type="button" class="mt-chipbtn" data-a="swap">${ico('swap')} ${x.t === 'swap' && x.g.thread_id ? 'Open in Swap' : 'Swap it'}</button>` : ''}
          </div></article>`;
      }).join('')}</div>${list.length > 240 ? `<p class="mt-muted">Showing the latest 240 of ${list.length}. Search to find older ones.</p>` : ''}`;
      body.onclick = async e => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        const [t, id] = b.closest('[data-mt-item]').dataset.mtItem.split(/\|(.*)/s);
        const x = list.find(y => y.t === t && y.id === id); if (!x) return;
        if (b.dataset.a === 'dl') return download(x.path, x.name);
        if (b.dataset.a === 'mat') return materialForm({ source: 'imported', fromPath: x.path, fromUrl: S.urls.get(x.path), name: x.t === 'swap' ? '' : x.name.replace(/\.[a-z0-9]+$/i, '') });
        if (b.dataset.a === 'swap') {
          if (x.t === 'swap' && x.g.thread_id) { try { localStorage.setItem('drawup_swap20_thread', x.g.thread_id); } catch (_e) {} return go({ tab: 'swap' }); }
          return startSwap(x.path, x.name);
        }
      };
    };
    draw();
    if (!me) return;
    const c = sb();
    const [g, ups] = await Promise.all([
      Promise.resolve(c.from('swap_generations').select('id,result_path,source_path,prompt,swap_type,thread_id,completed_at,created_at').eq('owner_id', me).eq('status', 'complete').not('result_path', 'is', null).order('created_at', { ascending: false }).limit(300)).catch(e => ({ error: e })),
      listUploads(me).catch(() => [])
    ]);
    S.swaps = g.error ? [] : (g.data || []); S.uploads = ups;
    S.urls = await signedMap([...S.swaps.map(x => x.result_path), ...S.uploads.filter(u => u.kind === 'image').slice(0, 240).map(u => u.path)]);
    if (el.isConnected) draw();
  }
  async function download(path, name) {
    try { const { data, error } = await sb().storage.from(PRIV).download(path); if (error) throw error; const a = document.createElement('a'); a.href = URL.createObjectURL(data); a.download = (name || 'drawup-file').replace(/[^\w.() -]+/g, '_'); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    catch (e) { toast('Could not download: ' + (e.message || e), true); }
  }
  // Starts a new Swap thread from a picture the member already has (their own private folder) and opens Swap on it.
  async function startSwap(path, title) {
    const me = await uid(); if (!me || !path || path.split('/')[0] !== me) return toast('Only your own pictures can start a swap.', true);
    const c = sb();
    const r = await c.from('swap_threads').insert({ owner_id: me, source_path: path, title: String(title || 'New swap').slice(0, 60) }).select('id').single();
    if (r.error) return toast('Could not start the swap: ' + r.error.message, true);
    await c.from('swap_messages').insert({ thread_id: r.data.id, owner_id: me, role: 'user', image_path: path });
    try { localStorage.setItem('drawup_swap20_thread', r.data.id); } catch (_e) {}
    go({ tab: 'swap' });
  }

  /* ================================================================== MATERIALS */
  const MT = { vendors: null, vendorErr: null, imported: null, vendorProducts: null, me: null, myListing: undefined };
  async function loadMine(force) {
    if (MT.imported && !force) return;
    const me = MT.me = await uid(); if (!me) { MT.imported = []; return; }
    const { data, error } = await sb().from('user_materials').select('*').eq('owner_id', me).eq('source', 'imported').order('created_at', { ascending: false }).limit(500);
    if (error) { MT.imported = missingTable(error) ? 'sql' : []; return; }
    const urls = await signedMap(data.map(m => m.image_path));
    MT.imported = data.map(m => ({ ...m, _img: urls.get(m.image_path) || '' }));
  }
  async function loadVendors(force) {
    if (MT.vendors && !force) return;
    MT.me = MT.me || await uid();
    const c = sb();
    const [v, p] = await Promise.all([
      Promise.resolve(c.from('material_vendors').select('*').order('name').limit(1000)).catch(e => ({ error: e })),
      Promise.resolve(c.from('user_materials').select('*').eq('source', 'vendor').order('created_at', { ascending: false }).limit(2000)).catch(e => ({ error: e }))
    ]);
    if (v.error || p.error) { MT.vendors = missingTable(v.error || p.error) ? 'sql' : []; MT.vendorProducts = []; return; }
    MT.vendors = v.data || [];
    const byId = Object.fromEntries(MT.vendors.map(x => [x.id, x]));
    MT.vendorProducts = (p.data || []).map(m => ({ ...m, _img: pubUrl(m.image_path), _vendor: byId[m.vendor_id]?.name || '', _vslug: byId[m.vendor_id]?.slug || '' }));
  }

  async function renderMaterials(el, opts = {}) {
    let tab = opts.tab || store.get('drawup_mat_tab', 'drawup');
    if (!['drawup', 'imported', 'vendor'].includes(tab)) tab = 'drawup';
    let vendorSlug = opts.vendor || null;
    const pick = !!opts.pick;
    const F = { q: '', cat: '' };
    const draw = async () => {
      const actions = pick ? '' : `<span class="mt-muted" data-mt-pickcount>${picks.length ? `${picks.length} picked for Swap` : ''}</span>${tab === 'imported' ? `<button type="button" class="db-btn db-btn--primary db-btn--sm" data-mt-add="imported">${ico('upload')} Add a material</button>` : tab === 'vendor' ? `<button type="button" class="db-btn db-btn--primary db-btn--sm" data-mt-add="vendor">${ico('upload')} Upload a vendor product</button>` : ''}`;
      const { body, tools } = shell(el, {
        title: pick ? 'Pick materials for Swap' : 'Materials',
        sub: pick ? `Pick up to ${MAX_PICKS}. They go with your next Swap request.` : 'The DrawUp material library, your own materials, and real vendor products with their real sizes. Use any of them in Swap.',
        tab, tabs: [['drawup', 'DrawUp', CATALOG.length], ['imported', 'Imported', Array.isArray(MT.imported) ? MT.imported.length : null], ['vendor', 'Vendor', Array.isArray(MT.vendors) ? MT.vendors.length + (MT.vendors.length === 1 ? ' vendor' : ' vendors') : null]], actions
      });
      tools.innerHTML = `<label class="mt-search">${ico('search')}<input type="search" placeholder="${tab === 'vendor' && !vendorSlug ? 'Search vendors and products' : 'Search materials'}" value="${esc(F.q)}" aria-label="Search materials" data-mt-q></label><select data-mt-cat aria-label="Category"><option value="">All categories</option>${CATS.map(c => `<option value="${c[0]}" ${F.cat === c[0] ? 'selected' : ''}>${esc(c[1])}</option>`).join('')}</select>${pick && tab !== 'drawup' ? `<button type="button" class="db-btn db-btn--light db-btn--sm" data-mt-add="${tab}">${ico('upload')} ${tab === 'vendor' ? 'Upload a vendor product' : 'Add a material'}</button>` : ''}`;
      el.querySelectorAll('[data-mt-tab]').forEach(b => b.onclick = () => { tab = b.dataset.mtTab; vendorSlug = null; if (!pick) { store.set('drawup_mat_tab', tab); setHashView('materials', '&tab=' + tab); } draw(); });
      const q = tools.querySelector('[data-mt-q]'); q.oninput = () => { F.q = q.value.trim().toLowerCase(); paint(body); };
      tools.querySelector('[data-mt-cat]').onchange = e => { F.cat = e.target.value; paint(body); };
      el.querySelectorAll('[data-mt-add]').forEach(b => b.onclick = () => materialForm({ source: b.dataset.mtAdd, vendorSlug, onSaved: async (row, kind) => { if (kind === 'vendor') { await loadVendors(true); vendorSlug = row?._vslug || vendorSlug; } else await loadMine(true); draw(); } }));
      paint(body);
      if (tab === 'imported' && !MT.imported) { await loadMine(); if (el.isConnected) draw(); }
      if (tab === 'vendor' && !MT.vendors) { await loadVendors(); if (el.isConnected) draw(); }
    };
    const match = m => (!F.cat || m.category === F.cat) && (!F.q || [m.name, m.finish, m.color, m.sku, m._vendor, CAT_NAME[m.category], m.description].join(' ').toLowerCase().includes(F.q));
    const card = (m, kind, extra = '') => {
      const id = kind === 'drawup' ? 'du:' + m.key : m.id;
      const on = isPicked(id);
      const sz = sizeText(m);
      const canEdit = kind !== 'drawup' && (m.owner_id === MT.me || (kind === 'vendor' && (MT.vendors || []).find?.(v => v.id === m.vendor_id)?.owner_id === MT.me));
      return `<article class="mt-card mt-card--mat${on ? ' is-picked' : ''}" data-mt-mat="${esc(kind + '|' + id)}">
        <div class="mt-card__img" style="${kind === 'drawup' ? `background:${esc(m.swatch)}` : m._img ? `background-image:url('${esc(m._img)}')` : ''}">${kind !== 'drawup' && !m._img ? ico('image') : ''}${on ? `<span class="mt-picked">${ico('check')} Picked</span>` : ''}</div>
        <div class="mt-card__txt"><b>${esc(m.name)}</b><small>${esc(CAT_NAME[m.category] || 'Other')}${m.finish ? ' · ' + esc(m.finish) : ''}${m.color ? ' · ' + esc(m.color) : ''}</small>
          ${sz ? `<small class="mt-size">${ico('ruler')} ${esc(sz)}</small>` : ''}
          ${kind === 'vendor' && m.sizes_available?.length ? `<small class="mt-muted">Also: ${esc(m.sizes_available.join(', '))}</small>` : ''}
          ${kind === 'vendor' && (m.sku || extra) ? `<small class="mt-muted">${[m.sku ? 'SKU ' + esc(m.sku) : '', extra].filter(Boolean).join(' · ')}</small>` : ''}
          ${kind === 'vendor' && m.price_note ? `<small class="mt-muted">${esc(m.price_note)}</small>` : ''}</div>
        <div class="mt-card__acts">
          ${kind === 'vendor' && cleanUrl(m.product_url) ? `<a class="mt-iconbtn" href="${esc(cleanUrl(m.product_url))}" target="_blank" rel="noopener nofollow" title="Product page" aria-label="Product page for ${esc(m.name)}">${ico('ext')}</a>` : ''}
          ${canEdit && !pick ? `<button type="button" class="mt-iconbtn" data-a="edit" title="Edit" aria-label="Edit ${esc(m.name)}">${ico('edit')}</button><button type="button" class="mt-iconbtn" data-a="del" title="Delete" aria-label="Delete ${esc(m.name)}">${ico('trash')}</button>` : ''}
          <button type="button" class="mt-chipbtn${on ? ' is-on' : ''}" data-a="pick" aria-pressed="${on}">${on ? ico('check') + ' In Swap' : ico('swap') + ' Use in Swap'}</button>
        </div></article>`;
    };
    const paint = body => {
      if (tab === 'drawup') {
        const list = CATALOG.filter(match);
        body.innerHTML = list.length ? `<div class="mt-grid">${list.map(m => card(m, 'drawup')).join('')}</div><p class="mt-muted mt-foot">Sizes are typical for each material. For a specific product and its exact size, use the Vendor tab.</p>` : '<div class="mt-empty"><b>Nothing matches</b></div>';
      } else if (tab === 'imported') {
        if (!MT.imported) return;
        if (MT.imported === 'sql') { body.innerHTML = NEEDS_SQL; return; }
        const list = MT.imported.filter(match);
        body.innerHTML = list.length ? `<div class="mt-grid">${list.map(m => card(m, 'imported')).join('')}</div>` : MT.imported.length ? '<div class="mt-empty"><b>Nothing matches</b></div>'
          : `<div class="mt-empty"><b>Bring in your own materials</b><p>Upload a picture of a material, a sample board or a product you like. It stays private to you, and you can use it in Swap to get exactly that look.</p><button type="button" class="db-btn db-btn--primary db-btn--sm" data-mt-add2>${ico('upload')} Add a material</button></div>`;
        body.querySelector('[data-mt-add2]')?.addEventListener('click', () => el.querySelector('[data-mt-add]')?.click());
      } else {
        if (!MT.vendors) return;
        if (MT.vendors === 'sql') { body.innerHTML = NEEDS_SQL; return; }
        if (vendorSlug) return paintVendor(body);
        const counts = {}; MT.vendorProducts.forEach(p => { counts[p.vendor_id] = (counts[p.vendor_id] || 0) + 1; });
        const vs = MT.vendors.filter(v => (!F.q || [v.name, v.tagline, v.city, v.state, (v.categories || []).join(' ')].join(' ').toLowerCase().includes(F.q)) && (!F.cat || (v.categories || []).includes(F.cat) || MT.vendorProducts.some(p => p.vendor_id === v.id && p.category === F.cat)));
        const prods = (F.q || F.cat) ? MT.vendorProducts.filter(match) : [];
        if (!MT.vendors.length) { body.innerHTML = `<div class="mt-empty"><b>No vendor pages yet</b><p>Upload a vendor’s real product with its real sizes. DrawUp makes the vendor a page that everyone can browse, and Swap uses the real product and size in your renders.</p><button type="button" class="db-btn db-btn--primary db-btn--sm" data-mt-add2>${ico('upload')} Upload a vendor product</button></div>`; body.querySelector('[data-mt-add2]')?.addEventListener('click', () => el.querySelector('[data-mt-add]')?.click()); return; }
        body.innerHTML = `${vs.length ? `<div class="mt-vgrid">${vs.map(v => `<button type="button" class="mt-vcard" data-mt-vendor="${esc(v.slug)}"><i class="mt-vcard__logo" ${v.logo_path ? `style="background-image:url('${esc(pubUrl(v.logo_path))}')"` : ''}>${v.logo_path ? '' : esc(initials(v.name))}</i><span><b>${esc(v.name)}</b><small>${esc(v.tagline || [v.city, v.state].filter(Boolean).join(', ') || 'Vendor')}</small><em>${counts[v.id] || 0} product${counts[v.id] === 1 ? '' : 's'}</em></span></button>`).join('')}</div>` : '<p class="mt-muted">No vendors match.</p>'}
          ${prods.length ? `<h2 class="mt-h2">Products</h2><div class="mt-grid">${prods.map(m => card(m, 'vendor', `<button type="button" class="mt-inline" data-mt-vendor="${esc(m._vslug)}">${esc(m._vendor)}</button>`)).join('')}</div>` : ''}`;
      }
    };
    const paintVendor = body => {
      const v = MT.vendors.find(x => x.slug === vendorSlug);
      if (!v) { vendorSlug = null; return paint(body); }
      const prods = MT.vendorProducts.filter(p => p.vendor_id === v.id);
      const shown = prods.filter(match);
      const cats = [...new Set(prods.map(p => p.category))];
      const web = cleanUrl(v.website);
      const mine = v.owner_id === MT.me;
      body.innerHTML = `<button type="button" class="mt-back" data-mt-back>${ico('left')} All vendors</button>
        <section class="mt-vpage">
          <header class="mt-vhead"><i class="mt-vcard__logo mt-vcard__logo--l" ${v.logo_path ? `style="background-image:url('${esc(pubUrl(v.logo_path))}')"` : ''}>${v.logo_path ? '' : esc(initials(v.name))}</i>
            <div><h2>${esc(v.name)}</h2>${v.tagline ? `<p class="mt-vtag">${esc(v.tagline)}</p>` : ''}
              <div class="mt-vmeta">${[v.city || v.state ? `<span>${ico('pin')} ${esc([v.city, v.state].filter(Boolean).join(', '))}</span>` : '', web ? `<a href="${esc(web)}" target="_blank" rel="noopener nofollow">${ico('globe')} ${esc(new URL(web).hostname.replace(/^www\./, ''))}</a>` : '', v.contact_email ? `<a href="mailto:${esc(v.contact_email)}">${ico('mail')} ${esc(v.contact_email)}</a>` : '', v.contact_phone ? `<a href="tel:${esc(v.contact_phone.replace(/[^\d+]/g, ''))}">${ico('phone')} ${esc(v.contact_phone)}</a>` : '', v.contact_name ? `<span>Contact: ${esc(v.contact_name)}</span>` : ''].filter(Boolean).join('')}</div>
              ${cats.length ? `<div class="mt-vcats">${cats.map(c => `<button type="button" class="mt-catchip${F.cat === c ? ' is-on' : ''}" data-mt-vcat="${esc(c)}">${esc(CAT_NAME[c] || c)}</button>`).join('')}</div>` : ''}</div>
            <div class="mt-vhead__acts">${!pick ? `<button type="button" class="db-btn db-btn--primary db-btn--sm" data-mt-addto>${ico('plus')} Add a product</button>` : ''}${mine && !pick ? `<button type="button" class="db-btn db-btn--light db-btn--sm" data-mt-editv>${ico('edit')} Edit page</button>` : ''}</div>
          </header>
          ${v.about ? `<p class="mt-vabout">${esc(v.about)}</p>` : ''}
          <h2 class="mt-h2">Products <small>${prods.length}</small></h2>
          ${shown.length ? `<div class="mt-grid">${shown.map(m => card(m, 'vendor', '')).join('')}</div>` : `<div class="mt-empty"><b>${prods.length ? 'Nothing matches' : 'No products on this page yet'}</b></div>`}
        </section>`;
      body.querySelector('[data-mt-back]').onclick = () => { vendorSlug = null; F.cat = ''; if (!pick) setHashView('materials', '&tab=vendor'); draw(); };
      body.querySelectorAll('[data-mt-vcat]').forEach(b => b.onclick = () => { F.cat = F.cat === b.dataset.mtVcat ? '' : b.dataset.mtVcat; const s = el.querySelector('[data-mt-cat]'); if (s) s.value = F.cat; paint(body); });
      body.querySelector('[data-mt-addto]')?.addEventListener('click', () => materialForm({ source: 'vendor', vendorSlug: v.slug, onSaved: async () => { await loadVendors(true); draw(); } }));
      body.querySelector('[data-mt-editv]')?.addEventListener('click', () => vendorForm(v, async () => { await loadVendors(true); draw(); }));
    };
    el.onclick = async e => {
      const vb = e.target.closest('[data-mt-vendor]'); if (vb) { vendorSlug = vb.dataset.mtVendor; F.q = ''; F.cat = ''; if (!pick) setHashView('materials', '&tab=vendor&vendor=' + encodeURIComponent(vendorSlug)); draw(); el.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); return; }
      const b = e.target.closest('[data-a]'); const cardEl = b?.closest('[data-mt-mat]'); if (!b || !cardEl) return;
      const [kind, id] = cardEl.dataset.mtMat.split(/\|(.*)/s);
      const m = kind === 'drawup' ? catalogByKey[id.slice(3)] : (kind === 'imported' ? MT.imported : MT.vendorProducts).find(x => x.id === id);
      if (!m) return;
      if (b.dataset.a === 'pick') {
        const r = togglePick(pickFrom(m, kind)); if (r === null) return;
        paint(el.querySelector('#mt-body'));
        if (r && !pick) toast(`${m.name} is ready for Swap. Open Swap and say where to use it.`);
        return;
      }
      if (b.dataset.a === 'edit') return materialForm({ source: kind, row: m, onSaved: async () => { if (kind === 'vendor') await loadVendors(true); else await loadMine(true); draw(); } });
      if (b.dataset.a === 'del') {
        if (!confirm(`Delete “${m.name}”?`)) return;
        const r = await sb().from('user_materials').delete().eq('id', m.id);
        if (r.error) return toast(r.error.message, true);
        // Only remove pictures that were uploaded for this material, never an upload it was made from (Swap, Draw, CheckUp...).
        if (m.owner_id === MT.me && /^[^/]+\/(materials|products)\//.test(m.image_path)) sb().storage.from(kind === 'vendor' ? PUB : PRIV).remove([m.image_path]).catch(() => {});
        picks = picks.filter(p => p.id !== m.id); savePicks();
        if (kind === 'vendor') await loadVendors(true); else await loadMine(true);
        draw(); toast('Deleted.');
      }
    };
    if (tab === 'vendor' && vendorSlug && !MT.vendors) await loadVendors();
    draw();
    if (!pick && !MT.imported) loadMine().then(() => { if (el.isConnected && tab !== 'imported') { const t = el.querySelector('[data-mt-tab="imported"]'); if (t && Array.isArray(MT.imported)) t.innerHTML = `Imported<small>${MT.imported.length}</small>`; } });
  }

  /* ------------------------------------------------------------------ forms */
  function formModal(title, kicker, html, onSubmit, submitLabel = 'Save') {
    $('.mt-modal--form')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="mt-modal mt-modal--form" role="dialog" aria-modal="true" aria-labelledby="mt-form-h"><form class="mt-modal__card mt-form" novalidate><button type="button" class="mt-modal__x" aria-label="Close">${ico('close')}</button><span class="mt-kicker">${esc(kicker)}</span><h2 id="mt-form-h">${esc(title)}</h2>${html}<p class="mt-err" role="alert" hidden></p><div class="mt-modal__foot"><button type="button" class="db-btn db-btn--light db-btn--sm" data-x>Cancel</button><button type="submit" class="db-btn db-btn--primary db-btn--sm">${esc(submitLabel)}</button></div></form></div>`);
    const m = $('.mt-modal--form'), f = m.querySelector('form'), err = m.querySelector('.mt-err'), btn = f.querySelector('[type=submit]');
    const close = () => { m.remove(); document.removeEventListener('keydown', key); };
    function key(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    document.addEventListener('keydown', key);
    m.querySelector('.mt-modal__x').onclick = close; m.querySelector('[data-x]').onclick = close;
    f.onsubmit = async e => {
      e.preventDefault(); err.hidden = true; btn.disabled = true; const t = btn.textContent; btn.textContent = 'Saving…';
      try { await onSubmit(f, close); } catch (x) { err.textContent = x.message || String(x); err.hidden = false; err.scrollIntoView({ block: 'nearest' }); }
      finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = t; } }
    };
    setTimeout(() => f.querySelector('input:not([type=hidden]),select,textarea')?.focus(), 30);
    return m;
  }
  const val = (f, n) => (f.elements[n]?.value || '').trim();
  const numVal = (f, n) => { const v = parseFloat(val(f, n)); return Number.isFinite(v) && v > 0 ? v : null; };
  const listVal = (f, n) => val(f, n).split(/[\n,;]+/).map(s => s.trim()).filter(Boolean).slice(0, 30);
  const catSelect = (name, v) => `<select name="${name}" required>${CATS.map(c => `<option value="${c[0]}" ${v === c[0] ? 'selected' : ''}>${esc(c[1])}</option>`).join('')}</select>`;
  function photoField(label, current) {
    return `<div class="mt-photo"><div class="mt-photo__prev" ${current ? `style="background-image:url('${esc(current)}')"` : ''}>${current ? '' : ico('image')}</div><label class="db-btn db-btn--light db-btn--sm">${ico('upload')} ${current ? 'Change picture' : esc(label)}<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" hidden></label><small>JPG, PNG or WebP. A straight-on, well lit picture of the surface works best in Swap.</small></div>`;
  }
  function bindPhoto(m) {
    const inp = m.querySelector('input[name=photo]'); if (!inp) return;
    inp.onchange = () => { const f = inp.files?.[0]; const p = m.querySelector('.mt-photo__prev'); if (f && p) { p.innerHTML = ''; p.style.backgroundImage = `url('${URL.createObjectURL(f)}')`; } };
  }
  const sizeFields = r => `<fieldset class="mt-fs"><legend>${ico('ruler')} Actual size of one piece <small>(optional, makes renders and elevations true to size)</small></legend><div class="mt-row4"><label>Width<input name="w" inputmode="decimal" value="${esc(num(r?.width))}" placeholder="24"></label><label>Length<input name="l" inputmode="decimal" value="${esc(num(r?.length))}" placeholder="48"></label><label>Thickness<input name="t" inputmode="decimal" value="${esc(num(r?.thickness))}" placeholder="0.375"></label><label>Unit<select name="unit">${UNITS.map(u => `<option ${((r?.unit) || 'in') === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label></div></fieldset>`;

  async function materialForm({ source, row, fromPath, fromUrl, name, vendorSlug, onSaved }) {
    const me = await uid(); if (!me) { $('#drawup-signin')?.click(); return; }
    const isVendor = source === 'vendor';
    if (isVendor) { await loadVendors(); if (MT.vendors === 'sql') return toast('Run the v33 database update (0080_library_materials.sql) first.', true); }
    const cur = row ? (row._img || '') : (fromUrl || '');
    const preV = row ? MT.vendors?.find?.(v => v.id === row.vendor_id) : vendorSlug ? MT.vendors?.find?.(v => v.slug === vendorSlug) : null;
    if (isVendor && MT.myListing === undefined) { const l = await Promise.resolve(sb().from('vendor_listings').select('id,company_name,tagline,about,website,contact_email,home_city,home_state').eq('owner_id', me).maybeSingle()).catch(() => ({ data: null })); MT.myListing = l?.data || null; }
    const vendorBlock = !isVendor || row ? (row && preV ? `<p class="mt-note">${ico('store')} On <b>${esc(preV.name)}</b>’s vendor page.</p>` : '') : `<fieldset class="mt-fs"><legend>${ico('store')} Who is the vendor?</legend>
      <label>Vendor or manufacturer name<input name="vendor" list="mt-vlist" required maxlength="120" autocomplete="off" placeholder="Start typing, for example Daltile" value="${esc(preV?.name || '')}"></label>
      <datalist id="mt-vlist">${(MT.vendors || []).map(v => `<option value="${esc(v.name)}">`).join('')}</datalist>
      <p class="mt-note" data-vstate></p>
      <div class="mt-newv" data-newv hidden>
        ${MT.myListing ? `<button type="button" class="mt-linkbtn" data-fill-listing>${ico('plus')} Fill in from my Connect vendor listing (${esc(MT.myListing.company_name)})</button>` : ''}
        <div class="mt-row2"><label>Contact name<input name="v_contact" maxlength="120"></label><label>Contact email<input name="v_email" type="email" maxlength="200"></label></div>
        <div class="mt-row2"><label>Phone<input name="v_phone" type="tel" maxlength="40"></label><label>Website<input name="v_web" maxlength="300" placeholder="example.com"></label></div>
        <div class="mt-row2"><label>City<input name="v_city" maxlength="80"></label><label>State<input name="v_state" maxlength="40"></label></div>
        <label>One line about them<input name="v_tagline" maxlength="160" placeholder="Porcelain and natural stone tile"></label>
        <label>About<textarea name="v_about" rows="3" maxlength="4000" placeholder="What they make or sell, where they ship, lead times…"></textarea></label>
        <label class="mt-file">Logo (optional)<input type="file" name="v_logo" accept="image/jpeg,image/png,image/webp"></label>
      </div></fieldset>`;
    const html = `${vendorBlock}
      <fieldset class="mt-fs"><legend>${ico('layers')} ${isVendor ? 'The product' : 'The material'}</legend>
      ${photoField('Add a picture', cur)}
      <div class="mt-row2"><label>Name<input name="name" required maxlength="120" value="${esc(row?.name || name || '')}" placeholder="${isVendor ? 'Product name' : 'For example: Smoked oak, wide plank'}"></label><label>Category${catSelect('category', row?.category || 'flooring')}</label></div>
      <div class="mt-row2"><label>Colour<input name="color" maxlength="120" value="${esc(row?.color || '')}" placeholder="Warm grey"></label><label>Finish<input name="finish" maxlength="120" value="${esc(row?.finish || '')}" placeholder="Matte"></label></div>
      ${isVendor ? `<div class="mt-row2"><label>SKU or model<input name="sku" maxlength="80" value="${esc(row?.sku || '')}"></label><label>Product page<input name="url" maxlength="400" value="${esc(row?.product_url || '')}" placeholder="vendor.com/product"></label></div>` : ''}
      </fieldset>
      ${sizeFields(row)}
      ${isVendor ? `<label>Other sizes offered <small>(comma separated)</small><input name="sizes" maxlength="600" value="${esc((row?.sizes_available || []).join(', '))}" placeholder="12 × 24 in, 24 × 24 in, 48 × 48 in"></label><label>Price or availability note<input name="price" maxlength="120" value="${esc(row?.price_note || '')}" placeholder="About $6 per sq ft, in stock"></label>` : ''}
      <label>Notes<textarea name="desc" rows="2" maxlength="2000" placeholder="${isVendor ? 'Install pattern, joint width, where it is rated for…' : 'Where you want to use it, grout colour, pattern…'}">${esc(row?.description || '')}</textarea></label>`;
    const m = formModal(row ? 'Edit ' + (isVendor ? 'product' : 'material') : isVendor ? 'Upload a vendor product' : 'Add your own material', isVendor ? 'Vendor' : 'Imported', html, async (f, close) => {
      const c = sb();
      const n = val(f, 'name'); if (!n) throw new Error('Give it a name.');
      const file = f.elements.photo?.files?.[0];
      if (!row && !file && !fromPath) throw new Error('Add a picture.');
      // vendor: existing page or a new one
      let vendor = preV && row ? preV : null;
      if (isVendor && !row) {
        const vn = val(f, 'vendor'); if (vn.length < 2) throw new Error('Say who the vendor is.');
        vendor = MT.vendors.find(v => v.name.trim().toLowerCase() === vn.toLowerCase()) || null;
        if (!vendor) {
          const email = val(f, 'v_email'), phone = val(f, 'v_phone'), web = cleanUrl(val(f, 'v_web'));
          if (!email && !phone && !web) throw new Error('Add at least one way to reach the vendor: email, phone or website.');
          if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('That contact email does not look right.');
          let logo_path = null; const lf = f.elements.v_logo?.files?.[0];
          if (lf) { const b = await normalize(lf, 600); logo_path = `${me}/logos/${uuid()}.jpg`; const u = await c.storage.from(PUB).upload(logo_path, b, { contentType: 'image/jpeg' }); if (u.error) throw u.error; }
          const fields = { owner_id: me, name: vn, contact_name: val(f, 'v_contact') || null, contact_email: email || null, contact_phone: phone || null, website: web || null, city: val(f, 'v_city') || null, state: val(f, 'v_state') || null, tagline: val(f, 'v_tagline') || null, about: val(f, 'v_about') || null, logo_path, categories: [val(f, 'category')], listing_id: f.dataset.listing || null };
          let ins = null;
          for (let i = 0; i < 4 && !ins; i++) {
            const slug = slugify(vn) + (i ? '-' + Math.random().toString(36).slice(2, 6) : '');
            const r = await c.from('material_vendors').insert({ ...fields, slug }).select('*').single();
            if (!r.error) ins = r.data;
            else if (!/duplicate key|23505/.test(r.error.message + r.error.code)) throw r.error;
            else if (/name_key/.test(r.error.message)) { await loadVendors(true); vendor = MT.vendors.find(v => v.name.trim().toLowerCase() === vn.toLowerCase()); if (vendor) break; }
          }
          if (!vendor) { if (!ins) throw new Error('Could not make the vendor page. Try again.'); vendor = ins; }
        } else if (!(vendor.categories || []).includes(val(f, 'category')) && vendor.owner_id === me) {
          await c.from('material_vendors').update({ categories: [...(vendor.categories || []), val(f, 'category')] }).eq('id', vendor.id);
        }
      }
      let image_path = row?.image_path || null;
      if (file) {
        const b = await normalize(file);
        image_path = isVendor ? `${me}/products/${uuid()}.jpg` : `${me}/materials/${uuid()}.jpg`;
        const u = await c.storage.from(isVendor ? PUB : PRIV).upload(image_path, b, { contentType: 'image/jpeg' }); if (u.error) throw u.error;
      } else if (!row && fromPath) {
        if (isVendor) { const d = await c.storage.from(PRIV).download(fromPath); if (d.error) throw d.error; image_path = `${me}/products/${uuid()}.jpg`; const u = await c.storage.from(PUB).upload(image_path, await normalize(new File([d.data], 'x.jpg', { type: d.data.type || 'image/jpeg' })), { contentType: 'image/jpeg' }); if (u.error) throw u.error; }
        else image_path = fromPath;
      }
      const rec = {
        name: n, category: val(f, 'category'), color: val(f, 'color') || null, finish: val(f, 'finish') || null, description: val(f, 'desc') || null,
        width: numVal(f, 'w'), length: numVal(f, 'l'), thickness: numVal(f, 't'), unit: val(f, 'unit') || 'in', image_path
      };
      if (isVendor) Object.assign(rec, { sku: val(f, 'sku') || null, product_url: cleanUrl(val(f, 'url')) || null, sizes_available: listVal(f, 'sizes'), price_note: val(f, 'price') || null });
      const r = row ? await c.from('user_materials').update(rec).eq('id', row.id).select('*').single()
        : await c.from('user_materials').insert({ ...rec, owner_id: me, source: isVendor ? 'vendor' : 'imported', vendor_id: isVendor ? vendor.id : null }).select('*').single();
      if (r.error) throw r.error;
      if (row && file && row.image_path !== image_path && row.owner_id === me && /^[^/]+\/(materials|products)\//.test(row.image_path)) c.storage.from(isVendor ? PUB : PRIV).remove([row.image_path]).catch(() => {});
      close();
      toast(row ? 'Saved.' : isVendor ? `Added to ${vendor.name}’s vendor page.` : 'Added to your materials.');
      if (onSaved) await onSaved({ ...r.data, _vslug: vendor?.slug }, isVendor ? 'vendor' : 'imported');
      else if (!row) openMaterials(isVendor ? { tab: 'vendor', vendor: vendor.slug } : { tab: 'imported' });
    }, row ? 'Save' : isVendor ? 'Upload product' : 'Add material');
    bindPhoto(m);
    const vin = m.querySelector('input[name=vendor]');
    if (vin) {
      const st = m.querySelector('[data-vstate]'), nv = m.querySelector('[data-newv]');
      const upd = () => { const v = vin.value.trim(); const hit = (MT.vendors || []).find(x => x.name.trim().toLowerCase() === v.toLowerCase()); nv.hidden = !!hit || v.length < 2; st.innerHTML = v.length < 2 ? 'Pick a vendor that already has a page, or type a new name to make them one.' : hit ? `${ico('check')} Adds to <b>${esc(hit.name)}</b>’s existing vendor page.` : `${ico('plus')} New vendor page for <b>${esc(v)}</b>. Add how to reach them:`; };
      vin.addEventListener('input', upd); upd();
      m.querySelector('[data-fill-listing]')?.addEventListener('click', () => {
        const l = MT.myListing, f = m.querySelector('form'); if (!l) return;
        if (!vin.value.trim()) { vin.value = l.company_name; upd(); }
        f.elements.v_email.value ||= l.contact_email || ''; f.elements.v_web.value ||= l.website || ''; f.elements.v_city.value ||= l.home_city || ''; f.elements.v_state.value ||= l.home_state || ''; f.elements.v_tagline.value ||= l.tagline || ''; f.elements.v_about.value ||= l.about || '';
        if (vin.value.trim().toLowerCase() === String(l.company_name).trim().toLowerCase()) f.dataset.listing = l.id;
      });
    }
  }

  function vendorForm(v, onSaved) {
    const html = `<label>Vendor name<input name="name" required maxlength="120" value="${esc(v.name)}"></label>
      <label>One line about them<input name="tagline" maxlength="160" value="${esc(v.tagline || '')}"></label>
      <div class="mt-row2"><label>Contact name<input name="contact" maxlength="120" value="${esc(v.contact_name || '')}"></label><label>Contact email<input name="email" type="email" maxlength="200" value="${esc(v.contact_email || '')}"></label></div>
      <div class="mt-row2"><label>Phone<input name="phone" maxlength="40" value="${esc(v.contact_phone || '')}"></label><label>Website<input name="web" maxlength="300" value="${esc(v.website || '')}"></label></div>
      <div class="mt-row2"><label>City<input name="city" maxlength="80" value="${esc(v.city || '')}"></label><label>State<input name="state" maxlength="40" value="${esc(v.state || '')}"></label></div>
      <label>About<textarea name="about" rows="4" maxlength="4000">${esc(v.about || '')}</textarea></label>
      <label class="mt-file">New logo (optional)<input type="file" name="logo" accept="image/jpeg,image/png,image/webp"></label>
      <label class="mt-check"><input type="checkbox" name="pub" ${v.is_published ? 'checked' : ''}> Show this page to everyone on DrawUp</label>`;
    formModal('Edit vendor page', 'Vendor', html, async (f, close) => {
      const c = sb(), me = await uid();
      const email = val(f, 'email'), phone = val(f, 'phone'), web = cleanUrl(val(f, 'web'));
      if (val(f, 'name').length < 2) throw new Error('Give the vendor a name.');
      if (!email && !phone && !web) throw new Error('Keep at least one way to reach the vendor.');
      const rec = { name: val(f, 'name'), tagline: val(f, 'tagline') || null, contact_name: val(f, 'contact') || null, contact_email: email || null, contact_phone: phone || null, website: web || null, city: val(f, 'city') || null, state: val(f, 'state') || null, about: val(f, 'about') || null, is_published: f.elements.pub.checked };
      const lf = f.elements.logo?.files?.[0];
      if (lf) { const b = await normalize(lf, 600); rec.logo_path = `${me}/logos/${uuid()}.jpg`; const u = await c.storage.from(PUB).upload(rec.logo_path, b, { contentType: 'image/jpeg' }); if (u.error) throw u.error; }
      const r = await c.from('material_vendors').update(rec).eq('id', v.id);
      if (r.error) throw new Error(/name_key|duplicate/.test(r.error.message) ? 'Another vendor page already has that name.' : r.error.message);
      close(); toast('Vendor page saved.'); await onSaved?.();
    });
  }

  /* ------------------------------------------------------------------ open from anywhere (falls back to the dashboard) */
  function openMaterials(opts = {}) {
    const main = $('#db-dash .db-main');
    if (main && window.DrawUpDreamBeyond?.openView) return window.DrawUpDreamBeyond.openView('materials', opts);
    if (main) return renderMaterials(main, opts);
    go({ tab: 'dashboard', hash: '#portal/dashboard?view=materials' + (opts.tab ? '&tab=' + opts.tab : '') + (opts.vendor ? '&vendor=' + encodeURIComponent(opts.vendor) : '') });
  }

  window.DrawUpMaterials = { renderLibrary, renderMaterials, openPicker, openMaterials, mountSwap, forSwap, clearSwap, get picks() { return picks.slice(); }, CATALOG, version: V };
  // If Swap is already on screen (this file loaded late), add the Materials row now.
  (async () => { for (let i = 0; i < 60; i++) { const comp = $('#sw20-compose'); if (comp) { if (!comp.querySelector('#mt-swapbar')) { const form = comp.querySelector('#sw20-form'); form?.insertAdjacentHTML('beforebegin', '<div class="mt-swapbar" id="mt-swapbar"></div>'); paintSwapBar(); } return; } await sleep(250); } })();
})();
